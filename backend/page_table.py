"""
page_table.py — OS-style Page Table for oceanStream v2
=======================================================

Every distinct (lat_bucket, lon_bucket, depth_bucket, time_bucket) tuple is a
"page." The PageTable tracks which pages exist in which storage tier and handles:

  - Range diffing   : split any requested range into resident + missing portions
  - LRU eviction    : evict least-recently-used ON_DISK pages when cap is hit
                      (pinned pages are NEVER evicted)
  - Prefetch hints  : detect scrub direction and suggest next bucket to warm up
  - Pinning         : pre-warmed home-region pages are pinned and protected from
                      LRU eviction so casual exploration elsewhere never evicts them

Page state machine:
    NOT_FETCHED → FETCHING → ON_DISK → RESIDENT
                                ↑
                         (can demote to ON_DISK on eviction)
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Sequence, Tuple


# ---------------------------------------------------------------------------
# Configuration / Bucket Definitions
# ---------------------------------------------------------------------------

# Depth bucketing: 50-metre bins (matches oceanographic layers, scales to 6000m)
DEPTH_BIN_M: float = 50.0

# Lat / lon bucket sizes match zarr chunk layout from data_fetch.py (50×50 grid pts)
# At 0.083° resolution, 50 pts ≈ 4.15°
LAT_BIN_DEG: float = 4.0
LON_BIN_DEG: float = 4.0


# ---------------------------------------------------------------------------
# PageState
# ---------------------------------------------------------------------------

class PageState(str, Enum):
    RESIDENT    = "RESIDENT"     # in L1 RAM slice_cache — sub-millisecond
    ON_DISK     = "ON_DISK"      # in .zarr store, not yet in L1 — 5-25 ms
    FETCHING    = "FETCHING"     # actively streaming from origin API right now
    NOT_FETCHED = "NOT_FETCHED"  # doesn't exist anywhere locally
    FAILED      = "FAILED"       # fetch attempted and failed — will retry on next request
    PARTIAL     = "PARTIAL"      # chunk partially written — available but incomplete


# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------

@dataclass
class Page:
    lat_bucket:   int           # index = floor(lat / LAT_BIN_DEG)
    lon_bucket:   int           # index = floor(lon / LON_BIN_DEG)
    depth_bucket: int           # index = floor(depth / DEPTH_BIN_M)
    time_bucket:  str           # ISO date string (day granularity)
    state:        PageState = PageState.NOT_FETCHED
    last_access:  float         = field(default_factory=time.time)
    size_bytes:   int           = 0        # filled in when page is written to disk
    pinned:       bool          = False    # if True, never evict via LRU

    @property
    def page_id(self) -> str:
        return f"{self.lat_bucket}:{self.lon_bucket}:{self.depth_bucket}:{self.time_bucket}"

    @property
    def depth_min(self) -> float:
        return self.depth_bucket * DEPTH_BIN_M

    @property
    def depth_max(self) -> float:
        return (self.depth_bucket + 1) * DEPTH_BIN_M

    @property
    def lat_min(self) -> float:
        return self.lat_bucket * LAT_BIN_DEG

    @property
    def lat_max(self) -> float:
        return (self.lat_bucket + 1) * LAT_BIN_DEG

    @property
    def lon_min(self) -> float:
        return self.lon_bucket * LON_BIN_DEG

    @property
    def lon_max(self) -> float:
        return (self.lon_bucket + 1) * LON_BIN_DEG


# ---------------------------------------------------------------------------
# Bucket helpers
# ---------------------------------------------------------------------------

def depth_bucket(depth_m: float) -> int:
    return max(0, int(math.floor(depth_m / DEPTH_BIN_M)))

def lat_bucket(lat: float) -> int:
    return int(math.floor(lat / LAT_BIN_DEG))

def lon_bucket(lon: float) -> int:
    return int(math.floor(lon / LON_BIN_DEG))

def depth_buckets_in_range(depth_min: float, depth_max: float) -> List[int]:
    """Return all depth bucket indices that overlap [depth_min, depth_max)."""
    start = depth_bucket(depth_min)
    # end bucket is floor((depth_max - epsilon) / BIN) to avoid overshooting
    end = max(start, depth_bucket(max(depth_min, depth_max - 1e-6)))
    return list(range(start, end + 1))

def lat_buckets_in_range(lat_min: float, lat_max: float) -> List[int]:
    start = lat_bucket(lat_min)
    end   = lat_bucket(max(lat_min, lat_max - 1e-6))
    return list(range(start, end + 1))

def lon_buckets_in_range(lon_min: float, lon_max: float) -> List[int]:
    start = lon_bucket(lon_min)
    end   = lon_bucket(max(lon_min, lon_max - 1e-6))
    return list(range(start, end + 1))


# ---------------------------------------------------------------------------
# PageTable
# ---------------------------------------------------------------------------

class PageTable:
    """
    Thread-safe page table for oceanStream.

    Key operations
    --------------
    diff(...)           → split requested range into (served, missing) page lists
    mark_fetching(ids)  → transition pages NOT_FETCHED → FETCHING
    mark_on_disk(id, bytes) → FETCHING → ON_DISK, update size, check eviction
    promote(id)         → ON_DISK → RESIDENT
    evict_lru(target)   → evict least-recently-used ON_DISK pages to free bytes
                          (pinned pages are NEVER evicted)
    pin(id)             → mark page as pinned; protects from LRU eviction
    unpin(id)           → remove pin from page
    register_pinned(...)→ register a page as already RESIDENT and pinned
    prefetch_hint(...)  → return next bucket ID to warm ahead of user movement
    serialise()         → JSON-serialisable snapshot (for /ocean/coverage)
    """

    def __init__(self, cap_bytes: int = 2 * 1024 ** 3):
        self._pages: Dict[str, Page] = {}
        self._lock  = threading.Lock()
        self.cap_bytes  = cap_bytes
        self._disk_bytes = 0        # running total of ON_DISK bytes

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _get_or_create(self, lat_b: int, lon_b: int, depth_b: int, time_b: str) -> Page:
        """Return existing page or create a NOT_FETCHED placeholder."""
        pid = f"{lat_b}:{lon_b}:{depth_b}:{time_b}"
        if pid not in self._pages:
            self._pages[pid] = Page(lat_b, lon_b, depth_b, time_b)
        return self._pages[pid]

    # ------------------------------------------------------------------
    # Range diffing — the core mechanism
    # ------------------------------------------------------------------

    def diff(
        self,
        lat_min: float, lat_max: float,
        lon_min: float, lon_max: float,
        depth_min: float, depth_max: float,
        time_str: str,
    ) -> Tuple[List[Page], List[Page]]:
        """
        Split the requested 4D region into:
          served  — pages already RESIDENT or ON_DISK (serve immediately)
          missing — pages that are NOT_FETCHED (need origin fetch)

        FETCHING pages are counted as 'missing' from the client's perspective
        but are NOT re-fetched; the caller should subscribe to their resolution.

        Returns (served_pages, missing_pages).
        """
        lat_bs   = lat_buckets_in_range(lat_min, lat_max)
        lon_bs   = lon_buckets_in_range(lon_min, lon_max)
        depth_bs = depth_buckets_in_range(depth_min, depth_max)

        served:  List[Page] = []
        missing: List[Page] = []

        with self._lock:
            for lb in lat_bs:
                for ln in lon_bs:
                    for db in depth_bs:
                        page = self._get_or_create(lb, ln, db, time_str)
                        page.last_access = time.time()
                        if page.state in (PageState.RESIDENT, PageState.ON_DISK, PageState.PARTIAL):
                            served.append(page)
                        else:
                            # NOT_FETCHED, FETCHING (dedupe — caller checks), FAILED (retry)
                            missing.append(page)

        return served, missing

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------

    def mark_fetching(self, pages: Sequence[Page]) -> None:
        """Transition NOT_FETCHED or FAILED pages → FETCHING."""
        with self._lock:
            for p in pages:
                if p.state in (PageState.NOT_FETCHED, PageState.FAILED):
                    p.state = PageState.FETCHING

    def mark_on_disk(self, page_id: str, size_bytes: int = 0) -> None:
        with self._lock:
            if page_id in self._pages:
                page = self._pages[page_id]
                old_size = page.size_bytes if page.state == PageState.ON_DISK else 0
                page.state = PageState.ON_DISK
                page.size_bytes = size_bytes
                page.last_access = time.time()
                self._disk_bytes += size_bytes - old_size

    def promote(self, page_id: str) -> None:
        """Promote ON_DISK → RESIDENT (page is now in L1 RAM)."""
        with self._lock:
            if page_id in self._pages:
                self._pages[page_id].state = PageState.RESIDENT
                self._pages[page_id].last_access = time.time()

    def demote(self, page_id: str) -> None:
        """Demote RESIDENT → ON_DISK (e.g. L1 cache pressure)."""
        with self._lock:
            if page_id in self._pages and self._pages[page_id].state == PageState.RESIDENT:
                self._pages[page_id].state = PageState.ON_DISK

    def mark_failed(self, pages: Sequence[Page]) -> None:
        """
        Transition FETCHING → FAILED for pages whose origin fetch failed.
        FAILED pages are treated as missing (retry-eligible) by diff().
        """
        with self._lock:
            for p in pages:
                if p.state == PageState.FETCHING:
                    p.state = PageState.FAILED

    def mark_partial(self, pages: Sequence[Page]) -> None:
        """
        Transition FETCHING → PARTIAL for pages where only a chunk has been written.
        PARTIAL pages appear in 'served' so existing data is visible immediately.
        """
        with self._lock:
            for p in pages:
                if p.state == PageState.FETCHING:
                    p.state = PageState.PARTIAL

    def touch(self, page_id: str) -> None:
        """Update last_access timestamp (called on every read)."""
        with self._lock:
            if page_id in self._pages:
                self._pages[page_id].last_access = time.time()

    # ------------------------------------------------------------------
    # Pinning — protect pre-warmed home-region pages from LRU eviction
    # ------------------------------------------------------------------

    def pin(self, page_id: str) -> None:
        """Pin a page so it is never evicted by LRU."""
        with self._lock:
            if page_id in self._pages:
                self._pages[page_id].pinned = True

    def unpin(self, page_id: str) -> None:
        """Remove pin from a page (makes it eligible for LRU eviction)."""
        with self._lock:
            if page_id in self._pages:
                self._pages[page_id].pinned = False

    def register_pinned(
        self,
        lat_b: int, lon_b: int, depth_b: int, time_b: str,
        size_bytes: int = 0,
    ) -> str:
        """
        Register a page as RESIDENT and pinned — used during startup pre-warm
        so the page table correctly reflects synthetic data in L1 RAM.
        Returns the page_id.
        """
        with self._lock:
            p = self._get_or_create(lat_b, lon_b, depth_b, time_b)
            p.state = PageState.RESIDENT
            p.pinned = True
            p.size_bytes = size_bytes
            p.last_access = time.time()
        return p.page_id

    # ------------------------------------------------------------------
    # Bulk-register ON_DISK pages (called at startup when zarr exists)
    # ------------------------------------------------------------------

    def register_on_disk(
        self,
        lat_b: int, lon_b: int, depth_b: int, time_b: str,
        size_bytes: int = 0,
    ) -> None:
        with self._lock:
            p = self._get_or_create(lat_b, lon_b, depth_b, time_b)
            p.state = PageState.ON_DISK
            p.size_bytes = size_bytes
            self._disk_bytes += size_bytes

    # ------------------------------------------------------------------
    # LRU Eviction — SKIPS pinned pages
    # ------------------------------------------------------------------

    def needs_eviction(self) -> bool:
        return self._disk_bytes > self.cap_bytes

    def evict_lru(self, target_free_bytes: Optional[int] = None) -> List[str]:
        """
        Evict least-recently-accessed ON_DISK pages until we're under cap
        (or until target_free_bytes have been freed).

        PINNED pages are NEVER evicted — they are skipped entirely.

        Returns list of evicted page IDs so the caller can delete zarr chunks.
        """
        if target_free_bytes is None:
            target_free_bytes = self._disk_bytes - self.cap_bytes
        if target_free_bytes <= 0:
            return []

        evicted: List[str] = []
        freed = 0

        with self._lock:
            # Sort ON_DISK, non-pinned pages by last_access ascending (oldest first)
            candidates = sorted(
                [
                    p for p in self._pages.values()
                    if p.state == PageState.ON_DISK and not p.pinned
                ],
                key=lambda p: p.last_access,
            )
            for page in candidates:
                if freed >= target_free_bytes:
                    break
                freed += page.size_bytes
                self._disk_bytes -= page.size_bytes
                page.state = PageState.NOT_FETCHED
                page.size_bytes = 0
                evicted.append(page.page_id)

        return evicted

    # ------------------------------------------------------------------
    # Prefetch hint — readahead along movement direction
    # ------------------------------------------------------------------

    def prefetch_hint(
        self,
        axis: str,          # "depth" | "lat" | "lon" | "time"
        direction: int,     # +1 (increasing) or -1 (decreasing)
        current_bucket: int,
        time_str: str,
        lat_b: int = 0,
        lon_b: int = 0,
        depth_b: int = 0,
    ) -> Optional[str]:
        """
        Return the page_id of the next bucket ahead of the user's movement,
        if it is NOT_FETCHED (worth prefetching). Returns None if already warm.
        """
        next_b = current_bucket + direction
        if next_b < 0:
            return None

        with self._lock:
            if axis == "depth":
                p = self._get_or_create(lat_b, lon_b, next_b, time_str)
            elif axis == "lat":
                p = self._get_or_create(next_b, lon_b, depth_b, time_str)
            elif axis == "lon":
                p = self._get_or_create(lat_b, next_b, depth_b, time_str)
            else:
                return None  # time axis prefetch not yet implemented

            if p.state == PageState.NOT_FETCHED:
                return p.page_id
        return None

    # ------------------------------------------------------------------
    # 3D Nearest Slice Finder — locate closest available depth / spatial slice
    # ------------------------------------------------------------------

    def find_nearest_slice(
        self,
        lat: float,
        lon: float,
        depth_m: float,
        time_str: Optional[str] = None,
    ) -> Optional[Tuple[Page, float]]:
        """
        Locate the nearest page that is currently RESIDENT or ON_DISK.
        First prioritises depth proximity (e.g. 0-2m -> 3-4m or 0m is nearest),
        then horizontal spatial proximity.
        Returns (page, depth_distance_m) or None if no pages are stored.
        """
        lat_b = lat_bucket(lat)
        lon_b = lon_bucket(lon)
        target_db = depth_bucket(depth_m)

        with self._lock:
            # Candidates that are actually in RAM or on disk
            candidates = [
                p for p in self._pages.values()
                if p.state in (PageState.RESIDENT, PageState.ON_DISK)
                and (time_str is None or p.time_bucket == time_str)
            ]
            if not candidates:
                # If no matching date, search all dates
                candidates = [
                    p for p in self._pages.values()
                    if p.state in (PageState.RESIDENT, PageState.ON_DISK)
                ]
            if not candidates:
                return None

            # Sort by: 1) depth distance, 2) horizontal distance in buckets
            def score(p: Page):
                depth_dist = abs(p.depth_bucket - target_db) * DEPTH_BIN_M
                spatial_dist = math.hypot(p.lat_bucket - lat_b, p.lon_bucket - lon_b)
                return (depth_dist, spatial_dist)

            best = min(candidates, key=score)
            depth_dist_m = abs((best.depth_bucket * DEPTH_BIN_M) - depth_m)
            return best, depth_dist_m

    def get_page_state(self, lat_b: int, lon_b: int, depth_b: int, time_b: str) -> PageState:
        """Safely read page state without creating placeholders."""
        pid = f"{lat_b}:{lon_b}:{depth_b}:{time_b}"
        with self._lock:
            p = self._pages.get(pid)
            return p.state if p else PageState.NOT_FETCHED

    # ------------------------------------------------------------------
    # Explicit Data Deletion & Store Pruning
    # ------------------------------------------------------------------

    def delete_page(self, page_id: str) -> bool:
        """Explicitly remove a page from the table and adjust disk bytes."""
        with self._lock:
            p = self._pages.pop(page_id, None)
            if p:
                if p.state == PageState.ON_DISK:
                    self._disk_bytes = max(0, self._disk_bytes - p.size_bytes)
                return True
        return False

    def clear_non_pinned(self) -> int:
        """Clear all non-pinned pages from the page table. Returns count freed."""
        removed = 0
        with self._lock:
            to_remove = [pid for pid, p in self._pages.items() if not p.pinned]
            for pid in to_remove:
                p = self._pages.pop(pid)
                if p.state == PageState.ON_DISK:
                    self._disk_bytes = max(0, self._disk_bytes - p.size_bytes)
                removed += 1
        return removed


    # ------------------------------------------------------------------
    # Serialisation (for /ocean/coverage)
    # ------------------------------------------------------------------

    def serialise(
        self,
        lat_min: Optional[float] = None,
        lat_max: Optional[float] = None,
        lon_min: Optional[float] = None,
        lon_max: Optional[float] = None,
    ) -> List[Dict]:
        """
        Return a JSON-serialisable list of page states, optionally filtered
        to a bounding box.
        """
        with self._lock:
            pages = list(self._pages.values())

        result = []
        for p in pages:
            if lat_min is not None and p.lat_max  < lat_min: continue
            if lat_max is not None and p.lat_min  > lat_max: continue
            if lon_min is not None and p.lon_max  < lon_min: continue
            if lon_max is not None and p.lon_min  > lon_max: continue
            result.append({
                "page_id":      p.page_id,
                "lat_bucket":   p.lat_bucket,
                "lon_bucket":   p.lon_bucket,
                "depth_bucket": p.depth_bucket,
                "lat_range":    f"{p.lat_min:.1f}-{p.lat_max:.1f}",
                "lon_range":    f"{p.lon_min:.1f}-{p.lon_max:.1f}",
                "depth_range":  f"{p.depth_min:.0f}-{p.depth_max:.0f}",
                "time_bucket":  p.time_bucket,
                "state":        p.state.value,
                "pinned":       p.pinned,
                "last_access":  p.last_access,
                "size_bytes":   p.size_bytes,
            })
        return result

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def stats(self) -> Dict:
        with self._lock:
            counts = {s.value: 0 for s in PageState}
            pinned_count = 0
            failed_count = 0
            for p in self._pages.values():
                counts[p.state.value] += 1
                if p.pinned:
                    pinned_count += 1
                if p.state == PageState.FAILED:
                    failed_count += 1
        return {
            "total_pages":   len(self._pages),
            "pinned_pages":  pinned_count,
            "failed_pages":  failed_count,
            "disk_bytes":    self._disk_bytes,
            "cap_bytes":     self.cap_bytes,
            "disk_used_pct": round(self._disk_bytes / self.cap_bytes * 100, 1),
            "states":        counts,
        }


# ---------------------------------------------------------------------------
# Date-range helpers (added for /ocean/timeline and multi-day diff)
# ---------------------------------------------------------------------------

from datetime import date as _date, datetime as _dt, timedelta as _td
from typing import Iterator

DATE_GRAN_DAYS: dict = {
    "day":   1,
    "week":  7,
    "month": 30,
    "year":  365,
}


def date_bucket_for(date_str: str, granularity: str = "day") -> str:
    """
    Return the page-table time bucket key for a given date and granularity.
      day   → "2024-07-15"
      week  → "2024-W29"
      month → "2024-07"
      year  → "2024"
    """
    try:
        d = _dt.strptime(date_str[:10], "%Y-%m-%d").date()
    except ValueError:
        return date_str[:10]

    if granularity == "day":
        return d.isoformat()
    elif granularity == "week":
        iso = d.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    elif granularity == "month":
        return f"{d.year}-{d.month:02d}"
    elif granularity == "year":
        return str(d.year)
    return d.isoformat()


def iter_date_buckets(
    date_start: str, date_end: str, granularity: str = "day"
) -> Iterator[str]:
    """
    Yield all date bucket keys covering [date_start, date_end] at the given granularity.
    Uses calendar-aware stepping for month/year granularities so no months are skipped.
    """
    try:
        d0 = _dt.strptime(date_start[:10], "%Y-%m-%d").date()
        d1 = _dt.strptime(date_end[:10], "%Y-%m-%d").date()
    except ValueError:
        yield date_start[:10]
        return

    seen = []
    if granularity == "year":
        for y in range(d0.year, d1.year + 1):
            bkt = str(y)
            if bkt not in seen:
                seen.append(bkt)
                yield bkt
    elif granularity == "month":
        y, m = d0.year, d0.month
        while (y, m) <= (d1.year, d1.month):
            bkt = f"{y}-{m:02d}"
            if bkt not in seen:
                seen.append(bkt)
                yield bkt
            m += 1
            if m > 12:
                m = 1
                y += 1
    elif granularity == "week":
        current = d0
        while current <= d1:
            bkt = date_bucket_for(current.isoformat(), "week")
            if bkt not in seen:
                seen.append(bkt)
                yield bkt
            current += _td(days=7)
    else:  # day
        current = d0
        while current <= d1:
            bkt = current.isoformat()
            yield bkt
            current += _td(days=1)

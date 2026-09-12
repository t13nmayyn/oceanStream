"""
router.py — Transparent Copernicus dataset routing by date
==========================================================

Physics products:
  GLOBAL_ANALYSISFORECAST_PHY_001_024 → near-real-time + 10-day forecast
  GLOBAL_MULTIYEAR_PHY_001_030 (GLORYS12) → historical reanalysis

BGC products:
  GLOBAL_ANALYSISFORECAST_BGC_001_028 → near-real-time biogeochemistry
  GLOBAL_MULTIYEAR_BGC_001_029 → historical BGC reanalysis

Cutoff: today − MULTIYEAR_LAG_DAYS (default 400 days ≈ 13 months).
Dates older than the cutoff use MULTIYEAR products; recent/future dates
use ANALYSISFORECAST products. This is fully transparent to all callers.

Smart date resolution
---------------------
Copernicus ANFC products are typically published with a ~24-36 h lag.
`resolve_date_input("today")` therefore walks backward from today until
it finds a date that is at most MAX_LOOKBACK_DAYS in the past, returning
the most-recent date that should realistically have data.  Callers that
already know the exact date (e.g. a frontend date-picker) bypass this by
passing an explicit ISO string.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Optional

# ---------------------------------------------------------------------------
# Tuneable lag — GLORYS12 is typically 12-18 months behind real-time
# ---------------------------------------------------------------------------
MULTIYEAR_LAG_DAYS: int = 400

# ---------------------------------------------------------------------------
# How many days back we walk when "today" has no data yet
# ---------------------------------------------------------------------------
MAX_LOOKBACK_DAYS: int = 5   # safety cap; normally 1-2 days is enough

# ---------------------------------------------------------------------------
# Dataset IDs (Copernicus Marine catalogue)
# ---------------------------------------------------------------------------
PHY_ANFC_DATASET = "cmems_mod_glo_phy_anfc_0.083deg_P1D-m"   # analysis/forecast
PHY_MY_DATASET   = "cmems_mod_glo_phy_my_0.083deg_P1D-m"      # multiyear reanalysis

BGC_ANFC_DATASET = "cmems_mod_glo_bgc_anfc_0.25deg_P1D-m"
BGC_MY_DATASET   = "cmems_mod_glo_bgc_my_0.25deg_P1D-m"

# ---------------------------------------------------------------------------
# Variable lists
# ---------------------------------------------------------------------------
PHY_VARIABLES: List[str] = ["thetao", "so", "uo", "vo", "zos"]
BGC_VARIABLES: List[str] = ["chl", "no3", "po4", "si", "o2", "ph", "spco2"]

PHY_ALIAS: dict = {
    "temperature": "thetao", "temp": "thetao",
    "salinity": "so",
    "current_u": "uo", "current_v": "vo",
    "sea_level": "zos",
}
BGC_ALIAS: dict = {
    "chlorophyll": "chl",
    "nitrate": "no3",
    "phosphate": "po4",
    "silicate": "si",
    "oxygen": "o2",
    "ph": "ph",
    "pco2": "spco2",
}


def _parse_date(date_str: str) -> date:
    """Parse ISO date string, tolerating several common formats."""
    candidates = [
        (date_str[:10], "%Y-%m-%d"),
        (date_str[:19], "%Y-%m-%dT%H:%M:%S"),
        (date_str[:8],  "%Y%m%d"),
    ]
    for s, fmt in candidates:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str!r}")


def cutoff_date() -> date:
    return date.today() - timedelta(days=MULTIYEAR_LAG_DAYS)


def is_recent(date_str: str) -> bool:
    """True when date falls in the ANALYSISFORECAST window (recent or future)."""
    try:
        return _parse_date(date_str) >= cutoff_date()
    except ValueError:
        return False


def phy_dataset(date_str: str) -> str:
    return PHY_ANFC_DATASET if is_recent(date_str) else PHY_MY_DATASET


def bgc_dataset(date_str: str) -> str:
    return BGC_ANFC_DATASET if is_recent(date_str) else BGC_MY_DATASET


def resolve_variables(var_list: List[str]) -> dict:
    """Split a mixed variable list into {phy: [...], bgc: [...]} canonical names."""
    phy, bgc = [], []
    for v in var_list:
        canon = PHY_ALIAS.get(v, v)
        if canon in PHY_VARIABLES:
            phy.append(canon)
            continue
        canon = BGC_ALIAS.get(v, v)
        if canon in BGC_VARIABLES:
            bgc.append(canon)
    return {"phy": list(dict.fromkeys(phy)), "bgc": list(dict.fromkeys(bgc))}


def route_info(date_str: str) -> dict:
    recent = is_recent(date_str)
    return {
        "date":         date_str,
        "is_recent":    recent,
        "phy_dataset":  phy_dataset(date_str),
        "bgc_dataset":  bgc_dataset(date_str),
        "product_type": "analysisforecast" if recent else "multiyear",
        "cutoff_date":  cutoff_date().isoformat(),
        "lag_days":     MULTIYEAR_LAG_DAYS,
    }


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def today_iso() -> str:
    return date.today().isoformat()


def yesterday_iso() -> str:
    return (date.today() - timedelta(days=1)).isoformat()


def last_week_iso() -> str:
    """7 days ago (start of a ~1-week window)."""
    return (date.today() - timedelta(days=7)).isoformat()


def last_month_iso() -> str:
    """30 days ago."""
    return (date.today() - timedelta(days=30)).isoformat()


def last_year_iso() -> str:
    """365 days ago."""
    return (date.today() - timedelta(days=365)).isoformat()


def latest_available_iso() -> str:
    """
    Return the most-recent date for which Copernicus ANFC data is likely published.

    Copernicus ANFC daily products are published with a ~24-36 h lag.
    Strategy:
      1. If it is past 14:00 UTC today, yesterday's data is almost certainly
         available — return yesterday.
      2. Otherwise (early UTC morning), return 2 days ago as the safe fallback.
      3. In all cases we cap at MAX_LOOKBACK_DAYS days to avoid stale data.

    This fixes the original broken loop that always returned on offset=1
    without doing any actual availability check.
    """
    now_utc  = datetime.utcnow()
    today    = now_utc.date()

    # If Copernicus has had time to publish yesterday's data (after ~14:00 UTC)
    # use yesterday; otherwise use 2 days ago as the safer default.
    if now_utc.hour >= 14:
        safe_offset = 1   # yesterday
    else:
        safe_offset = 2   # day-before-yesterday

    offset = min(safe_offset, MAX_LOOKBACK_DAYS)
    return (today - timedelta(days=offset)).isoformat()


# ---------------------------------------------------------------------------
# Public resolver — called by every endpoint
# ---------------------------------------------------------------------------

_KEYWORD_MAP = {
    # "now"-style → latest available (not raw today which may be unpublished)
    "today":      latest_available_iso,
    "now":        latest_available_iso,
    "latest":     latest_available_iso,
    "current":    latest_available_iso,
    # explicit shortcuts
    "yesterday":        yesterday_iso,
    "last_week":        last_week_iso,
    "last_7_days":      last_week_iso,
    "week":             last_week_iso,
    "7d":               last_week_iso,
    "last_month":       last_month_iso,
    "last_30_days":     last_month_iso,
    "month":            last_month_iso,
    "30d":              last_month_iso,
    "last_year":        last_year_iso,
    "last_365_days":    last_year_iso,
    "year":             last_year_iso,
    "365d":             last_year_iso,
    "1y":               last_year_iso,
}


def resolve_date_input(date_str: Optional[str] = None) -> str:
    """
    Normalize a date input from any frontend or API caller.

    Accepts:
      • None / "" / "today" / "now" / "latest" / "current"
            → latest_available_iso() (yesterday or 2 days ago depending on UTC hour)
      • "yesterday"                 → yesterday_iso()
      • "week" / "last_week" / "7d" / "last_7_days"  → 7 days ago
      • "month" / "last_month" / "30d"               → 30 days ago
      • "year" / "last_year" / "1y" / "365d"         → 365 days ago
      • "YYYY-MM-DD" (or compact YYYYMMDD)            → that exact date.
            Today and future dates are clamped to latest_available_iso()
            because Copernicus data for the current day is typically
            not yet published (24-36 h processing lag).

    Returns an ISO-8601 date string (YYYY-MM-DD).
    """
    if not date_str or not str(date_str).strip():
        return latest_available_iso()

    d_clean = str(date_str).lower().strip()

    # Keyword shortcuts
    fn = _KEYWORD_MAP.get(d_clean)
    if fn:
        return fn()

    # Explicit date
    try:
        parsed = _parse_date(date_str)
        today  = date.today()
        # Today or future → clamp to latest available.
        # Copernicus data for today is almost never published yet (24-36 h lag),
        # so we treat today the same as a future date.
        if parsed >= today:
            return latest_available_iso()
        # Past date is always valid (could be multiyear reanalysis)
        return parsed.isoformat()
    except Exception:
        # Unparseable → safe fallback
        return latest_available_iso()


def date_info() -> dict:
    """
    Return a summary of the current date context for the frontend.
    Useful for populating date pickers with correct defaults and boundaries.
    """
    today         = date.today()
    latest        = latest_available_iso()
    yest          = yesterday_iso()
    week_start    = last_week_iso()
    month_start   = last_month_iso()
    year_start    = last_year_iso()
    cutoff        = cutoff_date()

    return {
        "server_date_utc":     datetime.utcnow().strftime("%Y-%m-%d"),
        "server_datetime_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "today_iso":           today.isoformat(),
        "latest_available":    latest,
        "yesterday":           yest,
        "presets": {
            "yesterday":   {"label": "Yesterday",    "date": yest},
            "7d":          {"label": "Last 7 Days",  "start": week_start,  "end": latest},
            "30d":         {"label": "Last 30 Days", "start": month_start, "end": latest},
            "1y":          {"label": "Last Year",    "start": year_start,  "end": latest},
        },
        "copernicus": {
            "multiyear_cutoff": cutoff.isoformat(),
            "lag_note":         "Copernicus ANFC products have a ~24-36 h publication lag. "
                                "Today's data is typically unavailable; use 'latest_available'.",
            "anfc_min_date":    latest,
            "my_max_date":      cutoff.isoformat(),
        },
        "calendar_bounds": {
            "min_date": "1993-01-01",
            "max_date": latest,
        },
    }


def resolve_date_range(preset: Optional[str] = None,
                       date_start: Optional[str] = None,
                       date_end: Optional[str] = None) -> tuple[str, str]:
    """
    Resolve a (start, end) date pair from either a preset keyword or explicit dates.

    Preset keywords  →  (start_iso, end_iso):
      "yesterday"   →  (yesterday, yesterday)
      "week" / "7d" →  (7 days ago, yesterday)
      "month" / "30d" → (30 days ago, yesterday)
      "year" / "1y"   → (365 days ago, yesterday)

    If preset is None/empty, falls back to explicit date_start / date_end.
    Missing date_end defaults to latest_available_iso().
    Missing date_start defaults to 7 days before date_end.
    """
    end_default = latest_available_iso()

    if preset:
        p = preset.lower().strip()
        if p in ("yesterday",):
            yest = yesterday_iso()
            return yest, yest
        if p in ("week", "7d", "last_week", "last_7_days"):
            return last_week_iso(), end_default
        if p in ("month", "30d", "last_month", "last_30_days"):
            return last_month_iso(), end_default
        if p in ("year", "1y", "365d", "last_year", "last_365_days"):
            return last_year_iso(), end_default

    # Explicit dates
    end   = resolve_date_input(date_end)   if date_end   else end_default
    start = resolve_date_input(date_start) if date_start else (
        (_parse_date(end) - timedelta(days=7)).isoformat()
    )
    return start, end

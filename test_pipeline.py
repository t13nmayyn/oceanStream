#!/usr/bin/env python3
"""
test_pipeline.py — Final Pipeline Verification for oceanStream v3
=================================================================
Tests all four feature areas:
  1. Instrument Data Overlay (Argo float bounding-box markers in /ocean/snapshot + /ocean/volume)
  2. Store Management & Status (/backend/status, /ocean/evict, /ocean/cache)
  3. Multi-depth Layer State (/ocean/volume depth slice states)
  4. Full request-to-render flow
"""

import json
import sys
import time
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
WARN = "\033[93m⚠\033[0m"


def _get(path: str, timeout: int = 15):
    url = f"{BASE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as ex:
        return {"_error": str(ex)}, 0


def _post(path: str, timeout: int = 10):
    url = f"{BASE}{path}"
    try:
        req = urllib.request.Request(url, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as ex:
        return {"_error": str(ex)}, 0


def _delete(path: str, timeout: int = 10):
    url = f"{BASE}{path}"
    try:
        req = urllib.request.Request(url, method="DELETE")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as ex:
        return {"_error": str(ex)}, 0


def check(name, cond, details=""):
    mark = PASS if cond else FAIL
    print(f"  {mark} {name}{' — ' + details if details else ''}")
    return cond


results = []


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ──────────────────────────────────────────────────────────────
# 0. Root / connectivity
# ──────────────────────────────────────────────────────────────
section("0. Server Connectivity")
root, sc = _get("/")
ok = check("Server reachable", sc == 200, f"status={sc}")
results.append(ok)
if not ok:
    print("\n  Server is not running! Start with: uvicorn main:app --port 8000")
    sys.exit(1)


# ──────────────────────────────────────────────────────────────
# 1. /backend/status — Telemetry endpoint
# ──────────────────────────────────────────────────────────────
section("1. Store Management & Status — /backend/status")
status, sc = _get("/backend/status")
results.append(check("/backend/status reachable", sc == 200, f"HTTP {sc}"))
if sc == 200:
    results.append(check("  status == ok", status.get("status") == "ok"))
    results.append(check("  server_time_utc present", "server_time_utc" in status))
    results.append(check("  latest_available_date present", "latest_available_date" in status))
    results.append(check("  zarr_stores block present", "zarr_stores" in status))
    results.append(check("  zarr_loaded block present", "zarr_loaded" in status))
    results.append(check("  page_table stats present", "page_table" in status))
    results.append(check("  cache stats present", "cache" in status))
    results.append(check("  prewarm block present", "prewarm" in status))
    results.append(check("  config block present", "config" in status))
    zs = status.get("zarr_stores", {})
    results.append(check("  zarr_stores.phy has 'present' key", "present" in zs.get("phy", {})))
    results.append(check("  zarr_stores.bgc has 'present' key", "present" in zs.get("bgc", {})))
    print(f"    → PHY zarr: {zs.get('phy', {})}")
    print(f"    → BGC zarr: {zs.get('bgc', {})}")
    print(f"    → Credentials: {status.get('credentials_present')}")
    print(f"    → Latest date: {status.get('latest_available_date')}")
    print(f"    → Page table: {status.get('page_table', {}).get('total_pages', '?')} pages")


# ──────────────────────────────────────────────────────────────
# 2. /ocean/evict — LRU eviction endpoint
# ──────────────────────────────────────────────────────────────
section("2. Store Management — /ocean/evict")
evict, sc = _post("/ocean/evict?target_free_gb=0.1")
results.append(check("/ocean/evict POST reachable", sc == 200, f"HTTP {sc}"))
if sc == 200:
    results.append(check("  status == ok", evict.get("status") == "ok"))
    results.append(check("  evicted_count present", "evicted_count" in evict))
    results.append(check("  page_table_after present", "page_table_after" in evict))
    print(f"    → Evicted {evict.get('evicted_count', 0)} pages")


# ──────────────────────────────────────────────────────────────
# 3. /ocean/cache — Cache deletion endpoint
# ──────────────────────────────────────────────────────────────
section("3. Store Management — /ocean/cache")
cache_del, sc = _delete("/ocean/cache?scope=l1")
results.append(check("/ocean/cache DELETE (scope=l1) reachable", sc == 200, f"HTTP {sc}"))
if sc == 200:
    results.append(check("  status == ok", cache_del.get("status") == "ok"))
    results.append(check("  l1_cleared key present", "l1_cleared" in cache_del))
    print(f"    → L1 cleared: {cache_del.get('l1_cleared', 0)} entries")

cache_pt, sc2 = _delete("/ocean/cache?scope=page_table")
results.append(check("/ocean/cache DELETE (scope=page_table) reachable", sc2 == 200, f"HTTP {sc2}"))
if sc2 == 200:
    results.append(check("  page_table_entries_cleared key present", "page_table_entries_cleared" in cache_pt))
    print(f"    → Page table entries cleared: {cache_pt.get('page_table_entries_cleared', 0)}")


# ──────────────────────────────────────────────────────────────
# 4. /ocean/snapshot — Argo bounding-box markers in 3D
# ──────────────────────────────────────────────────────────────
section("4. Instrument Data Overlay — /ocean/snapshot Argo markers")
snap, sc = _get("/ocean/snapshot?lat_min=10&lat_max=14&lon_min=72&lon_max=80&depth=0")
results.append(check("/ocean/snapshot reachable", sc == 200, f"HTTP {sc}"))
if sc == 200:
    results.append(check("  status present", "status" in snap))
    results.append(check("  layer_state present", "layer_state" in snap))
    results.append(check("  floats key present", "floats" in snap))
    results.append(check("  grid key present", "grid" in snap))

    floats = snap.get("floats", [])
    print(f"    → Floats returned: {len(floats)}")
    if floats:
        f0 = floats[0]
        results.append(check("  float[0] has bbox_3d", "bbox_3d" in f0, str(list(f0.keys())[:8])))
        results.append(check("  float[0] has marker_type", "marker_type" in f0))
        results.append(check("  float[0] has render_hint", "render_hint" in f0))
        results.append(check("  float[0] has depth_range_m", "depth_range_m" in f0))
        if "bbox_3d" in f0:
            bb = f0["bbox_3d"]
            results.append(check("  bbox_3d has x_min/x_max/y_min/y_max/z_min/z_max",
                                  all(k in bb for k in ["x_min", "x_max", "y_min", "y_max", "z_min", "z_max"]),
                                  str(bb)))
        print(f"    → Float marker_type: {f0.get('marker_type')}, render_hint: {f0.get('render_hint')}")
        print(f"    → bbox_3d: {f0.get('bbox_3d')}")
    else:
        print(f"    {WARN} No floats returned (may be normal if no Argo data in this region/date)")

    # Layer state check
    ls = snap.get("layer_state")
    results.append(check(
        f"  layer_state is valid value",
        ls in ("resident", "on_disk", "fetching", "not_fetched"),
        f"got: {ls!r}"
    ))
    print(f"    → layer_state: {ls}")
    print(f"    → is_reference_slice: {snap.get('is_reference_slice')}")
    print(f"    → source: {snap.get('source')}")


# ──────────────────────────────────────────────────────────────
# 5. /ocean/volume — Multi-depth slice states + Argo markers
# ──────────────────────────────────────────────────────────────
section("5. 3D Volume — Depth Slice States & Argo markers")
vol, sc = _get("/ocean/volume?lat_min=10&lat_max=14&lon_min=72&lon_max=80&depths=0,10,50,100,200,500,1000")
results.append(check("/ocean/volume reachable", sc == 200, f"HTTP {sc}"))
if sc == 200:
    results.append(check("  status == ok", vol.get("status") == "ok"))
    results.append(check("  depth_slices present", "depth_slices" in vol))
    results.append(check("  floats present in volume", "floats" in vol,
                          "Argo markers should be included in volume response"))

    slices = vol.get("depth_slices", [])
    print(f"    → Number of depth slices: {len(slices)}")
    results.append(check("  n_depth_slices >= 1", len(slices) >= 1))

    VALID_STATES = {"resident", "on_disk", "fetching", "not_fetched"}
    for sl in slices:
        d = sl.get("depth_m", "?")
        ls = sl.get("layer_state")
        is_ref = sl.get("is_reference_slice")
        state_ok = ls in VALID_STATES
        results.append(check(
            f"  depth={d}m layer_state valid",
            state_ok,
            f"got: {ls!r}"
        ))
        print(f"    → depth={d}m: layer_state={ls!r}, is_reference={is_ref}, n_points={sl.get('n_points', 0)}")

    vol_floats = vol.get("floats", [])
    print(f"    → Volume floats returned: {len(vol_floats)}")
    if vol_floats:
        f0 = vol_floats[0]
        results.append(check("  volume float[0] has bbox_3d", "bbox_3d" in f0))
        results.append(check("  volume float[0] has marker_type=argo_float", f0.get("marker_type") == "argo_float"))


# ──────────────────────────────────────────────────────────────
# 6. Full pipeline: point → snapshot → volume → status
# ──────────────────────────────────────────────────────────────
section("6. Full Pipeline Verification")
t0 = time.perf_counter()

point, sc = _get("/ocean/point?lat=12&lon=76&depth=0")
results.append(check("/ocean/point reachable", sc == 200, f"HTTP {sc}"))

snap2, sc2 = _get("/ocean/snapshot?lat_min=11&lat_max=13&lon_min=75&lon_max=77&depth=50")
results.append(check("/ocean/snapshot (depth=50m) reachable", sc2 == 200, f"HTTP {sc2}"))

vol2, sc3 = _get("/ocean/volume?lat_min=11&lat_max=13&lon_min=75&lon_max=77&depths=0,50,100,500")
results.append(check("/ocean/volume (4 depths) reachable", sc3 == 200, f"HTTP {sc3}"))

status2, sc4 = _get("/backend/status")
results.append(check("/backend/status (post-queries) reachable", sc4 == 200, f"HTTP {sc4}"))

elapsed = round((time.perf_counter() - t0) * 1000)
print(f"    → Full pipeline round-trip: {elapsed}ms")

if sc == 200:
    results.append(check("  point response has physics or status=fetching",
                          "physics" in point or point.get("status") == "fetching"))
    print(f"    → point status: {point.get('status')}, cache: {point.get('cache')}")

if sc3 == 200:
    slices2 = vol2.get("depth_slices", [])
    all_have_layer_state = all("layer_state" in sl for sl in slices2)
    results.append(check("  All volume slices have layer_state", all_have_layer_state))
    print(f"    → volume slices with layer_state: {sum(1 for sl in slices2 if 'layer_state' in sl)}/{len(slices2)}")


# ──────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────
section("SUMMARY")
total = len(results)
passed = sum(results)
failed = total - passed
print(f"  Total checks: {total}")
print(f"  {PASS} Passed: {passed}")
if failed:
    print(f"  {FAIL} Failed: {failed}")
print()
if failed == 0:
    print(f"  {PASS} ALL CHECKS PASSED — Pipeline verification complete!")
else:
    pct = round(passed / total * 100)
    print(f"  {WARN} {pct}% pass rate ({failed} failures)")
    sys.exit(1)

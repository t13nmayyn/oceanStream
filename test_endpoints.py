#!/usr/bin/env python3
"""
test_endpoints.py — In-process FastAPI TestClient verification
Verifies all newly wired endpoints:
  - /ocean/snapshot with Argo 3D bounding-box markers
  - /ocean/volume with 3D nearest slice, layer_state, and Argo markers
  - /backend/status comprehensive telemetry
  - /ocean/evict LRU eviction
  - /ocean/cache cache clear
"""

import sys
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

PASS = "[OK]"
FAIL = "[FAIL]"

checks = []

def check(name, cond, details=""):
    mark = PASS if cond else FAIL
    print(f"  {mark} {name}{' - ' + details if details else ''}")
    checks.append(cond)
    return cond

print("=" * 60)
print("1. Testing /backend/status")
print("=" * 60)
resp = client.get("/backend/status")
check("Status code 200", resp.status_code == 200, f"HTTP {resp.status_code}")
data = resp.json()
check("status == 'ok'", data.get("status") == "ok")
check("server_time_utc present", "server_time_utc" in data)
check("latest_available_date present", "latest_available_date" in data)
check("zarr_stores present", "zarr_stores" in data)
check("zarr_loaded present", "zarr_loaded" in data)
check("page_table present", "page_table" in data)
check("cache present", "cache" in data)
check("config present", "config" in data)
print(f"    → Page table total pages: {data.get('page_table', {}).get('total_pages')}")
print(f"    → Latest available date: {data.get('latest_available_date')}")

print("\n" + "=" * 60)
print("2. Testing /ocean/evict")
print("=" * 60)
resp = client.post("/ocean/evict?target_free_gb=0.1")
check("Status code 200", resp.status_code == 200, f"HTTP {resp.status_code}")
data = resp.json()
check("status == 'ok'", data.get("status") == "ok")
check("evicted_count present", "evicted_count" in data)
check("page_table_after present", "page_table_after" in data)
print(f"    → Evicted count: {data.get('evicted_count')}")

print("\n" + "=" * 60)
print("3. Testing /ocean/cache")
print("=" * 60)
resp = client.delete("/ocean/cache?scope=l1")
check("Status code 200 (scope=l1)", resp.status_code == 200, f"HTTP {resp.status_code}")
data = resp.json()
check("status == 'ok'", data.get("status") == "ok")
check("l1_cleared present", "l1_cleared" in data)

resp = client.delete("/ocean/cache?scope=page_table")
check("Status code 200 (scope=page_table)", resp.status_code == 200, f"HTTP {resp.status_code}")
data = resp.json()
check("status == 'ok'", data.get("status") == "ok")
check("page_table_entries_cleared present", "page_table_entries_cleared" in data)

print("\n" + "=" * 60)
print("4. Testing /ocean/snapshot with 3D Argo markers")
print("=" * 60)
resp = client.get("/ocean/snapshot?lat_min=10&lat_max=14&lon_min=72&lon_max=80&depth=0")
check("Status code 200", resp.status_code == 200, f"HTTP {resp.status_code}")
data = resp.json()
check("status in ('ok', 'fetching')", data.get("status") in ("ok", "fetching"))
check("layer_state present", "layer_state" in data)
check("floats present", "floats" in data)
check("grid present", "grid" in data)
floats = data.get("floats", [])
print(f"    → Floats count: {len(floats)}")
if floats:
    f0 = floats[0]
    check("float has bbox_3d", "bbox_3d" in f0)
    check("float has marker_type='argo_float'", f0.get("marker_type") == "argo_float")
    check("float has render_hint='bounding_box'", f0.get("render_hint") == "bounding_box")
    check("float has depth_range_m", "depth_range_m" in f0)
    if "bbox_3d" in f0:
        bb = f0["bbox_3d"]
        check("bbox_3d has all 6 coordinates", all(k in bb for k in ["x_min", "x_max", "y_min", "y_max", "z_min", "z_max"]))
        print(f"    → Sample float bbox_3d: {bb}")

print("\n" + "=" * 60)
print("5. Testing /ocean/volume with Multi-depth Slices & Layer States")
print("=" * 60)
resp = client.get("/ocean/volume?lat_min=10&lat_max=14&lon_min=72&lon_max=80&depths=0,10,50,100,200,500,1000")
check("Status code 200", resp.status_code == 200, f"HTTP {resp.status_code}")
data = resp.json()
check("status == 'ok'", data.get("status") == "ok")
check("depth_slices present", "depth_slices" in data)
check("floats present in volume", "floats" in data)
slices = data.get("depth_slices", [])
check("7 depth slices returned", len(slices) == 7, f"got {len(slices)}")
VALID_STATES = {"resident", "on_disk", "fetching", "not_fetched"}
for s in slices:
    d = s.get("depth_m")
    ls = s.get("layer_state")
    is_ref = s.get("is_reference_slice")
    valid_state = ls in VALID_STATES
    check(f"Slice at {d}m has valid layer_state", valid_state, f"state={ls!r}, is_reference={is_ref}")

vol_floats = data.get("floats", [])
print(f"    → Volume floats count: {len(vol_floats)}")
if vol_floats:
    f0 = vol_floats[0]
    check("volume float has bbox_3d", "bbox_3d" in f0)
    check("volume float has marker_type='argo_float'", f0.get("marker_type") == "argo_float")

print("\n" + "=" * 60)
print("TEST SUMMARY")
print("=" * 60)
total = len(checks)
passed = sum(checks)
failed = total - passed
print(f"Total checks: {total}")
print(f"Passed: {passed}")
print(f"Failed: {failed}")
if failed > 0:
    print(f"\n{FAIL} SOME CHECKS FAILED")
    sys.exit(1)
else:
    print(f"\n{PASS} ALL ENDPOINT CHECKS PASSED SUCCESSFULLY!")
    sys.exit(0)

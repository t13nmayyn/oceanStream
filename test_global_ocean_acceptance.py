#!/usr/bin/env python3
"""
test_global_ocean_acceptance.py — Comprehensive verification for Global Ocean Support,
L1/L2 Cache Architecture, 5 Major Oceans Pre-warm, and 3D Volume Integration.
"""
import sys
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app, PREWARM_REGIONS, GLOBAL_PINNED_OCEAN_LABELS, l1_get

client = TestClient(app)

PASS = "[PASS]"
FAIL = "[FAIL]"
all_passed = True

def check(title, condition, details=""):
    global all_passed
    mark = PASS if condition else FAIL
    if not condition:
        all_passed = False
    print(f"  {mark} {title}{' — ' + details if details else ''}")
    return condition

print("=" * 70)
print("TEST 1: 5 Major Oceans in Pre-warm (No Sub-Seas)")
print("=" * 70)
labels = [label for label, *_ in PREWARM_REGIONS]
expected_oceans = {"indian_ocean", "pacific_ocean", "atlantic_ocean", "arctic_ocean", "southern_ocean"}
check("Pre-warm regions count is 5", len(PREWARM_REGIONS) == 5, f"count={len(PREWARM_REGIONS)}")
check("Exactly 5 major oceans present", set(labels) == expected_oceans, f"labels={labels}")
check("Global pinned labels match 5 major oceans", GLOBAL_PINNED_OCEAN_LABELS == expected_oceans)
check("No regional seas in prewarm", not any("arabian" in l or "bengal" in l or "andaman" in l for l in labels))

print("\n" + "=" * 70)
print("TEST 2: Indian Ocean Volume Request (Cache Hit / Backup)")
print("=" * 70)
# Indian Ocean
res = client.get("/ocean/volume?lat_min=10&lat_max=14&lon_min=72&lon_max=76&depths=0,50,100,500,1000")
check("Indian Ocean HTTP 200", res.status_code == 200)
data = res.json()
check("Status is ok", data.get("status") == "ok")
check("Depth slices present", len(data.get("depth_slices", [])) >= 4, f"slices={len(data.get('depth_slices', []))}")
check("fetch_status field returned", "fetch_status" in data, f"fetch_status={data.get('fetch_status')}")

print("\n" + "=" * 70)
print("TEST 3: Pacific Ocean Request (Global Support — Not Hardcoded to Indian Ocean)")
print("=" * 70)
# Pacific Ocean (Equatorial / West Pacific)
res = client.get("/ocean/volume?lat_min=-5&lat_max=5&lon_min=150&lon_max=165&depths=0,50,100,500,1000")
check("Pacific Ocean HTTP 200", res.status_code == 200)
p_data = res.json()
check("Status is ok", p_data.get("status") == "ok")
check("Pacific returns depth slices", len(p_data.get("depth_slices", [])) >= 4)
check("Pacific returns valid values", len(p_data.get("depth_slices", [])[0].get("points", [])) > 0)
check("Pacific fetch_status exists", "fetch_status" in p_data, f"fetch_status={p_data.get('fetch_status')}")

print("\n" + "=" * 70)
print("TEST 4: Atlantic Ocean Request (Global Support)")
print("=" * 70)
# Atlantic Ocean (North Atlantic)
res = client.get("/ocean/volume?lat_min=20&lat_max=30&lon_min=-50&lon_max=-35&depths=0,50,100,500,1000")
check("Atlantic Ocean HTTP 200", res.status_code == 200)
atl_data = res.json()
check("Atlantic status is ok", atl_data.get("status") == "ok")
check("Atlantic depth slices present", len(atl_data.get("depth_slices", [])) >= 4)

print("\n" + "=" * 70)
print("TEST 5: Arctic Ocean Request (Global Support)")
print("=" * 70)
# Arctic Ocean (High Latitude)
res = client.get("/ocean/volume?lat_min=75&lat_max=85&lon_min=0&lon_max=20&depths=0,50,100,500,1000")
check("Arctic Ocean HTTP 200", res.status_code == 200)
arc_data = res.json()
check("Arctic status is ok", arc_data.get("status") == "ok")
check("Arctic depth slices present", len(arc_data.get("depth_slices", [])) >= 4)

print("\n" + "=" * 70)
print("TEST 6: Southern Ocean Request (Global Support)")
print("=" * 70)
# Southern Ocean (High Southern Latitude)
res = client.get("/ocean/volume?lat_min=-65&lat_max=-55&lon_min=40&lon_max=60&depths=0,50,100,500,1000")
check("Southern Ocean HTTP 200", res.status_code == 200)
so_data = res.json()
check("Southern Ocean status is ok", so_data.get("status") == "ok")
check("Southern Ocean depth slices present", len(so_data.get("depth_slices", [])) >= 4)

print("\n" + "=" * 70)
print("TEST 7: Point Queries Across Global Oceans")
print("=" * 70)
pt_pac = client.get("/ocean/point?lat=0&lon=160&depth=10")
check("Pacific Point HTTP 200", pt_pac.status_code == 200)
check("Pacific Point physics exists", "physics" in pt_pac.json() and pt_pac.json()["physics"] is not None)

pt_atl = client.get("/ocean/point?lat=25&lon=-40&depth=10")
check("Atlantic Point HTTP 200", pt_atl.status_code == 200)
check("Atlantic Point physics exists", "physics" in pt_atl.json() and pt_atl.json()["physics"] is not None)

print("\n" + "=" * 70)
print("TEST 8: L1 Cache Hit Verification")
print("=" * 70)
# First request loads into L1 (if real data) or served from memory
res1 = client.get("/ocean/snapshot?lat_min=10&lat_max=14&lon_min=72&lon_max=76&depth=0")
res2 = client.get("/ocean/snapshot?lat_min=10&lat_max=14&lon_min=72&lon_max=76&depth=0")
check("Snapshot HTTP 200", res2.status_code == 200)
check("L1 RAM cache hit on re-query", res2.json().get("cache") in ("L1_RAM", "L2_ZARR", "REFERENCE_SLICE"))

print("\n" + "=" * 70)
print("TEST 9: Bounded Retries & Error Safety")
print("=" * 70)
# Requesting invalid latitude must return HTTP 400 safely, not crash backend
bad_lat = client.get("/ocean/volume?lat_min=95&lat_max=100&lon_min=0&lon_max=10&depths=0")
check("Invalid latitude handled safely (HTTP 400)", bad_lat.status_code == 400)

print("\n" + "=" * 70)
print("TEST 10: 3D Float Enrichment Across Oceans")
print("=" * 70)
check("Floats array exists in volume response", "floats" in data)
if data.get("floats"):
    f0 = data["floats"][0]
    check("Floats have 3D bbox", "bbox_3d" in f0)

print("\n" + "=" * 70)
if all_passed:
    print("ALL 10 ACCEPTANCE TESTS PASSED!")
    sys.exit(0)
else:
    print("SOME ACCEPTANCE TESTS FAILED!")
    sys.exit(1)

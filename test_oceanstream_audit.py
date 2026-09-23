#!/usr/bin/env python3
"""
test_oceanstream_audit.py — Comprehensive end-to-end verification script
Tests:
  1. Backend status & telemetry
  2. /ocean/snapshot fallback + grid structure
  3. /ocean/point, /ocean/timeline, /ocean/coverage
  4. Dataset upload API (POST /api/upload-dataset) with background ingestion
  5. Dataset listing API (GET /api/datasets)
  6. Dataset slice API (GET /api/datasets/{id}/snapshot)
  7. WebSocket /ws/ocean-stream handshake
"""
import sys
import io
import time
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

PASS = "[PASS]"
FAIL = "[FAIL]"
all_passed = True

def run_check(name, cond, details=""):
    global all_passed
    mark = PASS if cond else FAIL
    if not cond:
        all_passed = False
    print(f"  {mark} {name}{' — ' + details if details else ''}")
    return cond

print("=" * 65)
print("TEST 1: Backend Status & Telemetry")
print("=" * 65)
res = client.get("/backend/status")
run_check("HTTP 200", res.status_code == 200, f"code={res.status_code}")
d = res.json()
run_check("status is ok", d.get("status") == "ok")
run_check("latest_available_date exists", bool(d.get("latest_available_date")), f"date={d.get('latest_available_date')}")
run_check("page_table telemetry exists", "page_table" in d)

print("\n" + "=" * 65)
print("TEST 2: /ocean/snapshot Fallback & Grid")
print("=" * 65)
# Query uncached region
res = client.get("/ocean/snapshot?lat_min=8&lat_max=12&lon_min=68&lon_max=72&depth=0")
run_check("HTTP 200", res.status_code == 200)
snap = res.json()
run_check("status in ('ok', 'fetching')", snap.get("status") in ("ok", "fetching"), f"status={snap.get('status')}")
run_check("grid non-empty (fallback/zarr)", len(snap.get("grid", [])) > 0, f"points={len(snap.get('grid', []))}")
run_check("point has value field for 3D", "value" in snap.get("grid", [])[0])
run_check("floats enriched for 3D", "floats" in snap)

print("\n" + "=" * 65)
print("TEST 3: Point, Timeline, and Coverage")
print("=" * 65)
p_res = client.get("/ocean/point?lat=12.5&lon=74.2&depth=0")
run_check("Point HTTP 200", p_res.status_code == 200)
p_data = p_res.json()
run_check("Point physics exists", "physics" in p_data and p_data["physics"] is not None)

t_res = client.get("/ocean/timeline?lat=12.5&lon=74.2&depth=0&preset=7d")
run_check("Timeline HTTP 200", t_res.status_code == 200)
t_data = t_res.json()
run_check("Timeline status ok", t_data.get("status") == "ok")

c_res = client.get("/ocean/coverage?lat_min=10&lat_max=15&lon_min=70&lon_max=75")
run_check("Coverage HTTP 200", c_res.status_code == 200)

print("\n" + "=" * 65)
print("TEST 4: Upload, List, and Query User Datasets")
print("=" * 65)
# Upload synthetic cruise CSV
csv_payload = (
    "latitude,longitude,depth,time,temperature,salinity\n"
    "15.0,73.0,0.0,2026-01-01,28.2,34.5\n"
    "15.1,73.0,0.0,2026-01-01,28.4,34.6\n"
    "15.0,73.1,0.0,2026-01-01,28.3,34.7\n"
    "15.1,73.1,0.0,2026-01-01,28.5,34.8\n"
)
files = {"file": ("arabian_sea_cruise.csv", io.BytesIO(csv_payload.encode("utf-8")), "text/csv")}
up_res = client.post("/api/upload-dataset", files=files)
run_check("Upload HTTP 200", up_res.status_code == 200, f"code={up_res.status_code}")
up_data = up_res.json()
ds_id = up_data.get("dataset_id")
run_check("dataset_id returned", bool(ds_id), f"id={ds_id}")

# Wait for background ingestion
ready = False
for _ in range(12):
    datasets_list = client.get("/api/datasets").json().get("datasets", [])
    entry = next((e for e in datasets_list if e.get("dataset_id") == ds_id), None)
    if entry and entry.get("status") == "ready":
        ready = True
        break
    time.sleep(0.5)

run_check("Ingestion completed (status='ready')", ready, f"status={entry.get('status') if entry else 'none'}")
run_check("Variables extracted", "temperature" in entry.get("variables", []), f"vars={entry.get('variables') if entry else []}")
run_check("Source tagged as 'user_upload'", entry.get("source") == "user_upload")

# Query dataset snapshot
slice_res = client.get(f"/api/datasets/{ds_id}/snapshot?variable=temperature")
run_check("Dataset Snapshot HTTP 200", slice_res.status_code == 200)
slice_data = slice_res.json()
run_check("Snapshot source is 'user_upload'", slice_data.get("source") == "user_upload")
run_check("Snapshot grid has points", len(slice_data.get("grid", [])) > 0, f"points={len(slice_data.get('grid', []))}")

print("\n" + "=" * 65)
print("TEST 5: WebSocket /ws/ocean-stream")
print("=" * 65)
try:
    with client.websocket_connect("/ws/ocean-stream") as ws:
        init_msg = ws.receive_json()
        run_check("WS initial message type", init_msg.get("type") in ("connected", "coverage_state"), f"type={init_msg.get('type')}")
        # Send a viewport subscription
        ws.send_json({
            "action": "subscribe",
            "lat_min": 10, "lat_max": 12,
            "lon_min": 70, "lon_max": 72,
            "depth_min": 0, "depth_max": 50,
            "date": "2026-09-20"
        })
        # Receive stream chunk or ack
        resp_msg = ws.receive_json()
        run_check("WS response received", bool(resp_msg.get("type")), f"type={resp_msg.get('type')}")
except Exception as ws_err:
    run_check("WS connection", False, f"error={ws_err}")

print("\n" + "=" * 65)
print(f"OVERALL RESULT: {'ALL PASS' if all_passed else 'SOME CHECKS FAILED'}")
print("=" * 65)
sys.exit(0 if all_passed else 1)

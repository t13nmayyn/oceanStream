import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from backend.main import app, load_datasets

# Run startup event
load_datasets()

client = TestClient(app)

print("\n=== TESTING ALL ENDPOINTS ===")

endpoints = [
    ("GET", "/"),
    ("GET", "/api/date-info"),
    ("GET", "/ocean/point?lat=13.08&lon=80.27&depth=0&date=today"),
    ("GET", "/ocean/point?lat=13.08&lon=80.27&depth=0&date=yesterday"),
    ("GET", "/ocean/snapshot?lat_min=10&lat_max=15&lon_min=75&lon_max=85&depth=0&date=yesterday"),
    ("GET", "/ocean/timeline?lat=13.08&lon=80.27&depth=0&preset=7d&granularity=day&variables=temperature,salinity"),
    ("GET", "/ocean/timeline?lat=13.08&lon=80.27&depth=0&preset=yesterday&granularity=day&variables=temperature,salinity"),
    ("GET", "/argo/nearest?lat=13.08&lon=80.27&radius_km=500&type=both"),
    ("GET", "/argo/profile?platform_number=2902746"),
    ("GET", "/ocean/coverage?lat_min=8&lat_max=22&lon_min=68&lon_max=90"),
    ("GET", "/api/metadata"),
    ("GET", "/api/coastal-temps?variable=thetao"),
    ("GET", "/api/depth-profile?location=chennai&variable=thetao"),
    ("GET", "/api/argo-floats?limit=10"),
    ("GET", "/api/argo-profiles?max_platforms=5"),
    ("GET", "/api/argo-slider?preset=7d"),
    ("GET", "/api/aodn-data"),
    ("GET", "/api/ocean-overview"),
    ("GET", "/api/cache-stats"),
    ("POST", "/api/cache-clear"),
    ("GET", "/api/files"),
]

for method, ep in endpoints:
    try:
        if method == "GET":
            res = client.get(ep)
        else:
            res = client.post(ep)
        print(f"[{res.status_code}] {method} {ep} -> {len(res.content)} bytes")
        if res.status_code >= 400:
            print(f"    ERROR: {res.text}")
    except Exception as e:
        print(f"[EXCEPTION] {method} {ep} -> {e}")

print("\n=== TESTING WEBSOCKETS ===")
try:
    with client.websocket_connect("/ws/coastal-temps") as ws:
        ws.send_json({"location": "chennai", "variable": "thetao"})
        msg1 = ws.receive_json()
        print(f"[WS coastal-temps] Msg 1: stage={msg1.get('stage')}")
        msg2 = ws.receive_json()
        print(f"[WS coastal-temps] Msg 2: stage={msg2.get('stage')}, points={len(msg2.get('data', []))}")
except Exception as e:
    print(f"[WS coastal-temps EXCEPTION] {e}")

try:
    with client.websocket_connect("/ws/ocean-stream") as ws:
        ws.send_json({"lat": 13.08, "lon": 80.27, "date": "yesterday"})
        msg1 = ws.receive_json()
        print(f"[WS ocean-stream] Msg 1: stage={msg1.get('stage')}")
        msg2 = ws.receive_json()
        print(f"[WS ocean-stream] Msg 2: stage={msg2.get('stage')}")
except Exception as e:
    print(f"[WS ocean-stream EXCEPTION] {e}")

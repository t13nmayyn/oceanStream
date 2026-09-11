# INCOIS Ocean 3D Visualization Platform — Phase 1 Core
## Tiered Caching & WebSocket Progressive Loading Pipeline

> **SIH Problem Statement SIH26067:** INCOIS Ocean Data Pipeline & High-Performance Visualization Platform  
> **Phase 1 Technical Focus:** Memory-hierarchy caching (L1 RAM → L2 Zarr → L3 Cold Storage) and progressive WebSocket streaming for low-latency ocean data delivery.

---

## 🏛️ Architecture: The 3-Tier Hierarchy

Copernicus Marine and Argo ERDDAP are **slow batch-download sources** (taking tens of seconds to minutes). They cannot be called during live API requests. To achieve real-time response times for 3D visualization and dashboard clients, we implement a memory-hierarchy caching architecture:

```
+-------------------------------------------------------------------------+
| L1 Cache (Fastest - RAM)                                                |
| In-memory Python dictionary (`slice_cache`) on FastAPI server.          |
| Latency: < 1 millisecond. Zero I/O, zero computation.                   |
+------------------------------------+------------------------------------+
                                     | (on miss)
                                     v
+-------------------------------------------------------------------------+
| L2 Cache (Fast - Disk)                                                  |
| Chunked Zarr array store (`ocean_data.zarr`, `argo_data.zarr`).         |
| Lazy-loaded into memory via `xarray.open_zarr()`.                       |
| Nearest-neighbor slice lookup (~5–25 ms). Automatically populates L1.   |
+------------------------------------+------------------------------------+
                                     | (NEVER called during live API)
                                     v
+-------------------------------------------------------------------------+
| L3 Cold Storage (Origin APIs - Offline ONLY)                            |
| Copernicus Marine Toolbox & Argo ERDDAP servers.                        |
| Touched ONLY ONCE during offline pre-processing via `data_fetch.py`.    |
+-------------------------------------------------------------------------+
```

---

## ⚡ Core Feature: WebSocket Progressive Loading (`/ws/coastal-temps`)

Alongside REST endpoints, the backend provides an interactive WebSocket channel implementing the **"blurry-then-sharp"** progressive pattern:

1. **Client Request:** Client sends `{"location": "chennai"}` over `ws://localhost:8000/ws/coastal-temps`.
2. **Stage 1 (Low-Res Preview):** Server immediately returns a preview slice (last 5 data points) in ~1 ms, rendering immediate feedback on the user's screen.
3. **Stage 2 (Full Resolution):** Server follows right after with the complete 30-day dataset.
4. **Result:** Zero perceived latency for the user—data appears instantly and sharpens smoothly.

---

## 📍 5 Fixed Indian Coastal Locations

| Location | Coordinates | Coast / Region |
| :--- | :--- | :--- |
| **Chennai** | 13.0827°N, 80.2707°E | Coromandel Coast |
| **Mumbai** | 18.9220°N, 72.8347°E | Konkan Coast |
| **Visakhapatnam** | 17.6868°N, 83.2185°E | Andhra Coast |
| **Kochi** | 9.9312°N, 76.2673°E | Malabar Coast |
| **Bay of Bengal** | 14.0000°N, 86.0000°E | Central Bay Deep-Sea Reference |

---

## 📂 Project Structure

```
Ocean067/
├── backend/
│   ├── data_fetch.py        # Offline one-time ingestion script (L3 -> L2)
│   ├── main.py              # FastAPI server with L1 cache, L2 Zarr & WebSocket
│   ├── requirements.txt     # Python dependencies
│   └── output/              # Pre-processed Zarr stores (L2)
│       ├── ocean_data.zarr/ # Copernicus temperature chunks
│       └── argo_data.zarr/  # Argo float profile data
├── frontend-test/
│   └── index.html           # Plain HTML/JS testbench with live gauges
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

> **Note on Copernicus Credentials:**  
> A free account from [Copernicus Marine](https://marine.copernicus.eu/) is required.  
> If not already logged in, run:
> ```bash
> copernicusmarine login
> ```

---

### 2. Fetch and Pre-process Data (Run Once Offline)

Run the offline batch ingestion script to download and convert the ocean model and Argo profiles into chunked Zarr format:

```bash
cd backend
python data_fetch.py
```

This populates `backend/output/ocean_data.zarr` and `backend/output/argo_data.zarr`.

---

### 3. Start the FastAPI Serving Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

FastAPI will be running at `http://localhost:8000`.  
Interactive API docs are available at `http://localhost:8000/docs`.

---

### 4. Open the Testbench

Simply open `frontend-test/index.html` in any web browser:
- Double-click `frontend-test/index.html` or open `file:///.../frontend-test/index.html` in Chrome/Firefox.
- Alternatively, serve via Python:
  ```bash
  python -m http.server 5500 --directory frontend-test
  ```
  Then navigate to `http://localhost:5500`.

---

## 🎯 How to Demonstrate to Hackathon Judges

1. **Demonstrate Progressive WebSocket Loading:**
   - Click between the coastal station buttons (**Chennai**, **Mumbai**, **Kochi**, etc.).
   - Point out how **Stage 1 (Preview)** arrives instantly, displaying the most recent temperatures.
   - Watch **Stage 2 (Full Resolution)** populate immediately following Stage 1, showing the complete timeline with exact millisecond timestamps.

2. **Demonstrate Tiered Caching Speedup:**
   - Click **"Clear L1 RAM Cache"** — the next request reads from L2 disk (~15–30 ms).
   - Click **"Re-fetch REST API"** — subsequent requests hit the L1 RAM dictionary (< 1 ms latency).
   - Point out the telemetry counter: `L1 Hit Rate: 100%`.

3. **Demonstrate Data Integrity:**
   - Scroll down to the **Argo Float Profiles** table showing real-world autonomous ocean float readings (`PLATFORM_NUMBER`, depth, temperature, coordinates) fetched via `argopy`.

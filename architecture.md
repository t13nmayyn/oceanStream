# System Architecture & Technical Specifications
## Project: `oceanStream` — INCOIS 3D/4D Ocean Data Platform
**Architecture Version:** 3.0.0  
**Last Updated:** September 2026  

---

## 1. App Flow and Architecture

### 1.1 High-Level Architecture Overview
`oceanStream` implements an asynchronous, tiered caching micro-architecture specifically engineered to bypass the latency bottlenecks inherent in multi-dimensional oceanographic datasets (NetCDF4, HDF5, and GRIB).

```
                              ┌──────────────────────────────────────────────┐
                              │            Client Browser / Web UI           │
                              │  Leaflet (2D) + Deck.gl (3D) + Chart.js (TS) │
                              └──────────────┬───────────────────────────────┘
                                             │ HTTP REST / WebSocket JSON
                                             ▼
                              ┌──────────────────────────────────────────────┐
                              │           FastAPI Gateway (Port 8000)        │
                              │           CORS, Middleware, Routing          │
                              └──────┬───────────────────────────────┬───────┘
                                     │                               │
                      Fast Path (<1ms)                               │ Tiered Lookup
                                     ▼                               ▼
                      ┌────────────────────────────┐  ┌──────────────────────────────┐
                      │   L1 Cache (RAM Memory)    │  │       router.py              │
                      │  Hash Dict (TTL = 5 min)   │  │ Date Routing & Lag Resolver  │
                      └────────────────────────────┘  └──────────────┬───────────────┘
                                                                     │
                                                      ┌──────────────▼───────────────┐
                                                      │       page_table.py          │
                                                      │  4D Demand Paging & Diffing  │
                                                      └──────┬───────────────┬───────┘
                                                             │               │
                                           Resident / Disk   │               │ Cache Miss
                                           (5–25ms)          │               │ (Asynchronous)
                                                             ▼               ▼
                                              ┌──────────────────┐  ┌──────────────────┐
                                              │     L2 Cache     │  │     fetcher.py   │
                                              │  (Disk .zarr)    │  │ (Asyncio Worker) │
                                              │ • phy_data.zarr  │  └────────┬─────────┘
                                              │ • bgc_data.zarr  │           │
                                              │ • argo_data.zarr │           ▼
                                              └──────────────────┘  ┌──────────────────┐
                                                                    │     L3 Origin    │
                                                                    │ • Copernicus API │
                                                                    │ • Argo (argopy)  │
                                                                    │ • AODN NetCDF    │
                                                                    └──────────────────┘
```

---

### 1.2 Storage Tier Hierarchy & Latency Profiles

| Tier | Medium | Latency | Scope & Contents | Eviction & Lifecycle Policy |
|:---|:---|:---|:---|:---|
| **L1 Cache** | Python In-Memory Process Heap (`dict`) | **`< 1 ms`** | Query-level response payloads (points, slices, nearest float summaries). | LRU / TTL-based (300 seconds expiration). Explicit manual purge via `POST /api/cache-clear`. |
| **L2 Cache** | High-Density Chunked Zarr on Disk (`.zarr`) | **`5 – 25 ms`** | Gridded multidimensional multidatasets (`latitude`, `longitude`, `depth`, `time`). | Managed by `PageTable`: capacity capped at `ZARR_CAP_BYTES` (default 4 GB) with automatic LRU page directory eviction. |
| **L3 Origin** | Copernicus Marine API, Argo ERDDAP, AODN THREDDS | **`15 – 90+ s`** | Petabyte-scale global physical & biogeochemical reanalysis and forecast products. | **Never blocks client thread.** Ingested strictly asynchronously in the background; streaming responses progressive updates. |

---

### 1.3 4D Virtual Memory Page Table & State Machine

The core algorithmic component of `oceanStream` is the **Page Table** (`page_table.py`), which models global ocean space and time as a discrete four-dimensional grid of pages:
$$\text{Page ID} = \text{lat\_bucket} : \text{lon\_bucket} : \text{depth\_bucket} : \text{time\_bucket}$$

#### Bucket Dimensions:
- **Depth Bucket:** Fixed $2.0\,\text{m}$ vertical bins ($\text{floor}(\text{depth} / 2.0)$).
- **Latitude Bucket:** $4.0^\circ$ spatial bins ($\approx 444\,\text{km}$ north-south resolution).
- **Longitude Bucket:** $4.0^\circ$ spatial bins ($\approx 444\,\text{km}$ at equator).
- **Time Bucket:** 1-day temporal intervals (`YYYY-MM-DD`).

#### Page State Lifecycle Machine:
```
  [ NOT_FETCHED ]  ──(User queries range)──►  [ FETCHING ]
         ▲                                          │
         │                                (Origin download completes)
    (LRU Eviction                                   │
     frees disk)                                    ▼
         │                                    [ ON_DISK ]  (.zarr store)
         │                                          │
         │                                (Read into RAM memory)
         │                                          │
         └────────────────────────────────────  [ RESIDENT ] (L1 cache)
```

1. **Range Diffing:** When a viewport or timeline is requested, `PageTable.diff(lat_min, lat_max, lon_min, lon_max, depth_min, depth_max, date)` computes two sets:
   - `served`: Pages currently `RESIDENT` or `ON_DISK`.
   - `missing`: Pages in `NOT_FETCHED` state.
2. **Non-Blocking Background Fetch:** Missing pages are transitioned to `FETCHING`. An `asyncio.Task` is dispatched to stream the minimal bounding bounding box from Copernicus Marine.
3. **LRU Eviction Engine:** When disk writes push total Zarr storage beyond `ZARR_CAP_BYTES`, `PageTable.evict_lru(target_bytes)` ranks pages by `last_access` timestamp and removes unreferenced Zarr chunks.
4. **Predictive Lookahead Prefetching:** Directional scrub tracking predicts user camera translation and triggers pre-warming of adjacent temporal or depth buckets.

---

### 1.4 Transparent Date Routing & Publication Lag Engine

Ocean satellite models have differing temporal availability. The router (`router.py`) dynamically maps queries to the correct Copernicus catalogue identifier:

```
                            User Query Date (ISO string or "today" / "yesterday")
                                                    │
                                                    ▼
                                  Cutoff = (Today - 400 days)
                                                    │
                      ┌─────────────────────────────┴─────────────────────────────┐
                      ▼                                                           ▼
            Date >= Cutoff Date                                         Date < Cutoff Date
       (Near-Real-Time & Forecast)                                  (Historical Multi-Year)
                      │                                                           │
   ┌──────────────────┴──────────────────┐                     ┌──────────────────┴──────────────────┐
   ▼                                     ▼                     ▼                                     ▼
Physics:                              BGC:                  Physics:                              BGC:
GLOBAL_ANALYSISFORECAST_PHY_001_024   GLOBAL_ANALYSIS...    GLOBAL_MULTIYEAR_PHY_001_030 (GLORYS) GLOBAL_MULTIYEAR...
```

#### Smart Publication Lag Lookback:
Near-real-time ocean forecasts have a natural assimilation and publishing delay of 24 to 36 hours. When a user requests `"today"`:
1. `router.py` checks whether today's slice is released.
2. If absent, it decrements the date backwards by 1 day up to `MAX_LOOKBACK_DAYS = 5` until the latest released daily analysis is identified.
3. The response payload returns transparent metadata (`is_recent`, `product_type`, `dataset_id`) informing the frontend without breaking requests.

---

### 1.5 WebSocket Progressive Streaming Pipeline

To eliminate user interface freezing during massive 3D volumetric transfers, `oceanStream` provides two progressive WebSocket pipelines:

1. **`/ws/coastal-temps` (Progressive Historical Series):**
   - **Stage 1 (Preview):** Immediately streams the last 5 time-series observations ($< 5\,\text{ms}$).
   - **Stage 2 (Full):** Asynchronously compiles and streams the complete multi-month/year historical trajectory.
2. **`/ws/ocean-stream` (4D Viewport Grid Stream):**
   - Receives viewport bounding coordinates (`lat_min`, `lat_max`, `lon_min`, `lon_max`, `depth_min`, `depth_max`, `date`).
   - Emits `stream_start` containing resident and missing page counts.
   - Iterates through depth levels (in $2\,\text{m}$ slices), emitting gridded matrices layer-by-layer for real-time WebGL canvas rendering.
   - Emits background download alerts for missing pages.
   - Emits `stream_complete` containing end-to-end transmission latency metrics.

---

## 2. Folder and File Structure

```
c:/ocean/oceanStream/
├── .env                                # Environment variables (Copernicus credentials, caps)
├── .gitignore                          # Git exclusions (pycache, output zarrs, virtualenvs)
├── README.md                           # Quickstart guide and API summary
├── prd.md                              # Product Requirement Details (PRD)
├── architecture.md                     # System Architecture & Technical Specifications
├── rules.md                            # Development Rules, Best Practices & Anti-Patterns
├── phases.md                           # Multi-phase project delivery roadmap
├── design.md                           # UI/UX, Color Tokens & Typography Specification
├── memory.md                           # State Tracker: Completed features & active files
├── main.py                             # Root-level entry point proxy for Uvicorn
├── new.py                              # AODN/IMOS CTD NetCDF ingestion & verification tool
├── test_backend.py                     # Comprehensive API endpoint & WebSocket integration test
│
├── backend/                            # Core FastAPI Backend Application
│   ├── main.py                         # Application gateway, REST endpoints, WebSockets, L1 cache
│   ├── router.py                       # Transparent date router, variable aliases, lag lookback
│   ├── fetcher.py                      # On-demand origin data fetcher (Copernicus API -> Zarr)
│   ├── argo.py                         # Argo Core, BGC-Argo, and AODN CTD spatial/profile engine
│   ├── page_table.py                   # OS-style 4D virtual memory page table & LRU eviction
│   ├── data_fetch.py                   # Offline batch ingestion script for Indian coastal baseline
│   ├── requirements.txt                # Python backend package dependencies
│   │
│   └── output/                         # Local Zarr Datastores (L2 Disk Cache)
│       ├── phy_data.zarr/              # Physics data (thetao, so, uo, vo, zos)
│       ├── bgc_data.zarr/              # Biogeochemical data (chl, no3, o2, ph, etc.)
│       ├── argo_data.zarr/             # Ingested Argo float trajectory & profile data
│       └── ocean_data.zarr/            # Legacy backward-compatible thetao store
│
├── frontend-test/                      # Test UI & 3D Interactive Client
│   └── index.html                      # Standalone 2D/3D ocean dashboard (Leaflet + Deck.gl)
│
├── aodn_output/                        # High-frequency AODN mooring timeseries & plots
│   ├── aodn_subset.nc                  # Downloaded IMOS CTD NetCDF file
│   ├── aodn_subset.csv                 # Tabular CSV export for data science
│   ├── aodn_meta.json                  # Ingested station coordinates and variable metadata
│   ├── temperature_depth.png           # Verification plot: Temp vs Depth
│   ├── salinity_depth.png              # Verification plot: Salinity vs Depth
│   └── temperature_timeseries.png      # Verification plot: Temp over Time
│
└── ocean_visualizations/               # Pre-generated oceanographic raster plots
    ├── current_direction.png           # Ocean current vector orientation
    ├── current_speed.png               # Magnitude map of surface currents
    ├── temperature.png                 # Thermal distribution heatmap
    └── temperature_currents.png        # Combined temperature + vector flow field
```

### Module Responsibilities Breakdown

| Module / File | Primary Technical Responsibilities |
|:---|:---|
| **`backend/main.py`** | FastAPI application lifecycle, L1 RAM cache operations, REST endpoint controllers (`/ocean/point`, `/ocean/snapshot`, `/ocean/timeline`, `/argo/*`), WebSockets (`/ws/*`), and static file serving. |
| **`backend/router.py`** | Dataset catalogue mapping (ANFC vs. MY), canonical variable alias resolution, smart lookback date resolution, and date presets (`yesterday`, `7d`, `30d`, `1y`). |
| **`backend/fetcher.py`** | Origin API integration via `copernicusmarine.subset()`, bounding box clamping, NetCDF to Zarr chunked merging (`_write_to_zarr`), and credentials validation. |
| **`backend/argo.py`** | Argo float spatial indexing, Haversine nearest-neighbor calculations, live `argopy` fallback querying, AODN CTD NetCDF parsing, and vertical profile compilation. |
| **`backend/page_table.py`** | 4D bucket coordinates, thread-safe page allocation tracking, range diffing, LRU eviction engine, prefetch lookahead hints, and `/ocean/coverage` telemetry. |
| **`backend/data_fetch.py`** | Standalone batch ingestion script populating initial Indian coastal baseline data across the 5 reference stations (Chennai, Mumbai, Vizag, Kochi, Bay of Bengal). |
| **`frontend-test/index.html`** | Single-page testing cockpit containing Leaflet 2D maps, Deck.gl 3D WebGL column rendering, Chart.js time-series and depth curves, 18-test runner, and live WebSocket console. |

---

## 3. Tech Stack Specification

### 3.1 Backend & Server Runtime
- **Language:** Python 3.10+
- **Web Framework:** **FastAPI** (`>=0.110.0`) — Asynchronous RESTful API framework utilizing Starlette and Pydantic.
- **ASGI Web Server:** **Uvicorn** (`>=0.28.0`) — High-performance ASGI server based on `uvloop` and `httptools`.
- **Concurrency Model:** Python `asyncio` event loop paired with threadpool workers for compute/IO tasks.

### 3.2 Geospatial, Oceanographic & Scientific Computing
- **Multidimensional Grids:** **Xarray** (`>=2024.0.0`) — N-dimensional labeled arrays and dataset manipulation.
- **Chunked Storage Engine:** **Zarr** (`>=2.16.0`) — Compressed, chunked, multi-dimensional array storage format optimized for cloud and disk I/O.
- **Data Ingestion SDKs:**
  - **`copernicusmarine`** (`>=1.3.0`): Official client for Copernicus Marine Service catalogue search, subsetting, and streaming.
  - **`argopy`** (`>=1.4.0`): Python library to fetch, preprocess, and visualize Argo float data (Standard and Expert modes).
  - **`erddapy`** (`<3.0.0`): ERDDAP server client for oceanographic tabular and gridded data retrieval.
- **Binary Format Handlers:** **NetCDF4** (`>=1.6.0`), **h5netcdf** (`>=1.3.0`), **Scipy** (`>=1.10.0`).
- **Numerical & Tabular:** **NumPy** (`>=1.24.0`), **Pandas** (`>=2.0.0`).
- **Static Visualizations:** **Matplotlib** (`>=3.7.0`) for headless figure generation.

### 3.3 Frontend Client & GPU Rendering Engine
- **Core Platform:** Modern Vanilla HTML5 & ES6+ JavaScript (Zero-build architecture for instant deployment and transparent client inspection).
- **CSS Architecture:** Vanilla CSS3 with Custom Design Tokens (`:root`), Flexbox, CSS Grid, and responsive viewports.
- **2D Cartographic Layer:** **Leaflet.js** (`v1.9.4`) with CartoDB Dark Matter tile services.
- **3D WebGL/WebGPU Layer:** **Deck.gl** (`v9.0.18`) by vis.gl/OpenJS Foundation — GPU-accelerated large-scale spatial data visualization using `GridCellLayer` and `ColumnLayer`.
- **Chart & Analytics Visualizations:** **Chart.js** (`v4.4.4`) with responsive dual-axis line charts for time series and depth profiles.
- **Color Science & Gradients:** **Chroma-js** (`v2.4.2`) for smooth scientific colormap interpolation (Coolwarm, Turbo, Viridis).

### 3.4 Communication & Networking
- **Transport Protocols:**
  - **HTTP/1.1 & HTTP/2:** Standard RESTful JSON endpoints with OpenAPI/Swagger 3.0 specification.
  - **WebSockets (RFC 6455):** Two-way low-latency streaming channels for real-time viewport and sensor updates.
- **Cross-Origin Policy:** Permissive CORS middleware enabled for universal client integration.
- **Configuration Management:** `python-dotenv` reading environment credentials from `.env`.

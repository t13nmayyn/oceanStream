# Project Memory & Execution Ledger
## Project: `oceanStream` — INCOIS 3D/4D Ocean Data Platform
**Current Version:** 3.0.0  
**Status:** Phase 2 Operational Prototype Complete | Phase 3 Planning Active  
**Last Updated:** September 2026  

---

## 1. What Has Been Completed

### 1.1 Backend Engine & API Architecture (`backend/main.py`)
- [x] **FastAPI Application Gateway:** Configured CORS middleware, static file mounts (`/static`, `/ui`, `/test`), and Uvicorn entrypoints.
- [x] **3-Tier Storage Hierarchy:**
  - **L1 RAM Cache:** In-memory dictionary cache with 300-second TTL and sub-millisecond retrieval (`< 1 ms`).
  - **L2 Zarr Store:** Multidimensional chunked stores on disk (`phy_data.zarr`, `bgc_data.zarr`, `argo_data.zarr`, `ocean_data.zarr`).
  - **L3 Cold Origin:** Background non-blocking fetcher worker.
- [x] **Next-Gen v3 REST Endpoints:**
  - `GET /ocean/point` — Primary click-to-query endpoint returning Physics + BGC + Nearest Argo float + routing metadata.
  - `GET /ocean/snapshot` — Bounding box + depth + date grid payload for map and 3D surface rendering.
  - `GET /ocean/timeline` — Time-series extraction supporting granularities (`day`, `week`, `month`) and variable subsets.
  - `GET /argo/nearest` — Haversine nearest-neighbor search for Core and BGC Argo floats within 10–2000 km.
  - `GET /argo/profile` — Full vertical depth profiles with all physical and BGC sensor measurements.
  - `GET /ocean/coverage` — Virtual memory page table state visualization.
- [x] **Preserved Phase 1 Backward-Compatible Endpoints:**
  - `GET /api/coastal-temps` — Temperature timeseries for 5 fixed Indian coastal stations.
  - `GET /api/depth-profile` — Fixed station vertical depth profile.
  - `GET /api/argo-floats`, `GET /api/argo-profiles`, `GET /api/argo-slider` — Argo float queries.
  - `GET /api/aodn-data` — AODN/IMOS CTD mooring data serving.
  - `GET /api/cache-stats`, `POST /api/cache-clear` — Cache performance telemetry and flush control.
  - `GET /api/date-presets`, `GET /api/date-info`, `GET /api/files` — Metadata helpers.
- [x] **Progressive WebSocket Pipelines:**
  - `WS /ws/coastal-temps` — Multi-stage progressive streaming (instant 5-point preview followed by full dataset).
  - `WS /ws/ocean-stream` — Viewport depth-by-depth grid layer streaming with resident/missing telemetry.

### 1.2 Dataset Routing & Date Normalization (`backend/router.py`)
- [x] **Transparent Date Router:**
  - Automated switching between Near-Real-Time Analysis/Forecast (`GLOBAL_ANALYSISFORECAST_PHY_001_024` / `BGC_001_028`) and Multi-Year Historical Reanalyses (`GLOBAL_MULTIYEAR_PHY_001_030` GLORYS12 / `BGC_001_029`).
  - Configurable 400-day cutoff (`MULTIYEAR_LAG_DAYS = 400`).
- [x] **Publication Lag Fallback:**
  - Automated backward lookback (up to 5 days) resolving `"today"` queries to the latest published daily model without breaking requests.
- [x] **Variable Aliasing:**
  - Canonical mapping for 12 variables across physics (`thetao`, `so`, `uo`, `vo`, `zos`) and BGC (`chl`, `no3`, `po4`, `si`, `o2`, `ph`, `spco2`).

### 1.3 Virtual Memory Demand-Paging Table (`backend/page_table.py`)
- [x] **4D Bucket Coordinates:** Discretization into 4° latitude × 4° longitude × 2m depth × 1-day temporal bins.
- [x] **State Machine:** Robust state transitions (`NOT_FETCHED` $\rightarrow$ `FETCHING` $\rightarrow$ `ON_DISK` $\rightarrow$ `RESIDENT`).
- [x] **Range Diffing:** Instantaneous splitting of viewport queries into resident vs. missing page sets.
- [x] **LRU Eviction Engine:** Automatic pruning of least-recently-accessed disk pages when total storage exceeds `ZARR_CAP_BYTES = 4GB`.
- [x] **Prefetch Lookahead:** Predictive directional prefetching based on user pan/depth scrubbing.

### 1.4 In-Situ Argo & AODN CTD Mooring Integration (`backend/argo.py`, `new.py`)
- [x] **Core & BGC-Argo Parser:** Dual-mode spatial indexing supporting temperature, salinity, oxygen, chlorophyll, nitrate, and pH.
- [x] **Haversine Distance Engine:** Accurate great-circle distance ranking for nearest-neighbor float discovery.
- [x] **AODN/IMOS NetCDF Pipeline (`new.py`):**
  - Downloaded Coral Sea PIL100 SBE37SM CTD timeseries NetCDF.
  - Exported tabular CSV summary and metadata JSON.
  - Generated verification figures: Temperature-Depth, Salinity-Depth, and Temperature-Time curves.

### 1.5 Interactive Frontend & 3D Web Engine (`frontend-test/index.html`)
- [x] **Leaflet 2D Basemap:** Integrated CartoDB Dark Matter tiles, responsive viewports, and Indian coastal station pins.
- [x] **Deck.gl 3D WebGL Engine:** Hardware-accelerated column visualization with interactive pitch/tilt (0–60°), azimuth rotation, and top-down reset.
- [x] **Depth & Time Controls:** Interactive depth range slider (0–50m in 2m bins) and quick presets (`yesterday`, `7d`, `30d`, `1y`).
- [x] **OS Demand-Paging Memory Grid:** Live visual HUD rendering resident state across all depth buckets.
- [x] **Click-to-Query HUD:** Map click inspector testing `/ocean/point` in real time.
- [x] **Chart.js Visualizations:** Interactive time-series explorer and vertical depth profile plots.
- [x] **API Test Runner:** Automated 18-endpoint test suite executing live requests and inspecting JSON payloads.
- [x] **WebSocket Live Console:** Two-way message sender and real-time streaming packet monitor.

### 1.6 Core Project Documentation
- [x] `prd.md` — Product Requirement Details (what to build, targeted users, feature matrix).
- [x] `architecture.md` — Technical specifications, data flow, folder structure, tech stack.
- [x] `rules.md` — Engineering rules, approved patterns, and anti-patterns.
- [x] `phases.md` — Multi-phase project delivery roadmap (Phase 1, Phase 2, Phase 3).
- [x] `design.md` — Design tokens, colormaps, typography, and component styles.
- [x] `memory.md` — Execution ledger and active file tracker.

---

## 2. Which File Is Currently Being Worked On

### 2.1 Current Active Tasks & Files
- **Currently Completed:** Complete foundational documentation suite (`prd.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`, `memory.md`).
- **Primary Working Directory:** `c:/ocean/oceanStream/` and workspace root `c:/ocean/`.

### 2.2 Next Immediate Target Files (Phase 3 Roadmap)
| Target File | Planned Enhancements |
|:---|:---|
| **`frontend-test/index.html`** | Implement WebGL particle advection flow shaders for surface ocean currents ($u, v$ velocity vectors). |
| **`backend/fetcher.py`** | Add scheduled background cron ingestion for high-priority Indian coastal bounding boxes. |
| **`backend/main.py`** | Add Redis distributed cache provider toggle to support horizontal cluster scaling. |
| **`test_backend.py`** | Add automated pytest assertion suite for CI/CD pipeline integration. |

---

## 3. Maintenance Guidelines for `memory.md`

Whenever code changes or features are implemented:
1. **Update Section 1:** Check off completed items in the task list.
2. **Update Section 2:** Record the file currently being modified and summarize the active task.
3. **Record Timestamps:** Maintain date and version references to preserve context across sessions.

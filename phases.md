# Project Delivery Phases & Roadmap
## Project: `oceanStream` — INCOIS 3D/4D Ocean Data Platform
**Reference Problem Statement:** SIH-26067 — Smart India Hackathon  
**Document Version:** 3.0.0  

---

## Roadmap Overview

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: POC & Indian Coastal Baseline [COMPLETED]                             │
│ • 5 Coastal Stations • Temperature (thetao) • Core Argo • Local Zarr POC       │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Scalable 4D Engine, Routing & BGC Integration [CURRENT MILESTONE]     │
│ • Full Physics + BGC (12 Vars) • Transparent ANFC/MY Date Router               │
│ • OS-Style 4D Page Table • LRU Eviction • Progressive WebSockets • Deck.gl 3D  │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Production Web Portal, Flow Shaders & Operational Alerts [ROADMAP]    │
│ • GPU Current Particle Advection • Volumetric Raymarching • GEBCO Bathymetry   │
│ • Marine Heatwave & Bloom Alerts • Docker/K8s & INCOIS GIS Integration         │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Proof of Concept & Indian Coastal Baseline
**Status:** `Completed & Verified`  
**Focus:** Establishing baseline data ingestion, 3-tier caching proof of concept, and basic 2D/3D visualization for Indian coastal waters.

### 1.1 Key Deliverables
- **Fixed Indian Coastal Stations:**
  - Defined 5 reference coordinates across India's maritime exclusive economic zone:
    1. **Chennai** ($13.0827^\circ\text{N}, 80.2707^\circ\text{E}$) — Coromandel Coast
    2. **Mumbai** ($18.9220^\circ\text{N}, 72.8347^\circ\text{E}$) — Konkan Coast
    3. **Visakhapatnam** ($17.6868^\circ\text{N}, 83.2185^\circ\text{E}$) — Andhra Coast
    4. **Kochi** ($9.9312^\circ\text{N}, 76.2673^\circ\text{E}$) — Malabar Coast
    5. **Central Bay of Bengal** ($14.0000^\circ\text{N}, 86.0000^\circ\text{E}$) — Deep-sea reference
- **Offline Batch Data Ingestion (`data_fetch.py`):**
  - Downloaded high-resolution Copernicus Marine physics data for July 2024 across $8.0^\circ\text{N} - 20.0^\circ\text{N}$ and $71.0^\circ\text{E} - 88.0^\circ\text{E}$.
  - Converted raw NetCDF into chunked `ocean_data.zarr` ($0 - 50\,\text{m}$ depth).
- **In-Situ Argo & AODN Mooring Integration:**
  - Ingested Core Argo float temperature and salinity profiles via `argopy` into `argo_data.zarr`.
  - Built `new.py` to ingest high-frequency CTD mooring data from AODN/IMOS (SBE37SM instrument, Coral Sea PIL100 station) with automated matplotlib verification curves.
- **REST & WebSocket API v1/v2:**
  - Deployed endpoints: `GET /api/coastal-temps`, `GET /api/depth-profile`, `GET /api/argo-floats`, `GET /api/argo-profiles`, `GET /api/aodn-data`.
  - Progressive streaming over `WS /ws/coastal-temps` (instant 5-point preview followed by full series).
- **Initial Visualization Interface:**
  - Leaflet 2D dark basemap displaying station pins, temperature gradient overlays, and initial Deck.gl column tests.

---

## Phase 2: Scalable 4D Engine, Transparent Routing & Complete BGC Integration
**Status:** `Completed & Operational Prototype`  
**Focus:** Expanding to full global ocean physics and biogeochemistry, transparent date routing, OS demand-paging virtual memory, non-blocking background fetching, and progressive 4D WebGL streaming.

### 2.1 Key Deliverables
- **Unified 12-Variable Physical & Biogeochemical Catalogue:**
  - **Physics:** Potential Temperature (`thetao`), Salinity (`so`), Eastward Velocity (`uo`), Northward Velocity (`vo`), Sea Surface Height (`zos`).
  - **Biogeochemistry (BGC):** Chlorophyll-a (`chl`), Nitrate (`no3`), Phosphate (`po4`), Silicate (`si`), Dissolved Oxygen (`o2`), Acidity (`ph`), Partial Pressure of CO2 (`spco2`).
  - Stored in specialized multi-tier stores: `output/phy_data.zarr` and `output/bgc_data.zarr`.
- **Transparent Copernicus Date Router (`router.py`):**
  - Configurable 400-day lag cutoff between **Near-Real-Time Analysis & Forecast** (`GLOBAL_ANALYSISFORECAST_PHY_001_024` / `BGC_001_028`) and **Multi-Year Historical Reanalyses** (`GLOBAL_MULTIYEAR_PHY_001_030` GLORYS12 / `BGC_001_029`).
  - Automated lookback logic compensating for Copernicus daily publication delays ($24 - 36\,\text{h}$).
  - Canonical variable aliasing supporting human terms (`temperature`, `oxygen`) and NetCDF variables.
- **OS-Style 4D Virtual Memory Page Table (`page_table.py`):**
  - Discrete 4D page coordinates ($4^\circ\text{lat} \times 4^\circ\text{lon} \times 2\,\text{m depth} \times 1\,\text{day time}$).
  - State machine: `NOT_FETCHED` $\rightarrow$ `FETCHING` $\rightarrow$ `ON_DISK` $\rightarrow$ `RESIDENT`.
  - Multi-dimensional range diffing identifying missing vs. resident data in sub-milliseconds.
  - Thread-safe LRU eviction engine maintaining disk usage under `ZARR_CAP_BYTES = 4GB`.
  - Directional scrub/pan lookahead prefetching.
- **Non-Blocking Background Fetch Worker (`fetcher.py`):**
  - Cache misses return immediate `status: "fetching"` without stalling client event loops.
  - Asynchronously subsets and merges NetCDF data into local Zarr stores via `_write_to_zarr`.
- **Next-Gen RESTful & WebSocket API v3 (`main.py`):**
  - `GET /ocean/point` — Primary click-to-query endpoint returning Physics + BGC + Nearest Argo Float in $< 1\,\text{ms}$ on cache hit.
  - `GET /ocean/snapshot` — 3D bounding-box spatial matrix for map grid rendering.
  - `GET /ocean/timeline` — High-performance time-series extraction for any point, depth, and granularity (`day`, `week`, `month`).
  - `GET /argo/nearest` — Spatial Haversine search for Core & BGC Argo floats within 10–2000 km.
  - `GET /argo/profile` — Multi-sensor vertical depth profile extraction down to 2000m.
  - `GET /ocean/coverage` — Virtual memory page table state visualization.
  - `WS /ws/ocean-stream` — Progressive depth-by-depth 3D viewport streaming.
- **Interactive 3D Engine & Testing Cockpit (`frontend-test/index.html`):**
  - Synchronized Leaflet 2D + Deck.gl 3D WebGL column rendering with tilt (0–60°), azimuth rotation, and camera reset.
  - Interactive depth slider ($0 - 50\,\text{m}$ in $2\,\text{m}$ bins) and temporal presets (`yesterday`, `7d`, `30d`, `1y`).
  - Live OS virtual memory allocation HUD rendering depth page resident states.
  - Complete 18-endpoint automated test runner with JSON payload inspector.
  - Live two-way WebSocket testing console with real-time packet log.

---

## Phase 3: Production Web Portal, Advanced 3D Flow Shaders & Operational Alerts
**Status:** `Architectural Roadmap & Next Development Phase`  
**Focus:** Enhancing visual fidelity, particle flow simulation, high-resolution bathymetry, real-time ocean hazard alerts, and production cluster deployment.

### 3.1 Planned Deliverables
1. **GPU Particle Advection Flow Shader:**
   - Implement custom WebGL/WebGPU shaders rendering animated streamline particles for surface ocean currents ($u, v$ velocity vectors) with velocity-colored trails.
2. **Volumetric Ocean Raymarching & Isosurface Rendering:**
   - Full 3D volumetric rendering of thermoclines and haloclines, allowing users to peel away water layers to view underwater thermal plumes and internal wave phenomena.
3. **High-Resolution Seafloor Bathymetry Integration:**
   - Ingest GEBCO / ETOPO global bathymetric elevation data to render accurate undersea canyons, oceanic trenches, and continental shelves beneath the water column.
4. **Real-Time Ocean Hazard & Environmental Alerts:**
   - **Marine Heatwaves (MHW):** Automated detection of sustained sea surface temperature anomalies exceeding 90th percentile thresholds.
   - **Tropical Cyclone Track Overlays:** Correlating real-time cyclone storm tracks with underlying ocean heat content (OHC) and sea surface cooling wake.
   - **Harmful Algal Bloom (HAB) Tracking:** Early-warning indicators driven by chlorophyll-a spikes and nitrogen/phosphorus ratios.
5. **Production Cloud Architecture & Enterprise Deployment:**
   - Multi-container Docker & Kubernetes orchestration with separate API, caching, and worker pods.
   - Distributed Redis cluster replacing single-process L1 RAM cache for horizontal scaling.
   - Direct integration into the official INCOIS web portal and National Oceanographic Data Centre (NODC) GIS infrastructure.

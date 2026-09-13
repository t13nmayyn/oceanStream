# Project Requirement Details (PRD)
## Project Name: `oceanStream` — INCOIS 3D/4D Ocean Data Visualization Platform
**Problem Statement Reference:** SIH-26067 / Smart India Hackathon — Indian National Centre for Ocean Information Services (INCOIS)  
**Document Version:** 3.0.0  
**Status:** Active Development & Operational Prototype  

---

## 1. What to Build?

### 1.1 Executive Summary
`oceanStream` is a high-performance, low-latency, 3D and 4D oceanographic data exploration, streaming, and visualization platform. The system bridges massive, petabyte-scale oceanographic satellite and in-situ models—such as the **Copernicus Marine Environment Monitoring Service (CMEMS)**, **Argo profiling floats (Core & Biogeochemical)**, and **AODN/IMOS CTD moorings**—with high-speed web client consumers.

### 1.2 Core Problem Solved
Traditional oceanographic data access suffers from severe latency bottlenecks:
- **Massive File Sizes:** Gridded NetCDF/GRIB datasets routinely range from hundreds of megabytes to terabytes.
- **Slow Origin Queries:** Direct API calls to Copernicus Marine or Argo ERDDAP servers take 15 to 90+ seconds per query, making live, interactive 3D web applications unresponsive.
- **Complex Ingestion Silos:** Physical variables (temperature, salinity, ocean currents, sea level) and biogeochemical variables (chlorophyll, dissolved oxygen, nitrate, phosphate, pH, pCO2) are stored across divergent multi-year reanalyses and near-real-time forecast systems with varying publication delays.

### 1.3 The `oceanStream` Solution
`oceanStream` solves these challenges through:
1. **Tiered Caching & Demand Paging:** An operating-system-inspired 3-tier memory hierarchy (L1 RAM `<1ms`, L2 Chunked Zarr on disk `5–25ms`, and L3 background asynchronous fetch from origin APIs).
2. **4D Virtual Memory Page Table:** Dividing ocean space and time into discrete buckets (4° latitude × 4° longitude × 2m depth × 1-day temporal bins), tracking cache residence, handling non-blocking background fetching, and enforcing LRU disk eviction under a configurable storage cap (e.g., 4 GB).
3. **Transparent Date-Routed Engine:** Seamless switching between Near-Real-Time Analysis/Forecast (ANFC) datasets and Multi-Year Historical Reanalyses (GLORYS12), automatically accounting for Copernicus publication lag (~24–36 hours).
4. **Dual 2D/3D GPU Visualization & WebSocket Streaming:** Combining Leaflet GIS base layers with Deck.gl 3D WebGL column extrusions, progressive WebSocket data streaming (instant preview followed by full volumetric resolution), and interactive Chart.js time-series analytics.

---

## 2. Targeted Users & Persona Profiles

| User Persona | Role & Organization | Primary Needs & Use Cases | Pain Points Addressed |
|:---|:---|:---|:---|
| **Marine Scientists & Oceanographers** | Research institutes (e.g., INCOIS, NIO, CMFRI, NOAA) | Analyzing thermoclines, haloclines, ocean current shears, biogeochemical cycles (hypoxia, ocean acidification, primary productivity). | Eliminates waiting minutes for NetCDF subset downloads; provides instant depth slices and multi-variable correlation. |
| **Fisheries & Coastal Zone Managers** | State fisheries departments, Marine Protected Area (MPA) regulators | Monitoring Potential Fishing Zones (PFZ), chlorophyll-a blooms, coastal upwelling, and sea surface temperature anomalies. | Offers click-to-query coastal station monitoring and near-shore to deep-sea comparisons without specialized GIS software. |
| **Maritime Navigators & Port Authorities** | Commercial shipping lines, port trusts, naval operations | Real-time and forecasted ocean currents ($u, v$ velocity vectors), sea surface height anomalies ($zos$), and wave conditions for fuel-efficient route planning. | Real-time viewport querying and 10-day forecast windows with sub-second API responses. |
| **Disaster Management & SAR Teams** | Indian Coast Guard, National Disaster Response Force (NDRF) | Search-and-Rescue drift simulation, cyclone track surface temperature analysis, and extreme sea level rise monitoring. | Rapid bounding-box snapshots, instant point telemetry, and nearest Argo float validation. |
| **Data Engineers & Climate App Developers** | Earth observation developers, hydrographic startups | Clean, unified RESTful and WebSocket APIs serving standardized JSON and binary data without dealing with raw HDF5/NetCDF files. | Unified endpoint structure (`/ocean/*`, `/argo/*`) with automated date resolution and Swagger OpenAPI documentation. |

---

## 3. Detailed Features & Specifications

### 3.1 Tiered Virtual Memory & Data Routing
- **L1 In-Memory Cache (RAM):**
  - Instant hash-lookup cache for point and profile queries with sub-millisecond retrieval latency (`< 1 ms`).
  - Configurable Time-To-Live (TTL = 300 seconds / 5 minutes) and programmatic cache flush (`POST /api/cache-clear`).
- **L2 High-Density Zarr Storage (Disk):**
  - Multidimensional chunked Zarr stores (`phy_data.zarr`, `bgc_data.zarr`, `argo_data.zarr`, and legacy `ocean_data.zarr`).
  - Chunk layout optimized for spatial-temporal slices (`time: 1, latitude: 50, longitude: 50`).
  - Access latency: 5–25 ms.
- **L3 Cold Origin Background Fetching:**
  - On a cache miss, requests are **never blocked**. The API returns an immediate `status: "fetching"` response with estimated wait times while an asynchronous asyncio background task streams and ingests data from Copernicus/Argo.
- **OS-Style Demand-Paging (`PageTable`):**
  - Tracks 4D page coordinates: `(lat_bucket, lon_bucket, depth_bucket, time_bucket)`.
  - State machine: `NOT_FETCHED` $\rightarrow$ `FETCHING` $\rightarrow$ `ON_DISK` $\rightarrow$ `RESIDENT`.
  - **Range Diffing:** Deconstructs bounding boxes and depth spans into resident vs. missing buckets.
  - **LRU Disk Eviction:** Enforces strict disk quotas (`ZARR_CAP_BYTES = 4GB`), evicting least-recently-accessed pages when capacity thresholds are reached.
  - **Scrub & Pan Prefetching:** Directional lookahead prefetching based on user pan/depth scrub velocities.
- **Transparent Copernicus Date Routing:**
  - Automated switching between:
    - **Analysis & Forecast (ANFC):** `GLOBAL_ANALYSISFORECAST_PHY_001_024` & `GLOBAL_ANALYSISFORECAST_BGC_001_028` (for dates $< 400$ days old and up to 10 days into the future).
    - **Multi-Year Historical Reanalysis (MY / GLORYS12):** `GLOBAL_MULTIYEAR_PHY_001_030` & `GLOBAL_MULTIYEAR_BGC_001_029` (for dates $> 400$ days ago).
  - **Publication Lag Fallback:** Automated lookback (up to 5 days) for `"today"` queries to gracefully serve the latest released ocean analysis without returning 404/empty sets.

### 3.2 Physics & Biogeochemistry (BGC) Variables
The platform unifies 12 essential oceanographic variables:

| Category | Canonical Variable | Display Name | Standard Unit | Source Product |
|:---|:---|:---|:---|:---|
| **Physics** | `thetao` | Sea Water Potential Temperature | °C | CMEMS PHY (ANFC / MY) |
| **Physics** | `so` | Sea Water Salinity | PSU (Practical Salinity Units) | CMEMS PHY (ANFC / MY) |
| **Physics** | `uo` | Eastward Ocean Current Velocity | m/s | CMEMS PHY (ANFC / MY) |
| **Physics** | `vo` | Northward Ocean Current Velocity | m/s | CMEMS PHY (ANFC / MY) |
| **Physics** | `zos` | Sea Surface Height Above Geoid | m | CMEMS PHY (ANFC / MY) |
| **BGC** | `chl` | Mass Concentration of Chlorophyll-a | mg/m³ | CMEMS BGC (ANFC / MY) |
| **BGC** | `no3` | Nitrate Concentration | mmol/m³ | CMEMS BGC (ANFC / MY) |
| **BGC** | `po4` | Phosphate Concentration | mmol/m³ | CMEMS BGC (ANFC / MY) |
| **BGC** | `si` | Silicate Concentration | mmol/m³ | CMEMS BGC (ANFC / MY) |
| **BGC** | `o2` | Dissolved Oxygen Concentration | mmol/m³ | CMEMS BGC (ANFC / MY) |
| **BGC** | `ph` | Ocean Acidity (pH scale) | pH units | CMEMS BGC (ANFC / MY) |
| **BGC** | `spco2` | Surface Partial Pressure of Carbon Dioxide | µatm | CMEMS BGC (ANFC / MY) |

### 3.3 In-Situ Observation & Float Integration
- **Core Argo Integration:** Ingests CTD profiles (temperature and salinity) up to 2000m depth from global Argo floats via `argopy`.
- **BGC-Argo Integration:** Ingests expert-mode biogeochemical float profiles (dissolved oxygen, chlorophyll, nitrate, pH).
- **AODN/IMOS CTD Mooring Integration:** Local NetCDF parser and serving pipeline for high-frequency mooring instruments (e.g., SBE37SM Coral Sea PIL100 station).
- **Spatial Nearest-Float Discovery:** Real-time Haversine distance spatial indexing (`/argo/nearest`) finding instruments within user-specified radii (10–2000 km).
- **Vertical Depth Profiling:** Full vertical depth profile extraction (`/argo/profile`) paired with temperature, salinity, and BGC distributions.

### 3.4 Interactive Map & 3D Web Engine
- **2D Cartographic Basemap:** Leaflet.js with CartoDB Dark Matter tiles, responsive pan/zoom, bounding-box synchronizer, and station markers.
- **3D WebGL/WebGPU Deck.gl Layer:**
  - High-performance column and voxel rendering of gridded ocean temperatures and properties.
  - Interactive 3D camera controls: pitch/tilt (0° to 60°), azimuth rotation (-180° to 180°), zoom, and altitude extrusion.
- **Interactive Depth Slicing:** Dynamic dual-bin depth slider filtering ocean layers from sea surface (`0m`) down to bathyal depths (`50m+`) in 2-meter increments.
- **Time Slice & Timeline Presets:** Single-click temporal filtering (`yesterday`, `7d`, `30d`, `1y`) with calendar date pickers.
- **Interactive Click-to-Query:** Direct map-click inspection querying `/ocean/point`, displaying physics, BGC, and the nearest in-situ Argo float in an overlay HUD.
- **Demand-Paging Memory Grid:** Live visual HUD rendering the OS virtual page table allocation across depth buckets (color-coded as Resident, On-Disk, Fetching, or Not-Fetched).

### 3.5 Progressive WebSocket Streaming
- **Progressive Coastal Temperature Stream (`/ws/coastal-temps`):**
  - **Stage 1 (Instant Preview):** Emits the most recent 5 time points in `< 5ms`.
  - **Stage 2 (Full Resolution):** Emits the complete multi-month historical time series without blocking.
- **Progressive Viewport Stream (`/ws/ocean-stream`):**
  - Emits stream initiation headers with resident vs. missing page counts.
  - Iterates through depth buckets, streaming individual horizontal grid layers sequentially for progressive 3D rendering.
  - Emits asynchronous background fetching notifications for missing chunks.
  - Emits final stream completion metrics with total elapsed transfer latency.

### 3.6 API Test Suite & Developer Console
- Embedded 18-endpoint test runner directly in the web UI.
- Live WebSocket interactive terminal with payload editing and stream message inspection.
- Interactive Swagger/OpenAPI documentation at `/docs`.

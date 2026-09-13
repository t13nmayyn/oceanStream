# Engineering Rules & Architectural Guidelines
## Project: `oceanStream` — INCOIS 3D/4D Ocean Data Platform
**Document Version:** 3.0.0  
**Enforcement:** Mandatory for all contributors and automated agents  

---

## 1. What to Use (Approved Patterns & Best Practices)

### 1.1 Backend & Async Concurrency
1. **Always Use Non-Blocking Background Tasks for Origin Ingestion:**
   - Origin APIs (Copernicus Marine, Argo ERDDAP) require 15–90+ seconds to respond. **Never await an origin fetch directly in an HTTP request handler.**
   - Dispatch downloads using `asyncio.create_task()`, register the task in `_fetch_tasks[page_key]`, and immediately return `status: "fetching"` with an HTTP 200 payload.
2. **Strict 3-Tier Storage Hierarchy Resolution:**
   - Every spatial/temporal data read must follow the strict progression:
     $$\text{L1 RAM Cache} \longrightarrow \text{L2 Local Zarr Store} \longrightarrow \text{L3 Asynchronous Origin Fetch}$$
   - When data is loaded from L2, immediately promote the slice into L1 RAM with a 300-second TTL.
3. **OS-Style Virtual Memory Page Table for Spatial Tracking:**
   - Always route bounding-box and timeline queries through `page_table.diff()` to compute exact resident vs. missing page sets.
   - Always touch accessed pages (`page_table.touch(page_id)`) to keep access timestamps fresh for LRU tracking.
4. **Coordinate Normalization & Float Sanitization:**
   - Datasets may label coordinates as `lat`/`latitude` and `lon`/`longitude`. Always resolve coordinate names via `_lat_coord(ds)` and `_lon_coord(ds)`.
   - Oceanographic datasets contain missing values and fill-values (`_FillValue = 1e20`, `NaN`, `Inf`). Always wrap output floating-point values in `_safe_float()`. JSON does not support `NaN` or `Infinity`; returning un-sanitized floats will crash client JSON parsers.
5. **Standardized Variable Aliasing via `router.py`:**
   - User inputs can be human-readable (`temperature`, `salinity`, `chlorophyll`) or canonical NetCDF variable codes (`thetao`, `so`, `chl`). Always resolve variables using `resolve_variables()` in `router.py`.
6. **Smart Publication Lag Lookback:**
   - Never assume today's ocean forecast is available at 00:00 UTC. Always use `resolve_date_input()` to step back up to 5 days if near-real-time assimilation is lagging.
7. **Thread-Safe File Merging & Atomic Writes:**
   - When writing or appending new slices to `.zarr` stores, write to a temporary path (e.g., `_{name}_tmp`) and perform an atomic rename to prevent corrupted stores if a fetch is interrupted.

---

### 1.2 Frontend & Visualization Engine
1. **Lightweight, Zero-Build Vanilla Architecture:**
   - Use standard modern HTML5, ES6+ JavaScript, and Vanilla CSS. Avoid heavy build tooling (Webpack/Vite/React) unless explicitly mandated, ensuring immediate browser testability and zero deploy latency.
2. **Unified CSS Design Tokens:**
   - All colors, borders, fonts, and elevations must reference the centralized `:root` variables in `design.md` (e.g., `var(--bg)`, `var(--surface)`, `var(--accent)`, `var(--mono)`).
3. **Hardware-Accelerated WebGL/WebGPU Rendering:**
   - Use **Deck.gl** (`ColumnLayer` / `GridCellLayer`) for 3D volumetric extrusion and rendering tens of thousands of ocean grid points at 60 FPS.
4. **Progressive Rendering & Chunked Updates:**
   - For 3D volumetric scenes, render the surface slice (`depth = 0m`) immediately while deeper bathymetric layers stream in via WebSockets.
5. **Defensive DOM & Element Safety:**
   - Always verify DOM element existence before binding event listeners or initializing WebGL contexts to prevent white-screen crashes.

---

## 2. What to Avoid (Strict Anti-Patterns & Prohibitions)

### 2.1 Backend Anti-Patterns
1. **DO NOT Run Synchronous Blocking Operations in Async Handlers:**
   - Never call `time.sleep()`, synchronous `requests.get()`, or un-chunked file I/O inside `async def` endpoints. Use `asyncio.sleep()` or run heavy CPU/IO bound tasks in `run_in_executor()`.
2. **DO NOT Query Raw NetCDF Files on High-Frequency Request Paths:**
   - NetCDF4 and HDF5 files are too slow for concurrent random-access HTTP queries. Always ingest and re-chunk data into high-performance **Zarr stores** before serving API consumers.
3. **DO NOT Allow Unbounded Disk or Memory Growth:**
   - Never append to `.zarr` stores without verifying disk footprint against `ZARR_CAP_BYTES` (default 4 GB).
   - Never store arbitrary large payloads in L1 RAM without TTL expiration (`L1_TTL_SECONDS`).
4. **DO NOT Hardcode Dates, Coordinates, or Dataset IDs in Endpoints:**
   - Never hardcode dataset names like `cmems_mod_glo_phy_anfc_0.083deg_P1D-m` inside endpoint controllers. Always import them from `router.py`.
5. **DO NOT Delete or Overwrite Legacy Backward-Compatible Endpoints:**
   - The platform preserves legacy Phase 1 endpoints (`/api/coastal-temps`, `/api/depth-profile`, `/api/argo-floats`, `/api/aodn-data`). Modifying their route signatures or removing them breaks existing validation scripts.
6. **DO NOT Commit Credentials to Version Control:**
   - Never commit `COPERNICUSMARINE_SERVICE_USERNAME` or `COPERNICUSMARINE_SERVICE_PASSWORD` to git. Keep them strictly in `.env`.

---

### 2.2 Frontend Anti-Patterns
1. **DO NOT Block the UI Thread with Heavy Computations:**
   - Never perform dense spatial interpolation or million-point loops synchronously in the main JavaScript thread. Offload heavy filtering to the backend or use Deck.gl GPU shader filters.
2. **DO NOT Use Generic, High-Latency CDN Scripts:**
   - Use specific, pinned versions of third-party libraries (Leaflet 1.9.4, Deck.gl 9.0.18, Chart.js 4.4.4) with preconnect and dns-prefetch tags in the HTML header.
3. **DO NOT Hardcode Absolute Localhost URLs in Frontend Scripts:**
   - Always resolve the API base dynamically:
     ```javascript
     const isHttp = window.location.protocol.startsWith("http");
     const API = isHttp ? window.location.origin : "http://localhost:8000";
     ```
   - This ensures the UI works identically whether served via FastAPI static mount, proxy, or standalone file.
4. **DO NOT Overload WebSocket Channels:**
   - Debounce viewport pan and zoom events (minimum 300ms debounce) before emitting spatial bounding-box stream requests over WebSockets.

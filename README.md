# oceanStream — Backend API

High-performance ocean data API with tiered caching, transparent Copernicus dataset routing, Argo float integration, and progressive WebSocket streaming.

---

## Architecture

```
L1 Cache  (RAM dict, TTL 5 min)      < 1 ms
    ↓ miss
L2 Cache  (Zarr on disk)             5–25 ms
    ↓ miss
L3 Origin (Copernicus + Argo APIs)   triggered in background, never blocks request
```

### Dataset Routing (transparent to callers)

| Date range | Physics dataset | BGC dataset |
|:---|:---|:---|
| Recent / future (< ~13 months ago) | `GLOBAL_ANALYSISFORECAST_PHY_001_024` | `GLOBAL_ANALYSISFORECAST_BGC_001_028` |
| Historical (older than ~13 months) | `GLOBAL_MULTIYEAR_PHY_001_030` | `GLOBAL_MULTIYEAR_BGC_001_029` |

The routing cutoff is configurable via `MULTIYEAR_LAG_DAYS` in `router.py`.

### Zarr stores

| File | Contents |
|:---|:---|
| `backend/output/phy_data.zarr` | Physics: temperature, salinity, currents, sea level |
| `backend/output/bgc_data.zarr` | BGC: chlorophyll, nitrate, phosphate, silicate, oxygen, pH, pCO2 |
| `backend/output/ocean_data.zarr` | Legacy (thetao only — backward compat) |
| `backend/output/argo_data.zarr` | Argo float profiles |

---

## Quick Start

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

Log in to Copernicus Marine (free account required):

```bash
copernicusmarine login
```

### 2. Start the server

From the repository root:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or from the `backend/` directory:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs: **http://localhost:8000/docs**

---

## API Endpoints

### New endpoints (v3)

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/ocean/point` | Click-to-query: returns physics + BGC + nearest Argo float. Checks page table; returns instantly if cached, else marks `FETCHING` and streams once resolved. |
| `GET` | `/ocean/snapshot` | Bounding box + depth + date → grid payload for map / surface rendering |
| `GET` | `/ocean/timeline` | Time series at a point or region — powers all chart use cases |
| `GET` | `/argo/nearest` | Argo floats near a clicked point (Core, BGC, or both) |
| `GET` | `/argo/profile` | Depth-ordered profile with all BGC fields |
| `GET` | `/ocean/coverage` | Page-table state for a region (debug / visualisation) |

### `/ocean/point` parameters

| Param | Type | Default | Description |
|:---|:---|:---|:---|
| `lat` | float | required | Latitude |
| `lon` | float | required | Longitude |
| `depth` | float | `0.0` | Depth in metres |
| `date` | string | today | ISO date `YYYY-MM-DD` |

**Response shape:**
```json
{
  "status": "ok | fetching",
  "cache": "L1_RAM | L2_ZARR | FRESHLY_FETCHED",
  "physics": { "temperature_c": 28.5, "salinity_psu": 34.2, "current_u_ms": 0.1, "current_v_ms": -0.05, "sea_level_m": 0.12 },
  "bgc":     { "chlorophyll_mgl": 0.3, "nitrate_mmolm3": 1.2, "oxygen_mmolm3": 215.0, "ph": 8.1, "pco2_uatm": 390.0 },
  "nearest_argo_float": { "platform_number": "1234567", "distance_km": 45.2, "type": "core" },
  "dataset_info": { "phy_dataset": "...", "bgc_dataset": "...", "product_type": "analysisforecast" }
}
```

### `/ocean/snapshot` parameters

| Param | Description |
|:---|:---|
| `lat_min`, `lat_max`, `lon_min`, `lon_max` | Bounding box |
| `depth` | Depth in metres (default 0) |
| `date` | ISO date (default today) |

### `/ocean/timeline` parameters

| Param | Description |
|:---|:---|
| `lat`, `lon`, `depth` | Point coordinates |
| `date_start`, `date_end` | ISO date range |
| `granularity` | `day` / `week` / `month` / `year` |
| `variables` | Comma-separated: `temperature,salinity,chlorophyll,oxygen,nitrate,ph,pco2,...` |

### `/argo/nearest` parameters

| Param | Description |
|:---|:---|
| `lat`, `lon` | Query point |
| `radius_km` | Search radius (default 200) |
| `type` | `core` / `bgc` / `both` |
| `date` | ISO date for time window |

### `/argo/profile` parameters

| Param | Description |
|:---|:---|
| `platform_number` | Argo platform number |
| `date` | ISO date for time window (optional) |

**Profile fields:** `depth_m`, `temperature_c`, `salinity_psu`, `oxygen_mmolm3`, `chlorophyll_mgl`, `nitrate_mmolm3`, `ph`, `timestamp`

---

## Legacy endpoints (preserved)

| Endpoint | Description |
|:---|:---|
| `GET /api/coastal-temps` | Temperature series for 5 coastal stations |
| `GET /api/depth-profile` | Vertical profile at a fixed station |
| `GET /api/argo-floats` | Flat list of Argo measurements |
| `GET /api/argo-profiles` | Profiles grouped by platform |
| `GET /api/argo-slider` | Argo positions filtered by date range |
| `GET /api/aodn-data` | AODN CTD mooring data |
| `GET /api/ocean-overview` | Bounding-box stats |
| `GET /api/cache-stats` | L1/L2/fetch telemetry |
| `POST /api/cache-clear` | Flush L1 RAM cache |
| `WS /ws/coastal-temps` | Progressive WebSocket (preview → full) |
| `WS /ws/ocean-stream` | Streaming point fetch via WebSocket |

---

## Project structure

```
Ocean067/
├── backend/
│   ├── main.py          # FastAPI app — all endpoints
│   ├── router.py        # Transparent dataset routing by date
│   ├── fetcher.py       # On-demand Copernicus fetch (PHY + BGC)
│   ├── argo.py          # Core Argo, BGC-Argo, AODN CTD
│   ├── page_table.py    # OS-style page table (spatial + depth + date)
│   ├── data_fetch.py    # One-time offline batch ingestion (legacy)
│   └── requirements.txt
├── frontend-test/
│   └── index.html       # Test UI
├── aodn_output/         # AODN CTD NetCDF (run new.py once)
├── main.py              # Root-level uvicorn proxy
└── README.md
```

### Argo data sources

| Source | Variables | Access |
|:---|:---|:---|
| Core Argo | temperature, salinity | argopy `mode=standard` |
| BGC-Argo | oxygen, nitrate, chlorophyll, pH | argopy `mode=expert` |
| AODN/IMOS CTD | temperature, salinity, depth | Local NetCDF (`aodn_output/`) |

Run `python new.py` once to download the AODN CTD dataset.

---

## Configuration

| Environment variable | Default | Description |
|:---|:---|:---|
| `COPERNICUSMARINE_SERVICE_USERNAME` | — | Copernicus credentials (in `.env`) |
| `COPERNICUSMARINE_SERVICE_PASSWORD` | — | Copernicus credentials (in `.env`) |
| `ZARR_CAP_BYTES` | `4294967296` (4 GB) | Max disk usage for zarr stores |

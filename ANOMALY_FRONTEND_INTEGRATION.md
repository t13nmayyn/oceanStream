# Ocean Anomaly Integration

## Backend Endpoint

Target endpoint requested by the ML specification:

`GET /ocean/anomaly?lat=&lon=&depth=&date=`

Current backend inspection result:

- `Ocean067_AI/` contains `GPU_Temperature_Model/` artifacts only.
- No `Ocean067_AI/anomaly.py` file is present.
- No `climatology.zarr` store is present in `Ocean067_AI/`.
- `backend/main.py` does not expose `GET /ocean/anomaly`.
- Existing AI anomaly code is `POST /api/ai/anomaly` in `backend/ai_inference.py`; it compares observed temperature against the Argo temperature regression model and is not the requested GLORYS12 temperature/chlorophyll climatology point endpoint.

Backend dependency still required:

`GET /ocean/anomaly` must be implemented in the Python backend before real anomaly results can render.

## Actual Response Schema

No actual response schema was discoverable for `GET /ocean/anomaly` because the endpoint is not currently exposed.

Existing unrelated schema in `POST /api/ai/anomaly`:

- Request: `latitude`, `longitude`, `pressure_dbar`, `salinity_psu`, `date`, `observed_temperature`
- Response: `predicted_temperature_C`, `observed_temperature_C`, `anomaly_C`, `absolute_anomaly_C`, `anomaly_score`, `is_anomaly`, `direction`, `anomaly_threshold_C`

The frontend does not use this unrelated endpoint for the requested anomaly workflow.

## Node Gateway Route

Added:

`GET /api/ocean/anomaly`

Required parameters:

- `lat`: number, `-90..90`
- `lon`: number, `-180..180`
- `depth`: number, `0..11000`
- `date`: `YYYY-MM-DD`

Behavior:

- Validates query parameters in Node.
- Proxies to Python `GET /ocean/anomaly`.
- Preserves the Python JSON response without recalculating scientific values.
- Preserves upstream error status, including Python `404` while the backend endpoint is unavailable.
- Converts timeout to `504`.
- Converts empty upstream anomaly response to `502`.

## Frontend API Function

Added:

`getOceanAnomaly({ lat, lon, depth, date, signal })`

Location:

`frontend/src/services/oceanApi.js`

Behavior:

- Uses `VITE_NODE_API_URL` via `NODE_API_BASE`.
- Calls `GET /api/ocean/anomaly`.
- Supports `AbortSignal`.
- Throws on gateway/backend/network/empty-response errors.
- Does not call Python port `8000` directly.

## Analyze Mode Flow

Integrated into existing Ocean Detail workspace:

`OceanDetailPage -> OceanWorkspace -> AnomalyAnalysisPanel`

Flow:

- Visible only when `userMode === "analyze"` and a point is selected.
- Uses existing selected point, selected depth, and selected date context.
- Does not poll.
- Does not request on render.
- User clicks `Run analysis`.
- Request is debounced by user action, protected against stale responses, and cancellable.
- Same point/depth/date result is cached in the component to avoid duplicate requests.

## UI Fields

The UI displays real returned fields only. It supports likely backend aliases for:

- `anomaly_flag` / `is_anomaly`
- `severity` / `anomaly_severity`
- `temperature_z`
- `chlorophyll_z`
- temperature historical baseline
- chlorophyll historical baseline
- salinity anomaly only if the backend returns it

If `anomaly_flag === false`, the UI says:

`No significant anomaly detected at this location and time.`

If the endpoint is missing, the UI says:

`Waiting for backend endpoint /ocean/anomaly`

No fake anomaly values, salinity contributions, or map markers are generated.

## Argo Comparison Flow

When a real anomaly response returns `anomaly_flag === true`, the UI shows:

`Compare with Argo`

Flow:

- Uses existing `getNearestArgoFloats(...)`.
- Selects the nearest returned float.
- Uses existing `getArgoProfile(...)`.
- Displays nearby Argo observation details and the nearest profile level.
- Labels this as `Model vs observation` and does not imply validation.

Related gateway change:

- Existing Node Argo routes were mounted at `/api/argo`.
- `getNearestArgoFloats` and `getArgoProfile` now use `VITE_NODE_API_URL`.

## Copilot Context

Extended `OceanStreamCopilot` context only after a real anomaly response exists.

Fields passed:

- `anomaly_flag`
- `severity`
- `temperature_z`
- `chlorophyll_z`
- `historical_baseline`
- anomaly `date`
- anomaly `depth`

The Copilot UI and `/api/ai/chat` integration were not changed.

## Missing/Unavailable Fields

Current missing backend pieces:

- `Ocean067_AI/anomaly.py`
- `climatology.zarr`
- `GET /ocean/anomaly`
- Actual temperature/chlorophyll z-score response schema
- Any backend-provided salinity anomaly field
- Any spatial anomaly map/marker endpoint

Salinity behavior:

- If `salinity_z`, `salinity_zscore`, or `salinity_contribution` is returned, it is displayed.
- Otherwise the UI shows salinity anomaly as unavailable from the current anomaly model.

## Validation Results

Static validation completed:

- Gateway route added for `GET /api/ocean/anomaly`.
- Frontend service uses `NODE_API_BASE` for anomaly.
- React anomaly component does not call Python directly.
- No fake values are generated in React.
- Missing endpoint state is distinct from no-anomaly state.

Runtime endpoint validation:

- Gateway health passed on `http://localhost:3002/health`.
- `GET /api/ocean/anomaly?lat=13.08&lon=80.27&depth=0&date=2026-09-19` returned `404`, matching the inspected Python backend state where `GET /ocean/anomaly` is not exposed.
- A real success response could not be validated until the Python backend implements `GET /ocean/anomaly`.
- The implemented UI will show the unavailable state until the Python backend exposes the endpoint.

## Files Changed

- `backend/server/src/types/ocean.types.ts`
- `backend/server/src/services/pythonOcean.service.ts`
- `backend/server/src/controllers/ocean.controller.ts`
- `backend/server/src/routes/ocean.routes.ts`
- `backend/server/src/app.ts`
- `frontend/src/services/oceanApi.js`
- `frontend/src/services/argoApi.js`
- `frontend/src/context/AppContext.jsx`
- `frontend/src/components/ocean/OceanWorkspace.jsx`
- `frontend/src/components/scientist/AnomalyAnalysisPanel.jsx`
- `frontend/src/components/copilot/OceanStreamCopilot.jsx`
- `ANOMALY_FRONTEND_INTEGRATION.md`

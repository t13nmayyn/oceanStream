# OceanStream API Integration Map

## Backend Endpoints

| # | Method | Endpoint | Purpose | Response | Node Gateway | Frontend Consumer | Status |
|---|--------|----------|---------|----------|--------------|-------------------|--------|
| 1 | GET | `/ocean/point` | Data for single coordinate | Physics & BGC point data | Yes (`/api/ocean/point`) | `PointInspector`, `OceanStreamCopilot` | A (Connected & Working) |
| 2 | GET | `/ocean/snapshot` | Spatial 2D grid/heatmap | Grid data array | No | `GlobeGlViewer` (via `oceanThermalField.js`) | B (Partially connected) |
| 3 | GET | `/ocean/timeline` | Timeseries for a point | Timeseries data array | No | `TimelineView`, `AnalyticsPage` | A (Connected) |
| 4 | GET | `/ocean/depth-profile`| Vertical profile column | Depth profile array | No | None yet | C (Backend exists) |
| 5 | GET | `/ocean/section` | Cross-section slice | 2D Section array | No | None yet | C (Backend exists) |
| 6 | GET | `/ocean/volume` | 3D voxel volume | 3D array | No | None yet | C (Backend exists) |
| 7 | GET | `/ocean/coverage` | Data coverage bounds | Bbox / coverage info | No | `GlobeGlViewer` / Global | B (Partially connected) |
| 8 | GET | `/ocean/prewarm_status`| Cache prewarming state | Status / Progress | No | None yet | F (Internal/Infrastructure) |
| 9 | GET | `/argo/nearest` | Find nearest Argo float | Distance & platform ID | No | `ArgoView` | A (Connected) |
| 10| GET | `/argo/profile` | Argo vertical profile | Sensor depth array | No | `ArgoView`, `ArgoProfilePanel` | A (Connected) |
| 11| GET | `/argo/floats/active` | List of active floats | Float array & coords | No | None yet | C (Backend exists) |
| 12| GET | `/argo/trajectory` | Argo path over time | Coordinate list | No | None yet | C (Backend exists) |
| 13| GET | `/glider/nearest` | Find nearest glider | Distance & platform ID | No | None yet | C (Backend exists) |
| 14| GET | `/glider/profile` | Glider vertical profile | Sensor depth array | No | None yet | C (Backend exists) |
| 15| GET | `/glider/trajectory`| Glider path over time | Coordinate list | No | None yet | C (Backend exists) |
| 16| GET | `/ctd/moorings` | Fixed CTD moorings | Mooring array | No | None yet | C (Backend exists) |
| 17| GET | `/ctd/timeseries` | CTD temporal data | Timeseries data array | No | None yet | C (Backend exists) |
| 18| GET | `/observation/active` | All active platforms | Multi-platform array | No | None yet | C (Backend exists) |
| 19| POST| `/api/ai/chat` | Copilot Gemini integration| AI response & actions | Yes | `OceanStreamCopilot` | A (Connected & Working) |

---

## Frontend Data Flow

Currently, the data flow is highly fragmented:
1. **Global State**: `AppContext` maintains global state for `selectedDepth`, `selectedDate`, `userMode`, and UI visual toggles.
2. **Local State**: Coordinates (`lat`, `lon`) are often maintained locally within `OceanWorkspace` or `CesiumGlobe` rather than globally, which are passed down as props to `PointInspector` and `OceanStreamCopilot`.
3. **Fetching**: 
   - Some components (`OceanStreamCopilot`) call Node gateway routes.
   - Some components (`TimelineView`, `PointInspector`) bypass utility files and `fetch` directly from Python `API_BASE`.
   - `GlobeGlViewer` fetches `snapshot` data from Python, but blends it with hardcoded mock analytical data via `oceanThermalField.js`.

---

## Mock/Static Data

The following mock implementations currently exist in the frontend and should be fully replaced by the actual Python backend:
1. **`src/utils/oceanThermalField.js`**: Contains highly complex analytical mock formulas (`getOceanVariableValue`) for Temperature, Salinity, Chlorophyll, Dissolved Oxygen, Currents, and pH. 
   - *Replacement*: Rely entirely on `/ocean/snapshot` and `/ocean/point` for this data.
2. **`src/utils/streamlineEngine.js`**: Relies on `getOceanCurrentVelocity` (mock analytical formula) to advect particles.
   - *Replacement*: Use the real `current_u` and `current_v` vector grids from the backend snapshot data.

---

## Existing API Utilities

These reusable utilities exist but are being ignored by some components:
- `src/services/oceanApi.js`: `getOceanPoint`, `getOceanSnapshot`, `getOceanTimeline`, `getOceanCoverage`, `getDateInfo`
- `src/services/argoApi.js`: `getNearestArgoFloats`, `getArgoProfile`, `getActiveArgoFloats`
- `src/services/copilotApi.js`: `sendCopilotMessage`

---

## Missing Gateway Routes

While we shouldn't automatically proxy all 19 endpoints, the following **genuinely need Node gateway support**:
1. **`GET /api/ocean/snapshot`**: This endpoint returns heavy 2D grid arrays. The Node gateway could implement GZIP/Brotli compression, Redis caching, or downsampling based on the viewport to prevent the frontend from locking up.
2. **`GET /api/ocean/timeline`**: Frequently polled when a user scrubs the timeline slider. Node-level caching would drastically reduce load on the Python xarray computation.
3. **`GET /api/ocean/coverage`**: An essential app-startup config endpoint that could be statically cached at the Node layer.

*Note: Endpoints like `/argo/nearest` or `/ocean/depth-profile` are lightweight enough that they can remain direct to Python (or pass through a generic proxy router without custom logic).*

---

## Endpoint-to-Component Mapping

| Endpoint | Target Component / Hook |
|----------|-------------------------|
| `GET /ocean/point` | `oceanApi.js` → `PointInspector.jsx`, `OceanStreamCopilot.jsx` |
| `GET /ocean/snapshot` | `oceanApi.js` → `GlobeGlViewer.jsx`, `CesiumGlobe.jsx`, `oceanThermalField.js` (for texture gen) |
| `GET /ocean/timeline` | `oceanApi.js` → `TimelineView.jsx`, `AnalyticsPage.jsx`, `ScientificTimelineChart.jsx` |
| `GET /ocean/depth-profile`| `ScientistExplorer.jsx` (New integration needed) |
| `GET /argo/nearest` | `argoApi.js` → `ArgoView.jsx` |
| `GET /argo/profile` | `argoApi.js` → `ArgoView.jsx`, `ArgoProfilePanel.jsx` |
| `GET /argo/floats/active` | `argoApi.js` → `MapHUD.jsx`, `ArgoLayer.jsx` |
| `POST /api/ai/chat` | `copilotApi.js` → `OceanStreamCopilot.jsx` |

*(Remaining Glider/CTD/Section endpoints require new UI components for the Scientist Mode).*

---

## Integration Risks

- **Duplicate Direct Fetches**: Components like `TimelineView.jsx` (line 53) and `PointInspector.jsx` (line 50, 67) contain hardcoded `fetch()` calls bypassing the `oceanApi.js` utilities entirely.
- **Inconsistent Base URLs**: Mixing `${API_BASE}` (Python) and `${NODE_API_BASE}` (Node) randomly inside components.
- **Race Conditions**: When panning the globe, rapid re-renders will trigger multiple `/ocean/snapshot` requests. Needs a debounce or `AbortController` in `oceanApi.js`.
- **State Fragmentation**: `lat`/`lon` are not in `AppContext`, leading to props drilling and potential mismatch between what the Copilot context sees and what the `PointInspector` sees.
- **Client-side Bottleneck**: `oceanThermalField.js` relies on heavy `getImageData` CPU interpolation which may lag if backend `gridData` payloads get too large.

---

## Recommended Integration Order

**Phase 1: Cleanup & Standardization (Immediate)**
- Strip hardcoded `fetch()` calls out of `TimelineView`, `PointInspector`, `ArgoView`, and `AnalyticsPage`.
- Force all components to route through `oceanApi.js` and `argoApi.js`.

**Phase 2: Remove Analytical Mocks**
- Deprecate `getOceanVariableValue` in `oceanThermalField.js`.
- Rewire `streamlineEngine.js` and `generateTextureFromGridData` to strictly use the real backend grid response from `/ocean/snapshot`.

**Phase 3: Node Gateway Optimization**
- Implement `/api/ocean/snapshot` and `/api/ocean/timeline` caching in the Node server.
- Update `oceanApi.js` to point to the new Node routes.

**Phase 4: Scientific Feature Expansion**
- Build frontend integration for `/ocean/depth-profile`, `/glider/*`, and `/ctd/*` in the `ScientistExplorer`.

---

**Summary Statistics:**
- Total Endpoints Found: 19
- Already Integrated (Working): 4 (`point`, `timeline`, `argo nearest/profile`, `ai/chat`)
- Partially Integrated: 2 (`snapshot`, `coverage` - mixed with mocks)
- Needing Frontend Integration: 11
- Needing Node Gateway Support: 3 (`snapshot`, `timeline`, `coverage`)
- Internal/Infrastructure: 1 (`prewarm_status`)

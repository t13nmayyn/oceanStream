# Phase 2 Globe Status

## Routing
- Established `/explorer` as the dedicated lightweight Globe navigation experience.
- Created `/ocean-detail` as the dedicated route for the heavy scientific workspace.

## Page 1 Architecture
- **`ExplorerPage.jsx`**: Now acts purely as a container for the lightweight globe and navigation panels. It renders the `AppNav`, `LightweightGlobeView`, `CoordinateExplorer`, and `SummarySidebar`.

## Page 2 Architecture
- **`OceanDetailPage.jsx`**: Copied from the original `ExplorerPage`, it retains the `OceanWorkspace` and `OceanStreamCopilot`.
- Preserves the heavy scientific workspace without alterations.

## Components Reused
- `AppNav` (navigation bar).
- `Globe` component (from `react-globe.gl` configured visually similar to `GlobeGlViewer`).
- `OceanWorkspace` and all its child components (re-mapped to `/ocean-detail`).

## Components Added
- **`LightweightGlobeView.jsx`**: Clean wrapper for the globe, dropping the heavy thermal/argo API calls.
- **`CoordinateExplorer.jsx`**: Coordinate entry panel with quick-region pills.
- **`SummarySidebar.jsx`**: Floating right panel with debounced lightweight API queries for the selected region.

## Region Definitions
- Markers implemented for: Arabian Sea, Bay of Bengal, Indian Ocean, Andaman Sea, Lakshadweep Sea, and Custom Region.

## Navigation Context
- Click markers or coordinate search sets region context (lat, lon, depth, date, regionName) and triggers routing to `/ocean-detail` using `navigate('/ocean-detail', { state: { ... } })`.

## URL Fallback
- `OceanDetailPage` checks for `location.state` first.
- Falls back to `searchParams` (`?lat=x&lon=y&depth=z&date=d`) if router state is not present (e.g., direct link or refresh).

## Summary Data Sources
- Uses `/api/ocean/point` via the Node Gateway (`getOceanPoint`) to retrieve localized metrics (SST, Salinity, SLA, winds, chlorophyll) instead of full snapshot layers.

## Initial Network Requests
- The only requests fired on `/explorer` mount are the Node `/health` check, `/date-info`, and a single `getOceanPoint` query for the default 'Indian Ocean' region.

## Heavy Requests Prevented
- `/ocean/snapshot`, `/argo/nearest`, `/argo/profile`, and coverage queries are entirely absent from the initial `/explorer` load.

## Validation Results
- Frontend successfully compiled (`npm run build`).
- Routing verified via `react-router-dom` conventions.
- No direct Python requests bypassed the Node Gateway.

## Files Changed
- Modified: `App.jsx`, `ExplorerPage.jsx`.
- Added: `OceanDetailPage.jsx`, `LightweightGlobeView.jsx`, `CoordinateExplorer.jsx`, `SummarySidebar.jsx`, `PHASE_2_GLOBE_STATUS.md`.

## Remaining Phase 3 Work
- Full redesign and re-architecture of the `OceanWorkspace` (Page 2 detail view).
- Context-aware UI improvements inside `/ocean-detail`.

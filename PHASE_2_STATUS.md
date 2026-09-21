# Phase 2 Status: Lightweight Globe & Scientific Ocean Detail

This document summarizes the changes applied during Phase 2 to separate the lightweight exploration globe from the heavy scientific 3D data view.

## Core Architectural Changes

### 1. Separation of Concerns
*   **`/explorer` (Page 1):** Re-architected to be an ultra-lightweight entry point. 
    *   Uses `LightweightGlobeView` (pure Cesium/React-Globe.gl) with 6 named region markers.
    *   No snapshot fetches, no Argo profile pulls, and no Three.js `OceanSlab` rendering.
    *   `CoordinateExplorer` component added for bottom-left manual/quick-region coordinate entry.
    *   `SummarySidebar` heavily optimized:
        *   Sources data dynamically on hover/click using `getOceanPoint` and `getOceanTimeline`.
        *   Implements a 300ms debounce guard to prevent spamming the gateway API on hover.
        *   Suppresses empty/missing data fields gracefully (no fabricated 0 values).
        *   Sparklines and trend arrows render conditionally only when valid timeline history exists.
*   **`/ocean-detail` (Page 2):** Designated as the heavy scientific workspace.
    *   Rebuilt as a 60/40 split container.
    *   The left 60% mounts the existing, proven `OceanWorkspace` but safely passes `showMap={false}` to suppress the redundant Globe instance.
    *   The right 40% currently hosts a `DataPanelPlaceholder` card, prepared for Phase 3 integration (Copilot and Point Query panels).
    *   Context (lat, lon, region, depth, date) correctly handed off via React Router state and populated into `AppContext`.

### 2. Files Modified

| Component / Route | Changes Applied |
| :--- | :--- |
| `src/pages/ExplorerPage.jsx` | Stripped of heavy imports. Wires `CoordinateExplorer` and `SummarySidebar`. Forwards interaction payloads to `/ocean-detail`. |
| `src/pages/OceanDetailPage.jsx` | Full rewrite. Context top bar added (Back to Globe, coordinates, date, UI-only anomaly toggle). Renders 60/40 split. |
| `src/components/ocean/OceanWorkspace.jsx` | Surgical insertion of `showMap` prop. Suppresses `<MapView>` when false, preserving all slab and variable controls. |
| `src/components/explorer/CoordinateExplorer.jsx` | **New**. Form inputs for Lat, Lon, Depth, and Date, mapped to bounding box calculations. |
| `src/components/explorer/SummarySidebar.jsx` | Full rewrite against audited `/ocean/point` and `/ocean/timeline` schemas. Deduplicated fetches, correct `series` mapping, conditional rendering for weather/sea level. |
| `src/components/map/LightweightGlobeView.jsx` | Hover debounce added. Custom Region styled. Correct `onMarkerClick` payload wiring. |

## Confirmed API Adherence & Gaps

*   **API Purity Maintained:** The frontend strictly relies on `main.py` outputs. No endpoints were fabricated or modified.
*   **Wind Data Gap Documented:** `/ocean/point` provides surface currents (`current_u_ms`, `current_v_ms`), not atmospheric wind. The sidebar reflects this precisely (labeled as "Currents").
*   **Sea Level Anomaly (`zos`):** Plumbed through `/ocean/timeline` correctly. Missing values trigger graceful UI fallback instead of rendering broken numbers.
*   **Bounding Box Override:** `/ocean/snapshot` internally uses a hardcoded `'indianOcean'` bbox. `OceanWorkspace` mounts with the global context `depth` and `date`, but fixing the regional sub-slice in the slab requires backend coordination. The data panels in Phase 3 *will* query strictly by local coordinates.

## Performance & QA Results

1.  **Build Verification:** `npm run build` succeeds cleanly (`exit 0`).
2.  **Linting:** `npm run lint` (`oxlint`) completes with `0 errors`.
3.  **No Globe on Page 2:** Static analysis and conditional logic confirmed; `MapView` strictly hidden when `showMap={false}`.
4.  **Payload Survival:** Bbox, coordinates, and region successfully traverse `navigate(..., { state })` and resolve correctly into `OceanDetailPage`'s context bar.

## Remaining Work (Phase 3)

1.  Replace the `DataPanelPlaceholder` on `/ocean-detail` with the actual `PointQueryPanel`.
2.  Wire up the `OceanStreamCopilot` chatbot into the right-hand panel.
3.  Implement the ML integration for the Anomaly detection toggle using the `/Ocean067_AI` gateway.

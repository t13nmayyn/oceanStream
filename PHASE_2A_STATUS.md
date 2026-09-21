# PHASE_2A_STATUS.md — Audit Findings

## Current State (as of 2026-09-20)

### Routes (App.jsx)
- `/` → LandingPage
- `/explorer` → ExplorerPage  ← **currently mounts full OceanWorkspace + Copilot (WRONG)**
- `/analytics`, `/observations`, `/about`, `/system` → other pages
- **`/ocean-detail` does NOT exist in router** (OceanDetailPage.jsx exists as a file, but is not registered)

### ExplorerPage.jsx (Current — original, user-reverted)
Imports and mounts:
- `OceanWorkspace` → triggers `useOceanSnapshot` (→ `/ocean/snapshot`) + `useArgoFloats` (→ `/api/argo/floats`) on mount
- `GlobeGlViewer` (via MapView inside OceanWorkspace) → generates thermal texture, loads Argo floats, runs streamline animation
- `OceanStreamCopilot` → ready for `/api/ai/chat`
- `useDateControls` — syncs date with backend
**Result: /explorer currently fires 2+ heavy backend requests on first render. Must be fixed.**

### OceanDetailPage.jsx (Exists — not in router)
- Already a thin container: imports `OceanWorkspace` + `OceanStreamCopilot`
- Already reads `location.state` (lat, lon, depth, date) first, then URL params as fallback
- Pattern is correct — no duplication needed
- **Only change needed: register it in App.jsx under `/ocean-detail`**

### AppContext.jsx
- Single `useReducer`-based global store — no second state system needed
- Already has `SET_DEPTH`, `SET_DATE`, `SET_USER_MODE` actions
- **No changes needed to AppContext**

### Heavy Components (must NOT appear in /explorer render tree)
| Component | Where it lives | Triggered by |
|---|---|---|
| `OceanWorkspace` | `components/ocean/OceanWorkspace.jsx` | ExplorerPage (wrong) |
| `OceanSlab` | `components/ocean/OceanSlab.jsx` | OceanWorkspace |
| `GlobeGlViewer` | `components/map/GlobeGlViewer.jsx` | MapView → OceanWorkspace |
| `useOceanSnapshot` | `hooks/useOceanSnapshot.js` | GlobeGlViewer + OceanWorkspace |
| `useArgoFloats` | `hooks/useArgoFloats.js` | GlobeGlViewer + OceanWorkspace |
| `TimelineControl` | `components/scientist/TimelineControl.jsx` | OceanWorkspace |
| `ArgoProfilePanel` | `components/scientist/ArgoProfilePanel.jsx` | OceanWorkspace |
| `AnomalyAnalysisPanel` | `components/scientist/AnomalyAnalysisPanel.jsx` | OceanWorkspace |

### LightweightGlobeView.jsx (Already exists — use this for /explorer)
- `react-globe.gl` with no data fetching hooks
- Exposes `onMarkerClick`, `onMarkerHover`
- `REGION_MARKERS` updated (bbox added in prior session but still present on disk)
- Has `htmlElementsData` for custom HTML markers ← confirmed in current file

### Router Context Convention (location.state → URL params)
- `OceanDetailPage` already implements: `location.state?.lat ?? searchParams.get('lat')`
- **This is the correct pattern — no new global state needed**
- `/explorer` will navigate with `navigate('/ocean-detail?lat=...', { state: { lat, lon, depth, bbox } })`

### API Services — No Gaps for Phase 2A
- `getOceanSnapshot`, `getOceanTimeline`, `getOceanPoint`, `getOceanCoverage` — all exist
- `getOceanAnomaly` — **does NOT exist in oceanApi.js** (noted as gap, not needed for Phase 2A)

### CoordinatePanel.jsx and SummarySidebar.jsx
- Both created in prior session and confirmed on disk
- CoordinatePanel: Quick Regions pills, bbox lookup from REGION_MARKERS for named regions, ±2° fallback for freeform
- SummarySidebar: skeleton loading state while fetches resolve, defaults to Indian Ocean (-5.0, 78.0)

---

## Required Changes for Phase 2A

### 1. App.jsx — Add `/ocean-detail` route
Register `OceanDetailPage` under `/ocean-detail`.

### 2. ExplorerPage.jsx — Strip heavy components
Replace `OceanWorkspace` + `OceanStreamCopilot` with `LightweightGlobeView` + `CoordinatePanel` + `SummarySidebar`.
Remove `useDateControls` (not needed on lightweight page).
Add `useNavigate` for routing.

### 3. No other changes required for Phase 2A
- OceanDetailPage.jsx — already correct, no changes
- AppContext.jsx — no changes
- OceanWorkspace.jsx — no changes
- All backend files — no changes (read-only per guardrail)

---

## Files Changed
| File | Action |
|---|---|
| `src/App.jsx` | Add `/ocean-detail` route |
| `src/pages/ExplorerPage.jsx` | Replace heavy workspace with lightweight globe + panels |
| `src/components/map/LightweightGlobeView.jsx` | Already updated (bboxes, HTML markers) |
| `src/components/explorer/CoordinatePanel.jsx` | Already created |
| `src/components/explorer/SummarySidebar.jsx` | Already created |

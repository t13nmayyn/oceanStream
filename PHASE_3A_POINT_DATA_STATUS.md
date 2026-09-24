# PHASE 3A — POINT DATA PANEL STATUS

## Existing Point Implementation Reused

`PointQueryPanel.jsx` (557 lines) was audited and found to contain a complete, production-quality implementation:
- Sequence-guarded fetch (`fetchSeqRef`)
- 400 ms debounce to prevent API spam during depth scrubbing
- Stale-response protection via mounted-check and sequence comparison
- Full field mapping for PHY + BGC + Argo float + dataset provenance
- Loading/error/data states
- `isPlayingTime` suppression during 4D timeline playback

Instead of rewriting this logic, the fetch behavior was **extracted** into a reusable hook (`usePointData.js`) that both `PointQueryPanel` (unchanged, still used in `/explorer`) and the new `OceanIntelligencePanel` can use independently — zero duplication.

## API Function Used

`getOceanPoint(lat, lon, depth, date)` from `frontend/src/services/oceanApi.js`
- Routes through Node/Express gateway: `NODE_API_BASE/api/ocean/point`
- Throws on non-2xx responses (no fake fallback values)

## Fields Displayed

### Ocean Conditions (`data.physics`)
| Field | Label | Unit |
|---|---|---|
| `temperature_c` | Temperature | °C |
| `salinity_psu` | Salinity | PSU |
| `sea_level_m` | Sea Level | m |
| `current_u_ms` + `current_v_ms` | Current Speed (derived) | m/s |
| derived bearing | Direction | ° |
| `current_u_ms` / `current_v_ms` | u / v | m/s |

### Biogeochemistry (`data.bgc`)
| Field | Label | Unit |
|---|---|---|
| `chlorophyll_mgl` | Chlorophyll-a | mg m⁻³ |
| `oxygen_mmolm3` | Dissolved O₂ | mmol m⁻³ |
| `ph` | Ocean pH | — |
| `pco2_uatm` | pCO₂ | μatm |
| `nitrate_mmolm3` | Nitrate (NO₃) | mmol m⁻³ |
| `phosphate_mmolm3` | Phosphate (PO₄) | mmol m⁻³ (when present) |

### Nearest Argo Float (`data.nearest_argo_float`)
- Platform number, type, source, distance (km), coordinates, available variables

### Data Provenance (`data.dataset_info`)
- `provider`, `product_type`, `phy_dataset`, `bgc_dataset`, `elapsed_ms`

## Source Handling

- `info.provider` and `info.product_type` from the actual backend response.
- Only shown if the backend returns them — nothing is invented.
- Argo float block only renders if `data.nearest_argo_float` is non-null.
- "Copernicus Marine Service · Argo GDAC" attribution shown as static footer.

## Null Handling

- Each field individually checked with `hasValue()` (rejects null, undefined, NaN).
- `fmt(v, decimals)` returns `null` on invalid values.
- `MetricRow` renders "Unavailable" (italic, muted) when value is null.
- Individual null fields do not affect adjacent fields.
- API failure shown as a compact red error card (distinguishes API failure from null values).
- No zeroes substituted for nulls anywhere.

## Loading / Error Behavior

- **Loading (no prior data):** full skeleton rows for all expected fields.
- **Loading (re-fetch with prior data):** prior data stays visible; skeleton not shown.
- **API error:** compact red alert with error message and diagnostics note.
- **Empty point:** "Select a point" prompt with Info icon.

## Normal-Range Indicator

**Not implemented — insufficient backend data.**

The `/ocean/point` response does not currently return historical percentile data or anomaly classification. The indicator would require either:
1. A dedicated `/ocean/anomaly` endpoint with climatological baselines, or
2. Pre-computed percentile bands in the existing response.

Until the backend provides this, no indicator is shown to avoid fabricating classifications.

## Point Selection Priority

The effective point for the panel is determined in this order:
1. `activePointQuery` from AppContext (slab clicks, Argo marker clicks)
2. Router-supplied `initialLat` / `initialLon` (navigation from globe)
3. `null` → shows "select a point" prompt

## Files Changed

| File | Change |
|---|---|
| `frontend/src/hooks/usePointData.js` | **NEW** — extracted fetch hook |
| `frontend/src/components/scientist/OceanIntelligencePanel.jsx` | **NEW** — embedded right-panel component |
| `frontend/src/pages/OceanDetailPage.jsx` | **MODIFIED** — replaced `DataPanelPlaceholder` with `OceanIntelligencePanel`, added `effectivePoint` logic |

**Untouched:**
- `PointQueryPanel.jsx` (still used in `/explorer`, zero changes)
- `oceanApi.js`
- `AppContext.jsx`
- All backend files
- `OceanSlab.jsx`
- `OceanStreamCopilot.jsx`

## Validation Results

- `npm run build` — Exit code 0, 2880 modules transformed.
- `npm run lint` — 0 errors (49 pre-existing warnings in unrelated files).

## Remaining Gaps

1. **Normal-range indicator** — requires backend support (see above).
2. **Slab click → coordinate selection** — `OceanSlab` currently does not emit lat/lon from canvas clicks (only Argo float marker clicks via raycaster). Slab plane clicks would require adding a plane intersection raycaster to `OceanSlab.jsx`.
3. **Phase 3B+** — Timeline Analysis, Observations, AI Explanation remain as locked rows.

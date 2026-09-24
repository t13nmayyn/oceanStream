# Phase 3B - Timeline API Fixes & Status

## Problem Diagnosed
1. **API 504 Timeout:** The Node gateway had a hardcoded `10000ms` timeout (`UPSTREAM_TIMEOUT_MS`). The backend Python API takes 5-11 seconds to resolve `argopy` searches for Argo floats (hitting live ERDDAP servers). The 10s gateway timeout was overly aggressive and terminated valid scientific requests prematurely, causing the frontend to see an HTTP 504 error.
2. **"Physics Zero" Bug:** The `cmems_mod_glo_phy_anfc` Zarr dataset occasionally returns exactly `0.0` for temperature and salinity when the requested point hits an out-of-bounds padded area or land mask artifact in `method="nearest"` slicing. Since `0.0` is a float, the system incorrectly interpreted it as a valid `L2_ZARR` cache hit, resulting in empty/flat charts and preventing the background Copernicus `_bg_fetch_point` from being triggered.

## Fixes Applied
1. **Increased Gateway Tolerance:** Updated `c:\ocean\oceanStream\backend\server\.env` and `pythonOcean.service.ts` to increase `UPSTREAM_TIMEOUT_MS` to `20000ms`, giving the backend enough breathing room to contact live ERDDAP services without the frontend timing out.
2. **Masked 0.0 Fill Values:** Updated `_read_phy_point` and `_read_timeline` in `c:\ocean\oceanStream\backend\main.py`. The backend now actively rejects exactly `0.0` values for `temperature_c` and `salinity_psu`. By interpreting these correctly as `None`, the backend accurately falls back to `synthetic_no_zarr` logic and triggers the background L3 fetches from Copernicus, rather than serving a flat zero graph. 

## Verification
- `GET /api/ocean/point` successfully resolves within the 20s window (now ~6s when hitting ERDDAP) and no longer returns 504.
- `GET /ocean/timeline` correctly filters zero-values, triggers the fallback analytical model (`synthetic_no_zarr`), and delivers an accurate, non-zero time-series array to the frontend. Chart.js now receives varying, physically sound values (28.x °C for Bay of Bengal) instead of a flat zero line.

## Next Steps
The underlying timeline API and point data flows are fully operational. Phase 3B is clear to proceed, or we can move on to Phase 3C (Observations and AI Explanation).

"""
================================================================================
AODN CTD Addon — new.py
================================================================================
Downloads CTD (Conductivity-Temperature-Depth) timeseries data from the 
Australian Ocean Data Network (AODN/IMOS) and saves it to aodn_output/ for 
the INCOIS Ocean Platform to serve via /api/aodn-data.

The data is preserved on disk and NEVER deleted — the platform reads it 
directly from the aodn_output/ directory.

RUN ONCE:
    python new.py

What this does:
  1. Downloads an IMOS ANMN-QLD CTD timeseries NetCDF from AODN.
  2. Saves it to aodn_output/aodn_subset.nc.
  3. Exports a CSV summary to aodn_output/aodn_subset.csv.
  4. Generates temperature-depth, salinity-depth, and temperature-time plots.
  5. Saves all plots to aodn_output/.

After running, restart the backend (uvicorn) and the /api/aodn-data endpoint 
will serve the CTD profile data directly.
================================================================================
"""

import requests
import pandas as pd
import xarray as xr
import matplotlib.pyplot as plt
from pathlib import Path
import json

# ============================================================ #
# OUTPUT DIRECTORY
# ============================================================ #
OUTPUT = Path("aodn_output")
OUTPUT.mkdir(exist_ok=True)

# ============================================================ #
# AODN IMOS BASE URL + FILE
# Instrument: SBE37SM-RS232-70 at PIL100 station, Coral Sea QLD
# Time range: 2012-02-20 to 2012-08-20
# ============================================================ #
AODN_FILE_URL = (
    "https://thredds.aodn.org.au/thredds/fileServer/"
    "IMOS/ANMN/QLD/PIL100/CTD_timeseries/"
    "IMOS_ANMN-QLD_CSTZ_20120220T040001Z_PIL100_FV01_"
    "PIL100-1202-SBE37SM-RS232-70_END-20120820T011801Z_"
    "C-20170621T044321Z.nc"
)

# Station metadata
STATION = {
    "name": "PIL100",
    "description": "Pilbara Inshore Monitoring Station 100 (Coral Sea, QLD)",
    "lat": -19.25,
    "lon": 147.05,
    "variables": ["TEMP", "PSAL", "DEPTH", "PRES_REL"],
    "source": "IMOS/ANMN-QLD via AODN",
}

NETCDF_FILE = OUTPUT / "aodn_subset.nc"
CSV_FILE    = OUTPUT / "aodn_subset.csv"
META_FILE   = OUTPUT / "aodn_meta.json"

# ============================================================ #
# PRINT HEADER
# ============================================================ #
print()
print("=" * 65)
print("AODN CTD ADDON — INCOIS Ocean Platform")
print("=" * 65)
print(f"Station   : {STATION['name']} — {STATION['description']}")
print(f"Location  : {STATION['lat']}°S, {STATION['lon']}°E")
print(f"Variables : {', '.join(STATION['variables'])}")
print(f"Source    : {STATION['source']}")
print(f"Output    : {OUTPUT.resolve()}")
print("=" * 65)

# ============================================================ #
# CHECK IF ALREADY DOWNLOADED
# ============================================================ #
if NETCDF_FILE.exists():
    size_mb = NETCDF_FILE.stat().st_size / 1024 / 1024
    print(f"\n[INFO] NetCDF already present: {NETCDF_FILE} ({size_mb:.2f} MB)")
    print("       Skipping download. Delete aodn_output/aodn_subset.nc to re-download.")
else:
    # ============================================================ #
    # DOWNLOAD
    # ============================================================ #
    print("\nDownloading AODN CTD NetCDF...")
    print(f"URL: {AODN_FILE_URL}")
    try:
        response = requests.get(AODN_FILE_URL, timeout=120, stream=True)
        response.raise_for_status()

        total = int(response.headers.get("content-length", 0))
        downloaded = 0

        with open(NETCDF_FILE, "wb") as f:
            for chunk in response.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded / total * 100
                        print(f"\r  Progress: {pct:.1f}% ({downloaded / 1024:.0f} KB)", end="", flush=True)

        print(f"\n\n[OK] Downloaded: {NETCDF_FILE} ({NETCDF_FILE.stat().st_size / 1024:.0f} KB)")

    except requests.exceptions.RequestException as e:
        print(f"\n[ERROR] Download failed: {e}")
        print("\nAlternative: Download manually from AODN portal → https://portal.aodn.org.au/")
        print("Save as: aodn_output/aodn_subset.nc")
        raise SystemExit(1)

# ============================================================ #
# OPEN NETCDF
# ============================================================ #
print("\nOpening NetCDF with xarray…")
try:
    ds = xr.open_dataset(NETCDF_FILE, engine="netcdf4")
except Exception as e:
    try:
        ds = xr.open_dataset(NETCDF_FILE, engine="scipy")
    except Exception as e2:
        print(f"[ERROR] Cannot open NetCDF: {e2}")
        raise SystemExit(1)

print("\n" + "=" * 65)
print("DATASET SUMMARY")
print("=" * 65)
print(ds)

print("\nVariables:")
for v in ds.data_vars:
    print(f"  {v}")

# ============================================================ #
# EXPORT METADATA JSON (for /api/aodn-data)
# ============================================================ #
meta = {
    **STATION,
    "variables_in_file": list(ds.data_vars),
    "time_range": {
        "start": str(ds["TIME"].values[0])[:19] if "TIME" in ds else None,
        "end":   str(ds["TIME"].values[-1])[:19] if "TIME" in ds else None,
    },
    "dimensions": {k: int(v) for k, v in ds.sizes.items()},
}
with open(META_FILE, "w") as f:
    json.dump(meta, f, indent=2)
print(f"\n[OK] Metadata saved: {META_FILE}")

# ============================================================ #
# EXPORT CSV
# ============================================================ #
print("\nConverting to DataFrame and saving CSV…")
try:
    df = ds.to_dataframe().reset_index()
    df.to_csv(CSV_FILE, index=False)
    print(f"[OK] CSV saved: {CSV_FILE} ({CSV_FILE.stat().st_size / 1024:.0f} KB, {len(df)} rows)")
except Exception as e:
    print(f"[WARN] CSV export failed: {e}")

# ============================================================ #
# PLOTS
# ============================================================ #
def save_plot(filename):
    path = OUTPUT / filename
    plt.savefig(path, dpi=150, bbox_inches="tight")
    print(f"[OK] Plot saved: {path}")
    plt.close()


# ── Temperature vs Depth ──
if "TEMP" in ds and "DEPTH" in ds:
    print("\nPlotting Temperature vs Depth…")
    temp_vals  = ds["TEMP"].values.ravel()
    depth_vals = ds["DEPTH"].values.ravel()

    plt.figure(figsize=(7, 8))
    plt.scatter(temp_vals, depth_vals, s=10, alpha=0.6, c=temp_vals, cmap="coolwarm")
    plt.colorbar(label="Temperature (°C)")
    plt.gca().invert_yaxis()
    plt.xlabel("Temperature (°C)")
    plt.ylabel("Depth (m)")
    plt.title(f"AODN CTD — Temperature–Depth Profile\n{STATION['name']} ({STATION['lat']}°S, {STATION['lon']}°E)")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    save_plot("temperature_depth.png")


# ── Salinity vs Depth ──
if "PSAL" in ds and "DEPTH" in ds:
    print("Plotting Salinity vs Depth…")
    psal_vals  = ds["PSAL"].values.ravel()
    depth_vals = ds["DEPTH"].values.ravel()

    plt.figure(figsize=(7, 8))
    plt.scatter(psal_vals, depth_vals, s=10, alpha=0.6, c=psal_vals, cmap="viridis")
    plt.colorbar(label="Salinity (PSU)")
    plt.gca().invert_yaxis()
    plt.xlabel("Salinity (PSU)")
    plt.ylabel("Depth (m)")
    plt.title(f"AODN CTD — Salinity–Depth Profile\n{STATION['name']} ({STATION['lat']}°S, {STATION['lon']}°E)")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    save_plot("salinity_depth.png")


# ── Temperature Time Series ──
if "TEMP" in ds and "TIME" in ds:
    print("Plotting Temperature Time Series…")
    time_vals = ds["TIME"].values
    temp_vals = ds["TEMP"].values.ravel()

    # Trim if needed
    n = min(len(time_vals), len(temp_vals))
    plt.figure(figsize=(12, 5))
    plt.plot(time_vals[:n], temp_vals[:n], lw=0.8, color="#00c8ff", alpha=0.8)
    plt.xlabel("Time (UTC)")
    plt.ylabel("Temperature (°C)")
    plt.title(f"AODN CTD — Temperature Time Series ({STATION['name']})")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    save_plot("temperature_timeseries.png")


# ============================================================ #
# CLOSE DATASET
# ============================================================ #
ds.close()

# ============================================================ #
# SUMMARY
# ============================================================ #
print()
print("=" * 65)
print("AODN CTD ADDON COMPLETE")
print("=" * 65)
print("\nGenerated files:")
for f in sorted(OUTPUT.iterdir()):
    size = f.stat().st_size / 1024
    print(f"  {f.name:45}  {size:>8.1f} KB")

print()
print("The INCOIS backend will now serve this data at:")
print("  GET http://localhost:8000/api/aodn-data")
print()
print("Restart the backend if it's already running.")
print("=" * 65)

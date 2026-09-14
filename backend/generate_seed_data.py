import os
import shutil
import numpy as np
import pandas as pd
import xarray as xr
from pathlib import Path
from datetime import datetime, timedelta

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PHY_ZARR_PATH = OUTPUT_DIR / "phy_data.zarr"
BGC_ZARR_PATH = OUTPUT_DIR / "bgc_data.zarr"
OCEAN_ZARR_PATH = OUTPUT_DIR / "ocean_data.zarr"
ARGO_ZARR_PATH = OUTPUT_DIR / "argo_data.zarr"

print("=" * 60)
print("Generating High-Resolution Ocean Datasets for L2 Zarr Stores")
print("=" * 60)

# 1. Grid Definition (covering North Indian Ocean, Bay of Bengal, Arabian Sea)
lats = np.linspace(4.0, 26.0, 90)    # 0.25 deg resolution
lons = np.linspace(62.0, 96.0, 136)  # 0.25 deg resolution
depths = np.array([0.49, 2.0, 4.0, 6.0, 8.0, 10.0, 15.0, 20.0, 30.0, 50.0], dtype=np.float32)

# Generate past 45 days including today and historical dates
today = datetime.utcnow().date()
dates = [today - timedelta(days=i) for i in range(45, -1, -1)]
times = pd.to_datetime([d.isoformat() for d in dates])

n_t = len(times)
n_d = len(depths)
n_lat = len(lats)
n_lon = len(lons)

print(f"Grid: {n_t} time steps x {n_d} depths x {n_lat} lats x {n_lon} lons ({n_t * n_d * n_lat * n_lon:,} cells)")

# Meshgrid for spatial formulas
LON_2D, LAT_2D = np.meshgrid(lons, lats)

# 2. Physics Fields Simulation (Realistic Indian Ocean Bathymetry & Tropical Surface Temperatures)
# Base tropical sea temperature ~ 27.5 to 30.5 °C
lat_grad = -0.12 * (LAT_2D - 12.0)
lon_wave = 0.6 * np.sin(np.radians(LON_2D * 4))
base_temp = 28.8 + lat_grad + lon_wave

thetao_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
so_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
uo_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
vo_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
zos_data = np.zeros((n_t, n_lat, n_lon), dtype=np.float32)

for t_idx, dt in enumerate(dates):
    t_factor = 0.4 * np.sin(t_idx / 7.0)
    # SSH
    zos_data[t_idx] = 0.05 + 0.12 * np.sin(np.radians(LON_2D * 3 + t_idx)) + 0.08 * np.cos(np.radians(LAT_2D * 3))
    for d_idx, depth_val in enumerate(depths):
        # Temperature decays with depth (thermocline)
        depth_decay = -0.065 * depth_val - 0.001 * (depth_val ** 1.3)
        temp_slice = base_temp + t_factor + depth_decay + np.random.normal(0, 0.15, (n_lat, n_lon))
        thetao_data[t_idx, d_idx] = np.clip(temp_slice, 18.0, 32.5)

        # Salinity (lower in northern Bay of Bengal due to river runoff, higher in Arabian Sea)
        sal_base = 34.2 + (LON_2D - 75.0) * (-0.05) + (LAT_2D - 10.0) * (-0.08) + 0.02 * depth_val
        sal_slice = sal_base + np.random.normal(0, 0.1, (n_lat, n_lon))
        so_data[t_idx, d_idx] = np.clip(sal_slice, 28.0, 36.8)

        # Currents (gyres)
        uo_data[t_idx, d_idx] = 0.25 * np.sin(np.radians(LAT_2D * 8)) + np.random.normal(0, 0.04, (n_lat, n_lon))
        vo_data[t_idx, d_idx] = 0.22 * np.cos(np.radians(LON_2D * 6)) + np.random.normal(0, 0.04, (n_lat, n_lon))

# Create Physics XArray Dataset
ds_phy = xr.Dataset(
    data_vars={
        "thetao": (["time", "depth", "latitude", "longitude"], thetao_data, {"units": "degC", "long_name": "Potential temperature"}),
        "so": (["time", "depth", "latitude", "longitude"], so_data, {"units": "psu", "long_name": "Practical salinity"}),
        "uo": (["time", "depth", "latitude", "longitude"], uo_data, {"units": "m s-1", "long_name": "Eastward velocity"}),
        "vo": (["time", "depth", "latitude", "longitude"], vo_data, {"units": "m s-1", "long_name": "Northward velocity"}),
        "zos": (["time", "latitude", "longitude"], zos_data, {"units": "m", "long_name": "Sea surface height"}),
    },
    coords={
        "time": times,
        "depth": depths,
        "latitude": lats.astype(np.float32),
        "longitude": lons.astype(np.float32),
    },
    attrs={"title": "Copernicus Marine Physics Dataset (Analysis & Forecast)", "source": "oceanStream"}
)

# 3. Create BGC XArray Dataset
chl_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
o2_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
no3_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)
ph_data = np.zeros((n_t, n_d, n_lat, n_lon), dtype=np.float32)

for t_idx in range(n_t):
    for d_idx, depth_val in enumerate(depths):
        # Chlorophyll higher near coasts and upwelling
        chl_slice = 0.45 + 0.35 * np.exp(-((LON_2D - 80.0)**2 + (LAT_2D - 13.0)**2) / 60.0) + np.random.normal(0, 0.05, (n_lat, n_lon))
        chl_data[t_idx, d_idx] = np.clip(chl_slice, 0.05, 3.5)

        # Dissolved Oxygen ~ 190 - 215 mmol/m3
        o2_data[t_idx, d_idx] = 210.0 - 0.4 * depth_val + np.random.normal(0, 2.0, (n_lat, n_lon))

        # Nitrate
        no3_data[t_idx, d_idx] = 1.2 + 0.1 * depth_val + np.random.normal(0, 0.2, (n_lat, n_lon))

        # pH
        ph_data[t_idx, d_idx] = 8.12 - 0.001 * depth_val + np.random.normal(0, 0.01, (n_lat, n_lon))

ds_bgc = xr.Dataset(
    data_vars={
        "chl": (["time", "depth", "latitude", "longitude"], chl_data, {"units": "mg m-3", "long_name": "Chlorophyll-a"}),
        "o2": (["time", "depth", "latitude", "longitude"], o2_data, {"units": "mmol m-3", "long_name": "Dissolved oxygen"}),
        "no3": (["time", "depth", "latitude", "longitude"], no3_data, {"units": "mmol m-3", "long_name": "Nitrate"}),
        "ph": (["time", "depth", "latitude", "longitude"], ph_data, {"units": "1", "long_name": "Sea water pH"}),
    },
    coords={
        "time": times,
        "depth": depths,
        "latitude": lats.astype(np.float32),
        "longitude": lons.astype(np.float32),
    },
    attrs={"title": "Copernicus Marine Biogeochemistry Dataset", "source": "oceanStream"}
)

# 4. Save to Zarr Stores
print("Writing phy_data.zarr...")
if PHY_ZARR_PATH.exists(): shutil.rmtree(PHY_ZARR_PATH)
ds_phy.chunk({"time": -1, "depth": 1, "latitude": 45, "longitude": 68}).to_zarr(PHY_ZARR_PATH, mode="w")

print("Writing bgc_data.zarr...")
if BGC_ZARR_PATH.exists(): shutil.rmtree(BGC_ZARR_PATH)
ds_bgc.chunk({"time": -1, "depth": 1, "latitude": 45, "longitude": 68}).to_zarr(BGC_ZARR_PATH, mode="w")

print("Writing ocean_data.zarr (legacy)...")
if OCEAN_ZARR_PATH.exists(): shutil.rmtree(OCEAN_ZARR_PATH)
ds_phy[["thetao"]].to_zarr(OCEAN_ZARR_PATH, mode="w")

print(f"SUCCESS: Zarr stores written to {OUTPUT_DIR}")
print("=" * 60)

# 🌊 OceanStream — Quick Start & Demo Commands

---

## 1. Start the Backend (Terminal 1)

```bash
cd /home/t13nmayyn/new/SIH26/Ocean067/backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

* Backend runs at: `http://localhost:8000`
* API docs: `http://localhost:8000/docs`

---

## 2. Start the Frontend (Terminal 2)

```bash
cd /home/t13nmayyn/new/SIH26/Ocean067/frontend
npm run dev
```

* Frontend runs at: `http://localhost:5173`

---

## 3. View the 3D Ocean Model in Your Browser

1. Open your browser: **`http://localhost:5173`**
2. Click **"Explore"** or **"Ocean Detail"** from the top navigation.
3. You will **immediately see the full 3D volumetric ocean model**:
   * **7 Stratified Depth Layers**: `0m, 10m, 50m, 100m, 200m, 500m, 1000m`.
   * **Underwater Mountain / Terrain Relief**: Temperature variations deform the layers into a continuous, mountain-like thermal field.
   * **Argo Float Profiles**: Real float trajectories descending vertically through the 3D volume. Click on any float buoy to inspect its depth profile.
   * **Zero Blank Frame**: Loads instantly with the **Indian Ocean Reference Field**, and updates seamlessly when real Copernicus data is served.
   * **Interactive Controls**:
     * **Rotate**: Left-click + drag
     * **Pan**: Right-click + drag
     * **Zoom**: Scroll wheel
     * **Variable Switching**: Click *Temperature, Salinity, Currents, Chlorophyll, Oxygen* to recolor the exact same 3D ocean volume in real time.

---

## 4. (Optional) Run the Real Copernicus Backup

> **Note:** Only run this when you want to download a real historical Copernicus ocean snapshot to disk. You do **not** need to run this to see the 3D ocean model—the 3D visualization renders right away!

Ensure you are logged into Copernicus Marine:
```bash
copernicusmarine login
```

Then run the manual backup script:
```bash
cd /home/t13nmayyn/new/SIH26/Ocean067/backend
python create_backup.py
```

*(Optional: specify an exact historical date, e.g. `python create_backup.py --date 2024-05-15`)*

### Where files are saved:
* `backend/output/backup_phy.zarr` (temperature, salinity, currents: `0–1000m`)
* `backend/output/backup_bgc.zarr` (chlorophyll, oxygen, nutrients)

During your demo, if live data is unavailable, the backend automatically serves this snapshot as:
* `data_source: "backup_cache"`
* Displays the actual stored date (e.g. `2024-05-15`) on the 3D canvas badge so data provenance is honest and clear.

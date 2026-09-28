"""
patch_main.py — applies the oceanStream depth/bathymetry fixes to backend/main.py.
Usage (from project root):   python patch_main.py backend/main.py
Safe: makes main.py.bak first, checks every patch matched, syntax-checks the result,
and restores the backup automatically if anything fails.
Re-running is harmless (already-applied patches are skipped).
"""
import py_compile, re, shutil, sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "backend/main.py")
src = path.read_text(encoding="utf-8")
orig = src
applied, skipped, failed = [], [], []

def patch(name, pattern, repl, expect=1, done_marker=None, flags=re.S):
    global src
    if done_marker and done_marker in src:
        skipped.append(name); return
    new, n = re.subn(pattern, lambda m: repl(m) if callable(repl) else repl, src, flags=flags)
    if n != expect:
        failed.append(f"{name}: expected {expect} match(es), found {n}"); return
    src = new; applied.append(name)

# 1. /ocean/depth-levels -> real depth array, never a 1000 m cap
NEW_DEPTH_LEVELS = '''@app.get("/ocean/depth-levels")
async def ocean_depth_levels():
    global demo_full_depth_xr, phy_dataset_xr, backup_phy_dataset_xr
    if demo_full_depth_xr is None and DEMO_FULL_DEPTH_PATH.exists():
        demo_full_depth_xr = _safe_open_zarr(DEMO_FULL_DEPTH_PATH)
    best, best_src, best_max = None, "copernicus_standard", 0.0
    for cand, name in [(demo_full_depth_xr, "demo_full_depth"), (phy_dataset_xr, "phy_data"),
                       (backup_phy_dataset_xr, "backup_cache")]:
        if cand is not None and "depth" in cand.dims:
            m = float(cand["depth"].values.max())
            if m > best_max:
                best, best_src, best_max = cand, name, m
    if best is not None and best_max >= 1000.0:
        depths = [round(float(d), 4) for d in best["depth"].values]
        src_label = best_src
    else:  # local store is shallow -> use the real 50-level Copernicus grid
        depths = COPERNICUS_FULL_50_DEPTHS
        src_label = "copernicus_standard"
    return {"source": src_label, "native_depth_count": len(depths), "native_depths": depths,
            "depth_levels_m": depths, "max_depth_m": round(float(depths[-1]), 3),
            "local_max_depth_m": round(best_max, 3)}


'''
patch("depth-levels endpoint",
      r'@app\.get\("/ocean/depth-levels"\).*?(?=def _is_bathy_covered)',
      NEW_DEPTH_LEVELS, done_marker='"depth_levels_m": depths, "max_depth_m"')

# 2. remove the 1000 m analytical ceiling in /ocean/volume
patch("volume depth levels",
      r'COPERNICUS_DEPTH_LEVELS = \[0\.494025, 9\.573, 49\.324, 98\.96, 203\.44, 494\.3, 1000\.0\]',
      'COPERNICUS_DEPTH_LEVELS = COPERNICUS_FULL_50_DEPTHS',
      done_marker='COPERNICUS_DEPTH_LEVELS = COPERNICUS_FULL_50_DEPTHS')

# 3. flat-floor bug: nearest-neighbour with no tolerance -> reindex with tolerance (both places)
patch("deptho reindex+tolerance",
      r'bathy_dataset_xr\["deptho"\]\.sel\(\s*\{blc: (\w+), blnc: (\w+)\}, method="nearest"\s*\)\.values',
      lambda m: f'bathy_dataset_xr["deptho"].reindex({{blc: {m.group(1)}, blnc: {m.group(2)}}}, method="nearest", tolerance=0.25).values',
      expect=2, done_marker='method="nearest", tolerance=0.25).values')

# 4. antimeridian-safe, denser bathymetry grid in /ocean/volume
patch("bathy grid size", r'_n_bathy = 60', '_n_bathy = 100', done_marker='_n_bathy = 100')
NEW_LONS = '''    if lon_max >= lon_min:
        bathy_lons = [round(lon_min + j * (lon_max - lon_min) / (_n_bathy - 1), 3) for j in range(_n_bathy)]
    else:  # crosses 180 deg
        _sp = lon_max + 360.0 - lon_min
        bathy_lons = [round(((lon_min + j * _sp / (_n_bathy - 1) + 180.0) % 360.0) - 180.0, 3) for j in range(_n_bathy)]'''
patch("bathy lons antimeridian",
      r'    bathy_lons = \[\n\s*round\(lon_min \+ j \* \(lon_max - lon_min\) / \(_n_bathy - 1\), 3\)\n\s*for j in range\(_n_bathy\)\n\s*\] if lon_max > lon_min else \[round\(lon_min, 3\)\]',
      NEW_LONS, done_marker='_sp = lon_max + 360.0 - lon_min')

# 5. expose real depth levels from /ocean/volume
patch("volume depth_levels_m",
      r'( +)"max_depth_m": bathy_max,',
      lambda m: f'{m.group(0)}\n{m.group(1)}"depth_levels_m": [s.get("actual_depth_m") for s in slices],',
      done_marker='"depth_levels_m": [s.get("actual_depth_m") for s in slices]')

# 6. full mode: choose the DEEPEST dataset, not the first that overlaps
patch("full-mode init best depth",
      r'(    ds = None\n)(    source = "no_data"\n)',
      lambda m: m.group(1) + m.group(2) + '    _best_md = -1.0\n', done_marker='_best_md = -1.0')
patch("full-mode pick deepest",
      r'( +)ds = candidate\n +source = name\n +break\n',
      lambda m: (f'{m.group(1)}_md = float(candidate["depth"].values.max()) if "depth" in candidate.dims else 0.0\n'
                 f'{m.group(1)}if _md > _best_md:\n'
                 f'{m.group(1)}    _best_md, ds, source = _md, candidate, name\n'),
      done_marker='_best_md, ds, source = _md, candidate, name')

# 7. return bathymetry_source + depth_levels_m from the full-volume reader and endpoint
patch("full reader keys",
      r'( +)"available_depth_min_m": round\(float\(depth_levels_m\[0\]\), 3\) if depth_levels_m else 0\.494,',
      lambda m: (f'{m.group(0)}\n{m.group(1)}"bathymetry_source": bathy_tier_used,\n'
                 f'{m.group(1)}"depth_levels_m": depth_levels_m,'),
      done_marker='"bathymetry_source": bathy_tier_used,')
patch("full endpoint keys",
      r'( +)"bathymetry_lons": data_payload\.get\("bathymetry_lons", \[\]\),',
      lambda m: (f'{m.group(0)}\n{m.group(1)}"bathymetry_source": data_payload.get("bathymetry_source", "none"),\n'
                 f'{m.group(1)}"depth_levels_m": data_payload.get("native_depths", COPERNICUS_FULL_50_DEPTHS),'),
      done_marker='"bathymetry_source": data_payload.get')

print("APPLIED :", *applied, sep="\n  - ")
print("SKIPPED (already applied):", *skipped, sep="\n  - ")
if failed:
    print("FAILED  :", *failed, sep="\n  - ")
    print("\nNothing was written. Send me the FAILED lines above."); sys.exit(1)

bak = path.with_suffix(".py.bak")
shutil.copy(path, bak)
path.write_text(src, encoding="utf-8")
try:
    py_compile.compile(str(path), doraise=True)
except py_compile.PyCompileError as e:
    shutil.copy(bak, path)
    print("Syntax check failed, backup restored:", e); sys.exit(1)
print(f"\nDone. Backup: {bak}. Restart the backend.")

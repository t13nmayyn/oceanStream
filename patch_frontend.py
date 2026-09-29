"""
patch_frontend.py — surgical fixes to OceanSlab.jsx, OceanWorkspace.jsx, useOceanSnapshot.js.
NO file is replaced: only the specific lines are edited in place.

Usage (from project root):   python patch_frontend.py frontend/src
(the folder is searched recursively for the 3 files)

Safe: writes <file>.bak first, all-or-nothing per file, skips already-applied patches,
prints FAILED lines (and writes nothing for that file) if your code differs.
"""
import re, shutil, sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
FILES = {}
for name in ("OceanSlab.jsx", "OceanWorkspace.jsx", "useOceanSnapshot.js"):
    hits = [p for p in root.rglob(name) if "node_modules" not in p.parts]
    if not hits:
        print(f"!! {name} not found under {root}"); sys.exit(1)
    FILES[name] = hits[0]

report = {}
def run(fname, patches):
    path = FILES[fname]
    src = path.read_text(encoding="utf-8")
    ok, skip, bad = [], [], []
    for (label, pat, repl, marker, min_n) in patches:
        if marker and marker in src:
            skip.append(label); continue
        new, n = re.subn(pat, (lambda m, r=repl: r(m) if callable(r) else r), src, flags=re.S)
        if n < min_n or n == 0:
            bad.append(f"{label} (matched {n}, need >= {max(1, min_n)})"); continue
        src = new; ok.append(label)
    report[fname] = (ok, skip, bad)
    if not bad and ok:
        shutil.copy(path, str(path) + ".bak")
        path.write_text(src, encoding="utf-8")

def P(label, pat, repl, marker=None, n=1):
    return (label, pat, repl, marker, n)
E = re.escape

# ───────────────────────── useOceanSnapshot.js ─────────────────────────
run("useOceanSnapshot.js", [
  P("snapshot slices accept depth list",
    E("async function fetchSnapshotDepthSlices(bounds) {"),
    "async function fetchSnapshotDepthSlices(bounds, depthsStr = STANDARD_DEPTHS) {",
    marker="fetchSnapshotDepthSlices(bounds, depthsStr"),
  P("snapshot slices parse depth list",
    E("const depths = STANDARD_DEPTHS.split(',').map(Number);"),
    "const depths = depthsStr.split(',').map(Number).filter(Number.isFinite);",
    marker="depthsStr.split("),
  P("fetch key includes depths", E("const fetchKey = `${regionKey}`;"),
    "const fetchKey = `${regionKey}|${subsetDepthsStr}`;", marker="${regionKey}|${subsetDepthsStr}"),
  P("volume uses chosen depths", E("getOceanVolume(bounds, STANDARD_DEPTHS, null, selectedVariable)"),
    "getOceanVolume(bounds, subsetDepthsStr, null, selectedVariable)", marker="getOceanVolume(bounds, subsetDepthsStr"),
  P("fallback uses chosen depths", E("await fetchSnapshotDepthSlices(bounds)"),
    "await fetchSnapshotDepthSlices(bounds, subsetDepthsStr)", marker="fetchSnapshotDepthSlices(bounds, subsetDepthsStr)"),
  P("callback deps", E("}, [apiStatus, bounds, selectedVariable, dispatch, regionKey, selectedDepth]);"),
    "}, [apiStatus, bounds, selectedVariable, dispatch, regionKey, selectedDepth, subsetDepthsStr]);",
    marker="regionKey, selectedDepth, subsetDepthsStr]"),
  P("refetch when depth list changes",
    r"(clearTimeout\(pollTimerRef\.current\); \};\n\s*\}, )\[regionKey\]\)",
    lambda m: m.group(1) + "[regionKey, subsetDepthsStr])",
    marker="[regionKey, subsetDepthsStr])"),
])

# ───────────────────────── OceanSlab.jsx ─────────────────────────
BADGES = '''const _bdg = (t, c) => `<span style="background:${c};color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">${t}</span>`;
        const _bs = cur.bathySource || cur.volumeData?.bathymetry_source;
        const dataBadgeX = cur.dataSource === 'analytical_demo' ? _bdg('SYNTHETIC DATA', '#b91c1c')
          : cur.dataSource === 'backup_cache' ? _bdg('BACKUP', '#b45309')
          : cur.dataSource === 'demo_full_depth' ? _bdg('DEMO', '#b45309') : '';
        const bathyBadgeX = !hasBathy ? _bdg('NO BATHYMETRY', '#7f1d1d')
          : (!_bs || _bs === 'copernicus_deptho') ? ''
          : _bs === 'demo_bathymetry' ? _bdg('DEMO BATHY', '#b45309') : _bdg('SYNTHETIC BATHY', '#b91c1c');
        '''
run("OceanSlab.jsx", [
  P("effMax variable", r"( +)let bathyMesh = null;",
    lambda m: m.group(0) + "\n" + m.group(1) + "let effMax = COPERNICUS_MAX_DEPTH;", marker="let effMax ="),
  P("ONE max depth incl. bathymetry (no 1000m cap)",
    E("const effectiveMaxDepth = Math.max(cur.maxDepth ?? 0, maxDepthVal, 100);"),
    "let bMax = 0;\n      for (const r of (cur.bathyGrid || cur.volumeData?.bathymetry || [])) for (const v of (r || [])) if (Number.isFinite(v) && v > bMax) bMax = v;\n"
    "      const effectiveMaxDepth = Math.max(cur.maxDepth ?? 0, maxDepthVal, bMax, 100);\n      effMax = effectiveMaxDepth;",
    marker="effMax = effectiveMaxDepth;"),
  P("inspector depth uses same max", E("const curMaxDepth = Math.max(cur.maxDepth ?? 0, 1000);"),
    "const curMaxDepth = effMax;", marker="const curMaxDepth = effMax;"),
  P("stop stacked flat sheets", r"if \(!useTerrainMode\) \{\n(\s*)// Fallback: build the old stacked horizontal sheets",
    lambda m: "if (false) { // stacked sheets disabled: terrain only\n" + m.group(1) + "// Fallback: build the old stacked horizontal sheets",
    marker="stacked sheets disabled"),
  P("stop flat bathymetry plane", r"if \(!useTerrainMode\) \{\n(\s*)const bathySegs",
    lambda m: "if (false) { // flat plane disabled\n" + m.group(1) + "const bathySegs", marker="flat plane disabled"),
  P("terrain fn takes colorDepth", E("modelDepth, anomalyMode, anomalyThreshold, minVal, maxVal) {"),
    "modelDepth, anomalyMode, anomalyThreshold, minVal, maxVal, colorDepth = 0) {", marker="maxVal, colorDepth = 0) {"),
  P("terrain colour = slice nearest selected depth",
    E("const colorSlice = sorted[0]; // shallowest available slice"),
    "const colorSlice = sorted.length ? sorted.reduce((b, s) => (Math.abs((s.depth_m ?? 0) - colorDepth) < Math.abs((b.depth_m ?? 0) - colorDepth) ? s : b), sorted[0]) : undefined;",
    marker="colorDepth) < Math.abs"),
  P("terrain call passes selected depth", r"minVal, maxVal\n(\s*)\);",
    lambda m: "minVal, maxVal, Number(cur.depth || 0)\n" + m.group(1) + ");", marker="maxVal, Number(cur.depth || 0)"),
  P("no far-away colour fill", r"( +)if \(nearLon === null\) return NaN;",
    lambda m: m.group(0) + "\n" + m.group(1) + "if (Math.abs(nearLat - lk) > 0.5 || Math.abs(nearLon - lok) > 0.5) return NaN;",
    marker="Math.abs(nearLat - lk) > 0.5"),
  P("bathySource prop", r"(  bathyLons = null,\n)(  grid = \[\],)",
    lambda m: m.group(1) + "  bathySource = null,\n" + m.group(2), marker="bathySource = null,"),
  P("bathySource in dataRef/deps (x4)", r"bathyLons, grid, floats", "bathyLons, bathySource, grid, floats",
    marker="bathyLons, bathySource, grid", n=1),
  P("HUD badge definitions", r"( +)const anomalyBadge = cur\.anomalyMode",
    lambda m: m.group(1) + BADGES + "const anomalyBadge = cur.anomalyMode", marker="const dataBadgeX ="),
  P("HUD shows badges", E("${modeBadge}${anomalyBadge}"), "${modeBadge}${anomalyBadge}${dataBadgeX}${bathyBadgeX}",
    marker="${dataBadgeX}${bathyBadgeX}"),
])

# ───────────────────────── OceanWorkspace.jsx ─────────────────────────
UNION = '''bathySource = bathySource || tileData.bathymetry_source || null;
      {
        const _bl = tileData.bathymetry_lats || [], _bo = tileData.bathymetry_lons || [];
        _bl.forEach((v) => bLatSet.add(v)); _bo.forEach((v) => bLonSet.add(v));
        (tileData.bathymetry || []).forEach((row, i) => (row || []).forEach((v, j) => {
          if (v != null && Number.isFinite(v)) bathyMap.set(`${_bl[i]}_${_bo[j]}`, v);
        }));
      }'''
RANGE_UI = '''{!isFullMode && nativeDepths.length > 0 && (() => {
            const fmt = (d) => `${d < 1 ? Number(d).toFixed(2) : Math.round(d)}m`;
            const loadRange = () => {
              const s = Number(startDepth ?? nativeDepths[0]);
              const e = Number(endDepth ?? nativeDepths[nativeDepths.length - 1]);
              const lo = Math.min(s, e), hi = Math.max(s, e);
              const inR = nativeDepths.filter((d) => d >= lo - 1e-6 && d <= hi + 1e-6);
              const M = 14;
              const pick = inR.length <= M ? inR : Array.from({ length: M }, (_, i) => inR[Math.round(i * (inR.length - 1) / (M - 1))]);
              if (!pick.length) return;
              setSubsetDepthsStr(pick.map((d) => Number(d).toFixed(3)).join(','));
              setDepth(pick[0]);
            };
            const cls = 'bg-[#061021] text-white border border-[#1C3A63] rounded px-1 py-0.5 text-[11px]';
            return (
              <div className="flex items-center gap-1.5 text-[11px] text-[#CBD5E1]">
                <span>START</span>
                <select className={cls} value={startDepth ?? nativeDepths[0]} onChange={(e) => setStartDepth(Number(e.target.value))}>
                  {nativeDepths.map((d) => <option key={d} value={d}>{fmt(d)}</option>)}
                </select>
                <span>END</span>
                <select className={cls} value={endDepth ?? nativeDepths[nativeDepths.length - 1]} onChange={(e) => setEndDepth(Number(e.target.value))}>
                  {nativeDepths.map((d) => <option key={d} value={d}>{fmt(d)}</option>)}
                </select>
                <button type="button" onClick={loadRange} className="px-2 py-0.5 rounded bg-teal-500 text-white font-bold cursor-pointer">LOAD</button>
                <span className="text-[#8EA4C8] font-mono">
                  loaded {depthSlices.length ? `${fmt(depthSlices[0].depth_m)}–${fmt(depthSlices[depthSlices.length - 1].depth_m)} · ${depthSlices.length} layers` : '—'}
                </span>
              </div>
            );
          })()}
          '''
NATIVE_MAX = '''const _slabVol = isFullMode ? fullVolumeData : volumeData;
  let _bathyMax = 0;
  (_slabVol?.bathymetry || []).forEach((r) => (r || []).forEach((v) => { if (Number.isFinite(v) && v > _bathyMax) _bathyMax = v; }));
  const nativeMaxDepth = Math.max(
    depthLevelsInfo?.max_depth_m || 0, _slabVol?.max_depth_m || 0, _bathyMax,
    ...activeDepthSlices.map((s) => s.depth_m || 0),
    nativeDepths.length ? nativeDepths[nativeDepths.length - 1] : 0, 100,
  );'''
run("OceanWorkspace.jsx", [
  P("depth range state", E("const activeRegion = bbox || region || selectedPoint || null;"),
    lambda m: m.group(0) + "\n  const [subsetDepthsStr, setSubsetDepthsStr] = useState('0,10,50,100,200,500,1000');\n  const [startDepth, setStartDepth] = useState(null);\n  const [endDepth, setEndDepth] = useState(null);",
    marker="setSubsetDepthsStr] = useState"),
  P("hook gets depth list", E("} = useOceanSnapshot(activeRegion);"), "} = useOceanSnapshot(activeRegion, subsetDepthsStr);",
    marker="useOceanSnapshot(activeRegion, subsetDepthsStr)"),
  P("anomaly uses depth list", E("depths: '0,10,50,100,200,500,1000',"), "depths: subsetDepthsStr,", marker="depths: subsetDepthsStr,"),
  P("anomaly deps", E("}, [anomalyOn, viewport, selectedVariable]);"), "}, [anomalyOn, viewport, selectedVariable, subsetDepthsStr]);",
    marker="selectedVariable, subsetDepthsStr]"),
  P("full merge: bathy accumulators",
    E("let mergedBathyGrid = null, mergedBathyLats = null, mergedBathyLons = null;"),
    "const bathyMap = new Map(), bLatSet = new Set(), bLonSet = new Set();\n    let bathySource = null;\n"
    "    const _nl = (l) => ((west > east && l < west) ? l + 360 : l);",
    marker="const bathyMap = new Map()"),
  P("full merge: max depth starts at 0", E("let mergedMaxDepth = 5727.917;"), "let mergedMaxDepth = 0;", marker="let mergedMaxDepth = 0;"),
  P("full merge: output grid",
    r"bathymetry: mergedBathyGrid \|\| \[\],\s*bathymetry_lats: mergedBathyLats \|\| \[\],\s*bathymetry_lons: mergedBathyLons \|\| \[\],",
    "bathymetry: (() => { const la = [...bLatSet].sort((a, b) => a - b); const lo = [...bLonSet].sort((a, b) => _nl(a) - _nl(b)); return la.map((x) => lo.map((y) => bathyMap.get(`${x}_${y}`) ?? null)); })(),\n"
    "        bathymetry_lats: [...bLatSet].sort((a, b) => a - b),\n"
    "        bathymetry_lons: [...bLonSet].sort((a, b) => _nl(a) - _nl(b)),\n"
    "        bathymetry_source: bathySource,",
    marker="bathymetry_source: bathySource,"),
  P("full merge: union every tile's bathymetry",
    r"if \(!mergedBathyGrid && tileData\.bathymetry\?\.length > 0 && tileData\.bathymetry_lats\?\.length > 0\) \{\n\s*mergedBathyGrid = tileData\.bathymetry;\n\s*mergedBathyLats = tileData\.bathymetry_lats;\n\s*mergedBathyLons = tileData\.bathymetry_lons;\n\s*\}",
    UNION, marker="bathySource = bathySource || tileData"),
  P("full mode: no fallback to 7-layer subset",
    r"const activeDepthSlices = isFullMode && fullDepthSlices\.length > 0\s*\?\s*fullDepthSlices\s*:\s*\(anomalyOn",
    "const activeDepthSlices = isFullMode\n    ? fullDepthSlices\n    : (anomalyOn", marker="const activeDepthSlices = isFullMode\n    ? fullDepthSlices"),
  P("ONE effective max depth", r"const nativeMaxDepth = depthLevelsInfo\?\.max_depth_m \|\| fullVolumeData\?\.max_depth_m \|\| 5727\.9;",
    NATIVE_MAX, marker="const _slabVol ="),
  P("depth buttons fallback no 1000 cap", E("return [0, 20, 50, 100, 200, 400, 600, 800, 1000];"),
    "return [0, 20, 50, 100, 200, 500, 1000, 2000, 3000, 4000, 5000, 5728].filter((d) => d <= nativeMaxDepth);",
    marker="5000, 5728].filter((d) => d <= nativeMaxDepth)"),
  P("depth buttons deps", E("}, [nativeDepths]);"), "}, [nativeDepths, nativeMaxDepth]);", marker="[nativeDepths, nativeMaxDepth]"),
  P("START -> END -> LOAD UI", r"( +)\{fullLoading && \(\n( +)<span className=\"text-\[11px\] text-sky-400",
    lambda m: m.group(1) + RANGE_UI + m.group(0).lstrip(" "), marker="LOAD</button>"),
  P("bathySource prop to slab",
    E("bathyLons={isFullMode ? fullVolumeData?.bathymetry_lons : volumeData?.bathymetry_lons}"),
    lambda m: m.group(0) + "\n            bathySource={isFullMode ? fullVolumeData?.bathymetry_source : volumeData?.bathymetry_source}",
    marker="bathySource={isFullMode"),
])

bad_any = False
for f, (ok, skip, bad) in report.items():
    print(f"\n== {f}")
    for x in ok: print("  applied :", x)
    for x in skip: print("  skipped :", x, "(already applied)")
    for x in bad: print("  FAILED  :", x); bad_any = True
    if bad: print("  -> nothing written for this file")
print("\nBackups: <file>.bak next to each patched file. Restart the frontend dev server.")
sys.exit(1 if bad_any else 0)

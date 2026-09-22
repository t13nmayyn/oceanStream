# PHASE 2D FINAL VISUAL FIX STATUS

## Confirmed Root Causes

1. **CSS hardcoded height (440px)**: Already fixed in previous pass — `.slab-frame` and `.ocean-slab-canvas` now use `height: 100%` to participate in the flex layout.
2. **Camera fit padding too tight (1.1)**: The bounding sphere fit at 1.1 placed the slab at roughly 70–85% of the viewport — too large per the final spec.
3. **Wrong axis used for halfHeight**: The slab geometry lies in the **XZ plane** (longitude = X, latitude = Z, depth-offset = Y). The previous implementation used `Math.max(size.y, size.z) / 2`, but `size.y` is near-zero (no Y spread in a depth slice), so `size.z` (latitude extent) is the only meaningful value. Now using `size.z / 2` exclusively.
4. **Dark navy behind slab canvas**: Setting the workspace to `bg-slate-950` / `#0F2A4A` caused the transparent canvas to bleed that dark color through, making the visualization look like a debug panel rather than a clean scientific workspace.

---

## Files Changed

| File | Change |
|---|---|
| `OceanSlab.jsx` | Increased padding from `1.1` → `1.75`, fixed halfHeight axis, restored `scene.background = '#F8FAFC'`, set `alpha: false` |
| `OceanWorkspace.jsx` | Replaced all dark `bg-slate-950 / #0F2A4A` workspace classes with white/navy: `bg-[#F8FAFC]`, `text-[#0B1E3D]`, navy borders, teal accents |
| `OceanDetailPage.jsx` | Replaced `DataPanelPlaceholder` dark panel with white surface + navy text |

---

## Camera-Fit Formula

```js
const vFov = THREE.MathUtils.degToRad(camera.fov);            // 40° → 0.698 rad
const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);     // horizontal FOV
const halfWidth  = size.x / 2;   // longitude extent / 2
const halfHeight = size.z / 2;   // latitude extent / 2 (slab is in XZ plane)

const distV = halfHeight / Math.tan(vFov / 2);   // distance to see full Z
const distH = halfWidth  / Math.tan(hFov / 2);   // distance to see full X

let dist = Math.max(distV, distH) * 1.75;        // comfortable breathing room
dist = Math.max(dist, 10);                        // prevent degenerate close-up
```

Framing target: ~45–55% of useful viewport at typical aspect ratios.

---

## World-Space Bounds Strategy

- `scene.updateMatrixWorld(true)` called before `Box3.setFromObject(field)` to capture the `depthY` transform.
- `field` is the `THREE.Points` mesh rendered by `update()` — contains actual world-space point positions.
- If empty geometry: returns without touching camera.

---

## Resize Strategy

- `ResizeObserver` updates `renderer.setSize`, `camera.aspect`, and `camera.updateProjectionMatrix()` on every container size change.
- A `setTimeout(150ms)` debounce re-triggers `fitCameraToSelection` only when `lastFitSignatureRef.current` is non-empty (meaning a real data-fit has been done before) — prevents snapping during initial loading.

---

## Fit Triggers (Data-Change Signature)

Re-fits when `${variable}-${depth}-${dataDepth}-${JSON.stringify(bounds)}` changes. Covers:
- variable switch
- depth slider change
- newly fetched data at same depth (when `dataDepth` differs from `depth`)
- region change (bounds change)

No re-fit on: opacity changes, threshold changes, float position updates, React re-renders.

---

## Palette Summary (Ocean Detail)

| Role | Color |
|---|---|
| Page shell (top bar, header) | `#0B1E3D` |
| Visualization surface | `#F8FAFC` (soft white) |
| Three.js canvas background | `#F8FAFC` |
| Slab frame border | `#1C3A63/30` |
| Depth control strip | `#F8FAFC` + `#1C3A63/20` border |
| Colorbar card | `white/95` + `#1C3A63/30` border |
| Primary text | `#0B1E3D` |
| Secondary/muted text | `#6B7C96` |
| Active controls accent | teal-500 |
| Copilot | **Unchanged** — dark/sonar identity preserved |

---

## Remaining Limitations

- If data load returns a single point (degenerate grid), bounding box will still produce a valid center but essentially no real halfWidth/halfHeight, falling back to the `Math.max(dist, 10)` floor.
- Argo float markers are positioned in the same XZ plane as the slab — if floats are outside the snapshot bbox, they may extend past the camera framing but remain visible via OrbitControls interaction.

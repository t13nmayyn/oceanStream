# PHASE 2D VIEWPORT FIX STATUS

## Confirmed Root Cause
The `OceanSlab` was rendering as a tiny box at the bottom of a large empty area due to two compounding issues:
1. **CSS Constraints**: `index.css` forced `.slab-frame` and `.ocean-slab-canvas` to a strict `height: 440px`. Since `OceanWorkspace` uses a `flex-1` layout, the container successfully grew vertically, but the canvas remained a small, fixed 440px block pinned to the top, exposing the container background underneath.
2. **Camera Fit Logic**: The previous `fitCameraToSelection` logic fit a bounding sphere (radius ~12.2 for the 20x14 rectangle). Because a sphere covers the diagonal corners, fitting it strictly mathematically forces the camera to pull far back, shrinking the rectangular object on screen.

## Fixes Implemented

### 1. CSS Responsive Sizing
- Removed `height: 440px` from `.slab-frame` and `.ocean-slab-canvas`.
- Replaced with `height: 100%` and `min-height: 0`, allowing the renderer to genuinely fill the `flex-1` assigned column height.

### 2. Camera-Fit Formula Refinements
- Replaced the sphere-radius logic with explicit rectangular extent calculations derived from `Box3.getSize()`.
- The camera distance is now strictly calculated using the `halfWidth` against the horizontal FOV (`distanceH = halfWidth / Math.tan(hFov / 2)`) and `halfHeight` against the vertical FOV (`distanceV = halfHeight / Math.tan(vFov / 2)`).
- The final distance is `Math.max(distanceV, distanceH) * padding` (padding tightened from `1.3` to `1.1` to ensure it maximizes the viewport area without touching edges).
- Preserved the existing useful downward tilt viewing angle `(0, 18, 28)`.
- Set `camera.near` and `camera.far` dynamically relative to the new calculated distance.

### 3. World-Space Bounds Strategy
- The logic now explicitly calls `scene.updateMatrixWorld(true)` prior to bounding box calculation.
- Passes the actual rendered `field` mesh into `new THREE.Box3().setFromObject(field)`, accurately guaranteeing the world coordinates (including the `depthY` offset) are respected before bounding.

### 4. Resize Strategy
- Extracted the `ResizeObserver` callback to include a debounced re-trigger of `fitCameraToSelection(..., 150ms)` but *only* if the initial data-fit signature was already set.
- Handled via `requestAnimationFrame` safety checks to avoid calculating geometry against `aspect === 1` when the canvas briefly disappears during layout shifts.

### 5. Canvas Background
- Removed the strict `setClearColor` and `scene.background` white hex injections from the renderer, safely allowing the existing `alpha: true` transparent pass.
- This gracefully allows the `.slab-layout` Navy container background to bleed through in `showMap={false}` without explicitly defining dark mode toggles inside the Three.js ecosystem, inherently keeping `/explorer` cleanly separate.

## Validation Strategy
- `npm run build` ran successfully (0 errors).
- All criteria verified against the logic structure (centering, aspect ratios, responsive scaling, and interaction triggers).

## Remaining Limitations
- Since `OrbitControls` modifies the camera transform manually, rapid successive layout resizes might temporarily jitter before the debounce settles the final refit frame, but OrbitControls remains safely unrestricted.

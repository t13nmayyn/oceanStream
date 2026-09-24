import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants for terrain-elevation rendering.
//
//   TEMP_RELIEF_SCALE  — scene-units of vertical relief added purely from the
//   temperature term within a single depth layer.  At 4.0 a full cold→warm
//   transition lifts the surface ~4 scene-units.  Increase to 6-8 for more
//   dramatic mountains; decrease to 2 if data has very small gradients.
//   Exported so the upcoming volumetric depth-stack revision can import and
//   reuse it without duplicating the math.
//
//   DEPTH_LAYER_SPREAD — scene-units per meter of real depth, scaled by the
//   user's verticalExaggeration slider (10–60 range).
// ─────────────────────────────────────────────────────────────────────────────
export const TEMP_RELIEF_SCALE = 4.0;
const DEPTH_LAYER_SPREAD = 0.18; // scene-units per metre of depth

// ─────────────────────────────────────────────────────────────────────────────
// computeElevation — standalone, reusable per-vertex elevation function.
//
// Returns the scene-space Y position for a data point by combining:
//   (a) depth_layer_offset  — places the layer at its real vertical position
//                             (0 m = highest Y, 1000 m = lowest Y)
//   (b) temperature relief  — warm water within a layer sits higher than cold,
//                             creating the terrain-mountain visual.
//
// Parameters:
//   temperature  — actual value for this point
//   min_temp     — dataset minimum
//   temp_range   — (max - min), pre-computed
//   depth_m      — real-world depth in metres
//   verticalExag — user-controlled exaggeration (10–60 from workspace slider)
//
// The upcoming volumetric depth-stack revision applies this same function
// per depth layer, so the formula is isolated here rather than inlined.
// ─────────────────────────────────────────────────────────────────────────────
export function computeElevation(temperature, min_temp, temp_range, depth_m, verticalExag) {
  const normalizedTemp = Math.max(0, Math.min(1, (temperature - min_temp) / Math.max(temp_range, 0.0001)));
  const tempRelief     = normalizedTemp * TEMP_RELIEF_SCALE;
  // 0 m → y near +TEMP_RELIEF_SCALE; 1000 m → deeply negative
  const depthOffset    = -(depth_m * DEPTH_LAYER_SPREAD * (verticalExag / 35));
  return tempRelief + depthOffset;
}

// Vibrant 6-stop turbo/rainbow color ramps matching the 3D Ocean Engine
// (kept exactly as-is — green/gold midpoint already present in temperature)
const STOPS = {
  temperature: ['#0033cc', '#00b4d8', '#00e08c', '#ffd166', '#ff7700', '#f54375'],
  salinity: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#e0aaff', '#7209b7'],
  currents: ['#051923', '#006494', '#00a6fb', '#0582ca', '#00f5d4', '#70e000'],
  chlorophyll: ['#081c15', '#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc'],
  oxygen: ['#3a0ca3', '#4361ee', '#4cc9f0', '#70e000', '#ffaa00', '#ff0054'],
  ph: ['#d00000', '#e85d04', '#ffba08', '#52b788', '#0077b6', '#03045e'],
  nitrate: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd', '#38b000'],
  pco2: ['#f72585', '#b5179e', '#7209b7', '#560bad', '#480ca8', '#3a0ca3'],
};

function valueFor(point, variable) {
  const aliases = {
    temperature: ['temperature_c', 'temperature', 'thetao', 'temp'],
    salinity: ['salinity_psu', 'salinity', 'so'],
    currents: ['current_speed', 'velocity'],
    chlorophyll: ['chlorophyll_mgl', 'chlorophyll', 'chl'],
    oxygen: ['oxygen_mmolm3', 'oxygen', 'dissolved_oxygen', 'o2'],
    ph: ['ph', 'pH'],
    nitrate: ['nitrate_mmolm3', 'nitrate', 'no3'],
    pco2: ['pco2_uatm', 'pco2', 'spco2'],
  };
  if (variable === 'currents') {
    return Math.hypot(Number(point?.current_u_ms ?? point?.uo ?? 0), Number(point?.current_v_ms ?? point?.vo ?? 0));
  }
  const key = (aliases[variable] || aliases.temperature).find((name) => point?.[name] != null);
  return Number(point?.[key] ?? 0);
}

function interpolateColor(t, palette) {
  const clampedT = Math.max(0, Math.min(1, t));
  const segmentCount = palette.length - 1;
  const segment = Math.min(Math.floor(clampedT * segmentCount), segmentCount - 1);
  const segmentT = (clampedT - segment / segmentCount) * segmentCount;

  const c1 = new THREE.Color(palette[segment]);
  const c2 = new THREE.Color(palette[segment + 1]);
  return c1.lerp(c2, segmentT);
}

function colorFor(value, min, max, variable) {
  const palette = STOPS[variable] || STOPS.temperature;
  const range = Math.max(max - min, 0.0001);
  const t = (value - min) / range;
  return interpolateColor(t, palette);
}

export default function OceanSlab({
  grid = [],
  floats = [],
  variable = 'temperature',
  depth = 0,
  dataDepth = depth,
  bounds,
  opacity = 0.98,
  verticalExaggeration = 35,   // matches workspace slider range (10–60)
  threshold,
  onSelectMarker,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const captionRef = useRef(null);
  const dataRef = useRef({ grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold });

  useEffect(() => {
    dataRef.current = { grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold };
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  // Keep caption text in sync with the current exaggeration value
  useEffect(() => {
    if (captionRef.current) {
      const approxScale = Math.round(TEMP_RELIEF_SCALE * (verticalExaggeration / 35) * 10);
      captionRef.current.textContent =
        `Elevation shows relative temperature (exaggerated ×${approxScale}) — not seafloor depth`;
    }
  }, [verticalExaggeration]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // ── 1. Scene setup ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06090f');

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    camera.position.set(0, 16, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor('#06090f', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ── Disclaimer caption (HTML overlay — scientifically required) ───────────
    // Without this, the terrain elevation falsely implies real bathymetry.
    // Caption sits just above the colorbar, always visible.
    const caption = document.createElement('div');
    caption.style.cssText = [
      'position:absolute',
      'bottom:52px',
      'right:8px',
      'pointer-events:none',
      'font-size:10px',
      'font-family:ui-monospace,monospace',
      'color:rgba(180,210,240,0.82)',
      'background:rgba(6,9,15,0.68)',
      'padding:3px 7px',
      'border-radius:4px',
      'border:1px solid rgba(30,48,85,0.6)',
      'max-width:320px',
      'text-align:right',
      'line-height:1.35',
      'z-index:10',
    ].join(';');
    const initScale = Math.round(TEMP_RELIEF_SCALE * ((dataRef.current.verticalExaggeration ?? 35) / 35) * 10);
    caption.textContent =
      `Elevation shows relative temperature (exaggerated ×${initScale}) — not seafloor depth`;
    mount.appendChild(caption);
    captionRef.current = caption;

    // ── Orbit controls ────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0, 0);
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.update();

    // ── 2. Cinematic 3D Lighting for Vibrant Extruded Topography ──
    const ambientLight = new THREE.AmbientLight('#ffffff', 1.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight('#ffffff', 2.4);
    sunLight.position.set(16, 28, 18);
    scene.add(sunLight);

    const sideLight = new THREE.DirectionalLight('#00e0ff', 1.2);
    sideLight.position.set(-18, 10, -14);
    scene.add(sideLight);

    // ── 3. Centered 3D Extruded Ocean Columns (Deck.gl / Voxel Style) ──
    const MAX_PILLARS = 4500;
    const pillarGeo = new THREE.CylinderGeometry(0.32, 0.36, 1, 6);
    const pillarMat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.98,
    });
    const pillarMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, MAX_PILLARS);
    pillarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(pillarMesh);

    // ── 4. Floating 3D Argo Float Markers (Glow Spheres) ──
    const floatGeo = new THREE.SphereGeometry(0.38, 16, 16);
    const floatMat = new THREE.MeshStandardMaterial({
      color: '#00f5d4',
      emissive: '#00c8ff',
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const markerMesh = new THREE.InstancedMesh(floatGeo, floatMat, 256);
    scene.add(markerMesh);

    // ── 5. Vector Flow Arrows (Active only on currents) ──
    const MAX_VECTORS = 1000;
    const arrowGeo = new THREE.ConeGeometry(0.18, 0.55, 6);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: '#00f5d4',
      emissive: '#0077b6',
      emissiveIntensity: 0.7,
      roughness: 0.2,
    });
    const vectorMesh = new THREE.InstancedMesh(arrowGeo, arrowMat, MAX_VECTORS);
    vectorMesh.visible = false;
    scene.add(vectorMesh);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const fallbackBounds = { west: 75, east: 85, south: 10, north: 16 };

    // ── Update Model Function ─────────────────────────────────────────────────
    const update = () => {
      const current = dataRef.current;
      const points = current.grid || [];
      if (!points.length) return;

      const currentBounds = current.bounds || fallbackBounds;
      const west  = Number(currentBounds.west  ?? currentBounds.lon_min ?? 75);
      const east  = Number(currentBounds.east  ?? currentBounds.lon_max ?? 85);
      const south = Number(currentBounds.south ?? currentBounds.lat_min ?? 10);
      const north = Number(currentBounds.north ?? currentBounds.lat_max ?? 16);

      const values = points.map((p) => valueFor(p, current.variable));
      const min   = Math.min(...values);
      const max   = Math.max(...values);
      const range = Math.max(max - min, 0.0001);

      const modelWidth = 18;
      const modelDepth = 14;
      const exag = current.verticalExaggeration ?? 35;

      // Pillar visual HEIGHT is a small fixed constant — the terrain work is
      // done by the Y-position.  Decoupling the two prevents height from
      // fighting the elevation signal (which was the "flat fish-tank" problem).
      const PILLAR_HEIGHT = 0.55;

      // Update on-canvas caption with the live scale factor
      if (captionRef.current) {
        const approxScale = Math.round(TEMP_RELIEF_SCALE * (exag / 35) * 10);
        captionRef.current.textContent =
          `Elevation shows relative temperature (exaggerated ×${approxScale}) — not seafloor depth`;
      }

      const sampleStep    = Math.max(1, Math.floor(points.length / MAX_PILLARS));
      const renderedCount = Math.min(MAX_PILLARS, Math.floor(points.length / sampleStep));

      const matrix     = new THREE.Matrix4();
      const position   = new THREE.Vector3();
      const rotation   = new THREE.Euler();
      const quaternion = new THREE.Quaternion();
      const scale      = new THREE.Vector3();

      let pIdx = 0;
      for (let i = 0; i < points.length && pIdx < renderedCount; i += sampleStep) {
        const pt  = points[i];
        const val = values[i];

        // X/Z — geo-coordinates projected to scene space, centered at origin
        const normX = ((Number(pt.lon) - west)  / Math.max(east  - west,  0.0001) - 0.5) * modelWidth;
        const normZ = ((Number(pt.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;

        // Y — terrain elevation via computeElevation().
        // Warm surface = higher Y.  Cold/deep = lower Y.
        // The volumetric stack revision will call this same function per layer.
        const depthM  = Number(pt.depth_m ?? pt.depth ?? current.dataDepth ?? 0);
        const yCenter = computeElevation(val, min, range, depthM, exag);

        position.set(normX, yCenter, normZ);
        scale.set(1.15, PILLAR_HEIGHT, 1.15);
        quaternion.setFromEuler(rotation);
        matrix.compose(position, quaternion, scale);
        pillarMesh.setMatrixAt(pIdx, matrix);

        // Color ramp — warm=orange/red, cold=blue — kept exactly as-is
        const col = colorFor(val, min, max, current.variable);

        // Threshold highlight
        const matchesThreshold = current.threshold?.enabled && (
          current.threshold.operator === '>' ? val >  current.threshold.value :
          current.threshold.operator === '<' ? val <  current.threshold.value :
          Math.abs(val - current.threshold.value) <= current.threshold.tolerance
        );
        if (matchesThreshold) col.set('#ffeb3b');

        pillarMesh.setColorAt(pIdx, col);
        pIdx++;
      }

      pillarMesh.count = pIdx;
      pillarMesh.instanceMatrix.needsUpdate = true;
      if (pillarMesh.instanceColor) pillarMesh.instanceColor.needsUpdate = true;
      pillarMat.opacity = current.opacity ?? 0.98;

      // ── Current flow arrows — same computeElevation() for Y position ────────
      if (current.variable === 'currents') {
        vectorMesh.visible = true;
        let vIdx = 0;
        for (let i = 0; i < points.length && vIdx < MAX_VECTORS; i += sampleStep * 2) {
          const pt    = points[i];
          const u     = Number(pt.current_u_ms ?? 0);
          const v     = Number(pt.current_v_ms ?? 0);
          const speed = Math.hypot(u, v);
          if (speed < 0.005) continue;

          const normX  = ((Number(pt.lon) - west)  / Math.max(east  - west,  0.0001) - 0.5) * modelWidth;
          const normZ  = ((Number(pt.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
          const depthM = Number(pt.depth_m ?? pt.depth ?? current.dataDepth ?? 0);
          const yArrow = computeElevation(speed, min, range, depthM, exag) + 0.5;

          const angle = Math.atan2(u, v);
          rotation.set(0, angle, 0);
          quaternion.setFromEuler(rotation);
          position.set(normX, yArrow, normZ);
          scale.set(1, 1, Math.min(2.5, 0.8 + speed * 5));
          matrix.compose(position, quaternion, scale);
          vectorMesh.setMatrixAt(vIdx, matrix);
          vIdx++;
        }
        vectorMesh.count = vIdx;
        vectorMesh.instanceMatrix.needsUpdate = true;
      } else {
        vectorMesh.visible = false;
      }

      // ── Argo float markers — hover above warm-surface terrain level ──────────
      const floatsList = current.floats || [];
      const floatCount = Math.min(floatsList.length, 256);
      markerMesh.count = floatCount;

      // Warm-surface reference: evaluate at max temp, depth = 0
      const surfaceY = computeElevation(max, min, range, 0, exag);

      floatsList.slice(0, floatCount).forEach((float, idx) => {
        const fx = ((Number(float.lng ?? float.lon) - west)  / Math.max(east  - west,  0.0001) - 0.5) * modelWidth;
        const fz = ((Number(float.lat) - south)              / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
        const fy = surfaceY + 0.7; // hover gap above the warmest surface point

        position.set(fx, fy, fz);
        scale.set(1, 1, 1);
        rotation.set(0, 0, 0);
        quaternion.setFromEuler(rotation);
        matrix.compose(position, quaternion, scale);
        markerMesh.setMatrixAt(idx, matrix);
      });
      markerMesh.instanceMatrix.needsUpdate = true;
    };

    update();

    // ── Resize Observer ──
    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // ── Click Interactions on Argo Markers ──
    const onClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hit = raycaster.intersectObject(markerMesh)[0];
      if (hit && dataRef.current.floats[hit.instanceId]) {
        onSelectMarker?.(dataRef.current.floats[hit.instanceId]);
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    // ── Render Loop ──
    let frame;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    sceneRef.current = { update };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      pillarGeo.dispose();
      pillarMat.dispose();
      arrowGeo.dispose();
      arrowMat.dispose();
      floatGeo.dispose();
      floatMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(caption)) mount.removeChild(caption);
      captionRef.current = null;
    };
  }, [onSelectMarker]);

  useEffect(() => {
    sceneRef.current?.update();
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  return (
    <div
      ref={mountRef}
      className="ocean-slab-canvas w-full h-full relative"
      aria-label="3D Terrain-Elevation Ocean Topography"
    />
  );
}

export { DEPTH_BINS };

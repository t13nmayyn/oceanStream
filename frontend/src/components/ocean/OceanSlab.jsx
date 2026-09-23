import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// Vibrant 6-stop turbo/rainbow color ramps matching the 3D Ocean Engine
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
  verticalExaggeration = 1.4,
  threshold,
  onSelectMarker,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const dataRef = useRef({ grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold });

  useEffect(() => {
    dataRef.current = { grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold };
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // ── 1. Clean Deep Oceanic Canvas (No tank, no cage) ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06090f');

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    camera.position.set(0, 16, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor('#06090f', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

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

    // ── Update Model Function ──
    const update = () => {
      const current = dataRef.current;
      const points = current.grid || [];
      if (!points.length) return;

      const currentBounds = current.bounds || fallbackBounds;
      const west = Number(currentBounds.west ?? currentBounds.lon_min ?? 75);
      const east = Number(currentBounds.east ?? currentBounds.lon_max ?? 85);
      const south = Number(currentBounds.south ?? currentBounds.lat_min ?? 10);
      const north = Number(currentBounds.north ?? currentBounds.lat_max ?? 16);

      const values = points.map((p) => valueFor(p, current.variable));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, 0.0001);

      // Width & Depth scaling for perfect centering
      const modelWidth = 18;
      const modelDepth = 14;
      const maxExtrusionHeight = 6.0 * (current.verticalExaggeration || 1.4);

      const sampleStep = Math.max(1, Math.floor(points.length / MAX_PILLARS));
      const renderedCount = Math.min(MAX_PILLARS, Math.floor(points.length / sampleStep));

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Euler();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      let pIdx = 0;
      for (let i = 0; i < points.length && pIdx < renderedCount; i += sampleStep) {
        const pt = points[i];
        const val = values[i];

        // Center X and Z around (0, 0)
        const normX = ((Number(pt.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * modelWidth;
        const normZ = ((Number(pt.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;

        // Elevation mapped to value & vertically centered around Y=0
        const normVal = Math.max(0, Math.min(1, (val - min) / range));
        const height = Math.max(0.4, normVal * maxExtrusionHeight);
        const yPos = -maxExtrusionHeight / 2 + height / 2;

        position.set(normX, yPos, normZ);
        scale.set(1.15, height, 1.15);
        quaternion.setFromEuler(rotation);
        matrix.compose(position, quaternion, scale);

        pillarMesh.setMatrixAt(pIdx, matrix);

        // Color ramp
        const col = colorFor(val, min, max, current.variable);

        // Threshold highlight
        const matchesThreshold = current.threshold?.enabled && (
          current.threshold.operator === '>' ? val > current.threshold.value :
          current.threshold.operator === '<' ? val < current.threshold.value :
          Math.abs(val - current.threshold.value) <= current.threshold.tolerance
        );
        if (matchesThreshold) {
          col.set('#ffeb3b');
        }

        pillarMesh.setColorAt(pIdx, col);
        pIdx++;
      }

      pillarMesh.count = pIdx;
      pillarMesh.instanceMatrix.needsUpdate = true;
      if (pillarMesh.instanceColor) pillarMesh.instanceColor.needsUpdate = true;
      pillarMat.opacity = current.opacity ?? 0.98;

      // ── Update Current Vectors ──
      if (current.variable === 'currents') {
        vectorMesh.visible = true;
        let vIdx = 0;
        for (let i = 0; i < points.length && vIdx < MAX_VECTORS; i += sampleStep * 2) {
          const pt = points[i];
          const u = Number(pt.current_u_ms ?? 0);
          const v = Number(pt.current_v_ms ?? 0);
          const speed = Math.hypot(u, v);
          if (speed < 0.005) continue;

          const normX = ((Number(pt.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * modelWidth;
          const normZ = ((Number(pt.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
          const normVal = Math.max(0, Math.min(1, (speed - min) / range));
          const height = Math.max(0.4, normVal * maxExtrusionHeight);
          const yPos = -maxExtrusionHeight / 2 + height + 0.3;

          const angle = Math.atan2(u, v);
          rotation.set(0, angle, 0);
          quaternion.setFromEuler(rotation);
          position.set(normX, yPos, normZ);
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

      // ── Update Floating Float Markers (Centered in Space) ──
      const floatsList = current.floats || [];
      const floatCount = Math.min(floatsList.length, 256);
      markerMesh.count = floatCount;

      floatsList.slice(0, floatCount).forEach((float, idx) => {
        const x = ((Number(float.lng ?? float.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * modelWidth;
        const z = ((Number(float.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
        const y = maxExtrusionHeight / 2 + 0.6; // Hovering right above the surface

        position.set(x, y, z);
        scale.set(1, 1, 1);
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
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [onSelectMarker]);

  useEffect(() => {
    sceneRef.current?.update();
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  return (
    <div
      ref={mountRef}
      className="ocean-slab-canvas w-full h-full relative"
      aria-label="3D Extruded Ocean Topography"
    />
  );
}

export { DEPTH_BINS };

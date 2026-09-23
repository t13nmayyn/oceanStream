import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// High-contrast, scientifically tailored color palettes (designed for light surfaces)
const stops = {
  temperature: ['#1d4ed8', '#0284c7', '#14b8a6', '#f59e0b', '#ef4444', '#b91c1c'],
  salinity: ['#86efac', '#22c55e', '#16a34a', '#15803d', '#14532d'],
  chlorophyll: ['#a7f3d0', '#34d399', '#059669', '#047857', '#064e3b'],
  oxygen: ['#7c3aed', '#6366f1', '#06b6d4', '#10b981', '#047857'],
  ph: ['#dc2626', '#ea580c', '#eab308', '#84cc16', '#16a34a'],
  nitrate: ['#bbf7d0', '#4ade80', '#22c55e', '#15803d', '#052e16'],
  pco2: ['#fef08a', '#facc15', '#f97316', '#dc2626', '#7f1d1d'],
};

function valueFor(point, variable) {
  const aliases = {
    temperature: ['temperature_c', 'temperature', 'thetao'],
    salinity: ['salinity_psu', 'salinity', 'so'],
    chlorophyll: ['chlorophyll_mgl', 'chlorophyll', 'chl'],
    oxygen: ['oxygen_mmolm3', 'oxygen', 'dissolved_oxygen'],
    ph: ['ph', 'pH'],
    nitrate: ['nitrate_mmolm3', 'nitrate', 'no3'],
    pco2: ['pco2_uatm', 'pco2', 'spco2'],
  };
  const key = (aliases[variable] || aliases.temperature).find((name) => point?.[name] != null);
  if (!key) return NaN;
  const num = Number(point[key]);
  return Number.isFinite(num) ? num : NaN;
}

function colorFor(value, min, max, variable) {
  const palette = stops[variable] || stops.temperature;
  const range = max - min;
  const t = range > 0.00001 ? Math.max(0, Math.min(1, (value - min) / range)) : 0.5;
  const numSegments = palette.length - 1;
  const scaledT = t * numSegments;
  const index = Math.min(Math.floor(scaledT), numSegments - 1);
  const localT = scaledT - index;
  return new THREE.Color(palette[index]).lerp(new THREE.Color(palette[index + 1]), localT);
}

function vectorMagnitude(point) {
  if (point?.current_u_ms == null && point?.current_v_ms == null) return NaN;
  return Math.hypot(Number(point?.current_u_ms ?? 0), Number(point?.current_v_ms ?? 0));
}

function createPointTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function fitCameraToVolume(camera, controls, padding = 1.3) {
  if (!camera.aspect || isNaN(camera.aspect) || camera.aspect <= 0) return;

  const center = new THREE.Vector3(0, -6, 0);
  const size = new THREE.Vector3(20, 12, 14);

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const distanceV = (size.y + size.z * 0.5) / Math.tan(vFov / 2);
  const distanceH = (size.x / 2) / Math.tan(vFov / 2) / camera.aspect;

  const cameraDistance = Math.max(distanceV, distanceH) * padding;

  const dirY = 0.55;
  const dirZ = 0.83;
  const offset = new THREE.Vector3(0, cameraDistance * dirY, cameraDistance * dirZ);

  camera.position.copy(center).add(offset);
  controls.target.copy(center);

  camera.near = 0.1;
  camera.far = 1000;
  camera.updateProjectionMatrix();
  controls.update();
}

export default function OceanSlab({
  grid = [],
  floats = [],
  variable = 'temperature',
  depth = 0,
  dataDepth = depth,
  bounds,
  opacity = 0.92,
  verticalExaggeration = 1,
  threshold,
  onSelectMarker,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const dataRef = useRef({ grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold });
  const lastGridRef = useRef(grid);
  const lastFitBoundsRef = useRef('');

  useEffect(() => {
    dataRef.current = { grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold };
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F8FAFC');

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 14, 26);
    camera.lookAt(0, -6, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor('#F8FAFC', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, -6, 0);
    controls.update();

    scene.add(new THREE.AmbientLight('#ffffff', 1.8));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(8, 20, 12);
    scene.add(keyLight);

    // 3D ocean water-column bounding box
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(20, 12, 14)),
      new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.65 })
    );
    box.position.y = -6;
    scene.add(box);

    // Bathymetry floor grid at seafloor (y = -12)
    const seafloor = new THREE.GridHelper(20, 10, '#cbd5e1', '#e2e8f0');
    seafloor.position.y = -12;
    scene.add(seafloor);

    // Continuous 2D heatmap field texture on the depth slice plane
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = 32;
    sliceCanvas.height = 32;
    const sliceTexture = new THREE.CanvasTexture(sliceCanvas);
    sliceTexture.minFilter = THREE.LinearFilter;
    sliceTexture.magFilter = THREE.LinearFilter;

    const sliceMaterial = new THREE.MeshBasicMaterial({
      map: sliceTexture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const slice = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), sliceMaterial);
    slice.renderOrder = 2;
    slice.rotation.x = Math.PI / 2;
    scene.add(slice);

    // Discrete scientific data points
    const pointTexture = createPointTexture();
    const field = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        size: 9,
        map: pointTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        alphaTest: 0.05,
        sizeAttenuation: false,
        depthTest: false,
      })
    );
    field.renderOrder = 3;
    scene.add(field);

    // Velocity vectors
    const vectors = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#0d9488', transparent: true, opacity: 0.9, linewidth: 2 })
    );
    vectors.renderOrder = 4;
    scene.add(vectors);

    // Argo float markers & 3D profile columns
    const markerGroup = new THREE.Group();
    const markerMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
      Math.max(1, floats.length)
    );
    markerGroup.add(markerMesh);

    const floatColumns = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#0284c7', transparent: true, opacity: 0.65 })
    );
    floatColumns.renderOrder = 4;
    markerGroup.add(floatColumns);
    scene.add(markerGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const fallbackBounds = { west: 0, east: 1, south: 0, north: 1 };

    const update = () => {
      const current = dataRef.current;
      if (current.grid.length) lastGridRef.current = current.grid;
      const points = current.grid.length ? current.grid : lastGridRef.current;
      if (!points.length) return;

      const currentBounds = current.bounds || fallbackBounds;
      const west = Number(currentBounds.west ?? currentBounds.lon_min);
      const east = Number(currentBounds.east ?? currentBounds.lon_max);
      const south = Number(currentBounds.south ?? currentBounds.lat_min);
      const north = Number(currentBounds.north ?? currentBounds.lat_max);
      const depthValue = Number(current.dataDepth ?? current.depth ?? 0);
      const depthY = -depthValue * 0.012 * current.verticalExaggeration;

      const values = points.map((point) => (current.variable === 'currents' ? vectorMagnitude(point) : valueFor(point, current.variable)));
      const finiteValues = values.filter(Number.isFinite);
      const hasData = finiteValues.length > 0;
      const min = hasData ? Math.min(...finiteValues) : 0;
      const max = hasData ? Math.max(...finiteValues) : 1;

      // Update positions and colors of discrete sample points
      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);
      points.forEach((point, index) => {
        positions[index * 3] = ((Number(point.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
        positions[index * 3 + 1] = depthY;
        positions[index * 3 + 2] = ((Number(point.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * 14;

        const val = Number.isFinite(values[index]) ? values[index] : min;
        const color = colorFor(val, min, max, current.variable);
        const matches =
          current.threshold?.enabled &&
          Number.isFinite(values[index]) &&
          (current.threshold.operator === '>'
            ? values[index] > current.threshold.value
            : current.threshold.operator === '<'
            ? values[index] < current.threshold.value
            : Math.abs(values[index] - current.threshold.value) <= current.threshold.tolerance);
        if (matches) color.set('#facc15');
        colors.set([color.r, color.g, color.b], index * 3);
      });

      field.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      field.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (field.geometry.attributes.position) field.geometry.attributes.position.needsUpdate = true;
      if (field.geometry.attributes.color) field.geometry.attributes.color.needsUpdate = true;
      field.geometry.computeBoundingBox();
      field.geometry.computeBoundingSphere();
      field.visible = hasData;

      // Draw continuous 2D heatmap field onto sliceCanvas for a real visible 3D ocean field
      const uniqueLats = Array.from(new Set(points.map((p) => Number(p.lat)))).sort((a, b) => a - b);
      const uniqueLons = Array.from(new Set(points.map((p) => Number(p.lon)))).sort((a, b) => a - b);
      if (uniqueLats.length >= 2 && uniqueLons.length >= 2) {
        const w = uniqueLons.length;
        const h = uniqueLats.length;
        if (sliceCanvas.width !== w || sliceCanvas.height !== h) {
          sliceCanvas.width = w;
          sliceCanvas.height = h;
        }
        const ctx = sliceCanvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);

        const valMap = new Map();
        points.forEach((p, idx) => {
          valMap.set(`${Number(p.lat).toFixed(4)}_${Number(p.lon).toFixed(4)}`, values[idx]);
        });

        // Top of canvas (y=0) corresponds to highest latitude (north)
        for (let y = 0; y < h; y++) {
          const lat = uniqueLats[h - 1 - y];
          for (let x = 0; x < w; x++) {
            const lon = uniqueLons[x];
            const val = valMap.get(`${lat.toFixed(4)}_${lon.toFixed(4)}`);
            const col = colorFor(Number.isFinite(val) ? val : min, min, max, current.variable);
            const pIdx = (y * w + x) * 4;
            imgData.data[pIdx] = Math.round(col.r * 255);
            imgData.data[pIdx + 1] = Math.round(col.g * 255);
            imgData.data[pIdx + 2] = Math.round(col.b * 255);
            imgData.data[pIdx + 3] = Number.isFinite(val) ? 225 : 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        sliceTexture.needsUpdate = true;
        slice.visible = hasData;
      }

      // Update vectors
      const vectorPositions = new Float32Array(points.length * 6);
      points.forEach((point, index) => {
        const x = ((Number(point.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
        const z = ((Number(point.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * 14;
        const y = depthY;
        const offsetX = Number(point.current_u_ms ?? 0) * 8;
        const offsetZ = Number(point.current_v_ms ?? 0) * 8;
        vectorPositions.set([x, y, z, x + offsetX, y, z + offsetZ], index * 6);
      });
      vectors.geometry.setAttribute('position', new THREE.BufferAttribute(vectorPositions, 3));
      if (vectors.geometry.attributes.position) vectors.geometry.attributes.position.needsUpdate = true;
      vectors.visible = current.variable === 'currents' && hasData;

      slice.position.y = depthY;
      sliceMaterial.opacity = Math.max(0.4, current.opacity * 0.9);
      field.material.opacity = current.opacity;

      // Framing: Auto-fit camera only when spatial boundaries change
      const boundsSignature = `${west}_${east}_${south}_${north}`;
      if (lastFitBoundsRef.current !== boundsSignature) {
        lastFitBoundsRef.current = boundsSignature;
        scene.updateMatrixWorld(true);
        fitCameraToVolume(camera, controls);
      }

      // Update Argo floats in 3D
      markerMesh.count = Math.max(0, Math.min(current.floats.length, markerMesh.instanceMatrix.count));
      const matrix = new THREE.Matrix4();
      const colorBgc = new THREE.Color('#10b981');
      const colorCore = new THREE.Color('#06b6d4');
      const colLines = [];

      current.floats.forEach((float, index) => {
        const flon = Number(float.lng ?? float.lon ?? 0);
        const flat = Number(float.lat ?? 0);
        const x = ((flon - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
        const z = ((flat - south) / Math.max(north - south, 0.0001) - 0.5) * 14;
        const y = depthY;
        matrix.makeTranslation(x, y, z);
        markerMesh.setMatrixAt(index, matrix);

        const isBgc = float.type === 'bgc' || float.marker_type === 'bgc_float';
        markerMesh.setColorAt(index, isBgc ? colorBgc : colorCore);

        const maxDepthM = Number(float.depth_range_m?.[1] ?? float.bbox_3d?.z_max ?? 1000);
        const bottomY = -maxDepthM * 0.012 * current.verticalExaggeration;
        colLines.push(x, 0, z, x, bottomY, z);

        if (float.bbox_3d) {
          const bx0 = ((Number(float.bbox_3d.x_min) - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
          const bx1 = ((Number(float.bbox_3d.x_max) - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
          const bz0 = ((Number(float.bbox_3d.y_min) - south) / Math.max(north - south, 0.0001) - 0.5) * 14;
          const bz1 = ((Number(float.bbox_3d.y_max) - south) / Math.max(north - south, 0.0001) - 0.5) * 14;
          colLines.push(bx0, 0, bz0, bx1, 0, bz0);
          colLines.push(bx1, 0, bz0, bx1, 0, bz1);
          colLines.push(bx1, 0, bz1, bx0, 0, bz1);
          colLines.push(bx0, 0, bz1, bx0, 0, bz0);
          colLines.push(bx0, bottomY, bz0, bx1, bottomY, bz0);
          colLines.push(bx1, bottomY, bz0, bx1, bottomY, bz1);
          colLines.push(bx1, bottomY, bz1, bx0, bottomY, bz1);
          colLines.push(bx0, bottomY, bz1, bx0, bottomY, bz0);
          colLines.push(bx0, 0, bz0, bx0, bottomY, bz0);
          colLines.push(bx1, 0, bz0, bx1, bottomY, bz0);
          colLines.push(bx1, 0, bz1, bx1, bottomY, bz1);
          colLines.push(bx0, 0, bz1, bx0, bottomY, bz1);
        } else {
          const sz = 0.35;
          colLines.push(x - sz, depthY, z, x + sz, depthY, z);
          colLines.push(x, depthY, z - sz, x, depthY, z + sz);
        }
      });
      markerMesh.instanceMatrix.needsUpdate = true;
      if (markerMesh.instanceColor) markerMesh.instanceColor.needsUpdate = true;

      floatColumns.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(colLines), 3));
      floatColumns.geometry.computeBoundingBox();
      floatColumns.visible = current.floats.length > 0;

      const canvas = mount.querySelector('canvas');
      if (canvas) {
        canvas.dataset.engine = 'three.js r186';
        canvas.dataset.samples = String(points.length);
        canvas.dataset.gridDimensions = `${new Set(points.map((point) => point.lat)).size}x${new Set(points.map((point) => point.lon)).size}`;
        canvas.dataset.vectorSamples = String(points.filter((point) => point.current_u_ms != null && point.current_v_ms != null).length);
        canvas.dataset.bounds = `${west},${east},${south},${north}`;
        canvas.dataset.sliceDepth = String(depthValue);
        canvas.dataset.valueRange = `${min},${max}`;
        canvas.dataset.variable = current.variable;
        canvas.dataset.thresholdMatches = String(
          current.threshold?.enabled
            ? points.filter((point) => {
                const value = current.variable === 'currents' ? vectorMagnitude(point) : valueFor(point, current.variable);
                return current.threshold.operator === '>'
                  ? value > current.threshold.value
                  : current.threshold.operator === '<'
                  ? value < current.threshold.value
                  : Math.abs(value - current.threshold.value) <= current.threshold.tolerance;
              }).length
            : 0
        );
      }
    };
    update();

    let resizeTimeout;
    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);

      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        scene.updateMatrixWorld(true);
        fitCameraToVolume(camera, controls);
      }, 150);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const onClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(markerMesh)[0];
      if (hit && dataRef.current.floats[hit.instanceId]) onSelectMarker?.(dataRef.current.floats[hit.instanceId]);
    };
    renderer.domElement.addEventListener('click', onClick);

    let frame;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    sceneRef.current = { update };
    if (typeof window !== 'undefined') {
      window.__oceanSlabDebug = { THREE, scene, camera, renderer, controls, field, vectors, slice, markerMesh };
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      field.geometry.dispose();
      vectors.geometry.dispose();
      floatColumns.geometry.dispose();
      sliceTexture.dispose();
      pointTexture.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      if (typeof window !== 'undefined') delete window.__oceanSlabDebug;
    };
  }, [onSelectMarker, floats.length]);

  useEffect(() => {
    sceneRef.current?.update();
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  return <div ref={mountRef} className="ocean-slab-canvas" aria-label="Three dimensional ocean slab" />;
}

export { DEPTH_BINS };

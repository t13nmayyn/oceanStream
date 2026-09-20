import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

const stops = {
  temperature: ['#2166ac', '#f7f7f7', '#b2182b'],
  salinity: ['#f7fcf5', '#74c476', '#00441b'],
  chlorophyll: ['#f7fcf5', '#41ab5d', '#005a32'],
  oxygen: ['#67001f', '#f7f7f7', '#053061'],
  ph: ['#d73027', '#fee08b', '#1a9850'],
  nitrate: ['#f7fcf5', '#78c679', '#238443'],
  pco2: ['#ffffcc', '#fd8d3c', '#bd0026'],
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
  return Number(point?.[key] ?? 0);
}

function colorFor(value, min, max, variable) {
  const palette = stops[variable] || stops.temperature;
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.0001)));
  const left = t < 0.5 ? palette[0] : palette[1];
  const right = t < 0.5 ? palette[1] : palette[2];
  return new THREE.Color(left).lerp(new THREE.Color(right), (t % 0.5) * 2);
}

function vectorMagnitude(point) {
  return Math.hypot(Number(point?.current_u_ms ?? 0), Number(point?.current_v_ms ?? 0));
}

export default function OceanSlab({ grid = [], floats = [], variable = 'temperature', depth = 0, dataDepth = depth, bounds, opacity = 0.92, verticalExaggeration = 1, threshold, onSelectMarker }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const dataRef = useRef({ grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold });
  const lastGridRef = useRef(grid);
  useEffect(() => {
    dataRef.current = { grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold };
  }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafb');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 18, 28);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor('#f8fafb', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.AmbientLight('#ffffff', 1.8));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.2);
    keyLight.position.set(8, 20, 12);
    scene.add(keyLight);

    const field = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, opacity: 0.98, sizeAttenuation: false, depthTest: false }));
    field.renderOrder = 3;
    scene.add(field);
    const vectors = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#0d7377', transparent: true, opacity: 0.8 }));
    vectors.renderOrder = 4;
    scene.add(vectors);
    const fallbackBounds = { west: 0, east: 1, south: 0, north: 1 };
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(20, 12, 14)),
      new THREE.LineBasicMaterial({ color: '#b8c4c8', transparent: true, opacity: 0.8 })
    );
    box.position.y = -6;
    scene.add(box);

    const slice = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 14),
      new THREE.MeshBasicMaterial({ color: '#0d7377', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    slice.renderOrder = 1;
    slice.rotation.x = Math.PI / 2;
    scene.add(slice);

    const markerGroup = new THREE.Group();
    const markerMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#0d7377', roughness: 0.5 }),
      Math.max(1, floats.length)
    );
    markerGroup.add(markerMesh);
    scene.add(markerGroup);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

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
      const values = points.map((point) => current.variable === 'currents' ? vectorMagnitude(point) : valueFor(point, current.variable));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);
      points.forEach((point, index) => {
        positions[index * 3] = ((Number(point.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
        positions[index * 3 + 1] = depthY;
        positions[index * 3 + 2] = ((Number(point.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * 14;
        const color = colorFor(values[index], min, max, current.variable);
        const matches = current.threshold?.enabled && (
          current.threshold.operator === '>' ? values[index] > current.threshold.value :
          current.threshold.operator === '<' ? values[index] < current.threshold.value :
          Math.abs(values[index] - current.threshold.value) <= current.threshold.tolerance
        );
        if (matches) color.set('#facc15');
        colors.set([color.r, color.g, color.b], index * 3);
      });
      field.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      field.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      field.geometry.computeBoundingBox();
      field.geometry.computeBoundingSphere();
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
      vectors.visible = current.variable === 'currents';
      field.material.opacity = current.opacity;
      slice.position.y = depthY;
      controls.target.y = depthY;
      camera.position.y = depthY + 18;
      controls.update();
      markerMesh.count = Math.max(0, Math.min(current.floats.length, markerMesh.instanceMatrix.count));
      const matrix = new THREE.Matrix4();
      current.floats.forEach((float, index) => {
        const x = ((Number(float.lng ?? float.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * 20;
        const z = ((Number(float.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * 14;
        const y = depthY;
        matrix.makeTranslation(x, y, z);
        markerMesh.setMatrixAt(index, matrix);
      });
      markerMesh.instanceMatrix.needsUpdate = true;
      const canvas = mount.querySelector('canvas');
      if (canvas) {
        canvas.dataset.samples = String(points.length);
        canvas.dataset.gridDimensions = `${new Set(points.map((point) => point.lat)).size}x${new Set(points.map((point) => point.lon)).size}`;
        canvas.dataset.vectorSamples = String(points.filter((point) => point.current_u_ms != null && point.current_v_ms != null).length);
        canvas.dataset.bounds = `${west},${east},${south},${north}`;
        canvas.dataset.sliceDepth = String(depthValue);
        canvas.dataset.valueRange = `${min},${max}`;
        canvas.dataset.variable = current.variable;
        canvas.dataset.thresholdMatches = String(current.threshold?.enabled ? points.filter((point) => {
          const value = current.variable === 'currents' ? vectorMagnitude(point) : valueFor(point, current.variable);
          return current.threshold.operator === '>' ? value > current.threshold.value : current.threshold.operator === '<' ? value < current.threshold.value : Math.abs(value - current.threshold.value) <= current.threshold.tolerance;
        }).length : 0);
      }
    };
    update();

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
    const render = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(render); };
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
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      if (typeof window !== 'undefined') delete window.__oceanSlabDebug;
    };
  }, [onSelectMarker, floats.length]);

  useEffect(() => { sceneRef.current?.update(); }, [grid, floats, variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold]);
  return <div ref={mountRef} className="ocean-slab-canvas" aria-label="Three dimensional ocean slab" />;
}

export { DEPTH_BINS };

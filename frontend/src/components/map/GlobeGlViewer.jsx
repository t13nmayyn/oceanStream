import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { useApp, useAppDispatch } from '../../context/AppContext';
import {
  generateGlobalThermalTexture,
  generateTextureFromGridData,
} from '../../utils/oceanThermalField';
import useOceanSnapshot from '../../hooks/useOceanSnapshot';
import useArgoFloats from '../../hooks/useArgoFloats';

// Major Ocean Current Streamlines across Indian Ocean, Bay of Bengal, Arabian Sea & ACC
const OCEAN_CURRENT_ARCS = [
  // Somali Current & Arabian Sea Gyre
  { startLat: 2.0, startLng: 48.0, endLat: 12.5, endLng: 54.0, color: ['#00ffff', '#0077ff'], stroke: 1.8, name: 'Somali Current' },
  { startLat: 12.5, startLng: 54.0, endLat: 18.0, endLng: 65.0, color: ['#0077ff', '#00e5ff'], stroke: 1.6, name: 'Arabian Sea Monsoon Flow' },
  { startLat: 18.0, startLng: 65.0, endLat: 14.0, endLng: 73.0, color: ['#00e5ff', '#38bdf8'], stroke: 1.5, name: 'West India Coastal Current (WICC)' },
  { startLat: 14.0, startLng: 73.0, endLat: 7.0, endLng: 77.0, color: ['#38bdf8', '#00ffff'], stroke: 1.4, name: 'Southward Coastal Flow' },

  // Bay of Bengal Gyre & East India Coastal Current (EICC)
  { startLat: 6.0, startLng: 80.0, endLat: 13.0, endLng: 80.5, color: ['#00ffff', '#10b981'], stroke: 1.6, name: 'East India Coastal Current (EICC)' },
  { startLat: 13.0, startLng: 80.5, endLat: 19.5, endLng: 86.5, color: ['#10b981', '#34d399'], stroke: 1.8, name: 'Northern BoB Inflow' },
  { startLat: 19.5, startLng: 86.5, endLat: 15.0, endLng: 92.0, color: ['#34d399', '#06b6d4'], stroke: 1.5, name: 'East BoB Recirculation' },
  { startLat: 15.0, startLng: 92.0, endLat: 7.0, endLng: 88.0, color: ['#06b6d4', '#00ffff'], stroke: 1.5, name: 'Andaman Sea Gyre' },

  // South Indian Ocean Subtropical Gyre
  { startLat: -10.0, startLng: 95.0, endLat: -12.0, endLng: 60.0, color: ['#38bdf8', '#818cf8'], stroke: 2.0, name: 'South Equatorial Current' },
  { startLat: -12.0, startLng: 60.0, endLat: -28.0, endLng: 40.0, color: ['#818cf8', '#a855f7'], stroke: 2.2, name: 'Mozambique Channel Current' },
  { startLat: -28.0, startLng: 40.0, endLat: -36.0, endLng: 30.0, color: ['#a855f7', '#ec4899'], stroke: 2.5, name: 'Agulhas Jet' },

  // Antarctic Circumpolar Current (ACC)
  { startLat: -52.0, startLng: 20.0, endLat: -54.0, endLng: 70.0, color: ['#00f5ff', '#38bdf8'], stroke: 2.8, name: 'ACC Southern Ocean Jet' },
  { startLat: -54.0, startLng: 70.0, endLat: -52.0, endLng: 120.0, color: ['#38bdf8', '#00e5ff'], stroke: 2.8, name: 'ACC Indian Basin' },
  { startLat: -52.0, startLng: 120.0, endLat: -50.0, endLng: 170.0, color: ['#00e5ff', '#00ffff'], stroke: 2.8, name: 'ACC Pacific Gateway' },
];

// Major Ocean Basin & Landmark Labels for orientation
const OCEAN_LABELS = [
  { lat: 16.5, lng: 64.0, text: 'Arabian Sea', color: '#38bdf8', size: 1.3 },
  { lat: 15.0, lng: 88.5, text: 'Bay of Bengal', color: '#34d399', size: 1.3 },
  { lat: -5.0, lng: 78.0, text: 'Equatorial Indian Ocean', color: '#818cf8', size: 1.4 },
  { lat: 9.0, lng: 52.5, text: 'Somali Upwelling', color: '#00ffff', size: 1.1 },
  { lat: -32.0, lng: 34.0, text: 'Agulhas Current', color: '#ec4899', size: 1.1 },
  { lat: -52.0, lng: 75.0, text: 'Southern Ocean (ACC)', color: '#00e5ff', size: 1.4 },
  { lat: 3.2, lng: 73.2, text: 'Maldives', color: '#94a3b8', size: 0.9 },
  { lat: 11.5, lng: 93.0, text: 'Andaman Sea', color: '#94a3b8', size: 0.9 },
  { lat: 10.0, lng: 72.0, text: 'Lakshadweep Sea', color: '#94a3b8', size: 0.9 },
];

const GlobeGlViewer = forwardRef(function GlobeGlViewer(
  { onPointClick, onSelectFloatForProfile, onViewportChange: _onViewportChange },
  ref
) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const thermalTextureRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [clickPulse, setClickPulse] = useState(null);

  const {
    selectedVariable,
    selectedDepth,
    colorPalette,
    heatmapOpacity,
    showThermalHeatmap,
    showStreamlines,
    showArgoLayer,
    argoFilter,
  } = useApp();

  const dispatch = useAppDispatch();

  // Real backend data hooks
  const { gridData, source: dataSource } = useOceanSnapshot('indianOcean');
  const { floats: argoFloats, isLive: argoIsLive } = useArgoFloats(200);

  // Measure container dimensions for responsive full-bleed canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Expose camera methods via ref
  useImperativeHandle(ref, () => ({
    flyTo(lon, lat, height = 2.0) {
      globeRef.current?.pointOfView({ lat, lng: lon, altitude: height }, 1500);
    },
    zoomIn() {
      const pov = globeRef.current?.pointOfView();
      if (pov) {
        globeRef.current?.pointOfView({ ...pov, altitude: Math.max(0.35, pov.altitude * 0.75) }, 400);
      }
    },
    zoomOut() {
      const pov = globeRef.current?.pointOfView();
      if (pov) {
        globeRef.current?.pointOfView({ ...pov, altitude: Math.min(5.0, pov.altitude * 1.35) }, 400);
      }
    },
    alignNorth() {
      const pov = globeRef.current?.pointOfView();
      if (pov) {
        globeRef.current?.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude }, 600);
      }
    },
    resetFocus() {
      globeRef.current?.pointOfView({ lat: 14.5, lng: 78.5, altitude: 2.2 }, 1500);
    },
  }));

  // Initial Globe Setup once ready
  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Focus on Indian Ocean / Indian EEZ
    globe.pointOfView({ lat: 14.5, lng: 78.5, altitude: 2.2 }, 1000);

    const controls = globe.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      controls.zoomSpeed = 1.2;
      controls.minDistance = 120;
      controls.maxDistance = 700;
    }

    dispatch({
      type: 'ADD_LOG',
      payload: {
        type: 'info',
        text: `${new Date().toISOString().slice(11, 19)} [REACT-GLOBE.GL] 3D Multidimensional Ocean Earth initialized`,
      },
    });
  }, [dispatch]);

  // Generate / update the continuous ocean scalar texture
  useEffect(() => {
    if (!showThermalHeatmap) return;

    try {
      let texData;
      if (gridData && gridData.length > 10) {
        texData = generateTextureFromGridData(
          1024, 512,
          gridData,
          selectedVariable,
          selectedDepth,
          colorPalette
        );
      } else {
        texData = generateGlobalThermalTexture(
          1024, 512,
          selectedVariable,
          selectedDepth,
          colorPalette
        );
      }

      const texture = new THREE.CanvasTexture(texData.canvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      if (thermalTextureRef.current) {
        thermalTextureRef.current.dispose();
      }
      thermalTextureRef.current = texture;

      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'info',
          text: `${new Date().toISOString().slice(11, 19)} [TEXTURE] Updated ${selectedVariable} field (${dataSource}) at ${selectedDepth}m`,
        },
      });

      // Update custom layer mesh if it exists
      const scene = globeRef.current?.scene();
      if (scene) {
        const overlayMesh = scene.getObjectByName('thermal-overlay-mesh');
        if (overlayMesh && overlayMesh.material) {
          overlayMesh.material.map = texture;
          overlayMesh.material.opacity = heatmapOpacity !== undefined ? heatmapOpacity : 0.82;
          overlayMesh.material.needsUpdate = true;
        }
      }
    } catch (err) {
      console.error('Texture generation error:', err);
    }
  }, [selectedVariable, selectedDepth, colorPalette, heatmapOpacity, showThermalHeatmap, gridData]);

  // Handle globe background click
  const handleGlobeClick = useCallback(({ lat, lng }) => {
    onPointClick?.(lat, lng);

    setClickPulse({ lat, lng, time: Date.now() });
    setTimeout(() => {
      setClickPulse(null);
    }, 3000);
  }, [onPointClick]);

  // Handle Argo float marker click
  const handlePointClick = useCallback((point) => {
    globeRef.current?.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.2 }, 1200);
    onSelectFloatForProfile?.(point.id);
  }, [onSelectFloatForProfile]);

  // Filter floats based on user selection
  const filteredFloats = useMemo(() => {
    if (!showArgoLayer) return [];
    return argoFloats.filter((f) => {
      if (argoFilter === 'both') return true;
      if (argoFilter === 'core') return f.type === 'core';
      if (argoFilter === 'bgc') return f.type === 'bgc' || f.type === 'glider';
      return true;
    });
  }, [showArgoLayer, argoFloats, argoFilter]);

  // Combine float rings and click pulse rings
  const ringsData = useMemo(() => {
    const rings = [];
    if (showArgoLayer) {
      for (const f of filteredFloats) {
        rings.push({
          lat: f.lat,
          lng: f.lng,
          maxR: 2.2,
          propagationSpeed: 1.5,
          repeatPeriod: 1400,
          color: (t) => `rgba(56, 189, 248, ${Math.max(0, 1 - t)})`,
        });
      }
    }
    if (clickPulse) {
      rings.push({
        lat: clickPulse.lat,
        lng: clickPulse.lng,
        maxR: 4.5,
        propagationSpeed: 3.2,
        repeatPeriod: 800,
        color: (t) => `rgba(0, 220, 255, ${Math.max(0, 1 - t)})`,
      });
    }
    return rings;
  }, [showArgoLayer, filteredFloats, clickPulse]);

  // Custom 3D Layer Data for the Thermal / Scalar Field Sphere
  const customLayerData = useMemo(() => {
    if (!showThermalHeatmap) return [];
    return [{ id: 'thermal-sphere-overlay' }];
  }, [showThermalHeatmap]);

  const createThermalMesh = useCallback(() => {
    const radius = globeRef.current?.getGlobeRadius() || 100;
    const geo = new THREE.SphereGeometry(radius * 1.0025, 128, 128);
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: heatmapOpacity !== undefined ? heatmapOpacity : 0.82,
      roughness: 0.25,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.FrontSide,
      map: thermalTextureRef.current || null,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'thermal-overlay-mesh';
    // Exact alignment with ThreeGlobe prime meridian coordinates
    mesh.rotation.y = -Math.PI / 2;
    return mesh;
  }, [heatmapOpacity]);

  const updateThermalMesh = useCallback((mesh) => {
    if (!mesh) return;
    if (thermalTextureRef.current && mesh.material.map !== thermalTextureRef.current) {
      mesh.material.map = thermalTextureRef.current;
      mesh.material.needsUpdate = true;
    }
    mesh.material.opacity = heatmapOpacity !== undefined ? heatmapOpacity : 0.82;
  }, [heatmapOpacity]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing select-none overflow-hidden bg-slate-950"
    >
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        // High-resolution Blue Marble Earth base textures
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
        showAtmosphere={true}
        atmosphereColor="#00c8ff"
        atmosphereAltitude={0.22}
        enablePointerInteraction={true}
        onGlobeReady={handleGlobeReady}
        onGlobeClick={handleGlobeClick}
        // Custom 3D Layer: Global Thermal & Scalar Field
        customLayerData={customLayerData}
        customThreeObject={createThermalMesh}
        customThreeObjectUpdate={updateThermalMesh}
        // In-Situ Observation Point Markers (Argo / Gliders / Buoys)
        pointsData={filteredFloats}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.03}
        pointRadius={0.45}
        pointResolution={24}
        onPointClick={handlePointClick}
        pointLabel={(d) =>
          `<div style="background:rgba(13,21,37,0.95);border:1px solid ${d.color};padding:8px 12px;border-radius:10px;font-family:sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.6);backdrop-filter:blur(8px);">
            <div style="font-weight:bold;font-size:12px;color:${d.color};display:flex;align-items:center;gap:6px;">
              <span>●</span> ${d.name}
              ${argoIsLive ? '<span style="font-size:8px;color:#10b981;margin-left:4px;">● LIVE</span>' : ''}
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">
              Lat: ${d.lat.toFixed(2)}°N · Lon: ${d.lng.toFixed(2)}°E
            </div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:4px;">
              Operating Depth: <strong>${d.depth}</strong>
            </div>
            ${d.sensors ? `<div style="font-size:9px;color:#64748b;margin-top:2px;">${d.sensors.join(' · ')}</div>` : ''}
            <div style="font-size:9px;color:#38bdf8;margin-top:4px;font-family:monospace;">
              [CLICK TO VIEW VERTICAL CTD PROFILE]
            </div>
          </div>`
        }
        // Pulsing radar rings for floats & clicks
        ringsData={ringsData}
        ringColor={(r) => r.color}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        ringAltitude={0.015}
        // Animated Ocean Current Streamline Arcs
        arcsData={showStreamlines ? OCEAN_CURRENT_ARCS : []}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashInitialGap={() => Math.random() * 2}
        arcDashAnimateTime={2000}
        arcStroke="stroke"
        arcAltitude={0.06}
        arcLabel={(d) => `🌀 ${d.name}`}
        // Scientific Ocean Region Labels
        labelsData={OCEAN_LABELS}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelColor="color"
        labelSize="size"
        labelAltitude={0.012}
        labelResolution={2}
        labelIncludeDot={true}
        labelDotRadius={0.3}
      />
    </div>
  );
});

export default GlobeGlViewer;

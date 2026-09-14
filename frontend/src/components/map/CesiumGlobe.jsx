import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as Cesium from 'cesium';
import { useApp, useAppDispatch } from '../../context/AppContext';
import { BASEMAP_URLS } from '../../config/api';
import { generateGlobalThermalTexture, getOceanCurrentVelocity } from '../../utils/oceanThermalField';

const CesiumGlobe = forwardRef(function CesiumGlobe({ onViewportChange, onPointClick }, ref) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const basemapLayerRef = useRef(null);
  const thermalLayerRef = useRef(null);
  const flowParticlesRef = useRef(null);
  const animFrameRef = useRef(null);
  const particlesStateRef = useRef([]);

  const {
    basemap,
    showThermalHeatmap,
    showStreamlines,
    streamlineSpeed,
    heatmapOpacity,
  } = useApp();

  const dispatch = useAppDispatch();

  // Expose camera methods
  useImperativeHandle(ref, () => ({
    flyTo(lon, lat, height, pitch) {
      viewerRef.current?.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitch), roll: 0 },
        duration: 1.8,
      });
    },
    zoomIn() {
      const cam = viewerRef.current?.camera;
      if (cam) cam.zoomIn(Math.max(120000, cam.positionCartographic.height * 0.32));
    },
    zoomOut() {
      const cam = viewerRef.current?.camera;
      if (cam && cam.positionCartographic.height < 14000000) {
        cam.zoomOut(Math.max(120000, cam.positionCartographic.height * 0.32));
      }
    },
    alignNorth() {
      const cam = viewerRef.current?.camera;
      if (!cam) return;
      const c = cam.positionCartographic;
      cam.flyTo({
        destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
        orientation: { heading: 0, pitch: cam.pitch, roll: 0 },
        duration: 0.8,
      });
    },
    togglePitch() {
      const cam = viewerRef.current?.camera;
      if (!cam) return;
      const c = cam.positionCartographic;
      const deg = Cesium.Math.toDegrees(cam.pitch);
      const newPitch = deg < -75 ? -50 : -88;
      cam.flyTo({
        destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
        orientation: { heading: cam.heading, pitch: Cesium.Math.toRadians(newPitch), roll: 0 },
        duration: 0.8,
      });
    },
    resize() {
      viewerRef.current?.resize();
    },
    getVisibleBounds() {
      const cam = viewerRef.current?.camera;
      if (!cam) return null;
      const c = cam.positionCartographic;
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const span = Math.min(60, Math.max(4, c.height / 180000));
      return {
        south: Math.max(-85, lat - span * 0.5),
        north: Math.min(85, lat + span * 0.5),
        west: lon - span * 0.6,
        east: lon + span * 0.6,
      };
    },
  }));

  // Helper to spawn a new particle
  const spawnParticle = () => {
    let lat, lon;
    const r = Math.random();
    if (r < 0.45) {
      // Southern Ocean ACC Gyre
      lat = -65 + Math.random() * 28;
      lon = -180 + Math.random() * 360;
    } else if (r < 0.8) {
      // Indian Ocean, Arabian Sea, Bay of Bengal
      lat = -35 + Math.random() * 58;
      lon = 42 + Math.random() * 60;
    } else {
      // Tropical Pacific / Global
      lat = -55 + Math.random() * 110;
      lon = -180 + Math.random() * 360;
    }

    return {
      lat,
      lon,
      age: Math.floor(Math.random() * 60),
      maxAge: 70 + Math.floor(Math.random() * 80),
      size: 2.5 + Math.random() * 2.5,
    };
  };

  // 1. Initialize Cesium 3D Globe Viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    let viewer;
    try {
      viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        scene3DOnly: true,
        shouldAnimate: true,
        terrainProvider: undefined,
      });
    } catch (err) {
      console.error('Cesium init error:', err);
      return;
    }

    const scene = viewer.scene;
    const globe = scene.globe;

    globe.enableLighting = true;
    globe.showGroundAtmosphere = true;
    globe.depthTestAgainstTerrain = false;
    globe.baseColor = Cesium.Color.fromCssColorString('#020612');

    const ctrl = scene.screenSpaceCameraController;
    ctrl.minimumZoomDistance = 100000;
    ctrl.maximumZoomDistance = 14500000;
    ctrl.enableCollisionDetection = true;
    ctrl.inertiaSpin = 0.85;
    ctrl.inertiaTranslate = 0.85;
    ctrl.inertiaZoom = 0.78;
    ctrl.zoomFactor = 2.2;

    // View focused on Indian Ocean, Bay of Bengal, Arabian Sea, and Southern Ocean
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(78.0, -8.0, 6800000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-70),
        roll: 0,
      },
    });

    // Basin Labels
    const labels = scene.primitives.add(new Cesium.LabelCollection());
    const oceanLabels = [
      { text: 'Indian\nOcean', lon: 76.0, lat: -4.0, font: 'bold 18px Plus Jakarta Sans, sans-serif' },
      { text: 'Southern Ocean', lon: 78.0, lat: -54.0, font: '600 16px Plus Jakarta Sans, sans-serif' },
      { text: 'Pacific\nOcean', lon: 135.0, lat: 6.0, font: '600 16px Plus Jakarta Sans, sans-serif' },
      { text: 'Bay of Bengal', lon: 88.5, lat: 14.0, font: 'bold 13px Plus Jakarta Sans, sans-serif' },
      { text: 'Arabian Sea', lon: 64.0, lat: 15.5, font: 'bold 13px Plus Jakarta Sans, sans-serif' },
    ];

    oceanLabels.forEach((l) => {
      labels.add({
        position: Cesium.Cartesian3.fromDegrees(l.lon, l.lat, 15000),
        text: l.text,
        font: l.font,
        fillColor: Cesium.Color.fromCssColorString('rgba(225, 240, 255, 0.8)'),
        outlineColor: Cesium.Color.fromCssColorString('rgba(0, 4, 16, 0.9)'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      });
    });

    // Particle flow collection
    const flowCollection = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    flowParticlesRef.current = flowCollection;

    const NUM_PARTICLES = 2200;
    const pState = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const p = spawnParticle();
      pState.push(p);
      flowCollection.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 16000),
        color: Cesium.Color.WHITE.withAlpha(0.8),
        pixelSize: p.size,
      });
    }
    particlesStateRef.current = pState;

    // Click handler
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((movement) => {
      const ray = viewer.camera.getPickRay(movement.position);
      const cartesian = scene.globe.pick(ray, scene);
      if (cartesian) {
        const c = Cesium.Cartographic.fromCartesian(cartesian);
        onPointClick?.(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude));
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.moveEnd.addEventListener(() => onViewportChange?.());

    viewerRef.current = viewer;

    dispatch({
      type: 'ADD_LOG',
      payload: {
        type: 'info',
        text: `${new Date().toISOString().slice(11, 19)} [CESIUM] 3D Ocean Surface ready`,
      },
    });

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Basemap Tile Layer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (basemapLayerRef.current) {
      viewer.imageryLayers.remove(basemapLayerRef.current, true);
      basemapLayerRef.current = null;
    }

    const url = BASEMAP_URLS[basemap] || BASEMAP_URLS.satellite;
    const provider = new Cesium.UrlTemplateImageryProvider({
      url,
      maximumLevel: basemap === 'osm' ? 19 : 18,
    });
    basemapLayerRef.current = viewer.imageryLayers.addImageryProvider(provider, 0);
  }, [basemap]);

  // 3. Thermal SST Heatmap Layer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (thermalLayerRef.current) {
      viewer.imageryLayers.remove(thermalLayerRef.current, true);
      thermalLayerRef.current = null;
    }

    if (showThermalHeatmap) {
      try {
        const thermalResult = generateGlobalThermalTexture(1024, 512);
        const rect = Cesium.Rectangle.fromDegrees(
          thermalResult.bounds.west,
          thermalResult.bounds.south,
          thermalResult.bounds.east,
          thermalResult.bounds.north
        );
        const dataUrl = thermalResult.canvas.toDataURL();

        const applyThermal = (provider) => {
          if (!viewer || viewer.isDestroyed()) return;
          const layer = viewer.imageryLayers.addImageryProvider(provider, 1);
          layer.alpha = heatmapOpacity;
          thermalLayerRef.current = layer;
        };

        if (typeof Cesium.SingleTileImageryProvider.fromUrl === 'function') {
          Cesium.SingleTileImageryProvider.fromUrl(dataUrl, { rectangle: rect })
            .then(applyThermal)
            .catch((e) => console.error('Thermal provider error:', e));
        } else {
          const provider = new Cesium.SingleTileImageryProvider({ url: dataUrl, rectangle: rect });
          applyThermal(provider);
        }
      } catch (e) {
        console.error('Thermal texture error:', e);
      }
    }
  }, [showThermalHeatmap, heatmapOpacity]);

  // 4. Live Streamline Particle Flow Animation Loop (Silky 60 FPS Native WebGL)
  useEffect(() => {
    const collection = flowParticlesRef.current;
    if (!collection) return;

    if (!showStreamlines) {
      collection.show = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    collection.show = true;

    const pState = particlesStateRef.current;
    const count = collection.length;
    const dt = 0.08 * streamlineSpeed;

    const colorWhite = Cesium.Color.WHITE;
    const colorCyan = Cesium.Color.fromCssColorString('#80f0ff');
    const colorTeal = Cesium.Color.fromCssColorString('#00e5ff');

    function tick() {
      for (let i = 0; i < count; i++) {
        const p = pState[i];
        const prim = collection.get(i);

        p.age++;
        if (p.age > p.maxAge || p.lat < -78 || p.lat > 78 || p.lon < -180 || p.lon > 180) {
          const fresh = spawnParticle();
          p.lat = fresh.lat;
          p.lon = fresh.lon;
          p.age = 0;
          p.maxAge = fresh.maxAge;
        }

        const vel = getOceanCurrentVelocity(p.lat, p.lon);
        p.lon += vel.u * dt * 2.4;
        p.lat += vel.v * dt * 2.2;

        prim.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 18000);

        // Alpha curve
        const lifeNorm = Math.sin((p.age / p.maxAge) * Math.PI);
        const alpha = Math.min(0.95, (0.4 + vel.speed * 0.5) * lifeNorm);

        if (vel.speed > 0.75) {
          prim.color = colorWhite.withAlpha(alpha);
        } else if (vel.speed > 0.35) {
          prim.color = colorCyan.withAlpha(alpha * 0.9);
        } else {
          prim.color = colorTeal.withAlpha(alpha * 0.75);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [showStreamlines, streamlineSpeed]);

  return <div ref={containerRef} className="w-full h-full absolute inset-0" />;
});

export default CesiumGlobe;

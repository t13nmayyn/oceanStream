import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../../context/AppContext';
import { BASEMAP_URLS } from '../../config/api';
import { getColorForValue } from '../../utils/colorRamp';
import { generateHeatmapCanvas } from '../../utils/heatmapGenerator';

const LeafletMap = forwardRef(function LeafletMap({ onViewportChange, onPointClick }, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const gridLayerRef = useRef(null);
  const argoLayerRef = useRef(null);
  const heatmapOverlayRef = useRef(null);

  const {
    basemap,
    gridPoints,
    colorMin,
    colorMax,
    renderMode,
    heatmapOpacity,
    heatmapRadius,
    heatmapBlur,
    colorPalette,
  } = useApp();

  useImperativeHandle(ref, () => ({
    resize() {
      mapRef.current?.invalidateSize();
    },
    getBounds() {
      const b = mapRef.current?.getBounds();
      if (!b) return null;
      return { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() };
    },
    addArgoMarkers(floats) {
      argoLayerRef.current?.clearLayers();
      floats.forEach((f) => {
        if (f.lat && f.lon) {
          L.circleMarker([f.lat, f.lon], {
            radius: 7,
            color: '#fff',
            weight: 2,
            fillColor: '#7b5af5',
            fillOpacity: 0.9,
          })
            .bindPopup(`<b>Platform #${f.platform_number || f.name}</b><br>Dist: ${f.distance_km} km`)
            .addTo(argoLayerRef.current);
        }
      });
    },
  }));

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [14.5, 80.0],
      zoom: 6,
      minZoom: 3,
      maxZoom: 12,
    });
    tileRef.current = L.tileLayer(BASEMAP_URLS.ocean, {
      maxZoom: 19,
      attribution: '&copy; Esri &copy; OSM',
    }).addTo(map);
    gridLayerRef.current = L.layerGroup().addTo(map);
    argoLayerRef.current = L.layerGroup().addTo(map);

    map.on('moveend zoomend', () => onViewportChange?.());
    map.on('click', (e) => onPointClick?.(e.latlng.lat, e.latlng.lng));

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Basemap change
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(BASEMAP_URLS[basemap] || BASEMAP_URLS.ocean, {
      maxZoom: 19,
      attribution: '&copy; Esri',
    }).addTo(mapRef.current);
  }, [basemap]);

  // Heatmap & Grid points
  useEffect(() => {
    if (!mapRef.current) return;

    // 1. Heatmap Overlay
    if (heatmapOverlayRef.current) {
      mapRef.current.removeLayer(heatmapOverlayRef.current);
      heatmapOverlayRef.current = null;
    }

    if ((renderMode === 'heatmap' || renderMode === 'hybrid') && gridPoints.length > 0) {
      const res = generateHeatmapCanvas({
        points: gridPoints,
        colorMin,
        colorMax,
        paletteKey: colorPalette,
        radius: heatmapRadius,
        blur: heatmapBlur,
        width: 512,
        height: 512,
      });

      if (res) {
        const bounds = [
          [res.bounds.south, res.bounds.west],
          [res.bounds.north, res.bounds.east],
        ];
        const overlay = L.imageOverlay(res.canvas.toDataURL(), bounds, {
          opacity: heatmapOpacity,
          interactive: false,
        }).addTo(mapRef.current);
        heatmapOverlayRef.current = overlay;
      }
    }

    // 2. Point Cloud Layer
    if (gridLayerRef.current) {
      gridLayerRef.current.clearLayers();
      if (renderMode === 'points' || renderMode === 'hybrid') {
        const step = Math.max(1, Math.floor(gridPoints.length / 500));
        const fillOpacity = renderMode === 'hybrid' ? 0.5 : 0.78;
        const radius = renderMode === 'hybrid' ? 3.5 : 5;

        for (let i = 0; i < gridPoints.length; i += step) {
          const pt = gridPoints[i];
          if (pt.value == null || isNaN(pt.value)) continue;
          const color = getColorForValue(pt.value, colorMin, colorMax, colorPalette);
          L.circleMarker([pt.lat, pt.lon], {
            radius,
            fillColor: color,
            color: 'transparent',
            fillOpacity,
            weight: 0,
          })
            .bindTooltip(`<b>${pt.lat.toFixed(3)}°N, ${pt.lon.toFixed(3)}°E</b><br>Temp: ${pt.value.toFixed(2)} °C`)
            .addTo(gridLayerRef.current);
        }
      }
    }
  }, [
    gridPoints,
    colorMin,
    colorMax,
    renderMode,
    heatmapOpacity,
    heatmapRadius,
    heatmapBlur,
    colorPalette,
  ]);

  // Opacity change
  useEffect(() => {
    if (heatmapOverlayRef.current) {
      heatmapOverlayRef.current.setOpacity(heatmapOpacity);
    }
  }, [heatmapOpacity]);

  return <div ref={containerRef} className="w-full h-full absolute inset-0" />;
});

export default LeafletMap;

import { useRef, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import ViewportControls from './ViewportControls';
import PagingTable from '../sidebar/PagingTable';
import StreamLog from '../sidebar/StreamLog';
import CesiumGlobe from './CesiumGlobe';
import LeafletMap from './LeafletMap';
import MapHUD from './MapHUD';
import RegionPresets from './RegionPresets';
import ZoomControls from './ZoomControls';
import HeatmapControls from './HeatmapControls';
import CoverageStrip from './CoverageStrip';
import Colorbar from './Colorbar';
import PointInspector from './PointInspector';

export default function MapView({ onTriggerViewportFetch, onSelectFloatForProfile, hideSidebar = false }) {
  const { engineMode } = useApp();
  const cesiumRef = useRef(null);
  const leafletRef = useRef(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const handlePointClick = useCallback((lat, lon) => {
    setSelectedPoint({ lat, lon });
  }, []);

  const handleFlyTo = useCallback((region) => {
    if (engineMode === '3d') {
      cesiumRef.current?.flyTo(region.lon, region.lat, region.height, region.pitch);
    } else {
      leafletRef.current?.setView(region.lat, region.lon, region.zoom);
    }
  }, [engineMode]);

  const handleZoomIn = useCallback(() => {
    if (engineMode === '3d') {
      cesiumRef.current?.zoomIn();
    } else {
      leafletRef.current?.zoomIn();
    }
  }, [engineMode]);

  const handleZoomOut = useCallback(() => {
    if (engineMode === '3d') {
      cesiumRef.current?.zoomOut();
    } else {
      leafletRef.current?.zoomOut();
    }
  }, [engineMode]);

  const handleReset = useCallback(() => {
    handleFlyTo({ lon: 85.0, lat: 14.5, height: 2600000, pitch: -65, zoom: 5 });
  }, [handleFlyTo]);

  const handleNorth = useCallback(() => {
    cesiumRef.current?.alignNorth();
  }, []);

  const handlePitch = useCallback(() => {
    cesiumRef.current?.togglePitch();
  }, []);

  return (
    <div className={`${hideSidebar ? '' : 'grid grid-cols-[360px_1fr]'} h-full w-full overflow-hidden`}>
      {/* Left Sidebar (hidden when ExplorerPage provides its own) */}
      {!hideSidebar && (
        <div className="bg-surface border-r border-border overflow-y-auto p-3 flex flex-col gap-3 z-20">
          <ViewportControls onTriggerFetch={onTriggerViewportFetch} />
          <PagingTable />
          <StreamLog />
        </div>
      )}

      {/* Map Canvas / Globe Viewport */}
      <div className="relative w-full h-full bg-black overflow-hidden">
        {/* 3D Cesium Globe */}
        <div className={`w-full h-full absolute inset-0 ${engineMode === '3d' ? 'block' : 'hidden'}`}>
          <CesiumGlobe
            ref={cesiumRef}
            onViewportChange={onTriggerViewportFetch}
            onPointClick={handlePointClick}
          />
        </div>

        {/* 2D Leaflet Fallback */}
        <div className={`w-full h-full absolute inset-0 ${engineMode === '2d' ? 'block' : 'hidden'}`}>
          <LeafletMap
            ref={leafletRef}
            onViewportChange={onTriggerViewportFetch}
            onPointClick={handlePointClick}
          />
        </div>

        {/* Floating Overlays */}
        <MapHUD />
        <RegionPresets onFlyTo={handleFlyTo} />
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onNorth={handleNorth}
          onPitch={handlePitch}
        />
        <HeatmapControls />
        <CoverageStrip />
        <Colorbar />

        <PointInspector
          point={selectedPoint}
          onClose={() => setSelectedPoint(null)}
          onLoadFloatProfile={(id) => onSelectFloatForProfile?.(id)}
        />
      </div>
    </div>
  );
}

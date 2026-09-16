import { useRef, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import ViewportControls from './ViewportControls';
import PagingTable from '../sidebar/PagingTable';
import StreamLog from '../sidebar/StreamLog';
import GlobeGlViewer from './GlobeGlViewer';
import LeafletMap from './LeafletMap';
import MapHUD from './MapHUD';
import RegionPresets from './RegionPresets';
import ZoomControls from './ZoomControls';
import PointInspector from './PointInspector';

export default function MapView({ onTriggerViewportFetch, onSelectFloatForProfile, hideSidebar = false }) {
  const { engineMode } = useApp();
  const globeRef = useRef(null);
  const leafletRef = useRef(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const handlePointClick = useCallback((lat, lon) => {
    setSelectedPoint({ lat, lon });
  }, []);

  const handleFlyTo = useCallback((region) => {
    if (engineMode === '3d') {
      globeRef.current?.flyTo(region.lon, region.lat, 1.8);
    } else {
      leafletRef.current?.setView(region.lat, region.lon, region.zoom);
    }
  }, [engineMode]);

  const handleZoomIn = useCallback(() => {
    if (engineMode === '3d') {
      globeRef.current?.zoomIn();
    } else {
      leafletRef.current?.zoomIn();
    }
  }, [engineMode]);

  const handleZoomOut = useCallback(() => {
    if (engineMode === '3d') {
      globeRef.current?.zoomOut();
    } else {
      leafletRef.current?.zoomOut();
    }
  }, [engineMode]);

  const handleReset = useCallback(() => {
    if (engineMode === '3d') {
      globeRef.current?.resetFocus();
    } else {
      handleFlyTo({ lon: 78.5, lat: 14.5, zoom: 5 });
    }
  }, [engineMode, handleFlyTo]);

  const handleNorth = useCallback(() => {
    globeRef.current?.alignNorth();
  }, []);

  return (
    <div className={`${hideSidebar ? '' : 'grid grid-cols-[360px_1fr]'} h-full w-full overflow-hidden bg-slate-950`}>
      {/* Left Sidebar (hidden when Explorer provides its own) */}
      {!hideSidebar && (
        <div className="bg-surface border-r border-border overflow-y-auto p-3 flex flex-col gap-3 z-20">
          <ViewportControls onTriggerFetch={onTriggerViewportFetch} />
          <PagingTable />
          <StreamLog />
        </div>
      )}

      {/* Map Canvas / Globe Viewport */}
      <div className="relative w-full h-full bg-slate-950 overflow-hidden">
        {/* 3D Globe.gl Multidimensional Earth */}
        <div className={`w-full h-full absolute inset-0 ${engineMode === '3d' ? 'block' : 'hidden'}`}>
          <GlobeGlViewer
            ref={globeRef}
            onViewportChange={onTriggerViewportFetch}
            onPointClick={handlePointClick}
            onSelectFloatForProfile={onSelectFloatForProfile}
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

        {/* Floating Controls */}
        <RegionPresets onFlyTo={handleFlyTo} />
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onNorth={handleNorth}
        />

        {/* Point Inspector */}
        <PointInspector
          point={selectedPoint}
          onClose={() => setSelectedPoint(null)}
          onLoadFloatProfile={(id) => onSelectFloatForProfile?.(id)}
        />
      </div>
    </div>
  );
}

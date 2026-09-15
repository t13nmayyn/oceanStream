import { useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppDispatch } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApiHealth } from '../hooks/useApiHealth';
import { useDateControls } from '../hooks/useDateControls';

import AppNav from '../components/navigation/AppNav';
import MapView from '../components/map/MapView';
import ExplorerSidebar from '../components/explorer/ExplorerSidebar';
import StatusBar from '../components/explorer/StatusBar';

// Inner component that can access context
function ExplorerInner() {
  const dispatch = useAppDispatch();
  const { sendViewport } = useWebSocket();
  useApiHealth();
  useDateControls();

  const [selectedVariable, setSelectedVariable] = useState('temperature');
  const [lastCacheLevel, setLastCacheLevel] = useState(null);

  const handleTriggerViewportFetch = useCallback((bounds) => {
    const defaultBounds = bounds || { south: 8, north: 22, west: 68, east: 90 };
    sendViewport(defaultBounds);
  }, [sendViewport]);

  const handleSelectFloatForProfile = useCallback((platformId) => {
    // Could navigate to /observations with this float pre-selected
    // For now, keep within explorer context
  }, []);

  return (
    <div
      className="explorer-layout flex flex-col"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      {/* Top navigation — fixed */}
      <AppNav />

      {/* Main area below nav */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ paddingTop: '56px', paddingBottom: '32px' }}
      >
        {/* Left sidebar — redesigned controls */}
        <ExplorerSidebar onVariableChange={setSelectedVariable} />

        {/* Globe/Map viewport fills the rest — hideSidebar removes internal old sidebar */}
        <div className="flex-1 relative overflow-hidden">
          <MapView
            onTriggerViewportFetch={handleTriggerViewportFetch}
            onSelectFloatForProfile={handleSelectFloatForProfile}
            hideSidebar={true}
          />
        </div>
      </div>

      {/* Bottom status bar */}
      <StatusBar selectedVariable={selectedVariable} lastCacheLevel={lastCacheLevel} />
    </div>
  );
}

export default function ExplorerPage() {
  // Explorer locks body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      <ExplorerInner />
    </motion.div>
  );
}

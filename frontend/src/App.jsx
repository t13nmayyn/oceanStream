import { useState, useCallback } from 'react';
import { AppProvider, useAppDispatch } from './context/AppContext';
import { useWebSocket } from './hooks/useWebSocket';
import { useApiHealth } from './hooks/useApiHealth';
import { useDateControls } from './hooks/useDateControls';

import Topbar from './components/layout/Topbar';
import TabPane from './components/layout/TabPane';
import Toast from './components/ui/Toast';

import MapView from './components/map/MapView';
import TimelineView from './components/timeline/TimelineView';
import ArgoView from './components/argo/ArgoView';
import TesterView from './components/tester/TesterView';
import WsConsole from './components/websocket/WsConsole';

function MainApp() {
  const dispatch = useAppDispatch();
  const { sendViewport } = useWebSocket();
  useApiHealth();
  useDateControls();

  const [selectedFloatForProfile, setSelectedFloatForProfile] = useState(null);

  const handleTriggerViewportFetch = useCallback((bounds) => {
    const defaultBounds = bounds || { south: 8, north: 22, west: 68, east: 90 };
    sendViewport(defaultBounds);
  }, [sendViewport]);

  const handleSelectFloatForProfile = useCallback((platformId) => {
    setSelectedFloatForProfile(platformId);
    dispatch({ type: 'SET_TAB', payload: 'argo' });
  }, [dispatch]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg text-text">
      <Topbar />

      <div className="relative flex-1 overflow-hidden">
        <TabPane id="map">
          <MapView
            onTriggerViewportFetch={handleTriggerViewportFetch}
            onSelectFloatForProfile={handleSelectFloatForProfile}
          />
        </TabPane>

        <TabPane id="timeline">
          <TimelineView />
        </TabPane>

        <TabPane id="argo">
          <ArgoView initialPlatform={selectedFloatForProfile} />
        </TabPane>

        <TabPane id="tester">
          <TesterView />
        </TabPane>

        <TabPane id="ws">
          <WsConsole />
        </TabPane>
      </div>

      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

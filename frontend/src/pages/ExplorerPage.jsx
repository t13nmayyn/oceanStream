import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useAppDispatch } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApiHealth } from '../hooks/useApiHealth';
import { useDateControls } from '../hooks/useDateControls';

import AppNav from '../components/navigation/AppNav';
import OceanWorkspace from '../components/ocean/OceanWorkspace';
import OceanStreamCopilot from '../components/copilot/OceanStreamCopilot';

export default function ExplorerPage() {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { apiStatus, wsStatus, logs } = useApp();
  useWebSocket();
  useApiHealth();
  useDateControls();

  useEffect(() => {
    dispatch({ type: 'SET_USER_MODE', payload: searchParams.get('mode') === 'analyze' ? 'analyze' : 'explore' });
  }, [dispatch, searchParams]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setDeveloperOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Lock body scroll in explorer
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handlePointClick = useCallback((lat, lon) => {
    setSelectedPoint({ lat, lon });
  }, []);

  return (
    <div
      className="explorer-layout flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-slate-100"
    >
      {/* Top navigation */}
      <AppNav />

      {/* Main View Area */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{ paddingTop: '56px' }}
      >
        <OceanWorkspace selectedPoint={selectedPoint} onPointClick={handlePointClick} />
      </div>

      {developerOpen && <aside className="developer-panel" aria-label="Developer diagnostics"><button type="button" onClick={() => setDeveloperOpen(false)}>Close</button><h2>Developer diagnostics</h2><p>API: {apiStatus}</p><p>WebSocket: {wsStatus}</p><p>Recent events: {logs.length}</p><pre>{JSON.stringify(logs.slice(0, 12), null, 2)}</pre></aside>}

      <OceanStreamCopilot
        selectedPoint={selectedPoint}
        onSelectPoint={setSelectedPoint}
      />
    </div>
  );
}

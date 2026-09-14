import { useApp, useAppDispatch } from '../../context/AppContext';
import { API_BASE } from '../../config/api';
import Button from '../ui/Button';

const tabs = [
  { id: 'map', icon: '🌐', label: '3D Ocean Globe & Map' },
  { id: 'timeline', icon: '📈', label: 'Timeline Analytics' },
  { id: 'argo', icon: '🎯', label: 'Argo & In-Situ' },
  { id: 'tester', icon: '🧪', label: 'All APIs Test Runner' },
  { id: 'ws', icon: '⚡', label: 'WebSocket Console' },
];

export default function Topbar() {
  const { activeTab, apiStatus, wsStatus } = useApp();
  const dispatch = useAppDispatch();

  const dotClass = (status) => {
    if (status === 'online' || status === 'connected') return 'bg-green shadow-[0_0_6px_var(--color-green)]';
    if (status === 'offline' || status === 'disconnected') return 'bg-rose';
    return 'bg-amber animate-pulse';
  };

  const statusText = (type, status) => {
    if (type === 'api') return status === 'online' ? 'API Ready' : status === 'offline' ? 'API Offline' : 'API: Checking…';
    return status === 'connected' ? 'WS Connected' : status === 'disconnected' ? 'WS Disconnected' : 'WS Connecting…';
  };

  async function flushCache() {
    try {
      await fetch(`${API_BASE}/api/cache-clear`, { method: 'POST' });
      dispatch({ type: 'ADD_TOAST', payload: { msg: 'L1 RAM cache cleared', variant: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { msg: 'Failed to clear cache', variant: 'error' } });
    }
  }

  return (
    <div className="bg-surface border-b border-border flex items-center gap-3 px-4 h-[52px] z-[10000] overflow-x-auto">
      {/* Brand */}
      <div className="font-extrabold text-base text-accent flex items-center gap-1.5 whitespace-nowrap">
        🌊 oceanStream
        <span className="text-[0.62rem] bg-accent/15 text-accent px-1.5 py-0.5 rounded font-mono font-bold">
          3D CESIUM GLOBE & API SUITE
        </span>
      </div>

      <div className="w-px h-5.5 bg-border" />

      {/* Nav Tabs */}
      <div className="flex gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => dispatch({ type: 'SET_TAB', payload: tab.id })}
            className={`px-3 py-1.5 rounded-md text-[0.76rem] font-semibold border border-transparent cursor-pointer transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-white bg-surface-2 border-border-bright font-bold'
                : 'text-muted bg-transparent hover:text-text hover:bg-surface-2'
            }`}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Right Status */}
      <div className="flex gap-2.5 items-center ml-auto">
        {/* API Status */}
        <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold px-2.5 py-0.5 rounded-full border border-border bg-surface-2 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass(apiStatus)}`} />
          {statusText('api', apiStatus)}
        </span>
        {/* WS Status */}
        <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold px-2.5 py-0.5 rounded-full border border-border bg-surface-2 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass(wsStatus)}`} />
          {statusText('ws', wsStatus)}
        </span>
        <Button variant="danger" onClick={flushCache}>🧹 Flush L1</Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useApiHealth } from '../hooks/useApiHealth';
import AppNav from '../components/navigation/AppNav';
import TesterView from '../components/tester/TesterView';
import WsConsole from '../components/websocket/WsConsole';
import { Settings, Database, Cpu, Wifi, ChevronDown } from 'lucide-react';
import { API_BASE } from '../config/api';
import { useApp } from '../context/AppContext';

function CacheStatsPanel() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const { apiStatus } = useApp();

  const fetchStats = async () => {
    if (apiStatus !== 'online') return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cache-stats`);
      const data = await res.json();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [apiStatus]); // eslint-disable-line

  if (!stats) return null;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'rgba(13, 21, 37, 0.7)', border: '1px solid rgba(30, 48, 85, 0.6)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Database size={13} style={{ color: '#00e08c' }} />
        <span className="text-[12px] font-semibold text-white">Cache Statistics</span>
        <button
          onClick={fetchStats}
          className="ml-auto text-[10px] px-2 py-0.5 rounded cursor-pointer text-muted hover:text-accent transition-colors"
          style={{ border: '1px solid rgba(30,48,85,0.5)' }}
        >
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(stats).map(([k, v]) => (
          <div key={k} className="text-center">
            <div className="text-[1rem] font-bold font-mono" style={{ color: '#00c8ff' }}>
              {typeof v === 'number' ? v : JSON.stringify(v)}
            </div>
            <div className="text-[9px] text-muted mt-0.5 capitalize">
              {k.replace(/_/g, ' ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsInner() {
  useApiHealth();
  const { apiStatus, wsStatus } = useApp();
  const [activeTab, setActiveTab] = useState('tester');

  return (
    <div className="flex flex-col min-h-full" style={{ paddingTop: '56px' }}>
      {/* Page header */}
      <div
        className="px-6 py-4"
        style={{ borderBottom: '1px solid rgba(30, 48, 85, 0.5)', background: 'rgba(9, 14, 26, 0.8)' }}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Settings size={18} style={{ color: '#f5a623' }} />
            <h1
              className="text-[20px] font-bold text-white"
              style={{ fontFamily: 'Outfit, Inter, sans-serif' }}
            >
              System Diagnostics
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: apiStatus === 'online' ? '#00e08c' : '#f54375' }}
              />
              <span className="text-muted">API: {apiStatus}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi size={11} style={{ color: wsStatus === 'connected' ? '#00c8ff' : 'rgba(107,131,166,0.5)' }} />
              <span className="text-muted">WS: {wsStatus}</span>
            </div>
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-accent transition-colors"
            >
              API Docs →
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex flex-col gap-5 flex-1">
        {/* Cache stats */}
        <CacheStatsPanel />

        {/* Tab switcher */}
        <div className="flex gap-1" style={{ borderBottom: '1px solid rgba(30, 48, 85, 0.5)' }}>
          {[
            { id: 'tester', label: 'API Test Runner', icon: Cpu },
            { id: 'ws', label: 'WebSocket Console', icon: Wifi },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-all cursor-pointer border-b-2 -mb-px"
              style={{
                borderColor: activeTab === id ? '#00c8ff' : 'transparent',
                color: activeTab === id ? '#00c8ff' : 'rgba(107, 131, 166, 0.8)',
                background: 'transparent',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1" style={{ minHeight: '500px' }}>
          {activeTab === 'tester' ? (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(13, 21, 37, 0.5)',
                border: '1px solid rgba(30, 48, 85, 0.5)',
                height: '100%',
              }}
            >
              <TesterView />
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(13, 21, 37, 0.5)',
                border: '1px solid rgba(30, 48, 85, 0.5)',
                height: '100%',
              }}
            >
              <WsConsole />
            </div>
          )}
        </div>

        {/* System info footer */}
        <div
          className="text-[10px] font-mono text-muted py-3 flex flex-wrap gap-4"
          style={{ borderTop: '1px solid rgba(30, 48, 85, 0.4)' }}
        >
          {[
            ['Backend', API_BASE],
            ['Cache', 'L1 RAM · L2 Zarr · L3 Copernicus'],
            ['WebSocket', '/ws/ocean-stream'],
            ['Problem', 'SIH-26067 · INCOIS · MoES'],
          ].map(([k, v]) => (
            <span key={k}>
              <span style={{ color: 'rgba(107,131,166,0.5)' }}>{k}:</span>{' '}
              <span style={{ color: 'rgba(107,131,166,0.8)' }}>{v}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DiagnosticsPage() {
  useEffect(() => {
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen"
      style={{ background: '#06090f' }}
    >
      <AppNav />
      <DiagnosticsInner />
    </motion.div>
  );
}

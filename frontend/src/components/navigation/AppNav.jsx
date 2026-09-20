import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Waves, BarChart3, Eye, Settings, ChevronDown, Activity, Database, Zap, BookOpen } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';
import { API_BASE } from '../../config/api';
import ModeSwitcher from '../mode/ModeSwitcher';

const navLinks = [
  { to: '/explorer',      label: 'Explore',       icon: Waves },
  { to: '/explorer?mode=analyze', label: 'Analyze', icon: BarChart3 },
  { to: '/about',         label: 'About',         icon: BookOpen },
];

export default function AppNav() {
  const { apiStatus, wsStatus } = useApp();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [systemOpen, setSystemOpen] = useState(false);

  const isOnline = apiStatus === 'online';
  const wsConnected = wsStatus === 'connected';

  async function flushCache() {
    try {
      await fetch(`${API_BASE}/api/cache-clear`, { method: 'POST' });
      dispatch({ type: 'ADD_TOAST', payload: { msg: 'L1 RAM cache cleared', variant: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { msg: 'Failed to clear cache', variant: 'error' } });
    }
    setSystemOpen(false);
  }

  return (
    <nav className="app-nav" role="navigation" aria-label="Main navigation">
      <div className="app-nav-inner">

        {/* Brand */}
        <button
          className="app-brand"
          onClick={() => navigate('/')}
          aria-label="Go to oceanStream home"
        >
          <span className="app-brand-mark">~</span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span className="app-brand-name">oceanStream</span>
            <span className="app-brand-sub">INCOIS · SIH26067</span>
          </div>
        </button>

        <div className="app-divider" />

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} role="list">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="listitem"
              className={({ isActive }) =>
                `app-nav-link${isActive ? ' active' : ''}`
              }
            >
              <Icon size={14} strokeWidth={2} />
              {label}
            </NavLink>
          ))}

          {/* System dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setSystemOpen(!systemOpen)}
              className={`app-nav-link${systemOpen ? ' active' : ''}`}
              style={{ cursor: 'pointer' }}
              aria-expanded={systemOpen}
              aria-haspopup="true"
            >
              <Settings size={14} strokeWidth={2} />
              System
              <ChevronDown
                size={11}
                style={{ transition: 'transform 0.2s', transform: systemOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            <AnimatePresence>
              {systemOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.13 }}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    width: '200px',
                    background: '#0d1525',
                    border: '1px solid #1e3055',
                    borderRadius: '12px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                    zIndex: 99999,
                  }}
                >
                  <div style={{ padding: '6px' }}>
                    <button
                      onClick={() => { navigate('/system'); setSystemOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'transparent',
                        fontSize: '13px', color: '#d4e3f7', cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#172647'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Zap size={13} style={{ color: '#f5a623' }} />
                      System Diagnostics
                    </button>
                    <button
                      onClick={flushCache}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'transparent',
                        fontSize: '13px', color: '#d4e3f7', cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#32141c'; e.currentTarget.style.color = '#f54375'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#d4e3f7'; }}
                    >
                      <Database size={13} />
                      Flush L1 Cache
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Global Mode Switcher in Navbar */}
        <div style={{ marginLeft: '16px' }} className="hidden md:block">
          <ModeSwitcher compact={true} />
        </div>

        {/* Right — Status */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>

          {/* API */}
          <div className="app-nav-status">
            <div
              className={`app-nav-dot ${isOnline ? 'online' : apiStatus === 'checking' ? 'checking' : 'offline'}`}
              style={isOnline ? { animation: 'pulse 2s infinite' } : undefined}
            />
            <span>{isOnline ? 'API Ready' : apiStatus === 'checking' ? 'Connecting…' : 'API Offline'}</span>
          </div>

          {/* WS */}
          <div className="app-nav-status" style={{ paddingLeft: '12px', borderLeft: '1px solid #1e3055' }}>
            <Activity
              size={11}
              strokeWidth={2}
              style={{ color: wsConnected ? '#00c8ff' : '#6b83a6' }}
            />
            <span>{wsConnected ? 'Stream Active' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {systemOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
          onClick={() => setSystemOpen(false)}
        />
      )}
    </nav>
  );
}

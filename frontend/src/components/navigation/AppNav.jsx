import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Waves, BarChart3, Settings, ChevronDown, Activity, Database, Zap, BookOpen, Globe } from 'lucide-react';
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
    <nav className="os-appnav" role="navigation" aria-label="Main navigation">
      <div className="os-appnav-inner">

        {/* Brand */}
        <button
          className="os-appnav-brand cursor-target"
          onClick={() => navigate('/')}
          aria-label="Go to oceanStream home"
        >
          <div className="os-appnav-brand-icon">
            <Globe size={16} strokeWidth={2} />
          </div>
          <div className="os-appnav-brand-text">
            <span className="os-appnav-brand-name">oceanStream</span>
            <span className="os-appnav-brand-tag">INCOIS · SIH26067</span>
          </div>
        </button>

        <div className="os-appnav-sep" />

        {/* Nav Links */}
        <div className="os-appnav-links" role="list">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="listitem"
              className={({ isActive }) =>
                `os-appnav-link cursor-target${isActive ? ' active' : ''}`
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
              className={`os-appnav-link cursor-target${systemOpen ? ' active' : ''}`}
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
                  className="os-appnav-dropdown"
                >
                  <div style={{ padding: '6px' }}>
                    <button
                      onClick={() => { navigate('/system'); setSystemOpen(false); }}
                      className="os-appnav-dropdown-item cursor-target"
                    >
                      <Zap size={13} style={{ color: '#f5a623' }} />
                      System Diagnostics
                    </button>
                    <button
                      onClick={flushCache}
                      className="os-appnav-dropdown-item os-appnav-dropdown-danger cursor-target"
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

        {/* Global Mode Switcher */}
        <div className="os-appnav-mode hidden md:block">
          <ModeSwitcher compact={true} />
        </div>

        {/* Right — Status */}
        <div className="os-appnav-status-group">

          {/* API */}
          <div className="os-appnav-status-pill">
            <div className={`os-appnav-status-dot ${isOnline ? 'online' : apiStatus === 'checking' ? 'checking' : 'offline'}`} />
            <span>{isOnline ? 'API Ready' : apiStatus === 'checking' ? 'Connecting…' : 'API Offline'}</span>
          </div>

          <div className="os-appnav-status-sep" />

          {/* WS */}
          <div className="os-appnav-status-pill">
            <Activity
              size={11}
              strokeWidth={2.5}
              className={wsConnected ? 'text-cyan-400' : 'text-slate-500'}
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

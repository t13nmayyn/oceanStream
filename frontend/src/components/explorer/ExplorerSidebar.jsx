import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Thermometer, Droplets, Wind, Leaf, Activity, Droplet, Waves } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

const variables = [
  { id: 'temperature', label: 'Temperature', unit: '°C',      icon: Thermometer, color: '#e8545a' },
  { id: 'salinity',    label: 'Salinity',    unit: 'PSU',     icon: Droplets,    color: '#168ca0' },
  { id: 'currents',    label: 'Currents',    unit: 'm/s',     icon: Wind,        color: '#5a6ab5' },
  { id: 'chlorophyll', label: 'Chlorophyll', unit: 'mg/m³',   icon: Leaf,        color: '#2daa7a' },
  { id: 'oxygen',      label: 'Oxygen',      unit: 'mmol/m³', icon: Activity,    color: '#168ca0' },
  { id: 'nitrate',     label: 'Nitrate',     unit: 'mmol/m³', icon: Droplet,     color: '#c08a2a' },
];

const depths = [
  { label: '0 m',     value: 0 },
  { label: '10 m',    value: 10 },
  { label: '20 m',    value: 20 },
  { label: '50 m',    value: 50 },
  { label: '100 m',   value: 100 },
  { label: '200 m',   value: 200 },
  { label: '500 m',   value: 500 },
  { label: '1000 m',  value: 1000 },
  { label: '2000 m',  value: 2000 },
];

const datePresets = [
  { label: 'Latest',  preset: 'latest' },
  { label: '−7d',     preset: '7d' },
  { label: '−30d',    preset: '30d' },
  { label: '−1 yr',   preset: '1y' },
];

export default function ExplorerSidebar({ onVariableChange, onDepthChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedVariable, setSelectedVariable] = useState('temperature');
  const { depthMax, selectedDate, showThermalHeatmap, showStreamlines } = useApp();
  const dispatch = useAppDispatch();

  const handleVariable = (id) => {
    setSelectedVariable(id);
    onVariableChange?.(id);
  };

  const handleDepth = (val) => {
    dispatch({ type: 'SET_DEPTH', payload: val });
    onDepthChange?.(val);
  };

  const handleDatePreset = (preset) => {
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (preset === 'latest') {
      dispatch({ type: 'SET_DATE', payload: fmt(new Date(today - 86400000)) });
    } else if (preset === '7d') {
      dispatch({ type: 'SET_DATE', payload: fmt(new Date(today - 7 * 86400000)) });
    } else if (preset === '30d') {
      dispatch({ type: 'SET_DATE', payload: fmt(new Date(today - 30 * 86400000)) });
    } else if (preset === '1y') {
      dispatch({ type: 'SET_DATE', payload: fmt(new Date(today - 365 * 86400000)) });
    }
  };

  return (
    <div style={{ position: 'relative', display: 'flex', height: '100%', zIndex: 100 }}>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand controls' : 'Collapse controls'}
        style={{
          position: 'absolute',
          right: collapsed ? '-28px' : '-28px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '28px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
          background: '#f8faf9',
          border: '1px solid #dce4e2',
          borderLeft: 'none',
          color: '#7a9094',
          zIndex: 10,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#168ca0'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#7a9094'; }}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 236, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div
              style={{
                width: '236px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                background: '#f8faf9',
                borderRight: '1px solid #dce4e2',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  borderBottom: '1px solid #dce4e2',
                }}
              >
                <Waves size={13} style={{ color: '#168ca0' }} strokeWidth={2} />
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#7a9094',
                  }}
                >
                  Ocean Controls
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>

                {/* Variable selector */}
                <SidebarSection title="Variable">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {variables.map((v) => {
                      const Icon = v.icon || Thermometer;
                      const isActive = selectedVariable === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => handleVariable(v.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'all 0.15s',
                            background: isActive ? `${v.color}14` : 'transparent',
                            border: isActive ? `1px solid ${v.color}40` : '1px solid transparent',
                            color: isActive ? v.color : '#566870',
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#edf2f1'; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Icon size={13} strokeWidth={2} />
                          <span style={{ flex: 1 }}>{v.label}</span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', opacity: 0.6 }}>
                            {v.unit}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SidebarSection>

                {/* Depth */}
                <SidebarSection title="Depth">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                    {depths.map((d) => {
                      const isActive = depthMax === d.value;
                      return (
                        <button
                          key={d.value}
                          onClick={() => handleDepth(d.value)}
                          style={{
                            padding: '6px 4px',
                            borderRadius: '6px',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '10px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s',
                            background: isActive ? '#e5f3f4' : '#edf2f1',
                            border: isActive ? '1px solid #168ca0' : '1px solid #d8e2e0',
                            color: isActive ? '#168ca0' : '#5a7076',
                          }}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </SidebarSection>

                {/* Date */}
                <SidebarSection title="Date">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => dispatch({ type: 'SET_DATE', payload: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, monospace',
                        outline: 'none',
                        background: '#ffffff',
                        border: '1px solid #d4dedc',
                        color: '#172027',
                        colorScheme: 'light',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                      {datePresets.map((p) => (
                        <button
                          key={p.preset}
                          onClick={() => handleDatePreset(p.preset)}
                          style={{
                            padding: '5px 4px',
                            borderRadius: '6px',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '10px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'center',
                            background: '#edf2f1',
                            border: '1px solid #d4dedc',
                            color: '#566870',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#e5f3f4'; e.currentTarget.style.color = '#168ca0'; e.currentTarget.style.borderColor = '#168ca0'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#edf2f1'; e.currentTarget.style.color = '#566870'; e.currentTarget.style.borderColor = '#d4dedc'; }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </SidebarSection>

                {/* Layers */}
                <SidebarSection title="Layers">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <ToggleRow
                      label="SST Heatmap"
                      sub="Sea surface temperature"
                      active={showThermalHeatmap}
                      color="#e8545a"
                      onToggle={() => dispatch({ type: 'TOGGLE_HEATMAP' })}
                    />
                    <ToggleRow
                      label="Ocean Currents"
                      sub="Particle flow animation"
                      active={showStreamlines}
                      color="#5a6ab5"
                      onToggle={() => dispatch({ type: 'TOGGLE_STREAMLINES' })}
                    />
                  </div>
                </SidebarSection>

                {/* View Mode */}
                <SidebarSection title="View Mode">
                  <EngineToggle />
                </SidebarSection>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarSection({ title, children }) {
  return (
    <div style={{ padding: '12px 12px', borderBottom: '1px solid #e8eeec' }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '8px',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#9aacb0',
          marginBottom: '8px',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, sub, active, color, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#3a5258' }}>{label}</div>
        <div style={{ fontSize: '10px', color: '#8aa0a4' }}>{sub}</div>
      </div>
      <button
        onClick={onToggle}
        aria-pressed={active}
        style={{
          position: 'relative',
          width: '34px',
          height: '18px',
          borderRadius: '999px',
          cursor: 'pointer',
          border: 'none',
          flexShrink: 0,
          background: active ? color : '#d4dedc',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: active ? '16px' : '2px',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: '#ffffff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          }}
        />
      </button>
    </div>
  );
}

function EngineToggle() {
  const { engineMode } = useApp();
  const dispatch = useAppDispatch();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
      {[
        { id: '3d', label: '3D Globe', sub: 'Cesium' },
        { id: '2d', label: '2D Map',   sub: 'Leaflet' },
      ].map((m) => {
        const isActive = engineMode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => dispatch({ type: 'SET_ENGINE_MODE', payload: m.id })}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 4px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: isActive ? '#e5f3f4' : '#edf2f1',
              border: isActive ? '1px solid #168ca0' : '1px solid #d8e2e0',
              color: isActive ? '#168ca0' : '#566870',
            }}
          >
            {m.label}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', marginTop: '2px', opacity: 0.6 }}>
              {m.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

import { useApp } from '../../context/AppContext';
import { Database, Calendar, Layers, Wifi, WifiOff } from 'lucide-react';

const cacheColors = {
  L1_RAM:         '#2dba7e',
  L2_ZARR:        '#c08a2a',
  FRESHLY_FETCHED: '#5a6ab5',
  FETCHING:       '#c08a2a',
};

export default function StatusBar({ selectedVariable = 'temperature', lastCacheLevel }) {
  const { depthMax, selectedDate, apiStatus, wsStatus } = useApp();

  const cacheColor = cacheColors[lastCacheLevel] || '#9aacb0';

  return (
    <div
      className="app-status-bar"
      role="status"
      aria-label="Explorer status bar"
    >
      {/* Variable */}
      <StatusItem
        icon={<Layers size={11} />}
        label="Variable"
        value={selectedVariable}
        valueColor="#e8545a"
        capitalize
      />

      <Divider />

      {/* Depth */}
      <StatusItem
        icon={<span style={{ fontSize: '10px', lineHeight: 1 }}>↓</span>}
        label="Depth"
        value={`${depthMax} m`}
        valueColor="#5a6ab5"
      />

      <Divider />

      {/* Date */}
      <StatusItem
        icon={<Calendar size={11} />}
        label="Date"
        value={selectedDate}
        valueColor="#168ca0"
      />

      <Divider />

      {/* Source */}
      <StatusItem label="Source" value="CMEMS · Argo" />

      {/* Cache level */}
      {lastCacheLevel && (
        <>
          <Divider />
          <StatusItem
            icon={<Database size={11} />}
            label="Cache"
            value={lastCacheLevel}
            valueColor={cacheColor}
            bold
          />
        </>
      )}

      {/* Spacer + right status */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* API status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div
            style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: apiStatus === 'online' ? '#2dba7e' : apiStatus === 'checking' ? '#e6982f' : '#d05252',
            }}
          />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#7a9094' }}>
            {apiStatus === 'online' ? 'API Ready' : apiStatus === 'checking' ? 'Connecting…' : 'API Offline'}
          </span>
        </div>

        {/* WS status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {wsStatus === 'connected'
            ? <Wifi size={11} style={{ color: '#168ca0' }} />
            : <WifiOff size={11} style={{ color: '#b0bcbf' }} />
          }
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#7a9094' }}>
            {wsStatus === 'connected' ? 'Stream' : 'Offline'}
          </span>
        </div>

        {/* Hint */}
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#b8c4c8' }}>
          Click ocean to inspect
        </span>
      </div>
    </div>
  );
}

function StatusItem({ icon, label, value, valueColor, capitalize, bold }) {
  return (
    <div className="app-status-item">
      {icon && (
        <span style={{ color: '#9aacb0', display: 'flex', alignItems: 'center' }}>{icon}</span>
      )}
      <span style={{ color: '#9aacb0' }}>{label}:</span>
      <strong
        style={{
          color: valueColor || '#3a5258',
          fontWeight: bold ? 700 : 600,
          textTransform: capitalize ? 'capitalize' : 'none',
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function Divider() {
  return <div className="app-status-divider" />;
}

/**
 * CoordinateExplorer — Phase 2C
 *
 * Bottom-left overlay on /explorer with premium dark glassmorphism UI.
 * Four fields: Latitude, Longitude, Depth, Date
 * Quick region pills fill the fields but do NOT navigate.
 * "Explore" validates all four fields then calls onExplore.
 */
import { useState, useEffect } from 'react';
import { REGION_MARKERS } from '../map/LightweightGlobeView';
import { MapPin, Calendar, Layers, Navigation, Compass, ChevronRight, Crosshair } from 'lucide-react';

const QUICK_REGIONS = ['Arabian Sea', 'Bay of Bengal', 'Indian Ocean', 'Andaman Sea', 'Lakshadweep Sea'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function CoordinateExplorer({ onExplore, focusedRegion }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [depth, setDepth] = useState('0');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  // When a globe marker is hovered/clicked by parent, fill lat & lon
  useEffect(() => {
    if (focusedRegion && focusedRegion.id !== 'custom-region') {
      setLat(String(focusedRegion.lat));
      setLon(String(focusedRegion.lng));
      setError('');
    } else if (focusedRegion?.id === 'custom-region') {
      setLat('');
      setLon('');
      setError('');
    }
  }, [focusedRegion]);

  const handleQuickRegion = (name) => {
    const region = REGION_MARKERS.find(r => r.name === name);
    if (region) {
      setLat(String(region.lat));
      setLon(String(region.lng));
      setError('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    const parsedDepth = parseFloat(depth) || 0;

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setError('Latitude must be between -90 and 90.');
      return;
    }
    if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      setError('Longitude must be between -180 and 180.');
      return;
    }
    if (parsedDepth < 0 || parsedDepth > 6000) {
      setError('Depth must be between 0 and 6000 m.');
      return;
    }

    const safeDate = date || todayISO();
    const matchedRegion = REGION_MARKERS.find(
      r => r.lat === parsedLat && r.lng === parsedLon && r.bbox
    );
    const bbox = matchedRegion?.bbox ?? {
      south: clamp(parsedLat - 2, -90, 90),
      north: clamp(parsedLat + 2, -90, 90),
      west: clamp(parsedLon - 2, -180, 180),
      east: clamp(parsedLon + 2, -180, 180),
    };

    onExplore(
      { lat: parsedLat, lon: parsedLon, depth: parsedDepth, date: safeDate },
      bbox,
      matchedRegion?.name ?? null
    );
  };

  const canSubmit = lat !== '' && lon !== '';
  const hasCoords = lat !== '' && lon !== '';
  const latDisplay = lat ? (parseFloat(lat) >= 0 ? `${parseFloat(lat).toFixed(2)}°N` : `${Math.abs(parseFloat(lat)).toFixed(2)}°S`) : '—';
  const lonDisplay = lon ? (parseFloat(lon) >= 0 ? `${parseFloat(lon).toFixed(2)}°E` : `${Math.abs(parseFloat(lon)).toFixed(2)}°W`) : '—';

  return (
    <div className="absolute bottom-5 left-5 z-20 w-[340px] select-none" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Main Panel */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(8,20,30,0.92) 0%, rgba(12,28,42,0.88) 100%)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
          border: '1px solid rgba(0,229,255,0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 1px rgba(0,229,255,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* Header */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full cursor-target"
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 16px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: isExpanded ? '1px solid rgba(0,229,255,0.08)' : 'none',
          }}
        >
          <div style={{
            width: '30px', height: '30px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #00e5ff22, #10b98122)',
            border: '1px solid rgba(0,229,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Crosshair size={14} style={{ color: '#00e5ff' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              Coordinate Explorer
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px', fontFamily: "'JetBrains Mono', monospace" }}>
              {hasCoords ? `${latDisplay} · ${lonDisplay}` : 'Click globe or type coords'}
            </div>
          </div>
          <ChevronRight
            size={14}
            style={{
              color: '#64748b',
              transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        {/* Collapsible Body */}
        {isExpanded && (
          <div style={{ padding: '12px 16px 16px' }}>

            {/* Quick Region Pills */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{
                fontSize: '9px', fontWeight: 700, color: '#475569',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                marginBottom: '8px',
              }}>
                Quick Regions
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {QUICK_REGIONS.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleQuickRegion(name)}
                    className="cursor-target"
                    style={{
                      padding: '4px 10px', borderRadius: '999px',
                      background: 'rgba(0,229,255,0.06)',
                      border: '1px solid rgba(0,229,255,0.12)',
                      color: '#94a3b8', fontSize: '10px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      letterSpacing: '0.01em',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(0,229,255,0.15)';
                      e.currentTarget.style.color = '#00e5ff';
                      e.currentTarget.style.borderColor = 'rgba(0,229,255,0.35)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(0,229,255,0.06)';
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.borderColor = 'rgba(0,229,255,0.12)';
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>

              {/* Lat / Lon row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '9px', fontWeight: 700, color: '#475569',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: '5px',
                  }}>
                    <MapPin size={9} style={{ color: '#00e5ff' }} /> Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    required
                    value={lat}
                    onChange={e => { setLat(e.target.value); setError(''); }}
                    placeholder="-90 to 90"
                    className="cursor-target"
                    style={{
                      width: '100%', padding: '7px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(100,116,139,0.25)',
                      borderRadius: '8px',
                      color: '#e2e8f0', fontSize: '12px',
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'rgba(0,229,255,0.5)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'rgba(100,116,139,0.25)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '9px', fontWeight: 700, color: '#475569',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: '5px',
                  }}>
                    <Navigation size={9} style={{ color: '#00e5ff' }} /> Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    required
                    value={lon}
                    onChange={e => { setLon(e.target.value); setError(''); }}
                    placeholder="-180 to 180"
                    className="cursor-target"
                    style={{
                      width: '100%', padding: '7px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(100,116,139,0.25)',
                      borderRadius: '8px',
                      color: '#e2e8f0', fontSize: '12px',
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'rgba(0,229,255,0.5)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'rgba(100,116,139,0.25)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Depth / Date row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '9px', fontWeight: 700, color: '#475569',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: '5px',
                  }}>
                    <Layers size={9} style={{ color: '#00e5ff' }} /> Depth (m)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="6000"
                    step="10"
                    value={depth}
                    onChange={e => { setDepth(e.target.value); setError(''); }}
                    className="cursor-target"
                    style={{
                      width: '100%', padding: '7px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(100,116,139,0.25)',
                      borderRadius: '8px',
                      color: '#e2e8f0', fontSize: '12px',
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'rgba(0,229,255,0.5)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'rgba(100,116,139,0.25)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '9px', fontWeight: 700, color: '#475569',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: '5px',
                  }}>
                    <Calendar size={9} style={{ color: '#00e5ff' }} /> Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={e => setDate(e.target.value)}
                    className="cursor-target"
                    style={{
                      width: '100%', padding: '7px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(100,116,139,0.25)',
                      borderRadius: '8px',
                      color: '#e2e8f0', fontSize: '11px',
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      colorScheme: 'dark',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'rgba(0,229,255,0.5)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'rgba(100,116,139,0.25)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Validation error */}
              {error && (
                <div style={{
                  fontSize: '10px', color: '#f87171',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '8px', padding: '7px 10px',
                  marginBottom: '10px',
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit}
                className="cursor-target"
                style={{
                  width: '100%', padding: '9px 0',
                  background: canSubmit
                    ? 'linear-gradient(135deg, #00e5ff 0%, #10b981 100%)'
                    : 'rgba(100,116,139,0.15)',
                  border: 'none',
                  borderRadius: '10px',
                  color: canSubmit ? '#0f172a' : '#475569',
                  fontSize: '12px', fontWeight: 700,
                  letterSpacing: '0.02em',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'all 0.25s ease',
                  boxShadow: canSubmit ? '0 4px 16px rgba(0,229,255,0.2)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
                onMouseEnter={e => {
                  if (canSubmit) e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,229,255,0.35)';
                }}
                onMouseLeave={e => {
                  if (canSubmit) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,229,255,0.2)';
                }}
              >
                <Compass size={13} />
                Explore Region
                <ChevronRight size={13} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

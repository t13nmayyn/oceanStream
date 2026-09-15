import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin } from 'lucide-react';
import { API_BASE } from '../../config/api';
import { useApp } from '../../context/AppContext';

const cacheColorMap = {
  L1_RAM:          '#2dba7e',
  L2_ZARR:         '#c08a2a',
  FRESHLY_FETCHED: '#5a6ab5',
  FETCHING:        '#c08a2a',
};

// Light theme data row
function DataRow({ label, value, unit, color }) {
  return (
    <div className="app-data-row">
      <span className="app-data-label">{label}</span>
      <span
        className="app-data-value"
        style={{ color: color || '#172027' }}
      >
        {value !== undefined && value !== null ? `${value}${unit ? ' ' + unit : ''}` : '—'}
      </span>
    </div>
  );
}

// Section badge
function SectionTag({ text, type = 'model' }) {
  return (
    <div className={`app-inspector-section-tag ${type}`}>
      {text}
    </div>
  );
}

export default function PointInspector({ point, onClose, onLoadFloatProfile }) {
  const { depthMax, selectedDate } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!point) return;
    setLoading(true);
    setError(null);
    setData(null);

    const url = `${API_BASE}/ocean/point?lat=${point.lat.toFixed(4)}&lon=${point.lon.toFixed(4)}&depth=${depthMax}&date=${selectedDate}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => { setData(json); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [point, depthMax, selectedDate]);

  if (!point) return null;

  const phy  = data?.physics || {};
  const bgc  = data?.bgc    || {};
  const argo = data?.nearest_argo_float;
  const cacheColor = cacheColorMap[data?.cache] || '#9aacb0';

  const retryFetch = () => {
    setLoading(true);
    setError(null);
    const url = `${API_BASE}/ocean/point?lat=${point.lat.toFixed(4)}&lon=${point.lon.toFixed(4)}&depth=${depthMax}&date=${selectedDate}`;
    fetch(url)
      .then(r => r.json())
      .then(j => { setData(j); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  return (
    <AnimatePresence>
      {point && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.97 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="app-inspector"
          role="dialog"
          aria-label="Ocean point data"
        >
          {/* Header */}
          <div className="app-inspector-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <MapPin size={13} style={{ color: '#168ca0' }} />
              <span className="app-inspector-title">Ocean Inspector</span>
            </div>
            <button
              className="app-inspector-close"
              onClick={onClose}
              aria-label="Close inspector"
            >
              <X size={13} />
            </button>
          </div>

          {/* Coordinates */}
          <div className="app-inspector-coords">
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
              <span style={{ color: '#168ca0', fontWeight: 600 }}>
                {Math.abs(point.lat).toFixed(4)}° {point.lat >= 0 ? 'N' : 'S'}
              </span>
              <span style={{ color: '#9aacb0', margin: '0 6px' }}>/</span>
              <span style={{ color: '#5a6ab5', fontWeight: 600 }}>
                {Math.abs(point.lon).toFixed(4)}° {point.lon >= 0 ? 'E' : 'W'}
              </span>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#2daa7a', fontWeight: 600 }}>
              {depthMax} m
            </div>
          </div>

          {/* Body */}
          <div className="app-inspector-body">
            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <div
                  style={{
                    display: 'inline-block',
                    width: '24px', height: '24px',
                    borderRadius: '50%',
                    border: '2px solid #dce4e2',
                    borderTopColor: '#168ca0',
                    animation: 'spin 0.8s linear infinite',
                    marginBottom: '10px',
                  }}
                />
                <div style={{ fontSize: '12px', color: '#7a9094' }}>Querying ocean data…</div>
              </div>
            ) : error ? (
              <div style={{ padding: '12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#d05252', marginBottom: '6px' }}>Data unavailable</div>
                <div style={{ fontSize: '10px', color: '#9aacb0', marginBottom: '10px' }}>{error}</div>
                <button
                  onClick={retryFetch}
                  style={{
                    padding: '5px 14px', borderRadius: '6px', fontSize: '11px',
                    background: '#e5f3f4', color: '#168ca0', border: '1px solid #b2d8dc', cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : data ? (
              <>
                {/* Status pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', padding: '2px 7px', borderRadius: '4px', background: '#e8f7ef', color: '#2daa7a', border: '1px solid #b0d8c0' }}>
                    {data.status === 'ok' ? '● Ready' : '↻ Fetching'}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', padding: '2px 7px', borderRadius: '4px', background: `${cacheColor}18`, color: cacheColor, border: `1px solid ${cacheColor}40` }}>
                    {data.cache || 'CACHE'}
                  </span>
                  {data.elapsed_ms !== undefined && (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', padding: '2px 7px', borderRadius: '4px', background: '#f4f6f5', color: '#9aacb0', border: '1px solid #dce4e2' }}>
                      {data.elapsed_ms} ms
                    </span>
                  )}
                </div>

                {/* Physics */}
                <div>
                  <SectionTag text="Model Data · CMEMS" type="model" />
                  <DataRow label="Temperature"  value={phy.temperature_c}  unit="°C"  color="#e8545a" />
                  <DataRow label="Salinity"      value={phy.salinity_psu}   unit="PSU" color="#168ca0" />
                  {phy.current_u_ms !== undefined && phy.current_v_ms !== undefined && (
                    <DataRow
                      label="Current Speed"
                      value={Math.sqrt((phy.current_u_ms || 0) ** 2 + (phy.current_v_ms || 0) ** 2).toFixed(3)}
                      unit="m/s"
                      color="#5a6ab5"
                    />
                  )}
                  {phy.sea_level_m !== undefined && (
                    <DataRow label="Sea Level" value={phy.sea_level_m} unit="m" color="#2daa7a" />
                  )}
                </div>

                {/* BGC */}
                {Object.keys(bgc).length > 0 && (
                  <div>
                    <SectionTag text="BGC · CMEMS" type="model" />
                    {bgc.chlorophyll_mgl   !== undefined && <DataRow label="Chlorophyll-a" value={bgc.chlorophyll_mgl}   unit="mg/m³"   color="#2daa7a" />}
                    {bgc.oxygen_mmolm3     !== undefined && <DataRow label="Dissolved O₂"  value={bgc.oxygen_mmolm3}     unit="mmol/m³" color="#168ca0" />}
                    {bgc.nitrate_mmolm3    !== undefined && <DataRow label="Nitrate"        value={bgc.nitrate_mmolm3}    unit="mmol/m³" color="#c08a2a" />}
                    {bgc.ph               !== undefined && <DataRow label="pH"             value={bgc.ph}               unit=""        color="#5a6ab5" />}
                    {bgc.pco2_uatm        !== undefined && <DataRow label="pCO₂"           value={bgc.pco2_uatm}        unit="µatm"    color="#e8545a" />}
                  </div>
                )}

                {/* Dataset info pill */}
                {data.dataset_info && (
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', padding: '6px 10px', borderRadius: '6px', background: '#f4f8f7', color: '#9aacb0', border: '1px solid #dce4e2' }}>
                    {data.dataset_info.product_type === 'analysisforecast' ? 'ANFC · Near-real-time' : 'GLORYS12 · Reanalysis'}
                    {data.dataset_info.is_recent !== undefined && (
                      <span style={{ marginLeft: '8px' }}>{data.dataset_info.is_recent ? '(Recent)' : '(Historical)'}</span>
                    )}
                  </div>
                )}

                {/* Nearest Argo */}
                <div>
                  <SectionTag text="Observation · Argo" type="observation" />
                  {argo ? (
                    <div style={{ background: '#e8f7ef', border: '1px solid #b0d8c0', borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'Manrope, sans-serif', fontSize: '13px', fontWeight: 600, color: '#172027' }}>
                          Float #{argo.platform_number}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: '#d0f0e0', color: '#2daa7a', fontWeight: 700 }}>
                          {argo.type || 'core'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#7a9094', marginBottom: '8px' }}>
                        {argo.distance_km} km away
                      </div>
                      <button
                        style={{
                          width: '100%', padding: '6px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                          background: '#2daa7a', color: '#ffffff', border: 'none', cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => onLoadFloatProfile?.(argo.platform_number)}
                        onMouseEnter={e => e.currentTarget.style.background = '#259e6e'}
                        onMouseLeave={e => e.currentTarget.style.background = '#2daa7a'}
                      >
                        View Depth Profile
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#9aacb0', padding: '4px 0' }}>
                      No floats within search radius
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';
import { useApp } from '../../context/AppContext';

export default function PointInspector({ point, onClose, onLoadFloatProfile }) {
  const { depthMin, selectedDate } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!point) return;
    setLoading(true);
    setError(null);

    const url = `${API_BASE}/ocean/point?lat=${point.lat.toFixed(4)}&lon=${point.lon.toFixed(4)}&depth=${depthMin}&date=${selectedDate}`;
    fetch(url)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [point, depthMin, selectedDate]);

  if (!point) return null;

  const phy = data?.physics || {};
  const bgc = data?.bgc || {};
  const argo = data?.nearest_argo_float;

  return (
    <div className="absolute top-16 right-4 w-84 bg-surface/95 border border-border-bright rounded-lg p-3 z-50 backdrop-blur-md shadow-2xl animate-fade-in text-xs">
      <div className="flex justify-between items-center border-b border-border pb-1.5 mb-2 font-bold text-white">
        <span>📍 Click-to-Query (/ocean/point)</span>
        <button
          onClick={onClose}
          className="cursor-pointer text-muted hover:text-white text-lg font-bold"
        >
          &times;
        </button>
      </div>

      {loading ? (
        <div className="text-accent py-2">
          Querying /ocean/point for ({point.lat.toFixed(3)}°N, {point.lon.toFixed(3)}°E)…
        </div>
      ) : error ? (
        <div className="text-rose py-2">Failed: {error}</div>
      ) : data ? (
        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-accent">
            Lat: {point.lat.toFixed(4)}° · Lon: {point.lon.toFixed(4)}° · Depth: {depthMin}m
          </div>
          <div className="flex gap-1.5 mb-1">
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-green/15 text-green border border-green/30 font-mono">
              Status: {data.status}
            </span>
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25 font-mono">
              Cache: {data.cache || 'L2'}
            </span>
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-surface-3 text-muted border border-border font-mono">
              {data.elapsed_ms || 0}ms
            </span>
          </div>

          <div className="bg-surface-3 p-2 rounded">
            <strong className="text-white block mb-0.5">Physics:</strong>
            <div className="flex justify-between text-text">
              <span>Temp: <strong className="text-accent">{phy.temperature_c !== undefined ? `${phy.temperature_c} °C` : '–'}</strong></span>
              <span>Salinity: <strong className="text-green">{phy.salinity_psu !== undefined ? `${phy.salinity_psu} PSU` : '–'}</strong></span>
            </div>
            <div className="flex justify-between text-muted text-[0.68rem] mt-1 font-mono">
              <span>Cur U: {phy.current_u_ms ?? '–'} m/s</span>
              <span>Cur V: {phy.current_v_ms ?? '–'} m/s</span>
              <span>Sea Lvl: {phy.sea_level_m ?? '–'} m</span>
            </div>
          </div>

          <div className="bg-surface-3 p-2 rounded">
            <strong className="text-white block mb-0.5">Biogeochemistry (BGC):</strong>
            <div className="flex justify-between text-text">
              <span>Chl-a: <strong className="text-green">{bgc.chlorophyll_mgl !== undefined ? `${bgc.chlorophyll_mgl} mg/m³` : '–'}</strong></span>
              <span>Oxygen: <strong className="text-accent">{bgc.oxygen_mmolm3 !== undefined ? `${bgc.oxygen_mmolm3} mmol/m³` : '–'}</strong></span>
            </div>
          </div>

          <div className="bg-surface-3 p-2 rounded">
            <strong className="text-white block mb-0.5">Nearest Argo Float:</strong>
            {argo ? (
              <div>
                <div className="text-text mt-0.5">
                  Platform <strong>#{argo.platform_number}</strong> ({argo.type || 'core'}) · <strong>{argo.distance_km} km</strong> away
                </div>
                <button
                  className="w-full mt-1.5 py-1 text-xs rounded border border-border bg-surface-2 text-accent hover:bg-surface hover:border-accent cursor-pointer transition-colors"
                  onClick={() => onLoadFloatProfile?.(argo.platform_number)}
                >
                  View Full Profile Chart 📈
                </button>
              </div>
            ) : (
              <div className="text-muted">No floats within radius.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import Button from '../ui/Button';

export default function ArgoSearch({ onSearch, loading }) {
  const [lat, setLat] = useState('13.08');
  const [lon, setLon] = useState('80.27');
  const [radius, setRadius] = useState(500);
  const [type, setType] = useState('both');

  const handleSubmit = (e) => {
    e?.preventDefault();
    onSearch({ lat, lon, radius, type });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-xs">
        <label className="text-muted">Lat / Lon:</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-16 bg-surface-3 text-text border border-border px-1.5 py-1 rounded text-xs font-mono outline-none focus:border-accent"
          />
          <input
            type="text"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            className="w-16 bg-surface-3 text-text border border-border px-1.5 py-1 rounded text-xs font-mono outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="flex justify-between items-center text-xs">
        <label className="text-muted">Search Radius (km):</label>
        <input
          type="number"
          value={radius}
          min="50"
          max="2500"
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-20 bg-surface-3 text-text border border-border px-1.5 py-1 rounded text-xs font-mono outline-none focus:border-accent"
        />
      </div>

      <div className="flex justify-between items-center text-xs">
        <label className="text-muted">Instrument Type:</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-28 bg-surface-3 text-text border border-border px-1.5 py-1 rounded text-xs font-mono outline-none focus:border-accent"
        >
          <option value="both">Core + BGC</option>
          <option value="core">Core Argo</option>
          <option value="bgc">BGC-Argo</option>
        </select>
      </div>

      <Button
        variant="primary"
        type="submit"
        disabled={loading}
        className="w-full mt-1 flex justify-center items-center font-bold"
      >
        {loading ? 'Searching…' : '🎯 Search Nearest Floats'}
      </Button>
    </form>
  );
}

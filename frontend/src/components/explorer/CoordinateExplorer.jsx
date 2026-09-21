/**
 * CoordinateExplorer — Phase 2B
 *
 * Bottom-left overlay on /explorer. Four fields:
 *   - Latitude (required, -90..90)
 *   - Longitude (required, -180..180)
 *   - Depth (default 0, 0..6000 m)
 *   - Date (default today, ISO date string)
 *
 * Quick region pills fill the fields but do NOT navigate.
 * "Explore" validates all four fields then calls onExplore with
 * { lat, lon, depth, date } plus a resolved bbox.
 *
 * bbox resolution:
 *   - Named region match → real bbox from REGION_MARKERS
 *   - Freeform coordinates → ±2° derived box
 */
import { useState, useEffect } from 'react';
import { REGION_MARKERS } from '../map/LightweightGlobeView';
import { MapPin, Calendar, Layers, Navigation } from 'lucide-react';

const QUICK_REGIONS = ['Arabian Sea', 'Bay of Bengal', 'Indian Ocean'];

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

  // When a globe marker is hovered/clicked by parent, fill lat & lon
  useEffect(() => {
    if (focusedRegion && focusedRegion.id !== 'custom-region') {
      setLat(String(focusedRegion.lat));
      setLon(String(focusedRegion.lng));
      setError('');
    } else if (focusedRegion?.id === 'custom-region') {
      // Custom region: clear fields so user enters their own
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

    // Resolve bbox: exact REGION_MARKERS match → real bbox; else ±2°
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

  return (
    <div className="absolute bottom-8 left-8 z-10 w-[340px] bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl rounded-2xl border border-slate-200/50 overflow-hidden">
      
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
          <h2 className="text-[16px] font-bold text-slate-800 tracking-tight leading-none">OceanStream Explorer</h2>
        </div>
        <p className="text-[12px] text-slate-500 leading-relaxed">Select a region or enter coordinates to begin.</p>
      </div>

      {/* Quick Regions */}
      <div className="px-5 pb-3">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Regions</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REGIONS.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => handleQuickRegion(name)}
              className="px-3 py-1 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[11px] font-semibold rounded-full transition-colors border border-transparent hover:border-teal-200 cursor-pointer"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-slate-100 mb-3" />

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">

        {/* Lat / Lon row */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              <MapPin size={10} className="text-teal-500" /> Latitude
            </label>
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              required
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all placeholder:text-slate-300"
              value={lat}
              onChange={e => { setLat(e.target.value); setError(''); }}
              placeholder="-90 to 90"
            />
          </div>
          <div className="flex-1">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              <Navigation size={10} className="text-teal-500" /> Longitude
            </label>
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              required
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all placeholder:text-slate-300"
              value={lon}
              onChange={e => { setLon(e.target.value); setError(''); }}
              placeholder="-180 to 180"
            />
          </div>
        </div>

        {/* Depth / Date row */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              <Layers size={10} className="text-teal-500" /> Depth (m)
            </label>
            <input
              type="number"
              min="0"
              max="6000"
              step="10"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
              value={depth}
              onChange={e => { setDepth(e.target.value); setError(''); }}
            />
          </div>
          <div className="flex-1">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              <Calendar size={10} className="text-teal-500" /> Date
            </label>
            <input
              type="date"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
              value={date}
              max={todayISO()}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Validation error */}
        {error && (
          <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-[13px] rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm shadow-teal-500/20"
        >
          Explore Region
        </button>
      </form>
    </div>
  );
}

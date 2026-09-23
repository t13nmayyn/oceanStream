import { useState, useEffect } from 'react';
import { REGION_MARKERS } from '../map/LightweightGlobeView';

const MAJOR_OCEANS = ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Southern Ocean', 'Arctic Ocean'];
const REGIONAL_SEAS = ['Bay of Bengal', 'Arabian Sea', 'Andaman Sea'];
const QUICK_REGIONS = [...MAJOR_OCEANS, ...REGIONAL_SEAS];

export default function CoordinatePanel({ onExplore, focusedRegion }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  useEffect(() => {
    if (focusedRegion) {
      setLat(focusedRegion.lat);
      setLon(focusedRegion.lng);
    }
  }, [focusedRegion]);

  const handleQuickRegion = (name) => {
    const region = REGION_MARKERS.find(r => r.name === name);
    if (region) {
      setLat(region.lat);
      setLon(region.lng);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    
    if (isNaN(parsedLat) || isNaN(parsedLon)) return;

    // Check if it exactly matches a predefined region to use its bbox
    const matchedRegion = REGION_MARKERS.find(r => r.lat === parsedLat && r.lng === parsedLon);
    let bbox;
    
    if (matchedRegion && matchedRegion.bbox) {
      bbox = matchedRegion.bbox;
    } else {
      // Generic ±2 degree bbox for manual freeform coordinates
      bbox = {
        south: parsedLat - 2,
        north: parsedLat + 2,
        west: parsedLon - 2,
        east: parsedLon + 2
      };
    }

    onExplore({ lat: parsedLat, lon: parsedLon, depth: 0, date: null }, bbox);
  };

  return (
    <div className="absolute top-24 left-8 z-10 w-[320px] bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl rounded-2xl p-6 border border-slate-200/50">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-teal-500"></div>
        <h2 className="text-[18px] font-bold text-slate-800 tracking-tight leading-none">OceanStream Explorer</h2>
      </div>
      <p className="text-[13px] text-slate-500 mb-5 leading-relaxed">Select a region or enter coordinates to begin your scientific analysis.</p>

      <div className="mb-5">
        <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Quick Regions</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REGIONS.map(name => (
            <button 
              key={name}
              type="button"
              onClick={() => handleQuickRegion(name)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[12px] font-medium rounded-full transition-colors border border-transparent hover:border-teal-200 cursor-pointer"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Latitude</label>
            <input 
              type="number" 
              step="any"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[14px] text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all placeholder:text-slate-300" 
              value={lat} 
              onChange={e => setLat(e.target.value)} 
              placeholder="e.g. 15.0"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Longitude</label>
            <input 
              type="number" 
              step="any"
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[14px] text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all placeholder:text-slate-300" 
              value={lon} 
              onChange={e => setLon(e.target.value)} 
              placeholder="e.g. 65.0"
            />
          </div>
        </div>
        <button 
          type="submit" 
          disabled={lat === '' || lon === ''}
          className="w-full py-2.5 mt-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-[14px] rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm shadow-teal-500/20"
        >
          Explore Region
        </button>
      </form>
    </div>
  );
}

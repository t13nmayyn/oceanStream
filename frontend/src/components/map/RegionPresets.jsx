import { useAppDispatch } from '../../context/AppContext';

export const REGIONS = {
  indo_southern: { name: '🌍 Indo-Southern Gyre', lon: 78.0, lat: -12.0, height: 6800000, pitch: -72, zoom: 3 },
  bay_of_bengal: { name: '🇮🇳 Bay of Bengal',     lon: 85.0, lat: 14.5,  height: 2600000, pitch: -65, zoom: 5 },
  arabian_sea:   { name: '🌀 Arabian Sea',       lon: 66.0, lat: 16.5,  height: 2600000, pitch: -65, zoom: 5 },
  indian_ocean:  { name: '🌊 Indian Ocean',      lon: 78.0, lat: 5.0,   height: 4800000, pitch: -72, zoom: 4 },
  pacific:       { name: '🌎 Pacific',           lon: 160.0, lat: 0.0,  height: 7500000, pitch: -80, zoom: 3 },
  global:        { name: '🌐 Global',            lon: 80.0, lat: 10.0,  height: 12500000, pitch: -88, zoom: 2 },
};

export default function RegionPresets({ onFlyTo }) {
  const dispatch = useAppDispatch();

  const handleSelect = (key) => {
    const r = REGIONS[key];
    onFlyTo?.(r);
    dispatch({
      type: 'ADD_TOAST',
      payload: { message: `Flying to ${key.replace(/_/g, ' ').toUpperCase()}`, type: 'info' },
    });
  };

  return (
    <div className="absolute top-3.5 right-3.5 z-50 flex items-center gap-1.5 bg-surface/90 border border-border px-2.5 py-1.5 rounded-xl backdrop-blur-md shadow-2xl">
      <span className="text-[0.68rem] text-muted mr-0.5 font-semibold">Fly to:</span>
      {Object.entries(REGIONS).map(([key, item]) => (
        <button
          key={key}
          onClick={() => handleSelect(key)}
          className="px-2.5 py-0.5 rounded-lg border border-border bg-surface-3 text-text text-[0.68rem] hover:border-accent hover:text-accent cursor-pointer transition-all"
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}

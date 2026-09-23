import { useAppDispatch } from '../../context/AppContext';

export const REGIONS = {
  // Major World Oceans
  pacific_ocean:  { name: '🌊 Pacific Ocean',  lon: -160.0, lat: 0.0,   height: 8500000, pitch: -80, zoom: 3, bbox: { south: -30, north: 35, west: 140, east: -90 } },
  atlantic_ocean: { name: '🌊 Atlantic Ocean', lon: -35.0,  lat: 15.0,  height: 7500000, pitch: -75, zoom: 3, bbox: { south: -25, north: 45, west: -70, east: -10 } },
  indian_ocean:   { name: '🌊 Indian Ocean',   lon: 75.0,   lat: -10.0, height: 6500000, pitch: -72, zoom: 3, bbox: { south: -35, north: 25, west: 45,  east: 105 } },
  southern_ocean: { name: '❄️ Southern Ocean', lon: 60.0,   lat: -60.0, height: 7500000, pitch: -80, zoom: 3, bbox: { south: -72, north: -45, west: -180, east: 180 } },
  arctic_ocean:   { name: '🧊 Arctic Ocean',   lon: 0.0,    lat: 78.0,  height: 6500000, pitch: -85, zoom: 3, bbox: { south: 65,  north: 90,  west: -180, east: 180 } },

  // Regional Seas (underneath major oceans)
  bay_of_bengal:  { name: '🇮🇳 Bay of Bengal',  lon: 88.5,   lat: 15.0,  height: 2600000, pitch: -65, zoom: 5, bbox: { south: 5,   north: 22, west: 80,  east: 98 } },
  arabian_sea:    { name: '🌀 Arabian Sea',    lon: 64.0,   lat: 16.5,  height: 2600000, pitch: -65, zoom: 5, bbox: { south: 10,  north: 25, west: 55,  east: 75 } },
  global:         { name: '🌐 Global View',    lon: 80.0,   lat: 10.0,  height: 12500000, pitch: -88, zoom: 2, bbox: { south: -70, north: 70, west: -180, east: 180 } },
};

export default function RegionPresets({ onFlyTo }) {
  const dispatch = useAppDispatch();

  const handleSelect = (key) => {
    const r = REGIONS[key];
    onFlyTo?.(r);
    dispatch({
      type: 'ADD_TOAST',
      payload: { message: `Flying to ${r.name}`, type: 'info' },
    });
  };

  return (
    <div className="absolute top-3.5 right-3.5 z-50 flex items-center gap-1.5 bg-surface/90 border border-border px-2.5 py-1.5 rounded-xl backdrop-blur-md shadow-2xl flex-wrap max-w-[550px]">
      <span className="text-[0.68rem] text-muted mr-0.5 font-semibold">Oceans:</span>
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

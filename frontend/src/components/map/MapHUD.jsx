import { useApp, useAppDispatch } from '../../context/AppContext';

export default function MapHUD() {
  const { engineMode, basemap } = useApp();
  const dispatch = useAppDispatch();

  return (
    <div className="absolute top-3.5 left-3.5 z-50 flex items-center gap-2 bg-surface/90 border border-border px-2.5 py-1.5 rounded-lg backdrop-blur-md shadow-2xl">
      <button
        id="btnMode3D"
        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-all border ${
          engineMode === '3d'
            ? 'bg-[#0077b6] border-accent text-white font-bold'
            : 'bg-surface-2 border-border text-muted hover:text-white hover:border-border-bright'
        }`}
        onClick={() => {
          dispatch({ type: 'SET_ENGINE_MODE', payload: '3d' });
          dispatch({ type: 'ADD_TOAST', payload: { message: '3D Cesium Ocean Globe Mode Active', type: 'success' } });
        }}
      >
        🌍 3D Cesium Globe
      </button>

      <button
        id="btnMode2D"
        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-all border ${
          engineMode === '2d'
            ? 'bg-[#0077b6] border-accent text-white font-bold'
            : 'bg-surface-2 border-border text-muted hover:text-white hover:border-border-bright'
        }`}
        onClick={() => {
          dispatch({ type: 'SET_ENGINE_MODE', payload: '2d' });
          dispatch({ type: 'ADD_TOAST', payload: { message: '2D Leaflet Map Mode Active', type: 'success' } });
        }}
      >
        🗺️ 2D Leaflet Map
      </button>

      <div className="w-[1px] h-4 bg-border mx-0.5"></div>

      <select
        id="basemapSelector"
        value={basemap}
        onChange={(e) => {
          dispatch({ type: 'SET_BASEMAP', payload: e.target.value });
          dispatch({ type: 'ADD_TOAST', payload: { message: `Basemap changed to ${e.target.value.toUpperCase()}`, type: 'info' } });
        }}
        className="bg-surface-3 text-text border border-border text-xs px-2 py-0.5 rounded font-mono outline-none focus:border-accent"
      >
        <option value="ocean">🌊 Ocean Bathymetry (Esri)</option>
        <option value="satellite">🛰️ Satellite (Esri Imagery)</option>
        <option value="dark">🌑 Dark Canvas (Esri)</option>
        <option value="osm">🗺️ OpenStreetMap</option>
      </select>
    </div>
  );
}

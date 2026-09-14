import { createContext, useContext, useReducer } from 'react';
import { getCalculatedDates } from '../utils/dates';

const d = getCalculatedDates();

const initialState = {
  activeTab: 'map',
  engineMode: '3d',        // '3d' | '2d'
  basemap: 'satellite',    // 'satellite' | 'ocean' | 'dark' | 'osm'
  renderMode: 'heatmap',   // 'heatmap' | 'points' | 'hybrid'
  showThermalHeatmap: true,
  showStreamlines: true,
  streamlineSpeed: 1.5,
  streamlineParticles: 3500,
  heatmapOpacity: 0.88,
  heatmapRadius: 36,
  heatmapBlur: 20,
  colorPalette: 'ocean',   // 'ocean' | 'plasma' | 'turbo' | 'coolwarm' | 'viridis'
  depthMin: 0,
  depthMax: 10,
  selectedDate: d.yesterday,
  gridPoints: [],
  colorMin: 0.0,
  colorMax: 32.0,
  logs: [{ type: 'info', text: '[INIT] 3D Cesium Ocean Surface Engine ready.' }],
  apiStatus: 'checking',   // 'online' | 'offline' | 'checking'
  wsStatus: 'connecting',  // 'connected' | 'disconnected' | 'connecting'
  serverDateInfo: null,
  toasts: [],
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_ENGINE_MODE':
      return { ...state, engineMode: action.payload };
    case 'SET_BASEMAP':
      return { ...state, basemap: action.payload };
    case 'SET_RENDER_MODE':
      return { ...state, renderMode: action.payload };
    case 'TOGGLE_STREAMLINES':
      return { ...state, showStreamlines: action.payload !== undefined ? action.payload : !state.showStreamlines };
    case 'TOGGLE_HEATMAP':
      return { ...state, showThermalHeatmap: action.payload !== undefined ? action.payload : !state.showThermalHeatmap };
    case 'SET_STREAMLINE_SPEED':
      return { ...state, streamlineSpeed: action.payload };
    case 'SET_HEATMAP_OPACITY':
      return { ...state, heatmapOpacity: action.payload };
    case 'SET_HEATMAP_RADIUS':
      return { ...state, heatmapRadius: action.payload };
    case 'SET_HEATMAP_BLUR':
      return { ...state, heatmapBlur: action.payload };
    case 'SET_COLOR_PALETTE':
      return { ...state, colorPalette: action.payload };
    case 'SET_DEPTH':
      return { ...state, depthMin: 0, depthMax: action.payload };
    case 'SET_DATE':
      return { ...state, selectedDate: action.payload };
    case 'SET_GRID_POINTS': {
      let pts = [...state.gridPoints, ...action.payload];
      if (pts.length > 5000) pts = pts.slice(-5000);
      return { ...state, gridPoints: pts };
    }
    case 'CLEAR_GRID':
      return { ...state, gridPoints: [] };
    case 'ADD_LOG': {
      const logs = [action.payload, ...state.logs].slice(0, 50);
      return { ...state, logs };
    }
    case 'SET_API_STATUS':
      return { ...state, apiStatus: action.payload };
    case 'SET_WS_STATUS':
      return { ...state, wsStatus: action.payload };
    case 'SET_SERVER_DATE_INFO':
      return { ...state, serverDateInfo: action.payload };
    case 'ADD_TOAST': {
      const toasts = [...state.toasts, { id: Date.now(), ...action.payload }];
      return { ...state, toasts };
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    default:
      return state;
  }
}

const AppContext = createContext(null);
const AppDispatchContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}

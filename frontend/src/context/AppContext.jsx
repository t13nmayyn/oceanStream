import { createContext, useContext, useReducer, useEffect } from 'react';
import { getCalculatedDates } from '../utils/dates';

const d = getCalculatedDates();

const getInitialMode = () => {
  try {
    const saved = localStorage.getItem('oceanstream_mode');
    return saved === 'analyze' ? 'analyze' : 'explore';
  } catch {
    return 'explore';
  }
};

const initialState = {
  // Explore keeps the scene simple; Analyze progressively reveals scientific controls.
  userMode: getInitialMode(),

  activeTab: 'map',
  engineMode: '3d',        // '3d' | '2d'
  basemap: 'satellite',    // 'satellite' | 'ocean' | 'dark' | 'osm'
  renderMode: 'heatmap',   // 'heatmap' | 'points' | 'hybrid'
  
  // Visual layer toggles
  showThermalHeatmap: true,
  showStreamlines: true,
  showArgoLayer: true,
  argoFilter: 'both',      // 'both' | 'core' | 'bgc'
  
  // Streamlines / Particles
  streamlineSpeed: 1.5,
  streamlineParticles: 3500,

  // Heatmap rendering
  heatmapOpacity: 0.88,
  heatmapRadius: 36,
  heatmapBlur: 20,
  colorPalette: 'coolwarm', // 'coolwarm' | 'viridis' | 'turbo' | 'plasma' | 'emerald' | 'hypoxia'
  
  // Scientific parameters
  selectedVariable: 'temperature',
  selectedDepth: 0,
  depthMin: 0,
  depthMax: 0,
  selectedDate: d.yesterday,
  isPlayingTime: false,
  playbackSpeed: 1,

  // Selected telemetry / inspection
  activePointQuery: null,
  activeArgoProfile: null,
  selectedPlatformNumber: null,

  gridPoints: [],
  colorMin: 20.0,
  colorMax: 32.0,
  logs: [{ type: 'info', text: '[INIT] INCOIS 3D/4D Ocean Data Platform ready.' }],
  apiStatus: 'checking',   // 'online' | 'offline' | 'checking'
  wsStatus: 'connecting',  // 'connected' | 'disconnected' | 'connecting'
  serverDateInfo: null,
  toasts: [],
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_USER_MODE': {
      try {
        localStorage.setItem('oceanstream_mode', action.payload);
      } catch {}
      return { ...state, userMode: action.payload };
    }
    case 'SET_SELECTED_VARIABLE':
      return { ...state, selectedVariable: action.payload };
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
    case 'TOGGLE_ARGO_LAYER':
      return { ...state, showArgoLayer: action.payload !== undefined ? action.payload : !state.showArgoLayer };
    case 'SET_ARGO_FILTER':
      return { ...state, argoFilter: action.payload };
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
      return { ...state, selectedDepth: action.payload, depthMin: 0, depthMax: action.payload };
    case 'SET_DATE':
      return { ...state, selectedDate: action.payload };
    case 'SET_PLAYING_TIME':
      return { ...state, isPlayingTime: action.payload };
    case 'SET_PLAYBACK_SPEED':
      return { ...state, playbackSpeed: action.payload };
    case 'SET_ACTIVE_POINT_QUERY':
      return { ...state, activePointQuery: action.payload };
    case 'SET_ACTIVE_ARGO_PROFILE':
      return { ...state, activeArgoProfile: action.payload };
    case 'SET_SELECTED_PLATFORM':
      return { ...state, selectedPlatformNumber: action.payload };
    case 'SET_COLOR_RANGE':
      return { ...state, colorMin: action.payload.min, colorMax: action.payload.max };
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
      const nextId = Math.max(0, ...state.toasts.map((toast) => Number(toast.id) || 0)) + 1;
      const toasts = [...state.toasts, { id: nextId, ...action.payload }];
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

  // Sync mode changes to body class for styling if needed
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', state.userMode);
  }, [state.userMode]);

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

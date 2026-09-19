// Python FastAPI backend (snapshot, timeline, argo, etc.)
export const API_BASE = import.meta.env.VITE_PYTHON_API_URL ?? 'http://localhost:8000';

// Node/Express gateway (point queries routed via validation layer)
export const NODE_API_BASE = import.meta.env.VITE_NODE_API_URL ?? 'http://localhost:3001';

export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws/ocean-stream';

export const BASEMAP_URLS = {
  ocean: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

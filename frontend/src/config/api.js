// Python FastAPI backend (snapshot, timeline, argo, etc.)
export const API_BASE = (
  import.meta.env.VITE_PYTHON_API_URL ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:8000'
).replace(/\/+$/, '');

// Node/Express gateway (point queries routed via validation layer)
export const NODE_API_BASE = (
  import.meta.env.VITE_NODE_API_URL ||
  'http://localhost:3001'
).replace(/\/+$/, '');

const getWsUrl = (base) => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  try {
    const url = new URL(base);
    const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${url.host}/ws/ocean-stream`;
  } catch {
    return 'ws://localhost:8000/ws/ocean-stream';
  }
};

export const WS_URL = getWsUrl(API_BASE);

export const getWsEndpointUrl = (endpoint = '/ws/ocean-stream') => {
  try {
    const url = new URL(API_BASE);
    const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${wsProto}//${url.host}${cleanEndpoint}`;
  } catch {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `ws://localhost:8000${cleanEndpoint}`;
  }
};

export const BASEMAP_URLS = {
  ocean: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};


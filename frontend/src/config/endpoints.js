import { getCalculatedDates } from '../utils/dates';

const d = getCalculatedDates();

const API_ENDPOINTS = [
  { id: 'root', method: 'GET', path: '/', desc: 'Root service info & version' },
  { id: 'date_info', method: 'GET', path: '/api/date-info', desc: 'Copernicus availability, server date & presets' },
  { id: 'point', method: 'GET', path: `/ocean/point?lat=13.08&lon=80.27&depth=0&date=${d.yesterday}`, desc: 'Core click-to-query (Physics + BGC + Argo)' },
  { id: 'snapshot', method: 'GET', path: `/ocean/snapshot?lat_min=10&lat_max=15&lon_min=75&lon_max=85&depth=0&date=${d.yesterday}`, desc: 'Spatial bounding box 2D grid' },
  { id: 'timeline', method: 'GET', path: '/ocean/timeline?lat=13.08&lon=80.27&depth=0&preset=7d&granularity=day&variables=temperature,salinity', desc: 'Time-series with 7d preset (or custom dates)' },
  { id: 'nearest', method: 'GET', path: '/argo/nearest?lat=13.08&lon=80.27&radius_km=500&type=both', desc: 'Nearest Argo floats & AODN moorings' },
  { id: 'profile', method: 'GET', path: '/argo/profile?platform_number=2902765', desc: 'Full vertical depth profile for platform' },
  { id: 'coverage', method: 'GET', path: '/ocean/coverage?lat_min=8&lat_max=22&lon_min=68&lon_max=90', desc: 'Page table OS virtual memory state' },
  { id: 'metadata', method: 'GET', path: '/api/metadata', desc: 'Zarr dimensions, coordinates & stations' },
  { id: 'coastal', method: 'GET', path: '/api/coastal-temps?variable=thetao', desc: 'Coastal station temperature series' },
  { id: 'depth_prof', method: 'GET', path: '/api/depth-profile?location=chennai&variable=thetao', desc: 'Station depth profile' },
  { id: 'argo_floats', method: 'GET', path: '/api/argo-floats?limit=20', desc: 'Argo float observations list' },
  { id: 'argo_profs', method: 'GET', path: '/api/argo-profiles?max_platforms=5', desc: 'Grouped Argo platform profiles' },
  { id: 'argo_slider', method: 'GET', path: `/api/argo-slider?date_start=${d.weekAgo}&date_end=${d.yesterday}`, desc: 'Time-filtered float points' },
  { id: 'aodn', method: 'GET', path: '/api/aodn-data', desc: 'AODN CTD Mooring data' },
  { id: 'overview', method: 'GET', path: '/api/ocean-overview', desc: 'Spatial min/max/mean bounding box stats' },
  { id: 'cache_stats', method: 'GET', path: '/api/cache-stats', desc: 'L1 RAM / L2 Zarr telemetry' },
  { id: 'cache_clear', method: 'POST', path: '/api/cache-clear', desc: 'Flush L1 RAM cache' },
  { id: 'files', method: 'GET', path: '/api/files', desc: 'Zarr dataset files & sizes browser' },
];

export default API_ENDPOINTS;

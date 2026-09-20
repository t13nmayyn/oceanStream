import { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';
import { useAppDispatch } from '../../context/AppContext';
import Panel from '../ui/Panel';
import ArgoSearch from './ArgoSearch';
import FloatList from './FloatList';
import ProfileChart from './ProfileChart';

export default function ArgoView({ initialPlatform }) {
  const dispatch = useAppDispatch();
  const [floats, setFloats] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState(initialPlatform || '2902765');
  const [profileData, setProfileData] = useState({ depths: [], temps: [], source: null });
  const [searchLoading, setSearchLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  const handleSearch = async (params) => {
    setSearchLoading(true);
    try {
      const url = `${API_BASE}/argo/nearest?lat=${params.lat}&lon=${params.lon}&radius_km=${params.radius}&type=${params.type}`;
      const res = await fetch(url);
      const data = await res.json();
      const list = data.floats || [];
      setFloats(list);

      if (list.length > 0) {
        const first = list[0].platform_number || list[0].name;
        loadProfile(first);
      }
      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Found ${list.length} nearby floats`, type: 'success' }
      });
    } catch (err) {
      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Search failed: ${err.message}`, type: 'error' }
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const loadProfile = async (platformId) => {
    setSelectedPlatform(platformId);
    setProfileLoading(true);
    try {
      const url = `${API_BASE}/argo/profile?platform_number=${platformId}`;
      const res = await fetch(url);
      const data = await res.json();
      const prof = data.profile || [];

      const depths = prof.map((p) => p.depth_m !== undefined ? p.depth_m : p.depth);
      const temps = prof.map((p) => p.temperature_c !== undefined ? p.temperature_c : p.temperature);

      setProfileData({ depths, temps, source: data.source || data.status || 'unknown' });
      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Loaded vertical profile for #${platformId} (${prof.length} levels)`, type: 'success' }
      });
    } catch (err) {
      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Profile load error: ${err.message}`, type: 'error' }
      });
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    handleSearch({ lat: '13.08', lon: '80.27', radius: 500, type: 'both' });
    if (initialPlatform) {
      loadProfile(initialPlatform);
    }
  }, [initialPlatform]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 grid grid-cols-[360px_1fr] gap-4 h-full overflow-y-auto">
      {/* Left Column: Search & Float List */}
      <div className="flex flex-col gap-3">
        <Panel title="🔍 Argo Float Spatial Search">
          <ArgoSearch onSearch={handleSearch} loading={searchLoading} />
        </Panel>

        <Panel
          title="📍 Found Floats & Instruments"
          badge={`${floats.length} found`}
          className="flex-1"
        >
          <FloatList
            floats={floats}
            selectedId={selectedPlatform}
            onSelectFloat={loadProfile}
            loading={searchLoading}
          />
        </Panel>
      </div>

      {/* Right Column: Vertical Depth Profile Chart */}
      <Panel
        title="📉 Vertical Depth Profile (GET /argo/profile & GET /api/aodn-data)"
        badge={`Platform #${selectedPlatform}`}
        className="flex flex-col min-h-[460px]"
      >
        <div className="flex-1 relative p-2">
          {profileLoading ? (
            <div className="flex items-center justify-center h-full text-accent font-mono">
              Loading profile data…
            </div>
          ) : (
            <ProfileChart depths={profileData.depths} temps={profileData.temps} source={profileData.source} />
          )}
        </div>
      </Panel>
    </div>
  );
}

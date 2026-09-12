import { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';
import { useApp, useAppDispatch } from '../../context/AppContext';
import { getCalculatedDates } from '../../utils/dates';
import Panel from '../ui/Panel';
import Button from '../ui/Button';
import TimelineChart from './TimelineChart';

export default function TimelineView() {
  const d = getCalculatedDates();
  const { serverDateInfo } = useApp();
  const dispatch = useAppDispatch();

  const [lat, setLat] = useState('13.08');
  const [lon, setLon] = useState('80.27');
  const [depth, setDepth] = useState('0');
  const [dateStart, setDateStart] = useState(d.weekAgo);
  const [dateEnd, setDateEnd] = useState(d.yesterday);
  const [granularity, setGranularity] = useState('day');

  const [chartData, setChartData] = useState({ labels: [], temps: [], salinities: [] });
  const [loading, setLoading] = useState(false);
  const [badgeText, setBadgeText] = useState('Chennai Coast (13.08°N, 80.27°E)');

  const setPreset = (preset) => {
    let end = serverDateInfo?.latest_available || d.yesterday;
    let start = d.weekAgo;

    if (preset === 'yesterday') {
      start = end;
    } else if (preset === '7d') {
      start = serverDateInfo?.presets?.['7d']?.start || d.weekAgo;
    } else if (preset === '30d') {
      start = serverDateInfo?.presets?.['30d']?.start || d.monthAgo;
    } else if (preset === '1y') {
      start = serverDateInfo?.presets?.['1y']?.start || d.yearAgo;
    }

    setDateStart(start);
    setDateEnd(end);
    dispatch({
      type: 'ADD_TOAST',
      payload: { message: `Timeline range set to ${preset.toUpperCase()} (${start} to ${end})`, type: 'info' }
    });
  };

  const fetchTimeline = async (s = dateStart, e = dateEnd) => {
    setLoading(true);
    setBadgeText(`Lat ${lat}, Lon ${lon} · ${s} to ${e}`);

    try {
      const url = `${API_BASE}/ocean/timeline?lat=${lat}&lon=${lon}&depth=${depth}&date_start=${s}&date_end=${e}&granularity=${granularity}&variables=temperature,salinity`;
      const res = await fetch(url);
      const data = await res.json();

      const series = data.series || [];
      const labels = series.map((item) => item.date);
      const temps = series.map((item) => item.temperature_c !== undefined ? item.temperature_c : item.temperature);
      const salinities = series.map((item) => item.salinity_psu !== undefined ? item.salinity_psu : item.salinity);

      setChartData({ labels, temps, salinities });
      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Loaded ${series.length} timeline points`, type: 'success' }
      });
    } catch (err) {
      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Timeline fetch error: ${err.message}`, type: 'error' }
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 grid grid-rows-[auto_1fr] gap-4 h-full overflow-y-auto">
      {/* Query Form Panel */}
      <Panel title="📊 Time-Series Query Form (GET /ocean/timeline & GET /api/coastal-temps)">
        <div className="flex gap-1.5 mb-2.5 items-center flex-wrap">
          <span className="text-xs text-muted font-semibold">Presets:</span>
          <Button onClick={() => setPreset('yesterday')} className="text-xs py-1 px-2.5">Yesterday</Button>
          <Button onClick={() => setPreset('7d')} className="text-xs py-1 px-2.5">Last 7 Days</Button>
          <Button onClick={() => setPreset('30d')} className="text-xs py-1 px-2.5">Last 30 Days</Button>
          <Button onClick={() => setPreset('1y')} className="text-xs py-1 px-2.5">Last 1 Year</Button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 items-end">
          <div>
            <label className="text-muted text-xs block mb-1">Latitude:</label>
            <input
              type="text"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1">Longitude:</label>
            <input
              type="text"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="w-full bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1">Depth (m):</label>
            <input
              type="number"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              min="0"
              max="5000"
              className="w-full bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1">Date Start:</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1">Date End:</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1">Granularity:</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="w-full bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
          <div>
            <Button
              variant="primary"
              onClick={() => fetchTimeline()}
              disabled={loading}
              className="w-full h-[30px] flex items-center justify-center font-bold"
            >
              {loading ? 'Fetching…' : '📈 Fetch Timeline'}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Chart Panel */}
      <Panel
        title="📈 Ocean Timeline Chart"
        badge={badgeText}
        className="flex flex-col min-h-[420px]"
      >
        <div className="flex-1 relative p-2">
          <TimelineChart
            labels={chartData.labels}
            temps={chartData.temps}
            salinities={chartData.salinities}
          />
        </div>
      </Panel>
    </div>
  );
}

import { useEffect } from 'react';
import { API_BASE } from '../config/api';
import { useApp, useAppDispatch } from '../context/AppContext';
import { getCalculatedDates } from '../utils/dates';

export function useDateControls() {
  const dispatch = useAppDispatch();
  const { serverDateInfo } = useApp();

  useEffect(() => {
    async function fetchDateInfo() {
      try {
        const res = await fetch(`${API_BASE}/api/date-info`);
        if (res.ok) {
          const info = await res.json();
          dispatch({ type: 'SET_SERVER_DATE_INFO', payload: info });
          if (info.latest_available) {
            dispatch({ type: 'SET_DATE', payload: info.latest_available });
          }
        }
      } catch {
        // Fallback to calculated dates
      }
    }
    fetchDateInfo();
  }, [dispatch]);

  function setTimePreset(preset) {
    const d = getCalculatedDates();
    let target = d.yesterday;
    if (preset === 'yesterday') target = serverDateInfo?.yesterday || d.yesterday;
    else if (preset === '7d') target = serverDateInfo?.presets?.['7d']?.start || d.weekAgo;
    else if (preset === '30d') target = serverDateInfo?.presets?.['30d']?.start || d.monthAgo;
    else if (preset === '1y') target = serverDateInfo?.presets?.['1y']?.start || d.yearAgo;
    dispatch({ type: 'SET_DATE', payload: target });
    dispatch({ type: 'ADD_TOAST', payload: { msg: `Time slice: ${preset.toUpperCase()} → ${target}`, variant: 'info' } });
  }

  return { setTimePreset };
}

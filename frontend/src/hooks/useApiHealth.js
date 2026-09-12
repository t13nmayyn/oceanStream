import { useEffect } from 'react';
import { API_BASE } from '../config/api';
import { useAppDispatch } from '../context/AppContext';

export function useApiHealth() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`${API_BASE}/`);
        dispatch({ type: 'SET_API_STATUS', payload: res.ok ? 'online' : 'offline' });
      } catch {
        dispatch({ type: 'SET_API_STATUS', payload: 'offline' });
      }
    }
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [dispatch]);
}

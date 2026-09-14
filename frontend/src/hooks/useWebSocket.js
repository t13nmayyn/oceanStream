import { useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../config/api';
import { useApp, useAppDispatch } from '../context/AppContext';

export function useWebSocket() {
  const wsRef = useRef(null);
  const dispatch = useAppDispatch();
  const { depthMin, depthMax, selectedDate } = useApp();

  const stateRef = useRef({ depthMin, depthMax, selectedDate });
  stateRef.current = { depthMin, depthMax, selectedDate };

  const lastBoundsRef = useRef({ south: 8.0, north: 22.0, west: 68.0, east: 90.0 });

  const addLog = useCallback((type, text) => {
    const now = new Date().toISOString().slice(11, 19);
    dispatch({ type: 'ADD_LOG', payload: { type, text: `${now} ${text}` } });
  }, [dispatch]);

  const sendViewport = useCallback((bounds) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const b = bounds || lastBoundsRef.current;
    lastBoundsRef.current = b;

    const { depthMin: dMin, depthMax: dMax, selectedDate: sDate } = stateRef.current;

    ws.send(JSON.stringify({
      lat_min: b.south,
      lat_max: b.north,
      lon_min: b.west,
      lon_max: b.east,
      depth_min: dMin,
      depth_max: dMax,
      time: sDate,
      variable: 'thetao',
    }));
    addLog('info', `[VIEWPORT] Lat [${b.south.toFixed(2)}, ${b.north.toFixed(2)}], Lon [${b.west.toFixed(2)}, ${b.east.toFixed(2)}], Depth: ${dMin}–${dMax}m`);
  }, [addLog]);

  useEffect(() => {
    let reconnectTimer;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        dispatch({ type: 'SET_WS_STATUS', payload: 'connected' });
        addLog('info', '[WS] Connected to oceanStream backend');
        // Automatically request initial viewport
        setTimeout(() => {
          sendViewport(lastBoundsRef.current);
        }, 150);
      };

      ws.onclose = () => {
        dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' });
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'stream_start') {
            dispatch({ type: 'CLEAR_GRID' });
            addLog('info', `[START] Resident: ${msg.resident_count} pages, Missing: ${msg.missing_count} pages`);
          } else if (msg.stage === 'resident') {
            addLog('res', `[RESIDENT] Depth ${msg.depth_range}m · ${msg.grid?.length || 0} pts (${msg.elapsed_ms}ms)`);
            if (msg.grid && msg.grid.length > 0) {
              dispatch({ type: 'SET_GRID_POINTS', payload: msg.grid });
            }
          } else if (msg.stage === 'fetching') {
            addLog('fetch', `[FETCHING] Depth ${msg.depth_range}m · origin request`);
          } else if (msg.type === 'stream_complete') {
            addLog('info', `[COMPLETE] Finished in ${msg.total_elapsed_ms}ms`);
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when depth or date changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendViewport(lastBoundsRef.current);
    }
  }, [depthMax, selectedDate, sendViewport]);

  return { wsRef, sendViewport, addLog };
}

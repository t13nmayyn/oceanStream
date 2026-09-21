import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getWsEndpointUrl } from '../../config/api';
import Panel from '../ui/Panel';
import Button from '../ui/Button';

export default function WsConsole() {
  const { selectedDate } = useApp();
  const [endpoint, setEndpoint] = useState('/ws/ocean-stream');
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState('// Incoming WebSocket messages will stream here in real-time...');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const updatePreset = (ep) => {
    setEndpoint(ep);
    if (ep === '/ws/ocean-stream') {
      setMessage(
        JSON.stringify(
          {
            lat_min: 10.0,
            lat_max: 16.0,
            lon_min: 75.0,
            lon_max: 85.0,
            depth_min: 0.0,
            depth_max: 10.0,
            time: selectedDate,
            variable: 'thetao',
          },
          null,
          2
        )
      );
    } else {
      setMessage(
        JSON.stringify(
          {
            location: 'chennai',
            variable: 'thetao',
          },
          null,
          2
        )
      );
    }
  };

  useEffect(() => {
    updatePreset('/ws/ocean-stream');
  }, [selectedDate]);

  const sendCustomMessage = () => {
    if (wsRef.current) wsRef.current.close();

    const wsUrl = getWsEndpointUrl(endpoint);
    setLogs((prev) => `${prev}\n\n[CONNECTING] ${wsUrl}...`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLogs((prev) => `${prev}\n[CONNECTED] Sending message:\n${message}`);
      ws.send(message);
    };

    ws.onmessage = (e) => {
      setLogs((prev) => `${prev}\n[RECEIVED]:\n${e.data}`);
    };

    ws.onerror = (e) => {
      setLogs((prev) => `${prev}\n[ERROR]: ${e.message || 'WebSocket Error'}`);
    };

    ws.onclose = () => {
      setConnected(false);
      setLogs((prev) => `${prev}\n[CLOSED]`);
    };
  };

  const clearLog = () => {
    setLogs('// WebSocket Log Cleared.');
  };

  return (
    <div className="p-4 grid grid-cols-[420px_1fr] gap-4 h-full overflow-y-auto">
      {/* Control Client */}
      <Panel title="⚡ WebSocket Client Tester">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1 text-xs">
            <label className="text-muted">WebSocket Endpoint:</label>
            <select
              value={endpoint}
              onChange={(e) => updatePreset(e.target.value)}
              className="bg-surface-3 text-text border border-border px-2 py-1.5 rounded font-mono text-xs outline-none focus:border-accent"
            >
              <option value="/ws/ocean-stream">/ws/ocean-stream (Viewport & Point Streaming)</option>
              <option value="/ws/coastal-temps">/ws/coastal-temps (Progressive Coastal Temps)</option>
            </select>
          </div>

          <div className="text-muted text-xs mt-1">JSON Message to Send:</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full h-44 bg-surface-3 text-white border border-border rounded-lg font-mono text-xs p-2.5 outline-none focus:border-accent resize-none"
          />

          <div className="flex gap-2 mt-1">
            <Button
              variant="primary"
              onClick={sendCustomMessage}
              className="flex-1 font-bold"
            >
              Send WS Message
            </Button>
            <Button onClick={clearLog} className="w-24">
              Clear Log
            </Button>
          </div>
        </div>
      </Panel>

      {/* Real-Time Live Message Stream Log */}
      <Panel
        title="📥 Real-Time WebSocket Message Stream"
        badge={connected ? 'Connected' : 'Idle'}
        className="flex flex-col"
      >
        <div className="flex-1 bg-surface-2 border border-border rounded-lg p-3 font-mono text-xs max-h-[500px] overflow-y-auto whitespace-pre-wrap text-[#a6e22e]">
          {logs}
        </div>
      </Panel>
    </div>
  );
}

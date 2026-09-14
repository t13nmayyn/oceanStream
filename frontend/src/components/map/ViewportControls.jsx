import { useApp, useAppDispatch } from '../../context/AppContext';
import { useDateControls } from '../../hooks/useDateControls';
import Panel from '../ui/Panel';
import Button from '../ui/Button';

export default function ViewportControls({ onTriggerFetch }) {
  const { depthMax, selectedDate } = useApp();
  const dispatch = useAppDispatch();
  const { setTimePreset } = useDateControls();

  return (
    <Panel title="🕹️ Viewport & Layer Controls">
      <div className="space-y-2.5">
        {/* Depth slider */}
        <div className="flex items-center justify-between gap-2">
          <label className="text-muted text-[0.72rem] whitespace-nowrap">Depth (0–50m):</label>
          <input
            type="range"
            min="2"
            max="50"
            step="2"
            value={depthMax}
            onChange={(e) => dispatch({ type: 'SET_DEPTH', payload: parseFloat(e.target.value) })}
            className="flex-1 accent-accent cursor-pointer h-1.5 bg-surface-3 rounded-lg appearance-none"
          />
          <strong className="text-accent font-mono min-w-[55px] text-right text-xs">0–{depthMax.toFixed(0)}m</strong>
        </div>

        {/* Date picker */}
        <div className="flex items-center justify-between gap-2">
          <label className="text-muted text-[0.72rem]">Time Slice:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => dispatch({ type: 'SET_DATE', payload: e.target.value })}
            className="bg-surface-3 text-text border border-border px-2 py-1 rounded text-xs font-mono outline-none focus:border-accent"
          />
        </div>

        {/* Time presets */}
        <div className="flex gap-1">
          {['yesterday', '7d', '30d', '1y'].map((p) => (
            <Button
              key={p}
              className="flex-1 !text-[0.65rem] !px-1 !py-1"
              onClick={() => setTimePreset(p)}
            >
              {p === 'yesterday' ? 'Yesterday' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '1 Year'}
            </Button>
          ))}
        </div>

        {/* Re-fetch action */}
        <div className="pt-1">
          <Button
            variant="primary"
            onClick={() => onTriggerFetch?.()}
            className="w-full flex justify-center items-center font-bold text-xs py-1.5"
          >
            🔄 Re-fetch Ocean Area
          </Button>
        </div>
      </div>
    </Panel>
  );
}

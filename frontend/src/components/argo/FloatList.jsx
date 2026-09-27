import Badge from '../ui/Badge';

export default function FloatList({ floats = [], selectedId, onSelectFloat, loading }) {
  if (loading) {
    return <div className="text-muted text-xs p-2">Searching for nearby floats…</div>;
  }

  const validFloats = floats.filter(
    (f) =>
      f.source_label !== 'synthetic_bgc_model' &&
      f.source_label !== 'gridded_model' &&
      f.data_type !== 'SYNTHETIC_BGC_MODEL' &&
      f.platform_number !== 'SYNTHETIC_BGC_MODEL'
  );

  if (!validFloats.length) {
    return (
      <div className="text-muted text-xs p-2">
        No BGC floats in range
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
      {validFloats.map((f, idx) => {
        const id = f.platform_number || f.name || `float-${idx}`;
        const isSelected = selectedId === id;

        return (
          <div
            key={id}
            onClick={() => onSelectFloat(id)}
            className={`p-2 rounded-md border cursor-pointer transition-all text-xs ${
              isSelected
                ? 'bg-surface-3 border-accent'
                : 'bg-surface-2 border-border hover:border-accent hover:-translate-y-0.5'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <strong className="text-white font-mono">{`Platform #${id}`}</strong>
              <Badge className="bg-accent-2/20 text-accent-2 border-accent-2/30">
                {f.type || 'Core'}
              </Badge>
            </div>
            <div className="text-[0.68rem] text-muted font-mono flex justify-between">
              <span>Source: <strong className="text-text">{f.source_label || f.source || 'backend response'}</strong></span>
              <span>({f.lat?.toFixed(2)}°, {f.lon?.toFixed(2)}°)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


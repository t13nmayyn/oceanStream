import { useApp } from '../../context/AppContext';

const typeColors = {
  res: 'border-l-2 border-l-green text-green',
  fetch: 'border-l-2 border-l-orange text-orange',
  disk: 'border-l-2 border-l-amber text-amber',
  info: 'border-l-2 border-l-accent text-accent',
};

export default function StreamLog() {
  const { logs } = useApp();

  return (
    <div className="max-h-[120px] overflow-y-auto text-[0.67rem] font-mono flex flex-col gap-0.5">
      {logs.map((log, i) => (
        <div key={i} className={`px-1 py-0.5 rounded-sm bg-black/25 ${typeColors[log.type] || typeColors.info}`}>
          {log.text}
        </div>
      ))}
    </div>
  );
}

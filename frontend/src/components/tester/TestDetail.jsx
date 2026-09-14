import Panel from '../ui/Panel';
import Button from '../ui/Button';

export default function TestDetail({ endpoint, url, setUrl, result, loading, onSend }) {
  if (!endpoint) return null;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <Panel title={`Selected Endpoint: ${endpoint.method} ${endpoint.path}`}>
        <div className="flex gap-2 items-center mb-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-surface-3 text-text border border-border px-3 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
          />
          <Button
            variant="primary"
            onClick={onSend}
            disabled={loading}
            className="font-bold whitespace-nowrap"
          >
            {loading ? 'Sending…' : 'Send Request'}
          </Button>
        </div>

        <div className="flex gap-4 text-xs text-muted mb-2 font-mono">
          <span>
            Status:{' '}
            <strong className={result?.ok ? 'text-green' : result?.error ? 'text-rose' : 'text-text'}>
              {result?.statusText || '–'}
            </strong>
          </span>
          <span>Time: <strong className="text-text">{result?.elapsed != null ? `${result.elapsed} ms` : '–'}</strong></span>
          <span>Size: <strong className="text-text">{result?.size != null ? `${result.size} KB` : '–'}</strong></span>
        </div>

        <div className="bg-surface-2 border border-border rounded-lg p-3 font-mono text-xs max-h-[520px] overflow-y-auto whitespace-pre-wrap text-[#9cdcfe]">
          {result?.data
            ? JSON.stringify(result.data, null, 2)
            : result?.error
            ? `Error: ${result.error}`
            : '// JSON response payload will appear here...'}
        </div>
      </Panel>
    </div>
  );
}

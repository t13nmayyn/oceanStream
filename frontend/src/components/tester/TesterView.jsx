import { useState } from 'react';
import { API_BASE } from '../../config/api';
import API_ENDPOINTS from '../../config/endpoints';
import { useAppDispatch } from '../../context/AppContext';
import Button from '../ui/Button';
import TestCard from './TestCard';
import TestDetail from './TestDetail';

export default function TesterView() {
  const dispatch = useAppDispatch();
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(`${API_BASE}${API_ENDPOINTS[0].path}`);
  const [testStatuses, setTestStatuses] = useState({});
  const [currentResult, setCurrentResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);

  const selectedEndpoint = API_ENDPOINTS[activeIndex];

  const handleSelectTest = (idx) => {
    setActiveIndex(idx);
    const ep = API_ENDPOINTS[idx];
    setCurrentUrl(`${API_BASE}${ep.path}`);
  };

  const runSingleTest = async (idx = activeIndex, overrideUrl = currentUrl) => {
    const ep = API_ENDPOINTS[idx];
    setLoading(true);
    setTestStatuses((prev) => ({
      ...prev,
      [idx]: { state: 'RUNNING', code: 'RUNNING' },
    }));

    const t0 = performance.now();
    try {
      const res = await fetch(overrideUrl, { method: ep.method });
      const elapsed = Math.round(performance.now() - t0);
      const data = await res.json();
      const size = (JSON.stringify(data).length / 1024).toFixed(1);

      const result = {
        ok: res.ok,
        statusText: `${res.status} ${res.statusText || (res.ok ? 'OK' : 'Error')}`,
        elapsed,
        size,
        data,
      };

      if (idx === activeIndex) setCurrentResult(result);

      setTestStatuses((prev) => ({
        ...prev,
        [idx]: {
          state: res.ok ? 'SUCCESS' : 'FAILED',
          code: `${res.status} ${res.ok ? 'OK' : 'ERR'}`,
        },
      }));

      dispatch({
        type: 'ADD_TOAST',
        payload: {
          message: `Test ${ep.method} ${ep.path.split('?')[0]} ${res.ok ? 'passed' : 'failed'}! (${elapsed}ms)`,
          type: res.ok ? 'success' : 'error',
        },
      });
      return res.ok;
    } catch (err) {
      const result = {
        ok: false,
        statusText: 'ERR',
        elapsed: Math.round(performance.now() - t0),
        size: 0,
        error: err.message,
      };
      if (idx === activeIndex) setCurrentResult(result);

      setTestStatuses((prev) => ({
        ...prev,
        [idx]: { state: 'FAILED', code: 'FAIL' },
      }));

      dispatch({
        type: 'ADD_TOAST',
        payload: { message: `Test failed: ${err.message}`, type: 'error' },
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    let passed = 0;

    for (let i = 0; i < API_ENDPOINTS.length; i++) {
      handleSelectTest(i);
      const ep = API_ENDPOINTS[i];
      const url = `${API_BASE}${ep.path}`;
      const ok = await runSingleTest(i, url);
      if (ok) passed++;
      await new Promise((r) => setTimeout(r, 100));
    }

    setIsRunningAll(false);
    dispatch({
      type: 'ADD_TOAST',
      payload: {
        message: `Completed! ${passed}/${API_ENDPOINTS.length} APIs passed with 200 OK`,
        type: 'success',
      },
    });
  };

  const handleReset = () => {
    setTestStatuses({});
    setCurrentResult(null);
  };

  const testedCount = Object.values(testStatuses).filter((s) => s.state === 'SUCCESS').length;

  return (
    <div className="grid grid-cols-[460px_1fr] h-full w-full overflow-hidden">
      {/* Left List of Endpoints */}
      <div className="bg-surface border-r border-border flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-border flex gap-2 items-center flex-wrap">
          <Button
            variant="primary"
            onClick={runAllTests}
            disabled={isRunningAll || loading}
            className="font-bold text-xs"
          >
            ⚡ Run All {API_ENDPOINTS.length} Tests
          </Button>
          <Button onClick={handleReset} className="text-xs">
            Reset
          </Button>
          <span className="text-xs text-muted font-mono ml-auto">
            {testedCount}/{API_ENDPOINTS.length} Passed
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
          {API_ENDPOINTS.map((ep, idx) => (
            <TestCard
              key={ep.id}
              endpoint={ep}
              status={testStatuses[idx]}
              active={idx === activeIndex}
              onClick={() => handleSelectTest(idx)}
            />
          ))}
        </div>
      </div>

      {/* Right Detail Pane */}
      <div className="p-4 bg-bg overflow-y-auto">
        <TestDetail
          endpoint={selectedEndpoint}
          url={currentUrl}
          setUrl={setCurrentUrl}
          result={currentResult}
          loading={loading}
          onSend={() => runSingleTest(activeIndex, currentUrl)}
        />
      </div>
    </div>
  );
}

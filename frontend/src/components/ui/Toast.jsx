import { useEffect } from 'react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function Toast() {
  const { toasts } = useApp();
  const dispatch = useAppDispatch();

  useEffect(() => {
    toasts.forEach((t) => {
      const timer = setTimeout(() => {
        dispatch({ type: 'REMOVE_TOAST', payload: t.id });
      }, 3200);
      return () => clearTimeout(timer);
    });
  }, [toasts, dispatch]);

  const colors = {
    success: 'border-green text-green',
    error: 'border-rose text-rose',
    info: 'border-accent text-accent',
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[99999]">
      {toasts.map((t) => {
        const variant = t.variant || t.type || 'info';
        const message = t.message || t.msg || '';
        return (
          <div
            key={t.id}
            className={`bg-surface-2 border rounded-lg px-4 py-2 text-xs text-center shadow-lg transition-all ${
              colors[variant] || colors.info
            }`}
          >
            {message}
          </div>
        );
      })}
    </div>
  );
}

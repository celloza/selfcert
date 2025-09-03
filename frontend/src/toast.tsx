import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Toast { id: string; type: 'success'|'error'|'info'; message: string; }
interface ToastCtxValue { add: (t: Omit<Toast,'id'>) => void; remove: (id: string) => void; }
const ToastCtx = createContext<ToastCtxValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: string) => setToasts(ts => ts.filter(t => t.id !== id)), []);
  const add = useCallback((t: Omit<Toast,'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, ...t };
    setToasts(ts => [...ts, toast]);
    const ttl = t.type === 'error' ? 7000 : 4000;
    setTimeout(() => remove(id), ttl);
  }, [remove]);
  return (
    <ToastCtx.Provider value={{ add, remove }}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="fixed z-[60] bottom-4 right-4 flex flex-col gap-2 w-72 max-w-[90vw]">
        {toasts.map(t => (
          <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} className={`rounded shadow text-sm px-3 py-2 flex items-start gap-2 border backdrop-blur bg-white/90 dark:bg-gray-900/90 border-gray-200 dark:border-gray-700 ${t.type==='success' ? 'text-green-700 dark:text-green-300' : t.type==='error' ? 'text-red-700 dark:text-red-300' : 'text-indigo-700 dark:text-indigo-300'}`}> 
            <span className="mt-0.5 select-none" aria-hidden>
              {t.type === 'success' ? '✓' : t.type === 'error' ? '⚠' : 'ℹ'}
            </span>
            <div className="flex-1 min-w-0">{t.message}</div>
            <button onClick={() => remove(t.id)} aria-label="Dismiss notification" className="text-xs px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.add;
}

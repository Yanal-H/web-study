import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type ToastTone = 'default' | 'success' | 'error';
interface ToastItem {
  id: number;
  msg: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(msg: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, tone: ToastTone = 'default') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, msg, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone !== 'default' ? `toast--${t.tone}` : ''}`}>
            <span className="tdot" />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

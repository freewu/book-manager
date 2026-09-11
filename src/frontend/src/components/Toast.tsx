import React, {createContext, useCallback, useContext, useMemo, useRef, useState} from 'react';

export interface ToastItem {
  id: number;
  text: string;
  type: 'info' | 'ok' | 'err';
}

export interface ToastApi {
  info: (text: string) => void;
  ok: (text: string) => void;
  err: (text: string) => void;
}

const noop = () => {
  /* no ToastProvider mounted */
};

const ToastCtx = createContext<ToastApi>({info: noop, ok: noop, err: noop});

/**
 * Provides the toast viewport and the toast API to every component below it.
 * Toasts used to be a plain state hook, so only the component that rendered
 * the viewport (App) could show them — calls inside BookDetail/Bookshelf were
 * silently dropped. Wrapping the app in this provider fixes that.
 */
export function ToastProvider({children}: {children: React.ReactNode}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string, type: ToastItem['type'], ms = 2600) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, {id, text, type}]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, ms);
  }, []);

  const info = useCallback((t: string) => push(t, 'info'), [push]);
  const ok = useCallback((t: string) => push(t, 'ok'), [push]);
  const err = useCallback((t: string) => push(t, 'err'), [push]);

  // Memoized so consumers' useCallback/useEffect deps stay stable across
  // renders (a fresh object per render previously caused a reload loop).
  const api = useMemo<ToastApi>(() => ({info, ok, err}), [info, ok, err]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Toast API; components outside a ToastProvider get silent no-ops. */
export function useToast(): ToastApi {
  return useContext(ToastCtx);
}

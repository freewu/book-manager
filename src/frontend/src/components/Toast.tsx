import React, {useCallback, useMemo, useRef, useState} from 'react';

export interface ToastItem {
  id: number;
  text: string;
  type: 'info' | 'ok' | 'err';
}

export function useToast() {
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

  // Return a memoized object so that consumers' useCallback/useEffect deps
  // stay stable across renders (previously a fresh object per render caused
  // an infinite reload loop in App.tsx's startup effect).
  return useMemo(() => ({items, info, ok, err}), [items, info, ok, err]);
}

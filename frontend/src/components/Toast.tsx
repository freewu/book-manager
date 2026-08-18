import React, {useCallback, useRef, useState} from 'react';

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

  return {
    items,
    info: (t: string) => push(t, 'info'),
    ok: (t: string) => push(t, 'ok'),
    err: (t: string) => push(t, 'err'),
  };
}

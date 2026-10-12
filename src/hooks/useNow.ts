import { useEffect, useState } from 'react';
import { useDocumentVisible } from './useDocumentVisible';

/** Date.now(), refreshed every `periodMs` while active and visible (aligned to the period). */
export function useNow(periodMs: number, active = true): number {
  const visible = useDocumentVisible();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, periodMs - (t % periodMs) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [periodMs, active, visible]);

  return now;
}

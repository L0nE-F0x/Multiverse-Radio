import { useEffect, useState } from 'react';
import { hash } from '../ui/format';
import { useDocumentVisible } from './useDocumentVisible';

/**
 * Which `periodMs`-long slice of wall-clock time it is. The same for every listener at
 * the same moment (it's a broadcast, after all). Stops ticking while `active` is false
 * or the tab is hidden, and catches up when it comes back.
 */
export function useBucket(periodMs: number, active = true): number {
  const visible = useDocumentVisible();
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / periodMs));

  useEffect(() => {
    if (!active || !visible) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = Date.now();
      setBucket(Math.floor(now / periodMs));
      timer = setTimeout(schedule, periodMs - (now % periodMs) + 30);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [periodMs, active, visible]);

  return bucket;
}

/** A seed for procedural text that changes every `periodMs`. */
export function useRotatingSeed(key: string, periodMs: number, active = true): number {
  return hash(`${key}:${useBucket(periodMs, active)}`);
}

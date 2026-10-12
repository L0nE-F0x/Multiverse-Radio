import { useEffect } from 'react';
import { sleepNow } from '../ui/actions';
import { useUi } from '../ui/store';

/** Powers the radio down when the sleep timer runs out. */
export function useSleepTimer(): void {
  const endsAt = useUi((s) => s.sleepEndsAt);
  useEffect(() => {
    if (endsAt === null) return;
    // Long timeouts drift in background tabs; re-check once a minute as well.
    const check = () => {
      if (Date.now() >= endsAt) sleepNow();
    };
    const timer = setTimeout(check, Math.max(0, endsAt - Date.now()));
    const interval = setInterval(check, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [endsAt]);
}

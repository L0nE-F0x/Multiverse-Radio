import { useEffect, useState } from 'react';

/** True after `ms` without pointer, touch or key activity (while `active`). */
export function useIdle(ms: number, active = true): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let last = 0;
    const wake = () => {
      const now = performance.now();
      // pointermove fires a lot; only reset the timer a few times a second.
      if (now - last < 200) return;
      last = now;
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin'] as const;
    for (const type of events) window.addEventListener(type, wake, { passive: true });
    timer = setTimeout(() => setIdle(true), ms);
    return () => {
      clearTimeout(timer);
      for (const type of events) window.removeEventListener(type, wake);
    };
  }, [ms, active]);

  return idle;
}

// A heartbeat for the director. Prefers a Worker (steady even in hidden tabs) and falls
// back to setInterval. Nothing precise hangs off it: audio events are scheduled on the
// AudioContext clock with lookahead, so a late tick only eats into the lookahead.

export interface Ticker {
  /** Changes the interval (ms). 0 stops it. */
  setInterval(ms: number): void;
  dispose(): void;
}

export function createTicker(onTick: () => void): Ticker {
  let current = 0;
  let mainTimer: ReturnType<typeof setInterval> | undefined;
  let worker: Worker | null = null;

  const useMainThread = () => {
    worker?.terminate();
    worker = null;
    clearInterval(mainTimer);
    if (current > 0) mainTimer = setInterval(onTick, current);
  };

  try {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = () => onTick();
      // E.g. blocked by a content security policy.
      worker.onerror = useMainThread;
    }
  } catch {
    worker = null;
  }

  return {
    setInterval(ms: number) {
      if (ms === current) return;
      current = ms;
      if (worker) worker.postMessage({ interval: ms });
      else useMainThread();
    },
    dispose() {
      current = 0;
      clearInterval(mainTimer);
      worker?.terminate();
      worker = null;
    },
  };
}

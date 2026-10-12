// A steady tick that survives background tabs. Main-thread timers are throttled in
// hidden tabs (to 1 Hz or worse), but a dedicated worker's timer keeps running and its
// messages still get delivered, so we tick from a tiny inline worker. Combined with a
// generous scheduling lookahead on the AudioContext clock, throttling can't cause gaps.

export class Ticker {
  private worker: Worker | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly onVisibility = () => {
    if (this.running) this.callback();
  };

  constructor(
    private readonly callback: () => void,
    private readonly ms = 100,
    /** Skip the worker (tests the throttle-prone fallback). */
    private readonly workerless = false,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    try {
      if (this.workerless) throw new Error('workerless');
      if (!this.worker) {
        const src = `let id=null;onmessage=(e)=>{if(e.data==='start'){if(id===null)id=setInterval(()=>postMessage(0),${this.ms});}else{clearInterval(id);id=null;}};`;
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        this.worker = new Worker(url);
        URL.revokeObjectURL(url);
        this.worker.onmessage = () => {
          if (this.running) this.callback();
        };
      }
      this.worker.postMessage('start');
    } catch {
      // Workers unavailable (CSP, old browser): fall back to a main-thread timer.
      this.worker = null;
      this.interval = setInterval(() => this.callback(), this.ms);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.worker?.postMessage('stop');
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }
}

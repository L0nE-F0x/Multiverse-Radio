// Runs the director's heartbeat off the main thread. Timers in dedicated workers aren't
// subject to the aggressive throttling browsers apply to hidden tabs' main threads.

let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (event: MessageEvent<{ interval: number }>) => {
  clearInterval(timer);
  const { interval } = event.data;
  if (interval > 0) timer = setInterval(() => self.postMessage(0), interval);
};

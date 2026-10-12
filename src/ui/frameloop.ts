// One shared, deliberately slow animation clock for the cabinet's moving bits (the
// spectrum meter and the LED crawl).
//
// A chained requestAnimationFrame asks the browser for 60 frames a second even if you
// skip most of them, and every CSS animation costs a style pass per frame. Driving the
// little animations from a single 30 fps interval keeps a tab that's been left on for
// hours cheap, and stops entirely when nothing is subscribed.

type Callback = (now: number) => void;

const FPS = 30;
const callbacks = new Set<Callback>();
let timer: ReturnType<typeof setInterval> | undefined;

function run() {
  const now = performance.now();
  for (const callback of callbacks) callback(now);
}

/** Calls `callback` ~30 times a second until the returned function is called. */
export function onFrame(callback: Callback): () => void {
  callbacks.add(callback);
  timer ??= setInterval(run, 1000 / FPS);
  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

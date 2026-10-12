// Registers the service worker built by the pwa() Vite plugin (src/pwa/sw.js).
//
// Call once from main.tsx: `registerPwa()`. It does nothing in dev, in browsers without
// service workers, and outside secure contexts.
//
// Updates are silent: a new deploy's worker takes over in the background, the page that is
// playing keeps playing, and the next load gets the new build. Pass `onUpdate` if the UI
// wants to offer a "retune" button.

export interface PwaOptions {
  /** The app shell has been cached for the first time: the app now boots offline. */
  onOfflineReady?: () => void;
  /** A newer build took over in the background. Reloading picks it up; nothing else is needed. */
  onUpdate?: () => void;
}

/** Radio tabs stay open for hours, so look for new deploys while they do. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
/** When the tab becomes visible again, check if the last check is older than this. */
const VISIBLE_RECHECK_MS = 10 * 60 * 1000;

export function registerPwa(options: PwaOptions = {}): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator) || !window.isSecureContext) return;

  const start = () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          const isUpdate = Boolean(navigator.serviceWorker.controller);
          worker.addEventListener('statechange', () => {
            if (worker.state !== 'activated') return;
            if (isUpdate) options.onUpdate?.();
            else options.onOfflineReady?.();
          });
        });

        let lastCheck = Date.now();
        const check = () => {
          if (!navigator.onLine) return;
          lastCheck = Date.now();
          registration.update().catch(() => {});
        };
        window.setInterval(check, UPDATE_INTERVAL_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && Date.now() - lastCheck > VISIBLE_RECHECK_MS) check();
        });
      })
      .catch((error: unknown) => {
        console.warn('[pwa] service worker registration failed', error);
      });
  };

  // Don't compete with the first paint and the audio engine for bandwidth.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

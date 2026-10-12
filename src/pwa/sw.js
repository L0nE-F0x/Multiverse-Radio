// Multiverse Radio service worker.
//
// This is a template: the pwa() Vite plugin (src/pwa/vite-plugins.mjs) fills in __BUILD__
// and writes the result to dist/sw.js. It is plain JS on purpose: it never goes through the
// app bundler and is not type-checked against the DOM lib.
//
// Strategy
// - App shell (index page, entry JS/CSS, offline page, icons) is precached per build into
//   `mvr-shell-<version>`. Hashed /assets/* files are reused from older caches instead of
//   being downloaded again.
// - Navigations are network-first, so an online visitor always gets the newest deploy (no
//   stale shells). Offline, the cached shell boots the app (also for the per-station share
//   pages in BUILD.routes, which are the same app); anything else gets offline.html.
// - A new build takes over immediately (skipWaiting + clients.claim) but never reloads the
//   page: the radio keeps playing. The previous shell cache is kept for one more build so a
//   tab still running old code can lazy-load its old chunks after Netlify has deleted them.
// - Voice clips get a small, size-capped, one-day runtime cache. Range requests (from
//   <audio> elements) pass straight through. Voice manifests are network-first.

/* eslint-disable */
const BUILD = __BUILD__;

const VERSION = BUILD.version;
const BASE = BUILD.base;
const SHELL_PREFIX = 'mvr-shell-';
const SHELL = SHELL_PREFIX + VERSION;
const META = 'mvr-meta';
const VOICE = 'mvr-voice';
const DATA = 'mvr-data';
const VOICE_MAX_ENTRIES = 60;
const VOICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DATA_MAX_ENTRIES = 40;
const NAVIGATION_TIMEOUT_MS = 5000;
const CACHED_AT = 'x-mvr-cached-at';
// Pages that are the app shell under another URL (e.g. /station/void-beats/).
const ROUTES = new Set(BUILD.routes || []);
// Precached files served cache-first (pages are excluded: navigations are network-first).
const PRECACHED = new Set(
  [...BUILD.required, ...BUILD.optional].filter((url) => url !== BUILD.shell && url !== BUILD.offline),
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(BUILD.required.map((url) => precache(cache, url)));
      await Promise.all(BUILD.optional.map((url) => precache(cache, url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const meta = await caches.open(META);
      const previous = await meta.match('current').then((res) => (res ? res.text() : null));
      const keep = new Set([SHELL]);
      if (previous) keep.add(previous);
      for (const key of await caches.keys()) {
        if (key.startsWith(SHELL_PREFIX) && !keep.has(key)) await caches.delete(key);
      }
      await meta.put('current', new Response(SHELL));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Range requests come from <audio>/<video> elements; a cached full response would break
  // them, so they always go straight to the network.
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event, path));
  } else if (path.startsWith(BASE + 'assets/')) {
    event.respondWith(immutableAsset(request));
  } else if (path.startsWith(BASE + 'voice/')) {
    if (path.endsWith('.mp3')) {
      event.respondWith(voiceClip(event));
    } else if (path.endsWith('.json')) {
      event.respondWith(networkFirst(event, DATA, DATA_MAX_ENTRIES));
    }
  } else if (PRECACHED.has(path)) {
    event.respondWith(fromShell(request));
  }
  // Everything else goes straight to the network, untouched.
});

// ── Install helpers ───────────────────────────────────────────────────────────

async function precache(cache, url) {
  if (url.startsWith(BASE + 'assets/')) {
    // Content-hashed: a copy from any older build is byte-identical.
    const existing = await caches.match(url);
    if (existing) return cache.put(url, existing);
  }
  const res = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
  if (!res.ok) throw new Error(`precache ${url}: HTTP ${res.status}`);
  return cache.put(url, await unredirect(res));
}

// A redirected response can't answer a navigation; rebuild it without the flag.
async function unredirect(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

// ── Strategies ────────────────────────────────────────────────────────────────

async function navigate(event, path) {
  const preload = event.preloadResponse || Promise.resolve(undefined);
  event.waitUntil(preload.catch(() => {}));
  try {
    return await withTimeout(
      preload.then((res) => res || fetch(event.request)),
      NAVIGATION_TIMEOUT_MS,
    );
  } catch {
    const shell = await caches.open(SHELL);
    if (path === BASE || path === BASE + 'index.html' || ROUTES.has(path) || ROUTES.has(path + '/')) {
      const cached = (await shell.match(BUILD.shell)) || (await caches.match(BUILD.shell));
      if (cached) return cached;
    }
    return (
      (await shell.match(BUILD.offline)) ||
      (await caches.match(BUILD.offline)) ||
      new Response('No signal from this dimension.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

async function immutableAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return res;
}

async function fromShell(request) {
  const cache = await caches.open(SHELL);
  return (await cache.match(request)) || fetch(request);
}

async function voiceClip(event) {
  const { request } = event;
  const cache = await caches.open(VOICE);
  const cached = await cache.match(request);
  if (cached && Date.now() - Number(cached.headers.get(CACHED_AT) || 0) < VOICE_MAX_AGE_MS) {
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res.status === 200 && res.type === 'basic') {
      event.waitUntil(store(cache, request, res.clone(), VOICE_MAX_ENTRIES));
    }
    return res;
  } catch (error) {
    if (cached) return cached; // stale beats silence when the signal drops
    throw error;
  }
}

async function networkFirst(event, cacheName, maxEntries) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.status === 200 && res.type === 'basic') {
      event.waitUntil(store(cache, request, res.clone(), maxEntries));
    }
    return res;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function store(cache, request, res, maxEntries) {
  const headers = new Headers(res.headers);
  headers.set(CACHED_AT, String(Date.now()));
  const body = await res.arrayBuffer();
  await cache.put(request, new Response(body, { status: res.status, statusText: res.statusText, headers }));
  // Cache keys come back in insertion order (re-puts move to the end): drop the oldest.
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

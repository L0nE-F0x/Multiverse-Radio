// v4: flight-mode packs ("Prepare for dead space"). The listener stows voice manifests and
// clips in a dedicated cache that the service worker reads before the network, so hosts keep
// talking with no signal. Music is generative and the app shell is already precached.
// See docs/V4-PLAN.md, "Offline: flight-mode packs". The UI mounts `<OfflinePanel>` from
// src/offline/, which lazy-loads this module.
//
// How it's stored
// - Everything lives in the `mvr-packs` cache under its real URL (`/voice/<key>.json`,
//   `/voice/<key>/<clip>.mp3`), so the service worker can answer straight from it.
// - The cache is its own record: a stowed entry is one whose manifest is in the cache. The
//   manifest is written last, after every clip, so a cancelled download leaves no "stowed"
//   entry, only clips that the next run skips. Manifests and clips carry the
//   `/voice/_index.json` version they were stowed at in an `x-mvr-pack-version` header.
// - Clip URLs aren't content-hashed, so when an entry's version on the server changes the
//   entry is "stale" and a re-download replaces its clips.
// - Without `/voice/_index.json` (older deploys), sizes are estimated from the manifests
//   (64 kbps clips) and versions are a hash of each manifest's text.

import { resolveAsset } from '../broadcast/manifest';
import { LISTEN_TIME_KEY, type VoiceIndex } from '../broadcast/types';
import { MAIN_STATIONS, STATIONS } from '../stations/roster';

/** Cache the packs live in. The service worker checks it before the network and the runtime voice cache. */
export const PACKS_CACHE = 'mvr-packs';

/**
 * essentials – the pools (HUSH, events, shared, pirates, oddities) + your 6 most-played stations
 * half       – the pools + your most-played half of the dial
 * everything – every manifest and clip
 */
export const PACK_IDS = ['essentials', 'half', 'everything'] as const;
export type PackId = (typeof PACK_IDS)[number];

/** Display copy for each pack. */
export const PACKS: Record<PackId, { label: string; blurb: string }> = {
  essentials: { label: 'Essentials', blurb: 'HUSH, the pools and your six most-played stations' },
  half: { label: 'Half the dial', blurb: 'HUSH, the pools and your most-played half of the dial' },
  everything: { label: 'Everything', blurb: 'Every station, every voice on the band' },
};

/** Shared voice pools: the overlay (HUSH, events) and pirates/oddities need them. */
export const POOLS = ['_shared', '_ship', '_events', '_pirate', '_oddities'] as const;
/** The show index: a manifest with no clips. */
export const SHOWS = '_shows';
/** How many stations the essentials pack takes. */
export const ESSENTIAL_STATIONS = 6;
/** Stations that fill up "most-played" for listeners with little history, best first. */
export const POPULAR_STATIONS = ['void-beats', 'rainfall-fm', 'every-news', 'end-lounge', 'neon-2087', 'ask-grenda', 'hold-music', 'moon-dub'];

/** Request header that tells the service worker to let a pack download through untouched. */
export const PACK_REQUEST_HEADER = 'x-mvr-pack';
const VERSION_HEADER = 'x-mvr-pack-version';
const BYTES_HEADER = 'x-mvr-pack-bytes';
const CLIPS_HEADER = 'x-mvr-pack-clips';
const AT_HEADER = 'x-mvr-pack-at';
const INDEX = '_index';
/** Voice clips are 64 kbps mono: 8 bytes per millisecond. Used only without `_index.json`. */
const BYTES_PER_MS = 8;
const CONCURRENCY = 4;
const RETRIES = 3;

export interface PackPlan {
  pack: PackId;
  /** Manifest keys (station ids and pools such as `_ship`), in download order. */
  entries: string[];
  /** Bytes still to download (already-stowed entries at the current version excluded). */
  bytes: number;
  /** Bytes the pack takes in total. */
  totalBytes: number;
  /** Entries not yet stowed at the current version (new, stale or never downloaded). */
  missing: string[];
  /** True when sizes are estimated from the manifests because `/voice/_index.json` is missing. */
  estimated: boolean;
  /** False when nothing about sizes is known (no index and the manifests couldn't be read). */
  sizeKnown: boolean;
}

export interface StowedEntry {
  version: string;
  bytes: number;
  clips: number;
  /** When it was stowed, epoch ms. */
  at: number;
}

export interface OfflineStatus {
  /** Manifest keys stowed, with the version from `/voice/_index.json` they were stowed at. */
  stowed: Record<string, string>;
  /** Stowed entries whose version has since changed on the server. */
  stale: string[];
  /** Bytes in the packs cache. */
  bytes: number;
  /** From navigator.storage.estimate(), if available. */
  quota: number | null;
  /** navigator.storage.persisted(), if available. */
  persisted: boolean | null;
  /** Per stowed entry: version, size, clip count, when. */
  entries: Record<string, StowedEntry>;
  /** From navigator.storage.estimate(): bytes this origin uses, if available. */
  usage: number | null;
}

export interface DownloadProgress {
  doneBytes: number;
  totalBytes: number;
  /** The manifest key being downloaded. */
  current: string | null;
}

/** What the module needs from the browser; tests pass fakes. */
export interface OfflineDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  caches: CacheStorage;
  storage?: Pick<StorageManager, 'estimate' | 'persist' | 'persisted'>;
  /** Per-station listening time (ms). */
  listenTime(): Record<string, number>;
  /** Base delay for retries, ms. */
  retryDelayMs?: number;
}

type IndexEntry = VoiceIndex['entries'][string];

/** A voice index plus whether it was estimated from the manifests. */
export interface LoadedIndex {
  entries: Record<string, IndexEntry>;
  estimated: boolean;
}

// ── Planning (pure) ───────────────────────────────────────────────────────────

/** Listening time from localStorage, tolerant of junk. */
export function readListenTime(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: Record<string, number> = {};
    for (const [id, ms] of Object.entries(data)) if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) out[id] = ms;
    return out;
  } catch {
    return {};
  }
}

/**
 * Stations by how much they've been listened to, then `fill` (in order), then the dial order of
 * `dial`. Played stations count if they're in `known`; only stations in `available` (when
 * given) are returned.
 */
export function rankStations(
  listenTime: Record<string, number>,
  dial: readonly string[],
  fill: readonly string[] = [],
  known: readonly string[] = dial,
  available?: ReadonlySet<string>,
): string[] {
  const ok = (id: string) => known.includes(id) && (!available || available.has(id));
  const played = Object.keys(listenTime)
    .filter(ok)
    .sort((a, b) => (listenTime[b] ?? 0) - (listenTime[a] ?? 0) || dial.indexOf(a) - dial.indexOf(b));
  const out = new Set(played);
  for (const id of fill) if (dial.includes(id) && ok(id)) out.add(id);
  for (const id of dial) if (ok(id)) out.add(id);
  return [...out];
}

export interface PlanInput {
  listenTime: Record<string, number>;
  /** Main (non-secret) station ids in dial order. */
  dial: readonly string[];
  /** Every station id in dial order (secret ones included). */
  all: readonly string[];
  /** The voice index; null if unknown (then every candidate is planned). */
  index: Record<string, IndexEntry> | null;
}

/** The manifest keys a pack covers, in download order: pools first, then stations. */
export function planEntries(pack: PackId, input: PlanInput): string[] {
  const { listenTime, dial, all, index } = input;
  const available = index ? new Set(Object.keys(index)) : undefined;
  const has = (key: string) => !available || available.has(key);
  const pools = [...POOLS, SHOWS].filter((key) => has(key) || key === SHOWS);
  // A station with listening time but no voice yet (not in the index) is skipped, not counted.
  const ranked = rankStations(listenTime, dial, pack === 'essentials' ? POPULAR_STATIONS : [], all, available);
  if (pack === 'essentials') return [...pools, ...ranked.slice(0, ESSENTIAL_STATIONS)];
  if (pack === 'half') {
    const mainRanked = ranked.filter((id) => dial.includes(id));
    const count = Math.ceil(dial.filter(has).length / 2);
    return [...pools, ...mainRanked.slice(0, count)];
  }
  const extra = index ? Object.keys(index).filter((key) => key !== INDEX && !pools.includes(key) && !all.includes(key)).sort() : [];
  return [...pools, ...all.filter(has), ...extra];
}

/** Whether a stowed entry is current against the index (unknown index entries count as current). */
export function isCurrent(stowed: string | undefined, entry: IndexEntry | undefined): boolean {
  if (stowed === undefined) return false;
  return !entry || entry.version === stowed;
}

/** Stowed entries whose version on the server differs from the one stowed. */
export function staleEntries(stowed: Record<string, string>, index: Record<string, IndexEntry> | null): string[] {
  if (!index) return [];
  return Object.keys(stowed).filter((key) => index[key] && index[key].version !== stowed[key]);
}

/** Sizes for a list of entries given what's stowed. */
export function sizePlan(pack: PackId, entries: string[], index: LoadedIndex | null, stowed: Record<string, string>): PackPlan {
  let bytes = 0;
  let totalBytes = 0;
  const missing: string[] = [];
  for (const key of entries) {
    const entry = index?.entries[key];
    const size = entry?.bytes ?? 0;
    totalBytes += size;
    if (!isCurrent(stowed[key], entry)) {
      bytes += size;
      missing.push(key);
    }
  }
  return { pack, entries, bytes, totalBytes, missing, estimated: index?.estimated ?? false, sizeKnown: index !== null };
}

/** FNV-1a, 32-bit, hex: a version for manifests when there's no index. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Validates `/voice/_index.json`; null if it isn't one. */
export function parseIndex(data: unknown): Record<string, IndexEntry> | null {
  if (!data || typeof data !== 'object') return null;
  const entries = (data as { entries?: unknown }).entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null;
  const out: Record<string, IndexEntry> = {};
  for (const [key, raw] of Object.entries(entries as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const { clips, bytes, version } = raw as Record<string, unknown>;
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) continue;
    if (typeof version !== 'string' && typeof version !== 'number') continue;
    out[key] = { clips: typeof clips === 'number' ? clips : 0, bytes, version: String(version) };
  }
  return out;
}

// ── The packs, against a cache and a network ──────────────────────────────────

const manifestPath = (key: string) => resolveAsset(`/voice/${key}.json`);
const folderPath = (key: string) => resolveAsset(`/voice/${key}/`);
const pathOf = (url: string) => {
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url;
  }
};

function abortError(): Error {
  return typeof DOMException === 'function' ? new DOMException('Download cancelled', 'AbortError') : Object.assign(new Error('Download cancelled'), { name: 'AbortError' });
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createPacks(deps: OfflineDeps) {
  const retryDelay = deps.retryDelayMs ?? 600;
  const dial = MAIN_STATIONS.map((s) => s.id);
  const all = STATIONS.map((s) => s.id);
  let fallbackIndex: { at: number; value: LoadedIndex | null } | null = null;

  const open = () => deps.caches.open(PACKS_CACHE);

  /** A download request: past the HTTP cache (revalidated) and past the service worker. */
  const packFetch = (url: string, signal?: AbortSignal) =>
    deps.fetch(url, { cache: 'no-cache', headers: { [PACK_REQUEST_HEADER]: '1' }, signal });

  async function fetchRetry(url: string, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw abortError();
      try {
        const res = await packFetch(url, signal);
        if (res.status < 500 || attempt >= RETRIES) return res;
      } catch (error) {
        if (signal?.aborted || isAbort(error)) throw abortError();
        if (attempt >= RETRIES) throw error;
      }
      await sleep(retryDelay * 2 ** attempt, signal);
    }
  }

  /** `/voice/_index.json`, or an estimate from the manifests, or null when neither is reachable. */
  async function loadIndex(): Promise<LoadedIndex | null> {
    try {
      const res = await deps.fetch(manifestPath(INDEX), { cache: 'no-cache' });
      if (res.ok) {
        const entries = parseIndex(await res.json().catch(() => null));
        if (entries && Object.keys(entries).length) return { entries, estimated: false };
      }
    } catch {
      // Offline, or no index: fall through.
    }
    // Stowed copy (written with every download), for sizes while offline.
    try {
      const cached = await (await open()).match(manifestPath(INDEX));
      const entries = cached ? parseIndex(await cached.json().catch(() => null)) : null;
      if (entries && Object.keys(entries).length) return { entries, estimated: false };
    } catch {
      // ignore
    }
    if (fallbackIndex && Date.now() - fallbackIndex.at < 5 * 60_000) return fallbackIndex.value;
    const value = await estimateIndex();
    fallbackIndex = { at: Date.now(), value };
    return value;
  }

  /** No index on the server: read every manifest and estimate sizes from clip durations. */
  async function estimateIndex(): Promise<LoadedIndex | null> {
    const keys = [...POOLS, SHOWS, ...all];
    const entries: Record<string, IndexEntry> = {};
    let reached = false;
    await pool(keys, 6, async (key) => {
      try {
        const res = await packFetch(manifestPath(key));
        reached = true;
        if (!res.ok) return;
        const text = await res.text();
        const clips = clipsOf(text);
        if (!clips) return;
        const ms = clips.reduce((sum, clip) => sum + clip.durationMs, 0);
        entries[key] = { clips: clips.length, bytes: Math.round(ms * BYTES_PER_MS) + text.length, version: `m${textHash(text)}` };
      } catch {
        // Unreachable: leave it out.
      }
    });
    return reached && Object.keys(entries).length ? { entries, estimated: true } : null;
  }

  async function readStowed(): Promise<Record<string, StowedEntry>> {
    const cache = await open();
    const out: Record<string, StowedEntry> = {};
    const prefix = resolveAsset('/voice/');
    for (const request of await cache.keys()) {
      const path = pathOf(request.url);
      if (!path.startsWith(prefix) || !path.endsWith('.json')) continue;
      const key = path.slice(prefix.length, -'.json'.length);
      if (!key || key.includes('/') || key === INDEX) continue;
      const res = await cache.match(request);
      if (!res) continue;
      out[key] = {
        version: res.headers.get(VERSION_HEADER) ?? '',
        bytes: Number(res.headers.get(BYTES_HEADER)) || 0,
        clips: Number(res.headers.get(CLIPS_HEADER)) || 0,
        at: Number(res.headers.get(AT_HEADER)) || 0,
      };
    }
    return out;
  }

  const versions = (stowed: Record<string, StowedEntry>) =>
    Object.fromEntries(Object.entries(stowed).map(([key, entry]) => [key, entry.version]));

  async function packPlan(pack: PackId, known?: { index: LoadedIndex | null; stowed: Record<string, string> }): Promise<PackPlan> {
    const index = known ? known.index : await loadIndex();
    const stowed = known ? known.stowed : versions(await readStowed());
    const entries = planEntries(pack, { listenTime: deps.listenTime(), dial, all, index: index?.entries ?? null });
    return sizePlan(pack, entries, index, stowed);
  }

  /** All three plans at once (one index fetch). */
  async function packPlans(): Promise<Record<PackId, PackPlan>> {
    const index = await loadIndex();
    const stowed = versions(await readStowed());
    const out = {} as Record<PackId, PackPlan>;
    for (const pack of PACK_IDS) out[pack] = await packPlan(pack, { index, stowed });
    return out;
  }

  async function requestPersistence(): Promise<boolean | null> {
    try {
      if (!deps.storage?.persist) return null;
      if (deps.storage.persisted && (await deps.storage.persisted())) return true;
      return await deps.storage.persist();
    } catch {
      return null;
    }
  }

  /** Stow a pack, or specific entries (e.g. the stale ones). Skips what's current. */
  async function stow(what: PackId | string[], onProgress: (progress: DownloadProgress) => void, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError();
    void requestPersistence();
    const index = await loadIndex();
    const stowed = versions(await readStowed());
    const plan = typeof what === 'string' ? await packPlan(what, { index, stowed }) : sizePlan('everything', what, index, stowed);
    const cache = await open();
    const totalBytes = plan.bytes;
    let doneBase = 0;
    onProgress({ doneBytes: 0, totalBytes, current: plan.missing[0] ?? null });

    // Keep the index for offline sizes and the service worker's offline answers.
    if (index && !index.estimated) {
      await cache.put(manifestPath(INDEX), jsonResponse(JSON.stringify({ version: 1, entries: index.entries }), {}));
    }

    // The show index is tiny and only versioned when the index lists it: refresh it every time.
    const work = [...plan.missing];
    if (plan.entries.includes(SHOWS) && !index?.entries[SHOWS] && !work.includes(SHOWS)) work.push(SHOWS);

    for (const key of work) {
      if (signal?.aborted) throw abortError();
      const planned = index?.entries[key]?.bytes ?? 0;
      let entryDone = 0;
      const report = () =>
        !signal?.aborted &&
        onProgress({ doneBytes: doneBase + Math.min(entryDone, planned || entryDone), totalBytes, current: key });
      report();

      const res = await fetchRetry(manifestPath(key), signal);
      if (!res.ok) {
        // Not on the server (yet): nothing to stow.
        doneBase += planned;
        continue;
      }
      const text = await res.text();
      const clips = clipsOf(text);
      if (!clips) {
        doneBase += planned;
        continue;
      }
      const version = index?.entries[key] && !index.estimated ? index.entries[key].version : `m${textHash(text)}`;
      const urls = [...new Set(clips.map((clip) => resolveAsset(clip.url)))];
      let bytes = text.length;

      await pool(urls, CONCURRENCY, async (url) => {
        if (signal?.aborted) throw abortError();
        const existing = await cache.match(url);
        if (existing && existing.headers.get(VERSION_HEADER) === version) {
          const size = Number(existing.headers.get('content-length')) || 0;
          bytes += size;
          entryDone += size;
          report();
          return;
        }
        const clip = await fetchRetry(url, signal);
        if (!clip.ok) {
          if (clip.status >= 400 && clip.status < 500) return; // missing on the server too
          throw new Error(`HTTP ${clip.status} for ${url}`);
        }
        const body = await clip.arrayBuffer();
        if (signal?.aborted) throw abortError();
        await cache.put(
          url,
          new Response(body, {
            headers: {
              'content-type': clip.headers.get('content-type') ?? 'audio/mpeg',
              'content-length': String(body.byteLength),
              [VERSION_HEADER]: version,
            },
          }),
        );
        bytes += body.byteLength;
        entryDone += body.byteLength;
        report();
      });

      if (signal?.aborted) throw abortError();
      // Clips the new manifest no longer has (a stale entry being replaced).
      const keep = new Set(urls.map(pathOf));
      const folder = folderPath(key);
      for (const request of await cache.keys()) {
        const path = pathOf(request.url);
        if (path.startsWith(folder) && !keep.has(path)) await cache.delete(request);
      }
      // Commit: the manifest is the record that the entry is stowed.
      await cache.put(
        manifestPath(key),
        jsonResponse(text, {
          [VERSION_HEADER]: version,
          [BYTES_HEADER]: String(bytes),
          [CLIPS_HEADER]: String(urls.length),
          [AT_HEADER]: String(Date.now()),
        }),
      );
      doneBase += planned || entryDone;
      onProgress({ doneBytes: doneBase, totalBytes: Math.max(totalBytes, doneBase), current: key });
    }
    onProgress({ doneBytes: Math.max(totalBytes, doneBase), totalBytes: Math.max(totalBytes, doneBase), current: null });
  }

  async function removePacks(entries?: string[]): Promise<void> {
    if (!entries) {
      await deps.caches.delete(PACKS_CACHE);
      return;
    }
    const cache = await open();
    const folders = entries.map(folderPath);
    const manifests = new Set(entries.map(manifestPath));
    for (const request of await cache.keys()) {
      const path = pathOf(request.url);
      if (manifests.has(path) || folders.some((folder) => path.startsWith(folder))) await cache.delete(request);
    }
  }

  async function offlineStatus(): Promise<OfflineStatus> {
    const entries = await readStowed().catch(() => ({}) as Record<string, StowedEntry>);
    const stowed = versions(entries);
    const index = Object.keys(stowed).length ? await loadIndex() : null;
    let quota: number | null = null;
    let usage: number | null = null;
    let persisted: boolean | null = null;
    try {
      const estimate = await deps.storage?.estimate?.();
      quota = estimate?.quota ?? null;
      usage = estimate?.usage ?? null;
    } catch {
      // unavailable
    }
    try {
      persisted = deps.storage?.persisted ? await deps.storage.persisted() : null;
    } catch {
      // unavailable
    }
    return {
      stowed,
      stale: staleEntries(stowed, index?.entries ?? null),
      bytes: Object.values(entries).reduce((sum, entry) => sum + entry.bytes, 0),
      quota,
      usage,
      persisted,
      entries,
    };
  }

  return {
    loadIndex,
    packPlan: (pack: PackId) => packPlan(pack),
    packPlans,
    downloadPack: (pack: PackId, onProgress: (progress: DownloadProgress) => void, signal?: AbortSignal) => stow(pack, onProgress, signal),
    downloadEntries: (entries: string[], onProgress: (progress: DownloadProgress) => void, signal?: AbortSignal) => stow(entries, onProgress, signal),
    removePacks,
    offlineStatus,
    requestPersistence,
  };
}

function clipsOf(text: string): { url: string; durationMs: number }[] | null {
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object') return null;
    const clips = (data as { clips?: unknown }).clips;
    if (!Array.isArray(clips)) return (data as { shows?: unknown }).shows ? [] : null; // _shows.json
    return clips.flatMap((clip) =>
      clip && typeof clip === 'object' && typeof (clip as { url?: unknown }).url === 'string'
        ? [{ url: (clip as { url: string }).url, durationMs: Number((clip as { durationMs?: unknown }).durationMs) || 0 }]
        : [],
    );
  } catch {
    return null;
  }
}

function jsonResponse(text: string, headers: Record<string, string>): Response {
  return new Response(text, { headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++] as T;
      try {
        await run(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// ── The browser instance ──────────────────────────────────────────────────────

let browser: ReturnType<typeof createPacks> | null = null;

function packs(): ReturnType<typeof createPacks> {
  if (browser) return browser;
  if (typeof caches === 'undefined') throw new Error('Offline packs need Cache Storage (a secure context).');
  browser = createPacks({
    fetch: (url, init) => fetch(url, init),
    caches,
    storage: typeof navigator !== 'undefined' ? navigator.storage : undefined,
    listenTime: () => {
      try {
        return readListenTime(localStorage.getItem(LISTEN_TIME_KEY));
      } catch {
        return {};
      }
    },
  });
  return browser;
}

/** Whether this browser can stow packs at all (Cache Storage in a secure context). */
export function packsSupported(): boolean {
  return typeof caches !== 'undefined';
}

/** What a pack would download right now, from `/voice/_index.json` and the listener's listening time. */
export function packPlan(pack: PackId): Promise<PackPlan> {
  return packs().packPlan(pack);
}

/** All three plans, sharing one index fetch. */
export function packPlans(): Promise<Record<PackId, PackPlan>> {
  return packs().packPlans();
}

/** Stow a pack. Resumable: entries already stowed at the current version are skipped. */
export function downloadPack(pack: PackId, onProgress: (progress: DownloadProgress) => void, signal?: AbortSignal): Promise<void> {
  return packs().downloadPack(pack, onProgress, signal);
}

/** Stow (or refresh) specific entries, e.g. the stale ones from `offlineStatus()`. */
export function downloadEntries(entries: string[], onProgress: (progress: DownloadProgress) => void, signal?: AbortSignal): Promise<void> {
  return packs().downloadEntries(entries, onProgress, signal);
}

/** Remove the given stowed entries, or everything when called without arguments. */
export function removePacks(entries?: string[]): Promise<void> {
  return packs().removePacks(entries);
}

export async function offlineStatus(): Promise<OfflineStatus> {
  if (!packsSupported()) return { stowed: {}, stale: [], bytes: 0, quota: null, usage: null, persisted: null, entries: {} };
  return packs().offlineStatus();
}

/** Ask the browser not to evict stored data (also done when a download starts). */
export function requestPersistence(): Promise<boolean | null> {
  return packs().requestPersistence();
}

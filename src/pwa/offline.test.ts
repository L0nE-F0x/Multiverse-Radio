import { describe, expect, it } from 'vitest';
import { MAIN_STATIONS, STATIONS } from '../stations/roster';
import {
  createPacks,
  ESSENTIAL_STATIONS,
  isCurrent,
  planEntries,
  POOLS,
  POPULAR_STATIONS,
  rankStations,
  readListenTime,
  SHOWS,
  sizePlan,
  staleEntries,
  type DownloadProgress,
  type OfflineDeps,
} from './offline';

const dial = MAIN_STATIONS.map((s) => s.id);
const all = STATIONS.map((s) => s.id);
const pools = [...POOLS, SHOWS];

describe('most-played', () => {
  it('ranks by listening time, then the popular set, then dial order', () => {
    const [a, b, c] = [dial[10]!, dial[3]!, dial[20]!];
    const ranked = rankStations({ [a]: 10, [b]: 500, [c]: 50 }, dial, POPULAR_STATIONS);
    expect(ranked.slice(0, 3)).toEqual([b, c, a]);
    const popular = POPULAR_STATIONS.filter((id) => dial.includes(id) && ![a, b, c].includes(id));
    expect(ranked.slice(3, 3 + popular.length)).toEqual(popular);
    expect(new Set(ranked).size).toBe(dial.length);
  });

  it('ignores junk listening time', () => {
    expect(readListenTime('{"void-beats": 12, "x": "nope", "y": -3}')).toEqual({ 'void-beats': 12 });
    expect(readListenTime('not json')).toEqual({});
    expect(readListenTime(null)).toEqual({});
  });

  it('essentials: pools + 6 stations, filled from the popular set with no history', () => {
    const entries = planEntries('essentials', { listenTime: {}, dial, all, index: null });
    expect(entries.slice(0, pools.length)).toEqual(pools);
    expect(entries.slice(pools.length)).toEqual(POPULAR_STATIONS.filter((id) => dial.includes(id)).slice(0, ESSENTIAL_STATIONS));
  });

  it('essentials puts the most-played first and counts a discovered secret station', () => {
    const secret = STATIONS.find((s) => s.secret)!.id;
    const entries = planEntries('essentials', { listenTime: { [secret]: 900, [dial[5]!]: 100 }, dial, all, index: null });
    expect(entries.slice(pools.length, pools.length + 2)).toEqual([secret, dial[5]]);
    expect(entries).toHaveLength(pools.length + ESSENTIAL_STATIONS);
  });

  it('half: the most-played half of the main stations, then dial order', () => {
    const entries = planEntries('half', { listenTime: { [dial[30]!]: 5 }, dial, all, index: null });
    const stations = entries.slice(pools.length);
    expect(stations).toHaveLength(Math.ceil(dial.length / 2));
    expect(stations[0]).toBe(dial[30]);
    expect(stations.slice(1)).toEqual(dial.filter((id) => id !== dial[30]).slice(0, stations.length - 1));
  });

  it('only plans what the index has, and everything takes all of it', () => {
    const index = Object.fromEntries(['_shared', '_ship', 'void-beats', 'rainfall-fm', 'mystery-extra'].map((k) => [k, { clips: 1, bytes: 100, version: 'v1' }]));
    expect(planEntries('essentials', { listenTime: { 'every-news': 99 }, dial, all, index })).toEqual(['_shared', '_ship', SHOWS, 'void-beats', 'rainfall-fm']);
    const everything = planEntries('everything', { listenTime: {}, dial, all, index });
    expect(everything).toEqual(['_shared', '_ship', SHOWS, ...all.filter((id) => id === 'void-beats' || id === 'rainfall-fm'), 'mystery-extra']);
  });
});

describe('stale and resume planning', () => {
  const index = { a: { clips: 2, bytes: 100, version: 'v2' }, b: { clips: 1, bytes: 50, version: 'v1' }, c: { clips: 1, bytes: 30, version: 'v1' } };

  it('marks entries whose version changed', () => {
    expect(staleEntries({ a: 'v1', b: 'v1', gone: 'v1' }, index)).toEqual(['a']);
    expect(staleEntries({ a: 'v1' }, null)).toEqual([]);
    expect(isCurrent('v1', undefined)).toBe(true);
    expect(isCurrent(undefined, index.a)).toBe(false);
  });

  it('only counts what is still to download', () => {
    const plan = sizePlan('half', ['a', 'b', 'c'], { entries: index, estimated: false }, { a: 'v1', b: 'v1' });
    expect(plan).toMatchObject({ bytes: 130, totalBytes: 180, missing: ['a', 'c'], sizeKnown: true });
    expect(sizePlan('half', ['a'], null, {})).toMatchObject({ sizeKnown: false, bytes: 0 });
  });
});

// ── Downloads against an in-memory cache and server ──────────────────────────

class MemoryCache {
  store = new Map<string, Response>();
  key = (req: RequestInfo | URL) => new URL(typeof req === 'string' ? req : req instanceof URL ? req.href : req.url, 'http://test').pathname;
  async match(req: RequestInfo | URL) {
    return this.store.get(this.key(req))?.clone();
  }
  async put(req: RequestInfo | URL, res: Response) {
    this.store.set(this.key(req), res);
  }
  async delete(req: RequestInfo | URL) {
    return this.store.delete(this.key(req));
  }
  async keys() {
    return [...this.store.keys()].map((path) => new Request(`http://test${path}`));
  }
}

function fakeBrowser(files: Record<string, string>, listenTime: Record<string, number> = {}) {
  const caches = new Map<string, MemoryCache>();
  const requests: string[] = [];
  let failNext = 0;
  const deps: OfflineDeps = {
    retryDelayMs: 1,
    listenTime: () => listenTime,
    caches: {
      open: async (name: string) => caches.get(name) ?? caches.set(name, new MemoryCache()).get(name)!,
      delete: async (name: string) => caches.delete(name),
    } as unknown as CacheStorage,
    fetch: async (url, init) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      requests.push(url);
      if (failNext > 0 && url.endsWith('.mp3')) {
        failNext--;
        throw new TypeError('network down');
      }
      const body = files[url];
      return body === undefined ? new Response('nope', { status: 404 }) : new Response(body, { headers: { 'content-type': url.endsWith('.json') ? 'application/json' : 'audio/mpeg' } });
    },
  };
  return { deps, requests, caches, failNext: (n: number) => (failNext = n) };
}

function station(id: string, clips: string[], body = 'x') {
  return {
    [`/voice/${id}.json`]: JSON.stringify({ version: 1, station: id, clips: clips.map((c) => ({ id: c, category: 'dj', url: `/voice/${id}/${c}.mp3`, durationMs: 1000 })) }),
    ...Object.fromEntries(clips.map((c) => [`/voice/${id}/${c}.mp3`, `${id}/${c}:${body}`.padEnd(40, '.')])),
  };
}

function library(version = 'v1') {
  const files: Record<string, string> = {
    ...station('_shared', ['s1']),
    ...station('_ship', ['h1']),
    ...station('void-beats', ['id-1', 'dj-1']),
    ...station('rainfall-fm', ['id-1']),
    '/voice/_shows.json': JSON.stringify({ version: 1, shows: {} }),
  };
  const entries = Object.fromEntries(['_shared', '_ship', '_shows', 'void-beats', 'rainfall-fm'].map((k) => [k, { clips: 1, bytes: 80, version }]));
  files['/voice/_index.json'] = JSON.stringify({ version: 1, entries });
  return files;
}

describe('downloads', () => {
  it('stows a pack, reports progress and records versions', async () => {
    const { deps } = fakeBrowser(library());
    const packs = createPacks(deps);
    const progress: DownloadProgress[] = [];
    await packs.downloadPack('essentials', (p) => progress.push(p));
    const status = await packs.offlineStatus();
    expect(status.stowed).toEqual({ _shared: 'v1', _ship: 'v1', _shows: 'v1', 'void-beats': 'v1', 'rainfall-fm': 'v1' });
    expect(status.entries['void-beats']).toMatchObject({ clips: 2 });
    expect(status.stale).toEqual([]);
    expect(progress.at(-1)).toMatchObject({ current: null, doneBytes: 400, totalBytes: 400 });
    expect(progress.some((p) => p.current === 'void-beats')).toBe(true);
    expect((await packs.packPlan('essentials')).bytes).toBe(0);
  });

  it('resumes: skips stowed entries and clips already in the cache', async () => {
    const browser = fakeBrowser(library());
    const packs = createPacks(browser.deps);
    const controller = new AbortController();
    // Cancel as soon as the first void-beats clip is in.
    await expect(
      packs.downloadPack(
        'essentials',
        (p) => {
          if (p.current === 'void-beats' && p.doneBytes > 240) controller.abort();
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const before = await packs.offlineStatus();
    expect(before.stowed['void-beats']).toBeUndefined();
    expect(Object.keys(before.stowed)).toEqual(expect.arrayContaining(['_shared', '_ship', '_shows']));

    browser.requests.length = 0;
    await packs.downloadPack('essentials', () => {});
    const clipFetches = browser.requests.filter((url) => url.endsWith('.mp3'));
    expect(clipFetches).not.toContain('/voice/_shared/s1.mp3');
    expect(clipFetches.filter((url) => url.startsWith('/voice/void-beats/')).length).toBeLessThan(2);
    expect(clipFetches).toContain('/voice/rainfall-fm/id-1.mp3');
    expect((await packs.offlineStatus()).stowed['void-beats']).toBe('v1');
  });

  it('retries network errors', async () => {
    const browser = fakeBrowser(library());
    const packs = createPacks(browser.deps);
    browser.failNext(2);
    await packs.downloadPack('essentials', () => {});
    expect(Object.keys((await packs.offlineStatus()).stowed)).toHaveLength(5);
  });

  it('marks changed entries stale and replaces their clips on refresh', async () => {
    const files = library();
    const packs = createPacks(fakeBrowser(files).deps);
    await packs.downloadPack('essentials', () => {});

    // A new deploy: void-beats re-rendered with a different clip list.
    Object.assign(files, station('void-beats', ['id-1', 'dj-2'], 'new'));
    delete files['/voice/void-beats/dj-1.mp3'];
    const index = JSON.parse(files['/voice/_index.json']!);
    index.entries['void-beats'].version = 'v2';
    files['/voice/_index.json'] = JSON.stringify(index);

    const status = await packs.offlineStatus();
    expect(status.stale).toEqual(['void-beats']);
    const plan = await packs.packPlan('essentials');
    expect(plan.missing).toEqual(['void-beats']);

    await packs.downloadPack('essentials', () => {});
    expect((await packs.offlineStatus()).stale).toEqual([]);
  });

  it('removes one entry or everything', async () => {
    const browser = fakeBrowser(library());
    const packs = createPacks(browser.deps);
    await packs.downloadPack('essentials', () => {});
    await packs.removePacks(['void-beats']);
    const cache = browser.caches.get('mvr-packs')!;
    expect([...cache.store.keys()].some((k) => k.startsWith('/voice/void-beats'))).toBe(false);
    expect(cache.store.has('/voice/rainfall-fm/id-1.mp3')).toBe(true);
    expect((await packs.offlineStatus()).stowed['void-beats']).toBeUndefined();
    await packs.removePacks();
    expect((await packs.offlineStatus()).stowed).toEqual({});
  });

  it('works without an index: estimated sizes and manifest-hash versions', async () => {
    const files = library();
    delete files['/voice/_index.json'];
    const packs = createPacks(fakeBrowser(files, { 'rainfall-fm': 10 }).deps);
    const plan = await packs.packPlan('essentials');
    expect(plan.estimated).toBe(true);
    expect(plan.entries).toEqual(['_shared', '_ship', '_shows', 'rainfall-fm', 'void-beats']);
    expect(plan.bytes).toBeGreaterThan(4 * 8000);
    await packs.downloadPack('essentials', () => {});
    const status = await packs.offlineStatus();
    expect(Object.keys(status.stowed)).toHaveLength(5);
    expect(status.stowed['void-beats']).toMatch(/^m[0-9a-f]{8}$/);
    expect(status.stale).toEqual([]);
  });
});

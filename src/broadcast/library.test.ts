import { describe, expect, it } from 'vitest';
import { stationById } from '../stations/roster';
import { AudioBufferCache, bufferBytes } from './audioCache';
import { VoiceLibrary } from './library';
import type { VoiceManifest } from './types';

const MB = 1024 * 1024;

/** A fake decoded buffer of roughly `mb` megabytes (mono float32). */
const fakeBuffer = (mb: number) => ({ length: (mb * MB) / 4, numberOfChannels: 1, duration: 1 }) as AudioBuffer;

describe('AudioBufferCache', () => {
  it('stays under its byte budget, evicting least recently used', async () => {
    const decoded: string[] = [];
    const cache = new AudioBufferCache(async (url) => {
      decoded.push(url);
      return fakeBuffer(10);
    }, 40 * MB);
    for (const url of ['a', 'b', 'c', 'd']) await cache.load(url);
    expect(cache.bytes).toBe(40 * MB);
    cache.get('a'); // touch: now b is the stalest
    await cache.load('e');
    expect(cache.bytes).toBeLessThanOrEqual(40 * MB);
    expect(cache.state('b')).toBe('idle');
    expect(cache.state('a')).toBe('ready');
    expect(cache.state('e')).toBe('ready');
    expect(bufferBytes(fakeBuffer(10))).toBe(10 * MB);
  });

  it('shares in-flight loads and remembers failures', async () => {
    let calls = 0;
    const cache = new AudioBufferCache(async (url) => {
      calls++;
      if (url === 'bad') throw new Error('nope');
      return fakeBuffer(1);
    });
    const [x, y] = await Promise.all([cache.load('ok'), cache.load('ok')]);
    expect(x).toBe(y);
    expect(calls).toBe(1);
    const warn = console.warn;
    console.warn = () => {};
    expect(await cache.load('bad')).toBeNull();
    console.warn = warn;
    expect(cache.state('bad')).toBe('failed');
    expect(await cache.load('bad')).toBeNull();
    expect(calls).toBe(2);
  });

  it('keeps a single clip bigger than the budget rather than nothing', async () => {
    const cache = new AudioBufferCache(async () => fakeBuffer(50), 40 * MB);
    await cache.load('huge');
    expect(cache.state('huge')).toBe('ready');
  });
});

describe('VoiceLibrary', () => {
  const station = stationById('void-beats')!;
  const manifest: VoiceManifest = {
    version: 1,
    station: 'void-beats',
    clips: [{ id: 'id-1', category: 'id', url: '/voice/void-beats/id-1.mp3', durationMs: 4000, overMusic: true, lines: [] }],
  };
  const response = (body: string, status = 200) => new Response(body, { status });

  it('treats 404s and HTML fallbacks as "no clips"', async () => {
    const library = new VoiceLibrary(async (url) =>
      url.endsWith('_shared.json') ? response('nope', 404) : response('<!doctype html><title>app</title>'),
    );
    expect(library.isLoaded('void-beats')).toBe(false);
    await library.load('void-beats');
    expect(library.isLoaded('void-beats')).toBe(true);
    expect(library.schedule(station).hasVoice).toBe(false);
  });

  it('builds schedules from loaded manifests and notifies listeners', async () => {
    const library = new VoiceLibrary(async (url) =>
      url.endsWith('void-beats.json') ? response(JSON.stringify(manifest)) : response('', 404),
    );
    let changes = 0;
    library.subscribe(() => changes++);
    const before = library.schedule(station);
    expect(before.hasVoice).toBe(false);
    await library.load('void-beats');
    expect(changes).toBeGreaterThan(0);
    const after = library.schedule(station);
    expect(after).not.toBe(before);
    expect(after.hasVoice).toBe(true);
    expect(library.schedule(station)).toBe(after); // cached until something changes
  });

  it('retries after network errors but keeps what it had', async () => {
    let fail = true;
    let fetches = 0;
    const library = new VoiceLibrary(async () => {
      fetches++;
      if (fail) throw new TypeError('offline');
      return response(JSON.stringify(manifest));
    });
    await library.load('void-beats');
    expect(library.isLoaded('void-beats')).toBe(true);
    expect(library.schedule(station).hasVoice).toBe(false);
    fail = false;
    await library.load('void-beats'); // still inside the retry window: no refetch
    expect(fetches).toBe(2);
  });

  it('lets overrides replace manifests (the lab’s fake-voice mode)', () => {
    const library = new VoiceLibrary(async () => response('', 404));
    library.setOverride('void-beats', manifest);
    library.setOverride('_shared', null);
    expect(library.isLoaded('void-beats')).toBe(true);
    expect(library.schedule(station).hasVoice).toBe(true);
    library.clearOverrides();
    expect(library.schedule(station).hasVoice).toBe(false);
  });
});

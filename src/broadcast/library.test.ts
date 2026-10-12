import { describe, expect, it } from 'vitest';
import { stationById } from '../stations/roster';
import { AudioBufferCache, bufferBytes } from './audioCache';
import { oddities, pirates } from './dial';
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

  it('gives pirates the pirate pool (in their host’s name) and oddities their own clips', async () => {
    const pool = (station: string, clips: object[]) => JSON.stringify({ version: 1, station, clips });
    const line = (speaker: string, text: string) => ({ speaker, text, startMs: 0 });
    const files: Record<string, string> = {
      '_pirate.json': pool('_pirate', [
        { id: 'id-1', category: 'id', url: '/voice/_pirate/id-1.mp3', durationMs: 4000, lines: [line('Pirate DJ', 'Hi'), line('Caller', 'Yo')] },
        { id: 'dj-1', category: 'dj', url: '/voice/_pirate/dj-1.mp3', durationMs: 12000, lines: [line('Pirate DJ', 'Next')] },
      ]),
      '_oddities.json': pool('_oddities', [
        { id: 'time-signal-001', category: 'id', url: '/voice/_oddities/time-signal-001.mp3', durationMs: 4000, lines: [] },
        { id: 'time-signal-002', category: 'dj', url: '/voice/_oddities/time-signal-002.mp3', durationMs: 6000, lines: [] },
        { id: 'distress-beacon-001', category: 'id', url: '/voice/_oddities/distress-beacon-001.mp3', durationMs: 4000, lines: [] },
        { id: 'any', category: 'dj', url: '/voice/_oddities/any.mp3', durationMs: 9000, lines: [] },
      ]),
      '_shows.json': JSON.stringify({ version: 1, shows: { 'void-beats': [{ id: 'late', name: 'Late', blurb: '', start: 22, end: 2 }] } }),
    };
    const fetched: string[] = [];
    const library = new VoiceLibrary(async (url) => {
      const name = url.split('/').pop()!;
      fetched.push(name);
      return files[name] ? response(files[name]) : response('', 404);
    });
    const pirate = pirates()[0]!.station;
    await library.load(pirate.id);
    expect(fetched).toEqual(['_pirate.json']);
    const segments = library.schedule(pirate).segmentsBetween(Date.UTC(2026, 9, 12), Date.UTC(2026, 9, 12, 2));
    const spoken = segments.flatMap((s) => (s.kind === 'voice' ? s.clip.lines : []));
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken.filter((l) => l.speaker === pirate.host.name).length).toBeGreaterThan(0);
    expect(spoken.some((l) => l.speaker === 'Pirate DJ')).toBe(false);
    expect(spoken.some((l) => l.speaker === 'Caller')).toBe(true);

    const pips = oddities().find((o) => o.oddity === 'time-signal')!.station;
    await library.load(pips.id);
    const heard = new Set(
      library
        .schedule(pips)
        .segmentsBetween(Date.UTC(2026, 9, 12), Date.UTC(2026, 9, 12, 6))
        .flatMap((s) => (s.kind === 'voice' ? [s.clip.id] : [])),
    );
    expect(heard.has('distress-beacon-001')).toBe(false);
    expect(heard.has('time-signal-001') || heard.has('time-signal-002')).toBe(true);

    expect(library.shows('void-beats')).toEqual([]);
    await library.loadShows();
    expect(library.shows('void-beats').map((s) => s.id)).toEqual(['late']);
    expect(library.schedule(station).shows.map((s) => s.id)).toEqual(['late']);
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

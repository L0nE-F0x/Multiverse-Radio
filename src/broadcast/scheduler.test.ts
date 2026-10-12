import { describe, expect, it } from 'vitest';
import { STATIONS, stationById } from '../stations/roster';
import { parseManifest } from './manifest';
import {
  HOUR_MS,
  StationSchedule,
  daypartForHour,
  joinOffset,
  segmentAt,
  segmentsBetween,
  skipOffset,
  type StationClips,
} from './scheduler';
import type { Daypart, Segment, StationDef, VoiceCategory, VoiceClip } from './types';

const utcDaypart = (ms: number): Daypart => daypartForHour(new Date(ms).getUTCHours());
const opts = { daypartOf: utcDaypart };

// 2026-10-12T00:00:00Z — a UTC midnight, so hours 0..23 below share one day.
const DAY0 = Date.UTC(2026, 9, 12);
const HOUR0 = DAY0 / HOUR_MS;

function station(id: string): StationDef {
  const s = stationById(id);
  if (!s) throw new Error(`no station ${id}`);
  return s;
}

const RANGES: Record<VoiceCategory, [number, number]> = {
  id: [2, 8],
  dj: [8, 30],
  ad: [15, 45],
  news: [20, 90],
  weather: [15, 60],
  psa: [10, 40],
  call: [30, 120],
  sports: [20, 90],
  story: [30, 120],
  show: [45, 180],
  interrupt: [3, 12],
};

let serial = 0;
function clips(owner: string, category: VoiceCategory, count: number, extra: Partial<VoiceClip> = {}): VoiceClip[] {
  const [lo, hi] = RANGES[category];
  return Array.from({ length: count }, (_, i) => {
    const n = ++serial;
    return {
      id: `${category}-${String(i).padStart(3, '0')}-${n}`,
      category,
      url: `/voice/${owner}/${category}-${n}.mp3`,
      durationMs: Math.round((lo + ((i * 7919) % 97) / 97 * (hi - lo)) * 1000),
      overMusic: category === 'id' || category === 'dj' || category === 'interrupt',
      lines: [
        { speaker: 'Host', text: `${category} ${i} line one`, startMs: 0 },
        { speaker: 'Host', text: `${category} ${i} line two`, startMs: 1500 },
      ],
      ...extra,
    };
  });
}

function library(stationId: string): StationClips {
  return {
    own: [
      ...clips(stationId, 'id', 12),
      ...clips(stationId, 'dj', 30),
      ...clips(stationId, 'news', 10),
      ...clips(stationId, 'weather', 8),
      ...clips(stationId, 'call', 10),
      ...clips(stationId, 'story', 10),
      ...clips(stationId, 'show', 4),
    ],
    shared: [...clips('_shared', 'ad', 30), ...clips('_shared', 'psa', 8), ...clips('_shared', 'interrupt', 6)],
  };
}

function checkContiguous(segments: Segment[], from: number, to: number) {
  expect(segments[0]!.startMs).toBe(from);
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    expect(segments[i]!.startMs).toBe(prev.startMs + prev.durationMs);
    expect(segments[i]!.durationMs).toBeGreaterThan(0);
  }
  const last = segments[segments.length - 1]!;
  expect(last.startMs + last.durationMs).toBe(to);
}

function musicShare(segments: Segment[]): number {
  let music = 0;
  let total = 0;
  for (const s of segments) {
    total += s.durationMs;
    if (s.kind === 'track') music += s.durationMs;
  }
  return music / total;
}

describe('scheduler', () => {
  it('is deterministic', () => {
    for (const s of STATIONS) {
      const lib = library(s.id);
      const a = segmentsBetween(s, lib, DAY0 + 5 * HOUR_MS, DAY0 + 8 * HOUR_MS, opts);
      const b = segmentsBetween(s, lib, DAY0 + 5 * HOUR_MS, DAY0 + 8 * HOUR_MS, opts);
      expect(a).toEqual(b);
      // Asking for a later hour first (cold cache) gives the same answer.
      const cold = new StationSchedule(s, lib, opts);
      const late = cold.hour(HOUR0 + 7);
      expect(late).toEqual(new StationSchedule(s, lib, opts).hour(HOUR0 + 7));
      expect(segmentAt(s, lib, DAY0 + 6.5 * HOUR_MS, opts)).toEqual(
        a.find((x) => x.startMs <= DAY0 + 6.5 * HOUR_MS && x.startMs + x.durationMs > DAY0 + 6.5 * HOUR_MS),
      );
    }
  });

  it('is contiguous within and across hour boundaries, with stable ids', () => {
    for (const s of STATIONS) {
      const schedule = new StationSchedule(s, library(s.id), opts);
      const from = DAY0 + 20 * HOUR_MS;
      const to = DAY0 + 28 * HOUR_MS; // crosses UTC midnight too
      const segments = schedule.segmentsBetween(from, to);
      checkContiguous(segments, from, to);
      expect(new Set(segments.map((x) => x.id)).size).toBe(segments.length);
      for (let h = 20; h < 28; h++) {
        const hour = schedule.hour(HOUR0 + h);
        checkContiguous(hour, DAY0 + h * HOUR_MS, DAY0 + (h + 1) * HOUR_MS);
        // The hard clock: every hour ends with music fitted to the top of the hour.
        expect(hour[hour.length - 1]!.kind).toBe('track');
      }
    }
  });

  it('starts every hour with an ident', () => {
    for (const s of STATIONS) {
      const schedule = new StationSchedule(s, library(s.id), opts);
      for (let h = 0; h < 30; h++) {
        const first = schedule.hour(HOUR0 + h)[0]!;
        expect(first.startMs).toBe(DAY0 + h * HOUR_MS);
        expect(first.kind === 'voice' && first.clip.category).toBe('id');
      }
    }
  });

  it('keeps each format roughly in its time ratio', () => {
    const shares: Record<string, number[]> = { music: [], mixed: [], talk: [], ambient: [] };
    for (const s of STATIONS) {
      const segments = segmentsBetween(s, library(s.id), DAY0, DAY0 + 24 * HOUR_MS, opts);
      shares[s.format]!.push(musicShare(segments));
    }
    for (const share of shares.music!) expect(share).toBeGreaterThan(0.8);
    for (const share of shares.mixed!) {
      expect(share).toBeGreaterThan(0.38);
      expect(share).toBeLessThan(0.62);
    }
    for (const share of shares.talk!) {
      expect(share).toBeGreaterThan(0.05);
      expect(share).toBeLessThan(0.4);
    }
    for (const share of shares.ambient!) expect(share).toBeGreaterThan(0.97);
  });

  it('follows the music clock: track lengths, host links, ad breaks and idents', () => {
    const s = station('void-beats');
    const schedule = new StationSchedule(s, library(s.id), opts);
    for (let h = 0; h < 24; h++) {
      const hour = schedule.hour(HOUR0 + h);
      const tracks = hour.filter((x) => x.kind === 'track');
      const voices = hour.filter((x) => x.kind === 'voice');
      for (const t of tracks.slice(0, -1)) {
        expect(t.durationMs).toBeGreaterThanOrEqual(150_000);
        expect(t.durationMs).toBeLessThanOrEqual(360_000);
      }
      const ids = voices.filter((v) => v.clip.category === 'id').length;
      expect(ids).toBeGreaterThanOrEqual(3);
      expect(ids).toBeLessThanOrEqual(5);
      const ads = voices.filter((v) => v.clip.category === 'ad').length;
      expect(ads).toBeGreaterThanOrEqual(2);
      expect(ads).toBeLessThanOrEqual(4);
      const links = voices.filter((v) => v.clip.category !== 'id' && v.clip.category !== 'ad').length;
      expect(links).toBeGreaterThanOrEqual(3);
      // Never more than three tracks in a row without a voice.
      let run = 0;
      for (const x of hour) {
        run = x.kind === 'track' ? run + 1 : 0;
        expect(run).toBeLessThanOrEqual(3);
      }
    }
  });

  it('separates talk with short music interstitials', () => {
    const s = station('every-news');
    const schedule = new StationSchedule(s, library(s.id), opts);
    for (let h = 0; h < 12; h++) {
      const hour = schedule.hour(HOUR0 + h);
      for (const t of hour.slice(0, -1)) {
        if (t.kind === 'track') {
          expect(t.durationMs).toBeGreaterThanOrEqual(20_000);
          expect(t.durationMs).toBeLessThanOrEqual(60_000);
        }
      }
    }
  });

  it('airs at most two quiet voices an hour on ambient stations', () => {
    const s = station('whalesong');
    const schedule = new StationSchedule(s, library(s.id), opts);
    for (let h = 0; h < 48; h++) {
      const hour = schedule.hour(HOUR0 + h);
      const voices = hour.filter((x): x is Extract<Segment, { kind: 'voice' }> => x.kind === 'voice');
      expect(voices.length).toBeLessThanOrEqual(2);
      for (const v of voices) expect(v.bed).toBe(true);
      for (const t of hour.slice(0, -1)) if (t.kind === 'track') expect(t.durationMs).toBeGreaterThanOrEqual(360_000);
    }
  });

  it('rotates recipes from the recipe pool', () => {
    const s = station('channel-surf');
    const segments = segmentsBetween(s, library(s.id), DAY0, DAY0 + 6 * HOUR_MS, opts);
    const recipes = new Set(segments.flatMap((x) => (x.kind === 'track' ? [x.recipe] : [])));
    expect(recipes.size).toBeGreaterThanOrEqual(5);
    for (const r of recipes) expect(s.recipePool).toContain(r);
  });

  it('prefers clips for the listener’s daypart', () => {
    const s = station('void-beats');
    const lib: StationClips = {
      own: [
        ...clips(s.id, 'id', 6),
        ...clips(s.id, 'dj', 8, { daypart: 'morning' }),
        ...clips(s.id, 'dj', 8, { daypart: 'night' }),
        ...clips(s.id, 'dj', 4),
      ],
      shared: [],
    };
    const schedule = new StationSchedule(s, lib, opts);
    const morning = schedule.segmentsBetween(DAY0 + 6 * HOUR_MS, DAY0 + 10 * HOUR_MS);
    const night = schedule.segmentsBetween(DAY0, DAY0 + 4 * HOUR_MS);
    const parts = (segments: Segment[]) =>
      segments.flatMap((x) => (x.kind === 'voice' && x.clip.category === 'dj' ? [x.clip.daypart ?? 'any'] : []));
    expect(parts(morning).length).toBeGreaterThan(5);
    expect(parts(morning)).not.toContain('night');
    expect(parts(morning)).toContain('morning');
    expect(parts(night)).not.toContain('morning');
    expect(parts(night)).toContain('night');
    // Local time decides: the same UTC hour is "morning" for a listener 10 hours ahead.
    const ahead = new StationSchedule(s, lib, { daypartOf: (ms) => daypartForHour((new Date(ms).getUTCHours() + 10) % 24) });
    expect(parts(ahead.segmentsBetween(DAY0 - 2 * HOUR_MS, DAY0 + 1 * HOUR_MS))).not.toContain('night');
  });

  it('respects shared-pool station filters', () => {
    const s = station('void-beats');
    const lib: StationClips = {
      own: [...clips(s.id, 'id', 4), ...clips(s.id, 'dj', 10)],
      shared: [
        ...clips('_shared', 'ad', 6, { stations: ['every-news'] }),
        ...clips('_shared', 'ad', 6, { stations: ['void-beats', 'rainfall-fm'] }),
        ...clips('_shared', 'ad', 6),
        ...clips('_shared', 'id', 3), // generic shared idents never air without a claim
      ],
    };
    const segments = segmentsBetween(s, lib, DAY0, DAY0 + 12 * HOUR_MS, opts);
    const ads = segments.flatMap((x) => (x.kind === 'voice' && x.clip.category === 'ad' ? [x.clip] : []));
    expect(ads.length).toBeGreaterThan(10);
    for (const ad of ads) expect(!ad.stations || ad.stations.includes('void-beats')).toBe(true);
    const sharedIdents = new Set(lib.shared.filter((c) => c.category === 'id').map((c) => c.url));
    for (const x of segments) if (x.kind === 'voice') expect(sharedIdents.has(x.clip.url)).toBe(false);
  });

  it('does not repeat clips within a few hours', () => {
    for (const s of STATIONS) {
      const lib = library(s.id);
      const segments = segmentsBetween(s, lib, DAY0 + 2 * HOUR_MS, DAY0 + 5 * HOUR_MS, opts);
      const voices = segments.flatMap((x) => (x.kind === 'voice' ? [x.clip] : []));
      for (const category of ['dj', 'ad', 'news', 'call', 'story'] as const) {
        const urls = voices.filter((c) => c.category === category).map((c) => c.url);
        const size = [...lib.own, ...lib.shared].filter((c) => c.category === category).length;
        if (s.format === 'music' || s.format === 'ambient') {
          // Music stations need fewer clips than the library has: no repeats at all.
          expect(new Set(urls).size, `${s.id} ${category}`).toBe(urls.length);
        }
        // Talky stations cycle through: a clip comes back only after most of its category.
        for (let i = 0; i < urls.length; i++) {
          const next = urls.indexOf(urls[i]!, i + 1);
          if (next > 0) expect(next - i, `${s.id} ${category}`).toBeGreaterThanOrEqual(size / 2);
        }
      }
      // Idents (12 of them, ~4 an hour) never come back within the next six airings.
      const idents = voices.filter((c) => c.category === 'id').map((c) => c.url);
      for (let i = 0; i < idents.length; i++) expect(idents.slice(i + 1, i + 7)).not.toContain(idents[i]);
    }
  });

  it('skips to the next segment with a per-station clock offset', () => {
    const s = station('void-beats');
    const schedule = new StationSchedule(s, library(s.id), opts);
    const wall = DAY0 + 3 * HOUR_MS + 123_456;
    let offset = 0;
    let previous = schedule.segmentAt(wall);
    for (let i = 0; i < 40; i++) {
      offset = skipOffset(schedule, wall, offset);
      const now = schedule.segmentAt(wall + offset);
      expect(now.startMs).toBe(previous.startMs + previous.durationMs);
      expect(wall + offset).toBe(now.startMs);
      previous = now;
    }
    expect(offset).toBeGreaterThan(0);
  });

  it('joins at the next segment when a clip has under three seconds left', () => {
    const s = station('void-beats');
    const schedule = new StationSchedule(s, library(s.id), opts);
    const hour = schedule.hour(HOUR0 + 1);
    const voice = hour.find((x) => x.kind === 'voice' && x.durationMs > 5000)!;
    const end = voice.startMs + voice.durationMs;
    expect(joinOffset(schedule, end - 2000, 0)).toBe(2000);
    expect(joinOffset(schedule, end - 4000, 0)).toBe(0);
    const track = hour.find((x) => x.kind === 'track')!;
    expect(joinOffset(schedule, track.startMs + track.durationMs - 1000, 0)).toBe(0);
  });

  it('falls back to a deterministic music-only schedule without manifests', () => {
    for (const s of STATIONS) {
      const a = segmentsBetween(s, { own: [], shared: [] }, DAY0, DAY0 + 3 * HOUR_MS, opts);
      const b = segmentsBetween(s, [], DAY0, DAY0 + 3 * HOUR_MS, opts);
      expect(a).toEqual(b);
      checkContiguous(a, DAY0, DAY0 + 3 * HOUR_MS);
      expect(a.every((x) => x.kind === 'track')).toBe(true);
      expect(new StationSchedule(s, [], opts).hasVoice).toBe(false);
    }
  });

  it('describes music runs that carry bed clips over track intros', () => {
    const s = station('void-beats');
    const schedule = new StationSchedule(s, library(s.id), opts);
    const hour = schedule.hour(HOUR0 + 2);
    const runs = schedule.runsInHour(HOUR0 + 2);
    // The top-of-hour ident airs over the first track's intro.
    expect(runs[0]!.startMs).toBe(DAY0 + 2 * HOUR_MS);
    expect(runs[0]!.endMs).toBe(hour[1]!.startMs + hour[1]!.durationMs);
    for (const seg of hour) {
      const t = seg.startMs + 1;
      const covered = runs.some((r) => r.startMs <= t && r.endMs > t);
      if (seg.kind === 'track' || seg.bed) expect(covered).toBe(true);
      else expect(covered).toBe(false);
    }
    // A failed clip gets music instead of silence.
    const ad = hour.find((x) => x.kind === 'voice' && !x.bed)!;
    const filled = schedule.runsInHour(HOUR0 + 2, new Set([ad.id]));
    expect(filled.some((r) => r.startMs <= ad.startMs + 1 && r.endMs > ad.startMs + 1)).toBe(true);
  });

  it('parses manifests defensively', () => {
    const manifest = parseManifest({
      version: 1,
      station: 'void-beats',
      clips: [
        { id: 'a', category: 'dj', url: '/voice/void-beats/a.mp3', durationMs: 12000, lines: [{ speaker: 'X', text: 'hi', startMs: 0 }] },
        { id: 'b', category: 'nonsense', url: '/x.mp3', durationMs: 1000 },
        { id: 'c', category: 'ad', url: '/voice/_shared/c.mp3', durationMs: 'soon' },
        { id: 'd', category: 'ad', url: '/voice/_shared/d.mp3', durationMs: 20000, daypart: 'brunch', stations: ['void-beats', 4] },
      ],
    });
    expect(manifest?.clips.map((c) => c.id)).toEqual(['a', 'd']);
    expect(manifest?.clips[0]!.overMusic).toBe(true);
    expect(manifest?.clips[1]!.overMusic).toBe(false);
    expect(manifest?.clips[1]!.daypart).toBeUndefined();
    expect(manifest?.clips[1]!.stations).toEqual(['void-beats']);
    expect(parseManifest('<!doctype html>')).toBeNull();
  });
});

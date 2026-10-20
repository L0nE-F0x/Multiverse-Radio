import { artistSeed } from '../music/recipes/artist';
import { describe, expect, it } from 'vitest';
import { STATIONS, stationById } from '../stations/roster';
import { oddities } from './dial';
import { parseManifest, parseShowIndex } from './manifest';
import { hash } from './random';
import {
  HOUR_MS,
  StationSchedule,
  activeSerialForDay,
  clearSerialRegistry,
  daypartForHour,
  getSerialDirectory,
  joinOffset,
  registerSerialClips,
  segmentAt,
  segmentsBetween,
  serialEpisode,
  serialMinutes,
  skipOffset,
  type StationClips,
} from './scheduler';
import { fixedTzOffset, localMinuteToMs, localTime, showAtHour } from './time';
import type { Daypart, Segment, ShowDef, StationDef, VoiceCategory, VoiceClip, VoiceSegment } from './types';

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
  ship: [3, 20],
  event: [5, 60],
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

const voices = (segments: Segment[]) => segments.filter((x): x is VoiceSegment => x.kind === 'voice');

describe('the living schedule (v3)', () => {
  const utc = { daypartOf: utcDaypart, tzOffset: fixedTzOffset(0) };

  it('finds the show by local hour, wrapping midnight', () => {
    const late: ShowDef = { id: 'late', name: 'Late', blurb: '', start: 22, end: 2 };
    const am: ShowDef = { id: 'am', name: 'AM', blurb: '', start: 6, end: 10 };
    const shows = [late, am];
    expect(showAtHour(shows, 21)).toBeNull();
    expect(showAtHour(shows, 22)?.id).toBe('late');
    expect(showAtHour(shows, 23)?.id).toBe('late');
    expect(showAtHour(shows, 0)?.id).toBe('late');
    expect(showAtHour(shows, 1)?.id).toBe('late');
    expect(showAtHour(shows, 2)).toBeNull();
    expect(showAtHour(shows, 6)?.id).toBe('am');
    expect(showAtHour(shows, 9)?.id).toBe('am');
    expect(showAtHour(shows, 10)).toBeNull();
    expect(showAtHour([{ ...am, start: 0, end: 24 }], 23)?.id).toBe('am');
    // The listener's clock decides: 20:00 UTC is 22:00 two hours east.
    const schedule = new StationSchedule(station('void-beats'), { own: [], shared: [], shows }, { tzOffset: fixedTzOffset(120) });
    expect(schedule.showAt(DAY0 + 20 * HOUR_MS + 1)?.id).toBe('late');
    expect(schedule.showAt(DAY0 + 23.5 * HOUR_MS)?.id).toBe('late');
    expect(schedule.showAt(DAY0 + 0.5 * HOUR_MS)).toBeNull();
  });

  it('opens a show with its opener and keeps show clips inside it', () => {
    const s = station('void-beats');
    const show: ShowDef = { id: 'the-3am-hour', name: 'The 3 AM Hour', blurb: '', start: 2, end: 5 };
    const base = library(s.id);
    const lib: StationClips = {
      own: [...base.own, ...clips(s.id, 'id', 2, { show: show.id, part: 'open' }), ...clips(s.id, 'dj', 6, { show: show.id })],
      shared: base.shared,
      shows: [show],
    };
    for (const offset of [0, 330]) {
      const tz = fixedTzOffset(offset);
      const schedule = new StationSchedule(s, lib, { tzOffset: tz });
      const segments = schedule.segmentsBetween(DAY0 - 6 * HOUR_MS, DAY0 + 30 * HOUR_MS);
      const openers = voices(segments).filter((x) => x.clip.show === show.id && x.clip.part === 'open');
      expect(openers).toHaveLength(2);
      for (const o of openers) {
        const minute = localTime(o.startMs, tz).minuteOfDay;
        expect(minute).toBeGreaterThanOrEqual(120);
        expect(minute).toBeLessThan(120 + 10);
      }
      if (offset === 0) for (const o of openers) expect(o.startMs % HOUR_MS).toBe(0); // in place of the ident
      for (const x of voices(segments).filter((v) => v.clip.show)) {
        const hour = localTime(x.startMs, tz).hour;
        expect(hour >= 2 && hour < 5, `${x.clip.id} at ${hour}:00`).toBe(true);
      }
      const during = voices(segments).filter(
        (x) => x.clip.category === 'dj' && localTime(x.startMs, tz).hour >= 2 && localTime(x.startMs, tz).hour < 5,
      );
      expect(during.filter((x) => x.clip.show).length).toBeGreaterThanOrEqual(during.length / 3);
    }
  });

  it('airs one serial episode a day, two or three times, at seeded local times', () => {
    const s = station('every-news');
    const base = library(s.id);
    const episodes = [1, 2, 3, 4].map((episode) => clips(s.id, 'story', 1, { serial: { id: 'greg-comes-home', episode } })[0]!);
    const tz = fixedTzOffset(-300);
    const schedule = new StationSchedule(s, { own: [...base.own, ...episodes], shared: base.shared }, { tzOffset: tz });
    const first = localTime(DAY0 + 12 * HOUR_MS, tz).day;
    const aired: number[] = [];
    for (let day = first; day < first + 5; day++) {
      const from = localMinuteToMs(day, 0, tz);
      const airings = voices(schedule.segmentsBetween(from, from + 24 * HOUR_MS)).filter((x) => x.clip.serial);
      const minutes = serialMinutes('greg-comes-home', day);
      expect(minutes.length).toBeGreaterThanOrEqual(2);
      expect(minutes.length).toBeLessThanOrEqual(3);
      expect(airings).toHaveLength(minutes.length);
      const episode = serialEpisode([1, 2, 3, 4], day)!;
      expect(episode).toBe([1, 2, 3, 4][day % 4]);
      airings.forEach((a, i) => {
        expect(a.clip.serial!.episode).toBe(episode);
        const minute = localTime(a.startMs, tz).minuteOfDay;
        expect(minute).toBeGreaterThanOrEqual(minutes[i]!);
        expect(minute).toBeLessThan(minutes[i]! + 12);
      });
      aired.push(episode);
    }
    // The story advances a day at a time.
    for (let i = 1; i < aired.length; i++) expect(aired[i]).toBe((aired[i - 1]! % 4) + 1);
  });

  it('airs dated clips only on their day, and prefers them then', () => {
    const s = station('void-beats');
    const base = library(s.id);
    const halloween = clips(s.id, 'dj', 3, { dates: ['10-31'] });
    const schedule = new StationSchedule(s, { own: [...base.own, ...halloween], shared: base.shared }, utc);
    const oct31 = Date.UTC(2026, 9, 31);
    const dated = (from: number) => voices(schedule.segmentsBetween(from, from + 24 * HOUR_MS)).filter((x) => x.clip.dates);
    expect(dated(oct31 - 24 * HOUR_MS)).toHaveLength(0);
    expect(dated(oct31 + 24 * HOUR_MS)).toHaveLength(0);
    const on = dated(oct31);
    expect(on.length).toBeGreaterThanOrEqual(6);
    expect(new Set(on.map((x) => x.clip.url)).size).toBe(3);
  });

  it('chains modular parts: an open, one to three different bodies and a close, from one kit', () => {
    const s = station('every-news');
    const part = (owner: string, n: number, which: 'open' | 'body' | 'close', seconds: number) =>
      clips(owner, 'news', n, { part: which, kit: 'bulletin' }).map((c) => ({ ...c, durationMs: seconds * 1000 }));
    const lib: StationClips = {
      own: [
        ...clips(s.id, 'id', 12),
        ...clips(s.id, 'dj', 12),
        ...part(s.id, 5, 'open', 5),
        ...part(s.id, 12, 'body', 25),
        ...part(s.id, 5, 'close', 4),
      ],
      shared: [...clips('_shared', 'ad', 20), ...part('_shared', 3, 'open', 5), ...part('_shared', 4, 'body', 20), ...part('_shared', 3, 'close', 4)],
    };
    const segments = new StationSchedule(s, lib, utc).segmentsBetween(DAY0, DAY0 + 8 * HOUR_MS);
    const chains: VoiceClip[][] = [];
    for (let i = 0; i < segments.length; i++) {
      const x = segments[i]!;
      if (x.kind !== 'voice' || !x.clip.part) continue;
      if (x.clip.part === 'body') {
        const prev = segments[i - 1]!;
        expect(prev.kind === 'voice' && (prev.clip.part === 'open' || prev.clip.part === 'body')).toBe(true);
        continue;
      }
      if (x.clip.part !== 'open') continue;
      const chain = [x.clip];
      let j = i + 1;
      for (let y = segments[j]; y?.kind === 'voice' && y.clip.part === 'body'; y = segments[++j]) chain.push(y.clip);
      const close = segments[j]!;
      expect(close.kind === 'voice' && close.clip.part).toBe('close');
      if (close.kind === 'voice') chain.push(close.clip);
      chains.push(chain);
    }
    expect(chains.length).toBeGreaterThan(10);
    for (const chain of chains) {
      const bodies = chain.slice(1, -1);
      expect(bodies.length).toBeGreaterThanOrEqual(1);
      expect(bodies.length).toBeLessThanOrEqual(3);
      expect(new Set(bodies.map((b) => b.url)).size).toBe(bodies.length);
      const owner = chain[0]!.url.split('/')[2];
      for (const c of chain) {
        expect(c.kit).toBe('bulletin');
        expect(c.url.split('/')[2]).toBe(owner);
      }
    }
    expect(new Set(chains.map((c) => c.map((x) => x.id).join('+'))).size).toBeGreaterThan(chains.length * 0.8);
  });

  it('runs oddities on their own slow clock', () => {
    const loop = oddities().find((o) => o.oddity === 'stuck-loop')!.station;
    const segments = new StationSchedule(loop, [], { ...utc, clock: 'oddity' }).segmentsBetween(DAY0, DAY0 + 3 * HOUR_MS);
    checkContiguous(segments, DAY0, DAY0 + 3 * HOUR_MS);
    const seeds = new Set(segments.map((x) => (x.kind === 'track' ? `${x.recipe}#${x.seed}` : 'voice')));
    expect([...seeds]).toEqual([`stuck-loop#${hash(loop.id, 'loop')}`]);
    const pips = oddities().find((o) => o.oddity === 'time-signal')!.station;
    const hour = new StationSchedule(pips, [], { ...utc, clock: 'oddity' }).segmentsBetween(DAY0, DAY0 + HOUR_MS);
    for (const x of hour) expect(x.kind === 'track' && x.recipe === 'time-signal' && x.meta.title).toBe('Time signal');
  });

  it('gives every track its artist’s signature', () => {
    const s = station('void-beats');
    const schedule = new StationSchedule(s, library(s.id), utc);
    const hour = schedule.hour(HOUR0 + 3);
    for (const run of schedule.runsInHour(HOUR0 + 3)) {
      const track = hour.find((x) => x.kind === 'track' && run.id.startsWith(`${x.id}@`));
      if (track?.kind === 'track') expect(run.artist).toBe(artistSeed(track.meta.artist));
      else expect(run.artist).toBeUndefined();
    }
  });

  it('parses v3 clip fields and the show index defensively', () => {
    const manifest = parseManifest({
      version: 1,
      station: 'x',
      clips: [
        {
          id: 'a',
          category: 'news',
          url: '/a.mp3',
          durationMs: 9000,
          part: 'body',
          kit: 'bulletin',
          show: 'late',
          serial: { id: 'greg', episode: '2' },
          dates: ['10-31', 'Halloween'],
          level: 7,
          event: 'the-hum',
          trigger: 'on_pirate',
          swap_with: 'snail-jams',
          shifts: [2, 9],
        },
        { id: 'b', category: 'ship', url: '/b.mp3', durationMs: 4000, part: 'middle', serial: { id: 'x' }, event: 'nope', level: -1 },
      ],
    });
    const [a, b] = manifest!.clips;
    expect(a).toMatchObject({
      part: 'body',
      kit: 'bulletin',
      show: 'late',
      serial: { id: 'greg', episode: 2 },
      dates: ['10-31'],
      level: 3,
      event: 'the-hum',
      trigger: 'on_pirate',
      swapWith: 'snail-jams',
      shifts: [2, 9],
    });
    expect(b!.part).toBeUndefined();
    expect(b!.serial).toBeUndefined();
    expect(b!.event).toBeUndefined();
    expect(b!.level).toBe(0);
    const index = parseShowIndex({
      version: 1,
      shows: {
        'void-beats': [
          { id: 'late', name: 'Late', blurb: 'b', start: 22, end: 2 },
          { id: 'bad', name: 'Bad', start: 25, end: 2 },
          { id: 'same', name: 'Same', start: 3, end: 3 },
        ],
        nope: 'x',
      },
    });
    expect(index?.shows['void-beats']!.map((x) => x.id)).toEqual(['late']);
    expect(index?.shows.nope).toBeUndefined();
    expect(parseShowIndex('<html>')).toBeNull();
  });

  it('coordinates cross-station serials across the dial and exposes the global serial directory', () => {
    clearSerialRegistry();
    const dir = getSerialDirectory();
    expect(dir.map((s) => s.id)).toEqual([
      'bev-gets-her-song',
      'greg-comes-home',
      'teodor-is-heard',
      'the-long-dark',
      'the-new-guy',
    ]);
    const gregDir = dir.find((s) => s.id === 'greg-comes-home')!;
    expect(gregDir.totalEpisodes).toBe(13);
    expect(gregDir.episodes[0]?.stationId).toBe('whalesong');
    expect(gregDir.episodes[12]?.stationId).toBe('dimension-hop');

    // Build schedules for all 13 stations that carry parts of `greg-comes-home`.
    const gregByStation: Record<string, number[]> = {
      whalesong: [1],
      'comet-marimba': [2],
      'moon-dub': [3],
      'rainfall-fm': [4],
      'snail-jams': [5],
      'pixel-afterlife': [6],
      'mirror-polka': [7],
      'end-lounge': [8],
      'impossible-sports': [9],
      'every-news': [10],
      'ask-grenda': [11],
      'static-lullabies': [12],
      'dimension-hop': [13],
    };
    const tz = fixedTzOffset(0);
    const schedules = new Map<string, StationSchedule>();
    for (const [sid, eps] of Object.entries(gregByStation)) {
      const st = station(sid);
      const base = library(sid);
      const serialClips = eps.map(
        (episode) => clips(sid, 'story', 1, { serial: { id: 'greg-comes-home', episode } })[0]!,
      );
      schedules.set(sid, new StationSchedule(st, { own: [...base.own, ...serialClips], shared: base.shared }, { tzOffset: tz }));
    }

    const startDay = localTime(DAY0, tz).day;
    for (let day = startDay; day < startDay + 13; day++) {
      const status = activeSerialForDay('greg-comes-home', day)!;
      expect(status).not.toBeNull();
      expect(status.episode).toBe((day % 13) + 1);
      const from = localMinuteToMs(day, 0, tz);
      const to = from + 24 * HOUR_MS;
      for (const [sid, sched] of schedules) {
        const airings = voices(sched.segmentsBetween(from, to)).filter(
          (x) => x.clip.serial?.id === 'greg-comes-home',
        );
        if (sid === status.stationId) {
          expect(airings.length).toBeGreaterThanOrEqual(2);
          for (const a of airings) expect(a.clip.serial?.episode).toBe(status.episode);
        } else {
          expect(airings).toHaveLength(0);
        }
      }
    }

    // Also verify `bev-gets-her-song` on `ask-grenda` ([1, 11] of 12) does not ping-pong every day.
    const grenda = station('ask-grenda');
    const grendaBase = library(grenda.id);
    const bevClips = [1, 11].map(
      (episode) => clips(grenda.id, 'call', 1, { serial: { id: 'bev-gets-her-song', episode } })[0]!,
    );
    const grendaSched = new StationSchedule(
      grenda,
      { own: [...grendaBase.own, ...bevClips], shared: grendaBase.shared },
      { tzOffset: tz },
    );
    const bevDaysAired: number[] = [];
    for (let day = startDay; day < startDay + 12; day++) {
      const from = localMinuteToMs(day, 0, tz);
      const airings = voices(grendaSched.segmentsBetween(from, from + 24 * HOUR_MS)).filter(
        (x) => x.clip.serial?.id === 'bev-gets-her-song',
      );
      if (airings.length > 0) bevDaysAired.push((day % 12) + 1);
    }
    expect(bevDaysAired.sort((a, b) => a - b)).toEqual([1, 11]);

    // Dynamic registration (`registerSerialClips`) also coordinates custom multi-station serials.
    registerSerialClips('void-beats', clips('void-beats', 'story', 1, { serial: { id: 'custom-arc', episode: 1 } }));
    registerSerialClips('moon-dub', clips('moon-dub', 'story', 1, { serial: { id: 'custom-arc', episode: 2 } }));
    expect(activeSerialForDay('custom-arc', 0)?.stationId).toBe('void-beats');
    expect(activeSerialForDay('custom-arc', 1)?.stationId).toBe('moon-dub');
    clearSerialRegistry();
  }, 20_000);

  it('airs show closers near the end of a show’s final hour instead of dropping them', () => {
    const s = station('void-beats');
    const show: ShowDef = { id: 'the-3am-hour', name: 'The 3 AM Hour', blurb: '', start: 2, end: 5 };
    const base = library(s.id);
    const openers = clips(s.id, 'id', 2, { show: show.id, part: 'open' });
    const closers = clips(s.id, 'id', 2, { show: show.id, part: 'close' });
    const showLinks = clips(s.id, 'dj', 8, { show: show.id });
    const lib: StationClips = {
      own: [...base.own, ...openers, ...closers, ...showLinks],
      shared: base.shared,
      shows: [show],
    };
    for (const offset of [0, 330]) {
      const tz = fixedTzOffset(offset);
      const schedule = new StationSchedule(s, lib, { tzOffset: tz });
      const segments = schedule.segmentsBetween(DAY0, DAY0 + 24 * HOUR_MS);
      const airedClosers = voices(segments).filter((x) => x.clip.show === show.id && x.clip.part === 'close');
      expect(airedClosers.length).toBeGreaterThanOrEqual(1);
      for (const c of airedClosers) {
        const local = localTime(c.startMs, tz);
        // Must air in the final hour of the show (04:00..05:00 local), near the end of the show.
        expect(local.hour).toBe(4);
        expect(local.minuteOfDay).toBeGreaterThanOrEqual(4 * 60 + 48);
        expect(local.minuteOfDay).toBeLessThan(5 * 60);
      }
    }
  });

  it('protects guest-host takeover shows from airing clips voiced by the displaced primary host', () => {
    const s = station('end-lounge');
    const show: ShowDef = {
      id: 'vespers-hour',
      name: 'The Vespers Hour',
      blurb: '',
      start: 2,
      end: 4,
      host: 'Brother Paul',
    };
    const primaryHostDj = clips(s.id, 'dj', 10, {
      lines: [{ speaker: s.host.name, text: 'Primary host here.', startMs: 0 }],
    });
    const primaryHostIdents = clips(s.id, 'id', 4, {
      lines: [{ speaker: s.host.name, text: 'Station ident.', startMs: 0 }],
    });
    const takeoverOpen = clips(s.id, 'id', 1, {
      show: show.id,
      part: 'open',
      lines: [{ speaker: s.host.name, text: 'Handing over to Brother Paul.', startMs: 0 }],
    });
    const takeoverClose = clips(s.id, 'id', 1, {
      show: show.id,
      part: 'close',
      lines: [{ speaker: 'Brother Paul', text: 'Goodnight from Vespers.', startMs: 0 }],
    });
    const takeoverDj = clips(s.id, 'dj', 6, {
      show: show.id,
      lines: [{ speaker: 'Brother Paul', text: 'Brother Paul speaking.', startMs: 0 }],
    });
    const tz = fixedTzOffset(0);
    const schedule = new StationSchedule(
      s,
      {
        own: [...primaryHostDj, ...primaryHostIdents, ...takeoverOpen, ...takeoverClose, ...takeoverDj],
        shared: [],
        shows: [show],
      },
      { tzOffset: tz },
    );

    const duringShow = voices(schedule.segmentsBetween(DAY0 + 2 * HOUR_MS, DAY0 + 4 * HOUR_MS));
    expect(duringShow.length).toBeGreaterThan(4);
    for (const seg of duringShow) {
      // Every clip during the takeover show must belong to the show (never a general primary-host clip).
      expect(seg.clip.show).toBe(show.id);
    }
    expect(duringShow.some((seg) => seg.clip.part === 'open')).toBe(true);
    expect(duringShow.some((seg) => seg.clip.part === 'close')).toBe(true);

    // Outside the takeover show, the primary host's general clips air as usual.
    const outsideShow = voices(schedule.segmentsBetween(DAY0 + 5 * HOUR_MS, DAY0 + 8 * HOUR_MS));
    expect(outsideShow.length).toBeGreaterThan(4);
    expect(outsideShow.some((seg) => primaryHostDj.includes(seg.clip))).toBe(true);
  });

  it('gates storyline continuity clips by completed shifts (`clip.shifts`) and parses shifts in manifests', () => {
    const parsed = parseManifest({
      version: 1,
      station: 'waystation-9',
      clips: [
        { id: 'early', category: 'dj', url: '/early.mp3', durationMs: 10000, shifts: [0, 1] },
        { id: 'late', category: 'dj', url: '/late.mp3', durationMs: 10000, shifts: [4, 999] },
        { id: 'bad1', category: 'dj', url: '/bad1.mp3', durationMs: 10000, shifts: [-1, 2] },
        { id: 'bad2', category: 'dj', url: '/bad2.mp3', durationMs: 10000, shifts: [5, 2] },
        { id: 'bad3', category: 'dj', url: '/bad3.mp3', durationMs: 10000, shifts: [1] },
      ],
    })!;
    expect(parsed.clips[0]!.shifts).toEqual([0, 1]);
    expect(parsed.clips[1]!.shifts).toEqual([4, 999]);
    expect(parsed.clips[2]!.shifts).toBeUndefined();
    expect(parsed.clips[3]!.shifts).toBeUndefined();
    expect(parsed.clips[4]!.shifts).toBeUndefined();

    const s = station('waystation-9');
    const earlyClips = clips(s.id, 'dj', 8, { shifts: [0, 1] });
    const midClips = clips(s.id, 'dj', 8, { shifts: [2, 3] });
    const lateClips = clips(s.id, 'dj', 8, { shifts: [4, 999] });
    const idents = clips(s.id, 'id', 4);
    let currentShifts = 0;
    const schedule = new StationSchedule(
      s,
      { own: [...earlyClips, ...midClips, ...lateClips, ...idents], shared: [] },
      { ...utc, shifts: () => currentShifts },
    );

    const djAtShift = (shiftCount: number) => {
      currentShifts = shiftCount;
      return voices(schedule.segmentsBetween(DAY0, DAY0 + 4 * HOUR_MS)).filter((v) => v.clip.category === 'dj');
    };

    const at0 = djAtShift(0);
    expect(at0.length).toBeGreaterThan(0);
    for (const v of at0) expect(v.clip.shifts).toEqual([0, 1]);

    const at2 = djAtShift(2);
    expect(at2.length).toBeGreaterThan(0);
    for (const v of at2) expect(v.clip.shifts).toEqual([2, 3]);

    const at5 = djAtShift(5);
    expect(at5.length).toBeGreaterThan(0);
    for (const v of at5) expect(v.clip.shifts).toEqual([4, 999]);
  });
});

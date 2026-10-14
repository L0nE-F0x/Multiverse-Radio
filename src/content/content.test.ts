import { describe, expect, it } from 'vitest';
import { ODDITY_IDS, RECIPE_IDS } from '../broadcast/types';
import { STATIONS } from '../stations/roster';
import { BANNED_WORDS, findBanned } from './banned';
import { expand, expandUntil } from './grammar';
import { dimensionWeather, LIMITS, listenerMessage, receptionReport, tickerLines, trackMeta } from './index';
import { RECIPE_PACKS, STATION_PACKS } from './packs';
import { Rng, rngFor } from './rng';

const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);

function expectClean(text: string, context: string) {
  expect(text.trim().length, `${context}: empty`).toBeGreaterThan(0);
  expect(findBanned(text), `${context}: banned word in "${text}"`).toBeNull();
  expect(text, `${context}: unexpanded grammar token`).not.toMatch(/#[a-zA-Z@]/);
  expect(text, `${context}: doubled space`).not.toMatch(/ {2}/);
}

// TODO(v4 integration): stations and recipes whose packs the v4 writers haven't delivered yet.
const V4_PENDING = new Set<string>([
  'saturday-night-forever', 'substation-null',
  'velvet-collapse', 'heat-death-afterparty', 'minute-between', 'the-harbour',
  'something-listening', 'disco', 'space-funk', 'warehouse-techno', 'heat-death-house',
  'court-bed', 'theatre-organ', 'traffic-bed', 'pirate-bed',
]);

describe('rng', () => {
  it('is deterministic and roughly uniform', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('grammar', () => {
  const g = { animal: ['moth', 'owl'], line: ['a #animal#'], saved: ['#x=animal# and #@x.upper#'], word: ['Polka'] };

  it('expands rules, remembers values and applies modifiers', () => {
    expect(['a moth', 'a owl']).toContain(expand(g, new Rng(1), '#line#'));
    expect(expand(g, new Rng(2), '#saved#')).toMatch(/^(moth and MOTH|owl and OWL)$/);
    expect(expand(g, new Rng(3), '#word.mirror#')).toBe('Aklop');
    expect(expand(g, new Rng(3), '#animal.a#')).toMatch(/^(a moth|an owl)$/);
    const article = (word: string) => expand({ w: [word] }, new Rng(1), '#w.a#');
    expect(['used planet', 'unicorn', 'one-way door', 'euphonium', 'utility moon', 'uranium tea'].map(article)).toEqual([
      'a used planet', 'a unicorn', 'a one-way door', 'a euphonium', 'a utility moon', 'a uranium tea',
    ]);
    expect(['owl', 'umbrella', 'hour', 'unexpected guest', 'auction', 'inexact clock', 'uninvited moth', 'onerous task', 'urban fox'].map(article)).toEqual([
      'an owl', 'an umbrella', 'an hour', 'an unexpected guest', 'an auction', 'an inexact clock', 'an uninvited moth', 'an onerous task', 'an urban fox',
    ]);
  });

  it('throws on unknown rules and falls back when nothing fits', () => {
    expect(() => expand(g, new Rng(1), '#nope#')).toThrow();
    expect(expandUntil(g, (i) => rngFor(i), '#line#', () => false, 'fallback')).toBe('fallback');
  });
});

describe('trackMeta', () => {
  it('is deterministic per station and seed', () => {
    for (const s of STATIONS) {
      for (const seed of SEEDS.slice(0, 20)) expect(trackMeta(s, seed)).toEqual(trackMeta(s, seed));
    }
  });

  it('produces clean text within length limits for every station', () => {
    for (const s of STATIONS) {
      for (const seed of SEEDS) {
        const m = trackMeta(s, seed);
        const ctx = `${s.id}#${seed}`;
        expectClean(m.title, `${ctx} title`);
        expectClean(m.artist, `${ctx} artist`);
        expect(m.title.length, ctx).toBeLessThanOrEqual(LIMITS.title);
        expect(m.artist.length, ctx).toBeLessThanOrEqual(LIMITS.artist);
        if (m.album !== undefined) {
          expectClean(m.album, `${ctx} album`);
          expect(m.album.length, ctx).toBeLessThanOrEqual(LIMITS.album);
        }
        if (m.note !== undefined) {
          expectClean(m.note, `${ctx} note`);
          expect(m.note.length, ctx).toBeLessThanOrEqual(LIMITS.note);
        }
      }
    }
  });

  it('rarely repeats a title on the same station', () => {
    // Effective vocabulary = 1 / P(two random tracks share a title), estimated from
    // collisions. 2,000+ keeps the chance of any repeat within ~45 tracks (three hours)
    // to about a third or less. Talk-station beds air rarely and may be smaller.
    const n = 3000;
    for (const s of STATIONS) {
      const counts = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const t = trackMeta(s, i * 104_729 + 7).title;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      let pairs = 0;
      for (const c of counts.values()) pairs += c * (c - 1);
      const effective = pairs === 0 ? Infinity : (n * (n - 1)) / pairs;
      expect(effective, s.id).toBeGreaterThan(s.format === 'talk' ? 50 : 2000);
    }
  });

  it('pairs titles with an explicit recipe', () => {
    const surf = STATIONS.find((s) => s.id === 'channel-surf');
    expect(surf).toBeDefined();
    for (const recipe of RECIPE_IDS) {
      const m = trackMeta(surf!, 99, recipe);
      expectClean(m.title, `channel-surf/${recipe}`);
    }
  });

  it('has a pack for every music, mixed and ambient station and every recipe', () => {
    // TODO(v4 integration): drop the V4_PENDING exemption once the v4 writers' packs land.
    for (const s of STATIONS) if (s.format !== 'talk' && !V4_PENDING.has(s.id)) expect(STATION_PACKS[s.id], s.id).toBeDefined();
    // Oddities are named by the scheduler itself ("Line-up tone, 1 kHz"), not by packs.
    const oddities = new Set<string>(ODDITY_IDS);
    for (const r of RECIPE_IDS) if (!oddities.has(r) && !V4_PENDING.has(r)) expect(RECIPE_PACKS[r], r).toBeDefined();
  });
});

describe('tickerLines', () => {
  it('returns the requested number of distinct, clean, short lines', () => {
    for (const s of STATIONS) {
      for (const seed of SEEDS.slice(0, 60)) {
        const lines = tickerLines(s, seed, 8);
        expect(lines).toHaveLength(8);
        expect(new Set(lines).size).toBe(8);
        for (const l of lines) {
          expectClean(l, `${s.id} ticker`);
          expect(l.length, l).toBeLessThanOrEqual(LIMITS.ticker);
        }
      }
    }
  });

  it('is deterministic and handles zero', () => {
    const s = STATIONS[0]!;
    expect(tickerLines(s, 5, 6)).toEqual(tickerLines(s, 5, 6));
    expect(tickerLines(s, 5, 0)).toEqual([]);
  });
});

describe('listenerMessage', () => {
  it('is deterministic, clean and within limits', () => {
    for (const s of STATIONS) {
      for (const seed of SEEDS.slice(0, 120)) {
        const m = listenerMessage(s, seed);
        expect(m).toEqual(listenerMessage(s, seed));
        expectClean(m.from, `${s.id} from`);
        expectClean(m.where, `${s.id} where`);
        expectClean(m.text, `${s.id} text`);
        expect(m.from.length).toBeLessThanOrEqual(LIMITS.listenerFrom);
        expect(m.where.length).toBeLessThanOrEqual(LIMITS.listenerWhere);
        expect(m.text.length).toBeLessThanOrEqual(LIMITS.listenerText);
      }
    }
  });
});

describe('receptionReport', () => {
  it('reports a percentage and a reason', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const r = receptionReport(seed);
      expect(r).toBe(receptionReport(seed));
      expect(r).toMatch(/^(\d{1,3})% — \S/);
      const pct = Number(r.split('%')[0]);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
      expect(r.length).toBeLessThanOrEqual(LIMITS.reception);
      expectClean(r, 'reception');
      seen.add(r);
    }
    expect(seen.size).toBeGreaterThan(SEEDS.length * 0.6);
  });
});

describe('dimensionWeather', () => {
  it('is deterministic, clean and within limits', () => {
    for (const s of STATIONS) {
      for (const seed of SEEDS.slice(0, 80)) {
        const w = dimensionWeather(s, seed);
        expect(w).toBe(dimensionWeather(s, seed));
        expectClean(w, `${s.id} weather`);
        expect(w.length).toBeLessThanOrEqual(LIMITS.weather);
      }
    }
  });

  it('never forecasts sunshine for the Damp Dimension', () => {
    const rain = STATIONS.find((s) => s.id === 'rainfall-fm')!;
    for (const seed of SEEDS) expect(dimensionWeather(rain, seed)).not.toMatch(/sunny|clear skies/i);
  });
});

describe('banned words', () => {
  it('matches on word boundaries only', () => {
    expect(findBanned('a trick of the light')).toBeNull();
    expect(findBanned('Brick by brick')).toBeNull();
    expect(findBanned('Morty and friends')).toBe('Morty');
    expect(BANNED_WORDS.length).toBeGreaterThan(50);
  });
});

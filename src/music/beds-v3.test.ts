// Behaviour of the v3 beds and oddities beyond the generic recipe checks in recipes.test.ts.
import { describe, expect, it } from 'vitest';
import { compose } from './recipes';
import type { Score } from './score';

const BEDS = ['cooking-bed', 'horoscope-bed', 'noir-bed', 'quiz-bed', 'sleep-bed', 'kids-bed', 'community-bed', 'brass-band', 'trucker-country'] as const;

const inst = (s: Score, name: string) => s.instruments.findIndex((i) => i.name === name);

describe('v3 beds', () => {
  for (const recipe of BEDS) {
    it(`${recipe} has an intro and an ending at every length`, () => {
      for (const durationSeconds of [12, 60, 600]) {
        const s = compose({ recipe, seed: 5, durationSeconds });
        if (s.bars >= 5) {
          expect(s.sections[0]!.name, `${recipe} ${durationSeconds}s`).toMatch(/intro|fanfare/);
          expect(s.sections[s.sections.length - 1]!.name).toBe('outro');
        }
        // Something sounds in the last few seconds (a proper ending, not a dead tail).
        const lastStart = Math.max(...s.events.map((e) => e.t));
        expect(lastStart, `${recipe} ${durationSeconds}s`).toBeGreaterThan(durationSeconds - Math.max(4, durationSeconds * 0.12));
      }
    });

    it(`${recipe} stays light enough for the CPU`, () => {
      const s = compose({ recipe, seed: 9, durationSeconds: 600 });
      expect(s.instruments.length).toBeLessThanOrEqual(10);
      expect(s.events.length / 600).toBeLessThan(25);
    });
  }

  it('the quiz climbs a semitone each round', () => {
    const s = compose({ recipe: 'quiz-bed', seed: 3, durationSeconds: 300 });
    expect(s.sections.some((x) => x.name.includes('(+2)'))).toBe(true);
  });
});

describe('oddities', () => {
  it('the distress beacon never sends SOS', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = compose({ recipe: 'distress-beacon', seed, durationSeconds: 60 });
      expect(s.progression).not.toMatch(/S|O/);
    }
  });

  it('the time signal pips once a (local) second, skipping the 59th, with a long pip on the minute', () => {
    const s = compose({ recipe: 'time-signal', seed: 7, durationSeconds: 150 });
    const pips = s.events.filter((e) => e.i === inst(s, 'Pips'));
    const second = 60 / s.bpm;
    const gaps = pips.slice(1).map((e, k) => e.t - pips[k]!.t);
    for (const g of gaps) expect([1, 2].some((n) => Math.abs(g - n * second) < 1e-6)).toBe(true);
    expect(gaps.filter((g) => g > second * 1.5).length).toBeGreaterThanOrEqual(2);
    const long = pips.filter((e) => e.d > 0.3);
    expect(long.length).toBeGreaterThanOrEqual(2);
    // The long pip comes right after the silent second.
    for (const l of long) expect(pips.some((e) => Math.abs(l.t - e.t - 2 * second) < 1e-6)).toBe(true);
  });

  it('the stuck loop repeats exactly, with a splice click at each loop point', () => {
    const s = compose({ recipe: 'stuck-loop', seed: 4, durationSeconds: 120 });
    const loop = s.barDur * 4;
    const click = inst(s, 'Splice');
    const clicks = s.events.filter((e) => e.i === click);
    expect(clicks.length).toBeGreaterThanOrEqual(Math.floor(120 / loop) - 2);
    const musical = s.events.filter((e) => e.i !== click && s.instruments[e.i]!.patch !== 'hiss');
    const first = musical.filter((e) => e.t < loop).map((e) => [e.i, e.p, e.v, +e.d.toFixed(6), +e.t.toFixed(6)].join());
    const second = musical.filter((e) => e.t >= loop && e.t < 2 * loop).map((e) => [e.i, e.p, e.v, +e.d.toFixed(6), +(e.t - loop).toFixed(6)].join());
    expect(second).toEqual(first);
  });

  it('the test tone changes level now and then', () => {
    const levels = new Set<number>();
    for (let seed = 0; seed < 6; seed++) {
      const s = compose({ recipe: 'test-tone', seed, durationSeconds: 300 });
      for (const e of s.events) if (s.instruments[e.i]!.name === 'Tone (right)') levels.add(+e.v.toFixed(3));
    }
    expect(levels.size).toBeGreaterThanOrEqual(3);
  });
});

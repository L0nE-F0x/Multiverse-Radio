import { describe, expect, it } from 'vitest';
import { RECIPE_IDS, type RecipeId } from '../broadcast/types';
import { STATIONS } from '../stations/roster';
import { RECIPE_INFO, type TrackRequest } from './index';
import { compose } from './recipes';
import { SYNTHS } from './dsp/synths';
import { PATCHES } from './dsp/patches';

function fingerprint(req: TrackRequest): string {
  const s = compose(req);
  let h = 2166136261;
  const mix = (x: number) => {
    h = Math.imul(h ^ Math.round(x * 1e6), 16777619) >>> 0;
  };
  for (const e of s.events) {
    mix(e.t);
    mix(e.d);
    mix(e.i);
    mix(e.p);
    mix(e.v);
  }
  return `${s.key}|${s.bpm.toFixed(4)}|${s.events.length}|${h}`;
}

describe('every recipe', () => {
  for (const recipe of RECIPE_IDS) {
    describe(recipe, () => {
      it('has lab/UI info', () => {
        expect(RECIPE_INFO[recipe]?.label).toBeTruthy();
        expect(RECIPE_INFO[recipe]?.description).toBeTruthy();
      });

      for (const durationSeconds of [12, 45, 150, 420]) {
        it(`composes a valid ${durationSeconds}s track`, () => {
          const s = compose({ recipe, seed: 1234 + durationSeconds, durationSeconds });
          expect(s.recipe).toBe(recipe);
          expect(s.events.length).toBeGreaterThan(durationSeconds > 20 ? 20 : 3);
          let prev = 0;
          for (const e of s.events) {
            expect(e.t).toBeGreaterThanOrEqual(prev);
            prev = e.t;
            expect(e.t).toBeGreaterThanOrEqual(0);
            expect(e.t).toBeLessThan(durationSeconds);
            expect(e.t + e.d).toBeLessThanOrEqual(durationSeconds + 1e-6);
            expect(e.d).toBeGreaterThan(0);
            expect(e.v).toBeGreaterThan(0);
            expect(e.v).toBeLessThanOrEqual(1);
            expect(Number.isFinite(e.p)).toBe(true);
            expect(s.instruments[e.i]).toBeDefined();
          }
          for (const inst of s.instruments) {
            if (inst.kind === 'sample') expect(PATCHES[inst.patch]).toBeDefined();
            else expect(SYNTHS[inst.patch]).toBeDefined();
          }
          for (const a of s.autos) expect(a.t).toBeLessThan(durationSeconds);
          // Sections tile the bars.
          let bar = 0;
          for (const sec of s.sections) {
            expect(sec.startBar).toBe(bar);
            bar += sec.bars;
          }
          expect(bar).toBe(s.bars);
          expect(s.bars * s.barDur).toBeLessThanOrEqual(durationSeconds + 1e-6);
        });
      }

      it('is deterministic', () => {
        const req: TrackRequest = { recipe, seed: 99, durationSeconds: 150, tweaks: { density: 0.7 } };
        expect(fingerprint(req)).toBe(fingerprint({ ...req }));
        expect(compose(req)).toEqual(compose(req));
      });

      it('makes different songs from different seeds', () => {
        const prints = new Set<string>();
        const keys = new Set<string>();
        const tempos = new Set<string>();
        for (let seed = 1; seed <= 8; seed++) {
          const req = { recipe, seed, durationSeconds: 150 };
          prints.add(fingerprint(req));
          const s = compose(req);
          keys.add(s.key);
          tempos.add(s.bpm.toFixed(1));
        }
        expect(prints.size).toBe(8);
        expect(keys.size).toBeGreaterThanOrEqual(3);
        expect(tempos.size).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('composes valid tracks at extreme tweaks', () => {
    for (const recipe of RECIPE_IDS) {
      for (const v of [0, 1]) {
        const tweaks = { density: v, grit: v, weirdness: v, brightness: v, bpm: v ? 200 : 40 };
        const s = compose({ recipe, seed: 7, durationSeconds: 90, tweaks });
        expect(s.events.length, recipe).toBeGreaterThan(5);
        for (const e of s.events) {
          expect(Number.isFinite(e.t) && Number.isFinite(e.p) && Number.isFinite(e.d), recipe).toBe(true);
          expect(e.t + e.d).toBeLessThanOrEqual(90 + 1e-6);
        }
        expect(Number.isFinite(s.fx.lowpass) && s.fx.lowpass > 100, recipe).toBe(true);
      }
    }
  });

  it('responds to tweaks', () => {
    const base: TrackRequest = { recipe: 'lofi-hiphop', seed: 5, durationSeconds: 120 };
    const sparse = compose({ ...base, tweaks: { density: 0 } }).events.length;
    const busy = compose({ ...base, tweaks: { density: 1 } }).events.length;
    expect(busy).toBeGreaterThan(sparse);
    const slow = compose({ ...base, tweaks: { bpm: 60 } }).bpm;
    const fast = compose({ ...base, tweaks: { bpm: 95 } }).bpm;
    expect(fast).toBeGreaterThan(slow);
    const dark = compose({ ...base, tweaks: { brightness: 0 } }).fx.lowpass;
    const bright = compose({ ...base, tweaks: { brightness: 1 } }).fx.lowpass;
    expect(bright).toBeGreaterThan(dark);
  });

  it('keeps station bpm hints within a few percent', () => {
    for (const st of STATIONS) {
      if (!st.tweaks?.bpm) continue;
      for (let seed = 0; seed < 5; seed++) {
        const s = compose({ recipe: st.recipe as RecipeId, seed, durationSeconds: 150, tweaks: st.tweaks });
        expect(Math.abs(s.bpm / st.tweaks.bpm - 1)).toBeLessThan(0.13);
      }
    }
  });
});

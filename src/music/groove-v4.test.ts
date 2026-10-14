import { describe, expect, it } from 'vitest';
import type { RecipeId } from '../broadcast/types';
import { artistSeed, RECIPE_INFO, type TrackRequest } from './index';
import { compose } from './recipes';
import { signatureOf } from './recipes/artist';
import type { Score } from './score';

const GROOVE: RecipeId[] = ['disco', 'space-funk', 'warehouse-techno', 'heat-death-house'];

const palette = (s: Score) => s.instruments.map((i) => i.patch).join(',');
const print = (s: Score) => `${s.key}|${s.bpm.toFixed(3)}|${s.events.length}|${s.events.slice(0, 40).map((e) => `${e.i}:${e.p}`).join(',')}`;
const song = (recipe: RecipeId, seed: number, extra: Partial<TrackRequest> = {}): Score => compose({ recipe, seed, durationSeconds: 180, ...extra });

function tempoPair(): [number, number] {
  let slow = -1;
  let fast = -1;
  for (let k = 0; k < 500 && (slow < 0 || fast < 0); k++) {
    const id = artistSeed(`Test Artist ${k}`);
    const t = signatureOf(id).tempo;
    if (t < 0.2 && slow < 0) slow = id;
    if (t > 0.8 && fast < 0) fast = id;
  }
  return [slow, fast];
}

describe('v4 groove recipes', () => {
  for (const recipe of GROOVE) {
    describe(recipe, () => {
      it('has lab/UI info', () => {
        expect(RECIPE_INFO[recipe]?.label).toBeTruthy();
        expect(RECIPE_INFO[recipe]?.description).toBeTruthy();
      });

      it('keeps one palette for an artist, while the songs differ', () => {
        const artist = artistSeed(`The ${recipe} Collective`);
        const songs = [1, 2, 3, 4, 5, 6].map((seed) => song(recipe, seed, { artist }));
        expect(new Set(songs.map(palette)).size).toBe(1);
        expect(new Set(songs.map(print)).size).toBe(6);
      });

      it('gives different artists different sounds', () => {
        const sounds = new Set<string>();
        for (let a = 0; a < 6; a++) {
          const s = song(recipe, 11, { artist: artistSeed(`Band ${a}`) });
          sounds.add(`${palette(s)}|${Math.round(s.bpm / 2)}|${s.swing.toFixed(2)}`);
        }
        expect(sounds.size).toBeGreaterThanOrEqual(3);
      });

      it('plays at the artist’s end of the tempo range', () => {
        const [slow, fast] = tempoPair();
        const mean = (a: number) => [1, 2, 3, 4].reduce((sum, seed) => sum + song(recipe, seed, { artist: a }).bpm, 0) / 4;
        expect(mean(fast)).toBeGreaterThan(mean(slow));
      });

      it('varies its form and harmony from seed to seed', () => {
        const forms = new Set<string>();
        const harmony = new Set<string>();
        for (let seed = 1; seed <= 10; seed++) {
          const s = song(recipe, seed, { durationSeconds: 300 });
          forms.add(s.sections.map((x) => `${x.name}:${x.bars}`).join(' '));
          harmony.add(s.progression);
        }
        expect(forms.size).toBeGreaterThanOrEqual(3);
        expect(harmony.size).toBeGreaterThanOrEqual(4);
      });

      it('leaves no note hanging past its section, and stays light on events', () => {
        for (const seed of [1, 2, 3]) {
          const s = song(recipe, seed, { durationSeconds: 360 });
          // Background-tab budget: well under 50 notes a second on average.
          expect(s.events.length / s.duration).toBeLessThan(45);
          const tension = s.instruments.findIndex((i) => i.name === 'Tension');
          for (const e of s.events) if (e.i !== tension) expect(e.d, s.instruments[e.i]!.name).toBeLessThan(16);
        }
      });
    });
  }

  it('keeps warehouse techno at 130–135 bpm', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const bpm = song('warehouse-techno', seed).bpm;
      expect(bpm).toBeGreaterThanOrEqual(126);
      expect(bpm).toBeLessThanOrEqual(139);
    }
  });

  it('follows the DJ’s tempo down, and thins out as it slows', () => {
    let prevBpm = Infinity;
    let prevRate = Infinity;
    for (const bpm of [124, 112, 100]) {
      let n = 0;
      let rate = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const s = song('heat-death-house', seed, { tweaks: { bpm }, durationSeconds: 240 });
        expect(Math.abs(s.bpm / bpm - 1)).toBeLessThan(0.08);
        n += s.bpm;
        rate += s.events.length / s.bars;
      }
      expect(n / 6).toBeLessThan(prevBpm);
      expect(rate / 6).toBeLessThan(prevRate);
      prevBpm = n / 6;
      prevRate = rate / 6;
    }
  });
});

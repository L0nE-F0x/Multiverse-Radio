// Behaviour of the v4 world recipes and talk beds beyond the generic checks in recipes.test.ts.
import { describe, expect, it } from 'vitest';
import type { RecipeId } from '../broadcast/types';
import { artistSeed, RECIPE_INFO, type TrackRequest } from './index';
import { compose } from './recipes';
import { signatureOf } from './recipes/artist';
import type { Score } from './score';

const GENRES: RecipeId[] = ['roots-reggae', 'island-reggae', 'exotica', 'space-age-pop'];
const BEDS: RecipeId[] = ['court-bed', 'theatre-organ', 'traffic-bed', 'pirate-bed'];
const TEMPO: Record<string, [number, number]> = {
  'roots-reggae': [68, 80],
  'island-reggae': [60, 72],
  exotica: [90, 112],
  'space-age-pop': [110, 130],
};

const palette = (s: Score) => s.instruments.map((i) => i.patch).join(',');
const print = (s: Score) => `${s.key}|${s.bpm.toFixed(3)}|${s.events.length}|${s.events.slice(0, 40).map((e) => `${e.i}:${e.p}`).join(',')}`;
const song = (recipe: RecipeId, seed: number, artist?: number, durationSeconds = 150): Score => {
  const req: TrackRequest = { recipe, seed, durationSeconds };
  if (artist !== undefined) req.artist = artist;
  return compose(req);
};
const inst = (s: Score, name: string) => s.instruments.findIndex((i) => i.name === name);
const notesOf = (s: Score, name: string) => s.events.filter((e) => e.i === inst(s, name));

describe('v4 world recipes', () => {
  for (const recipe of [...GENRES, ...BEDS]) {
    it(`${recipe} has lab/UI info`, () => {
      expect(RECIPE_INFO[recipe]?.label).toBeTruthy();
      expect(RECIPE_INFO[recipe]?.description).toBeTruthy();
    });
  }

  for (const recipe of GENRES) {
    describe(recipe, () => {
      const artist = artistSeed(`The ${recipe} Orchestra`);

      it('plays in its tempo range', () => {
        const [lo, hi] = TEMPO[recipe]!;
        for (let seed = 1; seed <= 12; seed++) {
          const bpm = song(recipe, seed).bpm;
          expect(bpm).toBeGreaterThanOrEqual(lo * 0.94);
          expect(bpm).toBeLessThanOrEqual(hi * 1.06);
        }
      });

      it('keeps one palette for an artist, while the songs differ', () => {
        const songs = [1, 2, 3, 4, 5, 6].map((seed) => song(recipe, seed, artist));
        expect(new Set(songs.map(palette)).size).toBe(1);
        expect(new Set(songs.map(print)).size).toBe(6);
      });

      it('gives different artists different sounds', () => {
        const sounds = new Set<string>();
        for (let a = 0; a < 6; a++) {
          const s = song(recipe, 11, artistSeed(`Band ${a}`));
          sounds.add(`${palette(s)}|${Math.round(s.bpm / 4)}|${s.swing.toFixed(2)}`);
        }
        expect(sounds.size).toBeGreaterThanOrEqual(3);
      });

      it('plays at the artist’s end of the tempo range', () => {
        let slow = -1;
        let fast = -1;
        for (let k = 0; k < 500 && (slow < 0 || fast < 0); k++) {
          const id = artistSeed(`Test Artist ${k}`);
          const t = signatureOf(id).tempo;
          if (t < 0.2 && slow < 0) slow = id;
          if (t > 0.8 && fast < 0) fast = id;
        }
        const mean = (a: number) => [1, 2, 3, 4].reduce((sum, seed) => sum + song(recipe, seed, a).bpm, 0) / 4;
        expect(mean(fast)).toBeGreaterThan(mean(slow));
      });

      it('stays light enough for the CPU', () => {
        const s = song(recipe, 9, undefined, 600);
        expect(s.instruments.length).toBeLessThanOrEqual(14);
        expect(s.events.length / 600).toBeLessThan(20);
      });
    });
  }

  it('reggae is one-drop: kick and cross-stick land together on beat three', () => {
    for (const recipe of ['roots-reggae', 'island-reggae'] as RecipeId[]) {
      for (let seed = 1; seed <= 4; seed++) {
        const s = song(recipe, seed);
        const kicks = notesOf(s, 'Kick');
        const rims = notesOf(s, 'Cross-stick');
        const onThree = kicks.filter((k) => Math.abs(((k.t / s.barDur) % 1) - 0.5) < 0.01);
        expect(onThree.length / s.bars, recipe).toBeGreaterThan(0.6);
        const together = onThree.filter((k) => rims.some((r) => Math.abs(r.t - k.t) < 0.02)).length;
        expect(together / onThree.length, recipe).toBeGreaterThan(0.6);
      }
    }
  });

  it('island time is slower than roots, and in major far more often', () => {
    const mean = (r: RecipeId) => [1, 2, 3, 4, 5, 6].reduce((sum, seed) => sum + song(r, seed).bpm, 0) / 6;
    expect(mean('island-reggae')).toBeLessThan(mean('roots-reggae'));
    const majors = (r: RecipeId) => [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => song(r, seed).key.endsWith('major')).length;
    expect(majors('island-reggae')).toBeGreaterThan(majors('roots-reggae'));
  });

  it('the theremin glides between its notes', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const notes = notesOf(song('exotica', seed), 'Theremin');
      expect(notes.length).toBeGreaterThan(8);
      expect(notes.filter((n) => n.from !== undefined && n.glide).length / notes.length).toBeGreaterThan(0.9);
    }
  });

  it('the bachelor pad plays ping-pong: calls and answers on opposite speakers', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = song('space-age-pop', seed);
      for (const name of ['Muted brass', 'Pa-pa singers', 'Xylophone', 'Bongos']) {
        const l = inst(s, `${name} (left)`);
        const r = inst(s, `${name} (right)`);
        expect(s.instruments[l]!.pan).toBeLessThan(-0.85);
        expect(s.instruments[r]!.pan).toBeGreaterThan(0.85);
        expect(s.events.some((e) => e.i === l)).toBe(true);
        expect(s.events.some((e) => e.i === r)).toBe(true);
      }
      // The demonstration sends the bongos from one speaker to the other.
      expect(s.sections.some((x) => x.name === 'stereo demonstration')).toBe(true);
    }
  });
});

describe('v4 talk beds', () => {
  for (const recipe of BEDS) {
    it(`${recipe} has an intro and an ending at every length`, () => {
      for (const durationSeconds of [12, 60, 600]) {
        const s = compose({ recipe, seed: 5, durationSeconds });
        if (s.bars >= 5) {
          expect(s.sections[0]!.name, `${recipe} ${durationSeconds}s`).toBe('intro');
          expect(s.sections[s.sections.length - 1]!.name).toBe('outro');
        }
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

  it('the court uses its gavel sparingly', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = compose({ recipe: 'court-bed', seed, durationSeconds: 300 });
      const raps = notesOf(s, 'Gavel').length;
      expect(raps).toBeGreaterThanOrEqual(2);
      expect(raps).toBeLessThan(300 / 15);
    }
  });

  it('the long dark ends on a sting', () => {
    const s = compose({ recipe: 'theatre-organ', seed: 3, durationSeconds: 180 });
    const outro = s.sections[s.sections.length - 1]!;
    expect(notesOf(s, 'Timpani').filter((e) => e.t >= outro.t).length).toBeGreaterThanOrEqual(2);
  });

  it('traffic plays its jingle at the top', () => {
    const s = compose({ recipe: 'traffic-bed', seed: 4, durationSeconds: 120 });
    const bells = notesOf(s, 'Jingle bells');
    expect(bells.filter((e) => e.t < s.barDur).length).toBe(5);
  });

  it('the pirate broadcasts in mono from one dry room', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = compose({ recipe: 'pirate-bed', seed, durationSeconds: 120 });
      for (const i of s.instruments) {
        expect(i.pan ?? 0).toBe(0);
        expect(i.reverb ?? 0).toBe(0);
      }
      expect(s.fx.wow).toBeGreaterThan(1);
    }
  });
});

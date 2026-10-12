import { describe, expect, it } from 'vitest';
import type { RecipeId } from '../broadcast/types';
import { artistSeed, type TrackRequest } from './index';
import { compose } from './recipes';
import { signatureOf } from './recipes/artist';
import { Rng } from './rng';
import type { Score } from './score';

const GENRES: RecipeId[] = ['jazz-trio', 'city-pop', 'drum-and-bass', 'ambient-piano', 'shoegaze', 'sea-shanty', 'surf-rock', 'soft-rock', 'cat-piano', 'photosynth'];

const palette = (s: Score) => s.instruments.map((i) => i.patch).join(',');
const print = (s: Score) => `${s.key}|${s.bpm.toFixed(3)}|${s.events.length}|${s.events.slice(0, 40).map((e) => `${e.i}:${e.p}`).join(',')}`;
const song = (recipe: RecipeId, seed: number, artist?: number, durationSeconds = 150): Score => {
  const req: TrackRequest = { recipe, seed, durationSeconds };
  if (artist !== undefined) req.artist = artist;
  return compose(req);
};

/** Two artists from the slow and the fast end of every tempo range. */
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

describe('artist signatures', () => {
  it('hashes names stably, ignoring case and spacing', () => {
    expect(artistSeed('The Late Bus')).toBe(artistSeed('  the late  bus '));
    expect(artistSeed('The Late Bus')).not.toBe(artistSeed('The Early Bus'));
    expect(signatureOf(artistSeed('The Late Bus'))).toBe(signatureOf(artistSeed('The Late Bus')));
  });

  it('changes nothing without an artist, and leaves no taste behind', () => {
    for (const recipe of ['lofi-hiphop', 'jazz-trio', 'synthwave'] as RecipeId[]) {
      expect(compose({ recipe, seed: 3, durationSeconds: 90 })).toEqual(compose({ recipe, seed: 3, durationSeconds: 90, artist: undefined }));
    }
    compose({ recipe: 'lofi-hiphop', seed: 3, durationSeconds: 90, artist: 42 });
    expect(Rng.taste).toBeNull();
  });

  for (const recipe of GENRES) {
    describe(recipe, () => {
      const artist = artistSeed(`The ${recipe} Society`);

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
        const [slow, fast] = tempoPair();
        const mean = (a: number) => [1, 2, 3, 4].reduce((sum, seed) => sum + song(recipe, seed, a).bpm, 0) / 4;
        expect(mean(fast)).toBeGreaterThan(mean(slow));
      });
    });
  }

  it('carries tempo, taste and production into the v2 recipes too', () => {
    const [slow, fast] = tempoPair();
    for (const recipe of ['lofi-hiphop', 'synthwave', 'lounge-jazz', 'chiptune'] as RecipeId[]) {
      const bpm = (a: number) => [1, 2, 3, 4].map((seed) => song(recipe, seed, a).bpm);
      expect(Math.max(...bpm(slow)), recipe).toBeLessThan(Math.min(...bpm(fast)));
    }
    // A taste for instruments: an artist's lo-fi keys are mostly the same one.
    for (const name of ['The Late Bus', 'Mira Vale', 'Seven Quiet Engines']) {
      const counts = new Map<string, number>();
      for (let seed = 1; seed <= 12; seed++) {
        const keys = song('lofi-hiphop', seed, artistSeed(name)).instruments[0]!.patch;
        counts.set(keys, (counts.get(keys) ?? 0) + 1);
      }
      expect(Math.max(...counts.values()), name).toBeGreaterThanOrEqual(7);
    }
    const sig = signatureOf(artistSeed('The Late Bus'));
    const plain = song('lofi-hiphop', 5);
    const signed = song('lofi-hiphop', 5, sig.id);
    expect(signed.fx.reverbLevel).toBeCloseTo((plain.fx.reverbLevel ?? 1) * sig.reverb, 6);
  });
});

describe('the infinite song', () => {
  const tracks = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => song('infinite-song', seed * 7919));

  it('is always in the same key, at the same tempo', () => {
    expect(new Set(tracks.map((s) => s.key))).toEqual(new Set(['D major']));
    for (const s of tracks) expect(Math.abs(s.bpm / 96 - 1)).toBeLessThan(0.02);
  });

  it('always has the refrain, and a different verse every time', () => {
    const refrain = [71, 74, 74, 73, 71, 69, 69, 71, 73, 76, 73, 74, 71, 71, 74, 79, 78, 78, 76, 74, 76, 74, 73, 71, 73, 74];
    const verses = new Set<string>();
    for (const s of tracks) {
      const fiddle = s.instruments.findIndex((i) => i.name === 'Fiddle');
      const notes = s.events.filter((e) => e.i === fiddle && e.d > 0.1).map((e) => e.p);
      expect(notes.join(',')).toContain(refrain.join(','));
      const singer = s.instruments.findIndex((i) => i.name.startsWith('Melodica'));
      verses.add(s.events.filter((e) => e.i === singer).map((e) => e.p).join(','));
    }
    expect(verses.size).toBe(tracks.length);
  });

  it('ends on the turnaround, hanging on the dominant', () => {
    for (const s of tracks) {
      const last = s.sections[s.sections.length - 1]!;
      expect(last.chords[last.chords.length - 1]).toBe('A');
    }
  });

  it('ignores the artist: it is always the same band', () => {
    const a = song('infinite-song', 99, artistSeed('Somebody Else'));
    const b = song('infinite-song', 99);
    expect(palette(a)).toBe(palette(b));
    expect(a.key).toBe(b.key);
  });
});

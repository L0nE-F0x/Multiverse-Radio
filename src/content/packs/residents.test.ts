import { describe, expect, it } from 'vitest';
import { STATIONS } from '../../stations/roster';
import { trackMeta } from '../tracks';
import { STATION_PACKS } from './index';

/** The v2 stations that air music (talk-station beds keep their small fixed bands). */
const MUSIC = [
  'static-lullabies',
  'void-beats',
  'rainfall-fm',
  'neon-2087',
  'end-lounge',
  'snail-jams',
  'crystal-delta',
  'hold-music',
  'pixel-afterlife',
  'moon-dub',
  'whalesong',
  'baroque-bots',
  'comet-marimba',
  'mirror-polka',
  'wild-multiverse',
  'numbers-omega',
];

describe('resident artists', () => {
  for (const id of MUSIC) {
    it(`${id}: 6-10 fixed residents on about two tracks in five`, () => {
      const station = STATIONS.find((s) => s.id === id);
      expect(station, id).toBeDefined();
      const residents = STATION_PACKS[id]?.grammar.residents;
      expect(Array.isArray(residents), `${id} has no residents rule`).toBe(true);
      const names = residents as readonly string[];
      expect(names.length).toBeGreaterThanOrEqual(6);
      expect(names.length).toBeLessThanOrEqual(10);
      expect(new Set(names).size, 'duplicate residents').toBe(names.length);
      for (const name of names) expect(name, 'residents must be fixed names').not.toMatch(/#/);

      const n = 2000;
      const seen = new Map<string, number>();
      let hits = 0;
      for (let i = 0; i < n; i++) {
        const artist = trackMeta(station!, i * 7919 + 3).artist;
        if (names.includes(artist)) {
          hits++;
          seen.set(artist, (seen.get(artist) ?? 0) + 1);
        }
      }
      const share = hits / n;
      expect(share, `${id} resident share`).toBeGreaterThan(0.3);
      expect(share, `${id} resident share`).toBeLessThan(0.55);
      for (const name of names) expect(seen.get(name) ?? 0, `${id}: ${name} never airs`).toBeGreaterThan(20);
    });
  }
});

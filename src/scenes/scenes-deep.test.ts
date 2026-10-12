// Secret, pirate and oddity scenes: all registered, and the pirate scenes draw a plausible picture
// for many different pirates (variants), in every weather and at every aspect, without throwing.

import { describe, expect, it } from 'vitest';
import { hex } from './kit/color';
import { Gfx } from './kit/gfx';
import { Rng, hashString } from './kit/rng';
import { SCENES, loadScene } from './registry';
import { DEEP_SCENES } from './registry-deep';
import type { Frame } from './types';
import { computeView } from './viewport';

const DEEP = [
  'nightjar-cabin',
  'lighthouse',
  'first-transmitter',
  'pirate-shed',
  'pirate-van',
  'pirate-rooftop',
  'pirate-boat',
  'oddity-testcard',
  'oddity-beacon',
  'oddity-jukebox',
  'oddity-clock',
] as const;
const PIRATES = DEEP.filter((id) => id.startsWith('pirate-'));
const ACCENTS = ['#ffb000', '#33ff88', '#5ce1ff', '#e8eef5', '#ff5a4a', '#b48cff', '#ff7aa8'];

function frame(): Frame {
  return { t: 0, dt: 0, energy: 0.4, pulse: 0, beat: 0, awake: 1, playing: true, reduced: false, rareT: Infinity, rare: 0, rareSeed: 0.5, hour: 2, n: 0 };
}

describe('deep-band scenes', () => {
  it('registers every secret, pirate and oddity scene', () => {
    for (const id of DEEP) {
      expect(DEEP_SCENES[id], id).toBeDefined();
      expect(SCENES[id], id).toBe(DEEP_SCENES[id]);
    }
  });

  it('keeps pirate labels generic (no call signs or names)', () => {
    for (const id of PIRATES) expect(DEEP_SCENES[id]!.label).not.toMatch(/[A-Z]{3,}/);
  });

  describe.each(PIRATES)('%s', (id) => {
    it('draws many different pirates without throwing', async () => {
      const def = await loadScene(id);
      for (let i = 0; i < 40; i++) {
        const variant = hashString(`pirate-${(76 + i * 2.15).toFixed(2)}`);
        const aspect = [16 / 9, 9 / 16, 4 / 3, 21 / 9][i % 4]!;
        const v = computeView(aspect, def.focusX, def.focusY);
        const g = new Gfx(v.w, v.h, v.ox, v.oy);
        const scene = def.create({ accent: hex(ACCENTS[i % ACCENTS.length]!), rng: new Rng(hashString(id)), variant });
        g.target(g.bg);
        scene.background(g);
        g.target();
        const f = frame();
        f.rare = i % def.rareEvents;
        f.rareT = (i * 0.7) % def.rareDuration;
        f.reduced = i % 5 === 0;
        f.awake = i % 3 === 0 ? 0.1 : 1;
        for (let k = 0; k < 4; k++) {
          f.t += 0.4;
          f.dt = 0.4;
          f.rareT += 0.4;
          g.restore();
          scene.frame(g, f);
        }
        let opaque = true;
        for (let p = 0; p < g.frame.length; p++) if (g.frame[p]! >>> 24 !== 255) opaque = false;
        expect(opaque).toBe(true);
        expect(new Set(g.frame).size).toBeGreaterThan(16);
      }
    });

    it('looks different for different pirates', async () => {
      const def = await loadScene(id);
      const shots = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const g = new Gfx(320, 180, 0, 0);
        const scene = def.create({ accent: hex('#ffb000'), rng: new Rng(hashString(id)), variant: hashString(`pirate-${90 + i}.00`) });
        g.target(g.bg);
        scene.background(g);
        let sum = 0;
        for (let p = 0; p < g.bg.length; p += 97) sum = (sum * 31 + g.bg[p]!) | 0;
        shots.add(String(sum));
      }
      expect(shots.size).toBe(6);
    });
  });
});

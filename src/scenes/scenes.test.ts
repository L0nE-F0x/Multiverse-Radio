import { describe, expect, it } from 'vitest';
import { SCENE_IDS } from '../broadcast/types';
import { STATIONS } from '../stations/roster';
import { hex } from './kit/color';
import { glyph, textWidth } from './kit/font';
import { Gfx } from './kit/gfx';
import { Rng, hashString } from './kit/rng';
import { SCENES, loadScene, sceneEntry } from './registry';
import type { Frame } from './types';
import { computeView } from './viewport';

function frame(): Frame {
  return {
    t: 0,
    dt: 0,
    energy: 0,
    pulse: 0,
    beat: 0,
    awake: 1,
    playing: true,
    reduced: false,
    rareT: Infinity,
    rare: 0,
    rareSeed: 0.5,
    hour: 21,
    n: 0,
  };
}

describe('scene registry', () => {
  it('has a scene module for every SceneId and nothing else', () => {
    expect(Object.keys(SCENES).sort()).toEqual([...SCENE_IDS].sort());
  });

  it('gives every scene a short one-sentence aria-label', () => {
    for (const id of SCENE_IDS) {
      const label = sceneEntry(id).label;
      expect(label.length).toBeGreaterThan(20);
      expect(label.length).toBeLessThanOrEqual(140);
      expect(label.endsWith('.')).toBe(true);
    }
  });
});

describe('viewport', () => {
  it('shows exactly the design area at 16:9', () => {
    expect(computeView(16 / 9)).toEqual({ w: 320, h: 180, ox: 0, oy: 0 });
  });

  it('keeps the central 192 px in portrait and extends vertically', () => {
    const v = computeView(9 / 16);
    expect(v.w).toBe(192);
    expect(v.ox).toBe(64);
    expect(v.h).toBeGreaterThan(300);
    expect(v.h).toBeLessThanOrEqual(384);
  });

  it('crops sides for 4:3 and extends (capped) for ultrawide', () => {
    expect(computeView(4 / 3)).toMatchObject({ w: 240, h: 180, ox: 40 });
    expect(computeView(21 / 9).w).toBeLessThanOrEqual(384);
    expect(computeView(5).w).toBe(384);
  });
});

describe('raster kit', () => {
  it('clips rectangles to the buffer without wrapping rows', () => {
    const g = new Gfx(10, 10, 0, 0);
    g.fill(hex('#000000'));
    g.rect(-5, 2, 8, 2, hex('#ffffff'));
    g.rect(8, 5, 10, 1, hex('#ff0000'));
    expect(g.get(2, 2)).toBe(hex('#ffffff'));
    expect(g.get(3, 2)).toBe(hex('#000000'));
    expect(g.get(9, 5)).toBe(hex('#ff0000'));
    expect(g.get(0, 6)).toBe(hex('#000000'));
  });

  it('respects the clip rectangle and world offsets', () => {
    const g = new Gfx(20, 20, 100, 50);
    g.fill(hex('#000000'));
    g.clip(105, 55, 5, 5);
    g.disc(107, 57, 10, hex('#ffffff'));
    g.noClip();
    expect(g.get(105, 55)).toBe(hex('#ffffff'));
    expect(g.get(104, 57)).toBe(hex('#000000'));
    expect(g.get(110, 57)).toBe(hex('#000000'));
  });

  it('has a glyph for everything and treats lowercase as uppercase', () => {
    expect(glyph('a')).toBe(glyph('A'));
    expect(textWidth('ON AIR')).toBeGreaterThan(20);
  });
});

// Pirate and oddity scenes have no roster station; they're drawn with a neutral accent.
describe.each(SCENE_IDS.filter((id) => SCENES[id]))('scene %s', (id) => {
  it('loads, draws at several aspect ratios and plays every rare event', async () => {
    const def = await loadScene(id);
    expect(def.id).toBe(id);
    expect(def.rareEvents).toBeGreaterThan(0);
    const station = STATIONS.find((s) => s.scene === id) ?? { color: '#ffb000' };
    for (const aspect of [16 / 9, 9 / 16, 4 / 3, 21 / 9]) {
      const v = computeView(aspect, def.focusX, def.focusY);
      const g = new Gfx(v.w, v.h, v.ox, v.oy);
      const scene = def.create({ accent: hex(station.color), rng: new Rng(hashString(id)), variant: 0 });
      g.target(g.bg);
      scene.background(g);
      g.target();
      const f = frame();
      const step = (dt: number) => {
        f.dt = dt;
        f.t += dt;
        f.rareT += dt;
        f.energy = 0.4 + 0.3 * Math.sin(f.t * 3);
        f.pulse = (f.t * 1.4) % 1 < 0.2 ? 1 : 0;
        f.beat = Math.floor(f.t * 1.4);
        g.restore();
        scene.frame(g, f);
        f.n++;
      };
      for (let i = 0; i < 8; i++) step(0.05);
      for (let k = 0; k < def.rareEvents; k++) {
        f.rare = k;
        f.rareT = 0;
        for (let s = 0; s <= def.rareDuration + 1; s += 0.4) step(0.4);
      }
      // Paused and reduced-motion frames draw too.
      f.playing = false;
      f.awake = 0;
      f.reduced = true;
      step(0.05);
      step(5);
      // A plausible picture: opaque everywhere and not a flat fill.
      let opaque = true;
      for (let i = 0; i < g.frame.length; i++) if (g.frame[i]! >>> 24 !== 255) opaque = false;
      expect(opaque).toBe(true);
      expect(new Set(g.frame).size).toBeGreaterThan(16);
    }
  });
});

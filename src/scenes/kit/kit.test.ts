import { describe, expect, it } from 'vitest';
import { Fog, beam, gloom, haze, lightPool, motes, rain, reflectDown, rimLight } from './atmos';
import { hex, luma, moodRamp, mute, rgb, toHsl, hsl } from './color';
import { Gfx } from './gfx';
import { Post, tone } from './post';
import { Rng, hashString } from './rng';
import { SCENE_IDS } from '../../broadcast/types';
import { SCENES, loadScene } from '../registry';
import { computeView } from '../viewport';

const grey = (v: number) => rgb(v, v, v);

describe('palette helpers', () => {
  it('round-trips HSL', () => {
    for (const c of [hex('#ff8040'), hex('#2a6aff'), hex('#33ff88'), hex('#808080')]) {
      const [h, s, l] = toHsl(c);
      const back = hsl(h, s, l);
      expect(Math.abs((back & 255) - (c & 255))).toBeLessThanOrEqual(1);
      expect(Math.abs(((back >>> 8) & 255) - ((c >>> 8) & 255))).toBeLessThanOrEqual(1);
      expect(Math.abs(((back >>> 16) & 255) - ((c >>> 16) & 255))).toBeLessThanOrEqual(1);
    }
  });

  it('builds mood ramps that get lighter step by step and stay muted', () => {
    const r = moodRamp(hex('#ff4fd8'), 6);
    expect(r).toHaveLength(6);
    for (let i = 1; i < r.length; i++) expect(luma(r[i]!)).toBeGreaterThan(luma(r[i - 1]!));
    expect(toHsl(mute(hex('#ff4fd8')))[1]).toBeLessThan(toHsl(hex('#ff4fd8'))[1]);
  });
});

describe('post pass', () => {
  const run = (post: Post, src: Int32Array, w: number, h: number, exposure: Float32Array | null = null) => {
    const out = new Int32Array(src.length);
    post.apply(src.slice(), out, w, h, 0, 0, exposure, 1, false);
    return out;
  };

  it('has a monotonic filmic curve that never clips hard', () => {
    let prev = -1;
    for (let v = 0; v <= 1.5; v += 0.01) {
      const y = tone(v, 1.12, 0.42);
      expect(y).toBeGreaterThan(prev);
      expect(y).toBeLessThan(1);
      prev = y;
    }
  });

  it('keeps the order of greys and lifts black to the shadow tint', () => {
    const w = 64;
    const h = 1;
    const src = new Int32Array(w);
    for (let i = 0; i < w; i++) src[i] = grey(i * 4);
    const out = run(new Post({ vignette: 0, grain: 0, bloom: 0 }), src, w, h);
    for (let i = 1; i < w; i++) expect(luma(out[i]!)).toBeGreaterThanOrEqual(luma(out[i - 1]!));
    expect(out.every((c) => c >>> 24 === 255)).toBe(true);
    const black = run(new Post({ vignette: 0, grain: 0, bloom: 0, shadows: '#102030' }), new Int32Array([grey(0)]), 1, 1)[0]!;
    expect(blueOf(black)).toBeGreaterThan(redOf(black));
  });

  it('darkens the corners with the vignette and follows the exposure map', () => {
    const w = 40;
    const h = 20;
    const src = new Int32Array(w * h).fill(grey(160));
    const vig = run(new Post({ vignette: 0.8, grain: 0, bloom: 0 }), src, w, h);
    expect(luma(vig[0]!)).toBeLessThan(luma(vig[10 * w + 20]!));

    const g = new Gfx(w, h, 0, 0);
    g.lighting(0.3);
    g.light(30, 10, 12, 0.9);
    const lit = run(new Post({ vignette: 0, grain: 0, bloom: 0 }), src, w, h, g.exposure);
    expect(luma(lit[10 * w + 30]!)).toBeGreaterThan(luma(lit[10 * w + 5]!) + 30);
  });

  it('blooms a light into the dark around it, but not a dim scene', () => {
    const w = 64;
    const h = 64;
    const src = new Int32Array(w * h).fill(grey(10));
    for (let y = 30; y < 34; y++) for (let x = 30; x < 34; x++) src[y * w + x] = grey(255);
    const lit = new Int32Array(w * h);
    const unlit = new Int32Array(w * h);
    new Post({ vignette: 0, grain: 0, bloom: 1 }).apply(src, lit, w, h, 0, 0, null, 1, false);
    new Post({ vignette: 0, grain: 0, bloom: 0 }).apply(src, unlit, w, h, 0, 0, null, 1, false);
    // A halo six pixels out from the light, and the source frame is left alone.
    expect(luma(lit[32 * w + 38]!)).toBeGreaterThan(luma(unlit[32 * w + 38]!) + 6);
    expect(src[32 * w + 38]).toBe(grey(10));
    // Nothing above the threshold: bloom changes nothing.
    const dim = new Int32Array(w * h).fill(grey(60));
    const a = new Int32Array(w * h);
    const b = new Int32Array(w * h);
    new Post({ vignette: 0, grain: 0, bloom: 1 }).apply(dim, a, w, h, 0, 0, null, 1, false);
    new Post({ vignette: 0, grain: 0, bloom: 0 }).apply(dim, b, w, h, 0, 0, null, 1, false);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('atmosphere helpers', () => {
  it('draw inside any view without throwing or leaving transparent pixels', () => {
    const fog = new Fog({ seed: 3 });
    for (const [w, h, ox, oy] of [
      [320, 180, 0, 0],
      [192, 341, 64, -80],
      [384, 180, -32, 0],
    ] as const) {
      const g = new Gfx(w, h, ox, oy);
      g.fill(grey(40));
      haze(g, hex('#334455'), 40, 120, 0, 0.6);
      fog.draw(g, 12.3, 60, 140, hex('#aabbcc'), 0.5, 4, 'ground');
      lightPool(g, 160, 150, 60, 14, hex('#ffcc88'), 0.5);
      beam(g, 100, -20, 180, 170, 4, 50, hex('#ffffff'), 0.3);
      motes(g, 5, 0, 0, 320, 180, 30, hex('#ffffff'), 0.5);
      rain(g, 5, -50, -100, 400, 300, 80, hex('#aaccff'));
      gloom(g, g.left, 130, g.w, 60, 0.6);
      g.rect(150, 80, 20, 30, hex('#406080'));
      rimLight(g, 140, 70, 40, 50, (c) => c === hex('#406080'), hex('#ffcc88'), 0.5);
      reflectDown(g, 140, 180, 110, 20, 0.3);
      // Clipped: nothing outside the clip rectangle changes.
      const before = g.get(g.left + 1, g.top + 1);
      g.clip(150, 60, 20, 20);
      haze(g, hex('#ff0000'), 0, 180, 1, 1);
      fog.draw(g, 1, 0, 180, hex('#00ff00'), 1);
      g.noClip();
      expect(g.get(g.left + 1, g.top + 1)).toBe(before);
      expect(g.frame.every((c) => c >>> 24 === 255)).toBe(true);
    }
  });
});

describe('every registered scene through the lens', () => {
  it('grades a frame with its own grade (and its exposure map) at 16:9 and 9:16', async () => {
    for (const id of SCENE_IDS) {
      if (!SCENES[id]) continue;
      const def = await loadScene(id);
      if (def.grade === false) continue;
      for (const aspect of [16 / 9, 9 / 16]) {
        const v = computeView(aspect, def.focusX, def.focusY);
        const g = new Gfx(v.w, v.h, v.ox, v.oy);
        const scene = def.create({ accent: hex('#ffb000'), rng: new Rng(hashString(id)), variant: hashString(id) });
        g.target(g.bg);
        scene.background(g);
        g.target();
        g.restore();
        scene.frame(g, { t: 3, dt: 0.05, energy: 0.5, pulse: 0.5, beat: 3, awake: 1, playing: true, reduced: false, rareT: Infinity, rare: 0, rareSeed: 0.5, hour: 22, n: 60 });
        const out = new Int32Array(g.frame.length);
        new Post(def.grade).apply(g.frame, out, g.w, g.h, g.ox, g.oy, g.exposure, g.exposureVersion, true);
        expect(out.every((c) => c >>> 24 === 255), id).toBe(true);
        expect(new Set(out).size, id).toBeGreaterThan(16);
      }
    }
  });
});

function redOf(c: number) {
  return c & 255;
}
function blueOf(c: number) {
  return (c >>> 16) & 255;
}

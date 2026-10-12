// Small reusable effects. Most are *stateless*: positions are pure functions of time and
// an index, so there is nothing to allocate or update per frame, and slowing the clock
// (reduced motion) slows everything consistently.

import { type Color, blue, green, red } from './color';
import { type Gfx, bayer } from './gfx';
import { hash3 } from './rng';

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
/** 0 → 1 → 0 over [0, total] with given rise and fall times. */
export function envelope(t: number, total: number, rise = 0.3, fall = 0.3): number {
  if (t < 0 || t > total) return 0;
  if (t < rise) return smoothstep(0, rise, t);
  if (t > total - fall) return 1 - smoothstep(total - fall, total, t);
  return 1;
}
export const TAU = Math.PI * 2;

/**
 * Natural-looking blinks: true while the eyes are shut. Each `seed` gets its own rhythm
 * (every ~3–6 s, occasionally a double blink).
 */
export function blinking(t: number, seed = 0, period = 4.5): boolean {
  const cycle = Math.floor(t / period + hash3(seed, 1) * 7);
  const local = t / period + hash3(seed, 1) * 7 - cycle;
  const at = 0.2 + hash3(cycle, seed, 3) * 0.6;
  const d = (local - at) * period;
  if (d >= 0 && d < 0.14) return true;
  if (hash3(cycle, seed, 4) < 0.2 && d >= 0.3 && d < 0.42) return true;
  return false;
}

/** Steam wisps rising from (x, y). Stateless. */
export function steam(g: Gfx, t: number, x: number, y: number, c: Color, opts: { n?: number; height?: number; spread?: number; speed?: number; alpha?: number; seed?: number } = {}) {
  const n = opts.n ?? 6;
  const height = opts.height ?? 18;
  const spread = opts.spread ?? 3;
  const speed = opts.speed ?? 0.35;
  const alpha = opts.alpha ?? 0.55;
  const seed = opts.seed ?? 0;
  for (let i = 0; i < n; i++) {
    const p = (t * speed + i / n + hash3(i, seed) * 0.1) % 1;
    const py = y - p * height;
    const px = x + Math.sin(p * 5 + i * 1.7 + t * 0.8) * spread * p + (hash3(i, seed, 2) - 0.5) * 2;
    const a = alpha * Math.sin(p * Math.PI) * (1 - p * 0.4);
    g.pxA(px, py, c, a);
    if (p > 0.25) g.pxA(px + 1, py, c, a * 0.6);
    if (p > 0.5) g.pxA(px, py - 1, c, a * 0.5);
  }
}

/** Twinkling star field inside a rectangle. Deterministic layout from `seed`. */
export function stars(g: Gfx, t: number, x0: number, y0: number, x1: number, y1: number, density: number, c: Color, seed = 1, twinkle = 1) {
  // Iterate a coarse grid so density is stable as the view grows.
  const cell = 6;
  const gx0 = Math.floor(Math.max(x0, g.left) / cell);
  const gx1 = Math.ceil(Math.min(x1, g.right) / cell);
  const gy0 = Math.floor(Math.max(y0, g.top) / cell);
  const gy1 = Math.ceil(Math.min(y1, g.bottom) / cell);
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const h = hash3(gx, gy, seed);
      if (h > density) continue;
      const sx = gx * cell + Math.floor(hash3(gx, gy, seed + 1) * cell);
      const sy = gy * cell + Math.floor(hash3(gx, gy, seed + 2) * cell);
      if (sx < x0 || sx >= x1 || sy < y0 || sy >= y1) continue;
      const b = hash3(gx, gy, seed + 3);
      const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + b * 2.2) * twinkle + b * 40);
      const k = (0.35 + 0.65 * b) * (twinkle > 0 ? tw : 1);
      g.pxAdd(sx, sy, c, k);
      if (b > 0.93) {
        // a few bright ones get a tiny cross
        g.pxAdd(sx - 1, sy, c, k * 0.4);
        g.pxAdd(sx + 1, sy, c, k * 0.4);
        g.pxAdd(sx, sy - 1, c, k * 0.4);
        g.pxAdd(sx, sy + 1, c, k * 0.4);
      }
    }
  }
}

/** Static star field baked into a background (no twinkle). */
export function bakeStars(g: Gfx, x0: number, y0: number, x1: number, y1: number, density: number, c: Color, seed = 1) {
  stars(g, 0, x0, y0, x1, y1, density, c, seed, 0);
}

/** Fill a rect with a dithered blend between two colors driven by a 0..1 function. */
export function ditherField(g: Gfx, x0: number, y0: number, x1: number, y1: number, a: Color, b: Color, fn: (x: number, y: number) => number) {
  for (let y = Math.max(y0, g.top); y < Math.min(y1, g.bottom); y++) {
    for (let x = Math.max(x0, g.left); x < Math.min(x1, g.right); x++) {
      g.px(x, y, fn(x, y) > bayer(x, y) ? b : a);
    }
  }
}

/** Pick from a ramp with dithering: v in 0..1. */
export function rampAt(ramp: readonly Color[], v: number, x: number, y: number): Color {
  const n = ramp.length - 1;
  let k = Math.floor(clamp(v) * n + bayer(x, y));
  if (k > n) k = n;
  return ramp[k]!;
}

/** Light a region with a soft colored cone/area (additive), e.g. lamp light on a desk. */
export function lightCone(g: Gfx, x: number, y: number, topW: number, botW: number, h: number, c: Color, k: number) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const w = topW + (botW - topW) * t;
    const f = k * (1 - t) * (0.6 + 0.4 * t);
    g.rectAdd(x - w / 2, y + i, w, 1, c, f);
  }
}

/** Packed color scaled by k, for additive helpers. */
export function scaled(c: Color, k: number): [number, number, number] {
  return [red(c) * k, green(c) * k, blue(c) * k];
}

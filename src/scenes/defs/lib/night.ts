// Shared atmosphere helpers for the v3 station scenes (owned by the scenes-new workstream):
// pre-baked fog, soft light shafts, dust motes, rain, haze and vignettes. Everything here
// is either baked once (backgrounds, textures) or stateless per frame, so drawing allocates
// nothing and slowing the clock (reduced motion) slows everything consistently.

import { type Color, blue, green, red } from '../../kit/color';
import { type Gfx, addPx, bayer, blendPx, mulPx } from '../../kit/gfx';
import { fbm, hash3, noise1 } from '../../kit/rng';

const FOG_W = 512;

/** A horizontally tiling band of fog or smoke: an alpha texture 512 px wide. */
export interface Fog {
  y0: number;
  h: number;
  a: Uint8Array;
}

export interface FogOpts {
  /** Noise scale in px (bigger = larger billows). */
  sx?: number;
  sy?: number;
  /** Noise threshold below which the fog is clear, and contrast above it. */
  lo?: number;
  gain?: number;
  /** Fade the band's top and bottom edges (0 = hard edges, 1 = full sine fade). */
  edge?: number;
  /** Extra fade toward the top only (fog that thins as it rises). */
  rise?: number;
  octaves?: number;
}

/** Bake a fog band covering world rows y0..y0+h. Do this once, in create(). */
export function bakeFog(y0: number, h: number, seed: number, o: FogOpts = {}): Fog {
  const sx = o.sx ?? 40;
  const sy = o.sy ?? 12;
  const lo = o.lo ?? 0.38;
  const gain = o.gain ?? 2.2;
  const edge = o.edge ?? 1;
  const rise = o.rise ?? 0;
  const oct = o.octaves ?? 4;
  const a = new Uint8Array(FOG_W * h);
  for (let y = 0; y < h; y++) {
    const v = y / Math.max(1, h - 1);
    const e = (1 - edge) + edge * Math.sin(v * Math.PI);
    const r = 1 - rise * (1 - v);
    for (let x = 0; x < FOG_W; x++) {
      const u = x / FOG_W;
      const n = fbm(x / sx, y / sy, seed, oct) * (1 - u) + fbm((x - FOG_W) / sx, y / sy, seed, oct) * u;
      const k = Math.min(1, Math.max(0, (n - lo) * gain)) * e * r;
      a[y * FOG_W + x] = Math.round(k * 255);
    }
  }
  return { y0, h, a };
}

/**
 * Blend a fog band over the target, scrolled by `offset` px, tinted `c` at strength `k`.
 * Optional per-row lift `dy` moves the whole band (for heave/bob).
 */
export function drawFog(g: Gfx, fog: Fog, offset: number, c: Color, k: number, dy = 0) {
  if (k <= 0) return;
  const b = g.buf;
  const off = ((Math.floor(offset) % FOG_W) + FOG_W) % FOG_W;
  const kk = Math.round(k * 256);
  for (let row = 0; row < fog.h; row++) {
    const by = fog.y0 + row + Math.round(dy) - g.oy;
    if (by < 0 || by >= g.h) continue;
    const r0 = row * FOG_W;
    const brow = by * g.w;
    for (let bx = 0; bx < g.w; bx++) {
      const a = fog.a[r0 + ((bx + g.ox + off) & (FOG_W - 1))]!;
      if (a < 6) continue;
      b[brow + bx] = blendPx(b[brow + bx]!, c, ((a * kk) >> 8) / 256);
    }
  }
}

/** Additive fog: light the fog band (for glowing mist, lit smoke). */
export function drawFogAdd(g: Gfx, fog: Fog, offset: number, c: Color, k: number, dy = 0) {
  if (k <= 0) return;
  const b = g.buf;
  const off = ((Math.floor(offset) % FOG_W) + FOG_W) % FOG_W;
  const cr = red(c) * k / 255;
  const cg = green(c) * k / 255;
  const cb = blue(c) * k / 255;
  for (let row = 0; row < fog.h; row++) {
    const by = fog.y0 + row + Math.round(dy) - g.oy;
    if (by < 0 || by >= g.h) continue;
    const r0 = row * FOG_W;
    const brow = by * g.w;
    for (let bx = 0; bx < g.w; bx++) {
      const a = fog.a[r0 + ((bx + g.ox + off) & (FOG_W - 1))]!;
      if (a < 6) continue;
      b[brow + bx] = addPx(b[brow + bx]!, cr * a, cg * a, cb * a);
    }
  }
}

/**
 * Soft additive light shaft from (x0, y0) to (x1, y1), w0 wide at the start and w1 at the
 * end, fading along its length by `fade` (0 = even, 1 = gone at the end). Edges are soft.
 * `steps` > 0 quantizes the brightness with dithering, for a pixel-art look.
 */
export function shaft(g: Gfx, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, c: Color, k: number, fade = 0.8, steps = 6) {
  if (k <= 0) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return;
  const len = Math.sqrt(len2);
  const nx = -dy / len;
  const ny = dx / len;
  const hw = Math.max(w0, w1) / 2 + 1;
  const minX = Math.max(g.left, Math.floor(Math.min(x0, x1) - hw));
  const maxX = Math.min(g.right - 1, Math.ceil(Math.max(x0, x1) + hw));
  const minY = Math.max(g.top, Math.floor(Math.min(y0, y1) - hw));
  const maxY = Math.min(g.bottom - 1, Math.ceil(Math.max(y0, y1) + hw));
  const cr = red(c) * k;
  const cg = green(c) * k;
  const cb = blue(c) * k;
  const b = g.buf;
  for (let y = minY; y <= maxY; y++) {
    const row = (y - g.oy) * g.w - g.ox;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const u = (px * dx + py * dy) / len2;
      if (u < 0 || u > 1) continue;
      const d = Math.abs(px * nx + py * ny);
      const half = (w0 + (w1 - w0) * u) / 2;
      if (d >= half) continue;
      const e = 1 - (d / half) * (d / half);
      let f = e * (1 - fade * u);
      if (u < 0.08) f *= u / 0.08;
      if (steps > 0) f = Math.floor(f * steps + bayer(x, y)) / steps;
      if (f <= 0) continue;
      b[row + x] = addPx(b[row + x]!, cr * f, cg * f, cb * f);
    }
  }
}

/**
 * Drifting dust motes in a rectangle, lit additively. Stateless. `lit(x, y)` (optional)
 * scales each mote's brightness, e.g. 1 inside a light shaft and 0 outside; pass a function
 * created once in create(), never a fresh closure per frame.
 */
export function motes(g: Gfx, t: number, x: number, y: number, w: number, h: number, n: number, c: Color, k: number, seed = 1, speed = 1, lit?: (x: number, y: number) => number) {
  for (let i = 0; i < n; i++) {
    const hx = hash3(i, seed, 11);
    const hy = hash3(i, seed, 12);
    const hs = hash3(i, seed, 13);
    const px = x + ((hx * w + Math.sin(t * 0.21 * speed + i * 1.7) * 6 + t * speed * (hs - 0.4) * 1.5) % w + w) % w;
    const py = y + ((hy * h + t * speed * (0.8 + hs * 1.6) + Math.sin(t * 0.33 * speed + i) * 3) % h + h) % h;
    let a = k * (0.35 + 0.65 * Math.max(0, Math.sin(t * (0.5 + hs) + i * 2.3)));
    if (lit) a *= lit(px, py);
    if (a <= 0.02) continue;
    g.pxAdd(px, py, c, a);
  }
}

/** Falling rain streaks inside a rectangle. Stateless. */
export function rain(g: Gfx, t: number, x: number, y: number, w: number, h: number, n: number, c: Color, a: number, speed = 160, slant = 0.15, len = 5, seed = 3) {
  for (let i = 0; i < n; i++) {
    const hx = hash3(i, seed, 21);
    const hy = hash3(i, seed, 22);
    const sp = speed * (0.75 + hash3(i, seed, 23) * 0.5);
    const py = y + ((hy * h + t * sp) % h);
    const px = x + ((hx * w + (py - y) * slant) % w + w) % w;
    for (let j = 0; j < len; j++) g.pxA(px - j * slant, py - j, c, a * (1 - j / len));
  }
}

/** Bake an elliptical edge vignette into the current target (background only). */
export function vignette(g: Gfx, k: number, cx = 160, cy = 90, rx = 230, ry = 160, power = 2) {
  const b = g.buf;
  for (let by = 0; by < g.h; by++) {
    const dy = (by + g.oy - cy) / ry;
    for (let bx = 0; bx < g.w; bx++) {
      const dx = (bx + g.ox - cx) / rx;
      let d = dx * dx + dy * dy;
      if (d <= 0.15) continue;
      d = Math.min(1, (d - 0.15) / 0.85);
      const m = 1 - k * Math.pow(d, power / 2);
      const i = by * g.w + bx;
      b[i] = mulPx(b[i]!, Math.round(Math.max(0, m) * 256));
    }
  }
}

/** Blend a horizontal band toward c, alpha ramping a0 → a1 from y0 to y1 (dithered). */
export function haze(g: Gfx, y0: number, y1: number, c: Color, a0: number, a1: number) {
  const top = Math.max(g.top, Math.floor(y0));
  const bot = Math.min(g.bottom, Math.ceil(y1));
  for (let y = top; y < bot; y++) {
    const u = (y - y0) / Math.max(1, y1 - y0);
    const a = a0 + (a1 - a0) * u;
    if (a <= 0) continue;
    g.rectA(g.left, y, g.w, 1, c, a);
  }
}

/** Candle-like flicker, roughly 0.6–1. */
export function flicker(t: number, seed = 0, rate = 6): number {
  return 0.62 + 0.38 * (noise1(t * rate, seed) * 0.7 + noise1(t * rate * 2.7, seed + 9) * 0.3);
}

/**
 * Fill a rectangle with a value field mapped through a dark → light ramp with ordered
 * dithering. For backgrounds only (slow).
 */
export function field(g: Gfx, x0: number, y0: number, x1: number, y1: number, ramp: readonly Color[], fn: (x: number, y: number) => number) {
  const n = ramp.length - 1;
  const xa = Math.max(g.left, Math.floor(x0));
  const xb = Math.min(g.right, Math.ceil(x1));
  const ya = Math.max(g.top, Math.floor(y0));
  const yb = Math.min(g.bottom, Math.ceil(y1));
  for (let y = ya; y < yb; y++)
    for (let x = xa; x < xb; x++) {
      let v = fn(x, y);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      let k = Math.floor(v * n + bayer(x, y));
      if (k > n) k = n;
      g.px(x, y, ramp[k]!);
    }
}

/** Multiply a rectangle's brightness by a radial falloff around (cx, cy): bake soft shadow pools. */
export function darkPool(g: Gfx, cx: number, cy: number, rx: number, ry: number, k: number) {
  g.shadow(cx, cy, rx, ry, k);
}

/** A soft additive glow that is already pixel-quantized (wrapper with sensible defaults). */
export function bloom(g: Gfx, x: number, y: number, r: number, c: Color, k: number) {
  g.glow(x, y, r, c, k, 5);
}

/** Smooth 0→1→0 pulse over [0, d] with ease (for rare-event beats). */
export function bell(t: number, d: number): number {
  if (t <= 0 || t >= d) return 0;
  return Math.sin((t / d) * Math.PI);
}

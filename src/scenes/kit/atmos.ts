// Atmosphere: haze, drifting fog banks, light pools, beams, motes and rain. These are what
// make a flat diorama read as a place with air in it. All of them blend with dithered
// (quantized) alpha so they stay pixel art rather than smooth airbrush.
//
// Typical moody recipe for a scene:
//   background: draw flat → g.lighting(0.4) + g.light(lampX, lampY, 90, 0.9) → haze(…) on the far planes
//   frame:      characters → fog.draw(…) in front of the far planes → lightPool/beam/motes

import { type Color, blue, green, red } from './color';
import { type Gfx, bayer, bayer8 } from './gfx';
import { hash3, noise1 } from './rng';

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Blend one buffer pixel toward (cr, cg, cb) by k/256. */
function blendAt(b: Int32Array, i: number, cr: number, cg: number, cb: number, k: number) {
  const d = b[i]!;
  const dr = d & 255;
  const dg = (d >>> 8) & 255;
  const db = (d >>> 16) & 255;
  b[i] = 0xff000000 | ((db + (((cb - db) * k) >> 8)) << 16) | ((dg + (((cg - dg) * k) >> 8)) << 8) | (dr + (((cr - dr) * k) >> 8));
}

/**
 * Depth haze: blend rows toward `c`, alpha a0 at world y0 easing to a1 at y1 (rows beyond
 * keep the end alpha within [from, to)). Quantized to `steps` levels with 8×8 dithering.
 */
export function haze(g: Gfx, c: Color, y0: number, y1: number, a0: number, a1: number, from = g.top, to = g.bottom, steps = 8) {
  const cr = red(c);
  const cg = green(c);
  const cb = blue(c);
  const b = g.buf;
  for (let y = Math.max(from, g.top); y < Math.min(to, g.bottom); y++) {
    const t = smooth((y - y0) / (y1 - y0 || 1));
    const a = a0 + (a1 - a0) * t;
    if (a <= 0.004) continue;
    const row = (y - g.oy) * g.w;
    for (let bx = 0; bx < g.w; bx++) {
      const q = Math.floor(a * steps + bayer8(bx + g.ox, y)) / steps;
      if (q > 0) blendAt(b, row + bx, cr, cg, cb, (q * 256) | 0);
    }
  }
}

/** Tileable value noise on a W×H lattice grid (periods px, py). */
function pnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % px) + px) % px;
  const y0 = ((iy % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hash3(x0, y0, seed);
  const b = hash3(x1, y0, seed);
  const c = hash3(x0, y1, seed);
  const d = hash3(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface FogOptions {
  /** Feature size in pixels (default 48). */
  scale?: number;
  /** Vertical squash: fog banks are wider than tall (default 0.35). */
  squash?: number;
  /** How patchy, 0 (even veil) … 1 (separate wisps) (default 0.5). */
  patchy?: number;
  seed?: number;
}

/**
 * A drifting fog bank. Build once in create() (it bakes a 256×64 tileable texture), then
 * draw() each frame, or once in background() for still fog. Two banks at different speeds
 * and heights give parallax depth.
 */
export class Fog {
  private tex = new Uint8Array(256 * 64);

  constructor(o: FogOptions = {}) {
    const scale = o.scale ?? 48;
    const squash = o.squash ?? 0.35;
    const patchy = o.patchy ?? 0.5;
    const seed = o.seed ?? 1;
    // Periods must divide the texture size so it tiles.
    const p1 = Math.max(1, Math.round(256 / scale));
    const v1 = Math.max(1, Math.round((64 * squash * 4) / scale));
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 256; x++) {
        let v = 0;
        let amp = 0.55;
        let norm = 0;
        for (let o2 = 0; o2 < 3; o2++) {
          const f = 1 << o2;
          v += pnoise((x / 256) * p1 * f, (y / 64) * v1 * f, p1 * f, v1 * f, seed + o2 * 17) * amp;
          norm += amp;
          amp *= 0.5;
        }
        v /= norm;
        // Patchiness: push the noise through a contrast curve around the middle.
        const k = 1 + patchy * 3;
        v = smooth(0.5 + (v - 0.5) * k);
        this.tex[y * 256 + x] = Math.round(v * 255);
      }
  }

  /**
   * Draw the bank between world rows y0 and y1, alpha up to `alpha`, drifting at `speed`
   * px/s. `shape`: 'band' fades at both edges, 'ground' is densest at the bottom, 'ceiling'
   * densest at the top. Alpha is quantized to `steps` dithered levels.
   */
  draw(g: Gfx, t: number, y0: number, y1: number, c: Color, alpha: number, speed = 3, shape: 'band' | 'ground' | 'ceiling' = 'band', steps = 6, x0 = g.left, x1 = g.right) {
    const cr = red(c);
    const cg = green(c);
    const cb = blue(c);
    const b = g.buf;
    const off = Math.floor(t * speed);
    const h = y1 - y0 || 1;
    const bx0 = Math.max(0, Math.floor(x0) - g.ox);
    const bx1 = Math.min(g.w, Math.ceil(x1) - g.ox);
    for (let y = Math.max(Math.floor(y0), g.top); y < Math.min(Math.ceil(y1), g.bottom); y++) {
      const u = (y - y0) / h;
      const prof = shape === 'band' ? Math.sin(Math.PI * u) : shape === 'ground' ? smooth(u * 1.6) : smooth((1 - u) * 1.6);
      const ra = alpha * prof;
      if (ra <= 0.01) continue;
      const trow = (((Math.floor(u * 63) % 64) + 64) % 64) * 256;
      const row = (y - g.oy) * g.w;
      for (let bx = bx0; bx < bx1; bx++) {
        const wx = bx + g.ox;
        const a = ra * this.tex[trow + ((wx + off) & 255)]! * (1 / 255);
        const q = Math.floor(a * steps + bayer(wx, y)) / steps;
        if (q > 0) blendAt(b, row + bx, cr, cg, cb, (q * 256) | 0);
      }
    }
  }
}

/**
 * Soft elliptical light pool (additive), e.g. lamp light on a desk or floor. Falloff is
 * quantized to `steps` dithered bands so it stays crisp.
 */
export function lightPool(g: Gfx, cx: number, cy: number, rx: number, ry: number, c: Color, k: number, steps = 5) {
  if (rx <= 0 || ry <= 0 || k <= 0) return;
  const r0 = red(c) * k;
  const g0 = green(c) * k;
  const b0 = blue(c) * k;
  const b = g.buf;
  const x0 = Math.max(0, Math.floor(cx - rx) - g.ox);
  const x1 = Math.min(g.w - 1, Math.ceil(cx + rx) - g.ox);
  const y0 = Math.max(0, Math.floor(cy - ry) - g.oy);
  const y1 = Math.min(g.h - 1, Math.ceil(cy + ry) - g.oy);
  for (let by = y0; by <= y1; by++) {
    const dy = (by + g.oy + 0.5 - cy) / ry;
    const row = by * g.w;
    for (let bx = x0; bx <= x1; bx++) {
      const dx = (bx + g.ox + 0.5 - cx) / rx;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      let f = (1 - d) * (1 - d);
      f = Math.floor(f * steps + bayer(bx + g.ox, by + g.oy)) / steps;
      if (f <= 0) continue;
      const p = b[row + bx]!;
      let r = (p & 255) + r0 * f;
      let gg = ((p >>> 8) & 255) + g0 * f;
      let bb = ((p >>> 16) & 255) + b0 * f;
      if (r > 255) r = 255;
      if (gg > 255) gg = 255;
      if (bb > 255) bb = 255;
      b[row + bx] = 0xff000000 | ((bb | 0) << 16) | ((gg | 0) << 8) | (r | 0);
    }
  }
}

/**
 * A volumetric beam from (x0, y0) to (x1, y1), w0 wide at the source and w1 at the far end,
 * fading along its length and softly at its edges. Additive. `steps` dithered bands.
 */
export function beam(g: Gfx, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, c: Color, k: number, steps = 6) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1 || k <= 0) return;
  const len = Math.sqrt(len2);
  const nx = -dy / len;
  const ny = dx / len;
  const hw = Math.max(w0, w1) / 2 + 1;
  const minX = Math.max(g.left, Math.floor(Math.min(x0, x1) - hw));
  const maxX = Math.min(g.right - 1, Math.ceil(Math.max(x0, x1) + hw));
  const minY = Math.max(g.top, Math.floor(Math.min(y0, y1) - hw));
  const maxY = Math.min(g.bottom - 1, Math.ceil(Math.max(y0, y1) + hw));
  const r0 = red(c) * k;
  const g0 = green(c) * k;
  const b0 = blue(c) * k;
  const b = g.buf;
  for (let y = minY; y <= maxY; y++) {
    const row = (y - g.oy) * g.w;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const along = (px * dx + py * dy) / len2;
      if (along < 0 || along > 1) continue;
      const across = Math.abs(px * nx + py * ny);
      const half = (w0 + (w1 - w0) * along) / 2;
      if (across >= half) continue;
      const edge = 1 - across / half;
      let f = smooth(edge * 1.6) * (1 - along) * smooth(along * 8);
      f = Math.floor(f * steps + bayer(x, y)) / steps;
      if (f <= 0) continue;
      const i = row + (x - g.ox);
      const p = b[i]!;
      let r = (p & 255) + r0 * f;
      let gg = ((p >>> 8) & 255) + g0 * f;
      let bb = ((p >>> 16) & 255) + b0 * f;
      if (r > 255) r = 255;
      if (gg > 255) gg = 255;
      if (bb > 255) bb = 255;
      b[i] = 0xff000000 | ((bb | 0) << 16) | ((gg | 0) << 8) | (r | 0);
    }
  }
}

/**
 * Dust motes drifting slowly through a rectangle (stateless). They twinkle as they turn, so a
 * few dozen are plenty. Pair with a beam or lamp; dim them where there's no light.
 */
export function motes(g: Gfx, t: number, x0: number, y0: number, x1: number, y1: number, n: number, c: Color, k = 0.5, seed = 0, rise = 0.6) {
  const w = x1 - x0;
  const h = y1 - y0;
  for (let i = 0; i < n; i++) {
    const sx = hash3(i, seed, 1);
    const sy = hash3(i, seed, 2);
    const sp = 0.4 + hash3(i, seed, 3);
    const x = x0 + ((((sx * w + noise1(t * 0.15 * sp + i, seed) * 18 - 9) % w) + w) % w);
    const y = y0 + ((((sy * h - t * rise * sp * 2) % h) + h) % h);
    const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + sp) + i * 2.1);
    g.pxAdd(x, y, c, k * tw);
  }
}

/**
 * Rain: thin slanted streaks (stateless). `slant` is x drift per pixel fallen. Draw a far
 * layer (short, dim, slow) and a near one (long, brighter, fast) for depth.
 */
export function rain(g: Gfx, t: number, x0: number, y0: number, x1: number, y1: number, n: number, c: Color, a = 0.35, len = 6, speed = 160, slant = 0.15, seed = 0) {
  const w = x1 - x0;
  const h = y1 - y0 + len;
  for (let i = 0; i < n; i++) {
    const sp = speed * (0.85 + hash3(i, seed, 3) * 0.3);
    // Negative speed makes it fall upward (other realities).
    const p = (((hash3(i, seed, 2) * h + t * sp) % h) + h) % h;
    const y = y0 - len + p;
    const x = x0 + ((((hash3(i, seed, 1) * w + p * slant) % w) + w) % w);
    for (let k = 0; k < len; k++) {
      const yy = y + k;
      if (yy < y0 || yy >= y1) continue;
      g.pxA(x + k * slant, yy, c, a * (0.4 + (0.6 * k) / len));
    }
  }
}

/** Candle/neon flicker: a value around 1 (±depth) that wobbles irregularly. */
export function flicker(t: number, seed = 0, depth = 0.12, speed = 7): number {
  return 1 - depth + depth * (noise1(t * speed, seed) * 1.3 + noise1(t * speed * 2.7, seed + 9) * 0.7);
}

/**
 * Darken a rectangle toward its bottom (or top) edge: grounding shadows under furniture, the
 * dark floor in front of the subject, the gloom of a ceiling. Multiplies brightness.
 */
export function gloom(g: Gfx, x: number, y: number, w: number, h: number, k: number, fromTop = false, steps = 8) {
  const b = g.buf;
  const bx0 = Math.max(0, Math.floor(x) - g.ox);
  const bx1 = Math.min(g.w, Math.floor(x + w) - g.ox);
  for (let yy = Math.max(Math.floor(y), g.top); yy < Math.min(Math.floor(y + h), g.bottom); yy++) {
    const u = (yy - y) / (h || 1);
    const s = smooth(fromTop ? 1 - u : u) * k;
    const row = (yy - g.oy) * g.w;
    for (let bx = bx0; bx < bx1; bx++) {
      const q = Math.floor(s * steps + bayer8(bx + g.ox, yy)) / steps;
      if (q <= 0) continue;
      const m = ((1 - q) * 256) | 0;
      const p = b[row + bx]!;
      b[row + bx] = 0xff000000 | ((((p >>> 16) & 255) * m) >> 8 << 16) | ((((p >>> 8) & 255) * m) >> 8 << 8) | (((p & 255) * m) >> 8);
    }
  }
}

/** Rim light: brighten the pixels of an existing silhouette along one side (additive). */
export function rimLight(g: Gfx, x: number, y: number, w: number, h: number, isSubject: (c: Color) => boolean, c: Color, k: number, fromLeft = true) {
  const b = g.buf;
  for (let yy = Math.max(Math.floor(y), g.top); yy < Math.min(Math.floor(y + h), g.bottom); yy++) {
    const row = (yy - g.oy) * g.w;
    let prevIn = false;
    const xs = fromLeft ? Math.floor(x) : Math.floor(x + w) - 1;
    const step = fromLeft ? 1 : -1;
    for (let n = 0; n < w; n++) {
      const xx = xs + n * step;
      if (xx < g.left || xx >= g.right) continue;
      const i = row + (xx - g.ox);
      const inside = isSubject(b[i]!);
      if (inside && !prevIn) {
        const p = b[i]!;
        let r = (p & 255) + red(c) * k;
        let gg = ((p >>> 8) & 255) + green(c) * k;
        let bb = ((p >>> 16) & 255) + blue(c) * k;
        if (r > 255) r = 255;
        if (gg > 255) gg = 255;
        if (bb > 255) bb = 255;
        b[i] = 0xff000000 | ((bb | 0) << 16) | ((gg | 0) << 8) | (r | 0);
      }
      prevIn = inside;
    }
  }
}

/**
 * Glossy-floor (or wet-street, or still-water) reflection: whatever was drawn this frame in
 * the columns [x0, x1) above world row `footY` (pixels that differ from the background) is
 * mirrored below it, fading out over `h` rows. Call right after drawing a figure that stands
 * at footY. `alpha` is the reflection's strength at the feet; `ripple` wobbles it sideways.
 */
export function reflectDown(g: Gfx, x0: number, x1: number, footY: number, h: number, alpha: number, ripple = 0, t = 0) {
  const f = g.frame;
  const bgb = g.bg;
  const b = g.buf;
  const bx0 = Math.max(0, Math.floor(x0) - g.ox);
  const bx1 = Math.min(g.w, Math.ceil(x1) - g.ox);
  for (let k = 0; k < h; k++) {
    const sy = Math.floor(footY) - 1 - k - g.oy;
    const dy = Math.floor(footY) + k - g.oy;
    if (sy < 0 || dy >= g.h || dy < 0) continue;
    const q = Math.floor(alpha * (1 - k / h) * 6 + 0.5) / 6;
    if (q <= 0) continue;
    const wob = ripple ? Math.round(Math.sin(t * 3 + k * 0.9) * ripple * (k / h)) : 0;
    for (let bx = bx0; bx < bx1; bx++) {
      const si = sy * g.w + bx;
      const c = f[si]!;
      if (c === bgb[si]) continue;
      const tx = bx + wob;
      if (tx < 0 || tx >= g.w) continue;
      blendAt(b, dy * g.w + tx, c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (q * 256) | 0);
    }
  }
}

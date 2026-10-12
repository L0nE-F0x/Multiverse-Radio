// The pixel raster every scene draws into: a small Int32Array framebuffer that the
// runner blits to a canvas once per frame and the browser upscales with nearest-neighbour.
//
// Scenes draw in *world* coordinates. The design area is 320×180, but the view adapts to
// the container's aspect ratio (wider, or taller in portrait), so the buffer may start at
// a negative world x/y and extend past 320/180. Backgrounds should fill the whole view
// (use `left/right/top/bottom`), and subjects should sit in the central ~60% of the width.

import { type Color, blue, green, red } from './color';
import { FONT_HEIGHT, glyph, textWidth } from './font';
import type { Sprite } from './sprite';

export const W = 320;
export const H = 180;

const POLY_XS: number[] = [];
const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));

/** Ordered-dither threshold for a pixel, 0..1. */
export function bayer(x: number, y: number): number {
  return BAYER[((y & 3) << 2) | (x & 3)]!;
}

const BAYER8 = (() => {
  const m = new Float32Array(64);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      // Bit-interleave x^y and y (reversed) for the classic 8×8 matrix.
      const a = x ^ y;
      const v = ((a & 1) << 5) | ((y & 1) << 4) | ((a & 2) << 2) | ((y & 2) << 1) | ((a & 4) >> 1) | ((y & 4) >> 2);
      m[y * 8 + x] = (v + 0.5) / 64;
    }
  return m;
})();

/** Finer 8×8 ordered-dither threshold, 0..1: 64 levels for smooth skies and fog. */
export function bayer8(x: number, y: number): number {
  return BAYER8[((y & 7) << 3) | (x & 7)]!;
}

export class Gfx {
  /** Buffer size in pixels. */
  w = 0;
  h = 0;
  /** World coordinate of the buffer's top-left pixel. */
  ox = 0;
  oy = 0;
  /** Current draw target (frame by default). */
  buf: Int32Array = new Int32Array(0);
  /** The frame that is shown. */
  frame: Int32Array = new Int32Array(0);
  /** Static background restored at the start of every frame. */
  bg: Int32Array = new Int32Array(0);
  /**
   * Exposure map (one float per buffer pixel, 1 = as drawn), or null for even light. Built in
   * background() with lighting()/light(); the runner's post pass multiplies every frame by it,
   * so animated things darken as they leave the light.
   */
  exposure: Float32Array | null = null;
  /** Bumped whenever the exposure map changes. */
  exposureVersion = 0;
  // Clip rectangle in buffer coordinates (left/top inclusive, right/bottom exclusive).
  private cl = 0;
  private ct = 0;
  private cr = 0;
  private cb = 0;

  constructor(w = W, h = H, ox = 0, oy = 0) {
    this.resize(w, h, ox, oy);
  }

  resize(w: number, h: number, ox: number, oy: number) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.frame = new Int32Array(w * h);
    this.bg = new Int32Array(w * h);
    this.buf = this.frame;
    this.exposure = null;
    this.exposureVersion++;
    this.noClip();
  }

  // ── lighting (exposure map) ──────────────────────────────────────────

  /**
   * Light the scene: start an exposure map with everything at `ambient` (e.g. 0.45 for a dim
   * room), then add sources with light()/lightRect(). Call from background(). Exposure
   * multiplies the final picture (up to ~1.45), so it darkens sprites too.
   */
  lighting(ambient: number) {
    if (!this.exposure || this.exposure.length !== this.w * this.h) this.exposure = new Float32Array(this.w * this.h);
    this.exposure.fill(ambient);
    this.exposureVersion++;
  }

  /** A soft light in the exposure map: +k at (x, y), fading smoothly to nothing at rx/ry. */
  light(x: number, y: number, rx: number, k = 0.6, ry = rx) {
    const e = this.exposure;
    if (!e || rx <= 0 || ry <= 0) return;
    const x0 = Math.max(0, Math.floor(x - rx) - this.ox);
    const x1 = Math.min(this.w - 1, Math.ceil(x + rx) - this.ox);
    const y0 = Math.max(0, Math.floor(y - ry) - this.oy);
    const y1 = Math.min(this.h - 1, Math.ceil(y + ry) - this.oy);
    for (let by = y0; by <= y1; by++) {
      const dy = (by + this.oy + 0.5 - y) / ry;
      for (let bx = x0; bx <= x1; bx++) {
        const dx = (bx + this.ox + 0.5 - x) / rx;
        const d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const f = 1 - d;
        e[by * this.w + bx]! += k * f * f;
      }
    }
    this.exposureVersion++;
  }

  /** Add k over a rectangle, feathered over `soft` pixels at the edges (window light, screens). */
  lightRect(x: number, y: number, w: number, h: number, k: number, soft = 6) {
    const e = this.exposure;
    if (!e) return;
    const x0 = Math.max(0, Math.floor(x - soft) - this.ox);
    const x1 = Math.min(this.w, Math.ceil(x + w + soft) - this.ox);
    const y0 = Math.max(0, Math.floor(y - soft) - this.oy);
    const y1 = Math.min(this.h, Math.ceil(y + h + soft) - this.oy);
    const s = Math.max(0.001, soft);
    for (let by = y0; by < y1; by++) {
      const wy = by + this.oy + 0.5;
      const fy = Math.min(1, Math.max(0, Math.min(wy - (y - s), y + h + s - wy) / (2 * s)));
      for (let bx = x0; bx < x1; bx++) {
        const wx = bx + this.ox + 0.5;
        const fx = Math.min(1, Math.max(0, Math.min(wx - (x - s), x + w + s - wx) / (2 * s)));
        const f = fx * fy;
        e[by * this.w + bx]! += k * f * f * (3 - 2 * f);
      }
    }
    this.exposureVersion++;
  }

  /** Exposure at a world point (1 when there is no map). */
  exposureAt(x: number, y: number): number {
    const e = this.exposure;
    if (!e) return 1;
    const bx = Math.floor(x) - this.ox;
    const by = Math.floor(y) - this.oy;
    if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) return 1;
    return e[by * this.w + bx]!;
  }

  /** Restrict drawing to a world-space rectangle. */
  clip(x: number, y: number, w: number, h: number) {
    this.cl = Math.max(0, Math.floor(x) - this.ox);
    this.ct = Math.max(0, Math.floor(y) - this.oy);
    this.cr = Math.min(this.w, Math.floor(x) + Math.round(w) - this.ox);
    this.cb = Math.min(this.h, Math.floor(y) + Math.round(h) - this.oy);
  }

  noClip() {
    this.cl = 0;
    this.ct = 0;
    this.cr = this.w;
    this.cb = this.h;
  }

  // World-space extents of the view.
  get left() {
    return this.ox;
  }
  get right() {
    return this.ox + this.w;
  }
  get top() {
    return this.oy;
  }
  get bottom() {
    return this.oy + this.h;
  }

  /** A transparent full-view layer (for static foregrounds). */
  layer(): Int32Array {
    return new Int32Array(this.w * this.h);
  }

  /** Redirect drawing to another buffer of the same size (or back to the frame). */
  target(buf?: Int32Array) {
    this.buf = buf ?? this.frame;
  }

  /** Start a frame from the static background. */
  restore() {
    this.frame.set(this.bg);
  }

  /** Composite a layer's opaque pixels over the current target. */
  overlay(layer: Int32Array) {
    const b = this.buf;
    for (let i = 0; i < layer.length; i++) {
      const c = layer[i]!;
      if (c !== 0) b[i] = c;
    }
  }

  // ── pixels ────────────────────────────────────────────────────────────

  px(x: number, y: number, c: Color) {
    const bx = Math.floor(x) - this.ox;
    const by = Math.floor(y) - this.oy;
    if (bx < this.cl || by < this.ct || bx >= this.cr || by >= this.cb) return;
    this.buf[by * this.w + bx] = c;
  }

  get(x: number, y: number): Color {
    const bx = Math.floor(x) - this.ox;
    const by = Math.floor(y) - this.oy;
    if (bx < this.cl || by < this.ct || bx >= this.cr || by >= this.cb) return 0;
    return this.buf[by * this.w + bx]!;
  }

  /** Alpha-blend a pixel (a 0..1). */
  pxA(x: number, y: number, c: Color, a: number) {
    const bx = Math.floor(x) - this.ox;
    const by = Math.floor(y) - this.oy;
    if (bx < this.cl || by < this.ct || bx >= this.cr || by >= this.cb) return;
    const i = by * this.w + bx;
    this.buf[i] = blendPx(this.buf[i]!, c, a);
  }

  /** Additive pixel. */
  pxAdd(x: number, y: number, c: Color, k = 1) {
    const bx = Math.floor(x) - this.ox;
    const by = Math.floor(y) - this.oy;
    if (bx < this.cl || by < this.ct || bx >= this.cr || by >= this.cb) return;
    const i = by * this.w + bx;
    this.buf[i] = addPx(this.buf[i]!, red(c) * k, green(c) * k, blue(c) * k);
  }

  // ── rectangles and lines ─────────────────────────────────────────────

  private clipRect(x: number, y: number, w: number, h: number): [number, number, number, number] | null {
    let x0 = Math.floor(x) - this.ox;
    let y0 = Math.floor(y) - this.oy;
    let x1 = x0 + Math.round(w);
    let y1 = y0 + Math.round(h);
    if (x0 < this.cl) x0 = this.cl;
    if (y0 < this.ct) y0 = this.ct;
    if (x1 > this.cr) x1 = this.cr;
    if (y1 > this.cb) y1 = this.cb;
    if (x1 <= x0 || y1 <= y0) return null;
    return [x0, y0, x1, y1];
  }

  rect(x: number, y: number, w: number, h: number, c: Color) {
    let x0 = Math.floor(x) - this.ox;
    let y0 = Math.floor(y) - this.oy;
    let x1 = x0 + Math.round(w);
    let y1 = y0 + Math.round(h);
    if (x0 < this.cl) x0 = this.cl;
    if (y0 < this.ct) y0 = this.ct;
    if (x1 > this.cr) x1 = this.cr;
    if (y1 > this.cb) y1 = this.cb;
    if (x1 <= x0 || y1 <= y0) return;
    const b = this.buf;
    for (let yy = y0; yy < y1; yy++) b.fill(c, yy * this.w + x0, yy * this.w + x1);
  }

  /** Alpha-blended rectangle. */
  rectA(x: number, y: number, w: number, h: number, c: Color, a: number) {
    if (a <= 0) return;
    if (a >= 1) return this.rect(x, y, w, h, c);
    const r = this.clipRect(x, y, w, h);
    if (!r) return;
    const b = this.buf;
    const cr = red(c);
    const cg = green(c);
    const cb = blue(c);
    const k = Math.round(a * 256);
    for (let yy = r[1]; yy < r[3]; yy++) {
      const row = yy * this.w;
      for (let xx = r[0]; xx < r[2]; xx++) {
        const d = b[row + xx]!;
        const dr = d & 255;
        const dg = (d >>> 8) & 255;
        const db = (d >>> 16) & 255;
        b[row + xx] =
          (0xff000000 | ((db + (((cb - db) * k) >> 8)) << 16) | ((dg + (((cg - dg) * k) >> 8)) << 8) | (dr + (((cr - dr) * k) >> 8))) | 0;
      }
    }
  }

  /** Ordered-dither rectangle: covers fraction `a` of the pixels. */
  rectD(x: number, y: number, w: number, h: number, c: Color, a: number) {
    if (a <= 0) return;
    const r = this.clipRect(x, y, w, h);
    if (!r) return;
    const b = this.buf;
    for (let yy = r[1]; yy < r[3]; yy++) {
      const row = yy * this.w;
      const wy = yy + this.oy;
      for (let xx = r[0]; xx < r[2]; xx++) if (a > BAYER[((wy & 3) << 2) | ((xx + this.ox) & 3)]!) b[row + xx] = c;
    }
  }

  /** Multiply brightness of a rectangle (k < 1 darkens). */
  rectMul(x: number, y: number, w: number, h: number, k: number) {
    const r = this.clipRect(x, y, w, h);
    if (!r) return;
    const b = this.buf;
    const m = Math.round(k * 256);
    for (let yy = r[1]; yy < r[3]; yy++) {
      const row = yy * this.w;
      for (let xx = r[0]; xx < r[2]; xx++) b[row + xx] = mulPx(b[row + xx]!, m);
    }
  }

  /** Additive rectangle. */
  rectAdd(x: number, y: number, w: number, h: number, c: Color, k = 1) {
    const r = this.clipRect(x, y, w, h);
    if (!r) return;
    const b = this.buf;
    const cr = red(c) * k;
    const cg = green(c) * k;
    const cb = blue(c) * k;
    for (let yy = r[1]; yy < r[3]; yy++) {
      const row = yy * this.w;
      for (let xx = r[0]; xx < r[2]; xx++) b[row + xx] = addPx(b[row + xx]!, cr, cg, cb);
    }
  }

  /** Blend the whole target toward a color. */
  tintAll(c: Color, a: number) {
    this.rectA(this.ox, this.oy, this.w, this.h, c, a);
  }

  hline(x0: number, x1: number, y: number, c: Color) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    this.rect(x0, y, Math.floor(x1) - Math.floor(x0) + 1, 1, c);
  }

  vline(x: number, y0: number, y1: number, c: Color) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    this.rect(x, y0, 1, Math.floor(y1) - Math.floor(y0) + 1, c);
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Alpha-blended line. */
  lineA(x0: number, y0: number, x1: number, y1: number, c: Color, a: number) {
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      this.pxA(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  // ── round things ─────────────────────────────────────────────────────

  /** Filled ellipse (pixel-art friendly edges). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color) {
    if (rx <= 0 || ry <= 0) return;
    const r = Math.ceil(ry);
    for (let dy = -r; dy <= r; dy++) {
      const t = 1 - ((dy * dy) / ((ry + 0.5) * (ry + 0.5)));
      if (t <= 0) continue;
      const hw = Math.floor(Math.sqrt(t) * (rx + 0.5));
      this.rect(Math.floor(cx) - hw, Math.floor(cy) + dy, hw * 2 + 1, 1, c);
    }
  }

  disc(cx: number, cy: number, r: number, c: Color) {
    this.ellipse(cx, cy, r, r, c);
  }

  /** Alpha-blended ellipse. */
  ellipseA(cx: number, cy: number, rx: number, ry: number, c: Color, a: number) {
    if (rx <= 0 || ry <= 0) return;
    const r = Math.ceil(ry);
    for (let dy = -r; dy <= r; dy++) {
      const t = 1 - ((dy * dy) / ((ry + 0.5) * (ry + 0.5)));
      if (t <= 0) continue;
      const hw = Math.floor(Math.sqrt(t) * (rx + 0.5));
      this.rectA(Math.floor(cx) - hw, Math.floor(cy) + dy, hw * 2 + 1, 1, c, a);
    }
  }

  /** Dithered ellipse covering fraction a. */
  ellipseD(cx: number, cy: number, rx: number, ry: number, c: Color, a: number) {
    if (rx <= 0 || ry <= 0) return;
    const r = Math.ceil(ry);
    for (let dy = -r; dy <= r; dy++) {
      const t = 1 - ((dy * dy) / ((ry + 0.5) * (ry + 0.5)));
      if (t <= 0) continue;
      const hw = Math.floor(Math.sqrt(t) * (rx + 0.5));
      this.rectD(Math.floor(cx) - hw, Math.floor(cy) + dy, hw * 2 + 1, 1, c, a);
    }
  }

  /** 1px ring. */
  ring(cx: number, cy: number, rx: number, ry: number, c: Color) {
    const n = Math.max(12, Math.ceil((rx + ry) * 4));
    let px = Number.NaN;
    let py = Number.NaN;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rx);
      const y = Math.round(cy + Math.sin(a) * ry);
      if (x !== px || y !== py) this.px(x, y, c);
      px = x;
      py = y;
    }
  }

  /**
   * Shaded ellipse ("ball"): light from (lx, ly) (screen-space, -1..1), quantized into
   * `ramp` (dark → light) with ordered dithering.
   */
  ball(cx: number, cy: number, rx: number, ry: number, ramp: readonly Color[], lx = -0.5, ly = -0.6, ambient = 0.15) {
    if (rx <= 0 || ry <= 0) return;
    const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
    const n = ramp.length - 1;
    const iy = Math.ceil(ry);
    const ix = Math.ceil(rx);
    const fcx = Math.floor(cx);
    const fcy = Math.floor(cy);
    for (let dy = -iy; dy <= iy; dy++) {
      const ny = dy / (ry + 0.5);
      for (let dx = -ix; dx <= ix; dx++) {
        const nx = dx / (rx + 0.5);
        const d2 = nx * nx + ny * ny;
        if (d2 >= 1) continue;
        const bx = fcx + dx - this.ox;
        const by = fcy + dy - this.oy;
        if (bx < this.cl || by < this.ct || bx >= this.cr || by >= this.cb) continue;
        const nz = Math.sqrt(1 - d2);
        let l = nx * lx + ny * ly + nz * lz;
        l = ambient + (1 - ambient) * (l < 0 ? 0 : l);
        let k = Math.floor(l * n + BAYER[(((fcy + dy) & 3) << 2) | ((fcx + dx) & 3)]!);
        if (k > n) k = n;
        this.buf[by * this.w + bx] = ramp[k]!;
      }
    }
  }

  /**
   * Additive radial glow. `k` scales intensity; `steps` > 0 quantizes the falloff with
   * dithering for a pixel-art look.
   */
  glow(cx: number, cy: number, r: number, c: Color, k = 1, steps = 0) {
    if (r <= 0 || k <= 0) return;
    const cr = red(c) * k;
    const cg = green(c) * k;
    const cb = blue(c) * k;
    const r2 = r * r;
    const fcx = Math.floor(cx);
    const fcy = Math.floor(cy);
    const ir = Math.ceil(r);
    let y0 = fcy - ir - this.oy;
    let y1 = fcy + ir - this.oy;
    let x0 = fcx - ir - this.ox;
    let x1 = fcx + ir - this.ox;
    if (y0 < this.ct) y0 = this.ct;
    if (x0 < this.cl) x0 = this.cl;
    if (y1 >= this.cb) y1 = this.cb - 1;
    if (x1 >= this.cr) x1 = this.cr - 1;
    const b = this.buf;
    const ox = this.ox;
    const oy = this.oy;
    for (let by = y0; by <= y1; by++) {
      const dy = by + oy - fcy;
      const row = by * this.w;
      for (let bx = x0; bx <= x1; bx++) {
        const dx = bx + ox - fcx;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        let f = 1 - d2 / r2;
        f *= f;
        if (steps > 0) f = Math.floor(f * steps + BAYER[(((by + oy) & 3) << 2) | ((bx + ox) & 3)]!) / steps;
        if (f <= 0) continue;
        b[row + bx] = addPx(b[row + bx]!, cr * f, cg * f, cb * f);
      }
    }
  }

  /** Darken around a point (soft shadow / vignette blob). */
  shadow(cx: number, cy: number, rx: number, ry: number, k: number) {
    const fcx = Math.floor(cx);
    const fcy = Math.floor(cy);
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d >= 1) continue;
        const bx = fcx + dx - this.ox;
        const by = fcy + dy - this.oy;
        if (bx < this.cl || by < this.ct || bx >= this.cr || by >= this.cb) continue;
        const i = by * this.w + bx;
        this.buf[i] = mulPx(this.buf[i]!, Math.round((1 - k * (1 - d)) * 256));
      }
    }
  }

  // ── polygons ─────────────────────────────────────────────────────────

  /** Filled triangle. mode: 0 solid, 1 alpha blend (a), 2 additive (a = intensity), 3 dither (a). */
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: Color, mode = 0, a = 1) {
    // sort by y
    if (y1 < y0) [x0, y0, x1, y1] = [x1, y1, x0, y0];
    if (y2 < y0) [x0, y0, x2, y2] = [x2, y2, x0, y0];
    if (y2 < y1) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const ys = Math.ceil(y0 - 0.5);
    const ye = Math.ceil(y2 - 0.5);
    for (let y = ys; y < ye; y++) {
      const sy = y + 0.5;
      const xa = x0 + ((x2 - x0) * (sy - y0)) / (y2 - y0 || 1);
      const xb = sy < y1 ? x0 + ((x1 - x0) * (sy - y0)) / (y1 - y0 || 1) : x1 + ((x2 - x1) * (sy - y1)) / (y2 - y1 || 1);
      const l = Math.ceil(Math.min(xa, xb) - 0.5);
      const r = Math.ceil(Math.max(xa, xb) - 0.5);
      if (r <= l) continue;
      if (mode === 0) this.rect(l, y, r - l, 1, c);
      else if (mode === 1) this.rectA(l, y, r - l, 1, c, a);
      else if (mode === 2) this.rectAdd(l, y, r - l, 1, c, a);
      else this.rectD(l, y, r - l, 1, c, a);
    }
  }

  /** Filled polygon from a flat [x0,y0,x1,y1,...] array (even-odd), optionally offset by (dx, dy). */
  poly(pts: readonly number[], c: Color, mode = 0, a = 1, dx = 0, dy = 0) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) {
      if (pts[i]! + dy < minY) minY = pts[i]! + dy;
      if (pts[i]! + dy > maxY) maxY = pts[i]! + dy;
    }
    const n = pts.length / 2;
    const xs = POLY_XS;
    for (let y = Math.ceil(minY - 0.5); y < Math.ceil(maxY - 0.5); y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2]! + dx;
        const ay = pts[i * 2 + 1]! + dy;
        const bx = pts[((i + 1) % n) * 2]! + dx;
        const by = pts[((i + 1) % n) * 2 + 1]! + dy;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const l = Math.ceil(xs[k]! - 0.5);
        const r = Math.ceil(xs[k + 1]! - 0.5);
        if (r <= l) continue;
        if (mode === 0) this.rect(l, y, r - l, 1, c);
        else if (mode === 1) this.rectA(l, y, r - l, 1, c, a);
        else if (mode === 2) this.rectAdd(l, y, r - l, 1, c, a);
        else this.rectD(l, y, r - l, 1, c, a);
      }
    }
  }

  // ── sprites and text ─────────────────────────────────────────────────

  blit(s: Sprite, x: number, y: number, flip = false) {
    const x0 = Math.floor(x) - this.ox;
    const y0 = Math.floor(y) - this.oy;
    const b = this.buf;
    const W = this.w;
    for (let sy = 0; sy < s.h; sy++) {
      const by = y0 + sy;
      if (by < this.ct || by >= this.cb) continue;
      const srow = sy * s.w;
      for (let sx = 0; sx < s.w; sx++) {
        const c = s.d[srow + (flip ? s.w - 1 - sx : sx)]!;
        if (c === 0) continue;
        const bx = x0 + sx;
        if (bx < this.cl || bx >= this.cr) continue;
        b[by * W + bx] = c;
      }
    }
  }

  /** Sprite drawn upside down (and optionally mirrored). */
  blitV(s: Sprite, x: number, y: number, flip = false) {
    const x0 = Math.floor(x) - this.ox;
    const y0 = Math.floor(y) - this.oy;
    for (let sy = 0; sy < s.h; sy++) {
      const by = y0 + (s.h - 1 - sy);
      if (by < this.ct || by >= this.cb) continue;
      for (let sx = 0; sx < s.w; sx++) {
        const c = s.d[sy * s.w + (flip ? s.w - 1 - sx : sx)]!;
        if (c === 0) continue;
        const bx = x0 + sx;
        if (bx < this.cl || bx >= this.cr) continue;
        this.buf[by * this.w + bx] = c;
      }
    }
  }

  /** Translucent sprite (a 0..1). */
  blitA(s: Sprite, x: number, y: number, a: number, flip = false) {
    const x0 = Math.floor(x) - this.ox;
    const y0 = Math.floor(y) - this.oy;
    for (let sy = 0; sy < s.h; sy++) {
      const by = y0 + sy;
      if (by < this.ct || by >= this.cb) continue;
      for (let sx = 0; sx < s.w; sx++) {
        const c = s.d[sy * s.w + (flip ? s.w - 1 - sx : sx)]!;
        if (c === 0) continue;
        const bx = x0 + sx;
        if (bx < this.cl || bx >= this.cr) continue;
        const i = by * this.w + bx;
        this.buf[i] = blendPx(this.buf[i]!, c, a);
      }
    }
  }

  /** Sprite silhouette in a single color. */
  blitSolid(s: Sprite, x: number, y: number, c: Color, flip = false) {
    const x0 = Math.floor(x) - this.ox;
    const y0 = Math.floor(y) - this.oy;
    for (let sy = 0; sy < s.h; sy++) {
      const by = y0 + sy;
      if (by < this.ct || by >= this.cb) continue;
      for (let sx = 0; sx < s.w; sx++) {
        if (s.d[sy * s.w + (flip ? s.w - 1 - sx : sx)] === 0) continue;
        const bx = x0 + sx;
        if (bx < this.cl || bx >= this.cr) continue;
        this.buf[by * this.w + bx] = c;
      }
    }
  }

  /** 5px-tall pixel text. Returns the width drawn. */
  text(s: string, x: number, y: number, c: Color, scale = 1): number {
    let cx = Math.floor(x);
    const cy = Math.floor(y);
    for (const ch of s) {
      const g = glyph(ch);
      for (let gy = 0; gy < FONT_HEIGHT; gy++) {
        for (let gx = 0; gx < g.w; gx++) {
          if (!g.bits[gy * g.w + gx]) continue;
          if (scale === 1) this.px(cx + gx, cy + gy, c);
          else this.rect(cx + gx * scale, cy + gy * scale, scale, scale, c);
        }
      }
      cx += (g.w + 1) * scale;
    }
    return cx - Math.floor(x) - scale;
  }

  /** Text clipped to a horizontal window [clipL, clipR). For tickers. */
  textClip(s: string, x: number, y: number, c: Color, clipL: number, clipR: number) {
    let cx = Math.floor(x);
    const cy = Math.floor(y);
    for (const ch of s) {
      const g = glyph(ch);
      if (cx > clipR) break;
      if (cx + g.w >= clipL) {
        for (let gy = 0; gy < FONT_HEIGHT; gy++) {
          for (let gx = 0; gx < g.w; gx++) {
            const px = cx + gx;
            if (px < clipL || px >= clipR || !g.bits[gy * g.w + gx]) continue;
            this.px(px, cy + gy, c);
          }
        }
      }
      cx += g.w + 1;
    }
  }

  textCenter(s: string, cx: number, y: number, c: Color, scale = 1) {
    this.text(s, Math.round(cx - textWidth(s, scale) / 2), y, c, scale);
  }

  // ── full-view helpers ────────────────────────────────────────────────

  fill(c: Color) {
    this.buf.fill(c);
  }

  /** Vertical dithered gradient inside a rectangle (world coords). */
  gradRect(x: number, y: number, w: number, h: number, stops: readonly Color[]) {
    const n = stops.length - 1;
    const x0 = Math.max(this.cl, Math.floor(x) - this.ox);
    const x1 = Math.min(this.cr, Math.floor(x) + Math.round(w) - this.ox);
    const y0 = Math.max(this.ct, Math.floor(y) - this.oy);
    const y1 = Math.min(this.cb, Math.floor(y) + Math.round(h) - this.oy);
    for (let by = y0; by < y1; by++) {
      const wy = by + this.oy;
      const t = Math.min(1, Math.max(0, (wy - y) / Math.max(1, h - 1))) * n;
      const i = Math.min(n - 1, Math.floor(t));
      const f = t - i;
      const ca = stops[i]!;
      const cb = stops[Math.min(n, i + 1)]!;
      const row = by * this.w;
      for (let bx = x0; bx < x1; bx++) this.buf[row + bx] = f > BAYER[((wy & 3) << 2) | ((bx + this.ox) & 3)]! ? cb : ca;
    }
  }

  /**
   * Vertical dithered gradient through `stops` from world y0 to y1, across the full view
   * width (within the clip rectangle). Rows outside [y0, y1] (within [from, to)) take the
   * end colors.
   */
  vgrad(stops: readonly Color[], y0: number, y1: number, from = this.top, to = this.bottom) {
    const n = stops.length - 1;
    const yStart = Math.max(Math.floor(from), this.top + this.ct);
    const yEnd = Math.min(Math.ceil(to), this.top + this.cb);
    for (let y = yStart; y < yEnd; y++) {
      const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0 || 1))) * n;
      const i = Math.min(n - 1, Math.floor(t));
      const f = t - i;
      const ca = stops[i]!;
      const cb = stops[Math.min(n, i + 1)]!;
      const by = y - this.oy;
      const row = by * this.w;
      for (let bx = this.cl; bx < this.cr; bx++) {
        this.buf[row + bx] = f > BAYER[((y & 3) << 2) | ((bx + this.ox) & 3)]! ? cb : ca;
      }
    }
  }
}

// ── packed-pixel math ───────────────────────────────────────────────────

export function blendPx(d: number, c: number, a: number): number {
  const k = (a * 256) | 0;
  const dr = d & 255;
  const dg = (d >>> 8) & 255;
  const db = (d >>> 16) & 255;
  const r = dr + ((((c & 255) - dr) * k) >> 8);
  const g = dg + (((((c >>> 8) & 255) - dg) * k) >> 8);
  const b = db + (((((c >>> 16) & 255) - db) * k) >> 8);
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

export function addPx(d: number, r: number, g: number, b: number): number {
  let rr = (d & 255) + r;
  let gg = ((d >>> 8) & 255) + g;
  let bb = ((d >>> 16) & 255) + b;
  if (rr > 255) rr = 255;
  if (gg > 255) gg = 255;
  if (bb > 255) bb = 255;
  return 0xff000000 | ((bb | 0) << 16) | ((gg | 0) << 8) | (rr | 0);
}

/** Multiply by m/256. */
export function mulPx(d: number, m: number): number {
  let r = ((d & 255) * m) >> 8;
  let g = (((d >>> 8) & 255) * m) >> 8;
  let b = (((d >>> 16) & 255) * m) >> 8;
  if (r > 255) r = 255;
  if (g > 255) g = 255;
  if (b > 255) b = 255;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}

// The "lens": post-processing applied by the runner to every finished frame of every scene.
//
//   bloom      bright pixels bleed a soft glow (quarter-resolution blur, dithered back in)
//   lighting   the scene's exposure map (Gfx.lighting/light) × a dithered vignette
//   grade      saturation, white balance, a filmic contrast curve, tinted blacks and highlights
//   grain      a faint, slowly crawling film grain (static under reduced motion)
//
// Scenes get the house grade for free; SceneDef.grade tweaks it (or `false` turns it off).
// Cost at 320×180 is roughly 0.2 ms per frame without bloom and 0.3–0.5 ms with it: the
// grade is a handful of integer ops and three table lookups per pixel.

import { type Color, blue, green, hex, red } from './color';
import { bayer } from './gfx';

export interface Grade {
  /** Overall brightness multiplier (default 1). */
  exposure?: number;
  /** Contrast around `pivot`: 1 = flat, the house look is 1.12. */
  contrast?: number;
  /** Mid grey the contrast pivots around, 0–1 (default 0.42). */
  pivot?: number;
  /** 0 = greyscale, 1 = as drawn (default 0.84). */
  saturation?: number;
  /** White balance: −1 cool … +1 warm (default 0). */
  temperature?: number;
  /** What pure black becomes: tinted, slightly lifted blacks (default '#07080f'). */
  shadows?: Color | string;
  /** What pure white becomes (default '#fff5e6', a warm paper white). */
  highlights?: Color | string;
  /** Darkening toward the corners, 0–1 (default 0.3). */
  vignette?: number;
  /** Film grain, 0–1 (default 0.25). */
  grain?: number;
  /** Bloom strength, 0–2 (default 0.45; 1 ≈ a halo up to +64 levels); 0 switches it off. */
  bloom?: number;
  /** Luma (0–1) above which pixels bloom (default 0.74). */
  threshold?: number;
}

/** The house look every scene gets unless it says otherwise. */
export const HOUSE_GRADE: Required<Grade> = {
  exposure: 1,
  contrast: 1.12,
  pivot: 0.42,
  saturation: 0.84,
  temperature: 0,
  shadows: '#07080f',
  highlights: '#fff5e6',
  vignette: 0.3,
  grain: 0.25,
  bloom: 0.45,
  threshold: 0.74,
};

/** Exposure levels: index UNITY is "as drawn"; the map can brighten up to LEVELS/UNITY. */
const LEVELS = 48;
const UNITY = 32;
const GRAIN_SIZE = 1 << 16;

const col = (c: Color | string): Color => (typeof c === 'string' ? hex(c) : c);

export class Post {
  readonly grade: Required<Grade>;
  private lr = new Uint8Array(LEVELS * 256);
  private lg = new Uint8Array(LEVELS * 256);
  private lb = new Uint8Array(LEVELS * 256);
  private sat256: number;
  private grain = new Int8Array(GRAIN_SIZE);
  private grainOff = 0;
  /** Per-pixel exposure level (light map × vignette, dithered). */
  private levels = new Uint8Array(0);
  private w = 0;
  private h = 0;
  private ox = 0;
  private oy = 0;
  private builtFor: Float32Array | null | undefined = undefined;
  private builtVersion = -1;
  // Bloom buffers (quarter resolution).
  private qw = 0;
  private qh = 0;
  private br = new Float32Array(0);
  private bg = new Float32Array(0);
  private bb = new Float32Array(0);
  private tmp = new Float32Array(0);
  private active = new Uint8Array(0);

  constructor(grade: Grade = {}) {
    this.grade = { ...HOUSE_GRADE, ...grade };
    const gr = this.grade;
    this.sat256 = Math.round(gr.saturation * 256);
    const sh = col(gr.shadows);
    const hl = col(gr.highlights);
    const T = gr.temperature;
    const wb = [1 + 0.09 * T, 1 + 0.015 * T, 1 - 0.11 * T];
    const lo = [red(sh), green(sh), blue(sh)];
    const hi = [red(hl), green(hl), blue(hl)];
    const tables = [this.lr, this.lg, this.lb];
    for (let ch = 0; ch < 3; ch++) {
      const t = tables[ch]!;
      for (let l = 0; l < LEVELS; l++) {
        const k = (l / UNITY) * gr.exposure * wb[ch]!;
        for (let v = 0; v < 256; v++) {
          const y = tone((v / 255) * k, gr.contrast, gr.pivot);
          t[l * 256 + v] = Math.max(0, Math.min(255, Math.round(lo[ch]! + (hi[ch]! - lo[ch]!) * y)));
        }
      }
    }
    // Sparse grain: most pixels untouched, a few nudged one exposure step up or down.
    const p = Math.min(0.6, gr.grain * 0.55);
    let s = 0x2545f491;
    for (let i = 0; i < GRAIN_SIZE; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const r = (s >>> 0) / 4294967296;
      this.grain[i] = r < p / 2 ? -1 : r > 1 - p / 2 ? 1 : 0;
    }
  }

  /**
   * Grade `src` into `dst` (same size). `src` is scratch: bloom is added to it in place
   * (the runner restores it from the background every frame anyway).
   */
  apply(src: Int32Array, dst: Int32Array, w: number, h: number, ox: number, oy: number, exposure: Float32Array | null, exposureVersion: number, animate: boolean) {
    if (w !== this.w || h !== this.h || ox !== this.ox || oy !== this.oy || exposure !== this.builtFor || exposureVersion !== this.builtVersion) {
      this.build(w, h, ox, oy, exposure, exposureVersion);
    }
    if (this.grade.bloom > 0) this.bloom(src);
    if (animate) this.grainOff = (this.grainOff + 7919 + ((this.grainOff >>> 3) & 1023)) & (GRAIN_SIZE - 1);
    const lr = this.lr;
    const lg = this.lg;
    const lb = this.lb;
    const lv = this.levels;
    const gr = this.grain;
    const off = this.grainOff;
    const s = this.sat256;
    const n = w * h;
    if (s === 256) {
      for (let i = 0; i < n; i++) {
        const c = src[i]!;
        const base = (lv[i]! + gr[(i + off) & (GRAIN_SIZE - 1)]!) << 8;
        dst[i] = 0xff000000 | (lb[base | ((c >>> 16) & 255)]! << 16) | (lg[base | ((c >>> 8) & 255)]! << 8) | lr[base | (c & 255)]!;
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const c = src[i]!;
      let r = c & 255;
      let g = (c >>> 8) & 255;
      let b = (c >>> 16) & 255;
      const L = (r * 77 + g * 150 + b * 29) >> 8;
      r = L + (((r - L) * s) >> 8);
      g = L + (((g - L) * s) >> 8);
      b = L + (((b - L) * s) >> 8);
      if (r < 0) r = 0;
      else if (r > 255) r = 255;
      if (g < 0) g = 0;
      else if (g > 255) g = 255;
      if (b < 0) b = 0;
      else if (b > 255) b = 255;
      const base = (lv[i]! + gr[(i + off) & (GRAIN_SIZE - 1)]!) << 8;
      dst[i] = 0xff000000 | (lb[base | b]! << 16) | (lg[base | g]! << 8) | lr[base | r]!;
    }
  }

  /** Combine the exposure map and the vignette into dithered per-pixel levels. */
  private build(w: number, h: number, ox: number, oy: number, exposure: Float32Array | null, version: number) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.builtFor = exposure;
    this.builtVersion = version;
    if (this.levels.length !== w * h) this.levels = new Uint8Array(w * h);
    const vig = this.grade.vignette;
    // The vignette is measured on the visible frame, so it hugs whatever aspect is showing.
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / ry;
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / rx;
        // A soft rounded-rectangle falloff reads better on wide frames than a plain ellipse.
        const d = Math.pow(Math.pow(Math.abs(dx), 2.6) + Math.pow(Math.abs(dy), 2.6), 1 / 2.6);
        const v = 1 - vig * smooth(0.45, 1.25, d);
        const i = y * w + x;
        const e = exposure ? exposure[i]! : 1;
        const lvl = Math.floor(e * v * UNITY + bayer(x + ox, y + oy));
        this.levels[i] = lvl < 1 ? 1 : lvl > LEVELS - 2 ? LEVELS - 2 : lvl;
      }
    }
    this.qw = Math.ceil(w / 4);
    this.qh = Math.ceil(h / 4);
    const qn = this.qw * this.qh;
    if (this.br.length !== qn) {
      this.br = new Float32Array(qn);
      this.bg = new Float32Array(qn);
      this.bb = new Float32Array(qn);
      this.tmp = new Float32Array(qn);
      this.active = new Uint8Array(qn);
    }
  }

  /** Quarter-resolution bloom, added into src. */
  private bloom(src: Int32Array) {
    const { w, h, qw, qh, br, bg, bb } = this;
    const thr = this.grade.threshold * 255 * 256;
    const span = Math.max(1, (1 - this.grade.threshold) * 255 * 256);
    br.fill(0);
    bg.fill(0);
    bb.fill(0);
    let any = false;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const qrow = (y >> 2) * qw;
      for (let x = 0; x < w; x++) {
        const c = src[row + x]!;
        const r = c & 255;
        const g = (c >>> 8) & 255;
        const b = (c >>> 16) & 255;
        const L = r * 77 + g * 150 + b * 29;
        if (L <= thr) continue;
        const k = (L - thr) / span;
        const q = qrow + (x >> 2);
        br[q]! += r * k;
        bg[q]! += g * k;
        bb[q]! += b * k;
        any = true;
      }
    }
    if (!any) return;
    // Three passes of a separable [1 2 1] blur ≈ a soft gaussian ~10 px wide.
    for (const a of [br, bg, bb]) for (let p = 0; p < 3; p++) this.blur(a);
    // Pixel art has no HDR: a lamp and a sheet of paper are both white. Compress each cell
    // (keeping its hue) so small lights get a visible halo while big bright areas cap out.
    const cap = 64 * this.grade.bloom;
    const qn = qw * qh;
    for (let q = 0; q < qn; q++) {
      const r = br[q]! / 16;
      const g = bg[q]! / 16;
      const b = bb[q]! / 16;
      const m = r > g ? (r > b ? r : b) : g > b ? g : b;
      if (m < 0.05) {
        br[q] = bg[q] = bb[q] = 0;
        continue;
      }
      const f = (cap * (1 - Math.exp(-m / 22))) / m;
      br[q] = r * f;
      bg[q] = g * f;
      bb[q] = b * f;
    }
    const strength = 1;
    // Which cells are worth upsampling.
    const act = this.active;
    for (let j = 0; j < qh; j++)
      for (let i = 0; i < qw; i++) {
        let m = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= qh) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= qw) continue;
            const q = jj * qw + ii;
            const v = br[q]! + bg[q]! + bb[q]!;
            if (v > m) m = v;
          }
        }
        act[j * qw + i] = m * strength > 0.6 ? 1 : 0;
      }
    // Bilinear upsample from cell centres (4i + 1.5), dithered, added to the frame.
    for (let j = 0; j < qh; j++)
      for (let i = 0; i < qw; i++) {
        if (!act[j * qw + i]) continue;
        for (let y = j * 4; y < Math.min(h, j * 4 + 4); y++) {
          const fy = (y - 1.5) / 4;
          let j0 = Math.floor(fy);
          let ty = fy - j0;
          if (j0 < 0) {
            j0 = 0;
            ty = 0;
          }
          const j1 = j0 + 1 < qh ? j0 + 1 : j0;
          const row = y * w;
          for (let x = i * 4; x < Math.min(w, i * 4 + 4); x++) {
            const fx = (x - 1.5) / 4;
            let i0 = Math.floor(fx);
            let tx = fx - i0;
            if (i0 < 0) {
              i0 = 0;
              tx = 0;
            }
            const i1 = i0 + 1 < qw ? i0 + 1 : i0;
            const a = j0 * qw + i0;
            const b = j0 * qw + i1;
            const c2 = j1 * qw + i0;
            const d = j1 * qw + i1;
            const wa = (1 - tx) * (1 - ty);
            const wb = tx * (1 - ty);
            const wc = (1 - tx) * ty;
            const wd = tx * ty;
            const dith = bayer(x + this.ox, y + this.oy);
            const ar = (br[a]! * wa + br[b]! * wb + br[c2]! * wc + br[d]! * wd) * strength + dith;
            const ag = (bg[a]! * wa + bg[b]! * wb + bg[c2]! * wc + bg[d]! * wd) * strength + dith;
            const ab = (bb[a]! * wa + bb[b]! * wb + bb[c2]! * wc + bb[d]! * wd) * strength + dith;
            if (ar < 1 && ag < 1 && ab < 1) continue;
            const p = src[row + x]!;
            let r = (p & 255) + (ar | 0);
            let g = ((p >>> 8) & 255) + (ag | 0);
            let bl = ((p >>> 16) & 255) + (ab | 0);
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (bl > 255) bl = 255;
            src[row + x] = 0xff000000 | (bl << 16) | (g << 8) | r;
          }
        }
      }
  }

  private blur(a: Float32Array) {
    const { qw, qh, tmp } = this;
    for (let y = 0; y < qh; y++) {
      const row = y * qw;
      for (let x = 0; x < qw; x++) {
        const i = row + x;
        tmp[i] = (a[i]! * 2 + (x > 0 ? a[i - 1]! : a[i]!) + (x < qw - 1 ? a[i + 1]! : a[i]!)) * 0.25;
      }
    }
    for (let y = 0; y < qh; y++) {
      const row = y * qw;
      for (let x = 0; x < qw; x++) {
        const i = row + x;
        // Slightly leaky edges (×0.5 beyond the border) so glows near the frame edge fade out.
        a[i] = (tmp[i]! * 2 + (y > 0 ? tmp[i - qw]! : tmp[i]! * 0.5) + (y < qh - 1 ? tmp[i + qw]! : tmp[i]! * 0.5)) * 0.25;
      }
    }
  }
}

function smooth(a: number, b: number, v: number): number {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * (3 - 2 * t);
}

/**
 * Filmic tone curve: linear contrast around the pivot, then an exponential toe and
 * shoulder so nothing clips hard. 0..∞ → 0..1.
 */
export function tone(v: number, contrast: number, pivot: number): number {
  let y = pivot + (v - pivot) * contrast;
  const toe = 0.08;
  const knee = 0.78;
  if (y < toe) y = toe * Math.exp((y - toe) / toe);
  else if (y > knee) y = knee + (1 - knee) * (1 - Math.exp(-(y - knee) / (1 - knee)));
  return y;
}

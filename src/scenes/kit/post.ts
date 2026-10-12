// The "lens": post-processing applied by the runner to every finished frame of every scene.
//
//   bloom      bright pixels bleed a soft glow (quarter-resolution blur, dithered back in)
//   lighting   the scene's exposure map (Gfx.lighting/light) × a dithered vignette
//   grade      saturation, white balance, a filmic contrast curve, tinted blacks and highlights
//   grain      a faint, slowly crawling film grain (static under reduced motion)
//
// Scenes get the house grade for free; SceneDef.grade tweaks it (or `false` turns it off).
// Cost at 320×180 is well under a millisecond per frame: the grade is a handful of integer ops
// and three table lookups per pixel, and the glow is rebuilt every third frame from a
// quarter-resolution blur and added in the same loop.

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
  /** Darkening toward the corners, 0–1 (default 0.25). */
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
  vignette: 0.25,
  grain: 0.25,
  bloom: 0.45,
  threshold: 0.74,
};

/** Exposure levels: index UNITY is "as drawn"; the map can brighten up to LEVELS/UNITY. */
const LEVELS = 48;
const UNITY = 32;
const GRAIN_SIZE = 1 << 16;

const col = (c: Color | string): Color => (typeof c === 'string' ? hex(c) : c);

// The 4×4 ordered-dither thresholds, inlined for the bloom's inner loop.
const BAYER4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));

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
  // Bloom: quarter-resolution cells, and the full-resolution glow they upsample to. The glow is
  // recomputed every other frame and added in the grade loop.
  private qw = 0;
  private qh = 0;
  private br = new Float32Array(0);
  private bg = new Float32Array(0);
  private bb = new Float32Array(0);
  private bm = new Float32Array(0);
  private tmp = new Float32Array(0);
  private glowR = new Uint8Array(0);
  private glowG = new Uint8Array(0);
  private glowB = new Uint8Array(0);
  private hasGlow = false;
  /** Rows the glow reaches (1) — the rest skip the add. */
  private glowRows = new Uint8Array(0);
  private calls = 0;

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

  /** Grade `src` into `dst` (same size, packed 0xAABBGGRR). `src` is left untouched. */
  apply(src: Int32Array, dst: Int32Array, w: number, h: number, ox: number, oy: number, exposure: Float32Array | null, exposureVersion: number, animate: boolean) {
    if (w !== this.w || h !== this.h || ox !== this.ox || oy !== this.oy || exposure !== this.builtFor || exposureVersion !== this.builtVersion) {
      this.build(w, h, ox, oy, exposure, exposureVersion);
      this.calls = 0;
    }
    // Lights rarely move fast: refreshing the glow every third frame (~7 times a second at
    // 20 fps) is invisible and saves two thirds of its cost.
    if (this.grade.bloom > 0 && this.calls++ % 3 === 0) this.bloom(src);
    // Grain crawls at half the frame rate: alive, but not fizzing.
    if (animate && this.calls & 1) this.grainOff = (this.grainOff + 7919 + ((this.grainOff >>> 3) & 1023)) & (GRAIN_SIZE - 1);
    const lr = this.lr;
    const lg = this.lg;
    const lb = this.lb;
    const lv = this.levels;
    const gr = this.grain;
    const off = this.grainOff;
    const s = this.sat256;
    const gR = this.glowR;
    const gG = this.glowG;
    const gB = this.glowB;
    const rows = this.glowRows;
    const glow = this.hasGlow;
    for (let y = 0; y < h; y++) {
      const i0 = y * w;
      const i1 = i0 + w;
      const withGlow = glow && rows[y] === 1;
      for (let i = i0; i < i1; i++) {
        const c = src[i]!;
        let r = c & 255;
        let g = (c >>> 8) & 255;
        let b = (c >>> 16) & 255;
        if (withGlow) {
          r += gR[i]!;
          g += gG[i]!;
          b += gB[i]!;
          if (r > 255) r = 255;
          if (g > 255) g = 255;
          if (b > 255) b = 255;
        }
        if (s < 256) {
          // Desaturating toward luma can't leave 0..255, so no clamps.
          const L = (r * 77 + g * 150 + b * 29) >> 8;
          r = L + (((r - L) * s) >> 8);
          g = L + (((g - L) * s) >> 8);
          b = L + (((b - L) * s) >> 8);
        } else if (s > 256) {
          const L = (r * 77 + g * 150 + b * 29) >> 8;
          r = L + (((r - L) * s) >> 8);
          g = L + (((g - L) * s) >> 8);
          b = L + (((b - L) * s) >> 8);
          r = r < 0 ? 0 : r > 255 ? 255 : r;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          b = b < 0 ? 0 : b > 255 ? 255 : b;
        }
        const base = (lv[i]! + gr[(i + off) & (GRAIN_SIZE - 1)]!) << 8;
        dst[i] = 0xff000000 | (lb[base | b]! << 16) | (lg[base | g]! << 8) | lr[base | r]!;
      }
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
    if (this.levels.length !== w * h) {
      this.levels = new Uint8Array(w * h);
      this.glowR = new Uint8Array(w * h);
      this.glowG = new Uint8Array(w * h);
      this.glowB = new Uint8Array(w * h);
    }
    if (this.glowRows.length !== h) this.glowRows = new Uint8Array(h);
    this.hasGlow = false;
    const vig = this.grade.vignette;
    // The vignette is measured on the visible frame, so it hugs whatever aspect is showing.
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let y = 0; y < h; y++) {
      const dy = Math.pow(Math.abs((y - cy) / ry), 2.6);
      for (let x = 0; x < w; x++) {
        // A soft rounded-rectangle falloff reads better on wide frames than a plain ellipse.
        const d = Math.pow(Math.pow(Math.abs((x - cx) / rx), 2.6) + dy, 1 / 2.6);
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
      this.bm = new Float32Array(qn);
      this.tmp = new Float32Array(qn * 3);
    }
  }

  /** Quarter-resolution bloom into the cached glow buffers. */
  private bloom(src: Int32Array) {
    const { w, h, qw, qh, br, bg, bb, bm } = this;
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
    if (!any) {
      if (this.hasGlow) {
        this.glowR.fill(0);
        this.glowG.fill(0);
        this.glowB.fill(0);
        this.hasGlow = false;
      }
      return;
    }
    // Three passes of a separable [1 2 1] blur ≈ a soft gaussian ~10 px wide.
    for (let p = 0; p < 3; p++) this.blur();
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
        br[q] = bg[q] = bb[q] = bm[q] = 0;
        continue;
      }
      const f = (cap * (1 - Math.exp(-m / 22))) / m;
      br[q] = r * f;
      bg[q] = g * f;
      bb[q] = b * f;
      bm[q] = m * f;
    }
    // Upsample: each 4×4 quad between four cell centres is a bilinear patch (fixed weights),
    // dithered to whole levels. Quads that would add less than a level are skipped.
    const gR = this.glowR;
    const gG = this.glowG;
    const gB = this.glowB;
    gR.fill(0);
    gG.fill(0);
    gB.fill(0);
    const rowsOn = this.glowRows;
    rowsOn.fill(0);
    const ox = this.ox;
    const oy = this.oy;
    for (let j = -1; j < qh; j++) {
      const j0 = j < 0 ? 0 : j;
      const j1 = j + 1 >= qh ? qh - 1 : j + 1;
      const y0 = 4 * j + 2;
      for (let i = -1; i < qw; i++) {
        const i0 = i < 0 ? 0 : i;
        const i1 = i + 1 >= qw ? qw - 1 : i + 1;
        const a = j0 * qw + i0;
        const b = j0 * qw + i1;
        const c = j1 * qw + i0;
        const d = j1 * qw + i1;
        if (bm[a]! < 1 && bm[b]! < 1 && bm[c]! < 1 && bm[d]! < 1) continue;
        const x0 = 4 * i + 2;
        const ar = br[a]!, ag = bg[a]!, ab = bb[a]!;
        const brr = br[b]!, bgg = bg[b]!, bbb = bb[b]!;
        const cr = br[c]!, cg = bg[c]!, cb = bb[c]!;
        const dr = br[d]!, dg = bg[d]!, db = bb[d]!;
        for (let v = 0; v < 4; v++) {
          const y = y0 + v;
          if (y < 0 || y >= h) continue;
          // Interpolate down the quad's left and right edges, then across the row.
          const ty = (v + 0.5) * 0.25;
          const lr = ar + (cr - ar) * ty, lg = ag + (cg - ag) * ty, lb = ab + (cb - ab) * ty;
          const rr = brr + (dr - brr) * ty, rg = bgg + (dg - bgg) * ty, rb = bbb + (db - bbb) * ty;
          const row = y * w;
          rowsOn[y] = 1;
          const brow = ((y + oy) & 3) << 2;
          for (let u = 0; u < 4; u++) {
            const x = x0 + u;
            if (x < 0 || x >= w) continue;
            const tx = (u + 0.5) * 0.25;
            const dith = BAYER4[brow | ((x + ox) & 3)]!;
            const r = lr + (rr - lr) * tx + dith;
            const g = lg + (rg - lg) * tx + dith;
            const bl = lb + (rb - lb) * tx + dith;
            const p = row + x;
            gR[p] = r > 255 ? 255 : r;
            gG[p] = g > 255 ? 255 : g;
            gB[p] = bl > 255 ? 255 : bl;
          }
        }
      }
    }
    this.hasGlow = true;
  }

  /** One separable [1 2 1] pass over all three channels (edges leak a little so glows fade out). */
  private blur() {
    const { qw, qh, br, bg, bb } = this;
    const t = this.tmp;
    const n = qw * qh;
    // Horizontal, into tmp (three channels interleaved).
    for (let y = 0; y < qh; y++) {
      const row = y * qw;
      for (let x = 0; x < qw; x++) {
        const i = row + x;
        const l = x > 0 ? i - 1 : i;
        const r = x < qw - 1 ? i + 1 : i;
        t[i] = (br[i]! * 2 + br[l]! + br[r]!) * 0.25;
        t[n + i] = (bg[i]! * 2 + bg[l]! + bg[r]!) * 0.25;
        t[2 * n + i] = (bb[i]! * 2 + bb[l]! + bb[r]!) * 0.25;
      }
    }
    // Vertical, back.
    for (let y = 0; y < qh; y++) {
      const row = y * qw;
      const up = y > 0 ? -qw : 0;
      const down = y < qh - 1 ? qw : 0;
      const ku = y > 0 ? 1 : 0.5;
      const kd = y < qh - 1 ? 1 : 0.5;
      for (let x = 0; x < qw; x++) {
        const i = row + x;
        br[i] = (t[i]! * 2 + t[i + up]! * ku + t[i + down]! * kd) * 0.25;
        bg[i] = (t[n + i]! * 2 + t[n + i + up]! * ku + t[n + i + down]! * kd) * 0.25;
        bb[i] = (t[2 * n + i]! * 2 + t[2 * n + i + up]! * ku + t[2 * n + i + down]! * kd) * 0.25;
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

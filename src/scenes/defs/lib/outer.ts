// Shared helpers for the v4 Outer Band music scenes (owned by the scenes-music workstream):
// the local-night clock, an eased follower for hour-driven values, a posable silhouette
// figure, and a few small drawing utilities. Nothing here allocates per frame.

import { type Color, blue, green, red } from '../../kit/color';
import { type Gfx, addPx } from '../../kit/gfx';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * How far through the local night we are: 0 at 18:00, 1 at 06:00. During the day it eases
 * back to 0 between 06:00 and 08:00 and stays there until the evening.
 */
export function nightProgress(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 18) return (h - 18) / 12;
  if (h < 6) return (h + 6) / 12;
  return 1 - smooth(6, 8, h);
}

/** Hours since 18:00 local, 0–24 (18:00 → 0, 04:00 → 10, 17:59 → ~24). */
export function hoursSinceDusk(hour: number): number {
  return ((((hour - 18) % 24) + 24) % 24);
}

/**
 * Eases toward a target at `rate` per second (exponential). The first call snaps, so a scene
 * opened at 03:00 starts at 03:00 rather than gliding in from the evening.
 */
export class Follow {
  v = 0;
  private init = false;
  constructor(private rate = 0.5) {}
  to(target: number, dt: number): number {
    if (!this.init) {
      this.init = true;
      this.v = target;
    } else this.v += (target - this.v) * (1 - Math.exp(-dt * this.rate));
    return this.v;
  }
}

/** A pose for `figure`: angles in radians, 0 = hanging straight down, π = straight up. */
export interface Pose {
  /** Lean of the whole body (radians, + leans right). */
  lean: number;
  /** Arm angles from straight down, in screen space: + swings right, ±π is straight up. */
  armL: number;
  armR: number;
  /** Elbow bend (radians) added to the forearm. */
  elbowL?: number;
  elbowR?: number;
  /** Leg angles from straight down (+ swings right). */
  legL: number;
  legR: number;
  /** Knee bend (radians) added to the shin (bends backward). */
  kneeL?: number;
  kneeR?: number;
  /** Vertical bob of the torso and head (px, + down). */
  bob?: number;
  /** Head tilt in px (+ right). */
  nod?: number;
  /** Hair: 0 short, 1 big round, 2 ponytail, 3 hat, 4 headphones. */
  hair?: number;
  /** Flared trousers (wider at the feet). */
  flare?: boolean;
  /** Skirt / dress silhouette. */
  skirt?: boolean;
}

function limb(g: Gfx, x0: number, y0: number, x1: number, y1: number, w: number, c: Color) {
  if (w <= 1) {
    g.line(x0, y0, x1, y1, c);
    return;
  }
  // A few parallel strokes: cheap, and looks like a soft-edged limb at this size.
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let k = 0; k < w; k++) {
    const o = k - (w - 1) / 2;
    g.line(x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, c);
  }
}

/**
 * A posable human silhouette standing with its feet at (x, footY), `h` px tall, in one colour.
 * Built from a torso quad, a head disc and jointed limbs; legible from ~10 px to ~60 px tall.
 */
export function figure(g: Gfx, x: number, footY: number, h: number, p: Pose, c: Color) {
  const bob = p.bob ?? 0;
  const lean = p.lean;
  const sl = Math.sin(lean);
  const cl = Math.cos(lean);
  const lw = Math.max(1, Math.round(h / 11));
  const aw = Math.max(1, Math.round(h / 15));
  // hips and shoulders
  const legLen = h * 0.47;
  const hipY = footY - legLen * Math.cos(Math.max(Math.abs(p.legL), Math.abs(p.legR)) * 0.6) + bob * 0.5;
  const hipX = x;
  const torso = h * 0.32;
  const shX = hipX + sl * torso;
  const shY = hipY - cl * torso + bob * 0.5;
  const hw = Math.max(1.5, h * 0.11);
  const hipW = Math.max(1, h * 0.08);
  // legs (thigh + shin)
  const leg = (a: number, knee: number, side: number) => {
    const hx = hipX + side * hipW * 0.6;
    const th = legLen * 0.52;
    const kx = hx + Math.sin(a) * th;
    const ky = hipY + Math.cos(a) * th;
    const b = a - knee;
    const fx = kx + Math.sin(b) * (legLen * 0.5);
    const fy = Math.min(footY, ky + Math.cos(b) * (legLen * 0.5));
    limb(g, hx, hipY, kx, ky, lw, c);
    limb(g, kx, ky, fx, fy, p.flare ? lw + 1 : lw, c);
    return [fx, fy] as const;
  };
  leg(p.legL, p.kneeL ?? 0, -1);
  leg(p.legR, p.kneeR ?? 0, 1);
  if (p.skirt) g.poly([hipX - hipW * 1.4, hipY - 1, hipX + hipW * 1.4, hipY - 1, hipX + hipW * 2.6, hipY + legLen * 0.42, hipX - hipW * 2.6, hipY + legLen * 0.42], c);
  // torso
  g.poly([hipX - hipW, hipY + 1, hipX + hipW, hipY + 1, shX + hw, shY, shX - hw, shY], c);
  g.ellipse(shX, shY + 1, hw, Math.max(1, h * 0.04), c);
  // arms (upper + fore)
  const arm = (a: number, elbow: number, side: number) => {
    const ax = shX + side * hw * 0.85;
    const ay = shY + 1;
    const up = h * 0.2;
    const ex = ax + Math.sin(a + lean) * up;
    const ey = ay + Math.cos(a + lean) * up;
    const b = a + elbow;
    const hx = ex + Math.sin(b + lean) * up * 0.95;
    const hy = ey + Math.cos(b + lean) * up * 0.95;
    limb(g, ax, ay, ex, ey, aw, c);
    limb(g, ex, ey, hx, hy, aw, c);
  };
  arm(p.armL, p.elbowL ?? 0, -1);
  arm(p.armR, p.elbowR ?? 0, 1);
  // neck and head
  const hr = Math.max(1.2, h * 0.085);
  const hx = shX + sl * hr * 1.6 + (p.nod ?? 0);
  const hy = shY - hr * 1.35;
  g.vline(Math.round(shX), Math.round(hy), Math.round(shY), c);
  g.disc(hx, hy, hr, c);
  const hair = p.hair ?? 0;
  if (hair === 1) g.disc(hx, hy - hr * 0.35, hr * 1.55, c);
  else if (hair === 2) {
    g.line(hx - hr, hy - hr * 0.3, hx - hr * 2.2, hy + hr * 0.9, c);
    g.line(hx - hr, hy - hr * 0.1, hx - hr * 2, hy + hr * 1.1, c);
  } else if (hair === 3) {
    g.rect(hx - hr * 1.7, hy - hr * 0.9, hr * 3.4 + 1, 1, c);
    g.rect(hx - hr, hy - hr * 2, hr * 2 + 1, hr * 1.2, c);
  } else if (hair === 4) {
    g.ring(hx, hy - 0.5, hr + 1, hr + 1, c);
  }
}

/** Additive soft dot (2×2 core with a dim cross): mirror-ball specks, distant lamps. */
export function speck(g: Gfx, x: number, y: number, c: Color, k: number) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  g.pxAdd(fx, fy, c, k);
  g.pxAdd(fx + 1, fy, c, k * 0.55);
  g.pxAdd(fx, fy + 1, c, k * 0.35);
  g.pxAdd(fx - 1, fy, c, k * 0.25);
  g.pxAdd(fx, fy - 1, c, k * 0.2);
}

/** Additive horizontal gradient bar (for light spill along an edge). */
export function addRow(g: Gfx, x0: number, x1: number, y: number, c: Color, k: number) {
  if (k <= 0) return;
  const by = Math.floor(y) - g.oy;
  if (by < 0 || by >= g.h) return;
  const b = g.buf;
  const r = red(c) * k;
  const gg = green(c) * k;
  const bb = blue(c) * k;
  const a = Math.max(0, Math.floor(x0) - g.ox);
  const z = Math.min(g.w, Math.ceil(x1) - g.ox);
  for (let bx = a; bx < z; bx++) b[by * g.w + bx] = addPx(b[by * g.w + bx]!, r, gg, bb);
}

/**
 * A sampled sphere texture: an equirectangular luminance/class map built once, sampled per pixel
 * with a longitude offset to make a globe turn. `tex` is w×h bytes; `ramps[v]` maps a byte class.
 */
export interface Globe {
  w: number;
  h: number;
  tex: Uint8Array;
}

/**
 * Draw a turning globe at (cx, cy) radius r. `shadeAt(cls, light, x, y)` returns the colour for a
 * texel class at a light level 0–1 (lit from (lx, ly), screen space). Cheap enough per frame for
 * r ≤ ~40 (one asin/atan2 per pixel is avoided with a precomputed lookup per radius).
 */
export class GlobeRenderer {
  private r = -1;
  private lon = new Float32Array(0);
  private lat = new Float32Array(0);
  private nz = new Float32Array(0);
  private nx = new Float32Array(0);
  private ny = new Float32Array(0);

  private build(r: number) {
    this.r = r;
    const d = r * 2 + 1;
    this.lon = new Float32Array(d * d).fill(NaN);
    this.lat = new Float32Array(d * d);
    this.nz = new Float32Array(d * d);
    this.nx = new Float32Array(d * d);
    this.ny = new Float32Array(d * d);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const u = (x + 0.5) / (r + 0.5);
        const v = (y + 0.5) / (r + 0.5);
        const d2 = u * u + v * v;
        if (d2 >= 1) continue;
        const z = Math.sqrt(1 - d2);
        const i = (y + r) * d + (x + r);
        this.lon[i] = Math.atan2(u, z) / (Math.PI * 2);
        this.lat[i] = 0.5 + Math.asin(v) / Math.PI;
        this.nz[i] = z;
        this.nx[i] = u;
        this.ny[i] = v;
      }
  }

  draw(g: Gfx, globe: Globe, cx: number, cy: number, r: number, turn: number, lx: number, ly: number, ambient: number, shadeAt: (cls: number, light: number, x: number, y: number) => Color) {
    r = Math.round(r);
    if (r !== this.r) this.build(r);
    const d = r * 2 + 1;
    const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
    const fcx = Math.floor(cx);
    const fcy = Math.floor(cy);
    const [kl, kt, kr, kb] = g.clipBounds;
    for (let y = -r; y <= r; y++) {
      const by = fcy + y - g.oy;
      if (by < kt || by >= kb) continue;
      for (let x = -r; x <= r; x++) {
        const bx = fcx + x - g.ox;
        if (bx < kl || bx >= kr) continue;
        const i = (y + r) * d + (x + r);
        const lo = this.lon[i]!;
        if (lo !== lo) continue;
        let u = lo + turn;
        u -= Math.floor(u);
        const tx = Math.floor(u * globe.w);
        const ty = Math.min(globe.h - 1, Math.floor(this.lat[i]! * globe.h));
        const l = this.nx[i]! * lx + this.ny[i]! * ly + this.nz[i]! * lz;
        const light = ambient + (1 - ambient) * (l < 0 ? 0 : l);
        g.buf[by * g.w + bx] = shadeAt(globe.tex[ty * globe.w + tx]!, light, fcx + x, fcy + y);
      }
    }
  }
}

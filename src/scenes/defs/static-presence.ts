// Something Listening: the whole view is soft, dark television static with one faint warm light
// somewhere behind it. Slowly, patiently, the static gathers: its grains lean together into the
// suggestion of a face, a figure leaning closer to listen; it holds there a while, and lets go.
// Nothing jumps. Everything is very dark and very slow.
// Rare events (what the static gathers into instead): a figure standing in a lit doorway; a
// hand laid flat against the glass; the face again, tilted, curious; the light behind it
// brightening, as if a door had opened somewhere.

import { hex, mix } from '../kit/color';
import { envelope, smoothstep } from '../kit/fx';
import type { SceneDef } from '../types';

// The fields are baked on a grid in "face space": u across (−1..1), v down (−1.3..1.5).
const FW = 96;
const FH = 132;
const V0 = -1.3;
const V1 = 1.5;
const CYCLE = 84; // seconds per gathering
const FACE = { x: 160, y: 84, s: 62 }; // centre and half-width (px) of face space at rest

const g2 = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));

function bake(fn: (u: number, v: number) => number): Float32Array {
  const a = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) {
      const u = (i / (FW - 1)) * 2 - 1;
      const v = V0 + (j / (FH - 1)) * (V1 - V0);
      a[j * FW + i] = Math.max(-1, Math.min(1, fn(u, v)));
    }
  return a;
}

/** A head and shoulders leaning in: brow, cheekbones and nose in light, eyes and mouth in shadow. */
const faceField = (u: number, v: number) => {
  const head = (u / 0.6) ** 2 + ((v + 0.1) / 0.8) ** 2;
  // a soft edge: the head fades into the static rather than being cut out of it
  let f = 0.28 * Math.exp(-(head ** 3) * 0.7) - 0.4 * Math.exp(-((head - 1.25) ** 2) * 6);
  // shoulders and the neck below
  const sh = (u / 1.25) ** 2 + ((v - 1.42) / 0.55) ** 2;
  if (sh < 1) f = Math.max(f, 0.16 * (1 - sh * 0.5));
  if (Math.abs(u) < 0.2 && v > 0.6 && v < 1.0) f = Math.max(f, 0.1);
  f -= 0.6 * (g2(u, v, -0.25, -0.12, 0.13, 0.09) + g2(u, v, 0.25, -0.12, 0.13, 0.09));
  f += 0.35 * (g2(u, v, -0.26, -0.3, 0.14, 0.05) + g2(u, v, 0.26, -0.3, 0.14, 0.05));
  f += 0.32 * g2(u, v, 0, 0.06, 0.05, 0.18);
  f -= 0.45 * g2(u, v, 0, 0.28, 0.08, 0.04);
  f += 0.3 * (g2(u, v, -0.3, 0.12, 0.11, 0.09) + g2(u, v, 0.3, 0.12, 0.11, 0.09));
  f -= 0.5 * g2(u, v, 0, 0.44, 0.15, 0.03);
  f += 0.2 * g2(u, v, 0, 0.62, 0.12, 0.08);
  f += 0.2 * g2(u, v, 0, -0.6, 0.35, 0.15); // forehead
  return f;
};

/** A figure standing in a lit doorway, far back. */
const doorField = (u: number, v: number) => {
  // the doorway's light, soft at its edges
  const ex = Math.max(0, Math.abs(u) - 0.26) / 0.06;
  const ey = Math.max(0, -0.85 - v) / 0.06;
  let f = -0.12 + 0.48 * Math.exp(-(ex * ex + ey * ey));
  if (v > 1.25) f = Math.max(f, 0.22 * Math.exp(-((u / 0.5) ** 2))); // light on the floor
  // someone standing in it: a head, shoulders, the hint of two legs; dim, not black
  const head = (u / 0.085) ** 2 + ((v + 0.3) / 0.1) ** 2;
  const neck = v > -0.22 && v < -0.14 && Math.abs(u) < 0.04;
  const sh = (u / 0.21) ** 2 + ((v + 0.06) / 0.08) ** 2; // rounded shoulders
  const torso = v > -0.06 && v < 0.62 && Math.abs(u) < 0.21 - Math.max(0, v) * 0.07;
  const legs = v >= 0.62 && v < 1.32 && Math.abs(u) < 0.16 && Math.abs(u) > 0.015;
  if (head < 1 || neck || sh < 1 || torso || legs) f = -0.26;
  return f;
};

/** A hand laid flat against the glass. */
const handField = (u: number, v: number) => {
  const palm = ((u - 0.05) / 0.32) ** 2 + ((v - 0.35) / 0.38) ** 2;
  let f = palm < 1 ? 0.5 - palm * 0.2 : -0.25 * Math.exp(-(palm - 1) * 2);
  const fingers: [number, number, number][] = [
    [-0.22, -0.2, 0.36],
    [-0.06, -0.38, 0.44],
    [0.11, -0.36, 0.42],
    [0.27, -0.22, 0.34],
  ];
  for (const [fx, fy, len] of fingers) {
    // a capsule from the palm up to a rounded tip
    const top = fy - len + 0.07;
    const cy = Math.max(top, Math.min(0.3, v));
    const d = Math.hypot(u - fx, v - cy) / 0.052;
    if (d < 1.2) f = Math.max(f, 0.45 * Math.min(1, (1.2 - d) * 3));
  }
  const th = (((u + 0.36) * 0.8 + (v - 0.35) * 0.6) / 0.08) ** 2 + (((v - 0.35) * 0.8 - (u + 0.36) * 0.6) / 0.24) ** 2;
  if (th < 1) f = Math.max(f, 0.42);
  return f;
};

const def: SceneDef = {
  id: 'static-presence',
  fps: 12,
  focusX: 160,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 30,
  grade: { temperature: -0.05, contrast: 1.06, saturation: 0.7, bloom: 0.25, threshold: 0.7, vignette: 0.5, grain: 0.15, shadows: '#030305' },
  create({ accent }) {
    const face = bake(faceField);
    const door = bake(doorField);
    const hand = bake(handField);
    const lo = hex('#08090c');
    const hi = mix(accent, hex('#c8ccd8'), 0.4);
    const warm = hex('#c89a6a');
    // the grey ramp the static is quantised to (16 steps, dark-heavy)
    const ramp: number[] = [];
    for (let i = 0; i < 16; i++) ramp.push(mix(lo, hi, (i / 15) ** 1.7 * 0.52));

    // per-pixel persistence: each grain eases toward its new value, so the static is soft
    let prev = new Uint8Array(0);
    let seed = 0x9e3779b9;

    return {
      background(g) {
        g.fill(lo);
        prev = new Uint8Array(g.w * g.h);
        for (let i = 0; i < prev.length; i++) prev[i] = (Math.random() * 120) | 0;
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 30;
        const live = 0.6 + 0.4 * f.awake;

        // how far the static has gathered, and into what
        const phase = (t % CYCLE) / CYCLE;
        let gather = 0.8 * smoothstep(0.08, 0.42, phase) * (1 - smoothstep(0.58, 0.86, phase));
        let field = face;
        let scale = 1 + 0.16 * gather; // it leans closer as it gathers
        let tilt = 0;
        let dropY = gather * 6;
        if (f.rare < 3 && R(f.rare)) {
          const k = envelope(ev, 30, 9, 9);
          gather = Math.max(gather * (1 - k), k * 0.95);
          if (f.rare === 0) {
            field = door;
            scale = 0.95;
            dropY = 4;
          } else if (f.rare === 1) {
            field = hand;
            scale = 1.25 + 0.1 * k;
            dropY = 6;
          } else {
            tilt = 0.28 * k;
            scale = 1.12;
          }
        }
        const opening = R(3) ? envelope(ev, 30, 8, 10) : 0;
        if (f.reduced) gather *= 0.85;

        // ── the static ──
        const b = g.buf;
        const w = g.w;
        const h = g.h;
        const sPx = FACE.s * scale;
        const cx = FACE.x;
        const cy = FACE.y + dropY;
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const ease = f.reduced ? 0.12 : 0.45;
        const tick = Math.floor(t * 12);
        seed = (seed ^ Math.imul(tick + 1, 0x85ebca6b)) >>> 0;
        let s = seed || 1;
        // the slow rolling bar
        const bar = ((t * 7) % (h + 60)) - 30 + g.oy;
        const amp = f.reduced ? 0.6 : 1;
        for (let by = 0; by < h; by++) {
          const wy = by + g.oy;
          const scan = (wy & 1) === 0 ? 1 : 0.86;
          const rb = 1 + 0.18 * Math.max(0, 1 - Math.abs(wy - bar) / 18);
          const dy = (wy - cy) / sPx;
          const row = by * w;
          for (let bx = 0; bx < w; bx++) {
            // xorshift noise, eased into the grain's previous value
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;
            const r = (s >>> 0) & 255;
            const p0 = prev[row + bx]!;
            let n = p0 + (((r - p0) * ease) | 0);
            prev[row + bx] = n;
            // the gathering field biases the grain's brightness
            if (gather > 0.01) {
              const dx = (bx + g.ox - cx) / sPx;
              const u = dx * cos + dy * sin;
              const v = -dx * sin + dy * cos;
              if (u > -1 && u < 1 && v > V0 && v < V1) {
                const i = ((u + 1) * 0.5 * (FW - 1)) | 0;
                const j = (((v - V0) / (V1 - V0)) * (FH - 1)) | 0;
                const fv = field[j * FW + i]!;
                n = n * (1 + fv * gather * 1.1) + fv * gather * 70;
              }
            }
            let q = ((n * amp * scan * rb) / 256) * 15;
            if (q < 0) q = 0;
            if (q > 15) q = 15;
            b[row + bx] = ramp[q | 0]!;
          }
        }

        // ── the faint light behind it all ──
        const lk = (0.12 + 0.05 * Math.sin(t * 0.13) + opening * 0.22) * live;
        g.glow(FACE.x + 34, FACE.y - 34, 70 + opening * 40, warm, lk, 6);
        g.glow(FACE.x + 34, FACE.y - 34, 10, hex('#ffd8a8'), lk * 1.4, 4);
        if (gather > 0.3) {
          // where it leans close, the light finds the edge of it
          g.glow(FACE.x + 16, FACE.y - 20, 30, warm, 0.05 * (gather - 0.3) * live, 5);
        }
      },
    };
  },
};

export default def;

// Traffic on the 8s: night over the Great Wormhole Interchange. Glowing lanes of folded space
// knot through the dark at every depth (flyovers, cloverleaf loops, a ramp diving into the
// central wormhole), each one packed bumper to bumper with tiny ship lights, white one way and
// red the other, crawling in stop-start waves. The traffic pod hovers above it all, beacon
// breathing, its searchlight sweeping the jam.
// Rare events: the searchlight finds a gap and one ship darts into it (and stops); an
// emergency tender weaves through on its own lane; the pod flies its long slow circuit;
// the wormhole spits out a ship going the wrong way.

import { type Color, hex, mix } from '../kit/color';
import { beam } from '../kit/atmos';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { vignette } from './lib/night';

const HUB = { x: 162, y: 94 }; // the central wormhole
const POD = { x: 206, y: 34 };

interface LaneDef {
  pts: number[];
  /** 0 near … 1 far */
  z: number;
  w: number;
  c: string;
}

const LANES: LaneDef[] = [
  // deep background lanes first (the top and bottom ones fill tall phone views)
  { pts: [-80, -60, 60, -72, 140, -42, 186, -62, 232, -92, 400, -84], z: 0.82, w: 4, c: '#4a7ab0' },
  { pts: [-80, 236, 70, 254, 150, 222, 226, 250, 400, 238], z: 0.78, w: 4, c: '#7a5aa0' },
  { pts: [-80, 78, 40, 70, 160, 74, 260, 66, 400, 76], z: 0.95, w: 3, c: '#4a5a9a' },
  { pts: [300, -140, 288, -20, 276, 90, 290, 200, 304, 320], z: 0.92, w: 3, c: '#5a4a8a' },
  { pts: [-80, 28, 40, 16, 110, 34, 160, 58, 222, 38, 300, 22, 400, 30], z: 0.8, w: 5, c: '#3e8a8a' },
  { pts: [40, -140, 80, -40, 120, 38, 162, 94, 200, 160, 232, 232, 262, 330], z: 0.66, w: 7, c: '#7a5ab0' },
  { pts: [162, 94, 130, 96, 100, 82, 76, 64, 72, 42, 90, 28, 114, 38, 120, 62, 110, 86, 80, 112, 30, 140, -80, 168], z: 0.55, w: 5, c: '#5a6ac0' },
  { pts: [162, 94, 200, 98, 238, 102, 252, 126, 236, 148, 206, 146, 194, 122, 204, 100, 232, 86, 300, 72, 400, 58], z: 0.45, w: 6, c: '#b0607a' },
  { pts: [-80, 136, 40, 122, 110, 106, 162, 94, 230, 82, 300, 64, 400, 48], z: 0.3, w: 10, c: '#3aa0a0' },
  { pts: [-60, 260, 30, 214, 96, 168, 146, 124, 182, 84, 214, 34, 236, -40, 246, -140], z: 0.16, w: 8, c: '#c07a5a' },
];

/** Catmull-Rom through the points, resampled every `step` px of arc length. */
function sampleLane(pts: number[], step: number): { xs: Float32Array; ys: Float32Array; len: number } {
  const n = pts.length / 2;
  const dense: number[] = [];
  const P = (i: number) => {
    const k = Math.max(0, Math.min(n - 1, i));
    return [pts[k * 2]!, pts[k * 2 + 1]!] as const;
  };
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P(i - 1);
    const [x1, y1] = P(i);
    const [x2, y2] = P(i + 1);
    const [x3, y3] = P(i + 2);
    for (let s = 0; s < 40; s++) {
      const t = s / 40;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push(f(x0, x1, x2, x3), f(y0, y1, y2, y3));
    }
  }
  dense.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
  // resample by arc length
  const xs: number[] = [dense[0]!];
  const ys: number[] = [dense[1]!];
  let acc = 0;
  for (let i = 2; i < dense.length; i += 2) {
    const dx = dense[i]! - dense[i - 2]!;
    const dy = dense[i + 1]! - dense[i - 1]!;
    const d = Math.hypot(dx, dy);
    acc += d;
    while (acc >= step) {
      acc -= step;
      const u = 1 - acc / d;
      xs.push(dense[i - 2]! + dx * u);
      ys.push(dense[i - 1]! + dy * u);
    }
  }
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), len: xs.length * step };
}

const STEP = 0.5;

const def: SceneDef = {
  id: 'wormhole-interchange',
  fps: 15,
  focusX: 165,
  focusY: 90,
  rareEvents: 4,
  rareDuration: 14,
  grade: { temperature: -0.1, contrast: 1.12, saturation: 0.85, bloom: 0.85, threshold: 0.58, vignette: 0.34, shadows: '#04040c' },
  create({ accent }) {
    const space = [hex('#020309'), hex('#05071a'), hex('#0a0c26'), hex('#120f2c')];
    const head = hex('#fff2d8');
    const tail = hex('#ff4a3a');
    const yellow = accent;
    const yellowL = mix(accent, hex('#fffbe8'), 0.5);
    const podC = [hex('#0e0e14'), hex('#1e1e28'), hex('#34343e'), hex('#56565e')];
    const haze = hex('#1a1c3a');

    const lanes = LANES.map((L) => {
      const s = sampleLane(L.pts, STEP);
      const base = hex(L.c);
      // farther lanes fade into the blue haze
      const col = mix(base, haze, L.z * 0.55);
      return { ...L, ...s, col, n: s.xs.length };
    });
    // ships: per lane, per side, evenly spaced with a little jitter in the slot
    const SPACING = 4.5;

    /** Which lane covers each buffer pixel (index into lanes, nearest wins), -1 for none. */
    let cover = new Int8Array(0);

    const shipLight = (g: Gfx, li: number, s: number, side: number, c: Color, k: number) => {
      const L = lanes[li]!;
      const i = Math.floor(s / STEP);
      if (i < 1 || i >= L.n - 1) return;
      const x = L.xs[i]!;
      const y = L.ys[i]!;
      const nx = -(L.ys[i + 1]! - L.ys[i - 1]!);
      const ny = L.xs[i + 1]! - L.xs[i - 1]!;
      const nl = Math.hypot(nx, ny) || 1;
      const off = side * L.w * 0.22;
      const px = x + (nx / nl) * off;
      const py = y + (ny / nl) * off;
      const bx = Math.floor(px) - g.ox;
      const by = Math.floor(py) - g.oy;
      if (bx < 0 || by < 0 || bx >= g.w || by >= g.h) return;
      const top = cover[by * g.w + bx]!;
      const hidden = top > li ? 0.3 : 1; // behind a nearer tube: seen through its glass
      g.pxAdd(px, py, c, k * hidden * (1 - L.z * 0.45));
    };

    return {
      background(g) {
        // ── deep space: a dim nebula, stars, a far spiral galaxy ──
        g.vgrad(space, g.top, g.bottom);
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 70, y / 50, 23, 4);
            const m = fbm(x / 30 + 10, y / 26, 29, 3);
            const v = clamp((n - 0.5) * 2.2) * (0.6 + 0.4 * m);
            if (v > 0.02) g.pxA(x, y, mix(hex('#2a1840'), hex('#1a3050'), m), v * 0.5);
            const h = hash3(x, y, 77);
            if (h < 0.006) g.pxA(x, y, hex('#c8d0ff'), 0.25 + 0.6 * hash3(x, y, 78));
          }
        for (let i = 0; i < 90; i++) {
          const a = i * 0.28;
          const r = 1 + i * 0.16;
          g.pxA(46 + Math.cos(a) * r * 1.6, 150 + Math.sin(a) * r * 0.6, hex('#b8a8d8'), 0.18 + 0.2 * hash3(i, 3));
        }
        g.glow(46, 150, 12, hex('#6a5a9a'), 0.12, 4);

        // ── the lanes, far to near: glassy tubes with glowing walls ──
        cover = new Int8Array(g.w * g.h).fill(-1);
        const inten = new Float32Array(g.w * g.h);
        for (let li = 0; li < lanes.length; li++) {
          const L = lanes[li]!;
          inten.fill(0);
          const hw = L.w / 2;
          for (let i = 1; i < L.n - 1; i++) {
            const x = L.xs[i]!;
            const y = L.ys[i]!;
            if (x < g.left - 12 || x > g.right + 12 || y < g.top - 12 || y > g.bottom + 12) continue;
            let nx = -(L.ys[i + 1]! - L.ys[i - 1]!);
            let ny = L.xs[i + 1]! - L.xs[i - 1]!;
            const nl = Math.hypot(nx, ny) || 1;
            nx /= nl;
            ny /= nl;
            for (let d = -hw - 4; d <= hw + 4; d += 0.5) {
              const px = Math.floor(x + nx * d) - g.ox;
              const py = Math.floor(y + ny * d) - g.oy;
              if (px < 0 || py < 0 || px >= g.w || py >= g.h) continue;
              const a = Math.abs(d) / hw;
              // walls brightest, the core faint, a soft halo outside
              const v = a <= 1 ? 0.18 + 0.82 * a ** 4 : 0.5 * (1 - (Math.abs(d) - hw) / 4) ** 2;
              const k = py * g.w + px;
              if (v > inten[k]!) inten[k] = v;
              if (a <= 1) cover[k] = li;
            }
          }
          const k0 = 0.8 * (1 - L.z * 0.5);
          const cr = (L.col & 255) * k0;
          const cg = ((L.col >>> 8) & 255) * k0;
          const cb = ((L.col >>> 16) & 255) * k0;
          const b = g.buf;
          for (let p = 0; p < inten.length; p++) {
            const v = inten[p]!;
            if (v <= 0.01) continue;
            // quantise with dither for a pixel-art falloff
            const x = (p % g.w) + g.ox;
            const y = Math.floor(p / g.w) + g.oy;
            const q = Math.floor(v * 6 + ((hash3(x, y, 5) + hash3(x, y, 6)) / 2)) / 6;
            if (q <= 0) continue;
            const c = b[p]!;
            const dim = cover[p] === li ? 0.55 : 1; // tube glass dims what lies behind it
            let r = (c & 255) * dim + cr * q;
            let gg = ((c >>> 8) & 255) * dim + cg * q;
            let bb = ((c >>> 16) & 255) * dim + cb * q;
            if (r > 255) r = 255;
            if (gg > 255) gg = 255;
            if (bb > 255) bb = 255;
            b[p] = 0xff000000 | ((bb | 0) << 16) | ((gg | 0) << 8) | (r | 0);
          }
        }

        // ── the central wormhole: a dark throat in a ring of folded light ──
        g.glow(HUB.x, HUB.y, 34, hex('#5a4aa0'), 0.25, 6);
        g.disc(HUB.x, HUB.y, 9, hex('#05040e'));
        for (let a = 0; a < 200; a++) {
          const ang = (a / 200) * Math.PI * 2;
          const r = 9.5 + Math.sin(ang * 3) * 0.6;
          g.pxAdd(HUB.x + Math.cos(ang) * r, HUB.y + Math.sin(ang) * r * 0.92, hex('#7a6ac8'), 0.32 + 0.12 * Math.sin(ang * 5));
          g.pxAdd(HUB.x + Math.cos(ang) * (r + 1), HUB.y + Math.sin(ang) * (r + 1) * 0.92, hex('#4a3a90'), 0.25);
        }

        g.lighting(0.8);
        g.light(HUB.x, HUB.y, 120, 0.35, 100);
        g.light(POD.x, POD.y, 40, 0.25);
        vignette(g, 0.5, 165, 90, 250, 200);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 14;
        const crawl = f.reduced ? 0.3 : 1;
        const live = 0.6 + 0.4 * f.awake;

        // the hub swirls slowly: arms of light drawn into the throat
        for (let arm = 0; arm < 3; arm++)
          for (let i = 0; i < 26; i++) {
            const p = i / 26;
            const ang = arm * 2.094 + p * 4.2 - t * 0.6 * crawl;
            const r = 9 * (1 - p * 0.9);
            g.pxAdd(HUB.x + Math.cos(ang) * r, HUB.y + Math.sin(ang) * r * 0.9, hex('#9a8aff'), 0.5 * (1 - p) * live);
          }

        // ── the traffic: bumper to bumper, stop-start waves running back up each lane ──
        for (let li = 0; li < lanes.length; li++) {
          const L = lanes[li]!;
          const len = L.len;
          for (const side of [-1, 1]) {
            const dir = side;
            const c = side > 0 ? head : tail;
            const v = (0.9 + hash3(li, side + 5) * 0.8) * crawl;
            const count = Math.floor(len / SPACING);
            for (let k = 0; k < count; k++) {
              if (hash3(k, li, side + 9) < 0.08) continue; // the odd gap
              const s0 = k * SPACING + hash3(k, li, side) * 1.2;
              const wave = Math.sin(s0 * 0.09 + t * 0.8 * dir * crawl + li) * 1.6;
              let s = s0 + dir * (t * v + wave);
              s = ((s % len) + len) % len;
              const k1 = 0.55 + 0.45 * hash3(k, li, side + 3);
              shipLight(g, li, s, side, c, k1);
            }
          }
        }

        // rare 0: a ship darts into a gap the searchlight finds
        // rare 1: an emergency tender weaves along a lane, its light breathing blue and red
        // rare 3: a ship comes out of the wormhole the wrong way
        if (R(1)) {
          const L = 6;
          const p = smoothstep(0, 14, ev);
          const s = lanes[L]!.len * (0.1 + p * 0.75);
          const alt = f.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(ev * 3);
          const c = mix(hex('#4a6aff'), hex('#ff4a5a'), alt);
          const k = envelope(ev, 14, 1.5, 1.5);
          shipLight(g, L, s, 0, c, 1.2 * k);
          shipLight(g, L, s - 1, 0, c, 0.6 * k);
          const i = Math.floor(s / STEP);
          if (i > 0 && i < lanes[L]!.n) g.glow(lanes[L]!.xs[i]!, lanes[L]!.ys[i]!, 7, c, 0.3 * k, 4);
        }
        if (R(3)) {
          const L = 7;
          const p = clamp(ev / 10);
          const i0 = lanes[L]!.n * 0.42; // sample index near the hub
          const i = Math.floor(i0 - p * lanes[L]!.n * 0.38);
          const k = envelope(ev, 10, 0.3, 2);
          if (i > 2) {
            for (let j = 0; j < 8; j++) {
              const ii = Math.min(lanes[L]!.n - 1, i + j * 2);
              g.pxAdd(lanes[L]!.xs[ii]!, lanes[L]!.ys[ii]!, hex('#d8f8ff'), k * (1 - j / 8));
            }
          }
          if (ev < 1.5) g.glow(HUB.x, HUB.y, 14, hex('#d8f8ff'), 0.5 * (1 - ev / 1.5));
        }

        // ── the traffic pod ──
        let px = POD.x;
        let py = POD.y + (f.reduced ? 0 : Math.sin(t * 0.9) * 1.5);
        if (R(2)) {
          const p = smoothstep(0, 14, ev);
          const a = p * Math.PI * 2;
          const k = envelope(ev, 14, 2, 2);
          px = POD.x + (Math.cos(a + Math.PI / 2) * 0 + (HUB.x - POD.x) * (1 - Math.cos(a)) * 0.5) * k + Math.sin(a) * -60 * k;
          py += (Math.sin(a) * 20 + (1 - Math.cos(a)) * 18) * k;
        }
        px = Math.round(px);
        py = Math.round(py);
        // the searchlight: sweeping the jam below
        let tx = 150 + Math.sin(t * 0.13) * 60;
        let ty = 116 + Math.sin(t * 0.21 + 1) * 22;
        if (R(0)) {
          tx = 110;
          ty = 104;
        }
        beam(g, px - 3, py + 7, tx, ty, 3, 26, yellowL, 0.42 * live, 6);
        g.glow(tx, ty, 12, yellowL, 0.3 * live, 5);
        g.ellipseA(tx, ty, 9, 4, yellowL, 0.12 * live);
        if (R(0)) {
          // one ship nips forward along the near lane, then stops in the light
          const L = lanes[6]!;
          const i = Math.floor(((tx + 80) / 480) * L.n);
          const p = smoothstep(2, 4, ev);
          const s = (i - 14 + p * 14) * STEP;
          shipLight(g, 6, s, 1, head, 1.2 * envelope(ev, 14, 0.5, 2));
        }
        // the pod itself: a fat capsule with a lit cabin, a ducted rotor, a tail boom, skids
        const tilt = R(2) ? Math.round(Math.sin(ev * 0.45) * 1) : 0;
        g.ellipse(px, py, 13, 7, podC[0]!);
        g.ellipse(px, py, 12, 6, podC[1]!);
        g.ellipse(px + 1, py - 2, 9, 3, podC[2]!);
        g.hline(px - 6, px + 8, py - 5, podC[3]!);
        // tail boom and fin
        g.rect(px + 11, py - 2, 10, 3, podC[1]!);
        g.hline(px + 11, px + 20, py - 2, podC[2]!);
        g.poly([px + 19, py - 2, px + 23, py - 8, px + 24, py - 8, px + 22, py + 1], podC[2]!);
        // livery stripe in the station yellow
        g.hline(px - 11, px + 11, py + 2 + tilt, mix(yellow, podC[1]!, 0.3));
        g.hline(px - 10, px + 10, py + 3 + tilt, mix(yellow, podC[0]!, 0.55));
        // canopy: the crew lit by their instruments
        g.poly([px - 12, py + 1, px - 9, py - 4, px - 3, py - 5, px - 2, py + 1], hex('#0a0806'));
        g.poly([px - 11, py + 1, px - 8, py - 3, px - 3, py - 4, px - 3, py + 1], hex('#1a1a20'));
        g.rect(px - 10, py - 1, 7, 2, mix(hex('#2a2010'), yellow, 0.3 * live)); // the instruments' glow
        g.rect(px - 6, py - 4, 2, 3, hex('#08080a')); // Captain Buzz, at the controls
        g.px(px - 6, py - 4, mix(hex('#08080a'), yellow, 0.25 * live));
        g.line(px - 11, py, px - 8, py - 3, mix(hex('#3a3a44'), yellowL, 0.2));
        // rotor ring above
        g.hline(px - 12, px + 12, py - 10, podC[2]!);
        g.hline(px - 12, px + 12, py - 9, podC[0]!);
        g.vline(px, py - 9, py - 7, podC[1]!);
        if (!f.reduced) {
          const r = (t * 34) % 24;
          g.pxAdd(px - 12 + r, py - 10, podC[3]!, 0.9);
          g.pxAdd(px + 12 - r, py - 10, podC[3]!, 0.5);
        }
        // skids
        g.hline(px - 9, px + 7, py + 10, podC[2]!);
        g.px(px - 10, py + 9, podC[2]!);
        g.vline(px - 6, py + 6, py + 9, podC[1]!);
        g.vline(px + 4, py + 6, py + 9, podC[1]!);
        // the searchlight housing
        g.rect(px - 5, py + 6, 4, 2, podC[3]!);
        g.px(px - 4, py + 7, yellowL);
        // beacon: a slow, soft breath (never a flash)
        const breath = f.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.6);
        g.px(px + 2, py - 7, mix(hex('#5a2a10'), hex('#ffb060'), breath));
        g.glow(px + 2, py - 7, 7, hex('#ffb060'), 0.28 * breath * live, 4);
        g.glow(px, py, 20, yellow, 0.05 * live, 4);
      },
    };
  },
};

export default def;

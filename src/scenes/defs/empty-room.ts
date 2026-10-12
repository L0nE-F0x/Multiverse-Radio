// Piano for Empty Rooms: a large bare room with tall windows. Moonlight slides slowly
// across the floorboards, dust drifts in it, and a grand piano in the corner plays itself
// softly. The door at the back is very slightly ajar.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { motes, vignette } from './lib/night';

const VP = { x: 160, y: 78 };
const BACK = { l: 100, r: 224, t: 34, b: 112 };
const NEAR_X = -60;
const DOOR = { x: 128, w: 18, h: 40 };
const PIANO = { x: 196, y: 118 };
// Windows on the left wall as ranges of depth s (0 = back wall, 1 = near edge).
const WINDOWS = [
  [0.06, 0.16],
  [0.3, 0.44],
  [0.6, 0.8],
] as const;

/** A point on the left wall: depth s (0 back … 1 near), height v (0 top … 1 floor). */
const wallPt = (s: number, v: number): [number, number] => {
  const x = BACK.l + (NEAR_X - BACK.l) * s;
  const k = (x - VP.x) / (BACK.l - VP.x);
  const yt = VP.y + (BACK.t - VP.y) * k;
  const yb = VP.y + (BACK.b - VP.y) * k;
  return [x, yt + (yb - yt) * v];
};

/** A point on the floor: depth s (0 back … 1 near), w across the room (0 left wall … 1 right). */
const floorPt = (s: number, w: number, out: number[], i: number) => {
  const x = BACK.l + (NEAR_X - BACK.l) * s;
  const k = (x - VP.x) / (BACK.l - VP.x);
  const xr = VP.x + (BACK.r - VP.x) * k;
  out[i] = x + (xr - x) * w;
  out[i + 1] = VP.y + (BACK.b - VP.y) * k;
};

const def: SceneDef = {
  id: 'empty-room',
  fps: 12,
  focusX: 162,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const ink = hex('#05060a');
    const wallC = [hex('#0a0d13'), hex('#10141c'), hex('#161b24')];
    const floorC = [hex('#08080b'), hex('#0e0d10'), hex('#141216'), hex('#1a171b')];
    const moon = mix(accent, hex('#e8f0ff'), 0.4);
    const warm = hex('#ffc890');
    const pianoC = hex('#07070a');
    const pianoL = mix(hex('#2a3040'), moon, 0.25);
    // Floor patch quads, re-used per frame (no allocations).
    const quad = [0, 0, 0, 0, 0, 0, 0, 0];

    const floorAt = (x: number, y: number) => {
      // floorboards converge on the vanishing point
      const u = (x - VP.x) / Math.max(1, y - VP.y);
      const board = Math.floor(u * 9);
      const fu = u * 9 - board;
      const z = 600 / Math.max(1, y - VP.y);
      const joint = (Math.floor(z + hash3(board, 3, 1) * 3) % 4) === 0 && (z % 1) < 0.08;
      return fu < 0.07 || joint ? 0 : 1 + (hash3(board, 5) > 0.5 ? 1 : 0);
    };

    return {
      background(g) {
        // Ceiling, walls and floor of a bare room in one-point perspective.
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            let c = wallC[0]!;
            const inBack = x >= BACK.l && x < BACK.r && y >= BACK.t && y < BACK.b;
            const dx = x - VP.x;
            const dy = y - VP.y;
            const kl = dx / (BACK.l - VP.x);
            const kr = dx / (BACK.r - VP.x);
            if (inBack) c = wallC[1]!;
            else if (y >= BACK.b && dy > 0 && dy >= (BACK.b - VP.y) * Math.max(kl, kr, 0)) {
              const f = floorAt(x, y);
              const depth = clamp((y - BACK.b) / 90);
              const k = f === 0 ? 0 : f + (depth * 0.8 > bayer(x, y) ? 0 : 0);
              c = floorC[Math.min(3, k)]!;
            } else if (x < BACK.l && kl > 0) c = shade(wallC[2]!, 0.9);
            else if (x >= BACK.r && kr > 0) c = wallC[0]!;
            else c = hex('#08090d');
            g.px(x, y, c);
          }
        // Edges where the planes meet.
        g.line(BACK.l, BACK.t, VP.x + (BACK.l - VP.x) * 3, VP.y + (BACK.t - VP.y) * 3, hex('#05060a'));
        g.line(BACK.r, BACK.t, VP.x + (BACK.r - VP.x) * 3, VP.y + (BACK.t - VP.y) * 3, hex('#05060a'));
        g.line(BACK.l, BACK.b, VP.x + (BACK.l - VP.x) * 3, VP.y + (BACK.b - VP.y) * 3, hex('#05060a'));
        g.line(BACK.r, BACK.b, VP.x + (BACK.r - VP.x) * 3, VP.y + (BACK.b - VP.y) * 3, hex('#05060a'));
        g.rect(BACK.l, BACK.t, BACK.r - BACK.l, 1, hex('#1a2028'));
        g.rect(BACK.l, BACK.b - 3, BACK.r - BACK.l, 3, hex('#0c0e14'));
        // Picture-rail moulding on the back wall.
        g.hline(BACK.l, BACK.r - 1, BACK.t + 8, hex('#1c222c'));
        // A ceiling rose and a bare bulb on a long flex, unlit for years.
        g.ellipse(160, Math.min(BACK.t - 30, 0) , 8, 2, hex('#141820'));
        g.vline(160, Math.min(BACK.t - 30, 0), BACK.t - 6, hex('#0c0e12'));
        g.disc(160, BACK.t - 4, 2, hex('#1e242e'));
        g.px(159, BACK.t - 5, hex('#3a4250'));

        // Tall windows on the left wall: night sky, mullions, a sill.
        for (const [a, b] of WINDOWS) {
          const [x0, y0] = wallPt(a, 0.1);
          const [x1, y1] = wallPt(b, 0.1);
          const [, y0b] = wallPt(a, 0.78);
          const [, y1b] = wallPt(b, 0.78);
          for (let x = Math.ceil(x1); x <= x0; x++) {
            const u = (x - x1) / Math.max(1, x0 - x1);
            const yt = y1 + (y0 - y1) * u;
            const yb = y1b + (y0b - y1b) * u;
            for (let y = Math.ceil(yt); y <= yb; y++) {
              const v = (y - yt) / Math.max(1, yb - yt);
              g.px(x, y, mix(hex('#1a2436'), hex('#2e3a50'), v * 0.6 + (hash3(x, y, 2) < 0.02 ? 0.6 : 0)));
            }
            const mid = Math.round((yt + yb) / 2);
            g.px(x, mid, hex('#0a0c12'));
            g.px(x, Math.round(yt + (yb - yt) * 0.25), hex('#0a0c12'));
            g.px(x, Math.round(yt + (yb - yt) * 0.75), hex('#0a0c12'));
            g.px(x, Math.round(yb) + 1, hex('#202836'));
            g.px(x, Math.round(yb) + 2, hex('#0a0c12'));
          }
          const xm = Math.round((x0 + x1) / 2);
          g.line(xm, (y0 + y1) / 2, xm, (y0b + y1b) / 2, hex('#0a0c12'));
          g.line(Math.ceil(x1), y1, Math.ceil(x1), y1b, hex('#0a0c12'));
          g.line(Math.floor(x0), y0, Math.floor(x0), y0b, hex('#0a0c12'));
        }

        // The door: closed except for a sliver.
        const dx0 = DOOR.x;
        const dy0 = BACK.b - DOOR.h;
        g.rect(dx0 - 2, dy0 - 2, DOOR.w + 4, DOOR.h + 2, hex('#0c0f15'));
        g.rect(dx0, dy0, DOOR.w, DOOR.h, hex('#14181f'));
        g.rect(dx0 + 3, dy0 + 4, DOOR.w - 6, 14, hex('#11151b'));
        g.rect(dx0 + 3, dy0 + 22, DOOR.w - 6, 14, hex('#11151b'));
        g.px(dx0 + DOOR.w - 4, dy0 + 21, hex('#3a3a3a'));

        // The grand piano in the corner, lid up, its bench pulled in.
        const { x, y } = PIANO;
        g.ellipseA(x + 6, y + 1, 40, 5, ink, 0.6);
        g.poly([x - 20, y - 28, x + 34, y - 28, x - 10, y - 60], pianoC);
        g.line(x - 10, y - 60, x + 34, y - 28, pianoL);
        g.line(x + 2, y - 28, x - 4, y - 52, shade(pianoL, 0.6));
        g.ellipse(x + 29, y - 23, 10, 5, pianoC);
        g.rect(x - 28, y - 28, 60, 9, pianoC);
        g.hline(x - 27, x + 30, y - 28, pianoL);
        g.hline(x - 27, x + 24, y - 20, shade(pianoL, 0.5));
        for (const lx of [x - 26, x + 8, x + 27]) g.rect(lx, y - 19, 3, 19, pianoC);
        g.rect(x - 31, y - 29, 9, 2, hex('#c8ccd0'));
        g.hline(x - 31, x - 23, y - 28, hex('#5a6068'));
        g.rect(x - 28, y - 36, 1, 7, pianoL);
        g.line(x - 28, y - 36, x - 24, y - 37, pianoL);
        // pedals
        g.rect(x - 2, y - 4, 1, 4, pianoC);
        g.hline(x - 4, x + 1, y - 1, shade(pianoL, 0.7));

        vignette(g, 0.6, 150, 92, 210, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        // A cloud over the moon (rare) dims everything for a while.
        const cloud = f.rare === 3 && ev < 12 ? envelope(ev, 12, 3, 3) : 0;
        const mk = (1 - cloud * 0.85) * (0.8 + 0.2 * awake);
        // The moon slides: patches drift slowly to the right and back.
        const slide = 14 + Math.sin(t * 0.012) * 12;

        // Moonlight through each window onto the floor, and the dusty air between.
        for (const [a, b] of WINDOWS) {
          const w1 = 0.04 + slide * 0.004;
          const w2 = w1 + 0.24 + (a + b) * 0.06;
          const d = 0.2;
          // shaft through the air: window top edge down to the far edge of the patch
          const [tx0, ty0] = wallPt(a, 0.12);
          const [tx1, ty1] = wallPt(b, 0.12);
          quad[0] = tx0;
          quad[1] = ty0;
          quad[2] = tx1;
          quad[3] = ty1;
          floorPt(b - d, w2, quad, 4);
          floorPt(a - d, w2, quad, 6);
          g.poly(quad, moon, 2, 0.03 * mk);
          const [bx0, by0] = wallPt(a, 0.78);
          const [bx1, by1] = wallPt(b, 0.78);
          quad[0] = bx0;
          quad[1] = by0;
          quad[2] = bx1;
          quad[3] = by1;
          floorPt(b - d * 0.3, w1, quad, 4);
          floorPt(a - d * 0.3, w1, quad, 6);
          g.poly(quad, moon, 2, 0.025 * mk);
          // the patch on the floorboards, with the mullion's shadow down the middle
          floorPt(a - d * 0.3, w1, quad, 0);
          floorPt(b - d * 0.3, w1, quad, 2);
          floorPt(b - d, w2, quad, 4);
          floorPt(a - d, w2, quad, 6);
          g.poly(quad, moon, 2, 0.11 * mk);
          g.poly(quad, moon, 2, 0.05 * mk, 0, -1);
          const m = (a + b) / 2;
          floorPt(m - d * 0.3, w1, quad, 0);
          floorPt(m - d, w2, quad, 2);
          g.line(quad[0]!, quad[1]!, quad[2]!, quad[3]!, hex('#0e0d10'));
        }
        motes(g, t, -40, 30, 230, 120, 50, moon, 0.45 * mk, 8, 0.3);

        // The door, ajar; a little more so, for a while (rare).
        const opening = f.rare === 0 && ev < 12 ? envelope(ev, 12, 3, 4) : 0;
        const gap = 1 + Math.round(opening * 5);
        const dx = DOOR.x + DOOR.w - gap;
        const dy = BACK.b - DOOR.h;
        g.rect(dx, dy, gap, DOOR.h, mix(hex('#2a2018'), warm, 0.35 + opening * 0.3));
        if (gap > 1) g.rect(DOOR.x, dy, DOOR.w - gap, DOOR.h, hex('#12161c'));
        g.poly([dx, BACK.b, dx + gap, BACK.b, dx + gap + 30 * (0.3 + opening), BACK.b + 40, dx - 4, BACK.b + 40], warm, 2, 0.04 + opening * 0.08);

        // The piano plays itself: keys dip, a soft glint on the lid follows the music.
        const { x, y } = PIANO;
        const e = f.energy;
        if (awake > 0.2) {
          for (let i = 0; i < 3; i++) {
            const kx = x - 31 + ((hash3(Math.floor(t * 5), i, 3) * 9) | 0);
            if (hash3(Math.floor(t * 5), i, 4) < 0.3 + e) g.px(kx, y - 29, hex('#3a4048'));
          }
        }
        g.glow(x - 6, y - 52, 8, moon, 0.06 + e * 0.12);

        // The bench slides back, as if someone stood up; later it is pushed in again (rare).
        const benchOut = f.rare === 2 && ev < 12 ? envelope(ev, 12, 1.2, 1.5) : 0;
        const bx = x - 46 - Math.round(benchOut * 10);
        g.rect(bx, y - 15, 15, 4, hex('#0a0a0e'));
        g.hline(bx, bx + 14, y - 15, shade(pianoL, 0.8));
        g.rect(bx + 1, y - 11, 2, 11, hex('#0a0a0e'));
        g.rect(bx + 12, y - 11, 2, 11, hex('#0a0a0e'));

        // A moth comes in through the moonlight and settles on the lid (rare).
        if (f.rare === 1 && ev < 12) {
          const p = clamp(ev / 8);
          const mx = -10 + p * (x - 4 + 10) + Math.sin(ev * 3.1) * 10 * (1 - p);
          const my = 50 + Math.sin(ev * 2.3) * 12 * (1 - p) + p * (y - 61 - 50);
          const flap = ev < 8 && Math.floor(ev * 14) % 2 === 0;
          const mc = mix(hex('#8a8a90'), moon, 0.4);
          g.px(mx, my, mc);
          g.px(mx - 1, my - (flap ? 1 : 0), mc);
          g.px(mx + 1, my - (flap ? 1 : 0), mc);
          if (ev > 8) g.hline(mx - 1, mx + 1, my, mc);
          g.glow(mx, my, 3, moon, 0.15);
        }
      },
    };
  },
};

export default def;

// Substation Null: the reactor hall of the derelict freighter Calloway, now a warehouse rave.
// A dormant core glows faintly blue behind a ring catwalk; steam leaks from old pipework;
// hazard beacons turn slowly and sweep soft amber beams over a crowd of silhouettes. Warning
// signs in a script nobody aboard can read flicker on the walls. The coolant gauge is in the
// red. Someone has taped a note under it.

import { type Color, hex, mix } from '../kit/color';
import { beam } from '../kit/atmos';
import { clamp, envelope, steam } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { bakeFog, drawFog, drawFogAdd, flicker, vignette } from './lib/night';
import { type Pose, crowdBack, figure } from './lib/outer';

const CORE = { x: 160, x0: 134, x1: 186, top: 14, base: 108 };
const RING_Y = 60;
const PORT = { y: 46, r: 12 };
const FLOOR_Y = 116;
const BEACONS = [
  { x: 34, y: 30, ph: 0 },
  { x: 286, y: 30, ph: 2.2 },
];
const GAUGE = { x: 62, y: 70 };
const SIGNS = [
  { x: 92, y: 40, w: 22 },
  { x: 214, y: 48, w: 26 },
  { x: 147, y: 70, w: 26 },
  { x: 250, y: 84, w: 18 },
];

const def: SceneDef = {
  id: 'reactor-room',
  fps: 15,
  focusY: 90,
  rareEvents: 4,
  rareDuration: 10,
  grade: { temperature: -0.15, saturation: 0.85, bloom: 0.6, shadows: '#05070c' },
  create({ accent }) {
    const ink = hex('#030407');
    const sil = hex('#05070b');
    const steel = [hex('#06080d'), hex('#0b1018'), hex('#121a25'), hex('#1c2734'), hex('#2a3a4a')];
    const cyan = accent;
    const cyanD = mix(accent, hex('#0a1420'), 0.7);
    const amber = hex('#ffa63a');
    const redL = hex('#ff4a3a');
    const steamC = hex('#8a9aa8');
    const fogs = [
      bakeFog(84, 46, 61, { sx: 46, sy: 12, lo: 0.34, gain: 1.9, edge: 0.7 }),
      bakeFog(100, 60, 63, { sx: 60, sy: 14, lo: 0.36, gain: 1.8, edge: 0.7 }),
      bakeFog(20, 70, 67, { sx: 70, sy: 20, lo: 0.4, gain: 1.6, edge: 0.9 }),
    ];

    // Glyphs in the unknown script: 3×5 bit patterns, two alphabets (rare event 3 swaps them).
    const glyphs: number[] = [];
    for (let i = 0; i < 64; i++) {
      let bits = 0;
      for (let k = 0; k < 15; k++) if (hash3(i, k, 77) < 0.42) bits |= 1 << k;
      bits |= 1 << 1;
      glyphs.push(bits);
    }
    const drawGlyphs = (g: Gfx, x: number, y: number, w: number, seed: number, c: Color) => {
      for (let i = 0; i * 4 + 3 <= w; i++) {
        const bits = glyphs[(seed * 7 + i * 13) & 63]!;
        for (let k = 0; k < 15; k++) if (bits & (1 << k)) g.px(x + i * 4 + (k % 3), y + Math.floor(k / 3), c);
      }
    };

    // The crowd: rows from the back (small) to the front (big).
    interface Raver {
      x: number;
      y: number;
      h: number;
      ph: number;
      hair: number;
      up: number;
      ri: number;
    }
    const crowd: Raver[] = [];
    const rows = [
      { y: 120, h: 19, n: 11 },
      { y: 129, h: 23, n: 10 },
      { y: 141, h: 29, n: 9 },
      { y: 157, h: 37, n: 8 },
      { y: 182, h: 48, n: 6 },
      { y: 218, h: 62, n: 5 },
      { y: 262, h: 78, n: 4 },
    ];
    rows.forEach((r, ri) => {
      for (let i = 0; i < r.n; i++) {
        const span = 330 + ri * 20;
        const x = 160 - span / 2 + ((i + 0.5) / r.n) * span + (hash3(i, ri, 1) - 0.5) * 18;
        crowd.push({ x, y: r.y + Math.round(hash3(i, ri, 2) * 4), h: r.h * (0.9 + hash3(i, ri, 3) * 0.2), ph: hash3(i, ri, 4) * 6.28, hair: Math.floor(hash3(i, ri, 5) * 5) % 4, up: hash3(i, ri, 6), ri });
      }
    });
    const pose: Pose = { lean: 0, armL: 0, armR: 0, legL: -0.1, legR: 0.1 };
    const hazeC = hex('#1a3a4c');
    const rowC = [mix(sil, hazeC, 0.55), mix(sil, hazeC, 0.4), mix(sil, hazeC, 0.25), mix(sil, hazeC, 0.12), ink];

    return {
      background(g) {
        // ── the hall: ribbed bulkheads fading into the dark ──
        g.vgrad([hex('#020306'), steel[0]!, steel[1]!], g.top, FLOOR_Y);
        for (let x = Math.floor(g.left / 24) * 24; x < g.right; x += 24) {
          const d = Math.abs(x + 12 - 160) / 160;
          for (let y = Math.max(g.top, -60); y < FLOOR_Y; y++) {
            if (bayer(x, y) < 0.4 - d * 0.2) g.px(x, y, steel[2]!);
            g.px(x + 1, y, steel[0]!);
          }
        }
        for (let y = 6; y < FLOOR_Y; y += 34) g.rect(g.left, y, g.w, 2, steel[2]!);
        // ceiling gantry (tall views)
        if (g.top < -10) {
          for (const gy of [-30, -70]) {
            g.rect(g.left, gy, g.w, 5, steel[1]!);
            for (let x = Math.floor(g.left / 10) * 10; x < g.right; x += 10) g.line(x, gy, x + 5, gy + 5, steel[2]!);
            g.hline(g.left, g.right, gy, steel[3]!);
          }
          for (const gy of [-30, -70]) {
            if (gy < g.top) continue;
            for (let x = 30; x < 320; x += 52) {
              g.rect(x - 2, gy + 5, 5, 3, steel[3]!);
              g.px(x, gy + 7, hex('#ffe0b0'));
              g.glow(x, gy + 8, 14, hex('#ffd8a0'), 0.12, 5);
            }
          }
          g.glow(160, -10, 90, cyanD, 0.25, 7);
          g.vline(204, -66, -24, steel[2]!);
          g.rect(200, -24, 9, 4, steel[2]!);
          g.poly([203, -20, 206, -20, 207, -14, 203, -12, 205, -15], steel[2]!);
        }

        // ── pipework on both walls ──
        const pipe = (x0: number, y0: number, x1: number, y1: number, r: number) => {
          if (y0 === y1) {
            for (let k = -r; k <= r; k++) g.hline(x0, x1, y0 + k, steel[Math.max(0, Math.min(4, 2 + Math.round(-k / r * 1.6)))]!);
            for (let x = x0 + 6; x < x1; x += 28) g.rect(x, y0 - r - 1, 2, r * 2 + 3, steel[3]!);
          } else {
            for (let k = -r; k <= r; k++) g.vline(x0 + k, y0, y1, steel[Math.max(0, Math.min(4, 2 + Math.round(-k / r * 1.6)))]!);
            for (let y = y0 + 6; y < y1; y += 22) g.rect(x0 - r - 1, y, r * 2 + 3, 2, steel[3]!);
          }
        };
        pipe(g.left, 22, 112, 22, 3);
        pipe(g.left, 96, 120, 96, 2);
        pipe(208, 26, g.right, 26, 3);
        pipe(200, 100, g.right, 100, 2);
        pipe(18, -60, 18, FLOOR_Y, 4);
        pipe(302, -60, 302, FLOOR_Y, 4);
        pipe(108, 22, 108, 70, 2);
        pipe(214, 26, 214, 66, 2);

        // ── the gauge, and the note under it ──
        g.disc(GAUGE.x, GAUGE.y, 8, steel[3]!);
        g.disc(GAUGE.x, GAUGE.y, 7, hex('#6a6858'));
        for (let a = -2.4; a <= 2.4; a += 0.12) {
          const red = a > 1.2;
          g.px(GAUGE.x + Math.sin(a) * 6, GAUGE.y - Math.cos(a) * 6, red ? hex('#c03020') : hex('#3a3830'));
          if (red) g.px(GAUGE.x + Math.sin(a) * 5, GAUGE.y - Math.cos(a) * 5, hex('#c03020'));
        }
        g.rect(GAUGE.x - 8, GAUGE.y + 11, 17, 7, hex('#4e4c3e'));
        g.textCenter('FINE', GAUGE.x, GAUGE.y + 12, hex('#12161e'));
        g.px(GAUGE.x - 8, GAUGE.y + 11, hex('#9a9478'));
        g.px(GAUGE.x + 8, GAUGE.y + 11, hex('#9a9478'));

        // ── sign plates (glyphs are drawn per frame so they can flicker) ──
        for (const s of SIGNS) {
          g.rect(s.x - 2, s.y - 2, s.w + 4, 13, hex('#14100a'));
          for (let x = s.x - 2; x < s.x + s.w + 2; x++) if (((x + s.y) >> 1) % 3 === 0) g.px(x, s.y + 9, hex('#6a5020'));
        }

        // ── the core: a steel drum with glowing slots ──
        const C = CORE;
        g.glow(C.x, 60, 90, cyanD, 0.25, 8);
        g.ellipse(C.x, C.top + 2, 30, 6, steel[1]!);
        for (let x = C.x0 - 4; x <= C.x1 + 4; x++) {
          const u = (x - C.x) / ((C.x1 - C.x0) / 2 + 4);
          const lit = clamp(1 - Math.abs(u + 0.35) * 1.1);
          for (let y = C.top + 2; y < C.base; y++) {
            const v = lit * 0.75 + 0.1;
            g.px(x, y, steel[Math.min(4, Math.floor(v * 4 + bayer(x, y) * 0.9))]!);
          }
        }
        // hoops
        for (let y = C.top + 10; y < C.base; y += 16) {
          for (let x = C.x0 - 5; x <= C.x1 + 5; x++) {
            const u = (x - C.x) / 31;
            const yy = y + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 3);
            g.px(x, yy, steel[4]!);
            g.px(x, yy + 1, steel[0]!);
          }
        }
        // the dome cap and conduits climbing into the dark
        g.ellipse(C.x, C.top + 2, 31, 7, steel[2]!);
        g.ellipse(C.x, C.top, 24, 5, steel[3]!);
        g.ellipse(C.x, C.top - 2, 10, 3, steel[4]!);
        for (const cx of [146, 160, 174]) g.rect(cx - 2, Math.max(g.top, -80), 4, C.top - 2 - Math.max(g.top, -80), steel[1]!);
        // the porthole into the core: a ring of bolts round dark glass (lit per frame)
        g.disc(C.x, PORT.y, PORT.r + 4, steel[1]!);
        g.disc(C.x, PORT.y, PORT.r + 3, steel[3]!);
        g.disc(C.x, PORT.y, PORT.r + 1, steel[0]!);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) g.px(C.x + Math.cos(a) * (PORT.r + 2), PORT.y + Math.sin(a) * (PORT.r + 2), steel[4]!);
        g.disc(C.x, PORT.y, PORT.r, hex('#04121a'));
        // hazard stripes round the foot of the drum
        for (let x = C.x0 - 2; x < C.x1 + 2; x++)
          for (let y = 92; y < 97; y++) g.px(x, y, ((x + y) >> 2) % 2 ? hex('#3a2c0e') : hex('#0c0a06'));
        // the base and its pit
        g.ellipse(C.x, C.base + 2, 38, 7, ink);
        g.ellipse(C.x, C.base, 36, 6, steel[2]!);
        g.ellipse(C.x, C.base - 1, 33, 4, steel[1]!);

        // ── catwalks: a ring around the core and two spans to the walls ──
        const rail = (x0: number, x1: number, y: number) => {
          g.rect(x0, y, x1 - x0, 2, steel[2]!);
          g.hline(x0, x1, y, steel[4]!);
          g.hline(x0, x1, y - 7, steel[3]!);
          g.hline(x0, x1, y - 4, steel[2]!);
          for (let x = x0; x < x1; x += 6) g.vline(x, y - 7, y, steel[3]!);
          for (let x = x0 + 3; x < x1; x += 10) g.line(x, y + 2, x + 3, y + 6, steel[1]!);
        };
        rail(g.left, C.x0 - 10, RING_Y);
        rail(C.x1 + 10, g.right, RING_Y);
        // ring: front half (the back half hides behind the drum)
        for (let x = C.x0 - 12; x <= C.x1 + 12; x++) {
          const u = (x - C.x) / 38;
          const yy = RING_Y + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 6);
          g.vline(x, yy, yy + 1, steel[2]!);
          g.px(x, yy, steel[4]!);
          g.px(x, yy - 7, steel[3]!);
          if (x % 6 === 0) g.vline(x, yy - 7, yy, steel[3]!);
        }
        // a ladder down from the ring
        for (let y = RING_Y + 4; y < FLOOR_Y; y += 4) g.hline(196, 201, y, steel[2]!);
        g.vline(196, RING_Y + 2, FLOOR_Y, steel[2]!);
        g.vline(201, RING_Y + 2, FLOOR_Y, steel[2]!);

        // ── the floor ──
        g.vgrad([steel[1]!, hex('#080b11'), hex('#05070b')], FLOOR_Y, 180, FLOOR_Y);
        for (let y = FLOOR_Y; y < g.bottom; y += 10) g.hline(g.left, g.right, y, hex('#0e141c'));
        g.ellipseA(C.x, FLOOR_Y + 4, 80, 8, cyan, 0.06);
        for (let y = FLOOR_Y; y < g.bottom; y++) {
          const u = (y - FLOOR_Y) / 140;
          const w = 30 + u * 60;
          g.rectAdd(C.x - w / 2, y, w, 1, cyan, 0.1 * Math.max(0, 1 - u) * (0.7 + 0.3 * bayer(3, y)));
        }
        g.glow(C.x, FLOOR_Y - 6, 110, cyanD, 0.35, 8);

        g.lighting(0.62);
        g.light(C.x, 70, 110, 0.55, 80);
        g.light(GAUGE.x, GAUGE.y, 18, 0.3);
        vignette(g, 0.55, 160, 88, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;
        const surge = f.rare === 0 && ev < 10 ? envelope(ev, 10, 3, 3.5) : 0;
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.35);
        const coreK = 0.28 + 0.12 * breathe + e * 0.12 * awake + surge * 0.5;

        // ── the core's light, leaking through its slots ──
        g.glow(CORE.x, PORT.y, PORT.r + 2, cyan, coreK * 0.9);
        for (let k = -2; k <= 2; k++) {
          const rx = CORE.x + k * 4;
          const hh = Math.round(Math.sqrt(Math.max(0, PORT.r * PORT.r - (k * 4) ** 2)) - 1);
          const lit = coreK * (0.8 + 0.2 * Math.sin(t * 0.9 + k * 1.7));
          g.rectAdd(rx - 1, PORT.y - hh, 2, hh * 2 + 1, hex('#c8faff'), lit * 0.9);
        }
        // a seam of light round the drum's foot and up its edges
        for (let k = 0; k < 6; k++) {
          const sx = CORE.x0 + 4 + k * 9;
          g.rectAdd(sx, 99, 3, 6, cyan, coreK * 0.7);
        }
        g.glow(CORE.x, 64, 60, cyan, coreK * 0.22);
        g.glow(CORE.x, CORE.base - 2, 40, cyan, coreK * 0.18);
        g.glow(CORE.x, CORE.top - 2, 20, cyan, coreK * 0.15);

        // ── warning signs: glyphs that flicker like old tubes ──
        const swap = f.rare === 3 && ev < 10 && ev > 3 && ev < 7 ? 1 : 0;
        for (let i = 0; i < SIGNS.length; i++) {
          const s = SIGNS[i]!;
          let k = f.reduced ? 0.85 : flicker(t, i * 5 + 1, 4);
          const slot = Math.floor(t * 0.5 + i * 3.7);
          if (!f.reduced && hash3(slot, i, 9) < 0.08) k *= 0.35 + 0.3 * Math.sin(t * 9);
          if (f.rare === 3 && ev < 10 && !f.reduced) k *= 0.4 + 0.6 * Math.abs(Math.sin(ev * 3));
          const c = mix(hex('#2a1e08'), amber, k * 0.85);
          drawGlyphs(g, s.x, s.y + 1, s.w, i + swap * 11, c);
          g.glow(s.x + s.w / 2, s.y + 3, s.w * 0.7, amber, 0.05 * k);
        }

        // the gauge needle, deep in the red and not worried about it
        const na = 1.75 + Math.sin(t * 0.8) * 0.08 + (f.reduced ? 0 : f.pulse * 0.1 * awake) + surge * 0.3;
        g.line(GAUGE.x, GAUGE.y, GAUGE.x + Math.sin(na) * 5, GAUGE.y - Math.cos(na) * 5, hex('#1a1010'));
        g.px(GAUGE.x, GAUGE.y, hex('#1a1010'));

        // ── people up on the catwalk ──
        pose.lean = 0;
        pose.legL = -0.1;
        pose.legR = 0.1;
        pose.kneeL = 0;
        pose.kneeR = 0;
        pose.armL = 0.35;
        pose.armR = -0.35;
        pose.elbowL = 0;
        pose.elbowR = 0;
        pose.bob = 0;
        pose.nod = 0;
        pose.hair = 0;
        pose.flare = false;
        pose.skirt = false;
        figure(g, 70, RING_Y, 18, pose, sil);
        pose.armL = -2.6 - (f.reduced ? 0 : f.pulse * 0.3 * awake);
        pose.armR = 0.3;
        pose.bob = f.reduced ? 0 : Math.round(f.pulse * awake);
        pose.hair = 2;
        figure(g, 252, RING_Y, 18, pose, sil);

        // ── hazard beacons: slow turning amber, soft beams ──
        for (let i = 0; i < BEACONS.length; i++) {
          const b = BEACONS[i]!;
          const a = t * 1.1 + b.ph;
          const face = Math.cos(a);
          const k = (0.5 + 0.5 * face) * (0.5 + 0.5 * awake);
          g.rect(b.x - 3, b.y - 2, 7, 5, mix(hex('#3a2208'), amber, 0.3 + k * 0.6));
          g.rect(b.x - 4, b.y + 3, 9, 2, steel[2]!);
          g.glow(b.x, b.y, 10 + k * 6, amber, 0.18 + k * 0.3);
          const dir = Math.sin(a);
          const ex = b.x + dir * 150 + (b.x < 160 ? 60 : -60);
          const ey = b.y + 96 + Math.cos(a * 0.5) * 10;
          beam(g, b.x, b.y, ex, ey, 4, 40, amber, (0.22 + 0.22 * k) * (f.reduced ? 0.6 : 1), 6);
        }
        // small red lamps that fade in and out (never flash)
        for (const [lx, ly, ph] of [
          [118, 36, 0],
          [204, 40, 1.6],
          [40, 92, 3],
          [282, 94, 4.4],
        ] as const) {
          const k = 0.35 + 0.35 * Math.sin(t * 1.2 + ph);
          g.px(lx, ly, mix(hex('#3a0a08'), redL, k));
          g.glow(lx, ly, 6, redL, 0.15 * k);
        }

        // ── steam from the pipework ──
        const sp = f.reduced ? 0.15 : 0.3;
        steam(g, t, 108, 22, steamC, 8, 22, 4, 0.35, sp, 1);
        steam(g, t, 214, 26, steamC, 8, 24, 4, 0.35, sp, 2);
        steam(g, t, 40, 96, steamC, 6, 18, 3, 0.3, sp, 3);
        // Rare: the big valve on the right lets go.
        if (f.rare === 2 && ev < 10) {
          const k = envelope(ev, 10, 0.8, 4);
          for (let i = 0; i < 28; i++) {
            const p = ((ev * 0.25 + i / 28) % 1);
            const x = 286 - p * 70 - Math.sin(i * 2.3) * 8 * p;
            const y = 100 - p * 50 + Math.sin(i * 1.7 + ev) * 6 * p;
            g.ellipseA(x, y, 3 + p * 12, 2 + p * 7, steamC, 0.22 * k * (1 - p));
          }
        }

        // fog banks, the near one lit by the core
        drawFog(g, fogs[2]!, t * 1.5, hex('#0e1620'), 0.5);
        drawFogAdd(g, fogs[0]!, -t * 2, cyan, 0.08 + coreK * 0.12);

        // ── the crowd ──
        const drop = surge;
        for (let i = 0; i < crowd.length; i++) {
          const r = crowd[i]!;
          if (r.y - r.h > g.bottom || r.x < g.left - 20 || r.x > g.right + 20) continue;
          const beat = f.reduced ? 0 : f.pulse * awake;
          const sway = f.reduced ? 0 : Math.sin(t * 2.2 + r.ph) * awake;
          const up = r.up > 0.72 || drop > 0.4 ? 1 : r.up > 0.55 ? 0.3 + 0.3 * Math.max(0, sway) : 0;
          const c = rowC[Math.min(r.ri, rowC.length - 1)]!;
          crowdBack(g, r.x, r.y, r.h, up, sway, Math.round(beat * (1 + r.h / 30)), c, r.hair);
          // rim of core light on the heads of the rows nearest the core
          if (r.ri < 3 && Math.abs(r.x - CORE.x) < 70) g.pxAdd(r.x + (r.x < 160 ? 1 : -1), r.y - r.h * 0.84 + Math.round(beat), cyan, 0.2 + coreK * 0.3);
        }
        // haze over the crowd catches the beams
        drawFog(g, fogs[1]!, t * 2.6, hex('#0c121a'), 0.45);

        // Rare: a maintenance drone drifts across, scanning the floor.
        if (f.rare === 1 && ev < 10) {
          const p = ev / 10;
          const x = g.left - 10 + p * (g.w + 20);
          const y = 48 + Math.sin(ev * 1.3) * 3;
          g.rect(x - 4, y - 2, 9, 4, steel[3]!);
          g.hline(x - 6, x + 6, y - 3, steel[4]!);
          g.px(x, y + 1, Math.floor(ev * 2) % 2 ? redL : hex('#300808'));
          beam(g, x, y + 2, x - 10 + Math.sin(ev * 2) * 20, 150, 2, 26, hex('#b8e8ff'), 0.08 * envelope(ev, 10, 1, 1), 4);
        }
        if (surge > 0) g.glow(CORE.x, 70, 120, cyan, surge * 0.12, 6);
      },
    };
  },
};

export default def;

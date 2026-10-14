// The Minute Between: a room held between 3:33 and 3:34. Moonlight lies in a shaft from the
// tall window, dust hanging in it like stars that forgot to fall; the curtain is caught
// mid-billow; a glass that slipped off the table hangs in the air, its water poured out in a
// frozen ribbon; the clock's second hand waits halfway between two marks. Only the radio's
// dial light moves, breathing, and the air has the faintest shimmer.
// Rare events: one mote drifts, slowly, and stops again; the second hand leans toward the next
// mark and thinks better of it; a glint runs along the frozen water; the dial light swells and
// every mote in the shaft brightens with it.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { shaft, vignette } from './lib/night';

const FLOOR = 132;
const WIN = { x: 52, y: 12, w: 48, h: 88 };
const TABLE = { x: 178, y: 108 }; // table top centre
const RADIO = { x: 168, y: 78, w: 30, h: 30 };
const GLASS = { x: 222, y: 118 }; // where the glass hangs
const CLOCK = { x: 228, y: 30, r: 11 };
const SHELF = { x: 196, y: 68, w: 44 };
const SHAFT = { x0: 82, y0: 50, x1: 172, y1: FLOOR + 14 };

const def: SceneDef = {
  id: 'between-minutes',
  fps: 8,
  focusX: 152,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 12,
  grade: { temperature: -0.3, contrast: 1.1, saturation: 0.78, bloom: 0.7, threshold: 0.6, vignette: 0.38, shadows: '#04050c', highlights: '#eef0ff' },
  create({ accent }) {
    const ink = hex('#030409');
    const wall = [hex('#0a0b14'), hex('#0e101c'), hex('#131624'), hex('#191c2e')];
    const wood = [hex('#0c0a0e'), hex('#141016'), hex('#1c1620'), hex('#28202a')];
    const moon = mix(hex('#dfe4ff'), accent, 0.35);
    const moonDim = mix(hex('#3a4270'), accent, 0.25);
    const dial = mix(accent, hex('#ffd9a0'), 0.35);
    const water = hex('#a8b8e8');
    const glassC = hex('#c8d4ff');
    const curtain = hex('#22263e');

    // Motes hang in the shaft: fixed positions, drawn every frame with the faintest twinkle.
    const motes: [number, number, number][] = [];
    for (let i = 0; motes.length < 70 && i < 600; i++) {
      const u = hash3(i, 1, 9);
      const v = hash3(i, 2, 9) - 0.5;
      const x = SHAFT.x0 + (SHAFT.x1 - SHAFT.x0) * u + v * (20 + u * 40);
      const y = SHAFT.y0 + (SHAFT.y1 - SHAFT.y0) * u + v * (-14 - u * 10);
      if (y > FLOOR - 2) continue;
      motes.push([x, y, hash3(i, 3, 9)]);
    }

    /** The glass, tilted mid-fall, water leaving it in a frozen ribbon. */
    const glass = (g: Gfx, glint: number) => {
      const { x, y } = GLASS;
      // the ribbon of water: an arc from the glass mouth, thinning into drops
      for (let i = 0; i < 22; i++) {
        const u = i / 22;
        const wx = x - 6 - u * 14;
        const wy = y - 6 + Math.sin(u * 2.4) * -5 + u * u * 10;
        const a = 0.75 * (1 - u * 0.6);
        g.pxA(wx, wy, water, a);
        if (u < 0.6) g.pxA(wx, wy + 1, water, a * 0.7);
        if (u < 0.3) g.pxA(wx + 1, wy + 1, water, a * 0.5);
        if (Math.abs(u - glint) < 0.07) g.pxAdd(wx, wy, hex('#ffffff'), 0.6);
      }
      const drops: [number, number, number][] = [
        [x - 22, y + 5, 1],
        [x - 25, y + 9, 1],
        [x - 19, y + 10, 0],
        [x - 28, y + 3, 0],
        [x - 14, y + 14, 0],
        [x - 9, y - 12, 0],
        [x - 5, y - 15, 0],
      ];
      for (const [dx, dy, big] of drops) {
        g.px(dx, dy, water);
        if (big) g.px(dx + 1, dy, shade(water, 0.7));
        g.pxAdd(dx, dy, hex('#ffffff'), 0.25);
      }
      // the glass itself, tipped mouth-down toward the left
      const pts = [x - 7, y - 7, x - 2, y - 11, x + 6, y - 1, x + 2, y + 3];
      g.poly(pts, hex('#1a2038'), 1, 0.55);
      g.line(x - 7, y - 7, x - 2, y - 11, glassC);
      g.line(x - 2, y - 11, x + 6, y - 1, mix(glassC, ink, 0.4));
      g.line(x + 6, y - 1, x + 2, y + 3, glassC);
      g.line(x + 2, y + 3, x - 7, y - 7, mix(glassC, ink, 0.3));
      // water still inside, level with the floor as if gravity paused politely
      g.line(x - 4, y - 5, x + 3, y - 5, water);
      g.line(x - 3, y - 4, x + 3, y - 4, shade(water, 0.6));
      g.px(x + 4, y - 2, hex('#ffffff'));
      g.px(x - 6, y - 7, hex('#ffffff'));
    };

    return {
      background(g) {
        // ── walls: faded paper with a faint stripe ──
        g.vgrad([wall[0]!, wall[1]!, wall[2]!], g.top, FLOOR);
        for (let x = Math.floor(g.left / 8) * 8; x < g.right; x += 8) g.vline(x, g.top, FLOOR, wall[0]!);
        for (let y = g.top; y < FLOOR; y++)
          for (let x = g.left; x < g.right; x++) if (fbm(x / 26, y / 20, 3, 3) > 0.62) g.pxA(x, y, wall[3]!, 0.35);
        // picture rail and skirting
        g.hline(g.left, g.right, 8, wall[3]!);
        g.rect(g.left, FLOOR - 6, g.w, 6, wood[2]!);
        g.hline(g.left, g.right, FLOOR - 6, wood[3]!);
        // ceiling (portrait): a cornice, an unlit lampshade, a moth stopped in the air
        if (g.top < 0) {
          g.vgrad([hex('#050610'), wall[1]!], g.top, 0, g.top, 0);
          g.rect(g.left, -3, g.w, 3, wall[2]!);
          g.hline(g.left, g.right, -3, wall[3]!);
          g.vline(160, g.top, -54, hex('#1a1820'));
          g.poly([150, -40, 170, -40, 165, -54, 155, -54], hex('#22202c'));
          g.hline(150, 170, -40, hex('#3a3644'));
          g.px(176, -60, hex('#5a5468'));
          g.px(175, -61, hex('#4a4458'));
          g.px(177, -61, hex('#4a4458'));
        }

        // ── the tall window: a moon, still clouds, a branch ──
        const W = WIN;
        g.rect(W.x - 4, W.y - 4, W.w + 8, W.h + 8, wood[2]!);
        g.gradRect(W.x, W.y, W.w, W.h, [hex('#0a1028'), hex('#141c3a'), hex('#1e2848')]);
        g.clip(W.x, W.y, W.w, W.h);
        g.glow(W.x + 30, W.y + 22, 30, moonDim, 0.5, 6);
        g.disc(W.x + 30, W.y + 22, 9, moon);
        g.disc(W.x + 27, W.y + 20, 2, shade(moon, 0.9));
        g.disc(W.x + 33, W.y + 25, 1.5, shade(moon, 0.9));
        for (let y = W.y; y < W.y + W.h; y++)
          for (let x = W.x; x < W.x + W.w; x++) {
            const n = fbm(x / 16, y / 6, 61, 3);
            if (n > 0.6) g.pxA(x, y, hex('#3a4268'), clamp((n - 0.6) * 4) * 0.6);
          }
        // a bare branch across the lower panes
        g.line(W.x - 2, W.y + 66, W.x + 20, W.y + 58, ink);
        g.line(W.x + 20, W.y + 58, W.x + 34, W.y + 62, ink);
        g.line(W.x + 12, W.y + 61, W.x + 16, W.y + 50, ink);
        g.line(W.x + 26, W.y + 59, W.x + 30, W.y + 52, ink);
        g.noClip();
        // glazing bars, sill
        g.vline(W.x + W.w / 2, W.y, W.y + W.h, wood[1]!);
        for (let i = 1; i < 4; i++) g.hline(W.x, W.x + W.w - 1, W.y + (W.h / 4) * i, wood[1]!);
        g.rect(W.x - 6, W.y + W.h + 2, W.w + 12, 3, wood[3]!);
        // the curtain, caught mid-billow, lit at its edge
        for (let y = W.y - 6; y < FLOOR - 8; y++) {
          const u = (y - W.y + 6) / (FLOOR - 8 - W.y + 6);
          const bulge = Math.sin(u * Math.PI) * 12 + Math.sin(u * 9) * 2;
          const x0 = W.x + W.w + 2;
          const x1 = x0 + 6 + bulge;
          g.hline(x0, x1, y, curtain);
          g.px(x1, y, mix(curtain, moon, 0.35));
          g.px(x1 - 1, y, mix(curtain, moon, 0.15));
          // folds: soft vertical shadows following the billow
          for (const fx of [0.3, 0.62]) g.px(x0 + (x1 - x0) * fx, y, shade(curtain, 0.65));
        }
        g.rect(W.x - 10, W.y - 8, W.w + 30, 2, wood[3]!); // the rail

        // ── the clock: 3:33, the second hand caught halfway (drawn per frame) ──
        {
          const { x, y, r } = CLOCK;
          g.disc(x, y, r + 2, wood[1]!);
          g.disc(x, y, r + 1, wood[3]!);
          g.disc(x, y, r, hex('#6e7088'));
          for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 2;
            const l = i % 5 === 0 ? 2 : 1;
            for (let k = 0; k < l; k++) g.px(x + Math.cos(a) * (r - 1 - k), y + Math.sin(a) * (r - 1 - k), hex('#2a2c3a'));
          }
          const hA = ((3 + 33 / 60) / 12) * Math.PI * 2 - Math.PI / 2;
          const mA = (33 / 60) * Math.PI * 2 - Math.PI / 2;
          g.line(x, y, x + Math.cos(hA) * 6, y + Math.sin(hA) * 6, hex('#14141c'));
          g.line(x, y, x + Math.cos(mA) * 9, y + Math.sin(mA) * 9, hex('#14141c'));
        }

        // ── a wall shelf: a vase of flowers, one petal stopped on its way down (drawn per frame) ──
        {
          const S = SHELF;
          g.rect(S.x, S.y, S.w, 2, wood[3]!);
          g.hline(S.x, S.x + S.w - 1, S.y + 2, wood[0]!);
          g.line(S.x + 4, S.y + 2, S.x + 8, S.y + 7, wood[1]!);
          g.line(S.x + S.w - 5, S.y + 2, S.x + S.w - 9, S.y + 7, wood[1]!);
          const vx = S.x + 12;
          g.ellipse(vx, S.y - 4, 3, 4, hex('#2a3048'));
          g.rect(vx - 1, S.y - 10, 3, 4, hex('#2a3048'));
          g.px(vx - 2, S.y - 5, hex('#4a5478'));
          for (const [dx, dy, c] of [
            [-4, -18, '#6a4a6a'],
            [1, -21, '#7a5a78'],
            [5, -16, '#6a4a6a'],
            [-1, -15, '#5a4a6a'],
          ] as const) {
            g.line(vx, S.y - 10, vx + dx, S.y + dy + 2, hex('#1e2a22'));
            g.disc(vx + dx, S.y + dy, 1.5, hex(c));
          }
          // a book or two, a small framed photograph
          g.rect(S.x + 24, S.y - 9, 3, 9, hex('#2a2238'));
          g.rect(S.x + 27, S.y - 8, 2, 8, hex('#20283a'));
          g.rect(S.x + 31, S.y - 8, 8, 8, wood[3]!);
          g.rect(S.x + 32, S.y - 7, 6, 6, hex('#3a3e54'));
        }

        // ── floor: boards, a rug, the patch of moonlight ──
        g.vgrad([wood[2]!, wood[1]!, ink], FLOOR, Math.max(FLOOR + 60, g.bottom - 10), FLOOR);
        for (let y = FLOOR + 2, gap = 2; y < g.bottom; y += gap, gap = Math.min(gap + 1, 12)) g.hline(g.left, g.right, y, wood[0]!);
        g.ellipse(180, FLOOR + 22, 66, 9, hex('#16121e'));
        g.ellipse(180, FLOOR + 22, 60, 7, hex('#1e1828'));
        // the window's light on the floor: a skewed set of panes
        for (let y = FLOOR + 6; y < FLOOR + 26; y++) {
          const u = (y - FLOOR - 6) / 20;
          const x0 = 118 + u * 22;
          const x1 = x0 + 52 + u * 10;
          for (let x = x0; x < x1; x++) {
            const pane = ((x - x0) / (x1 - x0)) * 2;
            if (Math.abs(pane - Math.round(pane)) < 0.05 || Math.abs(u * 4 - Math.round(u * 4)) < 0.08) continue;
            g.pxAdd(x, y, moon, 0.1 * (1 - u * 0.4));
          }
        }

        // ── the table, the chair, the radio ──
        const T = TABLE;
        g.ellipse(T.x, T.y, 32, 4, wood[3]!);
        g.ellipse(T.x, T.y + 1, 32, 3, wood[2]!);
        g.rect(T.x - 2, T.y + 3, 5, FLOOR + 14 - T.y - 3, wood[1]!);
        g.ellipse(T.x, FLOOR + 14, 12, 2, wood[1]!);
        // a chair, a cardigan over its back
        g.rect(118, 74, 4, 58, wood[1]!);
        g.rect(118, 100, 26, 4, wood[2]!);
        g.rect(140, 104, 3, 34, wood[1]!);
        g.rect(120, 104, 3, 34, wood[0]!);
        g.poly([114, 76, 126, 76, 128, 100, 112, 104], hex('#2a2234'));
        g.line(126, 78, 128, 99, mix(hex('#2a2234'), moon, 0.25));
        // the radio: a cathedral cabinet, a cloth grille under its arch, the dial (lit per frame)
        const R = RADIO;
        const cab = hex('#2a1a12');
        const cabL = hex('#3e2a1c');
        g.rect(R.x, R.y + 10, R.w, R.h - 10, cab);
        g.ellipse(R.x + R.w / 2, R.y + 11, R.w / 2, 11, cab);
        g.rect(R.x, R.y + 26, R.w, R.h - 26, cabL); // the base
        // the arch's moulding and the grille cloth behind fretwork
        g.ellipse(R.x + R.w / 2, R.y + 13, R.w / 2 - 4, 8, hex('#140c08'));
        g.rect(R.x + 4, R.y + 13, R.w - 8, 7, hex('#140c08'));
        for (let k = -3; k <= 3; k++) g.vline(R.x + R.w / 2 + k * 3, R.y + 7 + Math.abs(k), R.y + 19, hex('#2e1e14'));
        g.ring(R.x + R.w / 2, R.y + 11, R.w / 2, 11, cabL);
        g.hline(R.x + 4, R.x + R.w - 5, R.y + 20, cabL);
        // the dial window and two knobs
        g.rect(R.x + 9, R.y + 21, 12, 4, hex('#141008'));
        g.disc(R.x + 5, R.y + 23, 1.5, hex('#5a4630'));
        g.disc(R.x + R.w - 6, R.y + 23, 1.5, hex('#5a4630'));
        g.px(R.x + 4, R.y + 22, hex('#8a7050'));
        g.px(R.x + R.w - 7, R.y + 22, hex('#8a7050'));
        // a book, a pair of reading glasses
        g.rect(T.x - 24, T.y - 3, 14, 3, hex('#3a2a40'));
        g.hline(T.x - 24, T.x - 11, T.y - 3, hex('#5a4a5a'));
        g.ring(T.x - 18, T.y - 5, 2, 1, hex('#5a5a6a'));
        g.ring(T.x - 13, T.y - 5, 2, 1, hex('#5a5a6a'));

        // ── light ──
        g.lighting(0.42);
        g.lightRect(WIN.x, WIN.y, WIN.w, WIN.h, 0.35, 10);
        g.light(SHAFT.x1 - 20, SHAFT.y1 - 30, 70, 0.5, 40);
        g.light(RADIO.x + 22, RADIO.y + 8, 26, 0.35);
        g.light(GLASS.x - 8, GLASS.y, 24, 0.3);
        g.light(CLOCK.x, CLOCK.y, 20, 0.2);
        g.light(150, FLOOR + 16, 64, 0.3, 16);
        g.light(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 70, 0.15, 60);
        vignette(g, 0.5, 168, 84, 230, 180);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 12;
        const live = 0.5 + 0.5 * f.awake;
        const breath = R(3) ? envelope(ev, 12, 3, 4) : 0;

        // the shaft of moonlight
        shaft(g, SHAFT.x0, SHAFT.y0, SHAFT.x1, SHAFT.y1, 30, 66, moon, 0.17 + breath * 0.05, 0.4, 6);

        // the motes: held in place; a breath of shimmer
        const drift = R(0) ? ev : -1;
        for (let i = 0; i < motes.length; i++) {
          let [x, y, s] = motes[i]!;
          if (i === 7 && drift >= 0) {
            const p = smoothstep(1.5, 10, drift);
            x += p * 18;
            y -= Math.sin(p * Math.PI) * 4 + p * 3;
          }
          const tw = f.reduced ? 0.8 : 0.72 + 0.28 * Math.sin(t * (0.25 + s * 0.4) + s * 40);
          g.pxAdd(x, y, moon, (0.22 + 0.45 * s) * tw * (1 + breath * 0.8));
          if (s > 0.9) g.pxAdd(x + 1, y, moon, 0.15 * tw);
        }

        // the petal, halfway down from the vase
        {
          const px = SHELF.x + 15;
          const py = SHELF.y + 12;
          g.px(px, py, hex('#8a6a88'));
          g.px(px + 1, py, hex('#6a4a6a'));
          g.pxAdd(px, py, moon, 0.15);
        }

        // the glass and its water, and a glint that sometimes runs along it
        glass(g, R(2) ? smoothstep(2, 9, ev) : -1);

        // the second hand, halfway between :33 and :34 (it leans, once in a while)
        {
          const { x, y } = CLOCK;
          let s = 47.5;
          if (R(1)) s += 0.35 * envelope(ev, 12, 3, 4);
          const a = (s / 60) * Math.PI * 2 - Math.PI / 2;
          g.line(x, y, x + Math.cos(a) * 10, y + Math.sin(a) * 10, hex('#7a2a34'));
          g.px(x, y, hex('#14141c'));
        }

        // the radio dial: the one thing still moving, breathing light into the room
        {
          const R0 = RADIO;
          const b = f.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.9);
          const k = live * (0.55 + 0.3 * b + breath * 0.5);
          const dx = R0.x + 9;
          const dy = R0.y + 21;
          g.rect(dx, dy, 12, 4, mix(hex('#1a1408'), dial, 0.5 * k));
          for (let i = 0; i < 12; i += 2) g.px(dx + i, dy, mix(dial, hex('#1a1408'), 0.6));
          const needle = dx + 5 + Math.round(Math.sin(t * 0.05) * 2);
          g.vline(needle, dy, dy + 3, hex('#8a2a2a'));
          g.glow(dx + 6, dy + 2, 12 + breath * 8, dial, 0.24 * k, 5);
          g.ellipseA(dx + 6, TABLE.y, 16, 2, dial, 0.08 * k);
          // its light catches the grille's fretwork from below
          g.hline(R0.x + 6, R0.x + R0.w - 7, R0.y + 19, mix(hex('#2e1e14'), dial, 0.25 * k));
        }

        // the air's faint shimmer: a slow, almost invisible ripple across the shaft
        if (!f.reduced) {
          const sx = SHAFT.x0 + ((t * 3) % 140) - 20;
          for (let y = SHAFT.y0; y < FLOOR; y += 2) {
            const x = sx + (y - SHAFT.y0) * 0.9;
            g.pxAdd(x, y, moon, 0.04);
          }
        }
      },
    };
  },
};

export default def;

// Baroque Robot Philharmonic: a candlelit salon after dark. Three robots in powdered wigs and
// frock coats play harpsichord and cello; the conductor keeps time with a spoon. The oil
// portrait above them is of a toaster, which nobody mentions.

import { motes, flicker, gloom, haze, lightPool } from '../kit/atmos';
import { type Color, hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { arc, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const FLOOR_Y = 116;
const SEAT_Y = 106;
const PODIUM_Y = 124;

interface Bot {
  metal: Color[];
  coat: Color[];
  /** Which side the key light comes from (-1 left, 1 right). */
  lit: -1 | 1;
}

const def: SceneDef = {
  id: 'robot-salon',
  fps: 18,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 6,
  grade: { temperature: 0.35, contrast: 1.16, saturation: 0.8, shadows: '#0a0806', bloom: 0.7, threshold: 0.7, vignette: 0.4 },
  create({ accent }) {
    const ink = hex('#0a0706');
    const wall = [hex('#0e1c16'), hex('#13261e'), hex('#1b3328')];
    const gold = [hex('#3a2810'), hex('#6e4e22'), hex('#a47c3c'), hex('#d8b46e')];
    const wood = [hex('#1a0d08'), hex('#2a160d'), hex('#3e2215'), hex('#58321d')];
    const wine = [hex('#1e070c'), hex('#3a0f18'), hex('#5a1a24')];
    const wig = [hex('#4a4652'), hex('#8a8490'), hex('#c4bcb6'), hex('#ece2cc')];
    const lace = hex('#e4dac6');
    const flame = mix(hex('#ffcf73'), accent, 0.3);
    const flameCore = hex('#fff3d6');
    const eyeC = hex('#9fe6da');
    const silver: Bot = {
      metal: [hex('#15181e'), hex('#343a46'), hex('#5e6674'), hex('#959caa'), hex('#d0d4da')],
      coat: [hex('#0c1226'), hex('#18234a'), hex('#2a3a6c')],
      lit: 1,
    };
    const brass: Bot = {
      metal: [hex('#20140a'), hex('#4a3016'), hex('#7c5628'), hex('#b48848'), hex('#e6c88a')],
      coat: wine,
      lit: -1,
    };
    const copper: Bot = {
      metal: [hex('#1c0f0a'), hex('#46241a'), hex('#77402a'), hex('#ad6a44'), hex('#e0a47a')],
      coat: [hex('#0a1712'), hex('#14302a'), hex('#22483e')],
      lit: -1,
    };

    // ── a robot from the hips up (plus legs). facing -1/1: three-quarter view; 2: from behind.
    const bot = (g: Gfx, x: number, hipY: number, B: Bot, facing: -1 | 1 | 2, o: { eye: number; wigLift?: number; headDy?: number; look?: number; seated: boolean; feetY: number }) => {
      x = Math.round(x);
      hipY = Math.round(hipY);
      const m = B.metal;
      const c = B.coat;
      const L = B.lit;
      const hd = Math.round(o.headDy ?? 0);
      // Legs: thin jointed metal with buckled shoes.
      if (o.seated) {
        const dir = facing === 2 ? 0 : facing;
        for (const k of [-1, 1]) {
          const kx = x + dir * 9 + k * 3;
          g.rect(Math.min(x + k * 3, kx), hipY - 1, Math.abs(kx - x - k * 3) + 2, 3, m[1]!);
          g.rect(kx, hipY, 2, o.feetY - hipY - 2, k === L ? m[2]! : m[1]!);
          g.rect(kx - (dir < 0 ? 2 : 0), o.feetY - 3, 5, 3, ink);
          g.px(kx + 1, o.feetY - 3, gold[3]!);
        }
      } else {
        for (const k of [-1, 1]) {
          g.rect(x + k * 4 - 1, hipY, 3, o.feetY - hipY - 2, k === L ? m[2]! : m[1]!);
          g.rect(x + k * 4 - 2, o.feetY - 3, 5, 3, ink);
          g.px(x + k * 4, o.feetY - 3, gold[3]!);
        }
      }
      // Frock coat: shoulders, flared skirt.
      const top = hipY - 24 + hd;
      g.poly([x - 9, top, x + 9, top, x + 12, hipY + 5, x - 12, hipY + 5], ink);
      g.poly([x - 8, top + 1, x + 8, top + 1, x + 11, hipY + 4, x - 11, hipY + 4], c[1]!);
      g.poly([x + L * 8, top + 1, x + L * 3, top + 1, x + L * 5, hipY + 4, x + L * 11, hipY + 4], c[2]!);
      g.poly([x - L * 8, top + 1, x - L * 6, top + 1, x - L * 9, hipY + 4, x - L * 11, hipY + 4], c[0]!);
      if (facing !== 2) {
        // Front edge, gold buttons and a lace jabot.
        const fx = x + facing * 3;
        g.vline(fx, top + 4, hipY + 4, c[0]!);
        for (let k = 0; k < 4; k++) g.px(fx + facing * 2, top + 6 + k * 4, gold[k === 0 ? 3 : 2]!);
        g.tri(fx - 3, top, fx + 3, top, fx, top + 8, lace);
        g.px(fx, top + 2, mix(lace, ink, 0.3));
      } else {
        // Back seam and coat-tail vent.
        g.vline(x, top + 10, hipY + 4, c[0]!);
        g.px(x - 2, hipY - 2, gold[2]!);
        g.px(x + 2, hipY - 2, gold[2]!);
      }
      // Neck and head.
      const hy = top - 13;
      g.rect(x - 2, top - 3, 5, 4, m[1]!);
      roundRect(g, x - 8, hy - 1, 16, 14, 3, ink);
      roundRect(g, x - 7, hy, 14, 12, 3, m[2]!);
      g.rect(x + (L > 0 ? 3 : -7), hy + 2, 4, 9, m[3]!);
      g.rect(x + (L > 0 ? -7 : 5), hy + 3, 2, 8, m[1]!);
      g.hline(x - 5, x + 5, hy, m[3]!);
      if (facing !== 2) {
        // Face plate turned three-quarters, round eyes, a little speaker grille.
        const fx = x + facing * 2;
        const look = Math.round(o.look ?? 0);
        g.rect(fx - 5, hy + 2, 10, 9, m[3]!);
        g.rect(fx - 5, hy + 9, 10, 2, m[2]!);
        for (const ex of [fx - 3, fx + 2]) {
          g.rect(ex, hy + 4, 2, 2, m[0]!);
          if (o.eye > 0) {
            g.px(ex + (look > 0 ? 1 : 0), hy + 4 + (look < 0 ? 1 : 0), mix(m[0]!, eyeC, Math.min(1, o.eye)));
            g.glow(ex + 1, hy + 5, 4, eyeC, 0.15 * o.eye);
          }
        }
        g.hline(fx - 2, fx + 2, hy + 9, m[1]!);
        for (let k = -2; k <= 2; k += 2) g.px(fx + k, hy + 9, m[0]!);
      }
      // The powdered wig: a crown, three rolled curls a side, a queue with a black bow.
      const wy = hy - Math.round(o.wigLift ?? 0);
      const curl = (cx: number, cy: number, s: number) => {
        g.disc(cx, cy, 2.5, ink);
        g.disc(cx, cy, 2, wig[s]!);
        g.px(cx - 1, cy - 1, wig[Math.min(3, s + 1)]!);
      };
      g.ellipse(x, wy + 1, 10, 6, ink);
      g.ellipse(x, wy + 1, 9, 5, wig[2]!);
      g.ellipse(x + L * 3, wy - 1, 5, 2, wig[3]!);
      g.ellipse(x - L * 5, wy + 3, 4, 2, wig[1]!);
      for (let k = 0; k < 3; k++) {
        if (facing !== 1 || true) curl(x - 9, wy + 4 + k * 4, L < 0 ? 2 : 1);
        curl(x + 9, wy + 4 + k * 4, L > 0 ? 2 : 1);
      }
      if (facing === 2) {
        g.rect(x - 7, wy + 2, 14, 9, wig[2]!);
        for (let k = -6; k <= 6; k += 3) g.vline(x + k, wy + 4, wy + 9, wig[1]!);
        g.rect(x - 2, wy + 10, 4, 9, wig[1]!);
        g.rect(x - 1, wy + 10, 2, 8, wig[2]!);
        g.rect(x - 4, wy + 10, 9, 3, ink);
        g.rect(x - 3, wy + 11, 7, 1, hex('#1a1418'));
      } else {
        const qx = x - facing * 9;
        g.rect(qx - 1, wy + 13, 3, 6, wig[1]!);
        g.rect(qx - 2, wy + 12, 5, 2, ink);
      }
    };

    /** A lace cuff and a metal hand at (x, y). */
    const hand = (g: Gfx, x: number, y: number, B: Bot) => {
      g.rect(Math.round(x) - 2, Math.round(y) - 1, 4, 3, lace);
      g.disc(Math.round(x), Math.round(y) + 2, 1.5, B.metal[3]!);
    };

    const candle = (g: Gfx, x: number, y: number, t: number, seed: number, reduced: boolean, k = 1) => {
      g.rect(x - 1, y, 3, 6, hex('#e8dcc4'));
      g.px(x + 1, y + 1, hex('#b8ac98'));
      const fl = reduced ? 1 : flicker(t, seed, 0.18, 6);
      const lean = reduced ? 0 : Math.round((hash3(Math.floor(t * 3), seed) - 0.5) * 1.2);
      g.px(x + lean, y - 3, flame);
      g.px(x, y - 2, flame);
      g.px(x, y - 1, flameCore);
      if (fl > 0.95) g.px(x + lean, y - 4, mix(flame, ink, 0.4));
      g.glow(x, y - 2, 7, flame, 0.35 * fl * k, 4);
    };

    return {
      background(g) {
        // Wall: dark bottle-green damask.
        for (let y = g.top; y < FLOOR_Y - 20; y++)
          for (let x = g.left; x < g.right; x++) {
            const cx = (((x % 18) + 18) % 18) - 9;
            const cy = ((((y + (Math.floor(x / 18) & 1) * 11) % 22) + 22) % 22) - 11;
            const d = Math.abs(cx) / 6 + Math.abs(cy) / 9;
            const petal = Math.abs(Math.sin(Math.atan2(cy, cx) * 2)) * 0.25;
            g.px(x, y, d < 0.6 + petal && d > 0.45 + petal * 0.6 ? wall[2]! : d < 0.18 ? wall[2]! : wall[1]!);
          }
        // Wainscot with panels, chair rail, skirting.
        const wy = FLOOR_Y - 20;
        g.rect(g.left, wy, g.w, 20, wood[1]!);
        g.rect(g.left, wy, g.w, 2, gold[2]!);
        g.rect(g.left, wy + 2, g.w, 1, gold[0]!);
        for (let x = g.left - (((g.left % 26) + 26) % 26); x < g.right; x += 26) {
          g.rect(x + 3, wy + 5, 20, 11, wood[0]!);
          g.rect(x + 4, wy + 6, 18, 9, wood[2]!);
          g.hline(x + 4, x + 21, wy + 6, wood[3]!);
        }
        g.rect(g.left, FLOOR_Y - 2, g.w, 2, wood[0]!);

        // A tall window far left: night outside, a thin moon.
        g.rect(-6, 18, 34, 78, ink);
        g.clip(-4, 20, 30, 74);
        g.vgrad([hex('#0a1428'), hex('#13223e'), hex('#1d2e4a')], 20, 94);
        g.noClip();
        for (let i = 0; i < 14; i++) g.px(-3 + hash3(i, 1) * 28, 22 + hash3(i, 2) * 50, hex('#8aa0c8'));
        g.disc(14, 34, 4, hex('#c8d4e8'));
        g.disc(16, 33, 4, hex('#13223e'));
        for (const yy of [44, 68]) g.rect(-6, yy, 34, 2, ink);
        g.rect(10, 18, 2, 78, ink);
        // Heavy curtain beside it.
        g.poly([28, 14, 42, 14, 40, 70, 46, 112, 30, 112], wine[1]!);
        for (let k = 0; k < 3; k++) g.line(31 + k * 4, 16, 33 + k * 4, 110, wine[0]!);
        g.line(40, 16, 44, 110, wine[2]!);

        // Portrait of a toaster in a gilded frame, top centre.
        const px = 140;
        const py = 24;
        g.rect(px - 1, py - 1, 42, 42, ink);
        g.rect(px, py, 40, 40, gold[1]!);
        g.rect(px + 1, py + 1, 38, 38, gold[2]!);
        g.rect(px + 3, py + 3, 34, 34, gold[0]!);
        for (let k = 0; k < 40; k += 4) {
          g.px(px + k, py, gold[3]!);
          g.px(px, py + k, gold[3]!);
        }
        g.gradRect(px + 4, py + 4, 32, 32, [hex('#0f0b08'), hex('#1e160e'), hex('#120d09')]);
        g.glow(px + 20, py + 18, 16, hex('#ffd8a0'), 0.08);
        // the sitter: a chrome toaster with a ruff, painted in the old manner
        roundRect(g, px + 9, py + 14, 22, 15, 3, ink);
        roundRect(g, px + 10, py + 15, 20, 13, 3, hex('#5e6470'));
        g.rect(px + 10, py + 15, 20, 3, hex('#9aa2ae'));
        g.rect(px + 22, py + 18, 6, 9, hex('#7a828e'));
        g.rect(px + 13, py + 15, 5, 1, ink);
        g.rect(px + 21, py + 15, 5, 1, ink);
        g.rect(px + 29, py + 19, 2, 4, ink);
        for (let k = 0; k < 6; k++) g.disc(px + 11 + k * 4, py + 30, 2, hex('#b8ae9c'));
        g.rect(px + 14, py + 34, 12, 2, gold[2]!);

        // Wall sconces either side of the portrait (lit in frame()).
        for (const sx of [122, 198]) {
          g.rect(sx - 1, 52, 3, 10, gold[1]!);
          arc(g, sx, 52, 4, 3, 0, Math.PI, gold[2]!);
        }

        // Floor: dark herringbone parquet receding to the wall.
        for (let y = FLOOR_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const d = y - FLOOR_Y;
            const k = (Math.floor((x + d * 1.5) / 7) + Math.floor((x - d * 1.5) / 7)) & 1;
            g.px(x, y, k ? wood[2]! : wood[1]!);
          }
        // Rug under the ensemble, in perspective.
        g.poly([62, 120, 258, 120, 300, 178, 20, 178], ink);
        g.poly([64, 121, 256, 121, 296, 177, 24, 177], wine[1]!);
        g.poly([74, 124, 246, 124, 280, 172, 40, 172], gold[0]!);
        g.poly([76, 125, 244, 125, 277, 171, 43, 171], wine[2]!);
        g.poly([96, 131, 224, 131, 246, 162, 74, 162], wine[1]!);
        for (let i = 0; i < 18; i++) {
          const u = i / 17;
          g.px(80 + u * 160, 127, gold[1]!);
          g.px(56 + u * 208, 168, gold[1]!);
        }

        // Harpsichord (left): a long case with the lid propped open on a painted landscape.
        const hx = 22;
        const top = 92;
        g.poly([hx, top - 2, hx + 90, top - 2, hx + 90, top + 12, hx + 14, top + 12], ink);
        g.poly([hx + 1, top - 1, hx + 89, top - 1, hx + 89, top + 11, hx + 15, top + 11], hex('#1a1210'));
        g.rect(hx + 15, top + 9, 74, 1, gold[1]!);
        g.rect(hx + 1, top - 1, 88, 1, gold[2]!);
        // lid
        g.poly([hx + 4, top - 2, hx + 84, top - 2, hx + 62, top - 40, hx + 2, top - 24], ink);
        g.poly([hx + 6, top - 3, hx + 82, top - 3, hx + 61, top - 38, hx + 4, top - 24], gold[1]!);
        g.poly([hx + 9, top - 5, hx + 78, top - 5, hx + 60, top - 35, hx + 7, top - 23], hex('#26405a'));
        g.poly([hx + 9, top - 5, hx + 78, top - 5, hx + 70, top - 14, hx + 40, top - 18, hx + 8, top - 12], hex('#2e4a30'));
        g.disc(hx + 50, top - 26, 2, hex('#e8d8a8'));
        g.line(hx + 4, top - 2, hx + 30, top - 30, ink);
        // legs
        for (const lx of [hx + 18, hx + 52, hx + 84]) {
          g.rect(lx, top + 12, 3, FLOOR_Y - top - 10, wood[0]!);
          g.px(lx + 1, top + 14, gold[1]!);
        }
        // keyboard at the right end
        g.rect(hx + 82, top - 4, 16, 6, ink);
        for (let k = 0; k < 7; k++) g.rect(hx + 83 + k * 2, top - 3, 1, 3, lace);
        // music desk with a sheet
        g.rect(hx + 72, top - 14, 12, 9, hex('#d8ccb0'));
        for (let k = 0; k < 3; k++) g.hline(hx + 73, hx + 82, top - 12 + k * 2, hex('#7a6a58'));
        // candelabra standing on the case
        const cx = hx + 26;
        g.rect(cx - 1, top - 20, 3, 18, gold[2]!);
        g.rect(cx - 4, top - 3, 9, 2, gold[1]!);
        arc(g, cx, top - 20, 7, 4, 0, Math.PI, gold[2]!);

        // Stools, podium, the cellist's chair and music stand.
        g.rect(114, SEAT_Y, 16, 3, wood[3]!);
        g.rect(116, SEAT_Y + 3, 2, FLOOR_Y - SEAT_Y + 2, wood[0]!);
        g.rect(126, SEAT_Y + 3, 2, FLOOR_Y - SEAT_Y + 2, wood[0]!);
        g.rect(146, PODIUM_Y, 30, 8, wood[2]!);
        g.rect(146, PODIUM_Y, 30, 1, gold[2]!);
        g.rect(146, PODIUM_Y + 7, 30, 1, wood[0]!);
        g.rect(218, SEAT_Y, 18, 3, wood[3]!);
        g.rect(232, SEAT_Y - 26, 3, 26, wood[2]!);
        g.rect(220, SEAT_Y + 3, 2, FLOOR_Y - SEAT_Y + 2, wood[0]!);
        g.rect(232, SEAT_Y + 3, 2, FLOOR_Y - SEAT_Y + 2, wood[0]!);
        g.vline(196, 90, FLOOR_Y + 2, gold[1]!);
        g.rect(188, 89, 17, 2, gold[1]!);
        g.poly([189, 89, 204, 89, 206, 79, 191, 79], ink);
        g.poly([190, 88, 203, 88, 205, 80, 192, 80], hex('#cfc2a4'));
        for (let k = 0; k < 3; k++) g.hline(192 + k * 0.3, 202, 82 + k * 2, hex('#6e604c'));
        g.rect(192, FLOOR_Y + 1, 9, 1, gold[1]!);

        // A floor candelabra on the right.
        const fx = 272;
        g.rect(fx - 1, 66, 3, FLOOR_Y - 64, gold[2]!);
        g.rect(fx - 6, FLOOR_Y - 2, 13, 3, gold[1]!);
        arc(g, fx, 66, 9, 5, 0, Math.PI, gold[2]!);

        // Light: candles and the chandelier against a dark room; air you can see.
        haze(g, hex('#2a2016'), 0, FLOOR_Y, 0.25, 0.05, g.top, FLOOR_Y);
        gloom(g, g.left, 140, g.w, g.bottom - 140, 0.55);
        lightPool(g, 160, 132, 90, 20, hex('#ffb060'), 0.16);
        g.lighting(0.5);
        g.light(160, 86, 120, 0.4, 60);
        g.light(160, 10, 150, 0.3, 110);
        g.light(48, 64, 80, 0.75);
        g.light(272, 58, 70, 0.7);
        g.light(160, 44, 50, 0.25);
        g.light(160, 112, 110, 0.3, 40);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const rd = f.reduced;
        const tinkK = f.rare === 1 ? envelope(ev, 4.5, 0.4, 0.6) : 0;
        const freeze = tinkK > 0.5;
        const play = f.awake > 0.3 && !freeze ? 1 : 0;
        const beatT = t * 1.6;
        const eye = 0.35 + 0.65 * f.awake + (freeze ? 0.6 : 0);

        // Chandelier: a gilded ring of candles hanging into the top of frame.
        const chx = 160;
        g.vline(chx, g.top, 4, gold[1]!);
        arc(g, chx, 10, 30, 6, 0, Math.PI, gold[2]!, 2);
        arc(g, chx, 10, 30, 6, Math.PI, Math.PI * 2, gold[1]!);
        g.ellipse(chx, 14, 4, 3, gold[2]!);
        g.px(chx, 18, gold[3]!);
        for (let i = 0; i < 7; i++) {
          const a = (i / 6) * Math.PI;
          candle(g, Math.round(chx - Math.cos(a) * 28), Math.round(4 + Math.sin(a) * 5), t, i, rd, 0.5);
        }
        // Sconces, the harpsichord candelabra and the floor candelabra.
        candle(g, 122, 46, t, 11, rd);
        candle(g, 198, 46, t, 12, rd);
        for (const dx of [-7, 0, 7]) candle(g, 48 + dx, 66 - (dx === 0 ? 4 : 0), t, 20 + dx, rd, 1.2);
        for (const dx of [-9, 0, 9]) candle(g, 272 + dx, 60 - (dx === 0 ? 4 : 0), t, 30 + dx, rd, 1.2);

        // Toast leaps out of the portrait.
        if (f.rare === 0 && ev < 6) {
          for (let s = 0; s < 2; s++) {
            const p = clamp((ev - 0.3 - s * 0.25) / 2.6);
            if (p <= 0 || p >= 1) continue;
            const dir = s ? 1 : -1;
            const x = 160 + dir * (4 + p * 70);
            const y = 38 - Math.sin(p * Math.PI) * 30 + p * p * 70;
            const spin = Math.floor(p * 10) % 3;
            const hw = spin === 1 ? 2 : 5;
            g.rect(x - hw, y - 5, hw * 2 + 1, 10, hex('#5a2e10'));
            g.rect(x - hw + 1, y - 4, hw * 2 - 1, 8, hex('#c88a4a'));
            if (hw > 2) g.rect(x - hw + 2, y - 3, hw * 2 - 3, 5, hex('#e8b878'));
          }
          if (ev < 0.6) g.glow(160, 40, 10, hex('#ffe0a0'), 0.4 * (1 - ev / 0.6));
        }

        // ── harpsichordist (silver, left, facing the keys) ──
        const hb = play ? Math.round(Math.sin(beatT * Math.PI) * 0.6 + f.pulse * 0.7) : 0;
        const spring = f.rare === 2 ? envelope(ev, 5, 0.25, 1.2) : 0;
        const boing = spring > 0 ? spring * (14 + Math.sin(ev * 14) * 4 * (1 - ev / 5)) : 0;
        bot(g, 122, SEAT_Y + hb * 0, silver, -1, { eye, wigLift: boing, headDy: hb, seated: true, feetY: FLOOR_Y + 3 });
        if (boing > 2) {
          // the spring holding the wig on
          const hy = SEAT_Y - 24 + hb - 13;
          for (let y = hy - boing + 3; y < hy + 1; y += 2) g.hline(121, 124, Math.round(y), silver.metal[3]!);
        }
        const k1 = play ? Math.round(Math.sin(t * 7.3)) : 0;
        const k2 = play ? Math.round(Math.cos(t * 6.1)) : 0;
        thickLine(g, 118, SEAT_Y - 18 + hb, 110, 89 + k1, 3, silver.coat[2]!);
        thickLine(g, 124, SEAT_Y - 17 + hb, 116, 90 + k2, 3, silver.coat[1]!);
        hand(g, 109, 87 + k1, silver);
        hand(g, 115, 88 + k2, silver);

        // ── conductor (brass, centre, from behind, on the podium) ──
        const bowK = f.rare === 3 ? envelope(ev - 1.6, 3.2, 0.5, 0.8) : 0;
        const cx = 161;
        const cb = play && f.pulse > 0.5 ? -1 : 0;
        bot(g, cx, PODIUM_Y - 18 + cb, brass, 2, { eye: 1, headDy: Math.round(bowK * 7), seated: false, feetY: PODIUM_Y + 1 });
        // the baton is a spoon
        let ax = cx + 15;
        let ay = PODIUM_Y - 44;
        if (play) {
          const pat = beatT % 4;
          const seg = Math.floor(pat);
          const u = smoothstep(0, 1, pat - seg);
          const pts = [
            [cx + 10, PODIUM_Y - 52],
            [cx + 12, PODIUM_Y - 36],
            [cx + 2, PODIUM_Y - 42],
            [cx + 22, PODIUM_Y - 42],
            [cx + 10, PODIUM_Y - 52],
          ];
          const a = pts[seg]!;
          const b = pts[seg + 1]!;
          ax = a[0]! + (b[0]! - a[0]!) * u;
          ay = a[1]! + (b[1]! - a[1]!) * u;
        }
        if (tinkK > 0) {
          // He taps the spoon on his own head. Clank. Everyone stops and looks.
          const tap = ev > 0.5 && ev < 1.1 ? 1 : 0;
          ax = cx + 13 - tap * 2;
          ay = PODIUM_Y - 58 + tap * 3;
        }
        const shoulderY = PODIUM_Y - 18 + cb - 22 + Math.round(bowK * 7);
        thickLine(g, cx + 8, shoulderY, ax, ay, 3, brass.coat[2]!);
        hand(g, ax, ay - 1, brass);
        const sd = tinkK > 0 ? -1 : 1;
        g.line(ax, ay - 2, ax + sd * 5, ay - 7, silver.metal[4]!);
        g.ellipse(ax + sd * 6, ay - 9, 1, 2, silver.metal[4]!);
        g.pxAdd(ax + sd * 6, ay - 10, hex('#ffffff'), 0.6);
        const lx = play ? cx - 18 + Math.round(Math.sin(beatT * Math.PI * 0.5) * 2) : cx - 12;
        thickLine(g, cx - 8, shoulderY, lx, shoulderY + (play ? 6 : 14), 3, brass.coat[1]!);
        hand(g, lx, shoulderY + (play ? 6 : 14), brass);
        if (tinkK > 0 && ev > 0.6 && ev < 1.6) {
          const r = (ev - 0.6) * 22;
          g.ring(cx + 2, PODIUM_Y - 58, r, r * 0.6, mix(hex('#fff4d0'), ink, clamp((ev - 0.6) / 1)));
          g.glow(cx + 3, PODIUM_Y - 58, 8, hex('#fff4d0'), 0.6 * (1.6 - ev));
        }

        // ── cellist (copper, right, facing the conductor) ──
        const cbb = play ? Math.round(Math.sin(beatT * Math.PI + 1) * 0.6) : 0;
        bot(g, 226, SEAT_Y, copper, -1, { eye: freeze ? eye : eye * (blinking(t, 3) ? 0 : 1), headDy: cbb, seated: true, feetY: FLOOR_Y + 3, look: freeze ? -1 : 0 });
        // the cello between the knees
        const vx = 213;
        g.ellipse(vx, 112, 9, 8, ink);
        g.ellipse(vx, 98, 7, 7, ink);
        g.ellipse(vx, 112, 8, 7, hex('#5a2210'));
        g.ellipse(vx, 98, 6, 6, hex('#5a2210'));
        g.rect(vx - 8, 104, 17, 3, hex('#5a2210'));
        g.ellipse(vx + 3, 110, 3, 5, hex('#7a3618'));
        g.ellipse(vx + 2, 97, 2, 4, hex('#7a3618'));
        g.px(vx - 3, 104, ink);
        g.px(vx + 3, 104, ink);
        g.rect(vx - 1, 66, 2, 30, ink);
        g.rect(vx - 2, 63, 4, 5, hex('#2a140a'));
        g.vline(vx, 70, 116, hex('#c8b898'));
        g.vline(vx, 120, FLOOR_Y + 3, hex('#8a8a90'));
        // bow arm sawing, fingers on the neck
        const bow = play ? Math.sin(t * Math.PI * 0.8) * 10 : 3;
        thickLine(g, 222, SEAT_Y - 17 + cbb, vx + 6 + bow * 0.4, 106, 3, copper.coat[2]!);
        hand(g, vx + 6 + bow * 0.4, 104, copper);
        g.line(vx - 12 + bow, 107, vx + 16 + bow, 104, hex('#d8ccb0'));
        g.line(vx - 12 + bow, 108, vx + 16 + bow, 105, ink);
        const fy = 76 + (play ? Math.round(Math.sin(t * 2.7)) * 4 : 0);
        thickLine(g, 228, SEAT_Y - 19 + cbb, vx + 2, fy + 4, 3, copper.coat[1]!);
        hand(g, vx + 2, fy, copper);

        // A rose lands at the conductor's feet; he bows.
        if (f.rare === 3 && ev < 6) {
          const p = clamp(ev / 1.5);
          const rx = 330 - p * 152;
          const ry = 170 - Math.sin(p * Math.PI) * 70 - p * 36;
          const a = p < 1 ? ev * 9 : 0.4;
          const dx = Math.cos(a) * 4;
          const dy = Math.sin(a) * 4;
          g.line(rx - dx, ry - dy, rx + dx, ry + dy, hex('#3a6a34'));
          g.disc(rx - dx, ry - dy, 2, hex('#7a0e1c'));
          g.disc(rx - dx, ry - dy - 0.5, 1.2, hex('#c42a3a'));
        }

        // Dust in the candlelight.
        if (!rd) {
          motes(g, t, 20, 30, 110, 110, 14, hex('#ffd9a0'), 0.35, 1);
          motes(g, t, 220, 30, 310, 110, 12, hex('#ffd9a0'), 0.3, 2);
          motes(g, t, 110, 20, 210, 100, 10, hex('#ffe6c0'), 0.25, 3);
        }

        // Notes drift up while they play: faint, like breath in cold air.
        if (play) {
          for (let i = 0; i < 4; i++) {
            const p = (t * 0.2 + i * 0.25) % 1;
            const nx = (i % 2 ? 100 : 214) + Math.sin(p * 6 + i) * 4;
            const ny = 76 - p * 36;
            const a = Math.sin(p * Math.PI) * 0.45;
            g.rectA(nx, ny, 2, 2, gold[3]!, a);
            g.lineA(nx + 1, ny - 4, nx + 1, ny, gold[3]!, a);
          }
        }
        void shade;
      },
    };
  },
};

export default def;

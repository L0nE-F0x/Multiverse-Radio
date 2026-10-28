// The Long Dark: radio theatre performed live in Studio B. Two actors share one ribbon
// microphone in the beam of a spotlight, scripts in hand; at the left a foley table (a little
// door in a frame, a gravel tray, coconut shells) and a thunder sheet on its stand; at the right
// an organist in a pool of warm light before a rank of pipes. Above the control-room window,
// the ON AIR sign glows red.
// Rare events: the thunder sheet shivers and the cast look up; Mr. Wren appears in the
// control-room window as well, tips his hat, and isn't there; a page slips from the
// detective's script and see-saws to the floor; the organist leans into a swell.

import { type Color, hex, mix } from '../kit/color';
import { callLamp, onAirLamp, sectionDrive } from '../kit/broadcast';
import { rimLight } from '../kit/atmos';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3, noise1 } from '../kit/rng';
import type { SceneDef } from '../types';
import { motes, shaft, vignette } from './lib/night';

const FLOOR = 138; // where the back wall meets the floor
const MIC = { x: 165, y: 84 }; // the ribbon mic's centre
const SPOT = { x: 112, y: -14 }; // the spotlight on the lighting pipe
const INES = { x: 141, foot: 152 };
const WREN = { x: 191, foot: 152 };
const SIGN = { x: 165, y: 24 };
const BOOTH = { x: 128, y: 34, w: 74, h: 28 }; // the control-room window
const ORGAN = { x: 270, y: 98 }; // the console's top-left corner
const ORGANIST = { x: 254, seat: 128 };
const FOLEY = { x: 30, y: 116, w: 66 }; // the table top
const SHEET = { x: 4, y: 34, w: 18, h: 72 }; // the thunder sheet

const def: SceneDef = {
  id: 'radio-theatre',
  fps: 15,
  focusX: 165,
  focusY: 90,
  rareEvents: 4,
  rareDuration: 10,
  grade: { temperature: 0.05, contrast: 1.14, saturation: 0.8, bloom: 0.75, threshold: 0.62, vignette: 0.34, shadows: '#050407' },
  create({ accent }) {
    const ink = hex('#050407');
    const wood = [hex('#0d090a'), hex('#150f10'), hex('#1e1516'), hex('#2a1e1e'), hex('#3a2a28')];
    const cloth = [hex('#0e0c12'), hex('#15121b'), hex('#1b1722')];
    const cool = mix(accent, hex('#e4ecff'), 0.45);
    const warm = hex('#ffc27a');
    const red = hex('#ff3b2e');
    const redDim = hex('#3a0d0b');
    const brass = hex('#8a6a3a');
    const chrome = [hex('#16181e'), hex('#30343e'), hex('#5e6470'), hex('#b8bcc8')];
    const skin = hex('#b48a6c');
    const skinD = hex('#4a3228');
    const paper = hex('#c4bead');
    const paperD = hex('#6e695e');
    // The cast: Ines in a belted coat, Wren in a dark suit and a bowler.
    const coat = hex('#2c271f');
    const coatD = hex('#17140f');
    const suit = hex('#181920');
    const suitD = hex('#0c0c11');
    const hair = hex('#1a1210');
    const shirt = hex('#40404a');
    const legC = hex('#110f10');

    const castSet = new Set<Color>([coat, coatD, suit, suitD, hair, skin, skinD, legC, shirt]);
    const isCast = (c: Color) => castSet.has(c);
    const inBeam = (x: number, y: number) => {
      // distance from the spotlight's axis, normalised by the beam's half-width there
      const u = (y - SPOT.y) / (INES.foot - SPOT.y);
      const ax = SPOT.x + (MIC.x - SPOT.x) * u * 1.05;
      return clamp(1.2 - Math.abs(x - ax) / (6 + u * 46));
    };

    /** A standing actor in three-quarter profile: dir 1 faces right. `talk` nods the head. */
    const actor = (g: Gfx, x: number, foot: number, dir: 1 | -1, who: 0 | 1, talk: number, look: number, dropPage: number) => {
      const h = who === 0 ? 58 : 63;
      const top = foot - h;
      const body = who === 0 ? coat : suit;
      const bodyD = who === 0 ? coatD : suitD;
      const hy = top + Math.round(talk) - Math.round(look);
      const hx = x + dir * (talk > 0 ? 1 : 0);
      const waist = who === 0 ? top + 42 : top + 31;
      // legs, one a step forward
      g.poly([x - 4, waist, x, waist, x - 1 - dir, foot - 1, x - 4 - dir, foot - 1], legC);
      g.poly([x + 1, waist, x + 5, waist, x + 4 + dir * 2, foot - 1, x + 1 + dir * 2, foot - 1], legC);
      g.rect(x - 5 - dir + (dir > 0 ? 1 : -1), foot - 1, 5, 1, ink);
      g.rect(x + dir * 2 + (dir > 0 ? 1 : -1), foot - 1, 6, 1, ink);
      // torso: the coat flares to a hem; the suit is a straight jacket
      if (who === 0) g.poly([x - 6, top + 12, x + 6, top + 12, x + 9, waist, x - 9, waist], body);
      else g.poly([x - 7, top + 12, x + 7, top + 12, x + 6, waist + 1, x - 6, waist + 1], body);
      g.ellipse(x, top + 13, who === 0 ? 6 : 7, 2, body);
      // the shaded back half of the body
      const back = (k: number) => x - dir * k;
      g.poly([back(6), top + 12, back(1), top + 12, back(2), waist, back(who === 0 ? 9 : 6), waist], bodyD);
      if (who === 0) {
        g.hline(x - 7, x + 7, top + 27, hex('#3e3628')); // belt
        g.px(x + dir * 2, top + 27, brass);
        g.line(x + dir, top + 13, x + dir * 2, top + 26, coatD); // lapel
      } else {
        g.poly([x + dir, top + 12, x + dir * 4, top + 12, x + dir * 2, top + 20], shirt);
        g.vline(x + dir * 2, top + 13, top + 18, hex('#5a2626')); // tie
      }
      // neck and head (the face turned to the mic, the cheek in shadow)
      g.rect(x - 1, hy + 9, 3, 3, skinD);
      g.ellipse(hx, hy + 5, 4, 5, skinD);
      g.vline(hx + dir * 4, hy + 3, hy + 8, skin);
      g.px(hx + dir * 5, hy + 6, skin); // nose
      g.px(hx + dir * 4, hy + 9, skinD);
      if (who === 0) {
        // a dark bob with a side parting
        g.ellipse(hx - dir, hy + 3, 5, 4, hair);
        g.rect(hx - dir * 4 - 1, hy + 3, 4, 7, hair);
        g.px(hx + dir * 3, hy + 1, hair);
      } else {
        // a bowler: crown and brim
        g.ellipse(hx, hy + 1, 4, 3, suitD);
        g.hline(hx - 6, hx + 6, hy + 3, suitD);
        g.hline(hx - 5, hx + 5, hy + 2, suitD);
        g.hline(hx - 3, hx + 3, hy + 1, hex('#2a1616')); // band
      }
      // back arm hangs; front arm bends to hold the script up to the light
      g.line(back(5), top + 14, back(6), top + 33, bodyD);
      g.px(back(6), top + 34, skinD);
      const sx = x + dir * 8;
      const sy = top + 24;
      g.line(x + dir * 4, top + 14, x + dir * 4, top + 24, body);
      g.line(x + dir * 4, top + 24, sx, sy, body);
      // the script, tilted toward the mic
      if (dropPage < 1) {
        const px0 = dir > 0 ? sx : sx - 7;
        g.rect(px0, sy - 7, 8, 10, paperD);
        g.rect(px0 + (dir > 0 ? 1 : 0), sy - 7, 7, 9, paper);
        for (let i = 0; i < 4; i++) g.hline(px0 + 2, px0 + 3 + ((hash3(i, who) * 3) | 0), sy - 5 + i * 2, paperD);
      }
      g.px(sx, sy + 1, skin);
    };

    /** The ribbon mic on its stand: a chromed lozenge in a yoke, grille stripes. */
    const ribbonMic = (g: Gfx, x: number, y: number, glint: number) => {
      g.vline(x, y + 11, INES.foot - 1, chrome[1]!);
      g.vline(x + 1, y + 11, INES.foot - 1, chrome[0]!);
      g.ellipse(x, INES.foot - 1, 8, 1, chrome[0]!);
      g.hline(x - 6, x + 6, INES.foot - 2, chrome[1]!);
      // yoke
      g.vline(x - 6, y - 2, y + 8, chrome[1]!);
      g.vline(x + 6, y - 2, y + 8, chrome[1]!);
      g.hline(x - 6, x + 6, y + 8, chrome[1]!);
      g.rect(x - 1, y + 8, 3, 4, chrome[1]!);
      g.px(x - 6, y + 3, chrome[3]!);
      g.px(x + 6, y + 3, chrome[2]!);
      // body
      g.ellipse(x, y, 5, 9, chrome[0]!);
      g.ellipse(x, y, 4, 8, chrome[1]!);
      for (let k = -7; k <= 7; k += 2) g.hline(x - 3, x + 3, y + k, chrome[2]!);
      g.vline(x - 2, y - 6, y + 4, mix(chrome[3]!, cool, 0.3));
      g.px(x - 2, y - 5, mix(chrome[3]!, hex('#ffffff'), glint));
      g.hline(x - 4, x + 4, y, chrome[0]!); // the band round its middle
    };

    return {
      background(g) {
        // ── the back wall: wood pilasters and slatted acoustic bays ──
        g.vgrad([wood[0]!, wood[1]!, wood[2]!], g.top, FLOOR);
        for (let bay = Math.floor(g.left / 44) - 1; bay * 44 < g.right; bay++) {
          const x0 = bay * 44 + 10;
          for (let y = 14; y < FLOOR - 5; y++)
            for (let x = x0 + 5; x < x0 + 41; x++) {
              const slat = (x - x0) % 3 === 0;
              const n = fbm(x / 12, y / 30, 3, 2);
              g.px(x, y, slat ? cloth[0]! : n > 0.55 ? cloth[2]! : cloth[1]!);
            }
          g.rect(x0, g.top, 5, FLOOR - g.top, wood[2]!);
          g.vline(x0, g.top, FLOOR, wood[3]!);
          g.vline(x0 + 4, g.top, FLOOR, wood[1]!);
          g.hline(x0, x0 + 43, 13, wood[3]!);
          g.hline(x0, x0 + 43, FLOOR - 6, wood[3]!);
          g.rect(x0, FLOOR - 5, 44, 5, wood[1]!);
        }
        // the cornice, and above it (portrait) the dark ceiling with the lighting pipe
        g.rect(g.left, 7, g.w, 6, wood[1]!);
        g.hline(g.left, g.right, 7, wood[3]!);
        if (g.top < 0) {
          g.vgrad([hex('#030204'), hex('#070506'), wood[0]!], g.top, 7, g.top, 7);
          for (let y = -100; y < -22; y += 11) g.hline(g.left, g.right, y, hex('#0b090b'));
          g.rect(g.left, -22, g.w, 2, hex('#1a1a20'));
          g.hline(g.left, g.right, -22, hex('#2a2a32'));
          // spare lanterns on the pipe
          for (const x of [40, 210, 252, 296]) {
            g.vline(x, -20, -17, hex('#121216'));
            g.poly([x - 3, -17, x + 3, -17, x + 4, -10, x - 4, -10], hex('#0e0e12'));
          }
        }

        // ── the control-room window and the ON AIR sign ──
        const B = BOOTH;
        g.rect(B.x - 3, B.y - 3, B.w + 6, B.h + 6, wood[3]!);
        g.rect(B.x - 2, B.y - 2, B.w + 4, B.h + 4, ink);
        g.gradRect(B.x, B.y, B.w, B.h, [hex('#050c0b'), hex('#081210'), hex('#0c1714')]);
        g.rect(B.x, B.y + B.h - 7, B.w, 7, hex('#0a0d0c'));
        g.hline(B.x, B.x + B.w - 1, B.y + B.h - 7, hex('#1c2a26'));
        for (let i = 0; i < 2; i++) {
          g.rect(B.x + 8 + i * 13, B.y + B.h - 14, 10, 6, hex('#3a3018'));
          g.hline(B.x + 8 + i * 13, B.x + 17 + i * 13, B.y + B.h - 14, hex('#5a4a24'));
        }
        for (let i = 0; i < 9; i++) g.px(B.x + 40 + i * 3, B.y + B.h - 4, i % 3 === 0 ? hex('#4a2a18') : hex('#1a2a22'));
        g.vline(B.x + 25, B.y, B.y + B.h, ink);
        g.vline(B.x + 50, B.y, B.y + B.h, ink);
        g.line(B.x + 28, B.y + 1, B.x + 36, B.y + B.h - 9, mix(hex('#0c1714'), cool, 0.15));
        g.line(B.x + 31, B.y + 1, B.x + 37, B.y + 13, mix(hex('#0c1714'), cool, 0.1));
        // the sign's box (lit per frame)
        g.rect(SIGN.x - 17, SIGN.y - 6, 35, 13, hex('#120808'));
        g.rect(SIGN.x - 16, SIGN.y - 5, 33, 11, redDim);
        g.vline(SIGN.x - 10, 7, SIGN.y - 7, hex('#141016'));
        g.vline(SIGN.x + 10, 7, SIGN.y - 7, hex('#141016'));
        // a studio clock on the pilaster to the right
        g.disc(226, 32, 7, hex('#1a1612'));
        g.disc(226, 32, 6, hex('#8a8476'));
        for (let i = 0; i < 12; i++) g.px(226 + Math.cos((i / 12) * Math.PI * 2) * 5, 32 + Math.sin((i / 12) * Math.PI * 2) * 5, hex('#2a2620'));
        g.line(226, 32, 226, 28, hex('#141210'));
        g.line(226, 32, 229, 33, hex('#141210'));

        // ── the organ: pipes on the wall, the console in its own light ──
        for (let i = 0; i < 14; i++) {
          const px = 240 + i * 5;
          const len = 30 + Math.round(Math.abs(Math.sin(i * 0.5 + 0.3)) * 26 + (i % 3) * 3);
          const top = 92 - len;
          g.rect(px, top, 3, len, hex('#2a2218'));
          g.vline(px, top, top + len, hex('#4a3c26'));
          g.vline(px + 2, top, top + len, hex('#16120c'));
          g.tri(px, 92, px + 3, 92, px + 1.5, 96, hex('#1e1810'));
          g.hline(px, px + 2, top + len - 9, hex('#0a0806'));
          g.px(px + 1, top + len - 8, hex('#3a2e1e'));
        }
        g.rect(234, 92, 80, 4, wood[2]!);
        g.hline(234, 313, 92, wood[4]!);
        g.rect(236, 88, 76, 2, hex('#16120c'));
        // the console: a tall curved case with stop tabs, three manuals facing the organist
        const O = ORGAN;
        g.rect(O.x, O.y + 6, 36, FLOOR + 12 - O.y - 6, hex('#1e130c'));
        g.ellipse(O.x + 18, O.y + 6, 20, 9, hex('#2a1a10'));
        g.rect(O.x - 2, O.y + 6, 40, 3, hex('#2a1a10'));
        g.vline(O.x, O.y + 9, FLOOR + 10, hex('#3a2616'));
        for (let k = 0; k < 4; k++) g.rect(O.x + 6, O.y + 16 + k * 9, 24, 6, hex('#24170e'));
        for (let i = 0; i < 16; i++) {
          const a = Math.PI * (0.12 + (i / 15) * 0.76);
          const tx = O.x + 18 - Math.cos(a) * 17;
          const ty = O.y + 5 - Math.sin(a) * 6;
          g.px(tx, ty, [hex('#c8b890'), hex('#a8483a'), hex('#c8b890'), hex('#3a5a7a')][i % 4]!);
        }
        g.poly([O.x - 14, O.y + 30, O.x, O.y + 30, O.x, O.y + 12, O.x - 6, O.y + 12], hex('#170e08'));
        g.vline(O.x - 15, O.y + 26, O.y + 31, hex('#2a1a10'));
        for (let k = 0; k < 3; k++) {
          const ky = O.y + 13 + k * 6;
          const kx = O.x - 12 + k * 3;
          g.rect(kx - 1, ky + 2, 14, 2, hex('#1a100a'));
          g.rect(kx, ky, 12, 2, hex('#b8b0a0'));
          for (let j = 1; j < 12; j += 2) if (j % 7 !== 5) g.px(kx + j, ky, hex('#1a1410'));
        }
        // music rack
        g.rect(O.x - 4, O.y - 10, 18, 13, hex('#1a1008'));
        g.rect(O.x - 3, O.y - 9, 16, 10, hex('#6a6252'));
        for (let i = 0; i < 4; i++) g.hline(O.x - 1, O.x + 11, O.y - 7 + i * 2, hex('#3a342a'));
        // the lamp arm over the rack
        g.line(O.x + 13, O.y - 10, O.x + 9, O.y - 15, brass);
        g.rect(O.x + 1, O.y - 16, 10, 2, brass);
        // pedals and the bench
        for (let i = 0; i < 6; i++) g.rect(O.x - 14 + i * 4, FLOOR + 10, 3, 1, hex('#2a1e14'));
        g.rect(ORGANIST.x - 11, ORGANIST.seat, 22, 3, hex('#24160c'));
        g.hline(ORGANIST.x - 11, ORGANIST.x + 10, ORGANIST.seat, hex('#3a2616'));
        g.vline(ORGANIST.x - 10, ORGANIST.seat + 3, FLOOR + 12, hex('#140c06'));
        g.vline(ORGANIST.x + 9, ORGANIST.seat + 3, FLOOR + 12, hex('#140c06'));

        // ── the foley corner: thunder sheet on its gallows, the table and its props ──
        const S = SHEET;
        g.rect(S.x - 4, S.y - 6, S.w + 8, 2, hex('#1a1a1e'));
        g.vline(S.x - 4, S.y - 6, FLOOR + 8, hex('#1a1a1e'));
        g.vline(S.x + S.w + 3, S.y - 6, FLOOR + 8, hex('#1a1a1e'));
        g.vline(S.x + 3, S.y - 4, S.y, hex('#3a3a40'));
        g.vline(S.x + S.w - 4, S.y - 4, S.y, hex('#3a3a40'));
        const F = FOLEY;
        g.rect(F.x, F.y, F.w, 4, hex('#2a1c12'));
        g.hline(F.x, F.x + F.w - 1, F.y, hex('#4a3420'));
        g.rect(F.x + 2, F.y + 4, 3, FLOOR + 8 - F.y - 4, hex('#160e08'));
        g.rect(F.x + F.w - 5, F.y + 4, 3, FLOOR + 8 - F.y - 4, hex('#160e08'));
        g.rect(F.x + 2, F.y + 16, F.w - 4, 1, hex('#160e08'));
        // a little door in its frame, ajar
        g.rect(F.x + 3, F.y - 30, 18, 30, hex('#2e2014'));
        g.rect(F.x + 5, F.y - 28, 14, 28, hex('#0a0604'));
        g.poly([F.x + 5, F.y - 28, F.x + 14, F.y - 27, F.x + 14, F.y - 1, F.x + 5, F.y], hex('#3a2818'));
        g.vline(F.x + 5, F.y - 28, F.y, hex('#4a3420'));
        g.px(F.x + 12, F.y - 13, brass);
        // gravel tray, a pair of shoes for footsteps, a teacup for teacups
        g.rect(F.x + 24, F.y - 3, 22, 3, hex('#1a1410'));
        for (let i = 0; i < 30; i++) g.px(F.x + 25 + hash3(i, 1) * 20, F.y - 3 + hash3(i, 2) * 2, mix(hex('#4a4440'), hex('#8a8478'), hash3(i, 3)));
        g.rect(F.x + 49, F.y - 3, 6, 3, hex('#1a100a'));
        g.rect(F.x + 56, F.y - 3, 6, 3, hex('#1a100a'));
        g.hline(F.x + 49, F.x + 54, F.y - 3, hex('#3a2416'));
        g.hline(F.x + 56, F.x + 61, F.y - 3, hex('#3a2416'));
        // the low foley mic
        g.vline(F.x + 36, F.y + 4, FLOOR + 8, chrome[0]!);
        g.vline(F.x + 36, F.y - 12, F.y - 1, chrome[1]!);
        g.rect(F.x + 34, F.y - 17, 5, 6, chrome[1]!);
        g.hline(F.x + 34, F.x + 38, F.y - 17, chrome[2]!);

        // ── the floor: boards, a rug under the mic, cables ──
        g.vgrad([hex('#1c1416'), hex('#120d0e'), hex('#08060a')], FLOOR, Math.max(FLOOR + 50, g.bottom - 20), FLOOR);
        for (let y = FLOOR + 1, gap = 2; y < g.bottom; y += gap, gap = Math.min(gap + 1, 14)) {
          g.hline(g.left, g.right, y, hex('#0a0708'));
          const off = Math.floor(hash3(y, 3) * 60);
          for (let x = Math.floor(g.left / 60) * 60 - 60 + off; x < g.right; x += 60) g.vline(x, y, y + gap - 1, hex('#0a0708'));
        }
        g.ellipse(MIC.x, INES.foot, 66, 9, hex('#1e0e0e'));
        g.ellipse(MIC.x, INES.foot, 62, 8, hex('#2a1414'));
        g.ellipse(MIC.x, INES.foot, 52, 6, hex('#231010'));
        for (let a = 0; a < 90; a++) {
          const ang = (a / 90) * Math.PI * 2;
          g.px(MIC.x + Math.cos(ang) * 57, INES.foot + Math.sin(ang) * 7, hex('#3a2018'));
        }
        for (const [x0, x1, y0, y1, s] of [
          [MIC.x + 1, 330, INES.foot - 1, FLOOR + 30, 1],
          [FOLEY.x + 36, MIC.x - 50, FLOOR + 8, FLOOR + 34, 2],
          [MIC.x - 30, MIC.x + 60, FLOOR + 40, FLOOR + 90, 3],
        ] as const) {
          for (let i = 0; i <= 90; i++) {
            const u = i / 90;
            g.px(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(u * 7 + s) * 3, hex('#050405'));
          }
        }

        // the spotlight: a lantern on a yoke, clamped to the pipe, aimed down at the mic
        {
          const dx = MIC.x - SPOT.x;
          const dy = INES.foot - SPOT.y;
          const l = Math.hypot(dx, dy);
          const ux = dx / l;
          const uy = dy / l;
          const box = (a: number, b: number, w: number, c: Color) => {
            const nx = -uy * w;
            const ny = ux * w;
            const x0 = SPOT.x + ux * a;
            const y0 = SPOT.y + uy * a;
            const x1 = SPOT.x + ux * b;
            const y1 = SPOT.y + uy * b;
            g.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], c);
          };
          g.vline(SPOT.x, -21, SPOT.y - 3, hex('#18181c'));
          g.rect(SPOT.x - 2, -22, 5, 3, hex('#202024'));
          box(-9, 3, 5, hex('#16171c'));
          box(-9, 3, 3, hex('#2a2c34'));
          box(-9, 3, 1, hex('#3e414a'));
          box(3, 5, 6, hex('#0e0f12')); // barn doors
          box(-11, -9, 3, hex('#101014'));
          g.line(SPOT.x - 6, SPOT.y - 3, SPOT.x + 6, SPOT.y - 6, hex('#2a2c32')); // yoke
        }

        // ── the studio audience's chairs, empty tonight, in the foreground ──
        for (let x = Math.floor(g.left / 26) * 26 + 4; x < g.right; x += 26) {
          const y = 166 + (Math.floor(x / 26) % 2);
          const c = hex('#060506');
          g.rect(x, y + 2, 12, 9, c);
          g.hline(x + 1, x + 10, y + 1, c);
          g.hline(x + 2, x + 9, y, c);
          g.rect(x + 1, y + 11, 2, 26, c);
          g.rect(x + 9, y + 11, 2, 26, c);
          g.rect(x - 1, y + 14, 14, 2, c);
          const spill = clamp(1 - Math.abs(x + 6 - MIC.x) / 120);
          g.hline(x + 2, x + 9, y, mix(hex('#141218'), cool, 0.12 + 0.2 * spill));
          g.px(x + 1, y + 1, mix(hex('#100e14'), cool, 0.1 + 0.12 * spill));
          g.px(x + 10, y + 1, mix(hex('#100e14'), cool, 0.06 * spill));
        }

        // ── light ──
        g.lighting(0.4);
        g.light(MIC.x - 4, 104, 66, 0.8, 60);
        g.light(ORGAN.x, ORGAN.y + 2, 44, 0.75, 44);
        g.light(56, 104, 50, 0.35, 40);
        g.light(SIGN.x, SIGN.y, 40, 0.3, 22);
        g.light(BOOTH.x + 37, BOOTH.y + 14, 44, 0.12, 20);
        g.light(MIC.x, 176, 110, 0.22, 26);
        g.light(SPOT.x, SPOT.y - 4, 26, 0.35, 18);
        g.glow(ORGAN.x + 6, ORGAN.y - 10, 42, warm, 0.12, 6);
        g.ellipseA(ORGAN.x - 4, FLOOR + 12, 36, 4, warm, 0.07);
        g.ellipseA(MIC.x - 2, INES.foot, 46, 6, cool, 0.08);
        // the spotlight's spill on the back wall behind the pair
        g.glow(MIC.x + 6, 104, 64, cool, 0.07, 6);
        vignette(g, 0.5, 165, 86, 240, 190);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const live = 0.55 + 0.45 * f.awake;
        const still = f.reduced ? 0 : 1;

        // ON AIR: steady, with the faint hum of an old tube, brightening with speech
        const sp = f.speech ?? 0;
        const isVoice = f.segmentKind === 'voice' || sp > 0.05;
        const drive = sectionDrive(f);
        const hum = f.reduced ? 1 : 0.94 + 0.06 * noise1(t * 3, 4);
        const on = live * hum * (isVoice ? clamp(0.85 + sp * 0.35) : 0.55);
        g.rect(SIGN.x - 16, SIGN.y - 5, 33, 11, mix(redDim, hex('#b02218'), on));
        g.textCenter('ON AIR', SIGN.x + 1, SIGN.y - 2, mix(hex('#5a1a14'), hex('#ffe4d4'), clamp(on * 1.1)));
        g.glow(SIGN.x, SIGN.y, 32 + sp * 14, red, (0.18 + sp * 0.32) * on, 5);
        onAirLamp(g, BOOTH.x + 34, BOOTH.y + BOOTH.h - 6, f);
        callLamp(g, BOOTH.x + 44, BOOTH.y + BOOTH.h - 6, f);

        // the control room: meters move with the programme; the engineer nods along
        const B = BOOTH;
        for (let i = 0; i < 2; i++) {
          const v = clamp(Math.max(f.energy * drive, sp * 1.2) * (0.8 + i * 0.3) + noise1(t * 4, i) * 0.2) * live;
          const cx = B.x + 13 + i * 13;
          const cy = B.y + B.h - 8;
          g.line(cx, cy, cx - 3 + v * 6, cy - 5, hex('#1a1408'));
          g.glow(cx, cy - 3, 7, hex('#e8a040'), 0.12 * live, 3);
        }
        const wrenInBooth = R(1) && ev > 1.5 && ev < 8.5;
        {
          const ex = B.x + 60;
          const ey = B.y + 8 + (f.reduced ? 0 : Math.round(Math.sin(t * 1.7) * 0.5 + 0.5));
          const sil = hex('#020403');
          if (!wrenInBooth) {
            g.ellipse(ex, ey + 4, 3, 4, sil);
            g.rect(ex - 6, ey + 9, 13, 11, sil);
            g.hline(ex - 3, ex + 3, ey - 1, hex('#1a2622'));
            g.rect(ex - 4, ey + 3, 2, 3, hex('#1a2622'));
          } else {
            // a bowler, a polite stillness
            const tip = ev > 4 && ev < 5.6 ? -2 : 0;
            const wx = ex - 22;
            g.ellipse(wx, ey + 4, 3, 4, sil);
            g.rect(wx - 6, ey + 9, 13, 11, sil);
            g.ellipse(wx, ey + 1 + tip, 4, 2, sil);
            g.hline(wx - 5, wx + 5, ey + 2 + tip, sil);
            g.hline(wx - 3, wx + 3, ey + tip, mix(sil, cool, 0.35));
          }
        }

        // the spotlight: a slanting beam through the studio's haze onto the pair at the mic
        const thunder = R(0) ? envelope(ev, 6, 0.4, 3) : 0;
        const lampK = live * (1 - thunder * 0.2);
        shaft(g, SPOT.x + 2, SPOT.y + 4, MIC.x + 2, INES.foot + 2, 5, 84, cool, 0.15 * lampK, 0.4, 6);
        motes(g, t, MIC.x - 70, 0, 120, INES.foot, 26, cool, 0.45 * lampK, 7, 0.4, inBeam);
        g.glow(SPOT.x + 2, SPOT.y + 3, 10, cool, 0.5 * lampK, 4);

        // the thunder sheet: dull steel, shivering when struck
        {
          const S = SHEET;
          const amp = R(0) ? envelope(ev, 6, 0.2, 4) * still : 0;
          for (let y = 0; y < S.h; y++) {
            const wob = Math.round(Math.sin(y * 0.35 + t * 22) * amp * 1.5 * (y / S.h));
            const v = 0.32 + 0.22 * Math.sin(y * 0.09 + 1) + (amp > 0 ? 0.2 * amp * Math.sin(y * 0.6 - t * 30) : 0);
            const c = mix(hex('#16181c'), hex('#5a606a'), clamp(v));
            g.hline(S.x + wob, S.x + S.w - 1 + wob, S.y + y, c);
          }
          g.vline(S.x + S.w - 1, S.y, S.y + S.h - 1, hex('#0e0f12'));
          g.vline(S.x, S.y, S.y + S.h - 1, hex('#6a707a'));
        }

        // the foley artist behind the table, coconut shells ready
        {
          const fx = FOLEY.x + 52;
          const fy = FOLEY.y - 34;
          const clop = f.reduced ? 0 : Math.max(0, Math.sin(t * 5.2)) * (Math.sin(t * 0.21) > 0.55 ? 1 : 0);
          const body = hex('#221c16');
          const bodyD = hex('#120e0b');
          g.poly([fx - 8, fy + 34, fx - 7, fy + 12, fx + 7, fy + 12, fx + 8, fy + 34], body);
          g.poly([fx - 8, fy + 34, fx - 7, fy + 12, fx - 2, fy + 12, fx - 3, fy + 34], bodyD);
          g.rect(fx - 1, fy + 9, 3, 3, skinD);
          g.ellipse(fx, fy + 5, 4, 5, skinD);
          g.vline(fx + 4, fy + 3, fy + 7, skin);
          g.ellipse(fx - 1, fy + 1, 4, 2, hex('#26221e'));
          g.hline(fx - 5, fx + 3, fy + 2, hex('#26221e')); // a flat cap
          const hy = fy + 22 - Math.round(clop * 3);
          g.line(fx - 6, fy + 14, fx - 8, hy, body);
          g.line(fx + 6, fy + 14, fx + 8, hy, body);
          g.disc(fx - 8, hy + 1, 2, hex('#3a2414'));
          g.disc(fx + 8, hy + 1, 2, hex('#3a2414'));
          g.px(fx - 9, hy, hex('#7a5a3a'));
          g.px(fx + 7, hy, hex('#7a5a3a'));
        }

        // the actors: they trade lines; the speaker nods into the mic
        const turn = Math.floor(t / 4.5) % 2;
        const activeTalk = sp > 0.06 || f.energy > 0.15;
        const nod = (who: number) => (turn === who && activeTalk && !f.reduced ? (Math.sin(t * (isVoice ? 9 : 7) + who) > 0.2 ? 1 : 0) : 0);
        const look = R(0) ? smoothstep(0.5, 1.2, ev) * (1 - smoothstep(4, 5, ev)) : 0;
        const drop = R(2) ? smoothstep(1, 1.2, ev) : 0;
        actor(g, INES.x, INES.foot, 1, 0, nod(0), look, drop);
        actor(g, WREN.x, WREN.foot, -1, 1, nod(1), look, 0);
        // the spotlight comes from the upper left: rim the cast on that side and along the top
        rimLight(g, INES.x - 12, INES.foot - 58, 24, 30, isCast, cool, 0.22 * lampK, true);
        rimLight(g, WREN.x - 12, WREN.foot - 63, 24, 26, isCast, cool, 0.14 * lampK, true);
        for (const [x, foot, h] of [
          [INES.x, INES.foot, 58],
          [WREN.x, WREN.foot, 63],
        ] as const) {
          for (let xx = x - 8; xx <= x + 8; xx++)
            for (let yy = foot - h - 3; yy < foot - h + 18; yy++) {
              if (isCast(g.get(xx, yy))) {
                g.pxAdd(xx, yy, cool, 0.3 * lampK);
                break;
              }
            }
        }
        ribbonMic(g, MIC.x, MIC.y, clamp(0.4 + 0.3 * Math.sin(t * 0.7) + sp * 0.45));
        if (isVoice) g.glow(MIC.x, MIC.y, 8 + sp * 8, cool, 0.15 + sp * 0.3, 3);

        // a page see-saws down from the detective's script
        if (R(2) && ev > 1) {
          const p = clamp((ev - 1) / 5.5);
          const px = INES.x + 11 + Math.sin(p * 9) * 6 * (1 - p * 0.3) * (f.reduced ? 0.3 : 1);
          const py = INES.foot - 38 + p * 36;
          const flat = Math.abs(Math.cos(p * 9));
          g.rect(px - 3, py, 7, Math.max(1, Math.round(1 + (1 - flat) * 4)), paper);
          if (p >= 1) g.rect(px - 3, INES.foot - 2, 7, 1, paper);
        }

        // the organist, swaying, hands on the manuals
        {
          const swell = (R(3) ? envelope(ev, 10, 2, 3) : 0) + Math.max(0, drive - 1) * 0.8;
          const sway = f.reduced ? 0 : Math.sin(t * 1.3) * (0.6 + f.energy * drive) + swell * 2;
          const x = ORGANIST.x + Math.round(sway * 0.6);
          const y = ORGANIST.seat;
          const body = hex('#1c1712');
          const bodyD = hex('#100c09');
          const lit = mix(body, warm, 0.5);
          const lean = Math.round(swell * 2);
          // seated, three-quarter from behind, facing the console on the right
          g.poly([x - 8, y, x + 6, y, x + 6 + lean, y - 18, x - 5 + lean, y - 19], body);
          g.poly([x - 8, y, x - 2, y, x - 1 + lean, y - 19, x - 5 + lean, y - 19], bodyD);
          g.rect(x - 9, y - 1, 17, 2, bodyD);
          g.line(x - 6, y + 1, x - 7, FLOOR + 10, bodyD); // legs to the pedals
          g.line(x + 5, y + 1, x + 9, FLOOR + 10, bodyD);
          g.vline(x + 6 + lean, y - 17, y - 1, lit);
          const hx = x + 1 + lean;
          g.rect(hx - 1, y - 22, 3, 3, hex('#2a201a'));
          g.ellipse(hx, y - 25, 4, 4, hex('#34302c')); // grey hair, lamp-lit at the edge
          g.ellipse(hx - 1, y - 26, 3, 2, hex('#423d37'));
          g.px(hx + 2, y - 28, hex('#8a7a62'));
          g.vline(hx + 4, y - 26, y - 22, mix(skin, warm, 0.45));
          g.px(hx + 5, y - 24, mix(skin, warm, 0.45));
          // arms reaching to the keys, fingers walking
          const hand = (k: number) => (f.reduced ? 0 : Math.round(Math.sin(t * (3 + k) + k * 2) * 1.2 * (0.4 + f.energy)));
          g.line(x + 4 + lean, y - 15, ORGAN.x - 9 + hand(0), ORGAN.y + 13, body);
          g.line(x + 3 + lean, y - 11, ORGAN.x - 7 + hand(1), ORGAN.y + 19, body);
          g.px(ORGAN.x - 9 + hand(0), ORGAN.y + 12, mix(skin, warm, 0.4));
          g.px(ORGAN.x - 7 + hand(1), ORGAN.y + 18, mix(skin, warm, 0.4));
          // the lamp on the music rack
          const lk = live * (0.92 + 0.08 * noise1(t * 2, 9)) * (1 + swell * 0.35);
          g.hline(ORGAN.x + 2, ORGAN.x + 10, ORGAN.y - 14, mix(warm, hex('#fff4e0'), 0.5));
          g.glow(ORGAN.x + 6, ORGAN.y - 12, 16 + swell * 8, warm, 0.3 * lk, 5);
          g.rectAdd(ORGAN.x - 3, ORGAN.y - 9, 16, 10, warm, 0.05 * lk);
          if (swell > 0) g.rectAdd(238, 32, 72, 60, warm, 0.05 * swell);
        }
      },
    };
  },
};

export default def;

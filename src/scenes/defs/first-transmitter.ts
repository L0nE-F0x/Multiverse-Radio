// Transmission Zero: a cave at the dawn of time. A crude transmitter (a cairn of stones and a
// lightning-struck tree, wired with sinew) sparks softly at the cave mouth under a young, enormous
// moon. A figure in furs leans into a horn and taps it. The wall paintings already show waves.
// Rare events: a three-tap "hello?" that rings out into the sky; lightning finds the tree (and
// the announcer's hair); the first listener looks in; a distant fire answers.

import { hex, mix } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3, noise1 } from '../kit/rng';
import { arc } from '../kit/shapes';
import { sprite } from '../kit/sprite';
import type { SceneDef } from '../types';
import { type Haze, drawHaze, makeHaze, vignette } from './deep-kit';

const GROUND = 118; // the plain outside
const MOON = { x: 266, y: 58, r: 22 };
const TREE = { x: 234, base: 110 };
const HORN = { x: 170, y: 97 };
const FIRE = { x: 104, y: 124 };
const FIG = { x: 142, y: 120 }; // knee position

/** Inside of the cave mouth: an irregular arch. Returns the arch's top y at column x, or null. */
function mouthTop(x: number): number | null {
  if (x < 132 || x > 314) return null;
  const u = (x - 132) / 182;
  return 24 + (1 - Math.sin(u * Math.PI)) * 70 + Math.sin(x * 0.21) * 2 + Math.sin(x * 0.07) * 4 - (u > 0.5 ? 0 : 0);
}

const def: SceneDef = {
  id: 'first-transmitter',
  fps: 15,
  focusX: 170,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 11,
  create({ accent }) {
    const ink = hex('#050302');
    const rockR = [hex('#070504'), hex('#0e0a07'), hex('#17110c'), hex('#221911'), hex('#2f2318'), hex('#3e2f21')];
    const ochre = hex('#9a5a26');
    const redOchre = hex('#7a2c1a');
    const chalk = hex('#b8a888');
    const fireC = hex('#ff9a3a');
    const fireHot = hex('#ffe2a0');
    const spark = mix(hex('#bfe0ff'), accent, 0.2);
    const sky = [hex('#04050c'), hex('#090c18'), hex('#121626'), hex('#221e2c'), hex('#3a2228')];
    const moonC = [hex('#4a4438'), hex('#7a7260'), hex('#a8a088'), hex('#cec6aa'), hex('#e6dec4')];
    const fur = [hex('#1a120c'), hex('#2e2014'), hex('#4a3420'), hex('#6a4c2e')];
    const skin = hex('#7a4e34');
    const char = hex('#0c0907');
    const horn = [hex('#1e160e'), hex('#4a3a26'), hex('#6e5a3c'), hex('#9a8460')];

    const smoke: Haze = makeHaze(256, 50, 9, 28, 12, 0.45, 2.0);
    const mist: Haze = makeHaze(256, 16, 13, 40, 6, 0.4, 2.2);

    const flickerAt = (t: number) => 0.78 + 0.14 * noise1(t * 6, 3) + 0.08 * noise1(t * 17, 5);

    // The announcer, hand-drawn: a hunched figure in furs, lit from behind by the fire (L) and
    // touched by moonlight on the face side (H).
    const pal = {
      o: ink,
      h: hex('#140d08'),
      H: hex('#3a3846'),
      L: mix(fur[2]!, fireC, 0.45),
      F: fur[1]!,
      f: fur[0]!,
      s: skin,
      S: hex('#4a2e20'),
      e: hex('#000000'),
      b: hex('#2a1e14'),
    };
    const HEAD = sprite(
      `
      ....hhhhh...
      ..hhhhhhhh..
      .LhhhhhhhhH.
      LhhhhhhhhhhH
      LhhhhhhhhssH
      hhhhhhhhsesS
      LhhhhhhhssSss
      Lhhhhhhhssss.
      hhhhhhhhbbS..
      LhhhhhhhbbS..
      hhhhhhhbbb...
      .hhhhhhbb....
      `,
      pal,
    );
    const BODY = sprite(
      `
      ....LFFffhhh......
      ...LFFfffffhh.....
      ...LFffffffffff...
      ..LFFfffffffffff..
      ..LFffffffffffffF.
      ..LFfffffffffffff.
      .LFFffffffffffff..
      .LFfffffffffffff..
      .LFfffffffffffff..
      .LFffffffffffff...
      LFFfffffffffffff..
      LFffffffffffffff..
      LFfffffffffffffff.
      LFffffffffffffffff
      LFFfffffffffffffff
      LLFFFfffffffffffff

      `,
      pal,
    );
    const STAND = sprite(
      `
      ...LFFffffff..
      ..LFFfffffffF.
      ..LFfffffffff.
      ..LFfffffffff.
      ..LFffffffff..
      .LFFffffffff..
      .LFfffffffff..
      .LFfffffffff..
      .LFffffffffff.
      LFFffffffffff.
      LFfffffffffff.
      LFffffffffffff
      LFFfffffffffff
      ....ff...ff...
      ....ff...ff...
      ....SS...SS...
      `,
      pal,
    );

    /** The figure in furs, kneeling, leaning toward the horn. */
    const figure = (g: Gfx, lean: number, tapArm: number, hair: number, doze: number, light: number) => {
      const bx = FIG.x - 10;
      const by = FIG.y - 16;
      const lx = Math.round(lean * 2 - doze * 2);
      const ly = Math.round(doze * 3 - lean * 0.5);
      g.blit(BODY, bx, by);
      // the arm, out to the horn, and the tapping hand
      const ax = bx + 13;
      const ay = by + 4;
      const handX = HORN.x - 7 + Math.round(tapArm * 2);
      const handY = HORN.y - 2 - Math.round(tapArm * 4);
      g.line(ax, ay, handX, handY + 1, fur[0]!);
      g.line(ax, ay + 1, handX, handY + 2, fur[0]!);
      g.line(ax, ay - 1, handX - 1, handY, mix(fur[2]!, fireC, 0.25 * light));
      g.rect(handX, handY, 2, 2, skin);
      // head
      const hx = bx + 7 + lx;
      const hy = by - 10 + ly;
      g.blit(HEAD, hx, hy);
      // hair stands on end after the lightning
      if (hair > 0) {
        const n = Math.round(hair * 4);
        for (let i = 0; i < 6; i++) g.line(hx + 2 + i * 1.5, hy + 1, hx + 1 + i * 1.8 - 2, hy - n - (i % 2), pal.h);
        g.px(hx + 4, hy - n - 1, pal.L);
      }
      g.px(hx + 1, hy + 2, mix(pal.L, fireC, 0.3 * light));
    };

    return {
      background(g) {
        // ── outside: sky, moon, the young world ──
        g.vgrad(sky, g.top, GROUND);
        for (let y = g.top; y < GROUND - 8; y++)
          for (let x = g.left; x < g.right; x++)
            if (hash3(x, y, 51) < 0.012) g.pxA(x, y, hex('#d8dcf0'), (0.2 + 0.7 * hash3(x, y, 52)) * clamp((GROUND - 20 - y) / 40));
        // the young moon: close, enormous, cratered
        g.glow(MOON.x, MOON.y, MOON.r * 3.2, hex('#8a8070'), 0.22, 6);
        g.ball(MOON.x, MOON.y, MOON.r, MOON.r, moonC, -0.55, -0.45, 0.08);
        for (let i = 0; i < 14; i++) {
          const a = hash3(i, 7) * 6.28;
          const r = Math.sqrt(hash3(i, 8)) * (MOON.r - 4);
          const cx = MOON.x + Math.cos(a) * r;
          const cy = MOON.y + Math.sin(a) * r;
          const cr = 1 + hash3(i, 9) * 3;
          g.ellipseA(cx, cy, cr, cr, hex('#3a3428'), 0.35);
          g.pxA(cx - cr * 0.5, cy - cr * 0.5, hex('#e6dec4'), 0.3);
        }
        // a far volcano, glowing, its plume leaning in the wind
        g.poly([20, GROUND - 4, 62, 78, 72, 78, 120, GROUND - 4], hex('#120c10'));
        g.glow(67, 78, 26, hex('#c03a1a'), 0.4, 5);
        g.rect(63, 77, 9, 2, hex('#e0602a'));
        for (let i = 0; i < 40; i++) {
          const p = i / 40;
          g.ellipseA(67 + p * 50 + Math.sin(p * 9) * 3, 74 - p * 34, 3 + p * 8, 2 + p * 4, hex('#2a1e22'), 0.35 * (1 - p));
        }
        // rolling hills and giant ferns in silhouette
        for (let x = g.left; x < g.right; x++) {
          const h1 = GROUND - 12 - fbm(x / 40, 1, 3, 3) * 18;
          g.rect(x, h1, 1, GROUND - h1 + 1, hex('#0c0a10'));
          const h2 = GROUND - 4 - fbm(x / 22, 2, 5, 3) * 8;
          g.rect(x, h2, 1, GROUND - h2 + 1, hex('#08070a'));
        }
        for (let i = 0; i < 9; i++) {
          const fx = 140 + i * 22 + hash3(i, 3) * 10;
          const fy = GROUND - 2;
          const h = 12 + hash3(i, 4) * 18;
          g.vline(fx, fy - h, fy, hex('#08070a'));
          for (let k = 0; k < 5; k++) {
            const yy = fy - h + k * 2;
            g.line(fx, yy, fx - 6 - k, yy + 4 + k, hex('#08070a'));
            g.line(fx, yy, fx + 6 + k, yy + 4 + k, hex('#08070a'));
          }
        }
        g.rect(g.left, GROUND, g.w, g.bottom - GROUND, hex('#0a0806'));
        // mist on the plain
        for (let y = GROUND - 10; y < GROUND + 2; y++) g.rectA(g.left, y, g.w, 1, hex('#2a2430'), 0.18 * (1 - Math.abs(y - GROUND + 4) / 8));

        // ── the cave: everything outside the mouth is rock ──
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const top = mouthTop(x);
            const inside = top !== null && y >= top && y < 200;
            const floor = y >= 126 + Math.sin(x * 0.05) * 3;
            if (inside && !floor) continue;
            // rock lit by the fire (left) and faintly by the moon at the arch rim
            const n = fbm(x / 14, y / 9, 8, 4);
            const dF = Math.hypot(x - FIRE.x, (y - FIRE.y) * 1.2);
            let v = n * 0.55 + clamp(1 - dF / 150) * 0.55 - 0.15;
            if (floor) v = 0.2 + n * 0.3 + clamp(1 - dF / 120) * 0.45;
            if (top !== null && !floor && y < top) v += clamp(1 - (top - y) / 6) * 0.25; // rim
            const k = Math.floor(clamp(v) * 5 + (hash3(x, y, 2) - 0.5) * 0.5 + 0.25);
            g.px(x, y, rockR[Math.max(0, Math.min(5, k))]!);
          }
        // moonlit rim along the arch
        for (let x = 132; x <= 314; x++) {
          const top = mouthTop(x);
          if (top !== null && top > g.top) g.pxA(x, Math.round(top) - 1, hex('#5a5468'), 0.6);
        }
        // stalactites at the arch
        for (let i = 0; i < 12; i++) {
          const x = 150 + i * 14 + hash3(i, 31) * 8;
          const top = mouthTop(x);
          if (top === null) continue;
          const len = 3 + hash3(i, 32) * 9;
          for (let k = 0; k < len; k++) g.hline(x - (len - k) * 0.2, x + (len - k) * 0.2, top + k, rockR[1]!);
        }

        // ── the paintings: ochre on the lit wall ──
        // handprints
        const hand = (x: number, y: number, c: number) => {
          g.ellipseA(x, y, 3, 4, c, 0.55);
          for (let f = 0; f < 4; f++) g.rectA(x - 3 + f * 2, y - 8 + Math.abs(f - 1.5), 1, 4, c, 0.55);
          g.rectA(x + 4, y - 2, 2, 1, c, 0.55);
        };
        hand(30, 60, redOchre);
        hand(42, 54, ochre);
        hand(22, 92, redOchre);
        // the announcer, painted, with waves
        const px = 72;
        const py = 70;
        g.rectA(px, py - 6, 2, 9, ochre, 0.7);
        g.ellipseA(px + 1, py - 9, 2, 2, ochre, 0.7);
        g.lineA(px, py + 3, px - 3, py + 10, ochre, 0.7);
        g.lineA(px + 1, py + 3, px + 4, py + 10, ochre, 0.7);
        g.lineA(px + 1, py - 4, px + 6, py - 6, ochre, 0.7);
        g.tri(px + 6, py - 7, px + 10, py - 10, px + 10, py - 3, ochre, 1, 0.7);
        for (let r = 0; r < 4; r++) arc(g, px + 10, py - 6, 5 + r * 4, 5 + r * 4, -0.9, 0.9, mix(rockR[3]!, ochre, 0.7 - r * 0.12));
        // a beast, listening; dots that might be stars; a moon
        g.ellipseA(44, 108, 9, 5, redOchre, 0.5);
        g.rectA(37, 112, 2, 5, redOchre, 0.5);
        g.rectA(49, 112, 2, 5, redOchre, 0.5);
        g.lineA(35, 106, 31, 114, redOchre, 0.5);
        g.ellipseA(36, 104, 3, 3, redOchre, 0.5);
        for (let i = 0; i < 7; i++) g.pxA(18 + i * 9, 36 + (i % 3) * 3, chalk, 0.5);
        arc(g, 100, 44, 6, 6, -1.6, 1.6, mix(rockR[3]!, chalk, 0.5));

        for (let i = 0; i < 5; i++) {
          const bx = 84 + i * 11;
          const by = 6 + (i % 2) * 3;
          g.ellipseA(bx, by, 4, 2, redOchre, 0.45);
          g.rectA(bx - 3, by + 2, 1, 3, redOchre, 0.45);
          g.rectA(bx + 2, by + 2, 1, 3, redOchre, 0.45);
          g.rectA(bx + 4, by - 3, 1, 2, redOchre, 0.45); // ears, all turned the same way
        }
        g.tri(142, 4, 150, 0, 150, 9, ochre, 1, 0.5);
        for (let r = 0; r < 3; r++) arc(g, 150, 4, 4 + r * 3, 4 + r * 3, -1, 1, mix(rockR[2]!, ochre, 0.5));
        hand(78, -20, ochre);
        hand(124, -30, redOchre);

        // ── the cave floor: stones, a bone or two ──
        for (let i = 0; i < 18; i++) {
          const x = 20 + hash3(i, 41) * 280;
          const y = 130 + hash3(i, 42) * 60;
          g.ellipse(x, y, 2 + hash3(i, 43) * 3, 1 + hash3(i, 44) * 2, rockR[hash3(i, 45) < 0.5 ? 1 : 3]!);
        }
        g.line(60, 150, 74, 146, hex('#6a6050'));
        g.disc(60, 150, 1, hex('#6a6050'));
        g.disc(74, 146, 1, hex('#6a6050'));
        // the fire pit ring
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI;
          g.ellipse(FIRE.x + Math.cos(a) * 11, FIRE.y + 3 + Math.sin(a) * 2, 3, 2, rockR[4]!);
        }

        // ── the transmitter: a cairn, a lightning-struck tree, sinew wire ──
        const sx0 = TREE.x - 205;
        const stones: [number, number, number, number][] = [
          [194 + sx0, 122, 9, 5],
          [216 + sx0, 123, 10, 5],
          [205 + sx0, 118, 9, 5],
          [198 + sx0, 113, 6, 4],
          [213 + sx0, 113, 6, 4],
          [205 + sx0, 108, 5, 3],
        ];
        for (const [x, y, rx, ry] of stones) {
          g.ellipse(x, y, rx + 1, ry + 1, ink);
          g.ball(x, y, rx, ry, [rockR[1]!, rockR[3]!, rockR[4]!, hex('#4a4050'), hex('#6a6070')], 0.6, -0.6, 0.1);
        }
        // the tree: charred trunk, a split crown, bare branches against the moon
        const tx = TREE.x;
        const crown = 50;
        for (let y = crown; y < TREE.base; y++) {
          const w = 1.5 + (y - crown) / 22;
          g.rect(tx - w, y, w * 2 + 1, 1, char);
          g.px(tx + w, y, mix(char, hex('#4a4a5a'), 0.5)); // moonlit edge
        }
        const branch = (x0: number, y0: number, x1: number, y1: number, w: number) => {
          for (let i = 0; i < w; i++) g.line(x0 + i, y0, x1 + i * 0.5, y1, char);
        };
        branch(tx - 1, 60, tx - 20, 44, 2);
        branch(tx - 12, 52, tx - 16, 38, 1);
        branch(tx - 18, 46, tx - 28, 46, 1);
        branch(tx + 1, 56, tx + 22, 40, 2);
        branch(tx + 12, 48, tx + 22, 34, 1);
        branch(tx + 18, 43, tx + 32, 44, 1);
        branch(tx, crown, tx + 3, 34, 1);
        branch(tx - 1, crown + 2, tx - 7, 36, 1);
        // the lightning scar down the trunk
        for (let y = crown + 4; y < 104; y++) g.px(tx + Math.round(Math.sin(y * 0.5) * 1), y, hex('#2a1408'));
        // sinew from the cairn to the horn, sagging
        for (let x = HORN.x + 8; x <= TREE.x - 12; x++) {
          const u = (x - HORN.x - 8) / (TREE.x - 12 - HORN.x - 8);
          g.px(x, Math.round(HORN.y + 2 + u * 10 + Math.sin(u * Math.PI) * 6), hex('#5a4630'));
        }
        // the horn on its forked stick
        g.line(HORN.x + 3, HORN.y + 3, HORN.x + 1, 126, hex('#3a2a1a'));
        g.line(HORN.x + 3, HORN.y + 3, HORN.x + 6, HORN.y, hex('#3a2a1a'));
        g.line(HORN.x + 3, HORN.y + 3, HORN.x, HORN.y, hex('#3a2a1a'));
        for (let i = 0; i < 16; i++) {
          const u = i / 15;
          const x = HORN.x - 5 + u * 16;
          const y = HORN.y - 1 + Math.sin(u * 2.8) * 4 - u * 3;
          const r = 4.2 - u * 3.4;
          g.ellipse(x, y, Math.max(0.6, r * 0.6), Math.max(0.6, r), horn[Math.min(3, Math.floor(u * 2.2) + (i % 4 === 0 ? 0 : 1))]!);
        }
        g.ellipse(HORN.x - 5, HORN.y - 1, 1.5, 4, horn[0]!);
        g.vline(HORN.x - 4, HORN.y - 4, HORN.y + 1, horn[2]!);

        vignette(g, 0.5, 170, 90);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 11;
        const awake = f.awake;
        const fl = f.reduced ? 0.85 : flickerAt(t);
        const fireK = (0.45 + 0.55 * awake) * fl;

        // lightning (rare 1): the sky flashes, a bolt finds the tree
        let flash = 0;
        if (R(1)) {
          if (ev > 2 && ev < 2.15) flash = 1;
          else if (ev > 2.3 && ev < 2.4) flash = 0.6;
          else if (ev > 2.15 && ev < 3) flash = 0.25 * (1 - (ev - 2.15) / 0.85);
          if (f.reduced) flash *= 0.3;
        }
        if (flash > 0) {
          for (let x = 132; x <= 314; x++) {
            const top = mouthTop(x);
            if (top !== null) g.rectA(x, top, 1, GROUND - top, hex('#8a9ac8'), flash * 0.4);
          }
          g.glow(220, 100, 120, hex('#6a7ab0'), flash * 0.25, 4);
          if (ev > 2 && ev < 2.4) {
            const top = mouthTop(TREE.x + 6) ?? 26;
            const pts = [TREE.x + 8, top, TREE.x + 2, top + 3, TREE.x + 7, top + 5, TREE.x + 3, 34];
            for (let k = 0; k + 3 < pts.length; k += 2) {
              g.line(pts[k]!, pts[k + 1]!, pts[k + 2]!, pts[k + 3]!, hex('#f4f8ff'));
              g.line(pts[k]! + 1, pts[k + 1]!, pts[k + 2]! + 1, pts[k + 3]!, hex('#c8d8ff'));
            }
            g.glow(TREE.x + 4, 34, 16, hex('#c8d8ff'), 0.8);
          }
        }

        // the moon's slow shimmer in the mist; drifting mist on the plain
        drawHaze(g, mist, GROUND - 12, t * 2, hex('#3a3444'), 0.35);

        // the distant reply (rare 3): a fire on a far hill, flickering in a rhythm
        if (R(3)) {
          const a = envelope(ev, 11, 1, 2);
          const pat = [1, 0, 1, 0, 1, 1, 0, 0];
          const on = pat[Math.floor(ev * 3) % pat.length]! * (f.reduced ? 0.5 : 1);
          g.px(296, GROUND - 13, mix(hex('#3a1a0a'), hex('#ffb060'), a * (0.3 + 0.7 * on)));
          g.glow(296, GROUND - 13, 5, hex('#ff9a40'), a * (0.1 + 0.4 * on));
        }

        // the first listener (rare 2): a great woolly head at the cave mouth, backlit by the moon
        if (R(2)) {
          const inn = envelope(ev, 11, 2.5, 2.5);
          const mx = 336 - Math.round(inn * 52);
          const my = 80;
          const wool = hex('#1a120e');
          const rim = hex('#4a4656');
          const shape = (dx: number, dy: number, c: number) => {
            g.ellipse(mx + 22 + dx, my + 6 + dy, 22, 26, c); // shoulder hump
            g.ellipse(mx + 2 + dx, my - 4 + dy, 13, 14, c); // head
            g.ellipse(mx + 4 + dx, my - 16 + dy, 8, 7, c); // the dome
            for (let i = 0; i < 22; i++) {
              const u = i / 21;
              const tx = mx - 8 - Math.sin(u * 2.2) * 6 + (u > 0.85 ? (u - 0.85) * -20 : 0);
              g.disc(tx + dx, my + 2 + u * 28 + dy, 4.2 - u * 2.6, c);
            }
          };
          shape(-1, -1, rim);
          shape(0, 0, wool);
          // fur texture, an ear that flaps now and then, a firelit eye
          for (let i = 0; i < 30; i++) g.px(mx - 6 + hash3(i, 1) * 40, my - 14 + hash3(i, 2) * 40, hex('#241a14'));
          const flap = Math.sin(ev * 2.6) > 0.8 ? 2 : 0;
          g.ellipse(mx + 10 + flap, my - 3, 4, 7, hex('#1e1612'));
          g.px(mx - 5, my - 6, hex('#000000'));
          g.px(mx - 6, my - 7, mix(hex('#000000'), fireC, 0.7));
          // tusks, long and curving
          for (let i = 0; i < 24; i++) {
            const u = i / 23;
            const ang = 1.2 + u * 2.4;
            const x = mx - 8 + Math.cos(ang) * 16 - 4;
            const y = my + 8 + Math.sin(ang) * 9;
            g.rect(x, y, u < 0.7 ? 2 : 1, 1, u < 0.2 ? hex('#7a7060') : hex('#c4b89a'));
          }
        }

        // ── the fire ──
        const fx = FIRE.x;
        const fy = FIRE.y;
        g.glow(fx, fy - 8, 90, fireC, 0.14 * fireK, 5);
        g.glow(fx, fy - 4, 22, fireC, 0.35 * fireK, 4);
        const flame = (cx: number, w: number, h: number, ph: number) => {
          for (let k = 0; k < h; k++) {
            const u = k / h;
            const sway = f.reduced ? 0 : Math.sin(t * 3.1 + ph + u * 4) * u * 2.2;
            const hw = w * Math.pow(1 - u, 0.75) * (0.85 + 0.15 * Math.sin(t * 9 + ph + k));
            if (hw < 0.3) continue;
            const x0 = cx + sway - hw;
            g.rect(x0, fy - k, hw * 2 + 1, 1, u > 0.75 ? hex('#a83a14') : fireC);
            if (u < 0.6 && hw > 1.2) g.rect(cx + sway - hw * 0.45, fy - k, hw * 0.9 + 1, 1, fireHot);
          }
        };
        const fh = (0.5 + 0.5 * awake) * fl;
        flame(fx - 3, 3, 11 * fh, 0);
        flame(fx + 3, 2.5, 9 * fh, 2);
        flame(fx, 4, 16 * fh, 4);
        g.rect(fx - 8, fy, 17, 2, hex('#2a140a'));
        g.hline(fx - 6, fx + 6, fy, hex('#ff6a20'));
        // embers rising into the smoke
        if (!f.reduced)
          for (let i = 0; i < 8; i++) {
            const p = (t * 0.25 + hash3(i, 6)) % 1;
            g.pxA(fx + Math.sin(t + i * 2) * 6 * p + (hash3(i, 7) - 0.5) * 8, fy - 8 - p * 50, hex('#ffb060'), (1 - p) * 0.8 * awake);
          }

        // ── the transmitter: soft sparks between the branches and the cairn ──
        const tapPeriod = 3.4;
        const tp = (t % tapPeriod) / tapPeriod;
        // three taps at the start of each cycle (or a busier "hello?" in rare 0)
        const taps = R(0) ? [0.5, 0.9, 1.3] : [0.05, 0.13];
        let tapArm = 0;
        let tapNow = 0;
        const tt = R(0) ? ev : tp * tapPeriod;
        for (const s of taps) {
          const d = tt - s;
          if (d > -0.12 && d < 0.12) tapArm = Math.max(tapArm, 1 - Math.abs(d) / 0.12);
          if (d >= 0 && d < 0.25) tapNow = Math.max(tapNow, 1 - d / 0.25);
        }
        tapArm *= awake;
        tapNow *= awake;
        const surge = R(1) && ev > 2 ? clamp(1 - (ev - 2) / 6) : 0;
        const crackle = clamp(0.15 + f.energy * 0.6 + tapNow * 0.8 + surge) * (0.4 + 0.6 * awake);
        const tips: [number, number][] = [
          [TREE.x - 20, 44],
          [TREE.x + 22, 40],
          [TREE.x + 3, 34],
          [TREE.x - 16, 38],
          [TREE.x + 22, 34],
          [TREE.x - 7, 36],
        ];
        const seed = Math.floor(t * 12);
        for (let i = 0; i < tips.length; i++) {
          const [x, y] = tips[i]!;
          const on = hash3(i, seed, 5) < crackle;
          if (!on) continue;
          // a little jagged arc off the tip
          let ax = x;
          let ay = y;
          const n = 2 + Math.floor(hash3(i, seed, 6) * 3);
          for (let k = 0; k < n; k++) {
            const nx = ax + (hash3(i, seed, k) - 0.5) * 6;
            const ny = ay - 1 - hash3(k, seed, i) * 3;
            g.line(ax, ay, nx, ny, spark);
            ax = nx;
            ay = ny;
          }
          g.glow(x, y, 6, spark, (f.reduced ? 0.15 : 0.35) * crackle);
        }
        // a spark between the two top stones when tapped
        if (tapNow > 0.3 || hash3(seed, 9) < crackle * 0.4) {
          const cx = TREE.x - 2;
          g.line(cx - 3, 110, cx, 106, spark);
          g.line(cx, 106, cx + 4, 108, spark);
          g.glow(cx, 108, 8, spark, 0.3 * Math.max(tapNow, 0.4));
        }
        // the scar smoulders, more after lightning
        for (let y = 54; y < 104; y += 3) {
          const k = (0.2 + surge * 0.8) * (0.5 + 0.5 * Math.sin(t * 2 + y));
          g.pxA(TREE.x + Math.round(Math.sin(y * 0.5)), y, hex('#ff7a2a'), k);
        }

        // ── the announcer ──
        const doze = (1 - awake) * (R(3) ? 0 : 1);
        const lean = (R(2) && ev > 2 && ev < 9 ? 0 : clamp(f.energy * 1.4)) * awake;
        const hair = R(1) ? clamp((ev - 2) * 3) * (1 - smoothstep(7, 10, ev)) : 0;
        const stand = R(3) ? envelope(ev, 11, 2, 2) : 0;
        if (stand > 0.5) {
          // standing up, waving at the distant fire
          const sx = FIG.x - 6;
          const sy = FIG.y - 10;
          g.blit(STAND, sx, sy);
          g.blit(HEAD, sx + 3, sy - 11);
          const wave = Math.round(Math.sin(t * 8) * 2);
          g.line(sx + 11, sy + 2, sx + 17 + wave, sy - 10, fur[0]!);
          g.line(sx + 10, sy + 2, sx + 16 + wave, sy - 10, pal.L);
          g.rect(sx + 16 + wave, sy - 12, 2, 2, skin);
        } else {
          figure(g, lean, tapArm, hair, doze, fireK);
        }

        // rings off the horn (rare 0): the "hello?" goes out, along the wire, into the sky
        if (R(0) && ev > 1.6) {
          for (let r = 0; r < 4; r++) {
            const p = (ev - 1.6 - r * 0.6) / 4;
            if (p < 0 || p > 1) continue;
            const rad = 4 + p * 120;
            const a = (1 - p) * 0.55;
            for (let k = 0; k < 40; k++) {
              const ang = -1.2 + (k / 39) * 1.6;
              g.pxA(HORN.x + 8 + Math.cos(ang) * rad, HORN.y - 10 + Math.sin(ang) * rad * 0.8, hex('#d8b070'), a);
            }
          }
        }

        // smoke from the fire drifts up and out under the roof
        drawHaze(g, smoke, 30, t * 3, hex('#2a2018'), 0.3 * (0.5 + 0.5 * awake), g.left, 150);
      },
    };
  },
};

export default def;

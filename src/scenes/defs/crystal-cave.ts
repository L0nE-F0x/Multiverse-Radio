// Crystal Radio Δ: a crystalline cavern. Shards pulse with the music and throw prismatic
// beams across the walls. A tiny miner sits on a rock sipping tea, unbothered.

import { type Color, hex, hsv, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, rampAt, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

interface Crystal {
  x: number;
  y: number;
  w: number;
  h: number; // negative = hangs from the ceiling
  lean: number;
  hue: number;
  phase: number;
}

const FLOOR_Y = 146;
const MINER = { x: 160, y: 140 };
const PRISM = { x: 182, y: 22 };

const def: SceneDef = {
  id: 'crystal-cave',
  fps: 18,
  rareEvents: 3,
  rareDuration: 6,
  create({ accent, rng }) {
    const ink = hex('#0c0614');
    const rock = ramp([hex('#0e0818'), hex('#1c1230'), hex('#2c1e46'), hex('#3e2c5c')], 5);
    const hues: Color[][] = [
      ramp([hex('#2a1a5a'), shade(accent, 0.7), accent, mix(accent, hex('#ffffff'), 0.6)], 4),
      ramp([hex('#0a3050'), hex('#2a8ab8'), hex('#6ad8ff'), hex('#d8f8ff')], 4),
      ramp([hex('#4a1040'), hex('#b04a98'), hex('#ff8ad0'), hex('#ffe0f4')], 4),
    ];
    const glows = [accent, hex('#6ad8ff'), hex('#ff8ad0')];
    const warm = hex('#ffc070');

    const crystals: Crystal[] = [];
    const add = (x: number, y: number, w: number, h: number, lean: number, hue: number) =>
      crystals.push({ x, y, w, h, lean, hue, phase: rng.range(0, 6) });
    // left cluster
    add(70, FLOOR_Y + 2, 16, 74, -10, 0);
    add(54, FLOOR_Y + 4, 12, 50, -18, 2);
    add(88, FLOOR_Y + 4, 11, 46, 8, 1);
    add(40, FLOOR_Y + 6, 10, 30, -14, 0);
    add(102, FLOOR_Y + 4, 7, 22, 10, 2);
    // right cluster
    add(246, FLOOR_Y + 2, 18, 80, 12, 1);
    add(228, FLOOR_Y + 4, 11, 44, -10, 0);
    add(266, FLOOR_Y + 4, 12, 52, 20, 2);
    add(214, FLOOR_Y + 6, 8, 24, -8, 1);
    add(284, FLOOR_Y + 6, 9, 30, 16, 0);
    // ceiling
    add(96, -2, 12, -36, 4, 1);
    add(116, -4, 9, -22, -2, 0);
    add(214, -2, 12, -40, -4, 2);
    add(236, -4, 9, -24, 4, 0);
    add(150, -4, 7, -16, 0, 2);
    add(PRISM.x, -6, 10, -28, 0, 0);
    // small floor shards
    add(126, FLOOR_Y + 8, 5, 12, -4, 1);
    add(196, FLOOR_Y + 9, 6, 14, 6, 0);
    add(140, FLOOR_Y + 12, 4, 8, 3, 2);

    const drawCrystal = (g: Gfx, c: Crystal) => {
      const r = hues[c.hue]!;
      const up = c.h > 0 ? 1 : -1;
      const h = Math.abs(c.h);
      const bx = c.x;
      const by = c.y;
      const tipx = bx + c.lean;
      const tipy = by - up * h;
      const shx = c.lean * 0.78;
      const shy = by - up * h * 0.78;
      const l = bx - c.w / 2;
      const rr = bx + c.w / 2;
      g.poly([l - 1, by, rr + 1, by, rr + 1 + shx, shy, tipx, tipy - up, l - 1 + shx, shy], ink);
      const mx = bx + c.w * 0.12;
      g.poly([l, by, mx, by, tipx, tipy, l + shx, shy], r[1]!);
      g.poly([mx, by, rr, by, rr + shx, shy, tipx, tipy], r[2]!);
      g.line(mx, by, tipx, tipy, r[3]!);
      g.line(l + shx, shy, tipx, tipy, r[2]!);
      // inner sparkle facet
      g.tri(mx + 1, by - up * h * 0.2, rr - 1, by - up * h * 0.25, mx + c.lean * 0.5, by - up * h * 0.6, mix(r[2]!, r[3]!, 0.4), 1, 0.6);
    };

    return {
      background(g) {
        // Rock: textured walls, darker towards the edges of the cave mouth.
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 18, y / 14, 5, 4);
            const dx = (x - 160) / 190;
            const dy = (y - 80) / 120;
            const open = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
            const strata = Math.sin(y * 0.4 + n * 6) * 0.08;
            g.px(x, y, rampAt(rock, n * 0.6 + open * 0.55 + strata - 0.1, x, y));
          }
        // Floor: flatter, a little lighter, with a reflective puddle.
        for (let y = FLOOR_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 10, y / 4, 9, 3);
            g.px(x, y, rampAt(rock, 0.35 + n * 0.45 - (y - FLOOR_Y) / 260, x, y));
          }
        g.ellipse(124, FLOOR_Y + 22, 30, 5, hex('#1a1636'));
        g.ellipse(124, FLOOR_Y + 22, 28, 4, hex('#241e4a'));
        g.hline(108, 118, FLOOR_Y + 21, hex('#5a4a8a'));
        g.hline(126, 140, FLOOR_Y + 23, hex('#4a3a7a'));
        // Crystals.
        for (const c of crystals) drawCrystal(g, c);
        // The miner's rock, pickaxe and lantern stand.
        g.ellipse(MINER.x, MINER.y + 7, 16, 8, ink);
        g.ball(MINER.x, MINER.y + 6, 15, 7, rock.slice(1), -0.5, -0.8, 0.3);
        g.line(MINER.x - 20, MINER.y + 12, MINER.x - 12, MINER.y - 6, hex('#7a5034'));
        g.line(MINER.x - 19, MINER.y + 12, MINER.x - 11, MINER.y - 6, hex('#5a3a24'));
        arc(g, MINER.x - 11, MINER.y - 4, 7, 3, Math.PI * 1.05, Math.PI * 1.95, hex('#a0a8b8'), 2);
        // a small kettle on the ground (where the tea comes from)
        const kx = MINER.x + 27;
        const ky = FLOOR_Y + 1;
        g.ellipse(kx, ky, 6, 5, ink);
        g.ball(kx, ky, 5, 4, [hex('#2a3a4a'), hex('#4a6a7a'), hex('#8ab0c0')], -0.5, -0.7);
        g.line(kx - 5, ky - 1, kx - 9, ky - 5, hex('#4a6a7a'));
        g.line(kx - 5, ky, kx - 9, ky - 4, ink);
        arc(g, kx, ky - 4, 4, 4, Math.PI * 1.1, Math.PI * 1.9, ink);
        g.px(kx, ky - 5, hex('#8ab0c0'));
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // Prismatic beams: white light enters, the prism crystal splits it into a slow fan.
        const sweep = Math.sin(t * 0.12) * 0.35;
        const k0 = 0.07 + f.energy * 0.06;
        g.tri(PRISM.x - 60, g.top, PRISM.x - 52, g.top, PRISM.x, PRISM.y, hex('#fff8e8'), 2, 0.12);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * 0.5 + sweep + (i - 3) * 0.12 + 0.55;
          const len = 230;
          const ex = PRISM.x + Math.cos(a) * len;
          const ey = PRISM.y + Math.sin(a) * len;
          const nx = -Math.sin(a) * 6;
          const ny = Math.cos(a) * 6;
          g.tri(PRISM.x, PRISM.y, ex - nx, ey - ny, ex + nx, ey + ny, hsv(i / 7, 0.8, 1), 2, k0);
        }

        // Crystals pulse with the music, each on its own phase.
        for (let i = 0; i < crystals.length; i++) {
          const c = crystals[i]!;
          const h = Math.abs(c.h);
          const cx = c.x + c.lean * 0.4;
          const cy = c.y - Math.sign(c.h) * h * 0.4;
          const p = 0.1 + 0.08 * Math.sin(t * 0.9 + c.phase) + f.energy * 0.22 + f.pulse * 0.12 * ((i + f.beat) % 3 === 0 ? 1 : 0);
          g.glow(cx, cy, 6 + h * 0.35, glows[c.hue]!, p, 4);
        }
        // Glints travelling up the big shards.
        for (const i of [0, 5, 7]) {
          const c = crystals[i]!;
          const p = (t * 0.25 + c.phase) % 1.6;
          if (p > 1) continue;
          g.pxAdd(c.x + c.lean * p + 1, c.y - c.h * p, hex('#ffffff'), Math.sin(p * Math.PI));
        }

        // Chime: one crystal rings and throws sparkles.
        if (f.rare === 0 && ev < 4) {
          const c = crystals[5]!;
          const cx = c.x + c.lean * 0.5;
          const cy = c.y - c.h * 0.5;
          if (!f.reduced) g.glow(cx, cy, 30, glows[c.hue]!, envelope(ev, 3, 0.1, 2) * 0.6);
          for (let i = 0; i < 18; i++) {
            const a = hash3(i, 1) * Math.PI * 2;
            const r = ev * (14 + hash3(i, 2) * 20);
            g.pxAdd(cx + Math.cos(a) * r, cy + Math.sin(a) * r + ev * ev * 3, hex('#ffffff'), clamp(1 - ev / 3));
          }
          for (let i = 0; i < 3; i++) {
            const r = (ev - i * 0.3) * 30;
            if (r > 0 && r < 70) g.ring(cx, cy, r, r * 0.7, mix(glows[c.hue]!, ink, r / 70));
          }
        }

        // A little gem-shelled critter peeks from behind the right cluster.
        if (f.rare === 1 && ev < 6) {
          const k = envelope(ev, 6, 1, 1);
          const cx = 232 - k * 10;
          const cy = FLOOR_Y - 3;
          g.ellipse(cx, cy, 6, 4, ink);
          g.ball(cx, cy, 5, 3, hues[2]!, -0.5, -0.7);
          g.tri(cx - 4, cy - 3, cx, cy - 3, cx - 2, cy - 8, hues[1]![2]!);
          g.tri(cx, cy - 3, cx + 4, cy - 3, cx + 2, cy - 7, hues[1]![3]!);
          const shut = ev > 3 && ev < 3.2;
          g.px(cx - 3, cy, shut ? ink : hex('#ffffff'));
          g.px(cx - 1, cy, shut ? ink : hex('#ffffff'));
          g.px(cx - 6, cy + 2, ink);
        }

        // ── the miner ──
        const mx = MINER.x;
        const my = MINER.y - 2;
        const sipCycle = (t % 7) / 7;
        const sipping = f.awake > 0.3 && sipCycle > 0.55 && sipCycle < 0.8;
        const dozing = f.awake < 0.3;
        // legs dangling off the rock
        g.rect(mx - 4, my + 4, 3, 6, hex('#3a4a6a'));
        g.rect(mx + 2, my + 4, 3, 6 + (Math.sin(t * 1.5) > 0.6 ? 1 : 0), hex('#3a4a6a'));
        g.rect(mx - 5, my + 10, 4, 2, hex('#2a1a14'));
        g.rect(mx + 2, my + 10 + (Math.sin(t * 1.5) > 0.6 ? 1 : 0), 4, 2, hex('#2a1a14'));
        // body (overalls)
        roundRect(g, mx - 6, my - 6, 13, 12, 3, ink);
        roundRect(g, mx - 5, my - 5, 11, 10, 3, hex('#c8603a'));
        g.rect(mx - 3, my - 2, 7, 7, hex('#3a5a8a'));
        // head, beard, helmet with lamp
        const hy = my - 11 + (dozing ? 2 : 0);
        g.disc(mx, hy, 5, ink);
        g.disc(mx, hy, 4, hex('#f0c8a0'));
        g.ellipse(mx, hy + 3, 4, 2, hex('#e8e0d8'));
        g.rect(mx - 6, hy - 3, 13, 2, ink);
        g.ellipse(mx, hy - 4, 5, 3, hex('#f4c83a'));
        g.rect(mx - 6, hy - 3, 13, 1, hex('#c89a2a'));
        g.disc(mx + 3, hy - 5, 1, hex('#fff8d0'));
        // eyes
        if (dozing || blinking(t, 9)) {
          g.px(mx - 2, hy, ink);
          g.px(mx + 2, hy, ink);
        } else {
          g.px(mx - 2, hy - 1, ink);
          g.px(mx + 2, hy - 1, ink);
          g.px(mx - 2, hy, ink);
          g.px(mx + 2, hy, ink);
        }
        // the arm with the cup
        const cupx = sipping ? mx + 2 : mx + 8;
        const cupy = sipping ? hy + 3 : my;
        g.line(mx + 4, my - 3, cupx, cupy + 1, hex('#c8603a'));
        g.rect(cupx - 2, cupy - 2, 4, 4, hex('#f4ecdc'));
        g.rect(cupx - 2, cupy - 2, 4, 1, hex('#8a5a3a'));
        g.px(cupx + 2, cupy - 1, hex('#f4ecdc'));
        if (!sipping) steam(g, t, cupx, cupy - 3, hex('#e8e0f0'), { n: 4, height: 10, spread: 2, alpha: 0.5 });
        if (dozing) {
          const zp = (t * 0.3) % 1;
          g.text('z', mx + 6 + zp * 6, hy - 10 - zp * 10, mix(hex('#d8d0ff'), rock[2]!, zp));
        }
        // the lantern: warm light, a flicker, and a tap when it sputters
        const sputter = f.rare === 2 && ev < 5;
        const off = sputter && ev > 0.5 && ev < 2.2 && Math.floor(ev * 9) % 3 !== 0;
        const lx = mx - 24;
        const ly = FLOOR_Y - 2;
        g.rect(lx - 3, ly - 8, 7, 9, ink);
        g.rect(lx - 2, ly - 7, 5, 7, off ? hex('#3a2a1a') : hex('#ffd88a'));
        g.rect(lx - 3, ly - 10, 7, 2, hex('#6a5a4a'));
        arc(g, lx, ly - 10, 3, 3, Math.PI, Math.PI * 2, hex('#6a5a4a'));
        if (!off) g.glow(lx, ly - 4, 34, warm, 0.32 + Math.sin(t * 11) * 0.02, 5);
        if (sputter && ev > 1.8 && ev < 2.6) g.line(mx - 5, my - 3, lx + 4, ly - 6, hex('#c8603a'));
      },
    };
  },
};

export default def;

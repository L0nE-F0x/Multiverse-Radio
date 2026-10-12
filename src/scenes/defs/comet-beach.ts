// Comet Marimba: a tiny sandy beach riding the glowing tail of a comet through space.
// A palm, a hammock, and a crab in sunglasses at a DJ booth. Stars streak past.

import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, rampAt } from '../kit/fx';
import { hash3 } from '../kit/rng';
import { arc, dome, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const HEAD = { x: 300, y: 54 };
const SAND_Y = 128;
const ISLE = { l: 96, r: 240 };

// The tail's centre line: from the comet head sweeping down-left.
const tailY = (x: number) => HEAD.y + (HEAD.x - x) * 0.32 + ((HEAD.x - x) / 200) ** 2 * 18;

const def: SceneDef = {
  id: 'comet-beach',
  fps: 20,
  rareEvents: 3,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#0a0814');
    const spaceC = [hex('#05061a'), hex('#0e0c2e'), hex('#1e1440')];
    const sand = ramp([hex('#8a5a3a'), hex('#c89058'), hex('#f0c27a'), hex('#ffe4a8')], 5);
    const ice = ramp([hex('#1a2a5a'), hex('#3a6aa8'), hex('#8ac4f0'), hex('#e0f4ff')], 4);
    const leaf = ramp([hex('#1a4a2a'), hex('#2e8a3a'), hex('#6ac84a')], 3);
    const crab = ramp([hex('#6a1a14'), hex('#c83a2a'), hex('#ff6a4a'), hex('#ffa88a')], 4);
    const warm = accent;

    return {
      background(g) {
        g.vgrad(spaceC, g.top, g.bottom);
        for (let i = 0; i < 90; i++) {
          const x = g.left + hash3(i, 1) * g.w;
          const y = g.top + hash3(i, 2) * g.h;
          g.pxAdd(x, y, hex('#c8d0ff'), 0.3 + hash3(i, 3) * 0.5);
        }
        // The friendly sun, a small distance away.
        g.glow(52, 30, 40, hex('#ffcf6a'), 0.35, 5);
        g.ball(52, 30, 11, 11, ramp([hex('#ff9a3a'), hex('#ffcf5a'), hex('#fff4b0')], 4), -0.4, -0.5, 0.5);
        g.px(48, 28, ink);
        g.px(56, 28, ink);
        arc(g, 52, 32, 3, 2, 0.3, Math.PI - 0.3, ink);

        // Comet tail: layered glow along the curve, warmer and fainter with distance.
        for (let x = HEAD.x; x > g.left - 20; x -= 2) {
          const d = (HEAD.x - x) / 340;
          const y = tailY(x);
          const w = 8 + d * 46;
          const c = mix(hex('#bff4ff'), warm, Math.min(1, d * 1.6));
          g.glow(x, y, w, c, 0.07 * (1 - d * 0.7), 6);
        }
        g.glow(HEAD.x, HEAD.y, 46, hex('#bff4ff'), 0.5, 6);
        g.glow(HEAD.x, HEAD.y, 14, hex('#ffffff'), 0.9);
        g.ball(HEAD.x, HEAD.y, 6, 6, ice, -0.6, -0.4, 0.5);

        // The island: icy underside, sandy top, a little lagoon.
        for (let x = ISLE.l; x <= ISLE.r; x++) {
          const u = (x - ISLE.l) / (ISLE.r - ISLE.l);
          const top = SAND_Y - Math.round(Math.sin(u * Math.PI) * 6 + (hash3(x >> 3, 2) - 0.5) * 2);
          const depth = Math.round(Math.sin(u * Math.PI) ** 0.7 * 40 + hash3(x >> 2, 5) * 6);
          for (let y = top; y < SAND_Y + depth; y++) {
            if (y < SAND_Y + 3) g.px(x, y, rampAt(sand, 0.7 - (y - top) / 14 + hash3(x, y) * 0.2, x, y));
            else {
              const facet = Math.abs(((x * 0.7 + y) % 12) - 6) / 6;
              g.px(x, y, rampAt(ice, 0.25 + facet * 0.5 - (y - SAND_Y) / 90, x, y));
            }
          }
          g.px(x, top - 1, ink);
        }
        // lagoon on the left end
        g.ellipse(ISLE.l + 20, SAND_Y + 1, 18, 3, hex('#2a8ac8'));
        g.ellipse(ISLE.l + 20, SAND_Y + 1, 15, 2, hex('#4ac0e8'));
        // icicles under the island
        for (let i = 0; i < 9; i++) {
          const x = ISLE.l + 18 + i * 14;
          const len = 6 + hash3(i, 8) * 10;
          const base = SAND_Y + Math.sin(((x - ISLE.l) / (ISLE.r - ISLE.l)) * Math.PI) * 38;
          g.tri(x - 2, base, x + 2, base, x, base + len, ice[2]!);
        }

        // Palm tree leaning over the beach.
        const tx = 214;
        const tb = SAND_Y - 4;
        for (let k = 0; k < 30; k++) {
          const u = k / 30;
          const x = tx - u * 14 - u * u * 6;
          const y = tb - u * 50;
          g.rect(x - 2, y, 5, 2, ink);
          g.rect(x - 1, y, 3, 2, (k % 4 < 2 ? hex('#8a5a32') : hex('#a8743e')));
        }
        const cx = tx - 20;
        const cy = tb - 50;
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i / 6) * Math.PI + 0.2;
          const len = 22 + (i % 2) * 5;
          let px = cx;
          let py = cy;
          for (let k = 1; k <= 8; k++) {
            const u = k / 8;
            const qx = cx + Math.cos(a) * len * u;
            const qy = cy + Math.sin(a) * len * u * 0.6 + u * u * 12;
            thickLine(g, px, py, qx, qy, 3 - u * 1.5, leaf[u < 0.5 ? 1 : 2]!);
            px = qx;
            py = qy;
          }
        }
        g.disc(cx - 2, cy + 3, 2, hex('#6a4a2a'));
        g.disc(cx + 3, cy + 3, 2, hex('#5a3a1e'));

        // Hammock post.
        g.rect(160, SAND_Y - 30, 3, 26, hex('#8a5a32'));

        // DJ booth: table, turntables, a tiny speaker.
        roundRect(g, 118, SAND_Y - 16, 40, 14, 2, ink);
        g.rect(119, SAND_Y - 15, 38, 12, hex('#2a2440'));
        g.rect(119, SAND_Y - 15, 38, 2, hex('#4a4070'));
        g.text('MARIMBA', 120, SAND_Y - 10, warm);
        g.rect(103, SAND_Y - 20, 12, 18, ink);
        g.rect(104, SAND_Y - 19, 10, 16, hex('#2a2440'));
        g.disc(109, SAND_Y - 14, 3, hex('#4a4070'));
        g.disc(109, SAND_Y - 6, 2, hex('#4a4070'));
        // beach towel + sandcastle
        g.rect(176, SAND_Y - 2, 18, 4, hex('#ff6a8a'));
        g.rect(176, SAND_Y - 1, 18, 1, hex('#ffd0dc'));
        g.rect(228, SAND_Y - 8, 8, 6, sand[3]!);
        g.rect(228, SAND_Y - 11, 2, 3, sand[3]!);
        g.rect(234, SAND_Y - 11, 2, 3, sand[3]!);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const play = f.awake;

        // Stars streaking past (the beach is moving very fast).
        const n = f.reduced ? 20 : 60;
        for (let i = 0; i < n; i++) {
          const sp = 40 + hash3(i, 11) * 120;
          const len = Math.round(sp / 25);
          const span = g.w + 30;
          const x = g.right + 10 - (((t * sp + hash3(i, 12) * span) % span));
          const y = g.top + hash3(i, 13) * g.h;
          for (let k = 0; k < len; k++) g.pxAdd(x + k, y, hex('#d8e0ff'), (1 - k / len) * (0.3 + hash3(i, 14) * 0.5));
        }

        // Shimmer flowing down the tail.
        for (let i = 0; i < 40; i++) {
          const p = (t * 0.12 + hash3(i, 1)) % 1;
          const x = HEAD.x - p * 360;
          const y = tailY(x) + (hash3(i, 2) - 0.5) * (10 + p * 50);
          g.pxAdd(x, y, mix(hex('#e0faff'), warm, p), (1 - p) * 0.7 + f.energy * 0.3);
        }
        g.glow(HEAD.x, HEAD.y, 10 + f.pulse * 4, hex('#ffffff'), 0.2 + f.energy * 0.3);

        // Waves of pure time lapping at the lagoon.
        const wv = Math.sin(t * 1.4);
        g.hline(ISLE.l + 4 + Math.round(wv * 2), ISLE.l + 34 + Math.round(wv * 2), SAND_Y - 1, hex('#d8f8ff'));
        if (!f.reduced) for (let i = 0; i < 4; i++) g.px(ISLE.l + 8 + i * 7 + Math.round(Math.sin(t * 3 + i) * 2), SAND_Y + 1, hex('#ffffff'));

        // Hammock between the post and the palm, swaying.
        const sway = Math.sin(t * 0.9) * 2;
        const hx0 = 162;
        const hx1 = 205;
        const hy0 = SAND_Y - 28;
        const hy1 = SAND_Y - 32;
        for (let k = 0; k <= 30; k++) {
          const u = k / 30;
          const x = hx0 + (hx1 - hx0) * u + Math.sin(u * Math.PI) * sway;
          const y = hy0 + (hy1 - hy0) * u + Math.sin(u * Math.PI) * 10;
          g.rect(x, y, 1, 3, k % 3 ? hex('#ffd36a') : hex('#ff8a5a'));
        }
        g.px(hx0, hy0, ink);
        g.px(hx1, hy1, ink);

        // ── crab DJ ──
        const bob = play > 0.4 ? Math.round(f.pulse * 1.5 + Math.max(0, Math.sin(t * Math.PI * 1.4)) * 0.8) : 1;
        const ccx = 138;
        const ccy = SAND_Y - 27 + bob;
        const scratching = f.rare === 1 && ev < 5;
        // turntables (in front of the crab's body, drawn after)
        g.ellipse(ccx, ccy + 4, 13, 8, ink);
        g.ball(ccx, ccy + 4, 12, 7, crab, -0.4, -0.8, 0.3);
        g.px(ccx - 6, ccy + 1, crab[3]!);
        g.px(ccx + 5, ccy + 2, crab[3]!);
        // eye stalks + sunglasses
        g.vline(ccx - 4, ccy - 4, ccy, crab[1]!);
        g.vline(ccx + 4, ccy - 4, ccy, crab[1]!);
        g.rect(ccx - 9, ccy - 7, 8, 4, ink);
        g.rect(ccx + 1, ccy - 7, 8, 4, ink);
        g.hline(ccx - 1, ccx + 1, ccy - 6, ink);
        g.px(ccx - 7, ccy - 6, hex('#8ac4f0'));
        g.px(ccx + 2, ccy - 6, hex('#8ac4f0'));
        g.hline(ccx - 3, ccx + 3, ccy + 4, ink);
        g.px(ccx - 4, ccy + 3, ink);
        g.px(ccx + 4, ccy + 3, ink);
        // claws: one on the record, one pumping the air
        const pumpY = play > 0.4 ? Math.round(Math.sin(t * Math.PI * 1.4) * 3 - f.pulse * 2) : 2;
        const scratchX = scratching ? Math.round(Math.sin(ev * 25) * 3) : Math.round(Math.sin(t * 2) * 1);
        thickLine(g, ccx + 9, ccy + 3, ccx + 15, ccy - 6 + pumpY, 2, crab[1]!);
        g.disc(ccx + 16, ccy - 8 + pumpY, 3, crab[2]!);
        g.px(ccx + 17, ccy - 10 + pumpY, ink);
        thickLine(g, ccx - 9, ccy + 3, ccx - 12 + scratchX, ccy + 8, 2, crab[1]!);
        g.disc(ccx - 12 + scratchX, ccy + 9, 2, crab[2]!);
        // legs
        for (let k = 0; k < 3; k++) {
          g.line(ccx - 6 - k * 2, ccy + 8, ccx - 10 - k * 3, ccy + 12, crab[0]!);
          g.line(ccx + 6 + k * 2, ccy + 8, ccx + 10 + k * 3, ccy + 12, crab[0]!);
        }
        // the decks
        const spin = t * (scratching ? 0 : 3) + (scratching ? Math.sin(ev * 25) : 0);
        for (let dx = -11; dx <= 11; dx += 22) {
          const rx = ccx + dx;
          const ry = SAND_Y - 15;
          g.ellipse(rx, ry, 6, 2, ink);
          g.ellipse(rx, ry, 5, 1, hex('#3a3450'));
          g.px(rx + Math.round(Math.cos(spin) * 4), ry + Math.round(Math.sin(spin) * 1), warm);
        }
        if (scratching && ev < 3) g.text('WIKKA', ccx - 16, ccy - 20 - (Math.floor(ev * 4) % 2), warm);
        // booth lights
        for (let i = 0; i < 5; i++) {
          const on = play > 0.4 && (Math.floor(t * 4) + i) % 5 < 2;
          g.px(122 + i * 8, SAND_Y - 4, on ? hex('#ffe08a') : hex('#4a4070'));
        }
        // music notes
        if (play > 0.4) {
          for (let i = 0; i < 3; i++) {
            const p = (t * 0.3 + i / 3) % 1;
            const nx = 106 + Math.sin(p * 5 + i) * 4 - p * 6;
            const ny = SAND_Y - 26 - p * 26;
            g.rect(nx, ny, 2, 2, mix(warm, spaceC[1]!, p));
            g.vline(nx + 1, ny - 4, ny, mix(warm, spaceC[1]!, p));
          }
        }

        // Beach ball bouncing across in the low gravity.
        if (f.rare === 0 && ev < 7) {
          const p = ev / 7;
          const bx = ISLE.r + 10 - p * (ISLE.r - ISLE.l + 30);
          const by = SAND_Y - 4 - Math.abs(Math.sin(p * Math.PI * 3)) * 26;
          g.disc(bx, by, 4, ink);
          g.disc(bx, by, 3, hex('#ffffff'));
          dome(g, bx, by, 3, 3, hex('#ff4a6a'));
          g.rect(bx - 1, by - 3, 2, 7, hex('#4a8aff'));
        }
        // A surfer rides the tail.
        if (f.rare === 2 && ev < 7) {
          const p = ev / 7;
          const sx = HEAD.x - 20 - p * 340;
          const sy = tailY(sx) - 4 + Math.sin(p * 20) * 2;
          g.rect(sx - 5, sy + 2, 11, 2, hex('#ffd36a'));
          g.rect(sx - 1, sy - 5, 2, 7, hex('#4a3aa8'));
          g.disc(sx, sy - 7, 1, hex('#e8b890'));
          g.line(sx, sy - 3, sx - 4, sy - 6, hex('#e8b890'));
          g.line(sx, sy - 3, sx + 4, sy - 4, hex('#e8b890'));
        }
        if (blinking(t, 4, 6)) g.px(52 + 4, 28, hex('#ffcf5a'));
        void clamp;
        void envelope;
        void shade;
      },
    };
  },
};

export default def;

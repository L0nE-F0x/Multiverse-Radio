// Comet Marimba: a tiny island of sand and ice riding the glowing tail of a comet through
// deep space. A palm, a hammock, and a crab in dark glasses at the decks. Stars streak past;
// the sun is a small warm coin a long way off.

import { haze, motes } from '../kit/atmos';
import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, rampAt } from '../kit/fx';
import { hash3 } from '../kit/rng';
import { arc, dome, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const HEAD = { x: 296, y: 40 };
const SAND_Y = 112;
const ISLE = { l: 96, r: 240 };

// The tail's centre line: from the comet head sweeping down-left.
const tailY = (x: number) => HEAD.y + (HEAD.x - x) * 0.32 + ((HEAD.x - x) / 200) ** 2 * 18;

const def: SceneDef = {
  id: 'comet-beach',
  fps: 20,
  rareEvents: 3,
  rareDuration: 7,
  focusY: 84,
  grade: { contrast: 1.12, saturation: 0.8, bloom: 0.8, threshold: 0.66, vignette: 0.42, temperature: -0.1 },
  create({ accent }) {
    const ink = hex('#0a0814');
    const spaceC = [hex('#020309'), hex('#060818'), hex('#0c0e24')];
    const sand = ramp([hex('#2e2622'), hex('#5a4a3e'), hex('#8a765e'), hex('#b8a284')], 5);
    const ice = ramp([hex('#0a1226'), hex('#1c3254'), hex('#46688c'), hex('#a0c0d8')], 4);
    const leaf = ramp([hex('#08120e'), hex('#152a20'), hex('#2a4a38')], 3);
    const crab = ramp([hex('#2e100c'), hex('#6e2a1c'), hex('#a84e32'), hex('#d4865e')], 4);
    const warm = mix(accent, hex('#c8a0a0'), 0.35);

    return {
      background(g) {
        g.vgrad(spaceC, g.top, g.bottom);
        for (let i = 0; i < 70; i++) {
          const x = g.left + hash3(i, 1) * g.w;
          const y = g.top + hash3(i, 2) * g.h;
          g.pxAdd(x, y, hex('#a8b4d8'), 0.2 + hash3(i, 3) * 0.4);
        }
        // The sun: a small warm coin a long way off.
        g.glow(48, 40, 30, hex('#ffb060'), 0.22, 5);
        g.ball(48, 40, 6, 6, ramp([hex('#c86a2a'), hex('#f0a850'), hex('#fff0c8')], 4), -0.4, -0.5, 0.5);

        // Comet tail: layered glow along the curve, warmer and fainter with distance.
        for (let x = HEAD.x; x > g.left - 20; x -= 2) {
          const d = (HEAD.x - x) / 340;
          const y = tailY(x);
          const w = 8 + d * 46;
          const c = mix(hex('#a8dcef'), warm, Math.min(1, d * 1.6));
          g.glow(x, y, w, c, 0.06 * (1 - d * 0.7), 6);
        }
        g.glow(HEAD.x, HEAD.y, 46, hex('#a8dcef'), 0.45, 6);
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
              const facet = Math.abs(((x * 0.7 + y) % 16) - 8) / 8;
              g.px(x, y, rampAt(ice, 0.32 + facet * 0.22 - (y - SAND_Y) / 70 + (x - ISLE.l) / 600, x, y));
            }
          }
          g.px(x, top - 1, ink);
        }
        // lagoon on the left end
        g.ellipse(ISLE.l + 20, SAND_Y + 1, 18, 3, hex('#14344a'));
        g.ellipse(ISLE.l + 20, SAND_Y + 1, 15, 2, hex('#2a5a74'));
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
          g.rect(x - 1, y, 3, 2, k % 4 < 2 ? hex('#3a2a1e') : hex('#4e3826'));
          g.px(x + 1, y, hex('#6a7e90'));
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
        g.disc(cx - 2, cy + 3, 2, hex('#2a1e14'));
        g.disc(cx + 3, cy + 3, 2, hex('#22180e'));

        // Hammock post.
        g.rect(160, SAND_Y - 30, 3, 26, hex('#3a2a1e'));
        g.vline(162, SAND_Y - 30, SAND_Y - 5, hex('#6a7e90'));

        // DJ booth: table, turntables, a tiny speaker.
        roundRect(g, 118, SAND_Y - 16, 40, 14, 2, ink);
        g.rect(119, SAND_Y - 15, 38, 12, hex('#16141e'));
        g.rect(119, SAND_Y - 15, 38, 1, hex('#3a3a4e'));
        g.rect(103, SAND_Y - 20, 12, 18, ink);
        g.rect(104, SAND_Y - 19, 10, 16, hex('#16141e'));
        g.disc(109, SAND_Y - 14, 3, hex('#2a2a3a'));
        g.disc(109, SAND_Y - 6, 2, hex('#2a2a3a'));
        // a beach towel
        g.rect(176, SAND_Y - 2, 18, 4, hex('#4a2a34'));
        g.rect(176, SAND_Y - 1, 18, 1, hex('#7a5a60'));

        haze(g, hex('#0a1428'), SAND_Y + 10, g.bottom, 0, 0.5);
        g.lighting(0.55);
        g.light(HEAD.x, HEAD.y, 130, 0.65);
        g.light(165, 96, 80, 0.4, 40);
        g.light(48, 40, 40, 0.25);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const play = f.awake;

        // Stars streaking past (the beach is moving very fast).
        const n = f.reduced ? 12 : 36;
        for (let i = 0; i < n; i++) {
          const sp = 40 + hash3(i, 11) * 120;
          const len = Math.round(sp / 25);
          const span = g.w + 30;
          const x = g.right + 10 - (((t * sp + hash3(i, 12) * span) % span));
          const y = g.top + hash3(i, 13) * g.h;
          for (let k = 0; k < len; k++) g.pxAdd(x + k, y, hex('#b8c4e8'), (1 - k / len) * (0.15 + hash3(i, 14) * 0.35));
        }

        // Shimmer flowing down the tail.
        for (let i = 0; i < 40; i++) {
          const p = (t * 0.12 + hash3(i, 1)) % 1;
          const x = HEAD.x - p * 360;
          const y = tailY(x) + (hash3(i, 2) - 0.5) * (10 + p * 50);
          g.pxAdd(x, y, mix(hex('#cdeef8'), warm, p), (1 - p) * 0.6 + f.energy * 0.25);
        }
        g.glow(HEAD.x, HEAD.y, 10 + f.pulse * 4, hex('#ffffff'), 0.2 + f.energy * 0.3);

        // Waves of pure time lapping at the lagoon.
        const wv = Math.sin(t * 1.4);
        g.hline(ISLE.l + 4 + Math.round(wv * 2), ISLE.l + 34 + Math.round(wv * 2), SAND_Y - 1, hex('#7a9cb4'));
        if (!f.reduced) for (let i = 0; i < 4; i++) g.px(ISLE.l + 8 + i * 7 + Math.round(Math.sin(t * 3 + i) * 2), SAND_Y + 1, hex('#a8c8dc'));

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
          g.rect(x, y, 1, 3, k % 3 ? hex('#8a7a5a') : hex('#6a4a3a'));
        }
        g.px(hx0, hy0, ink);
        g.px(hx1, hy1, ink);

        // ── crab DJ ──
        const bob = play > 0.4 ? Math.round(f.pulse * 1.5 + Math.max(0, Math.sin(t * Math.PI * 1.4)) * 0.8) : 1;
        const ccx = 138;
        const ccy = SAND_Y - 27 + bob;
        const scratching = f.rare === 1 && ev < 5;
        // turntables (in front of the crab's body, drawn after)
        // carapace: a wide, flat shell, lit from the comet on the right
        g.ellipse(ccx, ccy + 4, 14, 7, ink);
        g.ellipse(ccx, ccy + 4, 13, 6, crab[1]!);
        g.ellipse(ccx + 1, ccy + 2, 10, 3, crab[2]!);
        g.ellipse(ccx + 5, ccy + 1, 5, 1, crab[3]!);
        g.hline(ccx - 11, ccx + 11, ccy + 8, crab[0]!);
        for (const k of [-8, -3, 3, 8]) g.px(ccx + k, ccy + 9, ink);
        // eye stalks + dark glasses with the comet in them
        g.vline(ccx - 4, ccy - 4, ccy - 1, crab[2]!);
        g.vline(ccx + 4, ccy - 4, ccy - 1, crab[2]!);
        g.rect(ccx - 8, ccy - 8, 7, 4, ink);
        g.rect(ccx + 1, ccy - 8, 7, 4, ink);
        g.hline(ccx - 1, ccx + 1, ccy - 7, ink);
        g.hline(ccx - 8, ccx - 2, ccy - 8, hex('#3e4656'));
        g.hline(ccx + 1, ccx + 7, ccy - 8, hex('#3e4656'));
        g.px(ccx + 6, ccy - 7, hex('#cdeef8'));
        g.px(ccx - 3, ccy - 7, hex('#7a9cb4'));
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
          g.ellipse(rx, ry, 5, 1, hex('#22202c'));
          g.px(rx + Math.round(Math.cos(spin) * 4), ry + Math.round(Math.sin(spin) * 1), warm);
        }
        if (scratching) g.glow(ccx - 11, SAND_Y - 15, 6, warm, 0.25 + 0.2 * Math.abs(Math.sin(ev * 25)));
        // booth lights
        for (let i = 0; i < 5; i++) {
          const on = play > 0.4 && (Math.floor(t * 4) + i) % 5 < 2;
          g.px(122 + i * 8, SAND_Y - 6, on ? warm : hex('#2a2a3a'));
          if (on) g.glow(122 + i * 8, SAND_Y - 6, 3, warm, 0.25);
        }
        if (!f.reduced) motes(g, t, ISLE.l, SAND_Y - 50, ISLE.r, SAND_Y, 10, hex('#cdeef8'), 0.3, 6, 0.3);

        // Beach ball bouncing across in the low gravity.
        if (f.rare === 0 && ev < 7) {
          const p = ev / 7;
          const bx = ISLE.r + 10 - p * (ISLE.r - ISLE.l + 30);
          const by = SAND_Y - 4 - Math.abs(Math.sin(p * Math.PI * 3)) * 26;
          g.disc(bx, by, 4, ink);
          g.disc(bx, by, 3, hex('#c8c4bc'));
          dome(g, bx, by, 3, 3, hex('#a84a50'));
          g.rect(bx - 1, by - 3, 2, 7, hex('#4a6a9a'));
        }
        // A surfer rides the tail.
        if (f.rare === 2 && ev < 7) {
          const p = ev / 7;
          const sx = HEAD.x - 20 - p * 340;
          const sy = tailY(sx) - 26 + Math.sin(p * 20) * 2;
          g.rect(sx - 5, sy + 2, 11, 2, hex('#ffd36a'));
          g.rect(sx - 1, sy - 5, 2, 7, hex('#4a3aa8'));
          g.disc(sx, sy - 7, 1, hex('#e8b890'));
          g.line(sx, sy - 3, sx - 4, sy - 6, hex('#e8b890'));
          g.line(sx, sy - 3, sx + 4, sy - 4, hex('#e8b890'));
        }
        void blinking;
        void arc;
        void clamp;
        void envelope;
        void shade;
      },
    };
  },
};

export default def;

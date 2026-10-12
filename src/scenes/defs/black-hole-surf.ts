// Event Horizon Surf Report: a beach at the edge of a black hole whose light bends into a
// ring. Surfers ride slow, gravitational swells out toward it; a lifeguard tower leans the
// same way; a sign on the sand reads NO RETURNS.

import { hex, mix } from '../kit/color';
import { clamp, envelope, stars } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { vignette } from './lib/night';

const HOLE = { x: 160, y: 46, r: 13 };
const HORIZON = 90;
const SHORE = 118;
const TOWER = { x: 92, y: 132 };
const SIGN = { x: 232, y: 128 };

const def: SceneDef = {
  id: 'black-hole-surf',
  fps: 15,
  focusY: 80,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#030204');
    const sky = [hex('#030206'), hex('#07040e'), hex('#0e0816'), hex('#1a0c18')];
    const orange = accent;
    const hot = mix(accent, hex('#fff4d8'), 0.6);
    const sea = [hex('#050308'), hex('#0c0610'), mix(hex('#1a0c10'), accent, 0.15)];
    const sand = [hex('#0e0a0c'), hex('#181014'), hex('#24181a')];

    const disc = (g: Gfx, t: number, front: boolean, k: number) => {
      // the accretion disc: a thin, hot, turning ellipse; the far half bends over the top
      const { x, y } = HOLE;
      for (let i = 0; i < 420; i++) {
        const a = (i / 420) * Math.PI * 2;
        const near = Math.sin(a) > 0;
        if (near !== front) continue;
        for (let ring = 0; ring < 3; ring++) {
          const rx = 26 + ring * 10;
          const ry = 4 + ring * 1.5;
          const px = x + Math.cos(a) * rx;
          const py = y + Math.sin(a) * ry;
          const n = hash3(Math.floor(((a + t * (0.6 - ring * 0.15)) * 30) % 189), ring, 3);
          const b = (0.25 + n * 0.5) * (1 - ring * 0.25) * k * (front ? 1 : 0.8);
          g.pxAdd(px, py, n > 0.7 ? hot : orange, b);
        }
      }
      if (!front) {
        // lensed light: the far side of the disc seen over the top of the hole
        for (let i = 0; i < 160; i++) {
          const a = Math.PI + (i / 160) * Math.PI;
          for (let ring = 0; ring < 2; ring++) {
            const r = HOLE.r + 3 + ring * 3;
            const px = x + Math.cos(a) * r * 1.15;
            const py = y + Math.sin(a) * r;
            const n = hash3(Math.floor(((a - t * 0.5) * 40) % 251), ring, 9);
            g.pxAdd(px, py, n > 0.6 ? hot : orange, (0.3 + n * 0.4) * k * (1 - ring * 0.4));
          }
        }
      }
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, HORIZON);
        stars(g, 0, g.left, g.top, g.right, HORIZON - 4, 0.3, hex('#e8e0f0'), 13, 0);
        // starlight bent into short arcs near the hole
        for (let i = 0; i < 9; i++) {
          const r = 22 + hash3(i, 1) * 40;
          const a0 = hash3(i, 2) * Math.PI * 2;
          for (let k = 0; k < 14; k++) {
            const a = a0 + k * 0.03;
            g.pxAdd(HOLE.x + Math.cos(a) * r * 1.2, HOLE.y + Math.sin(a) * r, hex('#e8e0f0'), 0.4 * (1 - k / 14));
          }
        }
        g.glow(HOLE.x, HOLE.y, 120, orange, 0.12, 6);
        g.glow(HOLE.x, HOLE.y, 50, hot, 0.12, 6);

        // The sea: long, slow swells reflecting the ring.
        for (let y = HORIZON; y < SHORE; y++)
          for (let x = g.left; x < g.right; x++) {
            const d = (y - HORIZON) / (SHORE - HORIZON);
            const col = clamp(1 - Math.abs(x - HOLE.x) / (20 + d * 60));
            let k = Math.floor(d * 1.2 + col * 1.6 + bayer(x, y) * 0.8);
            if (k > 2) k = 2;
            g.px(x, y, sea[k]!);
          }
        // The beach.
        for (let y = SHORE; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 20, y / 8, 4, 2);
            const lit = clamp(1 - (y - SHORE) / 50) * clamp(1 - Math.abs(x - 160) / 260);
            let k = Math.floor(n * 0.8 + lit * 1.6 + bayer(x, y) * 0.6);
            if (k > 2) k = 2;
            g.px(x, y, sand[k]!);
          }
        g.hline(g.left, g.right, SHORE, mix(sand[2]!, orange, 0.2));

        // The lifeguard tower, leaning toward the hole.
        const { x: tx, y: ty } = TOWER;
        const lean = 0.32;
        const at = (h: number) => tx + h * lean;
        for (const s of [-8, 8]) g.line(tx + s, ty, at(36) + s * 0.8, ty - 36, hex('#1a1214'));
        for (let h = 8; h < 36; h += 9) g.line(tx - 8 + h * lean, ty - h, tx + 8 + h * lean, ty - h, hex('#1a1214'));
        g.poly([at(36) - 11, ty - 36, at(36) + 11, ty - 36, at(48) + 10, ty - 48, at(48) - 10, ty - 48], hex('#2a1a1a'));
        g.line(at(36) - 11, ty - 36, at(48) - 10, ty - 48, mix(hex('#2a1a1a'), orange, 0.5));
        g.poly([at(50) - 14, ty - 50, at(50) + 14, ty - 50, at(58) + 2, ty - 57], mix(hex('#3a1414'), orange, 0.2));
        g.line(at(50) - 14, ty - 50, at(58) + 2, ty - 57, mix(orange, hex('#3a1414'), 0.4));
        g.line(at(36) + 11, ty - 36, at(4) + 16, ty - 2, hex('#1a1214'));

        // The sign.
        const { x: sx, y: sy } = SIGN;
        g.vline(sx, sy - 24, sy, hex('#1a1214'));
        g.vline(sx + 1, sy - 24, sy, hex('#120c0e'));
        g.rect(sx - 22, sy - 34, 46, 12, hex('#8a7e6a'));
        g.rect(sx - 22, sy - 34, 46, 1, mix(hex('#8a7e6a'), orange, 0.6));
        g.rect(sx - 22, sy - 23, 46, 1, hex('#5a5040'));

        // A surfboard planted in the sand.
        g.poly([258, 136, 262, 136, 263, 112, 260, 106, 257, 112], mix(hex('#3a2a20'), orange, 0.3));
        g.line(260, 107, 260, 134, mix(orange, hex('#ffffff'), 0.2));

        vignette(g, 0.5, 160, 70, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const e = f.energy;

        // The hole: disc behind, the shadow, the photon ring, then the near side of the disc.
        const k = 0.7 + e * 0.4;
        g.ellipseA(HOLE.x, HOLE.y, 40, 4, orange, 0.12 * k);
        disc(g, f.reduced ? 0 : t, false, k);
        g.disc(HOLE.x, HOLE.y, HOLE.r, ink);
        g.ring(HOLE.x, HOLE.y, HOLE.r + 1, HOLE.r + 1, hot);
        g.ring(HOLE.x, HOLE.y, HOLE.r + 2, HOLE.r + 2, mix(orange, ink, 0.3));
        disc(g, f.reduced ? 0 : t, true, k);
        g.ellipseA(HOLE.x, HOLE.y + 1, 34, 2, hot, 0.18 * k);
        g.glow(HOLE.x - 30, HOLE.y + 1, 10, hot, 0.25 * k);
        g.glow(HOLE.x + 30, HOLE.y + 1, 10, hot, 0.25 * k);

        // Swells rolling out toward the hole: bright crests, slowly.
        for (let w = 0; w < 4; w++) {
          const p = ((t * 0.04 + w / 4) % 1);
          const y = SHORE - 2 - p * (SHORE - HORIZON - 2);
          const amp = 1 - p * 0.7;
          for (let x = g.left; x < g.right; x++) {
            const crest = Math.sin(x * 0.05 + w * 2 + t * 0.2) * 1.5 * amp;
            const lit = clamp(1 - Math.abs(x - HOLE.x) / (40 + (1 - p) * 120));
            g.pxAdd(x, y + crest, orange, (0.08 + lit * 0.45) * amp);
          }
        }
        // the reflection column under the hole
        for (let y = HORIZON + 1; y < SHORE; y++) {
          const w = 2 + (y - HORIZON) * 0.4;
          const x = HOLE.x + Math.sin(t * 1.3 + y * 0.8) * w;
          g.pxAdd(x, y, hot, 0.35 * (1 - (y - HORIZON) / 40));
        }

        // Surfers, in slow motion, riding out.
        for (let s = 0; s < 2; s++) {
          const p = ((t * 0.025 + s * 0.5) % 1);
          let sx = 60 + s * 150 + Math.sin(t * 0.3 + s) * 20 + (HOLE.x - (60 + s * 150)) * p * 0.6;
          let sy = SHORE - 4 - p * 22;
          const scale = 1.5 - p * 0.9;
          if (f.rare === 3 && s === 0 && ev < 10) {
            const wipe = envelope(ev, 10, 1, 3);
            sy -= wipe * 8;
            sx += Math.sin(ev * 2) * 3 * wipe;
            g.line(sx - 4, sy - 4 - wipe * 10, sx + 4, sy - 8 - wipe * 14, mix(orange, hex('#fff0d0'), 0.3));
          } else g.hline(sx - 4 * scale, sx + 4 * scale, sy, mix(orange, hex('#fff0d0'), 0.3));
          const h = Math.max(3, Math.round(7 * scale));
          g.vline(sx, sy - h, sy - 1, ink);
          g.vline(sx + 1, sy - h + 1, sy - 3, ink);
          g.disc(sx, sy - h - 1, scale > 1 ? 1 : 0.5, ink);
          g.line(sx, sy - h + 2, sx - 3 * scale, sy - h + 3, ink);
          g.line(sx, sy - h + 2, sx + 3 * scale, sy - h + 1, ink);
          g.px(sx - 1, sy - 1, ink);
          g.px(sx + 2, sy - 1, ink);
        }

        // Sand grains drift toward the hole.
        if (!f.reduced)
          for (let i = 0; i < 24; i++) {
            const p = (t * 0.03 + hash3(i, 1)) % 1;
            const x0 = g.left + hash3(i, 2) * g.w;
            const x = x0 + (HOLE.x - x0) * p;
            const y = SHORE + 20 - p * 70;
            g.pxAdd(x, y, orange, 0.3 * (1 - p));
          }

        // The sign, which briefly reconsiders (rare).
        const msg = f.rare === 2 && ev > 5 && ev < 9 && Math.floor(ev * 4) % 4 !== 0 ? 'ONE RETURN' : 'NO RETURNS';
        g.textCenter(msg, SIGN.x + 1, SIGN.y - 31, hex('#24160e'));
        // Rare: a bottle washes back up, against every rule.
        if (f.rare === 2 && ev < 10) {
          const p = clamp(ev / 5);
          const bx = HOLE.x + (190 - HOLE.x) * p;
          const by = HORIZON + 2 + (SHORE + 4 - HORIZON) * p * p;
          g.rect(bx - 2, by - 1, 5, 2, hex('#3a6a4a'));
          g.px(bx + 3, by - 1, hex('#c8b890'));
          g.px(bx - 1, by - 1, hex('#8ac8a0'));
        }

        // Rare: a beach ball makes for the hole and is stretched very thin.
        if (f.rare === 0 && ev < 10) {
          const p = clamp(ev / 8);
          const bx = 200 + (HOLE.x - 200) * p * p;
          const by = SHORE + 6 - p * p * (SHORE + 6 - HOLE.y);
          const stretch = 1 + p * p * p * 30;
          const r = Math.max(0.5, 3 / Math.sqrt(stretch));
          if (p < 0.98) {
            g.ellipse(bx, by, r, 3 * Math.min(4, stretch * 0.4), hex('#e84a3a'));
            g.ellipse(bx, by, Math.max(0.5, r - 1), Math.max(1, 2 * Math.min(4, stretch * 0.3)), hex('#f0e8d8'));
          }
        }
        // Rare: a gull flies at the hole and stops, mid-flap, forever (for a while).
        if (f.rare === 1 && ev < 10) {
          const p = clamp(ev / 4);
          const gx = 30 + (120 - 30) * p;
          const gy = 70 - p * 16;
          const frozen = p >= 1;
          const flap = frozen ? 1 : Math.floor(ev * 8) % 2;
          const c = frozen ? mix(hex('#c8c0b8'), orange, clamp((ev - 4) / 6) * 0.7) : hex('#c8c0b8');
          g.px(gx, gy, c);
          g.px(gx + 1, gy, c);
          g.px(gx - 1, gy - flap, c);
          g.px(gx - 2, gy - flap * 2, c);
          g.px(gx + 2, gy - flap, c);
          g.px(gx + 3, gy - flap * 2, c);
        }
      },
    };
  },
};

export default def;

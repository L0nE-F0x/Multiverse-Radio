// Orbit Roots: a low-gravity farm on Meridian, a small moon under a vast ringed planet. Long
// glass greenhouses glow green across the curve of the ground; irrigation misters throw slow
// arcs of spray that take their time coming down; a hand-painted studio shack keeps a speaker
// stack on its porch. Out among the crops, a scarecrow wears a space helmet.

import { type Color, hex, mix, ramp, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, vignette } from './lib/night';
import { type Pose, figure } from './lib/outer';

const PLANET = { x: 196, y: -14, r: 80 };
const RING = { rx: 150, ry: 24, tilt: -0.12 };
const SHACK = { x0: 204, x1: 242, y: 128 };
const MISTERS = [
  { x: 60, y: 131, ph: 0 },
  { x: 150, y: 132, ph: 1.7 },
  { x: 108, y: 105, ph: 3.1 },
  { x: 188, y: 107, ph: 4.4 },
];
const horizon = (x: number) => 100 + ((x - 160) / 170) ** 2 * 10;

interface House {
  x0: number;
  x1: number;
  base: number;
  h: number;
}
const HOUSES: House[] = [
  { x0: 22, x1: 104, base: 103, h: 9 },
  { x0: 176, x1: 226, base: 104, h: 8 },
  { x0: 62, x1: 186, base: 128, h: 22 },
];

const def: SceneDef = {
  id: 'farm-moon',
  fps: 12,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 12,
  grade: { temperature: -0.05, saturation: 0.88, bloom: 0.6 },
  create({ accent }) {
    const ink = hex('#04060a');
    const green = accent;
    const greenL = mix(accent, hex('#e8ffe0'), 0.4);
    const greenD = mix(accent, hex('#06140c'), 0.75);
    const warm = hex('#ffc070');
    const ground = ramp([hex('#07090e'), hex('#10141c'), hex('#1a2028'), hex('#262e38'), hex('#3a4450')], 6);
    const band = [hex('#3a3428'), hex('#6a5a40'), hex('#8a7a5a'), hex('#a89a78'), hex('#5a6a6a'), hex('#7a8a84')];
    const mistC = hex('#d8f0e8');
    const pose: Pose = { lean: 0, armL: 0.3, armR: -0.3, legL: -0.1, legR: 0.1 };

    const ringPt = (a: number, k: number) => {
      const x = Math.cos(a) * RING.rx * k;
      const y = Math.sin(a) * RING.ry * k;
      return [PLANET.x + x * Math.cos(RING.tilt) - y * Math.sin(RING.tilt), PLANET.y + 30 + x * Math.sin(RING.tilt) + y * Math.cos(RING.tilt)] as const;
    };
    const drawRing = (g: Gfx, front: boolean) => {
      for (let i = 0; i < 1400; i++) {
        const a = (i / 1400) * Math.PI * 2;
        const isFront = Math.sin(a) > 0;
        if (isFront !== front) continue;
        for (let k = 0.72; k <= 1; k += 0.018) {
          if (Math.abs(k - 0.86) < 0.02) continue; // the gap
          const [x, y] = ringPt(a, k);
          // the planet's shadow falls across the far side of the rings
          const shadowed = !front && Math.hypot(x - PLANET.x - 18, y - PLANET.y - 6) < PLANET.r;
          if (!front && Math.hypot(x - PLANET.x, y - PLANET.y) < PLANET.r) continue;
          const b = 0.35 + 0.4 * hash3(Math.floor(k * 60), 3) + (Math.cos(a) < 0 ? 0.15 : 0);
          g.pxA(x, y, mix(hex('#8a8070'), hex('#d8ccb0'), b), (shadowed ? 0.15 : 0.55) * b);
        }
      }
    };

    const greenhouse = (g: Gfx, h: House) => {
      const w = h.x1 - h.x0;
      const cx = (h.x0 + h.x1) / 2;
      g.glow(cx, h.base - h.h / 2, w * 0.65, green, 0.12, 6);
      // the glass vault: a half-cylinder, bright where the grow lights hang, ribbed
      for (let x = h.x0; x <= h.x1; x++) {
        const u = (x - h.x0) / w;
        const endFade = Math.min(1, Math.min(u, 1 - u) * 12);
        for (let y = h.base - h.h; y < h.base; y++) {
          const v = (h.base - y) / h.h; // 0 at the ground, 1 at the ridge
          const curve = Math.sqrt(Math.max(0, 1 - (1 - v) * (1 - v)));
          const inner = 0.8 - Math.abs(v - 0.3) * 0.8;
          const lit = clamp(inner * endFade * (0.85 + 0.15 * Math.sin(u * 40)));
          let c = mix(greenD, mix(green, greenL, 0.25), lit);
          if (v > 0.78) c = mix(c, hex('#d8f0e0'), 0.35 * curve);
          g.px(x, y, (bayer(x, y) < 0.1 && lit < 0.3) ? greenD : c);
        }
        g.px(x, h.base - h.h, mix(greenD, greenL, 0.55));
      }
      // plants inside: dark leafy silhouettes against the glow
      for (let x = h.x0 + 2; x < h.x1 - 1; x++) {
        const ph = Math.abs(Math.sin(x * 0.9 + h.base)) * 0.6 + fbm(x / 2.5, h.base, 7, 2) * 0.6;
        const top = h.base - 1 - Math.round(ph * h.h * 0.3);
        g.vline(x, top, h.base - 1, mix(hex('#06140a'), greenD, 0.45));
        g.px(x, top, mix(greenD, green, 0.35));
      }
      // ribs
      const step = Math.max(5, Math.round(h.h * 0.55));
      for (let x = h.x0 + step; x < h.x1; x += step) g.vline(x, h.base - h.h, h.base - 1, mix(greenD, hex('#0a1410'), 0.5));
      for (const ex of [h.x0, h.x1]) g.vline(ex, h.base - h.h, h.base - 1, mix(greenD, hex('#1a2a20'), 0.6));
      g.rect(h.x0 - 1, h.base, w + 3, 2, ink);
      g.ellipseA(cx, h.base + 3, w * 0.62, 4 + h.h * 0.25, green, 0.12);
    };

    return {
      background(g) {
        // ── space and the ringed planet ──
        g.vgrad([hex('#020308'), hex('#05070f'), hex('#0a0e18')], g.top, 100);
        for (let i = 0; i < 160; i++) {
          const x = g.left + hash3(i, 1) * g.w;
          const y = g.top + hash3(i, 2) * (110 - g.top);
          if (Math.hypot(x - PLANET.x, y - PLANET.y) < PLANET.r + 2) continue;
          g.pxAdd(x, y, hex('#e0e8ff'), 0.15 + hash3(i, 3) ** 2 * 0.6);
        }
        g.glow(PLANET.x, PLANET.y, PLANET.r * 1.4, hex('#3a4a5a'), 0.18, 8);
        drawRing(g, false);
        const n = band.length - 1;
        for (let y = Math.max(g.top, PLANET.y - PLANET.r); y <= PLANET.y + PLANET.r; y++)
          for (let x = PLANET.x - PLANET.r; x <= PLANET.x + PLANET.r; x++) {
            const dx = (x + 0.5 - PLANET.x) / PLANET.r;
            const dy = (y + 0.5 - PLANET.y) / PLANET.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= 1) continue;
            const nz = Math.sqrt(1 - d2);
            const lit = clamp(-dx * 0.75 - dy * 0.15 + nz * 0.45);
            const lat = dy * 0.92 + dx * 0.12;
            const bands = 0.5 + 0.5 * Math.sin(lat * 14 + fbm(x / 30, y / 6, 71, 3) * 4);
            const k = Math.floor(bands * n + bayer(x, y) * 0.9);
            const c = band[Math.min(n, k)]!;
            const shadeK = 0.08 + lit * 0.92;
            g.px(x, y, shade(mix(c, hex('#0a0e16'), clamp(1 - shadeK * 1.4)), 0.35 + shadeK * 0.65));
          }
        // the terminator softened with a little haze
        drawRing(g, true);

        // ── the moon's ground: a gentle curve ──
        const n2 = ground.length - 1;
        for (let x = g.left; x < g.right; x++) {
          const top = Math.round(horizon(x));
          for (let y = top; y < g.bottom; y++) {
            const depth = clamp((y - top) / 90);
            const tex = fbm(x / 7, y / 3, 73, 3);
            const v = clamp(0.5 - depth * 0.35 + (tex - 0.5) * 0.5 + (y - top < 2 ? 0.25 : 0));
            let k = Math.floor(v * n2 + bayer(x, y));
            if (k > n2) k = n2;
            g.px(x, y, ground[k]!);
          }
        }
        // craters
        for (let i = 0; i < 14; i++) {
          const cx = g.left + hash3(i, 7) * g.w;
          const cy = 108 + hash3(i, 8) * 120;
          const r = 2 + hash3(i, 9) * 6 * (cy / 120);
          g.ellipse(cx, cy, r, r * 0.35, ground[0]!);
          g.hline(cx - r, cx + r * 0.4, Math.round(cy - r * 0.35), ground[3]!);
        }

        // ── irrigation pipes ──
        for (const [y0, y1, x0, x1] of [
          [106, 108, 40, 300],
          [131, 133, g.left, 214],
        ] as const)
          for (let x = x0; x < x1; x++) {
            const y = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
            g.px(x, y, hex('#3a4450'));
            g.px(x, y + 1, hex('#141a22'));
            if (x % 30 === 0) g.rect(x - 1, y - 1, 3, 3, hex('#4a5460'));
          }
        for (const m of MISTERS) {
          g.vline(m.x, m.y - 4, m.y, hex('#3a4450'));
          g.px(m.x, m.y - 5, hex('#8a9aa0'));
        }

        for (const h of HOUSES) greenhouse(g, h);

        // outdoor crop rows curving away over the near ground (tall views mostly)
        for (let r = 0; r < 9; r++) {
          const y0 = 158 + r * r * 1.4 + r * 8;
          for (let x = g.left; x < g.right; x += 3 + (r >> 1)) {
            const y = y0 + ((x - 160) / 200) ** 2 * 14;
            if (hash3(x, r, 11) < 0.4) continue;
            const hgt = 1 + (r >> 2);
            g.vline(x, y - hgt, y, mix(hex('#060e0a'), greenD, 0.25));
          }
        }
        // ── the scarecrow, in a space helmet ──
        const sx = 40;
        const sy = 142;
        g.vline(sx, sy - 22, sy, hex('#2a2018'));
        g.hline(sx - 8, sx + 8, sy - 17, hex('#2a2018'));
        g.rect(sx - 4, sy - 17, 9, 9, hex('#3a3020'));
        g.rect(sx - 8, sy - 17, 4, 2, hex('#4a3a24'));
        g.rect(sx + 5, sy - 17, 4, 2, hex('#4a3a24'));
        g.disc(sx, sy - 22, 3, hex('#8a7448'));
        g.ring(sx, sy - 22, 5, 5, hex('#6a7a88'));
        g.px(sx - 3, sy - 25, hex('#e0ecf0'));
        g.px(sx - 2, sy - 26, hex('#c0d0d8'));
        // a little outdoor crop bed
        for (let x = 22; x < 92; x += 3) for (let r = 0; r < 3; r++) if (hash3(x, r, 5) < 0.75) g.px(x + r, 146 + r * 4, mix(hex('#0a1a10'), green, 0.25));

        // ── the studio shack: painted planks, a lit window, speakers on the porch ──
        const S = SHACK;
        const w = S.x1 - S.x0;
        g.rect(S.x0 - 4, S.y - 30, w + 8, 3, hex('#1a1210'));
        g.poly([S.x0 - 6, S.y - 28, S.x1 + 6, S.y - 28, S.x1 + 2, S.y - 36, S.x0 + 2, S.y - 36], hex('#2a1e18'));
        g.hline(S.x0 - 6, S.x1 + 6, S.y - 28, hex('#4a3a2a'));
        const stripes = [hex('#5a2a22'), hex('#6a5a2e'), hex('#2a4a30')];
        for (let y = S.y - 27; y < S.y; y++) g.hline(S.x0, S.x1, y, mix(hex('#1a140e'), stripes[Math.floor((y - (S.y - 27)) / 9) % 3]!, 0.45));
        for (let x = S.x0; x <= S.x1; x += 4) g.vline(x, S.y - 27, S.y - 1, hex('#120e0a'));
        // window and door
        g.rect(S.x0 + 6, S.y - 22, 12, 9, hex('#120c08'));
        g.rect(S.x0 + 7, S.y - 21, 10, 7, mix(hex('#5a3a18'), warm, 0.6));
        g.vline(S.x0 + 12, S.y - 21, S.y - 15, hex('#3a2410'));
        g.rect(S.x0 + 26, S.y - 20, 8, 20, hex('#0e0a08'));
        g.glow(S.x0 + 12, S.y - 17, 18, warm, 0.18, 5);
        g.ellipseA(S.x0 + 12, S.y + 4, 20, 4, warm, 0.1);
        // porch boards and the speaker stack
        g.rect(S.x0 - 8, S.y, w + 16, 3, hex('#2a1e14'));
        g.hline(S.x0 - 8, S.x1 + 8, S.y, hex('#4a3624'));
        g.rect(S.x1 - 2, S.y - 22, 12, 11, hex('#0e0c0c'));
        g.rect(S.x1 - 2, S.y - 11, 12, 11, hex('#0e0c0c'));
        // the mast
        g.vline(S.x0 + 4, S.y - 64, S.y - 36, hex('#2a3038'));
        for (let y = S.y - 62; y < S.y - 36; y += 5) g.line(S.x0 + 2, y, S.x0 + 6, y + 5, hex('#1e242c'));
        g.textCenter('STUDIO', (S.x0 + S.x1) / 2, S.y - 34, mix(hex('#2a2418'), hex('#c8b880'), 0.4));

        g.lighting(0.72);
        g.light(PLANET.x - 40, PLANET.y + 20, 180, 0.2, 120);
        g.light(133, 118, 90, 0.35, 26);
        g.light(S.x0 + 12, S.y - 10, 40, 0.35);
        vignette(g, 0.4, 160, 92, 240, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const hit = f.reduced ? 0 : f.pulse * awake;

        // Rare: a little moon crosses in front of the rings.
        if (f.rare === 1 && ev < 12) {
          const p = ev / 12;
          const x = PLANET.x - 150 + p * 300;
          const y = PLANET.y + 50 - Math.sin(p * Math.PI) * 6;
          const k = envelope(ev, 12, 1, 1);
          g.disc(x, y, 3, mix(hex('#0a0e16'), hex('#8a8a90'), 0.6 * k));
          g.px(x - 1, y - 1, mix(hex('#0a0e16'), hex('#e0e0e8'), k));
        }
        // Rare: a cargo hauler lifts off from a pad beyond the horizon.
        if (f.rare === 0 && ev < 12) {
          const k = envelope(ev, 12, 1, 2);
          const y = 100 - ev * ev * 0.7;
          g.glow(286, y, 6, warm, 0.6 * k);
          for (let i = 1; i < 14; i++) g.pxA(286 + Math.sin(i + ev) * 0.5, y + i * 1.5, hex('#9aa0a8'), 0.35 * k * (1 - i / 14));
        }

        // Greenhouse lights breathe a little.
        for (const h of HOUSES) g.glow((h.x0 + h.x1) / 2, h.base - h.h / 2, (h.x1 - h.x0) * 0.35, green, 0.03 + 0.02 * Math.sin(t * 0.4 + h.x0), 0);

        // ── misters: slow low-gravity arcs that sweep back and forth ──
        const surge = f.rare === 2 && ev < 12 ? envelope(ev, 12, 2, 2) : 0;
        for (let m = 0; m < MISTERS.length; m++) {
          const M = MISTERS[m]!;
          const sweep = Math.sin(t * 0.18 + M.ph) * (1 + surge * 0.4);
          const near = M.y > 120;
          const reach = (near ? 26 : 16) * (1 + surge * 0.5);
          const n = near ? 28 : 18;
          for (let i = 0; i < n; i++) {
            const q = (t * 0.12 + i / n) % 1;
            const side = i % 2 ? 1 : -1;
            const dx = side * q * reach * (0.6 + 0.4 * Math.abs(sweep)) + sweep * q * 6;
            const dy = -q * (1 - q) * 4 * reach * 0.7;
            const a = Math.sin(q * Math.PI) * (near ? 0.8 : 0.6) * (0.75 + surge * 0.25);
            g.pxA(M.x + dx, M.y - 5 + dy, mistC, a);
            g.pxA(M.x + dx + side * 0.6, M.y - 5 + dy + 1, greenL, a * 0.45);
          }
          if (surge > 0.2) g.glow(M.x, M.y - 10, reach * 0.8, greenL, 0.04 * surge);
        }

        // ── the porch: speaker cones and the mast light ──
        const S = SHACK;
        for (const cy of [S.y - 17, S.y - 6]) {
          g.disc(S.x1 + 4, cy, 3, mix(hex('#1a1818'), warm, 0.08 + hit * 0.15));
          g.px(S.x1 + 4, cy, mix(hex('#2a2620'), warm, 0.3));
        }
        const blink = 0.5 + 0.5 * Math.sin(t * 1.4);
        g.px(S.x0 + 4, S.y - 65, mix(hex('#3a0808'), hex('#ff4a3a'), blink));
        g.glow(S.x0 + 4, S.y - 65, 6, hex('#ff4a3a'), 0.2 * blink);
        g.glow(S.x0 + 12, S.y - 17, 10, warm, 0.08 * flicker(t, 3, 1.5));

        // Rare: Sister Meridian walks out to the big greenhouse with a watering can.
        if (f.rare === 3 && ev < 12) {
          const p = ev / 12;
          const x = S.x0 + 6 - p * 90;
          const step = f.reduced ? 0 : Math.sin(ev * 3);
          pose.lean = -0.08;
          pose.legL = step * 0.35;
          pose.legR = -step * 0.35;
          pose.armL = -0.2;
          pose.armR = 0.3;
          pose.bob = 0;
          pose.hair = 1;
          pose.skirt = true;
          figure(g, x, 136, 26, pose, ink);
          g.rect(x + 3, 125, 5, 4, ink);
          g.line(x + 8, 126, x + 11, 124, ink);
        }
        void (null as unknown as Color);
      },
    };
  },
};

export default def;

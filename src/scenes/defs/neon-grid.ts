// Neon 2087: the last of a striped sunset over an endless wireframe grid, hazy and violet.
// A car with far too many wheels drives toward the horizon, never arriving. The palm trees
// have elbows.

import { haze } from '../kit/atmos';
import { hex, mix, mute, ramp, shade } from '../kit/color';
import { envelope, stars, TAU } from '../kit/fx';
import { type Gfx, bayer, mulPx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const HZ = 80; // horizon
const VX = 160; // vanishing point x
const SUN = { x: 160, y: 62, r: 38 };
const CAR_Y = 112;
const CAR_BODY_O = [-34, 12, 34, 12, 32, -2, 22, -6, -22, -6, -32, -2];
const CAR_BODY = [-32, 10, 32, 10, 30, -1, 21, -4, -21, -4, -30, -1];
const CAB_O = [-20, -5, 20, -5, 14, -16, -14, -16];
const CAB = [-18, -6, 18, -6, 13, -15, -13, -15];

const def: SceneDef = {
  id: 'neon-grid',
  fps: 24,
  rareEvents: 4,
  rareDuration: 6,
  focusY: 86,
  grade: { contrast: 1.1, saturation: 0.78, bloom: 0.9, threshold: 0.58, vignette: 0.45, shadows: '#06020c' },
  create({ accent }) {
    const ink = hex('#06000e');
    const skyC = [hex('#04010c'), hex('#0e0420'), hex('#220a36'), hex('#4a1446'), hex('#8a3450')];
    const sunR = ramp([hex('#ecd290'), hex('#e09a5a'), hex('#c8546a'), mute(accent, 0.7, 0.8)], 12);
    const grid = mix(mute(accent, 0.75), hex('#5a2a7a'), 0.25);
    const cyan = hex('#3a9aaa');
    const mount = hex('#10031e');
    const palm = hex('#0c0218');
    const rim = mix(accent, palm, 0.78);
    const road = hex('#08000f');

    // Mountain tops per view column, so the sun can sit behind them.
    let mtTop = new Int16Array(0);
    let mtLeft = 0;

    // Perspective helpers: depth z (1 = near the bottom) → screen y.
    const yAt = (z: number) => HZ + 70 / z;

    const drawPalm = (g: Gfx, side: -1 | 1, z: number, wave: number) => {
      const y = yAt(z);
      if (y < HZ + 1) return;
      const s = Math.min(3, 1.1 / z);
      const roadHalf = (y - HZ) * 1.05;
      const x = VX + side * (roadHalf + 14 * s);
      const w = Math.max(1, Math.round(2.2 * s));
      // trunk: up and out, sharp elbow, then up and back in
      const ex = x + side * 10 * s;
      const ey = y - 22 * s;
      const tx = ex - side * 4 * s + wave * 6 * s;
      const ty = ey - 20 * s;
      const fade = Math.min(1, Math.max(0.15, (y - HZ - 4) / 40));
      const rimC = mix(palm, rim, fade);
      for (let pass = 0; pass < 2; pass++) {
        const c = pass === 0 ? rimC : palm;
        const ww = pass === 0 ? w + 2 : w;
        thickLine(g, x, y, ex, ey, ww, c);
        thickLine(g, ex, ey, tx, ty, ww, c);
        g.disc(ex, ey, ww * 0.6, c);
        // fronds
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.62 + wave * 0.4;
          const len = (13 + (i % 2) * 3) * s;
          const fx = tx + Math.cos(a) * len;
          const fy = ty + Math.sin(a) * len * 0.55 + len * 0.35;
          const mx = (tx + fx) / 2;
          const my = Math.min(ty, fy) - 2 * s;
          const fw = Math.max(1, w - 1) + (pass === 0 ? 2 : 0);
          thickLine(g, tx, ty, mx, my, fw, c);
          thickLine(g, mx, my, fx, fy, fw, c);
        }
      }
      // a rim of neon on the elbow side
      g.px(ex + side, ey, mix(grid, palm, 0.4));
    };

    return {
      background(g) {
        g.vgrad(skyC, g.top, HZ);
        stars(g, 0, g.left, g.top, g.right, 50, 0.25, hex('#c8a8d8'), 5, 0);
        g.glow(SUN.x, HZ - 6, 120, hex('#c84a7a'), 0.16, 6);
        g.glow(SUN.x, SUN.y, 56, hex('#e09a5a'), 0.12, 6);

        // Mountains with neon ridges.
        mtTop = new Int16Array(g.w).fill(HZ);
        mtLeft = g.left;
        const ridge = (x0: number, x1: number, seed: number, base: number, height: number) => {
          for (let x = x0; x < x1; x++) {
            const u = (x - x0) / (x1 - x0);
            const h = Math.abs(Math.sin(u * 7 + seed)) * height * Math.sin(u * Math.PI) + hash3(x >> 2, seed) * 3;
            const top = Math.round(base - h);
            if (x >= g.left && x < g.right) mtTop[x - g.left] = Math.min(mtTop[x - g.left]!, top);
            g.rect(x, top, 1, HZ - top, mount);
            g.px(x, top, mix(grid, mount, 0.55));
            if ((x - x0) % 9 === 0) g.rectD(x, top + 2, 1, HZ - top - 2, mix(grid, mount, 0.85), 0.5);
          }
        };
        ridge(g.left - 10, 128, 1.3, HZ, 26);
        ridge(192, g.right + 10, 4.1, HZ, 24);
        ridge(120, 200, 2.2, HZ, 6);

        // Ground: dark, vertical grid lines fanning from the vanishing point, the road.
        g.vgrad([hex('#0c0018'), hex('#05000c')], HZ, g.bottom, HZ);
        for (let k = -40; k <= 40; k++) {
          const slope = k * 0.12 * 9;
          for (let y = HZ; y < g.bottom; y++) {
            const x = VX + (slope * (y - HZ)) / 9;
            const kk = 0.25 + 0.75 * Math.min(1, (y - HZ) / 60);
            g.px(Math.round(x), y, mix(hex('#0c0018'), grid, kk * 0.42));
          }
        }
        for (let y = HZ; y < g.bottom; y++) {
          const hw = (y - HZ) * 1.05;
          // the road catches the last of the sunset near the horizon
          g.rect(VX - hw, y, hw * 2 + 1, 1, mix(road, hex('#3a1238'), Math.max(0, 1 - (y - HZ) / 60) * 0.8));
          const k = Math.min(1, (y - HZ) / 50);
          g.px(VX - hw, y, mix(road, cyan, 0.3 + 0.6 * k));
          g.px(VX + hw, y, mix(road, cyan, 0.3 + 0.6 * k));
        }
        g.rect(g.left, HZ, g.w, 1, mix(grid, hex('#f0d0e0'), 0.25));
        // Haze on the horizon swallows the far grid and the feet of the mountains.
        haze(g, hex('#3a1640'), HZ - 18, HZ, 0, 0.5, HZ - 18, HZ + 1);
        haze(g, hex('#3a1640'), HZ, HZ + 26, 0.55, 0, HZ, HZ + 26);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const speed = (0.35 + f.energy * 0.35) * (0.4 + 0.6 * f.awake);
        const travel = t * speed;

        // Twinkles and the odd shooting star.
        stars(g, t, g.left, g.top, g.right, 56, 0.06, hex('#ffffff'), 8);
        if (f.rare === 3 && ev < 2 && !f.reduced) {
          const p = ev / 1.4;
          const sx = 250 - p * 160;
          const sy = 12 + p * 30;
          for (let i = 0; i < 14; i++) g.pxAdd(sx + i * 2, sy - i * 0.4, hex('#fff0ff'), 1 - i / 14);
        }

        // The sun, with scrolling stripes.
        const scroll = (t * 3) % 8;
        const winking = f.rare === 2 && ev < 5;
        for (let dy = -SUN.r; dy <= SUN.r; dy++) {
          const y = SUN.y + dy;
          if (y >= HZ) break;
          if (dy > -6) {
            const band = (dy + 6 + scroll) % 8;
            const gap = 1 + (dy + 6) / 14;
            if (band < gap) continue;
          }
          const hw = Math.floor(Math.sqrt(SUN.r * SUN.r - dy * dy));
          const k = Math.min(11, Math.max(0, Math.floor(((dy + SUN.r) / (SUN.r * 2)) * 12)));
          const c = sunR[k]!;
          for (let x = SUN.x - hw; x <= SUN.x + hw; x++) if (y < (mtTop[x - mtLeft] ?? HZ)) g.px(x, y, c);
        }
        if (winking) {
          const k = envelope(ev, 5, 0.6, 0.6);
          if (k > 0.3) {
            g.rect(SUN.x - 16, SUN.y - 20, 6, 6, ink);
            if (ev > 2 && ev < 3.2) g.rect(SUN.x + 10, SUN.y - 17, 6, 2, ink);
            else g.rect(SUN.x + 10, SUN.y - 20, 6, 6, ink);
            g.rect(SUN.x - 12, SUN.y - 6, 24, 2, ink);
            g.rect(SUN.x - 14, SUN.y - 8, 2, 2, ink);
            g.rect(SUN.x + 12, SUN.y - 8, 2, 2, ink);
          }
        }
        g.glow(SUN.x, HZ - 2, 50, accent, 0.1 + f.energy * 0.25, 4);

        // Moving horizontal grid lines (perspective).
        const phase = travel % 1;
        for (let i = 0; i < 40; i++) {
          const z = (i + 1 - phase) * 0.55;
          const y = Math.round(yAt(z));
          if (y <= HZ + 1) break;
          if (y >= g.bottom) continue;
          const k = Math.min(1, (y - HZ) / 70);
          const c = mix(mix(hex('#2a0c3a'), hex('#3a1640'), 1 - k), grid, 0.15 + 0.55 * k);
          const hw = (y - HZ) * 1.05;
          g.rect(g.left, y, VX - hw - g.left, 1, c);
          g.rect(VX + hw + 1, y, g.right - (VX + hw + 1), 1, c);
          if (i % 2 === 0) g.rect(VX - 1, y, 2, Math.max(1, Math.round(k * 3)), mix(hex('#3a1640'), hex('#c8a860'), k));
        }
        // Glow along the horizon.
        g.rectAdd(g.left, HZ - 1, g.w, 3, grid, 0.12 + f.energy * 0.2);

        // Palm trees with elbows, approaching on both sides.
        for (let i = 4; i >= 0; i--) {
          const z = (((i - travel * 1.4) % 5) + 5) % 5 * 0.62 + 0.38;
          const wave = f.rare === 0 && ev < 6 && i === 0 ? Math.sin(ev * 5) * envelope(ev, 6, 1, 1) : Math.sin(t * 0.8 + i) * 0.05;
          drawPalm(g, -1, z, wave);
          drawPalm(g, 1, z + 0.25, -wave);
        }

        // The car (rear view) — with a row of far too many wheels.
        const bob = f.reduced ? 0 : Math.round(Math.sin(t * 9) * 0.6 + f.pulse * 1);
        const cx = VX;
        const cy = CAR_Y + bob;
        const extra = f.rare === 1 && ev < 6 ? ev > 1.2 : false;
        const wheels = extra ? 9 : 8;
        const ww = 7;
        const total = wheels * (ww + 1) - 1;
        const wx0 = cx - Math.floor(total / 2);
        g.ellipseA(cx, CAR_Y + 21, total / 2 + 8, 3, ink, 0.6);
        for (let i = 0; i < wheels; i++) {
          const x = wx0 + i * (ww + 1);
          roundRect(g, x, cy + 8, ww, 13, 2, ink);
          g.rect(x + 1, cy + 9, ww - 2, 11, hex('#1e1628'));
          g.rect(x + 1, cy + 9, ww - 2, 1, hex('#5a3a4a'));
          const spin = Math.floor(t * 18 + i) % 3;
          g.rect(x + 2, cy + 11 + spin * 2, ww - 4, 1, hex('#6a5a7a'));
          if (extra && i === wheels - 1 && ev < 2.2) g.glow(x + 3, cy + 14, 9, hex('#fff27a'), 1 - (ev - 1.2));
        }
        if (extra && ev < 3.5) g.text('+1', wx0 + total + 3, cy + 2 - Math.min(6, (ev - 1.2) * 6), hex('#fff27a'));
        // body
        g.poly(CAR_BODY_O, ink, 0, 1, cx, cy);
        g.poly(CAR_BODY, hex('#1a0c30'), 0, 1, cx, cy);
        g.hline(cx - 21, cx + 21, cy - 4, mix(hex('#1a0c30'), hex('#e09a5a'), 0.35));
        // cabin
        g.poly(CAB_O, ink, 0, 1, cx, cy);
        g.poly(CAB, hex('#0e0620'), 0, 1, cx, cy);
        g.hline(cx - 12, cx + 12, cy - 15, mix(hex('#0e0620'), hex('#e09a5a'), 0.5));
        g.line(cx - 10, cy - 14, cx - 4, cy - 7, shade(cyan, 0.6));
        g.line(cx - 6, cy - 14, cx, cy - 7, shade(cyan, 0.3));
        // spoiler
        g.rect(cx - 30, cy - 9, 60, 2, ink);
        g.rect(cx - 26, cy - 7, 2, 3, ink);
        g.rect(cx + 24, cy - 7, 2, 3, ink);
        // taillight bar, pulsing
        const tl = 0.6 + f.energy * 0.6 + f.pulse * 0.3;
        g.rect(cx - 30, cy + 1, 60, 3, mix(hex('#5a0a2a'), accent, Math.min(1, tl)));
        g.rect(cx - 30, cy + 1, 60, 1, mix(accent, hex('#ffffff'), 0.4));
        g.glow(cx - 24, cy + 2, 12, accent, 0.3 * tl);
        g.glow(cx + 24, cy + 2, 12, accent, 0.3 * tl);
        g.rect(cx - 7, cy + 5, 14, 5, hex('#8a8498'));
        g.text('2087', cx - 7, cy + 5, ink);
        // headlight spill on the road ahead
        g.tri(cx - 20, cy - 2, cx + 20, cy - 2, cx, HZ + 6, hex('#4f3a8a'), 2, 0.08);

        // Tail lights on the road behind.
        g.rectAdd(cx - 30, cy + 22, 60, 8, accent, 0.05 * tl);
        void mulPx;
        void bayer;
        void TAU;
      },
    };
  },
};

export default def;

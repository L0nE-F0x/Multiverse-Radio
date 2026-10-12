// Numbers Station Ω: a lone radio mast on a hill in thick night fog, one red light slowly
// blinking. A beam sweeps now and then. A fox sits at the bottom, listening intently.

import { hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope, stars } from '../kit/fx';
import { type Gfx, blendPx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';

// Between the HUD's bands: the beacon below the top one, the fox above the bottom one.
const MAST = { x: 160, base: 124, top: 34 };
const TEX_W = 512;

interface FogLayer {
  y0: number;
  h: number;
  speed: number;
  alpha: Uint8Array;
  k: number;
}

const hillY = (x: number) => MAST.base + 2 + ((x - MAST.x) / 120) ** 2 * 26 + Math.sin(x * 0.05) * 1.5;

const def: SceneDef = {
  id: 'foggy-antenna',
  fps: 12,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 8,
  grade: { temperature: -0.2, contrast: 1.12, saturation: 0.8, bloom: 0.8, threshold: 0.6, vignette: 0.5, shadows: '#03050a' },
  create({ accent }) {
    const ink = hex('#05070c');
    const sky = [hex('#05070f'), hex('#0b1020'), hex('#151c30'), hex('#1e2638')];
    const hill = hex('#080b12');
    const hillRim = hex('#1e2638');
    const steel = hex('#1a2030');
    const steelL = hex('#3a4458');
    const red = accent;
    const fogC = hex('#9aa6bc');
    const fox = hex('#9a5428');
    const foxD = hex('#4e2410');
    const cream = hex('#c8bcaa');

    // Pre-baked fog textures (tile horizontally).
    const mkLayer = (y0: number, h: number, speed: number, seed: number, k: number): FogLayer => {
      const alpha = new Uint8Array(TEX_W * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < TEX_W; x++) {
          // tileable: blend two samples
          const u = x / TEX_W;
          const n = fbm(x / 40, y / 12, seed, 4) * (1 - u) + fbm((x - TEX_W) / 40, y / 12, seed, 4) * u;
          const edge = Math.sin((y / h) * Math.PI);
          alpha[y * TEX_W + x] = Math.round(clamp((n - 0.38) * 2.2) * edge * 255);
        }
      return { y0, h, speed, alpha, k };
    };
    const layers = [mkLayer(58, 50, 2.2, 3, 0.45), mkLayer(92, 46, -3.4, 7, 0.55), mkLayer(118, 70, 4.5, 11, 0.7)];

    const drawFog = (g: Gfx, L: FogLayer, t: number, boost: number) => {
      const b = g.buf;
      const off = Math.floor(((t * L.speed) % TEX_W) + TEX_W);
      for (let row = 0; row < L.h; row++) {
        const by = L.y0 + row - g.oy;
        if (by < 0 || by >= g.h) continue;
        const r0 = row * TEX_W;
        const brow = by * g.w;
        for (let bx = 0; bx < g.w; bx++) {
          const a = L.alpha[r0 + ((bx + g.ox + off) & (TEX_W - 1))]!;
          if (a < 8) continue;
          b[brow + bx] = blendPx(b[brow + bx]!, fogC, (a / 255) * L.k * boost);
        }
      }
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, 150);
        stars(g, 0, g.left, g.top, g.right, 70, 0.25, hex('#c8d0e8'), 8, 0);
        g.glow(70, 40, 30, hex('#c8d0e8'), 0.12, 5);
        // Distant ridge, then the hill.
        for (let x = g.left; x < g.right; x++) {
          const ry = 116 + Math.sin(x * 0.02 + 1) * 6 + fbm(x / 30, 0, 4, 3) * 8;
          g.rect(x, ry, 1, g.bottom - ry, hex('#0e131e'));
        }
        // a cottage far off on the ridge (window lit only in a rare moment)
        g.rect(258, 110, 10, 7, hex('#0a0e16'));
        g.tri(256, 110, 270, 110, 263, 104, hex('#0a0e16'));
        for (let x = g.left; x < g.right; x++) {
          const y = Math.round(hillY(x));
          g.rect(x, y, 1, g.bottom - y, hill);
          g.px(x, y, hillRim);
        }
        // Tufts of grass on the hill crest.
        for (let i = 0; i < 40; i++) {
          const x = 90 + hash3(i, 1) * 140;
          const y = hillY(x);
          g.vline(x, y - 2 - (i % 3), y, hillRim);
        }

        // The mast: a tapering lattice with cross-bracing.
        const { x, base, top } = MAST;
        const halfAt = (y: number) => 1.5 + ((y - top) / (base - top)) * 7;
        for (const s of [-1, 1]) g.line(x + s * halfAt(top), top, x + s * halfAt(base), base, steelL);
        for (let y = top + 4; y < base; y += 8) {
          const a = halfAt(y);
          const b2 = halfAt(y + 8);
          g.line(x - a, y, x + b2, y + 8, steel);
          g.line(x + a, y, x - b2, y + 8, steel);
          g.hline(x - a, x + a, y, steelL);
        }
        // dishes and panels
        g.rect(x + 3, 52, 3, 8, steelL);
        g.ellipse(x - 6, 74, 3, 4, steelL);
        g.ellipse(x - 6, 74, 2, 3, steel);
        g.vline(x, top - 10, top, steelL);
        // guy wires
        for (const s of [-1, 1]) {
          g.lineA(x + s * 2, 50, x + s * 96, hillY(x + s * 96), steelL, 0.6);
          g.lineA(x + s * 4, 92, x + s * 64, hillY(x + s * 64), steelL, 0.6);
        }
        // a little hut at the base
        g.rect(x - 22, base - 8, 14, 9, hex('#121826'));
        g.rect(x - 23, base - 9, 16, 2, steelL);
        g.rect(x - 18, base - 5, 3, 3, hex('#2a3448'));
        g.lighting(0.55);
        g.light(x, top, 60, 0.4);
        g.light(188, base - 10, 40, 0.2);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // A distant window lights up (rare), as though somebody else is listening too.
        if (f.rare === 3 && ev < 8) {
          const k = envelope(ev, 8, 1.5, 2);
          g.rect(262, 112, 2, 2, mix(hex('#0a0e16'), hex('#ffd08a'), k));
          g.glow(263, 113, 6, hex('#ffd08a'), k * 0.4);
        }

        // Geese, in formation, owed to someone.
        if (f.rare === 0 && ev < 8) {
          const p = ev / 8;
          const gx = -30 + p * 390;
          const gy = 46 - p * 10;
          for (let i = 0; i < 7; i++) {
            const side = i % 2 ? 1 : -1;
            const rank = Math.ceil(i / 2);
            const x = gx - rank * 9;
            const y = gy + side * rank * 5;
            const flap = Math.sin(t * 8 + i) > 0 ? -1 : 1;
            g.px(x, y, hex('#c8d0e0'));
            g.px(x - 1, y + flap, hex('#c8d0e0'));
            g.px(x + 1, y + flap, hex('#c8d0e0'));
            g.px(x + 2, y, hex('#c8d0e0'));
          }
          if (ev > 2 && ev < 3.4) g.text('HONK', gx - 4, gy - 12, hex('#c8d0e0'));
        }

        // The sweeping beam: every so often it turns once around.
        const cyc = 14;
        const ph = (t % cyc) / cyc;
        if (ph < 0.45) {
          const a = Math.PI * (1.05 + (ph / 0.45) * 0.9);
          const len = 340;
          const ex = MAST.x + Math.cos(a) * len;
          const ey = MAST.top + 6 + Math.sin(a) * len * -0.12 + 40;
          const k = Math.sin((ph / 0.45) * Math.PI) * (f.reduced ? 0.04 : 0.09);
          g.tri(MAST.x, MAST.top + 6, ex, ey - 16, ex, ey + 16, hex('#fff4d8'), 2, k);
        }

        // Fog bands drift past (the nearest is thickest).
        drawFog(g, layers[0]!, t, 1);
        drawFog(g, layers[1]!, t, 1);

        // The red light, slow and steady — or counting, during a rare moment.
        let on = (t % 3) < 1.2 ? 1 - ((t % 3) / 1.2) ** 2 : 0;
        if (f.rare === 2 && ev < 8) {
          const seq = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
          on = 0;
          for (const s of seq) if (ev > s && ev < s + 0.25) on = 1;
          const shown = ev < 3.2 ? '7' : ev < 6.6 ? '7 7' : '7 7 4';
          g.text(shown, MAST.x + 8, MAST.top - 6, mix(red, hex('#ffffff'), 0.3));
        }
        if (f.reduced) on = 0.5 + 0.2 * Math.sin(t);
        g.rect(MAST.x - 1, MAST.top - 2, 3, 3, mix(shade(red, 0.3), red, on));
        g.glow(MAST.x, MAST.top - 1, 12 + on * 14, red, 0.15 + 0.6 * on, 4);
        // a smaller light halfway down, out of phase
        const on2 = ((t + 1.5) % 3) < 1 ? 1 : 0.2;
        g.px(MAST.x, 80, mix(shade(red, 0.3), red, on2));
        g.glow(MAST.x, 80, 6, red, 0.3 * on2);

        // ── the fox ──
        const fx = 188;
        const fy = Math.round(hillY(fx)) - 1;
        const tilt = f.rare === 1 && ev < 8 ? envelope(ev, 8, 0.6, 0.8) : 0;
        const earFlick = (f.rare === 2 && ev < 8 && on > 0.5) || blinking(t, 61, 4) ? 1 : 0;
        const swish = Math.sin(t * 0.7) * 2;
        // tail curled around the front
        for (let i = 0; i < 18; i++) {
          const tx = fx + 9 - i + Math.round(i > 13 ? swish * 0.6 : 0);
          const ty = fy - 1 - Math.round(Math.sin((i / 17) * Math.PI) * 3);
          g.rect(tx, ty - 3, 2, 4, ink);
          g.rect(tx, ty - 2, 2, 3, i > 13 ? cream : fox);
        }
        // body (sitting, facing the mast)
        g.ellipse(fx + 3, fy - 10, 8, 10, ink);
        g.ellipse(fx + 3, fy - 10, 7, 9, fox);
        g.ellipse(fx + 5, fy - 12, 3, 5, mix(fox, hex('#ffb070'), 0.4));
        g.ellipse(fx - 1, fy - 10, 3, 6, cream);
        g.rect(fx - 2, fy - 4, 3, 4, foxD);
        g.rect(fx + 3, fy - 4, 3, 4, foxD);
        // head, looking up at the mast
        const ti = Math.round(tilt * 2);
        const hx = fx - 3;
        const hy = fy - 22 - ti;
        g.ellipse(hx, hy, 6, 5, ink);
        g.ellipse(hx, hy, 5, 4, fox);
        g.tri(hx - 5, hy - 1, hx - 13 - ti, hy + 2 - ti, hx - 4, hy + 4, ink);
        g.tri(hx - 5, hy, hx - 12 - ti, hy + 2 - ti, hx - 4, hy + 3, fox);
        g.tri(hx - 6, hy + 2, hx - 12 - ti, hy + 2 - ti, hx - 4, hy + 4, cream);
        g.px(hx - 13 - ti, hy + 1 - ti, ink);
        // ears perked, one flicking
        g.tri(hx - 4, hy - 3, hx, hy - 4, hx - 3 - earFlick, hy - 13 + earFlick * 2, ink);
        g.tri(hx - 3, hy - 3, hx - 1, hy - 4, hx - 3 - earFlick, hy - 11 + earFlick * 2, fox);
        g.tri(hx + 1, hy - 4, hx + 5, hy - 3, hx + 3, hy - 12, ink);
        g.tri(hx + 2, hy - 4, hx + 4, hy - 3, hx + 3, hy - 10, foxD);
        // eye catching the red light
        g.rect(hx - 3, hy - 1, 2, 2, ink);
        if (on > 0.4) g.px(hx - 3, hy - 1, mix(red, hex('#ffffff'), 0.5));

        // The nearest fog drifts in front of everything.
        drawFog(g, layers[2]!, t, 1);
      },
    };
  },
};

export default def;

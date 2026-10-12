// Deep Space Whalesong: enormous translucent whales drift through a soft nebula.
// Once in a long while, one of them turns an eye toward you and blinks.

import { type Color, blue, green, hex, mix, red, rgb } from '../kit/color';
import { clamp, envelope, smoothstep, stars, TAU } from '../kit/fx';
import { type Gfx, bayer, blendPx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';

interface Whale {
  len: number;
  half: number;
  speed: number;
  y: number;
  dir: -1 | 1;
  offset: number;
  alpha: number;
  light: Color;
  dark: Color;
  rim: Color;
  phase: number;
}

const def: SceneDef = {
  id: 'space-whales',
  fps: 15,
  focusY: 92,
  rareEvents: 4,
  rareDuration: 9,
  create({ accent }) {
    const deep = hex('#04060f');
    const purple = hex('#2a1650');
    const teal = hex('#0b3550');
    const glowC = accent;
    const pink = hex('#c86ab8');

    const whales: Whale[] = [
      { len: 104, half: 11, speed: 1.4, y: 44, dir: 1, offset: 330, alpha: 0.34, light: hex('#9ab8ff'), dark: hex('#2a3a7a'), rim: hex('#c8d8ff'), phase: 2 },
      { len: 196, half: 25, speed: 2.1, y: 98, dir: -1, offset: 290, alpha: 0.55, light: mix(accent, hex('#ffffff'), 0.35), dark: hex('#163a6a'), rim: hex('#e0f6ff'), phase: 0 },
      { len: 72, half: 9, speed: 2.1, y: 138, dir: -1, offset: 262, alpha: 0.6, light: hex('#b8f0ff'), dark: hex('#1e4a7a'), rim: hex('#f0fcff'), phase: 1.3 },
    ];
    const SPAN = 700;

    const headX = (w: Whale, t: number) => {
      const p = ((t * w.speed + w.offset) % SPAN + SPAN) % SPAN;
      return w.dir < 0 ? 400 - p : -260 + p;
    };

    // Body outline along its length (0 = nose, 1 = tail tip): flat back, deep throat,
    // narrow tail stock.
    const topAt = (u: number) => {
      const nose = Math.sqrt(Math.min(1, u / 0.07));
      return nose * (0.62 + 0.18 * Math.sin(Math.min(1, u / 0.4) * Math.PI * 0.5)) * (1 - smoothstep(0.38, 0.88, u) * 0.78);
    };
    const botAt = (u: number) => {
      const nose = Math.sqrt(Math.min(1, u / 0.1));
      const throat = u < 0.45 ? 0.22 * Math.sin((u / 0.45) * Math.PI) : 0;
      return nose * (0.9 + throat) * (1 - smoothstep(0.32, 0.88, u) * 0.82);
    };

    const drawWhale = (g: Gfx, w: Whale, t: number, f: { eye: number; blink: boolean; energy: number }) => {
      const hx = headX(w, t);
      const L = w.len;
      const amp = w.half * 0.35;
      const ph = t * 0.7 + w.phase;
      const x0 = Math.floor(w.dir < 0 ? hx : hx - L);
      const x1 = Math.ceil(w.dir < 0 ? hx + L : hx);
      if (x1 < g.left || x0 > g.right) return;
      const b = g.buf;
      for (let sx = Math.max(x0, g.left); sx <= Math.min(x1, g.right - 1); sx++) {
        const u = w.dir < 0 ? (sx - hx) / L : (hx - sx) / L;
        if (u < 0 || u > 1) continue;
        const cy = w.y + Math.sin(ph - u * 3.2) * amp * u * u + Math.sin(ph * 0.5) * 2;
        const bx = sx - g.ox;
        if (u < 0.88) {
          let top = cy - w.half * topAt(u);
          const bot = cy + w.half * botAt(u);
          // small dorsal fin
          if (u > 0.58 && u < 0.68) top -= w.half * 0.28 * Math.sin(((u - 0.58) / 0.1) * Math.PI) * (u < 0.64 ? (u - 0.58) / 0.06 : 1);
          const yt = Math.round(top);
          const yb = Math.round(bot);
          for (let sy = yt; sy <= yb; sy++) {
            const by = sy - g.oy;
            if (by < 0 || by >= g.h) continue;
            const v = (sy - top) / Math.max(1, bot - top);
            const edge = Math.min(sy - yt, yb - sy);
            let a = w.alpha * (edge < 1 ? 1.5 : edge < 2 ? 1.1 : 0.75);
            let c = mix(w.light, w.dark, Math.min(1, v * 1.2));
            if (edge < 1) c = w.rim;
            // throat grooves and the mouth line
            if (u > 0.06 && u < 0.42 && v > 0.66 && (sy & 1) === 0) c = mix(c, w.dark, 0.5);
            if (u < 0.24 && Math.abs(sy - (cy + w.half * (0.18 + u * 0.4))) < 0.6) c = w.dark;
            // speckles
            if (hash3(sx, sy, 3) > 0.985) {
              c = w.rim;
              a = Math.min(1, a + 0.2);
            }
            if (a >= 1) b[by * g.w + bx] = c;
            else b[by * g.w + bx] = blendPx(b[by * g.w + bx]!, c, a > bayer(sx, sy) * 0.15 + a * 0.85 ? a : a * 0.9);
          }
        } else {
          // flukes: a sideways V
          const k = (u - 0.88) / 0.12;
          const spread = w.half * 0.95 * Math.sqrt(k);
          const thick = Math.max(1, (1 - k * 0.7) * w.half * 0.4);
          const flap = Math.sin(ph - 3) * w.half * 0.25;
          for (const sgn of [-1, 1]) {
            const yc = cy + sgn * spread + flap * k;
            for (let sy = Math.round(yc - thick / 2); sy <= Math.round(yc + thick / 2); sy++) {
              const by = sy - g.oy;
              if (by < 0 || by >= g.h) continue;
              b[by * g.w + bx] = blendPx(b[by * g.w + bx]!, sgn < 0 ? w.light : w.dark, w.alpha);
            }
          }
          const sb = Math.round(cy) - g.oy;
          if (sb >= 0 && sb < g.h) b[sb * g.w + bx] = blendPx(b[sb * g.w + bx]!, w.light, w.alpha);
        }
      }
      // Pectoral fin, slowly sculling.
      const fu = 0.3;
      const fx = w.dir < 0 ? hx + fu * L : hx - fu * L;
      const fcy = w.y + w.half * 0.85;
      const sw = Math.sin(t * 0.9 + w.phase) * w.half * 0.3;
      const tipx = fx - w.dir * w.half * 2.2;
      const tipy = fcy + w.half * 1.1 + sw;
      g.tri(fx - 3, fcy, fx + 3, fcy, tipx, tipy, w.light, 1, w.alpha * 0.8);
      g.lineA(fx + w.dir * 3, fcy, tipx, tipy, w.rim, w.alpha);
      // Bioluminescent spots along the flank pulse with the music.
      for (let i = 0; i < 6; i++) {
        const u = 0.18 + i * 0.09;
        const sx = w.dir < 0 ? hx + u * L : hx - u * L;
        const cy = w.y + Math.sin(ph - u * 3.2) * amp * u * u + Math.sin(ph * 0.5) * 2;
        const pulse = 0.25 + 0.25 * Math.sin(t * 1.3 - i * 0.7) + f.energy * 0.4;
        g.glow(sx, cy + w.half * 0.15, 3 + w.half * 0.12, glowC, pulse * w.alpha);
      }
      // Eye.
      const eu = 0.2;
      const ex = Math.round(w.dir < 0 ? hx + eu * L : hx - eu * L);
      const ey = Math.round(w.y + w.half * 0.2 + Math.sin(ph * 0.5) * 2);
      if (f.eye > 0) {
        const r = Math.round(1 + f.eye * Math.max(2, w.half * 0.22));
        if (f.blink) g.hline(ex - r, ex + r, ey, hex('#0a1430'));
        else {
          g.disc(ex, ey, r, hex('#f0faff'));
          g.disc(ex, ey + 1, Math.max(1, r - 1), hex('#0a1430'));
          g.px(ex - 1, ey - 1, hex('#ffffff'));
        }
        g.glow(ex, ey, r * 4, glowC, f.eye * 0.3);
      } else {
        g.rect(ex - 1, ey, 2, 2, hex('#0a1430'));
        g.px(ex - (w.dir < 0 ? 1 : 0), ey, w.rim);
      }
    };

    // School of tiny comets (rare event).
    const comets = Array.from({ length: 9 }, (_, i) => ({ dx: (i % 3) * 8 + Math.floor(i / 3) * 4, dy: Math.floor(i / 3) * 5 - 5 }));

    return {
      background(g) {
        // Nebula: soft clouds in purple and teal, quantized with ordered dithering.
        const q = 14;
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n1 = clamp((fbm(x / 80, y / 55, 3, 4) - 0.38) * 2.4);
            const n2 = clamp((fbm(x / 50 + 10, y / 70 - 4, 9, 4) - 0.42) * 2.4);
            const hl = clamp((fbm(x / 28, y / 28, 21, 3) - 0.5) * 3) * n1;
            const r = red(deep) + red(purple) * n1 * 0.9 + red(teal) * n2 * 0.5 + red(pink) * hl * 0.35;
            const gg = green(deep) + green(purple) * n1 * 0.9 + green(teal) * n2 * 0.9 + green(accent) * hl * 0.12;
            const b = blue(deep) + blue(purple) * n1 * 0.9 + blue(teal) * n2 * 0.9 + blue(pink) * hl * 0.3;
            const d = bayer(x, y) * q;
            g.px(x, y, rgb(Math.floor((r + d) / q) * q, Math.floor((gg + d) / q) * q, Math.floor((b + d) / q) * q));
          }
        stars(g, 0, g.left, g.top, g.right, g.bottom, 0.55, hex('#cfe0ff'), 2, 0);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        stars(g, t, g.left, g.top, g.right, g.bottom, 0.1, hex('#ffffff'), 7, 0.7);

        // A distant spiral galaxy, turning very slowly.
        const gx = 268;
        const gy = 34;
        const rot = t * 0.03;
        g.glow(gx, gy, 9, hex('#ffe8c8'), 0.5);
        for (let arm = 0; arm < 2; arm++)
          for (let i = 0; i < 28; i++) {
            const r = 1.5 + i * 0.55;
            const a = rot + arm * Math.PI + i * 0.32;
            g.pxAdd(gx + Math.cos(a) * r, gy + Math.sin(a) * r * 0.45, hex('#c8b8ff'), 0.6 - i * 0.018);
          }

        // Pick the whale nearest the middle for "look at the camera" moments.
        let star = 1;
        let best = Infinity;
        for (let i = 0; i < whales.length; i++) {
          const w = whales[i]!;
          const mid = headX(w, t) - (w.dir * w.len) / 2;
          const d = Math.abs(mid - 160) + (i === 0 ? 60 : 0);
          if (d < best) {
            best = d;
            star = i;
          }
        }
        const looking = f.rare === 0 && ev < 9 ? envelope(ev, 9, 1.5, 1.5) : 0;
        const blink = looking > 0.8 && ev > 4 && ev < 4.5;

        for (let i = 0; i < whales.length; i++) {
          const w = whales[i]!;
          drawWhale(g, w, t, { eye: i === star ? looking : 0, blink: i === star && blink, energy: f.energy });
        }

        // Blowhole puff of stardust.
        if (f.rare === 1 && ev < 6) {
          const w = whales[star]!;
          const hx = headX(w, t);
          const bx = hx - w.dir * w.len * 0.2;
          const by = w.y - w.half * 0.8;
          for (let i = 0; i < 24; i++) {
            const p = clamp(ev / 3 - hash3(i, 1) * 0.3);
            if (p <= 0 || p >= 1) continue;
            const a = -Math.PI / 2 + (hash3(i, 2) - 0.5) * 1.6;
            const r = p * (18 + hash3(i, 3) * 14);
            g.pxAdd(bx + Math.cos(a) * r, by + Math.sin(a) * r + p * p * 8, hex('#e8f8ff'), 1 - p);
          }
        }

        // A school of tiny comets swims past.
        if (f.rare === 2 && ev < 9) {
          const p = ev / 9;
          const sx = -30 + p * 380;
          const sy = 150 - p * 40 + Math.sin(p * TAU * 2) * 6;
          for (const c of comets) {
            const x = sx - c.dx;
            const y = sy + c.dy + Math.sin(t * 4 + c.dx) * 1;
            g.pxAdd(x, y, hex('#ffffff'), 1);
            for (let k = 1; k < 6; k++) g.pxAdd(x - k, y + k * 0.1, glowC, 0.6 - k * 0.1);
          }
        }

        // Whalesong: slow rings rolling out from the nearest whale's head.
        if (f.rare === 3 && ev < 9) {
          const w = whales[star]!;
          const hx = headX(w, t);
          for (let i = 0; i < 3; i++) {
            const r = (ev - i * 1.5) * 14;
            if (r <= 0 || r > 110) continue;
            const a = (1 - r / 110) * 0.5;
            for (let k = 0; k < 64; k++) {
              const ang = (k / 64) * TAU;
              g.pxAdd(hx + Math.cos(ang) * r, w.y + Math.sin(ang) * r * 0.6, glowC, a);
            }
          }
        }
      },
    };
  },
};

export default def;

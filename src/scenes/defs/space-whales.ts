// Deep Space Whalesong: enormous translucent whales drift through a dark nebula. Their bodies
// follow the curve of the path they swim (no rigid sprites), the tail flexes up and down,
// and lights along their flanks pulse with the music. Once in a long while one of them turns
// an eye toward you and blinks.

import { Fog, haze } from '../kit/atmos';
import { type Color, blue, green, hex, mix, red, rgb } from '../kit/color';
import { clamp, envelope, stars, TAU } from '../kit/fx';
import { type Gfx, bayer, blendPx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';

interface Whale {
  len: number;
  half: number;
  speed: number;
  /** Mean depth of the swim path, and how far it climbs and dives. */
  y: number;
  dive: number;
  dir: -1 | 1;
  offset: number;
  alpha: number;
  light: Color;
  dark: Color;
  rim: Color;
  phase: number;
  /** 0 near … 1 far (haze). */
  far: number;
}

const SPAN = 760;

const def: SceneDef = {
  id: 'space-whales',
  fps: 15,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 9,
  grade: { contrast: 1.1, saturation: 0.82, shadows: '#04060c', highlights: '#eef6ff', bloom: 0.8, threshold: 0.62, vignette: 0.34, temperature: -0.2 },
  create({ accent }) {
    const deep = hex('#03050b');
    const indigo = hex('#1a1638');
    const teal = hex('#0c2c3c');
    const dust = hex('#6a4a5a');
    const glowC = accent;
    const hazeC = hex('#0e1a2c');

    const whales: Whale[] = [
      { len: 92, half: 9, speed: 1.6, y: 44, dive: 6, dir: 1, offset: 120, alpha: 0.3, light: hex('#8098b8'), dark: hex('#1e2a48'), rim: hex('#b8c8e0'), phase: 2, far: 0.7 },
      { len: 210, half: 26, speed: 2.2, y: 90, dive: 10, dir: -1, offset: 330, alpha: 0.62, light: mix(accent, hex('#c8d8e8'), 0.6), dark: hex('#14284a'), rim: hex('#dceef8'), phase: 0, far: 0 },
      // Phased against the big one so that one of them is always crossing the middle.
      { len: 130, half: 16, speed: 2.2, y: 72, dive: 8, dir: 1, offset: 105, alpha: 0.5, light: hex('#9ab8d0'), dark: hex('#1a3050'), rim: hex('#cfe4f0'), phase: 1.3, far: 0.3 },
    ];

    const headX = (w: Whale, t: number) => {
      const p = (((t * w.speed + w.offset) % SPAN) + SPAN) % SPAN;
      return w.dir < 0 ? 440 - p : -120 - (SPAN - 560) + p;
    };
    /** The swim path: a slow climb and dive along x. */
    const pathY = (w: Whale, x: number, t: number) => w.y + Math.sin(x * 0.012 + w.phase * 2) * w.dive + Math.sin(t * 0.15 + w.phase) * 2;

    // Body profile along its length (0 = rostrum, 0.9 = tail stock): a continuous taper,
    // deepest a third of the way back, with a pleated throat that sags a little.
    const girth = (u: number) => {
      const k = clamp(u / 0.9);
      return Math.pow(Math.sin(Math.PI * Math.pow(k, 0.62)), 0.85) * (1 - 0.82 * smooth(0.55, 1, k)) + 0.12 * smooth(0.7, 1, k);
    };
    const topAt = (u: number) => 0.7 * girth(u);
    const botAt = (u: number) => (0.95 + (u < 0.5 ? 0.18 * Math.sin((u / 0.5) * Math.PI) : 0)) * girth(u);

    const drawWhale = (g: Gfx, w: Whale, t: number, eyeOpen: number, blink: boolean, energy: number) => {
      const hx = headX(w, t);
      const L = w.len;
      const x0 = Math.floor(w.dir < 0 ? hx : hx - L * 1.12);
      const x1 = Math.ceil(w.dir < 0 ? hx + L * 1.12 : hx);
      if (x1 < g.left - 4 || x0 > g.right + 4) return;
      const ph = t * 0.55 + w.phase;
      // Spine: follow the path the head has swum, plus an up-down wave that grows toward the tail.
      const spine = (u: number) => {
        const sx = hx - w.dir * u * L;
        return pathY(w, sx, t) + Math.sin(ph - u * 2.6) * w.half * 0.55 * u * u;
      };
      const b = g.buf;
      const lightC = mix(w.light, hazeC, w.far * 0.5);
      const darkC = mix(w.dark, hazeC, w.far * 0.5);
      for (let sx = Math.max(x0, g.left); sx <= Math.min(x1, g.right - 1); sx++) {
        const u = w.dir < 0 ? (sx - hx) / L : (hx - sx) / L;
        if (u < 0 || u > 0.9) continue;
        const cy = spine(u);
        let top = cy - w.half * topAt(u);
        const bot = cy + w.half * botAt(u);
        // a low dorsal hump
        if (u > 0.6 && u < 0.7) top -= w.half * 0.22 * Math.sin(((u - 0.6) / 0.1) * Math.PI);
        const yt = Math.round(top);
        const yb = Math.round(bot);
        const bx = sx - g.ox;
        for (let sy = yt; sy <= yb; sy++) {
          const by = sy - g.oy;
          if (by < 0 || by >= g.h) continue;
          const v = (sy - top) / Math.max(1, bot - top);
          const edge = Math.min(sy - yt, yb - sy);
          // Lit from above: pale back, deep belly; the outline glows faintly (translucency).
          let c = mix(lightC, darkC, Math.min(1, v * 1.15));
          let a = w.alpha * (edge < 1 ? 1.25 : edge < 3 ? 0.9 : 0.7);
          if (edge < 1 && v < 0.5) c = w.rim;
          // ventral pleats and the long mouth line
          if (u > 0.05 && u < 0.45 && v > 0.62 && ((sy + Math.round(u * 40)) & 1) === 0) c = mix(c, darkC, 0.55);
          if (u < 0.26 && Math.abs(sy - (cy + w.half * (0.12 + u * 0.5))) < 0.6) c = darkC;
          if (hash3(sx, sy, 3) > 0.986) {
            c = w.rim;
            a = Math.min(1, a + 0.15);
          }
          const i = by * g.w + bx;
          b[i] = blendPx(b[i]!, c, a > bayer(sx, sy) * 0.2 + 0.1 ? a : a * 0.85);
        }
      }
      // Flukes: horizontal, seen edge-on, pitching with the tail's stroke.
      const us = 0.9;
      const tx = hx - w.dir * us * L;
      const ty = spine(us);
      const slope = (spine(0.94) - spine(0.86)) / (0.08 * L);
      const ang = Math.atan(slope);
      const back = L * 0.15;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const spread = w.half * 0.95;
      // Two lobes, swept back, the near one lower; they pitch with the tail.
      const ux = -w.dir * ca;
      const uy = -sa;
      const upX = tx + ux * back + uy * spread * 0.55 * w.dir * 0;
      const upY = ty + uy * back - spread * 0.55 * ca;
      const loX = tx + ux * back * 1.05;
      const loY = ty + uy * back * 1.05 + spread * 0.7 * ca;
      const notchX = tx + ux * back * 0.7;
      const notchY = ty + uy * back * 0.7;
      const fl = mix(lightC, darkC, 0.35);
      g.tri(tx, ty - 1, upX, upY, notchX, notchY, fl, 1, w.alpha);
      g.tri(tx, ty + 1, notchX, notchY, loX, loY, mix(lightC, darkC, 0.7), 1, w.alpha);
      g.lineA(tx, ty - 1, upX, upY, w.rim, w.alpha * 0.8);
      // Long pectoral fin (a humpback's), slowly sculling.
      const fu = 0.3;
      const fx = hx - w.dir * fu * L;
      const fcy = spine(fu) + w.half * 0.6;
      const sw = Math.sin(t * 0.7 + w.phase) * w.half * 0.35;
      const tipFx = fx - w.dir * w.half * 2.4;
      const tipFy = fcy + w.half * 1.1 + sw;
      const bw = Math.max(3, w.half * 0.35);
      g.tri(fx - bw, fcy - 1, fx + bw, fcy, tipFx, tipFy, lightC, 1, w.alpha * 0.8);
      g.tri(fx, fcy, tipFx - w.dir * bw * 0.6, (fcy + tipFy) / 2 + 1, tipFx, tipFy, mix(lightC, darkC, 0.5), 1, w.alpha * 0.6);
      g.lineA(fx - w.dir * bw, fcy, tipFx, tipFy, w.rim, w.alpha * 0.9);
      // Bioluminescent spots along the flank pulse with the music.
      for (let i = 0; i < 7; i++) {
        const u = 0.16 + i * 0.085;
        const sx = hx - w.dir * u * L;
        const pulse = 0.2 + 0.2 * Math.sin(t * 1.1 - i * 0.7) + energy * 0.35;
        g.glow(sx, spine(u) + w.half * 0.12, 2 + w.half * 0.1, glowC, pulse * w.alpha * (1 - w.far * 0.5));
      }
      // Eye.
      const eu = 0.2;
      const ex = Math.round(hx - w.dir * eu * L);
      const ey = Math.round(spine(eu) + w.half * 0.22);
      const eyeC = hex('#08101e');
      if (eyeOpen > 0) {
        const r = Math.round(1 + eyeOpen * Math.max(2, w.half * 0.2));
        if (blink) g.hline(ex - r, ex + r, ey, eyeC);
        else {
          g.disc(ex, ey, r, hex('#e8f4ff'));
          g.disc(ex - w.dir, ey + 1, Math.max(1, r - 1), eyeC);
          g.px(ex - 1, ey - 1, hex('#ffffff'));
        }
        g.glow(ex, ey, r * 4, glowC, eyeOpen * 0.25);
      } else {
        g.rect(ex - 1, ey, 2, 1, eyeC);
      }
    };

    const comets = Array.from({ length: 9 }, (_, i) => ({ dx: (i % 3) * 8 + Math.floor(i / 3) * 4, dy: Math.floor(i / 3) * 5 - 5 }));
    const veil = new Fog({ scale: 64, squash: 0.5, patchy: 0.6, seed: 4 });

    return {
      background(g) {
        // Nebula: dark, dusty clouds, a faint dust lane, quantized with ordered dithering.
        const q = 10;
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n1 = clamp((fbm(x / 90, y / 60, 3, 4) - 0.4) * 2.2);
            const n2 = clamp((fbm(x / 55 + 10, y / 75 - 4, 9, 4) - 0.44) * 2.2);
            const lane = Math.exp(-(((y - 150 + x * 0.32) / 34) ** 2));
            const hl = clamp((fbm(x / 26, y / 26, 21, 3) - 0.52) * 3) * n1;
            const r = red(deep) + red(indigo) * n1 * 0.8 + red(teal) * n2 * 0.5 + red(dust) * (hl * 0.35 + lane * 0.18);
            const gg = green(deep) + green(indigo) * n1 * 0.8 + green(teal) * n2 * 0.85 + green(dust) * (hl * 0.25 + lane * 0.14);
            const b = blue(deep) + blue(indigo) * n1 * 0.85 + blue(teal) * n2 * 0.85 + blue(dust) * (hl * 0.3 + lane * 0.2);
            const d = bayer(x, y) * q;
            g.px(x, y, rgb(Math.floor((r + d) / q) * q, Math.floor((gg + d) / q) * q, Math.floor((b + d) / q) * q));
          }
        stars(g, 0, g.left, g.top, g.right, g.bottom, 0.3, hex('#8898b8'), 2, 0);
        // A distant spiral galaxy, very small.
        const gx = 262;
        const gy = 40;
        g.glow(gx, gy, 7, hex('#f0e0c8'), 0.4);
        for (let arm = 0; arm < 2; arm++)
          for (let i = 0; i < 26; i++) {
            const r = 1.5 + i * 0.5;
            const a = arm * Math.PI + i * 0.32;
            g.pxAdd(gx + Math.cos(a) * r, gy + Math.sin(a) * r * 0.45, hex('#a8a0d0'), 0.5 - i * 0.017);
          }
        haze(g, hazeC, 140, g.bottom, 0, 0.35);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        stars(g, t, g.left, g.top, g.right, g.bottom, 0.05, hex('#d8e4ff'), 7, 0.6);

        // The whale nearest the middle does the rare things.
        let star = 1;
        let best = Infinity;
        for (let i = 0; i < whales.length; i++) {
          const w = whales[i]!;
          const mid = headX(w, t) - (w.dir * w.len) / 2;
          const d = Math.abs(mid - 160) + w.far * 120;
          if (d < best) {
            best = d;
            star = i;
          }
        }
        const looking = f.rare === 0 && ev < 9 ? envelope(ev, 9, 1.5, 1.5) : 0;
        const blink = looking > 0.8 && ev > 4 && ev < 4.5;

        // Far to near, with a drifting veil of dust between the layers.
        const order = [0, 2, 1];
        for (const i of order) {
          const w = whales[i]!;
          drawWhale(g, w, t, i === star ? looking : 0, i === star && blink, f.energy);
          if (i === 2) veil.draw(g, t, 40, 150, hex('#1a2a40'), 0.35, 2, 'band', 5);
        }

        // Blowhole puff of stardust.
        if (f.rare === 1 && ev < 6) {
          const w = whales[star]!;
          const hx = headX(w, t);
          const bx = hx - w.dir * w.len * 0.18;
          const by = pathY(w, bx, t) - w.half * 0.7;
          if (ev < 1) g.glow(bx, by, 6, hex('#e8f8ff'), 0.6 * (1 - ev));
          for (let i = 0; i < 48; i++) {
            const p = clamp(ev / 3.5 - hash3(i, 1) * 0.25);
            if (p <= 0 || p >= 1) continue;
            const a = -Math.PI / 2 + (hash3(i, 2) - 0.5) * 1.3;
            const r = p * (24 + hash3(i, 3) * 22);
            const x = bx + Math.cos(a) * r;
            const y = by + Math.sin(a) * r + p * p * 14;
            const k = (1 - p) * 1.1;
            g.pxAdd(x, y, hex('#e8f8ff'), k);
            if (hash3(i, 4) > 0.5) g.pxAdd(x + 1, y, glowC, k * 0.5);
          }
        }

        // A school of tiny comets swims past.
        if (f.rare === 2 && ev < 9) {
          const p = ev / 9;
          const sx = -30 + p * 380;
          const sy = 130 - p * 50 + Math.sin(p * TAU * 2) * 6;
          for (const c of comets) {
            const x = sx - c.dx;
            const y = sy + c.dy + Math.sin(t * 4 + c.dx) * 1;
            g.pxAdd(x, y, hex('#ffffff'), 1);
            for (let k = 1; k < 7; k++) g.pxAdd(x - k, y + k * 0.1, glowC, 0.55 - k * 0.075);
          }
        }

        // Whalesong: slow rings rolling out from the nearest whale's head.
        if (f.rare === 3 && ev < 9) {
          const w = whales[star]!;
          const hx = headX(w, t);
          const hy = pathY(w, hx, t);
          for (let i = 0; i < 3; i++) {
            const r = (ev - i * 1.5) * 14;
            if (r <= 0 || r > 120) continue;
            const a = (1 - r / 120) * 0.45;
            for (let k = 0; k < 72; k++) {
              const ang = (k / 72) * TAU;
              g.pxAdd(hx + Math.cos(ang) * r, hy + Math.sin(ang) * r * 0.6, glowC, a);
            }
          }
        }
      },
    };
  },
};

function smooth(a: number, b: number, v: number) {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export default def;

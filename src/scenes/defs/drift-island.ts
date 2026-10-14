// Island Time Observatory: an island that drifted out of time, at a dusk that never quite ends.
// Two suns set at different speeds (the small one dips into the sea and comes back up; the big
// one hardly moves). A hilltop observatory has its dome open; palms sway; a beach bar glows;
// out in the water three tide markers each report a different tide, with total confidence.

import { type Color, hex, mix, ramp } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, vignette } from './lib/night';

const SEA_Y = 104;
const DOME = { x: 104, y: 50, r: 11 };
const BAR = { x0: 146, x1: 174, y: 107 };
const POSTS = [
  { x: 206, base: 136, h: 30, ph: 0, sp: 0.5, amp: 5 },
  { x: 228, base: 131, h: 26, ph: 2, sp: 0.23, amp: 8 },
  { x: 248, base: 127, h: 22, ph: 4, sp: 0.9, amp: 3 },
];
const PALMS = [
  { x: 52, y: 106, h: 40, lean: -0.35, seed: 1 },
  { x: 68, y: 108, h: 30, lean: 0.25, seed: 2 },
  { x: 182, y: 109, h: 34, lean: 0.4, seed: 3 },
];
const hill = (x: number) => {
  const d = (x - 108) / 64;
  const m = Math.max(0, 1 - d * d);
  return SEA_Y + 2 - m * 52 - (m > 0.05 ? Math.abs(Math.sin(x * 0.45)) * 2.5 + Math.abs(Math.sin(x * 0.17 + 1)) * 2 : 0);
};

const def: SceneDef = {
  id: 'drift-island',
  fps: 12,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 12,
  grade: { temperature: 0.12, saturation: 0.9, bloom: 0.55, shadows: '#0a0a14' },
  create({ accent }) {
    const ink = hex('#0a0812');
    const teal = accent;
    const sky = [hex('#0c1426'), hex('#1a2238'), hex('#3a3450'), hex('#6a4a5a'), hex('#a0645a'), hex('#c47c5c')];
    const sunA = hex('#ff9650');
    const sunB = hex('#ffe2a8');
    const warm = hex('#ffc890');
    const seaTop = hex('#3a4458');
    const seaDeep = hex('#0a1420');

    const palm = (g: Gfx, p: (typeof PALMS)[number], sway: number) => {
      let x = p.x;
      let y = p.y;
      const n = Math.round(p.h / 3);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const nx = x + p.lean * 3 * (0.4 + u) + sway * u * 0.6;
        const ny = y - 3;
        g.line(x, y, nx, ny, ink);
        g.line(x + 1, y, nx + 1, ny, ink);
        if (i % 2 === 0) g.px(nx + 1, ny + 1, hex('#1a1420'));
        x = nx;
        y = ny;
      }
      // fronds
      for (let k = 0; k < 7; k++) {
        const a0 = -Math.PI / 2 + (k - 3) * 0.5 + sway * 0.08 + Math.sin(k * 7 + p.seed) * 0.1;
        let fx = x;
        let fy = y;
        let a = a0;
        const len = p.h * (0.4 + hash3(k, p.seed) * 0.15);
        for (let s = 0; s < len; s += 1.5) {
          const nx = fx + Math.cos(a) * 1.5;
          const ny = fy + Math.sin(a) * 1.5;
          g.line(fx, fy, nx, ny, ink);
          if (s > 2 && s % 3 < 1.5) g.px(nx, ny + 1, ink);
          fx = nx;
          fy = ny;
          a += (Math.cos(a) > 0 ? 1 : -1) * 0.07 + sway * 0.004;
        }
      }
      g.disc(x, y + 1, 2, ink);
    };

    return {
      background(g) {
        // ── dusk sky with long lit clouds ──
        g.vgrad(ramp(sky, 14), -60, SEA_Y, g.top, SEA_Y);
        g.glow(214, 96, 140, hex('#ff8a50'), 0.1, 8);
        for (let i = 0; i < 9; i++) {
          const cy = -50 + i * 15 + hash3(i, 1) * 8;
          const cx = g.left + hash3(i, 2) * g.w;
          const w = 50 + hash3(i, 3) * 90;
          for (let x = Math.floor(cx - w); x < cx + w; x++)
            for (let y = Math.floor(cy - 3); y < cy + 3; y++) {
              const u = (x - cx) / w;
              const d = fbm(x / 14, y / 3, 81 + i, 3) * (1 - u * u) - Math.abs(y - cy) * 0.08;
              if (d > 0.32 + bayer(x, y) * 0.12) {
                const under = y > cy ? 1 : 0;
                const c = mix(mix(sky[Math.min(5, 1 + Math.floor((y + 60) / 40))]!, hex('#d88a7a'), 0.35 + under * 0.3), hex('#1a1a30'), clamp(-y / 120));
                g.px(x, y, c);
              }
            }
        }
        for (let i = 0; i < 40; i++) {
          const x = g.left + hash3(i, 5) * g.w;
          const y = g.top + hash3(i, 6) * (20 - g.top);
          g.pxAdd(x, y, hex('#d8e0ff'), 0.15 + hash3(i, 7) * 0.3);
        }

        // ── the sea ──
        g.vgrad([seaTop, hex('#24304a'), hex('#142034'), seaDeep], SEA_Y, 190, SEA_Y);
        for (let y = SEA_Y + 2; y < g.bottom; y += 2 + Math.floor((y - SEA_Y) / 14)) {
          for (let x = g.left; x < g.right; x++) if (fbm(x / 10, y, 83, 2) > 0.55) g.px(x, y, mix(hex('#2e3a54'), teal, 0.12));
        }
        g.hline(g.left, g.right, SEA_Y, hex('#5a5a70'));

        // ── the island ──
        for (let x = 30; x < 190; x++) {
          const top = Math.round(hill(x));
          for (let y = top; y < SEA_Y + 6; y++) {
            const sand = y > SEA_Y - 1;
            const tex = fbm(x / 4, y / 3, 85, 2);
            let c: Color = sand ? mix(hex('#3a3040'), hex('#6a5048'), tex) : mix(hex('#0e1018'), hex('#1a2026'), tex);
            if (!sand && x > 108) c = mix(c, hex('#4a3a40'), clamp((x - 108) / 80) * 0.4 * (1 - (y - top) / 30));
            g.px(x, y, c);
          }
          g.px(x, top, mix(hex('#2a2a34'), sunA, clamp((x - 100) / 90) * 0.5));
        }
        // a path winding up to the dome
        for (let i = 0; i < 40; i++) {
          const u = i / 40;
          g.px(150 - u * 44 + Math.sin(u * 9) * 5, SEA_Y - 2 - u * 46, hex('#3a3238'));
        }
        // the observatory: a drum and a pale dome with its slit open
        const D = DOME;
        g.rect(D.x - 10, D.y, 21, 9, hex('#2a2a34'));
        g.vline(D.x + 10, D.y, D.y + 8, mix(hex('#2a2a34'), sunA, 0.35));
        g.rect(D.x - 3, D.y + 3, 3, 6, hex('#ffd890'));
        g.glow(D.x - 2, D.y + 6, 10, warm, 0.2, 4);
        for (let y = D.y - D.r; y <= D.y; y++)
          for (let x = D.x - D.r; x <= D.x + D.r; x++) {
            const dx = (x - D.x) / D.r;
            const dy = (y - D.y) / D.r;
            if (dx * dx + dy * dy > 1) continue;
            const lit = clamp(0.4 + dx * 0.5 - dy * 0.2);
            g.px(x, y, mix(hex('#4a4858'), mix(hex('#c8b8b0'), sunA, 0.25), lit));
          }
        g.rect(D.x - 2, D.y - D.r, 4, D.r, hex('#141420'));

        // ── the beach bar: thatch, a warm light, a little radio ──
        const B = BAR;
        g.poly([B.x0 - 4, B.y - 14, B.x1 + 4, B.y - 14, B.x1 - 2, B.y - 21, B.x0 + 2, B.y - 21], hex('#3a2a20'));
        for (let x = B.x0 - 4; x <= B.x1 + 4; x += 2) g.vline(x, B.y - 14, B.y - 12 - (x & 2 ? 1 : 0), hex('#2a1e18'));
        g.vline(B.x0, B.y - 13, B.y, ink);
        g.vline(B.x1, B.y - 13, B.y, ink);
        g.rect(B.x0, B.y - 5, B.x1 - B.x0 + 1, 5, hex('#2a1c16'));
        g.hline(B.x0, B.x1, B.y - 5, mix(hex('#4a3020'), warm, 0.6));
        g.rect(B.x0 + 4, B.y - 9, 6, 4, hex('#5a3a2a'));
        g.px(B.x0 + 5, B.y - 8, warm);
        g.vline(B.x0 + 9, B.y - 13, B.y - 9, hex('#6a6060'));
        g.glow((B.x0 + B.x1) / 2, B.y - 10, 22, warm, 0.18, 5);

        g.lighting(0.82);
        g.light(214, 92, 150, 0.25, 70);
        g.light(BAR.x0 + 14, BAR.y - 8, 30, 0.3);
        vignette(g, 0.35, 170, 90, 240, 180);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // ── the two suns, setting at different speeds ──
        const ax = 228;
        const ay = 90 + Math.sin((t / 1800) * Math.PI * 2) * 4;
        const bx = 190;
        const by = 80 + Math.sin((t / 260) * Math.PI * 2) * 26;
        g.clip(g.left, g.top, g.w, SEA_Y - g.top);
        g.glow(ax, ay, 44, sunA, 0.14);
        g.disc(ax, ay, 12, mix(sunA, hex('#ff7050'), 0.3));
        g.disc(ax, ay, 11, mix(sunA, hex('#ffe0b0'), 0.35));
        const bk = clamp((SEA_Y + 6 - by) / 14);
        g.glow(bx, by, 22, sunB, 0.2 * bk);
        g.disc(bx, by, 5, sunB);
        // Rare: the small sun leaves a green flash as it goes under (soft, no strobe).
        if (f.rare === 0 && ev < 12) {
          const k = envelope(ev, 12, 2, 4);
          g.rectAdd(bx - 6, SEA_Y - 3, 13, 3, hex('#40ff90'), 0.35 * k);
        }
        g.noClip();
        // the horizon line where the sun is touching it
        if (by > SEA_Y - 6 && by < SEA_Y + 6) g.hline(bx - 6, bx + 6, SEA_Y, mix(sunB, hex('#ffffff'), 0.3));

        // ── glitter paths on the water ──
        for (let y = SEA_Y + 1; y < Math.min(g.bottom, 196); y += 2) {
          const d = (y - SEA_Y) / 80;
          const wA = 4 + d * 40;
          const wB = (2 + d * 20) * bk;
          for (let k = 0; k < 3; k++) {
            const hA = hash3(y, k, Math.floor(t * 2.5 + k * 0.3));
            if (hA < 0.65) {
              const x = ax + (hA / 0.65 - 0.5) * wA * 2;
              g.rectAdd(x, y, 2 + d * 3, 1, sunA, Math.max(0, 0.5 - d * 0.4) * (0.6 + 0.4 * Math.sin(t * 3 + k + y)));
            }
            if (wB > 0.5) {
              const hB = hash3(y, k + 5, Math.floor(t * 3 + k * 0.3));
              if (hB < 0.5) g.rectAdd(bx + (hB / 0.5 - 0.5) * wB * 2, y, 1 + d * 2, 1, sunB, Math.max(0, 0.45 - d * 0.35) * bk);
            }
          }
        }

        // ── palms ──
        for (const p of PALMS) {
          const sway = f.reduced ? 0 : Math.sin(t * 0.7 + p.seed * 2) * 1.5 + Math.sin(t * 1.9 + p.seed) * 0.4;
          palm(g, p, sway);
        }

        // the telescope: pointed at the suns, or (rarely) at us
        const look = f.rare === 2 && ev < 12 ? envelope(ev, 12, 2.5, 2.5) : 0;
        const ta = -0.6 + look * 1.2;
        g.line(DOME.x, DOME.y - 4, DOME.x + Math.cos(ta) * 12, DOME.y - 4 + Math.sin(ta) * 12 - (1 - look) * 6, hex('#8a8a98'));
        g.line(DOME.x, DOME.y - 5, DOME.x + Math.cos(ta) * 12, DOME.y - 5 + Math.sin(ta) * 12 - (1 - look) * 6, hex('#5a5a68'));
        if (look > 0.8) g.glow(DOME.x + Math.cos(ta) * 12, DOME.y - 4 + Math.sin(ta) * 12, 4, hex('#ffffff'), 0.4 * (look - 0.8) * 5);

        // the bar's lamp and the radio's light
        g.glow(BAR.x0 + 9, BAR.y - 12, 6, warm, 0.25 * flicker(t, 4, 2));
        g.px(BAR.x0 + 7, BAR.y - 8, f.playing ? teal : hex('#3a3030'));

        // ── tide markers, each sure of a different tide ──
        for (let i = 0; i < POSTS.length; i++) {
          const P = POSTS[i]!;
          const level = P.base - P.h * 0.45 + (f.reduced ? 0 : Math.sin(t * P.sp + P.ph) * P.amp);
          const top = P.base - P.h;
          for (let y = top; y < P.base; y++) {
            const stripe = Math.floor((y - top) / 3) % 2;
            g.hline(P.x - 1, P.x + 1, y, stripe ? mix(ink, hex('#c8c0b0'), 0.5) : mix(ink, hex('#a04a3a'), 0.6));
          }
          g.px(P.x + 1, top, mix(hex('#c8c0b0'), sunA, 0.5));
          g.rect(P.x - 1, top - 2, 3, 2, ink);
          // the water at this post, wherever it thinks it is
          g.rectA(P.x - 1, level, 3, P.base - level, hex('#1a2a40'), 0.75);
          g.hline(P.x - 4, P.x + 4, Math.round(level), mix(hex('#5a6a80'), teal, 0.4));
          g.px(P.x - 5 + (Math.floor(t * 2 + i) % 2), Math.round(level), mix(hex('#3a4a60'), teal, 0.3));
        }

        // Rare: a line of seabirds drifts across.
        if (f.rare === 1 && ev < 12) {
          const p = ev / 12;
          for (let k = 0; k < 6; k++) {
            const x = g.left - 20 + p * (g.w + 40) - k * 7;
            const y = 40 + k * 3 + Math.sin(ev * 2 + k) * 1.5;
            const flap = f.reduced ? 0 : Math.round(Math.sin(ev * 6 + k));
            g.px(x, y, ink);
            g.px(x - 1, y - 1 + flap, ink);
            g.px(x + 1, y - 1 + flap, ink);
            g.px(x - 2, y - 1 + flap * 2, ink);
            g.px(x + 2, y - 1 + flap * 2, ink);
          }
        }
        // Rare: a turtle surfaces by the posts, looks at them, and leaves.
        if (f.rare === 3 && ev < 12) {
          const k = smoothstep(1, 3, ev) * (1 - smoothstep(9, 11, ev));
          const x = 222 + ev * 0.6;
          g.ellipseA(x, 141, 4, 1.5, hex('#2a3a2a'), k);
          g.disc(x + 5, 140, 1, mix(hex('#0e1418'), hex('#3a4a3a'), k));
          g.hline(x - 6, x + 7, 142, mix(hex('#1a2a40'), teal, 0.25 * k));
        }
        void awake;
      },
    };
  },
};

export default def;

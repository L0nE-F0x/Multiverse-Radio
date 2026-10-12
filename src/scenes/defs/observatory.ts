// Breakbeat Observatory: a mountaintop observatory at night, its dome open. Where the
// telescope should be, a giant speaker cone points at the sky, and the stars shiver with
// every bass hit. A lone astronomer in headphones takes careful notes on the catwalk.

import { hex, mix, ramp } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { haze, vignette } from './lib/night';

const DOME = { x: 160, y: 88, r: 47 };
const BASE = { x0: 116, x1: 204, top: 88, bottom: 124 };
const CONE = { x: 148, y: 52, rx: 20, ry: 15 };
const MAN = { x: 222, y: 88 };
const MOON = { x: 72, y: 30 };

const def: SceneDef = {
  id: 'observatory',
  fps: 20,
  focusY: 80,
  rareEvents: 4,
  rareDuration: 9,
  create({ accent }) {
    const ink = hex('#03050a');
    const sky = [hex('#02040a'), hex('#050a18'), hex('#0a1428'), hex('#10203a'), hex('#183050')];
    const cyan = accent;
    const domeRamp = ramp([hex('#0c121c'), hex('#1e2a38'), hex('#3a4a5c'), hex('#6a7c90'), hex('#9aacbe')], 6);
    const wallC = [hex('#0c1118'), hex('#141c26'), hex('#1e2836')];
    const red = hex('#ff5a3a');
    const starC = hex('#e8f4ff');

    const stars: { x: number; y: number; b: number }[] = [];
    for (let i = 0; i < 260; i++) stars.push({ x: -40 + hash3(i, 1) * 400, y: -110 + hash3(i, 2) * 200, b: hash3(i, 3) ** 2 });

    const ridge = (x: number, seed: number, base: number, amp: number) => base - fbm(x / 60, seed, seed, 4) * amp - Math.sin(x * 0.01 + seed) * amp * 0.3;
    const peak = (x: number) => 118 + Math.abs(x - 160) * 0.42 + fbm(x / 20, 3, 9, 3) * 6 - 4;

    const astronomer = (g: Gfx, t: number, writing: boolean, look: number, thumbs: number, droop: number) => {
      const { x, y } = MAN;
      const c = hex('#06080c');
      const rimC = mix(c, cyan, 0.5);
      const warm = mix(c, red, 0.55);
      const bob = Math.round(droop * 1.5);
      // legs and coat
      g.vline(x - 1, y - 5, y - 1, c);
      g.vline(x + 1, y - 5, y - 1, c);
      g.poly([x - 3, y - 5, x + 4, y - 5, x + 3, y - 13 + bob, x - 2, y - 13 + bob], c);
      g.vline(x - 3, y - 12 + bob, y - 6, rimC);
      g.vline(x + 4, y - 11 + bob, y - 6, warm);
      // head and headphones
      const hx = x + Math.round(look * -1);
      const hy = y - 16 + bob - Math.round(look);
      g.disc(hx, hy, 2, c);
      g.px(hx - 2, hy - 1, rimC);
      g.px(hx + 2, hy, warm);
      g.hline(hx - 2, hx + 2, hy - 2, hex('#2a3038'));
      g.px(hx + 2, hy - 1, cyan);
      if (thumbs > 0) {
        const ay = hy - 1 - Math.round(thumbs * 4);
        g.line(x + 2, y - 11 + bob, x + 5, ay + 2, c);
        g.rect(x + 4, ay, 2, 2, warm);
        g.px(x + 5, ay - 1, warm);
      } else {
        // clipboard held up, pencil moving
        g.rect(x - 7, y - 12 + bob, 4, 5, hex('#a89e80'));
        g.hline(x - 6, x - 4, y - 11 + bob, hex('#5a5444'));
        const px = x - 4 + (writing ? Math.round(Math.sin(t * 9)) : 0);
        g.line(x - 1, y - 10 + bob, px, y - 9 + bob, c);
      }
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, 120);
        // The galaxy: a faint diagonal river of light.
        for (let y = g.top; y < 110; y++)
          for (let x = g.left; x < g.right; x++) {
            const d = Math.abs((x - 160) * 0.5 - (y - 20) * 0.9) / 30;
            if (d > 1) continue;
            const n = fbm(x / 14, y / 10, 5, 3);
            const k = (1 - d) * (1 - d) * n;
            if (k > 0.18 + bayer(x, y) * 0.2) g.pxAdd(x, y, mix(cyan, hex('#c8b8ff'), 0.5), 0.12 * k + 0.04);
          }
        // Mountains: far ridges in haze, then the peak the observatory stands on.
        for (let x = g.left; x < g.right; x++) {
          g.vline(x, ridge(x, 2, 112, 30), g.bottom, hex('#0a1220'));
        }
        haze(g, 70, 120, hex('#1a2c44'), 0, 0.25);
        for (let x = g.left; x < g.right; x++) g.vline(x, ridge(x, 7, 124, 22), g.bottom, hex('#070c16'));
        for (let x = g.left; x < g.right; x++) {
          const y = peak(x);
          g.vline(x, y, g.bottom, hex('#04070d'));
          if (hash3(x, 3, 1) < 0.5) g.px(x, y, hex('#1a2838'));
        }
        // A road winding down, and a few distant valley lights.
        for (let i = 0; i < 80; i++) {
          const u = i / 80;
          const x = 196 + Math.sin(u * 7) * 18 + u * 60;
          const y = 124 + u * 70;
          g.px(x, y, hex('#141e2a'));
        }
        for (let i = 0; i < 14; i++) g.px(g.left + hash3(i, 5) * g.w, 128 + hash3(i, 6) * 14, mix(hex('#ffc880'), hex('#0a1220'), 0.5 + hash3(i, 7) * 0.4));

        // The building: a drum of a base with a catwalk and a door.
        const B = BASE;
        for (let x = B.x0; x < B.x1; x++) {
          const u = (x - B.x0) / (B.x1 - B.x0);
          const shadeK = Math.sin(u * Math.PI) * 0.8 + (1 - u) * 0.3;
          for (let y = B.top; y < B.bottom; y++) g.px(x, y, shadeK > 0.75 + bayer(x, y) * 0.2 ? wallC[2]! : shadeK > 0.35 + bayer(x, y) * 0.2 ? wallC[1]! : wallC[0]!);
        }
        g.hline(B.x0 - 6, B.x1 + 30, B.top, hex('#2a3644'));
        g.hline(B.x0 - 6, B.x1 + 30, B.top + 1, hex('#121a24'));
        for (let x = B.x0 - 6; x <= B.x1 + 30; x += 4) g.vline(x, B.top - 5, B.top, hex('#1a2430'));
        g.hline(B.x0 - 6, B.x1 + 30, B.top - 5, hex('#2a3644'));
        g.rect(B.x1, B.top + 2, 30, 2, hex('#121a24'));
        g.line(B.x1 + 28, B.top + 4, B.x1 + 22, B.bottom, hex('#121a24'));
        // the door, red-lit inside
        g.rect(184, 106, 8, 18, hex('#2a0c08'));
        g.rect(185, 107, 6, 17, mix(hex('#3a120a'), red, 0.3));
        g.glow(188, 116, 20, red, 0.14, 5);
        g.ellipseA(188, 125, 12, 2, red, 0.12);

        // The dome: a lit hemisphere with its shutter open.
        const D = DOME;
        g.clip(g.left, g.top, g.w, D.y + 1 - g.top);
        g.ball(D.x, D.y, D.r, D.r, domeRamp, -0.55, -0.35, 0.12);
        g.noClip();
        // panel seams
        for (let k = -3; k <= 3; k++) {
          for (let a = Math.PI; a < Math.PI * 2; a += 0.01) {
            const x = D.x + Math.cos(a) * D.r * Math.sin((k / 4 + 1) * (Math.PI / 2));
            const y = D.y + Math.sin(a) * D.r;
            if (k !== 0 && Math.abs(Math.cos(a)) > 0.02) g.pxA(x, y, ink, 0.25);
          }
        }
        // the open slit: a dark band over the top
        for (let y = D.y - D.r; y < D.y - 6; y++) {
          const hw = 10 + (y - (D.y - D.r)) * 0.05;
          const yy = (y - D.y) / D.r;
          if (yy * yy > 0.98) continue;
          g.hline(D.x - hw - 6, D.x + hw - 6, y, hex('#05080e'));
        }
        g.hline(D.x - 60, D.x + 60, D.y, hex('#2a3644'));
        g.rect(D.x - 44, D.y, 88, 2, hex('#0e141c'));

        vignette(g, 0.5, 160, 80, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const hit = f.pulse * awake;
        const e = f.energy;

        // Stars, shivering on every bass hit (strongest near the cone's aim).
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i]!;
          if (s.x < g.left || s.x >= g.right || s.y < g.top) continue;
          if (s.y > 112 - (Math.abs(s.x - 160) < 60 ? 0 : 6)) continue;
          if ((s.x - DOME.x) ** 2 + (s.y - DOME.y) ** 2 < (DOME.r + 1) ** 2) continue;
          const near = clamp(1 - Math.hypot(s.x - 110, s.y - 10) / 160);
          const amp = f.reduced ? 0 : hit * (1 + near * 2.5);
          const jx = Math.round((hash3(i, f.beat, 5) - 0.5) * 2 * amp);
          const jy = Math.round((hash3(i, f.beat, 6) - 0.5) * 2 * amp);
          const tw = 0.6 + 0.4 * Math.sin(t * (1 + s.b * 2) + i);
          const k = (0.25 + s.b * 0.75) * tw;
          g.pxAdd(s.x + jx, s.y + jy, starC, k);
          if (s.b > 0.8) {
            g.pxAdd(s.x + jx - 1, s.y + jy, starC, k * 0.35);
            g.pxAdd(s.x + jx + 1, s.y + jy, starC, k * 0.35);
            g.pxAdd(s.x + jx, s.y + jy - 1, starC, k * 0.35);
            g.pxAdd(s.x + jx, s.y + jy + 1, starC, k * 0.35);
          }
        }

        // The moon, which wobbles like a jelly in one rare moment.
        const wob = f.rare === 1 && ev < 9 && !f.reduced ? (f.pulse * 2.5 + Math.sin(ev * 14) * envelope(ev, 9, 1, 2)) : 0;
        g.glow(MOON.x, MOON.y, 22, hex('#c8d8f0'), 0.12);
        g.ellipse(MOON.x, MOON.y, 7 + wob, 7 - wob, hex('#a8b8c8'));
        g.ellipse(MOON.x - 1, MOON.y - 1, 5 + wob * 0.6, 5 - wob * 0.6, hex('#d0dce8'));
        g.px(MOON.x + 2, MOON.y + 2, hex('#98a8b8'));

        // Rare: a big drop knocks a star loose, and it falls.
        if (f.rare === 0 && ev < 9) {
          const sx = 104;
          const sy = 6;
          if (ev < 1.4) g.glow(sx, sy, 4, starC, 0.7 * (ev % 0.3 < 0.15 ? 1 : 0.4));
          else {
            const fall = (ev - 1.4) ** 2 * 14;
            if (sy + fall < 112) for (let k = 0; k < 9; k++) g.pxAdd(sx + (fall - k * 2) * 0.25, sy + fall - k * 2, starC, 1 - k * 0.1);
          }
        }
        // Rare: a satellite crosses, and does a little dance on the way.
        if (f.rare === 3 && ev < 9) {
          const p = ev / 9;
          const sx = g.left + p * g.w;
          const sy = 14 + p * 10 + (p > 0.4 && p < 0.6 ? Math.sin(ev * 9) * 5 : 0);
          g.px(sx, sy, starC);
          g.px(sx - 2, sy, mix(cyan, ink, 0.4));
          g.px(sx + 2, sy, mix(cyan, ink, 0.4));
          if (Math.floor(ev * 2) % 2 === 0) g.glow(sx, sy, 3, hex('#ff4040'), 0.6);
        }

        // Shock rings, sent skyward from the cone.
        if (!f.reduced) {
          for (let k = 0; k < 3; k++) {
            const age = (t * 0.8 + k / 3) % 1;
            const r = 14 + age * 90;
            const a = (1 - age) * (0.1 + e * 0.25) * awake;
            if (a < 0.02) continue;
            for (let i = 0; i < 48; i++) {
              const an = Math.PI * 1.05 + (i / 48) * Math.PI * 0.75;
              g.pxAdd(CONE.x - 4 + Math.cos(an) * r, CONE.y - 4 + Math.sin(an) * r * 0.85, cyan, a);
            }
          }
        }

        // The speaker cone, leaning out of the slit toward the sky.
        const { x, y, rx, ry } = CONE;
        const push = f.reduced ? 0 : hit * 1.5 + e * 0.5;
        g.poly([x - 8, y + 12, x + 10, y + 14, x + 7, y + 30, x - 2, y + 30], hex('#0a0e14'));
        g.ellipse(x + 2, y + 3, rx + 3, ry + 3, ink);
        g.ellipse(x + 1, y + 2, rx + 2, ry + 2, hex('#1a222c'));
        g.ball(x, y, rx, ry, [hex('#05070b'), hex('#0e141c'), hex('#18222e'), hex('#283646')], 0.5, 0.6, 0.15);
        g.ring(x, y, rx - 2, ry - 2, hex('#24303c'));
        g.ring(x, y - push * 0.3, rx * 0.66, ry * 0.66, hex('#16202a'));
        g.ellipse(x, y - push, 5, 4, hex('#1c2632'));
        g.ellipse(x - 1, y - 1 - push, 2, 2, mix(hex('#2a3644'), cyan, 0.35 + hit * 0.5));
        g.glow(x, y, 26, cyan, 0.04 + hit * 0.12);

        // ── the astronomer on the catwalk ──
        const look = (f.rare === 0 && ev > 1.4 && ev < 6) || (f.rare === 1 && ev > 1 && ev < 8) ? 1 : 0;
        const thumbs = f.rare === 2 && ev < 9 ? envelope(ev, 9, 0.8, 1) : 0;
        const writing = awake > 0.5 && !look && Math.sin(t * 0.37) > -0.3;
        astronomer(g, t, writing, look, thumbs, clamp(1 - awake));
        if (look && !blinking(t, 3)) g.px(MAN.x - 2, MAN.y - 17, hex('#8a98a8'));
      },
    };
  },
};

export default def;

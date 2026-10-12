// Bedtime for Giants: an enormous bedroom seen from mouse height. The giant's bed rises
// like a mountain range under a patchwork quilt that slowly rises and falls; the bedside
// lamp stands like a lighthouse; a storybook lies open on the floor, the size of a field.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { motes, vignette } from './lib/night';

const BED_EDGE = 112;
const BED_R = 226;
const LAMP = { x: 270, y: 30 };
const BOOK = { x: 112, y: 132 };
const MOUSE = { x: 128, y: 124 };

/** The quilt's resting skyline: rolling ranges, the giant's shoulder the highest peak. */
const profile = (x: number) => 64 + Math.sin(x * 0.035 + 0.4) * 10 + Math.sin(x * 0.09 + 2) * 4 - Math.max(0, 1 - Math.abs(x - 168) / 46) * 18 + fbm(x / 18, 2, 3, 2) * 4;

const def: SceneDef = {
  id: 'giant-bedroom',
  fps: 12,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const ink = hex('#040508');
    const wall = [hex('#07090e'), hex('#0b0e15'), hex('#10141c')];
    const lampC = hex('#ffc880');
    const cool = accent;
    const patches: Color[] = [];
    const base = [hex('#3a2e3a'), hex('#2a3448'), hex('#3a3a2a'), hex('#4a2e2a'), hex('#2e3e3a'), hex('#3e3448')];
    for (let i = 0; i < 64; i++) patches.push(mix(mix(base[i % base.length]!, cool, 0.2 + hash3(i, 1) * 0.2), hex('#0a0c12'), 0.35));
    // Pre-mixed variants so the per-pixel quilt loop is just table lookups.
    const pSeam = patches.map((c) => shade(c, 0.55));
    const pLit = patches.map((c) => mix(c, lampC, 0.2));
    const pDark = patches.map((c) => shade(c, 0.7));
    const pEdge = patches.map((c) => mix(c, lampC, 0.3));
    const tops = new Float32Array(400);

    return {
      background(g) {
        // The far wall, the bedroom's skirting a cliff in the dark.
        g.vgrad(wall, g.top, BED_EDGE);
        g.glow(LAMP.x, LAMP.y + 10, 200, lampC, 0.08, 6);
        // Floorboards: each one a road, the gaps between them trenches.
        for (let y = BED_EDGE; y < g.bottom; y++) {
          const z = 1400 / (y - 96);
          for (let x = g.left; x < g.right; x++) {
            const u = ((x - 160) / (y - 96)) * 2.2;
            const board = Math.floor(u);
            const gap = u - board < 0.06;
            const grain = fbm(u * 3, z / 30, board + 9, 2);
            const lit = clamp(1 - Math.hypot((x - LAMP.x) / 160, (y - 120) / 50)) * 0.6;
            const v = grain * 0.5 + lit;
            let c = v > 0.62 + bayer(x, y) * 0.1 ? hex('#2a2018') : v > 0.4 + bayer(x, y) * 0.1 ? hex('#1e1610') : hex('#140f0b');
            if (gap) c = ink;
            g.px(x, y, c);
          }
        }
        // The bed frame's side, a dark cliff, and the nightstand beyond it.
        g.rect(g.left, BED_EDGE - 6, BED_R - g.left, 10, hex('#120c0a'));
        g.hline(g.left, BED_R, BED_EDGE - 6, hex('#2a1e18'));
        g.rect(BED_R + 2, 70, g.right - BED_R, BED_EDGE + 30 - 70, hex('#140e0a'));
        g.rect(BED_R + 2, 70, g.right - BED_R, 3, hex('#2e2018'));
        g.rect(BED_R + 8, 80, g.right - BED_R, 20, hex('#0e0a08'));
        g.disc(BED_R + 40, 90, 3, hex('#5a4a30'));
        // The lamp: base, a stem like a tower, a shade like a lantern room.
        g.ellipse(LAMP.x, 70, 18, 3, hex('#2a2420'));
        g.rect(LAMP.x - 3, 36, 6, 34, hex('#2a2420'));
        g.vline(LAMP.x - 3, 36, 69, hex('#4a3e30'));
        g.poly([LAMP.x - 26, 40, LAMP.x + 26, 40, LAMP.x + 16, 10, LAMP.x - 16, 10], mix(hex('#5a4030'), lampC, 0.45));
        g.hline(LAMP.x - 26, LAMP.x + 25, 40, mix(lampC, hex('#ffffff'), 0.3));
        // The open storybook, the size of a field.
        const { x: bx, y: by } = BOOK;
        g.poly([bx - 70, by + 22, bx, by + 26, bx - 6, by - 6, bx - 54, by - 8], hex('#8a8070'));
        g.poly([bx, by + 26, bx + 70, by + 20, bx + 54, by - 9, bx + 6, by - 6], hex('#9a9080'));
        g.line(bx, by + 26, bx, by - 6, hex('#5a5244'));
        for (let i = 0; i < 7; i++) {
          const v = i / 7;
          for (const s of [-1, 1]) {
            const y0 = by - 4 + v * 26;
            const x0 = bx + s * (8 + v * 2);
            const x1 = bx + s * (50 + v * 16);
            for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x += 3) if (hash3(x, i, s + 3) > 0.25) g.hline(x, x + 1, y0, hex('#4a4438'));
          }
        }
        g.rect(bx - 72, by + 22, 144, 3, hex('#3a2a20'));
        vignette(g, 0.55, 170, 90, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const snore = f.rare === 2 && ev < 12 ? envelope(ev - 2, 5, 2, 2) : 0;
        const lampOff = f.rare === 3 && ev > 2 && ev < 8 ? 1 : 0;
        // The giant breathes, very slowly.
        const breath = f.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.35);
        const lk = (1 - lampOff) * (0.8 + 0.2 * awake);

        // The quilt: ranges of patchwork rising and falling.
        for (let x = g.left; x < Math.min(g.right, BED_R); x++) {
          const i = x - g.left;
          const top = profile(x) - (breath * 3 + snore * 7) * clamp(1 - Math.abs(x - 168) / 120);
          tops[i] = top;
          const slope = profile(x + 2) - profile(x - 2);
          const colLight = clamp(1 - Math.abs(x - LAMP.x) / 170) * lk;
          const fold = Math.sin(x * 0.21) * 0.5 + 0.5;
          const col = Math.floor((x + 400) / 14);
          const xs = (x + 400) % 14 === 0;
          const bx = g.left - g.ox;
          for (let y = Math.floor(top); y < BED_EDGE - 4; y++) {
            const dy = y - top;
            const row = Math.floor(dy / 9);
            const idx = (col * 7 + row * 13) & 63;
            let c: Color;
            if (dy < 1.5) c = lk > 0.3 ? pEdge[idx]! : patches[idx]!;
            else if (xs || Math.floor(dy % 9) === 0) c = pSeam[idx]!;
            else if (slope < -0.6 && colLight * (1 - dy / 60) > bayer(x, y) * 0.8) c = pLit[idx]!;
            else if (slope > 0.6 || dy > 30 || fold < 0.15) c = pDark[idx]!;
            else c = patches[idx]!;
            g.px(x, y, c);
          }
          void bx;
          g.px(x, BED_EDGE - 5, pSeam[(col * 7) & 63]!);
        }
        // Rare: a hand flops out from under the quilt, rests, and is drawn back in.
        if (f.rare === 0 && ev < 12) {
          const k = envelope(ev, 12, 2.5, 2.5);
          const hx = 100;
          const hy = BED_EDGE - 4 + k * 22;
          const skin = hex('#5a443c');
          const skinL = mix(skin, lampC, 0.3);
          g.rect(hx - 10, BED_EDGE - 6, 20, hy - BED_EDGE + 6, skin);
          g.vline(hx + 9, BED_EDGE - 6, hy, skinL);
          for (let i = 0; i < 4; i++) {
            const fl = 6 + (i === 1 || i === 2 ? 3 : 0);
            g.rect(hx - 9 + i * 5, hy, 4, fl, skin);
            g.vline(hx - 6 + i * 5, hy, hy + fl - 1, skinL);
            g.hline(hx - 9 + i * 5, hx - 6 + i * 5, hy + fl - 1, mix(skin, ink, 0.3));
          }
          g.rect(hx - 13, BED_EDGE - 8, 26, 5, pSeam[5]!);
        }

        // The lamp: a lighthouse in the dark, beaming down across the floor.
        g.glow(LAMP.x, 34, 60, lampC, 0.22 * lk);
        g.poly([LAMP.x - 26, 40, LAMP.x + 26, 40, LAMP.x + 70, 160, LAMP.x - 110, 160], lampC, 2, 0.05 * lk);
        if (lampOff) g.tintAll(hex('#0a1428'), 0.35);
        motes(g, t, 150, 30, 160, 110, 34, lampC, (0.35 + snore * 0.6) * (lk + 0.2), 4, 0.25 + snore * 2);

        // Rare: a page of the book turns, slowly, like weather.
        const { x: bx, y: by } = BOOK;
        if (f.rare === 1 && ev < 12) {
          const p = clamp((ev - 1) / 9);
          const a = p * Math.PI;
          const px = bx + Math.cos(a) * 52;
          const py = by - 6 - Math.sin(a) * 40;
          g.poly([bx, by + 24, bx, by - 6, px, py, px + (Math.cos(a) * 14), py + 28 - Math.sin(a) * 10], hex('#a89e8c'), 0);
          g.line(bx, by - 6, px, py, hex('#c8bea8'));
        }

        // The mouse, our narrator's only listener, standing on the book.
        const { x: mx, y: my } = MOUSE;
        const ears = snore > 0.3 ? 1 : 0;
        g.ellipse(mx, my - 2, 2, 2, hex('#6a6068'));
        g.disc(mx + 2 - ears, my - 5, 1, hex('#7a7078'));
        g.px(mx + 1, my - 7, hex('#c8a0a8'));
        g.px(mx + 3, my - 7, hex('#c8a0a8'));
        g.line(mx - 2, my - 1, mx - 6, my - 2 + Math.round(Math.sin(t) * 1), hex('#5a5058'));
        g.px(mx + 3, my - 5, ink);
        g.glow(mx, my - 3, 5, lampC, 0.12 * lk);
        void smoothstep;
      },
    };
  },
};

export default def;

// Wild Multiverse: tall golden grass at sunset. Something improbable walks slowly across the
// horizon. A tiny camera crew hides in the grass in the foreground, filming reverently.

import { hex, mix, ramp, shade } from '../kit/color';
import { clamp, envelope, rampAt } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const HZ = 110;
const SUN = { x: 206, y: 104, r: 28 };
const CREW = { x: 100, y: 162 };

interface Blade {
  x: number;
  y: number;
  h: number;
  c: number;
  lean: number;
  seed: boolean;
}

const def: SceneDef = {
  id: 'tall-grass',
  fps: 18,
  focusY: 96,
  rareEvents: 3,
  rareDuration: 8,
  create({ accent, rng }) {
    const ink = hex('#1a0e10');
    const sky = [hex('#2a1a4a'), hex('#6a2a5a'), hex('#c84a4a'), hex('#f08a3a'), hex('#ffc85a')];
    const sil = hex('#2a1420');
    const silRim = hex('#e88a4a');
    const gold = ramp([hex('#5a3a14'), hex('#8a5a1a'), shade(accent, 1), mix(accent, hex('#fff0a0'), 0.4)], 4);
    const far = hex('#4a2238');

    const blades: Blade[] = [];
    for (let i = 0; i < 240; i++) {
      const y = 138 + rng.range(0, i < 150 ? 60 : 140);
      blades.push({
        x: rng.range(-40, 360),
        y,
        h: 18 + rng.range(0, 30) + (y - 138) * 0.5,
        c: rng.int(1, 3),
        lean: rng.range(-0.3, 0.3),
        seed: rng.chance(0.3),
      });
    }
    blades.sort((a, b) => a.y - b.y);

    const sway = (x: number, t: number, e: number) => Math.sin(t * 1.1 + x * 0.04) * (0.6 + e * 0.6) + Math.sin(t * 2.3 + x * 0.11) * 0.25;

    const giraffe = (g: Gfx, x: number, t: number, look: number) => {
      const step = t * 2.2;
      const y = HZ + 2;
      // legs, walking
      for (let k = 0; k < 4; k++) {
        const lx = x - 9 + k * 6;
        const sw = Math.sin(step + k * Math.PI * 0.5) * 3;
        g.line(lx, y - 18, lx + sw, y, sil);
        g.line(lx + 1, y - 18, lx + 1 + sw, y, sil);
      }
      g.ellipse(x, y - 20, 12, 6, sil);
      g.hline(x - 10, x + 8, y - 26, mix(sil, silRim, 0.5));
      g.line(x - 12, y - 21, x - 15, y - 12, sil);
      // the neck, which keeps going (well past the top of the picture)
      const nx = x + 8;
      for (let yy = y - 22; yy > g.top - 2; yy--) {
        const u = (y - 22 - yy) / 140;
        const xx = nx + u * 10 + Math.sin(u * 3 + t * 0.4) * 2;
        g.rect(xx - 2, yy, 4, 1, sil);
        g.px(xx - 2, yy, mix(sil, silRim, 0.4));
        if ((Math.floor(yy / 6) + Math.floor(xx)) % 5 === 0) g.px(xx, yy, mix(sil, silRim, 0.3));
      }
      // if it ever looks down at the crew: a small head comes all the way down
      if (look > 0) {
        const hy = y - 40 - (1 - look) * 120;
        if (hy > g.top) {
          g.ellipse(nx - 4, hy, 4, 2, sil);
          g.px(nx - 6, hy - 1, silRim);
        }
      }
    };

    const springDeer = (g: Gfx, x: number, t: number) => {
      const bounce = Math.abs(Math.sin(t * 3)) * 8;
      const y = HZ + 2 - bounce;
      for (const lx of [x - 6, x + 5]) {
        for (let k = 0; k < 6; k++) {
          const yy = y - 12 + k * 2 + bounce * (k / 6) * 0.2;
          g.hline(lx - 2, lx + 2, yy, sil);
          g.px(k % 2 ? lx - 2 : lx + 2, yy + 1, sil);
        }
      }
      g.ellipse(x, y - 15, 9, 4, sil);
      g.line(x + 8, y - 17, x + 12, y - 24, sil);
      g.ellipse(x + 13, y - 25, 3, 2, sil);
      // spring antlers
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) g.hline(x + 12 + s, x + 14 + s, y - 28 - k * 2, k % 2 ? silRim : sil);
      g.px(x - 9, y - 17, silRim);
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, HZ);
        // Sun with heat-haze bands, behind the far hills.
        g.glow(SUN.x, SUN.y, 90, hex('#ffb04a'), 0.3, 6);
        g.ball(SUN.x, SUN.y, SUN.r, SUN.r, ramp([hex('#ff8a3a'), hex('#ffc04a'), hex('#fff0a0')], 4), 0, -1, 0.7);
        for (let k = 0; k < 4; k++) g.rect(SUN.x - SUN.r, SUN.y + 4 + k * 5, SUN.r * 2, 1, mix(sky[3]!, hex('#ffc04a'), 0.5));
        // Far hills and an acacia.
        for (let x = g.left; x < g.right; x++) {
          const h = 8 + fbm(x / 40, 0, 7, 3) * 14;
          g.rect(x, HZ - h, 1, h + 4, far);
        }
        const ax = 60;
        g.vline(ax, HZ - 26, HZ - 8, far);
        g.line(ax, HZ - 18, ax - 6, HZ - 26, far);
        g.line(ax, HZ - 20, ax + 7, HZ - 27, far);
        g.ellipse(ax, HZ - 29, 16, 3, far);
        g.ellipse(ax - 4, HZ - 31, 9, 2, far);
        // Plains: back grass band, darker, softly textured.
        for (let y = HZ; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 6, y / 3, 5, 3);
            const v = 0.5 + n * 0.22 + (y - HZ) / 200 - (y > 136 ? (y - 136) / 70 : 0);
            g.px(x, y, rampAt(gold, v, x, y));
          }
        // Sun-glow across the near grass.
        g.glow(SUN.x, HZ + 4, 80, hex('#ffb04a'), 0.12, 5);
        // Distant grass silhouette tips along the horizon.
        for (let x = g.left; x < g.right; x += 2) {
          const h = 2 + hash3(x, 3) * 4;
          g.vline(x, HZ - h, HZ, mix(far, gold[1]!, 0.4));
        }
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // Pollen glinting in the low sun.
        for (let i = 0; i < 18; i++) {
          const x = 120 + Math.sin(t * 0.1 + i * 2.3) * 140 + i * 3;
          const y = 80 + Math.sin(t * 0.17 + i) * 40;
          g.pxAdd(x, y, hex('#fff0b0'), 0.25 + 0.25 * Math.sin(t * 2 + i));
        }

        // Something walks across the horizon (a different something each crossing).
        const crossing = 80;
        const k = Math.floor(t / crossing);
        const p = (t % crossing) / crossing;
        const noticing = f.rare === 0 && ev < 8 ? envelope(ev, 8, 1, 1.5) : 0;
        const cx = 360 - p * 400;
        if (k % 2 === 0) giraffe(g, cx, t, noticing);
        else springDeer(g, cx, t);

        // A herd of round fluffballs bounces by (rare).
        if (f.rare === 2 && ev < 8) {
          for (let i = 0; i < 6; i++) {
            const hx = -20 + (ev / 8) * 380 - i * 12;
            const hy = HZ - 2 - Math.abs(Math.sin(ev * 5 + i)) * 6;
            g.disc(hx, hy, 3, sil);
            g.px(hx - 1, hy - 3, silRim);
          }
        }

        // ── the crew, hiding ──
        const duck = noticing > 0.4 ? Math.round(noticing * 9) : 0;
        const cx0 = CREW.x;
        const cy0 = CREW.y;
        // tripod + camera
        g.line(cx0, cy0 - 14, cx0 - 8, cy0 + 8, ink);
        g.line(cx0, cy0 - 14, cx0 + 8, cy0 + 8, ink);
        g.line(cx0, cy0 - 14, cx0, cy0 + 8, ink);
        const camY = cy0 - 28 + Math.round(duck * 0.3);
        roundRect(g, cx0 - 10, camY, 22, 14, 2, ink);
        g.rect(cx0 - 9, camY + 1, 20, 12, hex('#2a2a34'));
        g.rect(cx0 - 9, camY + 1, 20, 2, hex('#4a4a56'));
        roundRect(g, cx0 + 11, camY + 3, 8, 8, 2, ink);
        g.disc(cx0 + 16, camY + 7, 2, hex('#3a5a8a'));
        g.px(cx0 + 15, camY + 6, hex('#c8e8ff'));
        g.disc(cx0 - 4, camY - 3, 4, ink);
        g.disc(cx0 + 4, camY - 3, 4, ink);
        g.disc(cx0 - 4, camY - 3, 2, hex('#4a4a56'));
        g.disc(cx0 + 4, camY - 3, 2, hex('#4a4a56'));
        if (Math.floor(t * 1.5) % 2) g.px(cx0 - 7, camY + 4, hex('#ff3a3a'));
        // camera operator (cap, peering through the eyepiece)
        const oy = cy0 - 20 + duck;
        g.disc(cx0 - 15, oy, 6, ink);
        g.disc(cx0 - 15, oy, 5, hex('#e8b890'));
        g.rect(cx0 - 21, oy - 6, 12, 3, hex('#3a6a4a'));
        g.rect(cx0 - 10, oy - 4, 4, 2, hex('#3a6a4a'));
        g.rect(cx0 - 13, oy - 1, 2, 2, ink);
        g.rect(cx0 - 22, oy + 5, 13, 16, hex('#5a6a3a'));
        // boom operator and the fluffy boom mic poking above the grass
        const bx = cx0 + 44;
        const by = cy0 - 14 + duck;
        g.disc(bx, by, 6, ink);
        g.disc(bx, by, 5, hex('#c8906a'));
        g.rect(bx - 5, by - 6, 11, 3, hex('#2a2a3a'));
        g.rect(bx - 6, by - 2, 2, 5, hex('#2a2a3a'));
        g.px(bx - 2, by, ink);
        g.px(bx + 2, by, ink);
        g.rect(bx - 6, by + 5, 12, 16, hex('#8a5a3a'));
        const mx = bx - 30;
        const my = by - 40 + duck * 0.5 + Math.sin(t * 0.6) * 1;
        g.line(bx - 4, by + 6, mx, my, hex('#5a5a62'));
        g.line(bx - 3, by + 6, mx + 1, my, hex('#3a3a42'));
        g.ellipse(mx, my, 9, 4, hex('#6a6a5a'));
        for (let i = 0; i < 26; i++) g.px(mx - 9 + hash3(i, 1) * 18, my - 4 + hash3(i, 2) * 8, hex('#a8a890'));
        // a bird that lands on the boom (rare)
        if (f.rare === 1 && ev < 8) {
          const land = clamp(ev / 2);
          const leave = clamp((ev - 6) / 2);
          const birdX = mx + (1 - land) * 60 - leave * 70;
          const birdY = my - 5 - (1 - land) * 40 - leave * 50;
          const flap = land < 1 || leave > 0 ? (Math.floor(ev * 10) % 2 ? -1 : 1) : 0;
          g.ellipse(birdX, birdY, 3, 2, hex('#3a2a2a'));
          g.disc(birdX - 3, birdY - 2, 1.5, hex('#3a2a2a'));
          g.px(birdX - 5, birdY - 2, hex('#e8a83a'));
          if (flap) {
            g.line(birdX, birdY - 1, birdX + 3, birdY - 4 * flap, hex('#3a2a2a'));
          }
          if (land >= 1 && leave <= 0 && Math.floor(ev) % 2) g.text('?', birdX - 2, birdY - 10, hex('#fff0d0'));
        }
        // the director, whispering
        const dx = cx0 - 40;
        const dy = cy0 - 12 + duck;
        g.disc(dx, dy, 6, ink);
        g.disc(dx, dy, 5, hex('#f0c8a0'));
        g.rect(dx - 6, dy - 6, 12, 4, hex('#e8e0c8'));
        g.rect(dx - 8, dy - 3, 16, 1, hex('#e8e0c8'));
        g.px(dx + 2, dy, ink);
        g.rect(dx - 6, dy + 5, 12, 14, hex('#c87a3a'));
        if (Math.floor(t / 4) % 3 === 0 && noticing < 0.2) g.text('shh', dx - 6, dy - 16, hex('#fff0d0'));

        // ── foreground grass (in front of the crew), swaying ──
        const e = f.energy;
        for (let i = 0; i < blades.length; i++) {
          const bl = blades[i]!;
          if (bl.x < g.left - 10 || bl.x > g.right + 10 || bl.y - bl.h > g.bottom) continue;
          const s = f.reduced ? 0.2 : sway(bl.x, t, e);
          const tipx = bl.x + (bl.lean + s * 0.18) * bl.h;
          const tipy = bl.y - bl.h;
          const midx = bl.x + (tipx - bl.x) * 0.35;
          const midy = bl.y - bl.h * 0.5;
          const c = gold[bl.c]!;
          g.line(bl.x, bl.y, midx, midy, shade(c, 0.85));
          g.line(midx, midy, tipx, tipy, c);
          if (bl.y > 170) g.line(bl.x + 1, bl.y, midx + 1, midy, shade(c, 0.7));
          if (bl.seed) {
            g.ellipse(tipx, tipy, 1, 3, gold[3]!);
            g.px(tipx, tipy - 3, mix(gold[3]!, hex('#ffffff'), 0.4));
          }
        }
        void arc;
      },
    };
  },
};

export default def;

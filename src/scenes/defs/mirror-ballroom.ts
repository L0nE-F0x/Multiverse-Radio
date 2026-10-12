// Mirror World Polka Hour: a checkered ballroom split by a giant mirror. Dancers on one side,
// reflections on the other, slightly out of step. Sometimes a reflection does something else.

import { type Color, hex, mix, shade } from '../kit/color';
import { envelope } from '../kit/fx';
import { type Gfx, mulPx } from '../kit/gfx';
import { arc, frameRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const MX = 160; // mirror line
const WALL_Y = 92;
const HOR = 40;

interface Pal {
  skin: Color;
  hair: Color;
  suit: Color;
  shirt: Color;
  dress: Color;
  trim: Color;
  ink: Color;
  brass: Color;
  brassD: Color;
}

const def: SceneDef = {
  id: 'mirror-ballroom',
  fps: 20,
  rareEvents: 3,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#140a10');
    const wallC = [hex('#3a0c18'), hex('#4e1222'), hex('#64182c')];
    const gold = hex('#e0b050');
    const goldD = hex('#8a6420');
    const tileA = hex('#f2e4d0');
    const tileB = shade(accent, 0.55);
    const tint = hex('#9ab0d8');
    const base: Pal = {
      skin: hex('#f0c8a0'),
      hair: hex('#3a2418'),
      suit: hex('#1e2a4a'),
      shirt: hex('#f4f0e8'),
      dress: accent,
      trim: mix(accent, hex('#ffffff'), 0.5),
      ink,
      brass: hex('#e8b84a'),
      brassD: hex('#9a6a1a'),
    };
    const mirrorPal = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, mix(v as number, tint, 0.22)])) as unknown as Pal;
    const dressB = hex('#ffd34f');

    const person = (g: Gfx, x: number, y: number, p: Pal, woman: boolean, hop: number, arm: number, dress?: Color, upside = false) => {
      x = Math.round(x);
      y = Math.round(y - hop);
      if (upside) {
        // a headstand spin, as one does
        g.disc(x, y - 3, 3, p.skin);
        g.rect(x - 3, y - 15, 7, 10, woman ? (dress ?? p.dress) : p.suit);
        g.rect(x - 4 - arm, y - 6, 2, 4, p.skin);
        g.rect(x + 3 + arm, y - 6, 2, 4, p.skin);
        g.line(x - 1, y - 15, x - 4 - arm, y - 24, p.suit);
        g.line(x + 1, y - 15, x + 4 + arm, y - 24, p.suit);
        return;
      }
      // legs
      const kick = Math.round(hop * 0.7);
      g.rect(x - 2, y - 6, 1, 6 - kick, woman ? p.skin : p.suit);
      g.rect(x + 1, y - 6, 1, 6, woman ? p.skin : p.suit);
      g.rect(x - 3, y - 1 - kick, 2, 1, p.ink);
      g.rect(x + 1, y - 1, 2, 1, p.ink);
      if (woman) {
        const d = dress ?? p.dress;
        g.poly([x - 2, y - 15, x + 3, y - 15, x + 6, y - 5, x - 5, y - 5], d);
        g.hline(x - 5, x + 5, y - 6, p.trim);
        g.rect(x - 2, y - 15, 5, 1, p.trim);
      } else {
        g.rect(x - 3, y - 15, 7, 9, p.suit);
        g.px(x, y - 14, p.shirt);
        g.px(x, y - 13, p.shirt);
        g.px(x, y - 12, hex('#c83a3a'));
      }
      // arms
      g.line(x - 3, y - 13, x - 5 - arm, y - 9 - arm, woman ? p.skin : p.suit);
      g.line(x + 3, y - 13, x + 5 + arm, y - 9 - arm, woman ? p.skin : p.suit);
      // head
      g.disc(x, y - 18, 3, p.ink);
      g.disc(x, y - 18, 2, p.skin);
      if (woman) {
        g.rect(x - 2, y - 21, 5, 2, p.hair);
        g.disc(x, y - 22, 1, p.hair);
      } else {
        g.rect(x - 2, y - 21, 5, 2, p.hair);
        g.px(x - 2, y - 19, p.hair);
      }
    };

    const couple = (g: Gfx, cx: number, y: number, t: number, p: Pal, dress: Color, mode: 'polka' | 'wave' | 'headstand' | 'idle') => {
      const beat = t * 2.1;
      const hop = mode === 'idle' ? 0 : Math.abs(Math.sin(beat * Math.PI)) * 3;
      const th = mode === 'idle' ? 0 : t * 1.6;
      const ax = cx + Math.cos(th) * 5;
      const bx = cx - Math.cos(th) * 5;
      const frontA = Math.sin(th) > 0;
      const arm = Math.round(Math.sin(beat * Math.PI) * 1);
      if (mode === 'headstand') {
        person(g, cx - 6, y, p, false, 0, arm, undefined, true);
        person(g, cx + 6, y, p, true, Math.abs(Math.sin(t * 6)) * 2, arm, dress);
        return;
      }
      if (mode === 'wave') {
        person(g, cx - 5, y, p, false, 0, 0);
        person(g, cx + 5, y, p, true, 0, 0, dress);
        const w = Math.sin(t * 9) > 0 ? -2 : 0;
        g.line(cx + 9, y - 13, cx + 12, y - 20 + w, p.skin);
        return;
      }
      if (frontA) {
        person(g, bx, y, p, true, hop, arm, dress);
        person(g, ax, y, p, false, hop, arm);
      } else {
        person(g, ax, y, p, false, hop, arm);
        person(g, bx, y, p, true, hop, arm, dress);
      }
    };

    const tuba = (g: Gfx, x: number, y: number, t: number, p: Pal, flip: boolean, energy: number) => {
      const bob = Math.round(Math.abs(Math.sin(t * 2.1 * Math.PI)) * 1.5);
      const s = flip ? -1 : 1;
      person(g, x, y, p, false, bob, 1);
      // the tuba: coiled body and a big bell pointing up
      const by = y - 12 - bob;
      g.disc(x + s * 2, by, 5, p.brassD);
      g.disc(x + s * 2, by, 4, p.brass);
      g.disc(x + s * 2, by, 2, p.brassD);
      g.line(x + s * 5, by - 3, x + s * 8, by - 14, p.brass);
      g.line(x + s * 6, by - 3, x + s * 9, by - 14, p.brass);
      g.ellipse(x + s * 9, by - 15, 5, 2, p.brassD);
      g.ellipse(x + s * 9, by - 15, 4, 1, hex('#3a2a10'));
      if (energy > 0.35) {
        for (let k = 0; k < 3; k++) g.pxA(x + s * (8 + k * 2), by - 18 - k * 2 - ((t * 6) % 3), hex('#fff4d0'), 0.5);
      }
    };

    return {
      background(g) {
        // Back wall: red silk, gold pilasters, arched alcoves.
        g.vgrad(wallC, g.top, WALL_Y);
        for (let x = 0; x < 160; x += 36) {
          for (const px of [x + 8, 320 - x - 8]) {
            g.rect(px - 3, g.top, 6, WALL_Y - g.top, goldD);
            g.rect(px - 2, g.top, 4, WALL_Y - g.top, gold);
            g.rect(px - 4, WALL_Y - 6, 8, 6, goldD);
          }
          for (const ax of [x + 26, 320 - x - 26]) {
            arc(g, ax, 40, 10, 10, Math.PI, Math.PI * 2, goldD, 2);
            g.rect(ax - 10, 40, 1, 40, goldD);
            g.rect(ax + 9, 40, 1, 40, goldD);
            g.rectMul(ax - 9, 32, 18, 48, 0.75);
          }
        }
        g.rect(g.left, WALL_Y - 2, g.w, 2, gold);
        // Checkered floor in perspective.
        for (let y = WALL_Y; y < g.bottom; y++) {
          const z = 900 / (y - HOR);
          for (let x = g.left; x < g.right; x++) {
            const X = ((x - MX) * z) / 140;
            const k = (Math.floor(X / 3) + Math.floor(z / 3)) & 1;
            g.px(x, y, k ? tileA : tileB);
          }
        }
        // Fog of distance near the wall.
        for (let y = WALL_Y; y < WALL_Y + 14; y++) g.rectA(g.left, y, g.w, 1, wallC[1]!, 0.5 * (1 - (y - WALL_Y) / 14));

        // The mirror's world is a touch cooler and dimmer, with sheen streaks.
        const b = g.buf;
        for (let by = 0; by < g.h; by++)
          for (let bx = Math.max(0, MX + 4 - g.ox); bx < g.w; bx++) {
            const i = by * g.w + bx;
            b[i] = mulPx(b[i]!, 228);
          }
        g.rectA(MX + 4, g.top, g.right - MX - 4, g.h, tint, 0.12);
        for (let k = 0; k < 3; k++) {
          const x0 = MX + 20 + k * 40;
          for (let y = g.top; y < g.bottom; y++) {
            const x = x0 + (y - g.top) * 0.35;
            g.rectA(x, y, 3 + k, 1, hex('#ffffff'), 0.06);
          }
        }

        // The mirror frame: ornate gold, crowned.
        g.rect(MX - 4, g.top, 8, g.h, goldD);
        g.rect(MX - 3, g.top, 6, g.h, gold);
        g.rect(MX - 1, g.top, 2, g.h, hex('#fff0b0'));
        for (let y = g.top - (g.top % 12); y < g.bottom; y += 12) {
          g.disc(MX, y, 3, goldD);
          g.disc(MX, y, 2, gold);
        }
        g.disc(MX, 6, 7, goldD);
        g.disc(MX, 6, 5, gold);
        g.disc(MX, 6, 2, accent);
        frameRect(g, MX - 5, g.top, 10, g.h, ink);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const playing = f.awake > 0.35;
        const mode = playing ? 'polka' : 'idle';
        const delay = f.rare === 2 && ev < 7 ? 0.35 + Math.sin((ev / 7) * Math.PI) * 1.4 : 0.35;

        // Chandeliers (and their reflections).
        for (const cx of [96, 224]) {
          g.vline(cx, g.top, 12, goldD);
          arc(g, cx, 14, 12, 4, 0, Math.PI, gold, 2);
          for (let i = 0; i < 4; i++) {
            const x = cx - 10 + i * 7;
            g.rect(x, 10, 1, 4, hex('#f4ecd8'));
            g.glow(x, 9, 6, hex('#ffd27a'), 0.4 + (f.reduced ? 0 : 0.05 * Math.sin(t * 9 + i)), 3);
          }
          g.glow(cx, 14, 30, hex('#ffd27a'), 0.08 + f.energy * 0.08, 4);
        }

        // Couples on the real side…
        const ys = [114, 130, 146];
        const xs = [86, 128, 66];
        const dresses = [hex('#8ad0ff'), accent, dressB];
        for (let i = 0; i < 3; i++) couple(g, xs[i]!, ys[i]!, t + i * 0.4, base, dresses[i]!, mode);
        // …and their reflections, a fraction late. Sometimes one has other ideas.
        for (let i = 0; i < 3; i++) {
          let m: 'polka' | 'wave' | 'headstand' | 'idle' = mode;
          if (f.rare === 0 && ev < 7 && i === 1) m = envelope(ev, 7, 0.4, 0.4) > 0.5 ? 'wave' : mode;
          if (f.rare === 1 && ev < 7 && i === 2) m = envelope(ev, 7, 0.3, 0.3) > 0.5 ? 'headstand' : mode;
          couple(g, 2 * MX - xs[i]!, ys[i]!, t + i * 0.4 - delay, mirrorPal, mix(dresses[i]!, tint, 0.22), m);
        }

        // The tuba player at the front, and Ynnhoj in the glass.
        tuba(g, 112, 172, playing ? t : 0, base, false, f.energy);
        tuba(g, 2 * MX - 112, 172, playing ? t - delay : 0, mirrorPal, true, f.energy);

        // A glint travelling down the frame.
        const gy = g.top + ((t * 30) % (g.h + 40)) - 20;
        g.glow(MX, gy, 5, hex('#ffffff'), 0.5);
      },
    };
  },
};

export default def;

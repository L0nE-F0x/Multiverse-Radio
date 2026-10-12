// Mirror World Polka Hour: a dim ballroom late at night, split down the middle by a giant
// mirror. A couple polkas across the polished floor beside a tuba player; in the glass their
// reflections dance a fraction late. Now and then a reflection has other ideas.

import { gloom, haze, lightPool, motes, reflectDown } from '../kit/atmos';
import { type Color, hex, mix, moodRamp, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { type Gfx, mulPx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { arc } from '../kit/shapes';
import type { SceneDef } from '../types';

const MX = 160; // the mirror
const WALL_Y = 88;
const HOR = 40;
const COUPLE_Y = 128;
const TUBA_Y = 113;

interface Pal {
  skin: Color[];
  hair: Color;
  suit: Color[];
  shirt: Color;
  dress: Color[];
  coat: Color[];
  brass: Color[];
  ink: Color;
}

type Mode = 'polka' | 'idle' | 'wave' | 'twirl';

const def: SceneDef = {
  id: 'mirror-ballroom',
  fps: 20,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 7,
  grade: { temperature: 0.25, contrast: 1.15, saturation: 0.82, bloom: 0.65, vignette: 0.32 },
  create({ accent }) {
    const ink = hex('#0b0608');
    const wall = [hex('#1c070d'), hex('#2c0d16'), hex('#3c1420')];
    const gold = [hex('#3a2810'), hex('#765424'), hex('#b08440'), hex('#e0bc78')];
    const tileA = hex('#5e4e48');
    const tileB = hex('#2a141a');
    const glass = hex('#8aa4c8');
    const real: Pal = {
      skin: [hex('#5e3828'), hex('#a8705a'), hex('#d8a080')],
      hair: hex('#1e140e'),
      suit: [hex('#0a0c14'), hex('#171b28'), hex('#2a3046')],
      shirt: hex('#d8d0c4'),
      dress: moodRamp(accent, 4, { sat: 0.75, dark: 0.16, light: 0.62 }),
      coat: [hex('#1a0a0e'), hex('#3a1620'), hex('#56222e')],
      brass: [hex('#3a2408'), hex('#7a5420'), hex('#b8883c'), hex('#ead08a')],
      ink,
    };
    // In the glass everything is a little colder and dimmer.
    const cool = (c: Color) => mix(shade(c, 0.86), glass, 0.16);
    const mirror: Pal = {
      skin: real.skin.map(cool),
      hair: cool(real.hair),
      suit: real.suit.map(cool),
      shirt: cool(real.shirt),
      dress: real.dress.map(cool),
      coat: real.coat.map(cool),
      brass: real.brass.map(cool),
      ink,
    };

    const head = (g: Gfx, x: number, y: number, dir: number, p: Pal, woman: boolean) => {
      g.disc(x, y, 5, ink);
      g.disc(x, y, 4, p.skin[1]!);
      g.ellipse(x + dir, y + 1, 2, 3, p.skin[2]!);
      g.px(x + dir * 5, y, p.skin[1]!);
      // hair: slicked back for him, a bun for her
      g.ellipse(x - dir, y - 3, 4, 2, p.hair);
      g.rect(x - dir * 4 - (dir > 0 ? 0 : 1), y - 3, 2, 4, p.hair);
      if (woman) {
        g.disc(x - dir * 4, y - 4, 2.2, p.hair);
        g.px(x - dir * 4, y - 5, mix(p.hair, hex('#ffffff'), 0.2));
      }
      g.px(x + dir * 3, y - 1, ink);
    };

    // He: tailcoat, white tie. (x, foot) = between the feet.
    const man = (g: Gfx, x: number, foot: number, dir: 1 | -1, p: Pal, step: number, hop: number) => {
      x = Math.round(x);
      const y = Math.round(foot - hop);
      const lift = Math.round(step * 3);
      // legs and shoes
      g.rect(x - 3, y - 18, 3, 17, p.suit[1]!);
      g.rect(x + 1, y - 18, 3, 17 - lift, p.suit[2]!);
      g.rect(x - 4, y - 2, 5, 2, ink);
      g.rect(x + 1 + dir, y - 2 - lift, 5, 2, ink);
      g.px(x - 3, y - 2, p.suit[2]!);
      // tails behind, coat, shirt front, white tie
      g.poly([x - dir * 2, y - 30, x - dir * 7, y - 30, x - dir * 8, y - 13, x - dir * 4, y - 15], p.suit[0]!);
      g.rect(x - 5, y - 32, 11, 15, ink);
      g.rect(x - 4, y - 31, 9, 13, p.suit[1]!);
      g.rect(x + (dir > 0 ? 2 : -4), y - 31, 3, 12, p.suit[2]!);
      g.tri(x + dir * 1 - 2, y - 31, x + dir * 1 + 2, y - 31, x + dir * 1, y - 24, p.shirt);
      g.hline(x + dir - 1, x + dir + 1, y - 31, p.shirt);
      head(g, x + dir, y - 37, dir, p, false);
    };

    // She: a full skirt that flares as she turns.
    const woman = (g: Gfx, x: number, foot: number, dir: 1 | -1, p: Pal, flare: number, hop: number, t: number) => {
      x = Math.round(x);
      const y = Math.round(foot - hop);
      const hw = 9 + Math.round(flare * 6);
      g.rect(x - 2, y - 3, 2, 2, ink);
      g.rect(x + 2, y - 3, 2, 2, ink);
      g.poly([x - 4, y - 23, x + 4, y - 23, x + hw, y - 3, x - hw, y - 3], ink);
      g.poly([x - 3, y - 22, x + 3, y - 22, x + hw - 1, y - 4, x - hw + 1, y - 4], p.dress[1]!);
      g.poly([x, y - 22, x + 3, y - 22, x + hw - 1, y - 4, x + 2, y - 4], p.dress[2]!);
      // folds sway with the dance
      for (let k = -1; k <= 1; k++) {
        const sw = Math.round(Math.sin(t * 6 + k) * flare * 2);
        g.line(x + k * 3, y - 18, x + k * 6 + sw, y - 5, p.dress[k < 0 ? 0 : 1]!);
      }
      g.hline(x - hw + 1, x + hw - 1, y - 4, p.dress[3]!);
      // bodice and shoulders
      g.rect(x - 4, y - 32, 9, 10, ink);
      g.rect(x - 3, y - 31, 7, 9, p.dress[2]!);
      g.rect(x + (dir > 0 ? 1 : -3), y - 31, 2, 9, p.dress[3]!);
      g.rect(x - 1, y - 33, 3, 2, p.skin[1]!);
      head(g, x + dir, y - 37, dir, p, true);
    };

    const couple = (g: Gfx, cx: number, foot: number, t: number, p: Pal, mode: Mode, mirrorSide: boolean) => {
      const beat = t * 2.1;
      const moving = mode === 'polka';
      const hop = moving ? Math.abs(Math.sin(beat * Math.PI)) * 2.5 : 0;
      const th = moving ? t * 1.5 : 0.5;
      // Keep them from fully eclipsing each other mid-turn.
      const r = mode === 'twirl' ? 11 : 9;
      const c = Math.cos(th);
      const spread = Math.sign(c || 1) * Math.max(0.45, Math.abs(c));
      const mxp = cx + spread * r * (mirrorSide ? -1 : 1);
      const wxp = cx - spread * r * (mirrorSide ? -1 : 1);
      const manDir: 1 | -1 = wxp > mxp ? 1 : -1;
      const step = moving ? Math.max(0, Math.sin(beat * Math.PI)) : 0;
      const manFront = Math.sin(th) > 0;
      const drawMan = () => man(g, mxp, foot, manDir, p, step, hop);
      let flare = moving ? 0.5 + 0.5 * Math.abs(Math.sin(th * 2)) : 0;
      if (mode === 'twirl') flare = 1;
      const drawWoman = () => {
        const dir: 1 | -1 = mode === 'twirl' ? (Math.sin(t * 9) > 0 ? 1 : -1) : manDir === 1 ? -1 : 1;
        woman(g, wxp, foot, dir, p, flare, mode === 'twirl' ? Math.abs(Math.sin(t * 9)) * 1.5 : hop, t);
      };
      if (manFront) {
        drawWoman();
        drawMan();
      } else {
        drawMan();
        drawWoman();
      }
      // Arms: the hold (his hand at her back, hers on his shoulder, joined hands out wide).
      const sy = Math.round(foot - hop - 29);
      if (mode === 'polka' || mode === 'idle') {
        g.line(mxp + manDir * 3, sy, wxp - manDir * 2, sy + 2, p.suit[2]!);
        const out = manDir * -1;
        g.line(mxp - manDir * 3, sy, mxp - manDir * 3 + out * 7, sy - 5, p.suit[1]!);
        g.line(wxp + manDir * 3, sy, mxp - manDir * 3 + out * 7, sy - 5, p.skin[1]!);
        g.disc(mxp - manDir * 3 + out * 7, sy - 5, 1, p.skin[2]!);
      } else if (mode === 'wave') {
        // He has stopped to wave at whoever is on the other side of the glass.
        const wv = Math.round(Math.sin(t * 8) * 3);
        const hx = mxp - 8 + wv;
        g.line(mxp - 3, sy, mxp - 7, sy - 8, p.suit[1]!);
        g.line(mxp - 3, sy + 1, mxp - 7, sy - 7, p.suit[2]!);
        g.line(mxp - 7, sy - 8, hx, sy - 16, p.suit[1]!);
        g.disc(hx, sy - 17, 2, p.skin[2]!);
      } else {
        // twirl: he claps
        const c = Math.sin(t * 10) > 0 ? 1 : 3;
        g.line(mxp + manDir * 3, sy, mxp + manDir * (6 - c), sy - 6, p.suit[2]!);
        g.line(mxp + manDir * 3, sy + 1, mxp + manDir * (6 + c), sy - 5, p.suit[1]!);
      }
      reflectDown(g, cx - 24, cx + 24, foot + 1, 26, 0.32);
    };

    const tubist = (g: Gfx, x: number, foot: number, t: number, p: Pal, dir: 1 | -1, playing: boolean, energy: number) => {
      const bob = playing ? Math.round(Math.abs(Math.sin(t * 2.1 * Math.PI)) * 1.5) : 0;
      x = Math.round(x);
      const y = foot - bob;
      g.rect(x - 3, y - 18, 3, 17, p.coat[0]!);
      g.rect(x + 1, y - 18, 3, 17, p.coat[1]!);
      g.rect(x - 4, y - 2, 5, 2, ink);
      g.rect(x + 1, y - 2, 5, 2, ink);
      g.rect(x - 6, y - 33, 13, 16, ink);
      g.rect(x - 5, y - 32, 11, 14, p.coat[1]!);
      g.rect(x - dir * 4 - (dir > 0 ? 1 : 0), y - 32, 3, 14, p.coat[0]!);
      for (let k = 0; k < 3; k++) g.px(x + dir * 2, y - 29 + k * 4, p.brass[3]!);
      head(g, x + dir, y - 38, dir, p, false);
      // the tuba: a coiled body held in front, the bell up over the shoulder
      const by = y - 20;
      const bx = x + dir * 4;
      // tubing rising past the shoulder to a bell that flares out in front of him
      g.rect(bx + dir * 4 - (dir > 0 ? 0 : 2), by - 16, 3, 14, ink);
      g.rect(bx + dir * 4 - (dir > 0 ? 0 : 1) , by - 16, 2, 14, p.brass[1]!);
      g.tri(bx + dir * 5, by - 14, bx + dir * 14, by - 24, bx + dir * 14, by - 12, ink);
      g.tri(bx + dir * 5, by - 14, bx + dir * 13, by - 22, bx + dir * 13, by - 13, p.brass[2]!);
      g.ellipse(bx + dir * 14, by - 18, 2, 6, ink);
      g.ellipse(bx + dir * 14, by - 18, 1, 5, p.brass[0]!);
      g.px(bx + dir * 9, by - 18, p.brass[3]!);
      g.disc(bx, by, 7, ink);
      g.disc(bx, by, 6, p.brass[1]!);
      g.disc(bx - dir, by - 1, 4, p.brass[2]!);
      g.disc(bx, by, 2, p.brass[0]!);
      g.px(bx - dir * 2, by - 3, p.brass[3]!);
      g.line(x - dir * 3, y - 30, bx - dir * 2, by - 2, p.coat[2]!);
      if (playing && energy > 0.35) {
        for (let k = 0; k < 3; k++) g.pxA(bx + dir * (17 + k * 2), by - 18 - k * 2 + Math.sin(t * 5 + k) * 2, p.brass[3]!, 0.35);
      }
      reflectDown(g, x - 14, x + 14, foot + 1, 22, 0.28);
    };

    return {
      background(g) {
        // Left half first; the right half is the same room seen in the glass.
        g.vgrad(wall, g.top, WALL_Y);
        // silk damask
        for (let y = Math.max(g.top, 0); y < WALL_Y; y++)
          for (let x = g.left; x < MX; x++) if (((x * 3 + y * 5) % 11 === 0 || (x * 5 - y * 3) % 13 === 0) && hash3(x, y) > 0.4) g.px(x, y, wall[2]!);
        for (let px = MX - 22; px > g.left - 40; px -= 44) {
          // pilaster
          g.rect(px - 4, g.top, 8, WALL_Y - g.top, gold[0]!);
          g.rect(px - 3, g.top, 6, WALL_Y - g.top, gold[1]!);
          g.rect(px - 1, g.top, 2, WALL_Y - g.top, gold[2]!);
          g.rect(px - 5, WALL_Y - 7, 10, 7, gold[1]!);
          g.rect(px - 5, 26, 10, 3, gold[2]!);
          // arched alcove between pilasters, with a dim sconce
          const ax = px - 22;
          g.rect(ax - 10, 42, 20, WALL_Y - 46, shade(wall[0]!, 0.7));
          g.ellipse(ax, 42, 10, 9, shade(wall[0]!, 0.7));
          g.rect(ax - 10, 42, 20, 10, shade(wall[0]!, 0.7));
          arc(g, ax, 42, 10, 9, Math.PI, Math.PI * 2, gold[1]!);
          g.vline(ax - 11, 42, WALL_Y - 4, gold[1]!);
          g.vline(ax + 10, 42, WALL_Y - 4, gold[1]!);
          g.rect(ax - 1, 58, 3, 6, gold[2]!);
        }
        g.rect(g.left, WALL_Y - 2, MX - g.left, 2, gold[2]!);
        g.rect(g.left, WALL_Y, MX - g.left, 1, gold[0]!);
        // Checkered marble floor in perspective.
        for (let y = WALL_Y + 1; y < g.bottom; y++) {
          const z = 900 / (y - HOR);
          for (let x = g.left; x < MX; x++) {
            const X = ((x - MX) * z) / 140;
            const k = (Math.floor(X / 3) + Math.floor(z / 3)) & 1;
            g.px(x, y, k ? tileA : tileB);
          }
        }
        // Lamplight and distance on the left half before it's mirrored.
        haze(g, wall[1]!, WALL_Y, WALL_Y + 18, 0.6, 0, WALL_Y, WALL_Y + 18);
        lightPool(g, 112, 128, 70, 16, hex('#ffc070'), 0.22);
        gloom(g, g.left, 140, MX - g.left, g.bottom - 140, 0.55);

        // The glass: mirror the left half onto the right, then cool and dim it.
        const b = g.buf;
        for (let by = 0; by < g.h; by++) {
          const row = by * g.w;
          for (let x = MX; x < g.right; x++) {
            const sx = 2 * MX - 1 - x;
            if (sx < g.left) continue;
            const v = b[row + sx - g.ox]!;
            b[row + x - g.ox] = mulPx(mix(v, glass, 0.2), 190);
          }
        }
        // sheen streaks across the glass
        for (let k = 0; k < 3; k++) {
          const x0 = MX + 26 + k * 46;
          for (let y = g.top; y < g.bottom; y++) g.rectA(x0 + (y - g.top) * 0.4, y, 2 + k * 3, 1, hex('#cfe0ff'), 0.06);
        }

        // The mirror's frame: a carved gilt column, with a bevelled edge where the glass starts.
        g.rect(MX - 6, g.top, 12, g.h, ink);
        g.rect(MX - 5, g.top, 10, g.h, gold[1]!);
        g.rect(MX - 3, g.top, 4, g.h, gold[2]!);
        g.vline(MX - 2, g.top, g.bottom, gold[3]!);
        g.vline(MX + 4, g.top, g.bottom, gold[0]!);
        g.rectA(MX + 6, g.top, 2, g.h, hex('#cfe0ff'), 0.25);
        g.rectA(MX + 8, g.top, 6, g.h, hex('#000000'), 0.25);
        for (let y = g.top - (((g.top % 10) + 10) % 10); y < g.bottom; y += 10) {
          g.disc(MX, y, 3, gold[0]!);
          g.disc(MX, y, 2, gold[2]!);
          g.px(MX - 1, y - 1, gold[3]!);
        }

        g.lighting(0.5);
        g.light(96, 12, 90, 0.4);
        g.light(224, 12, 90, 0.3);
        g.light(120, 98, 70, 0.6, 45);
        g.light(200, 98, 70, 0.45, 45);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const playing = f.awake > 0.35;
        const mode: Mode = playing ? 'polka' : 'idle';
        const lagging = f.rare === 2 && ev < 7 ? envelope(ev, 7, 1.5, 1.5) : 0;
        const delay = 0.3 + lagging * 1.1;

        // Chandeliers and their twins in the glass.
        for (const cx of [96, 224]) {
          const k = cx > MX ? 0.7 : 1;
          g.vline(cx, g.top, 6, gold[1]!);
          arc(g, cx, 8, 14, 4, 0, Math.PI, gold[2]!, 2);
          for (let i = 0; i < 5; i++) {
            const x = cx - 12 + i * 6;
            g.rect(x, 5, 1, 3, hex('#e8dcc4'));
            const fl = f.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 9 + i * 1.7);
            g.px(x, 4, hex('#ffd27a'));
            g.glow(x, 4, 6, hex('#ffc060'), 0.3 * fl * k, 3);
          }
        }

        // The real room: the tuba player at the back, the couple in front.
        tubist(g, 84, TUBA_Y, t, real, 1, playing, f.energy);
        couple(g, 122, COUPLE_Y, t, real, mode, false);

        // The glass, a fraction late. Sometimes a reflection has other ideas.
        let mm: Mode = mode;
        if (f.rare === 0 && ev < 7 && envelope(ev, 7, 0.5, 0.5) > 0.5) mm = 'wave';
        if (f.rare === 1 && ev < 7 && envelope(ev, 7, 0.5, 0.5) > 0.5) mm = 'twirl';
        // Ynnhoj, the tubist's reflection, wanders off for a bit and comes back.
        let tx = 2 * MX - 84;
        if (f.rare === 3 && ev < 7) tx += Math.sin(clamp(ev / 7) * Math.PI) * 90;
        g.clip(MX + 4, g.top, g.right - MX - 4, g.h);
        tubist(g, tx, TUBA_Y, t - delay, mirror, -1, playing && !(f.rare === 3 && ev < 7), f.energy);
        couple(g, 2 * MX - 122, COUPLE_Y, t - delay, mirror, mm, true);
        g.noClip();

        // A glint travelling down the frame, dust in the lamplight.
        const gy = g.top + ((t * 24) % (g.h + 40)) - 20;
        g.glow(MX - 1, gy, 4, hex('#fff4d0'), 0.4);
        if (!f.reduced) motes(g, t, 60, 20, 150, 110, 12, hex('#ffe0b0'), 0.3, 5);
      },
    };
  },
};

export default def;

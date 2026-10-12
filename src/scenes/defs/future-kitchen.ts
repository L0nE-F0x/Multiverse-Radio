// Tomorrow's Leftovers: a retro-future test kitchen after hours. A chef in a far-too-tall
// hat stirs a softly glowing pot; ingredients that don't exist yet float in labelled jars;
// the oven timer counts up instead of down; the steam has ideas.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { flicker, motes, shaft, vignette } from './lib/night';

const STOVE = { x: 160, y: 104 };
const POT = { x: 152, y: 98 };
const CHEF = { x: 188, y: 104 };
const SHELF = { x: 40, y: 58 };
const COUNTER_Y = 120;

const def: SceneDef = {
  id: 'future-kitchen',
  fps: 15,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#060708');
    const tileA = hex('#141c1e');
    const tileB = hex('#182224');
    const grout = hex('#0c1213');
    const chrome = [hex('#1c2224'), hex('#3a4446'), hex('#6a7678'), hex('#b8c4c4')];
    const enamel = hex('#2a2a26');
    const glowC = accent;
    const glowL = mix(accent, hex('#fff4d8'), 0.5);
    const lamp = hex('#ffe2a8');
    const led = mix(accent, hex('#ff8a3a'), 0.4);
    const whiteC = hex('#d8d4c8');
    const whiteD = hex('#7a7870');
    const jarC: Color[] = [hex('#7ad8c8'), hex('#c89aff'), mix(accent, hex('#ffffff'), 0.2)];

    const chefDraw = (g: Gfx, t: number, stir: number, droop: number, hatSway: number, taste: number, look: number) => {
      const x = CHEF.x;
      const y = CHEF.y;
      const bob = Math.round(Math.sin(t * 2) * 0.5 * (1 - droop));
      const jacket = mix(whiteD, whiteC, 0.05);
      const jacketL = mix(mix(whiteD, whiteC, 0.6), glowL, 0.4);
      const jacketS = mix(whiteD, ink, 0.55);
      // torso and shoulders (the stove hides the rest)
      g.ellipse(x, y - 36 + bob, 14, 7, ink);
      g.rect(x - 13, y - 36 + bob, 27, 40, ink);
      g.ellipse(x, y - 36 + bob, 13, 6, jacket);
      g.rect(x - 12, y - 36 + bob, 25, 40, jacket);
      // lit from below-left by the pot, shadowed on the right
      g.rect(x - 12, y - 30 + bob, 6, 34, jacketL);
      g.rect(x + 7, y - 34 + bob, 6, 38, jacketS);
      // double-breasted buttons and a neckerchief
      for (let i = 0; i < 3; i++) {
        g.px(x - 3, y - 26 + i * 7 + bob, whiteD);
        g.px(x + 3, y - 26 + i * 7 + bob, whiteD);
      }
      g.rect(x - 4, y - 41 + bob, 8, 4, mix(accent, hex('#a04a2a'), 0.4));
      // head, turned toward the pot
      const hx = x - 1 + look - Math.round(droop * 2);
      const hy = y - 48 + bob + Math.round(droop * 3);
      g.disc(hx, hy, 7, ink);
      g.disc(hx, hy, 6, hex('#7a5844'));
      g.ellipse(hx - 2, hy + 2, 3, 3, mix(hex('#8a6048'), glowC, 0.35));
      g.rect(hx - 8, hy + 1, 3, 2, hex('#6a4a38'));
      g.px(hx - 8, hy + 2, mix(hex('#8a6048'), glowC, 0.5));
      // a magnificent moustache
      g.hline(hx - 7, hx - 1, hy + 4, hex('#1a1210'));
      g.px(hx - 8, hy + 3, hex('#1a1210'));
      g.px(hx, hy + 3, hex('#1a1210'));
      if (droop < 0.5) g.px(hx - 4, hy - 1, hex('#1a1210'));
      else g.hline(hx - 5, hx - 3, hy - 1, hex('#1a1210'));
      g.rect(hx + 3, hy - 2, 3, 5, hex('#2a1a12'));
      // the hat: far too tall, swaying with a little lag
      const base = hy - 6;
      const h = 84;
      for (let i = 0; i < h; i++) {
        const u = i / h;
        const cx = hx + Math.round(hatSway * u * u * 5 + droop * u * u * 8);
        const w = 6 + Math.round(u * 2);
        const c = mix(whiteD, whiteC, 0.35 + 0.25 * u);
        g.hline(cx - w, cx + w, base - i, c);
        g.px(cx - w - 1, base - i, ink);
        g.px(cx + w + 1, base - i, ink);
        g.px(cx - w + 2, base - i, mix(c, ink, 0.2));
        g.px(cx + 1, base - i, mix(c, ink, 0.15));
        g.px(cx + w - 1, base - i, mix(c, ink, 0.3));
      }
      const tx = hx + Math.round(hatSway * 5 + droop * 8);
      g.ellipse(tx, base - h, 11, 6, ink);
      g.ellipse(tx, base - h, 10, 5, whiteC);
      g.ellipse(tx - 3, base - h - 1, 4, 2, mix(whiteC, hex('#ffffff'), 0.5));
      g.rect(hx - 7, base - 2, 15, 3, whiteC);
      g.hline(hx - 7, hx + 7, base + 1, whiteD);
      // the arm and spoon: stirring, or raised for a taste
      const sx = POT.x + Math.cos(stir) * 4 * (1 - taste) + taste * (hx - 10 - POT.x);
      const sy = POT.y - 6 + Math.sin(stir) * 1.2 * (1 - taste) + taste * (hy + 4 - (POT.y - 6));
      g.line(x - 10, y - 30 + bob, sx + 6, sy + 2, ink);
      g.line(x - 10, y - 29 + bob, sx + 6, sy + 3, ink);
      g.line(x - 10, y - 31 + bob, sx + 6, sy + 1, jacketL);
      g.line(sx + 6, sy + 2, sx - 1, sy - 12 + taste * 10, hex('#9a7a52'));
      g.disc(sx + 6, sy + 2, 2, hex('#6a4a38'));
      // the other hand on the hip
      g.line(x + 12, y - 30 + bob, x + 17, y - 18, jacketS);
      g.line(x + 17, y - 18, x + 12, y - 10, jacketS);
    };

    return {
      background(g) {
        // Tiled wall, lost in shadow away from the lamp.
        for (let y = g.top; y < COUNTER_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const row = Math.floor(y / 6);
            const off = (row % 2) * 6;
            const edge = y % 6 === 0 || (x + off) % 12 === 0;
            g.px(x, y, edge ? grout : hash3(Math.floor((x + off) / 12), row, 2) > 0.5 ? tileA : tileB);
          }
        // A chrome band at counter height and one higher up.
        g.rect(g.left, 70, g.w, 2, chrome[1]!);
        g.hline(g.left, g.right, 70, chrome[2]!);

        // Porthole window on the right: a quiet future city at night.
        const wx = 262;
        const wy = 46;
        g.disc(wx, wy, 19, chrome[0]!);
        g.disc(wx, wy, 17, chrome[2]!);
        g.disc(wx, wy, 15, hex('#0a1020'));
        g.clip(wx - 15, wy - 15, 30, 30);
        g.gradRect(wx - 15, wy - 15, 30, 30, [hex('#0a1020'), hex('#1a2238'), hex('#3a2a40')]);
        for (let i = 0; i < 9; i++) {
          const bx = wx - 15 + i * 4;
          const bh = 6 + Math.floor(hash3(i, 3) * 14);
          g.rect(bx, wy + 15 - bh, 3, bh, hex('#0a0e18'));
          if (hash3(i, 4) > 0.4) g.px(bx + 1, wy + 15 - bh + 2, mix(glowL, hex('#0a0e18'), 0.3));
        }
        g.ellipse(wx - 6, wy - 4, 9, 2, hex('#2a3048'));
        g.noClip();
        g.ring(wx, wy, 17, 17, chrome[3]!);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.px(wx + Math.round(Math.cos(a) * 18), wy + Math.round(Math.sin(a) * 18), chrome[3]!);
        }
        g.line(wx - 9, wy - 10, wx - 4, wy - 13, hex('#c8d8f0'));

        // The hood over the stove: a rounded chrome canopy.
        g.poly([118, 40, 202, 40, 214, 62, 106, 62], chrome[0]!);
        g.poly([120, 41, 200, 41, 211, 61, 109, 61], chrome[1]!);
        g.rect(106, 60, 108, 3, chrome[2]!);
        g.hline(106, 213, 60, chrome[3]!);
        g.rect(142, g.top, 36, 41 - g.top, chrome[0]!);
        g.rect(144, g.top, 32, 41 - g.top, chrome[1]!);
        g.vline(170, g.top, 40, chrome[2]!);

        // Shelf of jars on the left.
        const { x: sx, y: sy } = SHELF;
        g.rect(sx - 6, sy, 96, 3, chrome[1]!);
        g.hline(sx - 6, sx + 89, sy, chrome[3]!);
        for (const bx of [sx, sx + 80]) g.rect(bx, sy + 3, 2, 6, chrome[0]!);
        const plate = (x: number, w: number, s: string) => {
          g.rect(x, sy + 4, w, 7, hex('#cfc6b0'));
          g.rect(x, sy + 10, w, 1, hex('#7a7260'));
          g.text(s, x + 2, sy + 5, hex('#2a2418'));
        };
        plate(sx - 2, 35, 'THURSDAY');
        plate(sx + 38, 46, 'SOUP, LATER');
        for (let i = 0; i < 3; i++) {
          const jx = sx + 4 + i * 30;
          roundRect(g, jx, sy - 22, 22, 22, 4, hex('#1a2a2c'));
          roundRect(g, jx + 1, sy - 21, 20, 20, 4, mix(hex('#10181a'), jarC[i]!, 0.12));
          g.rect(jx + 3, sy - 25, 16, 3, chrome[2]!);
          g.hline(jx + 3, jx + 18, sy - 25, chrome[3]!);
          g.vline(jx + 3, sy - 19, sy - 5, mix(hex('#1a2a2c'), hex('#c8f0f0'), 0.4));
        }

        // The range: enamel and chrome, an oven with a round window and an LED timer.
        const { x, y } = STOVE;
        roundRect(g, x - 44, y, 88, COUNTER_Y - y + 40, 4, ink);
        roundRect(g, x - 43, y + 1, 86, COUNTER_Y - y + 40, 3, enamel);
        g.rect(x - 43, y + 1, 86, 4, chrome[2]!);
        g.hline(x - 43, x + 42, y + 1, chrome[3]!);
        for (let i = 0; i < 4; i++) {
          g.disc(x - 34 + i * 7, y + 10, 2, chrome[1]!);
          g.px(x - 34 + i * 7, y + 9, chrome[3]!);
        }
        g.rect(x + 6, y + 7, 28, 9, hex('#0c0a08'));
        g.rect(x + 7, y + 8, 26, 7, hex('#160c06'));
        // counter in front
        g.rect(g.left, COUNTER_Y, x - 44 - g.left, 4, chrome[2]!);
        g.hline(g.left, x - 45, COUNTER_Y, chrome[3]!);
        g.rect(x + 44, COUNTER_Y, g.right - x - 44, 4, chrome[2]!);
        g.hline(x + 44, g.right, COUNTER_Y, chrome[3]!);
        g.vgrad([hex('#16181a'), hex('#0c0d0e')], COUNTER_Y + 4, g.bottom, COUNTER_Y + 4);
        g.rect(x - 44, COUNTER_Y + 4, 88, g.bottom - COUNTER_Y - 4, hex('#121210'));
        // oven door
        roundRect(g, x - 30, COUNTER_Y + 10, 60, 34, 4, chrome[0]!);
        g.disc(x, COUNTER_Y + 27, 11, chrome[1]!);
        g.disc(x, COUNTER_Y + 27, 9, hex('#1a0e06'));
        g.rect(x - 22, COUNTER_Y + 13, 44, 2, chrome[2]!);
        // a cutting board and a bowl on the counter
        g.rect(54, COUNTER_Y - 3, 34, 3, hex('#5a4030'));
        g.hline(54, 87, COUNTER_Y - 3, hex('#7a5a40'));
        g.rect(64, COUNTER_Y - 5, 8, 2, hex('#c8a040'));
        g.ellipse(242, COUNTER_Y - 4, 12, 4, chrome[1]!);
        g.ellipse(242, COUNTER_Y - 6, 11, 2, chrome[0]!);
        g.hline(232, 252, COUNTER_Y - 7, chrome[3]!);

        // The pot on the front burner.
        const { x: px, y: py } = POT;
        g.rect(px - 14, py - 10, 28, 14, ink);
        g.rect(px - 13, py - 9, 26, 12, chrome[1]!);
        g.rect(px - 13, py - 9, 6, 12, chrome[2]!);
        g.rect(px + 7, py - 9, 6, 12, chrome[0]!);
        g.vline(px - 10, py - 9, py + 2, chrome[3]!);
        g.ellipse(px, py + 3, 13, 2, chrome[0]!);
        g.rect(px - 17, py - 8, 4, 2, chrome[0]!);
        g.rect(px + 13, py - 8, 4, 2, chrome[0]!);
        g.ellipse(px, py - 10, 13, 3, ink);

        // Lamp light and pot glow baked onto the wall and hood.
        g.glow(POT.x, POT.y - 20, 70, glowC, 0.1, 6);
        g.glow(160, 66, 50, lamp, 0.08, 6);
        vignette(g, 0.6, 160, 86, 220, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;

        // Lamp under the hood: a soft cone onto the stove.
        shaft(g, 160, 62, 160, 112, 60, 110, lamp, 0.07 * (0.6 + 0.4 * awake), 0.6, 5);
        motes(g, t, 116, 64, 90, 40, 14, lamp, 0.25, 4, 0.5);

        // The pot's contents glow and breathe.
        const pk = 0.75 + 0.15 * Math.sin(t * 1.3) + e * 0.25;
        g.ellipse(POT.x, POT.y - 10, 12, 2, mix(shade(glowC, 0.6), glowL, 0.4 * pk));
        for (let i = 0; i < 4; i++) {
          const bx = POT.x - 8 + ((hash3(i, Math.floor(t * 1.5)) * 16) | 0);
          g.px(bx, POT.y - 10, glowL);
        }
        g.glow(POT.x, POT.y - 12, 26, glowC, 0.32 * pk, 5);

        // Jars: each ingredient hovers in its own light.
        for (let i = 0; i < 3; i++) {
          const jx = SHELF.x + 15 + i * 30;
          const escaped = f.rare === 1 && i === 0 && ev > 1.5 && ev < 8.5;
          if (escaped) continue;
          const jy = SHELF.y - 12 + Math.sin(t * 0.8 + i * 2) * 2;
          const c = jarC[i]!;
          if (i === 0) {
            g.disc(jx, jy, 3, mix(c, hex('#ffffff'), 0.3));
            g.glow(jx, jy, 12, c, 0.35);
          } else if (i === 1) {
            g.ellipse(jx, jy + 2, 5, 2, c);
            g.ellipse(jx, jy, 3, 2, mix(c, hex('#ffffff'), 0.4));
            g.glow(jx, jy, 12, c, 0.3);
          } else {
            for (let k = 0; k < 3; k++) g.disc(jx - 4 + k * 4, jy + Math.sin(t + k) * 2, 1, mix(c, hex('#ffffff'), 0.3));
            g.glow(jx, jy, 12, c, 0.25);
          }
        }

        // Rare: the Thursday gets out, has a look around, and goes home.
        let look = 0;
        if (f.rare === 1 && ev < 10) {
          const jx = SHELF.x + 15;
          const jy = SHELF.y - 12;
          const p = clamp((ev - 1.5) / 7);
          if (ev > 1.2 && ev < 1.8) g.rect(SHELF.x + 7, SHELF.y - 27 - (ev - 1.2) * 10, 16, 2, chrome[3]!);
          if (p > 0 && p < 1) {
            const ox = jx + Math.sin(p * Math.PI) * 120 + Math.sin(p * 20) * 4;
            const oy = jy - Math.sin(p * Math.PI) * 30 + Math.cos(p * 13) * 5;
            g.disc(ox, oy, 3, mix(jarC[0]!, hex('#ffffff'), 0.3));
            g.glow(ox, oy, 16, jarC[0]!, 0.45);
            look = clamp((ox - CHEF.x) / 30, -3, 3);
          }
        }

        // Steam, and now and then it takes a shape.
        const shape = f.rare === 0 && ev < 10;
        for (let i = 0; i < 16; i++) {
          const p = (t * 0.22 + i / 16) % 1;
          const sx = POT.x + Math.sin(p * 5 + i * 1.7 + t * 0.6) * (2 + p * 6) + (hash3(i, 5) - 0.5) * 6;
          const sy = POT.y - 12 - p * 50;
          const a = 0.35 * Math.sin(p * Math.PI) * (shape ? 1 - envelope(ev, 10, 1, 1) * 0.8 : 1);
          g.pxA(sx, sy, hex('#e8e0d0'), a);
          g.pxA(sx + 1, sy, hex('#e8e0d0'), a * 0.6);
        }
        if (shape) {
          const k = envelope(ev, 10, 1.5, 1.5) * 0.5;
          const rise = ev * 2.5;
          const cx = POT.x - 2;
          const cy = POT.y - 40 - rise;
          if (ev < 5.5) {
            // a fish, swimming upstream through the steam
            const sw = Math.sin(ev * 4) * 1.5;
            g.ellipseA(cx, cy, 7, 3, hex('#f0ece4'), k);
            g.tri(cx + 6, cy, cx + 11, cy - 3 + sw, cx + 11, cy + 3 + sw, hex('#f0ece4'), 1, k);
            g.pxA(cx - 4, cy - 1, ink, k);
          } else {
            // then a question mark
            g.textCenter('?', cx, cy - 4, mix(hex('#3a3a36'), hex('#f0ece4'), k * 1.6), 2);
          }
        }

        // The timer counts up. During a rare moment it runs off to tomorrow.
        let secs = Math.floor(t) % 6000;
        let label = '';
        if (f.rare === 2 && ev < 10) {
          if (ev < 3) secs = Math.floor(secs + ev * ev * 700) % 6000;
          else if (ev < 7.5) label = 'TMRW';
          else secs = 0;
        }
        const tx = STOVE.x + 9;
        const ty = STOVE.y + 9;
        const ledC = mix(shade(led, 0.4), led, 0.7 + 0.3 * awake);
        if (label) {
          if (ev % 0.8 < 0.55 || f.reduced) g.text(label, tx + 4, ty, ledC);
        } else {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          g.text(String(Math.floor(m / 10)) + String(m % 10), tx, ty, ledC);
          if (Math.floor(t * 2) % 2 === 0 || f.reduced) g.px(tx + 8, ty + 1, ledC), g.px(tx + 8, ty + 3, ledC);
          g.text(String(Math.floor(s / 10)) + String(s % 10), tx + 10, ty, ledC);
          g.text('+', tx + 19, ty, shade(ledC, 0.6));
        }
        g.glow(tx + 10, ty + 2, 10, led, 0.18);

        // Oven glow behind its round window.
        g.glow(STOVE.x, COUNTER_Y + 27, 9, hex('#ff7a2a'), 0.25 + 0.05 * flicker(t, 4));

        // ── the chef ──
        const droop = clamp(1 - awake);
        const tasting = f.rare === 3 && ev < 10 ? envelope(ev, 6, 1, 1) : 0;
        const stir = t * (1.6 + e * 1.5) * (0.4 + 0.6 * awake) * (f.reduced ? 0.3 : 1);
        const hatSway = f.reduced ? 0 : Math.sin(t * 0.7 - 0.6) * 1.2 + Math.sin(stir) * 0.4;
        chefDraw(g, t, stir, droop, hatSway, tasting, Math.round(look));
        // rim of warm light from the pot on the chef's front
        g.glow(POT.x + 14, POT.y - 18, 16, glowC, 0.15 * pk);

        // Rare: after the taste, the finished dish appears on the counter, briefly.
        if (f.rare === 3 && ev > 5 && ev < 10) {
          const k = envelope(ev - 5, 5, 0.4, 1.2);
          const dx = 230;
          const dy = COUNTER_Y - 2;
          g.ellipseA(dx, dy, 12, 3, hex('#e8e4dc'), k);
          g.ellipseA(dx, dy - 2, 7, 3, mix(glowC, hex('#c86a3a'), 0.4), k);
          g.pxA(dx - 2, dy - 4, hex('#7ad86a'), k);
          g.glow(dx, dy - 3, 14, glowC, 0.3 * k);
          if (k > 0.5) for (let i = 0; i < 4; i++) g.pxA(dx - 6 + i * 4, dy - 8 - ((t * 6 + i * 3) % 6), hex('#ffffff'), 0.4 * k);
        }
        void smoothstep;
      },
    };
  },
};

export default def;

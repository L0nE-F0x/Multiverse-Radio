// Gristwick Parish Radio: the village green at dusk, during a fête that has clearly been
// going for centuries. Festoon lights, a tombola, a prize marrow the size of a car on the
// judging table, a brass band in a striped tent, and a maypole that is mostly ribbon.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, stars } from '../kit/fx';
import { type Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { bakeFog, drawFog, vignette } from './lib/night';

const GREEN_Y = 100;
const POLE = { x: 86, top: 30, base: 116 };
const TABLE = { x: 166, y: 112 };
const TENT = { x0: 222, x1: 312, top: 52, base: 120 };
const TOMBOLA = { x: 36, y: 104 };

const def: SceneDef = {
  id: 'village-fete',
  fps: 12,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#05070a');
    const sky = [hex('#060a12'), hex('#0c1420'), hex('#1a2430'), hex('#3a3436'), hex('#6a4a38')];
    const grass = [hex('#070b08'), hex('#0c120c'), hex('#131c12')];
    const dusk = hex('#10141a');
    const ribbon: Color[] = [mix(hex('#a83a3a'), dusk, 0.45), mix(hex('#e8e0c8'), dusk, 0.5), mix(hex('#3a5a9a'), dusk, 0.4), mix(accent, dusk, 0.45), mix(hex('#d8a83a'), dusk, 0.45)];
    const bulb = hex('#ffd890');
    const brass = hex('#c8a050');
    const mist = bakeFog(96, 40, 61, { sx: 50, sy: 10, lo: 0.4, gain: 2, edge: 1 });
    // festoon bulbs along a sagging string, computed once
    const bulbs: { x: number; y: number }[] = [];
    for (let i = 0; i <= 34; i++) {
      const u = i / 34;
      const x = POLE.x + (TENT.x0 + 10 - POLE.x) * u;
      bulbs.push({ x, y: POLE.top + 6 + u * (TENT.top - POLE.top - 6) + Math.sin(u * Math.PI) * 18 });
    }
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      bulbs.push({ x: -20 + (POLE.x + 20) * u, y: 40 + u * (POLE.top + 6 - 40) + Math.sin(u * Math.PI) * 10 });
    }

    const marrow = (g: Gfx, x: number, y: number, wob: number) => {
      const rx = 32 + wob;
      g.ellipse(x, y, rx + 1, 10 - wob * 0.3, ink);
      g.ball(x, y, rx, 9 - wob * 0.3, [hex('#0e1a0c'), hex('#1a3014'), mix(hex('#2e4e1e'), accent, 0.2), hex('#5a7a3a'), hex('#a8a868')], -0.2, -0.85, 0.15);
      for (let i = -3; i <= 3; i++) {
        for (let k = -rx + 4; k < rx - 4; k += 2) {
          const yy = y + i * 2.4 * Math.sqrt(Math.max(0, 1 - (k / rx) ** 2));
          if (hash3(k, i, 5) < 0.3) g.px(x + k, yy, hex('#4a6a32'));
        }
      }
      g.rect(x + rx - 2, y - 2, 5, 3, hex('#4a3a20'));
    };

    const rosette = (g: Gfx, x: number, y: number, c: Color) => {
      g.tri(x - 2, y, x - 4, y + 9, x, y + 7, c);
      g.tri(x + 2, y, x + 4, y + 9, x, y + 7, c);
      g.disc(x, y, 4, mix(c, hex('#ffffff'), 0.2));
      g.disc(x, y, 2, hex('#e8d8a0'));
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, GREEN_Y);
        stars(g, 0, g.left, g.top, g.right, 40, 0.1, hex('#d8e0e8'), 17, 0);
        // trees and the church, black against the last of the light
        for (let x = g.left; x < g.right; x++) {
          const h = 74 + fbm(x / 16, 3, 7, 3) * 18 - Math.max(0, 1 - Math.abs(x - 40) / 30) * 14;
          g.vline(x, h, GREEN_Y, hex('#06090a'));
        }
        const cx = 196;
        g.rect(cx - 7, 52, 14, 40, hex('#06090a'));
        g.tri(cx - 8, 53, cx + 8, 53, cx, 24, hex('#06090a'));
        g.rect(cx - 1, 62, 3, 5, mix(hex('#06090a'), bulb, 0.5));
        g.rect(cx + 8, 70, 30, 22, hex('#06090a'));
        g.tri(cx + 7, 71, cx + 39, 71, cx + 23, 62, hex('#06090a'));
        // The green.
        for (let y = GREEN_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = hash3(x, y, 3);
            g.px(x, y, n < 0.15 ? grass[2]! : n < 0.6 ? grass[1]! : grass[0]!);
          }

        // The marquee: striped canvas, open at the front, lamplit inside.
        const T = TENT;
        g.poly([T.x0 - 6, T.top + 14, T.x1 + 6, T.top + 14, (T.x0 + T.x1) / 2, T.top - 10], hex('#2a2e24'));
        for (let x = T.x0 - 6; x < T.x1 + 6; x++) {
          const stripe = Math.floor((x - T.x0) / 6) % 2 === 0;
          const yt = T.top + 14 - Math.max(0, 24 - Math.abs(x - (T.x0 + T.x1) / 2) * (24 / ((T.x1 - T.x0) / 2 + 6)));
          g.vline(x, yt, T.top + 16, stripe ? mix(hex('#8a8474'), accent, 0.1) : mix(hex('#2a4a2a'), accent, 0.2));
        }
        for (let x = T.x0 - 6; x < T.x1 + 6; x += 6) g.tri(x, T.top + 16, x + 6, T.top + 16, x + 3, T.top + 20, Math.floor((x - T.x0) / 6) % 2 === 0 ? hex('#7a7464') : mix(hex('#1e3e1e'), accent, 0.2));
        g.rect(T.x0, T.top + 16, T.x1 - T.x0, T.base - T.top - 16, hex('#1a1a12'));
        g.rect(T.x0 + 4, T.top + 20, T.x1 - T.x0 - 8, T.base - T.top - 20, mix(hex('#1e1a10'), bulb, 0.14));
        g.vline(T.x0, T.top + 16, T.base, hex('#4a4430'));
        g.vline(T.x1 - 1, T.top + 16, T.base, hex('#4a4430'));
        g.glow((T.x0 + T.x1) / 2, T.top + 40, 50, bulb, 0.12, 5);

        // The tombola stall.
        const { x: tx, y: ty } = TOMBOLA;
        g.rect(tx - 18, ty - 2, 36, 3, hex('#3a2a1a'));
        g.rect(tx - 18, ty + 1, 36, 12, mix(hex('#2a1e14'), accent, 0.1));
        g.rect(tx - 16, ty + 13, 2, 6, ink);
        g.rect(tx + 14, ty + 13, 2, 6, ink);
        g.rect(tx - 14, ty - 22, 2, 20, hex('#2a2016'));
        g.rect(tx + 12, ty - 22, 2, 20, hex('#2a2016'));
        g.rect(tx - 17, ty - 26, 34, 5, mix(hex('#6a2a2a'), accent, 0.15));
        g.text('TOMBOLA', tx - 14, ty - 26, hex('#b8a888'));

        // The judging table with its cloth.
        const { x, y } = TABLE;
        g.rect(x - 46, y - 6, 92, 3, hex('#7a766a'));
        g.rect(x - 46, y - 3, 92, 8, hex('#5e5a50'));
        for (let k = x - 46; k < x + 46; k += 4) g.vline(k, y - 3, y + 4, hex('#504c44'));
        g.rect(x - 42, y + 5, 2, 10, ink);
        g.rect(x + 40, y + 5, 2, 10, ink);
        g.rect(x - 52, y - 34, 27, 9, hex('#9a9280'));
        g.text('MARROW', x - 51, y - 32, hex('#2a2016'));
        g.vline(x - 39, y - 25, y - 6, hex('#2a2016'));

        vignette(g, 0.5, 160, 80, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;

        // Festoon lights.
        for (let i = 0; i < bulbs.length; i++) {
          const b = bulbs[i]!;
          const nb = bulbs[i + 1];
          if (nb && i !== 34) g.line(b.x, b.y, nb.x, nb.y, hex('#141210'));
          const fl = f.reduced ? 0.9 : 0.75 + 0.25 * Math.sin(t * 1.3 + i * 2.7);
          g.px(b.x, b.y + 1, mix(bulb, hex('#ffffff'), 0.3 * fl));
          g.glow(b.x, b.y + 1, 6, bulb, 0.22 * fl * (0.6 + 0.4 * awake));
        }

        // The maypole: wrapped so many times it is mostly ribbon.
        const P = POLE;
        const extra = f.rare === 1 && ev < 10 ? clamp((ev - 2) / 6) : 0;
        for (let y = P.top; y < P.base; y++) {
          const w = 4 + Math.round(((y - P.top) / (P.base - P.top)) * 3 + extra * 1);
          for (let dx = -w; dx <= w; dx++) {
            const band = Math.floor((y + dx * 0.6 + 400) / 3);
            let c = ribbon[band % ribbon.length]!;
            if (dx === -w || dx === w) c = shade(c, 0.5);
            else if (dx > w / 2) c = shade(c, 0.7);
            g.px(P.x + dx, y, c);
          }
        }
        g.disc(P.x, P.top - 2, 5, hex('#3a4a2a'));
        g.disc(P.x, P.top - 4, 3, mix(accent, hex('#e8e0b0'), 0.3));
        // loose ribbon ends stirring in the evening air
        for (let k = 0; k < 5; k++) {
          const a = -0.9 + k * 0.45;
          const sw = f.reduced ? 0 : Math.sin(t * 0.8 + k) * 3;
          g.line(P.x, P.top + 2, P.x + Math.sin(a) * 18 + sw, P.top + 22 + Math.cos(a) * 4, ribbon[k % ribbon.length]!);
        }
        // Rare: a dancer skips round once more, adding another layer.
        if (f.rare === 1 && ev < 10) {
          const a = ev * 1.2;
          const front = Math.sin(a) > 0;
          const dx = P.x + Math.cos(a) * 18;
          const dy = P.base - 1 + Math.sin(a) * 4;
          const k = envelope(ev, 10, 1, 1.5);
          if (k > 0.05) {
            const c = front ? hex('#1a1612') : hex('#100e0c');
            g.rect(dx - 2, dy - 12, 4, 8, c);
            g.disc(dx, dy - 14, 2, c);
            g.line(dx - 1, dy - 4, dx - 2 - Math.round(Math.sin(ev * 8)), dy, c);
            g.line(dx + 1, dy - 4, dx + 2 + Math.round(Math.sin(ev * 8)), dy, c);
            g.line(dx, dy - 11, P.x, P.top + 4, ribbon[1]!);
          }
        }

        // The prize marrow, with its rosette (and, after a rare moment, two).
        const judging = f.rare === 2 && ev < 10;
        const wob = judging && ev > 4 && ev < 6 && !f.reduced ? Math.sin(ev * 20) * 1.2 : 0;
        marrow(g, TABLE.x + 8, TABLE.y - 14, wob);
        g.glow(TABLE.x + 8, TABLE.y - 16, 40, bulb, 0.08);
        rosette(g, TABLE.x + 20, TABLE.y - 25, mix(hex('#3a5aa8'), accent, 0.2));
        if (judging) {
          // the judge walks the length of it with a tape measure
          const p = clamp((ev - 1) / 5);
          const jx = TABLE.x - 24 + p * 64;
          const jy = TABLE.y + 14;
          g.rect(jx - 2, jy - 16, 5, 10, hex('#1a1614'));
          g.disc(jx, jy - 19, 2, hex('#1a1614'));
          g.rect(jx - 3, jy - 22, 7, 1, hex('#1a1614'));
          g.rect(jx - 1, jy - 6, 1, 6, hex('#1a1614'));
          g.rect(jx + 1, jy - 6, 1, 6, hex('#1a1614'));
          g.hline(TABLE.x - 24, jx, TABLE.y - 7, hex('#e8d050'));
          if (ev > 6.5) rosette(g, TABLE.x - 4, TABLE.y - 27, mix(hex('#c84040'), accent, 0.2));
        }

        // The tombola drum, turning now and then; in a rare moment a ticket escapes.
        const { x: tx, y: ty } = TOMBOLA;
        const spin = f.rare === 0 && ev < 10 ? ev * 6 : (t % 20 < 3 ? t * 2 : 0);
        g.ellipse(tx, ty - 8, 9, 6, hex('#2a2a30'));
        for (let k = 0; k < 6; k++) {
          const a = spin + (k / 6) * Math.PI * 2;
          g.line(tx, ty - 8, tx + Math.cos(a) * 8, ty - 8 + Math.sin(a) * 5, hex('#8a8070'));
        }
        g.rect(tx - 1, ty - 2, 2, 3, hex('#3a2a1a'));
        if (f.rare === 0 && ev > 3 && ev < 10) {
          const p = (ev - 3) / 7;
          const kx = tx + p * 90 + Math.sin(ev * 5) * 6;
          const ky = ty - 12 - p * 110;
          g.rect(kx, ky, 3, 2, hex('#e8a8a8'));
        }

        // The brass band inside the tent: three players, a tuba catching the light.
        const T = TENT;
        for (let i = 0; i < 3; i++) {
          const bx = T.x0 + 20 + i * 24;
          const by = T.base;
          const bob = f.reduced ? 0 : Math.round(((f.beat + i) % 2 === 0 ? f.pulse : 0) * 1.5 * awake);
          g.rect(bx - 4, by - 22 - bob, 8, 14, hex('#141010'));
          g.disc(bx, by - 26 - bob, 3, hex('#141010'));
          g.rect(bx - 4, by - 30 - bob, 8, 2, hex('#2a1e14'));
          g.rect(bx - 3, by - 8, 2, 8, hex('#141010'));
          g.rect(bx + 1, by - 8, 2, 8, hex('#141010'));
          if (i === 1) {
            g.ellipse(bx + 3, by - 22 - bob, 7, 7, brass);
            g.ellipse(bx + 3, by - 22 - bob, 4, 4, shade(brass, 0.6));
            g.ellipse(bx + 1, by - 25 - bob, 2, 1, hex('#fff0c0'));
          } else {
            g.line(bx + 2, by - 24 - bob, bx + 11, by - 26 - bob, brass);
            g.disc(bx + 12, by - 26 - bob, 2, brass);
          }
          g.glow(bx + 4, by - 22, 8, bulb, 0.1 + e * 0.12);
        }
        // Rare: a pigeon leaves the tuba in some haste.
        if (f.rare === 3 && ev < 10) {
          const p = clamp((ev - 1) / 5);
          const px = T.x0 + 47 - p * 120;
          const py = T.base - 26 - p * 90 + Math.sin(p * 9) * 4;
          if (ev > 1) {
            const flap = Math.floor(ev * 10) % 2;
            g.px(px, py, hex('#8a8a90'));
            g.px(px + 1, py, hex('#8a8a90'));
            g.px(px - 1, py - flap, hex('#8a8a90'));
            g.px(px + 2, py - flap, hex('#8a8a90'));
          }
        }

        // Mist over the green.
        drawFog(g, mist, t * 1.5, mix(hex('#3a4a40'), accent, 0.15), 0.4);
      },
    };
  },
};

export default def;

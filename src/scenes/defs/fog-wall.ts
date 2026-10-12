// Wall of Fog: four indistinct musicians on a stage almost swallowed by fog and soft
// pink-blue light. Effects pedals glow at their feet like a tiny city. The audience is
// three blurry shapes and a lamp.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { bakeFog, drawFog, drawFogAdd, shaft, vignette } from './lib/night';

const STAGE_Y = 108;
const PLAYERS = [
  { x: 92, h: 56, guitar: true, seed: 1 },
  { x: 134, h: 60, guitar: true, seed: 2 },
  { x: 186, h: 58, guitar: false, seed: 3 },
  { x: 230, h: 55, guitar: true, seed: 4 },
];
const LAMP = { x: 262, y: 176 };

const def: SceneDef = {
  id: 'fog-wall',
  fps: 12,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const ink = hex('#05040a');
    const back = [hex('#06050c'), hex('#0a0814'), hex('#100c1c')];
    const peri = accent;
    const pink = mix(accent, hex('#ff8ac0'), 0.65);
    const blue = mix(accent, hex('#5a8aff'), 0.5);
    const fogC = mix(hex('#3a3850'), accent, 0.35);
    const sil = hex('#0a0912');
    const lampC = hex('#ffc890');
    const ledC: Color[] = [hex('#ff4a4a'), hex('#4aff8a'), hex('#4ab0ff'), hex('#ffc04a'), hex('#ff6ad8')];
    const fogs = [
      bakeFog(20, 80, 41, { sx: 70, sy: 22, lo: 0.3, gain: 1.6, edge: 0.6 }),
      bakeFog(60, 70, 43, { sx: 50, sy: 16, lo: 0.32, gain: 1.8, edge: 0.7 }),
      bakeFog(92, 60, 47, { sx: 40, sy: 12, lo: 0.34, gain: 2, edge: 0.8 }),
    ];

    const body = (g: Gfx, p: (typeof PLAYERS)[number], x: number, look: number, c: Color, a: number) => {
      const foot = STAGE_Y;
      const top = foot - p.h;
      const bow = 4 - look * 4;
      // legs
      g.rectA(x - 4, foot - 22, 3, 22, c, a);
      g.rectA(x + 1, foot - 22, 3, 22, c, a);
      // torso, shoulders
      g.poly([x - 7, foot - 22, x + 7, foot - 22, x + 7, top + 14, x - 7, top + 14], c, 1, a);
      g.ellipseA(x, top + 15, 8, 3, c, a);
      // bowed head with long hair falling forward
      const hx = x + Math.round(bow * 0.6);
      const hy = top + 7 + Math.round(bow * 0.7);
      g.ellipseA(hx, hy, 5, 6, c, a);
      g.rectA(hx - 1, hy, 7, 9, c, a);
      if (p.guitar) {
        g.ellipseA(x - 3, foot - 27, 7, 5, c, a);
        g.lineA(x - 2, foot - 29, x + 17, foot - 40, c, a);
        g.lineA(x - 2, foot - 28, x + 17, foot - 39, c, a);
        g.lineA(x - 6, top + 18, x - 4, foot - 28, c, a);
      } else {
        g.lineA(x - 10, top + 6, x - 10, foot, c, a);
        g.lineA(x - 10, top + 8, x - 5, top + 10, c, a);
        g.lineA(x - 6, top + 18, x - 9, top + 10, c, a);
      }
    };
    const musician = (g: Gfx, p: (typeof PLAYERS)[number], t: number, sway: number, look: number) => {
      const x = Math.round(p.x + sway);
      body(g, p, x - 1, look, sil, 0.45);
      body(g, p, x + 1, look, sil, 0.45);
      body(g, p, x, look, sil, 0.85);
      void t;
    };

    return {
      background(g) {
        g.vgrad(back, g.top, STAGE_Y);
        // amps and a drum riser at the back, barely there
        for (const ax of [70, 112, 210, 250]) {
          g.rect(ax - 9, STAGE_Y - 26, 18, 26, hex('#0c0a14'));
          g.rect(ax - 7, STAGE_Y - 24, 14, 12, hex('#110e1a'));
        }
        g.rect(150, STAGE_Y - 12, 24, 12, hex('#0c0a14'));
        g.ellipse(162, STAGE_Y - 14, 8, 5, hex('#100c18'));
        // stage floor
        g.vgrad([hex('#0e0c16'), hex('#08070e'), hex('#050409')], STAGE_Y, g.bottom, STAGE_Y);
        g.hline(g.left, g.right, STAGE_Y, mix(hex('#141020'), accent, 0.2));
        g.rect(g.left, STAGE_Y + 8, g.w, 2, hex('#04030a'));
        // backlights glowing through the fog
        g.glow(120, 40, 90, pink, 0.12, 6);
        g.glow(210, 36, 90, blue, 0.12, 6);
        vignette(g, 0.5, 160, 80, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;
        const clear = f.rare === 0 && ev < 12 ? envelope(ev, 12, 3, 3) : 0;
        const thick = f.rare === 3 && ev < 12 ? envelope(ev, 12, 3, 3) : 0;

        // Beams from the back lights, swelling with the music.
        const bk = (0.05 + e * 0.05) * (0.5 + 0.5 * awake);
        shaft(g, 112, g.top - 10, 70, 150, 6, 110, pink, bk, 0.3, 5);
        shaft(g, 214, g.top - 10, 250, 150, 6, 110, blue, bk, 0.3, 5);
        shaft(g, 164, g.top - 20, 164, 150, 4, 70, peri, bk * 0.6, 0.4, 5);

        // ── the band ──
        for (let i = 0; i < PLAYERS.length; i++) {
          const p = PLAYERS[i]!;
          const sway = f.reduced ? 0 : Math.sin(t * 0.6 + p.seed * 1.7) * 1.5 * (0.4 + 0.6 * awake);
          const look = f.rare === 0 && i === 1 && ev > 5 && ev < 6.6 ? 1 : 0;
          musician(g, p, t, sway, look);
        }
        // Rare: a fifth player, who nobody booked.
        if (f.rare === 2 && ev < 12) {
          const k = envelope(ev, 12, 3, 3);
          const x = 160 + Math.sin(ev * 0.5) * 3;
          g.ellipseA(x, STAGE_Y - 34, 4, 4, sil, 0.7 * k);
          g.rectA(x - 5, STAGE_Y - 30, 10, 30, sil, 0.6 * k);
        }

        // Pedalboards at their feet: a tiny city of lights.
        for (let i = 0; i < PLAYERS.length; i++) {
          const p = PLAYERS[i]!;
          const bx = p.x - 8;
          g.rect(bx, STAGE_Y - 2, 22, 3, hex('#0c0a12'));
          for (let k = 0; k < 7; k++) {
            const c = ledC[(k + i * 2) % ledC.length]!;
            const on = hash3(k, i, Math.floor(t * (0.3 + hash3(k, i) * 0.5))) > 0.25;
            if (!on) continue;
            const lx = bx + 2 + k * 3;
            g.px(lx, STAGE_Y - 2, c);
            g.glow(lx, STAGE_Y - 1, 4, c, 0.3 + f.pulse * 0.2 * awake);
          }
        }

        // Fog: three layers, slow, lit pink on the left and blue on the right.
        const fk = (1 - clear * 0.8) * (1 + thick * 0.6);
        drawFog(g, fogs[0]!, t * 1.2, fogC, 0.55 * fk);
        drawFogAdd(g, fogs[1]!, -t * 1.8, mix(pink, blue, 0.5 + 0.5 * Math.sin(t * 0.1)), 0.12 * fk);
        drawFog(g, fogs[2]!, t * 2.4, fogC, 0.6 * fk);
        if (thick > 0) g.tintAll(fogC, thick * 0.4);
        // the pedals still show through the thickest fog
        if (thick > 0.3)
          for (let i = 0; i < PLAYERS.length; i++)
            for (let k = 0; k < 7; k++) if ((k + i) % 2 === 0) g.pxAdd(PLAYERS[i]!.x - 6 + k * 3, STAGE_Y - 2, ledC[(k + i * 2) % ledC.length]!, 0.6 * thick);
        // Rare: when the fog clears, everyone is staring at their shoes. Shoes glow faintly.
        if (clear > 0.4) for (const p of PLAYERS) {
          g.rectA(p.x - 6, STAGE_Y - 2, 5, 2, hex('#c8c0d8'), 0.3 * clear);
          g.rectA(p.x + 1, STAGE_Y - 2, 5, 2, hex('#c8c0d8'), 0.3 * clear);
        }

        // ── the audience: three blurry shapes and a lamp ──
        const heads = [
          { x: 110, y: 140, r: 10 },
          { x: 160, y: 146, r: 12 },
          { x: 210, y: 141, r: 10 },
        ];
        for (let i = 0; i < heads.length; i++) {
          const h = heads[i]!;
          const nod = f.reduced ? 0 : Math.round(Math.max(0, Math.sin(t * 1.4 + i)) * 1.5 * awake);
          for (let k = 2; k >= 0; k--) {
            const a = k === 0 ? 0.92 : 0.3;
            g.ellipseA(h.x, h.y + h.r * 2.6, h.r * 2.3 + k, h.r * 1.7 + k, ink, a);
            g.ellipseA(h.x, h.y + nod, h.r + k, h.r * 1.1 + k, ink, a);
          }
          g.ellipseA(h.x - 2, h.y - h.r + 2 + nod, h.r * 0.7, 2, mix(pink, blue, i / 2), 0.12);
        }
        // the lamp: a floor lamp with a fabric shade, lit, turning toward the stage now and then
        const turn = f.rare === 1 && ev < 12 ? envelope(ev, 12, 2, 2) : 0;
        const lsway = f.rare === 1 && ev < 12 && !f.reduced ? Math.sin(ev * 2.2) * 2 * turn : 0;
        const { x, y } = LAMP;
        g.vline(x, y - 50, g.bottom, hex('#1a1612'));
        const sx = x + lsway;
        g.poly([sx - 10 + turn * 3, y - 50, sx + 10 - turn * 1, y - 50, sx + 7, y - 63 - turn * 2, sx - 7 + turn * 2, y - 63], mix(hex('#3a2a20'), lampC, 0.4));
        g.hline(sx - 10 + turn * 3, sx + 9, y - 50, mix(lampC, hex('#ffffff'), 0.2));
        g.glow(sx, y - 52, 30, lampC, 0.16);
        g.ellipseA(sx, y - 48, 14, 3, lampC, 0.12);
        void shade;
        void clamp;
        void smoothstep;
      },
    };
  },
};

export default def;

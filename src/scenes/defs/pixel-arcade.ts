// 8-Bit Afterlife: an arcade long after closing time, lit only by its screens. Little ghosts
// play the cabinets; one keeps losing and sighs. The high-score board shows absurd names.
// Dim neon carpet, blinking coin slots.

import { lightPool } from '../kit/atmos';
import { type Color, hex, hsv, mix, shade } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { dome, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const FLOOR_Y = 150;
const CAB_Y = 64;
const CABS = [
  { x: 58, color: hex('#7a4ad8') },
  { x: 112, color: hex('#d84a6a') },
  { x: 166, color: hex('#2aa8b8') },
  { x: 220, color: hex('#e8a83a') },
];
const CW = 42;
const SCR_Y = 78;
const SCR_H = 28;

const SCORES = [
  ['1', 'BOO', '999990'],
  ['2', 'AAA', '512000'],
  ['3', 'MOM', '333333'],
  ['4', '???', '000404'],
  ['5', 'YOU', '000001'],
];

const def: SceneDef = {
  id: 'pixel-arcade',
  fps: 20,
  rareEvents: 3,
  rareDuration: 6,
  focusY: 92,
  grade: { contrast: 1.15, saturation: 0.85, bloom: 0.75, threshold: 0.62, vignette: 0.45 },
  create({ accent }) {
    const ink = hex('#040309');
    const wall = [hex('#07060f'), hex('#0b0918'), hex('#100d22')];
    const ghostC = hex('#d6d2ee');
    const ghostS = hex('#8a84b8');
    const scr = hex('#040a08');
    const green = mix(accent, hex('#a0d0b0'), 0.2);
    const ALIENS = [hex('#d85ab8'), hex('#5ad0e0'), hex('#e0c060')];

    const drawGhost = (g: Gfx, x: number, y: number, t: number, front: boolean, alpha = 1, slump = 0, look = 0) => {
      x = Math.round(x);
      y = Math.round(y + slump * 3);
      const h = 14 - Math.round(slump * 2);
      const body = (c: Color, grow: number) => {
        dome(g, x, y, 7 + grow, 7 + grow, c);
        g.rect(x - 7 - grow, y, 15 + grow * 2, h - 6 + grow, c);
        for (let i = 0; i < 5; i++) {
          const bx = x - 7 + i * 3 + ((Math.floor(t * 6) % 2) as number);
          g.rect(bx - grow, y + h - 6 + grow, 2 + grow, 2, c);
        }
      };
      if (alpha < 1) {
        dome(g, x, y, 7, 7, ghostC);
        g.rectA(x - 7, y, 15, h - 4, ghostC, alpha);
        return;
      }
      body(ink, 1);
      body(ghostC, 0);
      g.rect(x + 4, y - 4, 3, h - 2, ghostS);
      if (front) {
        g.rect(x - 4 + look, y - 2, 2, 3, ink);
        g.rect(x + 2 + look, y - 2, 2, 3, ink);
        g.px(x - 4 + look, y - 2, hex('#ffffff'));
        g.px(x + 2 + look, y - 2, hex('#ffffff'));
        g.hline(x - 1, x + 1, y + 3, ghostS);
      }
    };

    return {
      background(g) {
        // Wall with neon stripes and a ceiling tube.
        g.vgrad(wall, g.top, FLOOR_Y);
        for (let x = g.left - (g.left % 24); x < g.right; x += 24) g.rect(x, g.top, 1, FLOOR_Y - g.top, hex('#0e0c1e'));
        // one neon tube along the wall, most of it dark
        g.rect(g.left, 14, g.w, 1, mix(green, wall[1]!, 0.7));
        g.rectAdd(g.left, 12, g.w, 5, green, 0.03);

        // High-score board.
        const bx = 110;
        const by = 20;
        const bw = 100;
        const bh = 41;
        g.rect(bx - 2, by - 2, bw + 4, bh + 4, ink);
        frameRect(g, bx - 1, by - 1, bw + 2, bh + 2, shade(green, 0.35));
        g.rect(bx, by, bw, bh, hex('#020403'));
        const led = mix(green, hex('#d8ffe0'), 0.2);
        SCORES.forEach(([rank, name, score], i) => {
          const y = by + 10 + i * 6;
          const c = i === 4 ? mix(led, hex('#e07a8a'), 0.6) : shade(led, i === 0 ? 1 : 0.75);
          g.text(rank!, bx + 10, y, c);
          g.text(name!, bx + 22, y, c);
          g.text(score!, bx + 60, y, c);
        });
        g.glow(bx + bw / 2, by + bh / 2, 60, green, 0.05, 4);

        // Neon carpet.
        g.vgrad([hex('#07061a'), hex('#040310')], FLOOR_Y, g.bottom, FLOOR_Y);
        const carpet = [hex('#ff4fd8'), hex('#4ff0ff'), hex('#ffd34f'), green];
        for (let i = 0; i < 420; i++) {
          const x = -80 + hash3(i, 1) * 480;
          const y = FLOOR_Y + 4 + hash3(i, 2) * 240;
          if (y > g.bottom + 4) continue;
          const c = mix(shade(carpet[i % 4]!, 0.22 + hash3(i, 5) * 0.12), hex('#0a0818'), 0.3);
          const kind = i % 4;
          if (kind === 0) {
            for (let k = 0; k < 8; k++) g.px(x + k, y + Math.round(Math.sin(k * 1.2)), c);
          } else if (kind === 1) {
            g.ring(x, y, 2, 2, c);
          } else if (kind === 2) {
            g.px(x, y - 1, c);
            g.hline(x - 1, x + 1, y, c);
            g.px(x, y + 1, c);
          } else {
            g.line(x, y, x + 3, y - 3, c);
            g.line(x + 3, y - 3, x + 6, y, c);
          }
        }

        // Cabinets.
        for (const cab of CABS) {
          const x = cab.x;
          const c = cab.color;
          const dark = mix(shade(c, 0.16), hex('#06050c'), 0.4);
          // side panels and body
          g.rect(x - 1, CAB_Y, CW + 2, FLOOR_Y - CAB_Y + 2, ink);
          g.rect(x, CAB_Y + 1, CW, FLOOR_Y - CAB_Y, dark);
          g.rect(x, CAB_Y + 1, 2, FLOOR_Y - CAB_Y, shade(c, 0.45));
          g.rect(x + CW - 2, CAB_Y + 1, 2, FLOOR_Y - CAB_Y, shade(c, 0.3));
          // backlit marquee
          g.rect(x + 3, CAB_Y + 2, CW - 6, 9, mix(c, hex('#f0e8e0'), 0.3));
          g.rect(x + 3, CAB_Y + 10, CW - 6, 1, ink);
          // screen bezel
          g.rect(x + 4, SCR_Y - 2, CW - 8, SCR_H + 4, ink);
          g.rect(x + 6, SCR_Y, CW - 12, SCR_H, scr);
          // control panel
          g.poly([x, 110, x + CW, 110, x + CW + 2, 118, x - 2, 118], shade(c, 0.3));
          g.rect(x - 2, 118, CW + 4, 2, ink);
          g.rect(x + 10, 110, 2, 4, ink);
          g.disc(x + 11, 109, 2, hex('#a83a3a'));
          g.disc(x + 26, 114, 1, hex('#b89a4a'));
          g.disc(x + 31, 114, 1, hex('#4a9aa8'));
          // coin door
          g.rect(x + 13, 128, 16, 14, shade(c, 0.12));
          frameRect(g, x + 13, 128, 16, 14, ink);
        }
        // marquee titles
        g.textCenter('ZAP', CABS[0]!.x + CW / 2, CAB_Y + 4, ink);
        g.textCenter('SNEK', CABS[1]!.x + CW / 2, CAB_Y + 4, ink);
        g.textCenter('BRIX', CABS[2]!.x + CW / 2, CAB_Y + 4, ink);
        g.textCenter('JUMP', CABS[3]!.x + CW / 2, CAB_Y + 4, ink);

        // Soda machine on the far right, a plant on the far left (wide views).
        roundRect(g, 276, 70, 30, 80, 2, ink);
        g.rect(278, 72, 26, 76, hex('#3a1018'));
        g.rect(281, 76, 14, 40, hex('#d8c8c0'));
        for (let k = 0; k < 4; k++) g.rect(283, 80 + k * 9, 10, 6, hex('#a83a4a'));
        g.rect(297, 78, 4, 20, hex('#1a060a'));
        g.rect(16, 122, 16, 28, hex('#1a120e'));
        g.ellipse(24, 112, 12, 12, hex('#0c1a14'));
        g.ellipse(22, 108, 8, 8, hex('#12261c'));

        g.lighting(0.4);
        for (const cab of CABS) g.light(cab.x + CW / 2, SCR_Y + 20, 40, 0.75, 46);
        g.light(160, 40, 60, 0.35, 26);
        g.light(288, 96, 34, 0.5, 50);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // High-score header in cycling colors.
        const head = 'HI-SCORES';
        g.textCenter(head, 160, 22, f.reduced || Math.floor(t * 0.5) % 6 ? mix(green, hex('#d8ffe0'), 0.3) : shade(green, 0.5));
        const winner = f.rare === 1 && ev < 6;
        if (winner && Math.floor(ev * 3) % 2 === 0) g.text('NEW!', 113, 50, hex('#e0c060'));

        // ── screens ──
        // ZAP: a little shooter
        {
          const x0 = CABS[0]!.x + 6;
          const w = CW - 12;
          g.clip(x0, SCR_Y, w, SCR_H);
          const shift = Math.round(Math.sin(t * 0.8) * 4);
          for (let r = 0; r < 3; r++)
            for (let c = 0; c < 5; c++) {
              if (hash3(c, r, Math.floor(t / 6)) < 0.25) continue;
              const ax = x0 + 3 + c * 5 + shift;
              const ay = SCR_Y + 3 + r * 4;
              g.rect(ax, ay, 3, 2, ALIENS[r]!);
              if (Math.floor(t * 4) % 2) g.px(ax - 1, ay + 2, hex('#ff4fd8'));
            }
          const sx = x0 + w / 2 + Math.sin(t * 1.7) * 10;
          g.rect(sx - 2, SCR_Y + SCR_H - 4, 5, 2, green);
          g.px(sx, SCR_Y + SCR_H - 5, green);
          const by = SCR_Y + SCR_H - 6 - ((t * 30) % 22);
          g.vline(sx, by, by + 1, hex('#ffffff'));
          g.noClip();
        }
        // SNEK: a growing snake
        {
          const x0 = CABS[1]!.x + 6;
          const w = CW - 12;
          g.clip(x0, SCR_Y, w, SCR_H);
          const len = 6 + Math.floor((t % 30) / 2);
          for (let k = 0; k < len; k++) {
            const p = t * 8 - k;
            const px = x0 + 2 + Math.abs(((p % 50) + 50) % 50 - 25);
            const py = SCR_Y + 3 + Math.floor(Math.abs((((p / 25) % 6) + 6) % 6 - 3) * 6);
            g.rect(px, py, 2, 2, k === 0 ? hex('#ffffff') : green);
          }
          g.rect(x0 + 6 + ((hash3(Math.floor(t / 4), 2) * 20) | 0), SCR_Y + 6 + ((hash3(Math.floor(t / 4), 3) * 16) | 0), 2, 2, hex('#ff4a4a'));
          g.noClip();
        }
        // BRIX: bricks, paddle, ball
        {
          const x0 = CABS[2]!.x + 6;
          const w = CW - 12;
          g.clip(x0, SCR_Y, w, SCR_H);
          for (let r = 0; r < 3; r++)
            for (let c = 0; c < 6; c++) {
              if (hash3(c, r, Math.floor(t / 3)) < 0.3) continue;
              g.rect(x0 + 1 + c * 5, SCR_Y + 2 + r * 3, 4, 2, hsv(r * 0.15, 0.7, 1));
            }
          const bxp = Math.abs(((t * 22) % (2 * (w - 2))) - (w - 2));
          const byp = Math.abs(((t * 17) % (2 * (SCR_H - 12))) - (SCR_H - 12));
          g.rect(x0 + 1 + bxp, SCR_Y + 10 + byp, 2, 2, hex('#ffffff'));
          g.rect(x0 + bxp - 3, SCR_Y + SCR_H - 3, 9, 2, hex('#4ff0ff'));
          g.noClip();
        }
        // JUMP: the game our unlucky ghost keeps losing
        const cyc = t % 20;
        const over = cyc > 12;
        {
          const x0 = CABS[3]!.x + 6;
          const w = CW - 12;
          g.clip(x0, SCR_Y, w, SCR_H);
          if (!over) {
            const scroll = (t * 12) % 12;
            for (let k = -1; k < 4; k++) {
              const gx = x0 + k * 12 - scroll;
              g.rect(gx, SCR_Y + SCR_H - 5, 9, 5, hex('#3a8a3a'));
              g.rect(gx, SCR_Y + SCR_H - 5, 9, 1, green);
            }
            const jump = Math.max(0, Math.sin(t * 4.2)) * 8;
            g.rect(x0 + 8, SCR_Y + SCR_H - 10 - jump, 3, 5, hex('#ffd34f'));
            g.px(x0 + 10, SCR_Y + SCR_H - 9 - jump, ink);
          } else if (cyc < 15) {
            g.text('GAME', x0 + 7, SCR_Y + 6, hex('#ff4a4a'));
            g.text('OVER', x0 + 7, SCR_Y + 14, hex('#ff4a4a'));
          } else if (Math.floor(t * 2) % 2 || f.reduced) {
            g.text('COIN?', x0 + 5, SCR_Y + 10, hex('#ffd34f'));
          }
          g.noClip();
        }
        // screen glow + scanlines
        for (const cab of CABS) {
          g.glow(cab.x + CW / 2, SCR_Y + SCR_H / 2, 26, cab.color, 0.08 + f.energy * 0.1, 4);
          lightPool(g, cab.x + CW / 2, FLOOR_Y + 6, 26, 6, cab.color, 0.12 + f.energy * 0.06);
          for (let y = SCR_Y + 1; y < SCR_Y + SCR_H; y += 2) g.rectMul(cab.x + 6, y, CW - 12, 1, 0.82);
          // coin slots blink out of step
          const on = f.reduced ? true : Math.floor(t * 1.5 + cab.x) % 2 === 0;
          g.rect(cab.x + 16, 132, 3, 6, on ? hex('#e07a3a') : hex('#2a1a12'));
          g.rect(cab.x + 23, 132, 3, 6, !on ? hex('#e07a3a') : hex('#2a1a12'));
          g.glow(cab.x + (on ? 17 : 24), 135, 4, hex('#e07a3a'), 0.25);
        }

        // ── ghosts ──
        const turned = f.rare === 0 && ev < 6 ? envelope(ev, 6, 0.3, 0.5) : 0;
        for (let i = 0; i < 4; i++) {
          const cab = CABS[i]!;
          let x = cab.x + CW / 2 + (i % 2 ? 4 : -4);
          const bob = Math.sin(t * 2 + i * 1.7) * 1.5 * (0.4 + 0.6 * awake) + (f.pulse > 0.5 && i % 2 === f.beat % 2 ? -1 : 0);
          const y = 128 + bob;
          let slump = 0;
          if (i === 3) {
            if (cyc > 12 && cyc < 17) slump = envelope(cyc - 12, 5, 0.6, 0.8);
          }
          const phasing = f.rare === 2 && ev < 6 && i === 1;
          if (phasing) x += (ev / 6) * 54 - 10;
          const alpha = phasing && ev > 1 && ev < 5 ? 0.4 : 1;
          drawGhost(g, x, y, t, turned > 0.5, alpha, slump, 0);
          g.glow(x, y + 2, 12, mix(ghostC, cab.color, 0.4), 0.06);
          // little arm on the joystick, wiggling
          if (!phasing && turned < 0.5 && !(i === 3 && over)) {
            const wig = Math.round(Math.sin(t * (6 + i)) * 1.5 * awake);
            g.rect(x - 9, y + 1 + wig, 3, 2, ghostC);
          }
        }
        // the sigh
        if (cyc > 12.6 && cyc < 15.5) {
          const p = (cyc - 12.6) / 2.9;
          const sx = CABS[3]!.x + CW / 2 + 4 + p * 8;
          const sy = 116 - p * 14;
          g.ellipseA(sx, sy, 3 + p * 3, 2 + p, hex('#c8c4e8'), 0.5 * (1 - p));
        }
        // coin going in at the end of the cycle
        if (cyc > 16 && cyc < 17.2) {
          const p = (cyc - 16) / 1.2;
          g.disc(CABS[3]!.x + 17 + (1 - p) * 8, 130 + p * 4, 1, hex('#e0c060'));
        }

        // A waiting ghost by the soda machine, holding a cup and watching.
        const wx = 268;
        const wy = 126 + Math.sin(t * 1.6) * 1.5;
        const look = Math.sin(t * 0.4) > 0 ? -1 : 0;
        drawGhost(g, wx, wy, t, true, 1, 0, look);
        if (blinking(t, 31)) g.rect(wx - 4 + look, wy - 2, 8, 2, ghostC);
        g.rect(wx + 6, wy + 1, 3, 4, hex('#8a2a34'));
        g.px(wx + 7, wy - 1, hex('#d8d0c8'));

        // Confetti for a rare win.
        if (winner) {
          for (let i = 0; i < 30; i++) {
            const p = clamp(ev / 4 - hash3(i, 1) * 0.2);
            const x = CABS[2]!.x + CW / 2 + (hash3(i, 2) - 0.5) * 60 * p;
            const y = SCR_Y + 10 - Math.sin(p * Math.PI) * 30 + p * 40;
            if (p > 0 && p < 1) g.px(x, y, hsv(hash3(i, 3), 0.5, 0.9));
          }
        }
      },
    };
  },
};

export default def;

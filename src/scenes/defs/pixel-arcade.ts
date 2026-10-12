// 8-Bit Afterlife: friendly little ghosts play arcade cabinets. One keeps losing and sighs.
// A high-score board shows absurd names. Neon carpet, blinking coin slots.

import { type Color, hex, hsv, mix, shade } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { dome, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const FLOOR_Y = 146;
const CABS = [
  { x: 58, color: hex('#7a4ad8') },
  { x: 112, color: hex('#d84a6a') },
  { x: 166, color: hex('#2aa8b8') },
  { x: 220, color: hex('#e8a83a') },
];
const CW = 42;
const SCR_Y = 74;
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
  create({ accent }) {
    const ink = hex('#07060f');
    const wall = [hex('#0d0a22'), hex('#151036'), hex('#1c1648')];
    const ghostC = hex('#f2eeff');
    const ghostS = hex('#b8b0e8');
    const scr = hex('#06100c');
    const green = accent;
    const ALIENS = [hex('#ff4fd8'), hex('#4ff0ff'), hex('#ffd34f')];

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
        g.px(x - 6, y + 2, hex('#ffb0c8'));
        g.px(x + 6, y + 2, hex('#ffb0c8'));
        g.hline(x - 1, x + 1, y + 3, ink);
      }
    };

    return {
      background(g) {
        // Wall with neon stripes and a ceiling tube.
        g.vgrad(wall, g.top, FLOOR_Y);
        for (let x = g.left - (g.left % 24); x < g.right; x += 24) g.rect(x, g.top, 1, FLOOR_Y - g.top, hex('#1a1440'));
        g.rect(g.left, 58, g.w, 2, mix(green, wall[1]!, 0.5));
        g.rect(g.left, 62, g.w, 1, mix(hex('#ff4fd8'), wall[1]!, 0.5));
        g.rectAdd(g.left, 56, g.w, 8, green, 0.06);

        // High-score board.
        const bx = 108;
        const by = 4;
        const bw = 104;
        const bh = 48;
        g.rect(bx - 2, by - 2, bw + 4, bh + 4, ink);
        frameRect(g, bx - 1, by - 1, bw + 2, bh + 2, green);
        g.rect(bx, by, bw, bh, hex('#05080a'));
        SCORES.forEach(([rank, name, score], i) => {
          const y = by + 12 + i * 7;
          const c = i === 0 ? hex('#ffd34f') : i === 4 ? hex('#ff8fb1') : hex('#c8ffd8');
          g.text(rank!, bx + 10, y, c);
          g.text(name!, bx + 22, y, c);
          g.text(score!, bx + 62, y, c);
        });
        g.glow(bx + bw / 2, by + bh / 2, 70, green, 0.08, 4);

        // Neon carpet.
        g.vgrad([hex('#0a0820'), hex('#07061a')], FLOOR_Y, g.bottom, FLOOR_Y);
        const carpet = [hex('#ff4fd8'), hex('#4ff0ff'), hex('#ffd34f'), green];
        for (let i = 0; i < 420; i++) {
          const x = -80 + hash3(i, 1) * 480;
          const y = FLOOR_Y + 4 + hash3(i, 2) * 240;
          if (y > g.bottom + 4) continue;
          const c = shade(carpet[i % 4]!, 0.45 + hash3(i, 5) * 0.3);
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
          const dark = shade(c, 0.45);
          // side panels and body
          g.rect(x - 1, 60, CW + 2, FLOOR_Y - 58, ink);
          g.rect(x, 61, CW, FLOOR_Y - 60, dark);
          g.rect(x, 61, 3, FLOOR_Y - 60, c);
          g.rect(x + CW - 3, 61, 3, FLOOR_Y - 60, c);
          // marquee
          g.rect(x + 3, 62, CW - 6, 9, mix(c, hex('#ffffff'), 0.25));
          g.rect(x + 3, 70, CW - 6, 1, ink);
          // screen bezel
          g.rect(x + 4, SCR_Y - 2, CW - 8, SCR_H + 4, ink);
          g.rect(x + 6, SCR_Y, CW - 12, SCR_H, scr);
          // control panel
          g.poly([x, 106, x + CW, 106, x + CW + 2, 114, x - 2, 114], shade(c, 0.7));
          g.rect(x - 2, 114, CW + 4, 2, ink);
          g.rect(x + 10, 106, 2, 4, ink);
          g.disc(x + 11, 105, 2, hex('#e04a4a'));
          g.disc(x + 26, 110, 1, hex('#ffd34f'));
          g.disc(x + 31, 110, 1, hex('#4ff0ff'));
          // coin door
          g.rect(x + 13, 124, 16, 14, shade(c, 0.3));
          frameRect(g, x + 13, 124, 16, 14, ink);
        }
        // marquee titles
        g.textCenter('ZAP', CABS[0]!.x + CW / 2, 64, ink);
        g.textCenter('SNEK', CABS[1]!.x + CW / 2, 64, ink);
        g.textCenter('BRIX', CABS[2]!.x + CW / 2, 64, ink);
        g.textCenter('JUMP', CABS[3]!.x + CW / 2, 64, ink);

        // Soda machine on the far right, a plant on the far left (wide views).
        roundRect(g, 276, 66, 30, 80, 2, ink);
        g.rect(278, 68, 26, 76, hex('#c83a4a'));
        g.rect(281, 72, 14, 40, hex('#ffe8e8'));
        g.text('POP', 282, 80, hex('#c83a4a'));
        g.rect(297, 74, 4, 20, hex('#2a0a10'));
        g.rect(16, 118, 16, 28, hex('#5a3a2a'));
        g.ellipse(24, 108, 12, 12, hex('#1e5a3a'));
        g.ellipse(22, 104, 8, 8, hex('#2e7a4a'));
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // High-score header in cycling colors.
        const head = 'HI-SCORES';
        let hx = 160 - 18;
        for (let i = 0; i < head.length; i++) {
          const c = f.reduced ? hex('#5dff8a') : hsv((t * 0.3 + i * 0.08) % 1, 0.6, 1);
          hx += g.text(head[i]!, hx, 8, c) + 1;
        }
        const winner = f.rare === 1 && ev < 6;
        if (winner && Math.floor(ev * 3) % 2 === 0) g.text('NEW!', 112, 44, hex('#ffd34f'));

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
          g.glow(cab.x + CW / 2, SCR_Y + SCR_H / 2, 26, cab.color, 0.1 + f.energy * 0.15, 4);
          for (let y = SCR_Y + 1; y < SCR_Y + SCR_H; y += 2) g.rectMul(cab.x + 6, y, CW - 12, 1, 0.82);
          // coin slots blink out of step
          const on = f.reduced ? true : Math.floor(t * 1.5 + cab.x) % 2 === 0;
          g.rect(cab.x + 16, 128, 3, 6, on ? hex('#ff8a3a') : hex('#4a2a1a'));
          g.rect(cab.x + 23, 128, 3, 6, !on ? hex('#ff8a3a') : hex('#4a2a1a'));
          if (on) g.glow(cab.x + 17, 131, 4, hex('#ff8a3a'), 0.3);
        }

        // ── ghosts ──
        const turned = f.rare === 0 && ev < 6 ? envelope(ev, 6, 0.3, 0.5) : 0;
        for (let i = 0; i < 4; i++) {
          const cab = CABS[i]!;
          let x = cab.x + CW / 2 + (i % 2 ? 4 : -4);
          const bob = Math.sin(t * 2 + i * 1.7) * 1.5 * (0.4 + 0.6 * awake) + (f.pulse > 0.5 && i % 2 === f.beat % 2 ? -1 : 0);
          const y = 124 + bob;
          let slump = 0;
          if (i === 3) {
            if (cyc > 12 && cyc < 17) slump = envelope(cyc - 12, 5, 0.6, 0.8);
          }
          const phasing = f.rare === 2 && ev < 6 && i === 1;
          if (phasing) x += (ev / 6) * 54 - 10;
          const alpha = phasing && ev > 1 && ev < 5 ? 0.4 : 1;
          drawGhost(g, x, y, t, turned > 0.5, alpha, slump, 0);
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
          const sy = 112 - p * 14;
          g.ellipseA(sx, sy, 3 + p * 3, 2 + p, hex('#e8e4ff'), 0.6 * (1 - p));
          if (p < 0.6) g.text('...', sx + 6, sy - 4, mix(hex('#e8e4ff'), wall[1]!, p));
        }
        // coin going in at the end of the cycle
        if (cyc > 16 && cyc < 17.2) {
          const p = (cyc - 16) / 1.2;
          g.disc(CABS[3]!.x + 17 + (1 - p) * 8, 126 + p * 4, 1, hex('#ffd34f'));
        }

        // A waiting ghost by the soda machine, holding a cup and watching.
        const wx = 268;
        const wy = 122 + Math.sin(t * 1.6) * 1.5;
        const look = Math.sin(t * 0.4) > 0 ? -1 : 0;
        drawGhost(g, wx, wy, t, true, 1, 0, look);
        if (blinking(t, 31)) g.rect(wx - 4 + look, wy - 2, 8, 2, ghostC);
        g.rect(wx + 6, wy + 1, 3, 4, hex('#c83a4a'));
        g.px(wx + 7, wy - 1, hex('#ffffff'));

        // Confetti for a rare win.
        if (winner) {
          for (let i = 0; i < 30; i++) {
            const p = clamp(ev / 4 - hash3(i, 1) * 0.2);
            const x = CABS[2]!.x + CW / 2 + (hash3(i, 2) - 0.5) * 60 * p;
            const y = SCR_Y + 10 - Math.sin(p * Math.PI) * 30 + p * 40;
            if (p > 0 && p < 1) g.px(x, y, hsv(hash3(i, 3), 0.7, 1));
          }
        }
      },
    };
  },
};

export default def;

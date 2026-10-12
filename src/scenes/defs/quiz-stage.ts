// Win This Planet!: a game-show stage in a darkened studio. Three contestants (a robot, a
// nervous blob and a grandmother) wait at lit podiums; a prize wheel with a whole planet
// at its hub turns behind them; chaser lights run; the host's microphone is far too long.

import { type Color, hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { shaft, vignette } from './lib/night';

const WHEEL = { x: 160, y: 56, r: 31 };
const FLOOR_Y = 124;
const PODS = [
  { x: 112, kind: 0 },
  { x: 166, kind: 1 },
  { x: 220, kind: 2 },
];
const HOST = { x: 66, y: FLOOR_Y };

const def: SceneDef = {
  id: 'quiz-stage',
  fps: 15,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#040508');
    const gold = accent;
    const goldD = shade(accent, 0.35);
    const segC: Color[] = [hex('#3a1e3a'), hex('#1e2e4a'), hex('#4a3418'), hex('#1e3a34'), hex('#4a1e22'), hex('#2a2a3e')];
    const cyan = hex('#5ad0e8');
    const bulbOff = hex('#2a2418');
    const spot = hex('#fff0d0');

    const bulbs = (g: Gfx, x0: number, y0: number, x1: number, y1: number, n: number, t: number, phase: number, a: number) => {
      for (let i = 0; i < n; i++) {
        const u = i / Math.max(1, n - 1);
        const x = x0 + (x1 - x0) * u;
        const y = y0 + (y1 - y0) * u;
        const on = (Math.floor(t * 8) + i + phase) % 3 === 0;
        g.px(x, y, on ? mix(gold, hex('#fff8e0'), 0.4) : bulbOff);
        if (on) g.glow(x, y, 3, gold, 0.3 * a);
      }
    };

    const contestant = (g: Gfx, kind: number, x: number, y: number, t: number, sweat: number, look: number) => {
      if (kind === 0) {
        // the robot: a boxy head, an antenna, two square eyes
        g.rect(x - 7, y - 26, 14, 12, hex('#3a4048'));
        g.rect(x - 7, y - 26, 14, 1, hex('#6a7480'));
        g.rect(x - 5, y - 22, 3, 3, cyan);
        g.rect(x + 2, y - 22, 3, 3, cyan);
        g.hline(x - 3, x + 3, y - 17, hex('#1a1e24'));
        g.vline(x, y - 32, y - 26, hex('#6a7480'));
        g.px(x, y - 33, Math.floor(t * 2) % 2 ? hex('#ff4040') : hex('#5a1a1a'));
        g.rect(x - 9, y - 14, 18, 8, hex('#2a3038'));
      } else if (kind === 1) {
        // the blob: green, wobbling, sweating
        const wob = Math.sin(t * 7) * (1 + sweat);
        g.ellipse(x, y - 16, 11 + wob * 0.5, 12 - wob * 0.5, hex('#2a5a3a'));
        g.ellipse(x - 3, y - 20, 5, 4, hex('#3a7a4a'));
        g.disc(x - 4, y - 18, 2, hex('#e8f0e0'));
        g.disc(x + 4, y - 18, 2, hex('#e8f0e0'));
        g.px(x - 4 + look, y - 18, ink);
        g.px(x + 4 + look, y - 18, ink);
        g.hline(x - 3, x + 3, y - 12, hex('#14301e'));
        g.px(x + 3, y - 11, hex('#14301e'));
        for (let i = 0; i < 1 + Math.round(sweat * 3); i++) {
          const p = (t * 0.8 + i * 0.37) % 1;
          g.px(x + 8 - i * 5, y - 26 + p * 10, hex('#a8e0f0'));
        }
      } else {
        // the grandmother: white bun, glasses, a cardigan, unflappable
        g.disc(x, y - 22, 6, hex('#8a6a5a'));
        g.disc(x, y - 29, 4, hex('#d8d4cc'));
        g.ellipse(x, y - 25, 7, 3, hex('#c8c4bc'));
        g.rect(x - 4, y - 23, 3, 2, hex('#e8e8f0'));
        g.rect(x + 1, y - 23, 3, 2, hex('#e8e8f0'));
        g.hline(x - 1, x, y - 22, hex('#3a3030'));
        if (!blinking(t, 31)) {
          g.px(x - 3, y - 22, ink);
          g.px(x + 2, y - 22, ink);
        }
        g.rect(x - 8, y - 15, 16, 9, hex('#6a3a4a'));
        g.vline(x, y - 15, y - 7, hex('#4a2a34'));
      }
    };

    return {
      background(g) {
        // Dark studio: a deep curtain of fine vertical folds.
        for (let y = g.top; y < FLOOR_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const fold = Math.sin(x * 0.7) * 0.5 + 0.5;
            const v = fold * 0.6 * clamp(1 - Math.abs(x - 160) / 220);
            g.px(x, y, v > 0.35 + bayer(x, y) * 0.2 ? hex('#16101e') : v > 0.1 + bayer(x, y) * 0.1 ? hex('#0e0a14') : hex('#08060c'));
          }
        // Glossy black floor.
        g.vgrad([hex('#0c0c12'), hex('#06060a')], FLOOR_Y, g.bottom, FLOOR_Y);
        g.hline(g.left, g.right, FLOOR_Y, hex('#2a2430'));
        // reflections of the wheel and the podiums in the floor
        g.ellipseA(WHEEL.x, FLOOR_Y + 12, 26, 6, gold, 0.05);
        for (const p of PODS) g.rectA(p.x - 13, FLOOR_Y + 2, 26, 14, cyan, 0.04);
        // the wheel's frame and stand
        g.rect(WHEEL.x - 3, WHEEL.y, 6, FLOOR_Y - WHEEL.y, hex('#14121a'));
        g.poly([WHEEL.x - 18, FLOOR_Y, WHEEL.x + 18, FLOOR_Y, WHEEL.x + 8, FLOOR_Y - 14, WHEEL.x - 8, FLOOR_Y - 14], hex('#14121a'));
        g.disc(WHEEL.x, WHEEL.y, WHEEL.r + 4, hex('#1e1a24'));
        g.ring(WHEEL.x, WHEEL.y, WHEEL.r + 4, WHEEL.r + 4, goldD);
        for (const p of PODS) shaft(g, p.x, g.top - 10, p.x, FLOOR_Y, 6, 40, spot, 0.05, 0.2, 5);
        shaft(g, HOST.x, g.top - 10, HOST.x, FLOOR_Y, 6, 36, spot, 0.06, 0.2, 5);
        vignette(g, 0.5, 160, 80, 220, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // The prize wheel: turns slowly; spins hard in a rare moment.
        let ang = t * 0.15;
        if (f.rare === 0 && ev < 10) {
          const p = clamp(ev / 7);
          ang += (1 - (1 - p) * (1 - p) * (1 - p)) * 18;
        }
        const { x: wx, y: wy, r } = WHEEL;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > r * r) continue;
            let a = Math.atan2(dy, dx) + ang;
            a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const seg = Math.floor(a / (Math.PI / 6));
            const edge = (a % (Math.PI / 6)) < 0.04;
            const c = edge ? goldD : segC[seg % segC.length]!;
            g.px(wx + dx, wy + dy, d2 > (r - 2) * (r - 2) ? goldD : c);
          }
        // bulbs round the rim, chasing
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const bx = wx + Math.cos(a) * (r + 3);
          const by = wy + Math.sin(a) * (r + 3);
          const on = (Math.floor(t * 6) + i) % 4 === 0 || (f.rare === 0 && ev > 7 && ev < 10 && Math.floor(ev * 6) % 2 === 0);
          g.px(bx, by, on ? mix(gold, hex('#fff8e0'), 0.5) : bulbOff);
          if (on) g.glow(bx, by, 4, gold, 0.3);
        }
        // the pointer at the top
        g.tri(wx - 4, wy - r - 8, wx + 4, wy - r - 8, wx, wy - r + 2, mix(gold, hex('#fff8e0'), 0.3));
        // the planet at the hub, and its moon (which gets away in a rare moment)
        g.ball(wx, wy, 9, 9, [hex('#0e2238'), hex('#1a4a66'), hex('#3a7a8a'), hex('#8ab8b0')], -0.5, -0.5, 0.3);
        g.px(wx - 3, wy + 1, hex('#3a7a3a'));
        g.px(wx + 2, wy - 3, hex('#3a7a3a'));
        g.ring(wx, wy, 14, 4, mix(gold, hex('#a08060'), 0.5));
        g.glow(wx, wy, 18, cyan, 0.12);
        const moonA = t * 0.9;
        let mx = wx + Math.cos(moonA) * 15;
        let my = wy + Math.sin(moonA) * 5;
        if (f.rare === 3 && ev < 10) {
          if (ev > 1) {
            const fall = Math.min(FLOOR_Y - 3 - my, (ev - 1) * (ev - 1) * 30);
            my += fall;
            mx += fall >= FLOOR_Y - 3 - my - 0.1 ? (ev - 1) * 30 - 10 : (ev - 1) * 6;
            mx = Math.min(mx, g.right + 10);
          }
        }
        g.ball(mx, my, 2, 2, [hex('#5a5a60'), hex('#a8a8b0'), hex('#e8e8f0')], -0.5, -0.5);

        // Spotlights on the podiums.

        // ── contestants and podiums ──
        const buzz = f.rare === 1 && ev < 10 && ev > 1;
        for (let i = 0; i < PODS.length; i++) {
          const p = PODS[i]!;
          const top = FLOOR_Y - 26;
          const sweat = p.kind === 1 ? 0.4 + (buzz ? 1 : 0) + f.energy * 0.3 : 0;
          contestant(g, p.kind, p.x, top + 4, t, sweat, i === 1 && buzz ? -1 : 0);
          // podium: a lit front with a score, bulbs along the top
          g.poly([p.x - 15, top, p.x + 15, top, p.x + 12, FLOOR_Y, p.x - 12, FLOOR_Y], hex('#1a1824'));
          g.hline(p.x - 15, p.x + 14, top, gold);
          const lit = i === 1 && buzz && Math.floor(ev * 5) % 2 === 0;
          g.rect(p.x - 9, top + 6, 18, 9, lit ? mix(gold, hex('#ffffff'), 0.3) : hex('#0a0c14'));
          const score = [120, 3, 9000][i]!;
          if (!lit) g.textCenter(String(score), p.x, top + 8, mix(cyan, hex('#0a0c14'), 0.2));
          bulbs(g, p.x - 12, FLOOR_Y - 2, p.x + 12, FLOOR_Y - 2, 7, t, i, awake);
        }
        if (buzz && ev < 3) g.text('BZZT', PODS[1]!.x + 14, FLOOR_Y - 46, mix(gold, hex('#ffffff'), 0.3));

        // ── the host, with a microphone of unreasonable length ──
        const { x, y } = HOST;
        const c = hex('#0e0e16');
        const rim = mix(c, spot, 0.35);
        g.rect(x - 2, y - 16, 2, 16, c);
        g.rect(x + 1, y - 16, 2, 16, c);
        g.poly([x - 6, y - 16, x + 6, y - 16, x + 7, y - 34, x - 7, y - 34], c);
        g.vline(x - 7, y - 33, y - 17, rim);
        g.rect(x - 1, y - 34, 3, 8, hex('#e8e0d0'));
        g.px(x, y - 30, gold);
        g.disc(x, y - 39, 4, hex('#3a2a20'));
        g.rect(x - 4, y - 44, 9, 3, hex('#1a1010'));
        g.px(x + 2, y - 39, hex('#e8e0d0'));
        g.hline(x - 1, x + 3, y - 36, hex('#e8e0d0'));
        const reach = f.rare === 2 && ev < 10 ? envelope(ev, 10, 2.5, 2) : 0;
        const tipX = x + 30 + reach * (PODS[2]!.x - 8 - (x + 30));
        const tipY = y - 34 - reach * 6;
        g.line(x + 6, y - 26, tipX, tipY, hex('#8a8a90'));
        g.line(x + 6, y - 25, tipX, tipY + 1, hex('#3a3a40'));
        g.ellipse(tipX + 1, tipY, 2, 2, hex('#2a2a30'));
        g.px(tipX, tipY - 1, hex('#8a8a90'));
        g.line(x + 6, y - 28, x + 8, y - 26, c);

        // Rare: confetti when the wheel lands.
        if (f.rare === 0 && ev > 7 && ev < 10) {
          for (let i = 0; i < 40; i++) {
            const p = ev - 7;
            const cx = 60 + hash3(i, 1) * 200 + Math.sin(p * 3 + i) * 4;
            const cy = -10 + p * (30 + hash3(i, 2) * 40);
            g.px(cx, cy, i % 3 === 0 ? gold : i % 3 === 1 ? cyan : hex('#e86a8a'));
          }
        }
      },
    };
  },
};

export default def;

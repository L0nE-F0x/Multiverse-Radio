// Horoscopes for Other Universes: a candlelit reading table under a planetarium dome of
// unfamiliar constellations (a teapot, a ladder, a single sock, a cat that blinks). The
// crystal ball shows static. The cards are fanned out. Madame's hands wait in the light.

import { type Color, hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, vignette } from './lib/night';

const TABLE = { x: 160, y: 118, rx: 86, ry: 14 };
const BALL = { x: 160, y: 94, r: 13 };
const CANDLES = [
  { x: 106, y: 112, h: 12 },
  { x: 120, y: 116, h: 7 },
  { x: 214, y: 113, h: 10 },
];

// Constellations: [x, y] stars and index pairs for lines.
const TEAPOT = { pts: [[58, 46], [66, 40], [76, 40], [84, 46], [80, 54], [62, 54], [71, 35], [90, 42], [96, 36], [54, 44], [50, 50]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 6], [6, 2], [3, 7], [7, 8], [0, 9], [9, 10], [10, 5]] };
const LADDER = { pts: [[236, 18], [236, 32], [236, 46], [236, 60], [248, 16], [248, 30], [248, 44], [248, 58]], lines: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]] };
const SOCK = { pts: [[110, 8], [118, 8], [118, 24], [126, 32], [120, 38], [108, 30], [110, 18]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] };
const CAT = { pts: [[170, 34], [174, 26], [178, 32], [184, 26], [188, 34], [186, 42], [194, 52], [190, 62], [168, 62], [166, 50], [200, 58], [206, 46]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [7, 10], [10, 11]] };
const CAT_EYES = [[175, 36], [183, 36]];

const def: SceneDef = {
  id: 'star-chart',
  fps: 15,
  focusY: 80,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#06040a');
    const domeC = [hex('#05040a'), hex('#0a0814'), hex('#110d1e'), hex('#181228')];
    const lav = accent;
    const lavD = shade(accent, 0.4);
    const starC = mix(accent, hex('#ffffff'), 0.65);
    const flame = hex('#ffd890');
    const candleC = hex('#ffb060');
    const cloth = [mix(hex('#0c0612'), accent, 0.06), mix(hex('#140a1c'), accent, 0.1), mix(hex('#1e1028'), accent, 0.16)];
    const skin = hex('#8a6a5a');
    const cardBack = mix(hex('#2a1838'), accent, 0.35);

    const drawConst = (g: Gfx, c: { pts: number[][]; lines: number[][] }, dx: number, dy: number, t: number, seed: number, k: number, lineK: number) => {
      for (const [a, b] of c.lines) {
        const p = c.pts[a!]!;
        const q = c.pts[b!]!;
        g.lineA(p[0]! + dx, p[1]! + dy, q[0]! + dx, q[1]! + dy, lavD, 0.3 * lineK);
      }
      for (let i = 0; i < c.pts.length; i++) {
        const p = c.pts[i]!;
        const tw = 0.7 + 0.3 * Math.sin(t * 1.3 + i * 2.1 + seed);
        g.pxAdd(p[0]! + dx, p[1]! + dy, starC, k * tw);
        g.glow(p[0]! + dx, p[1]! + dy, 3, lav, 0.25 * k * tw);
      }
    };

    const card = (g: Gfx, x: number, y: number, face: boolean, c: Color) => {
      g.rect(x - 4, y - 7, 9, 13, ink);
      g.rect(x - 3, y - 6, 7, 11, face ? hex('#c8bca8') : c);
      if (!face) {
        g.px(x, y - 1, mix(c, starC, 0.6));
        g.hline(x - 2, x + 2, y + 3, mix(c, ink, 0.4));
        g.hline(x - 2, x + 2, y - 5, mix(c, ink, 0.4));
      }
    };

    return {
      background(g) {
        // The dome: dark, faintly gridded with the lines of someone else's sky.
        for (let y = g.top; y < 104; y++)
          for (let x = g.left; x < g.right; x++) {
            const v = clamp((y + 80) / 184);
            let k = Math.floor(v * 3 + bayer(x, y) * 0.9);
            if (k > 3) k = 3;
            g.px(x, y, domeC[k]!);
          }
        for (let i = 1; i < 6; i++) {
          for (let a = Math.PI; a < Math.PI * 2; a += 0.006) g.pxA(160 + Math.cos(a) * i * 52, 104 + Math.sin(a) * i * 34, lavD, 0.12);
        }
        for (let i = -6; i <= 6; i++) g.lineA(160, 104, 160 + i * 60, -120, lavD, 0.08);
        // faint field stars (fixed)
        for (let i = 0; i < 160; i++) {
          const x = -40 + hash3(i, 1) * 400;
          const y = -100 + hash3(i, 2) * 196;
          g.pxAdd(x, y, starC, 0.1 + hash3(i, 3) * 0.3);
        }
        // a pale nebula behind the cat
        g.glow(186, 44, 40, lav, 0.06, 6);

        // The rim of the dome and the dark room below it.
        g.rect(g.left, 104, g.w, g.bottom - 104, hex('#07050b'));
        g.hline(g.left, g.right, 104, mix(hex('#140e1e'), accent, 0.15));
        g.rect(g.left, 105, g.w, 3, hex('#0c0912'));
        g.ellipse(160, 150, 150, 26, hex('#0a0710'));
        g.ellipse(160, 150, 130, 20, mix(hex('#0e0a16'), accent, 0.05));

        // The reader, veiled, behind the table: a soft dark shape.
        g.poly([130, 120, 190, 120, 180, 84, 140, 84], hex('#0c0812'));
        g.ellipse(160, 84, 20, 8, hex('#0c0812'));
        g.ellipse(160, 70, 10, 12, hex('#100a18'));
        g.tri(150, 72, 170, 72, 160, 54, hex('#100a18'));
        g.ellipse(160, 71, 7, 9, hex('#0a0610'));
        g.px(157, 70, mix(hex('#100a18'), accent, 0.4));
        g.px(163, 70, mix(hex('#100a18'), accent, 0.4));

        // The table and its cloth, falling to the floor.
        g.ellipse(TABLE.x, TABLE.y + 2, TABLE.rx + 1, TABLE.ry + 1, ink);
        g.ellipse(TABLE.x, TABLE.y, TABLE.rx, TABLE.ry, cloth[1]!);
        g.ellipse(TABLE.x, TABLE.y - 2, TABLE.rx - 10, TABLE.ry - 4, cloth[2]!);
        for (let x = TABLE.x - TABLE.rx; x <= TABLE.x + TABLE.rx; x++) {
          const u = (x - TABLE.x) / TABLE.rx;
          const top = TABLE.y + Math.sqrt(Math.max(0, 1 - u * u)) * TABLE.ry;
          const fold = Math.sin(x * 0.5) > 0.3;
          g.vline(x, top, g.bottom, fold ? cloth[1]! : cloth[0]!);
        }
        // fringe and a brass stand for the ball
        for (let x = TABLE.x - TABLE.rx + 2; x <= TABLE.x + TABLE.rx - 2; x += 3) {
          const u = (x - TABLE.x) / TABLE.rx;
          g.px(x, TABLE.y + Math.sqrt(Math.max(0, 1 - u * u)) * TABLE.ry + 1, mix(lav, hex('#c8a060'), 0.5));
        }
        g.ellipse(BALL.x, BALL.y + 14, 10, 3, hex('#3a2a14'));
        g.rect(BALL.x - 7, BALL.y + 10, 15, 4, hex('#5a4020'));
        g.hline(BALL.x - 7, BALL.x + 7, BALL.y + 10, hex('#a07a40'));

        // Candles (flames flicker per frame).
        for (const c of CANDLES) {
          g.rect(c.x - 2, c.y - c.h, 4, c.h, hex('#c8b8a0'));
          g.vline(c.x - 2, c.y - c.h, c.y - 1, hex('#e8dcc8'));
          g.rect(c.x - 3, c.y - 1, 6, 2, hex('#3a2a20'));
        }

        vignette(g, 0.55, 160, 90, 220, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        // The whole sky turns, very slowly.
        const drift = f.reduced ? 0 : Math.sin(t * 0.02) * 3;
        drawConst(g, TEAPOT, drift, 0, t, 1, 0.9, 1);
        drawConst(g, LADDER, drift, 0, t, 2, 0.8, 1);
        drawConst(g, SOCK, drift, 0, t, 3, 0.8, 1);
        // The cat: it blinks. In a rare moment, it swipes at a passing star.
        const swipe = f.rare === 3 && ev < 10 ? envelope(ev - 4, 2, 0.3, 0.6) : 0;
        CAT.pts[11]![0] = 206 + swipe * 6;
        CAT.pts[11]![1] = 46 - swipe * 10;
        drawConst(g, CAT, drift, 0, t, 4, 1, 1);
        const shut = blinking(t, 21, 6) || awake < 0.3;
        for (const [ex, ey] of CAT_EYES) {
          if (shut) g.hline(ex! - 1 + drift, ex! + 1 + drift, ey!, lavD);
          else {
            g.pxAdd(ex! + drift, ey!, hex('#e8ffd8'), 1);
            g.glow(ex! + drift, ey!, 3, hex('#c8ffb0'), 0.4);
          }
        }
        if (f.rare === 3 && ev < 10) {
          const p = ev / 6;
          if (p < 1) {
            const sx = 300 - p * 200;
            const sy = 20 + p * 30;
            for (let k = 0; k < 8; k++) g.pxAdd(sx + k * 2.5, sy - k * 0.75, starC, 1 - k / 8);
          }
        }

        // Rare: the teapot pours a trickle of stars down the dome.
        if (f.rare === 2 && ev < 10) {
          const k = envelope(ev, 10, 1.5, 2);
          for (let i = 0; i < 14; i++) {
            const p = (ev * 0.5 + i / 14) % 1;
            g.pxAdd(96 + drift + p * 8 + Math.sin(p * 4) * 2, 36 + p * p * 52, starC, k * (1 - p * 0.5));
          }
        }

        // Candles.
        let light = 0;
        for (let i = 0; i < CANDLES.length; i++) {
          const c = CANDLES[i]!;
          const fl = flicker(t, i * 5 + 2);
          light += fl;
          const fx = c.x + (f.reduced ? 0 : Math.round(Math.sin(t * 3 + i) * 0.4));
          const fy = c.y - c.h;
          g.px(fx, fy - 1, flame);
          g.px(fx, fy - 2, mix(flame, hex('#ffffff'), 0.4 * fl));
          if (fl > 0.8) g.px(fx, fy - 3, flame);
          g.glow(fx, fy - 2, 26, candleC, 0.22 * fl);
        }
        light /= CANDLES.length;
        g.ellipseA(TABLE.x, TABLE.y - 2, TABLE.rx - 12, TABLE.ry - 5, candleC, 0.06 * light);

        // Madame's hands rest either side of the ball, in the candlelight.
        for (const s of [-1, 1]) {
          const hx = BALL.x + s * 24;
          const hy = TABLE.y - 4;
          g.ellipse(hx, hy, 6, 2, mix(hex('#2a1c22'), skin, 0.6 * light));
          g.hline(hx - 5, hx + 5, hy - 2, mix(skin, candleC, 0.3 * light));
          g.line(hx - s * 6, hy, hx - s * 14, hy - 8, hex('#140c1a'));
          g.px(hx + s * 3, hy - 1, mix(lav, hex('#c8a060'), 0.4));
        }

        // The crystal ball: static, or a picture tuning in (rare).
        const { x, y, r } = BALL;
        const tuned = f.rare === 1 && ev < 10 ? envelope(ev, 10, 2, 2) : 0;
        const tick = Math.floor(t * (f.reduced ? 2 : 12));
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > r * r) continue;
            const n = hash3(dx, dy * 31, tick);
            const edge = d2 / (r * r);
            let v = 0.15 + n * 0.5 * (1 - tuned);
            if (tuned > 0) {
              // a small ship crossing a starfield
              const sx = dx + 6 - ev * 1.5;
              const ship = Math.abs(dy) < 2 - Math.abs(sx) * 0.25 && sx > -6 && sx < 3;
              const st = hash3(dx, dy, 77) < 0.04;
              v = v * (1 - tuned) + tuned * (ship ? 0.95 : st ? 0.7 : 0.1);
            }
            v *= 1 - edge * 0.5;
            g.px(x + dx, y + dy, mix(hex('#0a0614'), mix(lav, hex('#ffffff'), 0.25), v * 0.85));
          }
        g.ring(x, y, r, r, mix(lavD, ink, 0.3));
        g.px(x - 5, y - 6, hex('#ffffff'));
        g.px(x - 4, y - 7, hex('#e8e0ff'));
        g.glow(x, y, 26, lav, 0.12 + tuned * 0.2 + f.energy * 0.05);

        // The cards, fanned. One turns itself over in a rare moment.
        const flip = f.rare === 0 && ev < 10 ? ev : -1;
        for (let i = 0; i < 5; i++) {
          const cx = 136 + i * 12;
          const cy = 116 - Math.abs(i - 2) * 1;
          if (i === 3 && flip >= 1) {
            const k = clamp((flip - 1) / 0.6);
            const shown = k >= 0.5 && flip < 9;
            const w = Math.abs(Math.cos(k * Math.PI));
            if (flip < 9) {
              g.rect(cx - Math.round(4 * w), cy - 7, Math.max(1, Math.round(9 * w)), 13, ink);
              g.rect(cx - Math.round(3 * w), cy - 6, Math.max(1, Math.round(7 * w)), 11, shown ? hex('#c8bca8') : cardBack);
              if (shown && w > 0.8) {
                // the sock
                g.rect(cx - 1, cy - 4, 2, 5, lavD);
                g.rect(cx - 1, cy + 1, 4, 2, lavD);
                g.text('SOCK', cx - 7, cy + 8, mix(lav, hex('#ffffff'), 0.3));
              }
            } else card(g, cx, cy, false, cardBack);
            continue;
          }
          card(g, cx, cy, false, cardBack);
        }
      },
    };
  },
};

export default def;

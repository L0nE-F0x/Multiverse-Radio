// Impossible Sports Network: a floating stadium at night under floodlights. The ball is a
// small, polite sun. The crowd is a sea of blinking lights doing the wave.

import { hex, hsv, mix, ramp, shade } from '../kit/color';
import { clamp, envelope, rampAt, stars, TAU } from '../kit/fx';
import { bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, frameRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const C = { x: 160, y: 104 };
const OUT = { rx: 128, ry: 42 };
const FIELD = { rx: 70, ry: 21 };
const BOARD = { x: 160, y: 26 };
const LAMPS = [C.x - 118, C.y - 66, C.x + 118, C.y - 66, C.x - 70, C.y - 76, C.x + 70, C.y - 76];

const SCORES = ['HOME 7 1/2 AWAY π', 'HOME ∞  AWAY 3', 'HOME YES  AWAY NO', 'HOME 2  AWAY 2?', 'HOME -4  AWAY OK', 'HOME 11  AWAY 11'];

const def: SceneDef = {
  id: 'stadium',
  fps: 20,
  rareEvents: 3,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#05060e');
    const sky = [hex('#04061a'), hex('#0a1030'), hex('#141a44')];
    const grass = ramp([hex('#0e3a1a'), hex('#1a5a2a'), hex('#2a7a3a'), hex('#3a9a4a')], 4);
    const stand = ramp([hex('#14141e'), hex('#1e1e2e'), hex('#2a2a40')], 3);
    const rock = ramp([hex('#1a1420'), hex('#2a2230'), hex('#3e3446'), hex('#5a4a5e')], 4);
    const cloud = ramp([hex('#1a2040'), hex('#2a3460'), hex('#4a5a8a'), hex('#8a9ac8')], 4);
    const lamp = hex('#fff4d8');
    const sunR = ramp([hex('#ff6a1a'), accent, hex('#ffc04a'), hex('#fff4a0')], 5);

    // Crowd pixels: world x, y and angle around the bowl (rebuilt on resize).
    let crowd = new Float32Array(0);
    let crowdN = 0;

    const inEllipse = (x: number, y: number, rx: number, ry: number) => ((x - C.x) / rx) ** 2 + ((y - C.y) / ry) ** 2 < 1;

    return {
      background(g) {
        g.vgrad(sky, g.top, 150);
        stars(g, 0, g.left, g.top, g.right, 110, 0.4, hex('#d8e0ff'), 6, 0);
        // Cloud sea below.
        for (let y = 128; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 26, y / 9, 2, 4);
            const top = 156 + Math.sin(x * 0.05) * 4 + fbm(x / 30, 0, 5, 3) * 10 - (Math.abs(x - C.x) > 110 ? 12 : 0);
            if (y < top) continue;
            g.px(x, y, rampAt(cloud, n * 0.9 + (y < top + 3 ? 0.35 : 0) - (y - top) / 200, x, y));
          }
        // The underside: a rocky, tapering foundation with lit windows.
        for (let y = C.y; y < 172; y++) {
          const u = (y - C.y) / 68;
          const hw = OUT.rx * Math.sqrt(Math.max(0, 1 - u * 1.1)) * (1 - u * 0.5);
          for (let x = Math.round(C.x - hw); x <= C.x + hw; x++) {
            const n = fbm(x / 8, y / 6, 3, 3);
            g.px(x, y, rampAt(rock, 0.2 + n * 0.6 - u * 0.3 + (x < C.x ? 0 : 0.1), x, y));
          }
        }
        // a few loose rocks drifting alongside
        for (const [rx, ry, r] of [[30, 120, 5], [292, 112, 4], [262, 150, 3], [52, 146, 3]] as const) {
          g.ellipse(rx, ry, r + 1, r * 0.7 + 1, ink);
          g.ellipse(rx, ry, r, r * 0.7, rock[2]!);
          g.hline(rx - r + 1, rx + r - 2, ry - Math.round(r * 0.5), rock[3]!);
        }
        for (let i = 0; i < 14; i++) {
          const x = C.x - 90 + hash3(i, 1) * 180;
          const y = C.y + 26 + hash3(i, 2) * 14;
          g.px(x, y, hex('#ffd08a'));
        }
        // dangling roots / cables
        for (let i = 0; i < 8; i++) {
          const x = C.x - 60 + i * 17;
          const len = 8 + hash3(i, 3) * 14;
          for (let k = 0; k < len; k++) g.px(x + Math.sin(k * 0.4 + i) * 1.5, 150 + k + Math.abs(x - C.x) * -0.25 + 10, rock[1]!);
        }

        // Bowl: outer wall, tiered stands, field.
        g.ellipse(C.x, C.y + 5, OUT.rx + 2, OUT.ry + 3, ink);
        g.ellipse(C.x, C.y + 4, OUT.rx + 1, OUT.ry + 2, hex('#3a3a50'));
        g.ellipse(C.x, C.y, OUT.rx, OUT.ry, stand[1]!);
        for (let k = 0; k < 5; k++) {
          const f = 1 - k * 0.09;
          arc(g, C.x, C.y, OUT.rx * f, OUT.ry * f, 0, TAU, stand[k % 2 ? 0 : 2]!);
        }
        g.ellipse(C.x, C.y, FIELD.rx + 4, FIELD.ry + 3, hex('#2a2a3a'));
        for (let y = C.y - FIELD.ry; y <= C.y + FIELD.ry; y++)
          for (let x = C.x - FIELD.rx; x <= C.x + FIELD.rx; x++) {
            if (!inEllipse(x, y, FIELD.rx, FIELD.ry)) continue;
            const stripe = Math.floor((x - C.x + 200) / 10) % 2;
            g.px(x, y, grass[stripe ? 1 : 2]!);
          }
        g.ring(C.x, C.y, FIELD.rx - 6, FIELD.ry - 3, hex('#d8f0d8'));
        g.vline(C.x, C.y - FIELD.ry + 3, C.y + FIELD.ry - 3, hex('#d8f0d8'));
        g.ring(C.x, C.y, 9, 4, hex('#d8f0d8'));
        // Goals at each end.
        for (const s of [-1, 1]) {
          const gx = C.x + s * (FIELD.rx - 7);
          g.vline(gx, C.y - 6, C.y + 1, hex('#ffffff'));
          g.vline(gx + s * 3, C.y - 4, C.y + 3, hex('#ffffff'));
          g.line(gx, C.y - 6, gx + s * 3, C.y - 4, hex('#ffffff'));
        }

        // Crowd positions.
        const list: number[] = [];
        for (let y = C.y - OUT.ry; y <= C.y + OUT.ry; y++)
          for (let x = C.x - OUT.rx; x <= C.x + OUT.rx; x++) {
            if (!inEllipse(x, y, OUT.rx - 3, OUT.ry - 2) || inEllipse(x, y, FIELD.rx + 6, FIELD.ry + 5)) continue;
            if (hash3(x, y, 4) > 0.45 || (x + y) % 2) continue;
            list.push(x, y, Math.atan2((y - C.y) / OUT.ry, (x - C.x) / OUT.rx));
          }
        crowd = new Float32Array(list);
        crowdN = list.length / 3;

        // Floodlight towers.
        for (const [tx, ty, h] of [
          [C.x - 118, C.y - 14, 46],
          [C.x + 118, C.y - 14, 46],
          [C.x - 70, C.y - 36, 34],
          [C.x + 70, C.y - 36, 34],
        ] as const) {
          g.vline(tx, ty - h, ty, hex('#5a5a6a'));
          g.vline(tx + 1, ty - h, ty, hex('#3a3a4a'));
          g.rect(tx - 5, ty - h - 6, 12, 6, hex('#2a2a3a'));
          for (let k = 0; k < 3; k++) g.rect(tx - 4 + k * 4, ty - h - 5, 3, 4, lamp);
        }
        void bayer;
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const hype = 0.5 + 0.5 * f.awake;

        // Floodlight beams onto the pitch.
        const k = (0.05 + f.energy * 0.04) * hype;
        for (let j = 0; j < LAMPS.length; j += 2) {
          const tx = LAMPS[j]!;
          const ty = LAMPS[j + 1]!;
          g.tri(tx - 3, ty, tx + 3, ty, C.x + (tx < C.x ? -20 : 20), C.y + 6, lamp, 2, k);
          g.glow(tx, ty, 9, lamp, 0.5);
        }

        // The crowd does the wave.
        const waveA = ((t * 0.9) % TAU) - Math.PI;
        const b = g.buf;
        for (let i = 0; i < crowdN; i++) {
          const x = crowd[i * 3]!;
          const y = crowd[i * 3 + 1]!;
          const a = crowd[i * 3 + 2]!;
          let d = Math.abs(a - waveA);
          if (d > Math.PI) d = TAU - d;
          const inWave = d < 0.35 && !f.reduced ? 1 - d / 0.35 : 0;
          const tw = hash3(x, y, Math.floor(t * 2 + hash3(x, y) * 7)) > 0.92 ? 0.5 : 0;
          const lvl = 0.25 + tw + inWave * 0.9 * hype + f.pulse * 0.2;
          const bx = x - g.ox;
          const by = y - g.oy - Math.round(inWave * 1.5);
          if (bx < 0 || by < 0 || bx >= g.w || by >= g.h) continue;
          const hue = hash3(x, y, 1);
          const c = hue < 0.45 ? accent : hue < 0.8 ? hex('#ffffff') : hex('#4ac0ff');
          b[by * g.w + bx] = mix(stand[1]!, c, clamp(lvl));
        }

        // Players: tiny dots chasing the ball.
        const ballAng = t * 0.35;
        const bx = C.x + Math.cos(ballAng) * (FIELD.rx - 20) * Math.sin(t * 0.21);
        const by = C.y + Math.sin(ballAng * 1.3) * (FIELD.ry - 6);
        for (let i = 0; i < 10; i++) {
          const lag = 0.3 + hash3(i, 3) * 1.5;
          const px = C.x + Math.cos((t - lag) * 0.35) * (FIELD.rx - 20) * Math.sin((t - lag) * 0.21) + (hash3(i, 4) - 0.5) * 30;
          const py = C.y + Math.sin((t - lag) * 0.35 * 1.3) * (FIELD.ry - 6) + (hash3(i, 5) - 0.5) * 12;
          const c = i < 5 ? accent : hex('#4ac0ff');
          g.rect(px, py - 2, 1, 2, c);
          g.px(px, py - 3, hex('#f0d0b0'));
        }

        // The ball: a small, polite sun.
        const greet = f.rare === 1 && ev < 7 ? envelope(ev, 7, 1, 1) : 0;
        const hop = Math.abs(Math.sin(t * 2.2)) * 7 * (1 - greet);
        const sx = bx + (C.x - bx) * greet;
        const sy = by - hop + (C.y - 10 - by) * greet;
        g.glow(sx, sy, 16, hex('#ffc04a'), 0.5);
        g.ellipseA(bx, by + 1, 4, 1, ink, 0.4);
        g.ball(sx, sy, 4, 4, sunR, -0.4, -0.5, 0.5);
        g.px(sx - 1, sy - 1, ink);
        g.px(sx + 1, sy - 1, ink);
        g.px(sx, sy + 1, hex('#c84a1a'));
        if (greet > 0.6) {
          const wv = Math.sin(ev * 10) > 0 ? 1 : 0;
          g.line(sx + 4, sy, sx + 7, sy - 3 - wv, hex('#ffc04a'));
          g.textCenter('HELLO. SORRY.', sx, sy - 16, hex('#fff4a0'));
        }

        // Scoreboard, which keeps changing its mind.
        const idx = Math.floor(t / 7) % SCORES.length;
        const text = f.rare === 2 && ev < 7 ? (ev < 3.5 ? 'SCORE: YES' : 'SORRY') : SCORES[idx]!;
        g.vline(BOARD.x - 30, BOARD.y + 10, BOARD.y + 40, hex('#3a3a4a'));
        g.vline(BOARD.x + 30, BOARD.y + 10, BOARD.y + 40, hex('#3a3a4a'));
        g.rect(BOARD.x - 42, BOARD.y - 8, 84, 20, ink);
        frameRect(g, BOARD.x - 42, BOARD.y - 8, 84, 20, accent);
        g.textCenter('IMPOSSIBLE SPORTS', BOARD.x, BOARD.y - 5, shade(accent, 0.8));
        g.textCenter(text, BOARD.x, BOARD.y + 3, hex('#ffe8a0'));
        g.glow(BOARD.x, BOARD.y, 40, accent, 0.06 + f.energy * 0.06, 4);

        // Fireworks.
        if (f.rare === 0 && ev < 7) {
          for (let n = 0; n < 3; n++) {
            const st = n * 1.6;
            const p = ev - st;
            if (p < 0 || p > 3) continue;
            const fx = 90 + n * 70;
            const fy = 30 + (n % 2) * 14;
            const c = hsv(n * 0.31 + 0.05, 0.7, 1);
            if (p < 0.6) g.px(fx, 110 - (110 - fy) * (p / 0.6), hex('#ffffff'));
            else {
              const r = (p - 0.6) * 16;
              for (let i = 0; i < 16; i++) {
                const a = (i / 16) * TAU;
                g.pxAdd(fx + Math.cos(a) * r, fy + Math.sin(a) * r + (p - 0.6) ** 2 * 3, c, clamp(1.4 - p / 2.2));
              }
            }
          }
        }
        stars(g, t, g.left, g.top, g.right, 60, 0.05, hex('#ffffff'), 13);
      },
    };
  },
};

export default def;

// Baroque Robot Philharmonic: robots in powdered wigs play harpsichord and cello by
// candlelight. One conducts with a spoon. The portrait on the wall is of a toaster.

import { type Color, hex, mix, ramp, shade } from '../kit/color';
import { blinking, envelope } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { arc, frameRect, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const FLOOR_Y = 138;

const def: SceneDef = {
  id: 'robot-salon',
  fps: 18,
  rareEvents: 3,
  rareDuration: 5,
  create({ accent }) {
    const ink = hex('#120c0a');
    const wallC = [hex('#0f2420'), hex('#16302a'), hex('#1e3c34')];
    const gold = hex('#d8a84a');
    const goldD = hex('#8a6428');
    const cream = accent;
    const wig = hex('#f4f0e8');
    const wigS = hex('#c8c0d0');
    const brass = ramp([hex('#4a2a14'), hex('#8a5a2a'), hex('#c8925a'), hex('#f0c890')], 4);
    const silver = ramp([hex('#2a2e38'), hex('#5a6270'), hex('#9aa4b4'), hex('#dce4f0')], 4);
    const flame = hex('#ffd27a');
    const woodC = { d: hex('#2a140c'), m: hex('#4a2414'), l: hex('#6a3a1e') };

    // A boxy robot. facing: -1 left, 0 front, 1 right, 2 back.
    const robot = (g: Gfx, x: number, y: number, body: Color[], facing: -1 | 0 | 1 | 2, eyeOn: boolean, wigLift = 0) => {
      x = Math.round(x);
      y = Math.round(y);
      // torso
      roundRect(g, x - 8, y - 16, 16, 16, 2, ink);
      roundRect(g, x - 7, y - 15, 14, 14, 2, body[2]!);
      g.rect(x - 7, y - 15, 14, 2, body[3]!);
      g.rect(x + 4, y - 13, 3, 12, body[1]!);
      if (facing !== 2) {
        g.rect(x - 4, y - 11, 6, 5, body[1]!);
        g.px(x - 3, y - 10, hex('#ff6a5a'));
        g.px(x - 1, y - 10, hex('#7affb0'));
        g.px(x - 3, y - 8, hex('#ffd27a'));
        // a lace jabot
        g.tri(x - 3, y - 15, x + 3, y - 15, x, y - 9, wig);
      }
      // neck + head
      g.rect(x - 2, y - 18, 4, 3, body[0]!);
      const hy = y - 28;
      roundRect(g, x - 7, hy - 1, 14, 12, 2, ink);
      roundRect(g, x - 6, hy, 12, 10, 2, body[2]!);
      g.rect(x - 6, hy, 12, 2, body[3]!);
      if (facing === 0) {
        g.rect(x - 4, hy + 3, 3, 3, ink);
        g.rect(x + 1, hy + 3, 3, 3, ink);
        if (eyeOn) {
          g.rect(x - 3, hy + 4, 1, 1, hex('#7affe8'));
          g.rect(x + 2, hy + 4, 1, 1, hex('#7affe8'));
        }
        g.hline(x - 2, x + 1, hy + 8, body[0]!);
      } else if (facing === -1 || facing === 1) {
        const ex = facing === -1 ? x - 5 : x + 2;
        g.rect(ex, hy + 3, 3, 3, ink);
        if (eyeOn) g.px(ex + 1, hy + 4, hex('#7affe8'));
        g.rect(facing === -1 ? x - 6 : x + 5, hy + 7, 1, 2, body[0]!);
      }
      // the powdered wig
      const wy = hy - wigLift;
      const rolls = facing === 2 ? [-1, 1] : facing === 0 ? [-1, 1] : [facing === -1 ? 1 : -1];
      for (const s of rolls) for (let k = 0; k < 3; k++) {
        g.disc(x + s * 7, wy + 2 + k * 3, 2, ink);
        g.disc(x + s * 7, wy + 2 + k * 3, 1.5, k === 2 ? wigS : wig);
      }
      g.ellipse(x, wy - 1, 8, 4, ink);
      g.ellipse(x, wy - 1, 7, 3, wig);
      for (let k = -5; k <= 5; k += 3) g.px(x + k, wy - 2, wigS);
      if (facing === 2) {
        g.rect(x - 6, wy, 12, 8, wig);
        for (let k = -5; k <= 5; k += 2) g.px(x + k, wy + 3 + ((k + 7) % 2), wigS);
        g.rect(x - 1, wy + 8, 3, 6, wig);
        g.rect(x - 2, wy + 8, 5, 2, ink);
      } else if (facing !== 0) {
        const bx = facing === -1 ? x + 6 : x - 8;
        g.rect(bx, wy + 6, 3, 6, wig);
        g.rect(bx - 1, wy + 6, 4, 2, ink);
      }
    };

    return {
      background(g) {
        // Damask wallpaper.
        for (let y = g.top; y < 108; y++)
          for (let x = g.left; x < g.right; x++) {
            const cx = (((x % 20) + 20) % 20) - 10;
            const cy = (((y + (Math.floor(x / 20) % 2) * 12) % 24) + 24) % 24 - 12;
            const d = Math.abs(cx) / 7 + Math.abs(cy) / 10;
            const petal = Math.abs(Math.sin(Math.atan2(cy, cx) * 3)) * 0.3;
            g.px(x, y, d < 0.55 + petal && d > 0.4 + petal * 0.5 ? wallC[2]! : d < 0.2 ? wallC[2]! : (x + y) % 7 === 0 ? wallC[0]! : wallC[1]!);
          }
        // Wainscot, chair rail, parquet.
        g.rect(g.left, 106, g.w, 3, gold);
        g.rect(g.left, 108, g.w, 1, goldD);
        g.vgrad([woodC.l, woodC.m], 109, FLOOR_Y, 109, FLOOR_Y);
        for (let x = g.left - (g.left % 30); x < g.right; x += 30) frameRect(g, x + 3, 113, 24, 20, woodC.d);
        for (let y = FLOOR_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const k = (Math.floor((x + (y - FLOOR_Y) * 2) / 8) + Math.floor((y - FLOOR_Y) / 4)) % 2;
            g.px(x, y, k ? woodC.m : shade(woodC.m, 0.8));
          }
        g.rect(g.left, FLOOR_Y, g.w, 1, woodC.d);
        // A patterned rug under the ensemble.
        g.poly([70, 142, 250, 142, 274, 172, 46, 172], hex('#4a1418'));
        g.poly([74, 144, 246, 144, 268, 170, 52, 170], hex('#7a2228'));
        g.poly([84, 148, 236, 148, 252, 166, 68, 166], hex('#2a3a5a'));
        g.poly([90, 151, 230, 151, 242, 163, 78, 163], hex('#8a2a30'));
        for (let x = 90; x < 236; x += 8) {
          g.px(x, 146, gold);
          g.px(x + 2, 168, gold);
          g.px(x + 4, 157, hex('#e8c87a'));
        }
        g.disc(160, 157, 3, gold);

        // Portrait of a toaster in a gilded frame.
        const px = 138;
        const py = 16;
        g.rect(px - 5, py - 5, 54, 58, goldD);
        frameRect(g, px - 4, py - 4, 52, 56, gold);
        frameRect(g, px - 2, py - 2, 48, 52, gold);
        for (let i = 0; i < 6; i++) g.px(px - 4 + i * 10, py - 5, gold);
        g.gradRect(px, py, 44, 48, [hex('#1a1410'), hex('#2a2018'), hex('#3a2a1a')]);
        g.glow(px + 18, py + 18, 20, hex('#ffd8a0'), 0.18);
        // the sitter
        roundRect(g, px + 8, py + 18, 28, 20, 4, ink);
        roundRect(g, px + 9, py + 19, 26, 18, 4, silver[2]!);
        g.rect(px + 9, py + 19, 26, 3, silver[3]!);
        g.rect(px + 13, py + 19, 6, 2, ink);
        g.rect(px + 24, py + 19, 6, 2, ink);
        g.rect(px + 33, py + 24, 3, 5, ink);
        g.rect(px + 9, py + 33, 26, 2, silver[1]!);
        g.line(px + 9, py + 36, px + 2, py + 44, ink);
        g.disc(px + 15, py + 28, 1, silver[0]!);
        // a ruff collar, for dignity
        for (let k = 0; k < 7; k++) g.disc(px + 10 + k * 4, py + 38, 2, wig);
        g.rect(px + 12, py + 50, 20, 5, goldD);
        g.text('SIR', px + 16, py + 50, gold);

        // Candelabras at the sides.
        for (const cx of [26, 296]) {
          g.rect(cx - 1, 60, 3, 78, gold);
          g.rect(cx - 6, 136, 13, 2, gold);
          arc(g, cx, 60, 8, 5, 0, Math.PI, gold);
          for (const dx of [-8, 0, 8]) {
            g.rect(cx + dx - 1, 52, 3, 8, cream);
          }
        }

        // Harpsichord (left): case, lid with a painted landscape, keyboard.
        const hx = 46;
        g.poly([hx - 2, 92, hx + 78, 92, hx + 78, 106, hx + 8, 106], ink);
        g.poly([hx - 1, 93, hx + 77, 93, hx + 77, 105, hx + 9, 105], hex('#1a1414'));
        g.rect(hx + 8, 103, 70, 1, gold);
        g.rect(hx, 93, 77, 1, gold);
        g.poly([hx + 6, 92, hx + 72, 92, hx + 54, 56, hx + 4, 70], ink);
        g.poly([hx + 8, 91, hx + 70, 91, hx + 53, 58, hx + 6, 71], gold);
        g.poly([hx + 11, 89, hx + 67, 89, hx + 52, 61, hx + 9, 73], hex('#7ab0d8'));
        g.poly([hx + 11, 89, hx + 67, 89, hx + 60, 76, hx + 36, 72, hx + 10, 80], hex('#4a8a4a'));
        g.disc(hx + 46, 68, 3, hex('#fff0c0'));
        g.line(hx + 20, 80, hx + 40, 74, hex('#6aa85a'));
        for (const lx of [hx + 12, hx + 44, hx + 72]) {
          g.rect(lx, 106, 2, FLOOR_Y - 106, woodC.d);
          g.rect(lx - 1, FLOOR_Y - 2, 4, 2, gold);
        }
        // keyboard
        g.rect(hx + 66, 90, 14, 4, ink);
        for (let k = 0; k < 6; k++) g.rect(hx + 67 + k * 2, 91, 1, 2, wig);
        // stool
        g.rect(134, 122, 14, 3, woodC.l);
        g.rect(135, 125, 2, 13, woodC.d);
        g.rect(145, 125, 2, 13, woodC.d);

        // Music stand and podium for the conductor.
        g.rect(158, 132, 22, 6, woodC.l);
        g.rect(158, 132, 22, 1, gold);
        // Cellist's chair.
        g.rect(214, 122, 16, 3, woodC.l);
        g.rect(215, 125, 2, 13, woodC.d);
        g.rect(227, 125, 2, 13, woodC.d);
        g.rect(228, 100, 3, 22, woodC.l);
        // Music stand for the cello.
        g.vline(250, 104, FLOOR_Y, ink);
        g.poly([242, 104, 258, 104, 256, 94, 244, 94], ink);
        g.poly([243, 103, 257, 103, 255, 95, 245, 95], hex('#e8dcc0'));
        for (let k = 0; k < 4; k++) g.hline(246, 254, 96 + k * 2, hex('#6a5a4a'));

        // Warm candlelight over everything.
        g.glow(160, 30, 140, hex('#ffb060'), 0.12, 6);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const freeze = f.rare === 1 && ev > 0.6 && ev < 2.2;
        const play = f.awake > 0.3 && !freeze ? 1 : 0;
        const beatT = t * 1.6;

        // Chandelier with flickering candles.
        const ch = { x: 160, y: 4 };
        g.vline(ch.x, g.top, ch.y, gold);
        arc(g, ch.x, ch.y + 4, 26, 6, 0, Math.PI, gold, 2);
        g.ellipse(ch.x, ch.y + 5, 4, 3, gold);
        for (let i = 0; i < 5; i++) {
          const cx = ch.x - 24 + i * 12;
          const cy = ch.y + 4 + Math.round(Math.sin((i / 4) * Math.PI) * 6) - 6;
          g.rect(cx - 1, cy - 5, 3, 5, cream);
          const fl = f.reduced ? 0 : Math.round(Math.sin(t * 9 + i * 2));
          g.px(cx, cy - 7 + (fl > 0 ? -1 : 0), flame);
          g.px(cx, cy - 6, hex('#fff4d0'));
          g.glow(cx, cy - 7, 10, flame, 0.3 + (f.reduced ? 0 : 0.05 * Math.sin(t * 13 + i)), 4);
        }
        for (const cx of [26, 296])
          for (const dx of [-8, 0, 8]) {
            g.px(cx + dx, 49, flame);
            g.glow(cx + dx, 49, 9, flame, 0.3, 4);
          }

        // Toast pops from the portrait.
        if (f.rare === 0 && ev < 3.5) {
          const p = ev / 1.6;
          const y = 16 + 19 - Math.max(0, Math.sin(Math.min(1, p) * Math.PI)) * 14 - (p < 1 ? 0 : 0);
          if (p < 2) {
            g.clip(138, 0, 44, 16 + 19 + 1);
            g.rect(138 + 13, y - 8, 6, 9, hex('#c88a4a'));
            g.rect(138 + 24, y - 9, 6, 10, hex('#c88a4a'));
            g.rect(138 + 14, y - 7, 4, 7, hex('#e8b070'));
            g.rect(138 + 25, y - 8, 4, 8, hex('#e8b070'));
            g.noClip();
          }
        }

        // Dust motes in the candlelight.
        for (let i = 0; i < 26; i++) {
          const x = 40 + ((hash3(i, 1) * 240 + Math.sin(t * 0.2 + i) * 10) % 240);
          const y = 20 + ((hash3(i, 2) * 100 + t * (1 + hash3(i, 3) * 2)) % 110);
          g.pxAdd(x, y, hex('#ffe0a0'), 0.25 + 0.2 * Math.sin(t + i));
        }

        // ── harpsichord robot ──
        const hb = play ? Math.round(Math.sin(beatT * Math.PI) * 0.6 + f.pulse * 0.8) : 0;
        const wigFlip = f.rare === 2 && ev < 4 ? Math.max(0, Math.sin(Math.min(1, ev / 1.2) * Math.PI)) * 6 : 0;
        robot(g, 141, 122 + hb, silver, -1, f.awake > 0.3, wigFlip);
        // arms on the keys, alternating
        const k1 = play ? Math.round(Math.sin(t * 7)) : 0;
        const k2 = play ? Math.round(Math.cos(t * 6.3)) : 0;
        g.line(136, 112 + hb, 128 + k1, 90 + 2, silver[1]!);
        g.line(138, 113 + hb, 122 + k2, 90 + 2, silver[2]!);
        if (play && Math.sin(t * 7) > 0.7) g.rect(124 + k1, 91, 2, 1, hex('#ffd27a'));

        // ── cellist ──
        const cb = play ? Math.round(Math.sin(beatT * Math.PI + 1) * 0.6) : 0;
        robot(g, 222, 122 + cb, brass, 0, f.awake > 0.3);
        // cello in front
        const cx = 212;
        g.ellipse(cx, 126, 8, 7, ink);
        g.ellipse(cx, 114, 6, 6, ink);
        g.ellipse(cx, 126, 7, 6, hex('#8a3a1a'));
        g.ellipse(cx, 114, 5, 5, hex('#8a3a1a'));
        g.rect(cx - 7, 120, 15, 2, hex('#8a3a1a'));
        g.px(cx - 3, 118, ink);
        g.px(cx + 3, 118, ink);
        g.rect(cx - 1, 82, 2, 30, ink);
        g.rect(cx - 2, 80, 4, 4, ink);
        g.vline(cx, 84, 130, hex('#d8c8a8'));
        g.vline(cx, 133, FLOOR_Y, hex('#a0a0a0'));
        g.line(cx - 4, 128, cx + 4, 128, ink);
        // bow arm sawing back and forth
        const bow = play ? Math.sin(t * Math.PI * 0.8) * 9 : 2;
        g.line(222 - 6, 110 + cb, cx + 4 + bow * 0.4, 121, brass[1]!);
        g.line(cx - 12 + bow, 121, cx + 14 + bow, 119, hex('#e8dcc0'));
        g.line(cx - 12 + bow, 122, cx + 14 + bow, 120, ink);
        // left hand on the neck
        g.line(222 - 7, 104 + cb, cx + 1, 94 + (play ? Math.round(Math.sin(t * 3)) * 3 : 0), brass[2]!);

        // ── conductor, seen from behind, with a spoon ──
        const pat = beatT % 4;
        const cbx = 169;
        const cby = 132 + (f.pulse > 0.5 && play ? -1 : 0);
        robot(g, cbx, cby, brass, 2, true);
        let ax = cbx + 12;
        let ay = cby - 26;
        if (play) {
          const seg = Math.floor(pat);
          const u = pat - seg;
          const pts = [
            [cbx + 6, cby - 32],
            [cbx + 8, cby - 18],
            [cbx - 4, cby - 22],
            [cbx + 18, cby - 22],
            [cbx + 6, cby - 32],
          ];
          const a = pts[seg]!;
          const b = pts[seg + 1]!;
          const e = u * u * (3 - 2 * u);
          ax = a[0]! + (b[0]! - a[0]!) * e;
          ay = a[1]! + (b[1]! - a[1]!) * e;
        }
        if (freeze) {
          ax = cbx + 12;
          ay = cby - 30 + (ev < 1.2 ? Math.round(Math.sin(ev * 30)) : 0);
        }
        thickLine(g, cbx + 7, cby - 13, ax, ay, 2, brass[1]!);
        g.line(ax, ay, ax + 3, ay - 6, silver[3]!);
        g.ellipse(ax + 4, ay - 7, 1, 2, silver[3]!);
        if (freeze && ev < 1.4) g.text('TINK', cbx + 14, cby - 44, hex('#fff4d0'));
        g.line(cbx - 7, cby - 13, cbx - 10, cby - 4, brass[1]!);

        // Notes drifting up from the instruments while they play.
        if (play) {
          for (let i = 0; i < 4; i++) {
            const p = (t * 0.25 + i * 0.25) % 1;
            const nx = (i % 2 ? 110 : 214) + Math.sin(p * 6 + i) * 4;
            const ny = 82 - p * 40;
            const c = mix(gold, wallC[1]!, p);
            g.rect(nx, ny, 2, 2, c);
            g.vline(nx + 1, ny - 4, ny, c);
            if (i % 2) g.px(nx + 2, ny - 4, c);
          }
        }
        if (blinking(t, 3)) g.rect(222 - 4, 122 - 25, 8, 1, brass[2]!);
        void envelope;
      },
    };
  },
};

export default def;

// The Infinite Song: a small stage where an elderly band has been playing the same song
// since the beginning of time. Their beards have grown across the floor and out of the door.
// A candle has burned down to a puddle. A hand-painted sign keeps count of the verses.

import { hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import { type Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, motes, shaft, vignette } from './lib/night';

const STAGE_Y = 104;
const DOOR = { x: 292, y: 136, w: 18, h: 40 };
const CANDLE = { x: 68, y: 92 };
const SIGN = { x: 160, y: 30 };
const BAND = [
  { x: 116, kind: 0 },
  { x: 160, kind: 1 },
  { x: 206, kind: 2 },
];
const VERSE0 = 4000112;

const def: SceneDef = {
  id: 'endless-stage',
  fps: 12,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#060404');
    const curtain = [mix(hex('#160608'), accent, 0.06), mix(hex('#220a0c'), accent, 0.1), mix(hex('#2e1012'), accent, 0.16)];
    const boards = [hex('#160e0a'), hex('#20140e'), hex('#2a1c12')];
    const beard = hex('#c8c4bc');
    const beardD = hex('#8a8680');
    const spot = hex('#ffe0b0');
    const skin = hex('#a8806a');
    const coat = [hex('#1e1a20'), hex('#2a2018'), hex('#1a2020')];
    const pts = [0, 0];

    /** A beard's path from a chin to the door: a lazy curve across the boards. */
    const beardPath = (i: number, u: number, out: number[], taut: number) => {
      const b = BAND[i]!;
      const sx = b.x - 2;
      const sy = STAGE_Y - 22;
      const ex = DOOR.x + 4;
      const ey = DOOR.y - 4 - i * 3;
      // down to the floor, then a long sweep toward the door
      const mx = b.x + 10 - i * 6;
      const my = STAGE_Y + 14 + i * 7;
      const v = u < 0.2 ? u / 0.2 : (u - 0.2) / 0.8;
      if (u < 0.2) {
        out[0] = sx + (mx - sx) * v * 0.4;
        out[1] = sy + (my - sy) * v;
      } else {
        const wob = Math.sin(v * 5 + i * 2) * 6 * (1 - taut);
        out[0] = sx + (mx - sx) * 0.4 + (ex - (sx + (mx - sx) * 0.4)) * v;
        out[1] = my + (ey - my) * v + wob;
      }
    };

    const musician = (g: Gfx, i: number, t: number, nod: number, chin: number, play: number) => {
      const b = BAND[i]!;
      const x = b.x;
      const y = STAGE_Y;
      const c = coat[i]!;
      // stool and body, seated
      g.rect(x - 5, y - 10, 10, 2, hex('#3a2818'));
      g.vline(x - 4, y - 8, y, hex('#2a1c12'));
      g.vline(x + 4, y - 8, y, hex('#2a1c12'));
      g.ellipse(x, y - 18, 6, 9, c);
      g.rect(x - 4, y - 11, 9, 3, c);
      g.rect(x + 3, y - 9, 2, 9, c);
      // head, bald on top, eyebrows like hedges
      const hx = x + Math.round(chin * 2);
      const hy = y - 31 + Math.round(nod * 3);
      g.disc(hx, hy, 4, skin);
      g.hline(hx - 3, hx + 3, hy - 3, mix(skin, hex('#ffe8d0'), 0.3));
      g.hline(hx - 3, hx - 1, hy - 1, beard);
      g.hline(hx + 1, hx + 3, hy - 1, beard);
      if (nod < 0.6 && !blinking(t, 50 + i)) {
        g.px(hx - 2, hy, ink);
        g.px(hx + 2, hy, ink);
      }
      g.ellipse(hx - 4, hy, 1, 2, beard);
      g.ellipse(hx + 4, hy, 1, 2, beard);
      // the beard begins
      g.ellipse(hx, hy + 5, 4, 4, beard);
      g.ellipse(hx - 1, hy + 9, 3, 4, beardD);
      // instruments
      if (b.kind === 0) {
        // guitar, strummed
        g.ellipse(x - 2, y - 16, 6, 5, hex('#5a3418'));
        g.disc(x - 2, y - 16, 1, ink);
        g.line(x + 2, y - 19, x + 14, y - 30, hex('#3a2010'));
        g.line(x + 5, y - 17 + Math.round(play * 2), x - 1, y - 14, skin);
      } else if (b.kind === 1) {
        // fiddle under the chin, the bow sawing
        g.ellipse(x + 5, y - 25, 4, 2, hex('#7a3a18'));
        g.line(x + 2, y - 27, x + 12, y - 24, hex('#3a1a08'));
        const bx = x + 2 + Math.round(play * 6);
        g.line(bx - 6, y - 20, bx + 8, y - 28, hex('#c8b890'));
        g.line(x - 4, y - 20, bx - 2, y - 22, skin);
      } else {
        // a snare drum and brushes
        g.ellipse(x - 6, y - 10, 7, 2, hex('#c8c0b0'));
        g.rect(x - 13, y - 10, 14, 5, hex('#6a2a20'));
        g.vline(x - 6, y - 5, y, hex('#3a3030'));
        g.line(x - 2, y - 18, x - 8 + Math.round(play * 3), y - 11, skin);
      }
    };

    return {
      background(g) {
        // The hall: dark plaster, a proscenium of tired red velvet.
        g.vgrad([hex('#060405'), hex('#0c0809'), hex('#120c0c')], g.top, STAGE_Y);
        for (let y = g.top; y < STAGE_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const inSwag = x < 60 || x > 262 || y < 20 + Math.sin(((x - 60) / 202) * Math.PI) * -10 + 10;
            if (!inSwag) continue;
            const fold = Math.sin(x * 0.45 + y * 0.02);
            g.px(x, y, fold > 0.5 ? curtain[2]! : fold > -0.3 ? curtain[1]! : curtain[0]!);
          }
        // fringe and a cobweb
        for (let x = 60; x < 262; x += 2) g.vline(x, 20 + Math.sin(((x - 60) / 202) * Math.PI) * 0 + 0, 22, mix(accent, hex('#c8a060'), 0.4));
        for (let k = 0; k < 6; k++) g.lineA(60, 22, 60 + k * 4, 22 + 24 - k * 4, hex('#8a8680'), 0.25);
        for (let k = 1; k < 4; k++) for (let a = 0; a < 1.4; a += 0.05) g.pxA(60 + Math.cos(a) * k * 6, 22 + Math.sin(a) * k * 6, hex('#8a8680'), 0.2);
        // The stage boards.
        for (let y = STAGE_Y - 6; y < STAGE_Y + 4; y++)
          for (let x = 54; x < 268; x++) g.px(x, y, (x + (y % 2) * 7) % 22 === 0 ? boards[0]! : boards[2]!);
        g.hline(54, 267, STAGE_Y - 6, mix(boards[2]!, spot, 0.25));
        g.rect(54, STAGE_Y + 4, 214, 10, boards[1]!);
        for (let x = 58; x < 268; x += 24) g.vline(x, STAGE_Y + 4, STAGE_Y + 13, boards[0]!);
        // The hall floor, in perspective, leading to a door on the right.
        for (let y = STAGE_Y + 14; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const u = ((x - 160) / (y - 70)) * 5;
            const edge = ((u % 1) + 1) % 1 < 0.08;
            g.px(x, y, edge ? boards[0]! : hash3(Math.floor(u), 3, 2) > 0.5 ? boards[1]! : hex('#1a110c'));
          }
        // the door, ajar, a little light from outside
        g.rect(DOOR.x - 2, DOOR.y - DOOR.h - 2, DOOR.w + 4, DOOR.h + 2, hex('#1a100a'));
        g.rect(DOOR.x, DOOR.y - DOOR.h, DOOR.w, DOOR.h, hex('#2a1c14'));
        g.rect(DOOR.x, DOOR.y - DOOR.h, 5, DOOR.h, hex('#5a4a38'));
        g.glow(DOOR.x + 2, DOOR.y - 10, 18, hex('#c8d0e0'), 0.1);
        // The candle stand, the candle long since a puddle.
        const { x: cx, y: cy } = CANDLE;
        g.vline(cx, cy, STAGE_Y - 6, hex('#3a3020'));
        g.ellipse(cx, STAGE_Y - 6, 5, 1, hex('#3a3020'));
        g.ellipse(cx, cy, 6, 2, hex('#5a4a30'));
        g.ellipse(cx, cy - 1, 5, 1, hex('#e8dcc8'));
        for (let i = 0; i < 5; i++) g.vline(cx - 4 + i * 2, cy + 1, cy + 3 + ((hash3(i, 1) * 9) | 0), hex('#d8ccb8'));
        // The sign, hung on chains.
        const { x: sx, y: sy } = SIGN;
        g.line(sx - 22, 10, sx - 20, sy, hex('#4a4030'));
        g.line(sx + 22, 10, sx + 20, sy, hex('#4a4030'));
        g.rect(sx - 34, sy, 68, 12, hex('#3a2a1a'));
        g.rect(sx - 33, sy + 1, 66, 10, hex('#c8b890'));
        shaft(g, 160, g.top - 10, 160, STAGE_Y, 14, 130, spot, 0.07, 0.2, 5);
        vignette(g, 0.55, 160, 80, 220, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;

        // The spotlight on the band, and dust in it.
        g.glow(160, STAGE_Y - 20, 40, spot, (0.02 + e * 0.04) * awake);
        motes(g, t, 100, 20, 120, 80, 30, spot, 0.35, 5, 0.25);

        // The sign: the verse count, painted over and over.
        const flip = f.rare === 0 && ev < 10 ? clamp((ev - 2) / 1.2) : 0;
        const verse = VERSE0 + Math.floor(t / 47) + (flip >= 1 ? 1 : 0);
        const vs = String(verse);
        const pretty = vs.slice(0, vs.length - 6) + ',' + vs.slice(-6, -3) + ',' + vs.slice(-3);
        g.textCenter('VERSE ' + pretty, SIGN.x, SIGN.y + 3, hex('#5a1e18'));
        if (flip > 0 && flip < 1) g.rect(SIGN.x + 26, SIGN.y + 2 + Math.round(flip * 4), 6, Math.round(8 * (1 - flip)), hex('#c8b890'));
        if (f.rare === 0 && ev > 3 && ev < 6) g.text('+1', SIGN.x + 36, SIGN.y - 4 - (ev - 3) * 3, mix(spot, hex('#000000'), (ev - 3) / 3));

        // The candle's last flame, flickering in its puddle.
        const fl = flicker(t, 3);
        g.px(CANDLE.x, CANDLE.y - 2, mix(hex('#ff9a40'), hex('#fff0c0'), fl * 0.6));
        if (fl > 0.8) g.px(CANDLE.x, CANDLE.y - 3, hex('#ffb060'));
        g.glow(CANDLE.x, CANDLE.y - 2, 14, hex('#ffb060'), 0.22 * fl);

        // The beards: three long white streams across the boards and out of the door.
        const tug = f.rare === 2 && ev < 10 ? envelope(ev, 10, 1.5, 2) : 0;
        for (let i = 0; i < BAND.length; i++) {
          const taut = i === 2 ? tug : 0;
          // three passes: shadow, body, then highlight and strands, so nothing striped through
          for (let pass = 0; pass < 3; pass++) {
            for (let k = 0; k <= 320; k++) {
              const u = k / 320;
              beardPath(i, u, pts, taut);
              const sway = f.reduced || u < 0.2 ? 0 : Math.sin(t * 0.6 + u * 8 + i) * 0.6 * (1 - u);
              const x = Math.round(pts[0]! + sway);
              const y = Math.round(pts[1]!);
              const w = Math.round(6 - u * 2.5);
              const vert = u < 0.2;
              if (pass === 0) {
                if (vert) g.rect(x - (w >> 1) + 1, y, w, 1, shade(beardD, 0.55));
                else g.rect(x, y, 1, w, shade(beardD, 0.55));
              } else if (pass === 1) {
                if (vert) g.rect(x - (w >> 1), y, w - 1, 1, mix(beard, beardD, 0.45));
                else g.rect(x, y - 1, 1, w - 1, mix(beard, beardD, 0.45));
              } else {
                if (vert) g.px(x - (w >> 1), y, beard);
                else g.px(x, y - 1, beard);
                const sd = 1 + ((i + (k >> 5)) % 2);
                if (vert) g.px(x - (w >> 1) + sd + 1, y, beard);
                else g.px(x, y + sd, beardD);
              }
            }
          }
        }

        // ── the band ──
        const dozer = f.rare === 1 && ev < 10 ? 0 : -1;
        for (let i = 0; i < BAND.length; i++) {
          let nod = clamp(1 - awake) * 0.8;
          if (dozer === 0 && i === 0) nod = ev < 7 ? envelope(ev, 7, 2, 0.3) : 0;
          const play = f.reduced ? 0.5 : (Math.sin(t * (3 + i) + i) * 0.5 + 0.5) * (1 - nod * 0.8) * (0.4 + 0.6 * awake);
          const chin = i === 2 ? tug : 0;
          musician(g, i, t, nod, chin, play);
        }
        if (dozer === 0 && ev > 6.9 && ev < 7.6) g.text('!', BAND[0]!.x - 1, STAGE_Y - 44, spot);

        // Rare: a spider comes down on a thread and taps along on the fiddle.
        if (f.rare === 3 && ev < 10) {
          const down = envelope(ev, 10, 3, 2);
          const sx = BAND[1]!.x + 10;
          const sy = 20 + down * 56 + (f.pulse * 1.5);
          g.vline(sx, 20, sy, hex('#6a6660'));
          g.disc(sx, sy + 1, 1, hex('#1a1414'));
          for (let k = -1; k <= 1; k += 2) {
            g.px(sx + k * 2, sy, hex('#1a1414'));
            g.px(sx + k * 2, sy + 2, hex('#1a1414'));
          }
        }
      },
    };
  },
};

export default def;

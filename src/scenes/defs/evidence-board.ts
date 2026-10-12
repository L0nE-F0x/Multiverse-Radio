// Unsolved Dimensions: a dim detective's office at night. A cork evidence board, red string
// joining a teaspoon, the moon and a confused goose. A desk lamp, rain on the blinds, a
// cold cup of coffee, a typewriter mid-sentence, and a neon sign blinking outside.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { frameRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { flicker, motes, rain, vignette } from './lib/night';

const BOARD = { x: 86, y: 20, w: 140, h: 74 };
const WIN = { x: 244, y: 18, w: 64, h: 82 };
const DESK_Y = 110;
const LAMP = { x: 72, y: DESK_Y };
const CUP = { x: 128, y: DESK_Y };
const TYPE = { x: 200, y: DESK_Y };
// Pinned items on the board (pin positions).
const SPOON = { x: 108, y: 30 };
const MOON = { x: 204, y: 28 };
const GOOSE = { x: 158, y: 74 };
const CARD = { x: 112, y: 76 };
const MAP = { x: 182, y: 56 };

const def: SceneDef = {
  id: 'evidence-board',
  fps: 15,
  focusY: 80,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#060506');
    const wallC = [hex('#0e0c0e'), hex('#141114'), hex('#1a1619')];
    const cork = [hex('#2a1c12'), hex('#36241a'), hex('#432e20')];
    const paper = hex('#b8ae98');
    const paperD = hex('#7a7262');
    const string = mix(accent, hex('#c02a20'), 0.5);
    const neon = mix(accent, hex('#ff3a3a'), 0.4);
    const lampC = hex('#ffd890');
    const woodC = [hex('#160d08'), hex('#22140c'), hex('#2e1c10')];

    const photo = (g: Gfx, x: number, y: number, w: number, h: number, inner: (g: Gfx, x: number, y: number) => void) => {
      g.rect(x - w / 2 + 1, y + 1, w, h, ink);
      g.rect(x - w / 2, y, w, h, paper);
      g.rect(x - w / 2 + 2, y + 2, w - 4, h - 7, hex('#1e2024'));
      inner(g, x, y + 2);
      g.hline(x - w / 2, x + w / 2 - 1, y + h - 1, paperD);
    };

    const pin = (g: Gfx, x: number, y: number, c: Color) => {
      g.px(x, y, c);
      g.px(x + 1, y, shade(c, 0.6));
      g.px(x, y + 1, shade(c, 0.6));
    };

    const goose = (g: Gfx, x: number, y: number, turn: number) => {
      // a small grey goose, neck up, head cocked; a question mark over it
      const c = hex('#a8a8a0');
      g.ellipse(x - 1, y + 13, 5, 3, c);
      g.vline(x + 2, y + 5, y + 11, c);
      g.vline(x + 3, y + 5, y + 10, c);
      g.rect(x + 1 + turn, y + 3, 3, 3, hex('#2a2a2a'));
      g.px(x + 4 + turn * 2, y + 4, hex('#d89040'));
      if (turn < 0) g.px(x + 1, y + 4, hex('#d89040'));
      g.px(x + 2 + turn, y + 3, hex('#ffffff'));
      g.text('?', x - 7, y + 1, hex('#c8c0a8'));
    };

    return {
      background(g) {
        // Plaster wall, darker at the edges, a little water stain.
        for (let y = g.top; y < DESK_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 30, y / 22, 6, 3);
            const v = n * 0.9 + 0.1;
            g.px(x, y, v > 0.62 + bayer(x, y) * 0.12 ? wallC[2]! : v > 0.42 + bayer(x, y) * 0.12 ? wallC[1]! : wallC[0]!);
          }
        // Coat rack with a trench coat and a hat, far left.
        g.vline(30, 20, DESK_Y + 30, hex('#1a1210'));
        g.vline(31, 20, DESK_Y + 30, hex('#100a08'));
        g.line(30, 22, 24, 18, hex('#1a1210'));
        g.line(31, 22, 37, 18, hex('#1a1210'));
        g.poly([22, 24, 40, 24, 46, 84, 16, 84], hex('#1c1812'));
        g.poly([22, 24, 31, 24, 28, 84, 16, 84], hex('#16130e'));
        g.line(40, 24, 46, 84, mix(hex('#1c1812'), accent, 0.25));
        g.line(31, 26, 33, 70, hex('#1a160e'));
        g.ellipse(31, 18, 10, 2, hex('#141010'));
        g.rect(25, 12, 13, 6, hex('#141010'));
        g.hline(25, 37, 16, mix(hex('#141010'), accent, 0.4));

        // The board: cork in a wooden frame.
        const B = BOARD;
        for (let y = B.y; y < B.y + B.h; y++)
          for (let x = B.x; x < B.x + B.w; x++) {
            const h = hash3(x, y, 9);
            g.px(x, y, h < 0.25 ? cork[0]! : h < 0.75 ? cork[1]! : cork[2]!);
          }
        frameRect(g, B.x - 3, B.y - 3, B.w + 6, B.h + 6, woodC[0]!);
        frameRect(g, B.x - 2, B.y - 2, B.w + 4, B.h + 4, woodC[2]!);
        frameRect(g, B.x - 1, B.y - 1, B.w + 2, B.h + 2, woodC[1]!);

        // Clippings, a map, index cards.
        g.rect(B.x + 40, B.y + 6, 26, 18, hex('#8a8270'));
        for (let i = 0; i < 6; i++) g.hline(B.x + 42, B.x + 42 + 8 + ((hash3(i, 2) * 12) | 0), B.y + 9 + i * 2, hex('#4a463c'));
        g.rect(MAP.x, MAP.y, 30, 18, hex('#4a5a4a'));
        g.line(MAP.x + 2, MAP.y + 10, MAP.x + 28, MAP.y + 4, hex('#2e3e2e'));
        g.line(MAP.x + 10, MAP.y + 2, MAP.x + 16, MAP.y + 16, hex('#2e3e2e'));
        g.disc(MAP.x + 18, MAP.y + 10, 2, accent);
        g.rect(CARD.x - 10, CARD.y - 2, 22, 13, paper);
        g.text('TUE?', CARD.x - 8, CARD.y + 1, hex('#5a2020'));
        g.hline(CARD.x - 8, CARD.x + 8, CARD.y + 8, paperD);
        g.rect(B.x + 76, B.y + 30, 14, 10, hex('#a89e88'));
        g.hline(B.x + 78, B.x + 87, B.y + 33, hex('#5a5448'));
        g.hline(B.x + 78, B.x + 84, B.y + 36, hex('#5a5448'));

        // Photographs: a teaspoon, the moon, and the goose (drawn per frame).
        photo(g, SPOON.x, SPOON.y + 1, 22, 24, (gg, x, y) => {
          gg.ellipse(x - 3, y + 6, 3, 2, hex('#b8bcc0'));
          gg.line(x - 1, y + 7, x + 6, y + 13, hex('#a8acb0'));
          gg.px(x - 4, y + 5, hex('#ffffff'));
        });
        photo(g, MOON.x, MOON.y + 1, 22, 24, (gg, x, y) => {
          gg.disc(x, y + 8, 6, hex('#d8d4c0'));
          gg.disc(x + 3, y + 7, 5, hex('#1e2024'));
        });
        photo(g, GOOSE.x, GOOSE.y - 20, 22, 24, () => {});

        // Window with blinds on the right: rain outside, the neon's glow beyond.
        const W = WIN;
        g.rect(W.x - 3, W.y - 3, W.w + 6, W.h + 6, woodC[1]!);
        g.gradRect(W.x, W.y, W.w, W.h, [hex('#0c0a12'), hex('#1a1018'), mix(hex('#2a0c10'), neon, 0.25)]);
        for (let i = 0; i < 6; i++) {
          const bx = W.x + 4 + i * 11;
          const bh = 20 + ((hash3(i, 4) * 30) | 0);
          g.rect(bx, W.y + W.h - bh, 9, bh, hex('#08070a'));
          for (let k = 0; k < 4; k++) if (hash3(i, k, 6) < 0.4) g.px(bx + 2 + k * 2, W.y + W.h - bh + 4 + k * 5, hex('#c8a060'));
        }

        // The desk: dark wood top, lamp, a file, the typewriter, the cup.
        g.rect(g.left, DESK_Y, g.w, 8, woodC[2]!);
        g.hline(g.left, g.right, DESK_Y, mix(woodC[2]!, lampC, 0.2));
        g.vgrad([woodC[1]!, woodC[0]!, ink], DESK_Y + 8, g.bottom, DESK_Y + 8);
        g.rect(96, DESK_Y - 2, 26, 3, hex('#8a6a40'));
        g.rect(98, DESK_Y - 3, 24, 1, hex('#b8a888'));
        g.text('CASE', 100, DESK_Y + 2, hex('#3a2a18'));

        // Typewriter, sheet in, mid-sentence.
        const { x: tx, y: ty } = TYPE;
        g.poly([tx - 22, ty, tx + 22, ty, tx + 18, ty - 10, tx - 18, ty - 10], hex('#121214'));
        g.rect(tx - 20, ty - 14, 40, 5, hex('#1a1a1e'));
        g.rect(tx - 24, ty - 16, 48, 3, hex('#26262a'));
        g.hline(tx - 24, tx + 23, ty - 16, hex('#4a4a50'));
        g.rect(tx - 14, ty - 34, 28, 19, hex('#a8a090'));
        g.text('THE TUESDAY', tx - 13, ty - 31, hex('#2a2620'));
        g.text('WAS LAST S', tx - 13, ty - 24, hex('#2a2620'));
        for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) g.px(tx - 16 + k * 4 + (r % 2) * 2, ty - 7 + r * 2, hex('#3a3a40'));

        // Lamp: a heavy base, a green glass shade.
        const { x: lx, y: ly } = LAMP;
        g.ellipse(lx, ly - 1, 9, 2, hex('#2a2010'));
        g.vline(lx, ly - 22, ly - 2, hex('#3a2c14'));
        g.poly([lx - 14, ly - 22, lx + 14, ly - 22, lx + 9, ly - 30, lx - 9, ly - 30], hex('#16301e'));
        g.hline(lx - 9, lx + 8, ly - 30, hex('#3a6040'));
        g.hline(lx - 14, lx + 13, ly - 22, hex('#5a8060'));

        // The cup of coffee, long cold.
        const { x: cx, y: cy } = CUP;
        g.rect(cx - 5, cy - 9, 10, 9, hex('#c8c0b0'));
        g.rect(cx + 5, cy - 7, 2, 4, hex('#c8c0b0'));
        g.rect(cx - 4, cy - 9, 8, 1, hex('#2a1a10'));
        g.rect(cx + 2, cy - 8, 2, 7, hex('#e8e0d0'));
        g.ellipse(cx, cy, 7, 1, hex('#8a8070'));

        // Lamp light pooled on the desk and up the board.
        g.glow(lx, ly - 18, 60, lampC, 0.12, 6);
        for (let y = ly - 21; y < ly + 4; y++) {
          const w = 14 + (y - (ly - 21)) * 2.6;
          g.rectAdd(lx - w / 2, y, w, 1, lampC, 0.05);
        }
        g.ellipseA(lx + 6, ly, 50, 4, lampC, 0.12);
        vignette(g, 0.6, 160, 80, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // Rain on the glass.
        g.clip(WIN.x, WIN.y, WIN.w, WIN.h);
        rain(g, t, WIN.x, WIN.y, WIN.w, WIN.h, 34, hex('#7a7088'), 0.35, 120, 0.12, 5, 3);
        for (let i = 0; i < 10; i++) {
          const p = (t * (0.04 + hash3(i, 1) * 0.05) + hash3(i, 2)) % 1;
          g.px(WIN.x + hash3(i, 3) * WIN.w, WIN.y + p * WIN.h, hex('#b8a8b8'));
        }
        g.noClip();

        // The neon outside: on, off, a stutter; its red light falls through the blinds.
        const cyc = t % 5;
        let nk = cyc < 3.2 ? 1 : cyc < 3.4 ? 0.2 : cyc < 3.5 ? 1 : cyc < 3.7 ? 0.1 : 0.15;
        if (f.reduced) nk = 0.7;
        g.glow(WIN.x + WIN.w / 2, WIN.y + 20, 40, neon, 0.18 * nk);
        // Blinds: slats drawn over the window; their shadow-stripes across the wall.
        for (let y = WIN.y; y < WIN.y + WIN.h; y += 4) {
          g.rect(WIN.x, y + 2, WIN.w, 2, hex('#141014'));
          g.hline(WIN.x, WIN.x + WIN.w - 1, y + 2, mix(hex('#2a2024'), neon, 0.2 * nk));
        }
        g.vline(WIN.x + 20, WIN.y, WIN.y + WIN.h, hex('#0a080a'));
        const sk = 0.075 * nk * (0.4 + 0.6 * awake);
        if (sk > 0.02) for (let y = 14; y < DESK_Y + 6; y++) {
          for (let x = 60; x < WIN.x - 4; x++) {
            const v = y - (WIN.x - x) * 0.32;
            if (((Math.floor(v) % 6) + 6) % 6 > 2) continue;
            const fall = 1 - (WIN.x - x) / 190;
            if (fall <= 0) continue;
            g.pxAdd(x, y, neon, sk * fall);
          }
        }

        // Red string between the pins.
        const turn = f.rare === 1 && ev < 10 ? (ev > 2 && ev < 8 ? -1 : 0) : 0;
        photoGoose(g, GOOSE.x, GOOSE.y - 18, turn);
        const sag = f.reduced ? 0 : Math.sin(t * 0.5) * 0.3;
        g.line(SPOON.x, SPOON.y, MOON.x, MOON.y + 1 + sag, string);
        g.line(MOON.x, MOON.y, GOOSE.x, GOOSE.y - 20, string);
        g.line(CARD.x, CARD.y - 2, GOOSE.x, GOOSE.y - 20, string);
        g.line(CARD.x, CARD.y - 2, SPOON.x, SPOON.y, string);
        // Rare: a new length of string runs itself from the goose to the map.
        if (f.rare === 0 && ev < 10) {
          const p = clamp((ev - 1) / 4);
          const ex = GOOSE.x + (MAP.x + 18 - GOOSE.x) * p;
          const ey = GOOSE.y - 20 + (MAP.y + 10 - (GOOSE.y - 20)) * p;
          g.line(GOOSE.x, GOOSE.y - 20, ex, ey, mix(string, hex('#ff6a5a'), 0.3 * envelope(ev, 10, 1, 2)));
          if (p >= 1) pin(g, MAP.x + 18, MAP.y + 9, hex('#e8e0d0'));
        }
        pin(g, SPOON.x, SPOON.y, hex('#d84a3a'));
        pin(g, MOON.x, MOON.y, hex('#d84a3a'));
        pin(g, GOOSE.x, GOOSE.y - 20, hex('#d84a3a'));
        pin(g, CARD.x, CARD.y - 2, hex('#e8c040'));

        // The lamp hums; its bulb shows under the shade.
        const lk = flicker(t * 0.3, 2) * 0.15 + 0.85;
        g.hline(LAMP.x - 8, LAMP.x + 7, LAMP.y - 21, mix(lampC, hex('#ffffff'), 0.3));
        g.glow(LAMP.x, LAMP.y - 20, 18, lampC, 0.25 * lk * (0.6 + 0.4 * awake));
        motes(g, t, LAMP.x - 30, LAMP.y - 20, 60, 24, 10, lampC, 0.3, 3, 0.4);

        // Rare: the phone rings, unanswered.
        const px = 232;
        const py = DESK_Y;
        const ring = f.rare === 2 && ev < 10 && (ev % 2.4) < 1.2 && !f.reduced;
        const shake = ring ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0;
        g.rect(px - 9 + shake, py - 5, 18, 5, hex('#141214'));
        g.rect(px - 10 + shake, py - 8, 20, 3, hex('#1c1a1c'));
        g.hline(px - 10 + shake, px + 9 + shake, py - 8, hex('#3a383c'));
        g.disc(px + shake, py - 3, 2, hex('#2a282c'));
        if (ring) g.glow(px, py - 6, 10, hex('#e8e0d0'), 0.08);

        // Rare: the coffee musters a single wisp of steam, then thinks better of it.
        if (f.rare === 3 && ev < 10) {
          const k = envelope(ev, 6, 1.5, 2.5);
          for (let i = 0; i < 6; i++) {
            const p = i / 6;
            g.pxA(CUP.x + Math.sin(p * 6 + ev * 2) * 2, CUP.y - 10 - p * 12 * k, hex('#c8c0b0'), 0.4 * k * (1 - p));
          }
        }
      },
    };

    function photoGoose(g: Gfx, x: number, y: number, turn: number) {
      g.rect(x - 9, y + 2, 18, 17, hex('#1e2024'));
      goose(g, x, y + 2, turn);
    }
  },
};

export default def;

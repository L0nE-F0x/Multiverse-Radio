// The Tiny Hour: a children's TV set built inside a matchbox on a desk at night. A tiny
// presenter on a thimble stool, a felt board, a ladybird puppet, two pinhead studio lights,
// and everyday things looming at the edges: a pencil like a log, a button like a table.

import { hex, mix } from '../kit/color';
import { blinking, clamp, envelope } from '../kit/fx';
import { type Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { motes, vignette } from './lib/night';

const BOX = { x0: 96, x1: 226, back: 50, floorY: 104, front: 120 };
const PIM = { x: 150, y: 104 };
const BUG = { x: 184, y: 104 };
const DESK_Y = 120;

const def: SceneDef = {
  id: 'tiny-studio',
  fps: 15,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#060504');
    const lampC = hex('#ffd08a');
    const card = [hex('#3a2818'), hex('#523a24'), hex('#6e5434'), hex('#8a6e48')];
    const felt = hex('#1e3a4a');
    const silver = [hex('#3a3c42'), hex('#6a6e78'), hex('#a8acb8'), hex('#d8dce4')];
    const wood = [hex('#120c08'), hex('#1c130c'), hex('#2a1c12')];

    const presenter = (g: Gfx, t: number, bob: number, wave: number, look: number) => {
      const { x, y } = PIM;
      const by = y - 14 + bob;
      // thimble stool
      g.ball(x, y - 5, 6, 6, silver, -0.5, -0.4, 0.3);
      g.rect(x - 6, y - 5, 13, 5, silver[1]!);
      for (let i = 0; i < 6; i++) g.px(x - 5 + i * 2, y - 4 + (i % 2), silver[3]!);
      g.hline(x - 6, x + 6, y - 1, silver[0]!);
      // a cheerful jumper, a skirt, little legs
      g.rect(x - 1, by + 6, 1, 4, hex('#2a1e18'));
      g.rect(x + 1, by + 6, 1, 4, hex('#2a1e18'));
      g.rect(x - 3, by, 7, 7, mix(accent, hex('#c85a3a'), 0.4));
      g.hline(x - 3, x + 3, by + 3, mix(accent, hex('#ffffff'), 0.3));
      // head, hair in a bun
      const hx = x + look;
      g.disc(hx, by - 3, 3, hex('#c89a7a'));
      g.disc(hx + 2, by - 6, 2, hex('#4a2a1a'));
      g.hline(hx - 3, hx + 2, by - 6, hex('#4a2a1a'));
      if (!blinking(t, 41)) {
        g.px(hx - 1, by - 3, ink);
        g.px(hx + 1, by - 3, ink);
      }
      g.px(hx, by - 1, hex('#a84a3a'));
      // one arm waving at the very small viewers
      g.line(x + 3, by + 1, x + 6, by - 2 - Math.round(wave * 2), hex('#c89a7a'));
      g.line(x - 3, by + 1, x - 5, by + 5, hex('#c89a7a'));
    };

    const ladybird = (g: Gfx, x: number, y: number, open: number) => {
      g.vline(x, y - 6, y, hex('#8a6a40'));
      if (open > 0) {
        g.tri(x, y - 10, x - 6 - open * 3, y - 14 - open * 2, x - 2, y - 7, hex('#e8e0d0'), 1, 0.5);
        g.tri(x, y - 10, x + 6 + open * 3, y - 14 - open * 2, x + 2, y - 7, hex('#e8e0d0'), 1, 0.5);
      }
      g.ellipse(x, y - 9, 4, 3, hex('#b82a1a'));
      g.vline(x, y - 12, y - 6, ink);
      g.px(x - 2, y - 10, ink);
      g.px(x + 2, y - 9, ink);
      g.px(x - 1, y - 7, ink);
      g.ellipse(x, y - 12, 2, 1, ink);
      g.px(x - 1, y - 11, hex('#ffffff'));
    };

    return {
      background(g) {
        // The room beyond the desk: dark, a few soft out-of-focus lights.
        g.vgrad([hex('#05060a'), hex('#0a0a10'), hex('#100c0c')], g.top, DESK_Y);
        for (let i = 0; i < 6; i++) g.glow(20 + hash3(i, 1) * 280, 10 + hash3(i, 2) * 40, 8 + hash3(i, 3) * 8, i % 2 ? hex('#5a6a8a') : hex('#8a6a4a'), 0.12, 4);
        // The desk.
        for (let y = DESK_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const grain = Math.sin(x * 0.07 + Math.sin(y * 0.4) * 2) * 0.5 + 0.5;
            g.px(x, y, grain > 0.75 ? wood[2]! : grain > 0.35 ? wood[1]! : wood[0]!);
          }
        g.ellipseA(150, DESK_Y + 6, 140, 18, lampC, 0.08);

        // The matchbox sleeve behind, the drawer pulled toward us.
        const B = BOX;
        g.rect(B.x0 + 8, B.back - 12, B.x1 - B.x0 - 16, 14, card[1]!);
        g.rect(B.x0 + 8, B.back - 12, B.x1 - B.x0 - 16, 2, card[2]!);
        g.rect(B.x0 + 30, B.back - 10, 60, 8, mix(hex('#3a5a7a'), accent, 0.2));
        g.text('SAFETY', B.x0 + 34, B.back - 9, hex('#e8d8b0'));
        // striker strip on the sleeve's side
        for (let y = B.back - 10; y < B.back; y++)
          for (let x = B.x1 - 8; x < B.x1 - 3; x++) g.px(x, y, hash3(x, y, 2) < 0.5 ? hex('#3a2418') : hex('#5a3a28'));
        // drawer: back wall, side walls, floor
        g.rect(B.x0, B.back, B.x1 - B.x0, B.floorY - B.back, card[2]!);
        for (let y = B.back; y < B.floorY; y++)
          for (let x = B.x0; x < B.x1; x++) if (hash3(x >> 1, y, 4) < 0.12) g.px(x, y, card[1]!);
        g.poly([B.x0 - 10, B.front, B.x0, B.floorY, B.x0, B.back, B.x0 - 10, B.back + 8], card[1]!);
        g.poly([B.x1 + 10, B.front, B.x1, B.floorY, B.x1, B.back, B.x1 + 10, B.back + 8], card[0]!);
        g.poly([B.x0 - 10, B.front, B.x1 + 10, B.front, B.x1, B.floorY, B.x0, B.floorY], card[3]!);
        g.rect(B.x0 - 10, B.front, B.x1 - B.x0 + 20, 4, card[1]!);
        g.hline(B.x0 - 10, B.x1 + 9, B.front, card[3]!);

        // The felt board on the back wall, with felt shapes.
        g.rect(128, 64, 46, 30, hex('#3a2a1a'));
        g.rect(129, 65, 44, 28, felt);
        g.disc(140, 74, 4, mix(accent, hex('#e8c040'), 0.5));
        g.rect(152, 80, 10, 8, hex('#c85a3a'));
        g.tri(150, 80, 164, 80, 157, 73, hex('#8a3a2a'));
        g.rect(166, 82, 2, 6, hex('#5a3a20'));
        g.disc(167, 79, 3, hex('#3a7a3a'));
        g.rect(146, 94, 2, 10, hex('#3a2a1a'));
        g.rect(156, 94, 2, 10, hex('#3a2a1a'));

        // A button, used as a table, with a tiny cup on it.
        g.ellipse(206, 104, 13, 4, ink);
        g.ellipse(206, 101, 13, 4, hex('#5a3a5a'));
        g.ellipse(206, 100, 11, 3, hex('#7a4a7a'));
        for (const [dx, dy] of [[-3, -1], [3, -1], [-3, 1], [3, 1]]) g.px(206 + dx!, 100 + dy!, hex('#2a1a2a'));
        g.rect(203, 96, 3, 3, hex('#e8e0d0'));
        g.px(204, 95, hex('#c8c0b0'));

        // Two pinhead studio lights on toothpick stands (glow per frame).
        for (const lx of [110, 214]) {
          g.vline(lx, 60, B.floorY, hex('#c8a870'));
          g.disc(lx, 58, 2, silver[2]!);
        }

        // Looming everyday objects: a paperclip against the box, a coin, the pencil log.
        g.rect(236, 56, 2, 64, silver[1]!);
        g.rect(244, 62, 2, 58, silver[1]!);
        g.rect(236, 54, 10, 2, silver[2]!);
        g.rect(238, 118, 8, 2, silver[1]!);
        g.vline(237, 58, 118, silver[3]!);
        g.ellipse(64, 126, 26, 7, hex('#3a2a14'));
        g.ellipse(64, 124, 26, 7, hex('#8a6a2a'));
        g.ellipse(64, 124, 21, 5, hex('#a8843a'));
        g.text('10', 58, 121, hex('#6a4a1a'));
        // the pencil, a fallen log across the foreground
        g.poly([-40, 152, 250, 128, 254, 140, -36, 166], hex('#c8902a'));
        g.poly([-40, 152, 250, 128, 251, 132, -39, 156], hex('#e8b04a'));
        g.poly([-36, 162, 252, 136, 254, 140, -36, 166], hex('#8a5a1a'));
        g.poly([250, 128, 254, 140, 280, 132], hex('#d8b88a'));
        g.poly([270, 131, 274, 135, 280, 132], hex('#2a2a30'));
        g.text('HB', 150, 139, hex('#3a2410'));

        g.shadow(BOX.x1 - 10, 80, 60, 50, 0.35);
        vignette(g, 0.55, 150, 90, 220, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const tap = f.rare === 3 && ev < 10 && ev > 2 && ev < 4 ? Math.sin((ev - 2) * 20) * (4 - ev) : 0;
        const shake = f.reduced ? 0 : Math.round(tap);

        // Desk lamp light from above-left, and the two tiny studio lights.
        for (let y = g.top; y < BOX.floorY; y++) {
          const u = (y - g.top) / (BOX.floorY - g.top);
          g.rectAdd(40 + u * 60, y, 60 + u * 80, 1, lampC, 0.03 * u);
        }
        for (const lx of [110, 214]) {
          g.glow(lx, 58, 16, hex('#fff4d8'), 0.35 * (0.6 + 0.4 * awake));
          g.px(lx, 58, hex('#ffffff'));
        }
        motes(g, t, 96, 50, 130, 54, 14, lampC, 0.25, 7, 0.3);

        // Rare: a giant eye peers over the back of the box.
        if (f.rare === 0 && ev < 10) {
          const k = envelope(ev, 10, 2, 2);
          const ey = BOX.back - 60 + k * 16;
          g.clip(g.left, g.top, g.w, BOX.back - 12 - g.top);
          g.ellipse(170, ey + 20, 44, 26, hex('#8a6a5a'));
          g.ellipse(170, ey + 20, 26, 16, hex('#e8e0d8'));
          g.disc(170 - Math.round(Math.sin(ev) * 4), ey + 20, 10, hex('#3a5a7a'));
          g.disc(170 - Math.round(Math.sin(ev) * 4), ey + 20, 5, ink);
          g.px(166, ey + 16, hex('#ffffff'));
          if (blinking(ev, 3, 2)) g.ellipse(170, ey + 20, 27, 17, hex('#7a5a4a'));
          g.noClip();
        }

        // ── the set ──
        const bob = f.reduced ? 0 : Math.round(f.pulse * awake) + shake;
        const wave = awake > 0.4 ? Math.max(0, Math.sin(t * 3)) * (Math.sin(t * 0.3) > 0 ? 1 : 0) : 0;
        const crumb = f.rare === 2 && ev < 10;
        const look = crumb && ev > 1 && ev < 7 ? 2 : 0;
        presenter(g, t, bob, wave, look);
        if (awake < 0.4) g.text('z', PIM.x + 4, PIM.y - 30, hex('#e8d8b0'));
        // the ladybird puppet (which, in one rare moment, turns out to be real)
        if (f.rare === 1 && ev < 10 && ev > 2) {
          const p = clamp((ev - 2) / 6);
          const lx = BUG.x + p * 120 + Math.sin(ev * 7) * 3;
          const ly = BUG.y - p * 90 + Math.cos(ev * 5) * 3;
          g.vline(BUG.x, BUG.y - 6, BUG.y, hex('#8a6a40'));
          ladybird(g, lx, ly, 1 + Math.sin(ev * 30) * 0.3);
        } else ladybird(g, BUG.x + shake, BUG.y, 0);
        // Rare: a crumb lands like a boulder; she rolls it off-stage.
        if (crumb) {
          const fall = Math.min(BOX.floorY - 6, -20 + ev * ev * 60);
          const cx = ev < 3 ? 170 : 170 + (ev - 3) * 12;
          g.disc(cx, fall, 5, hex('#c8a060'));
          g.disc(cx - 1, fall - 2, 2, hex('#e8c888'));
          g.px(cx + 2, fall + 1, hex('#8a6a3a'));
        }
        // a tap on the box from a giant finger (rare)
        if (f.rare === 3 && ev < 10) {
          const k = envelope(ev, 6, 1.2, 1.2);
          g.ellipse(BOX.x1 + 26, 40 - 40 * (1 - k), 14, 30, hex('#8a6a5a'));
          g.ellipse(BOX.x1 + 22, 60 - 40 * (1 - k), 8, 6, hex('#c8a8a0'));
        }
      },
    };
  },
};

export default def;

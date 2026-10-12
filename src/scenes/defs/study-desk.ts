// Void Beats: a sleepy many-eyed creature studies by a window onto the purple void.

import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, lightCone, smoothstep, stars, steam, TAU } from '../kit/fx';
import { bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { arc, eye, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const WIN = { x: 62, y: 18, w: 104, h: 80 };
const DESK_Y = 124;

const def: SceneDef = {
  id: 'study-desk',
  fps: 20,
  rareEvents: 4,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#1f1226');
    const wall = [hex('#2a1a2b'), hex('#3a2236'), hex('#4b2c40')];
    const voidR = [hex('#160b2a'), hex('#28134a'), hex('#46206b'), hex('#7a3a86')];
    const wood = { d: hex('#3e2219'), m: hex('#5e3424'), l: hex('#8a5234'), h: hex('#b0714a') };
    const frameC = { d: hex('#2c1a1e'), m: hex('#4a2c2c'), l: hex('#6b4038') };
    const peach = accent;
    const peachD = shade(accent, 0.62);
    const peachL = mix(accent, hex('#fff0d8'), 0.45);
    const cream = hex('#f3e4c8');
    const creamD = hex('#c9b296');
    const warm = hex('#ffcf8a');
    const blob = ramp([hex('#24504f'), hex('#3f8a7c'), hex('#6cc7a8'), hex('#a9efcf')], 5);
    const pet = ramp([hex('#3d3552'), hex('#6b6188'), hex('#9b90ba'), hex('#c4bbdc')], 4);
    const planet = ramp([hex('#4a1f3a'), hex('#a4485a'), shade(accent, 1), hex('#ffd2a6')], 5);
    const moon = ramp([hex('#1e2f5a'), hex('#3d6db0'), hex('#8fc4ff')], 3);
    const bookC = [hex('#3fa69a'), hex('#d96f8f'), hex('#d8a43e'), hex('#7f63c8'), hex('#5aa4d8')];
    const leaf = [hex('#24452f'), hex('#3d7a45'), hex('#6db35a')];
    const bulbs = [hex('#ffcf6b'), hex('#ff8fb1'), hex('#8fe3ff'), hex('#b8ff8f'), peachL];

    // String-light bulb positions (along a sagging wire), computed once.
    const lights: { x: number; y: number; c: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const x = -40 + i * 11;
      const seg = ((x + 400) % 88) / 88;
      lights.push({ x, y: 4 + Math.sin(seg * Math.PI) * 7, c: bulbs[i % bulbs.length]! });
    }

    return {
      background(g) {
        // Wall with a faint diamond pattern.
        g.vgrad(wall, g.top, DESK_Y);
        for (let y = g.top - (g.top % 8) - 8; y < DESK_Y; y += 8)
          for (let x = g.left - (g.left % 8) - 8; x < g.right; x += 8) {
            const ox = (y / 8) % 2 === 0 ? 0 : 4;
            g.pxA(x + ox, y, wall[2]!, 0.55);
          }
        // Wainscot strip just above the desk.
        g.rect(g.left, DESK_Y - 6, g.w, 6, shade(wall[0]!, 0.85));

        // Window: void, a far galaxy, baked faint stars.
        const { x, y, w, h } = WIN;
        g.gradRect(x, y, w, h, voidR);
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) {
            const dx = (xx - (x + 70)) / 26;
            const dy = (yy - (y + 26)) / 9;
            const d = dx * dx + dy * dy;
            if (d < 1) {
              const sw = Math.sin(Math.atan2(dy, dx) * 2 + Math.sqrt(d) * 9);
              if ((1 - d) * (0.4 + 0.4 * sw) > bayer(xx, yy) + 0.15) g.pxA(xx, yy, hex('#b06aa8'), 0.35 * (1 - d));
            }
          }
        g.glow(x + 70, y + 26, 6, hex('#ffd2f0'), 0.25);
        g.clip(x, y, w, h);
        stars(g, 0, x, y, x + w, y + h, 0.5, hex('#c8b8ff'), 3, 0);
        g.noClip();

        // Frame, mullions, sill.
        frameRect(g, x - 4, y - 4, w + 8, h + 8, frameC.d);
        g.rect(x - 3, y - 3, w + 6, 3, frameC.m);
        g.rect(x - 3, y + h, w + 6, 3, frameC.m);
        g.rect(x - 3, y, 3, h, frameC.m);
        g.rect(x + w, y, 3, h, frameC.m);
        g.rect(x + w / 2 - 1, y, 2, h, frameC.m);
        g.rect(x, y + h / 2 - 1, w, 2, frameC.m);
        g.rect(x - 3, y - 3, w + 6, 1, frameC.l);
        g.rect(x - 8, y + h + 3, w + 16, 4, wood.l);
        g.rect(x - 8, y + h + 3, w + 16, 1, wood.h);
        g.rect(x - 8, y + h + 7, w + 16, 1, wood.d);
        // Little cactus on the sill.
        g.rect(x + 6, y + h - 3, 6, 6, hex('#b0583c'));
        g.rect(x + 6, y + h - 3, 6, 1, hex('#d07a52'));
        g.rect(x + 8, y + h - 12, 3, 9, leaf[1]!);
        g.rect(x + 8, y + h - 12, 1, 9, leaf[2]!);
        g.rect(x + 11, y + h - 9, 2, 2, leaf[1]!);
        g.rect(x + 12, y + h - 11, 1, 3, leaf[1]!);
        g.px(x + 9, y + h - 13, hex('#ff8fb1'));

        // Curtains (gathered, with folds) and rod.
        const curtain = (cx: number, dir: 1 | -1) => {
          for (let yy = y - 8; yy < y + h + 10; yy++) {
            const tie = yy > y + 44 && yy < y + 50;
            const wdt = tie ? 7 : 12 + Math.max(0, (yy - (y + 50)) * 0.12) + Math.max(0, (y + 40 - yy) * 0.05);
            for (let i = 0; i < wdt; i++) {
              const xx = Math.round(cx + dir * i);
              const fold = Math.sin(i * 1.3 + (yy - y) * 0.02);
              g.px(xx, yy, fold > 0.45 ? peachL : fold > -0.3 ? peach : peachD);
            }
            if (tie) g.px(Math.round(cx + dir * 3), yy, hex('#f6d36b'));
          }
        };
        curtain(x - 6, -1);
        curtain(x + w + 5, 1);
        g.rect(x - 22, y - 9, w + 44, 2, frameC.d);
        g.disc(x - 23, y - 8, 2, frameC.l);
        g.disc(x + w + 22, y - 8, 2, frameC.l);

        // Shelf on the right wall: plant, jar of stars, a clock that is mostly an eye.
        const sx = 216;
        const sy = 46;
        g.rect(sx, sy, 70, 3, wood.l);
        g.rect(sx, sy, 70, 1, wood.h);
        g.rect(sx + 6, sy + 3, 2, 5, wood.d);
        g.rect(sx + 60, sy + 3, 2, 5, wood.d);
        // plant pot + trailing leaves
        g.rect(sx + 4, sy - 7, 9, 7, hex('#c46a4a'));
        g.rect(sx + 4, sy - 7, 9, 1, hex('#e08a62'));
        for (let i = 0; i < 26; i++) {
          const lx = sx + 4 + Math.round(Math.sin(i * 0.5) * 2) - (i > 12 ? 1 : 0);
          g.px(lx, sy + 1 + i, leaf[1]!);
          if (i % 3 === 0) g.rect(lx - 2, sy + 1 + i, 2, 2, leaf[i % 2 ? 2 : 1]!);
        }
        g.ellipse(sx + 8, sy - 9, 5, 3, leaf[1]!);
        g.ellipse(sx + 7, sy - 10, 3, 2, leaf[2]!);
        // jar (glow added per frame)
        roundRect(g, sx + 22, sy - 12, 11, 12, 2, hex('#2d3f5a'));
        g.rect(sx + 23, sy - 14, 9, 2, hex('#8a6a4a'));
        g.rect(sx + 23, sy - 10, 1, 8, hex('#6d8fb0'));
        // eye clock
        g.disc(sx + 46, sy - 7, 6, frameC.d);
        g.disc(sx + 46, sy - 7, 5, cream);
        // books lying flat
        g.rect(sx + 55, sy - 4, 13, 4, bookC[3]!);
        g.rect(sx + 56, sy - 7, 11, 3, bookC[0]!);

        // Desk.
        g.rect(g.left, DESK_Y, g.w, 6, wood.l);
        g.rect(g.left, DESK_Y, g.w, 1, wood.h);
        g.rect(g.left, DESK_Y + 6, g.w, 1, wood.d);
        g.vgrad([wood.m, shade(wood.m, 0.8), wood.d], DESK_Y + 7, 178, DESK_Y + 7, 178);
        for (const dx of [40, 140, 240]) {
          frameRect(g, dx, DESK_Y + 14, 80, 20, wood.d);
          g.rect(dx + 1, DESK_Y + 15, 78, 1, shade(wood.l, 0.85));
          g.rect(dx + 36, DESK_Y + 22, 8, 3, wood.h);
          g.rect(dx + 36, DESK_Y + 25, 8, 1, wood.d);
          frameRect(g, dx, DESK_Y + 38, 80, 14, wood.d);
          g.rect(dx + 36, DESK_Y + 43, 8, 2, wood.h);
        }
        // Drawer label and stickers.
        g.rect(173, DESK_Y + 27, 34, 9, cream);
        frameRect(g, 173, DESK_Y + 27, 34, 9, creamD);
        g.text('VOID', 177, DESK_Y + 29, hex('#5a3a4a'));
        g.disc(66, DESK_Y + 30, 4, hex('#5aa4d8'));
        g.disc(66, DESK_Y + 30, 2, hex('#a9efcf'));
        g.px(64, DESK_Y + 28, hex('#ffffff'));
        g.rect(258, DESK_Y + 16, 9, 7, hex('#f6d36b'));
        g.text(':)', 259, DESK_Y + 17, hex('#7a4a2a'));
        // Upper wall (tall views): a framed picture of a planet and a round clock.
        frameRect(g, 92, -62, 44, 34, frameC.l);
        g.rect(93, -61, 42, 32, frameC.d);
        g.gradRect(95, -59, 38, 28, [hex('#28134a'), hex('#7a3a86')]);
        g.ball(114, -45, 7, 7, ramp([hex('#4a1f3a'), shade(accent, 1), hex('#ffd2a6')], 4), -0.6, -0.5);
        g.ring(114, -45, 12, 3, hex('#ffd9b0'));
        g.disc(200, -40, 11, frameC.d);
        g.disc(200, -40, 9, cream);
        g.line(200, -40, 200, -47, ink);
        g.line(200, -40, 204, -38, ink);
        g.text('?', 198, -34, creamD);

        // Floor and rug (seen in tall views).
        g.vgrad([hex('#2a1814'), hex('#1c100e')], 178, g.bottom, 178);
        for (let yy = 182; yy < g.bottom; yy += 7) g.rect(g.left, yy, g.w, 1, hex('#160b0a'));
        g.ellipse(170, 214, 92, 22, hex('#4a2a4a'));
        g.ellipse(170, 214, 86, 19, hex('#6a3a5c'));
        g.ellipse(170, 214, 70, 14, peachD);
        g.ellipse(170, 214, 60, 11, hex('#6a3a5c'));
        // Slippers.
        g.ellipse(112, 236, 8, 4, peach);
        g.ellipse(126, 239, 8, 4, peach);
        g.ellipse(112, 235, 5, 2, peachL);
        g.ellipse(126, 238, 5, 2, peachL);

        // Lamp: base, jointed arm, dome shade tipped toward the desk.
        g.ellipse(82, DESK_Y - 1, 10, 3, ink);
        g.ellipse(82, DESK_Y - 2, 9, 2, peachD);
        g.rect(80, DESK_Y - 3, 4, 1, peach);
        g.line(82, DESK_Y - 3, 78, 100, ink);
        g.line(83, DESK_Y - 3, 79, 100, ink);
        g.line(78, 100, 94, 82, ink);
        g.line(79, 100, 95, 82, ink);
        g.disc(78, 100, 2, peachD);
        g.disc(95, 82, 2, peachD);
        g.poly([90, 84, 99, 78, 110, 92, 104, 97], ink);
        g.poly([92, 84, 99, 80, 108, 91, 104, 95], peach);
        g.line(93, 84, 99, 81, peachL);
        g.line(99, 81, 104, 87, peachL);
        g.line(104, 96, 109, 92, hex('#fff2c8'));
        g.line(103, 95, 108, 91, warm);

        // Book stack (one book hovers; drawn per frame).
        const book = (bx: number, by: number, bw: number, bh: number, c: number) => {
          g.rect(bx, by, bw, bh, c);
          g.rect(bx, by, bw, 1, mix(c, cream, 0.35));
          g.rect(bx + 1, by + bh - 1, bw - 2, 1, shade(c, 0.6));
          g.rect(bx + bw - 3, by + 1, 1, bh - 2, cream);
        };
        book(106, DESK_Y - 6, 26, 6, bookC[0]!);
        book(108, DESK_Y - 11, 22, 5, bookC[1]!);
        book(105, DESK_Y - 20, 25, 9, bookC[2]!);
        g.text('?', 113, DESK_Y - 18, shade(bookC[2]!, 0.55));
        book(110, DESK_Y - 24, 14, 4, bookC[4]!);

        // Mug.
        roundRect(g, 138, DESK_Y - 13, 11, 13, 2, cream);
        g.rect(138, DESK_Y - 8, 11, 3, peach);
        g.rect(147, DESK_Y - 13, 2, 12, creamD);
        arc(g, 150, DESK_Y - 7, 3, 3, -Math.PI / 2, Math.PI / 2, creamD, 2);
        g.rect(139, DESK_Y - 13, 9, 1, hex('#3a2016'));

        // Papers under the pet, notebook in front of the creature.
        g.poly([226, DESK_Y + 1, 268, DESK_Y + 1, 264, DESK_Y - 3, 230, DESK_Y - 3], cream);
        g.poly([228, DESK_Y, 266, DESK_Y, 263, DESK_Y - 2, 231, DESK_Y - 2], creamD);
        g.poly([166, DESK_Y + 2, 204, DESK_Y + 2, 200, DESK_Y - 4, 170, DESK_Y - 4], cream);
        g.rect(184, DESK_Y - 4, 1, 6, creamD);

        // Warm lamp light baked onto everything.
        lightCone(g, 108, 95, 8, 80, 30, warm, 0.2);
        g.glow(106, 98, 60, warm, 0.22);
        // Cool void light spilling from the window.
        g.glow(WIN.x + WIN.w / 2, WIN.y + WIN.h + 18, 70, hex('#5b2a8a'), 0.18);
      },

      frame(g, f) {
        const { t } = f;
        const awake = f.awake;
        const ev = f.rareT;

        // Window: drifting planets, twinkles, the occasional comet.
        g.clip(WIN.x, WIN.y, WIN.w, WIN.h);
        stars(g, t, WIN.x, WIN.y, WIN.x + WIN.w, WIN.y + WIN.h, 0.12, hex('#ffffff'), 9, 1);
        const px = WIN.x - 24 + ((t * 0.55 + 70) % (WIN.w + 50));
        const py = WIN.y + 46 + Math.sin(t * 0.05) * 3;
        arc(g, px, py, 17, 4, Math.PI, TAU, hex('#e8b07a'), 1);
        g.ball(px, py, 9, 9, planet, -0.6, -0.5);
        arc(g, px, py, 17, 4, 0, Math.PI, hex('#ffd9b0'), 1);
        arc(g, px, py + 1, 16, 4, 0.3, Math.PI - 0.3, hex('#b0705a'), 1);
        const mx = WIN.x + WIN.w + 10 - ((t * 1.1) % (WIN.w + 30));
        g.ball(mx, WIN.y + 16, 3, 3, moon, -0.6, -0.4);
        if (f.rare === 1 && ev < 3 && !f.reduced) {
          const p = ev / 2.2;
          const cx = WIN.x + WIN.w - p * (WIN.w + 30);
          const cy = WIN.y + 8 + p * 30;
          for (let i = 0; i < 18; i++) g.pxAdd(cx + i * 1.6, cy - i * 0.5, hex('#ffe9c4'), 1 - i / 18);
          g.glow(cx, cy, 4, hex('#ffffff'), 0.8);
        }
        if (f.rare === 2 && ev < 7) {
          // a small planet peeks in and waves
          const k = envelope(ev, 7, 1.5, 1.5);
          const bx = WIN.x + 30;
          const by = WIN.y + WIN.h + 8 - k * 26;
          g.ball(bx, by, 9, 9, ramp([hex('#2d4a2a'), hex('#5fa04e'), hex('#b8ef8f')], 4), -0.5, -0.5);
          g.px(bx - 3, by - 2, ink);
          g.px(bx + 2, by - 2, ink);
          g.hline(bx - 2, bx + 1, by + 2, ink);
          const wave = Math.sin(ev * 9) * 2;
          g.line(bx + 8, by - 2, bx + 12, by - 7 + wave, hex('#5fa04e'));
          g.px(bx + 12, by - 8 + wave, hex('#b8ef8f'));
        }
        g.noClip();

        // String lights across the top of the wall.
        for (let i = 0; i < lights.length; i++) {
          const L = lights[i]!;
          if (L.x < g.left - 2 || L.x > g.right + 2) continue;
          g.px(L.x, L.y - 1, ink);
          const tw = f.reduced ? 0.8 : 0.65 + 0.35 * Math.sin(t * 0.8 + i * 1.9);
          g.rect(L.x - 1, L.y, 2, 2, L.c);
          g.glow(L.x, L.y + 1, 5, L.c, 0.22 * tw, 3);
        }
        for (let x = g.left; x < g.right; x++) {
          const seg = ((x + 400) % 88) / 88;
          g.px(x, Math.round(3 + Math.sin(seg * Math.PI) * 7), ink);
        }

        // Jar of stars + the eye clock looking around.
        const jarGlow = 0.35 + 0.25 * Math.sin(t * 1.3) + f.energy * 0.3;
        for (let i = 0; i < 5; i++) {
          const sx = 239 + ((hash3(i, 1) * 8) | 0);
          const sy = 36 + ((hash3(i, 2) * 8 + Math.sin(t * 0.7 + i) * 1.5) | 0);
          g.px(sx, sy, hex('#fff2a8'));
        }
        g.glow(243, 40, 10, hex('#ffe08a'), jarGlow, 3);
        const look = Math.sin(t * 0.3) * 0.8;
        eye(g, 262, 39, 3, hex('#f3e4c8'), ink, hex('#c9b296'), look, 0.2, blinking(t, 77) ? 1 : 0);

        // Lamp bulb: a soft warm flicker that leans into the music.
        g.glow(107, 95, 12, warm, 0.45 + f.energy * 0.25 + Math.sin(t * 13) * 0.02);

        // Hovering impossible book.
        const hb = Math.sin(t * 1.4) * 1.5;
        g.rect(108, DESK_Y - 33 + hb, 18, 4, bookC[3]!);
        g.rect(108, DESK_Y - 33 + hb, 18, 1, mix(bookC[3]!, cream, 0.4));
        g.rect(123, DESK_Y - 32 + hb, 1, 2, cream);
        g.ellipseA(117, DESK_Y - 25, 7 - hb, 1, ink, 0.25);

        // Steam from the mug.
        steam(g, t, 143, DESK_Y - 15, cream, { n: 7, height: 22, spread: 4, alpha: 0.6 });

        // Notebook scribbles accumulate, then the page turns.
        const page = t % 48;
        const lines = Math.floor(page / 5);
        for (let i = 0; i < Math.min(lines, 4); i++) {
          const ly = DESK_Y - 3 + i * 1.4;
          const lw = 8 + ((hash3(i, Math.floor(t / 48)) * 6) | 0);
          g.hline(186, 186 + Math.min(lw, 13), Math.round(ly), hex('#7a6a8a'));
        }

        // ── the creature ──
        const sleep = 1 - awake;
        const bob = f.reduced ? 0 : Math.round(f.pulse * 1.5 * awake + Math.sin(t * 2.1) * 0.6 * awake);
        const cx = 202 - sleep * 3;
        const cy = 102 + bob + sleep * 8;
        const looking = f.rare === 0 && ev < 7 ? envelope(ev, 7, 0.6, 0.8) : 0;
        g.clip(g.left, g.top, g.w, DESK_Y - g.top);
        // chair back
        roundRect(g, cx - 20, cy - 8 - sleep * 6, 40, 40, 6, shade(peachD, 0.7));
        g.rect(cx - 18, cy - 6 - sleep * 6, 36, 1, peachD);
        // body
        g.ellipse(cx, cy, 25, 23, ink);
        g.ball(cx, cy, 24, 22, blob, -0.75, -0.45, 0.2);
        g.noClip();

        // headphones
        arc(g, cx, cy - 1, 27, 26, Math.PI + 0.15, TAU - 0.15, ink, 4);
        arc(g, cx, cy - 1, 27, 26, Math.PI + 0.3, TAU - 0.3, hex('#5a4a6a'), 2);
        for (const s of [-1, 1]) {
          const hx = cx + s * 25 - 4;
          roundRect(g, hx, cy - 8, 9, 15, 3, ink);
          roundRect(g, hx + 1, cy - 7, 7, 13, 3, peach);
          g.rect(hx + 2, cy - 6, 2, 9, peachL);
        }
        if (awake > 0.5) g.px(cx + 25, cy + 4, (Math.floor(t * 2) % 2 ? hex('#7dff9a') : hex('#2f6b3a')));

        // eyes: four of them, sleepy, each blinking on its own schedule
        const eyes = [
          [-9, -3, 4],
          [8, -4, 4],
          [-1, -13, 3],
          [16, 5, 2],
        ] as const;
        for (let i = 0; i < eyes.length; i++) {
          const [ex, ey, er] = eyes[i]!;
          let lid = 0.5 + 0.1 * Math.sin(t * 0.3 + i);
          if (blinking(t + i * 0.9, i + 3, 5)) lid = 1;
          lid = lid * (1 - looking * 0.7) + sleep * 1;
          if (looking > 0.5 && ev > 3 + i * 0.35 && ev < 3.25 + i * 0.35) lid = 1; // blink in sequence
          const lx = looking > 0 ? 0 : -0.7;
          const ly = looking > 0 ? 0 : 0.6;
          eye(g, cx + ex, cy + ey, er, hex('#fdf6e6'), ink, blob[1]!, lx, ly, clamp(lid, 0, 1));
        }
        // blush + mouth
        g.pxA(cx - 15, cy + 4, hex('#ff8fa0'), 0.6);
        g.pxA(cx - 14, cy + 4, hex('#ff8fa0'), 0.6);
        g.pxA(cx + 13, cy + 3, hex('#ff8fa0'), 0.6);
        if (sleep > 0.6) g.disc(cx, cy + 8, 1, ink);
        else g.hline(cx - 2, cx + 1, cy + 7, ink);

        // arm + pencil writing (pauses to think now and then)
        const thinking = Math.sin(t * 0.21) > 0.75;
        const writing = awake > 0.5 && !thinking;
        const hx = writing ? 188 + Math.sin(t * 7) * 2 + ((t * 1.3) % 6) : thinking ? 192 : 190;
        const hy = writing ? DESK_Y - 3 + Math.cos(t * 11) * 0.8 : thinking ? cy + 8 + Math.sin(t * 6) : DESK_Y - 2;
        g.line(cx - 16, cy + 12, hx + 3, hy, blob[1]!);
        g.line(cx - 16, cy + 13, hx + 3, hy + 1, blob[1]!);
        g.disc(hx + 2, hy, 2, blob[2]!);
        g.line(hx, hy - 1, hx - 4, hy - 7, hex('#f6d36b'));
        g.px(hx - 5, hy - 8, hex('#ff8fb1'));
        // other arm resting on the desk
        g.ellipse(cx + 14, DESK_Y - 1, 4, 2, blob[2]!);

        // Zzz while dozing.
        if (sleep > 0.4) {
          for (let i = 0; i < 3; i++) {
            const p = (t * 0.25 + i / 3) % 1;
            g.text('z', cx + 18 + p * 10 + Math.sin(p * 6) * 2, cy - 22 - p * 20, mix(cream, wall[1]!, p));
          }
        }

        // ── the pet asleep on the notes ──
        const breathe = Math.sin(t * 1.2) > 0.2 ? 1 : 0;
        const stretch = f.rare === 3 && ev < 6 ? envelope(ev, 6, 1.2, 1.5) : 0;
        const prx = 11 + stretch * 7;
        const pcx = 246 + stretch * 3;
        const pcy = DESK_Y - 7 + stretch * 2;
        // tail hanging off the desk with a twitchy tip
        const tw = Math.sin(t * 2.3) * (Math.sin(t * 0.37) > 0.3 ? 2 : 0.4);
        for (let i = 0; i < 16; i++) {
          const curl = i > 10 ? (i - 10) * (1.2 + tw * 0.3) : 0;
          const tx = pcx + prx - 3 + Math.sin(i * 0.22) * 3 + curl;
          const ty = pcy + 3 + i - (i > 10 ? (i - 10) * 0.6 : 0);
          g.rect(tx - 1, ty, 4, 1, ink);
          g.rect(tx, ty, 2, 1, i > 12 ? pet[3]! : pet[2]!);
        }
        g.ellipse(pcx, pcy, prx + 1, 6 + breathe, ink);
        g.ball(pcx, pcy, prx, 5 + breathe, pet, -0.6, -0.6, 0.25);
        // three ears
        const ex0 = pcx - prx + 2;
        for (let i = 0; i < 3; i++) {
          const ex = ex0 + i * 4;
          g.tri(ex - 2, pcy - 3 - breathe, ex + 2, pcy - 3 - breathe, ex, pcy - 8 - breathe - (i === 1 ? 1 : 0), pet[2]!);
          g.px(ex, pcy - 5 - breathe, hex('#ffb3c8'));
        }
        const pupil = stretch > 0.4;
        g.hline(ex0 - 1, ex0 + 1, pcy, ink);
        g.hline(ex0 + 4, ex0 + 6, pcy, ink);
        if (pupil) {
          g.px(ex0, pcy - 1, ink);
          g.px(ex0 + 5, pcy - 1, ink);
          g.disc(ex0 + 2, pcy + 3, 1, hex('#ff8fa0'));
        }
        if (stretch > 0) {
          g.rect(pcx - prx - 4 * stretch, pcy + 3, 5, 2, pet[2]!);
        }

        // Ambient void glow on the creature's back reacts gently to the music.
        g.glow(cx + 22, cy - 6, 18, hex('#7a3a9a'), 0.12 + f.energy * 0.15);
        void smoothstep;
      },
    };
  },
};

export default def;

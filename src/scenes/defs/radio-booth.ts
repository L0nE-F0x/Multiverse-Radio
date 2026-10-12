// Ask Grenda: a cozy late-night radio booth. A big vintage microphone, a lava lamp with
// something alive inside, a switchboard of blinking caller lights, rain on the window.

import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3, noise1 } from '../kit/rng';
import { arc, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const DESK_Y = 128;
const WIN = { x: 196, y: 24, w: 72, h: 62 };
const LAVA = { x: 252, y: 96 };
const SWITCH = { x: 34, y: 40 };

const def: SceneDef = {
  id: 'radio-booth',
  fps: 18,
  rareEvents: 3,
  rareDuration: 7,
  create({ accent }) {
    const ink = hex('#120a08');
    const wood = [hex('#2a140c'), hex('#3a1e12'), hex('#4a2818'), hex('#5a3420')];
    const chrome = ramp([hex('#2a2a34'), hex('#6a6a7a'), hex('#b8b8c8'), hex('#f0f0ff')], 4);
    const warm = hex('#ffb070');
    const onAir = hex('#ff3a3a');
    const lavaC = accent;
    const lavaGlow = mix(accent, hex('#ffd06a'), 0.4);

    const lava = (g: Gfx, t: number, wave: number) => {
      const { x, y } = LAVA;
      // base + cap
      g.poly([x - 8, y + 32, x + 8, y + 32, x + 6, y + 22, x - 6, y + 22], hex('#5a5a6a'));
      g.poly([x - 4, y - 6, x + 4, y - 6, x + 3, y - 12, x - 3, y - 12], hex('#5a5a6a'));
      // glass: tapered
      for (let yy = y - 6; yy < y + 22; yy++) {
        const u = (yy - (y - 6)) / 28;
        const hw = Math.round(3 + u * 4);
        g.rect(x - hw - 1, yy, hw * 2 + 3, 1, ink);
        g.rect(x - hw, yy, hw * 2 + 1, 1, mix(hex('#4a1a2a'), lavaC, 0.35));
      }
      // blobs
      for (let i = 0; i < 3; i++) {
        const p = (noise1(t * 0.08 + i * 3.1, i) * 1.4 + t * 0.02 * (i + 1)) % 1;
        const by = y + 18 - Math.abs(Math.sin(p * Math.PI)) * 22;
        const bx = x + Math.sin(t * 0.3 + i) * 1.5;
        const r = 2 + (i % 2);
        g.ellipse(bx, by, r, r + 1, lavaC);
        g.px(bx - 1, by - 1, mix(lavaC, hex('#ffffff'), 0.5));
      }
      // the one who lives in there
      const cy = y + 6 + Math.sin(t * 0.5) * 5;
      const cx = x + Math.sin(t * 0.37) * 1.5 + wave * 2;
      const r = 3 + wave;
      g.ellipse(cx, cy, r, r + 1, mix(lavaC, hex('#ffd06a'), 0.5));
      if (!blinking(t, 21)) {
        g.px(cx - 1, cy - 1, ink);
        g.px(cx + 1, cy - 1, ink);
      } else g.hline(cx - 1, cx + 1, cy - 1, ink);
      if (wave > 0.5) {
        g.px(cx, cy + 1, ink);
        const wv = Math.sin(t * 12) > 0 ? -1 : 0;
        g.px(cx + r + 1, cy - 2 + wv, mix(lavaC, hex('#ffd06a'), 0.5));
      }
      // glass highlight
      g.vline(x - 4, y - 3, y + 16, hex('#ffd8c8'));
    };

    return {
      background(g) {
        // Wood-panelled walls.
        for (let y = g.top; y < DESK_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const plank = Math.floor((x + 400) / 12);
            const grain = Math.sin(y * 0.3 + plank * 7 + Math.sin(y * 0.05 + plank) * 3);
            const edge = (x + 400) % 12 === 0;
            g.px(x, y, edge ? wood[0]! : grain > 0.6 ? wood[3]! : grain > -0.2 ? wood[2]! : wood[1]!);
          }
        // Acoustic foam strip.
        for (let x = g.left; x < g.right; x++)
          for (let y = 0; y < 8; y++) g.px(x, y, (Math.floor((x + 400) / 4) + y) % 2 ? hex('#3a2a2a') : hex('#2a1e1e'));

        // Window with a rainy city beyond.
        g.gradRect(WIN.x, WIN.y, WIN.w, WIN.h, [hex('#0a1028'), hex('#1a2448'), hex('#2a2a4a')]);
        for (let i = 0; i < 26; i++) {
          const bx = WIN.x + 4 + hash3(i, 1) * (WIN.w - 8);
          const by = WIN.y + 30 + hash3(i, 2) * (WIN.h - 34);
          const c = [hex('#ffd08a'), hex('#ff8ab0'), hex('#8ad0ff')][i % 3]!;
          g.glow(bx, by, 3 + hash3(i, 3) * 3, c, 0.35, 3);
        }
        frameRect(g, WIN.x - 3, WIN.y - 3, WIN.w + 6, WIN.h + 6, ink);
        g.rect(WIN.x - 2, WIN.y - 2, WIN.w + 4, 2, wood[3]!);
        g.rect(WIN.x - 2, WIN.y + WIN.h, WIN.w + 4, 3, wood[3]!);
        g.rect(WIN.x - 2, WIN.y, 2, WIN.h, wood[3]!);
        g.rect(WIN.x + WIN.w, WIN.y, 2, WIN.h, wood[3]!);
        g.rect(WIN.x + WIN.w / 2 - 1, WIN.y, 2, WIN.h, wood[3]!);

        // Switchboard on the wall.
        const { x: sx, y: sy } = SWITCH;
        roundRect(g, sx - 2, sy - 2, 64, 62, 3, ink);
        roundRect(g, sx, sy, 60, 58, 3, hex('#2a2420'));
        g.rect(sx + 3, sy + 3, 54, 7, hex('#14100e'));
        g.text('CALLERS', sx + 5, sy + 4, warm);
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 4; c++) {
            g.disc(sx + 9 + c * 14, sy + 18 + r * 12, 3, ink);
            g.disc(sx + 9 + c * 14, sy + 24 + r * 12, 1, chrome[1]!);
          }
        // patch cords dangling
        for (let k = 0; k < 4; k++) {
          const x0 = sx + 9 + k * 14;
          for (let i = 0; i < 18; i++) g.px(x0 + Math.sin(i * 0.4 + k) * 3, sy + 52 + i, [hex('#c83a3a'), hex('#e8b84a'), hex('#3a8ac8'), hex('#3ac86a')][k]!);
        }

        // Desk with a mixing console.
        g.rect(g.left, DESK_Y, g.w, 5, wood[3]!);
        g.rect(g.left, DESK_Y, g.w, 1, hex('#8a5a3a'));
        g.gradRect(g.left, DESK_Y + 5, g.w, g.bottom - DESK_Y - 5, [wood[2]!, wood[0]!]);
        for (let x = -40; x < 360; x += 70) {
          frameRect(g, x, DESK_Y + 12, 62, 22, wood[0]!);
          g.rect(x + 27, DESK_Y + 21, 8, 2, hex('#c8a060'));
        }
        g.poly([150, DESK_Y + 2, 236, DESK_Y + 2, 230, DESK_Y - 12, 156, DESK_Y - 12], ink);
        g.poly([152, DESK_Y + 1, 234, DESK_Y + 1, 229, DESK_Y - 11, 157, DESK_Y - 11], hex('#2a2a32'));
        for (let k = 0; k < 8; k++) {
          g.vline(162 + k * 8, DESK_Y - 8, DESK_Y - 2, hex('#14141a'));
          g.disc(162 + k * 8, DESK_Y - 10, 1, [hex('#e04a4a'), hex('#e8b84a'), hex('#4ac0e8')][k % 3]!);
        }
        // VU meters
        for (const vx of [100, 124]) {
          g.rect(vx - 10, DESK_Y - 16, 20, 14, ink);
          g.rect(vx - 9, DESK_Y - 15, 18, 12, hex('#f0e0b0'));
          arc(g, vx, DESK_Y - 4, 7, 7, Math.PI * 1.15, Math.PI * 1.85, hex('#8a6a4a'));
          g.px(vx + 6, DESK_Y - 11, hex('#e04a4a'));
        }
        // Mug, notebook, a box of tissues for the hard calls.
        g.rect(64, DESK_Y - 9, 8, 9, hex('#f4ece0'));
        g.rect(72, DESK_Y - 7, 2, 4, hex('#f4ece0'));
        g.text('#1', 65, DESK_Y - 7, accent);
        g.poly([24, DESK_Y + 1, 52, DESK_Y + 1, 50, DESK_Y - 2, 26, DESK_Y - 2], hex('#e8e0c8'));
        g.rect(270, DESK_Y - 8, 18, 8, hex('#8ac8e8'));
        g.ellipse(279, DESK_Y - 9, 4, 2, hex('#ffffff'));
        // Warm desk lamp light.
        g.glow(120, DESK_Y - 30, 110, warm, 0.14, 6);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const live = f.awake;

        // Rain on the window.
        g.clip(WIN.x, WIN.y, WIN.w, WIN.h);
        for (let i = 0; i < 40; i++) {
          const sp = 60 + hash3(i, 1) * 50;
          const y = WIN.y + ((t * sp + hash3(i, 2) * 300) % (WIN.h + 6)) - 3;
          const x = WIN.x + hash3(i, 3) * WIN.w;
          g.pxA(x, y, hex('#a8c8f0'), 0.4);
          g.pxA(x, y - 1, hex('#a8c8f0'), 0.25);
        }
        for (let i = 0; i < 10; i++) {
          const y = WIN.y + ((t * (3 + hash3(i, 5) * 4) + hash3(i, 6) * 90) % (WIN.h + 8)) - 4;
          const x = WIN.x + hash3(i, 7) * WIN.w;
          g.pxA(x, y, hex('#e0f0ff'), 0.7);
          g.pxA(x, y - 2, hex('#a8c8f0'), 0.3);
        }
        g.noClip();

        // ON AIR sign.
        const sx = 128;
        const sy = 12;
        const lit = f.playing ? 1 : 0.15;
        const buzz = !f.reduced && f.rare === 2 && ev < 7 ? 1 : 0;
        roundRect(g, sx - 2, sy - 2, 64, 18, 3, ink);
        roundRect(g, sx, sy, 60, 14, 3, mix(hex('#3a0a0a'), onAir, 0.25 + lit * 0.75));
        g.textCenter('ON AIR', sx + 30, sy + 3, mix(hex('#5a2020'), hex('#ffe8e0'), lit), 1);
        if (lit > 0.5) g.glow(sx + 30, sy + 7, 40, onAir, 0.2 + f.energy * 0.25, 4);
        if (buzz) {
          // a moth, enchanted by the sign
          const a = ev * 5;
          const mx = sx + 30 + Math.cos(a) * 36;
          const my = sy + 7 + Math.sin(a * 1.3) * 12;
          g.px(mx, my, hex('#d8c8a8'));
          g.px(mx + (Math.floor(ev * 20) % 2 ? 1 : -1), my - 1, hex('#f0e8d0'));
        }

        // Caller lights: some waiting, one ringing, now and then all at once.
        const allBlink = f.rare === 1 && ev < 7;
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 4; c++) {
            const i = r * 4 + c;
            const lx = SWITCH.x + 9 + c * 14;
            const ly = SWITCH.y + 18 + r * 12;
            const waiting = hash3(i, Math.floor(t / 20)) < 0.45;
            const ringing = i === Math.floor(hash3(Math.floor(t / 8), 9) * 12);
            let on = waiting || (ringing && Math.floor(t * 3) % 2 === 0);
            let c2 = hex('#ffb04a');
            if (allBlink) {
              on = ev < 4 ? Math.floor(ev * 4) % 2 === 0 || f.reduced : i === 6;
              if (ev >= 4 && i === 6) c2 = hex('#5aff8a');
            }
            if (live < 0.3 && !allBlink) on = waiting;
            g.disc(lx, ly, 2, on ? c2 : hex('#4a3020'));
            if (on) g.glow(lx, ly, 5, c2, 0.35, 3);
          }

        // VU needles.
        for (let k = 0; k < 2; k++) {
          const vx = 100 + k * 24;
          const lvl = clamp(f.energy * 1.2 + (k ? 0.05 : 0) * Math.sin(t * 9));
          const a = Math.PI * (1.2 + lvl * 0.6);
          g.line(vx, DESK_Y - 4, vx + Math.cos(a) * 8, DESK_Y - 4 + Math.sin(a) * 8, ink);
        }

        // The microphone, big and chrome, on its boom.
        const mx = 128;
        const my = 74;
        // ceiling-mounted boom arm
        g.line(104, g.top, 104, 18, chrome[0]!);
        g.line(104, 18, mx - 2, 40, chrome[0]!);
        g.line(105, 18, mx - 1, 40, chrome[1]!);
        g.line(mx - 2, 40, mx, my - 22, chrome[0]!);
        g.disc(104, 18, 2, chrome[1]!);
        g.disc(mx - 2, 40, 2, chrome[1]!);
        roundRect(g, mx - 12, my - 22, 24, 44, 10, ink);
        roundRect(g, mx - 11, my - 21, 22, 42, 9, chrome[1]!);
        for (let y = my - 16; y < my + 16; y += 2) g.hline(mx - 8, mx + 8, y, chrome[0]!);
        g.rect(mx - 11, my - 2, 22, 3, chrome[2]!);
        g.rect(mx - 11, my - 1, 22, 1, chrome[3]!);
        g.vline(mx - 7, my - 18, my + 16, chrome[2]!);
        g.rect(mx - 3, my + 21, 6, 6, chrome[0]!);
        g.glow(mx - 6, my - 10, 8, hex('#ffffff'), 0.12 + f.energy * 0.2);

        // Steam from the mug; headphones hanging off the mic arm, swaying.
        steam(g, t, 68, DESK_Y - 11, hex('#f4ece0'), 5, 14, 2, 0.5);
        arc(g, 88, DESK_Y - 4, 7, 6, Math.PI, Math.PI * 2, hex('#2a2a32'), 2);
        roundRect(g, 79, DESK_Y - 6, 5, 6, 2, accent);
        roundRect(g, 92, DESK_Y - 6, 5, 6, 2, accent);

        // The lava lamp, with its resident.
        const wave = f.rare === 0 && ev < 7 ? envelope(ev, 7, 1, 1) : 0;
        lava(g, t, wave);
        g.glow(LAVA.x, LAVA.y + 8, 22, lavaGlow, 0.25 + f.energy * 0.15, 4);
        void shade;
      },
    };
  },
};

export default def;

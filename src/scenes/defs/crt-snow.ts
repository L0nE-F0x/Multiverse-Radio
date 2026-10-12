// Static Lullabies: a dark bedroom lit by an old TV full of soft snow. A three-eyed cat
// sleeps on top. Now and then the snow arranges itself into a smile, then forgets.

import { gloom, motes } from '../kit/atmos';
import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, envelope, stars } from '../kit/fx';
import { glyph } from '../kit/font';
import { hash3 } from '../kit/rng';
import { arc, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const SCR = { x: 125, y: 67, w: 58, h: 46 };
const TV = { x: 114, y: 56, w: 92, h: 68 };
const FLOOR_Y = 150;

const def: SceneDef = {
  id: 'crt-snow',
  fps: 18,
  focusY: 78,
  rareEvents: 3,
  rareDuration: 7,
  grade: { temperature: -0.25, contrast: 1.12, saturation: 0.8, bloom: 0.75, threshold: 0.62, vignette: 0.36, shadows: '#04050c' },
  create({ accent }) {
    const ink = hex('#07070f');
    const wall = [hex('#080a16'), hex('#0d1024'), hex('#11152e')];
    const floor = [hex('#0d0c18'), hex('#08080f')];
    const plastic = { l: hex('#8c8a86'), m: hex('#64625f'), d: hex('#3d3c3d'), bezel: hex('#18171e') };
    const woodC = { d: hex('#1c1416'), m: hex('#2c1f20'), l: hex('#3e2c2a') };
    const snow = ramp([hex('#141830'), hex('#3a4170'), shade(accent, 0.9), hex('#d6dcff'), hex('#ffffff')], 7);
    const cat = ramp([hex('#2a2840'), hex('#57557c'), hex('#8c8ab2'), hex('#c4c2e2')], 4);
    const glowC = mix(accent, hex('#ffffff'), 0.2);
    const warm = hex('#ffc27a');
    const blanket = [hex('#1c2550'), hex('#2a3670'), hex('#3c4c94')];

    // Screen pixel lists (rebuilt on resize): buffer index, edge falloff, masks.
    let idx = new Int32Array(0);
    let edge = new Float32Array(0);
    let smile = new Uint8Array(0);
    let shh = new Uint8Array(0);
    let seed = 1;

    const shhBits = (u: number, v: number) => {
      // "SHH" at 3x scale, centred.
      const text = 'SHH';
      const scale = 3;
      let width = 0;
      for (const ch of text) width += glyph(ch).w + 1;
      width = (width - 1) * scale;
      const x0 = Math.round((SCR.w - width) / 2);
      const y0 = Math.round((SCR.h - 5 * scale) / 2);
      let cx = x0;
      for (const ch of text) {
        const gl = glyph(ch);
        const gx = Math.floor((u - cx) / scale);
        const gy = Math.floor((v - y0) / scale);
        if (gx >= 0 && gx < gl.w && gy >= 0 && gy < 5 && gl.bits[gy * gl.w + gx]) return 1;
        cx += (gl.w + 1) * scale;
      }
      return 0;
    };

    return {
      background(g) {
        // Wall with faint vertical wallpaper stripes, floor, skirting.
        g.vgrad(wall, g.top, FLOOR_Y);
        for (let x = g.left - (g.left % 10) - 10; x < g.right; x += 10) g.rectD(x, g.top, 1, FLOOR_Y - g.top, wall[2]!, 0.5);
        g.vgrad(floor, FLOOR_Y, g.bottom, FLOOR_Y);
        g.rect(g.left, FLOOR_Y - 3, g.w, 3, hex('#1a1b30'));
        for (let y = FLOOR_Y + 6; y < g.bottom; y += 6) g.rect(g.left, y, g.w, 1, hex('#060610'));
        g.ellipse(160, 168, 100, 12, hex('#151632'));
        g.ellipse(160, 168, 92, 10, hex('#1d1f44'));
        // Things on the floor (tall views): a stack of picture books and a sleepy plush.
        g.rect(196, 182, 22, 5, hex('#3a3c6e'));
        g.rect(198, 178, 18, 4, hex('#5a3c5e'));
        g.rect(197, 174, 20, 4, hex('#2e4a5e'));
        g.ellipse(124, 186, 9, 7, hex('#4a4470'));
        g.ellipse(124, 176, 7, 6, hex('#4a4470'));
        g.disc(119, 171, 2, hex('#4a4470'));
        g.disc(129, 171, 2, hex('#4a4470'));
        g.hline(121, 122, 176, ink);
        g.hline(126, 127, 176, ink);

        // Window with curtains, crescent moon.
        g.gradRect(30, 20, 60, 62, [hex('#0d1838'), hex('#1b2a5a')]);
        g.clip(30, 20, 60, 62);
        stars(g, 0, 30, 20, 90, 82, 0.4, hex('#aab4ff'), 4, 0);
        g.disc(70, 36, 7, hex('#f2ecd0'));
        g.disc(73, 34, 6, hex('#13204a'));
        g.noClip();
        frameRect(g, 28, 18, 64, 66, hex('#2a2a40'));
        g.rect(59, 20, 2, 62, hex('#2a2a40'));
        g.rect(30, 50, 60, 2, hex('#2a2a40'));
        for (let y = 14; y < 92; y++) {
          for (let i = 0; i < 9; i++) {
            const f = Math.sin(i * 1.4 + y * 0.05);
            g.px(20 + i + (y > 60 ? (y - 60) * 0.15 : 0), y, f > 0.3 ? hex('#3a3c6e') : hex('#262850'));
            g.px(99 - i - (y > 60 ? (y - 60) * 0.15 : 0), y, f > 0.3 ? hex('#3a3c6e') : hex('#262850'));
          }
        }
        g.rect(16, 13, 88, 2, hex('#2a2a40'));

        // Bed on the right: frame, mattress, blanket, pillow, a small plush.
        g.rect(232, 104, 4, 52, woodC.l);
        g.rect(232, 100, 200, 5, woodC.l);
        g.rect(236, 118, 200, 30, hex('#202a52'));
        for (let y = 116; y < 152; y++)
          for (let x = 236; x < g.right; x++) {
            const f = Math.sin(x * 0.12 + Math.sin(y * 0.2) * 2) * 0.5 + 0.5;
            g.px(x, y, f > 0.66 ? blanket[2]! : f > 0.33 ? blanket[1]! : blanket[0]!);
          }
        g.ellipse(262, 112, 18, 7, hex('#3a4170'));
        g.ellipse(262, 111, 16, 5, hex('#545c94'));
        // plush bunny on the pillow
        g.ellipse(256, 104, 4, 4, hex('#8a7aa8'));
        g.rect(253, 96, 2, 6, hex('#8a7aa8'));
        g.rect(257, 95, 2, 7, hex('#8a7aa8'));
        g.px(255, 104, ink);
        g.px(258, 104, ink);

        // Dresser.
        g.rect(98, 124, 124, 4, woodC.l);
        g.rect(98, 124, 124, 1, hex('#5a4038'));
        g.rect(102, 128, 116, 22, woodC.m);
        frameRect(g, 106, 131, 52, 15, woodC.d);
        frameRect(g, 162, 131, 52, 15, woodC.d);
        g.rect(128, 137, 8, 2, woodC.l);
        g.rect(184, 137, 8, 2, woodC.l);
        g.rect(104, 150, 3, 6, woodC.d);
        g.rect(213, 150, 3, 6, woodC.d);

        // VHS tapes and a little plant on the dresser.
        g.rect(208, 112, 12, 12, hex('#141418'));
        g.rect(208, 116, 12, 1, hex('#2a2a32'));
        g.rect(208, 120, 12, 1, hex('#2a2a32'));
        g.rect(209, 113, 4, 2, hex('#c8c0a8'));
        g.rect(209, 117, 4, 2, hex('#a8b8d8'));
        g.rect(102, 116, 8, 8, hex('#3a2a40'));
        g.ellipse(106, 113, 5, 4, hex('#1e3a2a'));
        g.ellipse(105, 112, 3, 2, hex('#2e5a3a'));

        // The TV.
        roundRect(g, TV.x, TV.y, TV.w, TV.h, 6, ink);
        roundRect(g, TV.x + 1, TV.y + 1, TV.w - 2, TV.h - 2, 5, plastic.m);
        g.rect(TV.x + 4, TV.y + 1, TV.w - 8, 2, plastic.l);
        g.rect(TV.x + 2, TV.y + TV.h - 4, TV.w - 4, 2, plastic.d);
        roundRect(g, SCR.x - 4, SCR.y - 4, SCR.w + 8, SCR.h + 8, 6, plastic.bezel);
        // knob panel
        g.rect(189, 64, 12, 52, plastic.d);
        g.disc(195, 74, 4, ink);
        g.disc(195, 74, 3, plastic.l);
        g.line(195, 74, 197, 71, ink);
        g.disc(195, 88, 4, ink);
        g.disc(195, 88, 3, plastic.l);
        g.line(195, 88, 192, 86, ink);
        for (let y = 98; y < 112; y += 2) g.rect(191, y, 8, 1, ink);
        g.rect(TV.x + 8, TV.y + TV.h, 6, 3, ink);
        g.rect(TV.x + TV.w - 14, TV.y + TV.h, 6, 3, ink);
        // rabbit ears
        g.ellipse(186, TV.y - 1, 6, 2, ink);
        g.line(184, TV.y - 2, 168, 18, hex('#9a9aa8'));
        g.line(188, TV.y - 2, 214, 24, hex('#9a9aa8'));
        g.disc(168, 18, 1, hex('#c8c8d8'));
        g.disc(214, 24, 1, hex('#c8c8d8'));

        // Nightlight: a little moon in the wall socket.
        g.rect(66, 128, 12, 16, hex('#2a2c48'));
        g.disc(72, 134, 5, hex('#ffe2a8'));
        g.disc(74, 132, 4, hex('#2a2c48'));
        g.glow(71, 134, 26, warm, 0.25, 4);

        // TV light washing the room (base layer; flicker added per frame).
        g.glow(154, 92, 120, glowC, 0.11, 5);
        g.glow(154, 150, 70, glowC, 0.07, 4);
        gloom(g, g.left, 156, g.w, g.bottom - 156, 0.5);
        g.lighting(0.42);
        g.light(154, 92, 120, 0.75, 90);
        g.light(72, 134, 40, 0.35);
        g.light(60, 50, 40, 0.2);

        // Precompute the screen pixels for the current view.
        const n = SCR.w * SCR.h;
        idx = new Int32Array(n).fill(-1);
        edge = new Float32Array(n);
        smile = new Uint8Array(n);
        shh = new Uint8Array(n);
        for (let v = 0; v < SCR.h; v++)
          for (let u = 0; u < SCR.w; u++) {
            const i = v * SCR.w + u;
            const nx = (u + 0.5) / SCR.w - 0.5;
            const ny = (v + 0.5) / SCR.h - 0.5;
            const r = Math.max(Math.abs(nx) * 2, Math.abs(ny) * 2);
            const corner = Math.abs(nx) > 0.43 && Math.abs(ny) > 0.4;
            if (corner && (Math.abs(nx) - 0.43) ** 2 + (Math.abs(ny) - 0.4) ** 2 > 0.07 ** 2) continue;
            const bx = SCR.x + u - g.ox;
            const by = SCR.y + v - g.oy;
            if (bx < 0 || by < 0 || bx >= g.w || by >= g.h) continue;
            idx[i] = by * g.w + bx;
            edge[i] = (1 - r ** 6 * 0.55) * (v % 2 ? 0.82 : 1);
            const ex = Math.min(Math.hypot(nx + 0.15, ny + 0.12), Math.hypot(nx - 0.15, ny + 0.12));
            const mr = Math.hypot(nx, (ny + 0.02) * 1.15);
            const ma = Math.atan2(ny + 0.02, nx);
            smile[i] = ex < 0.07 || (mr > 0.2 && mr < 0.27 && ma > 0.5 && ma < 2.64) ? 1 : 0;
            shh[i] = shhBits(u, v);
          }
      },

      frame(g, f) {
        const { t, awake } = f;
        const ev = f.rareT;

        // ── snow ──
        const intensity = 0.55 + 0.25 * awake + f.energy * 0.45;
        const roll = ((t * 9) % (SCR.h + 20)) - 10;
        let face = 0;
        let mask = smile;
        if (f.rare === 0 && ev < 7) face = envelope(ev, 7, 2, 2.5);
        if (f.rare === 2 && ev < 6) {
          face = envelope(ev, 6, 1.5, 2);
          mask = shh;
        }
        // Reduced motion: re-roll the snow only every couple of seconds, softly.
        if (!f.reduced || f.n % 16 === 0) seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        let s = seed | 1;
        const buf = g.buf;
        const n = idx.length;
        const contrast = f.reduced ? 0.5 : 1;
        for (let i = 0; i < n; i++) {
          const bi = idx[i]!;
          s ^= s << 13;
          s ^= s >>> 17;
          s ^= s << 5;
          if (bi < 0) continue;
          let v = ((s >>> 0) & 1023) / 1023;
          v = 0.5 + (v - 0.5) * contrast;
          const row = (i / SCR.w) | 0;
          const band = Math.abs(row - roll) < 4 ? 0.18 : 0;
          if (face > 0) v = mask[i] ? v * (1 - face) + face * (0.82 + v * 0.18) : v * (1 - face * 0.55);
          let k = ((v * intensity + band) * edge[i]! * 6.99) | 0;
          if (k > 6) k = 6;
          if (k < 0) k = 0;
          buf[bi] = snow[k]!;
        }
        // Screen glass highlight.
        g.rectA(SCR.x + 3, SCR.y + 2, 14, 1, hex('#ffffff'), 0.25);
        g.rectA(SCR.x + 2, SCR.y + 3, 1, 8, hex('#ffffff'), 0.2);

        // Flickering spill light from the screen.
        const flick = f.reduced ? 0.1 : 0.08 + 0.05 * hash3(f.n, 3) + f.energy * 0.08;
        g.glow(154, 118, 46, hex('#9aa8ff'), flick, 4);

        // ── the cat on top of the TV ──
        const breathe = Math.sin(t * 1.1) > 0 ? 1 : 0;
        const cx = 150;
        const cy = TV.y - 7;
        // tail draping down the left side, tip twitching
        const twitch = Math.sin(t * 3.1) * (Math.sin(t * 0.43) > 0.4 ? 1.6 : 0.3);
        for (let i = 0; i < 26; i++) {
          const tx = TV.x + 2 - (i > 4 ? 2 : 0) + (i > 20 ? Math.round(twitch * ((i - 20) / 6)) : 0);
          const ty = TV.y - 2 + i;
          g.rect(tx - 2, ty, 4, 1, cat[0]!);
          g.rect(tx - 1, ty, 2, 1, cat[1]!);
        }
        g.ellipse(cx + 8, cy + 1, 22, 9 + breathe, ink);
        g.ball(cx + 8, cy + 1, 21, 8 + breathe, cat, -0.3, -0.8, 0.3);
        for (let i = 0; i < 4; i++) arc(g, cx + 12 + i * 6, cy + 1, 3, 7 + breathe, Math.PI * 1.15, Math.PI * 1.85, cat[1]!);
        // head resting on the left
        const hx = cx - 13;
        const hy = cy;
        g.tri(hx - 10, hy - 2, hx - 2, hy - 6, hx - 9, hy - 14, ink);
        g.tri(hx + 2, hy - 6, hx + 10, hy - 2, hx + 8, hy - 14, ink);
        g.tri(hx - 9, hy - 3, hx - 3, hy - 6, hx - 8, hy - 12, cat[2]!);
        g.tri(hx + 3, hy - 6, hx + 9, hy - 3, hx + 7, hy - 12, cat[2]!);
        g.px(hx - 7, hy - 8, hex('#e0a0c0'));
        g.px(hx + 6, hy - 8, hex('#e0a0c0'));
        g.ellipse(hx, hy, 11, 8, ink);
        g.ball(hx, hy, 10, 7, cat, -0.2, -0.7, 0.35);
        g.hline(hx - 2, hx + 2, hy - 6, cat[1]!);
        g.px(hx, hy - 5, cat[1]!);
        // paw
        g.ellipse(hx + 7, hy + 7, 4, 2, ink);
        g.ellipse(hx + 7, hy + 6, 3, 1, cat[3]!);
        // three eyes
        const open = f.rare === 1 && ev < 7 ? envelope(ev, 7, 0.8, 1.2) : 0;
        const eyes = [
          [hx - 5, hy + 1],
          [hx + 5, hy + 1],
          [hx, hy - 2],
        ] as const;
        for (let i = 0; i < 3; i++) {
          const [ex, ey] = eyes[i]!;
          const slowBlink = ev > 3.2 && ev < 3.9;
          if (open > 0.5 && !slowBlink) {
            g.rect(ex - 1, ey - 1, 3, 2, hex('#d8ff8a'));
            g.px(ex, ey - 1, ink);
            g.px(ex, ey, ink);
            g.pxAdd(ex, ey - 2, hex('#d8ff8a'), 0.4);
          } else {
            g.px(ex - 1, ey, cat[0]!);
            g.px(ex, ey + 1, cat[0]!);
            g.px(ex + 1, ey, cat[0]!);
          }
        }
        if (open > 0) g.glow(hx, hy, 8, hex('#d8ff8a'), open * 0.25);
        // nose
        g.px(hx, hy + 4, hex('#d88aa8'));
        g.px(hx - 1, hy + 5, cat[0]!);
        g.px(hx + 1, hy + 5, cat[0]!);

        // Dust turning in the screen light.
        if (!f.reduced) motes(g, t, 110, 30, 210, 120, 12, hex('#c8d0ff'), 0.25, 4);
        void blinking;

        // Star mobile hanging from the ceiling (tall views see more of it).
        for (let i = 0; i < 3; i++) {
          const sway = f.reduced ? 0 : Math.sin(t * 0.4 + i * 2) * 2;
          const mx = 72 + i * 14 + sway;
          const my = -2 + i * 5;
          g.vline(72 + i * 14, g.top, my - 3, hex('#2a2c48'));
          const sc = hex('#6a6448');
          g.px(mx, my - 2, sc);
          g.hline(mx - 2, mx + 2, my - 1, sc);
          g.hline(mx - 1, mx + 1, my, sc);
          g.px(mx - 1, my + 1, sc);
          g.px(mx + 1, my + 1, sc);
        }
        arc(g, 86, g.top + 2, 20, 2, 0, Math.PI, hex('#2a2c48'));
      },
    };
  },
};

export default def;

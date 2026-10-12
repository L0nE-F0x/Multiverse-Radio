// Oddity: a jukebox glowing in an empty diner at night, stuck on the same record since 1974. Rain
// on the big windows, a neon sign outside read backwards, a pie under a dome, a calendar that
// never got turned.
// Rare events: the jukebox tries to change the record and puts the same one back; a couple who
// aren't there dance a slow one; a coffee slides down the counter to an empty stool; headlights
// sweep through and nobody comes in.

import { hex, mix, shade } from '../kit/color';
import { TAU, clamp, envelope, smoothstep, steam } from '../kit/fx';
import { glyph } from '../kit/font';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { rain, vignette } from './deep-kit';

const EYE = 68; // horizon (eye level) for the floor's perspective
const WALL = 112; // where the back wall meets the floor
const WIN = { y: 30, h: 50 };
const JB = { x: 212, y: 66, w: 34, h: 58 }; // the jukebox
const COUNTER = { x0: 14, x1: 128, top: 96 };

const def: SceneDef = {
  id: 'oddity-jukebox',
  fps: 15,
  focusX: 176,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create() {
    const ink = hex('#050405');
    const wallC = [hex('#0e0b0c'), hex('#16110f'), hex('#1e1714')];
    const neon = hex('#ff4a8a');
    const warm = hex('#ffb060');
    const chrome = [hex('#1a1a1e'), hex('#3a3a42'), hex('#6a6a74'), hex('#a8a8b4')];
    const vinyl = hex('#3a1014');
    const tile = [hex('#0c0b0c'), hex('#2a2620')];

    /** Text drawn mirror-image (a sign read from inside the window). */
    const mirrored = (g: Gfx, s: string, x: number, y: number, c: number, scale: number) => {
      let cx = x;
      const chars = [...s].reverse();
      for (const ch of chars) {
        const gl = glyph(ch);
        for (let gy = 0; gy < 5; gy++)
          for (let gx = 0; gx < gl.w; gx++) if (gl.bits[gy * gl.w + (gl.w - 1 - gx)]) g.rect(cx + gx * scale, y + gy * scale, scale, scale, c);
        cx += (gl.w + 1) * scale;
      }
    };

    return {
      background(g) {
        // ── ceiling, wall, windows ──
        g.vgrad([hex('#070606'), hex('#0c0a0a')], g.top, WIN.y - 4);
        g.rect(g.left, WIN.y - 6, g.w, WALL - WIN.y + 6, wallC[1]!);
        // pendant lamps (off) and a ceiling fan for tall views
        for (const lx of [60, 160, 260]) {
          g.vline(lx, g.top, 8, hex('#141214'));
          g.poly([lx - 6, 14, lx + 6, 14, lx + 3, 8, lx - 3, 8], hex('#1a1616'));
        }
        g.rect(150, -40, 20, 2, hex('#141214'));
        g.vline(160, g.top, -40, hex('#141214'));
        // the big windows: night outside, a street, the sign
        const outside = [hex('#060912'), hex('#0c1220'), hex('#141a28')];
        g.gradRect(g.left, WIN.y, g.w, WIN.h, outside);
        // across the road: dark shopfronts, one lamp
        g.rect(g.left, WIN.y + 18, g.w, WIN.h - 18, hex('#0a0d14'));
        for (let x = g.left; x < g.right; x += 26) g.rect(x + 4, WIN.y + 24, 14, 12, hex('#0e1220'));
        g.rect(g.left, WIN.y + 42, g.w, 8, hex('#0c0f16')); // the road
        g.vline(276, WIN.y + 6, WIN.y + 42, hex('#16181e'));
        g.glow(276, WIN.y + 7, 16, hex('#ffb060'), 0.25, 4);
        g.px(276, WIN.y + 7, hex('#ffd0a0'));
        // the sign outside, backwards
        mirrored(g, 'DINER', 152, WIN.y + 6, mix(hex('#1a0c14'), neon, 0.35), 2);
        // window frames
        for (let x = 136; x < g.right; x += 60) g.rect(x, WIN.y, 3, WIN.h, hex('#1a1614'));
        // the counter side is solid wall: the menu, a stopped clock, the calendar
        g.rect(g.left, WIN.y - 3, 136 - g.left, WIN.h + 6, wallC[1]!);
        for (let x = g.left - (((g.left % 8) + 8) % 8); x < 136; x += 8) g.vline(x, WIN.y - 3, WIN.y + WIN.h + 2, wallC[0]!);
        g.rect(22, 36, 70, 22, hex('#121012'));
        g.rect(22, 36, 70, 1, hex('#2a2426'));
        for (let k = 0; k < 4; k++) g.hline(26, 56 + (k % 2) * 12, 40 + k * 4, hex('#2e2a2c'));
        for (let k = 0; k < 4; k++) g.hline(76, 88, 40 + k * 4, hex('#3a3234'));
        g.disc(112, 44, 6, hex('#b8b0a0'));
        g.ring(112, 44, 6, 6, chrome[1]!);
        g.line(112, 44, 112, 40, ink);
        g.line(112, 44, 115, 46, ink);
        // OCT 1974, turned to and left
        g.rect(100, 53, 22, 20, hex('#a8a090'));
        g.rect(100, 53, 22, 7, hex('#7a2620'));
        g.text('1974', 102, 54, hex('#e8e0d0'));
        g.text('OCT', 105, 62, hex('#3a3430'));
        for (let k = 0; k < 2; k++) g.hline(102, 119, 68 + k * 2, hex('#7a7468'));
        g.px(111, 52, hex('#3a3a3a'));
        g.rect(g.left, WIN.y - 3, g.w, 3, hex('#1e1916'));
        g.rect(g.left, WIN.y + WIN.h, g.w, 3, hex('#241d19'));
        // the wall below the windows: a chrome rail, panelling
        g.rect(g.left, WIN.y + WIN.h + 3, g.w, WALL - WIN.y - WIN.h - 3, wallC[2]!);
        g.hline(g.left, g.right, WIN.y + WIN.h + 8, chrome[1]!);
        for (let x = g.left; x < g.right; x += 6) g.vline(x, WIN.y + WIN.h + 10, WALL, wallC[1]!);

        // ── floor: a checkerboard in perspective ──
        for (let y = WALL; y < g.bottom; y++) {
          const d = y - EYE;
          const v = 260 / d;
          for (let x = g.left; x < g.right; x++) {
            const u = ((x - 160) * 6) / d;
            const ch = (Math.floor(u) + Math.floor(v)) & 1;
            const fade = clamp((y - WALL) / 50);
            g.px(x, y, ch ? mix(tile[0]!, tile[1]!, 0.35 + fade * 0.35) : tile[0]!);
          }
        }
        g.hline(g.left, g.right, WALL, hex('#2a2420'));

        // ── booths along the back, to the right ──
        for (let i = 0; i < 4; i++) {
          const bx = 150 + i * 50;
          if (bx > 330) break;
          g.rect(bx, 92, 6, WALL - 92, vinyl);
          g.rect(bx + 34, 92, 6, WALL - 92, vinyl);
          g.hline(bx, bx + 5, 92, shade(vinyl, 1.5));
          g.hline(bx + 34, bx + 39, 92, shade(vinyl, 1.5));
          g.rect(bx + 8, 98, 24, 3, hex('#2a2a30'));
          g.vline(bx + 20, 101, WALL, chrome[1]!);
          g.rect(bx + 12, 94, 3, 4, chrome[2]!); // napkins
          g.rect(bx + 26, 95, 2, 3, hex('#8a8070')); // sugar
        }
        // ── the counter on the left, stools, the pie, the coffee machine ──
        const { x0, x1, top } = COUNTER;
        g.rect(x0, top, x1 - x0, WALL + 6 - top, hex('#2a1418'));
        g.rect(x0 - 2, top - 3, x1 - x0 + 4, 3, hex('#3a3436'));
        g.hline(x0 - 2, x1 + 1, top - 3, hex('#5a5258'));
        g.hline(x0, x1 - 1, top + 4, chrome[2]!);
        for (let k = 0; k < 4; k++) {
          const sx = x0 + 14 + k * 28;
          g.vline(sx, WALL + 2, WALL + 16, chrome[2]!);
          g.ellipse(sx, WALL + 1, 6, 2, vinyl);
          g.hline(sx - 5, sx + 5, WALL - 1, shade(vinyl, 1.6));
          g.ellipse(sx, WALL + 17, 4, 1, chrome[1]!);
        }
        // pie under a glass dome
        g.ellipse(46, top - 4, 7, 2, hex('#6a4a2a'));
        g.rect(40, top - 7, 13, 3, hex('#8a5a2a'));
        for (let a = 0; a < 40; a++) {
          const ang = Math.PI + (a / 40) * Math.PI;
          g.pxA(46 + Math.cos(ang) * 9, top - 4 + Math.sin(ang) * 11, hex('#8a9aaa'), 0.5);
        }
        g.px(46, top - 16, hex('#8a9aaa'));
        // coffee machine, a pot on the warmer
        g.rect(96, top - 22, 16, 19, hex('#1e1e22'));
        g.rect(98, top - 20, 12, 3, chrome[2]!);
        g.rect(100, top - 10, 8, 7, hex('#2a1a10'));
        g.rect(99, top - 11, 10, 1, hex('#3a3a3a'));
        g.px(106, top - 5, hex('#ff3a2a'));
        // ── the jukebox ──
        const { x, y, w, h } = JB;
        // the arch
        g.ellipse(x + w / 2, y + 8, w / 2 + 1, 10, ink);
        g.ellipse(x + w / 2, y + 8, w / 2, 9, hex('#3a2418'));
        g.rect(x - 1, y + 8, w + 2, h - 8, ink);
        g.rect(x, y + 8, w, h - 8, hex('#3a2418'));
        // the window onto the record
        roundRect(g, x + 6, y + 6, w - 12, 18, 4, hex('#0c0808'));
        // selection panel, grille
        g.rect(x + 5, y + 28, w - 10, 10, hex('#1a1210'));
        for (let k = 0; k < 4; k++) g.hline(x + 7, x + w - 8, y + 30 + k * 2, hex('#3a3026'));
        g.rect(x + 5, y + 42, w - 10, h - 46, hex('#140e0c'));
        g.rect(x - 2, y + h - 2, w + 4, 3, chrome[1]!);

        vignette(g, 0.5, 176, 84);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const { x, y, w, h } = JB;
        const glowK = (0.75 + 0.25 * f.energy) * (0.6 + 0.4 * f.awake);

        // rain on the glass
        rain(g, t, 136, WIN.y, g.right, WIN.y + WIN.h, 40, hex('#8a9ab0'), 0.25, 0.02, 60, 4, 8);
        // the neon outside: one letter is on its way out
        const flick = f.reduced ? 1 : hash3(Math.floor(t * 6), 3) < 0.12 ? 0.25 : 1;
        g.glow(172, WIN.y + 10, 30, neon, 0.18 * flick, 4);
        g.rectAdd(152, WIN.y + 6, 40, 10, neon, 0.08 * flick);
        // pink light falls on the booths
        g.rectAdd(140, 90, 120, 4, neon, 0.04 * flick);

        // headlights sweeping through (rare 3)
        if (R(3)) {
          const p = ev / 10;
          const sx = -60 + p * 440;
          const a = envelope(ev, 10, 1, 1) * (f.reduced ? 0.4 : 1);
          g.rectAdd(sx - 30, WIN.y, 40, WIN.h, hex('#fff0d0'), 0.12 * a);
          g.poly([sx - 30, WIN.y + WIN.h, sx + 10, WIN.y + WIN.h, sx + 60, g.bottom, sx - 80, g.bottom], hex('#fff0d0'), 2, 0.06 * a);
          g.rectAdd(sx - 10, 92, 60, 20, hex('#fff0d0'), 0.06 * a);
        }

        // ── the jukebox, lit ──
        // bubble tubes up the sides, cycling colour
        for (const side of [0, 1]) {
          const bx = side ? x + w - 4 : x + 1;
          for (let yy = y + 10; yy < y + h - 4; yy++) {
            const hue = (yy - t * 8) / 30;
            const c = mix(hex('#ff7a2a'), hex('#ffcc5a'), 0.5 + 0.5 * Math.sin(hue * TAU));
            g.rect(bx, yy, 3, 1, mix(hex('#2a1408'), c, 0.75 * glowK));
          }
          // bubbles
          for (let i = 0; i < 4; i++) {
            const p = ((t * 0.25 + i / 4 + side * 0.13) % 1);
            g.px(bx + 1, y + h - 6 - p * (h - 18), mix(hex('#ffe0b0'), hex('#ffffff'), 0.5));
          }
        }
        // the arch light
        for (let k = 0; k < 3; k++) {
          const c = mix(hex('#3a1408'), [hex('#ff8a3a'), hex('#ffd070'), hex('#ff5a3a')][k]!, glowK * 0.8);
          for (let a = 0; a <= 40; a++) {
            const ang = Math.PI + (a / 40) * Math.PI;
            g.px(x + w / 2 + Math.cos(ang) * (w / 2 - 2 - k * 2), y + 9 + Math.sin(ang) * (8 - k * 2), c);
          }
        }
        // the record behind the glass, turning; the tonearm (rare 0: it lifts, swaps, sets back down)
        const rx = x + w / 2;
        const ry = y + 15;
        let lift = 0;
        let slide = 0;
        if (R(0)) {
          lift = smoothstep(1, 2, ev) * (1 - smoothstep(7, 8, ev));
          slide = smoothstep(2.4, 3.6, ev) * (1 - smoothstep(5, 6.2, ev));
        }
        g.clip(x + 6, y + 6, w - 12, 18);
        g.rect(x + 6, y + 6, w - 12, 18, mix(hex('#0c0808'), warm, 0.15 * glowK));
        const recX = rx + Math.round(slide * 14);
        g.ellipse(recX, ry + 2, 9, 3, hex('#08080a'));
        g.ellipse(recX, ry + 2, 3, 1, hex('#8a2a22'));
        if (!f.reduced) {
          const sp = (t * 5.5) % TAU;
          g.px(recX + Math.cos(sp) * 7, ry + 2 + Math.sin(sp) * 2, hex('#5a5a62'));
          g.px(recX + Math.cos(sp + Math.PI) * 5, ry + 2 + Math.sin(sp + Math.PI) * 1.6, hex('#3a3a42'));
        }
        g.line(x + w - 9, ry - 4, rx + 4, ry + 1 - Math.round(lift * 4), chrome[3]!);
        g.noClip();
        g.glow(rx, ry, 18, warm, 0.25 * glowK, 4);
        // selection display: B7, always B7
        let sel = 'B7';
        if (R(0) && ev > 2.4 && ev < 6) sel = Math.floor(ev * 6) % 2 ? '--' : 'C3';
        g.rect(x + w / 2 - 6, y + 29, 12, 7, hex('#100806'));
        g.text(sel, x + w / 2 - 4, y + 30, mix(hex('#3a1a08'), hex('#ffb040'), glowK));
        // the grille glows with the music
        for (let yy = y + 44; yy < y + h - 4; yy += 2) {
          const k = glowK * (0.5 + 0.5 * f.energy) * (0.7 + 0.3 * Math.sin(yy * 0.7 + t * 3));
          g.hline(x + 7, x + w - 8, yy, mix(hex('#1a0c08'), hex('#ff7a3a'), k * 0.7));
        }
        // its light on the floor and the room
        g.glow(x + w / 2, y + h, 70, warm, 0.1 * glowK, 5);
        g.poly([x - 4, y + h, x + w + 4, y + h, x + w + 40, g.bottom, x - 40, g.bottom], warm, 2, 0.05 * glowK);
        g.glow(x + w / 2, y + 20, 40, hex('#ff8a3a'), 0.08 * glowK, 4);

        // ── the ones who aren't there (rare 1): a slow dance, translucent ──
        if (R(1)) {
          const a = envelope(ev, 10, 2, 2.5) * 0.4;
          const cx = 156 + Math.sin(ev * 0.6) * 6;
          const sway = Math.sin(ev * 1.6) * 1.5;
          const c = hex('#c8d8e8');
          g.ellipseA(cx - 3 + sway, 100, 3, 3, c, a);
          g.ellipseA(cx + 4 + sway, 99, 3, 3, c, a);
          g.ellipseA(cx - 3, 112, 4, 10, c, a);
          g.ellipseA(cx + 4, 112, 4, 10, c, a);
          g.tri(cx - 8, 128, cx + 2, 128, cx - 3, 112, c, 1, a * 0.8); // a skirt
          g.glow(cx, 110, 20, c, a * 0.2);
        }

        // ── a coffee slides along the counter (rare 2) ──
        if (R(2)) {
          const p = smoothstep(1, 4, ev);
          const cx = Math.round(108 - p * 52);
          const cy = COUNTER.top - 3;
          g.rect(cx - 2, cy - 3, 5, 4, hex('#d8d0c0'));
          g.rect(cx - 2, cy - 3, 5, 1, hex('#3a2010'));
          g.px(cx + 3, cy - 2, hex('#d8d0c0'));
          if (ev > 4) steam(g, t, cx, cy - 4, hex('#8a8478'), 4, 10, 2, 0.35, 0.3, 2);
          // the bell
          if (ev > 4 && ev < 4.6) {
            g.glow(120, COUNTER.top - 6, 5, hex('#ffe0a0'), 0.6);
            g.text('DING', 112, COUNTER.top - 18, hex('#8a8070'));
          }
        }
        g.ellipse(120, COUNTER.top - 4, 3, 2, chrome[2]!); // the bell itself
        g.px(120, COUNTER.top - 7, chrome[3]!);

        // dust motes in the jukebox light
        if (!f.reduced)
          for (let i = 0; i < 8; i++) {
            const p = (t * 0.02 + hash3(i, 4)) % 1;
            g.pxA(x - 20 + hash3(i, 5) * 70 + Math.sin(t * 0.3 + i) * 4, y + 60 - p * 60, warm, 0.3 * Math.sin(p * Math.PI) * glowK);
          }
      },
    };
  },
};

export default def;

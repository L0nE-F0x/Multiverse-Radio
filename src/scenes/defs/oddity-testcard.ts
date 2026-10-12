// Oddity: a test card glowing on an old television in a dark room. An armchair faces it with its
// back to us. A moth keeps the screen company. The tone goes on.
// Rare events: the eye in the middle of the card opens and looks around; the picture rolls and
// something else is briefly on it; the set switches off to a dot and comes back; a cat crosses.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, smoothstep } from '../kit/fx';
import { glyph } from '../kit/font';
import type { Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { hazeBand, vignette } from './deep-kit';

const SCR = { x: 130, y: 58, w: 60, h: 45 }; // the picture
const TV = { x: 118, y: 48, w: 84, h: 66 };
const FLOOR = 128;

const def: SceneDef = {
  id: 'oddity-testcard',
  fps: 12,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 9,
  create() {
    const ink = hex('#040406');
    const wall = [hex('#06070a'), hex('#0a0b10'), hex('#0e1016')];
    const glowC = hex('#b8c8e0');
    const plastic = [hex('#141414'), hex('#221f1c'), hex('#332e28'), hex('#4a4238')];

    // The card itself, drawn once into a small buffer.
    const W = SCR.w;
    const H = SCR.h;
    const card = new Int32Array(W * H);
    const alt = new Int32Array(W * H); // what's briefly on it when the picture rolls
    const P = (buf: Int32Array, x: number, y: number, c: Color) => {
      if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c;
    };
    const text = (buf: Int32Array, s: string, x: number, y: number, c: Color) => {
      let cx = x;
      for (const ch of s) {
        const gl = glyph(ch);
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < gl.w; gx++) if (gl.bits[gy * gl.w + gx]) P(buf, cx + gx, y + gy, c);
        cx += gl.w + 1;
      }
      return cx - x - 1;
    };
    {
      const grey = hex('#6a6c70');
      const line = hex('#c8cad0');
      const cx = W / 2;
      const cy = H / 2 - 2;
      const R = 17;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          let c = grey;
          if ((x - 2) % 7 === 0 || (y - 1) % 7 === 0) c = line;
          // castellated border
          if (x < 2 || x >= W - 2) c = ((y >> 2) & 1) ? hex('#e0e0e0') : hex('#101010');
          if (y < 2 || y >= H - 2) c = ((x >> 2) & 1) ? hex('#e0e0e0') : hex('#101010');
          const dx = x - cx + 0.5;
          const dy = y - cy + 0.5;
          const d = Math.hypot(dx, dy);
          if (d < R) {
            // inside the circle: colour bars, a grey ramp, a frequency grating
            if (dy < -7) c = hex(['#c8c8c8', '#c8c040', '#40b8c0', '#40b040', '#b040b0', '#c04040', '#4040c0'][Math.min(6, Math.floor((dx + R) / ((2 * R) / 7)))]!);
            else if (dy < -2) c = mix(hex('#101010'), hex('#e8e8e8'), Math.floor(((dx + R) / (2 * R)) * 6) / 5);
            else if (dy < 4) c = hex('#141414');
            else if (dy < 9) {
              const f = 0.3 + ((dx + R) / (2 * R)) * 2.4;
              c = Math.sin(dx * f * 2) > 0 ? hex('#e0e0e0') : hex('#202020');
            } else c = hex('#b8b0a0');
          }
          if (Math.abs(d - R) < 0.6) c = hex('#e8e8e8');
          card[y * W + x] = c;
        }
      // centre: a small lidded eye (closed), on the black band
      for (let x = -4; x <= 4; x++) P(card, Math.round(cx + x), Math.round(cy + 1 + Math.abs(x) * 0.25), hex('#d8d8d8'));
      // the caption box
      for (let y = H - 10; y < H - 3; y++) for (let x = 12; x < W - 12; x++) P(card, x, y, hex('#0c0c0c'));
      text(card, 'STAND BY', 15, H - 9, hex('#e0e0e0'));
      // the other card: plain, dark, a short question
      alt.fill(hex('#0a0c18'));
      const s = 'STILL';
      const w1 = text(alt, s, 0, -10, 0);
      text(alt, s, Math.round(W / 2 - w1 / 2), 15, hex('#c8d0e8'));
      const w2 = text(alt, 'HERE?', 0, -10, 0);
      text(alt, 'HERE?', Math.round(W / 2 - w2 / 2), 23, hex('#c8d0e8'));
    }

    const drawCard = (g: Gfx, src: Int32Array, k: number, roll: number, t: number, reduced: boolean) => {
      const b = g.buf;
      for (let y = 0; y < H; y++) {
        const by = SCR.y + y - g.oy;
        if (by < 0 || by >= g.h) continue;
        const sy = (((y + roll) % H) + H) % H;
        // scanlines and a faint travelling band
        const band = reduced ? 0 : Math.exp(-(((y - ((t * 9) % (H + 20)) + 10) / 5) ** 2)) * 0.12;
        const kk = k * (y % 2 ? 0.82 : 1) * (1 + band);
        const m = Math.round(kk * 256);
        for (let x = 0; x < W; x++) {
          const bx = SCR.x + x - g.ox;
          if (bx < 0 || bx >= g.w) continue;
          // rounded corners of the tube
          const cxd = x < 3 ? 3 - x : x > W - 4 ? x - (W - 4) : 0;
          const cyd = y < 3 ? 3 - y : y > H - 4 ? y - (H - 4) : 0;
          if (cxd * cxd + cyd * cyd > 6) continue;
          const c = src[sy * W + x]!;
          let rr = ((c & 255) * m) >> 8;
          let gg = (((c >>> 8) & 255) * m) >> 8;
          let bb = (((c >>> 16) & 255) * m) >> 8;
          // a cool phosphor cast
          rr = Math.min(255, rr * 0.92);
          gg = Math.min(255, gg * 0.97);
          bb = Math.min(255, bb * 1.05 + 4);
          b[by * g.w + bx] = (0xff000000 | (bb << 16) | (gg << 8) | rr) | 0;
        }
      }
    };

    return {
      background(g) {
        // ── the room ──
        g.vgrad(wall, g.top, FLOOR);
        // faint wallpaper stripes
        for (let x = g.left - (((g.left % 9) + 9) % 9); x < g.right; x += 9) g.rectD(x, g.top, 1, FLOOR - g.top, wall[2]!, 0.4);
        // skirting, carpet
        g.rect(g.left, FLOOR - 3, g.w, 3, hex('#121318'));
        g.vgrad([hex('#0c0c10'), hex('#08080b'), hex('#050507')], FLOOR, g.bottom, FLOOR);
        for (let i = 0; i < 300; i++) g.pxA(g.left + hash3(i, 1) * g.w, FLOOR + hash3(i, 2) * (g.bottom - FLOOR), hex('#1a1a20'), 0.6);
        // a window with the blinds down; streetlight leaks through the slats
        const wx = 30;
        const wy = 30;
        g.rect(wx - 3, wy - 3, 56, 70, hex('#0c0d12'));
        for (let y = wy; y < wy + 64; y += 3) {
          g.rect(wx, y, 50, 2, hex('#14161e'));
          g.rect(wx, y + 2, 50, 1, hex('#1e2638'));
        }
        g.rect(wx - 4, wy + 64, 58, 3, hex('#16171c'));
        g.vline(wx + 46, wy, wy + 60, hex('#2a2c34'));
        // slats of light on the floor
        for (let k = 0; k < 6; k++) g.poly([wx + 4, FLOOR + 6 + k * 5, wx + 50, FLOOR + 6 + k * 5, wx + 80, FLOOR + 9 + k * 7, wx + 20, FLOOR + 9 + k * 7], hex('#2a3448'), 1, 0.12);
        // a standard lamp, off
        g.vline(260, 40, FLOOR, hex('#101116'));
        g.poly([250, 40, 270, 40, 266, 26, 254, 26], hex('#16171c'));
        g.ellipse(260, FLOOR, 7, 1.5, hex('#101116'));
        // a framed picture: too dark to see what of
        g.rect(214, 40, 22, 28, hex('#121318'));
        g.rect(216, 42, 18, 24, hex('#0a0b0e'));

        // ── the cabinet and the set ──
        g.rect(108, 114, 104, FLOOR - 114, hex('#16120e'));
        g.hline(108, 211, 114, hex('#2a221a'));
        g.rect(112, 118, 46, 8, hex('#120e0b'));
        g.rect(162, 118, 46, 8, hex('#120e0b'));
        g.px(134, 121, hex('#3a3024'));
        g.px(184, 121, hex('#3a3024'));
        roundRect(g, TV.x, TV.y, TV.w, TV.h, 5, plastic[1]!);
        roundRect(g, TV.x + 1, TV.y + 1, TV.w - 2, 3, 2, plastic[2]!);
        roundRect(g, SCR.x - 4, SCR.y - 4, SCR.w + 8, SCR.h + 8, 4, ink);
        // control panel to the right of the tube: knobs, a grille
        g.disc(TV.x + TV.w - 6, TV.y + 16, 2.5, plastic[3]!);
        g.disc(TV.x + TV.w - 6, TV.y + 26, 2.5, plastic[3]!);
        for (let y = TV.y + 36; y < TV.y + 58; y += 2) g.hline(TV.x + TV.w - 9, TV.x + TV.w - 3, y, plastic[0]!);
        g.rect(TV.x + 8, TV.y + TV.h, 6, 2, plastic[0]!);
        g.rect(TV.x + TV.w - 14, TV.y + TV.h, 6, 2, plastic[0]!);
        // rabbit ears
        g.line(160, TV.y, 146, TV.y - 26, hex('#3a3a40'));
        g.line(160, TV.y, 178, TV.y - 22, hex('#3a3a40'));
        g.ellipse(160, TV.y, 5, 2, plastic[0]!);
        // the flex, trailing off to the wall
        for (let x = 212; x < 250; x++) g.px(x, FLOOR + 2 + Math.round(Math.sin(x * 0.2) * 1.5), hex('#0e0e12'));

        // the set's light on the room, baked at its usual level
        g.glow(SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, 100, glowC, 0.07, 5);
        g.poly([SCR.x - 4, 114, SCR.x + SCR.w + 4, 114, SCR.x + SCR.w + 70, g.bottom, SCR.x - 70, g.bottom], glowC, 2, 0.05);
        g.hline(TV.x - 10, TV.x + TV.w + 9, 114, mix(hex('#2a221a'), glowC, 0.22));
        hazeBand(g, 30, FLOOR, hex('#1a2030'), 0.05, 0.12);
        vignette(g, 0.55, 160, 84);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 9;

        // the tone breathes the picture very slightly
        let k = 0.78 + f.energy * 0.12 + (f.reduced ? 0 : 0.03 * Math.sin(t * 50));
        k *= 0.7 + 0.3 * f.awake;
        let roll = 0;
        let src = card;
        let off = 0; // 0 = on, 1 = collapsed to a dot
        if (R(1)) {
          if (ev > 2 && ev < 3.2) roll = Math.round((ev - 2) * 70);
          if (ev > 3.2 && ev < 5.2) src = alt;
          if (ev > 5.2 && ev < 6.2) roll = Math.round((ev - 5.2) * 50);
          if (f.reduced) roll = 0;
        }
        if (R(2)) off = smoothstep(1.5, 2.1, ev) * (1 - smoothstep(6, 6.6, ev));

        // the picture, its glow on the room
        if (off < 0.95) {
          drawCard(g, src, k * (1 - off), roll, t, f.reduced);
          if (off > 0) {
            // squash toward a line, then a dot
            const keep = Math.max(1, Math.round(SCR.h * (1 - off)));
            const top = SCR.y + Math.round((SCR.h - keep) / 2);
            g.rect(SCR.x, SCR.y, SCR.w, top - SCR.y, ink);
            g.rect(SCR.x, top + keep, SCR.w, SCR.y + SCR.h - top - keep, ink);
          }
        } else {
          g.rect(SCR.x, SCR.y, SCR.w, SCR.h, ink);
        }
        if (off > 0.6 && off < 1.01) {
          const a = R(2) && ev > 2.1 && ev < 6 ? clamp(1 - (ev - 2.1) / 3) : 0;
          g.glow(SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, 4, hex('#ffffff'), a);
          g.px(SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, mix(ink, hex('#ffffff'), a));
        }

        // the centre eye (rare 0): opens, looks left, right, at us; closes
        if (R(0) && src === card && off === 0) {
          const open = smoothstep(1, 1.8, ev) * (1 - smoothstep(7.2, 8, ev));
          const cx = SCR.x + SCR.w / 2;
          const cy = SCR.y + SCR.h / 2 - 1;
          if (open > 0.1) {
            const hgt = Math.round(open * 2);
            g.ellipse(cx, cy, 4, hgt, shade(hex('#d8d8d8'), k));
            const look = ev < 3.5 ? -2 : ev < 5 ? 2 : 0;
            if (hgt >= 1) g.rect(cx + look - 1, cy - Math.min(1, hgt - 1), 2, Math.max(1, hgt), hex('#101010'));
          }
        }

        const lit = k * (1 - off);
        // the room dims when the set goes off; otherwise a soft bloom round the tube
        if (off > 0) g.rectMul(g.left, g.top, g.w, g.h, 1 - 0.25 * off);
        g.glow(SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, 40, glowC, 0.05 * lit, 4);

        // the moth, bumping against the glass
        if (!(R(2) && off > 0.5)) {
          const mt = t * 1.3;
          const mx = SCR.x + SCR.w * 0.7 + Math.sin(mt * 1.7) * 9 + Math.sin(mt * 4.3) * 3;
          const my = SCR.y + SCR.h * 0.3 + Math.sin(mt * 1.1) * 7 + Math.cos(mt * 3.7) * 2;
          const flap = f.reduced ? 0 : Math.sin(t * 40) > 0 ? 1 : 0;
          g.px(mx, my, hex('#2a2620'));
          g.px(mx - 1, my - flap, hex('#3a342c'));
          g.px(mx + 1, my - flap, hex('#3a342c'));
        }

        // a cat crosses in front of the set (rare 3), sits a moment, looks, moves on
        if (R(3)) {
          const sit = ev > 3.2 && ev < 6;
          const p = ev < 3.2 ? ev / 3.2 : ev < 6 ? 1 : 1 + (ev - 6) / 3;
          const cx = Math.round(80 + p * 80);
          const cy = FLOOR + 6;
          const c = hex('#060608');
          const rim = mix(c, glowC, 0.5 * lit);
          if (sit) {
            g.ellipse(cx, cy - 6, 5, 7, c);
            g.ellipse(cx + 1, cy - 14, 3, 3, c);
            g.px(cx - 1, cy - 18, c);
            g.px(cx + 3, cy - 18, c);
            g.line(cx - 4, cy, cx - 10, cy - 1, c);
            g.vline(cx + 5, cy - 12, cy - 2, rim);
          } else {
            const step = f.reduced ? 0 : Math.round(Math.sin(t * 10));
            g.rect(cx - 6, cy - 7, 12, 4, c);
            g.rect(cx + 5, cy - 10, 4, 4, c);
            g.px(cx + 5, cy - 11, c);
            g.px(cx + 8, cy - 11, c);
            g.vline(cx - 5 + step, cy - 3, cy, c);
            g.vline(cx + 3 - step, cy - 3, cy, c);
            g.line(cx - 6, cy - 6, cx - 11, cy - 10, c);
            g.hline(cx - 5, cx + 8, cy - 7, rim);
          }
        }

        // the armchair, its back to us, facing the set
        {
          const ax = 236;
          const ay = 96;
          const c = hex('#08080b');
          g.ellipse(ax, ay + 6, 26, 10, c);
          g.rect(ax - 26, ay + 6, 53, 60, c);
          g.ellipse(ax - 28, ay + 22, 7, 6, c);
          g.ellipse(ax + 28, ay + 22, 7, 6, c);
          g.rect(ax - 35, ay + 22, 14, 50, c);
          g.rect(ax + 22, ay + 22, 14, 50, c);
          // rim light from the screen on its near edge
          const rim = mix(c, glowC, 0.3 * lit);
          for (let a = 0; a < 30; a++) {
            const ang = Math.PI * (1.05 + (a / 30) * 0.5);
            g.px(ax + Math.cos(ang) * 26, ay + 6 + Math.sin(ang) * 10, rim);
          }
          g.vline(ax - 35, ay + 22, ay + 70, mix(c, glowC, 0.15 * lit));
        }
      },
    };
  },
};

export default def;

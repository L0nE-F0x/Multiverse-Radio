// Yesterday FM: a cosy 1970s living room in warm afternoon light. A tear-off calendar is
// stuck on yesterday's date, a wood-panelled radio glows on the sideboard, a dog sleeps on
// the rug, the tea has already gone cold, and the wall clock runs gently backwards.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { type Gfx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { motes, vignette } from './lib/night';

const FLOOR_Y = 118;
const WIN = { x: 226, y: 20, w: 66, h: 72 };
const CLOCK = { x: 122, y: 42, r: 11 };
const CAL = { x: 72, y: 34 };
const DOG = { x: 168, y: 126 };
const CUP = { x: 98, y: 112 };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const def: SceneDef = {
  id: 'yesterday-room',
  fps: 12,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#0a0604');
    const paper = [hex('#1e140e'), hex('#261a12'), hex('#2e2016')];
    const panel = [hex('#160d08'), hex('#20140c'), hex('#2a1a10')];
    const sun = hex('#ffcf8a');
    const rose = accent;
    const mustard = hex('#6a5020');
    const mustardL = hex('#8a6a2c');
    const carpet = [hex('#1a0f0c'), hex('#22140f')];
    // Yesterday, according to the listener's clock.
    const yd = new Date(Date.now() - 86400000);
    const dayStr = String(yd.getDate());
    const monStr = MONTHS[yd.getMonth()]!;

    const calendar = (g: Gfx, x: number, y: number, a: number) => {
      g.rectA(x, y + 2, 20, 22, hex('#e0d4bc'), a);
      g.rectA(x, y + 2, 20, 6, mix(rose, hex('#8a3a3a'), 0.4), a);
      if (a > 0.5) {
        g.textCenter(monStr, x + 10, y + 3, hex('#f0e8d8'));
        g.textCenter(dayStr, x + 10, y + 11, hex('#3a2a20'), 2);
      }
    };

    return {
      background(g) {
        // Wallpaper: a soft 70s pattern of rings, upper wall.
        for (let y = g.top; y < 70; y++)
          for (let x = g.left; x < g.right; x++) {
            const cx = ((x % 16) + 16) % 16 - 8;
            const cy = ((((y + (Math.floor(x / 16) % 2) * 8) % 16) + 16) % 16) - 8;
            const d = Math.sqrt(cx * cx + cy * cy);
            g.px(x, y, d > 5 && d < 7 ? paper[2]! : d < 2.5 ? paper[1]! : paper[0]!);
          }
        // Wood panelling below.
        for (let y = 70; y < FLOOR_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const seam = ((x % 12) + 12) % 12 === 0;
            const grain = hash3(x, y >> 2, 4) < 0.2;
            g.px(x, y, seam ? panel[0]! : grain ? panel[2]! : panel[1]!);
          }
        g.rect(g.left, 68, g.w, 3, hex('#3a2414'));
        g.hline(g.left, g.right, 68, hex('#4a3020'));
        // Carpet.
        for (let y = FLOOR_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) g.px(x, y, hash3(x, y, 5) < 0.35 ? carpet[1]! : carpet[0]!);
        g.rect(g.left, FLOOR_Y, g.w, 2, hex('#2a1810'));
        // a round rug
        g.ellipse(164, 132, 70, 12, mix(hex('#3a2018'), rose, 0.15));
        g.ellipse(164, 132, 60, 9, mix(hex('#2a1810'), rose, 0.1));

        // The window: bright afternoon, sheer curtains.
        const W = WIN;
        g.rect(W.x - 4, W.y - 4, W.w + 8, W.h + 8, hex('#3a2414'));
        g.gradRect(W.x, W.y, W.w, W.h, [hex('#ffe8b8'), hex('#f8c888'), hex('#d89860')]);
        // a tree outside, soft
        g.ellipseA(W.x + 46, W.y + 30, 22, 18, hex('#7a8a4a'), 0.5);
        g.ellipseA(W.x + 30, W.y + 20, 14, 12, hex('#8a9a5a'), 0.4);
        g.rect(W.x + W.w / 2 - 1, W.y, 2, W.h, hex('#3a2414'));
        g.rect(W.x, W.y + W.h / 2 - 1, W.w, 2, hex('#3a2414'));
        for (const s of [0, 1]) {
          const cx = s ? W.x + W.w - 10 : W.x - 6;
          for (let y = W.y - 6; y < W.y + W.h + 8; y++)
            for (let x = cx; x < cx + 16; x++) if (Math.sin(x * 1.4) > -0.2) g.pxA(x, y, hex('#f0e0c8'), 0.35);
        }
        g.rect(W.x - 12, W.y - 8, W.w + 24, 2, hex('#5a3a20'));
        g.rect(W.x - 6, W.y + W.h + 4, W.w + 12, 3, hex('#4a2c18'));

        // The sofa: mustard corduroy.
        roundRect(g, 54, 84, 110, 22, 5, mustard);
        for (let x = 58; x < 160; x += 3) g.vline(x, 86, 104, shade(mustard, 0.85));
        roundRect(g, 50, 100, 118, 18, 4, mustardL);
        g.hline(54, 163, 101, mix(mustardL, sun, 0.2));
        roundRect(g, 44, 92, 14, 26, 4, mustard);
        roundRect(g, 160, 92, 14, 26, 4, mustard);
        g.rect(58, 118, 3, 3, ink);
        g.rect(156, 118, 3, 3, ink);
        // a crocheted cushion
        roundRect(g, 66, 88, 18, 14, 3, mix(rose, hex('#6a3a2a'), 0.4));
        for (let i = 0; i < 4; i++) g.px(70 + i * 3, 94, mix(rose, hex('#e8d0b0'), 0.4));

        // The coffee table and the cup of tea.
        g.ellipse(102, 114, 22, 3, hex('#3a2414'));
        g.hline(80, 123, 112, hex('#5a3a20'));
        g.rect(84, 115, 2, 8, ink);
        g.rect(118, 115, 2, 8, ink);
        const { x: cx, y: cy } = CUP;
        g.ellipse(cx, cy, 6, 1, hex('#d8ccb8'));
        g.rect(cx - 3, cy - 6, 7, 6, hex('#e8dcc8'));
        g.rect(cx - 3, cy - 6, 7, 1, hex('#6a3a1a'));
        g.rect(cx + 4, cy - 5, 2, 3, hex('#e8dcc8'));
        g.rect(cx - 2, cy - 4, 5, 1, mix(rose, hex('#e8dcc8'), 0.5));

        // The sideboard and the radio on it.
        g.rect(186, 94, 66, 24, hex('#2a180e'));
        g.hline(186, 251, 94, hex('#4a2c18'));
        g.rect(188, 98, 30, 18, hex('#22140c'));
        g.rect(220, 98, 30, 18, hex('#22140c'));
        g.px(216, 107, hex('#a08050'));
        g.px(222, 107, hex('#a08050'));
        roundRect(g, 196, 74, 40, 20, 3, hex('#4a2c16'));
        for (let x = 199; x < 214; x += 2) g.vline(x, 77, 91, hex('#2a180c'));
        g.rect(216, 78, 17, 6, hex('#1a1008'));
        g.disc(220, 88, 2, hex('#8a6a40'));
        g.disc(229, 88, 2, hex('#8a6a40'));
        // a trailing plant on the sideboard
        g.rect(240, 86, 8, 8, hex('#8a4a2a'));
        for (let i = 0; i < 18; i++) g.px(244 + Math.sin(i * 0.6) * 3, 86 + i, i % 3 ? hex('#3a5a28') : hex('#4a6a30'));

        // The clock face and the calendar's backing card.
        g.disc(CLOCK.x, CLOCK.y, CLOCK.r + 2, hex('#4a2c16'));
        g.disc(CLOCK.x, CLOCK.y, CLOCK.r, hex('#e0d4bc'));
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.px(CLOCK.x + Math.cos(a) * (CLOCK.r - 2), CLOCK.y + Math.sin(a) * (CLOCK.r - 2), hex('#5a4030'));
        }
        g.rect(CAL.x - 2, CAL.y, 24, 28, hex('#5a3a20'));
        g.vline(CAL.x + 10, CAL.y - 4, CAL.y, hex('#3a2414'));

        // Afternoon light: a long shaft across the room, warmth on the far wall.
        g.poly([W.x, W.y, W.x + W.w / 2, W.y, 140, FLOOR_Y + 20, 60, FLOOR_Y + 20], sun, 2, 0.06);
        g.glow(W.x + W.w / 2, W.y + W.h / 2, 120, sun, 0.1, 6);
        vignette(g, 0.5, 170, 80, 220, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const rewind = f.rare === 3 && ev < 10 ? envelope(ev, 10, 1.5, 2) : 0;

        // The sun patch on the rug, which drifts the wrong way when time rewinds.
        const drift = Math.sin(t * 0.01) * 8 - rewind * 26;
        g.poly([84 + drift, 124, 128 + drift, 124, 116 + drift, 140, 64 + drift, 140], sun, 2, 0.1);
        g.poly([86 + drift, 125, 104 + drift, 125, 98 + drift, 139, 76 + drift, 139], sun, 2, 0.05);
        motes(g, t, 90, 30, 150, 90, 30, sun, 0.4, 3, 0.35);

        // The clock, running gently backwards (and briskly so when time rewinds).
        const back = -(t * (1 + rewind * 60));
        const sa = (back / 60) * Math.PI * 2 - Math.PI / 2;
        const ma = (back / 3600) * Math.PI * 2 - Math.PI / 2 + 1.2;
        const ha = (back / 43200) * Math.PI * 2 - Math.PI / 2 + 4;
        const { x, y, r } = CLOCK;
        g.line(x, y, x + Math.cos(ha) * (r - 6), y + Math.sin(ha) * (r - 6), hex('#2a1a10'));
        g.line(x, y, x + Math.cos(ma) * (r - 3), y + Math.sin(ma) * (r - 3), hex('#2a1a10'));
        g.line(x, y, x + Math.cos(sa) * (r - 2), y + Math.sin(sa) * (r - 2), mix(rose, hex('#8a2a2a'), 0.5));

        // The calendar: a page tears off, flutters, and thinks better of it.
        if (f.rare === 0 && ev < 10) {
          const p = ev < 5 ? clamp((ev - 1) / 4) : clamp(1 - (ev - 5.5) / 3);
          calendar(g, CAL.x, CAL.y, 1);
          if (p > 0) {
            const px = CAL.x + p * 30 + Math.sin(ev * 4) * 4 * p;
            const py = CAL.y + p * 70;
            const w = Math.abs(Math.cos(ev * 3)) * 20 * p + 20 * (1 - p);
            g.rect(px + (20 - w) / 2, py + 2, Math.max(1, w), 22, hex('#e0d4bc'));
            g.rect(px + (20 - w) / 2, py + 2, Math.max(1, w), 6, mix(rose, hex('#8a3a3a'), 0.4));
          }
        } else calendar(g, CAL.x, CAL.y, 1);

        // The radio's dial glows; its needle drifts with the music.
        const e = f.energy;
        g.rect(217, 79, 15, 4, mix(hex('#3a2010'), sun, 0.55 + 0.1 * awake));
        g.vline(219 + Math.round(e * 8), 79, 82, hex('#c83a2a'));
        g.glow(224, 81, 12, sun, 0.15 + e * 0.1);

        // The tea: cold. In one rare moment the steam goes back into it.
        if (f.rare === 2 && ev < 10) {
          const k = envelope(ev, 10, 1.5, 2);
          for (let i = 0; i < 8; i++) {
            const p = 1 - ((ev * 0.25 + i / 8) % 1);
            g.pxA(CUP.x + Math.sin(p * 6 + i) * 2, CUP.y - 7 - p * 16, hex('#f0e8d8'), 0.45 * k * Math.sin(p * Math.PI));
          }
        }

        // ── the dog, asleep on the rug ──
        const { x: dx, y: dy } = DOG;
        const breathe = f.reduced ? 0 : Math.sin(t * 0.9) > 0 ? 1 : 0;
        const dream = f.rare === 1 && ev < 10 ? envelope(ev, 10, 1, 1.5) : 0;
        const fur = hex('#7a5638');
        const furL = mix(fur, sun, 0.4);
        const furD = hex('#3a2416');
        const thump = dream > 0 ? Math.abs(Math.sin(ev * 5)) * 3 : 0;
        const pad = dream > 0 && !f.reduced ? Math.sin(ev * 14) * 2 * dream : 0;
        // tail, which thumps when dreaming
        g.line(dx + 15, dy + 1, dx + 24, dy + 3 - thump, furD);
        g.line(dx + 15, dy, dx + 23, dy + 2 - thump, fur);
        // body, curled, with an outline against the rug
        g.ellipse(dx, dy, 17, 7 + breathe * 0.5, ink);
        g.ellipse(dx, dy, 16, 6 + breathe * 0.5, fur);
        g.ellipse(dx - 1, dy - 3, 12, 2, furL);
        g.ellipse(dx + 8, dy + 2, 6, 3, furD);
        // legs stretched out front
        g.rect(dx - 14 + pad, dy + 4, 9, 2, ink);
        g.rect(dx - 13 + pad, dy + 4, 8, 1, furL);
        g.rect(dx - 2 - pad, dy + 5, 7, 2, ink);
        g.rect(dx - 1 - pad, dy + 5, 6, 1, fur);
        // head resting on the front paws, snout out, ear flopped
        const hx = dx - 18;
        const hy = dy + 1;
        g.ellipse(hx, hy, 7, 5, ink);
        g.ellipse(hx, hy, 6, 4, fur);
        g.ellipse(hx - 1, hy - 2, 4, 1, furL);
        g.rect(hx - 10, hy, 6, 4, ink);
        g.rect(hx - 9, hy, 5, 3, fur);
        g.px(hx - 10, hy, ink);
        g.px(hx - 9, hy, hex('#1a100a'));
        g.hline(hx - 3, hx - 1, hy - 1, ink);
        const ear = dream > 0.3 && Math.floor(ev * 3) % 3 === 0 ? -2 : 0;
        g.ellipse(hx + 3, hy + 1 + ear, 2, 4, furD);
        if (awake < 0.5 || dream > 0)
          for (let i = 0; i < 2; i++) {
            const p = (t * 0.2 + i / 2) % 1;
            g.text('z', dx - 30 - p * 4, dy - 8 - p * 12, mix(hex('#e8d8c0'), panel[1]!, p));
          }
      },
    };
  },
};

export default def;

// The Atomic Bachelor Pad: the sunken living room of a split-level home of tomorrow, Lot 12,
// Futureville, some time after dark. A long walnut hi-fi console glows under the picture
// window; two enormous speakers flank it, and their cones push in turn, left, right, left,
// as the stereo demonstration requires. A starburst clock, a sputnik lamp, and out past the
// desert a rocket waits on its gantry.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, vignette } from './lib/night';

const WIN = { x0: 106, x1: 214, y0: 26, y1: 86 };
const CONSOLE = { x0: 110, x1: 210, y0: 92, y1: 110 };
const SPK = [
  { x: 88, y: 58 },
  { x: 232, y: 58 },
];
const CLOCK = { x: 50, y: 36 };
const LAMP = { x: 280, y: 40 };
const ROCKET = { x: 196, y: 80 };
const PIT_Y = 126;

const def: SceneDef = {
  id: 'hifi-den',
  fps: 15,
  focusY: 88,
  rareEvents: 3,
  rareDuration: 12,
  grade: { temperature: 0.1, saturation: 0.9, bloom: 0.55 },
  create({ accent }) {
    const ink = hex('#0a0608');
    const pink = accent;
    const amber = hex('#ffb060');
    const warm = hex('#ffd8a0');
    const walnut = [hex('#1a0e08'), hex('#2e1a0e'), hex('#4a2c16'), hex('#6a4220')];
    const wallC = [hex('#1e161c'), hex('#2a2028'), hex('#3a2e34')];
    const teal = hex('#2e6a6a');

    // a cone is drawn per frame: push 0..1
    const cone = (g: Gfx, x: number, y: number, r: number, push: number) => {
      g.disc(x, y, r + 1, ink);
      g.ball(x, y, r, r, [hex('#0c0a0a'), hex('#1a1614'), hex('#2a2420'), hex('#3a322c')], 0.4, 0.5, 0.2);
      const pr = r * 0.6 + push * 1.2;
      g.ring(x, y, pr, pr, mix(hex('#141010'), pink, 0.1 + push * 0.25));
      g.disc(x, y, 2 + push, mix(hex('#2a2420'), warm, 0.15 + push * 0.5));
      if (push > 0.05) g.glow(x, y, r + 6, pink, 0.1 * push);
    };

    return {
      background(g) {
        // ── the wall: pale plaster above walnut panelling ──
        g.vgrad(wallC, g.top, 90);
        for (let y = 90; y < PIT_Y; y++) g.hline(g.left, g.right, y, walnut[1]!);
        for (let x = Math.floor(g.left / 10) * 10; x < g.right; x += 10) g.vline(x, 90, PIT_Y - 1, walnut[0]!);
        g.hline(g.left, g.right, 90, walnut[3]!);
        // ceiling with a cove light (tall views)
        if (g.top < 0) {
          g.rect(g.left, g.top, g.w, -g.top, hex('#120c10'));
          g.rect(g.left, -4, g.w, 3, hex('#2a1e22'));
          for (let x = g.left; x < g.right; x++) g.pxAdd(x, -1, warm, 0.25);
          g.glow(160, 2, 160, warm, 0.06, 6);
          // a bubble lamp hanging over the pit
          g.vline(160, g.top, -46, hex('#3a3034'));
          g.ball(160, -36, 11, 10, [hex('#6a5a50'), hex('#a8988a'), hex('#e0d4c4'), hex('#fff4e4')], -0.3, -0.2, 0.5);
          g.glow(160, -34, 40, warm, 0.14, 6);
        }

        // ── the picture window: desert at night ──
        const W0 = WIN;
        g.rect(W0.x0 - 4, W0.y0 - 4, W0.x1 - W0.x0 + 9, W0.y1 - W0.y0 + 8, walnut[0]!);
        g.clip(W0.x0, W0.y0, W0.x1 - W0.x0 + 1, W0.y1 - W0.y0 + 1);
        g.vgrad([hex('#0a0a1e'), hex('#1e1838'), hex('#4a2a48'), hex('#8a4a52')], W0.y0, W0.y1 - 8);
        for (let i = 0; i < 50; i++) g.pxAdd(W0.x0 + hash3(i, 1) * (W0.x1 - W0.x0), W0.y0 + hash3(i, 2) * 34, hex('#e8e0ff'), 0.2 + hash3(i, 3) * 0.5);
        // a crescent moon
        g.disc(120, 38, 5, hex('#e8dcc0'));
        g.disc(122, 37, 5, hex('#141230'));
        // mesas
        for (let x = W0.x0; x <= W0.x1; x++) {
          const m1 = 74 - (x > 104 && x < 140 ? 10 - Math.abs(x - 122) * 0.1 : 0) - fbm(x / 8, 1, 61, 2) * 2;
          const m2 = 78 - (x > 156 && x < 186 ? 6 : 0) - fbm(x / 6, 2, 63, 2) * 2;
          g.vline(x, Math.round(m1), W0.y1, hex('#2a1a2a'));
          g.vline(x, Math.round(m2), W0.y1, hex('#1a1018'));
        }
        g.rect(W0.x0, 82, W0.x1 - W0.x0 + 1, 5, hex('#120a10'));
        // the gantry beside the rocket
        g.vline(ROCKET.x + 6, ROCKET.y - 16, ROCKET.y, hex('#3a2a34'));
        for (let y = ROCKET.y - 16; y < ROCKET.y; y += 3) g.hline(ROCKET.x + 5, ROCKET.x + 8, y, hex('#2a1e26'));
        g.noClip();
        // window frame and mullions, a shelf of sill
        for (const x of [W0.x0 + 36, W0.x0 + 72]) g.rect(x, W0.y0, 2, W0.y1 - W0.y0, walnut[1]!);
        g.rect(W0.x0 - 6, W0.y1 + 1, W0.x1 - W0.x0 + 13, 3, walnut[2]!);
        g.hline(W0.x0 - 6, W0.x1 + 6, W0.y1 + 1, walnut[3]!);

        // ── the starburst clock ──
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const r = k % 2 ? 11 : 15;
          g.line(CLOCK.x, CLOCK.y, CLOCK.x + Math.cos(a) * r, CLOCK.y + Math.sin(a) * r, mix(hex('#6a5020'), hex('#d8b060'), k % 2 ? 0.3 : 0.6));
          g.px(CLOCK.x + Math.cos(a) * (r + 1), CLOCK.y + Math.sin(a) * (r + 1), hex('#e8c878'));
        }
        g.disc(CLOCK.x, CLOCK.y, 5, hex('#c8b890'));
        g.disc(CLOCK.x, CLOCK.y, 4, hex('#e8dcc0'));
        g.line(CLOCK.x, CLOCK.y, CLOCK.x - 1, CLOCK.y - 3, ink);
        g.line(CLOCK.x, CLOCK.y, CLOCK.x + 3, CLOCK.y + 1, ink);

        // ── the sputnik lamp ──
        g.vline(LAMP.x, LAMP.y, PIT_Y, hex('#8a8a90'));
        g.ellipse(LAMP.x, PIT_Y, 6, 1, hex('#5a5a60'));

        // ── the speakers: tall walnut cabinets on splayed legs ──
        for (const s of SPK) {
          g.rect(s.x - 15, s.y - 10, 31, 60, walnut[0]!);
          g.rect(s.x - 14, s.y - 9, 29, 58, walnut[2]!);
          for (let y = s.y - 9; y < s.y + 49; y++) if ((y & 3) === 0) g.hline(s.x - 14, s.x + 14, y, walnut[1]!);
          g.vline(s.x - 14, s.y - 9, s.y + 48, walnut[3]!);
          // grille cloth panel behind the drivers
          g.rect(s.x - 12, s.y - 6, 25, 52, hex('#2a2224'));
          for (let y = s.y - 6; y < s.y + 46; y++) for (let x = s.x - 12; x <= s.x + 12; x++) if (((x + y) & 1) === 0) g.px(x, y, hex('#322a2c'));
          g.line(s.x - 12, s.y + 50, s.x - 15, PIT_Y - 1, walnut[0]!);
          g.line(s.x + 12, s.y + 50, s.x + 15, PIT_Y - 1, walnut[0]!);
          g.ellipseA(s.x, PIT_Y, 20, 2, ink, 0.6);
        }

        // ── the console ──
        const C = CONSOLE;
        g.rect(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0, walnut[2]!);
        g.hline(C.x0, C.x1 - 1, C.y0, walnut[3]!);
        g.rect(C.x0 - 2, C.y0 - 2, C.x1 - C.x0 + 4, 2, walnut[3]!);
        for (const gx of [C.x0 + 4, C.x1 - 30]) {
          g.rect(gx, C.y0 + 3, 26, 12, hex('#2a2224'));
          for (let x = gx; x < gx + 26; x += 2) g.vline(x, C.y0 + 3, C.y0 + 14, hex('#3a3032'));
        }
        // control panel: brushed metal, two dials, knobs, a tuning strip
        const px0 = C.x0 + 34;
        g.rect(px0, C.y0 + 2, 32, 14, hex('#8a8478'));
        g.hline(px0, px0 + 31, C.y0 + 2, hex('#c8c0b0'));
        g.rect(px0 + 2, C.y0 + 4, 28, 3, hex('#3a2a18'));
        for (const kx of [px0 + 4, px0 + 10, px0 + 22, px0 + 28]) g.disc(kx, C.y0 + 13, 1.5, hex('#2a2420'));
        // legs and the step down into the pit
        for (const lx of [C.x0 + 6, C.x1 - 6]) g.line(lx, C.y1, lx + (lx < 160 ? -3 : 3), PIT_Y - 1, walnut[0]!);
        g.ellipseA(160, PIT_Y, 64, 3, ink, 0.6);

        // ── the pit: a step down, shag carpet, a long curved sofa ──
        g.rect(g.left, PIT_Y, g.w, 4, hex('#3a2a24'));
        g.hline(g.left, g.right, PIT_Y, hex('#5a4434'));
        g.rect(g.left, PIT_Y + 4, g.w, 4, hex('#1a1210'));
        for (let y = PIT_Y + 8; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const shag = hash3(x, y, 9);
            g.px(x, y, mix(hex('#2a1a12'), hex('#4a3020'), shag * 0.6 * clamp(1 - (y - PIT_Y) / 120)));
          }
        // sofa back, seen from behind, curving across the bottom
        for (let x = g.left; x < g.right; x++) {
          const u = (x - 160) / 150;
          const cush = ((x % 38) + 38) % 38;
          const bump = Math.sin((cush / 38) * Math.PI) * 2.5;
          const top = 150 - Math.cos(u * 1.2) * 6 - bump;
          for (let y = Math.floor(top); y < g.bottom; y++) {
            const v = (y - top) / 22;
            const roll = y - top < 5 ? 0.25 * (1 - (y - top) / 5) : 0;
            g.px(x, y, mix(shade(teal, 0.5 + roll), shade(teal, 0.18), clamp(v)));
          }
          g.px(x, Math.floor(top), mix(teal, warm, 0.3));
          if (cush === 0) g.vline(x, Math.floor(top) + 1, g.bottom, shade(teal, 0.15));
        }
        // a boomerang coffee table (tall views) with a martini on it
        if (g.bottom > 200) {
          g.poly([110, 214, 160, 206, 210, 214, 200, 220, 160, 214, 120, 220], walnut[3]!);
          g.poly([110, 216, 160, 208, 210, 216, 200, 222, 160, 216, 120, 222], walnut[1]!);
          g.line(158, 196, 164, 202, hex('#c8c0c8'));
          g.line(170, 196, 164, 202, hex('#c8c0c8'));
          g.hline(158, 170, 196, hex('#e0d8e0'));
          g.vline(164, 202, 208, hex('#a8a0a8'));
          g.px(163, 199, hex('#6a9a3a'));
        }

        g.lighting(0.62);
        g.light(LAMP.x, LAMP.y, 70, 0.55);
        g.light(160, 100, 70, 0.35, 30);
        g.lightRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 0.15, 8);
        vignette(g, 0.45, 160, 88, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;

        // ── the rocket on its gantry (and, rarely, away it goes) ──
        const launch = f.rare === 0 && ev < 12 ? smoothstep(2, 12, ev) : 0;
        const ry = ROCKET.y - launch * launch * 70;
        g.clip(WIN.x0, WIN.y0, WIN.x1 - WIN.x0 + 1, WIN.y1 - WIN.y0 - 4);
        g.rect(ROCKET.x - 1, ry - 12, 3, 12, hex('#c8c0c8'));
        g.px(ROCKET.x, ry - 13, hex('#e8e0e8'));
        g.px(ROCKET.x - 2, ry - 2, hex('#a03040'));
        g.px(ROCKET.x + 2, ry - 2, hex('#a03040'));
        if (f.rare === 0 && ev < 12 && ev > 1) {
          const k = envelope(ev, 12, 1, 2);
          g.glow(ROCKET.x, ry + 2, 6 + launch * 4, amber, 0.6 * k * flicker(t, 2, 12));
          for (let i = 0; i < 24; i++) g.pxA(ROCKET.x + Math.sin(i * 1.7 + ev) * (i * 0.15), ry + 2 + i * 2, hex('#d8c8d0'), 0.4 * k * (1 - i / 24));
        }
        const blink = Math.floor(t * 0.8) % 2 === 0 && launch === 0;
        if (blink) g.glow(ROCKET.x, ry - 14, 3, hex('#ff4040'), 0.6);
        g.noClip();

        // ── the stereo demonstration: left, right, left ──
        const side = f.beat % 2;
        const push = f.reduced ? 0 : f.pulse * awake;
        for (let i = 0; i < 2; i++) {
          const s = SPK[i]!;
          const p = i === side ? push : push * 0.08;
          cone(g, s.x, s.y + 30, 10, p);
          cone(g, s.x, s.y + 6, 5, p * 0.6);
          g.disc(s.x, s.y - 4, 2, mix(hex('#2a2420'), warm, 0.2 + p * 0.3));
          // a ring of sound leaving the busy speaker
          if (p > 0.15) {
            const r = 12 + (1 - f.pulse) * 10;
            for (let a = -0.9; a <= 0.9; a += 0.08) {
              const dir = i === 0 ? 1 : -1;
              g.pxAdd(s.x + dir * Math.cos(a) * r, s.y + 30 + Math.sin(a) * r, pink, 0.25 * p);
            }
          }
        }
        // Rare: a bongo travels across the room to the LEFT speaker.
        if (f.rare === 1 && ev < 12) {
          const p = smoothstep(1, 9, ev);
          const x = SPK[1]!.x - p * (SPK[1]!.x - SPK[0]!.x);
          const y = 82 - Math.sin(p * Math.PI) * 16;
          const k = envelope(ev, 12, 1, 2);
          for (let k2 = 0; k2 < 3; k2++) {
            const r = 3 + k2 * 2 + Math.sin(ev * 6) * 0.5;
            g.ring(x, y, r, r, mix(hex('#3a2028'), pink, 0.6 * k * (1 - k2 * 0.25)));
          }
          g.glow(x, y, 8, pink, 0.2 * k);
        }

        // ── the console: dials glowing, needles following their own speaker ──
        const C = CONSOLE;
        const px0 = C.x0 + 34;
        g.rect(px0 + 3, C.y0 + 4, 12, 3, mix(hex('#5a3a18'), amber, 0.5 + 0.2 * awake));
        g.rect(px0 + 17, C.y0 + 4, 12, 3, mix(hex('#5a3a18'), amber, 0.5 + 0.2 * awake));
        for (let i = 0; i < 2; i++) {
          const lvl = clamp((i === side ? 0.4 + push * 0.6 : 0.25) * (0.5 + e) * awake);
          const nx = px0 + 4 + i * 14 + Math.round(lvl * 9);
          g.vline(nx, C.y0 + 4, C.y0 + 6, hex('#1a0a08'));
        }
        g.glow(px0 + 16, C.y0 + 5, 18, amber, 0.12 + 0.06 * awake);
        g.px(px0 + 28, C.y0 + 9, f.playing ? pink : hex('#3a2028'));

        // ── the sputnik lamp: a ball with arms tipped in bulbs ──
        const L = LAMP;
        g.ball(L.x, L.y, 4, 4, [hex('#3a3a40'), hex('#8a8a90'), hex('#d8d8e0')], -0.4, -0.5, 0.3);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + 0.2;
          const r = k % 2 ? 11 : 9;
          const bx = L.x + Math.cos(a) * r;
          const by = L.y + Math.sin(a) * r * 0.8;
          g.line(L.x, L.y, bx, by, hex('#8a8a90'));
          g.px(bx, by, hex('#fff2d8'));
          g.glow(bx, by, 4, warm, 0.18);
        }
        g.glow(L.x, L.y, 30, warm, 0.08, 5);

        // Rare: the record changer drops a fresh record (a glint lifts and settles).
        if (f.rare === 2 && ev < 12) {
          const k = envelope(ev, 12, 1, 2);
          const y = C.y0 - 3 - (1 - smoothstep(3, 6, ev)) * 4;
          g.hline(C.x0 + 42, C.x0 + 58, y, mix(hex('#1a1414'), warm, 0.4 * k));
        }
        void (null as unknown as Color);
      },
    };
  },
};

export default def;

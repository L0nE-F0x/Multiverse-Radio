// Cat FM: a small radio studio that a cat has taken over. It lounges across the mixing desk
// with one paw on a fader; papers lie knocked on the floor; a mug waits at the very edge.
// Late sun comes through the blinds, and a patch of it creeps slowly across the carpet.

import { hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope, smoothstep } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { motes, vignette } from './lib/night';

const WIN = { x: 14, y: 22, w: 64, h: 56 };
const DESK = { x0: 94, x1: 304, top: 100, front: 112, floor: 128 };
const CAT = { x: 200, y: 94 };
const MUG = { x: 99, y: 99 };
const FADER_X = 152;

const def: SceneDef = {
  id: 'cat-studio',
  fps: 15,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 9,
  create({ accent }) {
    const ink = hex('#07080b');
    const wall = hex('#141821');
    const foam = [hex('#11141c'), hex('#151923'), hex('#1a1e29')];
    const carpet = [hex('#14121a'), hex('#1a1720'), hex('#211d27')];
    const sun = mix(accent, hex('#ffd8a0'), 0.5);
    const sunD = shade(sun, 0.55);
    const ginger = mix(accent, hex('#3a2014'), 0.3);
    const gingerD = mix(shade(accent, 0.5), hex('#3a1a10'), 0.3);
    const gingerL = mix(accent, hex('#ffe0b8'), 0.15);
    const cream = hex('#c8b8a0');
    const deskC = { top: hex('#22252c'), front: hex('#16181e'), edge: hex('#3a3e48') };
    const red = hex('#ff3a2a');

    /** Is (x, y) on the wall/desk lit through a gap in the blinds? */
    const slat = (x: number, y: number) => {
      // light comes down and to the right at about 35°
      const v = y - (x - WIN.x) * 0.55;
      return ((v % 7) + 7) % 7 < 4.5 ? 1 : 0;
    };

    const drawCat = (g: Gfx, t: number, f: { awake: number; reduced: boolean; rare: number; rareT: number }, fader: number, headLift: number, look: number, yawn: number) => {
      const { x, y } = CAT;
      const breathe = Math.sin(t * 1.1) > 0 ? 1 : 0;
      // tail over the front edge, the tip twitching
      const twitch = f.reduced ? 0 : Math.sin(t * 3.1) * (Math.sin(t * 0.4) > 0.2 ? 2.5 : 0.6);
      let px = x + 28;
      let py = y + 4;
      for (let i = 1; i <= 16; i++) {
        const u = i / 16;
        const nx = x + 30 + Math.sin(u * 2.4) * 6 + (u > 0.65 ? twitch * (u - 0.65) * 4 : 0);
        const ny = y + 4 + u * 30;
        g.line(px - 1, py, nx - 1, ny, ink);
        g.line(px + 3, py, nx + 3, ny, ink);
        g.line(px, py, nx, ny, ginger);
        g.line(px + 1, py, nx + 1, ny, i > 13 ? gingerL : ginger);
        g.line(px + 2, py, nx + 2, ny, gingerD);
        if (i % 3 === 0) g.hline(nx, nx + 2, ny, gingerD);
        px = nx;
        py = ny;
      }
      // body: a long loaf, sprawled along the desk
      g.ellipse(x, y, 32, 11 + breathe, ink);
      g.ellipse(x, y, 31, 10 + breathe, ginger);
      g.ellipse(x + 3, y - 5, 25, 4, gingerL);
      g.ellipse(x + 2, y + 6, 26, 3, gingerD);
      for (let i = 0; i < 8; i++) {
        const sx = x - 18 + i * 6;
        g.line(sx, y - 9 - breathe, sx + 3, y + 2, gingerD);
        g.line(sx + 1, y - 9 - breathe, sx + 4, y - 2, gingerD);
      }
      // hind leg tucked
      g.ellipse(x + 21, y + 5, 8, 5, ink);
      g.ellipse(x + 21, y + 5, 7, 4, gingerD);
      g.ellipse(x + 26, y + 8, 3, 2, cream);
      // front leg reaching out to rest on a fader
      const pawX = FADER_X;
      const pawY = DESK.top + 2 - Math.round(fader * 5);
      for (let k = -2; k <= 2; k++) g.line(x - 20, y + 3 + k, pawX + 3, pawY + k * 0.5, k === -2 || k === 2 ? ink : k === -1 ? gingerL : ginger);
      g.ellipse(pawX, pawY, 4, 3, ink);
      g.ellipse(pawX, pawY, 3, 2, cream);
      // head resting at the left end (lifts to look around)
      const hx = x - 31 + look;
      const hy = y - 4 - Math.round(headLift * 6);
      g.ellipse(hx, hy, 11, 9, ink);
      g.ellipse(hx, hy, 10, 8, ginger);
      g.ellipse(hx - 1, hy + 3, 6, 4, gingerL);
      g.ellipse(hx, hy + 5, 4, 2, cream);
      g.tri(hx - 10, hy - 3, hx - 3, hy - 7, hx - 8, hy - 16, ink);
      g.tri(hx - 9, hy - 4, hx - 4, hy - 7, hx - 7, hy - 14, ginger);
      g.tri(hx + 3, hy - 7, hx + 10, hy - 3, hx + 8, hy - 16, ink);
      g.tri(hx + 4, hy - 7, hx + 9, hy - 4, hx + 7, hy - 14, ginger);
      g.tri(hx - 8, hy - 6, hx - 5, hy - 7, hx - 7, hy - 11, hex('#c8847a'));
      g.tri(hx + 5, hy - 7, hx + 8, hy - 6, hx + 7, hy - 11, hex('#c8847a'));
      for (const s of [-3, 0, 3]) g.line(hx + s, hy - 8, hx + s * 0.6, hy - 4, gingerD);
      // eyes: slits mostly; open when something is worth it
      const open = clamp(headLift * 1.2 + (f.rare === 0 && f.rareT < 9 ? 1 : 0)) * (blinking(t, 9) ? 0 : 1);
      for (const s of [-1, 1]) {
        const ex = hx + s * 4;
        const ey = hy;
        if (open > 0.5) {
          g.rect(ex - 1, ey - 1, 3, 3, hex('#b8c850'));
          g.vline(ex, ey - 1, ey + 1, ink);
        } else {
          g.hline(ex - 2, ex + 1, ey, ink);
          g.px(ex + (s > 0 ? 2 : -2), ey - 1, ink);
        }
      }
      g.rect(hx - 1, hy + 2, 2, 1, hex('#b86a6a'));
      if (yawn > 0) {
        g.ellipse(hx, hy + 5, 3, Math.round(1 + yawn * 3), ink);
        g.ellipse(hx, hy + 6 + Math.round(yawn), 1, 1, hex('#c86a6a'));
      } else g.hline(hx - 2, hx + 1, hy + 5, gingerD);
      g.lineA(hx - 4, hy + 4, hx - 15, hy + 2, cream, 0.5);
      g.lineA(hx - 4, hy + 5, hx - 14, hy + 6, cream, 0.4);
      g.lineA(hx + 4, hy + 4, hx + 15, hy + 2, cream, 0.5);
      g.lineA(hx + 4, hy + 5, hx + 14, hy + 6, cream, 0.4);
      void bayer;
    };

    return {
      background(g) {
        // Wall of acoustic foam; plain plaster toward the window.
        for (let y = g.top; y < DESK.floor; y++)
          for (let x = g.left; x < g.right; x++) {
            if (x < 90) {
              g.px(x, y, wall);
              continue;
            }
            const cx = (x - 90) % 10;
            const cy = ((y % 10) + 10) % 10;
            const d = Math.abs(cx - 4.5) + Math.abs(cy - 4.5);
            const lit = cx < cy ? 1 : 0;
            g.px(x, y, d > 8.4 ? foam[0]! : lit ? foam[2]! : foam[1]!);
          }
        g.vline(89, g.top, DESK.floor, ink);
        // Window with venetian blinds; low sun behind.
        const { x, y, w, h } = WIN;
        g.rect(x - 3, y - 3, w + 6, h + 6, hex('#2a2c34'));
        g.gradRect(x, y, w, h, [hex('#ffd8a0'), mix(accent, hex('#ffb070'), 0.5), hex('#c86a3a')]);
        for (let yy = y; yy < y + h; yy += 4) {
          g.rect(x, yy + 2, w, 2, hex('#3a3238'));
          g.hline(x, x + w - 1, yy + 2, hex('#5a4a48'));
        }
        g.vline(x + w / 2, y, y + h, hex('#2a2c34'));
        g.rect(x - 5, y + h + 2, w + 10, 3, hex('#2e3038'));
        g.glow(x + w / 2, y + h / 2, 70, sun, 0.12, 6);
        // a plant on the sill, silhouetted
        g.rect(x + 6, y + h - 6, 8, 8, hex('#2a1e1a'));
        for (let i = 0; i < 7; i++) g.line(x + 10, y + h - 6, x + 3 + i * 2.4, y + h - 18 - (i % 3) * 4, hex('#141a12'));

        // Sun through the blinds: stripes laid across wall and floor.
        for (let yy = y; yy < DESK.floor + 40; yy++)
          for (let xx = x + w; xx < 300; xx++) {
            const dx = xx - (x + w);
            const reach = yy - y - dx * 0.35;
            if (reach < 0 || reach > h + 20) continue;
            if (!slat(xx, yy)) continue;
            const k = 0.13 * (1 - dx / 210) * (1 - reach / (h + 30));
            if (k > 0) g.pxAdd(xx, yy, sun, k);
          }

        // ON AIR light (lit per frame) and a clock.
        roundRect(g, 146, 30, 30, 10, 2, ink);
        g.rect(147, 31, 28, 8, hex('#2a0c0c'));
        g.text('ON AIR', 149, 33, hex('#4a1a1a'));
        g.disc(262, 38, 9, ink);
        g.disc(262, 38, 8, hex('#8a8478'));
        g.line(262, 38, 262, 32, ink);
        g.line(262, 38, 266, 40, ink);

        // Carpet.
        for (let yy = DESK.floor; yy < g.bottom; yy++)
          for (let xx = g.left; xx < g.right; xx++) g.px(xx, yy, carpet[hash3(xx, yy, 4) < 0.2 ? 2 : hash3(xx >> 1, yy, 5) < 0.5 ? 1 : 0]!);
        g.rect(g.left, DESK.floor, g.w, 1, hex('#0a090c'));

        // Papers knocked to the floor.
        const paper = (px: number, py: number, wpx: number, tilt: number) => {
          g.poly([px, py, px + wpx, py + tilt, px + wpx - 2, py + 6 + tilt, px - 2, py + 6], hex('#8a8478'));
          g.hline(px + 1, px + wpx - 4, py + 2 + Math.round(tilt / 2), hex('#5a564e'));
          g.hline(px + 1, px + wpx - 6, py + 4 + Math.round(tilt / 2), hex('#5a564e'));
        };
        paper(112, 134, 18, 2);
        paper(138, 140, 16, -2);
        paper(166, 132, 17, 1);
        paper(84, 144, 15, 3);

        // The mixing desk: sloped top, faders, a meter bridge.
        const D = DESK;
        g.rect(D.x0, D.front, D.x1 - D.x0, D.floor - D.front, deskC.front);
        g.poly([D.x0 + 4, D.top, D.x1 - 4, D.top, D.x1, D.front, D.x0, D.front], deskC.top);
        g.hline(D.x0 + 4, D.x1 - 4, D.top, deskC.edge);
        g.hline(D.x0, D.x1, D.front, deskC.edge);
        g.rect(D.x0 + 4, D.floor - 2, 4, 2, ink);
        g.rect(D.x1 - 8, D.floor - 2, 4, 2, ink);
        for (let i = 0; i < 20; i++) {
          const fx = D.x0 + 16 + i * 9;
          g.vline(fx, D.top + 2, D.front - 2, ink);
          g.disc(fx, D.top - 0, 1, hex('#4a4e58'));
        }
        g.rect(D.x0 + 12, D.top - 18, 180, 15, ink);
        g.rect(D.x0 + 13, D.top - 17, 178, 13, hex('#121418'));
        g.hline(D.x0 + 12, D.x0 + 191, D.top - 18, deskC.edge);
        // a mic on a boom arm from the right
        g.line(320, 20, 280, 50, hex('#2a2c34'));
        g.line(320, 21, 280, 51, hex('#2a2c34'));
        g.line(280, 50, 266, 62, hex('#2a2c34'));
        roundRect(g, 258, 60, 12, 17, 5, hex('#1a1c22'));
        g.vline(261, 63, 74, hex('#3a3e48'));

        vignette(g, 0.55, 170, 90, 220, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;

        // The patch of sun creeping across the carpet.
        const span = 150;
        const cp = ((t * 0.12 + 70) % span) / span;
        const px0 = 60 + cp * span;
        const pk = Math.sin(cp * Math.PI) * 0.3;
        for (let yy = DESK.floor + 3; yy < DESK.floor + 36; yy++) {
          const row = yy - DESK.floor;
          const xl = px0 + row * 0.9;
          for (let xx = Math.floor(xl); xx < xl + 46; xx++) if (slat(xx, yy * 1.4)) g.pxAdd(xx, yy, sun, pk);
        }

        // ON AIR, while on air.
        const onAir = awake * (f.rare === 1 && ev < 9 ? (Math.floor(ev * 6) % 2 ? 1 : 0.3) : 1);
        g.text('ON AIR', 149, 33, mix(hex('#4a1a1a'), red, onAir));
        g.glow(161, 35, 20, red, 0.25 * onAir);

        // Fader position: the paw rests on it; the cat pushes it up in one rare moment.
        let fader = 0.2 + e * 0.15;
        if (f.rare === 1 && ev < 9) fader = envelope(ev, 9, 1.5, 2);
        // Meter bridge: two LED bars and a row of small meters.
        const level = clamp(e * 1.2 * awake + (f.rare === 1 && ev < 9 ? fader * 0.8 : 0) + (f.rare === 3 && ev > 3 && ev < 5 ? 0.7 : 0));
        for (let ch = 0; ch < 2; ch++) {
          const lv = clamp(level - ch * 0.06 + Math.sin(t * 7 + ch) * 0.03);
          for (let i = 0; i < 24; i++) {
            const on = i / 24 < lv;
            const c = i > 20 ? red : i > 16 ? hex('#e8b040') : hex('#4aa868');
            g.rect(DESK.x0 + 18 + i * 3, DESK.top - 14 + ch * 4, 2, 2, on ? c : shade(c, 0.16));
          }
        }
        if (level > 0.85) g.glow(DESK.x0 + 75, DESK.top - 12, 18, red, 0.2);

        // Dust turning in the sunbeams.
        motes(g, t, 96, 26, 130, 80, 30, sun, 0.5, 6, 0.4, slatLit);

        // A spot of reflected light dances on the wall (rare); the cat tracks it.
        let look = 0;
        let lift = clamp(1 - awake) * 0;
        if (f.rare === 2 && ev < 9) {
          const p = ev / 9;
          const sx = 120 + Math.sin(p * 9) * 40 + p * 60;
          const sy = 56 + Math.cos(p * 13) * 14;
          g.disc(sx, sy, 2, mix(sun, hex('#ffffff'), 0.5));
          g.glow(sx, sy, 6, sun, 0.5);
          look = Math.round(clamp((sx - (CAT.x - 31)) / 20, -2, 2));
          lift = envelope(ev, 9, 0.6, 1);
        }
        if (f.rare === 0 && ev < 9) lift = envelope(ev, 9, 0.8, 1) * 0.6;
        const yawn = f.rare === 3 && ev < 9 ? envelope(ev - 2.5, 3, 0.6, 0.8) : 0;
        if (f.rare === 3 && ev < 9) lift = Math.max(lift, envelope(ev - 2, 4, 0.8, 0.8) * 0.5);

        // The mug, exactly at the edge (pushed off in a rare moment).
        let mx = MUG.x;
        let my = MUG.y;
        let mugA = 1;
        if (f.rare === 0 && ev < 9) {
          if (ev > 2.5) mx -= Math.min(5, (ev - 2.5) * 2.5);
          if (ev > 4.5) {
            const fall = ev - 4.5;
            my += Math.min(DESK.floor + 6 - MUG.y, 60 * fall * fall);
            mx -= fall * 6;
          }
          if (ev > 6.5) mugA = 0;
          if (ev > 7.5) {
            mugA = smoothstep(7.5, 8.8, ev);
            mx = MUG.x;
            my = MUG.y;
          }
          if (ev > 5.1 && ev < 7) {
            for (let i = 0; i < 6; i++) g.px(MUG.x - 18 + hash3(i, 1) * 14, DESK.floor + 6 - (ev - 5.1) * hash3(i, 2) * 10, hex('#c8c0b0'));
            g.ellipseA(MUG.x - 14, DESK.floor + 8, 7, 2, hex('#3a2418'), 0.8);
          }
        }
        if (mugA > 0) {
          g.rectA(mx - 4, my - 9, 9, 9, hex('#c8c0b0'), mugA);
          g.rectA(mx - 4, my - 9, 9, 1, hex('#3a2418'), mugA);
          g.rectA(mx + 5, my - 7, 2, 4, hex('#c8c0b0'), mugA);
          g.rectA(mx + 1, my - 8, 3, 7, hex('#e8e0d0'), mugA * 0.6);
          g.rectA(mx - 2, my - 6, 4, 3, mix(accent, hex('#c8c0b0'), 0.4), mugA);
        }

        // ── the cat ──
        drawCat(g, t, f, fader, lift, look, yawn);
        if (awake < 0.5) {
          for (let i = 0; i < 2; i++) {
            const p = (t * 0.2 + i / 2) % 1;
            g.text('z', CAT.x - 40 - p * 6, CAT.y - 22 - p * 14, mix(hex('#c8c0b0'), wall, p));
          }
        }
        // sun striping across the cat and desk
        for (let yy = DESK.top - 22; yy < DESK.front + 4; yy++)
          for (let xx = 140; xx < 250; xx += 1) if (slat(xx, yy) && (xx + yy) % 2 === 0) g.pxAdd(xx, yy, sunD, 0.06);
      },
    };
  },
};

/** Brightness of a dust mote: only visible inside the sunbeams. */
function slatLit(x: number, y: number): number {
  const dx = x - 94;
  const reach = y - 22 - dx * 0.35;
  if (reach < 0 || reach > 82) return 0;
  const v = y - (x - 18) * 0.55;
  return ((v % 7) + 7) % 7 < 4.5 ? 1 : 0.15;
}

export default def;

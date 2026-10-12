// Oddity: an atomic clock alone in a vault. A ball of cold atoms is tossed up the glass fountain
// and falls back once a second; nixie tubes show the listener's real local time; six lamps light
// with the pips at the top of every minute.
// Rare events: a leap second (everything holds still at :60); a moth lands on the glass; a guard's
// torch looks in through the door and the wheel turns a little; the atoms fall into a perfect ring.

import { hex, mix } from '../kit/color';
import { TAU, clamp, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { hazeBand, vignette } from './deep-kit';

const TUBE = { x: 146, top: 32, bot: 104, r: 11 };
const NIX = { x: 190, y: 76 }; // readout cabinet top-left
const DOOR = { x: 62, y: 72, r: 34 };
const FLOOR = 122;

// Nixie numerals, 3×5.
const DIG = ['###/#.#/#.#/#.#/###', '.#./##./.#./.#./###', '##./..#/.#./#../###', '##./..#/.#./..#/##.', '#.#/#.#/###/..#/..#', '###/#../##./..#/##.', '.##/#../###/#.#/###', '###/..#/.#./.#./.#.', '###/#.#/###/#.#/###', '###/#.#/###/..#/##.'];

const def: SceneDef = {
  id: 'oddity-clock',
  fps: 15,
  focusY: 80,
  rareEvents: 4,
  rareDuration: 8,
  create() {
    const ink = hex('#030406');
    const steel = [hex('#07090c'), hex('#0d1116'), hex('#141a21'), hex('#1e252e'), hex('#2c3540')];
    const cold = hex('#7ab8ff');
    const atomC = hex('#b8e0ff');
    const nixie = hex('#ff8a3a');
    const nixieHot = hex('#ffd0a0');
    const brass = [hex('#2a2010'), hex('#5a4422'), hex('#8a6a3a')];
    const tz = new Date().getTimezoneOffset() * 60;

    const digit = (g: Gfx, d: number, x: number, y: number, k: number) => {
      // the unlit cathodes stacked behind, then the lit one
      const ghost = mix(hex('#1a0c06'), nixie, 0.12);
      g.rect(x, y, 3, 5, hex('#0c0604'));
      const pat8 = DIG[8]!.split('/');
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (pat8[yy]![xx] === '#') g.px(x + xx, y + yy, ghost);
      if (d < 0) return;
      const pat = DIG[d]!.split('/');
      const c = mix(nixie, nixieHot, 0.4);
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (pat[yy]![xx] === '#') g.px(x + xx, y + yy, mix(ghost, c, k));
    };

    return {
      background(g) {
        // ── the vault: steel plate walls, riveted, ceiling beams ──
        for (let y = g.top; y < FLOOR; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 30, y / 20, 5, 3);
            const v = 0.35 + n * 0.3 - Math.abs(x - 160) / 600 + (y < 20 ? -0.1 : 0);
            g.px(x, y, steel[Math.max(0, Math.min(4, Math.floor(v * 4 + hash3(x, y, 1) * 0.6)))]!);
          }
        for (let x = g.left - (((g.left % 40) + 40) % 40); x < g.right; x += 40) {
          g.vline(x, g.top, FLOOR, ink);
          g.vline(x + 1, g.top, FLOOR, steel[3]!);
          for (let y = g.top + 4; y < FLOOR; y += 8) {
            g.px(x - 3, y, steel[4]!);
            g.px(x + 4, y, steel[4]!);
          }
        }
        for (let y = 24; y > g.top; y -= 30) {
          g.hline(g.left, g.right, y, ink);
          g.hline(g.left, g.right, y + 1, steel[3]!);
        }
        // ceiling: a beam, a caged lamp (dim red), conduit
        g.rect(g.left, 10, g.w, 6, steel[1]!);
        g.hline(g.left, g.right, 16, steel[3]!);
        g.rect(g.left, -12, g.w, 3, steel[2]!);
        // the floor: a grating, cables to the plinth
        g.vgrad([steel[2]!, steel[1]!, steel[0]!], FLOOR, g.bottom, FLOOR);
        for (let y = FLOOR + 2; y < g.bottom; y += 4) g.hline(g.left, g.right, y, ink);
        for (let i = -10; i < 20; i++) g.line(160 + i * 12, FLOOR, 160 + i * 30, g.bottom + 40, ink);
        g.hline(g.left, g.right, FLOOR, steel[4]!);

        // ── the vault door, back left: a great disc, bolts, a spoked wheel, a little window ──
        const { x, y, r } = DOOR;
        g.disc(x, y, r + 3, ink);
        g.ball(x, y, r, r, [steel[0]!, steel[1]!, steel[2]!, steel[3]!, steel[4]!], -0.5, -0.6, 0.1);
        g.ring(x, y, r - 4, r - 4, steel[1]!);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          g.disc(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2), 1, steel[4]!);
        }
        g.rect(x - 5, y - 24, 10, 7, ink); // the window
        g.rect(x - 4, y - 23, 8, 5, hex('#0a1018'));
        // hinge block
        g.rect(x + r - 2, y - 10, 8, 20, steel[2]!);

        // ── the plinth and the fountain's frame ──
        const { x: tx, top, bot, r: tr } = TUBE;
        roundRect(g, tx - 26, bot, 52, FLOOR - bot, 2, steel[2]!);
        g.hline(tx - 26, tx + 25, bot, steel[4]!);
        g.rect(tx - 10, bot + 6, 20, 5, brass[1]!);
        g.text('No.1', tx - 7, bot + 6, brass[0]!);
        // the base and cap of the fountain
        g.rect(tx - tr - 4, bot - 6, tr * 2 + 9, 6, steel[3]!);
        g.rect(tx - tr - 4, top - 6, tr * 2 + 9, 6, steel[3]!);
        g.hline(tx - tr - 4, tx + tr + 4, top - 6, steel[4]!);
        // the glass: dark, with reflections; coils around it
        for (let yy = top; yy < bot - 6; yy++) {
          g.rect(tx - tr, yy, tr * 2 + 1, 1, hex('#08121c'));
          g.px(tx - tr, yy, hex('#2a4058'));
          g.px(tx - tr + 2, yy, hex('#1e3448'));
          g.px(tx + tr - 2, yy, hex('#14243a'));
          g.px(tx + tr, yy, hex('#22384e'));
        }
        for (let k = 0; k < 3; k++) {
          const cy = top + 10 + k * 22;
          g.rect(tx - tr - 3, cy, tr * 2 + 7, 5, brass[1]!);
          g.hline(tx - tr - 3, tx + tr + 3, cy, brass[2]!);
          g.hline(tx - tr - 3, tx + tr + 3, cy + 4, brass[0]!);
          for (let xx = tx - tr - 2; xx < tx + tr + 3; xx += 2) g.vline(xx, cy + 1, cy + 3, brass[0]!);
        }
        // pipes and cables away to the side
        g.rect(tx + 26, FLOOR - 6, 30, 2, steel[1]!);
        for (let xx = tx + 20; xx < NIX.x; xx++) g.px(xx, FLOOR - 2 + Math.round(Math.sin(xx * 0.3)), ink);
        g.line(tx - tr - 4, top - 4, tx - 40, 10, steel[3]!);
        g.line(tx + tr + 4, top - 4, tx + 40, 10, steel[3]!);

        // ── the readout cabinet ──
        roundRect(g, NIX.x - 4, NIX.y - 6, 64, 46, 2, steel[2]!);
        g.hline(NIX.x - 4, NIX.x + 59, NIX.y - 6, steel[4]!);
        g.rect(NIX.x - 1, NIX.y - 2, 58, 14, ink);
        g.rect(NIX.x - 4, NIX.y + 40, 64, FLOOR - NIX.y - 40, steel[1]!);
        g.text('LOCAL', NIX.x + 18, NIX.y + 14, steel[4]!);

        hazeBand(g, 20, FLOOR, hex('#1a2a3a'), 0.12, 0.04);
        vignette(g, 0.55, 160, 76);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 8;

        // real local time, to the second
        const now = Date.now() / 1000 - tz;
        let sec = Math.floor(now % 60);
        const min = Math.floor(now / 60) % 60;
        const hr = Math.floor(now / 3600) % 24;
        let frac = now % 1;
        // a leap second (rare 0): :60, and everything holds still
        const hold = R(0) && ev > 1.5 && ev < 3.5;
        if (hold) {
          sec = 60;
          frac = 0.42;
        }
        if (f.reduced) frac = 0.5;
        const { x: tx, top, bot, r: tr } = TUBE;

        // ── the atoms: tossed up the fountain once a second ──
        const base = bot - 10;
        const height = bot - top - 18;
        const p = frac;
        const ay = base - height * 4 * p * (1 - p);
        const ring = R(3) && ev > 2 && ev < 6 ? smoothstep(2, 3, ev) * (1 - smoothstep(5, 6, ev)) : 0;
        // the probe laser, faint, straight up the middle
        for (let yy = top; yy < bot - 6; yy += 1) g.pxAdd(tx, yy, hex('#4a3aff'), 0.08 + 0.05 * Math.sin(yy * 0.5 + t * 6));
        const spread = 2 + p * 2;
        for (let i = 0; i < 26; i++) {
          let ax = tx + (hash3(i, 1) - 0.5) * spread * 2;
          let yy = ay + (hash3(i, 2) - 0.5) * spread * 2;
          if (ring > 0) {
            const a = (i / 26) * TAU;
            ax = ax + (tx + Math.cos(a) * 6 - ax) * ring;
            yy = yy + (top + 30 + Math.sin(a) * 6 - yy) * ring;
          }
          g.pxAdd(ax, yy, atomC, 0.7);
        }
        g.glow(tx, ay, 7, cold, 0.4, 4);
        // the glass glows faintly with it; light on the plinth
        g.glow(tx, (top + bot) / 2, 34, cold, 0.06, 4);
        g.rectAdd(tx - 26, bot, 52, 2, cold, 0.06);

        // ── the readout: HH:MM:SS in nixie tubes ──
        const ds = [Math.floor(hr / 10), hr % 10, -2, Math.floor(min / 10), min % 10, -2, Math.floor(sec / 10), sec % 10];
        let xx = NIX.x + 2;
        const k = 0.75 + 0.25 * f.awake;
        for (const d of ds) {
          if (d === -2) {
            const on = frac < 0.5 || f.reduced || hold ? 1 : 0.3;
            g.px(xx, NIX.y + 2, mix(hex('#1a0c06'), nixie, on * k));
            g.px(xx, NIX.y + 6, mix(hex('#1a0c06'), nixie, on * k));
            xx += 3;
            continue;
          }
          g.rect(xx - 1, NIX.y - 1, 5, 9, hex('#140a06'));
          digit(g, d, xx, NIX.y + 1, k);
          xx += 7;
        }
        g.glow(NIX.x + 28, NIX.y + 4, 30, nixie, 0.12 * k, 4);
        // the pips: five short at :55–:59, one long at :00
        let pip = -1;
        let pipOn = 0;
        if (sec >= 55 && sec <= 59 && frac < 0.1) {
          pip = sec - 55;
          pipOn = 1;
        } else if (sec === 0 && frac < 0.5) {
          pip = 5;
          pipOn = 1;
        }
        for (let i = 0; i < 6; i++) {
          const lx = NIX.x + 8 + i * 8;
          const ly = NIX.y + 26;
          const on = i === pip ? pipOn : 0;
          g.disc(lx, ly, 2, mix(hex('#0a1418'), i === 5 ? hex('#a8ffc8') : hex('#c8e8ff'), 0.15 + on * 0.85));
          if (on) g.glow(lx, ly, 10, i === 5 ? hex('#a8ffc8') : hex('#c8e8ff'), f.reduced ? 0.25 : 0.6);
        }
        if (pipOn && !f.reduced) g.rectAdd(g.left, g.top, g.w, g.h, hex('#1a2a3a'), 0.06);
        // a small second-tick lamp on the plinth
        g.px(tx + 18, bot + 8, frac < 0.12 ? hex('#ff4a3a') : hex('#3a0a08'));

        // the red caged lamp over the door, steady; the guard's torch (rare 2)
        g.glow(DOOR.x, 18, 10, hex('#ff3a2a'), 0.25, 4);
        g.rect(DOOR.x - 2, 16, 5, 3, hex('#8a1a14'));
        if (R(2)) {
          const a = smoothstep(1, 2, ev) * (1 - smoothstep(6, 7, ev));
          const sx = Math.sin(ev * 1.3) * 3;
          g.rect(DOOR.x - 4, DOOR.y - 23, 8, 5, mix(hex('#0a1018'), hex('#fff2d0'), a * 0.8));
          g.tri(DOOR.x + sx, DOOR.y - 20, DOOR.x + 80 + sx * 10, FLOOR, DOOR.x + 130 + sx * 10, FLOOR, hex('#fff2d0'), 2, a * (f.reduced ? 0.05 : 0.09));
        }
        // the door wheel: turns a few degrees during rare 2
        const wa = R(2) ? smoothstep(3.5, 5, ev) * 0.35 : 0;
        const wc = steel[4]!;
        for (let i = 0; i < 6; i++) {
          const a = wa + (i / 6) * TAU;
          g.line(DOOR.x, DOOR.y + 4, DOOR.x + Math.cos(a) * 13, DOOR.y + 4 + Math.sin(a) * 13, wc);
          g.disc(DOOR.x + Math.cos(a) * 13, DOOR.y + 4 + Math.sin(a) * 13, 1.5, wc);
        }
        g.ring(DOOR.x, DOOR.y + 4, 9, 9, steel[3]!);
        g.disc(DOOR.x, DOOR.y + 4, 3, steel[3]!);

        // the moth on the glass (rare 1)
        if (R(1)) {
          let mx: number;
          let my: number;
          if (ev < 2) {
            const q = ev / 2;
            mx = 260 - q * (260 - tx - tr);
            my = 30 + Math.sin(q * 9) * 6 + q * 30;
          } else if (ev < 6) {
            mx = tx + tr - 1;
            my = 60 + (ev - 2) * 3;
          } else {
            const q = (ev - 6) / 2;
            mx = tx + tr + q * 120;
            my = 72 - q * 50 + Math.sin(q * 9) * 5;
          }
          const fl = ev > 2 && ev < 6 ? 0 : Math.sin(t * 40) > 0 ? 1 : 0;
          g.px(mx, my, hex('#5a5048'));
          g.px(mx - 1, my - fl, hex('#7a6a5a'));
          g.px(mx + 1, my - fl, hex('#7a6a5a'));
          g.px(mx, my + 1, hex('#3a3430'));
        }

        // dust hanging in the cold light (still, during the leap second)
        const dt = hold ? 0 : t;
        for (let i = 0; i < 10; i++) {
          const q = (dt * 0.015 + hash3(i, 7)) % 1;
          const dx = tx - 40 + hash3(i, 8) * 80 + Math.sin(dt * 0.3 + i) * 3;
          g.pxA(dx, FLOOR - 10 - q * 80, hex('#a8c8e8'), 0.3 * Math.sin(q * Math.PI) * clamp(1 - Math.abs(dx - tx) / 50));
        }
      },
    };
  },
};

export default def;

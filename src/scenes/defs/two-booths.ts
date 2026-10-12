// Dimension Hop: two podcast booths in different realities joined by a glowing rift. On the
// right everything, including the host's coffee, is gently upside-down. They wave.

import { type Color, hex, mix, shade } from '../kit/color';
import { blinking, envelope, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3, noise1 } from '../kit/rng';
import { arc, frameRect, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const RIFT = 160;
const DESK_Y = 122;

interface Look {
  wall: Color[];
  foam: Color[];
  desk: Color[];
  skin: Color;
  hair: Color;
  top: Color;
  phones: Color;
  mug: Color;
}

const def: SceneDef = {
  id: 'two-booths',
  fps: 20,
  rareEvents: 3,
  rareDuration: 6,
  create({ accent }) {
    const ink = hex('#0c0a10');
    const A: Look = {
      wall: [hex('#2a1a14'), hex('#3a2418')],
      foam: [hex('#5a2e1e'), hex('#8a4a2a'), hex('#b0663a')],
      desk: [hex('#3a2414'), hex('#6a4024'), hex('#8a5a34')],
      skin: hex('#e8b890'),
      hair: hex('#5a3418'),
      top: hex('#3a8a7a'),
      phones: hex('#2a2a30'),
      mug: hex('#f4f0e8'),
    };
    const B: Look = {
      wall: [hex('#14122e'), hex('#1e1a42')],
      foam: [hex('#2a2464'), hex('#463c94'), hex('#6a5ac0')],
      desk: [hex('#1e1a3a'), hex('#3a3470'), hex('#5a52a0')],
      skin: hex('#c89a7a'),
      hair: hex('#d84a7a'),
      top: hex('#e8b84a'),
      phones: hex('#f4f0e8'),
      mug: hex('#ffd36a'),
    };
    const riftC = accent;

    // Flip the right half (x ≥ RIFT) of the frame vertically: the other reality.
    const flipRight = (g: Gfx) => {
      const b = g.buf;
      const x0 = Math.max(0, RIFT - g.ox);
      for (let y = 0; y < g.h >> 1; y++) {
        const r1 = y * g.w;
        const r2 = (g.h - 1 - y) * g.w;
        for (let x = x0; x < g.w; x++) {
          const tmp = b[r1 + x]!;
          b[r1 + x] = b[r2 + x]!;
          b[r2 + x] = tmp;
        }
      }
    };
    // World y in the right half before flipping, so it lands at screen y after.
    let flipY = (y: number) => y;

    const booth = (g: Gfx, x0: number, x1: number, L: Look, label: string) => {
      g.gradRect(x0, g.top, x1 - x0, g.h, L.wall);
      // acoustic foam panels
      for (const px of [x0 + 14, x1 - 58]) {
        const py = 26;
        g.rect(px - 1, py - 1, 46, 62, ink);
        for (let y = 0; y < 60; y++)
          for (let x = 0; x < 44; x++) {
            const cell = (Math.floor(x / 11) + Math.floor(y / 15)) % 2;
            const u = cell ? (x % 11) / 11 : (y % 15) / 15;
            g.px(px + x, py + y, L.foam[u < 0.3 ? 0 : u < 0.7 ? 1 : 2]!);
          }
      }
      // a framed sign
      g.rect(x0 + 60, 34, 42, 14, ink);
      g.rect(x0 + 61, 35, 40, 12, shade(L.foam[2]!, 1.2));
      g.textCenter(label, x0 + 81, 39, ink);
      // desk
      g.rect(x0, DESK_Y, x1 - x0, 5, L.desk[2]!);
      g.rect(x0, DESK_Y, x1 - x0, 1, mix(L.desk[2]!, hex('#ffffff'), 0.3));
      g.gradRect(x0, DESK_Y + 5, x1 - x0, g.bottom - DESK_Y - 5, [L.desk[1]!, L.desk[0]!]);
      // a little lamp
    };

    const host = (g: Gfx, x: number, y: number, L: Look, dir: 1 | -1, t: number, talk: number, wave: number, seed: number, rolling: boolean) => {
      x = Math.round(x);
      // torso behind the desk
      roundRect(g, x - 13, y - 24, 26, 26, 6, ink);
      roundRect(g, x - 12, y - 23, 24, 25, 6, L.top);
      g.rect(x - 12, y - 23, 24, 3, mix(L.top, hex('#ffffff'), 0.25));
      if (rolling) {
        // Mara's reality: everyone rolls. Her chair is a ball (peeking out beside her).
        g.disc(x - 15, y - 4, 6, ink);
        g.ball(x - 15, y - 4, 5, 5, [shade(L.hair, 0.5), L.hair, mix(L.hair, hex('#ffffff'), 0.5)], -0.5, -0.5);
      }
      // head
      const hy = y - 36;
      g.disc(x, hy, 10, ink);
      g.disc(x, hy, 9, L.skin);
      // hair
      g.ellipse(x - dir * 2, hy - 6, 10, 5, L.hair);
      g.rect(x - dir * 9 - (dir > 0 ? 0 : 0), hy - 6, 4, 8, L.hair);
      // headphones
      arc(g, x, hy, 11, 11, Math.PI * 1.1, Math.PI * 1.9, L.phones, 2);
      roundRect(g, x - dir * 7 - 2, hy - 3, 5, 8, 2, L.phones);
      // eye + mouth, facing the rift
      const ex = x + dir * 4;
      if (blinking(t, seed)) g.hline(ex - 1, ex + 1, hy - 1, ink);
      else {
        g.rect(ex - 1, hy - 2, 2, 3, ink);
        g.px(ex, hy - 2, hex('#ffffff'));
      }
      const open = talk > 0.3 && Math.sin(t * 18 + seed) > -0.2;
      if (open) g.rect(x + dir * 5 - 1, hy + 4, 3, 2, hex('#6a2a2a'));
      else g.hline(x + dir * 4, x + dir * 6, hy + 5, ink);
      g.pxA(x + dir * 1, hy + 2, hex('#ff8a8a'), 0.5);
      // arms: one on the desk, one waving when it's time
      g.rect(x + dir * 6 - 3, y - 2, 9, 4, L.top);
      if (wave > 0) {
        const wv = Math.sin(t * 10) * 2;
        thickLine(g, x + dir * 10, y - 18, x + dir * 18, y - 34 + wv, 4, L.top);
        g.disc(x + dir * 19, y - 36 + wv, 2, L.skin);
      } else {
        thickLine(g, x - dir * 10, y - 16, x - dir * 12, y - 2, 4, L.top);
      }
    };

    const mic = (g: Gfx, x: number, y: number, dir: 1 | -1) => {
      g.line(x, DESK_Y, x, DESK_Y - 12, hex('#5a5a62'));
      g.line(x, DESK_Y - 12, x + dir * 12, y, hex('#5a5a62'));
      roundRect(g, x + dir * 12 - 3, y - 4, 6, 9, 2, ink);
      g.rect(x + dir * 12 - 2, y - 3, 4, 7, hex('#3a3a44'));
      for (let k = 0; k < 3; k++) g.hline(x + dir * 12 - 2, x + dir * 12 + 1, y - 2 + k * 2, hex('#6a6a74'));
    };

    const mug = (g: Gfx, x: number, L: Look) => {
      g.rect(x, DESK_Y - 9, 8, 9, ink);
      g.rect(x + 1, DESK_Y - 8, 6, 8, L.mug);
      arc(g, x + 8, DESK_Y - 5, 2, 2, -Math.PI / 2, Math.PI / 2, L.mug);
      g.rect(x + 1, DESK_Y - 8, 6, 1, hex('#3a2016'));
    };

    return {
      background(g) {
        flipY = (y: number) => g.top + g.bottom - 1 - y;
        booth(g, g.left, RIFT, A, 'REALITY A');
        booth(g, RIFT, g.right, B, 'REALITY B');
        flipRight(g);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const talker = Math.floor(t / 6) % 2;
        const waveCycle = t % 16;
        const waving = f.awake > 0.3 && waveCycle > 13 && waveCycle < 15.5 ? 1 : 0;
        const five = f.rare === 1 && ev < 6 ? envelope(ev, 6, 1, 1) : 0;

        // ── reality A (left), drawn normally ──
        g.clip(g.left, g.top, RIFT - g.left, g.h);
        mug(g, 74, A);
        steam(g, t, 78, DESK_Y - 11, hex('#f4f0e8'), { n: 6, height: 16, spread: 3, alpha: 0.55 });
        host(g, 112, DESK_Y, A, 1, t, talker === 0 ? f.energy + 0.2 : 0, waving || five > 0.5 ? 1 : 0, 1, false);
        mic(g, 138, DESK_Y - 34, -1);
        g.noClip();

        // ── reality B (right): draw upright, then flip the half ──
        g.clip(RIFT, g.top, g.right - RIFT, g.h);
        flipRight(g); // undo the background flip so we draw in local, upright coordinates
        mug(g, 240, B);
        steam(g, t, 244, DESK_Y - 11, hex('#fff0c0'), { n: 6, height: 16, spread: 3, alpha: 0.55, seed: 3 });
        const roll = Math.sin(t * 0.8) * 2;
        host(g, 208 + roll, DESK_Y, B, -1, t + 0.7, talker === 1 ? f.energy + 0.2 : 0, waving || five > 0.5 ? 1 : 0, 2, true);
        mic(g, 182, DESK_Y - 34, 1);
        // the floating mug, if it has crossed over
        const mugTrip = f.rare === 0 && ev < 6 ? ev / 6 : -1;
        if (mugTrip >= 0) {
          const mx = 90 + mugTrip * 150;
          const my = 70 + Math.sin(mugTrip * Math.PI) * -20;
          if (mx >= RIFT) {
            const ly = flipY(my);
            g.rect(mx - 3, ly - 4, 7, 8, ink);
            g.rect(mx - 2, ly - 3, 5, 6, A.mug);
          }
        }
        flipRight(g);
        g.noClip();
        if (mugTrip >= 0) {
          const mx = 90 + mugTrip * 150;
          const my = 70 + Math.sin(mugTrip * Math.PI) * -20;
          if (mx < RIFT) {
            g.rect(mx - 3, my - 4, 7, 8, ink);
            g.rect(mx - 2, my - 3, 5, 6, A.mug);
            g.pxA(mx, my - 6, hex('#ffffff'), 0.5);
          }
        }

        // ── the rift ──
        const crackle = f.reduced ? 0.3 : 1;
        let prevX = RIFT;
        for (let y = g.top; y < g.bottom; y++) {
          const off = (noise1(y * 0.15 + t * 0.6 * crackle, 3) - 0.5) * 6 + (noise1(y * 0.6 - t * 2 * crackle, 5) - 0.5) * 2;
          const x = Math.round(RIFT + off);
          g.rectAdd(Math.min(x, prevX) - 3, y, Math.abs(x - prevX) + 7, 1, riftC, 0.18);
          g.rect(Math.min(x, prevX), y, Math.abs(x - prevX) + 1, 1, mix(riftC, hex('#ffffff'), 0.6));
          prevX = x;
        }
        g.glow(RIFT, 90, 40, riftC, 0.12 + f.energy * 0.12, 5);
        // motes drifting across between realities
        for (let i = 0; i < 12; i++) {
          const p = (t * 0.2 + hash3(i, 1)) % 1;
          const y = g.top + hash3(i, 2) * g.h;
          const x = RIFT + (p - 0.5) * 50 * (i % 2 ? 1 : -1);
          g.pxAdd(x, y + Math.sin(p * 6 + i) * 3, riftC, Math.sin(p * Math.PI) * 0.8);
        }
        // High five at the rift.
        if (five > 0.8) {
          g.glow(RIFT, DESK_Y - 30, 10, hex('#ffffff'), (1 - Math.abs(ev - 3) / 2) * 0.8);
        }
        // A third, very small host peeks through.
        if (f.rare === 2 && ev < 6) {
          const k = envelope(ev, 6, 1, 1);
          const py = 60;
          const px = RIFT - 2 + Math.round(k * 3);
          g.disc(px, py, 4, hex('#9ae8c8'));
          g.px(px - 1, py - 1, ink);
          g.px(px + 2, py - 1, ink);
          g.hline(px - 1, px + 1, py + 2, ink);
          if (ev > 2 && ev < 4) g.text('HI', px + 6, py - 8, hex('#9ae8c8'));
        }
        void frameRect;
      },
    };
  },
};

export default def;

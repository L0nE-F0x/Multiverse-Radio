// Dimension Hop: two podcast booths in different realities, joined by a glowing rift. On the
// left, a warm booth where gravity behaves. On the right, a cool one where everything is
// gently upside-down (the mug, the lamp, the ON AIR sign, the rain) except the host, who has
// made her peace with it. They wave at each other through the rift.

import { gloom, haze, lightPool, motes, rain } from '../kit/atmos';
import { type Color, hex, mix, shade } from '../kit/color';
import { blinking, clamp, envelope, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { hash3, noise1 } from '../kit/rng';
import { arc, roundRect, thickLine } from '../kit/shapes';
import type { SceneDef } from '../types';

const RIFT = 160;
const DESK_Y = 110;

interface Side {
  wall: Color[];
  foam: Color[];
  desk: Color[];
  lamp: Color;
}

interface Host {
  skin: Color[];
  hair: Color[];
  top: Color[];
  phones: Color;
}

const def: SceneDef = {
  id: 'two-booths',
  fps: 20,
  focusY: 80,
  rareEvents: 3,
  rareDuration: 6,
  grade: { contrast: 1.14, saturation: 0.86, bloom: 0.6, vignette: 0.3 },
  create({ accent }) {
    const ink = hex('#07070b');
    const A: Side = {
      wall: [hex('#24170f'), hex('#352317'), hex('#46301f')],
      foam: [hex('#28190f'), hex('#3a2617'), hex('#4e3520')],
      desk: [hex('#1a0f08'), hex('#3e2818'), hex('#64422a'), hex('#8a6442')],
      lamp: hex('#ffb86e'),
    };
    const B: Side = {
      wall: [hex('#101828'), hex('#18243a'), hex('#22324e')],
      foam: [hex('#121a2c'), hex('#1a2640'), hex('#263856')],
      desk: [hex('#0c1220'), hex('#1e2c4a'), hex('#30446e'), hex('#4a6292')],
      lamp: hex('#9ad4ff'),
    };
    const jace: Host = {
      skin: [hex('#5a3624'), hex('#a8704e'), hex('#d8a07a')],
      hair: [hex('#170d07'), hex('#2e1a0e'), hex('#4a2c18')],
      top: [hex('#14262a'), hex('#24443f'), hex('#386a5e')],
      phones: hex('#1c1c24'),
    };
    const mara: Host = {
      skin: [hex('#4a2c26'), hex('#9a6a5a'), hex('#c8988a')],
      hair: [hex('#3a1426'), hex('#7a2c50'), hex('#b0507a')],
      top: [hex('#3a2c10'), hex('#7a6024'), hex('#a8883c')],
      phones: hex('#3a3846'),
    };
    const riftC = accent;
    const riftHot = mix(accent, hex('#ffffff'), 0.65);

    /** Flip a world-space rectangle of the current target upside-down. */
    const flipV = (g: Gfx, x: number, y: number, w: number, h: number) => {
      const b = g.buf;
      const x0 = Math.max(0, x - g.ox);
      const x1 = Math.min(g.w, x + w - g.ox);
      for (let k = 0; k < h >> 1; k++) {
        const y1 = y + k - g.oy;
        const y2 = y + h - 1 - k - g.oy;
        if (y1 < 0 || y2 >= g.h) continue;
        for (let bx = x0; bx < x1; bx++) {
          const tmp = b[y1 * g.w + bx]!;
          b[y1 * g.w + bx] = b[y2 * g.w + bx]!;
          b[y2 * g.w + bx] = tmp;
        }
      }
    };

    const booth = (g: Gfx, x0: number, x1: number, S: Side, dir: 1 | -1) => {
      g.gradRect(x0, g.top, x1 - x0, DESK_Y - g.top, [S.wall[0]!, S.wall[1]!, S.wall[2]!, S.wall[1]!]);
      // Acoustic foam: pyramids in rows, barely lit.
      const fx0 = dir > 0 ? x0 : RIFT + 52;
      const fx1 = dir > 0 ? RIFT - 52 : x1;
      for (let y = 22; y < 92; y++)
        for (let x = fx0; x < fx1; x++) {
          const u = (((x % 8) + 8) % 8) / 8;
          const v = (((y % 8) + 8) % 8) / 8;
          const tri = u + v < 1 ? (u > v ? 2 : 1) : u > v ? 1 : 0;
          g.px(x, y, S.foam[tri]!);
        }
      // Window with weather in it.
      const wx = dir > 0 ? 34 : 250;
      g.rect(wx - 2, 30, 40, 40, ink);
      g.clip(wx, 32, 36, 36);
      g.vgrad([mix(S.wall[1]!, hex('#5a6a8a'), 0.3), mix(S.wall[2]!, S.lamp, 0.3)], dir > 0 ? 32 : 68, dir > 0 ? 68 : 32);
      // a far skyline
      for (let x = wx; x < wx + 36; x += 4) {
        const h = 6 + Math.floor(hash3(x, dir) * 14);
        const yy = dir > 0 ? 68 - h : 32;
        g.rect(x, yy, 4, h, shade(S.wall[0]!, 0.8));
        if (hash3(x, dir, 2) > 0.5) g.px(x + 1, dir > 0 ? yy + 3 : yy + h - 4, mix(S.lamp, ink, 0.4));
      }
      g.noClip();
      g.rect(wx + 17, 32, 2, 36, ink);
      g.rect(wx, 49, 36, 2, ink);
      // Desk.
      g.rect(x0, DESK_Y, x1 - x0, 4, S.desk[2]!);
      g.rect(x0, DESK_Y, x1 - x0, 1, S.desk[3]!);
      g.gradRect(x0, DESK_Y + 4, x1 - x0, g.bottom - DESK_Y - 4, [S.desk[1]!, S.desk[0]!, ink]);
      // Mixer and a laptop glow on the desk.
      const mx = dir > 0 ? 70 : 230;
      g.rect(mx - 12, DESK_Y - 3, 24, 3, ink);
      for (let k = 0; k < 6; k++) g.px(mx - 10 + k * 4, DESK_Y - 2, k % 2 ? S.desk[3]! : mix(S.lamp, ink, 0.3));
    };

    /** A podcaster at the desk, three-quarter view, facing `dir`. (x, y) = torso centre at the desk. */
    const host = (g: Gfx, x: number, y: number, H: Host, dir: 1 | -1, t: number, talk: number, wave: number, seed: number, floaty: number) => {
      x = Math.round(x);
      // Torso and shoulders.
      roundRect(g, x - 13, y - 27, 26, 30, 7, ink);
      roundRect(g, x - 12, y - 26, 24, 29, 7, H.top[1]!);
      g.rect(x + dir * 4 - (dir > 0 ? 0 : 7), y - 24, 8, 26, H.top[2]!);
      g.rect(x - dir * 10 - (dir > 0 ? 0 : 2), y - 20, 3, 22, H.top[0]!);
      g.rect(x - 4, y - 27, 8, 2, H.top[0]!);
      // Neck and head (three-quarter profile toward the rift).
      const hy = y - 38 + (floaty ? Math.round(Math.sin(t * 0.9) * floaty) : 0);
      g.rect(x - 2, hy + 7, 5, 6, H.skin[1]!);
      g.disc(x, hy, 10, ink);
      // hair mass behind and on top, then the face in front of it
      g.disc(x, hy, 9, H.hair[1]!);
      g.ellipse(x + dir * 3, hy + 2, 6, 7, H.skin[1]!);
      g.ellipse(x + dir * 4, hy + 1, 4, 5, H.skin[2]!);
      g.rect(x + dir * 2 - (dir > 0 ? 0 : 5), hy - 6, 6, 3, H.hair[2]!);
      g.ellipse(x - dir * 3, hy - 4, 5, 3, H.hair[2]!);
      g.px(x - dir * 5, hy - 6, mix(H.hair[2]!, hex('#ffffff'), 0.3));
      // nose and chin toward the rift
      g.rect(x + dir * 9 - (dir > 0 ? 0 : 1), hy, 2, 3, H.skin[2]!);
      g.px(x + dir * 10, hy + 2, H.skin[0]!);
      g.px(x + dir * 7, hy + 8, H.skin[0]!);
      if (floaty) {
        for (let k = 0; k < 3; k++) {
          const sx = x - dir * 5 + k * 3 * dir;
          const len = 2 + (k % 2);
          const sw = Math.sin(t * 1.3 + k) * 1.2;
          g.lineA(sx, hy - 9, sx + sw, hy - 9 - len, H.hair[2]!, 0.6);
        }
      }
      // Headphones: band over the crown, cup over the ear.
      arc(g, x, hy, 10, 10, Math.PI * 1.15, Math.PI * 1.85, H.phones, 2);
      roundRect(g, x - dir * 2 - 3, hy - 2, 6, 8, 2, H.phones);
      g.px(x - dir * 2 - 1, hy - 1, mix(H.phones, hex('#ffffff'), 0.35));
      // Eye, brow, mouth.
      const ex = x + dir * 5;
      if (blinking(t, seed)) g.hline(ex - 1, ex, hy, H.skin[0]!);
      else {
        g.rect(ex - (dir > 0 ? 0 : 1), hy - 1, 2, 2, ink);
        g.px(ex + (dir > 0 ? 1 : -1), hy - 1, hex('#e8e0d8'));
      }
      g.hline(ex - 1, ex + 1, hy - 3, H.hair[0]!);
      const open = talk > 0.3 && Math.sin(t * 17 + seed) > -0.2;
      if (open) g.rect(x + dir * 6 - (dir > 0 ? 0 : 2), hy + 4, 3, 2, H.skin[0]!);
      else g.hline(x + dir * 6, x + dir * 7, hy + 5, H.skin[0]!);
      // Arms: one on the desk; the near one waves at the rift when it's time.
      g.rect(x + dir * 4 - (dir > 0 ? 0 : 12), y - 3, 12, 4, H.top[2]!);
      g.disc(x + dir * 17, y - 1, 2, H.skin[1]!);
      if (wave > 0) {
        const wv = Math.sin(t * 9) * 2 * wave;
        const hx = x + dir * (18 + wave * 6);
        const hyy = y - 36 + wv;
        thickLine(g, x + dir * 9, y - 20, hx, hyy + 3, 4, H.top[1]!);
        g.disc(hx, hyy, 2.5, H.skin[2]!);
      } else {
        thickLine(g, x - dir * 9, y - 18, x - dir * 11, y - 3, 4, H.top[0]!);
      }
    };

    const mic = (g: Gfx, x: number, mx: number, my: number, dir: 1 | -1) => {
      const arm = hex('#4a4a56');
      g.line(x, DESK_Y, x, DESK_Y - 16, arm);
      g.line(x, DESK_Y - 16, mx - dir * 4, my + 2, arm);
      roundRect(g, mx - 3, my - 5, 7, 11, 3, ink);
      g.rect(mx - 2, my - 4, 5, 9, hex('#4a4a56'));
      for (let k = 0; k < 4; k++) g.hline(mx - 2, mx + 2, my - 3 + k * 2, hex('#7a7a88'));
    };

    const mug = (g: Gfx, x: number, y: number, body: Color, upside: boolean) => {
      g.rect(x, y, 8, 9, ink);
      g.rect(x + 1, y + 1, 6, 7, body);
      g.rect(x + 1, y + 1, 2, 7, mix(body, hex('#ffffff'), 0.25));
      arc(g, x + 8, y + 4, 2, 2, -Math.PI / 2, Math.PI / 2, body);
      // Coffee stays in the cup either way (it's upside-down in B, and fine about it).
      g.rect(x + 1, upside ? y + 6 : y + 1, 6, 2, hex('#2a140a'));
    };

    /** The desk lamp: standing in A; in B it stands on its head and lights the ceiling. */
    const lamp = (g: Gfx, x: number, S: Side, upside: boolean, on: number) => {
      const metal = mix(S.desk[3]!, hex('#9a9aa4'), 0.4);
      if (!upside) {
        g.rect(x - 5, DESK_Y - 2, 10, 2, metal);
        g.line(x, DESK_Y - 2, x - 4, DESK_Y - 22, metal);
        g.line(x - 4, DESK_Y - 22, x + 8, DESK_Y - 30, metal);
        g.tri(x + 4, DESK_Y - 33, x + 14, DESK_Y - 29, x + 8, DESK_Y - 24, metal);
        g.px(x + 9, DESK_Y - 27, mix(S.lamp, hex('#ffffff'), on * 0.6));
      } else {
        // The shade rests on the desk and the base points at the sky.
        g.tri(x - 6, DESK_Y, x + 6, DESK_Y, x, DESK_Y - 7, metal);
        g.line(x, DESK_Y - 7, x - 3, DESK_Y - 24, metal);
        g.line(x - 3, DESK_Y - 24, x + 5, DESK_Y - 34, metal);
        g.rect(x + 1, DESK_Y - 36, 10, 2, metal);
      }
    };

    return {
      background(g) {
        booth(g, g.left, RIFT, A, 1);
        booth(g, RIFT, g.right, B, -1);
        // ON AIR boxes: A's on the wall, B's mounted the other way up.
        for (const [sx, S, up] of [
          [92, A, false],
          [200, B, true],
        ] as const) {
          g.rect(sx - 1, 26, 30, 11, ink);
          g.rect(sx, 27, 28, 9, mix(hex('#3a0c10'), S.wall[1]!, 0.3));
          g.textCenter('ON AIR', sx + 14, 29, hex('#d8505a'));
          if (up) flipV(g, sx - 1, 26, 30, 11);
        }
        // Lamps and their pools of light.
        lamp(g, 54, A, false, 1);
        lamp(g, 266, B, true, 1);
        lightPool(g, 64, DESK_Y + 2, 30, 6, A.lamp, 0.25);
        lightPool(g, 266, g.top + 6, 36, 18, B.lamp, 0.12);
        haze(g, hex('#1a1612'), 0, DESK_Y, 0.18, 0, g.left, DESK_Y);
        gloom(g, g.left, DESK_Y + 20, g.w, g.bottom - DESK_Y - 20, 0.6);
        gloom(g, g.left, g.top, g.w, 30 - g.top, 0.5, true);

        g.lighting(0.55);
        g.light(66, 88, 70, 0.7, 50);
        g.light(266, 30, 70, 0.55, 60);
        g.light(RIFT, 80, 70, 0.5, 140);
        g.light(116, 74, 40, 0.25);
        g.light(204, 74, 40, 0.25);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const rd = f.reduced;
        const talker = Math.floor(t / 6) % 2;
        const cyc = t % 18;
        const waving = f.awake > 0.3 && cyc > 14 && cyc < 16.5 ? envelope(cyc - 14, 2.5, 0.4, 0.4) : 0;
        const five = f.rare === 1 && ev < 6 ? envelope(ev, 6, 1.2, 1) : 0;

        // Weather: rain falls in A, rises in B.
        if (!rd) {
          g.clip(34, 32, 36, 36);
          rain(g, t, 34, 32, 70, 68, 22, hex('#8aa0c0'), 0.35, 4, 70, 0.1, 1);
          g.clip(250, 32, 36, 36);
          rain(g, -t, 250, 32, 286, 68, 22, hex('#9ad4ff'), 0.35, 4, 60, -0.1, 2);
          g.noClip();
        }

        // Mugs: steam rises from A's, sinks from B's.
        const crossing = f.rare === 0 && ev < 6;
        if (!crossing) {
          mug(g, 84, DESK_Y - 9, hex('#d8d0c4'), false);
          steam(g, t, 88, DESK_Y - 11, hex('#e8e0d4'), 6, 16, 3, 0.4);
          mug(g, 228, DESK_Y - 9, hex('#c8a040'), true);
          steam(g, t, 232, DESK_Y + 1, hex('#bfe4ff'), 6, -14, 3, 0.35, 0.3, 3);
        }

        // Hosts.
        const nearWave = Math.max(waving, five > 0.2 ? five : 0);
        host(g, 112, DESK_Y, jace, 1, t, talker === 0 ? f.energy + 0.2 : 0, nearWave, 1, 0);
        host(g, 208, DESK_Y, mara, -1, t + 0.7, talker === 1 ? f.energy + 0.2 : 0, nearWave, 2, 1);
        mic(g, 146, 128, DESK_Y - 37, -1);
        mic(g, 174, 192, DESK_Y - 37, 1);

        // A's mug drifts through the rift and turns over on the way.
        if (crossing) {
          const p = clamp((ev - 0.5) / 4.5);
          const mx = 84 + p * 144;
          const my = DESK_Y - 9 - Math.sin(p * Math.PI) * 34;
          mug(g, Math.round(mx), Math.round(my), hex('#d8d0c4'), p >= 0.5);
          if (p >= 1) steam(g, t, 232, DESK_Y + 1, hex('#bfe4ff'), 6, -14, 3, 0.35, 0.3, 3);
        }

        // The rift: a jagged seam of light with a wide soft halo.
        const crackle = rd ? 0.2 : 1;
        let prevX = RIFT;
        const halo = 0.1 + f.energy * 0.08 + five * 0.15;
        for (let y = g.top; y < g.bottom; y++) {
          const off = (noise1(y * 0.13 + t * 0.5 * crackle, 3) - 0.5) * 6 + (noise1(y * 0.5 - t * 1.6 * crackle, 5) - 0.5) * 2;
          const x = Math.round(RIFT + off);
          g.rectAdd(Math.min(x, prevX) - 6, y, Math.abs(x - prevX) + 13, 1, riftC, halo * 0.6);
          g.rectAdd(Math.min(x, prevX) - 2, y, Math.abs(x - prevX) + 5, 1, riftC, halo * 1.6);
          g.rect(Math.min(x, prevX), y, Math.abs(x - prevX) + 1, 1, riftHot);
          prevX = x;
        }
        // Motes cross between realities.
        if (!rd) motes(g, t, RIFT - 30, g.top, RIFT + 30, g.bottom, 18, riftC, 0.6, 4, 0.3);

        // High five: two hands meet at the seam.
        if (five > 0.85) {
          const k = 1 - Math.abs(ev - 3) / 1.6;
          if (k > 0) g.glow(RIFT, DESK_Y - 36, 16, hex('#ffffff'), k * 0.7);
        }
        // A third, very small host peeks through.
        if (f.rare === 2 && ev < 6) {
          const k = envelope(ev, 6, 1, 1);
          const py = 56;
          const px = RIFT - 3 + Math.round(k * 4);
          g.disc(px, py, 5, ink);
          g.disc(px, py, 4, hex('#a8d8c8'));
          g.rect(px - 4, py - 5, 8, 2, hex('#2a3a4a'));
          if (!blinking(ev, 9)) {
            g.px(px - 2, py - 1, ink);
            g.px(px + 2, py - 1, ink);
          }
          if (ev > 2 && ev < 4.5) {
            // a tiny wave
            const wv = Math.round(Math.sin(ev * 10));
            g.rect(px + 5, py - 4 + wv, 2, 4, hex('#a8d8c8'));
          }
        }
      },
    };
  },
};

export default def;

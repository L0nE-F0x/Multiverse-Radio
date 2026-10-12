// Moon Dub Sound System: a towering speaker stack on the grey lunar surface. Moon dust
// bounces in slow arcs with every bass hit. A sleepy blue planet rises; an astronaut nods.

import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, rampAt, stars } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const GROUND_Y = 126;
const STACK = { x: 82, y: 150, cols: 3, rows: 4, cw: 26, ch: 26 };
const PLANET = { x: 238, r: 28 };

const def: SceneDef = {
  id: 'moon-soundsystem',
  fps: 20,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 8,
  create({ accent }) {
    const ink = hex('#050608');
    const lime = accent;
    const limeD = shade(accent, 0.5);
    const regolith = ramp([hex('#2a2a30'), hex('#4a4a52'), hex('#6e6e78'), hex('#9a9aa4'), hex('#c4c4cc')], 6);
    const ocean = ramp([hex('#0a1e4a'), hex('#1a4a9a'), hex('#3a7ad8'), hex('#8ac4ff')], 4);
    const land = ramp([hex('#1a4a2a'), hex('#3a8a4a'), hex('#7ac86a')], 3);
    const suit = ramp([hex('#6a6a78'), hex('#b8b8c4'), hex('#eeeef4')], 3);

    // Continents: a small equirectangular map sampled while the planet turns.
    const MW = 64;
    const MH = 32;
    const map = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) map[y * MW + x] = fbm(x / 9, y / 7, 12, 4) > 0.52 ? 1 : 0;

    // Dust particles (fixed pool, no allocation per frame).
    const N = 48;
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const life = new Float32Array(N);
    let next = 0;
    let lastBeat = -1;

    const drawPlanet = (g: Gfx, cx: number, cy: number, t: number, awake: number, eyes: number, nod: number) => {
      const r = PLANET.r;
      g.glow(cx, cy, r + 14, hex('#4a8aff'), 0.25, 5);
      const rot = t * 0.01;
      for (let dy = -r; dy <= r; dy++) {
        const by = cy + dy;
        if (by < g.top || by >= g.bottom) continue;
        const hw = Math.floor(Math.sqrt(r * r - dy * dy));
        for (let dx = -hw; dx <= hw; dx++) {
          const nx = dx / r;
          const ny = dy / r;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const lon = Math.atan2(nx, nz) / Math.PI + rot;
          const lat = Math.asin(ny) / Math.PI + 0.5;
          const mx = Math.floor(((lon * 0.5 + 1) % 1) * MW);
          const my = Math.min(MH - 1, Math.floor(lat * MH));
          const l = clamp(0.2 + (-nx * 0.6 - ny * 0.5 + nz * 0.5) * 0.9);
          const isLand = map[my * MW + mx] === 1;
          g.px(cx + dx, by, rampAt(isLand ? land : ocean, l, cx + dx, by));
        }
      }
      // atmosphere rim
      g.ring(cx, cy, r, r, hex('#9ad0ff'));
      // a sleepy face
      const fy = cy + Math.round(nod);
      if (eyes > 0.5) {
        g.disc(cx - 9, fy - 3, 3, hex('#ffffff'));
        g.disc(cx + 9, fy - 3, 3, hex('#ffffff'));
        g.disc(cx - 9, fy - 2, 2, ink);
        g.disc(cx + 9, fy - 2, 2, ink);
        g.rect(cx - 12, fy - 7, 7, 2, ocean[1]!);
        g.rect(cx + 6, fy - 7, 7, 2, ocean[1]!);
      } else {
        arc(g, cx - 9, fy - 4, 3, 2, 0.2, Math.PI - 0.2, ink);
        arc(g, cx + 9, fy - 4, 3, 2, 0.2, Math.PI - 0.2, ink);
      }
      arc(g, cx, fy + 3, 4, 3, 0.3, Math.PI - 0.3, ink);
      g.ellipseA(cx - 15, fy + 2, 3, 2, hex('#ff8aa0'), 0.6);
      g.ellipseA(cx + 15, fy + 2, 3, 2, hex('#ff8aa0'), 0.6);
      if (awake < 0.4 && eyes < 0.5) g.text('z', cx + r - 2, cy - r - 4, hex('#9ad0ff'));
    };

    return {
      background(g) {
        g.fill(hex('#04050a'));
        // a faint galactic band
        for (let y = g.top; y < GROUND_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const d = Math.abs(y - (20 + x * 0.25));
            const n = fbm(x / 20, y / 12, 6, 3);
            if (d < 26 && n > 0.45 + (d / 26) * 0.3) g.pxA(x, y, hex('#22223e'), 0.35 + (1 - d / 26) * 0.2);
          }
        stars(g, 0, g.left, g.top, g.right, GROUND_Y, 0.7, hex('#e0e4ff'), 4, 0);

        // Lunar surface with a gentle curve and craters.
        for (let y = GROUND_Y - 6; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const horizon = GROUND_Y + ((x - 160) / 260) ** 2 * 10 - 4;
            if (y < horizon) continue;
            const n = fbm(x / 14, y / 5, 3, 4);
            const depth = (y - horizon) / 80;
            g.px(x, y, rampAt(regolith, 0.25 + n * 0.55 - depth * 0.15 + (y - horizon < 2 ? 0.25 : 0), x, y));
          }
        const crater = (x: number, y: number, rx: number) => {
          const ry = rx * 0.32;
          g.ellipse(x, y, rx + 1, ry + 1, regolith[4]!);
          g.ellipse(x, y + 1, rx, ry, regolith[0]!);
          g.ellipse(x + 1, y + 1, rx - 2, ry - 1, regolith[1]!);
        };
        crater(40, 150, 16);
        crater(214, 168, 22);
        crater(290, 138, 10);
        crater(140, 172, 9);
        crater(30, 200, 26);
        crater(250, 230, 30);
        crater(120, 215, 14);
        // a little flag and footprints
        g.vline(284, 104, 132, regolith[4]!);
        g.rect(285, 104, 12, 8, lime);
        g.text('DUB', 286, 106, ink);
        for (let i = 0; i < 6; i++) g.rect(206 + i * 9, 150 + (i % 2) * 3, 3, 2, regolith[0]!);

        // Speaker stack.
        const { x, y, cols, rows, cw, ch } = STACK;
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++) {
            const bx = x + c * cw;
            const by = y - (r + 1) * ch;
            g.rect(bx, by, cw - 1, ch - 1, ink);
            g.rect(bx + 1, by + 1, cw - 3, ch - 3, hex('#16181c'));
            frameRect(g, bx + 1, by + 1, cw - 3, ch - 3, hex('#2a2e34'));
            g.rect(bx + 2, by + 2, cw - 5, 1, hex('#3a3e46'));
          }
        // horns on top
        for (let c = 0; c < cols; c++) {
          const bx = x + c * cw + 4;
          const by = y - rows * ch - 10;
          g.poly([bx, by + 10, bx + cw - 9, by + 10, bx + cw - 7, by, bx - 2, by], ink);
          g.poly([bx + 1, by + 9, bx + cw - 10, by + 9, bx + cw - 9, by + 2, bx, by + 2], hex('#2a2e34'));
        }
        g.rect(x - 2, y - 1, cols * cw + 3, 3, ink);
        // cables snaking off to the right
        g.line(x + cols * cw, y - 4, x + cols * cw + 30, y + 4, ink);
        g.line(x + cols * cw + 30, y + 4, x + cols * cw + 60, y + 2, ink);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const play = f.awake;

        stars(g, t, g.left, g.top, g.right, GROUND_Y - 10, 0.08, hex('#ffffff'), 11);

        // A satellite drifts across, blinking.
        if (f.rare === 1 && ev < 8) {
          const sx = -10 + (ev / 8) * 340;
          const sy = 20 + (ev / 8) * 14;
          g.rect(sx - 4, sy, 3, 2, hex('#3a5aaa'));
          g.rect(sx + 2, sy, 3, 2, hex('#3a5aaa'));
          g.rect(sx - 1, sy - 1, 3, 4, hex('#c8c8d0'));
          if (Math.floor(ev * 3) % 2 === 0) g.glow(sx, sy - 2, 3, hex('#ff4a4a'), 0.8);
        }

        // The planet rises over the first few minutes, then rests.
        const rise = clamp(0.45 + t / 300);
        const ease = 1 - (1 - rise) ** 3;
        const cy = Math.round(GROUND_Y + 30 - ease * 84);
        const open = f.rare === 0 && ev < 8 ? envelope(ev, 8, 0.8, 1) : 0;
        const nod = open > 0.5 ? Math.max(0, Math.sin(t * Math.PI * 1.6)) * 2 : 0;
        g.clip(g.left, g.top, g.w, GROUND_Y + ((PLANET.x - 160) / 260) ** 2 * 10 - 4 - g.top);
        drawPlanet(g, PLANET.x, cy, t, f.awake, open, nod);
        g.noClip();

        // Speakers: cones pump with the bass.
        const { x, y, cols, rows, cw, ch } = STACK;
        const pump = (f.pulse * 1.2 + f.energy * 0.6) * play;
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++) {
            const bx = x + c * cw + (cw - 1) / 2;
            const by = y - (r + 1) * ch + (ch - 1) / 2;
            const big = r < 2;
            const rr = big ? 9 : 5;
            const k = r < 2 ? pump : pump * 0.5;
            g.disc(bx, by + (big ? 0 : -4), rr + 1, ink);
            g.disc(bx, by + (big ? 0 : -4), rr, mix(hex('#2a2e34'), lime, 0.15 + k * 0.3));
            g.disc(bx, by + (big ? 0 : -4), rr - 2 + k * 1.5, hex('#1a1c20'));
            g.disc(bx, by + (big ? 0 : -4), 2 + k, hex('#3a3e46'));
            g.px(bx - 1, by - 1 + (big ? 0 : -4), hex('#6a6e78'));
            if (!big) {
              g.disc(bx, by + 6, 3, ink);
              g.disc(bx, by + 6, 2, hex('#2a2e34'));
            }
            g.rect(bx - 10, by + 10, 3, 1, (Math.floor(t * 2 + c + r) % 3 === 0 && play > 0.5) ? lime : limeD);
          }
        g.glow(x + (cols * cw) / 2, y - (rows * ch) / 2, 60, lime, 0.04 + pump * 0.08, 4);

        // Moon dust: kicked up by beats, falling in slow arcs.
        if (f.beat !== lastBeat && play > 0.5 && !f.reduced) {
          lastBeat = f.beat;
          for (let k = 0; k < 4; k++) {
            const i = next++ % N;
            px[i] = x - 10 + hash3(f.beat, k) * (cols * cw + 80);
            py[i] = y + 2 + hash3(f.beat, k, 2) * 10;
            vx[i] = (hash3(f.beat, k, 3) - 0.5) * 16;
            vy[i] = -18 - hash3(f.beat, k, 4) * 22;
            life[i] = 9;
          }
        }
        const dt = f.dt;
        for (let i = 0; i < N; i++) {
          if (life[i]! <= 0) continue;
          vy[i] = vy[i]! + 7 * dt;
          px[i] = px[i]! + vx[i]! * dt;
          py[i] = py[i]! + vy[i]! * dt;
          if (py[i]! > y + 12 && vy[i]! > 0) {
            vy[i] = -vy[i]! * 0.45;
            vx[i] = vx[i]! * 0.7;
            if (Math.abs(vy[i]!) < 2) life[i] = 0;
          }
          life[i] = life[i]! - dt;
          g.px(px[i]!, py[i]!, life[i]! > 3 ? regolith[4]! : regolith[3]!);
        }

        // Echo shout-out: said once, comes back eleven seconds later (here: a bit sooner).
        if (f.rare === 2 && ev < 8) {
          const say = 'BIG UP';
          if (ev < 2.5) g.textCenter(say, x + 40, 6 + ev * 2, mix(lime, hex('#04050a'), ev / 2.5));
          if (ev > 4.5) g.textCenter(say.toLowerCase(), x + 40, 6 + (ev - 4.5) * 2, mix(limeD, hex('#04050a'), (ev - 4.5) / 3.5));
        }

        // A moon rabbit hops past in the dust.
        if (f.rare === 3 && ev < 8) {
          const rx = 330 - (ev / 8) * 360;
          const hop = Math.abs(Math.sin(ev * 3)) * 10;
          const ry = 160 - hop;
          g.ellipse(rx, ry, 4, 3, regolith[4]!);
          g.disc(rx - 4, ry - 3, 2, regolith[4]!);
          g.rect(rx - 4, ry - 9, 1, 5, regolith[4]!);
          g.rect(rx - 2, ry - 9, 1, 5, regolith[4]!);
          g.px(rx - 5, ry - 3, ink);
          g.disc(rx + 4, ry - 1, 1, hex('#ffffff'));
        }

        // ── the astronaut, nodding along ──
        const ax = 196;
        const ay = 150;
        const nodA = play > 0.4 ? f.pulse * 2 + Math.max(0, Math.sin(t * Math.PI * 1.4)) * 1 : 0;
        // legs + boots
        g.rect(ax - 5, ay - 12, 4, 12, suit[1]!);
        g.rect(ax + 1, ay - 12, 4, 12, suit[1]!);
        g.rect(ax - 6, ay - 2, 6, 3, suit[0]!);
        g.rect(ax + 1, ay - 2, 6, 3, suit[0]!);
        // backpack + body
        g.rect(ax + 4, ay - 30, 6, 14, suit[0]!);
        roundRect(g, ax - 7, ay - 31, 13, 20, 3, ink);
        roundRect(g, ax - 6, ay - 30, 11, 18, 3, suit[2]!);
        g.rect(ax - 4, ay - 24, 6, 4, hex('#3a5aaa'));
        g.px(ax - 3, ay - 23, lime);
        g.px(ax - 1, ay - 23, hex('#ff4a4a'));
        // arms: one raised toward the stack
        const wave = play > 0.4 ? Math.round(Math.sin(t * 2.5) * 2) : 0;
        g.line(ax - 6, ay - 27, ax - 12, ay - 38 + wave, suit[1]!);
        g.line(ax - 5, ay - 27, ax - 11, ay - 38 + wave, suit[1]!);
        g.disc(ax - 12, ay - 39 + wave, 1, suit[0]!);
        g.line(ax + 4, ay - 26, ax + 7, ay - 18, suit[1]!);
        // helmet
        const hy = ay - 38 + Math.round(nodA);
        g.disc(ax, hy, 8, ink);
        g.disc(ax, hy, 7, suit[2]!);
        g.ellipse(ax - 1, hy + 1, 5, 4, hex('#1a2a1a'));
        g.ellipse(ax - 1, hy + 1, 4, 3, mix(lime, hex('#1a2a1a'), 0.6));
        g.px(ax - 3, hy - 1, hex('#ffffff'));
        g.px(ax - 2, hy - 1, lime);
        if (play < 0.3 && blinking(t, 2)) g.text('z', ax + 8, hy - 12, regolith[3]!);
      },
    };
  },
};

export default def;

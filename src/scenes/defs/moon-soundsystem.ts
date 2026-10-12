// Moon Dub Sound System: a towering speaker stack on the grey lunar surface under a black
// sky. Moon dust bounces in slow arcs with every bass hit. A blue planet rises, half in
// shadow; a lone astronaut nods along. Very occasionally the planet's clouds look sleepy.

import { haze, lightPool } from '../kit/atmos';
import { hex, mix, ramp, shade } from '../kit/color';
import { blinking, clamp, envelope, rampAt, stars } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const GROUND_Y = 114;
const STACK = { x: 82, y: 136, cols: 3, rows: 4, cw: 26, ch: 24 };
const PLANET = { x: 238, r: 28 };

const def: SceneDef = {
  id: 'moon-soundsystem',
  fps: 20,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 8,
  grade: { contrast: 1.2, saturation: 0.78, shadows: '#030407', bloom: 0.6, vignette: 0.4, temperature: -0.15 },
  create({ accent }) {
    const ink = hex('#030405');
    const lime = mix(accent, hex('#a0b090'), 0.25);
    const limeD = shade(lime, 0.45);
    const regolith = ramp([hex('#0e0e12'), hex('#22222a'), hex('#3c3c44'), hex('#5e5e66'), hex('#8e8e96'), hex('#c0c0c6')], 6);
    const ocean = ramp([hex('#040a1a'), hex('#0e2448'), hex('#24508a'), hex('#6a9ccc')], 4);
    const land = ramp([hex('#0a160e'), hex('#24402a'), hex('#5a7a50')], 3);
    const suit = ramp([hex('#3a3a44'), hex('#8a8a96'), hex('#d4d4dc')], 3);

    // Continents: a small equirectangular map sampled while the planet turns.
    const MW = 64;
    const MH = 32;
    const map = new Uint8Array(MW * MH);
    const clouds = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        map[y * MW + x] = fbm(x / 9, y / 7, 12, 4) > 0.52 ? 1 : 0;
        clouds[y * MW + x] = Math.round(Math.max(0, fbm(x / 6, y / 2.5, 40, 3) - 0.5) * 2 * 255);
      }

    // Dust particles (fixed pool, no allocation per frame).
    const N = 48;
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const life = new Float32Array(N);
    let next = 0;
    let lastBeat = -1;

    const drawPlanet = (g: Gfx, cx: number, cy: number, t: number, face: number) => {
      const r = PLANET.r;
      g.glow(cx - 6, cy, r + 12, hex('#3a6ab0'), 0.18, 5);
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
          const mx = Math.floor((((lon * 0.5) % 1) + 1) % 1 * MW) % MW;
          const my = Math.min(MH - 1, Math.floor(lat * MH));
          // Sunlight from the left: a gibbous planet with a soft terminator.
          const sun = -nx * 0.85 - ny * 0.15 + nz * 0.35;
          const l = clamp(0.05 + sun * 1.1);
          const isLand = map[my * MW + mx] === 1;
          let c = rampAt(isLand ? land : ocean, l, cx + dx, by);
          const cl = clouds[my * MW + ((mx + Math.floor(t * 0.4)) % MW)]! / 255;
          if (cl > 0.15) c = mix(c, hex('#c8d4e0'), cl * clamp(l * 1.4) * 0.85);
          // the night side keeps a few city lights
          if (l < 0.05 && isLand && hash3(mx, my, 5) > 0.8) c = mix(c, hex('#b08a5a'), 0.7);
          g.px(cx + dx, by, c);
        }
      }
      // thin atmosphere on the lit limb
      for (let a = 0; a < 72; a++) {
        const ang = (a / 72) * Math.PI * 2;
        const k = clamp(-Math.cos(ang) * 0.9 + 0.2);
        if (k > 0) g.pxAdd(cx + Math.cos(ang) * (r + 0.5), cy + Math.sin(ang) * (r + 0.5), hex('#7ab0ff'), k * 0.8);
      }
      // Rare: the clouds arrange themselves into a sleepy face, then forget.
      if (face > 0) {
        const fc = mix(hex('#5a7aa0'), hex('#e8f0f8'), face);
        for (const ex of [-9, 9]) arc(g, cx + ex - 4, cy - 5, 3, 2, 0.2, Math.PI - 0.2, fc);
        arc(g, cx - 4, cy + 4, 5, 3, 0.3, Math.PI - 0.3, fc);
      }
    };

    return {
      background(g) {
        g.fill(hex('#020306'));
        // a faint galactic band
        for (let y = g.top; y < GROUND_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const d = Math.abs(y - (20 + x * 0.25));
            const n = fbm(x / 20, y / 12, 6, 3);
            if (d < 26 && n > 0.45 + (d / 26) * 0.3) g.pxA(x, y, hex('#181a2c'), 0.35 + (1 - d / 26) * 0.2);
          }
        stars(g, 0, g.left, g.top, g.right, GROUND_Y, 0.55, hex('#c8d0e8'), 4, 0);

        // Lunar surface with a gentle curve and craters.
        for (let y = GROUND_Y - 6; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const horizon = GROUND_Y + ((x - 160) / 260) ** 2 * 10 - 4;
            if (y < horizon) continue;
            const n = fbm(x / 14, y / 5, 3, 4);
            const depth = (y - horizon) / 80;
            // Low sun from the left: the near ground falls into shadow, the horizon is lit.
            g.px(x, y, rampAt(regolith, 0.18 + n * 0.5 - depth * 0.35 + (y - horizon < 2 ? 0.3 : 0) - (x - 160) / 1200, x, y));
          }
        const crater = (x: number, y: number, rx: number) => {
          const ry = rx * 0.32;
          g.ellipse(x, y, rx + 1, ry + 1, regolith[3]!);
          g.ellipse(x, y + 1, rx, ry, regolith[0]!);
          g.ellipse(x + 2, y + 1, rx - 3, ry - 1, regolith[1]!);
        };
        crater(40, 140, 16);
        crater(214, 162, 22);
        crater(290, 128, 10);
        crater(140, 168, 9);
        crater(30, 200, 26);
        crater(250, 230, 30);
        crater(120, 215, 14);
        // a little flag and footprints
        g.vline(284, 96, 122, regolith[4]!);
        g.rect(285, 96, 11, 7, limeD);
        g.rect(285, 96, 11, 1, lime);
        for (let i = 0; i < 6; i++) g.rect(206 + i * 9, 142 + (i % 2) * 3, 3, 2, regolith[0]!);

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
        // The stack's long shadow away from the low sun.
        g.poly([x + cols * cw, y + 1, x + cols * cw + 90, y + 8, x + cols * cw + 80, y + 14, x - 2, y + 2], ink, 1, 0.5);
        lightPool(g, x + (cols * cw) / 2, y + 4, 60, 8, lime, 0.08);
        haze(g, hex('#1a2438'), GROUND_Y - 8, GROUND_Y + 6, 0.35, 0, GROUND_Y - 10, GROUND_Y + 8);
        g.lighting(0.62);
        g.light(x + (cols * cw) / 2, y - 50, 80, 0.3);
        g.light(PLANET.x, GROUND_Y - 50, 70, 0.25);
        g.light(196, 116, 40, 0.35);
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
        const face = f.rare === 0 && ev < 8 ? envelope(ev, 8, 1.2, 1.5) : 0;
        g.clip(g.left, g.top, g.w, GROUND_Y + ((PLANET.x - 160) / 260) ** 2 * 10 - 4 - g.top);
        drawPlanet(g, PLANET.x, cy, t, face > 0.3 ? face : 0);
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
            g.disc(bx, by + (big ? 0 : -4), rr, mix(hex('#1e2024'), lime, 0.06 + k * 0.2));
            g.disc(bx, by + (big ? 0 : -4), rr - 2 + k * 1.5, hex('#121316'));
            g.disc(bx, by + (big ? 0 : -4), 2 + k, hex('#2a2c32'));
            g.px(bx - 2, by - 2 + (big ? 0 : -4), hex('#5a5e66'));
            if (!big) {
              g.disc(bx, by + 6, 3, ink);
              g.disc(bx, by + 6, 2, hex('#2a2e34'));
            }
            g.rect(bx - 10, by + 10, 3, 1, (Math.floor(t * 2 + c + r) % 3 === 0 && play > 0.5) ? lime : limeD);
          }
        g.glow(x + (cols * cw) / 2, y - (rows * ch) / 2, 60, lime, 0.02 + pump * 0.05, 4);

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
          if (ev < 2.5) g.textCenter(say, 196, 52 - ev * 2, mix(lime, hex('#04050a'), ev / 2.5));
          if (ev > 4.5) g.textCenter(say.toLowerCase(), 150, 44 - (ev - 4.5) * 2, mix(limeD, hex('#04050a'), (ev - 4.5) / 3.5));
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
        const ay = 138;
        const nodA = play > 0.4 ? f.pulse * 2 + Math.max(0, Math.sin(t * Math.PI * 1.4)) * 1 : 0;
        // legs + boots
        g.rect(ax - 5, ay - 12, 4, 12, suit[1]!);
        g.rect(ax + 1, ay - 12, 4, 12, suit[1]!);
        g.rect(ax - 6, ay - 2, 6, 3, suit[0]!);
        g.rect(ax + 1, ay - 2, 6, 3, suit[0]!);
        // backpack + body
        g.rect(ax + 4, ay - 30, 6, 14, suit[0]!);
        roundRect(g, ax - 7, ay - 31, 13, 20, 3, ink);
        roundRect(g, ax - 6, ay - 30, 11, 18, 3, suit[1]!);
        g.rect(ax - 6, ay - 28, 3, 14, suit[2]!);
        g.rect(ax - 4, ay - 24, 6, 4, hex('#2a3448'));
        g.px(ax - 3, ay - 23, lime);
        g.px(ax - 1, ay - 23, hex('#c84a3a'));
        g.rect(ax + 3, ay - 30, 2, 18, suit[1]!);
        // arms: one raised toward the stack
        const wave = play > 0.4 ? Math.round(Math.sin(t * 2.5) * 2) : 0;
        g.line(ax - 6, ay - 27, ax - 12, ay - 38 + wave, suit[1]!);
        g.line(ax - 5, ay - 27, ax - 11, ay - 38 + wave, suit[1]!);
        g.disc(ax - 12, ay - 39 + wave, 1, suit[0]!);
        g.line(ax + 4, ay - 26, ax + 7, ay - 18, suit[1]!);
        // helmet
        const hy = ay - 38 + Math.round(nodA);
        g.disc(ax, hy, 8, ink);
        g.disc(ax, hy, 7, suit[1]!);
        g.disc(ax - 2, hy - 2, 4, suit[2]!);
        g.ellipse(ax - 1, hy + 1, 5, 4, hex('#0a0e14'));
        g.ellipse(ax - 2, hy + 1, 3, 2, mix(hex('#3a6ab0'), hex('#0a0e14'), 0.5));
        g.px(ax - 4, hy - 1, hex('#e8eef8'));
        g.px(ax + 1, hy + 2, lime);
        void blinking;
      },
    };
  },
};

export default def;

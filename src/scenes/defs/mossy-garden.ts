// Snail Jams: a mossy garden in the blue hour after dusk. Two snails in tiny headphones inch
// along a leaf over the course of many minutes. Glowing mushrooms and fireflies are the only
// light; mist lies on the moss; a raindrop falls in slow motion.

import { Fog, haze } from '../kit/atmos';
import { hex, mix, mute, ramp, shade } from '../kit/color';
import { clamp, envelope, rampAt, stars } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { arc, dome } from '../kit/shapes';
import type { SceneDef } from '../types';

const LEAF = { ax: 40, ay: 132, bx: 292, by: 108, w: 24 };
const GROUND_Y = 128;

const leafY = (x: number) => LEAF.ay + ((x - LEAF.ax) / (LEAF.bx - LEAF.ax)) * (LEAF.by - LEAF.ay);

const def: SceneDef = {
  id: 'mossy-garden',
  fps: 15,
  focusY: 96,
  rareEvents: 3,
  rareDuration: 9,
  grade: { contrast: 1.12, saturation: 0.82, bloom: 0.8, threshold: 0.6, vignette: 0.45, temperature: -0.15 },
  create({ accent }) {
    const ink = hex('#070a08');
    const sky = [hex('#080816'), hex('#141228'), hex('#2e1e3a'), hex('#5a3442')];
    const far = hex('#0e1420');
    const mid = hex('#0c1a12');
    const moss = ramp([hex('#070e0a'), hex('#0e1c12'), hex('#18301e'), hex('#284a28')], 5);
    const leafR = ramp([shade(accent, 0.16), shade(accent, 0.3), mute(accent, 0.75, 0.48), mute(accent, 0.7, 0.66), mix(mute(accent, 0.7), hex('#e8f0c8'), 0.25)], 6);
    const cap = ramp([hex('#1e080a'), hex('#461414'), hex('#6e2820'), hex('#985040')], 5);
    const stem = ramp([hex('#3a342e'), hex('#6e6658'), hex('#988e7a')], 3);
    const glowM = hex('#6ae0c0');
    const shell = ramp([hex('#2a140c'), hex('#5a3018'), hex('#8a5a2e'), hex('#b8884e')], 5);
    const slime = ramp([hex('#3e4a40'), hex('#6a7a6a'), hex('#9aaa92')], 3);
    const fly = hex('#d8f08a');
    const mist = new Fog({ scale: 60, squash: 0.3, patchy: 0.55, seed: 11 });

    const drawSnail = (g: Gfx, x: number, t: number, bob: number, window: number, turn: number, seed: number) => {
      // the foot stretches and gathers as it crawls
      const crawl = (Math.sin(t * 0.9 + seed) + 1) * 0.5;
      const front = Math.round(x + 9 + crawl * 2);
      const back = Math.round(x - 10);
      for (let xx = back; xx <= front; xx++) {
        const u = (xx - back) / (front - back);
        const h = Math.round(2 + Math.sin(u * Math.PI) * 1.5);
        const yy = Math.round(leafY(xx)) - 1;
        g.rect(xx, yy - h, 1, h + 1, ink);
        g.rect(xx, yy - h + 1, 1, h, rampAt(slime, 0.4 + (1 - u) * 0.3, xx, yy));
      }
      // head + eye stalks
      const hx = front - 1;
      const hy = Math.round(leafY(hx)) - 4;
      g.ellipse(hx, hy, 3, 3, ink);
      g.ellipse(hx, hy, 2, 2, slime[1]!);
      const look = turn;
      for (let s = 0; s < 2; s++) {
        const sx = hx - 1 + s * 3;
        const tipx = sx + 1 + s - look * 2;
        const tipy = hy - 7 - s + Math.round(bob);
        g.line(sx, hy - 2, tipx, tipy, slime[0]!);
        g.disc(tipx, tipy, 1, ink);
        g.px(tipx, tipy - 1, slime[2]!);
      }
      // tiny headphones
      {
        arc(g, hx + 1, hy - 3, 4, 3, Math.PI, Math.PI * 2, hex('#2a2a38'));
        g.rect(hx - 3, hy - 3, 2, 3, accent);
        g.rect(hx + 4, hy - 3, 2, 3, accent);
      }
      // shell with a spiral
      const sx = x - 3;
      const sy = Math.round(leafY(sx)) - 10;
      g.disc(sx, sy, 8, ink);
      g.ball(sx, sy, 7, 7, shell, -0.6, -0.6, 0.25);
      let px = sx;
      let py = sy;
      for (let k = 0; k < 40; k++) {
        const a = k * 0.32;
        const r = 6 - k * 0.14;
        const qx = sx + Math.cos(a + 1) * r;
        const qy = sy + Math.sin(a + 1) * r;
        if (k > 0) g.line(px, py, qx, qy, shell[0]!);
        px = qx;
        py = qy;
      }
      if (window > 0) {
        g.rect(sx + 1, sy - 3, 4, 4, ink);
        g.rect(sx + 2, sy - 2, 2, 2, hex('#ffd88a'));
        g.glow(sx + 3, sy - 1, 6, hex('#ffd88a'), window * 0.6);
      }
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, GROUND_Y - 30);
        stars(g, 0, g.left, g.top, g.right, 60, 0.2, hex('#c8c0d8'), 3, 0);
        g.glow(230, GROUND_Y - 40, 90, hex('#b8604a'), 0.12, 6);
        // Far and mid silhouettes: grass blades and fern fronds.
        for (let x = g.left; x < g.right; x++) {
          const h1 = 30 + fbm(x / 22, 0, 4, 3) * 50 + (hash3(x, 1) > 0.9 ? 8 : 0);
          g.rect(x, GROUND_Y - h1, 1, h1 + 6, far);
        }
        haze(g, hex('#2a2238'), GROUND_Y - 80, GROUND_Y + 4, 0.15, 0.4, g.top, GROUND_Y + 6);
        for (let i = 0; i < 40; i++) {
          const bx = -60 + i * 12 + hash3(i, 2) * 8;
          const h = 30 + hash3(i, 3) * 40;
          const lean = (hash3(i, 4) - 0.5) * 16;
          for (let k = 0; k < h; k++) {
            const u = k / h;
            const w = Math.max(1, Math.round((1 - u) * 3));
            g.rect(bx + lean * u * u, GROUND_Y + 4 - k, w, 1, mid);
          }
        }
        // Big red-capped mushroom on the left, smaller ones beside it.
        const mush = (x: number, y: number, h: number, r: number) => {
          g.rect(x - Math.round(r * 0.22) - 1, y - h, Math.round(r * 0.44) + 2, h, ink);
          for (let yy = y - h; yy < y; yy++)
            for (let xx = x - Math.round(r * 0.22); xx < x + Math.round(r * 0.22); xx++)
              g.px(xx, yy, rampAt(stem, 1 - Math.abs(xx - x + r * 0.08) / (r * 0.3), xx, yy));
          dome(g, x, y - h + 1, r + 1, r * 0.62 + 1, ink);
          for (let dy = -Math.ceil(r * 0.62); dy <= 0; dy++)
            for (let dx = -r; dx <= r; dx++) {
              const nx = dx / (r + 0.5);
              const ny = dy / (r * 0.62 + 0.5);
              if (nx * nx + ny * ny >= 1) continue;
              const l = clamp(0.25 + -nx * 0.35 + -ny * 0.55);
              g.px(x + dx, y - h + dy, rampAt(cap, l, x + dx, y + dy));
            }
          g.rect(x - r, y - h, r * 2 + 1, 2, shade(cap[1]!, 0.7));
          for (let i = 0; i < Math.round(r / 2); i++) {
            const a = Math.PI + 0.3 + (i / Math.max(1, r / 2 - 1)) * (Math.PI - 0.6);
            g.disc(x + Math.cos(a) * r * 0.62, y - h + Math.sin(a) * r * 0.42, r > 12 ? 1.5 : 1, hex('#9a8e7e'));
          }
        };
        mush(78, GROUND_Y + 2, 62, 26);
        mush(112, GROUND_Y + 4, 28, 12);
        mush(46, GROUND_Y + 2, 20, 9);
        // Glowing teal mushrooms on the right (glow animated per frame).
        const tealC = ramp([hex('#0a3a3a'), hex('#1a7a6e'), hex('#6ae0c0')], 3);
        const tm = (x: number, y: number, h: number, r: number) => {
          g.rect(x - 1, y - h, 2, h, hex('#7ab0a0'));
          dome(g, x, y - h + 1, r + 1, r * 0.7 + 1, ink);
          g.ball(x, y - h, r, r * 0.6, tealC, -0.4, -0.7, 0.4);
          g.rect(x - r, y - h, r * 2 + 1, 1, tealC[0]!);
        };
        tm(232, GROUND_Y + 2, 36, 7);
        tm(246, GROUND_Y + 2, 27, 5);
        tm(258, GROUND_Y + 3, 46, 9);
        tm(272, GROUND_Y + 2, 24, 4);

        // Moss ground.
        for (let y = GROUND_Y; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 9, y / 6, 8, 3);
            const top = GROUND_Y + Math.sin(x * 0.11) * 2 + fbm(x / 7, 0, 3, 2) * 4;
            if (y < top) continue;
            g.px(x, y, rampAt(moss, n * 1.1 - (y - GROUND_Y) / 200, x, y));
          }
        // Pebbles and clover.
        for (let i = 0; i < 14; i++) {
          const px = -40 + hash3(i, 9) * 400;
          const py = GROUND_Y + 14 + hash3(i, 10) * 70;
          g.ellipse(px, py, 3 + (i % 3), 2, hex('#22242a'));
          g.px(px - 1, py - 1, hex('#3e4048'));
        }

        // The big leaf.
        const len = LEAF.bx - LEAF.ax;
        for (let x = LEAF.ax; x <= LEAF.bx; x++) {
          const u = (x - LEAF.ax) / len;
          const hw = LEAF.w * Math.sin(Math.PI * u) ** 0.75 * (u < 0.1 ? u / 0.1 : 1);
          const cy = leafY(x);
          const top = Math.round(cy - hw * 0.62);
          const bot = Math.round(cy + hw * 0.45);
          g.vline(x, top - 1, bot + 1, ink);
          for (let y = top; y <= bot; y++) {
            const v = (y - cy) / (hw + 0.01);
            let l = v < 0 ? 0.62 - v * 0.35 : 0.45 - v * 0.8;
            const vein = Math.abs(((x - LEAF.ax) * 0.5 - Math.abs(y - cy) * 1.3) % 14) < 0.8;
            if (vein) l += 0.18;
            g.px(x, y, rampAt(leafR, l, x, y));
          }
          g.px(x, Math.round(cy), leafR[4]!);
        }
        // stem
        g.line(LEAF.ax - 18, LEAF.ay + 14, LEAF.ax, LEAF.ay, leafR[1]!);
        g.line(LEAF.ax - 18, LEAF.ay + 15, LEAF.ax, LEAF.ay + 1, leafR[0]!);
        // dewdrops
        for (const [dx, dr] of [[88, 2], [146, 3], [204, 2], [250, 2], [120, 1]] as const) {
          const dy = leafY(dx) + (dr > 1 ? 7 : -6);
          g.disc(dx, dy, dr, mix(leafR[3]!, hex('#b8e8d8'), 0.35));
          g.px(dx - Math.floor(dr / 2), dy - Math.floor(dr / 2), hex('#d8f0e8'));
          g.px(dx + Math.floor(dr / 2), dy + Math.floor(dr / 2), shade(leafR[1]!, 0.8));
        }
        void bayer;
        g.lighting(0.5);
        g.light(252, GROUND_Y - 36, 56, 0.65, 44);
        g.light(160, 118, 120, 0.25, 40);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;

        // Glowing mushrooms breathe with the music.
        const mg = 0.18 + 0.08 * Math.sin(t * 0.8) + f.energy * 0.25;
        g.glow(232, GROUND_Y - 34, 12, glowM, mg, 4);
        g.glow(258, GROUND_Y - 43, 16, glowM, mg, 4);
        g.glow(246, GROUND_Y - 25, 8, glowM, mg * 0.8, 4);

        // Snails: a very slow commute. Positions are pure functions of time.
        const len = LEAF.bx - LEAF.ax - 60;
        const speed = 0.11 * (0.5 + 0.5 * f.awake);
        const bump = f.rare === 1 && ev < 9 ? envelope(ev, 9, 2, 2) : 0;
        const x1 = LEAF.ax + 26 + ((t * speed + 70) % len);
        let x2 = LEAF.ax + 26 + ((t * speed + 70 + 46) % len);
        if (bump > 0) x2 = x1 + 30 - bump * 6;
        const bob = f.reduced ? 0 : f.pulse * 1.2;
        drawSnail(g, x2, t, bob, 0, bump > 0.5 ? 1 : 0, 2);
        const win = f.rare === 0 && ev < 9 ? envelope(ev, 9, 1, 1.5) : 0;
        drawSnail(g, x1, t, bob, win, 0, 0);
        if (bump > 0.7) {
          const hx = (x1 + 12 + x2 - 4) / 2;
          const hy = leafY(hx) - 20 - (ev % 2) * 3;
          g.px(hx - 1, hy, hex('#ff8fa0'));
          g.px(hx + 1, hy, hex('#ff8fa0'));
          g.hline(hx - 1, hx + 1, hy + 1, hex('#ff8fa0'));
          g.px(hx, hy + 2, hex('#ff8fa0'));
        }

        // A ladybug hurries by (relatively speaking).
        if (f.rare === 2 && ev < 9) {
          const lx = LEAF.bx - 20 - (ev / 9) * (LEAF.bx - LEAF.ax - 30);
          const ly = leafY(lx) + 4;
          g.disc(lx, ly, 3, ink);
          g.disc(lx, ly, 2, hex('#e0302a'));
          g.px(lx - 1, ly - 1, ink);
          g.px(lx + 1, ly + 1, ink);
          g.px(lx - 3, ly, ink);
          if (Math.floor(ev * 8) % 2) g.px(lx + 1, ly + 3, ink);
          else g.px(lx - 1, ly + 3, ink);
        }

        // Slow-motion raindrop every ~24 s.
        const cyc = 24;
        const k = Math.floor(t / cyc);
        const p = t - k * cyc;
        const rx = LEAF.ax + 40 + hash3(k, 7) * (LEAF.bx - LEAF.ax - 80);
        const ry = leafY(rx) - 6;
        const fallT = 6;
        if (p < fallT) {
          const y = g.top - 4 + (ry - g.top + 4) * (p / fallT) ** 1.4;
          g.ellipse(rx, y, 1, 2, hex('#cfe8ff'));
          g.px(rx, y - 1, hex('#ffffff'));
          g.pxA(rx, y - 3, hex('#cfe8ff'), 0.4);
        } else if (p < fallT + 1.6) {
          const s = (p - fallT) / 1.6;
          for (let i = 0; i < 6; i++) {
            const a = Math.PI + (i / 5) * Math.PI;
            g.pxA(rx + Math.cos(a) * s * 9, ry + Math.sin(a) * s * 6 + s * s * 6, hex('#cfe8ff'), 1 - s);
          }
          g.ellipseA(rx, ry + 2, 2 + s * 6, 1, hex('#e0f0ff'), 0.5 * (1 - s));
        }

        // Mist on the moss, drifting past the mushrooms' feet.
        mist.draw(g, t, GROUND_Y - 12, GROUND_Y + 34, hex('#3a4a52'), 0.45, 1.6, 'band', 6);

        // Fireflies drifting and blinking.
        for (let i = 0; i < 14; i++) {
          const fx = 160 + Math.sin(t * 0.13 * (1 + hash3(i, 1)) + i * 2.1) * 150 + Math.sin(t * 0.7 + i) * 4;
          const fy = 70 + Math.sin(t * 0.17 * (1 + hash3(i, 2)) + i * 1.3) * 50 + Math.cos(t * 0.5 + i) * 3;
          const blink = Math.max(0, Math.sin(t * (0.8 + hash3(i, 3)) + i * 5));
          const k2 = blink * blink * (0.6 + f.energy * 0.6);
          if (k2 < 0.05) continue;
          g.px(fx, fy, mix(hex('#4a5a20'), fly, k2));
          g.glow(fx, fy, 7, fly, k2 * 0.55, 3);
        }
      },
    };
  },
};

export default def;

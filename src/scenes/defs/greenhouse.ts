// Plant FM: a sunlit greenhouse full of houseplants all leaning toward a small radio on the
// bench. Dust turns in the sunbeams, a fern unfurls very slowly, a watering can waits, and a
// cactus is wearing headphones.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { motes, shaft, vignette } from './lib/night';

const BENCH_Y = 104;
const RADIO = { x: 160, y: BENCH_Y };
const POTS = [
  { x: 74, kind: 0 },
  { x: 106, kind: 1 },
  { x: 132, kind: 2 },
  { x: 192, kind: 3 },
  { x: 220, kind: 4 },
  { x: 250, kind: 5 },
];

const def: SceneDef = {
  id: 'greenhouse',
  fps: 12,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const ink = hex('#040805');
    const iron = hex('#0c140e');
    const leaf: Color[] = [hex('#0e2414'), hex('#1a3a1e'), hex('#2a5a2a'), mix(hex('#4a8a3a'), accent, 0.25)];
    const sun = hex('#ffd890');
    const pot = [hex('#4a2a1a'), hex('#6a3a22'), hex('#8a5232')];

    const potAt = (g: Gfx, x: number, w: number, h: number) => {
      g.poly([x - w, BENCH_Y - h, x + w, BENCH_Y - h, x + w - 2, BENCH_Y, x - w + 2, BENCH_Y], pot[1]!);
      g.rect(x - w - 1, BENCH_Y - h - 2, w * 2 + 2, 3, pot[2]!);
      g.vline(x + w - 2, BENCH_Y - h + 1, BENCH_Y - 1, pot[0]!);
    };

    const leafAt = (g: Gfx, x: number, y: number, a: number, len: number, wid: number, c: Color) => {
      const ex = x + Math.cos(a) * len;
      const ey = y + Math.sin(a) * len;
      const nx = -Math.sin(a) * wid;
      const ny = Math.cos(a) * wid;
      const mx = (x + ex) / 2;
      const my = (y + ey) / 2;
      g.tri(x, y, mx + nx, my + ny, ex, ey, c);
      g.tri(x, y, mx - nx, my - ny, ex, ey, shade(c, 0.8));
      g.line(x, y, ex, ey, shade(c, 0.6));
    };

    return {
      background(g) {
        // Outside, through old glass: a soft bright haze of garden.
        g.vgrad([hex('#c8b890'), hex('#a8a070'), hex('#5a6a40'), hex('#2a3a20')], g.top, BENCH_Y);
        for (let y = 40; y < BENCH_Y; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 22, y / 14, 7, 3);
            if (n > 0.5 + (BENCH_Y - y) * 0.004) g.px(x, y, mix(hex('#3a5a2a'), hex('#6a7a4a'), n - 0.5));
          }
        // Glass panes and the iron frame; a glazing bar every 24 px, an arch overhead.
        for (let x = g.left - (g.left % 24) - 24; x < g.right; x += 24) {
          g.rect(x, g.top, 2, BENCH_Y - g.top, iron);
          for (let y = g.top; y < BENCH_Y; y += 30) g.rect(x, y, 24, 1, iron);
        }
        for (let x = g.left; x < g.right; x++) {
          const y = 18 - Math.cos(((x - 160) / 260) * Math.PI) * 30;
          g.rect(x, y, 1, 3, iron);
          g.vline(x, g.top, y, mix(iron, hex('#2a3a28'), 0.3));
        }
        // condensation beads on the glass
        for (let i = 0; i < 260; i++) {
          const x = g.left + hash3(i, 1) * g.w;
          const y = 20 + hash3(i, 2) * 80;
          g.pxA(x, y, hex('#e8f0e0'), 0.35);
        }
        // a hazy wash so it all sits back
        g.rectA(g.left, g.top, g.w, BENCH_Y - g.top, hex('#2a3020'), 0.4);
        g.glow(250, 10, 160, sun, 0.12, 6);

        // The staging bench: slatted wood, and the floor of old brick below.
        g.rect(g.left, BENCH_Y, g.w, 5, hex('#3a2a1a'));
        for (let x = g.left; x < g.right; x += 6) g.vline(x, BENCH_Y, BENCH_Y + 4, hex('#24180e'));
        g.hline(g.left, g.right, BENCH_Y, hex('#6a5034'));
        for (let y = BENCH_Y + 5; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const row = Math.floor(y / 5);
            const edge = y % 5 === 0 || (x + (row % 2) * 6) % 12 === 0;
            g.px(x, y, edge ? hex('#120c08') : hash3(Math.floor((x + (row % 2) * 6) / 12), row, 2) > 0.5 ? hex('#2a1a12') : hex('#22160e'));
          }
        g.rect(g.left, BENCH_Y + 5, g.w, 14, hex('#0e0a06'));
        for (let x = g.left - (g.left % 70); x < g.right; x += 70) g.rect(x + 10, BENCH_Y + 5, 4, 34, hex('#2a1c12'));

        // The little radio in the middle of the bench (dial lit per frame).
        const { x, y } = RADIO;
        g.rect(x - 13, y - 14, 26, 14, hex('#5a3a22'));
        g.rect(x - 13, y - 14, 26, 1, hex('#8a6040'));
        for (let k = 0; k < 6; k++) g.vline(x - 10 + k * 2, y - 11, y - 3, hex('#3a2414'));
        g.rect(x + 1, y - 11, 10, 4, hex('#1a1408'));
        g.disc(x + 4, y - 4, 1, hex('#c8a060'));
        g.disc(x + 9, y - 4, 1, hex('#c8a060'));
        g.line(x + 8, y - 14, x + 16, y - 26, hex('#8a8a90'));

        // The watering can on the floor at the left.
        g.ellipse(48, 134, 14, 3, ink);
        g.rect(38, 120, 20, 14, hex('#3a4a40'));
        g.hline(38, 57, 120, hex('#6a7a6a'));
        g.line(57, 126, 68, 116, hex('#3a4a40'));
        g.line(57, 127, 68, 117, hex('#3a4a40'));
        g.rect(66, 114, 4, 3, hex('#4a5a50'));
        g.line(40, 120, 48, 112, hex('#4a5a50'));
        g.line(48, 112, 56, 120, hex('#4a5a50'));

        // Pots.
        for (const p of POTS) potAt(g, p.x, p.kind === 3 ? 8 : 10, p.kind === 3 ? 10 : 14);
        vignette(g, 0.45, 160, 80, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const e = f.energy;
        // Everyone leans toward the radio; more so when the song is good (rare).
        const keen = f.rare === 0 && ev < 12 ? envelope(ev, 12, 3, 3) : 0;
        const breeze = f.reduced ? 0 : Math.sin(t * 0.3) * 0.05;

        // Sunbeams through the glass.
        const sk = 0.09 * (0.7 + 0.3 * awake);
        shaft(g, 40, g.top - 10, 120, 140, 20, 50, sun, sk, 0.4, 5);
        shaft(g, 130, g.top - 10, 200, 140, 16, 40, sun, sk * 0.8, 0.4, 5);
        shaft(g, 230, g.top - 10, 300, 140, 20, 50, sun, sk, 0.4, 5);
        motes(g, t, 40, 10, 260, 110, 50, sun, 0.5, 9, 0.2);

        for (let i = 0; i < POTS.length; i++) {
          const p = POTS[i]!;
          const toward = p.x < RADIO.x ? 1 : -1;
          const lean = toward * (0.25 + keen * 0.35) + breeze;
          const bx = p.x;
          const by = BENCH_Y - (p.kind === 3 ? 12 : 16);
          if (p.kind === 0) {
            // a big monstera, leaves on long stalks
            for (let k = 0; k < 5; k++) {
              const a = -Math.PI / 2 + (k - 2) * 0.5 + lean;
              const len = 26 + (k % 2) * 9;
              const sx = bx + Math.cos(a) * len;
              const sy = by + Math.sin(a) * len;
              g.line(bx, by, sx, sy, leaf[1]!);
              g.ellipse(sx, sy, 9, 6, leaf[0]!);
              g.ellipse(sx, sy, 8, 5, leaf[k % 2 ? 2 : 1]!);
              g.line(sx - 6, sy + 1, sx + 6, sy - 1, leaf[0]!);
              g.px(sx - 3, sy - 2, leaf[0]!);
              g.px(sx + 3, sy + 2, leaf[0]!);
              g.ellipse(sx - 2, sy - 2, 3, 1, leaf[3]!);
            }
          } else if (p.kind === 1) {
            // a snake plant: tall blades
            for (let k = 0; k < 5; k++) {
              const a = -Math.PI / 2 + (k - 2) * 0.16 + lean * 0.8;
              leafAt(g, bx - 5 + k * 2.5, by, a, 30 + (k % 3) * 7, 3, leaf[k % 2 ? 2 : 3]!);
            }
          } else if (p.kind === 2) {
            // the fern, one frond unfurling very slowly
            for (let k = 0; k < 6; k++) {
              const a = -Math.PI / 2 + (k - 2.5) * 0.4 + lean;
              let px = bx;
              let py = by;
              for (let s = 1; s <= 8; s++) {
                const nx = bx + Math.cos(a + s * 0.05) * s * 3.6;
                const ny = by + Math.sin(a + s * 0.05) * s * 3.6 + s * s * 0.12;
                g.line(px, py, nx, ny, leaf[2]!);
                g.px(nx - 1, ny + 1, leaf[3]!);
                g.px(nx + 1, ny + 1, leaf[1]!);
                px = nx;
                py = ny;
              }
            }
            const unfurl = f.reduced ? 0.5 : (t / 400) % 1;
            const cx = bx + 2 + lean * 6;
            const cy = by - 26;
            const turns = (1 - unfurl) * 2.5;
            for (let s = 0; s < 20; s++) {
              const u = s / 20;
              const r = 5 * (1 - u * 0.8);
              const a = u * turns * Math.PI * 2;
              g.px(cx + Math.cos(a) * r * (1 - unfurl * 0.5) + unfurl * u * 10, cy + Math.sin(a) * r - unfurl * u * 6, leaf[3]!);
            }
            g.line(bx, by, cx, cy + 4, leaf[2]!);
          } else if (p.kind === 3) {
            // the cactus, in headphones
            const lx = Math.round(lean * 4);
            const cx0 = bx + lx;
            g.rect(cx0 - 5, by - 26, 11, 26, leaf[1]!);
            g.rect(cx0 - 4, by - 28, 9, 2, leaf[1]!);
            g.rect(cx0 - 3, by - 26, 3, 25, leaf[2]!);
            g.vline(cx0 + 4, by - 25, by - 1, leaf[0]!);
            g.vline(cx0 - 1, by - 27, by - 1, leaf[3]!);
            g.rect(cx0 - 11, by - 16, 6, 3, leaf[1]!);
            g.rect(cx0 - 11, by - 22, 3, 6, leaf[2]!);
            g.rect(cx0 + 6, by - 12, 5, 3, leaf[1]!);
            g.rect(cx0 + 8, by - 17, 3, 5, leaf[2]!);
            for (let k = 0; k < 7; k++) g.px(cx0 - 3 + (k % 2) * 6, by - 24 + k * 3, hex('#d8d8c0'));
            // headphones: band over the top, a cup either side, a light that blinks to the beat
            const hp = hex('#16161c');
            g.line(cx0 - 6, by - 20, cx0 - 5, by - 28, hp);
            g.line(cx0 - 5, by - 28, cx0 - 2, by - 31, hp);
            g.hline(cx0 - 2, cx0 + 2, by - 31, hp);
            g.line(cx0 + 2, by - 31, cx0 + 5, by - 28, hp);
            g.line(cx0 + 5, by - 28, cx0 + 6, by - 20, hp);
            g.rect(cx0 - 8, by - 22, 3, 6, hex('#2a2a32'));
            g.rect(cx0 + 6, by - 22, 3, 6, hex('#2a2a32'));
            g.px(cx0 - 7, by - 21, hex('#4a4a54'));
            g.px(cx0 + 7, by - 19, f.pulse > 0.4 ? accent : shade(accent, 0.4));
            // a bloom, in a rare moment, which then takes a bow
            if (f.rare === 3 && ev < 12) {
              const k = envelope(ev, 12, 2, 2);
              const bow = ev > 6 && ev < 8.5 ? 3 : 0;
              g.disc(bx + lx + bow, by - 33 - Math.round(k * 2) + bow, Math.max(0.5, k * 2.5), hex('#e86a8a'));
              g.px(bx + lx + bow, by - 33 - Math.round(k * 2) + bow, hex('#ffe0a0'));
            }
          } else if (p.kind === 4) {
            // pothos, trailing over the bench edge
            for (let k = 0; k < 4; k++) {
              let px = bx - 4 + k * 3;
              let py = by;
              for (let s = 0; s < 10 + k * 2; s++) {
                const nx = px + (k < 2 ? -1 : 1) * 0.6 + lean * 0.3;
                const ny = py + (s < 3 ? -1 : 1.4);
                g.line(px, py, nx, ny, leaf[1]!);
                if (s % 2 === 0) g.ellipse(nx, ny, 2, 1, leaf[(s + k) % 2 ? 2 : 3]!);
                px = nx;
                py = ny;
              }
            }
          } else {
            // a rubber plant, broad glossy leaves
            for (let k = 0; k < 5; k++) {
              const a = -Math.PI / 2 + (k - 2) * 0.45 + lean;
              leafAt(g, bx, by - k * 6, a, 16, 5, leaf[k % 2 ? 3 : 2]!);
            }
            g.vline(bx, by - 26, by, leaf[0]!);
          }
        }

        // A hanging basket, trailing.
        g.line(236, g.top, 236, 24, iron);
        g.ellipse(236, 28, 10, 5, pot[0]!);
        for (let k = 0; k < 6; k++) {
          let px = 228 + k * 3;
          let py = 30;
          for (let s2 = 0; s2 < 10 + (k % 3) * 5; s2++) {
            const nx = px + Math.sin(s2 * 0.5 + k + (f.reduced ? 0 : t * 0.4)) * 0.6;
            const ny = py + 1.6;
            g.line(px, py, nx, ny, leaf[1]!);
            if (s2 % 3 === 0) g.ellipse(nx, ny, 2, 1, leaf[(s2 + k) % 2 ? 2 : 0]!);
            px = nx;
            py = ny;
          }
        }

        // The radio's dial, and the music it is offering.
        g.rect(RADIO.x + 2, RADIO.y - 10, 8, 2, mix(hex('#1a1408'), accent, 0.5 + e * 0.4));
        g.glow(RADIO.x + 6, RADIO.y - 9, 10, accent, 0.15 + e * 0.15);
        if (!f.reduced)
          for (let k = 0; k < 3; k++) {
            const p = (t * 0.25 + k / 3) % 1;
            g.pxA(RADIO.x - 4 + Math.sin(p * 6 + k) * 3, RADIO.y - 18 - p * 16, accent, 0.4 * (1 - p) * awake);
          }

        // Rare: a snail crosses the top of the radio, at snail speed.
        if (f.rare === 1 && ev < 12) {
          const p = clamp(ev / 12);
          const sx = RADIO.x - 14 + p * 28;
          const sy = RADIO.y - 15;
          g.ellipse(sx, sy, 3, 1, hex('#8a8070'));
          g.disc(sx - 1, sy - 2, 2, hex('#7a5a3a'));
          g.px(sx - 1, sy - 2, hex('#c8a070'));
          g.px(sx + 3, sy - 2, hex('#8a8070'));
        }
        // Rare: the watering can tips itself over the nearest plant.
        if (f.rare === 2 && ev < 12) {
          const k = envelope(ev, 12, 2, 2);
          if (k > 0.5)
            for (let i = 0; i < 8; i++) {
              const p = (ev * 1.5 + i / 8) % 1;
              g.px(70 + p * 2, 110 - (1 - p) * 4 - 0 + p * 0, hex('#a8c8d8'));
              g.pxA(68 + i * 0.5, 112 + p * 6, hex('#a8c8d8'), 0.6);
            }
          g.glow(74, 100, 12, accent, 0.15 * k);
        }
        void bayer;
        void smoothstep;
      },
    };
  },
};

export default def;

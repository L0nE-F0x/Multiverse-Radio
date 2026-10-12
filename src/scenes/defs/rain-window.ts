// Rainfall FM: a dark kitchen with a big rainy window at night, over a city where everyone
// travels under floating umbrellas. A kettle steams on the stove; lightning flashes very far
// away.

import { gloom, haze } from '../kit/atmos';
import { hex, hsv, mix, mute, shade } from '../kit/color';
import { blinking, clamp, envelope, steam } from '../kit/fx';
import { bayer } from '../kit/gfx';
import { hash3, noise1 } from '../kit/rng';
import type { Gfx } from '../kit/gfx';
import { arc, dome, frameRect, roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';

const GL = { x: 54, y: 12, w: 212, h: 106 };
const MULL_X = 158;
const COUNTER_Y = 124;
const STREET_Y = 108;

interface Umbrella {
  y: number;
  speed: number;
  phase: number;
  color: number;
  size: number;
  coat: number;
}

const def: SceneDef = {
  id: 'rain-window',
  fps: 20,
  rareEvents: 3,
  rareDuration: 8,
  focusY: 80,
  grade: { temperature: -0.2, contrast: 1.12, saturation: 0.8, bloom: 0.7, threshold: 0.62, vignette: 0.45, shadows: '#04060c' },
  create({ accent, rng }) {
    const ink = hex('#05080e');
    const wallC = [hex('#0a121c'), hex('#0e1824'), hex('#131f2e')];
    const sky = [hex('#060c1c'), hex('#0e1a33'), hex('#1d2a4c'), hex('#3a2f5a')];
    const far = hex('#16223c');
    const near = hex('#0b1426');
    const frameC = { d: hex('#0a0f17'), m: hex('#1f2a36'), l: hex('#33414f') };
    const woodC = { d: hex('#24170f'), m: hex('#3a2617'), l: hex('#5a3c24'), h: hex('#7a5434') };
    const rain = mix(accent, hex('#ffffff'), 0.35);
    const neon = [hex('#ff4fa3'), hex('#4fe3ff'), hex('#ffd34f'), accent].map((c) => mute(c, 0.75, 0.9));
    const warm = hex('#ffb070');

    const umbrellas: Umbrella[] = [];
    const ucol = [hex('#ff6b8a'), hex('#ffd34f'), hex('#6fe3c8'), hex('#c49bff'), hex('#ff9e5a'), accent].map((c) => mute(c, 0.6, 0.75));
    for (let i = 0; i < 7; i++) {
      umbrellas.push({
        y: 28 + i * 11 + rng.range(-4, 4),
        speed: rng.range(2.5, 6) * rng.sign(),
        phase: rng.range(0, 400),
        color: ucol[i % ucol.length]!,
        size: i < 3 ? 4 : i < 5 ? 6 : 8,
        coat: rng.pick([hex('#2a3a5a'), hex('#4a2a3a'), hex('#2a4a3a')]),
      });
    }
    umbrellas.sort((a, b) => a.size - b.size);

    // Droplets on the glass: x, speed, phase.
    const drops: { x: number; sp: number; ph: number; r: number }[] = [];
    for (let i = 0; i < 34; i++) drops.push({ x: GL.x + rng.range(2, GL.w - 2), sp: rng.range(2, 7), ph: rng.range(0, 200), r: rng.chance(0.3) ? 2 : 1 });

    const buildings = (g: Gfx, seed: number, base: number, minH: number, maxH: number, col: number, lit: number, litP: number) => {
      let x = GL.x - 6;
      let i = 0;
      while (x < GL.x + GL.w + 6) {
        const w = 10 + Math.floor(hash3(i, seed) * 18);
        const h = minH + Math.floor(hash3(i, seed, 1) * (maxH - minH));
        g.rect(x, base - h, w, h, col);
        if (hash3(i, seed, 2) > 0.6) g.rect(x + w / 2 - 1, base - h - 6, 1, 6, col);
        if (hash3(i, seed, 3) > 0.7) g.rect(x + 2, base - h - 3, w - 4, 3, col);
        for (let wy = base - h + 3; wy < base - 3; wy += 4)
          for (let wx = x + 2; wx < x + w - 2; wx += 3)
            if (hash3(wx, wy, seed) < litP) g.px(wx, wy, mix(lit, col, hash3(wx, wy, seed + 9) * 0.6));
        x += w + 1;
        i++;
      }
    };

    return {
      background(g) {
        // Interior wall.
        g.vgrad(wallC, g.top, COUNTER_Y);
        for (let y = g.top; y < COUNTER_Y; y++)
          for (let x = g.left; x < g.right; x++) if (hash3(x, y, 5) < 0.04) g.px(x, y, wallC[2]!);

        // Outside: sky, haze, two layers of skyline, street with reflections.
        g.clip(GL.x, GL.y, GL.w, GL.h);
        g.gradRect(GL.x, GL.y, GL.w, GL.h, sky);
        g.glow(120, STREET_Y - 10, 90, hex('#ff4fa3'), 0.12, 6);
        g.glow(220, STREET_Y - 6, 70, hex('#4fe3ff'), 0.1, 6);
        buildings(g, 11, STREET_Y - 6, 26, 70, far, hex('#5a6a9a'), 0.12);
        // Rain haze between the far skyline and the near one.
        haze(g, hex('#2a3656'), GL.y, STREET_Y, 0.45, 0.15);
        buildings(g, 23, STREET_Y, 14, 50, near, hex('#e0b878'), 0.2);
        // Neon signs.
        const sign = (x: number, y: number, text: string, c: number) => {
          const w = text.length * 4 + 3;
          g.rect(x, y, w, 9, hex('#05070d'));
          frameRect(g, x, y, w, 9, c);
          g.text(text, x + 2, y + 2, c);
          g.glow(x + w / 2, y + 4, w * 0.8, c, 0.18, 4);
        };
        sign(76, 64, 'NOODLES', neon[0]!);
        sign(190, 54, 'OPEN', neon[1]!);
        sign(222, 78, 'DRY?', neon[2]!);
        sign(126, 82, 'UMBRELLA', neon[3]!);
        // Wet street with streaky reflections.
        g.gradRect(GL.x, STREET_Y, GL.w, GL.y + GL.h - STREET_Y, [hex('#0b1222'), hex('#141c30')]);
        for (let x = GL.x; x < GL.x + GL.w; x++)
          for (let y = STREET_Y; y < GL.y + GL.h; y++) {
            const c = x > 74 && x < 106 ? neon[0]! : x > 188 && x < 210 ? neon[1]! : x > 124 && x < 160 ? neon[3]! : x > 220 && x < 238 ? neon[2]! : 0;
            if (c && hash3(x, y, 7) < 0.35 * (1 - (y - STREET_Y) / 12) && (x + y) % 2 === 0) g.pxA(x, y, c, 0.5);
          }
        g.noClip();

        // Window frame, mullion, transom.
        g.rect(GL.x - 6, GL.y - 6, GL.w + 12, 6, frameC.m);
        g.rect(GL.x - 6, GL.y + GL.h, GL.w + 12, 6, frameC.m);
        g.rect(GL.x - 6, GL.y, 6, GL.h, frameC.m);
        g.rect(GL.x + GL.w, GL.y, 6, GL.h, frameC.m);
        g.rect(MULL_X - 2, GL.y, 4, GL.h, frameC.m);
        g.rect(GL.x, 58, GL.w, 3, frameC.m);
        frameRect(g, GL.x - 7, GL.y - 7, GL.w + 14, GL.h + 14, frameC.d);
        g.rect(GL.x - 6, GL.y - 6, GL.w + 12, 1, frameC.l);
        g.rect(MULL_X - 2, GL.y, 1, GL.h, frameC.l);

        // Counter, cabinets, floor.
        g.rect(g.left, COUNTER_Y, g.w, 5, woodC.l);
        g.rect(g.left, COUNTER_Y, g.w, 1, woodC.h);
        g.vgrad([woodC.m, woodC.d], COUNTER_Y + 5, 180, COUNTER_Y + 5, 182);
        for (let x = -60; x < 400; x += 46) {
          frameRect(g, x, COUNTER_Y + 10, 42, 44, woodC.d);
          g.rect(x + 34, COUNTER_Y + 28, 2, 8, woodC.h);
        }
        g.vgrad([hex('#141018'), hex('#0c0a10')], 182, g.bottom, 182);
        for (let y = 186; y < g.bottom; y += 8) g.rect(g.left, y, g.w, 1, hex('#08070b'));
        g.ellipse(160, 210, 70, 10, hex('#1c2a3a'));
        g.ellipse(160, 210, 62, 8, hex('#24384c'));

        // Upper wall (tall views): hanging pothos and a rain gauge chart.
        for (let i = 0; i < 40; i++) {
          const x = 92 + Math.sin(i * 0.3) * 4;
          g.px(x, -60 + i * 1.5, hex('#2e5a3a'));
          if (i % 4 === 0) g.ellipse(x + (i % 8 ? 2 : -2), -60 + i * 1.5, 2, 1, hex('#3d7a45'));
        }
        g.rect(84, -70, 16, 10, hex('#7a4a3a'));
        frameRect(g, 182, -64, 50, 40, hex('#33414f'));
        g.rect(183, -63, 48, 38, hex('#d8d0b8'));
        g.text('RAINFALL', 186, -60, hex('#3a4a5a'));
        for (let i = 0; i < 9; i++) g.rect(187 + i * 5, -30 - (8 + i * 2), 3, 8 + i * 2, hex('#6fb7ff'));

        // Stove with kettle (left), radio and plant (right).
        g.rect(64, COUNTER_Y - 6, 44, 6, hex('#2a2e36'));
        g.rect(64, COUNTER_Y - 6, 44, 1, hex('#4a505c'));
        g.disc(98, COUNTER_Y - 3, 1, hex('#ff6b3a'));
        g.disc(104, COUNTER_Y - 3, 1, hex('#3a4048'));
        // kettle
        g.ellipse(82, COUNTER_Y - 15, 13, 10, ink);
        g.ball(82, COUNTER_Y - 15, 12, 9, [hex('#1a0a0e'), hex('#36161c'), hex('#56262c'), hex('#7e4642')], 0.6, -0.6, 0.2);
        g.rect(70, COUNTER_Y - 9, 25, 3, hex('#1a080c'));
        g.poly([70, COUNTER_Y - 16, 62, COUNTER_Y - 24, 60, COUNTER_Y - 22, 70, COUNTER_Y - 11], hex('#5e2430'));
        arc(g, 82, COUNTER_Y - 24, 8, 7, Math.PI, Math.PI * 2, ink, 3);
        g.ellipse(82, COUNTER_Y - 25, 3, 1, hex('#2a0e14'));
        // radio
        roundRect(g, 196, COUNTER_Y - 15, 30, 15, 3, hex('#5a5446'));
        g.rect(199, COUNTER_Y - 12, 12, 9, hex('#4a3a2a'));
        for (let y = COUNTER_Y - 11; y < COUNTER_Y - 3; y += 2) g.rect(200, y, 10, 1, hex('#2a1e14'));
        g.rect(213, COUNTER_Y - 12, 10, 5, hex('#10202a'));
        g.text('90.1', 213, COUNTER_Y - 12, hex('#6fe3ff'));
        g.disc(218, COUNTER_Y - 3, 2, hex('#8a7a5a'));
        g.line(222, COUNTER_Y - 15, 232, COUNTER_Y - 34, hex('#9aa0a8'));
        // plant
        g.rect(240, COUNTER_Y - 10, 12, 10, hex('#5e3424'));
        g.rect(240, COUNTER_Y - 10, 12, 2, hex('#7a4a34'));
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.45;
          g.line(246, COUNTER_Y - 10, 246 + Math.cos(a) * 12, COUNTER_Y - 10 + Math.sin(a) * 14, hex('#1e3a24'));
          g.ellipse(246 + Math.cos(a) * 12, COUNTER_Y - 10 + Math.sin(a) * 14, 2, 2, hex('#2e5634'));
        }
        // Cool city light on the counter edge, warm pocket around the stove.
        g.glow(160, COUNTER_Y, 120, hex('#3a5a9a'), 0.1, 5);
        g.glow(86, COUNTER_Y - 6, 36, warm, 0.16, 4);
        gloom(g, g.left, COUNTER_Y + 8, g.w, g.bottom - COUNTER_Y - 8, 0.55);
        g.lighting(0.45);
        g.light(160, GL.y + GL.h / 2, 150, 0.5, 80);
        g.light(84, COUNTER_Y - 10, 40, 0.45, 26);
        g.light(218, COUNTER_Y - 8, 24, 0.12);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        g.clip(GL.x, GL.y, GL.w, GL.h);

        // Lightning: silent, far away, every so often (never with reduced motion).
        const slot = Math.floor(t / 23);
        const inSlot = t - slot * 23;
        if (!f.reduced && hash3(slot, 4) < 0.55) {
          const at = 4 + hash3(slot, 5) * 14;
          const d = inSlot - at;
          if (d > 0 && d < 0.5) {
            const k = d < 0.08 ? 1 : d < 0.16 ? 0.3 : d < 0.24 ? 0.8 : Math.max(0, 1 - (d - 0.24) * 4) * 0.6;
            g.rectAdd(GL.x, GL.y, GL.w, 40, hex('#3a4a7a'), k);
            g.rectAdd(GL.x, GL.y + 40, GL.w, 20, hex('#3a4a7a'), k * 0.5);
            let bx = GL.x + 30 + hash3(slot, 6) * (GL.w - 60);
            let by = GL.y;
            for (let i = 0; i < 9; i++) {
              const nx = bx + (hash3(slot, i, 7) - 0.5) * 8;
              const ny = by + 4;
              g.line(bx, by, nx, ny, mix(hex('#c8d8ff'), hex('#1d2a4c'), 1 - k));
              bx = nx;
              by = ny;
            }
          }
        }

        // Neon flicker.
        const flick = f.reduced ? 0 : (hash3(Math.floor(t * 8), 2) > 0.93 ? 1 : 0);
        if (flick) g.rectA(126, 82, 35, 9, ink, 0.6);
        else g.glow(143, 86, 14, neon[3]!, 0.08 + f.energy * 0.18);

        // Floating umbrellas drifting through the rain.
        const span = GL.w + 40;
        for (let i = 0; i < umbrellas.length; i++) {
          const u = umbrellas[i]!;
          const speed = u.speed * (0.6 + 0.4 * f.awake);
          let x = ((u.phase + t * speed) % span + span) % span + GL.x - 20;
          let y = u.y + Math.sin(t * 0.8 + i) * 1.5;
          let waving = false;
          if (f.rare === 1 && ev < 8 && i === umbrellas.length - 1) {
            const k = envelope(ev, 8, 2, 2);
            x = x + (124 - x) * k;
            y = y + (64 - y) * k;
            waving = k > 0.9;
          }
          const s = u.size;
          // canopy
          dome(g, x, y, s + 1, Math.ceil(s * 0.7) + 1, ink);
          dome(g, x, y, s, Math.ceil(s * 0.7), u.color);
          g.hline(x - s, x + s, y, shade(u.color, 0.6));
          for (let k = -s; k <= s; k += 3) g.px(x + k, y + 1, shade(u.color, 0.6));
          g.px(x - Math.round(s / 2), y - Math.ceil(s * 0.3), mix(u.color, hex('#ffffff'), 0.5));
          // handle + traveller dangling beneath
          g.vline(x, y, y + s, hex('#c8c8d0'));
          const py = y + s;
          const ph = s * 1.2;
          g.rect(x - Math.ceil(s / 3), py + 1, Math.ceil(s / 1.5), Math.ceil(ph), u.coat);
          g.disc(x, py, Math.max(1, Math.round(s / 3)), hex('#a88a76'));
          const sw = Math.round(Math.sin(t * 2 + i) * (s > 5 ? 1 : 0));
          g.vline(x - 1 + sw, py + ph + 1, py + ph + Math.ceil(s / 2), u.coat);
          g.vline(x + 1 + sw, py + ph + 1, py + ph + Math.ceil(s / 2), u.coat);
          if (waving) {
            const wv = Math.sin(ev * 10) > 0 ? -2 : 0;
            g.line(x + 2, py + 2, x + 5, py - 2 + wv, hex('#e8c8a8'));
          }
        }

        // A fish swims past in the rain (it has been raining for a very long time).
        if (f.rare === 0 && ev < 8) {
          const p = ev / 8;
          const fx = GL.x + GL.w + 10 - p * (GL.w + 30);
          const fy = 40 + Math.sin(p * 12) * 4;
          g.ellipse(fx, fy, 6, 3, hex('#c87a48'));
          g.tri(fx + 5, fy, fx + 10, fy - 3 + Math.sin(ev * 12) * 1, fx + 10, fy + 3 + Math.sin(ev * 12) * 1, hex('#d8925e'));
          g.px(fx - 3, fy - 1, ink);
          g.pxA(fx - 8, fy - 3, hex('#cfe8ff'), 0.7);
          g.pxA(fx - 10, fy - 5, hex('#cfe8ff'), 0.5);
        }

        // Rain falling outside.
        const nRain = f.reduced ? 30 : 110;
        for (let i = 0; i < nRain; i++) {
          const sp = 90 + hash3(i, 1) * 60;
          const y = GL.y + ((t * sp + hash3(i, 2) * 400) % (GL.h + 10)) - 5;
          const x = GL.x + ((hash3(i, 3) * GL.w + (t * sp * 0.15)) % GL.w);
          const a = 0.18 + hash3(i, 4) * 0.25;
          g.pxA(x, y, rain, a);
          g.pxA(x - 0.3, y - 1, rain, a * 0.8);
          g.pxA(x - 0.6, y - 2, rain, a * 0.5);
        }
        // Splashes on the street.
        for (let i = 0; i < 10; i++) {
          const p = (t * 1.7 + hash3(i, 9)) % 1;
          if (p > 0.25) continue;
          const sx = GL.x + hash3(i, Math.floor(t * 1.7 + hash3(i, 9)), 3) * GL.w;
          g.pxA(sx - 1, STREET_Y + 4 - p * 8, rain, 0.5);
          g.pxA(sx + 1, STREET_Y + 4 - p * 8, rain, 0.5);
        }

        // Droplets sliding down the glass in fits and starts, leaving trails.
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i]!;
          const tt = t + d.ph;
          const prog = tt * d.sp * 0.35 + Math.sin(tt * 0.9 + i) * 3 + noise1(tt * 0.5, i) * 6;
          const y = GL.y + (prog % (GL.h + 12)) - 6;
          const x = d.x + Math.sin(y * 0.08 + i) * 1.2;
          for (let k = 1; k < 10; k++) g.pxA(x, y - k * 1.5, hex('#9ab8d8'), 0.18 * (1 - k / 10));
          g.pxA(x, y, hex('#cfe2ff'), 0.6);
          if (d.r > 1) {
            g.pxA(x + 1, y, hex('#a8c4e8'), 0.5);
            g.pxA(x, y + 1, hex('#6a88b8'), 0.6);
            g.pxA(x + 1, y + 1, hex('#6a88b8'), 0.5);
            g.px(x, y - 1, hex('#ffffff'));
          }
        }
        // static beads of water on the glass
        for (let i = 0; i < 60; i++) {
          const bx = GL.x + hash3(i, 31) * GL.w;
          const by = GL.y + hash3(i, 32) * GL.h;
          g.pxA(bx, by, hex('#b8d0f0'), 0.35);
        }
        g.noClip();

        // Kettle steam (and a proper whistle during the rare event).
        const boil = f.rare === 2 && ev < 6 ? envelope(ev, 6, 1, 1.5) : 0;
        const kettleOn = 0.4 + 0.6 * f.awake;
        steam(g, t, 61, COUNTER_Y - 25, hex('#d8e2f0'), Math.round(5 + boil * 10), 18 + boil * 16, 3 + boil * 3, 0.5 * kettleOn + boil * 0.3, 0.4 + boil * 0.5);
        if (boil > 0.5) {
          const jig = Math.round(Math.sin(ev * 40));
          g.ellipse(82 + jig, COUNTER_Y - 25 - 1, 3, 1, hex('#ffb0a0'));
          g.text('~', 50, COUNTER_Y - 44 - Math.round(Math.sin(ev * 3) * 2), hex('#d8e2f0'));
        }
        // burner glow
        g.glow(82, COUNTER_Y - 5, 14, hex('#ff6b3a'), (0.2 + boil * 0.3) * kettleOn);

        // Radio dial glow pulses with the music.
        g.glow(218, COUNTER_Y - 10, 10, hex('#6fe3ff'), 0.1 + f.energy * 0.3);
        // A slow twinkle on the plant leaves catching neon.
        if (!blinking(t, 12, 3)) g.pxAdd(250, COUNTER_Y - 22, hsv((t * 0.05) % 1, 0.5, 0.6), 0.6);
        void clamp;
        void bayer;
      },
    };
  },
};

export default def;

// Smoke Ring Trio: a small, dim jazz club built inside a storm cloud. A piano trio plays
// under one warm spotlight; candle-lit tables float on the cloud floor; lightning glows
// softly inside the walls; now and then a waiter crosses the fog, very carefully.

import { onAirLamp, sectionDrive } from '../kit/broadcast';
import { type Color, hex, mix, ramp, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { type Gfx, addPx, bayer } from '../kit/gfx';
import { hash3, noise1, noise2 } from '../kit/rng';
import type { SceneDef } from '../types';
import { bakeFog, drawFog, flicker, motes, shaft, vignette } from './lib/night';

const STAGE = { cx: 164, y: 109, rx: 70, ry: 6 };
const SPOT_X = 166;
const WAITER_PERIOD = 58;
const WAITER_WALK = 24;

const def: SceneDef = {
  id: 'cloud-club',
  fps: 15,
  focusY: 92,
  rareEvents: 4,
  rareDuration: 11,
  create({ accent }) {
    const ink = hex('#07060a');
    const sil = hex('#0d0b10');
    const warm = mix(accent, hex('#ffd9a0'), 0.35);
    const warmD = shade(accent, 0.55);
    const rim = mix(accent, hex('#fff0d0'), 0.25);
    const brass = shade(accent, 0.8);
    const flame = hex('#ffd890');
    const bolt = hex('#9fb4ff');
    const wood = { d: hex('#1a0e08'), m: hex('#2c170c'), l: hex('#5a3418') };
    const fogC = hex('#2a3044');
    const fogL = mix(hex('#3a4258'), accent, 0.12);

    // Cloud-wall density, baked per view so lightning can glow *inside* the billows.
    let dens = new Uint8Array(0);
    const coolRamp = ramp([hex('#06070b'), hex('#0c0f17'), hex('#151925'), hex('#1f2434'), hex('#2c3246'), hex('#3c435a')], 8);
    const warmRamps = [0.2, 0.4, 0.6, 0.8].map((w) =>
      ramp([hex('#07070b'), mix(hex('#0e1018'), warmD, w * 0.2), mix(hex('#171a26'), warmD, w * 0.45), mix(hex('#222534'), warmD, w * 0.7), mix(hex('#2e3040'), accent, w * 0.45), mix(hex('#3e4052'), warm, w * 0.55)], 8),
    );
    // Puffs: far wall first (dim), then nearer billows, then the cloud floor.
    const puffs: { x: number; y: number; rx: number; ry: number; b: number }[] = [];
    for (let i = 0; i < 120; i++) {
      const x = -60 + hash3(i, 1) * 440;
      const y = -110 + hash3(i, 2) * 220;
      const r = 14 + hash3(i, 3) * 22;
      puffs.push({ x, y, rx: r * 1.25, ry: r, b: 0.55 });
    }
    for (let i = 0; i < 70; i++) {
      const side = i % 2 ? 1 : -1;
      const x = SPOT_X + side * (78 + hash3(i, 4) * 150);
      const y = -100 + hash3(i, 5) * 230;
      const r = 12 + hash3(i, 6) * 18;
      puffs.push({ x, y, rx: r * 1.15, ry: r, b: 0.75 });
    }
    for (let i = 0; i < 110; i++) {
      const x = -60 + ((i * 37) % 110 / 110) * 440 + hash3(i, 7) * 12;
      const y = 118 + hash3(i, 8) * 16 + (i % 7) * 22;
      const r = 10 + hash3(i, 9) * 14;
      puffs.push({ x, y, rx: r * 1.8, ry: r * 0.8, b: 0.85 });
    }
    const floorFog = bakeFog(104, 34, 5, { sx: 34, sy: 9, lo: 0.36, gain: 2.4, edge: 0.8 });
    const frontFog = bakeFog(124, 70, 9, { sx: 52, sy: 14, lo: 0.34, gain: 2, edge: 0.6 });

    const flashAt = (g: Gfx, x: number, y: number, r: number, k: number) => {
      const r2 = r * r;
      const b = g.buf;
      const cr = ((bolt & 255) * k) / 255;
      const cg = (((bolt >>> 8) & 255) * k) / 255;
      const cb = (((bolt >>> 16) & 255) * k) / 255;
      const x0 = Math.max(0, Math.floor(x - r) - g.ox);
      const x1 = Math.min(g.w - 1, Math.ceil(x + r) - g.ox);
      const y0 = Math.max(0, Math.floor(y - r) - g.oy);
      const y1 = Math.min(g.h - 1, Math.ceil(y + r) - g.oy);
      for (let by = y0; by <= y1; by++) {
        const dy = by + g.oy - y;
        for (let bx = x0; bx <= x1; bx++) {
          const dx = bx + g.ox - x;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          const i = by * g.w + bx;
          const dd = dens[i]!;
          if (dd === 0) continue;
          let f = 1 - d2 / r2;
          f = f * f * dd;
          b[i] = addPx(b[i]!, cr * f, cg * f, cb * f);
        }
      }
    };

    // ── people, drawn twice: once offset in rim light, once in silhouette ──
    const pianist = (g: Gfx, c: Color, ox: number, oy: number, bob: number, droop: number) => {
      const hx = 157 + ox - droop;
      const hy = 82 + oy + bob + droop * 2;
      g.ellipse(161 + ox, 93 + oy + bob * 0.5, 4, 7, c);
      g.disc(hx, hy, 3, c);
      g.rect(hx - 1, hy - 4, 4, 1, c); // hair
      g.line(158 + ox, 88 + oy + bob, 151 + ox, 94 + oy, c);
      g.line(159 + ox, 89 + oy + bob, 152 + ox, 95 + oy, c);
      g.line(160 + ox, 100 + oy, 153 + ox, 102 + oy, c);
      g.line(153 + ox, 102 + oy, 153 + ox, 109 + oy, c);
      g.line(161 + ox, 100 + oy, 154 + ox, 103 + oy, c);
    };

    const bassist = (g: Gfx, c: Color, ox: number, oy: number, sway: number, nod: number, frizz: number) => {
      const x = 191 + ox + sway;
      const y = oy;
      g.disc(x, 64 + y + nod, 3, c);
      g.rect(x - 1, 67 + y + nod, 3, 3, c);
      if (frizz > 0) {
        for (let i = 0; i < 7; i++) g.px(x - 4 + i * 1.3, 59 + y + nod - Math.round(frizz * (1 + (i % 3))), c);
      }
      g.rect(x - 5, 69 + y, 11, 3, c);
      g.rect(x - 4, 71 + y, 9, 10, c);
      g.rect(x - 3, 81 + y, 7, 9, c);
      g.rect(x - 3, 90 + y, 3, 20, c);
      g.rect(x + 1, 90 + y, 3, 20, c);
      // left hand on the neck, right hand plucking
      g.line(x - 3, 72 + y, 184 + ox + sway * 0.4, 74 + y, c);
      g.line(x - 3, 77 + y, 183 + ox + sway * 0.6, 95 + y, c);
    };

    const bass = (g: Gfx, sway: number) => {
      const x = 181 + sway * 0.4;
      // neck and scroll
      g.line(x, 92, x + 2, 60, wood.d);
      g.line(x + 1, 92, x + 3, 60, wood.d);
      g.disc(x + 3, 58, 2, wood.d);
      g.px(x + 4, 57, rim);
      // body: lower and upper bouts
      g.ellipse(x - 1, 101, 7, 7, wood.d);
      g.ellipse(x - 1, 91, 5, 5, wood.d);
      g.ellipse(x - 1, 101, 6, 6, wood.m);
      g.ellipse(x - 1, 91, 4, 4, wood.m);
      // the spotlight catches the top curve
      g.hline(x - 4, x + 2, 86, wood.l);
      g.hline(x - 6, x + 3, 95, shade(wood.l, 0.8));
      g.px(x - 4, 99, ink);
      g.px(x - 4, 100, ink);
      g.px(x + 2, 99, ink);
      g.px(x + 2, 100, ink);
      g.vline(x - 1, 108, 110, brass);
      g.vline(x, 62, 98, shade(brass, 0.6)); // strings
    };

    const drummer = (g: Gfx, c: Color, ox: number, oy: number, t: number, e: number, droop: number) => {
      const x = 216 + ox;
      const y = oy + droop * 2;
      g.disc(x - droop, 79 + y, 3, c);
      g.ellipse(x, 90 + y, 5, 7, c);
      // brushes sweep in slow circles on the snare
      const a = t * 3.2;
      const bx = 205 + ox + Math.cos(a) * 2 * e;
      const by = 95 + oy + Math.sin(a) * 1 * e;
      g.line(x - 3, 86 + y, bx, by, c);
      g.line(x - 2, 88 + y, 207 + ox - Math.cos(a) * 2 * e, 96 + oy, c);
    };

    const waiter = (g: Gfx, c: Color, x: number, y: number, step: number, wob: number, sink: number) => {
      x = Math.round(x);
      const by = Math.round(y + sink);
      g.disc(x, by - 34, 3, c);
      g.rect(x - 3, by - 31, 6, 15, c);
      g.rect(x - 2, by - 16, 2, 16 - Math.max(0, step), c);
      g.rect(x + 1, by - 16, 2, 16 + Math.min(0, step), c);
      // tray arm up, holding steady (mostly)
      g.line(x + 2, by - 29, x + 7, by - 34, c);
      g.line(x + 7, by - 34, x + 7 + wob, by - 40, c);
      g.rect(x + 1 + wob, by - 41, 13, 1, c);
      g.rect(x + 5 + wob, by - 46, 2, 5, c); // a tall glass
      g.line(x - 2, by - 29, x - 4, by - 20, c);
      if (c === ink) {
        g.rect(x - 1, by - 30, 2, 8, hex('#b8b0a4'));
        g.px(x - 1, by - 31, ink);
        g.px(x, by - 31, ink);
        g.rect(x - 5, by - 22, 2, 4, hex('#d8d0c4'));
      }
    };

  
    return {
      background(g) {
        // The cloud: soft puffs painted as light, blurred, then dithered into a cool
        // ramp that warms toward the stage.
        // Painted at half resolution (it's soft anyway), then sampled bilinearly.
        const W = g.w;
        const Hh = g.h;
        const W2 = (W >> 1) + 2;
        const H2 = (Hh >> 1) + 2;
        const lum = new Float32Array(W2 * H2).fill(0.05);
        for (const p of puffs) {
          if (p.x + p.rx < g.left || p.x - p.rx > g.right || p.y + p.ry < g.top || p.y - p.ry > g.bottom) continue;
          const lx = clamp((SPOT_X - p.x) / 110, -0.8, 0.8);
          const ly = clamp((p.y - 70) / 90, -0.75, 0.75);
          const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
          const x0 = Math.max(0, Math.floor((p.x - p.rx - g.ox) / 2));
          const x1 = Math.min(W2 - 1, Math.ceil((p.x + p.rx - g.ox) / 2));
          const y0 = Math.max(0, Math.floor((p.y - p.ry - g.oy) / 2));
          const y1 = Math.min(H2 - 1, Math.ceil((p.y + p.ry - g.oy) / 2));
          for (let by = y0; by <= y1; by++) {
            const ny = (by * 2 + 0.5 + g.oy - p.y) / p.ry;
            for (let bx = x0; bx <= x1; bx++) {
              const nx = (bx * 2 + 0.5 + g.ox - p.x) / p.rx;
              const d2 = nx * nx + ny * ny;
              if (d2 >= 1) continue;
              const nz = Math.sqrt(1 - d2);
              const l = Math.max(0, nx * lx + ny * ly + nz * lz);
              lum[by * W2 + bx] = p.b * (0.22 + 0.78 * l * l);
            }
          }
        }
        const tmp = new Float32Array(W2 * H2);
        for (let by = 0; by < H2; by++)
          for (let bx = 0; bx < W2; bx++) {
            let s2 = 0;
            for (let k = -1; k <= 1; k++) s2 += lum[by * W2 + Math.min(W2 - 1, Math.max(0, bx + k))]!;
            tmp[by * W2 + bx] = s2 / 3;
          }
        for (let by = 0; by < H2; by++)
          for (let bx = 0; bx < W2; bx++) {
            let s2 = 0;
            for (let k = -1; k <= 1; k++) s2 += tmp[Math.min(H2 - 1, Math.max(0, by + k)) * W2 + bx]!;
            lum[by * W2 + bx] = s2 / 3;
          }
        const sample = (bx: number, by: number) => {
          const fx = bx / 2;
          const fy = by / 2;
          const ix = Math.min(W2 - 2, Math.floor(fx));
          const iy = Math.min(H2 - 2, Math.floor(fy));
          const ux = fx - ix;
          const uy = fy - iy;
          const a0 = lum[iy * W2 + ix]!;
          const a1 = lum[iy * W2 + ix + 1]!;
          const b0 = lum[(iy + 1) * W2 + ix]!;
          const b1 = lum[(iy + 1) * W2 + ix + 1]!;
          return (a0 + (a1 - a0) * ux) * (1 - uy) + (b0 + (b1 - b0) * ux) * uy;
        };
        dens = new Uint8Array(W * Hh);
        const n = coolRamp.length - 1;
        for (let by = 0; by < Hh; by++)
          for (let bx = 0; bx < W; bx++) {
            const x = bx + g.ox;
            const y = by + g.oy;
            const i = by * W + bx;
            let v = sample(bx, by) * (0.9 + 0.2 * noise2(x / 7, y / 5, 12));
            // the alcove behind the trio sits in shadow
            const ad = ((x - STAGE.cx) / 60) ** 2 + ((y - 80) / 44) ** 2;
            if (ad < 1) v *= 0.45 + 0.55 * ad;
            const near = clamp(1 - Math.hypot((x - SPOT_X) / 140, (y - 100) / 100));
            const rr = near > 0.12 ? warmRamps[Math.min(3, Math.floor(near * 4.5))]! : coolRamp;
            let k = Math.floor(clamp(v) * n + bayer(x, y));
            if (k > n) k = n;
            g.buf[i] = rr[k]!;
            dens[i] = Math.round(clamp(v * 1.6) * 255);
          }

        // A deco arch of brass over the little stage.
        for (let i = 0; i < 3; i++) {
          const rx = 66 - i * 5;
          const ry = 74 - i * 5;
          for (let a = Math.PI; a <= Math.PI * 2; a += 0.004) {
            const x = STAGE.cx + Math.cos(a) * rx;
            const y = STAGE.y + Math.sin(a) * ry;
            const lit = clamp(1 - Math.abs(x - SPOT_X) / 90);
            g.px(x, y, mix(shade(brass, 0.25), brass, lit * (i === 1 ? 1 : 0.55)));
          }
        }
        // Inside the arch: deeper shadow so the trio reads.
        g.ellipseA(STAGE.cx, STAGE.y - 20, 54, 40, ink, 0.35);

        // The stage: polished dark wood with a brass lip.
        g.ellipse(STAGE.cx, STAGE.y + 3, STAGE.rx + 1, STAGE.ry + 3, ink);
        g.rect(STAGE.cx - STAGE.rx, STAGE.y, STAGE.rx * 2 + 1, 5, wood.d);
        g.ellipse(STAGE.cx, STAGE.y + 5, STAGE.rx, STAGE.ry, wood.d);
        g.ellipse(STAGE.cx, STAGE.y, STAGE.rx, STAGE.ry, hex('#160c08'));
        g.ellipse(SPOT_X, STAGE.y, 46, 4, wood.d);
        g.ellipse(SPOT_X, STAGE.y, 30, 3, wood.m);
        for (let x = STAGE.cx - STAGE.rx; x <= STAGE.cx + STAGE.rx; x++) {
          const u = (x - STAGE.cx) / STAGE.rx;
          const yy = STAGE.y + Math.sqrt(Math.max(0, 1 - u * u)) * STAGE.ry;
          const lit = clamp(1 - Math.abs(x - SPOT_X) / 60);
          g.px(x, yy + 1, mix(shade(brass, 0.35), brass, lit));
        }
        g.ellipseA(SPOT_X, STAGE.y, 20, 2, warm, 0.18);

        // The grand piano, lid up, keyboard toward the pianist.
        g.poly([104, 95, 148, 95, 112, 67], ink);
        g.poly([106, 94, 145, 94, 112, 70], hex('#120c0a'));
        g.line(112, 70, 145, 94, mix(hex('#120c0a'), rim, 0.45));
        g.line(122, 94, 118, 74, shade(brass, 0.5));
        g.ellipse(112, 98, 10, 4, ink);
        g.rect(108, 95, 44, 6, ink);
        g.rect(110, 95, 41, 1, mix(ink, rim, 0.6));
        g.rect(144, 94, 8, 1, hex('#d8d0c0'));
        g.rect(146, 89, 1, 5, mix(ink, rim, 0.4));
        g.line(146, 89, 149, 88, mix(ink, rim, 0.4));
        for (const lx of [109, 139, 149]) g.rect(lx, 101, 2, 8, ink);
        g.rect(143, 108, 6, 1, brass);

        // Drum kit (the drummer sits behind it, drawn per frame).
        g.ellipse(215, 102, 8, 7, ink);
        g.ellipse(215, 102, 7, 6, hex('#2a2420'));
        g.ellipse(215, 102, 5, 4, hex('#3a322a'));
        g.ring(215, 102, 7, 6, shade(brass, 0.6));
        g.ellipse(206, 96, 5, 2, ink);
        g.hline(201, 211, 95, mix(ink, rim, 0.7));
        g.vline(206, 97, 109, ink);
        g.ellipse(228, 86, 6, 1, brass);
        g.vline(228, 87, 109, ink);
        g.ellipse(199, 82, 8, 1, shade(brass, 0.85));
        g.vline(199, 83, 109, ink);
        g.rect(156, 100, 12, 2, ink); // piano bench
        g.rect(157, 102, 1, 7, ink);
        g.rect(166, 102, 1, 7, ink);

        // Tables floating on the cloud (candles flicker per frame).
        const table = (x: number, y: number, s: number) => {
          g.ellipse(x, y + 1, 12 * s, 3 * s, ink);
          g.ellipse(x, y, 12 * s, 2.5 * s, hex('#1a1214'));
          g.hline(x - 11 * s, x + 11 * s, Math.round(y - 2 * s), mix(hex('#1a1214'), warm, 0.4));
          g.rect(x - 1, y + 2, 2, 14 * s, ink);
        };
        g.glow(50, 112, 34, hex('#3a4258'), 0.35, 5);
        g.glow(282, 116, 30, hex('#3a4258'), 0.3, 5);
        table(50, 122, 1);
        table(274, 125, 1);
        // a couple at the left table, a lone listener on the right
        let seatC = sil;
        const seat = (x: number, y: number, flip: number, hat: boolean) => {
          g.disc(x, y - 16, 3, seatC);
          if (hat) {
            g.rect(x - 4, y - 19, 9, 1, seatC);
            g.rect(x - 2, y - 22, 5, 3, seatC);
          }
          g.rect(x - 1, y - 13, 3, 2, seatC);
          g.ellipse(x, y - 6, 5, 7, seatC);
          g.line(x + flip * 3, y - 9, x + flip * 8, y - 3, seatC);
        };
        const seatLit = (x: number, y: number, flip: number, hat: boolean) => {
          seat(x, y, flip, hat);
          g.px(x + flip * 2, y - 16, mix(sil, warm, 0.45));
          g.px(x + flip * 3, y - 7, mix(sil, warm, 0.3));
        };
        seatLit(36, 125, 1, true);
        seatLit(64, 125, -1, false);
        seatLit(290, 128, -1, false);
        g.glow(50, 118, 18, warm, 0.18, 5);
        g.glow(274, 121, 18, warm, 0.16, 5);

        // the spotlight, through the smoke
        shaft(g, SPOT_X - 8, g.top - 10, SPOT_X, STAGE.y + 2, 8, 96, warm, 0.12, 0.15, 6);
        vignette(g, 0.55, SPOT_X, 96, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const awake = f.awake;
        const rareT = f.rareT;
        const e = f.energy;

        // Lightning, soft and inside the walls.
        const slot = Math.floor(t / 6.5);
        const local = t - slot * 6.5;
        const strike = f.rare === 3 && rareT < 11;
        const flashK = strike && rareT > 0.6 && rareT < 1.6 ? (rareT < 0.75 ? 1 : 1 - (rareT - 0.75) / 0.85) : 0;
        if (hash3(slot, 4) < 0.45 || strike) {
          const fx = strike ? 120 + f.rareSeed * 80 : g.left + hash3(slot, 5) * g.w;
          const fy = strike ? 30 : -20 + hash3(slot, 6) * 120;
          const at = strike ? 0.6 : 1 + hash3(slot, 7) * 3;
          const d = local - at;
          const big = strike ? 1.8 : 1;
          const loc = strike ? rareT - 0.6 : d;
          let k = 0;
          if (loc > 0 && loc < 0.12) k = 1;
          else if (loc > 0.22 && loc < 0.3) k = 0.6;
          else if (loc > 0.3 && loc < 0.9) k = 0.5 * (1 - (loc - 0.3) / 0.6);
          if (k > 0) flashAt(g, fx, fy, 70 * big, k * (f.reduced ? 0.15 : 0.55) * big);
        }

        // Rare: an airliner passes through the cloud behind the stage.
        if (f.rare === 1 && rareT < 11) {
          const p = rareT / 11;
          const px = -40 + p * 400;
          const py = 40 - p * 8;
          const vis = envelope(rareT, 11, 2, 2) * 0.55;
          for (let i = 0; i < 14; i++) g.pxAdd(px - i * 3, py + 1, hex('#ffe2a8'), vis * 0.5);
          const strobe = (rareT % 1.2) < 0.08 ? 1 : 0;
          g.glow(px + 4, py, 4, hex('#ff5040'), vis * 0.9);
          g.glow(px - 44, py - 1, 3, hex('#40ff80'), vis * 0.8);
          g.glow(px - 20, py - 4, 6, hex('#ffffff'), vis * strobe * 1.5);
          g.glow(px - 20, py, 18, hex('#c8d0ff'), vis * 0.12);
        }

        if (flashK > 0) g.tintAll(hex('#c8d4ff'), flashK * (f.reduced ? 0.05 : 0.22));

        // The spotlight, breathing slightly with the music and musical section.
        const drive = sectionDrive(f);
        const sp = f.speech ?? 0;
        onAirLamp(g, 114, 104, f);
        if (drive > 1.2 && !f.reduced) {
          flashAt(g, STAGE.cx, 54, 65, 0.22 * (drive - 1) * awake);
        }
        g.glow(SPOT_X, STAGE.y - 4, Math.round(30 * drive), warm, (0.04 + e * 0.06) * drive * awake);
        motes(g, t, SPOT_X - 36, 20, 72, 88, 26, warm, (0.35 * awake + 0.1) * drive, 2, 0.6);

        // ── the trio ──
        const droop = (1 - awake) * 2;
        const bob = f.reduced ? 0 : Math.round((Math.sin(t * 2.2) * 0.7 + f.pulse * 0.8 + sp * 0.8) * drive * awake);
        pianist(g, rim, 0, -1, bob, droop);
        pianist(g, rim, 1, 0, bob, droop);
        pianist(g, sil, 0, 0, bob, droop);
        if (strike && rareT > 0.7) {
          const fz = clamp((rareT - 0.7) * 3) * (1 - smoothstep(8, 11, rareT));
          const hx = 157 - droop;
          const hy = 82 + bob + droop * 2;
          for (let i = 0; i < 6; i++) g.px(hx - 3 + i * 1.3, hy - 4 - Math.round(fz * (1 + ((i * 2) % 3))), sil);
          for (let i = 0; i < 4; i++) g.px(216 - 3 + i * 2, 75 + droop * 2 - Math.round(fz * (1 + (i % 2) * 2)), sil);
          if (!f.reduced) for (let i = 0; i < 6; i++) {
            const p = ((rareT - 0.7) * 0.25 + i / 6) % 1;
            g.pxA(113 + Math.sin(p * 9 + i) * 2, 66 - p * 30, hex('#9a9690'), 0.45 * (1 - p) * fz);
          }
        }
        // fingers on the keys
        if (awake > 0.3) for (let i = 0; i < 3; i++) if (hash3(Math.floor(t * 6), i, 2) < (0.3 + e * 0.6) * drive) g.px(144 + i * 2 + ((t * 5 + i) % 2), 94, hex('#fff8e8'));

        const sway = f.reduced ? 0 : Math.round(Math.sin(t * 0.9) * 1.2 * drive * awake);
        const nod = f.reduced ? 0 : Math.round(f.pulse * drive * awake + droop * 0.6);
        const frizz = strike && rareT > 0.7 ? clamp((rareT - 0.7) * 3) * (1 - smoothstep(8, 11, rareT)) : 0;
        bassist(g, rim, 0, -1, sway, nod, frizz);
        bassist(g, rim, -1, 0, sway, nod, frizz);
        bassist(g, sil, 0, 0, sway, nod, frizz);
        bass(g, sway);
        const brushE = f.reduced ? 0.2 : (0.4 + e * 1.4 * awake) * drive;
        drummer(g, rim, 0, -1, t, brushE, droop);
        drummer(g, sil, 0, 0, t, brushE, droop);
        g.pxAdd(199, 82, rim, (0.5 + f.pulse * 0.5) * drive);
        g.pxAdd(228, 86, rim, (0.3 + e * 0.6) * drive);

        // Rings of cloud rise from the floor into the light.
        const rp = (t % 13) / 13;
        if (rp < 0.75 && !f.reduced) {
          const ry = 106 - rp * 90;
          const rr = 3 + rp * 9;
          const ra = Math.sin((rp / 0.75) * Math.PI) * 0.35;
          const rx = SPOT_X - 18 + Math.sin(rp * 5) * 4;
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            g.pxA(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.32, hex('#c8c4c0'), ra * (0.6 + 0.4 * Math.sin(a)));
          }
        }

        // Rare: a small rain cloud gathers over the left table; an umbrella goes up.
        if (f.rare === 2 && rareT < 11) {
          const k = envelope(rareT, 11, 1.5, 2);
          g.ellipseA(52, 84, 14 * k + 1, 4 * k + 1, hex('#3a4058'), 0.8 * k);
          g.ellipseA(46, 82, 8 * k + 1, 4 * k + 1, hex('#454c66'), 0.8 * k);
          if (rareT > 2 && rareT < 9.5) {
            for (let i = 0; i < 10; i++) {
              const p = (rareT * 1.6 + hash3(i, 9)) % 1;
              g.pxA(40 + hash3(i, 8) * 24, 88 + p * 26, hex('#9fb4d8'), 0.7);
            }
          }
          if (rareT > 3.2) {
            const up = clamp((rareT - 3.2) * 2) * (1 - smoothstep(9.5, 10.5, rareT));
            const ux = 38;
            const uy = 102 - up * 4;
            if (up > 0.05) {
              g.vline(ux, uy, 110, sil);
              for (let dx = -7; dx <= 7; dx++) {
                const yy = uy - Math.round((1 - (dx * dx) / 49) * 4 * up);
                g.vline(ux + dx, yy, uy, mix(sil, hex('#5a1e28'), 0.6));
              }
            }
          }
        }

        // Candles.
        for (let i = 0; i < 2; i++) {
          const x = i ? 274 : 50;
          const y = i ? 121 : 118;
          const fl = flicker(t, i * 7 + 1);
          const rained = f.rare === 2 && i === 0 && rareT > 2 && rareT < 9.5;
          g.rect(x - 1, y, 3, 3, hex('#3a2a20'));
          g.px(x, y - 1, mix(flame, hex('#ffffff'), fl * 0.4));
          if (!rained || hash3(Math.floor(t * 8), 3) > 0.3) g.px(x, y - 2, flame);
          g.glow(x, y - 1, 9, warm, 0.22 * fl);
        }

        // The waiter, crossing the fog with great care.
        const wph = (t + 30) % WAITER_PERIOD;
        const forced = f.rare === 0 && rareT < 11;
        const wt = forced ? rareT * (WAITER_WALK / 11) : wph;
        if (wt < WAITER_WALK) {
          const p = wt / WAITER_WALK;
          const wx = g.left - 20 + p * (g.w + 40);
          const steps = Math.sin(wt * 2.6);
          const step = f.reduced ? 0 : Math.round(steps * 2);
          const wob = f.reduced ? 0 : Math.round(noise1(wt * 1.3, 4) * 2 - 1);
          const sink = forced ? 18 * envelope(rareT, 11, 3, 3) : 0;
          const wy = 131 - Math.abs(steps) * 0.6;
          g.clip(g.left, g.top, g.w, 132 - g.top);
          waiter(g, rim, wx, wy - 1, step, wob, sink);
          waiter(g, ink, wx, wy, step, wob, sink);
          g.noClip();
          g.px(wx + 6 + wob, wy + sink - 45, hex('#e8e0d0'));
        }

        // Fog drifting over the cloud floor and in front of everything.
        drawFog(g, floorFog, t * 3, fogL, 0.55);
        drawFog(g, frontFog, -t * 4.5, fogC, 0.8);

        // A foreground table at the very bottom (seen in tall views).
        const fx = 120;
        const fy = 172;
        g.ellipse(fx, fy + 2, 24, 6, ink);
        g.ellipse(fx, fy, 24, 5, hex('#150e10'));
        g.hline(fx - 22, fx + 22, fy - 4, mix(hex('#150e10'), warm, 0.35));
        g.rect(fx - 2, fy + 4, 4, 90, ink);
        const fl2 = flicker(t, 31);
        g.rect(fx + 5, fy - 9, 4, 5, hex('#2a201a'));
        g.rect(fx + 6, fy - 11, 1, 2, flame);
        g.glow(fx + 6, fy - 10, 16, warm, 0.3 * fl2, 5);
        g.rect(fx - 12, fy - 10, 3, 6, mix(hex('#304048'), warm, 0.2));
        g.px(fx - 11, fy - 9, rim);
      },
    };
  },
};

export default def;

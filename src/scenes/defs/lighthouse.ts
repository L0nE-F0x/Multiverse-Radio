// The Last Lighthouse: a lighthouse on a lonely rock in a dark sea under strange stars. The beam
// sweeps slowly through the haze; a lit window under the lantern shows the keeper at a desk with
// a microphone. Waves break white below.
// Rare events: a gull lands on the gallery and regrets it; something vast surfaces in the beam;
// a pale ship passes on the horizon and blinks back; the keeper steps out with a mug.

import { hex, mix } from '../kit/color';
import { TAU, clamp, envelope, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { type Haze, drawHaze, makeHaze, vignette } from './deep-kit';

const HZN = 98; // horizon
const LH = { x: 200, base: 114, top: 47 }; // tower: base on the rock, top under the gallery
const LAMP = { x: 200, y: 38 };
const WIN = { x: 195, y: 51, w: 11, h: 9 }; // the keeper's window
const PERIOD = 12; // seconds per revolution

const def: SceneDef = {
  id: 'lighthouse',
  fps: 15,
  focusX: 172,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const beamC = mix(hex('#fff1cc'), accent, 0.25);
    const ink = hex('#030508');
    const sky = [hex('#020409'), hex('#050a14'), hex('#0a1420'), hex('#122030'), hex('#1a2a38')];
    const sea = [hex('#0e1a24'), hex('#08111a'), hex('#050a10'), hex('#030609')];
    const stone = [hex('#121620'), hex('#1e232e'), hex('#2e3440'), hex('#444a56'), hex('#5e6470')];
    const rock = hex('#07090d');
    const foam = hex('#dce6ee');
    const warm = hex('#ffc070');
    const planetC = hex('#1e2232');

    let hazes: Haze[] = [];
    const hazeNear = makeHaze(256, 40, 31, 50, 10, 0.4, 2.0);
    const hazeFar = makeHaze(256, 30, 17, 36, 8, 0.42, 2.0);
    hazes = [hazeFar, hazeNear];
    // Per-column beam texture (volumetric streaks), indexed by distance along the beam.
    const streak = new Float32Array(512);
    for (let i = 0; i < 512; i++) streak[i] = 0.55 + 0.45 * fbm(i / 18, 3.3, 5, 3);

    const towerHalf = (y: number) => 6 + ((y - LH.top) / (LH.base - LH.top)) * 4;

    /** The beam at angle `a` (0 = toward the viewer). */
    const beam = (g: Gfx, a: number, k: number, t: number) => {
      const side = Math.sin(a); // + = pointing right
      const depth = Math.cos(a); // + = toward us
      const reach = Math.abs(side);
      if (reach < 0.04) return;
      const len = 30 + 300 * reach;
      const dir = side > 0 ? 1 : -1;
      // Farther-pointing beams are dimmer; ones swinging toward us are brighter.
      const kk = k * (0.55 + 0.45 * Math.max(0, depth) + 0.15 * reach);
      const x0 = LAMP.x + dir * 3;
      const off = Math.floor(t * 6);
      for (let i = 0; i < len; i++) {
        const x = x0 + dir * i;
        if (x < g.left || x >= g.right) {
          if ((dir > 0 && x >= g.right) || (dir < 0 && x < g.left)) break;
          continue;
        }
        const u = i / len;
        const half = 2 + i * (0.11 + 0.08 * (1 - reach));
        const yc = LAMP.y + i * 0.06 * (1 - depth * 0.5);
        const fall = (1 - u) ** 1.4 * streak[(i + off) & 511]!;
        const top = Math.round(yc - half);
        const bot = Math.round(yc + half);
        for (let y = top; y <= bot; y++) {
          const e = 1 - Math.abs((y - yc) / (half + 0.5));
          g.pxAdd(x, y, beamC, kk * fall * (e * 0.7 + e * e * 0.3) * (0.6 + 0.6 * (1 - u) ** 6));
        }
      }
      // where the beam meets the sea: a long glimmer
      const gx = x0 + dir * len * 0.85;
      for (let i = 0; i < 26; i++) {
        const y = HZN + 2 + i * 0.6;
        const w = 6 + i * 1.2;
        if (hash3(i, Math.floor(t * 3), 3) < 0.45) continue;
        g.rectAdd(gx - w / 2 + Math.sin(t * 2 + i) * 3, y, w * (0.3 + hash3(i, 2) * 0.5), 1, beamC, kk * 0.12 * (1 - i / 26));
      }
    };

    return {
      background(g) {
        // ── sky ──
        g.vgrad(sky, g.top, HZN);
        // strange stars: odd colours, a loose spiral of them, one double
        for (let y = g.top; y < HZN - 4; y++)
          for (let x = g.left; x < g.right; x++) {
            const h = hash3(x, y, 401);
            if (h > 0.008) continue;
            const c = hash3(x, y, 402);
            const col = c < 0.12 ? hex('#a8ffd8') : c < 0.22 ? hex('#ffb8d8') : c < 0.3 ? hex('#ffe0a0') : hex('#d0d8f0');
            g.pxA(x, y, col, (0.3 + 0.7 * hash3(x, y, 403)) * clamp((HZN - 4 - y) / 40));
          }
        for (let i = 0; i < 60; i++) {
          const a = i * 0.32;
          const r = 3 + i * 0.75;
          g.pxA(92 + Math.cos(a) * r * 1.4, 34 + Math.sin(a) * r * 0.6, hex('#c8d0ff'), 0.25 + 0.4 * hash3(i, 404));
        }
        g.glow(92, 34, 22, hex('#6a6aa0'), 0.12, 5);
        // a vast pale ringed world, half set behind the sea
        g.clip(g.left, g.top, g.w, HZN - g.top);
        g.glow(54, HZN, 70, hex('#40405a'), 0.25, 6);
        g.ball(54, HZN + 4, 34, 34, [hex('#0b0d14'), hex('#131722'), planetC, hex('#2a3044'), hex('#3a4258')], -0.5, -0.75, 0.05);
        for (let a = 0; a < 400; a++) {
          const ang = (a / 400) * TAU;
          const rx = 62 + (a % 3);
          const px = 54 + Math.cos(ang) * rx;
          const py = HZN - 2 + Math.sin(ang) * 9;
          if (Math.sin(ang) < 0 && Math.hypot(px - 54, py - HZN - 4) < 35) continue;
          g.pxA(px, py, hex('#6a7088'), 0.3);
        }
        g.noClip();
        // horizon haze
        for (let y = HZN - 16; y < HZN; y++) g.rectA(g.left, y, g.w, 1, hex('#2a3a48'), ((y - HZN + 16) / 16) * 0.35);

        // ── sea ──
        g.vgrad(sea, HZN, g.bottom + 20, HZN);
        // swell: horizontal strokes, longer and further apart nearer the viewer
        for (let y = HZN + 1; y < g.bottom; y++) {
          const d = (y - HZN) / 80;
          const gap = 1 + Math.floor(d * 4);
          if ((y - HZN) % gap) continue;
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / (18 + d * 30), y / (2 + d * 6), 61, 3);
            if (n > 0.6) g.pxA(x, y, hex('#1c3040'), clamp((n - 0.6) * 4) * (0.6 - d * 0.2));
          }
        }
        // the ringed world's reflection
        for (let y = HZN + 1; y < HZN + 30; y++) {
          const w = 30 - (y - HZN) * 0.6;
          for (let x = 54 - w; x < 54 + w; x++)
            if (hash3(x, y, 9) < 0.25 * (1 - (y - HZN) / 30)) g.pxA(x, y, hex('#5a5878'), 0.4);
        }

        const seaCopy = g.buf.slice();
        // ── the rock: a heap of boulders, waterline wandering around y 128 ──
        const boulders: [number, number, number, number][] = [
          [200, 122, 44, 14],
          [170, 124, 26, 10],
          [232, 123, 28, 11],
          [150, 128, 16, 6],
          [252, 128, 18, 6],
          [190, 116, 22, 6],
          [214, 116, 20, 6],
          [136, 131, 8, 3],
          [270, 131, 9, 3],
        ];
        const rockRamp = [hex('#040508'), rock, hex('#0c1118'), hex('#131b24'), hex('#1c2733')];
        for (const [x, y, rx, ry] of boulders) {
          g.ellipse(x, y, rx + 1, ry + 1, ink);
          g.ball(x, y, rx, ry, rockRamp, -0.35, -0.85, 0.05);
        }
        // fissures and wet glints
        for (let i = 0; i < 40; i++) {
          const x = 140 + hash3(i, 5) * 124;
          const y = 112 + hash3(i, 6) * 16;
          const c = g.get(x, y);
          if (c === rockRamp[2] || c === rockRamp[3]) g.line(x, y, x + 2 + hash3(i, 7) * 5, y + 1 + hash3(i, 8) * 3, rockRamp[0]!);
          else if (c === rockRamp[4] && hash3(i, 9) < 0.5) g.px(x, y, hex('#3a4a5a'));
        }
        // weed and wet dark along the bottom of the rock
        for (let x = 130; x < 280; x++) for (let y = 122; y < 131; y++) if (g.get(x, y) !== 0 && hash3(x, y, 4) < (y - 122) / 12) {
          const c = g.get(x, y);
          if (c === rockRamp[1] || c === rockRamp[2] || c === rockRamp[3]) g.px(x, y, hex('#0a1210'));
        }

        // the sea in front of the rock's foot (restore it below the waterline), with a dark reflection
        for (let x = 120; x < 290; x++) {
          const wy = Math.round(128 + Math.sin(x * 0.09) * 1.5 + Math.sin(x * 0.23) * 1);
          const bx = x - g.ox;
          if (bx < 0 || bx >= g.w) continue;
          for (let y = wy; y < wy + 30; y++) {
            const by = y - g.oy;
            if (by < 0 || by >= g.h) continue;
            g.buf[by * g.w + bx] = seaCopy[by * g.w + bx]!;
          }
          const above = 128 - (g.get(x, 112) === rock ? 16 : g.get(x, 120) === rock ? 8 : 0);
          for (let y = wy; y < wy + (128 - above) * 0.8; y++) if (hash3(x, y, 3) < 0.7) g.pxA(x, y, rock, 0.55);
        }
        // steps cut into the rock, a small store hut
        for (let i = 0; i < 4; i++) g.rect(216 + i * 4, 113 + i * 3, 5, 1, hex('#1a222c'));
        g.rect(166, 107, 14, 9, hex('#10141c'));
        g.poly([164, 107, 182, 107, 173, 102], hex('#181e28'));
        g.rect(170, 110, 3, 6, hex('#06080c'));

        // ── the tower ──
        for (let y = LH.top; y < LH.base; y++) {
          const hw = towerHalf(y);
          const l = Math.round(LH.x - hw);
          const r = Math.round(LH.x + hw);
          for (let x = l; x <= r; x++) {
            // lit from the left by the pale world, from above by the lamp
            const u = (x - l) / Math.max(1, r - l);
            let v = 0.75 - u * 0.7 + (1 - (y - LH.top) / (LH.base - LH.top)) * 0.15;
            if (Math.floor((y - LH.top) / 16) % 2 === 1) v -= 0.12; // faint bands
            const k = Math.floor(clamp(v) * 4 + (hash3(x, y, 77) - 0.5) * 0.7 + 0.5);
            g.px(x, y, stone[Math.max(0, Math.min(4, k))]!);
          }
          g.px(l - 1, y, ink);
          g.px(r + 1, y, ink);
        }
        // door, a small lower window
        g.rect(LH.x - 2, LH.base - 9, 5, 9, hex('#0a0c12'));
        g.rect(LH.x - 3, LH.base - 10, 7, 1, stone[3]!);
        g.rect(LH.x, 84, 2, 4, hex('#0a0c12'));
        // the keeper's window frame
        g.rect(WIN.x - 1, WIN.y - 1, WIN.w + 2, WIN.h + 2, stone[0]!);
        g.rect(WIN.x, WIN.y, WIN.w, WIN.h, hex('#2a1a0c'));
        // gallery deck + railing
        g.rect(LH.x - 12, LH.top - 3, 25, 3, hex('#14181f'));
        g.hline(LH.x - 12, LH.x + 12, LH.top - 3, hex('#3a404c'));
        for (let x = LH.x - 12; x <= LH.x + 12; x += 3) g.vline(x, LH.top - 8, LH.top - 3, hex('#1e232c'));
        g.hline(LH.x - 12, LH.x + 12, LH.top - 8, hex('#2a303a'));
        // lantern room: glazing bars, roof, vent ball
        g.rect(LH.x - 6, 31, 13, 12, hex('#1a1810'));
        g.poly([LH.x - 8, 31, LH.x + 8, 31, LH.x + 3, 25, LH.x - 3, 25], hex('#12151c'));
        g.hline(LH.x - 8, LH.x + 8, 31, hex('#2a303a'));
        g.disc(LH.x, 23, 1.5, hex('#2a303a'));
        g.vline(LH.x, 18, 21, hex('#2a303a'));

        vignette(g, 0.45, 180, 80);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 12;

        // far haze drifts along the horizon
        drawHaze(g, hazes[0]!, HZN - 22, t * 1.5, hex('#3a4a5a'), 0.35);

        // the ghost ship on the horizon (rare 2)
        if (R(2)) {
          const a = envelope(ev, 12, 2.5, 2.5);
          const sx = 330 - ev * 14;
          const sy = HZN - 1;
          const c = mix(hex('#0a1420'), hex('#8a98a8'), a * 0.55);
          g.rect(sx - 8, sy - 2, 17, 2, c);
          g.rect(sx - 5, sy - 3, 11, 1, c);
          g.vline(sx - 2, sy - 16, sy - 3, c);
          g.vline(sx + 4, sy - 13, sy - 3, c);
          g.tri(sx - 2, sy - 15, sx - 2, sy - 5, sx - 9, sy - 5, c, 1, 0.6);
          g.tri(sx + 4, sy - 12, sx + 4, sy - 5, sx + 9, sy - 5, c, 1, 0.5);
          const blink = ev > 7.5 && ev < 8 ? 1 : ev > 8.4 && ev < 8.9 ? 1 : 0;
          g.px(sx + 7, sy - 4, mix(hex('#3a3020'), hex('#ffe0a0'), a * (0.4 + blink * 0.6)));
          g.glow(sx + 7, sy - 4, 5, hex('#ffe0a0'), a * (0.15 + blink * (f.reduced ? 0.2 : 0.6)));
        }

        // sea glitter: slow moving sparkles under the ringed world
        for (let i = 0; i < 30; i++) {
          const x = 30 + hash3(i, 3) * 50 + Math.sin(t * 0.7 + i) * 3;
          const y = HZN + 2 + hash3(i, 4) * 26;
          const on = Math.sin(t * (1 + hash3(i, 5) * 2) + i * 2) > 0.7;
          if (on) g.pxA(x, y, hex('#8a88a8'), 0.5);
        }

        // the leviathan (rare 1): a long back rises in the beam's path, an eye opens, it sinks
        if (R(1)) {
          const rise = envelope(ev, 12, 3, 3.5);
          const cx = 82;
          const top = Math.round(HZN + 14 - rise * 9);
          g.clip(g.left, g.top, g.w, HZN + 15 - g.top);
          g.ellipse(cx, top + 9, 46, 9, hex('#05090e'));
          g.ellipse(cx - 6, top + 8, 40, 8, hex('#0a1219'));
          for (let i = -40; i < 40; i += 7) g.px(cx + i, top + 9 - Math.round(Math.sqrt(1 - (i / 46) ** 2) * 8), hex('#24384a'));
          g.noClip();
          if (ev > 4.5 && ev < 8.5) {
            const open = smoothstep(4.5, 5.2, ev) * (1 - smoothstep(7.8, 8.5, ev));
            const ex = cx + 26;
            const ey = top + 4;
            g.rect(ex - 2, ey, 5, Math.max(1, Math.round(open * 3)), hex('#c8b860'));
            if (open > 0.5) g.px(ex, ey + 1, ink);
            g.glow(ex, ey + 1, 6, hex('#c8b860'), open * 0.25);
          }
          // a ring of foam where it breaks the surface
          for (let i = 0; i < 20; i++) g.pxA(cx - 44 + i * 4.5, HZN + 15 + Math.sin(t * 3 + i) * 0.8, foam, 0.4 * rise);
        }

        // ── the beam ──
        const a = (t / PERIOD) * TAU;
        const k = f.reduced ? 0.45 : 1;
        beam(g, a, k, t);
        beam(g, a + Math.PI, k, t);
        // the lantern itself: brightest when a beam faces us
        const face = Math.max(Math.cos(a), Math.cos(a + Math.PI));
        const flare = smoothstep(0.75, 1, face) * (f.reduced ? 0.3 : 1);
        g.rect(LH.x - 4, 32, 9, 10, mix(hex('#5a4a28'), beamC, 0.35 + face * 0.4));
        for (let x = LH.x - 6; x <= LH.x + 6; x += 3) g.vline(x, 31, 42, hex('#1a1810'));
        g.glow(LAMP.x, LAMP.y, 16 + flare * 30, beamC, 0.35 + flare * 0.6, 5);
        if (flare > 0.4) {
          g.hline(LAMP.x - 40 * flare, LAMP.x + 40 * flare, LAMP.y, mix(beamC, hex('#ffffff'), 0.5));
          g.rectAdd(LAMP.x - 60 * flare, LAMP.y - 1, 120 * flare, 3, beamC, 0.2 * flare);
        }
        // the gallery rail catches the lamp
        g.hline(LH.x - 12, LH.x + 12, LH.top - 8, mix(hex('#2a303a'), beamC, 0.2 + face * 0.2));

        // ── the keeper at the desk ──
        {
          const lamp = 0.35 + 0.65 * f.awake;
          const { x, y, w, h } = WIN;
          g.rect(x, y, w, h, mix(hex('#2a1a0c'), warm, 0.5 * lamp));
          g.rect(x + w - 3, y + 2, 2, 2, mix(warm, hex('#fff2d0'), 0.5 * lamp)); // desk lamp
          // keeper in silhouette: cap, shoulders, leaning toward the mic
          const doze = 1 - f.awake;
          const talk = f.energy > 0.3 && !f.reduced ? Math.round(Math.sin(t * 9) * 0.5 + 0.5) : 0;
          const hx = x + 3;
          const hy = y + 3 + Math.round(doze * 2) + talk * 0;
          if (!R(3) || ev < 1 || ev > 11) {
            g.rect(hx - 2, hy + 3, 5, h - (hy - y) - 3, hex('#14100c'));
            g.rect(hx - 1, hy, 3, 3, hex('#14100c'));
            g.rect(hx - 2, hy - 1, 4, 1, hex('#14100c')); // cap brim
            g.px(hx + 2 - talk, hy + 1, hex('#14100c'));
          }
          // the microphone
          g.vline(x + 6, y + 4, y + h - 2, hex('#1a1410'));
          g.rect(x + 5, y + 3, 2, 2, hex('#2a2018'));
          g.rect(x, y + h - 2, w, 2, hex('#2a1a10')); // desk
          // window glow on the stonework and haze
          g.glow(x + w / 2, y + h / 2, 12, warm, 0.18 * lamp, 4);
        }

        // the keeper on the gallery (rare 3)
        if (R(3)) {
          const out = envelope(ev, 12, 1.2, 1.2);
          const px = LH.x - 9 + Math.round(smoothstep(0, 2, ev) * 2 - smoothstep(10, 12, ev) * 2);
          const py = LH.top - 4;
          if (out > 0.2) {
            g.rect(px - 1, py - 8, 3, 6, hex('#0c0d12'));
            g.rect(px - 1, py - 10, 3, 2, hex('#0c0d12'));
            g.rect(px - 2, py - 11, 4, 1, hex('#0c0d12'));
            g.px(px - 2, py - 6, hex('#3a3a3a'));
            if (ev > 2 && ev < 10) {
              // steam off the mug
              for (let i = 0; i < 3; i++) {
                const p = (t * 0.6 + i / 3) % 1;
                g.pxA(px - 2 + Math.sin(t * 2 + i) * 0.8, py - 7 - p * 6, hex('#c8c8c8'), 0.4 * (1 - p));
              }
            }
          }
        }

        // the gull (rare 0): flies in, perches on the rail, squints at every pass of the beam
        if (R(0)) {
          let gx: number;
          let gy: number;
          let flying = true;
          if (ev < 3) {
            const p = smoothstep(0, 3, ev);
            gx = 120 + p * (LH.x + 10 - 120);
            gy = 20 + p * (LH.top - 10 - 20) + Math.sin(p * Math.PI) * -10;
          } else if (ev < 9.5) {
            gx = LH.x + 10;
            gy = LH.top - 10;
            flying = false;
          } else {
            const p = smoothstep(9.5, 12, ev);
            gx = LH.x + 10 + p * 140;
            gy = LH.top - 10 - p * 40;
          }
          const body = hex('#c8ccd4');
          const dark = hex('#5a5e68');
          if (flying) {
            const flap = Math.sin(t * 10) > 0 ? -2 : 1;
            g.hline(gx - 1, gx + 1, gy, body);
            g.line(gx - 1, gy, gx - 4, gy + flap, dark);
            g.line(gx + 1, gy, gx + 4, gy + flap, dark);
          } else {
            const squint = face > 0.8 ? 1 : 0;
            g.rect(gx - 2, gy, 4, 2, body);
            g.px(gx + 2, gy - 1, body);
            g.px(gx + 3, gy - 1, squint ? dark : hex('#2a2a2a'));
            g.px(gx + 4, gy, hex('#c89a3a'));
            g.hline(gx - 3, gx - 1, gy + 1, dark);
            if (squint) g.px(gx + 2, gy - 2, body); // feathers ruffled
          }
        }

        // ── waves breaking on the rock ──
        const surge = 0.6 + f.energy * 0.6;
        const spots: [number, number][] = [
          [134, 129],
          [152, 128],
          [170, 129],
          [236, 129],
          [254, 128],
          [272, 129],
        ];
        for (let i = 0; i < spots.length; i++) {
          const [sx, sy] = spots[i]!;
          const per = 5 + hash3(i, 1) * 3;
          const p = ((t + hash3(i, 2) * per) % per) / per;
          const up = p < 0.35 ? Math.sin((p / 0.35) * Math.PI * 0.5) : 1 - smoothstep(0.35, 0.9, p);
          const hgt = up * (7 + hash3(i, 3) * 8) * surge * (f.reduced ? 0.4 : 1);
          for (let j = 0; j < 22; j++) {
            const r = hash3(i, j, 5);
            const ox = (hash3(i, j, 4) - 0.5) * 14 * (0.5 + up * 0.5);
            const oy = -r * hgt + (p > 0.35 ? (p - 0.35) * 14 * r : 0);
            const fa = (0.3 + 0.5 * hash3(i, j, 6)) * up;
            g.pxA(sx + ox, sy + oy, foam, fa);
            if (j % 3 === 0) g.pxA(sx + ox + 1, sy + oy, foam, fa * 0.8);
            if (j % 4 === 0) g.pxA(sx + ox, sy + oy + 1, foam, fa * 0.6);
          }
          g.rectA(sx - 7, sy, 14, 1, foam, 0.25 + up * 0.35);
        }
        // a lacy line of foam around the base, moving
        for (let x = 124; x < 286; x++) {
          const n = Math.sin(x * 0.4 + t * 1.6) + Math.sin(x * 0.17 - t * 1.1);
          const wy = Math.round(128 + Math.sin(x * 0.09) * 1.5 + Math.sin(x * 0.23) * 1);
          if (n > 0.2) g.pxA(x, wy, foam, 0.2 + 0.15 * n);
          if (n > 1.2) g.pxA(x, wy + 2, foam, 0.25);
        }

        // near haze in front of everything
        drawHaze(g, hazes[1]!, HZN - 4, -t * 2.5, hex('#2a3a4a'), 0.3 + 0.1 * Math.sin(t * 0.2));
      },
    };
  },
};

export default def;

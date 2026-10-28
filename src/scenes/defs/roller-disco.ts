// Saturday Night Forever: the Starlite Rollerdrome at the eternal height of a Saturday night in
// 1977. A mirror ball turns over the rink and throws slow specks across the back wall and the
// polished floor; skaters circle in silhouette; the DJ booth is framed in chasing bulbs. The
// clock above the rink has no hands, and nobody has noticed in a few million hours.

import { callLamp, onAirLamp, sectionDrive } from '../kit/broadcast';
import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { reflectDown } from '../kit/atmos';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { flicker, haze, shaft, vignette } from './lib/night';
import { textWidth as textWidthOf } from '../kit/font';
import { sprite } from '../kit/sprite';
import { type Pose, figure, speck } from './lib/outer';

const BALL = { x: 166, y: 32, r: 9 };
const CLOCK = { x: 104, y: 33, r: 10 };
const BOOTH = { x0: 200, x1: 250, y0: 50, y1: 92 };
const COUNTER = { x0: 74, x1: 128, y0: 64, y1: 86 };
const WALL_Y = 92;
const FLOOR_Y = 99;
const RAIL_Y = 151;
const RINK = { cx: 162, cy: 122, rx: 102, ry: 13 };
const SKATERS = 7;
const SPECKS = 150;

const def: SceneDef = {
  id: 'roller-disco',
  fps: 15,
  focusY: 92,
  rareEvents: 4,
  rareDuration: 12,
  grade: { temperature: 0, bloom: 0.6, saturation: 0.9 },
  create({ accent }) {
    const ink = hex('#07040a');
    const sil = hex('#0b0710');
    const gold = accent;
    const goldD = shade(accent, 0.32);
    const warm = mix(accent, hex('#fff0d0'), 0.45);
    const rose = hex('#e0708a');
    const wallA = hex('#0d0a1a');
    const wallB = hex('#17112c');
    const wood = { d: hex('#1e120c'), m: hex('#2c1a10'), l: hex('#4a2c18') };
    const speckC = hex('#fff2dc');

    // Mirror-ball specks: a fixed direction each (azimuth, elevation), turned by the ball.
    const az = new Float32Array(SPECKS);
    const el = new Float32Array(SPECKS);
    const sb = new Float32Array(SPECKS);
    for (let i = 0; i < SPECKS; i++) {
      az[i] = hash3(i, 1) * Math.PI * 2;
      el[i] = -1.25 + Math.pow(hash3(i, 2), 0.8) * 1.6;
      sb[i] = 0.35 + hash3(i, 3) * 0.65;
    }

    // Skaters: lap phase, speed, look.
    const sk = Array.from({ length: SKATERS }, (_, i) => ({
      ph: (i / SKATERS) * Math.PI * 2 + hash3(i, 7) * 0.5,
      sp: 0.105 + hash3(i, 8) * 0.03,
      hair: [1, 0, 2, 3, 0, 1, 2][i]!,
      flare: i % 2 === 0,
      skirt: i === 2 || i === 5,
      tall: 0.92 + hash3(i, 9) * 0.16,
    }));
    const skate = sprite(
      `
      .aab....
      .aab....
      .aac....
      .aabb...
      .aaaaab.
      .aaaaaab
      .dddddd.
      .e....e.
      `,
      { a: hex('#8a7c68'), b: hex('#b0a288'), c: hex('#c05040'), d: hex('#2a1e18'), e: hex('#a04838') },
    );
    const order = new Int32Array(SKATERS);
    const sy = new Float32Array(SKATERS);
    const pose: Pose = { lean: 0, armL: 0, armR: 0, legL: 0, legR: 0 };

    // Bulbs around the booth: up the left side, across the top, down the right.
    const bulbs: { x: number; y: number }[] = [];
    for (let y = BOOTH.y1 - 2; y > BOOTH.y0; y -= 4) bulbs.push({ x: BOOTH.x0 - 2, y });
    for (let x = BOOTH.x0 - 2; x <= BOOTH.x1 + 2; x += 4) bulbs.push({ x, y: BOOTH.y0 - 2 });
    for (let y = BOOTH.y0 + 2; y < BOOTH.y1; y += 4) bulbs.push({ x: BOOTH.x1 + 2, y });

    // World → screen for the speck projection (a simple room: floor at 0, ball at height 1).
    const floorScreen = (X: number, Z: number, out: number[]) => {
      const u = (Z + 1.6) / 3.0;
      out[0] = RINK.cx + X * 92 * (0.78 + 0.42 * u);
      out[1] = FLOOR_Y + u * (RAIL_Y - FLOOR_Y);
    };
    const pt = [0, 0];

    const skater = (g: Gfx, x: number, y: number, h: number, dir: number, s: number, s0: (typeof sk)[number], c: Color, wobble: number) => {
      const push = Math.sin(s);
      pose.lean = dir * (0.22 + wobble * 0.3 * Math.sin(s * 3));
      pose.legL = dir * 0.08 - dir * Math.max(0, push) * 0.62;
      pose.legR = dir * 0.08 - dir * Math.max(0, -push) * 0.62;
      pose.kneeL = 0.25;
      pose.kneeR = 0.25;
      pose.armL = dir * (0.05 + 0.45 * push) + wobble * Math.sin(s * 5) * 2.2;
      pose.armR = dir * (0.05 - 0.45 * push) - wobble * Math.sin(s * 5 + 1) * 2.2;
      pose.elbowL = dir * 0.6 * Math.max(0, push);
      pose.elbowR = dir * 0.6 * Math.max(0, -push);
      pose.bob = Math.abs(push) * 0.6;
      pose.hair = s0.hair;
      pose.flare = s0.flare;
      pose.skirt = s0.skirt;
      figure(g, x, y - 1, h, pose, c);
    };
    const skates = (g: Gfx, x: number, y: number, h: number, dir: number, s: number, c: Color) => {
      // A wheel glint under each foot.
      const push = Math.sin(s);
      const off = h * 0.27;
      const lx = x - dir * Math.max(0, push) * off;
      const rx = x - dir * Math.max(0, -push) * off;
      g.hline(lx - 1, lx + 1, y, c);
      g.hline(rx - 1, rx + 1, y, c);
    };

    return {
      background(g) {
        // ── ceiling: steel trusses lost in the dark ──
        g.vgrad([hex('#030308'), hex('#06050e'), hex('#0b0916')], g.top, 16);
        for (const ty of [6, -18, -46, -80]) {
          if (ty < g.top - 6) continue;
          const k = clamp(1 - (6 - ty) / 120);
          const c = mix(hex('#06040a'), hex('#1a1420'), k * 0.8);
          g.hline(g.left, g.right, ty, c);
          g.hline(g.left, g.right, ty + 4, c);
          for (let x = Math.floor(g.left / 8) * 8; x < g.right; x += 8) {
            g.line(x, ty, x + 4, ty + 4, c);
            g.line(x + 4, ty + 4, x + 8, ty, c);
          }
          for (let x = 20; x < 320; x += 50) g.glow(x + (ty % 7), ty + 6, 3, hex('#ffd8a0'), 0.18 * k);
        }

        // The rink's name in bulbs, hung from the trusses (seen in tall views).
        if (g.top < -40) {
          const sx = 160;
          const sy = -62;
          g.line(sx - 40, sy - 4, sx - 30, -80, hex('#1a1420'));
          g.line(sx + 40, sy - 4, sx + 30, -80, hex('#1a1420'));
          g.rect(sx - 46, sy - 4, 93, 19, hex('#0e0a10'));
          g.hline(sx - 46, sx + 46, sy - 4, hex('#2a2030'));
          const word = 'STARLITE';
          const w = textWidthOf(word) * 2;
          g.text(word, sx - w / 2, sy + 1, shade(gold, 0.55), 2);
          for (let y = sy + 1; y < sy + 11; y++)
            for (let x = sx - w / 2; x < sx + w / 2; x++)
              if (g.get(x, y) === shade(gold, 0.55) && ((x + y) & 1) === 0) {
                g.px(x, y, warm);
                g.glow(x, y, 3, gold, 0.08);
              }
          g.glow(sx, sy + 6, 50, gold, 0.07, 5);
        }

        // ── the back wall: plum panels, a 1970s supergraphic ──
        g.vgrad([wallA, wallB, hex('#1f1530')], 14, WALL_Y, 14, WALL_Y);
        g.hline(g.left, g.right, 14, hex('#24182c'));
        g.hline(g.left, g.right, 15, hex('#0a060d'));
        for (let x = Math.floor(g.left / 18) * 18; x < g.right; x += 18) g.vline(x, 16, WALL_Y - 1, hex('#0d0812'));
        const stripes = [mix(wallB, hex('#c25a3e'), 0.38), mix(wallB, hex('#d4893c'), 0.38), mix(wallB, gold, 0.36)];
        for (let k = 0; k < 3; k++) {
          for (let x = g.left; x < g.right; x++) {
            // stripes sweep up around the clock
            const y = 68 + k * 4;
            g.rect(x, y, 1, 3, stripes[k]!);
          }
        }

        // ── the clock above the rink (no hands) ──
        g.glow(CLOCK.x, CLOCK.y - 4, 26, warm, 0.1, 5);
        g.disc(CLOCK.x, CLOCK.y + 1, CLOCK.r + 2, ink);
        g.disc(CLOCK.x, CLOCK.y, CLOCK.r + 1, hex('#5a4a3a'));
        g.ball(CLOCK.x, CLOCK.y, CLOCK.r, CLOCK.r, [hex('#8a7c68'), hex('#b0a288'), hex('#cfc2a4'), hex('#e2d6ba')], -0.2, -0.7, 0.4);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = i % 3 === 0 ? CLOCK.r - 2 : CLOCK.r - 1.5;
          g.px(Math.round(CLOCK.x + Math.sin(a) * r), Math.round(CLOCK.y - Math.cos(a) * r), hex('#3a2e26'));
          if (i % 3 === 0) g.px(Math.round(CLOCK.x + Math.sin(a) * (r - 1)), Math.round(CLOCK.y - Math.cos(a) * (r - 1)), hex('#3a2e26'));
        }
        g.px(CLOCK.x, CLOCK.y, hex('#3a2e26'));
        g.rect(CLOCK.x - 4, CLOCK.y - CLOCK.r - 6, 9, 2, hex('#2a2026'));
        g.px(CLOCK.x, CLOCK.y - CLOCK.r - 4, warm);

        // ── skate rental counter: cubbies of boots in warm light ──
        const C = COUNTER;
        g.rect(C.x0 - 2, C.y0 - 2, C.x1 - C.x0 + 4, C.y1 - C.y0 + 8, ink);
        g.gradRect(C.x0, C.y0, C.x1 - C.x0, C.y1 - C.y0, [hex('#2a1810'), hex('#3c2414'), hex('#4a2c16')]);
        for (let row = 0; row < 3; row++) {
          const yy = C.y0 + 2 + row * 7;
          g.hline(C.x0, C.x1 - 1, yy + 6, hex('#1a0e08'));
          for (let k = 0; k < 9; k++) {
            const xx = C.x0 + 3 + k * 6;
            g.vline(xx - 2, yy, yy + 5, hex('#24140c'));
            if (hash3(row, k, 4) < 0.25) continue;
            const boot = hash3(row, k, 5) < 0.5 ? hex('#b8a488') : hex('#6a3a24');
            g.rect(xx, yy + 1, 2, 3, boot);
            g.rect(xx, yy + 3, 4, 1, boot);
            g.px(xx + 1, yy + 1, shade(boot, 0.7));
            g.rect(xx, yy + 4, 4, 1, shade(boot, 0.6));
            g.px(xx, yy + 5, hex('#d06848'));
            g.px(xx + 3, yy + 5, hex('#d06848'));
          }
        }
        g.rect(C.x0 - 3, C.y1, C.x1 - C.x0 + 6, 3, wood.l);
        g.hline(C.x0 - 3, C.x1 + 2, C.y1, mix(wood.l, warm, 0.5));
        g.rect(C.x0 - 1, C.y1 + 3, C.x1 - C.x0 + 2, WALL_Y - C.y1 - 3, wood.d);
        // the sign
        g.rect(C.x0 + 8, C.y0 - 10, C.x1 - C.x0 - 16, 7, hex('#140c10'));
        g.textCenter('SKATES', (C.x0 + C.x1) / 2, C.y0 - 9, mix(goldD, gold, 0.55));
        g.glow((C.x0 + C.x1) / 2, C.y0 - 6, 18, gold, 0.06, 4);

        // ── the DJ booth: recess, lamp, decks ──
        const B = BOOTH;
        g.rect(B.x0 - 4, B.y0 - 4, B.x1 - B.x0 + 9, B.y1 - B.y0 + 4, hex('#140c12'));
        g.gradRect(B.x0, B.y0, B.x1 - B.x0 + 1, B.y1 - B.y0, [hex('#0e080e'), hex('#1c0f12'), hex('#2e1810')]);
        g.glow((B.x0 + B.x1) / 2, B.y0 + 10, 24, warm, 0.12, 5);
        g.rect(B.x0 + 20, B.y0, 9, 3, hex('#3a2818'));
        g.rect(B.x0 + 21, B.y0 + 3, 7, 1, warm);
        // record crates and a shelf of sleeves behind the DJ
        for (let k = 0; k < 10; k++) g.rect(B.x0 + 3 + k * 2, B.y0 + 16, 1, 6, mix(hex('#2a1a14'), [rose, gold, hex('#6a8ab0')][k % 3]!, 0.25));
        for (let k = 0; k < 8; k++) g.rect(B.x1 - 18 + k * 2, B.y0 + 16, 1, 6, mix(hex('#2a1a14'), [gold, rose][k % 2]!, 0.22));
        // the console front: chrome trim and a stripe
        g.rect(B.x0 - 2, 78, B.x1 - B.x0 + 5, WALL_Y - 78, hex('#1a0f12'));
        g.hline(B.x0 - 2, B.x1 + 2, 78, mix(hex('#3a2a2a'), warm, 0.5));
        g.rect(B.x0 - 2, 84, B.x1 - B.x0 + 5, 2, mix(hex('#1a0f12'), gold, 0.3));
        g.ellipse(B.x0 + 14, 77, 6, 1, hex('#0a0608'));
        g.ellipse(B.x1 - 14, 77, 6, 1, hex('#0a0608'));

        // ── the rink barrier ──
        g.rect(g.left, WALL_Y, g.w, FLOOR_Y - WALL_Y, wood.d);
        g.hline(g.left, g.right, WALL_Y, wood.l);
        g.hline(g.left, g.right, WALL_Y + 1, wood.m);
        for (let x = Math.floor(g.left / 24) * 24; x < g.right; x += 24) g.vline(x, WALL_Y + 2, FLOOR_Y - 1, hex('#140a07'));
        g.hline(g.left, g.right, FLOOR_Y - 1, ink);

        // ── the rink: polished maple under coloured light ──
        for (let y = FLOOR_Y; y < RAIL_Y; y++) {
          const u = (y - FLOOR_Y) / (RAIL_Y - FLOOR_Y);
          const base = mix(hex('#2c1a10'), hex('#4a2e1a'), u);
          g.rect(g.left, y, g.w, 1, base);
          // board seams, closer together in the distance
          const seam = Math.pow(u, 0.6) * 22;
          if (seam % 1 < 0.12 + u * 0.1) g.rect(g.left, y, g.w, 1, shade(base, 0.78));
        }
        // long boards: faint vertical joints converging on the far side
        for (let k = -16; k <= 16; k++) {
          for (let y = FLOOR_Y; y < RAIL_Y; y++) {
            const u = (y - FLOOR_Y) / (RAIL_Y - FLOOR_Y);
            const x = RINK.cx + k * (9 + u * 9);
            if (hash3(k, y >> 2, 3) < 0.6) g.pxA(x, y, ink, 0.25);
          }
        }
        // painted rink line
        for (let a = 0; a < Math.PI * 2; a += 0.004) {
          const x = RINK.cx + Math.cos(a) * 74;
          const y = RINK.cy + 2 + Math.sin(a) * 10;
          g.pxA(x, y, hex('#c8b490'), 0.14);
        }
        // reflections: the counter, the booth and the clock in the gloss
        for (let y = FLOOR_Y; y < FLOOR_Y + 30; y++) {
          const k = Math.pow(1 - (y - FLOOR_Y) / 30, 2);
          g.rectAdd(COUNTER.x0 + 2, y, COUNTER.x1 - COUNTER.x0 - 4, 1, hex('#a0582a'), 0.16 * k);
          g.rectAdd(BOOTH.x0, y, BOOTH.x1 - BOOTH.x0, 1, mix(warm, rose, 0.3), 0.1 * k);
          g.rectAdd(CLOCK.x - 6, y + 4, 12, 1, hex('#d8ccb4'), 0.07 * k);
        }
        // coloured washes on the rink: gold under the ball, rose and violet from the side cans
        g.glow(BALL.x, RINK.cy - 2, 90, mix(warm, gold, 0.4), 0.2, 7);
        g.glow(40, RINK.cy + 6, 70, rose, 0.12, 6);
        g.glow(290, RINK.cy + 4, 70, hex('#7a6ae0'), 0.1, 6);

        // ── the front rail and the carpet beyond it ──
        g.rect(g.left, RAIL_Y, g.w, g.bottom - RAIL_Y, hex('#0a060a'));
        for (let y = RAIL_Y + 8; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            // a dim 70s carpet: interlocking rings in rust and plum
            const cx = ((x % 16) + 16) % 16 - 8;
            const cy = ((y % 16) + 16) % 16 - 8;
            const r = Math.hypot(cx, cy);
            const ring = Math.abs(r - 5) < 1 ? 1 : 0;
            const fade = clamp(1 - (y - RAIL_Y) / 120);
            if (ring) g.px(x, y, mix(hex('#0d080b'), hex('#3a1a18'), 0.5 * fade));
            else if (bayer(x, y) < 0.15) g.px(x, y, hex('#120a0f'));
          }
        g.rect(g.left, RAIL_Y, g.w, 3, hex('#1a1014'));
        g.hline(g.left, g.right, RAIL_Y, mix(hex('#3a2a2a'), warm, 0.35));
        g.rect(g.left, RAIL_Y + 3, g.w, 5, hex('#0c070a'));
        for (let x = Math.floor(g.left / 46) * 46 + 10; x < g.right; x += 46) g.rect(x, RAIL_Y, 3, 8, hex('#140c10'));

        // A bench beyond the rail (seen in tall views) with a pair of skates left on it.
        g.rect(96, 196, 70, 4, hex('#24160f'));
        g.hline(96, 165, 196, hex('#3e2818'));
        g.rect(100, 200, 3, 12, hex('#140a07'));
        g.rect(159, 200, 3, 12, hex('#140a07'));
        g.blit(skate, 118, 187);
        g.blit(skate, 129, 188);
        g.glow(126, 192, 16, warm, 0.05, 4);
        g.ellipseA(130, 212, 40, 4, ink, 0.6);

        // Spotlights from the ceiling corners, aimed at the ball.
        shaft(g, 26, 2, BALL.x - 4, BALL.y + 2, 3, 12, warm, 0.13, 0.05, 6);
        shaft(g, 304, 0, BALL.x + 4, BALL.y + 1, 3, 12, mix(warm, rose, 0.5), 0.11, 0.05, 6);
        haze(g, 14, 60, hex('#2a1a28'), 0.12, 0);

        g.lighting(0.66);
        g.light(BALL.x, RINK.cy, 140, 0.4, 36);
        g.light(225, 70, 44, 0.5);
        g.light(101, 74, 40, 0.42);
        g.light(CLOCK.x, CLOCK.y, 22, 0.25);
        vignette(g, 0.45, 162, 92, 240, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const drive = sectionDrive(f);
        const sp = f.speech ?? 0;
        const e = f.energy * drive;
        const slow = f.rare === 2 && ev < 12 ? envelope(ev, 12, 2, 2.5) : 0;
        const spin = 0.32 * drive * (1 - slow * 0.6) * (0.3 + 0.7 * awake);
        const rot = t * spin;

        // ── specks from the mirror ball ──
        const tint = mix(speckC, rose, slow * 0.6 + (drive < 0.8 ? 0.35 : 0));
        for (let i = 0; i < SPECKS; i++) {
          const th = az[i]! + rot;
          const ce = Math.cos(el[i]!);
          const dx = ce * Math.sin(th);
          const dz = ce * Math.cos(th);
          const down = -Math.sin(el[i]!);
          let x = 0;
          let y = 0;
          let k = sb[i]! * (0.65 + 0.35 * e) * drive * (0.35 + 0.65 * awake);
          let onWall = false;
          if (down > 0.05) {
            const s = 1 / down;
            const X = s * dx;
            const Z = s * dz;
            if (Z > 1.4) continue;
            if (Z < -1.6) onWall = true;
            else {
              floorScreen(X, Z, pt);
              x = pt[0]!;
              y = pt[1]!;
              k *= 0.7;
            }
          } else onWall = true;
          if (onWall) {
            if (dz > -0.08) continue;
            const s = 1.6 / -dz;
            const Y = 1 + s * -down;
            if (Y < 0.1 || Y > 1.55) continue;
            x = RINK.cx + s * dx * 76;
            y = WALL_Y - Y * 50;
            k *= clamp(-dz * 1.4);
          }
          if (x < g.left || x >= g.right) continue;
          speck(g, x, y, tint, k);
        }

        // ── the mirror ball ──
        g.vline(BALL.x, g.top, BALL.y - BALL.r - 1, hex('#2a2430'));
        g.glow(BALL.x, BALL.y, Math.round(24 * drive), warm, (0.16 + 0.1 * e * awake) * drive);
        if (drive > 1.2 && !f.reduced) {
          shaft(g, BALL.x, BALL.y, RINK.cx - 48, RINK.cy + 4, 4, 28, gold, 0.1 * (drive - 1) * awake, 0.2, 5);
          shaft(g, BALL.x, BALL.y, RINK.cx + 48, RINK.cy + 4, 4, 28, rose, 0.1 * (drive - 1) * awake, 0.2, 5);
        }
        for (let yy = -BALL.r; yy <= BALL.r; yy++) {
          for (let xx = -BALL.r; xx <= BALL.r; xx++) {
            const d2 = xx * xx + yy * yy;
            if (d2 > BALL.r * BALL.r + BALL.r) continue;
            const z = Math.sqrt(Math.max(0, BALL.r * BALL.r - d2)) / BALL.r;
            const lon = Math.atan2(xx, z * BALL.r) + rot;
            const lat = Math.floor((yy + BALL.r) / 2);
            const fx = Math.floor(lon * 3.2);
            const hsh = hash3(fx, lat, 9);
            const lit = hsh > 0.84 ? 1 : (0.15 + hsh * 0.75) * (0.35 + 0.65 * z) * (xx < 2 ? 1 : 0.7);
            const c = lit >= 1 ? hex('#fff6e6') : mix(hex('#1c1822'), hex('#c8c0c4'), lit);
            g.px(BALL.x + xx, BALL.y + yy, c);
          }
        }
        g.px(BALL.x - 3, BALL.y - 3, hex('#ffffff'));

        // ── chasing bulbs around the booth ──
        const step = Math.floor(t * 6 * drive);
        for (let i = 0; i < bulbs.length; i++) {
          const b = bulbs[i]!;
          const on = slow > 0.5 ? i % 2 === 0 : (i + step) % 3 === 0;
          const k = (slow > 0.5 ? 0.55 : on ? 1 : 0.15) * clamp(drive * 0.9, 0.5, 1.3);
          g.px(b.x, b.y, mix(goldD, warm, clamp(k)));
          if (k > 0.3) {
            g.glow(b.x, b.y, 4, gold, 0.28 * k);
            // and their streaks in the gloss of the floor
            g.pxAdd(b.x, FLOOR_Y + 2 + (WALL_Y - b.y) * 0.35, gold, 0.18 * k);
          }
        }

        // ── the DJ ──
        onAirLamp(g, BOOTH.x0 + 3, BOOTH.y0 + 3, f);
        callLamp(g, BOOTH.x1 - 5, BOOTH.y0 + 4, f);
        const nod = f.reduced ? 0 : Math.round((f.pulse * drive + sp * 1.2) * awake + Math.sin(t * 2.4) * 0.4 * awake);
        pose.lean = sp > 0.1 ? 0.08 : 0;
        pose.legL = 0;
        pose.legR = 0;
        pose.kneeL = 0;
        pose.kneeR = 0;
        pose.armL = 0.9 + Math.sin(t * 3) * 0.15 * awake * drive;
        pose.armR = sp > 0.15 ? -2.9 : -2.6;
        pose.elbowL = 0.8;
        pose.elbowR = -0.9;
        pose.bob = nod;
        pose.nod = 0;
        pose.hair = 1;
        pose.flare = false;
        pose.skirt = false;
        g.clip(BOOTH.x0, BOOTH.y0, BOOTH.x1 - BOOTH.x0, 78 - BOOTH.y0);
        figure(g, 226, 96, 30, pose, mix(sil, warm, 0.06));
        g.noClip();
        g.pxAdd(222, 64 + nod, warm, 0.5);
        g.pxAdd(229, 65 + nod, warm, 0.3);
        // the decks and a turning record
        g.rect(BOOTH.x0 - 2, 78, BOOTH.x1 - BOOTH.x0 + 5, 1, mix(hex('#3a2a2a'), warm, 0.5));
        const rp = Math.floor(t * 4) % 4;
        g.px(BOOTH.x0 + 12 + rp, 77, hex('#d8c8a8'));
        g.px(BOOTH.x1 - 16 + ((rp + 2) % 4), 77, hex('#d8c8a8'));

        // ── skaters, back to front ──
        for (let i = 0; i < SKATERS; i++) {
          const s0 = sk[i]!;
          const ph = s0.ph + t * s0.sp * (0.35 + 0.65 * awake) * (1 - slow * 0.4);
          sy[i] = Math.sin(ph);
          order[i] = i;
        }
        for (let i = 1; i < SKATERS; i++) {
          const v = order[i]!;
          let j = i - 1;
          while (j >= 0 && sy[order[j]!]! > sy[v]!) {
            order[j + 1] = order[j]!;
            j--;
          }
          order[j + 1] = v;
        }
        for (let n = 0; n < SKATERS; n++) {
          const i = order[n]!;
          const s0 = sk[i]!;
          const ph = s0.ph + t * s0.sp * (0.35 + 0.65 * awake) * (1 - slow * 0.4);
          const depth = (Math.sin(ph) + 1) / 2;
          const x = RINK.cx + Math.cos(ph) * RINK.rx;
          const y = Math.round(RINK.cy + Math.sin(ph) * RINK.ry);
          const h = Math.round((21 + depth * 13) * s0.tall);
          const dir = Math.sin(ph) > 0 ? -1 : 1;
          const stride = f.reduced ? 1 : t * 2.1 + i * 1.3;
          const wob = f.rare === 3 && ev < 12 && i === 3 ? envelope(ev, 12, 1, 3) : 0;
          // rim light from the booth side, then the silhouette
          const rimC = mix(sil, x > 180 ? warm : mix(warm, rose, 0.5), 0.16 + 0.14 * (1 - depth));
          skater(g, x + (x > 170 ? 1 : -1), y, h, dir, stride, s0, rimC, wob);
          skater(g, x, y, h, dir, stride, s0, sil, wob);
          skates(g, x, y, h, dir, stride, mix(sil, warm, 0.3));
          reflectDown(g, x - h * 0.6, x + h * 0.6, y + 1, Math.round(h * 0.45), 0.22);
        }

        // Rare: a couple skates by hand in hand along the near side.
        if (f.rare === 1 && ev < 12) {
          const p = ev / 12;
          const x = g.right + 20 - p * (g.w + 60);
          const y = 138;
          const stride = t * 2;
          for (let k = 0; k < 2; k++) {
            const xx = x + k * 13;
            skater(g, xx + 1, y, 28, -1, stride + k * 0.2, sk[k * 2 + 1]!, mix(sil, rose, 0.35), 0);
            skater(g, xx, y, 28, -1, stride + k * 0.2, sk[k * 2 + 1]!, sil, 0);
          }
          g.line(x + 4, y - 16, x + 9, y - 16, sil);
          reflectDown(g, x - 20, x + 34, y + 1, 12, 0.22);
        }

        // Rare: for a moment the clock grows hands, considers them, and lets them go.
        if (f.rare === 0 && ev < 12) {
          const k = envelope(ev, 12, 2.5, 3);
          if (k > 0.05) {
            const a1 = -0.4 + (f.reduced ? 0 : smoothstep(3, 9, ev) * Math.PI * 2);
            const a2 = 1.9 + (f.reduced ? 0 : smoothstep(3, 9, ev) * Math.PI * 0.4);
            const c = mix(hex('#cfc2a4'), hex('#2a201a'), k);
            g.line(CLOCK.x, CLOCK.y, CLOCK.x + Math.sin(a1) * 7, CLOCK.y - Math.cos(a1) * 7, c);
            g.line(CLOCK.x, CLOCK.y, CLOCK.x + Math.sin(a2) * 5, CLOCK.y - Math.cos(a2) * 5, c);
          }
        }

        // The little lamp over the clock, and the rental counter's bulb.
        g.glow(CLOCK.x, CLOCK.y - CLOCK.r - 4, 6, warm, 0.25 * flicker(t, 3, 2));
        g.glow(101, COUNTER.y0 + 1, 10, warm, 0.12);
        // slow-dance light: a rose wash
        if (slow > 0) g.glow(RINK.cx, RINK.cy - 10, 120, rose, 0.08 * slow, 5);
        // beat swell in the floor's gloss
        g.glow(BALL.x, RINK.cy - 4, 40, warm, 0.05 * f.pulse * awake);
      },
    };
  },
};

export default def;

// The Switchboard: Central Exchange, between every universe, since 1946. Two banks of
// switchboard run away from us down an aisle into the dark, their jack fields pricked with
// lamps that wink on and off with calls from very far away. One operator sits at the near
// end in a pool of light under a green enamel shade, headset on, cords in hand. A station
// clock hangs over the aisle, ticking.
// Rare events: a call comes down the line from the far end, every lamp lighting in turn; far
// off in the dark another operator's lamp comes on, and goes off; the clock runs backward for
// a few seconds; the operator glances over her shoulder at you, nods, and gets on with it.

import { callLamp, onAirLamp } from '../kit/broadcast';
import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { hash3, noise1 } from '../kit/rng';
import { sprite } from '../kit/sprite';
import type { SceneDef } from '../types';
import { motes, shaft, vignette } from './lib/night';

const VP = { x: 168, y: 74 }; // vanishing point (eye level)
const F = 110; // focal length, px per world unit at z = 1
const BANK = 1.5; // the banks' faces stand this far either side of the aisle
const SHELF = -0.42; // keyshelf height (eye level is 0)
const SHELF_D = 0.42; // keyshelf depth (toward the aisle)
const TOP = 1.25; // top of the jack field
const FLOOR_Y = -1.3;
const CEIL = 1.75;
const Z0 = 1.35;
const ZFAR = 70;
const OP = { x: -0.92, z: 2.35 }; // the operator's stool
const CLOCK = { x: 0.15, y: 1.0, z: 3.6 };
const FAR_OP = { x: -1.0, z: 26 };

const sx = (x: number, z: number) => VP.x + (x * F) / z;
const sy = (y: number, z: number) => VP.y - (y * F) / z;

const def: SceneDef = {
  id: 'switchboard',
  fps: 15,
  focusX: 150,
  focusY: 80,
  rareEvents: 4,
  rareDuration: 10,
  grade: { temperature: 0.2, contrast: 1.15, saturation: 0.78, bloom: 0.8, threshold: 0.6, vignette: 0.36, shadows: '#060405' },
  create({ accent }) {
    const ink = hex('#040303');
    const wood = [hex('#0c0807'), hex('#160e0b'), hex('#20150f'), hex('#2c1d14'), hex('#3a281a')];
    const bakelite = [hex('#0a0909'), hex('#121010'), hex('#1a1716')];
    const brass = mix(accent, hex('#8a6a3a'), 0.4);
    const brassL = mix(accent, hex('#fff0c8'), 0.4);
    const lampOn = mix(accent, hex('#ffe0a0'), 0.55);
    const lampWhite = hex('#fff6e0');
    const warm = hex('#ffd498');
    const shadeC = hex('#1e3a28');
    const cordC = [hex('#2a1a12'), hex('#3a2418'), hex('#1a1a20')];
    const skin = hex('#b8907a');
    const skinD = hex('#4e3a30');
    const cardigan = hex('#1c171a');
    const cardiganD = hex('#100c0e');
    const hairC = hex('#120a07');

    // Lamps on each bank: [side, z, y]; a few hundred each, laid out once.
    const lamps: { side: number; z: number; y: number; seed: number }[] = [];
    for (const side of [-1, 1])
      for (let z = Z0 + 0.1; z < ZFAR; z += 0.11 * Math.max(1, z / 6))
        for (const y of [-0.22, 0.32, 0.86]) {
          const seed = hash3(Math.round(z * 100), Math.round(y * 10), side + 5);
          if (seed < 0.5) lamps.push({ side, z, y: y + (seed - 0.25) * 0.08, seed });
        }

    // The operator from behind: shoulders, a fitted cardigan, a skirt over the stool; and the
    // back of her head, hair in victory rolls, the headset's earpiece.
    const warmRim = mix(cardigan, warm, 0.45);
    const bodySpr = sprite(
      `
      .....CCCCCCC.....
      ...CCcccccccCC...
      ..Cccccccccccdd..
      .Ccccccccccccddd.
      .Lcccccccccccddd.
      .Lcccccccccccddd.
      .Lccccccccccdddd.
      ..ccccccccccddd..
      ..cccccccccdddd..
      ...ccccccccddd...
      ...cccccccdddd...
      ...cccccccddd....
      ....ccccccddd....
      ....cccccdddd....
      ...ccccccdddd....
      ...cccccccdddd...
      ..ccccccccddddd..
      ..ccccccccddddd..
      ..KKKKKKKKKKKKK..
      .kkkkkkkkkkkkkkk.
      kkkkkkkkkkkkkkkkk
      .kkkkkkkkkkkkkkk.
      `,
      { C: warmRim, L: mix(cardigan, warm, 0.25), c: cardigan, d: cardiganD, K: mix(hex('#1c1a22'), warm, 0.2), k: hex('#1c1a22') },
    );
    const headSpr = sprite(
      `
      .HH.....HH.
      HhhH...HhhH
      hhhhHHHhhhh
      hhhhhhhhhhh
      shhhhhhhhhh
      shhhhhhhhhh
      shhhhhhhhhb
      shhhhhhhhhb
      .hhhhhhhhhb
      .hhhhhhhhh.
      ..hHHHHHh..
      ...hhhhh...
      ....sss....
      ....sss....
      `,
      { H: mix(hairC, warm, 0.42), h: hairC, s: skinD, b: hex('#0a0a0a') },
    );
    const inPool = (x: number, y: number) => clamp(1 - Math.hypot((x - sx(OP.x, OP.z)) / 34, (y - 70) / 70));

    return {
      background(g) {
        // ── the dark: ceiling, floor, a far end that never arrives ──
        g.fill(ink);
        // floor: polished boards running to the vanishing point
        for (let y = Math.ceil(VP.y + 1); y < g.bottom; y++) {
          const z = (-FLOOR_Y * F) / (y - VP.y);
          const k = clamp(1.2 / z);
          const row = mix(hex('#050404'), wood[2]!, k * 0.9);
          g.hline(g.left, g.right, y, row);
        }
        for (let i = -12; i <= 12; i++) {
          const x = i * 0.25;
          g.line(sx(x, Z0 * 0.6), sy(FLOOR_Y, Z0 * 0.6), VP.x, VP.y, hex('#060505'));
        }
        // the polished aisle catches the far dark and the near lamp: a long faint sheen
        for (let y = Math.ceil(VP.y + 2); y < g.bottom; y++) {
          const z = (-FLOOR_Y * F) / (y - VP.y);
          const hw = (0.35 * F) / z;
          g.rectA(VP.x - hw, y, hw * 2, 1, hex('#3a2c20'), 0.12 * clamp(z / 6) * clamp(3 / z + 0.3));
        }
        // ceiling
        for (let y = g.top; y < VP.y; y++) {
          const z = (CEIL * F) / (VP.y - y);
          const k = clamp(1 / z);
          g.hline(g.left, g.right, y, mix(hex('#040303'), wood[1]!, k * 0.8));
        }
        for (let z = Z0; z < 40; z *= 1.32) g.hline(sx(-BANK, z), sx(BANK, z), sy(CEIL, z), mix(hex('#050404'), wood[2]!, clamp(1.6 / z)));

        // ── the two banks ──
        for (const side of [-1, 1]) {
          const X = side * BANK;
          const XS = side * (BANK - SHELF_D);
          // slice by slice from far to near, so nearer slices cover farther ones
          const zs: number[] = [];
          for (let z = ZFAR; z > Z0; z /= 1.035) zs.push(z);
          zs.push(Z0 * 0.5);
          for (let i = 0; i < zs.length - 1; i++) {
            const za = zs[i]!;
            const zb = zs[i + 1]!;
            const fade = clamp(2.2 / za) ** 0.8;
            const dim = (c: Color) => mix(hex('#030202'), c, fade);
            // jack panel face (vertical, at X)
            g.poly([sx(X, za), sy(TOP, za), sx(X, zb), sy(TOP, zb), sx(X, zb), sy(SHELF, zb), sx(X, za), sy(SHELF, za)], dim(bakelite[2]!));
            // the cornice over the panel
            g.poly([sx(X, za), sy(TOP + 0.18, za), sx(X, zb), sy(TOP + 0.18, zb), sx(X, zb), sy(TOP, zb), sx(X, za), sy(TOP, za)], dim(wood[3]!));
            // the keyshelf (horizontal, from X to XS)
            g.poly([sx(X, za), sy(SHELF, za), sx(X, zb), sy(SHELF, zb), sx(XS, zb), sy(SHELF, zb), sx(XS, za), sy(SHELF, za)], dim(wood[2]!));
            // the shelf's front edge and the cabinet below it
            g.poly([sx(XS, za), sy(SHELF, za), sx(XS, zb), sy(SHELF, zb), sx(XS, zb), sy(SHELF - 0.06, zb), sx(XS, za), sy(SHELF - 0.06, za)], dim(wood[4]!));
            g.poly([sx(XS, za), sy(SHELF - 0.06, za), sx(XS, zb), sy(SHELF - 0.06, zb), sx(XS, zb), sy(FLOOR_Y, zb), sx(XS, za), sy(FLOOR_Y, za)], dim(wood[1]!));
          }
          // position dividers: every 0.9 units a wooden stile on the panel and a seat gap
          for (let z = Z0 + 0.6; z < ZFAR; z += 0.9) {
            const fade = clamp(2.2 / z) ** 0.8;
            const c = mix(hex('#030202'), wood[3]!, fade);
            g.line(sx(X, z), sy(TOP, z), sx(X, z), sy(SHELF, z), c);
            g.line(sx(XS, z), sy(SHELF - 0.06, z), sx(XS, z), sy(FLOOR_Y, z), mix(hex('#030202'), wood[0]!, fade));
            // the designation strip under each lamp row
            for (const y of [-0.3, 0.24, 0.78]) {
              const zz = z + 0.9;
              g.line(sx(X, z), sy(y, z), sx(X, zz), sy(y, zz), mix(hex('#030202'), hex('#5a5040'), fade * 0.6));
            }
          }
          // brass position numbers on the cornice, counting off into the dark
          for (let n = 0; n < 9; n++) {
            const z = Z0 + 0.6 + n * 0.9 + 0.45;
            const fade = clamp(2.2 / z) ** 0.8;
            const px = sx(X, z);
            const py = sy(TOP + 0.09, z);
            const label = String(side < 0 ? n * 2 + 1 : n * 2 + 2);
            if ((0.09 * F) / z >= 2.5) g.textCenter(label, px, py - 2, mix(hex('#030202'), brass, fade * 0.8));
            else g.px(px, py, mix(hex('#030202'), brass, fade * 0.6));
          }
          // the jack field: brass-ringed holes, too many to count
          for (let z = Z0 + 0.06; z < 24; z += 0.075 * Math.max(1, z / 4)) {
            const fade = clamp(2.2 / z) ** 0.8;
            for (let y = -0.12; y < TOP - 0.05; y += 0.11) {
              if (Math.abs(y - 0.3) < 0.05 || Math.abs(y - 0.84) < 0.05) continue;
              const px = sx(X, z);
              const py = sy(y, z);
              const r = 0.022 * F / z;
              if (r > 0.9) {
                g.px(px, py, mix(hex('#030202'), brass, fade * 0.7));
                g.px(px + side, py, ink);
              } else g.pxA(px, py, ink, 0.5 * fade);
            }
          }
          // keys and plugs on the shelf near the operator
          for (let z = Z0 + 0.1; z < 9; z += 0.13) {
            const fade = clamp(2.2 / z) ** 0.8;
            for (const d of [0.1, 0.2, 0.3]) {
              const x = X - side * d;
              const px = sx(x, z);
              const py = sy(SHELF, z);
              const h = Math.max(1, Math.round((0.07 * F) / z));
              if (hash3(Math.round(z * 100), d * 10, side) < 0.55) g.vline(px, py - h, py, mix(hex('#030202'), d === 0.3 ? hex('#5a2a20') : brass, fade * 0.8));
            }
          }
        }

        // ── cords: patched from the keyshelf up into the jack field, sagging ──
        const cord = (side: number, za: number, zb: number, yb: number, c: Color, sag: number) => {
          const X = side * BANK;
          const ax = side * (BANK - 0.12);
          for (let i = 0; i <= 40; i++) {
            const u = i / 40;
            const z = za + (zb - za) * u;
            const x = ax + (X - ax) * u;
            const y = SHELF + (yb - SHELF) * u - Math.sin(u * Math.PI) * sag;
            g.px(sx(x, z), sy(y, z), c);
            g.px(sx(x, z), sy(y, z) + 1, shade(c, 0.6));
          }
        };
        for (let k = 0; k < 26; k++) {
          const side = k % 3 === 0 ? 1 : -1;
          const za = Z0 + 0.3 + hash3(k, 1) * 6;
          const zb = za + (hash3(k, 2) - 0.4) * 1.6;
          const yb = -0.05 + hash3(k, 3) * 1.1;
          const fade = clamp(2.2 / za) ** 0.8;
          cord(side, za, Math.max(Z0 + 0.1, zb), yb, mix(hex('#030202'), cordC[k % 3]!, fade), 0.25 + hash3(k, 4) * 0.3);
        }

        // ── the operator's stool (she is drawn per frame) and the far lamps hanging dark ──
        {
          const x = sx(OP.x, OP.z);
          const seat = sy(-0.52, OP.z);
          const foot = sy(FLOOR_Y, OP.z);
          g.rect(x - 7, seat, 15, 3, wood[3]!);
          g.vline(x - 5, seat + 3, foot, wood[2]!);
          g.vline(x + 5, seat + 3, foot, wood[2]!);
          g.vline(x, seat + 3, foot, wood[1]!);
          g.hline(x - 5, x + 5, foot - 10, wood[2]!);
        }
        // empty stools at every other position, down both sides into the dark
        for (const side of [-1, 1])
          for (let z = Z0 + 1.05 + (side > 0 ? 0.45 : 0); z < 30; z += 1.8) {
            if (side < 0 && Math.abs(z - OP.z) < 0.6) continue;
            const fade = clamp(1.8 / z) ** 0.9;
            const c = mix(hex('#030202'), wood[3]!, fade);
            const x = sx(side * 0.92, z);
            const y = sy(-0.52, z);
            const ft = sy(FLOOR_Y, z);
            const w = Math.max(1, (0.16 * F) / z);
            g.rect(x - w, y, w * 2 + 1, Math.max(1, (0.05 * F) / z), c);
            g.vline(x - w * 0.7, y + 1, ft, mix(hex('#030202'), wood[2]!, fade));
            g.vline(x + w * 0.7, y + 1, ft, mix(hex('#030202'), wood[2]!, fade));
          }
        for (let z = 6; z < 40; z += 4.5) {
          const fade = clamp(2.2 / z);
          const x = sx(OP.x, z);
          const y = sy(1.2, z);
          g.vline(x, sy(CEIL, z), y, mix(hex('#030202'), hex('#1a1a1a'), fade));
          g.ellipse(x, y, Math.max(1, (0.16 * F) / z), Math.max(1, (0.06 * F) / z), mix(hex('#030202'), shadeC, fade));
        }

        // ── the station clock on its bracket over the aisle ──
        {
          const x = sx(CLOCK.x, CLOCK.z);
          const y = sy(CLOCK.y, CLOCK.z);
          g.vline(x, sy(CEIL, CLOCK.z), y - 7, hex('#1a1612'));
          g.disc(x, y, 8, hex('#1a1612'));
          g.disc(x, y, 7, brass);
          g.disc(x, y, 6, hex('#7e766a'));
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            g.px(x + Math.cos(a) * 5, y + Math.sin(a) * 5, hex('#2a2620'));
          }
        }

        // ── light ──
        g.lighting(0.32);
        const ox = sx(OP.x, OP.z);
        g.light(ox, 70, 52, 0.95, 74);
        g.light(sx(-BANK, OP.z), 60, 30, 0.5, 40);
        g.light(sx(CLOCK.x, CLOCK.z), sy(CLOCK.y, CLOCK.z), 18, 0.12);
        g.light(VP.x, VP.y, 140, 0.25, 50);
        // the pool on the floor and the shelf
        g.ellipseA(ox, sy(FLOOR_Y, OP.z) + 2, 34, 6, warm, 0.1);
        g.ellipseA(ox - 2, sy(FLOOR_Y, OP.z) + 2, 22, 4, warm, 0.08);
        vignette(g, 0.4, 150, 80, 260, 200);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const live = 0.55 + 0.45 * f.awake;

        // ── lamps winking down the line ──
        const sp = f.speech ?? 0;
        const isCall = f.voiceCategory === 'call';
        const isVoice = f.segmentKind === 'voice' || sp > 0.05;
        onAirLamp(g, sx(-BANK, OP.z) - 2, sy(TOP + 0.08, OP.z), f);
        callLamp(g, sx(-BANK + 0.08, OP.z - 0.15), sy(SHELF + 0.05, OP.z - 0.15), f);
        const wave = R(0) ? ev : -1;
        for (let i = 0; i < lamps.length; i++) {
          const L = lamps[i]!;
          const period = 3 + L.seed * 11;
          const phase = (t / period + L.seed * 17) % 1;
          let on = (L.seed < (isCall ? 0.34 : isVoice ? 0.24 : 0.16)) && phase < 0.55 ? 1 : 0;
          if (f.reduced) on = L.seed < (isCall ? 0.2 : 0.08) ? 1 : 0;
          if (wave >= 0) {
            // a call from the far end: lamps light in turn, far to near, then let go
            const arrive = (1 - Math.log(L.z / Z0) / Math.log(ZFAR / Z0)) * 4;
            const w = wave - arrive;
            if (w > 0 && w < 3.5) on = Math.max(on, 1 - w / 3.5);
          }
          if (on <= 0) continue;
          const fade = clamp(2.2 / L.z) ** 0.6;
          const x = sx(L.side * BANK, L.z);
          const y = sy(L.y, L.z);
          const c = isCall && (i % 3 === 0) ? hex('#5ceeff') : L.seed < 0.05 ? lampWhite : lampOn;
          g.pxAdd(x, y, c, on * fade * (0.9 + sp * 0.25) * live);
          if (L.z < 5) {
            g.pxAdd(x - L.side, y, c, on * fade * 0.5 * live);
            g.glow(x, y, 3, c, on * fade * (0.12 + sp * 0.15) * live, 3);
          }
        }

        // ── the far operator (rare 1): a pool of light, a long way off ──
        if (R(1)) {
          const k = envelope(ev, 10, 1.2, 2.5) * live;
          const x = sx(FAR_OP.x, FAR_OP.z);
          const y = sy(1.2, FAR_OP.z);
          g.glow(x, y + 3, 9, warm, 0.45 * k, 4);
          shaft(g, x, y, x, sy(FLOOR_Y, FAR_OP.z), 1, 6, warm, 0.18 * k, 0.4, 4);
          g.rect(x - 1, sy(0.2, FAR_OP.z), 2, 3, mix(hex('#030202'), hex('#2a2030'), k));
          if (ev > 4 && ev < 5.5) g.px(x - 2, sy(0.4, FAR_OP.z), mix(hex('#030202'), skin, k)); // a wave
        }

        // ── the clock: a second hand that steps, and sometimes goes back ──
        {
          const x = sx(CLOCK.x, CLOCK.z);
          const y = sy(CLOCK.y, CLOCK.z);
          let sec = Math.floor(t) % 60;
          if (R(2) && ev > 2 && ev < 7) sec = (Math.floor(t - (ev - 2) * 2) % 60 + 60) % 60;
          const hourA = ((3 + 33 / 60) / 12) * Math.PI * 2 - Math.PI / 2 + t * 0.0002;
          const minA = (33 / 60) * Math.PI * 2 - Math.PI / 2 + t * 0.0017;
          const secA = (sec / 60) * Math.PI * 2 - Math.PI / 2;
          g.line(x, y, x + Math.cos(hourA) * 3, y + Math.sin(hourA) * 3, hex('#1a1612'));
          g.line(x, y, x + Math.cos(minA) * 5, y + Math.sin(minA) * 5, hex('#1a1612'));
          g.line(x, y, x + Math.cos(secA) * 5, y + Math.sin(secA) * 5, hex('#a83a2a'));
          g.px(x, y, brassL);
        }

        // ── the lamp over the operator: green enamel shade, a cone of warm light ──
        const ox = sx(OP.x, OP.z);
        const ly = sy(1.15, OP.z);
        const lk = live * (0.96 + 0.04 * noise1(t * 2, 4));
        g.vline(ox, g.top, ly - 4, hex('#141210'));
        g.poly([ox - 4, ly - 4, ox + 4, ly - 4, ox + 11, ly + 3, ox - 11, ly + 3], shadeC);
        g.hline(ox - 4, ox + 4, ly - 4, mix(shadeC, hex('#6aa078'), 0.5));
        g.hline(ox - 11, ox + 11, ly + 3, mix(warm, hex('#ffffff'), 0.4));
        shaft(g, ox, ly + 4, ox, sy(FLOOR_Y, OP.z), 20, 70, warm, 0.09 * lk, 0.5, 6);
        g.glow(ox, ly + 4, 14, warm, 0.4 * lk, 5);
        motes(g, t, ox - 34, ly + 6, 68, 90, 16, warm, 0.4 * lk, 3, 0.3, inPool);

        // ── the operator, seated on her stool, three-quarter from behind, facing the board ──
        {
          const x = ox;
          const seat = sy(-0.52, OP.z);
          const rail = sy(FLOOR_Y, OP.z) - 10;
          const glance = R(3) ? smoothstep(2, 3, ev) * (1 - smoothstep(6.5, 7.5, ev)) : 0;
          // every so often she takes a call: reaches up and plugs a cord in
          const cyc = (t % 13) / 13;
          const baseReach = f.reduced ? 0 : smoothstep(0.1, 0.2, cyc) * (1 - smoothstep(0.32, 0.45, cyc));
          const callReach = !f.reduced && (isCall || sp > 0.15) ? 0.5 + 0.4 * Math.abs(Math.sin(t * 2.5)) : 0;
          const reach = Math.max(baseReach, callReach);
          const lit = (c: Color, k: number) => mix(c, warm, k * lk);
          // legs: knees forward toward the board, heels hooked on the stool's rail
          g.poly([x - 6, seat - 1, x - 15, seat + 1, x - 16, seat + 5, x - 5, seat + 4], hex('#1c1a22'));
          g.line(x - 15, seat + 5, x - 12, rail - 1, shade(skinD, 0.8));
          g.line(x - 14, seat + 5, x - 11, rail - 1, skinD);
          g.line(x - 12, seat + 5, x - 9, rail - 1, shade(skinD, 0.6));
          g.rect(x - 13, rail - 1, 4, 2, ink);
          g.rect(x - 11, rail - 2, 3, 2, ink);
          // body and head: small sprites, dark against the lamp, rimmed on top
          g.blit(bodySpr, x - 8, seat - 22);
          const nod = !f.reduced && sp > 0.1 && Math.sin(t * 7) > 0.25 ? 1 : 0;
          const hx = x - 1 + Math.round(glance * 2);
          const hy = seat - 36 + nod;
          g.blit(headSpr, hx - 5, hy - 2);
          if (glance > 0.3) {
            // turned over her shoulder toward us: a cheek, an eye, a polite nod
            g.ellipse(hx + 3, hy + 6, 2, 3, skinD);
            g.vline(hx + 5, hy + 4, hy + 8, lit(skin, 0.3));
            g.px(hx + 4, hy + 5 + (ev > 4 && ev < 4.6 ? 1 : 0), hex('#1a1010'));
          }
          // the headset: band over the crown, earpiece, the horn mouthpiece hung on her chest
          g.line(hx - 5, hy + 7, x - 9, seat - 20, hex('#0e0e0e'));
          g.disc(x - 9, seat - 19, 2, hex('#161616'));
          g.px(x - 10, seat - 20, brassL);
          // arms: the near one reaches up into the jack field; the far one rests on the shelf
          const shX = x - 6;
          const shY = seat - 23;
          const handX = Math.round(sx(-BANK + 0.04, OP.z - 0.25)) + 2;
          const handY = Math.round(sy(SHELF + 0.1 + reach * 0.72, OP.z - 0.25));
          const elX = Math.round((shX + handX) / 2) + 1;
          const elY = Math.round(Math.max(shY, handY) + 6 - reach * 6);
          g.line(shX, shY, elX, elY, cardigan);
          g.line(shX + 1, shY, elX + 1, elY, cardigan);
          g.line(elX, elY, handX, handY, cardigan);
          g.px(handX, handY, lit(skin, 0.2));
          g.px(handX - 1, handY, skinD);
          if (reach > 0.05) {
            g.line(handX - 1, handY + 1, handX - 3, sy(SHELF, OP.z + 0.3), cordC[1]!);
            g.px(handX - 1, handY - 1, brassL);
          }
          g.line(x + 6, seat - 21, x + 9, seat - 10, cardiganD);
          g.line(x + 9, seat - 10, x + 2, seat - 6, cardiganD);
        }
      },
    };
  },
};

export default def;

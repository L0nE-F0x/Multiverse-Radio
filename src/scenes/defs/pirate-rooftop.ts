// Pirate station, rooftop edition: a studio on top of a tower block, above a city that doesn't know
// it's listening. A scaffold-pole mast of mismatched aerials, a bedsheet banner with the call sign,
// egg boxes in the lift-motor room (or under a tarp), and a lookout at the parapet. Shared by many
// generated pirates: the city, the studio, the mast, the weather and the hour vary with ctx.variant.
// Rare events: a helicopter's searchlight sweeps the roofs (lights out); a pigeon lands on the
// aerial; fireworks over the far side of town; someone in the block opposite dances along.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep } from '../kit/fx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import {
  coatHanger,
  djSilhouette,
  eggBox,
  hazeBand,
  lookout,
  makeHaze,
  paintedText,
  paintedWidth,
  pirateLook,
  pirateSky,
  pirateWeather,
  snowGround,
  stringLights,
  vignette,
} from './deep-kit';

const ROOF = 108; // the far parapet's foot: where the roof starts
const FLOOR = 126; // where things on the roof stand

const def: SceneDef = {
  id: 'pirate-rooftop',
  fps: 15,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent, variant }) {
    const L = pirateLook(variant, accent, 3);
    const r = L.rng;
    const lit = L.practical;
    const ink = hex('#040506');
    const horizonC = L.sky[L.sky.length - 1]!;

    // ── this pirate's roof and city ──
    const studio = r.pick(['hut', 'tarp'] as const);
    const stW = studio === 'hut' ? r.int(70, 84) : r.int(80, 96);
    const stX = Math.round(r.range(104, 216) - stW / 2);
    const stH = studio === 'hut' ? r.int(46, 52) : r.int(38, 42);
    const stTop = FLOOR - stH;
    const mastX = stX < 160 ? stX + stW + r.int(14, 30) : stX - r.int(14, 30);
    const mastTop = r.int(26, 36);
    const tankX = stX < 160 ? r.int(230, 286) : r.int(30, 80);
    const banner = r.pick(['parapet', 'line', 'studio'] as const);
    const look = r.pick(['person', 'person', 'cat', 'pigeon'] as const);
    const lookX = stX < 160 ? r.int(250, 296) : r.int(26, 64);
    const cityHue = r.pick(['#ffc884', '#ffd8a0', '#cfe0ff', '#ffb070']);
    const neonA = hex(r.pick(['#ff4a7a', '#4ad8ff', '#7aff8a', '#ffb03a', '#c07aff']));
    const landmark = r.pick(['tower', 'gasholder', 'cranes', 'none'] as const);
    const dense = r.range(0.35, 0.8);
    const lights = r.chance(0.6);
    const oppX = r.int(40, 280);
    const sheet = mix(hex(r.pick(['#8a8478', '#7a7e86', '#867a6e', '#6e7a7a'])), L.sky[1]!, 0.3);
    const fogs = L.weather === 'fog' ? [makeHaze(256, 40, variant & 255, 40, 10), makeHaze(256, 50, (variant >> 8) & 255, 30, 12)] : null;

    // Buildings, nearest drawn last. Each: x, w, top, layer.
    interface Bldg {
      x: number;
      w: number;
      top: number;
      layer: number;
      seed: number;
    }
    const blds: Bldg[] = [];
    for (let layer = 0; layer < 3; layer++) {
      let x = -60 + r.int(0, 20);
      while (x < 380) {
        const w = r.int(12, 30) + layer * 6;
        const h = (16 + r.next() * (30 + layer * 14)) * (0.6 + dense * 0.6) + layer * 6;
        if (r.chance(0.85 - layer * 0.1)) blds.push({ x, w, top: Math.round(ROOF - 2 - h - (2 - layer) * 4), layer, seed: r.int(0, 9999) });
        x += w + r.int(0, 6 + (2 - layer) * 4);
      }
    }
    const opp = { x: oppX, top: 52, w: 34 }; // the block opposite, with one window that matters

    return {
      background(g) {
        pirateSky(g, L, ROOF);
        // the city's glow under the clouds
        g.glow(160, ROOF + 20, 220, mix(hex(cityHue), L.sky[1]!, 0.5), 0.2, 6);

        // landmark on the skyline
        const lmC = mix(horizonC, ink, 0.55);
        if (landmark === 'tower') {
          const lx = r.int(30, 290);
          g.rect(lx - 1, 34, 3, ROOF - 34, lmC);
          g.ellipse(lx, 52, 5, 3, lmC);
          g.vline(lx, 24, 34, lmC);
        } else if (landmark === 'gasholder') {
          const lx = r.int(40, 280);
          for (let y = 70; y < ROOF; y += 6) g.hline(lx - 18, lx + 18, y, lmC);
          for (let x = lx - 18; x <= lx + 18; x += 6) g.vline(x, 70, ROOF, lmC);
        } else if (landmark === 'cranes') {
          for (let k = 0; k < 2; k++) {
            const lx = r.int(30, 290);
            const top = r.int(36, 50);
            g.vline(lx, top, ROOF, lmC);
            g.vline(lx + 1, top, ROOF, lmC);
            g.hline(lx - 12, lx + 36, top + 2, lmC);
            g.line(lx, top - 6, lx + 30, top + 2, lmC);
            g.line(lx, top - 6, lx - 10, top + 2, lmC);
          }
        }

        // ── the skyline, three layers deep ──
        for (const b of blds) {
          const k = b.layer / 2;
          const c = mix(mix(horizonC, ink, 0.45), mix(L.sky[0]!, ink, 0.6), k);
          g.rect(b.x, b.top, b.w, ROOF - b.top, c);
          if (hash3(b.seed, 1) < 0.25) g.rect(b.x + b.w / 2 - 1, b.top - 5, 2, 5, c); // a mast or vent
          // windows: a sparse grid, some lit
          const ww = 1 + (b.layer > 1 ? 1 : 0);
          for (let y = b.top + 3; y < ROOF - 2; y += 3 + b.layer) {
            for (let x = b.x + 2; x < b.x + b.w - 2; x += 2 + b.layer) {
              const h = hash3(x, y, b.seed);
              if (h < dense * 0.22) g.rect(x, y, ww, 1, mix(c, hex(h < 0.04 ? '#9ab8e0' : cityHue), 0.35 + b.layer * 0.12));
              else if (h < 0.5) g.rect(x, y, ww, 1, shade(c, 0.85));
            }
          }
          g.hline(b.x, b.x + b.w - 1, b.top, mix(c, horizonC, 0.4));
        }
        // a couple of far neon smudges
        for (let i = 0; i < 2; i++) {
          const nx = r.int(20, 300);
          const ny = r.int(80, 100);
          g.rect(nx, ny, r.int(5, 10), 2, mix(neonA, ink, 0.3));
          g.glow(nx + 3, ny + 1, 10, neonA, 0.12, 4);
        }
        // the block opposite (nearest), with its one window
        const oc = mix(L.sky[0]!, ink, 0.55);
        g.rect(opp.x, opp.top, opp.w, ROOF - opp.top, oc);
        for (let y = opp.top + 4; y < ROOF - 2; y += 7)
          for (let x = opp.x + 3; x < opp.x + opp.w - 3; x += 7) g.rect(x, y, 4, 4, hash3(x, y, 7) < 0.2 ? mix(oc, hex(cityHue), 0.35) : shade(oc, 0.8));
        g.rect(opp.x + 10, opp.top + 11, 4, 4, shade(oc, 0.7)); // (the window)
        hazeBand(g, 60, ROOF, L.haze, 0, 0.28);

        // ── our roof: the far parapet, railings, the deck ──
        const wall = mix(hex('#1a1a1e'), L.sky[0]!, 0.3);
        g.rect(g.left, ROOF - 6, g.w, 6, wall);
        g.hline(g.left, g.right, ROOF - 6, mix(wall, horizonC, 0.4));
        g.hline(g.left, g.right, ROOF - 14, hex('#2a2c32'));
        for (let x = g.left - (((g.left % 12) + 12) % 12); x < g.right; x += 12) g.vline(x, ROOF - 14, ROOF - 6, hex('#22242a'));
        const deck = mix(hex('#121316'), L.sky[0]!, 0.25);
        g.vgrad([mix(deck, horizonC, 0.15), deck, shade(deck, 0.6)], ROOF, g.bottom, ROOF);
        for (let i = 0; i < 500; i++) {
          const x = g.left + hash3(i, variant, 7) * g.w;
          const y = ROOF + hash3(i, variant, 8) * (g.bottom - ROOF);
          g.pxA(x, y, hex('#3a3a40'), 0.5);
        }
        // tar seams in perspective
        for (let i = -8; i < 16; i++) g.lineA(i * 30, ROOF, 160 + (i * 30 - 160) * 2.2, g.bottom + 40, hex('#08090b'), 0.6);
        if (L.weather === 'snow') snowGround(g, ROOF, mix(hex('#5a6270'), L.sky[1]!, 0.35), 0.28);
        if (L.weather === 'rain') for (let i = 0; i < 6; i++) g.ellipseA(g.left + hash3(i, variant, 30) * g.w, FLOOR + 4 + hash3(i, variant, 31) * 40, 12 + hash3(i, 2) * 18, 2, mix(horizonC, hex(cityHue), 0.3), 0.25);

        // ── things on the roof ──
        // the water tank on legs
        {
          const tx = tankX;
          const tc = hex('#1c1e24');
          for (const dx of [-12, -4, 4, 12]) g.vline(tx + dx, FLOOR - 16, FLOOR, tc);
          g.line(tx - 12, FLOOR - 4, tx + 12, FLOOR - 14, tc);
          g.rect(tx - 15, FLOOR - 40, 30, 24, tc);
          g.ellipse(tx, FLOOR - 40, 15, 3, hex('#24272e'));
          for (let y = FLOOR - 36; y < FLOOR - 16; y += 5) g.hline(tx - 15, tx + 14, y, hex('#16181d'));
          g.vline(tx + 14, FLOOR - 40, FLOOR - 16, mix(tc, horizonC, 0.35));
        }
        // an AC unit and a skylight
        const acX = stX < 160 ? stX - 26 : stX + stW + 8;
        g.rect(acX, FLOOR - 10, 18, 10, hex('#22242a'));
        g.disc(acX + 9, FLOOR - 5, 3, hex('#16181c'));
        g.hline(acX, acX + 17, FLOOR - 10, mix(hex('#22242a'), horizonC, 0.4));

        // ── the studio ──
        if (studio === 'hut') {
          // a brick lift-motor room with a steel door
          const bc = mix(hex('#2a201e'), L.sky[0]!, 0.3);
          g.rect(stX, stTop, stW, stH, bc);
          for (let y = stTop + 2; y < FLOOR; y += 3) {
            g.hline(stX, stX + stW - 1, y, shade(bc, 0.8));
            for (let x = stX + (((y - stTop) / 3) % 2) * 3; x < stX + stW; x += 6) g.px(x, y + 1, shade(bc, 0.8));
          }
          g.rect(stX - 2, stTop - 3, stW + 4, 3, hex('#1a1c20'));
          g.hline(stX - 2, stX + stW + 1, stTop - 3, mix(hex('#1a1c20'), horizonC, 0.5));
          // a vent and a sign that says DANGER in a language nobody reads up here
          g.rect(stX + stW - 14, stTop + 5, 9, 6, hex('#1a1c20'));
          for (let y = stTop + 6; y < stTop + 11; y += 2) g.hline(stX + stW - 13, stX + stW - 7, y, hex('#2a2c32'));
        } else {
          // pallets for walls, a blue tarp for a roof, open at the front
          const pc = mix(hex('#3a2e22'), L.sky[0]!, 0.3);
          for (const px of [stX, stX + stW - 6]) {
            g.rect(px, stTop + 4, 6, stH - 4, pc);
            for (let y = stTop + 6; y < FLOOR; y += 4) g.hline(px, px + 5, y, shade(pc, 0.7));
          }
          g.rect(stX, FLOOR - 4, stW, 4, pc);
          const tc = mix(hex('#1e3a6a'), L.sky[0]!, 0.35);
          g.poly([stX - 6, stTop + 6, stX + stW + 6, stTop + 6, stX + stW + 2, stTop - 2, stX - 2, stTop - 4], tc);
          for (let x = stX - 4; x < stX + stW + 4; x += 7) g.line(x, stTop - 3, x + 2, stTop + 6, shade(tc, 0.8));
          g.hline(stX - 6, stX + stW + 5, stTop + 6, shade(tc, 0.7));
          // bungee cords
          g.line(stX - 6, stTop + 6, stX - 10, FLOOR, hex('#5a2a6a'));
          g.line(stX + stW + 6, stTop + 6, stX + stW + 10, FLOOR, hex('#5a2a6a'));
        }

        // ── the banner with the call sign ──
        const sign = L.callsign;
        const sc = paintedWidth(sign, 2) < 76 ? 2 : 1;
        const bw = paintedWidth(sign, sc) + 10;
        const bh = 5 * sc + 9;
        let bx = 0;
        let by = 0;
        if (banner === 'parapet') {
          bx = Math.round(stX < 160 ? stX + stW + 40 : stX - 40 - bw);
          bx = Math.max(10, Math.min(310 - bw, bx));
          by = ROOF - 15;
        } else if (banner === 'line') {
          bx = Math.round(stX + stW / 2 - bw / 2);
          by = stTop - bh - 8;
          g.hline(bx - 10, bx + bw + 10, by, hex('#4a4a50'));
        } else {
          bx = Math.round(stX + stW / 2 - bw / 2);
          by = studio === 'hut' ? stTop + 3 : stTop - bh + 4;
        }
        // a bedsheet: sags a little, creased
        for (let x = 0; x < bw; x++) {
          const sag = Math.round(Math.sin((x / bw) * Math.PI) * 1.5);
          g.rect(bx + x, by + sag, 1, bh - sag + (x % 7 === 3 ? 1 : 0), x % 9 === 0 ? shade(sheet, 0.85) : sheet);
        }
        g.hline(bx, bx + bw - 1, by + bh - 1, shade(sheet, 0.75));
        paintedText(g, sign, bx + 5, by + 4, mix(lit, ink, 0.25), sc, variant, true);
        if (banner !== 'parapet') {
          g.px(bx, by - 1, hex('#8a8a8a'));
          g.px(bx + bw - 1, by - 1, hex('#8a8a8a'));
        }

        // ── the mast: scaffold pole lashed to the railings, aerials pointing every which way ──
        const pole = hex('#3a3c42');
        g.rect(mastX, mastTop, 2, FLOOR - mastTop, pole);
        for (let y = FLOOR - 30; y < FLOOR; y += 10) g.rect(mastX - 1, y, 4, 2, hex('#4a4a4a'));
        const wire = hex('#62666e');
        g.hline(mastX - 3, mastX + 16, mastTop + 4, wire);
        for (let k = 0; k < 5; k++) g.vline(mastX - 2 + k * 4, mastTop + 1, mastTop + 7, wire);
        g.hline(mastX - 16, mastX, mastTop + 14, wire);
        for (let k = 0; k < 4; k++) g.vline(mastX - 15 + k * 4, mastTop + 12, mastTop + 16, wire);
        coatHanger(g, mastX + 1, mastTop + 26, wire, 1);
        g.disc(mastX + 6, mastTop + 38, 4, hex('#3a3e46')); // a small dish, pointed at nothing in particular
        g.disc(mastX + 7, mastTop + 38, 3, hex('#2a2c32'));
        // guy wires
        g.lineA(mastX + 1, mastTop + 8, mastX - 46, FLOOR + 6, hex('#7a7a74'), 0.35);
        g.lineA(mastX + 1, mastTop + 8, mastX + 50, FLOOR + 8, hex('#7a7a74'), 0.35);
        // cables from the mast to the studio
        const cx0 = mastX < stX ? stX : stX + stW;
        for (let x = Math.min(mastX, cx0); x <= Math.max(mastX, cx0); x++) {
          const u = (x - Math.min(mastX, cx0)) / Math.max(1, Math.abs(cx0 - mastX));
          g.px(x, FLOOR - 20 + Math.sin(u * Math.PI) * 6, hex('#141518'));
        }

        vignette(g, 0.45, 160, 86);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const awake = f.awake;

        // far aircraft crossing slowly; a warning light on the landmark
        if (!f.reduced) {
          const p = (t / 70) % 1;
          const ax = g.left + p * (g.w + 40) - 20;
          const ay = 30 + Math.sin(p * 3) * 4;
          if ((t % 1.2) < 0.15) g.pxAdd(ax, ay, hex('#ff6a5a'), 1);
          g.pxAdd(ax + 2, ay, hex('#d8e0ff'), 0.4);
        }

        // fireworks over the far side of town (rare 2)
        if (R(2)) {
          for (let k = 0; k < 4; k++) {
            const t0 = 0.6 + k * 2.1;
            const p = (ev - t0) / 2.2;
            if (p < 0 || p > 1) continue;
            const fx = 40 + hash3(k, 7) * 240;
            const fy = 40 + hash3(k, 8) * 24;
            const c = hex(['#ffd08a', '#ff8aa8', '#8ad8ff', '#c8ff8a'][k]!);
            const rad = 3 + p * 14;
            for (let i = 0; i < 16; i++) {
              const a = (i / 16) * Math.PI * 2;
              g.pxAdd(fx + Math.cos(a) * rad, fy + Math.sin(a) * rad + p * p * 6, c, (1 - p) * (f.reduced ? 0.3 : 0.9));
            }
            g.glow(fx, fy, 20, c, (1 - p) * 0.15);
          }
        }

        // the window opposite (rare 3): somebody dancing along
        if (R(3)) {
          const a = envelope(ev, 10, 0.8, 1);
          const wx = opp.x + 10;
          const wy = opp.top + 11;
          g.rect(wx, wy, 4, 4, mix(hex('#1a1410'), hex(cityHue), a * 0.75));
          if (a > 0.5) {
            const sway = f.reduced ? 0 : Math.round(Math.sin(f.beat * Math.PI));
            g.rect(wx + 1 + sway, wy + 1, 2, 3, hex('#100c0a'));
          }
          g.glow(wx + 2, wy + 2, 6, hex(cityHue), a * 0.25);
        }

        // ── light state ──
        let power = 0.35 + 0.65 * awake;
        const heli = R(0);
        if (heli && ev > 2 && ev < 7.5) power = 0.04;
        const flick = f.reduced ? 1 : 0.95 + 0.05 * Math.sin(t * 21) * Math.sin(t * 6.1);
        const P = clamp(power * flick, 0, 1);
        const beat = f.pulse * 0.12 * awake;

        // ── the studio's lit opening ──
        const inside = mix(hex('#050404'), lit, 0.5 * P + beat);
        let ox: number;
        let ow: number;
        let oy: number;
        if (studio === 'hut') {
          ow = 22;
          ox = stX < 160 ? stX + stW - ow - 8 : stX + 8;
          oy = FLOOR - 34;
        } else {
          ox = stX + 6;
          ow = stW - 12;
          oy = stTop + 7;
        }
        const oh = FLOOR - 4 - oy + (studio === 'hut' ? 4 : 0);
        g.rect(ox, oy, ow, oh, inside);
        eggBox(g, ox, oy, ow, Math.max(4, oh - 12), shade(inside, 0.78), mix(inside, hex('#ffffff'), 0.1), shade(inside, 0.58), 4);
        g.rect(ox, oy + oh - 12, ow, 12, shade(inside, 0.5));
        g.rect(ox, oy + oh - 13, ow, 2, shade(inside, 0.3));
        g.clip(ox, oy, ow, oh);
        const bob = f.reduced ? 0 : awake * (Math.sin(f.beat * Math.PI) * 0.5 + 0.5) * (0.3 + f.energy);
        djSilhouette(g, ox + ow / 2, oy + oh - 30 + Math.round((1 - awake) * 4), hex('#0a0806'), mix(lit, hex('#ffffff'), 0.3), bob, (variant >> 5) % 3, stX < 160 ? 1 : -1);
        g.noClip();
        if (studio === 'hut') {
          // the steel door, propped open with a brick
          const dx = stX < 160 ? ox + ow : ox - 6;
          g.rect(dx, oy - 1, 6, oh + 1, hex('#2a2e36'));
          g.vline(stX < 160 ? dx + 5 : dx, oy - 1, oy + oh - 1, hex('#3a3e48'));
          g.rect(dx + (stX < 160 ? 4 : -2), FLOOR - 3, 4, 3, hex('#4a2a22'));
        } else if (lights) {
          stringLights(g, stX - 4, stTop + 6, stX + stW + 4, stTop + 6, 3, 10, lit, L.warm, P, t, hex('#1a1a1a'));
        }
        if (P > 0.05) {
          g.poly([ox, FLOOR, ox + ow, FLOOR, ox + ow + 18, g.bottom, ox - 18, g.bottom], lit, 2, 0.09 * P);
          g.glow(ox + ow / 2, oy + oh / 2, 28, lit, 0.13 * P, 4);
        }

        // the aircraft-warning light on our mast (also blinks for the pigeon)
        const pig = R(1);
        let wob = 0;
        if (pig && ev > 3 && ev < 7.5) wob = Math.round(Math.sin(ev * 7) * (f.reduced ? 0 : 1));
        const blink = f.reduced ? 0.5 : (t % 1.5) < 0.3 ? 1 : 0;
        g.rect(mastX + wob, mastTop - 2, 2, 2, mix(hex('#3a0a08'), hex('#ff3a2a'), blink * Math.max(0.2, P)));
        if (blink * P > 0.2) g.glow(mastX + 1 + wob, mastTop - 1, 7, hex('#ff3a2a'), 0.45);
        if (pig) {
          let px: number;
          let py: number;
          let flying = true;
          if (ev < 3) {
            const p = smoothstep(0, 3, ev);
            px = (stX < 160 ? 340 : -20) + (mastX + 10 - (stX < 160 ? 340 : -20)) * p;
            py = 20 + (mastTop + 2 - 20) * p - Math.sin(p * Math.PI) * 8;
          } else if (ev < 7.5) {
            px = mastX + 10 + wob;
            py = mastTop + 3;
            flying = false;
          } else {
            const p = smoothstep(7.5, 10, ev);
            px = mastX + 10 + p * (stX < 160 ? -200 : 200);
            py = mastTop + 3 - p * 30;
          }
          const c = hex('#5a5e6a');
          if (flying) {
            const fl = Math.sin(t * 14) > 0 ? -2 : 1;
            g.rect(px - 1, py, 3, 2, c);
            g.line(px - 1, py, px - 4, py + fl, c);
            g.line(px + 1, py, px + 4, py + fl, c);
          } else {
            g.rect(px - 2, py - 3, 5, 3, c);
            g.rect(px + 2, py - 5, 2, 2, c);
            g.px(px + 4, py - 4, hex('#c8a040'));
            g.px(px + 3, py - 5, hex('#1a1a1a'));
            g.px(px, py, hex('#c86a5a'));
          }
        }

        // ── the helicopter (rare 0): a searchlight sweeps across the roofs ──
        let alert = 0;
        if (heli) {
          const p = ev / 10;
          const hx = -40 + p * 400;
          const hy = 16;
          const bx = hx + Math.sin(ev * 0.9) * 40;
          const by = FLOOR + 4;
          g.tri(hx, hy, bx - 22, by, bx + 22, by, hex('#e8f0ff'), 2, f.reduced ? 0.03 : 0.07);
          g.ellipseA(bx, by, 24, 4, hex('#e8f0ff'), 0.12);
          g.rect(hx - 6, hy - 2, 12, 4, hex('#0a0b0e'));
          g.hline(hx - 10, hx + 10, hy - 4, hex('#16181c'));
          if ((t % 0.6) < 0.1) g.pxAdd(hx + 6, hy + 1, hex('#ff4a3a'), 1);
          alert = ev > 1.5 && ev < 8 ? 1 : 0;
        }

        // ── the lookout at the parapet ──
        const rim = mix(horizonC, hex(cityHue), 0.4);
        const dir: 1 | -1 = lookX > 160 ? 1 : -1;
        if (look === 'person') lookout(g, 'person', lookX, ROOF - 1, dir, t, alert, hex('#0e1014'), rim);
        else if (look === 'cat') lookout(g, 'cat', lookX, ROOF - 14, dir, t, alert, hex('#0e1014'), rim);
        else {
          // a row of pigeons on the railing: one of them is keeping watch
          for (let k = 0; k < 3; k++) {
            const px = lookX + k * 6;
            const c = hex('#2a2c34');
            g.rect(px - 2, ROOF - 17, 4, 3, c);
            g.rect(px + (k === 1 ? -2 : 1), ROOF - 19, 2, 2, c);
            if (k === 1) g.px(px - 2, ROOF - 19 + (alert ? -1 : 0), rim);
          }
        }
        if (look === 'person' && awake < 0.4 && !alert) g.text('z', lookX + 4, ROOF - 30, shade(rim, 0.8));

        pirateWeather(g, L, t, fogs, FLOOR);
      },
    };
  },
};

export default def;


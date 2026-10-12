// Pirate station, van edition: a battered van parked somewhere it shouldn't be, its side door
// open on a studio lined with egg boxes, a telescopic mast guyed with washing line, a generator
// chugging, a call sign painted on the side and a lookout in a folding chair. Shared by many
// generated pirates: the place, the van, the mast, the weather and the hour vary with ctx.variant.
// Rare events: headlights on the road (door shut, lights out); a listener brings a request; the
// mast sags and is cranked back up; the generator coughs and gets a kick.

import { hex, mix, shade } from '../kit/color';
import { clamp, smoothstep } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import {
  coatHanger,
  djSilhouette,
  eggBox,
  hazeBand,
  lookout,
  makeHaze,
  paintedSign,
  paintedWidth,
  pirateLook,
  pirateSky,
  pirateWeather,
  snowGround,
  stringLights,
  treeLine,
  vignette,
} from './deep-kit';

const GROUND = 126;
const HZN = 102;

const def: SceneDef = {
  id: 'pirate-van',
  fps: 15,
  focusY: 88,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent, variant }) {
    const L = pirateLook(variant, accent, 2);
    const r = L.rng;
    const lit = L.practical;
    const ink = hex('#040506');
    const horizonC = L.sky[L.sky.length - 1]!;

    // ── this pirate's spot ──
    const place = r.pick(['layby', 'carpark', 'underpass', 'clifftop'] as const);
    const facing: 1 | -1 = r.chance(0.5) ? 1 : -1; // cab on the right (1) or left (-1)
    const vw = r.int(104, 118);
    const vx = Math.round(r.range(150, 172) - vw / 2);
    const roofH = r.int(46, 52);
    const roofY = GROUND - 8 - roofH;
    const bodyC = mix(hex(r.pick(['#6a685e', '#34404e', '#5e5030', '#2a3a2e', '#552a24', '#4a4a52', '#3e3448'])), L.sky[1]!, 0.25);
    const stripe = r.chance(0.5) ? mix(hex(r.pick(['#7a5a24', '#22303e', '#5a2420', '#8a8474'])), L.sky[1]!, 0.25) : 0;
    const odd = r.chance(0.4); // one door panel from another van
    const cabW = 28;
    const cabX = facing > 0 ? vx + vw - cabW : vx;
    const boxX = facing > 0 ? vx : vx + cabW;
    const boxW = vw - cabW;
    const doorW = 30;
    const doorX = boxX + Math.round(boxW / 2 - doorW / 2) + facing * 4;
    const doorTop = roofY + 6;
    const doorBot = GROUND - 10;
    const mast = r.pick(['yagi', 'hanger', 'rod'] as const);
    const mastX = facing > 0 ? boxX + 8 : boxX + boxW - 8;
    const mastH = r.int(28, 40);
    const signAt = r.pick(['roof', 'roof', 'side', 'windscreen'] as const);
    const look = r.pick(['chair', 'chair', 'roof', 'dog'] as const);
    const lookSide: 1 | -1 = facing > 0 ? -1 : 1; // behind the van, on the box end
    const genX = facing > 0 ? vx - 26 : vx + vw + 10;
    const lantern = r.chance(0.6);
    const lights = r.chance(0.4);
    const painted = mix(lit, hex('#f4ecdc'), 0.55);
    const fogs = L.weather === 'fog' ? [makeHaze(256, 40, variant & 255, 40, 10), makeHaze(256, 50, (variant >> 8) & 255, 30, 12)] : null;
    const lampX = r.int(40, 280);

    const groundC = place === 'clifftop' ? mix(hex('#0e140c'), L.sky[0]!, 0.3) : mix(hex('#121316'), L.sky[0]!, 0.3);

    const drawMast = (g: Gfx, sag: number) => {
      const pole = hex('#3a3c42');
      const mt = roofY - 3 - mastH + Math.round(sag);
      g.rect(mastX, mt, 2, roofY - 3 - mt, pole);
      g.rect(mastX - 1, Math.round((mt + roofY) / 2), 4, 1, hex('#4a4a4a'));
      const wire = hex('#6a6e76');
      if (mast === 'yagi') {
        g.hline(mastX - 4, mastX + 18, mt + 2, wire);
        for (let k = 0; k < 6; k++) g.vline(mastX - 3 + k * 4, mt - 2 + (k === 0 ? -1 : 0), mt + 6 - (k === 0 ? -1 : 0), wire);
      } else if (mast === 'hanger') {
        coatHanger(g, mastX + 1, mt + 2, wire, 1.2);
        coatHanger(g, mastX + 1, mt + 12, wire, 0.8);
      } else {
        // a fishing rod with the line still on it
        g.line(mastX + 1, mt, mastX + 12, mt - 14, hex('#4a4a52'));
        g.line(mastX + 12, mt - 14, mastX + 13, mt + 10, hex('#5a5a62'));
      }
      // guy lines (washing line) to a cone and a breeze block
      g.lineA(mastX + 1, mt + 8, mastX - 40, GROUND + 2, hex('#8a8a7a'), 0.4);
      g.lineA(mastX + 1, mt + 8, mastX + 44, GROUND + 4, hex('#8a8a7a'), 0.4);
      return mt;
    };

    return {
      background(g) {
        pirateSky(g, L, HZN);
        const far = mix(horizonC, ink, 0.55);
        const farD = mix(horizonC, ink, 0.72);

        // ── the place ──
        if (place === 'layby') {
          for (let x = g.left; x < g.right; x++) {
            const h = HZN - 16 - fbm(x / 60, 1, variant & 255, 3) * 26;
            g.rect(x, h, 1, HZN - h + 1, far);
          }
          treeLine(g, HZN + 2, variant & 1023, farD, 6, 14, 1.2);
          // a far road with a single lamp
          g.rect(g.left, HZN + 1, g.w, 2, mix(farD, hex('#2a2a2a'), 0.3));
        } else if (place === 'carpark') {
          // a big shed of a warehouse, a lit sign that only says what it is
          g.rect(g.left, HZN - 30, g.w, 32, farD);
          for (let x = g.left; x < g.right; x += 6) g.vline(x, HZN - 30, HZN, shade(farD, 0.9));
          g.rect(g.left, HZN - 32, g.w, 2, far);
          const sx = r.int(60, 230);
          g.rect(sx, HZN - 26, 28, 7, mix(farD, hex('#c8d8e8'), 0.25));
          g.text('24 HR', sx + 4, HZN - 25, mix(farD, hex('#e8f0f8'), 0.55));
        } else if (place === 'underpass') {
          // a motorway overhead: deck, pillars, the sky only where it's open
          g.rect(g.left, HZN - 4, g.w, 6, far);
          treeLine(g, HZN + 2, variant & 1023, farD, 5, 10, 1.4);
        } else {
          // the sea beyond the edge; a few far ship lights
          g.vgrad([mix(horizonC, ink, 0.5), mix(L.sky[0]!, ink, 0.5)], HZN, GROUND, HZN, GROUND);
          for (let y = HZN + 2; y < GROUND; y += 2) for (let x = g.left; x < g.right; x++) if (hash3(x, y, 5) < 0.04) g.pxA(x, y, horizonC, 0.4);
          if (L.moon) for (let y = HZN + 2; y < GROUND - 6; y += 2) g.rectA(L.moon.x - 4 + hash3(y, 1) * 6, y, 2 + hash3(y, 2) * 6, 1, hex('#8a90a0'), 0.3);
          for (let i = 0; i < 3; i++) g.px(g.left + 30 + i * 120 + hash3(i, variant) * 40, HZN + 1, hex('#ffd890'));
        }
        hazeBand(g, HZN - 20, HZN + 4, L.haze, 0, 0.25);

        // ── the ground ──
        g.vgrad([mix(groundC, horizonC, 0.25), groundC, shade(groundC, 0.6)], place === 'clifftop' ? GROUND - 6 : HZN + 3, g.bottom, place === 'clifftop' ? GROUND - 6 : HZN + 3);
        if (place === 'carpark') {
          for (let i = -6; i < 12; i++) {
            const x0 = 30 + i * 40;
            g.lineA(x0, HZN + 4, x0 - 30 + (x0 - 160) * 0.6, g.bottom, hex('#8a8a7a'), 0.3);
          }
        } else if (place === 'layby') {
          g.rect(g.left, GROUND + 14, g.w, 1, hex('#6a6a5a'));
          for (let x = g.left; x < g.right; x += 14) g.rect(x, GROUND + 26, 7, 1, hex('#5a5a4a'));
        } else if (place === 'clifftop') {
          for (let i = 0; i < 300; i++) {
            const x = g.left + hash3(i, variant, 7) * g.w;
            const y = GROUND - 6 + hash3(i, variant, 8) * (g.bottom - GROUND + 6);
            g.vline(x, y - 1 - (i % 2), y, mix(groundC, hex('#2a3622'), 0.5));
          }
        }
        for (let i = 0; i < 220; i++) {
          const x = g.left + hash3(i, variant, 17) * g.w;
          const y = HZN + 4 + hash3(i, variant, 18) * (g.bottom - HZN);
          g.pxA(x, y, hex('#3a3a3a'), 0.4);
        }
        if (L.weather === 'snow') snowGround(g, HZN + 3, mix(hex('#6a7280'), L.sky[1]!, 0.3), 0.3);
        if (L.weather === 'rain') for (let i = 0; i < 6; i++) g.ellipseA(g.left + hash3(i, variant, 30) * g.w, GROUND + 6 + hash3(i, variant, 31) * 40, 10 + hash3(i, 2) * 16, 1.5, horizonC, 0.25); // puddles

        // overhead deck for the underpass (in front of the sky, behind the van)
        if (place === 'underpass') {
          g.rect(g.left, g.top, g.w, 30 - g.top, hex('#0c0d10'));
          // the underside: girders in perspective, a dead strip light, a drip line
          for (let y = 22; y > g.top; y -= 9 + Math.floor((22 - y) / 10)) {
            g.hline(g.left, g.right, y, hex('#15171c'));
            g.hline(g.left, g.right, y + 1, hex('#08090b'));
          }
          for (let x = 20; x < 320; x += 60) g.line(x, 26, 160 + (x - 160) * 0.4, g.top, hex('#121418'));
          g.rect(118, 10, 24, 2, hex('#2a2c30'));
          g.rect(200, -20, 18, 2, hex('#2a2c30'));
          g.rect(g.left, 26, g.w, 4, hex('#1a1c22'));
          g.hline(g.left, g.right, 30, hex('#23262d'));
          for (const px of [36, 284]) {
            g.rect(px - 7, 30, 14, GROUND - 30, hex('#121418'));
            g.vline(px - 7, 30, GROUND, hex('#22252c'));
            // somebody's tag, long faded
            g.rectA(px - 5, 70, 10, 6, hex(r.pick(['#4a2a5a', '#2a4a4a', '#5a3a2a'])), 0.5);
          }
        }
        // a lamp post (sodium) — its pool is drawn per frame
        if (place !== 'clifftop') {
          g.vline(lampX, 40, GROUND, hex('#1a1c20'));
          g.hline(lampX, lampX + 8, 40, hex('#1a1c20'));
          g.rect(lampX + 6, 40, 5, 2, hex('#2a2a2a'));
        }

        // ── the van ──
        const body = bodyC;
        const bodyD = shade(body, 0.62);
        const bodyL = mix(body, horizonC, 0.35);
        // box
        roundRect(g, boxX, roofY, boxW, GROUND - 8 - roofY, 3, body);
        // cab with sloping windscreen
        const cabTop = roofY + 6;
        if (facing > 0) {
          g.poly([cabX, roofY, cabX + 12, roofY, cabX + cabW - 2, cabTop + 18, cabX + cabW, cabTop + 22, cabX + cabW, GROUND - 8, cabX, GROUND - 8], body);
          g.poly([cabX + 13, roofY + 3, cabX + cabW - 4, cabTop + 18, cabX + 13, cabTop + 18], mix(hex('#0a0c10'), horizonC, 0.25));
        } else {
          g.poly([cabX + cabW, roofY, cabX + cabW - 12, roofY, cabX + 2, cabTop + 18, cabX, cabTop + 22, cabX, GROUND - 8, cabX + cabW, GROUND - 8], body);
          g.poly([cabX + cabW - 13, roofY + 3, cabX + 4, cabTop + 18, cabX + cabW - 13, cabTop + 18], mix(hex('#0a0c10'), horizonC, 0.25));
        }
        // shading: lower body darker, the roofline catches the sky
        for (let y = GROUND - 30; y < GROUND - 8; y++) g.rectMul(vx, y, vw, 1, 1 - (y - GROUND + 30) * 0.012);
        g.hline(vx + 2, vx + vw - 3, roofY, bodyL);
        if (stripe) g.rect(vx, GROUND - 26, vw, 3, stripe);
        if (odd) {
          const ox = facing > 0 ? cabX + 2 : cabX + 4;
          g.rect(ox, cabTop + 20, cabW - 8, GROUND - 12 - cabTop - 20, hex('#5a5e62'));
        }
        // rust round the arches, a dent
        for (const wx of [vx + 18, vx + vw - 18]) {
          for (let i = 0; i < 40; i++) {
            const a = Math.PI + (hash3(i, wx, 1) * Math.PI);
            const rr = 9 + hash3(i, wx, 2) * 4;
            g.pxA(wx + Math.cos(a) * rr, GROUND - 8 + Math.sin(a) * rr, hex('#5a2a14'), 0.6);
          }
        }
        g.ellipseA(boxX + boxW * 0.25, GROUND - 20, 5, 3, bodyD, 0.6);
        // wheels
        for (const wx of [vx + 18, vx + vw - 18]) {
          g.disc(wx, GROUND - 6, 10, ink);
          g.disc(wx, GROUND - 5, 7, hex('#0c0d10'));
          g.disc(wx, GROUND - 5, 3, hex('#2a2c30'));
        }
        // headlamp, tail lamp, mirror, roof rack
        const front = facing > 0 ? vx + vw - 2 : vx + 1;
        g.rect(front - 1, GROUND - 22, 2, 4, hex('#3a3a32'));
        g.rect(facing > 0 ? vx : vx + vw - 2, GROUND - 24, 2, 5, hex('#3a1210'));
        g.rect(facing > 0 ? cabX + 10 : cabX + cabW - 13, cabTop + 10, 3, 4, bodyD);
        for (let x = boxX + 4; x < boxX + boxW - 4; x += 6) g.vline(x, roofY - 3, roofY - 1, hex('#2a2c30'));
        g.hline(boxX + 2, boxX + boxW - 3, roofY - 3, hex('#3a3c42'));
        // the side door slid back over the rear panel
        const slideX = doorX - facing * (doorW - 4);
        g.rect(slideX, doorTop - 1, doorW, doorBot - doorTop + 2, shade(body, 0.85));
        g.hline(slideX, slideX + doorW - 1, doorTop + 2, bodyD);
        g.rect(doorX - 1, doorTop - 1, doorW + 2, doorBot - doorTop + 2, ink);

        // ── call sign ──
        const sign = L.callsign;
        if (signAt === 'roof') {
          // a plank on the roof rack, painted by hand
          const w = paintedWidth(sign, 2) + 6;
          const bx = Math.round(boxX + boxW / 2 - w / 2 + (facing > 0 ? 6 : -6));
          g.vline(bx + 3, roofY - 5, roofY - 2, hex('#2a2c30'));
          g.vline(bx + w - 4, roofY - 5, roofY - 2, hex('#2a2c30'));
          paintedSign(g, sign, bx, roofY - 5 - 16, hex('#1e1a16'), painted, variant, 2);
        } else if (signAt === 'side') {
          // dripping letters on the slid-back door panel
          const w = paintedWidth(sign, 1);
          paintedSign(g, sign, Math.round(slideX + doorW / 2 - w / 2 - 2), doorTop + 6, mix(bodyC, ink, 0.3), painted, variant, 1, 2);
        } else {
          // a cardboard sign in the windscreen
          const cx = facing > 0 ? cabX + 14 : cabX + cabW - 14 - paintedWidth(sign, 1) - 4;
          paintedSign(g, sign, cx, cabTop + 9, hex('#6a5e48'), hex('#1a120a'), variant, 1, 2);
        }

        // what the guy lines are tied to
        g.tri(mastX - 44, GROUND + 3, mastX - 36, GROUND + 3, mastX - 40, GROUND - 6, hex('#7a3418'));
        g.hline(mastX - 42, mastX - 38, GROUND - 2, hex('#a8a8a0'));
        g.rect(mastX + 40, GROUND, 8, 5, hex('#3a3a3a'));

        // ── the generator, its cable to the van ──
        g.rect(genX, GROUND - 9, 16, 10, hex('#3a2a1a'));
        g.rect(genX, GROUND - 9, 16, 2, hex('#6a4a1a'));
        g.rect(genX + 3, GROUND - 6, 6, 4, hex('#1a1410'));
        g.vline(genX + (facing > 0 ? 14 : 1), GROUND - 13, GROUND - 9, hex('#2a2a2a'));
        for (let x = Math.min(genX + 16, vx); x < Math.max(genX, vx + vw); x++) {
          if (x >= vx && x < vx + vw) continue;
          g.px(x, GROUND + 1 + Math.round(Math.sin(x * 0.3)), hex('#1a1a1a'));
        }

        vignette(g, 0.45, 160, 90);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const awake = f.awake;

        // the street lamp's pool
        if (place !== 'clifftop') {
          const flick = place === 'underpass' && !f.reduced && hash3(Math.floor(t * 8), 3) < 0.06 ? 0.3 : 1;
          g.rect(lampX + 6, 42, 5, 1, mix(hex('#3a2a10'), hex('#ffb060'), flick));
          g.poly([lampX + 6, 43, lampX + 11, 43, lampX + 34, GROUND + 6, lampX - 18, GROUND + 6], hex('#ffa040'), 2, 0.06 * flick);
          g.glow(lampX + 8, 43, 14, hex('#ffa040'), 0.35 * flick, 4);
        }

        // ── light state ──
        let power = 0.35 + 0.65 * awake;
        let doorShut = 0;
        if (R(0)) {
          doorShut = smoothstep(1.6, 2.4, ev) * (1 - smoothstep(7.5, 8.4, ev));
          power *= 1 - doorShut * 0.9;
        }
        let gen = 1;
        if (R(3)) {
          if (ev > 1 && ev < 2) gen = Math.sin(ev * 30) > 0 || f.reduced ? 0.7 : 0.2;
          else if (ev >= 2 && ev < 5.4) gen = 0.05;
          else if (ev >= 5.4) gen = 1 + 0.3 * (1 - smoothstep(5.4, 7, ev));
          power *= gen;
        }
        const flick = f.reduced ? 1 : 0.95 + 0.05 * Math.sin(t * 19) * Math.sin(t * 5.3);
        const P = clamp(power * flick, 0, 1.3);
        const beat = f.pulse * 0.12 * awake;

        // ── the studio inside the side door ──
        const inside = mix(hex('#050404'), lit, 0.5 * P + beat);
        const dw = doorW;
        const dh = doorBot - doorTop;
        g.rect(doorX, doorTop, dw, dh, inside);
        eggBox(g, doorX, doorTop, dw, dh - 12, shade(inside, 0.78), mix(inside, hex('#ffffff'), 0.1), shade(inside, 0.58), 4);
        // desk, decks, a lamp
        g.rect(doorX, doorBot - 12, dw, 12, shade(inside, 0.5));
        g.rect(doorX, doorBot - 13, dw, 2, shade(inside, 0.3));
        g.ellipse(doorX + 8, doorBot - 14, 4, 1, shade(inside, 0.2));
        g.ellipse(doorX + dw - 8, doorBot - 14, 4, 1, shade(inside, 0.2));
        if (!f.reduced && awake > 0.5) g.px(doorX + 8 + Math.round(Math.cos(t * 3.5) * 3), doorBot - 14, mix(inside, hex('#ffffff'), 0.4));
        // the DJ, side-on at the desk
        g.clip(doorX, doorTop, dw, dh);
        const bob = f.reduced ? 0 : awake * (Math.sin(f.beat * Math.PI) * 0.5 + 0.5) * (0.3 + f.energy);
        djSilhouette(g, doorX + dw / 2 - facing * 2, doorBot - 30 + Math.round((1 - awake) * 4), hex('#0a0806'), mix(lit, hex('#ffffff'), 0.3), bob, (variant >> 3) % 3, facing);
        g.noClip();
        if (lights) stringLights(g, doorX, doorTop + 1, doorX + dw - 1, doorTop + 1, 3, 4, L.warm, lit, P, t, hex('#1a1a1a'));
        // the door, sliding shut (rare 0)
        if (doorShut > 0) {
          const sx = Math.round(doorX - facing * (dw - 4) * (1 - doorShut));
          g.rect(sx, doorTop - 1, dw, dh + 2, shade(bodyC, 0.85));
          g.hline(sx, sx + dw - 1, doorTop + 2, shade(bodyC, 0.62));
        }
        if (P > 0.05) {
          g.poly([doorX, GROUND - 8, doorX + dw, GROUND - 8, doorX + dw + 20, g.bottom, doorX - 20, g.bottom], lit, 2, 0.1 * P);
          g.glow(doorX + dw / 2, doorTop + dh / 2, 30, lit, 0.13 * P, 4);
        }

        // camping lantern on the step
        if (lantern) {
          const lx = doorX + (facing > 0 ? dw + 6 : -8);
          g.rect(lx, GROUND - 5, 4, 5, hex('#2a2a2a'));
          g.rect(lx + 1, GROUND - 4, 2, 3, mix(hex('#2a1a08'), lit, P));
          g.glow(lx + 2, GROUND - 3, 12, lit, 0.3 * P, 4);
        }

        // the mast (it sags in rare 2 until someone cranks it back up), its blinking tip
        let sag = 0;
        if (R(2)) sag = smoothstep(0.5, 3, ev) * (1 - smoothstep(6, 6.4, ev)) * 12;
        const mt = drawMast(g, sag);
        const blink = f.reduced ? 0.5 : (t % 1.6) < 0.3 ? 1 : 0;
        const tipY = mast === 'rod' ? mt - 14 : mt - 3;
        const tipX = mast === 'rod' ? mastX + 12 : mastX + 1;
        g.px(tipX, tipY, mix(hex('#3a0a08'), hex('#ff4a3a'), blink * clamp(P)));
        if (blink * P > 0.2) g.glow(tipX, tipY, 6, hex('#ff4a3a'), 0.45);
        if (R(2) && ev > 6 && ev < 6.6) {
          for (let k = 0; k < 5; k++) g.px(mastX + (hash3(k, f.n) - 0.5) * 8, roofY - 4 - hash3(k, f.n, 2) * 6, hex('#ffe08a'));
        }

        // generator exhaust
        const ex = genX + (facing > 0 ? 14 : 1);
        if (gen > 0.1 && !f.reduced)
          for (let i = 0; i < 5; i++) {
            const p = (t * 0.6 + i / 5) % 1;
            g.pxA(ex + Math.sin(t + i) * 2 * p - p * 6, GROUND - 14 - p * 18, hex('#6a6a70'), 0.35 * (1 - p) * gen);
          }
        if (R(3) && ev > 5.2 && ev < 6) for (let i = 0; i < 6; i++) g.ellipseA(ex - 3 - i * 2, GROUND - 16 - i * 3, 3 + i, 2 + i * 0.6, hex('#4a4a50'), 0.5);
        // the generator shakes when running
        const shake = gen > 0.5 && !f.reduced ? (f.n % 2) : 0;
        g.hline(genX + shake, genX + 15 + shake, GROUND - 9, hex('#7a5a22'));

        // ── headlights on the road (rare 0) ──
        let alert = 0;
        if (R(0)) {
          const p = ev / 10;
          const hx = facing > 0 ? g.right + 20 - p * (g.w + 40) : g.left - 20 + p * (g.w + 40);
          const hy = place === 'clifftop' ? GROUND - 8 : HZN + 3;
          const dir = facing > 0 ? -1 : 1;
          g.rect(hx - 8, hy - 4, 16, 4, hex('#0a0b0e'));
          g.rect(hx - 4, hy - 6, 8, 2, hex('#0a0b0e'));
          g.px(hx + dir * 8, hy - 2, hex('#fff6e0'));
          g.glow(hx + dir * 8, hy - 2, 7, hex('#fff2d0'), 0.6);
          for (let i = 2; i < 50; i++) g.rectAdd(hx + dir * (8 + i), hy - 2 - i * 0.04, 1, 1 + Math.floor(i / 12), hex('#fff2d0'), 0.25 * (1 - i / 50));
          alert = ev > 1 && ev < 8.5 ? 1 : 0;
          if (alert && !f.reduced && (t % 0.5) < 0.2) g.glow(lookPos().x, lookPos().y - 18, 6, hex('#fff2c0'), 0.5); // torch signal
        }

        // ── a listener with a request (rare 1) ──
        if (R(1)) {
          const p = ev < 4 ? ev / 4 : ev < 6 ? 1 : 1 - (ev - 6) / 4;
          const from = facing > 0 ? g.right + 10 : g.left - 10;
          const to = doorX + dw / 2 + facing * 22;
          const px = Math.round(from + (to - from) * p);
          const py = GROUND + 4;
          const step = p > 0 && p < 1 && !f.reduced ? Math.round(Math.sin(t * 10)) : 0;
          const c = hex('#121318');
          g.rect(px - 2 + step, py - 8, 2, 8, c);
          g.rect(px + 1 - step, py - 8, 2, 8, c);
          g.rect(px - 3, py - 18, 7, 10, c);
          g.rect(px - 2, py - 23, 5, 5, c);
          g.vline(px + (facing > 0 ? -3 : 3), py - 18, py - 9, mix(c, lit, 0.4 * P));
          if (ev > 3.6 && ev < 6.4) {
            // holding up the request
            const hx = px - facing * 5;
            g.rect(hx - 3, py - 26, 7, 5, hex('#d8d0b8'));
            g.hline(hx - 2, hx + 2, py - 24, hex('#4a3a2a'));
            g.line(px, py - 17, hx, py - 22, c);
          }
        }

        // ── the lookout ──
        const lp = lookPos();
        const rim = mix(horizonC, hex('#a0a8b8'), 0.25);
        if (look === 'chair') {
          const cx = lp.x;
          const cy = GROUND + 4;
          const c = hex('#26323e');
          g.line(cx - 5, cy, cx + 5, cy - 7, c);
          g.line(cx + 5, cy, cx - 5, cy - 7, c);
          g.rect(cx - 6, cy - 8, 12, 2, hex('#3a2a3a'));
          g.line(cx - lookSide * 6, cy - 8, cx - lookSide * 7, cy - 18, c);
          // sitting: legs forward, body, head, binoculars up (or waving)
          const body = hex('#101216');
          g.rect(cx - 4, cy - 14, 8, 7, body);
          g.rect(cx - 3, cy - 19, 6, 5, body);
          g.rect(cx + lookSide * 4, cy - 8, 5 * lookSide, 2, body);
          g.rect(cx + lookSide * 8, cy - 7, 2, 6, body);
          if (alert > 0.5) {
            const wave = f.reduced ? 0 : Math.sin(t * 10) > 0 ? 1 : 0;
            g.vline(cx + lookSide * 4, cy - 25 - wave, cy - 15, body);
          } else {
            g.rect(cx + lookSide * 3 - (lookSide < 0 ? 1 : 0), cy - 18, 2, 2, hex('#1a1a20'));
            g.px(cx + lookSide * 4, cy - 18, rim);
            if (awake < 0.4) g.text('z', cx + 4, cy - 28, shade(rim, 0.8));
          }
          g.vline(cx - lookSide * 4, cy - 14, cy - 8, rim);
          g.px(cx - lookSide * 3, cy - 19, rim);
          // a flask
          g.rect(cx - lookSide * 9, cy - 4, 2, 4, hex('#5a6a7a'));
        } else if (look === 'roof') {
          lookout(g, 'person', lp.x, roofY - 3, lookSide, t, alert, hex('#101216'), rim);
        } else {
          lookout(g, 'dog', lp.x, GROUND + 4, lookSide, t, alert, hex('#2a2018'), mix(rim, lit, 0.3));
        }

        pirateWeather(g, L, t, fogs, GROUND);
      },
    };

    function lookPos() {
      if (look === 'roof') return { x: facing > 0 ? boxX + 22 : boxX + boxW - 22, y: roofY - 3 };
      const x = lookSide < 0 ? Math.min(genX - 22, vx - 36) : Math.max(genX + 36, vx + vw + 30);
      return { x: Math.max(g0.left + 14, Math.min(g0.right - 14, x)), y: GROUND + 4 };
    }
  },
};

// The view extents aren't known at create time; the lookout just keeps inside the design area.
const g0 = { left: 0, right: 320 } as Pick<Gfx, 'left' | 'right'>;

export default def;

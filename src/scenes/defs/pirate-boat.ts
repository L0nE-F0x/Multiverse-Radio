// Pirate station, boat edition: a little boat at anchor broadcasting from just outside the rules.
// Egg boxes in the wheelhouse windows, a long-wire aerial strung from the mast, a coat-hanger dipole
// at the top, a call sign painted on the hull and a lookout at the bow. It bobs. Shared by many
// generated pirates: the water, the boat, the rig, the weather and the hour vary with ctx.variant.
// Rare events: a patrol boat's searchlight (lights out); something surfaces to listen; a big swell;
// a car on the shore flashes its headlights in time.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope } from '../kit/fx';
import { Gfx, blendPx } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { roundRect } from '../kit/shapes';
import type { Sprite } from '../kit/sprite';
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
  treeLine,
  vignette,
} from './deep-kit';

const WL = 118; // waterline at the boat
const HZN = 96;

interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
  dj: boolean;
  round: boolean;
}

const def: SceneDef = {
  id: 'pirate-boat',
  fps: 15,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent, variant }) {
    const L = pirateLook(variant, accent, 4, false);
    const r = L.rng;
    const lit = L.practical;
    const ink = hex('#040506');
    const horizonC = L.sky[L.sky.length - 1]!;

    // ── this pirate's water and boat ──
    const water = r.pick(['sea', 'sea', 'canal', 'estuary'] as const);
    const kind = water === 'canal' ? 'narrowboat' : r.pick(['trawler', 'trawler', 'tug'] as const);
    const bw = kind === 'narrowboat' ? r.int(172, 196) : kind === 'tug' ? r.int(116, 130) : r.int(132, 150);
    const bx = Math.round(r.range(150, 172) - bw / 2);
    const bowRight = r.chance(0.5);
    const hullC = mix(hex(r.pick(['#1e2a3a', '#2a1e1e', '#1e2a22', '#2a2a2e', '#3a2a1a', '#18222c'])), L.sky[1]!, 0.25);
    const trim = mix(hex(r.pick(['#8a2a22', '#c8b890', '#2a5a6a', '#8a6a2a', '#3a6a3a'])), L.sky[1]!, 0.35);
    const cabinC = mix(hex(r.pick(['#5a5a54', '#6a6458', '#3a4a5a', '#4a3a3a', '#2e4a3a'])), L.sky[1]!, 0.3);
    const look = r.pick(['person', 'person', 'gull', 'dog'] as const);
    const signAt = r.pick(['hull', 'hull', 'sheet'] as const);
    const shoreBlink = r.int(40, 280);
    const fogs = L.weather === 'fog' ? [makeHaze(256, 40, variant & 255, 40, 10), makeHaze(256, 50, (variant >> 8) & 255, 30, 12)] : null;
    const still = water === 'canal';
    const waterTop = water === 'canal' ? 104 : HZN;
    const markers = [r.int(20, 80), r.int(240, 300)];

    // ── build the boat into a sprite (it bobs, so it's blitted per frame) ──
    const BX0 = bx - 20;
    const BY0 = 16;
    const BWID = bw + 40;
    const BHT = WL + 4 - BY0;
    const bg = new Gfx(BWID, BHT, BX0, BY0);
    const wins: Win[] = [];
    let mastX = 0;
    let mastTop = 0;
    let bowX = 0;
    let deckY = 0;
    let lookX = 0;
    {
      const g = bg;
      const dir = bowRight ? 1 : -1;
      const sternX = bowRight ? bx : bx + bw;
      bowX = bowRight ? bx + bw : bx;
      const X = (dx: number) => sternX + dir * dx; // distance from the stern
      if (kind === 'narrowboat') {
        deckY = WL - 10;
        // long low hull, painted panels, a cabin almost as long as the boat
        g.rect(bx, deckY, bw, WL + 4 - deckY, hullC);
        g.hline(bx, bx + bw - 1, deckY, trim);
        g.hline(bx, bx + bw - 1, WL - 2, shade(hullC, 0.7));
        g.poly([bowX, deckY, bowX + dir * 8, deckY - 2, bowX + dir * 4, WL + 4, bowX, WL + 4], hullC);
        const c0 = Math.min(X(14), X(bw - 22));
        const c1 = Math.max(X(14), X(bw - 22));
        g.rect(c0, deckY - 22, c1 - c0, 22, cabinC);
        g.rect(c0 - 1, deckY - 24, c1 - c0 + 2, 2, shade(cabinC, 0.7));
        g.hline(c0 - 1, c1, deckY - 24, mix(cabinC, horizonC, 0.4));
        // castles-and-roses-ish panels, in the dark just a border
        for (let x = c0 + 4; x < c1 - 20; x += 26) {
          g.rect(x, deckY - 18, 20, 13, shade(cabinC, 0.85));
          g.hline(x, x + 19, deckY - 18, trim);
        }
        // portholes with egg boxes behind them
        for (let x = c0 + 8; x < c1 - 10; x += 22) wins.push({ x, y: deckY - 17, w: 9, h: 9, dj: false, round: true });
        if (wins.length) wins[Math.floor(wins.length / 2)]!.dj = true;
        // chimney, a stack of junk on the roof, a bicycle, plant pots
        g.rect(X(bw - 30), deckY - 32, 3, 8, hex('#1a1a1a'));
        g.rect(X(bw - 31) - (dir < 0 ? 2 : 0), deckY - 33, 5, 1, hex('#8a6a2a'));
        g.ring(X(40), deckY - 28, 3, 3, hex('#2a2c30'));
        g.ring(X(48), deckY - 28, 3, 3, hex('#2a2c30'));
        g.line(X(40), deckY - 28, X(44), deckY - 32, hex('#2a2c30'));
        g.line(X(44), deckY - 32, X(48), deckY - 28, hex('#2a2c30'));
        for (let k = 0; k < 3; k++) {
          g.rect(X(70 + k * 6), deckY - 27, 4, 3, hex('#5a3020'));
          g.rect(X(70 + k * 6), deckY - 30, 4, 3, hex('#1e3a22'));
        }
        mastX = X(Math.round(bw * 0.62));
        mastTop = deckY - 62;
        lookX = X(bw - 8);
      } else {
        deckY = WL - (kind === 'tug' ? 19 : 17);
        // hull: sheer line rising to the bow
        const pts: number[] = [];
        for (let i = 0; i <= 20; i++) {
          const u = i / 20;
          pts.push(X(u * bw), deckY - Math.round((u > 0.6 ? (u - 0.6) * 18 : 0) + (u < 0.1 ? (0.1 - u) * 20 : 0)));
        }
        pts.push(bowX + dir * 2, WL + 4, sternX - dir * 2, WL + 4);
        g.poly(pts, hullC);
        // gunwale trim and a boot stripe
        for (let i = 0; i < 20; i++) g.line(pts[i * 2]!, pts[i * 2 + 1]!, pts[i * 2 + 2]!, pts[i * 2 + 3]!, trim);
        g.hline(bx + 4, bx + bw - 5, WL - 2, shade(trim, 0.6));
        if (kind === 'tug') {
          // tyres slung along the side
          for (let k = 0; k < 4; k++) g.ring(X(18 + k * 20), deckY + 6, 3, 3, hex('#0a0a0c'));
        }
        // the wheelhouse
        const wx0 = Math.min(X(bw * 0.28), X(bw * 0.56));
        const wx1 = Math.max(X(bw * 0.28), X(bw * 0.56));
        const wh = kind === 'tug' ? 32 : 28;
        roundRect(g, wx0, deckY - wh, wx1 - wx0, wh, 2, cabinC);
        g.rect(wx0 - 2, deckY - wh - 2, wx1 - wx0 + 4, 3, shade(cabinC, 0.7));
        g.hline(wx0 - 2, wx1 + 1, deckY - wh - 2, mix(cabinC, horizonC, 0.45));
        const ww = Math.floor((wx1 - wx0 - 8) / 2);
        wins.push({ x: wx0 + 3, y: deckY - wh + 4, w: ww, h: 14, dj: !bowRight, round: false });
        wins.push({ x: wx0 + 5 + ww, y: deckY - wh + 4, w: ww, h: 14, dj: bowRight, round: false });
        // a fish box, a coil of rope, nets, a lifering
        g.rect(X(8), deckY - 5, 9 * dir, 5, hex('#3a4a5a'));
        g.ring(X(bw * 0.7), deckY - 2, 3, 1, hex('#6a6a5a'));
        g.ring(Math.round((wx0 + wx1) / 2), deckY - wh / 2 + 6, 3, 3, hex('#a84a2a'));
        if (kind === 'trawler') {
          // a gallows at the stern
          g.vline(X(4), deckY - 20, deckY, hex('#2a2c30'));
          g.line(X(4), deckY - 20, X(12), deckY - 16, hex('#2a2c30'));
        } else {
          g.rect(X(bw * 0.42), deckY - wh - 12, 6, 10, hex('#1a1a1c')); // funnel
          g.rect(X(bw * 0.42), deckY - wh - 9, 6, 2, trim);
        }
        mastX = X(Math.round(bw * 0.68));
        mastTop = Math.max(28, deckY - 70);
        lookX = X(bw - 14);
      }
      // the mast, a cross-tree, a coat-hanger dipole on top, the long wire to the stern
      g.rect(mastX, mastTop, 2, deckY - mastTop, hex('#2a2620'));
      g.hline(mastX - 6, mastX + 7, mastTop + 14, hex('#2a2620'));
      coatHanger(g, mastX + 1, mastTop + 2, hex('#6a6e76'), 1.2);
      const sx = bowRight ? bx + 2 : bx + bw - 2;
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        g.px(mastX + (sx - mastX) * u, mastTop + 4 + (deckY - 6 - mastTop - 4) * u + Math.sin(u * Math.PI) * 4, hex('#4a4e56'));
      }
      g.vline(sx, deckY - 8, deckY, hex('#2a2620'));
      // forestay to the bow
      g.line(mastX + 1, mastTop + 6, bowX, deckY - 2, hex('#3a3c42'));
      // the call sign, painted on the bow quarter
      const sign = L.callsign;
      if (signAt === 'hull') {
        const sc = kind !== 'narrowboat' && paintedWidth(sign, 2) < bw * 0.42 ? 2 : 1;
        const w = paintedWidth(sign, sc);
        const tx = bowRight ? bowX - 16 - w : bowX + 16;
        paintedText(g, sign, tx, kind === 'narrowboat' ? deckY + 2 : deckY + 2, mix(lit, hex('#f4ecdc'), 0.45), sc, variant, false);
      }
    }
    const boat: Sprite = { w: BWID, h: BHT, d: bg.frame };

    return {
      background(g) {
        pirateSky(g, L, waterTop);
        const far = mix(horizonC, ink, 0.55);
        const farD = mix(horizonC, ink, 0.7);
        // ── the far side ──
        if (water === 'sea') {
          // a low headland with a scatter of lights
          for (let x = g.left; x < g.right; x++) {
            const h = Math.max(0, Math.sin((x - 40) / 70) * 10 + hash3(Math.floor(x / 9), 3) * 3);
            if (x > 180) continue;
            g.rect(x, HZN - h, 1, h + 1, far);
          }
          for (let i = 0; i < 14; i++) {
            const x = g.left + 10 + hash3(i, variant, 9) * 170;
            g.px(x, HZN - 1 - hash3(i, 4) * 3, mix(far, hex('#ffd890'), 0.7));
          }
        } else if (water === 'estuary') {
          // mudflats, marker posts, a far line of trees
          treeLine(g, HZN + 1, variant & 1023, farD, 4, 9, 1.3);
          for (let y = HZN + 1; y < HZN + 8; y++) g.rectA(g.left, y, g.w, 1, hex('#2a2620'), 0.5);
        } else {
          // the far bank of a canal: towpath, a brick wall, trees, a footbridge
          treeLine(g, 82, variant & 1023, farD, 10, 20, 0.8);
          const brick = mix(hex('#2a1c18'), L.sky[0]!, 0.35);
          g.rect(g.left, 82, g.w, 18, brick);
          for (let y = 83; y < 100; y += 3) {
            g.hline(g.left, g.right, y, shade(brick, 0.8));
            for (let x = g.left + (((y - 83) / 3) % 2) * 3; x < g.right; x += 6) g.px(x, y + 1, shade(brick, 0.8));
          }
          g.rect(g.left, 100, g.w, 4, mix(hex('#2a2a26'), L.sky[0]!, 0.3)); // towpath edge
          g.hline(g.left, g.right, 100, mix(hex('#4a4a44'), L.sky[0]!, 0.3));
          // a towpath lamp
          const lx = r.int(30, 290);
          g.vline(lx, 66, 100, hex('#1a1a1c'));
          g.rect(lx - 2, 63, 5, 4, hex('#2a2a2a'));
        }
        hazeBand(g, waterTop - 22, waterTop + 2, L.haze, 0, 0.25);

        // ── water ──
        const wTop = mix(horizonC, ink, 0.35);
        const wBot = mix(L.sky[0]!, ink, 0.5);
        g.vgrad([wTop, mix(wTop, wBot, 0.6), wBot], waterTop, g.bottom, waterTop);
        // the canal bank's reflection
        if (water === 'canal') {
          for (let y = 104; y < 104 + 22; y++) {
            const src = 104 - (y - 104) - 1;
            for (let x = g.left; x < g.right; x++) {
              const c = g.get(x + Math.round(Math.sin(y * 0.9) * 1), src);
              if (c) g.pxA(x, y, c, 0.35 * (1 - (y - 104) / 22));
            }
          }
        }
        // ripples: horizontal strokes catching the sky
        for (let y = waterTop + 1; y < g.bottom; y++) {
          const d = (y - waterTop) / 80;
          const gap = 1 + Math.floor(d * 3);
          if ((y - waterTop) % gap) continue;
          for (let x = g.left; x < g.right; x++) {
            const n = hash3(Math.floor(x / (4 + d * 10)), y, variant & 255);
            if (n > 0.86) g.pxA(x, y, horizonC, (n - 0.86) * 4 * (still ? 0.5 : 0.9));
          }
        }
        if (L.moon) for (let y = waterTop + 2; y < g.bottom; y += 2) g.rectA(L.moon.x - 3 + hash3(y, 1) * 6 - (y - waterTop) * 0.02, y, 2 + hash3(y, 2) * (4 + (y - waterTop) * 0.1), 1, hex('#a8b0c0'), 0.35 * (1 - (y - waterTop) / 120));
        // estuary channel markers
        if (water === 'estuary') {
          for (const [mx, c] of [[markers[0]!, '#2a6a3a'], [markers[1]!, '#7a2a22']] as const) {
            g.vline(mx, HZN + 2, HZN + 14, hex('#1a1a1a'));
            g.rect(mx - 1, HZN, 3, 3, hex(c));
          }
        }

        vignette(g, 0.45, 160, 88);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const awake = f.awake;

        // a big swell (rare 2), otherwise a gentle bob
        const swell = R(2) ? envelope(ev, 10, 1.5, 3) : 0;
        const amp = (still ? 0.4 : 1.2) * (f.reduced ? 0.3 : 1) + swell * 3;
        const bob = Math.round(Math.sin(t * (still ? 0.6 : 1.1)) * amp + Math.sin(t * 0.43) * amp * 0.3);

        // estuary marker lights blink; a shore car flashes its lights in time (rare 3)
        if (water === 'estuary') {
          const on = f.reduced ? 0.5 : (t % 3) < 0.4 ? 1 : 0.15;
          g.glow(markers[0]!, HZN + 1, 5, hex('#3aaa5a'), 0.4 * on);
          g.glow(markers[1]!, HZN + 1, 5, hex('#ff4a3a'), 0.4 * ((t + 1.5) % 3 < 0.4 ? 1 : 0.15));
        }
        if (R(3)) {
          const a = envelope(ev, 10, 1, 1);
          const on = f.reduced ? 0.5 : Math.floor(f.beat) % 2 ? 1 : 0.1;
          const sy = water === 'canal' ? 98 : HZN - 1;
          g.px(shoreBlink, sy, mix(hex('#3a3020'), hex('#fff2d0'), a * on));
          g.px(shoreBlink + 3, sy, mix(hex('#3a3020'), hex('#fff2d0'), a * on));
          g.glow(shoreBlink + 1, sy, 8, hex('#fff2d0'), a * on * 0.5);
        }

        // ── light state ──
        let power = 0.35 + 0.65 * awake;
        const patrol = R(0);
        if (patrol && ev > 2 && ev < 7.8) power = 0.03;
        const flick = f.reduced ? 1 : 0.95 + 0.05 * Math.sin(t * 17) * Math.sin(t * 5.7);
        const P = clamp(power * flick, 0, 1);
        const beatK = f.pulse * 0.12 * awake;

        // ── the boat ──
        g.clip(g.left, g.top, g.w, WL + 1 - g.top);
        g.blit(boat, BX0, BY0 + bob);
        g.noClip();
        // lit windows: egg boxes, the DJ in one of them
        const wl = mix(hex('#050404'), lit, 0.48 * P + beatK);
        for (const w of wins) {
          const y = w.y + bob;
          if (w.round) {
            g.disc(w.x + 4, y + 4, 4.5, shade(cabinC, 0.6));
            g.disc(w.x + 4, y + 4, 3.5, wl);
            for (let k = 0; k < 4; k++) g.px(w.x + 2 + (k % 2) * 4, y + 2 + Math.floor(k / 2) * 4, shade(wl, 0.7));
            if (w.dj) {
              g.rect(w.x + 3, y + 2, 4, 4, hex('#0a0806'));
              g.rect(w.x + 2, y + 6, 6, 3, hex('#0a0806'));
              g.px(w.x + 2, y + 3, mix(lit, hex('#ffffff'), 0.3));
            }
          } else {
            g.rect(w.x, y, w.w, w.h, wl);
            eggBox(g, w.x, y, w.w, w.h, shade(wl, 0.78), mix(wl, hex('#ffffff'), 0.08), shade(wl, 0.58), 4);
            if (w.dj) {
              g.clip(w.x, y, w.w, w.h);
              const nod = f.reduced ? 0 : awake * (Math.sin(f.beat * Math.PI) * 0.5 + 0.5) * (0.3 + f.energy);
              djSilhouette(g, w.x + w.w / 2, y + 2 + Math.round((1 - awake) * 3), hex('#0a0806'), mix(lit, hex('#ffffff'), 0.3), nod, (variant >> 4) % 3, bowRight ? 1 : -1);
              g.noClip();
            }
          }
          if (P > 0.05) g.glow(w.x + w.w / 2, y + w.h / 2, 12, lit, 0.15 * P, 4);
        }
        // mast lights: white anchor light, and a red blink for the transmitter
        const mt = mastTop + bob;
        g.px(mastX, mt - 1, hex('#f4f0e0'));
        g.glow(mastX, mt - 1, 6, hex('#f4f0e0'), 0.35);
        const blink = f.reduced ? 0.5 : (t % 1.5) < 0.3 ? 1 : 0;
        g.px(mastX + 1, mt + 14, mix(hex('#3a0a08'), hex('#ff4a3a'), blink * Math.max(0.2, P)));
        if (blink * P > 0.2) g.glow(mastX + 1, mt + 14, 6, hex('#ff4a3a'), 0.4);
        // a sheet with the call sign on the rail
        if (signAt === 'sheet') {
          const sign = L.callsign;
          const w = paintedWidth(sign, 1) + 6;
          const sx = bowRight ? bowX - 24 - w : bowX + 24;
          const sy = deckY - 10 + bob;
          g.rect(sx, sy, w, 10, mix(hex('#8a8478'), L.sky[1]!, 0.3));
          paintedText(g, sign, sx + 3, sy + 3, mix(lit, ink, 0.3), 1, variant, false);
        }

        // ── the lookout at the bow ──
        let alert = patrol && ev > 1.5 && ev < 8.5 ? 1 : 0;
        const rim = mix(horizonC, hex('#a0a8b8'), 0.25);
        const ldir: 1 | -1 = bowRight ? 1 : -1;
        if (look === 'person') lookout(g, 'person', lookX, deckY + bob, ldir, t, alert, hex('#0e1014'), rim);
        else if (look === 'dog') lookout(g, 'dog', lookX, deckY + bob, ldir, t, alert, hex('#2a2018'), rim);
        else {
          // a gull on the masthead, keeping an eye out
          const gx = mastX + 1;
          const gy = mt - 3;
          g.rect(gx - 2, gy - 2, 5, 2, hex('#c8ccd4'));
          g.px(gx + ldir * 3, gy - 3, hex('#c8ccd4'));
          g.px(gx + ldir * 4, gy - 3, hex('#c89a3a'));
          g.hline(gx - 3, gx - 1, gy - 1, hex('#5a5e68'));
          if (alert) g.px(gx + ldir * 3, gy - 4, hex('#c8ccd4'));
        }

        // ── reflection of the boat and its lights ──
        const x0 = Math.max(g.left, BX0) - g.ox;
        const x1 = Math.min(g.right, BX0 + BWID) - g.ox;
        const depth = 30;
        for (let k = 1; k < depth; k++) {
          const y = WL + k;
          const sy = WL - k;
          const by = y - g.oy;
          const bsy = sy - g.oy;
          if (by < 0 || by >= g.h || bsy < 0 || bsy >= g.h) continue;
          const wob = Math.round(Math.sin(k * 0.9 + t * (still ? 1 : 2.2)) * (still ? 0.7 : 1.6));
          const a = (still ? 0.5 : 0.38) * (1 - k / depth);
          const row = by * g.w;
          const srow = bsy * g.w;
          for (let bxx = x0; bxx < x1; bxx++) {
            const sx = bxx + wob;
            if (sx < 0 || sx >= g.w) continue;
            if (!still && (k + bxx) % 3 === 0) continue; // broken up by the chop
            g.buf[row + bxx] = blendPx(g.buf[row + bxx]!, shade(g.buf[srow + sx]!, 0.7), a);
          }
        }
        // a lace of foam where the hull meets the water
        for (let x = bx - 2; x < bx + bw + 2; x++) {
          const n = Math.sin(x * 0.5 + t * 2) + Math.sin(x * 0.21 - t * 1.3);
          if (n > (still ? 1.5 : 0.6)) g.pxA(x, WL + 1, hex('#a8b4c0'), 0.4);
        }
        if (swell > 0.3) for (let k = 0; k < 10; k++) g.pxA(bowX + (bowRight ? 1 : -1) * hash3(k, f.n) * 10, WL - hash3(k, f.n, 2) * 10 * swell, hex('#c8d4dc'), 0.6);

        // ── something surfaces to listen (rare 1) ──
        if (R(1)) {
          const up = envelope(ev, 10, 1.5, 1.5);
          const sxp = bowRight ? bowX + 26 : bowX - 26;
          const sy = WL + 8 - Math.round(up * 4);
          if (water === 'canal') {
            // a duck, paddling past
            const dx = Math.round((ev / 10) * 120 - 60);
            g.rect(sxp + dx - 3, WL + 6, 7, 3, hex('#3a3a2a'));
            g.rect(sxp + dx + 2, WL + 3, 3, 3, hex('#1e3a2a'));
            g.px(sxp + dx + 5, WL + 4, hex('#c89a3a'));
          } else {
            g.clip(g.left, g.top, g.w, WL + 9 - g.top);
            g.ellipse(sxp, sy, 4, 4, hex('#2a2a30'));
            g.px(sxp - 2, sy - 1, hex('#0a0a0a'));
            g.px(sxp + 1, sy - 1, hex('#0a0a0a'));
            g.hline(sxp - 2, sxp + 2, sy - 4, mix(hex('#2a2a30'), horizonC, 0.5));
            g.noClip();
            if (up > 0.2) for (let k = -6; k <= 6; k += 2) g.pxA(sxp + k, WL + 8, hex('#a8b4c0'), 0.4 * up);
          }
        }

        // ── the patrol boat's searchlight (rare 0) ──
        if (patrol) {
          const p = ev / 10;
          const px = bowRight ? g.left - 30 + p * 120 : g.right + 30 - p * 120;
          const py = waterTop + 4;
          const ang = (bowRight ? -0.2 : Math.PI + 0.2) + Math.sin(ev * 0.8) * 0.5 * (bowRight ? 1 : -1);
          const ex = px + Math.cos(ang) * 260;
          const ey = py + Math.sin(ang) * 30 + 10;
          g.tri(px, py, ex, ey - 14, ex, ey + 14, hex('#e8f0ff'), 2, f.reduced ? 0.04 : 0.08);
          g.rect(px - 10, py - 3, 20, 3, hex('#0a0b0e'));
          g.rect(px - 3, py - 6, 6, 3, hex('#0a0b0e'));
          g.glow(px, py - 3, 6, hex('#e8f0ff'), 0.5);
          if ((t % 1) < 0.12) g.pxAdd(px - 8, py - 4, hex('#4a8aff'), 1);
          alert = 1;
        }

        pirateWeather(g, L, t, fogs, WL);
      },
    };
  },
};

export default def;

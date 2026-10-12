// Pirate station, garden-shed edition: an unlicensed studio in a shed at the bottom of somebody's
// garden. Egg-box soundproofing in the window, an aerial bodged from coat hangers, a hand-painted
// call sign, an extension cable from the house and a lookout on watch. Shared by many generated
// pirates: the layout, the shed, the props, the weather and the hour all vary with ctx.variant.
// Rare events: a detector van's dish glides past behind the fence (lights out!); a neighbour
// nods along at a window; a fox stops in the doorway light; the fuse goes.

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
  paintedSign,
  paintedWidth,
  pirateLook,
  pirateSky,
  pirateWeather,
  stringLights,
  treeLine,
  vignette,
} from './deep-kit';

const GROUND = 126;
const FENCE_TOP = 98;

const def: SceneDef = {
  id: 'pirate-shed',
  fps: 15,
  focusY: 86,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent, variant }) {
    const L = pirateLook(variant, accent, 1);
    const r = L.rng;
    const lit = L.practical;
    const ink = hex('#040506');
    const horizonC = L.sky[L.sky.length - 1]!;

    // ── this pirate's garden ──
    const sw = r.int(84, 106);
    const sx = Math.round(r.range(112, 208) - sw / 2); // shed left edge
    const wallTop = GROUND - r.int(40, 46);
    const roof = r.pick(['apex', 'pent', 'apex', 'curved'] as const);
    const clad = hex(r.pick(['#1e2a1c', '#1c2532', '#141211', '#2a2018', '#2a1c1a', '#24241f']));
    const doorLeft = r.chance(0.5);
    const doorW = 15;
    const doorH = 33;
    const doorX = doorLeft ? sx + 8 : sx + sw - 8 - doorW;
    const winW = r.int(22, 28);
    const winH = 15;
    const winX = doorLeft ? sx + sw - 9 - winW : sx + 9;
    const winY = wallTop + 9;
    const aerial = r.pick(['hanger', 'hanger', 'longwire', 'yagi'] as const);
    const aerialX = doorLeft ? sx + sw - 12 : sx + 12;
    const lights = r.chance(0.55);
    const backdrop = r.pick(['houses', 'houses', 'trees', 'allotment'] as const);
    const fence = r.pick(['panel', 'picket', 'wall'] as const);
    const signAt = r.pick(['above', 'leaning', 'roof'] as const);
    const look = r.pick(['ladder', 'ladder', 'cat', 'gnome', 'dog'] as const);
    const emptyLeft = sx + sw / 2 > 160;
    const lookX = emptyLeft ? r.int(46, sx - 34) : r.int(sx + sw + 30, 280);
    const props = {
      barrow: r.chance(0.5),
      bike: r.chance(0.4),
      washing: r.chance(0.35),
      bin: r.chance(0.5),
      chair: r.chance(0.4),
      gnomes: r.chance(0.3),
    };
    const glowCity = backdrop === 'houses' && r.chance(0.6);
    const neighbourX = emptyLeft ? r.int(sx + sw + 10, 270) : r.int(50, Math.max(52, sx - 20));
    const painted = mix(lit, hex('#f0e8d8'), 0.5);
    const board = hex(r.pick(['#241f1b', '#1b201c', '#221e17', '#251919']));
    const fogs = L.weather === 'fog' ? [makeHaze(256, 40, variant & 255, 40, 10), makeHaze(256, 50, (variant >> 8) & 255, 30, 12)] : null;

    const roofY = (x: number) => {
      const u = clamp((x - sx) / sw);
      if (roof === 'apex') return wallTop - 15 * (1 - Math.abs(u - 0.5) * 2);
      if (roof === 'pent') return wallTop - 11 + u * 9;
      return wallTop - Math.sin(u * Math.PI) * 13;
    };

    return {
      background(g) {
        pirateSky(g, L, FENCE_TOP);
        if (glowCity) g.glow(r.range(80, 240), FENCE_TOP + 10, 150, hex('#8a5a3a'), 0.16, 6);

        // ── what's behind the fence ──
        const far = mix(horizonC, ink, 0.5);
        const farD = mix(horizonC, ink, 0.68);
        if (backdrop === 'houses') {
          // the backs of a terrace: chimneys, dark windows
          let x = g.left - 10;
          let i = 0;
          while (x < g.right) {
            const w = 36 + Math.floor(hash3(i, variant, 1) * 22);
            const top = 50 + Math.floor(hash3(i, variant, 2) * 12);
            const c = i % 2 ? far : farD;
            g.rect(x, top, w, FENCE_TOP - top + 2, c);
            g.tri(x - 1, top, x + w + 1, top, x + w / 2, top - 10, c);
            g.rect(x + w * 0.7, top - 14, 4, 10, c);
            g.rect(x + w * 0.7 - 1, top - 15, 6, 2, shade(c, 1.2));
            for (let k = 0; k < 2; k++) g.rect(x + 6 + k * (w - 18), top + 9, 6, 8, shade(c, 0.6));
            x += w;
            i++;
          }
        } else if (backdrop === 'trees') {
          treeLine(g, FENCE_TOP + 2, variant & 1023, far, 12, 24, 0.7);
          treeLine(g, FENCE_TOP + 2, (variant >> 10) & 1023, farD, 8, 16, 0.9);
        } else {
          // allotments: other sheds, bean poles, a water butt
          treeLine(g, FENCE_TOP - 8, variant & 1023, farD, 14, 26, 1.4);
          for (let i = 0; i < 6; i++) {
            const x = g.left + 10 + i * 70 + hash3(i, variant, 3) * 30;
            const w = 18 + hash3(i, variant, 4) * 14;
            const top = FENCE_TOP - 14 - hash3(i, variant, 5) * 8;
            g.rect(x, top, w, FENCE_TOP - top + 2, far);
            g.tri(x - 1, top, x + w + 1, top, x + w / 2, top - 6, far);
            for (let k = 0; k < 4; k++) g.line(x + w + 8 + k * 3, FENCE_TOP, x + w + 10 + k * 2, FENCE_TOP - 18, far);
          }
        }
        // the neighbour's place, with a window that stays dark (until a rare event)
        if (backdrop !== 'houses') {
          g.rect(neighbourX - 8, 62, 26, FENCE_TOP - 60, far);
          g.tri(neighbourX - 10, 62, neighbourX + 20, 62, neighbourX + 5, 52, far);
        }
        g.rect(neighbourX, 66, 9, 10, shade(far, 0.55));
        // mist pooling along the fence line
        hazeBand(g, FENCE_TOP - 24, FENCE_TOP + 2, L.haze, 0, 0.22);

        // ── the fence ──
        const fenceC = mix(shade(clad, 0.9), hex('#2a2620'), 0.5);
        if (fence === 'panel') {
          for (let x = g.left; x < g.right; x++) {
            const post = ((x % 44) + 44) % 44 < 3;
            const c = post ? shade(fenceC, 0.75) : (x >> 1) % 2 ? fenceC : shade(fenceC, 0.88);
            g.rect(x, FENCE_TOP + (post ? -3 : 0), 1, GROUND - FENCE_TOP + 3, c);
          }
          for (let y = FENCE_TOP + 5; y < GROUND; y += 5) g.hline(g.left, g.right, y, shade(fenceC, 0.72));
          g.hline(g.left, g.right, FENCE_TOP, mix(fenceC, horizonC, 0.4));
        } else if (fence === 'picket') {
          g.rect(g.left, FENCE_TOP + 6, g.w, 2, shade(fenceC, 0.8));
          g.rect(g.left, FENCE_TOP + 18, g.w, 2, shade(fenceC, 0.8));
          for (let x = g.left - (((g.left % 5) + 5) % 5); x < g.right; x += 5) {
            const c = mix(fenceC, hex('#4a4640'), 0.35);
            g.rect(x, FENCE_TOP + 2, 3, GROUND - FENCE_TOP, c);
            g.px(x + 1, FENCE_TOP + 1, c);
            g.vline(x + 2, FENCE_TOP + 3, GROUND, shade(c, 0.8));
          }
        } else {
          const brick = mix(hex('#2a1c1a'), L.sky[0]!, 0.3);
          g.rect(g.left, FENCE_TOP, g.w, GROUND - FENCE_TOP, brick);
          for (let y = FENCE_TOP + 1; y < GROUND; y += 3) {
            g.hline(g.left, g.right, y, shade(brick, 0.75));
            for (let x = g.left + ((((y - FENCE_TOP) / 3) | 0) % 2) * 4; x < g.right; x += 8) g.px(x, y + 1, shade(brick, 0.75));
          }
          g.rect(g.left, FENCE_TOP - 2, g.w, 2, mix(brick, horizonC, 0.35));
        }

        // ── the lawn ──
        const lawn = mix(hex('#0c120b'), L.sky[0]!, 0.35);
        g.vgrad([mix(lawn, hex('#18221a'), 0.5), lawn, shade(lawn, 0.6)], GROUND, g.bottom, GROUND);
        for (let i = 0; i < 500; i++) {
          const x = g.left + hash3(i, variant, 7) * g.w;
          const y = GROUND + hash3(i, variant, 8) * (g.bottom - GROUND);
          g.vline(x, y - 1 - (i % 2), y, mix(lawn, hex('#26321f'), 0.45));
        }
        if (L.weather === 'snow') for (let y = GROUND; y < g.bottom; y++) g.rectD(g.left, y, g.w, 1, hex('#7a8290'), 0.5 - (y - GROUND) * 0.003);
        for (let k = 0; k < 7; k++) g.ellipse(doorX + doorW / 2 + (k - 2) * 3, GROUND + 6 + k * 9, 5 + k, 1.5 + k * 0.4, mix(lawn, hex('#3a3a3a'), 0.45));

        // ── the shed ──
        const cladL = mix(clad, hex('#8a8a7a'), 0.07);
        for (let x = sx; x < sx + sw; x++) {
          const ry = Math.round(roofY(x));
          const k = (x - sx) % 5;
          const c = k === 0 ? shade(clad, 0.65) : k === 1 ? cladL : clad;
          g.rect(x, ry + 2, 1, GROUND - ry - 2, c);
        }
        for (let i = 0; i < 26; i++) {
          const x = sx + Math.floor(hash3(i, variant, 9) * sw);
          const y = wallTop + Math.floor(hash3(i, variant, 10) * (GROUND - wallTop));
          g.vline(x, y, y + 3, shade(clad, 0.78));
        }
        g.rect(sx, GROUND - 3, sw, 3, shade(clad, 0.6)); // damp along the bottom
        // the sky catches the shed's far edge
        g.vline(doorLeft ? sx + sw - 1 : sx, wallTop, GROUND - 1, mix(clad, horizonC, 0.35));
        // roof: felt or corrugated, with an overhang
        const roofC = hex('#121418');
        for (let x = sx - 4; x < sx + sw + 4; x++) {
          const ry = Math.round(roofY(x));
          g.rect(x, ry - 1, 1, 4, roofC);
          if (roof === 'curved' && x % 3 === 0) g.px(x, ry + 1, hex('#20242a'));
          g.px(x, ry - 1, mix(roofC, horizonC, 0.55));
        }
        // window frame (glass filled per frame)
        g.rect(winX - 2, winY - 2, winW + 4, winH + 4, shade(clad, 0.45));
        g.rect(winX - 3, winY + winH + 1, winW + 6, 2, shade(clad, 1.3)); // sill
        // the door opening, and the door swung open
        g.rect(doorX, GROUND - doorH, doorW, doorH, ink);
        const dSide = doorLeft ? -1 : 1;
        const dx0 = doorLeft ? doorX : doorX + doorW;
        g.poly([dx0, GROUND - doorH, dx0 + dSide * 7, GROUND - doorH - 2, dx0 + dSide * 7, GROUND + 2, dx0, GROUND], shade(clad, 0.8));
        g.vline(dx0 + dSide * 6, GROUND - 18, GROUND - 16, hex('#5a5a5a'));

        // ── the aerial ──
        const wire = hex('#5a5e66');
        const pole = hex('#2a2620');
        const ay = Math.round(roofY(aerialX));
        if (aerial === 'hanger') {
          g.vline(aerialX, ay - 32, ay, pole);
          coatHanger(g, aerialX, ay - 32, wire, 1.1);
          coatHanger(g, aerialX, ay - 23, wire, 0.75);
          g.line(aerialX + 1, ay - 28, aerialX + 1, ay, hex('#1a1a1a'));
          g.rect(aerialX - 1, ay - 4, 3, 2, hex('#4a4a4a')); // gaffer tape
          g.rect(aerialX - 1, ay - 14, 3, 1, hex('#4a4a4a'));
        } else if (aerial === 'longwire') {
          const tx = aerialX < 160 ? g.left - 4 : g.right + 4;
          g.vline(aerialX, ay - 18, ay, pole);
          for (let i = 0; i <= 60; i++) {
            const u = i / 60;
            g.px(aerialX + (tx - aerialX) * u, ay - 18 + (40 - ay + 18) * u + Math.sin(u * Math.PI) * 6, wire);
          }
          g.rect(aerialX - 1, ay - 20, 3, 2, hex('#a8a090')); // a yoghurt-pot insulator
        } else {
          g.vline(aerialX, ay - 36, ay, pole);
          g.hline(aerialX - 4, aerialX + 16, ay - 32, wire);
          for (let k = 0; k < 6; k++) g.vline(aerialX - 3 + k * 4, ay - 35 + (k === 0 ? -1 : 0), ay - 29 - (k === 0 ? -1 : 0), wire);
          g.rect(aerialX - 1, ay - 4, 3, 2, hex('#4a4a4a'));
        }

        // ── the call sign ──
        const sign = L.callsign;
        const scale = paintedWidth(sign, 2) + 6 < sw - 10 ? 2 : 1;
        const swd = paintedWidth(sign, scale) + 6;
        const sh = 5 * scale + 6;
        if (signAt === 'above') paintedSign(g, sign, Math.round(sx + (sw - swd) / 2), Math.round(roofY(sx + sw / 2)) + (roof === 'apex' ? 6 : 4), board, painted, variant, scale);
        else if (signAt === 'roof') paintedSign(g, sign, Math.round(sx + (sw - swd) / 2), Math.round(roofY(sx + sw / 2)) - sh - 2, board, painted, variant, scale);
        else {
          // leaning on the shed by the door, on the open side
          const lx = doorLeft ? sx - swd + 6 : sx + sw - 6;
          g.rect(lx + 2, GROUND - sh - 4, 2, sh + 4, shade(board, 0.7));
          paintedSign(g, sign, lx, GROUND - sh - 6, board, painted, variant, scale);
        }

        // ── the extension cable from the house, along the bottom of the fence ──
        const cableC = hex('#6a3a16');
        const fromLeft = !emptyLeft;
        for (let x = fromLeft ? g.left : sx + sw; x < (fromLeft ? sx : g.right); x++) {
          g.px(x, GROUND - 1 + Math.round(Math.sin(x * 0.07) * 1), cableC);
        }

        // ── props ──
        const busyL = Math.min(lookX, neighbourX) - 20;
        const free = (x: number, w: number) => (x + w < sx - 6 || x > sx + sw + 6) && Math.abs(x + w / 2 - lookX) > 22 && x + w < g.right + 30 && x > busyL - 400;
        if (props.barrow) {
          const bx = emptyLeft ? sx - 40 : sx + sw + 12;
          if (free(bx, 28)) {
            g.poly([bx, GROUND - 10, bx + 22, GROUND - 10, bx + 18, GROUND - 3, bx + 3, GROUND - 3], hex('#262c34'));
            g.hline(bx, bx + 22, GROUND - 10, hex('#3e464e'));
            g.disc(bx + 4, GROUND - 2, 2, ink);
            g.line(bx + 18, GROUND - 8, bx + 28, GROUND - 4, hex('#2a2620'));
            g.vline(bx + 16, GROUND - 3, GROUND, hex('#2a2620'));
          }
        }
        if (props.bike) {
          const bx = emptyLeft ? sx - 28 : sx + sw + 2;
          if (free(bx, 24)) {
            const c = hex('#2a303a');
            g.ring(bx + 4, GROUND - 5, 5, 5, c);
            g.ring(bx + 20, GROUND - 5, 5, 5, c);
            g.line(bx + 4, GROUND - 5, bx + 11, GROUND - 13, c);
            g.line(bx + 11, GROUND - 13, bx + 20, GROUND - 5, c);
            g.line(bx + 11, GROUND - 13, bx + 18, GROUND - 13, c);
            g.line(bx + 18, GROUND - 13, bx + 20, GROUND - 5, c);
            g.hline(bx + 9, bx + 12, GROUND - 15, c);
          }
        }
        if (props.bin) {
          const bx = emptyLeft ? sx - 16 : sx + sw + 4;
          if (free(bx, 12)) {
            g.rect(bx, GROUND - 16, 12, 16, hex('#18201e'));
            g.rect(bx - 1, GROUND - 17, 14, 2, hex('#202a28'));
            g.vline(bx + 3, GROUND - 14, GROUND - 2, hex('#121816'));
          }
        }
        if (props.chair) {
          const cx = emptyLeft ? lookX + 18 : lookX - 30;
          if (free(cx, 12)) {
            const c = hex('#26323e');
            g.line(cx, GROUND, cx + 10, GROUND - 10, c);
            g.line(cx + 10, GROUND, cx, GROUND - 10, c);
            g.rect(cx - 1, GROUND - 11, 12, 2, hex('#33262a'));
            g.line(cx + 10, GROUND - 10, cx + 12, GROUND - 22, c);
          }
        }
        if (props.gnomes)
          for (let k = 0; k < 3; k++) {
            const gx = (emptyLeft ? 30 : 262) + k * 8;
            if (free(gx, 6)) lookout(g, 'gnome', gx, GROUND + 5 + k * 2, k % 2 ? 1 : -1, 0, 0, hex('#2a2a2a'), mix(clad, horizonC, 0.4));
          }
        // the stepladder the lookout stands on
        if (look === 'ladder') {
          const c = hex('#3a3e44');
          g.line(lookX - 5, GROUND + 1, lookX - 2, FENCE_TOP + 10, c);
          g.line(lookX + 5, GROUND + 1, lookX + 2, FENCE_TOP + 10, c);
          for (let k = 0; k < 3; k++) g.hline(lookX - 4 + k, lookX + 4 - k, GROUND - 6 - k * 6, c);
        }

        vignette(g, 0.45, 160, 90);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 10;
        const awake = f.awake;

        // washing on the line, swaying
        if (props.washing) {
          const x0 = emptyLeft ? g.left + 14 : sx + sw + 12;
          const x1 = emptyLeft ? sx - 12 : g.right - 14;
          if (x1 - x0 > 44) {
            const y0 = FENCE_TOP - 4;
            g.vline(x0, y0, GROUND, hex('#2a2620'));
            g.vline(x1, y0, GROUND, hex('#2a2620'));
            for (let x = x0; x <= x1; x++) g.px(x, y0 + Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 4, hex('#3a3e44'));
            const wind = L.weather === 'wind' ? 2.5 : 0.8;
            for (let k = 0; k < 4; k++) {
              const u = (k + 0.7) / 4.6;
              const cx = x0 + (x1 - x0) * u;
              const cy = y0 + Math.sin(u * Math.PI) * 4;
              const sway = Math.round(Math.sin(t * (1.5 + k) + k) * wind * (f.reduced ? 0 : 1));
              const col = hex(['#333c4e', '#433636', '#36423a', '#423f3a'][k]!);
              g.poly([cx - 4, cy, cx + 4, cy, cx + 4 + sway, cy + 9, cx - 4 + sway, cy + 9], col);
            }
          }
        }

        // ── light state: on air, dozing, blackouts ──
        let power = 0.35 + 0.65 * awake;
        if (R(0) && ev > 2.2 && ev < 8) power = 0.03; // lights out until the van has gone
        if (R(3)) {
          if (ev > 1 && ev < 1.6) power *= Math.sin(ev * 40) > 0 || f.reduced ? 1 : 0.1;
          else if (ev >= 1.6 && ev < 6.5) power = 0;
          else if (ev >= 6.5) power = Math.min(1.25, power * (1 + 0.6 * (1 - smoothstep(6.5, 9, ev))));
        }
        const flick = f.reduced ? 1 : 0.94 + 0.06 * Math.sin(t * 23) * Math.sin(t * 7);
        const P = clamp(power * flick, 0, 1.3);
        const beat = f.pulse * 0.12 * awake;

        // the doorway: the studio's practical light, shelves of egg boxes, the desk
        const inside = mix(hex('#060504'), lit, 0.5 * P + beat);
        g.rect(doorX, GROUND - doorH, doorW, doorH, inside);
        eggBox(g, doorX + 1, GROUND - doorH + 2, doorW - 2, 14, shade(inside, 0.8), mix(inside, hex('#ffffff'), 0.15), shade(inside, 0.55), 3);
        g.rect(doorX, GROUND - 12, doorW, 12, shade(inside, 0.55)); // under the desk
        g.rect(doorX + 4, GROUND - 7, 6, 1, shade(inside, 0.25)); // a stool
        g.vline(doorX + 5, GROUND - 6, GROUND - 1, shade(inside, 0.25));
        g.vline(doorX + 8, GROUND - 6, GROUND - 1, shade(inside, 0.25));
        g.rect(doorX, GROUND - 14, doorW, 2, shade(inside, 0.35)); // the desk
        g.rect(doorX + 2, GROUND - 16, 5, 2, shade(inside, 0.3)); // a deck
        g.px(doorX + 4, GROUND - 17, shade(inside, 0.25));
        g.rect(doorX + doorW - 5, GROUND - 19, 3, 5, shade(inside, 0.3)); // a speaker
        if (P > 0.05) {
          g.poly([doorX, GROUND, doorX + doorW, GROUND, doorX + doorW + 16, g.bottom, doorX - 16, g.bottom], lit, 2, 0.1 * P);
          g.glow(doorX + doorW / 2, GROUND - 16, 30, lit, 0.14 * P, 4);
        }
        if (R(3) && ev > 2.2 && ev < 6.5) g.glow(doorX + 6 + Math.sin(ev * 3) * 3, GROUND - 18 + Math.cos(ev * 2) * 4, 5, hex('#fff2c0'), 0.6);

        // the window: egg boxes, the DJ nodding in front of them
        const wl = mix(hex('#050404'), lit, 0.42 * P + beat);
        g.rect(winX, winY, winW, winH, wl);
        eggBox(g, winX, winY, winW, winH, shade(wl, 0.78), mix(wl, hex('#ffffff'), 0.08), shade(wl, 0.6), 4);
        g.clip(winX, winY, winW, winH);
        const bob = f.reduced ? 0 : awake * (Math.sin(f.beat * Math.PI) * 0.5 + 0.5) * (0.3 + f.energy);
        const doze = 1 - awake;
        if (!(R(0) && ev > 2.2 && ev < 8)) djSilhouette(g, winX + winW / 2 + (doorLeft ? 4 : -4), winY + 3 + Math.round(doze * 4), hex('#0a0806'), mix(lit, hex('#ffffff'), 0.3), bob, variant % 3, doorLeft ? -1 : 1);
        g.noClip();
        g.vline(doorLeft ? winX + 6 : winX + winW - 7, winY, winY + winH - 1, shade(clad, 0.4));
        if (P > 0.05) g.glow(winX + winW / 2, winY + winH / 2, 20, lit, 0.12 * P, 4);
        // on-air bulb over the door
        const onAir = awake > 0.5 && P > 0.3 ? 1 : 0.12;
        g.rect(doorX + doorW / 2 - 1, GROUND - doorH - 4, 3, 2, mix(hex('#3a0a08'), hex('#ff3a2a'), onAir));
        g.glow(doorX + doorW / 2, GROUND - doorH - 3, 6, hex('#ff3a2a'), 0.35 * onAir);

        // string lights along the eaves
        if (lights) {
          const y0 = Math.round(roofY(sx)) + 3;
          const y1 = Math.round(roofY(sx + sw - 1)) + 3;
          if (roof === 'apex') {
            const ym = Math.round(roofY(sx + sw / 2)) + 3;
            stringLights(g, sx - 2, y0, sx + sw / 2, ym, 2, 5, lit, L.warm, P, t, hex('#1a1a1a'));
            stringLights(g, sx + sw / 2, ym, sx + sw + 2, y1, 2, 5, L.warm, lit, P, t, hex('#1a1a1a'));
          } else stringLights(g, sx - 2, y0, sx + sw + 2, y1, 3, 10, lit, L.warm, P, t, hex('#1a1a1a'));
        }

        // a blinking tip on the aerial (a bicycle light, naturally)
        const tipY = Math.round(roofY(aerialX)) - (aerial === 'yagi' ? 37 : aerial === 'hanger' ? 37 : 20);
        const blink = f.reduced ? 0.5 : (t % 1.4) < 0.25 ? 1 : 0;
        g.px(aerialX, tipY, mix(hex('#3a0a08'), hex('#ff4a3a'), blink * clamp(P)));
        if (blink * P > 0.2) g.glow(aerialX, tipY, 6, hex('#ff4a3a'), 0.4);

        // ── the neighbour (rare 1) ──
        if (R(1)) {
          const a = envelope(ev, 10, 0.6, 1.2);
          g.rect(neighbourX, 66, 9, 10, mix(hex('#1a1410'), L.warm, a * 0.7));
          if (a > 0.6) {
            const nod = f.reduced ? 0 : Math.round(Math.sin(f.beat * Math.PI) * 0.5 + 0.5);
            g.rect(neighbourX + 2, 70 + nod, 5, 6 - nod, hex('#120e0c'));
            g.rect(neighbourX + 3, 68 + nod, 3, 3, hex('#120e0c'));
          }
          g.glow(neighbourX + 4, 71, 9, L.warm, a * 0.22);
        }

        // ── the detector van (rare 0): its dish glides along above the fence ──
        let alert = 0;
        if (R(0)) {
          const p = ev / 10;
          const vx = g.left - 30 + p * (g.w + 60);
          const a = Math.cos(t * 2.4);
          const dw = Math.max(1, Math.abs(Math.round(a * 14)));
          g.rect(vx - 1, FENCE_TOP - 9, 2, 9, hex('#2a2e36'));
          g.rect(vx - Math.floor(dw / 2), FENCE_TOP - 15, dw, 6, hex('#3a404a'));
          g.hline(vx - Math.floor(dw / 2), vx + Math.floor(dw / 2), FENCE_TOP - 15, hex('#7a828e'));
          g.px(vx + (a > 0 ? 1 : -1) * Math.floor(dw / 4), FENCE_TOP - 12, hex('#8a929e'));
          g.rect(vx - 16, FENCE_TOP - 3, 32, 3, hex('#1c2028'));
          g.hline(vx - 16, vx + 15, FENCE_TOP - 3, hex('#3a404a'));
          const bl = f.reduced ? 0.5 : (t % 0.8) < 0.4 ? 1 : 0;
          g.px(vx - 12, FENCE_TOP - 4, mix(hex('#3a2a08'), hex('#ffb020'), bl));
          g.glow(vx - 12, FENCE_TOP - 4, 6, hex('#ffb020'), 0.4 * bl);
          g.glow(vx + 20, FENCE_TOP + 1, 26, hex('#fff2c0'), 0.12);
          alert = ev > 1.5 && ev < 8.5 ? 1 : 0;
        }

        // ── the fox (rare 2) ──
        if (R(2)) {
          const stop = ev > 3.5 && ev < 6.5;
          const p = ev < 3.5 ? ev / 3.5 : ev < 6.5 ? 1 : 1 + (ev - 6.5) / 3.5;
          const fx = Math.round(g.left - 10 + (doorX + doorW / 2 - g.left + 10) * p);
          const fy = GROUND + 5;
          const step = stop || f.reduced ? 0 : Math.round(Math.sin(t * 12));
          const fc = hex('#7a4220');
          g.rect(fx - 5, fy - 5, 9, 4, fc);
          g.rect(fx + 3, fy - 8, 4, 4, fc);
          g.px(fx + 7, fy - 6, fc);
          g.px(fx + 3, fy - 9, fc);
          g.px(fx + 6, fy - 9 - (stop && Math.sin(t * 3) > 0.5 ? 1 : 0), fc);
          g.vline(fx - 4 + step, fy - 1, fy, shade(fc, 0.6));
          g.vline(fx + 2 - step, fy - 1, fy, shade(fc, 0.6));
          g.line(fx - 5, fy - 4, fx - 10, fy - 3, fc);
          g.px(fx - 10, fy - 3, hex('#d8d0c0'));
          g.px(fx + 5, fy - 7, hex('#0a0a0a'));
          g.hline(fx - 5, fx + 6, fy - 5, mix(fc, lit, 0.3));
          g.rectA(fx - 5, fy, 12, 1, hex('#000000'), 0.4);
        }

        // ── the lookout ──
        const rim = mix(horizonC, hex('#a0a8b8'), 0.25);
        const body = hex('#101216');
        if (look === 'ladder') {
          // seen from behind, peering over the fence; turns and waves when something's coming
          const y = FENCE_TOP + 10;
          const bx = lookX;
          g.rect(bx - 2, y - 8, 2, 8, body);
          g.rect(bx + 1, y - 8, 2, 8, body);
          g.rect(bx - 4, y - 18, 9, 11, body);
          g.rect(bx - 2, y - 23, 5, 5, body);
          g.hline(bx - 2, bx + 2, y - 24, rim);
          g.px(bx - 3, y - 22, rim);
          g.px(bx + 3, y - 22, rim);
          g.hline(bx - 4, bx + 4, y - 18, mix(body, rim, 0.6));
          if (alert > 0.5) {
            const wave = f.reduced ? 0 : Math.sin(t * 10) > 0 ? 1 : 0;
            g.rect(bx + 2, y - 22, 1, 2, hex('#6a4a3c')); // a face, half turned
            g.vline(bx + 5 + wave, y - 27, y - 17, body);
            g.px(bx + 5 + wave, y - 28, hex('#6a4a3c'));
          } else {
            // elbows out: binoculars up
            g.rect(bx - 6, y - 19, 3, 2, body);
            g.rect(bx + 4, y - 19, 3, 2, body);
            if (awake < 0.4) g.text('z', bx + 6, y - 32, shade(rim, 0.8));
          }
        } else if (look === 'cat') {
          lookout(g, 'cat', lookX, FENCE_TOP, emptyLeft ? 1 : -1, t, alert, body, rim);
        } else {
          // the dog or the gnome keeps watch from the edge of the doorway light
          lookout(g, look, lookX, GROUND + 6, emptyLeft ? 1 : -1, t, alert, look === 'dog' ? hex('#241c16') : body, mix(rim, lit, 0.3));
        }

        // the fuse (rare 3): a spark at the cable reel
        if (R(3) && ev > 1.4 && ev < 1.9) {
          const cx = emptyLeft ? sx + sw + 6 : sx - 6;
          for (let k = 0; k < 6; k++) g.px(cx + (hash3(k, f.n, 1) - 0.5) * 8, GROUND - 2 - hash3(k, f.n, 2) * 6, hex('#ffe08a'));
          g.glow(cx, GROUND - 2, 8, hex('#ffd060'), f.reduced ? 0.2 : 0.6);
        }

        pirateWeather(g, L, t, fogs, GROUND);
      },
    };
  },
};

export default def;

// The Drowned Shanty Hour: a creaking ship's deck at night in fog. Lanterns swing as the
// ship rolls; a translucent crew stamps in time around an accordion player on a barrel;
// the sea beyond the rail glows faintly green.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep, stars } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { bakeFog, drawFog, flicker, vignette } from './lib/night';

const RAIL_Y = 100;
const DECK_Y = 126;
const MASTS = [96, 236];
const LANTERNS = [
  { x: 120, y: 44, len: 14 },
  { x: 214, y: 50, len: 12 },
];
const CREW = [
  { x: 74, h: 30, seed: 1 },
  { x: 112, h: 28, seed: 2 },
  { x: 204, h: 31, seed: 3 },
  { x: 244, h: 27, seed: 4 },
];
const PLAYER = { x: 160, y: DECK_Y };

const def: SceneDef = {
  id: 'ghost-ship',
  fps: 15,
  focusY: 84,
  rareEvents: 4,
  rareDuration: 10,
  create({ accent }) {
    const ink = hex('#030607');
    const sky = [hex('#020405'), hex('#040a0c'), hex('#081214'), hex('#0e1c1e')];
    const seaGlow = mix(accent, hex('#a8ffe0'), 0.25);
    const sea = [hex('#030809'), mix(hex('#06100f'), accent, 0.15), mix(hex('#0a1a18'), accent, 0.35)];
    const wood = [hex('#0a0806'), hex('#14100c'), hex('#1e1812'), hex('#2a2218')];
    const ghost = mix(accent, hex('#d8fff0'), 0.55);
    const lampC = hex('#ffc070');
    const fogC = mix(hex('#506a68'), accent, 0.2);
    let ship: Int32Array = new Int32Array(0);
    const fogA = bakeFog(56, 50, 31, { sx: 46, sy: 10, lo: 0.4, gain: 2, edge: 1 });
    const fogB = bakeFog(110, 70, 37, { sx: 60, sy: 14, lo: 0.36, gain: 1.8, edge: 0.7 });

    const crewman = (g: Gfx, x: number, foot: number, h: number, seed: number, t: number, stamp: number, a: number) => {
      const bob = Math.round(stamp * 2);
      const lean = Math.sin(t * 0.7 + seed) * 1.2;
      const hy = foot - h + bob;
      // body: a tapering column that thins into the deck
      for (let i = 0; i < h - 6; i++) {
        const u = i / (h - 6);
        const w = 3 + Math.sin(u * Math.PI * 0.9) * 2.5;
        g.rectAdd(x - w + lean * (1 - u), hy + 6 + i, w * 2, 1, ghost, a * (1 - u * 0.75) * 0.32);
      }
      // head, with a hat for some
      g.ellipseA(x + lean, hy + 2, 3, 3, ghost, a * 0.45);
      if (seed % 2) g.rectA(x + lean - 4, hy - 1, 9, 1, ghost, a * 0.5);
      g.pxA(x + lean - 1, hy + 2, ink, a * 0.6);
      g.pxA(x + lean + 1, hy + 2, ink, a * 0.6);
      // arms swinging
      const sw = Math.sin(t * 3 + seed) * 3 * a;
      g.lineA(x - 3 + lean, hy + 9, x - 6 + sw, hy + 16, ghost, a * 0.4);
      g.lineA(x + 3 + lean, hy + 9, x + 6 - sw, hy + 16, ghost, a * 0.4);
      g.glow(x, hy + 10, 14, ghost, 0.08 * a);
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, 84);
        stars(g, 0, g.left, g.top, g.right, 60, 0.12, hex('#c8e8e0'), 7, 0);
        g.glow(166, 26, 46, hex('#c8e8e0'), 0.1, 6);
        g.disc(166, 26, 6, hex('#a8c0bc'));
        g.disc(168, 25, 5, hex('#c8dcd8'));
        // Tattered sails, barely there: the sky shows through them.
        for (const mx of MASTS) {
          for (let y = 9; y < 46; y++)
            for (let x = mx - 42; x < mx + 42; x++) {
              const tear = hash3(x >> 2, y >> 3, mx) < 0.16 || (y > 34 && hash3(x, 1, mx) < 0.3 + (y - 34) * 0.07);
              if (tear) continue;
              const fold = Math.sin((x - mx) * 0.3) * 0.5 + 0.5;
              g.pxA(x, y, mix(hex('#3a4a44'), accent, 0.15), 0.18 + fold * 0.12);
            }
        }

        // The ship itself, baked into a layer drawn over the moving sea each frame.
        ship = g.layer();
        g.target(ship);
        // deck planks, running away from us toward the bow
        for (let y = RAIL_Y + 8; y < g.bottom; y++) {
          const z = 700 / (y - 70);
          for (let x = g.left; x < g.right; x++) {
            const u = ((x - 160) / (y - 70)) * 7;
            const plank = Math.floor(u);
            const seam = u - plank < 0.12 || ((z + hash3(plank, 2, 9) * 7) % 7) < 0.15;
            const n = hash3(plank, Math.floor(z / 7 + hash3(plank, 3)), 3);
            g.px(x, y, seam ? wood[0]! : n > 0.6 ? wood[2]! : wood[1]!);
          }
        }
        // the bulwark and rail
        g.rect(g.left, RAIL_Y, g.w, 8, wood[1]!);
        g.hline(g.left, g.right, RAIL_Y, wood[3]!);
        g.hline(g.left, g.right, RAIL_Y + 1, wood[2]!);
        for (let x = g.left - (g.left % 18); x < g.right; x += 18) g.rect(x, RAIL_Y + 2, 2, 6, wood[0]!);
        // masts, yards and rigging
        for (const mx of MASTS) {
          g.rect(mx - 3, g.top, 6, DECK_Y - g.top, wood[1]!);
          g.vline(mx - 3, g.top, DECK_Y, wood[0]!);
          g.vline(mx + 1, g.top, DECK_Y, wood[2]!);
          for (const yy of [6, 46]) {
            g.rect(mx - 46, yy, 92, 3, wood[1]!);
            g.hline(mx - 46, mx + 45, yy, wood[2]!);
          }
          for (const s of [-1, 1]) {
            g.lineA(mx, g.top, mx + s * 60, RAIL_Y, wood[2]!, 0.8);
            g.lineA(mx, 20, mx + s * 50, RAIL_Y, wood[2]!, 0.6);
            g.lineA(mx + s * 46, 8, mx + s * 40, RAIL_Y, wood[1]!, 0.6);
          }
        }
        // the barrel the player sits on, and a coil of rope
        g.rect(PLAYER.x - 7, DECK_Y - 12, 14, 12, wood[2]!);
        g.hline(PLAYER.x - 7, PLAYER.x + 6, DECK_Y - 10, wood[0]!);
        g.hline(PLAYER.x - 7, PLAYER.x + 6, DECK_Y - 4, wood[0]!);
        g.ellipse(PLAYER.x, DECK_Y - 12, 7, 2, wood[3]!);
        g.ellipse(52, DECK_Y + 6, 10, 3, wood[2]!);
        g.ellipse(52, DECK_Y + 5, 6, 2, wood[0]!);
        // ship's bell on a post (drawn per frame)
        g.rect(278, RAIL_Y - 24, 3, 24, wood[1]!);
        g.rect(270, RAIL_Y - 25, 14, 2, wood[2]!);
        g.target();
        vignette(g, 0.45, 160, 70, 230, 160);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // The sea, rolling: the horizon lifts and tilts against the ship.
        const roll = f.reduced ? 0 : Math.sin(t * 0.45) * 3;
        const tilt = f.reduced ? 0 : Math.sin(t * 0.45 + 0.8) * 0.02;
        for (let x = g.left; x < g.right; x++) {
          const h = Math.round(84 + roll + tilt * (x - 160));
          for (let y = h; y < RAIL_Y; y++) {
            const d = (y - h) / 18;
            const k = clamp(1 - d) * 0.7 + (hash3(x >> 1, y, Math.floor(t * 3)) < 0.04 ? 0.5 : 0);
            const c = k > 0.55 + bayer(x, y) * 0.3 ? sea[2]! : k > 0.2 + bayer(x, y) * 0.2 ? sea[1]! : sea[0]!;
            g.px(x, y, c);
          }
          g.pxAdd(x, h, seaGlow, 0.25);
        }
        g.glow(160, 96, 120, seaGlow, 0.07, 6);

        // Far fog, then the ship over it.
        drawFog(g, fogA, t * 2, fogC, 0.5);
        g.overlay(ship);

        // Lanterns, swinging with the roll.
        for (let i = 0; i < LANTERNS.length; i++) {
          const L = LANTERNS[i]!;
          const sw = f.reduced ? 0 : Math.sin(t * 0.9 + i * 1.3) * 0.35 + roll * 0.04;
          const lx = L.x + Math.sin(sw) * L.len;
          const ly = L.y + Math.cos(sw) * L.len;
          g.line(L.x, L.y, lx, ly - 3, wood[3]!);
          g.rect(lx - 2, ly - 3, 5, 6, wood[0]!);
          const fl = flicker(t, i + 7);
          g.rect(lx - 1, ly - 2, 3, 4, mix(lampC, hex('#fff0c8'), 0.3 * fl));
          g.glow(lx, ly, 30, lampC, 0.2 * fl * (0.6 + 0.4 * awake), 5);
        }

        // ── the crew, stamping in time ──
        const vanish = f.rare === 3 && ev < 10 ? envelope(ev, 10, 2.5, 2.5) : 0;
        const crewA = (0.5 + 0.5 * awake) * (1 - vanish);
        for (const c of CREW) {
          const stamp = f.reduced ? 0 : (f.beat + c.seed) % 2 === 0 ? f.pulse : 0;
          crewman(g, c.x, DECK_Y, c.h, c.seed, t, stamp, crewA);
        }
        // the accordion player, solid enough to sit down
        const { x, y } = PLAYER;
        const squeeze = f.reduced ? 3 : 3 + Math.sin(t * 2.2) * 2 * (0.3 + 0.7 * awake);
        const pa = 0.55 + 0.45 * awake;
        g.ellipseA(x, y - 22, 6, 8, ghost, 0.32 * pa);
        g.ellipseA(x, y - 33, 3, 3, ghost, 0.5 * pa);
        g.rectA(x - 5, y - 37, 11, 1, ghost, 0.5 * pa);
        g.rectA(x - 3, y - 39, 7, 2, ghost, 0.45 * pa);
        for (let i = 0; i < 5; i++) {
          const bx = x - 4 - squeeze - 3 + i * ((8 + squeeze * 2) / 4);
          g.rectA(bx, y - 24, 2, 8, i % 2 ? mix(accent, hex('#c84a3a'), 0.5) : hex('#e8e0d0'), 0.6 * pa);
        }
        g.rectA(x - 9 - squeeze, y - 25, 3, 10, hex('#3a2a20'), 0.8);
        g.rectA(x + 7 + squeeze, y - 25, 3, 10, hex('#3a2a20'), 0.8);
        g.lineA(x - 3, y - 14, x - 6, y - 4, ghost, 0.3 * pa);
        g.lineA(x + 3, y - 14, x + 6, y - 4, ghost, 0.3 * pa);
        g.glow(x, y - 24, 18, ghost, 0.1 * pa);

        // Rare: something large taps the rail in time, then thinks better of it.
        if (f.rare === 0 && ev < 10) {
          const up = envelope(ev, 10, 2, 2);
          const tap = f.reduced ? 0 : Math.max(0, Math.sin(ev * 5)) * 2;
          const bx = 286;
          const bx2 = 262;
          for (let i = 0; i < 44; i++) {
            const u = i / 44;
            const tx = bx2 + Math.sin(u * 3.4 + ev * 0.8) * 9 - u * u * 26;
            const ty = RAIL_Y + 40 - u * 90 * up + (u > 0.8 ? tap : 0);
            if (ty > RAIL_Y + 1) continue;
            const w = 6 - u * 4.5;
            g.ellipse(tx, ty, w + 1, 2, hex('#040a0a'));
            g.ellipse(tx, ty, w, 2, mix(hex('#0c1a18'), accent, 0.3));
            if (i % 4 === 0) g.px(tx + w - 1, ty + 1, mix(accent, hex('#c8fff0'), 0.35));
          }
          void bx;
        }
        // Rare: a ghostly gull settles on the yard and joins in.
        if (f.rare === 1 && ev < 10) {
          const p = clamp(ev / 3);
          const gx = 330 - p * (330 - (MASTS[1]! + 24));
          const gy = 6 - 2 - (1 - p) * 20 + Math.sin(p * 3) * 4;
          const flap = p < 1 && Math.floor(ev * 8) % 2 === 0;
          const bob = p >= 1 ? Math.round(f.pulse * 1.5) : 0;
          g.pxA(gx, gy - bob, ghost, 0.8);
          g.pxA(gx + 1, gy - bob, ghost, 0.8);
          g.pxA(gx - 2, gy - (flap ? 2 : 0) - bob, ghost, 0.6);
          g.pxA(gx + 3, gy - (flap ? 2 : 0) - bob, ghost, 0.6);
          g.pxA(gx - 1, gy - 1 - bob, ghost, 0.7);
        }
        // The ship's bell (rings itself in a rare moment).
        const ring = f.rare === 2 && ev < 10 ? envelope(ev, 10, 0.3, 3) : 0;
        const swing = ring * Math.sin(ev * 6) * 0.5;
        const bxx = 277 + Math.round(Math.sin(swing) * 4);
        g.line(277, RAIL_Y - 23, bxx, RAIL_Y - 18, wood[3]!);
        g.tri(bxx - 4, RAIL_Y - 12, bxx + 4, RAIL_Y - 12, bxx, RAIL_Y - 19, hex('#8a6a30'));
        g.rect(bxx - 4, RAIL_Y - 12, 9, 1, hex('#c8a050'));
        if (ring > 0.2 && !f.reduced)
          for (let k = 0; k < 3; k++) {
            const r = ((ev * 8 + k * 5) % 15) + 4;
            for (let i = 0; i < 16; i++) g.pxAdd(bxx + Math.cos(i * 0.4) * r, RAIL_Y - 14 + Math.sin(i * 0.4) * r * 0.6, hex('#e8d8a0'), 0.3 * (1 - r / 19) * ring);
          }

        // Near fog rolling over the deck.
        drawFog(g, fogB, -t * 3.2, fogC, 0.55 + vanish * 0.4);
        void shade;
        void smoothstep;
        void (0 as unknown as Color);
      },
    };
  },
};

export default def;

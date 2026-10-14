// The Harbour: where the relay ships go. A quiet harbour at the edge of space, its still dark
// water holding every light twice. Long piers of lamps step away toward the horizon; old relay
// ships lie moored along them, a porthole lit here and there. On the middle pier the
// harbourmaster's office keeps a warm window and a radio mast, and beside it one berth stands
// empty with its two lamps lit. The Nightjar glides in, slowly, and comes to rest there.
// Rare events: the harbourmaster walks out along the pier with a lantern, and back; an old
// relay ship on the far pier slips its moorings and climbs away into the dark; a falling star
// draws a line across the sky and the water.

import { hex, mix, shade } from '../kit/color';
import { clamp, smoothstep, steam } from '../kit/fx';
import type { Gfx } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { vignette } from './lib/night';

const HZN = 70;
const FAR = { y: 82, s: 0.6 }; // far pier deck and scale
const MID = { y: 122, s: 1.35 };
const NEAR = { y: 176, s: 2 };
const OFFICE = { x: 104, y: 122 };
const BERTH = { x: 196, l: 158, r: 236 };
const ARRIVE = 55; // seconds for the Nightjar to come in

const def: SceneDef = {
  id: 'harbour',
  fps: 15,
  focusX: 165,
  focusY: 92,
  rareEvents: 3,
  rareDuration: 16,
  grade: { temperature: 0.1, contrast: 1.12, saturation: 0.82, bloom: 0.85, threshold: 0.6, vignette: 0.34, shadows: '#04050c' },
  create({ accent }) {
    const ink = hex('#03040a');
    const sky = [hex('#020309'), hex('#060a1c'), hex('#0e1430'), hex('#1a1f3e')];
    const sea = [hex('#1a1a32'), hex('#0e1024'), hex('#070914'), hex('#03050c')];
    const lamp = mix(accent, hex('#ffcf8a'), 0.5);
    const lampHot = mix(accent, hex('#fff6e8'), 0.6);
    const hull = hex('#0b0d16');
    const hullL = hex('#262c40');
    const deck = hex('#2a2420');
    const amber = hex('#ffb648');
    const red = hex('#ff5a4a');

    /** Repaint the flat hull colour in a box as plating catching the lamps: lighter up top. */
    const plate = (g: Gfx, x0: number, y0: number, x1: number, y1: number, top: number, bot: number) => {
      for (let y = Math.floor(y0); y <= y1; y++) {
        const u = (y - y0) / Math.max(1, y1 - y0);
        for (let x = Math.floor(x0); x <= x1; x++) {
          if (g.get(x, y) !== hull) continue;
          const v = u + (hash3(x, y, 8) - 0.5) * 0.25 + (Math.floor(x / 6) % 2) * 0.06;
          g.px(x, y, mix(top, bot, clamp(v)));
        }
      }
    };
    const plateTop = hex('#3a4058');
    const plateBot = hex('#1c2132');

    /** An old relay ship, side on, waterline at y. Static, so it goes in the background. */
    const relayShip = (g: Gfx, x: number, y: number, s: number, dir: 1 | -1, seed: number, lit: number) => {
      const L = Math.round(44 * s);
      const H = Math.max(2, Math.round(7 * s));
      const x0 = x - L / 2;
      // hull: a long low body with a raked bow
      g.poly([x0, y - H, x0 + L - 6 * s, y - H, x0 + L, y - H * 0.4, x0 + L - 4 * s, y, x0 + 3 * s, y], hull);
      if (dir < 0) {
        // flip by redrawing mirrored (cheap for silhouettes)
        g.poly([x0 + L, y - H, x0 + 6 * s, y - H, x0, y - H * 0.4, x0 + 4 * s, y, x0 + L - 3 * s, y], hull);
      }
      g.hline(x0 + 2 * s, x0 + L - 4 * s, y - H, mix(hullL, lamp, 0.4));
      g.hline(x0 + 3 * s, x0 + L - 5 * s, y - H + 1, mix(hull, hullL, 0.6));
      // superstructure, a mast, a dish
      const cx = x + dir * -6 * s;
      g.rect(cx - 7 * s, y - H - 5 * s, 14 * s, 5 * s, hull);
      g.hline(cx - 7 * s, cx + 7 * s, y - H - 5 * s, mix(hullL, lamp, 0.3));
      g.vline(cx + dir * 4 * s, y - H - 16 * s, y - H - 5 * s, hullL);
      g.ellipse(cx - dir * 3 * s, y - H - 8 * s, 3 * s, 1.5 * s, hullL);
      g.line(cx - dir * 3 * s, y - H - 8 * s, cx - dir * 1 * s, y - H - 11 * s, hullL);
      // a porthole or two still lit
      for (let i = 0; i < 6; i++) {
        if (hash3(i, seed, 3) > lit) continue;
        const px = x0 + (8 + i * 6) * s;
        g.px(px, y - H * 0.55, mix(hex('#3a2a18'), lamp, 0.7));
      }
      // a mast light
      g.px(cx + dir * 4 * s, y - H - 16 * s, mix(hex('#3a1a10'), red, 0.5));
      plate(g, x0 - 1, y - H - 6 * s, x0 + L + 1, y - H, mix(plateTop, sea[3]!, 1 - s * 0.6), mix(plateBot, sea[3]!, 0.2));
      plate(g, x0 - 1, y - H, x0 + L + 1, y, mix(plateTop, sea[3]!, 1.1 - s * 0.6), mix(plateBot, sea[3]!, 0.5));
    };

    /** A pier: a deck of light on pilings, lamp posts along it. */
    const pier = (g: Gfx, y: number, s: number, x0: number, x1: number, seed: number) => {
      const t = Math.max(1, Math.round(2 * s));
      g.rect(x0, y, x1 - x0, t, deck);
      g.hline(x0, x1, y, mix(deck, lamp, 0.45)); // the deck's lit edge
      g.rect(x0, y + t, x1 - x0, Math.max(1, Math.round(1.5 * s)), shade(deck, 0.4));
      const gap = 12 * s;
      for (let x = x0 + 2; x < x1; x += gap) g.vline(x, y + t, y + t + Math.round(4 * s), hex('#100e10'));
      const step = 40 * s;
      for (let x = x0 + step / 2 + hash3(seed, 1) * step * 0.5; x < x1; x += step) {
        g.vline(x, y - Math.round(8 * s), y - 1, hex('#18161a'));
        g.px(x, y - Math.round(8 * s) - 1, lampHot);
      }
    };
    const lampXs = (y: number, s: number, x0: number, x1: number, seed: number) => {
      const out: [number, number, number][] = [];
      const step = 40 * s;
      for (let x = x0 + step / 2 + hash3(seed, 1) * step * 0.5; x < x1; x += step) out.push([x, y - Math.round(8 * s) - 1, s]);
      return out;
    };
    let lamps: [number, number, number][] = [];

    /** The Nightjar, side on, facing left: a long cabin viewport, a dish, two engines. */
    const nightjar = (g: Gfx, x: number, y: number, s: number, cabin: number, engines: number) => {
      const L = 48 * s;
      const x0 = x - L / 2;
      const H = 8 * s;
      g.poly([x0 + 6 * s, y - H, x0 + L - 2 * s, y - H, x0 + L, y - H * 0.3, x0 + L - 3 * s, y, x0 + 4 * s, y, x0, y - H * 0.5], hull);
      g.hline(x0 + 6 * s, x0 + L - 3 * s, y - H, mix(hullL, lamp, 0.45));
      g.hline(x0 + 4 * s, x0 + L - 3 * s, y - H * 0.35, mix(hull, hullL, 0.8)); // a sheer line along the hull
      // the cabin up front: a raised block with the long amber viewport
      g.poly([x0 + 4 * s, y - H, x0 + 9 * s, y - H - 6 * s, x0 + 24 * s, y - H - 6 * s, x0 + 26 * s, y - H], hull);
      g.hline(x0 + 9 * s, x0 + 24 * s, y - H - 6 * s, hullL);
      if (s > 0.25) g.rect(x0 + 9 * s, y - H - 4 * s, 14 * s, Math.max(1, 2 * s), mix(hex('#2a1e10'), amber, cabin));
      else g.px(x0 + 12 * s, y - H - 3 * s, mix(hex('#2a1e10'), amber, cabin));
      // dish and mast
      g.vline(x0 + 30 * s, y - H - 10 * s, y - H, hullL);
      g.ellipse(x0 + 34 * s, y - H - 9 * s, 4 * s, 2 * s, hullL);
      g.line(x0 + 34 * s, y - H - 9 * s, x0 + 36 * s, y - H - 12 * s, hullL);
      // engines at the stern
      for (const dy of [-H * 0.75, -H * 0.3]) {
        g.rect(x0 + L - 1, y + dy - 1, 3 * s, 2 * s, hullL);
        if (engines > 0.02) g.glow(x0 + L + 2 * s, y + dy, 6 * s, hex('#8ab8ff'), engines * 0.6, 4);
      }
      if (s > 0.5) plate(g, x0 - 1, y - H - 7 * s, x0 + L + 1, y, mix(plateTop, lamp, 0.12), plateBot);
      g.glow(x0 + 16 * s, y - H - 3 * s, 10 * s, amber, 0.18 * cabin, 4);
      // nav lights: red to port (the near side, facing left)
      g.px(x0 + 2 * s, y - H * 0.6, red);
      g.px(x0 + 30 * s, y - H - 10 * s, mix(hex('#401010'), red, 0.8));
    };

    /** Where the Nightjar is at scene time t: far and high to start, at the berth by ARRIVE. */
    const shipAt = (t: number) => {
      const p = smoothstep(0, 1, clamp(t / ARRIVE)) ** 0.8;
      const e = 1 - (1 - p) ** 2.2;
      return {
        x: 330 + (BERTH.x - 330) * e,
        y: 30 + (MID.y + 8 - 30) * e,
        s: 0.22 + (1.45 - 0.22) * e,
        engines: 1 - smoothstep(0.85, 1, p),
        p,
      };
    };

    return {
      background(g) {
        // ── sky: a dim nebula over the horizon, stars ──
        g.vgrad(sky, g.top, HZN);
        for (let y = g.top; y < HZN; y++)
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / 60, y / 30, 71, 4);
            const v = clamp((n - 0.42) * 2.2) * clamp((y - g.top + 60) / 120);
            if (v > 0.02) g.pxA(x, y, mix(hex('#3a2848'), hex('#2a3a5a'), fbm(x / 20, y / 20, 3, 2)), v * 0.45);
            if (hash3(x, y, 51) < 0.006) g.pxA(x, y, hex('#d8dcff'), (0.3 + 0.7 * hash3(x, y, 52)) * clamp((HZN - 2 - y) / 30));
          }
        // a faint band of light low on the horizon (the way home)
        for (let y = HZN - 26; y < HZN; y++) g.rectA(g.left, y, g.w, 1, mix(hex('#3a2c48'), accent, 0.25), ((y - HZN + 26) / 26) ** 2 * 0.55);
        g.glow(220, HZN, 90, mix(hex('#5a3a50'), accent, 0.4), 0.18, 6);

        // ── the still water, holding the sky ──
        g.vgrad(sea, HZN, HZN + 110, HZN);
        // the horizon's glow, held in the water just below it
        for (let y = HZN; y < HZN + 14; y++) g.rectA(g.left, y, g.w, 1, mix(hex('#2a2240'), accent, 0.2), (1 - (y - HZN) / 14) ** 2 * 0.4);
        for (let y = HZN + 1; y < g.bottom; y++) {
          const d = (y - HZN) / 100;
          if ((y - HZN) % (1 + Math.floor(d * 5))) continue;
          for (let x = g.left; x < g.right; x++) {
            const n = fbm(x / (24 + d * 40), y / (2 + d * 6), 17, 3);
            if (n > 0.62) g.pxA(x, y, hex('#1a2040'), clamp((n - 0.62) * 4) * 0.5);
          }
        }
        // the sky's stars, faintly, in the water
        for (let i = 0; i < 70; i++) {
          const x = g.left + hash3(i, 61) * g.w;
          const y = HZN + 4 + hash3(i, 62) * 60;
          g.pxA(x, y, hex('#9aa0c8'), 0.15 + 0.2 * hash3(i, 63));
        }

        // ── the far pier, its ships tiny ──
        pier(g, FAR.y, FAR.s, g.left, 300, 1);
        for (const [x, lit] of [
          [30, 0.3],
          [96, 0.2],
          [150, 0.4],
          [214, 0.3],
          [282, 0.25],
        ] as const)
          relayShip(g, x, FAR.y + 2, FAR.s, x > 160 ? -1 : 1, x, lit);

        // ── the beacon at the far pier's end: they've left a light on ──
        {
          const bx = 238;
          const top = FAR.y - 30;
          g.poly([bx - 4, FAR.y, bx + 4, FAR.y, bx + 2, top, bx - 2, top], hex('#1a1820'));
          g.vline(bx - 3, top + 4, FAR.y - 1, hex('#2a2632'));
          g.rect(bx - 3, top - 5, 7, 5, hex('#2a2228'));
          g.poly([bx - 4, top - 5, bx + 4, top - 5, bx, top - 9], hex('#1a1820'));
          g.rect(bx - 2, top - 4, 5, 3, lampHot);
          g.glow(bx, top - 3, 36, lamp, 0.22, 6);
          g.glow(bx, top - 3, 9, lampHot, 0.5, 4);
          // its long reflection, broken by the water
          for (let y = FAR.y + 3; y < MID.y + 40; y++) {
            const k = 1 - (y - FAR.y) / (MID.y + 40 - FAR.y);
            const w = 1 + (y - FAR.y) * 0.08;
            if (hash3(y, 7, 3) < 0.75) g.rectA(bx - w / 2 + (hash3(y, 8) - 0.5) * 3, y, w, 1, lamp, 0.3 * k);
          }
        }

        // ── the middle pier: moored ships, the office, the empty berth ──
        pier(g, MID.y, MID.s, g.left, 300, 2);
        relayShip(g, 34, MID.y + 7, 1.4, 1, 7, 0.45);
        relayShip(g, 288, MID.y + 7, 1.3, -1, 9, 0.35);
        // the harbourmaster's office: a hut with a pitched roof, a warm window, a mast
        {
          const { x, y } = OFFICE;
          g.rect(x - 14, y - 18, 28, 18, hex('#1a1614'));
          g.poly([x - 17, y - 18, x + 17, y - 18, x + 10, y - 26, x - 10, y - 26], hex('#14100e'));
          g.hline(x - 17, x + 17, y - 18, hex('#2a221c'));
          g.hline(x - 10, x + 10, y - 26, mix(hex('#2a221c'), lamp, 0.3));
          g.rect(x - 2, y - 11, 6, 11, hex('#0e0b0a')); // door
          g.rect(x - 11, y - 14, 7, 6, hex('#2a1a0c')); // window (lit per frame)
          g.vline(x - 8, y - 14, y - 9, hex('#1a1614'));
          g.rect(x + 8, y - 30, 3, 5, hex('#1a1614')); // chimney
          // the mast: a lattice tower with a dish
          for (let k = 0; k < 38; k += 2) {
            g.px(x - 20 - (k > 30 ? 0 : 1), y - 18 - k, hex('#2a2a32'));
            g.px(x - 18 + (k > 30 ? 0 : 1), y - 18 - k, hex('#2a2a32'));
            if (k % 6 === 0) g.line(x - 21, y - 18 - k, x - 17, y - 20 - k, hex('#1e1e26'));
          }
          g.ellipse(x - 15, y - 40, 3, 2, hex('#2a2a32'));
          // a lamp over the door
          g.px(x + 1, y - 13, lampHot);
        }
        // the empty berth's two lamps, a little brighter than the rest
        for (const bx of [BERTH.l, BERTH.r]) {
          g.vline(bx, MID.y - 11, MID.y - 1, hex('#201c1e'));
          g.rect(bx - 1, MID.y - 13, 3, 2, lampHot);
          g.rect(bx - 1, MID.y - 2, 3, 2, hex('#2a2422')); // bollard
        }

        // ── the near pier (deep in the foreground, mostly for tall views) ──
        pier(g, NEAR.y, NEAR.s, g.left, 150, 3);
        relayShip(g, 24, NEAR.y + 9, 1.7, 1, 13, 0.15);

        lamps = [
          ...lampXs(FAR.y, FAR.s, g.left, 300, 1),
          ...lampXs(MID.y, MID.s, g.left, 300, 2),
          ...lampXs(NEAR.y, NEAR.s, g.left, 150, 3),
          [BERTH.l, MID.y - 12, 1.2],
          [BERTH.r, MID.y - 12, 1.2],
          [OFFICE.x + 1, OFFICE.y - 13, 0.8],
        ];
        // lamps glow and stretch down into the water
        for (const [x, y, s] of lamps) {
          g.glow(x, y, 4 * s + 1, lamp, 0.28, 4);
          const deckY = y + Math.round(9 * s);
          for (let k = 0; k < 16 * s; k++) {
            const yy = deckY + Math.round(5 * s) + k;
            if (hash3(Math.round(x), yy, 4) < 0.85 - k / (20 * s)) g.pxA(x + Math.round((hash3(yy, 5) - 0.5) * 1.6), yy, lamp, 0.3 * (1 - k / (16 * s)));
          }
        }

        g.lighting(0.75);
        g.light(BERTH.x, MID.y - 6, 50, 0.3, 20);
        g.light(OFFICE.x, OFFICE.y - 12, 40, 0.3, 24);
        vignette(g, 0.4, 165, 90, 250, 200);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 16;
        const live = 0.6 + 0.4 * f.awake;

        // lamplight shimmering on the water
        if (!f.reduced)
          for (let i = 0; i < lamps.length; i++) {
            const [x, y, s] = lamps[i]!;
            const deckY = y + Math.round(9 * s) + Math.round(5 * s);
            const k = Math.floor((t * 2 + i * 0.37) % 4);
            g.pxAdd(x + (k - 1.5), deckY + 2 + k * 3 * s, lamp, 0.25);
          }

        // the office window, warm; a little smoke from the stove
        {
          const { x, y } = OFFICE;
          g.rect(x - 11, y - 14, 7, 6, mix(hex('#2a1a0c'), lamp, 0.8 * live));
          g.vline(x - 8, y - 14, y - 9, hex('#1a1614'));
          g.hline(x - 11, x - 5, y - 11, hex('#1a1614'));
          g.glow(x - 8, y - 11, 14, lamp, 0.25 * live, 5);
          steam(g, t, x + 9, y - 31, hex('#5a5868'), 6, 16, 3, 0.35, 0.18, 2);
          // the mast light: a slow red breath
          const b = f.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.1);
          g.px(x - 19, y - 57, mix(hex('#401010'), red, b));
          g.glow(x - 19, y - 57, 5, red, 0.2 * b, 3);
          g.vline(x - 19, y - 56, y - 54, hex('#2a2a32'));
        }

        // a relay ship leaving the far pier (rare 1)
        if (R(1)) {
          const p = smoothstep(1, 15, ev);
          const x = 150 + p * 120;
          const y = FAR.y + 2 - p * p * 50;
          g.clip(g.left, g.top, g.w, FAR.y + 2 - g.top);
          g.rect(x - 9, y - 3, 18, 3, hull);
          g.rect(x - 4, y - 5, 6, 2, hull);
          g.px(x - 6, y - 2, lamp);
          g.px(x + 1, y - 2, lamp);
          g.noClip();
          g.glow(x + 10, y - 1, 4, hex('#8ab8ff'), 0.5 * smoothstep(1, 4, ev), 3);
          // its old place: a gap in the line of moored hulls
          g.rect(144, FAR.y - 3, 14, 4, sea[0]!);
          g.hline(144, 157, FAR.y, mix(deck, lamp, 0.45));
        }

        // a falling star, and its twin in the water (rare 2)
        if (R(2) && ev < 3) {
          const p = ev / 1.6;
          if (p < 1) {
            const x = 60 + p * 90;
            const y = 18 + p * 30;
            for (let k = 0; k < 10; k++) {
              g.pxAdd(x - k * 2.4, y - k * 0.8, hex('#e8eeff'), (1 - k / 10) * 0.8 * (1 - p * 0.5));
              g.pxAdd(x - k * 2.4, 2 * HZN - y + k * 0.8 + 6, hex('#e8eeff'), (1 - k / 10) * 0.25);
            }
          }
        }

        // ── the Nightjar coming home ──
        {
          const S = shipAt(t);
          const x = Math.round(S.x);
          const y = Math.round(S.y);
          const cabin = 0.85 * live;
          nightjar(g, x, y, S.s, cabin, S.engines * live);
          // its reflection: the hull and cabin light, broken by the water
          if (S.p > 0.55) {
            const k = smoothstep(0.55, 0.95, S.p);
            const w = 48 * S.s;
            for (let i = 0; i < 6; i++) {
              const yy = y + 2 + i * 2;
              const wob = f.reduced ? 0 : Math.round(Math.sin(t * 2 + i) * 1);
              g.rectA(x - w / 2 + 4 + wob, yy, w - 8, 1, ink, 0.4 * k * (1 - i / 6));
            }
            g.rectA(x - w / 2 + 9 * S.s, y + 6, 14 * S.s, 1, amber, 0.25 * k);
            g.rectA(x - w / 2 + 11 * S.s, y + 9, 10 * S.s, 1, amber, 0.12 * k);
          }
          // moored: two lines out to the bollards
          if (S.p >= 1) {
            g.line(x - 32, y - 6, BERTH.l, MID.y - 1, hex('#4a4038'));
            g.line(x + 34, y - 6, BERTH.r, MID.y - 1, hex('#4a4038'));
          }
        }

        // the harbourmaster walks out with a lantern (rare 0)
        if (R(0)) {
          const out = smoothstep(1, 6, ev) * (1 - smoothstep(10, 15, ev));
          const x = Math.round(OFFICE.x + 6 + out * (BERTH.l - 6 - OFFICE.x - 6));
          const y = MID.y;
          const step = f.reduced ? 0 : Math.round(Math.sin(t * 6)) * (out > 0.02 && out < 0.98 ? 1 : 0);
          g.rect(x - 2, y - 11, 4, 7, hex('#0c0a0c'));
          g.disc(x, y - 13, 2, hex('#0c0a0c'));
          g.hline(x - 3, x + 3, y - 15, hex('#0c0a0c')); // a cap
          g.vline(x - 1, y - 4, y - 1, hex('#0c0a0c'));
          g.vline(x + 1 + step, y - 4, y - 1, hex('#0c0a0c'));
          g.px(x + 3, y - 7, lampHot);
          g.glow(x + 3, y - 7, 10, lamp, 0.4, 4);
          g.pxA(x + 3, y + 8, lamp, 0.4);
        }
      },
    };
  },
};

export default def;

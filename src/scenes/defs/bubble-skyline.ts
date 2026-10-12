// Bubble Economy FM: a glittering night skyline from a high-rise balcony in a city where
// it is always Friday in 1986. A convertible glides along the elevated highway; neon
// blinks; a cassette deck turns on the balcony table beside a cocktail with an umbrella.

import { hex, mix, shade } from '../kit/color';
import { clamp, envelope, smoothstep, stars } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { hash3 } from '../kit/rng';
import { frameRect } from '../kit/shapes';
import type { SceneDef } from '../types';
import { haze, vignette } from './lib/night';

const HORIZON = 98;
const WATER_END = 116;
const ROAD_Y = 120;
const RAIL_Y = 130;
const TABLE = { x: 218, y: 129 };
const MOON = { x: 98, y: 36, r: 9 };
const HEART_TOWER = { x: 170, w: 20, top: 40 };

interface Tower {
  x: number;
  w: number;
  top: number;
  layer: number;
  seed: number;
}

const def: SceneDef = {
  id: 'bubble-skyline',
  fps: 15,
  focusY: 92,
  rareEvents: 4,
  rareDuration: 12,
  create({ accent }) {
    const ink = hex('#07050c');
    const sky = [hex('#05040c'), hex('#0a0818'), hex('#150e2a'), hex('#2a163c'), hex('#4c2048'), hex('#6a2a50')];
    const pink = accent;
    const pinkD = shade(accent, 0.45);
    const cyan = hex('#5ad8e6');
    const winW = hex('#ffe6c4');
    const winP = mix(accent, hex('#ffd8e8'), 0.5);
    const layerC = [hex('#22163a'), hex('#150e28'), hex('#0a0714')];
    const chrome = hex('#9a90b0');
    const sodium = hex('#ffb060');

    const towers: Tower[] = [];
    for (let layer = 0; layer < 3; layer++) {
      let x = -50 + layer * 7;
      let i = 0;
      while (x < 380) {
        const w = 10 + Math.floor(hash3(i, layer, 1) * (14 + layer * 4));
        const tall = hash3(i, layer, 2);
        const top = HORIZON - 14 - Math.floor(tall * tall * (52 - layer * 8)) - (layer === 0 ? 8 : 0);
        towers.push({ x, w, top, layer, seed: i * 7 + layer });
        x += w + Math.floor(hash3(i, layer, 3) * 6) - 1;
        i++;
      }
    }
    // The heart tower stands in front, centred.
    towers.push({ x: HEART_TOWER.x, w: HEART_TOWER.w, top: HEART_TOWER.top, layer: 2, seed: 999 });

    const reel = (g: Gfx, x: number, y: number, a: number) => {
      g.disc(x, y, 3, hex('#2a2430'));
      g.disc(x, y, 1, hex('#d8d0e0'));
      for (let k = 0; k < 3; k++) {
        const aa = a + (k * Math.PI * 2) / 3;
        g.px(x + Math.round(Math.cos(aa) * 2), y + Math.round(Math.sin(aa) * 2), hex('#b8b0c8'));
      }
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, HORIZON);
        stars(g, 0, g.left, g.top, g.right, 60, 0.14, hex('#e8d8f0'), 5, 0);
        // City glow on the low sky.
        g.glow(160, HORIZON + 10, 190, mix(pink, hex('#6a3a8a'), 0.4), 0.2, 6);
        // The moon.
        g.glow(MOON.x, MOON.y, 30, hex('#f8e0f0'), 0.12, 5);
        g.ball(MOON.x, MOON.y, MOON.r, MOON.r, [hex('#b098b0'), hex('#dcc8d8'), hex('#f4e8f0'), hex('#fff8fa')], -0.4, -0.5, 0.55);
        g.disc(MOON.x + 3, MOON.y + 2, 1, hex('#ccb4c8'));
        g.px(MOON.x - 3, MOON.y - 2, hex('#dcc8d8'));

        // Towers, far to near; each layer sinks into the city haze behind the next.
        for (let layer = 0; layer < 3; layer++) {
          for (const T of towers) {
            if (T.layer !== layer) continue;
            const c = layerC[T.layer]!;
            g.rect(T.x, T.top, T.w, HORIZON - T.top, c);
            if (hash3(T.seed, 4) > 0.6) g.rect(T.x + 2, T.top - 3, T.w - 4, 3, c);
            if (hash3(T.seed, 5) > 0.7) g.vline(T.x + Math.floor(T.w / 2), T.top - 8, T.top, c);
            g.vline(T.x + T.w - 1, T.top, HORIZON, mix(c, pink, 0.1 + T.layer * 0.06));
            if (T.seed === 999) continue;
            const lit = 0.12 + T.layer * 0.1;
            for (let y = T.top + 3; y < HORIZON - 2; y += 3)
              for (let x = T.x + 2; x < T.x + T.w - 2; x += 2) {
                const h = hash3(x, y, T.seed);
                if (h < lit) g.px(x, y, mix(h < lit * 0.2 ? winP : winW, c, 0.25 + (2 - T.layer) * 0.25 + hash3(x, y, 77) * 0.2));
              }
          }
          if (layer === 1) {
            // Hero towers: a stepped crown and a needle, trimmed in neon.
            const hx = 138;
            g.rect(hx, 34, 22, HORIZON - 34, layerC[1]!);
            g.rect(hx + 3, 28, 16, 6, layerC[1]!);
            g.rect(hx + 6, 22, 10, 6, layerC[1]!);
            g.rect(hx + 9, 14, 4, 8, layerC[1]!);
            g.hline(hx, hx + 21, 34, mix(layerC[1]!, pink, 0.6));
            g.hline(hx + 3, hx + 18, 28, mix(layerC[1]!, pink, 0.5));
            g.hline(hx + 6, hx + 15, 22, mix(layerC[1]!, pink, 0.4));
            for (let y = 38; y < HORIZON - 2; y += 3)
              for (let x = hx + 2; x < hx + 20; x += 2) if (hash3(x, y, 5) < 0.3) g.px(x, y, mix(winW, layerC[1]!, 0.45 + hash3(x, y, 6) * 0.3));
            const nx = 240;
            g.rect(nx, 44, 12, HORIZON - 44, layerC[1]!);
            g.tri(nx, 44, nx + 12, 44, nx + 6, 30, layerC[1]!);
            g.vline(nx + 6, 16, 30, layerC[1]!);
            for (let y = 48; y < HORIZON - 2; y += 3)
              for (let x = nx + 2; x < nx + 10; x += 2) if (hash3(x, y, 8) < 0.35) g.px(x, y, mix(winW, layerC[1]!, 0.45));
          }
          if (layer < 2) haze(g, 30, HORIZON, mix(hex('#3a2048'), pink, 0.12), 0.02, 0.2 - layer * 0.06);
        }

        // Shoreline lights: a dense glittering string along the water's edge.
        for (let x = g.left; x < g.right; x++) {
          const h = hash3(x, 3, 41);
          if (h < 0.45) g.px(x, HORIZON - 1 - (h < 0.1 ? 1 : 0), mix(h < 0.08 ? winP : winW, layerC[2]!, 0.2 + h));
        }
        // The bay: mirrors everything above it, broken into vertical streaks.
        for (let y = HORIZON; y < WATER_END; y++) {
          const d = y - HORIZON;
          const fade = 1 - d / (WATER_END - HORIZON + 6);
          for (let x = g.left; x < g.right; x++) {
            const wob = Math.round(Math.sin(y * 1.9 + x * 0.07) * 1.2);
            const sy = HORIZON - 1 - Math.floor(d * 1.6) - (hash3(x, y, 3) < 0.3 ? 1 : 0);
            const src = g.get(x + wob, Math.max(g.top, sy));
            const l = (src & 255) * 0.3 + ((src >>> 8) & 255) * 0.5 + ((src >>> 16) & 255) * 0.2;
            const k = (l > 90 ? 0.95 : 0.55) * fade * (0.55 + 0.45 * bayer(x, y));
            g.px(x, y, mix(hex('#07050e'), src, k));
          }
        }
        g.hline(g.left, g.right, HORIZON, mix(hex('#1a1230'), pink, 0.25));

        // Far shore and the elevated highway on its pillars.
        for (let x = g.left; x < g.right; x++) g.vline(x, WATER_END, RAIL_Y + 20, hex('#0a0812'));
        for (let x = g.left - (g.left % 26) - 26; x < g.right; x += 26) {
          g.rect(x, ROAD_Y + 3, 4, 20, hex('#120e1c'));
          g.vline(x + 3, ROAD_Y + 3, ROAD_Y + 22, hex('#1c1628'));
        }
        g.rect(g.left, ROAD_Y - 1, g.w, 4, hex('#16121f'));
        g.hline(g.left, g.right, ROAD_Y - 2, hex('#2c2438'));
        g.hline(g.left, g.right, ROAD_Y + 3, hex('#0c0a14'));
        for (let x = g.left - (g.left % 40) - 40; x < g.right; x += 40) {
          g.vline(x + 12, ROAD_Y - 10, ROAD_Y - 2, hex('#2a2234'));
          g.hline(x + 12, x + 15, ROAD_Y - 10, hex('#2a2234'));
          g.px(x + 15, ROAD_Y - 9, sodium);
          g.glow(x + 15, ROAD_Y - 9, 5, sodium, 0.3);
          g.ellipseA(x + 15, ROAD_Y - 2, 7, 1, sodium, 0.12);
        }

        // The balcony: glass panels, chrome rail, tiled floor.
        g.rectA(g.left, RAIL_Y + 1, g.w, g.bottom - RAIL_Y, hex('#0c0a18'), 0.55);
        for (let x = g.left - (g.left % 48) - 48; x < g.right; x += 48) {
          g.vline(x, RAIL_Y, g.bottom, hex('#2a2438'));
          g.lineA(x + 6, RAIL_Y + 4, x + 22, RAIL_Y + 30, hex('#d8c8f0'), 0.08);
          g.lineA(x + 10, RAIL_Y + 4, x + 26, RAIL_Y + 30, hex('#d8c8f0'), 0.05);
        }
        g.rect(g.left, RAIL_Y - 2, g.w, 3, chrome);
        g.hline(g.left, g.right, RAIL_Y - 2, hex('#e8e0f4'));
        g.hline(g.left, g.right, RAIL_Y + 1, hex('#4a4058'));
        for (let y = RAIL_Y + 46; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const z = 900 / (y - 120);
            const u = ((x - 160) / (y - 120)) * 6;
            const edge = z % 1 < 0.08 || ((u % 1) + 1) % 1 < 0.06;
            g.px(x, y, edge ? hex('#0c0a12') : hex('#16121e'));
          }

        // The table: chrome rim, smoked glass, a cassette deck and a cocktail.
        const { x, y } = TABLE;
        g.ellipse(x, y + 1, 30, 5, ink);
        g.ellipse(x, y, 30, 4, mix(hex('#2a2238'), pink, 0.1));
        g.ring(x, y, 30, 4, chrome);
        g.hline(x - 26, x + 26, y - 3, hex('#e8e0f4'));
        g.rect(x - 1, y + 5, 3, 50, hex('#3a3448'));
        g.ellipse(x, y + 50, 12, 3, hex('#2a2438'));
        // deck body
        g.rect(x - 26, y - 17, 30, 15, hex('#1c1824'));
        g.rect(x - 26, y - 17, 30, 1, hex('#5a5068'));
        g.rect(x - 25, y - 15, 28, 1, pinkD);
        frameRect(g, x - 22, y - 12, 20, 8, hex('#3a3448'));
        g.rect(x - 21, y - 11, 18, 6, hex('#0c0a12'));
        g.rect(x - 18, y - 9, 12, 2, hex('#6a4a3a'));
        for (let i = 0; i < 5; i++) g.rect(x - 24 + i * 5, y - 3, 3, 1, hex('#8a8098'));
        g.px(x + 1, y - 10, hex('#40ff90'));
        // cocktail: tall glass, pink drink, a paper umbrella
        g.rect(x + 12, y - 15, 7, 13, hex('#b8b0d0'));
        g.rect(x + 13, y - 14, 5, 11, mix(pink, hex('#ff9a6a'), 0.3));
        g.rect(x + 13, y - 14, 5, 2, mix(pink, hex('#fff0f4'), 0.5));
        g.vline(x + 13, y - 14, y - 4, mix(pink, hex('#ffffff'), 0.6));
        g.rect(x + 13, y - 3, 5, 1, hex('#d8d0e8'));
        g.line(x + 17, y - 14, x + 21, y - 22, hex('#d8c8a0'));

        vignette(g, 0.5, 160, 80, 230, 170);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;

        // Neon: two signs on the towers, blinking in their own time.
        const n1 = f.reduced ? 1 : (t % 4) < 3.4 || ((t % 4) > 3.6 && (t % 4) < 3.8) ? 1 : 0.15;
        const n2 = f.reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 1.3);
        g.rect(141, 40, 16, 4, mix(hex('#1a1230'), pink, 0.85 * n1));
        g.glow(149, 42, 14, pink, 0.3 * n1);
        g.rect(245, 52, 2, 16, mix(hex('#1a1230'), cyan, 0.8 * n2));
        g.glow(246, 60, 12, cyan, 0.25 * n2);
        // aircraft warning lights on the two needles
        const blink = Math.floor(t * 0.8) % 2 === 0 ? 1 : 0.2;
        g.px(149, 14, hex('#ff4050'));
        g.glow(149, 14, 4, hex('#ff4050'), 0.6 * blink);
        g.px(246, 16, hex('#ff4050'));
        g.glow(246, 16, 4, hex('#ff4050'), 0.6 * (1.2 - blink));

        // The heart tower: dark windows, lit in sequence during a rare moment.
        const HT = HEART_TOWER;
        const heart = f.rare === 2 && ev < 12;
        for (let y = HT.top + 3; y < HORIZON - 2; y += 3)
          for (let x = HT.x + 2; x < HT.x + HT.w - 2; x += 2) {
            const u = (x - (HT.x + HT.w / 2)) / 8;
            const v = (y - (HT.top + 22)) / 8;
            const inHeart = (u * u + v * v - 1) ** 3 - u * u * v * v * v < 0;
            let on = hash3(x, y, 999) < 0.3 + Math.sin(t * 0.05 + x) * 0.05 ? 1 : 0;
            if (heart) {
              const order = (y - HT.top) / 50;
              const k = envelope(ev - order * 3, 8, 0.3, 1.5);
              on = inHeart ? Math.max(on * (1 - k), k) : on * (1 - k);
            }
            if (on > 0.3) g.px(x, y, mix(hex('#120c22'), heart && inHeart ? winP : winW, 0.4 + on * 0.4));
          }
        if (heart) g.glow(HT.x + HT.w / 2, HT.top + 22, 26, pink, 0.2 * envelope(ev, 12, 3, 2));

        // Moonlight and neon shimmering on the bay.
        const tick = Math.floor(t * (f.reduced ? 1 : 5));
        for (let y = HORIZON + 1; y < WATER_END; y++) {
          const d = y - HORIZON;
          const w = 2 + d * 0.5;
          const fade = 1 - d / 21;
          for (let i = 0; i < 4; i++) {
            const sx = MOON.x + Math.sin(t * 1.3 + y * 0.9 + i * 2) * w;
            if (hash3(y, tick + i, 3) < 0.6) {
              g.pxAdd(sx, y, hex('#f0d8f0'), 0.55 * fade);
              g.pxAdd(sx + 1, y, hex('#f0d8f0'), 0.25 * fade);
            }
          }
          if (hash3(y, tick, 5) < 0.55) g.hline(146 + Math.round(Math.sin(t + y) * 2), 152 + Math.round(Math.sin(t + y) * 2), y, mix(hex('#07050e'), pink, 0.5 * n1 * fade));
          if (hash3(y, tick, 6) < 0.5) g.pxAdd(246 + Math.round(Math.sin(t * 1.2 + y) * 1.5), y, cyan, 0.5 * n2 * fade);
        }

        // Traffic: headlights one way, tail lights the other, and now and then the convertible.
        for (let i = 0; i < 5; i++) {
          const dir = i % 2 ? 1 : -1;
          const sp = 18 + hash3(i, 2) * 10;
          const span = g.w + 80;
          const x = dir > 0 ? g.left - 40 + ((t * sp + hash3(i, 1) * span) % span) : g.right + 40 - ((t * sp + hash3(i, 1) * span) % span);
          const y = ROAD_Y + (dir > 0 ? 1 : 0);
          g.px(x, y, dir > 0 ? hex('#ff4a5a') : hex('#fff4d8'));
          g.glow(x + dir * 2, y, 4, dir > 0 ? hex('#ff3040') : hex('#fff0c8'), 0.3);
        }
        const cp = (t % 26) / 13;
        if (cp < 1) {
          const cx = g.left - 30 + cp * (g.w + 60);
          const cy = ROAD_Y - 1;
          g.rect(cx - 9, cy - 3, 18, 3, mix(pink, hex('#1a1028'), 0.25));
          g.rect(cx - 9, cy - 3, 18, 1, mix(pink, hex('#ffffff'), 0.35));
          g.rect(cx - 3, cy - 5, 5, 2, hex('#2a2030'));
          g.px(cx - 2, cy - 6, hex('#2a2030'));
          g.line(cx + 2, cy - 5, cx + 4, cy - 4, hex('#c8c0e0'));
          g.disc(cx - 6, cy, 1, ink);
          g.disc(cx + 6, cy, 1, ink);
          g.px(cx + 9, cy - 2, hex('#fff4d8'));
          g.glow(cx + 12, cy - 2, 6, hex('#fff0c8'), 0.4);
          g.px(cx - 10, cy - 2, hex('#ff4a5a'));
        }

        // Rare: a blimp with a scrolling sign.
        if (f.rare === 0 && ev < 12) {
          const p = ev / 12;
          const bx = g.right + 40 - p * (g.w + 80);
          const by = 30 + Math.sin(ev * 0.5) * 1;
          g.ellipse(bx, by, 22, 7, hex('#2a2238'));
          g.ellipse(bx, by - 2, 20, 4, hex('#3a3048'));
          g.tri(bx + 18, by, bx + 26, by - 7, bx + 26, by + 7, hex('#2a2238'));
          g.rect(bx - 4, by + 7, 8, 3, hex('#1a1424'));
          g.rect(bx - 15, by - 2, 30, 5, hex('#0a0810'));
          g.clip(bx - 15, by - 2, 30, 5);
          const msg = 'IT IS STILL FRIDAY  ';
          g.text(msg, bx + 15 - ((ev * 14) % 90), by - 2, pink);
          g.noClip();
          g.glow(bx, by, 26, pink, 0.06);
        }

        // Rare: soft fireworks over the bay, mirrored in the water.
        if (f.rare === 1 && ev < 12) {
          for (let k = 0; k < 4; k++) {
            const t0 = 0.5 + k * 2.2;
            const lt = ev - t0;
            if (lt < 0 || lt > 3) continue;
            const fx = 70 + hash3(k, 1) * 180;
            const fy = 34 + hash3(k, 2) * 22;
            const c = k % 2 ? pink : hex('#ffd890');
            if (lt < 0.6) {
              g.px(fx, fy + (0.6 - lt) * 60, c);
              continue;
            }
            const r = 5 + (lt - 0.6) * 12;
            const a = Math.min(1, 1.4 - (lt - 0.6) / 2.4 * 1.4);
            for (let i = 0; i < 22; i++) {
              const an = (i / 18) * Math.PI * 2;
              const px = fx + Math.cos(an) * r;
              const py = fy + Math.sin(an) * r + (lt - 0.6) ** 2 * 3;
              g.pxAdd(px, py, c, a);
              g.pxAdd(px - Math.cos(an) * 2, py - Math.sin(an) * 2, c, a * 0.4);
              g.pxAdd(px, HORIZON + (HORIZON - py) * 0.3, c, a * 0.35);
            }
            g.glow(fx, fy, 24, c, 0.2 * a);
          }
        }

        // The cassette: reels turning (auto-reverse during a rare moment).
        const rev = f.rare === 3 && ev < 12;
        let dir = 1;
        let spin = 1;
        if (rev) {
          spin = ev < 2 ? 1 - ev / 2 : ev < 3.5 ? 0 : 1;
          dir = ev < 3.5 ? 1 : -1;
          if (ev > 2 && ev < 9) g.text(ev < 3.5 ? '<>' : 'B', TABLE.x - 3, TABLE.y - 25, mix(hex('#40ff90'), hex('#0a0810'), ev % 0.8 < 0.4 ? 0 : 0.6));
        }
        const ra = (f.reduced ? t * 0.3 : t * 2.2) * dir * spin * (0.3 + 0.7 * awake);
        reel(g, TABLE.x - 17, TABLE.y - 8, ra);
        reel(g, TABLE.x - 7, TABLE.y - 8, ra + 1);
        g.rect(TABLE.x - 15, TABLE.y - 15, 1 + Math.round(f.energy * 10), 1, mix(pinkD, pink, f.energy));

        // A potted palm at the end of the balcony, fronds stirring.
        const px0 = 52;
        const py0 = RAIL_Y + 6;
        g.rect(px0 - 7, py0 - 2, 14, 12, hex('#16101e'));
        g.hline(px0 - 7, px0 + 6, py0 - 2, hex('#3a3048'));
        const palm = hex('#0a0710');
        const palmRim = mix(palm, pink, 0.35);
        for (let k = 0; k < 3; k++) g.line(px0 + k, py0 - 2, px0 - 8 + k + Math.sin(k) * 0, py0 - 80, palm);
        for (let y = 0; y < 78; y += 4) g.px(px0 - 7 + (y * 8) / 80 - 8 * (y / 80) * 0 + 8 * (1 - y / 80) - 0, py0 - 2 - y, palmRim);
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i - 4) * 0.42 + (f.reduced ? 0 : Math.sin(t * 0.9 + i) * 0.06);
          const len = 24 + (i % 3) * 5;
          const tx = px0 - 7;
          const ty = py0 - 80;
          let lx = tx;
          let ly = ty;
          for (let k = 1; k <= 12; k++) {
            const u = k / 12;
            const nx = tx + Math.cos(a) * len * u;
            const ny = ty + Math.sin(a) * len * u * 0.8 + u * u * 18;
            g.line(lx, ly, nx, ny, palm);
            g.line(lx, ly + 1, nx, ny + 1, palm);
            g.px(nx, ny - 1, palmRim);
            if (k > 1 && k < 12) {
              g.line(nx, ny, nx + Math.cos(a + 1.3) * (5 - u * 2), ny + 4 - u, palm);
              g.line(nx, ny, nx + Math.cos(a - 1.3) * (5 - u * 2), ny + 4 - u, palm);
            }
            lx = nx;
            ly = ny;
          }
        }

        // The umbrella, nodding in the breeze off the bay.
        const um = f.reduced ? 0 : Math.round(Math.sin(t * 0.7) * 1);
        const ux = TABLE.x + 21;
        const uy = TABLE.y - 23;
        for (let dx = -5; dx <= 5; dx++) {
          const yy = uy + Math.round((dx * dx) / 9) + (dx > 0 ? um : -um) * (Math.abs(dx) / 5);
          g.vline(ux + dx, yy, yy + 1, dx % 2 ? pink : mix(pink, hex('#fff0f4'), 0.6));
        }
        g.px(ux, uy - 1, hex('#fff0f4'));
        g.glow(TABLE.x + 15, TABLE.y - 8, 10, pink, 0.1 + f.energy * 0.08);
        void clamp;
        void smoothstep;
      },
    };
  },
};

export default def;

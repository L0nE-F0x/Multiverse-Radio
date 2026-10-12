// Lower Hollow Community Radio: a small town around the rim of an enormous, perfectly
// round hole. Bunting, a bake-sale stall, the council noticeboard, a dog peering over the
// edge. Street lamps glow. Now and then something floats up, and everyone ignores it.

import { hex, mix } from '../kit/color';
import { blinking, clamp, envelope, smoothstep, stars } from '../kit/fx';
import { type Gfx, bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { bakeFog, drawFogAdd, flicker, haze, vignette } from './lib/night';

const HOLE = { cx: 162, cy: 108, rx: 84, ry: 21 };
const DOG = { x: 106, y: 130 };
const LAMPS = [
  { x: 72, y: 104, h: 28 },
  { x: 132, y: 86, h: 20 },
  { x: 198, y: 86, h: 20 },
  { x: 252, y: 104, h: 28 },
  { x: 84, y: 140, h: 40 },
];

/** y of the hole's rim at x (far = top half, near = bottom half). */
const rimY = (x: number, near: boolean) => {
  const u = (x - HOLE.cx) / HOLE.rx;
  const s = Math.sqrt(Math.max(0, 1 - u * u)) * HOLE.ry;
  return HOLE.cy + (near ? s : -s);
};

const def: SceneDef = {
  id: 'hollow-town',
  fps: 12,
  focusY: 94,
  rareEvents: 3,
  rareDuration: 14,
  create({ accent }) {
    const black = hex('#020304');
    const ink = hex('#06080a');
    const sky = [hex('#05080d'), hex('#0a1018'), hex('#121b24'), hex('#1c2a30'), hex('#2a3a3a')];
    const sage = accent;
    const roofs = [hex('#0b0f14'), hex('#10161c'), hex('#151c22')];
    const wallC = hex('#121a1e');
    const lampC = hex('#ffcf87');
    const winC = hex('#ffb866');
    const stone = hex('#4a5250');
    const stoneD = hex('#262c2c');
    const cobble = [hex('#0d1113'), hex('#141a1c'), hex('#1c2426')];
    const flags = [mix(hex('#8a3a34'), sage, 0.2), mix(hex('#c8b070'), sage, 0.3), mix(hex('#3a5a7a'), sage, 0.3), sage, mix(hex('#e8e0d0'), sage, 0.3)];
    const mist = bakeFog(HOLE.cy - 30, 40, 21, { sx: 30, sy: 8, lo: 0.42, gain: 2.2, edge: 1 });

    // Houses along the far rim, seeded.
    const houses: { x: number; w: number; h: number; roof: number; win: number[] }[] = [];
    {
      let x = -70;
      let i = 0;
      while (x < 390) {
        const w = 18 + Math.floor(hash3(i, 3) * 16);
        const h = 16 + Math.floor(hash3(i, 4) * 14);
        const win: number[] = [];
        for (let k = 0; k < 4; k++) win.push(hash3(i, k, 5));
        houses.push({ x, w, h, roof: Math.floor(hash3(i, 6) * 3), win });
        x += w + Math.floor(hash3(i, 7) * 4);
        i++;
      }
    }

    // Bunting strung across the hole: two catenaries, flags at fixed spacing.
    const bunting = [
      { x0: 74, y0: 74, x1: 250, y1: 74, sag: 26 },
      { x0: 128, y0: 64, x1: 204, y1: 64, sag: 9 },
    ];

    const drawLamp = (g: Gfx, L: { x: number; y: number; h: number }, k: number) => {
      const top = L.y - L.h;
      g.vline(L.x, top, L.y, ink);
      g.rect(L.x - 1, L.y - 2, 3, 2, ink);
      g.rect(L.x - 2, top - 1, 5, 1, ink);
      g.rect(L.x - 1, top, 3, 3, mix(ink, lampC, 0.7 * k));
      g.rect(L.x - 2, top - 2, 5, 1, ink);
    };

    return {
      background(g) {
        g.vgrad(sky, g.top, 78);
        stars(g, 0, g.left, g.top, g.right, 52, 0.22, hex('#c8d4d0'), 4, 0);
        // A low green-grey band of afterglow behind the roofs.
        g.glow(170, 84, 160, mix(sage, hex('#304040'), 0.6), 0.12, 6);

        // Hills behind the town.
        for (let x = g.left; x < g.right; x++) {
          const y = 62 + Math.sin(x * 0.012 + 0.7) * 6 + fbm(x / 40, 0, 7, 3) * 8;
          g.vline(x, y, 92, hex('#0a0f13'));
        }
        // Church tower and spire.
        const cx0 = 214;
        g.rect(cx0 - 6, 40, 12, 50, roofs[1]!);
        g.tri(cx0 - 7, 41, cx0 + 7, 41, cx0, 16, roofs[1]!);
        g.vline(cx0, 11, 16, roofs[2]!);
        g.hline(cx0 - 2, cx0 + 2, 13, roofs[2]!);
        g.disc(cx0, 50, 3, hex('#d8d0b8'));
        g.disc(cx0, 50, 2, hex('#b8b098'));
        g.px(cx0, 49, ink);
        g.px(cx0 + 1, 50, ink);
        g.rect(cx0 - 1, 60, 3, 6, mix(roofs[1]!, winC, 0.5));

        // Terraces of houses along the far rim.
        for (const hs of houses) {
          const base = 90;
          const top = base - hs.h;
          const rc = roofs[hs.roof]!;
          g.rect(hs.x, top, hs.w, hs.h, wallC);
          g.tri(hs.x - 2, top + 1, hs.x + hs.w + 2, top + 1, hs.x + hs.w / 2, top - 9, rc);
          if (hs.win[3]! > 0.4) g.rect(hs.x + hs.w - 6, top - 8, 3, 6, rc);
          for (let k = 0; k < 3; k++) {
            const wx = hs.x + 3 + k * 6;
            if (wx > hs.x + hs.w - 5) break;
            const lit = hs.win[k]! > 0.55;
            g.rect(wx, top + 5, 3, 4, lit ? mix(winC, hex('#ffe0a8'), hs.win[k]! - 0.55) : hex('#0a0e12'));
            if (lit) g.glow(wx + 1, top + 7, 5, winC, 0.18, 4);
          }
          if (hs.win[3]! > 0.7) g.rect(hs.x + 4, base - 7, 3, 7, mix(wallC, winC, 0.35));
        }
        // The pub sign and the council noticeboard on the far side.
        g.rect(100, 76, 16, 10, hex('#2a2a22'));
        g.rect(101, 77, 14, 8, mix(hex('#8a8466'), sage, 0.25));
        for (let i = 0; i < 4; i++) g.rect(102 + (i % 2) * 7, 78 + Math.floor(i / 2) * 4, 5 + (i % 2) * -1, 3, hex('#e0dccb'));
        g.px(104, 79, hex('#8a2a2a'));
        g.rect(103, 86, 1, 4, ink);
        g.rect(112, 86, 1, 4, ink);

        // The green between the houses and the rim.
        for (let x = g.left; x < g.right; x++) g.vline(x, 88, HOLE.cy, hex('#0e1512'));

        // ── the hole ──
        const { cx, cy, rx, ry } = HOLE;
        // Ground on the near side: cobbles.
        for (let y = Math.max(cy - 4, g.top); y < g.bottom; y++) {
          const z = 900 / (y - 40);
          const row = Math.floor(z);
          const fy = z - row;
          for (let x = g.left; x < g.right; x++) {
            const u = ((x - 160) / (y - 40)) * 9 + (row % 2) * 0.5;
            const col = Math.floor(u);
            const fx = u - col;
            const edge = fy < 0.14 || fx < 0.1;
            const n = hash3(col, row, 8);
            const lit = clamp(1 - Math.hypot((x - 84) / 70, (y - 142) / 26)) * 0.9 + clamp(1 - Math.hypot((x - 252) / 50, (y - 106) / 14)) * 0.6;
            let c = edge ? cobble[0]! : cobble[n > 0.6 ? 2 : 1]!;
            if (lit > 0.05 && !edge) c = mix(c, hex('#4a4030'), lit * (0.5 + n * 0.3));
            g.px(x, y, c);
          }
        }
        // Interior: the far wall falls away into black, with faint strata.
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const yf = rimY(x, false);
          const yn = rimY(x, true);
          const side = (x - cx) / rx;
          for (let y = Math.ceil(yf); y <= yn; y++) {
            const d = y - yf;
            const v = clamp(1 - d / 15) ** 1.4 * (0.8 + 0.2 * side);
            const k = Math.floor(v * 3 + bayer(x, y));
            g.px(x, y, k >= 3 ? hex('#1e2624') : k === 2 ? hex('#121816') : k === 1 ? hex('#080b0b') : black);
          }
        }
        // Kerb: a neat stone ring.
        for (let a = 0; a < Math.PI * 2; a += 0.003) {
          const x = cx + Math.cos(a) * (rx + 1);
          const y = cy + Math.sin(a) * (ry + 1);
          const near = Math.sin(a) > 0;
          g.px(x, y, near ? stone : stoneD);
          if (near) g.px(x, y + 1, stoneD);
        }
        // Railing posts all the way round (taller nearer), with a rail.
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          const s = Math.sin(a);
          const x = Math.round(cx + Math.cos(a) * (rx + 3));
          const y = Math.round(cy + s * (ry + 2));
          const h = Math.round(4 + (s + 1) * 2.5);
          if (s < 0) g.vline(x, y - h, y, hex('#1a2020'));
        }
        for (let a = Math.PI; a < Math.PI * 2; a += 0.004) g.px(cx + Math.cos(a) * (rx + 3), cy + Math.sin(a) * (ry + 2) - 4 - (Math.sin(a) + 1) * 2.5, hex('#20282a'));

        // Bake-sale stall on the right rim: awning, trestle, cakes.
        const bx = 262;
        const by = 102;
        g.rect(bx - 16, by - 2, 32, 2, hex('#3a2a20'));
        g.rect(bx - 15, by, 2, 8, ink);
        g.rect(bx + 13, by, 2, 8, ink);
        g.rect(bx - 16, by - 1, 32, 6, mix(hex('#e8e0d0'), sage, 0.2));
        for (let x = bx - 16; x < bx + 16; x += 4) g.rect(x, by - 1, 2, 6, mix(hex('#8a5a4a'), sage, 0.25));
        g.vline(bx - 16, by - 20, by, ink);
        g.vline(bx + 15, by - 20, by, ink);
        for (let x = bx - 18; x < bx + 18; x++) {
          const stripe = Math.floor((x - bx + 18) / 4) % 2;
          g.vline(x, by - 22 + Math.abs(x - bx) * 0.08, by - 17, stripe ? mix(hex('#9a3a34'), sage, 0.3) : mix(hex('#e8e0d0'), sage, 0.25));
        }
        for (let x = bx - 18; x < bx + 18; x += 3) g.px(x + 1, by - 16, mix(hex('#9a3a34'), sage, 0.3));
        // cakes: a sponge, a tray of buns, a tall layered thing
        g.ellipse(bx - 9, by - 4, 4, 2, hex('#c89a6a'));
        g.rect(bx - 13, by - 6, 9, 2, hex('#e8d8b8'));
        for (let i = 0; i < 3; i++) g.disc(bx - 1 + i * 3, by - 3, 1, hex('#b8865a'));
        g.rect(bx + 8, by - 9, 5, 7, hex('#7a4a3a'));
        g.rect(bx + 8, by - 7, 5, 1, hex('#e8d8c0'));
        g.rect(bx + 8, by - 4, 5, 1, hex('#e8d8c0'));
        g.px(bx + 10, by - 10, hex('#c84a4a'));
        // the sign
        g.rect(bx - 6, by - 30, 13, 5, hex('#e8e0d0'));
        g.text('BAKE', bx - 6, by - 30, hex('#5a3a30'));

        // Benches and a bin on the near cobbles (tall views).
        g.rect(60, 162, 28, 2, hex('#2a2420'));
        g.rect(60, 156, 28, 2, hex('#2a2420'));
        g.rect(62, 164, 2, 6, ink);
        g.rect(84, 164, 2, 6, ink);
        g.rect(228, 158, 7, 10, hex('#1a2024'));

        // Haze over the far town, and a cold breath of mist over the hole's mouth.
        haze(g, 40, 92, mix(hex('#2a3a3a'), sage, 0.2), 0.0, 0.18);
        vignette(g, 0.5, 160, 100, 220, 150);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const awake = f.awake;
        const glowFromHole = f.rare === 1 && ev < 14 ? envelope(ev, 14, 4, 4) : 0;
        const lampDim = 1 - glowFromHole * 0.6;

        // Street lamps and their pools of light.
        for (let i = 0; i < LAMPS.length; i++) {
          const L = LAMPS[i]!;
          const k = flicker(t * 0.4, i + 3) * lampDim * (0.75 + 0.25 * awake);
          drawLamp(g, L, k);
          g.glow(L.x, L.y - L.h + 1, 14, lampC, 0.35 * k, 5);
          g.ellipseA(L.x, L.y + 1, 14, 3, lampC, 0.1 * k);
        }

        // A breath of mist over the mouth, faintly lit.
        drawFogAdd(g, mist, t * 2.2, mix(hex('#3a4a48'), sage, 0.3), 0.18 + glowFromHole * 0.4);

        // Rare: something luminous rises in the hole, then thinks better of it.
        if (glowFromHole > 0) {
          const k = glowFromHole;
          g.glow(HOLE.cx, HOLE.cy + 4, 90 * k + 10, mix(sage, hex('#e8fff0'), 0.4), 0.35 * k, 6);
          g.glow(HOLE.cx, HOLE.cy - 10 - 20 * k, 10 + 8 * k, hex('#f0fff4'), 0.6 * k, 4);
        }

        // Bunting, swaying.
        for (let b = 0; b < bunting.length; b++) {
          const B = bunting[b]!;
          const sway = f.reduced ? 0 : Math.sin(t * 0.8 + b) * 1.2;
          const n = Math.round((B.x1 - B.x0) / 6);
          for (let i = 0; i <= n * 3; i++) {
            const u = i / (n * 3);
            const x = B.x0 + (B.x1 - B.x0) * u;
            const y = B.y0 + (B.y1 - B.y0) * u + Math.sin(u * Math.PI) * (B.sag + sway);
            g.px(x, y, hex('#2a302e'));
          }
          for (let i = 1; i < n; i++) {
            const u = i / n;
            const x = Math.round(B.x0 + (B.x1 - B.x0) * u);
            const y = Math.round(B.y0 + (B.y1 - B.y0) * u + Math.sin(u * Math.PI) * (B.sag + sway));
            const flap = f.reduced ? 0 : Math.round(Math.sin(t * 2.1 + i * 1.3) * 0.6);
            const c = mix(flags[(i + b * 2) % flags.length]!, hex('#0a0e10'), 0.45 - glowFromHole * 0.3);
            g.tri(x - 2, y + 1, x + 3, y + 1, x + flap, y + 6, c);
          }
        }

        // Chimney smoke and a window that changes its mind.
        for (let i = 0; i < 2; i++) {
          const hs = houses[(i * 7 + 5) % houses.length]!;
          const sx = hs.x + hs.w - 5;
          const sy = 90 - hs.h - 9;
          for (let k = 0; k < 6; k++) {
            const p = (t * 0.08 + k / 6) % 1;
            g.pxA(sx + p * 10 + Math.sin(p * 6 + k) * 1.5, sy - p * 20, hex('#5a6664'), 0.35 * (1 - p));
          }
        }
        const wi = Math.floor(t / 23) % houses.length;
        const wh = houses[(wi * 5 + 3) % houses.length]!;
        if (Math.floor(t / 11) % 2 === 0) g.rect(wh.x + 3, 90 - wh.h + 5, 3, 4, mix(winC, hex('#ffe8c0'), 0.3));

        // Rare: an armchair rises out of the hole, turning slowly, and goes on its way.
        if (f.rare === 0 && ev < 14) {
          const p = ev / 14;
          const ax = HOLE.cx + 10 + Math.sin(p * 4) * 6;
          const ay = HOLE.cy + 6 - (p * 0.45 + p * p * p * 0.75) * 140;
          const turn = Math.sin(ev * 0.5);
          g.clip(g.left, g.top, g.w, Math.max(0, (p < 0.08 ? HOLE.cy + 4 : g.bottom) - g.top));
          const chair = mix(hex('#5a3a34'), sage, 0.15);
          const chairL = mix(chair, lampC, 0.25);
          const w = Math.round(7 + turn * 2);
          g.rect(ax - w, ay - 6, w * 2, 6, chair);
          g.rect(ax - w, ay - 13, 3, 13, chair);
          g.rect(ax + w - 3, ay - 13, 3, 13, chair);
          g.rect(ax - w + 2, ay - 16, w * 2 - 4, 10, chairL);
          g.rect(ax - w + 3, ay - 5, w * 2 - 6, 2, chairL);
          g.vline(ax - w + 1, ay, ay + 2, ink);
          g.vline(ax + w - 2, ay, ay + 2, ink);
          g.noClip();
        }

        // Rare: a doorway floats up, opens a crack, and sinks back.
        if (f.rare === 2 && ev < 14) {
          const up = envelope(ev, 14, 3.5, 3.5);
          const dx = HOLE.cx - 30;
          const dy = HOLE.cy + 8 - up * 34;
          g.clip(g.left, g.top, g.w, HOLE.cy + 4 - g.top);
          g.rect(dx - 7, dy - 26, 14, 26, hex('#2a2420'));
          g.rect(dx - 6, dy - 25, 12, 25, hex('#141210'));
          const open = clamp((ev - 5) * 0.8) * (1 - smoothstep(8, 9.5, ev));
          const ow = Math.round(open * 6);
          if (ow > 0) {
            g.rect(dx - 6, dy - 25, ow, 25, hex('#ffe0a0'));
            g.glow(dx - 6 + ow / 2, dy - 12, 22, lampC, 0.35 * open);
          }
          g.rect(dx - 6 + ow, dy - 25, 12 - ow, 25, mix(hex('#3a2a20'), sage, 0.15));
          g.px(dx + 3, dy - 12, hex('#c8a060'));
          g.noClip();
        }

        // ── the dog at the edge, peering in ──
        const watching = f.rare === 0 && ev < 14 ? clamp(ev / 2.5) * (1 - smoothstep(11.5, 14, ev)) : 0;
        const ears = glowFromHole > 0.2 || (f.rare === 2 && ev > 4 && ev < 10) ? 1 : 0;
        const wag = (Math.sin(t * 0.13) > 0.6 || ears) && !f.reduced ? Math.round(Math.sin(t * 9) * 1.5) : 0;
        const fur = mix(hex('#54483c'), lampC, 0.08 * lampDim);
        const furD = hex('#3a3028');
        const furL = mix(hex('#94785c'), lampC, 0.3 * lampDim);
        const { x, y } = DOG;
        const lift = Math.round(watching * 5);
        const peer = f.reduced ? 0 : Math.round(Math.sin(t * 0.21) * 0.7);
        // tail
        g.line(x - 8, y - 3, x - 12, y - 9 - wag, furD);
        g.line(x - 9, y - 3, x - 13, y - 9 - wag, fur);
        // haunch, chest, straight front legs
        g.ellipse(x - 4, y - 5, 5, 5, fur);
        g.ellipse(x, y - 10, 4, 6, fur);
        g.rect(x + 2, y - 8, 2, 8, fur);
        g.rect(x + 4, y - 7, 2, 7, furD);
        g.ellipse(x - 5, y - 1, 4, 1, furD);
        // neck and head, craned forward over the rim (or up, at whatever floats past)
        const hx = x + 5 + peer;
        const hy = y - 19 - lift + (lift > 0 ? 0 : 2);
        g.line(x + 1, y - 14, hx - 1, hy + 1, fur);
        g.line(x + 2, y - 14, hx, hy + 1, fur);
        g.line(x + 3, y - 13, hx + 1, hy + 2, fur);
        g.ellipse(hx, hy, 3, 3, fur);
        const sy = hy + (lift > 2 ? -2 : 1);
        g.rect(hx + 2, sy, 4, 2, fur);
        g.px(hx + 6, sy, ink);
        g.px(hx + 3, sy + 2, furD);
        // floppy ear (perks up when something happens)
        g.rect(hx - 3, hy - 2 - ears * 2, 2, 5 - ears, furD);
        // lamp-light along the back and the top of the head
        g.hline(x - 7, x - 3, y - 10, furL);
        g.px(x - 2, y - 15, furL);
        g.px(x - 1, y - 16, furL);
        g.hline(hx - 2, hx + 1, hy - 3, furL);
        g.px(hx + 3, sy - 1 + (lift > 2 ? 0 : 1) - 1, furL);
        if (!blinking(t, 12)) g.px(hx + 1, hy - 1, ink);
      },
    };
  },
};

export default def;

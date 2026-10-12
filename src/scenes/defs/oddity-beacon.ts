// Oddity: a lone distress buoy turning slowly in deep space, blinking its three-short-three-long
// to nobody, against a vast faint nebula.
// Rare events: a ship passes far off and doesn't stop; a lost mitten drifts by and bumps it;
// something deep in the nebula blinks the same pattern back; a little arm wipes the lamp.

import { hex, mix, ramp, shade } from '../kit/color';
import { TAU, clamp, envelope, rampAt, smoothstep } from '../kit/fx';
import { bayer } from '../kit/gfx';
import { fbm, hash3 } from '../kit/rng';
import type { SceneDef } from '../types';
import { vignette } from './deep-kit';

const B = { x: 160, y: 78, r: 13, h: 40 }; // buoy body: centre, radius, height
const SOS = [0, 0.35, 0.7, 1.4, 2.25, 3.1, 3.95, 4.3, 4.65]; // pulse start times in a cycle
const LONG = [false, false, false, true, true, true, false, false, false];
const CYCLE = 9;

function sosOn(t: number): number {
  const c = ((t % CYCLE) + CYCLE) % CYCLE;
  for (let i = 0; i < SOS.length; i++) {
    const d = c - SOS[i]!;
    const len = LONG[i] ? 0.6 : 0.18;
    if (d >= 0 && d < len) return 1;
  }
  return 0;
}

const def: SceneDef = {
  id: 'oddity-beacon',
  fps: 15,
  focusY: 82,
  rareEvents: 4,
  rareDuration: 12,
  create() {
    const red = hex('#ff3a2a');
    const hull = [hex('#06070a'), hex('#0f1218'), hex('#1a1e26'), hex('#2a303a'), hex('#3e4552')];
    const stripeA = hex('#8a5418');
    const stripeB = hex('#14161a');
    const starC = hex('#c8d4ff');

    return {
      background(g) {
        g.fill(hex('#020308'));
        // the nebula: two veils of colour over the dark, smoothly dithered through a ramp
        const rampA = ramp([hex('#020308'), hex('#081422'), hex('#10283a'), hex('#1e3c4e'), hex('#33586a')], 9);
        const rampB = ramp([hex('#020308'), hex('#140c20'), hex('#2a1834'), hex('#46243e'), hex('#6a3a40')], 9);
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const band = Math.exp(-(((y - 70 - (x - 160) * 0.35) / 70) ** 2)) + 0.5 * Math.exp(-(((y + 30 - (x - 160) * 0.2) / 40) ** 2));
            const n1 = fbm(x / 80, y / 55, 11, 5);
            const n2 = fbm(x / 45 + 5, y / 32, 23, 4);
            const a = clamp((n1 - 0.38) * 1.9) * band;
            const b = clamp((n2 - 0.5) * 2.6) * band * clamp((n1 - 0.4) * 3);
            const dust = clamp((fbm(x / 22, y / 14, 41, 3) - 0.58) * 4) * band;
            const c = b > a * 0.6 ? rampAt(rampB, b * 0.9 * (1 - dust * 0.8), x, y) : rampAt(rampA, a * 0.8 * (1 - dust * 0.8), x, y);
            g.px(x, y, c);
          }
        // a band of faint stars along the nebula; brighter scattered stars everywhere
        for (let y = g.top; y < g.bottom; y++)
          for (let x = g.left; x < g.right; x++) {
            const band = Math.exp(-(((y - 70 - (x - 160) * 0.35) / 40) ** 2));
            const h = hash3(x, y, 91);
            if (h < 0.004 + band * 0.02) g.pxA(x, y, starC, 0.15 + 0.6 * hash3(x, y, 92));
          }
        // a far spiral galaxy
        g.glow(58, 38, 10, hex('#8a8aa0'), 0.25, 4);
        for (let i = 0; i < 40; i++) {
          const a = i * 0.45;
          const r = 1 + i * 0.25;
          g.pxA(58 + Math.cos(a) * r * 1.6, 38 + Math.sin(a) * r * 0.7, hex('#a8a8c0'), 0.4);
          g.pxA(58 - Math.cos(a) * r * 1.6, 38 - Math.sin(a) * r * 0.7, hex('#a8a8c0'), 0.4);
        }
        vignette(g, 0.5, 160, 82);
      },

      frame(g, f) {
        const { t } = f;
        const ev = f.rareT;
        const R = (k: number) => f.rare === k && ev < 12;

        // a few bright stars twinkle (the rest are baked)
        for (let i = 0; i < 14; i++) {
          const x = g.left + hash3(i, 3) * g.w;
          const y = g.top + hash3(i, 4) * g.h;
          const k = 0.4 + 0.4 * Math.sin(t * (0.5 + hash3(i, 5)) + i * 3);
          g.pxAdd(x, y, starC, k);
          if (hash3(i, 6) > 0.7) {
            g.pxAdd(x - 1, y, starC, k * 0.3);
            g.pxAdd(x + 1, y, starC, k * 0.3);
            g.pxAdd(x, y - 1, starC, k * 0.3);
            g.pxAdd(x, y + 1, starC, k * 0.3);
          }
        }

        // the ship that doesn't stop (rare 0)
        let hopeful = 0;
        if (R(0)) {
          const p = ev / 12;
          const sx = 330 - p * 360;
          const sy = 36 + p * 14;
          g.pxAdd(sx, sy, hex('#d8e4ff'), 0.7);
          g.pxAdd(sx + 2, sy, hex('#ff8a6a'), (t % 1) < 0.2 ? 0.9 : 0.2);
          g.pxAdd(sx - 2, sy, hex('#8affaa'), (t % 1) < 0.2 ? 0.9 : 0.2);
          hopeful = envelope(ev, 12, 2, 3);
        }
        // something answers from the nebula (rare 2)
        if (R(2) && ev > 2) {
          const on = sosOn((ev - 2) * 1.0) * (f.reduced ? 0.5 : 1);
          g.glow(250, 108, 6, hex('#c8a8ff'), 0.35 * on * envelope(ev - 2, 10, 0.5, 1));
          g.pxAdd(250, 108, hex('#e8d8ff'), on);
        }

        // ── the buoy: drifting, turning ──
        let wob = 0;
        if (R(1) && ev > 5.5) wob = Math.sin((ev - 5.5) * 5) * Math.exp(-(ev - 5.5) * 0.8) * 3;
        const drift = f.reduced ? 0.3 : 1;
        const cx = Math.round(B.x + Math.sin(t * 0.13) * 3 * drift + wob);
        const cy = Math.round(B.y + Math.sin(t * 0.21 + 1) * 2 * drift);
        const spin = t * 0.35;
        const top = cy - B.h / 2;
        const bot = cy + B.h / 2;
        // whip antennas
        const tsh = Math.round((B.h / 2) * (0.28 + Math.sin(t * 0.05) * 0.06));
        g.line(cx - 4 + tsh, top - 2, cx - 4 + tsh + 6, top - 22, hex('#2a303a'));
        g.line(cx + 5 + tsh, top - 1, cx + 5 + tsh + 12, top - 14, hex('#2a303a'));
        g.px(cx + 2 + tsh, top - 22, hex('#5a606c'));
        // body: a cylinder with a stripe band that turns with it; light from the upper left
        const tilt = 0.28 + Math.sin(t * 0.05) * 0.06;
        for (let y = top; y <= bot; y++) {
          const sh = Math.round((cy - y) * tilt);
          const capT = y - top < 4 ? 4 - (y - top) : 0;
          const capB = bot - y < 5 ? 5 - (bot - y) : 0;
          const rr = B.r - Math.round((capT * capT) / 4 + (capB * capB) / 5);
          if (rr <= 0) continue;
          for (let x = -rr; x <= rr; x++) {
            const u = x / (B.r + 0.5);
            const theta = Math.asin(clamp(u, -1, 1));
            const lv = clamp(0.55 - u * 0.55 + Math.cos(theta) * 0.25 - (y - top) * 0.004);
            let c = hull[Math.min(4, Math.floor(lv * 4.99 + bayer(cx + x + sh, y) * 0.8))]!;
            const yy = y - top;
            if (yy > 12 && yy < 19) {
              const ph = ((theta + spin) / TAU) * 12;
              const s = Math.floor(ph + yy * 0.25) & 1;
              c = s ? shade(stripeA, 0.4 + lv * 0.8) : stripeB;
            }
            if (yy === 24 || yy === 34) c = shade(c, 0.6);
            // stencilled numerals, coming round with the spin
            if (yy >= 26 && yy < 31) {
              const ph = (((theta + spin) % TAU) + TAU) % TAU;
              if (ph > 0.3 && ph < 1.3) {
                const gx = Math.floor((ph - 0.3) * 9);
                const pat = ['###.###', '#.#.#..', '#.#.###', '#.#...#', '###.###'][yy - 26]!;
                if (pat[gx] === '#') c = mix(c, hex('#b8b0a0'), 0.6 * Math.cos(theta));
              }
            }
            g.px(cx + x + sh, y, c);
          }
        }
        // the solar fin, edge-on as it turns past
        const fin = Math.sin(spin);
        const fw = Math.round(Math.abs(fin) * 14);
        if (fw > 1) {
          const fx = fin > 0 ? cx + B.r : cx - B.r - fw;
          g.rect(fx, cy - 2, fw, 6, hex('#141c30'));
          for (let k = 0; k < fw; k += 3) g.vline(fx + k, cy - 2, cy + 3, hex('#22304a'));
          g.hline(fx, fx + fw - 1, cy - 2, hex('#3a4a6a'));
        }

        // the lamp
        const wipe = R(3) ? smoothstep(3, 4, ev) * (1 - smoothstep(8, 9, ev)) : 0;
        let on = sosOn(t);
        if (R(0) && hopeful > 0.5) on = sosOn(t * 1.6);
        if (f.awake < 0.5) on *= 0.6;
        const lx = cx + tsh + 1;
        const ly = top - 2;
        g.rect(lx - 3, ly, 7, 3, hex('#1c2028'));
        g.ellipse(lx, ly - 1, 3, 2, mix(hex('#3a0c08'), red, on));
        g.px(lx - 1, ly - 2, mix(hex('#6a2a20'), hex('#ffd0c0'), on));
        const k = (0.45 + 0.35 * f.energy) * on * (f.reduced ? 0.5 : 1);
        if (k > 0) {
          g.glow(lx, ly - 1, 14, red, k * 0.7, 4);
          g.glow(lx, ly - 1, 40, red, k * 0.12, 3);
          // the light falls on the hull's top
          g.rectAdd(cx - B.r + 2 + tsh, top + 1, B.r * 2 - 3, 3, red, k * 0.3);
          g.rectAdd(cx - B.r + 2 + tsh - 2, top + 4, B.r * 2 - 3, 4, red, k * 0.12);
        }
        // a faint ring of signal leaving it, once per long pulse
        if (!f.reduced) {
          const c = ((t % CYCLE) + CYCLE) % CYCLE;
          const p = (c - 1.4) / 4;
          if (p > 0 && p < 1) {
            const rad = 8 + p * 90;
            const a = (1 - p) * 0.18;
            for (let i = 0; i < 90; i++) {
              const ang = (i / 90) * TAU;
              g.pxA(lx + Math.cos(ang) * rad, ly + Math.sin(ang) * rad * 0.9, red, a);
            }
          }
        }

        // the little arm (rare 3): a hatch opens, a cloth wipes the lamp
        if (R(3)) {
          const out = wipe;
          const hx = cx + 6 + tsh - 2;
          const hy = top + 6;
          g.rect(hx, hy, 4, 4, hex('#0a0b0e'));
          if (out > 0.05) {
            const ex = hx + 2 + Math.round(out * 2);
            const ey = hy - Math.round(out * 9);
            g.line(hx + 2, hy + 2, ex, ey, hex('#6a707c'));
            const rub = ev > 4 && ev < 8 && !f.reduced ? Math.round(Math.sin(ev * 12) * 2) : 0;
            g.rect(ex - 3 + rub, ey - 2, 4, 3, hex('#c8c0a8'));
          }
        }

        // the mitten (rare 1): drifts in, bumps, drifts on, turning gently
        if (R(1)) {
          const p = ev / 12;
          const mx = ev < 5.5 ? 40 + (cx - B.r - 6 - 40) * (ev / 5.5) : cx - B.r - 6 - (ev - 5.5) * 6;
          const my = ev < 5.5 ? 120 - (120 - cy) * (ev / 5.5) : cy + (ev - 5.5) * 3;
          const c = hex('#7a2a2a');
          const ang = p * 3;
          g.ellipse(mx, my, 3, 4, c);
          g.ellipse(mx + Math.cos(ang) * 3, my - 2 + Math.sin(ang), 1.5, 2, c);
          g.hline(mx - 3, mx + 3, my + 4, hex('#c8c0b0'));
          g.px(mx - 1, my - 1, hex('#9a4a4a'));
        }
      },
    };
  },
};

export default def;

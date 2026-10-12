// Shared helpers for the deep-band scenes (secret stations, pirates, oddities): haze, rain,
// snow, hand-painted signs, egg-box foam, and the per-pirate "look" picked from ctx.variant.
// Everything here is either baked once (textures, layouts) or stateless per frame.

import { type Color, hex, mix, shade } from '../kit/color';
import { clamp } from '../kit/fx';
import { glyph } from '../kit/font';
import { type Gfx, bayer, blendPx } from '../kit/gfx';
import { Rng, fbm, hash3 } from '../kit/rng';

// ── haze ──────────────────────────────────────────────────────────────────────

/** A horizontally tileable fog texture (alpha 0..255), `w` must be a power of two. */
export interface Haze {
  w: number;
  h: number;
  a: Uint8Array;
}

export function makeHaze(w: number, h: number, seed: number, sx = 40, sy = 10, cut = 0.38, gain = 2.2, edge = true): Haze {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const e = edge ? Math.sin(((y + 0.5) / h) * Math.PI) : 1;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(x / sx, y / sy, seed, 4) * (1 - u) + fbm((x - w) / sx, y / sy, seed, 4) * u;
      a[y * w + x] = Math.round(clamp((n - cut) * gain) * e * 255);
    }
  }
  return { w, h, a };
}

/** Blend a haze texture over the view at world row y0, scrolled by `off` px. */
export function drawHaze(g: Gfx, hz: Haze, y0: number, off: number, c: Color, k: number, x0 = g.left, x1 = g.right) {
  if (k <= 0) return;
  const b = g.buf;
  const mask = hz.w - 1;
  const o = Math.floor(off) & mask;
  const bx0 = Math.max(0, Math.floor(x0) - g.ox);
  const bx1 = Math.min(g.w, Math.floor(x1) - g.ox);
  const kk = k / 255;
  for (let row = 0; row < hz.h; row++) {
    const by = Math.floor(y0) + row - g.oy;
    if (by < 0 || by >= g.h) continue;
    const r0 = row * hz.w;
    const brow = by * g.w;
    for (let bx = bx0; bx < bx1; bx++) {
      const a = hz.a[r0 + ((bx + g.ox + o) & mask)]!;
      if (a < 6) continue;
      b[brow + bx] = blendPx(b[brow + bx]!, c, a * kk);
    }
  }
}

/** Dithered vertical haze band (background use): fraction rises from a0 at y0 to a1 at y1. */
export function hazeBand(g: Gfx, y0: number, y1: number, c: Color, a0: number, a1: number, x0 = g.left, x1 = g.right) {
  for (let y = Math.max(Math.floor(y0), g.top); y < Math.min(Math.ceil(y1), g.bottom); y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    g.rectA(x0, y, x1 - x0, 1, c, a0 + (a1 - a0) * t);
  }
}

/** Darken the view's edges (bake into backgrounds). */
export function vignette(g: Gfx, k = 0.45, cx = 160, cy = 90) {
  const rx = Math.max(g.w, 200) * 0.62;
  const ry = Math.max(g.h, 120) * 0.62;
  const b = g.buf;
  for (let by = 0; by < g.h; by++) {
    const dy = (by + g.oy - cy) / ry;
    for (let bx = 0; bx < g.w; bx++) {
      const dx = (bx + g.ox - cx) / rx;
      const d = dx * dx + dy * dy;
      if (d < 0.55) continue;
      const m = 1 - clamp((d - 0.55) * 0.9) * k;
      const i = by * g.w + bx;
      const c = b[i]!;
      b[i] = (0xff000000 | (((((c >>> 16) & 255) * m) | 0) << 16) | (((((c >>> 8) & 255) * m) | 0) << 8) | (((c & 255) * m) | 0)) | 0;
    }
  }
}

// ── weather ───────────────────────────────────────────────────────────────────

/** Stateless rain streaks in a rectangle. `slant` is x drift per px of fall. */
export function rain(g: Gfx, t: number, x0: number, y0: number, x1: number, y1: number, n: number, c: Color, a: number, slant = 0.25, speed = 220, len = 6, seed = 3) {
  const h = y1 - y0;
  const w = x1 - x0;
  for (let i = 0; i < n; i++) {
    const r1 = hash3(i, seed, 1);
    const r2 = hash3(i, seed, 2);
    const sp = speed * (0.75 + r2 * 0.5);
    const p = (t * sp + r1 * h * 7) % (h + len);
    const y = y0 + p - len;
    const x = x0 + ((r2 * w * 3 + p * slant) % w);
    const aa = a * (0.5 + 0.5 * r1);
    for (let k = 0; k < len; k++) {
      const yy = y + k;
      if (yy < y0 || yy >= y1) continue;
      g.pxA(x + k * slant, yy, c, aa * (0.4 + (0.6 * k) / len));
    }
  }
}

/** Stateless drifting snow. */
export function snow(g: Gfx, t: number, x0: number, y0: number, x1: number, y1: number, n: number, c: Color, a: number, seed = 5) {
  const h = y1 - y0;
  const w = x1 - x0;
  for (let i = 0; i < n; i++) {
    const r1 = hash3(i, seed, 1);
    const r2 = hash3(i, seed, 2);
    const sp = 8 + r2 * 10;
    const p = (t * sp + r1 * h * 5) % h;
    const x = x0 + ((r2 * w * 4 + Math.sin(t * (0.6 + r1) + i) * 4) % w + w) % w;
    const near = r1 > 0.85;
    g.pxA(x, y0 + p, c, a * (0.5 + r2 * 0.5));
    if (near) g.pxA(x + 1, y0 + p, c, a * 0.6);
  }
}

// ── signs ─────────────────────────────────────────────────────────────────────

/** Hand-painted lettering: wobbly baseline, uneven strokes, the odd drip. Returns width. */
export function paintedText(g: Gfx, s: string, x: number, y: number, c: Color, scale = 2, seed = 1, drips = true): number {
  let cx = Math.floor(x);
  let i = 0;
  for (const ch of s) {
    const gl = glyph(ch);
    const jy = Math.round((hash3(i, seed, 11) - 0.5) * scale * 1.2);
    const jx = hash3(i, seed, 12) < 0.25 ? 1 : 0;
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < gl.w; gx++) {
        if (!gl.bits[gy * gl.w + gx]) continue;
        const px = cx + jx + gx * scale;
        const py = Math.floor(y) + jy + gy * scale;
        g.rect(px, py, scale, scale, c);
        // brush texture: nibble a corner now and then
        if (scale > 1 && hash3(px, py, seed) < 0.18) g.px(px + scale - 1, py, mix(c, g.get(px + scale, py), 0.6));
      }
    if (drips && ch !== ' ' && hash3(i, seed, 13) < 0.3) {
      const dx = cx + jx + Math.floor(hash3(i, seed, 14) * gl.w) * scale;
      const dl = 2 + Math.floor(hash3(i, seed, 15) * 4);
      g.rect(dx, Math.floor(y) + jy + 5 * scale, 1, dl, c);
    }
    cx += (gl.w + 1) * scale + (hash3(i, seed, 16) < 0.2 ? 1 : 0);
    i++;
  }
  return cx - Math.floor(x);
}

export function paintedWidth(s: string, scale = 2): number {
  let w = 0;
  for (const ch of s) w += (glyph(ch).w + 1) * scale;
  return w - scale;
}

/** Egg-box foam: rows of cups with a lit rim. */
export function eggBox(g: Gfx, x: number, y: number, w: number, h: number, base: Color, lit: Color, dark: Color, cell = 4) {
  g.rect(x, y, w, h, base);
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = (yy / cell) % 2 ? cell / 2 : 0; xx < w; xx += cell) {
      const px = x + xx;
      const py = y + yy;
      if (px + 2 > x + w || py + 2 > y + h) continue;
      g.rect(px + 1, py + 1, cell - 2, cell - 2, dark);
      g.px(px + 1, py, lit);
    }
  }
}

// ── people ────────────────────────────────────────────────────────────────────

/**
 * A DJ seen as a backlit silhouette from the chest up, wearing headphones, nodding.
 * (x, y) is the top of the head; `bob` 0..1 nods the head.
 */
export function djSilhouette(g: Gfx, x: number, y: number, body: Color, rim: Color, bob: number, hair = 0, facing = 1) {
  const hy = Math.round(y + bob * 1.5);
  // shoulders and chest
  g.ellipse(x, hy + 15, 9, 6, body);
  g.rect(x - 9, hy + 15, 19, 12, body);
  // neck + head
  g.rect(x - 2, hy + 7, 5, 5, body);
  g.ellipse(x, hy + 4, 4, 5, body);
  if (hair === 1) g.ellipse(x - facing, hy + 1, 5, 4, body); // big hair
  if (hair === 2) g.rect(x - 4 - facing, hy - 1, 9, 3, body); // beanie
  if (hair === 2) g.rect(x - 1, hy - 3, 2, 2, body);
  // headphones
  g.rect(x - 6, hy + 2, 2, 5, rim);
  g.rect(x + 5, hy + 2, 2, 5, shade(rim, 0.6));
  g.hline(x - 5, x + 5, hy - 2, shade(rim, 0.7));
  // rim light on the lit side
  g.vline(x + facing * 4, hy + 2, hy + 6, rim);
  g.px(x + facing * 3, hy, rim);
  g.vline(x + facing * 9, hy + 15, hy + 26, shade(rim, 0.8));
}

// ── per-pirate variation ─────────────────────────────────────────────────────

export type TimeOfDay = 'night' | 'moon' | 'dusk' | 'dawn';
export type Weather = 'clear' | 'rain' | 'fog' | 'snow' | 'wind';

export interface PirateLook {
  rng: Rng;
  tod: TimeOfDay;
  weather: Weather;
  /** Sky stops, top → horizon. */
  sky: Color[];
  /** Silhouette / far-land colour. */
  land: Color;
  /** Haze/fog colour. */
  haze: Color;
  /** Warm interior light (bulbs, lamps). */
  warm: Color;
  /** The pirate's practical light (from ctx.accent, tempered). */
  practical: Color;
  callsign: string;
  /** Moon position or none. */
  moon: { x: number; y: number; r: number } | null;
  starDensity: number;
}

const SKIES: Record<TimeOfDay, string[][]> = {
  night: [
    ['#05070d', '#0a0f1c', '#121a2c', '#1a2236'],
    ['#06060c', '#0d0c1a', '#17142a', '#221a30'],
    ['#04080a', '#08121a', '#0f1e26', '#18282e'],
  ],
  moon: [
    ['#070b16', '#0f1a2e', '#1a2a44', '#2a3a54'],
    ['#080a12', '#121828', '#1e2840', '#30384e'],
  ],
  dusk: [
    ['#0b0a1a', '#1a1630', '#3a2440', '#6a3a40', '#8a5040'],
    ['#0a0c1a', '#1c1a34', '#40284a', '#7a4248'],
  ],
  dawn: [
    ['#0a0e1c', '#16203a', '#2a3450', '#4a4a5e', '#7a6a6a'],
    ['#080c18', '#121c32', '#24304a', '#3e4a5e', '#6a7078'],
  ],
};

const CALL_A = ['K', 'W', 'X', 'Z', 'R', 'V', 'Q', 'J'];
const CALL_B = ['RFS', 'LOW', 'NITE', 'ZAP', 'MUD', 'FOG', 'OWL', 'BRR', 'HUM', 'DIY', 'SKY', 'RAT', 'GNO', 'WAX', 'DUB'];
const CALL_C = ['FM', '', '', '!', ' FM', ''];

/** Pick a pirate's look from its variant hash. `salt` keeps the four kinds from correlating. */
export function pirateLook(variant: number, accent: Color, salt: number, allowSnow = true): PirateLook {
  const rng = new Rng((variant ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0 || 7);
  const tod = rng.pick<TimeOfDay>(['night', 'night', 'moon', 'moon', 'dusk', 'dawn']);
  const weathers: Weather[] = ['clear', 'clear', 'rain', 'fog', 'wind', 'rain'];
  if (allowSnow) weathers.push('snow');
  const weather = rng.pick(weathers);
  const sky = rng.pick(SKIES[tod]).map(hex);
  const land = mix(sky[0]!, hex('#000000'), 0.35);
  const haze = tod === 'dusk' ? hex('#6a4a58') : tod === 'dawn' ? hex('#6a7086') : hex('#3a4458');
  const warm = rng.pick(['#ffb46a', '#ffc884', '#ffa860', '#ffd8a0'].map(hex));
  // Practical lights take the pirate's colour, pulled slightly toward warm so it reads as a bulb.
  const practical = mix(accent, warm, 0.15);
  let callsign = rng.pick(CALL_A) + rng.pick(CALL_B) + rng.pick(CALL_C);
  if (rng.chance(0.35)) callsign = `${rng.int(2, 9)}${rng.pick(CALL_B)}`;
  const moon = tod === 'moon' || (tod === 'night' && rng.chance(0.3)) ? { x: rng.range(40, 280), y: rng.range(30, 56), r: rng.range(5, 9) } : null;
  const starDensity = tod === 'night' ? rng.range(0.25, 0.5) : tod === 'moon' ? rng.range(0.15, 0.3) : rng.range(0.03, 0.12);
  return { rng, tod, weather, sky, land, haze, warm, practical, callsign, moon, starDensity };
}

/** Paint a pirate sky: gradient, stars, moon (with halo), all baked. */
export function pirateSky(g: Gfx, L: PirateLook, horizon: number) {
  g.vgrad(L.sky, g.top, horizon);
  // stars
  for (let y = g.top; y < horizon - 10; y++) {
    for (let x = g.left; x < g.right; x++) {
      const h = hash3(x, y, 77);
      if (h > L.starDensity * 0.02) continue;
      const fade = clamp((horizon - 10 - y) / 60);
      g.pxA(x, y, hex('#cdd6ef'), (0.25 + 0.6 * hash3(x, y, 78)) * fade);
    }
  }
  if (L.moon) {
    const { x, y, r } = L.moon;
    g.glow(x, y, r * 6, hex('#9aa8c8'), 0.18, 6);
    g.disc(x, y, r, hex('#d8dccc'));
    g.disc(x - 1, y - 1, r - 1, hex('#e8eadc'));
    // a few maria
    g.disc(x + r * 0.3, y - r * 0.2, r * 0.3, hex('#c4c6b6'));
    g.disc(x - r * 0.3, y + r * 0.35, r * 0.22, hex('#c4c6b6'));
  }
  if (L.tod === 'dusk' || L.tod === 'dawn') g.glow(L.rng.range(60, 260), horizon + 6, 120, L.tod === 'dusk' ? hex('#a05a40') : hex('#7a8090'), 0.22, 6);
}

/** Weather overlay for pirates (per frame). */
export function pirateWeather(g: Gfx, L: PirateLook, t: number, fogs: Haze[] | null, ground: number) {
  if (L.weather === 'rain') rain(g, t, g.left, g.top, g.right, g.bottom, 160, hex('#9aa8c0'), 0.35, 0.18, 230, 7, 4);
  else if (L.weather === 'snow') snow(g, t, g.left, g.top, g.right, g.bottom, 140, hex('#e8ecf4'), 0.8, 6);
  else if (L.weather === 'wind') {
    // the odd leaf or bit of litter blowing through
    for (let i = 0; i < 6; i++) {
      const p = (t * (40 + i * 7) + hash3(i, 9) * 600) % 480;
      const x = g.left - 20 + p;
      const y = ground - 30 + hash3(i, 10) * 60 + Math.sin(t * 3 + i) * 6;
      g.px(x, y, hex('#4a3a2a'));
      g.px(x + 1, y + (Math.sin(t * 9 + i) > 0 ? 1 : 0), hex('#5a4630'));
    }
  }
  if (fogs && L.weather === 'fog') {
    drawHaze(g, fogs[0]!, ground - 50, t * 3, L.haze, 0.55);
    drawHaze(g, fogs[1]!, ground - 20, -t * 5, L.haze, 0.7);
  }
}

/** Ordered-dither blend of two colours by fraction (for single pixels). */
export function dith(a: Color, b: Color, f: number, x: number, y: number): Color {
  return f > bayer(x, y) ? b : a;
}

export const DEEP_INK = hex('#040509');

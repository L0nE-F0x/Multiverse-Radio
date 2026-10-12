// Packed colors for the scene framebuffer.
//
// A Color is a 32-bit integer laid out the way a little-endian Int32Array view over
// ImageData bytes expects it (0xAABBGGRR). Every opaque color has alpha 255, so 0 is
// free to mean "transparent" in sprites and overlay layers. Colors are kept as *signed*
// int32: with alpha 255 they land in -2^24..-1, which V8 stores as small integers, so
// color math never allocates heap numbers.

export type Color = number;

export const TRANSPARENT: Color = 0;

export function rgb(r: number, g: number, b: number): Color {
  return 0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);
}

const hexCache = new Map<string, Color>();

/** '#rrggbb' → Color. Memoized, so it's cheap (and allocation-free) inside frame code. */
export function hex(value: string): Color {
  let c = hexCache.get(value);
  if (c === undefined) {
    const n = parseInt(value.charAt(0) === '#' ? value.slice(1) : value, 16);
    c = rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
    hexCache.set(value, c);
  }
  return c;
}

export const red = (c: Color) => c & 255;
export const green = (c: Color) => (c >>> 8) & 255;
export const blue = (c: Color) => (c >>> 16) & 255;

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** Linear blend from a to b. */
export function mix(a: Color, b: Color, t: number): Color {
  return rgb(
    red(a) + (red(b) - red(a)) * t,
    green(a) + (green(b) - green(a)) * t,
    blue(a) + (blue(b) - blue(a)) * t,
  );
}

/** Multiply brightness (k < 1 darkens, k > 1 brightens). */
export function shade(c: Color, k: number): Color {
  return rgb(red(c) * k, green(c) * k, blue(c) * k);
}

/** Hue-shifted shading in the pixel-art tradition: shadows go cool, highlights go warm. */
export function tone(c: Color, k: number): Color {
  if (k < 1) return mix(shade(c, k), rgb(40, 30, 90), (1 - k) * 0.25);
  return mix(c, rgb(255, 245, 210), Math.min(1, k - 1));
}

/** n evenly spaced colors through the given stops. */
export function ramp(stops: Color[], n: number): Color[] {
  const out: Color[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i / Math.max(1, n - 1)) * (stops.length - 1);
    const j = Math.min(stops.length - 2, Math.floor(p));
    out.push(mix(stops[j]!, stops[j + 1]!, p - j));
  }
  return out;
}

/** HSV → Color. h in turns (0–1), s and v 0–1. */
export function hsv(h: number, s: number, v: number): Color {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = v;
  let g = t;
  let b = p;
  switch (i % 6) {
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return rgb(r * 255, g * 255, b * 255);
}

export function toCss(c: Color): string {
  return `rgb(${red(c)} ${green(c)} ${blue(c)})`;
}

/** Perceived luminance 0–255. */
export function luma(c: Color): number {
  return red(c) * 0.299 + green(c) * 0.587 + blue(c) * 0.114;
}

// ── moody palettes (v3) ──────────────────────────────────────────────────
// Scenes look finer when colours are a little desaturated and ramps shift hue (cool, deep
// shadows; warm, pale highlights) instead of just getting darker.

/** Pull a colour toward its own grey: k = 0 unchanged, 1 fully grey. */
export function desaturate(c: Color, k: number): Color {
  const l = luma(c);
  return rgb(red(c) + (l - red(c)) * k, green(c) + (l - green(c)) * k, blue(c) + (l - blue(c)) * k);
}

/** Color → [hue (turns 0–1), saturation 0–1, lightness 0–1]. */
export function toHsl(c: Color): [number, number, number] {
  const r = red(c) / 255;
  const g = green(c) / 255;
  const b = blue(c) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

/** HSL → Color. h in turns (0–1), s and l 0–1. */
export function hsl(h: number, s: number, l: number): Color {
  h = ((h % 1) + 1) % 1;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  l = l < 0 ? 0 : l > 1 ? 1 : l;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgb(ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255);
}

/** Same hue with saturation and lightness scaled (k < 1 mutes / darkens). */
export function mute(c: Color, sat = 0.55, light = 1): Color {
  const [h, s, l] = toHsl(c);
  return hsl(h, s * sat, l * light);
}

/** Rotate the hue (turns). */
export function hueShift(c: Color, turns: number): Color {
  const [h, s, l] = toHsl(c);
  return hsl(h + turns, s, l);
}

/** Night version of a colour: darker, bluer, less saturated. k 0..1. */
export function night(c: Color, k = 0.6): Color {
  return mix(desaturate(c, 0.5 * k), mix(shade(c, 0.25), rgb(18, 24, 52), 0.6), k * 0.75);
}

/** Blend toward an atmosphere colour by depth (0 = near, 1 = lost in the haze). */
export function atmos(c: Color, hazeColor: Color, depth: number): Color {
  return mix(c, hazeColor, depth < 0 ? 0 : depth > 1 ? 1 : depth);
}

export interface RampOptions {
  /** Saturation multiplier for the whole ramp (default 0.6: muted). */
  sat?: number;
  /** Lightness of the darkest and lightest steps (defaults 0.07 and 0.78). */
  dark?: number;
  light?: number;
  /** How far the shadows rotate toward blue, in turns (default 0.06). */
  cool?: number;
  /** How far the highlights rotate toward warm yellow, in turns (default 0.03). */
  warm?: number;
}

/**
 * A muted, hue-shifting ramp of n colours (dark → light) around a base colour: shadows lean
 * cool and stay fairly saturated, highlights lean warm and pale. Use it for the station
 * accent so it reads as lit material rather than a flat UI colour:
 *   const lacquer = moodRamp(accent, 5, { sat: 0.5 });
 */
export function moodRamp(base: Color, n = 5, o: RampOptions = {}): Color[] {
  const [h, s] = toHsl(base);
  const sat = o.sat ?? 0.6;
  const lo = o.dark ?? 0.07;
  const hi = o.light ?? 0.78;
  const toward = (target: number, amount: number) => {
    let d = target - h;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return Math.sign(d) * Math.min(Math.abs(d), amount);
  };
  const cool = toward(0.66, o.cool ?? 0.06);
  const warm = toward(0.13, o.warm ?? 0.03);
  const out: Color[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const hh = h + cool * (1 - t) * (1 - t) + warm * t * t;
    // Saturation peaks in the lower mids and falls away in the highlights.
    const ss = s * sat * (0.8 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.4 * t * t);
    out.push(hsl(hh, ss, lo + (hi - lo) * Math.pow(t, 0.95)));
  }
  return out;
}

/** The accent as a soft, less saturated light colour (glows that shouldn't shout). */
export function accentLight(accent: Color, k = 0.7): Color {
  const [h, s] = toHsl(accent);
  return hsl(h, Math.min(1, s * 0.7), 0.5 + 0.2 * k);
}

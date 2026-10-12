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

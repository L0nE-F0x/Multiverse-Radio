// Sprites drawn as text maps. Each character maps to a palette color; '.' and ' ' are
// transparent. Compile once at scene creation, never per frame.

import { type Color, TRANSPARENT } from './color';

export interface Sprite {
  w: number;
  h: number;
  /** Row-major colors; 0 = transparent. */
  d: Uint32Array;
}

/**
 * Build a sprite from a multi-line string (common indentation and blank edge lines
 * are stripped) or an array of rows.
 */
export function sprite(art: string | string[], palette: Record<string, Color>): Sprite {
  let rows = Array.isArray(art) ? art.slice() : art.split('\n');
  while (rows.length && rows[0]!.trim() === '') rows.shift();
  while (rows.length && rows[rows.length - 1]!.trim() === '') rows.pop();
  const indent = Math.min(...rows.filter((r) => r.trim()).map((r) => r.length - r.trimStart().length));
  rows = rows.map((r) => r.slice(indent).trimEnd());
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const d = new Uint32Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      const c = palette[ch];
      if (c === undefined) throw new Error(`sprite: no color for '${ch}'`);
      d[y * w + x] = c;
    }
  });
  return { w, h, d };
}

/** Copy with colors swapped (exact matches). */
export function recolor(s: Sprite, swaps: [Color, Color][]): Sprite {
  const d = s.d.slice();
  for (let i = 0; i < d.length; i++) {
    for (const [from, to] of swaps) {
      if (d[i] === from) {
        d[i] = to;
        break;
      }
    }
  }
  return { w: s.w, h: s.h, d };
}

/** Copy with every opaque pixel mapped through fn. */
export function mapColors(s: Sprite, fn: (c: Color) => Color): Sprite {
  const d = s.d.slice();
  for (let i = 0; i < d.length; i++) if (d[i] !== TRANSPARENT) d[i] = fn(d[i]!);
  return { w: s.w, h: s.h, d };
}

/** Copy with a 1px outline around the opaque area (sprite grows by 2 in each axis). */
export function outlined(s: Sprite, color: Color): Sprite {
  const w = s.w + 2;
  const h = s.h + 2;
  const d = new Uint32Array(w * h);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.d[y * s.w + x] === TRANSPARENT) continue;
      for (let oy = 0; oy <= 2; oy++) for (let ox = 0; ox <= 2; ox++) d[(y + oy) * w + x + ox] = color;
    }
  }
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const c = s.d[y * s.w + x]!;
      if (c !== TRANSPARENT) d[(y + 1) * w + x + 1] = c;
    }
  }
  return { w, h, d };
}

export function flipX(s: Sprite): Sprite {
  const d = new Uint32Array(s.d.length);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) d[y * s.w + x] = s.d[y * s.w + (s.w - 1 - x)]!;
  return { w: s.w, h: s.h, d };
}

export function flipY(s: Sprite): Sprite {
  const d = new Uint32Array(s.d.length);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) d[y * s.w + x] = s.d[(s.h - 1 - y) * s.w + x]!;
  return { w: s.w, h: s.h, d };
}

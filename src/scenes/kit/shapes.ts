// Composite shapes built on Gfx primitives.

import type { Color } from './color';
import type { Gfx } from './gfx';

/** Rectangle with chamfered (pixel-rounded) corners. */
export function roundRect(g: Gfx, x: number, y: number, w: number, h: number, r: number, c: Color) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (r <= 0) return g.rect(x, y, w, h, c);
  for (let i = 0; i < h; i++) {
    const d = i < r ? r - i : i >= h - r ? i - (h - r - 1) : 0;
    // quarter-circle-ish inset
    const inset = d > 0 ? Math.round(r - Math.sqrt(Math.max(0, r * r - d * d))) : 0;
    g.rect(x + inset, y + i, w - inset * 2, 1, c);
  }
}

/** 1px rectangle outline. */
export function frameRect(g: Gfx, x: number, y: number, w: number, h: number, c: Color) {
  g.rect(x, y, w, 1, c);
  g.rect(x, y + h - 1, w, 1, c);
  g.rect(x, y, 1, h, c);
  g.rect(x + w - 1, y, 1, h, c);
}

/** Thick elliptical arc from angle a0 to a1 (radians, 0 = right, clockwise in screen space). */
export function arc(g: Gfx, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, c: Color, thick = 1) {
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * (rx + ry)));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (thick <= 1) g.px(Math.round(x), Math.round(y), c);
    else g.disc(Math.round(x), Math.round(y), (thick - 1) / 2, c);
  }
}

/** Top half of an ellipse (umbrellas, domes, mushroom caps). */
export function dome(g: Gfx, cx: number, cy: number, rx: number, ry: number, c: Color) {
  const r = Math.ceil(ry);
  for (let dy = -r; dy <= 0; dy++) {
    const t = 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5));
    if (t <= 0) continue;
    const hw = Math.floor(Math.sqrt(t) * (rx + 0.5));
    g.rect(Math.floor(cx) - hw, Math.floor(cy) + dy, hw * 2 + 1, 1, c);
  }
}

/** Shaded ball with a 1px outline. */
export function outlinedBall(g: Gfx, cx: number, cy: number, rx: number, ry: number, ramp: readonly Color[], outline: Color, lx = -0.5, ly = -0.6) {
  g.ellipse(cx, cy, rx + 1, ry + 1, outline);
  g.ball(cx, cy, rx, ry, ramp, lx, ly);
}

/** A thick line (round caps). */
export function thickLine(g: Gfx, x0: number, y0: number, x1: number, y1: number, w: number, c: Color) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.disc(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), (w - 1) / 2, c);
  }
}

/** Eye: white, pupil looking (lx, ly) in -1..1, optional lid closing 0..1 from the top. */
export function eye(g: Gfx, x: number, y: number, r: number, white: Color, pupil: Color, lid: Color, lx = 0, ly = 0, closed = 0) {
  x = Math.round(x);
  y = Math.round(y);
  if (closed >= 1) {
    g.hline(x - r, x + r, y, pupil);
    return;
  }
  g.disc(x, y, r, white);
  const pr = Math.max(0, r - 1);
  const px = Math.round(x + lx * (r - pr));
  const py = Math.round(y + ly * (r - pr));
  if (pr >= 1) g.disc(px, py, pr * 0.75, pupil);
  else g.px(px, py, pupil);
  if (closed > 0) {
    const rows = Math.round(closed * (r * 2 + 1));
    for (let i = 0; i < rows; i++) {
      const dy = -r + i;
      const hw = Math.floor(Math.sqrt(Math.max(0, (r + 0.5) ** 2 - dy * dy)));
      g.hline(x - hw, x + hw, y + dy, lid);
    }
    const dy = -r + rows;
    const hw = Math.floor(Math.sqrt(Math.max(0, (r + 0.5) ** 2 - dy * dy)));
    if (rows <= r * 2) g.hline(x - hw, x + hw, y + dy, pupil);
  }
}

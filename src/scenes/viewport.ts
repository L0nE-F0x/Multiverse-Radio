// Maps a container's aspect ratio onto a view of the 320×180 world.
//
// Landscape containers see the full 180 rows and as much width as their aspect needs
// (cropping the sides down to the central 192 px, or extending them up to 384 px).
// Portrait containers keep the central 192 px of width and extend vertically up to
// 384 rows, so a phone shows more sky and floor rather than a sliver of the scene.
// Anything beyond those limits is cropped by CSS `object-fit: cover`.

import { H, W } from './kit/gfx';

export const SAFE_W = 192;
const MAX_W = 384;
const MAX_H = 384;

export interface View {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

export function computeView(aspect: number, focusX = W / 2, focusY = H / 2): View {
  if (!Number.isFinite(aspect) || aspect <= 0) aspect = W / H;
  let w: number;
  let h: number;
  if (aspect >= SAFE_W / H) {
    h = H;
    w = Math.min(MAX_W, Math.round(H * aspect));
  } else {
    w = SAFE_W;
    h = Math.min(MAX_H, Math.round(SAFE_W / aspect));
  }
  // Keep the design area in view where possible: centre on the focus, but never show
  // past the design edges when the view is smaller than the design.
  let ox = Math.round(focusX - w / 2);
  let oy = Math.round(focusY - h / 2);
  if (w <= W) ox = Math.max(0, Math.min(W - w, ox));
  else ox = Math.round(W / 2 - w / 2);
  if (h <= H) oy = Math.max(0, Math.min(H - h, oy));
  else oy = Math.round(H / 2 - h / 2 + (focusY - H / 2));
  return { w, h, ox, oy };
}

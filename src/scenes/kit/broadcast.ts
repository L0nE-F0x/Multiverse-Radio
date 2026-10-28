// Broadcast-reactive scene kit helpers (v5, Pillar 1):
//   - onAirLamp: compact studio ON AIR indicator (5×3 or labelled sign) that lights on voice/speech
//   - callLamp: blinking amber/cyan incoming-call lamp when f.voiceCategory === 'call'
//   - sectionDrive: musical section energy multiplier ('drop' → 1.35, 'breakdown' → 0.65, etc.)
//   - applyBroadcastLens: universal post-raster lens for multiverse events, HUSH override & bleed

import { type Color, hex, mix } from './color';
import { clamp } from './fx';
import { type Gfx, addPx, blendPx } from './gfx';
import { hash3 } from './rng';
import type { Frame } from '../types';

const HOUSING = hex('#0c0506');
const LAMP_DIM = hex('#2c090a');
const LAMP_RED = hex('#ec3428');
const LAMP_AMBER = hex('#ffb040');
const LAMP_HOT = hex('#fff2d6');

const CALL_OFF = hex('#261e18');
const CALL_RIM = hex('#120e0c');
const CALL_AMBER = hex('#ffb848');
const CALL_CYAN = hex('#5ceeff');

const STORM_VIOLET = hex('#b46cff');
const STORM_CYAN = hex('#5ceeff');
const CONV_GOLD = hex('#ffd26a');
const CONV_VIOLET = hex('#a86cff');
const BEYOND_CYAN = hex('#7affd4');
const SLIP_TINT = hex('#d8b888');
const HUSH_AMBER = hex('#ffb000');

/**
 * Draws a compact pixel-art studio `ON AIR` indicator box (`5×3` by default, or with tiny
 * `'ON AIR'` text when `opts?.label` is true). Dim when music plays; lights up warm red/amber
 * when `f.segmentKind === 'voice'` or `(f.speech ?? 0) > 0.05`, modulating its halo with `f.speech`.
 */
export function onAirLamp(g: Gfx, x: number, y: number, f: Frame, opts?: { label?: boolean }): void {
  const speech = clamp(f.speech ?? 0, 0, 1);
  const isVoice = f.segmentKind === 'voice' || speech > 0.05;
  const awake = f.playing ? Math.max(0.45, f.awake) : f.awake * 0.3;
  const lit = isVoice ? clamp(0.65 + speech * 0.35, 0, 1) : clamp(0.18 * awake, 0, 1);
  const lampC = mix(LAMP_RED, LAMP_AMBER, speech * 0.45);
  const faceC = mix(LAMP_DIM, lampC, lit);
  const coreC = mix(lampC, LAMP_HOT, 0.35 + speech * 0.55);

  x = Math.floor(x);
  y = Math.floor(y);

  if (opts?.label) {
    const w = 29;
    const h = 9;
    g.rect(x - 1, y - 1, w + 2, h + 2, HOUSING);
    g.rect(x, y, w, h, faceC);
    const textC = mix(hex('#541818'), coreC, lit);
    g.text('ON AIR', x + 2, y + 2, textC);
    const cx = x + 14;
    const cy = y + 4;
    const haloR = 14 + speech * 14;
    const haloK = isVoice ? 0.2 + speech * 0.38 : 0.05 * awake;
    g.glow(cx, cy, haloR, lampC, haloK, 4);
    if (isVoice || speech > 0) g.light(cx, cy, haloR, 0.1 + speech * 0.35);
  } else {
    g.rect(x - 1, y - 1, 7, 5, HOUSING);
    g.rect(x, y, 5, 3, faceC);
    if (isVoice) {
      g.hline(x + 1, x + 3, y + 1, coreC);
    } else {
      g.px(x + 2, y + 1, mix(LAMP_DIM, LAMP_RED, 0.35 * awake));
    }
    const cx = x + 2;
    const cy = y + 1;
    const haloR = 7 + speech * 9;
    const haloK = isVoice ? 0.18 + speech * 0.36 : 0.04 * awake;
    g.glow(cx, cy, haloR, lampC, haloK, 3);
    if (isVoice || speech > 0) g.light(cx, cy, haloR, 0.08 + speech * 0.3);
  }
}

/**
 * Blinks an amber/cyan incoming-call indicator when `f.voiceCategory === 'call'`.
 */
export function callLamp(g: Gfx, x: number, y: number, f: Frame): void {
  x = Math.floor(x);
  y = Math.floor(y);
  const isCall = f.voiceCategory === 'call';
  g.rect(x - 2, y - 2, 5, 5, CALL_RIM);

  if (!isCall) {
    g.rect(x - 1, y - 1, 3, 3, CALL_OFF);
    return;
  }

  const speech = clamp(f.speech ?? 0, 0, 1);
  // Alternate between warm amber and bright cyan when not in reduced-motion mode.
  const phase = f.reduced ? 0.35 : 0.5 + 0.5 * Math.sin(f.t * 10);
  const blink = f.reduced ? 1 : 0.65 + 0.35 * (Math.floor(f.t * 5) % 2);
  const col = mix(CALL_AMBER, CALL_CYAN, phase);
  const core = mix(col, hex('#ffffff'), 0.35 + speech * 0.35);

  g.rect(x - 1, y - 1, 3, 3, mix(CALL_OFF, col, blink));
  g.px(x, y, core);
  g.glow(x, y, 6 + speech * 4, col, (0.28 + speech * 0.22) * blink, 3);
}

/**
 * Smooth multiplier based on `f.section` so music scenes intensify lights/lasers/motion on
 * drops and calm down on breakdowns.
 */
export function sectionDrive(f: Frame): number {
  switch (f.section) {
    case 'drop':
      return 1.35;
    case 'chorus':
      return 1.18;
    case 'breakdown':
      return 0.65;
    case 'intro':
    case 'outro':
      return 0.8;
    case 'verse':
    default:
      return 1.0;
  }
}

/**
 * Universal Post-Raster Broadcast Lens applied to `gfx.buf` right after `scene.frame(gfx, f)`
 * and before `Post.apply`. Subtly reflects multiverse-wide events, HUSH's carrier override,
 * and adjacent-station bleed across every scene in the multiverse.
 */
export function applyBroadcastLens(buf: Int32Array, w: number, h: number, f: Frame, accent: Color): void {
  if (f.reduced || w <= 0 || h <= 0 || buf.length < w * h) return;

  const t = f.t;
  const ev = f.event;

  // 1. Dimensional storm: horizontal scanline shear (1–3 px shift on a few rows) + violet/cyan static flecks.
  if (ev === 'dimensional-storm') {
    const bucket = Math.floor(t * 12);
    const bandCount = 4;
    for (let b = 0; b < bandCount; b++) {
      const ry = Math.floor(hash3(bucket, b, 11) * h);
      const bandH = 2 + Math.floor(hash3(bucket, b, 12) * 3);
      const shift = (hash3(bucket, b, 13) > 0.5 ? 1 : -1) * (1 + Math.floor(hash3(bucket, b, 14) * 3));
      for (let dy = 0; dy < bandH; dy++) {
        const y = (ry + dy) % h;
        const row = y * w;
        if (shift > 0) {
          for (let x = w - 1; x >= 0; x--) {
            const sx = x - shift >= 0 ? x - shift : 0;
            buf[row + x] = buf[row + sx]!;
          }
        } else {
          for (let x = 0; x < w; x++) {
            const sx = x - shift < w ? x - shift : w - 1;
            buf[row + x] = buf[row + sx]!;
          }
        }
        // Static ionisation flecks along the sheared scanlines.
        for (let fIdx = 0; fIdx < 6; fIdx++) {
          const fx = Math.floor(hash3(bucket, y * 7 + fIdx, 19) * w);
          const fleckC = (fIdx & 1) === 0 ? STORM_VIOLET : STORM_CYAN;
          buf[row + fx] = blendPx(buf[row + fx]!, fleckC, 0.55);
        }
      }
    }
  }

  // 2. Convergence: soft harmonic aurora shimmer along the top 16 rows tinted toward golden/violet.
  if (ev === 'convergence') {
    const rows = Math.min(h, 16);
    const harmTint = mix(CONV_GOLD, accent, 0.25);
    for (let y = 0; y < rows; y++) {
      const falloff = 1 - y / rows;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const wave = 0.5 + 0.5 * Math.sin(x * 0.08 + t * 2.4 + y * 0.3);
        const auroraC = mix(harmTint, CONV_VIOLET, wave);
        const a = falloff * (0.14 + 0.14 * wave);
        buf[row + x] = blendPx(buf[row + x]!, auroraC, a);
      }
    }
  }

  // 3. Signal from beyond: slow, eerie concentric carrier ripple near the centre of the viewport.
  if (ev === 'signal-from-beyond') {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.min(w, h) * 0.45;
    const carrierC = mix(BEYOND_CYAN, accent, 0.3);
    const cr = (carrierC & 255) * 0.26;
    const cg = ((carrierC >>> 8) & 255) * 0.26;
    const cb = ((carrierC >>> 16) & 255) * 0.26;
    const x0 = Math.max(1, Math.floor(cx - maxR));
    const x1 = Math.min(w - 2, Math.ceil(cx + maxR));
    const y0 = Math.max(1, Math.floor(cy - maxR));
    const y1 = Math.min(h - 2, Math.ceil(cy + maxR));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const r = Math.hypot(dx, dy);
        if (r >= maxR) continue;
        const ripple = Math.sin(r * 0.45 - t * 3.0);
        if (ripple <= 0.2) continue;
        const env = (1 - r / maxR) * ((ripple - 0.2) / 0.8);
        const sx = Math.min(w - 1, Math.max(0, x + (dx >= 0 ? 1 : -1)));
        const blended = blendPx(buf[row + x]!, buf[row + sx]!, env * 0.35);
        buf[row + x] = addPx(blended, cr * env, cg * env, cb * env);
      }
    }
  }

  // 4. Time-slip: gentle horizontal sine-wave tape-flutter displacement on scanlines.
  if (ev === 'time-slip') {
    for (let y = 0; y < h; y++) {
      const wave = Math.sin(y * 0.15 + t * 4.2 + 0.6);
      const shift = Math.round(wave * 2);
      if (shift === 0) continue;
      const row = y * w;
      if (shift > 0) {
        for (let x = w - 1; x >= 0; x--) {
          const sx = x - shift >= 0 ? x - shift : 0;
          buf[row + x] = blendPx(buf[row + sx]!, SLIP_TINT, 0.06 * shift);
        }
      } else {
        const absS = -shift;
        for (let x = 0; x < w; x++) {
          const sx = x + absS < w ? x + absS : w - 1;
          buf[row + x] = blendPx(buf[row + sx]!, SLIP_TINT, 0.06 * absS);
        }
      }
    }
  }

  // 5. HUSH carrier override: subtle 1 px tall translucent amber scanline bar sweeping vertically.
  if (f.hush) {
    const barY = ((Math.floor(t * 22) % h) + h) % h;
    const row = barY * w;
    for (let x = 0; x < w; x++) {
      buf[row + x] = blendPx(buf[row + x]!, HUSH_AMBER, 0.3);
    }
  }

  // 6. Adjacent station bleed: faint interlaced ghost scanlines on odd rows proportional to f.bleed.
  const bleed = f.bleed ?? 0;
  if (bleed > 0.1) {
    const k = clamp((bleed - 0.1) / 0.9, 0.04, 1);
    const ghostTint = mix(accent, hex('#88a8d8'), 0.5);
    const shift = Math.max(1, Math.min(3, Math.round(1 + bleed * 2)));
    for (let y = 1; y < h; y += 2) {
      const row = y * w;
      const prevRow = (y - 1) * w;
      for (let x = 0; x < w; x++) {
        const gx = (x + shift) % w;
        const ghostPx = blendPx(buf[prevRow + gx]!, ghostTint, 0.25);
        buf[row + x] = blendPx(buf[row + x]!, ghostPx, 0.12 + k * 0.28);
      }
    }
  }
}

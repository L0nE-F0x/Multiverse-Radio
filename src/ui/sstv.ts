// Slow-Scan Television (SSTV) telemetry generator & pixel-art card renderer.
//
// Produces deterministic 64×48 4-level phosphor intensity (0..1) frames for any tuned
// target (station, pirate, oddity, or static). Each frame has:
//   1. A crisp pixel-art telemetry header bar (3×5 bitmap glyph table)
//   2. A framing border and calibration reticle
//   3. A procedural diagram unique to the station/oddity/secret
//   4. A bottom telemetry clue line embedding actionable multiverse secret frequencies

import { formatMhz, hash } from './format';

export const SSTV_WIDTH = 64;
export const SSTV_HEIGHT = 48;

/** Four discrete phosphor intensity levels (off, dim graticule, mid trace, bright peak). */
export const SSTV_LEVELS = [0, 0.33, 0.67, 1] as const;

export interface SstvTarget {
  id: string;
  frequency: number;
  kind: 'station' | 'pirate' | 'oddity' | 'static';
  secret?: boolean;
}

export interface SstvCard {
  width: 64;
  height: 48;
  pixels: Float32Array;
  header: string;
  clue: string;
}

/**
 * Actionable secret frequency telemetry clues embedded in the SSTV bottom line.
 * Every secret station in the multiverse has a corresponding telemetry clue.
 */
export const SECRET_CLUES = [
  'SWB 97.8>89.3>114.8',
  'MIN 133.3 @ 03:33',
  'HRB 140.0 SHIFT 7',
  'IDLE 144.4 3MIN',
  'TX0 76.0 MHZ',
  'LGT 121.5 MHZ',
  'HUSH 99.15 MHZ',
] as const;

/** Stations and oddities mapped to specific secret frequency clues. */
const SECRET_CLUE_BY_ID: Record<string, (typeof SECRET_CLUES)[number]> = {
  // The Switchboard (131.1 MHz): sequence 97.8 -> 89.3 -> 114.8
  'the-switchboard': 'SWB 97.8>89.3>114.8',
  'ask-grenda': 'SWB 97.8>89.3>114.8',
  'every-news': 'SWB 97.8>89.3>114.8',
  'traffic-on-the-8s': 'SWB 97.8>89.3>114.8',
  'hold-music': 'SWB 97.8>89.3>114.8',
  'small-claims': 'SWB 97.8>89.3>114.8',

  // The Minute Between (133.3 MHz): clock window 03:33–03:46
  'minute-between': 'MIN 133.3 @ 03:33',
  'time-signal': 'MIN 133.3 @ 03:33',
  'oddity-clock': 'MIN 133.3 @ 03:33',
  'yesterday-fm': 'MIN 133.3 @ 03:33',
  'island-time': 'MIN 133.3 @ 03:33',
  'saturday-night-forever': 'MIN 133.3 @ 03:33',
  'end-lounge': 'MIN 133.3 @ 03:33',
  'snail-jams': 'MIN 133.3 @ 03:33',

  // The Harbour (140.0 MHz): shift 7
  'the-harbour': 'HRB 140.0 SHIFT 7',
  'free-frequency': 'HRB 140.0 SHIFT 7',
  'drowned-shanty-hour': 'HRB 140.0 SHIFT 7',
  'waystation-9': 'HRB 140.0 SHIFT 7',
  'substation-null': 'HRB 140.0 SHIFT 7',
  'the-long-dark': 'HRB 140.0 SHIFT 7',

  // Something Listening (144.4 MHz): idle 3 minutes in static
  'something-listening': 'IDLE 144.4 3MIN',
  'static-lullabies': 'IDLE 144.4 3MIN',
  'stuck-loop': 'IDLE 144.4 3MIN',
  'oddity-jukebox': 'IDLE 144.4 3MIN',
  'piano-empty-rooms': 'IDLE 144.4 3MIN',
  'wall-of-fog': 'IDLE 144.4 3MIN',

  // Transmission Zero (76.0 MHz): bottom of the deep band
  'transmission-zero': 'TX0 76.0 MHZ',
  'numbers-omega': 'TX0 76.0 MHZ',
  'test-tone': 'TX0 76.0 MHZ',
  'oddity-testcard': 'TX0 76.0 MHZ',
  'unsolved-dimensions': 'TX0 76.0 MHZ',
  'channel-surf': 'TX0 76.0 MHZ',

  // The Last Lighthouse (121.5 MHz): distress / maritime beacon frequency
  'last-lighthouse': 'LGT 121.5 MHZ',
  'distress-beacon': 'LGT 121.5 MHZ',
  'oddity-beacon': 'LGT 121.5 MHZ',
  whalesong: 'LGT 121.5 MHZ',
  'rainfall-fm': 'LGT 121.5 MHZ',
  'event-horizon-surf': 'LGT 121.5 MHZ',

  // HUSH: After Hours (99.15 MHz): Nightjar aft cabin
  'hush-after-hours': 'HUSH 99.15 MHZ',
  'void-beats': 'HUSH 99.15 MHZ',
  'bedtime-for-giants': 'HUSH 99.15 MHZ',
  'other-horoscopes': 'HUSH 99.15 MHZ',
  'crystal-delta': 'HUSH 99.15 MHZ',
  'breakbeat-observatory': 'HUSH 99.15 MHZ',
};

/**
 * 3×5 bitmap glyph table for crisp low-res telemetry headers and clues.
 * Each glyph is 5 rows of 3-character strings ('#' = lit, '.' = off).
 */
export const GLYPHS: Record<string, readonly [string, string, string, string, string]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['###', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '.##', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['##.', '.#.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '.': ['...', '...', '...', '...', '#..'],
  '-': ['...', '...', '###', '...', '...'],
  ':': ['...', '#..', '...', '#..', '...'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '@': ['###', '#.#', '###', '#..', '###'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  ' ': ['...', '...', '...', '...', '...'],
};

/** Quantize any intensity to one of the 4 canonical phosphor levels. */
export function quantizeLevel(value: number): number {
  if (value <= 0.16) return SSTV_LEVELS[0];
  if (value <= 0.5) return SSTV_LEVELS[1];
  if (value <= 0.83) return SSTV_LEVELS[2];
  return SSTV_LEVELS[3];
}

function setPixel(pixels: Float32Array, x: number, y: number, level: number): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= SSTV_WIDTH || iy < 0 || iy >= SSTV_HEIGHT) return;
  const q = quantizeLevel(level);
  const idx = iy * SSTV_WIDTH + ix;
  if (q > pixels[idx]!) pixels[idx] = q;
}

function drawLine(pixels: Float32Array, x0: number, y0: number, x1: number, y1: number, level: number): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const sx = ax < bx ? 1 : -1;
  const dy = -Math.abs(by - ay);
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (let steps = 0; steps < 128; steps++) {
    setPixel(pixels, ax, ay, level);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

function drawRect(pixels: Float32Array, x: number, y: number, w: number, h: number, level: number): void {
  drawLine(pixels, x, y, x + w - 1, y, level);
  drawLine(pixels, x, y + h - 1, x + w - 1, y + h - 1, level);
  drawLine(pixels, x, y, x, y + h - 1, level);
  drawLine(pixels, x + w - 1, y, x + w - 1, y + h - 1, level);
}

function drawCircle(pixels: Float32Array, cx: number, cy: number, r: number, level: number): void {
  const steps = Math.max(16, Math.round(r * 6));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    setPixel(pixels, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), level);
  }
}

/**
 * Renders an uppercase string using the 3×5 bitmap glyph table at `(x, y)`.
 * Automatically compacts punctuation/thin glyphs when the string is long so 19-char
 * telemetry clues like `SWB 97.8>89.3>114.8` fit cleanly inside a 64px frame.
 */
export function drawGlyphText(pixels: Float32Array, x: number, y: number, text: string, level = 1): number {
  const upper = text.toUpperCase();
  const compact = upper.length > 15;
  let cursor = Math.round(x);

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]!;
    const last = i === upper.length - 1;
    const glyph = GLYPHS[ch] ?? GLYPHS[' ']!;
    if (ch === ' ') {
      cursor += compact ? 1 : 3;
      continue;
    }
    const narrow = ch === '.' || ch === ':';
    const medium = compact && (ch === '1' || ch === '>');
    for (let row = 0; row < 5; row++) {
      const line = glyph[row]!;
      for (let col = 0; col < 3; col++) {
        if (line[col] === '#') {
          const gx = medium ? Math.min(1, col) : col;
          setPixel(pixels, cursor + gx, y + row, level);
        }
      }
    }
    const glyphW = narrow ? 1 : medium ? 2 : 3;
    cursor += last ? glyphW : glyphW + 1;
  }
  return cursor;
}

/** Resolve the secret telemetry clue embedded in a target's SSTV frame. */
export function clueForTarget(target: SstvTarget, frameIndex = 0): string {
  const mapped = SECRET_CLUE_BY_ID[target.id];
  if (mapped) return mapped;
  if (target.kind === 'static') {
    return frameIndex % 2 === 0 ? 'IDLE 144.4 3MIN' : SECRET_CLUES[Math.abs(frameIndex) % SECRET_CLUES.length]!;
  }
  const idx = (hash(target.id) + Math.max(0, Math.floor(frameIndex))) % SECRET_CLUES.length;
  return SECRET_CLUES[idx]!;
}

function headerForTarget(target: SstvTarget): string {
  const f = formatMhz(target.frequency);
  if (target.kind === 'static') return `NO LOCK ${f}`;
  const clean = target.id
    .replace(/^oddity-/, '')
    .replace(/^pirate-/, 'PIR-')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);
  return `${f} ${clean || 'SIG'}`;
}

type Archetype = 'lighthouse' | 'switchboard' | 'numbers' | 'ship' | 'clock' | 'starchart' | 'static' | 'waveform';

function pickArchetype(target: SstvTarget): Archetype {
  const id = target.id;
  if (target.kind === 'static' || id === 'something-listening' || id === 'static-lullabies') return 'static';
  if (id === 'last-lighthouse' || id === 'distress-beacon' || id === 'oddity-beacon' || id === 'rainfall-fm') return 'lighthouse';
  if (id === 'the-switchboard' || id === 'ask-grenda' || id === 'hold-music' || id === 'every-news' || id === 'traffic-on-the-8s') {
    return 'switchboard';
  }
  if (id === 'numbers-omega' || id === 'transmission-zero' || id === 'test-tone' || id === 'oddity-testcard' || id === 'unsolved-dimensions') {
    return 'numbers';
  }
  if (
    id === 'hush-after-hours' ||
    id === 'the-harbour' ||
    id === 'free-frequency' ||
    id === 'drowned-shanty-hour' ||
    target.kind === 'pirate'
  ) {
    return 'ship';
  }
  if (id === 'minute-between' || id === 'time-signal' || id === 'oddity-clock' || id === 'yesterday-fm' || id === 'island-time') {
    return 'clock';
  }
  if (
    id === 'other-horoscopes' ||
    id === 'breakbeat-observatory' ||
    id === 'whalesong' ||
    id === 'crystal-delta' ||
    id === 'tiki-satellite' ||
    id === 'velvet-collapse'
  ) {
    return 'starchart';
  }
  const pool: Archetype[] = ['waveform', 'starchart', 'ship', 'numbers', 'clock', 'lighthouse', 'switchboard'];
  return pool[hash(id) % pool.length]!;
}

/**
 * Generates a deterministic 64×48 4-level phosphor intensity telemetry frame for the
 * tuned target and optional frame index.
 */
export function renderSstvCard(target: SstvTarget, frameIndex = 0): SstvCard {
  const pixels = new Float32Array(SSTV_WIDTH * SSTV_HEIGHT);
  const header = headerForTarget(target);
  const clue = clueForTarget(target, frameIndex);
  const seed = hash(`${target.id}:${target.frequency.toFixed(2)}:${frameIndex}`);

  // 1. Outer framing reticle & horizontal divider rails.
  drawRect(pixels, 0, 0, SSTV_WIDTH, SSTV_HEIGHT, 0.33);
  drawLine(pixels, 1, 8, SSTV_WIDTH - 2, 8, 0.33);
  drawLine(pixels, 1, 39, SSTV_WIDTH - 2, 39, 0.33);
  for (let x = 8; x < SSTV_WIDTH - 1; x += 8) {
    setPixel(pixels, x, 8, 0.67);
    setPixel(pixels, x, 39, 0.67);
  }
  // Bright corner calibration L-ticks.
  for (const [cx, cy, dx, dy] of [
    [0, 0, 1, 1],
    [SSTV_WIDTH - 1, 0, -1, 1],
    [0, SSTV_HEIGHT - 1, 1, -1],
    [SSTV_WIDTH - 1, SSTV_HEIGHT - 1, -1, -1],
  ] as const) {
    setPixel(pixels, cx, cy, 1);
    setPixel(pixels, cx + dx, cy, 0.67);
    setPixel(pixels, cx, cy + dy, 0.67);
  }

  // 2. Top telemetry header bar (y = 2..6).
  drawGlyphText(pixels, 2, 2, header, 1);
  // Sync pip on top right.
  drawRect(pixels, 59, 2, 3, 5, 0.67);
  if (frameIndex % 2 === 0) setPixel(pixels, 60, 4, 1);

  // 3. Center procedural telemetry graphic (y = 9..38, x = 1..62).
  // Subtle graticule dots inside the viewport.
  for (let gy = 14; gy <= 34; gy += 10) {
    for (let gx = 8; gx <= 56; gx += 12) {
      setPixel(pixels, gx, gy, 0.33);
    }
  }

  const archetype = pickArchetype(target);

  switch (archetype) {
    case 'lighthouse': {
      // Sea horizon & wave ripples.
      for (let x = 2; x <= 61; x++) {
        if ((x + frameIndex) % 3 !== 0) setPixel(pixels, x, 34, 0.33);
        if ((x + frameIndex) % 5 < 2) setPixel(pixels, x, 36, 0.67);
      }
      // Rocky crag & lighthouse tower at x = 12..20.
      drawLine(pixels, 8, 34, 24, 34, 0.67);
      drawLine(pixels, 10, 33, 22, 33, 0.67);
      drawLine(pixels, 14, 32, 15, 16, 1);
      drawLine(pixels, 18, 32, 17, 16, 1);
      drawRect(pixels, 14, 13, 5, 3, 1);
      setPixel(pixels, 16, 14, 1);
      // Sweeping beacon rays across the sky.
      const sweep = (seed % 5) - 2;
      drawLine(pixels, 19, 14, 60, 11 + sweep, 1);
      drawLine(pixels, 19, 15, 60, 21 + sweep, 0.67);
      drawLine(pixels, 19, 14, 60, 16 + sweep, 0.33);
      drawLine(pixels, 13, 14, 2, 12 - sweep, 0.67);
      // Distant navigation stars & bearing tag.
      setPixel(pixels, 46, 12, 1);
      setPixel(pixels, 54, 27, 0.67);
      drawGlyphText(pixels, 34, 29, '121.5', 0.67);
      break;
    }

    case 'switchboard': {
      // 3-column jack matrix with patch cords connecting 97.8 -> 89.3 -> 114.8.
      const cols = [10, 31, 52];
      const rows = [13, 21, 29];
      for (let c = 0; c < cols.length; c++) {
        for (let r = 0; r < rows.length; r++) {
          const jx = cols[c]!;
          const jy = rows[r]!;
          drawRect(pixels, jx - 2, jy - 2, 5, 5, 0.33);
          setPixel(pixels, jx, jy, 0.67);
        }
      }
      const r0 = rows[seed % 3]!;
      const r1 = rows[(seed + 1) % 3]!;
      const r2 = rows[(seed + 2) % 3]!;
      drawLine(pixels, cols[0]!, r0, cols[1]!, r1, 1);
      drawLine(pixels, cols[1]!, r1, cols[2]!, r2, 1);
      setPixel(pixels, cols[0]!, r0, 1);
      setPixel(pixels, cols[1]!, r1, 1);
      setPixel(pixels, cols[2]!, r2, 1);
      drawGlyphText(pixels, 4, 33, 'SEQ 1>2>3', 0.67);
      break;
    }

    case 'numbers': {
      // Antenna mast with concentric radiation arcs on left + cipher matrix on right.
      drawLine(pixels, 11, 12, 11, 35, 1);
      drawLine(pixels, 6, 35, 11, 22, 0.67);
      drawLine(pixels, 16, 35, 11, 22, 0.67);
      setPixel(pixels, 11, 11, 1);
      drawCircle(pixels, 11, 13, 4, 0.67);
      drawCircle(pixels, 11, 13, 8, 0.33);
      // 3 rows of deterministic 3-digit groups.
      const g1 = String(100 + (seed % 899));
      const g2 = String(100 + ((seed >>> 7) % 899));
      const g3 = String(100 + ((seed >>> 14) % 899));
      drawGlyphText(pixels, 24, 12, `${g1} ${g2}`, 1);
      drawGlyphText(pixels, 24, 20, `${g3} 076`, 0.67);
      drawGlyphText(pixels, 24, 28, 'OMEGA TX', 0.67);
      break;
    }

    case 'ship': {
      // Orbital arc & sleek relay ship silhouette (Nightjar / Fleet).
      for (let x = 3; x <= 60; x++) {
        const y = Math.round(33 - Math.sin(((x - 3) / 57) * Math.PI) * 6);
        if (x % 2 === 0) setPixel(pixels, x, y, 0.33);
      }
      // Ship hull polygon.
      drawLine(pixels, 14, 22, 46, 22, 1);
      drawLine(pixels, 20, 17, 38, 17, 0.67);
      drawLine(pixels, 14, 22, 20, 17, 1);
      drawLine(pixels, 38, 17, 46, 22, 1);
      drawLine(pixels, 18, 25, 42, 25, 0.67);
      drawLine(pixels, 14, 22, 18, 25, 0.67);
      drawLine(pixels, 42, 25, 46, 22, 1);
      // Forward dish & beacon.
      drawLine(pixels, 46, 22, 52, 20, 1);
      drawLine(pixels, 46, 22, 52, 24, 1);
      setPixel(pixels, 54, 22, 1);
      // Thruster wake.
      drawLine(pixels, 7, 21, 12, 21, 0.67);
      drawLine(pixels, 5, 23, 12, 23, 0.33);
      // Star pips.
      for (let i = 0; i < 6; i++) {
        const sx = 4 + ((seed >>> (i * 3)) % 56);
        const sy = 10 + ((seed >>> (i * 3 + 2)) % 26);
        setPixel(pixels, sx, sy, i % 2 === 0 ? 0.67 : 0.33);
      }
      break;
    }

    case 'clock': {
      // Chronometer dial at (18, 23) + frozen 03:33 hands + Lissajous loop on right.
      drawCircle(pixels, 18, 23, 10, 0.67);
      setPixel(pixels, 18, 13, 1);
      setPixel(pixels, 28, 23, 1);
      setPixel(pixels, 18, 33, 1);
      setPixel(pixels, 8, 23, 1);
      // Hands pointing to 03:33.
      drawLine(pixels, 18, 23, 24, 23, 1);
      drawLine(pixels, 18, 23, 15, 30, 1);
      // Lissajous figure-8 on the right.
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        const lx = Math.round(46 + Math.sin(t) * 11);
        const ly = Math.round(21 + Math.sin(t * 2 + 0.6) * 8);
        setPixel(pixels, lx, ly, i % 2 === 0 ? 1 : 0.67);
      }
      drawGlyphText(pixels, 35, 32, '03:33', 1);
      break;
    }

    case 'starchart': {
      // Celestial sphere ellipse + constellation graph + coordinate tag.
      drawCircle(pixels, 22, 23, 11, 0.33);
      drawLine(pixels, 10, 23, 34, 23, 0.33);
      drawLine(pixels, 22, 11, 22, 35, 0.33);
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const h = hash(`${target.id}:star:${i}:${frameIndex}`);
        const px = 8 + (h % 48);
        const py = 11 + ((h >>> 8) % 20);
        pts.push([px, py]);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        drawLine(pixels, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], 0.67);
      }
      for (const [px, py] of pts) {
        setPixel(pixels, px, py, 1);
        setPixel(pixels, px - 1, py, 0.33);
        setPixel(pixels, px + 1, py, 0.33);
      }
      drawGlyphText(pixels, 36, 32, formatMhz(target.frequency), 0.67);
      break;
    }

    case 'static': {
      // Interference fringes + emergent listening eye contour in center.
      for (let y = 10; y <= 37; y += 2) {
        for (let x = 2; x <= 61; x++) {
          const n = hash(`${x}:${y}:${seed}`) & 15;
          if (n === 0) setPixel(pixels, x, y, 0.67);
          else if (n < 4) setPixel(pixels, x, y, 0.33);
        }
      }
      drawCircle(pixels, 32, 23, 9, 0.67);
      drawCircle(pixels, 32, 23, 4, 1);
      setPixel(pixels, 32, 23, 1);
      break;
    }

    case 'waveform': {
      // Multi-harmonic station waveform signature + spectrum bars.
      const f1 = 1 + (seed % 4);
      const f2 = 2 + ((seed >>> 4) % 5);
      const phase = ((seed >>> 8) % 628) / 100;
      let prevX = 2;
      let prevY = 21;
      for (let x = 2; x <= 61; x++) {
        const norm = (x - 2) / 59;
        const w =
          Math.sin(norm * Math.PI * 2 * f1 + phase) * 0.65 +
          Math.sin(norm * Math.PI * 2 * f2 - phase * 0.5) * 0.35;
        const y = Math.round(20 - w * 8);
        if (x > 2) drawLine(pixels, prevX, prevY, x, y, 1);
        prevX = x;
        prevY = y;
      }
      // Spectrum bars along bottom of viewport (y = 31..37).
      for (let b = 0; b < 14; b++) {
        const bx = 4 + b * 4;
        const bh = 1 + ((hash(`${seed}:bar:${b}`) >>> 0) % 7);
        for (let by = 37; by > 37 - bh; by--) {
          setPixel(pixels, bx, by, by === 37 - bh + 1 ? 1 : 0.67);
          setPixel(pixels, bx + 1, by, 0.33);
        }
      }
      break;
    }
  }

  // 4. Bottom telemetry clue line (y = 41..45).
  drawGlyphText(pixels, 1, 41, clue, 1);

  return {
    width: SSTV_WIDTH,
    height: SSTV_HEIGHT,
    pixels,
    header,
    clue,
  };
}

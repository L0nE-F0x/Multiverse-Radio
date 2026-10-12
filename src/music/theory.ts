// Music theory helpers: pitch classes, scales, chord qualities, roman-numeral
// progressions and voice leading. Pure functions, no audio.

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
  hungarianMinor: [0, 2, 3, 6, 7, 8, 11],
  lydianDominant: [0, 2, 4, 6, 7, 9, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  inSen: [0, 1, 5, 7, 10],
} as const satisfies Record<string, readonly number[]>;
export type ScaleName = keyof typeof SCALES;

/** Chord qualities as semitone intervals above the root. */
export const QUALITIES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  aug: [0, 4, 8],
  dim: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '6': [0, 4, 7, 9],
  '69': [0, 4, 7, 9, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  'maj7#11': [0, 4, 7, 11, 14, 18],
  maj13: [0, 4, 7, 11, 14, 21],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 14],
  '13': [0, 4, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7#11': [0, 4, 7, 10, 14, 18],
  '7b13': [0, 4, 7, 10, 13, 20],
  '7sus': [0, 5, 7, 10],
  '9sus': [0, 5, 7, 10, 14],
  '13sus': [0, 5, 10, 14, 21],
  m6: [0, 3, 7, 9],
  m69: [0, 3, 7, 9, 14],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  mmaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};

const QUALITY_DISPLAY: Record<string, string> = {
  m7b5: 'm7♭5',
  '7b9': '7♭9',
  '7#9': '7♯9',
  '7#11': '7♯11',
  '7b13': '7♭13',
  'maj7#11': 'maj7♯11',
  '69': '6/9',
  m69: 'm6/9',
  dim7: '°7',
  dim: '°',
  mmaj7: 'm(maj7)',
};

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export const pc = (n: number): number => ((n % 12) + 12) % 12;

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Whether a key is conventionally spelled with flats. */
export function prefersFlats(tonic: number, minor: boolean): boolean {
  const t = pc(minor ? tonic + 3 : tonic); // relative major
  return [5, 10, 3, 8, 1, 6].includes(t);
}

export function noteName(n: number, flats = true): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc(n)]!;
}

export function keyName(tonic: number, mode: string): string {
  const minorish = ['minor', 'dorian', 'phrygian', 'harmonicMinor', 'melodicMinor', 'hungarianMinor'].includes(mode);
  const label = mode === 'major' ? 'major' : mode === 'minor' ? 'minor' : mode.replace(/([A-Z])/g, ' $1').toLowerCase();
  return `${noteName(tonic, prefersFlats(tonic, minorish))} ${label}`;
}

export interface Chord {
  /** Root pitch class (absolute, 0 = C). */
  root: number;
  quality: string;
  /** Intervals above the root (may exceed 12 for extensions). */
  intervals: readonly number[];
  /** Bass pitch class if it differs from the root (slash chords). */
  bass?: number;
}

export function chord(root: number, quality: string, bass?: number): Chord {
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`Unknown chord quality "${quality}"`);
  const c: Chord = { root: pc(root), quality, intervals };
  if (bass !== undefined && pc(bass) !== pc(root)) c.bass = pc(bass);
  return c;
}

/** Pitch classes of a chord (deduplicated, root first). */
export function chordPcs(c: Chord): number[] {
  const out: number[] = [];
  for (const i of c.intervals) {
    const p = pc(c.root + i);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function bassPc(c: Chord): number {
  return c.bass ?? c.root;
}

export function chordSymbol(c: Chord, flats = true): string {
  const q = QUALITY_DISPLAY[c.quality] ?? c.quality;
  const base = noteName(c.root, flats) + q;
  return c.bass !== undefined ? `${base}/${noteName(c.bass, flats)}` : base;
}

const NUMERALS: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const ROMAN_RE = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/;
const LOWER_SUFFIX: Record<string, string> = {
  '': 'm',
  '7': 'm7',
  '9': 'm9',
  '11': 'm11',
  '6': 'm6',
  '69': 'm69',
  add9: 'madd9',
  maj7: 'mmaj7',
  ø: 'm7b5',
  ø7: 'm7b5',
  m7b5: 'm7b5',
  o: 'dim',
  dim: 'dim',
  o7: 'dim7',
  dim7: 'dim7',
};

function romanOffset(acc: string, numeral: string): number {
  return NUMERALS[numeral.toUpperCase()]! + (acc === 'b' ? -1 : acc === '#' ? 1 : 0);
}

/**
 * Parses a roman numeral relative to `tonic`. Case sets the chord family: lowercase is
 * minor ("ii9" = m9, "viiø" = half-diminished), uppercase is major/dominant ("V13",
 * "IVmaj9", "bVII9"). An optional "/numeral" sets the bass ("IV/V").
 */
export function parseRoman(token: string, tonic: number): Chord {
  const [main = '', slash] = token.split('/');
  const m = ROMAN_RE.exec(main);
  if (!m) throw new Error(`Bad roman numeral "${token}"`);
  const [, acc = '', numeral = '', suffix = ''] = m;
  const lower = numeral === numeral.toLowerCase();
  const quality = lower ? (LOWER_SUFFIX[suffix] ?? suffix) : suffix;
  const root = tonic + romanOffset(acc, numeral);
  let bass: number | undefined;
  if (slash) {
    const s = ROMAN_RE.exec(slash);
    if (!s) throw new Error(`Bad slash bass in "${token}"`);
    bass = tonic + romanOffset(s[1] ?? '', s[2] ?? 'I');
  }
  return chord(root, quality, bass);
}

/**
 * Parses a progression: whitespace separates bars, "+" splits a bar into equal halves.
 * "ii9 V13 Imaj9+VI7b9" ⇒ [[ii9], [V13], [Imaj9, VI7b9]].
 */
export function parseProgression(text: string, tonic: number): Chord[][] {
  return text
    .trim()
    .split(/\s+/)
    .map((bar) => bar.split('+').map((t) => parseRoman(t, tonic)));
}

/** Scale pitch classes for a tonic + scale. */
export function scalePcs(tonic: number, scale: readonly number[]): number[] {
  return scale.map((i) => pc(tonic + i));
}

/**
 * A playable scale over a chord: the key's scale with chord tones swapped in where they
 * clash (e.g. a C♯ over A7 in C major replaces C).
 */
export function chordScale(c: Chord, keyScale: readonly number[]): number[] {
  const tones = chordPcs(c);
  const out = new Set<number>(tones);
  for (const s of keyScale) {
    const clash = tones.some((t) => t !== s && (pc(s - t) === 1 || pc(t - s) === 1) && !keyScale.includes(t));
    if (!clash) out.add(s);
  }
  return [...out].sort((a, b) => a - b);
}

/** Nearest MIDI note at or around `target` whose pitch class is in `pcs`. Ties go up. */
export function nearestInSet(target: number, pcs: readonly number[]): number {
  for (let d = 0; d < 12; d++) {
    if (pcs.includes(pc(target + d))) return target + d;
    if (pcs.includes(pc(target - d))) return target - d;
  }
  return target;
}

/** Moves `steps` scale steps from `from` (which needn't be in the scale). */
export function stepInSet(from: number, pcs: readonly number[], steps: number): number {
  let n = from;
  const dir = Math.sign(steps);
  let left = Math.abs(steps);
  if (left === 0) return nearestInSet(from, pcs);
  while (left > 0) {
    n += dir;
    if (pcs.includes(pc(n))) left--;
  }
  return n;
}

/** All MIDI notes in [lo, hi] whose pitch class is in `pcs`. */
export function notesInRange(pcs: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = Math.ceil(lo); n <= hi; n++) if (pcs.includes(pc(n))) out.push(n);
  return out;
}

// ── Voice leading ─────────────────────────────────────────────────────────────

export interface VoicingOptions {
  /** Lowest and highest allowed MIDI notes. */
  low: number;
  high: number;
  /** Number of notes (default 4). */
  voices?: number;
  /** Leave the root out (the bass has it). Default true. */
  rootless?: boolean;
  /** Maximum span from lowest to highest note (default 16). */
  maxSpan?: number;
}

/** Tone priority: guide tones first, then colour, then the rest. */
function tonePriority(c: Chord, rootless: boolean, voices: number): { required: number[]; optional: number[] } {
  const iv = c.intervals.map((i) => i % 12);
  const has = (i: number) => iv.includes(i);
  const required: number[] = [];
  const third = has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : has(2) ? 2 : undefined;
  if (third !== undefined) required.push(third);
  const seventh = has(10) ? 10 : has(11) ? 11 : has(9) ? 9 : undefined;
  if (seventh !== undefined) required.push(seventh);
  const optional: number[] = [];
  const order = [2, 9, 6, 8, 1, 3, 5, 7]; // 9th, 13th, #11/b5, #5/b13, b9, #9, 11, 5th
  for (const i of order) if (has(i) && !required.includes(i)) optional.push(i);
  // The root only when the bass doesn't cover it or there aren't enough other tones.
  if (has(0) && (!rootless || required.length + optional.length < Math.min(voices, 3) || required.length + optional.length < voices)) {
    optional.push(0);
  }
  return { required, optional };
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (items.length < k) return [];
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

/** Movement cost between two sorted voicings (pairs voices by nearest neighbour). */
export function voiceMovement(prev: readonly number[], next: readonly number[]): number {
  if (prev.length === next.length) {
    let s = 0;
    for (let i = 0; i < prev.length; i++) s += Math.abs(prev[i]! - next[i]!);
    return s;
  }
  let s = 0;
  for (const n of next) {
    let best = Infinity;
    for (const p of prev) best = Math.min(best, Math.abs(n - p));
    s += best;
  }
  return s;
}

function spacingPenalty(v: readonly number[]): number {
  let p = 0;
  for (let i = 1; i < v.length; i++) {
    const lo = v[i - 1]!;
    const gap = v[i]! - lo;
    if (gap === 1) p += i === v.length - 1 ? 6 : 1.5; // minor 2nds: crunchy, never on top
    if (lo < 48 && gap < 5) p += 3; // low-interval limit: mud
    else if (lo < 53 && gap < 3) p += 2;
    if (gap > 9) p += (gap - 9) * 0.6; // holes in the voicing
  }
  return p;
}

/**
 * Voices a chord within a range, choosing the arrangement that moves least from `prev`
 * (smooth voice leading) and otherwise sits near the middle of the range with sensible
 * spacing. Deterministic.
 */
export function voiceChord(c: Chord, prev: readonly number[] | null, options: VoicingOptions): number[] {
  const { low, high, voices = 4, rootless = true, maxSpan = 16 } = options;
  const { required, optional } = tonePriority(c, rootless, voices);
  const want = Math.max(1, Math.min(voices, required.length + optional.length));
  const sets: number[][] = [];
  const need = want - required.length;
  if (need <= 0) sets.push(required.slice(0, want));
  else {
    const combos = combinations(optional, need);
    // Prefer combos that use the highest-priority tones, but keep a few alternatives.
    for (const combo of combos.slice(0, 6)) sets.push([...required, ...combo]);
  }
  const center = (low + high) / 2;
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (const [setIndex, set] of sets.entries()) {
    const pcsSet = set.map((i) => pc(c.root + i));
    const placements = pcsSet.map((p) => notesInRange([p], low, high));
    const cur: number[] = [];
    const rec = (k: number) => {
      if (k === placements.length) {
        const v = cur.slice().sort((a, b) => a - b);
        for (let i = 1; i < v.length; i++) if (v[i] === v[i - 1]) return;
        const span = v[v.length - 1]! - v[0]!;
        if (span > maxSpan) return;
        let cost = spacingPenalty(v) + setIndex * 0.8;
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        if (prev && prev.length) {
          cost += voiceMovement(prev, v);
          cost += Math.abs(v[v.length - 1]! - prev[prev.length - 1]!) * 0.5; // smooth top line
          cost += Math.abs(mean - center) * 0.15;
        } else {
          cost += Math.abs(mean - center) * 0.8;
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = v;
        }
        return;
      }
      for (const n of placements[k]!) {
        cur.push(n);
        rec(k + 1);
        cur.pop();
      }
    };
    rec(0);
  }
  if (!best) {
    // Range too narrow for the request: stack chord tones upward from `low`.
    const pcs = chordPcs(c);
    return notesInRange(pcs, low, high).slice(0, want);
  }
  return best;
}

/** Voices a whole sequence with continuous voice leading. */
export function voiceProgression(chords: readonly Chord[], options: VoicingOptions, start: number[] | null = null): number[][] {
  let prev = start;
  return chords.map((c) => {
    const v = voiceChord(c, prev, options);
    prev = v;
    return v;
  });
}

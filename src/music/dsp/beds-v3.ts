// Instruments for the v3 beds, oddities and the reworked fanfare/polka/dub (music-beds
// workstream). Same approach as patches.ts and synths.ts: plucked strings and bars are
// rendered into sample zones on demand; winds are wavetable synth patches whose attack
// (filter "blat", lip scoop, breath, delayed vibrato) is baked into each zone.
//
// Brass and reeds deliberately avoid detuned-oscillator unisons (the "synth brass" sound):
// one voice per note, a resonant low-pass for the formant, and ensemble width comes from
// the recipes (several players, small detunes, humanized timing).

import { midiToFreq } from '../theory';
import { addPartials, Biquad, dcBlock, fadeHead, fadeTail, Noise, normalize, OnePole, saturate, sinc } from './core';
import type { PatchDef } from './patches';
import type { SynthDef } from './synths';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let n = lo; n <= hi; n += step) out.push(n);
  return out;
};

/** MIDI note of a frequency (fractional), for zones that must sound at an exact pitch. */
const midiOf = (hz: number) => 69 + 12 * Math.log2(hz / 440);

/** Exact line-up / pip frequencies: 440 Hz, 800 Hz and 1 kHz. */
export const TONE_ROOTS = [midiOf(440), midiOf(800), midiOf(1000)];

function seedFor(root: number, salt: number): number {
  return (Math.imul(Math.round(root * 100) + 1, 2654435761) ^ salt) >>> 0;
}

function finish(buf: Float32Array, sr: number, level = 0.8): Float32Array[] {
  dcBlock(buf, sr, 18);
  fadeHead(buf, sr, 0.001);
  fadeTail(buf, sr, 0.05);
  normalize(buf, level);
  return [buf];
}

/** Karplus–Strong string with an all-pass for fractional tuning (see patches.ts). */
function ks(
  out: Float32Array,
  sr: number,
  f: number,
  opts: { t60: number; seed: number; excite: (n: Noise, i: number, len: number) => number; position?: number; gain?: number; bright?: number },
): void {
  const total = sr / f;
  const N = Math.max(2, Math.floor(total - 0.5 - 0.15));
  const d = total - 0.5 - N;
  const C = (1 - d) / (1 + d);
  const line = new Float32Array(N);
  const noise = new Noise(opts.seed);
  for (let i = 0; i < N; i++) line[i] = opts.excite(noise, i, N);
  if (opts.position) {
    const p = Math.max(1, Math.round(N * opts.position));
    const copy = line.slice();
    for (let i = 0; i < N; i++) line[i] = copy[i]! - copy[(i - p + N) % N]! * 0.9;
  }
  const g = 10 ** (-3 / (opts.t60 * f));
  // Loop low-pass: 0.5 is the classic two-point average; brighter strings lean on the newest sample.
  const b = opts.bright ?? 0.5;
  const gain = opts.gain ?? 1;
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < out.length; i++) {
    const read = line[idx]!;
    const avg = b * read + (1 - b) * prev;
    prev = read;
    const ap = C * avg + apX - C * apY;
    apX = avg;
    apY = ap;
    line[idx] = ap * g;
    out[i]! += read * gain;
    if (++idx === N) idx = 0;
  }
}

function filterChain(buf: Float32Array, filters: Biquad[]): void {
  for (let i = 0; i < buf.length; i++) {
    let x = buf[i]!;
    for (const f of filters) x = f.tick(x);
    buf[i] = x;
  }
}

// ── Plucked strings ───────────────────────────────────────────────────────────

function renderHarp(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(6.5 - (midi - 36) * 0.07, 2.2, 6.5) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 700 + f * 1.4);
  // A finger pluck: a rounded displacement plus a little noise, plucked near the middle.
  ks(out, sr, f, {
    t60: clamp(8 - (midi - 36) * 0.09, 1.6, 8),
    seed: seedFor(midi, 31),
    position: 0.3,
    excite: (no, i, len) => lp.tick(no.next()) * 0.5 + Math.sin((Math.PI * i) / len) * 0.6,
  });
  addPartials(out, sr, [{ freq: f, amp: 0.18, tau: clamp(2.4 - (midi - 36) * 0.03, 0.6, 2.4), attack: 0.004 }]);
  filterChain(out, [new Biquad(sr, 'peaking', 190, 1, 3), new Biquad(sr, 'highshelf', 3200, 0.7, -5)]);
  return finish(out, sr);
}

function renderUkulele(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(2.8 - (midi - 55) * 0.03, 1.4, 2.8) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 2200 + f * 2);
  ks(out, sr, f, { t60: clamp(2.1 - (midi - 55) * 0.025, 0.8, 2.1), seed: seedFor(midi, 37), position: 0.2, excite: (no) => lp.tick(no.next()) });
  // A small body: resonances well above a guitar's, and a soft top end (nylon/gut strings).
  filterChain(out, [new Biquad(sr, 'peaking', 330, 1.2, 5), new Biquad(sr, 'peaking', 950, 1.5, 2), new Biquad(sr, 'lowpass', 5200, 0.6)]);
  return finish(out, sr);
}

function renderFolkGuitar(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(4.5 - (midi - 40) * 0.05, 1.8, 4.5) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 3200 + f * 3);
  // Steel strings: a brighter pick, closer to the bridge, a little more zing in the loop.
  ks(out, sr, f, {
    t60: clamp(5.5 - (midi - 40) * 0.07, 1.6, 5.5),
    seed: seedFor(midi, 41),
    position: 0.13,
    bright: 0.56,
    excite: (no) => lp.tick(no.next()),
  });
  filterChain(out, [
    new Biquad(sr, 'peaking', 105, 1.3, 5),
    new Biquad(sr, 'peaking', 215, 1.4, 3),
    new Biquad(sr, 'peaking', 2700, 0.8, 2.5),
    new Biquad(sr, 'lowpass', 7500, 0.6),
  ]);
  return finish(out, sr);
}

// ── Bars ──────────────────────────────────────────────────────────────────────

function renderGlock(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(3 - (midi - 72) * 0.03, 1.5, 3) * sr);
  const out = new Float32Array(n);
  const tau = clamp(2.2 - (midi - 72) * 0.03, 0.9, 2.2);
  // Free steel bar modes (1 : 2.76 : 5.40 : 8.93) struck with a hard mallet.
  addPartials(out, sr, [
    { freq: f, amp: 1, tau, attack: 0.0008 },
    { freq: f * 2.76, amp: 0.3, tau: Math.min(0.16, tau * 0.2), attack: 0.0005 },
    { freq: f * 5.4, amp: 0.16, tau: 0.22, attack: 0.0004 },
    { freq: f * 8.93, amp: 0.07, tau: 0.08, attack: 0.0003 },
  ]);
  const noise = new Noise(seedFor(midi, 43));
  const bp = new Biquad(sr, 'bandpass', Math.min(9000, sr * 0.4), 0.9);
  const len = Math.floor(0.004 * sr);
  for (let i = 0; i < len; i++) out[i]! += bp.tick(noise.next()) * 0.35 * (1 - i / len);
  return finish(out, sr);
}

// ── One-shots ─────────────────────────────────────────────────────────────────

function sweep(out: Float32Array, sr: number, f0: number, f1: number, pitchTau: number, ampTau: number, amp: number, attack = 0.002): void {
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    ph += (f1 + (f0 - f1) * Math.exp(-t / pitchTau)) / sr;
    out[i]! += amp * sinc(ph) * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

/** A concert bass drum: a big, low, felt-beater boom (brass bands, marches). */
function renderBassDrum(sr: number): Float32Array {
  const o = new Float32Array(Math.floor(1.6 * sr));
  sweep(o, sr, 92, 56, 0.05, 0.42, 1, 0.004);
  sweep(o, sr, 140, 128, 0.05, 0.18, 0.3, 0.004);
  const noise = new Noise(4711);
  const lp = new Biquad(sr, 'lowpass', 350, 0.7);
  const m = Math.floor(0.05 * sr);
  for (let i = 0; i < m; i++) o[i]! += lp.tick(noise.next()) * 0.5 * Math.exp(-i / (0.012 * sr));
  saturate(o, 0.15);
  return o;
}

/** A tape splice going past the head: a dull click with a little low thump. */
function renderTapeClick(sr: number): Float32Array {
  const o = new Float32Array(Math.floor(0.08 * sr));
  sweep(o, sr, 90, 60, 0.01, 0.018, 0.5, 0.0003);
  const noise = new Noise(1974);
  const lp = new Biquad(sr, 'lowpass', 2600, 0.7);
  const m = Math.floor(0.006 * sr);
  for (let i = 0; i < m; i++) o[i]! += lp.tick(noise.next()) * 0.9 * Math.exp(-i / (0.0012 * sr));
  return o;
}

/** A pure sine at the zone's exact pitch, long enough for a line-up tone block (12 s). */
function renderToneSine(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(12 * sr);
  const out = new Float32Array(n);
  const inc = f / sr;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    out[i] = 0.8 * sinc(ph);
    ph += inc;
    if (ph >= 1) ph -= 1;
  }
  fadeHead(out, sr, 0.004);
  fadeTail(out, sr, 0.02);
  return [out];
}

const oneShot = (fn: (sr: number) => Float32Array, level = 1): PatchDef => ({
  roots: [60],
  layers: 1,
  hiFi: true,
  level,
  render: (_r, _l, sr) => {
    const o = fn(sr);
    fadeTail(o, sr, 0.02);
    normalize(o, 0.85);
    return [o];
  },
});

export type BedsSamplePatch = 'concert-harp' | 'ukulele' | 'folk-guitar' | 'glockenspiel' | 'bass-drum' | 'tape-click' | 'test-sine';

export const BEDS_PATCHES: Record<BedsSamplePatch, PatchDef> = {
  'concert-harp': { roots: range(36, 96, 3), layers: 1, rate: 24000, render: (r, _l, sr) => renderHarp(r, sr) },
  ukulele: { roots: range(55, 88, 3), layers: 1, render: (r, _l, sr) => renderUkulele(r, sr) },
  'folk-guitar': { roots: range(40, 85, 3), layers: 1, render: (r, _l, sr) => renderFolkGuitar(r, sr) },
  glockenspiel: { roots: range(72, 108, 3), layers: 1, hiFi: true, render: (r, _l, sr) => renderGlock(r, sr) },
  'bass-drum': oneShot(renderBassDrum, 0.8),
  'tape-click': oneShot(renderTapeClick, 0.6),
  'test-sine': { roots: TONE_ROOTS, layers: 1, rate: 24000, render: (r, _l, sr) => renderToneSine(r, sr) },
};

// ── Winds ─────────────────────────────────────────────────────────────────────

export type BedsSynthPatch =
  | 'fanfare-trumpet'
  | 'fanfare-horn'
  | 'trombone'
  | 'band-cornet'
  | 'band-horn'
  | 'band-tuba'
  | 'polka-clarinet'
  | 'harmon-trumpet'
  | 'blues-harp'
  | 'pedal-steel'
  | 'combo-organ';

export const BEDS_SYNTHS: Record<BedsSynthPatch, SynthDef> = {
  // Orchestral trumpet: one voice, a resonant formant that blooms open on the attack.
  'fanfare-trumpet': {
    oscs: [
      { wave: 'sawtooth', gain: 0.55 },
      { wave: 'horn', gain: 0.6 },
    ],
    filter: { type: 'lowpass', freq: 1150, q: 1.3, keyTrack: 0.5, env: { amount: 2.2, a: 0.05, d: 0.35, s: 0.5 } },
    amp: { a: 0.035, d: 0.3, s: 0.85, r: 0.2 },
    vibrato: { rate: 5.2, depth: 6, delay: 0.45 },
    scoop: -30,
    breath: 0.012,
    gain: 0.5,
  },
  // French horns: round and warm, slow to speak; the "backing off" sound.
  'fanfare-horn': {
    oscs: [
      { wave: 'horn', gain: 0.9 },
      { wave: 'triangle', gain: 0.3 },
    ],
    filter: { type: 'lowpass', freq: 680, q: 0.9, keyTrack: 0.4, env: { amount: 1.3, a: 0.08, d: 0.45, s: 0.6 } },
    amp: { a: 0.07, d: 0.4, s: 0.9, r: 0.35 },
    vibrato: { rate: 4.8, depth: 4, delay: 0.6 },
    scoop: -15,
    gain: 0.41,
  },
  trombone: {
    oscs: [
      { wave: 'sawtooth', gain: 0.5 },
      { wave: 'horn', gain: 0.6 },
    ],
    filter: { type: 'lowpass', freq: 820, q: 1.1, keyTrack: 0.5, env: { amount: 1.8, a: 0.05, d: 0.35, s: 0.5 } },
    amp: { a: 0.04, d: 0.3, s: 0.85, r: 0.22 },
    scoop: -20,
    breath: 0.01,
    gain: 0.47,
  },
  // A village brass band: cornets with the traditional wide vibrato, mellow horns, a tuba.
  'band-cornet': {
    oscs: [
      { wave: 'horn', gain: 0.7 },
      { wave: 'sawtooth', gain: 0.35 },
    ],
    filter: { type: 'lowpass', freq: 1400, q: 1, keyTrack: 0.6, env: { amount: 1.5, a: 0.04, d: 0.3, s: 0.55 } },
    amp: { a: 0.03, d: 0.25, s: 0.8, r: 0.15 },
    vibrato: { rate: 5.6, depth: 14, delay: 0.25 },
    scoop: -25,
    breath: 0.015,
    gain: 0.44,
  },
  'band-horn': {
    oscs: [
      { wave: 'horn', gain: 0.8 },
      { wave: 'sine', gain: 0.4 },
    ],
    filter: { type: 'lowpass', freq: 900, q: 0.8, keyTrack: 0.5, env: { amount: 1, a: 0.05, d: 0.35, s: 0.6 } },
    amp: { a: 0.05, d: 0.3, s: 0.85, r: 0.2 },
    vibrato: { rate: 5.2, depth: 10, delay: 0.35 },
    scoop: -20,
    gain: 0.45,
  },
  // Tuba: a short buzzy "blat" as the lips start, then a round, dark tone.
  'band-tuba': {
    oscs: [
      { wave: 'horn', gain: 0.7 },
      { wave: 'sine', gain: 0.6 },
      { wave: 'sawtooth', gain: 0.1 },
    ],
    filter: { type: 'lowpass', freq: 720, q: 1.2, keyTrack: 0.5, env: { amount: 2.2, a: 0.025, d: 0.12, s: 0.35 } },
    amp: { a: 0.018, d: 0.18, s: 0.75, r: 0.09 },
    scoop: -30,
    breath: 0.02,
    gain: 0.63,
  },
  // Clarinet: hollow odd harmonics, a breathy edge on the attack and a light vibrato.
  'polka-clarinet': {
    oscs: [
      { wave: 'clarinet', gain: 1 },
      { wave: 'sine', gain: 0.25 },
    ],
    filter: { type: 'lowpass', freq: 3000, q: 0.6, keyTrack: 0.3, env: { amount: 0.6, a: 0.02, d: 0.15, s: 0.6 } },
    amp: { a: 0.02, d: 0.1, s: 0.9, r: 0.08 },
    vibrato: { rate: 5.5, depth: 8, delay: 0.25 },
    scoop: -15,
    breath: 0.025,
    gain: 0.5,
  },
  // Straight-muted trumpet for noir: a nasal band of harmonics, airy, slow vibrato.
  'harmon-trumpet': {
    oscs: [
      { wave: 'sawtooth', gain: 0.7 },
      { wave: 'reed', gain: 0.4 },
    ],
    filter: { type: 'bandpass', freq: 1400, q: 1.1, keyTrack: 0.5, env: { amount: 0.5, a: 0.04, d: 0.3, s: 0.6 } },
    amp: { a: 0.04, d: 0.25, s: 0.8, r: 0.25 },
    vibrato: { rate: 4.8, depth: 12, delay: 0.4 },
    scoop: -40,
    breath: 0.02,
    gain: 0.75,
  },
  // Harmonica: reedy, bent into notes, with a hand-cupped tremolo.
  'blues-harp': {
    oscs: [
      { wave: 'reed', gain: 0.8 },
      { wave: 'square', gain: 0.22 },
    ],
    filter: { type: 'bandpass', freq: 1500, q: 0.7, keyTrack: 0.4 },
    amp: { a: 0.04, d: 0.2, s: 0.85, r: 0.12 },
    vibrato: { rate: 5.5, depth: 12, delay: 0.4 },
    scoop: -60,
    breath: 0.03,
    gain: 0.85,
  },
  // Pedal steel: no pick attack (the volume pedal swells it in), glassy and sweet.
  'pedal-steel': {
    oscs: [
      { wave: 'sine', gain: 0.8 },
      { wave: 'triangle', gain: 0.5 },
      { wave: 'sawtooth', gain: 0.15 },
    ],
    filter: { type: 'lowpass', freq: 2200, q: 0.7, keyTrack: 0.5 },
    amp: { a: 0.32, d: 1.5, s: 0.85, r: 0.8 },
    vibrato: { rate: 4.5, depth: 7, delay: 0.5 },
    gain: 0.47,
  },
  // The game-show organ: drawbars through a fast vibrato scanner.
  'combo-organ': {
    oscs: [
      { wave: 'organ', gain: 0.8 },
      { wave: 'square', gain: 0.18 },
    ],
    filter: { type: 'lowpass', freq: 3600, q: 0.6 },
    amp: { a: 0.005, d: 0.1, s: 1, r: 0.06 },
    vibrato: { rate: 6.8, depth: 16 },
    gain: 0.68,
  },
};

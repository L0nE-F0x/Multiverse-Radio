// Instruments for the v4 groove recipes (music-groove workstream): disco, space funk,
// warehouse techno and deep house. Club kicks, a techno rumble, metal clanks, a syndrum
// zap and a noise riser; a clavinet (dry and through an envelope wah); vocal chops sung
// by a little formant synth; and wavetable patches for a 303-style acid line at four
// filter positions, disco strings, horn and sax stabs, and house and dub chord stabs.
//
// Self-contained like genres.ts (imports only core/theory), spread into PATCHES/SYNTHS.

import { midiToFreq } from '../theory';
import { addPartials, Biquad, dcBlock, fadeHead, fadeTail, Noise, normalize, OnePole, saturate, sinc, type Partial } from './core';
import type { PatchDef } from './patches';
import type { SynthDef } from './synths';

export type GrooveSamplePatch =
  | 'kick-disco'
  | 'kick-techno'
  | 'kick-deep'
  | 'rumble'
  | 'clank'
  | 'zap'
  | 'noise-riser'
  | 'clav'
  | 'clav-wah'
  | 'vox';

export type GrooveSynthPatch =
  | 'acid-1'
  | 'acid-2'
  | 'acid-3'
  | 'acid-4'
  | 'disco-strings'
  | 'string-stab'
  | 'funk-horn'
  | 'funk-sax'
  | 'house-chord'
  | 'dub-stab';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let n = lo; n <= hi; n += step) out.push(n);
  return out;
};

const len = (sr: number, s: number) => new Float32Array(Math.floor(sr * s));

function finish(buf: Float32Array, sr: number, level = 0.8, tail = 0.05): Float32Array[] {
  dcBlock(buf, sr, 18);
  fadeHead(buf, sr, 0.001);
  fadeTail(buf, sr, tail);
  normalize(buf, level);
  return [buf];
}

function sweepSine(out: Float32Array, sr: number, f0: number, f1: number, pitchTau: number, ampTau: number, amp = 1, attack = 0.001): void {
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / pitchTau);
    ph += f / sr;
    out[i]! += amp * sinc(ph) * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

function noiseBurst(out: Float32Array, sr: number, seed: number, amp: number, ampTau: number, filters: Biquad[], attack = 0.0005): void {
  const noise = new Noise(seed);
  const end = Math.min(out.length, Math.ceil(ampTau * 10 * sr));
  for (let i = 0; i < end; i++) {
    const t = i / sr;
    let x = noise.next();
    for (const f of filters) x = f.tick(x);
    out[i]! += x * amp * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

// ── Drums and effects ─────────────────────────────────────────────────────────

const ONE_SHOTS: Record<string, (sr: number) => Float32Array> = {
  // A 1977 kick: a felt beater on a damped 22", round and short.
  'kick-disco': (sr) => {
    const o = len(sr, 0.5);
    sweepSine(o, sr, 165, 58, 0.028, 0.2, 1, 0.0008);
    sweepSine(o, sr, 116, 112, 0.05, 0.06, 0.18);
    noiseBurst(o, sr, 401, 0.22, 0.004, [new Biquad(sr, 'bandpass', 2400, 0.9)]);
    saturate(o, 0.3);
    new Biquad(sr, 'lowpass', 5000, 0.7).process(o);
    return o;
  },
  // A long, saturated machine kick with a hard click; the body the rumble grows from.
  'kick-techno': (sr) => {
    const o = len(sr, 0.85);
    sweepSine(o, sr, 240, 47, 0.016, 0.36, 1, 0.0004);
    noiseBurst(o, sr, 402, 0.3, 0.0018, [new Biquad(sr, 'highpass', 1800, 0.7)]);
    saturate(o, 0.75);
    new Biquad(sr, 'lowpass', 4200, 0.6).process(o);
    return o;
  },
  // Deep house: soft and round, more thump than click.
  'kick-deep': (sr) => {
    const o = len(sr, 0.65);
    sweepSine(o, sr, 128, 50, 0.034, 0.26, 1, 0.0015);
    noiseBurst(o, sr, 403, 0.07, 0.004, [new Biquad(sr, 'lowpass', 1300, 0.7)]);
    saturate(o, 0.18);
    return o;
  },
  // A struck steel pipe in a concrete room: inharmonic and short. Pitched by the player.
  clank: (sr) => {
    const o = len(sr, 0.5);
    const f = 640;
    addPartials(o, sr, [
      { freq: f, amp: 0.5, tau: 0.09, attack: 0.0003 },
      { freq: f * 2.31, amp: 0.45, tau: 0.07, attack: 0.0003 },
      { freq: f * 3.83, amp: 0.3, tau: 0.045, attack: 0.0003 },
      { freq: f * 5.37, amp: 0.22, tau: 0.03, attack: 0.0003 },
      { freq: f * 7.12, amp: 0.12, tau: 0.02, attack: 0.0003 },
    ]);
    noiseBurst(o, sr, 404, 0.35, 0.0025, [new Biquad(sr, 'bandpass', 3800, 1.2)]);
    new Biquad(sr, 'highpass', 300, 0.7).process(o);
    return o;
  },
  // Syndrum: a sine dropping like a dropped coin in space.
  zap: (sr) => {
    const o = len(sr, 0.7);
    sweepSine(o, sr, 1250, 150, 0.09, 0.22, 1, 0.001);
    noiseBurst(o, sr, 405, 0.1, 0.01, [new Biquad(sr, 'bandpass', 3000, 0.8)]);
    return o;
  },
  // White noise opening from a low band to air over four seconds, getting louder.
  'noise-riser': (sr) => {
    const secs = 4.2;
    const o = len(sr, secs);
    const noise = new Noise(406);
    const bp = new Biquad(sr, 'bandpass', 300, 1.1);
    const lp = new OnePole(sr, 9000);
    for (let i = 0; i < o.length; i++) {
      const u = i / o.length;
      if ((i & 31) === 0) bp.set('bandpass', 300 * 20 ** (u ** 1.3), 1.1 + u);
      o[i] = lp.tick(bp.tick(noise.next())) * (0.08 + 0.92 * u ** 2.2);
    }
    // Arrives, then cuts off cleanly.
    const tail = Math.floor(0.04 * sr);
    for (let i = 0; i < tail; i++) o[o.length - 1 - i]! *= i / tail;
    return o;
  },
};

const oneShot = (fn: (sr: number) => Float32Array, level = 1): PatchDef => ({
  roots: [60],
  layers: 1,
  hiFi: true,
  level,
  render: (_root, _layer, sr) => {
    const o = fn(sr);
    fadeTail(o, sr, 0.02);
    normalize(o, 0.85);
    return [o];
  },
});

/**
 * The techno rumble: a kick's low tail smeared through a dark room and distortion,
 * pitched to the key. Short attack so it swells in behind the kick.
 */
function renderRumble(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const o = len(sr, 0.9);
  const noise = new Noise(407 + midi);
  const lpN = new Biquad(sr, 'lowpass', f * 2.2, 0.9);
  let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.03) * Math.exp(-t / 0.26);
    ph += f / sr;
    // Slow random wobble in amplitude gives the "room" grain.
    o[i] = env * (sinc(ph) + 0.25 * sinc(ph * 2 + 0.2) + 0.5 * lpN.tick(noise.next()));
  }
  saturate(o, 0.9);
  new Biquad(sr, 'lowpass', 260, 0.7).process(o);
  new Biquad(sr, 'lowpass', 300, 0.6).process(o);
  return finish(o, sr, 0.8, 0.08);
}

// ── Clavinet ──────────────────────────────────────────────────────────────────

/** A struck, damped string seen through a pickup near the bridge: thin, nasal, quick. */
function clavString(midi: number, hard: boolean, sr: number, secs: number): Float32Array {
  const f = midiToFreq(midi);
  const o = len(sr, secs);
  const pickup = 0.12;
  const partials: Partial[] = [];
  const t0 = clamp(1.4 - (midi - 40) * 0.02, 0.45, 1.4);
  const limit = Math.min(sr * 0.45, hard ? 9000 : 6000);
  for (let h = 1; h <= 40; h++) {
    const fh = h * f * Math.sqrt(1 + 0.00012 * h * h);
    if (fh > limit) break;
    const amp = (Math.abs(Math.sin(Math.PI * h * pickup)) + 0.08) / h ** (hard ? 0.55 : 0.8);
    partials.push({ freq: fh, amp, tau: t0 / (1 + 0.18 * (h - 1)), attack: 0.0006, phase: (h * 0.17) % 1 });
  }
  addPartials(o, sr, partials);
  // The tangent hitting the string.
  const noise = new Noise(408 + midi + (hard ? 50 : 0));
  const bp = new Biquad(sr, 'bandpass', Math.min(sr * 0.4, 2600), 1);
  const n = Math.floor(0.006 * sr);
  for (let i = 0; i < n; i++) o[i]! += bp.tick(noise.next()) * (hard ? 0.5 : 0.25) * (1 - i / n);
  new Biquad(sr, 'highpass', clamp(f * 0.9, 90, 400), 0.7).process(o);
  new Biquad(sr, 'peaking', 1700, 0.9, 5).process(o);
  saturate(o, hard ? 0.35 : 0.2);
  return o;
}

function renderClav(midi: number, hard: boolean, sr: number): Float32Array[] {
  return finish(clavString(midi, hard, sr, 1.1), sr, 0.8, 0.12);
}

/** The clav through an envelope-follower wah: the band sweeps up on the pick and settles. */
function renderClavWah(midi: number, hard: boolean, sr: number): Float32Array[] {
  const dry = clavString(midi, hard, sr, 1.0);
  const out = new Float32Array(dry.length);
  const bp = new Biquad(sr, 'bandpass', 500, 2.6);
  const f = midiToFreq(midi);
  const lo = Math.max(380, f * 1.5);
  const hi = hard ? 2600 : 1800;
  for (let i = 0; i < dry.length; i++) {
    const t = i / sr;
    if ((i & 15) === 0) {
      const env = t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) / 0.18);
      bp.set('bandpass', lo + (hi - lo) * env, 2.6);
    }
    out[i] = bp.tick(dry[i]!) * 2.2 + dry[i]! * 0.15;
  }
  return finish(out, sr, 0.8, 0.12);
}

// ── Vocal chops ───────────────────────────────────────────────────────────────

/** Formants (Hz, gain, bandwidth) for "ooh" (soft layer) and "ah" (hard layer). */
const VOWELS: [number, number, number][][] = [
  [
    [380, 1, 90],
    [820, 0.4, 110],
    [2500, 0.07, 180],
  ],
  [
    [720, 1, 110],
    [1180, 0.55, 120],
    [2750, 0.14, 180],
  ],
];

/**
 * A wordless sung note: a glottal source shaped by vowel formants, a scoop into pitch,
 * delayed vibrato and a little breath. Diva at the end of time, one syllable at a time.
 */
function renderVox(midi: number, ah: boolean, sr: number): Float32Array[] {
  const f0 = midiToFreq(midi);
  const secs = 1.7;
  const o = len(sr, secs);
  const formants = VOWELS[ah ? 1 : 0]!;
  const maxH = Math.max(1, Math.min(60, Math.floor(Math.min(sr * 0.45, 7000) / f0)));
  const amps: number[] = [0];
  for (let h = 1; h <= maxH; h++) {
    const fh = h * f0;
    let a = 0.03 / h;
    for (const [fc, g, bw] of formants) a += g * Math.exp(-(((fh - fc) / bw) ** 2));
    amps.push(a / h ** 0.3);
  }
  const noise = new Noise(409 + midi);
  const breathBp = new Biquad(sr, 'bandpass', formants[1]![0], 1.4);
  let ph = 0;
  let ratio = 1;
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    if ((i & 15) === 0) {
      let cents = -60 * Math.max(0, 1 - t / 0.08);
      cents += 16 * clamp((t - 0.3) / 0.35, 0, 1) * sinc(5.1 * t);
      ratio = 2 ** (cents / 1200);
    }
    ph += (f0 * ratio) / sr;
    let x = 0;
    for (let h = 1; h <= maxH; h++) {
      const a = amps[h]!;
      if (a > 0.004) x += a * sinc(ph * h);
    }
    const env = Math.min(1, t / 0.035) * (0.75 + 0.25 * Math.exp(-t / 0.25)) * Math.exp(-t / 3.2);
    o[i] = env * (x + breathBp.tick(noise.next()) * 0.05);
  }
  return finish(o, sr, 0.8, 0.25);
}

// ── Synth patches ─────────────────────────────────────────────────────────────

/** A 303-ish voice with its cutoff knob at one position (the recipes move between them). */
function acid(freq: number, q: number, amount: number, decay: number): SynthDef {
  return {
    oscs: [{ wave: 'sawtooth', gain: 1 }],
    filter: { type: 'lowpass', freq, q, keyTrack: 0.25, env: { amount, a: 0.002, d: decay, s: 0.12 } },
    amp: { a: 0.002, d: 0.22, s: 0.75, r: 0.04 },
    gain: 0.72,
  };
}

export const GROOVE_SYNTHS: Record<GrooveSynthPatch, SynthDef> = {
  'acid-1': acid(240, 6, 3, 0.2),
  'acid-2': acid(380, 9, 5, 0.17),
  'acid-3': acid(600, 12, 6.5, 0.15),
  'acid-4': acid(900, 14, 7, 0.14),
  // A string section: three saws a few cents apart with a slow, warm vibrato.
  'disco-strings': {
    oscs: [
      { wave: 'sawtooth', detune: -12, gain: 0.45 },
      { wave: 'sawtooth', detune: 1, gain: 0.45 },
      { wave: 'sawtooth', detune: 13, gain: 0.45 },
    ],
    filter: { type: 'lowpass', freq: 3000, q: 0.5, keyTrack: 0.35 },
    amp: { a: 0.06, d: 0.5, s: 0.9, r: 0.4 },
    vibrato: { rate: 5.3, depth: 7, delay: 0.25 },
    gain: 0.5,
  },
  // The same section digging in: a bright bite that settles.
  'string-stab': {
    oscs: [
      { wave: 'sawtooth', detune: -10, gain: 0.5 },
      { wave: 'sawtooth', detune: 11, gain: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 1900, q: 0.8, keyTrack: 0.4, env: { amount: 1.4, a: 0.004, d: 0.12, s: 0.4 } },
    amp: { a: 0.004, d: 0.18, s: 0.45, r: 0.16 },
    gain: 0.55,
  },
  // A trumpet in a horn section: fast speech, bright blat, a scoop.
  'funk-horn': {
    oscs: [
      { wave: 'sawtooth', gain: 0.55 },
      { wave: 'horn', gain: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 1300, q: 1.2, keyTrack: 0.5, env: { amount: 2.4, a: 0.018, d: 0.18, s: 0.45 } },
    amp: { a: 0.012, d: 0.2, s: 0.75, r: 0.09 },
    scoop: -35,
    breath: 0.01,
    gain: 0.5,
  },
  // Tenor sax: reedy, a bit of growl in the formant, late vibrato.
  'funk-sax': {
    oscs: [
      { wave: 'reed', gain: 0.85 },
      { wave: 'sawtooth', gain: 0.2 },
    ],
    filter: { type: 'lowpass', freq: 1500, q: 1.6, keyTrack: 0.45, env: { amount: 1.5, a: 0.03, d: 0.25, s: 0.6 } },
    amp: { a: 0.02, d: 0.2, s: 0.85, r: 0.12 },
    vibrato: { rate: 5.4, depth: 10, delay: 0.3 },
    scoop: -25,
    breath: 0.02,
    gain: 0.7,
  },
  // Deep house chord: two saws and a square under a warm, plucky low-pass.
  'house-chord': {
    oscs: [
      { wave: 'sawtooth', detune: -7, gain: 0.45 },
      { wave: 'sawtooth', detune: 7, gain: 0.45 },
      { wave: 'square', gain: 0.25 },
    ],
    filter: { type: 'lowpass', freq: 950, q: 1.2, keyTrack: 0.4, env: { amount: 2.2, a: 0.003, d: 0.22, s: 0.3 } },
    amp: { a: 0.004, d: 0.4, s: 0.45, r: 0.3 },
    gain: 0.55,
  },
  // A dub-techno chord: a resonant blip, made to be thrown into an echo.
  'dub-stab': {
    oscs: [
      { wave: 'sawtooth', gain: 0.6 },
      { wave: 'square', detune: 6, gain: 0.35 },
    ],
    filter: { type: 'lowpass', freq: 560, q: 3, keyTrack: 0.3, env: { amount: 3.2, a: 0.002, d: 0.1, s: 0.15 } },
    amp: { a: 0.002, d: 0.16, s: 0.1, r: 0.12 },
    gain: 0.85,
  },
};

export const GROOVE_PATCHES: Record<GrooveSamplePatch, PatchDef> = {
  'kick-disco': oneShot(ONE_SHOTS['kick-disco']!, 0.75),
  'kick-techno': oneShot(ONE_SHOTS['kick-techno']!, 0.72),
  'kick-deep': oneShot(ONE_SHOTS['kick-deep']!, 0.75),
  clank: oneShot(ONE_SHOTS.clank!, 0.9),
  zap: oneShot(ONE_SHOTS.zap!, 0.8),
  'noise-riser': { ...oneShot(ONE_SHOTS['noise-riser']!, 0.8), hiFi: false, rate: 24000 },
  rumble: { roots: range(24, 48, 3), layers: 1, rate: 16000, level: 0.7, render: (r, _l, sr) => renderRumble(r, sr) },
  clav: { roots: range(36, 87, 3), layers: 2, rate: 32000, render: (r, l, sr) => renderClav(r, l === 1, sr) },
  'clav-wah': { roots: range(36, 87, 3), layers: 2, rate: 32000, render: (r, l, sr) => renderClavWah(r, l === 1, sr) },
  vox: { roots: range(52, 84, 3), layers: 2, rate: 24000, render: (r, l, sr) => renderVox(r, l === 1, sr) },
};


// Synth patches rendered offline into looping samples ("ROMpler" style). Timbre, filter
// envelopes, pitch scoops and vibrato are baked into each zone; the player applies the
// amplitude envelope, glides and arpeggios. A voice is then just a buffer source and a
// gain — far cheaper in Chrome than live oscillators and per-voice filters.

import type { SynthPatch } from '../score';
import { midiToFreq } from '../theory';
import { Biquad, Noise, sinc, TAU } from './core';

export type Wave =
  | 'sine'
  | 'sawtooth'
  | 'square'
  | 'triangle'
  | 'pulse12'
  | 'pulse25'
  | 'chipTri'
  | 'reed'
  | 'organ'
  | 'clarinet'
  | 'softSaw'
  | 'horn'
  | 'glass'
  | 'flute'
  | 'vowel';

interface OscDef {
  wave: Wave;
  /** Cents. */
  detune?: number;
  /** Octave offset. */
  octave?: number;
  gain: number;
}

interface Env {
  a: number;
  d: number;
  s: number;
  r: number;
}

export interface SynthDef {
  oscs: OscDef[];
  filter?: {
    type: 'lowpass' | 'highpass' | 'bandpass';
    freq: number;
    q?: number;
    /** 0..1: how much the cutoff follows pitch. */
    keyTrack?: number;
    /** Envelope on the cutoff: peak = freq × (1 + amount × velocity). */
    env?: { amount: number; a: number; d: number; s: number };
  };
  amp: Env;
  vibrato?: { rate: number; depth: number; delay?: number };
  /** Breath noise (flute). */
  breath?: number;
  /** Pitch scoop at the attack, cents. */
  scoop?: number;
  gain: number;
}

export const SYNTHS: Record<SynthPatch, SynthDef> = {
  'pad-warm': {
    oscs: [
      { wave: 'sawtooth', detune: -8, gain: 0.6 },
      { wave: 'triangle', detune: 7, gain: 0.7 },
    ],
    filter: { type: 'lowpass', freq: 900, q: 0.5, keyTrack: 0.3 },
    amp: { a: 1.4, d: 2, s: 0.8, r: 2.2 },
    gain: 0.2,
  },
  'pad-strings': {
    oscs: [
      { wave: 'sawtooth', detune: -10, gain: 0.55 },
      { wave: 'sawtooth', detune: 11, gain: 0.55 },
    ],
    filter: { type: 'lowpass', freq: 2200, q: 0.6, keyTrack: 0.4 },
    amp: { a: 0.6, d: 1, s: 0.85, r: 1.3 },
    gain: 0.16,
  },
  'pad-glass': {
    oscs: [
      { wave: 'glass', gain: 0.8 },
      { wave: 'sine', octave: 1, detune: 5, gain: 0.22 },
    ],
    amp: { a: 0.9, d: 2, s: 0.7, r: 2.5 },
    gain: 0.3,
  },
  'pad-choir': {
    oscs: [
      { wave: 'vowel', detune: -7, gain: 0.5 },
      { wave: 'vowel', detune: 7, gain: 0.5 },
    ],
    amp: { a: 0.9, d: 1, s: 0.9, r: 1.6 },
    vibrato: { rate: 4.6, depth: 11 },
    gain: 0.3,
  },
  'pad-dark': {
    oscs: [
      { wave: 'sawtooth', gain: 0.6 },
      { wave: 'square', octave: -1, gain: 0.35 },
    ],
    filter: { type: 'lowpass', freq: 480, q: 1.1 },
    amp: { a: 2, d: 3, s: 0.8, r: 3 },
    gain: 0.24,
  },
  'saw-lead': {
    oscs: [
      { wave: 'sawtooth', detune: -6, gain: 0.5 },
      { wave: 'sawtooth', detune: 6, gain: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 1500, q: 1.8, keyTrack: 0.5, env: { amount: 1.8, a: 0.01, d: 0.35, s: 0.35 } },
    amp: { a: 0.012, d: 0.25, s: 0.8, r: 0.25 },
    vibrato: { rate: 5.6, depth: 14, delay: 0.25 },
    gain: 0.22,
  },
  'square-lead': {
    oscs: [{ wave: 'square', gain: 1 }],
    filter: { type: 'lowpass', freq: 2600, q: 0.7, keyTrack: 0.5 },
    amp: { a: 0.01, d: 0.12, s: 0.8, r: 0.15 },
    vibrato: { rate: 5.5, depth: 10, delay: 0.2 },
    gain: 0.16,
  },
  'soft-lead': {
    oscs: [
      { wave: 'triangle', gain: 1 },
      { wave: 'sine', octave: 1, gain: 0.2 },
    ],
    filter: { type: 'lowpass', freq: 2200, q: 0.5 },
    amp: { a: 0.04, d: 0.25, s: 0.7, r: 0.35 },
    vibrato: { rate: 5, depth: 12, delay: 0.3 },
    gain: 0.34,
  },
  flute: {
    oscs: [{ wave: 'flute', gain: 1 }],
    amp: { a: 0.07, d: 0.2, s: 0.85, r: 0.18 },
    vibrato: { rate: 5, depth: 14, delay: 0.22 },
    breath: 0.05,
    gain: 0.36,
  },
  whale: {
    oscs: [
      { wave: 'sine', gain: 1 },
      { wave: 'triangle', octave: 1, detune: 4, gain: 0.12 },
    ],
    amp: { a: 0.7, d: 1.2, s: 0.9, r: 1.8 },
    vibrato: { rate: 0.9, depth: 22 },
    gain: 0.32,
  },
  'arp-pluck': {
    oscs: [
      { wave: 'sawtooth', gain: 0.7 },
      { wave: 'square', detune: 7, gain: 0.35 },
    ],
    filter: { type: 'lowpass', freq: 550, q: 4, keyTrack: 0.4, env: { amount: 5, a: 0.002, d: 0.16, s: 0 } },
    amp: { a: 0.002, d: 0.28, s: 0, r: 0.1 },
    gain: 0.2,
  },
  'synth-bass': {
    oscs: [
      { wave: 'sawtooth', gain: 0.7 },
      { wave: 'square', detune: -5, gain: 0.45 },
    ],
    filter: { type: 'lowpass', freq: 260, q: 2.5, keyTrack: 0.3, env: { amount: 3.5, a: 0.003, d: 0.2, s: 0.25 } },
    amp: { a: 0.003, d: 0.3, s: 0.75, r: 0.08 },
    gain: 0.32,
  },
  'acid-bass': {
    oscs: [{ wave: 'sawtooth', gain: 1 }],
    filter: { type: 'lowpass', freq: 380, q: 9, keyTrack: 0.2, env: { amount: 7, a: 0.003, d: 0.14, s: 0.1 } },
    amp: { a: 0.003, d: 0.2, s: 0.7, r: 0.06 },
    gain: 0.22,
  },
  brass: {
    oscs: [
      { wave: 'sawtooth', detune: -6, gain: 0.5 },
      { wave: 'sawtooth', detune: 6, gain: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 800, q: 0.9, keyTrack: 0.5, env: { amount: 3, a: 0.06, d: 0.35, s: 0.45 } },
    amp: { a: 0.035, d: 0.3, s: 0.8, r: 0.2 },
    vibrato: { rate: 5.2, depth: 9, delay: 0.3 },
    scoop: -40,
    gain: 0.22,
  },
  horn: {
    oscs: [{ wave: 'horn', gain: 1 }],
    filter: { type: 'lowpass', freq: 1100, q: 0.6, keyTrack: 0.4 },
    amp: { a: 0.18, d: 0.5, s: 0.85, r: 0.5 },
    vibrato: { rate: 4.6, depth: 7, delay: 0.4 },
    gain: 0.36,
  },
  organ: {
    oscs: [{ wave: 'organ', gain: 1 }],
    amp: { a: 0.006, d: 0.1, s: 1, r: 0.07 },
    gain: 0.2,
  },
  skank: {
    oscs: [
      { wave: 'organ', gain: 0.8 },
      { wave: 'square', gain: 0.25 },
    ],
    filter: { type: 'bandpass', freq: 1400, q: 0.9 },
    amp: { a: 0.002, d: 0.11, s: 0, r: 0.05 },
    gain: 0.5,
  },
  melodica: {
    oscs: [{ wave: 'reed', gain: 1 }],
    filter: { type: 'lowpass', freq: 2600, q: 0.7, keyTrack: 0.3 },
    amp: { a: 0.035, d: 0.2, s: 0.9, r: 0.12 },
    vibrato: { rate: 5.4, depth: 9, delay: 0.3 },
    gain: 0.28,
  },
  accordion: {
    oscs: [
      { wave: 'reed', detune: -8, gain: 0.5 },
      { wave: 'reed', detune: 8, gain: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 3200, q: 0.6 },
    amp: { a: 0.025, d: 0.1, s: 0.9, r: 0.08 },
    gain: 0.24,
  },
  tuba: {
    oscs: [
      { wave: 'horn', gain: 0.8 },
      { wave: 'sine', gain: 0.5 },
    ],
    filter: { type: 'lowpass', freq: 520, q: 0.8, env: { amount: 1.5, a: 0.03, d: 0.15, s: 0.4 } },
    amp: { a: 0.02, d: 0.2, s: 0.7, r: 0.08 },
    gain: 0.42,
  },
  clarinet: {
    oscs: [{ wave: 'clarinet', gain: 1 }],
    filter: { type: 'lowpass', freq: 2600, q: 0.6, keyTrack: 0.3 },
    amp: { a: 0.03, d: 0.1, s: 0.9, r: 0.1 },
    vibrato: { rate: 5, depth: 6, delay: 0.3 },
    gain: 0.3,
  },
  'chip-pulse12': { oscs: [{ wave: 'pulse12', gain: 1 }], amp: { a: 0.001, d: 0.3, s: 0.55, r: 0.03 }, gain: 0.13 },
  'chip-pulse25': { oscs: [{ wave: 'pulse25', gain: 1 }], amp: { a: 0.001, d: 0.3, s: 0.55, r: 0.03 }, gain: 0.12 },
  'chip-square': { oscs: [{ wave: 'square', gain: 1 }], amp: { a: 0.001, d: 0.3, s: 0.55, r: 0.03 }, gain: 0.1 },
  'chip-tri': { oscs: [{ wave: 'chipTri', gain: 1 }], amp: { a: 0.001, d: 0.05, s: 1, r: 0.02 }, gain: 0.34 },
  'sine-beep': { oscs: [{ wave: 'sine', gain: 1 }], amp: { a: 0.005, d: 0.1, s: 1, r: 0.03 }, gain: 0.3 },
  drone: {
    oscs: [
      { wave: 'softSaw', gain: 0.8 },
      { wave: 'sine', octave: 1, detune: 5, gain: 0.25 },
    ],
    filter: { type: 'lowpass', freq: 380, q: 0.7 },
    amp: { a: 3, d: 2, s: 1, r: 4 },
    gain: 0.25,
  },
};

// ── Waves ─────────────────────────────────────────────────────────────────────

/** Harmonic amplitudes [sine part, cosine part] for a wave at fundamental f0. */
function harmonic(wave: Wave, h: number, f0: number): [number, number] {
  switch (wave) {
    case 'sine':
      return [h === 1 ? 1 : 0, 0];
    case 'sawtooth':
      return [((h % 2 ? 1 : -1) * 2) / (Math.PI * h), 0];
    case 'square':
      return [h % 2 ? 4 / (Math.PI * h) : 0, 0];
    case 'triangle':
      return [h % 2 ? ((((h - 1) / 2) % 2 ? -1 : 1) * 8) / (Math.PI * Math.PI * h * h) : 0, 0];
    case 'pulse12':
    case 'pulse25': {
      const duty = wave === 'pulse12' ? 0.125 : 0.25;
      return [0, (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty)];
    }
    case 'chipTri': {
      const c = chipTri()[h];
      return c ? [c[0], c[1]] : [0, 0];
    }
    case 'reed':
      return [(1 / h) * (1 + 1.4 * Math.exp(-(((h - 4) / 2.2) ** 2))), 0];
    case 'organ':
      return [({ 1: 1, 2: 0.75, 3: 0.55, 4: 0.4, 6: 0.22, 8: 0.18 } as Record<number, number>)[h] ?? 0, 0];
    case 'clarinet':
      return [(h % 2 === 1 ? 1 / h ** 0.8 : 0.04 / h) * (h > 13 ? 0.3 : 1), 0];
    case 'softSaw':
      return [1 / h ** 1.4, 0];
    case 'horn':
      return [1 / h ** 1.7, 0];
    case 'glass':
      return [({ 1: 1, 2: 0.25, 3: 0.12, 5: 0.06, 7: 0.03 } as Record<number, number>)[h] ?? 0, 0];
    case 'flute':
      return [({ 1: 1, 2: 0.18, 3: 0.08, 4: 0.03 } as Record<number, number>)[h] ?? 0, 0];
    case 'vowel': {
      // An "ah" formant envelope sampled at the harmonics.
      const f = h * f0;
      let a = 0;
      for (const [fc, g, bw] of [
        [600, 1, 110],
        [1000, 0.5, 130],
        [2500, 0.12, 200],
      ] as const)
        a += g * Math.exp(-(((f - fc) / bw) ** 2));
      return [a + 0.02 / h, 0];
    }
  }
}

let chipTriCache: [number, number][] | null = null;
/** Fourier coefficients [sine, cosine] of the NES's 4-bit stepped triangle. */
function chipTri(): [number, number][] {
  if (chipTriCache) return chipTriCache;
  const N = 512;
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / N;
    const tri = x < 0.5 ? x * 4 - 1 : 3 - x * 4;
    samples[i] = Math.round(((tri + 1) / 2) * 15) / 7.5 - 1;
  }
  const out: [number, number][] = [[0, 0]];
  for (let h = 1; h <= 48; h++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < N; i++) {
      s += samples[i]! * Math.sin((TAU * h * i) / N);
      c += samples[i]! * Math.cos((TAU * h * i) / N);
    }
    out.push([(2 * s) / N, (2 * c) / N]);
  }
  return (chipTriCache = out);
}

const TABLE = 2048;

/** One band-limited cycle of `wave` for fundamental f0 at sample rate sr (peak 1). */
export function waveTable(wave: Wave, f0: number, sr: number): Float32Array {
  const table = new Float32Array(TABLE + 1);
  const limit = Math.min(sr * 0.45, 14000);
  const maxH = Math.max(1, Math.min(96, Math.floor(limit / f0)));
  for (let h = 1; h <= maxH; h++) {
    const [s, c] = harmonic(wave, h, f0);
    if (s === 0 && c === 0) continue;
    for (let i = 0; i < TABLE; i++) {
      const ph = (h * i) / TABLE;
      table[i]! += s * sinc(ph) + (c ? c * sinc(ph + 0.25) : 0);
    }
  }
  let peak = 0;
  for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(table[i]!));
  const g = peak > 0 ? 1 / peak : 1;
  for (let i = 0; i < TABLE; i++) table[i]! *= g;
  table[TABLE] = table[0]!;
  return table;
}

export interface SynthZoneData {
  data: Float32Array;
  /** Loop region (seconds into the buffer). */
  loopStart: number;
  loopEnd: number;
}

/**
 * Renders one zone: a transient (filter envelope, scoop, vibrato onset) followed by a
 * seamless sustain loop. Amplitude envelopes are left to the player.
 */
export function renderSynthZone(def: SynthDef, midi: number, velocity: number, sr: number): SynthZoneData {
  const f0 = midiToFreq(midi);
  const fenv = def.filter?.env;
  const vib = def.vibrato;
  const xfade = 0.12;
  // Transient: long enough for the filter envelope and vibrato onset to settle.
  let transient = xfade + 0.02;
  if (fenv) transient = Math.max(transient, fenv.a + fenv.d * 2.5);
  if (vib?.delay) transient = Math.max(transient, vib.delay + 0.35);
  if (def.scoop) transient = Math.max(transient, 0.12);
  transient = Math.min(transient, 2.5);
  let loop = 1.6;
  if (vib) loop = Math.max(1, Math.round(loop * vib.rate)) / vib.rate;
  const n = Math.ceil((transient + loop) * sr);
  const out = new Float32Array(n);

  const tables = def.oscs.map((o) => waveTable(o.wave, f0 * 2 ** (o.octave ?? 0), sr));
  const incs = def.oscs.map((o) => (f0 * 2 ** (o.octave ?? 0) * 2 ** ((o.detune ?? 0) / 1200)) / sr);
  const phases = def.oscs.map((_, k) => (k * 0.37) % 1);
  const gains = def.oscs.map((o) => o.gain);
  const f = def.filter;
  const base = f ? Math.min(sr * 0.45, f.freq * 2 ** (((midi - 60) / 12) * (f.keyTrack ?? 0))) : 0;
  const peak = f && fenv ? Math.min(sr * 0.45, base * (1 + fenv.amount * (0.4 + 0.6 * velocity))) : base;
  const filter = f ? new Biquad(sr, f.type, base, f.q ?? 0.7) : null;
  const noise = def.breath ? new Noise(Math.floor(midi * 977)) : null;
  const breathBp = def.breath ? new Biquad(sr, 'bandpass', Math.min(sr * 0.4, f0 * 2.5), 1.2) : null;
  const breathGain = def.breath ? def.breath / def.gain : 0;

  let ratio = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0 && (def.scoop || vib)) {
      // Pitch: scoop into the note, then (delayed) vibrato. Updated every 16 samples.
      let cents = 0;
      if (def.scoop) cents += def.scoop * Math.max(0, 1 - t / 0.07);
      if (vib) {
        const depth = vib.delay ? Math.min(1, Math.max(0, (t - vib.delay) / 0.3)) : 1;
        cents += vib.depth * depth * sinc(vib.rate * t);
      }
      ratio = 2 ** (cents / 1200);
    }
    let x = 0;
    for (let k = 0; k < tables.length; k++) {
      let ph = phases[k]! + incs[k]! * ratio;
      ph -= Math.floor(ph);
      phases[k] = ph;
      const pos = ph * TABLE;
      const j = pos | 0;
      const tb = tables[k]!;
      const a = tb[j]!;
      x += (a + (tb[j + 1]! - a) * (pos - j)) * gains[k]!;
    }
    if (noise && breathBp) x += breathBp.tick(noise.next()) * breathGain;
    if (filter && f) {
      if (fenv && (i & 31) === 0) {
        let env: number;
        if (t < fenv.a) env = t / fenv.a;
        else env = fenv.s + (1 - fenv.s) * Math.exp(-(t - fenv.a) / Math.max(0.005, fenv.d / 3));
        filter.set(f.type, base + (peak - base) * env, f.q ?? 0.7);
      }
      x = filter.tick(x);
    }
    out[i] = x;
  }
  // Seamless loop: blend the end of the loop into what precedes the loop start.
  const ls = Math.floor(transient * sr);
  const le = n;
  const xf = Math.floor(xfade * sr);
  for (let i = 0; i < xf; i++) {
    const w = i / xf;
    const a = le - xf + i;
    const b = ls - xf + i;
    out[a] = out[a]! * (1 - w) + out[b]! * w;
  }
  // Normalize (the def's gain and velocity are applied at playback).
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]!));
  if (pk > 0) for (let i = 0; i < n; i++) out[i]! *= 0.8 / pk;
  // A gentle fade-in so the first sample isn't a step.
  const fi = Math.min(n, Math.floor(0.002 * sr));
  for (let i = 0; i < fi; i++) out[i]! *= i / fi;
  return { data: out, loopStart: ls / sr, loopEnd: le / sr };
}

/** Zone roots (MIDI) for synth patches: every three semitones across the keyboard. */
export const SYNTH_ROOTS: number[] = Array.from({ length: 31 }, (_, k) => 18 + k * 3);

/** Whether velocity changes the baked timbre (two velocity layers). */
export function synthLayers(def: SynthDef): 1 | 2 {
  return def.filter?.env ? 2 : 1;
}

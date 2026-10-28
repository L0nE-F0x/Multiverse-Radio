// Formant choir, vocoder pad, vocal-chop, and shanty-choir synthesis (v5).
// Uses a 3-band parallel Biquad bandpass vowel resonator bank (F1, F2, F3) that morphs
// across vowels A / E / I / O / U so rendered synth zones carry unmistakable human
// vocal tract resonances while staying cheap (baked into SampleBank looping zones).

import { Biquad, sinc } from './core';
import type { SynthDef } from './synths';

export type FormantSynthPatch = 'formant-choir' | 'vocoder-pad' | 'vocal-chop' | 'shanty-choir';

export type VowelName = 'A' | 'E' | 'I' | 'O' | 'U';

/** Center frequencies [F1, F2, F3] in Hz for standard sung vowels. */
export const VOWEL_FORMANTS: Record<VowelName, readonly [number, number, number]> = {
  A: [730, 1090, 2440],
  E: [530, 1840, 2480],
  I: [310, 2180, 2960],
  O: [570, 840, 2410],
  U: [340, 870, 2240],
};

interface FormantProfile {
  vowels: readonly VowelName[];
  /** Cycles per second through the vowel sequence (aligned to 1.6s loop period). */
  rate: number;
  q: readonly [number, number, number];
  gains: readonly [number, number, number];
  dry: number;
  wet: number;
  tractScale: number;
  /** Optional fast onset vowel articulation (for vocal-chop). */
  onsetVowel?: VowelName;
}

const PROFILES: Record<FormantSynthPatch, FormantProfile> = {
  'formant-choir': {
    vowels: ['A', 'O', 'U', 'E'],
    rate: 0.625,
    q: [4.2, 5.0, 5.5],
    gains: [1.0, 0.72, 0.35],
    dry: 0.42,
    wet: 1.25,
    tractScale: 1.0,
  },
  'vocoder-pad': {
    vowels: ['E', 'A', 'O', 'I'],
    rate: 1.25,
    q: [5.5, 6.5, 7.2],
    gains: [0.95, 0.85, 0.45],
    dry: 0.38,
    wet: 1.35,
    tractScale: 1.04,
  },
  'vocal-chop': {
    vowels: ['A', 'E', 'O', 'A'],
    rate: 1.25,
    q: [4.8, 5.5, 6.0],
    gains: [1.05, 0.8, 0.4],
    dry: 0.4,
    wet: 1.3,
    tractScale: 1.08,
    onsetVowel: 'U',
  },
  'shanty-choir': {
    vowels: ['O', 'A', 'O', 'U'],
    rate: 0.625,
    q: [3.8, 4.4, 5.0],
    gains: [1.1, 0.68, 0.28],
    dry: 0.45,
    wet: 1.2,
    tractScale: 0.92,
  },
};

export function isFormantPatch(patch: string): patch is FormantSynthPatch {
  return patch === 'formant-choir' || patch === 'vocoder-pad' || patch === 'vocal-chop' || patch === 'shanty-choir';
}

/**
 * Applies a time-varying 3-formant vowel resonator bank (F1/F2/F3 bandpass filters)
 * in-place to a synth zone buffer.
 */
export function applyFormantFilter(buf: Float32Array, sr: number, patch: string, freq: number): void {
  if (buf.length === 0) return;
  const key: FormantSynthPatch = isFormantPatch(patch) ? patch : 'formant-choir';
  const prof = PROFILES[key];
  const scale = prof.tractScale * Math.min(1.3, Math.max(0.82, (freq / 261.63) ** 0.12));
  const nyq = sr * 0.44;

  const v0 = VOWEL_FORMANTS[prof.onsetVowel ?? prof.vowels[0]!];
  const bp1 = new Biquad(sr, 'bandpass', Math.min(nyq, v0[0] * scale), prof.q[0]);
  const bp2 = new Biquad(sr, 'bandpass', Math.min(nyq, v0[1] * scale), prof.q[1]);
  const bp3 = new Biquad(sr, 'bandpass', Math.min(nyq, v0[2] * scale), prof.q[2]);

  const [g1, g2, g3] = prof.gains;
  const [q1, q2, q3] = prof.q;
  const vowels = prof.vowels;
  const vLen = vowels.length;

  for (let i = 0; i < buf.length; i++) {
    if ((i & 31) === 0) {
      const t = i / sr;
      // Smoothly cycle through the vowel table.
      const pos = (t * prof.rate * vLen) % vLen;
      const idx = pos | 0;
      const frac = 0.5 - 0.5 * Math.cos(Math.PI * (pos - idx));
      const va = VOWEL_FORMANTS[vowels[idx]!];
      const vb = VOWEL_FORMANTS[vowels[(idx + 1) % vLen]!];

      let f1 = va[0] + (vb[0] - va[0]) * frac;
      let f2 = va[1] + (vb[1] - va[1]) * frac;
      let f3 = va[2] + (vb[2] - va[2]) * frac;

      // Fast formant scoop on the syllable onset for vocal chops ("oo-ah").
      if (prof.onsetVowel && t < 0.14) {
        const u = t / 0.14;
        const onset = VOWEL_FORMANTS[prof.onsetVowel];
        f1 = onset[0] + (f1 - onset[0]) * u;
        f2 = onset[1] + (f2 - onset[1]) * u;
        f3 = onset[2] + (f3 - onset[2]) * u;
      } else {
        // Subtle formant shimmer tied to the loop-synchronous LFO.
        const shimmer = 1 + 0.025 * sinc(prof.rate * 2 * t);
        f1 *= shimmer;
        f2 *= shimmer;
      }

      bp1.set('bandpass', Math.min(nyq, f1 * scale), q1);
      bp2.set('bandpass', Math.min(nyq, f2 * scale), q2);
      bp3.set('bandpass', Math.min(nyq, f3 * scale), q3);
    }

    const x = buf[i]!;
    const wet = bp1.tick(x) * g1 + bp2.tick(x) * g2 + bp3.tick(x) * g3;
    buf[i] = x * prof.dry + wet * prof.wet;
  }
}

export const FORMANT_SYNTHS: Record<FormantSynthPatch, SynthDef> = {
  // Lush human choir morphing slowly through A → O → U → E.
  'formant-choir': {
    oscs: [
      { wave: 'vowel', detune: -8, gain: 0.45 },
      { wave: 'sawtooth', detune: 8, gain: 0.35 },
      { wave: 'sine', gain: 0.32 },
      { wave: 'vowel', octave: 1, detune: -4, gain: 0.16 },
    ],
    filter: { type: 'lowpass', freq: 3400, q: 0.6, keyTrack: 0.35 },
    amp: { a: 0.42, d: 1.2, s: 0.88, r: 1.35 },
    vibrato: { rate: 5.0, depth: 10, delay: 0.22 },
    breath: 0.018,
    formant: 'formant-choir',
    gain: 0.54,
  },
  // Classic multi-band vocoder pad: pulse + sawtooth carrier through narrow vowel bands.
  'vocoder-pad': {
    oscs: [
      { wave: 'sawtooth', detune: -5, gain: 0.46 },
      { wave: 'pulse25', detune: 5, gain: 0.38 },
      { wave: 'sine', gain: 0.34 },
      { wave: 'sawtooth', octave: 1, detune: 3, gain: 0.18 },
    ],
    filter: { type: 'lowpass', freq: 4200, q: 0.75, keyTrack: 0.4 },
    amp: { a: 0.18, d: 0.8, s: 0.85, r: 0.85 },
    vibrato: { rate: 5.0, depth: 6, delay: 0.28 },
    breath: 0.014,
    formant: 'vocoder-pad',
    gain: 0.52,
  },
  // Articulated vocal hook chop: quick "oo → ah" formant envelope and pitch scoop.
  'vocal-chop': {
    oscs: [
      { wave: 'vowel', detune: -6, gain: 0.48 },
      { wave: 'reed', detune: 6, gain: 0.38 },
      { wave: 'sine', gain: 0.35 },
    ],
    filter: {
      type: 'lowpass',
      freq: 2600,
      q: 1.1,
      keyTrack: 0.45,
      env: { amount: 1.5, a: 0.008, d: 0.18, s: 0.45 },
    },
    amp: { a: 0.01, d: 0.22, s: 0.68, r: 0.18 },
    vibrato: { rate: 5.0, depth: 11, delay: 0.18 },
    scoop: -32,
    breath: 0.016,
    formant: 'vocal-chop',
    gain: 0.7,
  },
  // Hearty chest-voice maritime chorus for shanties and pub refrains.
  'shanty-choir': {
    oscs: [
      { wave: 'vowel', detune: -10, gain: 0.44 },
      { wave: 'sawtooth', detune: 9, gain: 0.34 },
      { wave: 'horn', detune: -3, gain: 0.3 },
      { wave: 'sine', gain: 0.34 },
    ],
    filter: {
      type: 'lowpass',
      freq: 2700,
      q: 0.7,
      keyTrack: 0.35,
      env: { amount: 0.8, a: 0.025, d: 0.24, s: 0.6 },
    },
    amp: { a: 0.035, d: 0.32, s: 0.88, r: 0.32 },
    vibrato: { rate: 5.0, depth: 12, delay: 0.22 },
    scoop: -24,
    breath: 0.02,
    formant: 'shanty-choir',
    gain: 0.56,
  },
};

// Sampled instruments, synthesized from scratch: electric pianos, pianos, plucked
// strings, mallets, basses, drum kits and looping textures. Each patch renders one
// buffer per zone (root note × velocity layer) on demand.

import { midiToFreq } from '../theory';
import type { SamplePatch } from '../score';
import {
  addPartials,
  Biquad,
  crush,
  dcBlock,
  fadeHead,
  fadeTail,
  makeLoop,
  Noise,
  normalize,
  OnePole,
  saturate,
  sinc,
  TAU,
  type Partial,
} from './core';

export interface PatchDef {
  /** Zone root notes (MIDI). One-shots use [60]. */
  roots: number[];
  /** Velocity layers (1 or 2). */
  layers: 1 | 2;
  /** Render at the context's full rate (bright sounds) rather than 32 kHz. */
  hiFi?: boolean;
  /** Explicit render rate (overrides hiFi), e.g. 24 kHz for dull textures. */
  rate?: number;
  /** Loops forever (textures). */
  loop?: boolean;
  /** Output channel count (default 1). */
  channels?: 1 | 2;
  /** Playback level multiplier (peak-normalized one-shots differ a lot in loudness). */
  level?: number;
  render(root: number, layer: number, sr: number): Float32Array[];
}

const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let n = lo; n <= hi; n += step) out.push(n);
  return out;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function seedFor(root: number, layer: number, salt: number): number {
  return (Math.imul(root + 1, 2654435761) ^ Math.imul(layer + 7, 40503) ^ salt) >>> 0;
}

function finish(buf: Float32Array, sr: number, level = 0.8): Float32Array[] {
  dcBlock(buf, sr, 18);
  fadeHead(buf, sr, 0.001);
  fadeTail(buf, sr, 0.05);
  normalize(buf, level);
  return [buf];
}

// ── Keys ──────────────────────────────────────────────────────────────────────

function renderEP(midi: number, hard: boolean, sr: number, kind: 'ep' | 'ep-bright' | 'wurli'): Float32Array[] {
  const f = midiToFreq(midi);
  const dur = clamp(6.5 - (midi - 36) * 0.075, 2.2, 6.5);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const wurli = kind === 'wurli';
  const bright = kind === 'ep-bright' ? 0.45 : 0;
  const i0 = (hard ? 1.9 : 1.05) + bright + (wurli ? 0.6 : 0);
  const iSus = wurli ? 0.5 : 0.22;
  const tauA = clamp(3.4 - (midi - 40) * 0.05, 0.75, 3.4) * (wurli ? 0.55 : 1);
  const tauFast = tauA * 0.16;
  // The "tine": a short metallic ping above the fundamental.
  const tineRatio = f * 7 < 5200 ? 7 : Math.max(2, Math.floor(5200 / f));
  const tineAmp = (hard ? 0.11 : 0.05) * (wurli ? 0.4 : 1);
  const twoAmp = wurli ? 0.03 : 0.1;
  const k = i0 / TAU;
  // Recursive envelopes (cheaper than Math.exp per sample).
  const dA = Math.exp(-1 / (tauA * sr));
  const dF = Math.exp(-1 / (tauFast * sr));
  const dI = Math.exp(-1 / (0.2 * sr));
  const dT = Math.exp(-1 / (0.035 * sr));
  const d2 = Math.exp(-1 / (tauA * 0.45 * sr));
  let eA = 0.68;
  let eF = 0.32;
  let eI = 1;
  let eT = tineAmp;
  let e2 = twoAmp;
  const atk = 0.0015 * sr;
  const tineAtk = 0.001 * sr;
  const df = f / sr;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const env = (i < atk ? i / atk : 1) * (eA + eF);
    const index = k * (iSus + (1 - iSus) * eI);
    const car = sinc(ph + index * sinc(ph));
    const tine = eT > 1e-5 ? eT * sinc(ph * tineRatio) * (i < tineAtk ? i / tineAtk : 1) : 0;
    const two = e2 * sinc(2 * ph + 0.1);
    out[i] = env * (car + two) + tine;
    ph += df;
    eA *= dA;
    eF *= dF;
    eI *= dI;
    eT *= dT;
    e2 *= d2;
  }
  if (wurli) saturate(out, 0.35);
  return finish(out, sr, 0.8);
}

function renderPiano(midi: number, hard: boolean, sr: number, felt: boolean): Float32Array[] {
  const f = midiToFreq(midi);
  const dur = clamp(7 - (midi - 30) * 0.07, 1.6, 7);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const B = 0.00008 * 2 ** ((midi - 60) / 18);
  const tau1 = clamp(4.8 - (midi - 40) * 0.065, 0.6, 4.8) * (felt ? 0.8 : 1);
  const limit = felt ? 5000 : 8500;
  const partials: Partial[] = [];
  const tilt = felt ? 0.42 : hard ? 0.11 : 0.22;
  for (let h = 1; h <= 18; h++) {
    const fh = h * f * Math.sqrt(1 + B * h * h);
    if (fh > limit) break;
    const amp = (1 / h ** (felt ? 1.25 : 0.85)) * Math.exp(-(h - 1) * tilt);
    const tau = tau1 / (1 + 0.55 * (h - 1)) ** 0.85;
    partials.push({ freq: fh, amp: amp * 0.62, tau: tau * 0.32, attack: 0.002 });
    if (h <= 8) partials.push({ freq: fh * 1.0007, amp: amp * 0.38, tau: tau * 1.5, attack: 0.002, phase: 0.13 * h });
  }
  addPartials(out, sr, partials);
  // Hammer thump.
  const noise = new Noise(seedFor(midi, hard ? 1 : 0, 99));
  const lp = new OnePole(sr, felt ? 700 : 1800);
  const thumpLen = Math.floor(0.012 * sr);
  const thumpAmp = (felt ? 0.08 : 0.12) * (hard ? 1.4 : 1);
  for (let i = 0; i < thumpLen; i++) out[i]! += lp.tick(noise.next()) * thumpAmp * (1 - i / thumpLen);
  return finish(out, sr, 0.8);
}

/** Karplus–Strong plucked string with fractional-delay tuning. */
function pluck(
  out: Float32Array,
  sr: number,
  f: number,
  opts: { t60: number; excite: (n: Noise, i: number, len: number) => number; seed: number; gain?: number; position?: number },
): void {
  const total = sr / f;
  const N = Math.max(2, Math.floor(total - 0.5 - 0.15));
  const d = total - 0.5 - N; // fractional part for the allpass
  const C = (1 - d) / (1 + d);
  const line = new Float32Array(N);
  const noise = new Noise(opts.seed);
  for (let i = 0; i < N; i++) line[i] = opts.excite(noise, i, N);
  if (opts.position) {
    // Pluck position: comb out harmonics that have a node there.
    const p = Math.max(1, Math.round(N * opts.position));
    const copy = line.slice();
    for (let i = 0; i < N; i++) line[i] = copy[i]! - copy[(i - p + N) % N]! * 0.9;
  }
  const g = 10 ** (-3 / (opts.t60 * f));
  const gain = opts.gain ?? 1;
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < out.length; i++) {
    const read = line[idx]!;
    const avg = 0.5 * (read + prev);
    prev = read;
    const ap = C * avg + apX - C * apY;
    apX = avg;
    apY = ap;
    const y = ap * g;
    line[idx] = y;
    out[i]! += read * gain;
    idx++;
    if (idx === N) idx = 0;
  }
}

function renderNylon(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(5 - (midi - 40) * 0.05, 1.8, 5) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 1400 + f * 2);
  pluck(out, sr, f, {
    t60: clamp(4.5 - (midi - 40) * 0.06, 1.2, 4.5),
    seed: seedFor(midi, 0, 7),
    position: 0.18,
    excite: (no) => lp.tick(no.next()),
  });
  // Guitar body: a couple of resonances.
  const body1 = new Biquad(sr, 'peaking', 110, 1.2, 5);
  const body2 = new Biquad(sr, 'peaking', 240, 1.5, 3);
  const soft = new Biquad(sr, 'lowpass', 4200, 0.6);
  for (let i = 0; i < n; i++) out[i] = soft.tick(body2.tick(body1.tick(out[i]!)));
  return finish(out, sr, 0.8);
}

function renderHarpsichord(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(5 - (midi - 40) * 0.05, 1.6, 5) * sr);
  const out = new Float32Array(n);
  const t60 = clamp(6 - (midi - 36) * 0.07, 1.5, 6);
  pluck(out, sr, f, { t60, seed: seedFor(midi, 0, 11), position: 0.12, excite: (no) => no.next(), gain: 0.7 });
  pluck(out, sr, f * 1.0012, { t60: t60 * 0.9, seed: seedFor(midi, 1, 11), position: 0.09, excite: (no) => no.next(), gain: 0.45 });
  const body = new Biquad(sr, 'peaking', 520, 0.9, 4);
  const air = new Biquad(sr, 'highshelf', 4000, 0.7, -3);
  for (let i = 0; i < n; i++) out[i] = air.tick(body.tick(out[i]!));
  return finish(out, sr, 0.8);
}

function renderPizz(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(1.6 - (midi - 40) * 0.01, 0.6, 1.6) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 700 + f);
  pluck(out, sr, f, { t60: clamp(1.4 - (midi - 40) * 0.012, 0.4, 1.4), seed: seedFor(midi, 0, 13), position: 0.3, excite: (no) => lp.tick(no.next()) });
  const body = new Biquad(sr, 'peaking', 280, 1.1, 6);
  const body2 = new Biquad(sr, 'peaking', 900, 1.4, 3);
  for (let i = 0; i < n; i++) out[i] = body2.tick(body.tick(out[i]!));
  return finish(out, sr, 0.8);
}

// ── Mallets and bells ─────────────────────────────────────────────────────────

function mallet(midi: number, sr: number, dur: number, modes: [ratio: number, amp: number, tau: number][], click: number, clickTone: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  addPartials(
    out,
    sr,
    modes.map(([r, a, tau], k) => ({ freq: f * r, amp: a, tau, attack: k === 0 ? 0.002 : 0.0008 })),
  );
  if (click > 0) {
    const noise = new Noise(seedFor(midi, 0, 17));
    const bp = new Biquad(sr, 'bandpass', Math.min(clickTone, sr * 0.4), 0.8);
    const len = Math.floor(0.006 * sr);
    for (let i = 0; i < len; i++) out[i]! += bp.tick(noise.next()) * click * (1 - i / len);
  }
  return finish(out, sr, 0.8);
}

function renderSteel(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(3 - (midi - 50) * 0.03, 1.4, 3) * sr);
  const out = new Float32Array(n);
  // Characteristic "bloom": the octave partial swells just after the strike.
  const d1 = Math.exp(-1 / (0.9 * sr));
  const d2a = Math.exp(-1 / (0.03 * sr));
  const d2 = Math.exp(-1 / (0.45 * sr));
  const d3 = Math.exp(-1 / (0.18 * sr));
  const d4 = Math.exp(-1 / (0.08 * sr));
  let e1 = 1;
  let e2a = 1;
  let e2 = 0.85;
  let e3 = 0.35;
  let e4 = 0.15;
  const atk = 0.004 * sr;
  const df = f / sr;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const a = i < atk ? i / atk : 1;
    out[i] = a * (e1 * sinc(ph) + (1 - e2a) * e2 * sinc(2.003 * ph + 0.2) + e3 * sinc(3.01 * ph) + e4 * sinc(4.02 * ph + 0.4));
    ph += df;
    e1 *= d1;
    e2a *= d2a;
    e2 *= d2;
    e3 *= d3;
    e4 *= d4;
  }
  return finish(out, sr, 0.8);
}

// ── Basses ────────────────────────────────────────────────────────────────────

function renderBass(midi: number, hard: boolean, sr: number, kind: 'bass-round' | 'bass-upright' | 'bass-sub'): Float32Array[] {
  const f = midiToFreq(midi);
  const dur = kind === 'bass-sub' ? 4.5 : 3.2;
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  if (kind === 'bass-upright') {
    const partials: Partial[] = [];
    for (let h = 1; h <= 10; h++) {
      if (h * f > 3000) break;
      partials.push({ freq: h * f * (1 + 0.0004 * h), amp: (1 / h ** 1.2) * (hard ? 1 : Math.exp(-(h - 1) * 0.25)), tau: 1.6 / h ** 0.9, attack: 0.004 });
    }
    addPartials(out, sr, partials);
    const noise = new Noise(seedFor(midi, 0, 23));
    const lp = new OnePole(sr, 500);
    const len = Math.floor(0.03 * sr);
    for (let i = 0; i < len; i++) out[i]! += lp.tick(noise.next()) * 0.35 * (1 - i / len);
    const body = new Biquad(sr, 'peaking', 95, 1, 4);
    body.process(out);
  } else {
    const sub = kind === 'bass-sub';
    const tauLong = sub ? 3.5 : 1.9;
    const dS = Math.exp(-1 / (0.22 * sr));
    const dL = Math.exp(-1 / (tauLong * sr));
    const d2 = Math.exp(-1 / (0.35 * sr));
    const d3 = Math.exp(-1 / (0.18 * sr));
    const dP = Math.exp(-1 / (0.03 * sr));
    let eS = 0.45;
    let eL = 0.55;
    let e2 = sub ? 0.12 : 0.38;
    let e3 = (sub ? 0.03 : 0.14) * (hard ? 1.4 : 1);
    let bend = sub ? 0 : 0.012; // a touch of pitch drop at the pluck
    const atk = 0.006 * sr;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      ph += (f * (1 + bend)) / sr;
      bend *= dP;
      out[i] = (i < atk ? i / atk : 1) * (eS + eL) * (sinc(ph) + e2 * sinc(2 * ph + 0.1) + e3 * sinc(3 * ph + 0.3));
      eS *= dS;
      eL *= dL;
      e2 *= d2;
      e3 *= d3;
    }
    saturate(out, sub ? 0.25 : 0.4);
  }
  return finish(out, sr, 0.8);
}

// ── Drums ─────────────────────────────────────────────────────────────────────

type DrumRenderer = (sr: number) => Float32Array;

function sweepSine(out: Float32Array, sr: number, f0: number, f1: number, pitchTau: number, ampTau: number, amp = 1, attack = 0.001): void {
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / pitchTau);
    ph += f / sr;
    out[i]! += amp * sinc(ph) * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

function noiseBurst(
  out: Float32Array,
  sr: number,
  seed: number,
  amp: number,
  ampTau: number,
  filters: Biquad[],
  attack = 0.0005,
  start = 0,
): void {
  const noise = new Noise(seed);
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / sr;
    let x = noise.next();
    for (const f of filters) x = f.tick(x);
    out[i]! += x * amp * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

/** 808-style metallic cluster: six detuned square waves. */
function metal(out: Float32Array, sr: number, amp: number, tau: number, base = 1, hpFreq = 6500): void {
  const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((x) => (x * base) / sr);
  const phases = [0.1, 0.4, 0.7, 0.2, 0.9, 0.5];
  const hp = new Biquad(sr, 'highpass', hpFreq, 0.7);
  const bp = new Biquad(sr, 'bandpass', hpFreq * 1.5, 0.9);
  const d = Math.exp(-1 / (tau * sr));
  let env = amp;
  const end = Math.min(out.length, Math.ceil(tau * 9 * sr));
  for (let i = 0; i < end; i++) {
    let s = 0;
    for (let k = 0; k < 6; k++) {
      let p = phases[k]! + freqs[k]!;
      if (p >= 1) p -= 1;
      phases[k] = p;
      s += p < 0.5 ? 1 : -1;
    }
    out[i]! += hp.tick(bp.tick(s / 6)) * env;
    env *= d;
  }
}

const len = (sr: number, s: number) => new Float32Array(Math.floor(sr * s));

const DRUMS: Record<string, DrumRenderer> = {
  'kick-lofi': (sr) => {
    const o = len(sr, 0.6);
    sweepSine(o, sr, 135, 48, 0.03, 0.19, 1, 0.0008);
    noiseBurst(o, sr, 5, 0.25, 0.004, [new Biquad(sr, 'lowpass', 3000)]);
    saturate(o, 0.5);
    new Biquad(sr, 'lowpass', 2600, 0.7).process(o);
    crush(o, 2, 12);
    return o;
  },
  'kick-soft': (sr) => {
    const o = len(sr, 0.6);
    sweepSine(o, sr, 110, 52, 0.028, 0.17, 1, 0.002);
    noiseBurst(o, sr, 6, 0.08, 0.003, [new Biquad(sr, 'lowpass', 1500)]);
    saturate(o, 0.2);
    return o;
  },
  'kick-808': (sr) => {
    const o = len(sr, 1.6);
    sweepSine(o, sr, 120, 44, 0.05, 0.75, 1, 0.001);
    saturate(o, 0.3);
    return o;
  },
  'kick-punch': (sr) => {
    const o = len(sr, 0.6);
    sweepSine(o, sr, 210, 50, 0.022, 0.32, 1, 0.0005);
    noiseBurst(o, sr, 7, 0.35, 0.003, [new Biquad(sr, 'bandpass', 3500, 0.8)]);
    saturate(o, 0.7);
    return o;
  },
  'kick-chip': (sr) => {
    const o = len(sr, 0.3);
    let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      ph += (55 + 220 * Math.exp(-t / 0.025)) / sr;
      const tri = 4 * Math.abs(ph - Math.floor(ph) - 0.5) - 1;
      o[i] = (Math.round(tri * 7) / 7) * Math.exp(-t / 0.09);
    }
    return o;
  },
  'snare-lofi': (sr) => {
    const o = len(sr, 0.5);
    sweepSine(o, sr, 230, 182, 0.02, 0.06, 0.6);
    sweepSine(o, sr, 360, 330, 0.02, 0.04, 0.25);
    noiseBurst(o, sr, 8, 0.75, 0.13, [new Biquad(sr, 'bandpass', 2600, 0.6), new Biquad(sr, 'highpass', 700)]);
    saturate(o, 0.45);
    new Biquad(sr, 'lowpass', 6500, 0.7).process(o);
    crush(o, 2, 11);
    return o;
  },
  'snare-brush': (sr) => {
    const o = len(sr, 0.45);
    sweepSine(o, sr, 210, 190, 0.02, 0.05, 0.18);
    noiseBurst(o, sr, 9, 0.6, 0.1, [new Biquad(sr, 'bandpass', 3500, 0.7)], 0.008);
    return o;
  },
  'snare-gated': (sr) => {
    const o = len(sr, 0.42);
    sweepSine(o, sr, 260, 195, 0.02, 0.08, 0.7);
    noiseBurst(o, sr, 10, 0.8, 0.5, [new Biquad(sr, 'bandpass', 2200, 0.5), new Biquad(sr, 'highpass', 500)]);
    // The gate: hold, then slam shut.
    const gateAt = Math.floor(0.3 * sr);
    for (let i = gateAt; i < o.length; i++) o[i]! *= Math.max(0, 1 - (i - gateAt) / (0.03 * sr));
    saturate(o, 0.4);
    return o;
  },
  'snare-march': (sr) => {
    const o = len(sr, 0.35);
    sweepSine(o, sr, 340, 300, 0.01, 0.04, 0.45);
    noiseBurst(o, sr, 11, 0.8, 0.09, [new Biquad(sr, 'highpass', 1500), new Biquad(sr, 'peaking', 5000, 1, 4)]);
    return o;
  },
  'snare-chip': (sr) => {
    const o = len(sr, 0.22);
    const noise = new Noise(12);
    let held = 0;
    for (let i = 0; i < o.length; i++) {
      if (i % 3 === 0) held = noise.next() > 0 ? 1 : -1;
      o[i] = held * Math.exp(-i / sr / 0.05) * 0.8;
    }
    return o;
  },
  'snare-dub': (sr) => {
    const o = len(sr, 0.4);
    sweepSine(o, sr, 480, 400, 0.01, 0.03, 0.7);
    noiseBurst(o, sr, 13, 0.7, 0.06, [new Biquad(sr, 'bandpass', 3000, 0.9)]);
    saturate(o, 0.3);
    return o;
  },
  rim: (sr) => {
    const o = len(sr, 0.2);
    sweepSine(o, sr, 1750, 1700, 0.01, 0.014, 0.7, 0.0002);
    sweepSine(o, sr, 520, 500, 0.01, 0.04, 0.55, 0.0002);
    sweepSine(o, sr, 820, 800, 0.01, 0.025, 0.3, 0.0002);
    noiseBurst(o, sr, 14, 0.4, 0.002, [new Biquad(sr, 'highpass', 2000)]);
    return o;
  },
  clap: (sr) => {
    const o = len(sr, 0.4);
    const bp = () => [new Biquad(sr, 'bandpass', 1300, 0.9)];
    for (let k = 0; k < 3; k++) noiseBurst(o.subarray(Math.floor(k * 0.011 * sr)), sr, 15 + k, 0.6, 0.006, bp());
    noiseBurst(o.subarray(Math.floor(0.033 * sr)), sr, 19, 0.5, 0.11, bp());
    return o;
  },
  'hat-closed': (sr) => {
    const o = len(sr, 0.18);
    metal(o, sr, 0.6, 0.03, 0.8, 4200);
    noiseBurst(o, sr, 20, 0.45, 0.022, [new Biquad(sr, 'bandpass', 6500, 0.7), new Biquad(sr, 'highpass', 3000)]);
    return o;
  },
  'hat-open': (sr) => {
    const o = len(sr, 0.9);
    metal(o, sr, 0.5, 0.26, 0.8, 4200);
    noiseBurst(o, sr, 21, 0.4, 0.2, [new Biquad(sr, 'bandpass', 6500, 0.6), new Biquad(sr, 'highpass', 3000)]);
    return o;
  },
  'hat-chip': (sr) => {
    const o = len(sr, 0.08);
    const noise = new Noise(22);
    for (let i = 0; i < o.length; i++) o[i] = (noise.next() > 0 ? 0.5 : -0.5) * Math.exp(-i / sr / 0.018);
    return o;
  },
  shaker: (sr) => {
    const o = len(sr, 0.16);
    noiseBurst(o, sr, 23, 0.8, 0.04, [new Biquad(sr, 'bandpass', 6500, 1.2), new Biquad(sr, 'highpass', 3000)], 0.012);
    return o;
  },
  ride: (sr) => {
    const o = len(sr, 2.2);
    const modes = [323, 459, 571, 732, 1041, 1478, 2147, 3122, 4570, 6230];
    addPartials(o, sr, modes.map((fr, k) => ({ freq: fr * 1.6, amp: 0.12 / (1 + k * 0.2), tau: 1.2 / (1 + k * 0.15), attack: 0.0005 })));
    noiseBurst(o, sr, 24, 0.22, 0.45, [new Biquad(sr, 'highpass', 5000), new Biquad(sr, 'peaking', 8000, 1, 5)]);
    noiseBurst(o, sr, 25, 0.3, 0.01, [new Biquad(sr, 'highpass', 3000)]);
    new Biquad(sr, 'highpass', 400).process(o);
    return o;
  },
  'brush-swish': (sr) => {
    const o = len(sr, 0.5);
    const noise = new Noise(26);
    const bp = new Biquad(sr, 'bandpass', 4200, 0.5);
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      const env = Math.sin(Math.PI * Math.min(1, t / 0.45)) ** 1.5;
      o[i] = bp.tick(noise.next()) * env * 0.6;
    }
    return o;
  },
  conga: (sr) => {
    const o = len(sr, 0.7);
    sweepSine(o, sr, 260, 200, 0.012, 0.22, 1);
    sweepSine(o, sr, 330, 318, 0.01, 0.08, 0.25);
    noiseBurst(o, sr, 27, 0.25, 0.006, [new Biquad(sr, 'bandpass', 1800, 1)]);
    return o;
  },
  bongo: (sr) => {
    const o = len(sr, 0.4);
    sweepSine(o, sr, 470, 400, 0.008, 0.11, 1);
    noiseBurst(o, sr, 28, 0.2, 0.004, [new Biquad(sr, 'bandpass', 3000, 1)]);
    return o;
  },
  timpani: (sr) => {
    const o = len(sr, 3.2);
    const f = 98; // G2; pitched by the player
    addPartials(o, sr, [
      { freq: f, amp: 1, tau: 1.4, attack: 0.004 },
      { freq: f * 1.505, amp: 0.55, tau: 0.9, attack: 0.004 },
      { freq: f * 1.99, amp: 0.35, tau: 0.6 },
      { freq: f * 2.44, amp: 0.2, tau: 0.4 },
      { freq: f * 2.9, amp: 0.1, tau: 0.25 },
    ]);
    noiseBurst(o, sr, 29, 0.35, 0.015, [new Biquad(sr, 'lowpass', 900)]);
    return o;
  },
  tom: (sr) => {
    const o = len(sr, 0.8);
    sweepSine(o, sr, 150, 105, 0.05, 0.3, 1);
    noiseBurst(o, sr, 30, 0.2, 0.02, [new Biquad(sr, 'lowpass', 2500)]);
    saturate(o, 0.3);
    return o;
  },
  cowbell: (sr) => {
    const o = len(sr, 0.5);
    const bp = new Biquad(sr, 'bandpass', 2400, 0.9);
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      const s = (sinc(540 * t) > 0 ? 1 : -1) + (sinc(800 * t) > 0 ? 1 : -1);
      o[i] = bp.tick(s * 0.5) * (0.6 * Math.exp(-t / 0.02) + 0.4 * Math.exp(-t / 0.18));
    }
    return o;
  },
  woodblock: (sr) => {
    const o = len(sr, 0.15);
    addPartials(o, sr, [
      { freq: 1150, amp: 1, tau: 0.025, attack: 0.0003 },
      { freq: 2780, amp: 0.4, tau: 0.012, attack: 0.0003 },
    ]);
    return o;
  },
  triangle: (sr) => {
    const o = len(sr, 2.4);
    addPartials(o, sr, [4200, 5360, 6900, 8800, 10900].map((fr, k) => ({ freq: fr, amp: 0.3 / (1 + k * 0.4), tau: 1.1 - k * 0.12, attack: 0.0003 })));
    return o;
  },
  crash: (sr) => {
    const o = len(sr, 3);
    noiseBurst(o, sr, 31, 0.6, 1.0, [new Biquad(sr, 'highpass', 2500), new Biquad(sr, 'peaking', 6000, 0.8, 4)]);
    metal(o, sr, 0.3, 0.9, 1.4);
    return o;
  },
  tick: (sr) => {
    const o = len(sr, 0.04);
    addPartials(o, sr, [{ freq: 3200, amp: 0.8, tau: 0.004, attack: 0.0002 }, { freq: 5100, amp: 0.4, tau: 0.002, attack: 0.0002 }]);
    return o;
  },
};

// ── Textures (stereo loops) ───────────────────────────────────────────────────

function vinyl(sr: number): Float32Array[] {
  const secs = 9.5;
  const n = Math.floor(secs * sr);
  const chans = [new Float32Array(n), new Float32Array(n)];
  const noise = new Noise(4242);
  // Surface hiss with the gentle swell of a rotating record (33⅓ rpm ≈ 0.555 Hz).
  for (const [c, ch] of chans.entries()) {
    const bp = new Biquad(sr, 'bandpass', 2800, 0.35);
    const rumble = new OnePole(sr, 35);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const swell = 0.75 + 0.25 * Math.sin(TAU * 0.555 * t + c);
      ch[i] = bp.tick(noise.next()) * 0.035 * swell + rumble.tick(noise.next()) * 0.25;
    }
  }
  // Crackle: mostly tiny ticks, a few proper pops.
  const rate = 22;
  const events = Math.floor(rate * secs);
  for (let e = 0; e < events; e++) {
    const at = Math.floor(noise.unit() * (n - 400));
    const u = noise.unit();
    const amp = 0.04 + 0.6 * u ** 7;
    const big = u > 0.97;
    const ringHz = big ? 700 + noise.unit() * 900 : 2000 + noise.unit() * 5000;
    const dur = big ? 0.004 : 0.0008 + noise.unit() * 0.0012;
    const pan = noise.unit();
    const m = Math.floor(dur * sr);
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      const s = sinc(ringHz * t + 0.25) * Math.exp(-t / (dur * 0.35)) * amp * (noise.unit() > 0.5 ? 1 : -1) ** (big ? 0 : 1);
      chans[0]![at + i]! += s * (1 - pan * 0.6);
      chans[1]![at + i]! += s * (0.4 + pan * 0.6);
    }
  }
  return chans.map((ch) => makeLoop(dcBlock(ch, sr, 25), sr, 0.4));
}

function rain(sr: number): Float32Array[] {
  const secs = 15;
  const n = Math.floor(secs * sr);
  const chans = [new Float32Array(n), new Float32Array(n)];
  const noise = new Noise(777);
  for (const [c, ch] of chans.entries()) {
    const lp = new Biquad(sr, 'lowpass', 5200, 0.5);
    const hp = new Biquad(sr, 'highpass', 350, 0.6);
    const pink = new OnePole(sr, 1800);
    let gust = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 255) === 0) {
        const t = i / sr;
        gust = 0.8 + 0.2 * Math.sin((TAU * t) / secs + c * 1.3) + 0.08 * Math.sin((TAU * 3 * t) / secs);
      }
      ch[i] = hp.tick(lp.tick(pink.tick(noise.next()) * 0.6 + noise.next() * 0.08)) * 0.22 * gust;
    }
  }
  const drop = (count: number, fLo: number, fHi: number, tLo: number, tHi: number, aLo: number, aHi: number) => {
    for (let e = 0; e < count; e++) {
      const at = Math.floor(noise.unit() * (n - sr * 0.3));
      const f = fLo + noise.unit() * (fHi - fLo);
      const tau = tLo + noise.unit() * (tHi - tLo);
      const amp = aLo + noise.unit() * (aHi - aLo);
      const pan = noise.unit();
      const m = Math.min(Math.floor(tau * 6 * sr), n - at);
      // A droplet is a resonance that rises in pitch as it decays.
      const dEnv = Math.exp(-1 / (tau * sr));
      const dChirp = Math.exp(-1 / (tau * 1.5 * sr));
      let env = amp;
      let chirp = 1;
      let ph = 0;
      for (let i = 0; i < m; i++) {
        ph += (f * (1.6 - 0.6 * chirp)) / sr;
        const s = sinc(ph) * env * (i < 24 ? i / 24 : 1);
        chans[0]![at + i]! += s * (1 - pan);
        chans[1]![at + i]! += s * pan;
        env *= dEnv;
        chirp *= dChirp;
      }
    }
  };
  drop(Math.floor(55 * secs), 1800, 7000, 0.002, 0.005, 0.006, 0.03);
  drop(Math.floor(1.6 * secs), 600, 1500, 0.012, 0.035, 0.025, 0.06);
  return chans.map((ch) => makeLoop(ch, sr, 1));
}

function staticNoise(sr: number): Float32Array[] {
  const secs = 11;
  const n = Math.floor(secs * sr);
  const noise = new Noise(31337);
  const chans = [new Float32Array(n), new Float32Array(n)];
  // Slow fading (QSB), periodic over the loop, plus bursts and crackles.
  for (const [c, ch] of chans.entries()) {
    const bp = new Biquad(sr, 'bandpass', 2300, 0.45);
    const lp = new OnePole(sr, 30);
    let burst = 0;
    let fade = 1;
    const burstDecay = Math.exp(-1 / (0.25 * sr));
    for (let i = 0; i < n; i++) {
      if ((i & 127) === 0) {
        const t = i / sr;
        fade = 0.55 + 0.3 * Math.sin((TAU * 2 * t) / secs + c * 0.3) + 0.15 * Math.sin((TAU * 5 * t) / secs);
      }
      const u = noise.unit();
      if (u < 3 / sr) burst = 1 + noise.unit() * 2;
      burst *= burstDecay;
      const crackle = u > 1 - 60 / sr ? noise.next() * 0.8 : 0;
      ch[i] = bp.tick(noise.next()) * 0.09 * fade * (1 + lp.tick(burst)) + crackle * 0.3;
    }
  }
  return chans.map((ch) => makeLoop(ch, sr, 0.5));
}

function hiss(sr: number): Float32Array[] {
  const n = Math.floor(7 * sr);
  const noise = new Noise(99);
  return [0, 1].map(() => {
    const ch = new Float32Array(n);
    const hp = new Biquad(sr, 'highpass', 1500, 0.5);
    const lp = new OnePole(sr, 9000);
    for (let i = 0; i < n; i++) ch[i] = hp.tick(lp.tick(noise.next())) * 0.05;
    return makeLoop(ch, sr, 0.3);
  });
}

function shortwave(sr: number): Float32Array[] {
  const secs = 16;
  const n = Math.floor(secs * sr);
  const noise = new Noise(1947);
  const chans = [new Float32Array(n), new Float32Array(n)];
  let ph = 0;
  const bp = [new Biquad(sr, 'bandpass', 1900, 0.5), new Biquad(sr, 'bandpass', 2100, 0.5)];
  let f = 1650;
  let whistleAmp = 0;
  let qsb = 1;
  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) {
      const t = i / sr;
      // A heterodyne whistle that drifts and fades with the loop.
      f = 1650 + 120 * Math.sin((TAU * t) / secs) + 25 * Math.sin((TAU * 3 * t) / secs);
      whistleAmp = 0.02 * Math.max(0, Math.sin((TAU * t) / secs + 0.5)) ** 2;
      qsb = 0.6 + 0.4 * Math.sin((TAU * 2 * t) / secs);
    }
    ph += f / sr;
    const u = noise.unit();
    const crackle = u < 30 / sr ? noise.next() * 0.5 : 0;
    const w = sinc(ph) * whistleAmp + crackle * 0.4;
    chans[0]![i] = bp[0]!.tick(noise.next()) * 0.07 * qsb + w;
    chans[1]![i] = bp[1]!.tick(noise.next()) * 0.07 * qsb + w;
  }
  // Two fast "chirps" per loop: a distant teletype sweeping past.
  for (const start of [3.2, 10.7]) {
    let p = 0;
    const m = Math.floor(0.35 * sr);
    const at = Math.floor(start * sr);
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      p += (500 + 2600 * (t / 0.35)) / sr;
      const s = sinc(p) * 0.015 * sinc(t / 0.7);
      chans[0]![at + i]! += s;
      chans[1]![at + i]! += s * 0.7;
    }
  }
  return chans.map((ch) => makeLoop(ch, sr, 0.6));
}

function ocean(sr: number): Float32Array[] {
  const secs = 24;
  const n = Math.floor(secs * sr);
  const noise = new Noise(4040);
  return [0, 1].map((c) => {
    const ch = new Float32Array(n);
    const lp = new Biquad(sr, 'lowpass', 800, 0.5);
    let env = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) {
        const t = i / sr;
        // Three waves per loop: slow rise, crash, long wash.
        const x = ((((t + c * 0.9) / 8) % 1) + 1) % 1;
        env = x < 0.55 ? (x / 0.55) ** 2 : Math.exp(-(x - 0.55) * 5);
        lp.set('lowpass', 250 + 2600 * env, 0.5);
      }
      ch[i] = lp.tick(noise.next()) * (0.05 + 0.3 * env);
    }
    return makeLoop(ch, sr, 0.8);
  });
}

// ── Registry ──────────────────────────────────────────────────────────────────

const oneShot = (fn: DrumRenderer, level = 1): PatchDef => ({
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

const texture = (fn: (sr: number) => Float32Array[], rate = 24000): PatchDef => ({
  roots: [60],
  layers: 1,
  rate,
  loop: true,
  channels: 2,
  render: (_r, _l, sr) => {
    const chans = fn(sr);
    normalize(chans, 0.7);
    return chans;
  },
});

const malletDef = (lo: number, hi: number, dur: (m: number) => number, modes: (m: number) => [number, number, number][], click: number, tone: number, hiFi = false): PatchDef => ({
  roots: range(lo, hi, 3),
  layers: 1,
  hiFi,
  render: (root, _l, sr) => mallet(root, sr, dur(root), modes(root), click, tone),
});

export const PATCHES: Record<SamplePatch, PatchDef> = {
  ep: { roots: range(33, 96, 3), layers: 2, rate: 24000, render: (r, l, sr) => renderEP(r, l === 1, sr, 'ep') },
  'ep-bright': { roots: range(33, 96, 3), layers: 2, rate: 32000, render: (r, l, sr) => renderEP(r, l === 1, sr, 'ep-bright') },
  wurli: { roots: range(33, 96, 3), layers: 2, rate: 24000, render: (r, l, sr) => renderEP(r, l === 1, sr, 'wurli') },
  'felt-piano': { roots: range(24, 102, 3), layers: 2, rate: 24000, render: (r, l, sr) => renderPiano(r, l === 1, sr, true) },
  piano: { roots: range(24, 102, 3), layers: 2, render: (r, l, sr) => renderPiano(r, l === 1, sr, false) },
  nylon: { roots: range(40, 88, 3), layers: 1, render: (r, _l, sr) => renderNylon(r, sr) },
  harpsichord: { roots: range(29, 92, 3), layers: 1, hiFi: true, render: (r, _l, sr) => renderHarpsichord(r, sr) },
  pizz: { roots: range(28, 96, 3), layers: 1, render: (r, _l, sr) => renderPizz(r, sr) },
  vibes: malletDef(
    48,
    93,
    (m) => clamp(4.5 - (m - 48) * 0.05, 2.2, 4.5),
    (m) => [
      [1, 1, clamp(3 - (m - 48) * 0.04, 1.2, 3)],
      [4, 0.22, 0.5],
      [10, 0.05, 0.12],
    ],
    0.15,
    3000,
  ),
  celesta: malletDef(
    60,
    108,
    (m) => clamp(2.6 - (m - 60) * 0.02, 1.2, 2.6),
    (m) => [
      [1, 1, clamp(1.4 - (m - 60) * 0.015, 0.5, 1.4)],
      [2, 0.12, 0.35],
      [4.95, 0.1, 0.08],
    ],
    0.1,
    6000,
    true,
  ),
  glass: malletDef(
    55,
    102,
    (m) => clamp(4.2 - (m - 55) * 0.03, 2, 4.2),
    (m) => [
      [1, 1, clamp(2.6 - (m - 55) * 0.025, 1.1, 2.6)],
      [2.32, 0.45, 1.1],
      [4.25, 0.18, 0.45],
      [6.63, 0.08, 0.2],
    ],
    0.04,
    7000,
    true,
  ),
  musicbox: malletDef(
    60,
    108,
    (m) => clamp(2.8 - (m - 60) * 0.025, 1.2, 2.8),
    (m) => [
      [1, 1, clamp(1.9 - (m - 60) * 0.02, 0.6, 1.9)],
      [3.0, 0.16, 0.25],
      [6.27, 0.12, 0.06],
    ],
    0.2,
    8000,
    true,
  ),
  marimba: malletDef(
    43,
    98,
    (m) => clamp(1.8 - (m - 43) * 0.015, 0.7, 1.8),
    (m) => [
      [1, 1, clamp(0.9 - (m - 43) * 0.01, 0.25, 0.9)],
      [3.93, 0.3, 0.09],
      [9.24, 0.08, 0.025],
    ],
    0.25,
    1500,
  ),
  kalimba: malletDef(
    55,
    91,
    (m) => clamp(2.2 - (m - 55) * 0.02, 1, 2.2),
    (m) => [
      [1, 1, clamp(1.3 - (m - 55) * 0.015, 0.5, 1.3)],
      [5.9, 0.18, 0.12],
      [2.0, 0.04, 0.4],
    ],
    0.3,
    1200,
  ),
  steeldrum: { roots: range(52, 88, 3), layers: 1, render: (r, _l, sr) => renderSteel(r, sr) },
  'bass-round': { roots: range(24, 60, 3), layers: 2, rate: 16000, level: 0.7, render: (r, l, sr) => renderBass(r, l === 1, sr, 'bass-round') },
  'bass-upright': { roots: range(24, 60, 3), layers: 2, rate: 16000, level: 0.65, render: (r, l, sr) => renderBass(r, l === 1, sr, 'bass-upright') },
  'bass-sub': { roots: range(24, 60, 3), layers: 1, rate: 12000, level: 0.65, render: (r, l, sr) => renderBass(r, l === 1, sr, 'bass-sub') },
  'kick-lofi': oneShot(DRUMS['kick-lofi']!, 0.75),
  'kick-soft': oneShot(DRUMS['kick-soft']!, 0.75),
  'kick-808': oneShot(DRUMS['kick-808']!, 0.75),
  'kick-punch': oneShot(DRUMS['kick-punch']!, 0.75),
  'kick-chip': oneShot(DRUMS['kick-chip']!, 0.8),
  'snare-lofi': oneShot(DRUMS['snare-lofi']!),
  'snare-brush': oneShot(DRUMS['snare-brush']!, 1.6),
  'snare-gated': oneShot(DRUMS['snare-gated']!, 0.75),
  'snare-march': oneShot(DRUMS['snare-march']!, 2),
  'snare-chip': oneShot(DRUMS['snare-chip']!, 0.8),
  'snare-dub': oneShot(DRUMS['snare-dub']!, 1.4),
  rim: oneShot(DRUMS.rim!, 1.8),
  clap: oneShot(DRUMS.clap!, 1.2),
  'hat-closed': oneShot(DRUMS['hat-closed']!, 2.8),
  'hat-open': oneShot(DRUMS['hat-open']!, 2.2),
  'hat-chip': oneShot(DRUMS['hat-chip']!),
  shaker: oneShot(DRUMS.shaker!, 2.8),
  ride: oneShot(DRUMS.ride!, 1.7),
  'brush-swish': oneShot(DRUMS['brush-swish']!),
  conga: oneShot(DRUMS.conga!),
  bongo: oneShot(DRUMS.bongo!, 1.6),
  timpani: oneShot(DRUMS.timpani!, 0.55),
  tom: oneShot(DRUMS.tom!, 0.6),
  cowbell: oneShot(DRUMS.cowbell!, 3),
  woodblock: oneShot(DRUMS.woodblock!, 2.5),
  triangle: oneShot(DRUMS.triangle!),
  crash: oneShot(DRUMS.crash!),
  tick: oneShot(DRUMS.tick!, 2.5),
  vinyl: { ...texture(vinyl, 32000), level: 1.6 },
  rain: { ...texture(rain), level: 0.7 },
  static: texture(staticNoise),
  hiss: texture(hiss),
  shortwave: texture(shortwave),
  ocean: { ...texture(ocean), level: 0.8 },
};

/** Pitch of an unpitched one-shot, so the player can transpose it relative to 60. */
export const ONE_SHOT_ROOT = 60;

/** Nearest zone root for a pitch. */
export function zoneRoot(def: PatchDef, midi: number): number {
  let best = def.roots[0]!;
  for (const r of def.roots) if (Math.abs(r - midi) < Math.abs(best - midi)) best = r;
  return best;
}

// Oscillator-based voices for sustained and synthetic sounds (pads, leads, brass,
// reeds, chip channels). Each note builds a few native nodes that stop themselves.

import type { SynthPatch } from '../score';
import { midiToFreq } from '../theory';

type Wave = OscillatorType | 'pulse12' | 'pulse25' | 'chipTri' | 'reed' | 'organ' | 'clarinet' | 'softSaw' | 'horn' | 'glass' | 'flute' | 'vowel';

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
    type: BiquadFilterType;
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
      { wave: 'sawtooth', detune: -8, gain: 0.5 },
      { wave: 'sawtooth', detune: 8, gain: 0.5 },
      { wave: 'triangle', octave: -1, gain: 0.35 },
    ],
    filter: { type: 'lowpass', freq: 900, q: 0.5, keyTrack: 0.3 },
    amp: { a: 1.4, d: 2, s: 0.8, r: 2.2 },
    gain: 0.2,
  },
  'pad-strings': {
    oscs: [
      { wave: 'sawtooth', detune: -11, gain: 0.4 },
      { wave: 'sawtooth', detune: 0, gain: 0.35 },
      { wave: 'sawtooth', detune: 12, gain: 0.4 },
    ],
    filter: { type: 'lowpass', freq: 2200, q: 0.6, keyTrack: 0.4 },
    amp: { a: 0.6, d: 1, s: 0.85, r: 1.3 },
    vibrato: { rate: 5.2, depth: 8 },
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
      { wave: 'sine', gain: 0.8 },
      { wave: 'sine', octave: 1, detune: 5, gain: 0.25 },
      { wave: 'sawtooth', octave: -1, gain: 0.2 },
    ],
    filter: { type: 'lowpass', freq: 380, q: 0.7 },
    amp: { a: 3, d: 2, s: 1, r: 4 },
    gain: 0.25,
  },
};

// ── Periodic waves ───────────────────────────────────────────────────────────

const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

function harmonicWave(ctx: BaseAudioContext, key: string, amp: (h: number) => number, count = 48, cosine = false): PeriodicWave {
  let map = waveCache.get(ctx);
  if (!map) waveCache.set(ctx, (map = new Map()));
  const hit = map.get(key);
  if (hit) return hit;
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let h = 1; h <= count; h++) (cosine ? real : imag)[h] = amp(h);
  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  map.set(key, wave);
  return wave;
}

function chipTriangle(): (h: number) => number {
  // Fourier coefficients of the NES's 4-bit stepped triangle.
  const N = 512;
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / N;
    const tri = x < 0.5 ? x * 4 - 1 : 3 - x * 4;
    samples[i] = Math.round(((tri + 1) / 2) * 15) / 7.5 - 1;
  }
  const coeffs: number[] = [0];
  for (let h = 1; h <= 40; h++) {
    let s = 0;
    for (let i = 0; i < N; i++) s += samples[i]! * Math.sin((2 * Math.PI * h * i) / N);
    coeffs.push((2 * s) / N);
  }
  return (h) => coeffs[h] ?? 0;
}

let chipTriCoeffs: ((h: number) => number) | null = null;

/** Formant envelope for an "ah/oo" vowel at fundamental f0. */
function vowelAmp(f0: number): (h: number) => number {
  const formants: [number, number, number][] = [
    [600, 1, 110],
    [1000, 0.5, 130],
    [2500, 0.12, 200],
  ];
  return (h) => {
    const f = h * f0;
    let a = 0;
    for (const [fc, g, bw] of formants) a += g * Math.exp(-(((f - fc) / bw) ** 2));
    return (a + 0.02 / h) * (f < 5000 ? 1 : 0);
  };
}

function periodicFor(ctx: BaseAudioContext, wave: Wave, midi: number): PeriodicWave | OscillatorType {
  switch (wave) {
    case 'pulse12':
    case 'pulse25': {
      const duty = wave === 'pulse12' ? 0.125 : 0.25;
      return harmonicWave(ctx, wave, (h) => (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty), 64, true);
    }
    case 'chipTri':
      chipTriCoeffs ??= chipTriangle();
      return harmonicWave(ctx, wave, chipTriCoeffs, 40);
    case 'reed':
      return harmonicWave(ctx, wave, (h) => (1 / h) * (1 + 1.4 * Math.exp(-(((h - 4) / 2.2) ** 2))), 40);
    case 'organ': {
      const bars: Record<number, number> = { 1: 1, 2: 0.75, 3: 0.55, 4: 0.4, 6: 0.22, 8: 0.18 };
      return harmonicWave(ctx, wave, (h) => bars[h] ?? 0, 8);
    }
    case 'clarinet':
      return harmonicWave(ctx, wave, (h) => (h % 2 === 1 ? 1 / h ** 0.8 : 0.04 / h) * (h > 13 ? 0.3 : 1), 24);
    case 'softSaw':
      return harmonicWave(ctx, wave, (h) => 1 / h ** 1.4, 32);
    case 'horn':
      return harmonicWave(ctx, wave, (h) => 1 / h ** 1.7, 24);
    case 'glass':
      return harmonicWave(ctx, wave, (h) => ({ 1: 1, 2: 0.25, 3: 0.12, 5: 0.06, 7: 0.03 })[h] ?? 0, 8);
    case 'flute':
      return harmonicWave(ctx, wave, (h) => ({ 1: 1, 2: 0.18, 3: 0.08, 4: 0.03 })[h] ?? 0, 6);
    case 'vowel': {
      const key = Math.round(midi);
      return harmonicWave(ctx, `vowel${key}`, vowelAmp(midiToFreq(key)), 40);
    }
    default:
      return wave;
  }
}

// ── Voice player ─────────────────────────────────────────────────────────────

export interface SynthNote {
  /** Context time to start. */
  at: number;
  dur: number;
  midi: number;
  vel: number;
  /** Start part-way through (joining mid-note): skip the attack, fade in quickly. */
  late?: boolean;
  from?: number;
  glide?: number;
  arp?: number[];
  arpRate?: number;
  /** Cents. */
  detune?: number;
  release?: number;
}

export interface SynthShared {
  /** Instrument-level vibrato (cents), if the patch has one. */
  vibrato?: AudioNode;
  noise?: AudioBuffer;
}

export function playSynth(ctx: BaseAudioContext, def: SynthDef, dest: AudioNode, note: SynthNote, shared: SynthShared): void {
  const { at, vel } = note;
  const dur = Math.max(0.02, note.dur);
  const release = note.release ?? def.amp.r;
  const relTau = Math.max(0.005, release / 4);
  const end = at + dur;
  const stopAt = end + relTau * 7;

  const out = ctx.createGain();
  const peak = def.gain * vel ** 1.3;
  const g = out.gain;
  const { a, d, s } = def.amp;
  if (note.late) {
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(peak * Math.max(s, 0.05), at + 0.03);
  } else if (dur <= a) {
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(peak * (dur / a), end);
  } else {
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(peak, at + a);
    g.setTargetAtTime(peak * s, at + a, Math.max(0.005, d / 3));
  }
  g.setTargetAtTime(0, end, relTau);

  let target: AudioNode = out;
  if (def.filter) {
    const f = def.filter;
    const filter = ctx.createBiquadFilter();
    filter.type = f.type;
    filter.Q.value = f.q ?? 0.7;
    const base = Math.min(18000, f.freq * 2 ** (((note.midi - 60) / 12) * (f.keyTrack ?? 0)));
    if (f.env && !note.late) {
      const peakF = Math.min(18000, base * (1 + f.env.amount * (0.4 + 0.6 * vel)));
      const fr = filter.frequency;
      fr.setValueAtTime(base, at);
      fr.linearRampToValueAtTime(peakF, at + f.env.a);
      fr.setTargetAtTime(base + (peakF - base) * f.env.s, at + f.env.a, Math.max(0.005, f.env.d / 3));
    } else {
      filter.frequency.value = base;
    }
    filter.connect(out);
    target = filter;
  }
  out.connect(dest);

  const oscs: OscillatorNode[] = [];
  let vibGain: GainNode | null = null;
  if (shared.vibrato && def.vibrato) {
    if (def.vibrato.delay) {
      vibGain = ctx.createGain();
      vibGain.gain.setValueAtTime(0, at);
      vibGain.gain.linearRampToValueAtTime(1, at + def.vibrato.delay + 0.3);
      shared.vibrato.connect(vibGain);
    }
  }
  for (const o of def.oscs) {
    const osc = ctx.createOscillator();
    const w = periodicFor(ctx, o.wave, note.midi);
    if (typeof w === 'string') osc.type = w as OscillatorType;
    else osc.setPeriodicWave(w);
    const shift = (o.octave ?? 0) * 12;
    const freq = (m: number) => midiToFreq(m + shift);
    osc.detune.value = (o.detune ?? 0) + (note.detune ?? 0);
    if (note.from !== undefined && note.glide) {
      osc.frequency.setValueAtTime(freq(note.from), at);
      osc.frequency.exponentialRampToValueAtTime(freq(note.midi), at + note.glide);
    } else if (note.arp && note.arp.length && note.arpRate) {
      const steps = Math.min(512, Math.ceil(dur / note.arpRate));
      for (let k = 0; k < steps; k++) osc.frequency.setValueAtTime(freq(note.midi + note.arp[k % note.arp.length]!), at + k * note.arpRate);
    } else if (def.scoop && !note.late) {
      osc.frequency.setValueAtTime(freq(note.midi + def.scoop / 100), at);
      osc.frequency.exponentialRampToValueAtTime(freq(note.midi), at + 0.07);
    } else {
      osc.frequency.value = freq(note.midi);
    }
    if (vibGain) vibGain.connect(osc.detune);
    else if (shared.vibrato && def.vibrato) shared.vibrato.connect(osc.detune);
    const og = ctx.createGain();
    og.gain.value = o.gain;
    osc.connect(og).connect(target);
    osc.start(at);
    osc.stop(stopAt);
    oscs.push(osc);
  }

  if (def.breath && shared.noise) {
    const src = ctx.createBufferSource();
    src.buffer = shared.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(9000, midiToFreq(note.midi) * 2.5);
    bp.Q.value = 1.2;
    const bg = ctx.createGain();
    bg.gain.value = def.breath / def.gain;
    src.connect(bp).connect(bg).connect(out);
    src.start(at, ((note.midi * 0.137) % 1) * 0.5);
    src.stop(stopAt);
  }

  const first = oscs[0];
  if (first) {
    first.onended = () => {
      if (vibGain) {
        shared.vibrato?.disconnect(vibGain);
        vibGain.disconnect();
      } else if (shared.vibrato && def.vibrato) {
        for (const osc of oscs) {
          try {
            shared.vibrato.disconnect(osc.detune);
          } catch {
            /* already gone */
          }
        }
      }
      out.disconnect();
    };
  }
}

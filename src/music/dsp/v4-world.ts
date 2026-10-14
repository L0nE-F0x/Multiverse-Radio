// Instruments for the v4 world recipes and talk beds (music-world workstream): a
// xylophone, a snare with a spring tank baked in, a judge's gavel, jungle birds for the
// exotica records, a theremin, a theatre organ with its tremulant, a church-quiet pipe
// organ, low strings, a cup-muted brass section, a "pa-pa" vocal group and a whistler.
// Like everything in dsp/, each zone is synthesized once into a buffer on demand.
//
// Self-contained on purpose (imports only core/theory) so patches.ts and synths.ts can
// spread these registries in without an import cycle.

import { midiToFreq } from '../theory';
import { addPartials, Biquad, dcBlock, fadeHead, fadeTail, Noise, normalize, OnePole, saturate, sinc } from './core';
import type { PatchDef } from './patches';
import type { SynthDef } from './synths';

export type WorldSamplePatch = 'xylophone' | 'spring-snare' | 'gavel' | 'jungle-bird';

export type WorldSynthPatch = 'theremin' | 'theatre-organ' | 'pipe-organ' | 'low-strings' | 'muted-brass' | 'pa-voice' | 'whistle';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let n = lo; n <= hi; n += step) out.push(n);
  return out;
};

const len = (sr: number, seconds: number) => new Float32Array(Math.floor(seconds * sr));

function finish(buf: Float32Array, sr: number, level = 0.8, tail = 0.04): Float32Array[] {
  dcBlock(buf, sr, 20);
  fadeHead(buf, sr, 0.001);
  fadeTail(buf, sr, tail);
  normalize(buf, level);
  return [buf];
}

// ── Xylophone ─────────────────────────────────────────────────────────────────

/** Rosewood bars: a short bright knock with the bar's twelfth (3×) tuned in. */
function renderXylophone(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const dur = clamp(0.9 - (midi - 60) * 0.012, 0.35, 0.9);
  const out = len(sr, dur);
  const tau = clamp(0.32 - (midi - 60) * 0.005, 0.09, 0.32);
  addPartials(out, sr, [
    { freq: f, amp: 1, tau, attack: 0.0006 },
    { freq: f * 3.0, amp: 0.38, tau: tau * 0.45, attack: 0.0004 },
    { freq: f * 6.1, amp: 0.1, tau: tau * 0.18, attack: 0.0003 },
    { freq: f * 9.4, amp: 0.04, tau: 0.01, attack: 0.0003 },
  ]);
  // The mallet: a hard little knock.
  const noise = new Noise((midi * 7919) >>> 0);
  const bp = new Biquad(sr, 'bandpass', Math.min(sr * 0.4, 4200), 0.9);
  const k = Math.floor(0.004 * sr);
  for (let i = 0; i < k; i++) out[i]! += bp.tick(noise.next()) * 0.7 * (1 - i / k);
  return finish(out, sr, 0.8, 0.03);
}

// ── Drums and effects ─────────────────────────────────────────────────────────

/**
 * A reggae rimshot-snare through a spring tank: the crack, then the "boing" — a feedback
 * delay full of all-passes, so high frequencies arrive before low ones (the chirp).
 */
function renderSpringSnare(sr: number): Float32Array {
  const out = len(sr, 1.7);
  const dry = new Float32Array(out.length);
  // Body and crack (tight and woody, rim-heavy).
  let ph = 0;
  for (let i = 0; i < dry.length; i++) {
    const t = i / sr;
    const fr = 330 + 140 * Math.exp(-t / 0.008);
    ph += fr / sr;
    dry[i]! += 0.6 * sinc(ph) * Math.exp(-t / 0.045);
  }
  const noise = new Noise(4127);
  const bp = new Biquad(sr, 'bandpass', 2600, 0.8);
  const hp = new Biquad(sr, 'highpass', 900, 0.7);
  for (let i = 0; i < dry.length; i++) {
    const t = i / sr;
    dry[i]! += hp.tick(bp.tick(noise.next())) * 0.9 * Math.exp(-t / 0.07) * (t < 0.0006 ? t / 0.0006 : 1);
  }
  addPartials(dry, sr, [{ freq: 1720, amp: 0.25, tau: 0.012, attack: 0.0002 }]);
  saturate(dry, 0.35);
  // The spring.
  const delay = Math.floor(0.031 * sr);
  const line = new Float32Array(delay);
  let w = 0;
  const ap = Array.from({ length: 8 }, () => ({ x1: 0, y1: 0 }));
  const g = 0.62;
  const lp = new OnePole(sr, 3600);
  const hpS = new Biquad(sr, 'highpass', 260, 0.6);
  const fb = 0.8;
  for (let i = 0; i < out.length; i++) {
    const back = line[w]!;
    let x = dry[i]! * 0.5 + back * fb;
    // Dispersion: a chain of first-order all-passes.
    for (const s of ap) {
      const y = -g * x + s.x1 + g * s.y1;
      s.x1 = x;
      s.y1 = y;
      x = y;
    }
    x = lp.tick(x);
    line[w] = x;
    w = (w + 1) % delay;
    out[i] = dry[i]! + hpS.tick(back) * 0.55;
  }
  return out;
}

/** A gavel on a sound block: a hard wooden knock with a low body under it. */
function renderGavel(sr: number): Float32Array {
  const out = len(sr, 0.5);
  addPartials(out, sr, [
    { freq: 142, amp: 0.9, tau: 0.06, attack: 0.0006 },
    { freq: 385, amp: 0.55, tau: 0.035, attack: 0.0004 },
    { freq: 910, amp: 0.5, tau: 0.018, attack: 0.0003 },
    { freq: 1530, amp: 0.3, tau: 0.01, attack: 0.0003 },
    { freq: 2480, amp: 0.15, tau: 0.006, attack: 0.0002 },
  ]);
  const noise = new Noise(9091);
  const bp = new Biquad(sr, 'bandpass', 1800, 0.7);
  const k = Math.floor(0.006 * sr);
  for (let i = 0; i < k; i++) out[i]! += bp.tick(noise.next()) * 1.1 * (1 - i / k);
  // A little panelled room.
  const taps = [0.011, 0.017, 0.029, 0.041];
  const dry = out.slice();
  taps.forEach((d, j) => {
    const o = Math.floor(d * sr);
    for (let i = 0; i + o < out.length; i++) out[i + o]! += dry[i]! * 0.22 * 0.7 ** j;
  });
  return out;
}

/**
 * Jungle birds, synthesized: a whooping call that climbs and falls with a warble, then a
 * laughing trill. Played at different pitches it becomes a different bird.
 */
function renderJungleBird(sr: number): Float32Array {
  const out = len(sr, 1.6);
  const calls: { at: number; dur: number; f0: number; f1: number; f2: number; warble: number; amp: number }[] = [
    { at: 0, dur: 0.22, f0: 900, f1: 1900, f2: 1400, warble: 0, amp: 0.8 },
    { at: 0.26, dur: 0.2, f0: 1000, f1: 2100, f2: 1500, warble: 0, amp: 0.7 },
    { at: 0.55, dur: 0.5, f0: 2300, f1: 2500, f2: 1500, warble: 22, amp: 0.55 },
    { at: 1.1, dur: 0.3, f0: 1700, f1: 1300, f2: 900, warble: 14, amp: 0.4 },
  ];
  for (const c of calls) {
    const start = Math.floor(c.at * sr);
    const m = Math.floor(c.dur * sr);
    let ph = 0;
    for (let i = 0; i < m && start + i < out.length; i++) {
      const u = i / m;
      // Rise to f1 then fall to f2 (a whoop).
      const shape = u < 0.4 ? c.f0 + (c.f1 - c.f0) * Math.sin((u / 0.4) * (Math.PI / 2)) : c.f1 + (c.f2 - c.f1) * ((u - 0.4) / 0.6) ** 1.4;
      const fr = Math.min(sr * 0.45, shape * (1 + (c.warble ? 0.06 * sinc((c.warble * i) / sr) : 0)));
      ph += fr / sr;
      const env = Math.sin(Math.PI * u) ** 0.6 * (c.warble ? 0.6 + 0.4 * Math.abs(sinc((c.warble * i) / sr)) : 1);
      out[start + i]! += c.amp * env * (sinc(ph) + 0.18 * sinc(2 * ph) + 0.06 * sinc(3 * ph));
    }
  }
  return out;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const oneShot = (fn: (sr: number) => Float32Array, level = 1, tail = 0.02): PatchDef => ({
  roots: [60],
  layers: 1,
  hiFi: true,
  level,
  render: (_root, _layer, sr) => {
    const o = fn(sr);
    fadeTail(o, sr, tail);
    normalize(o, 0.85);
    return [o];
  },
});

export const WORLD_PATCHES: Record<WorldSamplePatch, PatchDef> = {
  xylophone: { roots: range(60, 105, 3), layers: 1, hiFi: true, render: (r, _l, sr) => renderXylophone(r, sr) },
  'spring-snare': { ...oneShot(renderSpringSnare, 1.1, 0.25), rate: 32000, hiFi: false },
  gavel: oneShot(renderGavel, 0.9),
  'jungle-bird': { ...oneShot(renderJungleBird, 0.7, 0.05), rate: 32000, hiFi: false },
};

export const WORLD_SYNTHS: Record<WorldSynthPatch, SynthDef> = {
  // A theremin: nearly a pure sine, with the player's wide, slow vibrato. Glide between notes.
  theremin: {
    oscs: [
      { wave: 'sine', gain: 1 },
      { wave: 'triangle', octave: 1, gain: 0.05 },
      { wave: 'sine', octave: 1, gain: 0.12 },
    ],
    amp: { a: 0.14, d: 0.4, s: 0.92, r: 0.4 },
    vibrato: { rate: 5.4, depth: 34, delay: 0.12 },
    gain: 0.95,
  },
  // A cinema organ: tibia flutes (8' + 4') over a soft string rank, with a deep tremulant.
  'theatre-organ': {
    oscs: [
      { wave: 'flute', gain: 0.8 },
      { wave: 'sine', octave: 1, gain: 0.32 },
      { wave: 'organ', detune: 4, gain: 0.22 },
      { wave: 'sine', octave: -1, gain: 0.3 },
    ],
    filter: { type: 'lowpass', freq: 3200, q: 0.6, keyTrack: 0.3 },
    amp: { a: 0.05, d: 0.3, s: 1, r: 0.35 },
    vibrato: { rate: 6.6, depth: 15 },
    gain: 0.5,
  },
  // A chapel's principal stops: steady (no tremulant), a slow speech and a little chiff.
  'pipe-organ': {
    oscs: [
      { wave: 'organ', gain: 0.6 },
      { wave: 'flute', gain: 0.5 },
      { wave: 'sine', octave: -1, gain: 0.35 },
    ],
    filter: { type: 'lowpass', freq: 2400, q: 0.5, keyTrack: 0.35 },
    amp: { a: 0.09, d: 0.4, s: 1, r: 0.45 },
    breath: 0.02,
    gain: 0.5,
  },
  // Cellos and basses as a section: soft saws, slow bow, a little vibrato.
  'low-strings': {
    oscs: [
      { wave: 'sawtooth', detune: -7, gain: 0.5 },
      { wave: 'sawtooth', detune: 6, gain: 0.5 },
      { wave: 'triangle', gain: 0.3 },
    ],
    filter: { type: 'lowpass', freq: 900, q: 0.6, keyTrack: 0.5 },
    amp: { a: 0.28, d: 0.8, s: 0.9, r: 0.6 },
    vibrato: { rate: 5, depth: 8, delay: 0.35 },
    gain: 0.5,
  },
  // Cup-muted trumpets and trombones: short bright stabs that close down fast.
  'muted-brass': {
    oscs: [
      { wave: 'sawtooth', detune: -5, gain: 0.5 },
      { wave: 'horn', detune: 5, gain: 0.5 },
    ],
    filter: { type: 'bandpass', freq: 1100, q: 0.9, keyTrack: 0.5, env: { amount: 1.6, a: 0.015, d: 0.12, s: 0.35 } },
    amp: { a: 0.012, d: 0.16, s: 0.55, r: 0.09 },
    scoop: -30,
    gain: 0.9,
  },
  // A vocal group singing "pa": a quick bright vowel that settles.
  'pa-voice': {
    oscs: [
      { wave: 'vowel', detune: -9, gain: 0.5 },
      { wave: 'vowel', detune: 8, gain: 0.5 },
      { wave: 'sine', gain: 0.25 },
    ],
    filter: { type: 'lowpass', freq: 1800, q: 0.8, keyTrack: 0.4, env: { amount: 1.2, a: 0.01, d: 0.1, s: 0.4 } },
    amp: { a: 0.012, d: 0.14, s: 0.6, r: 0.12 },
    vibrato: { rate: 5.5, depth: 10, delay: 0.25 },
    scoop: -45,
    gain: 0.8,
  },
  // Somebody whistling: a breathy sine that scoops up into each note.
  whistle: {
    oscs: [
      { wave: 'sine', gain: 1 },
      { wave: 'sine', octave: 1, gain: 0.04 },
    ],
    amp: { a: 0.03, d: 0.2, s: 0.85, r: 0.12 },
    vibrato: { rate: 5.8, depth: 16, delay: 0.22 },
    breath: 0.035,
    scoop: -55,
    gain: 0.8,
  },
};

// Instruments for the v3 genre recipes (music-genres workstream): guitars with their
// amps baked in (chorus, spring reverb, fuzz into a long room), an FM electric piano, a
// slap bass, a bowed fiddle, a piano in a big room, folk and breakbeat percussion, and a
// few sound effects (a purring cat, a desk being cleared, birds). Like everything in
// dsp/, each zone is synthesized once into a buffer on demand: no samples, no network.
//
// Self-contained on purpose (imports only core/theory) so patches.ts and synths.ts can
// spread these registries in without an import cycle.

import { midiToFreq } from '../theory';
import { addPartials, Biquad, dcBlock, fadeHead, fadeTail, Noise, normalize, OnePole, saturate, sinc, type Partial } from './core';
import type { PatchDef } from './patches';
import type { SynthDef } from './synths';

export type GenreSamplePatch =
  | 'dx-ep'
  | 'slap-bass'
  | 'chorus-guitar'
  | 'surf-guitar'
  | 'folk-guitar'
  | 'fuzz-guitar'
  | 'bowed-fiddle'
  | 'hall-piano'
  | 'stomp'
  | 'frame-drum'
  | 'snare-rock'
  | 'snare-dnb'
  | 'kick-dnb'
  | 'jingle-tamb'
  | 'brush-stir'
  | 'purr'
  | 'clatter'
  | 'birdsong';

export type GenreSynthPatch = 'reese' | 'sub-sine' | 'fuzz-wall' | 'crew' | 'lead-guitar';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let n = lo; n <= hi; n += step) out.push(n);
  return out;
};

function seedFor(root: number, layer: number, salt: number): number {
  return (Math.imul(root + 1, 2654435761) ^ Math.imul(layer + 7, 40503) ^ salt) >>> 0;
}

function finishMono(buf: Float32Array, sr: number, level = 0.8): Float32Array[] {
  dcBlock(buf, sr, 18);
  fadeHead(buf, sr, 0.001);
  fadeTail(buf, sr, 0.06);
  normalize(buf, level);
  return [buf];
}

function finishStereo(chans: Float32Array[], sr: number, level = 0.8): Float32Array[] {
  for (const c of chans) {
    dcBlock(c, sr, 18);
    fadeHead(c, sr, 0.001);
    fadeTail(c, sr, 0.08);
  }
  normalize(chans, level);
  return chans;
}

// ── Building blocks ───────────────────────────────────────────────────────────

/**
 * Karplus–Strong string with a weighted two-tap loss filter (`s` = 0.5 is the classic
 * average; lower is brighter and rings longer up top) and fractional-delay tuning.
 */
function ksString(
  out: Float32Array,
  sr: number,
  f: number,
  o: { t60: number; seed: number; excite: (n: Noise, i: number, len: number) => number; position?: number; gain?: number; s?: number },
): void {
  const s = o.s ?? 0.5;
  const total = sr / f;
  const N = Math.max(2, Math.floor(total - s - 0.2));
  const d = total - s - N;
  const C = (1 - d) / (1 + d);
  const line = new Float32Array(N);
  const noise = new Noise(o.seed);
  for (let i = 0; i < N; i++) line[i] = o.excite(noise, i, N);
  if (o.position) {
    const p = Math.max(1, Math.round(N * o.position));
    const copy = line.slice();
    for (let i = 0; i < N; i++) line[i] = copy[i]! - copy[(i - p + N) % N]! * 0.9;
  }
  const g = 10 ** (-3 / (o.t60 * f));
  const gain = o.gain ?? 1;
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < out.length; i++) {
    const read = line[idx]!;
    const lp = (1 - s) * read + s * prev;
    prev = read;
    const ap = C * lp + apX - C * apY;
    apX = lp;
    apY = ap;
    line[idx] = ap * g;
    out[i]! += read * gain;
    idx++;
    if (idx === N) idx = 0;
  }
}

/** Stereo chorus: two modulated delay taps in opposite phase over the dry signal. */
function chorus(x: Float32Array, sr: number, depthMs: number, rate: number, wet = 0.55): Float32Array[] {
  const base = 0.011 * sr;
  const depth = (depthMs / 1000) * sr;
  return [0, 1].map((ch) => {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const d = base + depth * (0.5 + 0.5 * sinc((rate * i) / sr + ch * 0.5 + 0.13));
      const pos = i - d;
      const j = Math.floor(pos);
      const fr = pos - j;
      const a = j >= 0 ? x[j]! : 0;
      const b = j + 1 >= 0 ? x[j + 1]! : 0;
      out[i] = x[i]! * 0.75 + (a + (b - a) * fr) * wet;
    }
    return out;
  });
}

/**
 * Spring reverb: delay loops whose round trip runs through a long chain of first-order
 * all-passes. The dispersion smears each echo into a falling chirp: the "drip".
 */
function spring(x: Float32Array, sr: number, opts: { delays: number[]; feedback: number; stages: number; coef: number; tone: number }): Float32Array {
  const wet = new Float32Array(x.length);
  for (const [k, delay] of opts.delays.entries()) {
    const L = Math.max(8, Math.floor(delay * sr));
    const line = new Float32Array(L);
    const apX = new Float32Array(opts.stages);
    const apY = new Float32Array(opts.stages);
    const a = opts.coef + k * 0.03;
    const lp = new OnePole(sr, opts.tone);
    let idx = 0;
    for (let i = 0; i < x.length; i++) {
      let s = line[idx]!;
      for (let st = 0; st < opts.stages; st++) {
        const y = -a * s + apX[st]! + a * apY[st]!;
        apX[st] = s;
        apY[st] = y;
        s = y;
      }
      s = lp.tick(s);
      line[idx] = x[i]! + opts.feedback * s;
      wet[i]! += s * (k % 2 ? -1 : 1);
      idx++;
      if (idx === L) idx = 0;
    }
  }
  const hp = new Biquad(sr, 'highpass', 320, 0.7);
  const hump = new Biquad(sr, 'peaking', 2200, 1.2, 4);
  for (let i = 0; i < wet.length; i++) wet[i] = hump.tick(hp.tick(wet[i]!));
  return wet;
}

/**
 * A small feedback-delay-network room: two input diffusers into eight damped delay lines
 * mixed by a Householder matrix. Returns the wet signal per output channel.
 */
function fdn(x: Float32Array, sr: number, rt60: number, opts: { channels: 1 | 2; damp?: number; predelay?: number; size?: number }): Float32Array[] {
  const size = opts.size ?? 1;
  const lens = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.9, 73.1].map((ms) => Math.floor((ms / 1000) * sr * size));
  const lines = lens.map((l) => new Float32Array(l));
  const idx = lens.map(() => 0);
  const gains = lens.map((l) => 10 ** ((-3 * l) / (rt60 * sr)));
  const lps = lens.map(() => new OnePole(sr, opts.damp ?? 5200));
  const pre = Math.floor((opts.predelay ?? 0.018) * sr);
  // Input diffusion: two Schroeder all-passes.
  const ap = [Math.floor(0.0047 * sr), Math.floor(0.0113 * sr)].map((l) => ({ buf: new Float32Array(l), i: 0 }));
  const outs = Array.from({ length: opts.channels }, () => new Float32Array(x.length));
  const v = new Float32Array(8);
  for (let n = 0; n < x.length; n++) {
    let s = n >= pre ? x[n - pre]! : 0;
    for (const a of ap) {
      const d = a.buf[a.i]!;
      const y = -0.6 * s + d;
      a.buf[a.i] = s + 0.6 * y;
      a.i = (a.i + 1) % a.buf.length;
      s = y;
    }
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      v[k] = lps[k]!.tick(lines[k]![idx[k]!]!) * gains[k]!;
      sum += v[k]!;
    }
    const h = sum * 0.25; // Householder: v − (2/N)·Σv
    let l = 0;
    let r = 0;
    for (let k = 0; k < 8; k++) {
      const o = v[k]!;
      if (k % 2) r += o;
      else l += o;
      lines[k]![idx[k]!] = o - h + s * 0.35;
      idx[k] = (idx[k]! + 1) % lens[k]!;
    }
    if (opts.channels === 2) {
      outs[0]![n] = l * 0.5;
      outs[1]![n] = r * 0.5;
    } else outs[0]![n] = (l + r) * 0.35;
  }
  return outs;
}

/** Polynomial band-limited step correction for a sawtooth. */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const u = t / dt;
    return u + u - u * u - 1;
  }
  if (t > 1 - dt) {
    const u = (t - 1) / dt;
    return u * u + u + u + 1;
  }
  return 0;
}

function sweepSine(out: Float32Array, sr: number, f0: number, f1: number, pitchTau: number, ampTau: number, amp = 1, attack = 0.001, start = 0): void {
  let ph = 0;
  const end = Math.min(out.length, start + Math.ceil(ampTau * 9 * sr));
  for (let i = start; i < end; i++) {
    const t = (i - start) / sr;
    ph += (f1 + (f0 - f1) * Math.exp(-t / pitchTau)) / sr;
    out[i]! += amp * sinc(ph) * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

function noiseBurst(out: Float32Array, sr: number, seed: number, amp: number, ampTau: number, filters: Biquad[], attack = 0.0005, start = 0): void {
  const noise = new Noise(seed);
  const end = Math.min(out.length, start + Math.ceil(ampTau * 9 * sr) + Math.ceil(attack * sr));
  for (let i = start; i < end; i++) {
    const t = (i - start) / sr;
    let x = noise.next();
    for (const f of filters) x = f.tick(x);
    out[i]! += x * amp * (t < attack ? t / attack : 1) * Math.exp(-t / ampTau);
  }
}

// ── Keys ──────────────────────────────────────────────────────────────────────

/** Mid-80s FM electric piano: a warm FM body plus a bright ratio-14 tine, chorused. */
function renderDxEp(midi: number, hard: boolean, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const dur = clamp(5 - (midi - 48) * 0.05, 2, 5);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const tauLong = clamp(3.2 - (midi - 48) * 0.045, 0.8, 3.2);
  const tauFast = tauLong * 0.18;
  const ratio = f * 14 < sr * 0.42 ? 14 : Math.max(3, Math.floor((sr * 0.42) / f));
  const i1Peak = hard ? 1.45 : 0.8;
  const i2Peak = hard ? 1.9 : 1.05;
  const tineAmp = hard ? 0.42 : 0.24;
  const dL = Math.exp(-1 / (tauLong * sr));
  const dF = Math.exp(-1 / (tauFast * sr));
  const dI1 = Math.exp(-1 / (0.45 * sr));
  const dI2 = Math.exp(-1 / (0.035 * sr));
  const dT = Math.exp(-1 / (0.22 * sr));
  let eL = 0.72;
  let eF = 0.28;
  let i1 = i1Peak;
  let i2 = i2Peak;
  let eT = tineAmp;
  const atk = Math.floor(0.0012 * sr);
  const df = f / sr;
  const df2 = (f * 1.0011) / sr;
  let ph = 0;
  let ph2 = 0.17;
  for (let i = 0; i < n; i++) {
    const a = i < atk ? i / atk : 1;
    const body = sinc(ph + (i1 + 0.22) * sinc(ph) * 0.16);
    const tine = eT > 1e-5 ? eT * sinc(ph2 + i2 * sinc(ph2 * ratio) * 0.16) : 0;
    out[i] = a * ((eL + eF) * body + tine);
    ph += df;
    ph2 += df2;
    if (ph > 1) ph -= 1;
    if (ph2 > 1) ph2 -= 1;
    eL *= dL;
    eF *= dF;
    i1 *= dI1;
    i2 *= dI2;
    eT *= dT;
  }
  const chans = chorus(out, sr, 2.4, 0.75, 0.6);
  return finishStereo(chans, sr, 0.8);
}

/** A piano in a big empty room: additive strings, a hammer, and the room baked in. */
function renderHallPiano(midi: number, hard: boolean, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const dur = clamp(9 - (midi - 36) * 0.05, 5, 9);
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const B = 0.00007 * 2 ** ((midi - 60) / 18);
  const tau1 = clamp(5.5 - (midi - 40) * 0.07, 0.9, 5.5);
  const tilt = hard ? 0.16 : 0.3;
  const partials: Partial[] = [];
  for (let h = 1; h <= 16; h++) {
    const fh = h * f * Math.sqrt(1 + B * h * h);
    if (fh > 6500) break;
    const amp = (1 / h ** 1.05) * Math.exp(-(h - 1) * tilt);
    const tau = tau1 / (1 + 0.5 * (h - 1)) ** 0.85;
    partials.push({ freq: fh, amp: amp * 0.6, tau: tau * 0.3, attack: 0.003 });
    if (h <= 8) partials.push({ freq: fh * 1.0006, amp: amp * 0.4, tau: tau * 1.5, attack: 0.003, phase: 0.11 * h });
  }
  addPartials(out, sr, partials);
  const noise = new Noise(seedFor(midi, hard ? 1 : 0, 211));
  const lp = new OnePole(sr, 900);
  const thumpLen = Math.floor(0.014 * sr);
  for (let i = 0; i < thumpLen; i++) out[i]! += lp.tick(noise.next()) * (hard ? 0.12 : 0.07) * (1 - i / thumpLen);
  // The room: a long, dark tail with a little pre-delay.
  const [wet] = fdn(out, sr, 4.2, { channels: 1, damp: 3200, predelay: 0.03, size: 1.6 });
  for (let i = 0; i < n; i++) out[i] = out[i]! * 0.8 + wet![i]! * 0.55;
  return finishMono(out, sr, 0.8);
}

// ── Basses ────────────────────────────────────────────────────────────────────

/** Slap bass: layer 0 is the thumb, layer 1 the popped string. */
function renderSlap(midi: number, pop: boolean, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(2.4 * sr);
  const out = new Float32Array(n);
  const partials: Partial[] = [];
  for (let h = 1; h <= 28; h++) {
    const fh = h * f * Math.sqrt(1 + 0.00025 * h * h);
    if (fh > sr * 0.44) break;
    const amp = (1 / h ** (pop ? 0.75 : 0.95)) * (h === 1 ? 1.2 : 1);
    const tau = (pop ? 0.9 : 1.25) / (1 + (pop ? 0.28 : 0.42) * (h - 1));
    partials.push({ freq: fh, amp: amp * 0.5, tau, attack: 0.0008 });
  }
  addPartials(out, sr, partials);
  // The string slapping the frets.
  noiseBurst(out, sr, seedFor(midi, pop ? 1 : 0, 41), pop ? 0.55 : 0.4, pop ? 0.004 : 0.007, [new Biquad(sr, pop ? 'highpass' : 'bandpass', pop ? 2400 : 1800, 0.8)]);
  if (pop) addPartials(out, sr, [{ freq: 3100, amp: 0.12, tau: 0.012, attack: 0.0003 }]);
  saturate(out, 0.35);
  return finishMono(out, sr, 0.8);
}

// ── Guitars ───────────────────────────────────────────────────────────────────

/** Clean single-coil electric through a chorus pedal (city pop, soft rock, clean verses). */
function renderChorusGuitar(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(4 - (midi - 52) * 0.04, 1.6, 4) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 4200);
  ksString(out, sr, f, { t60: clamp(3.4 - (midi - 52) * 0.04, 1.2, 3.4), seed: seedFor(midi, 0, 51), position: 0.14, s: 0.38, excite: (no) => lp.tick(no.next()) });
  const hp = new Biquad(sr, 'highpass', 140, 0.7);
  const pickup = new Biquad(sr, 'peaking', 2800, 1, 4);
  const top = new Biquad(sr, 'lowpass', 6000, 0.7);
  for (let i = 0; i < n; i++) out[i] = top.tick(pickup.tick(hp.tick(out[i]!)));
  saturate(out, 0.12);
  return finishStereo(chorus(out, sr, 2.2, 0.85, 0.55), sr, 0.8);
}

/** Bridge pickup into a reverb amp: bright, twangy, and dripping with spring. */
function renderSurfGuitar(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(3.4 * sr);
  const dry = new Float32Array(n);
  const lp = new OnePole(sr, 6500);
  ksString(dry, sr, f, { t60: clamp(2.6 - (midi - 52) * 0.03, 0.9, 2.6), seed: seedFor(midi, 0, 61), position: 0.09, s: 0.3, excite: (no) => lp.tick(no.next()) });
  const hp = new Biquad(sr, 'highpass', 110, 0.7);
  const twang = new Biquad(sr, 'peaking', 2400, 0.9, 6);
  const top = new Biquad(sr, 'lowpass', 5600, 0.7);
  for (let i = 0; i < n; i++) dry[i] = top.tick(twang.tick(hp.tick(dry[i]!)));
  normalize(dry, 0.5);
  saturate(dry, 0.3);
  const wet = spring(dry, sr, { delays: [0.0331, 0.0413], feedback: 0.72, stages: 36, coef: 0.62, tone: 4200 });
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dry[i]! + wet[i]! * 0.42;
  return finishMono(out, sr, 0.8);
}

/** Steel-string acoustic: bright pick, wooden body. */
function renderFolkGuitar(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(clamp(4.5 - (midi - 40) * 0.05, 1.6, 4.5) * sr);
  const out = new Float32Array(n);
  const lp = new OnePole(sr, 3800);
  ksString(out, sr, f, { t60: clamp(4.6 - (midi - 40) * 0.05, 1.6, 4.6), seed: seedFor(midi, 0, 71), position: 0.2, s: 0.42, excite: (no) => lp.tick(no.next()) });
  ksString(out, sr, f * 1.0016, { t60: clamp(4 - (midi - 40) * 0.05, 1.4, 4), seed: seedFor(midi, 1, 71), position: 0.23, s: 0.45, gain: 0.35, excite: (no) => lp.tick(no.next()) });
  const body1 = new Biquad(sr, 'peaking', 105, 1.2, 5);
  const body2 = new Biquad(sr, 'peaking', 230, 1.4, 3);
  const air = new Biquad(sr, 'peaking', 2600, 0.8, 2.5);
  const top = new Biquad(sr, 'lowpass', 7500, 0.6);
  for (let i = 0; i < n; i++) out[i] = top.tick(air.tick(body2.tick(body1.tick(out[i]!))));
  return finishMono(out, sr, 0.8);
}

/** Fuzz guitar into a long, dark room: strums and, played backwards, reverse swells. */
function renderFuzzGuitar(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(5.5 * sr);
  const dry = new Float32Array(n);
  const lp = new OnePole(sr, 3000);
  ksString(dry, sr, f, { t60: 6, seed: seedFor(midi, 0, 81), position: 0.16, s: 0.45, excite: (no) => lp.tick(no.next()) });
  ksString(dry, sr, f * 1.003, { t60: 5, seed: seedFor(midi, 1, 81), position: 0.13, s: 0.45, gain: 0.6, excite: (no) => lp.tick(no.next()) });
  normalize(dry, 1);
  const k = 7;
  const norm = 1 / Math.tanh(k);
  const hp = new Biquad(sr, 'highpass', 90, 0.7);
  const cab = new Biquad(sr, 'lowpass', 3000, 0.8);
  const cab2 = new Biquad(sr, 'lowpass', 4200, 0.6);
  for (let i = 0; i < n; i++) dry[i] = cab2.tick(cab.tick(hp.tick(Math.tanh(k * dry[i]!) * norm)));
  // The fuzz holds the note up; let it sag away over the sample.
  const sag = Math.exp(-1 / (2.6 * sr));
  let e = 1;
  for (let i = 0; i < n; i++) {
    dry[i]! *= e;
    e *= sag;
  }
  // Mono (the two guitars are panned apart): half the memory and playback cost.
  const [wet] = fdn(dry, sr, 4.5, { channels: 1, damp: 3800, predelay: 0.02, size: 1.3 });
  for (let i = 0; i < n; i++) dry[i] = dry[i]! * 0.55 + wet![i]! * 1.3;
  return finishMono(dry, sr, 0.8);
}

// ── Strings ───────────────────────────────────────────────────────────────────

/** A bowed fiddle: band-limited saw (Helmholtz motion), bow noise, body, vibrato. */
function renderFiddle(midi: number, sr: number): Float32Array[] {
  const f = midiToFreq(midi);
  const n = Math.floor(3.6 * sr);
  const out = new Float32Array(n);
  const noise = new Noise(seedFor(midi, 0, 91));
  const bowBp = new Biquad(sr, 'bandpass', Math.min(sr * 0.4, 3200), 0.9);
  let ph = 0.3;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vibDepth = clamp((t - 0.16) / 0.3, 0, 1) * 0.0085;
    const fi = f * (1 + vibDepth * sinc(5.7 * t) + 0.002 * Math.exp(-t / 0.05));
    const dt = fi / sr;
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - polyBlep(ph, dt);
    const atk = t < 0.07 ? (t / 0.07) ** 1.5 : 1;
    const swell = 0.88 + 0.12 * Math.sin(Math.min(1, t / 1.6) * Math.PI * 0.5);
    const scratch = Math.exp(-t / 0.035) * 0.35 + 0.035;
    out[i] = (saw * atk * swell + bowBp.tick(noise.next()) * scratch) * Math.exp(-t / 9);
  }
  const hp = new Biquad(sr, 'highpass', 190, 0.7);
  const wood = new Biquad(sr, 'peaking', 290, 1.6, 6);
  const air = new Biquad(sr, 'peaking', 470, 2.2, 3);
  const nasal = new Biquad(sr, 'peaking', 1300, 1.2, -4);
  const bridge = new Biquad(sr, 'peaking', 2900, 1, 6);
  const top = new Biquad(sr, 'lowpass', 6500, 0.7);
  for (let i = 0; i < n; i++) out[i] = top.tick(bridge.tick(nasal.tick(air.tick(wood.tick(hp.tick(out[i]!))))));
  return finishMono(out, sr, 0.8);
}

// ── Percussion ────────────────────────────────────────────────────────────────

type OneShotRenderer = (sr: number) => Float32Array;

const len = (sr: number, s: number) => new Float32Array(Math.floor(sr * s));

const ONE_SHOTS: Record<string, OneShotRenderer> = {
  stomp: (sr) => {
    const o = len(sr, 0.5);
    sweepSine(o, sr, 140, 52, 0.02, 0.11, 1, 0.002);
    noiseBurst(o, sr, 101, 0.55, 0.03, [new Biquad(sr, 'bandpass', 380, 1.1)], 0.002);
    noiseBurst(o, sr, 102, 0.25, 0.006, [new Biquad(sr, 'bandpass', 1900, 1.2)]);
    saturate(o, 0.3);
    return o;
  },
  'frame-drum': (sr) => {
    const o = len(sr, 0.8);
    sweepSine(o, sr, 135, 92, 0.03, 0.28, 1, 0.002);
    sweepSine(o, sr, 150, 148, 0.01, 0.09, 0.3, 0.002);
    noiseBurst(o, sr, 103, 0.3, 0.018, [new Biquad(sr, 'lowpass', 1400, 0.7)], 0.001);
    saturate(o, 0.2);
    return o;
  },
  'snare-rock': (sr) => {
    const o = len(sr, 0.6);
    sweepSine(o, sr, 245, 185, 0.015, 0.09, 0.8);
    sweepSine(o, sr, 345, 332, 0.01, 0.05, 0.28);
    noiseBurst(o, sr, 104, 0.75, 0.16, [new Biquad(sr, 'bandpass', 3200, 0.5), new Biquad(sr, 'highpass', 900, 0.7)]);
    saturate(o, 0.35);
    return o;
  },
  'snare-dnb': (sr) => {
    const o = len(sr, 0.45);
    sweepSine(o, sr, 270, 205, 0.01, 0.06, 0.9, 0.0004);
    noiseBurst(o, sr, 105, 0.85, 0.095, [new Biquad(sr, 'highpass', 1700, 0.7), new Biquad(sr, 'peaking', 6000, 1, 5)]);
    noiseBurst(o, sr, 106, 0.5, 0.0025, [new Biquad(sr, 'highpass', 3000, 0.7)]);
    saturate(o, 0.6);
    return o;
  },
  'kick-dnb': (sr) => {
    const o = len(sr, 0.42);
    sweepSine(o, sr, 210, 52, 0.022, 0.15, 1, 0.0004);
    noiseBurst(o, sr, 107, 0.4, 0.002, [new Biquad(sr, 'highpass', 2500, 0.7)]);
    saturate(o, 0.55);
    return o;
  },
  'jingle-tamb': (sr) => {
    const o = len(sr, 0.45);
    const jingles = [5300, 6650, 7900, 9350, 10800, 12100];
    for (let hit = 0; hit < 4; hit++) {
      const start = Math.floor(hit * 0.0045 * sr);
      addPartials(
        o,
        sr,
        jingles.filter((fr) => fr < sr * 0.45).map((fr, k) => ({ freq: fr * (1 + hit * 0.004), amp: 0.22 / (1 + hit * 0.6), tau: 0.05 + 0.012 * k, attack: 0.0002 })),
        start,
      );
    }
    noiseBurst(o, sr, 108, 0.35, 0.06, [new Biquad(sr, 'highpass', Math.min(sr * 0.4, 6000), 0.7)], 0.001);
    return o;
  },
  'brush-stir': (sr) => {
    const o = len(sr, 1.2);
    const noise = new Noise(109);
    const bp = new Biquad(sr, 'bandpass', 3000, 0.7);
    for (let i = 0; i < o.length; i++) {
      const t = i / sr;
      if ((i & 31) === 0) bp.set('bandpass', 2600 + 2200 * Math.sin(Math.PI * (t / 1.2)), 0.7);
      o[i] = bp.tick(noise.next()) * Math.sin(Math.PI * (t / 1.2)) ** 1.2 * 0.6;
    }
    return o;
  },
  purr: (sr) => {
    const o = len(sr, 3.6);
    const noise = new Noise(110);
    const bp = new Biquad(sr, 'bandpass', 130, 1.4);
    const bp2 = new Biquad(sr, 'bandpass', 380, 2);
    const breaths = [
      { start: 0, dur: 1.75, rate: 25, tone: 1 },
      { start: 1.8, dur: 1.55, rate: 21.5, tone: 0.7 },
    ];
    for (const b of breaths) {
      const s0 = Math.floor(b.start * sr);
      const m = Math.floor(b.dur * sr);
      let pulse = 0;
      for (let i = 0; i < m && s0 + i < o.length; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * (t / b.dur)) ** 0.6;
        const ph = (t * b.rate) % 1;
        pulse = ph < 0.35 ? Math.sin((Math.PI * ph) / 0.35) : 0;
        const x = noise.next();
        o[s0 + i] = (bp.tick(x) * 1.6 + bp2.tick(x) * 0.5 * b.tone) * pulse * env;
      }
    }
    return o;
  },
  clatter: (sr) => {
    const o = len(sr, 1.7);
    const noise = new Noise(111);
    // A mug, a pen, something small: a few bounces, then the pen rolls away.
    const hits: [number, number, number][] = [
      [0, 1, 1180],
      [0.012, 0.7, 2650],
      [0.14, 0.55, 1240],
      [0.23, 0.35, 1320],
      [0.29, 0.22, 1290],
    ];
    for (const [at, amp, base] of hits) {
      const start = Math.floor(at * sr);
      addPartials(o, sr, [
        { freq: base, amp: amp * 0.5, tau: 0.09, attack: 0.0002 },
        { freq: base * 2.43, amp: amp * 0.3, tau: 0.05, attack: 0.0002 },
        { freq: base * 3.87, amp: amp * 0.2, tau: 0.03, attack: 0.0002 },
      ], start);
      noiseBurst(o, sr, 112 + start, amp * 0.5, 0.003, [new Biquad(sr, 'highpass', 1500, 0.7)], 0.0002, start);
    }
    let t = 0.42;
    let gap = 0.06;
    while (t < 1.4) {
      const start = Math.floor(t * sr);
      addPartials(o, sr, [{ freq: 3400 + noise.unit() * 900, amp: 0.08 * (1.5 - t), tau: 0.008, attack: 0.0002 }], start);
      t += gap;
      gap = Math.max(0.018, gap * 0.9);
    }
    return o;
  },
  birdsong: (sr) => {
    const o = len(sr, 0.95);
    const syllables: { at: number; dur: number; f0: number; f1: number; trill: number }[] = [
      { at: 0, dur: 0.07, f0: 3100, f1: 4300, trill: 0 },
      { at: 0.12, dur: 0.09, f0: 4500, f1: 3000, trill: 38 },
      { at: 0.27, dur: 0.06, f0: 3300, f1: 4100, trill: 0 },
      { at: 0.38, dur: 0.16, f0: 3700, f1: 3500, trill: 24 },
    ];
    for (const s of syllables) {
      const start = Math.floor(s.at * sr);
      const m = Math.floor(s.dur * sr);
      let ph = 0;
      for (let i = 0; i < m && start + i < o.length; i++) {
        const u = i / m;
        const fr = Math.min(sr * 0.45, s.f0 + (s.f1 - s.f0) * u + (s.trill ? 300 * sinc((s.trill * i) / sr) : 0));
        ph += fr / sr;
        o[start + i]! += sinc(ph) * Math.sin(Math.PI * u) ** 0.7 * 0.5;
      }
    }
    return o;
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

const oneShot = (fn: OneShotRenderer, level = 1): PatchDef => ({
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

export const GENRE_PATCHES: Record<GenreSamplePatch, PatchDef> = {
  'dx-ep': { roots: range(36, 96, 3), layers: 2, rate: 32000, channels: 2, render: (r, l, sr) => renderDxEp(r, l === 1, sr) },
  'hall-piano': { roots: range(24, 102, 3), layers: 2, rate: 24000, render: (r, l, sr) => renderHallPiano(r, l === 1, sr) },
  'slap-bass': { roots: range(24, 60, 3), layers: 2, rate: 32000, level: 0.7, render: (r, l, sr) => renderSlap(r, l === 1, sr) },
  'chorus-guitar': { roots: range(40, 88, 3), layers: 1, rate: 32000, channels: 2, render: (r, _l, sr) => renderChorusGuitar(r, sr) },
  'surf-guitar': { roots: range(40, 88, 3), layers: 1, rate: 32000, render: (r, _l, sr) => renderSurfGuitar(r, sr) },
  'folk-guitar': { roots: range(40, 84, 3), layers: 1, rate: 32000, render: (r, _l, sr) => renderFolkGuitar(r, sr) },
  'fuzz-guitar': { roots: range(40, 84, 3), layers: 1, rate: 22050, render: (r, _l, sr) => renderFuzzGuitar(r, sr) },
  'bowed-fiddle': { roots: range(55, 94, 3), layers: 1, rate: 32000, render: (r, _l, sr) => renderFiddle(r, sr) },
  stomp: oneShot(ONE_SHOTS.stomp!, 0.8),
  'frame-drum': oneShot(ONE_SHOTS['frame-drum']!, 0.75),
  'snare-rock': oneShot(ONE_SHOTS['snare-rock']!, 0.8),
  'snare-dnb': oneShot(ONE_SHOTS['snare-dnb']!, 0.8),
  'kick-dnb': oneShot(ONE_SHOTS['kick-dnb']!, 0.75),
  'jingle-tamb': oneShot(ONE_SHOTS['jingle-tamb']!, 1.6),
  'brush-stir': oneShot(ONE_SHOTS['brush-stir']!, 1),
  purr: oneShot(ONE_SHOTS.purr!, 1),
  clatter: oneShot(ONE_SHOTS.clatter!, 1),
  birdsong: oneShot(ONE_SHOTS.birdsong!, 0.8),
};

export const GENRE_SYNTHS: Record<GenreSynthPatch, SynthDef> = {
  // Two saws a third of a semitone apart, low-passed: the drum-and-bass growl.
  reese: {
    oscs: [
      { wave: 'sawtooth', detune: -16, gain: 0.55 },
      { wave: 'sawtooth', detune: 15, gain: 0.55 },
    ],
    filter: { type: 'lowpass', freq: 620, q: 1.3, keyTrack: 0.25 },
    amp: { a: 0.008, d: 0.3, s: 0.9, r: 0.12 },
    gain: 1.05,
  },
  'sub-sine': {
    oscs: [
      { wave: 'sine', gain: 1 },
      { wave: 'triangle', gain: 0.1 },
    ],
    amp: { a: 0.004, d: 0.15, s: 1, r: 0.06 },
    gain: 0.95,
  },
  // A wall of detuned, low-passed saws with a slow whammy-bar wobble.
  'fuzz-wall': {
    oscs: [
      { wave: 'sawtooth', detune: -13, gain: 0.5 },
      { wave: 'sawtooth', detune: 12, gain: 0.5 },
      { wave: 'square', octave: -1, gain: 0.22 },
    ],
    filter: { type: 'lowpass', freq: 1900, q: 0.7, keyTrack: 0.35 },
    amp: { a: 0.3, d: 1.2, s: 0.85, r: 1.3 },
    vibrato: { rate: 0.55, depth: 22 },
    gain: 0.5,
  },
  // A ship's crew on the chorus: two slightly different "ah"s.
  crew: {
    oscs: [
      { wave: 'vowel', detune: -11, gain: 0.5 },
      { wave: 'vowel', detune: 9, gain: 0.5 },
    ],
    amp: { a: 0.06, d: 0.25, s: 0.85, r: 0.22 },
    vibrato: { rate: 5.3, depth: 15, delay: 0.12 },
    scoop: -35,
    gain: 0.62,
  },
  // An overdriven lead guitar that can bend (glides) and sing (delayed vibrato).
  'lead-guitar': {
    oscs: [
      { wave: 'sawtooth', gain: 0.7 },
      { wave: 'square', detune: 6, gain: 0.3 },
    ],
    filter: { type: 'lowpass', freq: 1500, q: 1.6, keyTrack: 0.55, env: { amount: 2.6, a: 0.002, d: 0.25, s: 0.45 } },
    amp: { a: 0.004, d: 0.8, s: 0.55, r: 0.22 },
    vibrato: { rate: 5.4, depth: 17, delay: 0.32 },
    gain: 1.1,
  },
};

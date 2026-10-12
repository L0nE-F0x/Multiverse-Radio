// DSP building blocks for rendering instrument samples in plain JS (no AudioContext),
// so timbres are synthesized once into buffers and played back cheaply.

export const TAU = Math.PI * 2;

const TABLE_BITS = 12;
const TABLE_SIZE = 1 << TABLE_BITS;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin((TAU * i) / TABLE_SIZE);

/** sin(2π·phase) via table lookup; `phase` in cycles. */
export function sinc(phase: number): number {
  const x = (phase - Math.floor(phase)) * TABLE_SIZE;
  const i = x | 0;
  const a = SINE[i]!;
  return a + (SINE[i + 1]! - a) * (x - i);
}

/** Deterministic white noise in [-1, 1). */
export class Noise {
  private s: number;
  constructor(seed = 0x2545f491) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return (this.s / 2147483648) - 1;
  }
  /** Uniform [0,1). */
  unit(): number {
    return (this.next() + 1) / 2;
  }
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'lowshelf' | 'highshelf' | 'notch';

/** RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(
    readonly sr: number,
    type: FilterType,
    freq: number,
    q = Math.SQRT1_2,
    gainDb = 0,
  ) {
    this.set(type, freq, q, gainDb);
  }

  set(type: FilterType, freq: number, q = Math.SQRT1_2, gainDb = 0): void {
    const f = Math.min(freq, this.sr * 0.49);
    const w = (TAU * f) / this.sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = sn / (2 * q);
    const A = 10 ** (gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2;
        a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2;
        a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha;
        a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cs; b2 = 1;
        a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'peaking':
        b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A;
        a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s);
        a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s;
        break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s);
        a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s;
        break;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }

  tick(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  process(buf: Float32Array): Float32Array {
    for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]!);
    return buf;
  }
}

/** One-pole low-pass. */
export class OnePole {
  private y = 0;
  private a: number;
  constructor(sr: number, freq: number) {
    this.a = Math.exp((-TAU * freq) / sr);
  }
  setFreq(sr: number, freq: number): void {
    this.a = Math.exp((-TAU * freq) / sr);
  }
  tick(x: number): number {
    this.y = x + this.a * (this.y - x);
    return this.y;
  }
}

/** Sum of exponentially decaying sine partials (modal synthesis), added into `out`. */
export interface Partial {
  /** Frequency in Hz. */
  freq: number;
  amp: number;
  /** Decay time constant (s). */
  tau: number;
  /** Attack time (s), linear ramp. */
  attack?: number;
  /** Initial phase in cycles. */
  phase?: number;
}

export function addPartials(out: Float32Array, sr: number, partials: readonly Partial[], start = 0): void {
  const nyq = sr * 0.45;
  for (const p of partials) {
    if (p.freq <= 0 || p.freq >= nyq || p.amp === 0) continue;
    const w = (TAU * p.freq) / sr;
    const c2 = 2 * Math.cos(w);
    const ph = TAU * (p.phase ?? 0);
    let y1 = Math.sin(ph - w);
    let y2 = Math.sin(ph - 2 * w);
    const decay = Math.exp(-1 / (p.tau * sr));
    let env = p.amp;
    const atk = Math.max(1, Math.floor((p.attack ?? 0.0015) * sr));
    // Stop once the partial is inaudible.
    const end = Math.min(out.length, start + Math.ceil(p.tau * sr * 9.2) + atk);
    for (let n = start; n < end; n++) {
      const y = c2 * y1 - y2;
      y2 = y1;
      y1 = y;
      const k = n - start;
      const a = k < atk ? k / atk : 1;
      out[n]! += y * env * a;
      env *= decay;
    }
  }
}

/** Short fade at the end so a buffer never ends on a non-zero sample. */
export function fadeTail(buf: Float32Array, sr: number, seconds = 0.03): Float32Array {
  const n = Math.min(buf.length, Math.floor(seconds * sr));
  for (let i = 0; i < n; i++) buf[buf.length - 1 - i]! *= i / n;
  return buf;
}

export function fadeHead(buf: Float32Array, sr: number, seconds = 0.002): Float32Array {
  const n = Math.min(buf.length, Math.max(1, Math.floor(seconds * sr)));
  for (let i = 0; i < n; i++) buf[i]! *= i / n;
  return buf;
}

export function peak(buf: Float32Array): number {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]!));
  return m;
}

export function normalize(bufs: Float32Array | Float32Array[], target = 0.9): void {
  const list = Array.isArray(bufs) ? bufs : [bufs];
  let m = 0;
  for (const b of list) m = Math.max(m, peak(b));
  if (m <= 0) return;
  const g = target / m;
  for (const b of list) for (let i = 0; i < b.length; i++) b[i]! *= g;
}

export function saturate(buf: Float32Array, drive: number): Float32Array {
  if (drive <= 0) return buf;
  const k = 1 + drive * 4;
  const norm = 1 / Math.tanh(k);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(k * buf[i]!) * norm;
  return buf;
}

/** Sample-rate reduction + quantization ("dusty sampler"). */
export function crush(buf: Float32Array, holdSamples: number, bits: number): Float32Array {
  const q = 2 ** (bits - 1);
  let held = 0;
  for (let i = 0; i < buf.length; i++) {
    if (i % holdSamples === 0) held = Math.round(buf[i]! * q) / q;
    buf[i] = held;
  }
  return buf;
}

/** Removes DC with a gentle high-pass. */
export function dcBlock(buf: Float32Array, sr: number, freq = 20): Float32Array {
  return new Biquad(sr, 'highpass', freq, 0.6).process(buf);
}

/** Crossfades the end of a buffer into its start so it loops seamlessly. Returns a shorter buffer. */
export function makeLoop(buf: Float32Array, sr: number, xfade: number): Float32Array {
  const n = Math.floor(xfade * sr);
  const len = buf.length - n;
  const out = buf.slice(0, len);
  for (let i = 0; i < n; i++) {
    const a = i / n;
    // Equal-power crossfade: the tail fades out over the head fading in.
    out[i] = out[i]! * Math.sin((a * Math.PI) / 2) + buf[len + i]! * Math.cos((a * Math.PI) / 2);
  }
  return out;
}

export function envAR(n: number, sr: number, attack: number, tau: number): number {
  const t = n / sr;
  return (t < attack ? t / attack : 1) * Math.exp(-t / tau);
}

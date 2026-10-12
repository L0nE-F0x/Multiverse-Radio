// Seeded randomness for composition. Everything musical must come from here (never
// Math.random), so the same TrackRequest yields the same notes on every machine.
// Only integer ops (Math.imul, shifts) feed decisions, which are bit-exact everywhere.

/** FNV-1a over a string, mixed with an optional numeric seed. */
export function hashString(text: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return mix32(h);
}

/** Avalanche a 32-bit integer (murmur3 finalizer). */
export function mix32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private readonly seed: number;

  constructor(seed: number) {
    // sfc32 seeded through a splitmix-style expansion.
    const s = seed >>> 0;
    this.seed = s;
    this.a = mix32(s ^ 0x9e3779b9);
    this.b = mix32(s ^ 0x243f6a88);
    this.c = mix32(s ^ 0xb7e15162);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.u32();
  }

  /** Uniform 32-bit unsigned integer. */
  u32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.u32() / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Uniform integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number {
    return lo + (this.u32() % (hi - lo + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[this.u32() % items.length]!;
  }

  /** Weighted pick: weights need not sum to 1. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of items) total += Math.max(0, w);
    let r = this.next() * total;
    for (const [item, w] of items) {
      r -= Math.max(0, w);
      if (r < 0) return item;
    }
    return items[items.length - 1]![0];
  }

  /** Approximately normal (sum of uniforms), mean 0, sd ~1. */
  gauss(): number {
    return this.next() + this.next() + this.next() + this.next() - 2;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.u32() % (i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** An independent stream derived from this one's seed and a label (order-independent). */
  fork(label: string): Rng {
    return new Rng(hashString(label, this.seed));
  }
}

/** A stream keyed by an arbitrary label, independent of any other stream's consumption. */
export function rngFor(seed: number, ...labels: (string | number)[]): Rng {
  return new Rng(hashString(labels.join('/'), seed >>> 0));
}

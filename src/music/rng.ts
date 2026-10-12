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

/** How often an artist's named choice is simply their favourite (see Rng.taste). */
const FAVOURITE = 0.7;

export class Rng {
  /**
   * Artist taste (v3, see recipes/artist.ts): while an artist's track is being composed,
   * named choices (string items in pick/weighted) go to the artist's favourite most of
   * the time, and are otherwise weighted by how much the artist likes them. Null the rest
   * of the time. Draws the same numbers either way.
   */
  static taste: ((item: string) => number) | null = null;

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
    if (Rng.taste && items.length > 1 && typeof items[0] === 'string') return this.weighted(items.map((x) => [x, 1] as const));
    return items[this.u32() % items.length]!;
  }

  /** Weighted pick: weights need not sum to 1. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const taste = Rng.taste;
    const tasted = taste !== null && items.length > 1 && items.some(([x]) => typeof x === 'string');
    const weight = (item: T, w: number) => (tasted && typeof item === 'string' ? Math.max(0, w) * taste!(item) : Math.max(0, w));
    let total = 0;
    for (const [item, w] of items) total += weight(item, w);
    let u = this.next();
    if (tasted) {
      // An artist mostly reaches for their favourite (the recipe's odds times their taste).
      if (u < FAVOURITE) {
        let best = items[0]![0];
        let bestW = -1;
        for (const [item, w] of items) {
          const x = weight(item, w);
          if (x > bestW) {
            bestW = x;
            best = item;
          }
        }
        return best;
      }
      u = (u - FAVOURITE) / (1 - FAVOURITE);
    }
    let r = u * total;
    for (const [item, w] of items) {
      r -= weight(item, w);
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

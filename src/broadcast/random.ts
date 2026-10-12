// Deterministic hashing and seeded randomness. Everything the scheduler decides flows from
// these, so the same station at the same broadcast time sounds the same on every machine.

/** FNV-1a over the joined parts. Fast, stable, good enough for seeding. */
export function hash(...parts: (string | number)[]): number {
  const text = parts.join('␟');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  // Final avalanche so nearby inputs don't give nearby outputs.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** A fresh 32-bit seed. */
  seed(): number;
}

/** mulberry32: tiny, fast, statistically fine for scheduling decisions. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    seed: () => Math.floor(next() * 4294967296) >>> 0,
  };
}

/** Picks a key with probability proportional to its weight. Returns undefined if all weights are 0. */
export function weightedPick<K>(rng: Rng, entries: [K, number][]): K | undefined {
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const [key, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll < 0) return key;
  }
  return entries[entries.length - 1]?.[0];
}

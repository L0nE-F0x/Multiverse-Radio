// Shared helpers for the v4 groove recipes (disco, space funk, warehouse techno, deep
// house): DJ-friendly forms, drum fills and rolls, risers, scale runs and bass figures.

import type { Rng } from '../rng';
import { clamp, type PlannedSection } from '../score';
import { chordPcs, pc, type Chord } from '../theory';
import { lerp, vel, type ScoreBuilder } from './common';

/** Intro/outro lengths that suit DJ-style tracks: bigger tracks get longer runways. */
export function runway(bars: number, long: number, mid: number): [intro: number, outro: number] {
  if (bars >= 64) return [long, long];
  if (bars >= 32) return [mid, mid];
  if (bars >= 16) return [Math.min(4, mid), Math.min(4, mid)];
  if (bars >= 8) return [2, 1];
  return [0, bars >= 4 ? 1 : 0];
}

/**
 * A snare (or clap) roll into `end`: eighths, then sixteenths, then thirty-seconds for the
 * last beat, swelling from `v0` to `v1`.
 */
export function roll(b: ScoreBuilder, inst: number, rng: Rng, start: number, end: number, v0: number, v1: number, pitchRise = 0): void {
  const beat = b.beat;
  let t = start;
  while (t < end - 0.01) {
    const left = end - t;
    const step = left > beat * 2 ? beat / 2 : left > beat ? beat / 4 : beat / 8;
    const u = (t - start) / Math.max(0.01, end - start);
    b.hit(inst, t, vel(rng, lerp(v0, v1, u ** 1.4), 0.03), 60 + pitchRise * u, 0.4);
    t += step;
  }
}

/** A noise riser that lands exactly on `end`, stretched (by pitch) to last `len` seconds. */
export function riser(b: ScoreBuilder, inst: number, end: number, len: number, v = 0.7): void {
  const L = clamp(len, 1.2, 9);
  const rate = 4.2 / L;
  const p = 60 + 12 * Math.log2(rate);
  b.note(inst, end - L, L, p, v);
}

/** A reversed cymbal swelling into `end`. */
export function reverseSwell(b: ScoreBuilder, inst: number, end: number, len: number, v = 0.6): void {
  const t = end - len;
  if (t > 0) b.note(inst, t, len, 60, v, { rev: true });
}

/**
 * A scale run (strings, mostly) of `count` notes from `from` up (or down) to land on
 * `target` at `end`. Notes stay in `scale`.
 */
export function scaleRun(target: number, count: number, scale: readonly number[], up = true): number[] {
  const out: number[] = [target];
  let p = target;
  while (out.length < count) {
    p += up ? -1 : 1;
    if (scale.includes(pc(p))) out.unshift(p);
  }
  return out;
}

/** The chord tone just under the octave: a seventh if the chord has one, else the fifth. */
export function underOctave(c: Chord): number {
  const iv = c.intervals.map((i) => i % 12);
  if (iv.includes(10)) return 10;
  if (iv.includes(11)) return 11;
  if (iv.includes(9)) return 9;
  return 7;
}

/** The chord's fifth (or flat fifth) above the root, in semitones. */
export function fifthOf(c: Chord): number {
  const iv = c.intervals.map((i) => i % 12);
  return iv.includes(7) ? 7 : iv.includes(6) ? 6 : iv.includes(8) ? 8 : 7;
}

/** The chord's third (or sus tone), in semitones. */
export function thirdOf(c: Chord): number {
  const iv = c.intervals.map((i) => i % 12);
  return iv.includes(3) ? 3 : iv.includes(4) ? 4 : iv.includes(5) ? 5 : 2;
}

/** A chromatic or scale approach into `next` (one below or one above). */
export function approach(rng: Rng, next: number, scale: readonly number[]): number {
  const below = scale.includes(pc(next - 1)) || rng.chance(0.6) ? next - 1 : next + 1;
  return below;
}

/** True if `pcs` (pitch classes) contains every tone of `c`. */
export function fitsScale(c: Chord, scale: readonly number[]): boolean {
  return chordPcs(c).every((p) => scale.includes(p));
}

/** The section whose bars include `bar`. */
export function sectionOf(plan: readonly PlannedSection[], bar: number): PlannedSection | undefined {
  return plan.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
}

/**
 * A form that ends on a stub (a 3-bar bridge before the outro) folds the stub into the
 * section before it instead.
 */
export function foldTail(plan: PlannedSection[], min: number): PlannedSection[] {
  let idx = plan.length - 1;
  while (idx >= 0 && plan[idx]!.part === 'outro') idx--;
  const last = plan[idx];
  const prev = plan[idx - 1];
  if (last && prev && last.bars < min && prev.part !== 'intro' && last.part !== 'intro') {
    prev.bars += last.bars;
    plan.splice(idx, 1);
  }
  return plan;
}

/** Smoothstep 0..1. */
export function smooth(u: number): number {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

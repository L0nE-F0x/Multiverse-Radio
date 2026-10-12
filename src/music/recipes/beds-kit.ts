// Shared helpers for the v3 beds, oddities and reworked recipes: forms that fit 12 s to
// 10 min, strums and arpeggios, phrase plans with proper cadences, and per-player feel.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { clamp, fitForm, planSections, type FormFit, type PlannedSection } from '../score';
import { shiftMotif, varyMotif, vel, type MotifNote, type ScoreBuilder } from './common';

/**
 * Form for a bed: an intro and an ending that scale with the length (1 bar for a 12 s
 * sting, 2 for a minute, 4 for a long bed), body sections of `unit` bars.
 */
export function bedForm(
  req: TrackRequest,
  bpm: number,
  beatsPerBar: number,
  opts: { unit?: number; pattern?: string[]; intro?: [number, number, number]; outro?: [number, number, number]; tail?: number } = {},
): { fit: FormFit; plan: PlannedSection[] } {
  const tail = opts.tail ?? Math.min(3, Math.max(0.8, req.durationSeconds * 0.02));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, beatsPerBar, tail);
  const bars = fit.bars;
  const pickSize = (sizes: [number, number, number]) => (bars >= 40 ? sizes[2] : bars >= 12 ? sizes[1] : bars >= 5 ? sizes[0] : 0);
  const intro = pickSize(opts.intro ?? [1, 2, 4]);
  const outro = pickSize(opts.outro ?? [1, 2, 2]);
  const plan = planSections(bars, { intro, outro, unit: opts.unit ?? 8, pattern: opts.pattern ?? ['A', 'B'] });
  return { fit, plan };
}

/** A strummed chord: notes rolled low→high (down) or high→low (up). */
export function strum(
  b: ScoreBuilder,
  inst: number,
  t: number,
  notes: readonly number[],
  opts: { rng: Rng; d: number; v: number; up?: boolean; spread?: number },
): void {
  const order = opts.up ? [...notes].reverse() : notes;
  const spread = opts.spread ?? 0.012;
  order.forEach((p, k) => b.note(inst, t + k * spread, Math.max(0.05, opts.d - k * spread), p, vel(opts.rng, opts.v * (1 - k * 0.05), 0.04)));
}

/** Ends a motif on a given scale step with a held note (a cadence), keeping its rhythm. */
export function cadence(m: readonly MotifNote[], step: number, lengthBeats: number): MotifNote[] {
  if (!m.length) return [];
  const out = m.map((n) => ({ ...n }));
  const last = out[out.length - 1]!;
  last.step = step;
  last.strong = true;
  // Let the final note sound until near the end of the cell.
  last.beats = Math.max(last.beats, Math.min(lengthBeats - last.beat - 0.25, 3));
  return out;
}

/**
 * Four-cell phrase plan for a section (a "sentence"): statement, answer ending open,
 * sequence or restatement, and a cadence home. `repeat` > 0 varies the material, so a
 * strain never comes back note-for-note.
 */
export function sentence(rng: Rng, base: readonly MotifNote[], cellBeats: number, repeat: number, opts: { seq?: number; open?: number } = {}): MotifNote[][] {
  const seq = opts.seq ?? rng.pick([1, 2, -1]);
  const open = opts.open ?? rng.pick([1, 4]);
  const a = repeat > 0 ? varyMotif(rng, base, 0.25 + 0.1 * Math.min(repeat, 3)) : base.map((n) => ({ ...n }));
  return [
    a,
    cadence(varyMotif(rng, a, 0.5), open, cellBeats),
    rng.chance(0.55) ? shiftMotif(a, seq) : varyMotif(rng, a, 0.6),
    cadence(varyMotif(rng, a, 0.4), 0, cellBeats),
  ];
}

/** A player's feel: a constant lean (ms, + = behind) and a jitter (ms), in seconds. */
export function feel(rng: Rng, leanMs: number, jitterMs: number): (t: number) => number {
  const lean = leanMs / 1000;
  const jitter = jitterMs / 1000;
  return (t: number) => Math.max(0, t + lean + rng.gauss() * jitter * 0.5);
}

/** Seconds of a section. */
export function secondsOf(b: ScoreBuilder, s: PlannedSection): { t0: number; t1: number } {
  return { t0: b.grid.bar(s.startBar), t1: b.grid.bar(s.startBar + s.bars) };
}

/** Linear crescendo helper for rolls: k of n → velocity. */
export function ramp(k: number, n: number, from: number, to: number): number {
  return clamp(from + ((to - from) * k) / Math.max(1, n - 1), 0.01, 1);
}

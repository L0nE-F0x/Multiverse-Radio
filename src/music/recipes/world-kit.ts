// Shared helpers for the v4 world recipes and beds (music-world workstream): swung
// sixteenths, melodic bass riffs that follow the harmony, phrase plans for a lead that
// sings like a vocalist (statement, answer, statement, cadence), and stereo pairs.

import type { Rng } from '../rng';
import { bassPc, chordPcs, chordScale, nearestInSet, pc, stepInSet } from '../theory';
import { bassNote, chordAt, shiftMotif, varyMotif, type ChordSpan, type MotifNote, type ScoreBuilder } from './common';
import { cadence } from './beds-kit';
import type { InstrumentSpec } from '../score';

/**
 * Time of `beat` (fractional) in `bar` with the eighths swung by `swing` (0.5 straight)
 * and the sixteenths in between spaced in proportion, so "a" never overtakes "and".
 */
export function swung(b: ScoreBuilder, swing: number, bar: number, beat: number): number {
  const whole = Math.floor(beat + 1e-9);
  const f = beat - whole;
  const mapped = f <= 0.5 ? (f / 0.5) * swing : swing + ((f - 0.5) / 0.5) * (1 - swing);
  return b.grid.bar(bar) + (whole + mapped) * b.beat;
}

/** A bass-riff note: beat within a two-bar cell, length (beats), scale step from the root. */
export interface RiffNote {
  beat: number;
  beats: number;
  /** Scale steps above (or below) the chord root; 7 = the octave. 'next' = approach the next chord. */
  deg: number | 'next';
  accent: boolean;
}

/**
 * A two-bar melodic bass riff on one of `rhythms` ([beat, beats] cells over 8 beats):
 * chord tones on the strong beats, passing steps between, an approach into the next bar.
 */
export function makeRiff(rng: Rng, rhythms: readonly (readonly [number, number])[][], busy = 0.5): RiffNote[] {
  const shape = rng.pick(rhythms);
  return shape.map(([beat, beats], k) => {
    const strong = Math.abs(beat - Math.round(beat)) < 1e-6 && Math.round(beat) % 2 === 0;
    const last = k === shape.length - 1;
    let deg: number | 'next';
    if (k === 0 || beat === 4) deg = 0;
    else if (last && beat >= 6.5) deg = 'next';
    else if (strong) deg = rng.weighted([[0, 3], [4, 3], [2, 2], [7, 1.5]] as const);
    else deg = rng.weighted([[4, 2], [2, 2], [7, 1.2 + busy], [-1, 1], [5, 0.8], [3, 0.6 + busy], [1, 0.6]] as const);
    return { beat, beats, deg, accent: beat === 0 || beat === 4 };
  });
}

/**
 * Plays a riff from `startBar` for `bars` bars over the harmony. `at` maps (bar, beat) to
 * seconds (swing). Notes follow each moment's chord; 'next' leads into the next chord.
 */
export function playRiff(
  b: ScoreBuilder,
  inst: number | number[],
  riff: readonly RiffNote[],
  spans: readonly ChordSpan[],
  keyScale: readonly number[],
  startBar: number,
  bars: number,
  at: (bar: number, beat: number) => number,
  rng: Rng,
  opts: { lo?: number; hi?: number; v?: number; gate?: number; skip?: (bar: number, beat: number) => boolean } = {},
): void {
  const lo = opts.lo ?? 31;
  const hi = opts.hi ?? 50;
  const insts = Array.isArray(inst) ? inst : [inst];
  let prev: number | null = null;
  for (let k = 0; k < bars; k += 2) {
    for (const n of riff) {
      const bar = startBar + k + Math.floor(n.beat / 4);
      const bt = n.beat % 4;
      if (bar >= startBar + bars || opts.skip?.(bar, bt)) continue;
      const t = at(bar, bt);
      const span = chordAt(spans, t + 0.01);
      const root = bassNote(bassPc(span.chord), prev, lo + 2, hi - 7);
      let p: number;
      if (n.deg === 'next') {
        const idx = spans.indexOf(span);
        const next = spans[idx + 1];
        const target = next ? bassNote(bassPc(next.chord), root, lo + 2, hi - 7) : root;
        p = target === root ? stepInSet(root, chordScale(span.chord, keyScale), rng.pick([-1, 1, 2])) : target + (target > root ? -1 : 1) * rng.pick([1, 2]);
        if (!chordScale(span.chord, keyScale).includes(pc(p)) && rng.chance(0.5)) p = target + (target > root ? -1 : 1);
      } else {
        p = n.deg === 0 ? root : stepInSet(root, chordScale(span.chord, keyScale), n.deg);
        if (n.accent) p = nearestInSet(p, chordPcs(span.chord));
      }
      while (p > hi) p -= 12;
      while (p < lo) p += 12;
      prev = p;
      const d = n.beats * b.beat * (opts.gate ?? 0.9);
      const v = (opts.v ?? 0.75) * (n.accent ? 1.06 : 0.92) + rng.gauss() * 0.02;
      for (const i of insts) b.note(i, t, d, p, v);
    }
  }
}

/** Four two-bar cells for an eight-bar strain: statement, open answer, restatement, home. */
export function strain(rng: Rng, base: readonly MotifNote[], repeat: number, openStep = 4): MotifNote[][] {
  const a = repeat > 0 ? varyMotif(rng, base, 0.3) : base.map((n) => ({ ...n }));
  return [a, cadence(varyMotif(rng, a, 0.5), openStep, 8), rng.chance(0.5) ? shiftMotif(a, rng.pick([1, -1, 2])) : varyMotif(rng, a, 0.4), cadence(varyMotif(rng, a, 0.35), 0, 8)];
}

/** Two copies of an instrument, hard left and hard right (ping-pong stereo). */
export function stereoPair(b: ScoreBuilder, spec: InstrumentSpec, width = 0.92): [number, number] {
  const l = b.inst({ ...spec, name: `${spec.name} (left)`, pan: -width });
  const r = b.inst({ ...spec, name: `${spec.name} (right)`, pan: width });
  return [l, r];
}

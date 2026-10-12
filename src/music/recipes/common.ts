// Shared composition toolkit: score builder, tweak resolution, chord timelines,
// melody generation and drum helpers used by every recipe.

import type { RecipeId, RecipeTweaks } from '../../broadcast/types';
import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import {
  clamp,
  DEFAULT_TWEAKS,
  fitForm,
  Grid,
  planSections,
  type AutoEvent,
  type FormFit,
  type InstrumentSpec,
  type NoteEvent,
  type PlannedSection,
  type Score,
  type Section,
  type TrackFx,
} from '../score';
import { chordPcs, chordScale, chordSymbol, nearestInSet, pc, stepInSet, type Chord } from '../theory';

export function resolveTweaks(req: TrackRequest, defaults: Partial<RecipeTweaks>): RecipeTweaks {
  const t = { ...DEFAULT_TWEAKS, ...defaults, ...(req.tweaks ?? {}) };
  return {
    bpm: clamp(t.bpm, 30, 220),
    density: clamp(t.density, 0, 1),
    grit: clamp(t.grit, 0, 1),
    weirdness: clamp(t.weirdness, 0, 1),
    brightness: clamp(t.brightness, 0, 1),
  };
}

/** Tempo for this song: near the station's bpm if it set one, else within the recipe range. */
export function pickBpm(rng: Rng, req: TrackRequest, range: [number, number]): number {
  const center = req.tweaks?.bpm;
  if (center !== undefined) return clamp(center * rng.range(0.94, 1.06), 30, 220);
  return rng.range(range[0], range[1]);
}

export interface ChordSpan {
  chord: Chord;
  /** Start (s), duration (s). */
  t: number;
  dur: number;
  bar: number;
  /** Beat within the bar where it starts. */
  beat: number;
  beats: number;
}

export class ScoreBuilder {
  readonly instruments: InstrumentSpec[] = [];
  readonly events: NoteEvent[] = [];
  readonly autos: AutoEvent[] = [];
  readonly pumps: number[] = [];
  readonly sections: Section[] = [];
  readonly grid: Grid;

  constructor(
    readonly recipe: RecipeId,
    readonly req: TrackRequest,
    readonly fit: FormFit,
    readonly beatsPerBar: number,
    readonly swing: number,
    readonly tweaks: RecipeTweaks,
    swingDiv: 2 | 4 = 4,
  ) {
    this.grid = new Grid(fit.barDur, beatsPerBar, swing, swingDiv);
  }

  get beat(): number {
    return this.fit.barDur / this.beatsPerBar;
  }

  get end(): number {
    return this.req.durationSeconds;
  }

  inst(spec: InstrumentSpec): number {
    this.instruments.push(spec);
    return this.instruments.length - 1;
  }

  note(i: number, t: number, d: number, p: number, v: number, extra: Partial<NoteEvent> = {}): void {
    if (t < 0 || t >= this.end - 0.05 || d <= 0) return;
    const dur = Math.min(d, this.end - t);
    this.events.push({ t, d: dur, i, p, v: clamp(v, 0.01, 1), ...extra });
  }

  /** A drum hit (one-shot that rings out). */
  hit(i: number, t: number, v: number, pitch = 60, ring = 1.5): void {
    this.note(i, t, ring, pitch, v);
  }

  /** Marks a kick for side-chain pumping. */
  pump(t: number): void {
    if (t >= 0 && t < this.end) this.pumps.push(t);
  }

  auto(target: AutoEvent['target'], t: number, value: number, tau: number, inst?: number): void {
    if (t < 0 || t >= this.end) return;
    const a: AutoEvent = { t, target, value, tau };
    if (inst !== undefined) a.inst = inst;
    this.autos.push(a);
  }

  section(s: PlannedSection, chords: Chord[], flats: boolean): void {
    this.sections.push({
      name: s.name,
      startBar: s.startBar,
      bars: s.bars,
      t: s.startBar * this.fit.barDur,
      chords: dedupeAdjacent(chords.map((c) => chordSymbol(c, flats))),
    });
  }

  build(meta: { key: string; progression: string; fx: TrackFx }): Score {
    const byTime = (a: { t: number }, b: { t: number }) => a.t - b.t;
    this.events.sort(byTime);
    this.autos.sort(byTime);
    this.pumps.sort((a, b) => a - b);
    return {
      recipe: this.recipe,
      seed: this.req.seed >>> 0,
      duration: this.req.durationSeconds,
      bpm: this.fit.bpm,
      beatsPerBar: this.beatsPerBar,
      barDur: this.fit.barDur,
      swing: this.swing,
      key: meta.key,
      bars: this.fit.bars,
      sections: this.sections,
      instruments: this.instruments,
      events: this.events,
      autos: this.autos,
      fx: meta.fx,
      pumps: this.pumps,
      progression: meta.progression,
      tweaks: this.tweaks,
    };
  }
}

function dedupeAdjacent(xs: string[]): string[] {
  return xs.filter((x, i) => i === 0 || xs[i - 1] !== x);
}

/** Standard form fit + section plan for a recipe. */
export function layout(
  req: TrackRequest,
  bpm: number,
  beatsPerBar: number,
  opts: { tail?: number; unit?: number; pattern?: string[]; intro?: number; outro?: number },
): { fit: FormFit; plan: PlannedSection[] } {
  const tail = opts.tail ?? Math.min(4, Math.max(1, req.durationSeconds * 0.025));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, beatsPerBar, tail);
  const bars = fit.bars;
  const intro = opts.intro ?? (bars >= 28 ? 4 : bars >= 12 ? 2 : bars >= 6 ? 1 : 0);
  const outro = opts.outro ?? (bars >= 28 ? 4 : bars >= 12 ? 2 : bars >= 4 ? 1 : 0);
  const plan = planSections(bars, { intro, outro, unit: opts.unit ?? 8, pattern: opts.pattern ?? ['A', 'B'] });
  return { fit, plan };
}

/**
 * Lays a looped progression (bars of chords) across a section and returns timed chord
 * spans. `startIndex` lets a section continue mid-loop.
 */
export function chordSpans(prog: Chord[][], section: { startBar: number; bars: number }, b: ScoreBuilder, startIndex = 0): ChordSpan[] {
  const out: ChordSpan[] = [];
  for (let k = 0; k < section.bars; k++) {
    const bar = section.startBar + k;
    const chords = prog[(startIndex + k) % prog.length]!;
    const beatsEach = b.beatsPerBar / chords.length;
    chords.forEach((chord, j) => {
      const beat = j * beatsEach;
      out.push({ chord, t: b.grid.bar(bar) + beat * b.beat, dur: beatsEach * b.beat, bar, beat, beats: beatsEach });
    });
  }
  return out;
}

/** Chord sounding at time t (or the last one). */
export function chordAt(spans: readonly ChordSpan[], t: number): ChordSpan {
  let found = spans[0]!;
  for (const s of spans) {
    if (s.t <= t + 1e-6) found = s;
    else break;
  }
  return found;
}

// ── Melody ────────────────────────────────────────────────────────────────────

export interface MotifNote {
  /** Beat offset from the motif start. */
  beat: number;
  beats: number;
  /** Scale-step offset relative to the motif's anchor note. */
  step: number;
  /** Accented (falls on a strong beat): snap to a chord tone. */
  strong: boolean;
}

/**
 * A rhythmic/melodic cell: a few notes over `lengthBeats`, with rests, on an 8th (or
 * 16th) grid. `density` 0..1 sets how many notes. Steps are scale steps relative to the
 * phrase's anchor; mostly stepwise with the odd leap, shaped by a contour.
 */
export function makeMotif(
  rng: Rng,
  lengthBeats: number,
  density: number,
  opts: { grid?: number; maxLeap?: number; restTail?: number; minNotes?: number; maxNotes?: number } = {},
): MotifNote[] {
  const grid = opts.grid ?? 0.5;
  const restTail = opts.restTail ?? lengthBeats * 0.2;
  const slots = Math.max(2, Math.floor((lengthBeats - restTail) / grid));
  const perBar = lerp(opts.minNotes ?? 2, opts.maxNotes ?? 5, density);
  const count = clamp(Math.round((perBar * lengthBeats) / 4), 2, slots);
  // Weighted choice of onsets: downbeats, beats, and the pushes just before them.
  const weights: number[] = [];
  for (let k = 0; k < slots; k++) {
    const beat = k * grid;
    const frac = beat - Math.floor(beat + 1e-9);
    const inBar = beat % 4;
    let w = frac < 1e-6 ? 0.75 : 0.5;
    if (inBar < 1e-6) w = 1.1;
    if (Math.abs(inBar - 1.5) < 1e-6 || Math.abs(inBar - 3.5) < 1e-6) w = 0.85; // syncopated pushes
    if (grid < 0.5 && Math.abs(frac - 0.5) > 1e-6 && frac > 1e-6) w *= 0.45;
    weights.push(w);
  }
  const chosen: number[] = [];
  for (let n = 0; n < count; n++) {
    const pool = weights.map((w, k) => [k, chosen.includes(k) ? 0 : w] as const);
    chosen.push(rng.weighted(pool));
  }
  chosen.sort((a, b) => a - b);
  const onsets = chosen.map((k) => k * grid);
  const contour = rng.pick(['arch', 'fall', 'rise', 'wave', 'valley'] as const);
  const notes: MotifNote[] = [];
  let step = rng.pick([0, 0, 2, -2, 4]);
  onsets.forEach((beat, k) => {
    const next = onsets[k + 1] ?? lengthBeats - restTail * 0.4;
    const gap = next - beat;
    const last = k === onsets.length - 1;
    const beats = last ? Math.min(2.5, Math.max(grid, gap)) : Math.max(grid * 0.8, gap * (rng.chance(0.3) ? 0.55 : 0.9));
    if (k > 0) {
      const progress = k / Math.max(1, onsets.length - 1);
      const dir =
        contour === 'arch'
          ? progress <= 0.5
            ? 1
            : -1
          : contour === 'valley'
            ? progress <= 0.5
              ? -1
              : 1
            : contour === 'fall'
              ? -1
              : contour === 'rise'
                ? 1
                : k % 2
                  ? 1
                  : -1;
      const size = rng.weighted([
        [1, 55],
        [2, 24],
        [0, 7],
        [3, 9],
        [4, 5],
      ] as const);
      const sign = rng.chance(0.78) ? dir : -dir;
      step += sign * Math.min(size, opts.maxLeap ?? 4);
      if (step > 5) step -= 2 + rng.int(0, 2);
      if (step < -4) step += 2 + rng.int(0, 2);
    }
    const strong = Math.abs(beat - Math.round(beat)) < 1e-6;
    notes.push({ beat, beats, step, strong });
  });
  return notes;
}

/**
 * Realizes a motif over the harmony: steps are taken in each moment's chord-scale,
 * strong notes snap to chord tones (without collapsing the contour), everything stays
 * within [lo, hi].
 */
export function realizeMotif(
  motif: readonly MotifNote[],
  startT: number,
  beatDur: number,
  anchor: number,
  spans: readonly ChordSpan[],
  keyScale: readonly number[],
  lo: number,
  hi: number,
  grid?: Grid,
  startBar?: number,
): { t: number; d: number; p: number; strong: boolean }[] {
  const out: { t: number; d: number; p: number; strong: boolean }[] = [];
  let prevStep: number | null = null;
  let prevP: number | null = null;
  for (const n of motif) {
    const t = grid && startBar !== undefined ? grid.at(startBar, n.beat) : startT + n.beat * beatDur;
    const span = chordAt(spans, t + 0.01);
    const scale = chordScale(span.chord, keyScale);
    const target = stepInSet(nearestInSet(anchor, scale), scale, n.step);
    let p = target;
    if (n.strong) {
      const tones = chordPcs(span.chord);
      p = nearestInSet(target, tones);
      // Keep the contour: a step that moved shouldn't snap back onto the previous note.
      if (prevP !== null && prevStep !== null && n.step !== prevStep && p === prevP) {
        const dir = Math.sign(n.step - prevStep);
        let q = p + dir;
        while (!tones.includes(pc(q))) q += dir;
        p = q;
      }
    }
    out.push({ t, d: n.beats * beatDur, p, strong: n.strong });
    prevStep = n.step;
    prevP = p;
  }
  // Fit the whole phrase into the range by octaves (keeps its shape), then fold strays.
  if (out.length) {
    const center = (lo + hi) / 2;
    let best = 0;
    let bestCost = Infinity;
    for (let k = -2; k <= 2; k++) {
      let cost = 0;
      let mean = 0;
      for (const n of out) {
        const q = n.p + 12 * k;
        cost += Math.max(0, q - hi) + Math.max(0, lo - q);
        mean += q / out.length;
      }
      cost = cost * 10 + Math.abs(mean - center) * 0.1;
      if (cost < bestCost) {
        bestCost = cost;
        best = k;
      }
    }
    for (const n of out) {
      n.p += 12 * best;
      while (n.p > hi) n.p -= 12;
      while (n.p < lo) n.p += 12;
    }
  }
  return out;
}

/** Varies a motif: keeps the rhythm of the first half, re-rolls the ending. */
export function varyMotif(rng: Rng, motif: readonly MotifNote[], amount = 0.5): MotifNote[] {
  const keep = Math.ceil(motif.length * (1 - amount));
  return motif.map((n, k) => {
    if (k < keep) return { ...n };
    return { ...n, step: clamp(n.step + rng.pick([-2, -1, 1, 2]), -6, 7) };
  });
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export function vel(rng: Rng, base: number, spread = 0.06): number {
  return clamp(base + rng.gauss() * spread * 0.6, 0.02, 1);
}

/** Microtonal detune for multiverse weirdness, in cents. */
export function weirdDetune(rng: Rng, weirdness: number, max = 35): number {
  return weirdness < 0.2 ? 0 : rng.range(-1, 1) * max * (weirdness - 0.2) * 1.25;
}

/** Bass note for a chord, placed in [lo, hi] closest to `prev`. */
export function bassNote(pcValue: number, prev: number | null, lo = 31, hi = 45): number {
  const options: number[] = [];
  for (let n = lo; n <= hi; n++) if (pc(n) === pc(pcValue)) options.push(n);
  if (!options.length) return lo + pc(pcValue - lo);
  if (prev === null) return options[Math.floor((options.length - 1) / 2)]!;
  return options.reduce((best, n) => (Math.abs(n - prev) < Math.abs(best - prev) ? n : best), options[0]!);
}

/** Linear map of a tweak (0..1) to a range. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function trackFx(partial: Partial<TrackFx> & { gain: number }): TrackFx {
  return { lowpass: 16000, highpass: 30, wow: 0, wowRate: 0.5, flutter: 0, drive: 0, ...partial };
}

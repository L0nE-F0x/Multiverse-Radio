// The score: a fully composed track as plain data. Recipes produce it (pure, seeded);
// the engine plays it. Times are seconds from the start of the track.

import type { RecipeId, RecipeTweaks } from '../broadcast/types';
import type { GenreSamplePatch, GenreSynthPatch } from './dsp/genres';
import type { Rng } from './rng';

export interface NoteEvent {
  /** Start, seconds from track start. */
  t: number;
  /** Gate length in seconds (release follows). */
  d: number;
  /** Index into Score.instruments. */
  i: number;
  /** MIDI pitch; fractional values are microtonal. Drums use 60 = unpitched. */
  p: number;
  /** Velocity 0..1. */
  v: number;
  /** Slide in from this pitch (synth voices) over `glide` seconds. */
  from?: number;
  glide?: number;
  /** Play the sample backwards (a reverse swell ending at t + d). */
  rev?: boolean;
  /** Semitone offsets cycled at `arpRate` seconds per step (chiptune arpeggios). */
  arp?: number[];
  arpRate?: number;
}

/**
 * Automation. Targets:
 *  cutoff      – track low-pass frequency (Hz)
 *  inst        – an instrument bus gain (multiplier of its mix gain), needs `inst`
 *  echo        – an instrument's send into the track delay, needs `inst`
 *  tapestop    – a tape-stop dip of `value` seconds starting at t (0 resets)
 */
export interface AutoEvent {
  t: number;
  target: 'cutoff' | 'inst' | 'echo' | 'tapestop';
  inst?: number;
  value: number;
  /** Time constant for the approach (seconds); 0 = jump. */
  tau: number;
}

export type SamplePatch =
  | 'ep'
  | 'ep-bright'
  | 'wurli'
  | 'felt-piano'
  | 'piano'
  | 'nylon'
  | 'harpsichord'
  | 'vibes'
  | 'celesta'
  | 'glass'
  | 'musicbox'
  | 'marimba'
  | 'steeldrum'
  | 'kalimba'
  | 'bass-round'
  | 'bass-upright'
  | 'bass-sub'
  | 'pizz'
  | 'kick-lofi'
  | 'kick-soft'
  | 'kick-808'
  | 'kick-punch'
  | 'kick-chip'
  | 'snare-lofi'
  | 'snare-brush'
  | 'snare-gated'
  | 'snare-march'
  | 'snare-chip'
  | 'snare-dub'
  | 'rim'
  | 'clap'
  | 'hat-closed'
  | 'hat-open'
  | 'hat-chip'
  | 'shaker'
  | 'ride'
  | 'brush-swish'
  | 'conga'
  | 'bongo'
  | 'timpani'
  | 'tom'
  | 'cowbell'
  | 'woodblock'
  | 'triangle'
  | 'crash'
  | 'tick'
  | 'vinyl'
  | 'rain'
  | 'static'
  | 'hiss'
  | 'shortwave'
  | 'ocean'
  // v3 genre instruments (dsp/genres.ts)
  | GenreSamplePatch;

export type SynthPatch =
  | 'pad-warm'
  | 'pad-strings'
  | 'pad-glass'
  | 'pad-choir'
  | 'pad-dark'
  | 'saw-lead'
  | 'square-lead'
  | 'soft-lead'
  | 'flute'
  | 'whale'
  | 'arp-pluck'
  | 'synth-bass'
  | 'acid-bass'
  | 'brass'
  | 'horn'
  | 'organ'
  | 'skank'
  | 'melodica'
  | 'accordion'
  | 'tuba'
  | 'clarinet'
  | 'chip-pulse12'
  | 'chip-pulse25'
  | 'chip-square'
  | 'chip-tri'
  | 'sine-beep'
  | 'drone'
  // v3 genre instruments (dsp/genres.ts)
  | GenreSynthPatch;

interface InstrumentMix {
  /** Display name. */
  name: string;
  /** Linear gain of the bus. */
  gain: number;
  pan?: number;
  /** Send into the shared reverb, 0..1. */
  reverb?: number;
  /** Send into the track delay, 0..1. */
  delay?: number;
  /** Ducked by the kick ("pumping"), 0..1 depth. */
  pump?: number;
  /** Bus filters (Hz). */
  lowpass?: number;
  highpass?: number;
  /** Stereo tremolo / auto-pan. */
  tremolo?: { rate: number; depth: number };
  /** Release time constant after the gate closes (seconds). */
  release?: number;
  /** Fixed per-instrument detune in cents (multiverse weirdness). */
  detune?: number;
}

export type InstrumentSpec =
  | (InstrumentMix & { kind: 'sample'; patch: SamplePatch })
  | (InstrumentMix & { kind: 'synth'; patch: SynthPatch });

export interface TrackFx {
  /** Overall track level (linear), calibrated per recipe for ~-18 LUFS. */
  gain: number;
  /** Track low-pass (Hz) and high-pass (Hz). */
  lowpass: number;
  highpass: number;
  /** Low-pass resonance. */
  q?: number;
  /** Tape wow (ms of delay modulation) and flutter (ms). 0 disables. */
  wow: number;
  wowRate: number;
  flutter: number;
  /** Saturation amount 0..1. */
  drive: number;
  /** Track delay (echo). */
  delay?: { time: number; feedback: number; tone: number; wet: number };
  /** Low-pass on everything sent to the shared reverb (Hz). */
  reverbTone?: number;
  /** Overall reverb return level for this track. */
  reverbLevel?: number;
}

export interface Section {
  /** Display name, e.g. "intro", "A", "B", "A′", "outro". */
  name: string;
  startBar: number;
  bars: number;
  /** Start time, seconds. */
  t: number;
  /** Chord symbols, one per chord change (display). */
  chords: string[];
}

export interface Score {
  recipe: RecipeId;
  seed: number;
  duration: number;
  bpm: number;
  beatsPerBar: number;
  barDur: number;
  /** 0.5 = straight. */
  swing: number;
  key: string;
  bars: number;
  sections: Section[];
  instruments: InstrumentSpec[];
  /** Sorted by t. */
  events: NoteEvent[];
  /** Sorted by t. */
  autos: AutoEvent[];
  fx: TrackFx;
  /** Kick times (for pumping), sorted. */
  pumps: number[];
  /** Short human summary of the song's harmony. */
  progression: string;
  tweaks: RecipeTweaks;
}

export interface TrackInfo {
  recipe: RecipeId;
  key: string;
  bpm: number;
  beatsPerBar: number;
  swing: number;
  bars: number;
  duration: number;
  progression: string;
  instruments: string[];
  sections: Section[];
  events: number;
}

export function trackInfo(score: Score): TrackInfo {
  return {
    recipe: score.recipe,
    key: score.key,
    bpm: Math.round(score.bpm * 10) / 10,
    beatsPerBar: score.beatsPerBar,
    swing: score.swing,
    bars: score.bars,
    duration: score.duration,
    progression: score.progression,
    instruments: score.instruments.map((i) => i.name),
    sections: score.sections,
    events: score.events.length,
  };
}

// ── Form fitting ──────────────────────────────────────────────────────────────

export interface FormFit {
  bpm: number;
  bars: number;
  barDur: number;
  /** Seconds after the last bar for the final chord to ring out. */
  tail: number;
}

/**
 * Picks a whole number of bars and nudges the tempo (within ±flex) so the music ends
 * exactly `tail` seconds before `duration`.
 */
export function fitForm(duration: number, bpm: number, beatsPerBar: number, tail: number, flex = 0.06): FormFit {
  const body = Math.max(1, duration - tail);
  const barDur = (beatsPerBar * 60) / bpm;
  const bars = Math.max(1, Math.round(body / barDur));
  let fitted = (bars * beatsPerBar * 60) / body;
  fitted = Math.min(bpm * (1 + flex), Math.max(bpm * (1 - flex), fitted));
  const fittedBarDur = (beatsPerBar * 60) / fitted;
  return { bpm: fitted, bars, barDur: fittedBarDur, tail: Math.max(0, duration - bars * fittedBarDur) };
}

export interface PlannedSection {
  name: string;
  /** Which material: 'intro' | 'outro' | a body letter like 'A', 'B', 'C'. */
  part: string;
  /** How many times this part has occurred before (0 = first). */
  repeat: number;
  startBar: number;
  bars: number;
}

/**
 * Lays out intro → body sections (cycling `pattern`, `unit` bars each) → outro to fill
 * exactly `bars` bars.
 */
export function planSections(
  bars: number,
  opts: { intro: number; outro: number; unit: number; pattern: string[] },
): PlannedSection[] {
  const out: PlannedSection[] = [];
  let intro = opts.intro;
  let outro = opts.outro;
  while (intro + outro > Math.max(0, bars - Math.min(opts.unit, 4)) && (intro > 0 || outro > 0)) {
    if (intro >= outro && intro > 0) intro = Math.max(0, intro - 1);
    else outro = Math.max(0, outro - 1);
  }
  let bar = 0;
  if (intro > 0) {
    out.push({ name: 'intro', part: 'intro', repeat: 0, startBar: 0, bars: intro });
    bar = intro;
  }
  const bodyEnd = bars - outro;
  const counts: Record<string, number> = {};
  let k = 0;
  while (bar < bodyEnd) {
    const part = opts.pattern[k % opts.pattern.length]!;
    let len = Math.min(opts.unit, bodyEnd - bar);
    // Avoid a stub section: fold a short remainder into this one.
    const remainder = bodyEnd - bar - len;
    if (remainder > 0 && remainder < Math.ceil(opts.unit / 2)) len += remainder;
    const repeat = counts[part] ?? 0;
    counts[part] = repeat + 1;
    const prime = ['', '′', '″', '‴'][Math.min(repeat, 3)]!;
    out.push({ name: `${part}${prime}`, part, repeat, startBar: bar, bars: len });
    bar += len;
    k++;
  }
  if (outro > 0) out.push({ name: 'outro', part: 'outro', repeat: 0, startBar: bodyEnd, bars: outro });
  return out;
}

/** Index of the bar containing `seconds` (clamped to the track). */
export function barAt(score: Pick<Score, 'barDur' | 'bars'>, seconds: number): number {
  return Math.max(0, Math.min(score.bars - 1, Math.floor(seconds / score.barDur + 1e-9)));
}

/** Section containing `seconds`, or the last one. */
export function sectionAt(score: Pick<Score, 'sections'>, seconds: number): Section | undefined {
  let found = score.sections[0];
  for (const s of score.sections) if (s.t <= seconds + 1e-9) found = s;
  return found;
}

/**
 * The events to play when joining at `offset`: everything from the start of the bar
 * containing `offset` that still sounds at `offset`. Notes that began earlier in the bar
 * but are still held (or start before the offset but end after it) are included; the
 * player starts them part-way through.
 */
export function eventsFrom(events: readonly NoteEvent[], barStart: number, offset: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const e of events) {
    if (e.t + e.d < barStart) continue;
    if (e.t >= offset || e.t + e.d > offset + 0.05) out.push(e);
  }
  return out;
}

// ── Timing helpers used by recipes ────────────────────────────────────────────

export class Grid {
  constructor(
    readonly barDur: number,
    readonly beatsPerBar: number,
    /** 0.5 = straight; 0.58 = lazy 16th swing. */
    readonly swing: number,
    /** Swing applies to this subdivision per beat: 2 (8ths) or 4 (16ths). */
    readonly swingDiv: 2 | 4 = 4,
  ) {}

  get beatDur(): number {
    return this.barDur / this.beatsPerBar;
  }

  bar(b: number): number {
    return b * this.barDur;
  }

  /** Time of `beat` (fractional, may exceed the bar) within bar `b`, with swing applied. */
  at(b: number, beat: number): number {
    const sub = beat * this.swingDiv;
    const whole = Math.floor(sub + 1e-9);
    const frac = sub - whole;
    let pos = whole;
    if (whole % 2 === 1 && frac < 1e-6) pos = whole - 1 + 2 * this.swing;
    else pos = sub;
    return b * this.barDur + (pos / this.swingDiv) * this.beatDur;
  }

  /** 16th-step helper: step 0..15 in 4/4. */
  step(b: number, s: number, perBeat = 4): number {
    return this.at(b, s / perBeat);
  }
}

/** Adds timing/velocity humanization in place. */
export function humanize(rng: Rng, t: number, ms: number): number {
  return t + (rng.gauss() * ms) / 1000;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export const DEFAULT_TWEAKS: RecipeTweaks = { bpm: 80, density: 0.5, grit: 0.3, weirdness: 0.15, brightness: 0.5 };

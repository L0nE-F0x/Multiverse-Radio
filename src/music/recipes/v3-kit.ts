// Shared helpers for the v3 genre recipes: style vs. song streams (artist signatures),
// tempo/feel/key choices, the artist's phrasing, strums and guitar shapes, and a
// ritardando that bends finished events.

import type { TrackRequest } from '../index';
import { hashString, Rng, rngFor } from '../rng';
import { clamp, type PlannedSection } from '../score';
import { chordPcs, pc, type Chord } from '../theory';
import { signatureOf, type ArtistSignature } from './artist';
import { lerp, makeMotif, vel, type MotifNote, type ScoreBuilder } from './common';

/**
 * Two random streams per track. `style` decides the sound (palette, feel, form habits):
 * it is seeded by the artist when there is one, so their songs share it; otherwise by
 * the song. `song` decides everything else (key, chords, melody, arrangement details).
 */
export interface Streams {
  sig: ArtistSignature | null;
  style: Rng;
  song: Rng;
}

export function streams(req: TrackRequest, label: string): Streams {
  const sig = req.artist !== undefined ? signatureOf(req.artist) : null;
  return {
    sig,
    style: sig ? rngFor(sig.id, 'style', label) : rngFor(req.seed, label, 'style'),
    song: rngFor(req.seed, label),
  };
}

/** Tempo: near a station hint, else the artist's (or this song's) place in `range`, with play. */
export function bpmFor(s: Streams, req: TrackRequest, range: [number, number], play = 0.35): number {
  const hint = req.tweaks?.bpm;
  if (hint !== undefined) return clamp(hint * (s.sig ? 1 + (s.sig.tempo - 0.5) * 0.08 : 1) * s.song.range(0.96, 1.04), 30, 220);
  const centre = s.sig ? s.sig.tempo : s.style.next();
  const spread = s.sig ? s.sig.spread : play;
  return lerp(range[0], range[1], clamp(centre + (s.song.next() - 0.5) * spread, 0, 1));
}

/** A feel value in [lo, hi] (swing, laziness...): the artist's, else this song's. */
export function feelFor(s: Streams, lo: number, hi: number): number {
  const x = s.sig ? (s.sig.swing + 1) / 2 : s.style.next();
  return lerp(lo, hi, clamp(x + (s.song.next() - 0.5) * 0.2, 0, 1));
}

/** Tonic pitch class: one of the artist's favourite keys about half the time. */
export function tonicFor(s: Streams, preferred?: readonly number[]): number {
  if (s.sig && s.song.chance(0.5)) return s.song.pick(s.sig.keys);
  if (preferred?.length && s.song.chance(0.7)) return s.song.pick(preferred);
  return s.song.int(0, 11);
}

/** Minor or major: the recipe's odds, nudged by the artist's leaning. */
export function minorFor(s: Streams, odds: number): boolean {
  const p = s.sig ? clamp(odds + (s.sig.minor - 0.5) * 0.6, 0.03, 0.97) : odds;
  return s.song.chance(p);
}

/**
 * A melodic cell. With an artist, the rhythm and the opening interval are theirs (the
 * same in every song, so their tunes sound like them) and the rest is this song's.
 */
export function phrase(s: Streams, label: string, lengthBeats: number, density: number, opts: Parameters<typeof makeMotif>[3] = {}): MotifNote[] {
  if (!s.sig) return makeMotif(s.song, lengthBeats, density, opts);
  const base = makeMotif(new Rng(hashString(label, s.sig.phrasing)), lengthBeats, density, opts);
  return base.map((n, k) => (k < 2 ? { ...n } : { ...n, step: clamp(n.step + s.song.pick([-2, -1, 0, 0, 1, 2]), -5, 7) }));
}

/** Plays chord notes as a strum (down = low to high), `spread` seconds apart. */
export function strum(b: ScoreBuilder, inst: number, rng: Rng, t: number, d: number, notes: readonly number[], v: number, spread: number, down = true): void {
  const order = down ? notes : [...notes].reverse();
  order.forEach((p, k) => {
    const at = t + k * spread * rng.range(0.75, 1.25);
    b.note(inst, at, Math.max(0.03, d - k * spread), p, vel(rng, v * (down ? 1 - k * 0.02 : 0.92 - k * 0.03), 0.05));
  });
}

/**
 * A guitar barre shape for a chord: root on the low E or A string, then fifth, octave
 * (or seventh), third and fifth above. Returns ascending MIDI notes.
 */
export function guitarShape(c: Chord, opts: { low?: number; strings?: 4 | 5 | 6 } = {}): number[] {
  const low = opts.low ?? 40;
  const iv = c.intervals.map((i) => i % 12);
  const has = (i: number) => iv.includes(i);
  const third = has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : has(2) ? 2 : 7;
  const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
  const seventh = has(10) ? 10 : has(11) ? 11 : has(9) && c.quality.includes('6') ? 9 : null;
  let root = low + pc(c.root - low);
  if (root > low + 7) root -= 12;
  if (root < 40) root += 12;
  const six = root < 45;
  let shape = six ? [0, fifth, seventh ?? 12, 12 + third, 12 + fifth, 24] : [0, fifth, seventh ?? 12, 12 + third, 12 + fifth];
  if (c.bass !== undefined && pc(c.bass) !== pc(c.root)) {
    // Slash chord: the bass note under an upper shape.
    const bassNote = 40 + pc(c.bass - 40);
    return [bassNote, ...shape.slice(1).map((x) => root + x)].sort((a, b) => a - b);
  }
  const n = opts.strings ?? (six ? 6 : 5);
  shape = shape.slice(0, n);
  return shape.map((x) => root + x).sort((a, b) => a - b);
}

/** Chord tones of `c` within [lo, hi]. */
export function tonesIn(c: Chord, lo: number, hi: number): number[] {
  const pcs = chordPcs(c);
  const out: number[] = [];
  for (let n = Math.ceil(lo); n <= hi; n++) if (pcs.includes(pc(n))) out.push(n);
  return out;
}

/**
 * A ritardando: events from `from` on are spread out progressively (tempo falls by
 * `amount` × 2 by `to`); what follows `to` shifts later by the time gained. Every note
 * still ends before the track does.
 */
export function ritardando(b: ScoreBuilder, from: number, to: number, amount: number): void {
  const span = Math.max(0.01, to - from);
  const warp = (t: number) => {
    if (t <= from) return t;
    const u = Math.min(1, (t - from) / span);
    return t + amount * span * u * u;
  };
  const end = b.end;
  for (const e of b.events) {
    if (e.t + e.d <= from) continue;
    const t0 = warp(e.t);
    const t1 = warp(e.t + e.d);
    e.t = Math.min(t0, end - 0.06);
    e.d = Math.max(0.02, Math.min(t1 - e.t, end - e.t));
  }
  for (const a of b.autos) if (a.t > from) a.t = Math.min(warp(a.t), end - 0.05);
  for (let k = 0; k < b.pumps.length; k++) if (b.pumps[k]! > from) b.pumps[k] = Math.min(warp(b.pumps[k]!), end - 0.05);
}

export interface FormPart {
  part: string;
  bars: number;
}

/**
 * A song form of exactly `bars` bars: intro, then `first` (if given) followed by `cycle`
 * repeated, then outro. The last body part is cut (or folded into the one before) to
 * fit; the intro and outro shrink first when the song is short.
 */
export function planForm(bars: number, intro: number, outro: number, cycle: readonly FormPart[], first: readonly FormPart[] = []): PlannedSection[] {
  let i = intro;
  let o = outro;
  while (i + o > Math.max(0, bars - 2) && (i > 0 || o > 0)) {
    if (i >= o && i > 0) i--;
    else o--;
  }
  const out: PlannedSection[] = [];
  const counts: Record<string, number> = {};
  const push = (part: string, startBar: number, n: number) => {
    const repeat = counts[part] ?? 0;
    counts[part] = repeat + 1;
    const prime = ['', '′', '″', '‴'][Math.min(repeat, 3)]!;
    out.push({ name: part === 'intro' || part === 'outro' ? part : `${part}${prime}`, part, repeat, startBar, bars: n });
  };
  if (i > 0) push('intro', 0, i);
  let bar = i;
  const end = bars - o;
  let k = 0;
  while (bar < end) {
    const p = k < first.length ? first[k]! : cycle[(k - first.length) % cycle.length]!;
    let n = Math.min(p.bars, end - bar);
    const left = end - bar - n;
    if (left > 0 && left < 2) n += left;
    push(p.part, bar, n);
    bar += n;
    k++;
  }
  if (o > 0) push('outro', end, o);
  return out;
}

/** A performed fade-out: velocities fall away between `from` and `to` (no extra nodes). */
export function fadeVelocities(b: ScoreBuilder, from: number, to: number, floor = 0.04): void {
  const span = Math.max(0.01, to - from);
  for (const e of b.events) {
    if (e.t <= from) continue;
    const u = Math.min(1, (e.t - from) / span);
    e.v = Math.max(0.01, e.v * Math.max(floor, (1 - u) ** 1.1));
  }
}

/** Linear fade automation of an instrument bus between two times. */
export function swell(b: ScoreBuilder, inst: number, t0: number, t1: number, v0: number, v1: number): void {
  b.auto('inst', t0, v0, 0, inst);
  b.auto('inst', t0 + 0.01, v1, Math.max(0.05, (t1 - t0) / 3), inst);
}

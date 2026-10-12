// The Infinite Song: one song, playing since the beginning of time. The key (D major),
// the tempo, the band and the refrain never change; only the verses do. Every track is
// the next verse (or several): a new verse melody over the same changes, then the
// refrain everyone knows (fiddle on top, the whole room singing under it). Each track
// opens on the turnaround and ends on it, hanging on the dominant: it isn't over.
//
// The artist is ignored on purpose: it's always the same band.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { rngFor } from '../rng';
import type { FormFit, PlannedSection, Score } from '../score';
import { bassPc, chordPcs, keyName, nearestInSet, parseProgression, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, makeMotif, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';
import { guitarShape, strum } from './v3-kit';

const TONIC = 2; // D
const BPM = 96;
const VERSE = 'I V vi IV I V IV V';
const REFRAIN = 'IV I V vi IV I V I';
const TURN = 'IV V';

/** The refrain, as everyone has always sung it: [bar, beat, beats, MIDI]. */
const REFRAIN_TUNE: [number, number, number, number][] = [
  [0, 0, 1, 71], [0, 1, 1, 74], [0, 2, 2, 74],
  [1, 0, 1, 73], [1, 1, 1, 71], [1, 2, 2, 69],
  [2, 0, 1, 69], [2, 1, 0.5, 71], [2, 1.5, 0.5, 73], [2, 2, 1, 76], [2, 3, 1, 73],
  [3, 0, 3, 74], [3, 3, 1, 71],
  [4, 0, 1, 71], [4, 1, 1, 74], [4, 2, 1.5, 79], [4, 3.5, 0.5, 78],
  [5, 0, 1, 78], [5, 1, 1, 76], [5, 2, 2, 74],
  [6, 0, 1, 76], [6, 1, 0.5, 74], [6, 1.5, 0.5, 73], [6, 2, 1, 71], [6, 3, 1, 73],
  [7, 0, 4, 74],
];

function verseNumber(seed: number): string {
  const n = 4_000_112 + (seed % 1_000_000);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function composeInfiniteSong(req: TrackRequest): Score {
  const song = rngFor(req.seed, 'infinite-song');
  const tweaks = resolveTweaks(req, { bpm: BPM, density: 0.5, grit: 0.2, weirdness: 0.05, brightness: 0.5 });
  const { density: D, grit: G, brightness: B } = tweaks;

  // The same tempo every night, give or take how the band is feeling.
  const bpm = BPM * song.range(0.985, 1.015);
  const barDur = 240 / bpm;
  const minTail = Math.min(2.5, Math.max(0.6, req.durationSeconds * 0.03));
  const bars = Math.max(1, Math.floor((Math.max(4, req.durationSeconds) - minTail) / barDur));
  const fit: FormFit = { bpm, bars, barDur, tail: req.durationSeconds - bars * barDur };
  const plan = form(bars, song);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.54, tweaks, 4);
  const beat = b.beat;
  const keyScale = scalePcs(TONIC, SCALES.major);
  const progV = parseProgression(VERSE, TONIC);
  const progR = parseProgression(REFRAIN, TONIC);
  const progT = parseProgression(TURN, TONIC);

  const guitar = b.inst({ kind: 'sample', patch: 'folk-guitar', name: 'Acoustic guitar', gain: 0.42, pan: -0.3, reverb: 0.15, release: 0.15 });
  const piano = b.inst({ kind: 'sample', patch: 'piano', name: 'Upright piano', gain: 0.38, pan: 0.2, reverb: 0.2, lowpass: 6000 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Upright bass', gain: 0.55, pan: 0.02 });
  const singer = b.inst({ kind: 'synth', patch: 'melodica', name: 'Melodica (the verse)', gain: 0.5, pan: 0.05, reverb: 0.25 });
  const fiddle = b.inst({ kind: 'sample', patch: 'bowed-fiddle', name: 'Fiddle', gain: 0.5, pan: 0.15, reverb: 0.28, release: 0.12 });
  const room = b.inst({ kind: 'synth', patch: 'crew', name: 'Everyone (the refrain)', gain: 0.55, pan: -0.08, reverb: 0.45, lowpass: 3000 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.4 });
  const tap = b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Brushes', gain: 0.45, pan: -0.05, reverb: 0.1 });
  const stir = b.inst({ kind: 'sample', patch: 'brush-stir', name: 'Brush sweeps', gain: 0.25, pan: -0.05 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.25, pan: 0.2, lowpass: 7000 });
  const tamb = b.inst({ kind: 'sample', patch: 'jingle-tamb', name: 'Tambourine', gain: 0.25, pan: 0.35 });

  let pianoV: number[] | null = null;
  let prevBass: number | null = null;
  let verseNo = 0;

  for (const s of plan) {
    const isR = s.part === 'R';
    const isV = s.part === 'V' || s.part === 'I';
    const prog = isR ? progR : isV ? progV : progT;
    // Partial sections are the end of their part (the song was already going).
    const full = isR || isV ? 8 : 2;
    const offset = Math.max(0, full - s.bars) % prog.length;
    const spans = chordSpans(prog, s, b, offset);
    const ending = s.part === 'outro';
    if (ending) {
      const last = spans[spans.length - 1]!;
      last.dur = b.end - last.t;
    }
    const name = s.part === 'intro' ? 'turnaround' : ending ? 'turnaround (to be continued)' : isR ? 'refrain' : s.part === 'I' ? 'fiddle verse' : `verse ${verseNumber(req.seed + verseNo)}`;
    if (isV) verseNo++;
    b.section({ ...s, name }, spans.map((x) => x.chord), false);

    spans.forEach((span, k) => {
      const t = b.grid.at(span.bar, span.beat);
      const last = ending && k === spans.length - 1;
      const shape = guitarShape(span.chord, { low: 40 });
      pianoV = voiceChord(span.chord, pianoV, { low: 55, high: 74, voices: 3, rootless: false, maxSpan: 12 });
      if (last) {
        strum(b, guitar, song, t, b.end - t - 0.3, shape, 0.55, 0.03);
        for (const p of pianoV) b.note(piano, t, b.end - t - 0.3, p, 0.4);
        b.note(bass, t, Math.min(3, b.end - t - 0.3), bassNote(bassPc(span.chord), prevBass, 31, 45), 0.7);
        b.note(fiddle, t + beat * 0.5, b.end - t - beat * 0.5 - 0.3, 69, 0.45);
        return;
      }
      // Guitar: the same strum it's always been.
      for (let e = 0; e < Math.round(span.beats * 2); e++) {
        const c = 'd-du-udu'[e % 8]!;
        if (c === '-') continue;
        strum(b, guitar, song, b.grid.at(span.bar, span.beat + e * 0.5), beat * 0.9, c === 'd' ? shape : shape.slice(-4), c === 'd' ? 0.5 : 0.38, 0.011, c === 'd');
      }
      // Piano: half notes, and in the refrain a little more.
      for (const at of [0, 2]) {
        if (at >= span.beats) continue;
        for (const p of pianoV) b.note(piano, b.grid.at(span.bar, span.beat + at) + song.gauss() * 0.005, beat * 1.8, p, vel(song, isR ? 0.42 : 0.34));
      }
      // Bass: two-feel in the verse, walking up in the refrain.
      const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
      prevBass = root;
      const fifth = root + 7 <= 50 ? root + 7 : root - 5;
      if (isR) {
        const tones = chordPcs(span.chord);
        const line = [root, nearestInSet(root + 3, tones), fifth, root + 2];
        line.forEach((p, q) => b.note(bass, b.grid.at(span.bar, span.beat + q), beat * 0.85, p, vel(song, q ? 0.62 : 0.75)));
      } else {
        b.note(bass, t, beat * 1.8, root, vel(song, 0.72));
        b.note(bass, b.grid.at(span.bar, span.beat + 2), beat * 1.8, fifth, vel(song, 0.62));
      }
    });

    // ── Drums ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (ending && k === s.bars - 1) {
        b.hit(stir, b.grid.bar(bar), 0.5, 60, 1.2);
        break;
      }
      for (const bt of [0, 2]) b.hit(kick, b.grid.at(bar, bt), vel(song, 0.6));
      for (const bt of [1, 3]) b.hit(tap, b.grid.at(bar, bt) + song.gauss() * 0.004, vel(song, 0.6));
      for (const bt of [0, 2]) b.hit(stir, b.grid.at(bar, bt) - 0.04, vel(song, 0.45), 60, 1.2);
      for (let e = 0; e < 8; e++) b.hit(hat, b.grid.at(bar, e * 0.5), vel(song, e % 2 ? 0.28 : 0.4), 60, 0.25);
      if (isR) for (const bt of [1, 3]) b.hit(tamb, b.grid.at(bar, bt) + 0.01, vel(song, 0.6));
      if (k === s.bars - 1 && song.chance(0.5 + D * 0.3)) for (const x of [3.25, 3.5, 3.75]) b.hit(tap, b.grid.at(bar, x), vel(song, 0.42));
    }

    // ── The tune ──
    if (isR) {
      const skip = 8 - s.bars;
      for (const [bar, bt, beats, p] of REFRAIN_TUNE) {
        if (bar < skip) continue;
        const t = b.grid.at(s.startBar + bar - skip, bt);
        const d = beats * beat * 0.95;
        // A grace note now and then: the fiddler's own little flourish tonight.
        if (beats >= 1 && song.chance(0.15)) b.note(fiddle, t - 0.07, 0.07, p + 2, 0.4);
        b.note(fiddle, t + song.gauss() * 0.004, d, p, vel(song, beats >= 2 ? 0.62 : 0.56));
        b.note(room, t + song.gauss() * 0.01, d, p - 12, vel(song, 0.6));
      }
    } else if (isV && s.bars >= 2) {
      // Tonight's verse: new words, so a new tune, over the same old changes.
      const inst = s.part === 'I' ? fiddle : singer;
      const a = makeMotif(song, 8, 0.3 + D * 0.35, { restTail: 1, maxNotes: 5, maxLeap: 3 });
      const a2 = varyMotif(song, a, 0.5);
      const c = makeMotif(song, 8, 0.25 + D * 0.3, { restTail: 1.5, maxNotes: 4, maxLeap: 3 });
      const cells = [a, a2, c, a];
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const cell = cells[(ph / 2 + Math.floor((8 - s.bars) / 2)) % 4]!;
        for (const n of realizeMotif(cell, 0, beat, 69, spans, keyScale, 62, 78, b.grid, s.startBar + ph)) {
          b.note(inst, n.t + song.gauss() * 0.005, n.d * 0.92, n.p, vel(song, n.strong ? 0.62 : 0.54));
        }
      }
    }
  }
  b.auto('cutoff', 0, lerp(5000, 12000, B), 0);

  return b.build({
    key: keyName(TONIC, 'major'),
    progression: `verse ${verseNumber(req.seed)} · verse ${VERSE} · refrain ${REFRAIN}`,
    fx: trackFx({
      gain: 0.483,
      lowpass: lerp(5000, 12000, B),
      highpass: 38,
      wow: 0.4 + G * 1.5,
      wowRate: 0.35,
      flutter: 0.01 + G * 0.04,
      drive: 0.08 + G * 0.3,
      reverbTone: 4800,
      reverbLevel: 1.1,
    }),
  });
}

/**
 * The running order for `bars` bars: a turnaround in, verses and refrains (always ending
 * on a refrain), a turnaround out. Short tracks are the end of a refrain.
 */
function form(bars: number, rng: Rng): PlannedSection[] {
  const out: PlannedSection[] = [];
  let intro = bars >= 14 ? 2 : 0;
  let outro = bars >= 6 ? 2 : bars >= 3 ? 1 : 0;
  if (intro + outro >= bars) intro = 0;
  if (outro >= bars) outro = 0;
  const body = bars - intro - outro;
  const parts: { part: string; bars: number }[] = [];
  let left = body;
  let next: 'R' | 'V' = 'R';
  let verses = 0;
  while (left >= 8) {
    parts.unshift({ part: next, bars: 8 });
    left -= 8;
    if (next === 'V') verses++;
    next = next === 'R' ? 'V' : 'R';
  }
  if (left > 0) parts.unshift({ part: next, bars: left });
  // In a long night, one verse goes to the fiddle.
  if (verses >= 3) {
    const vs = parts.filter((p) => p.part === 'V' && p.bars === 8);
    vs[rng.int(1, vs.length - 1)]!.part = 'I';
  }
  let bar = 0;
  const counts: Record<string, number> = {};
  const push = (part: string, n: number) => {
    const repeat = counts[part] ?? 0;
    counts[part] = repeat + 1;
    out.push({ name: part, part, repeat, startBar: bar, bars: n });
    bar += n;
  };
  if (intro) push('intro', intro);
  for (const p of parts) push(p.part, p.bars);
  if (outro) push('outro', outro);
  return out;
}

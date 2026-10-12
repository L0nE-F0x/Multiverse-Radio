// Ambient piano: a solo piano in a big empty room. Slow modal harmony that changes
// every two bars, a low note held under the pedal, short phrases that come back a
// little changed each time, and silence: whole bars left empty for the room to answer.
// Now and then one high note is left hanging. Ends on a slowly rolled chord.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord, type Chord, type ScaleName } from '../theory';
import { bassNote, chordAt, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, type ChordSpan, type MotifNote } from './common';
import { bpmFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';

const MAJOR: { prog: string; scale: ScaleName }[] = [
  { prog: 'Imaj7 Imaj7 IVmaj7#11 IVmaj7#11', scale: 'lydian' },
  { prog: 'vi9 vi9 IVmaj7 IVmaj7 Iadd9 Iadd9 V9sus V9sus', scale: 'major' },
  { prog: 'Iadd9 Iadd9 iii7 iii7 vi9 vi9 IVmaj7#11 IVmaj7#11', scale: 'major' },
  { prog: 'IVmaj9 IVmaj9 Imaj9 Imaj9', scale: 'major' },
  { prog: 'Imaj9 Imaj9 II/I II/I', scale: 'lydian' },
];
const MINOR: { prog: string; scale: ScaleName }[] = [
  { prog: 'i9 i9 bVImaj7 bVImaj7 bIIImaj7 bIIImaj7 bVII6 bVII6', scale: 'minor' },
  { prog: 'i9 i9 iv9 iv9', scale: 'dorian' },
  { prog: 'i9 i9 bVImaj7 bVImaj7', scale: 'minor' },
  { prog: 'iv9 iv9 i9 i9 bVImaj7 bVImaj7 v9 v9', scale: 'minor' },
  { prog: 'i9 i9 IV9 IV9', scale: 'dorian' },
];

export function composeAmbientPiano(req: TrackRequest): Score {
  const S = streams(req, 'ambient-piano');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 56, density: 0.35, grit: 0.05, weirdness: 0.05, brightness: 0.4 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.55);
  const tonic = tonicFor(S);
  const tpl = song.pick(minor ? MINOR : MAJOR);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [48, 64]);
  const tail = Math.min(6, Math.max(1.5, req.durationSeconds * 0.06));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.08);
  const plan = planForm(fit.bars, fit.bars >= 8 ? 1 : 0, fit.bars >= 6 ? 2 : fit.bars >= 3 ? 1 : 0, [{ part: 'A', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }, { part: 'S', bars: 2 }]);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks, 2);
  const beat = b.beat;

  const lh = b.inst({ kind: 'sample', patch: 'hall-piano', name: 'Piano, left hand', gain: 0.62, pan: -0.12, reverb: 0.35, lowpass: lerp(2500, 5000, B) });
  const rh = b.inst({ kind: 'sample', patch: 'hall-piano', name: 'Piano, right hand', gain: 0.72, pan: 0.12, reverb: 0.4, lowpass: lerp(4000, 9000, B) });
  const air = style.chance(0.5) ? b.inst({ kind: 'sample', patch: 'hiss', name: 'Room tone', gain: 0.05, lowpass: 3000 }) : -1;

  // The material: two cells that keep returning, and how much air to leave around them.
  const sparse = lerp(0.55, 0.25, D);
  const motifA = phrase(S, 'empty-room-a', 8, 0.15 + D * 0.25, { restTail: 2, maxNotes: 3, maxLeap: 4 });
  const motifB = phrase(S, 'empty-room-b', 8, 0.12 + D * 0.2, { restTail: 2.5, maxNotes: 3, maxLeap: 5 });
  const register = style.range(68, 76);
  const lo = Math.round(register - 8);
  const hi = Math.round(register + 10);
  let lhV: number[] | null = null;
  let prevBass: number | null = null;
  let chordIndex = 0;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const silence = s.part === 'S';
    let spans = chordSpans(prog, s, b, chordIndex);
    chordIndex += s.bars;
    if (outro) spans = finalChord(b, s, tonic, minor);
    b.section({ ...s, name: silence ? 'space' : s.name }, spans.map((x) => x.chord), flats);

    // ── Left hand: a low root under the pedal, an open fifth or tenth above it ──
    let k = 0;
    while (k < spans.length) {
      const span = spans[k]!;
      let j = k + 1;
      while (j < spans.length && spans[j]!.chord === span.chord) j++;
      const end = j < spans.length ? spans[j]!.t : b.grid.bar(s.startBar + s.bars);
      const t = span.t + song.range(0, 0.06);
      const last = outro && j >= spans.length;
      if (silence && k > 0) break;
      const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
      prevBass = root;
      lhV = voiceChord(span.chord, lhV, { low: 50, high: 64, voices: 2, rootless: true, maxSpan: 10 });
      const hold = last ? b.end - t - 0.2 : silence ? b.beat * 3 : end - t + 0.4;
      if (last) {
        // A slow roll from the bottom of the piano to the top of the chord.
        const roll = [root - (root >= 36 ? 12 : 0), root, ...lhV, ...tonesUp(span.chord, lhV[lhV.length - 1]! + 1, hi + 2, 3)];
        roll.forEach((p, n) => b.note(n < 2 + lhV!.length ? lh : rh, t + n * song.range(0.22, 0.34), Math.max(0.5, hold - n * 0.3), p, vel(song, 0.34 + (n === roll.length - 1 ? 0.08 : 0), 0.03)));
        k = j;
        continue;
      }
      b.note(lh, t, hold, root, vel(song, 0.42, 0.04));
      if (song.chance(0.5)) b.note(lh, t, hold, root + 12, vel(song, 0.3, 0.03));
      lhV.forEach((p, n) => b.note(lh, t + beat * (n + 1) * song.range(0.5, 0.9), hold - beat * (n + 1) * 0.7, p, vel(song, 0.3, 0.04)));
      k = j;
    }

    // ── Right hand: the cells, with rests between them ──
    if (intro || outro || silence) continue;
    for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
      const idx = ph / 2;
      if (idx > 0 && song.chance(sparse)) {
        // Rest: or just one high note left hanging.
        if (song.chance(0.35)) {
          const t = b.grid.at(s.startBar + ph, song.pick([0, 1, 1.5, 2]));
          const p = nearestInSet(Math.round(hi + song.range(-2, 5)), chordPcs(chordAt(spans, t + 0.01).chord));
          b.note(rh, t, b.fit.barDur * 1.8, p, vel(song, 0.26, 0.04));
        }
        continue;
      }
      const base = s.part === 'B' ? motifB : motifA;
      const cell: MotifNote[] = s.repeat > 0 || idx > 1 ? varyMotif(song, base, 0.4) : base;
      playCell(b, song, rh, cell, spans, keyScale, s.startBar + ph, lo, hi);
    }
  }

  if (air >= 0) b.note(air, 0, b.end, 60, 1);
  const cut = lerp(3500, 9000, B);
  b.auto('cutoff', 0, cut, 0);

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({
      gain: 1.253,
      lowpass: cut,
      highpass: 30,
      wow: 0.2 + G * 1.2 + W * 0.8,
      wowRate: 0.25,
      flutter: 0,
      drive: G * 0.2,
      reverbTone: 4200,
      reverbLevel: 1.7,
    }),
  });
}

/** A cell, held under the pedal: every note rings into the next and well past it. */
function playCell(b: ScoreBuilder, rng: Rng, inst: number, cell: readonly MotifNote[], spans: readonly ChordSpan[], keyScale: readonly number[], bar: number, lo: number, hi: number): void {
  const notes = realizeMotif(cell, 0, b.beat, Math.round((lo + hi) / 2), spans, keyScale, lo, hi, b.grid, bar);
  const end = b.grid.bar(bar + 2) + b.beat * 2;
  notes.forEach((n, j) => {
    const t = n.t + rng.range(-0.03, 0.05) + j * 0.015;
    b.note(inst, t, Math.max(n.d * 1.5, end - t), n.p, vel(rng, n.strong ? 0.4 : 0.33, 0.05));
  });
}

/** Chord tones above `from`, at most `count`. */
function tonesUp(c: Chord, from: number, to: number, count: number): number[] {
  const pcs = chordPcs(c);
  const out: number[] = [];
  for (let n = from; n <= to && out.length < count; n++) if (pcs.includes(((n % 12) + 12) % 12)) out.push(n);
  return out;
}

function finalChord(b: ScoreBuilder, s: { startBar: number; bars: number }, tonic: number, minor: boolean): ChordSpan[] {
  const home = minor ? chord(tonic, 'madd9') : chord(tonic, 'maj9');
  const t = b.grid.bar(s.startBar);
  return [{ chord: home, t, dur: b.end - t, bar: s.startBar, beat: 0, beats: s.bars * 4 }];
}

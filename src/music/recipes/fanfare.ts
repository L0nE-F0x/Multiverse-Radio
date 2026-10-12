// Sports fanfare (v3 rework): an orchestral brass fanfare rather than synth brass. A horn
// call opens it (rising through the triad over a timpani roll), trumpets answer in
// triplet-pickup figures over open-voiced chords, trombones underneath. Then it backs off
// for the commentary: horns and low strings hold soft chords, a light side drum keeps a
// march going, and every eight bars the trumpets remind you, quietly, that this is sport.
// The finale returns to full brass with a held chord, a timpani roll and a cymbal.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, stepInSet, voiceChord, type Chord } from '../theory';
import { bedForm, feel, ramp, sentence } from './beds-kit';
import { bassNote, chordAt, chordSpans, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, type ChordSpan } from './common';
import { FANFARE } from './templates';

export function composeFanfare(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'sports-fanfare');
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.5, grit: 0.1, weirdness: 0.15, brightness: 0.6 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(FANFARE);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [108, 126]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'B'], intro: [1, 2, 4], outro: [1, 2, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  // Two trumpet desks (slightly apart in tuning, time and space) make a section, not a synth.
  const tpt1 = b.inst({ kind: 'synth', patch: 'fanfare-trumpet', name: 'Trumpets I', gain: 0.4, pan: -0.2, reverb: 0.35, detune: 3 });
  const tpt2 = b.inst({ kind: 'synth', patch: 'fanfare-trumpet', name: 'Trumpets II', gain: 0.3, pan: 0.22, reverb: 0.35, detune: -4 });
  const horns = b.inst({ kind: 'synth', patch: 'fanfare-horn', name: 'Horns', gain: 0.42, pan: 0.1, reverb: 0.45 });
  const bones = b.inst({ kind: 'synth', patch: 'trombone', name: 'Trombones', gain: 0.4, pan: -0.05, reverb: 0.35 });
  const strings = b.inst({ kind: 'synth', patch: 'pad-strings', name: 'Low strings', gain: 0.14, reverb: 0.35, lowpass: 1400 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.55, reverb: 0.35 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-march', name: 'Side drum', gain: 0.24, pan: 0.15, reverb: 0.2 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbals', gain: 0.2, reverb: 0.35 });
  const glock = b.inst({ kind: 'sample', patch: 'glockenspiel', name: 'Glockenspiel', gain: 0.14, pan: 0.3, reverb: 0.35 });

  const f1 = feel(rng, 0, 6);
  const f2 = feel(rng, 9, 8);
  const timpPitch = (pcValue: number) => bassNote(pcValue, null, 40, 52) + 19; // the sample is G2
  const theme = makeMotif(rng, 8, 0.4 + D * 0.2, { restTail: 2, minNotes: 3, maxNotes: 4, maxLeap: 4 });
  const call = rng.pick([
    [-3, 0, 2, 4], // sol do mi sol
    [0, 2, 4, 7], // do mi sol do
    [-3, 0, 4, 2], // sol do sol mi
  ]);
  let hornV: number[] | null = null;
  let boneV: number[] | null = null;

  const brassChord = (span: ChordSpan | { chord: Chord; t: number }, len: number, v: number, withTrumpets: boolean) => {
    hornV = voiceChord(span.chord, hornV, { low: 53, high: 69, voices: 3, rootless: false, maxSpan: 14 });
    for (const p of hornV) b.note(horns, span.t, len, p, vel(rng, v, 0.03));
    boneV = voiceChord(span.chord, boneV, { low: 40, high: 57, voices: 2, rootless: false });
    for (const p of [bassNote(bassPc(span.chord), null, 36, 48), ...boneV.slice(1)]) b.note(bones, span.t, len, p, vel(rng, v * 0.95, 0.03));
    if (withTrumpets) {
      // Trumpets on the top of an open voicing: fifth and root (or third) above the horns.
      const top = nearestInSet(Math.max(...hornV) + 5, chordPcs(span.chord));
      b.note(tpt1, f1(span.t), len, top, vel(rng, v, 0.03));
      b.note(tpt2, f2(span.t), len, nearestInSet(top - 4, chordPcs(span.chord)), vel(rng, v * 0.9, 0.03));
    }
  };
  /** Triplet pickup into a long note: the heroic "da-da-da DAAA". */
  const flourish = (t: number, target: number, c: Chord, v: number, hold: number) => {
    const pick = nearestInSet(target - 3, chordPcs(c));
    for (let j = 0; j < 3; j++) {
      b.note(tpt1, f1(t - beat + (j * beat) / 3), beat / 3.3, j === 2 ? pick : nearestInSet(pick - 5, chordPcs(c)), vel(rng, v * 0.85, 0.03));
      b.note(tpt2, f2(t - beat + (j * beat) / 3), beat / 3.3, nearestInSet((j === 2 ? pick : nearestInSet(pick - 5, chordPcs(c))) - 4, chordPcs(c)), vel(rng, v * 0.75, 0.03));
    }
    b.note(tpt1, f1(t), hold, target, vel(rng, v, 0.03));
    b.note(tpt2, f2(t), hold, nearestInSet(target - 4, chordPcs(c)), vel(rng, v * 0.9, 0.03));
  };
  const roll = (from: number, to: number, pitch: number, v0: number, v1: number) => {
    const n = Math.max(2, Math.floor((to - from) / 0.07));
    for (let j = 0; j < n; j++) b.hit(timp, from + (j * (to - from)) / n, ramp(j, n, v0, v1), pitch, 1.4);
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? chord(tonic, '') : chord(tonic + (tpl.scale === 'mixolydian' ? 10 : 7), '')));
    b.section({ ...s, name: intro ? 'fanfare' : outro ? 'finale' : s.name }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);

    if (intro) {
      // The horn call over a timpani roll, then the brass answers chord by chord.
      const callBars = Math.max(1, Math.floor(s.bars / 2));
      roll(sT, sT + callBars * fit.barDur - beat * 0.5, timpPitch(tonic + 7), 0.15, 0.6);
      const step = (callBars * 4 * beat) / call.length;
      call.forEach((st, j) => {
        const p = stepInSet(tonic + 60, keyScale, st);
        const len = j === call.length - 1 ? step * 1.6 : step * 0.9;
        b.note(horns, sT + j * step, len, p, 0.7 + j * 0.05);
        b.note(bones, sT + j * step, len, p - 12, 0.55 + j * 0.05);
      });
      const answer = spans.filter((sp) => sp.bar >= s.startBar + callBars);
      answer.forEach((sp, k) => {
        if (k === 0) {
          b.hit(crash, sp.t, 0.8, 60, 3);
          for (let j = 0; j < 8; j++) b.hit(snare, sp.t - beat + j * beat * 0.125, 0.3 + j * 0.06);
        }
        b.hit(timp, sp.t, 0.8, timpPitch(bassPc(sp.chord)));
        brassChord(sp, sp.dur * 0.9, 0.78, false);
        flourish(sp.t + (k === 0 ? 0 : beat), nearestInSet(76 + k, chordPcs(sp.chord)), sp.chord, 0.8, beat * (k === 0 ? 2.6 : 1.8));
      });
      if (!answer.length) b.hit(crash, sEnd, 0.6, 60, 3);
      continue;
    }

    if (outro) {
      spans.forEach((sp, k) => {
        const last = k === spans.length - 1;
        const len = last ? b.end - sp.t - 0.6 : sp.dur * 0.9;
        if (k === 0) for (let j = 0; j < 8; j++) b.hit(snare, sp.t - beat + j * beat * 0.125, 0.3 + j * 0.06);
        brassChord(sp, len, last ? 0.85 : 0.75, true);
        if (last) {
          flourish(sp.t, nearestInSet(79, chordPcs(sp.chord)), sp.chord, 0.88, len);
          b.hit(crash, sp.t, 0.85, 60, 3);
          roll(sp.t, Math.min(sp.t + beat * 3, b.end - 1), timpPitch(tonic), 0.35, 0.75);
          b.hit(timp, Math.min(sp.t + beat * 3, b.end - 1), 0.85, timpPitch(tonic));
        } else b.hit(timp, sp.t, 0.7, timpPitch(bassPc(sp.chord)));
      });
      continue;
    }

    // Under the commentary: soft horns and low strings, a light march on the side drum.
    let strV: number[] | null = null;
    spans.forEach((span) => {
      hornV = voiceChord(span.chord, hornV, { low: 53, high: 67, voices: 3, rootless: false });
      for (const p of hornV) b.note(horns, span.t, span.dur * 0.98, p, vel(rng, s.part === 'B' ? 0.42 : 0.36, 0.03));
      strV = voiceChord(span.chord, strV, { low: 40, high: 55, voices: 2, rootless: false });
      for (const p of strV) b.note(strings, span.t, span.dur + 0.15, p, 0.45);
    });
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      const pattern = D > 0.5 ? [0, 0.5, 1, 1.75, 2, 2.5, 3, 3.5] : [0, 1, 1.75, 2, 3];
      for (const x of pattern) b.hit(snare, b.grid.at(bar, x), vel(rng, x % 1 === 0 ? 0.32 : 0.22, 0.04));
      if (k % 4 === 0) b.hit(timp, b.grid.bar(bar), 0.45, timpPitch(bassPc(chordAt(spans, b.grid.bar(bar) + 0.01).chord)));
    }
    // Every eight bars, a quiet reminder from the trumpets at the end of the phrase.
    for (let k = 7; k < s.bars; k += 8) {
      const t = b.grid.at(s.startBar + k, 2);
      const c = chordAt(spans, t + 0.01).chord;
      flourish(t, nearestInSet(74, chordPcs(c)), c, 0.5, beat * 1.6);
    }
    // The theme, high and light on the glockenspiel, in B only.
    if (s.part === 'B') {
      const cells = sentence(rng, theme, 8, s.repeat);
      for (let c = 0; c * 2 + 2 <= s.bars; c += 2) {
        for (const n of realizeMotif(cells[c / 2 % 4]!, 0, beat, 88, spans, keyScale, 84, 98, b.grid, s.startBar + c)) b.note(glock, n.t, n.d + beat, n.p, vel(rng, 0.5));
      }
    }
  }
  void W;
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.78, lowpass: lerp(7000, 14000, B), highpass: 35, wow: 0, wowRate: 0.4, flutter: 0, drive: 0.04, reverbTone: 6000, reverbLevel: 1.3 }),
  });
}

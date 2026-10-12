// Polka: a brisk 2/4 oom-pah. Tuba on the beats, accordion on the off-beats, a busy
// clarinet (or accordion) tune, a trio strain in the subdominant. In mirrored
// dimensions the second strain is the first one upside down.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, shiftMotif, trackFx, varyMotif, vel, type MotifNote } from './common';
import { POLKA } from './templates';

export function composePolka(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'polka');
  const tweaks = resolveTweaks(req, { bpm: 124, density: 0.65, grit: 0.25, weirdness: 0.25, brightness: 0.55 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tplA = rng.pick(POLKA);
  let tplB = rng.pick(POLKA);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(POLKA);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  // The trio: same idea, a fourth up.
  const progT = parseProgression(rng.pick(POLKA).prog, tonic + 5);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [112, 136]);
  const { fit, plan } = layout(req, bpm, 2, { unit: 16, pattern: ['A', 'B', 'A', 'T'], intro: 4, outro: 2 });
  const b = new ScoreBuilder(req.recipe, req, fit, 2, 0.5, tweaks, 2);
  const beat = b.beat;

  const tuba = b.inst({ kind: 'synth', patch: 'tuba', name: 'Tuba', gain: 0.75, pan: -0.05 });
  const squeeze = b.inst({ kind: 'synth', patch: 'accordion', name: 'Accordion', gain: 0.5, pan: -0.25, reverb: 0.12 });
  const clarinetLead = rng.chance(0.55);
  const lead = b.inst({ kind: 'synth', patch: clarinetLead ? 'clarinet' : 'accordion', name: clarinetLead ? 'Clarinet' : 'Accordion lead', gain: clarinetLead ? 0.6 : 0.45, pan: 0.2, reverb: 0.15 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Bass drum', gain: 0.25 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-march', name: 'Snare', gain: 0.4, pan: 0.1, reverb: 0.1 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbal', gain: 0.18, pan: 0.2 });

  const motifA = makeMotif(rng, 4, 0.6 + D * 0.4, { grid: 0.25, restTail: 0.5, minNotes: 4, maxNotes: 7, maxLeap: 4 });
  const motifB = makeMotif(rng, 4, 0.5 + D * 0.4, { grid: 0.25, restTail: 0.5, minNotes: 4, maxNotes: 7 });
  const motifT = makeMotif(rng, 4, 0.3 + D * 0.3, { grid: 0.5, restTail: 0.5, minNotes: 2, maxNotes: 4 });
  const mirror = (m: MotifNote[]): MotifNote[] => m.map((n) => ({ ...n, step: -n.step }));
  const mirrored = W > 0.15 && rng.chance(0.4 + W);
  const seqStep = rng.pick([1, -1, 2]);
  let voicing: number[] | null = null;
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const trio = s.part === 'T';
    let prog = trio ? progT : s.part === 'B' ? progB : progA;
    if (intro) prog = parseProgression('I I V7 V7', tonic);
    const spans = chordSpans(prog, s, b);
    if (outro) {
      spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 ? chord(tonic, '') : chord(tonic + 7, '7')));
    }
    b.section({ ...s, name: trio ? `trio${s.repeat ? '′' : ''}` : s.name }, spans.map((x) => x.chord), flats);
    const keyTonic = trio ? tonic + 5 : tonic;
    const keyScale = scalePcs(keyTonic, SCALES.major);
    if (!intro) b.hit(crash, b.grid.bar(s.startBar), 0.6, 60, 2.5);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
      prevBass = root;
      const fifth = root - 5 >= 28 ? root - 5 : root + 7;
      voicing = voiceChord(span.chord, voicing, { low: 57, high: 72, voices: 3, rootless: false });
      if (last) {
        // The button: one short tutti chord.
        b.note(tuba, span.t, beat * 0.5, root, 0.9);
        for (const p of voicing) b.note(squeeze, span.t, beat * 0.5, p, 0.8);
        b.note(lead, span.t, beat * 0.5, voicing[voicing.length - 1]! + 12, 0.8);
        b.hit(kick, span.t, 0.9);
        b.hit(crash, span.t, 0.8, 60, 2.5);
        return;
      }
      // Oom (tuba on the beats, root then fifth) – pah (accordion on the off-beats).
      b.note(tuba, b.grid.at(span.bar, 0), beat * 0.45, root, vel(rng, 0.85, 0.04));
      b.note(tuba, b.grid.at(span.bar, 1), beat * 0.45, fifth, vel(rng, 0.75, 0.04));
      for (const off of [0.5, 1.5]) {
        for (const p of voicing) b.note(squeeze, b.grid.at(span.bar, off), beat * 0.32, p, vel(rng, 0.62, 0.04));
        if (!intro) b.hit(snare, b.grid.at(span.bar, off), vel(rng, 0.45, 0.06));
      }
      b.hit(kick, b.grid.at(span.bar, 0), vel(rng, 0.7));
      b.hit(kick, b.grid.at(span.bar, 1), vel(rng, 0.55));
    });

    // Melody: two-bar cells (four beats) in 16ths.
    if (!intro && !outro) {
      let base = s.part === 'B' ? (mirrored ? mirror(motifA) : motifB) : trio ? motifT : motifA;
      if (s.repeat > 0) base = varyMotif(rng, base, 0.3);
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const phrase = (ph / 2) % 4;
        const m = phrase === 1 ? shiftMotif(base, seqStep) : phrase === 2 ? varyMotif(rng, base, 0.5) : phrase === 3 ? base.slice(0, Math.max(2, Math.ceil(base.length / 2))) : base;
        for (const n of realizeMotif(m, 0, beat, 79, spans, keyScale, 67, 89, b.grid, s.startBar + ph)) {
          b.note(lead, n.t, Math.min(n.d, beat * (trio ? 1.5 : 0.6)), n.p, vel(rng, n.strong ? 0.75 : 0.62, 0.04));
        }
      }
    }
  }

  return b.build({
    key: keyName(tonic, 'major'),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.56,
      lowpass: lerp(5500, 12000, B) * (1 - G * 0.25),
      highpass: 45,
      wow: G * 2 + W * 1.5,
      wowRate: 0.55,
      flutter: G * 0.08,
      drive: 0.1 + G * 0.35,
      reverbTone: 5000,
      reverbLevel: 0.8,
    }),
  });
}

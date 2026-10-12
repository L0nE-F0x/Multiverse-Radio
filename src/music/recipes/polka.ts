// Polka: a brisk 2/4 oom-pah. Tuba on the beats (root, fifth, and a walk-up into each
// new strain), accordion and side drum on the off-beats, a clarinet (or accordion) tune.
// Strains are sixteen bars long and built like real tunes: two eight-bar sentences, the
// first ending open, the second coming home; repeats are ornamented differently each
// time. A stop-time break now and then, a trio in the subdominant where the accordion
// takes the tune and the clarinet decorates above it. In mirrored dimensions the second
// strain is the first one upside down.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, stepInSet, voiceChord } from '../theory';
import { feel, sentence } from './beds-kit';
import { bassNote, chordAt, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, type MotifNote } from './common';
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

  const tuba = b.inst({ kind: 'synth', patch: 'band-tuba', name: 'Tuba', gain: 0.62, pan: -0.05, reverb: 0.08 });
  const squeeze = b.inst({ kind: 'synth', patch: 'accordion', name: 'Accordion', gain: 0.42, pan: -0.25, reverb: 0.12 });
  const clarinetLead = rng.chance(0.6);
  const lead = b.inst({
    kind: 'synth',
    patch: clarinetLead ? 'polka-clarinet' : 'accordion',
    name: clarinetLead ? 'Clarinet' : 'Accordion lead',
    gain: clarinetLead ? 0.42 : 0.4,
    pan: 0.2,
    reverb: 0.15,
  });
  // In the trio the other voice takes over: accordion tune, clarinet decorations (or vice versa).
  const trioLead = b.inst({ kind: 'synth', patch: clarinetLead ? 'accordion' : 'polka-clarinet', name: clarinetLead ? 'Accordion (trio)' : 'Clarinet (trio)', gain: 0.38, pan: -0.15, reverb: 0.15 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Bass drum', gain: 0.28 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-march', name: 'Snare', gain: 0.32, pan: 0.1, reverb: 0.1 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbal', gain: 0.16, pan: 0.2 });

  // The groove: the pah is short and a hair early, the oom sits back.
  const fOom = feel(rng, 6, 5);
  const fPah = feel(rng, -6, 4);
  const cellBeats = 4; // two bars of 2/4
  const motifA = makeMotif(rng, cellBeats, 0.6 + D * 0.4, { grid: 0.25, restTail: 0.5, minNotes: 4, maxNotes: 7, maxLeap: 4 });
  const motifB = makeMotif(rng, cellBeats, 0.5 + D * 0.4, { grid: 0.25, restTail: 0.5, minNotes: 4, maxNotes: 7 });
  const motifT = makeMotif(rng, cellBeats, 0.3 + D * 0.3, { grid: 0.5, restTail: 0.5, minNotes: 2, maxNotes: 4 });
  const mirror = (m: MotifNote[]): MotifNote[] => m.map((n) => ({ ...n, step: -n.step }));
  const mirrored = W > 0.15 && rng.chance(0.4 + W);
  let voicing: number[] | null = null;
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const trio = s.part === 'T';
    let prog = trio ? progT : s.part === 'B' ? progB : progA;
    if (intro) prog = parseProgression('I I V7 V7', tonic);
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 ? chord(tonic, '') : chord(tonic + 7, '7')));
    b.section({ ...s, name: trio ? `trio${s.repeat ? '′' : ''}` : s.name }, spans.map((x) => x.chord), trio ? prefersFlats(tonic + 5, false) : flats);
    const keyTonic = trio ? tonic + 5 : tonic;
    const keyScale = scalePcs(keyTonic, SCALES.major);
    if (!intro) b.hit(crash, b.grid.bar(s.startBar), 0.6, 60, 2.5);
    // A stop-time break near the end of a strain: everyone hits one, the tune plays alone.
    const breakBar = !intro && !outro && s.bars >= 16 && rng.chance(0.45) ? s.startBar + s.bars - 2 : -1;

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
      if (span.bar === breakBar) {
        b.note(tuba, span.t, beat * 0.4, root, 0.9);
        for (const p of voicing) b.note(squeeze, span.t, beat * 0.3, p, 0.8);
        b.hit(kick, span.t, 0.85);
        b.hit(snare, span.t, 0.6);
        return;
      }
      if (span.bar === breakBar + 1) return;
      // Oom (tuba on the beats, root then fifth) – pah (accordion and snare on the off-beats).
      const nextChord = spans[k + 1]?.chord;
      const walk = !intro && nextChord && nextChord.root !== span.chord.root && (span.bar - s.startBar) % 4 === 3 && rng.chance(0.5 + D * 0.3);
      b.note(tuba, fOom(b.grid.at(span.bar, 0)), beat * 0.42, root, vel(rng, 0.86, 0.04));
      if (walk) {
        // Walk up (or down) into the next chord in eighths.
        const target = bassNote(bassPc(nextChord!), root, 31, 47);
        const dir = target >= root ? 1 : -1;
        const a = stepInSet(target, keyScale, -dir * 2);
        const c = stepInSet(target, keyScale, -dir);
        b.note(tuba, fOom(b.grid.at(span.bar, 1)), beat * 0.4, a, vel(rng, 0.72));
        b.note(tuba, fOom(b.grid.at(span.bar, 1.5)), beat * 0.4, c, vel(rng, 0.72));
      } else {
        b.note(tuba, fOom(b.grid.at(span.bar, 1)), beat * 0.42, fifth, vel(rng, 0.76, 0.04));
      }
      for (const off of [0.5, 1.5]) {
        const accent = off === 1.5 ? 0.66 : 0.6;
        for (const p of voicing) b.note(squeeze, fPah(b.grid.at(span.bar, off)), beat * 0.28, p, vel(rng, accent, 0.04));
        if (!intro) b.hit(snare, fPah(b.grid.at(span.bar, off)), vel(rng, off === 1.5 ? 0.5 : 0.42, 0.05));
      }
      // Ghost notes on the snare in busy dimensions.
      if (!intro && D > 0.55 && rng.chance(0.35)) b.hit(snare, b.grid.at(span.bar, 1.75), vel(rng, 0.18));
      b.hit(kick, fOom(b.grid.at(span.bar, 0)), vel(rng, 0.7));
      b.hit(kick, fOom(b.grid.at(span.bar, 1)), vel(rng, 0.55));
    });

    if (intro || outro) {
      if (intro) {
        // A pickup flourish into the first strain.
        const end = b.grid.bar(s.startBar + s.bars);
        [4, 2, 1, 0].forEach((st, j) => b.note(lead, end - beat + (j * beat) / 4, beat / 4.5, stepInSet(tonic + 72, scalePcs(tonic, SCALES.major), st - 4 + j), 0.65));
      }
      continue;
    }

    // The tune: two sentences per strain (the first open, the second home), ornamented.
    const voice = trio ? trioLead : lead;
    const base = s.part === 'B' ? (mirrored ? mirror(motifA) : motifB) : trio ? motifT : motifA;
    const cells = Math.floor(s.bars / 2);
    const plans: MotifNote[][][] = [];
    for (let c = 0; c < cells; c++) {
      const half = Math.floor(c / 4);
      const plan4 = (plans[half] ??= sentence(rng, base, cellBeats, s.repeat * 2 + half, { open: half === 0 ? 4 : 1 }));
      const bar = s.startBar + c * 2;
      if (bar === breakBar) {
        // Alone in the break: a quick run down to the next downbeat.
        const top = nearestInSet(keyTonic + 79, chordPcs(chordAt(spans, b.grid.bar(bar) + 0.01).chord));
        [0, -1, -2, -3, -4, -3, -2, -1, 0, 1, 2, 4].forEach((st, j) => b.note(voice, b.grid.at(bar, 1 + j * 0.25), beat * 0.22, stepInSet(top, keyScale, st), vel(rng, j % 4 ? 0.58 : 0.68)));
        continue;
      }
      const notes = realizeMotif(plan4[c % 4]!, 0, beat, keyTonic + 76, spans, keyScale, trio ? 62 : 67, trio ? 81 : 89, b.grid, bar);
      notes.forEach((n) => {
        const d = Math.min(n.d, beat * (trio ? 1.5 : 0.6));
        // Grace notes on strong beats, the way polka players lean into them.
        const grace = clarinetLead !== trio && n.strong && rng.chance(0.3) ? { from: n.p + rng.pick([2, -1]), glide: 0.035 } : {};
        b.note(voice, n.t, d, n.p, vel(rng, n.strong ? 0.74 : 0.62, 0.04), grace);
      });
      // Trio: the other voice decorates above with trills and arpeggios.
      if (trio && c % 2 === 1) {
        const here = chordAt(spans, b.grid.bar(bar) + 0.01).chord;
        const top = nearestInSet(keyTonic + 79, chordPcs(here));
        const deco = rng.chance(0.5) ? [0, 1, 0, 1, 0, 1, 0, -1] : [-4, -2, 0, 2, 4, 2, 0, -2];
        deco.forEach((st, j) => b.note(lead, b.grid.at(bar, 2 + j * 0.25), beat * 0.22, stepInSet(top, keyScale, st), vel(rng, 0.5)));
      }
    }
  }

  return b.build({
    key: keyName(tonic, 'major'),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.68,
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

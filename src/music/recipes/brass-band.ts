// Brass band: the village band under the striped tent. Marches (2/4), hymns (4/4) and
// fête waltzes (3/4) for solo cornet, second cornet, tenor horns, euphonium, basses and a
// bass drum. Every player has their own feel: the cornet rushes, the basses drag, the bass
// drum is always a little behind, nobody is quite in tune with anybody else, and now and
// then a note cracks. Lovable, not chaotic: the leans are small and constant.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, stepInSet, voiceChord } from '../theory';
import { bedForm, feel, sentence } from './beds-kit';
import { bassNote, chordAt, chordSpans, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, type MotifNote } from './common';

type Style = 'march' | 'hymn' | 'waltz';

/** Strains: one chord per bar (marches in 2/4, waltzes in 3/4), two per bar in hymns. */
const STRAINS: Record<Style, string[]> = {
  march: ['I I V7 V7 V7 V7 I I', 'I IV I V7 I IV V7 I', 'I I IV IV V7 V7 I I', 'I vi ii V7 I vi V7 I'],
  waltz: ['I I V7 V7 V7 V7 I I', 'I I IV IV I V7 I I', 'I iii IV I ii V7 I I'],
  hymn: ['I+IV I+V vi+IV I+V', 'I+vi IV+V I+iii IV+V', 'I+V vi+iii IV+I ii+V', 'IV+I V+vi IV+V I+I'],
};

export function composeBrassBand(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'brass-band');
  const tweaks = resolveTweaks(req, { bpm: 108, density: 0.45, grit: 0.2, weirdness: 0.2, brightness: 0.45 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const style: Style = rng.weighted([['march', 55], ['hymn', 25], ['waltz', 20]] as const);
  const tonic = rng.pick([10, 3, 8, 5, 0, 1]); // brass keys: B♭, E♭, A♭, F, C, D♭
  const strainA = rng.pick(STRAINS[style]);
  let strainB = rng.pick(STRAINS[style]);
  for (let k = 0; k < 4 && strainB === strainA; k++) strainB = rng.pick(STRAINS[style]);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const meter = style === 'march' ? 2 : style === 'waltz' ? 3 : 4;
  const bpm = pickBpm(rng, req, style === 'march' ? [100, 116] : style === 'waltz' ? [132, 150] : [66, 80]);
  const unit = style === 'hymn' ? 8 : 16;
  const { fit, plan } = bedForm(req, bpm, meter, {
    unit,
    pattern: style === 'hymn' ? ['A', 'A', 'B', 'A'] : ['A', 'B', 'A', 'T'],
    intro: style === 'hymn' ? [1, 1, 2] : [1, 2, 2],
    outro: style === 'hymn' ? [1, 2, 2] : [1, 2, 2],
  });
  const b = new ScoreBuilder(req.recipe, req, fit, meter, 0.5, tweaks, 2);
  const beat = b.beat;

  // Tuning and timing are per player, constant for the whole fête.
  const sour = 0.5 + W;
  const solo = b.inst({ kind: 'synth', patch: 'band-cornet', name: 'Solo cornet', gain: 0.5, pan: -0.25, reverb: 0.3, detune: 7 * sour });
  const second = b.inst({ kind: 'synth', patch: 'band-cornet', name: 'Second cornet', gain: 0.3, pan: 0.3, reverb: 0.3, detune: -6 * sour });
  const horns = b.inst({ kind: 'synth', patch: 'band-horn', name: 'Tenor horns', gain: 0.28, pan: 0.15, reverb: 0.3, detune: 4 * sour, lowpass: 2400 });
  const euph = b.inst({ kind: 'synth', patch: 'band-horn', name: 'Euphonium', gain: 0.32, pan: -0.1, reverb: 0.3, detune: -9 * sour });
  const basses = b.inst({ kind: 'synth', patch: 'band-tuba', name: 'Basses', gain: 0.36, reverb: 0.15, detune: -11 * sour });
  const drum = b.inst({ kind: 'sample', patch: 'bass-drum', name: 'Bass drum', gain: 0.26, reverb: 0.25 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-march', name: 'Side drum', gain: 0.34, pan: 0.2, reverb: 0.2 });
  const cymbal = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbals', gain: 0.13, pan: -0.15, reverb: 0.3 });

  const lag = 0.6 + G * 0.8;
  const fSolo = feel(rng, -12 * lag, 10 * lag);
  const fSecond = feel(rng, 6 * lag, 12 * lag);
  const fHorns = feel(rng, 14 * lag, 12 * lag);
  const fEuph = feel(rng, -4 * lag, 10 * lag);
  const fBass = feel(rng, 24 * lag, 10 * lag);
  const fDrum = feel(rng, 30 * lag, 14 * lag);

  const cellBeats = style === 'hymn' ? 8 : meter * 2;
  const mk = (density: number): MotifNote[] =>
    style === 'hymn'
      ? makeMotif(rng, cellBeats, density * 0.5, { grid: 1, restTail: 1, minNotes: 3, maxNotes: 4, maxLeap: 2 })
      : makeMotif(rng, cellBeats, density, { grid: style === 'march' ? 0.25 : 0.5, restTail: 0.5, minNotes: 4, maxNotes: 7, maxLeap: 4 });
  const tuneA = mk(0.55 + D * 0.3);
  const tuneB = mk(0.45 + D * 0.3);
  const tuneT = mk(0.35 + D * 0.3);
  const counter = makeMotif(rng, cellBeats, 0.3, { grid: 1, restTail: 1, minNotes: 2, maxNotes: 3, maxLeap: 2 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  let cracks = 0;

  const play = (inst: number, f: (t: number) => number, t: number, d: number, p: number, v: number, extra = {}) => b.note(inst, f(t), d, p, vel(rng, v, 0.04), extra);

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const trio = s.part === 'T';
    const keyT = trio ? tonic + 5 : tonic;
    const sKeyScale = scalePcs(keyT, SCALES.major);
    let prog = parseProgression(s.part === 'B' ? strainB : strainA, keyT);
    if (intro) prog = parseProgression(style === 'hymn' ? 'V' : 'V7', tonic);
    const spans = chordSpans(prog, s, b);
    if (outro) {
      spans.forEach((sp, k) => {
        const final = k === spans.length - 1;
        sp.chord = style === 'hymn' ? (final ? chord(tonic, '') : chord(tonic + 5, '')) : final ? chord(tonic, '') : chord(tonic + 7, '7');
      });
    }
    b.section({ ...s, name: trio ? `trio${s.repeat ? '′' : ''}` : s.name }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const lastBarT = b.grid.bar(s.startBar + s.bars - 1);

    // Into each strain: a roll on the side drum (marches) and a cymbal.
    if (!intro && !outro && style !== 'hymn') {
      if (style === 'march') for (let j = 0; j < 8; j++) b.hit(snare, sT - beat + (j * beat) / 8, 0.25 + j * 0.05);
      b.hit(cymbal, fDrum(sT), 0.55, 60, 2.5);
    }

    spans.forEach((span, k) => {
      const final = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 34, 46);
      prevBass = root;
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 69, voices: 3, rootless: false });
      if (final) {
        // Everyone holds the last chord and lets go when they feel like it.
        const top = nearestInSet(tonic + 72, chordPcs(span.chord));
        const hold = (spread: number) => Math.max(0.4, b.end - span.t - 0.6 - rng.range(0, spread));
        const at = span.t;
        if (style === 'march') {
          // The stinger: one short tutti chord.
          play(solo, fSolo, at, beat * 0.5, top, 0.85);
          play(second, fSecond, at, beat * 0.5, voicing[voicing.length - 1]!, 0.75);
          for (const p of voicing) play(horns, fHorns, at, beat * 0.5, p, 0.75);
          play(euph, fEuph, at, beat * 0.5, root + 12, 0.75);
          play(basses, fBass, at, beat * 0.5, root, 0.85);
          b.hit(drum, fDrum(at), 0.85);
          b.hit(cymbal, fDrum(at), 0.75, 60, 2.5);
          return;
        }
        play(solo, fSolo, at, hold(0.5), top, 0.6);
        play(second, fSecond, at, hold(0.8), voicing[voicing.length - 1]!, 0.5);
        for (const p of voicing) play(horns, fHorns, at, hold(0.8), p, 0.55);
        play(euph, fEuph, at, hold(0.6), root + 12, 0.55);
        play(basses, fBass, at, hold(0.4), root, 0.6);
        b.hit(drum, fDrum(at), 0.4);
        return;
      }
      if (style === 'march') {
        // Oom-pah: basses on the beats, horns on the off-beats, bass drum on one.
        play(basses, fBass, span.t, beat * 0.55, root, 0.8);
        play(basses, fBass, b.grid.at(span.bar, 1), beat * 0.55, root - 5 >= 31 ? root - 5 : root + 7, 0.7);
        for (const x of [0.5, 1.5]) for (const p of voicing) play(horns, fHorns, b.grid.at(span.bar, x), beat * 0.35, p, 0.55);
        if (!intro) {
          b.hit(drum, fDrum(span.t), vel(rng, 0.7));
          for (const x of [0.5, 1.5]) if (rng.chance(0.7)) b.hit(snare, fDrum(b.grid.at(span.bar, x)), vel(rng, 0.35));
        }
      } else if (style === 'waltz') {
        play(basses, fBass, span.t, beat * 0.8, k % 2 ? (root - 5 >= 31 ? root - 5 : root + 7) : root, 0.8);
        for (const x of [1, 2]) for (const p of voicing) play(horns, fHorns, b.grid.at(span.bar, x), beat * 0.5, p, 0.5);
        if (!intro) {
          b.hit(drum, fDrum(span.t), vel(rng, 0.55));
          if (rng.chance(0.5)) b.hit(snare, fDrum(b.grid.at(span.bar, 1)), vel(rng, 0.28));
        }
      } else {
        // Hymn: sustained four-part harmony.
        for (const p of voicing) play(horns, fHorns, span.t, span.dur * 0.97, p, 0.5);
        play(basses, fBass, span.t, span.dur * 0.97, root, 0.6);
      }
    });

    if (intro) {
      // A pickup from the cornets into the first strain.
      const pick = [4, 2, 0].map((st) => stepInSet(tonic + 72, keyScale, st - 4));
      pick.forEach((p, j) => play(solo, fSolo, lastBarT + beat * (meter - 1) + (j * beat) / 3, beat / 3, p, 0.6));
      continue;
    }
    if (outro) continue;

    // The tune: sentences of four cells; the second half of a strain cadences home.
    const base = trio ? tuneT : s.part === 'B' ? tuneB : tuneA;
    const cellBars = cellBeats / meter;
    const cells = Math.floor(s.bars / cellBars);
    for (let c = 0; c < cells; c++) {
      const half = Math.floor(c / 4);
      const plan4 = sentence(rng, base, cellBeats, s.repeat + half, { open: half === 0 && cells > 4 ? 4 : 1 });
      const cell = plan4[c % 4]!;
      const bar = s.startBar + c * cellBars;
      // Under the vicar: the B strain gives some cells to the euphonium alone.
      const soloRests = s.part === 'B' && c % 2 === 1;
      const notes = realizeMotif(cell, 0, beat, keyT + 72, spans, sKeyScale, 67, 84, b.grid, bar);
      if (!soloRests) {
        for (const n of notes) {
          const crack = cracks < 1 + b.end / 120 && rng.chance(0.02 + W * 0.02);
          if (crack) cracks++;
          play(solo, fSolo, n.t, Math.min(n.d, beat * 2) * 0.92, n.p, n.strong ? 0.7 : 0.6, crack ? { from: n.p - 1.6, glide: 0.08 } : {});
          // Second cornet: a third below, on the chord where it matters.
          if (n.d >= beat * 0.45 || style === 'hymn') {
            const here = chordAt(spans, n.t + 0.01).chord;
            let low = stepInSet(n.p, sKeyScale, -2);
            if (n.strong) low = nearestInSet(low, chordPcs(here));
            if (low < n.p) play(second, fSecond, n.t, Math.min(n.d, beat * 2) * 0.9, low, 0.55);
          }
        }
      }
      // Euphonium: a slow counter-line in the B strain and the trio, or answering rests.
      if (soloRests || trio || (style === 'hymn' && s.part === 'B')) {
        for (const n of realizeMotif(counter, 0, beat, keyT + 55, spans, sKeyScale, 50, 65, b.grid, bar)) play(euph, fEuph, n.t, n.d * 0.95, n.p, 0.6);
      }
    }
  }
  return b.build({
    key: keyName(tonic, 'major'),
    progression: `${style}: ${strainA}`,
    fx: trackFx({ gain: 0.66, lowpass: lerp(4500, 9000, B), highpass: 40, wow: 0.3 + G, wowRate: 0.4, flutter: G * 0.03, drive: 0.05 + G * 0.15, reverbTone: 4500, reverbLevel: 1 }),
  });
}

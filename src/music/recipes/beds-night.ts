// Night beds for the v3 talk stations: slow harmony, long tails, a lot of air.
//   horoscope-bed – rippling harp arpeggios and glissandi over glassy pads and a drone
//   noir-bed      – a line-cliché minor progression: upright bass, brushes, rain on the
//                   window, a low piano and a straight-muted trumpet that speaks in the gaps
//   sleep-bed     – the softest pads, breathing slowly, with a music box that has almost
//                   finished winding down

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, chordScale, keyName, nearestInSet, notesInRange, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord, type Chord, type ScaleName } from '../theory';
import { bedForm, sentence } from './beds-kit';
import { bassNote, chordSpans, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';

// ── Horoscope ─────────────────────────────────────────────────────────────────

const HOROSCOPE: { prog: string; scale: ScaleName }[] = [
  { prog: 'Imaj7#11 II/I', scale: 'lydian' },
  { prog: 'Imaj9 bVIImaj7', scale: 'mixolydian' },
  { prog: 'i9 IV9', scale: 'dorian' },
  { prog: 'IVmaj7 Imaj7 iii7 vi9', scale: 'major' },
  { prog: 'iadd9 bVImaj7 bIIImaj7 bVII6', scale: 'minor' },
  { prog: 'Imaj9 vi9 IVmaj7#11 V9sus', scale: 'lydian' },
];
/** Stranger skies: whole-tone and lydian-dominant colours. */
const HOROSCOPE_WEIRD: { prog: string; scale: ScaleName }[] = [
  { prog: 'Iaug II/I', scale: 'wholeTone' },
  { prog: 'I7#11 bVII/I', scale: 'lydianDominant' },
];

export function composeHoroscope(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'horoscope-bed');
  const tweaks = resolveTweaks(req, { bpm: 66, density: 0.45, grit: 0.05, weirdness: 0.2, brightness: 0.5 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = W > 0.3 && rng.chance(W * 0.7) ? rng.pick(HOROSCOPE_WEIRD) : rng.pick(HOROSCOPE);
  // Two bars per chord: the stars move slowly.
  const prog = parseProgression(tpl.prog, tonic).flatMap((bar) => [bar, bar]);
  const minor = ['dorian', 'minor'].includes(tpl.scale);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, minor);
  const meter = rng.chance(0.6) ? 3 : 4;
  const bpm = pickBpm(rng, req, [58, 72]);
  const { fit, plan } = bedForm(req, bpm, meter, { unit: 8, pattern: ['A', 'B'], intro: [1, 2, 2], outro: [1, 2, 2], tail: Math.min(4, Math.max(1.2, req.durationSeconds * 0.03)) });
  const b = new ScoreBuilder(req.recipe, req, fit, meter, 0.5, tweaks, 2);
  const beat = b.beat;

  const harp = b.inst({ kind: 'sample', patch: 'concert-harp', name: 'Harp', gain: 0.36, pan: -0.15, reverb: 0.35 });
  const pad = b.inst({ kind: 'synth', patch: 'pad-glass', name: 'Glass pad', gain: 0.18, reverb: 0.5, lowpass: 2400, tremolo: { rate: 0.13, depth: 0.5 }, detune: weirdDetune(rng, W, 20) });
  const sparkle = b.inst({ kind: 'sample', patch: 'glass', name: 'Crystal', gain: 0.16, pan: 0.3, reverb: 0.6 });
  const drone = b.inst({ kind: 'synth', patch: 'drone', name: 'Drone', gain: 0.26 });

  const sweepUp = rng.chance(0.5);
  let padVoicing: number[] | null = null;
  const gliss = (t: number, span: { chord: Chord }, lo: number, hi: number, dur: number, up: boolean, v: number) => {
    // A harp glissando through the chord's scale (the pedals set to the harmony).
    const notes = notesInRange(chordScale(span.chord, keyScale), lo, hi);
    const seq = up ? notes : [...notes].reverse();
    const step = dur / seq.length;
    seq.forEach((p, j) => b.note(harp, t + j * step, beat * 2, p, vel(rng, v * (0.7 + (0.3 * j) / seq.length), 0.04)));
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b, s.part === 'B' ? 2 : 0);
    if (outro) spans.forEach((sp) => (sp.chord = parseProgression(tpl.prog, tonic)[0]![0]!));
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    b.note(drone, sT, sEnd - sT + (outro ? 0 : 0.6), bassNote(tonic, null, 36, 47), outro ? 0.4 : 0.5);
    if (!intro && rng.chance(0.75)) gliss(sT - beat * 0.9, spans[0]!, 60, 88, beat * 0.9, true, 0.45);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      padVoicing = voiceChord(span.chord, padVoicing, { low: 55, high: 72, voices: 4, rootless: false });
      if (!intro || k > 0) for (const p of padVoicing) b.note(pad, span.t, last ? b.end - span.t - 0.6 : span.dur + 0.4, p, 0.42);
      const tones = notesInRange(chordPcs(span.chord), 48, 84);
      if (last) {
        // Roll the final chord upwards and leave it ringing.
        tones.slice(0, 7).forEach((p, j) => b.note(harp, span.t + j * 0.09, b.end - span.t - 0.5, p, 0.45 + j * 0.03));
        b.note(sparkle, span.t + 0.7, beat * 4, nearestInSet(91, chordPcs(span.chord)), 0.5);
        return;
      }
      const startsChord = k === 0 || spans[k - 1]!.chord !== span.chord;
      if (s.part === 'B') {
        // Rippling triplets, quieter, with a bass note when the chord changes.
        if (startsChord) b.note(harp, span.t, beat * 3, bassNote(bassPc(span.chord), null, 36, 48), 0.55);
        const steps = span.beats * 3;
        const high = notesInRange(chordPcs(span.chord), 64, 84);
        for (let j = 0; j < steps; j++) {
          if (D < 0.4 && j % 3 === 1) continue;
          b.note(harp, span.t + (j * beat) / 3, beat * 1.5, high[(j * 2) % high.length]!, vel(rng, j % 3 ? 0.32 : 0.42, 0.05));
        }
        if (rng.chance(0.35 + D * 0.3)) b.note(sparkle, span.t + beat * rng.pick([1, 1.5, 2]), beat * 3, nearestInSet(rng.int(86, 96), chordPcs(span.chord)), vel(rng, 0.45));
        return;
      }
      // A: an arpeggio sweeping up through two octaves (and back down on the chord's second bar).
      const n = Math.round(span.beats * 2);
      const up = startsChord ? sweepUp : !sweepUp;
      const seq = up ? tones : [...tones].reverse();
      for (let j = 0; j < n; j++) {
        if (intro && j < n / 2) continue;
        const p = seq[Math.min(seq.length - 1, Math.floor((j * seq.length) / n))]!;
        b.note(harp, span.t + j * beat * 0.5, beat * 2, p, vel(rng, j === 0 ? 0.5 : 0.38, 0.05));
      }
    });
  }
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 1.2, lowpass: lerp(6000, 12000, B), highpass: 40, wow: W * 1.2, wowRate: 0.25, flutter: 0, drive: 0, reverbTone: 6000, reverbLevel: 1.4 }),
  });
}

// ── Noir ──────────────────────────────────────────────────────────────────────

const NOIR_A = ['i imaj7 i7 i6', 'i6 iv6 i6 V7b9', 'i bVI7 V7b9 i', 'i9 i9 iv9 V7#9'];
const NOIR_B = ['iv6 iv6 i6 i6', 'iiø7 V7b9 i6 i6', 'bVImaj7 bVImaj7 V7b9 V7b9', 'iv9 bVII9 bIIImaj7 V7b9'];

export function composeNoir(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'noir-bed');
  const tweaks = resolveTweaks(req, { bpm: 72, density: 0.45, grit: 0.25, weirdness: 0.1, brightness: 0.45 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const progA = parseProgression(rng.pick(NOIR_A), tonic);
  const progB = parseProgression(rng.pick(NOIR_B), tonic);
  const keyScale = scalePcs(tonic, SCALES.harmonicMinor);
  const blue = [...keyScale, pc(tonic + 6), pc(tonic + 10)];
  const flats = prefersFlats(tonic, true);
  const bpm = pickBpm(rng, req, [64, 78]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A'], intro: [1, 2, 2], outro: [1, 2, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.62, 0.66), tweaks, 2);
  const beat = b.beat;

  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Upright bass', gain: 0.55 });
  const brush = b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Brushes', gain: 0.38, pan: 0.15, reverb: 0.15 });
  const swish = b.inst({ kind: 'sample', patch: 'brush-swish', name: 'Brush sweeps', gain: 0.3, pan: 0.15 });
  const piano = b.inst({ kind: 'sample', patch: 'piano', name: 'Piano', gain: 0.3, pan: -0.2, reverb: 0.3, lowpass: 3200 });
  const horn = b.inst({ kind: 'synth', patch: 'harmon-trumpet', name: 'Muted trumpet', gain: 0.4, pan: 0.2, reverb: 0.35 });
  const vibes = b.inst({ kind: 'sample', patch: 'vibes', name: 'Vibraphone', gain: 0.22, pan: 0.3, reverb: 0.4, tremolo: { rate: 4.5, depth: 0.5 } });
  const rain = b.inst({ kind: 'sample', patch: 'rain', name: 'Rain', gain: 0.24 + G * 0.3 });

  const phrase = makeMotif(rng, 8, 0.3 + D * 0.25, { restTail: 2.5, minNotes: 3, maxNotes: 4, maxLeap: 3 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  let hornCount = 0;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(s.part === 'B' ? progB : progA, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? chord(tonic, 'mmaj7') : chord(tonic + 7, '7b9')));
    if (intro) spans.forEach((sp) => (sp.chord = chord(tonic, 'm6')));
    b.section(s, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
      voicing = voiceChord(span.chord, voicing, { low: 50, high: 66, voices: 4, rootless: true });
      if (last) {
        b.note(bass, span.t, beat * 4, root, 0.7);
        voicing.forEach((p, j) => b.note(piano, span.t + j * 0.06, b.end - span.t - 0.4, p, 0.42));
        b.note(piano, span.t + beat * 1.5, beat * 4, nearestInSet(86, chordPcs(span.chord)), 0.35);
        b.note(horn, span.t + beat * 0.5, Math.min(beat * 6, b.end - span.t - 1), nearestInSet(70, [pc(tonic + 2), pc(tonic + 7)]), 0.5, { from: nearestInSet(70, [pc(tonic + 2), pc(tonic + 7)]) - 1, glide: 0.18 });
        return;
      }
      // Bass: a two-feel in A, walking in B.
      if (s.part === 'B' && !intro) {
        const next = bassNote(bassPc((spans[k + 1] ?? span).chord), root, 31, 45);
        const scale = chordScale(span.chord, keyScale);
        const walk = [root, nearestInSet(root + 3, scale), nearestInSet(root + 7, chordPcs(span.chord)), next + (next > root ? -1 : 1)];
        walk.forEach((p, j) => b.note(bass, b.grid.at(span.bar, j), beat * 0.9, p, vel(rng, j === 0 ? 0.75 : 0.62)));
      } else {
        b.note(bass, span.t, beat * 1.8, root, vel(rng, 0.75));
        b.note(bass, b.grid.at(span.bar, 2), beat * 1.6, root + 7 <= 47 ? root + 7 : root - 5, vel(rng, 0.62));
        if (rng.chance(0.3)) b.note(bass, b.grid.at(span.bar, 3.5), beat * 0.5, root + 7 <= 47 ? root + 6 : root - 6, vel(rng, 0.5));
      }
      prevBass = root;
      // Piano: low, soft comping; now and then a drip from the top of the keyboard.
      if (!intro || k === spans.length - 1) {
        const at = rng.chance(0.3) ? b.grid.at(span.bar, 2.5) : span.t;
        voicing.forEach((p, j) => b.note(piano, at + j * 0.012, beat * 2.2, p, vel(rng, 0.36, 0.04)));
      }
      if (rng.chance(0.18 + D * 0.15)) b.note(piano, b.grid.at(span.bar, rng.pick([1.5, 2.5, 3.5])), beat * 2, nearestInSet(rng.int(84, 94), chordPcs(span.chord)), vel(rng, 0.3));
      if (s.part === 'B' && k % 2 === 0) for (const p of voiceChord(span.chord, null, { low: 62, high: 76, voices: 3 })) b.note(vibes, span.t + beat * 0.5, span.dur * 1.6, p, 0.4);
    });
    if (outro) continue;
    // Brushes: a sweep on every beat, taps on two and four, a ghost on the swung "and".
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      for (let x = 0; x < 4; x++) b.hit(swish, b.grid.at(bar, x), vel(rng, 0.4, 0.05), 60, 0.5);
      if (intro) continue;
      for (const x of [1, 3]) b.hit(brush, b.grid.at(bar, x), vel(rng, 0.55));
      if (rng.chance(0.5)) b.hit(brush, b.grid.at(bar, 2.5), vel(rng, 0.25));
    }
    // The trumpet: a phrase in the second half of every four bars, so the first half belongs to the voice.
    if (!intro) {
      const cells = sentence(rng, phrase, 8, s.repeat);
      for (let g = 0; g + 4 <= s.bars; g += 4) {
        if (!rng.chance(0.45 + D * 0.35) && hornCount > 0) continue;
        const cell = cells[(g / 4 + hornCount) % 4]!;
        const notes = realizeMotif(cell, 0, beat, 70, spans, blue, 62, 79, b.grid, s.startBar + g + 2);
        notes.forEach((n, j) => b.note(horn, n.t, n.d * 0.95, n.p, vel(rng, n.strong ? 0.55 : 0.48), j === 0 ? { from: n.p - 1, glide: 0.12 } : {}));
        hornCount++;
      }
    }
  }
  b.note(rain, 0, b.end, 60, 1);
  void W;
  return b.build({
    key: keyName(tonic, 'minor'),
    progression: 'line cliché',
    fx: trackFx({ gain: 0.59, lowpass: lerp(5000, 10000, B), highpass: 40, wow: 0.4 + G * 1.5, wowRate: 0.4, flutter: G * 0.04, drive: 0.06 + G * 0.2, reverbTone: 4500, reverbLevel: 1.1 }),
  });
}

// ── Sleep ─────────────────────────────────────────────────────────────────────

const SLEEP = ['I IV/I I V/I', 'Imaj7 IVmaj7', 'I vi IV I', 'Imaj9 IVmaj9 vi9 IVmaj9', 'Iadd9 IVadd9 Iadd9 Vsus4'];

export function composeSleep(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'sleep-bed');
  const tweaks = resolveTweaks(req, { bpm: 54, density: 0.3, grit: 0.05, weirdness: 0.1, brightness: 0.35 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(SLEEP);
  const prog = parseProgression(tpl, tonic).flatMap((bar) => [bar, bar]);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [48, 60]);
  const { fit, plan } = bedForm(req, bpm, 3, { unit: 8, pattern: ['A', 'B'], intro: [1, 2, 2], outro: [1, 2, 3], tail: Math.min(5, Math.max(1.5, req.durationSeconds * 0.04)) });
  const b = new ScoreBuilder(req.recipe, req, fit, 3, 0.5, tweaks, 2);
  const beat = b.beat;

  const pad = b.inst({ kind: 'synth', patch: 'pad-warm', name: 'Warm pad', gain: 0.28, reverb: 0.5, lowpass: 1300 });
  const air = b.inst({ kind: 'synth', patch: 'pad-glass', name: 'Night air', gain: 0.06, reverb: 0.6, pan: 0.2, lowpass: 3000, detune: weirdDetune(rng, W, 15) });
  const box = b.inst({ kind: 'sample', patch: 'musicbox', name: 'Music box', gain: 0.11, reverb: 0.6, pan: 0.15, lowpass: 6000 });
  const low = b.inst({ kind: 'sample', patch: 'felt-piano', name: 'Felt piano', gain: 0.24, reverb: 0.4, pan: -0.1, lowpass: 1500 });

  const lull = makeMotif(rng, 6, 0.2 + D * 0.2, { restTail: 1.5, minNotes: 2, maxNotes: 3, maxLeap: 2 });
  let voicing: number[] | null = null;
  // The pad breathes: a slow swell every few seconds.
  const breath = rng.range(7, 10);
  for (let t = breath / 2; t < b.end - 2; t += breath / 2) b.auto('inst', t, Math.round(t / (breath / 2)) % 2 ? 0.72 : 1, breath / 5, pad);

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp) => (sp.chord = chord(tonic, tpl.startsWith('Imaj') ? 'maj7' : 'add9')));
    b.section(s, spans.map((x) => x.chord), flats);
    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const startsChord = k === 0 || spans[k - 1]!.chord !== span.chord;
      voicing = voiceChord(span.chord, voicing, { low: 50, high: 67, voices: 4, rootless: false });
      if (startsChord) {
        const hold = last ? b.end - span.t - 0.8 : span.dur * (spans[k + 1]?.chord === span.chord ? 2 : 1) + 0.6;
        for (const p of voicing) b.note(pad, span.t, hold, p, 0.45);
        if (!intro) for (const p of voicing.slice(-2)) b.note(air, span.t + beat, hold, p + 12, 0.35);
        b.note(low, span.t, beat * 6, bassNote(bassPc(span.chord), null, 36, 48), vel(rng, 0.35, 0.03));
      }
      if (last) {
        // The music box winds down: a slow falling arpeggio.
        const tones = notesInRange(chordPcs(chord(tonic, '')), 79, 93).reverse();
        tones.slice(0, 4).forEach((p, j) => b.note(box, span.t + j * beat * 1.2, beat * 4, p - (j === 3 ? 0.08 : 0), 0.42 - j * 0.05));
      }
    });
    if (intro || outro) continue;
    // A lullaby on the music box, in alternate two-bar cells only: never busy.
    for (let c = 0; c * 2 + 2 <= s.bars; c++) {
      if (c % 2 === (s.part === 'B' ? 0 : 1)) continue;
      const m = s.repeat > 0 || c > 1 ? varyMotif(rng, lull, 0.4) : lull;
      for (const n of realizeMotif(m, 0, beat, 84, spans, keyScale, 79, 94, b.grid, s.startBar + c * 2)) b.note(box, n.t, n.d + beat * 2, n.p, vel(rng, n.strong ? 0.42 : 0.34));
    }
  }
  return b.build({
    key: keyName(tonic, 'major'),
    progression: tpl,
    fx: trackFx({ gain: 1.37, lowpass: lerp(3000, 6000, B), highpass: 45, wow: 0.3, wowRate: 0.2, flutter: 0, drive: 0, reverbTone: 4000, reverbLevel: 1.5 }),
  });
}

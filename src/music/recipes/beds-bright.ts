// Daytime beds for the v3 talk and community stations. Like the v2 beds they sit under
// speech: bass and sparkle around a thinned-out middle, melodies in short calls with
// space between them, and an intro and ending that work from a 12 s sting to a long bed.
//   cooking-bed    – a jaunty kitchen show: pizzicato, marimba, brushed shuffle, a timer bell
//   kids-bed       – children's TV: ukulele strums, glockenspiel hook, claps, a slide whistle
//   community-bed  – local radio: fingerpicked acoustic guitar, light piano, shaker
//   quiz-bed       – game-show tension: a ticking clock, pulse bass, organ, brass stabs

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, notesInRange, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord, type Chord } from '../theory';
import { bedForm, ramp, sentence, strum } from './beds-kit';
import { bassNote, chordAt, chordSpans, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';

// ── Cooking ───────────────────────────────────────────────────────────────────

const COOKING_A = ['I vi ii V', 'I IV ii V', 'I I7 IV iv', 'I VI7 ii V7', 'I iii IV V7', 'IV V iii vi'];
const COOKING_B = ['IV iv I VI7', 'ii V iii VI7', 'IV V iii vi', 'ii7 V7 Imaj7 VI7', 'IV IV I V7'];

export function composeCooking(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'cooking-bed');
  const tweaks = resolveTweaks(req, { bpm: 116, density: 0.5, grit: 0.1, weirdness: 0.1, brightness: 0.55 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const progA = parseProgression(rng.pick(COOKING_A), tonic);
  const progB = parseProgression(rng.pick(COOKING_B), tonic);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [108, 126]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A', 'C', 'B'], outro: [1, 1, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.58, 0.64), tweaks, 2);
  const beat = b.beat;

  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Pizzicato bass', gain: 0.75, pan: -0.05 });
  const strings = b.inst({ kind: 'sample', patch: 'pizz', name: 'Pizzicato strings', gain: 0.32, pan: -0.3, reverb: 0.15, highpass: 220 });
  const marimba = b.inst({ kind: 'sample', patch: 'marimba', name: 'Marimba', gain: 0.24, pan: 0.25, reverb: 0.15 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.34 });
  const brush = b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Brushes', gain: 0.4, pan: 0.1, reverb: 0.1 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.2, pan: 0.35 });
  const spoon = b.inst({ kind: 'sample', patch: 'woodblock', name: 'Wooden spoon', gain: 0.14, pan: -0.4 });
  const bell = b.inst({ kind: 'sample', patch: 'glockenspiel', name: 'Timer bell', gain: 0.24, pan: 0.2, reverb: 0.3, detune: weirdDetune(rng, W) });

  const motif = makeMotif(rng, 8, 0.45 + D * 0.3, { restTail: 1.5, minNotes: 3, maxNotes: 5, maxLeap: 3 });
  const motifB = makeMotif(rng, 8, 0.35 + D * 0.3, { restTail: 2, minNotes: 2, maxNotes: 4 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  const marimbaNote = (t: number, d: number, p: number, v: number) => {
    // Held notes are rolled, as a marimba player would.
    if (d > beat * 1.3) {
      const strokes = Math.floor(d / (beat * 0.25));
      for (let k = 0; k < strokes; k++) b.note(marimba, t + k * beat * 0.25, beat * 0.3, p, vel(rng, k === 0 ? v : v * 0.55, 0.05));
    } else b.note(marimba, t, d, p, vel(rng, v, 0.05));
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const prog = s.part === 'B' ? progB : progA;
    const spans = chordSpans(intro ? parseProgression('I V7', tonic) : prog, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? chord(tonic, '6') : chord(tonic + 7, '7')));
    b.section(s, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 36, 50);
      prevBass = root;
      voicing = voiceChord(span.chord, voicing, { low: 60, high: 74, voices: 3, rootless: false });
      if (last) {
        // The button: bass, a plucked chord, then the oven timer.
        b.note(bass, span.t, beat * 2, root, 0.9);
        for (const p of voicing) b.note(strings, span.t, beat * 2, p, 0.7);
        const top = nearestInSet(tonic + 96, [tonic % 12]);
        for (const [x, p] of [[1.5, top], [2, top]] as const) b.note(bell, span.t + x * beat, beat * 2, p > 104 ? p - 12 : p, 0.7);
        return;
      }
      // Bass: root and fifth with a walk into the next chord.
      const next = spans[k + 1]?.chord ?? span.chord;
      const nextRoot = bassNote(bassPc(next), root, 36, 50);
      b.note(bass, span.t, beat * 0.9, root, vel(rng, 0.85));
      b.note(bass, b.grid.at(span.bar, 2), beat * 0.9, root + 7 <= 52 ? root + 7 : root - 5, vel(rng, 0.7));
      if (!intro && D > 0.25 && rng.chance(0.65)) b.note(bass, b.grid.at(span.bar, 3.5), beat * 0.45, nextRoot + (nextRoot > root ? -1 : 1), vel(rng, 0.6));
      // Off-beat plucks: the jaunty "and".
      if ((!intro || k > 0) && s.part !== 'C') for (const x of [0.5, 2.5]) for (const p of voicing) b.note(strings, b.grid.at(span.bar, x), beat * 0.4, p, vel(rng, 0.55, 0.06));
    });
    if (outro) continue;

    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (intro && k < s.bars - 1) continue;
      // The C section is a breakdown: the drums step out (the cook is concentrating).
      if (s.part !== 'C' || k === s.bars - 1) {
        for (const x of [0, 2]) b.hit(kick, b.grid.at(bar, x), vel(rng, x ? 0.55 : 0.7));
        for (const x of [1, 3]) b.hit(brush, b.grid.at(bar, x), vel(rng, 0.55));
      }
      for (let e = 0; e < 8; e++) b.hit(shaker, b.grid.at(bar, e * 0.5), vel(rng, e % 2 ? 0.32 : 0.45), 60, 0.2);
      if (k % 2 === 1 && rng.chance(0.5)) b.hit(spoon, b.grid.at(bar, 3.5), vel(rng, 0.5), rng.pick([60, 63, 67]));
    }

    if (intro) {
      // A pickup run into the first bar.
      const end = b.grid.bar(s.startBar + s.bars);
      const scale = notesInRange(keyScale, 74, 86);
      const run = scale.slice(-4);
      run.forEach((p, j) => b.note(marimba, end - (4 - j) * beat * 0.5, beat * 0.45, p, 0.45 + j * 0.06));
      continue;
    }
    // Marimba: a melodic sentence in A; broken chords in B, so the middle of a long bed breathes.
    const cells = sentence(rng, s.part === 'B' ? motifB : motif, 8, s.repeat);
    for (let c = 0; c * 2 + 2 <= s.bars; c++) {
      const bar = s.startBar + c * 2;
      if (s.part === 'B') {
        if (c % 2 === 1) continue;
        const here = chordAt(spans, b.grid.bar(bar) + 0.01).chord;
        const tones = notesInRange(chordPcs(here), 72, 88);
        for (let e = 0; e < 6; e++) b.note(marimba, b.grid.at(bar, e * 0.5), beat * 0.45, tones[(e * 2) % tones.length]!, vel(rng, 0.42));
        continue;
      }
      if (s.part === 'C') {
        // Breakdown: the pizzicato strings take the tune, low and dry; the marimba answers once.
        for (const n of realizeMotif(cells[c % 4]!, 0, beat, 67, spans, keyScale, 60, 76, b.grid, bar)) b.note(strings, n.t, Math.min(n.d, beat), n.p, vel(rng, n.strong ? 0.7 : 0.6));
        if (c % 2 === 1) for (const n of realizeMotif(cells[3]!.slice(-2), 0, beat, 84, spans, keyScale, 79, 91, b.grid, bar)) marimbaNote(n.t, n.d, n.p, 0.45);
        continue;
      }
      if (D < 0.4 && c % 2 === 1) continue;
      for (const n of realizeMotif(cells[c % 4]!, 0, beat, 79, spans, keyScale, 72, 89, b.grid, bar)) marimbaNote(n.t, n.d, n.p, n.strong ? 0.6 : 0.5);
    }
  }
  return b.build({
    key: keyName(tonic, 'major'),
    progression: 'kitchen shuffle',
    fx: trackFx({ gain: 0.56, lowpass: lerp(6500, 12000, B), highpass: 45, wow: 0.2 + W, wowRate: 0.5, flutter: 0, drive: 0.05, reverbTone: 5000, reverbLevel: 0.8 }),
  });
}

// ── Kids ──────────────────────────────────────────────────────────────────────

const KIDS_A = ['I IV V I', 'I vi IV V', 'I IV I V', 'I V vi IV', 'I I IV V'];
const KIDS_B = ['IV V I vi', 'IV I V I', 'vi IV I V', 'ii V I I', 'IV IV I I'];
/** Island strum: eighth positions and directions (down/up). */
const STRUM: [number, boolean][] = [
  [0, false],
  [1, false],
  [1.5, true],
  [2.5, true],
  [3, false],
  [3.5, true],
];

export function composeKids(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'kids-bed');
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.5, grit: 0.05, weirdness: 0.1, brightness: 0.6 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const progA = parseProgression(rng.pick(KIDS_A), tonic);
  const progB = parseProgression(rng.pick(KIDS_B), tonic);
  const tune = scalePcs(tonic, SCALES.majorPent);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [112, 128]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'B'], outro: [1, 1, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.5, 0.55), tweaks, 2);
  const beat = b.beat;

  const uke = b.inst({ kind: 'sample', patch: 'ukulele', name: 'Ukulele', gain: 0.75, pan: -0.2, reverb: 0.1 });
  const glock = b.inst({ kind: 'sample', patch: 'glockenspiel', name: 'Glockenspiel', gain: 0.24, pan: 0.25, reverb: 0.25, detune: weirdDetune(rng, W) });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.6 });
  const clap = b.inst({ kind: 'sample', patch: 'clap', name: 'Claps', gain: 0.6, reverb: 0.15, pan: 0.05 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.36 });
  const whistle = b.inst({ kind: 'synth', patch: 'flute', name: 'Slide whistle', gain: 0.26, pan: 0.15, reverb: 0.2 });

  const hook = makeMotif(rng, 8, 0.45 + D * 0.3, { restTail: 1.5, minNotes: 3, maxNotes: 5, maxLeap: 3 });
  const hookB = makeMotif(rng, 8, 0.4 + D * 0.3, { restTail: 2, minNotes: 2, maxNotes: 4, maxLeap: 3 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  const slide = (t: number, from: number, to: number, d: number) => b.note(whistle, t, d, to, 0.6, { from, glide: d * 0.85 });

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(intro ? parseProgression('I', tonic) : s.part === 'B' ? progB : progA, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? chord(tonic, '') : chord(tonic + 7, '')));
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    if (intro) slide(sT + beat * 0.25, 72, 84, beat * 1.4);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      voicing = voiceChord(span.chord, voicing, { low: 60, high: 76, voices: 4, rootless: false });
      const root = bassNote(bassPc(span.chord), prevBass, 36, 48);
      prevBass = root;
      if (last) {
        slide(span.t, 86, 74, beat * 1.2);
        strum(b, uke, b.grid.at(span.bar, 1.5), voicing, { rng, d: beat * 2.5, v: 0.8, spread: 0.02 });
        b.note(bass, b.grid.at(span.bar, 1.5), beat * 2, root, 0.8);
        b.hit(clap, b.grid.at(span.bar, 1.5), 0.7);
        const arp = notesInRange(chordPcs(chord(tonic, '')), 88, 104).slice(0, 4);
        arp.forEach((p, j) => b.note(glock, b.grid.at(span.bar, j * 0.25), beat * 1.5, p, 0.5 + j * 0.05));
        return;
      }
      for (const [x, up] of STRUM) {
        if (intro && x < 1) continue;
        strum(b, uke, b.grid.at(span.bar, x), up ? voicing.slice(1) : voicing, { rng, d: beat * 0.45, v: up ? 0.5 : x % 2 === 0 ? 0.75 : 0.6, up, spread: 0.008 });
      }
      if (!intro) {
        b.note(bass, span.t, beat * 0.6, root, vel(rng, 0.8));
        b.note(bass, b.grid.at(span.bar, 2), beat * 0.6, root + 7 <= 50 ? root + 7 : root - 5, vel(rng, 0.7));
        if (rng.chance(0.3)) b.note(bass, b.grid.at(span.bar, 3.5), beat * 0.4, root + 12, vel(rng, 0.55));
      }
    });
    if (outro || intro) continue;
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      for (const x of [0, 2]) b.hit(kick, b.grid.at(bar, x), vel(rng, 0.65));
      for (const x of [1, 3]) b.hit(clap, b.grid.at(bar, x), vel(rng, 0.6));
      if (s.part === 'B' && k % 2 === 1) b.hit(clap, b.grid.at(bar, 3.5), vel(rng, 0.45));
    }
    // The glockenspiel hook: a call, a gap for the presenter, the answer, a gap.
    const cells = sentence(rng, s.part === 'B' ? hookB : hook, 8, s.repeat, { open: 4 });
    for (let c = 0; c * 2 + 2 <= s.bars; c++) {
      if (c % 2 === 1 && !(D > 0.65 && s.part === 'A')) continue;
      const cell = c % 4 === 2 ? cells[3]! : cells[c % 4]!;
      for (const n of realizeMotif(cell, 0, beat, 93, spans, tune, 88, 103, b.grid, s.startBar + c * 2)) b.note(glock, n.t, n.d + beat * 0.5, n.p, vel(rng, n.strong ? 0.6 : 0.5));
    }
    // Now and then the whistle slides into a new section.
    if (s.repeat > 0 && rng.chance(0.35)) slide(sT - beat, 70, 82, beat * 0.9);
  }
  return b.build({
    key: keyName(tonic, 'major'),
    progression: 'ukulele and glockenspiel',
    fx: trackFx({ gain: 0.45, lowpass: lerp(7000, 13000, B), highpass: 50, wow: W * 0.8, wowRate: 0.5, flutter: 0, drive: 0.04, reverbTone: 6000, reverbLevel: 0.7 }),
  });
}

// ── Community ─────────────────────────────────────────────────────────────────

const COMMUNITY_A = ['I V/vii vi IV', 'I IV vi V', 'I iii IV V', 'I IV I V', 'I Isus4 IV I'];
const COMMUNITY_B = ['IV I V vi', 'vi IV I V', 'IV V iii vi', 'ii IV I V', 'IV IV I V'];

export function composeCommunity(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'community-bed');
  const tweaks = resolveTweaks(req, { bpm: 96, density: 0.45, grit: 0.15, weirdness: 0.15, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const progA = parseProgression(rng.pick(COMMUNITY_A), tonic);
  const progB = parseProgression(rng.pick(COMMUNITY_B), tonic);
  // Something about the hole: odd dimensions borrow a darker chord in the bridge.
  if (W > 0.2 && rng.chance(0.3 + W)) progB[rng.int(1, progB.length - 1)] = [rng.chance(0.5) ? chord(tonic + 5, 'm') : chord(tonic + 8, '')];
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [88, 104]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A'] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.5, 0.56), tweaks, 2);
  const beat = b.beat;

  const guitar = b.inst({ kind: 'sample', patch: 'folk-guitar', name: 'Acoustic guitar', gain: 0.85, pan: -0.15, reverb: 0.12 });
  const piano = b.inst({ kind: 'sample', patch: rng.chance(0.6) ? 'piano' : 'felt-piano', name: 'Piano', gain: 0.36, pan: 0.25, reverb: 0.25 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.22, pan: 0.3 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Bass', gain: 0.75 });
  const pad = b.inst({ kind: 'synth', patch: 'pad-warm', name: 'Church-hall organ', gain: 0.1, reverb: 0.4, lowpass: 1400 });

  const lick = makeMotif(rng, 4, 0.3 + D * 0.2, { restTail: 1, minNotes: 2, maxNotes: 3, maxLeap: 3 });
  // Travis picking: thumb alternates bass notes on the beats, fingers fill the off-beats.
  const fingers = rng.pick([
    [2, 1, 2, 0],
    [1, 2, 0, 2],
    [2, 0, 1, 2],
  ]);
  let voicing: number[] | null = null;
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(s.part === 'B' ? progB : progA, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? chord(tonic, 'add9') : chord(tonic + 5, '')));
    b.section(s, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 72, voices: 3, rootless: false });
      const thumbRoot = bassNote(bassPc(span.chord), null, 40, 52);
      const thumbAlt = thumbRoot + 7 <= 55 ? thumbRoot + 7 : thumbRoot - 5;
      if (last) {
        strum(b, guitar, span.t, [thumbRoot, ...voicing], { rng, d: b.end - span.t - 0.3, v: 0.7, spread: 0.045 });
        b.note(piano, span.t + beat * 0.5, beat * 4, nearestInSet(84, [tonic % 12]), 0.4);
        b.note(bass, span.t, beat * 3, bassNote(tonic, prevBass, 31, 43), 0.6);
        return;
      }
      for (let bt = 0; bt < span.beats; bt++) {
        const at = b.grid.at(span.bar, span.beat + bt);
        b.note(guitar, at, beat * 1.6, bt % 2 ? thumbAlt : thumbRoot, vel(rng, bt === 0 ? 0.7 : 0.55, 0.05));
        if (bt === 0 && rng.chance(0.5)) b.note(guitar, at, beat * 1.2, voicing[voicing.length - 1]!, vel(rng, 0.5)); // a pinch
        const f = voicing[fingers[bt % 4]! % voicing.length]!;
        b.note(guitar, b.grid.at(span.bar, span.beat + bt + 0.5), beat * 1.2, f, vel(rng, 0.5, 0.06));
      }
      if (!intro && (s.part === 'B' || s.repeat > 0)) {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
        prevBass = root;
        b.note(bass, span.t, beat * 1.6, root, vel(rng, 0.65));
        b.note(bass, b.grid.at(span.bar, 2), beat * 1.6, root + 7 <= 47 ? root + 7 : root - 5, vel(rng, 0.55));
      }
      if (s.part === 'B') for (const p of voiceChord(span.chord, null, { low: 52, high: 67, voices: 3 })) b.note(pad, span.t, span.dur + 0.2, p, 0.45);
    });
    if (outro) continue;
    if (!intro) {
      for (let k = 0; k < s.bars; k++) for (let e = 0; e < 8; e++) b.hit(shaker, b.grid.at(s.startBar + k, e * 0.5), vel(rng, e % 2 ? 0.3 : 0.42), 60, 0.2);
      // Light piano: a short answer every other bar pair, high up and out of the voice's way.
      for (let k = 1; k < s.bars; k += 4) {
        if (!rng.chance(0.55 + D * 0.3)) continue;
        const m = s.repeat % 2 ? varyMotif(rng, lick, 0.5) : lick;
        for (const n of realizeMotif(m, 0, beat, 81, spans, keyScale, 76, 91, b.grid, s.startBar + k)) b.note(piano, n.t, n.d + beat * 0.5, n.p, vel(rng, 0.42));
      }
    }
  }
  return b.build({
    key: keyName(tonic, 'major'),
    progression: 'fingerpicked',
    fx: trackFx({ gain: 0.53, lowpass: lerp(6000, 11000, B), highpass: 45, wow: 0.3 + G * 1.5, wowRate: 0.45, flutter: G * 0.03, drive: 0.05 + G * 0.2, reverbTone: 5000, reverbLevel: 0.8 }),
  });
}

// ── Quiz ──────────────────────────────────────────────────────────────────────

const QUIZ: { prog: string; scale: 'minor' | 'harmonicMinor' | 'phrygian' }[] = [
  { prog: 'i i bVI bVI', scale: 'minor' },
  { prog: 'i bVI bVII i', scale: 'minor' },
  { prog: 'i iv V i', scale: 'harmonicMinor' },
  { prog: 'i bII i bII', scale: 'phrygian' },
  { prog: 'i i iv V', scale: 'harmonicMinor' },
];

export function composeQuiz(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'quiz-bed');
  const tweaks = resolveTweaks(req, { bpm: 122, density: 0.5, grit: 0.05, weirdness: 0.1, brightness: 0.55 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(QUIZ);
  const flats = prefersFlats(tonic, true);
  const bpm = pickBpm(rng, req, [112, 132]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'B'], intro: [1, 1, 2], outro: [1, 1, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks, 2);
  const beat = b.beat;

  const tick = b.inst({ kind: 'sample', patch: 'tick', name: 'Clock', gain: 0.5, pan: 0.25 });
  const pulse = b.inst({ kind: 'synth', patch: 'synth-bass', name: 'Pulse bass', gain: 0.3, lowpass: 900 });
  const organ = b.inst({ kind: 'synth', patch: 'combo-organ', name: 'Organ', gain: 0.2, pan: -0.25, lowpass: 2600, reverb: 0.15 });
  const brass = b.inst({ kind: 'synth', patch: 'brass', name: 'Brass stabs', gain: 0.38, pan: 0.12, reverb: 0.25 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.42, reverb: 0.25 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-punch', name: 'Heartbeat', gain: 0.15 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.2, pan: 0.3 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbal', gain: 0.18, reverb: 0.3 });
  const buzzer = b.inst({ kind: 'synth', patch: 'chip-square', name: 'Buzzer', gain: 0.22, lowpass: 1800 });

  const timpPitch = (pcValue: number) => bassNote(pcValue, null, 40, 52) + 19;
  const stab = (t: number, c: Chord, len: number, v: number) => {
    for (const p of voiceChord(c, null, { low: 60, high: 76, voices: 3, rootless: false })) b.note(brass, t, len, p, vel(rng, v, 0.03));
  };
  let lift = 0; // the game-show key change: each B section climbs a semitone
  let voicing: number[] | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    // Each new round climbs a semitone; after three the tension resets to the home key.
    if (s.part === 'B') lift = lift >= 3 ? 0 : lift + 1;
    const key = tonic + (outro ? 0 : lift);
    const prog = parseProgression(tpl.prog, key);
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp) => (sp.chord = chord(tonic, 'm')));
    b.section({ ...s, name: lift > 0 && !outro ? `${s.name} (+${lift})` : s.name }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const tonicChord = chord(key, 'm');

    if (intro || s.repeat === 0 || s.part === 'B') {
      // Da-da-DAAA into the section.
      stab(sT, spans[0]!.chord, beat * 0.3, 0.75);
      stab(sT + beat * 0.5, spans[0]!.chord, beat * 0.3, 0.75);
      stab(sT + beat, spans[0]!.chord, beat * (intro ? 2.5 : 1.5), 0.85);
      b.hit(timp, sT, 0.75, timpPitch(key));
      if (!intro) b.hit(crash, sT, 0.6, 60, 3);
    }
    if (outro) {
      const last = spans[spans.length - 1]!;
      if (rng.chance(0.5)) {
        // Time's up.
        stab(last.t, tonicChord, beat * 0.3, 0.8);
        stab(last.t + beat * 0.5, chord(tonic + 1, ''), beat * 0.3, 0.8);
        stab(last.t + beat, tonicChord, b.end - last.t - beat - 0.4, 0.85);
        b.hit(timp, last.t + beat, 0.8, timpPitch(tonic));
        b.hit(crash, last.t + beat, 0.7, 60, 3);
      } else {
        // The buzzer: wrong answer.
        b.note(buzzer, last.t + beat * 0.5, Math.min(beat * 2.5, b.end - last.t - beat), 40, 0.8);
        b.note(buzzer, last.t + beat * 0.5, Math.min(beat * 2.5, b.end - last.t - beat), 41, 0.6);
        b.hit(timp, last.t, 0.6, timpPitch(tonic));
      }
      for (let k = 0; k < s.bars - 1; k++) for (let x = 0; x < 4; x++) b.hit(tick, b.grid.at(s.startBar + k, x), x % 2 ? 0.5 : 0.65, x % 2 ? 55 : 60, 0.1);
      continue;
    }
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      for (let x = 0; x < 4; x++) b.hit(tick, b.grid.at(bar, x), vel(rng, x % 2 ? 0.5 : 0.65, 0.03), x % 2 ? 55 : 60, 0.1);
      if (intro) continue;
      if (s.part === 'B') {
        for (const x of [0, 0.3]) b.hit(kick, b.grid.at(bar, x), x ? 0.45 : 0.7);
        for (let e = 0; e < 8; e++) b.hit(hat, b.grid.at(bar, e * 0.5), vel(rng, e % 2 ? 0.4 : 0.28), 60, 0.1);
      }
      // Tension before the next section: rising stabs and a timpani roll.
      if (k === s.bars - 1) {
        const here = chordAt(spans, b.grid.bar(bar) + 0.01).chord;
        [2, 2.5, 3, 3.5].forEach((x, j) => stab(b.grid.at(bar, x), chord(here.root + j, here.quality === 'm' ? 'm' : ''), beat * 0.25, 0.55 + j * 0.08));
        for (let j = 0; j < 12; j++) b.hit(timp, b.grid.at(bar, 2 + j / 6), ramp(j, 12, 0.15, 0.55), timpPitch(key + 7), 1.2);
      } else if (k % 4 === 2 && D > 0.3) {
        stab(b.grid.at(bar, 0), chordAt(spans, b.grid.bar(bar) + 0.01).chord, beat * 0.25, 0.5);
      }
    }
    spans.forEach((span) => {
      const root = bassNote(bassPc(span.chord), null, 33, 45);
      if (!intro) for (let e = 0; e < span.beats * 2; e++) b.note(pulse, span.t + e * beat * 0.5, beat * 0.35, s.part === 'B' && e % 2 ? root + 12 : root, vel(rng, e % 2 ? 0.55 : 0.7, 0.03));
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 69, voices: 3, rootless: false });
      if (s.part === 'B' && !intro) {
        // Organ: nervous sixteenths through the chord.
        const tones = notesInRange(chordPcs(span.chord), 67, 81);
        for (let st = 0; st < span.beats * 4; st++) b.note(organ, span.t + st * beat * 0.25, beat * 0.2, tones[st % tones.length]!, vel(rng, st % 4 ? 0.4 : 0.5, 0.03));
      } else if (!intro) {
        for (const p of voicing) b.note(organ, span.t, span.dur * 0.95, p, 0.42);
      }
    });
  }
  void W;
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.95, lowpass: lerp(6500, 12000, B), highpass: 40, wow: 0, wowRate: 0.5, flutter: 0, drive: 0.05, reverbTone: 5500, reverbLevel: 0.8 }),
  });
}


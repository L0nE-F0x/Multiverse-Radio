// Beds for the v4 talk stations: quiet, steady, made to sit under voices.
//   court-bed     – Small Claims of the Multiverse: a stately processional for low strings
//                   and a chapel organ, pizzicato basses walking in, a horn now and then,
//                   timpani at the cadences and the occasional rap of the gavel.
//   theatre-organ – The Long Dark: a cinema organ with its tremulant, swelling suspense
//                   chords over a pedal, noir stings, and a melodramatic minor theme
//                   between scenes. Ends on "dun, dun, DUNNN".
//   traffic-bed   – Traffic on the 8s: a brisk pulse for the traffic desk — a rolling
//                   eighth-note bass, a ticking turn signal, a light arpeggio and a little
//                   station jingle at the top. Busy without nagging.
//   pirate-bed    – Free Frequency: a hand-made beat from an attic. Mono, crackly, wobbly
//                   tape, a boom-bap kit, a sneaky chromatic bassline and keys that were
//                   never quite in tune. Now and then the tape stops.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { SamplePatch, Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, notesInRange, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord, type Chord, type ScaleName } from '../theory';
import { bedForm, feel, sentence } from './beds-kit';
import { bassNote, chordSpans, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';

// ── Court ─────────────────────────────────────────────────────────────────────

const COURT_MAJOR = ['I I IV I V V I I', 'I vi ii V I IV V I', 'I V vi IV I IV V V', 'I iii IV I ii V I I', 'I IV ii V'];
const COURT_MINOR = ['i iv V i', 'i bVI iv V', 'i iv bVII bIII bVI iv V V', 'i i iv iv bVI V i i'];

export function composeCourt(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'court-bed');
  const tweaks = resolveTweaks(req, { bpm: 66, density: 0.4, grit: 0.05, weirdness: 0.1, brightness: 0.45 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const minor = rng.chance(0.35);
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(minor ? COURT_MINOR : COURT_MAJOR);
  const prog = parseProgression(tpl, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'harmonicMinor' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const meter = rng.chance(0.25) ? 3 : 4;
  const bpm = pickBpm(rng, req, [60, 74]);
  const { fit, plan } = bedForm(req, bpm, meter, { unit: 8, pattern: ['A', 'B'], intro: [1, 2, 2], outro: [1, 2, 2], tail: Math.min(4, Math.max(1.2, req.durationSeconds * 0.03)) });
  const b = new ScoreBuilder(req.recipe, req, fit, meter, 0.5, tweaks, 2);
  const beat = b.beat;

  const strings = b.inst({ kind: 'synth', patch: 'low-strings', name: 'Low strings', gain: 0.42, pan: -0.15, reverb: 0.35, detune: weirdDetune(rng, W, 12) });
  const organ = b.inst({ kind: 'synth', patch: 'pipe-organ', name: 'Chapel organ', gain: 0.2, pan: 0.15, reverb: 0.55, lowpass: 2200 });
  const basses = b.inst({ kind: 'sample', patch: 'pizz', name: 'Pizzicato basses', gain: 0.5, pan: 0.05, reverb: 0.25 });
  const horn = b.inst({ kind: 'synth', patch: 'fanfare-horn', name: 'Horn', gain: 0.34, pan: 0.25, reverb: 0.45 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.4, reverb: 0.35 });
  const gavel = b.inst({ kind: 'sample', patch: 'gavel', name: 'Gavel', gain: 0.4, pan: 0.1, reverb: 0.2 });

  const tune = makeMotif(rng, meter * 2, 0.25 + D * 0.25, { restTail: meter * 0.6, minNotes: 2, maxNotes: 3, maxLeap: 3, grid: 1 });
  let sV: number[] | null = null;
  let oV: number[] | null = null;
  let prevBass: number | null = null;
  const knock = (t: number, n: number) => {
    for (let k = 0; k < n; k++) b.hit(gavel, t + k * rng.range(0.28, 0.36), vel(rng, 0.75 - k * 0.05, 0.03), 60, 0.5);
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b, s.part === 'B' ? Math.floor(prog.length / 2) : 0);
    if (intro) spans.forEach((sp) => (sp.chord = prog[0]![0]!));
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? prog[0]![0]! : chord(tonic + 7, minor ? '' : '7')));
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    if (intro) knock(sT + 0.05, 2);
    else if (s.part === 'B' && rng.chance(0.5)) knock(sT, 1);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const cadence = !intro && k === spans.length - 1;
      sV = voiceChord(span.chord, sV, { low: 43, high: 62, voices: 3, rootless: false });
      oV = voiceChord(span.chord, oV, { low: 55, high: 69, voices: 3, rootless: true });
      const hold = last ? b.end - span.t - 0.8 : span.dur;
      // The organ holds the harmony, the strings bow it in halves (or a long note in three).
      oV.forEach((p) => b.note(organ, span.t, hold, p, vel(rng, 0.5, 0.03)));
      if (last) {
        sV.forEach((p) => b.note(strings, span.t, hold, p, 0.55));
        b.hit(timp, span.t, 0.6, bassNote(bassPc(span.chord), null, 40, 52) + 19, 3);
        knock(span.t + beat * 1.5, 3);
        return;
      }
      const halves = meter === 4 ? [0, 2] : [0];
      for (const h of halves) {
        const sus = cadence && h === 0 && span.chord.quality !== 'm' && rng.chance(0.6);
        sV.forEach((p, j) => {
          // A 4–3 suspension at cadences: the third waits a beat as the fourth.
          const isThird = pc(p - span.chord.root) === 4 || pc(p - span.chord.root) === 3;
          if (sus && isThird && j === sV!.length - 1) {
            b.note(strings, span.t, beat, p + (pc(p - span.chord.root) === 4 ? 1 : 2), vel(rng, 0.5, 0.03));
            b.note(strings, span.t + beat, beat * (meter - 1), p, vel(rng, 0.46, 0.03));
          } else b.note(strings, b.grid.at(span.bar, h), beat * (meter === 4 ? 2 : 3) * 0.97, p, vel(rng, h ? 0.42 : 0.5, 0.03));
        });
      }
      // Pizzicato basses walk in on the beat.
      if (!intro) {
        const root = bassNote(bassPc(span.chord), prevBass, 33, 47);
        const next = spans[k + 1];
        const nextRoot = next ? bassNote(bassPc(next.chord), root, 33, 47) : root;
        const line = meter === 4 ? [root, nearestInSet(root + 7, chordPcs(span.chord)) - 12 >= 33 ? nearestInSet(root + 7, chordPcs(span.chord)) - 12 : root, root, nextRoot === root ? root : nearestInSet(nextRoot + (nextRoot > root ? -2 : 2), keyScale)] : [root, root + 12 <= 52 ? root + 12 : root, nearestInSet(root + 7, chordPcs(span.chord))];
        line.forEach((p, j) => {
          if (D < 0.35 && j % 2 === 1) return;
          b.note(basses, b.grid.at(span.bar, j), beat * 0.9, p, vel(rng, j === 0 ? 0.62 : 0.5));
        });
        prevBass = root;
      }
      if (cadence) b.hit(timp, b.grid.at(span.bar, 0), 0.42, bassNote(bassPc(span.chord), null, 40, 52) + 19, 2);
    });

    // The horn: a dignified line in the second half of each B phrase (the first half is the judge's).
    if (s.part === 'B') {
      const cells = sentence(rng, tune, meter * 2, s.repeat);
      for (let g = 0; g + 4 <= s.bars; g += 4) {
        const cell = cells[(g / 4) % 2 === 0 ? 1 : 3]!;
        for (const n of realizeMotif(cell, 0, beat, 62, spans, keyScale, 55, 69, b.grid, s.startBar + g + 2)) b.note(horn, n.t, n.d * 0.95, n.p, vel(rng, 0.5));
      }
    }
  }
  return b.build({
    key: keyName(tonic, minor ? 'harmonicMinor' : 'major'),
    progression: tpl,
    fx: trackFx({ gain: 1.3, lowpass: lerp(5000, 9000, B), highpass: 38, wow: 0, wowRate: 0.5, flutter: 0, drive: 0, reverbTone: 4000, reverbLevel: 1.25 }),
  });
}

// ── Theatre organ ─────────────────────────────────────────────────────────────

/** Suspense harmony, one chord per bar (each held two bars). */
const SUSPENSE = ['i io7 i bII', 'i imaj7 i7 i6', 'i bVI iv V7b9', 'i ivo7 i V7b9', 'i bII7 i bII7'];
const THEME = ['i iv V7b9 i', 'i bVI iv V7b9', 'i i7 iv bII7', 'i V7b9 bVI V7'];

export function composeTheatreOrgan(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'theatre-organ');
  const tweaks = resolveTweaks(req, { bpm: 64, density: 0.4, grit: 0.2, weirdness: 0.2, brightness: 0.4 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tSus = rng.pick(SUSPENSE);
  const tTheme = rng.pick(THEME);
  const progS = parseProgression(tSus, tonic).flatMap((bar) => [bar, bar]);
  const progT = parseProgression(tTheme, tonic);
  const keyScale = scalePcs(tonic, SCALES.harmonicMinor);
  const flats = prefersFlats(tonic, true);
  const meter = rng.chance(0.3) ? 3 : 4;
  const bpm = pickBpm(rng, req, [56, 72]);
  const { fit, plan } = bedForm(req, bpm, meter, { unit: 8, pattern: ['S', 'T', 'S', 'S'], intro: [1, 2, 4], outro: [1, 2, 3], tail: Math.min(4, Math.max(1.2, req.durationSeconds * 0.035)) });
  const b = new ScoreBuilder(req.recipe, req, fit, meter, 0.5, tweaks, 2);
  const beat = b.beat;

  const chords = b.inst({ kind: 'synth', patch: 'theatre-organ', name: 'Organ (accompaniment)', gain: 0.24, pan: -0.12, reverb: 0.45, lowpass: lerp(2400, 4200, B), detune: weirdDetune(rng, W, 10) });
  const solo = b.inst({ kind: 'synth', patch: 'theatre-organ', name: 'Organ (solo)', gain: 0.32, pan: 0.12, reverb: 0.5 });
  const pedal = b.inst({ kind: 'synth', patch: 'pipe-organ', name: 'Pedal', gain: 0.32, lowpass: 600, reverb: 0.3 });
  const strings = b.inst({ kind: 'synth', patch: 'low-strings', name: 'Low strings', gain: 0.22, pan: -0.25, reverb: 0.4 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.45, reverb: 0.45 });
  const celesta = b.inst({ kind: 'sample', patch: 'celesta', name: 'Celesta', gain: 0.16, pan: 0.35, reverb: 0.6 });

  const theme = makeMotif(rng, meter * 2, 0.4 + D * 0.3, { restTail: meter * 0.4, minNotes: 3, maxNotes: 5, maxLeap: 5 });
  let cV: number[] | null = null;
  const low = bassNote(tonic, null, 31, 42);

  /** A sting: the whole organ at once, the timpani and the strings, then it falls away. */
  const sting = (t: number, c: Chord, big = 1) => {
    const v = voiceChord(c, null, { low: 55, high: 76, voices: 5, rootless: false, maxSpan: 22 });
    v.forEach((p) => b.note(chords, t, beat * 2.5, p, Math.min(1, 0.85 * big)));
    voiceChord(c, null, { low: 40, high: 55, voices: 3, rootless: false }).forEach((p) => b.note(strings, t, beat * 2.5, p, 0.8 * big));
    b.hit(timp, t, Math.min(1, 0.85 * big), bassNote(bassPc(c), null, 40, 52) + 19, 3);
    b.auto('inst', t - 0.01, 1.6, 0, chords);
    b.auto('inst', t + 0.05, 0.8, beat, chords);
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const themeSec = s.part === 'T' || intro;
    const spans = chordSpans(themeSec ? progT : progS, s, b);
    if (outro) {
      // "Dun, dun, DUNNN": the last bars are three stings.
      const cs = [chord(tonic + 8, ''), chord(tonic + 7, '7b9'), chord(tonic, 'm')];
      spans.forEach((sp, k) => (sp.chord = cs[Math.max(0, cs.length - spans.length + k)]!));
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : s.part === 'T' ? 'theme' : `suspense${s.repeat ? ' ' + (s.repeat + 1) : ''}` }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    b.auto('inst', sT, 1, 0.05, chords);

    if (outro) {
      spans.forEach((sp, k) => {
        const lastOne = k === spans.length - 1;
        if (lastOne) {
          sting(sp.t, sp.chord, 1);
          const v = voiceChord(sp.chord, null, { low: 55, high: 76, voices: 5, rootless: false, maxSpan: 22 });
          v.forEach((p) => b.note(chords, sp.t + beat * 2.4, b.end - sp.t - beat * 2.4 - 0.6, p, 0.6));
          b.note(pedal, sp.t, b.end - sp.t - 0.6, low, 0.7);
          b.note(celesta, sp.t + beat * 2, beat * 3, nearestInSet(88, chordPcs(sp.chord)), 0.5);
        } else {
          sting(sp.t, sp.chord, 0.75);
          b.note(pedal, sp.t, sp.dur, bassNote(bassPc(sp.chord), null, 31, 43), 0.6);
        }
      });
      continue;
    }

    // Pedal point under the suspense; the bass follows the harmony in the theme.
    if (!themeSec) b.note(pedal, sT, sEnd - sT, low, 0.55);

    spans.forEach((span, k) => {
      const startsChord = k === 0 || spans[k - 1]!.chord !== span.chord;
      cV = voiceChord(span.chord, cV, { low: 53, high: 70, voices: 4, rootless: themeSec });
      if (themeSec) {
        b.note(pedal, span.t, span.dur, bassNote(bassPc(span.chord), null, 31, 43), 0.6);
        cV.forEach((p) => b.note(chords, span.t, span.dur, p, vel(rng, 0.55, 0.03)));
        return;
      }
      if (!startsChord) return;
      const dur = spans[k + 1] && spans[k + 1]!.chord === span.chord ? span.dur * 2 : span.dur;
      // Suspense: a slow swell on each chord with the tremulant going, strings underneath.
      cV.forEach((p) => b.note(chords, span.t, dur, p, vel(rng, 0.5, 0.03)));
      b.auto('inst', span.t + 0.01, 0.45, 0, chords);
      b.auto('inst', span.t + 0.02, 1, dur / 3, chords);
      voiceChord(span.chord, null, { low: 40, high: 55, voices: 2, rootless: false }).forEach((p) => b.note(strings, span.t, dur, p, 0.45));
      // A chromatic voice creeping up inside the chord.
      if (rng.chance(0.4 + D * 0.3)) {
        const top = cV[cV.length - 1]!;
        for (let j = 0; j < 3; j++) b.note(solo, span.t + dur * (0.25 + j * 0.22), dur * 0.22, top + 1 + j, vel(rng, 0.32, 0.03));
      }
      if (rng.chance(0.3 + D * 0.2)) b.note(celesta, span.t + beat * rng.pick([1, 2, 3]), beat * 3, nearestInSet(rng.int(84, 93), chordPcs(span.chord)), vel(rng, 0.4));
    });

    // A sting to open some suspense scenes (the first one always).
    if (s.part === 'S' && (s.repeat === 0 || rng.chance(0.35))) sting(sT, spans[0]!.chord, 0.7);

    // The theme: a melodramatic line on the solo organ, with a timpani roll into its last bar.
    if (themeSec) {
      const cells = sentence(rng, theme, meter * 2, s.repeat);
      for (let g = 0; g + 2 <= s.bars; g += 2) {
        const cell = cells[(g / 2) % 4]!;
        for (const n of realizeMotif(cell, 0, beat, 70, spans, keyScale, 62, 79, b.grid, s.startBar + g)) b.note(solo, n.t, n.d * 0.97, n.p, vel(rng, n.strong ? 0.66 : 0.56));
      }
      if (s.bars >= 2) {
        const t0 = b.grid.bar(s.startBar + s.bars - 1) + beat * (meter - 1);
        for (let r = 0; r * 0.07 < beat; r++) b.hit(timp, t0 + r * 0.07, 0.25 + r * 0.02, bassNote(tonic + 7, null, 40, 52) + 19, 0.6);
      }
    }
  }
  return b.build({
    key: keyName(tonic, 'harmonicMinor'),
    progression: `${tSus} / ${tTheme}`,
    fx: trackFx({ gain: 1.0, lowpass: lerp(4500, 9000, B), highpass: 36, wow: 0.3 + G * 1.2, wowRate: 0.3, flutter: G * 0.03, drive: 0.05 + G * 0.2, reverbTone: 3800, reverbLevel: 1.3 }),
  });
}

// ── Traffic ───────────────────────────────────────────────────────────────────

const TRAFFIC: { prog: string; scale: ScaleName }[] = [
  { prog: 'I I IV IV', scale: 'major' },
  { prog: 'I bVII IV I', scale: 'mixolydian' },
  { prog: 'vi IV I V', scale: 'major' },
  { prog: 'I V vi IV', scale: 'major' },
  { prog: 'i bVII bVI bVII', scale: 'minor' },
  { prog: 'IVmaj7 V iii vi', scale: 'major' },
];

export function composeTraffic(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'traffic-bed');
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.5, grit: 0.05, weirdness: 0.1, brightness: 0.55 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(TRAFFIC);
  const prog = parseProgression(tpl.prog, tonic);
  const minor = tpl.scale === 'minor';
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [112, 126]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'B', 'A', 'C'], intro: [1, 2, 2], outro: [1, 2, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const bass = b.inst({ kind: 'synth', patch: 'synth-bass', name: 'Pulse bass', gain: 0.32, lowpass: 900 });
  const arp = b.inst({ kind: 'synth', patch: 'arp-pluck', name: 'Arpeggio', gain: 0.2, pan: 0.3, lowpass: lerp(1800, 3200, B), delay: 0.2 });
  const pad = b.inst({ kind: 'synth', patch: 'pad-warm', name: 'Pad', gain: 0.22, reverb: 0.35, lowpass: 1600, detune: weirdDetune(rng, W, 10) });
  const signal = b.inst({ kind: 'sample', patch: 'woodblock', name: 'Turn signal', gain: 0.14, pan: -0.35, lowpass: 3000 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.18, pan: 0.2, lowpass: 8000 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.36 });
  const clap = b.inst({ kind: 'sample', patch: 'rim', name: 'Rim', gain: 0.22, pan: -0.1 });
  const bell = b.inst({ kind: 'sample', patch: rng.chance(0.5) ? 'glockenspiel' : 'xylophone', name: 'Jingle bells', gain: 0.24, pan: 0.15, reverb: 0.3 });
  const brass = b.inst({ kind: 'synth', patch: 'brass', name: 'Jingle brass', gain: 0.3, reverb: 0.3, pan: -0.1 });

  // The station's jingle: five notes, the same all day (it's the traffic, after all).
  const jingleRhythm = rng.pick([
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 1], [3, 1]],
    [[0, 0.75], [0.75, 0.25], [1, 0.5], [2, 0.5], [2.5, 1.5]],
    [[0, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [3, 1]],
  ] as const);
  const jingleSteps = rng.pick([[0, 2, 4, 7, 6], [4, 2, 4, 7, 7], [0, 4, 2, 5, 4], [7, 4, 5, 2, 4]]);
  const arpShape = rng.pick([[0, 1, 2, 1], [0, 1, 2, 3], [0, 2, 1, 3], [0, 2, 3, 2]]);
  let pV: number[] | null = null;
  let prevBass: number | null = null;

  const jingle = (bar: number) => {
    const root = nearestInSet(72, [tonic]);
    jingleRhythm.forEach(([bt, len], k) => {
      let p = root;
      const steps = jingleSteps[k]!;
      for (let j = 0; j < steps; j++) p = notesInRange(keyScale, p + 1, p + 3)[0] ?? p + 2;
      b.note(bell, b.grid.at(bar, bt), beat * len * 2, p, vel(rng, 0.62));
      if (k === jingleRhythm.length - 1) voiceChord(chord(tonic, minor ? 'm' : ''), null, { low: 60, high: 74, voices: 3, rootless: false }).forEach((q) => b.note(brass, b.grid.at(bar, bt), beat * len, q, 0.55));
    });
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans[spans.length - 1]!.chord = prog[0]![0]!;
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : s.part === 'C' ? 'jingle' : s.name }, spans.map((x) => x.chord), flats);
    if (intro || s.part === 'C' || outro) jingle(outro ? s.startBar + s.bars - 1 : s.startBar);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      pV = voiceChord(span.chord, pV, { low: 55, high: 72, voices: 3, rootless: true });
      if (s.part !== 'A' || s.repeat > 0) pV.forEach((p) => b.note(pad, span.t, last ? b.end - span.t - 0.6 : span.dur + 0.05, p, 0.42));
      const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
      prevBass = root;
      if (last) {
        b.note(bass, span.t, beat * 2, root, 0.75);
        return;
      }
      // A rolling eighth-note bass, octave pops on the "and" of four.
      if (!(intro && k === 0 && s.bars > 1))
        for (let e = 0; e < span.beats * 2; e++) b.note(bass, b.grid.at(span.bar, span.beat + e * 0.5), beat * 0.42, e === 7 ? root + 12 : root, vel(rng, e % 2 ? 0.5 : 0.62, 0.03));
      // The arpeggio: sixteenths in A, eighths elsewhere.
      if (!intro) {
        const tones = notesInRange(chordPcs(span.chord), 64, 84);
        const step = s.part === 'A' && D > 0.6 && k % 2 === 1 ? 0.25 : 0.5;
        for (let x = 0; x < span.beats / step; x++) b.note(arp, b.grid.at(span.bar, span.beat + x * step), beat * step * 0.8, tones[arpShape[x % arpShape.length]! % tones.length]!, vel(rng, x % 4 === 0 ? 0.5 : 0.38, 0.03));
      }
    });

    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (outro && k === s.bars - 1) break;
      // The turn signal: tick... tock... (it has been indicating since the Big Bang).
      if (s.part !== 'B') for (let bt = 0; bt < 4; bt++) b.hit(signal, b.grid.at(bar, bt), vel(rng, 0.5, 0.02), bt % 2 ? 55 : 62, 0.2);
      if (intro) continue;
      for (let e = 0; e < 8; e++) b.hit(hat, b.grid.at(bar, e * 0.5), vel(rng, e % 2 ? 0.45 : 0.3), 60, 0.15);
      if (s.part === 'B' || (s.part === 'A' && s.repeat > 0)) {
        for (const bt of [0, 2]) b.hit(kick, b.grid.at(bar, bt), vel(rng, 0.6));
        if (s.part === 'B' && k % 2 === 1) b.hit(kick, b.grid.at(bar, 2.5), vel(rng, 0.45));
        for (const bt of [1, 3]) b.hit(clap, b.grid.at(bar, bt), vel(rng, 0.5));
      }
    }
  }
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.92, lowpass: lerp(6000, 11000, B), highpass: 40, wow: 0, wowRate: 0.5, flutter: 0, drive: 0.03, delay: { time: beat * 0.75, feedback: 0.25, tone: 2500, wet: 0.4 }, reverbTone: 5000, reverbLevel: 0.8 }),
  });
}

// ── Pirate ────────────────────────────────────────────────────────────────────

const PIRATE: { prog: string; scale: ScaleName }[] = [
  { prog: 'i bII', scale: 'phrygian' },
  { prog: 'i i bVI V7', scale: 'harmonicMinor' },
  { prog: 'i iv bII V7', scale: 'harmonicMinor' },
  { prog: 'i7 i7 iv7 bVI7', scale: 'minor' },
  { prog: 'i bVI i bII', scale: 'phrygian' },
];

/** Sneaky bass bars: [beat, beats, semitones above the root]. */
const SNEAK: [number, number, number][][] = [
  [[0, 0.75, 0], [1.5, 0.25, 0], [2, 0.5, 3], [2.5, 0.5, 5], [3, 0.5, 6], [3.5, 0.5, 7]],
  [[0, 1, 0], [1.5, 0.5, 0], [2.5, 0.5, -1], [3, 1, -2]],
  [[0, 0.5, 0], [0.75, 0.25, 0], [1.5, 0.5, 12], [2, 0.75, 0], [3, 0.5, 3], [3.5, 0.5, 1]],
];

export function composePirate(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'pirate-bed');
  const tweaks = resolveTweaks(req, { bpm: 88, density: 0.45, grit: 0.7, weirdness: 0.3, brightness: 0.3 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(PIRATE);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, true);
  const bpm = pickBpm(rng, req, [82, 96]);
  const { fit, plan } = bedForm(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A'], intro: [1, 2, 2], outro: [1, 2, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.56, 0.62), tweaks, 4);
  const beat = b.beat;
  const sloppy = feel(rng, 4, 12);

  // Everything dead centre: it is one microphone in an attic.
  const keysPatch: SamplePatch = rng.pick(['wurli', 'ep', 'piano'] as const);
  const sour = (rng.chance(0.5) ? 1 : -1) * rng.range(18, 32) * (0.6 + W);
  const kick = b.inst({ kind: 'sample', patch: 'kick-lofi', name: 'Kick', gain: 0.55 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-lofi', name: 'Snare', gain: 0.42 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.24, lowpass: 6000 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.55, lowpass: 700 });
  const keys = b.inst({ kind: 'sample', patch: keysPatch, name: 'Detuned keys', gain: keysPatch === 'piano' ? 0.3 : 0.4, lowpass: 2600, detune: sour });
  const toy = b.inst({ kind: 'synth', patch: rng.pick(['chip-square', 'square-lead', 'melodica'] as const), name: 'Toy keyboard', gain: 0.12, lowpass: 2200, detune: -sour * 0.5, delay: 0.25 });
  const crackle = b.inst({ kind: 'sample', patch: 'vinyl', name: 'Crackle', gain: 0.18 + G * 0.12 });
  const click = b.inst({ kind: 'sample', patch: 'tape-click', name: 'Tape', gain: 0.3 });

  const sneak = rng.pick(SNEAK);
  const tune = makeMotif(rng, 8, 0.3 + D * 0.3, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  let kV: number[] | null = null;
  let prevBass: number | null = null;
  const stops = fit.bars >= 20;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans[spans.length - 1]!.chord = prog[0]![0]!;
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    b.hit(click, sT + 0.02, vel(rng, 0.5), 60, 0.3);
    // The tape gets stopped now and then, and started again on the next bar.
    if (stops && s.part === 'B' && rng.chance(0.6)) {
      b.auto('tapestop', sEnd - beat * 1.5, beat * 1.2, 0);
      b.auto('tapestop', sEnd + 0.01, 0, 0);
    }

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      kV = voiceChord(span.chord, kV, { low: 55, high: 70, voices: 3, rootless: true });
      const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
      prevBass = root;
      if (last) {
        kV.forEach((p, j) => b.note(keys, span.t + j * 0.03, b.end - span.t - 0.5, p, 0.45));
        b.note(bass, span.t, beat * 2, root, 0.7);
        return;
      }
      // Keys: stilted stabs on the "and" of two and on four (a third one when busy).
      const stabs = D > 0.55 ? [1.5, 3, 3.75] : [1.5, 3];
      for (const bt of stabs) if (bt >= span.beat && bt < span.beat + span.beats) kV.forEach((p) => b.note(keys, sloppy(b.grid.at(span.bar, bt)), beat * 0.4, p, vel(rng, 0.5, 0.06)));
      if (intro && k < spans.length - 1 && s.bars > 1) return;
      for (const [bt, len, iv] of sneak) {
        if (bt < span.beat || bt >= span.beat + span.beats) continue;
        b.note(bass, sloppy(b.grid.at(span.bar, bt)), len * beat * 0.9, root + iv, vel(rng, bt === 0 ? 0.75 : 0.62));
      }
    });

    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (intro || (outro && k === s.bars - 1)) continue;
      // Boom-bap, played by hand: the odd beat goes missing.
      const drop = rng.chance(0.08 + W * 0.1) ? rng.int(0, 3) : -1;
      for (const [bt, v] of [[0, 0.85], [1.75, 0.55], [2.5, 0.7]] as const) if (Math.floor(bt) !== drop) b.hit(kick, sloppy(b.grid.at(bar, bt)), vel(rng, v));
      for (const bt of [1, 3]) if (bt !== drop) b.hit(snare, sloppy(b.grid.at(bar, bt)), vel(rng, 0.75));
      for (let e = 0; e < 8; e++) if (Math.floor(e / 2) !== drop) b.hit(hat, sloppy(b.grid.at(bar, e * 0.5)), vel(rng, e % 2 ? 0.35 : 0.5), 60, 0.15);
    }

    // The toy keyboard: a little conspiratorial tune in the B sections.
    if (s.part === 'B') {
      for (let g = 0; g + 2 <= s.bars; g += 4) {
        const m = g ? varyMotif(rng, tune, 0.5) : tune;
        for (const n of realizeMotif(m, 0, beat, 74, spans, keyScale, 67, 84, b.grid, s.startBar + g + 1)) b.note(toy, sloppy(n.t), n.d * 0.8, n.p, vel(rng, 0.55));
      }
    }
  }
  b.note(crackle, 0, b.end, 60, 1);

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.31, lowpass: lerp(3200, 5500, B), highpass: 110, wow: 1.6 + G * 2.4, wowRate: 0.45, flutter: 0.05 + G * 0.08, drive: 0.25 + G * 0.35, delay: { time: beat * 0.75, feedback: 0.3, tone: 1800, wet: 0.45 }, reverbTone: 3000, reverbLevel: 0 }),
  });
}

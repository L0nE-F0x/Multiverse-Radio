// Two kinds of reggae for the Outer Band.
//
//   roots-reggae  – Orbit Roots, a farm moon. A song, not a dub: one-drop drums (kick and
//                   cross-stick together on three), a guitar-and-piano skank on two and
//                   four, an organ bubbling in the gaps, a deep round bass that sings its
//                   own melody, minor and dorian changes, a melodica singing the verses
//                   and a trumpet-and-trombone line on the choruses. A spring-reverb snare
//                   marks the phrase ends; the echo is a spice, not the dish.
//   island-reggae – Island Time Observatory. Lovers rock and rocksteady: slower and
//                   sunnier, major sevenths on a chorused guitar and electric piano, a
//                   busier, sweeter bass, a vibraphone (or a steel pan, or a whistler)
//                   singing lazily behind the beat, soft strings and gentle hand drums.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type Score, type SamplePatch, type SynthPatch } from '../score';
import { chord, chordPcs, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord, type Chord, type ScaleName } from '../theory';
import { feel } from './beds-kit';
import { chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune, type ChordSpan } from './common';
import { bpmFor, fadeVelocities, feelFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';
import { makeRiff, playRiff, strain, swung } from './world-kit';

// ── Roots ─────────────────────────────────────────────────────────────────────

interface RootsKey {
  scale: ScaleName;
  verse: string[];
  chorus: string[];
}

const ROOTS: Record<'dorian' | 'minor' | 'major', RootsKey> = {
  dorian: {
    scale: 'dorian',
    verse: ['i7 i7 IV7 IV7', 'i7 ii7 i7 ii7', 'i7 IV7', 'i7 i7 ii7 IV7'],
    chorus: ['bIIImaj7 IV7 i7 i7', 'iv7 iv7 i7 i7 bVII bVII IV7 IV7', 'bVII bVII i7 i7', 'IV7 IV7 i7 v7'],
  },
  minor: {
    scale: 'minor',
    verse: ['i i bVII bVII', 'i iv i iv', 'i bVI bVII i', 'i i iv v', 'i bVII bVI bVII'],
    chorus: ['bVI bVII i i', 'iv iv i i iv iv V V', 'bIII bVII iv i', 'bVI bVI bVII bVII iv iv i i'],
  },
  major: {
    scale: 'major',
    verse: ['I I IV IV', 'I IV V IV', 'I vi IV V'],
    chorus: ['IV V I vi', 'IV IV I I V V I I', 'ii ii I I'],
  },
};

/** Two-bar bass rhythms ([beat, beats]): roots lines breathe, and often leave beat one to the drums. */
const ROOTS_BASS: (readonly [number, number])[][] = [
  [[0, 1.5], [1.5, 0.5], [2, 1], [3.5, 0.5], [4, 1.5], [6, 0.5], [6.5, 1]],
  [[0.5, 1], [1.5, 0.5], [2, 1.5], [4.5, 1], [5.5, 0.5], [6, 1], [7, 0.5]],
  [[0, 1], [1, 0.5], [1.5, 1.5], [3.5, 0.5], [4, 1], [5.5, 0.5], [6, 0.75], [7, 0.75]],
  [[0, 2], [2.5, 0.5], [3, 0.5], [4, 1.5], [5.5, 0.5], [6, 1], [7.5, 0.5]],
  [[0, 0.75], [1, 0.5], [1.5, 1], [3, 0.5], [3.5, 0.5], [4, 1], [5.5, 1], [7, 0.5]],
];

export function composeRootsReggae(req: TrackRequest): Score {
  const S = streams(req, 'roots-reggae');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 74, density: 0.5, grit: 0.25, weirdness: 0.12, brightness: 0.45 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.86);
  const mode: 'dorian' | 'minor' | 'major' = minor ? (song.chance(0.5) ? 'dorian' : 'minor') : 'major';
  const K = ROOTS[mode];
  const tonic = tonicFor(S, minor ? [9, 4, 2, 7, 11] : [7, 2, 9, 0]);
  const tVerse = song.pick(K.verse);
  const tChorus = song.pick(K.chorus);
  const progV = parseProgression(tVerse, tonic);
  const progC = parseProgression(tChorus, tonic);
  const keyScale = scalePcs(tonic, SCALES[K.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [68, 80]);
  const swing = feelFor(S, 0.55, 0.64);
  const tail = Math.min(3.5, Math.max(1, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const plan = planForm(
    fit.bars,
    fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 24 ? 4 : fit.bars >= 8 ? 2 : fit.bars >= 4 ? 1 : 0,
    [{ part: 'V', bars: 8 }, { part: 'C', bars: 8 }, { part: 'V', bars: 8 }, { part: 'C', bars: 8 }, { part: 'D', bars: 8 }, { part: 'C', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 2);
  const beat = b.beat;
  const at = (bar: number, bt: number) => swung(b, swing, bar, bt);

  // ── The band (palette from the style stream: an artist keeps theirs) ──
  const pianoPatch: SamplePatch = style.weighted([['piano', 2], ['ep', 2], ['wurli', 1]]);
  const leadPatch: SynthPatch = style.weighted([['melodica', 4], ['harmon-trumpet', 1], ['polka-clarinet', 1]]);
  const kickPatch: SamplePatch = style.weighted([['kick-soft', 3], ['kick-808', 1]]);
  const hornsLead = style.chance(0.75);

  const sub = b.inst({ kind: 'sample', patch: 'bass-sub', name: 'Sub bass', gain: 0.33, lowpass: 320 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.34, lowpass: 750, release: 0.07 });
  const kick = b.inst({ kind: 'sample', patch: kickPatch, name: 'Kick', gain: kickPatch === 'kick-808' ? 0.4 : 0.55 });
  const rim = b.inst({ kind: 'sample', patch: 'rim', name: 'Cross-stick', gain: 0.55, reverb: 0.15, pan: 0.08 });
  const spring = b.inst({ kind: 'sample', patch: 'spring-snare', name: 'Spring snare', gain: 0.45, pan: 0.08, reverb: 0.1, delay: 0 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.38, pan: 0.28, lowpass: lerp(7000, 11000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.16, pan: 0.28 });
  const chop = b.inst({ kind: 'sample', patch: 'folk-guitar', name: 'Skank guitar', gain: 0.75, pan: -0.32, highpass: 380, lowpass: 4200, reverb: 0.12, release: 0.04 });
  const stab = b.inst({ kind: 'sample', patch: pianoPatch, name: 'Skank piano', gain: pianoPatch === 'piano' ? 0.35 : 0.45, pan: 0.18, reverb: 0.2, lowpass: 3000, release: 0.07 });
  const organ = b.inst({ kind: 'synth', patch: 'organ', name: 'Organ bubble', gain: 0.42, pan: 0.34, lowpass: 2000, highpass: 160, tremolo: { rate: 5.8, depth: 0.25 } });
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: leadPatch === 'melodica' ? 'Melodica' : leadPatch === 'harmon-trumpet' ? 'Muted trumpet' : 'Clarinet', gain: leadPatch === 'melodica' ? 0.45 : 0.4, pan: -0.08, reverb: 0.28, delay: 0.12, detune: weirdDetune(song, W, 18) });
  const trumpet = b.inst({ kind: 'synth', patch: 'fanfare-trumpet', name: 'Trumpet', gain: 0.95, pan: -0.18, reverb: 0.25, lowpass: 3200 });
  const bone = b.inst({ kind: 'synth', patch: 'trombone', name: 'Trombone', gain: 1.05, pan: 0.2, reverb: 0.25 });

  const riffV = makeRiff(song, ROOTS_BASS, D);
  const riffC = song.chance(0.5) ? riffV : makeRiff(song, ROOTS_BASS, D);
  const melV = phrase(S, 'roots-verse', 8, 0.35 + D * 0.3, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  const hook = phrase(S, 'roots-hook', 8, 0.3 + D * 0.25, { restTail: 2.5, maxNotes: 4, maxLeap: 4 });
  const doubleSkank = style.chance(0.4);
  const bubble = style.chance(0.85);
  const push = feel(song, 6, 8);
  let gVoicing: number[] | null = null;
  let pVoicing: number[] | null = null;

  /** A drum fill into the next section: a triplet roll on the spring snare, or the cross-stick. */
  const fill = (bar: number, big: boolean) => {
    if (big && song.chance(0.6)) {
      for (let k = 0; k < 6; k++) b.hit(k < 3 ? rim : spring, b.grid.bar(bar) + (2 + k / 3) * beat, vel(song, 0.5 + k * 0.06), k < 3 ? 62 - k * 3 : 60, 0.6);
    } else {
      for (let k = 0; k < 3; k++) b.hit(rim, b.grid.bar(bar) + (3 + k / 3) * beat, vel(song, 0.45 + k * 0.1));
      b.hit(spring, b.grid.bar(bar) + 3.67 * beat, vel(song, 0.6));
    }
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const version = s.part === 'D';
    const prog: Chord[][] = s.part === 'C' ? progC : intro || outro ? progV.slice(0, 2) : progV;
    const spans = chordSpans(prog, s, b);
    if (outro) spans[spans.length - 1]!.chord = progV[0]![0]!;
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : version ? 'version' : s.part === 'C' ? `chorus${s.repeat ? ' ' + (s.repeat + 1) : ''}` : `verse ${s.repeat + 1}` }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);

    // The version: the band drops out and back in; the cross-stick and skank get a little echo.
    if (version) {
      b.auto('inst', sT, 0, 0.05, lead);
      b.auto('inst', sT + fit.barDur * 4, 0, 0.1, stab);
      b.auto('inst', sEnd - 0.05, 1, 0.02, stab);
      b.auto('echo', sT, 0.22, 0.1, spring);
      b.auto('echo', sEnd - 0.05, 0, 0.05, spring);
    } else b.auto('inst', sT, 1, 0.02, lead);

    // ── Skank and bubble ──
    spans.forEach((span, k) => {
      const lastSpan = outro && k === spans.length - 1;
      gVoicing = voiceChord(span.chord, gVoicing, { low: 62, high: 75, voices: 3, rootless: false });
      pVoicing = voiceChord(span.chord, pVoicing, { low: 55, high: 68, voices: 3, rootless: true });
      if (lastSpan) {
        // The last chord rings on piano and guitar, with a spring-snare full stop.
        gVoicing.forEach((p, j) => b.note(chop, span.t + j * 0.03, Math.min(2.5, b.end - span.t - 0.3), p, 0.5));
        pVoicing.forEach((p) => b.note(stab, span.t, b.end - span.t - 0.3, p, 0.45));
        b.hit(spring, span.t, 0.75);
        return;
      }
      if (intro && k < 1 && s.bars > 2) return;
      for (const bt of [1, 3]) {
        if (bt >= span.beat + span.beats || bt < span.beat) continue;
        const t = push(at(span.bar, bt));
        gVoicing.forEach((p, j) => b.note(chop, t + j * 0.005, beat * 0.17, p, vel(song, 0.6, 0.04)));
        if (doubleSkank && (bt === 3 || song.chance(0.3))) gVoicing.forEach((p, j) => b.note(chop, at(span.bar, bt + 0.25) + j * 0.005, beat * 0.12, p, vel(song, 0.4, 0.04)));
        if (!(version && span.bar - s.startBar >= 4)) pVoicing.forEach((p) => b.note(stab, t, beat * 0.3, p, vel(song, 0.48, 0.04)));
      }
      if (bubble && !intro) {
        // The bubble: low chord on the "and", the top of it on the "a", around the skank.
        const top = pVoicing[pVoicing.length - 1]!;
        for (let bt = span.beat; bt < span.beat + span.beats; bt++) {
          pVoicing.slice(0, 2).forEach((p) => b.note(organ, at(span.bar, bt + 0.5), beat * 0.2, p, vel(song, 0.45, 0.04)));
          if (bt % 2 === 0) b.note(organ, at(span.bar, bt + 0.75), beat * 0.15, top, vel(song, 0.38, 0.04));
        }
      }
    });

    // ── Bass ──
    if (!(intro && s.bars > 2)) {
      const riff = s.part === 'C' ? riffC : riffV;
      const bars = outro ? s.bars - 1 : s.bars;
      playRiff(b, [bass, sub], riff, spans, keyScale, s.startBar, bars, at, song, {
        lo: 31,
        hi: 50,
        v: 0.78,
        skip: (bar, bt) => version && (bar - s.startBar) % 4 === 3 && bt >= 2,
      });
      if (outro) {
        const last = spans[spans.length - 1]!;
        const root = 31 + pc(last.chord.root - 31);
        b.note(bass, last.t, Math.min(beat * 3, b.end - last.t - 0.4), root + (root < 36 ? 12 : 0), 0.8);
        b.note(sub, last.t, Math.min(beat * 3, b.end - last.t - 0.4), root + (root < 36 ? 12 : 0), 0.8);
      }
    } else {
      // A long intro: the bass enters halfway with a pickup.
      playRiff(b, [bass, sub], riffV, spans, keyScale, s.startBar + s.bars / 2, s.bars / 2, at, song, { lo: 31, hi: 50, v: 0.72 });
    }

    // ── Drums: one drop ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (intro && k < s.bars - 1 && s.bars > 2) {
        // Hats only, then the fill that brings the band in.
        if (k >= s.bars / 2) for (let e = 0; e < 8; e++) b.hit(hat, at(bar, e * 0.5), vel(song, e % 2 ? 0.42 : 0.3), 60, 0.2);
        continue;
      }
      if (intro) {
        fill(bar, true);
        continue;
      }
      if (outro && k >= s.bars - 1) break;
      const phraseEnd = k % 4 === 3;
      const sectionEnd = k === s.bars - 1;
      b.hit(kick, at(bar, 2), vel(song, 0.85));
      b.pump(at(bar, 2));
      if (phraseEnd && !sectionEnd && song.chance(0.65)) b.hit(spring, at(bar, 2), vel(song, 0.7));
      else b.hit(rim, at(bar, 2) + 0.003, vel(song, 0.72));
      if (version && k % 2 === 1 && song.chance(0.5)) b.hit(kick, at(bar, 3.5), vel(song, 0.55));
      if (sectionEnd) {
        fill(bar, s.part !== 'V');
        continue;
      }
      for (let e = 0; e < 8; e++) {
        const t = at(bar, e * 0.5);
        if (e === 7 && (k % 2 === 1 || song.chance(0.2))) {
          b.hit(ohat, t, vel(song, 0.5), 60, 0.5);
          continue;
        }
        b.hit(hat, t, vel(song, e % 2 ? 0.46 : 0.3), 60, 0.2);
        // A triplet skip on the hats now and then.
        if (e === 5 && song.chance(0.18 + D * 0.2)) b.hit(hat, t + beat / 3, vel(song, 0.32), 60, 0.15);
      }
    }

    // ── The tune ──
    if (s.part === 'V' && !(s.repeat === 0 && s.bars >= 8 && song.chance(0.25))) {
      const cells = strain(song, melV, s.repeat, mode === 'major' ? 4 : 1);
      singLine(b, lead, cells, spans, keyScale, s.startBar, s.bars, 62, 79, song, 0.62, 0.02);
    }
    if (s.part === 'C' || (outro && s.bars >= 4) || (intro && s.bars >= 4 && hornsLead)) {
      const cells = strain(song, hook, s.part === 'C' ? s.repeat : 0, 4);
      const startBar = intro ? s.startBar + s.bars - 3 : s.startBar;
      const bars = intro ? 2 : outro ? Math.min(2, s.bars - 2) : s.bars;
      if (hornsLead || s.part === 'C') {
        // Trumpet on the tune, trombone an octave below (a sixth below on the chorus repeats).
        const notes = cellNotes(b, cells, spans, keyScale, startBar, bars, 64, 79);
        for (const n of notes) {
          b.note(trumpet, n.t, Math.max(beat * 0.4, n.d * 0.92), n.p, vel(song, n.strong ? 0.66 : 0.58));
          const low = s.repeat > 0 && s.part === 'C' ? lowerHarmony(n.p, chordPcs(chordAtT(spans, n.t)), keyScale) : n.p - 12;
          b.note(bone, n.t + 0.008, Math.max(beat * 0.4, n.d * 0.92), low, vel(song, n.strong ? 0.64 : 0.56));
        }
      } else singLine(b, lead, cells, spans, keyScale, startBar, bars, 62, 79, song, 0.62, 0.02);
    }
  }
  if (fit.bars >= 12) fadeVelocities(b, b.end - Math.min(6, fit.barDur * 1.5), b.end, 0.4);

  return b.build({
    key: keyName(tonic, K.scale),
    progression: `${tVerse} / ${tChorus}`,
    fx: trackFx({
      gain: 0.32,
      lowpass: lerp(5500, 11000, B),
      highpass: 30,
      wow: 0.3 + G * 1.2,
      wowRate: 0.4,
      flutter: G * 0.03,
      drive: 0.12 + G * 0.25,
      delay: { time: beat * 0.75, feedback: 0.4, tone: 2200, wet: 0.5 },
      reverbTone: 4200,
      reverbLevel: 0.9,
    }),
  });
}

// ── Island ────────────────────────────────────────────────────────────────────

const ISLAND_A = ['Imaj7 IVmaj7', 'Imaj7 vi7 ii7 V7', 'I vi IV V', 'Imaj7 iii7 IVmaj7 V7sus', 'Imaj7 Imaj7 IVmaj7 IVmaj7', 'IVmaj7 iii7 ii7 Imaj7'];
const ISLAND_B = ['IVmaj7 IVmaj7 iii7 vi7 ii7 ii7 V7sus V7', 'ii7 V7 Imaj7 vi7', 'IVmaj7 V7 iii7 vi7', 'bVIImaj7 IVmaj7 Imaj7 Imaj7'];
const ISLAND_MINOR_A = ['i7 iv7', 'i7 bVIImaj7 bVImaj7 V7', 'iv7 bVII7 bIIImaj7 bVImaj7'];
const ISLAND_MINOR_B = ['bVImaj7 bVII7 i7 i7', 'iv7 iv7 bIIImaj7 V7'];

const ISLAND_BASS: (readonly [number, number])[][] = [
  [[0, 1], [1.5, 0.5], [2, 0.5], [2.5, 1], [3.5, 0.5], [4, 1], [5.5, 0.5], [6, 1], [7, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5], [4, 1.5], [5.5, 0.5], [6, 0.5], [6.5, 0.5], [7, 1]],
  [[0, 0.5], [0.5, 1], [2, 1], [3, 1], [4, 0.5], [4.5, 1], [6, 1], [7, 0.5], [7.5, 0.5]],
  [[0, 2], [2, 0.5], [2.5, 0.5], [3, 1], [4, 1.5], [5.5, 0.5], [6, 1.5], [7.5, 0.5]],
];

export function composeIslandReggae(req: TrackRequest): Score {
  const S = streams(req, 'island-reggae');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 66, density: 0.45, grit: 0.15, weirdness: 0.12, brightness: 0.55 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.15);
  const tonic = tonicFor(S, minor ? [2, 9, 4] : [0, 2, 5, 7, 9, 10]);
  const tA = song.pick(minor ? ISLAND_MINOR_A : ISLAND_A);
  const tB = song.pick(minor ? ISLAND_MINOR_B : ISLAND_B);
  const progA = parseProgression(tA, tonic);
  const progB = parseProgression(tB, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [60, 72]);
  const swing = feelFor(S, 0.59, 0.67);
  const tail = Math.min(4, Math.max(1, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const plan = planForm(
    fit.bars,
    fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 24 ? 4 : fit.bars >= 8 ? 2 : fit.bars >= 4 ? 1 : 0,
    [{ part: 'A', bars: 8 }, { part: 'A', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }, { part: 'S', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 2);
  const beat = b.beat;
  const at = (bar: number, bt: number) => swung(b, swing, bar, bt);
  const lazy = feel(song, 18 + (S.sig ? S.sig.swing * 6 : 0), 10);

  const leadPatch: SamplePatch | 'whistle' = style.weighted([['vibes', 4], ['steeldrum', 2], ['whistle', 1.2]]);
  const keysPatch: SamplePatch = style.weighted([['ep', 3], ['wurli', 2], ['piano', 1]]);
  const handDrum: SamplePatch = style.weighted([['bongo', 2], ['conga', 2]]);
  const strings = style.chance(0.75);

  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.55, lowpass: 1100, release: 0.08 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.6 });
  const rim = b.inst({ kind: 'sample', patch: 'rim', name: 'Cross-stick', gain: 0.5, reverb: 0.2, pan: 0.06 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.33, pan: 0.3, lowpass: lerp(6000, 10000, B) });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.25, pan: -0.32 });
  const drum = b.inst({ kind: 'sample', patch: handDrum, name: handDrum === 'bongo' ? 'Bongos' : 'Congas', gain: handDrum === 'bongo' ? 0.3 : 0.45, pan: -0.22, reverb: 0.12 });
  const gtr = b.inst({ kind: 'sample', patch: 'chorus-guitar', name: 'Chorus guitar', gain: 0.4, pan: -0.3, reverb: 0.15, release: 0.06, lowpass: 5000 });
  const keys = b.inst({ kind: 'sample', patch: keysPatch, name: 'Electric piano', gain: keysPatch === 'piano' ? 0.32 : 0.5, pan: 0.22, reverb: 0.22, lowpass: 3600, tremolo: keysPatch === 'piano' ? undefined : { rate: 3.2, depth: 0.25 } });
  const lead =
    leadPatch === 'whistle'
      ? b.inst({ kind: 'synth', patch: 'whistle', name: 'Whistler', gain: 0.26, pan: 0.05, reverb: 0.35, detune: weirdDetune(song, W, 15) })
      : b.inst({ kind: 'sample', patch: leadPatch, name: leadPatch === 'vibes' ? 'Vibraphone' : 'Steel pan', gain: leadPatch === 'vibes' ? 0.53 : 0.46, pan: 0.05, reverb: 0.32, tremolo: leadPatch === 'vibes' ? { rate: 4.2, depth: 0.4 } : undefined, detune: weirdDetune(song, W, 15) });
  const pad = strings ? b.inst({ kind: 'synth', patch: 'pad-strings', name: 'Strings', gain: 0.26, pan: 0, reverb: 0.4, lowpass: 2400, highpass: 200 }) : -1;

  const riff = makeRiff(song, ISLAND_BASS, 0.4 + D * 0.4);
  const riffB = makeRiff(song, ISLAND_BASS, 0.4 + D * 0.4);
  const melA = phrase(S, 'island-a', 8, 0.3 + D * 0.25, { restTail: 2, maxNotes: 4, maxLeap: 4 });
  const melB = phrase(S, 'island-b', 8, 0.28 + D * 0.25, { restTail: 2.5, maxNotes: 4, maxLeap: 3 });
  const kickOnOne = style.chance(0.5);
  let gV: number[] | null = null;
  let kV: number[] | null = null;
  let padV: number[] | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const solo = s.part === 'S';
    const prog: Chord[][] = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    if (outro) spans[spans.length - 1]!.chord = minor ? chord(tonic, 'm9') : chord(tonic, 'maj9');
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : solo ? 'solo' : s.name }, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const lastSpan = outro && k === spans.length - 1;
      gV = voiceChord(span.chord, gV, { low: 60, high: 76, voices: 4, rootless: false });
      kV = voiceChord(span.chord, kV, { low: 52, high: 69, voices: 4, rootless: true });
      if (pad >= 0 && (s.part === 'B' || solo || (s.part === 'A' && s.repeat >= 2) || lastSpan)) {
        padV = voiceChord(span.chord, padV, { low: 60, high: 79, voices: 3, rootless: true });
        padV.forEach((p) => b.note(pad, span.t, lastSpan ? b.end - span.t - 0.5 : span.dur + 0.1, p, 0.5));
      }
      if (lastSpan) {
        gV.forEach((p, j) => b.note(gtr, span.t + j * 0.05, Math.min(3, b.end - span.t - 0.4), p, 0.45));
        kV.forEach((p) => b.note(keys, span.t + 0.02, b.end - span.t - 0.4, p, 0.42));
        return;
      }
      if (intro && k === 0 && s.bars > 2) {
        // The keys alone, lazily, before the band arrives.
        kV.forEach((p, j) => b.note(keys, span.t + j * 0.04, span.dur * 0.9, p, 0.36));
        return;
      }
      // Skank on two and four: chorus guitar, keys a little behind it.
      for (const bt of [1, 3]) {
        if (bt >= span.beat + span.beats || bt < span.beat) continue;
        const t = lazy(at(span.bar, bt));
        gV.forEach((p, j) => b.note(gtr, t + j * 0.007, beat * 0.25, p, vel(song, 0.52, 0.04)));
        kV.forEach((p) => b.note(keys, t + 0.012, beat * 0.45, p, vel(song, 0.42, 0.04)));
      }
      // Rocksteady keys: a soft extra "chuk" on the "and" of four.
      if (song.chance(0.35 + D * 0.3)) kV.forEach((p) => b.note(keys, lazy(at(span.bar, span.beat + span.beats - 0.5)), beat * 0.25, p, vel(song, 0.28, 0.03)));
    });

    // ── Bass ──
    if (!intro || s.bars <= 2) {
      const bars = outro ? s.bars - 1 : s.bars;
      playRiff(b, bass, s.part === 'B' ? riffB : riff, spans, keyScale, s.startBar, bars, (bar, bt) => lazy(at(bar, bt)), song, { lo: 33, hi: 55, v: 0.72, gate: 0.85 });
      if (outro) {
        const last = spans[spans.length - 1]!;
        b.note(bass, last.t, Math.min(beat * 3, b.end - last.t - 0.4), 36 + pc(tonic - 36), 0.75);
      }
    } else playRiff(b, bass, riff, spans, keyScale, s.startBar + s.bars - 2, 2, (bar, bt) => lazy(at(bar, bt)), song, { lo: 33, hi: 55, v: 0.7, gate: 0.85 });

    // ── Drums: a gentle one-drop, hand drums and a shaker ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (intro && k < s.bars - 2) continue;
      if (outro && k >= s.bars - 1) break;
      if (kickOnOne && !intro) b.hit(kick, at(bar, 0), vel(song, 0.5));
      b.hit(kick, at(bar, 2), vel(song, 0.78));
      b.hit(rim, at(bar, 2) + 0.004, vel(song, 0.62));
      for (let e = 0; e < 8; e++) b.hit(hat, lazy(at(bar, e * 0.5)), vel(song, e % 2 ? 0.4 : 0.24), 60, 0.2);
      for (let e = 0; e < 8; e++) b.hit(shaker, lazy(at(bar, e * 0.5)), vel(song, e % 2 ? 0.4 : 0.26), 60, 0.2);
      if (!intro) {
        // Hand drums: an open tone on the "and" of two, a slap answering on four.
        b.hit(drum, lazy(at(bar, 1.5)), vel(song, 0.5), handDrum === 'conga' ? 55 : 60);
        b.hit(drum, lazy(at(bar, 3)), vel(song, 0.42), handDrum === 'conga' ? 62 : 64);
        if (song.chance(0.25 + D * 0.3)) b.hit(drum, lazy(at(bar, 3.5)), vel(song, 0.35), handDrum === 'conga' ? 55 : 60);
      }
      if (k === s.bars - 1 && !intro) for (let j = 0; j < 3; j++) b.hit(rim, at(bar, 3 + j / 3), vel(song, 0.32 + j * 0.08));
    }

    // ── The sweet lead ──
    const lo = leadPatch === 'whistle' ? 67 : 62;
    const hi = leadPatch === 'whistle' ? 86 : 81;
    if ((s.part === 'A' && (s.repeat > 0 || song.chance(0.7))) || s.part === 'B' || solo) {
      const base = s.part === 'B' ? melB : melA;
      const cells = strain(song, base, solo ? s.repeat + 2 : s.repeat, 4);
      const notes = cellNotes(b, cells, spans, keyScale, s.startBar, s.bars, lo, hi);
      for (const n of notes) {
        const t = lazy(n.t);
        if (leadPatch === 'steeldrum' && n.d >= beat * 1.4) {
          // Steel pans roll their long notes.
          const step = Math.min(0.09, beat / 4);
          for (let x = 0; x * step < n.d * 0.9; x++) b.note(lead, t + x * step, step * 2.5, n.p, vel(song, 0.5 - x * 0.012, 0.03));
        } else b.note(lead, t, leadPatch === 'whistle' ? n.d * 0.92 : Math.max(n.d, beat * 1.5), n.p, vel(song, n.strong ? 0.62 : 0.54));
        // Solos double the tune a sixth below now and then.
        if (solo && n.strong && song.chance(0.4)) b.note(lead, t + 0.01, Math.max(n.d, beat), lowerHarmony(n.p, chordPcs(chordAtT(spans, n.t)), keyScale), 0.42);
      }
    }
    if (intro && s.bars >= 4) {
      // A lazy pickup phrase on the lead into bar one.
      const notes = cellNotes(b, [melA], spans, keyScale, s.startBar + s.bars - 2, 2, lo, hi);
      for (const n of notes) b.note(lead, lazy(n.t), Math.max(n.d, beat), n.p, vel(song, 0.5));
    }
  }
  if (fit.bars >= 12) fadeVelocities(b, b.end - Math.min(8, fit.barDur * 2), b.end, 0.35);

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'major'),
    progression: `${tA} / ${tB}`,
    fx: trackFx({
      gain: 0.39,
      lowpass: lerp(6000, 12500, B),
      highpass: 32,
      wow: 0.25 + G * 1.2,
      wowRate: 0.3,
      flutter: G * 0.02,
      drive: 0.06 + G * 0.2,
      reverbTone: 5200,
      reverbLevel: 1,
    }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chordAtT(spans: readonly ChordSpan[], t: number): Chord {
  let found = spans[0]!;
  for (const s of spans) if (s.t <= t + 0.01) found = s;
  return found.chord;
}

/** The notes of four two-bar cells laid over `bars` bars from `startBar`. */
function cellNotes(b: ScoreBuilder, cells: readonly ReturnType<typeof strain>[number][], spans: readonly ChordSpan[], keyScale: readonly number[], startBar: number, bars: number, lo: number, hi: number) {
  const out: { t: number; d: number; p: number; strong: boolean }[] = [];
  const anchor = Math.round((lo + hi) / 2);
  for (let c = 0; c * 2 + 2 <= bars && c < 8; c++) {
    const cell = cells[c % cells.length]!;
    for (const n of realizeMotif(cell, 0, b.beat, anchor, spans, keyScale, lo, hi, b.grid, startBar + c * 2)) out.push(n);
  }
  return out;
}

/** Plays four cells as a singer would: a breath before each, the odd note held. */
function singLine(b: ScoreBuilder, inst: number, cells: ReturnType<typeof strain>, spans: readonly ChordSpan[], keyScale: readonly number[], startBar: number, bars: number, lo: number, hi: number, rng: Rng, v: number, lag: number): void {
  for (const n of cellNotes(b, cells, spans, keyScale, startBar, bars, lo, hi)) {
    b.note(inst, n.t + lag + rng.gauss() * 0.006, n.d * 0.94, n.p, vel(rng, n.strong ? v + 0.06 : v));
  }
}

/** A harmony a third or sixth below `p` that stays in the chord or the key. */
function lowerHarmony(p: number, tones: readonly number[], keyScale: readonly number[]): number {
  const third = [p - 3, p - 4].find((q) => tones.includes(pc(q)));
  if (third !== undefined) return third;
  const sixth = [p - 8, p - 9].find((q) => tones.includes(pc(q)));
  if (sixth !== undefined) return sixth;
  return nearestInSet(p - 4, keyScale);
}

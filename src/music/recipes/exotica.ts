// Exotica: the space station of 1958. A vibraphone with its motor on, bongos and congas
// in a bolero, a cha-cha or a jungle tom-tom beat, an upright bass, lush sevenths and
// ninths on a soft organ or a celesta, and a theremin that glides between notes with a
// wide, slow vibrato. A tam-tam opens the record; birds (and other things) call from the
// jungle between phrases. Major songs are breezy; minor ones lean phrygian and mysterious.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { bassPc, chordPcs, keyName, nearestInSet, notesInRange, parseProgression, prefersFlats, scalePcs, voiceChord, type Chord } from '../theory';
import { bassNote, chordAt, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune, type ChordSpan } from './common';
import { bpmFor, fadeVelocities, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';
import { strain } from './world-kit';

interface Tune {
  a: string;
  b: string;
  /** Key scale (semitones from the tonic). */
  scale: number[];
  mode: string;
}

const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PHRYGIAN_MINOR = [0, 1, 3, 5, 7, 8, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

const MAJOR_TUNES: Tune[] = [
  { a: 'Imaj7 bIIImaj7 Imaj7 bIIImaj7', b: 'IVmaj7 iv6 Imaj7 VI7', scale: MAJOR, mode: 'major' },
  { a: 'Imaj9 vi9 ii9 V13', b: 'iii7 VI7 ii7 V7', scale: MAJOR, mode: 'major' },
  { a: 'Imaj7 II7 ii7 V7', b: 'IVmaj7 bVII9 Imaj7 Imaj7', scale: MAJOR, mode: 'major' },
  { a: 'Imaj9 bVImaj7 Imaj9 bVImaj7', b: 'bIIImaj7 bVImaj7 bIImaj7 V7sus', scale: MAJOR, mode: 'major' },
  { a: 'Imaj7 II7 Imaj7 II7', b: 'viim7b5 III7 vi7 II7 ii7 V9sus', scale: LYDIAN, mode: 'lydian' },
];
const MINOR_TUNES: Tune[] = [
  { a: 'i6 bIImaj7 i6 bIImaj7', b: 'iv7 bIImaj7 V7b9 V7b9', scale: PHRYGIAN_MINOR, mode: 'phrygian' },
  { a: 'i9 iv9 bVImaj7 V7b9', b: 'bVImaj7 bIImaj7 V7b9 V7b9', scale: HARMONIC, mode: 'harmonic minor' },
  { a: 'i6 bVI7 i6 bVI7', b: 'iv9 bVII13 bIIImaj7 V7b9', scale: DORIAN, mode: 'dorian' },
  { a: 'imaj7 i7 bVImaj7 V7b9', b: 'iv9 iv9 i9 i9', scale: HARMONIC, mode: 'harmonic minor' },
];

type Groove = 'bolero' | 'cha-cha' | 'jungle';

/** Bass per bar: [beat, beats, what] — r root, f fifth, o octave, a approach to the next chord. */
const BASS: Record<Groove, [number, number, 'r' | 'f' | 'o' | 'a'][]> = {
  bolero: [[0, 1.4, 'r'], [1.5, 0.45, 'f'], [2, 0.9, 'r'], [3, 0.9, 'a']],
  'cha-cha': [[0, 0.9, 'r'], [1, 0.9, 'f'], [2, 0.9, 'r'], [3, 0.45, 'f'], [3.5, 0.45, 'a']],
  jungle: [[0, 0.9, 'r'], [1.5, 0.4, 'r'], [2, 0.9, 'f'], [3, 0.4, 'o'], [3.5, 0.4, 'f']],
};

export function composeExotica(req: TrackRequest): Score {
  const S = streams(req, 'exotica');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 100, density: 0.5, grit: 0.1, weirdness: 0.25, brightness: 0.6 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.42);
  const tune = song.pick(minor ? MINOR_TUNES : MAJOR_TUNES);
  const tonic = tonicFor(S, minor ? [2, 4, 9, 7] : [5, 10, 3, 0, 7]);
  const progA = parseProgression(tune.a, tonic);
  const progB = parseProgression(tune.b, tonic);
  const keyScale = scalePcs(tonic, tune.scale);
  const flats = prefersFlats(tonic, minor);
  const groove: Groove = style.weighted([['bolero', 3], ['cha-cha', 2], ['jungle', minor ? 2.5 : 1]]);
  const bpm = bpmFor(S, req, groove === 'bolero' ? [90, 104] : groove === 'cha-cha' ? [98, 112] : [94, 110]);
  const tail = Math.min(4, Math.max(1, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const plan = planForm(
    fit.bars,
    fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 24 ? 4 : fit.bars >= 8 ? 2 : fit.bars >= 4 ? 1 : 0,
    [{ part: 'A', bars: 8 }, { part: 'T', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }, { part: 'P', bars: 4 }, { part: 'T', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, groove === 'cha-cha' ? 0.5 : 0.53, tweaks, 4);
  const beat = b.beat;

  // ── The ensemble (palette from the style stream) ──
  const chordPatch: SamplePatch | SynthPatch = style.weighted([['organ', 3], ['celesta', 2], ['theatre-organ', 1]]);
  const vibes = b.inst({ kind: 'sample', patch: 'vibes', name: 'Vibraphone', gain: 0.55, pan: -0.28, reverb: 0.32, tremolo: { rate: style.range(3.5, 5.5), depth: 0.5 } });
  const theremin = b.inst({ kind: 'synth', patch: 'theremin', name: 'Theremin', gain: 0.32, pan: 0.18, reverb: 0.45, delay: 0.18, detune: weirdDetune(song, W, 20) });
  const keys =
    chordPatch === 'celesta'
      ? b.inst({ kind: 'sample', patch: 'celesta', name: 'Celesta', gain: 0.32, pan: 0.32, reverb: 0.4 })
      : b.inst({ kind: 'synth', patch: chordPatch as SynthPatch, name: chordPatch === 'organ' ? 'Organ' : 'Theatre organ', gain: chordPatch === 'organ' ? 0.15 : 0.2, pan: 0.25, reverb: 0.4, lowpass: 1800, tremolo: { rate: 0.6, depth: 0.35 } });
  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Upright bass', gain: 0.55, release: 0.1 });
  const bongo = b.inst({ kind: 'sample', patch: 'bongo', name: 'Bongos', gain: 0.3, pan: 0.42, reverb: 0.12 });
  const conga = b.inst({ kind: 'sample', patch: 'conga', name: 'Congas', gain: 0.38, pan: -0.4, reverb: 0.12 });
  const maracas = b.inst({ kind: 'sample', patch: 'shaker', name: 'Maracas', gain: 0.2, pan: 0.18 });
  const claves = b.inst({ kind: 'sample', patch: 'woodblock', name: 'Claves', gain: 0.18, pan: -0.15, reverb: 0.15 });
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Jungle drum', gain: 0.32, reverb: 0.25, pan: -0.05 });
  const birds = b.inst({ kind: 'sample', patch: 'jungle-bird', name: 'Birds', gain: 0.2, reverb: 0.55, pan: 0.5, highpass: 500, tremolo: { rate: 0.09, depth: 0.85 } });
  const gong = b.inst({ kind: 'sample', patch: 'crash', name: 'Tam-tam', gain: 0.32, reverb: 0.6, lowpass: 3200 });

  const melA = phrase(S, 'exotica-a', 8, 0.35 + D * 0.3, { restTail: 1.5, maxNotes: 5, maxLeap: 4 });
  const melT = phrase(S, 'exotica-t', 8, 0.18 + D * 0.15, { restTail: 1.5, minNotes: 1.5, maxNotes: 3, maxLeap: 5 });
  const melB = phrase(S, 'exotica-b', 8, 0.25 + D * 0.25, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  const bassLine = BASS[groove];
  let kV: number[] | null = null;
  let prevBass: number | null = null;

  const birdCall = (t: number, lots: boolean) => {
    const n = lots ? song.int(2, 3) : 1;
    for (let k = 0; k < n; k++) b.hit(birds, t + k * song.range(0.5, 1.3), vel(song, 0.5 + song.next() * 0.3), song.pick([55, 60, 62, 67, 72]), 1.6);
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const perc = s.part === 'P';
    const prog: Chord[][] = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 ? progA[0]![0]! : sp.chord));
    const name = intro ? 'intro' : outro ? 'outro' : perc ? 'percussion' : s.part === 'T' ? `theremin${s.repeat ? ' ' + (s.repeat + 1) : ''}` : s.name;
    b.section({ ...s, name }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);

    if (intro) {
      b.hit(gong, sT, 0.75, 38, 6);
      birdCall(sT + beat * 1.5, true);
    }
    if ((s.part === 'B' || perc) && song.chance(0.7)) birdCall(sT + beat * song.pick([2, 3]), perc);
    // The jungle answers the tune now and then, in the gap at the end of a phrase.
    if (!intro && !outro && !perc) for (let g = 3; g < s.bars; g += 4) if (song.chance(0.25 + W * 0.4)) birdCall(b.grid.at(s.startBar + g, song.pick([2, 2.5, 3])), false);

    // ── Chords: a soft organ held under everything, or a celesta rippling up ──
    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      kV = voiceChord(span.chord, kV, { low: 55, high: 74, voices: 4, rootless: true });
      if (perc && k < spans.length - 1) return;
      if (chordPatch === 'celesta') {
        const tones = notesInRange(chordPcs(span.chord), 67, 91);
        const n = last ? 6 : Math.round(span.beats * 2);
        for (let j = 0; j < n; j++) b.note(keys, span.t + j * beat * (last ? 0.33 : 0.5), beat * 1.5, tones[(j * 2) % tones.length]!, vel(song, j === 0 ? 0.5 : 0.36, 0.04));
      } else {
        kV.forEach((p) => b.note(keys, span.t, last ? b.end - span.t - 0.6 : span.dur * 0.98, p, vel(song, 0.5, 0.03)));
      }
    });

    // ── Bass ──
    if (!(intro && s.bars > 2)) {
      spans.forEach((span, k) => {
        const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
        prevBass = root;
        if (outro && k === spans.length - 1) {
          b.note(bass, span.t, Math.min(beat * 3, b.end - span.t - 0.3), root, 0.8);
          return;
        }
        const next = spans[k + 1] ?? span;
        const nextRoot = bassNote(bassPc(next.chord), root, 33, 45);
        for (const [bt, len, what] of bassLine) {
          if (bt < span.beat || bt >= span.beat + span.beats) continue;
          const fifth = root + 7 <= 50 ? root + 7 : root - 5;
          const p = what === 'r' ? root : what === 'f' ? fifth : what === 'o' ? (root + 12 <= 52 ? root + 12 : root) : nextRoot === root ? fifth : nextRoot + (nextRoot > root ? -1 : 1);
          b.note(bass, b.grid.at(span.bar, bt), len * beat, p, vel(song, bt === 0 ? 0.78 : 0.66));
        }
      });
    }

    // ── Percussion ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (intro && k < s.bars - 2 && s.bars > 2) {
        // Just the hand drums, far away, while the tam-tam rings.
        if (k >= 1) for (const bt of [1.5, 3, 3.5]) b.hit(conga, b.grid.at(bar, bt), vel(song, 0.4), bt === 1.5 ? 55 : 60);
        continue;
      }
      if (outro && k >= s.bars - 1) {
        b.hit(gong, b.grid.at(bar, 0), 0.5, 40, 5);
        break;
      }
      percBar(b, song, groove, bar, D, { bongo, conga, maracas, claves, tom });
      if (perc) {
        // The percussion break: the bongos take a solo.
        for (let st = 0; st < 16; st++) if (song.chance(0.45 + D * 0.3)) b.hit(bongo, b.grid.step(bar, st), vel(song, st % 4 === 0 ? 0.7 : 0.5), song.pick([60, 60, 64, 67]), 0.4);
      }
    }

    // ── The tune: vibes on A, theremin on T (vibes answer), both on B ──
    const range = { lo: 64, hi: 84 };
    if (s.part === 'A' || (s.part === 'B' && s.repeat % 2 === 1)) {
      const cells = strain(song, s.part === 'B' ? melB : melA, s.repeat, 4);
      for (const n of cellNotes(b, cells, spans, keyScale, s.startBar, s.bars, range.lo, range.hi)) {
        b.note(vibes, n.t + song.gauss() * 0.004, Math.max(n.d, beat * 1.2), n.p, vel(song, n.strong ? 0.66 : 0.56));
        // A second mallet a sixth below on the strong notes.
        if (n.strong && song.chance(0.5)) b.note(vibes, n.t, Math.max(n.d, beat), nearestInSet(n.p - 9, chordPcs(chordAt(spans, n.t).chord)), 0.42);
      }
    }
    if (s.part === 'T' || (s.part === 'B' && s.repeat % 2 === 0) || (outro && s.bars >= 2)) {
      const cells = strain(song, s.part === 'B' ? melB : melT, s.repeat, 2);
      const notes = outro ? [] : cellNotes(b, cells, spans, keyScale, s.startBar, s.bars, 62, 81);
      thereminLine(b, song, theremin, notes, sEnd, W);
      // The vibes answer in the theremin's breaths.
      if (s.part === 'T') {
        for (let c = 0; c + 2 <= s.bars; c += 2) {
          const t = b.grid.at(s.startBar + c + 1, 2.5);
          const tones = notesInRange(chordPcs(chordAt(spans, t).chord), 72, 88);
          tones.slice(0, 4).forEach((p, j) => b.note(vibes, t + j * beat * 0.25, beat, p, vel(song, 0.42)));
        }
      }
      if (outro) {
        // A last glide up to a high chord tone, held over the tam-tam.
        const last = spans[spans.length - 1]!;
        const top = nearestInSet(84, chordPcs(last.chord));
        b.note(theremin, last.t, Math.max(0.5, b.end - last.t - 0.8), top, 0.6, { from: top - 12, glide: beat * 1.5 });
      }
    }
  }
  if (fit.bars >= 12) fadeVelocities(b, b.end - Math.min(6, fit.barDur * 1.5), b.end, 0.45);

  return b.build({
    key: keyName(tonic, tune.mode),
    progression: `${tune.a} / ${tune.b} · ${groove}`,
    fx: trackFx({
      gain: 0.47,
      lowpass: lerp(6500, 13000, B),
      highpass: 38,
      wow: 0.2 + G * 1.2,
      wowRate: 0.4,
      flutter: G * 0.03,
      drive: 0.04 + G * 0.2,
      delay: { time: beat * 0.75, feedback: 0.35, tone: 3000, wet: 0.5 },
      reverbTone: 6500,
      reverbLevel: 1.35,
    }),
  });
}

function percBar(b: ScoreBuilder, rng: Rng, groove: Groove, bar: number, D: number, kit: { bongo: number; conga: number; maracas: number; claves: number; tom: number }): void {
  const s = (st: number) => b.grid.step(bar, st);
  // Maracas on the eighths (sixteenths when busy).
  for (let st = 0; st < 16; st += D > 0.6 ? 1 : 2) b.hit(kit.maracas, s(st) + rng.gauss() * 0.003, vel(rng, st % 4 === 0 ? 0.5 : st % 2 ? 0.25 : 0.38), 60, 0.2);
  if (groove === 'bolero') {
    // Bongo martillo (high slaps and open tones), congas on four, claves now and then.
    for (const [st, p, v] of [[0, 64, 0.55], [2, 60, 0.35], [4, 64, 0.5], [6, 60, 0.45], [8, 64, 0.55], [10, 60, 0.35], [12, 64, 0.5], [14, 67, 0.55]] as const) b.hit(kit.bongo, s(st), vel(rng, v), p, 0.4);
    for (const [st, p] of [[12, 55], [14, 55]] as const) b.hit(kit.conga, s(st), vel(rng, 0.55), p);
    if (bar % 2 === 0) for (const st of [0, 6, 12]) b.hit(kit.claves, s(st), vel(rng, 0.4), 72, 0.2);
  } else if (groove === 'cha-cha') {
    // The cha-cha-cha on four-and-one, cowbell-ish claves on the beat.
    for (const st of [0, 4, 8, 12]) b.hit(kit.claves, s(st), vel(rng, st === 0 ? 0.5 : 0.38), 74, 0.2);
    for (const [st, p, v] of [[4, 62, 0.5], [12, 55, 0.6], [14, 55, 0.5]] as const) b.hit(kit.conga, s(st), vel(rng, v), p);
    for (const [st, p] of [[6, 64], [7, 60], [10, 64], [11, 60]] as const) b.hit(kit.bongo, s(st), vel(rng, 0.45), p, 0.4);
  } else {
    // Jungle: a low tom pulse with a push, log-drum claves, congas answering.
    for (const [st, v] of [[0, 0.8], [6, 0.55], [8, 0.7], [14, 0.5]] as const) b.hit(kit.tom, s(st), vel(rng, v), st === 6 || st === 14 ? 52 : 48, 0.6);
    for (const [st, p] of [[3, 62], [10, 55], [11, 55]] as const) b.hit(kit.conga, s(st), vel(rng, 0.5), p);
    for (const st of [2, 5, 13]) b.hit(kit.claves, s(st), vel(rng, 0.35), 60, 0.2);
    if (rng.chance(0.4 + D * 0.3)) b.hit(kit.bongo, s(rng.pick([7, 9, 15])), vel(rng, 0.45), 64, 0.4);
  }
}

/** Four two-bar cells laid over `bars` bars. */
function cellNotes(b: ScoreBuilder, cells: ReturnType<typeof strain>, spans: readonly ChordSpan[], keyScale: readonly number[], startBar: number, bars: number, lo: number, hi: number) {
  const out: { t: number; d: number; p: number; strong: boolean }[] = [];
  const anchor = Math.round((lo + hi) / 2);
  for (let c = 0; c * 2 + 2 <= bars && c < 8; c++) {
    for (const n of realizeMotif(cells[c % cells.length]!, 0, b.beat, anchor, spans, keyScale, lo, hi, b.grid, startBar + c * 2)) out.push(n);
  }
  return out;
}

/** The theremin: legato, every note sliding in from the last, long notes held into the next. */
function thereminLine(b: ScoreBuilder, rng: Rng, inst: number, notes: { t: number; d: number; p: number; strong: boolean }[], until: number, W: number): void {
  let prev: number | null = null;
  notes.forEach((n, k) => {
    const next = notes[k + 1];
    const gap = next ? next.t - n.t : n.d;
    // Legato inside a phrase (small gap), a breath between phrases.
    const d = next && gap < b.beat * 2.2 ? gap + 0.04 : Math.min(n.d * 1.2, until - n.t - 0.05);
    if (d <= 0.05) return;
    const extra = prev !== null && Math.abs(prev - n.p) <= 12 ? { from: prev, glide: Math.min(0.28, 0.1 + Math.abs(prev - n.p) * 0.02) } : { from: n.p - (rng.chance(0.3 + W * 0.4) ? 5 : 1), glide: 0.12 };
    b.note(inst, n.t, d, n.p, vel(rng, n.strong ? 0.66 : 0.58, 0.04), extra);
    prev = next && gap < b.beat * 2.2 ? n.p : null;
  });
}


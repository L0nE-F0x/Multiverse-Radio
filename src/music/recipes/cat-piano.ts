// Cat piano: sleepy lo-fi, as programmed by a cat. Soft jazzy chords on a warm piano and
// a brushed beat that keeps nodding off; long silences with a purr in them; and every
// so often the cat walks across the keys with great enthusiasm (paws of two or three
// keys, a change of direction, then sitting down on the low end, or kneading). Now and
// then something gets knocked off the desk.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type PlannedSection, type SamplePatch, type Score } from '../score';
import { bassPc, chord, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';
import { bpmFor, feelFor, minorFor, phrase, streams, tonicFor } from './v3-kit';

const MAJOR = ['Imaj9 vi9 ii9 V13', 'IVmaj9 iii7 vi9 Imaj9', 'ii9 V13 Imaj9 Imaj9', 'Imaj9 IVmaj9 Imaj9 IVmaj9', 'IVmaj9 iv6 Imaj9 VI7b9'];
const MINOR = ['i9 iv9 bVIImaj9 bIIImaj7', 'i9 bVImaj9 iv9 v9', 'iv9 bVII13 bIIImaj9 bVImaj9'];

type Scene = 'doze' | 'nap' | 'walk' | 'knock';

export function composeCatPiano(req: TrackRequest): Score {
  const S = streams(req, 'cat-piano');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 68, density: 0.4, grit: 0.4, weirdness: 0.1, brightness: 0.42 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.3);
  const tonic = tonicFor(S);
  const tpl = song.pick(minor ? MINOR : MAJOR);
  const prog = parseProgression(tpl, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [60, 76]);
  const swing = feelFor(S, 0.56, 0.62);
  const tail = Math.min(4, Math.max(1, req.durationSeconds * 0.04));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;

  // The cat's temperament: how often it naps, how often it walks on the keys.
  const restless = style.range(0.3, 0.8);
  const plan = scenes(song, fit.bars, restless, D);

  const keysPatch: SamplePatch = style.weighted([['felt-piano', 3], ['ep', 2], ['piano', 1.5]]);
  const keys = b.inst({ kind: 'sample', patch: keysPatch, name: 'Sleepy keys', gain: 0.62, reverb: 0.25, pan: -0.08, lowpass: lerp(3000, 7000, B), tremolo: keysPatch === 'ep' ? { rate: 4, depth: 0.3 } : undefined });
  const cat = b.inst({ kind: 'sample', patch: keysPatch, name: 'The cat (on the keys)', gain: 0.5, reverb: 0.22, pan: 0.1, lowpass: lerp(5000, 10000, B) });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.4, lowpass: 1200 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.42 });
  const rim = b.inst({ kind: 'sample', patch: style.pick(['rim', 'snare-brush'] as const), name: 'Snare', gain: 0.5, reverb: 0.15, pan: 0.05 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.22, pan: 0.2, lowpass: 7000 });
  const purr = b.inst({ kind: 'sample', patch: 'purr', name: 'Purring', gain: 0.6, pan: 0.15, lowpass: 1500 });
  const desk = b.inst({ kind: 'sample', patch: 'clatter', name: 'Something on the desk', gain: 0.32, reverb: 0.25, pan: song.range(-0.5, 0.5) });
  const vinyl = b.inst({ kind: 'sample', patch: 'vinyl', name: 'Vinyl', gain: 0.12 + 0.2 * G });

  const motif = phrase(S, 'cat-keys', 8, 0.15 + D * 0.3, { restTail: 2, maxNotes: 3, maxLeap: 3 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  let chordIndex = 0;
  let dozes = 0;

  for (const s of plan) {
    const scene = s.part as Scene | 'intro' | 'outro';
    const spans = chordSpans(prog, s, b, chordIndex);
    chordIndex += s.bars;
    const outro = scene === 'outro';
    if (outro) {
      const last = spans[spans.length - 1]!;
      last.chord = minor ? chord(tonic, 'm9') : chord(tonic, 'maj9');
      last.dur = b.end - last.t;
    }
    const label: Record<string, string> = { doze: 'dozing', nap: 'silence (purring)', walk: 'cat on the keys', knock: 'something falls', intro: 'intro', outro: 'last chord' };
    b.section({ ...s, name: label[scene] ?? scene }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);

    if (scene === 'doze' || scene === 'intro' || outro) {
      dozes++;
      const drums = scene === 'doze' && song.chance(0.6);
      // The beat nods off: it stops after a bar or two, sometimes mid-bar.
      const drumBars = drums ? Math.min(s.bars, song.int(1, s.bars)) : 0;
      spans.forEach((span, k) => {
        const t = b.grid.at(span.bar, span.beat);
        voicing = voiceChord(span.chord, voicing, { low: 52, high: 74, voices: keysPatch === 'felt-piano' ? 5 : 4 });
        const last = outro && k === spans.length - 1;
        const d = last ? b.end - t - 0.3 : span.dur * 0.97;
        voicing.forEach((p, j) => b.note(keys, t + j * song.range(0.012, 0.03), d, p, vel(song, 0.4)));
        if (!last && span.beats >= 4 && song.chance(0.35)) for (const p of voicing.slice(1)) b.note(keys, b.grid.at(span.bar, span.beat + 2.5), beat * 1.2, p, vel(song, 0.3));
        if (scene !== 'intro') {
          const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
          prevBass = root;
          b.note(bass, t, last ? Math.min(3, d) : beat * 2.5, root, vel(song, 0.62));
          if (!last && span.beats >= 4 && song.chance(0.5)) b.note(bass, b.grid.at(span.bar, span.beat + 2.5), beat * 1.2, root + (song.chance(0.5) ? 7 : 0), vel(song, 0.5));
        }
      });
      for (let k = 0; k < drumBars; k++) {
        const bar = s.startBar + k;
        const sleepy = k === drumBars - 1 && song.chance(0.5);
        for (const st of [0, 10]) if (!(sleepy && st > 8)) b.hit(kick, b.grid.step(bar, st), vel(song, 0.7));
        for (const st of [4, 12]) if (!(sleepy && st > 8)) b.hit(rim, b.grid.step(bar, st) + 0.015, vel(song, 0.6));
        for (let st = 0; st < (sleepy ? 8 : 16); st += 2) b.hit(hat, b.grid.step(bar, st), vel(song, st % 4 ? 0.3 : 0.45), 60, 0.25);
      }
      // A little tune, if anyone's awake.
      if (scene === 'doze' && s.bars >= 2 && (dozes % 2 === 0 || song.chance(0.5))) {
        const m = dozes > 2 ? varyMotif(song, motif, 0.5) : motif;
        for (const n of realizeMotif(m, 0, beat, 74, spans, keyScale, 65, 84, b.grid, s.startBar)) b.note(keys, n.t + song.gauss() * 0.008, n.d, n.p, vel(song, 0.42));
      }
      if (outro && song.chance(0.4)) {
        // The cat gets the last word.
        b.note(cat, Math.max(sT + beat * 2, b.end - 1.6), 1.2, song.int(84, 96), 0.7);
      }
    } else if (scene === 'nap') {
      if (song.chance(0.6)) {
        b.hit(purr, sT + song.range(0.3, 1), vel(song, 0.7), 60, 3.6);
        if (sEnd - sT > 6 && song.chance(0.5)) b.hit(purr, sT + 3.9, vel(song, 0.6), 60, 3.6);
      }
    } else if (scene === 'walk') {
      catWalk(b, song, cat, sT + song.range(0, beat), Math.min(sEnd - sT, 3.6) - 0.2);
    } else if (scene === 'knock') {
      b.hit(desk, sT + song.range(0.2, 1.2), vel(song, 0.8), 60 + song.int(-3, 2), 1.7);
    }
  }
  b.note(vinyl, 0, b.end, 60, 1);
  const cut = lerp(3500, 9000, B) * (1.05 - 0.3 * G);
  b.auto('cutoff', 0, cut, 0);

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'major'),
    progression: tpl,
    fx: trackFx({
      gain: 0.42,
      lowpass: cut,
      highpass: 38,
      wow: 0.5 + G * 2 + W,
      wowRate: 0.4,
      flutter: 0.02 + G * 0.05,
      drive: 0.1 + G * 0.4,
      reverbTone: 4200,
      reverbLevel: 1.1,
    }),
  });
}

/** The night's running order: dozing, silences, a cat walking on the keys, a crash. */
function scenes(rng: Rng, bars: number, restless: number, density: number): PlannedSection[] {
  const out: PlannedSection[] = [];
  const counts: Record<string, number> = {};
  const push = (part: string, n: number) => {
    const startBar = out.length ? out[out.length - 1]!.startBar + out[out.length - 1]!.bars : 0;
    const repeat = counts[part] ?? 0;
    counts[part] = repeat + 1;
    out.push({ name: part, part, repeat, startBar, bars: n });
  };
  const outro = bars >= 6 ? 2 : bars >= 3 ? 1 : 0;
  const intro = bars >= 10 ? 2 : bars >= 5 ? 1 : 0;
  if (intro) push('intro', intro);
  let left = bars - intro - outro;
  let prev: Scene = 'doze';
  let sinceCat = 0;
  while (left > 0) {
    let scene: Scene;
    if (prev !== 'doze') scene = 'doze';
    else {
      const catDue = sinceCat >= 3;
      scene = rng.weighted([
        ['doze', 1.2 + density],
        ['nap', 0.9 * (1.4 - restless)],
        ['walk', (catDue ? 1.6 : 0.6) * restless],
        ['knock', 0.25 * restless],
      ] as const);
    }
    let n = scene === 'doze' ? rng.pick([2, 2, 4]) : scene === 'nap' ? rng.pick([1, 1, 2]) : 1;
    n = Math.min(n, left);
    push(scene, n);
    left -= n;
    sinceCat = scene === 'walk' ? 0 : sinceCat + 1;
    prev = scene;
  }
  if (outro) push('outro', outro);
  // A cat walk somewhere, even in a short track.
  if (!out.some((s) => s.part === 'walk')) {
    const candidate = out.find((s) => s.part === 'doze' && s.bars >= 2) ?? out.find((s) => s.part === 'nap');
    if (candidate) candidate.part = candidate.name = 'walk';
  }
  return out;
}

/** A cat crosses the keyboard: paws of a few adjacent keys, then it sits, or kneads. */
function catWalk(b: ScoreBuilder, rng: Rng, inst: number, t0: number, span: number): void {
  let t = t0;
  let p = rng.int(40, 88);
  let dir = p > 64 ? -1 : 1;
  const end = t0 + span;
  const steps = rng.int(8, 18);
  for (let k = 0; k < steps && t < end - 0.6; k++) {
    const paw = rng.weighted([[1, 2], [2, 3], [3, 2]] as const);
    const v = rng.range(0.6, 0.95);
    for (let j = 0; j < paw; j++) b.note(inst, t + j * rng.range(0, 0.012), rng.range(0.12, 0.35), p + j, Math.min(1, v + rng.range(-0.08, 0.08)));
    // Back paw lands near where the front one was.
    if (rng.chance(0.4)) b.note(inst, t + rng.range(0.03, 0.06), 0.15, p + rng.int(-1, 1), v * 0.8);
    t += rng.range(0.09, 0.22) * (k > steps * 0.6 ? 1.3 : 1);
    p += dir * rng.int(2, 5);
    if (p > 94 || p < 36 || rng.chance(0.12)) dir = -dir;
    p = Math.max(33, Math.min(96, p));
  }
  if (rng.chance(0.55)) {
    // It sits down on the low end and stays there.
    const base = rng.int(33, 45);
    const n = rng.int(4, 6);
    for (let j = 0; j < n; j++) b.note(inst, t + j * 0.015, Math.min(1.6, end - t), base + j * rng.int(1, 2), rng.range(0.6, 0.8));
  } else {
    // Kneading: two keys, back and forth.
    const a = rng.int(48, 80);
    for (let k = 0; t + k * 0.24 < end - 0.2 && k < 8; k++) b.note(inst, t + k * 0.24, 0.2, k % 2 ? a + rng.int(1, 3) : a, rng.range(0.45, 0.7));
  }
}

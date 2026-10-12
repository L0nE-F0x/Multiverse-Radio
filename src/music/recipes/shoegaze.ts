// Shoegaze: a dimension made of reverb. Quiet verses of chorused guitar arpeggios, then
// the wall: fuzz guitars strummed in eighths over a detuned, wobbling synth wall, with
// reverse-reverb swells rising into every chord change. Steady, straight drums drowned
// in the room, a melody buried somewhere in the haze, and a long feedback fade-out.

import type { TrackRequest } from '../index';
import { fitForm, type Score } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord, type ScaleName } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { bpmFor, guitarShape, minorFor, phrase, planForm, streams, strum, tonicFor } from './v3-kit';

const MAJOR: { prog: string; scale: ScaleName }[] = [
  { prog: 'Iadd9 Iadd9 IVmaj7 IVmaj7', scale: 'major' },
  { prog: 'Iadd9 bVIIadd9 IVadd9 Iadd9', scale: 'mixolydian' },
  { prog: 'vi7 IVmaj7 Iadd9 V', scale: 'major' },
  { prog: 'Imaj7 iii7 IVmaj7 iv6', scale: 'major' },
  { prog: 'IVmaj7 Imaj7 IVmaj7 Imaj7', scale: 'lydian' },
  { prog: 'Isus2 vi7 IVmaj7 IVmaj7', scale: 'major' },
];
const MINOR: { prog: string; scale: ScaleName }[] = [
  { prog: 'i9 bVImaj7 bIIImaj7 bVII', scale: 'minor' },
  { prog: 'i9 i9 iv9 bVImaj7', scale: 'minor' },
  { prog: 'bVImaj7 bVII i9 i9', scale: 'minor' },
];

export function composeShoegaze(req: TrackRequest): Score {
  const S = streams(req, 'shoegaze');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 100, density: 0.5, grit: 0.35, weirdness: 0.15, brightness: 0.45 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.35);
  const tonic = tonicFor(S, [2, 4, 7, 9, 11]);
  const tplV = song.pick(minor ? MINOR : MAJOR);
  let tplC = song.pick(minor ? MINOR : MAJOR);
  if (song.chance(0.4)) tplC = tplV;
  const progV = parseProgression(tplV.prog, tonic);
  const progC = parseProgression(tplC.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tplV.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [84, 118]);
  const tail = Math.min(4, Math.max(1, req.durationSeconds * 0.04));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const plan = planForm(
    fit.bars,
    fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 24 ? 6 : fit.bars >= 10 ? 2 : fit.bars >= 5 ? 1 : 0,
    [{ part: 'V', bars: 8 }, { part: 'C', bars: 8 }, { part: 'V', bars: 8 }, { part: 'C', bars: 8 }, { part: 'D', bars: 8 }, { part: 'C', bars: 16 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks, 4);
  const beat = b.beat;

  const wall = b.inst({ kind: 'synth', patch: 'fuzz-wall', name: 'Guitar wall', gain: 0.55, reverb: 0.6, pan: 0, detune: weirdDetune(song, W, 18) });
  const fuzz = b.inst({ kind: 'sample', patch: 'fuzz-guitar', name: 'Fuzz guitar', gain: 0.36, reverb: 0.45, pan: -0.35, release: 0.25 });
  const fuzz2 = b.inst({ kind: 'sample', patch: 'fuzz-guitar', name: 'Fuzz guitar 2', gain: 0.34, reverb: 0.45, pan: 0.38, detune: 9, release: 0.4 });
  const swells = b.inst({ kind: 'sample', patch: 'fuzz-guitar', name: 'Reverse swells', gain: 0.38, reverb: 0.5, pan: 0.1 });
  const clean = b.inst({ kind: 'sample', patch: 'chorus-guitar', name: 'Clean guitar', gain: 0.5, reverb: 0.5, delay: 0.4, pan: 0.25 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.4, pan: 0, lowpass: 900 });
  const voice = b.inst({ kind: 'synth', patch: style.pick(['crew', 'soft-lead'] as const), name: 'Buried voice', gain: 0.4, reverb: 0.75, delay: 0.45, pan: -0.05, lowpass: 2600 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.5 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-rock', name: 'Snare', gain: 0.5, reverb: 0.65, pan: 0.02 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.22, pan: 0.2, lowpass: 7000 });
  const ride = b.inst({ kind: 'sample', patch: 'ride', name: 'Ride wash', gain: 0.16, pan: -0.2, reverb: 0.4, lowpass: 7500 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.18, reverb: 0.5, pan: 0.25, lowpass: 8000 });
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Toms', gain: 0.28, reverb: 0.5 });
  const noise = b.inst({ kind: 'sample', patch: 'hiss', name: 'Haze', gain: 0.1, lowpass: 6000 });

  const arpShape = style.pick([[0, 2, 1, 3, 2, 4, 3, 1], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 4, 2, 1, 3, 4, 3]]);
  const lineV = phrase(S, 'gaze-verse', 8, 0.25 + D * 0.25, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  const lineC = phrase(S, 'gaze-chorus', 8, 0.2 + D * 0.2, { restTail: 1.5, maxNotes: 3, maxLeap: 4 });
  let wallV: number[] | null = null;
  let prevBass: number | null = null;
  const dark = lerp(3500, 8500, B);

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const loud = s.part === 'C';
    const drone = s.part === 'D';
    const prog = loud || drone ? progC : progV;
    const spans = chordSpans(intro || outro ? progC : prog, s, b);
    b.section({ ...s, name: intro ? 'intro' : outro ? 'fade' : loud ? 'wall' : drone ? 'drone' : 'verse' }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    b.auto('cutoff', sT, loud ? dark * 1.25 : drone ? dark * 0.7 : dark, beat);
    if (outro) b.auto('cutoff', sT + beat, 900, (sEnd - sT) / 2.5);
    if (loud) b.hit(crash, sT, 0.8, 60, 3);

    spans.forEach((span, k) => {
      const t = b.grid.at(span.bar, span.beat);
      const next = spans[k + 1];
      const lastHere = k === spans.length - 1;
      const shape = guitarShape(span.chord, { low: 40 });
      wallV = voiceChord(span.chord, wallV, { low: 50, high: 74, voices: 4, rootless: false, maxSpan: 17 });

      // The wall (and the long feedback fade at the end).
      if (loud || drone || intro || outro) {
        const d = outro && lastHere ? b.end - t - 0.6 : span.dur + 0.3;
        for (const p of wallV) b.note(wall, t, d, p, vel(song, loud ? 0.62 : 0.48, 0.03));
        if (outro && lastHere) b.note(wall, t, d, wallV[wallV.length - 1]! + 12, 0.4);
      }
      // Fuzz strums: eighths, down-up, two guitars a hair apart.
      if (loud) {
        for (let e = 0; e < Math.round(span.beats * 2); e++) {
          const at = b.grid.at(span.bar, span.beat + e * 0.5) + song.gauss() * 0.004;
          const down = e % 2 === 0;
          strum(b, fuzz, song, at, beat * 0.55, down ? shape.slice(0, 4) : shape.slice(2, 4), down ? 0.62 : 0.45, 0.012, down);
          if (e % 4 === 0) strum(b, fuzz2, song, at + 0.009, beat * 1.9, shape.slice(1, 4), 0.5, 0.014, true);
        }
      }
      // Reverse swell rising into the next chord.
      if (next && (loud || drone || intro) && span.beats >= 4 && (k % 2 === 1 || song.chance(0.3))) {
        const nShape = guitarShape(next.chord, { low: 45 }).slice(1, 5);
        for (const p of nShape) b.note(swells, next.t - b.fit.barDur, b.fit.barDur, p, vel(song, 0.55), { rev: true });
      }
      // Clean arpeggios in the verses.
      if (s.part === 'V' || (intro && k >= spans.length - 2)) {
        const pool = [...shape.slice(2), shape[shape.length - 1]! + 5];
        for (let e = 0; e < Math.round(span.beats * 2); e++) {
          const p = pool[arpShape[e % arpShape.length]! % pool.length]!;
          b.note(clean, b.grid.at(span.bar, span.beat + e * 0.5) + song.gauss() * 0.004, beat * 1.4, p + 12, vel(song, e % 4 === 0 ? 0.5 : 0.42));
        }
      }
      // Bass: root eighths in the wall, long roots in the verses.
      if (!intro && !(outro && lastHere && k > 0)) {
        const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
        prevBass = root;
        if (loud) for (let e = 0; e < Math.round(span.beats * 2); e++) b.note(bass, b.grid.at(span.bar, span.beat + e * 0.5), beat * 0.45, root, vel(song, e % 2 ? 0.6 : 0.72));
        else if (!drone) {
          b.note(bass, t, beat * 2.6, root, vel(song, 0.7));
          if (span.beats >= 4) b.note(bass, b.grid.at(span.bar, span.beat + 2.5), beat * 1.4, root, vel(song, 0.55));
        }
      }
    });

    // ── Drums: steady and straight, never in a hurry ──
    if (!intro && !drone && !outro) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        const fill = k === s.bars - 1 && song.chance(0.6);
        for (let st = 0; st < 16; st += 2) {
          const tt = b.grid.step(bar, st) + song.gauss() * 0.003;
          if (st === 0 || st === 8 || (st === 10 && loud && song.chance(0.5)) || (st === 6 && song.chance(0.2))) b.hit(kick, tt, vel(song, st === 0 ? 0.9 : 0.75));
          if ((st === 4 || st === 12) && !(fill && st === 12)) b.hit(snare, tt, vel(song, loud ? 0.88 : 0.7));
          if (fill && st >= 12) continue;
          if (loud) b.hit(ride, tt, vel(song, st % 4 === 0 ? 0.65 : 0.5), 60, 1.8);
          else b.hit(hat, tt, vel(song, st % 4 === 0 ? 0.5 : 0.36), 60, 0.25);
        }
        if (fill) for (let f = 0; f < 4; f++) b.hit(tom, b.grid.step(bar, 12 + f), 0.5 + f * 0.1, 64 - f * 4);
      }
    }

    // ── The buried melody ──
    if ((s.part === 'V' && s.repeat > 0) || loud) {
      const base = loud ? lineC : lineV;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        if (ph % 4 === 2 && song.chance(0.4)) continue;
        const m = ph >= 4 ? varyMotif(song, base, 0.5) : base;
        for (const n of realizeMotif(m, 0, beat, 69, spans, keyScale, 60, 79, b.grid, s.startBar + ph)) b.note(voice, n.t, n.d * 1.1, n.p, vel(song, 0.5), { from: n.p - 1, glide: 0.08 });
      }
    }
  }
  b.note(noise, 0, b.end, 60, 1);
  // A last fuzz chord for the fade, if there was no outro.
  if (!plan.some((s) => s.part === 'outro')) b.note(wall, Math.max(0, b.end - 2.5), 2, 50 + ((tonic - 50 + 120) % 12), 0.4);

  return b.build({
    key: keyName(tonic, tplV.scale),
    progression: tplC.prog === tplV.prog ? tplV.prog : `${tplV.prog} / ${tplC.prog}`,
    fx: trackFx({
      gain: 0.264,
      lowpass: dark,
      highpass: 38,
      q: 0.5,
      wow: 0.6 + G * 1.6 + W * 1.2,
      wowRate: 0.35,
      flutter: 0.02 + G * 0.04,
      drive: 0.3 + G * 0.4,
      delay: { time: beat * 0.75, feedback: 0.45, tone: 2600, wet: 0.45 },
      reverbTone: 4800,
      reverbLevel: 1.7,
    }),
  });
}

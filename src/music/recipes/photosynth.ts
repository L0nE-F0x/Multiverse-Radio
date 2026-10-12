// Photosynth: very slow, sunny ambient for houseplants. Warm major and lydian pads that
// change at the speed of growth, a plucked figure that unfurls one note at a time like
// a fern, the odd drop of water, birds on the other side of the glass, and the light
// coming and going as clouds pass (the filter, very slowly). No drums. No hurry.

import type { TrackRequest } from '../index';
import { fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { chord, chordPcs, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord, type ScaleName } from '../theory';
import { chordAt, chordSpans, lerp, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune } from './common';
import { bpmFor, planForm, streams, tonicFor } from './v3-kit';

const TEMPLATES: { prog: string; scale: ScaleName }[] = [
  { prog: 'Imaj9 Imaj9 II/I II/I', scale: 'lydian' },
  { prog: 'Imaj9 Imaj9 IVmaj9 IVmaj9', scale: 'major' },
  { prog: 'Imaj7#11 Imaj7#11 Imaj7#11 vi9 vi9 IVmaj9 IVmaj9 IVmaj9', scale: 'lydian' },
  { prog: 'IVmaj9 IVmaj9 Imaj9 Imaj9 vi9 vi9 V9sus V9sus', scale: 'major' },
  { prog: 'Iadd9 Iadd9 iii7 iii7 IVmaj7#11 IVmaj7#11 Iadd9 Iadd9', scale: 'major' },
  { prog: 'Imaj9 Imaj9 bVIImaj9 bVIImaj9', scale: 'mixolydian' },
];

export function composePhotosynth(req: TrackRequest): Score {
  const S = streams(req, 'photosynth');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 46, density: 0.35, grit: 0.05, weirdness: 0.1, brightness: 0.62 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = tonicFor(S, [0, 2, 4, 5, 7, 9]);
  const tpl = song.pick(TEMPLATES);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const pent = scalePcs(tonic, SCALES.majorPent);
  const flats = prefersFlats(tonic, false);
  const bpm = bpmFor(S, req, [40, 52]);
  const tail = Math.min(7, Math.max(1.5, req.durationSeconds * 0.06));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.08);
  const plan = planForm(fit.bars, fit.bars >= 8 ? 2 : fit.bars >= 4 ? 1 : 0, fit.bars >= 6 ? 2 : fit.bars >= 3 ? 1 : 0, [{ part: 'A', bars: 8 }, { part: 'B', bars: 8 }]);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks, 2);
  const beat = b.beat;

  const warmPatch: SynthPatch = style.weighted([['pad-warm', 3], ['pad-strings', 1]]);
  const warm = b.inst({ kind: 'synth', patch: warmPatch, name: 'Warm pad', gain: 0.42, reverb: 0.5, pan: -0.1 });
  const glass = b.inst({ kind: 'synth', patch: 'pad-glass', name: 'Glass pad', gain: 0.3, reverb: 0.6, pan: 0.15, detune: weirdDetune(song, W, 12) });
  const drone = b.inst({ kind: 'synth', patch: 'drone', name: 'Drone', gain: 0.4, reverb: 0.3 });
  const pluckPatch: SamplePatch = style.weighted([['kalimba', 3], ['nylon', 2.5], ['celesta', 1.5], ['vibes', 1]]);
  const pluck = b.inst({ kind: 'sample', patch: pluckPatch, name: 'Unfurling figure', gain: 0.42, reverb: 0.5, delay: 0.4, pan: song.range(-0.3, 0.3), tremolo: pluckPatch === 'vibes' ? { rate: 3, depth: 0.25 } : undefined });
  const drop = b.inst({ kind: 'sample', patch: style.pick(['glass', 'marimba', 'kalimba'] as const), name: 'Drops', gain: 0.28, reverb: 0.6, delay: 0.5, pan: song.range(-0.5, 0.5) });
  const birds = b.inst({ kind: 'sample', patch: 'birdsong', name: 'Birds outside', gain: 0.16, reverb: 0.4, pan: 0.35, lowpass: 6500 });

  // Pads: one long note per chord, crossfading into the next.
  const spansAll = plan.flatMap((s) => chordSpans(prog, s, b));
  for (const s of plan) b.section(s, chordSpans(prog, s, b).map((x) => x.chord), flats);
  const lastSpan = spansAll[spansAll.length - 1];
  if (lastSpan) lastSpan.chord = chord(tonic, 'maj9');
  let warmV: number[] | null = null;
  let glassV: number[] | null = null;
  let k = 0;
  while (k < spansAll.length) {
    const span = spansAll[k]!;
    let j = k + 1;
    while (j < spansAll.length && spansAll[j]!.chord === span.chord) j++;
    const end = j < spansAll.length ? spansAll[j]!.t : b.end;
    const last = j >= spansAll.length;
    const d = (last ? b.end - 0.6 : end + 2) - span.t;
    warmV = voiceChord(span.chord, warmV, { low: 52, high: 72, voices: 4, rootless: false, maxSpan: 19 });
    glassV = voiceChord(span.chord, glassV, { low: 67, high: 86, voices: 3, maxSpan: 14 });
    warmV.forEach((p, n) => b.note(warm, span.t + n * 0.3, d - n * 0.3, p, vel(song, 0.5, 0.03)));
    if (k > 0 || spansAll.length === 1) glassV.forEach((p, n) => b.note(glass, span.t + 1 + n * 0.5, d - 1 - n * 0.5, p, vel(song, 0.42, 0.03)));
    k = j;
  }
  // The drone: the tonic, re-struck every sixteen bars.
  for (let t = 0; t < b.end - 3; t += fit.barDur * 16) b.note(drone, t, Math.min(fit.barDur * 16 + 3, b.end - t - 0.5), 36 + pc(tonic), 0.55);

  // The unfurling figure: each time round it grows one note, until it is fully open,
  // then it rests and starts again from a single note.
  const maxLen = Math.round(lerp(5, 9, D));
  let len = 1;
  const stepBeats = song.pick([0.5, 0.5, 1]);
  for (let bar = plan[0]?.part === 'intro' ? plan[0].bars : 0; bar < fit.bars - 1; bar += 2) {
    const t0 = b.grid.bar(bar);
    const span = chordAt(spansAll, t0 + 0.01);
    const tones = chordPcs(span.chord);
    let p = nearestInSet(60 + pc(tonic - 60) + 12 * (song.chance(0.5) ? 0 : 1) - 5, tones);
    for (let n = 0; n < len; n++) {
      const t = t0 + n * stepBeats * beat + song.gauss() * 0.01;
      if (t > b.end - 3) break;
      b.note(pluck, t, beat * 3, p, vel(song, 0.42 + (n === len - 1 ? 0.08 : 0), 0.04));
      p = nearestInSet(p + song.pick([2, 3, 4, 5]), song.chance(0.75) ? tones : keyScale);
    }
    len = len >= maxLen ? (song.chance(0.5) ? 0 : 1) : len + 1;
  }

  // Drops of water and the birds outside.
  for (let t = fit.barDur * 2 + song.range(0, 6); t < b.end - 4; t += song.range(9, 22) / (0.6 + D)) {
    const span = chordAt(spansAll, t);
    const p = nearestInSet(song.int(79, 93), song.chance(0.6) ? chordPcs(span.chord) : pent);
    b.note(drop, t, beat * 2, p, vel(song, 0.38, 0.1));
    if (song.chance(0.3)) b.note(drop, t + beat * 0.25, beat * 2, nearestInSet(p - 5, pent), vel(song, 0.28, 0.08));
  }
  for (let t = song.range(6, 18); t < b.end - 3; t += song.range(14, 40)) {
    const calls = song.int(1, 3);
    for (let c = 0; c < calls; c++) b.hit(birds, t + c * song.range(0.9, 1.6), vel(song, 0.5, 0.15), 60 + song.int(-3, 3), 1);
  }

  // Clouds passing: the light comes and goes.
  const bright = lerp(4500, 11000, B);
  b.auto('cutoff', 0, bright * 0.35, 0);
  b.auto('cutoff', 0.1, bright, fit.barDur * 2);
  for (let t = fit.barDur * 6; t < b.end - fit.barDur * 4; t += fit.barDur * song.int(4, 8)) b.auto('cutoff', t, bright * song.range(0.45, 1), fit.barDur * 2);
  b.auto('cutoff', Math.max(0, b.end - fit.barDur * 2), bright * 0.5, fit.barDur);

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({
      gain: 0.62,
      lowpass: bright,
      highpass: 32,
      wow: 0.25 + G * 1.2 + W * 0.6,
      wowRate: 0.15,
      flutter: 0,
      drive: G * 0.2,
      delay: { time: beat * 1.5, feedback: 0.45, tone: 3000, wet: 0.4 },
      reverbTone: 5500,
      reverbLevel: 1.5,
    }),
  });
}

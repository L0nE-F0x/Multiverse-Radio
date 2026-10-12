// Ambient drift: no drums. A low drone, slow-breathing pads that change every few bars,
// sparse bells through a long echo, and the occasional gliding call from something large.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { SamplePatch, Score, SynthPatch } from '../score';
import { chordPcs, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { chordAt, chordSpans, layout, lerp, pickBpm, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune } from './common';
import { AMBIENT } from './templates';

export function composeAmbient(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'ambient-drift');
  const tweaks = resolveTweaks(req, { bpm: 64, density: 0.4, grit: 0.15, weirdness: 0.25, brightness: 0.45 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tpl = rng.pick(AMBIENT);
  let tpl2 = rng.pick(AMBIENT);
  for (let k = 0; k < 4 && tpl2.prog === tpl.prog; k++) tpl2 = rng.pick(AMBIENT);
  // Each chord lasts two bars (sometimes four): the harmony breathes.
  const stretch = rng.chance(0.35 - D * 0.2) ? 4 : 2;
  const progA = parseProgression(tpl.prog, tonic).flatMap((bar) => Array.from({ length: stretch }, () => bar));
  const progB = parseProgression(tpl2.prog, tonic).flatMap((bar) => Array.from({ length: stretch }, () => bar));
  const minorish = ['dorian', 'minor'].includes(tpl.scale);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const pent = scalePcs(tonic, minorish ? SCALES.minorPent : SCALES.majorPent);
  const flats = prefersFlats(tonic, minorish);
  const bpm = pickBpm(rng, req, [56, 70]);
  const unit = stretch * 4;
  const { fit, plan } = layout(req, bpm, 4, { unit, pattern: ['A', 'B'], intro: 2, outro: 2, tail: Math.min(8, req.durationSeconds * 0.06) });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const padPatch: SynthPatch = rng.weighted([['pad-glass', 3], ['pad-warm', 3], ['pad-choir', 2]]);
  const pad = b.inst({ kind: 'synth', patch: padPatch, name: padPatch === 'pad-choir' ? 'Choir pad' : padPatch === 'pad-glass' ? 'Glass pad' : 'Warm pad', gain: 0.5, reverb: 0.6, pan: 0 });
  const drone = b.inst({ kind: 'synth', patch: 'drone', name: 'Drone', gain: 0.55, reverb: 0.3 });
  const bellPatch: SamplePatch = rng.weighted([['glass', 3], ['celesta', 2], ['vibes', 2], ['kalimba', 1.5], ['musicbox', 1]]);
  const bell = b.inst({ kind: 'sample', patch: bellPatch, name: 'Bells', gain: 0.32, reverb: 0.7, delay: 0.55, pan: rng.range(-0.4, 0.4), detune: weirdDetune(rng, W, 20) });
  const whale = b.inst({ kind: 'synth', patch: 'whale', name: 'Distant calls', gain: 0.4, reverb: 0.8, delay: 0.3, pan: rng.range(-0.3, 0.3) });
  const texturePatch: SamplePatch | null = rng.weighted([['ocean', 3], ['hiss', 2], [null, 2]] as [SamplePatch | null, number][]);
  const texture = texturePatch ? b.inst({ kind: 'sample', patch: texturePatch, name: texturePatch === 'ocean' ? 'Ocean' : 'Air', gain: texturePatch === 'ocean' ? 0.32 : 0.18 }) : -1;

  let voicing: number[] | null = null;
  const allSpans = plan.flatMap((s) => chordSpans(s.part === 'B' ? progB : progA, s, b));
  for (const s of plan) {
    const spans = chordSpans(s.part === 'B' ? progB : progA, s, b);
    b.section(s, spans.map((x) => x.chord), flats);
  }

  // Pads: merge repeated chords into one long note, overlapping for a soft crossfade.
  let k = 0;
  while (k < allSpans.length) {
    const span = allSpans[k]!;
    let end = span.t + span.dur;
    let j = k + 1;
    while (j < allSpans.length && allSpans[j]!.chord === span.chord) {
      end = allSpans[j]!.t + allSpans[j]!.dur;
      j++;
    }
    voicing = voiceChord(span.chord, voicing, { low: 55, high: 79, voices: 4, maxSpan: 19 });
    const last = j >= allSpans.length;
    const d = (last ? b.end - 1 : end + 1.2) - span.t;
    voicing.forEach((p, idx) => b.note(pad, span.t + idx * 0.15, d - idx * 0.15, p, vel(rng, 0.5, 0.04)));
    k = j;
  }

  // Drone: tonic and fifth, re-struck every 16 bars with overlap.
  const droneLen = 16 * fit.barDur;
  for (let t = 0; t < b.end - 2; t += droneLen) {
    const d = Math.min(droneLen + 3, b.end - t - 0.5);
    b.note(drone, t, d, 36 + pc(tonic - 36 + 36), 0.6);
    b.note(drone, t + 0.5, d - 0.5, 43 + pc(tonic + 7 - 43), 0.42);
  }

  // Bells: sparse pentatonic notes, a little denser in B.
  const rate = 0.12 + D * 0.35; // notes per beat
  for (let t = fit.barDur * 1.5; t < b.end - 4; ) {
    const span = chordAt(allSpans, t);
    const pool = rng.chance(0.6) ? chordPcs(span.chord) : pent;
    const p = nearestInSet(rng.int(72, 91), pool);
    b.note(bell, t, beat * 3, p + (W > 0.5 && rng.chance(W - 0.5) ? rng.pick([-0.3, 0.3]) : 0), vel(rng, 0.35, 0.12));
    if (rng.chance(0.3)) b.note(bell, t + beat * rng.pick([0.5, 0.75, 1]), beat * 3, nearestInSet(p + rng.pick([-5, -3, 2, 4, 7]), pool), vel(rng, 0.28, 0.1));
    t += beat * (1 / rate) * rng.range(0.5, 1.6);
  }

  // Calls: long gliding phrases from somewhere deep.
  const calls = Math.floor((b.end / 60) * (0.6 + W * 1.6));
  for (let c = 0; c < calls; c++) {
    let t = rng.range(fit.barDur * 2, Math.max(fit.barDur * 2 + 1, b.end - 14));
    let p = nearestInSet(rng.int(50, 62), keyScale);
    const notes = rng.int(2, 4);
    for (let n = 0; n < notes; n++) {
      const next = nearestInSet(p + rng.pick([-7, -5, -3, 2, 3, 5, 7]), keyScale) + (W > 0.4 ? rng.range(-0.4, 0.4) * W : 0);
      const d = rng.range(1.6, 3.2);
      if (t + d > b.end - 3) break;
      b.note(whale, t, d, next, vel(rng, 0.5), { from: p, glide: rng.range(0.4, 1.1) });
      p = next;
      t += d * rng.range(0.85, 1.05);
    }
  }

  if (texture >= 0) b.note(texture, 0, b.end, 60, 1);
  // Slow breathing of the filter.
  const cut = lerp(2800, 9000, B);
  b.auto('cutoff', 0, cut * 0.4, 0);
  for (let t = 0.1, up = true; t < b.end - 6; t += fit.barDur * rng.int(2, 4), up = !up) b.auto('cutoff', t, up ? cut : cut * 0.6, fit.barDur);
  b.auto('cutoff', b.end - fit.barDur * 2, cut * 0.35, fit.barDur);

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: `${tpl.prog} / ${tpl2.prog}`,
    fx: trackFx({
      gain: 0.42,
      lowpass: cut,
      highpass: 30,
      wow: 0.4 + G * 1.5,
      wowRate: 0.2,
      flutter: 0,
      drive: G * 0.25,
      delay: { time: beat * 1.5, feedback: 0.55, tone: 2400, wet: 0.5 },
      reverbTone: 5500,
      reverbLevel: 1.6,
    }),
  });
}

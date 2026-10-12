// Muzak / hold music: a polite bossa groove, strings, comping keys or nylon guitar and
// a sweet flute or vibes melody that means well. Weirder dimensions add tape hiccups.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { SamplePatch, Score } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { MUZAK } from './templates';

/** Bossa clave over two bars (16th steps). */
const CLAVE = [
  [0, 6, 12],
  [4, 10],
];
/** Comping "batida" pushes, one bar (16th steps, length in 16ths). */
const BATIDA: [number, number][][] = [
  [[0, 2], [3, 2], [6, 3], [10, 2], [12, 3]],
  [[0, 3], [4, 2], [7, 3], [10, 2], [14, 2]],
  [[2, 2], [6, 2], [8, 3], [12, 2], [15, 1]],
];

export function composeMuzak(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'muzak');
  const tweaks = resolveTweaks(req, { bpm: 100, density: 0.45, grit: 0.25, weirdness: 0.15, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tplA = rng.pick(MUZAK);
  let tplB = rng.pick(MUZAK);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(MUZAK);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [90, 112]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A'] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.5, 0.54), tweaks);
  const beat = b.beat;

  const compPatch: SamplePatch = rng.weighted([['nylon', 4], ['ep', 3], ['vibes', 2]]);
  const comp = b.inst({ kind: 'sample', patch: compPatch, name: compPatch === 'nylon' ? 'Nylon guitar' : compPatch === 'ep' ? 'Electric piano' : 'Vibraphone', gain: compPatch === 'nylon' ? 0.7 : 0.55, pan: -0.2, reverb: 0.2, tremolo: compPatch === 'ep' ? { rate: 4.5, depth: 0.3 } : undefined });
  const strings = b.inst({ kind: 'synth', patch: 'pad-strings', name: 'Strings', gain: 0.4, reverb: 0.4, pan: 0.1 });
  const leadFlute = rng.chance(0.6);
  const lead = leadFlute
    ? b.inst({ kind: 'synth', patch: 'flute', name: 'Flute', gain: 0.55, reverb: 0.35, pan: 0.15, detune: weirdDetune(rng, W, 25) })
    : b.inst({ kind: 'sample', patch: 'vibes', name: 'Vibraphone', gain: 0.5, reverb: 0.35, pan: 0.15, tremolo: { rate: 5, depth: 0.35 }, detune: weirdDetune(rng, W, 25) });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.5 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.38 });
  const rim = b.inst({ kind: 'sample', patch: 'rim', name: 'Rim click', gain: 0.45, pan: 0.1, reverb: 0.1 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.22, pan: -0.3 });

  const [lo, hi] = leadFlute ? [67, 86] : [64, 84];
  const motifA = makeMotif(rng, 8, 0.3 + D * 0.3, { restTail: 1.5, maxNotes: 4, maxLeap: 3 });
  const motifB = makeMotif(rng, 8, 0.25 + D * 0.3, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  const batida = rng.pick(BATIDA);
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  const hiccups = W > 0.3 ? rng.int(1, 3) : 0;
  const hiccupBars = new Set<number>();
  for (let k = 0; k < hiccups; k++) hiccupBars.add(rng.int(6, Math.max(7, fit.bars - 6)));

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const prog = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    b.section(s, spans.map((x) => x.chord), flats);
    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      voicing = voiceChord(span.chord, voicing, { low: 53, high: 74, voices: 4 });
      // Strings: lush in B and later A's.
      if (s.part === 'B' || s.repeat > 1 || last) for (const p of voicing.slice(0, 3)) b.note(strings, span.t, last ? b.end - span.t - 0.5 : span.dur + 0.05, p + 12, 0.45);
      // Comping
      if (last) {
        voicing.forEach((p, j) => b.note(comp, span.t + j * 0.04, b.end - span.t - 0.4, p, 0.5));
      } else {
        const steps = Math.round(span.beats * 4);
        for (const [st, len] of batida) {
          if (st >= steps) continue;
          const t = b.grid.step(span.bar, st + span.beat * 4) + rng.gauss() * 0.004;
          for (const p of st % 4 === 0 ? voicing : voicing.slice(1)) b.note(comp, t, len * beat * 0.25 * 0.9, p, vel(rng, st === 0 ? 0.5 : 0.42));
        }
      }
      // Bass: root and fifth, the odd approach.
      if (!(intro && k === 0)) {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 46);
        prevBass = root;
        const fifth = root + 7 <= 50 ? root + 7 : root - 5;
        b.note(bass, b.grid.at(span.bar, span.beat), (last ? 3 : 1.4) * beat, root, vel(rng, 0.72));
        if (!last && span.beats >= 4) {
          b.note(bass, b.grid.at(span.bar, span.beat + 1.5), 0.45 * beat, fifth, vel(rng, 0.55));
          b.note(bass, b.grid.at(span.bar, span.beat + 2), 1.4 * beat, fifth, vel(rng, 0.62));
        }
      }
    });

    if (!intro && !outro) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        for (const st of [0, 8]) b.hit(kick, b.grid.step(bar, st), vel(rng, 0.7));
        b.hit(kick, b.grid.step(bar, 7), vel(rng, 0.4));
        for (const st of CLAVE[k % 2]!) b.hit(rim, b.grid.step(bar, st) + rng.gauss() * 0.003, vel(rng, 0.6));
        for (let st = 0; st < 16; st++) b.hit(shaker, b.grid.step(bar, st), vel(rng, st % 4 === 0 ? 0.5 : st % 2 ? 0.25 : 0.38), 60, 0.3);
        if (hiccupBars.has(bar)) {
          // "Your call is important to us": the tape hiccups.
          b.auto('tapestop', b.grid.at(bar, 3), beat * 0.6, 0);
          b.auto('tapestop', b.grid.bar(bar + 1), 0, 0);
        }
      }
      const motif = s.part === 'B' ? motifB : s.repeat > 0 ? varyMotif(rng, motifA, 0.25) : motifA;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        if (ph === 6 && rng.chance(0.5)) continue;
        const m = ph === 4 ? varyMotif(rng, motif, 0.5) : motif;
        for (const n of realizeMotif(m, 0, beat, Math.round((lo + hi) / 2), spans, keyScale, lo, hi, b.grid, s.startBar + ph)) {
          b.note(lead, n.t, n.d, n.p, vel(rng, n.strong ? 0.62 : 0.54));
        }
      }
    }
  }

  return b.build({
    key: keyName(tonic, 'major'),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.4,
      lowpass: lerp(5000, 12000, B) * (1 - G * 0.35),
      highpass: 40 + G * 140,
      wow: G * 1.5 + W,
      wowRate: 0.5,
      flutter: G * 0.05,
      drive: 0.1 + G * 0.3,
      reverbTone: 5000,
      reverbLevel: 1,
    }),
  });
}

// Tropical marimba: syncopated marimba patterns over a tresillo bass, a steel-drum tune,
// congas, bongos and shakers, and waves on the shore.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { TROPICAL } from './templates';

/** Marimba comping patterns: 16th step and voicing index. */
const MARIMBA: [number, number][][] = [
  [[0, 0], [3, 2], [6, 1], [8, 0], [11, 2], [14, 1]],
  [[0, 1], [2, 2], [4, 0], [7, 2], [10, 1], [12, 0], [14, 2]],
  [[0, 0], [3, 1], [5, 2], [8, 1], [10, 2], [13, 0]],
];

export function composeTropical(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'tropical-marimba');
  const tweaks = resolveTweaks(req, { bpm: 108, density: 0.55, grit: 0.1, weirdness: 0.15, brightness: 0.65 });
  const { density: D, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tplA = rng.pick(TROPICAL);
  let tplB = rng.pick(TROPICAL);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(TROPICAL);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [98, 118]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B'] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.5, 0.55), tweaks);
  const beat = b.beat;

  const marimba = b.inst({ kind: 'sample', patch: 'marimba', name: 'Marimba', gain: 0.8, pan: -0.15, reverb: 0.18 });
  const steel = b.inst({ kind: 'sample', patch: 'steeldrum', name: 'Steel drum', gain: 0.7, pan: 0.2, reverb: 0.25, detune: weirdDetune(rng, W, 25) });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.55 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.45 });
  const clap = b.inst({ kind: 'sample', patch: rng.chance(0.5) ? 'rim' : 'clap', name: 'Rim/clap', gain: 0.9, pan: 0.05, reverb: 0.15 });
  const conga = b.inst({ kind: 'sample', patch: 'conga', name: 'Congas', gain: 0.45, pan: 0.3 });
  const bongo = b.inst({ kind: 'sample', patch: 'bongo', name: 'Bongos', gain: 0.32, pan: -0.35 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.22, pan: -0.2 });
  const bell = b.inst({ kind: 'sample', patch: 'cowbell', name: 'Cowbell', gain: 0.3, pan: 0.4 });
  const ocean = b.inst({ kind: 'sample', patch: 'ocean', name: 'Waves', gain: 0.22 });

  const pattern = rng.pick(MARIMBA);
  const motifA = makeMotif(rng, 8, 0.4 + D * 0.35, { restTail: 1.5, maxNotes: 5, grid: 0.5 });
  const motifB = makeMotif(rng, 8, 0.35 + D * 0.35, { restTail: 1.5, maxNotes: 5, grid: 0.5 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(s.part === 'B' ? progB : progA, s, b);
    b.section(s, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      voicing = voiceChord(span.chord, voicing, { low: 60, high: 79, voices: 3, rootless: false });
      if (last) {
        // A marimba roll on the final chord.
        const rollEnd = b.end - span.t - 1;
        for (let t = 0; t < rollEnd; t += beat / 6) b.note(marimba, span.t + t, beat * 0.4, voicing[Math.floor(t / (beat / 6)) % voicing.length]!, 0.35 * (1 - t / rollEnd) + 0.1);
      } else {
        for (const [st, vi] of pattern) {
          if (st >= span.beats * 4) continue;
          b.note(marimba, b.grid.step(span.bar, st + span.beat * 4) + rng.gauss() * 0.003, beat * 0.6, voicing[vi % voicing.length]!, vel(rng, st % 4 === 0 ? 0.62 : 0.5));
        }
      }
      if (!intro || k >= 2) {
        const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
        prevBass = root;
        const fifth = root + 7 <= 48 ? root + 7 : root - 5;
        if (last) b.note(bass, span.t, beat * 3, root, 0.8);
        else
          for (const [st, p, len] of [[0, root, 1.4], [6, root, 0.9], [12, fifth, 0.9]] as const) {
            if (st < span.beats * 4) b.note(bass, b.grid.step(span.bar, st + span.beat * 4), len * beat, p, vel(rng, st === 0 ? 0.8 : 0.65));
          }
      }
    });

    if (!intro && !outro) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        b.hit(kick, b.grid.step(bar, 0), vel(rng, 0.8));
        b.hit(kick, b.grid.step(bar, 8), vel(rng, 0.7));
        for (const st of [4, 12]) b.hit(clap, b.grid.step(bar, st), vel(rng, 0.6));
        for (let st = 0; st < 16; st++) b.hit(shaker, b.grid.step(bar, st), vel(rng, st % 4 === 0 ? 0.5 : st % 2 ? 0.25 : 0.38), 60, 0.25);
        // Congas: low open tones on 4-and, slaps up high.
        for (const [st, p, v] of [[6, 55, 0.7], [7, 55, 0.6], [14, 62, 0.75], [15, 62, 0.6], [3, 62, 0.4]] as const) b.hit(conga, b.grid.step(bar, st), vel(rng, v), p);
        if (D > 0.4) for (const st of [2, 10, 11]) b.hit(bongo, b.grid.step(bar, st), vel(rng, 0.5), st === 11 ? 64 : 60);
        if (s.part === 'B' && D > 0.5) for (const st of [0, 6, 12]) b.hit(bell, b.grid.step(bar, st), vel(rng, 0.5));
      }
      const motif = s.part === 'B' ? motifB : s.repeat > 0 ? varyMotif(rng, motifA, 0.3) : motifA;
      if (s.part === 'B' || s.repeat > 0 || rng.chance(0.4)) {
        for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
          if (ph === 6 && rng.chance(0.5)) continue;
          for (const n of realizeMotif(ph === 4 ? varyMotif(rng, motif, 0.5) : motif, 0, beat, 76, spans, keyScale, 64, 86, b.grid, s.startBar + ph)) {
            b.note(steel, n.t, n.d, n.p, vel(rng, n.strong ? 0.65 : 0.55));
          }
        }
      }
    }
  }
  b.note(ocean, 0, b.end, 60, 1);

  return b.build({
    key: keyName(tonic, 'major'),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.335,
      lowpass: lerp(7000, 16000, B),
      highpass: 35,
      wow: W * 1.5,
      wowRate: 0.45,
      flutter: 0,
      drive: 0.05,
      reverbTone: 7000,
      reverbLevel: 0.9,
    }),
  });
}

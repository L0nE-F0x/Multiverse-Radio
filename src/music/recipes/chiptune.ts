// Chiptune: two pulse channels (lead + tracker arpeggios), a stepped-triangle bass and
// noise drums. Catchy, repetitive phrases with an echo channel, like an old console.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chordPcs, keyName, parseProgression, pc, prefersFlats, SCALES, scalePcs } from '../theory';
import { bassNote, chordSpans, layout, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';
import { CHIPTUNE } from './templates';

export function composeChiptune(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'chiptune');
  const tweaks = resolveTweaks(req, { bpm: 140, density: 0.6, grit: 0.1, weirdness: 0.15, brightness: 0.7 });
  const { density: D, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tplA = rng.pick(CHIPTUNE);
  let tplB = rng.pick(CHIPTUNE);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(CHIPTUNE);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  const minor = tplA.scale !== 'major' && tplA.scale !== 'mixolydian';
  const keyScale = scalePcs(tonic, SCALES[tplA.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [124, 160]);
  const shuffle = rng.chance(0.25);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B', 'A', 'B', 'C', 'B'], intro: 2, outro: 2 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, shuffle ? 0.62 : 0.5, tweaks);
  const beat = b.beat;

  const leadPatch = rng.pick(['chip-pulse25', 'chip-pulse12', 'chip-square'] as const);
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: 'Pulse lead', gain: 0.6, pan: 0.1 });
  const echo = b.inst({ kind: 'synth', patch: leadPatch, name: 'Echo', gain: 0.3, pan: -0.35 });
  const arp = b.inst({ kind: 'synth', patch: leadPatch === 'chip-pulse12' ? 'chip-pulse25' : 'chip-pulse12', name: 'Arpeggio', gain: 0.8, pan: -0.15 });
  const tri = b.inst({ kind: 'synth', patch: 'chip-tri', name: 'Triangle bass', gain: 0.7 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-chip', name: 'Noise kick', gain: 0.6 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-chip', name: 'Noise snare', gain: 0.4 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-chip', name: 'Noise hat', gain: 0.22 });

  const motif = makeMotif(rng, 8, 0.55 + D * 0.4, { restTail: 1, maxNotes: 7, maxLeap: 4 });
  const motifB = makeMotif(rng, 8, 0.5 + D * 0.4, { restTail: 1, maxNotes: 7 });
  const motifC = makeMotif(rng, 8, 0.35 + D * 0.3, { restTail: 2, maxNotes: 5, grid: 0.5 });
  const arpRate = rng.pick([1 / 30, 1 / 20, 1 / 24]);
  const bassStyle = rng.int(0, 2);
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const prog = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    b.section(s, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 33, 47);
      prevBass = root;
      // Triangle bass.
      const eighths = Math.round(span.beats * 2);
      for (let e = 0; e < eighths; e++) {
        if (last && e > 0) break;
        const p = bassStyle === 0 ? root + (e % 2 ? 12 : 0) : bassStyle === 1 ? root + [0, 0, 7, 12][e % 4]! : root + (e % 4 === 3 ? 7 : 0);
        b.note(tri, span.t + e * beat * 0.5, (last ? 2 : 0.42) * beat, p, 0.8);
      }
      // Tracker arpeggios through the chord (in B, C and the outro).
      if (s.part === 'B' || s.part === 'C' || last || (intro && D > 0.5)) {
        const offsets = chordPcs(span.chord).map((t) => pc(t - span.chord.root)).slice(0, 4).sort((x, y) => x - y);
        const base = 60 + pc(span.chord.root - 60 + 60);
        const hits = last ? [[0, b.end - span.t - 0.5]] : s.part === 'C' ? [[0, span.beats]] : [[0, 1.5], [2, 0.75], [3, 0.75]];
        for (const [x, len] of hits) b.note(arp, span.t + x! * beat, len! * beat * (last ? 1 : 0.95), base, 0.55, { arp: offsets, arpRate });
      }
    });

    if (!outro) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        const fill = k % 4 === 3;
        b.hit(kick, b.grid.at(bar, 0), 0.9);
        b.hit(kick, b.grid.at(bar, 2), 0.85);
        if (D > 0.5 && !intro) b.hit(kick, b.grid.at(bar, 2.5), 0.6);
        if (!intro || k === s.bars - 1) {
          b.hit(snare, b.grid.at(bar, 1), 0.8);
          if (!fill) b.hit(snare, b.grid.at(bar, 3), 0.8);
          else for (let f = 0; f < 4; f++) b.hit(snare, b.grid.at(bar, 3 + f * 0.25), 0.5 + f * 0.12);
        }
        for (let st = 0; st < 8; st++) b.hit(hat, b.grid.at(bar, st * 0.5), st % 2 ? 0.45 : 0.65, 60, 0.1);
      }
    } else {
      b.hit(kick, b.grid.bar(s.startBar + s.bars - 1), 0.9);
    }

    // Lead: AABA phrases with an echo a dotted-eighth behind.
    if (!intro && !outro) {
      const base = s.part === 'B' ? motifB : s.part === 'C' ? motifC : motif;
      const m = s.repeat > 0 && s.part !== 'C' ? varyMotif(rng, base, 0.25) : base;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const phrase = ph / 2;
        const use = phrase === 2 ? varyMotif(rng, m, 0.6) : phrase === 3 ? varyMotif(rng, m, 0.35) : m;
        const notes = realizeMotif(use, 0, beat, 76, spans, keyScale, 67, 88, b.grid, s.startBar + ph);
        for (const n of notes) {
          const p = n.p + (W > 0.5 && rng.chance((W - 0.5) * 0.3) ? 12 : 0);
          const slide = W > 0.3 && rng.chance(W * 0.2) ? { from: p - 2, glide: 0.04 } : {};
          b.note(lead, n.t, Math.min(n.d, beat * 1.5), p, vel(rng, n.strong ? 0.75 : 0.65, 0.03), slide);
          b.note(echo, n.t + beat * 0.75, Math.min(n.d, beat), p, 0.5);
        }
      }
    }
  }

  return b.build({
    key: keyName(tonic, tplA.scale),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.47,
      lowpass: 9000 + B * 9000,
      highpass: 40,
      wow: W * 1.2,
      wowRate: 0.5,
      flutter: 0,
      drive: 0,
      reverbTone: 6000,
      reverbLevel: 0.25,
    }),
  });
}

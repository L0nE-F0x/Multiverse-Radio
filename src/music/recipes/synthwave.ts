// Synthwave: minor-key triads, octave-bouncing bass, 16th-note arps through a dotted
// echo, warm pads, gated snares with a big room, and a saw lead for the choruses.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chordPcs, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { SYNTHWAVE } from './templates';

export function composeSynthwave(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'synthwave');
  const tweaks = resolveTweaks(req, { bpm: 100, density: 0.55, grit: 0.15, weirdness: 0.15, brightness: 0.6 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tplA = rng.pick(SYNTHWAVE);
  let tplB = rng.pick(SYNTHWAVE);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(SYNTHWAVE);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tplA.scale]);
  const flats = prefersFlats(tonic, true);
  const bpm = pickBpm(rng, req, [88, 112]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B', 'A', 'B', 'C', 'B'] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const lowCut = lerp(4000, 14000, B);
  const det = weirdDetune(rng, W, 30);
  const bass = b.inst({ kind: 'synth', patch: 'synth-bass', name: 'Synth bass', gain: 0.7, pump: 0.35 });
  const arp = b.inst({ kind: 'synth', patch: 'arp-pluck', name: 'Arp', gain: 0.55, pan: rng.range(-0.3, 0.3), delay: 0.45, reverb: 0.2, pump: 0.3 });
  const padPatch = rng.pick(['pad-warm', 'pad-strings'] as const);
  const pad = b.inst({ kind: 'synth', patch: padPatch, name: padPatch === 'pad-warm' ? 'Warm pad' : 'Synth strings', gain: 0.55, reverb: 0.35, pump: 0.4 });
  const leadPatch = rng.pick(['saw-lead', 'square-lead', 'saw-lead'] as const);
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: leadPatch === 'saw-lead' ? 'Saw lead' : 'Square lead', gain: 0.55, reverb: 0.3, delay: 0.25, detune: det, pan: 0.05 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-punch', name: 'Kick', gain: 0.6 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-gated', name: 'Gated snare', gain: 0.55, reverb: 0.5 });
  const clap = b.inst({ kind: 'sample', patch: 'clap', name: 'Clap', gain: 0.35, reverb: 0.3, pan: -0.1 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.22, pan: 0.25 });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.14, pan: 0.25 });
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Toms', gain: 0.5, reverb: 0.4 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.2, reverb: 0.3, pan: -0.2 });

  const motifA = makeMotif(rng, 8, 0.35 + D * 0.3, { restTail: 1, maxNotes: 4, grid: 0.5 });
  const motifC = makeMotif(rng, 8, 0.2 + D * 0.2, { restTail: 2, maxNotes: 3 });
  const arpShape = rng.pick([
    [0, 1, 2, 3, 2, 1, 0, 1],
    [0, 1, 2, 3, 4, 3, 2, 1],
    [0, 2, 1, 3, 2, 4, 3, 1],
    [0, 1, 2, 0, 1, 2, 3, 2],
  ]);
  let padVoicing: number[] | null = null;
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const chorus = s.part === 'B';
    const bridge = s.part === 'C';
    const prog = chorus ? progB : progA;
    const spans = chordSpans(prog, s, b);
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    if (intro) {
      b.auto('cutoff', 0, 600, 0);
      b.auto('cutoff', 0.05, lowCut, (sEnd - sT) / 2.5);
    } else if (outro) {
      b.auto('cutoff', sT, 900, (sEnd - sT) / 2);
    } else b.auto('cutoff', sT, lowCut, 0.2);
    if (!intro && (chorus || s.repeat === 0)) b.hit(crash, sT, 0.7, 60, 3);

    spans.forEach((span, k) => {
      const tones = chordPcs(span.chord);
      // Pad
      padVoicing = voiceChord(span.chord, padVoicing, { low: 55, high: 76, voices: 4, rootless: false });
      const last = outro && k === spans.length - 1;
      b.note(pad, span.t, last ? b.end - span.t - 0.5 : span.dur + 0.02, padVoicing[0]!, 0.55);
      for (const p of padVoicing.slice(1)) b.note(pad, span.t, last ? b.end - span.t - 0.5 : span.dur + 0.02, p, 0.5);
      // Arp: 16ths through the chord across two octaves, echoed by the dotted delay.
      if (!(outro && k > 1) && !(bridge && span.bar - s.startBar < 2)) {
        const pool = [...new Set(tones.map((t) => [60 + ((t - 60) % 12 + 12) % 12, 72 + ((t - 72) % 12 + 12) % 12]).flat())].sort((x, y) => x - y);
        const steps = Math.round(span.beats * 4);
        for (let st = 0; st < steps; st++) {
          if (intro && st % 2 === 1 && D < 0.6) continue;
          const p = pool[arpShape[st % arpShape.length]! % pool.length]!;
          b.note(arp, span.t + st * beat * 0.25, beat * 0.22, p, vel(rng, st % 4 === 0 ? 0.62 : 0.48, 0.04));
        }
      }
      // Bass: octave-bouncing eighths.
      if (!intro && !(bridge && span.bar - s.startBar < 4)) {
        const root = bassNote(bassPc(span.chord), prevBass, 28, 40);
        prevBass = root;
        const eighths = Math.round(span.beats * 2);
        for (let e = 0; e < eighths; e++) {
          if (outro && k === spans.length - 1 && e > 0) break;
          const up = e % 2 === 1 && rng.chance(0.7);
          b.note(bass, span.t + e * beat * 0.5, beat * (last ? 3 : 0.42), root + (up ? 12 : 0), vel(rng, e % 2 ? 0.6 : 0.75));
        }
      }
    });

    // Drums
    if (!intro && !outro && !(bridge && s.repeat === 0)) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        const four = chorus || rng.chance(0.15);
        for (let bt = 0; bt < 4; bt++) {
          const t = b.grid.at(bar, bt);
          if (bt % 2 === 0 || four) {
            b.hit(kick, t, vel(rng, 0.85));
            b.pump(t);
          }
          if (bt % 2 === 1) {
            b.hit(snare, t, vel(rng, 0.85));
            if (chorus) b.hit(clap, t + 0.004, vel(rng, 0.6));
          }
        }
        if (D > 0.45 && k % 2 === 1) b.hit(kick, b.grid.at(bar, 2.5), vel(rng, 0.6));
        for (let st = 0; st < 16; st += D > 0.4 ? 1 : 2) {
          const off = st % 4 === 2;
          if (off && chorus && rng.chance(0.5)) b.hit(ohat, b.grid.step(bar, st), 0.45, 60, 0.6);
          else b.hit(hat, b.grid.step(bar, st), vel(rng, st % 4 === 0 ? 0.55 : off ? 0.5 : 0.32), 60, 0.3);
        }
        // Tom fill into the next section.
        if (k === s.bars - 1) {
          for (let f = 0; f < 4; f++) b.hit(tom, b.grid.at(bar, 3 + f * 0.25), 0.55 + f * 0.08, 64 - f * 3);
        }
      }
    }

    // Lead: choruses and the bridge.
    if (chorus || bridge) {
      const motif = bridge ? motifC : s.repeat > 0 ? varyMotif(rng, motifA, 0.3) : motifA;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        if (bridge && ph === 0) continue;
        const notes = realizeMotif(ph === 4 ? varyMotif(rng, motif, 0.5) : motif, 0, beat, 74, spans, keyScale, 64, 86, b.grid, s.startBar + ph);
        notes.forEach((n, j) => {
          const prev = notes[j - 1];
          const glide = prev && Math.abs(prev.p - n.p) <= 5 && rng.chance(0.3) ? { from: prev.p, glide: 0.05 } : {};
          b.note(lead, n.t, n.d, n.p, vel(rng, n.strong ? 0.7 : 0.6), glide);
        });
      }
    }
  }

  return b.build({
    key: keyName(tonic, tplA.scale),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.3,
      lowpass: lowCut,
      highpass: 32,
      q: 0.8,
      wow: G * 1.5 + W * 1.5,
      wowRate: 0.4,
      flutter: G * 0.05,
      drive: 0.1 + G * 0.3,
      delay: { time: beat * 0.75, feedback: 0.38, tone: 3500, wet: 0.45 },
      reverbTone: 7000,
      reverbLevel: 1.3,
    }),
  });
}

// Music boxes in the static. static-lullaby: a sleepy 3/4 lullaby, slightly out of tune,
// drifting through radio noise. numbers-musicbox: a short, eerie interval signal that
// repeats through shortwave hiss, punctuated by pips.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';
import { LULLABY, NUMBERS } from './templates';

export function composeLullaby(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'static-lullaby');
  const tweaks = resolveTweaks(req, { bpm: 66, density: 0.35, grit: 0.5, weirdness: 0.3, brightness: 0.35 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tpl = rng.pick(LULLABY);
  const prog = parseProgression(tpl.prog, tonic);
  // Eerie dimensions borrow the minor iv.
  if (W > 0.25 && rng.chance(W)) {
    const k = prog.findIndex((bar) => bar[0]!.root === (tonic + 5) % 12);
    if (k >= 0) prog[k] = [chord(tonic + 5, 'm')];
    else prog[prog.length - 2] = [chord(tonic + 8, '')];
  }
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [60, 76]);
  const { fit, plan } = layout(req, bpm, 3, { unit: 8, pattern: ['A', 'A', 'B', 'A'], intro: 2, outro: 2, tail: Math.min(6, req.durationSeconds * 0.05) });
  const b = new ScoreBuilder(req.recipe, req, fit, 3, 0.5, tweaks, 2);
  const beat = b.beat;

  const box = b.inst({ kind: 'sample', patch: 'musicbox', name: 'Music box', gain: 0.5, reverb: 0.5, pan: 0.1 });
  const piano = b.inst({ kind: 'sample', patch: 'felt-piano', name: 'Felt piano', gain: 0.45, reverb: 0.4, pan: -0.15, lowpass: 2500 });
  const pad = b.inst({ kind: 'synth', patch: 'pad-warm', name: 'Night pad', gain: 0.35, reverb: 0.6 });
  const fuzz = b.inst({ kind: 'sample', patch: 'static', name: 'Static', gain: 0.18 + G * 0.22 });
  const wave = W > 0.3 ? b.inst({ kind: 'sample', patch: 'shortwave', name: 'Shortwave', gain: 0.2 + W * 0.2 }) : -1;

  const motif = makeMotif(rng, 6, 0.3 + D * 0.3, { restTail: 1, minNotes: 2, maxNotes: 4, maxLeap: 3 });
  const motifB = makeMotif(rng, 6, 0.25 + D * 0.3, { restTail: 1.5, minNotes: 2, maxNotes: 3, maxLeap: 3 });
  let voicing: number[] | null = null;
  const sour = 6 + W * 22; // cents: an old comb, a little out of tune

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp) => (sp.chord = chord(tonic, '')));
    b.section(s, spans.map((x) => x.chord), flats);
    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 72, voices: 3, rootless: false });
      const root = bassNote(bassPc(span.chord), null, 41, 53);
      // Waltz: bass on one, soft dyads on two and three.
      b.note(piano, b.grid.at(span.bar, 0), (last ? 6 : 2.8) * beat, root, vel(rng, 0.5));
      if (!last) for (const bt of [1, 2]) for (const p of voicing.slice(1)) b.note(piano, b.grid.at(span.bar, bt), beat * 0.9, p, vel(rng, 0.3, 0.05));
      if (!intro) for (const p of voicing) b.note(pad, span.t, last ? b.end - span.t - 0.5 : span.dur + 0.3, p, 0.4);
    });
    if (!intro && !outro) {
      const base = s.part === 'B' ? motifB : s.repeat > 0 ? varyMotif(rng, motif, 0.25) : motif;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const m = (ph / 2) % 4 === 2 ? varyMotif(rng, base, 0.5) : base;
        for (const n of realizeMotif(m, 0, beat, 81, spans, keyScale, 72, 93, b.grid, s.startBar + ph)) {
          b.note(box, n.t, n.d + beat, n.p + rng.range(-sour, sour) / 100, vel(rng, n.strong ? 0.6 : 0.5));
        }
      }
    }
    if (outro) {
      const tones = chordPcs(chord(tonic, ''));
      let p = nearestInSet(84, tones);
      for (let j = 0; j < 4; j++) {
        b.note(box, b.grid.at(s.startBar, j * 0.75), beat * 4, p, 0.5 - j * 0.06);
        p = nearestInSet(p - 3, tones);
      }
    }
  }
  b.note(fuzz, 0, b.end, 60, 1);
  if (wave >= 0) b.note(wave, rng.range(5, 20), Math.max(10, b.end - 25), 60, 1);

  return b.build({
    key: keyName(tonic, 'major'),
    progression: tpl.prog,
    fx: trackFx({
      gain: 0.42,
      lowpass: lerp(3000, 8000, B),
      highpass: 60,
      wow: 1.2 + G * 2.2 + W,
      wowRate: 0.3,
      flutter: 0.04 + G * 0.06,
      drive: 0.1 + G * 0.3,
      reverbTone: 4000,
      reverbLevel: 1.4,
    }),
  });
}

export function composeNumbers(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'numbers-musicbox');
  const tweaks = resolveTweaks(req, { bpm: 80, density: 0.35, grit: 0.45, weirdness: 0.35, brightness: 0.4 });
  const { grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tpl = rng.pick(NUMBERS);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, true);
  const bpm = pickBpm(rng, req, [72, 92]);
  const meter = rng.chance(0.5) ? 3 : 4;
  const { fit, plan } = layout(req, bpm, meter, { unit: 4, pattern: ['A', 'A', 'A', 'B'], intro: 1, outro: 1 });
  const b = new ScoreBuilder(req.recipe, req, fit, meter, 0.5, tweaks, 2);
  const beat = b.beat;

  const box = b.inst({ kind: 'sample', patch: 'musicbox', name: 'Music box', gain: 0.55, reverb: 0.4, pan: 0 });
  const drone = b.inst({ kind: 'synth', patch: 'pad-dark', name: 'Carrier hum', gain: 0.35, reverb: 0.3 });
  const pip = b.inst({ kind: 'synth', patch: 'sine-beep', name: 'Pips', gain: 0.22, pan: 0.05 });
  const sw = b.inst({ kind: 'sample', patch: 'shortwave', name: 'Shortwave', gain: 0.35 + G * 0.2 });

  // The interval signal: two bars, played identically each time (that's the point).
  const signal = makeMotif(rng, meter * 2, 0.45, { restTail: 0.5, minNotes: 3, maxNotes: 4, maxLeap: 4 });
  const drift = W * 30;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    b.section({ ...s, name: s.part === 'B' ? 'pips' : intro || outro ? s.name : `signal${s.repeat ? ' ×' + (s.repeat + 1) : ''}` }, spans.map((x) => x.chord), flats);
    // Carrier hum under everything.
    b.note(drone, b.grid.bar(s.startBar), s.bars * fit.barDur + 0.5, bassNote(tonic, null, 36, 47), 0.5);
    if (intro || outro) continue;
    if (s.part === 'B') {
      // Pips: groups of three, a longer one to finish.
      for (let k = 0; k < s.bars; k++) {
        const t0 = b.grid.bar(s.startBar + k);
        for (let j = 0; j < 3; j++) b.note(pip, t0 + j * 0.45, 0.12, 83, 0.7);
        if (k === s.bars - 1) b.note(pip, t0 + 1.6, 0.6, 83, 0.7);
      }
      continue;
    }
    // Signal twice per section; weirder dimensions sometimes play it backwards.
    for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
      const backwards = W > 0.3 && rng.chance(W * 0.25);
      const notes = realizeMotif(signal, 0, beat, 79, spans, keyScale, 72, 91, b.grid, s.startBar + ph);
      const pitches = backwards ? notes.map((n) => n.p).reverse() : notes.map((n) => n.p);
      const wobble = rng.range(-drift, drift) / 100;
      notes.forEach((n, j) => b.note(box, n.t, n.d + beat, pitches[j]! + wobble, vel(rng, 0.6, 0.04)));
    }
  }
  b.note(sw, 0, b.end, 60, 1);

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({
      gain: 0.42,
      lowpass: lerp(3000, 7000, B),
      highpass: 70,
      wow: 1 + G * 2 + W * 1.5,
      wowRate: 0.25,
      flutter: 0.05,
      drive: 0.15 + G * 0.3,
      reverbTone: 4000,
      reverbLevel: 1.2,
    }),
  });
}

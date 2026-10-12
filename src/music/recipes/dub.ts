// Dub: one-drop drums, a deep repeating bass riff, offbeat skanks and organ bubble, all
// mixed live: instruments drop in and out and get thrown into a long tape echo.
//
// v3 rework: the skank is a muted guitar chop doubled by a warm electric-piano stab (not a
// band-passed beep); the bass is a round bass guitar over the sub, so it is deep on big
// speakers and still there on small ones; the echo is darker and longer, and the throws
// are played like a dub engineer would: the last skank or rimshot of a phrase, the end of
// a melodica line, sent hard into the delay and pulled back out.

import type { TrackRequest } from '../index';
import { rngFor, type Rng } from '../rng';
import type { Score } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';
import { DUB } from './templates';

interface RiffNote {
  beat: number;
  beats: number;
  /** Semitones above the chord root. */
  degree: number;
}

export function composeDub(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'dub');
  const tweaks = resolveTweaks(req, { bpm: 72, density: 0.45, grit: 0.35, weirdness: 0.2, brightness: 0.4 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tpl = rng.pick(DUB);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, true);
  const bpm = pickBpm(rng, req, [66, 80]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'D', 'A', 'D'], intro: 2, outro: 4 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.54, 0.6), tweaks, 2);
  const beat = b.beat;
  const echoTime = beat * rng.weighted([[0.75, 5], [1.5, 2], [1, 1]] as const);

  const sub = b.inst({ kind: 'sample', patch: 'bass-sub', name: 'Sub bass', gain: 0.62, lowpass: 400 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.42, lowpass: 900 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-808', name: 'Kick', gain: 0.5 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-dub', name: 'Rimshot', gain: 0.46, reverb: 0.4, delay: 0.06, pan: 0.05 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.4, pan: 0.25, delay: 0.02 });
  const chop = b.inst({ kind: 'sample', patch: 'folk-guitar', name: 'Skank guitar', gain: 0.75, pan: -0.25, highpass: 350, lowpass: 3800, reverb: 0.15, delay: 0.1, release: 0.04 });
  const stab = b.inst({ kind: 'sample', patch: rng.chance(0.6) ? 'ep' : 'wurli', name: 'Skank piano', gain: 0.38, pan: 0.12, reverb: 0.25, delay: 0.1, lowpass: 2600, release: 0.08 });
  const organ = b.inst({ kind: 'synth', patch: 'organ', name: 'Organ bubble', gain: 0.24, pan: 0.3, lowpass: 2200, tremolo: { rate: 6.5, depth: 0.4 } });
  const melodica = b.inst({ kind: 'synth', patch: 'melodica', name: 'Melodica', gain: 0.4, pan: 0.1, reverb: 0.25, delay: 0.3 });
  const SEND = new Map([
    [snare, 0.06],
    [chop, 0.1],
    [stab, 0.1],
    [hat, 0.02],
    [melodica, 0.3],
  ]);

  const riff = makeRiff(rng);
  const bubble = rng.chance(0.65);
  const motif = makeMotif(rng, 8, 0.2 + D * 0.3, { restTail: 2.5, maxNotes: 3 });
  let voicing: number[] | null = null;
  let stabVoicing: number[] | null = null;

  /** Sends one moment hard into the echo and pulls it back out (a "throw"). */
  const throwEcho = (inst: number, at: number, hold: number, amount = 0.95) => {
    b.auto('echo', at - 0.02, amount, 0, inst);
    b.auto('echo', at + hold, SEND.get(inst) ?? 0.05, 0.05, inst);
  };

  // Dub mixing: which instruments sit out each section.
  const mutedFor = (part: string, repeat: number): Set<number> => {
    if (part !== 'D') return new Set();
    const options = [[chop, stab, organ], [kick, hat, organ], [chop, hat], [organ, melodica, stab], [chop, stab, kick], [bass, organ, hat]];
    return new Set(options[(repeat + rng.int(0, 5)) % options.length]);
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    b.section({ ...s, name: s.part === 'D' ? `dub${s.repeat ? ' ' + (s.repeat + 1) : ''}` : s.name }, spans.map((x) => x.chord), flats);
    const muted = mutedFor(s.part, s.repeat);
    const sT = b.grid.bar(s.startBar);
    for (const i of [kick, snare, hat, chop, stab, organ, sub, bass]) b.auto('inst', sT, muted.has(i) ? 0 : 1, muted.has(i) ? 0.08 : 0.02, i);
    if (outro) {
      // Everything but the echo tails fades out.
      b.auto('inst', sT + fit.barDur * 2, 0, fit.barDur, kick);
      b.auto('inst', sT + fit.barDur, 0, fit.barDur, hat);
    }

    spans.forEach((span, k) => {
      const root = bassNote(bassPc(span.chord), null, 31, 42);
      const lastBar = outro && k >= spans.length - 2;
      // Bass riff (two-bar cell; bar parity picks the half). It starts the tune alone.
      {
        const half = (span.bar - s.startBar) % 2;
        for (const n of riff) {
          const bt = n.beat - half * 4;
          if (bt < 0 || bt >= 4) continue;
          if (lastBar && bt > 0) continue;
          const at = b.grid.at(span.bar, bt);
          const d = (lastBar ? 4 : n.beats) * beat * 0.92;
          const v = vel(rng, bt === 0 ? 0.85 : 0.72, 0.04);
          b.note(sub, at, d, root + n.degree, v);
          b.note(bass, at, d, root + n.degree, v * 0.9);
        }
      }
      // Skank on 2 and 4 (beats 1 and 3 here): a muted guitar chop doubled by a piano stab.
      voicing = voiceChord(span.chord, voicing, { low: 62, high: 74, voices: 3, rootless: false });
      stabVoicing = voiceChord(span.chord, stabVoicing, { low: 53, high: 67, voices: 3, rootless: true });
      if (!lastBar) {
        for (const bt of [1, 3]) {
          const at = b.grid.at(span.bar, bt);
          voicing.forEach((p, j) => b.note(chop, at + j * 0.006, beat * 0.16, p, vel(rng, 0.62, 0.04)));
          if (!intro) for (const p of stabVoicing) b.note(stab, at, beat * 0.32, p, vel(rng, 0.5, 0.04));
        }
        if (bubble && !intro) {
          for (let e = 0; e < 4; e++) b.note(organ, b.grid.at(span.bar, e + 0.5), beat * 0.3, e % 2 ? voicing[1]! - 12 : voicing[0]! - 12 >= 48 ? voicing[0]! - 12 : voicing[0]!, vel(rng, 0.45, 0.05));
        }
      }
    });

    // Drums: one drop (kick + rim together on beat 3), steppers in some dub sections.
    if (!intro) {
      const steppers = s.part === 'D' && rng.chance(0.35);
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        if (outro && k >= 2) break;
        if (steppers) for (let bt = 0; bt < 4; bt++) b.hit(kick, b.grid.at(bar, bt), vel(rng, 0.8));
        else b.hit(kick, b.grid.at(bar, 2), vel(rng, 0.85));
        b.hit(snare, b.grid.at(bar, 2) + 0.004, vel(rng, 0.78));
        for (let e = 0; e < 8; e++) if (!(e === 4 && rng.chance(0.5))) b.hit(hat, b.grid.at(bar, e * 0.5), vel(rng, e % 2 ? 0.48 : 0.36), 60, 0.25);
        // Echo throws at the end of each phrase (and now and then mid-phrase).
        const phraseEnd = k % 4 === 3;
        if (phraseEnd || rng.chance(0.08 + W * 0.15)) {
          const which = phraseEnd ? rng.weighted([[chop, 3], [snare, 3], [stab, 2]] as const) : rng.pick([snare, hat, chop]);
          const at = which === snare ? b.grid.at(bar, 2) : b.grid.at(bar, 3);
          if (!muted.has(which)) throwEcho(which, at, beat * 0.5, phraseEnd ? 0.95 : 0.8);
        }
      }
    }

    // Melodica phrases now and then, the last note of each thrown into the echo.
    if ((s.part === 'A' && s.repeat > 0 && !outro) || (s.part === 'D' && !muted.has(melodica) && rng.chance(0.3))) {
      for (let ph = 0; ph + 2 <= s.bars; ph += 4) {
        const m = s.repeat > 1 ? varyMotif(rng, motif, 0.4) : motif;
        const notes = realizeMotif(m, 0, beat, 72, spans, keyScale, 62, 81, b.grid, s.startBar + ph);
        notes.forEach((n) => b.note(melodica, n.t, n.d, n.p, vel(rng, 0.6)));
        const last = notes[notes.length - 1];
        if (last) throwEcho(melodica, last.t, Math.min(last.d, beat * 1.5), 0.9);
      }
    }
  }

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({
      gain: 0.235,
      lowpass: lerp(4500, 10000, B),
      highpass: 28,
      wow: 0.6 + G * 1.8,
      wowRate: 0.35,
      flutter: G * 0.05,
      drive: 0.18 + G * 0.35,
      delay: { time: echoTime, feedback: 0.64 + W * 0.1, tone: 1700, wet: 0.75 },
      reverbTone: 3200,
      reverbLevel: 1.2,
    }),
  });
}

/** A two-bar bass riff: root-heavy, syncopated, with breathing space. */
function makeRiff(rng: Rng): RiffNote[] {
  const degrees = [0, 0, 0, 3, 5, 7, 10, 12, -2, -5];
  const shapes: [number, number][][] = [
    [[0, 1.5], [1.5, 0.5], [2, 1], [3.5, 0.5], [4, 1.5], [6, 0.5], [6.5, 1]],
    [[0, 0.75], [1, 0.5], [1.5, 1], [3, 0.5], [4, 1], [5.5, 0.5], [6, 1.5]],
    [[0, 2], [2.5, 0.5], [3, 0.75], [4, 0.75], [5, 0.5], [5.5, 1], [7, 0.5]],
    [[0, 1], [1.5, 1.5], [3.5, 0.5], [4, 2], [6.5, 0.5], [7, 0.75]],
  ];
  const shape = rng.pick(shapes);
  return shape.map(([beat, beats], k) => ({
    beat,
    beats,
    degree: k === 0 || beat === 4 ? 0 : rng.pick(degrees),
  }));
}

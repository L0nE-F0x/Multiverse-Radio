// Dub: one-drop drums, a deep repeating sub-bass riff, offbeat skanks and organ bubble,
// all mixed live: instruments drop in and out and get thrown into a long tape echo.

import type { TrackRequest } from '../index';
import { rngFor, type Rng } from '../rng';
import type { Score } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel } from './common';
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

  const sub = b.inst({ kind: 'sample', patch: 'bass-sub', name: 'Sub bass', gain: 0.8, lowpass: 600 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-808', name: 'Kick', gain: 0.55 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-dub', name: 'Rimshot', gain: 0.5, reverb: 0.35, delay: 0.05, pan: 0.05 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.24, pan: 0.25, delay: 0.02 });
  const skank = b.inst({ kind: 'synth', patch: 'skank', name: 'Skank', gain: 0.5, pan: -0.2, reverb: 0.2, delay: 0.08 });
  const organ = b.inst({ kind: 'synth', patch: 'organ', name: 'Organ bubble', gain: 0.3, pan: 0.3, tremolo: { rate: 6.5, depth: 0.4 } });
  const melodica = b.inst({ kind: 'synth', patch: 'melodica', name: 'Melodica', gain: 0.45, pan: 0.1, reverb: 0.25, delay: 0.35 });

  const riff = makeRiff(rng);
  const bubble = rng.chance(0.65);
  const motif = makeMotif(rng, 8, 0.2 + D * 0.3, { restTail: 2.5, maxNotes: 3 });
  let voicing: number[] | null = null;

  // Dub mixing: which instruments sit out each section.
  const mutedFor = (part: string, repeat: number): Set<number> => {
    if (part !== 'D') return new Set();
    const options = [[skank, organ], [kick, hat, organ], [skank, hat], [organ, melodica], [skank, kick]];
    return new Set(options[(repeat + rng.int(0, 4)) % options.length]);
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    b.section({ ...s, name: s.part === 'D' ? `dub${s.repeat ? ' ' + (s.repeat + 1) : ''}` : s.name }, spans.map((x) => x.chord), flats);
    const muted = mutedFor(s.part, s.repeat);
    const sT = b.grid.bar(s.startBar);
    for (const i of [kick, snare, hat, skank, organ, sub]) b.auto('inst', sT, muted.has(i) ? 0 : 1, muted.has(i) ? 0.08 : 0.02, i);
    if (outro) {
      // Everything but the echo tails fades out.
      b.auto('inst', sT + fit.barDur * 2, 0, fit.barDur, kick);
      b.auto('inst', sT + fit.barDur, 0, fit.barDur, hat);
    }

    spans.forEach((span, k) => {
      const root = bassNote(bassPc(span.chord), null, 31, 42);
      const lastBar = outro && k >= spans.length - 2;
      // Bass riff (two-bar cell; bar parity picks the half).
      if (!intro || k === spans.length - 1) {
        const half = (span.bar - s.startBar) % 2;
        for (const n of riff) {
          const bt = n.beat - half * 4;
          if (bt < 0 || bt >= 4) continue;
          if (lastBar && bt > 0) continue;
          b.note(sub, b.grid.at(span.bar, bt), (lastBar ? 4 : n.beats) * beat * 0.92, root + n.degree, vel(rng, bt === 0 ? 0.85 : 0.72, 0.04));
        }
      }
      // Skank on 2 and 4 (beats 1 and 3 here), organ bubble on the off-beats.
      voicing = voiceChord(span.chord, voicing, { low: 60, high: 74, voices: 3, rootless: false });
      if (!lastBar) {
        for (const bt of [1, 3]) for (const p of voicing) b.note(skank, b.grid.at(span.bar, bt), beat * 0.2, p, vel(rng, 0.6, 0.04));
        if (bubble && !intro) {
          for (let e = 0; e < 4; e++) b.note(organ, b.grid.at(span.bar, e + 0.5), beat * 0.3, e % 2 ? voicing[1]! : voicing[0]! - 12 >= 48 ? voicing[0]! - 12 : voicing[0]!, vel(rng, 0.45, 0.05));
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
        // Echo throws: a single hit sent screaming into the delay.
        if (rng.chance(0.18 + W * 0.25)) {
          const which = rng.pick([snare, skank, hat]);
          const at = b.grid.at(bar, rng.pick([1, 2, 3]));
          b.auto('echo', at - 0.02, 0.95, 0, which);
          b.auto('echo', at + beat * 0.6, which === snare ? 0.05 : which === skank ? 0.08 : 0.02, 0.05, which);
        }
      }
    }

    // Melodica phrases now and then, drenched in echo.
    if (s.part === 'A' && s.repeat > 0 && !outro) {
      for (let ph = 0; ph + 2 <= s.bars; ph += 4) {
        for (const n of realizeMotif(motif, 0, beat, 72, spans, keyScale, 62, 81, b.grid, s.startBar + ph)) b.note(melodica, n.t, n.d, n.p, vel(rng, 0.6));
      }
    }
  }

  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({
      gain: 0.38,
      lowpass: lerp(4500, 11000, B),
      highpass: 28,
      wow: 0.6 + G * 1.8,
      wowRate: 0.35,
      flutter: G * 0.05,
      drive: 0.15 + G * 0.35,
      delay: { time: beat * rng.pick([0.75, 1, 1.5]), feedback: 0.6 + W * 0.12, tone: 2200, wet: 0.7 },
      reverbTone: 3500,
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


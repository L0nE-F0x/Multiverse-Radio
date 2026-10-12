// Beds for talk: unobtrusive under speech (little in the 300 Hz–3 kHz voice band, no
// busy melodies), but still pleasant on their own.
//   news-bed       – ticking clock, pulsing synth, sub and pad; an ident sting at each end
//   talk-bed       – a light, bouncy keys-and-rim groove
//   sports-fanfare – brass fanfare and timpani, then a polite march under commentary
//   documentary    – patient piano ostinato, hushed strings, swelling horns

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { SamplePatch, Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel } from './common';
import { DOCUMENTARY, FANFARE, NEWS, TALK } from './templates';

export function composeNews(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'news-bed');
  const tweaks = resolveTweaks(req, { bpm: 112, density: 0.45, grit: 0.1, weirdness: 0.1, brightness: 0.5 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(NEWS);
  const prog = parseProgression(tpl.prog, tonic);
  const minor = tpl.scale === 'minor';
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [104, 122]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B'], intro: 1, outro: 1 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const pulse = b.inst({ kind: 'synth', patch: 'arp-pluck', name: 'Pulse', gain: 0.38, pan: -0.15, lowpass: 1600 });
  const tick = b.inst({ kind: 'sample', patch: rng.chance(0.5) ? 'tick' : 'woodblock', name: 'Clock', gain: 0.25, pan: 0.3 });
  const sub = b.inst({ kind: 'sample', patch: 'bass-sub', name: 'Sub', gain: 0.6 });
  const pad = b.inst({ kind: 'synth', patch: rng.chance(0.5) ? 'pad-dark' : 'pad-strings', name: 'Pad', gain: 0.32, reverb: 0.4, lowpass: 1800 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.5, reverb: 0.3 });
  const sting = b.inst({ kind: 'sample', patch: rng.chance(0.5) ? 'glass' : 'vibes', name: 'Sting', gain: 0.4, reverb: 0.4, pan: 0.15 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.35 });

  const stingNotes = [0, 7, 12, rng.pick([14, 15, 16, 19])];
  const playSting = (t: number) => stingNotes.forEach((iv, j) => b.note(sting, t + j * beat * 0.5, beat * 2, nearestInSet(72 + iv + tonic - 0, scalePcs(tonic, SCALES[minor ? 'minor' : 'major'])) - (tonic > 6 ? 12 : 0), 0.55));
  let voicing: number[] | null = null;
  for (const s of plan) {
    const spans = chordSpans(prog, s, b);
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    if (s.part === 'intro') {
      playSting(sT);
      b.hit(timp, sT, 0.7, bassNote(tonic, null, 40, 51) + 19);
      continue;
    }
    if (s.part === 'outro') {
      playSting(sT);
      b.hit(timp, sT, 0.6, bassNote(tonic, null, 40, 51) + 19);
      b.note(sub, sT, b.end - sT - 0.5, bassNote(tonic, null, 31, 42), 0.6);
      continue;
    }
    b.hit(timp, sT, 0.55, bassNote(bassPc(spans[0]!.chord), null, 40, 51) + 19);
    spans.forEach((span) => {
      voicing = voiceChord(span.chord, voicing, { low: 48, high: 64, voices: 3, rootless: false });
      for (const p of voicing) b.note(pad, span.t, span.dur + 0.1, p, 0.45);
      const root = bassNote(bassPc(span.chord), null, 31, 42);
      b.note(sub, span.t, span.dur * 0.95, root, 0.7);
      // 16th pulse on root/fifth with an accent pattern.
      const tones = [root + 12, root + 19, root + 24];
      for (let st = 0; st < span.beats * 4; st++) {
        if (D < 0.4 && st % 2 === 1) continue;
        b.note(pulse, span.t + st * beat * 0.25, beat * 0.2, tones[st % 3 === 2 ? 1 : 0]!, vel(rng, st % 4 === 0 ? 0.6 : 0.42, 0.03));
      }
    });
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      for (let e = 0; e < 8; e++) b.hit(tick, b.grid.at(bar, e * 0.5), e % 2 ? 0.45 : 0.6, 60, 0.1);
      if (s.part === 'B') for (const bt of [0, 2]) b.hit(kick, b.grid.at(bar, bt), 0.6);
    }
  }
  return b.build({
    key: keyName(tonic, minor ? 'minor' : 'major'),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.34, lowpass: lerp(6000, 14000, B), highpass: 35, wow: W, wowRate: 0.4, flutter: 0, drive: 0.05, reverbTone: 6000, reverbLevel: 0.9 }),
  });
}

export function composeTalk(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'talk-bed');
  const tweaks = resolveTweaks(req, { bpm: 102, density: 0.4, grit: 0.2, weirdness: 0.1, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(TALK);
  const prog = parseProgression(tpl.prog, tonic);
  const minor = tpl.scale !== 'major';
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [94, 112]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B'], intro: 1, outro: 1 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.53, 0.58), tweaks);
  const beat = b.beat;

  const keysPatch: SamplePatch = rng.weighted([['wurli', 3], ['ep', 3], ['marimba', 1]]);
  const keys = b.inst({ kind: 'sample', patch: keysPatch, name: keysPatch === 'wurli' ? 'Reed piano' : keysPatch === 'ep' ? 'Electric piano' : 'Marimba', gain: 0.5, pan: -0.15, reverb: 0.15, tremolo: keysPatch !== 'marimba' ? { rate: 5, depth: 0.25 } : undefined, lowpass: 3500 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.55 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.45 });
  const rim = b.inst({ kind: 'sample', patch: 'rim', name: 'Rim', gain: 0.45, pan: 0.05 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.2, pan: 0.3 });
  const lick = b.inst({ kind: 'sample', patch: rng.chance(0.5) ? 'kalimba' : 'vibes', name: 'Licks', gain: 0.35, pan: 0.3, reverb: 0.3 });

  const stabs = rng.pick([[0.5, 1.5, 2.5, 3.5], [0.5, 2.5, 3.5], [0.75, 1.5, 2.75, 3.5]]);
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  const lickMotif = makeMotif(rng, 4, 0.3, { restTail: 1, minNotes: 2, maxNotes: 3 });
  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp) => (sp.chord = minor ? chord(tonic, 'm9') : chord(tonic, 'maj9')));
    b.section(s, spans.map((x) => x.chord), flats);
    spans.forEach((span) => {
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 72, voices: 3 });
      if (outro) {
        for (const p of voicing) b.note(keys, span.t, b.end - span.t - 0.4, p, 0.45);
        b.note(bass, span.t, beat * 3, bassNote(bassPc(span.chord), prevBass, 31, 45), 0.7);
        return;
      }
      for (const x of stabs) if (x < span.beats) for (const p of voicing) b.note(keys, b.grid.at(span.bar, span.beat + x), beat * 0.35, p, vel(rng, 0.45, 0.05));
      if (!intro) {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
        prevBass = root;
        b.note(bass, b.grid.at(span.bar, span.beat), beat * 1.2, root, vel(rng, 0.75));
        if (span.beats >= 4) {
          b.note(bass, b.grid.at(span.bar, span.beat + 1.75), beat * 0.4, root, vel(rng, 0.55));
          b.note(bass, b.grid.at(span.bar, span.beat + 2), beat * 1, root + 7 <= 48 ? root + 7 : root - 5, vel(rng, 0.65));
        }
      }
    });
    if (intro || outro) continue;
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      for (const st of [0, 6, 8]) b.hit(kick, b.grid.step(bar, st), vel(rng, st === 0 ? 0.75 : 0.55));
      for (const st of [4, 12]) b.hit(rim, b.grid.step(bar, st), vel(rng, 0.6));
      if (D > 0.25) for (let st = 0; st < 16; st += 2) b.hit(shaker, b.grid.step(bar, st), vel(rng, st % 4 ? 0.3 : 0.45), 60, 0.25);
      // A little lick in the gaps every four bars.
      if (k % 4 === 3 && rng.chance(0.5 + D * 0.3)) {
        for (const n of realizeMotif(lickMotif, 0, beat, 79, spans, keyScale, 72, 88, b.grid, bar)) b.note(lick, n.t, n.d, n.p, 0.45);
      }
    }
  }
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.38, lowpass: lerp(5000, 11000, B), highpass: 40, wow: 0.3 + G * 1.5 + W, wowRate: 0.5, flutter: G * 0.04, drive: 0.1 + G * 0.3, reverbTone: 5000, reverbLevel: 0.8 }),
  });
}

export function composeFanfare(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'sports-fanfare');
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.5, grit: 0.1, weirdness: 0.15, brightness: 0.6 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(FANFARE);
  const prog = parseProgression(tpl.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [112, 132]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B'], intro: 4, outro: 2 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const brass = b.inst({ kind: 'synth', patch: 'brass', name: 'Brass', gain: 0.6, reverb: 0.3, pan: -0.1 });
  const horn = b.inst({ kind: 'synth', patch: 'horn', name: 'Horns', gain: 0.4, reverb: 0.4, pan: 0.15 });
  const tuba = b.inst({ kind: 'synth', patch: 'tuba', name: 'Low brass', gain: 0.55 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.55, reverb: 0.3 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-march', name: 'Snare', gain: 0.32, pan: 0.1, reverb: 0.15 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbals', gain: 0.25, reverb: 0.3 });
  const glock = b.inst({ kind: 'sample', patch: 'celesta', name: 'Glockenspiel', gain: 0.3, pan: 0.3, reverb: 0.3 });

  const theme = makeMotif(rng, 8, 0.45 + D * 0.2, { restTail: 2, minNotes: 2, maxNotes: 4, maxLeap: 4 });
  let voicing: number[] | null = null;
  const timpPitch = (pcValue: number) => bassNote(pcValue, null, 40, 52) + 19; // the sample is G2; shift to the note
  const fanfare = (bar: number, bars: number, spans: ReturnType<typeof chordSpans>, final: boolean) => {
    // Snare roll into the downbeat, then brass stabs: da-da-da DAAA.
    const t0 = b.grid.bar(bar);
    for (let j = 0; j < 8; j++) b.hit(snare, t0 - beat + j * beat * 0.125, 0.3 + j * 0.06);
    b.hit(crash, t0, 0.8, 60, 3);
    for (const span of spans.filter((sp) => sp.bar < bar + bars)) {
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 76, voices: 4, rootless: false });
      const rhythm: [number, number][] = final && span === spans[spans.length - 1] ? [[0, b.end - span.t - 0.5]] : [[0, 0.6], [0.67, 0.3], [1.33, 0.3], [2, 1.8]];
      for (const [x, len] of rhythm) {
        for (const p of voicing) b.note(brass, span.t + x * beat, len * (x > 3 ? 1 : beat), p, vel(rng, x === 0 || x === 2 ? 0.85 : 0.65));
      }
      b.note(tuba, span.t, beat * 1.8, bassNote(bassPc(span.chord), null, 33, 45), 0.8);
      b.hit(timp, span.t, 0.8, timpPitch(bassPc(span.chord)));
      b.hit(timp, span.t + beat * 2, 0.6, timpPitch(bassPc(span.chord)));
    }
  };

  let prevBass: number | null = null;
  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 ? chord(tonic, '') : chord(tonic + 7, '')));
    b.section({ ...s, name: intro ? 'fanfare' : outro ? 'finale' : s.name }, spans.map((x) => x.chord), flats);
    if (intro || outro) {
      fanfare(s.startBar, s.bars, spans, outro);
      continue;
    }
    // Under commentary: horns sustain, low brass on 1 and 3, a polite march on the snare.
    spans.forEach((span) => {
      voicing = voiceChord(span.chord, voicing, { low: 52, high: 69, voices: 3, rootless: false });
      for (const p of voicing) b.note(horn, span.t, span.dur * 0.98, p, 0.5);
      const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
      prevBass = root;
      b.note(tuba, span.t, beat * 0.8, root, vel(rng, 0.7));
      b.note(tuba, span.t + beat * 2, beat * 0.8, root + 7 <= 48 ? root + 7 : root - 5, vel(rng, 0.6));
    });
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      const pattern = [0, 0.5, 1, 1.5, 1.75, 2, 2.5, 3, 3.5, 3.75];
      for (const x of pattern) b.hit(snare, b.grid.at(bar, x), vel(rng, x % 1 === 0 ? 0.4 : 0.25, 0.05));
      if (k % 4 === 0) {
        const here = (spans.find((sp) => sp.bar === bar) ?? spans[0]!).chord;
        b.hit(timp, b.grid.bar(bar), 0.6, timpPitch(bassPc(here)));
        // A brass stab accent.
        for (const p of voiceChord(here, null, { low: 60, high: 79, voices: 4, rootless: false })) b.note(brass, b.grid.bar(bar), beat * 0.5, p, 0.6);
      }
    }
    // The theme on glockenspiel in B, short and bright.
    if (s.part === 'B') {
      for (let ph = 0; ph + 2 <= s.bars; ph += 4) {
        for (const n of realizeMotif(theme, 0, beat, 81, spans, keyScale, 72, 91, b.grid, s.startBar + ph)) b.note(glock, n.t, n.d, n.p, vel(rng, 0.55));
      }
    }
  }
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.32, lowpass: lerp(7000, 15000, B), highpass: 35, wow: W, wowRate: 0.4, flutter: 0, drive: 0.1, reverbTone: 6500, reverbLevel: 1.2 }),
  });
}

export function composeDocumentary(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'documentary');
  const tweaks = resolveTweaks(req, { bpm: 72, density: 0.45, grit: 0.05, weirdness: 0.1, brightness: 0.5 });
  const { density: D, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(DOCUMENTARY);
  // Two bars per chord: patient harmony.
  const prog = parseProgression(tpl.prog, tonic).flatMap((bar) => [bar, bar]);
  const minor = tpl.scale === 'minor';
  const keyScale = scalePcs(tonic, SCALES[tpl.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [64, 84]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B', 'A'], intro: 2, outro: 2 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const pianoPatch: SamplePatch = rng.chance(0.6) ? 'felt-piano' : 'piano';
  const piano = b.inst({ kind: 'sample', patch: pianoPatch, name: 'Piano', gain: 0.5, reverb: 0.35, pan: -0.1 });
  const strings = b.inst({ kind: 'synth', patch: 'pad-strings', name: 'Strings', gain: 0.45, reverb: 0.5 });
  const horn = b.inst({ kind: 'synth', patch: 'horn', name: 'Horns', gain: 0.45, reverb: 0.5, pan: 0.15 });
  const pizz = b.inst({ kind: 'sample', patch: 'pizz', name: 'Pizzicato', gain: 0.5, pan: -0.2, reverb: 0.3 });
  const celesta = b.inst({ kind: 'sample', patch: 'celesta', name: 'Celesta', gain: 0.3, pan: 0.3, reverb: 0.5 });
  const timp = b.inst({ kind: 'sample', patch: 'timpani', name: 'Timpani', gain: 0.45, reverb: 0.4 });

  const ostinato = rng.pick([
    [0, 2, 3, 2],
    [0, 1, 2, 3],
    [0, 2, 1, 3, 2, 1],
    [0, 3, 2, 3],
  ]);
  let voicing: number[] | null = null;
  let strVoicing: number[] | null = null;
  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(prog, s, b);
    b.section(s, spans.map((x) => x.chord), flats);
    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      voicing = voiceChord(span.chord, voicing, { low: 55, high: 76, voices: 4, rootless: false });
      // Piano ostinato in eighths.
      const n = Math.round(span.beats * 2);
      for (let e = 0; e < n; e++) {
        if (last && e > 3) break;
        const p = voicing[ostinato[e % ostinato.length]! % voicing.length]!;
        b.note(piano, span.t + e * beat * 0.5, beat * (last && e === 3 ? 6 : 1.4), p, vel(rng, (e % 4 === 0 ? 0.5 : 0.4) * (s.part === 'B' ? 1.1 : 1), 0.04));
      }
      const root = bassNote(bassPc(span.chord), null, 36, 50);
      b.note(piano, span.t, last ? b.end - span.t - 0.5 : span.dur, root, vel(rng, 0.45));
      if (!intro) {
        strVoicing = voiceChord(span.chord, strVoicing, { low: 52, high: 74, voices: 4, rootless: false });
        for (const p of strVoicing) b.note(strings, span.t, last ? b.end - span.t - 0.5 : span.dur + 0.2, p, 0.5);
      }
      if (s.part === 'B') {
        for (const p of voicing.slice(0, 2)) b.note(horn, span.t + beat * 0.5, span.dur * 0.9, p - 12 >= 48 ? p - 12 : p, 0.55);
        for (const x of [0, 2]) b.note(pizz, span.t + x * beat, beat, root, vel(rng, 0.6));
      }
      if (s.part === 'A' && s.repeat > 0 && !last) {
        if (rng.chance(0.4 + D * 0.4)) {
          const tones = chordPcs(span.chord);
          b.note(celesta, span.t + beat * rng.pick([1, 1.5, 2.5]), beat * 2, nearestInSet(rng.int(79, 91), tones), vel(rng, 0.45));
        }
      }
    });
    if (s.part === 'B') {
      // A soft timpani swell into the next section.
      const end = b.grid.bar(s.startBar + s.bars);
      const p = bassNote(tonic, null, 40, 52) + 19;
      for (let t = end - beat * 2; t < end - 0.05; t += 0.09) b.hit(timp, t, 0.15 + (0.4 * (t - (end - beat * 2))) / (beat * 2), p, 1.5);
      b.hit(timp, end, 0.6, p, 3);
    }
  }
  void keyScale;
  void W;
  return b.build({
    key: keyName(tonic, tpl.scale),
    progression: tpl.prog,
    fx: trackFx({ gain: 0.4, lowpass: lerp(6000, 14000, B), highpass: 32, wow: 0, wowRate: 0.3, flutter: 0, drive: 0, reverbTone: 6000, reverbLevel: 1.4 }),
  });
}

// Drum and bass at ~172 bpm: chopped breakbeats (two-step and rolling edits with ghost
// snares) over a sub bass that rolls under every bar, a reese growling through the
// drops, liquid pads, Rhodes-ish stabs and sparse bells through a long echo. DJ-length
// structure: a filtered intro, the drop, a breakdown with a snare-roll build, the second
// drop, and an outro that leaves room to mix out.

import type { TrackRequest } from '../index';
import { fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune } from './common';
import { bpmFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';

const MINOR = ['i9 i9 bVImaj9 bVImaj9 bIIImaj9 bIIImaj9 bVII69 bVII69', 'i9 i9 iv9 iv9 bVIImaj9 bVIImaj9 bIIImaj9 bIIImaj9', 'iv9 iv9 v9 v9 i9 i9 i9 i9', 'i9 i9 bVII69 bVII69 bVImaj9 bVImaj9 v9 v9', 'i11 i11 bIIImaj9 bIIImaj9 bVImaj7#11 bVImaj7#11 v9 v9'];
const MAJOR = ['Imaj9 Imaj9 vi9 vi9 IVmaj9 IVmaj9 V9sus V9sus', 'IVmaj9 IVmaj9 iii7 iii7 vi9 vi9 Imaj9 Imaj9', 'Imaj7#11 Imaj7#11 iii7 iii7 IVmaj9 IVmaj9 iv6 iv6'];

/** Breaks: [kick steps, snare steps, ghost steps] per bar (two bars per pattern). */
const BREAKS: { name: string; bars: [number[], number[], number[]][] }[] = [
  { name: 'two-step', bars: [[[0, 10], [4, 12], [7, 15]], [[0, 10], [4, 12], [9, 14]]] },
  { name: 'rolling', bars: [[[0, 2, 10, 11], [4, 12], [7, 9, 15]], [[0, 2, 10], [4, 12], [7, 9, 14]]] },
  { name: 'stepper', bars: [[[0, 6, 10], [4, 12], [3, 15]], [[0, 10], [4, 12, 14], [7, 9]]] },
];

export function composeDrumAndBass(req: TrackRequest): Score {
  const S = streams(req, 'drum-and-bass');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 172, density: 0.6, grit: 0.12, weirdness: 0.2, brightness: 0.62 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.82);
  const tonic = tonicFor(S, [2, 4, 5, 7, 9]);
  const tpl = song.pick(minor ? MINOR : MAJOR);
  const prog = parseProgression(tpl, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'minor' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [168, 176], 0.4);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.03);
  const big = fit.bars >= 64;
  const plan = planForm(fit.bars, big ? 16 : fit.bars >= 20 ? 8 : fit.bars >= 8 ? 2 : 0, big ? 16 : fit.bars >= 24 ? 8 : fit.bars >= 8 ? 2 : 0, [{ part: 'D', bars: 32 }, { part: 'B', bars: 16 }]);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks, 4);
  const beat = b.beat;

  // ── Sound ──
  const reeseOn = style.chance(0.6);
  const padPatch: SynthPatch = style.weighted([['pad-warm', 3], ['pad-glass', 2], ['pad-choir', 2], ['pad-strings', 1]]);
  const stabPatch: SamplePatch = style.weighted([['ep', 3], ['dx-ep', 2], ['vibes', 1.5], ['ep-bright', 1.5]]);
  const bellPatch: SamplePatch = style.weighted([['glass', 3], ['celesta', 2], ['kalimba', 1]]);
  const breakA = style.pick(BREAKS);
  const breakB = song.chance(0.5) ? breakA : song.pick(BREAKS);

  const kick = b.inst({ kind: 'sample', patch: 'kick-dnb', name: 'Kick', gain: 0.36 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-dnb', name: 'Snare', gain: 0.5, reverb: 0.22, pan: 0.02 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hats', gain: 0.42, pan: 0.2, lowpass: lerp(9000, 14000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.16, pan: 0.2 });
  const ride = b.inst({ kind: 'sample', patch: 'ride', name: 'Ride', gain: 0.12, pan: -0.25, reverb: 0.1 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.22, pan: -0.3 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.18, reverb: 0.3, pan: 0.2 });
  const sub = b.inst({ kind: 'synth', patch: 'sub-sine', name: 'Sub bass', gain: 0.3 });
  const reese = b.inst({ kind: 'synth', patch: 'reese', name: 'Reese', gain: 0.26, pan: 0, highpass: 90, detune: weirdDetune(song, W, 15) });
  const pad = b.inst({ kind: 'synth', patch: padPatch, name: 'Pad', gain: 0.34, reverb: 0.45, pan: 0 });
  const stab = b.inst({ kind: 'sample', patch: stabPatch, name: 'Stabs', gain: 0.4, reverb: 0.25, delay: 0.35, pan: -0.15, lowpass: lerp(4000, 9000, B), tremolo: stabPatch === 'ep' ? { rate: 4.4, depth: 0.3 } : undefined });
  const bell = b.inst({ kind: 'sample', patch: bellPatch, name: 'Bells', gain: 0.32, reverb: 0.5, delay: 0.55, pan: 0.3, detune: weirdDetune(song, W, 20) });

  const melody = phrase(S, 'dnb-bells', 16, 0.18 + D * 0.2, { restTail: 4, maxNotes: 3, maxLeap: 4 });
  const subStyle = song.int(0, 2);
  let padV: number[] | null = null;
  let stabV: number[] | null = null;
  let prevBass: number | null = null;
  const open = lerp(7000, 16000, B);

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const drop = s.part === 'D';
    const breakdown = s.part === 'B';
    const spans = chordSpans(prog, s, b);
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : drop ? (s.repeat ? 'drop ′' : 'drop') : 'breakdown' }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);

    // The filter: the intro opens up into the drop; the breakdown dips and climbs back.
    if (intro) {
      b.auto('cutoff', 0, 500, 0);
      b.auto('cutoff', 0.05, open * 0.5, (sEnd - sT) / 2);
      b.auto('cutoff', sEnd - beat * 0.25, open, 0.02);
    } else if (breakdown) {
      b.auto('cutoff', sT, open * 0.45, b.beat * 2);
      b.auto('cutoff', b.grid.bar(s.startBar + Math.max(1, s.bars - 4)), open, (b.grid.bar(4) / 1.5));
    } else if (outro) {
      b.auto('cutoff', b.grid.bar(s.startBar + Math.floor(s.bars / 2)), open * 0.3, (sEnd - sT) / 3);
    } else b.auto('cutoff', sT, open, 0.05);
    if (drop) b.hit(crash, sT, 0.8, 60, 3);

    // ── Pads: two-bar chords, everywhere but quieter in the drops ──
    let k = 0;
    while (k < spans.length) {
      const span = spans[k]!;
      let j = k + 1;
      while (j < spans.length && spans[j]!.chord === span.chord) j++;
      const end = j < spans.length ? spans[j]!.t : sEnd;
      padV = voiceChord(span.chord, padV, { low: 55, high: 79, voices: 4, maxSpan: 19 });
      const last = outro && j >= spans.length;
      const d = last ? b.end - span.t - 0.4 : end - span.t + 0.15;
      for (const p of padV) b.note(pad, span.t, d, p, vel(song, drop ? 0.38 : 0.52, 0.03));
      k = j;
    }

    // ── Drums ──
    const drumsFrom = intro ? Math.max(0, s.bars - (s.bars >= 16 ? 8 : 2)) : 0;
    for (let bar = s.startBar; bar < s.startBar + s.bars; bar++) {
      const kb = bar - s.startBar;
      const t0 = b.grid.bar(bar);
      if (breakdown) {
        // Ride and shaker only; then a snare roll builds into the drop.
        const buildFrom = s.bars - Math.min(4, s.bars);
        if (kb < buildFrom) {
          if (kb >= 2) for (let st = 0; st < 16; st += 4) b.hit(ride, b.grid.step(bar, st + 2), vel(song, 0.4), 60, 1.4);
          continue;
        }
        const u = (kb - buildFrom) / Math.max(1, s.bars - buildFrom);
        const step = u < 0.5 ? 2 : u < 0.75 ? 1 : 0.5;
        for (let st = 0; st < 16; st += step) b.hit(snare, b.grid.step(bar, st), Math.min(0.95, 0.35 + u * 0.5 + (st / 16) * 0.1), 60 + Math.round(u * 4), 0.4);
        if (kb === s.bars - 1) b.note(crash, b.grid.bar(bar), b.fit.barDur, 60, 0.7, { rev: true });
        continue;
      }
      if (kb < drumsFrom) continue;
      if (outro && kb === s.bars - 1) {
        b.hit(kick, t0, 0.9);
        b.hit(crash, t0, 0.7, 60, 3);
        break;
      }
      const brk = (drop && s.repeat > 0) || (outro && kb % 4 >= 2) ? breakB : breakA;
      const [kicks, snares, ghosts] = brk.bars[kb % 2]!;
      const fill = drop && kb % 8 === 7;
      for (const st of kicks) if (!(fill && st >= 8)) b.hit(kick, b.grid.step(bar, st) + song.gauss() * 0.002, vel(song, st === 0 ? 0.95 : 0.8));
      for (const st of snares) b.hit(snare, b.grid.step(bar, st) + song.gauss() * 0.002, vel(song, 0.9));
      for (const st of ghosts) if (song.chance(0.55 + D * 0.35) && !(fill && st >= 8)) b.hit(snare, b.grid.step(bar, st) + 0.004, vel(song, 0.24, 0.06), 61, 0.2);
      if (fill) for (const st of [8, 10, 11, 13, 14, 15]) b.hit(snare, b.grid.step(bar, st), vel(song, 0.45 + st * 0.025), 60 + (st % 3), 0.25);
      for (let st = 0; st < 16; st += 2) {
        if (fill && st >= 8) break;
        const off = st % 4 === 2;
        if (off && song.chance(0.25)) b.hit(ohat, b.grid.step(bar, st), vel(song, 0.42), 60, 0.4);
        else b.hit(hat, b.grid.step(bar, st) + song.gauss() * 0.002, vel(song, off ? 0.5 : 0.38), 60, 0.2);
      }
      if (D > 0.45) for (let st = 1; st < 16; st += 2) if (song.chance(0.5)) b.hit(shaker, b.grid.step(bar, st), vel(song, 0.3), 60, 0.2);
      if (drop && s.repeat > 0) for (const st of [2, 6, 10, 14]) b.hit(ride, b.grid.step(bar, st), vel(song, 0.35), 60, 1.2);
    }

    // ── Sub and reese ──
    if (!(intro && s.bars >= 8)) {
      spans.forEach((span, idx) => {
        const root = bassNote(bassPc(span.chord), prevBass, 28, 40);
        prevBass = root;
        const t = span.t;
        const inBar = span.bar - s.startBar;
        if (outro && inBar >= s.bars - 2) {
          if (inBar === s.bars - 1 && span.beat === 0) b.note(sub, t, Math.min(b.end - t - 0.2, beat * 3), root, 0.8);
          return;
        }
        if (breakdown && inBar < s.bars - 4) {
          if (span.beat === 0 && inBar % 2 === 0) b.note(sub, t, b.fit.barDur * 2 - beat * 0.5, root, 0.7);
          return;
        }
        // Rolling sub: long notes re-struck on the break's syncopations.
        const hits: [number, number, number][] =
          subStyle === 0 ? [[0, 6, 0], [6, 4, 0], [10, 6, 0]] : subStyle === 1 ? [[0, 10, 0], [10, 4, 0], [14, 2, 12]] : [[0, 3, 0], [3, 3, 0], [8, 2, 0], [10, 6, idx % 2 ? -5 : 0]];
        for (const [st, len, shift] of hits) {
          const p = root + shift;
          b.note(sub, b.grid.step(span.bar, st), len * beat * 0.25 * 0.95, p, vel(song, st === 0 ? 0.85 : 0.75));
          if (reeseOn && drop && (inBar % 16 >= 8 || s.repeat > 0)) b.note(reese, b.grid.step(span.bar, st), len * beat * 0.25 * 0.95, p + 12, vel(song, 0.7));
        }
      });
    }

    // ── Stabs: offbeat chord hits in the drops ──
    if (drop || (outro && s.bars > 4)) {
      spans.forEach((span) => {
        const inBar = span.bar - s.startBar;
        if (outro && inBar >= s.bars - 4) return;
        stabV = voiceChord(span.chord, stabV, { low: 57, high: 76, voices: 4 });
        const pattern = inBar % 2 === 0 ? [3, 10] : [6, 14];
        for (const st of pattern) {
          if (song.chance(0.2 - D * 0.15)) continue;
          for (const p of stabV) b.note(stab, b.grid.step(span.bar, st), beat * 0.6, p, vel(song, 0.5));
        }
      });
    }

    // ── Bells: a sparse line through the echo (breakdowns and second halves of drops) ──
    if (breakdown || (drop && s.bars >= 16) || intro) {
      for (let ph = intro ? Math.max(0, s.bars - 8) : drop ? 16 : 0; ph + 4 <= s.bars; ph += 8) {
        const notes = realizeMotif(melody, 0, beat, 79, spans, keyScale, 70, 91, b.grid, s.startBar + ph);
        for (const n of notes) b.note(bell, n.t, Math.min(n.d, beat * 4), n.p, vel(song, 0.5));
      }
    }
  }

  return b.build({
    key: keyName(tonic, minor ? 'minor' : 'major'),
    progression: `${tpl} · ${breakA.name} break${reeseOn ? ' · reese' : ''}`,
    fx: trackFx({
      gain: 0.331,
      lowpass: open,
      highpass: 28,
      q: 0.9,
      wow: G * 0.8 + W * 0.8,
      wowRate: 0.3,
      flutter: 0,
      drive: 0.12 + G * 0.3,
      delay: { time: beat * 0.75, feedback: 0.42, tone: 3200, wet: 0.4 },
      reverbTone: 6500,
      reverbLevel: 1.2,
    }),
  });
}


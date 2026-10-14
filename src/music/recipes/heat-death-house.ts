// Deep house for the last rave in the universe. A soft round kick, shuffled hats, warm
// minor seventh and ninth chords in a syncopated stab rhythm, a round bass under them, a
// melancholy pad, and a wordless vocal hook drifting through a long echo. Euphoric and
// sad. The DJ lowers the tempo through the night (tweaks.bpm from ~124 down to ~96), and
// the music follows: as it slows it thins out and opens up, hats drop to the off-beats,
// chords hold longer, the pad and the room grow, and the vocal leaves more space.

import type { TrackRequest } from '../index';
import { clamp, fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { approach, fifthOf, reverseSwell, runway, smooth, foldTail } from './groove-kit';
import { bpmFor, fadeVelocities, feelFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';

const MINOR = ['i9 i9 iv9 iv9', 'i9 bVImaj9 iv9 v9', 'i9 bVImaj7 bIIImaj7 bVII6', 'iv9 v9 i9 i9', 'i11 bVIImaj7 bVImaj7 v9', 'i9 iv9 bVIImaj7 bIIImaj7', 'i9 i9 bVImaj9 bVII9sus'];
const MAJOR = ['vi9 IVmaj9 Imaj9 V9sus', 'IVmaj9 iii7 vi9 vi9', 'ii9 iii7 IVmaj7 V9sus', 'IVmaj7 Imaj7 vi9 V9sus', 'vi9 vi9 IVmaj9 IVmaj9'];

/** Chord stab rhythms over two bars: [16th step, length in 16ths]. Ordered busy → sparse. */
const STABS: [number, number][][] = [
  [[0, 3], [6, 2], [10, 4], [16, 3], [22, 2], [27, 3]],
  [[3, 2], [6, 4], [14, 2], [19, 2], [22, 4], [30, 2]],
  [[0, 2], [3, 3], [10, 3], [16, 2], [19, 3], [26, 4]],
  [[0, 6], [10, 4], [16, 6], [26, 4]],
  [[0, 12], [14, 2], [16, 14]],
];
/** Bass figures over one bar: [step, length, 'r' root | 'o' octave | 'f' fifth | 'a' approach]. Busy → sparse. */
const BASS: [number, number, 'r' | 'o' | 'f' | 'a'][][] = [
  [[0, 3, 'r'], [3, 1, 'o'], [6, 2, 'r'], [10, 2, 'f'], [14, 2, 'a']],
  [[2, 2, 'r'], [6, 2, 'r'], [10, 2, 'r'], [13, 1, 'o'], [14, 2, 'a']],
  [[0, 4, 'r'], [7, 2, 'r'], [10, 3, 'f'], [14, 2, 'a']],
  [[0, 6, 'r'], [10, 4, 'f']],
];

export function composeHeatDeathHouse(req: TrackRequest): Score {
  const S = streams(req, 'heat-death-house');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.5, grit: 0.1, weirdness: 0.15, brightness: 0.55 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.8);
  const tonic = tonicFor(S, [0, 2, 5, 7, 9, 10]);
  const tpl = song.pick(minor ? MINOR : MAJOR);
  const tBreak = song.pick(minor ? ['bVImaj9 bVImaj9 iv9 iv9', 'bIIImaj7 bIIImaj7 bVImaj9 bVImaj9', 'iv9 iv9 i9 i9'] : ['IVmaj9 IVmaj9 vi9 vi9', 'IVmaj7 IVmaj7 Imaj9 Imaj9']);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [104, 124], 0.5);
  // How far the night has slowed: 0 at full tempo (≥ 122), 1 by ~98 bpm.
  const slow = smooth((122 - bpm) / 24);
  const swing = clamp(feelFor(S, 0.53, 0.6) + slow * 0.03, 0.5, 0.64);
  const tail = Math.min(4, Math.max(0.8, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.03);
  const [introBars, outroBars] = runway(fit.bars, 16, 8);
  const plan = foldTail(planForm(fit.bars, introBars, outroBars, [
    { part: 'A', bars: 16 },
    { part: 'H', bars: 16 },
    { part: 'B', bars: style.pick([8, 16]) },
    { part: 'H', bars: 16 },
  ]), 8);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;
  const sixteenth = beat / 4;
  // Density falls with the tempo.
  const busy = clamp(D * (1 - slow * 0.6) + 0.15 * (1 - slow), 0, 1);

  // ── The rig ──
  const chordPatch: SamplePatch | SynthPatch = style.weighted([['house-chord', 2.5], ['ep', 2], ['organ', 1], ['dx-ep', 1]] as const);
  const bassPatch: SamplePatch | SynthPatch = style.weighted([['bass-round', 2], ['sub-sine', 1.5], ['synth-bass', 1]] as const);
  const padPatch: SynthPatch = style.weighted([['pad-warm', 2], ['pad-choir', 1.5], ['pad-strings', 1]] as const);
  const bellsPatch: SamplePatch = style.weighted([['glass', 2], ['kalimba', 1], ['vibes', 1]] as const);
  const bellsOn = style.chance(0.5);
  const synthChords = chordPatch === 'house-chord' || chordPatch === 'organ';

  const kick = b.inst({ kind: 'sample', patch: 'kick-deep', name: 'Kick', gain: 0.4 });
  const clap = b.inst({ kind: 'sample', patch: 'clap', name: 'Clap', gain: 0.6, reverb: 0.35, pan: -0.04 });
  const rim = b.inst({ kind: 'sample', patch: 'rim', name: 'Rim', gain: 0.4, reverb: 0.3, delay: 0.2, pan: 0.18 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hats', gain: 0.32, pan: 0.2, lowpass: lerp(7000, 11000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.32, pan: 0.2, lowpass: lerp(8000, 12000, B) });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.45, pan: -0.3 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.1, reverb: 0.4, lowpass: 9000 });
  const bass =
    bassPatch === 'bass-round'
      ? b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.8, release: 0.08 })
      : b.inst({ kind: 'synth', patch: bassPatch as SynthPatch, name: bassPatch === 'sub-sine' ? 'Sub bass' : 'Synth bass', gain: bassPatch === 'sub-sine' ? 0.37 : 0.4, pump: 0.2 });
  const chords = synthChords
    ? b.inst({ kind: 'synth', patch: chordPatch as SynthPatch, name: chordPatch === 'organ' ? 'Organ chords' : 'Chords', gain: chordPatch === 'organ' ? 0.6 : 1.1, reverb: 0.3, delay: 0.18, pan: -0.06, pump: 0.3, lowpass: lerp(3000, 7000, B) })
    : b.inst({ kind: 'sample', patch: chordPatch as SamplePatch, name: 'Electric piano chords', gain: 0.5, reverb: 0.3, delay: 0.18, pan: -0.06, pump: 0.3, lowpass: lerp(4000, 8000, B), tremolo: chordPatch === 'ep' ? { rate: 3.6, depth: 0.25 } : undefined });
  const pad = b.inst({ kind: 'synth', patch: padPatch, name: 'Pad', gain: 0.44, reverb: 0.55, pan: 0, pump: 0.25 });
  const vox = b.inst({ kind: 'sample', patch: 'vox', name: 'Vocal', gain: 0.36, reverb: 0.5, delay: 0.42, pan: 0.08, detune: weirdDetune(style, W, 15) });
  const bells = bellsOn ? b.inst({ kind: 'sample', patch: bellsPatch, name: 'Bells', gain: 0.3, reverb: 0.5, delay: 0.45, pan: 0.28 }) : -1;

  // ── This set ──
  const stabIdx = clamp(Math.round(song.int(0, 2) + slow * 2.4), 0, STABS.length - 1);
  const stabPat = STABS[stabIdx]!;
  const bassPat = BASS[clamp(Math.round(song.int(0, 1) + slow * 2.2), 0, BASS.length - 1)]!;
  const hook = phrase(S, 'house-hook', 8, 0.3 + busy * 0.3, { restTail: 2.5, maxNotes: 4, maxLeap: 3 });
  const hookAnswer = varyMotif(song, hook, 0.5);
  const bellLine = phrase(S, 'house-bells', 16, 0.25, { restTail: 4, maxNotes: 3, maxLeap: 4 });
  const fade = fit.bars >= 16 && style.chance(0.6);
  const fadeFrom = plan.find((s) => s.part === 'outro');
  const cut0 = lerp(6000, 12000, B) * (1 - slow * 0.25);

  let chV: number[] | null = null;
  let padV: number[] | null = null;
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const isA = s.part === 'A';
    const isH = s.part === 'H';
    const isB = s.part === 'B';
    const prog = parseProgression(isB ? tBreak : tpl, tonic);
    const spans = chordSpans(prog, s, b);
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : isB ? 'breakdown' : isH ? (s.repeat ? 'peak ′' : 'peak') : 'groove' }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    if (intro && s.bars >= 4) {
      b.auto('cutoff', 0, 1000, 0);
      b.auto('cutoff', 0.05, cut0, (sEnd - sT) / 3);
    } else if (isB) {
      b.auto('cutoff', sT, cut0 * 0.45, beat * 2);
      b.auto('cutoff', b.grid.bar(s.startBar + Math.max(1, s.bars - 2)), cut0, beat * 3);
    } else if (outro && s.bars >= 4) b.auto('cutoff', sT + (sEnd - sT) / 2, 1600, (sEnd - sT) / 4);
    else b.auto('cutoff', sT, cut0, 0.4);
    if (isH && !slow) b.hit(crash, sT, 0.6, 60, 3);
    else if (isH) b.hit(crash, sT, 0.45, 60, 3);
    if (isB) reverseSwell(b, crash, sEnd, beat * 3, 0.45);

    // ── Drums ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      const u = k / Math.max(1, s.bars);
      const backbeat = !intro || u >= 0.5;
      const lastBar = k === s.bars - 1;
      const sixteenths = busy > 0.35 && (isH || (isA && k >= 4)) && slow < 0.3;
      for (let st = 0; st < 16; st++) {
        const t = b.grid.step(bar, st) + song.gauss() * 0.0025;
        const q = st % 4;
        if (q === 0 && !isB) {
          b.hit(kick, t, vel(song, (st === 0 ? 0.9 : 0.84) * (1 - slow * 0.12), 0.03));
          b.pump(t);
        }
        if (isB) {
          // Breakdown: a rim ticking in the dark, a shaker if the night still has it.
          if (st === 12 && k % 2 === 1) b.hit(rim, t, vel(song, 0.45), 60, 0.3);
          if (busy > 0.4 && q === 2) b.hit(shaker, t, vel(song, 0.3), 60, 0.15);
          continue;
        }
        if (backbeat && (st === 4 || st === 12)) {
          if (slow < 0.55) b.hit(clap, t + 0.003, vel(song, 0.7 - slow * 0.2), 60, 0.6);
          if (slow > 0.35 || (k % 4 === 3 && st === 12)) b.hit(rim, t, vel(song, 0.55), 60, 0.3);
        }
        if (q === 2 && !(lastBar && st === 14 && isA)) b.hit(ohat, t, vel(song, isH ? 0.55 : 0.42), 60, slow > 0.5 ? 0.4 : 0.3);
        else if (sixteenths && q !== 2) b.hit(hat, t, vel(song, q === 0 ? 0.42 : q === 1 ? 0.24 : 0.34, 0.05), 60, 0.1);
        else if (!sixteenths && q === 3 && busy > 0.2 && !intro) b.hit(hat, t, vel(song, 0.28), 60, 0.08);
        if (busy > 0.45 && (isH || isA) && (q === 1 || q === 3) && !intro) b.hit(shaker, t, vel(song, 0.32), 60, 0.12);
      }
    }

    // ── Bass ──
    if (!(intro && s.bars >= 4) && !isB) {
      spans.forEach((span, k) => {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 43);
        prevBass = root;
        const nextSpan = spans[k + 1] ?? null;
        const nextRoot = nextSpan ? bassNote(bassPc(nextSpan.chord), root, 31, 43) : root;
        for (const [st, l, what] of bassPat) {
          if (st >= span.beats * 4) continue;
          if (what === 'a' && (!nextSpan || nextRoot === root)) continue;
          const p = what === 'r' ? root : what === 'o' ? root + 12 : what === 'f' ? root + fifthOf(span.chord) - (root + fifthOf(span.chord) > 45 ? 12 : 0) : approach(song, nextRoot, keyScale);
          b.note(bass, b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.003, l * sixteenth * (0.85 + slow * 0.1), p, vel(song, what === 'r' ? 0.75 : 0.6, 0.03));
        }
      });
    } else if (isB) {
      // Breakdown: one long low note per chord, barely there.
      for (const span of spans) if (span.beat === 0 && (span.bar - s.startBar) % 2 === 0) b.note(bass, span.t, Math.min(span.dur * 2, b.end - span.t) * 0.9, bassNote(bassPc(span.chord), prevBass, 31, 43), 0.45);
    }

    // ── Chords and pad ──
    spans.forEach((span) => {
      chV = voiceChord(span.chord, chV, { low: 53, high: 72, voices: 4 });
      const t = span.t;
      const chordsHere = !intro || span.bar >= s.startBar + s.bars - 4;
      if (chordsHere && !isB) {
        // The stab rhythm runs over two-bar cells; it starts on even bars of the section.
        if (span.beat === 0) {
          const cellBar = (span.bar - s.startBar) % 2;
          for (const [st, l] of stabPat) {
            if (Math.floor(st / 16) !== cellBar) continue;
            const at = b.grid.step(span.bar, st % 16) + song.gauss() * 0.002;
            const d = l * sixteenth * (synthChords ? 0.8 : 0.95);
            chV!.forEach((p, j) => b.note(chords, at + j * 0.003, d, p, vel(song, st % 16 === 0 ? 0.6 : 0.52)));
          }
        }
      }
      if (isB) chV.forEach((p, j) => b.note(chords, t + j * 0.02, span.dur * 0.95, p, vel(song, 0.45)));
      if (isH || isB || (isA && s.repeat > 0) || (slow > 0.5 && !intro)) {
        padV = voiceChord(span.chord, padV, { low: 57, high: 79, voices: 4, rootless: false });
        for (const p of padV) b.note(pad, t, span.dur + 0.05, p, vel(song, isB ? 0.6 : 0.45 + slow * 0.1));
      }
    });

    // ── The vocal hook and the bells ──
    if ((isH || isB || (isA && s.repeat > 0)) && !outro) {
      const every = slow > 0.5 ? 8 : 4;
      for (let ph = 0; ph + 2 <= s.bars; ph += every) {
        if (isB && ph + 2 > s.bars - 1) continue;
        const m = (ph / every) % 2 === 0 ? hook : hookAnswer;
        const notes = realizeMotif(m, 0, beat, 67, spans, keyScale, 60, 76, b.grid, s.startBar + ph);
        for (const n of notes) b.note(vox, n.t + song.gauss() * 0.004, Math.min(1.6, n.d * (1 + slow * 0.4)), n.p, vel(song, n.strong ? 0.7 : 0.5));
      }
    }
    if (bells >= 0 && (isH || isB) && busy > 0.15) {
      for (let ph = 0; ph + 4 <= s.bars; ph += 8) {
        const notes = realizeMotif(bellLine, 0, beat, 79, spans, keyScale, 72, 91, b.grid, s.startBar + ph + 4);
        for (const n of notes) b.note(bells, n.t, n.d, n.p, vel(song, 0.45));
      }
    }
  }

  if (fade && fadeFrom) fadeVelocities(b, b.grid.bar(fadeFrom.startBar), b.end - 0.2, 0.03);

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'major'),
    progression: `${tpl} · breakdown ${tBreak}${slow > 0.4 ? ' · slowed right down' : ''}`,
    fx: trackFx({
      gain: 0.36,
      lowpass: cut0,
      highpass: 30,
      q: 0.7,
      wow: G * 1.2 + W * 1.2 + slow * 0.3,
      wowRate: 0.35,
      flutter: G * 0.04,
      drive: 0.06 + G * 0.25,
      delay: { time: beat * 0.75, feedback: 0.35 + slow * 0.15, tone: 3200, wet: 0.32 + slow * 0.1 },
      reverbTone: 6000,
      reverbLevel: 1.1 + slow * 0.35,
    }),
  });
}

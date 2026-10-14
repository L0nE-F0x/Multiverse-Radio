// Space funk: a casino lounge on a dying star. Minor-ninth vamps with a slap (or Moog)
// bass riff that the whole song hangs on, a clavinet chopping sixteenths with a wah clav
// answering, tight sixteenth hats and ghost notes, Rhodes, a horn section (trumpet, sax,
// trombone) for stabs and unison lines, a dark pad like red light through velvet, and a
// gliding synth lead. Some nights there's a big build-up: a snare roll, a riser and the
// horns stacking up, a beat of silence, then the collapse.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { bassPc, chord, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { riser, roll, runway, thirdOf, underOctave, foldTail } from './groove-kit';
import { bpmFor, fadeVelocities, feelFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';

const MINOR_A = ['i9 i9 i9 IV9', 'i9 i9 iv9 iv9', 'i11 i11 bVII9 bVII9', 'i9 bVII9 i9 bVII9', 'i9 i9 bIIImaj7 IV9', 'i9 IV9 i9 IV9'];
const MINOR_B = ['bVImaj7 bVII9 i9 i9', 'iv9 bVII13 bIIImaj9 bVImaj7', 'bVImaj7 V7#9 i9 i9', 'iv9 v9 bVImaj7 V7#9', 'bIIImaj7 bVImaj7 iv9 V7#9'];
const MAJOR_A = ['I9 I9 IV9 IV9', 'I9 bVII9 I9 bVII9', 'I13 I13 IV9 V9sus', 'I9 I9 I9 bVII9'];
const MAJOR_B = ['IV9 IV9 I9 I9', 'ii9 V13 Imaj9 VI7#9', 'bVImaj7 bVII9 I9 I9', 'IVmaj7 iii7 ii9 V13'];

/** Bass rhythm templates: [16th step, length in 16ths, role]. r = root, p = pop (octave), x = dead note, n = scale note. */
type Role = 'r' | 'p' | 'x' | 'n';
const RIFFS: [number, number, Role][][] = [
  [[0, 2, 'r'], [3, 1, 'n'], [6, 1, 'p'], [7, 1, 'n'], [10, 2, 'r'], [13, 1, 'x'], [14, 1, 'p']],
  [[0, 3, 'r'], [3, 1, 'x'], [4, 1, 'n'], [6, 1, 'p'], [8, 2, 'r'], [10, 1, 'n'], [11, 1, 'p'], [14, 2, 'n']],
  [[0, 1, 'r'], [2, 1, 'r'], [3, 1, 'n'], [6, 2, 'p'], [9, 1, 'x'], [10, 1, 'r'], [12, 2, 'n'], [15, 1, 'p']],
  [[0, 2, 'r'], [2, 1, 'x'], [3, 1, 'r'], [5, 1, 'p'], [7, 2, 'n'], [10, 1, 'r'], [11, 1, 'x'], [12, 1, 'n'], [14, 1, 'p'], [15, 1, 'n']],
];
/** Kick patterns (16th steps). */
const KICKS = [[0, 3, 6, 10], [0, 7, 8, 10, 13], [0, 2, 7, 10, 11], [0, 6, 9, 10]];
/** Clav figures: [step, 'l' (low dyad) | 'h' (high dyad) | 'm' (muted)]. */
const CLAVS: [number, 'l' | 'h' | 'm'][][] = [
  [[0, 'l'], [2, 'h'], [3, 'm'], [6, 'h'], [8, 'l'], [10, 'h'], [11, 'm'], [14, 'h']],
  [[0, 'h'], [1, 'm'], [3, 'h'], [6, 'l'], [7, 'm'], [9, 'h'], [12, 'l'], [14, 'h'], [15, 'm']],
  [[2, 'h'], [3, 'h'], [6, 'l'], [8, 'm'], [10, 'h'], [11, 'h'], [14, 'l']],
];
const WAH = [[2, 6, 10, 14], [3, 7, 11, 15], [2, 7, 10, 15]];

/** The bass riff's scale notes, chosen once per song (minor pentatonic over the chord root). */
function riffNotes(rng: Rng, n: number): number[] {
  const pool: [number, number][] = [[7, 3], [10, 3], [5, 2], [3, 2], [12, 1.5], [-2, 2], [-5, 1]];
  return Array.from({ length: n }, () => rng.weighted(pool));
}

export function composeSpaceFunk(req: TrackRequest): Score {
  const S = streams(req, 'space-funk');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 104, density: 0.6, grit: 0.08, weirdness: 0.15, brightness: 0.62 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.82);
  const tonic = tonicFor(S, [0, 2, 4, 5, 7, 9]);
  const tA = song.pick(minor ? MINOR_A : MAJOR_A);
  const tB = song.pick(minor ? MINOR_B : MAJOR_B);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'mixolydian']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [98, 112], 0.5);
  const swing = feelFor(S, 0.5, 0.57);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.025));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.03);
  const [introBars, outroBars] = runway(fit.bars, 8, 4);
  const buildy = style.chance(0.75);
  const cycle = [
    { part: 'A', bars: 16 },
    { part: 'B', bars: 8 },
    { part: 'A', bars: 16 },
    ...(buildy ? [{ part: 'U', bars: 8 }] : [{ part: 'B', bars: 8 }]),
    { part: 'X', bars: 16 },
    { part: 'B', bars: 8 },
  ];
  const plan = foldTail(planForm(fit.bars, introBars, outroBars, cycle), 8);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;
  const sixteenth = beat / 4;

  // ── The band ──
  const bassPatch: SamplePatch | SynthPatch = style.weighted([['slap-bass', 3], ['synth-bass', 1.5], ['bass-round', 1]] as const);
  const keysPatch: SamplePatch = style.weighted([['ep', 2.5], ['dx-ep', 1], ['wurli', 1]] as const);
  const padPatch: SynthPatch = style.weighted([['pad-dark', 2], ['pad-choir', 1.2], ['pad-strings', 1]] as const);
  const leadPatch: SynthPatch = style.weighted([['soft-lead', 2], ['saw-lead', 1.5], ['square-lead', 1]] as const);
  const snarePatch: SamplePatch = style.weighted([['snare-dub', 2], ['snare-rock', 1.5], ['snare-lofi', 1]] as const);
  const kickPatch: SamplePatch = style.weighted([['kick-punch', 2], ['kick-disco', 1.5]] as const);
  const wahOn = style.chance(0.7);
  const saxOn = style.chance(0.75);

  const kick = b.inst({ kind: 'sample', patch: kickPatch, name: 'Kick', gain: 0.38 });
  const snare = b.inst({ kind: 'sample', patch: snarePatch, name: 'Snare', gain: 0.43, reverb: 0.18, pan: 0.03 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.36, pan: 0.24, lowpass: lerp(7500, 12000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.17, pan: 0.24 });
  const clap = b.inst({ kind: 'sample', patch: 'clap', name: 'Claps', gain: 0.4, reverb: 0.3, pan: -0.05 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.15, reverb: 0.3, pan: -0.25 });
  const zap = b.inst({ kind: 'sample', patch: 'zap', name: 'Lasers', gain: 0.18, reverb: 0.35, delay: 0.3, pan: 0.3 });
  const rise = buildy ? b.inst({ kind: 'sample', patch: 'noise-riser', name: 'Riser', gain: 0.2, reverb: 0.3 }) : -1;
  const bass =
    bassPatch === 'synth-bass'
      ? b.inst({ kind: 'synth', patch: 'synth-bass', name: 'Moog bass', gain: 0.65 })
      : b.inst({ kind: 'sample', patch: bassPatch as SamplePatch, name: bassPatch === 'slap-bass' ? 'Slap bass' : 'Bass', gain: bassPatch === 'slap-bass' ? 0.66 : 0.85, release: 0.05 });
  const clav = b.inst({ kind: 'sample', patch: 'clav', name: 'Clavinet', gain: 0.33, pan: -0.38, reverb: 0.08, release: 0.04 });
  const wah = wahOn ? b.inst({ kind: 'sample', patch: 'clav-wah', name: 'Wah clav', gain: 0.3, pan: 0.4, reverb: 0.1, release: 0.05 }) : -1;
  const keys = b.inst({ kind: 'sample', patch: keysPatch, name: 'Rhodes', gain: 0.41, pan: -0.12, reverb: 0.25, lowpass: lerp(4500, 9000, B), tremolo: keysPatch === 'ep' ? { rate: 4.6, depth: 0.35 } : undefined });
  const trumpet = b.inst({ kind: 'synth', patch: 'funk-horn', name: 'Trumpet', gain: 0.5, reverb: 0.22, pan: 0.16 });
  const sax = saxOn ? b.inst({ kind: 'synth', patch: 'funk-sax', name: 'Tenor sax', gain: 0.45, reverb: 0.22, pan: 0.05 }) : -1;
  const bone = b.inst({ kind: 'synth', patch: 'trombone', name: 'Trombone', gain: 0.45, reverb: 0.22, pan: -0.08 });
  const pad = b.inst({ kind: 'synth', patch: padPatch, name: 'Red giant', gain: 0.34, reverb: 0.5, pan: 0 });
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: 'Space lead', gain: leadPatch === 'saw-lead' ? 0.3 : 0.36, reverb: 0.35, delay: 0.3, pan: 0.08, detune: weirdDetune(style, W, 18) });

  // ── This song's riff and figures ──
  const riff = song.pick(RIFFS);
  const riffPitches = riffNotes(song, riff.length);
  const kickPat = song.pick(KICKS);
  const ghosts = [2, 7, 9, 11, 14, 15].filter(() => song.chance(0.25 + D * 0.3));
  const clavPat = song.pick(CLAVS);
  const wahPat = song.pick(WAH);
  const openAt = song.pick([6, 10, 14, -1]);
  const hornLine = phrase(S, 'funk-horns', 8, 0.5 + D * 0.3, { restTail: 2, maxNotes: 6, maxLeap: 3 });
  const leadLine = phrase(S, 'funk-lead', 8, 0.4 + D * 0.3, { restTail: 1, maxNotes: 5, maxLeap: 4 });
  const fade = fit.bars >= 16 && style.chance(0.55);
  const fadeFrom = plan.find((s) => s.part === 'outro');
  const cut0 = lerp(6500, 13000, B);

  let keysV: number[] | null = null;
  let padV: number[] | null = null;
  let prevBass: number | null = null;

  for (const [si, s] of plan.entries()) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const isA = s.part === 'A' || s.part === 'X';
    const isB = s.part === 'B';
    const isU = s.part === 'U';
    const isX = s.part === 'X';
    const next = plan[si + 1];
    const tpl = isB ? tB : isU ? (minor ? 'bVImaj7 bVImaj7 bVII9 bVII9' : 'IVmaj7 IVmaj7 V9sus V9sus') : tA;
    let prog = parseProgression(tpl, tonic);
    const button = outro && !fade;
    if (button) prog = [[chord(tonic + (minor ? 8 : 5), minor ? 'maj7' : '9')], [chord(tonic + 7, '7#9')], [minor ? chord(tonic, 'm9') : chord(tonic, '9')]].slice(-Math.min(3, s.bars));
    const spans = chordSpans(prog, s, b);
    if (button) {
      const last = spans[spans.length - 1]!;
      last.dur = b.end - last.t;
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : isU ? 'build-up' : isX ? 'collapse' : isB ? 'bridge' : 'vamp' }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    if (isU) {
      b.auto('cutoff', sT, 1400, beat);
      b.auto('cutoff', sT + beat, cut0, (sEnd - sT) / 2.5);
    } else if (intro && s.bars >= 2) {
      b.auto('cutoff', 0, 900, 0);
      b.auto('cutoff', 0.05, cut0, (sEnd - sT) / 3);
    } else b.auto('cutoff', sT, cut0, 0.3);
    if (!intro && !button && (isB || isX || s.repeat === 0)) b.hit(crash, sT, 0.7, 60, 3);
    if (isX) {
      // The collapse: everyone lands together, with a laser for the star.
      b.hit(zap, sT, 0.8, 54, 0.8);
      for (const [j, p] of [0, 7, 12].entries()) b.note(bone, sT + j * 0.004, beat * 1.5, 43 + ((tonic + p) % 12), 0.8);
    }

    // ── Drums ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      const lastBar = k === s.bars - 1;
      if (button && lastBar) {
        b.hit(kick, b.grid.bar(bar), 0.95);
        b.hit(crash, b.grid.bar(bar), 0.8, 60, 3);
        b.hit(snare, b.grid.bar(bar), 0.8);
        continue;
      }
      if (intro && k < s.bars / 2 && s.bars >= 4) {
        // Just the hats and a kick, as the band walks on.
        for (let st = 0; st < 16; st += 2) b.hit(hat, b.grid.step(bar, st), vel(song, st % 4 === 0 ? 0.45 : 0.3), 60, 0.12);
        b.hit(kick, b.grid.bar(bar), 0.8);
        continue;
      }
      if (isU) {
        // Four on the floor, the roll building over the last half, then a beat of nothing.
        for (let q = 0; q < 4; q++) if (!(lastBar && q === 3)) b.hit(kick, b.grid.at(bar, q), vel(song, 0.8 + 0.15 * (k / s.bars)));
        for (let st = 0; st < 16; st += 2) if (!(lastBar && st >= 12)) b.hit(hat, b.grid.step(bar, st), vel(song, 0.35 + 0.3 * (k / s.bars)), 60, 0.12);
        if (k === Math.floor(s.bars / 2)) roll(b, snare, song, b.grid.bar(bar), sEnd - beat, 0.2, 0.9);
        else if (k < s.bars / 2) {
          b.hit(snare, b.grid.step(bar, 4), vel(song, 0.7));
          b.hit(snare, b.grid.step(bar, 12), vel(song, 0.7));
        }
        if (k >= s.bars - 2 && !lastBar) for (let q = 0; q < 4; q++) b.hit(clap, b.grid.at(bar, q), vel(song, 0.5 + 0.1 * q));
        continue;
      }
      const fill = lastBar && s.bars >= 4 && !outro && song.chance(0.6);
      for (let st = 0; st < 16; st++) {
        const t = b.grid.step(bar, st) + song.gauss() * 0.002;
        if (fill && st >= 12) continue;
        if (kickPat.includes(st)) b.hit(kick, t, vel(song, st === 0 ? 0.92 : 0.78));
        if (st === 4 || st === 12) {
          b.hit(snare, t, vel(song, 0.85));
          if (isB || isX) b.hit(clap, t + 0.005, vel(song, 0.55));
        } else if (ghosts.includes(st)) b.hit(snare, t, vel(song, 0.16, 0.04), 60, 0.2);
        if (st === openAt && (k % 2 === 1 || isX)) b.hit(ohat, t, vel(song, 0.5), 60, 0.5);
        else b.hit(hat, t, vel(song, st % 4 === 0 ? 0.55 : st % 2 === 0 ? 0.42 : 0.26, 0.04), 60, 0.12);
      }
      if (fill) {
        // A funk fill: snare sixteenths with a ghosted lead-in, sometimes a laser on top.
        for (let f = 0; f < 4; f++) b.hit(snare, b.grid.step(bar, 12 + f), 0.4 + f * 0.13);
        if (song.chance(0.4)) b.hit(zap, b.grid.step(bar, 14), 0.6, song.pick([57, 60, 62]), 0.6);
      }
    }

    // ── Bass riff ──
    if (!(intro && s.bars >= 4)) {
      spans.forEach((span, k) => {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 43);
        prevBass = root;
        if (button && k === spans.length - 1) {
          b.note(bass, span.t, Math.min(2.5, b.end - span.t - 0.3), root, 0.7);
          return;
        }
        const nextSpan = spans[k + 1];
        const changes = nextSpan && bassPc(nextSpan.chord) !== bassPc(span.chord);
        if (isU) {
          // Driving eighths on the root, octave pops on the "and".
          for (let st = 0; st < span.beats * 4; st += 2) b.note(bass, b.grid.step(span.bar, st + span.beat * 4), sixteenth * 1.4, st % 4 === 2 ? root + 12 : root, vel(song, 0.6 + 0.2 * ((span.bar - s.startBar) / s.bars)));
          return;
        }
        const turn = (span.bar - s.startBar) % 4 === 3 && song.chance(0.5);
        riff.forEach(([st, l, role], j) => {
          if (st >= span.beats * 4) return;
          if (turn && st >= 12) return;
          let p = role === 'r' ? root : role === 'p' ? root + (song.chance(0.7) ? 12 : underOctave(span.chord)) : role === 'x' ? root : root + riffPitches[j]!;
          if (role === 'n' && j === riff.length - 1 && changes) p = bassNote(bassPc(nextSpan!.chord), root, 31, 43) - 1;
          const at = b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.003;
          const d = role === 'x' ? 0.04 : l * sixteenth * 0.8;
          const v = role === 'p' ? vel(song, 0.78, 0.04) : role === 'x' ? vel(song, 0.3) : vel(song, st === 0 ? 0.72 : 0.6, 0.04);
          b.note(bass, at, d, p, v);
        });
        if (turn) {
          // A pentatonic run down into the next bar.
          const run = [12, 10, 7, 5].map((x) => root + x - (song.chance(0.5) ? 0 : 12));
          run.forEach((p, f) => b.note(bass, b.grid.step(span.bar, 12 + f + span.beat * 4), sixteenth * 0.8, Math.max(28, p), vel(song, 0.62)));
        }
      });
    }

    // ── Clav, wah, Rhodes, pad ──
    spans.forEach((span, k) => {
      const lastSpan = button && k === spans.length - 1;
      keysV = voiceChord(span.chord, keysV, { low: 55, high: 75, voices: 4 });
      const t = span.t;
      if (lastSpan) {
        keysV.forEach((p, j) => b.note(keys, t + j * 0.02, b.end - t - 0.3, p, 0.6));
        for (const p of keysV.slice(-3)) {
          b.note(trumpet, t, 1.2, p + 12, 0.75);
          b.note(bone, t, 1.2, p - 12, 0.7);
        }
        return;
      }
      if (intro && span.bar < s.startBar + s.bars / 2) return;
      const root = span.chord.root;
      const third = thirdOf(span.chord);
      const seventh = underOctave(span.chord);
      const lowDyad = [60 + ((root - 60 + 120) % 12), 60 + ((root + 7 - 60 + 120) % 12)].map((p) => (p > 66 ? p - 12 : p));
      const highDyad = [64 + ((root + third - 64 + 120) % 12), 64 + ((root + seventh - 64 + 120) % 12)].sort((a, c) => a - c);
      if (!isU || span.bar < s.startBar + s.bars / 2) {
        for (const [st, what] of clavPat) {
          if (st >= span.beats * 4) continue;
          const at = b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.002;
          if (what === 'm') b.note(clav, at, 0.03, highDyad[0]!, vel(song, 0.3));
          else for (const p of what === 'l' ? lowDyad : highDyad) b.note(clav, at, sixteenth * 0.7, p, vel(song, what === 'h' ? 0.62 : 0.55));
        }
      }
      if (wah >= 0 && (isA || isB) && !(isA && !isX && s.repeat === 0 && span.bar < s.startBar + 4)) {
        const wv = voiceChord(span.chord, null, { low: 60, high: 76, voices: 3 });
        for (const st of wahPat) {
          if (st >= span.beats * 4) continue;
          for (const p of wv) b.note(wah, b.grid.step(span.bar, st + span.beat * 4), sixteenth * 1.5, p, vel(song, st % 4 === 2 ? 0.7 : 0.5));
        }
      }
      // Rhodes: held chords in the bridge, a stab and a push in the vamps.
      if (isB || isU) keysV.forEach((p, j) => b.note(keys, t + j * 0.01, span.dur * 0.95, p, vel(song, 0.45)));
      else if (span.beat === 0 && (span.bar - s.startBar) % 2 === 0) {
        keysV.forEach((p) => b.note(keys, b.grid.step(span.bar, 2), beat * 1.2, p, vel(song, 0.42)));
      }
      // The red giant glows through the bridge, the build and the collapse.
      if (isB || isU || isX) {
        padV = voiceChord(span.chord, padV, { low: 55, high: 76, voices: 4, rootless: false });
        for (const p of padV) b.note(pad, t, span.dur + 0.05, p, vel(song, isU ? 0.4 + 0.3 * ((span.bar - s.startBar) / s.bars) : 0.45));
      }
      // Horn stabs: the bridge's downbeats, and the build stacking up on every beat.
      const hornV = voiceChord(span.chord, null, { low: 62, high: 79, voices: 3 });
      if (isB && span.beat === 0 && (span.bar - s.startBar) % 2 === 0) hornStab(b.grid.step(span.bar, 0), hornV, 0.7, beat * 0.5);
      if (isB && span.beat === 0 && (span.bar - s.startBar) % 2 === 1) hornStab(b.grid.step(span.bar, 14), hornV, 0.65, beat * 0.3);
      if (isU && span.bar >= s.startBar + s.bars / 2) {
        for (let q = 0; q < span.beats; q++) {
          if (span.bar === s.startBar + s.bars - 1 && q === 3) continue;
          const u = (span.bar - s.startBar + q / 4) / s.bars;
          hornStab(b.grid.at(span.bar, span.beat + q), hornV.map((p) => p + (span.bar === s.startBar + s.bars - 1 ? 2 : 0)), 0.45 + u * 0.4, beat * 0.4);
        }
      }
    });

    function hornStab(at: number, v: number[], velocity: number, d: number): void {
      const top = v[v.length - 1]!;
      b.note(trumpet, at, d, top, vel(song, velocity));
      if (sax >= 0) b.note(sax, at + 0.004, d, v[1] ?? top - 4, vel(song, velocity * 0.95));
      b.note(bone, at + 0.008, d, (v[0] ?? top - 7) - 12, vel(song, velocity * 0.95));
    }

    // ── Horn lines and the space lead ──
    if (!button && !intro && !isU) {
      for (let ph = 0; ph + 4 <= s.bars; ph += 4) {
        const at = s.startBar + ph + 2; // answers in bars 3–4 of each phrase
        if (isA && (s.repeat > 0 || isX) && song.chance(0.75)) {
          const m = ph % 8 === 0 ? hornLine : varyMotif(song, hornLine, 0.4);
          const notes = realizeMotif(m, 0, beat, 72, spans, keyScale, 64, 82, b.grid, at);
          for (const n of notes) {
            b.note(trumpet, n.t, n.d * 0.85, n.p, vel(song, 0.68));
            if (sax >= 0) b.note(sax, n.t + 0.006, n.d * 0.85, n.p - 12, vel(song, 0.62));
          }
        }
        if ((isX || (isB && s.repeat > 0) || (isA && s.repeat === 0 && ph >= 8)) && song.chance(0.8)) {
          const m = ph % 8 === 0 ? leadLine : varyMotif(song, leadLine, 0.6);
          const notes = realizeMotif(m, 0, beat, 76, spans, keyScale, 67, 88, b.grid, s.startBar + ph);
          for (const n of notes) b.note(lead, n.t, n.d * 0.95, n.p, vel(song, n.strong ? 0.66 : 0.58), song.chance(0.35) ? { from: n.p + song.pick([-5, -2, 2]), glide: song.range(0.05, 0.12) } : {});
        }
      }
      // Lasers at the end of some phrases: the casino's light show.
      for (let ph = 3; ph < s.bars; ph += 4) if (song.chance(0.3 + W * 0.4)) b.hit(zap, b.grid.step(s.startBar + ph, song.pick([10, 13, 15])), vel(song, 0.5), song.pick([55, 58, 62, 65]), 0.6);
    }
    if (isU) {
      // The build: a riser over the second half, the lead climbing.
      riser(b, rise, sEnd - beat, (sEnd - sT) / 2, 0.8);
    }
    if (next?.part === 'X' && !isU) b.hit(zap, sEnd - beat / 2, 0.7, 50, 0.6);
  }

  if (fade && fadeFrom) fadeVelocities(b, b.grid.bar(fadeFrom.startBar), b.end - 0.2, 0.03);

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'mixolydian'),
    progression: `vamp ${tA} · bridge ${tB}${buildy ? ' · a build-up and the collapse' : ''}`,
    fx: trackFx({
      gain: 0.31,
      lowpass: cut0,
      highpass: 32,
      q: 0.7,
      wow: G * 1.4 + W * 1.2,
      wowRate: 0.5,
      flutter: G * 0.05,
      drive: 0.08 + G * 0.3,
      delay: { time: beat * 0.75, feedback: 0.35, tone: 3500, wet: 0.32 },
      reverbTone: 6000,
      reverbLevel: 1.1,
    }),
  });
}

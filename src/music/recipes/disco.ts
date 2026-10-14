// Disco: a Saturday night in 1977 that never ended. Four on the floor with open hats on
// the off-beats, an octave-jumping bass, rhythm-guitar chicks and piano off-beats, lush
// strings (held chords, stabs and runs up into every chorus), horn hits, congas and a
// tambourine. Verses and choruses with a hook, a breakdown that strips back to strings
// and bass before a snare roll brings the floor back, sometimes a key change up for the
// last choruses. Some bands are Euro: a sequenced sixteenth synth bass instead.

import type { TrackRequest } from '../index';
import { fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { bassPc, chord, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { approach, fifthOf, roll, runway, scaleRun, underOctave, foldTail } from './groove-kit';
import { bpmFor, fadeVelocities, feelFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';

const MAJOR_VERSE = ['Imaj7 ii7 Imaj7 ii7', 'IVmaj7 iii7 ii7 V9sus', 'Imaj9 vi9 ii9 V9sus', 'Imaj7 Imaj7 IVmaj7 IVmaj7', 'ii9 ii9 V9sus V9sus', 'vi9 ii9 V9sus Imaj7'];
const MAJOR_CHORUS = ['IVmaj7 V7sus+V7 iii7 vi7', 'IVmaj7 V9sus iii7 vi9', 'Imaj7 vi7 IVmaj7 V9sus', 'ii7 iii7 IVmaj7 V9sus', 'IVmaj9 V13 iii7 VI7b9', 'IVmaj7 IVmaj7 Imaj7/III vi7'];
const MINOR_VERSE = ['i7 i7 iv7 iv7', 'i9 bVII9 bVImaj7 V7', 'i7 iv7 bVII9 bIIImaj7', 'i9 IV9 i9 IV9', 'i7 bVImaj7 bVII9 i7', 'i9 i9 bVII9 bVII9'];
const MINOR_CHORUS = ['bVImaj7 bVII9 i7 i7', 'iv7 bVII9 bIIImaj7 bVImaj7', 'bVImaj7 V7 i9 i9', 'iv9 v7 i7 bVII9', 'bIIImaj7 bVII9 iv7 V7sus+V7'];

/** Bass figures over one bar: [16th step, length in 16ths, what]. L/H = low/high root, 5 = fifth, 7 = tone under the octave. */
type Fig = [step: number, len: number, what: 'L' | 'H' | '5' | '7'][];
const BASS: Record<string, Fig> = {
  octaves: [[0, 2, 'L'], [2, 2, 'H'], [4, 2, 'L'], [6, 2, 'H'], [8, 2, 'L'], [10, 2, 'H'], [12, 2, 'L'], [14, 2, 'H']],
  pushed: [[0, 1, 'L'], [2, 1, 'H'], [3, 1, 'L'], [4, 1, 'L'], [6, 1, 'H'], [7, 1, 'L'], [8, 1, 'L'], [10, 1, 'H'], [11, 1, 'L'], [12, 1, 'L'], [14, 1, 'H']],
  walking: [[0, 2, 'L'], [2, 2, 'H'], [4, 2, 'L'], [6, 2, 'H'], [8, 2, 'L'], [10, 2, 'H'], [12, 1, '5'], [13, 1, '7'], [14, 2, 'H']],
  gallop: [[0, 1, 'L'], [1, 1, 'L'], [2, 2, 'H'], [4, 1, 'L'], [5, 1, 'L'], [6, 2, 'H'], [8, 1, 'L'], [9, 1, 'L'], [10, 2, 'H'], [12, 1, 'L'], [13, 1, '5'], [14, 2, 'H']],
};
/** Guitar: [16th step, true = chord chop, false = muted chick]. */
const GUITAR: [number, boolean][][] = [
  [[1, false], [2, true], [3, false], [5, false], [6, true], [7, false], [9, false], [10, true], [11, false], [13, false], [14, true], [15, false]],
  [[2, true], [6, true], [10, true], [14, true]],
  [[0, false], [1, false], [2, true], [4, false], [5, false], [6, true], [8, false], [9, false], [10, true], [12, false], [13, false], [14, true]],
];
/** String stab rhythms (16th steps in a bar). */
const STABS = [[0, 6], [3, 10], [6, 14], [0, 10, 14], [2, 8, 11]];
/** Conga (low/high) and bongo figures over two bars: [step, 'l' | 'h' | 'b']. */
const CONGAS: [number, 'l' | 'h' | 'b'][][] = [
  [[2, 'h'], [3, 'h'], [6, 'l'], [10, 'h'], [11, 'h'], [14, 'l'], [18, 'h'], [19, 'h'], [22, 'l'], [26, 'h'], [28, 'b'], [30, 'l']],
  [[0, 'l'], [3, 'h'], [6, 'h'], [8, 'l'], [11, 'h'], [14, 'h'], [16, 'l'], [19, 'h'], [22, 'h'], [24, 'b'], [26, 'b'], [28, 'h'], [30, 'l']],
];

export function composeDisco(req: TrackRequest): Score {
  const S = streams(req, 'disco');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.6, grit: 0.05, weirdness: 0.05, brightness: 0.72 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.5);
  const tonic = tonicFor(S, [0, 2, 4, 5, 7, 9, 10]);
  const tVerse = song.pick(minor ? MINOR_VERSE : MAJOR_VERSE);
  const tChorus = song.pick(minor ? MINOR_CHORUS : MAJOR_CHORUS);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [116, 124], 0.5);
  const swing = feelFor(S, 0.5, 0.53);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.025));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.03);
  const [introBars, outroBars] = runway(fit.bars, 8, 4);
  const breakBars = style.pick([8, 8, 16]);
  const chorusBars = style.pick([8, 8, 16]);
  const plan = foldTail(planForm(fit.bars, introBars, outroBars, [
    { part: 'V', bars: 8 },
    { part: 'C', bars: chorusBars },
    { part: 'V', bars: 8 },
    { part: 'C', bars: chorusBars },
    { part: 'B', bars: breakBars },
    { part: 'C', bars: chorusBars },
    { part: 'I', bars: 8 },
    { part: 'C', bars: chorusBars },
  ]), 8);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;
  const sixteenth = beat / 4;

  // ── The band (the style stream decides the palette, so an artist keeps one sound) ──
  const bassPatch: SamplePatch | SynthPatch = style.weighted([['bass-round', 3], ['slap-bass', 1.5], ['synth-bass', 1.2]] as const);
  const euro = bassPatch === 'synth-bass';
  const keysPatch: SamplePatch = style.weighted([['piano', 2.5], ['ep', 2], ['dx-ep', 1], ['wurli', 0.8]] as const);
  const leadPatch: SynthPatch = style.weighted([['disco-strings', 3], ['funk-sax', 1.5], ['flute', 1.2], ['soft-lead', 1]] as const);
  const kickPatch: SamplePatch = style.weighted([['kick-disco', 3], ['kick-punch', 1]] as const);
  const snarePatch: SamplePatch = style.weighted([['snare-rock', 2], ['snare-dub', 1], ['snare-lofi', 0.6]] as const);
  const congasOn = style.chance(0.7);
  const tambOn = style.chance(0.65);
  const cowbellOn = style.chance(0.25);
  const hornsOn = style.chance(0.55);
  const zapOn = style.chance(0.35);
  const clapOn = style.chance(0.6);
  const vocalsOn = style.chance(0.35);
  const hatStyle = style.int(0, 2);
  const bassFig = BASS[style.pick(['octaves', 'octaves', 'pushed', 'walking', 'gallop'])]!;

  const kick = b.inst({ kind: 'sample', patch: kickPatch, name: 'Kick', gain: 0.24 });
  const snare = b.inst({ kind: 'sample', patch: snarePatch, name: 'Snare', gain: 0.5, reverb: 0.22, pan: 0.04 });
  const clap = !clapOn ? -1 : b.inst({ kind: 'sample', patch: 'clap', name: 'Claps', gain: 0.5, reverb: 0.3, pan: -0.05 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.5, pan: 0.2, lowpass: lerp(7500, 12000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.3, pan: 0.2, lowpass: lerp(8000, 13000, B) });
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Toms', gain: 0.3, reverb: 0.3, pan: -0.1 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.15, reverb: 0.3, pan: -0.25 });
  const conga = !congasOn ? -1 : b.inst({ kind: 'sample', patch: 'conga', name: 'Congas', gain: 0.36, pan: -0.35, reverb: 0.15 });
  const bongo = !congasOn ? -1 : b.inst({ kind: 'sample', patch: 'bongo', name: 'Bongos', gain: 0.3, pan: 0.4, reverb: 0.15 });
  const tamb = !tambOn ? -1 : b.inst({ kind: 'sample', patch: 'jingle-tamb', name: 'Tambourine', gain: 0.35, pan: 0.32, lowpass: 11000 });
  const bell = !cowbellOn ? -1 : b.inst({ kind: 'sample', patch: 'cowbell', name: 'Cowbell', gain: 0.1, pan: -0.2 });
  const zap = !zapOn ? -1 : b.inst({ kind: 'sample', patch: 'zap', name: 'Syndrum', gain: 0.2, reverb: 0.3, pan: 0.15 });
  const bass = euro
    ? b.inst({ kind: 'synth', patch: 'synth-bass', name: 'Synth bass', gain: 0.42, pump: 0.25 })
    : b.inst({ kind: 'sample', patch: bassPatch as SamplePatch, name: bassPatch === 'slap-bass' ? 'Bass (thumb)' : 'Bass', gain: bassPatch === 'slap-bass' ? 0.57 : 0.78, release: 0.05 });
  const gtr = b.inst({ kind: 'sample', patch: 'chorus-guitar', name: 'Rhythm guitar', gain: 0.47, pan: 0.4, reverb: 0.1, release: 0.04 });
  const keys = b.inst({ kind: 'sample', patch: keysPatch, name: keysPatch === 'piano' ? 'Piano' : 'Electric piano', gain: 0.37, pan: -0.3, reverb: 0.18, lowpass: lerp(5000, 10000, B), tremolo: keysPatch === 'ep' ? { rate: 5, depth: 0.25 } : undefined });
  const strings = b.inst({ kind: 'synth', patch: 'disco-strings', name: 'Strings', gain: 0.6, reverb: 0.4, pan: -0.08, pump: 0.15 });
  const stabs = b.inst({ kind: 'synth', patch: 'string-stab', name: 'String stabs', gain: 0.8, reverb: 0.35, pan: 0.12 });
  const horns = !hornsOn ? -1 : b.inst({ kind: 'synth', patch: 'funk-horn', name: 'Horns', gain: 0.45, reverb: 0.25, pan: 0.18 });
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: leadPatch === 'disco-strings' ? 'Strings (melody)' : leadPatch === 'funk-sax' ? 'Tenor sax' : leadPatch === 'flute' ? 'Flute' : 'Synth lead', gain: leadPatch === 'disco-strings' ? 0.4 : 0.49, reverb: 0.3, delay: 0.2, pan: 0.05, detune: weirdDetune(style, W, 12) });
  const vox = !vocalsOn ? -1 : b.inst({ kind: 'sample', patch: 'vox', name: 'Backing vocals', gain: 0.34, reverb: 0.45, delay: 0.25, pan: -0.15 });

  const hook = phrase(S, 'disco-hook', 8, 0.45 + D * 0.3, { restTail: 1, maxNotes: 6, maxLeap: 4 });
  const hookAnswer = varyMotif(song, hook, 0.5);
  const verseLine = phrase(S, 'disco-verse', 8, 0.25 + D * 0.25, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  const gtrPat = song.pick(GUITAR);
  const stabPat = song.pick(STABS);
  const congaPat = song.pick(CONGAS);
  const keysOffbeat = song.chance(keysPatch === 'piano' ? 0.7 : 0.4);
  const choruses = plan.filter((s) => s.part === 'C');
  const modulate = choruses.length >= 3 && style.chance(0.45) ? song.pick([1, 2]) : 0;
  const modFrom = modulate ? choruses[choruses.length - 2]!.startBar : Infinity;
  const fade = fit.bars >= 16 && style.chance(0.6);
  const fadeFrom = plan.find((s) => s.part === 'outro');
  const cut0 = lerp(7000, 15000, B);

  let keysV: number[] | null = null;
  let gtrV: number[] | null = null;
  let strV: number[] | null = null;
  let prevBass: number | null = null;

  for (const [si, s] of plan.entries()) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const isC = s.part === 'C';
    const isB = s.part === 'B';
    const isI = s.part === 'I';
    const next = plan[si + 1];
    const shift = s.startBar >= modFrom ? modulate : 0;
    const key = tonic + shift;
    const scale = keyScale.map((x) => (x + shift) % 12);
    const tpl = isC || isI ? tChorus : tVerse;
    let prog = parseProgression(isB ? (minor ? 'i9 i9 bVImaj7 bVII9' : 'IVmaj7 IVmaj7 iii7 vi9') : tpl, key);
    if (outro && !fade) prog = [[chord(key + (minor ? 8 : 5), 'maj7')], [chord(key + 7, '9sus')], [minor ? chord(key, 'm9') : chord(key, 'maj9')]].slice(-Math.min(3, s.bars));
    const spans = chordSpans(prog, s, b);
    const button = outro && !fade;
    if (button) {
      const last = spans[spans.length - 1]!;
      last.dur = b.end - last.t;
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : { V: 'verse', C: 'chorus', B: 'breakdown', I: 'strings' }[s.part] ?? s.part }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    if (intro && s.bars >= 2) {
      // The DJ's filter opens over the intro.
      b.auto('cutoff', 0, 700, 0);
      b.auto('cutoff', 0.05, cut0, (sEnd - sT) / 3);
    } else b.auto('cutoff', sT, cut0, 0.3);
    const lift = isC || isI || (outro && fade);
    if (!intro && !button && (isC || s.repeat === 0) && !isB) b.hit(crash, sT, 0.7, 60, 3);
    // Lead-ins: the last two bars of a breakdown are the build.
    const buildFrom = isB ? s.startBar + s.bars - 2 : Infinity;

    // ── Drums ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      const lastBar = k === s.bars - 1;
      const inBuild = bar >= buildFrom;
      const introDrums = intro ? (k < Math.ceil(s.bars / 2) ? 1 : 2) : 3;
      const fillBar = lastBar && s.bars >= 4 && !isB && !button && (next?.part === 'C' || song.chance(0.5));
      if (button && k === s.bars - 1) {
        b.hit(kick, b.grid.bar(bar), 0.95);
        b.hit(crash, b.grid.bar(bar), 0.8, 60, 3);
        continue;
      }
      if (isB && !inBuild) {
        // Breakdown: congas, tambourine and a ticking hat hold the floor.
        for (let st = 0; st < 16; st += 2) b.hit(hat, b.grid.step(bar, st) + song.gauss() * 0.002, vel(song, st % 4 === 0 ? 0.35 : 0.25), 60, 0.2);
        if (k >= s.bars / 2 - 1) for (let q = 0; q < 4; q++) b.hit(kick, b.grid.at(bar, q), vel(song, 0.45), 60, 0.4);
      }
      if (isB && inBuild) {
        if (k === s.bars - 2) roll(b, snare, song, b.grid.bar(bar), b.grid.bar(bar + 2) - sixteenth, 0.25, 0.85);
        for (let q = 0; q < 4; q++) {
          b.hit(kick, b.grid.at(bar, q), vel(song, 0.7 + 0.05 * q), 60, 0.4);
          b.pump(b.grid.at(bar, q));
        }
        continue;
      }
      if (isB) {
        if (congasOn) playCongas(bar, k);
        continue;
      }
      for (let st = 0; st < 16; st++) {
        const t = b.grid.step(bar, st) + song.gauss() * 0.0018;
        const inFill = fillBar && st >= 12;
        if (st % 4 === 0 && !(inFill && st > 12)) {
          b.hit(kick, t, vel(song, st === 0 ? 0.95 : 0.88));
          b.pump(t);
        }
        if (introDrums >= 2 && (st === 4 || st === 12) && !inFill) {
          b.hit(snare, t, vel(song, 0.8));
          if (clapOn && (lift || s.part === 'V')) b.hit(clap, t + 0.004, vel(song, 0.7));
        }
        if (inFill) continue;
        // Hats: closed on the beat, the open "tss" on every off-beat eighth.
        if (st % 4 === 2) b.hit(ohat, t, vel(song, lift ? 0.6 : 0.5), 60, 0.6);
        else if (st % 4 === 0) b.hit(hat, t, vel(song, 0.5), 60, 0.2);
        else if (hatStyle > 0 && st % 4 === 1 && (lift || D > 0.5)) b.hit(hat, t, vel(song, 0.28), 60, 0.12);
        else if (hatStyle === 2 && st % 4 === 3 && introDrums >= 3) b.hit(hat, t, vel(song, 0.22), 60, 0.1);
        if (introDrums >= 3 && tambOn && (lift || D > 0.55)) {
          if (st % 2 === 1 || st === 4 || st === 12) b.hit(tamb, t, vel(song, st === 4 || st === 12 ? 0.6 : 0.35), 60, 0.3);
        }
        if (introDrums >= 3 && cowbellOn && isC && st % 4 === 2) b.hit(bell, t, vel(song, 0.45), 60, 0.3);
      }
      if (introDrums >= 3 && congasOn) playCongas(bar, k);
      if (fillBar) {
        if (zapOn && song.chance(0.6)) {
          for (const [j, st] of [12, 13, 14].entries()) b.hit(zap, b.grid.step(bar, st), 0.55 + j * 0.1, 60 - j * 2, 0.6);
          b.hit(snare, b.grid.step(bar, 15), 0.75);
        } else if (song.chance(0.5)) {
          for (let f = 0; f < 4; f++) b.hit(tom, b.grid.step(bar, 12 + f), 0.55 + f * 0.08, 67 - f * 3, 0.5);
        } else {
          for (let f = 0; f < 4; f++) b.hit(snare, b.grid.step(bar, 12 + f), 0.45 + f * 0.12, 60, 0.3);
        }
      }
    }

    // ── Bass ──
    const bassOn = !(intro && s.bars >= 4) || euro;
    if (bassOn) {
      spans.forEach((span, k) => {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 43);
        prevBass = root;
        const nextSpan = spans[k + 1];
        const nextRoot = nextSpan ? bassNote(bassPc(nextSpan.chord), root, 31, 43) : root;
        const changes = nextSpan && bassPc(nextSpan.chord) !== bassPc(span.chord);
        if (button && k === spans.length - 1) {
          b.note(bass, span.t, Math.min(2.5, b.end - span.t - 0.3), root, 0.7);
          return;
        }
        if (intro && euro && span.bar < s.startBar + s.bars / 2) return;
        if (isB && span.bar < buildFrom) {
          // Breakdown: long roots with a pickup, the octave on the "and" of 4.
          b.note(bass, span.t, span.dur * 0.7, root, vel(song, 0.6));
          b.note(bass, span.t + span.dur - beat * 0.5, beat * 0.4, root + 12, vel(song, 0.5));
          return;
        }
        if (euro) {
          // Sequenced sixteenths: root, root, octave, root.
          for (let st = 0; st < span.beats * 4; st++) {
            const p = st % 4 === 2 ? root + 12 : st % 8 === 7 && song.chance(0.3) ? root + fifthOf(span.chord) : root;
            b.note(bass, span.t + st * sixteenth, sixteenth * 0.7, p, vel(song, st % 4 === 0 ? 0.75 : 0.6, 0.03));
          }
          return;
        }
        for (const [st, l, what] of bassFig) {
          if (st >= span.beats * 4) continue;
          const lastHit = st >= span.beats * 4 - 2;
          let p = what === 'L' ? root : what === 'H' ? root + 12 : what === '5' ? root + fifthOf(span.chord) : root + underOctave(span.chord);
          if (lastHit && changes && song.chance(0.6)) p = approach(song, nextRoot + (what === 'H' ? 12 : 0), scale);
          const at = b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.003;
          b.note(bass, at, l * sixteenth * (what === 'H' ? 0.6 : 0.85), p, vel(song, what === 'L' ? 0.72 : 0.62, 0.04));
        }
      });
    }

    // ── Keys, guitar, strings, horns ──
    spans.forEach((span, k) => {
      const t = span.t;
      const lastSpan = button && k === spans.length - 1;
      keysV = voiceChord(span.chord, keysV, { low: 55, high: 76, voices: 4 });
      if (lastSpan) {
        keysV.forEach((p, j) => b.note(keys, t + j * 0.015, b.end - t - 0.3, p, 0.6));
        for (const p of voiceChord(span.chord, strV, { low: 64, high: 86, voices: 4, rootless: false })) b.note(strings, t, b.end - t - 0.5, p, 0.55);
        return;
      }
      if (intro && span.bar < s.startBar + s.bars - 2 && s.bars >= 4) return;
      // Keys: off-beat stabs (piano) or held chords with a push.
      if (!isB && keysOffbeat) {
        for (let st = 2; st < span.beats * 4; st += 4) for (const p of keysV) b.note(keys, b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.002, sixteenth * 1.4, p, vel(song, 0.48));
      } else {
        keysV.forEach((p, j) => b.note(keys, t + j * 0.008, span.dur * 0.92, p, vel(song, isB ? 0.45 : 0.4)));
      }
      // Guitar: chicks and chops on the top strings.
      if (!isB && !(intro && s.bars >= 4)) {
        gtrV = voiceChord(span.chord, gtrV, { low: 62, high: 79, voices: 3, maxSpan: 12 });
        for (const [st, full] of gtrPat) {
          if (st >= span.beats * 4) continue;
          const at = b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.003;
          if (full) for (const [j, p] of gtrV.entries()) b.note(gtr, at + j * 0.004, sixteenth * 0.9, p, vel(song, 0.5));
          else b.note(gtr, at, 0.03, gtrV[1] ?? gtrV[0]!, vel(song, 0.3));
        }
      }
      // Strings: lush held chords in the chorus, the breakdown and the string section.
      strV = voiceChord(span.chord, strV, { low: 62, high: 84, voices: 4, rootless: false });
      if (lift || isB) for (const p of strV) b.note(strings, t, span.dur + 0.04, p, vel(song, isB ? 0.5 : 0.42));
      // Stabs in the verses, answering the hook.
      if (s.part === 'V' && span.beat === 0) {
        const stabV = voiceChord(span.chord, null, { low: 67, high: 84, voices: 3 });
        for (const st of stabPat) {
          if (st >= span.beats * 4) continue;
          for (const p of stabV) b.note(stabs, b.grid.step(span.bar, st), sixteenth * 1.6, p, vel(song, 0.55));
        }
      }
      // Horn hits on the chorus downbeats.
      if (hornsOn && isC && span.beat === 0 && (span.bar - s.startBar) % 2 === 0) {
        for (const p of keysV.slice(-3)) b.note(horns, t, beat * 0.4, p + 12, vel(song, 0.65));
      }
    });

    // String runs up into every chorus (and out of the breakdown).
    if (next && (next.part === 'C' || next.part === 'I') && !intro) {
      const nSpans = chordSpans(parseProgression(next.part === 'C' || next.part === 'I' ? tChorus : tVerse, tonic + (next.startBar >= modFrom ? modulate : 0)), next, b);
      const target = voiceChord(nSpans[0]!.chord, null, { low: 74, high: 86, voices: 3 }).at(-1)!;
      const count = song.pick([8, 8, 12]);
      const run = scaleRun(target, count, next.startBar >= modFrom ? keyScale.map((x) => (x + modulate) % 12) : scale, true);
      const step = count > 8 ? sixteenth * 0.5 : sixteenth;
      const runStart = sEnd - step * (run.length - 1);
      run.forEach((p, j) => {
        const last = j === run.length - 1;
        b.note(stabs, runStart + j * step, last ? beat * 1.5 : step * 0.95, p, vel(song, 0.42 + j * 0.03));
        if (!last) b.note(stabs, runStart + j * step, step * 0.95, p - 12, vel(song, 0.35));
      });
    }

    // ── Hook, verse line, the string section's melody ──
    if (!button && !intro) {
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const idx = ph / 2;
        let m = null;
        if (isC) m = idx % 2 === 1 ? hookAnswer : hook;
        else if (s.part === 'V' && idx % 2 === 1) m = varyMotif(song, verseLine, 0.6);
        else if (s.part === 'V' && s.repeat > 0) m = verseLine;
        else if (isI) m = phrase(S, `disco-strings-${idx % 4}`, 8, 0.5 + D * 0.3, { restTail: 0.5, maxNotes: 7, maxLeap: 3 });
        else if (isB && idx >= 1 && ph + 2 <= s.bars - 2) m = idx % 2 ? hookAnswer : hook;
        if (!m) continue;
        const notes = realizeMotif(m, 0, beat, 76, spans, scale, 67, 86, b.grid, s.startBar + ph);
        for (const n of notes) {
          const v = vel(song, n.strong ? 0.66 : 0.58);
          b.note(lead, n.t + song.gauss() * 0.003, n.d * 0.95, n.p, isB ? v * 0.8 : v);
          if (leadPatch === 'disco-strings' && (isC || isI)) b.note(lead, n.t, n.d * 0.95, n.p - 12, v * 0.8);
          if (vocalsOn && isC && n.strong && idx % 2 === 0) b.note(vox, n.t, Math.min(1.4, n.d), n.p - 12, vel(song, 0.5));
        }
      }
    }
    if (vocalsOn && isB) {
      // "Aah": the backing singers hold the chord tones over the breakdown.
      spans.forEach((span) => {
        if (span.beat !== 0 || (span.bar - s.startBar) % 2 !== 0 || span.bar >= buildFrom) return;
        const v = voiceChord(span.chord, null, { low: 60, high: 74, voices: 3 });
        v.forEach((p, j) => b.note(vox, span.t + j * 0.02, 1.4, p, vel(song, 0.62)));
      });
    }

    function playCongas(bar: number, k: number): void {
      for (const [st, what] of congaPat) {
        if ((st >= 16) !== (k % 2 === 1)) continue;
        const at = b.grid.step(bar, st % 16) + song.gauss() * 0.004;
        if (what === 'b') b.hit(bongo, at, vel(song, 0.55), song.pick([60, 63]), 0.3);
        else b.hit(conga, at, vel(song, what === 'h' ? 0.6 : 0.7), what === 'h' ? 63 : 57, 0.5);
      }
    }
  }

  if (fade && fadeFrom) fadeVelocities(b, b.grid.bar(fadeFrom.startBar), b.end - 0.2, 0.03);

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'major'),
    progression: `verse ${tVerse} · chorus ${tChorus}${modulate ? ` · up ${modulate === 1 ? 'a half step' : 'a whole step'} for the last choruses` : ''}`,
    fx: trackFx({
      gain: 0.32,
      lowpass: cut0,
      highpass: 32,
      q: 0.7,
      wow: G * 1.5 + W,
      wowRate: 0.4,
      flutter: G * 0.05,
      drive: 0.05 + G * 0.3,
      delay: { time: beat * 0.75, feedback: 0.3, tone: 3800, wet: 0.3 },
      reverbTone: 7000,
      reverbLevel: 1.1,
    }),
  });
}

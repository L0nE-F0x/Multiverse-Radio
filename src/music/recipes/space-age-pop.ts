// Space-age pop: a high-fidelity demonstration record. A bouncy bachelor-pad orchestra —
// cup-muted brass, a vocal group singing "pa-pa", xylophone, an organ, walking bass and
// brushes — mixed for two enormous speakers. Hard-panned ping-pong is the point: the
// call comes from one side and the answer from the other, the sides swap every phrase,
// xylophone runs bounce left-right-left, the organ sweeps across the room, and once a
// record the bongos are sent travelling from one speaker to the other for the demo.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type Score, type SynthPatch } from '../score';
import { bassPc, chordPcs, chordScale, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, stepInSet, voiceChord, type Chord } from '../theory';
import { bassNote, chordAt, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune, type MotifNote } from './common';
import { bpmFor, feelFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';
import { stereoPair } from './world-kit';

const A_PROGS = ['I vi ii V7', 'I6 #io7 ii7 V7', 'Imaj7 VI7 ii7 V7', 'I IV7 I V7', 'I iii7 IV V7', 'I6 I6 ii7 V7'];
const B_PROGS = ['III7 III7 vi vi II7 II7 V7 V7', 'IV IV I I II7 II7 V7 V7', 'iii7 VI7 ii7 V7', 'IVmaj7 iv6 iii7 VI7 ii7 ii7 V7 V7'];
const MINOR_A = ['i6 i6 iv6 V7', 'i iv6 bVI7 V7'];
const MINOR_B = ['bVImaj7 bVImaj7 i6 i6 II7 II7 V7 V7', 'iv7 bVII7 bIIImaj7 V7'];

type Groove = 'swing' | 'cha-cha' | 'bounce';

/** Brass answers ([beat, beats]) for the bar after each call. */
const ANSWERS: [number, number][][] = [
  [[0.5, 0.3], [1.5, 0.45]],
  [[0, 0.3], [0.5, 0.3], [2, 0.7]],
  [[1, 0.3], [1.5, 0.3], [2.5, 0.8]],
  [[0, 0.5], [1.5, 0.3], [2, 0.3], [3, 0.6]],
];

export function composeSpaceAgePop(req: TrackRequest): Score {
  const S = streams(req, 'space-age-pop');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 120, density: 0.6, grit: 0.08, weirdness: 0.15, brightness: 0.7 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.12);
  const tonic = tonicFor(S, [10, 3, 5, 0, 7, 8]);
  const tA = song.pick(minor ? MINOR_A : A_PROGS);
  const tB = song.pick(minor ? MINOR_B : B_PROGS);
  const progA = parseProgression(tA, tonic);
  const progB = parseProgression(tB, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const groove: Groove = style.weighted([['swing', 3], ['cha-cha', 2], ['bounce', 2]]);
  const bpm = bpmFor(S, req, groove === 'cha-cha' ? [110, 122] : [114, 130]);
  const swing = groove === 'swing' ? feelFor(S, 0.6, 0.66) : groove === 'bounce' ? feelFor(S, 0.52, 0.58) : 0.5;
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.025));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const plan = planForm(
    fit.bars,
    fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 12 ? 2 : fit.bars >= 4 ? 1 : 0,
    [{ part: 'A', bars: 8 }, { part: 'A', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }, { part: 'D', bars: 4 }, { part: 'A', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 2);
  const beat = b.beat;

  // ── The orchestra, spread across the room ──
  const organPatch: SynthPatch = style.weighted([['organ', 2], ['combo-organ', 2]]);
  const kitSide = style.chance(0.5) ? -1 : 1;
  const [brassL, brassR] = stereoPair(b, { kind: 'synth', patch: 'muted-brass', name: 'Muted brass', gain: 0.42, reverb: 0.18 });
  const [voiceL, voiceR] = stereoPair(b, { kind: 'synth', patch: 'pa-voice', name: 'Pa-pa singers', gain: 0.4, reverb: 0.25, detune: weirdDetune(song, W, 12) });
  const [xyloL, xyloR] = stereoPair(b, { kind: 'sample', patch: 'xylophone', name: 'Xylophone', gain: 0.36, reverb: 0.2 });
  const [bongoL, bongoR] = stereoPair(b, { kind: 'sample', patch: 'bongo', name: 'Bongos', gain: 0.3, reverb: 0.1 }, 0.95);
  const organ = b.inst({ kind: 'synth', patch: organPatch, name: 'Organ (travelling)', gain: organPatch === 'organ' ? 0.15 : 0.13, reverb: 0.25, lowpass: 2600, tremolo: { rate: 1 / (fit.barDur * 2), depth: 0.85 } });
  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Upright bass', gain: 0.58, release: 0.08 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Brushes', gain: 0.4, pan: 0.55 * kitSide, reverb: 0.15 });
  const ride = b.inst({ kind: 'sample', patch: 'ride', name: 'Ride', gain: 0.24, pan: 0.6 * kitSide, lowpass: 9000 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.32, pan: 0.2 * kitSide });
  const side = (k: number) => (k % 2 === 0 ? { brass: brassL, voice: voiceL, xylo: xyloL, bongo: bongoL } : { brass: brassR, voice: voiceR, xylo: xyloR, bongo: bongoR });

  const hook = phrase(S, 'sap-hook', 4, 0.5 + D * 0.3, { restTail: 0.5, grid: 0.5, minNotes: 3, maxNotes: 6, maxLeap: 4 });
  const bridgeTune = phrase(S, 'sap-bridge', 8, 0.4 + D * 0.3, { restTail: 1, maxNotes: 5, maxLeap: 3 });
  const answers = [song.pick(ANSWERS), song.pick(ANSWERS)];
  let bV: number[] | null = null;
  let oV: number[] | null = null;
  let prevBass: number | null = null;
  let flip = song.int(0, 1);

  /** A xylophone run up (or down) the scale in sixteenths, every note on the other side. */
  const run = (t: number, from: number, notes: number, up: boolean, startSide: number, scale: readonly number[]) => {
    let p = nearestInSet(from, scale);
    for (let k = 0; k < notes; k++) {
      b.note(side(startSide + k).xylo, t + k * beat * 0.25, beat * 0.5, p, vel(song, 0.5 + (k / notes) * 0.2, 0.03));
      p = stepInSet(p, scale, up ? 1 : -1);
    }
  };

  /** Brass stabs: a chord on one side (or both). */
  const stab = (insts: number[], t: number, d: number, voicing: readonly number[], v: number) => {
    for (const i of insts) voicing.forEach((p, j) => b.note(i, t + j * 0.004, d, p, vel(song, v - j * 0.02, 0.03)));
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const demo = s.part === 'D';
    const prog: Chord[][] = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    if (outro) spans.forEach((sp) => (sp.chord = progA[0]![0]!));
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : demo ? 'stereo demonstration' : s.name }, spans.map((x) => x.chord), flats);
    flip++;

    // ── Organ: soft held chords that travel across the room ──
    spans.forEach((span, k) => {
      oV = voiceChord(span.chord, oV, { low: 55, high: 72, voices: 4, rootless: true });
      if (outro && k === spans.length - 1) return;
      if (demo) return;
      const v = s.part === 'B' ? 0.6 : 0.45;
      oV.forEach((p) => b.note(organ, span.t, span.dur * 0.96, p, vel(song, v, 0.03)));
    });

    // ── Bass ──
    spans.forEach((span, k) => {
      const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
      prevBass = root;
      if (intro && k < spans.length - 2 && s.bars > 2) return;
      if (outro && k === spans.length - 1) {
        b.note(bass, span.t, beat * 1.2, root, 0.85);
        return;
      }
      const next = spans[k + 1];
      const nextRoot = next ? bassNote(bassPc(next.chord), root, 31, 45) : root;
      const scale = chordScale(span.chord, keyScale);
      const fifth = nearestInSet(root + 7, chordPcs(span.chord));
      const beats = Math.round(span.beats);
      if (groove === 'swing') {
        // Walking: root, a chord tone, a scale tone, then a half-step into the next chord.
        const third = nearestInSet(root + 4, chordPcs(span.chord));
        const line = beats === 4 ? [root, song.chance(0.5) ? third : fifth, stepInSet(fifth, scale, song.pick([1, -1])), nextRoot + (nextRoot > root ? -1 : 1)] : [root, nextRoot + (nextRoot > root ? -1 : 1)];
        line.forEach((p, j) => b.note(bass, b.grid.at(span.bar, span.beat + j), beat * 0.85, p, vel(song, j === 0 ? 0.8 : 0.68)));
      } else if (groove === 'cha-cha') {
        const hits: [number, number, number][] = beats === 4 ? [[0, 1.4, root], [2, 1, fifth], [3, 0.45, fifth], [3.5, 0.45, nextRoot === root ? fifth : nextRoot + (nextRoot > root ? -1 : 1)]] : [[0, 1.4, root]];
        for (const [bt, len, p] of hits) b.note(bass, b.grid.at(span.bar, span.beat + bt), beat * len, p, vel(song, bt === 0 ? 0.8 : 0.66));
      } else {
        // Two-beat: root and fifth, with a pickup into the next bar.
        const hits: [number, number, number][] = beats === 4 ? [[0, 1.6, root], [2, 1.2, fifth], [3.5, 0.4, nextRoot + (nextRoot > root ? -2 : 2)]] : [[0, 1.6, root]];
        for (const [bt, len, p] of hits) b.note(bass, b.grid.at(span.bar, span.beat + bt), beat * len, p, vel(song, bt === 0 ? 0.82 : 0.66));
      }
    });

    // ── Drums ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (intro && k < s.bars - 2 && s.bars > 2) continue;
      if (outro && k === s.bars - 1) {
        b.hit(ride, b.grid.at(bar, 0), 0.7, 60, 2);
        b.hit(kick, b.grid.at(bar, 0), 0.8);
        break;
      }
      drumBar(b, song, groove, bar, { snare, ride, kick }, k === s.bars - 1 && !outro);
      if (groove === 'cha-cha' && !demo) for (const [st, p] of [[6, 64], [7, 60], [14, 64], [15, 60]] as const) b.hit(side(st < 8 ? flip : flip + 1).bongo, b.grid.step(bar, st), vel(song, 0.45), p, 0.4);
    }

    // ── Sections ──
    if (intro) {
      // A fanfare that crosses the room: left calls, right answers, then both.
      const first = spans[0]!;
      bV = voiceChord(first.chord, bV, { low: 62, high: 77, voices: 4, rootless: false });
      const n = Math.min(s.bars, 4);
      for (let k = 0; k < n; k++) {
        const t = b.grid.bar(s.startBar + k);
        const voicing = voiceChord(chordAt(spans, t).chord, bV, { low: 62, high: 77, voices: 4, rootless: false });
        if (k < n - 1) stab([side(k).brass], t, beat * 0.3, voicing, 0.62);
        if (k < n - 1) stab([side(k).brass], b.grid.at(s.startBar + k, 1.5), beat * 0.6, voicing, 0.7);
        else run(t, 72, 8, true, k, keyScale);
      }
      continue;
    }

    if (outro) {
      // The button: both sides together, the singers' last "pa", a run across the room.
      const last = spans[spans.length - 1]!;
      const pre = spans.length > 1 ? spans[0]! : last;
      const v1 = voiceChord(pre.chord, bV, { low: 62, high: 77, voices: 4, rootless: false });
      if (spans.length > 1) {
        stab([brassL, brassR], pre.t, beat * 0.3, v1, 0.68);
        stab([brassL, brassR], b.grid.at(pre.bar, 1.5), beat * 0.3, v1, 0.7);
        run(b.grid.at(pre.bar, 2), 67, 8, true, flip, keyScale);
      }
      const v2 = voiceChord(last.chord, v1, { low: 62, high: 79, voices: 4, rootless: false });
      stab([brassL, brassR], last.t, Math.min(beat * 3, b.end - last.t - 0.4), v2, 0.75);
      const top = v2[v2.length - 1]!;
      for (const v of [voiceL, voiceR]) {
        b.note(v, last.t, beat * 0.4, top, 0.7);
        b.note(v, last.t, beat * 0.4, nearestInSet(top - 4, chordPcs(last.chord)), 0.6);
      }
      continue;
    }

    if (demo) {
      // "Now hear the bongos travel": left, then wandering, then right, then everywhere.
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        for (let st = 0; st < 16; st++) {
          if (st % 2 === 1 && !(k === s.bars - 1 || song.chance(0.25 + D * 0.3))) continue;
          const which = k === 0 ? 0 : k === s.bars - 1 ? st : k === 1 ? (st < 8 ? 0 : 1) : 1;
          b.hit(side(which).bongo, b.grid.step(bar, st), vel(song, st % 4 === 0 ? 0.68 : 0.5), st % 4 === 0 ? 60 : song.pick([64, 67]), 0.4);
        }
      }
      run(b.grid.at(s.startBar + s.bars - 1, 2), 84, 8, false, 0, keyScale);
      continue;
    }

    if (s.part === 'A') {
      // Call and response, swapping sides every phrase: singers call, the brass answers.
      for (let c = 0; c * 2 + 1 < s.bars; c++) {
        const callBar = s.startBar + c * 2;
        const call = side(flip + c);
        const answer = side(flip + c + 1);
        const cadence = c * 2 + 2 >= s.bars;
        const motif: MotifNote[] = c === 2 ? varyMotif(song, hook, 0.5) : s.repeat > 0 && c === 1 ? varyMotif(song, hook, 0.3) : hook;
        const notes = realizeMotif(motif, 0, beat, 69, spans, keyScale, 62, 77, b.grid, callBar);
        for (const n of notes) {
          const d = Math.min(n.d * 0.85, beat * 0.7);
          const h = harmonyBelow(n.p, chordAt(spans, n.t).chord, keyScale);
          const targets = cadence ? [voiceL, voiceR] : [call.voice];
          for (const v of targets) {
            b.note(v, n.t, d, n.p, vel(song, n.strong ? 0.7 : 0.6));
            b.note(v, n.t + 0.006, d, h, vel(song, 0.5));
          }
        }
        // The answer, from the other speaker.
        const ansBar = callBar + 1;
        const ans = answers[c % 2]!;
        for (const [bt, len] of ans) {
          const t = b.grid.at(ansBar, bt);
          bV = voiceChord(chordAt(spans, t).chord, bV, { low: 60, high: 77, voices: 4, rootless: false });
          stab(cadence ? [brassL, brassR] : [answer.brass], t, beat * len, bV, bt === ans[ans.length - 1]![0] ? 0.72 : 0.62);
        }
        // A xylophone run to close each half, bouncing between the speakers.
        if (c % 2 === 1 && !cadence) run(b.grid.at(ansBar, 3), 72, 4, song.chance(0.6), flip + c, keyScale);
      }
      continue;
    }

    if (s.part === 'B') {
      // The bridge: the xylophone sings it, a phrase from each side, with brass pads under.
      for (let c = 0; c * 2 + 2 <= s.bars; c++) {
        const cellBar = s.startBar + c * 2;
        const m = c % 2 === 1 ? varyMotif(song, bridgeTune, 0.5) : bridgeTune;
        const sd = side(flip + c);
        for (const n of realizeMotif(m, 0, beat, 79, spans, keyScale, 72, 91, b.grid, cellBar)) {
          // Xylophones can't sustain: long notes are rolled.
          if (n.d >= beat * 1.4) for (let x = 0; x * beat * 0.25 < n.d * 0.9; x++) b.note(sd.xylo, n.t + x * beat * 0.25, beat * 0.4, n.p, vel(song, 0.48 - x * 0.01, 0.03));
          else b.note(sd.xylo, n.t, beat * 0.6, n.p, vel(song, n.strong ? 0.66 : 0.56));
        }
        const pad = chordAt(spans, b.grid.bar(cellBar));
        bV = voiceChord(pad.chord, bV, { low: 58, high: 72, voices: 3, rootless: true });
        bV.forEach((p) => b.note(side(flip + c + 1).brass, b.grid.bar(cellBar), fit.barDur * 1.9, p, 0.42));
      }
    }
  }

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'major'),
    progression: `${tA} / ${tB} · ${groove}`,
    fx: trackFx({
      gain: 0.53,
      lowpass: lerp(8000, 15000, B),
      highpass: 40,
      wow: G * 1.2,
      wowRate: 0.5,
      flutter: G * 0.03,
      drive: 0.04 + G * 0.2,
      reverbTone: 7000,
      reverbLevel: 0.9,
    }),
  });
}

function drumBar(b: ScoreBuilder, rng: Rng, groove: Groove, bar: number, kit: { snare: number; ride: number; kick: number }, fill: boolean): void {
  const at = (bt: number) => b.grid.at(bar, bt) + rng.gauss() * 0.003;
  if (groove === 'swing') {
    for (const bt of [0, 1, 1.5, 2, 3, 3.5]) b.hit(kit.ride, at(bt), vel(rng, bt % 1 ? 0.42 : 0.58), 60, 1.2);
    for (const bt of [1, 3]) b.hit(kit.snare, at(bt), vel(rng, 0.62));
    for (const bt of [0, 2]) b.hit(kit.kick, at(bt), vel(rng, 0.45));
    if (rng.chance(0.4)) b.hit(kit.snare, at(rng.pick([0.5, 2.5])), vel(rng, 0.3));
  } else if (groove === 'cha-cha') {
    for (const bt of [0, 1, 2, 3]) b.hit(kit.ride, at(bt), vel(rng, 0.5), 60, 1.2);
    for (const bt of [3, 3.5]) b.hit(kit.snare, at(bt), vel(rng, 0.55));
    b.hit(kit.kick, at(0), vel(rng, 0.6));
    b.hit(kit.kick, at(2), vel(rng, 0.45));
  } else {
    for (let e = 0; e < 8; e++) b.hit(kit.ride, at(e * 0.5), vel(rng, e % 2 ? 0.38 : 0.52), 60, 1.2);
    for (const bt of [1, 3]) b.hit(kit.snare, at(bt), vel(rng, 0.66));
    for (const bt of [0, 2]) b.hit(kit.kick, at(bt), vel(rng, 0.6));
  }
  if (fill) for (let k = 0; k < 3; k++) b.hit(kit.snare, at(3 + k / 3), vel(rng, 0.4 + k * 0.12));
}

/** A close-harmony part: a chord tone a third or fourth below, else the scale's third below. */
function harmonyBelow(p: number, c: Chord, keyScale: readonly number[]): number {
  const tones = chordPcs(c);
  for (const iv of [3, 4, 5]) if (tones.includes(pc(p - iv))) return p - iv;
  return stepInSet(p, chordScale(c, keyScale), -2);
}

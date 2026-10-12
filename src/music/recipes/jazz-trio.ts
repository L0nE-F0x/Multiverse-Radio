// Jazz trio: piano, upright bass and drums in a small club late at night. Two feels:
// ballads (a rubato piano intro, brushes stirring, two-feel bass, block-chord melody and
// a ritardando into the last chord) and medium swing (walking bass, ride or brushes, a
// comping left hand). AABA, ABAC or blues choruses: head, piano solo choruses of bebop
// lines, now and then a bass solo, head out, and a proper jazz ending.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import type { SamplePatch, Score } from '../score';
import { bassPc, chord, chordPcs, chordScale, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, stepInSet, voiceChord, type Chord } from '../theory';
import { bassNote, chordAt, chordSpans, layout, lerp, realizeMotif, resolveTweaks, ScoreBuilder, shiftMotif, trackFx, varyMotif, vel, type ChordSpan, type MotifNote } from './common';
import { bpmFor, feelFor, minorFor, phrase, ritardando, streams, tonicFor } from './v3-kit';

const A_MAJOR = [
  'Imaj7 vi7 ii7 V7 iii7 VI7b9 ii7 V7',
  'Imaj7 I7 IVmaj7 iv7+bVII7 iii7 VI7b9 ii7+V7 Imaj7+V7',
  'ii7 V7 Imaj7 VI7b9 ii7 V7 Imaj7 iii7+VI7',
  'Imaj7 #io7 ii7 V7 iii7 biiio7 ii7 V7',
  'Imaj7 vi7 ii7 bII7 Imaj7 vi7 ii7 V7',
  'IVmaj7 bVII7 Imaj7 vi7 ii7 V7 Imaj7 ii7+V7',
  'Imaj7 II7 ii7 V7 iii7 VI7 ii7 V7',
];
const B_MAJOR = [
  'iv7 bVII7 Imaj7 Imaj7 ii7 V7 iii7+VI7 ii7+V7',
  'v7 I7 IVmaj7 IVmaj7 vi7 II7 ii7 V7',
  'III7 III7 VI7 VI7 II7 II7 ii7 V7',
  'ii7 V7 Imaj7 Imaj7 #ivø7 VII7 iii7 VI7b9',
];
const C_MAJOR = [
  'Imaj7 vi7 ii7 V7 iii7 VI7 ii7+V7 Imaj7',
  'IVmaj7 iv7 iii7 VI7b9 ii7 V7 Imaj7 Imaj7',
];
const A_MINOR = [
  'i7 i7 iv7 bVII7 bIIImaj7 bVImaj7 iiø7 V7b9',
  'iiø7 V7b9 i7 i7 iv7 bVII7 bIIImaj7 V7b9',
  'i6 iiø7+V7b9 i6 iiø7+V7b9 iv7 bVII7 bIIImaj7 iiø7+V7b9',
];
const B_MINOR = ['bVImaj7 bVImaj7 iiø7 V7b9 i7 i7 iiø7 V7b9', 'iv7 iv7 i7 i7 bVI7 V7b9 i7 V7b9'];
const BLUES = 'I7 IV7 I7 v7+I7 IV7 #ivo7 I7 iii7+VI7 ii7 V7 I7+VI7 ii7+V7';
const MINOR_BLUES = 'i7 iv7 i7 i7 iv7 iv7 i7 i7 bVI7 V7b9 i7 iiø7+V7b9';

type Role = 'head' | 'solo' | 'bass';

export function composeJazzTrio(req: TrackRequest): Score {
  const S = streams(req, 'jazz-trio');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 104, density: 0.45, grit: 0.1, weirdness: 0.06, brightness: 0.42 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  // ── The tune ──
  const hint = req.tweaks?.bpm;
  const ballad = hint !== undefined ? hint < 92 : song.chance(style.range(0.3, 0.65));
  const bpm = bpmFor(S, req, ballad ? [56, 74] : [116, 168]);
  const minor = minorFor(S, 0.28);
  const tonic = tonicFor(S, [5, 10, 3, 8, 0, 7, 1]);
  const form = ballad ? style.weighted([['AABA', 3], ['ABAC', 2]] as const) : style.weighted([['AABA', 3], ['ABAC', 1.5], ['blues', 1.5]] as const);
  const tplA = form === 'blues' ? (minor ? MINOR_BLUES : BLUES) : song.pick(minor ? A_MINOR : A_MAJOR);
  const tplB = song.pick(minor ? B_MINOR : B_MAJOR);
  const tplC = minor ? tplA : song.pick(C_MAJOR);
  const progA = parseProgression(tplA, tonic);
  const progB = parseProgression(tplB, tonic);
  const progC = parseProgression(tplC, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const swing = ballad ? feelFor(S, 0.55, 0.63) : feelFor(S, 0.6, 0.68);
  const unit = form === 'blues' ? 12 : 8;
  const tail = Math.min(ballad ? 4.5 : 3.5, Math.max(1, req.durationSeconds * 0.05));
  const { fit, plan } = layout(req, bpm, 4, {
    unit,
    pattern: form === 'AABA' ? ['A', 'A', 'B', 'A'] : form === 'ABAC' ? ['A', 'B', 'A', 'C'] : ['A'],
    intro: ballad ? 2 : 4,
    outro: 2,
    tail,
  });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 2);
  const beat = b.beat;

  // ── The band ──
  const pianoPatch: SamplePatch = style.weighted([['piano', 5], ['felt-piano', ballad ? 2 : 0.8]]);
  const lh = b.inst({ kind: 'sample', patch: pianoPatch, name: 'Piano, left hand', gain: 0.5, pan: -0.14, reverb: 0.2, lowpass: lerp(3200, 7000, B) });
  const rh = b.inst({ kind: 'sample', patch: pianoPatch, name: 'Piano, right hand', gain: 0.78, pan: 0.1, reverb: 0.22, lowpass: lerp(5000, 11000, B) });
  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Upright bass', gain: 0.58, pan: 0.04, reverb: 0.07 });
  const brushes = ballad || style.chance(0.45);
  const ride = b.inst({ kind: 'sample', patch: 'ride', name: 'Ride', gain: brushes ? 0.12 : 0.21, pan: 0.28, reverb: 0.12, lowpass: lerp(6000, 11000, B) });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.15, pan: 0.25, lowpass: 7000 });
  const tap = b.inst({ kind: 'sample', patch: 'snare-brush', name: brushes ? 'Brush taps' : 'Snare', gain: 0.4, pan: -0.08, reverb: 0.1 });
  const stir = b.inst({ kind: 'sample', patch: 'brush-stir', name: 'Brush sweeps', gain: 0.32, pan: -0.08, reverb: 0.05 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.32 });

  // ── Choruses and roles ──
  const body = plan.filter((s) => s.part !== 'intro' && s.part !== 'outro');
  const per = form === 'blues' ? 1 : 4;
  const choruses = Math.max(1, Math.ceil(body.length / per));
  const bassSolo = choruses >= 4 && style.chance(0.5) ? choruses - 2 : -1;
  const role = (c: number): Role => {
    if (c === 0 || c === choruses - 1) return 'head';
    if (form === 'blues' && c === 1 && choruses >= 5) return 'head';
    return c === bassSolo ? 'bass' : 'solo';
  };

  // Head melody: one 2-bar idea per part, stated and answered.
  const density = ballad ? 0.15 + D * 0.25 : 0.3 + D * 0.35;
  const heads: Record<string, MotifNote[]> = {
    A: phrase(S, 'jazz-head', 8, density, { restTail: 1.5, maxNotes: ballad ? 3 : 5, maxLeap: 4 }),
    B: phrase(S, 'jazz-bridge', 8, density, { restTail: 1.5, maxNotes: ballad ? 3 : 5, maxLeap: 3 }),
  };
  heads.C = varyMotif(song, heads.A!, 0.6);
  const answer = varyMotif(song, heads.A!, 0.5);
  const [lo, hi] = [62, 84];

  let lhVoicing: number[] | null = null;
  let prevBass: number | null = null;
  const comp = song.int(0, 3);
  let bodyIndex = -1;
  const outroStart = plan.find((s) => s.part === 'outro');

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    if (!intro && !outro) bodyIndex++;
    const chorus = Math.floor(Math.max(0, bodyIndex) / per);
    const r: Role = intro || outro ? 'head' : role(chorus);
    let prog: Chord[][] = s.part === 'B' ? progB : s.part === 'C' ? progC : progA;
    if (intro) prog = turnaround(tonic, minor, ballad, progA);
    let spans = chordSpans(prog, s, b);
    if (outro) spans = ending(b, s, tonic, minor, song);
    const label = intro ? 'intro' : outro ? 'ending' : r === 'head' ? (chorus === choruses - 1 && chorus > 0 ? `head out ${s.part}` : `head ${s.part}`) : r === 'bass' ? `bass solo ${s.part}` : `piano solo ${s.part}`;
    b.section({ ...s, name: label }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);

    // ── Left hand ──
    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      lhVoicing = voiceChord(span.chord, lhVoicing, { low: 48, high: 67, voices: 4, maxSpan: 14 });
      const t = b.grid.at(span.bar, span.beat);
      if (last) {
        // Roll the last chord up from the bass and let it ring.
        const roll = [bassNote(bassPc(span.chord), prevBass, 31, 43), ...lhVoicing];
        roll.forEach((p, j) => b.note(lh, t + j * 0.06, b.end - t - 0.3, p, vel(song, 0.42 + j * 0.02)));
        return;
      }
      if (intro && ballad) {
        // Rubato: chords rolled slowly, slightly late.
        const lag = song.range(0, 0.12);
        lhVoicing.forEach((p, j) => b.note(lh, t + lag + j * song.range(0.04, 0.09), span.dur * 1.05, p, vel(song, 0.38)));
        return;
      }
      if (ballad || r === 'bass') {
        lhVoicing.forEach((p, j) => b.note(lh, t + j * 0.018 + song.gauss() * 0.006, span.dur * 0.96, p, vel(song, r === 'bass' ? 0.3 : 0.38)));
        if (span.beats >= 4 && song.chance(0.3 + D * 0.3)) for (const p of lhVoicing.slice(1)) b.note(lh, b.grid.at(span.bar, span.beat + 2.5), beat * 1.2, p, vel(song, 0.28));
        return;
      }
      for (const [x, d] of compRhythm(song, span.beats, comp, D, r === 'solo')) {
        const at = b.grid.at(span.bar, span.beat + x) + song.gauss() * 0.006;
        for (const p of lhVoicing) b.note(lh, at, d * beat, p, vel(song, r === 'solo' ? 0.34 : 0.4));
      }
    });

    // ── Bass ──
    if (!(intro && ballad)) {
      spans.forEach((span, k) => {
        const last = outro && k === spans.length - 1;
        const root = bassNote(bassPc(span.chord), prevBass, 28, 43);
        const next = spans[k + 1];
        const target = next ? bassNote(bassPc(next.chord), root, 28, 43) : root;
        let line: number[];
        let step = 1;
        if (last) {
          line = [root];
          step = span.beats;
        } else if (r === 'bass') {
          line = [];
        } else if (ballad && (r === 'head' || intro)) {
          line = twoFeel(song, span, root, target);
          step = 2;
        } else line = walk(song, span, root, target, keyScale);
        line.forEach((p, j) => b.note(bass, b.grid.at(span.bar, span.beat + j * step) + song.gauss() * 0.004, (last ? 3.5 : step * 0.9) * beat, p, vel(song, j === 0 ? 0.8 : 0.68)));
        prevBass = line[line.length - 1] ?? root;
      });
      if (r === 'bass') {
        // The bass takes a chorus: melodic phrases up the neck, answered by space.
        for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
          const m = phrase(S, `bass-solo-${ph % 4}`, 8, 0.45 + D * 0.3, { restTail: 1.5, maxNotes: 6, maxLeap: 3 });
          for (const n of realizeMotif(m, 0, beat, 45, spans, keyScale, 36, 55, b.grid, s.startBar + ph)) b.note(bass, n.t + song.gauss() * 0.006, n.d * 0.9, n.p, vel(song, n.strong ? 0.82 : 0.7));
        }
      }
    }

    // ── Drums ──
    if (!intro || !ballad) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        if (intro && k < s.bars - 2) continue;
        const lastBar = k === s.bars - 1;
        if (outro && lastBar) {
          // A soft cymbal swell over the final chord.
          b.hit(ride, b.grid.at(bar, 0), 0.5, 60, 2.2);
          b.hit(kick, b.grid.at(bar, 0), 0.45);
          if (brushes) b.hit(stir, b.grid.at(bar, 0), 0.5, 60, 1.2);
          break;
        }
        const soft = r === 'bass' ? 0.7 : 1;
        if (brushes) {
          const every = ballad ? 1 : 2;
          for (let bt = 0; bt < 4; bt += every) b.hit(stir, b.grid.at(bar, bt) - 0.05, vel(song, 0.55 * soft), 60, 1.2);
          for (const bt of [1, 3]) b.hit(tap, b.grid.at(bar, bt) + song.gauss() * 0.004, vel(song, 0.5 * soft));
          if (!ballad && song.chance(0.35 + D * 0.3)) b.hit(tap, b.grid.at(bar, 3.5), vel(song, 0.28 * soft));
          if (ballad && song.chance(0.25)) b.hit(tap, b.grid.at(bar, 2.5), vel(song, 0.22));
        } else {
          for (const [bt, v] of [[0, 0.55], [1, 0.68], [1.5, 0.4], [2, 0.55], [3, 0.68], [3.5, 0.4]] as const) {
            if ((bt === 1.5 || bt === 3.5) && song.chance(0.12)) continue;
            b.hit(ride, b.grid.at(bar, bt) + song.gauss() * 0.004, vel(song, v * soft), 60, 1.6);
          }
          for (const bt of [0.5, 1.5, 2.5, 3.5]) if (song.chance((r === 'solo' ? 0.18 : 0.08) + D * 0.12)) b.hit(tap, b.grid.at(bar, bt), vel(song, 0.3, 0.1));
        }
        for (const bt of [1, 3]) b.hit(hat, b.grid.at(bar, bt), vel(song, 0.42 * soft), 60, 0.3);
        for (let bt = 0; bt < 4; bt += ballad ? 2 : 1) b.hit(kick, b.grid.at(bar, bt), vel(song, 0.16, 0.04));
        if (lastBar && !outro && song.chance(0.55)) {
          // A little set-up into the next section.
          b.hit(tap, b.grid.at(bar, 3) + beat * (2 / 3), vel(song, 0.5));
          if (song.chance(0.4)) b.hit(kick, b.grid.at(bar, 3) + beat * (2 / 3), 0.35);
        }
      }
    }

    // ── Right hand: the head, a solo, or a quiet answer to the bass ──
    if (intro && ballad && s.bars >= 1) {
      const m = phrase(S, 'jazz-intro', 4 * s.bars, 0.2, { restTail: 1.5, maxNotes: 3 });
      for (const n of realizeMotif(m, sT, beat, 74, spans, keyScale, 66, 86)) b.note(rh, n.t + song.range(0.05, 0.2), n.d * 1.2, n.p, vel(song, 0.42));
    } else if (!intro && !outro) {
      if (r === 'head') {
        const m = heads[s.part] ?? heads.A!;
        for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
          const idx = ph / 2;
          const cell = idx === 1 ? answer : idx === 2 ? shiftMotif(m, s.part === 'B' ? -1 : 1) : idx === 3 ? cadence(m) : m;
          playHead(b, song, rh, cell, spans, keyScale, s.startBar + ph, lo, hi, ballad);
        }
      } else if (r === 'solo') {
        bebop(b, song, rh, spans, keyScale, s.startBar, s.bars, 60, 86, D, ballad);
      }
    } else if (outro) {
      // A last flourish over the final chord.
      const home = spans[spans.length - 1]!;
      const tones = chordPcs(home.chord);
      let p = nearestInSet(70, tones);
      const t0 = b.grid.at(home.bar, home.beat) + 0.25;
      for (let j = 0; j < 6 && p <= 91; j++) {
        b.note(rh, t0 + j * 0.07, b.end - t0 - j * 0.07 - 0.3, p, vel(song, 0.34 + j * 0.03));
        p = nearestInSet(p + 3, tones);
      }
    }
  }

  // A ballad slows into its last chord.
  if (ballad && outroStart && plan.length > 2) {
    const from = b.grid.bar(Math.max(0, outroStart.startBar - 1));
    ritardando(b, from, b.grid.bar(outroStart.startBar + outroStart.bars - 1), 0.18);
  }

  return b.build({
    key: keyName(tonic, minor ? 'minor' : 'major'),
    progression: form === 'blues' ? `${minor ? 'minor ' : ''}blues: ${tplA}` : `${form} · A: ${tplA} · ${form === 'AABA' ? `B: ${tplB}` : `B: ${tplB} · C: ${tplC}`}`,
    fx: trackFx({
      gain: 0.5,
      lowpass: lerp(6000, 15000, B),
      highpass: 35,
      wow: G * 1.0 + W * 0.6,
      wowRate: 0.4,
      flutter: G * 0.03,
      drive: 0.05 + G * 0.25,
      reverbTone: 5500,
      reverbLevel: 1.15,
    }),
  });
}

/** Intro changes: the band vamps a turnaround (or the ballad's last two bars). */
function turnaround(tonic: number, minor: boolean, ballad: boolean, progA: Chord[][]): Chord[][] {
  if (ballad) return progA.slice(-2);
  return minor
    ? [[chord(tonic, 'm6')], [chord(tonic + 8, '7')], [chord(tonic + 2, 'm7b5')], [chord(tonic + 7, '7b9')]]
    : [[chord(tonic, 'maj7')], [chord(tonic + 9, '7b9')], [chord(tonic + 2, 'm7')], [chord(tonic + 7, '13')]];
}

/** The ending: a tritone-sub turnaround (or the classic ♭VI–♭II), then home. */
function ending(b: ScoreBuilder, s: { startBar: number; bars: number }, tonic: number, minor: boolean, rng: Rng): ChordSpan[] {
  const home = minor ? chord(tonic, 'm69') : chord(tonic, rng.chance(0.5) ? '69' : 'maj9');
  const bars: Chord[][] = [];
  if (s.bars >= 2) {
    bars.push(rng.chance(0.5) ? [chord(tonic + 2, minor ? 'm7b5' : 'm7'), chord(tonic + 1, '7#11')] : [chord(tonic + 8, 'maj7'), chord(tonic + 1, '7#11')]);
    for (let k = 1; k < s.bars; k++) bars.push([home]);
  } else bars.push([home]);
  const spans = chordSpans(bars, s, b);
  // Merge the held final chord into one span.
  const first = spans.findIndex((x) => x.chord === home);
  if (first >= 0) {
    const f = spans[first]!;
    f.dur = b.end - f.t;
    spans.splice(first + 1);
  }
  return spans;
}

function compRhythm(rng: Rng, beats: number, style: number, density: number, sparse: boolean): [number, number][] {
  if (beats < 4) return rng.chance(0.55) ? [[0, 1.2]] : [[0.5, 0.9]];
  const options: [number, number][][] = [
    [[0, 1], [1.5, 0.5]],
    [[1.5, 0.5], [3.5, 0.9]],
    [[0, 0.5], [2.5, 1]],
    [[1, 0.5], [2.5, 0.5], [3.5, 0.6]],
  ];
  const pick = rng.chance(0.55) ? options[style % options.length]! : rng.pick(options);
  return sparse || density < 0.3 ? pick.slice(0, 1) : pick;
}

/** Walking bass: root, chord and scale tones heading for the next root, then an approach. */
function walk(rng: Rng, span: ChordSpan, root: number, target: number, keyScale: readonly number[]): number[] {
  const n = Math.max(1, Math.round(span.beats));
  if (n === 1) return [root];
  const tones = chordPcs(span.chord);
  const scale = chordScale(span.chord, keyScale);
  const out = [root];
  let cur = root;
  for (let j = 1; j < n; j++) {
    if (j === n - 1) {
      let p = rng.weighted([[target - 1, 4], [target + 1, 3], [target + 7 > 50 ? target - 5 : target + 7, 2], [target - 2, 1]] as const);
      if (p < 28) p += 12;
      if (p > 50) p -= 12;
      out.push(p);
      break;
    }
    let dir = target > cur ? 1 : target < cur ? -1 : rng.chance(0.5) ? 1 : -1;
    if (cur > 46) dir = -1;
    if (cur < 31) dir = 1;
    const set = rng.chance(0.6) ? tones : scale;
    let p = stepInSet(cur, set, dir);
    if (p < 28) p += 12;
    if (p > 50) p -= 12;
    out.push(p);
    cur = p;
  }
  return out;
}

/** Ballad two-feel: half notes on the root and fifth (or an approach to the next chord). */
function twoFeel(rng: Rng, span: ChordSpan, root: number, target: number): number[] {
  if (span.beats < 4) return [root];
  const fifth = root + 7 <= 50 ? root + 7 : root - 5;
  return [root, rng.chance(0.65) ? fifth : target + (rng.chance(0.5) ? -1 : 1)];
}

/** The last phrase of a head section: the motif's opening, then a long note. */
function cadence(m: readonly MotifNote[]): MotifNote[] {
  const keep = m.slice(0, Math.max(1, Math.ceil(m.length / 2)));
  const last = keep[keep.length - 1]!;
  return [...keep.slice(0, -1), { ...last, beats: Math.max(last.beats, 8 - last.beat - 0.5), strong: true }];
}

/** The head: melody in the right hand, with chord tones tucked under the long notes. */
function playHead(b: ScoreBuilder, rng: Rng, inst: number, m: readonly MotifNote[], spans: readonly ChordSpan[], keyScale: readonly number[], bar: number, lo: number, hi: number, ballad: boolean): void {
  const notes = realizeMotif(m, 0, b.beat, Math.round((lo + hi) / 2), spans, keyScale, lo, hi, b.grid, bar);
  notes.forEach((n, j) => {
    const prev = notes[j - 1];
    if (n.strong && prev && n.t - (prev.t + prev.d) > b.beat * 0.45 && rng.chance(0.3)) b.note(inst, n.t - b.beat / 3, b.beat * 0.3, n.p - 1, vel(rng, 0.42));
    const t = n.t + rng.gauss() * 0.006;
    b.note(inst, t, n.d * (ballad ? 1.05 : 0.95), n.p, vel(rng, n.strong ? 0.58 : 0.5));
    if (n.d >= b.beat * 0.95 && rng.chance(ballad ? 0.55 : 0.3)) {
      // Block chord: two chord tones under the melody note.
      const span = chordAt(spans, n.t + 0.01);
      const tones = chordPcs(span.chord);
      let p = n.p;
      for (let k = 0; k < 2; k++) {
        p = nearestInSet(p - 3, tones);
        if (p === n.p) p = nearestInSet(p - 4, tones);
        if (p < 55) break;
        b.note(inst, t + 0.008, n.d * 0.95, p, vel(rng, 0.36));
      }
    }
  });
}

/** A piano solo: phrases of swung eighths that target chord tones, with enclosures and rests. */
function bebop(b: ScoreBuilder, rng: Rng, inst: number, spans: readonly ChordSpan[], keyScale: readonly number[], startBar: number, bars: number, lo: number, hi: number, density: number, ballad: boolean): void {
  const total = bars * 4;
  let beat = rng.pick([0, 0.5, 1, 1.5]);
  let p = Math.round((lo + hi) / 2 + rng.range(-4, 4));
  while (beat < total - 1) {
    const len = rng.int(4, 6 + Math.round(density * 10));
    let dir = rng.chance(0.6) ? -1 : 1;
    const sub = ballad && rng.chance(0.4) ? 0.25 : 0.5;
    for (let k = 0; k < len && beat < total - 0.5; k++) {
      const bar = startBar + Math.floor(beat / 4);
      const inBar = beat - Math.floor(beat / 4) * 4;
      const t = b.grid.at(bar, inBar);
      const span = chordAt(spans, t + 0.01);
      const tones = chordPcs(span.chord);
      const scale = chordScale(span.chord, keyScale);
      const onBeat = Math.abs(inBar - Math.round(inBar)) < 1e-6;
      if (p > hi - 2) dir = -1;
      else if (p < lo + 2) dir = 1;
      else if (rng.chance(0.14)) dir = -dir;
      if (onBeat) {
        let q = nearestInSet(p + dir, tones);
        if (q === p) q = stepInSet(p, tones, dir);
        p = q;
      } else if (rng.chance(0.12)) {
        p = stepInSet(p, tones, dir * 2);
      } else {
        // Enclosure: a chromatic step into the next beat's chord tone.
        const nextTones = chordPcs(chordAt(spans, t + b.beat * sub + 0.01).chord);
        const nextTarget = nearestInSet(p + dir * 2, nextTones);
        p = rng.chance(0.25) ? nextTarget - dir : stepInSet(p, scale, dir);
      }
      p = Math.max(lo, Math.min(hi, p));
      const lastOne = k === len - 1;
      const d = lastOne ? b.beat * rng.pick([1, 1.5, 2]) : b.beat * sub * 0.92;
      const accent = onBeat ? 0.48 : 0.56; // jazz phrasing leans on the upbeats
      b.note(inst, t + rng.gauss() * 0.005, d, p, vel(rng, rng.chance(0.08) ? 0.3 : accent));
      beat += sub;
      if (lastOne) beat += 0.5;
    }
    beat += rng.pick([1, 1.5, 2, 2.5, 3, 4]);
    beat = Math.round(beat * 2) / 2;
  }
}

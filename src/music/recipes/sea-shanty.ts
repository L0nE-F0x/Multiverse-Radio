// Sea shanty: a crew that has been at sea since before there was water. A rolling 6/8
// (two dotted-quarter beats a bar): the accordion pumps oom-pa-pa, a fiddle (or tin
// whistle) sings the call, the whole crew and their boots answer, and the chorus is
// everyone at once, in harmony, stamping. Ship's bell, the sea underneath, and a last
// slowed-down chorus line to end on.

import type { TrackRequest } from '../index';
import { hashString, Rng } from '../rng';
import { fitForm, type Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, stepInSet, voiceChord, type ScaleName } from '../theory';
import { bassNote, chordAt, chordSpans, lerp, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune, type ChordSpan } from './common';
import { bpmFor, planForm, ritardando, streams, tonicFor } from './v3-kit';

const MODES: { scale: ScaleName; verse: string; chorus: string; weight: number }[] = [
  { scale: 'dorian', verse: 'i i bVII bVII i i bVII i', chorus: 'i iv i bVII i iv bVII i', weight: 3 },
  { scale: 'minor', verse: 'i i iv iv i i v i', chorus: 'bIII bVII i i bIII bVII v i', weight: 2 },
  { scale: 'major', verse: 'I I IV I I I V I', chorus: 'IV I V I IV I V I', weight: 2 },
  { scale: 'mixolydian', verse: 'I bVII I I I bVII I I', chorus: 'IV I bVII I IV I bVII I', weight: 1.5 },
];

/** Rhythm cells for one dotted-quarter beat, in eighths. */
const CELLS: number[][] = [[3], [2, 1], [1, 1, 1], [1, 2], [1.5, 0.5, 1]];

interface TuneNote {
  /** Start and length in dotted-quarter beats from the phrase start. */
  at: number;
  len: number;
  /** Scale steps from the phrase anchor. */
  step: number;
}

/** A two-bar line in 6/8: rhythm cells from one stream, the melodic steps from another. */
function line(rhythm: Rng, pitch: Rng, busy: number): TuneNote[] {
  const out: TuneNote[] = [];
  let step = pitch.pick([0, 2, 4]);
  for (let beatNo = 0; beatNo < 4; beatNo++) {
    const last = beatNo === 3;
    const cell = last ? (rhythm.chance(0.6) ? [3] : [2, 1]) : rhythm.weighted(CELLS.map((c) => [c, c.length === 1 ? 1.5 - busy : c.length === 3 ? 0.5 + busy * 1.5 : 1.5] as const));
    let x = 0;
    for (const len of cell) {
      out.push({ at: beatNo + x / 3, len: len / 3, step });
      x += len;
      step += pitch.weighted([[1, 3], [-1, 3], [0, 1.5], [2, 1], [-2, 1], [3, 0.4]] as const);
      step = Math.max(-3, Math.min(6, step));
    }
  }
  return out;
}

export function composeSeaShanty(req: TrackRequest): Score {
  const S = streams(req, 'sea-shanty');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 66, density: 0.5, grit: 0.15, weirdness: 0.15, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const lean = S.sig ? S.sig.minor : 0.5;
  const mode = song.weighted(MODES.map((m) => [m, m.weight * (m.scale === 'major' || m.scale === 'mixolydian' ? 1.4 - lean : 0.6 + lean)] as const));
  const tonic = tonicFor(S, [2, 7, 9, 4, 0]);
  const minorish = mode.scale === 'dorian' || mode.scale === 'minor';
  const progV = parseProgression(mode.verse, tonic);
  const progC = parseProgression(mode.chorus, tonic);
  const keyScale = scalePcs(tonic, SCALES[mode.scale]);
  const flats = prefersFlats(tonic, minorish);
  const bpm = bpmFor(S, req, [56, 78]);
  const tail = Math.min(4, Math.max(1, req.durationSeconds * 0.04));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 2, tail);
  const plan = planForm(fit.bars, fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0, fit.bars >= 24 ? 4 : fit.bars >= 8 ? 2 : fit.bars >= 4 ? 1 : 0, [{ part: 'V', bars: 8 }, { part: 'C', bars: 8 }]);
  const b = new ScoreBuilder(req.recipe, req, fit, 2, 0.5, tweaks, 2);
  const beat = b.beat;
  const eighth = beat / 3;

  // ── The crew ──
  const whistle = style.chance(0.3);
  const callInst = whistle
    ? b.inst({ kind: 'synth', patch: 'flute', name: 'Tin whistle', gain: 0.5, reverb: 0.3, pan: 0.15, detune: weirdDetune(song, W, 15) })
    : b.inst({ kind: 'sample', patch: 'bowed-fiddle', name: 'Fiddle', gain: 0.55, reverb: 0.3, pan: 0.18, release: 0.1, detune: weirdDetune(song, W, 15) });
  const fiddle = whistle ? b.inst({ kind: 'sample', patch: 'bowed-fiddle', name: 'Fiddle', gain: 0.45, reverb: 0.3, pan: 0.25, release: 0.1 }) : callInst;
  const crew = b.inst({ kind: 'synth', patch: 'crew', name: 'The crew', gain: 0.55, reverb: 0.4, pan: -0.05, detune: weirdDetune(song, W, 25), lowpass: 3200 });
  const crewLow = b.inst({ kind: 'synth', patch: 'crew', name: 'The crew, low', gain: 0.42, reverb: 0.4, pan: -0.2, detune: -7, lowpass: 2600 });
  const box = b.inst({ kind: 'synth', patch: 'accordion', name: 'Accordion', gain: 0.5, reverb: 0.2, pan: -0.25, lowpass: lerp(2500, 5000, B) });
  const boxBass = b.inst({ kind: 'synth', patch: 'accordion', name: 'Accordion bass', gain: 0.48, pan: -0.15, lowpass: 1200 });
  const stomp = b.inst({ kind: 'sample', patch: 'stomp', name: 'Stamping boots', gain: 0.3, reverb: 0.2 });
  const drum = b.inst({ kind: 'sample', patch: 'frame-drum', name: 'Frame drum', gain: 0.32, reverb: 0.2, pan: 0.1 });
  const clap = b.inst({ kind: 'sample', patch: 'clap', name: 'Claps', gain: 0.22, reverb: 0.25, pan: 0.2 });
  const bell = b.inst({ kind: 'sample', patch: 'glass', name: "Ship's bell", gain: 0.3, reverb: 0.5 });
  const sea = b.inst({ kind: 'sample', patch: 'ocean', name: 'The sea', gain: 0.18 });

  // The tune: calls, a response, and the chorus. With an artist, the first call and the
  // response move in their rhythms (the notes are this song's).
  const habit = S.sig ? new Rng(hashString('shanty-rhythm', S.sig.phrasing)) : song;
  const busy = 0.3 + D * 0.4;
  const call1 = line(habit, song, busy);
  const response = line(habit, song, busy * 0.8);
  const call2 = line(song, song, busy);
  const chorusA = line(song, song, busy * 0.8);
  const chorusB = line(song, song, busy);
  const homeNote = 60 + pc(tonic - 60);
  const anchor = homeNote + (homeNote < 62 ? 12 : 0);

  let boxV: number[] | null = null;
  let prevBass: number | null = null;
  const outroSec = plan.find((s) => s.part === 'outro');

  // Ship's bell: two pairs of strokes at the start.
  for (const [k, at] of [0, 0.35, 1.1, 1.45].entries()) b.note(bell, at, 2.5, 76, k % 2 ? 0.45 : 0.55);

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const chorus = s.part === 'C';
    const prog = chorus || outro ? progC : progV;
    let spans = chordSpans(intro ? progV.slice(-2) : outro ? progC.slice(-Math.max(1, s.bars)) : prog, s, b);
    if (outro) {
      const home = chordSpans([[chord(tonic, minorish ? 'm' : '')]], { startBar: s.startBar + s.bars - 1, bars: 1 }, b)[0]!;
      home.dur = b.end - home.t;
      spans = [...spans.filter((x) => x.bar < s.startBar + s.bars - 1), home];
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? 'last line' : chorus ? 'chorus (all hands)' : 'verse (call and response)' }, spans.map((x) => x.chord), flats);

    // ── Accordion: oom-pa-pa on every dotted quarter ──
    spans.forEach((span, k) => {
      const t = b.grid.at(span.bar, span.beat);
      const lastSpan = outro && k === spans.length - 1;
      boxV = voiceChord(span.chord, boxV, { low: 55, high: 72, voices: 3, rootless: false, maxSpan: 12 });
      const root = bassNote(bassPc(span.chord), prevBass, 38, 50);
      prevBass = root;
      if (lastSpan) {
        for (const p of boxV) b.note(box, t, b.end - t - 0.4, p, 0.6);
        b.note(boxBass, t, b.end - t - 0.4, root, 0.6);
        return;
      }
      for (let bt = 0; bt < Math.round(span.beats); bt++) {
        const at = b.grid.at(span.bar, span.beat + bt);
        const bassP = bt % 2 === 0 ? root : root + 7 <= 55 ? root + 7 : root - 5;
        b.note(boxBass, at, eighth * 0.9, bassP, vel(song, 0.66));
        for (const e of [1, 2]) for (const p of boxV) b.note(box, at + e * eighth, eighth * 0.75, p, vel(song, e === 1 ? 0.5 : 0.44));
      }
    });

    // ── Boots, drum, claps ──
    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      if (outro && k === s.bars - 1) {
        b.hit(stomp, b.grid.bar(bar), 0.95);
        b.hit(drum, b.grid.bar(bar), 0.9);
        break;
      }
      const response = !chorus && k % 4 >= 2;
      for (let bt = 0; bt < 2; bt++) {
        const at = b.grid.at(bar, bt);
        if (chorus || response || outro || (intro && k >= s.bars - 2)) b.hit(stomp, at + song.gauss() * 0.008, vel(song, bt === 0 ? 0.85 : 0.75));
        b.hit(drum, at, vel(song, bt === 0 ? 0.7 : 0.5), bt === 0 ? 60 : 62);
        if (D > 0.35 && song.chance(0.5)) b.hit(drum, at + eighth * 2, vel(song, 0.32), 64, 0.4);
        if (chorus && bt === 1) {
          b.hit(clap, at + 0.01, vel(song, 0.6));
          b.hit(clap, at + 0.025, vel(song, 0.35));
        }
      }
    }

    // ── The tune ──
    if (intro && s.bars >= 2) {
      // The fiddle's pickup into the first call.
      const pick = response.slice(-3);
      for (const n of pick) {
        const t = b.grid.at(s.startBar + s.bars - 1, n.at - 2);
        if (t >= 0) b.note(fiddle, t, n.len * beat * 0.9, stepInSet(anchor, keyScale, n.step), vel(song, 0.5));
      }
    }
    if (!intro) {
      const lines = chorus ? [chorusA, chorusB, chorusA, response] : outro ? [response] : [call1, response, call2, response];
      for (let ph = 0; ph < lines.length && ph * 2 < s.bars; ph++) {
        const tune = lines[ph]!;
        const startBar = s.startBar + ph * 2;
        const together = chorus || outro || ph % 2 === 1;
        const home = together;
        const notes = realize(b, tune, startBar, spans, keyScale, anchor, home, tonic);
        for (const n of notes) {
          if (n.t >= b.end - 0.3) continue;
          const d = Math.min(n.d * 0.92, b.end - n.t - 0.2);
          if (!together) {
            b.note(callInst, n.t + song.gauss() * 0.006, d, n.p, vel(song, 0.62));
            continue;
          }
          // All hands: the crew an octave down, a third under them in the chorus, the fiddle on top.
          b.note(crew, n.t + song.gauss() * 0.01, d, n.p - 12, vel(song, 0.66));
          if (chorus || outro) {
            const under = stepInSet(n.p - 12, keyScale, -2);
            b.note(crewLow, n.t + song.gauss() * 0.012, d, under, vel(song, 0.56));
          }
          b.note(fiddle, n.t + 0.004, d, n.p, vel(song, 0.5));
        }
      }
    }
  }
  if (outroSec && fit.bars > 6) ritardando(b, b.grid.bar(outroSec.startBar), b.grid.bar(outroSec.startBar + outroSec.bars - 1), 0.2);
  b.note(sea, 0, b.end, 60, 1);
  b.auto('cutoff', 0, lerp(5000, 11000, B), 0);

  return b.build({
    key: keyName(tonic, mode.scale),
    progression: `verse ${mode.verse} · chorus ${mode.chorus}`,
    fx: trackFx({
      gain: 0.549,
      lowpass: lerp(5000, 11000, B),
      highpass: 40,
      wow: 0.3 + G * 1.5 + W * 1.5,
      wowRate: 0.3,
      flutter: G * 0.04,
      drive: 0.08 + G * 0.3,
      reverbTone: 4500,
      reverbLevel: 1.25,
    }),
  });
}

/** Realizes a 6/8 line over the chords: chord tones on the beats, steps between, a cadence. */
function realize(b: ScoreBuilder, tune: readonly TuneNote[], startBar: number, spans: readonly ChordSpan[], keyScale: readonly number[], anchor: number, home: boolean, tonic: number): { t: number; d: number; p: number }[] {
  const out: { t: number; d: number; p: number }[] = [];
  let prev: number | null = null;
  tune.forEach((n, k) => {
    const bar = startBar + Math.floor(n.at / 2);
    const t = b.grid.at(bar, n.at - Math.floor(n.at / 2) * 2);
    const span = chordAt(spans, t + 0.01);
    let p = stepInSet(nearestInSet(anchor, keyScale), keyScale, n.step);
    const onBeat = Math.abs(n.at - Math.round(n.at)) < 1e-6;
    if (onBeat) p = nearestInSet(p, chordPcs(span.chord));
    if (k === tune.length - 1) p = home ? nearestInSet(p, [pc(tonic)]) : nearestInSet(p, [pc(tonic + 7), pc(tonic + 2)]);
    if (prev !== null && Math.abs(p - prev) > 9) p += p > prev ? -12 : 12;
    while (p > anchor + 12) p -= 12;
    while (p < anchor - 7) p += 12;
    out.push({ t, d: n.len * b.beat, p });
    prev = p;
  });
  return out;
}

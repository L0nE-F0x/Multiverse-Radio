// Oddities: things found between stations on the infinite dial. Minimal, loop-like and a
// little eerie, but still ordinary seeded tracks: any length from a few seconds to an
// hour, the same seed always the same signal.
//   test-tone       – a line-up tone (left channel interrupted for identification), pip
//                     groups, gaps of hiss and the occasional level change
//   distress-beacon – a call sign keyed in morse (never SOS), a long carrier, silence,
//                     repeated through shortwave noise; Doppler drift and fading
//   stuck-loop      – four bars of a forgotten 1974 soft-rock single on a worn tape loop:
//                     wow and flutter, a splice click at the loop point, dropouts
//   time-signal     – a pip on every second, a long pip on the minute, a silent 59th
//                     second and the station's own morse ID, over a faint carrier.
//                     Each dimension's second is its own length; the clock is sure of it.

import type { TrackRequest } from '../index';
import { rngFor, type Rng } from '../rng';
import { fitForm, type Score } from '../score';
import { TONE_ROOTS } from '../dsp/beds-v3';
import { bassPc, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord, type Chord } from '../theory';
import { sentence } from './beds-kit';
import { bassNote, chordSpans, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel } from './common';

const TONE_HZ = [440, 800, 1000];

/** Bars that fit a fixed tempo (oddities keep their tempo exactly; the form doesn't stretch it). */
function fixedForm(duration: number, bpm: number, beatsPerBar: number, tail: number) {
  const barDur = (beatsPerBar * 60) / bpm;
  const bars = Math.max(1, Math.floor(Math.max(barDur, duration - tail) / barDur));
  const fitted = bars * barDur <= duration ? { bpm, bars, barDur, tail: duration - bars * barDur } : fitForm(duration, bpm, beatsPerBar, tail, 0.5);
  return fitted;
}

/** Labels bars into sections of `unit` bars with names from `name(k)`. */
function labelSections(b: ScoreBuilder, bars: number, unit: number, name: (k: number, startBar: number) => string, chords: Chord[] = []): void {
  for (let k = 0, bar = 0; bar < bars; k++) {
    let len = Math.min(unit, bars - bar);
    if (bars - bar - len > 0 && bars - bar - len < Math.ceil(unit / 2)) len = bars - bar;
    b.section({ name: name(k, bar), part: 'A', repeat: k, startBar: bar, bars: len }, chords, true);
    bar += len;
  }
}

const dB = (x: number) => 10 ** (x / 20);
/** Velocity for a sample note at `db` relative to full scale (the player applies v^1.5). */
const velFor = (db: number) => Math.min(1, dB(db) ** (1 / 1.5));

// ── Test tone ─────────────────────────────────────────────────────────────────

export function composeTestTone(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'test-tone');
  const tweaks = resolveTweaks(req, { bpm: 60, density: 0.4, grit: 0.2, weirdness: 0.2, brightness: 0.5 });
  const { grit: G, weirdness: W } = tweaks;
  const which = rng.weighted([[2, 5], [0, 3], [1, 2]] as const);
  const hz = TONE_HZ[which]!;
  const pitch = TONE_ROOTS[which]!;
  const pipsPerMinute = req.tweaks?.bpm ?? rng.pick([60, 60, 72, 90, 100, 120]);
  const fit = fixedForm(req.durationSeconds, pipsPerMinute, 4, 0.3);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;
  // Weird dimensions: the reference tone isn't quite the reference.
  const off = W > 0.3 && rng.chance(W) ? rng.range(-35, 35) * (W - 0.2) : 0;

  const left = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Tone (left)', gain: 0.5, pan: -1, release: 0.02, detune: off });
  const right = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Tone (right)', gain: 0.5, pan: 1, release: 0.02, detune: off });
  const pip = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Pips', gain: 0.5, release: 0.012, detune: off });
  const ghost = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Ghost tone', gain: 0.05, pan: 0.3, release: 0.3, detune: 13 + off });
  const hiss = b.inst({ kind: 'sample', patch: 'hiss', name: 'Line hiss', gain: 0.1 + G * 0.12 });

  const stereoId = rng.chance(0.6);
  let level = -6; // dB relative to the reference
  const end = b.end - 0.2;
  let t = rng.range(0, 0.6);
  const labels: { t: number; name: string }[] = [];
  let block = 0;
  while (t < end - 0.5) {
    // A count-in of pips, then tone and pips by turns, with the odd stretch of bare hiss.
    const kind = block === 0 ? 'pips' : block % 2 === 1 ? 'tone' : rng.weighted([['pips', 4], ['gap', 1]] as const);
    if (kind === 'tone') {
      // Now and then the level changes between blocks.
      if (block > 1 && rng.chance(0.45)) level = rng.pick([-18, -12, -6, 0].filter((x) => x !== level));
      const len = Math.min(rng.range(5, 11), end - t);
      labels.push({ t, name: `${hz >= 1000 ? '1 kHz' : `${hz} Hz`} ${level === 0 ? '0 dB' : `${level} dB`}` });
      const v = velFor(level);
      b.note(right, t, len, pitch, v);
      if (stereoId) {
        // Left channel interrupted every few seconds, so the engineers know which is which.
        for (let x = t; x < t + len - 0.3; x += 3.5) b.note(left, x + (x > t ? 0.25 : 0), Math.min(3.25, t + len - x - 0.25), pitch, v);
      } else b.note(left, t, len, pitch, v);
      if (W > 0.25 && rng.chance(W * 0.4)) b.note(ghost, t + len * 0.3, len * 0.5, pitch - 12, 0.6);
      t += len + rng.range(1, 2.5);
    } else if (kind === 'pips') {
      const n = rng.int(8, 12);
      const t0 = Math.ceil(t / beat) * beat;
      labels.push({ t: t0, name: 'pips' });
      for (let k = 0; k < n && t0 + k * beat < end - 0.3; k++) {
        const long = k === n - 1 && rng.chance(0.5);
        b.note(pip, t0 + k * beat, long ? Math.min(0.6, beat * 0.7) : 0.18, pitch, velFor(level));
      }
      t = t0 + n * beat + rng.range(0.8, 2);
    } else {
      labels.push({ t, name: 'hiss' });
      t += rng.range(1.5, 3);
    }
    block++;
  }
  b.note(hiss, 0, b.end, 60, 1);
  labelSections(b, fit.bars, 4, (_k, bar) => {
    const at = bar * fit.barDur;
    let name = labels[0]?.name ?? 'tone';
    for (const l of labels) if (l.t <= at + fit.barDur * 0.5) name = l.name;
    return name;
  });
  return b.build({
    key: hz >= 1000 ? '1 kHz' : `${hz} Hz`,
    progression: stereoId ? 'line-up tone, left channel interrupted' : 'line-up tone',
    fx: trackFx({ gain: 0.23, lowpass: 9000, highpass: 60, wow: 0, wowRate: 0.3, flutter: 0, drive: 0, reverbLevel: 0 }),
  });
}

// ── Morse ─────────────────────────────────────────────────────────────────────

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};
/** No S or O: a beacon here never spells the one thing everyone listens for. */
const CALL_LETTERS = 'BCDFGHJKLMNPQRTVWXYZ';

function callSign(rng: Rng): string {
  // Distinct letters, so nothing reads like a name.
  const pool = rng.shuffle([...CALL_LETTERS]);
  return `${pool[0]}${pool[1]}${rng.int(2, 9)}${pool[2]}${rng.chance(0.4) ? pool[3] : ''}`;
}

/** Morse elements for `text` at `dot` seconds per unit: [start, length] pairs and the total. */
function morse(text: string, dot: number): { marks: [number, number][]; length: number } {
  const marks: [number, number][] = [];
  let t = 0;
  for (const word of text.split(' ')) {
    for (const ch of word) {
      for (const sym of MORSE[ch] ?? '') {
        const len = sym === '-' ? 3 * dot : dot;
        marks.push([t, len]);
        t += len + dot;
      }
      t += 2 * dot; // letter gap (3 units in all)
    }
    t += 4 * dot; // word gap (7 units in all)
  }
  return { marks, length: t };
}

// ── Distress beacon ───────────────────────────────────────────────────────────

export function composeDistressBeacon(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'distress-beacon');
  const tweaks = resolveTweaks(req, { bpm: 80, density: 0.4, grit: 0.5, weirdness: 0.3, brightness: 0.4 });
  const { grit: G, weirdness: W } = tweaks;
  const call = callSign(rng);
  const wpm = rng.range(10, 18);
  const dot = 1.2 / wpm;
  const bpm = 60 / (dot * 8);
  const fit = fixedForm(req.durationSeconds, bpm, 4, 0.5);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const base = TONE_ROOTS[1]! + rng.range(-3.5, 2); // ~650–900 Hz

  // Doppler: either a slow pass (high, then sliding low) or a lazy orbit.
  const pass = rng.chance(0.5);
  const depth = rng.range(35, 80) * (0.7 + W * 0.6);
  const t0 = rng.range(0.2, 0.8) * Math.min(b.end, 300);
  const tau = rng.range(25, 70);
  const period = rng.range(90, 240);
  const phase = rng.range(0, Math.PI * 2);
  const cents = (t: number) => (pass ? -depth * Math.tanh((t - t0) / tau) : depth * Math.sin((2 * Math.PI * t) / period + phase));

  const beacon = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Beacon', gain: 0.2, pan: 0.1, release: 0.012, reverb: 0.15, lowpass: 2400 });
  const sw = b.inst({ kind: 'sample', patch: 'shortwave', name: 'Shortwave', gain: 0.42 + G * 0.15 });
  const fizz = b.inst({ kind: 'sample', patch: 'static', name: 'Static', gain: 0.14 + G * 0.12 });

  const id = morse(`${call} ${call}`, dot);
  const carrier = rng.range(2.2, 4);
  let t = rng.range(0.5, 2.5);
  while (t < b.end - 1) {
    for (const [at, len] of id.marks) {
      if (t + at >= b.end - 0.3) break;
      b.note(beacon, t + at, len, base + cents(t + at) / 100, 0.8);
    }
    t += id.length;
    if (t < b.end - 1.5) b.note(beacon, t, Math.min(carrier, b.end - t - 0.4), base + cents(t) / 100, 0.75);
    t += carrier + rng.range(3.5, 7);
  }
  // Fading (QSB): the beacon drifts in and out of the noise.
  for (let x = rng.range(1, 3); x < b.end - 1; x += rng.range(2.5, 6)) b.auto('inst', x, rng.range(0.3, 1), rng.range(0.8, 2), beacon);
  b.note(sw, 0, b.end, 60, 1);
  b.note(fizz, 0, b.end, 60, 1);
  labelSections(b, fit.bars, 8, (k) => (k === 0 ? `${call} calling` : `${call} ×${k + 1}`));
  return b.build({
    key: `${Math.round(440 * 2 ** ((base - 69) / 12))} Hz`,
    progression: `${call} ${call}, carrier (${Math.round(wpm)} wpm, ${pass ? 'passing' : 'orbiting'})`,
    fx: trackFx({ gain: 0.69, lowpass: 5000, highpass: 120, wow: 0.6 + W, wowRate: 0.3, flutter: 0.05, drive: 0.1 + G * 0.2, reverbTone: 3000, reverbLevel: 0.8 }),
  });
}

// ── Stuck loop ────────────────────────────────────────────────────────────────

const LOOPS = ['Imaj7 iii7 IVmaj7 V7sus', 'I V/vii vi7 IVmaj7', 'Imaj7 IVmaj7 Imaj7 IVmaj7', 'vi7 ii7 V7sus Imaj7', 'IVmaj7 iii7 ii7 Imaj7', 'Imaj7 bVIImaj7 IVmaj7 Imaj7'];

export function composeStuckLoop(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'stuck-loop');
  const tweaks = resolveTweaks(req, { bpm: 82, density: 0.5, grit: 0.5, weirdness: 0.2, brightness: 0.4 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.int(0, 11);
  const tpl = rng.pick(LOOPS);
  const prog = parseProgression(tpl, tonic);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, [72, 92]);
  const fit = fixedForm(req.durationSeconds, bpm, 4, 0.2);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, rng.range(0.5, 0.54), tweaks, 4);
  const beat = b.beat;
  const loopDur = fit.barDur * 4;

  const ep = b.inst({ kind: 'sample', patch: rng.chance(0.5) ? 'wurli' : 'ep', name: 'Electric piano', gain: 0.42, pan: -0.15, reverb: 0.2 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.4 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.4 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-lofi', name: 'Snare (towel on it)', gain: 0.34, reverb: 0.2 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.3, pan: 0.25 });
  const strings = b.inst({ kind: 'synth', patch: 'pad-strings', name: 'Strings', gain: 0.25, reverb: 0.45, pan: 0.2 });
  const oohs = b.inst({ kind: 'synth', patch: 'pad-choir', name: 'Backing oohs', gain: 0.22, reverb: 0.5, pan: -0.2 });
  const hook = b.inst({ kind: 'synth', patch: 'flute', name: 'Flute hook', gain: 0.34, reverb: 0.35, pan: 0.1 });
  const click = b.inst({ kind: 'sample', patch: 'tape-click', name: 'Splice', gain: 0.32 });
  const hiss = b.inst({ kind: 'sample', patch: 'hiss', name: 'Tape hiss', gain: 0.06 + G * 0.08 });

  // Compose the four bars once, as offsets into the loop.
  type Ev = { i: number; t: number; d: number; p: number; v: number };
  const loop: Ev[] = [];
  const loopPlan = { name: 'loop', part: 'A', repeat: 0, startBar: 0, bars: 4 };
  const spans = chordSpans(prog, loopPlan, b);
  const add = (i: number, t: number, d: number, p: number, v: number) => loop.push({ i, t, d: Math.min(d, loopDur - t - 0.01), p, v: vel(rng, v, 0.04) });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  spans.forEach((span, k) => {
    voicing = voiceChord(span.chord, voicing, { low: 55, high: 70, voices: 4, rootless: true });
    const root = bassNote(bassPc(span.chord), prevBass, 33, 45);
    prevBass = root;
    for (const x of [0, 1.5, 2.5]) for (const p of voicing) add(ep, b.grid.at(span.bar, x), beat * (x === 0 ? 1.4 : 0.9), p, x === 0 ? 0.55 : 0.42);
    add(bass, span.t, beat * 1.4, root, 0.75);
    add(bass, b.grid.at(span.bar, 1.75), beat * 0.4, root, 0.5);
    add(bass, b.grid.at(span.bar, 2), beat * 1.3, root + 7 <= 47 ? root + 7 : root - 5, 0.65);
    for (const p of voiceChord(span.chord, null, { low: 60, high: 76, voices: 3 })) add(strings, span.t, span.dur, p, k >= 2 ? 0.55 : 0.4);
    if (k >= 1) for (const p of voiceChord(span.chord, null, { low: 57, high: 69, voices: 2 })) add(oohs, span.t + beat * 0.5, span.dur, p, 0.4);
    for (const x of [0, 2.5]) add(kick, b.grid.at(span.bar, x), 1, 60, x ? 0.55 : 0.75);
    for (const x of [1, 3]) add(snare, b.grid.at(span.bar, x), 1, 60, 0.6);
    for (let e = 0; e < 8; e++) add(hat, b.grid.at(span.bar, e * 0.5), 0.3, 60, e % 2 ? 0.35 : 0.5);
  });
  // The hook: the bit of the chorus everyone half-remembers.
  const motif = makeMotif(rng, 8, 0.4 + D * 0.3, { restTail: 1.5, minNotes: 3, maxNotes: 5, maxLeap: 3 });
  const cells = sentence(rng, motif, 8, 0);
  for (const c of [0, 1]) {
    for (const n of realizeMotif(cells[c === 0 ? 0 : 3]!, 0, beat, tonic + 76, spans, keyScale, 69, 86, b.grid, c * 2)) add(hook, n.t, n.d * 0.95, n.p, n.strong ? 0.6 : 0.52);
  }
  loop.sort((x, y) => x.t - y.t);

  // Play the loop until the tape runs out. Each pass is identical; the splice clicks.
  const loops = Math.ceil(fit.bars / 4);
  for (let k = 0; k < loops; k++) {
    const t0 = k * loopDur;
    if (k > 0) b.hit(click, t0 - 0.004, vel(rng, 0.7, 0.05), 60, 0.1);
    for (const e of loop) if (t0 + e.t < fit.bars * fit.barDur) b.note(e.i, t0 + e.t, e.d, e.p, e.v);
  }
  b.note(hiss, 0, b.end, 60, 1);
  // Wear: the tape dulls slowly, and drops out now and then (a crease, some oxide gone).
  const bright = 5200 + B * 3000;
  b.auto('cutoff', 0, bright, 0);
  for (let x = rng.range(8, 25); x < b.end - 1; x += rng.range(15, 45)) {
    b.auto('cutoff', x, rng.range(900, 1800), 0.01);
    b.auto('cutoff', x + rng.range(0.08, 0.25), bright * Math.max(0.7, 1 - x / 3600), 0.06);
  }
  b.section({ name: 'the loop', part: 'A', repeat: 0, startBar: 0, bars: Math.min(4, fit.bars) }, spans.map((s) => s.chord), flats);
  for (let k = 1, bar = 4; bar < fit.bars; k++, bar += 4) {
    b.section({ name: `the loop ×${k + 1}`, part: 'A', repeat: k, startBar: bar, bars: Math.min(4, fit.bars - bar) }, spans.map((s) => s.chord), flats);
  }
  return b.build({
    key: keyName(tonic, 'major'),
    progression: tpl,
    fx: trackFx({ gain: 0.28, lowpass: bright, highpass: 55, wow: 1.4 + G * 2 + W, wowRate: 0.55, flutter: 0.06 + G * 0.08, drive: 0.15 + G * 0.3, reverbTone: 4000, reverbLevel: 0.9 }),
  });
}

// ── Time signal ───────────────────────────────────────────────────────────────

export function composeTimeSignal(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'time-signal');
  const tweaks = resolveTweaks(req, { bpm: 60, density: 0.4, grit: 0.25, weirdness: 0.2, brightness: 0.5 });
  const { grit: G } = tweaks;
  // The length of a second in this dimension.
  const second = rng.weighted([[1, 4], [0.97, 1], [1.03, 1], [0.95, 1], [1.05, 1], [1.11, 1], [0.9, 1]] as const);
  const which = rng.weighted([[2, 5], [1, 2], [0, 2]] as const);
  const pitch = TONE_ROOTS[which]!;
  const hz = TONE_HZ[which]!;
  const fit = fixedForm(req.durationSeconds, 60 / second, 4, 0.3);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);

  const pips = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Pips', gain: 0.5, release: 0.008 });
  const ident = b.inst({ kind: 'sample', patch: 'test-sine', name: 'Morse ident', gain: 0.1, pan: 0.15, release: 0.01, lowpass: 2000 });
  const carrier = b.inst({ kind: 'sample', patch: 'hiss', name: 'Carrier', gain: 0.07 + G * 0.06 });
  const fizz = b.inst({ kind: 'sample', patch: 'static', name: 'Static', gain: 0.04 + G * 0.05 });

  const call = callSign(rng).slice(0, 3);
  const idPitch = TONE_ROOTS[which === 2 ? 1 : 2]!;
  let s = rng.int(0, 59); // which second of the minute the track joins on
  for (let t = 0; t < b.end - 0.2; t += second, s = (s + 1) % 60) {
    if (s === 59) continue; // the silent second before the minute
    if (s === 0) b.note(pips, t, Math.min(0.5, b.end - t - 0.05), pitch, 0.85);
    else b.note(pips, t, 0.1, pitch, 0.8);
    // The station identifies itself at forty seconds past, quietly, between the pips.
    if (s === 40) {
      const id = morse(call, 0.06 * second);
      for (const [at, len] of id.marks) if (t + 0.3 + at < b.end - 0.3) b.note(ident, t + 0.3 + at, len, idPitch, 0.7);
    }
  }
  b.note(carrier, 0, b.end, 60, 1);
  b.note(fizz, 0, b.end, 60, 1);
  labelSections(b, fit.bars, 15, (k) => (k === 0 ? 'seconds' : `minute ${k + 1}`));
  return b.build({
    key: `${hz >= 1000 ? '1 kHz' : `${hz} Hz`} pips`,
    progression: `a second here lasts ${second.toFixed(2)} s; ident ${call}`,
    fx: trackFx({ gain: 0.46, lowpass: 7000, highpass: 80, wow: 0, wowRate: 0.3, flutter: 0, drive: 0, reverbLevel: 0 }),
  });
}

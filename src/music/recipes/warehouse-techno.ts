// Warehouse techno: a dead reactor room at 130–135 bpm. A long saturated kick with a
// rumble growing out of its tail, an off-beat open hat, a 303-style acid line whose
// filter knob travels in long arcs (closed in the first stretch, screaming through the
// breakdown, settling after the drop), clanking metal on cross-rhythms, a minimal stab
// thrown into a long echo, and a dark drone for tension. DJ form: a long runway in and
// out, 32-bar stretches, a breakdown with a riser and a roll, then the drop.
//
// Built to be listened to for hours: the top end is rolled off and nothing is shrill.

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { clamp, fitForm, type SamplePatch, type Score, type SynthPatch } from '../score';
import { chord, keyName, pc, prefersFlats, voiceChord, type Chord } from '../theory';
import { lerp, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune } from './common';
import { reverseSwell, riser, roll, runway, smooth, foldTail } from './groove-kit';
import { bpmFor, feelFor, planForm, streams, tonicFor } from './v3-kit';

/** One acid step: off, or a note (semitones from the root) with accent and slide. */
interface AcidStep {
  on: boolean;
  semi: number;
  accent: boolean;
  slide: boolean;
}

const ACID_PATCHES: SynthPatch[] = ['acid-1', 'acid-2', 'acid-3', 'acid-4'];

/** Semitone choices for the acid line by mode, weighted (root and octave dominate). */
function acidPool(mode: 'minor' | 'phrygian' | 'dorian'): [number, number][] {
  const base: [number, number][] = [[0, 9], [12, 5], [3, 3], [7, 3], [10, 2.5], [-2, 2], [15, 1.2], [-5, 1]];
  if (mode === 'phrygian') base.push([1, 2.5], [13, 1.2]);
  if (mode === 'dorian') base.push([5, 1.5], [9, 1]);
  if (mode === 'minor') base.push([5, 1.5], [8, 1.2]);
  return base;
}

function makeAcid(rng: Rng, mode: 'minor' | 'phrygian' | 'dorian', density: number): AcidStep[] {
  const pool = acidPool(mode);
  const steps: AcidStep[] = [];
  for (let k = 0; k < 16; k++) {
    const on = k === 0 || rng.chance(clamp(0.45 + density * 0.3 + (k % 4 === 2 ? 0.1 : 0) - (k % 4 === 3 ? 0.12 : 0), 0.2, 0.9));
    const semi = k === 0 ? 0 : rng.weighted(pool);
    steps.push({ on, semi, accent: rng.chance(k % 4 === 0 ? 0.35 : 0.22), slide: k > 0 && rng.chance(0.18) });
  }
  return steps;
}

/** Small mutations: a note moves, a step toggles, an accent wanders. */
function mutate(rng: Rng, line: AcidStep[], mode: 'minor' | 'phrygian' | 'dorian', amount: number): AcidStep[] {
  const out = line.map((s) => ({ ...s }));
  const pool = acidPool(mode);
  const n = Math.max(1, Math.round(amount * 4));
  for (let j = 0; j < n; j++) {
    const k = rng.int(1, 15);
    const s = out[k]!;
    const what = rng.int(0, 3);
    if (what === 0) s.semi = rng.weighted(pool);
    else if (what === 1) s.on = !s.on;
    else if (what === 2) s.accent = !s.accent;
    else s.slide = !s.slide;
  }
  return out;
}

/** Metal patterns: 16th steps of a 3-against-4 cycle (or a 5), and their pitches. */
const METAL: number[][] = [
  [0, 3, 6, 9, 12],
  [2, 5, 8, 11, 14],
  [1, 6, 11],
  [3, 7, 10, 14],
];
const STABS: number[][] = [[3], [2, 10], [6, 14], [3, 11], [0, 6, 12]];

export function composeWarehouseTechno(req: TrackRequest): Score {
  const S = streams(req, 'warehouse-techno');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 130, density: 0.55, grit: 0.15, weirdness: 0.15, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const mode = song.weighted([['minor', 3], ['phrygian', 2], ['dorian', 1.5]] as const);
  const tonic = tonicFor(S, [2, 4, 5, 7, 9]);
  const flats = prefersFlats(tonic, true);
  const bpm = bpmFor(S, req, [130, 135], 0.5);
  const swing = feelFor(S, 0.5, 0.525);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.02));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail, 0.03);
  const [introBars, outroBars] = runway(fit.bars, 16, 8);
  const aBars = style.pick([16, 32, 32]);
  const bBars = style.pick([8, 16, 16]);
  const plan = foldTail(planForm(fit.bars, introBars, outroBars, [
    { part: 'A', bars: aBars },
    { part: 'B', bars: bBars },
    { part: 'D', bars: 32 },
  ]), 8);
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;
  const sixteenth = beat / 4;

  // ── The rig (palette from the style stream) ──
  const bassMode = style.weighted([['rumble', 3], ['offbeat', 2]] as const);
  const clapPatch: SamplePatch = style.weighted([['clap', 3], ['rim', 1.2], ['snare-dub', 1]] as const);
  const tensionPatch: SynthPatch = style.weighted([['drone', 2], ['pad-dark', 2], ['pad-choir', 1]] as const);
  const stabsOn = style.chance(0.6);
  const rideOn = style.chance(0.55);
  const metalOn = style.chance(0.8);
  const kickPatch: SamplePatch = style.weighted([['kick-techno', 4], ['kick-punch', 1]] as const);

  const kick = b.inst({ kind: 'sample', patch: kickPatch, name: 'Kick', gain: 0.24 });
  const rumble = b.inst({ kind: 'sample', patch: 'rumble', name: bassMode === 'rumble' ? 'Rumble' : 'Sub', gain: bassMode === 'rumble' ? 0.375 : 0.24, lowpass: 240 });
  const sub = bassMode === 'offbeat' ? b.inst({ kind: 'synth', patch: 'sub-sine', name: 'Off-beat bass', gain: 0.42, pump: 0.3 }) : -1;
  const clap = b.inst({ kind: 'sample', patch: clapPatch, name: clapPatch === 'clap' ? 'Clap' : clapPatch === 'rim' ? 'Rim' : 'Snare', gain: clapPatch === 'rim' ? 0.5 : 0.54, reverb: 0.35, pan: 0.02 });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.31, pan: 0.12, lowpass: lerp(6500, 10000, B) });
  const hat = b.inst({ kind: 'sample', patch: 'shaker', name: 'Sixteenths', gain: 0.29, pan: -0.18, lowpass: lerp(7000, 10000, B) });
  const ride = rideOn ? b.inst({ kind: 'sample', patch: 'ride', name: 'Ride', gain: 0.16, pan: 0.3, lowpass: 9000 }) : -1;
  const metal = metalOn ? b.inst({ kind: 'sample', patch: 'clank', name: 'Metal', gain: 0.45, pan: -0.32, reverb: 0.3, delay: 0.25, lowpass: 7000 }) : -1;
  const rim = b.inst({ kind: 'sample', patch: 'rim', name: 'Rim', gain: 0.4, pan: 0.35, reverb: 0.2, delay: 0.15 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.15, reverb: 0.35, lowpass: 9000 });
  const rise = b.inst({ kind: 'sample', patch: 'noise-riser', name: 'Riser', gain: 0.3, reverb: 0.3, pan: 0 });
  const acids = ACID_PATCHES.map((patch, k) => b.inst({ kind: 'synth', patch, name: `Acid (filter ${k + 1})`, gain: [1.2, 1.08, 0.96, 0.84][k]!, delay: 0.18, reverb: 0.08, pan: 0.04, detune: weirdDetune(style, W, 10) }));
  const stab = stabsOn ? b.inst({ kind: 'synth', patch: 'dub-stab', name: 'Stab', gain: 0.9, delay: 0.55, reverb: 0.3, pan: -0.1, highpass: 180 }) : -1;
  const tension = b.inst({ kind: 'synth', patch: tensionPatch, name: 'Tension', gain: 0.22, reverb: 0.5, pan: 0, pump: 0.2 });

  // ── This track ──
  const rootPc = pc(tonic);
  const bassRoot = 33 + pc(rootPc - 33); // A1..G#2
  let acid = makeAcid(song, mode, D);
  const metalPat = song.pick(METAL);
  const metalPitches = [60, song.pick([63, 65, 67]), song.pick([55, 57])];
  const stabPat = song.pick(STABS);
  const rimPat = song.pick([[3, 11], [7, 15], [3, 6, 11], [10]]);
  const moves = song.chance(0.5);
  // A second harmony for the drop: the line shifts to bVI, iv or bVII for 8 bars.
  const moveTo = song.pick(mode === 'phrygian' ? [1, 8, 10] : [8, 5, 10]);
  const stabQuality = song.pick(mode === 'dorian' ? ['m9', 'm7', 'sus4'] : ['m7', 'm9', 'sus4', 'm']);
  const acidOct = song.pick([12, 12, 24]);
  const cutOpen = lerp(8000, 12500, B);

  let echoOn = true;
  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const isA = s.part === 'A';
    const isB = s.part === 'B';
    const isD = s.part === 'D';
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    const chords: Chord[] = [];
    // ── The filter arc for this stretch ──
    const knobAt = (u: number): number => {
      let k: number;
      if (intro) k = u < 0.5 ? -1 : lerp(0, 0.15, (u - 0.5) * 2);
      else if (isA) k = lerp(0.08, 0.6, smooth(u)) + (s.repeat > 0 ? 0.15 : 0);
      else if (isB) k = lerp(0.35, 1, smooth(u) ** 1.3);
      else if (isD) k = lerp(0.95, 0.45, smooth(u));
      else k = lerp(0.4, -0.2, u);
      return clamp(k + 0.08 * Math.sin((u * s.bars * Math.PI) / 8), -1, 1);
    };
    // Cutoff: the track filter closes into the breakdown and reopens with the build.
    if (intro && s.bars >= 4) {
      b.auto('cutoff', 0, 1100, 0);
      b.auto('cutoff', 0.05, cutOpen, (sEnd - sT) / 3);
    } else if (isB) {
      b.auto('cutoff', sT, 2600, beat);
      b.auto('cutoff', b.grid.bar(s.startBar + Math.max(1, s.bars - 4)), cutOpen, (sEnd - sT) / 6);
    } else if (outro && s.bars >= 4) {
      b.auto('cutoff', sT + (sEnd - sT) / 2, 1800, (sEnd - sT) / 5);
    } else b.auto('cutoff', sT, cutOpen, 0.5);
    if (isD || (isA && s.repeat > 0)) b.hit(crash, sT, 0.7, 60, 3);

    for (let k = 0; k < s.bars; k++) {
      const bar = s.startBar + k;
      const u = k / Math.max(1, s.bars);
      const lastBar = k === s.bars - 1;
      // Harmony: the root, with the drop's second harmony on alternate 8-bar blocks.
      const shifted = moves && isD && Math.floor(k / 8) % 2 === 1;
      const rootSemi = shifted ? moveTo : 0;
      if (k % 8 === 0) chords.push(chord(tonic + rootSemi, mode === 'phrygian' && rootSemi === 1 ? 'maj7' : rootSemi === 0 ? 'm7' : rootSemi === 5 ? 'm7' : 'maj7'));
      const root = bassRoot + rootSemi - (bassRoot + rootSemi > 43 ? 12 : 0);
      // Mutate the line every 8 bars; bigger changes at section starts.
      if (k > 0 && k % 8 === 0) acid = mutate(song, acid, mode, 0.35 + D * 0.3);

      // Layer switches across the stretch.
      const kickOn = !isB && !(outro && u > 0.85);
      const preDrop = lastBar && (isB || (isA && s.bars >= 16)) ;
      const bassOn = !intro ? !isB : u >= 0.5;
      const clapOn = (isA && k >= Math.min(8, s.bars / 2)) || isD || (intro && u >= 0.75) || (outro && u < 0.5);
      const sixteenths = isD || (isA && k >= s.bars / 2) || (intro && u >= 0.5);
      const openHat = !isB || u >= 0.75;
      const metalHere = metal >= 0 && (isD || (isA && u >= 0.5) || (isB && u < 0.5)) && D > 0.25;
      const rideHere = ride >= 0 && isD && k >= 8;
      const stabHere = stab >= 0 && (isD || (isA && u >= 0.5) || isB);
      const acidHere = !intro || u >= 0.5;

      for (let st = 0; st < 16; st++) {
        const t = b.grid.step(bar, st) + song.gauss() * 0.0012;
        const q = st % 4;
        const gap = preDrop && st >= 12;
        if (kickOn && q === 0 && !gap) {
          b.hit(kick, t, vel(song, st === 0 ? 0.95 : 0.9, 0.02));
          b.pump(t);
        }
        if (bassOn && !gap) {
          if (bassMode === 'rumble' && q === 1) b.note(rumble, t, sixteenth * 2.6, root, vel(song, 0.7, 0.03));
          if (bassMode === 'rumble' && q === 3 && D > 0.45) b.note(rumble, t, sixteenth * 0.9, root, vel(song, 0.42, 0.03));
          if (bassMode === 'offbeat' && q === 2) {
            b.note(sub, t, sixteenth * 1.6, root, vel(song, 0.75, 0.03));
            if (kickOn) b.note(rumble, b.grid.step(bar, st - 1), sixteenth * 1.2, root, vel(song, 0.38));
          }
        }
        if (gap) continue;
        if (clapOn && (st === 4 || st === 12)) b.hit(clap, t, vel(song, 0.78, 0.03), 60, 0.6);
        if (openHat && q === 2) b.hit(ohat, t, vel(song, isB ? 0.35 : 0.55, 0.04), 60, 0.4);
        if (sixteenths && q !== 2) b.hit(hat, t, vel(song, q === 0 ? 0.5 : q === 1 ? 0.32 : 0.42, 0.05), 60, 0.15);
        if (rideHere && q === 2) b.hit(ride, t, vel(song, 0.45), 60, 1.2);
        if (metalHere && metalPat.includes(st)) b.hit(metal, t, vel(song, 0.5, 0.08), metalPitches[(bar * 16 + st) % 3]!, 0.4);
        if ((isA || isD) && D > 0.5 && rimPat.includes(st)) b.hit(rim, t, vel(song, 0.45, 0.06), 60, 0.2);
      }
      // Every 16 bars the clap flams into the next stretch.
      if (!isB && k % 16 === 15 && !lastBar && clapOn) b.hit(clap, b.grid.step(bar, 15), 0.5, 60, 0.4);

      // ── Acid ──
      const knob = knobAt(u);
      if (acidHere && knob >= 0) {
        let prevP: number | null = null;
        for (let st = 0; st < 16; st++) {
          const a = acid[st]!;
          if (!a.on || (preDrop && st >= 12)) {
            prevP = null;
            continue;
          }
          const p = root + acidOct + a.semi;
          // Which filter position: the knob, dithered between neighbours.
          const x = knob * 3;
          const lo = Math.floor(x);
          const level = clamp(song.chance(x - lo) ? lo + 1 : lo, 0, 3);
          const nextOn = acid[(st + 1) % 16]!;
          const legato = st < 15 && nextOn.on && nextOn.slide;
          const d = legato ? sixteenth * 1.08 : sixteenth * (a.accent ? 0.62 : 0.5);
          const v = a.accent ? vel(song, 0.85, 0.03) : vel(song, 0.48 + 0.08 * knob, 0.03);
          const extra = a.slide && prevP !== null ? { from: prevP, glide: sixteenth * 0.55 } : {};
          b.note(acids[level]!, b.grid.step(bar, st), d, p, v, extra);
          prevP = p;
        }
      }

      // ── Stabs, thrown into the echo ──
      if (stabHere && (isB ? k % 2 === 0 : true)) {
        const c = chord(tonic + rootSemi, stabQuality);
        const v = voiceChord(c, null, { low: 55, high: 70, voices: 3, rootless: false });
        for (const st of stabPat) {
          if (isB && st > 8) continue;
          for (const p of v) b.note(stab, b.grid.step(bar, st), sixteenth * 1.2, p, vel(song, isB ? 0.6 : 0.5));
        }
        // Echo throws: the send opens on some bars and closes again.
        const throwIt = k % 4 === 3;
        if (throwIt !== echoOn) {
          b.auto('echo', b.grid.bar(bar), throwIt ? 0.85 : 0.45, 0.05, stab);
          echoOn = throwIt;
        }
      }
    }

    // ── Tension: a drone through the breakdown and under the drop ──
    if (isB || isD || (isA && s.repeat > 0)) {
      const lo = bassRoot + 12;
      const notes = isB ? [lo, lo + 7, lo + 12] : [lo, lo + 7];
      const span = Math.min(sEnd, b.end) - sT;
      for (const p of notes) b.note(tension, sT, span - 0.05, p + (mode === 'phrygian' && isB && p === lo + 12 ? 1 : 0), isB ? 0.6 : 0.42);
    }
    // ── The breakdown's way back in ──
    if (isB) {
      const buildBars = Math.min(4, s.bars);
      const from = b.grid.bar(s.startBar + s.bars - buildBars);
      riser(b, rise, sEnd - beat, sEnd - beat - from, 0.75);
      roll(b, clap, song, b.grid.bar(s.startBar + s.bars - Math.min(2, buildBars)), sEnd - beat, 0.25, 0.8);
      reverseSwell(b, crash, sEnd, beat * 2, 0.5);
    }
    if (isA && s.bars >= 16) reverseSwell(b, crash, sEnd, beat * 2, 0.4);
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : { A: s.repeat ? 'groove ′' : 'groove', B: 'breakdown', D: 'drop' }[s.part] ?? s.part }, chords.length ? chords : [chord(tonic, 'm7')], flats);
  }

  return b.build({
    key: keyName(tonic, mode),
    progression: `one chord, ${keyName(tonic, mode)}${moves ? ` · the drop moves to ${['', '♭II', '', '', '', 'iv', '', '', '♭VI', '', '♭VII'][moveTo]} and back` : ''} · acid in long filter arcs`,
    fx: trackFx({
      gain: 0.4,
      lowpass: cutOpen,
      highpass: 28,
      q: 0.8,
      wow: G * 0.8 + W * 0.8,
      wowRate: 0.3,
      flutter: 0,
      drive: 0.12 + G * 0.35,
      delay: { time: beat * 0.75, feedback: 0.42, tone: 2600, wet: 0.35 },
      reverbTone: 5000,
      reverbLevel: 1.15,
    }),
  });
}

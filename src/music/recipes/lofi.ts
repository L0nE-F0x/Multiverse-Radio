// Lo-fi hip-hop family: jazzy extended chords with smooth voice leading on warm keys,
// lazy swung boom-bap, round bass, sparse motifs, vinyl and tape. Four flavours:
// hiphop (classic), rain (melancholy, rain on the window), slow (half-asleep),
// glass (bright, crystalline, lydian).

import type { TrackRequest } from '../index';
import { rngFor, type Rng } from '../rng';
import type { InstrumentSpec, SamplePatch, Score, SynthPatch } from '../score';
import {
  bassPc,
  chord,
  keyName,
  parseProgression,
  pc,
  prefersFlats,
  SCALES,
  scalePcs,
  voiceChord,
  type Chord,
} from '../theory';
import {
  bassNote,
  chordSpans,
  layout,
  lerp,
  makeMotif,
  pickBpm,
  realizeMotif,
  resolveTweaks,
  ScoreBuilder,
  trackFx,
  varyMotif,
  vel,
  weirdDetune,
  type ChordSpan,
  type MotifNote,
} from './common';
import { LOFI_GLASS, LOFI_MAJOR, LOFI_MINOR } from './templates';

type Variant = 'lofi-hiphop' | 'lofi-rain' | 'lofi-slow' | 'lofi-glass';

interface VariantDef {
  bpm: [number, number];
  minorChance: number;
  swing: [number, number];
  keys: [SamplePatch, number][];
  leads: [SamplePatch | SynthPatch, number][];
  basses: [SamplePatch, number][];
  defaults: { density: number; grit: number; weirdness: number; brightness: number };
  /** Prefer two-bar chords. */
  slowHarmony: number;
  rain: boolean;
  pad: SynthPatch | null;
}

const VARIANTS: Record<Variant, VariantDef> = {
  'lofi-hiphop': {
    bpm: [72, 90],
    minorChance: 0.35,
    swing: [0.55, 0.62],
    keys: [['ep', 5], ['felt-piano', 3], ['wurli', 1.5], ['nylon', 1.5]],
    leads: [['soft-lead', 3], ['vibes', 2], ['ep-bright', 2], ['nylon', 1], ['flute', 1.5], ['kalimba', 1]],
    basses: [['bass-round', 5], ['bass-upright', 3], ['bass-sub', 2]],
    defaults: { density: 0.5, grit: 0.45, weirdness: 0.12, brightness: 0.45 },
    slowHarmony: 0.1,
    rain: false,
    pad: null,
  },
  'lofi-rain': {
    bpm: [66, 80],
    minorChance: 0.6,
    swing: [0.55, 0.6],
    keys: [['felt-piano', 5], ['ep', 3], ['nylon', 2]],
    leads: [['soft-lead', 2], ['felt-piano', 2], ['vibes', 2], ['flute', 1], ['nylon', 1]],
    basses: [['bass-round', 4], ['bass-upright', 3], ['bass-sub', 2]],
    defaults: { density: 0.42, grit: 0.55, weirdness: 0.1, brightness: 0.38 },
    slowHarmony: 0.3,
    rain: true,
    pad: null,
  },
  'lofi-slow': {
    bpm: [56, 68],
    minorChance: 0.3,
    swing: [0.56, 0.63],
    keys: [['ep', 4], ['felt-piano', 4], ['wurli', 1]],
    leads: [['soft-lead', 3], ['vibes', 2], ['kalimba', 1.5], ['musicbox', 1]],
    basses: [['bass-round', 4], ['bass-sub', 3], ['bass-upright', 2]],
    defaults: { density: 0.32, grit: 0.45, weirdness: 0.15, brightness: 0.4 },
    slowHarmony: 0.6,
    rain: false,
    pad: 'pad-warm',
  },
  'lofi-glass': {
    bpm: [70, 88],
    minorChance: 0.15,
    swing: [0.53, 0.58],
    keys: [['ep-bright', 3], ['vibes', 2], ['celesta', 1.5], ['glass', 2]],
    leads: [['glass', 3], ['musicbox', 2], ['kalimba', 2], ['celesta', 1.5]],
    basses: [['bass-round', 3], ['bass-sub', 3]],
    defaults: { density: 0.5, grit: 0.25, weirdness: 0.3, brightness: 0.75 },
    slowHarmony: 0.25,
    rain: false,
    pad: 'pad-glass',
  },
};

const NAMES: Record<string, string> = {
  ep: 'Electric piano',
  'ep-bright': 'Bright electric piano',
  wurli: 'Reed piano',
  'felt-piano': 'Felt piano',
  piano: 'Piano',
  nylon: 'Nylon guitar',
  vibes: 'Vibraphone',
  celesta: 'Celesta',
  glass: 'Glass harp',
  musicbox: 'Music box',
  kalimba: 'Kalimba',
  'soft-lead': 'Whistle synth',
  flute: 'Flute',
  'bass-round': 'Round bass',
  'bass-upright': 'Upright bass',
  'bass-sub': 'Sub bass',
  'pad-warm': 'Warm pad',
  'pad-glass': 'Glass pad',
};

const SYNTH_LEADS = new Set<string>(['soft-lead', 'flute']);

/** Kick and snare steps (16ths) for one bar, plus a second-bar variant. */
const DRUM_PATTERNS: { kick: number[]; kick2?: number[]; snare: number[] }[] = [
  { kick: [0, 10], kick2: [0, 7, 10], snare: [4, 12] },
  { kick: [0, 7, 10], snare: [4, 12] },
  { kick: [0, 3, 10], kick2: [0, 3, 8, 10], snare: [4, 12] },
  { kick: [0, 6, 8], kick2: [0, 6, 8, 14], snare: [4, 12] },
  { kick: [0, 9, 11], snare: [4, 12] },
  { kick: [0, 2, 10], kick2: [0, 2, 7, 10], snare: [4, 12] },
  { kick: [0, 7, 9], kick2: [0, 7, 9, 15], snare: [4, 12] },
  { kick: [0, 10, 13], snare: [4, 12] },
];

/** Half-time pattern for the slow variant: snare on 3. */
const HALF_TIME = [
  { kick: [0, 7, 11], snare: [8] },
  { kick: [0, 3, 10], snare: [8] },
  { kick: [0, 10], kick2: [0, 10, 14], snare: [8] },
];

type CompStyle = 'hold' | 'push' | 'stabs' | 'roll' | 'arp';

export function composeLofi(req: TrackRequest): Score {
  const variant = req.recipe as Variant;
  const V = VARIANTS[variant];
  const rng = rngFor(req.seed, 'lofi', variant);
  const tweaks = resolveTweaks(req, { bpm: (V.bpm[0] + V.bpm[1]) / 2, ...V.defaults });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  // ── Song identity ──
  const tonic = rng.int(0, 11);
  const minor = rng.chance(V.minorChance);
  const pool = minor ? LOFI_MINOR : variant === 'lofi-glass' ? [...LOFI_GLASS, ...LOFI_GLASS, ...LOFI_MAJOR] : LOFI_MAJOR;
  const tplA = rng.pick(pool);
  let tplB = rng.pick(pool);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(pool);
  const sameLoop = rng.chance(0.18); // some songs ride one loop and vary the arrangement
  const progA = stretch(parseProgression(tplA.prog, tonic), rng.chance(V.slowHarmony));
  // Same-loop songs still get a fresh B: the loop starts from its middle.
  const progB = sameLoop
    ? [...progA.slice(Math.floor(progA.length / 2)), ...progA.slice(0, Math.floor(progA.length / 2))]
    : stretch(parseProgression(tplB.prog, tonic), rng.chance(V.slowHarmony));
  if (W > 0.45) weirdSubstitute(rng, progB, tonic, W);
  const keyScale = scalePcs(tonic, SCALES[tplA.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, V.bpm);
  const swing = rng.range(V.swing[0], V.swing[1]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B'] });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks);
  const beat = b.beat;

  // ── Instruments ──
  const keysPatch = rng.weighted(V.keys);
  const isEp = keysPatch === 'ep' || keysPatch === 'ep-bright' || keysPatch === 'wurli';
  const keys = b.inst({
    kind: 'sample',
    patch: keysPatch,
    name: NAMES[keysPatch] ?? keysPatch,
    gain: keysPatch === 'nylon' ? 0.95 : 0.8,
    reverb: 0.22 + (variant === 'lofi-slow' ? 0.12 : 0),
    pump: 0.22,
    tremolo: isEp ? { rate: rng.range(3.6, 5.2), depth: rng.range(0.25, 0.45) } : keysPatch === 'vibes' ? { rate: 5, depth: 0.3 } : undefined,
    lowpass: lerp(3200, 8000, B),
  });
  let leadPatch = rng.weighted(V.leads);
  if (leadPatch === keysPatch) leadPatch = variant === 'lofi-glass' ? 'musicbox' : 'soft-lead';
  const leadIsSynth = SYNTH_LEADS.has(leadPatch);
  const leadSpec: InstrumentSpec = leadIsSynth
    ? { kind: 'synth', patch: leadPatch as SynthPatch, name: NAMES[leadPatch] ?? leadPatch, gain: 0.55, reverb: 0.3, pump: 0.15, pan: rng.range(-0.25, 0.25), detune: weirdDetune(rng, W, 25) }
    : { kind: 'sample', patch: leadPatch as SamplePatch, name: NAMES[leadPatch] ?? leadPatch, gain: 0.42, reverb: 0.32, pump: 0.15, pan: rng.range(-0.3, 0.3), detune: weirdDetune(rng, W, 25), lowpass: lerp(3500, 9000, B) };
  if (leadPatch === 'vibes') leadSpec.tremolo = { rate: 5.5, depth: 0.35 };
  const lead = b.inst(leadSpec);
  const [leadLo, leadHi] = leadRange(leadPatch);
  const bassPatch = rng.weighted(V.basses);
  const bass = b.inst({ kind: 'sample', patch: bassPatch, name: NAMES[bassPatch] ?? bassPatch, gain: bassPatch === 'bass-sub' ? 0.34 : 0.4, pump: 0.12, lowpass: 1400 });
  const pad = V.pad ? b.inst({ kind: 'synth', patch: V.pad, name: NAMES[V.pad] ?? V.pad, gain: 0.32, reverb: 0.45, pump: 0.25, pan: 0 }) : -1;

  const softKit = variant === 'lofi-slow' || variant === 'lofi-glass' || rng.chance(0.3);
  const kick = b.inst({ kind: 'sample', patch: softKit ? 'kick-soft' : 'kick-lofi', name: 'Kick', gain: 0.5 });
  const snarePatch: SamplePatch = variant === 'lofi-glass' ? 'rim' : rng.weighted([['snare-lofi', 5], ['rim', 2], ['clap', 1]]);
  const snare = b.inst({ kind: 'sample', patch: snarePatch, name: snarePatch === 'rim' ? 'Rimshot' : snarePatch === 'clap' ? 'Clap' : 'Snare', gain: snarePatch === 'rim' ? 0.75 : 0.62, reverb: 0.14, pan: 0.04 });
  const ghost = snarePatch === 'snare-lofi' ? snare : b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Ghost snare', gain: 0.45, pan: 0.04 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.32, pan: 0.18, lowpass: lerp(7000, 12000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.18, pan: 0.18, lowpass: lerp(7000, 12000, B) });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.2, pan: -0.25 });
  const vinyl = b.inst({ kind: 'sample', patch: 'vinyl', name: 'Vinyl', gain: 0.1 + 0.28 * G });
  const rain = V.rain ? b.inst({ kind: 'sample', patch: 'rain', name: 'Rain', gain: 0.5 }) : -1;

  // ── Groove choices ──
  const patterns = variant === 'lofi-slow' && rng.chance(0.65) ? HALF_TIME : DRUM_PATTERNS;
  const patA = rng.pick(patterns);
  const patB = rng.chance(0.5) ? patA : rng.pick(patterns);
  const drag = rng.range(0.008, 0.024); // a lazy, late snare
  const hat16 = D > 0.62 || rng.chance(D * 0.35);
  const useShaker = rng.chance(0.3 + D * 0.3);
  const compA: CompStyle = pickComp(rng, keysPatch);
  const compB: CompStyle = rng.chance(0.5) ? compA : pickComp(rng, keysPatch);
  const bassStyle = rng.int(0, 4);

  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  const vLow = keysPatch === 'nylon' ? 50 : variant === 'lofi-glass' ? 57 : 52;
  const vHigh = vLow + 24;
  const voices = keysPatch === 'felt-piano' ? 5 : 4;

  const motifA = makeMotif(rng, 8, 0.15 + D * 0.45, { restTail: 1.5, maxNotes: 4 });
  const motifB = makeMotif(rng, 8, 0.1 + D * 0.4, { restTail: 2, maxNotes: 4 });
  const anchor = Math.round((leadLo + leadHi) / 2);

  // A tape stop at one section boundary, now and then (more in weirder dimensions).
  const bodySections = plan.filter((s) => s.part !== 'intro' && s.part !== 'outro');
  const tapeStopAt = W > 0.2 && rng.chance(W * 0.7) && bodySections.length > 2 ? rng.int(0, bodySections.length - 2) : -1;

  const cutoff = lerp(3600, 12000, B) * (1.1 - 0.3 * G);

  let bodyIndex = -1;
  for (const s of plan) {
    const isIntro = s.part === 'intro';
    const isOutro = s.part === 'outro';
    if (!isIntro && !isOutro) bodyIndex++;
    const prog = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    if (isOutro) resolveEnding(spans, tonic, minor);
    b.section(s, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);

    // Filter moves: intro opens up, B drops then opens, outro closes.
    if (isIntro) {
      b.auto('cutoff', 0, 700, 0);
      b.auto('cutoff', 0.05, cutoff, (sEnd - sT) / 3);
    } else if (isOutro) {
      b.auto('cutoff', sT + beat, Math.max(900, cutoff * 0.35), (sEnd - sT) / 2.5);
    } else if (s.part === 'B' && s.repeat === 0 && rng.chance(0.6)) {
      b.auto('cutoff', sT, 1100, 0.02);
      b.auto('cutoff', sT + 2 * fit.barDur - beat, cutoff, fit.barDur * 0.6);
    } else {
      b.auto('cutoff', sT, cutoff, 0.3);
    }

    // ── Keys ──
    const style = s.part === 'B' ? compB : compA;
    let anticipated = false;
    spans.forEach((span, k) => {
      const next = spans[k + 1];
      const v = voiceChord(span.chord, voicing, { low: vLow, high: vHigh, voices });
      voicing = v;
      const last = isOutro && k === spans.length - 1;
      if (last) {
        strum(b, keys, rng, span.t, b.end - span.t - 0.3, v, 0.5, 0.05);
        if (pad >= 0) padChord(b, pad, span.t, b.end - span.t - 0.5, v);
        return;
      }
      if (pad >= 0 && !isIntro) padChord(b, pad, span.t, span.dur, v);
      comp(b, rng, keys, span, v, style, anticipated, D);
      anticipated = false;
      if (style === 'push' && next && span.beats >= 4 && rng.chance(0.55) && !(isOutro && k === spans.length - 2)) {
        const nv = voiceChord(next.chord, v, { low: vLow, high: vHigh, voices });
        strum(b, keys, rng, b.grid.at(span.bar, span.beats - 0.5), next.dur + beat * 0.4, nv, 0.5, 0.012);
        anticipated = true;
      }
    });
    // Reverse swell into the next section.
    if (!isOutro && s.startBar + s.bars < fit.bars && rng.chance(0.3 + W * 0.5) && voicing) {
      const top = (voicing as number[]).slice(-3);
      for (const p of top) b.note(keys, sEnd - beat * 2, beat * 2, p, 0.45, { rev: true });
    }

    // ── Bass ──
    if (!isIntro) {
      spans.forEach((span, k) => {
        if (isOutro && k > 1) return;
        const root = bassNote(bassPc(span.chord), prevBass, 31, 46);
        prevBass = root;
        const next = spans[k + 1];
        const nextRoot = next ? bassNote(bassPc(next.chord), root, 31, 46) : root;
        bassLine(b, rng, bass, span, root, nextRoot, isOutro ? 3 : bassStyle, s.part === 'B' && s.repeat === 0 && span.bar - s.startBar < 2);
      });
    }

    // ── Drums ──
    if (!isIntro && !isOutro) {
      const pat = s.part === 'B' ? patB : patA;
      const dropKickBars = s.part === 'B' && s.repeat === 0 && rng.chance(0.5) ? 2 : 0;
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        const fillBar = k % 4 === 3;
        const lastBar = k === s.bars - 1;
        const fill = fillBar ? rng.pick(['none', 'roll', 'drop', 'open'] as const) : 'none';
        const kicks = (k % 2 === 1 && pat.kick2) || pat.kick;
        if (k >= dropKickBars) {
          for (const st of kicks) {
            if (fill === 'drop' && st >= 8) continue;
            const t = b.grid.step(bar, st) + rng.gauss() * 0.003;
            b.hit(kick, t, vel(rng, st === 0 ? 0.9 : 0.72));
            b.pump(t);
          }
        }
        for (const st of pat.snare) {
          if (fill === 'drop' && st >= 12 && lastBar) continue;
          b.hit(snare, b.grid.step(bar, st) + drag + rng.gauss() * 0.004, vel(rng, 0.78));
        }
        // Ghost notes.
        if (D > 0.3) {
          for (const st of [7, 9, 15]) if (rng.chance((D - 0.3) * 0.6)) b.hit(ghost, b.grid.step(bar, st) + drag * 0.5, vel(rng, 0.2, 0.08));
        }
        if (fill === 'roll') for (const [j, st] of [13, 14, 15].entries()) b.hit(ghost, b.grid.step(bar, st) + drag * 0.5, 0.25 + j * 0.12);
        // Hats.
        const sixteenths = hat16 || (s.part === 'B' && s.repeat > 0);
        for (let st = 0; st < 16; st += sixteenths ? 1 : 2) {
          const openHere = (fill === 'open' && st === 14) || (k % 2 === 1 && st === 14 && rng.chance(0.25));
          if (openHere) {
            b.hit(ohat, b.grid.step(bar, st) + rng.gauss() * 0.005, vel(rng, 0.5));
            continue;
          }
          if (fill === 'drop' && st >= 12 && lastBar) continue;
          if (rng.chance(0.06)) continue; // a missed hit sounds human
          const accent = st % 4 === 0 ? 0.62 : st % 2 === 0 ? 0.42 : 0.24;
          b.hit(hat, b.grid.step(bar, st) + rng.gauss() * 0.005, vel(rng, accent, 0.1), 60, 0.3);
        }
        if (useShaker && (s.part === 'B' || s.repeat > 0)) {
          for (let st = 0; st < 16; st++) b.hit(shaker, b.grid.step(bar, st) + rng.gauss() * 0.004, vel(rng, st % 2 ? 0.25 : 0.4, 0.08), 60, 0.3);
        }
      }
      if (bodyIndex === tapeStopAt) {
        const tsAt = sEnd - beat * 1.5;
        b.auto('tapestop', tsAt, beat * 1.4, 0);
        b.auto('tapestop', sEnd, 0, 0);
      }
    } else if (isIntro && s.bars >= 2) {
      // Hats tiptoe in during the last intro bar.
      const bar = s.startBar + s.bars - 1;
      for (let st = 8; st < 16; st += 2) b.hit(hat, b.grid.step(bar, st) + rng.gauss() * 0.004, vel(rng, 0.3 + (st - 8) * 0.03), 60, 0.3);
    }

    // ── Lead ──
    const leadOn = !isIntro && !isOutro && (s.repeat > 0 || s.part === 'B' || rng.chance(0.35));
    if (leadOn) {
      const base = s.part === 'B' ? motifB : motifA;
      const motif = s.repeat > 1 ? varyMotif(rng, base, 0.4) : base;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const phrase = ph / 2;
        if (phrase === 3 && rng.chance(0.6)) continue; // leave room to breathe
        let m: MotifNote[] = motif;
        if (phrase === 2) m = varyMotif(rng, motif, 0.5);
        if (phrase === 3) m = motif.slice(0, Math.max(1, Math.ceil(motif.length / 3)));
        const notes = realizeMotif(m, 0, beat, anchor + (s.repeat > 1 && rng.chance(0.3) ? 5 : 0), spans, keyScale, leadLo, leadHi, b.grid, s.startBar + ph);
        for (const n of notes) {
          let p = n.p;
          if (W > 0.4 && rng.chance((W - 0.4) * 0.4)) p += rng.pick([-0.3, 0.25, 0.5]);
          const t = n.t + rng.gauss() * 0.006;
          b.note(lead, t, n.d, p, vel(rng, n.strong ? 0.62 : 0.5), leadIsSynth && rng.chance(0.15) ? { from: p - 1, glide: 0.06 } : {});
          if (W > 0.5 && rng.chance((W - 0.5) * 0.3)) {
            // A stutter from somewhere else.
            for (let r = 1; r <= 3; r++) b.note(lead, t + r * beat * 0.125, beat * 0.1, p + 12, 0.3);
          }
        }
      }
    }
  }

  // Textures run the whole track.
  b.note(vinyl, 0, b.end, 60, 1);
  if (rain >= 0) b.note(rain, 0, b.end, 60, 1);

  const progression = sameLoop ? tplA.prog : `${tplA.prog} / ${tplB.prog}`;
  return b.build({
    key: keyName(tonic, tplA.scale),
    progression,
    fx: trackFx({
      gain: 0.3,
      lowpass: cutoff,
      highpass: 38,
      q: 0.6,
      wow: 0.5 + G * 2.2 + W * 1.2,
      wowRate: rng.range(0.3, 0.6),
      flutter: 0.02 + G * 0.06,
      drive: 0.12 + G * 0.45,
      reverbTone: 4200,
      reverbLevel: variant === 'lofi-slow' ? 1.3 : 1,
    }),
  });
}

function leadRange(patch: string): [number, number] {
  switch (patch) {
    case 'musicbox':
      return [72, 93];
    case 'glass':
    case 'celesta':
      return [67, 89];
    case 'nylon':
    case 'felt-piano':
      return [62, 81];
    case 'flute':
      return [67, 86];
    case 'kalimba':
      return [64, 84];
    default:
      return [65, 84];
  }
}

function pickComp(rng: Rng, patch: string): CompStyle {
  if (patch === 'nylon' || patch === 'celesta' || patch === 'glass') return rng.weighted([['arp', 4], ['roll', 2], ['hold', 1]]);
  if (patch === 'felt-piano') return rng.weighted([['roll', 3], ['hold', 2], ['arp', 2], ['push', 2]]);
  if (patch === 'vibes') return rng.weighted([['hold', 2], ['stabs', 2], ['roll', 1]]);
  return rng.weighted([['hold', 3], ['push', 3], ['stabs', 2], ['roll', 1.5]]);
}

/** Slows the harmonic rhythm: each chord lasts two bars. */
function stretch(prog: Chord[][], slow: boolean): Chord[][] {
  if (!slow || prog.length > 4) return prog;
  return prog.flatMap((bar) => [bar, bar]);
}

/** Other dimensions resolve differently: swap a chord for a chromatic-mediant cousin. */
function weirdSubstitute(rng: Rng, prog: Chord[][], tonic: number, w: number): void {
  if (!rng.chance(w * 0.8)) return;
  const bar = rng.int(1, prog.length - 1);
  const choices = [chord(tonic + 8, 'maj7#11'), chord(tonic + 3, 'maj9'), chord(tonic + 1, 'maj7#11'), chord(tonic + 6, '7#11'), chord(tonic + 4, '7#9')];
  prog[bar] = [rng.pick(choices)];
}

/** The outro lands home: the final chord becomes the tonic. */
function resolveEnding(spans: ChordSpan[], tonic: number, minor: boolean): void {
  const last = spans[spans.length - 1];
  if (!last) return;
  last.chord = minor ? chord(tonic, 'm9') : chord(tonic, 'maj9');
  // Make the final chord span the whole last bar.
  const sameBar = spans.filter((s) => s.bar === last.bar);
  if (sameBar.length > 1) {
    const first = sameBar[0]!;
    first.chord = last.chord;
    first.dur += last.dur;
    first.beats += last.beats;
    spans.splice(spans.indexOf(last), 1);
  }
  // A dominant before home.
  const prev = spans[spans.length - 2];
  if (prev && pc(prev.chord.root - tonic) !== 7 && pc(prev.chord.root - tonic) !== 2) {
    prev.chord = chord(tonic + 7, minor ? '7b9' : '9sus');
  }
}

function strum(b: ScoreBuilder, inst: number, rng: Rng, t: number, d: number, notes: readonly number[], v: number, spread: number): void {
  notes.forEach((p, k) => {
    const top = k === notes.length - 1;
    b.note(inst, t + k * spread * rng.range(0.7, 1.2) + rng.gauss() * 0.004, d - k * spread, p, vel(rng, v + (top ? 0.06 : 0)));
  });
}

function padChord(b: ScoreBuilder, inst: number, t: number, d: number, notes: readonly number[]): void {
  for (const p of notes.slice(0, 3)) b.note(inst, t, d + 0.05, p, 0.5);
}

function comp(b: ScoreBuilder, rng: Rng, inst: number, span: ChordSpan, v: readonly number[], style: CompStyle, anticipated: boolean, density: number): void {
  const beat = b.beat;
  const at = (x: number) => b.grid.at(span.bar, span.beat + x);
  const base = 0.46 + density * 0.12;
  switch (style) {
    case 'hold':
    case 'push':
      if (!anticipated) strum(b, inst, rng, at(0), span.dur - beat * 0.15, v, base, 0.01);
      if (span.beats >= 4 && rng.chance(0.25 + density * 0.3)) strum(b, inst, rng, at(2.5), beat * 0.7, v.slice(0, -1), base - 0.12, 0.008);
      break;
    case 'stabs': {
      const pattern = span.beats >= 4 ? rng.pick([[0, 1.5, 2.5], [0, 1.5, 3], [0, 0.75, 2], [0, 2, 3.5]]) : [0, 1.5];
      pattern.forEach((x, k) => {
        const nextX = pattern[k + 1] ?? span.beats;
        const len = Math.max(0.4, (nextX - x) * (k === pattern.length - 1 ? 0.95 : 0.7));
        if (k === 0 && anticipated) return;
        strum(b, inst, rng, at(x), len * beat, k === 0 ? v : v.slice(0, -1), base - (k ? 0.08 : 0), 0.006);
      });
      break;
    }
    case 'roll':
      if (!anticipated) strum(b, inst, rng, at(0), span.dur - beat * 0.1, v, base, rng.range(0.035, 0.07));
      break;
    case 'arp': {
      const order = rng.pick([[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 2, 3, 1, 2], [0, 1, 2, 3, 4, 3, 2, 1]]);
      const steps = Math.round(span.beats * 2);
      for (let k = 0; k < steps; k++) {
        if (k > 0 && rng.chance(0.15 - density * 0.1)) continue;
        const p = v[order[k % order.length]! % v.length]!;
        b.note(inst, at(k * 0.5) + rng.gauss() * 0.004, beat * 1.6, p, vel(rng, base - 0.04 + (k === 0 ? 0.08 : 0)));
      }
      break;
    }
  }
}

function bassLine(b: ScoreBuilder, rng: Rng, inst: number, span: ChordSpan, root: number, nextRoot: number, style: number, sparse: boolean): void {
  const beat = b.beat;
  const at = (x: number) => b.grid.at(span.bar, span.beat + x) + rng.gauss() * 0.003;
  const fifth = root + 7 <= 50 ? root + 7 : root - 5;
  const approach = rng.chance(0.6) ? nextRoot - 1 : nextRoot + 1;
  type Hit = [number, number, number];
  const patterns: Hit[][] = [
    [[0, 1.5, root], [2.5, 0.5, root], [3, 0.75, fifth]],
    [[0, 2.75, root], [3.5, 0.4, approach]],
    [[0, 0.75, root], [1.5, 1, root], [3, 0.4, root + 12], [3.5, 0.4, approach]],
    [[0, 3.8, root]],
    [[0, 1, root], [1.75, 0.5, root], [2.5, 1.2, fifth]],
  ];
  let hits = patterns[style % patterns.length]!;
  if (span.beats < 4) hits = rng.chance(0.5) ? [[0, span.beats * 0.9, root]] : [[0, span.beats - 0.6, root], [span.beats - 0.5, 0.4, approach]];
  if (sparse) hits = [[0, span.beats * 0.9, root]];
  for (const [x, len, p] of hits) {
    if (x >= span.beats) continue;
    b.note(inst, at(x), Math.min(len, span.beats - x) * beat, p, vel(rng, x === 0 ? 0.78 : 0.62));
  }
}

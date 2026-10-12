// Baroque: harpsichord counterpoint. A walking continuo in eighths, sixteenth-note
// figuration sequenced through circle-of-fifths harmony, terraced dynamics, cadences
// with a trill — performed with suspicious robotic precision.

import type { TrackRequest } from '../index';
import { rngFor, type Rng } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, chordScale, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, stepInSet } from '../theory';
import { bassNote, chordSpans, layout, lerp, pickBpm, resolveTweaks, ScoreBuilder, trackFx, weirdDetune, type ChordSpan } from './common';
import { BAROQUE_MAJOR, BAROQUE_MINOR } from './templates';

type Figure = 'arp' | 'turn' | 'scale' | 'pedal';

export function composeBaroque(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'baroque');
  const tweaks = resolveTweaks(req, { bpm: 100, density: 0.6, grit: 0.05, weirdness: 0.2, brightness: 0.55 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const minor = rng.chance(0.4);
  const pool = minor ? BAROQUE_MINOR : BAROQUE_MAJOR;
  const tplA = rng.pick(pool);
  let tplB = rng.pick(pool);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(pool);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'harmonicMinor' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [84, 116]);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A'], intro: 0, outro: 1 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks);
  const beat = b.beat;

  const det = weirdDetune(rng, W, 25);
  const upper = b.inst({ kind: 'sample', patch: 'harpsichord', name: 'Harpsichord (upper)', gain: 0.55, pan: 0.18, reverb: 0.22, detune: det, lowpass: lerp(5000, 12000, B) });
  const lower = b.inst({ kind: 'sample', patch: 'harpsichord', name: 'Harpsichord (continuo)', gain: 0.6, pan: -0.18, reverb: 0.2, detune: det, lowpass: lerp(3500, 8000, B) });
  const cello = b.inst({ kind: 'sample', patch: 'pizz', name: 'Bass strings', gain: 0.5, pan: -0.05, reverb: 0.2 });
  const robot = b.inst({ kind: 'synth', patch: 'chip-square', name: 'Robot doubling', gain: 0.25, pan: 0.3, reverb: 0.2 });

  const figures: Figure[] = ['arp', 'turn', 'scale', 'pedal'];
  let lastTop = nearestInSet(76, keyScale);
  let prevBass: number | null = null;

  for (const s of plan) {
    const outro = s.part === 'outro';
    const prog = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    if (outro) {
      // Final chord, Picardy third in minor.
      spans.forEach((sp) => (sp.chord = chord(tonic, '')));
    } else {
      // Cadence: the section's last two bars are V → I.
      const n = spans.length;
      if (n >= 2) {
        spans[n - 2]!.chord = chord(tonic + 7, '7');
        spans[n - 1]!.chord = chord(tonic, minor ? 'm' : '');
      }
    }
    b.section(s, spans.map((x) => x.chord), flats);
    // Terraced dynamics: B (and repeats of A) are an echo, softer.
    const loud = s.part === 'A' && s.repeat % 2 === 0;
    const v = loud ? 0.72 : 0.5;
    const figure = rng.pick(figures);
    const robotOn = W > 0.25 && rng.chance(W * 0.6) && !outro;

    spans.forEach((span, k) => {
      const last = outro || k === spans.length - 1;
      const next = spans[k + 1];
      // ── Continuo: eighths walking toward the next root ──
      const root = bassNote(bassPc(span.chord), prevBass, 36, 52);
      const target = next ? bassNote(bassPc(next.chord), root, 36, 52) : root;
      const line = outro ? [root] : continuo(rng, span, root, target, keyScale);
      line.forEach((p, j) => {
        b.note(lower, span.t + j * beat * 0.5, (outro ? 3 : 0.45) * beat, p, v - 0.04 + (j % 2 ? 0 : 0.05));
        if (j % 4 === 0 && (s.part === 'B' || s.repeat > 0 || outro)) b.note(cello, span.t + j * beat * 0.5, (outro ? 3 : 1.9) * beat, p - 12 >= 28 ? p - 12 : p, v);
      });
      prevBass = line[line.length - 1]!;

      // ── Upper voice ──
      if (outro) {
        const tones = chordPcs(span.chord);
        let p = nearestInSet(64, tones);
        for (let j = 0; j < 5; j++) {
          b.note(upper, span.t + j * 0.035, b.end - span.t - 0.4, p, 0.65);
          p = nearestInSet(p + 3, tones);
        }
        return;
      }
      if (k === spans.length - 2) {
        // Cadential trill on the leading tone over V, resolving to the tonic.
        const lead = nearestInSet(lastTop, [pc(tonic - 1)]);
        const n = Math.round(span.beats * 8) - 4;
        for (let j = 0; j < n; j++) b.note(upper, span.t + j * beat * 0.125, beat * 0.11, j % 2 ? lead : lead + 1, v - 0.08);
        b.note(upper, span.t + n * beat * 0.125, beat * 0.5, lead, v);
        lastTop = lead + 1;
        return;
      }
      if (last) {
        b.note(upper, span.t, beat * 2, lastTop, v + 0.05);
        return;
      }
      const notes = figuration(rng, figure, span, lastTop, keyScale, D);
      notes.forEach((p, j) => {
        b.note(upper, span.t + j * beat * 0.25, beat * 0.24, p, v - 0.06 + (j % 4 === 0 ? 0.08 : 0));
        if (robotOn && j % 2 === 0) b.note(robot, span.t + j * beat * 0.25, beat * 0.2, p + 12, 0.5);
      });
      lastTop = notes[notes.length - 1] ?? lastTop;
    });
  }

  return b.build({
    key: keyName(tonic, minor ? 'minor' : 'major'),
    progression: `${tplA.prog} / ${tplB.prog}`,
    fx: trackFx({
      gain: 0.99,
      lowpass: lerp(7000, 16000, B),
      highpass: 45,
      wow: G * 1.5,
      wowRate: 0.4,
      flutter: 0,
      drive: G * 0.3,
      reverbTone: 7000,
      reverbLevel: 1.1,
    }),
  });
}

/** Eight eighth-notes: root, then steps and chord tones heading for the next root. */
function continuo(rng: Rng, span: ChordSpan, root: number, target: number, keyScale: readonly number[]): number[] {
  const n = Math.round(span.beats * 2);
  const tones = chordPcs(span.chord);
  const style = rng.int(0, 2);
  const out: number[] = [root];
  let cur = root;
  for (let j = 1; j < n; j++) {
    let p: number;
    if (style === 0 && j % 2 === 1) p = cur + 12 <= 55 ? cur + 12 : cur; // octave leaps
    else if (style === 0) p = root;
    else {
      const remaining = n - j;
      const dir = Math.sign(target - cur) || 1;
      p = remaining <= 2 ? stepInSet(cur, keyScale, dir) : stepInSet(cur, rng.chance(0.5) ? keyScale : tones, dir);
    }
    if (p < 33) p += 12;
    if (p > 55) p -= 12;
    out.push(p);
    cur = p;
  }
  return out;
}

/** Sixteen sixteenths of melodic figuration over one chord, starting near `from`. */
function figuration(rng: Rng, figure: Figure, span: ChordSpan, from: number, keyScale: readonly number[], density: number): number[] {
  const n = Math.round(span.beats * 4);
  const tones = chordPcs(span.chord);
  const scale = chordScale(span.chord, keyScale);
  const start = clampRange(nearestInSet(from, tones), 64, 79);
  const out: number[] = [];
  switch (figure) {
    case 'arp': {
      // Up and down the chord in groups of four.
      let p = start;
      let dir = start > 76 ? -1 : 1;
      for (let j = 0; j < n; j++) {
        out.push(p);
        if (j % 8 === 7) dir = -dir;
        p = nextTone(p, tones, dir);
        if (p > 88 || p < 62) {
          dir = -dir;
          p = nextTone(p, tones, dir);
          p = nextTone(p, tones, dir);
        }
      }
      break;
    }
    case 'turn': {
      // Neighbour-note turns around successive chord tones.
      let c = start;
      for (let beat = 0; beat < n / 4; beat++) {
        out.push(c, stepInSet(c, scale, 1), c, stepInSet(c, scale, -1));
        c = nextTone(c, tones, beat % 2 ? -1 : 1);
      }
      break;
    }
    case 'scale': {
      let p = start;
      const dir = start > 74 ? -1 : 1;
      for (let j = 0; j < n; j++) {
        out.push(p);
        p = stepInSet(p, scale, j < n / 2 ? dir : -dir);
      }
      break;
    }
    case 'pedal': {
      // Bariolage: a repeated high chord tone against a descending line.
      const top = clampRange(nearestInSet(start + 5, tones), 70, 88);
      let p = stepInSet(top, scale, -1);
      for (let j = 0; j < n; j++) {
        if (j % 2 === 0) out.push(top);
        else {
          out.push(p);
          p = stepInSet(p, scale, -1);
        }
      }
      break;
    }
  }
  // Sparser performances rest on some off-beat sixteenths.
  if (density < 0.35) return out.map((p, j) => (j % 4 === 3 && rng.chance(0.5) ? out[j - 1]! : p));
  return out;
}

function nextTone(p: number, tones: readonly number[], dir: number): number {
  let q = p + dir;
  while (!tones.includes(pc(q))) q += dir;
  return q;
}

function clampRange(p: number, lo: number, hi: number): number {
  while (p > hi) p -= 12;
  while (p < lo) p += 12;
  return p;
}


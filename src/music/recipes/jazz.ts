// Lounge jazz: a 32-bar AABA tune. Walking upright bass, ride "spang-a-lang" (or brushes
// for ballads), rootless piano comping, and a vibraphone head → solo chorus → head out.

import type { TrackRequest } from '../index';
import { rngFor, type Rng } from '../rng';
import type { SamplePatch, Score, SynthPatch } from '../score';
import { bassPc, chord, chordPcs, chordScale, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord, type Chord } from '../theory';
import { bassNote, chordSpans, layout, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, vel, weirdDetune, type ChordSpan, type MotifNote } from './common';
import { JAZZ_A, JAZZ_B, JAZZ_MINOR } from './templates';

export function composeJazz(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'lounge-jazz');
  const tweaks = resolveTweaks(req, { bpm: 112, density: 0.5, grit: 0.12, weirdness: 0.1, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const minor = rng.chance(0.2);
  const tplA = minor ? rng.pick(JAZZ_MINOR) : rng.pick(JAZZ_A);
  const tplB = minor ? rng.pick(JAZZ_MINOR) : rng.pick(JAZZ_B);
  const progA = parseProgression(tplA.prog, tonic);
  const progB = parseProgression(tplB.prog, tonic);
  const keyScale = scalePcs(tonic, SCALES[tplA.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [96, 138]);
  const ballad = bpm < 88;
  const swing = rng.range(0.6, 0.67);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'A', 'B', 'A'], intro: 4, outro: 2 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 2);
  const beat = b.beat;

  const pianoPatch: SamplePatch = rng.weighted([['piano', 4], ['felt-piano', 2], ['ep', 2]]);
  const piano = b.inst({ kind: 'sample', patch: pianoPatch, name: pianoPatch === 'ep' ? 'Electric piano' : 'Piano', gain: 0.55, reverb: 0.2, pan: -0.15, lowpass: lerp(4500, 10000, B), tremolo: pianoPatch === 'ep' ? { rate: 4.2, depth: 0.25 } : undefined });
  const bass = b.inst({ kind: 'sample', patch: 'bass-upright', name: 'Upright bass', gain: 0.75, reverb: 0.06, pan: 0.05 });
  const leadPatch: SamplePatch | SynthPatch = rng.weighted([['vibes', 6], ['flute', 2], ['ep-bright', 2]]);
  const leadSynth = leadPatch === 'flute';
  const lead = leadSynth
    ? b.inst({ kind: 'synth', patch: 'flute', name: 'Flute', gain: 0.5, reverb: 0.3, pan: 0.2, detune: weirdDetune(rng, W, 20) })
    : b.inst({ kind: 'sample', patch: leadPatch as SamplePatch, name: leadPatch === 'vibes' ? 'Vibraphone' : 'Electric piano', gain: 0.5, reverb: 0.3, pan: 0.2, detune: weirdDetune(rng, W, 20), tremolo: leadPatch === 'vibes' ? { rate: 5.2, depth: 0.3 } : undefined });
  const ride = b.inst({ kind: 'sample', patch: 'ride', name: 'Ride', gain: 0.24, pan: 0.3, reverb: 0.1, lowpass: lerp(6000, 12000, B) });
  const pedal = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.18, pan: 0.3, lowpass: 6000 });
  const brush = b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Brush snare', gain: 0.4, pan: -0.05, reverb: 0.1 });
  const swish = b.inst({ kind: 'sample', patch: 'brush-swish', name: 'Brushes', gain: 0.3, pan: -0.05 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.35 });

  const headA = makeMotif(rng, 8, 0.25 + D * 0.35, { restTail: 1.5, maxNotes: 4 });
  const headA2 = makeMotif(rng, 8, 0.25 + D * 0.3, { restTail: 2, maxNotes: 4 });
  const headB = makeMotif(rng, 8, 0.2 + D * 0.3, { restTail: 1.5, maxNotes: 4 });
  const compStyle = rng.int(0, 2);
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  const [lo, hi] = leadPatch === 'flute' ? [67, 86] : [62, 84];

  let bodyIndex = -1;
  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    if (!intro && !outro) bodyIndex++;
    const chorusNo = Math.floor(Math.max(0, bodyIndex) / 4);
    const totalBody = plan.filter((p) => p.part !== 'intro' && p.part !== 'outro').length;
    const lastChorus = chorusNo === Math.floor((totalBody - 1) / 4);
    const solo = !intro && !outro && chorusNo % 2 === 1 && !lastChorus;
    let prog: Chord[][];
    if (intro) prog = progA.slice(-4).length === 4 ? progA.slice(-4) : progA;
    else if (s.part === 'B') prog = progB;
    else prog = progA;
    const spans = chordSpans(prog, s, b);
    if (outro) {
      const home = minor ? chord(tonic, 'm69') : chord(tonic, 'maj9');
      spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 ? home : sp.chord));
      if (spans.length > 1) spans[spans.length - 2]!.chord = chord(tonic + 7, minor ? '7b9' : '13');
    }
    b.section({ ...s, name: solo ? `solo ${s.name}` : s.name }, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const next = spans[k + 1];
      const last = outro && k === spans.length - 1;
      // ── Piano comping (rootless voicings) ──
      voicing = voiceChord(span.chord, voicing, { low: 50, high: 74, voices: 4 });
      if (last) {
        voicing.forEach((p, j) => b.note(piano, span.t + j * 0.03, b.end - span.t - 0.4, p, 0.5));
      } else if (ballad) {
        b.note(piano, b.grid.at(span.bar, span.beat), span.dur * 0.95, voicing[0]!, vel(rng, 0.42));
        voicing.slice(1).forEach((p, j) => b.note(piano, b.grid.at(span.bar, span.beat) + (j + 1) * 0.025, span.dur * 0.95, p, vel(rng, 0.44)));
        if (span.beats >= 4 && rng.chance(0.4)) for (const p of voicing.slice(-2)) b.note(piano, b.grid.at(span.bar, span.beat + 2.5), beat, p, vel(rng, 0.32));
      } else {
        const rhythm = compRhythm(rng, span.beats, compStyle, D);
        for (const [x, len] of rhythm) {
          const t = b.grid.at(span.bar, span.beat + x) + rng.gauss() * 0.006;
          for (const p of voicing) b.note(piano, t, len * beat, p, vel(rng, solo ? 0.36 : 0.42));
        }
      }
      // ── Walking bass ──
      if (!(intro && k < 2)) {
        const root = bassNote(bassPc(span.chord), prevBass, 28, 45);
        const target = next ? bassNote(bassPc(next.chord), root, 28, 45) : root;
        const line = last ? [root] : ballad && !solo ? twoFeel(rng, span, root, target) : walk(rng, span, root, target, keyScale);
        const step = last ? span.beats : ballad && !solo ? 2 : 1;
        line.forEach((p, j) => b.note(bass, b.grid.at(span.bar, span.beat + j * step) + rng.gauss() * 0.004, (last ? 3 : step * 0.92) * beat, p, vel(rng, j === 0 ? 0.78 : 0.68)));
        prevBass = line[line.length - 1] ?? root;
      }
    });

    // ── Drums ──
    if (!intro || s.bars > 2) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        if (intro && k < s.bars - 2) continue;
        if (outro && k === s.bars - 1) {
          b.hit(ride, b.grid.at(bar, 0), 0.6, 60, 2.2);
          b.hit(kick, b.grid.at(bar, 0), 0.5);
          break;
        }
        if (ballad && !solo) {
          for (let bt = 0; bt < 4; bt++) b.hit(swish, b.grid.at(bar, bt) - beat * 0.15, vel(rng, 0.5), 60, 0.5);
          for (const bt of [1, 3]) b.hit(brush, b.grid.at(bar, bt), vel(rng, 0.45));
        } else {
          for (const [bt, v] of [[0, 0.55], [1, 0.68], [1.5, 0.42], [2, 0.55], [3, 0.68], [3.5, 0.42]] as const) {
            if ((bt === 1.5 || bt === 3.5) && rng.chance(0.12)) continue;
            b.hit(ride, b.grid.at(bar, bt) + rng.gauss() * 0.004, vel(rng, v), 60, 1.6);
          }
          for (const bt of [1, 3]) b.hit(pedal, b.grid.at(bar, bt), vel(rng, 0.45), 60, 0.3);
          // Snare comping, busier under the solo.
          for (const bt of [0.5, 1.5, 2.5, 3.5]) if (rng.chance((solo ? 0.22 : 0.1) + D * 0.12)) b.hit(brush, b.grid.at(bar, bt), vel(rng, 0.32, 0.1));
          for (let bt = 0; bt < 4; bt++) b.hit(kick, b.grid.at(bar, bt), vel(rng, 0.16, 0.04));
          if (k === s.bars - 1 && rng.chance(0.5)) b.hit(brush, b.grid.at(bar, 3.5), 0.6);
        }
      }
    }

    // ── Melody: the head, or a solo ──
    if (!intro && !outro) {
      if (solo) {
        for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
          const line = makeMotif(rng, 8, 0.55 + D * 0.4, { restTail: rng.range(0.5, 2), maxNotes: 7, maxLeap: 3 });
          playLine(b, rng, lead, line, spans, keyScale, s.startBar + ph, lo, hi, 0.55);
        }
      } else {
        const head = s.part === 'B' ? headB : headA;
        for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
          const phrase = ph / 2;
          // AABA phrasing inside the section too: statement, answer, statement, cadence.
          const m = phrase === 1 ? headA2 : phrase === 3 ? headA2.slice(0, Math.ceil(headA2.length / 2)) : head;
          playLine(b, rng, lead, m, spans, keyScale, s.startBar + ph, lo, hi, 0.6);
        }
      }
    }
    if (outro) {
      // A vibes roll up the final chord.
      const home = spans[spans.length - 1]!;
      const tones = chordPcs(home.chord);
      let p = nearestInSet(lo + 2, tones);
      for (let j = 0; j < 6; j++) {
        b.note(lead, home.t + j * beat * 0.25, b.end - home.t - j * beat * 0.25 - 0.5, p, 0.5 + j * 0.03);
        p = nearestInSet(p + 2, tones);
        if (p > hi) break;
      }
    }
  }

  return b.build({
    key: keyName(tonic, minor ? 'minor' : 'major'),
    progression: `A: ${tplA.prog} · B: ${tplB.prog}`,
    fx: trackFx({
      gain: 0.36,
      lowpass: lerp(6000, 16000, B),
      highpass: 35,
      wow: G * 1.2,
      wowRate: 0.4,
      flutter: G * 0.04,
      drive: 0.05 + G * 0.3,
      reverbTone: 6000,
      reverbLevel: 1.1,
    }),
  });
}

function compRhythm(rng: Rng, beats: number, style: number, density: number): [number, number][] {
  if (beats < 4) return rng.chance(0.5) ? [[0, 1.2]] : [[0.5, 0.8]];
  const options: [number, number][][] = [
    [[0, 1], [1.5, 0.5]], // Charleston
    [[1.5, 0.5], [3.5, 0.9]], // offbeat pushes
    [[0, 0.5], [2.5, 1]],
    [[1, 0.5], [2.5, 0.5], [3.5, 0.6]],
  ];
  const pick = rng.chance(0.55) ? options[style % options.length]! : rng.pick(options);
  return density < 0.3 ? pick.slice(0, 1) : pick;
}

/** A walking line: root, chord tones and passing tones, approaching the next root. */
function walk(rng: Rng, span: ChordSpan, root: number, target: number, keyScale: readonly number[]): number[] {
  const n = Math.max(1, Math.round(span.beats));
  if (n === 1) return [root];
  const tones = chordPcs(span.chord);
  const scale = chordScale(span.chord, keyScale);
  const out = [root];
  let cur = root;
  for (let j = 1; j < n; j++) {
    if (j === n - 1) {
      // Approach: a half step from above/below, or the dominant of the target.
      const options = [target - 1, target + 1, target + (rng.chance(0.5) ? 7 : -5), target - 2];
      let p = rng.weighted([[options[0]!, 4], [options[1]!, 3], [options[2]!, 2], [options[3]!, 1]] as const);
      if (p < 28) p += 12;
      if (p > 50) p -= 12;
      out.push(p);
      break;
    }
    const dir = target > cur ? 1 : target < cur ? -1 : rng.chance(0.5) ? 1 : -1;
    const set = rng.chance(0.6) ? tones : scale;
    let p = cur + dir;
    while (!set.includes(pc(p))) p += dir;
    if (rng.chance(0.15)) p = cur + dir * 12 > 50 || cur + dir * 12 < 28 ? p : cur + dir * 12;
    if (p < 28) p += 12;
    if (p > 50) p -= 12;
    out.push(p);
    cur = p;
  }
  return out;
}

/** Ballad "two-feel": half notes on root and fifth. */
function twoFeel(rng: Rng, span: ChordSpan, root: number, target: number): number[] {
  if (span.beats < 4) return [root];
  const fifth = root + 7 <= 50 ? root + 7 : root - 5;
  return [root, rng.chance(0.7) ? fifth : target - 1];
}

function playLine(b: ScoreBuilder, rng: Rng, inst: number, motif: readonly MotifNote[], spans: readonly ChordSpan[], keyScale: readonly number[], bar: number, lo: number, hi: number, v: number): void {
  const notes = realizeMotif(motif, 0, b.beat, Math.round((lo + hi) / 2), spans, keyScale, lo, hi, b.grid, bar);
  notes.forEach((n, j) => {
    const prev = notes[j - 1];
    // Chromatic approach from below into strong notes, when there's room.
    if (n.strong && prev && n.t - (prev.t + prev.d) > b.beat * 0.45 && rng.chance(0.35)) {
      const at = n.t - b.beat / 3;
      b.note(inst, at, b.beat * 0.3, n.p - 1, vel(rng, v - 0.12));
    }
    b.note(inst, n.t + rng.gauss() * 0.005, n.d, n.p, vel(rng, n.strong ? v + 0.06 : v));
  });
}

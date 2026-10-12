// Surf rock: a twangy guitar with the spring reverb dripping off every note, melodies
// tremolo-picked or plucked low on the neck, a rhythm guitar chopping eighths, a bass
// that won't sit still, driving drums with a tom-tom break, and the glissando down the
// neck that starts and ends everything. Sunny major keys, or the doomed hijaz scale
// (the tide never comes back).

import type { TrackRequest } from '../index';
import type { Rng } from '../rng';
import { fitForm, type Score } from '../score';
import { bassPc, chordPcs, keyName, nearestInSet, parseProgression, pc, prefersFlats, SCALES, scalePcs, type Chord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, shiftMotif, trackFx, varyMotif, vel, type MotifNote } from './common';
import { bpmFor, guitarShape, phrase, planForm, streams, tonicFor } from './v3-kit';

type Mode = 'major' | 'minor' | 'hijaz';
const PROGS: Record<Mode, { a: string[]; b: string[] }> = {
  major: { a: ['I I IV IV I I V IV', 'I vi IV V', 'I bVII IV I', 'I IV V IV'], b: ['IV IV I I V V I V', 'vi vi IV IV ii ii V V', 'IV V IV V'] },
  minor: { a: ['i bVII bVI V', 'i iv bVI V', 'i i iv iv bVI V i i'], b: ['iv iv i i bVI bVI V V', 'bVI bVII i i'] },
  hijaz: { a: ['I I bII bII', 'I bII I bII', 'I I bII bII iv iv bII I'], b: ['iv iv I I bII bII I I', 'bII bII I I'] },
};
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];

export function composeSurfRock(req: TrackRequest): Score {
  const S = streams(req, 'surf-rock');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 160, density: 0.55, grit: 0.15, weirdness: 0.1, brightness: 0.65 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const lean = S.sig ? S.sig.minor : style.next();
  const mode: Mode = song.weighted([['major', 1.6 - lean], ['minor', 0.4 + lean * 0.6], ['hijaz', 0.3 + lean * 0.7]] as const);
  const tonic = tonicFor(S, mode === 'major' ? [4, 7, 9, 2, 0] : [4, 9, 2, 7]);
  const tplA = song.pick(PROGS[mode].a);
  const tplB = song.pick(PROGS[mode].b);
  const progA = parseProgression(tplA, tonic);
  const progB = parseProgression(tplB, tonic);
  const keyScale = mode === 'hijaz' ? HIJAZ.map((x) => pc(tonic + x)) : scalePcs(tonic, SCALES[mode === 'major' ? 'mixolydian' : 'minor']);
  const flats = prefersFlats(tonic, mode === 'minor');
  const bpm = bpmFor(S, req, [148, 176]);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const tomBreak = style.chance(0.55);
  const plan = planForm(
    fit.bars,
    fit.bars >= 24 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 16 ? 2 : fit.bars >= 6 ? 1 : 0,
    [{ part: 'A', bars: 8 }, { part: 'A', bars: 8 }, { part: 'B', bars: 8 }, { part: 'A', bars: 8 }, ...(tomBreak ? [{ part: 'T', bars: 4 }] : []), { part: 'A', bars: 8 }, { part: 'B', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, 0.5, tweaks, 2);
  const beat = b.beat;

  const lead = b.inst({ kind: 'sample', patch: 'surf-guitar', name: 'Lead guitar', gain: 0.62, pan: 0.18, reverb: 0.12, release: 0.12 });
  const rhythm = b.inst({ kind: 'sample', patch: 'surf-guitar', name: 'Rhythm guitar', gain: 0.4, pan: -0.32, reverb: 0.08, release: 0.06, lowpass: 4500 });
  const organ = style.chance(0.3) ? b.inst({ kind: 'synth', patch: 'organ', name: 'Combo organ', gain: 0.24, pan: -0.15, reverb: 0.2, tremolo: { rate: 6, depth: 0.3 } }) : -1;
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.55, pan: 0.02, release: 0.05 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-punch', name: 'Kick', gain: 0.36 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-rock', name: 'Snare', gain: 0.46, reverb: 0.25, pan: 0.04 });
  const ridePart = style.chance(0.4);
  const hat = ridePart ? -1 : b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.26, pan: 0.25 });
  const ride = ridePart ? b.inst({ kind: 'sample', patch: 'ride', name: 'Ride', gain: 0.18, pan: -0.25, lowpass: 10000 }) : -1;
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Toms', gain: 0.45, reverb: 0.2 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.18, reverb: 0.2, pan: 0.3 });

  const tremoloLead = style.chance(mode === 'major' ? 0.45 : 0.75);
  const melA = phrase(S, 'surf-a', 8, 0.35 + D * 0.3, { restTail: 1, maxNotes: 5, maxLeap: 4 });
  const melB = phrase(S, 'surf-b', 8, 0.3 + D * 0.3, { restTail: 1.5, maxNotes: 5, maxLeap: 3 });
  const [lo, hi] = tremoloLead ? [59, 79] : [50, 72];
  const bassWalk = style.chance(0.5);
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const toms = s.part === 'T';
    const prog: Chord[][] = s.part === 'B' ? progB : progA;
    const spans = chordSpans(prog, s, b);
    if (outro) {
      const last = spans[spans.length - 1]!;
      last.chord = progA[0]![0]!;
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? 'ending' : toms ? 'tom-tom break' : s.name }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    if (!toms && (s.part === 'B' || s.repeat === 0 || outro) && !intro) b.hit(crash, sT, 0.75, 60, 3);
    if (intro || (s.part === 'A' && s.repeat === 2) || outro) gliss(b, song, lead, intro ? sT : sT - beat * 1.5, intro ? 0.9 : 0.7, intro ? 82 : 76, 47);

    // ── Rhythm guitar: eighth-note chops (the organ holds chords instead) ──
    spans.forEach((span, k) => {
      const shape = guitarShape(span.chord, { low: 40 }).slice(1, 4);
      const lastSpan = outro && k === spans.length - 1;
      if (lastSpan) {
        shape.forEach((p, j) => b.note(rhythm, span.t + j * 0.02, b.end - span.t - 0.2, p, 0.55));
        tremolo(b, song, lead, span.t, b.end - span.t - 0.5, nearestInSet(hi - 4, chordPcs(span.chord)), 0.6);
        return;
      }
      if (intro && k < spans.length - 2) return;
      // Chops on the beat, with a push on the "and" of two and four; the spring rings on.
      for (const x of [0, 1, 1.5, 2, 3, 3.5]) {
        if (toms || x >= span.beats) break;
        const accent = x === 1 || x === 3;
        shape.forEach((p, j) => b.note(rhythm, b.grid.at(span.bar, span.beat + x) + j * 0.004, beat * (accent ? 0.7 : 0.4), p, vel(song, accent ? 0.55 : 0.42)));
      }
      if (organ >= 0 && !toms) for (const p of shape) b.note(organ, span.t, span.dur * 0.95, p + 12, 0.45);
    });

    // ── Bass ──
    if (!(intro && s.bars > 2)) {
      spans.forEach((span, k) => {
        const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
        prevBass = root;
        if (outro && k === spans.length - 1) {
          b.note(bass, span.t, Math.min(2, b.end - span.t - 0.2), root, 0.75);
          return;
        }
        const fifth = root + 7 <= 50 ? root + 7 : root - 5;
        const tones = chordPcs(span.chord);
        const third = nearestInSet(root + 4, tones);
        const line = bassWalk ? [root, third, fifth, root + 12 <= 52 ? root + 12 : fifth] : [root, root, fifth, root];
        for (let q = 0; q < Math.round(span.beats); q++) {
          const p = line[q % 4]!;
          b.note(bass, b.grid.at(span.bar, span.beat + q), beat * (bassWalk ? 0.85 : 0.45), p, vel(song, q % 2 ? 0.62 : 0.74));
          if (!bassWalk && q % 2 === 1) b.note(bass, b.grid.at(span.bar, span.beat + q + 0.5), beat * 0.4, p, vel(song, 0.5));
        }
      });
    }

    // ── Drums ──
    if (!intro || s.bars <= 2) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        if (outro && k === s.bars - 1) {
          b.hit(kick, b.grid.bar(bar), 0.9);
          b.hit(crash, b.grid.bar(bar), 0.8, 60, 3);
          break;
        }
        if (toms) {
          // The tom-tom break: sixteenths around the kit, accents on the beat.
          for (let st = 0; st < 16; st++) b.hit(tom, b.grid.at(bar, st / 4), vel(song, st % 4 === 0 ? 0.85 : 0.55), st % 8 < 4 ? 62 : 57, 0.35);
          b.hit(kick, b.grid.at(bar, 0), 0.8);
          b.hit(kick, b.grid.at(bar, 2), 0.8);
          continue;
        }
        const fill = k === s.bars - 1;
        for (let e = 0; e < 8; e++) {
          const t = b.grid.at(bar, e * 0.5) + song.gauss() * 0.003;
          if (e === 0 || e === 4 || (e === 3 && song.chance(0.3)) || (e === 7 && song.chance(0.2))) b.hit(kick, t, vel(song, e % 4 === 0 ? 0.9 : 0.7));
          if ((e === 2 || e === 6) && !(fill && e === 6)) b.hit(snare, t, vel(song, 0.85));
          if (fill && e >= 6) continue;
          if (ridePart) b.hit(ride, t, vel(song, e % 2 ? 0.45 : 0.6), 60, 1.2);
          else b.hit(hat, t, vel(song, e % 2 ? 0.38 : 0.55), 60, 0.25);
        }
        if (fill) for (let f = 0; f < 4; f++) b.hit(f % 2 ? tom : snare, b.grid.at(bar, 3 + f * 0.25), 0.55 + f * 0.1, 62 - f * 2);
      }
    }

    // ── Lead: the tune, tremolo-picked or twanged ──
    if (s.part === 'A' || s.part === 'B') {
      const base: MotifNote[] = s.part === 'B' ? melB : melA;
      // Second time round: the other articulation, and up the neck.
      const later = s.part === 'A' && plan.indexOf(s) > plan.findIndex((x) => x.part === 'B') && plan.some((x) => x.part === 'B');
      const swap = later && s.repeat % 2 === 1;
      const trem = swap ? !tremoloLead : tremoloLead;
      const up = swap && hi + 7 <= 88 ? 7 : 0;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const idx = ph / 2;
        const m = idx === 1 ? varyMotif(song, base, 0.5) : idx === 2 ? shiftMotif(base, mode === 'major' ? 2 : -1) : idx === 3 ? base.slice(0, Math.max(2, Math.ceil(base.length * 0.6))) : base;
        const notes = realizeMotif(m, 0, beat, Math.round((lo + hi) / 2) + up, spans, keyScale, lo + up, hi + up, b.grid, s.startBar + ph);
        for (const n of notes) {
          if (trem && n.d >= beat * 0.7) tremolo(b, song, lead, n.t, n.d, n.p, 0.6);
          else b.note(lead, n.t + song.gauss() * 0.004, Math.max(n.d, 1.4), n.p, vel(song, n.strong ? 0.72 : 0.6));
        }
      }
    }
  }

  return b.build({
    key: mode === 'hijaz' ? `${keyName(tonic, 'major').split(' ')[0]} hijaz` : keyName(tonic, mode === 'major' ? 'mixolydian' : 'minor'),
    progression: `${tplA} / ${tplB}${tremoloLead ? ' · tremolo lead' : ''}`,
    fx: trackFx({
      gain: 0.298,
      lowpass: lerp(6000, 14000, B),
      highpass: 45,
      wow: G * 1.4 + W * 1.4,
      wowRate: 0.5,
      flutter: G * 0.04,
      drive: 0.1 + G * 0.35,
      reverbTone: 5000,
      reverbLevel: 0.9,
    }),
  });
}

/** Tremolo picking: the note re-struck as fast as the wrist allows, down and up. */
function tremolo(b: ScoreBuilder, rng: Rng, inst: number, t: number, d: number, p: number, v: number): void {
  const step = Math.min(0.075, b.beat / 4);
  const n = Math.max(1, Math.floor(d / step));
  // Each stroke rings on into the spring (the polyphony cap tidies up behind it).
  for (let k = 0; k < n; k++) b.note(inst, t + k * step + rng.gauss() * 0.002, k === n - 1 ? 1.2 : 0.6, p, vel(rng, v * (k % 2 ? 0.82 : 1) * (k === 0 ? 1.12 : 1), 0.03));
}

/** The glissando: a pick scraped down the neck. */
function gliss(b: ScoreBuilder, rng: Rng, inst: number, t: number, dur: number, from: number, to: number): void {
  const n = Math.max(4, from - to);
  for (let k = 0; k < n; k++) {
    const u = k / n;
    b.note(inst, t + dur * u ** 0.85, dur / n * 1.6, from - k, vel(rng, 0.55 - u * 0.25, 0.03));
  }
}

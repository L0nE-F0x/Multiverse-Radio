// Soft rock: a golden-hour seventies single. Rhodes-style electric piano and a steel-
// string acoustic strumming, a warm bass, a lazy backbeat with tambourine, "ooh"
// harmonies in the chorus, and a lead guitar that bends into its notes, sings the tune,
// takes the solo and plays the fade.

import type { TrackRequest } from '../index';
import { fitForm, type Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, shiftMotif, trackFx, varyMotif, vel, type MotifNote } from './common';
import { bpmFor, fadeVelocities, feelFor, guitarShape, minorFor, phrase, planForm, streams, strum, tonicFor } from './v3-kit';

const VERSE = ['Imaj7 IVmaj7 Imaj7 IVmaj7', 'I V/VII vi IV', 'I iii IV V', 'Imaj7 iii7 IVmaj7 V7sus', 'I Imaj7 IV iv'];
const CHORUS = ['IV V iii vi', 'IVmaj7 iii7 ii7 V7sus', 'vi IV I V', 'IV I/III ii V7sus', 'IV V I vi'];
const MINOR_VERSE = ['vi IV I V', 'vi vi IV V', 'ii7 V7 Imaj7 vi7'];

/** Strum patterns over one bar of eighths: d = down, u = up, - = miss. */
const STRUMS = ['d-du-udu', 'd-d-dudu', 'd-du-du-', 'd-dud-du'];

export function composeSoftRock(req: TrackRequest): Score {
  const S = streams(req, 'soft-rock');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 88, density: 0.5, grit: 0.15, weirdness: 0.06, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const sad = minorFor(S, 0.25);
  const tonic = tonicFor(S, [0, 2, 4, 5, 7, 9]);
  const tplV = song.pick(sad ? MINOR_VERSE : VERSE);
  const tplC = song.pick(CHORUS);
  const progV = parseProgression(tplV, tonic);
  const progC = parseProgression(tplC, tonic);
  const keyScale = scalePcs(tonic, SCALES.major);
  const flats = prefersFlats(tonic, false);
  const bpm = bpmFor(S, req, [74, 102]);
  const swing = feelFor(S, 0.5, 0.57);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const plan = planForm(
    fit.bars,
    fit.bars >= 20 ? 4 : fit.bars >= 8 ? 2 : 0,
    fit.bars >= 36 ? 8 : fit.bars >= 12 ? 2 : fit.bars >= 5 ? 1 : 0,
    [{ part: 'V', bars: 8 }, { part: 'C', bars: 8 }, { part: 'V', bars: 8 }, { part: 'C', bars: 8 }, { part: 'S', bars: 8 }, { part: 'C', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;
  const fadeOut = fit.bars >= 36 && style.chance(0.65);

  const ep = b.inst({ kind: 'sample', patch: style.weighted([['ep', 4], ['wurli', 1.5]]), name: 'Electric piano', gain: 0.5, pan: -0.18, reverb: 0.18, tremolo: { rate: style.range(3.8, 5), depth: 0.35 }, lowpass: lerp(3500, 7000, B) });
  const acoustic = b.inst({ kind: 'sample', patch: 'folk-guitar', name: 'Acoustic guitar', gain: 0.4, pan: 0.32, reverb: 0.12, release: 0.15 });
  const bass = b.inst({ kind: 'sample', patch: 'bass-round', name: 'Bass', gain: 0.52, pan: 0, release: 0.08 });
  const lead = b.inst({ kind: 'synth', patch: 'lead-guitar', name: 'Lead guitar', gain: 0.5, pan: 0.12, reverb: 0.28, delay: 0.22, lowpass: lerp(2800, 4500, B) });
  const oohs = b.inst({ kind: 'synth', patch: 'pad-choir', name: 'Ooh harmonies', gain: 0.3, reverb: 0.45, pan: -0.05 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.5 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-rock', name: 'Snare', gain: 0.36, reverb: 0.22, pan: 0.03, lowpass: 7000 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.22, pan: 0.22, lowpass: 8000 });
  const tamb = b.inst({ kind: 'sample', patch: 'jingle-tamb', name: 'Tambourine', gain: 0.18, pan: -0.35, reverb: 0.1 });
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Toms', gain: 0.32, reverb: 0.25 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Cymbal', gain: 0.13, reverb: 0.25, pan: 0.25, lowpass: 9000 });

  const strumPat = style.pick(STRUMS);
  const tune = phrase(S, 'soft-tune', 8, 0.3 + D * 0.3, { restTail: 1.5, maxNotes: 4, maxLeap: 3 });
  const hook = phrase(S, 'soft-hook', 8, 0.35 + D * 0.3, { restTail: 1, maxNotes: 5, maxLeap: 4 });
  let epV: number[] | null = null;
  let choirV: number[] | null = null;
  let prevBass: number | null = null;
  const outroSec = plan.find((s) => s.part === 'outro');

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const isC = s.part === 'C' || (outro && fadeOut);
    const solo = s.part === 'S';
    const prog = isC || solo ? progC : progV;
    const spans = chordSpans(intro ? progC : prog, s, b);
    const button = outro && !fadeOut;
    if (button) {
      const last = spans[spans.length - 1]!;
      last.chord = chord(tonic, 'maj9');
      if (spans.length > 1) spans[spans.length - 2]!.chord = chord(tonic + 5, 'maj7');
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? (fadeOut ? 'fade' : 'ending') : isC ? 'chorus' : solo ? 'guitar solo' : 'verse' }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    if ((isC && s.repeat === 0) || solo) b.hit(crash, sT, 0.6, 60, 3);

    spans.forEach((span, k) => {
      const t = b.grid.at(span.bar, span.beat);
      const lastSpan = button && k === spans.length - 1;
      epV = voiceChord(span.chord, epV, { low: 53, high: 74, voices: 4 });
      const shape = guitarShape(span.chord, { low: 40 });
      if (lastSpan) {
        epV.forEach((p, j) => b.note(ep, t + j * 0.03, b.end - t - 0.3, p, 0.5));
        strum(b, acoustic, song, t, b.end - t - 0.3, shape, 0.55, 0.03);
        b.note(bass, t, Math.min(3, b.end - t - 0.2), bassNote(bassPc(span.chord), prevBass, 31, 45), 0.7);
        b.note(lead, t + beat, Math.min(beat * 6, b.end - t - beat - 0.4), nearestInSet(72, chordPcs(span.chord)), 0.55, { from: nearestInSet(72, chordPcs(span.chord)) - 2, glide: 0.18 });
        return;
      }
      // Electric piano: chords on 1, a lazy push on the "and" of 2 or 3.
      epV.forEach((p, j) => b.note(ep, t + j * 0.01 + song.gauss() * 0.004, span.dur * 0.6, p, vel(song, 0.46)));
      if (span.beats >= 4 && song.chance(0.5 + D * 0.3)) for (const p of epV.slice(1)) b.note(ep, b.grid.at(span.bar, span.beat + song.pick([1.5, 2.5])), beat * 1.2, p, vel(song, 0.38));
      // Acoustic strumming.
      if (!intro || k >= spans.length - 2) {
        for (let e = 0; e < Math.round(span.beats * 2); e++) {
          const c = strumPat[e % 8]!;
          if (c === '-') continue;
          const down = c === 'd';
          strum(b, acoustic, song, b.grid.at(span.bar, span.beat + e * 0.5), beat * 0.9, down ? shape : shape.slice(-4), down ? 0.5 : 0.38, 0.011, down);
        }
      }
      // Ooh harmonies in the chorus.
      if (isC && !intro) {
        choirV = voiceChord(span.chord, choirV, { low: 60, high: 76, voices: 3, rootless: false, maxSpan: 12 });
        for (const p of choirV) b.note(oohs, t, span.dur + 0.1, p, vel(song, 0.5, 0.03));
      }
    });

    // ── Bass: root on 1, a fifth or a walk up on 3, an approach into the change ──
    if (!(intro && s.bars > 2)) {
      spans.forEach((span, k) => {
        if (button && k === spans.length - 1) return;
        const root = bassNote(bassPc(span.chord), prevBass, 31, 45);
        prevBass = root;
        const next = spans[k + 1];
        const nextRoot = next ? bassNote(bassPc(next.chord), root, 31, 45) : root;
        const fifth = root + 7 <= 50 ? root + 7 : root - 5;
        b.note(bass, b.grid.at(span.bar, span.beat), beat * (span.beats >= 4 ? 1.8 : 0.9), root, vel(song, 0.75));
        if (span.beats >= 4) {
          b.note(bass, b.grid.at(span.bar, span.beat + 2), beat * 0.9, song.chance(0.6) ? fifth : root, vel(song, 0.62));
          b.note(bass, b.grid.at(span.bar, span.beat + 3), beat * 0.45, song.chance(0.5) ? root : fifth, vel(song, 0.55));
          b.note(bass, b.grid.at(span.bar, span.beat + 3.5), beat * 0.45, nextRoot + (nextRoot > root ? -1 : 1) * (song.chance(0.5) ? 1 : 2), vel(song, 0.55));
        }
      });
    }

    // ── Drums: a lazy backbeat ──
    if (!intro || s.bars <= 2) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        if (button && k === s.bars - 1) {
          b.hit(kick, b.grid.bar(bar), 0.8);
          b.hit(crash, b.grid.bar(bar), 0.6, 60, 3);
          break;
        }
        const fill = k === s.bars - 1 && s.bars >= 4 && !outro;
        for (let e = 0; e < 8; e++) {
          const t = b.grid.at(bar, e * 0.5) + song.gauss() * 0.004;
          if (e === 0 || (e === 5 && song.chance(0.6)) || e === 4) b.hit(kick, t, vel(song, e === 0 ? 0.85 : 0.65));
          if ((e === 2 || e === 6) && !(fill && e === 6)) b.hit(snare, t + 0.012, vel(song, isC ? 0.8 : 0.68));
          if (fill && e >= 6) continue;
          b.hit(hat, t, vel(song, e % 2 ? 0.3 : 0.48), 60, 0.25);
          if (isC || solo) {
            if (e === 2 || e === 6) b.hit(tamb, t + 0.01, vel(song, 0.6));
            else if (D > 0.5 && e % 2 === 1) b.hit(tamb, t, vel(song, 0.3));
          }
        }
        if (fill) for (let f = 0; f < 3; f++) b.hit(tom, b.grid.at(bar, 3 + f / 3), 0.5 + f * 0.1, 64 - f * 4);
      }
    }

    // ── Lead guitar: the tune in the verses, the hook in the chorus, a solo, the fade ──
    const lazy = (n: { t: number; d: number; p: number; strong: boolean }) => {
      const bend = n.strong && n.d >= beat && song.chance(0.45);
      b.note(lead, n.t + song.range(0.005, 0.03), n.d * 0.95, n.p, vel(song, n.strong ? 0.66 : 0.58), bend ? { from: n.p - (song.chance(0.7) ? 2 : 1), glide: song.range(0.08, 0.16) } : {});
    };
    if (!intro && !(button && s.bars <= 2)) {
      const base: MotifNote[] | null = s.part === 'V' ? tune : isC ? hook : null;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const idx = ph / 2;
        let m: MotifNote[] | null = base;
        if (solo || (outro && fadeOut)) m = phrase(S, `soft-solo-${idx % 4}`, 8, 0.5 + D * 0.35, { restTail: 1, maxNotes: 7, maxLeap: 3 });
        else if (m && idx === 1) m = varyMotif(song, m, 0.5);
        else if (m && idx === 2) m = shiftMotif(m, isC ? 1 : -1);
        else if (m && idx === 3) m = s.part === 'V' && song.chance(0.5) ? null : m.slice(0, Math.max(2, Math.ceil(m.length / 2)));
        if (!m) continue;
        for (const n of realizeMotif(m, 0, beat, solo ? 74 : 70, spans, keyScale, 62, solo || outro ? 86 : 80, b.grid, s.startBar + ph)) lazy(n);
      }
    }
  }
  if (fadeOut && outroSec) fadeVelocities(b, b.grid.bar(outroSec.startBar), b.end - 0.2, 0.04);

  return b.build({
    key: keyName(tonic, 'major'),
    progression: `verse ${tplV} · chorus ${tplC}`,
    fx: trackFx({
      gain: 0.391,
      lowpass: lerp(5500, 12000, B),
      highpass: 36,
      wow: 0.3 + G * 1.5 + W,
      wowRate: 0.45,
      flutter: 0.01 + G * 0.04,
      drive: 0.1 + G * 0.3,
      delay: { time: beat * 0.75, feedback: 0.28, tone: 3000, wet: 0.3 },
      reverbTone: 5000,
      reverbLevel: 1.1,
    }),
  });
}

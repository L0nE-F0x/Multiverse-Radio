// City pop: a glossy mid-80s night drive. FM electric piano and a chorused guitar
// cutting sixteenths over major-seventh harmony, slap bass (thumb and popped octaves),
// gated drums with claps, synth-brass stabs and strings in the chorus, and a bright
// hook doubled by bells. The last choruses often lift up a key; most songs fade out.

import type { TrackRequest } from '../index';
import { fitForm, type SynthPatch, type Score } from '../score';
import { bassPc, chord, keyName, parseProgression, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bassNote, chordSpans, lerp, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel, weirdDetune } from './common';
import { bpmFor, fadeVelocities, feelFor, minorFor, phrase, planForm, streams, tonicFor } from './v3-kit';

const VERSE = ['Imaj7 iii7 IVmaj7 V7sus+V7', 'ii7 iii7 IVmaj7 V9sus', 'Imaj9 vi9 ii9 V13', 'IVmaj7 iii7 vi9 Imaj7', 'vi9 V9sus IVmaj7 iii7'];
const PRE = ['IVmaj7 iii7 ii7 V9sus', 'ii7 iii7 IVmaj7 V7sus+V7', 'IVmaj7 V7 iii7 VI7b9', 'bVImaj7 bVII9 V9sus V7'];
const CHORUS = ['IVmaj7 V7 iii7 vi7', 'IVmaj7 III7 vi7 v7+I7', 'Imaj9 vi9 ii9 V13', 'IVmaj9 V9sus iii7 VI7b9', 'ii9 V13 Imaj9 VI7b9', 'IVmaj7 V7 iii7+VI7 ii7+V7'];
const MINOR_VERSE = ['i9 iv9 bVIImaj7 bIIImaj7', 'i9 bVImaj7 iv9 V7b9', 'i9 IV9 i9 IV9'];
const MINOR_CHORUS = ['bVImaj7 bVII9 bIIImaj7 bVImaj7', 'bVImaj7 V7 i9 bVII9', 'iv9 bVII13 bIIImaj9 bVImaj9'];

/** Slap bass patterns over one bar (16th step, length in 16ths, what: root/oct/fifth/app, pop?). */
type Hit = [step: number, len: number, what: 'r' | 'o' | 'f' | 'a', pop: boolean];
const SLAP: Hit[][] = [
  [[0, 3, 'r', false], [3, 1, 'r', false], [6, 1, 'o', true], [8, 2, 'r', false], [10, 1, 'f', false], [11, 1, 'o', true], [14, 2, 'a', false]],
  [[0, 2, 'r', false], [2, 1, 'o', true], [4, 2, 'r', false], [6, 1, 'o', true], [8, 2, 'r', false], [10, 1, 'o', true], [12, 2, 'r', false], [14, 1, 'o', true]],
  [[0, 4, 'r', false], [6, 1, 'o', true], [7, 1, 'r', false], [10, 2, 'f', false], [12, 1, 'r', false], [14, 1, 'o', true], [15, 1, 'a', false]],
];
/** Guitar cutting patterns (16th steps; true = full chop, false = muted scratch). */
const CUT: [number, boolean][][] = [
  [[2, true], [6, true], [10, true], [14, true]],
  [[1, false], [2, true], [5, false], [6, true], [9, false], [10, true], [13, false], [14, true]],
  [[0, false], [3, true], [6, true], [8, false], [11, true], [14, true]],
];

export function composeCityPop(req: TrackRequest): Score {
  const S = streams(req, 'city-pop');
  const { style, song } = S;
  const tweaks = resolveTweaks(req, { bpm: 112, density: 0.55, grit: 0.08, weirdness: 0.08, brightness: 0.7 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;

  const minor = minorFor(S, 0.2);
  const tonic = tonicFor(S);
  const tVerse = song.pick(minor ? MINOR_VERSE : VERSE);
  const tPre = song.pick(PRE);
  const tChorus = song.pick(minor ? MINOR_CHORUS : CHORUS);
  const keyScale = scalePcs(tonic, SCALES[minor ? 'dorian' : 'major']);
  const flats = prefersFlats(tonic, minor);
  const bpm = bpmFor(S, req, [100, 124]);
  const swing = feelFor(S, 0.5, 0.545);
  const tail = Math.min(3, Math.max(0.8, req.durationSeconds * 0.03));
  const fit = fitForm(Math.max(4, req.durationSeconds), bpm, 4, tail);
  const preBars = style.chance(0.5) ? 4 : 8;
  const plan = planForm(
    fit.bars,
    fit.bars >= 24 ? 4 : fit.bars >= 10 ? 2 : 0,
    fit.bars >= 40 ? 8 : fit.bars >= 14 ? 4 : fit.bars >= 4 ? 1 : 0,
    [{ part: 'V', bars: 8 }, { part: 'P', bars: preBars }, { part: 'C', bars: 8 }, { part: 'V', bars: 8 }, { part: 'P', bars: preBars }, { part: 'C', bars: 8 }, { part: 'S', bars: 8 }, { part: 'C', bars: 8 }, { part: 'C', bars: 8 }],
  );
  const b = new ScoreBuilder(req.recipe, req, fit, 4, swing, tweaks, 4);
  const beat = b.beat;
  const choruses = plan.filter((s) => s.part === 'C').length;
  const modulate = choruses >= 3 && style.chance(0.6) ? style.pick([1, 2]) : 0;
  const modFrom = modulate ? plan.filter((s) => s.part === 'C')[choruses - 2]!.startBar : Infinity;
  const fade = fit.bars >= 12 && style.chance(0.7);

  // ── The band ──
  const ep = b.inst({ kind: 'sample', patch: 'dx-ep', name: 'FM electric piano', gain: 0.53, reverb: 0.2, pan: -0.1, lowpass: lerp(6000, 12000, B) });
  const gtr = b.inst({ kind: 'sample', patch: 'chorus-guitar', name: 'Chorus guitar', gain: 0.5, pan: 0.38, reverb: 0.12, release: 0.05 });
  const bass = b.inst({ kind: 'sample', patch: 'slap-bass', name: 'Slap bass', gain: 0.7, pan: 0, release: 0.06 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-punch', name: 'Kick', gain: 0.32 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-gated', name: 'Gated snare', gain: 0.5, reverb: 0.45, pan: 0.03 });
  const clap = b.inst({ kind: 'sample', patch: 'clap', name: 'Claps', gain: 0.4, reverb: 0.3, pan: -0.06 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-closed', name: 'Hi-hat', gain: 0.45, pan: 0.22, lowpass: lerp(8000, 13000, B) });
  const ohat = b.inst({ kind: 'sample', patch: 'hat-open', name: 'Open hat', gain: 0.18, pan: 0.22 });
  const tom = b.inst({ kind: 'sample', patch: 'tom', name: 'Toms', gain: 0.28, reverb: 0.35 });
  const crash = b.inst({ kind: 'sample', patch: 'crash', name: 'Crash', gain: 0.17, reverb: 0.25, pan: -0.25 });
  const brass = b.inst({ kind: 'synth', patch: 'brass', name: 'Synth brass', gain: 0.55, reverb: 0.25, pan: 0.12 });
  const strings = b.inst({ kind: 'synth', patch: 'pad-strings', name: 'Strings', gain: 0.45, reverb: 0.35, pan: -0.05 });
  const leadPatch: SynthPatch = style.weighted([['square-lead', 3], ['saw-lead', 2], ['flute', 1.5], ['soft-lead', 1.5]]);
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: leadPatch === 'flute' ? 'Pan flute' : 'Synth lead', gain: leadPatch === 'saw-lead' ? 0.47 : 0.54, reverb: 0.28, delay: 0.25, pan: 0.05, detune: weirdDetune(song, W, 15) });
  const bells = b.inst({ kind: 'sample', patch: style.pick(['celesta', 'glass', 'vibes'] as const), name: 'Bells', gain: 0.4, reverb: 0.35, pan: -0.2 });

  const slap = song.pick(SLAP);
  const slapC = song.chance(0.5) ? SLAP[1]! : slap;
  const cut = song.pick(CUT);
  const disco = song.chance(0.45);
  const hook = phrase(S, 'city-hook', 8, 0.45 + D * 0.35, { restTail: 1, maxNotes: 6, maxLeap: 4 });
  const verseLine = phrase(S, 'city-verse', 8, 0.25 + D * 0.3, { restTail: 2, maxNotes: 4, maxLeap: 3 });
  const hookAnswer = varyMotif(song, hook, 0.5);

  let epV: number[] | null = null;
  let gtrV: number[] | null = null;
  let strV: number[] | null = null;
  let prevBass: number | null = null;
  const cut0 = lerp(5000, 14000, B);
  const fadeFrom = plan.find((s) => s.part === 'outro');

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const isC = s.part === 'C' || intro || (outro && fade);
    const isP = s.part === 'P';
    const isS = s.part === 'S';
    const key = tonic + (s.startBar >= modFrom ? modulate : 0);
    const tpl = isC ? tChorus : isP ? tPre : isS ? tChorus : tVerse;
    let prog = parseProgression(tpl, key);
    if (outro && !fade) prog = [[chord(key + 5, 'maj7')], [chord(key + 7, '9sus')], [minor ? chord(key, 'm9') : chord(key, 'maj9')]].slice(-Math.min(3, s.bars));
    const spans = chordSpans(prog, s, b);
    if (outro && !fade) {
      // A button ending: the last chord rings to the end.
      const last = spans[spans.length - 1]!;
      last.dur = b.end - last.t;
    }
    b.section({ ...s, name: intro ? 'intro' : outro ? 'outro' : { V: 'verse', P: 'pre-chorus', C: 'chorus', S: 'solo' }[s.part] ?? s.part }, spans.map((x) => x.chord), flats);
    const sT = b.grid.bar(s.startBar);
    const sEnd = b.grid.bar(s.startBar + s.bars);
    if (intro) {
      b.auto('cutoff', 0, 900, 0);
      b.auto('cutoff', 0.05, cut0, (sEnd - sT) / 2);
    } else b.auto('cutoff', sT, cut0, 0.2);
    if (!intro && !(outro && !fade) && (s.part === 'C' || s.repeat === 0)) b.hit(crash, sT, 0.75, 60, 3);

    // ── Keys, guitar, strings, brass ──
    spans.forEach((span, k) => {
      const next = spans[k + 1];
      const lastSpan = outro && !fade && k === spans.length - 1;
      epV = voiceChord(span.chord, epV, { low: 55, high: 77, voices: 4 });
      const t = b.grid.at(span.bar, span.beat);
      if (lastSpan) {
        epV.forEach((p, j) => b.note(ep, t + j * 0.02, b.end - t - 0.3, p, vel(song, 0.55)));
        for (const p of epV.slice(0, 3)) b.note(strings, t, b.end - t - 0.6, p + 12, 0.5);
        b.note(bells, t + 0.1, b.end - t - 0.4, epV[epV.length - 1]! + 12, 0.4);
        return;
      }
      // EP: a held chord, a push into the next one on the "and" of 4.
      const pushNext = next && span.beats >= 4 && song.chance(0.45);
      const len = pushNext ? span.dur - beat * 0.5 : span.dur * 0.95;
      epV.forEach((p, j) => b.note(ep, t + j * 0.006, len, p, vel(song, s.part === 'V' ? 0.42 : 0.5)));
      if (span.beats >= 4 && song.chance(0.35 + D * 0.3)) for (const p of epV.slice(1)) b.note(ep, b.grid.step(span.bar, 6) + span.beat * beat, beat * 0.4, p, vel(song, 0.36));
      if (pushNext) {
        const nv = voiceChord(next.chord, epV, { low: 55, high: 77, voices: 4 });
        nv.forEach((p) => b.note(ep, b.grid.at(span.bar, span.beat + span.beats - 0.5), beat * 0.5, p, vel(song, 0.48)));
      }
      // Guitar: cutting sixteenths on the top strings.
      if (!intro || k >= spans.length - 2) {
        gtrV = voiceChord(span.chord, gtrV, { low: 62, high: 79, voices: 3, maxSpan: 12 });
        for (const [st, full] of cut) {
          if (st >= span.beats * 4) continue;
          const at = b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.003;
          if (full) for (const [j, p] of gtrV.entries()) b.note(gtr, at + j * 0.004, beat * 0.22, p, vel(song, 0.52));
          else b.note(gtr, at, 0.035, gtrV[1] ?? gtrV[0]!, vel(song, 0.3));
        }
      }
      // Strings and brass lift the chorus.
      if (isC && !intro) {
        strV = voiceChord(span.chord, strV, { low: 64, high: 84, voices: 3, rootless: false });
        for (const p of strV) b.note(strings, t, span.dur + 0.05, p, vel(song, 0.42));
        if (span.beat === 0 && (span.bar - s.startBar) % 4 === 0) for (const p of epV.slice(-3)) b.note(brass, t, beat * 0.35, p + 12, vel(song, 0.62));
      }
      if (isP && span.bar === s.startBar + s.bars - 1 && span.beat + span.beats >= 4) {
        // The kime: the whole band hits the push into the chorus.
        const at = b.grid.at(span.bar, 3.5);
        for (const p of epV.slice(-3)) b.note(brass, at, beat * 0.45, p + 12, 0.7);
      }
    });

    // ── Slap bass ──
    if (!(intro && s.bars > 2)) {
      spans.forEach((span, k) => {
        const lastSpan = outro && !fade && k === spans.length - 1;
        const root = bassNote(bassPc(span.chord), prevBass, 28, 43);
        prevBass = root;
        const next = spans[k + 1];
        const nextRoot = next ? bassNote(bassPc(next.chord), root, 28, 43) : root;
        if (lastSpan) {
          b.note(bass, b.grid.at(span.bar, span.beat), Math.min(3, b.end - span.t - 0.3), root, 0.5);
          return;
        }
        const pat = isC ? slapC : slap;
        for (const [st, l, what, pop] of pat) {
          if (st >= span.beats * 4) continue;
          if (isS && song.chance(0.15)) continue;
          const p = what === 'r' ? root : what === 'o' ? root + 12 : what === 'f' ? (root + 7 <= 47 ? root + 7 : root - 5) : nextRoot + (song.chance(0.5) ? -1 : 1);
          b.note(bass, b.grid.step(span.bar, st + span.beat * 4) + song.gauss() * 0.003, l * beat * 0.24, p, pop ? vel(song, 0.72, 0.04) : vel(song, st % 4 === 0 ? 0.52 : 0.44, 0.03));
        }
      });
    }

    // ── Drums ──
    const drumsOn = !intro || s.bars <= 2;
    if (drumsOn && !(outro && !fade)) {
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        const fillBar = k === s.bars - 1 && s.bars >= 4;
        const four = isC && disco;
        for (let st = 0; st < 16; st++) {
          const t = b.grid.step(bar, st) + song.gauss() * 0.002;
          const kickHere = four ? st % 4 === 0 : st === 0 || st === 8 || (st === 10 && k % 2 === 1) || (st === 7 && song.chance(0.15));
          if (kickHere && !(fillBar && st >= 12)) b.hit(kick, t, vel(song, st === 0 ? 0.9 : 0.75));
          if (st === 4 || st === 12) {
            if (!(fillBar && st === 12)) b.hit(snare, t, vel(song, 0.85));
            if (isC || isS) b.hit(clap, t + 0.006, vel(song, 0.6));
          }
          if (fillBar && st >= 12) continue;
          const open = st === 14 && (isC ? k % 2 === 1 : k % 4 === 3);
          if (open) b.hit(ohat, t, vel(song, 0.5), 60, 0.5);
          else if (st % (isC && D > 0.35 ? 1 : 2) === 0) b.hit(hat, t, vel(song, st % 4 === 0 ? 0.55 : st % 2 === 0 ? 0.42 : 0.28), 60, 0.3);
        }
        if (fillBar) for (let f = 0; f < 4; f++) b.hit(tom, b.grid.step(bar, 12 + f), 0.55 + f * 0.08, 67 - f * 3);
      }
    }

    // ── Hook, verse line, solo ──
    if (!outro || fade) {
      const lo = leadPatch === 'flute' ? 67 : 65;
      const hi = 86;
      for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
        const idx = ph / 2;
        let m = null;
        if (isC) m = idx % 2 === 1 ? hookAnswer : hook;
        else if (s.part === 'V' && idx % 2 === 0 && s.repeat > 0) m = verseLine;
        else if (s.part === 'V' && idx % 2 === 1) m = varyMotif(song, verseLine, 0.6);
        else if (isS) m = phrase(S, `city-solo-${idx % 3}`, 8, 0.6 + D * 0.3, { restTail: 0.5, maxNotes: 8, maxLeap: 3 });
        else if (isP && idx === 0) m = varyMotif(song, hook, 0.7);
        if (!m) continue;
        const notes = realizeMotif(m, 0, beat, 76, spans, keyScale.map((x) => (x + (s.startBar >= modFrom ? modulate : 0)) % 12), lo, hi, b.grid, s.startBar + ph);
        for (const n of notes) {
          b.note(lead, n.t + song.gauss() * 0.004, n.d * 0.95, n.p, vel(song, n.strong ? 0.66 : 0.58), song.chance(0.12) ? { from: n.p - 2, glide: 0.06 } : {});
          if (isC || intro) b.note(bells, n.t, n.d, n.p + 12, vel(song, 0.42));
        }
      }
    }
    if (intro && s.bars >= 2) {
      // A rising sweep of the chorus chord into bar one.
      const top = (epV ?? [64, 67, 71]).slice(-3);
      for (const p of top) b.note(strings, sEnd - beat * 2, beat * 2, p + 12, 0.45);
    }
  }

  if (fade && fadeFrom) fadeVelocities(b, b.grid.bar(fadeFrom.startBar), b.end - 0.2, 0.03);

  return b.build({
    key: keyName(tonic, minor ? 'dorian' : 'major'),
    progression: `verse ${tVerse} · pre ${tPre} · chorus ${tChorus}${modulate ? ` · up ${modulate === 1 ? 'a half step' : 'a whole step'} for the last choruses` : ''}`,
    fx: trackFx({
      gain: 0.31,
      lowpass: cut0,
      highpass: 34,
      q: 0.7,
      wow: G * 1.2 + W * 1.2,
      wowRate: 0.45,
      flutter: G * 0.04,
      drive: 0.06 + G * 0.25,
      delay: { time: beat * 0.75, feedback: 0.3, tone: 4000, wet: 0.35 },
      reverbTone: 7000,
      reverbLevel: 1.15,
    }),
  });
}

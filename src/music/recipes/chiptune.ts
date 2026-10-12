// Chiptune: two pulse channels (lead + tracker arpeggios), a stepped-triangle bass and
// noise drums, like an old console.
//
// v3 rework against repetition: every section is a phrase plan (statement, answer, sequence,
// cadence) rather than one motif on repeat; verses alternate between two melodies; the
// chorus has its own longer-note hook and climbs a step for the last time round; the second
// channel switches between a dotted-eighth echo and a harmony a third below; a bridge in
// a new progression drops the drums to half time while the arpeggios carry the tune; bass
// figures and drum fills change from section to section.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chordPcs, chordScale, keyName, parseProgression, pc, prefersFlats, SCALES, scalePcs, stepInSet } from '../theory';
import { sentence } from './beds-kit';
import { bassNote, chordAt, chordSpans, layout, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';
import { CHIPTUNE } from './templates';

const BRIDGES = ['IV V iii vi', 'bVI bVII I I', 'ii V I vi', 'IV IV V V', 'vi IV V V'];
const BRIDGES_MINOR = ['bVI bVII i i', 'iv v bVI V', 'bVI bIII bVII V'];

export function composeChiptune(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'chiptune');
  const tweaks = resolveTweaks(req, { bpm: 140, density: 0.6, grit: 0.1, weirdness: 0.15, brightness: 0.7 });
  const { density: D, weirdness: W, brightness: B } = tweaks;

  const tonic = rng.int(0, 11);
  const tplA = rng.pick(CHIPTUNE);
  let tplB = rng.pick(CHIPTUNE);
  for (let k = 0; k < 4 && tplB.prog === tplA.prog; k++) tplB = rng.pick(CHIPTUNE);
  const minor = tplA.scale !== 'major' && tplA.scale !== 'mixolydian';
  const bridge = rng.pick(minor ? BRIDGES_MINOR : BRIDGES);
  const keyScaleOf = (t: number) => scalePcs(t, SCALES[tplA.scale]);
  const flats = prefersFlats(tonic, minor);
  const bpm = pickBpm(rng, req, [124, 160]);
  const shuffle = rng.chance(0.25);
  const { fit, plan } = layout(req, bpm, 4, { unit: 8, pattern: ['A', 'B', 'A', 'B', 'C', 'B'], intro: 2, outro: 2 });
  const b = new ScoreBuilder(req.recipe, req, fit, 4, shuffle ? 0.62 : 0.5, tweaks);
  const beat = b.beat;

  const leadPatch = rng.pick(['chip-pulse25', 'chip-pulse12', 'chip-square'] as const);
  const lead = b.inst({ kind: 'synth', patch: leadPatch, name: 'Pulse lead', gain: 0.6, pan: 0.1 });
  const echo = b.inst({ kind: 'synth', patch: leadPatch, name: 'Echo / harmony', gain: 0.3, pan: -0.35 });
  const arp = b.inst({ kind: 'synth', patch: leadPatch === 'chip-pulse12' ? 'chip-pulse25' : 'chip-pulse12', name: 'Arpeggio', gain: 0.8, pan: -0.15 });
  const tri = b.inst({ kind: 'synth', patch: 'chip-tri', name: 'Triangle bass', gain: 0.7 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-chip', name: 'Noise kick', gain: 0.6 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-chip', name: 'Noise snare', gain: 0.4 });
  const hat = b.inst({ kind: 'sample', patch: 'hat-chip', name: 'Noise hat', gain: 0.22 });

  // Two verse melodies, a chorus hook with longer notes, and a bridge line.
  const verse1 = makeMotif(rng, 8, 0.55 + D * 0.4, { restTail: 1, maxNotes: 7, maxLeap: 4 });
  const verse2 = makeMotif(rng, 8, 0.5 + D * 0.4, { restTail: 1, maxNotes: 7, maxLeap: 4 });
  const hook = makeMotif(rng, 8, 0.35 + D * 0.3, { grid: 0.5, restTail: 1, minNotes: 3, maxNotes: 5, maxLeap: 5 });
  const bridgeLine = makeMotif(rng, 8, 0.3 + D * 0.3, { grid: 0.5, restTail: 2, maxNotes: 4 });
  const arpRate = rng.pick([1 / 30, 1 / 20, 1 / 24]);
  const bassStyles = rng.shuffle([0, 1, 2, 3]);
  const lastB = [...plan].reverse().find((s) => s.part === 'B');
  let prevBass: number | null = null;

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const bridgeSec = s.part === 'C';
    // The last chorus goes up a step, and the tune stays up there to the end.
    const lift = lastB && lastB.repeat > 0 && s.startBar >= lastB.startBar ? (minor ? 1 : 2) : 0;
    const key = tonic + lift;
    const keyScale = keyScaleOf(key);
    const tpl = bridgeSec ? bridge : s.part === 'B' ? tplB.prog : tplA.prog;
    const spans = chordSpans(parseProgression(tpl, key), s, b);
    b.section({ ...s, name: bridgeSec ? `bridge${s.repeat ? '′' : ''}` : s === lastB && lift ? `${s.name} (up)` : s.name }, spans.map((x) => x.chord), flats);
    const bassStyle = bassStyles[(s.part === 'B' ? 1 : bridgeSec ? 2 : 0) + (s.repeat % 2)]! % 4;

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 33, 47);
      prevBass = root;
      // Triangle bass, a different figure per section.
      const eighths = Math.round(span.beats * 2);
      for (let e = 0; e < eighths; e++) {
        if (last && e > 0) break;
        if (bridgeSec && e % 4 !== 0) continue;
        const p =
          bassStyle === 0 ? root + (e % 2 ? 12 : 0) : bassStyle === 1 ? root + [0, 0, 7, 12][e % 4]! : bassStyle === 2 ? root + (e % 4 === 3 ? 7 : 0) : root + [0, 12, 10, 12, 7, 12, 5, 7][e % 8]!;
        b.note(tri, span.t + e * beat * 0.5, (last ? 2 : bridgeSec ? 1.9 : 0.42) * beat, p, 0.8);
      }
      // Tracker arpeggios through the chord (choruses, bridge, ending).
      if (s.part === 'B' || bridgeSec || last || (intro && D > 0.5) || (s.part === 'A' && s.repeat > 1 && k % 2 === 1)) {
        let offsets = chordPcs(span.chord).map((t) => pc(t - span.chord.root)).slice(0, 4).sort((x, y) => x - y);
        if (s.repeat % 2 === 1) offsets = [...offsets].reverse();
        const base = 60 + pc(span.chord.root - 60 + 60);
        const hits = last ? [[0, b.end - span.t - 0.5]] : bridgeSec ? [[0, span.beats]] : [[0, 1.5], [2, 0.75], [3, 0.75]];
        for (const [x, len] of hits) b.note(arp, span.t + x! * beat, len! * beat * (last ? 1 : 0.95), base, 0.55, { arp: offsets, arpRate });
      }
    });

    if (!outro) {
      const fillKind = rng.int(0, 2);
      for (let k = 0; k < s.bars; k++) {
        const bar = s.startBar + k;
        const fill = k % 4 === 3;
        if (bridgeSec) {
          // Half time: kick on one, snare on three.
          b.hit(kick, b.grid.at(bar, 0), 0.9);
          if (k % 2 === 1) b.hit(kick, b.grid.at(bar, 2.5), 0.6);
          b.hit(snare, b.grid.at(bar, 2), 0.8);
          for (let st = 0; st < 4; st++) b.hit(hat, b.grid.at(bar, st), 0.5, 60, 0.1);
          continue;
        }
        b.hit(kick, b.grid.at(bar, 0), 0.9);
        b.hit(kick, b.grid.at(bar, 2), 0.85);
        if (D > 0.5 && !intro) b.hit(kick, b.grid.at(bar, 2.5), 0.6);
        if (!intro || k === s.bars - 1) {
          b.hit(snare, b.grid.at(bar, 1), 0.8);
          if (!fill) b.hit(snare, b.grid.at(bar, 3), 0.8);
          else if (fillKind === 0) for (let f = 0; f < 4; f++) b.hit(snare, b.grid.at(bar, 3 + f * 0.25), 0.5 + f * 0.12);
          else if (fillKind === 1) for (const [x, i] of [[3, kick], [3.25, snare], [3.5, kick], [3.75, snare]] as const) b.hit(i, b.grid.at(bar, x), 0.75);
          else for (let f = 0; f < 6; f++) b.hit(snare, b.grid.at(bar, 2.5 + f * 0.25), 0.4 + f * 0.1);
        }
        const hatStep = s.part === 'B' && D > 0.45 ? 0.25 : 0.5;
        for (let st = 0; st * hatStep < 4; st++) b.hit(hat, b.grid.at(bar, st * hatStep), st % 2 ? 0.45 : 0.65, 60, 0.1);
      }
    } else {
      b.hit(kick, b.grid.bar(s.startBar + s.bars - 1), 0.9);
    }

    if (intro || outro) continue;
    // The lead: a phrase plan per section; the second channel echoes or harmonises.
    const base = bridgeSec ? bridgeLine : s.part === 'B' ? hook : s.repeat % 2 ? verse2 : verse1;
    const cells = sentence(rng, s.repeat > 1 ? varyMotif(rng, base, 0.35) : base, 8, s.repeat);
    const harmony = s.part === 'B' ? s.repeat % 2 === 1 : s.repeat % 2 === 0 && s.repeat > 0;
    const octaveUp = s.part === 'A' && s.repeat >= 2 && rng.chance(0.5);
    for (let ph = 0; ph + 2 <= s.bars; ph += 2) {
      const cell = cells[(ph / 2) % 4]!;
      if (bridgeSec && (ph / 2) % 2 === 1) continue; // the arpeggios carry the bridge
      const notes = realizeMotif(cell, 0, beat, key + 76, spans, keyScale, 67, 88, b.grid, s.startBar + ph);
      for (const n of notes) {
        let p = n.p + (octaveUp && n.p + 12 <= 93 ? 12 : 0);
        if (W > 0.5 && rng.chance((W - 0.5) * 0.3)) p += 12;
        const slide = W > 0.3 && rng.chance(W * 0.2) ? { from: p - 2, glide: 0.04 } : {};
        b.note(lead, n.t, Math.min(n.d, beat * (s.part === 'B' ? 2 : 1.5)), p, vel(rng, n.strong ? 0.75 : 0.65, 0.03), slide);
        if (harmony) {
          const here = chordAt(spans, n.t + 0.01).chord;
          const low = stepInSet(p, chordScale(here, keyScale), -2);
          b.note(echo, n.t, Math.min(n.d, beat * 1.5), low, 0.55);
        } else b.note(echo, n.t + beat * 0.75, Math.min(n.d, beat), p, 0.5);
      }
    }
  }

  return b.build({
    key: keyName(tonic, tplA.scale),
    progression: `${tplA.prog} / ${tplB.prog} / bridge ${bridge}`,
    fx: trackFx({
      gain: 0.47,
      lowpass: 9000 + B * 9000,
      highpass: 40,
      wow: W * 1.2,
      wowRate: 0.5,
      flutter: 0,
      drive: 0,
      reverbTone: 6000,
      reverbLevel: 0.25,
    }),
  });
}

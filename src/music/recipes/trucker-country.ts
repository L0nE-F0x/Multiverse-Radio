// Trucker country: late-night songs for the CB. A boom-chicka two-step (or a slow country
// waltz): upright bass on the beats, muted acoustic strums on the backbeat, brushes. A
// pedal steel swells under the chord changes and bends up into the IV and V; a lonesome
// harmonica carries the verse and takes the break; the steel sings the chorus.

import type { TrackRequest } from '../index';
import { rngFor } from '../rng';
import type { Score } from '../score';
import { bassPc, chord, chordPcs, keyName, nearestInSet, notesInRange, parseProgression, pc, prefersFlats, SCALES, scalePcs, voiceChord } from '../theory';
import { bedForm, cadence, sentence, strum } from './beds-kit';
import { bassNote, chordSpans, lerp, makeMotif, pickBpm, realizeMotif, resolveTweaks, ScoreBuilder, trackFx, varyMotif, vel } from './common';

const VERSE = ['I I IV I I I V V', 'I I7 IV IV I V I I', 'I IV I V I IV V I', 'I I IV IV V V I I', 'I vi IV V I vi V I'];
const CHORUS = ['IV IV I I V V I I', 'IV I V I IV I V I', 'vi IV I V vi IV V V', 'IV IV I vi ii V I I'];

export function composeTruckerCountry(req: TrackRequest): Score {
  const rng = rngFor(req.seed, 'trucker-country');
  const tweaks = resolveTweaks(req, { bpm: 100, density: 0.5, grit: 0.2, weirdness: 0.1, brightness: 0.5 });
  const { density: D, grit: G, weirdness: W, brightness: B } = tweaks;
  const tonic = rng.pick([7, 2, 9, 4, 0, 5]); // guitar keys: G, D, A, E, C, F
  const waltz = rng.chance(0.35);
  const meter = waltz ? 3 : 4;
  const verseTpl = rng.pick(VERSE);
  const chorusTpl = rng.pick(CHORUS);
  const progA = parseProgression(verseTpl, tonic);
  const progB = parseProgression(chorusTpl, tonic);
  const keyScale = scalePcs(tonic, SCALES.major);
  // Harmonica: major pentatonic plus the blue third.
  const harpScale = [...scalePcs(tonic, SCALES.majorPent), pc(tonic + 3)];
  const flats = prefersFlats(tonic, false);
  const bpm = pickBpm(rng, req, waltz ? [96, 120] : [92, 110]);
  const { fit, plan } = bedForm(req, bpm, meter, { unit: 8, pattern: ['A', 'B', 'A', 'C', 'B'], intro: [1, 2, 2], outro: [1, 2, 2] });
  const b = new ScoreBuilder(req.recipe, req, fit, meter, waltz ? 0.5 : rng.range(0.54, 0.58), tweaks, 2);
  const beat = b.beat;

  const bass = b.inst({ kind: 'sample', patch: rng.chance(0.6) ? 'bass-upright' : 'bass-round', name: 'Bass', gain: 0.45 });
  const guitar = b.inst({ kind: 'sample', patch: 'folk-guitar', name: 'Rhythm guitar', gain: 1.0, pan: 0.2, highpass: 180, reverb: 0.1 });
  const kick = b.inst({ kind: 'sample', patch: 'kick-soft', name: 'Kick', gain: 0.3 });
  const snare = b.inst({ kind: 'sample', patch: 'snare-brush', name: 'Brushed snare', gain: 0.45, pan: 0.05, reverb: 0.12 });
  const shaker = b.inst({ kind: 'sample', patch: 'shaker', name: 'Shaker', gain: 0.2, pan: -0.3 });
  const steel = b.inst({ kind: 'synth', patch: 'pedal-steel', name: 'Pedal steel', gain: 0.42, pan: 0.3, reverb: 0.4, delay: 0.12 });
  const harp = b.inst({ kind: 'synth', patch: 'blues-harp', name: 'Harmonica', gain: 0.4, pan: -0.2, reverb: 0.3, delay: 0.1 });

  const cellBeats = meter * 2;
  const verse = makeMotif(rng, cellBeats, 0.35 + D * 0.3, { restTail: 1.5, minNotes: 3, maxNotes: 5, maxLeap: 3 });
  const chorus = makeMotif(rng, cellBeats, 0.3 + D * 0.25, { grid: 1, restTail: 1, minNotes: 2, maxNotes: 4, maxLeap: 3 });
  const brk = makeMotif(rng, cellBeats, 0.5 + D * 0.3, { restTail: 1, minNotes: 4, maxNotes: 6, maxLeap: 3 });
  let voicing: number[] | null = null;
  let prevBass: number | null = null;
  let steelVoicing: number[] | null = null;

  /** A steel swell under a chord: two or three notes, the top one pedalled up a step. */
  const swell = (t: number, d: number, c: ReturnType<typeof chord>, bend: boolean, v: number) => {
    steelVoicing = voiceChord(c, steelVoicing, { low: 62, high: 77, voices: 2, rootless: false });
    steelVoicing.forEach((p, j) => {
      const top = j === steelVoicing!.length - 1;
      b.note(steel, t, d, p, vel(rng, v, 0.04), bend && top ? { from: p - 2, glide: Math.min(0.5, d * 0.3) } : {});
    });
  };

  for (const s of plan) {
    const intro = s.part === 'intro';
    const outro = s.part === 'outro';
    const spans = chordSpans(intro ? parseProgression('V', tonic) : s.part === 'B' ? progB : progA, s, b);
    if (outro) spans.forEach((sp, k) => (sp.chord = k === spans.length - 1 || spans.length === 1 ? chord(tonic, '6') : chord(tonic + 7, '7')));
    b.section({ ...s, name: s.part === 'A' ? `verse${s.repeat ? ' ' + (s.repeat + 1) : ''}` : s.part === 'B' ? 'chorus' : s.part === 'C' ? 'harmonica break' : s.name }, spans.map((x) => x.chord), flats);

    spans.forEach((span, k) => {
      const last = outro && k === spans.length - 1;
      const root = bassNote(bassPc(span.chord), prevBass, 33, 47);
      const fifth = root + 7 <= 50 ? root + 7 : root - 5;
      prevBass = root;
      voicing = voiceChord(span.chord, voicing, { low: 52, high: 67, voices: 4, rootless: false });
      const changes = k === 0 || spans[k - 1]!.chord !== span.chord;
      if (last) {
        strum(b, guitar, span.t, voicing, { rng, d: b.end - span.t - 0.4, v: 0.75, spread: 0.03 });
        b.note(bass, span.t, beat * 3, root, 0.75);
        swell(span.t, b.end - span.t - 0.5, span.chord, true, 0.6);
        return;
      }
      // Boom-chicka (boom-chick-chick in three).
      if (!intro) {
        b.note(bass, span.t, beat * 0.9, k % 2 ? fifth : root, vel(rng, 0.8));
        if (!waltz) b.note(bass, b.grid.at(span.bar, 2), beat * 0.9, k % 2 ? root : fifth, vel(rng, 0.7));
        // A walk up into a new chord now and then.
        const next = spans[k + 1];
        if (!waltz && next && next.chord !== span.chord && rng.chance(0.4)) {
          const target = bassNote(bassPc(next.chord), root, 33, 47);
          const dir = target >= root ? 1 : -1;
          [3, 3.5].forEach((x, j) => b.note(bass, b.grid.at(span.bar, x), beat * 0.45, target - dir * (2 - j), vel(rng, 0.6)));
        }
        for (const x of waltz ? [1, 2] : [1, 3]) {
          strum(b, guitar, b.grid.at(span.bar, x), voicing, { rng, d: beat * 0.18, v: 0.6, spread: 0.007 });
          b.hit(snare, b.grid.at(span.bar, x), vel(rng, waltz ? 0.4 : 0.55));
        }
        b.hit(kick, span.t, vel(rng, 0.6));
        for (let e = 0; e < meter * 2; e++) b.hit(shaker, b.grid.at(span.bar, e * 0.5), vel(rng, e % 2 ? 0.35 : 0.25), 60, 0.2);
      }
      // Steel swells under the verse and the break, bending into IV and V.
      if (changes && (s.part === 'A' || s.part === 'C' || intro)) {
        let len = span.dur;
        for (let j = k + 1; j < spans.length && spans[j]!.chord === span.chord; j++) len += spans[j]!.dur;
        const isIVorV = [5, 7].includes(pc(span.chord.root - tonic));
        swell(span.t + (intro ? 0 : beat * 0.5), Math.max(beat, len - beat * 0.7), span.chord, isIVorV && rng.chance(0.7), s.part === 'C' ? 0.42 : 0.5);
      }
    });
    if (outro) continue;

    if (intro) {
      // Harmonica pickup into the verse.
      const end = b.grid.bar(s.startBar + s.bars);
      const pick = notesInRange(harpScale, 64, 74).slice(-3);
      pick.forEach((p, j) => b.note(harp, end - (3 - j) * beat * 0.5, beat * 0.5, p, 0.55, j === 2 ? { from: p - 1, glide: 0.1 } : {}));
      continue;
    }
    const nCells = Math.floor(s.bars / 2);
    if (s.part === 'B') {
      // Chorus: the steel sings, the harmonica holds a long note now and then.
      const cells = sentence(rng, chorus, cellBeats, s.repeat);
      for (let c = 0; c < nCells; c++) {
        const notes = realizeMotif(cells[c % 4]!, 0, beat, tonic + 72, spans, keyScale, 64, 81, b.grid, s.startBar + c * 2);
        notes.forEach((n) => b.note(steel, n.t, n.d * 0.95, n.p, vel(rng, n.strong ? 0.6 : 0.52), rng.chance(0.4) ? { from: n.p - (rng.chance(0.5) ? 1 : 2), glide: 0.18 } : {}));
        if (c % 2 === 1 && rng.chance(0.5)) {
          const t = b.grid.at(s.startBar + c * 2 + 1, 0);
          b.note(harp, t, beat * meter * 0.9, nearestInSet(tonic + 69, chordPcs(spans[Math.min(spans.length - 1, c * 2 + 1)]!.chord)), 0.4);
        }
      }
      continue;
    }
    // Verse: the harmonica sings in the first and third cells; the steel answers in the others.
    const cells = sentence(rng, s.part === 'C' ? brk : verse, cellBeats, s.repeat);
    for (let c = 0; c < nCells; c++) {
      const bar = s.startBar + c * 2;
      if (s.part === 'A' && c % 2 === 1) {
        if (!rng.chance(0.5 + D * 0.3)) continue;
        const lick = cadence(varyMotif(rng, makeMotif(rng, cellBeats / 2, 0.4, { restTail: 0.5, minNotes: 2, maxNotes: 3 }), 0.3), rng.pick([0, 2, 4]), cellBeats / 2);
        realizeMotif(lick, 0, beat, tonic + 76, spans, keyScale, 69, 84, b.grid, bar + 1).forEach((n) =>
          b.note(steel, n.t, n.d, n.p, vel(rng, 0.45), { from: n.p - 1, glide: 0.12 }),
        );
        continue;
      }
      const notes = realizeMotif(cells[c % 4]!, 0, beat, tonic + 67, spans, harpScale, 60, 81, b.grid, bar);
      notes.forEach((n, j) => {
        const bend = (j === 0 || n.d > beat * 1.2) && rng.chance(0.55) ? { from: n.p - 1, glide: 0.12 } : {};
        b.note(harp, n.t, n.d * 0.95, n.p, vel(rng, n.strong ? 0.6 : 0.5), bend);
      });
    }
  }
  void W;
  return b.build({
    key: keyName(tonic, 'major'),
    progression: `${waltz ? 'waltz' : 'two-step'}: ${verseTpl} / ${chorusTpl}`,
    fx: trackFx({
      gain: 0.62,
      lowpass: lerp(5500, 11000, B),
      highpass: 40,
      wow: 0.4 + G * 1.6,
      wowRate: 0.45,
      flutter: G * 0.04,
      drive: 0.06 + G * 0.25,
      delay: { time: beat * 0.75, feedback: 0.25, tone: 2800, wet: 0.35 },
      reverbTone: 5000,
      reverbLevel: 0.9,
    }),
  });
}

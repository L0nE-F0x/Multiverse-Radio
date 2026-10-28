// Melodic station call-sign jingles, beat-matched talkover intros ("hitting the post"),
// and formant choir / vocoder / vocal-chop layer enrichment (v5).

import type { RecipeId } from '../broadcast/types';
import type { TrackRequest } from './index';
import { artistSeed } from './recipes/artist';
import { hashString, Rng } from './rng';
import { clamp, type Score, type SynthPatch } from './score';
import { nearestInSet, SCALES, scalePcs, stepInSet } from './theory';

const NOTE_LOOKUP: Record<string, number> = {
  C: 0,
  'C♯': 1,
  'C#': 1,
  'D♭': 1,
  Db: 1,
  D: 2,
  'D♯': 3,
  'D#': 3,
  'E♭': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F♯': 6,
  'F#': 6,
  'G♭': 6,
  Gb: 6,
  G: 7,
  'G♯': 8,
  'G#': 8,
  'A♭': 8,
  Ab: 8,
  A: 9,
  'A♯': 10,
  'A#': 10,
  'B♭': 10,
  Bb: 10,
  B: 11,
};

/** Parses `score.key` (e.g. "B♭ dorian", "F♯ minor", "D major") into tonic pitch class + scale pcs. */
export function parseScoreKey(key: string): { tonic: number; scale: number[] } {
  const parts = key.trim().split(/\s+/);
  const rootToken = parts[0] ?? 'C';
  const modeToken = parts.slice(1).join(' ').toLowerCase();
  const tonic = NOTE_LOOKUP[rootToken] ?? 0;

  let intervals: readonly number[] = SCALES.major;
  if (modeToken.includes('harmonic')) intervals = SCALES.harmonicMinor;
  else if (modeToken.includes('melodic')) intervals = SCALES.melodicMinor;
  else if (modeToken.includes('hungarian')) intervals = SCALES.hungarianMinor;
  else if (modeToken.includes('dorian')) intervals = SCALES.dorian;
  else if (modeToken.includes('phrygian')) intervals = SCALES.phrygian;
  else if (modeToken.includes('lydian dominant')) intervals = SCALES.lydianDominant;
  else if (modeToken.includes('lydian')) intervals = SCALES.lydian;
  else if (modeToken.includes('mixolydian')) intervals = SCALES.mixolydian;
  else if (modeToken.includes('minor')) intervals = SCALES.minor;

  return { tonic, scale: scalePcs(tonic, intervals) };
}

/** Vocal-friendly recipes that weave subtle formant choir / vocoder / vocal-chop layers into choruses/drops. */
const VOCAL_GENRES: Partial<Record<RecipeId, readonly SynthPatch[]>> = {
  'sea-shanty': ['shanty-choir', 'formant-choir'],
  'city-pop': ['vocal-chop', 'vocoder-pad'],
  'heat-death-house': ['formant-choir', 'vocoder-pad'],
  disco: ['formant-choir', 'vocal-chop'],
  'space-funk': ['vocoder-pad', 'vocal-chop'],
  'infinite-song': ['formant-choir'],
  baroque: ['formant-choir'],
  'roots-reggae': ['formant-choir', 'vocal-chop'],
};

function isChorusOrDrop(name: string): boolean {
  const low = name.toLowerCase();
  return (
    low.includes('chorus') ||
    low.includes('peak') ||
    low.includes('refrain') ||
    low.includes('collapse') ||
    low.includes('drop') ||
    low.includes('bridge') ||
    low.startsWith('b')
  );
}

/** Weaves a subtle formant choir / vocoder / vocal-chop layer into chorus/drop sections of vocal-friendly genres. */
function enrichVocalLayer(score: Score, req: TrackRequest): void {
  const patches = VOCAL_GENRES[score.recipe];
  if (!patches || score.duration < 8) return;

  // Deterministic per (recipe, artist) so an artist's instrument palette never varies across song seeds.
  const idx =
    patches.length > 1 && req.artist !== undefined
      ? hashString(`v5-vocal:${score.recipe}`, req.artist) % patches.length
      : 0;
  const patch = patches[idx]!;

  // Reuse an existing instrument with the same formant patch if present (e.g. sea-shanty's shanty-choir),
  // or append a dedicated vocal/formant bus.
  let instIdx = score.instruments.findIndex((i) => i.kind === 'synth' && i.patch === patch);
  if (instIdx < 0) {
    instIdx = score.instruments.length;
    score.instruments.push({
      kind: 'synth',
      patch,
      name:
        patch === 'shanty-choir'
          ? 'Shanty choir'
          : patch === 'vocoder-pad'
            ? 'Vocoder choir'
            : patch === 'vocal-chop'
              ? 'Vocal hook'
              : 'Formant choir',
      gain: patch === 'vocal-chop' ? 0.24 : 0.26,
      reverb: 0.42,
      pan: 0.08,
      lowpass: 3600,
    });
  }

  const { tonic, scale } = parseScoreKey(score.key);
  const rng = new Rng(hashString(`vocal-layer:${score.recipe}`, req.seed));
  const targetSections = score.sections.filter((s) => isChorusOrDrop(s.name));
  const sections =
    targetSections.length > 0
      ? targetSections
      : score.sections.filter((s) => s.name !== 'intro' && s.name !== 'outro').slice(0, 2);

  // For heat-death-house, thin out the vocal layer as the DJ slows the tempo down.
  const barStep =
    score.recipe === 'heat-death-house'
      ? score.bpm >= 118
        ? 4
        : score.bpm >= 108
          ? 8
          : 16
      : 4;

  const anchor = 60 + tonic;
  const isChop = patch === 'vocal-chop';

  for (const sec of sections) {
    for (let k = 0; k < sec.bars; k += barStep) {
      const bar = sec.startBar + k;
      const t = bar * score.barDur + (isChop ? score.barDur * 0.25 : 0);
      if (t < 0 || t >= score.duration - 0.35) continue;
      const maxDur = Math.min(isChop ? score.barDur * 0.45 : score.barDur * 1.6, 7.5, score.duration - t - 0.1);
      if (maxDur <= 0.08) continue;

      const rootNote = clamp(nearestInSet(anchor, scale), 55, 74);
      const thirdNote = clamp(stepInSet(rootNote, scale, 2), 58, 77);
      const fifthNote = clamp(stepInSet(rootNote, scale, 4), 60, 79);

      if (isChop) {
        const pickP = rng.pick([rootNote + 12, thirdNote + 12, fifthNote]);
        score.events.push({
          t,
          d: maxDur,
          i: instIdx,
          p: clamp(pickP, 60, 81),
          v: clamp(0.32 + rng.next() * 0.08, 0.1, 0.5),
        });
      } else {
        score.events.push(
          {
            t,
            d: maxDur,
            i: instIdx,
            p: rootNote,
            v: clamp(0.3 + rng.next() * 0.06, 0.1, 0.45),
          },
          {
            t: Math.min(score.duration - maxDur - 0.05, t + 0.012),
            d: maxDur,
            i: instIdx,
            p: thirdNote,
            v: clamp(0.26 + rng.next() * 0.06, 0.1, 0.42),
          },
        );
      }
    }
  }
}

/**
 * Applies beat-matched talkover intro filter automation ("hitting the post"),
 * melodic station call-sign jingles, and vocal/formant layer enrichment.
 */
export function applyTalkoverAndJingle(score: Score, req: TrackRequest): Score {
  // 1. Formant choir / vocoder / vocal-chop enrichment on vocal-friendly genres.
  enrichVocalLayer(score, req);

  // 2. Beat-Matched Talkover Intro ("Hitting the Post").
  const hasTalkover = typeof req.talkoverSeconds === 'number' && Number.isFinite(req.talkoverSeconds) && req.talkoverSeconds > 0.5;
  const postTime = hasTalkover ? Math.min(req.talkoverSeconds!, score.duration * 0.45) : 0;

  if (hasTalkover) {
    const warmCutoff = Math.min(score.fx.lowpass, 1150);
    const openAt = Math.max(0.2, postTime - 0.15);

    // Replace any early cutoff automations in [0, postTime] so the filter stays warm until the post.
    score.autos = score.autos.filter((a) => !(a.target === 'cutoff' && a.t <= postTime + 0.05));
    if (openAt < score.duration) {
      score.autos.push(
        { t: 0, target: 'cutoff', value: warmCutoff, tau: 0.05 },
        { t: openAt, target: 'cutoff', value: score.fx.lowpass, tau: 0.25 },
      );
    }

    // Gently tuck high-register lead notes during the talkover bed so the voice sits on top.
    for (const e of score.events) {
      if (e.t < openAt && e.p >= 64) {
        e.v = clamp(e.v * 0.78, 0.02, 1);
      }
    }
  }

  // 3. Melodic Station Call-Sign Jingle.
  if (req.jingle && score.duration >= 3) {
    const stationKey = req.stationId && req.stationId.trim().length > 0 ? req.stationId : `station-${req.seed}`;
    const jingleSeed = artistSeed(stationKey);
    const rng = new Rng(jingleSeed);

    const { tonic, scale } = parseScoreKey(score.key);
    const jinglePatch = rng.pick(['celesta', 'vibes', 'glass'] as const);
    const jingleInst = score.instruments.length;
    score.instruments.push({
      kind: 'sample',
      patch: jinglePatch,
      name: 'Station call-sign',
      gain: 0.26,
      reverb: 0.42,
      pan: 0.1,
    });

    // Deterministic 4-note station call-sign contour in the track's key/scale.
    const s0 = rng.pick([0, 1, 2, 4, -2, 5]);
    const s1 = s0 + rng.pick([1, 2, 3, 4, -1, -2, -3]);
    const s2 = s1 + rng.pick([1, 2, 3, -1, -2, -3, 4]);
    let s3 = rng.pick([0, 2, 4, 6, 7, 9]);
    if (s3 === s2) s3 += 2;
    const steps = [s0, s1, s2, s3];

    const anchor = 68 + ((tonic + rng.int(0, 2) * 2) % 12);
    const beatDur = score.barDur / Math.max(1, score.beatsPerBar);
    const rawStart = hasTalkover
      ? Math.max(0.1, Math.min(postTime, score.duration * 0.45))
      : Math.min(0.2, score.duration * 0.04);
    const baseT = Math.max(0, Math.min(rawStart, score.duration - 1.2));
    const avail = Math.max(0.6, score.duration - baseT - 0.15);
    const stepDur = clamp(beatDur * rng.pick([0.45, 0.55, 0.68]), 0.12, Math.min(0.42, avail / 4.8));

    for (let k = 0; k < 4; k++) {
      const t = baseT + k * stepDur;
      if (t >= score.duration - 0.08) break;
      const d = Math.min(k === 3 ? stepDur * 1.6 : stepDur * 1.05, score.duration - t - 0.02);
      if (d <= 0.02) continue;

      const leadPitch = clamp(stepInSet(nearestInSet(anchor, scale), scale, steps[k]!), 60, 88);
      const harmPitch = clamp(stepInSet(leadPitch, scale, k === 3 ? -4 : -2), 52, 82);

      score.events.push({
        t,
        d,
        i: jingleInst,
        p: leadPitch,
        v: k === 3 ? 0.56 : 0.48,
      });

      const harmT = t + 0.008;
      const harmD = Math.min(d, score.duration - harmT - 0.02);
      if (harmD > 0.02 && harmPitch !== leadPitch) {
        score.events.push({
          t: harmT,
          d: harmD,
          i: jingleInst,
          p: harmPitch,
          v: 0.32,
        });
      }
    }
  }

  score.autos.sort((a, b) => a.t - b.t);
  score.events.sort((a, b) => a.t - b.t);
  return score;
}

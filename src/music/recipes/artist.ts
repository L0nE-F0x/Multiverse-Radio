// Artist signatures (v3). `TrackRequest.artist` is a hash of the artist's name; every
// track by that artist shares a recognisable sound while `seed` still writes a new song.
//
// A signature works on three levels:
//  1. Every recipe (compose → common.ts): tempo sits at the artist's spot in the recipe's
//     range (pickBpm), density/brightness/grit/weirdness lean their way (resolveTweaks),
//     and the mix carries their production fingerprint (reverb, tape, warmth: signScore).
//  2. Taste: while their track is composed, every named choice a recipe makes from a list
//     (instrument patches, comping styles, fills, melodic contours...) leans toward what
//     this artist likes (Rng.taste). The same likes hold across all recipes, so someone
//     who loves the felt piano reaches for it on any station.
//  3. The v3 genre recipes go further (v3-kit.ts): their palette, feel and form come from
//     a style stream seeded by the artist (not the song), and their melodies start from
//     the artist's own phrasing (a rhythm and contour that recur from song to song).
//
// No artist ⇒ none of this runs and every recipe behaves exactly as before.

import { hashString, mix32 } from '../rng';
import type { Score } from '../score';

export interface ArtistSignature {
  /** The artist hash. */
  id: number;
  /** Where in a recipe's tempo range this artist sits, 0 = slow end, 1 = fast end. */
  tempo: number;
  /** How far (fraction of the range) their songs stray from that tempo. */
  spread: number;
  /** Feel: −1 = straight and on top of the beat, +1 = deep swing, laid back. */
  swing: number;
  /** Leaning toward minor modes, 0..1 (0.5 = no preference). */
  minor: number;
  /** Nudges added to the station's tweaks. */
  density: number;
  brightness: number;
  grit: number;
  weirdness: number;
  /** Production: reverb return multiplier, extra tape wow (ms), extra saturation. */
  reverb: number;
  tape: number;
  warmth: number;
  /** Three favourite keys (pitch classes); songs land in one of them about half the time. */
  keys: number[];
  /** Seed for the artist's melodic phrasing. */
  phrasing: number;
  /** Preference multiplier for a named choice (> 1 = likes it). Stable per artist. */
  taste(item: string): number;
}

/** The hash the director passes as `TrackRequest.artist` for an artist's name. */
export function artistSeed(name: string): number {
  return hashString(name.trim().toLowerCase().replace(/\s+/g, ' '), 0xa27157);
}

const cache = new Map<number, ArtistSignature>();

/** Deterministic uniform in [0, 1) for (artist, label). */
function u(artist: number, label: string): number {
  return hashString(label, artist) / 4294967296;
}

/** Approximately normal (mean 0, sd ~1) for (artist, label). */
function g(artist: number, label: string): number {
  const x = mix32(hashString(label, artist));
  let s = 0;
  for (let k = 0; k < 4; k++) s += ((x >>> (k * 8)) & 0xff) / 255;
  return (s - 2) * 1.73;
}

export function signatureOf(artist: number): ArtistSignature {
  const id = artist >>> 0;
  const hit = cache.get(id);
  if (hit) return hit;
  const tastes = new Map<string, number>();
  const keys: number[] = [];
  for (let k = 0; keys.length < 3 && k < 24; k++) {
    const pcv = hashString(`key${k}`, id) % 12;
    if (!keys.includes(pcv)) keys.push(pcv);
  }
  const sig: ArtistSignature = {
    id,
    tempo: 0.05 + 0.9 * u(id, 'tempo'),
    spread: 0.12 + 0.18 * u(id, 'spread'),
    swing: u(id, 'swing') * 2 - 1,
    minor: u(id, 'minor'),
    density: (u(id, 'density') - 0.5) * 0.24,
    brightness: (u(id, 'brightness') - 0.5) * 0.3,
    grit: (u(id, 'grit') - 0.4) * 0.25,
    weirdness: (u(id, 'weirdness') - 0.4) * 0.2,
    reverb: 0.8 + 0.45 * u(id, 'reverb'),
    tape: 0.8 * u(id, 'tape') ** 2,
    warmth: u(id, 'warmth'),
    keys,
    phrasing: hashString('phrasing', id),
    taste(item: string): number {
      let t = tastes.get(item);
      if (t === undefined) {
        // Log-normal: most artists have a clear favourite or two and a few dislikes.
        t = Math.exp(1.25 * g(id, `taste:${item}`));
        tastes.set(item, t);
      }
      return t;
    },
  };
  if (cache.size > 256) cache.clear();
  cache.set(id, sig);
  return sig;
}

/** The artist's production fingerprint on a finished score (all recipes). */
export function signScore(score: Score, sig: ArtistSignature): Score {
  const fx = score.fx;
  return {
    ...score,
    fx: {
      ...fx,
      reverbLevel: (fx.reverbLevel ?? 1) * sig.reverb,
      wow: fx.wow + sig.tape,
      wowRate: fx.wow + sig.tape > 0 ? fx.wowRate || 0.5 : fx.wowRate,
      drive: Math.min(1, fx.drive + Math.max(0, sig.warmth - 0.3) * 0.12),
    },
  };
}

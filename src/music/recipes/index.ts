// Recipe registry: RecipeId → composer. Composition is pure and seeded.

import type { RecipeId } from '../../broadcast/types';
import type { TrackRequest } from '../index';
import type { Score } from '../score';
import { composeAmbient } from './ambient';
import { composeBaroque } from './baroque';
import { composeDocumentary, composeFanfare, composeNews, composeTalk } from './beds';
import { composeChiptune } from './chiptune';
import { composeDub } from './dub';
import { composeJazz } from './jazz';
import { composeLofi } from './lofi';
import { composeLullaby, composeNumbers } from './lullaby';
import { composeMuzak } from './muzak';
import { composePolka } from './polka';
import { composeSynthwave } from './synthwave';
import { composeTropical } from './tropical';

import { Rng } from '../rng';
import { signatureOf, signScore } from './artist';
import { BEDS_V3 } from './v3-beds';
import { GENRES_V3 } from './v3-genres';
import { WORLD_V4 } from './v4-world';

export type Composer = (req: TrackRequest) => Score;

/** Recipes without a composer yet fall back to lo-fi (see compose). */
const COMPOSERS: Partial<Record<RecipeId, Composer>> = {
  ...GENRES_V3,
  ...BEDS_V3,
  ...WORLD_V4,
  'lofi-hiphop': composeLofi,
  'lofi-rain': composeLofi,
  'lofi-slow': composeLofi,
  'lofi-glass': composeLofi,
  synthwave: composeSynthwave,
  'lounge-jazz': composeJazz,
  muzak: composeMuzak,
  'ambient-drift': composeAmbient,
  chiptune: composeChiptune,
  baroque: composeBaroque,
  dub: composeDub,
  polka: composePolka,
  'tropical-marimba': composeTropical,
  'static-lullaby': composeLullaby,
  'news-bed': composeNews,
  'talk-bed': composeTalk,
  'sports-fanfare': composeFanfare,
  'numbers-musicbox': composeNumbers,
  documentary: composeDocumentary,
};

/** Composes a full track. Unknown recipes fall back to lo-fi so something always plays. */
export function compose(req: TrackRequest): Score {
  const safe: TrackRequest = {
    ...req,
    seed: (Number.isFinite(req.seed) ? req.seed : 0) >>> 0,
    durationSeconds: Math.max(4, Math.min(3600, Number.isFinite(req.durationSeconds) ? req.durationSeconds : 180)),
  };
  if (safe.artist !== undefined) {
    if (Number.isFinite(safe.artist)) safe.artist = safe.artist >>> 0;
    else delete safe.artist;
  }
  const fn = COMPOSERS[safe.recipe];
  const run = (): Score => (fn ? fn(safe) : { ...composeLofi({ ...safe, recipe: 'lofi-hiphop' }), recipe: safe.recipe });
  if (safe.artist === undefined) return run();
  // An artist's track: their taste steers named choices, their mix goes on top (artist.ts).
  const sig = signatureOf(safe.artist);
  const outer = Rng.taste;
  Rng.taste = sig.taste;
  try {
    return signScore(run(), sig);
  } finally {
    Rng.taste = outer;
  }
}

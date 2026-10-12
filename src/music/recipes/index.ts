// Recipe registry: RecipeId → composer. Composition is pure and seeded.

import type { RecipeId } from '../../broadcast/types';
import type { TrackRequest } from '../index';
import type { Score } from '../score';
import { composeLofi } from './lofi';

type Composer = (req: TrackRequest) => Score;

const COMPOSERS: Partial<Record<RecipeId, Composer>> = {
  'lofi-hiphop': composeLofi,
  'lofi-rain': composeLofi,
  'lofi-slow': composeLofi,
  'lofi-glass': composeLofi,
};

/** Composes a full track. Unknown recipes fall back to lo-fi so something always plays. */
export function compose(req: TrackRequest): Score {
  const safe: TrackRequest = {
    ...req,
    seed: req.seed >>> 0,
    durationSeconds: Math.max(4, Math.min(3600, Number.isFinite(req.durationSeconds) ? req.durationSeconds : 180)),
  };
  const fn = COMPOSERS[safe.recipe];
  if (fn) return fn(safe);
  return { ...composeLofi({ ...safe, recipe: 'lofi-hiphop' }), recipe: safe.recipe };
}

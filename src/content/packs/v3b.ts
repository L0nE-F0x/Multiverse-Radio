// Track-naming packs for v3 stations (writers-new-b): tomorrows-leftovers, other-horoscopes, unsolved-dimensions, win-this-planet, bedtime-for-giants, tiny-hour, infinite-song, cat-fm, yesterday-fm, plant-fm.

import type { RecipeId } from '../../broadcast/types';
import type { TrackPack } from './types';

export const V3B_STATION_PACKS: Readonly<Record<string, TrackPack>> = {};

/** Packs for the new recipes these stations introduce. */
export const V3B_RECIPE_PACKS: Readonly<Partial<Record<RecipeId, TrackPack>>> = {};

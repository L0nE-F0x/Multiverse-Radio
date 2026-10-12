// Track-naming packs for v3 stations (writers-new-a): smoke-ring-trio, lower-hollow, bubble-economy, breakbeat-observatory, piano-empty-rooms, wall-of-fog, drowned-shanty-hour, event-horizon-surf, gristwick-parish, waystation-9.

import type { RecipeId } from '../../broadcast/types';
import type { TrackPack } from './types';

export const V3A_STATION_PACKS: Readonly<Record<string, TrackPack>> = {};

/** Packs for the new recipes these stations introduce. */
export const V3A_RECIPE_PACKS: Readonly<Partial<Record<RecipeId, TrackPack>>> = {};

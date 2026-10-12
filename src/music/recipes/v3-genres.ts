// v3 genre and concept recipes (owned by the music-genres workstream): jazz-trio, city-pop,
// drum-and-bass, ambient-piano, shoegaze, sea-shanty, surf-rock, soft-rock, cat-piano,
// photosynth, infinite-song.

import type { RecipeId } from '../../broadcast/types';
import type { Composer } from './index';
import { composeCityPop } from './city-pop';
import { composeDrumAndBass } from './drum-and-bass';
import { composeJazzTrio } from './jazz-trio';

export const GENRES_V3: Partial<Record<RecipeId, Composer>> = {
  'jazz-trio': composeJazzTrio,
  'city-pop': composeCityPop,
  'drum-and-bass': composeDrumAndBass,
};

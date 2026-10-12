// v3 genre and concept recipes (owned by the music-genres workstream): jazz-trio, city-pop,
// drum-and-bass, ambient-piano, shoegaze, sea-shanty, surf-rock, soft-rock, cat-piano,
// photosynth, infinite-song.

import type { RecipeId } from '../../broadcast/types';
import { composeAmbientPiano } from './ambient-piano';
import { composeCatPiano } from './cat-piano';
import { composeCityPop } from './city-pop';
import { composeDrumAndBass } from './drum-and-bass';
import type { Composer } from './index';
import { composeInfiniteSong } from './infinite-song';
import { composeJazzTrio } from './jazz-trio';
import { composePhotosynth } from './photosynth';
import { composeSeaShanty } from './sea-shanty';
import { composeShoegaze } from './shoegaze';
import { composeSoftRock } from './soft-rock';
import { composeSurfRock } from './surf-rock';

export const GENRES_V3: Partial<Record<RecipeId, Composer>> = {
  'jazz-trio': composeJazzTrio,
  'city-pop': composeCityPop,
  'drum-and-bass': composeDrumAndBass,
  'ambient-piano': composeAmbientPiano,
  shoegaze: composeShoegaze,
  'sea-shanty': composeSeaShanty,
  'surf-rock': composeSurfRock,
  'soft-rock': composeSoftRock,
  'cat-piano': composeCatPiano,
  photosynth: composePhotosynth,
  'infinite-song': composeInfiniteSong,
};

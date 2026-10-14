// v4 world recipes and talk beds (owned by the music-world workstream): roots-reggae,
// island-reggae, exotica, space-age-pop, court-bed, theatre-organ, traffic-bed, pirate-bed.

import type { RecipeId } from '../../broadcast/types';
import type { Composer } from './index';
import { composeCourt, composePirate, composeTheatreOrgan, composeTraffic } from './beds-v4';
import { composeExotica } from './exotica';
import { composeIslandReggae, composeRootsReggae } from './reggae';
import { composeSpaceAgePop } from './space-age-pop';

export const WORLD_V4: Partial<Record<RecipeId, Composer>> = {
  'roots-reggae': composeRootsReggae,
  'island-reggae': composeIslandReggae,
  exotica: composeExotica,
  'space-age-pop': composeSpaceAgePop,
  'court-bed': composeCourt,
  'theatre-organ': composeTheatreOrgan,
  'traffic-bed': composeTraffic,
  'pirate-bed': composePirate,
};

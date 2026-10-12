// v3 beds and oddities (owned by the music-beds workstream): cooking-bed, horoscope-bed,
// noir-bed, quiz-bed, sleep-bed, kids-bed, community-bed, brass-band, trucker-country,
// test-tone, distress-beacon, stuck-loop, time-signal.

import type { RecipeId } from '../../broadcast/types';
import type { Composer } from './index';

export const BEDS_V3: Partial<Record<RecipeId, Composer>> = {};

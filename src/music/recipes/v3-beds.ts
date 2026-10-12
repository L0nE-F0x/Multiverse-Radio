// v3 beds and oddities (owned by the music-beds workstream): cooking-bed, horoscope-bed,
// noir-bed, quiz-bed, sleep-bed, kids-bed, community-bed, brass-band, trucker-country,
// test-tone, distress-beacon, stuck-loop, time-signal.

import type { RecipeId } from '../../broadcast/types';
import { composeBrassBand } from './brass-band';
import { composeCommunity, composeCooking, composeKids, composeQuiz } from './beds-bright';
import { composeHoroscope, composeNoir, composeSleep } from './beds-night';
import type { Composer } from './index';
import { composeDistressBeacon, composeStuckLoop, composeTestTone, composeTimeSignal } from './oddities';
import { composeTruckerCountry } from './trucker-country';

export const BEDS_V3: Partial<Record<RecipeId, Composer>> = {
  'cooking-bed': composeCooking,
  'horoscope-bed': composeHoroscope,
  'noir-bed': composeNoir,
  'quiz-bed': composeQuiz,
  'sleep-bed': composeSleep,
  'kids-bed': composeKids,
  'community-bed': composeCommunity,
  'brass-band': composeBrassBand,
  'trucker-country': composeTruckerCountry,
  'test-tone': composeTestTone,
  'distress-beacon': composeDistressBeacon,
  'stuck-loop': composeStuckLoop,
  'time-signal': composeTimeSignal,
};

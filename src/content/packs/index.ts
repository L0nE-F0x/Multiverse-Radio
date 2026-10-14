import type { RecipeId } from '../../broadcast/types';
import { baroqueBots, endLounge, holdMusic, numbersOmega, wildMultiverse } from './grand';
import { cometMarimba, mirrorPolka, moonDub, neon2087, pixelAfterlife } from './bright';
import { crystalDelta, rainfallFm, snailJams, staticLullabies, voidBeats, whalesong } from './chill';
import { classifiedsBed, grendaBed, hopBed, newsBed, sportsBed } from './talk';
import { DEEP_STATION_PACKS } from './deep';
import type { TrackPack } from './types';
import { V3A_RECIPE_PACKS, V3A_STATION_PACKS } from './v3a';
import { V3B_RECIPE_PACKS, V3B_STATION_PACKS } from './v3b';
import { V4A_RECIPE_PACKS, V4A_STATION_PACKS } from './v4a';
import { V4D_STATION_PACKS } from './v4d';
import { V4B_RECIPE_PACKS, V4B_STATION_PACKS } from './v4b';
import { V4C_RECIPE_PACKS, V4C_STATION_PACKS } from './v4c';

export type { TrackPack } from './types';

/** Station-specific packs. Stations not listed fall back to their recipe's pack. */
export const STATION_PACKS: Readonly<Record<string, TrackPack>> = {
  ...V3A_STATION_PACKS,
  ...V3B_STATION_PACKS,
  ...V4A_STATION_PACKS,
  ...V4B_STATION_PACKS,
  ...V4C_STATION_PACKS,
  ...DEEP_STATION_PACKS,
  ...V4D_STATION_PACKS,
  'static-lullabies': staticLullabies,
  'void-beats': voidBeats,
  'every-news': newsBed,
  'rainfall-fm': rainfallFm,
  'neon-2087': neon2087,
  classifieds: classifiedsBed,
  'end-lounge': endLounge,
  'snail-jams': snailJams,
  'dimension-hop': hopBed,
  'crystal-delta': crystalDelta,
  'hold-music': holdMusic,
  'pixel-afterlife': pixelAfterlife,
  'ask-grenda': grendaBed,
  'moon-dub': moonDub,
  whalesong,
  'impossible-sports': sportsBed,
  'baroque-bots': baroqueBots,
  'comet-marimba': cometMarimba,
  'mirror-polka': mirrorPolka,
  'wild-multiverse': wildMultiverse,
  'numbers-omega': numbersOmega,
};

/** One pack per recipe, for stations without their own and for rotating recipe pools. */
/** Recipes without a pack fall back to their station's pack, then to lo-fi (see packFor). */
export const RECIPE_PACKS: Readonly<Partial<Record<RecipeId, TrackPack>>> = {
  ...V3A_RECIPE_PACKS,
  ...V3B_RECIPE_PACKS,
  ...V4A_RECIPE_PACKS,
  ...V4B_RECIPE_PACKS,
  ...V4C_RECIPE_PACKS,
  'lofi-hiphop': voidBeats,
  'lofi-rain': rainfallFm,
  'lofi-slow': snailJams,
  'lofi-glass': crystalDelta,
  synthwave: neon2087,
  'lounge-jazz': endLounge,
  muzak: holdMusic,
  'ambient-drift': whalesong,
  chiptune: pixelAfterlife,
  baroque: baroqueBots,
  dub: moonDub,
  polka: mirrorPolka,
  'tropical-marimba': cometMarimba,
  'static-lullaby': staticLullabies,
  'news-bed': newsBed,
  'talk-bed': hopBed,
  'sports-fanfare': sportsBed,
  'numbers-musicbox': numbersOmega,
  documentary: wildMultiverse,
};

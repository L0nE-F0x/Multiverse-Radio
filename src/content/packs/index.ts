import type { RecipeId } from '../../broadcast/types';
import { baroqueBots, endLounge, holdMusic, numbersOmega, wildMultiverse } from './grand';
import { cometMarimba, mirrorPolka, moonDub, neon2087, pixelAfterlife } from './bright';
import { crystalDelta, rainfallFm, snailJams, staticLullabies, voidBeats, whalesong } from './chill';
import { classifiedsBed, grendaBed, hopBed, newsBed, sportsBed } from './talk';
import type { TrackPack } from './types';

export type { TrackPack } from './types';

/** Station-specific packs. Stations not listed fall back to their recipe's pack. */
export const STATION_PACKS: Readonly<Record<string, TrackPack>> = {
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
export const RECIPE_PACKS: Readonly<Record<RecipeId, TrackPack>> = {
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

// Geometry and labels for the slide-rule tuning band.

import type { StationDef } from '../broadcast/types';

export const BAND_MIN = 87.5;
export const BAND_MAX = 107.5;

/** 0–1 position of a frequency along the band. */
export const bandPosition = (frequency: number): number => (frequency - BAND_MIN) / (BAND_MAX - BAND_MIN);

export const bandFrequency = (position: number): number => BAND_MIN + position * (BAND_MAX - BAND_MIN);

export function nearestStation(stations: StationDef[], frequency: number): number {
  let best = 0;
  stations.forEach((s, i) => {
    if (Math.abs(s.frequency - frequency) < Math.abs(stations[best]!.frequency - frequency)) best = i;
  });
  return best;
}

/** Names short enough to print on the dial glass. */
const DIAL_NAMES: Record<string, string> = {
  'static-lullabies': 'Lullabies',
  'crystal-delta': 'Crystal Δ',
  'every-news': 'Every News',
  'end-lounge': 'End Lounge',
  'hold-music': 'Hold Music',
  'moon-dub': 'Moon Dub',
  whalesong: 'Whalesong',
  'impossible-sports': 'Imposs. Sports',
  'baroque-bots': 'Robo Baroque',
  'mirror-polka': 'Mirror Polka',
  'numbers-omega': 'Numbers Ω',
  classifieds: 'Classifieds',
  'pixel-afterlife': '8-Bit Afterlife',
};

export function dialName(station: StationDef): string {
  const known = DIAL_NAMES[station.id];
  if (known) return known;
  const name = station.name.replace(/^The\s+/i, '');
  if (name.length <= 15) return name;
  let out = '';
  for (const word of name.split(/\s+/)) {
    if ((out ? `${out} ${word}` : word).length > 15) break;
    out = out ? `${out} ${word}` : word;
  }
  return out || name.slice(0, 15);
}

// The fine-tuning dial's model: band regions, short names printed on the scale, and the
// markers for stations (plus the secrets and pirates this listener has found).

import { DIAL, type PhosphorId, type StationDef } from '../broadcast/types';

export const [MAIN_LO, MAIN_HI] = DIAL.mainBand;
/** v4: the Outer Band, just above the main band (108 itself belongs to the main band). */
export const [OUTER_LO, OUTER_HI] = DIAL.outerBand;

const clampMhz = (mhz: number) => Math.min(DIAL.max, Math.max(DIAL.min, mhz));

/** Snap to the dial's 0.05 MHz grid (clamped, and without float noise). */
export const snapMhz = (mhz: number): number => Number((Math.round(clampMhz(mhz) / DIAL.step) * DIAL.step).toFixed(2));

export const inMainBand = (mhz: number): boolean => mhz >= MAIN_LO - 1e-6 && mhz <= MAIN_HI + 1e-6;

export const inOuterBand = (mhz: number): boolean => mhz > OUTER_LO + 1e-6 && mhz <= OUTER_HI + 1e-6;

/** main: the listed stations · outer: the v4 Outer Band, listed too · deep: everything else. */
export type Band = 'main' | 'outer' | 'deep';

export const bandOf = (mhz: number): Band => (inMainBand(mhz) ? 'main' : inOuterBand(mhz) ? 'outer' : 'deep');

export const BAND_LABEL: Record<Band, string> = { main: 'Main band', outer: 'Outer band', deep: 'Deep band' };

/** A station that moves along the Outer Band from night to night (Free Frequency). */
export const drifts = (station: Pick<StationDef, 'drift'>): boolean => (station.drift?.length ?? 0) > 1;

/** Names short enough to print on the scale. */
const DIAL_NAMES: Record<string, string> = {
  'static-lullabies': 'Lullabies',
  'every-news': 'Every News',
  classifieds: 'Classifieds',
  'end-lounge': 'End Lounge',
  'crystal-delta': 'Crystal Δ',
  'hold-music': 'Hold Music',
  'moon-dub': 'Moon Dub',
  whalesong: 'Whalesong',
  'impossible-sports': 'Imposs. Sports',
  'baroque-bots': 'Robo Baroque',
  'mirror-polka': 'Mirror Polka',
  'numbers-omega': 'Numbers Ω',
  'lower-hollow': 'Lower Hollow',
  'bubble-economy': 'Bubble Economy',
  'tomorrows-leftovers': 'Leftovers',
  'piano-empty-rooms': 'Empty Rooms',
  'unsolved-dimensions': 'Unsolved',
  'breakbeat-observatory': 'Observatory',
  'other-horoscopes': 'Horoscopes',
  'drowned-shanty-hour': 'Shanty Hour',
  'win-this-planet': 'Win This Planet',
  'event-horizon-surf': 'Horizon Surf',
  'bedtime-for-giants': 'Bedtime',
  'gristwick-parish': 'Gristwick',
  'tiny-hour': 'Tiny Hour',
  'infinite-song': 'Infinite Song',
  'hush-after-hours': 'After Hours',
  'last-lighthouse': 'Lighthouse',
  'transmission-zero': 'Transmission 0',
};

export function dialName(station: Pick<StationDef, 'id' | 'name'>): string {
  const known = DIAL_NAMES[station.id];
  if (known) return known;
  const name = station.name.replace(/^The\s+/i, '');
  if (name.length <= 15) return name;
  let out = '';
  for (const word of name.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > 15) break;
    out = next;
  }
  return out || name.slice(0, 15);
}

/**
 * The frequency in a pirate id (`pirate-<frequency>`), or null. Accepts "pirate-104.25" and
 * the dotless "pirate-10425" in case the director prefers ids without punctuation.
 */
export function pirateFrequency(id: string): number | null {
  if (!id.startsWith('pirate-')) return null;
  let value = parseFloat(id.slice(7).replace('_', '.'));
  if (!Number.isFinite(value)) return null;
  if (value > DIAL.max) value /= 100;
  return value >= DIAL.min && value <= DIAL.max ? value : null;
}

export type MarkerKind = 'station' | 'secret' | 'pirate';

export interface DialMarker {
  id: string;
  frequency: number;
  label: string;
  phosphor: PhosphorId;
  kind: MarkerKind;
  /** Somewhere else tomorrow night: the marker sits at tonight's frequency. */
  drift?: boolean;
}

export interface KnownPirate {
  id: string;
  name: string;
  frequency: number;
  phosphor: PhosphorId;
}

/** Main stations always; secrets and pirates once discovered. Sorted along the dial. */
export function dialMarkers(stations: StationDef[], discovered: string[], pirates: Record<string, KnownPirate>): DialMarker[] {
  const found = new Set(discovered);
  const out: DialMarker[] = [];
  for (const s of stations) {
    if (s.secret && !found.has(s.id)) continue;
    out.push({
      id: s.id,
      frequency: s.frequency,
      label: dialName(s),
      phosphor: s.phosphor,
      kind: s.secret ? 'secret' : 'station',
      ...(drifts(s) ? { drift: true } : {}),
    });
  }
  for (const id of found) {
    if (!id.startsWith('pirate-')) continue;
    const known = pirates[id];
    const frequency = known?.frequency ?? pirateFrequency(id);
    if (frequency === null) continue;
    out.push({ id, frequency, label: known ? dialName({ id, name: known.name }) : 'Pirate', phosphor: known?.phosphor ?? 'amber', kind: 'pirate' });
  }
  return out.sort((a, b) => a.frequency - b.frequency);
}

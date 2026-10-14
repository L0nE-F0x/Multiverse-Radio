// v4 station quirks: small rules that belong to one station each (docs/V4-PLAN.md), plus the
// moon. All pure and deterministic from the clock, like the rest of the schedule.
//
//   - Traffic on the 8s: a traffic report (its `weather` clips) at every local minute
//     ending in 8, in the programme slot nearest :x8.
//   - Afterparty at the Heat Death: the beat slows through the local night (~124 BPM at
//     18:00 down to ~100 by 05:00) and picks up again at dawn.
//   - Full moon: clips with `kit = "full-moon"` (Moon Dub's full-moon show) only air on local
//     nights when the moon is at least 97% lit.

import { browserTzOffset, DAY_MS, localMinuteToMs, MIN_MS, nightOf, type TzOffset } from './time';
import type { RecipeTweaks, StationDef, VoiceClip } from './types';

// ── Traffic on the 8s ────────────────────────────────────────────────────────

export const TRAFFIC_STATION = 'traffic-on-the-8s';

/** True for the station whose traffic reports run on the 8s. */
export const onTheEights = (stationId: string): boolean => stationId === TRAFFIC_STATION;

/**
 * Offsets (ms from the start of the UTC hour starting at `hourStartMs`) of the local minutes
 * ending in 8: six an hour (:08, :18, … :58 local, whatever the time zone's offset).
 */
export function eightsInHour(hourStartMs: number, tz: TzOffset = browserTzOffset): number[] {
  const localMinute = Math.floor(hourStartMs / MIN_MS) + tz(hourStartMs);
  const base = ((localMinute % 10) + 10) % 10;
  const out: number[] = [];
  for (let m = (18 - base) % 10; m < 60; m += 10) out.push(m * MIN_MS);
  return out;
}

// ── Afterparty at the Heat Death ─────────────────────────────────────────────

export const AFTERPARTY_STATION = 'heat-death-afterparty';
export const AFTERPARTY_BPM = { day: 124, lastCall: 100 } as const;

/**
 * DJ Entropy's tempo at a local minute of the day: steady through the day, slowing from
 * 18:00 to 05:00, back up between 05:00 and 07:00.
 */
export function afterpartyBpm(minuteOfDay: number): number {
  const { day, lastCall } = AFTERPARTY_BPM;
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const dusk = 18 * 60;
  const low = 5 * 60;
  const dawn = 7 * 60;
  let bpm: number;
  if (m >= dawn && m < dusk) bpm = day;
  else if (m >= low && m < dawn) bpm = lastCall + ((m - low) / (dawn - low)) * (day - lastCall);
  else {
    const into = m >= dusk ? m - dusk : m + 1440 - dusk; // 0 … 660
    bpm = day - (into / (low + 1440 - dusk)) * (day - lastCall);
  }
  return Math.round(bpm);
}

/**
 * The tweaks a station's music runs use at a moment: its own, plus any quirk (the
 * afterparty's falling BPM). Returns `station.tweaks` itself when nothing changes.
 */
export function tweaksAt(station: StationDef, ms: number, tz: TzOffset = browserTzOffset): Partial<RecipeTweaks> | undefined {
  if (station.id !== AFTERPARTY_STATION) return station.tweaks;
  const local = ms + tz(ms) * MIN_MS;
  const minuteOfDay = Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / MIN_MS);
  return { ...station.tweaks, bpm: afterpartyBpm(minuteOfDay) };
}

// ── The moon ─────────────────────────────────────────────────────────────────

/** Mean synodic month, days. */
const SYNODIC_DAYS = 29.530588853;
/** A new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
/** Moon Dub's full-moon show needs at least this much of the moon lit. */
export const FULL_MOON_ILLUMINATION = 0.97;
export const FULL_MOON_KIT = 'full-moon';

/** Moon age in days since the last new moon (mean phase; within a day of the real thing). */
export function moonAge(ms: number): number {
  const days = (ms - NEW_MOON_MS) / DAY_MS;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

/** Fraction of the moon's disc that is lit, 0 (new) to 1 (full). */
export function moonIllumination(ms: number): number {
  return (1 - Math.cos((2 * Math.PI * moonAge(ms)) / SYNODIC_DAYS)) / 2;
}

const fullMoonCache = new Map<string, boolean>();

/** True if a local night (see `nightOf`) is a full-moon night: ≥ 97% lit at local midnight. */
export function fullMoonNight(night: number, tz: TzOffset = browserTzOffset): boolean {
  const midnight = localMinuteToMs(night + 1, 0, tz);
  const key = `${night}:${tz(midnight)}`;
  let full = fullMoonCache.get(key);
  if (full === undefined) {
    full = moonIllumination(midnight) >= FULL_MOON_ILLUMINATION;
    fullMoonCache.set(key, full);
    if (fullMoonCache.size > 64) fullMoonCache.delete(fullMoonCache.keys().next().value!);
  }
  return full;
}

/** True if the moon is full on the local night `ms` falls in. */
export const fullMoonAt = (ms: number, tz: TzOffset = browserTzOffset): boolean => fullMoonNight(nightOf(ms, tz), tz);

export const isFullMoonClip = (clip: VoiceClip): boolean => clip.kit === FULL_MOON_KIT;

// ── Greg's show ──────────────────────────────────────────────────────────────

/** The Quiet Corner with Greg (The Lounge at the End of Time, Sundays 02–03). */
export const GREG_SHOW = 'the-quiet-corner';
/** Greg is barely audible: his own clips air about 11 dB under a normal voice. */
export const GREG_GAIN = 10 ** (-11 / 20);

/** Gain for a station clip: 1 for nearly everything; Greg's own clips in his show, very low. */
export function voiceGain(clip: VoiceClip): number {
  if (clip.show !== GREG_SHOW || clip.lines.length === 0) return 1;
  return clip.lines.every((l) => /^greg\b/i.test(l.speaker)) ? GREG_GAIN : 1;
}

// ── First visits ─────────────────────────────────────────────────────────────

/**
 * Clips a secret station airs once, to welcome a listener on their first visit after finding
 * it (never in its rotation): Something Listening's "noticed", the Switchboard's "found-*".
 */
const WELCOMES: Record<string, (clip: VoiceClip) => boolean> = {
  'something-listening': (c) => c.id === 'noticed',
  'the-switchboard': (c) => c.id.startsWith('found-'),
};

export const isWelcomeClip = (stationId: string, clip: VoiceClip): boolean => WELCOMES[stationId]?.(clip) ?? false;

/** Stations with a first-visit welcome. */
export const WELCOME_STATIONS: readonly string[] = Object.keys(WELCOMES);

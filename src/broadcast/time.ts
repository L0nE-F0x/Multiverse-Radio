// The listener's local time, as the living schedule sees it. Shows, serials and holiday
// clips follow the listener's clock; multiverse events follow UTC (see ./events).
//
// Everything takes a UTC offset function so tests can pin a time zone.

import type { ShowDef } from './types';

export const MIN_MS = 60_000;
export const DAY_MS = 86_400_000;

/** Minutes east of UTC at a moment (e.g. +60 in Paris in winter). */
export type TzOffset = (ms: number) => number;

/** The browser's time zone. */
export const browserTzOffset: TzOffset = (ms) => -new Date(ms).getTimezoneOffset();

/** A fixed offset (tests, labs). */
export const fixedTzOffset =
  (minutes: number): TzOffset =>
  () =>
    minutes;

export interface LocalTime {
  /** Days since 1970-01-01 in local time. Advances at local midnight. */
  day: number;
  /** 0–23. */
  hour: number;
  /** 0–1439. */
  minuteOfDay: number;
  /** "MM-DD". */
  date: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localTime(ms: number, tz: TzOffset = browserTzOffset): LocalTime {
  const local = ms + tz(ms) * MIN_MS;
  const d = new Date(local);
  const hour = d.getUTCHours();
  return {
    day: Math.floor(local / DAY_MS),
    hour,
    minuteOfDay: hour * 60 + d.getUTCMinutes(),
    date: `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
  };
}

/** UTC ms of a local minute-of-day on a local day (using the offset at that moment). */
export function localMinuteToMs(day: number, minuteOfDay: number, tz: TzOffset = browserTzOffset): number {
  const guess = day * DAY_MS + minuteOfDay * MIN_MS;
  // Two passes settle the offset even across a DST change.
  let ms = guess - tz(guess) * MIN_MS;
  ms = guess - tz(ms) * MIN_MS;
  return ms;
}

/** True if a show is on air at a local hour. `end` is exclusive and may wrap past midnight. */
export function showCovers(show: ShowDef, hour: number): boolean {
  const { start, end } = show;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The show on air at a local hour, if any (the first match wins). */
export function showAtHour(shows: readonly ShowDef[] | undefined, hour: number): ShowDef | null {
  if (!shows) return null;
  for (const show of shows) if (showCovers(show, hour)) return show;
  return null;
}

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
  /** v4: local weekday, 0 = Sunday … 6 = Saturday. */
  weekday: number;
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
    weekday: d.getUTCDay(),
  };
}

/** v4: a "night" (a shift) runs from 06:00 local to 06:00 the next day. */
export const NIGHT_START_HOUR = 6;

/**
 * v4: the local night a moment belongs to: the local day on which it began at 06:00. So
 * 02:00 on Sunday belongs to Saturday's night.
 */
export function nightOf(ms: number, tz: TzOffset = browserTzOffset): number {
  return Math.floor((ms + tz(ms) * MIN_MS - NIGHT_START_HOUR * 3_600_000) / DAY_MS);
}

/** v4: UTC ms at which a local night begins (06:00 local on its day). */
export function nightStartMs(night: number, tz: TzOffset = browserTzOffset): number {
  return localMinuteToMs(night, NIGHT_START_HOUR * 60, tz);
}

/** UTC ms of a local minute-of-day on a local day (using the offset at that moment). */
export function localMinuteToMs(day: number, minuteOfDay: number, tz: TzOffset = browserTzOffset): number {
  const guess = day * DAY_MS + minuteOfDay * MIN_MS;
  // Two passes settle the offset even across a DST change.
  let ms = guess - tz(guess) * MIN_MS;
  ms = guess - tz(ms) * MIN_MS;
  return ms;
}

/**
 * True if a show is on air at a local hour. `end` is exclusive and may wrap past midnight.
 * v4: a show with `days` only airs on those weekdays (the day its start hour falls on, so a
 * Saturday 23–02 show is still on at 01:00 on Sunday). Without `weekday`, days are ignored.
 */
export function showCovers(show: ShowDef, hour: number, weekday?: number): boolean {
  const { start, end } = show;
  if (start === end) return false;
  const on = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!on || !show.days || weekday === undefined) return on;
  const startDay = start > end && hour < end ? (weekday + 6) % 7 : weekday;
  return show.days.includes(startDay);
}

/** The show on air at a local hour (and weekday), if any (the first match wins). */
export function showAtHour(shows: readonly ShowDef[] | undefined, hour: number, weekday?: number): ShowDef | null {
  if (!shows) return null;
  for (const show of shows) if (showCovers(show, hour, weekday)) return show;
  return null;
}

/** The show on air at a local time, if any. */
export function showAt(shows: readonly ShowDef[] | undefined, local: Pick<LocalTime, 'hour' | 'weekday'>): ShowDef | null {
  return showAtHour(shows, local.hour, local.weekday);
}

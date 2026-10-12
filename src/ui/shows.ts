// The named shows on every station (`/voice/_shows.json`), for the guide's "on now" column.
// Fetched once, on demand. Missing or malformed means "no shows": the guide copes.

import { resolveAsset } from '../broadcast/manifest';
import type { ShowDef, ShowIndex } from '../broadcast/types';

let pending: Promise<ShowIndex['shows']> | null = null;

export function loadShows(): Promise<ShowIndex['shows']> {
  pending ??= fetch(resolveAsset('/voice/_shows.json'))
    .then(async (response) => {
      if (!response.ok) return {};
      const data = (await response.json()) as Partial<ShowIndex>;
      return data && typeof data.shows === 'object' && data.shows ? data.shows : {};
    })
    .catch(() => ({}));
  return pending;
}

/** The show on air at a local hour (0–23), handling shows that wrap past midnight. */
export function showAt(shows: ShowDef[] | undefined, hour: number): ShowDef | null {
  if (!shows) return null;
  for (const show of shows) {
    const { start, end } = show;
    if (start === end) return show;
    if (start < end ? hour >= start && hour < end : hour >= start || hour < end) return show;
  }
  return null;
}

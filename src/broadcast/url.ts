// Deep links. A main station lives at its share page, `/station/<id>/`; everything else on
// the dial is a query: `?station=<id>` (secret stations, and pirates by id) or `?f=<MHz>`
// (pirates, oddities, static). Both forms stay valid on load, and `?station=<main id>`
// from v2 links still works.

import { MAIN_STATIONS, stationById } from '../stations/roster';
import { clampFrequency, receptionAt, stationForId } from './dial';
import type { Tuned } from './types';

const MAIN = new Set(MAIN_STATIONS.map((s) => s.id));

/** The station id in a share-page path (`<base>station/<id>/`), if any. */
export function stationFromPath(pathname: string, base = '/'): string | null {
  const root = base.endsWith('/') ? base : `${base}/`;
  if (!pathname.startsWith(root)) return null;
  const match = /^station\/([a-z0-9][a-z0-9.-]*)\/?(?:index\.html)?$/i.exec(pathname.slice(root.length));
  return match ? match[1]! : null;
}

export interface StartInput {
  search: string;
  pathname: string;
  base: string;
  savedStation: string | null;
  savedFrequency: number | null;
  defaultStation: string;
}

/** Where the dial starts: `?f=` › share-page path › `?station=` › last visit › the default. */
export function initialFrequency(input: StartInput): number {
  const params = new URLSearchParams(input.search);
  const f = params.get('f');
  if (f !== null && f.trim() !== '' && Number.isFinite(Number(f))) return clampFrequency(Number(f));
  for (const id of [stationFromPath(input.pathname, input.base), params.get('station')]) {
    const station = id ? stationForId(id) : undefined;
    if (station) return station.frequency;
  }
  const { savedStation, savedFrequency } = input;
  if (savedFrequency !== null && Number.isFinite(savedFrequency)) {
    // Trust the saved dial position unless it now points at a different station than the
    // one saved (the roster moved): then the saved station wins.
    const tuned = receptionAt(savedFrequency).tuned;
    const there = tuned.kind === 'station' || tuned.kind === 'pirate' ? tuned.station.id : null;
    if (!there || !savedStation || there === savedStation || !stationForId(savedStation)) return clampFrequency(savedFrequency);
  }
  const saved = savedStation ? stationForId(savedStation) : undefined;
  if (saved) return saved.frequency;
  return stationById(input.defaultStation)?.frequency ?? MAIN_STATIONS[0]!.frequency;
}

/**
 * The address for what's tuned: `/station/<id>/` for main stations, `/?station=<id>` for
 * secret ones, `/?f=<MHz>` for pirates, oddities and static. Other query params survive.
 */
export function urlFor(current: URL, tuned: Tuned, frequency: number, base = '/'): URL {
  const url = new URL(current.href);
  const root = base.endsWith('/') ? base : `${base}/`;
  // Other pages (the labs) keep their path and just carry the query.
  const onApp = url.pathname === root || url.pathname === `${root}index.html` || stationFromPath(url.pathname, root) !== null;
  url.searchParams.delete('station');
  url.searchParams.delete('f');
  if (tuned.kind === 'station' && MAIN.has(tuned.station.id)) {
    if (onApp) url.pathname = `${root}station/${tuned.station.id}/`;
    else url.searchParams.set('station', tuned.station.id);
    return url;
  }
  if (onApp) url.pathname = root;
  if (tuned.kind === 'station') url.searchParams.set('station', tuned.station.id);
  else if (tuned.kind === 'pirate') url.searchParams.set('f', tuned.station.frequency.toFixed(2));
  else url.searchParams.set('f', frequency.toFixed(2));
  return url;
}

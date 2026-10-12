// Sharing a station: the Web Share API where available, otherwise copy the link.
//
// STUB: the share workstream implements this (and the per-station share pages it links to).

import type { StationDef } from '../broadcast/types';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

/** The public link for a station's share page, e.g. https://…/station/void-beats/. */
export function stationShareUrl(station: StationDef): string {
  return new URL(`/station/${station.id}/`, location.origin).href;
}

/** Share (or copy) a link to a station. Call from a user gesture. */
export async function shareStation(station: StationDef): Promise<ShareResult> {
  try {
    await navigator.clipboard.writeText(stationShareUrl(station));
    return 'copied';
  } catch {
    return 'unavailable';
  }
}

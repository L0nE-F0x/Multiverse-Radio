// How far into the on-air segment are we?
//
// Segments carry `startMs` on the station's broadcast clock, but the contract doesn't
// expose a station's private clock offset (stations get one when you press Skip). We
// learn it by watching: when the on-air segment jumps somewhere it couldn't have reached
// naturally (a skip), the new segment started "now", which pins the offset.

import type { Segment } from '../broadcast/types';

const offsets = new Map<string, number>();
const lastSeen = new Map<string, string>();

/** Call whenever the on-air segment for a station is observed. */
export function observeSegment(segment: Segment | null): void {
  if (!segment) return;
  const previousId = lastSeen.get(segment.stationId);
  lastSeen.set(segment.stationId, segment.id);
  if (previousId === undefined || previousId === segment.id) return;
  const expected = Date.now() + (offsets.get(segment.stationId) ?? 0);
  const drift = segment.startMs - expected;
  // Natural hand-overs land within a tick or two of `expected`; a skip jumps far ahead.
  if (Math.abs(drift) > 2000) offsets.set(segment.stationId, segment.startMs - Date.now());
}

/** Milliseconds until `segment` starts on its station's clock (negative once it has). */
export function untilStart(segment: Segment, now = Date.now()): number {
  return segment.startMs - (now + (offsets.get(segment.stationId) ?? 0));
}

/** Milliseconds into `segment`, clamped to its length. */
export function segmentElapsed(segment: Segment, now = Date.now()): number {
  const clock = now + (offsets.get(segment.stationId) ?? 0);
  return Math.min(segment.durationMs, Math.max(0, clock - segment.startMs));
}

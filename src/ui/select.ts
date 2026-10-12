// Narrow, memoized reads from the broadcast store.
//
// The store ticks a few times a second and may hand out fresh objects on every tick.
// Components select through these helpers so they only re-render when something they show
// actually changed.

import { useRef } from 'react';
import { useBroadcast } from '../broadcast/store';
import type { BroadcastStore, PlayStatus, Segment, StationDef, Tuned } from '../broadcast/types';
import { stationById } from '../stations/roster';
import { describeTuned, type Source } from './source';

/** Like `useBroadcast(selector)`, but keeps the previous result while `equal` says nothing changed. */
export function useBroadcastWith<T>(selector: (state: BroadcastStore) => T, equal: (a: T, b: T) => boolean): T {
  const previous = useRef<{ value: T } | null>(null);
  return useBroadcast((state) => {
    const next = selector(state);
    if (previous.current && equal(previous.current.value, next)) return previous.current.value;
    previous.current = { value: next };
    return next;
  });
}

export const sameSegment = (a: Segment | null, b: Segment | null): boolean => a?.id === b?.id;

export const sameSegments = (a: Segment[], b: Segment[]): boolean =>
  a.length === b.length && a.every((segment, i) => segment.id === b[i]?.id);

const tunedKey = (t: Tuned): string =>
  t.kind === 'station' || t.kind === 'pirate'
    ? `${t.kind}:${t.station.id}:${t.station.name}:${t.station.phosphor}`
    : t.kind === 'oddity'
      ? `oddity:${t.oddity}:${t.label}:${t.scene}`
      : 'static';

export const sameTuned = (a: Tuned, b: Tuned): boolean => a === b || tunedKey(a) === tunedKey(b);

export function useOnAir(): Segment | null {
  return useBroadcastWith((s) => s.onAir, sameSegment);
}

export function useRecent(): Segment[] {
  return useBroadcastWith((s) => s.recent, sameSegments);
}

export function useStatus(): PlayStatus {
  return useBroadcast((s) => s.status);
}

export function useTuned(): Tuned {
  return useBroadcastWith((s) => s.tuned, sameTuned);
}

/** What the dial is picking up, described for the HUD. */
export function useSource(): Source {
  const tuned = useTuned();
  const previous = useRef<{ tuned: Tuned; source: Source } | null>(null);
  if (previous.current?.tuned !== tuned) previous.current = { tuned, source: describeTuned(tuned) };
  return previous.current.source;
}

/** The last roster station or pirate the dial was on (the scene behind static). */
export function useLastStation(): StationDef {
  const id = useBroadcast((s) => s.stationId);
  const stations = useBroadcast((s) => s.stations);
  const tuned = useTuned();
  if ((tuned.kind === 'station' || tuned.kind === 'pirate') && tuned.station.id === id) return tuned.station;
  return stations.find((s) => s.id === id) ?? stationById(id) ?? stations[0]!;
}

/** True while something is audibly on air (or about to be). */
export function usePowered(): boolean {
  return useBroadcast((s) => s.status === 'playing' || s.status === 'tuning');
}

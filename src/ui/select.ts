// Narrow, memoized reads from the broadcast store.
//
// The store ticks about every 500 ms and may hand out fresh objects on every tick
// (the simulator rebuilds `onAir` and `upNext` each time). Components select through
// these helpers so they only re-render when something they show actually changed.

import { useRef } from 'react';
import { useBroadcast } from '../broadcast/store';
import type { BroadcastStore, PlayStatus, Segment, StationDef } from '../broadcast/types';
import { stationById } from '../stations/roster';

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

export function useOnAir(): Segment | null {
  return useBroadcastWith((s) => s.onAir, sameSegment);
}

export function useUpNext(): Segment[] {
  return useBroadcastWith((s) => s.upNext, sameSegments);
}

export function useRecent(): Segment[] {
  return useBroadcastWith((s) => s.recent, sameSegments);
}

export function useStatus(): PlayStatus {
  return useBroadcast((s) => s.status);
}

export function useStationId(): string {
  return useBroadcast((s) => s.stationId);
}

export function useStations(): StationDef[] {
  return useBroadcast((s) => s.stations);
}

/** The tuned station. Falls back to the first station so the UI never renders empty. */
export function useStation(): StationDef {
  const id = useBroadcast((s) => s.stationId);
  const stations = useBroadcast((s) => s.stations);
  return stations.find((s) => s.id === id) ?? stationById(id) ?? stations[0]!;
}

/** Index of the tuned station along the dial. */
export function useStationIndex(): number {
  const id = useBroadcast((s) => s.stationId);
  const stations = useBroadcast((s) => s.stations);
  return Math.max(0, stations.findIndex((s) => s.id === id));
}

/** Imperative access to the actions (stable; no re-render). */
export const radio = (): BroadcastStore => useBroadcast.getState();

export const isAudible = (status: PlayStatus): boolean => status === 'playing';
export const isPowered = (status: PlayStatus): boolean => status !== 'off';

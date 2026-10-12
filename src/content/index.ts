// Procedural text: song titles, artist names, tickers, listener messages.
//
// STUB: the writers' room replaces these with real grammars. Keep the exported names and
// signatures stable. Every function is pure and deterministic for a given seed.

import type { StationDef, TrackMeta } from '../broadcast/types';

/** Title/artist/album for a generated track. Called by the broadcast director. */
export function trackMeta(station: StationDef, seed: number): TrackMeta {
  return { title: `Untitled Transmission #${seed % 1000}`, artist: `${station.host.name} & The Placeholders` };
}

/** Headlines / crawl text for the station's display ticker. */
export function tickerLines(station: StationDef, seed: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${station.name}: bulletin ${(seed + i) % 100} from ${station.origin}`);
}

export interface ListenerMessage {
  from: string;
  where: string;
  text: string;
}

/** A listener shout-out / text-in message from somewhere in the multiverse. */
export function listenerMessage(station: StationDef, seed: number): ListenerMessage {
  return { from: 'A listener', where: station.origin, text: `Love the show. Message ${seed % 100}.` };
}

/** Funny reception status, e.g. "73% — a moth has landed on the antenna". */
export function receptionReport(seed: number): string {
  return `Reception ${50 + (seed % 50)}%`;
}

/** Local weather in the station's dimension. */
export function dimensionWeather(station: StationDef, seed: number): string {
  return `${station.origin}: mild, ${seed % 30}°`;
}

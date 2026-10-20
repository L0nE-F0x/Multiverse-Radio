// Procedural text: song titles, artist names, tickers, listener messages, reception and
// weather. Every function is pure and deterministic for a given seed (seeded PRNG, no
// Math.random), built from Tracery-style grammars in this folder.

import type { StationDef } from '../broadcast/types';
import { DEFAULT_STATION_ID, stationById, STATIONS } from '../stations/roster';
import { hasLocalListener, listenerMessage, LOCAL_LISTENERS, type ListenerMessage } from './listeners';
import { hasLocalReception, LOCAL_RECEPTION, receptionReport } from './reception';
import { hasLocalTicker, LOCAL_TICKER, tickerLines } from './ticker';
import { dimensionWeather, hasLocalWeather, LOCAL_WEATHER } from './weather';

export { loadTrackPacks, trackMeta, trackPacksReady } from './tracks';
export { tickerLines, hasLocalTicker, LOCAL_TICKER };
export { listenerMessage, hasLocalListener, LOCAL_LISTENERS, type ListenerMessage };
export { receptionReport, hasLocalReception, LOCAL_RECEPTION };
export { dimensionWeather, hasLocalWeather, LOCAL_WEATHER };
export { LIMITS } from './limits';

export interface StationWireFeed {
  weather: string;
  listener: string;
  ticker: string[];
  reception: string;
}

function resolveStation(stationOrId: string | StationDef): StationDef {
  if (typeof stationOrId !== 'string') return stationOrId;
  const found = stationById(stationOrId);
  if (found) return found;
  const fallback = stationById(DEFAULT_STATION_ID) ?? STATIONS[0]!;
  return { ...fallback, id: stationOrId, name: stationOrId };
}

/** Deterministic sub-carrier wire feed (weather, listener text-in, ticker crawl, and reception) for a station. */
export function stationWireFeed(stationId: string | StationDef, seed: number, tickerCount = 4): StationWireFeed {
  const station = resolveStation(stationId);
  const msg = listenerMessage(station, seed);
  return {
    weather: dimensionWeather(station, seed),
    listener: `“${msg.text}” — ${msg.from} (${msg.where})`,
    ticker: tickerLines(station, seed, tickerCount),
    reception: receptionReport(station, seed),
  };
}

// ── v3: the deep band ─────────────────────────────────────────────────────────────────────

/** Name, slogan, origin and host of the generated pirate station for a seed (pirates.ts). */
export { pirateIdentity, PIRATE_LIMITS, type PirateIdentity } from './pirates';
/** HUSH's deadpan remark for a ship-log entry (shiplog.ts). */
export { shipLogNote, SHIP_LOG_NOTE_MAX } from './shiplog';

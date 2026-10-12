// The Nightjar's log: every intercept the listener actually heard, and every new contact
// (secret stations, pirates), persisted across shifts. Also remembers the pirates it has met,
// so the guide and the dial can name them later.

import { create } from 'zustand';
import { useBroadcast } from '../broadcast/store';
import type { BroadcastState, Segment, StationDef } from '../broadcast/types';
import { stationForId } from '../broadcast/dial';
import type { KnownPirate } from './dial';
import { pirateFrequency } from './dial';
import { segmentLabel } from './format';

export const LOG_MAX = 200;
const KEY = 'multiverse-radio:ship-log';

export interface LogEntry {
  /** Segment id, or `contact:<station id>`. */
  id: string;
  /** Epoch ms when it was logged. */
  at: number;
  type: 'track' | 'voice' | 'contact';
  stationId: string;
  station: string;
  frequency: number;
  title: string;
  byline: string;
  /** TRACK, NEWS, CONTACT… */
  code: string;
}

interface ShipLogState {
  entries: LogEntry[];
  pirates: Record<string, KnownPirate>;
}

function load(): ShipLogState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ShipLogState> | null;
    if (raw && Array.isArray(raw.entries)) {
      return { entries: raw.entries.slice(0, LOG_MAX), pirates: raw.pirates && typeof raw.pirates === 'object' ? raw.pirates : {} };
    }
  } catch {
    // Corrupt or unavailable storage: start a fresh log.
  }
  return { entries: [], pirates: {} };
}

export const useShipLog = create<ShipLogState>()(() => load());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useShipLog.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(useShipLog.getState()));
    } catch {
      // Full or private storage: the log lives for this session only.
    }
  }, 1500);
});

function add(entries: LogEntry[]): void {
  if (entries.length === 0) return;
  const state = useShipLog.getState();
  const seen = new Set(state.entries.map((e) => e.id));
  const fresh = entries.filter((e) => !seen.has(e.id));
  // `entries` arrive newest first, like the log.
  if (fresh.length) useShipLog.setState({ entries: [...fresh, ...state.entries].slice(0, LOG_MAX) });
}

export function clearShipLog(): void {
  useShipLog.setState({ entries: [] });
}

/** Station or pirate by id, from the roster, the tuned pirate or the pirates we've met. */
function lookup(id: string, state: BroadcastState): { name: string; frequency: number; station?: StationDef } {
  // Roster stations and pirates (the director can rebuild any pirate from its id).
  const known = stationForId(id);
  if (known) return { name: known.name, frequency: known.frequency, station: known };
  const t = state.tuned;
  if ((t.kind === 'pirate' || t.kind === 'station') && t.station.id === id) return { name: t.station.name, frequency: t.station.frequency, station: t.station };
  const met = useShipLog.getState().pirates[id];
  if (met) return { name: met.name, frequency: met.frequency };
  return { name: 'Unidentified carrier', frequency: pirateFrequency(id) ?? state.frequency };
}

function segmentEntry(segment: Segment, state: BroadcastState): LogEntry {
  const source = lookup(segment.stationId, state);
  const label = segmentLabel(segment, source.station);
  return {
    id: segment.id,
    at: Date.now(),
    type: segment.kind,
    stationId: segment.stationId,
    station: source.name,
    frequency: source.frequency,
    title: label.title,
    byline: label.byline,
    code: label.code,
  };
}

let started = false;

/** Start recording. Idempotent; call once at startup. */
export function startShipLog(): void {
  if (started) return;
  started = true;
  useBroadcast.subscribe((state, previous) => {
    // Remember pirates by name so the guide and dial can label them later.
    const t = state.tuned;
    if (t !== previous.tuned && t.kind === 'pirate') {
      const known = useShipLog.getState().pirates[t.station.id];
      if (!known || known.name !== t.station.name) {
        useShipLog.setState({
          pirates: {
            ...useShipLog.getState().pirates,
            [t.station.id]: { id: t.station.id, name: t.station.name, frequency: t.station.frequency, phosphor: t.station.phosphor },
          },
        });
      }
    }

    if (state.recent !== previous.recent && state.recent.length) {
      const before = new Set(previous.recent.map((s) => s.id));
      add(state.recent.filter((s) => !before.has(s.id)).map((s) => segmentEntry(s, state)));
    }

    if (state.discovered !== previous.discovered) {
      const before = new Set(previous.discovered);
      add(
        state.discovered
          .filter((id) => !before.has(id))
          .map((id) => {
            const source = lookup(id, state);
            return {
              id: `contact:${id}`,
              at: Date.now(),
              type: 'contact' as const,
              stationId: id,
              station: source.name,
              frequency: source.frequency,
              title: id.startsWith('pirate-') ? 'Unlicensed transmitter located' : 'Unlisted station located',
              byline: source.name,
              code: 'CONTACT',
            };
          }),
      );
    }
  });
}

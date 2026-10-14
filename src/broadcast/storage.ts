// localStorage can throw (private browsing, disabled storage, quota), so every access is
// wrapped and failures are treated as "nothing saved".

import { LISTEN_TIME_KEY } from './types';

const KEYS = {
  station: 'multiverse-radio:last-station',
  frequency: 'multiverse-radio:last-frequency',
  volume: 'multiverse-radio:volume',
  discovered: 'multiverse-radio:discovered',
  // v4
  shifts: 'multiverse-radio:shifts',
  arcs: 'multiverse-radio:arcs',
  welcomed: 'multiverse-radio:welcomed',
  listenTime: LISTEN_TIME_KEY,
} as const;

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal: the radio just won't remember.
  }
}

const finite = (raw: string | null): number | null => {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const storage = {
  getLastStation(): string | null {
    return read(KEYS.station);
  },
  setLastStation(id: string): void {
    write(KEYS.station, id);
  },
  /** The dial position at the end of the last visit (MHz). */
  getLastFrequency(): number | null {
    return finite(read(KEYS.frequency));
  },
  setLastFrequency(mhz: number): void {
    write(KEYS.frequency, mhz.toFixed(3));
  },
  getVolume(): number | null {
    const value = finite(read(KEYS.volume));
    return value === null ? null : Math.min(1, Math.max(0, value));
  },
  setVolume(volume: number): void {
    write(KEYS.volume, volume.toFixed(3));
  },
  /** Ids of secret and pirate stations this listener has found. */
  getDiscovered(): string[] {
    try {
      const value: unknown = JSON.parse(read(KEYS.discovered) ?? '[]');
      return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
    } catch {
      return [];
    }
  },
  setDiscovered(ids: string[]): void {
    write(KEYS.discovered, JSON.stringify(ids.slice(-500)));
  },
  /** v4: night shifts (see ./shifts). Validated by the reader. */
  getShifts(): unknown {
    return readJson(KEYS.shifts);
  },
  setShifts(state: object): void {
    write(KEYS.shifts, JSON.stringify(state));
  },
  /** v4: arc steps aired, per arc id. */
  getArcs(): Record<string, number[]> {
    const value = readJson(KEYS.arcs);
    const out: Record<string, number[]> = {};
    if (!isRecord(value)) return out;
    for (const [id, steps] of Object.entries(value)) {
      if (Array.isArray(steps)) out[id] = steps.filter((n): n is number => Number.isInteger(n)).slice(0, 100);
    }
    return out;
  },
  setArcs(arcs: Record<string, readonly number[]>): void {
    write(KEYS.arcs, JSON.stringify(arcs));
  },
  /** v4: secrets whose first-visit welcome has aired. */
  getWelcomed(): string[] {
    const value = readJson(KEYS.welcomed);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  },
  setWelcomed(ids: string[]): void {
    write(KEYS.welcomed, JSON.stringify(ids));
  },
  /** v4: listening time per station id, ms (LISTEN_TIME_KEY; offline packs read it too). */
  getListenTime(): Record<string, number> {
    const value = readJson(KEYS.listenTime);
    const out: Record<string, number> = {};
    if (!isRecord(value)) return out;
    for (const [id, ms] of Object.entries(value)) if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) out[id] = ms;
    return out;
  },
  setListenTime(times: Record<string, number>): void {
    write(KEYS.listenTime, JSON.stringify(times));
  },
};

function readJson(key: string): unknown {
  try {
    const raw = read(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

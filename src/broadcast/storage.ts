// localStorage can throw (private browsing, disabled storage, quota), so every access is
// wrapped and failures are treated as "nothing saved".

const KEYS = {
  station: 'multiverse-radio:last-station',
  frequency: 'multiverse-radio:last-frequency',
  volume: 'multiverse-radio:volume',
  discovered: 'multiverse-radio:discovered',
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
};

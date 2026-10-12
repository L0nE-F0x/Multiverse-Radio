// localStorage can throw (private browsing, disabled storage, quota), so every
// access is wrapped and failures are treated as "nothing saved".

const KEYS = {
  channel: 'multiverse-radio:last-channel',
  volume: 'multiverse-radio:volume',
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not fatal: the radio just won't remember.
  }
}

export const storage = {
  getLastChannel(): string | null {
    return read(KEYS.channel);
  },
  setLastChannel(id: string): void {
    write(KEYS.channel, id);
  },
  getVolume(): number | null {
    const raw = read(KEYS.volume);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
  },
  setVolume(volume: number): void {
    write(KEYS.volume, volume.toFixed(3));
  },
};

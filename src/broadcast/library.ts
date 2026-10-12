// The voice library: fetches manifests on demand and hands out a StationSchedule built from
// whatever has loaded. A missing manifest means "no clips", so every station always has at
// least a music-only schedule.
//
//   roster stations  /voice/<id>.json + /voice/_shared.json
//   pirates          /voice/_pirate.json (the generic pirate-DJ pool, host renamed per pirate)
//   oddities         /voice/_oddities.json (clips tagged for the oddity, or untagged)
//   HUSH, events     /voice/_ship.json, /voice/_events.json (the overlay's pools)
//   shows            /voice/_shows.json (ShowIndex)

import { manifestUrl, parseManifest, parseShowIndex } from './manifest';
import { StationSchedule, type ScheduleOptions } from './scheduler';
import { ODDITY_IDS, type ShowDef, type ShowIndex, type StationDef, type VoiceClip, type VoiceManifest } from './types';

export type Fetcher = (url: string) => Promise<Response>;

export const POOLS = {
  shared: '_shared',
  pirate: '_pirate',
  oddities: '_oddities',
  ship: '_ship',
  events: '_events',
  shows: '_shows',
} as const;

/** A failed (network) fetch is retried after this long; a 404 is final for the session. */
const RETRY_AFTER_MS = 60_000;
const CACHED_SCHEDULES = 6;

interface Entry<T> {
  promise: Promise<void>;
  value: T | null;
  settled: boolean;
  /** Set when the fetch failed for a reason that might be temporary. */
  retryAt: number | undefined;
}

const isPirate = (id: string) => id.startsWith('pirate-');
const isOddity = (id: string) => id.startsWith('oddity-');

/** The manifests a programme's schedule is built from. */
export function sourcesFor(stationId: string): string[] {
  if (isPirate(stationId)) return [POOLS.pirate];
  if (isOddity(stationId)) return [POOLS.oddities];
  return [stationId, POOLS.shared];
}

/** How the pirate pool captions its DJ; each pirate airs those lines under its own host's name. */
export const PIRATE_DJ = 'Pirate DJ';

/** Pool clips speak for whichever pirate airs them: the DJ takes the pirate host's name. */
function asPirate(clips: readonly VoiceClip[], host: string): VoiceClip[] {
  return clips
    .filter((c) => c.category !== 'ship' && c.category !== 'event')
    .map((c) => {
      // The pool's DJ (or, failing that, whoever speaks first).
      const dj = c.lines.some((l) => l.speaker === PIRATE_DJ) ? PIRATE_DJ : c.lines[0]?.speaker;
      return dj ? { ...c, lines: c.lines.map((l) => (l.speaker === dj ? { ...l, speaker: host } : l)) } : c;
    });
}

/**
 * Oddity clips for one kind of oddity: ids prefixed with its kind (`time-signal-003`), or
 * tagged by `stations`/`kit`; clips that name no oddity at all may air on any.
 */
function forOddity(clips: readonly VoiceClip[], oddity: string): VoiceClip[] {
  return clips.filter((c) => {
    if (c.id.startsWith(`${oddity}-`)) return true;
    const tags = [...(c.stations ?? []), ...(c.kit ? [c.kit] : [])];
    if (tags.length > 0) return tags.includes(oddity);
    return !ODDITY_IDS.some((o) => c.id.startsWith(`${o}-`));
  });
}

export class VoiceLibrary {
  private readonly entries = new Map<string, Entry<VoiceManifest>>();
  private readonly overrides = new Map<string, VoiceManifest | null>();
  private showEntry: Entry<ShowIndex> | null = null;
  private showOverride: ShowIndex | null | undefined;
  private readonly schedules = new Map<string, { key: string; schedule: StationSchedule }>();
  private readonly listeners = new Set<() => void>();
  private readonly versions = new Map<string, number>();
  /** Bumped whenever any manifest changes. */
  version = 0;

  constructor(
    private readonly fetcher: Fetcher = (url) => fetch(url),
    private readonly options: ScheduleOptions = {},
  ) {}

  /** Called whenever a manifest arrives (schedules may have changed). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads what a programme needs (station + shared pool, or the pirate/oddity pool). Never rejects. */
  load(stationId: string): Promise<void> {
    return Promise.all(sourcesFor(stationId).map((name) => this.fetchManifest(name))).then(() => undefined);
  }

  /** Loads any manifest by name (e.g. '_ship', '_events'). Never rejects. */
  loadPool(name: string): Promise<void> {
    return this.fetchManifest(name);
  }

  /** True once every manifest the programme needs has settled (loaded or known missing). */
  isLoaded(stationId: string): boolean {
    return sourcesFor(stationId).every((name) => this.overrides.has(name) || this.entries.get(name)?.settled === true);
  }

  manifest(name: string): VoiceManifest | null {
    if (this.overrides.has(name)) return this.overrides.get(name) ?? null;
    return this.entries.get(name)?.value ?? null;
  }

  /** A pool's clips (empty until loaded, or if it doesn't exist yet). */
  pool(name: string): VoiceClip[] {
    return this.manifest(name)?.clips ?? [];
  }

  // ── Shows ─────────────────────────────────────────────────────────────────

  /** Loads `/voice/_shows.json` once. Never rejects. */
  loadShows(): Promise<void> {
    if (this.showEntry) return this.showEntry.promise;
    const entry: Entry<ShowIndex> = { value: null, settled: false, retryAt: undefined, promise: Promise.resolve() };
    this.showEntry = entry;
    entry.promise = this.fetchJson(POOLS.shows).then(({ data }) => {
      entry.value = data === undefined ? null : parseShowIndex(data);
      entry.settled = true;
      if (entry.value) this.changed(POOLS.shows);
    });
    return entry.promise;
  }

  /** A station's shows (none for pirates, oddities or before the index loads). */
  shows(stationId: string): ShowDef[] {
    const index = this.showOverride !== undefined ? this.showOverride : this.showEntry?.value;
    return index?.shows[stationId] ?? [];
  }

  /** Lab/tests: replaces the show index (`undefined` removes the override). */
  setShowsOverride(index: ShowIndex | null | undefined): void {
    this.showOverride = index;
    this.changed(POOLS.shows);
  }

  // ── Schedules ─────────────────────────────────────────────────────────────

  /** The programme's schedule from whatever has loaded so far (cached until a manifest changes). */
  schedule(station: StationDef): StationSchedule {
    const sources = sourcesFor(station.id);
    const key = [...sources, POOLS.shows].map((name) => this.versions.get(name) ?? 0).join(':');
    const cached = this.schedules.get(station.id);
    this.schedules.delete(station.id);
    if (cached && cached.key === key) {
      this.schedules.set(station.id, cached);
      return cached.schedule;
    }
    let schedule: StationSchedule;
    if (isPirate(station.id)) {
      schedule = new StationSchedule(station, { own: asPirate(this.pool(POOLS.pirate), station.host.name), shared: [] }, this.options);
    } else if (isOddity(station.id)) {
      schedule = new StationSchedule(
        station,
        { own: forOddity(this.pool(POOLS.oddities), station.recipe), shared: [] },
        { ...this.options, clock: 'oddity' },
      );
    } else {
      schedule = new StationSchedule(
        station,
        { own: this.pool(station.id), shared: this.pool(POOLS.shared), shows: this.shows(station.id) },
        this.options,
      );
    }
    this.schedules.set(station.id, { key, schedule });
    // Schedules are cheap to rebuild; keep memory flat when someone scans every station.
    if (this.schedules.size > CACHED_SCHEDULES) this.schedules.delete(this.schedules.keys().next().value!);
    return schedule;
  }

  /**
   * Replaces a manifest (`undefined` removes the override). Used by the director lab's
   * fake-voice mode; '_shared' is the shared pool.
   */
  setOverride(name: string, manifest: VoiceManifest | null | undefined): void {
    if (manifest === undefined) this.overrides.delete(name);
    else this.overrides.set(name, manifest);
    this.changed(name);
  }

  clearOverrides(): void {
    this.overrides.clear();
    this.changed();
  }

  private changed(name?: string): void {
    if (name === undefined) for (const key of this.versions.keys()) this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    else this.versions.set(name, (this.versions.get(name) ?? 0) + 1);
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** Fetches and JSON-parses a `/voice/<name>.json`. `transient` marks failures worth retrying. */
  private async fetchJson(name: string): Promise<{ data: unknown; transient: boolean }> {
    try {
      const response = await this.fetcher(manifestUrl(name));
      if (!response.ok) return { data: undefined, transient: response.status >= 500 };
      try {
        return { data: JSON.parse(await response.text()), transient: false };
      } catch {
        // Dev servers answer unknown paths with index.html; that isn't a manifest.
        return { data: undefined, transient: false };
      }
    } catch {
      return { data: undefined, transient: true };
    }
  }

  private fetchManifest(name: string): Promise<void> {
    if (this.overrides.has(name)) return Promise.resolve();
    const existing = this.entries.get(name);
    if (existing && (existing.retryAt === undefined || Date.now() < existing.retryAt)) return existing.promise;

    const entry: Entry<VoiceManifest> = existing ?? { value: null, settled: false, promise: Promise.resolve(), retryAt: undefined };
    entry.retryAt = undefined;
    entry.promise = (async () => {
      const { data, transient } = await this.fetchJson(name);
      const manifest = data === undefined ? null : parseManifest(data, name);
      if (transient) entry.retryAt = Date.now() + RETRY_AFTER_MS;
      const before = entry.value;
      // A transient failure keeps whatever loaded before.
      if (manifest || !transient) entry.value = manifest;
      const wasSettled = entry.settled;
      entry.settled = true;
      if (!wasSettled || before !== entry.value) this.changed(name);
    })();
    this.entries.set(name, entry);
    return entry.promise;
  }
}

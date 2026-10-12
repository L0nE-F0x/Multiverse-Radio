// The voice library: fetches station + shared manifests on demand and hands out a
// StationSchedule built from whatever has loaded. A missing manifest means "no clips",
// so every station always has at least a music-only schedule.

import { trackPacksReady } from '../content';
import { manifestUrl, parseManifest } from './manifest';
import { StationSchedule, type ScheduleOptions } from './scheduler';
import type { StationDef, VoiceManifest } from './types';

export type Fetcher = (url: string) => Promise<Response>;

const SHARED = '_shared';
/** A failed (network) fetch is retried after this long; a 404 is final for the session. */
const RETRY_AFTER_MS = 60_000;
const CACHED_SCHEDULES = 6;

interface Entry {
  promise: Promise<void>;
  manifest: VoiceManifest | null;
  settled: boolean;
  /** Set when the fetch failed for a reason that might be temporary. */
  retryAt: number | undefined;
}

export class VoiceLibrary {
  private readonly entries = new Map<string, Entry>();
  private readonly overrides = new Map<string, VoiceManifest | null>();
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

  /** Loads the station's manifest and the shared pool. Never rejects. */
  load(stationId: string): Promise<void> {
    return Promise.all([this.fetchManifest(stationId), this.fetchManifest(SHARED)]).then(() => undefined);
  }

  /** True once both manifests for the station have settled (loaded or known missing). */
  isLoaded(stationId: string): boolean {
    const settled = (name: string) => this.overrides.has(name) || this.entries.get(name)?.settled === true;
    return settled(stationId) && settled(SHARED);
  }

  manifest(name: string): VoiceManifest | null {
    if (this.overrides.has(name)) return this.overrides.get(name) ?? null;
    return this.entries.get(name)?.manifest ?? null;
  }

  /** The station's schedule from whatever has loaded so far (cached until a manifest changes). */
  schedule(station: StationDef): StationSchedule {
    const own = this.manifest(station.id);
    const shared = this.manifest(SHARED);
    // Track names come from lazily loaded packs: rebuild once they arrive.
    const key = `${this.versions.get(station.id) ?? 0}:${this.versions.get(SHARED) ?? 0}:${trackPacksReady() ? 1 : 0}`;
    const cached = this.schedules.get(station.id);
    this.schedules.delete(station.id);
    if (cached && cached.key === key) {
      this.schedules.set(station.id, cached);
      return cached.schedule;
    }
    const schedule = new StationSchedule(station, { own: own?.clips ?? [], shared: shared?.clips ?? [] }, this.options);
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

  private fetchManifest(name: string): Promise<void> {
    if (this.overrides.has(name)) return Promise.resolve();
    const existing = this.entries.get(name);
    if (existing && (existing.retryAt === undefined || Date.now() < existing.retryAt)) return existing.promise;

    const entry: Entry = existing ?? { manifest: null, settled: false, promise: Promise.resolve(), retryAt: undefined };
    entry.retryAt = undefined;
    entry.promise = (async () => {
      let manifest: VoiceManifest | null = null;
      let transient = false;
      try {
        const response = await this.fetcher(manifestUrl(name));
        if (response.ok) {
          // Dev servers answer unknown paths with index.html; that isn't a manifest.
          try {
            manifest = parseManifest(JSON.parse(await response.text()), name);
          } catch {
            manifest = null;
          }
        } else {
          transient = response.status >= 500;
        }
      } catch {
        transient = true;
      }
      if (transient) entry.retryAt = Date.now() + RETRY_AFTER_MS;
      const before = entry.manifest;
      // A transient failure keeps whatever loaded before.
      if (manifest || !transient) entry.manifest = manifest;
      const wasSettled = entry.settled;
      entry.settled = true;
      if (!wasSettled || before !== entry.manifest) this.changed(name);
    })();
    this.entries.set(name, entry);
    return entry.promise;
  }
}

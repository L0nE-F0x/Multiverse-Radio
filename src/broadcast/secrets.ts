// v4: stations that move and stations that hide (docs/V4-PLAN.md, "Secrets").
//
//   - Drift: a station with `drift` (Free Frequency) sits at one candidate frequency per
//     local night (06:00 to 06:00), seeded by the date, never the same two nights running.
//   - Unlocks: how each secret is found. `tune` secrets are always on the air (v3). `clock`
//     secrets transmit only inside their local windows. `sequence`, `idle` and `shifts`
//     secrets are silent until found; an `idle` secret first comes to the listener, wherever
//     the dial is, before settling at its own frequency.
//
// The dial (./dial.ts) asks `dialLayout` which roster stations transmit where right now; the
// store feeds what the receiver hears into a `SecretWatcher`, which spots dial sequences and
// patient listeners. Everything here is pure or a small state machine, so it's unit-tested.

import { STATIONS } from '../stations/roster';
import { createRng, hash } from './random';
import { browserTzOffset, localTime, nightOf, type TzOffset } from './time';
import type { SecretUnlock, StationDef } from './types';

/** Secrets and pirates count as found after this signal… */
export const DISCOVER_SIGNAL = 0.8;
/** Reach (MHz to silence) of a secret station's signal. */
export const SECRET_REACH = 0.08;

const round2 = (f: number) => Math.round(f * 100) / 100;

// ── Drift ─────────────────────────────────────────────────────────────────────

/** Stations that move between nights. */
export const DRIFT_STATIONS: readonly StationDef[] = STATIONS.filter((s) => (s.drift?.length ?? 0) > 0);

/** Every frequency any drifting station may use (kept clear of pirates and oddities). */
export const DRIFT_SLOTS: readonly number[] = DRIFT_STATIONS.flatMap((s) => s.drift!);

function shuffled(seed: number, count: number): number[] {
  const rng = createRng(seed);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * Which of `count` slots a drifting station uses on a night. Nights come in blocks of
 * `count`, each a seeded shuffle of every slot, so it never stays put: inside a block every
 * night differs, and where two blocks meet the first night is swapped if it would repeat.
 */
export function driftSlot(stationId: string, count: number, night: number): number {
  if (count <= 1) return 0;
  if (count === 2) return (night + (hash('drift', stationId) & 1)) & 1;
  const block = Math.floor(night / count);
  const at = night - block * count;
  const order = shuffled(hash('drift', stationId, block), count);
  if (at <= 1) {
    const previousLast = shuffled(hash('drift', stationId, block - 1), count)[count - 1];
    if (order[0] === previousLast) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order[at]!;
}

/** A drifting station's frequency on a local night (`nightOf`); its canonical one otherwise. */
export function driftFrequency(station: StationDef, night: number): number {
  const slots = station.drift;
  if (!slots?.length) return station.frequency;
  return slots[driftSlot(station.id, slots.length, night)]!;
}

/** Where a station is tonight (the night `ms` falls in). */
export function frequencyTonight(station: StationDef, ms: number, tz: TzOffset = browserTzOffset): number {
  return driftFrequency(station, nightOf(ms, tz));
}

/** Where a station will be tomorrow night: the frequency its "tomorrow" clips announce. */
export function frequencyTomorrow(station: StationDef, ms: number, tz: TzOffset = browserTzOffset): number {
  return driftFrequency(station, nightOf(ms, tz) + 1);
}

/** Free Frequency's announcements of tomorrow's frequency: `kit = "tomorrow-<MHz>"`. */
export const TOMORROW_KIT = /^tomorrow-(\d+(?:\.\d+)?)$/;

/** The frequency a "tomorrow" clip announces (from its kit), or null for any other clip. */
export function tomorrowKitFrequency(kit: string | undefined): number | null {
  const match = kit ? TOMORROW_KIT.exec(kit) : null;
  return match ? Number(match[1]) : null;
}

// ── Unlocks ───────────────────────────────────────────────────────────────────

export const unlockOf = (station: StationDef): SecretUnlock => station.unlock ?? { kind: 'tune' };

/** "HH:MM" → minute of the day (NaN if malformed). */
export function minuteOf(hhmm: string): number {
  const match = /^(\d{1,2}):(\d\d)$/.exec(hhmm.trim());
  if (!match) return NaN;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 24 && m < 60 ? h * 60 + m : NaN;
}

/** True if a local minute of the day falls inside any window (end exclusive, may wrap midnight). */
export function inWindows(windows: readonly { from: string; to: string }[], minuteOfDay: number): boolean {
  return windows.some(({ from, to }) => {
    const a = minuteOf(from);
    const b = minuteOf(to);
    if (Number.isNaN(a) || Number.isNaN(b) || a === b) return false;
    return a < b ? minuteOfDay >= a && minuteOfDay < b : minuteOfDay >= a || minuteOfDay < b;
  });
}

/**
 * Is a roster station transmitting? Main stations and `tune` secrets always; `clock` secrets
 * inside their windows; the others once they've been found.
 */
export function transmitting(station: StationDef, minuteOfDay: number, discovered: ReadonlySet<string>): boolean {
  if (!station.secret) return true;
  const unlock = unlockOf(station);
  switch (unlock.kind) {
    case 'tune':
      return true;
    case 'clock':
      return inWindows(unlock.windows, minuteOfDay);
    default:
      return discovered.has(station.id);
  }
}

// ── The layout of the dial ────────────────────────────────────────────────────

/** An `idle` secret that has come to the listener: on the air wherever they were. */
export interface Visitor {
  id: string;
  frequency: number;
}

export interface LayoutInput {
  ms: number;
  tz?: TzOffset;
  discovered: readonly string[];
  visitor?: Visitor | null;
}

export interface DialLayout {
  /** Changes whenever anything below does. */
  key: string;
  /** Every roster station, drifting ones at tonight's frequency, ordered along the dial. */
  roster: StationDef[];
  /** The roster stations transmitting right now, at the frequency they transmit on. */
  onAir: StationDef[];
}

const moved = new Map<string, StationDef>();

/** A station definition at another frequency (the same object every time it's asked for). */
export function stationAt(station: StationDef, frequency: number): StationDef {
  if (frequency === station.frequency) return station;
  const key = `${station.id}@${frequency}`;
  let def = moved.get(key);
  if (!def) {
    def = { ...station, frequency: round2(frequency) };
    moved.set(key, def);
    if (moved.size > 64) moved.delete(moved.keys().next().value!);
  }
  return def;
}

/** A cheap fingerprint of everything the layout depends on (compare before rebuilding). */
export function layoutKey({ ms, tz = browserTzOffset, discovered, visitor }: LayoutInput, stations: readonly StationDef[] = STATIONS): string {
  const minute = localTime(ms, tz).minuteOfDay;
  const found = new Set(discovered);
  const night = DRIFT_STATIONS.length ? nightOf(ms, tz) : 0;
  let gates = '';
  for (const s of stations) if (s.secret) gates += transmitting(s, minute, found) ? '1' : '0';
  return `${night}|${gates}|${visitor ? `${visitor.id}@${visitor.frequency}` : ''}`;
}

export function dialLayout(input: LayoutInput, stations: readonly StationDef[] = STATIONS): DialLayout {
  const { ms, tz = browserTzOffset, discovered, visitor = null } = input;
  const minute = localTime(ms, tz).minuteOfDay;
  const night = nightOf(ms, tz);
  const found = new Set(discovered);
  const roster = stations
    .map((s) => (s.drift?.length ? stationAt(s, driftFrequency(s, night)) : s))
    .sort((a, b) => a.frequency - b.frequency);
  const onAir: StationDef[] = [];
  for (const s of roster) {
    if (visitor?.id === s.id) onAir.push(stationAt(s, visitor.frequency));
    else if (transmitting(s, minute, found)) onAir.push(s);
  }
  onAir.sort((a, b) => a.frequency - b.frequency);
  return { key: layoutKey(input, stations), roster, onAir };
}

// ── Watching for secrets ──────────────────────────────────────────────────────

/** What the receiver hears at a moment (fed in on every heartbeat). */
export interface Sighting {
  wall: number;
  /** On air (not paused, off or lost). */
  playing: boolean;
  /** Dial position, MHz. */
  frequency: number;
  /**
   * What the receiver locks on to: a station or pirate (or oddity) with its centre frequency,
   * or null in pure static (nothing transmitting, nothing bleeding through).
   */
  lock: { id: string; kind: 'station' | 'pirate' | 'oddity'; frequency: number } | null;
  signal: number;
}

interface Visit {
  frequency: number;
  start: number;
  end: number;
}

const VISIT_MEMORY_MS = 10 * 60_000;

/**
 * Spots the `sequence` and `idle` secrets. Feed it every heartbeat; it returns the ids found
 * at that moment. A sequence is found when its frequencies have each been held (signal ≥
 * DISCOVER_SIGNAL, for `holdMs`) in order, all inside `withinMs`; other stations held in
 * between don't break it. An idle secret is found after `afterMs` of pure static while
 * playing: it becomes the `visitor` at that spot until the dial moves away.
 */
export class SecretWatcher {
  visitor: Visitor | null = null;
  private visits: Visit[] = [];
  private holding: Visit | null = null;
  private quietSince: number | null = null;
  private quietAt: number | null = null;

  constructor(private readonly stations: readonly StationDef[] = STATIONS) {}

  /** Lab: how long the receiver has sat in pure static (ms). */
  quietMs(wall: number): number {
    return this.quietSince === null ? 0 : wall - this.quietSince;
  }

  /** Lab: how many steps of a sequence secret are matched right now. */
  sequenceProgress(stationId: string, wall: number): number {
    const station = this.stations.find((s) => s.id === stationId);
    const unlock = station?.unlock;
    if (unlock?.kind !== 'sequence') return 0;
    return this.bestMatch(unlock, wall).matched;
  }

  observe(s: Sighting, discovered: readonly string[]): string[] {
    const found: string[] = [];
    const known = new Set(discovered);

    // The visitor leaves once the dial moves off it.
    if (this.visitor && Math.abs(s.frequency - this.visitor.frequency) >= SECRET_REACH) this.visitor = null;

    // Holds: a station held at a strong signal.
    const strong = s.playing && s.lock?.kind === 'station' && s.signal >= DISCOVER_SIGNAL;
    if (strong && this.holding && Math.abs(this.holding.frequency - s.lock!.frequency) < 0.005) {
      this.holding.end = s.wall;
    } else {
      this.holding = strong ? { frequency: s.lock!.frequency, start: s.wall, end: s.wall } : null;
      if (this.holding) this.visits.push(this.holding);
    }
    this.visits = this.visits.filter((v) => v.end >= s.wall - VISIT_MEMORY_MS).slice(-40);

    // Pure static, while playing.
    if (s.playing && s.lock === null) {
      if (this.quietSince === null || (this.quietAt !== null && s.wall - this.quietAt > 5000)) this.quietSince = s.wall;
      this.quietAt = s.wall;
    } else {
      this.quietSince = null;
      this.quietAt = null;
    }

    for (const station of this.stations) {
      if (!station.secret || known.has(station.id)) continue;
      const unlock = station.unlock;
      if (unlock?.kind === 'sequence') {
        if (this.bestMatch(unlock, s.wall).done) found.push(station.id);
      } else if (unlock?.kind === 'idle' && this.quietSince !== null && s.wall - this.quietSince >= unlock.afterMs && !this.visitor) {
        this.visitor = { id: station.id, frequency: round2(s.frequency) };
        this.quietSince = null;
        found.push(station.id);
      }
    }
    if (found.length) this.visits = [];
    return found;
  }

  private bestMatch(unlock: Extract<SecretUnlock, { kind: 'sequence' }>, wall: number): { matched: number; done: boolean } {
    const { frequencies, holdMs, withinMs } = unlock;
    const held = this.visits.filter((v) => v.end - v.start >= holdMs);
    const matches = (v: Visit, f: number) => Math.abs(v.frequency - f) < 0.005;
    let best = 0;
    for (let i = 0; i < held.length; i++) {
      if (!matches(held[i]!, frequencies[0]!)) continue;
      const start = held[i]!.start;
      let step = 1;
      let lastDone = start + holdMs;
      for (let j = i + 1; j < held.length && step < frequencies.length; j++) {
        if (matches(held[j]!, frequencies[step]!) && held[j]!.start + holdMs - start <= withinMs) {
          lastDone = held[j]!.start + holdMs;
          step++;
        }
      }
      if (step >= frequencies.length && lastDone - start <= withinMs) return { matched: step, done: true };
      // A partial run only counts while it can still finish in time.
      if (wall - start <= withinMs) best = Math.max(best, step);
    }
    return { matched: best, done: false };
  }
}

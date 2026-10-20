// Multiverse-wide events, seeded from UTC: every listener, on every station, hears the same
// event at the same instant. A few a day at seeded times, a minute or three each, never
// overlapping. Pure; the overlay (./overlay.ts) turns a plan into sound.
//
// v4, the Convergence: every Saturday at 20:00 UTC, for 4–6 minutes (seeded per week), every
// station notices the same thing. The topic rotates weekly (weeks since the epoch, mod 6).
// A random event that would clash with it moves out of the way, or is dropped.

import { createRng, hash, weightedPick } from './random';
import { DAY_MS, MIN_MS } from './time';
import { EVENT_IDS, type ActiveEvent, type EventId, type VoiceClip } from './types';

declare module './types' {
  interface ActiveEvent {
    kind?: EventId;
    stationA?: string;
    stationB?: string;
  }
  interface VoiceClip {
    swapWith?: string;
    swap_with?: string;
  }
}

export const EVENT_NAMES: Record<EventId, string> = {
  'dimensional-storm': 'Dimensional storm',
  'emergency-broadcast': 'Emergency Multiverse Broadcast',
  'the-hum': 'The Hum',
  'station-swap': 'Station swap',
  'signal-from-beyond': 'Signal from beyond',
  'time-slip': 'Time slip',
  convergence: 'The Convergence',
};

const WEIGHT: Record<EventId, number> = {
  'dimensional-storm': 3,
  'emergency-broadcast': 1.5,
  'the-hum': 2,
  'station-swap': 2,
  'signal-from-beyond': 1.5,
  'time-slip': 2,
  // Weekly at a fixed time (Saturdays 20:00 UTC), not part of the daily draw.
  convergence: 0,
};

/** Seconds each kind of event lasts. */
const LENGTH_S: Record<EventId, [number, number]> = {
  'dimensional-storm': [90, 180],
  'emergency-broadcast': [60, 110],
  'the-hum': [60, 150],
  'station-swap': [60, 180],
  'signal-from-beyond': [50, 90],
  'time-slip': [60, 120],
  convergence: [240, 360],
};

// ── The Convergence ───────────────────────────────────────────────────────────

/** What everyone notices, in rotation order (content/voice/SCHEMA.md): the clips' `kit`. */
export const CONVERGENCE_TOPICS = ['missing-moon', 'the-smell', 'the-song', 'the-knock', 'wrong-colour', 'the-pigeon'] as const;
export type ConvergenceTopic = (typeof CONVERGENCE_TOPICS)[number];

export const WEEK_MS = 7 * DAY_MS;
/** Saturday, 20:00 UTC. */
export const CONVERGENCE_UTC = { weekday: 6, hour: 20 } as const;
/** Random events keep this far clear of the Convergence. */
const CONVERGENCE_CLEARANCE_MS = 10 * MIN_MS;

/** UTC weekday of a day since the epoch (1970-01-01 was a Thursday). */
const utcWeekday = (day: number) => (((day + 4) % 7) + 7) % 7;

/** The topic of the Convergence in the week `ms` falls in (weeks since the epoch, mod 6). */
export function convergenceTopic(ms: number): ConvergenceTopic {
  const week = Math.floor(ms / WEEK_MS);
  return CONVERGENCE_TOPICS[((week % CONVERGENCE_TOPICS.length) + CONVERGENCE_TOPICS.length) % CONVERGENCE_TOPICS.length]!;
}

/** The Convergence on a UTC day, if that day is a Saturday. */
export function convergenceOnDay(day: number): ActiveEvent | null {
  if (utcWeekday(day) !== CONVERGENCE_UTC.weekday) return null;
  const startMs = day * DAY_MS + CONVERGENCE_UTC.hour * 3_600_000;
  const [lo, hi] = LENGTH_S.convergence;
  const durationMs = createRng(hash('convergence', Math.floor(startMs / WEEK_MS))).int(lo, hi) * 1000;
  return { id: 'convergence', name: EVENT_NAMES.convergence, startMs, durationMs };
}

/** The next Convergence starting after `ms`. */
export function nextConvergence(ms: number): ActiveEvent {
  for (let day = Math.floor(ms / DAY_MS); ; day++) {
    const c = convergenceOnDay(day);
    if (c && c.startMs > ms) return c;
  }
}

// ── The daily draw ────────────────────────────────────────────────────────────

const dayCache = new Map<number, ActiveEvent[]>();

/** Moves random events out of the Convergence's way (earlier, else later), or drops them. */
function clearFor(convergence: ActiveEvent, events: ActiveEvent[], day: number): ActiveEvent[] {
  const from = convergence.startMs - CONVERGENCE_CLEARANCE_MS;
  const to = convergence.startMs + convergence.durationMs + CONVERGENCE_CLEARANCE_MS;
  const out: ActiveEvent[] = [];
  events.forEach((e, i) => {
    if (e.startMs >= to || e.startMs + e.durationMs <= from) {
      out.push(e);
      return;
    }
    const before = out[out.length - 1];
    const after = events[i + 1];
    const earliest = Math.max(day * DAY_MS + 10 * MIN_MS, before ? before.startMs + before.durationMs : -Infinity);
    const latest = Math.min((day + 1) * DAY_MS - 10 * MIN_MS, after ? after.startMs : Infinity);
    if (from - e.durationMs >= earliest) out.push({ ...e, startMs: from - e.durationMs });
    else if (to + e.durationMs <= latest) out.push({ ...e, startMs: to });
  });
  out.push(convergence);
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The events of one UTC day (days since the epoch), in order. Saturdays include the Convergence. */
export function eventsOnDay(day: number): ActiveEvent[] {
  const cached = dayCache.get(day);
  if (cached) return cached;
  const rng = createRng(hash('multiverse-events', day));
  const count = rng.int(3, 5);
  const windowMs = DAY_MS / count;
  const events: ActiveEvent[] = [];
  let previous: EventId | undefined;
  for (let i = 0; i < count; i++) {
    const id = weightedPick(
      rng,
      EVENT_IDS.filter((e) => e !== previous && WEIGHT[e] > 0).map((e): [EventId, number] => [e, WEIGHT[e]]),
    )!;
    const [lo, hi] = LENGTH_S[id];
    const durationMs = rng.int(lo, hi) * 1000;
    // Each event has its own window of the day, with a margin at both ends.
    const from = day * DAY_MS + i * windowMs + 10 * MIN_MS;
    const to = day * DAY_MS + (i + 1) * windowMs - 10 * MIN_MS - durationMs;
    const startMs = Math.floor(rng.range(from, to) / 1000) * 1000;
    events.push({ id, name: EVENT_NAMES[id], startMs, durationMs });
    previous = id;
  }
  const convergence = convergenceOnDay(day);
  const all = convergence ? clearFor(convergence, events, day) : events;
  dayCache.set(day, all);
  if (dayCache.size > 8) dayCache.delete(dayCache.keys().next().value!);
  return all;
}

/** The event in progress at a UTC moment, if any. */
export function eventAt(ms: number): ActiveEvent | null {
  for (const e of eventsOnDay(Math.floor(ms / DAY_MS))) {
    if (ms >= e.startMs && ms < e.startMs + e.durationMs) return e;
  }
  return null;
}

/** The next event starting after `ms`. */
export function nextEvent(ms: number): ActiveEvent {
  for (let day = Math.floor(ms / DAY_MS); ; day++) {
    const e = eventsOnDay(day).find((x) => x.startMs > ms);
    if (e) return e;
  }
}

/** Events overlapping [fromMs, toMs). */
export function eventsBetween(fromMs: number, toMs: number): ActiveEvent[] {
  const out: ActiveEvent[] = [];
  for (let day = Math.floor(fromMs / DAY_MS); day * DAY_MS < toMs; day++) {
    for (const e of eventsOnDay(day)) if (e.startMs < toMs && e.startMs + e.durationMs > fromMs) out.push(e);
  }
  return out;
}

/** A manual event (the lab's "force event"), starting at `startMs`. */
export function makeEvent(
  id: EventId,
  startMs: number,
  durationMs?: number,
  stations?: { stationA?: string; stationB?: string } | string,
  stationB?: string,
): ActiveEvent {
  const [lo, hi] = LENGTH_S[id];
  const event: ActiveEvent = {
    id,
    name: EVENT_NAMES[id],
    startMs,
    durationMs: durationMs ?? Math.round((lo + hi) / 2) * 1000,
  };
  if (typeof stations === 'string') {
    event.stationA = stations;
    if (stationB) event.stationB = stationB;
  } else if (stations) {
    if (stations.stationA) event.stationA = stations.stationA;
    if (stations.stationB) event.stationB = stations.stationB;
  }
  return event;
}

// ── Paired station-swap crossovers ────────────────────────────────────────────

/** Built-in paired station-swap rules for `_events` clip IDs before manifest re-rendering. */
export const PAIRED_SWAP_RULES: Readonly<Record<string, readonly [string, string]>> = {
  'swap-007': ['win-this-planet', 'snail-jams'],
};

/** Returns the swap partner on a clip (supporting both camelCase `swapWith` and snake_case `swap_with`). */
export function swapPartnerOf(clip: VoiceClip): string | undefined {
  return clip.swapWith ?? (clip as { swap_with?: string }).swap_with;
}

/** Effective stations array for a clip (combining `clip.stations` and `PAIRED_SWAP_RULES`). */
function effectiveSwapStations(clip: VoiceClip): readonly string[] | undefined {
  if (clip.stations?.length) return clip.stations;
  return PAIRED_SWAP_RULES[clip.id];
}

/** True if this clip is a two-station paired crossover clip (`stations` has ≥2 entries, `swapWith`/`swap_with` is set, or in `PAIRED_SWAP_RULES`). */
export function isPairedSwapClip(clip: VoiceClip): boolean {
  const stations = effectiveSwapStations(clip);
  return Boolean((stations && stations.length >= 2) || swapPartnerOf(clip));
}

/** True if a paired crossover clip matches the swapping pair `(stationA, stationB)` in either order. */
export function matchesPairedSwap(clip: VoiceClip, stationA?: string, stationB?: string): boolean {
  if (!stationA || !stationB || stationA === stationB) return false;
  if (!isPairedSwapClip(clip)) return false;
  const stations = effectiveSwapStations(clip);
  const partner = swapPartnerOf(clip);
  if (stations && stations.length >= 2) {
    const hasBoth = stations.includes(stationA) && stations.includes(stationB);
    if (!hasBoth) return false;
    if (partner && partner !== stationA && partner !== stationB) return false;
    return true;
  }
  if (partner) {
    if (stations && stations.length === 1) {
      const own = stations[0]!;
      return (own === stationA && partner === stationB) || (own === stationB && partner === stationA);
    }
    return partner === stationA || partner === stationB;
  }
  return false;
}

/** True if a paired crossover clip includes `stationId` as one of its two stations. */
export function pairIncludesStation(clip: VoiceClip, stationId?: string): boolean {
  if (!stationId || !isPairedSwapClip(clip)) return false;
  const stations = effectiveSwapStations(clip);
  const partner = swapPartnerOf(clip);
  if (stations?.includes(stationId)) return true;
  if (partner === stationId) return true;
  return false;
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export interface PlannedClip {
  clip: VoiceClip;
  startMs: number;
}

export interface EventPlan {
  event: ActiveEvent;
  /** Event voice clips, back to back from just after the treatment begins. */
  clips: PlannedClip[];
  /** Station level for the whole event (1 = untouched, 0 = taken over). */
  base: number;
  /** Station level while an event clip plays. */
  underClip: number;
  /** Time-slip: between these times the station runs `shiftMs` behind (a replay). */
  slip: { fromMs: number; toMs: number; shiftMs: number } | null;
  /**
   * v4, the Convergence: its topic, and when the tuned station's own reaction may air (each
   * station's once, between the open and the close; tuning around hears several).
   */
  convergence?: { topic: ConvergenceTopic; fromMs: number; toMs: number };
}

/** How each event treats the station underneath it. */
const SHAPE: Record<EventId, { lead: number; base: number; underClip: number }> = {
  'dimensional-storm': { lead: 5000, base: 1, underClip: 0.2 },
  'emergency-broadcast': { lead: 6500, base: 0, underClip: 0 },
  'the-hum': { lead: 8000, base: 0.07, underClip: 0.05 },
  'station-swap': { lead: 2500, base: 1, underClip: 0.2 },
  'signal-from-beyond': { lead: 4000, base: 0, underClip: 0 },
  'time-slip': { lead: 0, base: 1, underClip: 0.2 },
  convergence: { lead: 3000, base: 1, underClip: 0.2 },
};

const SLIP_BACK_MS = 30_000;
const CLIP_GAP_MS = 1200;
const MAX_CLIPS = 3;

/**
 * What airs during an event: which `event` clips, when, and how the station is treated.
 * Deterministic for an event; `stationId` only narrows clips that name their stations.
 * For `station-swap`, paired crossover clips matching `(stationA, stationB)` are prioritized
 * over single-station and generic swap clips, and never air for unrelated station pairs.
 */
export function planEvent(
  event: ActiveEvent,
  pool: readonly VoiceClip[],
  stationId?: string,
  partnerStationId?: string,
): EventPlan {
  const eventId = event.id ?? event.kind!;
  if (eventId === 'convergence') return planConvergence(event, pool, stationId);
  const shape = SHAPE[eventId];
  const end = event.startMs + event.durationMs;
  const order = (c: VoiceClip) => (c.part === 'open' ? 0 : c.part === 'close' ? 2 : 1);

  const stationA = event.stationA ?? stationId;
  const stationB = event.stationB ?? (event.stationA && stationId && stationId !== event.stationA ? stationId : partnerStationId);
  const hasBothStations = Boolean(stationA && stationB && stationA !== stationB);
  const singleStation = !hasBothStations ? (stationA || stationB) : undefined;
  const pairAppliesToTuned = !stationId || stationId === stationA || stationId === stationB;

  const matchesClip = (c: VoiceClip): boolean => {
    if (c.event !== eventId) return false;
    if (eventId === 'station-swap') {
      if (isPairedSwapClip(c)) {
        if (hasBothStations) {
          return pairAppliesToTuned && matchesPairedSwap(c, stationA, stationB);
        }
        if (singleStation) {
          return pairIncludesStation(c, singleStation);
        }
        return false;
      }
      if (c.stations?.length) {
        if (stationId !== undefined) return c.stations.includes(stationId);
        return (stationA !== undefined && c.stations.includes(stationA)) || (stationB !== undefined && c.stations.includes(stationB));
      }
      return true;
    }
    return !c.stations?.length || (stationId !== undefined && c.stations.includes(stationId));
  };

  const tier = (c: VoiceClip): number => {
    if (eventId === 'station-swap') {
      if (isPairedSwapClip(c)) return 0;
      if (c.stations?.length) return 1;
    }
    return 2;
  };

  const candidates = pool
    .filter(matchesClip)
    .map((clip) => ({ clip, tier: tier(clip), rank: hash('event-clip', event.startMs, clip.url) }))
    .sort((a, b) => order(a.clip) - order(b.clip) || a.tier - b.tier || a.rank - b.rank)
    .map((x) => x.clip);

  // At most one open and one close; bodies (and untagged clips) in between.
  const open = candidates.find((c) => c.part === 'open');
  const close = candidates.find((c) => c.part === 'close');
  const allBodies = candidates.filter((c) => c.part !== 'open' && c.part !== 'close');
  const room = event.durationMs - shape.lead - 2000;

  // When paired crossover clips exist for (stationA, stationB) and fit the event, prefer them exclusively over generic/single-station swap clips.
  const pairedBodies = eventId === 'station-swap' ? allBodies.filter((c) => isPairedSwapClip(c) && c.durationMs <= room) : [];
  const bodies = pairedBodies.length > 0 ? pairedBodies : allBodies;

  const chosen: VoiceClip[] = [];
  let used = 0;
  const fits = (c: VoiceClip) => used + c.durationMs + (chosen.length ? CLIP_GAP_MS : 0) <= room;
  const take = (c: VoiceClip) => {
    used += c.durationMs + (chosen.length ? CLIP_GAP_MS : 0);
    chosen.push(c);
  };
  if (open && fits(open)) take(open);
  const reserve = close ? close.durationMs + CLIP_GAP_MS : 0;
  for (const c of bodies) {
    if (chosen.length >= MAX_CLIPS - (close ? 1 : 0)) break;
    if (used + c.durationMs + CLIP_GAP_MS + reserve <= room) take(c);
  }
  if (close && fits(close)) take(close);

  let slip: EventPlan['slip'] = null;
  let t = event.startMs + shape.lead;
  if (eventId === 'time-slip') {
    // The replay runs first; whatever the hosts make of it airs once we snap back.
    let tail = chosen.length ? used + 2500 : 0;
    if (event.durationMs - tail < 30_000) {
      chosen.length = 0;
      tail = 0;
    }
    slip = { fromMs: event.startMs, toMs: end - tail, shiftMs: -SLIP_BACK_MS };
    t = slip.toMs + 1500;
  }
  const clips: PlannedClip[] = [];
  for (const clip of chosen) {
    clips.push({ clip, startMs: t });
    t += clip.durationMs + CLIP_GAP_MS;
  }
  return { event, clips, base: shape.base, underClip: shape.underClip, slip };
}

/** Helper facade for planning and picking event clips (including paired `station-swap` crossovers). */
export class EventCenter {
  constructor(private readonly defaultPool: readonly VoiceClip[] = []) {}

  plan(event: ActiveEvent, pool: readonly VoiceClip[] = this.defaultPool, stationId?: string, partnerStationId?: string): EventPlan {
    return planEvent(event, pool, stationId, partnerStationId);
  }

  pickClip(event: ActiveEvent, pool: readonly VoiceClip[] = this.defaultPool, stationId?: string, partnerStationId?: string): VoiceClip | undefined {
    return this.plan(event, pool, stationId, partnerStationId).clips[0]?.clip;
  }

  pickClips(event: ActiveEvent, pool: readonly VoiceClip[] = this.defaultPool, stationId?: string, partnerStationId?: string): VoiceClip[] {
    return this.plan(event, pool, stationId, partnerStationId).clips.map((c) => c.clip);
  }
}

// ── The Convergence ───────────────────────────────────────────────────────────

/** Is this clip part of the Convergence (open, close or a station's reaction)? */
export const isConvergenceClip = (clip: VoiceClip): boolean => clip.event === 'convergence';

/**
 * The Convergence: the shared open for this week's topic as it starts, the shared close
 * just before it ends, and a window in between for the tuned station's reaction.
 */
export function planConvergence(event: ActiveEvent, pool: readonly VoiceClip[], stationId?: string): EventPlan {
  const shape = SHAPE.convergence;
  const topic = convergenceTopic(event.startMs);
  const end = event.startMs + event.durationMs;
  const ranked = pool
    .filter((c) => c.event === 'convergence' && c.kit === topic)
    .filter((c) => !c.stations?.length || (stationId !== undefined && c.stations.includes(stationId)))
    .map((clip) => ({ clip, rank: hash('event-clip', event.startMs, clip.url) }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.clip);
  const open = ranked.find((c) => c.part === 'open');
  const close = ranked.find((c) => c.part === 'close');
  const clips: PlannedClip[] = [];
  let from = event.startMs + shape.lead;
  if (open && from + open.durationMs < end - 2000) {
    clips.push({ clip: open, startMs: from });
    from += open.durationMs + CLIP_GAP_MS;
  }
  let to = end - 2000;
  if (close) {
    const at = end - 2500 - close.durationMs;
    if (at >= from) {
      clips.push({ clip: close, startMs: at });
      to = at - CLIP_GAP_MS;
    }
  }
  return {
    event,
    clips,
    base: shape.base,
    underClip: shape.underClip,
    slip: null,
    convergence: { topic, fromMs: from, toMs: to },
  };
}

/**
 * A station's reaction to this week's topic, from its own manifest (`category = "event"`,
 * `event = "convergence"`, `kit = <topic>`), or undefined if it has none.
 */
export function convergenceReaction(clips: readonly VoiceClip[], topic: string, eventStartMs: number): VoiceClip | undefined {
  let best: VoiceClip | undefined;
  let bestRank = Infinity;
  for (const c of clips) {
    if (c.category !== 'event' || c.event !== 'convergence' || c.kit !== topic || c.part === 'open' || c.part === 'close') continue;
    const rank = hash('reaction', eventStartMs, c.url);
    if (rank < bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}

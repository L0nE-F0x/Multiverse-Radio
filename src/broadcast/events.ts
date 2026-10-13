// Multiverse-wide events, seeded from UTC: every listener, on every station, hears the same
// event at the same instant. A few a day at seeded times, a minute or three each, never
// overlapping. Pure; the overlay (./overlay.ts) turns a plan into sound.

import { createRng, hash, weightedPick } from './random';
import { DAY_MS, MIN_MS } from './time';
import { EVENT_IDS, type ActiveEvent, type EventId, type VoiceClip } from './types';

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
  // Weekly at a fixed time, not part of the daily draw. TODO(v4 director): schedule it.
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

const dayCache = new Map<number, ActiveEvent[]>();

/** The events of one UTC day (days since the epoch), in order. */
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
  dayCache.set(day, events);
  if (dayCache.size > 8) dayCache.delete(dayCache.keys().next().value!);
  return events;
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
export function makeEvent(id: EventId, startMs: number, durationMs?: number): ActiveEvent {
  const [lo, hi] = LENGTH_S[id];
  return { id, name: EVENT_NAMES[id], startMs, durationMs: durationMs ?? Math.round((lo + hi) / 2) * 1000 };
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
 */
export function planEvent(event: ActiveEvent, pool: readonly VoiceClip[], stationId?: string): EventPlan {
  const shape = SHAPE[event.id];
  const end = event.startMs + event.durationMs;
  const order = (c: VoiceClip) => (c.part === 'open' ? 0 : c.part === 'close' ? 2 : 1);
  const candidates = pool
    .filter((c) => c.event === event.id && (!c.stations?.length || (stationId !== undefined && c.stations.includes(stationId))))
    .map((clip) => ({ clip, rank: hash('event-clip', event.startMs, clip.url) }))
    .sort((a, b) => order(a.clip) - order(b.clip) || a.rank - b.rank)
    .map((x) => x.clip);

  // At most one open and one close; bodies (and untagged clips) in between.
  const open = candidates.find((c) => c.part === 'open');
  const close = candidates.find((c) => c.part === 'close');
  const bodies = candidates.filter((c) => c.part !== 'open' && c.part !== 'close');
  const chosen: VoiceClip[] = [];
  const room = event.durationMs - shape.lead - 2000;
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
  if (event.id === 'time-slip') {
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

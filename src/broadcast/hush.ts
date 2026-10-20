// HUSH, the Nightjar's computer: when it speaks and what it says. Unlike stations and
// events, HUSH is personal: it follows this listener's session, not the broadcast clock.
// It grows stranger the longer the shift runs (clip `level` 0–3).
//
// v4: arcs. Clips with `arc: { id, step }` tell a story across night shifts: step n airs
// once, at the first notice after the listener has worked n shifts, in order, never skipping
// ahead, and before anything else HUSH has to say. Clips with `kit = "jam"` are reserved for
// jamming Free Frequency, and never air as ordinary notices.

import type { Daypart, EventId, VoiceClip } from './types';

export type HushTrigger =
  | 'on_skip_streak'
  | 'scanning_static'
  | 'on_pirate'
  | 'after_event'
  | 'near_secret'
  | 'on_station';

declare module './types' {
  interface VoiceClip {
    trigger?: HushTrigger;
    swapWith?: string;
    swap_with?: string;
  }
}

const MIN = 60_000;
const SKIP_WINDOW_MS = 15 * MIN;
const EVENT_MEMORY_MS = 15 * MIN;
const STATIC_SCAN_THRESHOLD_MS = 15_000;
const STATIC_SCAN_FREQ_COUNT = 5;

/** Listening time at which each level unlocks. */
export const HUSH_LEVEL_AT_MS = [0, 45 * MIN, 120 * MIN, 240 * MIN] as const;

export type HushLevel = 0 | 1 | 2 | 3;

export function hushLevel(listenMs: number): HushLevel {
  let level: HushLevel = 0;
  HUSH_LEVEL_AT_MS.forEach((at, i) => {
    if (listenMs >= at) level = i as HushLevel;
  });
  return level;
}

/** Listening time before HUSH first speaks, and between notices after that. */
export const HUSH_FIRST_MS: [number, number] = [4 * MIN, 8 * MIN];
export const HUSH_GAP_MS: [number, number] = [10 * MIN, 20 * MIN];

export const nextHushDelay = (random: () => number, first = false): number => {
  const [lo, hi] = first ? HUSH_FIRST_MS : HUSH_GAP_MS;
  return lo + random() * (hi - lo);
};

/** `_ship` clips with this kit only air when HUSH jams Free Frequency. */
export const JAM_KIT = 'jam';
export const isJamClip = (clip: VoiceClip): boolean => clip.kit === JAM_KIT;

/** The off-course arc (docs/V4-PLAN.md). */
export const OFF_COURSE = 'off-course';
/** Evasive notices about the heading: ordinary notices once the listener has worked a shift. */
export const HEADING_KIT = 'heading';

/** Arc steps aired so far, per arc id (persisted by the store). */
export type ArcProgress = Readonly<Record<string, readonly number[]>>;

/** Built-in heuristic rules for `_ship` clip IDs that reference specific operator behavior. */
export interface HushClipRule {
  trigger?: HushTrigger;
  stations?: readonly string[];
}

export const HUSH_CLIP_RULES: Readonly<Record<string, HushClipRule>> = {
  'hush-2-skipped': { trigger: 'on_skip_streak' },
  'l1-16': { trigger: 'on_skip_streak' },
  'l2-13': { trigger: 'on_skip_streak' },
  'hush-2-slow-past': { trigger: 'on_station', stations: ['static-lullabies'] },
  'l2-07': { trigger: 'on_station', stations: ['static-lullabies'] },
  'hush-2-wandering': { trigger: 'scanning_static' },
  'l1-11': { trigger: 'scanning_static' },
  'l1-17': { trigger: 'scanning_static' },
  'l2-06': { trigger: 'scanning_static' },
  'l0-17': { trigger: 'on_pirate' },
  'l0-13': { trigger: 'after_event' },
  'l2-09': { trigger: 'near_secret' },
};

/** Effective trigger and station filter for a HUSH clip (combining manifest fields and built-in ID heuristics). */
export function effectiveClipRule(clip: VoiceClip): HushClipRule {
  const builtin = HUSH_CLIP_RULES[clip.id];
  const stations = clip.stations?.length ? clip.stations : builtin?.stations;
  const trigger = clip.trigger ?? builtin?.trigger ?? (stations?.length && !isJamClip(clip) ? 'on_station' : undefined);
  return {
    ...(trigger ? { trigger } : {}),
    ...(stations?.length ? { stations } : {}),
  };
}

/** Tracked operator behavior for context-reactive HUSH notices. */
export interface HushBehaviorState {
  skipTimes: number[];
  skipStreakActive: boolean;
  staticTimeMs: number;
  inStaticSinceMs: number | null;
  scanningStaticActive: boolean;
  tunedFrequencies: Set<number>;
  visitedStations: Set<string>;
  recentStations: Map<string, number>;
  currentStationId: string | null;
  lastStationId: string | null;
  currentFrequency: number | null;
  isPirate: boolean;
  onPirateActive: boolean;
  nearSecret: boolean;
  nearSecretActive: boolean;
  lastEventKind: EventId | null;
  lastEventEndMs: number | null;
  afterEventActive: boolean;
  stationTriggerActive: boolean;
  lastNowMs: number;
}

/** What the picker needs to know about the listener's moment. */
export interface HushContext {
  /** Local "MM-DD". */
  date: string;
  daypart: Daypart;
  /** v4: local weekday (0 = Sunday), for clips with `days`. */
  weekday?: number;
  /** v4: night shifts worked. */
  shifts?: number;
  /** v4: arc steps already aired. */
  aired?: ArcProgress;
  /** v4: arc steps that must wait for something else (step 8 waits for The Harbour). */
  holdArc?: (arc: { id: string; step: number }) => boolean;
  /** Current wall-clock timestamp in ms. */
  nowMs?: number;
  /** Currently tuned station id, if any. */
  stationId?: string | null;
  /** Whether currently tuned to a pirate station. */
  isPirate?: boolean;
  /** Whether currently near a secret station. */
  nearSecret?: boolean;
}

/**
 * The arc step due now, if any: for each arc, the lowest step not yet aired, provided the
 * listener has worked at least that many shifts. Several clips for one step are variants.
 */
export function dueArcClip(
  pool: readonly VoiceClip[],
  shifts: number,
  aired: ArcProgress = {},
  random: () => number = Math.random,
  hold?: (arc: { id: string; step: number }) => boolean,
): VoiceClip | undefined {
  const next = new Map<string, number>();
  for (const c of pool) {
    if (!c.arc) continue;
    const done = aired[c.arc.id];
    if (done?.includes(c.arc.step)) continue;
    const step = next.get(c.arc.id);
    if (step === undefined || c.arc.step < step) next.set(c.arc.id, c.arc.step);
  }
  const due = [...next.entries()].filter(([id, step]) => step <= shifts && !hold?.({ id, step })).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0];
  if (!due) return undefined;
  const variants = pool.filter((c) => c.arc?.id === due[0] && c.arc.step === due[1]);
  return variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))];
}

const TRIGGER_PRIORITY: Readonly<Record<HushTrigger, number>> = {
  on_skip_streak: 1,
  after_event: 2,
  on_station: 3,
  on_pirate: 4,
  near_secret: 5,
  scanning_static: 6,
};

/**
 * Picks HUSH's next notice: nothing above the unlocked level, context-reactive triggered
 * notices first when their behavioral condition is active, today's dated clips next, and
 * the session's unheard clips before any repeat. Clips with a `trigger` or `stations`
 * filter never air when their condition is false.
 */
export class HushPicker {
  private readonly heard = new Map<string, number>();
  private count = 0;
  readonly state: HushBehaviorState = {
    skipTimes: [],
    skipStreakActive: false,
    staticTimeMs: 0,
    inStaticSinceMs: null,
    scanningStaticActive: false,
    tunedFrequencies: new Set<number>(),
    visitedStations: new Set<string>(),
    recentStations: new Map<string, number>(),
    currentStationId: null,
    lastStationId: null,
    currentFrequency: null,
    isPirate: false,
    onPirateActive: false,
    nearSecret: false,
    nearSecretActive: false,
    lastEventKind: null,
    lastEventEndMs: null,
    afterEventActive: false,
    stationTriggerActive: false,
    lastNowMs: 0,
  };

  constructor(
    private readonly defaultPool: readonly VoiceClip[] = [],
    private readonly defaultRandom: () => number = Math.random,
  ) {}

  /** Records an operator segment skip. 2+ skips within 15 minutes activates `on_skip_streak`. */
  recordSkip(nowMs: number = this.state.lastNowMs): void {
    const now = Number.isFinite(nowMs) ? nowMs : this.state.lastNowMs;
    this.advanceStaticTime(now);
    this.state.lastNowMs = Math.max(this.state.lastNowMs, now);
    this.state.skipTimes = this.state.skipTimes.filter((t) => now - t <= SKIP_WINDOW_MS && t <= now);
    this.state.skipTimes.push(now);
    if (this.state.skipTimes.length >= 2) {
      this.state.skipStreakActive = true;
    }
  }

  /** Records dial movement or tuning state. */
  recordTune(
    freq: number,
    stationId: string | null,
    isPirate = false,
    nearSecret = false,
    nowMs: number = this.state.lastNowMs,
  ): void {
    const now = Number.isFinite(nowMs) ? nowMs : this.state.lastNowMs;
    this.advanceStaticTime(now);
    this.state.lastNowMs = Math.max(this.state.lastNowMs, now);

    const prevFreq = this.state.currentFrequency;
    const prevStationId = this.state.currentStationId;
    const roundedFreq = Number.isFinite(freq) ? Math.round(freq * 100) / 100 : null;
    const prevRoundedFreq = prevFreq !== null ? Math.round(prevFreq * 100) / 100 : null;
    const freqChanged = roundedFreq !== null && roundedFreq !== prevRoundedFreq;

    const pirate = isPirate || Boolean(stationId?.startsWith('pirate-'));
    const inStatic = stationId === null && !pirate;

    if (inStatic) {
      if (this.state.inStaticSinceMs === null) {
        this.state.inStaticSinceMs = now;
      }
      if (roundedFreq !== null) {
        this.state.tunedFrequencies.add(roundedFreq);
      }
      // Tuning across Static Lullabies' frequency (87.7 MHz) or transitioning off it counts as slowing past it.
      // Guard against repeated heartbeat ticks at the same static frequency re-arming a consumed trigger.
      const nearStaticLullabies = Number.isFinite(freq) && Math.abs(freq - 87.7) <= 0.25;
      if ((nearStaticLullabies && freqChanged) || prevStationId === 'static-lullabies') {
        this.state.lastStationId = 'static-lullabies';
        this.state.visitedStations.add('static-lullabies');
        this.state.recentStations.set('static-lullabies', now);
        this.state.stationTriggerActive = true;
      }
    } else {
      this.state.inStaticSinceMs = null;
      if (roundedFreq !== null) {
        this.state.tunedFrequencies.add(roundedFreq);
      }
    }

    if (this.state.staticTimeMs >= STATIC_SCAN_THRESHOLD_MS || this.state.tunedFrequencies.size >= STATIC_SCAN_FREQ_COUNT) {
      this.state.scanningStaticActive = true;
    }

    if (stationId && !pirate) {
      if (stationId !== this.state.currentStationId) {
        this.state.stationTriggerActive = true;
      }
      this.state.currentStationId = stationId;
      this.state.lastStationId = stationId;
      this.state.visitedStations.add(stationId);
      this.state.recentStations.set(stationId, now);
    } else if (pirate) {
      this.state.currentStationId = stationId ?? (Number.isFinite(freq) ? `pirate-${freq.toFixed(2)}` : 'pirate');
    } else {
      this.state.currentStationId = null;
    }

    if (pirate && !this.state.isPirate) {
      this.state.onPirateActive = true;
    } else if (!pirate && stationId !== null) {
      this.state.onPirateActive = false;
    }
    this.state.isPirate = pirate;

    if (nearSecret && !this.state.nearSecret) {
      this.state.nearSecretActive = true;
    } else if (!nearSecret && stationId !== null) {
      this.state.nearSecretActive = false;
    }
    this.state.nearSecret = nearSecret;
    if (Number.isFinite(freq)) {
      this.state.currentFrequency = freq;
    }
  }

  /** Records the end of a multiverse anomaly event so `after_event` HUSH clips can fire. */
  recordEventEnd(eventKind: EventId, nowMs: number = this.state.lastNowMs): void {
    const now = Number.isFinite(nowMs) ? nowMs : this.state.lastNowMs;
    this.advanceStaticTime(now);
    this.state.lastNowMs = Math.max(this.state.lastNowMs, now);
    this.state.lastEventKind = eventKind;
    this.state.lastEventEndMs = now;
    this.state.afterEventActive = true;
  }

  private advanceStaticTime(nowMs: number): void {
    if (this.state.inStaticSinceMs !== null && nowMs > this.state.lastNowMs) {
      const elapsed = nowMs - Math.max(this.state.lastNowMs, this.state.inStaticSinceMs);
      if (elapsed > 0) this.state.staticTimeMs += elapsed;
      if (this.state.staticTimeMs >= STATIC_SCAN_THRESHOLD_MS) {
        this.state.scanningStaticActive = true;
      }
    }
  }

  pick(
    poolOrNowMs?: readonly VoiceClip[] | number,
    level = 3,
    context: Partial<HushContext> = {},
    random: () => number = this.defaultRandom,
  ): VoiceClip | undefined {
    const pool = Array.isArray(poolOrNowMs) ? poolOrNowMs : this.defaultPool;
    const nowMs = typeof poolOrNowMs === 'number' ? poolOrNowMs : (context.nowMs ?? this.state.lastNowMs);
    this.advanceStaticTime(nowMs);
    if (nowMs > this.state.lastNowMs) this.state.lastNowMs = nowMs;

    const date = context.date ?? '01-01';
    const daypart = context.daypart ?? 'night';
    const { weekday } = context;

    const arc = dueArcClip(pool, context.shifts ?? 0, context.aired, random, context.holdArc);
    if (arc) {
      this.heard.set(arc.url, ++this.count);
      return arc;
    }

    const activeStationId = context.stationId !== undefined ? context.stationId : this.state.currentStationId;
    const activePirate = context.isPirate ?? (this.state.isPirate || Boolean(activeStationId?.startsWith('pirate-')));

    const matchesStation = (rule: HushClipRule): boolean => {
      if (!rule.stations?.length) return true;
      if (activeStationId !== null && rule.stations.includes(activeStationId)) return true;
      // Allow `hush-2-slow-past` / `l2-07` if the operator tuned past `static-lullabies` (into static or onto another station).
      if (
        rule.stations.includes('static-lullabies') &&
        this.state.visitedStations.has('static-lullabies') &&
        this.state.stationTriggerActive
      ) {
        return true;
      }
      return false;
    };

    const matchesTrigger = (clip: VoiceClip, rule: HushClipRule): boolean => {
      if (!rule.trigger) return true;
      switch (rule.trigger) {
        case 'on_skip_streak': {
          const recentSkips = this.state.skipTimes.filter((t) => nowMs - t <= SKIP_WINDOW_MS && t <= nowMs);
          return this.state.skipStreakActive && recentSkips.length >= 2;
        }
        case 'scanning_static':
          return this.state.scanningStaticActive;
        case 'on_pirate':
          return this.state.onPirateActive || context.isPirate === true;
        case 'near_secret':
          return this.state.nearSecretActive || context.nearSecret === true;
        case 'after_event':
          return (
            this.state.afterEventActive &&
            this.state.lastEventEndMs !== null &&
            nowMs - this.state.lastEventEndMs <= EVENT_MEMORY_MS &&
            (!clip.event || clip.event === this.state.lastEventKind)
          );
        case 'on_station':
          if (rule.stations?.length) return matchesStation(rule);
          return activeStationId !== null && !activePirate;
      }
    };

    // Hard Rule 1: Any clip with a trigger or station filter MUST NOT be picked if its condition is false.
    let eligible = pool.filter((c) => {
      if (c.arc || isJamClip(c)) return false;
      if (c.kit === HEADING_KIT && (context.shifts ?? 0) < 1) return false;
      if ((c.level ?? 0) > level) return false;
      if (c.dates && !c.dates.includes(date)) return false;
      if (c.days && weekday !== undefined && !c.days.includes(weekday)) return false;
      const rule = effectiveClipRule(c);
      if (!matchesStation(rule)) return false;
      if (!matchesTrigger(c, rule)) return false;
      return true;
    });

    const inDaypart = eligible.filter((c) => !c.daypart || c.daypart === daypart);
    if (inDaypart.length) eligible = inDaypart;
    if (eligible.length === 0) return undefined;

    // Hard Rule 2: Prioritize eligible triggered/station-specific clips when a trigger condition is active.
    const isPrioritizedTrigger = (c: VoiceClip): boolean => {
      const rule = effectiveClipRule(c);
      if (!rule.trigger) return false;
      if (rule.trigger === 'on_station') {
        return this.state.stationTriggerActive;
      }
      return true;
    };

    const triggered = eligible.filter(isPrioritizedTrigger);
    if (triggered.length > 0) {
      const bestPriority = Math.min(
        ...triggered.map((c) => {
          const t = effectiveClipRule(c).trigger!;
          return TRIGGER_PRIORITY[t];
        }),
      );
      eligible = triggered.filter((c) => TRIGGER_PRIORITY[effectiveClipRule(c).trigger!] === bestPriority);
    }

    const unheard = eligible.filter((c) => !this.heard.has(c.url));
    let choice: VoiceClip | undefined;
    if (unheard.length) {
      const weight = (c: VoiceClip) => (c.dates || c.days ? 8 : 1) * (1 + 1.5 * (c.level ?? 0));
      const total = unheard.reduce((n, c) => n + weight(c), 0);
      let roll = random() * total;
      for (const c of unheard) {
        roll -= weight(c);
        if (roll < 0) {
          choice = c;
          break;
        }
      }
      choice ??= unheard[unheard.length - 1];
    } else {
      // Everything's been said: the longest-ago notice comes round again.
      choice = eligible.reduce((a, b) => (this.heard.get(a.url)! <= this.heard.get(b.url)! ? a : b));
    }

    if (choice) {
      this.heard.set(choice.url, ++this.count);
      this.consumeTrigger(choice, nowMs);
    }
    return choice;
  }

  private consumeTrigger(clip: VoiceClip, nowMs: number): void {
    const rule = effectiveClipRule(clip);
    switch (rule.trigger) {
      case 'on_skip_streak':
        this.state.skipStreakActive = false;
        this.state.skipTimes = [];
        break;
      case 'after_event':
        this.state.afterEventActive = false;
        break;
      case 'scanning_static':
        this.state.scanningStaticActive = false;
        this.state.staticTimeMs = 0;
        this.state.inStaticSinceMs = this.state.currentStationId === null && !this.state.isPirate ? nowMs : null;
        this.state.tunedFrequencies.clear();
        break;
      case 'on_pirate':
        this.state.onPirateActive = false;
        break;
      case 'near_secret':
        this.state.nearSecretActive = false;
        break;
      case 'on_station':
        this.state.stationTriggerActive = false;
        break;
    }
  }
}

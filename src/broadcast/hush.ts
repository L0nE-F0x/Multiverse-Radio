// HUSH, the Nightjar's computer: when it speaks and what it says. Unlike stations and
// events, HUSH is personal: it follows this listener's session, not the broadcast clock.
// It grows stranger the longer the shift runs (clip `level` 0–3).
//
// v4: arcs. Clips with `arc: { id, step }` tell a story across night shifts: step n airs
// once, at the first notice after the listener has worked n shifts, in order, never skipping
// ahead, and before anything else HUSH has to say. Clips with `kit = "jam"` are reserved for
// jamming Free Frequency, and never air as ordinary notices.

import type { Daypart, VoiceClip } from './types';

const MIN = 60_000;

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

/**
 * Picks HUSH's next notice: nothing above the unlocked level, today's dated clips first,
 * and the session's unheard clips before any repeat. Newly unlocked, stranger clips are
 * favoured a little.
 */
export class HushPicker {
  private readonly heard = new Map<string, number>();
  private count = 0;

  pick(pool: readonly VoiceClip[], level: number, context: HushContext, random: () => number): VoiceClip | undefined {
    const arc = dueArcClip(pool, context.shifts ?? 0, context.aired, random, context.holdArc);
    if (arc) {
      this.heard.set(arc.url, ++this.count);
      return arc;
    }
    const { weekday } = context;
    let eligible = pool.filter(
      (c) =>
        !c.arc &&
        !isJamClip(c) &&
        (c.kit !== HEADING_KIT || (context.shifts ?? 0) >= 1) &&
        (c.level ?? 0) <= level &&
        (!c.dates || c.dates.includes(context.date)) &&
        (!c.days || weekday === undefined || c.days.includes(weekday)),
    );
    const inDaypart = eligible.filter((c) => !c.daypart || c.daypart === context.daypart);
    if (inDaypart.length) eligible = inDaypart;
    if (eligible.length === 0) return undefined;
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
    if (choice) this.heard.set(choice.url, ++this.count);
    return choice;
  }
}

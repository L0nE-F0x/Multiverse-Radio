// HUSH, the Nightjar's computer: when it speaks and what it says. Unlike stations and
// events, HUSH is personal: it follows this listener's session, not the broadcast clock.
// It grows stranger the longer the shift runs (clip `level` 0–3).

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

/**
 * Picks HUSH's next notice: nothing above the unlocked level, today's dated clips first,
 * and the session's unheard clips before any repeat. Newly unlocked, stranger clips are
 * favoured a little.
 */
export class HushPicker {
  private readonly heard = new Map<string, number>();
  private count = 0;

  pick(
    pool: readonly VoiceClip[],
    level: number,
    context: { date: string; daypart: Daypart },
    random: () => number,
  ): VoiceClip | undefined {
    let eligible = pool.filter((c) => (c.level ?? 0) <= level && (!c.dates || c.dates.includes(context.date)));
    const inDaypart = eligible.filter((c) => !c.daypart || c.daypart === context.daypart);
    if (inDaypart.length) eligible = inDaypart;
    if (eligible.length === 0) return undefined;
    const unheard = eligible.filter((c) => !this.heard.has(c.url));
    let choice: VoiceClip | undefined;
    if (unheard.length) {
      const weight = (c: VoiceClip) => (c.dates ? 8 : 1) * (1 + 1.5 * (c.level ?? 0));
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

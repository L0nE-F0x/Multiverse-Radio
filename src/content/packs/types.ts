import type { Grammar } from '../grammar';

/**
 * A track-naming pack. Its grammar must define `title` and `artist`; `album`, `note` and
 * `fixed` are optional. `note` options may use `#sharedNote#` from the common grammar.
 *
 * `fixed` holds hand-written one-off titles. They air with probability `fixedChance`
 * (default 0.02), like the station's hits in light rotation, so they never crowd out the
 * combinatorial titles.
 */
export interface TrackPack {
  grammar: Grammar;
  /** Probability that a track gets an album line (default 0.6). */
  albumChance?: number;
  /** Probability that a track gets a liner note (default 0.5). */
  noteChance?: number;
  /** Probability of airing one of the hand-written `fixed` titles (default 0.02). */
  fixedChance?: number;
  /** Probability of tagging a bracket-free title with the `suffix` rule (default 0.3). */
  suffixChance?: number;
  /** Allow deliberate stutters like "Seven Seven Four" (otherwise rejected as accidents). */
  allowStutter?: boolean;
  /** Used if every attempt at a title runs too long. */
  fallbackTitle: string;
}

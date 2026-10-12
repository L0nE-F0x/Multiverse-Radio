// The listener's ship. You are the night-shift operator of the relay ship Nightjar, which
// intercepts broadcasts from other dimensions. Its computer, HUSH, speaks now and then:
// deadpan system notices, logged intercepts, and, late in a long shift, stranger things.

import type { Persona } from '../broadcast/types';

export const SHIP = {
  /** The relay ship. */
  vessel: 'Nightjar',
  /** Hull designation shown on the HUD. */
  designation: 'R/S NIGHTJAR · RELAY 7',
  /** Who built the receiver console (a small maker's plate; the v2 brand lives on here). */
  maker: 'Gloaming & Daughters',
  computer: {
    name: 'HUSH',
    voice: 'af_heart',
    speed: 0.95,
    bio: "The Nightjar's computer. Calm, precise and very polite. Keeps the log, the heading and the kettle. Grows a little stranger the longer the shift runs.",
  } satisfies Persona,
} as const;

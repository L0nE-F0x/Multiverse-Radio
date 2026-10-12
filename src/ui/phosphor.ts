// HUD phosphor colours. The console is an amber terminal; each station tints it with its own
// phosphor. Tuned for legibility on near-black (every value clears WCAG AA 4.5:1 against
// #000 with room to spare, and AA for large text over the dimmed scrims).

import type { OddityId, PhosphorId, Tuned } from '../broadcast/types';

export const PHOSPHOR: Record<PhosphorId, string> = {
  amber: '#ffb000',
  green: '#3dff8e',
  cyan: '#5ce1ff',
  white: '#e8eef5',
  red: '#ff5f4f',
  violet: '#b896ff',
  rose: '#ff7fab',
};

/** The console's own colour: HUSH, empty band, the cold receiver. */
export const SHIP_PHOSPHOR: PhosphorId = 'amber';

const ODDITY_PHOSPHOR: Record<OddityId, PhosphorId> = {
  'test-tone': 'white',
  'distress-beacon': 'red',
  'stuck-loop': 'rose',
  'time-signal': 'green',
};

export function oddityPhosphor(oddity: OddityId): PhosphorId {
  return ODDITY_PHOSPHOR[oddity] ?? SHIP_PHOSPHOR;
}

/** Which phosphor the HUD glows in for what the dial is picking up. */
export function tunedPhosphor(tuned: Tuned): PhosphorId {
  switch (tuned.kind) {
    case 'station':
    case 'pirate':
      return tuned.station.phosphor ?? SHIP_PHOSPHOR;
    case 'oddity':
      return oddityPhosphor(tuned.oddity);
    default:
      return SHIP_PHOSPHOR;
  }
}

export function phosphorHex(id: PhosphorId | undefined): string {
  return PHOSPHOR[id ?? SHIP_PHOSPHOR] ?? PHOSPHOR.amber;
}

/** `#rrggbb` mixed toward black: for the browser's theme colour. */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

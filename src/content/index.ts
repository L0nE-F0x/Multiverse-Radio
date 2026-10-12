// Procedural text: song titles, artist names, tickers, listener messages, reception and
// weather. Every function is pure and deterministic for a given seed (seeded PRNG, no
// Math.random), built from Tracery-style grammars in this folder.

export { trackMeta } from './tracks';
export { tickerLines } from './ticker';
export { listenerMessage, type ListenerMessage } from './listeners';
export { receptionReport } from './reception';
export { dimensionWeather } from './weather';
export { LIMITS } from './limits';

// ── v3 stubs: the deep-band writer replaces these with real grammars ─────────────────────

export interface PirateIdentity {
  /** "Radio Free Shed", "The Midnight Wrong Number". */
  name: string;
  /** One-line slogan for the HUD and guide. */
  slogan: string;
  /** Where it claims to broadcast from. */
  origin: string;
  host: { name: string; bio: string };
}

/** Name and character of the generated pirate station at a frequency. Pure, deterministic. */
export function pirateIdentity(seed: number): PirateIdentity {
  return {
    name: `Pirate ${(seed % 900) + 100}`,
    slogan: 'Unlicensed. Unrepentant. Mostly in tune.',
    origin: 'Somewhere it would rather not say',
    host: { name: 'An unnamed DJ', bio: 'Broadcasting without permission from a shed, probably.' },
  };
}

/** A deadpan remark HUSH appends to a ship-log entry ("Signal smelled faintly of toast."). */
export function shipLogNote(seed: number): string {
  return ['Intercept logged.', 'Signal nominal.', 'Logged for the record.'][seed % 3]!;
}

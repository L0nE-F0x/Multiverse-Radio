// Procedural text: song titles, artist names, tickers, listener messages, reception and
// weather. Every function is pure and deterministic for a given seed (seeded PRNG, no
// Math.random), built from Tracery-style grammars in this folder.

export { loadTrackPacks, trackMeta, trackPacksReady } from './tracks';
export { tickerLines } from './ticker';
export { listenerMessage, type ListenerMessage } from './listeners';
export { receptionReport } from './reception';
export { dimensionWeather } from './weather';
export { LIMITS } from './limits';

// ── v3: the deep band ─────────────────────────────────────────────────────────────────────

/** Name, slogan, origin and host of the generated pirate station for a seed (pirates.ts). */
export { pirateIdentity, PIRATE_LIMITS, type PirateIdentity } from './pirates';
/** HUSH's deadpan remark for a ship-log entry (shiplog.ts). */
export { shipLogNote, SHIP_LOG_NOTE_MAX } from './shiplog';

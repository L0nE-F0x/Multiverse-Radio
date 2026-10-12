// Procedural text: song titles, artist names, tickers, listener messages, reception and
// weather. Every function is pure and deterministic for a given seed (seeded PRNG, no
// Math.random), built from Tracery-style grammars in this folder.

export { trackMeta } from './tracks';
export { tickerLines } from './ticker';
export { listenerMessage, type ListenerMessage } from './listeners';
export { receptionReport } from './reception';
export { dimensionWeather } from './weather';
export { LIMITS } from './limits';

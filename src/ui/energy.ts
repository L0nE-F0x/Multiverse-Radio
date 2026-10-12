// One shared reading of the live analyser for everything that wiggles to the music
// (scenes, the spectrum meter, the cabinet glow). Reads at most once per ~30 ms no
// matter how many callers ask, and returns 0 when there's no analyser yet.

import { useBroadcast } from '../broadcast/store';

let bins: Uint8Array<ArrayBuffer> | null = null;
let lastRead = -Infinity;
let level = 0;

/** Overall loudness, 0–1, lightly smoothed. */
export function energy(): number {
  const now = performance.now();
  if (now - lastRead < 30) return level;
  lastRead = now;
  const state = useBroadcast.getState();
  const analyser = state.status === 'playing' ? state.getAnalyser() : null;
  if (!analyser) {
    level *= 0.8;
    return level < 0.001 ? (level = 0) : level;
  }
  if (bins?.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  // Weight the low-mids, where beats and voices live.
  const upto = Math.max(8, Math.floor(bins.length * 0.35));
  let sum = 0;
  for (let i = 1; i < upto; i++) sum += bins[i]!;
  const value = Math.min(1, (sum / (upto - 1) / 255) * 1.6);
  level = value > level ? level + (value - level) * 0.55 : level * 0.88 + value * 0.12;
  return level;
}

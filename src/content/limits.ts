/** Maximum lengths (characters) for generated text, so the UI can lay it out safely. */
export const LIMITS = {
  title: 48,
  artist: 48,
  album: 64,
  note: 120,
  ticker: 120,
  listenerFrom: 40,
  listenerWhere: 60,
  listenerText: 160,
  reception: 90,
  weather: 110,
} as const;

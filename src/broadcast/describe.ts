// Display helpers for segments: what to call them in the UI, the tab title and the
// lock screen. Pure functions; safe to use anywhere.

import type { Segment, StationDef, VoiceCategory } from './types';

export const CATEGORY_LABELS: Record<VoiceCategory, string> = {
  id: 'Station ident',
  dj: 'On the mic',
  ad: 'A word from our sponsors',
  news: 'The news',
  weather: 'Weather and traffic',
  psa: 'Public service announcement',
  call: 'Caller on the line',
  sports: 'Sports desk',
  story: 'Storytime',
  show: 'Feature presentation',
  interrupt: 'Interference',
};

/** "Untitled Transmission #12" for tracks; the clip title or its category for voice. */
export function segmentTitle(segment: Segment): string {
  if (segment.kind === 'track') return segment.meta.title;
  return segment.clip.title ?? CATEGORY_LABELS[segment.clip.category];
}

/** The artist for tracks; the people talking (or the host) for voice. */
export function segmentArtist(segment: Segment, station: StationDef): string {
  if (segment.kind === 'track') return segment.meta.artist;
  const speakers = [...new Set(segment.clip.lines.map((l) => l.speaker).filter(Boolean))];
  if (speakers.length === 0) return station.host.name;
  if (speakers.length <= 2) return speakers.join(' & ');
  return `${speakers.slice(0, 2).join(', ')} & others`;
}

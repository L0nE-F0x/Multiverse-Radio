// Small display helpers shared across the receiver.

import type { Segment, StationDef, StationFormat, VoiceCategory } from '../broadcast/types';

export const formatFrequency = (station: Pick<StationDef, 'frequency'>): string => station.frequency.toFixed(1);

/** 74_000 → "1:14". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Spoken form for screen readers: "2 minutes 30 seconds". */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds || !minutes) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** FNV-1a, for picking deterministic-but-varied things from strings. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Tiny seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(items: readonly T[], seed: number): T => items[seed % items.length]!;

export const FORMAT_LABEL: Record<StationFormat, string> = {
  music: 'Music',
  mixed: 'Mixed',
  talk: 'Talk',
  ambient: 'Ambient',
};

/** What the VFD calls each kind of voice clip. */
export const CATEGORY_LABEL: Record<VoiceCategory, string> = {
  id: 'Station ident',
  dj: 'Host link',
  ad: 'A word from our sponsors',
  news: 'News bulletin',
  weather: 'Weather & traffic',
  psa: 'Public service announcement',
  call: 'Caller on the line',
  sports: 'Sports desk',
  story: 'Story hour',
  show: 'Feature presentation',
  interrupt: 'Interference',
};

/** Short label for the program log. */
export const CATEGORY_SHORT: Record<VoiceCategory, string> = {
  id: 'Ident',
  dj: 'Host',
  ad: 'Advert',
  news: 'News',
  weather: 'Weather',
  psa: 'PSA',
  call: 'Call-in',
  sports: 'Sports',
  story: 'Story',
  show: 'Feature',
  interrupt: 'Glitch',
};

export interface SegmentLabel {
  /** Headline: track title or clip title. */
  title: string;
  /** Artist, or who's speaking. */
  byline: string;
  /** "Track", "News", … */
  kind: string;
}

export function segmentLabel(segment: Segment, station: StationDef | undefined): SegmentLabel {
  if (segment.kind === 'track') {
    return { title: segment.meta.title, byline: segment.meta.artist, kind: 'Track' };
  }
  const { clip } = segment;
  const speakers = [...new Set(clip.lines.map((l) => l.speaker).filter(Boolean))];
  const byline = speakers.length ? listJoin(speakers.slice(0, 3)) : (station?.host.name ?? 'Unknown voice');
  return { title: clip.title ?? CATEGORY_LABEL[clip.category], byline, kind: CATEGORY_SHORT[clip.category] };
}

/** "a", "a & b", "a, b & c". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night';

export function daypart(date = new Date()): Daypart {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

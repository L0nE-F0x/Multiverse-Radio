// Small display helpers shared across the console.

import type { Segment, StationDef, StationFormat, VoiceCategory } from '../broadcast/types';

/** 93.05 → "93.05". Always two decimals: the dial fine-tunes in 0.05 MHz steps. */
export const formatMhz = (mhz: number): string => (Math.round(mhz * 100) / 100).toFixed(2);

/** 93.05 → "093.05": fixed width for tables. */
export const formatMhzPadded = (mhz: number): string => formatMhz(mhz).padStart(6, '0');

/** 74_000 → "1:14". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

const two = (n: number) => String(n).padStart(2, '0');

/** Local wall-clock time, "03:14:07" (or "03:14"). */
export function formatClock(ms: number, seconds = true): string {
  const d = new Date(ms);
  return seconds ? `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}` : `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The Nightjar's heading, "034.7°" (wrapped to [0, 360), one decimal, zero-padded). */
export function formatHeading(degrees: number): string {
  const tenths = Math.round((Number.isFinite(degrees) ? degrees : 0) * 10);
  const wrapped = ((tenths % 3600) + 3600) % 3600;
  return `${(wrapped / 10).toFixed(1).padStart(5, '0')}°`;
}

/** Elapsed time, "00:42" or "1:03:09". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** FNV-1a, for picking deterministic-but-varied things from strings. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const FORMAT_LABEL: Record<StationFormat, string> = {
  music: 'Music',
  mixed: 'Mixed',
  talk: 'Talk',
  ambient: 'Ambient',
};

/** What the console calls each kind of voice clip. */
export const CATEGORY_LABEL: Record<VoiceCategory, string> = {
  id: 'Station ident',
  dj: 'Host link',
  ad: 'Advertisement',
  news: 'News bulletin',
  weather: 'Weather & traffic',
  psa: 'Public notice',
  call: 'Caller on the line',
  sports: 'Sports desk',
  story: 'Narration',
  show: 'Feature',
  interrupt: 'Interference',
  ship: 'Ship computer',
  event: 'Multiverse event',
};

/** Short category codes for the log. */
export const CATEGORY_CODE: Record<VoiceCategory, string> = {
  id: 'IDENT',
  dj: 'LINK',
  ad: 'ADVERT',
  news: 'NEWS',
  weather: 'WX',
  psa: 'NOTICE',
  call: 'CALL',
  sports: 'SPORT',
  story: 'STORY',
  show: 'FEATURE',
  interrupt: 'INTRF',
  ship: 'HUSH',
  event: 'EVENT',
};

export interface SegmentLabel {
  /** Headline: track title or clip title. */
  title: string;
  /** Artist, or who's speaking. */
  byline: string;
  /** "TRACK", "NEWS", … */
  code: string;
}

export function segmentLabel(segment: Segment, station: Pick<StationDef, 'host'> | undefined): SegmentLabel {
  if (segment.kind === 'track') return { title: segment.meta.title, byline: segment.meta.artist, code: 'TRACK' };
  const { clip } = segment;
  return {
    title: clip.title ?? CATEGORY_LABEL[clip.category],
    byline: speakersOf(segment) || (station?.host.name ?? 'Unidentified voice'),
    code: CATEGORY_CODE[clip.category] ?? 'VOICE',
  };
}

/** "a", "a & b", "a, b & c" of the people speaking in a clip. */
export function speakersOf(segment: Segment): string {
  if (segment.kind !== 'voice') return '';
  return listJoin([...new Set(segment.clip.lines.map((l) => l.speaker).filter(Boolean))].slice(0, 3));
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

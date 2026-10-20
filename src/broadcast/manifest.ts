// Voice manifests: validation, URL resolution and building a station's clip pool.

import {
  EVENT_IDS,
  VOICE_CATEGORIES,
  type CaptionLine,
  type Daypart,
  type ShowDef,
  type ShowIndex,
  type VoiceClip,
  type VoiceManifest,
} from './types';
import { registerSerialClips } from './scheduler';

const DAYPARTS: readonly Daypart[] = ['morning', 'day', 'evening', 'night'];

/**
 * Resolves a root-relative content URL against Vite's base path, so manifests keep
 * working when the site is deployed under a sub-path. Absolute URLs pass through.
 */
export function resolveAsset(url: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/${url.replace(/^\//, '')}`;
}

export function manifestUrl(name: string): string {
  return resolveAsset(`/voice/${name}.json`);
}

/**
 * Validates untrusted manifest JSON. Bad clips are dropped (with a warning) rather than
 * failing the whole manifest; returns null if the data isn't a manifest at all.
 */
export function parseManifest(data: unknown, expectedStation?: string): VoiceManifest | null {
  if (!isRecord(data) || !Array.isArray(data.clips)) return null;
  const station = typeof data.station === 'string' ? data.station : (expectedStation ?? '');
  const seen = new Set<string>();
  const clips: VoiceClip[] = [];
  data.clips.forEach((raw, index) => {
    const clip = parseClip(raw);
    if (!clip) {
      console.warn(`[voice/${station}.json] Skipping clips[${index}]: missing id, category, url or duration.`);
      return;
    }
    if (seen.has(clip.id)) return;
    seen.add(clip.id);
    clips.push(clip);
  });
  if (station && !station.startsWith('_')) {
    registerSerialClips(station, clips);
  }
  return { version: 1, station, clips };
}

function parseClip(raw: unknown): VoiceClip | null {
  if (!isRecord(raw)) return null;
  const { id, category, url } = raw;
  const durationMs = Number(raw.durationMs);
  if (typeof id !== 'string' || !id || typeof url !== 'string' || !url) return null;
  if (!(VOICE_CATEGORIES as readonly string[]).includes(category as string)) return null;
  if (!Number.isFinite(durationMs) || durationMs < 500) return null;
  const lines: CaptionLine[] = Array.isArray(raw.lines)
    ? raw.lines.flatMap((line): CaptionLine[] =>
        isRecord(line) && typeof line.text === 'string'
          ? [
              {
                speaker: typeof line.speaker === 'string' ? line.speaker : '',
                text: line.text,
                startMs: Math.max(0, Number(line.startMs) || 0),
              },
            ]
          : [],
      )
    : [];
  lines.sort((a, b) => a.startMs - b.startMs);
  const clip: VoiceClip = {
    id,
    category: category as VoiceClip['category'],
    url,
    durationMs: Math.round(durationMs),
    overMusic: typeof raw.overMusic === 'boolean' ? raw.overMusic : category === 'id' || category === 'dj' || category === 'interrupt',
    lines,
  };
  if (typeof raw.title === 'string' && raw.title) clip.title = raw.title;
  if (DAYPARTS.includes(raw.daypart as Daypart)) clip.daypart = raw.daypart as Daypart;
  if (Array.isArray(raw.stations)) clip.stations = raw.stations.filter((s): s is string => typeof s === 'string');
  // v3: modular parts, shows, serials, holidays, HUSH levels and events.
  if (PARTS.includes(raw.part as Part)) clip.part = raw.part as Part;
  if (isId(raw.kit)) clip.kit = raw.kit;
  if (isId(raw.show)) clip.show = raw.show;
  if (isRecord(raw.serial) && isId(raw.serial.id) && Number.isInteger(Number(raw.serial.episode))) {
    clip.serial = { id: raw.serial.id, episode: Number(raw.serial.episode) };
  }
  if (Array.isArray(raw.dates)) {
    const dates = raw.dates.filter((d): d is string => typeof d === 'string' && /^\d\d-\d\d$/.test(d));
    if (dates.length) clip.dates = dates;
  }
  if (raw.level !== undefined && Number.isFinite(Number(raw.level))) clip.level = Math.min(3, Math.max(0, Math.round(Number(raw.level))));
  if ((EVENT_IDS as readonly string[]).includes(raw.event as string)) clip.event = raw.event as string;
  // v4: arcs and weekdays.
  if (isRecord(raw.arc) && isId(raw.arc.id) && Number.isInteger(Number(raw.arc.step)) && Number(raw.arc.step) >= 1) {
    clip.arc = { id: raw.arc.id, step: Number(raw.arc.step) };
  }
  const days = parseDays(raw.days);
  if (days) clip.days = days;
  const shifts = parseShifts(raw.shifts);
  if (shifts) clip.shifts = shifts;
  if (typeof raw.trigger === 'string' && SHIP_TRIGGERS.has(raw.trigger)) {
    clip.trigger = raw.trigger as VoiceClip['trigger'];
  }
  const swapWith = raw.swapWith ?? raw.swap_with;
  if (typeof swapWith === 'string' && swapWith) clip.swapWith = swapWith;
  return clip;
}

/** Local weekdays 0–6 (0 = Sunday), deduplicated and sorted; undefined if none are valid. */
function parseDays(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const days = [...new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return days.length ? days : undefined;
}

const SHIP_TRIGGERS = new Set<string>([
  'on_skip_streak',
  'scanning_static',
  'on_pirate',
  'after_event',
  'near_secret',
  'on_station',
]);

/** Inclusive `[minShift, maxShift]` range (`0 <= min <= max`, integers); undefined if invalid. */
function parseShifts(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const min = Number(raw[0]);
  const max = Number(raw[1]);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) return undefined;
  return [min, max];
}

type Part = NonNullable<VoiceClip['part']>;
const PARTS: readonly Part[] = ['open', 'body', 'close'];
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Validates `/voice/_shows.json`. Bad shows are dropped; returns null if it isn't an index. */
export function parseShowIndex(data: unknown): ShowIndex | null {
  if (!isRecord(data) || !isRecord(data.shows)) return null;
  const shows: Record<string, ShowDef[]> = {};
  for (const [stationId, list] of Object.entries(data.shows)) {
    if (!Array.isArray(list)) continue;
    const valid = list.flatMap((raw): ShowDef[] => {
      if (!isRecord(raw) || !isId(raw.id) || typeof raw.name !== 'string') return [];
      const start = Number(raw.start);
      const end = Number(raw.end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24 || start === end) {
        return [];
      }
      const show: ShowDef = { id: raw.id, name: raw.name, blurb: typeof raw.blurb === 'string' ? raw.blurb : '', start, end };
      if (typeof raw.host === 'string' && raw.host) show.host = raw.host;
      const days = parseDays(raw.days);
      if (days) show.days = days;
      return [show];
    });
    if (valid.length) shows[stationId] = valid;
  }
  return { version: 1, shows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Voice manifests: validation, URL resolution and building a station's clip pool.

import { VOICE_CATEGORIES, type CaptionLine, type Daypart, type VoiceClip, type VoiceManifest } from './types';

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
  return clip;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

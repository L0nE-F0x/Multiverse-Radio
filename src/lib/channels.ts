export interface Episode {
  id: string;
  title: string;
  /** One line. */
  description: string;
  /** Path to the audio file, usually `/audio/<channel>/<file>.mp3`. */
  audioUrl: string;
  durationSeconds: number;
  /** ISO date. */
  publishedAt: string;
  /** Loop the file forever instead of advancing (used by the Static channel). */
  loop?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  tagline: string;
  /** Accent color hex. Tints the glow while the channel is selected. */
  color: string;
  episodes: Episode[];
}

export class ChannelDataError extends Error {
  override name = 'ChannelDataError';
}

const FALLBACK_COLORS = ['#ff6b35', '#ffaa44', '#4ecdc4', '#ff8fb1', '#9aa8ff', '#ffd23f'];
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Resolves a content URL against Vite's base path, so root-relative paths in
 * episodes.json keep working when the site is deployed under a sub-path.
 */
export function resolveAsset(url: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${url.replace(/^\//, '')}`;
}

export async function loadChannels(signal?: AbortSignal): Promise<Channel[]> {
  let response: Response;
  try {
    response = await fetch(resolveAsset('/episodes.json'), { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChannelDataError('The receiver could not reach episodes.json. Check your connection and try again.');
  }
  if (!response.ok) {
    throw new ChannelDataError(`episodes.json answered with HTTP ${response.status}.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ChannelDataError('episodes.json is not valid JSON.');
  }
  return parseChannels(data);
}

/** Validates raw JSON. Bad entries are skipped with a console warning; only fatal problems throw. */
export function parseChannels(data: unknown): Channel[] {
  if (!isRecord(data) || !Array.isArray(data.channels)) {
    throw new ChannelDataError('episodes.json must contain a top-level "channels" array.');
  }

  const seen = new Set<string>();
  const channels: Channel[] = [];

  data.channels.forEach((raw, index) => {
    const where = `channels[${index}]`;
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) {
      console.warn(`[episodes.json] Skipping ${where}: "id" and "name" are required.`);
      return;
    }
    if (seen.has(raw.id)) {
      console.warn(`[episodes.json] Skipping ${where}: duplicate channel id "${raw.id}".`);
      return;
    }
    seen.add(raw.id);

    const color = typeof raw.color === 'string' && HEX_COLOR.test(raw.color) ? raw.color : undefined;
    if (raw.color !== undefined && !color) {
      console.warn(`[episodes.json] ${where}: "${String(raw.color)}" is not a hex color, using a default.`);
    }

    const episodes = Array.isArray(raw.episodes) ? raw.episodes : [];
    channels.push({
      id: raw.id,
      name: raw.name,
      tagline: typeof raw.tagline === 'string' ? raw.tagline : '',
      color: color ?? FALLBACK_COLORS[channels.length % FALLBACK_COLORS.length]!,
      episodes: episodes.flatMap((ep, i) => parseEpisode(ep, `${where}.episodes[${i}]`)),
    });
  });

  if (channels.length === 0) {
    throw new ChannelDataError('episodes.json does not define any valid channels.');
  }
  return channels;
}

function parseEpisode(raw: unknown, where: string): Episode[] {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.title) || !isNonEmptyString(raw.audioUrl)) {
    console.warn(`[episodes.json] Skipping ${where}: "id", "title" and "audioUrl" are required.`);
    return [];
  }
  const duration = Number(raw.durationSeconds);
  return [
    {
      id: raw.id,
      title: raw.title,
      description: typeof raw.description === 'string' ? raw.description : '',
      audioUrl: raw.audioUrl,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
      publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : '',
      loop: raw.loop === true,
    },
  ];
}

/** A fake-but-stable dial frequency for display, e.g. "88.1". */
export function channelFrequency(index: number): string {
  return (88.1 + index * 4.4).toFixed(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

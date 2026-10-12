// Checks the rendered voice library in public/voice against the VoiceManifest contract:
// shape, unique ids, URLs that point at files that exist, and no orphaned MP3s.
// Passes trivially until the library has been rendered. Point VOICE_DIR at another
// render (e.g. one made with `--out`) to check that instead.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VOICE_CATEGORIES } from '../../src/broadcast/types';
import { STATIONS } from '../../src/stations/roster';

const VOICE = process.env.VOICE_DIR ?? fileURLToPath(new URL('../../public/voice/', import.meta.url));
const SHARED = '_shared';
const STATION_IDS = new Set(STATIONS.map((s) => s.id));
const DAYPARTS = ['morning', 'day', 'evening', 'night'];
const CLIP_KEYS = new Set(['id', 'category', 'url', 'durationMs', 'title', 'overMusic', 'daypart', 'stations', 'lines']);
const LINE_KEYS = new Set(['speaker', 'text', 'startMs']);

const manifestFiles = existsSync(VOICE) ? readdirSync(VOICE).filter((f) => f.endsWith('.json')).sort() : [];

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Every way `data` breaks the VoiceManifest contract, as readable messages. */
function shapeProblems(data: unknown, station: string): string[] {
  const problems: string[] = [];
  if (!isObject(data)) return ['manifest is not a JSON object'];
  if (data.version !== 1) problems.push(`version must be 1, got ${JSON.stringify(data.version)}`);
  if (data.station !== station) problems.push(`station must be "${station}" (the file name), got ${JSON.stringify(data.station)}`);
  if (station !== SHARED && !STATION_IDS.has(station)) problems.push(`"${station}" is not a station in the roster`);
  const extra = Object.keys(data).filter((k) => !['version', 'station', 'clips'].includes(k));
  if (extra.length) problems.push(`unexpected top-level keys: ${extra.join(', ')}`);
  if (!Array.isArray(data.clips)) return [...problems, 'clips must be an array'];

  data.clips.forEach((clip: unknown, i: number) => {
    const where = `clips[${i}]${isObject(clip) && typeof clip.id === 'string' ? ` (${clip.id})` : ''}`;
    if (!isObject(clip)) {
      problems.push(`${where} is not an object`);
      return;
    }
    for (const key of Object.keys(clip)) if (!CLIP_KEYS.has(key)) problems.push(`${where}: unexpected key "${key}"`);
    if (typeof clip.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clip.id)) problems.push(`${where}: bad id`);
    if (!(VOICE_CATEGORIES as readonly unknown[]).includes(clip.category)) problems.push(`${where}: bad category ${JSON.stringify(clip.category)}`);
    if (clip.url !== `/voice/${station}/${String(clip.id)}.mp3`) problems.push(`${where}: url should be /voice/${station}/${String(clip.id)}.mp3`);
    if (!isCount(clip.durationMs) || clip.durationMs === 0) problems.push(`${where}: durationMs must be a positive integer`);
    if (clip.title !== undefined && (typeof clip.title !== 'string' || !clip.title.trim())) problems.push(`${where}: title must be a non-empty string`);
    if (typeof clip.overMusic !== 'boolean') problems.push(`${where}: overMusic must be a boolean`);
    if (clip.daypart !== undefined && !DAYPARTS.includes(clip.daypart as string)) problems.push(`${where}: bad daypart`);
    if (clip.stations !== undefined) {
      if (station !== SHARED) problems.push(`${where}: stations is only allowed in ${SHARED}.json`);
      if (!Array.isArray(clip.stations) || clip.stations.length === 0) problems.push(`${where}: stations must be a non-empty array`);
      else for (const s of clip.stations) if (!STATION_IDS.has(s as string)) problems.push(`${where}: unknown station ${JSON.stringify(s)}`);
    }
    if (!Array.isArray(clip.lines)) {
      problems.push(`${where}: lines must be an array`);
      return;
    }
    let previous = 0;
    clip.lines.forEach((line: unknown, j: number) => {
      const at = `${where}.lines[${j}]`;
      if (!isObject(line)) {
        problems.push(`${at} is not an object`);
        return;
      }
      for (const key of Object.keys(line)) if (!LINE_KEYS.has(key)) problems.push(`${at}: unexpected key "${key}"`);
      if (typeof line.speaker !== 'string') problems.push(`${at}: speaker must be a string`);
      if (typeof line.text !== 'string' || !line.text.trim()) problems.push(`${at}: text must be a non-empty string`);
      if (!isCount(line.startMs)) problems.push(`${at}: startMs must be a non-negative integer`);
      else {
        if (isCount(clip.durationMs) && line.startMs > clip.durationMs) problems.push(`${at}: startMs is past the end of the clip`);
        if (line.startMs < previous) problems.push(`${at}: startMs goes backwards`);
        previous = line.startMs;
      }
    });
  });
  return problems;
}

describe('voice manifests (public/voice)', () => {
  it('are either absent or readable', () => {
    for (const file of manifestFiles) expect(() => JSON.parse(readFileSync(join(VOICE, file), 'utf8'))).not.toThrow();
  });

  for (const file of manifestFiles) {
    const station = file.replace(/\.json$/, '');
    const data: unknown = JSON.parse(readFileSync(join(VOICE, file), 'utf8'));
    const clips = isObject(data) && Array.isArray(data.clips) ? (data.clips as Json[]) : [];

    describe(file, () => {
      it('matches the VoiceManifest shape', () => {
        const problems = shapeProblems(data, station);
        expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
      });

      it('has unique clip ids', () => {
        const ids = clips.map((c) => c.id);
        expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
      });

      it('references MP3s that exist', () => {
        const missing = clips
          .map((c) => String(c.url))
          .filter((url) => {
            const path = join(VOICE, url.replace(/^\/voice\//, ''));
            return !existsSync(path) || statSync(path).size === 0;
          });
        expect(missing).toEqual([]);
      });

      it('has no orphaned MP3s', () => {
        const folder = join(VOICE, station);
        const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.mp3')) : [];
        const referenced = new Set(clips.map((c) => `${String(c.id)}.mp3`));
        expect(files.filter((f) => !referenced.has(f))).toEqual([]);
      });
    });
  }
});

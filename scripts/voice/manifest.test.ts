// Checks the rendered voice library in public/voice against the contracts in
// src/broadcast/types.ts: every VoiceManifest (stations and the pools _shared, _ship, _pirate,
// _oddities, _events) and the ShowIndex in _shows.json. Shape, unique ids, URLs that point at
// files that exist, no orphaned MP3s, the v3 fields (parts, shows, serials, dates, levels,
// events), the v4 fields (arc, days, convergence reactions, tomorrow kits) and the VoiceIndex in
// _index.json. Passes trivially until the library has been rendered. Point VOICE_DIR at another
// render (e.g. one made with `--out`) to check that instead.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVENT_IDS, VOICE_CATEGORIES } from '../../src/broadcast/types';
import { STATIONS } from '../../src/stations/roster';

const VOICE = process.env.VOICE_DIR ?? fileURLToPath(new URL('../../public/voice/', import.meta.url));
const SHOWS_FILE = '_shows.json';
const INDEX_FILE = '_index.json';
const POOLS = ['_shared', '_ship', '_pirate', '_oddities', '_events'];
/** Pools whose clips may be restricted to some stations with `stations`. */
const STATION_FILTER_POOLS = ['_shared', '_ship', '_events'];
const STATION_IDS = new Set(STATIONS.map((s) => s.id));
const DAYPARTS = ['morning', 'day', 'evening', 'night'];
const PARTS = ['open', 'body', 'close'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLIP_KEYS = new Set([
  'id',
  'category',
  'url',
  'durationMs',
  'title',
  'overMusic',
  'daypart',
  'stations',
  'part',
  'kit',
  'show',
  'serial',
  'dates',
  'level',
  'event',
  'arc',
  'days',
  'lines',
  'shifts',
  'trigger',
  'swap_with',
]);
const SHIP_TRIGGERS = ['on_skip_streak', 'scanning_static', 'on_pirate', 'after_event', 'near_secret', 'on_station'];
const SHIFT_MAX = 999;
const LINE_KEYS = new Set(['speaker', 'text', 'startMs']);
const SHOW_KEYS = new Set(['id', 'name', 'blurb', 'start', 'end', 'host', 'days']);
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** v4: The Convergence's weekly topics (content/voice/SCHEMA.md); station files hold one reaction per kit. */
const CONVERGENCE_KITS = ['missing-moon', 'the-smell', 'the-song', 'the-knock', 'wrong-colour', 'the-pigeon'];
/** v4: a drifting station's "tomorrow" announcement, e.g. tomorrow-110.65. */
const TOMORROW_KIT = /^tomorrow-(\d{2,3}(?:\.\d{1,2})?)$/;

const allJson = existsSync(VOICE) ? readdirSync(VOICE).filter((f) => f.endsWith('.json')).sort() : [];
const manifestFiles = allJson.filter((f) => f !== SHOWS_FILE && f !== INDEX_FILE);

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function validDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = /^(\d\d)-(\d\d)$/.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

/** v4 `days`: distinct local weekdays 0-6, sorted, at least one. */
function validDays(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((d, i) => Number.isInteger(d) && d >= 0 && d <= 6 && (i === 0 || d > value[i - 1]))
  );
}

function showHours(start: number, end: number): number[] {
  const hours: number[] = [];
  for (let h = start; h !== end % 24 || hours.length === 0; h = (h + 1) % 24) {
    hours.push(h);
    if (hours.length > 24) break;
  }
  return hours;
}

const showsData: unknown = allJson.includes(SHOWS_FILE) ? JSON.parse(readFileSync(join(VOICE, SHOWS_FILE), 'utf8')) : null;
const showIds = new Map<string, Set<string>>();
if (isObject(showsData) && isObject(showsData.shows)) {
  for (const [station, list] of Object.entries(showsData.shows)) {
    if (Array.isArray(list)) showIds.set(station, new Set(list.filter(isObject).map((s) => String(s.id))));
  }
}

/** Every way `data` breaks the ShowIndex contract. */
function showProblems(data: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(data)) return ['_shows.json is not a JSON object'];
  if (data.version !== 1) problems.push(`version must be 1, got ${JSON.stringify(data.version)}`);
  const extra = Object.keys(data).filter((k) => !['version', 'shows'].includes(k));
  if (extra.length) problems.push(`unexpected top-level keys: ${extra.join(', ')}`);
  if (!isObject(data.shows)) return [...problems, 'shows must be an object keyed by station id'];
  for (const [station, list] of Object.entries(data.shows)) {
    if (!STATION_IDS.has(station)) problems.push(`"${station}" is not a station in the roster`);
    if (!Array.isArray(list) || list.length === 0) {
      problems.push(`${station}: must be a non-empty array (stations without shows are absent)`);
      continue;
    }
    const seen = new Set<string>();
    const taken = new Map<number, string>();
    list.forEach((show: unknown, i: number) => {
      const where = `${station}[${i}]`;
      if (!isObject(show)) {
        problems.push(`${where} is not an object`);
        return;
      }
      for (const key of Object.keys(show)) if (!SHOW_KEYS.has(key)) problems.push(`${where}: unexpected key "${key}"`);
      if (typeof show.id !== 'string' || !KEBAB.test(show.id)) problems.push(`${where}: bad id`);
      else if (seen.has(show.id)) problems.push(`${where}: duplicate id ${show.id}`);
      else seen.add(show.id);
      if (!isText(show.name)) problems.push(`${where}: name must be a non-empty string`);
      if (!isText(show.blurb)) problems.push(`${where}: blurb must be a non-empty string`);
      if (show.host !== undefined && !isText(show.host)) problems.push(`${where}: host must be a non-empty string`);
      const { start, end } = show;
      if (!isCount(start) || start > 23) problems.push(`${where}: start must be an hour 0-23`);
      if (!isCount(end) || end < 1 || end > 24) problems.push(`${where}: end must be an hour 1-24`);
      if (show.days !== undefined && !validDays(show.days)) problems.push(`${where}: days must be a sorted, non-empty array of weekdays 0-6`);
      if (isCount(start) && isCount(end) && start <= 23 && end >= 1 && end <= 24) {
        if (start === end % 24 && start === end) problems.push(`${where}: start equals end`);
        else {
          // v4: `days` are the start hour's weekday; hours past midnight fall on the next day.
          const days = validDays(show.days) ? show.days : [0, 1, 2, 3, 4, 5, 6];
          for (const day of days)
            for (const [k, h] of showHours(start, end).entries()) {
              const slot = ((day + Math.floor((start + k) / 24)) % 7) * 24 + h;
              const other = taken.get(slot);
              if (other) problems.push(`${where}: overlaps ${other} on weekday ${Math.floor(slot / 24)} at ${h}:00`);
              taken.set(slot, String(show.id));
            }
        }
      }
    });
  }
  return problems;
}

/** Every way `data` breaks the VoiceManifest contract, as readable messages. */
function shapeProblems(data: unknown, station: string): string[] {
  const problems: string[] = [];
  if (!isObject(data)) return ['manifest is not a JSON object'];
  const pool = POOLS.includes(station);
  if (data.version !== 1) problems.push(`version must be 1, got ${JSON.stringify(data.version)}`);
  if (data.station !== station) problems.push(`station must be "${station}" (the file name), got ${JSON.stringify(data.station)}`);
  if (!pool && !STATION_IDS.has(station)) problems.push(`"${station}" is neither a station in the roster nor a pool`);
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
    if (typeof clip.id !== 'string' || !KEBAB.test(clip.id)) problems.push(`${where}: bad id`);
    if (!(VOICE_CATEGORIES as readonly unknown[]).includes(clip.category)) problems.push(`${where}: bad category ${JSON.stringify(clip.category)}`);
    if (clip.url !== `/voice/${station}/${String(clip.id)}.mp3`) problems.push(`${where}: url should be /voice/${station}/${String(clip.id)}.mp3`);
    if (!isCount(clip.durationMs) || clip.durationMs < 500) problems.push(`${where}: durationMs must be an integer of at least 500`);
    if (clip.title !== undefined && !isText(clip.title)) problems.push(`${where}: title must be a non-empty string`);
    if (typeof clip.overMusic !== 'boolean') problems.push(`${where}: overMusic must be a boolean`);
    if (clip.daypart !== undefined && !DAYPARTS.includes(clip.daypart as string)) problems.push(`${where}: bad daypart`);
    if (clip.stations !== undefined) {
      if (!STATION_FILTER_POOLS.includes(station)) problems.push(`${where}: stations is only allowed in ${STATION_FILTER_POOLS.join(', ')}`);
      if (!Array.isArray(clip.stations) || clip.stations.length === 0) problems.push(`${where}: stations must be a non-empty array`);
      else for (const s of clip.stations) if (!STATION_IDS.has(s as string)) problems.push(`${where}: unknown station ${JSON.stringify(s)}`);
    }
    // v3 fields
    if (clip.part !== undefined && !PARTS.includes(clip.part as string)) problems.push(`${where}: part must be open, body or close`);
    if (clip.kit !== undefined) {
      const tomorrow = typeof clip.kit === 'string' ? TOMORROW_KIT.exec(clip.kit) : null;
      const drift = STATIONS.find((s) => s.id === station)?.drift ?? [];
      if (tomorrow) {
        if (!drift.some((mhz) => `tomorrow-${mhz}` === clip.kit)) problems.push(`${where}: ${String(clip.kit)} is not one of ${station}'s drift frequencies`);
      } else if (typeof clip.kit !== 'string' || !KEBAB.test(clip.kit)) problems.push(`${where}: bad kit`);
    }
    if (clip.show !== undefined) {
      if (typeof clip.show !== 'string' || !KEBAB.test(clip.show)) problems.push(`${where}: bad show id`);
      else if (!showIds.get(station)?.has(clip.show)) problems.push(`${where}: show "${clip.show}" is not in ${SHOWS_FILE} for ${station}`);
    }
    if (clip.serial !== undefined) {
      const s = clip.serial;
      if (!isObject(s) || Object.keys(s).sort().join() !== 'episode,id' || typeof s.id !== 'string' || !KEBAB.test(s.id) || !isCount(s.episode) || s.episode < 1)
        problems.push(`${where}: serial must be { id: kebab-case, episode: integer >= 1 }`);
    }
    if (clip.dates !== undefined) {
      if (!Array.isArray(clip.dates) || clip.dates.length === 0 || !clip.dates.every(validDate)) problems.push(`${where}: dates must be a non-empty array of "MM-DD"`);
      else if (new Set(clip.dates).size !== clip.dates.length) problems.push(`${where}: duplicate dates`);
    }
    if (clip.level !== undefined) {
      if (station !== '_ship') problems.push(`${where}: level is only for _ship`);
      if (!isCount(clip.level) || clip.level > 3) problems.push(`${where}: level must be an integer 0-3`);
    }
    if (clip.event !== undefined) {
      if (!(EVENT_IDS as readonly unknown[]).includes(clip.event)) problems.push(`${where}: unknown event ${JSON.stringify(clip.event)}`);
      if (station === '_events') {
        if (clip.event === 'convergence' && (!CONVERGENCE_KITS.includes(clip.kit as string) || !['open', 'close'].includes(clip.part as string)))
          problems.push(`${where}: a convergence clip in _events needs a topic kit and part open or close`);
      } else if (pool) problems.push(`${where}: event is only for _events (and convergence reactions in station manifests)`);
      else if (clip.event !== 'convergence' || clip.category !== 'event' || !CONVERGENCE_KITS.includes(clip.kit as string) || clip.part !== undefined)
        problems.push(`${where}: station manifests only hold convergence reactions (category event, a topic kit, no part)`);
    }
    // v4 fields
    if (clip.arc !== undefined) {
      const a = clip.arc;
      if (station !== '_ship') problems.push(`${where}: arc is only for _ship`);
      if (!isObject(a) || Object.keys(a).sort().join() !== 'id,step' || typeof a.id !== 'string' || !KEBAB.test(a.id) || !isCount(a.step) || a.step < 1)
        problems.push(`${where}: arc must be { id: kebab-case, step: integer >= 1 }`);
    }
    if (clip.days !== undefined && !validDays(clip.days)) problems.push(`${where}: days must be a sorted, non-empty array of weekdays 0-6`);
    if (clip.shifts !== undefined) {
      const shifts = clip.shifts;
      const pair = Array.isArray(shifts) && shifts.length === 2 && shifts.every(isCount);
      if (!pair || shifts[0]! > shifts[1]! || shifts[1]! > SHIFT_MAX) {
        problems.push(`${where}: shifts must be [min, max] with integers 0 <= min <= max <= ${SHIFT_MAX}`);
      }
      if (station !== '_ship' && station !== '_shared' && pool) problems.push(`${where}: shifts is only for _ship, _shared, and station manifests`);
    }
    if (clip.trigger !== undefined) {
      if (station !== '_ship') problems.push(`${where}: trigger is only for _ship`);
      if (!SHIP_TRIGGERS.includes(clip.trigger as string)) problems.push(`${where}: unknown trigger ${JSON.stringify(clip.trigger)}`);
    }
    if (clip.swap_with !== undefined) {
      if (station !== '_events') problems.push(`${where}: swap_with is only for _events`);
      if (typeof clip.swap_with !== 'string' || !STATION_IDS.has(clip.swap_with)) problems.push(`${where}: swap_with must be a roster station id`);
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
      if (!isText(line.text)) problems.push(`${at}: text must be a non-empty string`);
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

/** Serials run 1, 2, 3, ... per serial id across the library (a storyline may hop stations). */
/** An episode may span several clips on one station (aired whole, in id order), never two stations. */
function serialProblems(clips: { station: string; clip: Json }[]): string[] {
  const episodes = new Map<string, Map<number, string>>();
  const problems: string[] = [];
  for (const { station, clip } of clips) {
    const s = clip.serial;
    if (!isObject(s) || typeof s.id !== 'string' || !isCount(s.episode)) continue;
    const seen = episodes.get(s.id) ?? new Map<number, string>();
    episodes.set(s.id, seen);
    const owner = seen.get(s.episode);
    if (owner === undefined) seen.set(s.episode, station);
    else if (owner !== station) problems.push(`serial ${s.id}: episode ${s.episode} is on both ${owner} and ${station}`);
  }
  for (const [id, seen] of episodes) {
    const sorted = [...seen.keys()].sort((a, b) => a - b);
    const expected = sorted.map((_, i) => i + 1);
    if (sorted.join() !== expected.join()) problems.push(`serial ${id}: episodes ${sorted.join(', ')} should be ${expected.join(', ')}`);
  }
  return problems;
}

describe('voice library (public/voice)', () => {
  it('has readable JSON files', () => {
    for (const file of allJson) expect(() => JSON.parse(readFileSync(join(VOICE, file), 'utf8'))).not.toThrow();
  });

  it('has continuous serials across all manifests', () => {
    const clips = manifestFiles.flatMap((file) => {
      const data: unknown = JSON.parse(readFileSync(join(VOICE, file), 'utf8'));
      const station = file.replace(/\.json$/, '');
      return isObject(data) && Array.isArray(data.clips) ? (data.clips as Json[]).map((clip) => ({ station, clip })) : [];
    });
    expect(serialProblems(clips)).toEqual([]);
  });

  it('has arc steps that run 1, 2, 3 per arc, once each', () => {
    const steps = new Map<string, number[]>();
    for (const file of manifestFiles) {
      const data: unknown = JSON.parse(readFileSync(join(VOICE, file), 'utf8'));
      for (const clip of isObject(data) && Array.isArray(data.clips) ? (data.clips as Json[]) : []) {
        const a = clip.arc;
        if (isObject(a) && typeof a.id === 'string' && isCount(a.step)) steps.set(a.id, [...(steps.get(a.id) ?? []), a.step]);
      }
    }
    for (const [id, list] of steps) expect([...list].sort((a, b) => a - b), id).toEqual(list.map((_, i) => i + 1));
  });

  it(`${INDEX_FILE} has a current entry for every manifest (VoiceIndex)`, () => {
    if (!allJson.includes(INDEX_FILE)) {
      expect(manifestFiles, `${INDEX_FILE} is missing: run npm run voice:render -- --index`).toEqual([]);
      return;
    }
    const index: unknown = JSON.parse(readFileSync(join(VOICE, INDEX_FILE), 'utf8'));
    expect(isObject(index) && index.version).toBe(1);
    const entries = isObject(index) && isObject(index.entries) ? index.entries : {};
    expect(Object.keys(entries).sort()).toEqual(manifestFiles.map((f) => f.replace(/\.json$/, '')).sort());
    const stale: string[] = [];
    for (const file of manifestFiles) {
      const station = file.replace(/\.json$/, '');
      const raw = readFileSync(join(VOICE, file));
      const clips = (JSON.parse(raw.toString('utf8')) as { clips: Json[] }).clips;
      // version = sha256(manifest file, then each clip's MP3 in manifest order), 12 hex digits.
      const hash = createHash('sha256').update(raw);
      let bytes = 0;
      for (const clip of clips) {
        const mp3 = readFileSync(join(VOICE, String(clip.url).replace(/^\/voice\//, '')));
        bytes += mp3.length;
        hash.update(mp3);
      }
      const expected = { clips: clips.length, bytes, version: hash.digest('hex').slice(0, 12) };
      if (JSON.stringify(entries[station]) !== JSON.stringify(expected)) stale.push(station);
    }
    expect(stale, `stale ${INDEX_FILE} entries; run npm run voice:render -- --index`).toEqual([]);
  });

  it(`${SHOWS_FILE} matches the ShowIndex shape (when present)`, () => {
    if (showsData === null) return;
    const problems = showProblems(showsData);
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
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

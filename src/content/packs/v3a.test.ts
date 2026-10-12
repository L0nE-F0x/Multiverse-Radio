// Checks for writers-new-a: the ten v3 station scripts (sayable, unique ids, complete kits,
// shows with an opening ident, Halloween clips) and their track packs (resident artists).

import { describe, expect, it } from 'vitest';
import { RECIPE_PACKS, STATION_PACKS } from '.';
import { STATIONS } from '../../stations/roster';
import { findBanned } from '../banned';
import { trackMeta } from '../tracks';
import { V3A_RECIPE_PACKS, V3A_STATION_PACKS } from './v3a';

const SCRIPTS = import.meta.glob<string>('/content/voice/*.toml', { query: '?raw', import: 'default', eager: true });

const MINE = [
  'smoke-ring-trio',
  'lower-hollow',
  'bubble-economy',
  'breakbeat-observatory',
  'piano-empty-rooms',
  'wall-of-fog',
  'drowned-shanty-hour',
  'event-horizon-surf',
  'gristwick-parish',
  'waystation-9',
];

/** The [[clip]] / [[show]] blocks of a script, as raw text. */
function blocks(toml: string, kind: 'clip' | 'show'): string[] {
  return toml.split(/^\[\[/m).filter((b) => b.startsWith(`${kind}]]`));
}

const field = (block: string, name: string) => block.match(new RegExp(`^${name} = "([^"]*)"$`, 'm'))?.[1];

describe('writers-new-a voice scripts', () => {
  for (const id of MINE) {
    it(`${id}: sayable text, unique ids, shows and kits`, () => {
      const toml = SCRIPTS[`/content/voice/${id}.toml`];
      expect(toml, `content/voice/${id}.toml is missing`).toBeDefined();
      expect(toml).toMatch(new RegExp(`^station = "${id}"$`, 'm'));

      const clips = blocks(toml!, 'clip');
      const shows = blocks(toml!, 'show');
      expect(clips.length).toBeGreaterThanOrEqual(25);
      const ids = [...toml!.matchAll(/^id = "([^"]+)"$/gm)].map((m) => m[1]);
      expect(new Set(ids).size, 'duplicate clip or show ids').toBe(ids.length);

      for (const m of toml!.matchAll(/\btext = "((?:[^"\\]|\\.)*)"/g)) {
        const text = m[1] ?? '';
        expect(findBanned(text), `banned term in "${text}"`).toBeNull();
        expect(text, 'spell numbers out for the TTS voice').not.toMatch(/\d/);
        expect(text, 'symbol the voice cannot say').not.toMatch(/[%&#@/+=<>*_~^|$€£]/);
        expect(text.length).toBeLessThanOrEqual(300);
      }
      for (const m of toml!.matchAll(/\b(?:title|name|blurb) = "([^"]*)"/g)) {
        expect(findBanned(m[1] ?? ''), `banned term in "${m[1]}"`).toBeNull();
      }

      // 2–4 shows, each opened by an ident.
      expect(shows.length).toBeGreaterThanOrEqual(2);
      expect(shows.length).toBeLessThanOrEqual(4);
      for (const show of shows) {
        const showId = field(show, 'id');
        const open = clips.filter((c) => field(c, 'show') === showId && field(c, 'part') === 'open');
        expect(open.length, `show ${showId} needs an opening ident`).toBeGreaterThanOrEqual(1);
        for (const c of open) expect(field(c, 'category')).toBe('id');
      }

      // Modular kits: at least one open, two bodies and one close each.
      const kits = new Map<string, { open: number; body: number; close: number }>();
      for (const c of clips) {
        const part = field(c, 'part') as 'open' | 'body' | 'close' | undefined;
        if (!part || field(c, 'show')) continue;
        const kit = field(c, 'kit') ?? field(c, 'category') ?? '';
        const counts = kits.get(kit) ?? { open: 0, body: 0, close: 0 };
        counts[part]++;
        kits.set(kit, counts);
      }
      for (const [kit, n] of kits) {
        expect(n.open, `${kit} opens`).toBeGreaterThanOrEqual(1);
        expect(n.body, `${kit} bodies`).toBeGreaterThanOrEqual(2);
        expect(n.close, `${kit} closes`).toBeGreaterThanOrEqual(1);
      }

      // Halloween.
      expect(clips.filter((c) => /^dates = \[.*"10-31".*\]$/m.test(c)).length).toBeGreaterThanOrEqual(1);
    });
  }

  it('community stations use modular kits', () => {
    for (const id of ['lower-hollow', 'gristwick-parish', 'waystation-9']) {
      expect(SCRIPTS[`/content/voice/${id}.toml`], id).toMatch(/^part = "body"$/m);
    }
  });
});

describe('writers-new-a track packs', () => {
  it('covers every station and recipe and is wired into the pack index', () => {
    for (const id of MINE) {
      const station = STATIONS.find((s) => s.id === id);
      expect(station, id).toBeDefined();
      expect(V3A_STATION_PACKS[id], id).toBeDefined();
      expect(STATION_PACKS[id]).toBe(V3A_STATION_PACKS[id]);
      expect(V3A_RECIPE_PACKS[station!.recipe], station!.recipe).toBeDefined();
      expect(RECIPE_PACKS[station!.recipe]).toBe(V3A_RECIPE_PACKS[station!.recipe]);
    }
  });

  it('gives each station six to ten resident artists, on about two tracks in five', () => {
    for (const id of MINE) {
      const resident = V3A_STATION_PACKS[id]!.grammar.resident as readonly string[];
      expect(resident.length, id).toBeGreaterThanOrEqual(6);
      expect(resident.length, id).toBeLessThanOrEqual(10);
      const station = STATIONS.find((s) => s.id === id)!;
      let hits = 0;
      const n = 1000;
      for (let i = 0; i < n; i++) if (resident.includes(trackMeta(station, i * 7919 + 3).artist)) hits++;
      expect(hits / n, id).toBeGreaterThan(0.3);
      expect(hits / n, id).toBeLessThan(0.5);
    }
  });
});

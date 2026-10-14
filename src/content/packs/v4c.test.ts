// Checks for writers-talk: the four v4 talk station scripts (sayable, unique ids, the Long
// Dark serial, the case and traffic kits, Free Frequency's tomorrow codes, a convergence
// reaction per topic) and their track packs (resident artists, wired into the index).

import { describe, expect, it } from 'vitest';
import { RECIPE_PACKS, STATION_PACKS } from '.';
import { STATIONS } from '../../stations/roster';
import { findBanned } from '../banned';
import { trackMeta } from '../tracks';
import { V4C_RECIPE_PACKS, V4C_STATION_PACKS } from './v4c';

const SCRIPTS = import.meta.glob<string>('/content/voice/*.toml', { query: '?raw', import: 'default', eager: true });

const MINE = ['the-long-dark', 'small-claims', 'traffic-on-the-8s', 'free-frequency'];
const CONVERGENCE = ['missing-moon', 'the-smell', 'the-song', 'the-knock', 'wrong-colour', 'the-pigeon'];

/** The [[clip]] blocks of a script, as raw text. */
const clipsOf = (toml: string) => toml.split(/^\[\[/m).filter((b) => b.startsWith('clip]]'));
const field = (block: string, name: string) => block.match(new RegExp(`^${name} = "([^"]*)"$`, 'm'))?.[1];
const script = (id: string) => SCRIPTS[`/content/voice/${id}.toml`] ?? '';

function kitParts(id: string, kit: string) {
  const parts = { open: 0, body: 0, close: 0 };
  for (const c of clipsOf(script(id))) {
    const part = field(c, 'part') as keyof typeof parts | undefined;
    if (part && field(c, 'kit') === kit) parts[part]++;
  }
  return parts;
}

describe('writers-talk voice scripts', () => {
  for (const id of MINE) {
    it(`${id}: sayable text, unique ids, a convergence reaction per topic`, () => {
      const toml = script(id);
      expect(toml, `content/voice/${id}.toml is missing`).not.toBe('');
      expect(toml).toMatch(new RegExp(`^station = "${id}"$`, 'm'));
      const ids = [...toml.matchAll(/^id = "([^"]+)"$/gm)].map((m) => m[1]);
      expect(new Set(ids).size, 'duplicate clip or show ids').toBe(ids.length);
      expect(clipsOf(toml).length).toBeGreaterThanOrEqual(40);

      for (const m of toml.matchAll(/\btext = "((?:[^"\\]|\\.)*)"/g)) {
        const text = m[1] ?? '';
        expect(findBanned(text), `banned term in "${text}"`).toBeNull();
        expect(text, 'spell numbers out for the TTS voice').not.toMatch(/\d/);
        expect(text, 'symbol the voice cannot say').not.toMatch(/[%&#@/+=<>*_~^|$€£]/);
        expect(text, 'abbreviation the voice may misread').not.toMatch(/\b(Mr|Mrs|Ms|Dr|St)\./);
        expect(text.length).toBeLessThanOrEqual(300);
      }

      const reactions = clipsOf(toml).filter((c) => field(c, 'event') === 'convergence');
      expect(reactions.map((c) => field(c, 'kit')).sort()).toEqual([...CONVERGENCE].sort());
      for (const c of reactions) expect(field(c, 'category')).toBe('event');
    });
  }

  it('the-long-dark: fourteen nightly episodes of two to four clips, each after the first opening with a recap', () => {
    const episodes = new Map<number, string[]>();
    for (const c of clipsOf(script('the-long-dark'))) {
      const m = c.match(/^serial = \{ id = "the-long-dark", episode = (\d+) \}$/m);
      if (!m) continue;
      const n = Number(m[1]);
      episodes.set(n, [...(episodes.get(n) ?? []), c]);
    }
    expect([...episodes.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    for (const [n, clips] of episodes) {
      expect(clips.length, `episode ${n}`).toBeGreaterThanOrEqual(2);
      expect(clips.length, `episode ${n}`).toBeLessThanOrEqual(4);
      // Clips air in id order, so the first by id must carry the recap.
      const first = [...clips].sort((a, b) => (field(a, 'id')! < field(b, 'id')! ? -1 : 1))[0]!;
      if (n > 1) expect(first, `episode ${n} recap`).toMatch(/Previously, on The Long Dark/);
      // Mr. Wren appears in every episode.
      expect(clips.some((c) => c.includes('say = "wren"')), `episode ${n} has no Mr. Wren`).toBe(true);
    }
  });

  it('small-claims: a case kit of about ten claims, twenty hearings and ten rulings', () => {
    const p = kitParts('small-claims', 'case');
    expect(p.open).toBeGreaterThanOrEqual(10);
    expect(p.body).toBeGreaterThanOrEqual(15);
    expect(p.close).toBeGreaterThanOrEqual(10);
  });

  it('traffic-on-the-8s: a traffic kit in category weather, and the switchboard clue', () => {
    const p = kitParts('traffic-on-the-8s', 'traffic');
    expect(p.open).toBeGreaterThanOrEqual(8);
    expect(p.body).toBeGreaterThanOrEqual(20);
    expect(p.close).toBeGreaterThanOrEqual(8);
    for (const c of clipsOf(script('traffic-on-the-8s'))) {
      if (field(c, 'kit') === 'traffic') expect(field(c, 'category')).toBe('weather');
    }
    expect(script('traffic-on-the-8s')).toMatch(/ring advice, then the news, then the traffic/);
  });

  it('free-frequency: one tomorrow clip per drift frequency', () => {
    const drift = STATIONS.find((s) => s.id === 'free-frequency')?.drift;
    expect(drift?.length).toBe(11);
    const kits = clipsOf(script('free-frequency'))
      .map((c) => field(c, 'kit'))
      .filter((k) => k?.startsWith('tomorrow-'));
    expect(kits.sort()).toEqual(drift!.map((f) => `tomorrow-${f}`).sort());
  });
});

describe('writers-talk track packs', () => {
  it('covers every station and bed recipe and is wired into the pack index', () => {
    for (const id of MINE) {
      const station = STATIONS.find((s) => s.id === id);
      expect(station, id).toBeDefined();
      expect(STATION_PACKS[id]).toBe(V4C_STATION_PACKS[id]);
      expect(V4C_RECIPE_PACKS[station!.recipe], station!.recipe).toBeDefined();
      expect(RECIPE_PACKS[station!.recipe]).toBe(V4C_RECIPE_PACKS[station!.recipe]);
    }
  });

  it('gives each station six to ten resident artists, on about two tracks in five', () => {
    for (const id of MINE) {
      const resident = V4C_STATION_PACKS[id]!.grammar.resident as readonly string[];
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

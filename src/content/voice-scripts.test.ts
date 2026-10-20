// Light text checks over the writers-music voice scripts (content/voice/*.toml). The full
// schema is validated by the voice renderer; this guards the things a writer can slip on:
// existing IP, digits and symbols the TTS voice can't say, and over-long lines.

import { describe, expect, it } from 'vitest';
import { STATIONS } from '../stations/roster';
import { findBanned } from './banned';

const SCRIPTS = import.meta.glob<string>('/content/voice/*.toml', { query: '?raw', import: 'default', eager: true });
const STATION_IDS = new Set(STATIONS.map((s) => s.id));
const SHIP_TRIGGERS = new Set(['on_skip_streak', 'scanning_static', 'on_pirate', 'after_event', 'near_secret', 'on_station']);

const MINE = [
  'static-lullabies',
  'void-beats',
  'rainfall-fm',
  'neon-2087',
  'end-lounge',
  'snail-jams',
  'crystal-delta',
  'hold-music',
  'pixel-afterlife',
  'moon-dub',
  'whalesong',
  'baroque-bots',
  'comet-marimba',
  'mirror-polka',
  'wild-multiverse',
  'numbers-omega',
];

function spokenTexts(toml: string): string[] {
  return [...toml.matchAll(/\btext = "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? '');
}

/** Validates dramaturgy and continuity fields (gap, gain, pan, shifts, trigger, swap_with) in a TOML script. */
export function checkDramaturgyFields(toml: string): void {
  for (const m of toml.matchAll(/\bgap = (-?\d+(?:\.\d+)?)/g)) {
    const gap = Number(m[1]);
    expect(gap, `gap ${m[1]} out of [-3, 15]`).toBeGreaterThanOrEqual(-3);
    expect(gap, `gap ${m[1]} out of [-3, 15]`).toBeLessThanOrEqual(15);
  }
  for (const m of toml.matchAll(/\bgain = (-?\d+(?:\.\d+)?)/g)) {
    const gain = Number(m[1]);
    expect(gain, `gain ${m[1]} out of [-18, 6]`).toBeGreaterThanOrEqual(-18);
    expect(gain, `gain ${m[1]} out of [-18, 6]`).toBeLessThanOrEqual(6);
  }
  for (const m of toml.matchAll(/\bpan = (-?\d+(?:\.\d+)?)/g)) {
    const pan = Number(m[1]);
    expect(pan, `pan ${m[1]} out of [-1, 1]`).toBeGreaterThanOrEqual(-1);
    expect(pan, `pan ${m[1]} out of [-1, 1]`).toBeLessThanOrEqual(1);
  }
  for (const m of toml.matchAll(/^shifts = \[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/gm)) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    expect(min, `shifts min ${min}`).toBeGreaterThanOrEqual(0);
    expect(max, `shifts max ${max} < min ${min}`).toBeGreaterThanOrEqual(min);
    expect(max, `shifts max ${max}`).toBeLessThanOrEqual(999);
  }
  for (const m of toml.matchAll(/^trigger = "([^"]+)"$/gm)) {
    expect(SHIP_TRIGGERS.has(m[1]!), `unknown trigger "${m[1]}"`).toBe(true);
  }
  for (const m of toml.matchAll(/^swap_with = "([^"]+)"$/gm)) {
    expect(STATION_IDS.has(m[1]!), `unknown swap_with station "${m[1]}"`).toBe(true);
  }
}

describe('writers-music voice scripts', () => {
  for (const id of MINE) {
    it(`${id}: clean, sayable text`, () => {
      const toml = SCRIPTS[`/content/voice/${id}.toml`];
      expect(toml, `content/voice/${id}.toml is missing`).toBeDefined();
      expect(toml).toMatch(new RegExp(`^station = "${id}"$`, 'm'));
      const ids = [...toml!.matchAll(/^id = "([^"]+)"$/gm)].map((m) => m[1]);
      expect(new Set(ids).size, 'duplicate clip ids').toBe(ids.length);
      const texts = spokenTexts(toml!);
      expect(texts.length).toBeGreaterThan(20);
      for (const text of texts) {
        expect(findBanned(text), `banned term in "${text}"`).toBeNull();
        expect(text, 'spell numbers out for the TTS voice').not.toMatch(/\d/);
        expect(text, 'symbol the voice cannot say').not.toMatch(/[%&#@/+=<>*_~^|$€£]/);
        expect(text.length).toBeLessThanOrEqual(300);
      }
      checkDramaturgyFields(toml!);
    });
  }

  it('accepts negative gap, gain, pan, shifts, trigger, and swap_with across scripts', () => {
    for (const toml of Object.values(SCRIPTS)) {
      checkDramaturgyFields(toml);
    }
    const sample = `
station = "_ship"
[[clip]]
id = "dramaturgy-sample"
category = "ship"
shifts = [0, 12]
trigger = "on_skip_streak"
swap_with = "snail-jams"
lines = [
  { say = "host", text = "Hold on, wait—", gap = -0.35, gain = -6.0, pan = -0.75 },
  { say = "caller", text = "I am already speaking over you!", gap = 0.2, gain = 3.5, pan = 0.8 },
]
`;
    expect(() => checkDramaturgyFields(sample)).not.toThrow();
  });
});

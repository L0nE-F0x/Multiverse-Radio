// Light text checks over the writers-music voice scripts (content/voice/*.toml). The full
// schema is validated by the voice renderer; this guards the things a writer can slip on:
// existing IP, digits and symbols the TTS voice can't say, and over-long lines.

import { describe, expect, it } from 'vitest';
import { findBanned } from './banned';

const SCRIPTS = import.meta.glob<string>('/content/voice/*.toml', { query: '?raw', import: 'default', eager: true });

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
    });
  }
});

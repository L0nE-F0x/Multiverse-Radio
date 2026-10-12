import { describe, expect, it } from 'vitest';
import { RECIPE_IDS, SCENE_IDS } from '../broadcast/types';
import { DEFAULT_STATION_ID, STATIONS } from './roster';

describe('station roster', () => {
  it('has unique ids and frequencies', () => {
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    expect(new Set(STATIONS.map((s) => s.frequency)).size).toBe(STATIONS.length);
  });

  it('is ordered along the dial', () => {
    const frequencies = STATIONS.map((s) => s.frequency);
    expect(frequencies).toEqual([...frequencies].sort((a, b) => a - b));
  });

  it('uses kebab-case ids, hex colors and known recipes/scenes', () => {
    for (const s of STATIONS) {
      expect(s.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(RECIPE_IDS).toContain(s.recipe);
      for (const r of s.recipePool ?? []) expect(RECIPE_IDS).toContain(r);
      expect(SCENE_IDS).toContain(s.scene);
    }
  });

  it('gives every scene exactly one station', () => {
    expect(STATIONS.map((s) => s.scene).sort()).toEqual([...SCENE_IDS].sort());
  });

  it('includes the default station', () => {
    expect(STATIONS.some((s) => s.id === DEFAULT_STATION_ID)).toBe(true);
  });
});

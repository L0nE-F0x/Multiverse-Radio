import { describe, expect, it } from 'vitest';
import { DIAL, PHOSPHOR_IDS, RECIPE_IDS, SCENE_IDS } from '../broadcast/types';
import { DEFAULT_STATION_ID, MAIN_STATIONS, STATIONS } from './roster';

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

  it('gives every station its own scene', () => {
    expect(new Set(STATIONS.map((s) => s.scene)).size).toBe(STATIONS.length);
  });

  it('keeps main stations inside the main band and every station on the dial', () => {
    for (const s of STATIONS) {
      expect(s.frequency).toBeGreaterThanOrEqual(DIAL.min);
      expect(s.frequency).toBeLessThanOrEqual(DIAL.max);
      if (!s.secret) {
        expect(s.frequency).toBeGreaterThanOrEqual(DIAL.mainBand[0]);
        expect(s.frequency).toBeLessThanOrEqual(DIAL.mainBand[1]);
      }
      expect(PHOSPHOR_IDS).toContain(s.phosphor);
    }
  });

  it('keeps stations at least 0.35 MHz apart, on the fine-tuning grid', () => {
    for (let i = 1; i < STATIONS.length; i++) {
      expect(STATIONS[i]!.frequency - STATIONS[i - 1]!.frequency).toBeGreaterThanOrEqual(0.35 - 1e-9);
    }
    for (const s of STATIONS) expect(Math.abs(s.frequency / DIAL.step - Math.round(s.frequency / DIAL.step))).toBeLessThan(1e-6);
  });

  it('has 42 main stations and 3 secret ones', () => {
    expect(MAIN_STATIONS).toHaveLength(42);
    expect(STATIONS.filter((s) => s.secret)).toHaveLength(3);
  });

  it('includes the default station', () => {
    expect(STATIONS.some((s) => s.id === DEFAULT_STATION_ID)).toBe(true);
  });
});

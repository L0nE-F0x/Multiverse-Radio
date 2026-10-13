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

  it('keeps ordinary stations inside the main or Outer Band and every station on the dial', () => {
    for (const s of STATIONS) {
      expect(s.frequency).toBeGreaterThanOrEqual(DIAL.min);
      expect(s.frequency).toBeLessThanOrEqual(DIAL.max);
      if (!s.secret) {
        expect(s.frequency).toBeGreaterThanOrEqual(DIAL.mainBand[0]);
        expect(s.frequency).toBeLessThanOrEqual(DIAL.outerBand[1]);
      }
      for (const f of s.drift ?? []) {
        expect(f).toBeGreaterThanOrEqual(DIAL.outerBand[0]);
        expect(f).toBeLessThanOrEqual(DIAL.outerBand[1]);
        expect(Math.abs(f / DIAL.step - Math.round(f / DIAL.step))).toBeLessThan(1e-6);
        for (const other of STATIONS) if (other !== s) expect(Math.abs(other.frequency - f)).toBeGreaterThanOrEqual(0.35 - 1e-9);
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

  it('has 54 main stations (42 + the Outer Band) and 7 secret ones', () => {
    expect(MAIN_STATIONS).toHaveLength(54);
    expect(MAIN_STATIONS.filter((s) => s.frequency > DIAL.mainBand[1])).toHaveLength(12);
    expect(STATIONS.filter((s) => s.secret)).toHaveLength(7);
  });

  it('gives each v4 secret a different unlock mechanism', () => {
    const kinds = STATIONS.filter((s) => s.unlock).map((s) => s.unlock!.kind);
    expect(kinds.sort()).toEqual(['clock', 'idle', 'sequence', 'shifts']);
    for (const s of STATIONS) {
      if (s.unlock) expect(s.secret).toBe(true);
      if (s.unlock?.kind === 'sequence')
        for (const f of s.unlock.frequencies) expect(MAIN_STATIONS.some((m) => m.frequency === f)).toBe(true);
    }
  });

  it('includes the default station', () => {
    expect(STATIONS.some((s) => s.id === DEFAULT_STATION_ID)).toBe(true);
  });
});

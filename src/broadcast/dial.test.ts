import { describe, expect, it } from 'vitest';
import { MAIN_STATIONS, STATIONS } from '../stations/roster';
import {
  BLEED_RANGE,
  DISCOVER_SIGNAL,
  REACH,
  bleedOf,
  oddities,
  pirateAt,
  pirateStation,
  pirates,
  receptionAt,
  signalOf,
  stationForId,
  stepFrom,
  transmitters,
} from './dial';
import { hash } from './random';
import { DIAL, ODDITY_IDS, PHOSPHOR_IDS, RECIPE_IDS, SCENE_IDS } from './types';

const station = { frequency: 100, width: REACH.station, peak: 1 };

describe('the dial', () => {
  it('has a smooth signal curve that peaks at the centre and fades over about ±0.15 MHz', () => {
    expect(signalOf(station, 100)).toBe(1);
    let previous = 1;
    for (let d = 0.01; d <= 0.2; d += 0.01) {
      const s = signalOf(station, 100 + d);
      expect(s).toBeLessThanOrEqual(previous);
      expect(signalOf(station, 100 - d)).toBeCloseTo(s, 10);
      previous = s;
    }
    expect(signalOf(station, 100.05)).toBeGreaterThan(0.7);
    expect(signalOf(station, 100.1)).toBeLessThan(0.5);
    expect(signalOf(station, 100.15)).toBeLessThan(0.05);
    expect(signalOf(station, 100.1701)).toBe(0);
    // Bleed carries on faintly past the reach, then stops.
    expect(bleedOf(station, 100.17)).toBeCloseTo(1, 6);
    expect(bleedOf(station, 100.3)).toBeGreaterThan(0);
    expect(bleedOf(station, 100 + BLEED_RANGE + 1e-9)).toBe(0);
  });

  it('puts every roster station at its frequency, at full strength', () => {
    for (const s of STATIONS) {
      const r = receptionAt(s.frequency);
      expect(r.signal).toBe(1);
      expect(r.lock?.id).toBe(s.id);
      expect(r.tuned).toEqual({ kind: 'station', station: s });
    }
  });

  it('finds static (with the nearest station locked for bleed) between stations', () => {
    const r = receptionAt(91.25); // between Every News family stations, away from pirates
    if (r.tuned.kind === 'static') {
      expect(r.signal).toBeLessThan(0.12);
    }
    // Far between two stations the lock is the nearer one even with no signal.
    const between = receptionAt(88.62);
    expect(between.tuned.kind).toBe('static');
    expect(between.lock?.id).toBe('void-beats');
  });

  it('hides secret stations behind a very narrow signal', () => {
    for (const s of STATIONS.filter((x) => x.secret)) {
      expect(receptionAt(s.frequency).signal).toBe(1);
      expect(receptionAt(s.frequency + 0.05).signal).toBeLessThan(DISCOVER_SIGNAL);
      // (Transmission Zero sits at the very bottom of the dial.)
      if (s.frequency - 0.05 >= DIAL.min) expect(receptionAt(s.frequency - 0.05).signal).toBeLessThan(DISCOVER_SIGNAL);
      // Stepping along the dial never lands on one.
      expect(stepFrom(s.frequency, 1).secret).toBeFalsy();
      expect(stepFrom(s.frequency, -1).secret).toBeFalsy();
    }
  });

  it('steps through the main stations in order, wrapping', () => {
    let f: number = DIAL.min;
    const seen: string[] = [];
    for (let i = 0; i < MAIN_STATIONS.length; i++) {
      const next = stepFrom(f, 1);
      seen.push(next.id);
      f = next.frequency;
    }
    expect(seen).toEqual(MAIN_STATIONS.map((s) => s.id));
    expect(stepFrom(f, 1).id).toBe(MAIN_STATIONS[0]!.id);
    expect(stepFrom(MAIN_STATIONS[0]!.frequency, -1).id).toBe(MAIN_STATIONS[MAIN_STATIONS.length - 1]!.id);
  });

  it('places pirates deterministically: sparse in the main band, dense beyond it', () => {
    const list = pirates();
    // Same placement as an independent recomputation of the slot hash would give.
    for (const p of list) {
      expect(p.id).toBe(`pirate-${p.frequency.toFixed(2)}`);
      expect(Math.round(p.frequency * 100) % 5).toBe(0);
      expect(hash('pirate-slot', p.frequency.toFixed(2)) / 4294967296).toBeLessThan(0.6);
    }
    const [lo, hi] = DIAL.mainBand;
    const main = list.filter((p) => p.frequency >= lo && p.frequency <= hi);
    const deep = list.filter((p) => p.frequency > hi);
    const low = list.filter((p) => p.frequency < lo);
    expect(main.length).toBeGreaterThan(5);
    expect(main.length).toBeLessThan(30);
    expect(deep.length / (DIAL.max - hi)).toBeGreaterThan(1); // more than one per MHz
    expect(low.length / (lo - DIAL.min)).toBeGreaterThan(1);
    for (const p of main) {
      for (const s of MAIN_STATIONS) expect(Math.abs(p.frequency - s.frequency)).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
    // Pirates never overlap each other or anything else.
    const all = transmitters();
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!;
      const b = all[i]!;
      expect(b.frequency - a.frequency).toBeGreaterThanOrEqual(Math.max(a.width, b.width) - 1e-9);
      if (a.kind === 'pirate' && b.kind === 'pirate') expect(b.frequency - a.frequency).toBeGreaterThanOrEqual(0.25 - 1e-9);
    }
  });

  it('builds a complete station for every pirate, findable by frequency and id', () => {
    const scenes = new Set<string>();
    for (const p of pirates()) {
      const s = p.station;
      expect(s).toBe(pirateStation(p.frequency));
      expect(s.id).toBe(p.id);
      expect(s.frequency).toBe(p.frequency);
      expect(s.name.length).toBeGreaterThan(0);
      expect(['music', 'mixed']).toContain(s.format);
      expect(RECIPE_IDS).toContain(s.recipe);
      expect(SCENE_IDS).toContain(s.scene);
      expect(s.scene.startsWith('pirate-')).toBe(true);
      expect(PHOSPHOR_IDS).toContain(s.phosphor);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pirateAt(p.frequency)).toBe(s);
      expect(stationForId(s.id)).toBe(s);
      const r = receptionAt(p.frequency);
      expect(r.tuned).toEqual({ kind: 'pirate', station: s });
      expect(r.signal).toBeGreaterThanOrEqual(DISCOVER_SIGNAL);
      scenes.add(s.scene);
    }
    expect(scenes.size).toBe(4);
    expect(pirateAt(MAIN_STATIONS[0]!.frequency)).toBeNull();
    expect(stationForId('pirate-1.00')).toBeUndefined();
  });

  it('hides a couple of each oddity along the dial', () => {
    const list = oddities();
    for (const id of ODDITY_IDS) expect(list.filter((o) => o.oddity === id)).toHaveLength(2);
    const [lo, hi] = DIAL.mainBand;
    expect(list.some((o) => o.frequency >= lo && o.frequency <= hi)).toBe(true);
    for (const o of list) {
      const r = receptionAt(o.frequency);
      expect(r.tuned.kind).toBe('oddity');
      if (r.tuned.kind === 'oddity') {
        expect(r.tuned.oddity).toBe(o.oddity);
        expect(r.tuned.scene.startsWith('oddity-')).toBe(true);
        expect(r.tuned.label.length).toBeGreaterThan(0);
      }
      expect(o.station.recipe).toBe(o.oddity);
      for (const s of STATIONS) expect(Math.abs(o.frequency - s.frequency)).toBeGreaterThanOrEqual(0.3 - 1e-9);
    }
  });
});

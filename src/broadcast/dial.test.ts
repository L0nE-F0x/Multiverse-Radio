import { beforeAll, describe, expect, it } from 'vitest';
import { pirateIdentity } from '../content';
import { MAIN_STATIONS, STATIONS, stationById } from '../stations/roster';
import {
  BLEED_RANGE,
  DISCOVER_SIGNAL,
  REACH,
  TUNED_MIN,
  bleedOf,
  dialStations,
  loadPirateNames,
  mainStations,
  oddities,
  pirateAt,
  pirateStation,
  pirates,
  pureStatic,
  receptionAt,
  setDialLayout,
  signalOf,
  stationForId,
  stepFrom,
  transmitters,
} from './dial';
import { hash } from './random';
import { DRIFT_SLOTS, dialLayout, driftFrequency } from './secrets';
import { fixedTzOffset, nightOf } from './time';
import { DIAL, ODDITY_IDS, PHOSPHOR_IDS, RECIPE_IDS, SCENE_IDS } from './types';

const station = { frequency: 100, width: REACH.station, peak: 1 };
const UTC = fixedTzOffset(0);
const SECRETS = STATIONS.filter((s) => s.secret).map((s) => s.id);
/** 03:40 UTC: inside The Minute Between's window. */
const AT_0340 = Date.UTC(2026, 9, 14, 3, 40);
/** Every secret found and The Minute Between on the air: the whole roster transmits. */
const everything = () => setDialLayout(dialLayout({ ms: AT_0340, tz: UTC, discovered: SECRETS }));

describe('the dial', () => {
  beforeAll(() => {
    everything();
    return loadPirateNames();
  });

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
    expect(dialStations()).toHaveLength(STATIONS.length);
    for (const s of dialStations()) {
      const r = receptionAt(s.frequency);
      expect(r.signal).toBe(1);
      expect(r.lock?.id).toBe(s.id);
      expect(r.tuned).toEqual({ kind: 'station', station: s });
      expect(stationForId(s.id)).toBe(s);
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
    for (const s of dialStations().filter((x) => x.secret)) {
      expect(receptionAt(s.frequency).signal).toBe(1);
      expect(receptionAt(s.frequency + 0.05).signal).toBeLessThan(DISCOVER_SIGNAL);
      // (Transmission Zero sits at the very bottom of the dial.)
      if (s.frequency - 0.05 >= DIAL.min) expect(receptionAt(s.frequency - 0.05).signal).toBeLessThan(DISCOVER_SIGNAL);
      // Stepping along the dial never lands on one.
      expect(stepFrom(s.frequency, 1).secret).toBeFalsy();
      expect(stepFrom(s.frequency, -1).secret).toBeFalsy();
    }
  });

  it('steps through the main stations in order, both bands, wrapping', () => {
    const main = mainStations();
    expect(main.map((s) => s.id).sort()).toEqual(MAIN_STATIONS.map((s) => s.id).sort());
    let f: number = DIAL.min;
    const seen: string[] = [];
    for (let i = 0; i < main.length; i++) {
      const next = stepFrom(f, 1);
      seen.push(next.id);
      f = next.frequency;
    }
    expect(seen).toEqual(main.map((s) => s.id));
    expect(seen).toContain('heat-death-afterparty');
    expect(seen).toContain('free-frequency');
    expect(stepFrom(f, 1).id).toBe(main[0]!.id);
    expect(stepFrom(main[0]!.frequency, -1).id).toBe(main[main.length - 1]!.id);
    // Off the top of the main band, the next station up is the first in the Outer Band.
    const outer = main.filter((s) => s.frequency > DIAL.outerBand[0] && s.frequency <= DIAL.outerBand[1]);
    expect(outer).toHaveLength(12);
    expect(stepFrom(DIAL.mainBand[1] - 0.01, 1)).toBe(outer[0]);
    expect(stepFrom(DIAL.outerBand[1], -1)).toBe(outer[outer.length - 1]);
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
    for (const p of list) {
      for (const s of MAIN_STATIONS) expect(Math.abs(p.frequency - s.frequency)).toBeGreaterThanOrEqual(0.2 - 1e-9);
      for (const f of DRIFT_SLOTS) expect(Math.abs(p.frequency - f)).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
    // The Outer Band has stations of its own: a few pirates, far fewer than the deep band.
    const [olo, ohi] = DIAL.outerBand;
    const outer = list.filter((p) => p.frequency > olo && p.frequency <= ohi);
    const beyond = list.filter((p) => p.frequency > ohi);
    expect(outer.length).toBeGreaterThan(0);
    expect(outer.length / (ohi - olo)).toBeLessThan((beyond.length / (DIAL.max - ohi)) * 0.6);
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
      const who = pirateIdentity(hash('pirate', p.frequency.toFixed(2)));
      expect(s.name).toBe(who.name);
      expect(s.host.name).toBe(who.host.name);
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
      for (const f of DRIFT_SLOTS) expect(Math.abs(o.frequency - f)).toBeGreaterThanOrEqual(0.3 - 1e-9);
    }
  });
});

describe('the dial, v4 layout', () => {
  beforeAll(() => loadPirateNames());

  it('puts Free Frequency at tonight’s drift slot, and nowhere else', () => {
    const ff = stationById('free-frequency')!;
    for (let d = 0; d < 6; d++) {
      const ms = AT_0340 + d * 86_400_000;
      setDialLayout(dialLayout({ ms, tz: UTC, discovered: [] }));
      const tonight = driftFrequency(ff, nightOf(ms, UTC));
      const def = stationForId('free-frequency')!;
      expect(def.frequency).toBe(tonight);
      expect(dialStations().find((s) => s.id === 'free-frequency')).toBe(def);
      expect(receptionAt(tonight).tuned).toEqual({ kind: 'station', station: def });
      for (const f of ff.drift!) if (f !== tonight) expect(receptionAt(f).signal).toBeLessThan(TUNED_MIN);
    }
    everything();
  });

  it('keeps gated secrets off the air until they open or are found', () => {
    const noon = Date.UTC(2026, 9, 14, 12, 0);
    setDialLayout(dialLayout({ ms: noon, tz: UTC, discovered: [] }));
    for (const id of ['the-switchboard', 'minute-between', 'the-harbour', 'something-listening']) {
      const s = stationById(id)!;
      expect(receptionAt(s.frequency).lock?.id).not.toBe(id);
      expect(receptionAt(s.frequency).tuned.kind).toBe('static');
      // Still known by id (for the guide and links), at its own frequency.
      expect(stationForId(id)?.frequency).toBe(s.frequency);
    }
    // v3 secrets are always there.
    for (const s of STATIONS.filter((x) => x.secret && !x.unlock)) expect(receptionAt(s.frequency).lock?.id).toBe(s.id);
    // The Minute Between opens on the clock, found or not.
    setDialLayout(dialLayout({ ms: AT_0340, tz: UTC, discovered: [] }));
    expect(receptionAt(133.3).lock?.id).toBe('minute-between');
    // A visitor sits where the listener was, instead of at its own frequency.
    setDialLayout(dialLayout({ ms: noon, tz: UTC, discovered: ['something-listening'], visitor: { id: 'something-listening', frequency: 125.55 } }));
    expect(receptionAt(125.55).tuned).toMatchObject({ kind: 'station', station: { id: 'something-listening', frequency: 125.55 } });
    expect(receptionAt(144.4).lock?.id).not.toBe('something-listening');
    setDialLayout(dialLayout({ ms: noon, tz: UTC, discovered: ['something-listening'] }));
    expect(receptionAt(144.4).lock?.id).toBe('something-listening');
    everything();
  });

  it('leaves stretches of pure static (nothing bleeding through) for patient listeners', () => {
    const quiet = (from: number, to: number) => {
      let n = 0;
      for (let f = from; f < to; f += 0.05) if (pureStatic(receptionAt(f))) n++;
      return n;
    };
    expect(quiet(118, 160)).toBeGreaterThan(30);
    expect(quiet(DIAL.outerBand[0], DIAL.outerBand[1])).toBeGreaterThan(2);
    // Right next to a station isn't pure static, whatever the signal says.
    expect(pureStatic(receptionAt(stationById('void-beats')!.frequency + REACH.station + 0.01))).toBe(false);
  });
});

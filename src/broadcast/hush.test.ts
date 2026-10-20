import { describe, expect, it, vi } from 'vitest';
import { STATIONS } from '../stations/roster';
import { oddities } from './dial';
import { Director } from './director';
import { HushPicker } from './hush';
import { VoiceLibrary } from './library';
import type { VoiceClip } from './types';

const MIN = 60_000;
const CTX = { date: '10-14', daypart: 'night' as const };

function shipClip(id: string, extra: Partial<VoiceClip> = {}, seconds = 8): VoiceClip {
  return {
    id,
    category: 'ship',
    url: `/voice/_ship/${id}.mp3`,
    durationMs: seconds * 1000,
    overMusic: true,
    level: 2,
    lines: [{ speaker: 'HUSH', text: id, startMs: 0 }],
    ...extra,
  };
}

describe('Context-aware HushPicker', () => {
  it('never fires hush-2-skipped or trigger: on_skip_streak without skips, and prioritizes them after two skips', () => {
    const ambient1 = shipClip('l0-01', { level: 0 });
    const ambient2 = shipClip('l2-01', { level: 2 });
    const builtInSkip = shipClip('hush-2-skipped', { level: 2 });
    const manifestSkip = shipClip('custom-skip', { level: 2, trigger: 'on_skip_streak' });
    const tomlSkip = shipClip('l1-16', { level: 1 });
    const pool = [ambient1, ambient2, builtInSkip, manifestSkip, tomlSkip];

    const picker = new HushPicker();

    // Without skipping (or with only 1 skip), skip clips never fire even across many picks.
    for (let i = 0; i < 20; i++) {
      const picked = picker.pick(pool, 3, CTX, () => (i % 2 === 0 ? 0.1 : 0.9));
      expect(picked).toBeDefined();
      expect(['hush-2-skipped', 'custom-skip', 'l1-16']).not.toContain(picked!.id);
    }

    picker.recordSkip(10_000);
    for (let i = 0; i < 10; i++) {
      const picked = picker.pick(pool, 3, { ...CTX, nowMs: 12_000 }, Math.random);
      expect(['hush-2-skipped', 'custom-skip', 'l1-16']).not.toContain(picked!.id);
    }

    // Second skip within 10 minutes activates on_skip_streak and prioritizes the skip clip immediately.
    picker.recordSkip(20_000);
    const firstTriggered = picker.pick(pool, 3, { ...CTX, nowMs: 21_000 }, () => 0);
    expect(['hush-2-skipped', 'custom-skip', 'l1-16']).toContain(firstTriggered!.id);

    // One-shot trigger is consumed once spoken: next pick falls back to ambient notices.
    const nextAmbient = picker.pick(pool, 3, { ...CTX, nowMs: 25_000 }, () => 0.5);
    expect(['l0-01', 'l2-01']).toContain(nextAmbient!.id);

    // Triggering another skip streak later allows the remaining unheard skip clip to fire.
    picker.recordSkip(50_000);
    picker.recordSkip(55_000);
    const secondTriggered = picker.pick(pool, 3, { ...CTX, nowMs: 56_000 }, () => 0);
    expect(['hush-2-skipped', 'custom-skip', 'l1-16']).toContain(secondTriggered!.id);
    expect(secondTriggered!.id).not.toBe(firstTriggered!.id);
  });

  it('expires skip streak if the skips are outside the recent window', () => {
    const ambient = shipClip('l0-01', { level: 0 });
    const skipClip = shipClip('hush-2-skipped', { level: 2 });
    const pool = [ambient, skipClip];
    const picker = new HushPicker();

    picker.recordSkip(0);
    picker.recordSkip(20 * MIN);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 20 * MIN + 1000 }, Math.random)?.id).toBe('l0-01');
  });

  it('only fires hush-2-slow-past and station-filtered _ship clips when relevant to that station', () => {
    const ambient = shipClip('l2-01', { level: 2 });
    const slowPast = shipClip('hush-2-slow-past', { level: 2 });
    const tomlSlowPast = shipClip('l2-07', { level: 2 });
    const voidSpecific = shipClip('ship-void', { level: 1, stations: ['void-beats'] });
    const pool = [ambient, slowPast, tomlSlowPast, voidSpecific];

    const picker = new HushPicker();

    // No station tuned yet: only ambient clip can fire.
    for (let i = 0; i < 15; i++) {
      expect(picker.pick(pool, 3, CTX, Math.random)?.id).toBe('l2-01');
    }

    // Tuned to rainfall-fm: neither static-lullabies nor void-beats clips may fire.
    picker.recordTune(90.1, 'rainfall-fm', false, false, 10_000);
    for (let i = 0; i < 15; i++) {
      expect(picker.pick(pool, 3, { ...CTX, nowMs: 11_000 }, Math.random)?.id).toBe('l2-01');
    }

    // Tuned to void-beats: void-beats clip is prioritized first, static-lullabies never fires.
    picker.recordTune(88.4, 'void-beats', false, false, 20_000);
    const onVoid = picker.pick(pool, 3, { ...CTX, nowMs: 21_000 }, () => 0);
    expect(onVoid?.id).toBe('ship-void');
    // Subsequent picks on void-beats fall back to ambient, never static-lullabies.
    for (let i = 0; i < 10; i++) {
      const p = picker.pick(pool, 3, { ...CTX, nowMs: 22_000 + i * 1000 }, Math.random);
      expect(['hush-2-slow-past', 'l2-07']).not.toContain(p?.id);
    }

    // Tuned to static-lullabies: hush-2-slow-past / l2-07 fires and is prioritized!
    picker.recordTune(87.7, 'static-lullabies', false, false, 40_000);
    const onStaticLullabies = picker.pick(pool, 3, { ...CTX, nowMs: 41_000 }, () => 0);
    expect(onStaticLullabies?.id).toBe('hush-2-slow-past');

    // Tuning past static-lullabies into static also allows the other static-lullabies clip to fire once.
    picker.recordTune(87.7, 'static-lullabies', false, false, 50_000);
    picker.recordTune(87.9, null, false, false, 51_000);
    const afterTuningPast = picker.pick(pool, 3, { ...CTX, nowMs: 52_000 }, () => 0);
    expect(afterTuningPast?.id).toBe('l2-07');

    // Repeated 250ms heartbeat ticks at the same static frequency (87.9) do NOT re-arm the consumed trigger.
    for (let t = 52_250; t <= 54_000; t += 250) {
      picker.recordTune(87.9, null, false, false, t);
      expect(picker.state.stationTriggerActive).toBe(false);
    }

    // Tuning past static-lullabies directly onto another station (e.g. void-beats) still allows a slow-past clip to fire once.
    const pickerPassBy = new HushPicker();
    pickerPassBy.recordTune(87.75, null, false, false, 1000);
    pickerPassBy.recordTune(88.4, 'void-beats', false, false, 2000);
    expect(pickerPassBy.pick([ambient, slowPast], 3, { ...CTX, nowMs: 2500 }, () => 0)?.id).toBe('hush-2-slow-past');
    expect(pickerPassBy.state.stationTriggerActive).toBe(false);
    expect(pickerPassBy.pick([ambient, slowPast], 3, { ...CTX, nowMs: 3000 }, () => 0)?.id).toBe('l2-01');
  });

  it('only fires hush-2-wandering and trigger: scanning_static after wandering in static or across frequencies', () => {
    const ambient = shipClip('l1-01', { level: 1 });
    const wandering = shipClip('hush-2-wandering', { level: 2 });
    const customStatic = shipClip('custom-static', { level: 1, trigger: 'scanning_static' });
    const tomlWandering = shipClip('l1-11', { level: 1 });
    const pool = [ambient, wandering, customStatic, tomlWandering];

    const picker = new HushPicker();
    picker.recordTune(88.4, 'void-beats', false, false, 1000);

    // Stayed on a single station: wandering clips never fire.
    for (let i = 0; i < 15; i++) {
      expect(picker.pick(pool, 3, { ...CTX, nowMs: 5000 }, Math.random)?.id).toBe('l1-01');
    }

    // Brief 5s dip into static (< 15s threshold and < 5 frequencies): still does not fire.
    picker.recordTune(92.0, null, false, false, 10_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 14_000 }, Math.random)?.id).toBe('l1-01');

    // After >= 15s total in static, scanning_static activates and prioritizes wandering clips!
    const pickedAfterDwell = picker.pick(pool, 3, { ...CTX, nowMs: 26_000 }, () => 0);
    expect(['hush-2-wandering', 'custom-static', 'l1-11']).toContain(pickedAfterDwell?.id);

    // Consumed after speaking: next pick is ambient.
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 27_000 }, Math.random)?.id).toBe('l1-01');

    // Scanning across >= 5 frequencies also activates scanning_static.
    for (const [idx, freq] of [93.1, 94.5, 96.2, 98.8, 101.3].entries()) {
      picker.recordTune(freq, null, false, false, 30_000 + idx * 500);
    }
    const pickedAfterScan = picker.pick(pool, 3, { ...CTX, nowMs: 33_000 }, () => 0);
    expect(['hush-2-wandering', 'custom-static', 'l1-11']).toContain(pickedAfterScan?.id);
  });

  it('supports on_pirate, near_secret, and after_event triggers and wires Director actions into HushPicker', () => {
    const ambient = shipClip('l0-01', { level: 0 });
    const pirateClip = shipClip('ship-pirate', { level: 1, trigger: 'on_pirate' });
    const secretClip = shipClip('ship-secret', { level: 2, trigger: 'near_secret' });
    const eventClip = shipClip('ship-after-event', { level: 1, trigger: 'after_event' });
    const pool = [ambient, pirateClip, secretClip, eventClip];

    const picker = new HushPicker();
    expect(picker.pick(pool, 3, CTX, Math.random)?.id).toBe('l0-01');

    picker.recordTune(112.4, 'pirate-112.40', true, false, 10_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 11_000 }, Math.random)?.id).toBe('ship-pirate');
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 12_000 }, Math.random)?.id).toBe('l0-01');

    picker.recordTune(121.45, null, false, true, 20_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 21_000 }, Math.random)?.id).toBe('ship-secret');

    picker.recordEventEnd('dimensional-storm', 30_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 31_000 }, Math.random)?.id).toBe('ship-after-event');
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 32_000 }, Math.random)?.id).toBe('l0-01');

    // Verify Director wiring feeds skip, tune, and event end into director.hushPicker.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let now = 100_000;
    const director = new Director({
      library: new VoiceLibrary(),
      stations: STATIONS,
      stationId: 'void-beats',
      clock: { now: () => now },
    });
    director.skip();
    now += 2000;
    director.skip();
    expect(director.hushPicker.state.skipStreakActive).toBe(true);
    director.setFrequency(87.7, 'jump');
    expect(director.hushPicker.state.currentStationId).toBe('static-lullabies');

    // Tuning to a dial oddity must NOT report 'oddity-...' as a roster station to HushPicker.
    const odd = oddities()[0]!;
    director.setFrequency(odd.frequency, 'jump');
    expect(director.program?.kind).toBe('oddity');
    expect(director.hushPicker.state.currentStationId).toBeNull();
    expect(director.hushPicker.state.visitedStations.has(odd.id)).toBe(false);

    director.dispose();
    errSpy.mockRestore();
  });

  it('gates built-in _ship.toml behavioral clips l0-17, l0-13, l2-06, and l2-09 by their triggers', () => {
    const ambient = shipClip('l0-01', { level: 0 });
    const l017Pirate = shipClip('l0-17', { level: 0 });
    const l013AfterEvent = shipClip('l0-13', { level: 0 });
    const l206Static = shipClip('l2-06', { level: 2 });
    const l209Secret = shipClip('l2-09', { level: 2 });
    const pool = [ambient, l017Pirate, l013AfterEvent, l206Static, l209Secret];

    const picker = new HushPicker();

    // Without triggers active, none of the behavioral clips may fire.
    for (let i = 0; i < 15; i++) {
      expect(picker.pick(pool, 3, CTX, Math.random)?.id).toBe('l0-01');
    }

    // l0-17 fires on pirate tune, then consumes.
    picker.recordTune(115.2, 'pirate-115.20', true, false, 10_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 11_000 }, Math.random)?.id).toBe('l0-17');
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 12_000 }, Math.random)?.id).toBe('l0-01');

    // l0-13 fires after an event ends, then consumes.
    picker.recordEventEnd('dimensional-storm', 20_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 21_000 }, Math.random)?.id).toBe('l0-13');
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 22_000 }, Math.random)?.id).toBe('l0-01');

    // l2-09 fires near a secret station, then consumes.
    picker.recordTune(76.0, null, false, true, 30_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 31_000 }, Math.random)?.id).toBe('l2-09');
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 32_000 }, Math.random)?.id).toBe('l0-01');

    // l2-06 fires after scanning static for >= 15s, then consumes.
    picker.recordTune(94.0, null, false, false, 40_000);
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 56_000 }, Math.random)?.id).toBe('l2-06');
    expect(picker.pick(pool, 3, { ...CTX, nowMs: 57_000 }, Math.random)?.id).toBe('l0-01');
  });
});

// v4 director rules (docs/V4-PLAN.md): drift, unlocks, shifts and heading, arcs, weekdays,
// the Convergence and the station quirks. Everything here is deterministic from the clock.

import { describe, expect, it } from 'vitest';
import { STATIONS, stationById } from '../stations/roster';
import {
  CONVERGENCE_TOPICS,
  convergenceOnDay,
  convergenceReaction,
  convergenceTopic,
  eventsOnDay,
  nextConvergence,
  planEvent,
  WEEK_MS,
} from './events';
import { HushPicker, dueArcClip, isJamClip } from './hush';
import { parseManifest, parseShowIndex } from './manifest';
import {
  AFTERPARTY_BPM,
  afterpartyBpm,
  eightsInHour,
  fullMoonNight,
  moonIllumination,
  tweaksAt,
  GREG_GAIN,
  isWelcomeClip,
  voiceGain,
} from './quirks';
import { HOUR_MS, StationSchedule, tomorrowMinutes } from './scheduler';
import {
  DISCOVER_SIGNAL,
  SecretWatcher,
  dialLayout,
  driftFrequency,
  driftSlot,
  frequencyTomorrow,
  frequencyTonight,
  inWindows,
  layoutKey,
  tomorrowKitFrequency,
  transmitting,
  type Sighting,
} from './secrets';
import { ArcLog, HEADING_BASE, ListenLog, SHIFT_MIN_MS, ShiftLog, headingFor, parseShiftState } from './shifts';
import { DAY_MS, MIN_MS, fixedTzOffset, localTime, nightOf, showAtHour } from './time';
import type { ShowDef, StationDef, VoiceCategory, VoiceClip, VoiceSegment } from './types';

const UTC = fixedTzOffset(0);
const SEC = 1000;
const station = (id: string): StationDef => {
  const s = stationById(id);
  if (!s) throw new Error(`no station ${id}`);
  return s;
};

let n = 0;
function clip(owner: string, category: VoiceCategory, extra: Partial<VoiceClip> = {}, seconds = 12): VoiceClip {
  const id = `${category}-${++n}`;
  return {
    id,
    category,
    url: `/voice/${owner}/${id}.mp3`,
    durationMs: seconds * 1000,
    overMusic: category === 'id' || category === 'dj',
    lines: [{ speaker: 'Host', text: id, startMs: 0 }],
    ...extra,
  };
}
const many = (count: number, make: (i: number) => VoiceClip) => Array.from({ length: count }, (_, i) => make(i));
const voices = (segments: readonly { kind: string }[]) => segments.filter((s): s is VoiceSegment => s.kind === 'voice');

// 2026-10-14 (a Wednesday), midnight UTC.
const WED = Date.UTC(2026, 9, 14);
const SAT = WED + 3 * DAY_MS;
const SUN = WED + 4 * DAY_MS;
const MON = WED + 5 * DAY_MS;

// ── Time ──────────────────────────────────────────────────────────────────────

describe('local nights and weekdays', () => {
  it('knows the weekday and that nights run 06:00 to 06:00', () => {
    expect(localTime(WED, UTC).weekday).toBe(3);
    expect(localTime(SUN + 2 * HOUR_MS, UTC).weekday).toBe(0);
    // 02:00 on Sunday belongs to Saturday's night; 06:00 starts Sunday's.
    expect(nightOf(SUN + 2 * HOUR_MS, UTC)).toBe(nightOf(SAT + 12 * HOUR_MS, UTC));
    expect(nightOf(SUN + 6 * HOUR_MS, UTC)).toBe(nightOf(SAT + 12 * HOUR_MS, UTC) + 1);
    expect(nightOf(SUN + 6 * HOUR_MS - 1, UTC)).toBe(nightOf(SAT + 12 * HOUR_MS, UTC));
    // In Tokyo (UTC+9) the night turns over at 21:00 UTC.
    const tokyo = fixedTzOffset(540);
    expect(nightOf(WED + 21 * HOUR_MS, tokyo)).toBe(nightOf(WED + 21 * HOUR_MS - 1, tokyo) + 1);
  });

  it('runs weekly shows only on their day (the start hour’s day, even past midnight)', () => {
    const greg: ShowDef = { id: 'quiet-corner', name: 'The Quiet Corner', blurb: '', start: 2, end: 3, days: [0] };
    const late: ShowDef = { id: 'late', name: 'Late', blurb: '', start: 23, end: 2, days: [6] };
    expect(showAtHour([greg], 2, 0)).toBe(greg);
    expect(showAtHour([greg], 2, 1)).toBeNull();
    expect(showAtHour([greg], 3, 0)).toBeNull();
    expect(showAtHour([late], 23, 6)).toBe(late);
    expect(showAtHour([late], 1, 0)).toBe(late); // Sunday 01:00: Saturday's show
    expect(showAtHour([late], 1, 6)).toBeNull(); // Saturday 01:00: Friday's slot
    // Without a weekday, days are ignored (v3 callers).
    expect(showAtHour([greg], 2)).toBe(greg);
  });
});

// ── Drift ─────────────────────────────────────────────────────────────────────

describe('Free Frequency drift', () => {
  const ff = station('free-frequency');
  const slots = ff.drift!;

  it('never sits on the same frequency two nights running, and uses every slot', () => {
    const seen = new Map<number, number>();
    let previous = -1;
    for (let night = 20_000; night < 22_000; night++) {
      const slot = driftSlot(ff.id, slots.length, night);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(slots.length);
      expect(slot).not.toBe(previous);
      previous = slot;
      seen.set(slot, (seen.get(slot) ?? 0) + 1);
    }
    expect(seen.size).toBe(slots.length);
    for (const count of seen.values()) expect(count).toBeGreaterThan(150);
    // Seeded by the date: the same for everyone, every time.
    expect(driftFrequency(ff, 20_500)).toBe(driftFrequency({ ...ff }, 20_500));
  });

  it('moves at 06:00 local, and knows tomorrow night’s frequency', () => {
    const tz = fixedTzOffset(120);
    const night = nightOf(WED + 12 * HOUR_MS, tz);
    // 05:59 and 06:00 local (03:59 and 04:00 UTC).
    const before = WED + 4 * HOUR_MS - MIN_MS;
    const after = WED + 4 * HOUR_MS;
    expect(frequencyTonight(ff, before, tz)).toBe(driftFrequency(ff, night - 1));
    expect(frequencyTonight(ff, after, tz)).toBe(driftFrequency(ff, night));
    expect(frequencyTomorrow(ff, before, tz)).toBe(frequencyTonight(ff, after, tz));
    expect(slots).toContain(frequencyTonight(ff, after, tz));
    // Stations that don't drift stay put.
    expect(frequencyTonight(station('void-beats'), after, tz)).toBe(station('void-beats').frequency);
  });

  it('reads the frequency a tomorrow clip announces from its kit', () => {
    expect(tomorrowKitFrequency('tomorrow-110.65')).toBe(110.65);
    expect(tomorrowKitFrequency('tomorrow-114.3')).toBe(114.3);
    expect(tomorrowKitFrequency('tomorrow-')).toBeNull();
    expect(tomorrowKitFrequency('news')).toBeNull();
    expect(tomorrowKitFrequency(undefined)).toBeNull();
  });

  it('airs only the clip for tomorrow night’s frequency, a few times a day, never in rotation', () => {
    const own = [
      ...slots.map((f) => clip(ff.id, 'dj', { kit: `tomorrow-${f}`, title: String(f) }, 9)),
      ...many(20, () => clip(ff.id, 'dj', {}, 20)),
      ...many(15, () => clip(ff.id, 'story', {}, 50)),
      ...many(15, () => clip(ff.id, 'news', {}, 35)),
      ...many(5, () => clip(ff.id, 'id', {}, 4)),
    ];
    const schedule = new StationSchedule(ff, { own, shared: [] }, { tzOffset: UTC });
    const segments = voices(schedule.segmentsBetween(WED, WED + 3 * DAY_MS));
    const tomorrow = segments.filter((s) => tomorrowKitFrequency(s.clip.kit) !== null);
    expect(tomorrow.length).toBeGreaterThanOrEqual(3 * 3);
    expect(tomorrow.length).toBeLessThanOrEqual(3 * 4);
    for (const s of tomorrow) {
      expect(tomorrowKitFrequency(s.clip.kit)).toBe(frequencyTomorrow(ff, s.startMs, UTC));
      // At one of the day's seeded times (or just after, at the next boundary).
      const local = localTime(s.startMs, UTC);
      const due = tomorrowMinutes(ff.id, local.day).map((m) => local.day * DAY_MS + m * MIN_MS);
      expect(due.some((at) => s.startMs >= at && s.startMs - at < 4 * MIN_MS)).toBe(true);
    }
    expect(segments.length - tomorrow.length).toBeGreaterThan(100);
  });
});

// ── Unlocks ───────────────────────────────────────────────────────────────────

describe('secret unlocks', () => {
  const at = (h: number, m: number) => h * 60 + m;

  it('opens clock windows by local time (end exclusive, wrapping midnight)', () => {
    const minute = [{ from: '03:33', to: '03:46' }];
    expect(inWindows(minute, at(3, 32))).toBe(false);
    expect(inWindows(minute, at(3, 33))).toBe(true);
    expect(inWindows(minute, at(3, 45))).toBe(true);
    expect(inWindows(minute, at(3, 46))).toBe(false);
    expect(inWindows([{ from: '23:50', to: '00:10' }], at(0, 5))).toBe(true);
    expect(inWindows([{ from: '23:50', to: '00:10' }], at(12, 0))).toBe(false);
    expect(inWindows([{ from: 'nonsense', to: '00:10' }], at(0, 5))).toBe(false);
  });

  it('knows which secrets transmit', () => {
    const found = new Set<string>();
    const minuteBetween = station('minute-between');
    expect(transmitting(station('void-beats'), 0, found)).toBe(true);
    expect(transmitting(station('the-switchboard'), 0, found)).toBe(false);
    expect(transmitting(station('the-switchboard'), 0, new Set(['the-switchboard']))).toBe(true);
    expect(transmitting(minuteBetween, at(3, 40), found)).toBe(true);
    // Found or not, the clock decides.
    expect(transmitting(minuteBetween, at(12, 0), new Set(['minute-between']))).toBe(false);
    expect(transmitting(station('the-harbour'), 0, found)).toBe(false);
    expect(transmitting(station('something-listening'), 0, found)).toBe(false);
    for (const s of STATIONS.filter((x) => x.secret && !x.unlock)) expect(transmitting(s, 0, found)).toBe(true);
  });

  it('lays out the dial and changes the key only when something moves', () => {
    const noon = WED + 12 * HOUR_MS;
    const a = dialLayout({ ms: noon, tz: UTC, discovered: [] });
    expect(a.key).toBe(layoutKey({ ms: noon + 60_000, tz: UTC, discovered: [] }));
    expect(layoutKey({ ms: noon + DAY_MS, tz: UTC, discovered: [] })).not.toBe(a.key);
    expect(layoutKey({ ms: noon, tz: UTC, discovered: ['the-harbour'] })).not.toBe(a.key);
    expect(layoutKey({ ms: WED + at(3, 35) * MIN_MS, tz: UTC, discovered: [] })).not.toBe(layoutKey({ ms: WED, tz: UTC, discovered: [] }));
    expect(a.roster).toHaveLength(STATIONS.length);
    const ff = a.roster.find((s) => s.id === 'free-frequency')!;
    expect(ff.frequency).toBe(frequencyTonight(station('free-frequency'), noon, UTC));
    expect(a.onAir.some((s) => s.id === 'the-harbour')).toBe(false);
    expect(a.onAir.map((s) => s.frequency)).toEqual([...a.onAir.map((s) => s.frequency)].sort((x, y) => x - y));
  });

  describe('the watcher', () => {
    const switchboard = station('the-switchboard');
    const unlock = switchboard.unlock as Extract<StationDef['unlock'], { kind: 'sequence' }>;
    const tuned = (wall: number, frequency: number, signal = 1): Sighting => ({
      wall,
      playing: true,
      frequency,
      lock: { id: `at-${frequency}`, kind: 'station', frequency },
      signal,
    });
    /** Feeds a hold of `ms` at a frequency in 250 ms ticks from `t`; returns what was found and the end time. */
    const hold = (w: SecretWatcher, t: number, frequency: number, ms: number, signal = 1) => {
      const found: string[] = [];
      for (let x = t; x <= t + ms; x += 250) found.push(...w.observe(tuned(x, frequency, signal), []));
      return { found, end: t + ms + 250 };
    };

    it('finds the Switchboard when the sequence is held in order, in time', () => {
      expect(unlock.frequencies).toEqual([97.8, 89.3, 114.8]);
      const w = new SecretWatcher();
      let t = 1_000_000;
      let found: string[] = [];
      for (const f of unlock.frequencies) {
        // Wander past another station on the way: that doesn't break it.
        ({ end: t } = hold(w, t, 100.1, 2500));
        ({ found, end: t } = hold(w, t + 3000, f, unlock.holdMs + 300));
      }
      expect(found).toEqual(['the-switchboard']);
      expect(w.sequenceProgress('the-switchboard', t)).toBe(0);
    });

    it('needs every hold long enough, at a strong signal, in order and within the time', () => {
      const run = (steps: { f: number; ms: number; signal?: number; gap?: number }[]) => {
        const w = new SecretWatcher();
        let t = 5_000_000;
        const found: string[] = [];
        for (const step of steps) {
          const r = hold(w, t + (step.gap ?? 1000), step.f, step.ms, step.signal);
          found.push(...r.found);
          t = r.end;
        }
        return found;
      };
      const [a, b, c] = unlock.frequencies as [number, number, number];
      expect(run([{ f: a, ms: 2300 }, { f: b, ms: 2300 }, { f: c, ms: 2300 }])).toEqual(['the-switchboard']);
      expect(run([{ f: a, ms: 1500 }, { f: b, ms: 2300 }, { f: c, ms: 2300 }])).toEqual([]);
      expect(run([{ f: a, ms: 2300 }, { f: c, ms: 2300 }, { f: b, ms: 2300 }])).toEqual([]);
      expect(run([{ f: a, ms: 2300 }, { f: b, ms: 2300, signal: DISCOVER_SIGNAL - 0.1 }, { f: c, ms: 2300 }])).toEqual([]);
      expect(run([{ f: a, ms: 2300 }, { f: b, ms: 2300, gap: 60_000 }, { f: c, ms: 2300, gap: 30_000 }])).toEqual([]);
      // A fresh start at the first frequency gets another chance.
      expect(run([{ f: a, ms: 2300 }, { f: b, ms: 2300, gap: 100_000 }, { f: a, ms: 2300 }, { f: b, ms: 2300 }, { f: c, ms: 2300 }])).toEqual([
        'the-switchboard',
      ]);
    });

    it('lets Something Listening come to a patient listener in pure static', () => {
      const listening = station('something-listening');
      const after = (listening.unlock as { afterMs: number }).afterMs;
      const quiet = (wall: number, frequency = 125.55, playing = true): Sighting => ({ wall, playing, frequency, lock: null, signal: 0 });
      const w = new SecretWatcher();
      let found: string[] = [];
      for (let t = 0; t < after - 1000; t += 500) found.push(...w.observe(quiet(t), []));
      expect(found).toEqual([]);
      // A station bleeding through (or tuning in) starts the wait again.
      w.observe({ ...quiet(after - 500), lock: { id: 'void-beats', kind: 'station', frequency: 88.1 } }, []);
      for (let t = after; t < 2 * after; t += 500) found.push(...w.observe(quiet(t), []));
      expect(found).toEqual([]);
      found = w.observe(quiet(2 * after + 600), []);
      expect(found).toEqual(['something-listening']);
      expect(w.visitor).toEqual({ id: 'something-listening', frequency: 125.55 });
      // It stays while the dial does, and leaves once it moves away.
      w.observe(quiet(2 * after + 1000, 125.57), ['something-listening']);
      expect(w.visitor).not.toBeNull();
      w.observe(quiet(2 * after + 1500, 125.7), ['something-listening']);
      expect(w.visitor).toBeNull();
      // Paused doesn't count.
      const paused = new SecretWatcher();
      for (let t = 0; t < 2 * after; t += 500) expect(paused.observe(quiet(t, 125.55, false), [])).toEqual([]);
      // Once found, it doesn't come again.
      const again = new SecretWatcher();
      for (let t = 0; t < 2 * after; t += 500) expect(again.observe(quiet(t), ['something-listening'])).toEqual([]);
    });
  });
});

// ── Shifts, heading, listening ────────────────────────────────────────────────

describe('night shifts', () => {
  const memory = <T,>(initial: unknown = null) => {
    const box = { value: initial as unknown, saves: 0 };
    return { box, persist: { load: () => box.value, save: (v: T) => ((box.value = JSON.parse(JSON.stringify(v))), box.saves++) } };
  };

  it('counts a night with ten minutes of listening, once', () => {
    const { box, persist } = memory();
    const log = new ShiftLog(persist, UTC);
    const evening = WED + 20 * HOUR_MS;
    let counted = 0;
    for (let t = 0; t < 9 * MIN_MS; t += 1000) if (log.listen(evening + t, 1000)) counted++;
    expect(log.shifts).toBe(0);
    for (let t = 9 * MIN_MS; t < 30 * MIN_MS; t += 1000) if (log.listen(evening + t, 1000)) counted++;
    expect(counted).toBe(1);
    expect(log.shifts).toBe(1);
    // After midnight is still the same night…
    for (let t = 0; t < 15 * MIN_MS; t += 1000) log.listen(WED + DAY_MS + 3 * HOUR_MS + t, 1000);
    expect(log.shifts).toBe(1);
    // …but after 06:00 it's a new one.
    for (let t = 0; t < 11 * MIN_MS; t += 1000) log.listen(WED + DAY_MS + 7 * HOUR_MS + t, 1000);
    expect(log.shifts).toBe(2);
    // Listening on two nights that each fall short doesn't add up.
    const short = new ShiftLog(memory().persist, UTC);
    short.listen(WED + 5 * HOUR_MS, SHIFT_MIN_MS - 1000);
    short.listen(WED + 7 * HOUR_MS, SHIFT_MIN_MS - 1000);
    expect(short.shifts).toBe(0);
    // Persisted: a fresh log carries on where this one left off.
    log.save(WED + 2 * DAY_MS);
    const reloaded = new ShiftLog(memory(box.value).persist, UTC);
    expect(reloaded.shifts).toBe(2);
    expect(reloaded.tonightMs(WED + DAY_MS + 8 * HOUR_MS)).toBe(11 * MIN_MS);
    reloaded.listen(WED + DAY_MS + 9 * HOUR_MS, SHIFT_MIN_MS);
    expect(reloaded.shifts).toBe(2);
  });

  it('saves the tonight’s progress about every 30 s, and at once when it matters', () => {
    const { box, persist } = memory();
    const log = new ShiftLog(persist, UTC);
    const t0 = WED + 20 * HOUR_MS;
    for (let t = 0; t < 5 * MIN_MS; t += 250) log.listen(t0 + t, 250);
    expect(box.saves).toBeGreaterThanOrEqual(9);
    expect(box.saves).toBeLessThanOrEqual(12);
  });

  it('survives junk in storage', () => {
    expect(parseShiftState('nope')).toEqual({ count: 0, last: null, night: null, ms: 0 });
    expect(parseShiftState({ count: -3, last: 'x', night: 2.5, ms: NaN })).toEqual({ count: 0, last: null, night: null, ms: 0 });
    expect(parseShiftState({ count: 4, last: 20000, night: 20001, ms: 5000 })).toEqual({ count: 4, last: 20000, night: 20001, ms: 5000 });
  });

  it('drifts the heading further every shift, then settles after the Harbour', () => {
    expect(headingFor(0)).toBe(HEADING_BASE);
    let previous = headingFor(0);
    let previousStep = 0;
    for (let s = 1; s <= 7; s++) {
      const h = headingFor(s);
      expect(h).toBeGreaterThan(previous);
      // Further each time (the drift accelerates), give or take the jitter.
      if (s > 2) expect(h - previous).toBeGreaterThan(previousStep - 0.9);
      previousStep = h - previous;
      previous = h;
    }
    expect(headingFor(7) - HEADING_BASE).toBeGreaterThan(15);
    expect(headingFor(8)).toBe(headingFor(9));
    expect(headingFor(8)).toBe(headingFor(500));
    for (let s = 0; s < 20; s++) {
      expect(headingFor(s)).toBeGreaterThanOrEqual(0);
      expect(headingFor(s)).toBeLessThan(360);
      expect(headingFor(s)).toBe(headingFor(s)); // deterministic
    }
    expect(headingFor(-1)).toBe(HEADING_BASE);
  });

  it('keeps listening time per station with throttled writes', () => {
    const { box, persist } = memory({ 'void-beats': 5000, junk: 'x' });
    const log = new ListenLog(persist);
    expect(log.all).toEqual({ 'void-beats': 5000 });
    for (let t = 0; t <= 120_000; t += 250) log.add('void-beats', 250, t);
    expect(box.saves).toBe(4);
    log.add('moon-dub', 1000, 121_000);
    log.flush(121_000);
    expect(box.value).toEqual({ 'void-beats': 5000 + 250 * 481, 'moon-dub': 1000 });
    log.flush(122_000);
    expect(box.saves).toBe(5);
  });
});

// ── Arcs ──────────────────────────────────────────────────────────────────────

describe('HUSH’s off-course arc', () => {
  const ship = (extra: Partial<VoiceClip>) => ({ ...clip('_ship', 'ship', extra, 8) });
  const arc = (step: number) => ship({ arc: { id: 'off-course', step } });
  const pool = [ship({}), ship({ level: 1 }), ship({ kit: 'jam' }), ...[1, 2, 3, 4, 5, 6, 7, 8].map(arc)];
  const steps = (picks: (VoiceClip | undefined)[]) => picks.map((c) => c?.arc?.step);

  it('airs step n once, after n shifts, in order, never skipping ahead', () => {
    expect(dueArcClip(pool, 0, {})).toBeUndefined();
    expect(dueArcClip(pool, 1, {})?.arc?.step).toBe(1);
    expect(dueArcClip(pool, 1, { 'off-course': [1] })).toBeUndefined();
    // Five shifts in, nothing aired yet: step 1 first, then 2…
    expect(dueArcClip(pool, 5, {})?.arc?.step).toBe(1);
    expect(dueArcClip(pool, 5, { 'off-course': [1, 2] })?.arc?.step).toBe(3);
    expect(dueArcClip(pool, 5, { 'off-course': [1, 2, 3, 4, 5] })).toBeUndefined();
    expect(dueArcClip(pool, 8, { 'off-course': [1, 2, 3, 4, 5, 6, 7] })?.arc?.step).toBe(8);
  });

  it('puts the due step before anything else, and never airs arc or jam clips otherwise', () => {
    const picker = new HushPicker();
    const aired: Record<string, number[]> = { 'off-course': [] };
    const random = () => 0.5;
    const picks: (VoiceClip | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      const c = picker.pick(pool, 3, { date: '10-14', daypart: 'night', shifts: 2, aired }, random);
      picks.push(c);
      if (c?.arc) aired['off-course']!.push(c.arc.step);
    }
    expect(steps(picks).slice(0, 2)).toEqual([1, 2]);
    for (const c of picks.slice(2)) {
      expect(c?.arc).toBeUndefined();
      expect(isJamClip(c!)).toBe(false);
    }
    // Without shifts the arc never starts.
    const fresh = new HushPicker();
    for (let i = 0; i < 10; i++) expect(fresh.pick(pool, 3, { date: '10-14', daypart: 'night' }, Math.random)?.arc).toBeUndefined();
  });

  it('remembers aired steps', () => {
    let saved: unknown = null;
    const log = new ArcLog({ load: () => saved, save: (v) => (saved = v) });
    expect(log.mark('off-course', 2)).toBe(true);
    expect(log.mark('off-course', 1)).toBe(true);
    expect(log.mark('off-course', 2)).toBe(false);
    expect(new ArcLog({ load: () => saved, save: () => {} }).aired).toEqual({ 'off-course': [1, 2] });
    log.reset();
    expect(log.aired).toEqual({});
  });

  it('keeps weekday clips to their day', () => {
    const monday = ship({ days: [1] });
    const picker = new HushPicker();
    for (let i = 0; i < 10; i++) expect(picker.pick([ship({}), monday], 0, { date: '10-14', daypart: 'night', weekday: 3 }, Math.random)).not.toBe(monday);
    const picks = Array.from({ length: 3 }, () => new HushPicker().pick([ship({}), monday], 0, { date: '10-19', daypart: 'night', weekday: 1 }, () => 0.5));
    expect(picks).toContain(monday);
  });
});

// ── Manifests ─────────────────────────────────────────────────────────────────

describe('v4 manifest fields', () => {
  it('reads arcs and weekdays on clips, and days on shows', () => {
    const manifest = parseManifest({
      station: '_ship',
      clips: [
        { id: 'a', category: 'ship', url: '/a.mp3', durationMs: 4000, arc: { id: 'off-course', step: 3 }, days: [1, 1, 9, 0] },
        { id: 'b', category: 'ship', url: '/b.mp3', durationMs: 4000, arc: { id: 'off-course', step: 0 }, days: ['x'] },
      ],
    })!;
    expect(manifest.clips[0]!.arc).toEqual({ id: 'off-course', step: 3 });
    expect(manifest.clips[0]!.days).toEqual([0, 1]);
    expect(manifest.clips[1]!.arc).toBeUndefined();
    expect(manifest.clips[1]!.days).toBeUndefined();
    const index = parseShowIndex({ version: 1, shows: { 'end-lounge': [{ id: 'quiet-corner', name: 'Q', start: 2, end: 3, days: [0] }] } })!;
    expect(index.shows['end-lounge']![0]!.days).toEqual([0]);
  });
});

// ── The Convergence ───────────────────────────────────────────────────────────

describe('the Convergence', () => {
  it('happens every Saturday at 20:00 UTC for four to six minutes', () => {
    const day0 = Math.floor(WED / DAY_MS);
    const lengths = new Set<number>();
    for (let day = day0; day < day0 + 7 * 30; day++) {
      const c = convergenceOnDay(day);
      if (new Date(day * DAY_MS).getUTCDay() !== 6) {
        expect(c).toBeNull();
        continue;
      }
      expect(c).not.toBeNull();
      expect(new Date(c!.startMs).toISOString().slice(11, 16)).toBe('20:00');
      expect(c!.durationMs).toBeGreaterThanOrEqual(240_000);
      expect(c!.durationMs).toBeLessThanOrEqual(360_000);
      lengths.add(c!.durationMs);
      expect(eventsOnDay(day)).toContainEqual(c);
    }
    expect(lengths.size).toBeGreaterThan(5);
    expect(nextConvergence(WED).startMs).toBe(SAT + 20 * HOUR_MS);
    expect(nextConvergence(SAT + 20 * HOUR_MS).startMs).toBe(SAT + 7 * DAY_MS + 20 * HOUR_MS);
  });

  it('never overlaps the daily events (they move out of the way, or are dropped)', () => {
    const day0 = Math.floor(WED / DAY_MS);
    for (let day = day0; day < day0 + 7 * 104; day++) {
      const events = eventsOnDay(day);
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.startMs).toBeGreaterThanOrEqual(events[i - 1]!.startMs + events[i - 1]!.durationMs);
      }
      const c = events.find((e) => e.id === 'convergence');
      if (!c) continue;
      for (const e of events) {
        if (e === c) continue;
        const clear = 10 * MIN_MS;
        expect(e.startMs + e.durationMs <= c.startMs - clear || e.startMs >= c.startMs + c.durationMs + clear).toBe(true);
        expect(Math.floor(e.startMs / DAY_MS)).toBe(day);
      }
      expect(events.filter((e) => e.id !== 'convergence').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rotates its topic weekly through the six, in order', () => {
    const topics = Array.from({ length: 12 }, (_, i) => convergenceTopic(SAT + 20 * HOUR_MS + i * WEEK_MS));
    expect(new Set(topics.slice(0, 6)).size).toBe(6);
    expect(topics.slice(6)).toEqual(topics.slice(0, 6));
    const first = CONVERGENCE_TOPICS.indexOf(topics[0]!);
    expect(topics.slice(0, 6)).toEqual(CONVERGENCE_TOPICS.map((_, i) => CONVERGENCE_TOPICS[(first + i) % 6]));
    expect(convergenceTopic(SAT + 20 * HOUR_MS)).toBe(CONVERGENCE_TOPICS[Math.floor((SAT + 20 * HOUR_MS) / WEEK_MS) % 6]);
  });

  it('plans the open and the close for this week’s topic, with room for reactions between', () => {
    const c = convergenceOnDay(Math.floor(SAT / DAY_MS))!;
    const topic = convergenceTopic(c.startMs);
    const other = CONVERGENCE_TOPICS.find((t) => t !== topic)!;
    const ev = (extra: Partial<VoiceClip>, s = 8) => clip('_events', 'event', { event: 'convergence', ...extra }, s);
    const pool = [
      ev({ kit: topic, part: 'open' }),
      ev({ kit: topic, part: 'close' }),
      ev({ kit: other, part: 'open' }),
      ev({ kit: other, part: 'close' }),
      clip('_events', 'event', { event: 'the-hum' }),
    ];
    const plan = planEvent(c, pool);
    expect(plan.clips.map((p) => [p.clip.kit, p.clip.part])).toEqual([
      [topic, 'open'],
      [topic, 'close'],
    ]);
    expect(plan.base).toBe(1);
    expect(plan.convergence?.topic).toBe(topic);
    const [open, close] = plan.clips as [(typeof plan.clips)[0], (typeof plan.clips)[0]];
    expect(open.startMs).toBeGreaterThanOrEqual(c.startMs);
    expect(plan.convergence!.fromMs).toBeGreaterThanOrEqual(open.startMs + open.clip.durationMs);
    expect(plan.convergence!.toMs).toBeLessThanOrEqual(close.startMs);
    expect(plan.convergence!.toMs - plan.convergence!.fromMs).toBeGreaterThan(3 * MIN_MS);
    expect(close.startMs + close.clip.durationMs).toBeLessThanOrEqual(c.startMs + c.durationMs);
    // No clips: still a window, just no open or close.
    expect(planEvent(c, []).clips).toEqual([]);
    expect(planEvent(c, []).convergence?.topic).toBe(topic);

    // Each station's own reaction to the topic, if it has one.
    const mine = [clip('void-beats', 'event', { event: 'convergence', kit: topic }), clip('void-beats', 'event', { event: 'convergence', kit: other }), clip('void-beats', 'dj')];
    expect(convergenceReaction(mine, topic, c.startMs)).toBe(mine[0]);
    expect(convergenceReaction(mine.slice(1), topic, c.startMs)).toBeUndefined();
  });

  it('keeps convergence clips out of every station’s normal rotation', () => {
    const s = station('void-beats');
    const reactions = CONVERGENCE_TOPICS.map((t) => clip(s.id, 'event', { event: 'convergence', kit: t }, 10));
    const own = [...reactions, ...many(20, () => clip(s.id, 'dj', {}, 15)), ...many(4, () => clip(s.id, 'id', {}, 4))];
    const shared = [clip('_shared', 'event', { event: 'convergence', kit: 'the-smell', part: 'body' }), ...many(6, () => clip('_shared', 'ad', {}, 30))];
    const schedule = new StationSchedule(s, { own, shared }, { tzOffset: UTC });
    const segments = voices(schedule.segmentsBetween(SAT, SAT + DAY_MS));
    expect(segments.length).toBeGreaterThan(50);
    expect(segments.some((x) => x.clip.event)).toBe(false);
  });
});

// ── Weekdays and full moons in the schedule ───────────────────────────────────

describe('weekdays and the moon', () => {
  it('runs Greg’s show on Sundays 02–03 only, and Monday clips only on Mondays', () => {
    const lounge = station('end-lounge');
    const greg: ShowDef = { id: 'quiet-corner', name: 'The Quiet Corner with Greg', blurb: '', start: 2, end: 3, days: [0] };
    const opener = clip(lounge.id, 'id', { show: 'quiet-corner', part: 'open' }, 6);
    const gregLinks = many(4, () => clip(lounge.id, 'dj', { show: 'quiet-corner' }, 15));
    const review = clip(lounge.id, 'dj', { days: [1] }, 14);
    const own = [opener, ...gregLinks, review, ...many(20, () => clip(lounge.id, 'dj', {}, 15)), ...many(4, () => clip(lounge.id, 'id', {}, 4))];
    const schedule = new StationSchedule(lounge, { own, shared: [], shows: [greg] }, { tzOffset: UTC });
    expect(schedule.showAt(SUN + 2.5 * HOUR_MS)).toBe(greg);
    expect(schedule.showAt(SAT + 2.5 * HOUR_MS)).toBeNull();
    expect(schedule.showAt(MON + 2.5 * HOUR_MS)).toBeNull();
    const week = voices(schedule.segmentsBetween(WED, WED + 7 * DAY_MS));
    const openers = week.filter((s) => s.clip === opener);
    expect(openers.map((s) => s.startMs)).toEqual([SUN + 2 * HOUR_MS]);
    for (const s of week.filter((x) => x.clip.show === 'quiet-corner')) {
      expect(s.startMs).toBeGreaterThanOrEqual(SUN + 2 * HOUR_MS);
      expect(s.startMs).toBeLessThan(SUN + 3 * HOUR_MS);
    }
    const reviews = week.filter((s) => s.clip === review);
    expect(reviews.length).toBeGreaterThan(0);
    for (const s of reviews) expect(localTime(s.startMs, UTC).weekday).toBe(1);
  });

  it('computes the moon', () => {
    // Full moons: 2024-10-17 11:26 UTC, 2025-01-13 22:27 UTC, 2026-10-26 04:12 UTC.
    for (const ms of [Date.UTC(2024, 9, 17, 11, 26), Date.UTC(2025, 0, 13, 22, 27), Date.UTC(2026, 9, 26, 4, 12)]) {
      expect(moonIllumination(ms)).toBeGreaterThan(0.98);
    }
    // New moons: 2024-11-01 12:47 UTC, 2026-10-10 15:50 UTC.
    for (const ms of [Date.UTC(2024, 10, 1, 12, 47), Date.UTC(2026, 9, 10, 15, 50)]) expect(moonIllumination(ms)).toBeLessThan(0.02);
    // Two to four full-moon nights a month.
    const first = nightOf(Date.UTC(2026, 0, 1), UTC);
    let nights = 0;
    for (let night = first; night < first + 365; night++) if (fullMoonNight(night, UTC)) nights++;
    expect(nights).toBeGreaterThanOrEqual(12 * 2);
    expect(nights).toBeLessThanOrEqual(13 * 4);
    expect(fullMoonNight(nightOf(Date.UTC(2026, 9, 25, 23), UTC), UTC)).toBe(true);
    expect(fullMoonNight(nightOf(Date.UTC(2026, 9, 18, 23), UTC), UTC)).toBe(false);
  });

  it('airs Moon Dub’s full-moon clips only on full-moon nights, and prefers them then', () => {
    const dub = station('moon-dub');
    const full = many(3, () => clip(dub.id, 'dj', { kit: 'full-moon' }, 15));
    const own = [...full, ...many(20, () => clip(dub.id, 'dj', {}, 15)), ...many(4, () => clip(dub.id, 'id', {}, 4))];
    const schedule = new StationSchedule(dub, { own, shared: [] }, { tzOffset: UTC });
    const fullNight = Date.UTC(2026, 9, 25, 18);
    const onFull = voices(schedule.segmentsBetween(fullNight, fullNight + 10 * HOUR_MS)).filter((s) => full.includes(s.clip));
    expect(onFull.length).toBeGreaterThanOrEqual(3);
    for (const s of onFull) expect(fullMoonNight(nightOf(s.startMs, UTC), UTC)).toBe(true);
    const quiet = Date.UTC(2026, 9, 17, 18);
    expect(voices(schedule.segmentsBetween(quiet, quiet + 2 * DAY_MS)).some((s) => full.includes(s.clip))).toBe(false);
  });
});

// ── Station quirks ────────────────────────────────────────────────────────────

describe('station quirks', () => {
  it('finds the local minutes ending in 8, whatever the offset', () => {
    expect(eightsInHour(WED, UTC).map((ms) => ms / MIN_MS)).toEqual([8, 18, 28, 38, 48, 58]);
    expect(eightsInHour(WED, fixedTzOffset(330)).map((ms) => ms / MIN_MS)).toEqual([8, 18, 28, 38, 48, 58]);
    expect(eightsInHour(WED, fixedTzOffset(345)).map((ms) => ms / MIN_MS)).toEqual([3, 13, 23, 33, 43, 53]);
  });

  it('airs Traffic on the 8s’ reports at the slot nearest every :x8, and nowhere else', () => {
    const traffic = station('traffic-on-the-8s');
    const tz = fixedTzOffset(-300);
    const own = [
      ...many(3, () => clip(traffic.id, 'weather', { kit: 'traffic', part: 'open' }, 4)),
      ...many(14, () => clip(traffic.id, 'weather', { kit: 'traffic', part: 'body' }, 14)),
      ...many(3, () => clip(traffic.id, 'weather', { kit: 'traffic', part: 'close' }, 4)),
      ...many(6, () => clip(traffic.id, 'weather', {}, 20)),
      ...many(20, () => clip(traffic.id, 'news', {}, 30)),
      ...many(15, () => clip(traffic.id, 'dj', {}, 20)),
      ...many(10, () => clip(traffic.id, 'call', {}, 60)),
      ...many(5, () => clip(traffic.id, 'id', {}, 4)),
    ];
    const schedule = new StationSchedule(traffic, { own, shared: [many(1, () => clip('_shared', 'weather', {}, 20))[0]!] }, { tzOffset: tz });
    const from = WED + 10 * HOUR_MS;
    const segments = voices(schedule.segmentsBetween(from, from + 6 * HOUR_MS));
    // Reports: the first weather part of each run of weather segments.
    const reports = segments.filter((s, i) => s.clip.category === 'weather' && segments[i - 1]?.clip.category !== 'weather');
    const marks: number[] = [];
    for (let h = 0; h < 6; h++) for (const ms of eightsInHour(from + h * HOUR_MS, tz)) marks.push(from + h * HOUR_MS + ms);
    expect(reports.length).toBeGreaterThanOrEqual(marks.length - 2);
    expect(reports.length).toBeLessThanOrEqual(marks.length);
    const offsets = reports.map((r) => Math.min(...marks.map((m) => Math.abs(r.startMs - m))));
    for (const o of offsets) expect(o).toBeLessThan(3 * MIN_MS);
    expect(offsets.reduce((a, b) => a + b, 0) / offsets.length).toBeLessThan(45 * SEC);
    // Its weather is the traffic: never shared forecasts.
    expect(segments.some((s) => s.clip.url.startsWith('/voice/_shared/'))).toBe(false);
  });

  it('slows the afterparty through the night and brings it back at dawn', () => {
    expect(afterpartyBpm(12 * 60)).toBe(AFTERPARTY_BPM.day);
    expect(afterpartyBpm(18 * 60)).toBe(124);
    expect(afterpartyBpm(5 * 60)).toBe(100);
    expect(afterpartyBpm(6 * 60)).toBe(112);
    expect(afterpartyBpm(7 * 60)).toBe(124);
    let previous = afterpartyBpm(18 * 60);
    for (let m = 18 * 60 + 30; m < 29 * 60; m += 30) {
      const bpm = afterpartyBpm(m % 1440);
      expect(bpm).toBeLessThanOrEqual(previous);
      previous = bpm;
    }
    const party = station('heat-death-afterparty');
    const tz = fixedTzOffset(60);
    expect(tweaksAt(party, WED + 22 * HOUR_MS, tz)?.bpm).toBe(afterpartyBpm(23 * 60));
    expect(tweaksAt(station('void-beats'), WED, tz)).toBe(station('void-beats').tweaks);
    // The music engine is told.
    const schedule = new StationSchedule(party, [], { tzOffset: tz });
    const runs = schedule.runsBetween(WED + 2 * HOUR_MS, WED + 4 * HOUR_MS);
    expect(runs.length).toBeGreaterThan(5);
    for (const r of runs) {
      const local = localTime(r.startMs, tz);
      expect(r.tweaks?.bpm).toBe(afterpartyBpm(local.minuteOfDay));
      expect(r.tweaks!.bpm!).toBeLessThan(AFTERPARTY_BPM.day);
    }
  });
});

// ── Requests from the writers ─────────────────────────────────────────────────

describe('v4 content conventions', () => {
  it('keeps Greg nearly inaudible in his own show (his host’s open and close stay normal)', () => {
    const greg = clip('end-lounge', 'dj', { show: 'the-quiet-corner', lines: [{ speaker: 'Greg, a Shadow', text: 'Hello.', startMs: 0 }] });
    const open = clip('end-lounge', 'id', { show: 'the-quiet-corner', part: 'open', lines: [{ speaker: 'Barnaby', text: 'Lean in.', startMs: 0 }] });
    const elsewhere = clip('end-lounge', 'dj', { lines: [{ speaker: 'Greg, a Shadow', text: 'Hi.', startMs: 0 }] });
    expect(voiceGain(greg)).toBe(GREG_GAIN);
    expect(20 * Math.log10(GREG_GAIN)).toBeCloseTo(-11, 5);
    expect(voiceGain(open)).toBe(1);
    expect(voiceGain(elsewhere)).toBe(1);
  });

  it('gives heading notices from the first shift, and holds arc steps that must wait', () => {
    const ship = (extra: Partial<VoiceClip>) => clip('_ship', 'ship', extra, 6);
    const heading = ship({ kit: 'heading' });
    const plain = ship({ kit: 'outer-band' });
    const before = new Set(Array.from({ length: 12 }, () => new HushPicker().pick([heading, plain], 0, { date: '10-14', daypart: 'night', shifts: 0 }, Math.random)));
    expect([...before]).toEqual([plain]);
    const after = new Set(Array.from({ length: 30 }, () => new HushPicker().pick([heading, plain], 0, { date: '10-14', daypart: 'night', shifts: 1 }, Math.random)));
    expect(after.has(heading)).toBe(true);
    // Step 8 waits for The Harbour.
    const steps = [7, 8].map((step) => ship({ arc: { id: 'off-course', step } }));
    const aired = { 'off-course': [1, 2, 3, 4, 5, 6, 7] };
    const hold = (arc: { step: number }) => arc.step > 7;
    expect(dueArcClip(steps, 9, aired, Math.random, hold)).toBeUndefined();
    expect(dueArcClip(steps, 9, aired, Math.random, () => false)).toBe(steps[1]);
  });

  it('keeps a secret’s first-visit welcome out of its rotation', () => {
    const listening = station('something-listening');
    const noticed = clip(listening.id, 'dj', { id: 'noticed' }, 10);
    const found = clip('the-switchboard', 'dj', { id: 'found-1' }, 10);
    expect(isWelcomeClip(listening.id, noticed)).toBe(true);
    expect(isWelcomeClip('the-switchboard', found)).toBe(true);
    expect(isWelcomeClip('void-beats', found)).toBe(false);
    const own = [noticed, ...many(8, () => clip(listening.id, 'dj', {}, 20)), ...many(3, () => clip(listening.id, 'id', {}, 5))];
    const schedule = new StationSchedule(listening, { own, shared: [] }, { tzOffset: UTC });
    const segments = voices(schedule.segmentsBetween(WED, WED + 2 * DAY_MS));
    expect(segments.length).toBeGreaterThan(10);
    expect(segments.some((x) => x.clip === noticed)).toBe(false);
  });

  it('opens a show on the dot, even where the local hour falls mid-way through a UTC hour', () => {
    const velvet = station('velvet-collapse');
    const collapse: ShowDef = { id: 'the-collapse', name: 'The Collapse', blurb: '', start: 4, end: 6 };
    const supernova = clip(velvet.id, 'id', { show: 'the-collapse', part: 'open' }, 12);
    const own = [supernova, ...many(10, () => clip(velvet.id, 'dj', {}, 15)), ...many(4, () => clip(velvet.id, 'id', {}, 4))];
    for (const minutes of [0, 330, -570, 345]) {
      const tz = fixedTzOffset(minutes);
      const schedule = new StationSchedule(velvet, { own, shared: [], shows: [collapse] }, { tzOffset: tz });
      const openers = voices(schedule.segmentsBetween(WED, WED + 3 * DAY_MS)).filter((x) => x.clip === supernova);
      expect(openers.length).toBeGreaterThanOrEqual(2);
      for (const o of openers) {
        const local = localTime(o.startMs, tz);
        expect(local.minuteOfDay).toBe(4 * 60);
        expect(o.startMs % MIN_MS).toBe(0);
      }
    }
  });
});

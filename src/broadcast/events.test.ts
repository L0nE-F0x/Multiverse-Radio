import { afterEach, describe, expect, it } from 'vitest';
import { eventAt, eventsBetween, eventsOnDay, makeEvent, nextEvent, planEvent } from './events';
import { HushPicker, hushLevel } from './hush';
import { DAY_MS } from './time';
import { EVENT_IDS, type EventId, type VoiceClip } from './types';

const DAY0 = Date.UTC(2026, 9, 12) / DAY_MS;
/** Node's environment (TZ changes take effect immediately). */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const MIN = 60_000;

function clip(id: string, extra: Partial<VoiceClip> = {}, seconds = 12): VoiceClip {
  return {
    id,
    category: 'event',
    url: `/voice/_events/${id}.mp3`,
    durationMs: seconds * 1000,
    overMusic: true,
    lines: [{ speaker: 'Someone', text: id, startMs: 0 }],
    ...extra,
  };
}

describe('multiverse events', () => {
  const tz = env.TZ;
  afterEach(() => {
    env.TZ = tz;
  });

  it('schedules three to five a day, a minute or three each, never overlapping', () => {
    let previousEnd = -Infinity;
    const seen = new Set<EventId>();
    for (let day = DAY0; day < DAY0 + 60; day++) {
      const events = eventsOnDay(day);
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.length).toBeLessThanOrEqual(5);
      for (const e of events) {
        expect(e.startMs).toBeGreaterThanOrEqual(previousEnd);
        expect(e.durationMs).toBeGreaterThanOrEqual(50_000);
        expect(e.durationMs).toBeLessThanOrEqual(180_000);
        expect(Math.floor(e.startMs / DAY_MS)).toBe(day);
        expect(Math.floor((e.startMs + e.durationMs) / DAY_MS)).toBe(day);
        expect(EVENT_IDS).toContain(e.id);
        expect(e.name.length).toBeGreaterThan(0);
        previousEnd = e.startMs + e.durationMs;
        seen.add(e.id);
      }
    }
    // The Convergence is weekly at a fixed time, not part of the daily draw.
    expect(seen.size).toBe(EVENT_IDS.filter((e) => e !== 'convergence').length);
  });

  it('happens at the same instant for everyone, whatever their time zone', () => {
    const at = (ms: number) => JSON.stringify([eventAt(ms), nextEvent(ms), eventsOnDay(Math.floor(ms / DAY_MS))]);
    const moments = [0, 1, 2, 3].map((i) => DAY0 * DAY_MS + i * 6.1 * 3_600_000);
    env.TZ = 'UTC';
    const utc = moments.map(at);
    env.TZ = 'Asia/Kolkata';
    expect(moments.map(at)).toEqual(utc);
    env.TZ = 'America/Los_Angeles';
    expect(moments.map(at)).toEqual(utc);
  });

  it('finds the event in progress and the next one', () => {
    const [first, second] = eventsOnDay(DAY0);
    expect(eventAt(first!.startMs - 1)).toBeNull();
    expect(eventAt(first!.startMs)).toEqual(first);
    expect(eventAt(first!.startMs + first!.durationMs - 1)).toEqual(first);
    expect(eventAt(first!.startMs + first!.durationMs)).toBeNull();
    expect(nextEvent(first!.startMs)).toEqual(second);
    expect(eventsBetween(DAY0 * DAY_MS, (DAY0 + 1) * DAY_MS)).toEqual(eventsOnDay(DAY0));
  });

  it('plans event clips in order inside the event', () => {
    const pool = [
      clip('storm-open', { event: 'dimensional-storm', part: 'open' }, 6),
      clip('storm-a', { event: 'dimensional-storm' }, 20),
      clip('storm-b', { event: 'dimensional-storm' }, 25),
      clip('storm-c', { event: 'dimensional-storm' }, 30),
      clip('storm-close', { event: 'dimensional-storm', part: 'close' }, 5),
      clip('hum-a', { event: 'the-hum' }, 10),
      clip('swap-void', { event: 'station-swap', stations: ['void-beats'] }, 10),
    ];
    const storm = makeEvent('dimensional-storm', 1_000_000, 150_000);
    const plan = planEvent(storm, pool);
    expect(plan).toEqual(planEvent(storm, pool));
    expect(plan.clips.length).toBeGreaterThanOrEqual(2);
    expect(plan.clips.length).toBeLessThanOrEqual(3);
    expect(plan.clips[0]!.clip.id).toBe('storm-open');
    expect(plan.clips[plan.clips.length - 1]!.clip.id).toBe('storm-close');
    let t = storm.startMs;
    for (const { clip: c, startMs } of plan.clips) {
      expect(c.event).toBe('dimensional-storm');
      expect(startMs).toBeGreaterThanOrEqual(t);
      t = startMs + c.durationMs;
    }
    expect(t).toBeLessThanOrEqual(storm.startMs + storm.durationMs);
    expect(plan.slip).toBeNull();
    expect(plan.base).toBe(1);

    // Clips that name their stations air only there.
    const swap = makeEvent('station-swap', 2_000_000);
    expect(planEvent(swap, pool, 'void-beats').clips.map((c) => c.clip.id)).toEqual(['swap-void']);
    expect(planEvent(swap, pool, 'moon-dub').clips).toEqual([]);
    // Signal from beyond takes the station over.
    expect(planEvent(makeEvent('signal-from-beyond', 0), pool).base).toBe(0);
  });

  it('replays the last thirty seconds during a time slip, then lets the hosts react', () => {
    const pool = [clip('slip-a', { event: 'time-slip' }, 8)];
    const slip = makeEvent('time-slip', 5_000_000, 90_000);
    const plan = planEvent(slip, pool);
    expect(plan.slip).not.toBeNull();
    expect(plan.slip!.shiftMs).toBe(-30_000);
    expect(plan.slip!.fromMs).toBe(slip.startMs);
    expect(plan.slip!.toMs - plan.slip!.fromMs).toBeGreaterThanOrEqual(30_000);
    expect(plan.clips[0]!.startMs).toBeGreaterThan(plan.slip!.toMs);
    expect(plan.clips[0]!.startMs + 8000).toBeLessThanOrEqual(slip.startMs + slip.durationMs);
    // Without clips the whole event is the replay.
    expect(planEvent(slip, []).slip!.toMs).toBe(slip.startMs + slip.durationMs);
  });
});

describe('HUSH', () => {
  it('unlocks stranger notices as the shift goes on', () => {
    expect(hushLevel(0)).toBe(0);
    expect(hushLevel(44 * MIN)).toBe(0);
    expect(hushLevel(45 * MIN)).toBe(1);
    expect(hushLevel(119 * MIN)).toBe(1);
    expect(hushLevel(120 * MIN)).toBe(2);
    expect(hushLevel(240 * MIN)).toBe(3);
    expect(hushLevel(10 * 60 * MIN)).toBe(3);
  });

  it('never says anything above the level, prefers the unheard, and keeps dates', () => {
    const pool = [0, 0, 0, 1, 1, 2, 3].map((level, i) => ({ ...clip(`ship-${i}`), category: 'ship' as const, level }));
    pool.push({ ...clip('ship-halloween'), category: 'ship', level: 0, dates: ['10-31'] });
    const picker = new HushPicker();
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const context = { date: '10-12', daypart: 'night' as const };
    const first = new Set<string>();
    for (let i = 0; i < 3; i++) first.add(picker.pick(pool, 0, context, random)!.id);
    expect([...first].sort()).toEqual(['ship-0', 'ship-1', 'ship-2']);
    for (let i = 0; i < 20; i++) {
      const c = picker.pick(pool, 1, context, random)!;
      expect(c.level).toBeLessThanOrEqual(1);
      expect(c.id).not.toBe('ship-halloween');
    }
    expect(new HushPicker().pick(pool, 0, { date: '10-31', daypart: 'night' }, () => 0.99)).toBeDefined();
    const halloween = new HushPicker();
    const picks = Array.from({ length: 4 }, () => halloween.pick(pool, 0, { date: '10-31', daypart: 'night' }, random)!.id);
    expect(picks).toContain('ship-halloween');
  });
});

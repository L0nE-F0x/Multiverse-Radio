import { describe, expect, it } from 'vitest';
import { barAt, eventsFrom, fitForm, Grid, planSections, sectionAt, type NoteEvent } from './score';
import { Rng, rngFor } from './rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.u32()).toBe(b.u32());
  });

  it('gives independent labelled streams regardless of consumption order', () => {
    const a = new Rng(7);
    a.next();
    a.next();
    const b = new Rng(7);
    expect(a.fork('drums').u32()).toBe(b.fork('drums').u32());
    expect(rngFor(7, 'x').u32()).not.toBe(rngFor(7, 'y').u32());
  });

  it('stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('form fitting', () => {
  it('fills the duration exactly with whole bars plus a tail', () => {
    for (const duration of [20, 95, 150, 180, 241, 600]) {
      for (const bpm of [62, 78, 96, 128]) {
        const fit = fitForm(duration, bpm, 4, 3);
        expect(fit.bars * fit.barDur + fit.tail).toBeCloseTo(duration, 6);
        expect(fit.tail).toBeGreaterThanOrEqual(0);
        expect(Math.abs(fit.bpm / bpm - 1)).toBeLessThanOrEqual(0.0601);
      }
    }
  });

  it('plans contiguous sections covering every bar', () => {
    for (const bars of [1, 3, 6, 12, 17, 33, 64, 120]) {
      const plan = planSections(bars, { intro: 4, outro: 4, unit: 8, pattern: ['A', 'B'] });
      let next = 0;
      for (const s of plan) {
        expect(s.startBar).toBe(next);
        expect(s.bars).toBeGreaterThan(0);
        next += s.bars;
      }
      expect(next).toBe(bars);
    }
  });

  it('names repeats with primes', () => {
    const plan = planSections(48, { intro: 4, outro: 4, unit: 8, pattern: ['A', 'B'] });
    expect(plan.map((s) => s.name)).toEqual(['intro', 'A', 'B', 'A′', 'B′', 'A″', 'outro']);
  });
});

describe('offset and bar math', () => {
  const score = { barDur: 2, bars: 10, sections: [{ name: 'A', startBar: 0, bars: 5, t: 0, chords: [] }, { name: 'B', startBar: 5, bars: 5, t: 10, chords: [] }] };

  it('finds the bar and section containing a time', () => {
    expect(barAt(score, 0)).toBe(0);
    expect(barAt(score, 3.99)).toBe(1);
    expect(barAt(score, 4)).toBe(2);
    expect(barAt(score, 999)).toBe(9);
    expect(sectionAt(score, 9.9)?.name).toBe('A');
    expect(sectionAt(score, 10)?.name).toBe('B');
  });

  it('joins mid-bar: keeps held notes, drops finished ones', () => {
    const ev = (t: number, d: number): NoteEvent => ({ t, d, i: 0, p: 60, v: 0.5 });
    const events = [ev(0, 1), ev(4, 3), ev(4.5, 0.2), ev(5.2, 0.5), ev(6, 1), ev(7, 1)];
    const joined = eventsFrom(events, barAt(score, 5) * 2, 5);
    // ev(4,3) is still sounding at 5 s; ev(4.5,0.2) finished; later notes all play.
    expect(joined).toEqual([ev(4, 3), ev(5.2, 0.5), ev(6, 1), ev(7, 1)]);
  });

  it('swings offbeat sixteenths only', () => {
    const g = new Grid(2, 4, 0.6, 4);
    expect(g.step(0, 0)).toBeCloseTo(0);
    expect(g.step(0, 2)).toBeCloseTo(0.25);
    // Straight 16th would be 0.125; at 60% swing it lands at 0.15.
    expect(g.step(0, 1)).toBeCloseTo(0.15);
    expect(g.step(1, 4)).toBeCloseTo(2.5);
  });
});

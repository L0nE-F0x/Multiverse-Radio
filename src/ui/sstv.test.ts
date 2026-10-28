import { describe, expect, it, vi } from 'vitest';
import { useBroadcast } from '../broadcast/store';
import { cycleScopeMode, setScopeMode, useScopeMode } from '../components/Scope';
import { readBroadcastSceneState } from '../components/Viewport';
import * as act from './actions';
import {
  clueForTarget,
  drawGlyphText,
  GLYPHS,
  renderSstvCard,
  SECRET_CLUES,
  SSTV_HEIGHT,
  SSTV_LEVELS,
  SSTV_WIDTH,
} from './sstv';
import { ui } from './store';

describe('SSTV slow-scan telemetry generator', () => {
  it('generates deterministic 64x48 4-level phosphor frames', () => {
    const target = { id: 'void-beats', frequency: 88.4, kind: 'station' as const };
    const cardA = renderSstvCard(target, 0);
    const cardB = renderSstvCard(target, 0);

    expect(cardA.width).toBe(64);
    expect(cardA.height).toBe(48);
    expect(cardA.pixels).toBeInstanceOf(Float32Array);
    expect(cardA.pixels.length).toBe(64 * 48);
    expect(Array.from(cardA.pixels)).toEqual(Array.from(cardB.pixels));
    expect(cardA.header).toBe(cardB.header);
    expect(cardA.clue).toBe(cardB.clue);

    // Every pixel must use one of the 4 discrete phosphor levels in 0..1.
    const allowed = new Set<number>(SSTV_LEVELS);
    const seen = new Set<number>();
    for (const v of cardA.pixels) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      const matched = [...allowed].some((lvl) => Math.abs(lvl - v) < 1e-5);
      expect(matched).toBe(true);
      seen.add(Math.round(v * 100) / 100);
    }
    // Frame uses all 4 phosphor levels (background, dim graticule, mid trace, peak).
    expect(seen.size).toBe(4);
  });

  it('includes a complete 3x5 bitmap glyph table and renders crisp text into pixels', () => {
    const required = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:>';
    for (const ch of required) {
      const glyph = GLYPHS[ch];
      expect(glyph, `missing glyph for ${ch}`).toBeDefined();
      expect(glyph).toHaveLength(5);
      for (const row of glyph!) {
        expect(row).toHaveLength(3);
      }
    }

    const buf = new Float32Array(SSTV_WIDTH * SSTV_HEIGHT);
    const endX = drawGlyphText(buf, 2, 2, 'SWB 97.8>89.3>114.8', 1);
    expect(endX).toBeLessThanOrEqual(SSTV_WIDTH);

    let litCount = 0;
    for (let y = 2; y < 7; y++) {
      for (let x = 0; x < SSTV_WIDTH; x++) {
        if (buf[y * SSTV_WIDTH + x]! > 0) litCount++;
      }
    }
    expect(litCount).toBeGreaterThan(60);
  });

  it('embeds actionable secret frequency clues across stations, oddities, and secrets', () => {
    const cases: Array<{ id: string; frequency: number; kind: 'station' | 'pirate' | 'oddity' | 'static'; expected: string }> = [
      { id: 'ask-grenda', frequency: 97.8, kind: 'station', expected: 'SWB 97.8>89.3>114.8' },
      { id: 'the-switchboard', frequency: 131.1, kind: 'station', expected: 'SWB 97.8>89.3>114.8' },
      { id: 'time-signal', frequency: 100.0, kind: 'oddity', expected: 'MIN 133.3 @ 03:33' },
      { id: 'minute-between', frequency: 133.3, kind: 'station', expected: 'MIN 133.3 @ 03:33' },
      { id: 'free-frequency', frequency: 108.85, kind: 'station', expected: 'HRB 140.0 SHIFT 7' },
      { id: 'the-harbour', frequency: 140.0, kind: 'station', expected: 'HRB 140.0 SHIFT 7' },
      { id: 'static-lullabies', frequency: 87.7, kind: 'station', expected: 'IDLE 144.4 3MIN' },
      { id: 'something-listening', frequency: 144.4, kind: 'station', expected: 'IDLE 144.4 3MIN' },
      { id: 'numbers-omega', frequency: 106.6, kind: 'station', expected: 'TX0 76.0 MHZ' },
      { id: 'transmission-zero', frequency: 76.0, kind: 'station', expected: 'TX0 76.0 MHZ' },
      { id: 'distress-beacon', frequency: 121.5, kind: 'oddity', expected: 'LGT 121.5 MHZ' },
      { id: 'last-lighthouse', frequency: 121.5, kind: 'station', expected: 'LGT 121.5 MHZ' },
      { id: 'void-beats', frequency: 88.4, kind: 'station', expected: 'HUSH 99.15 MHZ' },
      { id: 'hush-after-hours', frequency: 99.15, kind: 'station', expected: 'HUSH 99.15 MHZ' },
    ];

    for (const c of cases) {
      const card = renderSstvCard({ id: c.id, frequency: c.frequency, kind: c.kind });
      expect(card.clue).toBe(c.expected);
      expect(clueForTarget({ id: c.id, frequency: c.frequency, kind: c.kind })).toBe(c.expected);

      // Verify bottom clue bar (y = 41..45) has lit glyph pixels.
      let bottomLit = 0;
      for (let y = 41; y <= 45; y++) {
        for (let x = 1; x < SSTV_WIDTH - 1; x++) {
          if (card.pixels[y * SSTV_WIDTH + x]! >= 0.9) bottomLit++;
        }
      }
      expect(bottomLit).toBeGreaterThan(35);
    }

    // Every canonical secret clue is represented.
    expect(SECRET_CLUES).toHaveLength(7);
  });

  it('produces distinct procedural graphics for different stations and targets', () => {
    const lighthouse = renderSstvCard({ id: 'last-lighthouse', frequency: 121.5, kind: 'station', secret: true });
    const switchboard = renderSstvCard({ id: 'the-switchboard', frequency: 131.1, kind: 'station', secret: true });
    const numbers = renderSstvCard({ id: 'numbers-omega', frequency: 106.6, kind: 'station' });
    const pirate = renderSstvCard({ id: 'pirate-82.45', frequency: 82.45, kind: 'pirate' });
    const stat = renderSstvCard({ id: 'static', frequency: 150.0, kind: 'static' });

    const sliceViewport = (pixels: Float32Array) => Array.from(pixels.subarray(9 * 64, 39 * 64));
    expect(sliceViewport(lighthouse.pixels)).not.toEqual(sliceViewport(switchboard.pixels));
    expect(sliceViewport(switchboard.pixels)).not.toEqual(sliceViewport(numbers.pixels));
    expect(sliceViewport(numbers.pixels)).not.toEqual(sliceViewport(pirate.pixels));
    expect(sliceViewport(pirate.pixels)).not.toEqual(sliceViewport(stat.pixels));
  });

  it('cycles Scope modes WAVE -> FALL -> SSTV and triggers UI actions & toasts', () => {
    expect(typeof useScopeMode).toBe('function');
    setScopeMode('wave');
    expect(ui().scopeMode).toBe('wave');

    expect(cycleScopeMode()).toBe('fall');
    expect(ui().scopeMode).toBe('fall');
    expect(cycleScopeMode()).toBe('sstv');
    expect(ui().scopeMode).toBe('sstv');
    expect(cycleScopeMode()).toBe('wave');

    expect(act.cycleScope()).toBe('fall');
    expect(ui().toast?.text).toContain('FALL');

    const pingSpy = vi.fn();
    const cabinSpy = vi.fn();
    useBroadcast.setState({ sendPing: pingSpy, toggleCabin: cabinSpy, cabin: 0 });

    act.toggleCabin();
    expect(cabinSpy).toHaveBeenCalledTimes(1);
    expect(ui().toast?.text).toBe('Cabin ambience on.');

    act.sendPing('Signal locked', 'LOCK');
    expect(pingSpy).toHaveBeenCalledWith('Signal locked', 'LOCK');
    expect(ui().toast?.text).toBe('Subspace ping transmitted.');
  });

  it('constructs live BroadcastSceneState for Viewport scene reactivity', () => {
    useBroadcast.setState({
      status: 'playing',
      signal: 0.92,
      bleed: 0.18,
      musicSection: 'drop',
      musicSectionProgress: 0.64,
      caption: { speaker: 'Grenda', text: 'Caller on line four, go ahead.' },
    });

    const b = readBroadcastSceneState();
    expect(b.signal).toBeCloseTo(0.92, 2);
    expect(b.bleed).toBeCloseTo(0.18, 2);
    expect(b.section).toBe('drop');
    expect(b.sectionProgress).toBeCloseTo(0.64, 2);
    expect(b.speech).toBeGreaterThan(0);
    expect(b.hush).toBe(false);
  });
});

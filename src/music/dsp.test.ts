import { describe, expect, it } from 'vitest';
import { PATCHES } from './dsp/patches';
import { renderSynthZone, SYNTHS } from './dsp/synths';
import { midiToFreq } from './theory';

/** Fundamental period by autocorrelation over a steady stretch of the signal. */
function pitchOf(data: Float32Array, sr: number, from: number, expected: number): number {
  const start = Math.floor(from * sr);
  const len = Math.floor(0.12 * sr);
  const minLag = Math.floor(sr / (expected * 1.5));
  const maxLag = Math.ceil(sr / (expected / 1.5));
  let best = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < len; i++) s += data[start + i]! * data[start + i + lag]!;
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  // Parabolic refinement.
  const score = (lag: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += data[start + i]! * data[start + i + lag]!;
    return s;
  };
  const a = score(best - 1);
  const b = bestScore;
  const c = score(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sr / (best + shift);
}

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

/** Strongest frequency within ±150 cents of `expected` (Hann-windowed DFT scan). */
function dftPeak(data: Float32Array, sr: number, from: number, expected: number): number {
  const start = Math.floor(from * sr);
  const len = Math.min(data.length - start, Math.floor(0.25 * sr));
  let best = expected;
  let bestMag = -1;
  for (let c = -150; c <= 150; c += 2) {
    const f = expected * 2 ** (c / 1200);
    let re = 0;
    let im = 0;
    for (let i = 0; i < len; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len);
      const ph = (2 * Math.PI * f * i) / sr;
      re += data[start + i]! * w * Math.cos(ph);
      im += data[start + i]! * w * Math.sin(ph);
    }
    const mag = re * re + im * im;
    if (mag > bestMag) {
      bestMag = mag;
      best = f;
    }
  }
  return best;
}

describe('synth zones', () => {
  const sr = 32000;
  for (const [name, def] of Object.entries(SYNTHS)) {
    it(`${name} renders in tune with a seamless loop`, () => {
      for (const midi of [45, 60, 72]) {
        const z = renderSynthZone(def, midi, 0.6, sr);
        expect(z.loopEnd).toBeGreaterThan(z.loopStart);
        expect(z.loopEnd * sr).toBeCloseTo(z.data.length, 0);
        const f = pitchOf(z.data, sr, z.loopStart + 0.2, midiToFreq(midi));
        // Vibrato and detuned unisons wobble a little; octave errors would be ±1200.
        expect(Math.abs(cents(f, midiToFreq(midi))), `${name} @ ${midi}`).toBeLessThan(35);
        // Loop seam: the sample just before loopEnd should continue into loopStart.
        const ls = Math.floor(z.loopStart * sr);
        const le = z.data.length;
        const jump = Math.abs(z.data[le - 1]! - z.data[ls - 1]!);
        expect(jump, `${name} loop seam`).toBeLessThan(0.05);
        let peak = 0;
        for (const x of z.data) peak = Math.max(peak, Math.abs(x));
        expect(peak).toBeLessThanOrEqual(0.81);
      }
    });
  }
});

describe('sampled instruments', () => {
  const pitched = Object.entries(PATCHES).filter(([, d]) => d.roots.length > 1);
  for (const [name, def] of pitched) {
    it(`${name} zones are in tune and bounded`, () => {
      const sr = def.rate ?? 32000;
      const root = def.roots[Math.floor(def.roots.length / 2)]!;
      const [data] = def.render(root, 0, sr);
      let peak = 0;
      for (const x of data!) peak = Math.max(peak, Math.abs(x));
      expect(peak).toBeGreaterThan(0.1);
      expect(peak).toBeLessThanOrEqual(0.81);
      // Mallets and plucks have strong inharmonic partials early on; measure after the attack.
      const f = name === 'glass' ? dftPeak(data!, sr, 0.2, midiToFreq(root)) : pitchOf(data!, sr, 0.15, midiToFreq(root));
      expect(Math.abs(cents(f, midiToFreq(root))), name).toBeLessThan(30);
    });
  }

  it('renders every one-shot and texture without NaNs', () => {
    for (const [name, def] of Object.entries(PATCHES)) {
      if (def.roots.length > 1) continue;
      for (const ch of def.render(60, 0, 24000)) {
        expect(ch.length, name).toBeGreaterThan(100);
        for (let i = 0; i < ch.length; i += 97) expect(Number.isFinite(ch[i]!), name).toBe(true);
      }
    }
  });
});

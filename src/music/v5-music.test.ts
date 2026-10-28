import { beforeAll, describe, expect, it } from 'vitest';
import { applyFormantFilter, FORMANT_SYNTHS, type FormantSynthPatch } from './dsp/formant';
import { renderSynthZone, SYNTHS } from './dsp/synths';
import { SampleBank } from './engine/bank';
import { compose } from './recipes';

beforeAll(() => {
  if (typeof globalThis.AudioBuffer === 'undefined') {
    class MockAudioBuffer {
      readonly length: number;
      readonly numberOfChannels: number;
      readonly sampleRate: number;
      readonly duration: number;
      private readonly channels: Float32Array[];

      constructor(opts: { length: number; numberOfChannels?: number; sampleRate: number }) {
        this.length = opts.length;
        this.numberOfChannels = opts.numberOfChannels ?? 1;
        this.sampleRate = opts.sampleRate;
        this.duration = this.length / this.sampleRate;
        this.channels = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
      }

      copyToChannel(src: Float32Array, channelNumber: number, startInChannel = 0): void {
        this.channels[channelNumber]?.set(src, startInChannel);
      }

      getChannelData(channelNumber: number): Float32Array {
        return this.channels[channelNumber]!;
      }
    }
    (globalThis as unknown as { AudioBuffer: typeof MockAudioBuffer }).AudioBuffer = MockAudioBuffer;
  }
});

describe('v5 formant & vocal synthesis', () => {
  const patches: FormantSynthPatch[] = ['formant-choir', 'vocoder-pad', 'vocal-chop', 'shanty-choir'];

  it('registers all 4 formant patches in SYNTHS and FORMANT_SYNTHS', () => {
    for (const patch of patches) {
      expect(FORMANT_SYNTHS[patch]).toBeDefined();
      expect(SYNTHS[patch]).toBe(FORMANT_SYNTHS[patch]);
    }
  });

  it('renders non-silent, finite, looping audio buffers via SampleBank for all 4 formant patches', () => {
    const bank = new SampleBank(32000);
    for (const patch of patches) {
      for (const midi of [48, 60, 72]) {
        const zone = bank.synthZone(patch, midi, 0.75);
        expect(zone.loop).toBe(true);
        expect(zone.loopEnd).toBeGreaterThan(zone.loopStart ?? 0);
        const chan = zone.buffer.getChannelData(0);
        expect(chan.length).toBeGreaterThan(32000);

        let sumSq = 0;
        let peak = 0;
        let allFinite = true;
        for (let i = 0; i < chan.length; i++) {
          const s = chan[i]!;
          if (!Number.isFinite(s)) allFinite = false;
          sumSq += s * s;
          if (Math.abs(s) > peak) peak = Math.abs(s);
        }
        expect(allFinite).toBe(true);
        const rms = Math.sqrt(sumSq / chan.length);
        expect(rms, `${patch} @ ${midi} RMS`).toBeGreaterThan(0.05);
        expect(peak, `${patch} @ ${midi} peak`).toBeGreaterThan(0.2);
        expect(peak, `${patch} @ ${midi} peak`).toBeLessThanOrEqual(0.81);
      }
    }
  });

  it('applyFormantFilter shapes harmonic content with finite samples across all formant profiles', () => {
    const sr = 24000;
    for (const patch of patches) {
      const buf = new Float32Array(4096);
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.5 + Math.sin((2 * Math.PI * 880 * i) / sr) * 0.3;
      }
      const before = buf.slice();
      applyFormantFilter(buf, sr, patch, 220);
      let diff = 0;
      let allFinite = true;
      for (let i = 0; i < buf.length; i++) {
        if (!Number.isFinite(buf[i]!)) allFinite = false;
        diff += Math.abs(buf[i]! - before[i]!);
      }
      expect(allFinite).toBe(true);
      expect(diff).toBeGreaterThan(1);

      const z = renderSynthZone(SYNTHS[patch], 60, 0.7, sr);
      expect(z.data.length).toBeGreaterThan(sr);
    }
  });
});

describe('v5 beat-matched talkover intros ("hitting the post")', () => {
  it('injects warm lowpass cutoff automation at t=0 that sweeps open right at the post', () => {
    const score = compose({
      recipe: 'city-pop',
      seed: 42,
      durationSeconds: 60,
      talkoverSeconds: 8,
    });

    const cutoffs = score.autos.filter((a) => a.target === 'cutoff');
    expect(cutoffs.length).toBeGreaterThanOrEqual(2);

    const atStart = cutoffs.find((a) => a.t === 0);
    expect(atStart).toBeDefined();
    expect(atStart!.value).toBeLessThanOrEqual(1150);
    expect(atStart!.tau).toBeCloseTo(0.05, 5);

    const atPost = cutoffs.find((a) => Math.abs(a.t - (8 - 0.15)) < 1e-6);
    expect(atPost).toBeDefined();
    expect(atPost!.value).toBeCloseTo(score.fx.lowpass, 5);
    expect(atPost!.tau).toBeCloseTo(0.25, 5);
  });

  it('clamps talkover post time to 45% of track duration on short tracks', () => {
    const score = compose({
      recipe: 'lofi-hiphop',
      seed: 19,
      durationSeconds: 12,
      talkoverSeconds: 10,
    });
    const expectedPost = 12 * 0.45;
    const atPost = score.autos.find((a) => a.target === 'cutoff' && Math.abs(a.t - (expectedPost - 0.15)) < 1e-6);
    expect(atPost).toBeDefined();
    expect(atPost!.value).toBeCloseTo(score.fx.lowpass, 5);
  });
});

describe('v5 melodic station call-sign jingles & vocal layer enrichment', () => {
  it('composes a deterministic 4-note station call-sign jingle per stationId that differs across stations', () => {
    const a1 = compose({
      recipe: 'city-pop',
      seed: 7,
      durationSeconds: 45,
      jingle: true,
      stationId: 'bubble-economy',
    });
    const a2 = compose({
      recipe: 'city-pop',
      seed: 7,
      durationSeconds: 45,
      jingle: true,
      stationId: 'bubble-economy',
    });
    const b = compose({
      recipe: 'city-pop',
      seed: 7,
      durationSeconds: 45,
      jingle: true,
      stationId: 'midnight-diner',
    });

    expect(a1).toEqual(a2);

    const callIdxA = a1.instruments.findIndex((i) => i.name === 'Station call-sign');
    const callIdxB = b.instruments.findIndex((i) => i.name === 'Station call-sign');
    expect(callIdxA).toBeGreaterThanOrEqual(0);
    expect(callIdxB).toBeGreaterThanOrEqual(0);

    const notesA = a1.events.filter((e) => e.i === callIdxA);
    const notesB = b.events.filter((e) => e.i === callIdxB);
    expect(notesA.length).toBeGreaterThanOrEqual(4);
    expect(notesB.length).toBeGreaterThanOrEqual(4);

    const sigA = `${a1.instruments[callIdxA]!.patch}:${notesA.map((n) => `${n.p}@${n.t.toFixed(3)}`).join(',')}`;
    const sigB = `${b.instruments[callIdxB]!.patch}:${notesB.map((n) => `${n.p}@${n.t.toFixed(3)}`).join(',')}`;
    expect(sigA).not.toEqual(sigB);

    for (const e of [...a1.events, ...b.events]) {
      expect(e.t).toBeGreaterThanOrEqual(0);
      expect(e.t).toBeLessThan(45);
      expect(e.t + e.d).toBeLessThanOrEqual(45 + 1e-6);
      expect(e.v).toBeGreaterThan(0);
      expect(e.v).toBeLessThanOrEqual(1);
    }
  });

  it('weaves formant choir / vocoder / vocal-chop layers into vocal-friendly recipes', () => {
    const vocalRecipes = ['sea-shanty', 'city-pop', 'heat-death-house', 'disco', 'space-funk', 'infinite-song', 'baroque', 'roots-reggae'] as const;
    const formantSet = new Set(['formant-choir', 'vocoder-pad', 'vocal-chop', 'shanty-choir']);

    for (const recipe of vocalRecipes) {
      const score = compose({ recipe, seed: 11, durationSeconds: 90 });
      const formantInstIdx = score.instruments.findIndex((i) => i.kind === 'synth' && formantSet.has(i.patch));
      expect(formantInstIdx, `${recipe} has formant instrument`).toBeGreaterThanOrEqual(0);
      const formantEvents = score.events.filter((e) => e.i === formantInstIdx);
      expect(formantEvents.length, `${recipe} has formant events`).toBeGreaterThan(0);
    }
  });
});

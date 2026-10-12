// Renders sampled-instrument zones on demand and caches them as AudioBuffers (LRU,
// bounded by memory), so long sessions across many recipes don't grow without limit.

import { PATCHES, zoneRoot } from '../dsp/patches';
import { renderSynthZone, SYNTH_ROOTS, SYNTHS, synthLayers } from '../dsp/synths';
import type { SamplePatch, SynthPatch } from '../score';

export interface Zone {
  buffer: AudioBuffer;
  /** MIDI root of the zone. */
  root: number;
  loop: boolean;
  /** Sustain loop region (seconds), for synth zones. */
  loopStart?: number;
  loopEnd?: number;
}

/** ~48 MB of float samples. */
const BUDGET_SAMPLES = 12_000_000;

export class SampleBank {
  private cache = new Map<string, Zone>();
  private reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();
  private samples = 0;

  constructor(private readonly sampleRate: number) {}

  private key(patch: SamplePatch, root: number, layer: number): string {
    return `${patch}:${root}:${layer}`;
  }

  layerFor(patch: SamplePatch, velocity: number): number {
    return PATCHES[patch].layers === 2 && velocity >= 0.56 ? 1 : 0;
  }

  /** The zone to play `midi` at `velocity` (renders it if needed). */
  zone(patch: SamplePatch, midi: number, velocity: number): Zone {
    const def = PATCHES[patch];
    const root = zoneRoot(def, midi);
    const layer = this.layerFor(patch, velocity);
    const key = this.key(patch, root, layer);
    const hit = this.cache.get(key);
    if (hit) {
      // Refresh LRU position.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const rate = def.rate ?? (def.hiFi ? this.sampleRate : Math.min(this.sampleRate, 32000));
    const chans = def.render(root, layer, rate);
    const buffer = new AudioBuffer({ length: chans[0]!.length, numberOfChannels: chans.length, sampleRate: rate });
    chans.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    const zone: Zone = { buffer, root: def.roots.length === 1 ? 60 : root, loop: !!def.loop };
    this.cache.set(key, zone);
    this.samples += buffer.length * buffer.numberOfChannels;
    this.evict();
    return zone;
  }

  /** A rendered synth zone (looping sustain) for `midi` at `velocity`. */
  synthZone(patch: SynthPatch, midi: number, velocity: number): Zone {
    const def = SYNTHS[patch];
    let root = SYNTH_ROOTS[0]!;
    for (const r of SYNTH_ROOTS) if (Math.abs(r - midi) < Math.abs(root - midi)) root = r;
    const layer = synthLayers(def) === 2 && velocity >= 0.6 ? 1 : 0;
    const key = `synth:${patch}:${root}:${layer}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const rate = Math.min(this.sampleRate, 32000);
    const z = renderSynthZone(def, root, layer ? 0.85 : 0.45, rate);
    const buffer = new AudioBuffer({ length: z.data.length, numberOfChannels: 1, sampleRate: rate });
    buffer.copyToChannel(z.data as Float32Array<ArrayBuffer>, 0);
    const zone: Zone = { buffer, root, loop: true, loopStart: z.loopStart, loopEnd: z.loopEnd };
    this.cache.set(key, zone);
    this.samples += buffer.length;
    this.evict();
    return zone;
  }

  /** Whether a zone is already rendered (for spreading work over time). */
  has(patch: SamplePatch, midi: number, velocity: number): boolean {
    const def = PATCHES[patch];
    return this.cache.has(this.key(patch, zoneRoot(def, midi), this.layerFor(patch, velocity)));
  }

  reversed(zone: Zone): AudioBuffer {
    let buf = this.reversedCache.get(zone.buffer);
    if (!buf) {
      const src = zone.buffer;
      buf = new AudioBuffer({ length: src.length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
      for (let c = 0; c < src.numberOfChannels; c++) buf.copyToChannel(src.getChannelData(c).slice().reverse(), c);
      this.reversedCache.set(zone.buffer, buf);
    }
    return buf;
  }

  private evict(): void {
    for (const [key, zone] of this.cache) {
      if (this.samples <= BUDGET_SAMPLES) break;
      this.cache.delete(key);
      this.samples -= zone.buffer.length * zone.buffer.numberOfChannels;
    }
  }

  clear(): void {
    this.cache.clear();
    this.reversedCache = new WeakMap();
    this.samples = 0;
  }
}

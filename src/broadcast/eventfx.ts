// Synthesized sound for multiverse events and the time slip. Nothing here runs unless an
// event is on: every treatment is built when its event begins, scheduled on the context
// clock to end with it, and released afterwards.

import { createRng } from './random';

export interface Treatment {
  /** Fades out and releases everything now (safe to call twice). */
  stop(fade?: number): void;
}

const MAX_BEEPS = 90;

function treatment(ctx: BaseAudioContext, output: GainNode, sources: AudioScheduledSourceNode[], end: number): Treatment {
  let stopped = false;
  const release = () => output.disconnect();
  const last = sources[sources.length - 1];
  if (last) last.addEventListener('ended', release);
  for (const s of sources) {
    try {
      s.stop(end + 0.05);
    } catch {
      // Already stopped.
    }
  }
  return {
    stop(fade = 0.6) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      output.gain.cancelScheduledValues(now);
      output.gain.setValueAtTime(output.gain.value, now);
      output.gain.linearRampToValueAtTime(0, now + fade);
      for (const s of sources) {
        try {
          s.stop(now + fade + 0.05);
        } catch {
          // Already stopped.
        }
      }
    },
  };
}

/** Dimensional storm: gusts of static that sweep across the band, over a low rumble. */
export function squalls(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, from: number, end: number, seed: number): Treatment {
  const rng = createRng(seed);
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const output = ctx.createGain();
  source.connect(band).connect(gain).connect(output).connect(out);
  // Rumble underneath.
  const rumbleSource = ctx.createBufferSource();
  rumbleSource.buffer = noise;
  rumbleSource.loop = true;
  rumbleSource.playbackRate.value = 0.35;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 260;
  const rumble = ctx.createGain();
  rumble.gain.value = 0;
  rumbleSource.connect(low).connect(rumble).connect(output);
  rumble.gain.setValueAtTime(0, from);
  rumble.gain.linearRampToValueAtTime(0.16, from + 2.5);
  rumble.gain.setValueAtTime(0.16, Math.max(from + 2.5, end - 3));
  rumble.gain.linearRampToValueAtTime(0, end);

  gain.gain.setValueAtTime(0, from);
  band.frequency.setValueAtTime(900, from);
  for (let t = from + rng.range(0.3, 1.5); t < end - 1; ) {
    const length = rng.range(0.4, 2.6);
    const peak = rng.range(0.12, 0.42);
    const top = Math.min(end - 0.2, t + length);
    gain.gain.setTargetAtTime(peak, t, length * 0.18);
    gain.gain.setTargetAtTime(rng.range(0, 0.04), top, length * 0.25);
    band.frequency.setTargetAtTime(rng.range(500, 4200), t, length * 0.4);
    t = top + rng.range(0.6, 5);
  }
  gain.gain.setTargetAtTime(0, end - 0.8, 0.2);
  source.start(from, rng.range(0, noise.duration * 0.5));
  rumbleSource.start(from);
  return treatment(ctx, output, [source, rumbleSource], end);
}

/** The Hum: a low mains-like hum with a slow, uneasy swell. */
export function hum(ctx: BaseAudioContext, out: AudioNode, from: number, end: number, fadeIn = 3): Treatment {
  const output = ctx.createGain();
  output.gain.value = 0;
  output.gain.setValueAtTime(0, from);
  output.gain.linearRampToValueAtTime(0.22, from + fadeIn);
  output.gain.setValueAtTime(0.22, Math.max(from + fadeIn, end - 3));
  output.gain.linearRampToValueAtTime(0, end);
  const swell = ctx.createGain();
  swell.gain.value = 0.85;
  swell.connect(output).connect(out);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.17;
  const depth = ctx.createGain();
  depth.gain.value = 0.15;
  lfo.connect(depth).connect(swell.gain);
  const sources: AudioScheduledSourceNode[] = [lfo];
  for (const [freq, level] of [
    [55, 0.5],
    [110.4, 0.32],
    [165.2, 0.16],
    [220.9, 0.09],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(swell);
    osc.start(from);
    sources.push(osc);
  }
  lfo.start(from);
  return treatment(ctx, output, sources, end);
}

/** Signal from beyond: a slow detuned drone and bursts of pips in no known scale. */
export function beyond(ctx: BaseAudioContext, out: AudioNode, from: number, end: number, seed: number): Treatment {
  const rng = createRng(seed);
  const output = ctx.createGain();
  output.gain.value = 0;
  output.gain.setValueAtTime(0, from);
  output.gain.linearRampToValueAtTime(1, from + 1.2);
  output.gain.setValueAtTime(1, Math.max(from + 1.2, end - 2));
  output.gain.linearRampToValueAtTime(0, end);
  output.connect(out);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const drone = ctx.createGain();
  drone.gain.value = 0.07;
  filter.connect(drone).connect(output);
  const root = rng.range(92, 128);
  const sources: AudioScheduledSourceNode[] = [];
  for (const ratio of [1, 1.0061, 1.498]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = root * ratio;
    osc.connect(filter);
    osc.start(from);
    sources.push(osc);
  }
  const pips = ctx.createGain();
  pips.gain.value = 0.055;
  pips.connect(output);
  let beeps = 0;
  for (let t = from + 1.5; t < end - 1.5 && beeps < MAX_BEEPS; ) {
    const count = rng.int(3, 7);
    for (let i = 0; i < count && beeps < MAX_BEEPS; i++, beeps++) {
      const osc = ctx.createOscillator();
      osc.frequency.value = root * 4 * 2 ** (rng.int(0, 13) / 11);
      const env = ctx.createGain();
      env.gain.value = 0;
      const at = t + i * 0.16;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(1, at + 0.01);
      env.gain.setTargetAtTime(0, at + 0.07, 0.02);
      osc.connect(env).connect(pips);
      osc.start(at);
      osc.stop(at + 0.2);
      osc.addEventListener('ended', () => env.disconnect());
    }
    t += count * 0.16 + rng.range(1.8, 5);
  }
  return treatment(ctx, output, sources, end);
}

/** Emergency Multiverse Broadcast System: a rising three-note attention signal and a steady tone ('open'), or a falling one ('close'). */
export function alert(ctx: BaseAudioContext, out: AudioNode, at: number, kind: 'open' | 'close'): Treatment {
  const output = ctx.createGain();
  output.gain.value = 0.14;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  tone.connect(output).connect(out);
  const notes = kind === 'open' ? [698, 880, 1047, 698, 880, 1047] : [1047, 880, 698];
  const sources: AudioScheduledSourceNode[] = [];
  let t = at;
  const note = (freq: number, length: number) => {
    for (const type of ['sine', 'square'] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.value = 0;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(type === 'sine' ? 1 : 0.12, t + 0.015);
      env.gain.setValueAtTime(type === 'sine' ? 1 : 0.12, t + length - 0.03);
      env.gain.linearRampToValueAtTime(0, t + length);
      osc.connect(env).connect(tone);
      osc.start(t);
      osc.stop(t + length + 0.02);
      sources.push(osc);
    }
    t += length + 0.05;
  };
  for (const freq of notes) note(freq, 0.3);
  if (kind === 'open') note(1047, 1.6);
  return treatment(ctx, output, sources, t);
}

/** A tape rewinding at speed (the time slip going back) or a whoosh (hosts swapping stations). */
export function sweep(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, at: number, kind: 'rewind' | 'whoosh'): Treatment {
  const length = kind === 'rewind' ? 1.1 : 0.8;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = kind === 'rewind' ? 1.6 : 1;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = kind === 'rewind' ? 4 : 1.2;
  const [from, to] = kind === 'rewind' ? [350, 5200] : [3200, 280];
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + length);
  const output = ctx.createGain();
  output.gain.value = 0;
  output.gain.setValueAtTime(0, at);
  output.gain.linearRampToValueAtTime(kind === 'rewind' ? 0.5 : 0.3, at + length * 0.3);
  output.gain.linearRampToValueAtTime(0, at + length);
  source.connect(band).connect(output).connect(out);
  const sources: AudioScheduledSourceNode[] = [source];
  if (kind === 'rewind') {
    const chirp = ctx.createOscillator();
    chirp.type = 'sawtooth';
    chirp.frequency.setValueAtTime(220, at);
    chirp.frequency.exponentialRampToValueAtTime(2600, at + length);
    const g = ctx.createGain();
    g.gain.value = 0.025;
    chirp.connect(g).connect(output);
    chirp.start(at);
    sources.push(chirp);
  }
  source.start(at, Math.random() * Math.max(0, noise.duration - length * 1.6));
  return treatment(ctx, output, sources, at + length);
}

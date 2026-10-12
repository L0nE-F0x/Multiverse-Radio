// Tiny cabinet noises (knob detents, a smack, a boop) synthesized on the fly.
//
// Uses its own small AudioContext, created on the first gesture and suspended again
// as soon as it goes quiet, so it costs nothing while the radio plays for hours.
// Respects the receiver's volume and mute.

import { useBroadcast } from '../broadcast/store';

let ctx: AudioContext | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | undefined;
const buffers = new Map<string, AudioBuffer>();

function level(): number {
  const { volume, muted } = useBroadcast.getState();
  return muted ? 0 : volume;
}

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    ctx ??= new AudioContext({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => void ctx?.suspend().catch(() => {}), 1500);
  return ctx;
}

function buffer(name: string, seconds: number, fill: (t: number, noise: number) => number): AudioBuffer | null {
  const audio = context();
  if (!audio) return null;
  const cached = buffers.get(name);
  if (cached) return cached;
  const rate = audio.sampleRate;
  const out = audio.createBuffer(1, Math.floor(rate * seconds), rate);
  const data = out.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = fill(i / rate, Math.random() * 2 - 1);
  buffers.set(name, out);
  return out;
}

function play(source: AudioBuffer | null, gain: number, rate = 1): void {
  const audio = ctx;
  if (!audio || !source) return;
  const node = audio.createBufferSource();
  node.buffer = source;
  node.playbackRate.value = rate;
  const amp = audio.createGain();
  amp.gain.value = gain;
  node.connect(amp).connect(audio.destination);
  node.start();
}

/** A detent click: sharp tick, softer clack, a little chassis thump. */
export function tick(strength = 0.5): void {
  const vol = level();
  if (vol <= 0) return;
  const click = buffer('tick', 0.08, (t, n) => {
    const a = n * Math.exp(-t * 900);
    const b = t > 0.016 ? n * 0.5 * Math.exp(-(t - 0.016) * 650) : 0;
    const thump = Math.sin(2 * Math.PI * 150 * t) * 0.35 * Math.exp(-t * 55);
    return (a + b + thump) * 0.7;
  });
  play(click, 0.35 * strength * vol, 0.92 + Math.random() * 0.16);
}

/** A palm meeting a wooden cabinet. */
export function thump(): void {
  const vol = level();
  if (vol <= 0) return;
  const hit = buffer('thump', 0.5, (t, n) => {
    const body = Math.sin(2 * Math.PI * (95 - t * 60) * t) * Math.exp(-t * 9);
    const slap = n * Math.exp(-t * 120) * 0.6;
    const rattle = t > 0.06 ? n * 0.12 * Math.exp(-(t - 0.06) * 25) * (Math.sin(t * 380) > 0 ? 1 : 0.2) : 0;
    return (body * 0.9 + slap + rattle) * 0.8;
  });
  play(hit, 0.9 * vol);
}

/** A cartoon boop. */
export function boop(): void {
  const vol = level();
  if (vol <= 0) return;
  const tone = buffer('boop', 0.22, (t) => Math.sin(2 * Math.PI * (520 + 420 * Math.exp(-t * 18)) * t) * Math.exp(-t * 14) * 0.6);
  play(tone, 0.35 * vol, 0.9 + Math.random() * 0.2);
}

/** A springy antenna boing. */
export function boing(): void {
  const vol = level();
  if (vol <= 0) return;
  const tone = buffer('boing', 0.6, (t) => {
    const f = 180 + 90 * Math.sin(t * 2 * Math.PI * 9) * Math.exp(-t * 4);
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 5) * 0.4;
  });
  play(tone, 0.4 * vol);
}

/** Call inside a user gesture so later sounds are allowed. */
export function unlock(): void {
  context();
}

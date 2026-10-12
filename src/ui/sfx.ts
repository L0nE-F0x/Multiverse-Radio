// Console noises (the tuning dial's detents) synthesized on the fly.
//
// Uses its own small AudioContext, created on the first gesture and suspended again as soon
// as it goes quiet, so it costs nothing while the radio plays for hours. Respects the
// receiver's volume and mute.

import { useBroadcast } from '../broadcast/store';

let ctx: AudioContext | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | undefined;
let detent: AudioBuffer | null = null;
let lastTick = 0;

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

/** A small, dry detent click: the fine-tuning dial moving one step. */
export function tick(strength = 0.5): void {
  const vol = level();
  const now = performance.now();
  if (vol <= 0 || now - lastTick < 28) return;
  lastTick = now;
  const audio = context();
  if (!audio) return;
  if (!detent) {
    const rate = audio.sampleRate;
    detent = audio.createBuffer(1, Math.floor(rate * 0.03), rate);
    const data = detent.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      data[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 1400) + Math.sin(2 * Math.PI * 2100 * t) * 0.25 * Math.exp(-t * 500)) * 0.6;
    }
  }
  const node = audio.createBufferSource();
  node.buffer = detent;
  node.playbackRate.value = 0.9 + Math.random() * 0.2;
  const amp = audio.createGain();
  amp.gain.value = 0.16 * strength * vol;
  node.connect(amp).connect(audio.destination);
  node.start();
}

/** Call inside a user gesture so later sounds are allowed. */
export function unlock(): void {
  context();
}

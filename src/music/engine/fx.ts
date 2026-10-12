// Shared effect assets: the reverb impulse response and waveshaper curves.

import { Noise, OnePole } from '../dsp/core';

/**
 * A smooth plate/hall-ish impulse response: noise with an exponential decay that
 * darkens over time, a few early reflections and a pre-delay. Mono on purpose: a mono
 * convolution costs a third of a stereo one in Chrome (measured ~3.6% vs ~10% of a core
 * for comparable lengths); the engine widens the return with a short Haas offset.
 */
export function reverbImpulse(sampleRate: number, seconds = 1.8, rt60 = 1.7): AudioBuffer {
  const sr = sampleRate; // ConvolverNode requires the context rate
  const n = Math.floor(seconds * sr);
  const buffer = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
  const pre = Math.floor(0.012 * sr);
  const decay = Math.log(1000) / rt60;
  const data = new Float32Array(n);
  const noise = new Noise(0x5eed);
  const lp = new OnePole(sr, 9000);
  for (let i = pre; i < n; i++) {
    const t = (i - pre) / sr;
    if ((i & 255) === 0) lp.setFreq(sr, 1400 + 7600 * Math.exp(-t / 0.5));
    const fadeIn = Math.min(1, t / 0.025);
    data[i] = lp.tick(noise.next()) * Math.exp(-decay * t) * fadeIn;
  }
  // Early reflections.
  [0.011, 0.017, 0.023, 0.031, 0.041, 0.053].forEach((tap, k) => {
    const at = pre + Math.floor(tap * sr);
    if (at < n) data[at]! += (k % 2 ? -1 : 1) * 0.45 * (1 - k * 0.1);
  });
  // Unit energy: a steady signal comes out of the reverb at about the level it went in.
  let e = 0;
  for (let i = 0; i < n; i++) e += data[i]! * data[i]!;
  const g = 1 / Math.sqrt(e);
  for (let i = 0; i < n; i++) data[i]! *= g;
  const fade = Math.floor(0.05 * sr);
  for (let i = n - fade; i < n; i++) data[i]! *= (n - i) / fade;
  buffer.copyToChannel(data, 0);
  return buffer;
}

/** Gentle tape-style saturation; `amount` 0..1. */
export function saturationCurve(amount: number, size = 2048): Float32Array<ArrayBuffer> {
  const k = 0.5 + amount * 3;
  const curve = new Float32Array(size);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    // Slight asymmetry adds warm even harmonics.
    curve[i] = Math.tanh(k * (x + 0.08 * x * x)) / norm;
  }
  return curve;
}

/**
 * Final safety ceiling: linear up to `knee`, then a soft curve that never exceeds
 * `ceiling` (−1 dBFS by default).
 */
export function softClipCurve(knee = 0.7, ceiling = 0.89, size = 4096): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const room = ceiling - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 4 - 2; // input range ±2
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/**
 * Per-quantum (k-rate) automation where per-sample precision isn't audible: automated or
 * modulated a-rate filter params make Chrome recompute coefficients for every sample.
 */
export function kRate(...params: AudioParam[]): void {
  for (const p of params) {
    try {
      if ('automationRate' in p) p.automationRate = 'k-rate';
    } catch {
      /* not changeable on this param/browser */
    }
  }
}

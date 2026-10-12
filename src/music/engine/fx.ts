// Shared effect assets: the reverb impulse response and waveshaper curves.

import { Noise, OnePole } from '../dsp/core';

/**
 * A smooth plate/hall-ish impulse response: decorrelated stereo noise with an
 * exponential decay that darkens over time, a few early reflections and a pre-delay.
 */
export function reverbImpulse(sampleRate: number, seconds = 3.2, rt60 = 2.4): AudioBuffer {
  const sr = sampleRate; // ConvolverNode requires the context rate
  const n = Math.floor(seconds * sr);
  const buffer = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  const pre = Math.floor(0.014 * sr);
  const decay = Math.log(1000) / rt60;
  for (let c = 0; c < 2; c++) {
    const data = new Float32Array(n);
    const noise = new Noise(0x5eed + c * 7919);
    const lp = new OnePole(sr, 9000);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if ((i & 255) === 0) lp.setFreq(sr, 1200 + 7800 * Math.exp(-t / 0.6));
      const fadeIn = Math.min(1, t / 0.02);
      data[i] = lp.tick(noise.next()) * Math.exp(-decay * t) * fadeIn;
    }
    // Early reflections.
    const taps = c === 0 ? [0.011, 0.019, 0.027, 0.041, 0.053] : [0.013, 0.023, 0.031, 0.037, 0.059];
    taps.forEach((tap, k) => {
      const at = pre + Math.floor(tap * sr);
      if (at < n) data[at]! += (k % 2 ? -1 : 1) * 0.5 * (1 - k * 0.12);
    });
    // Unit energy: a steady signal comes out of the reverb at about the level it went in.
    let e = 0;
    for (let i = 0; i < n; i++) e += data[i]! * data[i]!;
    const g = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) data[i]! *= g;
    for (let i = n - Math.floor(0.05 * sr); i < n; i++) data[i]! *= (n - i) / (0.05 * sr);
    buffer.copyToChannel(data, c);
  }
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

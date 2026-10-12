// Sound effects. The receiver ships `/sfx/static-burst.mp3` and `/sfx/dial-click.mp3`,
// but falls back to synthesizing both, so a missing or broken file never breaks tuning.

export async function loadSfxBuffer(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** Crackly AM static: white noise with a softened edge, random pops and a slow flutter. */
export function synthStatic(ctx: BaseAudioContext, seconds = 2.5): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * seconds), rate);
  const data = buffer.getChannelData(0);
  let low = 0;
  let pop = 0;
  let popEnv = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    low += 0.3 * (white - low);
    if (Math.random() < 0.0008) {
      pop = (Math.random() * 2 - 1) * (0.5 + Math.random() * 0.5);
      popEnv = 1;
    }
    popEnv *= 0.94;
    const t = i / rate;
    const flutter = 0.78 + 0.22 * Math.sin(t * 2 * Math.PI * 6.7) * Math.sin(t * 2 * Math.PI * 0.9);
    data[i] = (white * 0.32 + low * 0.45 + pop * popEnv) * flutter;
  }
  return buffer;
}

/** A detent: a sharp click, a softer clack, and a little low thump of the chassis. */
export function synthClick(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * 0.08), rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const noise = Math.random() * 2 - 1;
    const click = noise * Math.exp(-t * 900);
    const clack = t > 0.016 ? noise * 0.5 * Math.exp(-(t - 0.016) * 650) : 0;
    const thump = Math.sin(2 * Math.PI * 150 * t) * 0.35 * Math.exp(-t * 55);
    data[i] = (click + clack + thump) * 0.7;
  }
  return buffer;
}

/**
 * A tenth of a second of silence as a WAV blob URL. Playing it from inside the first
 * user gesture "unlocks" the shared <audio> element on browsers (iOS Safari) that
 * otherwise reject play() calls made after an await.
 */
export function createSilenceUrl(): string {
  const sampleRate = 8000;
  const samples = 800;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

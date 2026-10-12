// Synthesized sound effects for the receiver: tuning static and the dial click. Asset
// files (`/sfx/*.mp3`) are optional upgrades; a missing file never breaks tuning.

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

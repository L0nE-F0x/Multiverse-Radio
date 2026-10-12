// Generative music engine — public API.
//
// STUB: the music workstream replaces the implementation behind this API with real
// genre recipes. Keep the exported names and signatures stable; the broadcast
// director codes against them.

import type { RecipeId, RecipeTweaks } from '../broadcast/types';

export interface TrackRequest {
  recipe: RecipeId;
  /** Same recipe + seed + tweaks ⇒ the same piece of music, on every machine. */
  seed: number;
  /** The engine shapes an intro and an ending to fit this length. */
  durationSeconds: number;
  tweaks?: Partial<RecipeTweaks>;
}

export interface PlayOptions {
  /** AudioContext time to start at (default: now). */
  when?: number;
  /** Seconds into the track to start from, for joining a broadcast mid-song (default 0). */
  offset?: number;
  /** Crossfade from whatever is playing, in seconds (default 0.5). */
  fade?: number;
}

export interface MusicEngine {
  /** Connect this to the mixer. */
  readonly output: AudioNode;
  /** Starts a track, replacing (crossfading) any current one. */
  play(track: TrackRequest, options?: PlayOptions): void;
  /** Fades out and stops whatever is playing. */
  stop(options?: { when?: number; fade?: number }): void;
  /** Releases every node. The engine is unusable afterwards. */
  dispose(): void;
}

export interface RecipeInfo {
  label: string;
  description: string;
}

/** Human-readable info for every recipe (used by the music lab and the UI). */
export const RECIPE_INFO: Partial<Record<RecipeId, RecipeInfo>> = {};

/**
 * Creates the engine on an existing AudioContext. May lazy-load heavy code, hence async.
 * Must not start any sound until `play` is called.
 */
export async function createMusicEngine(ctx: AudioContext): Promise<MusicEngine> {
  return new StubEngine(ctx);
}

/** Placeholder: a soft two-chord pad, so the rest of the system has something to hear. */
class StubEngine implements MusicEngine {
  readonly output: GainNode;
  private voices: { oscillators: OscillatorNode[]; gain: GainNode } | null = null;

  constructor(private readonly ctx: AudioContext) {
    this.output = ctx.createGain();
  }

  play(track: TrackRequest, { when = this.ctx.currentTime, fade = 0.5 }: PlayOptions = {}): void {
    this.stop({ when, fade });
    const root = 196 * 2 ** ((track.seed % 7) / 12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.06, when + Math.max(fade, 0.05));
    gain.connect(this.output);
    const oscillators = [1, 1.26, 1.5, 1.89].map((ratio) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = root * ratio;
      osc.connect(gain);
      osc.start(when);
      return osc;
    });
    this.voices = { oscillators, gain };
  }

  stop({ when = this.ctx.currentTime, fade = 0.5 }: { when?: number; fade?: number } = {}): void {
    const voices = this.voices;
    if (!voices) return;
    this.voices = null;
    voices.gain.gain.setTargetAtTime(0, when, Math.max(fade, 0.01) / 4);
    for (const osc of voices.oscillators) osc.stop(when + fade + 0.1);
  }

  dispose(): void {
    this.stop({ fade: 0.05 });
    this.output.disconnect();
  }
}

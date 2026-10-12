import type { SceneId } from '../broadcast/types';
import type { Color } from './kit/color';
import type { Gfx } from './kit/gfx';
import type { Grade } from './kit/post';
import type { Rng } from './kit/rng';

/** Per-frame inputs. One object is reused for every frame (don't keep references). */
export interface Frame {
  /** Scene clock in seconds. Advances only while the scene is visible; slowed by reduced motion. */
  t: number;
  /** Seconds since the previous frame (scene clock), capped. */
  dt: number;
  /** Smoothed audio level 0–1 (0 when not playing). */
  energy: number;
  /** Beat pulse: jumps to 1 on a detected onset, decays quickly. */
  pulse: number;
  /** Count of detected beats (handy for alternating poses). */
  beat: number;
  /** 0 = station paused/off (characters doze), 1 = on air. Eases between the two. */
  awake: number;
  playing: boolean;
  /** prefers-reduced-motion: no flashing, minimal movement. */
  reduced: boolean;
  /** Seconds since the latest rare event started (Infinity if none yet). */
  rareT: number;
  /** Which rare event is running (0..rareEvents-1). */
  rare: number;
  /** A random number fixed for the current rare event. */
  rareSeed: number;
  /** Local hour of day, 0–24 (for optional time-of-day touches). */
  hour: number;
  /** Frames drawn so far. */
  n: number;
}

export interface Scene {
  /** Paint the static background for the current view (called after every resize). */
  background(g: Gfx): void;
  /** Draw one frame over the restored background. */
  frame(g: Gfx, f: Frame): void;
}

export interface SceneContext {
  /** The station's accent color. */
  accent: Color;
  /** Seeded from the scene id: layouts are stable across visits. */
  rng: Rng;
  /**
   * Per-station variation, 0 to 2^32−1: a hash of the station id. Scenes shared by many
   * stations (pirates) use it to vary layout, props and colours; others can ignore it.
   */
  variant: number;
}

export interface SceneDef {
  id: SceneId;
  /** Frames per second while running (default 20). Keep low for slow scenes. */
  fps?: number;
  /** World point kept centred when the view crops or extends (default 160, 90). */
  focusX?: number;
  focusY?: number;
  /** How many distinct rare events `frame` knows how to play. */
  rareEvents: number;
  /** Seconds a rare event lasts (for scheduling and the lab). */
  rareDuration: number;
  /**
   * The lens every frame is seen through: colour grade, vignette, grain and bloom (see
   * kit/post.ts). Omit for the house look; override single fields to tune it (e.g.
   * `{ temperature: 0.4, bloom: 0.8 }`); `false` shows the raw raster.
   */
  grade?: Grade | false;
  create(ctx: SceneContext): Scene;
}

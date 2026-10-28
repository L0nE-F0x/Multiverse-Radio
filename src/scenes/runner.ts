// Drives one scene on one canvas: sizing, the frame loop, audio-energy smoothing,
// rare-event scheduling and power saving (pauses when hidden or offscreen).

import type { BroadcastSceneState } from '../broadcast/types';
import { applyBroadcastLens, sectionDrive } from './kit/broadcast';
import { type Color, hex } from './kit/color';
import { Gfx } from './kit/gfx';
import { Post } from './kit/post';
import { Rng, hashString } from './kit/rng';
import type { Frame, Scene, SceneDef } from './types';
import { computeView } from './viewport';

export interface RunnerInputs {
  playing: boolean;
  energy?: () => number;
  broadcast?: () => Partial<BroadcastSceneState>;
  reducedMotion: boolean;
}

export interface RunnerStats {
  /** Average milliseconds spent drawing a frame (scene + post + blit). */
  drawMs: number;
  /** Frames per second actually achieved. */
  fps: number;
  /** Internal resolution. */
  w: number;
  h: number;
}

const REDUCED_TIME_SCALE = 0.2;
const REDUCED_FPS = 8;
const PAUSED_FPS = 12;
const RARE_MIN_S = 30;
const RARE_MAX_S = 120;

export class SceneRunner {
  readonly gfx = new Gfx();
  private scene: Scene;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  /** The graded picture that goes to the canvas. */
  private out = new Int32Array(0);
  private post: Post | null;
  private accentColor: Color;
  private bgExposure: Float32Array | null = null;
  private bgExposureVersion = 0;
  /** Lab switch: false shows the raw raster without grade, vignette, grain or bloom. */
  postEnabled = true;
  readonly frame: Frame = {
    t: 0,
    dt: 0,
    energy: 0,
    pulse: 0,
    beat: 0,
    awake: 1,
    playing: false,
    reduced: false,
    rareT: Infinity,
    rare: 0,
    rareSeed: 0,
    hour: 12,
    n: 0,
    segmentKind: 'music',
    voiceCategory: null,
    speech: 0,
    section: 'verse',
    sectionProgress: 0,
    event: null,
    hush: false,
    signal: 1,
    bleed: 0,
  };
  private rng: Rng;
  private slowEnergy = 0;
  private lastBeat = 0;
  private realT = 0;
  private nextRare: number;
  private rareCursor = 0;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private raf = 0;
  private lastNow = 0;
  private nextAt = 0;
  private pageVisible = true;
  private onScreen = true;
  private destroyed = false;
  private hasSize = false;

  private resizeObs: ResizeObserver | null = null;
  private interObs: IntersectionObserver | null = null;
  private statDraw = 0;
  private statFrames = 0;
  private statSince = 0;
  stats: RunnerStats = { drawMs: 0, fps: 0, w: 0, h: 0 };

  /** Called after the first frame is on the canvas. */
  onFirstFrame: (() => void) | null = null;

  constructor(
    private container: HTMLElement,
    private canvas: HTMLCanvasElement,
    private def: SceneDef,
    accent: string,
    private inputs: RunnerInputs,
    variant = 0,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.accentColor = hex(accent);
    this.rng = new Rng((hashString(def.id) ^ 0x9e3779b9 ^ variant) >>> 0);
    this.post = def.grade === false ? null : new Post(def.grade);
    this.scene = def.create({ accent: this.accentColor, rng: new Rng(hashString(def.id)), variant });
    this.frame.hour = localHour();
    this.frame.awake = inputs.playing ? 1 : 0;
    this.nextRare = this.rng.range(RARE_MIN_S * 0.5, RARE_MAX_S * 0.6);

    this.pageVisible = typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.layout());
      this.resizeObs.observe(container);
    }
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.interObs = new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        this.onScreen = e.isIntersecting;
        this.update();
      });
      this.interObs.observe(container);
    }
    this.layout();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObs?.disconnect();
    this.interObs?.disconnect();
  }

  /** Start a rare event now. Without an index, events play in turn. */
  trigger(kind?: number) {
    const f = this.frame;
    f.rare = kind ?? this.rareCursor++ % Math.max(1, this.def.rareEvents);
    f.rareT = 0;
    f.rareSeed = this.rng.next();
    this.nextRare = f.t + this.rng.range(RARE_MIN_S, RARE_MAX_S);
    if (!this.isRunning()) this.drawNow();
  }

  /** Inputs changed (playing / reduced motion); redraw if paused so the change shows. */
  refresh() {
    if (!this.isRunning() && this.hasSize) this.drawNow();
  }

  /** Advance the scene clock (for screenshots of later moments). */
  advance(seconds: number) {
    const step = 1 / 10;
    for (let s = 0; s < seconds; s += step) this.step(step, false);
    this.drawNow();
  }

  /** Draw one frame advancing by `dt` seconds. */
  draw(dt = 0) {
    this.step(dt, true);
  }

  private onVisibility = () => {
    this.pageVisible = typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true;
    this.update();
  };

  private isRunning() {
    return this.timer !== undefined || this.raf !== 0;
  }

  private shouldRun() {
    return !this.destroyed && this.pageVisible && this.onScreen && this.hasSize;
  }

  private update() {
    if (this.shouldRun()) {
      if (!this.isRunning()) {
        this.lastNow = 0;
        this.schedule(0);
      }
    } else this.stop();
  }

  private stop() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = undefined;
    this.raf = 0;
  }

  private fps() {
    const fps = this.def.fps ?? 20;
    if (this.inputs.reducedMotion) return Math.min(fps, REDUCED_FPS);
    // Off air the scene dozes, so it can afford fewer frames (and less battery).
    return this.inputs.playing ? fps : Math.min(fps, PAUSED_FPS);
  }

  private schedule(delay: number) {
    this.timer = setTimeout(this.onTimer, delay);
  }

  private onTimer = () => {
    this.timer = undefined;
    this.raf = requestAnimationFrame(this.tick);
  };

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.shouldRun()) return;
    const interval = 1000 / this.fps();
    const dt = this.lastNow ? Math.min(250, now - this.lastNow) / 1000 : 1 / this.fps();
    this.lastNow = now;
    this.step(dt, true);
    if (this.nextAt < now - interval) this.nextAt = now;
    this.nextAt += interval;
    // rAF fires on the next vsync after the timeout, so aim a few ms early.
    this.schedule(Math.max(0, this.nextAt - performance.now() - 6));
  };

  private layout() {
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    this.hasSize = cw > 0 && ch > 0;
    if (!this.hasSize) {
      this.update();
      return;
    }
    const v = computeView(cw / ch, this.def.focusX, this.def.focusY);
    const g = this.gfx;
    if (!this.image || v.w !== g.w || v.h !== g.h || v.ox !== g.ox || v.oy !== g.oy) {
      g.resize(v.w, v.h, v.ox, v.oy);
      g.target(g.bg);
      this.scene.background(g);
      g.target();
      this.bgExposure = g.exposure ? g.exposure.slice() : null;
      this.bgExposureVersion = g.exposureVersion;
      this.canvas.width = v.w;
      this.canvas.height = v.h;
      this.out = new Int32Array(v.w * v.h);
      this.image =
        typeof ImageData !== 'undefined'
          ? new ImageData(new Uint8ClampedArray(this.out.buffer as ArrayBuffer), v.w, v.h)
          : ({ data: new Uint8ClampedArray(this.out.buffer as ArrayBuffer), width: v.w, height: v.h } as unknown as ImageData);
      this.stats.w = v.w;
      this.stats.h = v.h;
      this.drawNow();
    }
    // Nearest-neighbour only when each art pixel covers at least two device pixels;
    // smaller thumbnails look better smoothed.
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const scale = Math.max(cw / v.w, ch / v.h) * dpr;
    if (this.canvas.style) this.canvas.style.imageRendering = scale >= 1.75 ? 'pixelated' : 'auto';
    this.update();
  }

  private drawNow() {
    if (!this.image) return;
    this.step(0, true);
  }

  private restoreExposure() {
    const g = this.gfx;
    if (this.bgExposure && g.exposure && g.exposureVersion !== this.bgExposureVersion) {
      g.exposure.set(this.bgExposure);
      g.exposureVersion = this.bgExposureVersion;
    }
  }

  private step(dt: number, draw: boolean) {
    const f = this.frame;
    const inp = this.inputs;
    const reduced = inp.reducedMotion;
    const sdt = dt * (reduced ? REDUCED_TIME_SCALE : 1);
    this.realT += dt;
    f.dt = sdt;
    f.t += sdt;
    f.playing = inp.playing;
    f.reduced = reduced;

    // Broadcast state (v5).
    const b = inp.broadcast?.();
    f.segmentKind = b?.segmentKind ?? 'music';
    f.voiceCategory = b?.voiceCategory ?? null;
    f.section = b?.section ?? 'verse';
    f.sectionProgress = b?.sectionProgress ?? 0;
    f.event = b?.event ?? null;
    f.hush = b?.hush ?? false;
    f.signal = b?.signal ?? 1;
    f.bleed = b?.bleed ?? 0;

    const rawSpeech = b?.speech !== undefined ? (b.speech > 0 ? (b.speech < 1 ? b.speech : 1) : 0) : 0;
    if (dt > 0) {
      const sAtt = 1 - Math.exp(-dt * 20);
      const sRel = 1 - Math.exp(-dt * 6);
      const cur = f.speech ?? 0;
      f.speech = cur + (rawSpeech - cur) * (rawSpeech > cur ? sAtt : sRel);
    } else {
      f.speech = rawSpeech;
    }
    if (reduced) f.speech = (f.speech ?? 0) * 0.3;

    // Audio energy → envelope + onset pulse (nudged by musical section drive).
    let raw = 0;
    if (inp.playing) {
      if (inp.energy) {
        raw = inp.energy();
        raw = raw > 0 ? (raw < 1 ? raw : 1) : 0;
      } else {
        // No analyser wired up: a gentle pretend groove at ~84 bpm.
        const ph = (this.realT * 1.4) % 1;
        raw = 0.28 + 0.3 * Math.pow(1 - ph, 6);
      }
      if (b?.section && f.segmentKind === 'music') {
        const drive = sectionDrive(f);
        raw = Math.min(1, Math.max(0, raw * (0.8 + 0.2 * drive)));
      }
    }
    if (dt > 0) {
      const att = 1 - Math.exp(-dt * 30);
      const rel = 1 - Math.exp(-dt * 4);
      f.energy += (raw - f.energy) * (raw > f.energy ? att : rel);
      this.slowEnergy += (raw - this.slowEnergy) * (1 - Math.exp(-dt * 1.5));
      if (raw > this.slowEnergy * 1.25 + 0.04 && this.realT - this.lastBeat > 0.28) {
        f.pulse = 1;
        f.beat++;
        this.lastBeat = this.realT;
      }
      f.pulse *= Math.exp(-dt * 7);
      f.awake += ((inp.playing ? 1 : 0) - f.awake) * (1 - Math.exp(-dt * 1.2));
    }
    if (reduced) {
      f.energy *= 0.3;
      f.pulse = 0;
    }

    // Rare events.
    f.rareT += sdt;
    if (f.t >= this.nextRare && this.def.rareEvents > 0) {
      f.rare = this.rng.int(0, this.def.rareEvents - 1);
      f.rareT = 0;
      f.rareSeed = this.rng.next();
      this.nextRare = f.t + this.rng.range(RARE_MIN_S, RARE_MAX_S);
    }
    if ((f.n & 127) === 0) f.hour = localHour();

    if (!draw || !this.image) {
      // Simulate without drawing (used by advance()).
      this.gfx.restore();
      this.restoreExposure();
      this.scene.frame(this.gfx, f);
      if (this.postEnabled) {
        applyBroadcastLens(this.gfx.buf, this.gfx.w, this.gfx.h, f, this.accentColor);
      }
      return;
    }

    const t0 = performance.now();
    const g = this.gfx;
    g.restore();
    this.restoreExposure();
    this.scene.frame(g, f);
    if (this.postEnabled) {
      applyBroadcastLens(g.buf, g.w, g.h, f, this.accentColor);
    }
    if (this.post && this.postEnabled) {
      this.post.apply(g.frame, this.out, g.w, g.h, g.ox, g.oy, g.exposure, g.exposureVersion, !reduced);
    } else this.out.set(g.frame);
    this.ctx?.putImageData?.(this.image, 0, 0);
    f.n++;
    const t1 = performance.now();

    this.statDraw += t1 - t0;
    this.statFrames++;
    if (!this.statSince) this.statSince = t1;
    if (t1 - this.statSince > 1000) {
      this.stats.drawMs = this.statDraw / this.statFrames;
      this.stats.fps = (this.statFrames * 1000) / (t1 - this.statSince);
      this.statDraw = 0;
      this.statFrames = 0;
      this.statSince = t1;
    }
    if (f.n === 1 && this.onFirstFrame) this.onFirstFrame();
  }
}

function localHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

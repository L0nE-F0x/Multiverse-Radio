// Music lab: a developer page for auditioning the generative music engine.
// Served at /lab/music.html in dev and in production builds.

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { RECIPE_IDS, type RecipeId, type RecipeTweaks } from '../broadcast/types';
import { createMusicEngine, getTrackInfo, RECIPE_INFO, renderTrack, type MusicEngine, type TrackInfo, type TrackRequest } from '../music';
import type { Engine } from '../music/engine/engine';
import { encodeWav } from '../music/wav';
import { STATIONS } from '../stations/roster';

type TweakKey = keyof RecipeTweaks;
const TWEAKS: { key: TweakKey; label: string; min: number; max: number; step: number; fallback: number }[] = [
  { key: 'bpm', label: 'Tempo', min: 40, max: 180, step: 1, fallback: 80 },
  { key: 'density', label: 'Density', min: 0, max: 1, step: 0.01, fallback: 0.5 },
  { key: 'grit', label: 'Grit', min: 0, max: 1, step: 0.01, fallback: 0.3 },
  { key: 'weirdness', label: 'Weirdness', min: 0, max: 1, step: 0.01, fallback: 0.15 },
  { key: 'brightness', label: 'Brightness', min: 0, max: 1, step: 0.01, fallback: 0.5 },
];

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Automation hook for headless measurements.
let labCtx: AudioContext | null = null;
let labEngine: Engine | null = null;
declare global {
  interface Window {
    __musicLab?: unknown;
  }
}
window.__musicLab = {
  async render(req: TrackRequest, seconds: number, offset = 0, sampleRate = 48000, solo?: number[]) {
    const t0 = performance.now();
    const buf = await renderTrack(req, seconds, { offset, sampleRate, solo });
    return { wav: base64(encodeWav(buf)), ms: performance.now() - t0 };
  },
  info: (req: TrackRequest) => getTrackInfo(req),
  async play(req: TrackRequest, opts: { offset?: number; fade?: number } = {}, solo?: number[]) {
    const ctx = (labCtx ??= new AudioContext({ latencyHint: 'playback' }));
    if (!labEngine) {
      labEngine = (await createMusicEngine(ctx)) as MusicEngine as Engine;
      labEngine.output.connect(ctx.destination);
    }
    await ctx.resume();
    labEngine.solo = solo ?? null;
    labEngine.play(req, opts);
    return { state: ctx.state, sampleRate: ctx.sampleRate };
  },
  stop: () => labEngine?.stop({ fade: 0.3 }),
  stats: () => ({
    time: labCtx?.currentTime ?? 0,
    state: labCtx?.state,
    engine: labEngine ? { ...labEngine.stats } : null,
    now: labEngine?.nowPlaying() ? { position: labEngine.nowPlaying()!.position, section: labEngine.nowPlaying()!.section?.name } : null,
  }),
  /** Offline render of a timed sequence of play/stop calls (tests crossfades and cancels). */
  async script(steps: { at: number; play?: TrackRequest; opts?: { when?: number; offset?: number; fade?: number }; stop?: { when?: number; fade?: number } }[], seconds: number) {
    const { Engine: EngineClass } = await import('../music/engine/engine');
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const engine = new EngineClass(ctx, true);
    engine.horizon = seconds + 1;
    engine.output.connect(ctx.destination);
    for (const step of steps) {
      void ctx.suspend(step.at).then(() => {
        if (step.play) engine.play(step.play, step.opts ?? {});
        if (step.stop) engine.stop(step.stop);
        void ctx.resume();
      });
    }
    const buf = await ctx.startRendering();
    return base64(encodeWav(buf));
  },
  async score(req: TrackRequest) {
    const { compose } = await import('../music/recipes');
    return compose(req);
  },
};

interface Levels {
  peak: number;
  rms: number;
  slow: number;
}

function useMeter(analyser: AnalyserNode | null, active: boolean): Levels {
  const [levels, setLevels] = useState<Levels>({ peak: -90, rms: -90, slow: -90 });
  useEffect(() => {
    if (!analyser || !active) return;
    const data = new Float32Array(analyser.fftSize);
    let raf = 0;
    let slowEnergy = 0;
    let peakHold = -90;
    const loop = () => {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      for (const x of data) {
        peak = Math.max(peak, Math.abs(x));
        sum += x * x;
      }
      const ms = sum / data.length;
      slowEnergy = slowEnergy * 0.985 + ms * 0.015;
      const db = (x: number) => (x > 0 ? 10 * Math.log10(x) : -90);
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -90;
      peakHold = Math.max(peakDb, peakHold - 0.4);
      setLevels({ peak: peakHold, rms: db(ms), slow: db(slowEnergy) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return levels;
}

function Meter({ label, db, target }: { label: string; db: number; target?: [number, number] }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v + 60) / 60) * 100))}%`;
  const hot = db > -1;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 text-cream/55">{label}</span>
      <div className="well relative h-3 flex-1 overflow-hidden rounded-full">
        {target && <div className="absolute inset-y-0 bg-teal/15" style={{ left: pct(target[0]), width: `calc(${pct(target[1])} - ${pct(target[0])})` }} />}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
          style={{ width: pct(db), background: hot ? '#ff4b3a' : 'linear-gradient(90deg, #4ecdc4, #ffaa44)' }}
        />
      </div>
      <span className={`w-16 shrink-0 text-right tabular-nums ${hot ? 'text-ember' : 'text-cream/80'}`}>{db <= -89 ? '−∞' : `${db.toFixed(1)} dB`}</span>
    </div>
  );
}

function Lab() {
  const [recipe, setRecipe] = useState<RecipeId>('lofi-hiphop');
  const [seed, setSeed] = useState(() => 20261012);
  const [duration, setDuration] = useState(180);
  const [offset, setOffset] = useState(0);
  const [tweaks, setTweaks] = useState<Partial<RecipeTweaks>>({});
  const [stationId, setStationId] = useState('');
  const [info, setInfo] = useState<TrackInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [lastRender, setLastRender] = useState<string | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const levels = useMeter(analyser, playing);

  const request = useMemo<TrackRequest>(() => ({ recipe, seed, durationSeconds: duration, tweaks }), [recipe, seed, duration, tweaks]);

  useEffect(() => {
    let live = true;
    getTrackInfo(request).then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [request]);

  const ensureEngine = useCallback(async () => {
    if (!ctxRef.current) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      ctxRef.current = ctx;
      const engine = (await createMusicEngine(ctx)) as MusicEngine as Engine;
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      engine.output.connect(an);
      an.connect(ctx.destination);
      engineRef.current = engine;
      setAnalyser(an);
    }
    await ctxRef.current.resume();
    return engineRef.current!;
  }, []);

  const play = useCallback(
    async (req: TrackRequest = request) => {
      const engine = await ensureEngine();
      engine.play(req, { offset, fade: 0.6 });
      setPlaying(true);
    },
    [ensureEngine, offset, request],
  );

  const stop = useCallback(() => {
    engineRef.current?.stop({ fade: 0.8 });
    setPlaying(false);
  }, []);

  // Track position for the timeline.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const now = engineRef.current?.nowPlaying();
      if (now) setPosition(now.position);
      else setPlaying(false);
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  const newSong = () => {
    const s = randomSeed();
    setSeed(s);
    if (playing) void play({ ...request, seed: s });
  };

  const pickStation = (id: string) => {
    setStationId(id);
    const st = STATIONS.find((s) => s.id === id);
    if (!st) return;
    setRecipe(st.recipe);
    setTweaks({ ...(st.tweaks ?? {}) });
  };

  const exportWav = async () => {
    setRendering(true);
    try {
      const t0 = performance.now();
      const buf = await renderTrack(request, 60, { offset, sampleRate: 48000 });
      const blob = new Blob([encodeWav(buf)], { type: 'audio/wav' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${recipe}-${seed}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setLastRender(`Rendered 60 s in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } finally {
      setRendering(false);
    }
  };

  const current = info?.sections.filter((s) => s.t <= position + 0.01).pop();
  const desc = RECIPE_INFO[recipe];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-cream sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-amber/70 uppercase">Multiverse Radio · workshop</p>
          <h1 className="font-display text-5xl tracking-wide">Music lab</h1>
        </div>
        <label className="flex items-center gap-2 font-mono text-xs text-cream/60">
          Station preset
          <select
            className="well rounded-lg px-3 py-2 text-cream"
            value={stationId}
            onChange={(e) => pickStation(e.target.value)}
          >
            <option value="">—</option>
            {STATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.frequency.toFixed(1)} {s.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="chassis p-5 sm:p-6">
          <h2 className="engraved font-mono text-xs tracking-[0.25em] uppercase">Recipe</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RECIPE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setRecipe(id);
                  setStationId('');
                  if (playing) void play({ ...request, recipe: id });
                }}
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  id === recipe ? 'bg-amber/20 text-amber ring-1 ring-amber/50' : 'bg-well text-cream/75 hover:bg-white/5'
                }`}
              >
                {RECIPE_INFO[id]?.label ?? id}
              </button>
            ))}
          </div>
          <p className="mt-3 min-h-10 text-sm text-cream/60">{desc?.description}</p>

          <div className="engraved-rule my-5" />

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-mono text-xs text-cream/60">
              Seed
              <input
                type="number"
                className="well w-36 rounded-lg px-3 py-2 text-cream"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) >>> 0)}
              />
            </label>
            <button type="button" onClick={newSong} className="rounded-lg bg-teal/15 px-4 py-2 text-sm text-teal ring-1 ring-teal/40 hover:bg-teal/25">
              New song
            </button>
            <label className="flex flex-col gap-1 font-mono text-xs text-cream/60">
              Length (s)
              <input
                type="number"
                min={8}
                className="well w-24 rounded-lg px-3 py-2 text-cream"
                value={duration}
                onChange={(e) => setDuration(Math.max(8, Number(e.target.value) || 180))}
              />
            </label>
            <label className="flex flex-col gap-1 font-mono text-xs text-cream/60">
              Join at (s)
              <input
                type="number"
                min={0}
                className="well w-24 rounded-lg px-3 py-2 text-cream"
                value={offset}
                onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            {TWEAKS.map((t) => {
              const set = tweaks[t.key] !== undefined;
              const value = tweaks[t.key] ?? t.fallback;
              return (
                <div key={t.key} className="flex items-center gap-3 text-sm">
                  <label className="flex w-32 shrink-0 items-center gap-2 text-cream/75">
                    <input
                      type="checkbox"
                      checked={set}
                      onChange={(e) =>
                        setTweaks((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[t.key] = value;
                          else delete next[t.key];
                          return next;
                        })
                      }
                      className="accent-amber"
                    />
                    {t.label}
                  </label>
                  <input
                    type="range"
                    min={t.min}
                    max={t.max}
                    step={t.step}
                    value={value}
                    disabled={!set}
                    onChange={(e) => setTweaks((prev) => ({ ...prev, [t.key]: Number(e.target.value) }))}
                    className="flex-1 accent-amber disabled:opacity-30"
                    aria-label={t.label}
                  />
                  <span className="w-14 text-right font-mono text-xs text-cream/60 tabular-nums">{set ? (t.key === 'bpm' ? value : value.toFixed(2)) : 'auto'}</span>
                </div>
              );
            })}
          </div>

          <div className="engraved-rule my-5" />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void play()}
              className="rounded-full bg-ember px-6 py-2.5 font-display text-xl tracking-wider text-void shadow-[0_0_30px_-6px_#ff6b35] hover:brightness-110"
            >
              {playing ? 'Restart' : 'Play'}
            </button>
            <button type="button" onClick={stop} disabled={!playing} className="rounded-full bg-well px-6 py-2.5 font-display text-xl tracking-wider text-cream/80 ring-1 ring-white/10 disabled:opacity-40">
              Stop
            </button>
            <button
              type="button"
              onClick={() => void exportWav()}
              disabled={rendering}
              className="rounded-full bg-well px-5 py-2.5 text-sm text-amber ring-1 ring-amber/30 hover:bg-amber/10 disabled:opacity-50"
            >
              {rendering ? 'Rendering…' : 'Render 60 s to WAV'}
            </button>
            {lastRender && <span className="font-mono text-xs text-cream/50">{lastRender}</span>}
          </div>
        </section>

        <section className="chassis flex flex-col gap-5 p-5 sm:p-6">
          <div className="display-glass rounded-2xl p-5">
            <div className="relative z-10 font-mono">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-3xl tracking-wide text-amber">{info?.key ?? '…'}</span>
                <span className="text-sm text-cream/70">
                  {info ? `${info.bpm} bpm · ${info.beatsPerBar}/4 · swing ${Math.round(info.swing * 100)}%` : ''}
                </span>
              </div>
              <p className="mt-2 text-xs break-words text-teal/90">{info?.progression}</p>
              <p className="mt-3 text-xs text-cream/55">{info?.instruments.join(' · ')}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-cream/70">
                <span>
                  {current ? (
                    <>
                      Section <span className="text-amber">{current.name}</span> · {current.chords.slice(0, 8).join('  ')}
                    </>
                  ) : (
                    'Not playing'
                  )}
                </span>
                <span className="tabular-nums">
                  {fmtTime(position)} / {fmtTime(duration)}
                </span>
              </div>
            </div>
          </div>

          {info && (
            <div>
              <div className="relative flex h-8 overflow-hidden rounded-lg">
                {info.sections.map((s) => (
                  <div
                    key={`${s.name}-${s.startBar}`}
                    className={`flex items-center justify-center border-r border-void text-[10px] ${
                      s.name === 'intro' || s.name === 'outro' ? 'bg-white/5 text-cream/50' : s.name.startsWith('B') ? 'bg-teal/20 text-teal' : 'bg-amber/15 text-amber'
                    }`}
                    style={{ width: `${(s.bars / info.bars) * 100}%` }}
                    title={`${s.name}: bars ${s.startBar + 1}–${s.startBar + s.bars}`}
                  >
                    {s.name}
                  </div>
                ))}
                <div className="absolute inset-y-0 w-0.5 bg-ember shadow-[0_0_8px_#ff6b35]" style={{ left: `${Math.min(100, (position / duration) * 100)}%` }} />
              </div>
              <p className="mt-2 font-mono text-[11px] text-cream/40">
                {info.bars} bars · {info.events} events
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="engraved font-mono text-xs tracking-[0.25em] uppercase">Output level</h2>
            <Meter label="Peak" db={levels.peak} />
            <Meter label="RMS" db={levels.rms} />
            <Meter label="Slow" db={levels.slow} target={[-22, -16]} />
            <p className="font-mono text-[11px] text-cream/40">Target: integrated ≈ −18 LUFS (slow RMS roughly −20 … −17 dB), peaks below −1 dBFS.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);

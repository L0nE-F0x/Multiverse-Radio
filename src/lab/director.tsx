// Director lab: a developer page for auditioning the broadcast director in isolation.
// Served at /lab/director.html in dev and in production builds.
//
// Power, tune, skip and time-warp around the schedule; watch the timeline, the bus meters
// and the ducking; read captions. `window.__mvr` exposes the internals for browser tests.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/bebas-neue/400.css';
import '../index.css';
import { CATEGORY_LABELS, segmentArtist, segmentTitle } from '../broadcast/describe';
import { useBroadcastEffects } from '../broadcast/effects';
import { HOUR_MS } from '../broadcast/scheduler';
import { director, library, useBroadcast } from '../broadcast/store';
import type { Segment } from '../broadcast/types';
import { STATIONS } from '../stations/roster';

Object.assign(window, {
  __mvr: {
    director,
    library,
    store: useBroadcast,
  },
});

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Re-renders at `hz` while mounted. */
function useNow(hz = 4): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return now;
}

function App() {
  useBroadcastEffects();
  const state = useBroadcast();
  const station = STATIONS.find((s) => s.id === state.stationId)!;
  useNow(4);

  const stationNow = director.stationNow();
  const schedule = director.schedule(station);
  const next = state.upNext[0];
  const nextVoice = schedule.upcoming(stationNow, 60).find((s) => s.kind === 'voice' && s.startMs > stationNow);
  const topOfHour = Math.ceil((stationNow + 1) / HOUR_MS) * HOUR_MS;

  return (
    <main className="min-h-dvh p-4 font-mono text-[13px] text-cream sm:p-6" style={{ ['--accent' as string]: station.color }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-4xl tracking-wide">Director lab</h1>
        <StatusPill status={state.status} />
        <span style={{ color: station.color }}>
          {station.frequency.toFixed(1)} · {station.name}
        </span>
        <span className="text-cream/50">
          {station.format} · {station.recipe}
          {station.recipePool ? ` (+${station.recipePool.length} pool)` : ''}
        </span>
        {state.signalMessage && <span className="text-ember">{state.signalMessage}</span>}
      </header>

      <section className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={state.togglePlay} data-testid="power" accent>
          {state.status === 'playing' || state.status === 'tuning' ? '■ Pause' : '⏻ Power'}
        </Button>
        <Button onClick={() => state.stepStation(-1)}>◀ Prev</Button>
        <select
          className="rounded border border-cream/20 bg-well px-2 py-1.5"
          value={state.stationId}
          onChange={(e) => state.tune(e.target.value)}
          data-testid="station"
        >
          {STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.frequency.toFixed(1)} {s.name} ({s.format})
            </option>
          ))}
        </select>
        <Button onClick={() => state.stepStation(1)}>Next ▶</Button>
        <Button onClick={state.scan}>Scan</Button>
        <Button onClick={state.skip} data-testid="skip">
          Jump to next ⏭
        </Button>
        <label className="ml-2 flex items-center gap-2">
          Vol
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            onChange={(e) => state.setVolume(Number(e.target.value))}
          />
        </label>
        <Button onClick={state.toggleMute}>{state.muted ? 'Unmute' : 'Mute'}</Button>
      </section>

      <section className="mt-2 flex flex-wrap items-center gap-2 text-cream/70">
        <span>Time warp:</span>
        {next && <Button onClick={() => director.seek(next.startMs - 5000)}>next segment −5 s</Button>}
        {nextVoice && <Button onClick={() => director.seek(nextVoice.startMs - 5000)}>next voice −5 s</Button>}
        <Button onClick={() => director.seek(topOfHour - 20_000)}>top of hour −20 s</Button>
        <Button onClick={() => director.seek(stationNow + 5 * 60_000)}>+5 min</Button>
        <Button onClick={() => director.seek(Date.now())}>back to live</Button>
        <span className="text-cream/50">
          station clock {time(stationNow)} (offset {mmss(Math.abs(director.offsetOf(station.id)))})
        </span>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Timeline (wall-clock times)">
          <Timeline stationNow={stationNow} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Caption">
            <p className="min-h-[3em] text-base" data-testid="caption">
              {state.caption ? (
                <>
                  <span style={{ color: station.color }}>{state.caption.speaker}:</span> {state.caption.text}
                </>
              ) : (
                <span className="text-cream/30">—</span>
              )}
            </p>
          </Panel>
          <Panel title="Meters">
            <Meters />
          </Panel>
          <Panel title="Engine">
            <DebugView />
          </Panel>
          <Panel title="Heard this session">
            <ol className="space-y-0.5">
              {state.recent.slice(0, 10).map((s) => (
                <li key={s.id} className="truncate text-cream/70">
                  {s.kind === 'track' ? '♪' : '🎙'} {segmentTitle(s)} <span className="text-cream/40">— {segmentArtist(s, station)}</span>
                </li>
              ))}
              {state.recent.length === 0 && <li className="text-cream/30">nothing yet</li>}
            </ol>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Timeline({ stationNow }: { stationNow: number }) {
  const state = useBroadcast();
  const station = STATIONS.find((s) => s.id === state.stationId)!;
  const schedule = director.schedule(station);
  const offset = director.offsetOf(station.id);
  const segments = schedule.segmentsBetween(stationNow - 12 * 60_000, stationNow + 25 * 60_000);
  return (
    <ol className="space-y-px" data-testid="timeline">
      {segments.map((s) => {
        const end = s.startMs + s.durationMs;
        const past = end <= stationNow;
        const live = s.startMs <= stationNow && end > stationNow;
        const failed = director.isFailed(s.id);
        const hourStart = s.startMs % HOUR_MS === 0;
        return (
          <li
            key={s.id}
            className={`relative grid grid-cols-[5.5rem_3rem_minmax(0,1fr)_3.5rem] gap-2 overflow-hidden rounded px-2 py-1 ${
              live ? 'bg-cream/10' : ''
            } ${past ? 'text-cream/35' : ''} ${hourStart ? 'border-t border-amber/60' : ''}`}
            data-live={live || undefined}
          >
            {live && (
              <span
                className="absolute inset-y-0 left-0 -z-0 opacity-20"
                style={{ width: `${((stationNow - s.startMs) / s.durationMs) * 100}%`, background: station.color }}
              />
            )}
            <span className="relative">{time(s.startMs - offset)}</span>
            <span className="relative">{s.kind === 'track' ? '♪' : s.bed ? '🎙♪' : '🎙'}</span>
            <span className="relative truncate">
              <SegmentLabel segment={s} />
              {failed && <span className="ml-2 text-ember">[failed → music]</span>}
            </span>
            <span className="relative text-right text-cream/60">{mmss(s.durationMs)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SegmentLabel({ segment }: { segment: Segment }) {
  if (segment.kind === 'track') {
    return (
      <>
        {segment.meta.title} <span className="text-cream/40">— {segment.meta.artist} · {segment.recipe}</span>
      </>
    );
  }
  return (
    <>
      <span className="text-teal">{CATEGORY_LABELS[segment.clip.category]}</span> {segment.clip.title ?? segment.clip.id}
      {segment.clip.daypart && <span className="text-cream/40"> · {segment.clip.daypart}</span>}
    </>
  );
}

function Meters() {
  const music = useRef<HTMLDivElement>(null);
  const voice = useRef<HTMLDivElement>(null);
  const mix = useRef<HTMLDivElement>(null);
  const duck = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const data = new Float32Array(512);
    const level = (node: AnalyserNode | undefined) => {
      if (!node) return -Infinity;
      node.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      return 10 * Math.log10(sum / data.length || 1e-12);
    };
    const width = (db: number) => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const mixer = director.getMixer();
      if (!mixer) return;
      const m = level(mixer.tap('music'));
      const v = level(mixer.tap('voice'));
      const x = level(mixer.tap('mix'));
      const d = 20 * Math.log10(Math.max(mixer.duck.gain.value, 1e-4));
      if (music.current) music.current.style.width = width(m);
      if (voice.current) voice.current.style.width = width(v);
      if (mix.current) mix.current.style.width = width(x);
      if (duck.current) duck.current.style.width = `${Math.min(100, (-d / 40) * 100)}%`;
      if (labels.current) {
        labels.current.textContent = `music ${m.toFixed(1)} dB · voice ${v.toFixed(1)} dB · mix ${x.toFixed(1)} dB · duck ${d.toFixed(1)} dB`;
        Object.assign(labels.current.dataset, { music: m.toFixed(1), voice: v.toFixed(1), mix: x.toFixed(1), duck: d.toFixed(1) });
      }
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, []);
  const bar = (ref: React.RefObject<HTMLDivElement | null>, label: string, color: string) => (
    <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-cream/60">{label}</span>
      <div className="h-3 overflow-hidden rounded bg-cream/10">
        <div ref={ref} className="h-full transition-[width] duration-75" style={{ width: 0, background: color }} />
      </div>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {bar(music, 'music', '#ffaa44')}
      {bar(voice, 'voice', '#4ecdc4')}
      {bar(mix, 'mix', '#f0e6d2')}
      {bar(duck, 'duck ↓', '#ff6b35')}
      <div ref={labels} className="pt-1 text-[11px] text-cream/50" data-testid="meters" />
    </div>
  );
}

function DebugView() {
  useNow(2);
  const d = director.debug();
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-0.5" data-testid="debug">
        <dt className="text-cream/50">context</dt>
        <dd>
          {d.ctxState} · {d.ctxTime.toFixed(2)} s · {d.outputMode} · latency {(d.latency * 1000).toFixed(0)} ms
        </dd>
        <dt className="text-cream/50">music engine</dt>
        <dd>{d.engine}</dd>
        <dt className="text-cream/50">music run</dt>
        <dd className="truncate">{d.music ? `${d.music.recipe} #${d.music.seed} (${mmss(d.music.endMs - d.music.startMs)})` : '—'}</dd>
        <dt className="text-cream/50">music next</dt>
        <dd className="truncate">
          {d.musicPending ? `${d.musicPending.run ? d.musicPending.run.recipe : 'stop'} @ ${time(d.musicPending.boundaryMs - d.offset)}` : '—'}
        </dd>
        <dt className="text-cream/50">voices queued</dt>
        <dd className="truncate">{d.voices.join(', ') || '—'}</dd>
        <dt className="text-cream/50">failed slots</dt>
        <dd className="truncate">{d.failed.join(', ') || '—'}</dd>
        <dt className="text-cream/50">clip cache</dt>
        <dd>
          {(d.cacheBytes / 1048576).toFixed(1)} MB in {d.cacheEntries} clips
        </dd>
        <dt className="text-cream/50">JS heap</dt>
        <dd>{heap ? `${(heap / 1048576).toFixed(1)} MB` : 'n/a'}</dd>
      </dl>
      <ol className="max-h-56 overflow-auto rounded bg-well p-2 text-[11px] leading-snug text-cream/70" data-testid="log">
        {[...director.log]
          .reverse()
          .slice(0, 40)
          .map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <span className="text-cream/40">{time(entry.at)}</span> {entry.text}
            </li>
          ))}
      </ol>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'playing' ? '#4ecdc4' : status === 'tuning' ? '#ffaa44' : status === 'lost' ? '#ff6b35' : '#f0e6d266';
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-widest" style={{ borderColor: color, color }} data-testid="status">
      {status}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-cream/10 bg-chassis/60 p-3">
      <h2 className="mb-2 text-[11px] tracking-[0.2em] text-cream/50 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Button({ children, accent, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { accent?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded border px-3 py-1.5 hover:bg-cream/10 ${accent ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-cream/20'}`}
    >
      {children}
    </button>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

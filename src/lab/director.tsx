// Director lab: a developer page for auditioning the broadcast director in isolation.
// Served at /lab/director.html in dev and in production builds.
//
// Power, tune, fine-tune across the whole dial, skip and time-warp around the schedule;
// force multiverse events and HUSH notices; watch the timeline, the bus meters and the
// ducking; read captions. `window.__mvr` exposes the internals for browser tests.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/bebas-neue/400.css';
import '../index.css';
import { CATEGORY_LABELS, segmentArtist, segmentTitle } from '../broadcast/describe';
import * as dial from '../broadcast/dial';
import { useBroadcastEffects } from '../broadcast/effects';
import * as events from '../broadcast/events';
import { HUSH_LEVEL_AT_MS } from '../broadcast/hush';
import { POOLS } from '../broadcast/library';
import { HOUR_MS } from '../broadcast/scheduler';
import { director, library, useBroadcast } from '../broadcast/store';
import { localTime } from '../broadcast/time';
import { EVENT_IDS, type EventId, type Segment, type StationDef, type Tuned, type VoiceClip, type VoiceManifest } from '../broadcast/types';
import { STATIONS } from '../stations/roster';

Object.assign(window, {
  __mvr: {
    director,
    library,
    store: useBroadcast,
    dial,
    events,
    loadFixtures,
  },
});

/** The events/HUSH overlay (loaded before the lab renders). */
const overlay = () => director.overlay!;

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hhmm = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
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

function describeTuned(tuned: Tuned, discovered: string[]): string {
  switch (tuned.kind) {
    case 'static':
      return 'static';
    case 'oddity':
      return `oddity · ${tuned.label} (${tuned.oddity})`;
    case 'pirate':
      return `pirate · ${tuned.station.name}${discovered.includes(tuned.station.id) ? ' ✓' : ''}`;
    case 'station':
      return `${tuned.station.secret ? 'SECRET · ' : ''}${tuned.station.name}${
        tuned.station.secret ? (discovered.includes(tuned.station.id) ? ' ✓ found' : ' (not yet found)') : ''
      }`;
  }
}

function App() {
  useBroadcastEffects();
  const state = useBroadcast();
  useNow(4);
  const station = director.station;
  const onStatic = director.program === null;

  const stationNow = director.stationNow();
  const schedule = onStatic ? null : director.schedule(station);
  const next = state.upNext[0];
  const nextVoice = schedule?.upcoming(stationNow, 60).find((s) => s.kind === 'voice' && s.startMs > stationNow);
  const topOfHour = Math.ceil((stationNow + 1) / HOUR_MS) * HOUR_MS;

  return (
    <main className="min-h-dvh p-4 font-mono text-[13px] text-cream sm:p-6" style={{ ['--accent' as string]: station.color }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-4xl tracking-wide">Director lab</h1>
        <StatusPill status={state.status} />
        <span style={{ color: station.color }} data-testid="programme">
          {onStatic ? `${state.frequency.toFixed(2)} · static` : `${station.frequency.toFixed(2)} · ${station.name}`}
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
          value={STATIONS.some((s) => s.id === state.stationId) ? state.stationId : ''}
          onChange={(e) => state.tune(e.target.value)}
          data-testid="station"
        >
          <option value="">(off the roster)</option>
          {STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.frequency.toFixed(2)} {s.name} ({s.format}){s.secret ? ' — secret' : ''}
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
        <span>Station clock:</span>
        {next && <Button onClick={() => director.seek(next.startMs - 5000)}>next segment −5 s</Button>}
        {nextVoice && <Button onClick={() => director.seek(nextVoice.startMs - 5000)}>next voice −5 s</Button>}
        <Button onClick={() => director.seek(topOfHour - 20_000)}>top of hour −20 s</Button>
        <Button onClick={() => director.seek(stationNow + 5 * 60_000)}>+5 min</Button>
        <Button onClick={() => director.seek(director.clock.now())}>back to live</Button>
        <span className="text-cream/50">
          {time(stationNow)} (offset {mmss(Math.abs(director.offsetOf(director.stationId)))})
        </span>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DialPanel />
        <LivingPanel />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Timeline (wall-clock times)">{schedule ? <Timeline station={station} stationNow={stationNow} /> : <p className="text-cream/40">Bare static: no programme.</p>}</Panel>
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
                  {s.kind === 'track' ? '♪' : '🎙'} {segmentTitle(s)}{' '}
                  <span className="text-cream/40">— {segmentArtist(s, dial.stationForId(s.stationId) ?? station)}</span>
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

// ── The dial ──────────────────────────────────────────────────────────────────

const KIND_COLOR = { station: '#f0e6d2', secret: '#ffd166', pirate: '#ff6b6b', oddity: '#4ecdc4' } as const;

function DialPanel() {
  const frequency = useBroadcast((s) => s.frequency);
  const signal = useBroadcast((s) => s.signal);
  const tuned = useBroadcast((s) => s.tuned);
  const discovered = useBroadcast((s) => s.discovered);
  const { tuneFrequency, nudge } = useBroadcast.getState();
  const [centre, setCentre] = useState(frequency);
  const fineFrom = Math.max(76, centre - 1);
  const fineTo = Math.min(160, centre + 1);
  useEffect(() => {
    if (frequency < fineFrom || frequency > fineTo) setCentre(frequency);
  }, [frequency, fineFrom, fineTo]);
  const near = dial.transmitters().filter((t) => t.frequency >= fineFrom - 0.05 && t.frequency <= fineTo + 0.05);
  const jumpTo = (list: readonly dial.Transmitter[], dir: 1 | -1) => {
    const sorted = dir > 0 ? list : [...list].reverse();
    const t = sorted.find((x) => (dir > 0 ? x.frequency > frequency + 0.001 : x.frequency < frequency - 0.001)) ?? sorted[0];
    if (t?.kind === 'oddity') tuneFrequency(t.frequency);
    else if (t) useBroadcast.getState().tune(t.id);
  };
  const pos = (f: number) => `${((f - fineFrom) / (fineTo - fineFrom)) * 100}%`;
  return (
    <Panel title="Dial">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-3xl tracking-wide" data-testid="frequency">
          {frequency.toFixed(3)} MHz
        </span>
        <span className="truncate text-cream/70" data-testid="tuned">
          {describeTuned(tuned, discovered)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[4rem_minmax(0,1fr)_3rem] items-center gap-2">
        <span className="text-cream/60">signal</span>
        <div className="h-3 overflow-hidden rounded bg-cream/10">
          <div className="h-full transition-[width] duration-75" style={{ width: `${signal * 100}%`, background: "#4ecdc4" }} data-testid="signal" />
        </div>
        <span className="text-right">{signal.toFixed(2)}</span>
      </div>
      <label className="mt-3 block text-cream/60">
        whole dial (76–160)
        <input
          type="range"
          className="block w-full"
          min={76}
          max={160}
          step={0.01}
          value={frequency}
          onChange={(e) => tuneFrequency(Number(e.target.value))}
          data-testid="dial-coarse"
        />
      </label>
      <label className="mt-2 block text-cream/60">
        fine ({fineFrom.toFixed(2)}–{fineTo.toFixed(2)})
        <div className="relative mt-1 h-5">
          {near.map((t) => (
            <span
              key={t.id}
              title={`${t.frequency.toFixed(2)} ${t.kind === 'station' ? t.station.name : t.id}`}
              className="absolute top-0 h-5 w-[2px]"
              style={{
                left: pos(t.frequency),
                background: t.kind === 'station' && t.station.secret ? KIND_COLOR.secret : KIND_COLOR[t.kind],
                opacity: t.kind === 'station' && !t.station.secret ? 0.9 : 0.7,
              }}
            />
          ))}
          <span className="absolute top-0 h-5 w-[2px] bg-ember" style={{ left: pos(frequency) }} />
        </div>
        <input
          type="range"
          className="block w-full"
          min={fineFrom}
          max={fineTo}
          step={0.005}
          value={frequency}
          onChange={(e) => tuneFrequency(Number(e.target.value))}
          onPointerUp={() => setCentre(frequency)}
          data-testid="dial-fine"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[-1, -0.05, -0.01, 0.01, 0.05, 1].map((d) => (
          <Button key={d} onClick={() => nudge(d)}>
            {d > 0 ? '+' : '−'}
            {Math.abs(d)}
          </Button>
        ))}
        <Button onClick={() => jumpTo(dial.pirates(), -1)}>◀ pirate</Button>
        <Button onClick={() => jumpTo(dial.pirates(), 1)}>pirate ▶</Button>
        <Button onClick={() => jumpTo(dial.oddities(), 1)}>oddity ▶</Button>
        {STATIONS.filter((s) => s.secret).map((s) => (
          <Button key={s.id} onClick={() => tuneFrequency(s.frequency)}>
            {s.frequency.toFixed(2)}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-cream/40">
        {dial.pirates().length} pirates · {dial.oddities().length} oddities · found {discovered.length}: {discovered.slice(-6).join(', ') || '—'}
      </p>
    </Panel>
  );
}

// ── Shows, events and HUSH ────────────────────────────────────────────────────

function LivingPanel() {
  const show = useBroadcast((s) => s.show);
  const event = useBroadcast((s) => s.event);
  const tuned = useBroadcast((s) => s.tuned);
  useNow(2);
  const [force, setForce] = useState<EventId>('dimensional-storm');
  const wall = director.clock.now();
  const upcoming = overlay().nextEventAfter(wall);
  const d = director.debug();
  const local = localTime(wall);
  const shows = tuned.kind === 'station' ? library.shows(tuned.station.id) : [];
  const nextHour = Math.ceil((wall + 1) / HOUR_MS) * HOUR_MS;
  const speaking = overlay().speaking(wall);
  const plan = event ? overlay().plan(event, director.program?.id ?? null) : null;
  return (
    <Panel title="Living schedule">
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 gap-y-1" data-testid="living">
        <dt className="text-cream/50">local time</dt>
        <dd>
          {time(wall)} · {local.date} {director.warp !== 0 && <span className="text-ember">(warped {hhmm(Math.abs(director.warp))})</span>}
        </dd>
        <dt className="text-cream/50">show</dt>
        <dd data-testid="show">
          {show ? `${show.name} (${show.start}:00–${show.end}:00)` : '—'}
          <span className="text-cream/40"> · {shows.length ? shows.map((s) => `${s.id} ${s.start}–${s.end}`).join(', ') : 'no shows loaded'}</span>
        </dd>
        <dt className="text-cream/50">event</dt>
        <dd data-testid="event">
          {event ? (
            <span className="text-ember">
              {event.name} · {mmss(event.startMs + event.durationMs - wall)} left · {plan?.clips.length ?? 0} clips
              {plan?.slip ? ` · replaying until ${time(plan.slip.toMs)}` : ''}
            </span>
          ) : (
            '—'
          )}
          <span className="text-cream/40">
            {' '}
            · next {upcoming.name} in {mmss(upcoming.startMs - wall)} ({mmss(upcoming.durationMs)})
          </span>
        </dd>
        <dt className="text-cream/50">HUSH</dt>
        <dd data-testid="hush">
          level {d.hushLevel}
          {overlay().levelOverride !== null ? ' (pinned)' : ''} · listened {hhmm(d.listenMs)} · next in {mmss(d.hushInMs)}
          {speaking && <span className="text-teal"> · {speaking.kind === 'ship' ? 'speaking' : 'event clip'}</span>}
        </dd>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="rounded border border-cream/20 bg-well px-2 py-1.5" value={force} onChange={(e) => setForce(e.target.value as EventId)}>
          {EVENT_IDS.map((id) => (
            <option key={id} value={id}>
              {events.EVENT_NAMES[id]}
            </option>
          ))}
        </select>
        <Button onClick={() => overlay().force(force, director.clock.now(), 75_000)} data-testid="force-event">
          Force event
        </Button>
        <Button onClick={() => (overlay().forced = null)}>End forced</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-cream/70">
        <span>Time warp:</span>
        <Button onClick={() => director.warpBy(upcoming.startMs - 10_000 - wall)} data-testid="warp-event">
          next event −10 s
        </Button>
        <Button onClick={() => director.warpBy(nextHour - 20_000 - wall)}>next hour −20 s</Button>
        <Button onClick={() => director.warpBy(HOUR_MS)}>+1 h</Button>
        <Button onClick={() => director.warpBy(-director.warp)}>reset</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-cream/70">
        <span>HUSH:</span>
        <select
          className="rounded border border-cream/20 bg-well px-2 py-1.5"
          value={overlay().levelOverride ?? 'auto'}
          onChange={(e) => (overlay().levelOverride = e.target.value === 'auto' ? null : (Number(e.target.value) as 0 | 1 | 2 | 3))}
        >
          <option value="auto">level: by session</option>
          {[0, 1, 2, 3].map((l) => (
            <option key={l} value={l}>
              level {l} (after {hhmm(HUSH_LEVEL_AT_MS[l]!)})
            </option>
          ))}
        </select>
        <Button onClick={() => overlay().hushNow()} data-testid="hush-now">
          HUSH now
        </Button>
        <Button onClick={() => (overlay().listenMs += 45 * 60_000)}>+45 min listening</Button>
        <Button onClick={() => loadFixtures()} data-testid="fixtures">
          Load test pools
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-cream/40">
        pools: {[POOLS.ship, POOLS.events, POOLS.pirate, POOLS.oddities].map((p) => `${p} ${library.pool(p).length}`).join(' · ')}
      </p>
    </Panel>
  );
}

/**
 * Stand-in pools until the v3 voice render lands: real clips from v2 stations, re-tagged as
 * HUSH notices, event clips, pirate links and oddity announcements, plus a show on the
 * tuned station for the current hour.
 */
async function loadFixtures(): Promise<void> {
  await Promise.all(['void-beats', 'every-news', 'neon-2087', 'numbers-omega', 'channel-surf'].map((id) => library.load(id)));
  const clips = (id: string) => library.pool(id);
  const manifest = (station: string, list: VoiceClip[]): VoiceManifest => ({ version: 1, station, clips: list });
  const ship = clips('void-beats')
    .filter((c) => c.category === 'id' || c.category === 'dj')
    .slice(0, 12)
    .map((c, i) => ({ ...c, id: `ship-${i}`, category: 'ship' as const, level: i % 4 }));
  const news = clips('every-news').concat(clips('channel-surf'));
  const ev: VoiceClip[] = EVENT_IDS.flatMap((id, n) =>
    news
      .filter((c) => c.durationMs < 40_000)
      .slice(n * 2, n * 2 + 2)
      .map((c, i) => ({ ...c, id: `${id}-${i}`, category: 'event' as const, event: id })),
  );
  const pirate = clips('neon-2087').filter((c) => c.category === 'id' || c.category === 'dj' || c.category === 'ad');
  const odd = clips('numbers-omega').filter((c) => c.durationMs < 30_000);
  library.setOverride(POOLS.ship, manifest(POOLS.ship, ship));
  library.setOverride(POOLS.events, manifest(POOLS.events, ev));
  library.setOverride(POOLS.pirate, manifest(POOLS.pirate, pirate));
  library.setOverride(POOLS.oddities, manifest(POOLS.oddities, odd));
  const hour = localTime(director.clock.now()).hour;
  library.setShowsOverride({
    version: 1,
    shows: Object.fromEntries(
      STATIONS.map((s) => [s.id, [{ id: 'lab-hour', name: `The Lab Hour on ${s.name}`, blurb: 'A test show.', start: hour, end: (hour + 1) % 24 || 24 }]]),
    ),
  });
}

// ── Timeline, meters, engine ──────────────────────────────────────────────────

function Timeline({ station, stationNow }: { station: StationDef; stationNow: number }) {
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
  const { clip } = segment;
  const tags = [clip.daypart, clip.part && `${clip.part}${clip.kit ? `:${clip.kit}` : ''}`, clip.show && `show:${clip.show}`, clip.serial && `${clip.serial.id} #${clip.serial.episode}`, clip.dates?.join(',')].filter(Boolean);
  return (
    <>
      <span className="text-teal">{CATEGORY_LABELS[clip.category]}</span> {clip.title ?? clip.id}
      {tags.length > 0 && <span className="text-cream/40"> · {tags.join(' · ')}</span>}
    </>
  );
}

function Meters() {
  const music = useRef<HTMLDivElement>(null);
  const voice = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
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
      const o = level(mixer.tap('overlay'));
      const x = level(mixer.tap('mix'));
      const d = 20 * Math.log10(Math.max(mixer.duck.gain.value * mixer.eventDuck.gain.value, 1e-4));
      if (music.current) music.current.style.width = width(m);
      if (voice.current) voice.current.style.width = width(v);
      if (overlay.current) overlay.current.style.width = width(o);
      if (mix.current) mix.current.style.width = width(x);
      if (duck.current) duck.current.style.width = `${Math.min(100, (-d / 40) * 100)}%`;
      if (labels.current) {
        labels.current.textContent = `music ${m.toFixed(1)} dB · voice ${v.toFixed(1)} dB · overlay ${o.toFixed(1)} dB · mix ${x.toFixed(1)} dB · duck ${d.toFixed(1)} dB`;
        Object.assign(labels.current.dataset, {
          music: m.toFixed(1),
          voice: v.toFixed(1),
          overlay: o.toFixed(1),
          mix: x.toFixed(1),
          duck: d.toFixed(1),
        });
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
      {bar(overlay, 'overlay', '#b48cff')}
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
        <dt className="text-cream/50">programme</dt>
        <dd className="truncate">
          {d.program ?? 'static'} · signal {d.signal.toFixed(2)} · dial noise {d.dialNoise ? 'on' : 'off'}
          {d.shiftMs ? ` · slipped ${d.shiftMs / 1000} s` : ''}
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
        <dd data-testid="heap">{heap ? `${(heap / 1048576).toFixed(1)} MB` : 'n/a'}</dd>
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

// The lab always has the overlay (the app loads it on first power-on).
void director.loadOverlay().then(() => createRoot(document.getElementById("root")!).render(<App />));

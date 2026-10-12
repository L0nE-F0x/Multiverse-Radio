// Scenes lab: a developer page for auditioning every scene in isolation.
// Served at /lab/scenes.html in dev and in production builds.
//
// URL params (handy for screenshots):
//   ?scene=<id>     open that scene enlarged      &solo=1    scene only, filling the window
//   &aspect=16:9|4:3|9:16|21:9                     &playing=0 &reduced=1
//   &energy=beat|<0..1>                            &rare=<k>  start rare event k
//   &advance=<seconds>  fast-forward the scene clock
//   &hud=1          overlay a mock of the HUD bands (top 12 %, bottom 25 %) to judge composition
//   &raw=1          skip the post pass (grade, vignette, grain, bloom): the raster as drawn
//   &variant=<key>  variation key (defaults to the station id; pirates and oddities vary by it)

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type PhosphorId, SCENE_IDS, type SceneId, type StationDef } from '../broadcast/types';
import { SceneView } from '../scenes/SceneView';
import { SCENES, loadScene, sceneEntry } from '../scenes/registry';
import type { SceneRunner } from '../scenes/runner';
import { STATIONS } from '../stations/roster';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '../index.css';

type Aspect = '16:9' | '4:3' | '9:16' | '21:9';
const ASPECTS: Aspect[] = ['16:9', '4:3', '9:16', '21:9'];
const RATIO: Record<Aspect, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '9:16': 9 / 16, '21:9': 21 / 9 };
const PHOSPHOR: Record<PhosphorId, string> = {
  amber: '#ffb000',
  green: '#33ff88',
  cyan: '#5ce1ff',
  white: '#e8eef5',
  red: '#ff5a4a',
  violet: '#b48cff',
  rose: '#ff7aa8',
};
/** Pirates and oddities have no roster station: they get a neutral accent and an amber HUD. */
const NEUTRAL_ACCENT = '#ffb000';

const params = new URLSearchParams(location.search);

/** Everything the lab needs to show one scene, with or without a roster station. */
interface Entry {
  id: SceneId;
  station?: StationDef;
  name: string;
  accent: string;
  phosphor: string;
  frequency?: number;
  /** False while the scene is still missing and shows the fallback. */
  drawn: boolean;
}

function entryFor(id: SceneId): Entry {
  const station = STATIONS.find((s) => s.scene === id);
  const pretty = id.replace(/-/g, ' ').replace(/^(pirate|oddity) /, (m) => `${m.trim()}: `);
  return {
    id,
    station,
    name: station?.name ?? pretty,
    accent: station?.color ?? NEUTRAL_ACCENT,
    phosphor: PHOSPHOR[station?.phosphor ?? 'amber'],
    frequency: station?.frequency,
    drawn: Boolean(SCENES[id]),
  };
}

// Stations in dial order, then the scenes without a station (pirates, oddities).
const ENTRIES: Entry[] = [
  ...[...STATIONS].sort((a, b) => a.frequency - b.frequency).map((s) => entryFor(s.scene)),
  ...SCENE_IDS.filter((id) => !STATIONS.some((s) => s.scene === id)).map(entryFor),
];
const ORDER: SceneId[] = ENTRIES.map((e) => e.id);

interface Knobs {
  playing: boolean;
  reduced: boolean;
  energyMode: 'beat' | 'manual';
  level: number;
  bpm: number;
  aspect: Aspect;
  hud: boolean;
  raw: boolean;
}

function useEnergy(knobs: Knobs) {
  const ref = useRef(knobs);
  ref.current = knobs;
  return useCallback(() => {
    const k = ref.current;
    if (k.energyMode === 'manual') return k.level;
    const beat = ((performance.now() / 1000) * k.bpm) / 60;
    const phase = beat % 1;
    const bar = Math.floor(beat) % 4;
    return 0.22 + (bar === 0 ? 0.55 : 0.4) * Math.exp(-phase * 7) + 0.05 * Math.sin(beat * 0.7);
  }, []);
}

function App() {
  const initialEnergy = params.get('energy');
  const [knobs, setKnobs] = useState<Knobs>({
    playing: params.get('playing') !== '0',
    reduced: params.get('reduced') === '1',
    energyMode: initialEnergy && initialEnergy !== 'beat' ? 'manual' : 'beat',
    level: initialEnergy && initialEnergy !== 'beat' ? Number(initialEnergy) : 0.4,
    bpm: 84,
    aspect: (ASPECTS.find((a) => a === params.get('aspect')) ?? '16:9') as Aspect,
    hud: params.get('hud') === '1',
    raw: params.get('raw') === '1',
  });
  const requested = params.get('scene') as SceneId | null;
  const [open, setOpen] = useState<SceneId | null>(requested && SCENE_IDS.includes(requested) ? requested : null);
  const [rareAll, setRareAll] = useState(0);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const energy = useEnergy(knobs);
  const set = (patch: Partial<Knobs>) => setKnobs((k) => ({ ...k, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (!open) return;
      const i = ORDER.indexOf(open);
      if (e.key === 'ArrowRight') setOpen(ORDER[(i + 1) % ORDER.length]!);
      if (e.key === 'ArrowLeft') setOpen(ORDER[(i + ORDER.length - 1) % ORDER.length]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (params.get('solo') === '1' && open) {
    return <Solo entry={entryFor(open)} knobs={knobs} energy={energy} />;
  }

  const drawn = ENTRIES.filter((e) => e.drawn).length;
  const shown = onlyMissing ? ENTRIES.filter((e) => !e.drawn) : ENTRIES;

  return (
    <main className="min-h-screen p-4 font-mono text-cream sm:p-8">
      <header className="mb-6 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide">Scenes lab</h1>
          <p className="text-sm text-cream/60">
            {SCENE_IDS.length} viewports · {drawn} drawn, {SCENE_IDS.length - drawn} still on the fallback. Click one to enlarge (← → to
            flip, Esc to close).
          </p>
        </div>
        <Controls knobs={knobs} set={set} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> only missing
        </label>
        <button className="rounded border border-cream/30 px-3 py-1 text-sm hover:bg-cream/10" onClick={() => setRareAll((n) => n + 1)}>
          Rare event (all)
        </button>
      </header>

      <div className={`${open ? 'hidden' : 'grid'} gap-4 ${knobs.aspect === '9:16' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'}`}>
        {shown.map((e) => (
          <button
            key={e.id}
            onClick={() => setOpen(e.id)}
            className="group overflow-hidden rounded-lg border border-cream/10 bg-black/40 text-left transition hover:border-cream/40"
          >
            <div className="relative" style={{ aspectRatio: RATIO[knobs.aspect] }}>
              <SceneView
                sceneId={e.id}
                accent={e.accent}
                variantKey={e.station?.id ?? e.id}
                playing={knobs.playing}
                energy={energy}
                reducedMotion={knobs.reduced}
                rareNonce={rareAll}
                raw={knobs.raw}
              />
              {knobs.hud && <HudMock entry={e} />}
              {!e.drawn && <Missing />}
            </div>
            <div className="flex items-baseline justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm" style={{ color: e.accent }}>
                {e.name}
                {e.station?.secret ? ' · secret' : ''}
              </span>
              <span className="shrink-0 text-xs text-cream/40">
                {e.frequency !== undefined ? `${e.frequency.toFixed(e.frequency % 1 ? 2 : 1)} · ` : ''}
                {e.id}
              </span>
            </div>
          </button>
        ))}
      </div>

      {open && <Enlarged entry={entryFor(open)} knobs={knobs} set={set} energy={energy} onClose={() => setOpen(null)} />}
    </main>
  );
}

/** Badge for scenes still showing the fallback TV. */
function Missing() {
  return (
    <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/75 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#ffb000]">
      not drawn yet · fallback
    </span>
  );
}

/**
 * A stand-in for the ship's HUD: the bands the real interface covers (top ~12 %, bottom ~25 %),
 * with a few readouts so the scene's composition can be judged under them.
 */
function HudMock({ entry }: { entry: Entry }) {
  const c = entry.phosphor;
  const band = 'rgb(10 8 4 / 0.62)';
  const text: CSSProperties = { fontSize: 'clamp(7px, 1.5cqmin, 14px)', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 font-mono" style={{ color: c, containerType: 'size' }}>
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-[3%]"
        style={{ height: '12%', background: band, borderBottom: `1px solid ${c}66`, textShadow: `0 0 6px ${c}88`, ...text }}
      >
        <span>R/S Nightjar · Relay 7</span>
        <span className="opacity-70">{entry.frequency !== undefined ? `${entry.frequency.toFixed(2)} MHz` : 'Signal: unlisted'}</span>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col justify-between px-[3%] py-[1.5%]"
        style={{ height: '25%', background: band, borderTop: `1px solid ${c}66`, textShadow: `0 0 6px ${c}88`, ...text }}
      >
        <div className="flex justify-between">
          <span>{entry.name}</span>
          <span className="opacity-70">Sig ▮▮▮▮▯</span>
        </div>
        <div className="h-px w-full" style={{ background: `${c}55` }} />
        <div className="flex justify-between opacity-70">
          <span>Now: an untitled track by a band from elsewhere</span>
        </div>
        <div className="flex gap-[3%] opacity-80">
          {['F1 Power', 'F2 Tune', 'F3 Log', 'F4 Guide'].map((k) => (
            <span key={k}>{k}</span>
          ))}
        </div>
      </div>
      {/* Faint scanlines, as the real HUD has. */}
      <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(transparent 0 2px, rgb(0 0 0 / 0.12) 2px 3px)' }} />
    </div>
  );
}

function Controls({ knobs, set }: { knobs: Knobs; set: (p: Partial<Knobs>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={knobs.playing} onChange={(e) => set({ playing: e.target.checked })} /> playing
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={knobs.reduced} onChange={(e) => set({ reduced: e.target.checked })} /> reduced motion
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={knobs.hud} onChange={(e) => set({ hud: e.target.checked })} /> HUD overlay
      </label>
      <label className="flex items-center gap-2" title="Skip the grade, vignette, grain and bloom">
        <input type="checkbox" checked={knobs.raw} onChange={(e) => set({ raw: e.target.checked })} /> raw
      </label>
      <label className="flex items-center gap-2">
        energy
        <select
          className="rounded bg-black/50 px-1"
          value={knobs.energyMode}
          onChange={(e) => set({ energyMode: e.target.value as Knobs['energyMode'] })}
        >
          <option value="beat">fake beat</option>
          <option value="manual">manual</option>
        </select>
        {knobs.energyMode === 'manual' ? (
          <input type="range" min={0} max={1} step={0.01} value={knobs.level} onChange={(e) => set({ level: Number(e.target.value) })} />
        ) : (
          <input type="range" min={50} max={170} step={1} value={knobs.bpm} onChange={(e) => set({ bpm: Number(e.target.value) })} />
        )}
        <span className="w-14 text-cream/50">{knobs.energyMode === 'manual' ? knobs.level.toFixed(2) : `${knobs.bpm} bpm`}</span>
      </label>
      <div className="flex overflow-hidden rounded border border-cream/30">
        {ASPECTS.map((a) => (
          <button
            key={a}
            onClick={() => set({ aspect: a })}
            className={`px-2 py-0.5 ${knobs.aspect === a ? 'bg-cream text-black' : 'hover:bg-cream/10'}`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

function useRunnerStats() {
  const [runner, setRunner] = useState<SceneRunner | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return { runner, setRunner };
}

function Enlarged({
  entry,
  knobs,
  set,
  energy,
  onClose,
}: {
  entry: Entry;
  knobs: Knobs;
  set: (p: Partial<Knobs>) => void;
  energy: () => number;
  onClose: () => void;
}) {
  const { id, station } = entry;
  const [rare, setRare] = useState({ nonce: Number(params.get('rare') !== null), kind: Number(params.get('rare') ?? 0) });
  const { runner, setRunner } = useRunnerStats();
  const [rareCount, setRareCount] = useState(0);
  const [variant, setVariant] = useState(params.get('variant') ?? station?.id ?? id);
  useEffect(() => {
    void loadScene(id).then((d) => setRareCount(d.rareEvents));
    setVariant(params.get('variant') ?? station?.id ?? id);
  }, [id, station]);
  useEffect(() => {
    const adv = Number(params.get('advance') ?? 0);
    if (runner && adv > 0) runner.advance(adv);
  }, [runner]);

  const ratio = RATIO[knobs.aspect];
  const frame = useMemo(() => ({ aspectRatio: ratio, maxHeight: '78vh', maxWidth: '100%', height: ratio < 1 ? '78vh' : undefined, width: ratio >= 1 ? '100%' : undefined }), [ratio]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-black/90 p-4 backdrop-blur sm:p-8" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-1 items-start justify-center">
          <div style={frame} className="relative overflow-hidden rounded-lg border border-cream/20">
            <SceneView
              sceneId={id}
              accent={entry.accent}
              variantKey={variant}
              playing={knobs.playing}
              energy={energy}
              reducedMotion={knobs.reduced}
              rareNonce={rare.nonce}
              rareKind={rare.kind}
              onRunner={setRunner}
              raw={knobs.raw}
            />
            {knobs.hud && <HudMock entry={entry} />}
            {!entry.drawn && <Missing />}
          </div>
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-3 text-sm lg:w-80">
          <div>
            <p className="text-xs text-cream/40">
              {entry.frequency !== undefined ? `${entry.frequency.toFixed(2)} MHz · ` : ''}
              {id}
            </p>
            <h2 className="font-display text-3xl tracking-wide" style={{ color: entry.accent }}>
              {entry.name}
            </h2>
            {station && <p className="text-cream/60">{station.tagline}</p>}
            {!entry.drawn && <p className="mt-1 text-[#ffb000]">Not drawn yet: showing the fallback scene.</p>}
          </div>
          <Brief entry={entry} />
          <Controls knobs={knobs} set={set} />
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-cream/30 px-3 py-1 hover:bg-cream/10"
              onClick={() => setRare((r) => ({ nonce: r.nonce + 1, kind: r.nonce === 0 ? 0 : (r.kind + 1) % Math.max(1, rareCount) }))}
            >
              Trigger rare event
            </button>
            <button className="rounded border border-cream/30 px-3 py-1 hover:bg-cream/10" onClick={() => runner?.advance(60)}>
              +60 s
            </button>
            <button
              className="rounded border border-cream/30 px-3 py-1 hover:bg-cream/10"
              title="Rebuild the scene with another variation key (pirates and oddities vary by it)"
              onClick={() => setVariant(`${id}-${Math.floor(Math.random() * 1e6)}`)}
            >
              Next variant
            </button>
            <button className="rounded border border-cream/30 px-3 py-1 hover:bg-cream/10" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="text-xs text-cream/50">
            {rare.nonce > 0 ? `Event ${rare.kind + 1} of ${rareCount}. ` : `${rareCount} rare events. `}
            {runner
              ? `${runner.stats.w}×${runner.stats.h} px · ${runner.stats.fps.toFixed(1)} fps · ${runner.stats.drawMs.toFixed(2)} ms/frame`
              : 'loading…'}
          </p>
          <p className="text-xs text-cream/40">variant key: {variant}</p>
        </aside>
      </div>
    </div>
  );
}

function Brief({ entry }: { entry: Entry }) {
  return (
    <details className="rounded border border-cream/10 p-2 text-cream/70">
      <summary className="cursor-pointer text-cream/50">Brief &amp; label</summary>
      {entry.station && <p className="mt-2">{entry.station.sceneBrief}</p>}
      <p className="mt-2 text-cream/50">aria-label: “{sceneEntry(entry.id).label}”</p>
    </details>
  );
}

function Solo({ entry, knobs, energy }: { entry: Entry; knobs: Knobs; energy: () => number }) {
  const [runner, setRunner] = useState<SceneRunner | null>(null);
  const rareParam = params.get('rare');
  useEffect(() => {
    if (!runner) return;
    const adv = Number(params.get('advance') ?? 0);
    if (adv > 0) runner.advance(adv);
    if (rareParam !== null) runner.trigger(Number(rareParam));
    (window as unknown as { __runner: SceneRunner }).__runner = runner;
  }, [runner, rareParam]);
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <SceneView
        sceneId={entry.id}
        accent={entry.accent}
        variantKey={params.get('variant') ?? entry.station?.id ?? entry.id}
        playing={knobs.playing}
        energy={energy}
        reducedMotion={knobs.reduced}
        onRunner={setRunner}
        raw={knobs.raw}
      />
      {knobs.hud && <HudMock entry={entry} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

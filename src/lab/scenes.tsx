// Scenes lab: a developer page for auditioning every station scene in isolation.
// Served at /lab/scenes.html in dev and in production builds.
//
// URL params (handy for screenshots):
//   ?scene=<id>     open that scene enlarged      &solo=1    scene only, filling the window
//   &aspect=16:9|4:3|9:16                          &playing=0 &reduced=1
//   &energy=beat|<0..1>                            &rare=<k>  start rare event k
//   &advance=<seconds>  fast-forward the scene clock

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SCENE_IDS, type SceneId, type StationDef } from '../broadcast/types';
import { SceneView } from '../scenes/SceneView';
import { SCENES, loadScene } from '../scenes/registry';
import type { SceneRunner } from '../scenes/runner';
import { STATIONS } from '../stations/roster';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '../index.css';

type Aspect = '16:9' | '4:3' | '9:16';
const ASPECTS: Aspect[] = ['16:9', '4:3', '9:16'];
const RATIO: Record<Aspect, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '9:16': 9 / 16 };

const params = new URLSearchParams(location.search);
const stationFor = (id: SceneId) => STATIONS.find((s) => s.scene === id)!;

interface Knobs {
  playing: boolean;
  reduced: boolean;
  energyMode: 'beat' | 'manual';
  level: number;
  bpm: number;
  aspect: Aspect;
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
  });
  const [open, setOpen] = useState<SceneId | null>((params.get('scene') as SceneId | null) ?? null);
  const [rareAll, setRareAll] = useState(0);
  const energy = useEnergy(knobs);
  const set = (patch: Partial<Knobs>) => setKnobs((k) => ({ ...k, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (!open) return;
      const i = SCENE_IDS.indexOf(open);
      if (e.key === 'ArrowRight') setOpen(SCENE_IDS[(i + 1) % SCENE_IDS.length]!);
      if (e.key === 'ArrowLeft') setOpen(SCENE_IDS[(i + SCENE_IDS.length - 1) % SCENE_IDS.length]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (params.get('solo') === '1' && open) {
    return <Solo id={open} knobs={knobs} energy={energy} />;
  }

  const ordered = [...STATIONS].sort((a, b) => a.frequency - b.frequency);

  return (
    <main className="min-h-screen p-4 font-mono text-cream sm:p-8">
      <header className="mb-6 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide">Scenes lab</h1>
          <p className="text-sm text-cream/60">22 windows into other dimensions. Click one to enlarge (← → to flip, Esc to close).</p>
        </div>
        <Controls knobs={knobs} set={set} />
        <button className="rounded border border-cream/30 px-3 py-1 text-sm hover:bg-cream/10" onClick={() => setRareAll((n) => n + 1)}>
          Rare event (all)
        </button>
      </header>

      <div className={`${open ? 'hidden' : 'grid'} gap-4 ${knobs.aspect === '9:16' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'}`}>
        {ordered.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpen(s.scene)}
            className="group overflow-hidden rounded-lg border border-cream/10 bg-black/40 text-left transition hover:border-cream/40"
          >
            <div style={{ aspectRatio: RATIO[knobs.aspect] }}>
              <SceneView
                sceneId={s.scene}
                accent={s.color}
                playing={knobs.playing}
                energy={energy}
                reducedMotion={knobs.reduced}
                rareNonce={rareAll}
              />
            </div>
            <div className="flex items-baseline justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm" style={{ color: s.color }}>
                {s.name}
              </span>
              <span className="shrink-0 text-xs text-cream/40">
                {s.frequency.toFixed(1)} · {s.scene}
              </span>
            </div>
          </button>
        ))}
      </div>

      {open && <Enlarged id={open} knobs={knobs} set={set} energy={energy} onClose={() => setOpen(null)} />}
    </main>
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
  id,
  knobs,
  set,
  energy,
  onClose,
}: {
  id: SceneId;
  knobs: Knobs;
  set: (p: Partial<Knobs>) => void;
  energy: () => number;
  onClose: () => void;
}) {
  const station = stationFor(id);
  const [rare, setRare] = useState({ nonce: Number(params.get('rare') !== null), kind: Number(params.get('rare') ?? 0) });
  const { runner, setRunner } = useRunnerStats();
  const [rareCount, setRareCount] = useState(0);
  useEffect(() => {
    void loadScene(id).then((d) => setRareCount(d.rareEvents));
  }, [id]);
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
          <div style={frame} className="overflow-hidden rounded-lg border border-cream/20">
            <SceneView
              sceneId={id}
              accent={station.color}
              playing={knobs.playing}
              energy={energy}
              reducedMotion={knobs.reduced}
              rareNonce={rare.nonce}
              rareKind={rare.kind}
              onRunner={setRunner}
            />
          </div>
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-3 text-sm lg:w-80">
          <div>
            <p className="text-xs text-cream/40">
              {station.frequency.toFixed(1)} MHz · {id}
            </p>
            <h2 className="font-display text-3xl tracking-wide" style={{ color: station.color }}>
              {station.name}
            </h2>
            <p className="text-cream/60">{station.tagline}</p>
          </div>
          <Brief station={station} />
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
        </aside>
      </div>
    </div>
  );
}

function Brief({ station }: { station: StationDef }) {
  return (
    <details className="rounded border border-cream/10 p-2 text-cream/70">
      <summary className="cursor-pointer text-cream/50">Brief &amp; label</summary>
      <p className="mt-2">{station.sceneBrief}</p>
      <p className="mt-2 text-cream/50">aria-label: “{SCENES[station.scene].label}”</p>
    </details>
  );
}

function Solo({ id, knobs, energy }: { id: SceneId; knobs: Knobs; energy: () => number }) {
  const station = stationFor(id);
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
        sceneId={id}
        accent={station.color}
        playing={knobs.playing}
        energy={energy}
        reducedMotion={knobs.reduced}
        onRunner={setRunner}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

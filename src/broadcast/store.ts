// The broadcast store: the one place the UI reads radio state from and sends actions to.
//
// SIMULATOR: until the broadcast-director workstream lands, this implements the
// BroadcastStore contract with a fake schedule and no audio, so the UI can be built
// against it. The director replaces the internals; `useBroadcast` and the contract in
// ./types stay the same.

import { create } from 'zustand';
import { trackMeta } from '../content';
import { DEFAULT_STATION_ID, STATIONS } from '../stations/roster';
import type { BroadcastStore, Segment, StationDef } from './types';

const TRACK_MS = 150_000;
const VOICE_MS = 14_000;
const CYCLE_MS = TRACK_MS + VOICE_MS;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Fake programme: every cycle is one track followed by one host link. */
function segmentsFrom(station: StationDef, atMs: number, count: number): Segment[] {
  const cycle = Math.floor(atMs / CYCLE_MS);
  const out: Segment[] = [];
  for (let c = cycle; out.length < count + 2; c++) {
    const start = c * CYCLE_MS;
    const seed = hash(`${station.id}:${c}`);
    out.push({
      kind: 'track',
      id: `${station.id}:${c}:0`,
      stationId: station.id,
      startMs: start,
      durationMs: TRACK_MS,
      recipe: station.recipe,
      seed,
      meta: trackMeta(station, seed),
    });
    out.push({
      kind: 'voice',
      id: `${station.id}:${c}:1`,
      stationId: station.id,
      startMs: start + TRACK_MS,
      durationMs: VOICE_MS,
      bed: true,
      clip: {
        id: `sim-${c}`,
        category: 'dj',
        url: '',
        durationMs: VOICE_MS,
        overMusic: true,
        lines: [
          { speaker: station.host.name, text: `You're listening to ${station.name}.`, startMs: 0 },
          { speaker: station.host.name, text: station.tagline, startMs: 4000 },
        ],
      },
    });
  }
  return out.filter((s) => s.startMs + s.durationMs > atMs).slice(0, count);
}

const offsets: Record<string, number> = {};
let tuneTimer: ReturnType<typeof setTimeout> | undefined;

export const useBroadcast = create<BroadcastStore>()((set, get) => {
  const now = () => Date.now() + (offsets[get().stationId] ?? 0);

  const refresh = () => {
    const station = STATIONS.find((s) => s.id === get().stationId);
    if (!station) return;
    const at = now();
    const [onAir = null, ...upNext] = segmentsFrom(station, at, 6);
    let caption: BroadcastStore['caption'] = null;
    if (onAir?.kind === 'voice' && get().status === 'playing') {
      const into = at - onAir.startMs;
      const line = [...onAir.clip.lines].reverse().find((l) => l.startMs <= into);
      if (line) caption = { speaker: line.speaker, text: line.text };
    }
    const previous = get().onAir;
    const recent =
      previous && previous.id !== onAir?.id && get().status === 'playing'
        ? [previous, ...get().recent].slice(0, 30)
        : get().recent;
    set({ onAir, upNext, caption, recent });
  };

  const goLive = () => {
    clearTimeout(tuneTimer);
    set({ status: 'tuning', caption: null });
    tuneTimer = setTimeout(() => {
      set({ status: 'playing' });
      refresh();
    }, 700);
  };

  setInterval(refresh, 500);
  queueMicrotask(refresh);

  return {
    stations: STATIONS,
    stationId: DEFAULT_STATION_ID,
    status: 'off',
    signalMessage: null,
    onAir: null,
    upNext: [],
    recent: [],
    caption: null,
    volume: 0.8,
    muted: false,

    togglePlay() {
      const { status } = get();
      if (status === 'playing' || status === 'tuning') {
        clearTimeout(tuneTimer);
        set({ status: 'paused', caption: null });
      } else {
        goLive();
      }
    },
    tune(stationId) {
      if (!STATIONS.some((s) => s.id === stationId)) return;
      set({ stationId });
      refresh();
      goLive();
    },
    stepStation(delta) {
      const i = STATIONS.findIndex((s) => s.id === get().stationId);
      const next = STATIONS[(i + delta + STATIONS.length) % STATIONS.length];
      if (next) get().tune(next.id);
    },
    scan() {
      const others = STATIONS.filter((s) => s.id !== get().stationId);
      const pick = others[Math.floor(Math.random() * others.length)];
      if (pick) get().tune(pick.id);
    },
    skip() {
      const { onAir, stationId } = get();
      if (!onAir) return;
      offsets[stationId] = (offsets[stationId] ?? 0) + (onAir.startMs + onAir.durationMs - now()) + 1;
      refresh();
      goLive();
    },
    setVolume(volume) {
      set({ volume: Math.min(1, Math.max(0, volume)), muted: false });
    },
    toggleMute() {
      set({ muted: !get().muted });
    },
    getAnalyser() {
      return null;
    },
  };
});

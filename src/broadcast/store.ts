// The broadcast store: the one place the UI reads radio state from and sends actions to.
// Implements the BroadcastStore contract in ./types on top of the director (audio) and
// the scheduler (what's on air). Audio starts only from a user gesture (togglePlay/tune).

import { create } from 'zustand';
import { loadTrackPacks } from '../content';
import { DIAL } from './types';
import { DEFAULT_STATION_ID, MAIN_STATIONS, STATIONS } from '../stations/roster';
import { Director } from './director';
import { VoiceLibrary } from './library';
import type { OutputMode } from './mixer';
import { storage } from './storage';
import type { BroadcastState, BroadcastStore, Segment } from './types';

const RECENT_MAX = 30;
/** A segment counts as heard after this long on air while playing. */
const HEARD_MS = 2500;
const UP_NEXT = 5;

const isStation = (id: string | null | undefined): id is string => !!id && STATIONS.some((s) => s.id === id);

function searchParam(name: string): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/** `?station=` beats the last station listened to, which beats the default. */
function initialStationId(): string {
  const fromUrl = searchParam('station');
  if (isStation(fromUrl)) return fromUrl;
  const saved = storage.getLastStation();
  if (isStation(saved)) return saved;
  return DEFAULT_STATION_ID;
}

/** `?output=element|destination` forces the audio output path (for testing). */
function outputMode(): OutputMode {
  const value = searchParam('output');
  return value === 'element' || value === 'destination' ? value : 'auto';
}

const initialVolume = storage.getVolume() ?? 0.8;

export const library = new VoiceLibrary();

/** The audio director behind the store. The UI shouldn't need it; the labs do. */
export const director = new Director({
  library,
  stations: STATIONS,
  stationId: initialStationId(),
  volume: initialVolume,
  output: outputMode(),
});

export const useBroadcast = create<BroadcastStore>()((set, get) => {
  /** The segment we last saw on air while playing; it joins `recent` once it's over. */
  let heard: { segment: Segment; since: number; last: number } | null = null;

  const refresh = () => {
    const state = get();
    const station = director.station;
    const now = director.stationNow(station.id);
    const [onAir = null, ...upNext] = director.schedule(station).upcoming(now, UP_NEXT);
    const playing = director.status === 'playing';

    let caption: BroadcastState['caption'] = null;
    if (playing && onAir?.kind === 'voice' && !director.isFailed(onAir.id)) {
      const into = now - onAir.startMs - director.latencyMs;
      let line: (typeof onAir.clip.lines)[number] | undefined;
      for (const l of onAir.clip.lines) {
        if (l.startMs > into) break;
        line = l;
      }
      if (line) caption = { speaker: line.speaker, text: line.text };
    }

    let recent = state.recent;
    if (playing && onAir) {
      const wall = Date.now();
      if (heard?.segment.id === onAir.id) {
        heard.last = wall;
      } else {
        if (heard && heard.last - heard.since >= HEARD_MS && recent[0]?.id !== heard.segment.id) {
          const done = heard.segment;
          recent = [done, ...recent.filter((s) => s.id !== done.id)].slice(0, RECENT_MAX);
        }
        heard = { segment: onAir, since: wall, last: wall };
      }
    }

    const patch: Partial<BroadcastState> = {};
    if (state.onAir !== onAir) patch.onAir = onAir;
    if (state.upNext.length !== upNext.length || state.upNext.some((s, i) => s !== upNext[i])) patch.upNext = upNext;
    if (state.caption?.text !== caption?.text || state.caption?.speaker !== caption?.speaker) patch.caption = caption;
    if (recent !== state.recent) patch.recent = recent;
    if (state.stationId !== director.stationId) {
      // v3 stub until the director owns the continuous dial: the dial sits on the station.
      const tuned = STATIONS.find((s) => s.id === director.stationId);
      patch.stationId = director.stationId;
      if (tuned) Object.assign(patch, { frequency: tuned.frequency, signal: 1, tuned: { kind: 'station', station: tuned } });
    }
    if (state.status !== director.status) patch.status = director.status;
    if (state.signalMessage !== director.message) patch.signalMessage = director.message;
    if (Object.keys(patch).length > 0) set(patch);
  };

  director.subscribe(refresh);
  director.onTick(refresh);
  library.subscribe(refresh);
  void loadTrackPacks().then(refresh);
  void director.prefetchStation(director.stationId);
  queueMicrotask(refresh);
  // Hot reload would otherwise leave the old director playing underneath the new one.
  import.meta.hot?.dispose(() => director.dispose());

  const tune = (stationId: string) => {
    if (!isStation(stationId)) return;
    storage.setLastStation(stationId);
    director.tune(stationId);
    refresh();
  };

  const initial = STATIONS.find((s) => s.id === director.stationId) ?? STATIONS[0]!;

  /** v3 stub: snap to the nearest station. The director replaces this with the infinite dial. */
  const tuneFrequency = (mhz: number) => {
    const f = Math.min(DIAL.max, Math.max(DIAL.min, mhz));
    let best = MAIN_STATIONS[0]!;
    for (const s of MAIN_STATIONS) if (Math.abs(s.frequency - f) < Math.abs(best.frequency - f)) best = s;
    if (best.id !== get().stationId) tune(best.id);
  };

  return {
    stations: STATIONS,
    stationId: director.stationId,
    frequency: initial.frequency,
    signal: 1,
    tuned: { kind: 'station', station: initial },
    show: null,
    event: null,
    discovered: [],
    status: 'off',
    signalMessage: null,
    onAir: null,
    upNext: [],
    recent: [],
    caption: null,
    volume: initialVolume,
    muted: false,

    togglePlay() {
      director.togglePlay();
      refresh();
    },
    tune,
    stepStation(delta) {
      const i = MAIN_STATIONS.findIndex((s) => s.id === get().stationId);
      const next = MAIN_STATIONS[(i + delta + MAIN_STATIONS.length) % MAIN_STATIONS.length];
      if (next) tune(next.id);
    },
    tuneFrequency,
    nudge(deltaMhz) {
      tuneFrequency(get().frequency + deltaMhz);
    },
    scan() {
      const others = MAIN_STATIONS.filter((s) => s.id !== get().stationId);
      const pick = others[Math.floor(Math.random() * others.length)];
      if (pick) tune(pick.id);
    },
    skip() {
      director.skip();
      refresh();
    },
    setVolume(volume) {
      const value = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
      director.setVolume(value, false);
      storage.setVolume(value);
      set({ volume: value, muted: false });
    },
    toggleMute() {
      const muted = !get().muted;
      director.setVolume(get().volume, muted);
      set({ muted });
    },
    getAnalyser() {
      return director.getAnalyser();
    },
  };
});

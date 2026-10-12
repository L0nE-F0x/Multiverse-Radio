// The broadcast store: the one place the UI reads radio state from and sends actions to.
// Implements the BroadcastStore contract in ./types on top of the director (audio and the
// dial) and the scheduler (what's on air). Audio starts only from a user gesture.
//
// Dial semantics (v3):
//   - `frequency`, `signal` and `tuned` follow the dial at once (tuneFrequency / nudge can
//     be called on every pointer move while dragging).
//   - The audio, `stationId`, `onAir` and `upNext` follow once the dial rests on a new
//     transmitter for a moment (~0.16 s); `onAir` is null on static and while settling.
//   - `tune`, `stepStation` and `scan` jump straight there with the channel static.
//   - Any of these power the radio on (or resume it), like the v2 `tune`.

import { create } from 'zustand';
import { loadTrackPacks } from '../content';
import { SHIP } from '../stations/ship';
import { DEFAULT_STATION_ID, MAIN_STATIONS, STATIONS } from '../stations/roster';
import { DISCOVER_MS, DISCOVER_SIGNAL, pirates, stationForId, stepFrom } from './dial';
import { Director } from './director';
import { VoiceLibrary } from './library';
import type { OutputMode } from './mixer';
import { storage } from './storage';
import { localTime, showAtHour } from './time';
import type { BroadcastState, BroadcastStore, Segment, Tuned } from './types';
import { initialFrequency } from './url';

const RECENT_MAX = 30;
/** A segment counts as heard after this long on air while playing. */
const HEARD_MS = 2500;
const UP_NEXT = 5;
/** Scan lands on a pirate this often. */
const SCAN_PIRATE_CHANCE = 0.15;

function searchParam(name: string): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

const BASE = import.meta.env?.BASE_URL ?? '/';

function startFrequency(): number {
  return initialFrequency({
    search: typeof location === 'undefined' ? '' : location.search,
    pathname: typeof location === 'undefined' ? '/' : location.pathname,
    base: BASE,
    savedStation: storage.getLastStation(),
    savedFrequency: storage.getLastFrequency(),
    defaultStation: DEFAULT_STATION_ID,
  });
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
  frequency: startFrequency(),
  volume: initialVolume,
  output: outputMode(),
});

// `?hush=0..3` pins HUSH's strangeness (testing).
{
  const hush = Number(searchParam('hush') ?? NaN);
  if (Number.isInteger(hush) && hush >= 0 && hush <= 3) director.overlay.levelOverride = hush as 0 | 1 | 2 | 3;
}

const sameTuned = (a: Tuned, b: Tuned): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'station' || a.kind === 'pirate') return a.station.id === (b as typeof a).station.id;
  if (a.kind === 'oddity') return a.oddity === (b as typeof a).oddity && a.label === (b as typeof a).label;
  return true;
};

const tunedId = (t: Tuned): string | null => (t.kind === 'station' || t.kind === 'pirate' ? t.station.id : null);

export const useBroadcast = create<BroadcastStore>()((set, get) => {
  /** The segment we last saw on air while playing; it joins `recent` once it's over. */
  let heard: { segment: Segment; since: number; last: number } | null = null;
  /** A secret or pirate held at a strong signal: since when. */
  let finding: { id: string; since: number } | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  const dialState = (): Pick<BroadcastState, 'frequency' | 'signal' | 'tuned'> => ({
    frequency: director.frequency,
    signal: director.reception.signal,
    tuned: director.reception.tuned,
  });

  const refresh = () => {
    const state = get();
    const program = director.program;
    const tuned = director.reception.tuned;
    const playing = director.status === 'playing';
    const wall = Date.now();

    // What's on air: the programme, once the dial has settled on it (not on static).
    let onAir: Segment | null = null;
    let upNext: Segment[] = [];
    let stationCaption: BroadcastState['caption'] = null;
    const settled = program !== null && tuned.kind !== 'static' && director.reception.lock?.id === program.id;
    if (settled) {
      const now = director.stationNow(program.id);
      [onAir = null, ...upNext] = director.schedule(program.station).upcoming(now, UP_NEXT);
      if (playing && onAir?.kind === 'voice' && !director.isFailed(onAir.id)) {
        const into = now - onAir.startMs - director.latencyMs;
        let line: (typeof onAir.clip.lines)[number] | undefined;
        for (const l of onAir.clip.lines) {
          if (l.startMs > into) break;
          line = l;
        }
        if (line) stationCaption = { speaker: line.speaker, text: line.text };
      }
    }

    // HUSH and event clips speak over everything.
    const over = playing ? director.overlay.speaking(director.clock.now(), director.latencyMs) : null;
    const caption = over ? { speaker: over.speaker, text: over.text } : stationCaption;

    let recent = state.recent;
    if (playing && onAir && !onAir.stationId.startsWith('oddity-')) {
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

    // Secrets and pirates count as found once held at a strong signal for a moment.
    let discovered = state.discovered;
    const id = tunedId(tuned);
    const findable = id !== null && (tuned.kind === 'pirate' || (tuned.kind === 'station' && tuned.station.secret === true));
    if (playing && findable && director.reception.signal >= DISCOVER_SIGNAL && !discovered.includes(id)) {
      if (finding?.id !== id) finding = { id, since: wall };
      else if (wall - finding.since >= DISCOVER_MS) {
        discovered = [...discovered, id];
        storage.setDiscovered(discovered);
        finding = null;
      }
    } else if (finding && finding.id !== id) {
      finding = null;
    }

    const show =
      tuned.kind === 'station' ? showAtHour(library.shows(tuned.station.id), localTime(director.stationNow(tuned.station.id)).hour) : null;
    const event = director.overlay.eventAt(director.clock.now());

    const patch: Partial<BroadcastState> = {};
    if (state.onAir !== onAir) patch.onAir = onAir;
    if (state.upNext.length !== upNext.length || state.upNext.some((s, i) => s !== upNext[i])) patch.upNext = upNext;
    if (state.caption?.text !== caption?.text || state.caption?.speaker !== caption?.speaker) patch.caption = caption;
    if (recent !== state.recent) patch.recent = recent;
    if (discovered !== state.discovered) patch.discovered = discovered;
    if (state.stationId !== director.lastStationId) patch.stationId = director.lastStationId;
    if (state.frequency !== director.frequency) patch.frequency = director.frequency;
    if (state.signal !== director.reception.signal) patch.signal = director.reception.signal;
    if (!sameTuned(state.tuned, tuned)) patch.tuned = tuned;
    if (state.show !== show) patch.show = show;
    if (state.event?.startMs !== event?.startMs || state.event?.id !== event?.id) patch.event = event;
    if (state.status !== director.status) patch.status = director.status;
    if (state.signalMessage !== director.message) patch.signalMessage = director.message;
    if (Object.keys(patch).length > 0) set(patch);
  };

  /** Remembers where the dial was left, once it rests. */
  const persist = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      storage.setLastFrequency(director.frequency);
      storage.setLastStation(director.lastStationId);
    }, 600);
  };

  director.subscribe(() => {
    refresh();
    persist();
  });
  director.onTick(refresh);
  library.subscribe(refresh);
  void loadTrackPacks().then(refresh);
  void director.prefetchStation(director.stationId);
  void library.loadShows();
  queueMicrotask(refresh);
  // Hot reload would otherwise leave the old director playing underneath the new one.
  import.meta.hot?.dispose(() => director.dispose());

  /** Tuning is a gesture: it powers the radio on, or resumes it. */
  const powerOn = () => {
    if (director.status === 'off' || director.status === 'paused' || director.status === 'lost') director.togglePlay();
  };

  const tune = (stationId: string) => {
    if (!stationForId(stationId)) return;
    director.tune(stationId);
    persist();
    refresh();
  };

  const tuneFrequency = (mhz: number) => {
    if (!Number.isFinite(mhz)) return;
    director.setFrequency(mhz, 'drag');
    powerOn();
    persist();
    // Cheap path while dragging: just the dial (the rest follows on the next tick).
    const dial = dialState();
    const state = get();
    const patch: Partial<BroadcastState> = {};
    if (state.frequency !== dial.frequency) patch.frequency = dial.frequency;
    if (state.signal !== dial.signal) patch.signal = dial.signal;
    if (!sameTuned(state.tuned, dial.tuned)) {
      patch.tuned = dial.tuned;
      set(patch);
      refresh();
      return;
    }
    if (Object.keys(patch).length > 0) set(patch);
  };

  const initialStation = stationForId(director.lastStationId) ?? STATIONS[0]!;

  return {
    stations: STATIONS,
    stationId: initialStation.id,
    ...dialState(),
    show: null,
    event: null,
    discovered: storage.getDiscovered(),
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
      tune(stepFrom(director.frequency, delta).id);
    },
    tuneFrequency,
    nudge(deltaMhz) {
      tuneFrequency(get().frequency + deltaMhz);
    },
    scan() {
      const current = director.program?.id;
      if (Math.random() < SCAN_PIRATE_CHANCE) {
        const list = pirates().filter((p) => p.id !== current);
        const pick = list[Math.floor(Math.random() * list.length)];
        if (pick) return tune(pick.id);
      }
      const others = MAIN_STATIONS.filter((s) => s.id !== current);
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

/** Caption speaker used for HUSH (the UI may style it as the ship's own voice). */
export const SHIP_SPEAKER = SHIP.computer.name;

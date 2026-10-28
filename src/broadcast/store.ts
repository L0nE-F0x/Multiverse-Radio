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
//
// v4:
//   - `stations` is the roster with Free Frequency at tonight's frequency (it changes at
//     06:00 local; the UI just reads `frequency`).
//   - Secrets are found by their own mechanisms (./secrets.ts): dial sequences and patience
//     in static (the SecretWatcher), clocks (tuning while on air), and HUSH's grant (the arc
//     step that names the station, or at once if HUSH can't speak).
//   - `shifts` and `heading` follow the listener's night shifts (./shifts.ts); listening time
//     per station is kept in LISTEN_TIME_KEY.

import { create } from 'zustand';
import { loadTrackPacks } from '../content/tracks';
import { SHIP } from '../stations/ship';
import { DEFAULT_STATION_ID, MAIN_STATIONS, STATIONS, stationById } from '../stations/roster';
import { DISCOVER_MS, DISCOVER_SIGNAL, bleedOf, pirates, pureStatic, stationForId, stepFrom } from './dial';
import { Director } from './director';
import { OFF_COURSE } from './hush';
import { isWelcomeClip, WELCOME_STATIONS } from './quirks';
import { POOLS, VoiceLibrary } from './library';
import type { OutputMode } from './mixer';
import { RelayPresence } from './presence';
import { SecretWatcher, type Visitor } from './secrets';
import { ArcLog, ListenLog, ShiftLog } from './shifts';
import { storage } from './storage';
import { localTime, showAt } from './time';
import type { BroadcastSceneState, BroadcastState, BroadcastStore, RelayPeer, RelayPing, Segment, StationDef, Tuned, VoiceCategory } from './types';
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
const initialCabin = storage.getCabin() ?? 0;
let lastActiveCabin = initialCabin > 0 ? initialCabin : 0.65;

export const library = new VoiceLibrary();

/** The audio director behind the store. The UI shouldn't need it; the labs do. */
export const director = new Director({
  library,
  stations: STATIONS,
  frequency: startFrequency(),
  volume: initialVolume,
  output: outputMode(),
});
if (initialCabin > 0) director.setCabin(initialCabin);

/** v5: Relay fleet presence engine (deterministic sister ships + live cross-tab BroadcastChannel / WS). */
export const presence = new RelayPresence({
  initialPings: storage.getPings(),
  stationRoster: STATIONS,
});

// v4: the listener's progress: night shifts, listening time, HUSH's arc, and the secrets watch.
const shiftLog = new ShiftLog({ load: () => storage.getShifts(), save: (state) => storage.setShifts(state) });
const listenLog = new ListenLog({ load: () => storage.getListenTime(), save: (times) => storage.setListenTime(times) });
const arcLog = new ArcLog({ load: () => storage.getArcs(), save: (arcs) => storage.setArcs(arcs) });
const watcher = new SecretWatcher(STATIONS);

/** v4: the listener's progress (the director lab reads and pokes at it). */
export const progress = { shifts: shiftLog, listen: listenLog, arcs: arcLog, watcher };

director.setSecrets(storage.getDiscovered(), null);

/** `shifts` secrets (The Harbour): the arc step with their count grants them. */
const GRANTED = STATIONS.filter((s): s is StationDef & { unlock: { kind: 'shifts'; count: number } } => s.unlock?.kind === 'shifts');

/** Arc steps after the one that grants a station wait until it's found (step 8 waits for The Harbour). */
const holdArc = (arc: { id: string; step: number }) =>
  arc.id === OFF_COURSE && GRANTED.some((s) => arc.step > s.unlock.count && !useBroadcast.getState().discovered.includes(s.id));

director.shiftView = () => ({ shifts: shiftLog.shifts, aired: arcLog.aired, holdArc });

/** Secrets whose first-visit welcome has aired. */
const welcomed = new Set(storage.getWelcomed());

/** A secret's welcome on the first visit after finding it (once its clips are in). */
function welcomeVisit(stationId: string | null, discovered: readonly string[]): void {
  if (!stationId || welcomed.has(stationId) || !WELCOME_STATIONS.includes(stationId) || !discovered.includes(stationId)) return;
  if (!library.isLoaded(stationId)) return;
  const clips = library.pool(stationId).filter((c) => isWelcomeClip(stationId, c));
  const clip = clips[Math.floor(Math.random() * clips.length)];
  if (clip && !director.welcome(clip)) return;
  welcomed.add(stationId);
  storage.setWelcomed([...welcomed]);
}

/** True if HUSH has no way to say the arc step that grants a station (so grant it at once). */
function hushCantSpeak(step: number): boolean {
  if (director.overlayFailed) return true;
  if (!library.settled(POOLS.ship)) return false;
  return !library.pool(POOLS.ship).some((c) => c.arc?.id === OFF_COURSE && c.arc.step === step);
}

// `?hush=0..3` pins HUSH's strangeness (testing).
{
  const hush = Number(searchParam('hush') ?? NaN);
  if (Number.isInteger(hush) && hush >= 0 && hush <= 3) director.setHushLevel(hush as 0 | 1 | 2 | 3);
}

const sameTuned = (a: Tuned, b: Tuned): boolean => {
  if (a.kind !== b.kind) return false;
  // (Object identity: a pirate's definition is replaced once it gets its real name.)
  if (a.kind === 'station' || a.kind === 'pirate') return a.station === (b as typeof a).station;
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
  /** Wall time of the last refresh that counted listening. */
  let listenedAt: number | null = null;
  let visitor: Visitor | null = null;
  /** Arc steps aired since the last refresh (they may grant a station). */
  const arcsAired: number[] = [];

  director.onArc = (arc) => {
    if (arcLog.mark(arc.id, arc.step) && arc.id === OFF_COURSE) arcsAired.push(arc.step);
    queueMicrotask(refresh);
  };

  /** Tells the director about new finds (after the current refresh has been applied). */
  const syncSecrets = (discovered: string[]) => queueMicrotask(() => director.setSecrets(discovered, visitor));

  const dialState = (): Pick<BroadcastState, 'frequency' | 'signal' | 'tuned' | 'bleed'> => {
    const lock = director.reception.lock;
    const rawBleed = lock ? bleedOf(lock, director.frequency) : 0;
    const bleed = Math.round(rawBleed * (1 - director.reception.signal) * 1000) / 1000;
    return {
      frequency: director.frequency,
      signal: director.reception.signal,
      tuned: director.reception.tuned,
      bleed,
    };
  };

  let lastRelayBucket = -1;
  let lastPingBucket = -1;

  const sameRelays = (a: readonly RelayPeer[] | undefined, b: readonly RelayPeer[]): boolean => {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.id !== b[i]!.id || a[i]!.frequency !== b[i]!.frequency || a[i]!.stationId !== b[i]!.stationId || a[i]!.live !== b[i]!.live) {
        return false;
      }
    }
    return true;
  };

  const samePings = (a: readonly RelayPing[] | undefined, b: readonly RelayPing[]): boolean => {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.id !== b[i]!.id) return false;
    }
    return true;
  };

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
    const over = playing ? (director.overlay?.speaking(director.clock.now(), director.latencyMs) ?? null) : null;
    // (While HUSH jams the station, the station has no voice.)
    const caption = over ? { speaker: over.speaker, text: over.text } : director.jammed ? null : stationCaption;

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

    // v4: night shifts and listening time.
    const clockNow = director.clock.now();
    let shifts = state.shifts;
    if (playing && !state.muted) {
      const delta = listenedAt === null ? 0 : Math.min(2000, Math.max(0, clockNow - listenedAt));
      if (delta > 0) {
        shiftLog.listen(clockNow, delta);
        const programId = director.program?.id;
        if (programId && stationById(programId)) listenLog.add(programId, delta, clockNow);
      }
      listenedAt = clockNow;
    } else {
      listenedAt = null;
    }
    shifts = shiftLog.shifts;

    // v4: secrets found by dial sequences and patience in static.
    const r = director.reception;
    const lock = r.lock;
    const before = visitor;
    const found = watcher.observe(
      {
        wall: clockNow,
        playing,
        frequency: director.frequency,
        lock: lock && !pureStatic(r) ? { id: lock.id, kind: lock.kind, frequency: lock.frequency } : null,
        signal: r.signal,
      },
      discovered,
    );
    visitor = watcher.visitor;
    // …and the stations HUSH grants: when the arc step airs, or at once if HUSH can't speak.
    for (const s of GRANTED) {
      if (discovered.includes(s.id) || found.includes(s.id) || shifts < s.unlock.count) continue;
      if (arcsAired.includes(s.unlock.count) || arcLog.has(OFF_COURSE, s.unlock.count) || hushCantSpeak(s.unlock.count)) found.push(s.id);
    }
    arcsAired.length = 0;
    if (found.length) {
      discovered = [...discovered, ...found.filter((x) => !discovered.includes(x))];
      storage.setDiscovered(discovered);
    }
    if (discovered !== state.discovered || visitor !== before) syncSecrets(discovered);
    // A secret's first visit after finding it gets its welcome (once the dial has settled there).
    if (playing && settled && program?.kind === 'station') welcomeVisit(program.id, discovered);

    const show = tuned.kind === 'station' ? showAt(library.shows(tuned.station.id), localTime(director.stationNow(tuned.station.id))) : null;
    const event = director.eventAt();
    const rawBleed = lock ? bleedOf(lock, director.frequency) : 0;
    const bleed = Math.round(rawBleed * (1 - director.reception.signal) * 1000) / 1000;
    const { section: musicSection, progress: musicSectionProgress } = director.musicSection();
    const relayBucket = Math.floor(clockNow / 180_000);
    const pingBucket = Math.floor(clockNow / 120_000);
    const relays = relayBucket !== lastRelayBucket || !state.relays ? presence.peersAt(clockNow) : state.relays;
    const pings = pingBucket !== lastPingBucket || !state.pings ? presence.pingsAt(clockNow) : state.pings;
    lastRelayBucket = relayBucket;
    lastPingBucket = pingBucket;

    const patch: Partial<BroadcastState> = {};
    if (state.onAir !== onAir) patch.onAir = onAir;
    if (state.upNext.length !== upNext.length || state.upNext.some((s, i) => s !== upNext[i])) patch.upNext = upNext;
    if (state.caption?.text !== caption?.text || state.caption?.speaker !== caption?.speaker) patch.caption = caption;
    if (recent !== state.recent) patch.recent = recent;
    if (discovered !== state.discovered) patch.discovered = discovered;
    if (state.stations !== director.layout.roster) patch.stations = director.layout.roster;
    if (state.shifts !== shifts) patch.shifts = shifts;
    const heading = shiftLog.heading;
    if (state.heading !== heading) patch.heading = heading;
    if (state.stationId !== director.lastStationId) patch.stationId = director.lastStationId;
    if (state.frequency !== director.frequency) patch.frequency = director.frequency;
    if (state.signal !== director.reception.signal) patch.signal = director.reception.signal;
    if (state.bleed !== bleed) patch.bleed = bleed;
    if (!sameTuned(state.tuned, tuned)) patch.tuned = tuned;
    if (state.show !== show) patch.show = show;
    if (state.event?.startMs !== event?.startMs || state.event?.id !== event?.id) patch.event = event;
    if (state.status !== director.status) patch.status = director.status;
    if (state.signalMessage !== director.message) patch.signalMessage = director.message;
    if (state.cabin !== director.cabin) patch.cabin = director.cabin;
    if (state.musicSection !== musicSection) patch.musicSection = musicSection;
    if (state.musicSectionProgress !== musicSectionProgress) patch.musicSectionProgress = musicSectionProgress;
    if (!sameRelays(state.relays, relays)) patch.relays = relays;
    if (!samePings(state.pings, pings)) patch.pings = pings;
    if (Object.keys(patch).length > 0) set(patch);
  };

  /** Remembers where the dial was left, once it rests. */
  const persist = () => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      storage.setLastFrequency(director.frequency);
      storage.setLastStation(director.lastStationId);
      presence.announceTune(director.frequency, tunedId(director.reception.tuned), director.clock.now());
    }, 600);
  };

  director.subscribe(() => {
    refresh();
    persist();
  });
  presence.subscribe(() => {
    lastRelayBucket = -1;
    lastPingBucket = -1;
    refresh();
  });
  // Unsaved listening time goes to storage when the page is hidden or closed.
  const flush = () => {
    shiftLog.save();
    listenLog.flush();
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
  director.onTick(refresh);
  library.subscribe(refresh);
  void loadTrackPacks().then(refresh);
  void director.prefetchStation(director.stationId);
  void library.loadShows();
  queueMicrotask(refresh);
  // Hot reload would otherwise leave the old director playing underneath the new one.
  import.meta.hot?.dispose(() => {
    director.dispose();
    presence.dispose();
  });

  /** Tuning is a gesture: it powers the radio on, or resumes it. */
  const powerOn = () => {
    if (director.status === 'off' || director.status === 'paused' || director.status === 'lost') director.togglePlay();
  };

  const tune = (stationId: string) => {
    if (!stationForId(stationId)) return;
    director.tune(stationId);
    presence.announceTune(director.frequency, tunedId(director.reception.tuned), director.clock.now());
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
    if (state.bleed !== dial.bleed) patch.bleed = dial.bleed;
    if (!sameTuned(state.tuned, dial.tuned)) {
      patch.tuned = dial.tuned;
      set(patch);
      refresh();
      return;
    }
    if (Object.keys(patch).length > 0) set(patch);
  };

  const initialStation = stationForId(director.lastStationId) ?? STATIONS[0]!;
  const initialClock = director.clock.now();
  const initialSec = director.musicSection();

  return {
    stations: director.layout.roster,
    stationId: initialStation.id,
    ...dialState(),
    show: null,
    event: null,
    discovered: storage.getDiscovered(),
    shifts: shiftLog.shifts,
    heading: shiftLog.heading,
    status: 'off',
    signalMessage: null,
    onAir: null,
    upNext: [],
    recent: [],
    caption: null,
    volume: initialVolume,
    muted: false,
    cabin: initialCabin,
    musicSection: initialSec.section,
    musicSectionProgress: initialSec.progress,
    relays: presence.peersAt(initialClock),
    pings: presence.pingsAt(initialClock),

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
    setCabin(level) {
      const value = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
      if (value > 0) lastActiveCabin = value;
      director.setCabin(value);
      storage.setCabin(value);
      set({ cabin: value });
    },
    toggleCabin() {
      const current = get().cabin ?? 0;
      const next = current > 0 ? 0 : lastActiveCabin;
      director.setCabin(next);
      storage.setCabin(next);
      set({ cabin: next });
    },
    sendPing(text, code) {
      const state = get();
      const now = director.clock.now();
      const ping = presence.sendPing(state.frequency, state.tuned, text, code, now);
      storage.setPings(presence.userTransmittedPings());
      set({ pings: presence.pingsAt(now) });
      return ping;
    },
    getBusAnalyser(bus) {
      return director.getBusAnalyser(bus);
    },
  };
});

/**
 * v5: Returns the live `BroadcastSceneState` snapshot for pixel-art scenes on every animation
 * frame (`<StationScene broadcast={getBroadcastSceneState} />`).
 */
export function getBroadcastSceneState(): BroadcastSceneState {
  const state = useBroadcast.getState();
  const playing = state.status === 'playing' || director.status === 'playing';
  const wall = director.clock.now();
  const over = playing ? (director.overlay?.speaking(wall, director.latencyMs) ?? null) : null;
  const hush = director.jammed || over?.kind === 'ship' || state.caption?.speaker === SHIP.computer.name;

  let segmentKind: BroadcastSceneState['segmentKind'] = 'static';
  let voiceCategory: VoiceCategory | null = null;

  if (hush) {
    segmentKind = 'voice';
    voiceCategory = 'ship';
  } else if (over) {
    segmentKind = 'voice';
    voiceCategory = 'event';
  } else if (state.tuned.kind !== 'static' && state.onAir) {
    if (state.onAir.kind === 'voice' && !director.isFailed(state.onAir.id)) {
      segmentKind = 'voice';
      voiceCategory = state.onAir.clip.category;
    } else {
      segmentKind = 'music';
      voiceCategory = null;
    }
  }

  let speech = director.speechEnvelope();
  if (speech === 0 && playing && (segmentKind === 'voice' || state.caption !== null)) {
    const t = wall / 1000;
    const env = 0.52 + 0.24 * Math.sin(t * 23.5) + 0.16 * Math.sin(t * 15.3 + 1.1) + 0.08 * Math.cos(t * 37.1);
    speech = Math.min(1, Math.max(0.15, Math.round(env * 1000) / 1000));
  }

  const liveSec = director.musicSection();
  const hasLiveMusic = liveSec.progress > 0 || liveSec.section !== 'verse';
  const section = hasLiveMusic ? liveSec.section : (state.musicSection ?? liveSec.section);
  const sectionProgress = hasLiveMusic ? liveSec.progress : (state.musicSectionProgress ?? liveSec.progress);

  return {
    segmentKind,
    voiceCategory,
    speech,
    section,
    sectionProgress,
    event: state.event?.id ?? null,
    hush,
    signal: state.signal,
    bleed: state.bleed ?? 0,
  };
}

/** Caption speaker used for HUSH (the UI may style it as the ship's own voice). */
export const SHIP_SPEAKER = SHIP.computer.name;

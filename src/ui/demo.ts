// Dev-only UI harness: `?uidemo=<state>` pins the broadcast store into a given state so every
// HUD state can be seen (and screenshotted) before the real director produces it. Loaded only
// by a dynamic import behind `import.meta.env.DEV`, so it never ships.
//
//   off · track · voice · hush · event · partial · static · pirate · oddity · secret · lost
//   outer (an Outer Band station) · free (Free Frequency on tonight's drift frequency)
//   dial (a simulated continuous dial: pirates, oddities and static between stations)
//   log  (seeds the ship's log with a night's intercepts)
//
// Add `&panel=guide|log|help` to open a panel, `&hud=hidden` to hide the HUD.

import { useBroadcast } from '../broadcast/store';
import type {
  ActiveEvent,
  BroadcastState,
  BroadcastStore,
  OddityId,
  SceneId,
  ShowDef,
  StationDef,
  TrackSegment,
  Tuned,
  VoiceCategory,
  VoiceSegment,
} from '../broadcast/types';
import { pirateIdentity } from '../content';
import { MAIN_STATIONS, STATIONS, stationById } from '../stations/roster';
import { SHIP } from '../stations/ship';
import { snapMhz } from './dial';
import { hash } from './format';
import { useShipLog, type LogEntry } from './shiplog';
import { useUi, type PanelId } from './store';

type Patch = Partial<BroadcastState>;

const T0 = Date.now();
const station = (id: string): StationDef => stationById(id) ?? MAIN_STATIONS[0]!;

function track(s: StationDef, title: string, artist: string, note?: string, minutes = 3.4): TrackSegment {
  return {
    kind: 'track',
    id: `${s.id}:demo:track`,
    stationId: s.id,
    startMs: T0 - 74_000,
    durationMs: minutes * 60_000,
    recipe: s.recipe,
    seed: 1,
    meta: { title, artist, ...(note ? { note } : {}) },
  };
}

function voice(s: StationDef, category: VoiceCategory, title: string, speaker: string, text: string): VoiceSegment {
  return {
    kind: 'voice',
    id: `${s.id}:demo:voice:${category}`,
    stationId: s.id,
    startMs: T0 - 6_000,
    durationMs: 24_000,
    bed: true,
    clip: {
      id: 'demo',
      category,
      url: '/voice/demo.mp3',
      durationMs: 24_000,
      title,
      overMusic: true,
      lines: [{ speaker, text, startMs: 0 }],
    },
  };
}

const show = (name: string, blurb = ''): ShowDef => ({ id: 'demo-show', name, blurb, start: 0, end: 6 });

function pirate(frequency: number): StationDef {
  const id = `pirate-${frequency.toFixed(2)}`;
  const who = pirateIdentity(hash(id));
  return {
    id,
    name: who.name,
    frequency,
    origin: who.origin,
    tagline: who.slogan,
    color: '#ff7aa8',
    phosphor: 'rose',
    format: 'music',
    recipe: 'lofi-glass',
    scene: 'pirate-van',
    sceneBrief: '',
    host: { name: who.host.name, voice: 'am_puck', bio: who.host.bio },
    mood: [],
  };
}

const ODDITIES: Record<number, { oddity: OddityId; label: string; scene: SceneId }> = {
  84.3: { oddity: 'test-tone', label: 'Test tone', scene: 'oddity-testcard' },
  131.2: { oddity: 'distress-beacon', label: 'Distress beacon', scene: 'oddity-beacon' },
  117.65: { oddity: 'stuck-loop', label: 'A song stuck on loop', scene: 'oddity-jukebox' },
  144.0: { oddity: 'time-signal', label: 'Time signal', scene: 'oddity-clock' },
};
const PIRATES = [109.35, 113.8, 127.45, 86.15];

function on(s: StationDef, extra: Patch = {}): Patch {
  return { status: 'playing', stationId: s.id, frequency: s.frequency, signal: 1, tuned: { kind: 'station', station: s }, caption: null, event: null, ...extra };
}

const storm: ActiveEvent = { id: 'dimensional-storm', name: 'Dimensional Storm', startMs: T0 - 42_000, durationMs: 180_000 };

const SCENARIOS: Record<string, () => Patch> = {
  off: () => ({ status: 'off' }),
  track: () => {
    const s = station('void-beats');
    return on(s, {
      onAir: track(s, 'Homework for the Heat Death', 'The Late Bus', 'Recorded in one take, in a room that was not there yesterday'),
      show: show('The Small Hours'),
    });
  },
  voice: () => {
    const s = station('every-news');
    return on(s, {
      onAir: voice(s, 'news', 'The Late Bulletin', 'Dale Quarterly', 'Good evening. Tonight, in every possible tonight, the moon has asked to be referred to by its full name.'),
      caption: { speaker: 'Dale Quarterly', text: 'Good evening. Tonight, in every possible tonight, the moon has asked to be referred to by its full name.' },
      show: show('The Late Bulletin'),
    });
  },
  hush: () => {
    const s = station('rainfall-fm');
    return on(s, {
      onAir: voice(s, 'ship', 'Ship notice', SHIP.computer.name, 'Hull temperature nominal. The kettle has been on for some time. I have not been asked to mention it.'),
      caption: { speaker: SHIP.computer.name, text: 'Hull temperature nominal. The kettle has been on for some time. I have not been asked to mention it.' },
    });
  },
  event: () => {
    const s = station('neon-2087');
    return on(s, {
      onAir: track(s, 'Overdrive, Gently', 'Velocity Jones & the Elbows'),
      event: storm,
      caption: { speaker: 'Velocity Jones', text: "Folks, the sky is doing something rad and also, frankly, alarming. Stay tuned. Stay tuned anyway." },
    });
  },
  partial: () => {
    const s = station('snail-jams');
    return on(s, { frequency: snapMhz(s.frequency + 0.15), signal: 0.42, onAir: track(s, 'Slow Is a Speed', 'Shelley Shellbourne') });
  },
  static: () => {
    const s = station('crystal-delta');
    return { ...on(s), frequency: 112.4, signal: 0.02, tuned: { kind: 'static' }, onAir: null };
  },
  pirate: () => {
    const p = pirate(109.35);
    return {
      status: 'playing',
      stationId: p.id,
      frequency: p.frequency,
      signal: 0.88,
      tuned: { kind: 'pirate', station: p },
      discovered: [p.id, 'hush-after-hours'],
      onAir: track(p, 'Unlicensed and Unrepentant', 'DJ Nobody'),
      caption: null,
    };
  },
  oddity: () => {
    const o = ODDITIES[131.2]!;
    return { status: 'playing', frequency: 131.2, signal: 0.74, tuned: { kind: 'oddity', ...o }, onAir: null, caption: null };
  },
  secret: () => {
    const s = station('hush-after-hours');
    return on(s, {
      discovered: ['hush-after-hours'],
      onAir: track(s, 'Lullaby for the Coolant Pumps', SHIP.computer.name, 'Composed during your last break'),
      caption: { speaker: SHIP.computer.name, text: 'Oh. You found this. That is fine. Stay if you like.' },
    });
  },
  outer: () => {
    const s = station('tiki-satellite');
    return on(s, {
      onAir: voice(s, 'dj', 'Tomorrow, Today', s.host.name, 'And now, through the miracle of stereophonic sound, the bongos will travel to your left speaker.'),
      caption: { speaker: s.host.name, text: 'And now, through the miracle of stereophonic sound, the bongos will travel to your left speaker.' },
    });
  },
  free: () => {
    const base = station('free-frequency');
    const tonight = { ...base, frequency: 112.45 };
    return on(tonight, {
      stations: useBroadcast.getState().stations.map((s) => (s.id === base.id ? tonight : s)),
      onAir: voice(tonight, 'dj', 'Theory Night', tonight.host.name, 'They say the heading is within tolerance. Tolerance of what, I ask you.'),
    });
  },
  lost: () => ({ status: 'lost', signalMessage: 'The relay could not reach this dimension. It may be closed for cleaning.' }),
  dial: () => {
    installSimulatedDial();
    return {};
  },
  log: () => {
    seedLog();
    const s = station('lower-hollow');
    return on(s, { onAir: track(s, 'Minutes of the Meeting About the Hole', 'Lower Hollow Parish Council'), discovered: ['pirate-109.35', 'last-lighthouse'] });
  },
};

/** Keep `patch` applied: whenever the engine overwrites a pinned field, put it back. */
function pin(patch: Patch): void {
  const keys = Object.keys(patch) as (keyof BroadcastState)[];
  if (!keys.length) return;
  useBroadcast.setState(patch);
  let queued = false;
  useBroadcast.subscribe(() => {
    if (queued || !keys.some((k) => useBroadcast.getState()[k] !== patch[k])) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      useBroadcast.setState(patch);
    });
  });
}

/** A continuous dial without the real director: stations, pirates, oddities and static. */
function installSimulatedDial(): void {
  const get = useBroadcast.getState;
  const original = get().tune;
  const sim = (mhz: number) => {
    const f = snapMhz(mhz);
    const state = get();
    const candidates = STATIONS.filter((s) => !s.secret || state.discovered.includes(s.id) || Math.abs(s.frequency - f) < 0.01);
    let best = candidates[0]!;
    for (const s of candidates) if (Math.abs(s.frequency - f) < Math.abs(best.frequency - f)) best = s;
    const d = Math.abs(best.frequency - f);
    let patch: Patch;
    const falloff = (dist: number) => Math.max(0.05, 1 - (dist / 0.25) ** 1.4);
    const pirateAt = PIRATES.find((p) => Math.abs(p - f) <= 0.2);
    const oddityAt = Object.keys(ODDITIES).map(Number).find((o) => Math.abs(o - f) <= 0.2);
    if (d <= 0.2) {
      if (best.id !== state.stationId) original(best.id);
      const discovered = best.secret && !state.discovered.includes(best.id) ? [...state.discovered, best.id] : state.discovered;
      patch = { frequency: f, signal: falloff(d), tuned: { kind: 'station', station: best }, discovered };
    } else if (pirateAt !== undefined) {
      const p = pirate(pirateAt);
      const discovered = state.discovered.includes(p.id) ? state.discovered : [...state.discovered, p.id];
      // (stationId stays on the director's station: the stub store reverts anything else.)
      patch = { frequency: f, signal: falloff(Math.abs(pirateAt - f)), tuned: { kind: 'pirate', station: p }, discovered };
    } else if (oddityAt !== undefined) {
      patch = { frequency: f, signal: falloff(Math.abs(oddityAt - f)), tuned: { kind: 'oddity', ...ODDITIES[oddityAt]! } as Tuned };
    } else patch = { frequency: f, signal: 0.02, tuned: { kind: 'static' } };
    useBroadcast.setState(patch);
  };
  useBroadcast.setState({ tuneFrequency: sim, nudge: (delta: number) => sim(get().frequency + delta) } as Partial<BroadcastStore>);
}

function seedLog(): void {
  const rows: [string, string, string, string, string][] = [
    ['lower-hollow', 'track', 'Minutes of the Meeting About the Hole', 'Lower Hollow Parish Council', 'TRACK'],
    ['every-news', 'voice', 'The Late Bulletin', 'Dale Quarterly', 'NEWS'],
    ['rainfall-fm', 'voice', 'Ship notice', SHIP.computer.name, 'HUSH'],
    ['pirate-109.35', 'contact', 'Unlicensed transmitter located', pirate(109.35).name, 'CONTACT'],
    ['void-beats', 'track', 'Homework for the Heat Death', 'The Late Bus', 'TRACK'],
    ['classifieds', 'voice', "Gary's Previously Owned Moons", 'Rex Bellows', 'ADVERT'],
    ['whalesong', 'track', 'Song for a Slow Current', 'Pod 7', 'TRACK'],
    ['last-lighthouse', 'contact', 'Unlisted station located', 'The Last Lighthouse', 'CONTACT'],
    ['numbers-omega', 'voice', 'Reading 4471', 'The Counter', 'STORY'],
    ['smoke-ring-trio', 'track', 'Brushes on a Cloud', 'Octavia Lowe Trio', 'TRACK'],
  ];
  const entries: LogEntry[] = rows.map(([id, type, title, byline, code], i) => {
    const s = stationById(id);
    const p = id.startsWith('pirate-') ? pirate(109.35) : null;
    return {
      id: `demo-${i}`,
      at: T0 - i * 11 * 60_000 - (i > 5 ? 26 * 3600_000 : 0),
      type: type as LogEntry['type'],
      stationId: id,
      station: s?.name ?? p?.name ?? id,
      frequency: s?.frequency ?? p?.frequency ?? 0,
      title,
      byline,
      code,
    };
  });
  useShipLog.setState({ entries, pirates: { 'pirate-109.35': { id: 'pirate-109.35', name: pirate(109.35).name, frequency: 109.35, phosphor: 'rose' } } });
  useUi.setState({ shiftStart: T0 - 50 * 60_000 });
}

export function installDemo(): void {
  const params = new URLSearchParams(location.search);
  const name = params.get('uidemo') ?? '';
  const scenario = SCENARIOS[name];
  if (!scenario) {
    console.warn(`uidemo: unknown state "${name}". Try: ${Object.keys(SCENARIOS).join(', ')}`);
    return;
  }
  // v4: a few shifts in, and the heading has wandered.
  const patch: Patch = { heading: 212.4, shifts: 4, ...scenario() };
  if (name !== 'dial' && name !== 'off') useUi.setState({ shiftStart: useUi.getState().shiftStart ?? T0 - 42 * 60_000 });
  pin(patch);
  const panel = params.get('panel');
  if (panel === 'guide' || panel === 'log' || panel === 'help') useUi.setState({ panel: panel as PanelId });
  if (params.get('hud') === 'hidden') useUi.setState({ hud: 'hidden' });
  Object.assign(window, { __uidemo: { useBroadcast, useUi, pin } });
}

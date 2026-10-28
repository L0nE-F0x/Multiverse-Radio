// Relay Fleet Presence Engine (Pillar 5: "Ghost Presence Across the Multiverse", docs/V5-PLAN.md).
//
// Combines three layers into a living relay fleet across the dial:
//   1. Deterministic UTC-bucketed fleet telemetry: 18–32 sister relay vessels (seeded by
//      3-minute buckets) tuned across main stations, the Outer Band, pirates, and deep static.
//   2. Deterministic subspace wire reception reports (seeded by 2-minute buckets) merged with
//      operator- and peer-transmitted pings.
//   3. Real-time cross-tab `BroadcastChannel('multiverse-radio:relay')` + optional WebSocket
//      relay (`VITE_RELAY_WS_URL`) so open tabs and connected operators appear as `live: true`
//      peers and exchange subspace pings immediately.

import { STATIONS } from '../stations/roster';
import { SHIP } from '../stations/ship';
import { pirates, snapFrequency } from './dial';
import { eventAt } from './events';
import { createRng, hash } from './random';
import { DIAL, type RelayPeer, type RelayPing, type StationDef, type Tuned } from './types';

export const RELAY_CHANNEL_NAME = 'multiverse-radio:relay';
export const FLEET_BUCKET_MS = 180_000; // 3-minute buckets for fleet dial positions
export const PING_BUCKET_MS = 120_000; // 2-minute buckets for fleet subspace wire reports
const LIVE_PEER_TTL_MS = 5 * 60_000;
const MAX_PINGS = 40;

/** Sister relay vessels in the Gloaming & Daughters deep-band intercept fleet. */
export const FLEET_VESSELS: readonly string[] = [
  'R/S LAPWING · RELAY 1',
  'R/S PETREL · RELAY 2',
  'R/S SHEARWATER · RELAY 3',
  'R/S KESTREL · RELAY 4',
  'R/S TURNSTONE · RELAY 5',
  'R/S BITTERN · RELAY 6',
  'R/S REDSTART · RELAY 8',
  'R/S WHIMBREL · RELAY 9',
  'R/S GANNET · RELAY 10',
  'R/S CURLEW · RELAY 11',
  'R/S AVOCET · RELAY 12',
  'R/S SANDERLING · RELAY 13',
  'R/S DUNLIN · RELAY 14',
  'R/S GODWIT · RELAY 15',
  'R/S PLOVER · RELAY 16',
  'R/S TERN · RELAY 17',
  'R/S CORMORANT · RELAY 18',
  'R/S FULMAR · RELAY 19',
  'R/S SKUA · RELAY 20',
  'R/S KITTIWAKE · RELAY 21',
  'R/S MERLIN · RELAY 22',
  'R/S HARRIER · RELAY 23',
  'R/S FIELDFARE · RELAY 24',
  'R/S REDWING · RELAY 25',
  'R/S WAGTAIL · RELAY 26',
  'R/S STONECHAT · RELAY 27',
  'R/S WHEATEAR · RELAY 28',
  'R/S DIPPER · RELAY 29',
  'R/S KINGFISHER · RELAY 30',
  'R/S NUTHATCH · RELAY 31',
  'R/S TREECREEPER · RELAY 32',
  'R/S STARLING · RELAY 33',
  'R/S SWALLOW · RELAY 34',
  'R/S SWIFT · RELAY 35',
] as const;

export type RelayWireMessage =
  | { type: 'tune'; peer: RelayPeer; senderId?: string; at?: number }
  | { type: 'ping'; ping: RelayPing; senderId?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Generates deterministic fleet telemetry (`18–32` active sister relay vessels) for the
 * 3-minute UTC bucket containing `wallMs`.
 */
export function fleetPeersAt(wallMs: number, roster: readonly StationDef[] = STATIONS): RelayPeer[] {
  const bucket = Math.floor(wallMs / FLEET_BUCKET_MS);
  const rng = createRng(hash('relay-fleet', bucket));
  const count = rng.int(18, 32);

  // Deterministically select `count` vessels from the fleet roster.
  const pool = [...FLEET_VESSELS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const chosen = pool.slice(0, count);

  const publicStations = roster.filter((s) => !s.secret);
  const pirateList = pirates();
  const activeEvent = eventAt(bucket * FLEET_BUCKET_MS);
  // During a multiverse event, choose a cluster station where several ships converge.
  const clusterStation =
    activeEvent && publicStations.length > 0
      ? publicStations[rng.int(0, publicStations.length - 1)]!
      : null;

  const peers: RelayPeer[] = [];
  for (const vesselId of chosen) {
    const shipRng = createRng(hash('relay-vessel-pos', vesselId, bucket));
    const roll = shipRng.next();

    if (clusterStation && roll < 0.28) {
      peers.push({
        id: vesselId,
        frequency: round2(clusterStation.frequency),
        stationId: clusterStation.id,
      });
      continue;
    }

    if (roll < 0.74 && publicStations.length > 0) {
      const st = publicStations[shipRng.int(0, publicStations.length - 1)]!;
      peers.push({
        id: vesselId,
        frequency: round2(st.frequency),
        stationId: st.id,
      });
    } else if (roll < 0.89 && pirateList.length > 0) {
      const p = pirateList[shipRng.int(0, pirateList.length - 1)]!;
      peers.push({
        id: vesselId,
        frequency: round2(p.frequency),
        stationId: p.id,
      });
    } else {
      const f = snapFrequency(shipRng.range(DIAL.min + 1, DIAL.max - 1));
      peers.push({
        id: vesselId,
        frequency: f,
        stationId: null,
      });
    }
  }

  return peers.sort((a, b) => a.frequency - b.frequency || a.id.localeCompare(b.id));
}

const STATION_REPORT_TEMPLATES: readonly ((station: StationDef, mhz: string) => { code: string; text: string })[] = [
  (s, mhz) => ({
    code: 'LOCK',
    text: `Carrier locked on ${s.name} (${mhz} MHz). ${s.host.name} coming through clean at S9.`,
  }),
  (s, mhz) => ({
    code: 'SIG',
    text: `Holding ${mhz} MHz (${s.name}) for the night watch. Subspace sideband steady, zero drift.`,
  }),
  (s, mhz) => ({
    code: 'LOCK',
    text: `Good copy on ${s.name} (${mhz} MHz) from ${s.origin}. Phosphor steady, logging broadcast to tape.`,
  }),
  (s, mhz) => ({
    code: 'ECHO',
    text: `Faint harmonic shimmer ±0.05 MHz around ${s.name} (${mhz} MHz); centre carrier rock-solid.`,
  }),
  (s, mhz) => ({
    code: 'SIG',
    text: `Monitoring ${s.name} (${mhz} MHz). Kettle on in the galley; signal holding at full scale.`,
  }),
];

const PIRATE_REPORT_TEMPLATES: readonly ((mhz: string, name: string) => { code: string; text: string })[] = [
  (mhz, name) => ({
    code: 'ECHO',
    text: `Unlicensed carrier intercepted at ${mhz} MHz (${name}). Strong modulation, origin unresolved.`,
  }),
  (mhz, name) => ({
    code: 'SIG',
    text: `Tracking pirate transmitter ${name} on ${mhz} MHz. Slight tape flutter on the carrier.`,
  }),
];

const STATIC_REPORT_TEMPLATES: readonly ((mhz: string) => { code: string; text: string })[] = [
  (mhz) => ({
    code: 'DRIFT',
    text: `Sweeping deep band past ${mhz} MHz. Faint heterodyne whistle in the noise floor.`,
  }),
  (mhz) => ({
    code: 'ANOM',
    text: `No registered carrier at ${mhz} MHz, but scope shows a brief sideband ghost.`,
  }),
  (mhz) => ({
    code: 'SIG',
    text: `Holding static watch at ${mhz} MHz. Baseline cosmic noise nominal.`,
  }),
];

/**
 * Generates deterministic subspace wire pings from sister relay vessels, seeded by 2-minute
 * UTC buckets (`Math.floor(wallMs / 120_000)`).
 */
export function fleetPingsAt(
  wallMs: number,
  count = 10,
  roster: readonly StationDef[] = STATIONS,
): RelayPing[] {
  const currentBucket = Math.floor(wallMs / PING_BUCKET_MS);
  const byId = new Map(roster.map((s) => [s.id, s]));
  const pirateMap = new Map(pirates().map((p) => [p.id, p]));
  const out: RelayPing[] = [];

  for (let i = 0; i < count; i++) {
    const b = currentBucket - i;
    const bucketStart = b * PING_BUCKET_MS;
    const rng = createRng(hash('relay-ping', b));
    const fleet = fleetPeersAt(bucketStart, roster);
    const peer = fleet[rng.int(0, fleet.length - 1)]!;
    const mhz = peer.frequency.toFixed(2);
    const activeEvent = eventAt(bucketStart);

    let stationName = 'Deep Band Static';
    let code = 'SIG';
    let text = `Monitoring ${mhz} MHz.`;

    if (activeEvent && rng.chance(0.45)) {
      const st = peer.stationId ? byId.get(peer.stationId) : undefined;
      stationName = st?.name ?? 'All Frequencies';
      code = 'ANOM';
      text = `Anomaly alert (${activeEvent.name}) sweeping ${mhz} MHz. Holding attitude and logging telemetry.`;
    } else if (peer.stationId && byId.has(peer.stationId)) {
      const st = byId.get(peer.stationId)!;
      stationName = st.name;
      const tpl = STATION_REPORT_TEMPLATES[rng.int(0, STATION_REPORT_TEMPLATES.length - 1)]!;
      const built = tpl(st, mhz);
      code = built.code;
      text = built.text;
    } else if (peer.stationId && pirateMap.has(peer.stationId)) {
      const p = pirateMap.get(peer.stationId)!;
      stationName = p.station.name;
      const tpl = PIRATE_REPORT_TEMPLATES[rng.int(0, PIRATE_REPORT_TEMPLATES.length - 1)]!;
      const built = tpl(mhz, stationName);
      code = built.code;
      text = built.text;
    } else {
      const tpl = STATIC_REPORT_TEMPLATES[rng.int(0, STATIC_REPORT_TEMPLATES.length - 1)]!;
      const built = tpl(mhz);
      code = built.code;
      text = built.text;
    }

    out.push({
      id: `fleet-ping:${b}:${peer.id}`,
      relay: peer.id,
      frequency: peer.frequency,
      stationId: peer.stationId,
      stationName,
      code,
      text,
      at: bucketStart,
    });
  }

  return out;
}

let pingSeq = 0;

/**
 * Builds an in-universe `RelayPing` from the operator's vessel (`R/S NIGHTJAR · RELAY 7`).
 */
export function buildRelayPing(
  frequency: number,
  tuned: Tuned,
  customText?: string,
  customCode?: string,
  now = Date.now(),
): RelayPing {
  const freq = round2(frequency);
  const mhz = freq.toFixed(2);
  let stationId: string | null = null;
  let stationName = 'Deep Band Static';
  let defaultCode = 'SIG';
  let defaultText = `Monitoring noise floor at ${mhz} MHz. No carrier lock.`;

  switch (tuned.kind) {
    case 'station':
      stationId = tuned.station.id;
      stationName = tuned.station.name;
      defaultCode = tuned.station.secret ? 'ANOM' : 'LOCK';
      defaultText = tuned.station.secret
        ? `Unlisted carrier ${tuned.station.name} verified at ${mhz} MHz. Logging coordinates.`
        : `Carrier locked on ${tuned.station.name} (${mhz} MHz). Signal nominal from Nightjar console.`;
      break;
    case 'pirate':
      stationId = tuned.station.id;
      stationName = tuned.station.name;
      defaultCode = 'ECHO';
      defaultText = `Unlicensed transmission ${tuned.station.name} intercepted at ${mhz} MHz. Holding lock.`;
      break;
    case 'oddity':
      stationId = null;
      stationName = tuned.label;
      defaultCode = 'ANOM';
      defaultText = `Anomalous transmission (${tuned.label}) logged at ${mhz} MHz. Origin unknown.`;
      break;
    case 'static':
      break;
  }

  const code = customCode?.trim() ? customCode.trim().toUpperCase() : defaultCode;
  const text = customText?.trim() ? customText.trim() : defaultText;

  return {
    id: `nightjar-ping:${now}:${++pingSeq}`,
    relay: SHIP.designation,
    frequency: freq,
    stationId,
    stationName,
    code,
    text,
    at: now,
    live: true,
  };
}

/** In-memory hub so multiple `RelayPresence` instances in the same process/test share live state synchronously. */
const activeInstances = new Set<RelayPresence>();

export interface RelayPresenceOptions {
  initialPings?: RelayPing[];
  stationRoster?: readonly StationDef[];
  wsUrl?: string;
  peerId?: string;
}

export class RelayPresence {
  readonly instanceId: string;
  readonly peerDesignation: string;
  private readonly roster: readonly StationDef[];
  private readonly listeners = new Set<() => void>();
  private readonly livePeers = new Map<string, { peer: RelayPeer; seenAt: number }>();
  private userPings: RelayPing[] = [];
  private channel: BroadcastChannel | null = null;
  private socket: WebSocket | null = null;
  private disposed = false;

  constructor(options: RelayPresenceOptions = {}) {
    this.instanceId = `relay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.peerDesignation = options.peerId ?? `${SHIP.designation} ·PEER`;
    this.roster = options.stationRoster ?? STATIONS;
    if (options.initialPings?.length) {
      this.userPings = [...options.initialPings].slice(0, MAX_PINGS);
    }

    activeInstances.add(this);
    this.connectBroadcastChannel();
    const envWsUrl =
      options.wsUrl ??
      ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_RELAY_WS_URL || undefined);
    if (envWsUrl) this.connectWebSocket(envWsUrl);
  }

  private connectBroadcastChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel(RELAY_CHANNEL_NAME);
      channel.onmessage = (ev: MessageEvent) => {
        this.handleIncoming(ev.data);
      };
      // In Node.js worker_threads, unref the channel so it never blocks process/test exit.
      (channel as unknown as { unref?: () => void }).unref?.();
      this.channel = channel;
    } catch {
      this.channel = null;
    }
  }

  private connectWebSocket(url: string): void {
    if (typeof WebSocket === 'undefined') return;
    try {
      const ws = new WebSocket(url);
      ws.addEventListener('message', (ev) => {
        try {
          const parsed: unknown = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
          if (parsed) this.handleIncoming(parsed);
        } catch {
          // Ignore malformed frames.
        }
      });
      this.socket = ws;
    } catch {
      this.socket = null;
    }
  }

  /** Processes an incoming `{ type: 'tune' | 'ping' }` wire message from another tab or socket. */
  handleIncoming(raw: unknown): void {
    if (this.disposed || !raw || typeof raw !== 'object') return;
    const msg = raw as Partial<RelayWireMessage>;
    if (msg.senderId && msg.senderId === this.instanceId) return;

    if (msg.type === 'tune' && msg.peer && typeof msg.peer.id === 'string' && typeof msg.peer.frequency === 'number') {
      const peer: RelayPeer = {
        id: msg.peer.id,
        frequency: round2(msg.peer.frequency),
        stationId: msg.peer.stationId ?? null,
        live: true,
      };
      const key = msg.senderId ?? peer.id;
      this.livePeers.set(key, { peer, seenAt: typeof msg.at === 'number' ? msg.at : Date.now() });
      this.emit();
      return;
    }

    if (msg.type === 'ping' && msg.ping && typeof msg.ping.id === 'string' && typeof msg.ping.text === 'string') {
      const incoming: RelayPing = { ...msg.ping, live: true };
      if (!this.userPings.some((p) => p.id === incoming.id)) {
        this.userPings = [incoming, ...this.userPings].slice(0, MAX_PINGS);
        this.emit();
      }
    }
  }

  private broadcast(msg: RelayWireMessage): void {
    if (this.disposed) return;
    // 1. In-memory peers (instant synchronous delivery for same-process instances/tests).
    for (const other of activeInstances) {
      if (other !== this) other.handleIncoming(msg);
    }
    // 2. Cross-tab BroadcastChannel.
    try {
      this.channel?.postMessage(msg);
    } catch {
      // Ignore closed/cloned errors.
    }
    // 3. Optional WebSocket relay.
    try {
      if (this.socket && this.socket.readyState === 1) {
        this.socket.send(JSON.stringify(msg));
      }
    } catch {
      // Ignore socket send errors.
    }
  }

  /**
   * Builds a `RelayPing` from `R/S NIGHTJAR · RELAY 7` for the given frequency and tuned state.
   */
  buildPing(
    frequency: number,
    tuned: Tuned,
    customText?: string,
    customCode?: string,
    now = Date.now(),
  ): RelayPing {
    return buildRelayPing(frequency, tuned, customText, customCode, now);
  }

  /**
   * Creates, stores, and broadcasts a live subspace ping across `BroadcastChannel` and WebSocket.
   */
  sendPing(
    frequency: number,
    tuned: Tuned,
    customText?: string,
    customCode?: string,
    now = Date.now(),
  ): RelayPing {
    const ping = this.buildPing(frequency, tuned, customText, customCode, now);
    this.userPings = [ping, ...this.userPings.filter((p) => p.id !== ping.id)].slice(0, MAX_PINGS);
    this.broadcast({ type: 'ping', ping, senderId: this.instanceId });
    this.emit();
    return ping;
  }

  /**
   * Broadcasts this tab's current tuned frequency to other open tabs / connected peers.
   */
  announceTune(frequency: number, stationId: string | null, now = Date.now()): RelayPeer {
    const peer: RelayPeer = {
      id: this.peerDesignation,
      frequency: round2(frequency),
      stationId,
      live: true,
    };
    this.broadcast({ type: 'tune', peer, senderId: this.instanceId, at: now });
    return peer;
  }

  /**
   * Active relay vessels on the dial at `wallMs`: live peer tabs/sockets first (`live: true`),
   * followed by deterministic fleet telemetry (`18–32` sister ships).
   */
  peersAt(wallMs = Date.now()): RelayPeer[] {
    const live: RelayPeer[] = [];
    for (const [key, entry] of this.livePeers) {
      if (wallMs - entry.seenAt > LIVE_PEER_TTL_MS) {
        this.livePeers.delete(key);
        continue;
      }
      live.push(entry.peer);
    }
    const fleet = fleetPeersAt(wallMs, this.roster);
    return [...live, ...fleet];
  }

  /** Alias for `peersAt`. */
  getPeers(wallMs = Date.now()): RelayPeer[] {
    return this.peersAt(wallMs);
  }

  /**
   * Recent subspace wire pings at `wallMs`, newest first: merges live/persisted operator and
   * peer pings with deterministic 2-minute-bucketed fleet reports.
   */
  pingsAt(wallMs = Date.now(), count = 12): RelayPing[] {
    const fleet = fleetPingsAt(wallMs, count, this.roster);
    const seen = new Set<string>();
    const merged: RelayPing[] = [];
    for (const p of [...this.userPings, ...fleet]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
    return merged.sort((a, b) => b.at - a.at).slice(0, MAX_PINGS);
  }

  /** Alias for `pingsAt`. */
  getPings(wallMs = Date.now(), count = 12): RelayPing[] {
    return this.pingsAt(wallMs, count);
  }

  /** User/peer-transmitted pings only (for localStorage persistence). */
  userTransmittedPings(): RelayPing[] {
    return [...this.userPings];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    this.disposed = true;
    activeInstances.delete(this);
    this.listeners.clear();
    try {
      this.channel?.close();
    } catch {
      // Ignore.
    }
    this.channel = null;
    try {
      this.socket?.close();
    } catch {
      // Ignore.
    }
    this.socket = null;
  }
}

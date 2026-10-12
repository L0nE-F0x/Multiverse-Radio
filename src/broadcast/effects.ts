// Side effects that mirror broadcast state into the browser: Media Session metadata and
// lock-screen controls, the tab title and the deep link (./url.ts). (Volume, the dial and
// discoveries are persisted by the store itself.) The UI mounts this once in <App />.
//
// Everything here subscribes to the store directly rather than through React state, so
// dragging the dial (dozens of updates a second) never re-renders the component using it.

import { useEffect } from 'react';
import { stationForId } from './dial';
import { segmentArtist, segmentTitle } from './describe';
import { resolveAsset } from './manifest';
import { useBroadcast } from './store';
import type { BroadcastStore } from './types';
import { urlFor } from './url';

const APP = 'Multiverse Radio';
const BASE = import.meta.env?.BASE_URL ?? '/';
/** The address bar follows the dial once it rests (browsers rate-limit replaceState). */
const URL_SETTLE_MS = 500;

const mhz = (f: number) => `${f.toFixed(2)} MHz`;

/** What to call what's on: [title line, artist line, album line] for the title and lock screen. */
function describe(state: BroadcastStore): { tab: string; title: string | null; artist: string | null; album: string } {
  const { tuned, onAir, status, frequency } = state;
  if (tuned.kind === 'static') {
    return { tab: `Static · ${mhz(frequency)}`, title: 'Static', artist: null, album: mhz(frequency) };
  }
  if (tuned.kind === 'oddity') {
    return { tab: `${tuned.label} · ${mhz(frequency)}`, title: tuned.label, artist: 'Unknown transmitter', album: mhz(frequency) };
  }
  const station = tuned.station;
  const secretUnfound = station.secret && !state.discovered.includes(station.id);
  const name = secretUnfound ? `Unidentified signal · ${mhz(station.frequency)}` : station.name;
  const title = onAir ? segmentTitle(onAir) : null;
  const artist = onAir ? segmentArtist(onAir, station) : null;
  if (status === 'playing' && title) return { tab: `${title} — ${name}`, title, artist, album: name };
  return { tab: name, title, artist, album: name };
}

export function useBroadcastEffects(): void {
  // Tab title and lock-screen metadata.
  useEffect(() => {
    let lastTab = '';
    let lastMeta = '';
    const apply = (state: BroadcastStore) => {
      const { status } = state;
      const d = describe(state);
      const tab =
        status === 'playing'
          ? `▶ ${d.tab} · ${APP}`
          : status === 'tuning'
            ? `Tuning… ${d.album} · ${APP}`
            : status === 'lost'
              ? `Signal lost · ${APP}`
              : status === 'paused'
                ? `${d.album} (paused) · ${APP}`
                : APP;
      if (tab !== lastTab) document.title = lastTab = tab;

      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      const powered = status !== 'off';
      const station = stationForId(state.stationId);
      const title = d.title ?? d.album;
      const artist = d.artist ?? (state.tuned.kind === 'station' || state.tuned.kind === 'pirate' ? state.tuned.station.host.name : APP);
      const key = powered ? `${title}|${artist}|${d.album}` : '';
      if (key === lastMeta) return;
      lastMeta = key;
      navigator.mediaSession.metadata =
        powered && station
          ? new MediaMetadata({
              title,
              artist,
              album: d.album,
              artwork: [{ src: resolveAsset('/favicon.svg'), sizes: 'any', type: 'image/svg+xml' }],
            })
          : null;
    };
    apply(useBroadcast.getState());
    return useBroadcast.subscribe(apply);
  }, []);

  // Deep link: /station/<id>/, ?station=<secret> or ?f=<MHz>, without adding history entries.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastKey = '';
    const sync = () => {
      try {
        const { tuned, frequency } = useBroadcast.getState();
        const next = urlFor(new URL(location.href), tuned, frequency, BASE);
        if (next.href !== location.href) history.replaceState(history.state, '', next);
      } catch {
        // Sandboxed or unusual environments: not important.
      }
    };
    const schedule = (state: BroadcastStore) => {
      const key = `${state.tuned.kind}:${state.tuned.kind === 'station' || state.tuned.kind === 'pirate' ? state.tuned.station.id : state.frequency.toFixed(2)}`;
      if (key === lastKey) return;
      lastKey = key;
      clearTimeout(timer);
      timer = setTimeout(sync, URL_SETTLE_MS);
    };
    schedule(useBroadcast.getState());
    const unsubscribe = useBroadcast.subscribe(schedule);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Lock screen / hardware media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const live = () => {
      const s = useBroadcast.getState().status;
      return s === 'playing' || s === 'tuning';
    };
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => !live() && useBroadcast.getState().togglePlay()],
      ['pause', () => live() && useBroadcast.getState().togglePlay()],
      ['stop', () => live() && useBroadcast.getState().togglePlay()],
      ['nexttrack', () => useBroadcast.getState().stepStation(1)],
      ['previoustrack', () => useBroadcast.getState().stepStation(-1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Unsupported action on this browser.
      }
    }
    const apply = (status: string) => {
      session.playbackState = status === 'playing' || status === 'tuning' ? 'playing' : status === 'paused' ? 'paused' : 'none';
    };
    apply(useBroadcast.getState().status);
    const unsubscribe = useBroadcast.subscribe((state, previous) => {
      if (state.status !== previous.status) apply(state.status);
    });
    return () => {
      unsubscribe();
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, []);
}

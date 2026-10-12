// Side effects that mirror broadcast state into the browser: Media Session metadata and
// lock-screen controls, the tab title and the ?station= deep link. (Volume and the last
// station are persisted by the store itself.) The UI mounts this once in <App />.

import { useEffect } from 'react';
import { stationById } from '../stations/roster';
import { segmentArtist, segmentTitle } from './describe';
import { resolveAsset } from './manifest';
import { useBroadcast } from './store';

const APP = 'Multiverse Radio';

export function useBroadcastEffects(): void {
  const stationId = useBroadcast((s) => s.stationId);
  const status = useBroadcast((s) => s.status);
  const onAir = useBroadcast((s) => s.onAir);
  const station = stationById(stationId);
  const title = onAir ? segmentTitle(onAir) : null;
  const artist = onAir && station ? segmentArtist(onAir, station) : null;

  // Tab title.
  useEffect(() => {
    if (!station) return;
    if (status === 'playing' && title) document.title = `▶ ${title} — ${station.name} · ${APP}`;
    else if (status === 'tuning') document.title = `Tuning to ${station.name}… · ${APP}`;
    else if (status === 'lost') document.title = `Signal lost · ${APP}`;
    else if (status === 'paused') document.title = `${station.name} (paused) · ${APP}`;
    else document.title = APP;
  }, [status, title, station]);

  // ?station= deep link, without adding history entries.
  useEffect(() => {
    try {
      const url = new URL(location.href);
      if (url.searchParams.get('station') === stationId) return;
      url.searchParams.set('station', stationId);
      history.replaceState(history.state, '', url);
    } catch {
      // Sandboxed or unusual environments: not important.
    }
  }, [stationId]);

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
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const powered = status !== 'off';
    navigator.mediaSession.metadata =
      powered && station && title
        ? new MediaMetadata({
            title,
            artist: artist ?? station.host.name,
            album: station.name,
            artwork: [{ src: resolveAsset('/favicon.svg'), sizes: 'any', type: 'image/svg+xml' }],
          })
        : null;
  }, [status, station, title, artist]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState =
      status === 'playing' || status === 'tuning' ? 'playing' : status === 'paused' ? 'paused' : 'none';
  }, [status]);
}

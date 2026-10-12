import { useEffect } from 'react';
import { currentChannel, currentEpisode, isLive, useRadio } from '../lib/store';

/** Lock-screen / hardware media key integration, plus the tab title. */
export function useMediaSession(): void {
  const channel = useRadio(currentChannel);
  const episode = useRadio(currentEpisode);
  const status = useRadio((s) => s.status);
  const powered = status !== 'off';

  useEffect(() => {
    if (status === 'playing' && episode && channel) document.title = `▶ ${episode.title} · ${channel.name}`;
    else if (status === 'tuning') document.title = 'Tuning… · Multiverse Radio';
    else document.title = 'Multiverse Radio';
  }, [status, episode, channel]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => !isLive(useRadio.getState().status) && useRadio.getState().togglePlay()],
      ['pause', () => isLive(useRadio.getState().status) && useRadio.getState().togglePlay()],
      ['nexttrack', () => useRadio.getState().stepEpisode(1)],
      ['previoustrack', () => useRadio.getState().stepEpisode(-1)],
      ['seekto', (details) => details.seekTime != null && useRadio.getState().seek(details.seekTime)],
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
    navigator.mediaSession.metadata =
      powered && episode && channel
        ? new MediaMetadata({ title: episode.title, artist: channel.name, album: 'Multiverse Radio' })
        : null;
  }, [powered, episode, channel]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isLive(status) ? 'playing' : status === 'paused' ? 'paused' : 'none';
  }, [status]);
}

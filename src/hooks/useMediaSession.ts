import { useEffect } from 'react';
import { resolveAsset } from '../broadcast/manifest';
import { useBroadcast } from '../broadcast/store';
import type { BroadcastStore } from '../broadcast/types';
import { MAIN_STATIONS } from '../stations/roster';
import * as act from '../ui/actions';

/** Listed stations have a share card (public/share/<id>.jpg, rendered by `npm run share:cards`). */
const CARDS = new Set(MAIN_STATIONS.map((s) => s.id));

const ICONS: MediaImage[] = [
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
];

function artworkFor(state: BroadcastStore): MediaImage[] {
  const { tuned } = state;
  const id = tuned.kind === 'station' && !tuned.station.secret ? tuned.station.id : null;
  const images = id && CARDS.has(id) ? [{ src: `/share/${id}.jpg`, sizes: '1200x630', type: 'image/jpeg' }] : ICONS;
  return images.map((image) => ({ ...image, src: new URL(resolveAsset(image.src), location.href).href }));
}

/**
 * The lock screen, notification shade and headphone buttons. The broadcast effects publish
 * the title, artist and station (src/broadcast/effects.ts); this adds the station's card as
 * artwork (else the app icon), the show on air, and routes next/previous through the
 * console's own station step so the dial and title card follow.
 */
export function useMediaSession(): void {
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const session = navigator.mediaSession;
    // The album line as the broadcast effects wrote it, before the show was added.
    const albums = new WeakMap<MediaMetadata, string>();

    const apply = (state: BroadcastStore) => {
      const meta = session.metadata;
      if (!meta) return;
      const art = artworkFor(state);
      if (meta.artwork[0]?.src !== art[0]?.src) meta.artwork = art;
      if (!albums.has(meta)) albums.set(meta, meta.album);
      const base = albums.get(meta)!;
      const show = state.show?.name;
      const album = show && base ? `${base} · ${show}` : base;
      if (meta.album !== album) meta.album = album;
    };
    apply(useBroadcast.getState());
    const unsubscribe = useBroadcast.subscribe(apply);

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['nexttrack', () => act.step(1)],
      ['previoustrack', () => act.step(-1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not supported here.
      }
    }
    return unsubscribe;
  }, []);
}

import { useEffect, useSyncExternalStore } from 'react';
import { setDrawer } from '../ui/store';

/**
 * Phones get the pull-up drawer: narrow screens, and short touch screens (a phone on its
 * side). Tablets and desktops keep the docked console. CSS keys off `html[data-layout]`,
 * set from here, so the two never disagree.
 */
export const DRAWER_QUERY = '(max-width: 699px), (max-height: 500px) and (pointer: coarse)';

export type Layout = 'drawer' | 'console';

const query = () => (typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(DRAWER_QUERY) : null);

function subscribe(notify: () => void): () => void {
  const list = query();
  list?.addEventListener('change', notify);
  return () => list?.removeEventListener('change', notify);
}

const snapshot = (): Layout => (query()?.matches ? 'drawer' : 'console');

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, snapshot, () => 'console');
}

/** For <App />: mirror the layout onto <html> and close the drawer when it goes away. */
export function useLayoutSync(): Layout {
  const layout = useLayout();
  useEffect(() => {
    document.documentElement.dataset.layout = layout;
    if (layout !== 'drawer') setDrawer(false);
  }, [layout]);
  return layout;
}

/** Touch-first screens: no keyboard hints. */
export const COARSE_QUERY = '(hover: none) and (pointer: coarse)';

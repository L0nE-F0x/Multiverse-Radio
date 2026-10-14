// Offline lab: opens "Prepare for dead space" on its own, lazily, the way the console does.
// Served at /lab/offline.html; the e2e spec (tests/e2e/offline.spec.ts) stows packs from here.
//
// URL params: ?open=1 (open the panel on load)

import { lazy, StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/michroma/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../index.css';

const OfflinePanel = lazy(() => import('./OfflinePanel'));

function Lab() {
  const [open, setOpen] = useState(new URLSearchParams(location.search).get('open') === '1');
  return (
    <main style={{ padding: 24, color: 'var(--ph)', fontFamily: 'var(--font-term)', display: 'grid', gap: 16, justifyItems: 'start' }}>
      <h1 className="panel-title">Offline lab</h1>
      <p style={{ color: 'var(--ph-dim)', fontSize: 13, maxWidth: '60ch' }}>
        Flight-mode packs. Stow a pack, then go offline: stowed stations keep their voices, the rest play music only.
      </p>
      <button type="button" className="chip" onClick={() => setOpen(true)}>
        Prepare for dead space
      </button>
      <Suspense fallback={null}>
        <OfflinePanel open={open} onClose={() => setOpen(false)} />
      </Suspense>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);

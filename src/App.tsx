import { lazy, Suspense, useEffect, useState } from 'react';
import { useBroadcastEffects } from './broadcast/effects';
import { Announcer } from './components/Announcer';
import { Hud } from './components/Hud';
import { PowerOverlay } from './components/PowerOverlay';
import { Viewport } from './components/Viewport';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useLayoutSync } from './hooks/useLayout';
import { useMediaSession } from './hooks/useMediaSession';
import { useReceiverSync } from './hooks/useReceiverSync';
import { Welcome } from './onboarding';
import * as act from './ui/actions';
import { startShipLog } from './ui/shiplog';
import { openPanel, useUi } from './ui/store';

// Panels load on first open: the console itself stays lean.
const Guide = lazy(() => import('./components/Guide'));
const ShipLogPanel = lazy(() => import('./components/ShipLogPanel'));
const Manual = lazy(() => import('./components/Manual'));
const OfflinePanel = lazy(() => import('./offline/OfflinePanel'));

const closePanel = () => openPanel(null);

export default function App() {
  useBroadcastEffects();
  useMediaSession();
  useReceiverSync();
  useKeyboardControls();
  useLayoutSync();
  useEffect(startShipLog, []);
  const panel = useUi((s) => s.panel);
  // The offline panel stays mounted once opened, so it can keep a download going and animate shut.
  const [stowed, setStowed] = useState(false);
  if (panel === 'offline' && !stowed) setStowed(true);

  return (
    <>
      <main className="console">
        <h1 className="sr-only">Multiverse Radio</h1>
        <Viewport />
        <Hud />
        <PowerOverlay />
      </main>
      <Suspense fallback={null}>
        {panel === 'guide' && <Guide />}
        {panel === 'log' && <ShipLogPanel />}
        {panel === 'help' && <Manual />}
        {stowed && <OfflinePanel open={panel === 'offline'} onClose={closePanel} />}
      </Suspense>
      <Welcome onTuneIn={act.powerOn} />
      <Announcer />
    </>
  );
}

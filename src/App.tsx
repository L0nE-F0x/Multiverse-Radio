import { lazy, Suspense, useEffect } from 'react';
import { useBroadcastEffects } from './broadcast/effects';
import { Announcer } from './components/Announcer';
import { Hud } from './components/Hud';
import { PowerOverlay } from './components/PowerOverlay';
import { Viewport } from './components/Viewport';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useReceiverSync } from './hooks/useReceiverSync';
import { Welcome } from './onboarding';
import * as act from './ui/actions';
import { startShipLog } from './ui/shiplog';
import { useUi } from './ui/store';

// Panels load on first open: the console itself stays lean.
const Guide = lazy(() => import('./components/Guide'));
const ShipLogPanel = lazy(() => import('./components/ShipLogPanel'));
const Manual = lazy(() => import('./components/Manual'));

export default function App() {
  useBroadcastEffects();
  useReceiverSync();
  useKeyboardControls();
  useEffect(startShipLog, []);
  const panel = useUi((s) => s.panel);

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
      </Suspense>
      <Welcome onTuneIn={act.powerOn} />
      <Announcer />
    </>
  );
}

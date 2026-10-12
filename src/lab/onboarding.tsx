// Onboarding lab: the welcome card and install flow over a live station scene, wired to the
// real broadcast store, so TUNE IN really starts the radio. Served at /lab/onboarding.html.
// The e2e spec (tests/e2e/onboarding.spec.ts) can target it with ONBOARDING_URL.
//
// URL params: ?station=<id> (the deep-link case)  ?phosphor=<hex> (preview a HUD colour)
//             ?welcome=1|0 (force the card on/off)  ?scene=0 (no scene behind)

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { useBroadcastEffects } from '../broadcast/effects';
import { useBroadcast } from '../broadcast/store';
import { useInstall, Welcome, WELCOME_STORAGE_KEY } from '../onboarding';
import { captureInstallPrompt } from '../pwa/install';
import { SceneView } from '../scenes/SceneView';
import { stationById } from '../stations/roster';

captureInstallPrompt();

const params = new URLSearchParams(location.search);
const phosphor = params.get('phosphor');
if (phosphor && /^#?[0-9a-f]{3,8}$/i.test(phosphor)) {
  document.documentElement.style.setProperty('--phosphor', phosphor.startsWith('#') ? phosphor : `#${phosphor}`);
}
const showScene = params.get('scene') !== '0';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function tuneIn() {
  const { status, togglePlay } = useBroadcast.getState();
  if (status !== 'playing' && status !== 'tuning') togglePlay();
}

/** A stand-in for Chromium's beforeinstallprompt, for trying the Install button anywhere. */
function fakeInstallPrompt() {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    platforms: ['web'],
    prompt: () => Promise.resolve(),
    userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
  });
  window.dispatchEvent(event);
}

function Lab() {
  useBroadcastEffects();
  const stationId = useBroadcast((s) => s.stationId);
  const status = useBroadcast((s) => s.status);
  const station = stationById(stationId);
  const { platform, canInstall, install } = useInstall();

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = '#050505';
  }, []);

  return (
    <>
      <main style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Onboarding lab</h1>
        {showScene && station && (
          <SceneView
            sceneId={station.scene}
            accent={station.color}
            variantKey={station.id}
            playing={status === 'playing'}
            reducedMotion={reducedMotion}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
            maxWidth: 'calc(100% - 24px)',
            padding: '6px 8px',
            font: '11px/1.4 ui-monospace, monospace',
            color: '#ffb000',
            background: 'rgba(0,0,0,.6)',
            border: '1px solid rgba(255,176,0,.3)',
          }}
        >
          <span data-testid="lab-state">
            {platform} · canInstall={String(canInstall)} · {status}
          </span>
          <LabButton onClick={tuneIn}>power</LabButton>
          <LabButton onClick={fakeInstallPrompt}>fake prompt</LabButton>
          <LabButton onClick={() => void install()}>install()</LabButton>
          <LabButton
            onClick={() => {
              localStorage.removeItem(WELCOME_STORAGE_KEY);
              location.reload();
            }}
          >
            first visit again
          </LabButton>
        </div>
      </main>
      <Welcome onTuneIn={tuneIn} />
    </>
  );
}

function LabButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid rgba(255,176,0,.4)', padding: '2px 6px', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);

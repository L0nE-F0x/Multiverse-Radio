// First-visit welcome card and PWA install flow — public API.
//
// The UI mounts <Welcome onTuneIn={…} /> once in <App />. On a listener's first visit (and
// never inside the installed app) it opens a terminal card in HUSH's voice: TUNE IN (the
// user gesture that unlocks audio), NOT NOW, and an install offer fitted to the platform:
// the native prompt on Android and desktop Chromium, illustrated Add to Home Screen steps on
// iOS, nothing elsewhere. It also renders the iOS steps when install() is called from
// elsewhere (e.g. a menu). Styles are scoped (.nj-*) and coloured by the HUD's --phosphor.
//
// URL overrides for development and screenshots: ?welcome=1 shows the card again,
// ?welcome=0 hides it. Tests can also pre-set localStorage[WELCOME_STORAGE_KEY].

import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  install,
  installSnapshot,
  showInstallInstructions,
  subscribeInstall,
  type InstallResult,
  type InstallSnapshot,
} from '../pwa/install';
import { stationById } from '../stations/roster';
import { SHIP } from '../stations/ship';
import { IosSteps } from './IosSteps';
import { deepLinkStationId, formatMhz, type InstallPlatform } from './platform';
import { TerminalDialog } from './TerminalDialog';
import './welcome.css';

export type { InstallPlatform } from './platform';

export interface WelcomeProps {
  /** Called when the listener chooses to start listening (a user gesture: unlock audio here). */
  onTuneIn: () => void;
}

export interface InstallState {
  platform: InstallPlatform;
  /** True if an install action is available right now (native prompt or iOS instructions). */
  canInstall: boolean;
  /** Native prompt where supported; on iOS opens the illustrated Add to Home Screen steps. */
  install: () => Promise<InstallResult>;
}

/** localStorage key set once the welcome card has been closed (any way). */
export const WELCOME_STORAGE_KEY = 'multiverse-radio:welcomed';

// Read at load, before the broadcast effects rewrite the URL with the current station.
const arrival =
  typeof location === 'undefined'
    ? { search: '', pathname: '/' }
    : { search: location.search, pathname: location.pathname };

function urlOverride(): '0' | '1' | null {
  try {
    const value = new URLSearchParams(arrival.search).get('welcome');
    return value === '0' || value === '1' ? value : null;
  } catch {
    return null;
  }
}

function welcomedBefore(): boolean {
  try {
    return localStorage.getItem(WELCOME_STORAGE_KEY) !== null;
  } catch {
    return false; // storage blocked: better to greet twice than never
  }
}

function rememberWelcome(): void {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, new Date().toISOString());
  } catch {
    // Not fatal: the card shows again next time.
  }
}

function shouldWelcome(): boolean {
  const override = urlOverride();
  if (override === '0' || installSnapshot().platform === 'installed') return false;
  return override === '1' || !welcomedBefore();
}

function useInstallSnapshot(): InstallSnapshot {
  return useSyncExternalStore(subscribeInstall, installSnapshot, installSnapshot);
}

/** For an "Install" control elsewhere in the UI (e.g. a menu). */
export function useInstall(): InstallState {
  const { platform, canInstall } = useInstallSnapshot();
  return useMemo(() => ({ platform, canInstall, install }), [platform, canInstall]);
}

/** Shows on a listener's first visit only (and never inside the installed app). */
export function Welcome({ onTuneIn }: WelcomeProps) {
  const [open, setOpen] = useState(shouldWelcome);
  const { instructions } = useInstallSnapshot();

  if (open) {
    const close = () => {
      rememberWelcome();
      showInstallInstructions(false); // the card already shows the steps
      setOpen(false);
    };
    return <WelcomeCard onTuneIn={onTuneIn} onClose={close} />;
  }
  if (instructions) return <InstallSheet onClose={() => showInstallInstructions(false)} />;
  return null;
}

function localClock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function WelcomeCard({ onTuneIn, onClose }: { onTuneIn: () => void; onClose: () => void }) {
  const [clock] = useState(localClock);
  const tuneInRef = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  const patched = useMemo(() => {
    const id = deepLinkStationId(arrival.search, arrival.pathname);
    return id ? stationById(id) : undefined;
  }, []);

  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };
  const tuneIn = () => {
    try {
      onTuneIn(); // synchronously, inside the click: this is what unlocks audio
    } finally {
      close();
    }
  };

  return (
    <TerminalDialog testId="welcome" labelledBy="nj-welcome-title" describedBy="nj-welcome-text" onDismiss={close}>
      <div className="nj-term__bar">
        <span>{SHIP.designation}</span>
        <span>
          <span className="nj-led" aria-hidden /> {clock} local
        </span>
      </div>
      <div className="nj-term__body">
        <p className="nj-term__kicker">{SHIP.computer.name} › Shift handover</p>
        <h2 id="nj-welcome-title" className="nj-term__title">
          Night shift, operator.
          <span className="nj-term__cursor" aria-hidden />
        </h2>
        <p id="nj-welcome-text" className="nj-term__text">
          Welcome aboard the {SHIP.vessel}. I'm {SHIP.computer.name}, the ship's computer. We drift between dimensions, and
          the receiver picks up whatever they're broadcasting tonight: music, news, adverts for things that don't exist here.
          Your duty is to listen. I'll keep the log, the heading and the kettle.
        </p>
        {patched && (
          <p className="nj-term__patch">
            <span className="nj-term__label">Incoming patch</span>
            You've been patched through to <strong>{patched.name}</strong>, {formatMhz(patched.frequency)} MHz. Someone thought
            you should hear it.
          </p>
        )}
        <div className="nj-term__actions">
          <button
            ref={tuneInRef}
            type="button"
            className="nj-btn nj-btn--primary"
            data-testid="welcome-tune-in"
            data-autofocus
            onClick={tuneIn}
          >
            <svg className="nj-glyph nj-glyph--solid" viewBox="0 0 24 24" aria-hidden focusable="false">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
            Tune in
            <kbd aria-hidden>↵</kbd>
          </button>
          <button type="button" className="nj-btn nj-btn--ghost" data-testid="welcome-dismiss" onClick={close}>
            Not now
            <kbd aria-hidden>Esc</kbd>
          </button>
        </div>
        <InstallOffer afterPrompt={() => tuneInRef.current?.focus({ preventScroll: true })} />
      </div>
    </TerminalDialog>
  );
}

type Outcome = 'pending' | 'accepted' | 'dismissed' | null;

/** The install section of the welcome card, fitted to the platform. */
function InstallOffer({ afterPrompt }: { afterPrompt: () => void }) {
  const { platform, canInstall } = useInstallSnapshot();
  const [outcome, setOutcome] = useState<Outcome>(null);

  let body: ReactNode = null;
  if (platform === 'installed' || outcome === 'accepted') {
    body = <p className="nj-dock__status" role="status">Docked. You'll find the {SHIP.vessel} with your other apps.</p>;
  } else if (outcome === 'dismissed') {
    body = <p className="nj-dock__status" role="status">Understood. I won't bring it up again tonight.</p>;
  } else if (platform === 'ios') {
    body = (
      <>
        <p className="nj-dock__text">
          Keep the receiver on your home screen, where it opens full-screen like proper equipment. Three taps:
        </p>
        <IosSteps />
      </>
    );
  } else if ((platform === 'android' || platform === 'desktop') && (canInstall || outcome === 'pending')) {
    const onInstall = () => {
      setOutcome('pending');
      void install().then((result) => {
        setOutcome(result === 'accepted' ? 'accepted' : result === 'dismissed' ? 'dismissed' : null);
        afterPrompt();
      });
    };
    body = (
      <>
        <p className="nj-dock__text">
          {platform === 'android'
            ? 'Keep the receiver on your home screen. It opens full-screen, like proper equipment, and still boots when the signal drops.'
            : 'Give the receiver its own window. It opens like proper equipment and still boots when the signal drops.'}
        </p>
        <button
          type="button"
          className="nj-btn nj-btn--ghost nj-btn--install"
          data-testid="install-button"
          aria-disabled={outcome === 'pending' || undefined}
          onClick={outcome === 'pending' ? undefined : onInstall}
        >
          <svg className="nj-glyph" viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v3.5h15v-3.5" />
          </svg>
          Install the {SHIP.vessel}
        </button>
      </>
    );
  }

  // Nothing to offer (unsupported, or no prompt yet): no section at all.
  if (!body) return null;
  return (
    <section className="nj-dock" aria-labelledby="nj-dock-title">
      <h3 id="nj-dock-title" className="nj-dock__title">
        Dock the {SHIP.vessel}
      </h3>
      {body}
    </section>
  );
}

/** The iOS steps on their own, for install() called outside the welcome card. */
function InstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <TerminalDialog testId="install-sheet" labelledBy="nj-install-title" describedBy="nj-install-text" onDismiss={onClose}>
      <div className="nj-term__bar">
        <span>{SHIP.designation}</span>
        <span>Docking</span>
      </div>
      <div className="nj-term__body">
        <p className="nj-term__kicker">{SHIP.computer.name} › Installation</p>
        <h2 id="nj-install-title" className="nj-term__title nj-term__title--small">
          Dock the {SHIP.vessel}
        </h2>
        <p id="nj-install-text" className="nj-term__text">
          Three taps and the receiver lives on your home screen, where it opens full-screen like proper equipment. I'll wait.
        </p>
        <IosSteps />
        <div className="nj-term__actions nj-term__actions--end">
          <button type="button" className="nj-btn nj-btn--primary" data-autofocus onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </TerminalDialog>
  );
}

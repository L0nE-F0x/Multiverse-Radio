// Captures the browser's install prompt as early as possible (Chromium fires
// `beforeinstallprompt` once, often before React mounts) and keeps the install state that
// useInstall() in src/onboarding reads. Framework-free: main.tsx calls
// captureInstallPrompt() before anything renders.

import { canInstallOn, detectPlatform, type InstallPlatform } from '../onboarding/platform';

/** Chromium's install prompt (not in the DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export type InstallResult = 'accepted' | 'dismissed' | 'instructions' | 'unavailable';

export interface InstallSnapshot {
  platform: InstallPlatform;
  /** An install action is available right now (a native prompt, or the iOS steps). */
  canInstall: boolean;
  /** iOS: someone asked for the Add to Home Screen steps (install() outside the welcome card). */
  instructions: boolean;
}

/** Installed apps run in one of these (window-controls-overlay: desktop apps with a custom title bar). */
const STANDALONE_QUERIES = ['(display-mode: standalone)', '(display-mode: window-controls-overlay)'];

let capturing = false;
let deferred: BeforeInstallPromptEvent | null = null;
let installedThisVisit = false;
let instructions = false;
let snapshot: InstallSnapshot | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}

/** Running as the installed app. */
export function isStandalone(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    return STANDALONE_QUERIES.some((query) => window.matchMedia?.(query).matches === true);
  } catch {
    return false;
  }
}

/** Call once, first thing (main.tsx does). Safe to call again. */
export function captureInstallPrompt(): void {
  if (capturing || typeof window === 'undefined') return;
  capturing = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-infobar out of the way: the welcome card (or a menu) offers it.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    installedThisVisit = true;
    deferred = null;
    changed();
  });
  for (const query of STANDALONE_QUERIES) {
    try {
      window.matchMedia?.(query).addEventListener?.('change', changed);
    } catch {
      // Very old browsers: the mode never changes under us anyway.
    }
  }
}

export function installSnapshot(): InstallSnapshot {
  if (!snapshot) {
    const platform = detectPlatform({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone: isStandalone(),
      hasPrompt: deferred !== null,
      installed: installedThisVisit,
    });
    snapshot = {
      platform,
      canInstall: canInstallOn(platform, deferred !== null),
      instructions: instructions && platform === 'ios',
    };
  }
  return snapshot;
}

export function subscribeInstall(listener: () => void): () => void {
  captureInstallPrompt();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Show or hide the iOS Add to Home Screen steps (rendered by <Welcome />). */
export function showInstallInstructions(open: boolean): void {
  if (instructions === open) return;
  instructions = open;
  changed();
}

/**
 * Install the app. Call from a user gesture: the native prompt must open inside it. On iOS
 * this opens the Add to Home Screen steps instead.
 */
export function install(): Promise<InstallResult> {
  const { platform } = installSnapshot();
  if (platform === 'ios') {
    showInstallInstructions(true);
    return Promise.resolve('instructions');
  }
  const event = deferred;
  if (!event) return Promise.resolve('unavailable');
  // A prompt can only be shown once; Chromium sends a fresh event if it wants to offer again.
  deferred = null;
  let shown: Promise<unknown>;
  try {
    shown = event.prompt(); // synchronously, while the click still counts as a user gesture
  } catch {
    changed();
    return Promise.resolve('unavailable');
  }
  changed();
  return (async () => {
    try {
      await shown;
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') {
        installedThisVisit = true;
        changed();
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  })();
}

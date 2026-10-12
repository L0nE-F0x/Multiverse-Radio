// First-visit welcome card and PWA install flow — public API.
//
// STUB: the onboarding workstream implements this. The UI mounts <Welcome /> once in <App />.

export interface WelcomeProps {
  /** Called when the listener chooses to start listening (a user gesture: unlock audio here). */
  onTuneIn: () => void;
}

/** Shows on a listener's first visit only (and never inside the installed app). */
export function Welcome(_props: WelcomeProps) {
  return null;
}

export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'installed' | 'unsupported';

export interface InstallState {
  platform: InstallPlatform;
  /** True if an install action is available right now (native prompt or iOS instructions). */
  canInstall: boolean;
  /** Native prompt where supported; on iOS opens the illustrated Add to Home Screen steps. */
  install: () => Promise<'accepted' | 'dismissed' | 'instructions' | 'unavailable'>;
}

/** For an "Install" control elsewhere in the UI (e.g. a menu). */
export function useInstall(): InstallState {
  return { platform: 'unsupported', canInstall: false, install: async () => 'unavailable' };
}

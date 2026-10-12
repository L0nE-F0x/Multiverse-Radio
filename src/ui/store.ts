// UI-only state: which panel is open, captions, the HUD's visibility and the console's
// system messages. Radio state lives in the broadcast store; nothing here affects what's on air.

import { create } from 'zustand';

export type PanelId = 'guide' | 'log' | 'help';

/** auto: shown, then dims and hides when idle. hidden: kept out of the way (H). */
export type HudMode = 'auto' | 'hidden';

export interface Toast {
  id: number;
  text: string;
}

interface UiState {
  panel: PanelId | null;
  captions: boolean;
  hud: HudMode;
  toast: Toast | null;
  /** Bumped when the listener tunes, so the ident card can replay for the same station. */
  identNonce: number;
  /** When this session's shift began (first time on air), epoch ms. */
  shiftStart: number | null;
}

const PREFS_KEY = 'multiverse-radio:ui';

function loadPrefs(): { captions?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { captions?: boolean };
  } catch {
    return {};
  }
}

export const useUi = create<UiState>()(() => ({
  panel: null,
  captions: loadPrefs().captions ?? true,
  hud: 'auto',
  toast: null,
  identNonce: 0,
  shiftStart: null,
}));

useUi.subscribe((state, previous) => {
  if (state.captions === previous.captions) return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ captions: state.captions }));
  } catch {
    // Private mode or full storage: preferences just won't stick.
  }
});

export const ui = () => useUi.getState();

export function openPanel(panel: PanelId | null): void {
  useUi.setState({ panel });
}

export function togglePanel(panel: PanelId): void {
  useUi.setState({ panel: ui().panel === panel ? null : panel });
}

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** A one-line system message above the function keys. */
export function toast(text: string, ms = 3600): void {
  clearTimeout(toastTimer);
  useUi.setState({ toast: { id: ++toastId, text } });
  toastTimer = setTimeout(() => useUi.setState({ toast: null }), ms);
}

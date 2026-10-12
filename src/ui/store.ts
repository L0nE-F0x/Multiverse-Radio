// UI-only state: overlays, ambient mode, the sleep timer, and the cabinet's moods.
// Radio state lives in the broadcast store; nothing here affects what's on air.

import { create } from 'zustand';

/** Things that make the cabinet react (shake, jiggle, flash). */
export type CabinetEvent = 'tune' | 'scan' | 'skip' | 'smack' | 'wiggle' | 'boop' | 'overtravel' | 'power';

export interface Toast {
  id: number;
  text: string;
}

interface UiState {
  ambient: boolean;
  guideOpen: boolean;
  helpOpen: boolean;
  captions: boolean;
  /** Epoch ms at which the sleep timer powers the radio down; null = off. */
  sleepEndsAt: number | null;
  /** Last cabinet event; `at` changes every time so effects can re-trigger. */
  event: { kind: CabinetEvent; at: number } | null;
  /** The scan flourish currently running on the screen. */
  scan: { at: number; targetId: string; fromId: string } | null;
  smacks: number;
  /** Reception is "improved" until this time (smacks and antenna wiggles). */
  boostUntil: number;
  /** Bumped by wiggles/smacks so the reception report re-rolls. */
  receptionNonce: number;
  toast: Toast | null;

  set(partial: Partial<Omit<UiState, 'set'>>): void;
}

const PREFS_KEY = 'multiverse-radio:ui';

function loadPrefs(): { captions?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { captions?: boolean };
  } catch {
    return {};
  }
}

export const useUi = create<UiState>()((set) => ({
  ambient: false,
  guideOpen: false,
  helpOpen: false,
  captions: loadPrefs().captions ?? true,
  sleepEndsAt: null,
  event: null,
  scan: null,
  smacks: 0,
  boostUntil: 0,
  receptionNonce: 0,
  toast: null,
  set: (partial) => set(partial),
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

export function emit(kind: CabinetEvent): void {
  useUi.setState({ event: { kind, at: performance.now() } });
}

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** A little paper slip that pops out of the cabinet for a few seconds. */
export function toast(text: string, ms = 4200): void {
  clearTimeout(toastTimer);
  useUi.setState({ toast: { id: ++toastId, text } });
  toastTimer = setTimeout(() => useUi.setState({ toast: null }), ms);
}

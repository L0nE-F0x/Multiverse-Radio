import { useEffect, useRef, useState } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useUi } from '../ui/store';

export type HudState = 'awake' | 'dim' | 'hidden';

const DIM_MS = 4000;
const HIDE_MS = 8000;

/** Elements that keep the HUD awake while pointed at or keyboard-focused. */
export const KEEP_AWAKE = '[data-keep-awake]';
/** The bare viewport: a tap there toggles the HUD on touch screens. */
export const VIEWPORT = '[data-viewport]';

/**
 * "Leave it on": while on air, the HUD dims after a few idle seconds, then hides, and wakes
 * on any input. It stays up while paused/off, while a panel is open, and while the pointer
 * rests on (or the keyboard focus sits in) the controls. H hides it until H or a tap.
 */
export function useHudState(): HudState {
  const mode = useUi((s) => s.hud);
  const playing = useBroadcast((s) => s.status === 'playing');
  const panel = useUi((s) => s.panel);
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const auto = playing && !panel && mode === 'auto';
  const state: HudState = mode === 'hidden' ? 'hidden' : !auto ? 'awake' : (['awake', 'dim', 'hidden'] as const)[level];
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!auto) {
      setLevel(0);
      return;
    }
    let dimTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    let last = 0;
    let pointerOnHud = false;

    const keepAwake = () => {
      if (pointerOnHud) return true;
      const active = document.activeElement;
      return !!active?.closest(KEEP_AWAKE) && active.matches(':focus-visible');
    };
    const later = (fn: () => void, ms: number) => setTimeout(() => (keepAwake() ? arm() : fn()), ms);
    const arm = () => {
      clearTimeout(dimTimer);
      clearTimeout(hideTimer);
      dimTimer = later(() => setLevel((l) => (l < 1 ? 1 : l)), DIM_MS);
      hideTimer = later(() => setLevel(2), HIDE_MS);
    };

    const wake = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.type === 'pointermove' || event.type === 'pointerdown') pointerOnHud = !!target?.closest(KEEP_AWAKE);
      // A tap on the bare viewport toggles the HUD, like a video player.
      if (event.type === 'pointerdown' && (event as PointerEvent).pointerType === 'touch' && target?.closest(VIEWPORT)) {
        if (stateRef.current === 'awake') {
          clearTimeout(dimTimer);
          clearTimeout(hideTimer);
          setLevel(2);
          return;
        }
      }
      const now = performance.now();
      if (event.type === 'pointermove' && now - last < 150) return;
      last = now;
      setLevel(0);
      arm();
    };
    const leave = () => (pointerOnHud = false);

    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focusin'] as const;
    for (const type of events) window.addEventListener(type, wake, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    arm();
    return () => {
      clearTimeout(dimTimer);
      clearTimeout(hideTimer);
      for (const type of events) window.removeEventListener(type, wake);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [auto]);

  // Hidden with H: a tap or click brings it back.
  useEffect(() => {
    if (mode !== 'hidden') return;
    const restore = () => useUi.setState({ hud: 'auto' });
    window.addEventListener('pointerdown', restore);
    return () => window.removeEventListener('pointerdown', restore);
  }, [mode]);

  return state;
}

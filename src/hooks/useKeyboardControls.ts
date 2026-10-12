import { useEffect } from 'react';
import * as act from '../ui/actions';
import { ui, useUi } from '../ui/store';

/**
 * Space play/pause · ←/→ station · S scan · N skip · M mute · F ambient · G guide ·
 * C captions · −/+ volume · ? help · Esc leaves ambient mode.
 *
 * Shortcuts stay out of the way while typing, inside open dialogs, and on sliders that
 * use the arrow keys themselves. Space on a button you reached with the keyboard presses
 * that button; on one you last clicked with the mouse, it's play/pause as usual.
 */
export function useKeyboardControls(): void {
  useEffect(() => {
    // Input modality: did the focused element get focus from the keyboard? (Chrome makes
    // any focused button :focus-visible once a key is pressed, so we can't ask CSS.)
    let lastKeyAt = -Infinity;
    let keyboardFocus = false;
    const markKey = () => (lastKeyAt = performance.now());
    const markPointer = () => (keyboardFocus = false);
    const onFocusIn = () => (keyboardFocus = performance.now() - lastKeyAt < 150);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
      const { guideOpen, helpOpen, ambient } = ui();
      if (guideOpen || helpOpen) return;
      const onSlider = !!target?.closest('input[type="range"], [role="slider"]');
      const onKeyboardButton = keyboardFocus && !!target?.closest('button, [role="button"], a[href]');
      const once = !event.repeat;

      const handled = (() => {
        switch (event.key) {
          case ' ':
            if (onKeyboardButton) return false;
            if (once) act.togglePlay();
            return true;
          case 'ArrowRight':
          case 'ArrowLeft':
            if (onSlider) return false;
            if (once) act.step(event.key === 'ArrowRight' ? 1 : -1);
            return true;
          case 's':
          case 'S':
            if (once) act.scan();
            return true;
          case 'n':
          case 'N':
            if (once) act.skip();
            return true;
          case 'm':
          case 'M':
            if (once) act.toggleMute();
            return true;
          case 'f':
          case 'F':
            if (once) act.toggleAmbient();
            return true;
          case 'g':
          case 'G':
            if (once) useUi.setState({ guideOpen: true });
            return true;
          case 'c':
          case 'C':
            if (once) act.toggleCaptions();
            return true;
          case '-':
          case '_':
            act.nudgeVolume(-0.05);
            return true;
          case '+':
          case '=':
            act.nudgeVolume(0.05);
            return true;
          case '?':
            if (once) useUi.setState({ helpOpen: true });
            return true;
          case 'Escape':
            if (!ambient) return false;
            act.setAmbient(false);
            return true;
          default:
            return false;
        }
      })();
      if (handled) event.preventDefault();
    };

    // Buttons activate on Space keyup; when Space meant play/pause, stop the button too.
    const onKeyUp = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === ' ' && !keyboardFocus && target?.closest('button, [role="button"]')) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', markKey, true);
    window.addEventListener('pointerdown', markPointer, true);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('fullscreenchange', act.onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', markKey, true);
      window.removeEventListener('pointerdown', markPointer, true);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('fullscreenchange', act.onFullscreenChange);
    };
  }, []);
}

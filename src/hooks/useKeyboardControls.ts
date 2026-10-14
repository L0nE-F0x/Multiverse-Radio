import { useEffect } from 'react';
import { DIAL } from '../broadcast/types';
import * as act from '../ui/actions';
import { togglePanel, ui } from '../ui/store';
import { nudgeDial } from '../ui/tuning';

/**
 * Space play/pause · ←/→ fine-tune · Shift+←/→ or ↑/↓ station step · S scan · N skip ·
 * M mute · −/+ volume · G guide · L log · O offline · C captions · H HUD · ? manual.
 *
 * Shortcuts stay out of the way while typing, inside open panels (except the key that
 * toggles that panel), and on sliders that use the arrow keys themselves. Space on a button
 * reached with the keyboard presses that button; on one last clicked with the mouse, it's
 * play/pause as usual.
 */
export function useKeyboardControls(): void {
  useEffect(() => {
    // Input modality: did the focused element get focus from the keyboard?
    let lastKeyAt = -Infinity;
    let keyboardFocus = false;
    const markKey = () => (lastKeyAt = performance.now());
    const markPointer = () => (keyboardFocus = false);
    const onFocusIn = () => (keyboardFocus = performance.now() - lastKeyAt < 150);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
      const { panel } = ui();
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const once = !event.repeat;

      if (panel) {
        // Inside a panel only its own toggle key closes it; Esc is the dialog's (the offline
        // panel is the offline agent's own, so Esc is covered here too).
        if (key === 'Escape' && panel === 'offline') {
          togglePanel(panel);
          event.preventDefault();
          return;
        }
        const toggles: Record<string, string> = { g: 'guide', l: 'log', o: 'offline', '?': 'help' };
        if (toggles[key] === panel && once) {
          togglePanel(panel);
          event.preventDefault();
        }
        return;
      }

      const onSlider = !!target?.closest('input[type="range"], [role="slider"]');
      const onKeyboardButton = keyboardFocus && !!target?.closest('button, [role="button"], a[href]');

      const handled = (() => {
        switch (key) {
          case ' ':
            if (onKeyboardButton) return false;
            if (once) act.togglePlay();
            return true;
          case 'ArrowRight':
          case 'ArrowLeft': {
            if (onSlider) return false;
            const dir = key === 'ArrowRight' ? 1 : -1;
            if (event.shiftKey) {
              if (once) act.step(dir);
            } else nudgeDial(dir * DIAL.step);
            return true;
          }
          case 'ArrowUp':
          case 'ArrowDown':
            if (onSlider) return false;
            if (once) act.step(key === 'ArrowUp' ? 1 : -1);
            return true;
          case 's':
            if (once) act.scan();
            return true;
          case 'n':
            if (once) act.skip();
            return true;
          case 'm':
            if (once) act.toggleMute();
            return true;
          case 'g':
            if (once) togglePanel('guide');
            return true;
          case 'l':
            if (once) togglePanel('log');
            return true;
          case 'o':
            if (once) togglePanel('offline');
            return true;
          case 'c':
            if (once) act.toggleCaptions();
            return true;
          case 'h':
            if (once) act.toggleHud();
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
            if (once) togglePanel('help');
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
      if (event.key === ' ' && !keyboardFocus && target?.closest('button, [role="button"]')) event.preventDefault();
    };

    window.addEventListener('keydown', markKey, true);
    window.addEventListener('pointerdown', markPointer, true);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', markKey, true);
      window.removeEventListener('pointerdown', markPointer, true);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}

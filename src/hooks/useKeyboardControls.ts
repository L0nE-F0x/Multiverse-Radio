import { useEffect } from 'react';
import { useRadio } from '../lib/store';

/**
 * Space play/pause · ←/→ previous/next episode · ↑/↓ channel up/down · M mute.
 * Keys are left alone while typing, and arrows are left to sliders that use them.
 */
export function useKeyboardControls(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
      const onSlider = !!target?.closest('input[type="range"], [role="slider"]');
      const radio = useRadio.getState();
      if (radio.dataState !== 'ready') return;

      const handled = (() => {
        switch (event.key) {
          case ' ':
            if (!event.repeat) radio.togglePlay();
            return true;
          case 'm':
          case 'M':
            if (!event.repeat) radio.toggleMute();
            return true;
          case 'ArrowRight':
            if (onSlider) return false;
            if (!event.repeat) radio.stepEpisode(1);
            return true;
          case 'ArrowLeft':
            if (onSlider) return false;
            if (!event.repeat) radio.stepEpisode(-1);
            return true;
          case 'ArrowUp':
            if (onSlider) return false;
            if (!event.repeat) radio.stepChannel(1);
            return true;
          case 'ArrowDown':
            if (onSlider) return false;
            if (!event.repeat) radio.stepChannel(-1);
            return true;
          default:
            return false;
        }
      })();
      if (handled) event.preventDefault();
    };

    // Buttons activate on Space keyup; stop that so Space never double-fires.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button, [role="button"]')) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}

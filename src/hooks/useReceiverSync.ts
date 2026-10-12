import { useEffect } from 'react';
import { useBroadcast } from '../broadcast/store';
import { observeSegment } from '../ui/clock';
import { darken, phosphorHex, tunedPhosphor } from '../ui/phosphor';
import { useTuned } from '../ui/select';
import { ui, useUi } from '../ui/store';

/**
 * Keeps page-level things in step with the radio without re-rendering anything: the
 * phosphor the whole console glows in, the browser's theme colour, the power state on
 * <html> (CSS uses it to rest decorative animations), and the segment clock used for
 * progress bars.
 */
export function useReceiverSync(): void {
  const tuned = useTuned();
  const phosphor = tunedPhosphor(tuned);

  useEffect(() => {
    const root = document.documentElement;
    const hex = phosphorHex(phosphor);
    root.style.setProperty('--ph', hex);
    root.dataset.phosphor = phosphor;
    root.dataset.tuned = tuned.kind;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darken(hex, 0.9));
  }, [phosphor, tuned.kind]);

  useEffect(() => {
    const apply = (status: string) => {
      document.documentElement.dataset.status = status;
      // The night shift starts the first time anything comes through.
      if (status === 'playing' && ui().shiftStart === null) useUi.setState({ shiftStart: Date.now() });
    };
    apply(useBroadcast.getState().status);
    observeSegment(useBroadcast.getState().onAir);
    return useBroadcast.subscribe((state, previous) => {
      // Read the latest status: a nested update may already have superseded `state`.
      if (state.status !== previous.status) apply(useBroadcast.getState().status);
      if (state.onAir !== previous.onAir) observeSegment(state.onAir);
    });
  }, []);
}

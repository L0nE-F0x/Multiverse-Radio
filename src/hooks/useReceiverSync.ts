import { useEffect } from 'react';
import { useBroadcast } from '../broadcast/store';
import { observeSegment } from '../ui/clock';
import { useStation } from '../ui/select';

/**
 * Keeps page-level things in step with the radio without re-rendering anything:
 * the accent color the whole UI is tinted with, the power state on <html> (CSS uses it
 * to rest decorative animations), and the segment clock used for progress bars.
 */
export function useReceiverSync(): void {
  const station = useStation();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', station.color);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mixWithBlack(station.color, 0.82));
  }, [station.color]);

  useEffect(() => {
    const apply = (status: string) => {
      document.documentElement.dataset.status = status;
    };
    apply(useBroadcast.getState().status);
    observeSegment(useBroadcast.getState().onAir);
    return useBroadcast.subscribe((state, previous) => {
      if (state.status !== previous.status) apply(state.status);
      if (state.onAir !== previous.onAir) observeSegment(state.onAir);
    });
  }, []);
}

function mixWithBlack(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

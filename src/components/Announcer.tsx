import { useRef } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useTuning } from '../ui/tuning';
import { formatMhz, segmentLabel } from '../ui/format';
import { useOnAir, useSource, useStatus } from '../ui/select';

/**
 * Screen-reader announcements for the things worth interrupting for: what the dial found,
 * pausing, and each new track. Voice clips leave the message as it was (talk stations change
 * clip every few seconds; the readouts have the details), and captions are never announced.
 * Quiet while the dial is being turned, so a sweep doesn't read out every station it passes.
 */
export function Announcer() {
  const source = useSource();
  const status = useStatus();
  const segment = useOnAir();
  const frequency = useBroadcast((s) => s.frequency);
  const holding = useTuning((s) => s.holding);
  const held = useRef('');

  let message: string;
  const where = `${source.name}, ${formatMhz(frequency)} megahertz`;
  if (holding) message = held.current;
  else if (status === 'tuning') {
    message = `Tuning to ${where}.`;
    held.current = `${source.name}, on air.`;
  } else if (status === 'paused') message = 'Paused.';
  else if (status === 'playing' && source.kind === 'static') message = held.current = `${formatMhz(frequency)} megahertz. No signal.`;
  else if (status === 'playing' && source.kind === 'oddity') message = held.current = `${where}. Unidentified source.`;
  else if (status === 'playing' && segment?.kind === 'track') {
    const label = segmentLabel(segment, source.station ?? undefined);
    message = held.current = `${source.name}. Now playing ${label.title}, by ${label.byline}.`;
  } else if (status === 'playing') message = held.current || `${source.name}, on air.`;
  else message = '';

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

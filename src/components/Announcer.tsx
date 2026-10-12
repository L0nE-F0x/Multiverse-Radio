import { segmentLabel } from '../ui/format';
import { useOnAir, useStation, useStatus } from '../ui/select';

/**
 * Screen-reader announcements for the things worth interrupting for: tuning, pausing and
 * each new track. Voice clips are left to the visible readout (talk stations change clip
 * every few seconds), and captions are never announced (they'd never stop).
 */
export function Announcer() {
  const station = useStation();
  const status = useStatus();
  const segment = useOnAir();

  let message = '';
  if (status === 'tuning') message = `Tuning to ${station.name}, ${station.frequency.toFixed(1)}.`;
  else if (status === 'paused') message = 'Paused.';
  else if (status === 'playing' && segment?.kind === 'track') {
    const label = segmentLabel(segment, station);
    message = `${station.name}. Now playing ${label.title}, by ${label.byline}.`;
  } else if (status === 'playing') message = `${station.name}, on air.`;

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

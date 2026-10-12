import { useRef } from 'react';
import { segmentLabel } from '../ui/format';
import { useOnAir, useStation, useStatus } from '../ui/select';

/**
 * Screen-reader announcements for the things worth interrupting for: tuning, pausing and
 * each new track. Voice clips leave the message as it was (talk stations change clip
 * every few seconds; the readout has the details), and captions are never announced.
 */
export function Announcer() {
  const station = useStation();
  const status = useStatus();
  const segment = useOnAir();
  // What to keep saying (i.e. not re-announce) while voice clips come and go.
  const held = useRef('');

  let message: string;
  if (status === 'tuning') {
    message = `Tuning to ${station.name}, ${station.frequency.toFixed(1)}.`;
    held.current = `${station.name}, on air.`;
  } else if (status === 'paused') message = 'Paused.';
  else if (status === 'playing' && segment?.kind === 'track') {
    const label = segmentLabel(segment, station);
    message = held.current = `${station.name}. Now playing ${label.title}, by ${label.byline}.`;
  } else if (status === 'playing') message = held.current || `${station.name}, on air.`;
  else message = '';

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

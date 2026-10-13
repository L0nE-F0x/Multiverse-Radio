import { useBroadcast } from '../broadcast/store';
import type { EventId } from '../broadcast/types';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../ui/format';

/** What the console reports for each multiverse-wide event. Plain, procedural, unbothered. */
const EVENT_NOTICE: Record<EventId, string> = {
  'dimensional-storm': 'Static squalls across all bands. Hold frequency.',
  'emergency-broadcast': 'Emergency Multiverse Broadcast System active. Stand by.',
  'the-hum': 'Low-frequency hum on all channels. No action required.',
  'station-swap': 'Host assignments inconsistent across the band. Logged.',
  'signal-from-beyond': 'Unidentified transmission on every frequency. Do not reply.',
  'time-slip': 'Chronometry fault. The last minute may repeat.',
  convergence: 'All stations reporting the same anomaly. Cross-referencing.',
};

/** Shown on every station while a multiverse-wide event is in progress. */
export function EventBanner({ live }: { live: boolean }) {
  const event = useBroadcast((s) => s.event);
  const now = useNow(1000, live && !!event);
  if (!event) return null;
  const elapsed = Math.max(0, now - event.startMs);
  const remaining = Math.max(0, event.startMs + event.durationMs - now);

  return (
    <div className="event-banner" role="status" data-event={event.id}>
      <span className="event-flag" aria-hidden>
        <span className="event-lamp" />
        Multiverse event
      </span>
      <span className="event-name">{event.name}</span>
      <span className="event-notice">{EVENT_NOTICE[event.id] ?? 'All frequencies affected.'}</span>
      <span className="event-clock tabular" aria-hidden>
        T+{formatElapsed(elapsed)}
        <span className="event-remaining"> · {formatElapsed(remaining)} left</span>
      </span>
    </div>
  );
}

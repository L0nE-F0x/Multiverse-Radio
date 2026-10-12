import { useBroadcast } from '../broadcast/store';
import { useNow } from '../hooks/useNow';
import { SHIP } from '../stations/ship';
import { formatClock, formatElapsed } from '../ui/format';
import { useStatus, useTuned } from '../ui/select';
import { useUi } from '../ui/store';
import { linkStatus, SignalMeter } from './SignalMeter';

/**
 * The top line of the console: hull designation, vessel time, link quality, the show on
 * air, the length of the shift and what HUSH is up to.
 */
export function StatusBar({ live }: { live: boolean }) {
  const status = useStatus();
  const tuned = useTuned();
  const signal = useBroadcast((s) => s.signal);
  const show = useBroadcast((s) => s.show?.name ?? null);
  const hushSpeaking = useBroadcast((s) => s.caption?.speaker === SHIP.computer.name);
  const shiftStart = useUi((s) => s.shiftStart);
  const link = linkStatus(status, tuned.kind, signal);
  const [hull, relay] = SHIP.designation.split(' · ');

  return (
    <div className="statusbar">
      <span className="sb-designation">
        <span className="sb-mark" aria-hidden />
        <span>{hull}</span>
        {relay && <span className="sb-relay">{relay}</span>}
      </span>
      <span className="sb-field sb-time">
        <span className="sb-label">Vessel time</span>
        <Clock live={live} />
      </span>
      <span className="sb-field sb-link" data-tone={link.tone}>
        <span className="sb-label">Link</span>
        <SignalMeter signal={signal} lit={status === 'playing' && tuned.kind !== 'static'} bars={5} />
        <span className="sb-value">{link.code}</span>
      </span>
      <span className="sb-field sb-show">
        <span className="sb-label">On air</span>
        <span className="sb-value truncate">{show ?? (tuned.kind === 'static' ? '—' : 'Continuous programming')}</span>
      </span>
      <span className="sb-spacer" />
      <span className="sb-field sb-shift">
        <span className="sb-label">Shift</span>
        <ShiftClock start={shiftStart} live={live} />
      </span>
      <span className="sb-field sb-hush" data-speaking={hushSpeaking}>
        <span className="sb-lamp" aria-hidden />
        <span className="sb-label">{SHIP.computer.name}</span>
        <span className="sb-value">{hushSpeaking ? 'Speaking' : status === 'off' ? 'Asleep' : 'Listening'}</span>
      </span>
    </div>
  );
}

function Clock({ live }: { live: boolean }) {
  const now = useNow(1000, live);
  return (
    <time className="sb-value tabular" dateTime={new Date(now).toISOString()}>
      {formatClock(now)}
    </time>
  );
}

function ShiftClock({ start, live }: { start: number | null; live: boolean }) {
  const now = useNow(1000, live && start !== null);
  return <span className="sb-value tabular">{start === null ? '--:--' : formatElapsed(now - start)}</span>;
}

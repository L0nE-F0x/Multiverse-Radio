import { useBroadcast } from '../broadcast/store';
import { SHIP } from '../stations/ship';
import * as act from '../ui/actions';
import { useStatus } from '../ui/select';

/** The cold console (before power-on) and the lost-signal prompt, centred in the viewport. */
export function PowerOverlay() {
  const status = useStatus();
  const message = useBroadcast((s) => s.signalMessage);
  if (status !== 'off' && status !== 'lost') return null;
  const lost = status === 'lost';

  return (
    <div className="power" data-keep-awake="" data-state={status} role={lost ? 'alert' : undefined}>
      <div className="power-card">
        <p className="power-kicker">
          <span>{SHIP.designation}</span>
        </p>
        <p className="power-title">{lost ? 'No carrier' : 'Multiverse Radio'}</p>
        <p className="power-sub">
          {lost ? (message ?? 'Nothing usable is coming through. The relay is retrying.') : 'Intercept console · Receiver cold'}
        </p>
        <button type="button" className="power-button" onClick={act.togglePlay}>
          <span className="power-glyph" aria-hidden />
          <span>{lost ? 'Retry link' : 'Power on'}</span>
        </button>
        {!lost && (
          <p className="power-hint hint-kbd">
            <span className="hint-key">Space</span> begins the night shift
          </p>
        )}
      </div>
    </div>
  );
}

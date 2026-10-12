import { useMemo } from 'react';
import { listenerMessage } from '../content';
import { useBucket } from '../hooks/useRotatingSeed';
import { hash } from '../ui/format';
import { useStation, useStatus } from '../ui/select';

const PERIOD = 50_000;
const SHOWN = 3;

/**
 * Text-ins from listeners across the multiverse, curling out of a thermal printer.
 * A new one arrives every 50 seconds while the station is on air; the history is
 * derived from the clock, so there's nothing to store.
 */
export function ListenerLine() {
  const station = useStation();
  const status = useStatus();
  const bucket = useBucket(PERIOD, status === 'playing');

  const messages = useMemo(
    () =>
      Array.from({ length: SHOWN }, (_, k) => {
        const seed = hash(`listener:${station.id}:${bucket - k}`);
        return { seed, ...listenerMessage(station, seed) };
      }),
    [station, bucket],
  );

  return (
    <section className="fax" aria-labelledby="listener-heading">
      <div className="fax-machine">
        <h2 id="listener-heading" className="fax-title">
          Listener line
        </h2>
        <span className="fax-led" data-on={status === 'playing'} aria-hidden />
        <span className="fax-slot" aria-hidden />
      </div>
      <ol className="fax-paper">
        {messages.map((message, i) => (
          <li key={message.seed} className={i === 0 ? 'fax-message fax-new' : 'fax-message'}>
            <p className="fax-from">
              <span>From:</span> {message.from}
              {message.where && (
                <>
                  {' '}
                  <span className="fax-where">({message.where})</span>
                </>
              )}
            </p>
            <p className="fax-text">{message.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

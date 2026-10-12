import type { CSSProperties } from 'react';
import { useNow } from '../hooks/useNow';
import { daypart } from '../ui/format';
import { useStation } from '../ui/select';
import { Portrait } from './Portrait';

const GREETING = {
  morning: 'Your host this morning',
  afternoon: 'Your host this afternoon',
  evening: 'Your host this evening',
  night: 'Keeping you company tonight',
} as const;

/** The on-air talent's laminated staff badge, clipped to a lanyard. */
export function HostCard() {
  const station = useStation();
  const now = useNow(10 * 60_000);
  const { host, cast = [] } = station;

  return (
    <section className="host-card" aria-labelledby="host-heading" style={{ '--ch': station.color } as CSSProperties}>
      <span className="host-clip" aria-hidden />
      <div className="host-strip">
        <span>{station.name}</span>
        <span>Staff · Do not feed</span>
      </div>
      <div className="host-main">
        <Portrait key={host.name} name={host.name} color={station.color} className="host-photo" />
        <div className="min-w-0">
          <p className="host-greeting">{GREETING[daypart(new Date(now))]}</p>
          <h2 id="host-heading" className="host-name">
            {host.name}
          </h2>
          <p className="host-bio">{host.bio}</p>
        </div>
      </div>
      {cast.length > 0 && (
        <div className="host-cast">
          <p className="host-cast-title">Also on the air</p>
          <ul>
            {cast.map((member) => (
              <li key={member.name}>
                <Portrait name={member.name} color={station.color} className="host-cast-photo" />
                <p>
                  <strong>{member.name}</strong> {member.bio}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="host-barcode" aria-hidden>
        ▌▍▋▌▎▍▌▋▍▎▌▍▋▎▌▍
      </p>
    </section>
  );
}

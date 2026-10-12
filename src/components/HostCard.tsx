import { useEffect, useRef, type CSSProperties } from 'react';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { useNow } from '../hooks/useNow';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { daypart } from '../ui/format';
import { useStation, useStatus } from '../ui/select';
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
  const photoRef = useRef<HTMLDivElement>(null);
  useBlink(photoRef, useStatus() === 'playing');

  return (
    <section className="host-card" aria-labelledby="host-heading" style={{ '--ch': station.color } as CSSProperties}>
      <span className="host-clip" aria-hidden />
      <div className="host-strip">
        <span>{station.name}</span>
        <span>Staff · Do not feed</span>
      </div>
      <div className="host-main">
        <div ref={photoRef} className="host-photo">
          <Portrait key={host.name} name={host.name} color={station.color} className="h-full w-full" />
        </div>
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

/** The host blinks now and then while on air: a class flipped by a timer, not an endless animation. */
function useBlink(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    const element = ref.current;
    if (!element || !active || !visible || reducedMotion) return;
    let open: ReturnType<typeof setTimeout>;
    const blink = () => {
      element.dataset.blink = 'true';
      open = setTimeout(() => (element.dataset.blink = 'false'), 140);
    };
    const timer = setInterval(blink, 5200 + Math.random() * 2400);
    return () => {
      clearInterval(timer);
      clearTimeout(open);
      element.dataset.blink = 'false';
    };
  }, [ref, active, visible, reducedMotion]);
}

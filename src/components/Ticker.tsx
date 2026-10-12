import { useMemo, type CSSProperties } from 'react';
import { tickerLines } from '../content';
import { useNow } from '../hooks/useNow';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useRotatingSeed } from '../hooks/useRotatingSeed';
import { useStation, useStatus } from '../ui/select';

/**
 * The LED crawl along the bottom of the cabinet. New headlines every ten minutes; the
 * crawl speed follows the text length so long and short lines read at the same pace.
 * With reduced motion it shows one headline at a time instead of crawling.
 */
export function Ticker() {
  const station = useStation();
  const status = useStatus();
  const reducedMotion = usePrefersReducedMotion();
  const live = status === 'playing';
  const seed = useRotatingSeed(`ticker:${station.id}`, 10 * 60_000, live);
  const lines = useMemo(() => tickerLines(station, seed, 6).filter(Boolean), [station, seed]);
  const text = lines.join('   ✦   ');
  const powered = status !== 'off';

  return (
    <div className="ticker" data-on={powered}>
      <span className="ticker-tag">{live ? 'Bulletin' : powered ? 'Standby' : 'Off'}</span>
      <div className="ticker-window">
        <ul className="sr-only" aria-label={`${station.name} headlines`}>
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {!powered ? (
          <p className="ticker-static" aria-hidden>
            · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
          </p>
        ) : reducedMotion ? (
          <StillTicker lines={lines} live={live} />
        ) : (
          <div
            key={text}
            className="ticker-track"
            aria-hidden
            style={
              {
                animationDuration: `${Math.max(24, text.length * 0.2)}s`,
                animationPlayState: live ? 'running' : 'paused',
              } as CSSProperties
            }
          >
            <span>{text}   ✦   </span>
            <span>{text}   ✦   </span>
          </div>
        )}
      </div>
    </div>
  );
}

function StillTicker({ lines, live }: { lines: string[]; live: boolean }) {
  const now = useNow(8000, live);
  const line = lines[Math.floor(now / 8000) % Math.max(1, lines.length)] ?? '';
  return (
    <p className="ticker-still" aria-hidden>
      {line}
    </p>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { tickerLines } from '../content';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { useNow } from '../hooks/useNow';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useRotatingSeed } from '../hooks/useRotatingSeed';
import { onFrame } from '../ui/frameloop';
import { useStation, useStatus } from '../ui/select';
import { useUi } from '../ui/store';

/** Crawl speed in px per second: steady, so long and short headlines read at the same pace. */
const SPEED = 62;

/**
 * The LED crawl along the bottom of the cabinet, with new headlines every ten minutes.
 * It moves in whole pixels on the shared 30 fps loop (cheaper than a CSS animation, and
 * more like real LEDs), only while on air and on screen. With reduced motion it shows
 * one headline at a time instead.
 */
export function Ticker() {
  const station = useStation();
  const status = useStatus();
  const reducedMotion = usePrefersReducedMotion();
  const visible = useDocumentVisible();
  const ambient = useUi((s) => s.ambient);
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
          <Crawl key={text} text={text} running={live && visible && !ambient} />
        )}
      </div>
    </div>
  );
}

function Crawl({ text, running }: { text: string; running: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offset = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!running || !track) return;
    let last = performance.now();
    // One copy's width; measured up front (and again once webfonts settle), not per frame.
    let loop = track.scrollWidth / 2;
    void document.fonts?.ready.then(() => (loop = track.scrollWidth / 2));
    return onFrame((now) => {
      offset.current = loop > 0 ? (offset.current + ((now - last) * SPEED) / 1000) % loop : 0;
      last = now;
      track.style.transform = `translate3d(${-Math.round(offset.current)}px, 0, 0)`;
    });
  }, [running]);

  return (
    <div ref={trackRef} className="ticker-track" aria-hidden>
      <span>{text}   ✦   </span>
      <span>{text}   ✦   </span>
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

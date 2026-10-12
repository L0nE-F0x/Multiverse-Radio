import { useEffect, useMemo, useState } from 'react';
import { useBroadcast } from '../broadcast/store';
import { receptionReport } from '../content';
import { useRotatingSeed } from '../hooks/useRotatingSeed';
import { useStationId, useStatus } from '../ui/select';
import { useUi } from '../ui/store';

/** The chrome nameplate riveted to the cabinet's top rail. */
export function Badge() {
  return (
    <div className="badge">
      <p className="badge-maker">Gloaming &amp; Daughters</p>
      <p className="badge-script">Yondertone</p>
      <p className="badge-model">
        Model YT-22 · Omniband<span className="badge-motto"> · Picks up everything. Puts most of it back.</span>
      </p>
    </div>
  );
}

export function OnAirSign() {
  const status = useStatus();
  return (
    <span className="on-air-sign" data-on={status === 'playing'} data-blink={status === 'tuning'} aria-hidden>
      On air
    </span>
  );
}

/**
 * An analog meter that reads the (procedural, deeply unscientific) reception report.
 * Smacking the cabinet or wiggling the antenna boosts it for a while.
 */
export function ReceptionMeter() {
  const stationId = useStationId();
  const status = useStatus();
  const signalMessage = useBroadcast((s) => s.signalMessage);
  const nonce = useUi((s) => s.receptionNonce);
  const boostUntil = useUi((s) => s.boostUntil);
  const live = status === 'playing';
  const seed = useRotatingSeed(`reception:${stationId}:${nonce}`, 30_000, live);
  const report = useMemo(() => receptionReport(seed), [seed]);
  const [boosted, setBoosted] = useState(false);

  useEffect(() => {
    const left = boostUntil - Date.now();
    setBoosted(left > 0);
    if (left <= 0) return;
    const timer = setTimeout(() => setBoosted(false), left);
    return () => clearTimeout(timer);
  }, [boostUntil]);

  const parsed = /(\d{1,3})\s*%/.exec(report);
  const base = parsed ? Math.min(100, Number(parsed[1])) : 35 + (seed % 60);
  const value =
    status === 'off' ? 0 : status === 'lost' ? 4 : status === 'tuning' ? 20 : Math.min(99, base + (boosted ? 18 : 0));
  const text =
    status === 'off'
      ? 'Off. Reception is excellent at receiving nothing.'
      : status === 'tuning'
        ? 'Searching the static…'
        : status === 'lost'
          ? (signalMessage ?? 'Nothing. Not even a moth.')
          : boosted
            ? `${report} (Boosted, briefly.)`
            : report;
  const angle = -58 + (value / 100) * 116;

  return (
    <div
      className="meter"
      role="meter"
      aria-label="Reception"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={text}
      data-status={status}
    >
      <svg viewBox="0 0 120 68" className="meter-dial" aria-hidden>
        <path d="M14 60a46 46 0 0 1 92 0" fill="none" stroke="rgb(40 25 15 / 0.25)" strokeWidth="9" />
        <path d="M14 60a46 46 0 0 1 22-39" fill="none" stroke="#d2553a" strokeWidth="5" strokeOpacity="0.8" />
        <path d="M84 21a46 46 0 0 1 22 39" fill="none" stroke="#4f9a5a" strokeWidth="5" strokeOpacity="0.8" />
        {Array.from({ length: 11 }, (_, i) => {
          const a = ((-58 + i * 11.6) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={60 + Math.sin(a) * 38}
              y1={60 - Math.cos(a) * 38}
              x2={60 + Math.sin(a) * (i % 5 === 0 ? 30 : 33)}
              y2={60 - Math.cos(a) * (i % 5 === 0 ? 30 : 33)}
              stroke="#2b1d14"
              strokeWidth={i % 5 === 0 ? 1.8 : 1}
            />
          );
        })}
        <text x="60" y="44" textAnchor="middle" className="meter-word">
          signal
        </text>
        <g className="meter-needle" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="60" y1="62" x2="60" y2="16" stroke="#b3261e" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <circle cx="60" cy="61" r="4.5" fill="#2b1d14" />
      </svg>
      <p className="meter-text">{text}</p>
    </div>
  );
}

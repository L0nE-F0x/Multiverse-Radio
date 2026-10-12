import type { PlayStatus, Tuned } from '../broadcast/types';

export type LinkTone = 'ok' | 'warn' | 'bad' | 'idle';

/** What the link indicator says about reception right now. */
export function linkStatus(status: PlayStatus, tuned: Tuned['kind'], signal: number): { code: string; tone: LinkTone } {
  switch (status) {
    case 'off':
      return { code: 'Standby', tone: 'idle' };
    case 'tuning':
      return { code: 'Acquiring', tone: 'warn' };
    case 'lost':
      return { code: 'Lost', tone: 'bad' };
    case 'paused':
      return { code: 'Hold', tone: 'idle' };
    default:
      if (tuned === 'static') return { code: 'No carrier', tone: 'bad' };
      if (signal >= 0.85) return { code: 'Locked', tone: 'ok' };
      if (signal >= 0.45) return { code: 'Weak', tone: 'warn' };
      return { code: 'Faint', tone: 'bad' };
  }
}

/** Segmented signal-strength bars. Decorative: callers say the value in words. */
export function SignalMeter({ signal, bars = 6, lit = true, className = '' }: { signal: number; bars?: number; lit?: boolean; className?: string }) {
  const on = lit ? Math.round(Math.max(0, Math.min(1, signal)) * bars) : 0;
  return (
    <span className={`meter ${className}`} aria-hidden data-bars={bars}>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} data-on={i < on} style={{ height: `${30 + (70 * (i + 1)) / bars}%` }} />
      ))}
    </span>
  );
}

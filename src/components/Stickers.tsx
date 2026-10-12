import { useState } from 'react';
import * as act from '../ui/actions';
import { useUi } from '../ui/store';

/** A warranty sticker that peels when you pick at it, and sticks back down if you feel bad. */
export function WarrantySticker() {
  const [peeled, setPeeled] = useState(false);
  return (
    <div className="warranty" data-peeled={peeled}>
      <p className="warranty-under" aria-hidden={!peeled}>
        …or in that one.
        <br />
        <span>— Mgmt.</span>
      </p>
      <button
        type="button"
        className="warranty-sticker"
        aria-pressed={peeled}
        aria-label={peeled ? 'Stick the warranty sticker back down' : 'Peel the warranty sticker'}
        onClick={() => setPeeled((value) => !value)}
      >
        <span className="warranty-big">Warranty void</span>
        <span className="warranty-small">in this universe</span>
      </button>
    </div>
  );
}

/** The worn patch everybody hits when the picture goes fuzzy. */
export function SmackZone() {
  const smacks = useUi((s) => s.smacks);
  return (
    <button type="button" className="smack" onClick={act.smack} aria-label="Smack the radio to fix the reception">
      <span className="smack-note">
        Hit here
        <br />
        if fuzzy
      </span>
      <svg className="smack-arrow" viewBox="0 0 60 40" aria-hidden>
        <path d="M4 6c14 0 30 6 38 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 25l10 6 3-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="smack-spot" aria-hidden />
      {smacks > 0 && (
        <span className="smack-count" aria-hidden>
          {'|'.repeat(Math.min(smacks, 12))}
          {smacks > 12 ? '+' : ''}
        </span>
      )}
    </button>
  );
}

/** Masking tape somebody wrote on. It is load-bearing advice. */
export function TapeNote({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`tape ${className}`} aria-hidden>
      {children}
    </p>
  );
}

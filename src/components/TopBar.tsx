import * as act from '../ui/actions';
import { useUi } from '../ui/store';
import { AmbientIcon, GuideIcon, HelpIcon } from './Icons';

export function TopBar() {
  return (
    <header className="topbar">
      <div className="wordmark">
        <Logo />
        <div className="min-w-0">
          <h1 className="wordmark-title">Multiverse Radio</h1>
          <p className="wordmark-sub">Live from elsewhere · 24 hours a day, in most days</p>
        </div>
      </div>
      <nav className="topbar-actions" aria-label="Receiver">
        <button
          type="button"
          className="topbar-button"
          onClick={() => useUi.setState({ guideOpen: true })}
          aria-keyshortcuts="G"
        >
          <GuideIcon className="h-[18px] w-[18px]" />
          <span className="topbar-label">Channel guide</span>
        </button>
        <button
          id="ambient-toggle"
          type="button"
          className="topbar-button"
          onClick={act.toggleAmbient}
          aria-keyshortcuts="F"
        >
          <AmbientIcon className="h-[18px] w-[18px]" />
          <span className="topbar-label">Leave it on</span>
        </button>
        <button
          type="button"
          className="topbar-button topbar-help"
          onClick={() => useUi.setState({ helpOpen: true })}
          aria-label="Owner's manual and keyboard shortcuts"
          aria-keyshortcuts="Shift+?"
        >
          <HelpIcon className="h-[18px] w-[18px]" />
        </button>
      </nav>
    </header>
  );
}

/** The planet with a face and an antenna (same as the favicon). */
function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="wordmark-logo" aria-hidden>
      <path d="M37 22.5 47 6" stroke="#e8dcc4" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="48" cy="5.5" r="3.5" fill="var(--accent)" />
      <ellipse cx="32" cy="37" rx="27" ry="8.5" fill="none" stroke="#5a3a28" strokeWidth="5" transform="rotate(-18 32 37)" />
      <circle cx="32" cy="37" r="16" fill="var(--accent)" stroke="#2a170d" strokeWidth="2.5" />
      <circle cx="26.5" cy="32" r="3.6" fill="#fff" stroke="#2a170d" strokeWidth="1.6" />
      <circle cx="37.5" cy="32" r="3.6" fill="#fff" stroke="#2a170d" strokeWidth="1.6" />
      <circle cx="27.2" cy="33.4" r="1.7" fill="#2a170d" />
      <circle cx="38.2" cy="33.4" r="1.7" fill="#2a170d" />
      <path d="M27.5 38.5q4.5 3.5 9 0" fill="none" stroke="#2a170d" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.3 45.3A27 8.5 -18 0 0 57.7 28.7" fill="none" stroke="#ffd23f" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

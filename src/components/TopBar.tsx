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

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="wordmark-logo" aria-hidden>
      <circle cx="20" cy="22" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <ellipse cx="20" cy="22" rx="19" ry="6" fill="none" stroke="var(--accent)" strokeWidth="2.2" transform="rotate(-18 20 22)" />
      <circle cx="20" cy="22" r="4" fill="var(--accent)" />
      <path d="M26 9l6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32.5" cy="2.5" r="2" fill="var(--accent)" />
    </svg>
  );
}

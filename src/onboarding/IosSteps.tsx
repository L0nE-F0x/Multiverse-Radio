// Illustrated Add to Home Screen steps for iOS (Safari, and Chrome/Firefox/Edge since 16.4).
// The pictures are decorative; the text carries the instructions.

import { iosBrowser, type IosBrowser } from './platform';

const SHARE_WHERE: Record<IosBrowser, string> = {
  safari: "In Safari's toolbar. On newer iOS it's behind the ••• button.",
  chrome: "In Chrome's address bar, on the right.",
  edge: "In Edge's ••• menu.",
  firefox: "In Firefox's menu.",
  other: "In the toolbar, or the browser's menu.",
};

export function IosSteps() {
  const browser = iosBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return (
    <ol className="nj-steps" data-testid="ios-install-steps">
      <li className="nj-step">
        <span className="nj-step__n" aria-hidden>
          01
        </span>
        <ToolbarArt />
        <div>
          <p className="nj-step__do">
            Tap Share <ShareGlyph />
          </p>
          <p className="nj-step__note">{SHARE_WHERE[browser]}</p>
        </div>
      </li>
      <li className="nj-step">
        <span className="nj-step__n" aria-hidden>
          02
        </span>
        <SheetArt />
        <div>
          <p className="nj-step__do">
            Choose Add to Home Screen <AddGlyph />
          </p>
          <p className="nj-step__note">Scroll down the list if it's hiding.</p>
        </div>
      </li>
      <li className="nj-step">
        <span className="nj-step__n" aria-hidden>
          03
        </span>
        <ConfirmArt />
        <div>
          <p className="nj-step__do">Tap Add</p>
          <p className="nj-step__note">Top right. If there's an Open as Web App switch, leave it on.</p>
        </div>
      </li>
    </ol>
  );
}

/** The iOS share icon: a tray with an arrow leaving it. */
export function ShareGlyph() {
  return (
    <svg className="nj-glyph" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M12 3.5v11M8 7.5l4-4 4 4M8.5 10.5h-2v10h11v-10h-2" />
    </svg>
  );
}

function AddGlyph() {
  return (
    <svg className="nj-glyph" viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/** Step 1: a phone's bottom toolbar, the share button lit. */
function ToolbarArt() {
  return (
    <svg className="nj-art" viewBox="0 0 76 52" aria-hidden focusable="false">
      <rect className="nj-art__frame" x="1" y="1" width="74" height="50" rx="5" />
      <path className="nj-art__faint" d="M9 10h44M9 16h56M9 22h34M9 28h48" />
      <path className="nj-art__dim" d="M1 34.5h74" />
      <path className="nj-art__dim" d="M12.5 39.5L9 43l3.5 3.5M22.5 39.5L26 43l-3.5 3.5M49.5 39.5h6v7h-6zM63 41.5h5v5h-5zM65.5 39.5h5v5" />
      <circle className="nj-art__ring" cx="38" cy="42.8" r="7.6" />
      <path className="nj-art__hi" d="M38 45V36.6M35.4 39l2.6-2.6 2.6 2.6M35.6 41.2h-1.4v7h7.6v-7h-1.4" />
    </svg>
  );
}

/** Step 2: the share sheet, "Add to Home Screen" lit. */
function SheetArt() {
  return (
    <svg className="nj-art" viewBox="0 0 76 52" aria-hidden focusable="false">
      <rect className="nj-art__frame" x="1" y="1" width="74" height="50" rx="5" />
      <path className="nj-art__dim" d="M10 10.5h30" />
      <rect className="nj-art__dim" x="58" y="7" width="7" height="7" rx="1.5" />
      <rect className="nj-art__band" x="6" y="18" width="64" height="13" rx="2" />
      <path className="nj-art__hi" d="M10 24.5h34" />
      <rect className="nj-art__hi" x="56.5" y="20.5" width="8" height="8" rx="2" />
      <path className="nj-art__hi" d="M60.5 22.6v3.8M58.6 24.5h3.8" />
      <path className="nj-art__dim" d="M10 38.5h26" />
      <rect className="nj-art__dim" x="58" y="35" width="7" height="7" rx="1.5" />
      <path className="nj-art__faint" d="M10 46.5h20" />
    </svg>
  );
}

/** Step 3: the Add to Home Screen sheet, "Add" lit, the web-app switch on. */
function ConfirmArt() {
  return (
    <svg className="nj-art" viewBox="0 0 76 52" aria-hidden focusable="false">
      <rect className="nj-art__frame" x="1" y="1" width="74" height="50" rx="5" />
      <path className="nj-art__faint" d="M7 9.5h11M27 9.5h18" />
      <rect className="nj-art__ring" x="51.5" y="3.5" width="20" height="12" rx="6" />
      <text className="nj-art__text" x="61.5" y="12.4" textAnchor="middle">
        Add
      </text>
      <path className="nj-art__dim" d="M1 18.5h74" />
      <rect className="nj-art__hi" x="8" y="23" width="12" height="12" rx="3" />
      <path className="nj-art__moon" d="M15.6 25.8a3.6 3.6 0 1 0 1.6 6.4 3 3 0 0 1-1.6-6.4z" />
      <path className="nj-art__dim" d="M26 26.5h28M26 32h18" />
      <path className="nj-art__faint" d="M8 44.5h28" />
      <rect className="nj-art__band" x="54" y="40.5" width="13" height="8" rx="4" />
      <circle className="nj-art__dot" cx="62.9" cy="44.5" r="2.6" />
    </svg>
  );
}

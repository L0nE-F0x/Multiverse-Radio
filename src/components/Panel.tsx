import { useEffect, useRef, type ReactNode } from 'react';
import { useLayout } from '../hooks/useLayout';
import { openPanel, type PanelId } from '../ui/store';

/**
 * A console panel on the native modal <dialog>: focus trapping, Esc and the top layer for
 * free. Mounted only while open; returns focus to wherever it came from when it goes.
 *
 * The head (with its close key) stays put while the body scrolls. On phones a bar pinned to
 * the bottom repeats Close (and carries `footer`, e.g. the guide's search) within reach of a
 * thumb.
 */
export function Panel({
  id,
  kicker,
  title,
  aside,
  footer,
  children,
}: {
  id: PanelId;
  kicker: string;
  title: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => openPanel(null);
  const phone = useLayout() === 'drawer';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const target = dialog.querySelector<HTMLElement>('[data-autofocus="true"]');
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center' });
    }
    return () => {
      if (dialog.open) dialog.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      id={id}
      className={`panel panel-${id}`}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="panel-frame" data-keep-awake="">
        <header className="panel-head">
          <div className="panel-heading">
            <p className="panel-kicker">{kicker}</p>
            <h2 id={`${id}-title`} className="panel-title">
              {title}
            </h2>
          </div>
          {aside}
          <button type="button" className="panel-close" onClick={close} aria-label={`Close ${title}`}>
            {/* Keyboards get the key to press; touch screens a word. */}
            <span className="hint-kbd" aria-hidden>
              Esc
            </span>
            <span className="hint-touch" aria-hidden>
              Close
            </span>
          </button>
        </header>
        <div className="panel-body">{children}</div>
        {phone && (
          <footer className="panel-foot">
            {footer}
            <button type="button" className="panel-foot-close" onClick={close}>
              Close
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}

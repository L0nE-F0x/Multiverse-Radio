import { useEffect, useRef, type ReactNode } from 'react';
import { openPanel, type PanelId } from '../ui/store';

/**
 * A console panel on the native modal <dialog>: focus trapping, Esc and the top layer for
 * free. Mounted only while open; returns focus to wherever it came from when it goes.
 */
export function Panel({ id, kicker, title, aside, children }: { id: PanelId; kicker: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => openPanel(null);

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
            <span aria-hidden>Esc</span>
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </dialog>
  );
}

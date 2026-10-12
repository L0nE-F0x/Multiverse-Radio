// A modal "terminal" card on the native <dialog>: the top layer, inert page and Esc come
// free with showModal(); this adds a strict Tab trap, initial focus and focus return.
// The parent unmounts it to close.

import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface TerminalDialogProps {
  testId: string;
  labelledBy: string;
  describedBy?: string;
  /** Esc, or the browser closing the dialog itself. */
  onDismiss: () => void;
  className?: string;
  children: ReactNode;
}

export function TerminalDialog({ testId, labelledBy, describedBy, onDismiss, className = '', children }: TerminalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  // Where focus was before we opened (read during the first render, before showModal moves it).
  const returnTo = useRef<Element | null | undefined>(undefined);
  if (returnTo.current === undefined) returnTo.current = typeof document === 'undefined' ? null : document.activeElement;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', ''); // not connected yet, or an ancient browser: still show it
      }
    }
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    return () => {
      const target = returnTo.current;
      if (target instanceof HTMLElement && target !== document.body && target.isConnected && !dialog.contains(target)) {
        target.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`nj-term ${className}`}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        dismiss.current();
      }}
      // Some browsers close without a cancel event (e.g. repeated Esc); treat it the same.
      onClose={() => dismiss.current()}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || !ref.current) return;
        const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !ref.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !ref.current.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <span className="nj-term__fx" aria-hidden>
        <span className="nj-term__sweep" />
      </span>
      {children}
    </dialog>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal built on the native <dialog>: focus trapping, Esc and the top layer for free.
 * Clicking the backdrop closes it. Content renders only while open.
 */
export function Sheet({
  open,
  onClose,
  labelledBy,
  className = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Content opts in to where focus should land with data-autofocus.
      const target = dialog.querySelector<HTMLElement>('[data-autofocus="true"]');
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'center' });
      }
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

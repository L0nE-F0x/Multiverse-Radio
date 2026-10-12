import { useUi } from '../ui/store';

/** One-line system messages from the console. */
export function Toaster() {
  const toast = useUi((s) => s.toast);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toast && (
        <p key={toast.id} className="toast">
          <span className="toast-prompt" aria-hidden>
            SYS&gt;
          </span>{' '}
          {toast.text}
        </p>
      )}
    </div>
  );
}

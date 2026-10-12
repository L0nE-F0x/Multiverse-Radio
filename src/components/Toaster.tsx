import { useUi } from '../ui/store';

/** Little receipts the cabinet prints when something funny happens. */
export function Toaster() {
  const toast = useUi((s) => s.toast);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toast && (
        <p key={toast.id} className="toast">
          {toast.text}
        </p>
      )}
    </div>
  );
}

// v4: "Prepare for dead space": the flight-mode packs panel (docs/V4-PLAN.md). The offline
// agent owns this file; the UI lazy-loads it and opens it from the console/drawer.

export interface OfflinePanelProps {
  open: boolean;
  onClose(): void;
}

/** TODO(v4 offline): the real panel. */
export function OfflinePanel({ open, onClose }: OfflinePanelProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Prepare for dead space" data-testid="offline-panel">
      <p>Offline packs are not available yet.</p>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export default OfflinePanel;

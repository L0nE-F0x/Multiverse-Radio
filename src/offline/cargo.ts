// The panel's state, kept outside React so a download keeps going (and its progress is still
// there) when the panel is closed and reopened.

import { useSyncExternalStore } from 'react';
import {
  downloadEntries,
  downloadPack,
  isAbort,
  offlineStatus,
  packPlans,
  packsSupported,
  removePacks,
  requestPersistence,
  type DownloadProgress,
  type OfflineStatus,
  type PackId,
  type PackPlan,
} from '../pwa/offline';

export interface CargoState {
  supported: boolean;
  status: OfflineStatus | null;
  plans: Record<PackId, PackPlan> | null;
  /** True while plans/status are being (re)read. */
  loading: boolean;
  job: { label: string; progress: DownloadProgress } | null;
  /** The last outcome, for the live region. */
  message: { tone: 'ok' | 'warn'; text: string } | null;
}

let state: CargoState = { supported: packsSupported(), status: null, plans: null, loading: false, job: null, message: null };
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<CargoState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function useCargo(): CargoState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Re-read what's stowed and what each pack would take. */
export async function refresh(): Promise<void> {
  if (!state.supported) return;
  set({ loading: true });
  try {
    const status = await offlineStatus();
    set({ status });
    const plans = await packPlans().catch(() => null);
    set({ plans, loading: false });
  } catch {
    set({ loading: false });
  }
}

async function run(label: string, work: (onProgress: (p: DownloadProgress) => void, signal: AbortSignal) => Promise<void>, done: string) {
  if (state.job) return;
  // Ask for persistent storage inside the click (some browsers want a gesture).
  void requestPersistence().catch(() => null);
  controller = new AbortController();
  set({ job: { label, progress: { doneBytes: 0, totalBytes: 0, current: null } }, message: null });
  let last = 0;
  let live = true;
  const signal = controller.signal;
  try {
    await work((progress) => {
      // Stragglers from parallel clip downloads can report after a cancel: ignore them.
      if (!live || signal.aborted) return;
      // Progress can fire per clip; a few updates a second is plenty.
      const now = performance.now();
      if (progress.current !== state.job?.progress.current || now - last > 120 || progress.doneBytes >= progress.totalBytes) {
        last = now;
        set({ job: { label, progress } });
      }
    }, signal);
    live = false;
    set({ job: null, message: { tone: 'ok', text: done } });
  } catch (error) {
    live = false;
    set({
      job: null,
      message: isAbort(error)
        ? { tone: 'warn', text: 'Stowing cancelled. Everything already aboard stays; stow again to pick up where it stopped.' }
        : { tone: 'warn', text: 'Lost the signal mid-stow. Stow again to pick up where it stopped.' },
    });
  } finally {
    controller = null;
    await refresh();
  }
}

export function stowPack(pack: PackId, label: string): Promise<void> {
  return run(label, (onProgress, signal) => downloadPack(pack, onProgress, signal), `${label} stowed. The hosts will keep talking when the signal goes.`);
}

export function refreshStale(entries: string[]): Promise<void> {
  return run('Refresh', (onProgress, signal) => downloadEntries(entries, onProgress, signal), 'Stowed stations brought up to date.');
}

export function cancel(): void {
  controller?.abort();
}

export async function remove(entries?: string[]): Promise<void> {
  if (state.job) return;
  await removePacks(entries).catch(() => {});
  set({ message: { tone: 'ok', text: entries ? 'Removed from the hold.' : 'Hold emptied. Music still plays offline; voices need the signal.' } });
  await refresh();
}

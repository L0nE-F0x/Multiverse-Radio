// v4: flight-mode packs ("Prepare for dead space"). The listener stows voice manifests and
// clips in a dedicated cache that the service worker reads before the network, so hosts keep
// talking with no signal. Music is generative and the app shell is already precached.
// See docs/V4-PLAN.md, "Offline: flight-mode packs". The offline agent implements this file;
// the UI mounts `<OfflinePanel>` from src/offline/.

/** Cache the packs live in. The service worker checks it before the network and the runtime voice cache. */
export const PACKS_CACHE = 'mvr-packs';

/**
 * essentials – the pools (HUSH, events, shared, pirates, oddities) + your 6 most-played stations
 * half       – the pools + your most-played half of the dial
 * everything – every manifest and clip
 */
export const PACK_IDS = ['essentials', 'half', 'everything'] as const;
export type PackId = (typeof PACK_IDS)[number];

export interface PackPlan {
  pack: PackId;
  /** Manifest keys (station ids and pools such as `_ship`), in download order. */
  entries: string[];
  /** Bytes still to download (already-stowed entries at the current version excluded). */
  bytes: number;
  /** Bytes the pack takes in total. */
  totalBytes: number;
}

export interface OfflineStatus {
  /** Manifest keys stowed, with the version from `/voice/_index.json` they were stowed at. */
  stowed: Record<string, string>;
  /** Stowed entries whose version has since changed on the server. */
  stale: string[];
  /** Bytes in the packs cache. */
  bytes: number;
  /** From navigator.storage.estimate(), if available. */
  quota: number | null;
  /** navigator.storage.persisted(), if available. */
  persisted: boolean | null;
}

export interface DownloadProgress {
  doneBytes: number;
  totalBytes: number;
  /** The manifest key being downloaded. */
  current: string | null;
}

/** What a pack would download right now, from `/voice/_index.json` and the listener's listening time. */
export async function packPlan(pack: PackId): Promise<PackPlan> {
  void pack;
  throw new Error('TODO(v4 offline): packPlan');
}

/** Stow a pack. Resumable: entries already stowed at the current version are skipped. */
export async function downloadPack(
  pack: PackId,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  void pack;
  void onProgress;
  void signal;
  throw new Error('TODO(v4 offline): downloadPack');
}

/** Remove the given stowed entries, or everything when called without arguments. */
export async function removePacks(entries?: string[]): Promise<void> {
  void entries;
  throw new Error('TODO(v4 offline): removePacks');
}

export async function offlineStatus(): Promise<OfflineStatus> {
  return { stowed: {}, stale: [], bytes: 0, quota: null, persisted: null };
}

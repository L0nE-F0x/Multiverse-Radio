// The dial's intended frequency.
//
// The broadcast store's `frequency` is the truth, but while the listener is turning the dial
// the console shows where they're turning *to*, and accumulates steps from there. That keeps
// fine-tuning smooth even if the engine takes a moment to settle, or snaps to a station.
// Shortly after the hand leaves the dial, the display falls back to the store.

import { create } from 'zustand';
import { useBroadcast } from '../broadcast/store';
import { snapMhz } from './dial';
import * as sfx from './sfx';

interface TuningState {
  /** Where the listener is turning to; null when the dial shows the store's frequency. */
  pending: number | null;
  /** True while a pointer holds the dial. */
  holding: boolean;
}

export const useTuning = create<TuningState>()(() => ({ pending: null, holding: false }));

const SETTLE_MS = 700;
/** The engine retunes at most this often while the dial is moving. */
const SEND_MS = 90;

let settleTimer: ReturnType<typeof setTimeout> | undefined;
let sendTimer: ReturnType<typeof setTimeout> | undefined;
let lastSent = 0;
let lastSentValue: number | null = null;

const storeFrequency = () => useBroadcast.getState().frequency;

/** The frequency the dial should show right now. */
export const dialFrequency = (): number => useTuning.getState().pending ?? storeFrequency();

function send(mhz: number): void {
  lastSent = performance.now();
  lastSentValue = mhz;
  sfx.unlock();
  useBroadcast.getState().tuneFrequency(mhz);
}

function scheduleSettle(): void {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (!useTuning.getState().holding) useTuning.setState({ pending: null });
  }, SETTLE_MS);
}

/**
 * Move the dial to `mhz` (snapped to the 0.05 grid). The engine hears about it at most every
 * SEND_MS while the dial keeps moving, and always gets the final value.
 */
export function moveDial(mhz: number, { flush = false } = {}): void {
  const next = snapMhz(mhz);
  const before = dialFrequency();
  if (Math.abs(next - before) > 1e-6) sfx.tick(0.6);
  useTuning.setState({ pending: next });
  clearTimeout(sendTimer);
  const since = performance.now() - lastSent;
  if (flush || since >= SEND_MS) {
    if (lastSentValue === null || Math.abs(lastSentValue - next) > 1e-6 || flush) send(next);
  } else {
    sendTimer = setTimeout(() => send(next), SEND_MS - since);
  }
  scheduleSettle();
}

/** Fine-tune by a delta in MHz from wherever the dial is heading. */
export function nudgeDial(deltaMhz: number): void {
  moveDial(dialFrequency() + deltaMhz);
}

export function holdDial(holding: boolean): void {
  useTuning.setState({ holding });
  if (!holding) scheduleSettle();
}

/** Something else retuned (station step, scan, guide): drop any pending dial position. */
export function resetDial(): void {
  clearTimeout(settleTimer);
  clearTimeout(sendTimer);
  lastSentValue = null;
  useTuning.setState({ pending: null });
}

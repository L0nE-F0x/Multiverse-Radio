// Console actions as the UI performs them: the broadcast store does the work. Every control
// and shortcut goes through here so the mouse, keyboard and touch all behave the same.

import { useBroadcast } from '../broadcast/store';
import type { Tuned } from '../broadcast/types';
import { shareStation, type ShareResult } from '../pwa/share';
import { snapMhz } from './dial';
import * as sfx from './sfx';
import { toast, ui, useUi } from './store';
import { resetDial } from './tuning';

const radio = () => useBroadcast.getState();

/** Retuned by something other than the dial: drop its pending position, replay the ident. */
const retuned = () => {
  resetDial();
  useUi.setState({ identNonce: ui().identNonce + 1 });
};

export function togglePlay(): void {
  sfx.unlock();
  radio().togglePlay();
}

/** Start playback if it isn't running; never pauses. For "tune in" gestures (the welcome card). */
export function powerOn(): void {
  sfx.unlock();
  const { status } = radio();
  if (status === 'off' || status === 'paused' || status === 'lost') radio().togglePlay();
}

export function tune(stationId: string): void {
  sfx.unlock();
  const r = radio();
  const centred = r.tuned.kind === 'station' && r.tuned.station.id === stationId && Math.abs(r.frequency - r.tuned.station.frequency) < 0.001;
  if (centred && r.status !== 'off') return;
  r.tune(stationId);
  retuned();
}

export function step(delta: 1 | -1): void {
  sfx.unlock();
  radio().stepStation(delta);
  retuned();
}

/** Jump straight to a frequency (a pirate from the guide or log). The dial uses ./tuning. */
export function tuneFrequency(mhz: number): void {
  sfx.unlock();
  radio().tuneFrequency(snapMhz(mhz));
  retuned();
}

export function scan(): void {
  sfx.unlock();
  radio().scan();
  retuned();
}

export function skip(): void {
  if (radio().status === 'off') {
    togglePlay();
    return;
  }
  radio().skip();
}

export function toggleMute(): void {
  radio().toggleMute();
}

export function setVolume(volume: number): void {
  radio().setVolume(volume);
}

export function nudgeVolume(delta: number): void {
  const { volume, muted } = radio();
  radio().setVolume(Math.round(((muted ? 0 : volume) + delta) * 20) / 20);
}

export function toggleCaptions(): void {
  const captions = !ui().captions;
  useUi.setState({ captions });
  toast(captions ? 'Captions on.' : 'Captions off.', 1800);
}

export function toggleHud(): void {
  const hud = ui().hud === 'hidden' ? 'auto' : 'hidden';
  useUi.setState({ hud });
}

const SHARE_MESSAGES: Record<ShareResult, string | null> = {
  shared: 'Transmission shared.',
  copied: 'Link copied to clipboard.',
  cancelled: null,
  unavailable: 'Sharing is unavailable on this terminal.',
};

/** Listed stations have share pages; secrets, pirates and oddities don't (and stay secret). */
export const shareable = (tuned: Tuned): tuned is Extract<Tuned, { kind: 'station' }> => tuned.kind === 'station' && !tuned.station.secret;

/** Share the tuned station's page (Web Share where available, else copy the link). */
export async function share(): Promise<void> {
  const { tuned } = radio();
  if (!shareable(tuned)) {
    toast('Nothing shareable on this frequency.');
    return;
  }
  const result = await shareStation(tuned.station);
  const message = SHARE_MESSAGES[result];
  if (message) toast(message);
}

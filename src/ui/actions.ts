// Receiver actions as the UI performs them: the broadcast store does the work, and the
// cabinet gets to react (jolts, needle sweeps, toasts). Every control and shortcut goes
// through here so the mouse, keyboard and ambient overlay all behave the same.

import { useBroadcast } from '../broadcast/store';
import * as sfx from './sfx';
import { emit, toast, ui, useUi } from './store';

const radio = () => useBroadcast.getState();

export const SCAN_MS = 1100;
let scanTimer: ReturnType<typeof setTimeout> | undefined;

export function togglePlay(): void {
  sfx.unlock();
  const before = radio().status;
  radio().togglePlay();
  if (before === 'off') emit('power');
}

export function tune(stationId: string): void {
  if (stationId === radio().stationId && radio().status !== 'off') return;
  radio().tune(stationId);
  emit('tune');
}

export function step(delta: 1 | -1): void {
  radio().stepStation(delta);
  emit('tune');
}

export function scan(): void {
  sfx.unlock();
  const fromId = radio().stationId;
  radio().scan();
  const targetId = radio().stationId;
  clearTimeout(scanTimer);
  useUi.setState({ scan: { at: performance.now(), targetId, fromId } });
  emit('scan');
  scanTimer = setTimeout(() => useUi.setState({ scan: null }), SCAN_MS);
}

export function skip(): void {
  if (radio().status === 'off') {
    togglePlay();
    return;
  }
  radio().skip();
  emit('skip');
}

export function toggleMute(): void {
  radio().toggleMute();
}

export function nudgeVolume(delta: number): void {
  const { volume, muted } = radio();
  radio().setVolume((muted ? 0 : volume) + delta);
}

export function toggleCaptions(): void {
  useUi.setState({ captions: !ui().captions });
}

// ── Easter eggs ──────────────────────────────────────────────────────────────

const SMACK_LINES = [
  'Percussive maintenance applied.',
  'That did something. Possibly good.',
  'Thunk. Reception improved by an amount.',
  'Dust dislodged from three separate dimensions.',
  'Ow. (The radio said that.)',
  "It's working! It was already working, but now it's working harder.",
  'The tubes glow a little brighter, out of fear.',
];

const SMACK_ESCALATION: Record<number, string> = {
  8: 'The radio would like to speak to your manager.',
  13: 'The tubes have formed a union. Smacking is now a negotiation.',
  21: 'Fine. You win. It is the best radio now. Please stop.',
};

const LOST_SMACK = 'Smacked back into the signal. This is how all repairs work.';

export function smack(): void {
  sfx.unlock();
  sfx.thump();
  navigator.vibrate?.(30);
  const smacks = ui().smacks + 1;
  useUi.setState({ smacks, boostUntil: Date.now() + 25_000, receptionNonce: ui().receptionNonce + 1 });
  emit('smack');
  if (radio().status === 'lost') {
    radio().togglePlay();
    toast(LOST_SMACK);
    return;
  }
  toast(SMACK_ESCALATION[smacks] ?? SMACK_LINES[(smacks - 1) % SMACK_LINES.length]!);
}

const WIGGLE_LINES = [
  'Antenna adjusted. A nearby dimension says thanks.',
  'You picked up a weather report meant for a teapot. Returning it.',
  'Reception improved, then got embarrassed about it.',
  'Antenna wiggled. Somewhere, a moth relocates.',
  "Better. Don't move. Don't breathe. Okay, breathe.",
];

let wiggles = 0;

export function wiggleAntenna(withToast = true): void {
  sfx.unlock();
  sfx.boing();
  wiggles++;
  useUi.setState({ boostUntil: Date.now() + 15_000, receptionNonce: ui().receptionNonce + 1 });
  emit('wiggle');
  if (withToast) toast(WIGGLE_LINES[(wiggles - 1) % WIGGLE_LINES.length]!);
}

const BOOP_LINES = ['Boop acknowledged.', 'The radio blinks at you, fondly.', 'Please do not boop the radio. (Thank you for booping the radio.)'];
let boops = 0;

export function boopEyes(): void {
  sfx.unlock();
  sfx.boop();
  emit('boop');
  toast(BOOP_LINES[boops++ % BOOP_LINES.length]!, 2600);
}

export function overtravel(direction: 1 | -1): void {
  emit('overtravel');
  toast(
    direction > 0
      ? 'Do not tune past 106.6. We are not saying why. (Geese.)'
      : 'Below 87.7 there is only the hum, and the hum is busy.',
  );
}

// ── Ambient mode ─────────────────────────────────────────────────────────────

let enteredFullscreen = false;

export function setAmbient(on: boolean): void {
  if (on === ui().ambient) return;
  useUi.setState({ ambient: on, guideOpen: false, helpOpen: false });
  const root = document.documentElement;
  if (on) {
    // Best effort: a real fullscreen if the browser allows it, otherwise just the overlay.
    if (root.requestFullscreen && !document.fullscreenElement) {
      root
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => (enteredFullscreen = true))
        .catch(() => (enteredFullscreen = false));
    }
  } else if (enteredFullscreen && document.fullscreenElement) {
    enteredFullscreen = false;
    void document.exitFullscreen().catch(() => {});
  }
}

export const toggleAmbient = () => setAmbient(!ui().ambient);

/** Leaving browser fullscreen (Esc) also leaves ambient mode. */
export function onFullscreenChange(): void {
  if (!document.fullscreenElement && enteredFullscreen) {
    enteredFullscreen = false;
    if (ui().ambient) useUi.setState({ ambient: false });
  }
}

// ── Sleep timer ──────────────────────────────────────────────────────────────

export const SLEEP_STEPS = [null, 15, 30, 60, 90] as const;

export function cycleSleep(): void {
  const { sleepEndsAt } = ui();
  const remaining = sleepEndsAt ? (sleepEndsAt - Date.now()) / 60_000 : 0;
  // Next step up from whatever is left; wraps to off.
  const next = sleepEndsAt === null ? SLEEP_STEPS[1] : (SLEEP_STEPS.slice(1).find((m) => m! > remaining + 0.5) ?? null);
  setSleep(next);
}

export function setSleep(minutes: number | null): void {
  useUi.setState({ sleepEndsAt: minutes ? Date.now() + minutes * 60_000 : null });
  toast(minutes ? `Sleep timer: lights out in ${minutes} minutes.` : 'Sleep timer off. The radio will stay up with you.', 2800);
}

export function sleepNow(): void {
  useUi.setState({ sleepEndsAt: null });
  const { status } = radio();
  if (status === 'playing' || status === 'tuning') radio().togglePlay();
  toast('Goodnight. The radio switched itself off to dream about static.', 8000);
}

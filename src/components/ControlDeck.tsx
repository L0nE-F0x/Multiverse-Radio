import type { ReactNode } from 'react';
import type { PlayStatus } from '../broadcast/types';
import { useNow } from '../hooks/useNow';
import * as act from '../ui/actions';
import { useStatus } from '../ui/select';
import { useUi } from '../ui/store';
import {
  CaptionsIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  RetryIcon,
  ScanIcon,
  SkipIcon,
  StepLeftIcon,
  StepRightIcon,
} from './Icons';
import { TuningKnob } from './TuningKnob';
import { MuteToggle, VolumeKnob } from './VolumeKnob';
import { OnAirSign, ReceptionMeter } from './Readouts';

/** Tuning and volume knobs, and the little toggles beside them. */
export function KnobPanel() {
  return (
    <div className="knob-panel">
      <div className="knob-cell">
        <TuningKnob />
        <span className="engraved-label">Tuning</span>
      </div>
      <div className="knob-cell">
        <VolumeKnob />
        <span className="engraved-label">Volume</span>
      </div>
      <div className="knob-toggles">
        <MuteToggle />
        <CaptionsToggle />
        <SleepToggle />
      </div>
    </div>
  );
}

/** Power, the piano keys, and the ON AIR lamp with the reception meter. */
export function KeyDeck() {
  return (
    <div className="key-deck">
      <PowerButton />
      <PianoKeys />
      <div className="deck-readout">
        <OnAirSign />
        <ReceptionMeter />
      </div>
    </div>
  );
}

const POWER_LABEL: Record<PlayStatus, string> = {
  off: 'Power on',
  tuning: 'Pause',
  playing: 'Pause',
  paused: 'Play',
  lost: 'Retry',
};

export function PowerButton({ compact = false }: { compact?: boolean }) {
  const status = useStatus();
  const live = status === 'playing' || status === 'tuning';
  const icon =
    status === 'off' ? (
      <PowerIcon className="power-icon" />
    ) : status === 'lost' ? (
      <RetryIcon className="power-icon" />
    ) : live ? (
      <PauseIcon className="power-icon" />
    ) : (
      <PlayIcon className="power-icon translate-x-[2px]" />
    );
  return (
    <div className="power" data-compact={compact}>
      <button
        type="button"
        className="power-button"
        data-status={status}
        onClick={act.togglePlay}
        aria-label={POWER_LABEL[status]}
        aria-keyshortcuts="Space"
      >
        {icon}
      </button>
      {!compact && <span className="engraved-label">{status === 'off' ? 'Power' : 'Play · Pause'}</span>}
    </div>
  );
}

function PianoKeys() {
  const scanning = useUi((s) => s.scan !== null);
  return (
    <div className="keys" role="group" aria-label="Station controls">
      <PianoKey label="Prev" shortcut="ArrowLeft" aria="Previous station" onClick={() => act.step(-1)}>
        <StepLeftIcon />
      </PianoKey>
      <PianoKey label="Scan" shortcut="S" aria="Scan: jump to a random station" onClick={act.scan} down={scanning}>
        <ScanIcon />
      </PianoKey>
      <PianoKey label="Skip" shortcut="N" aria="Skip to the next segment" onClick={act.skip}>
        <SkipIcon />
      </PianoKey>
      <PianoKey label="Next" shortcut="ArrowRight" aria="Next station" onClick={() => act.step(1)}>
        <StepRightIcon />
      </PianoKey>
    </div>
  );
}

function PianoKey({
  label,
  shortcut,
  aria,
  onClick,
  down = false,
  children,
}: {
  label: string;
  shortcut: string;
  aria: string;
  onClick: () => void;
  down?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="piano-key"
      data-down={down}
      onClick={onClick}
      aria-label={aria}
      aria-keyshortcuts={shortcut}
    >
      <span className="piano-key-icon">{children}</span>
      <span className="piano-key-label">{label}</span>
    </button>
  );
}

function CaptionsToggle() {
  const captions = useUi((s) => s.captions);
  return (
    <button
      type="button"
      className="mini-key"
      data-on={captions}
      aria-pressed={captions}
      aria-keyshortcuts="C"
      onClick={act.toggleCaptions}
      title="Captions (C)"
    >
      <CaptionsIcon className="h-4 w-4" />
      <span className="mini-key-label">Captions</span>
    </button>
  );
}

export function SleepToggle() {
  const endsAt = useUi((s) => s.sleepEndsAt);
  const now = useNow(15_000, endsAt !== null);
  const minutes = endsAt ? Math.max(1, Math.ceil((endsAt - now) / 60_000)) : 0;
  return (
    <button
      type="button"
      className="mini-key"
      data-on={endsAt !== null}
      onClick={act.cycleSleep}
      aria-label={endsAt ? `Sleep timer: ${minutes} minutes left. Press to change.` : 'Sleep timer: off. Press to set.'}
      title="Sleep timer"
    >
      <MoonIcon className="h-4 w-4" />
      <span className="mini-key-label tabular-nums">{endsAt ? `${minutes}m` : 'Sleep'}</span>
    </button>
  );
}

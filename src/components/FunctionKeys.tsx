import type { ReactNode } from 'react';
import { useBroadcast } from '../broadcast/store';
import { useInstall } from '../onboarding';
import { SHIP } from '../stations/ship';
import * as act from '../ui/actions';
import { useStatus, useTuned } from '../ui/select';
import { toast, togglePanel, useUi, type PanelId } from '../ui/store';

/**
 * The console's key strip. Each key prints its keyboard shortcut where an old terminal
 * would print F1, F2, …; the shortcuts are letters, so the browser keeps its own F-keys.
 */
export function FunctionKeys() {
  const status = useStatus();
  const muted = useBroadcast((s) => s.muted);
  const volume = useBroadcast((s) => s.volume);
  const tuned = useTuned();
  const panel = useUi((s) => s.panel);
  const captions = useUi((s) => s.captions);
  const install = useInstall();

  const on = status === 'playing' || status === 'tuning';
  const power = status === 'off' ? 'Power on' : status === 'lost' ? 'Retry' : on ? 'Pause' : 'Play';

  const onInstall = async () => {
    const result = await install.install();
    if (result === 'accepted') toast('Console installed.');
    else if (result === 'unavailable') toast('Installation unavailable on this terminal.');
  };

  return (
    <nav className="fkeys" aria-label="Console controls">
      <div className="fkeys-group fkeys-primary">
        <PanelKey id="guide" cap="G" label="Guide" open={panel === 'guide'} />
        <Key cap="S" label="Scan" onClick={act.scan} />
        <Key cap="␣" label={power} className="fkey-power" lamp={on} onClick={act.togglePlay} />
        <Key cap="N" label="Skip" onClick={act.skip} />
        <PanelKey id="log" cap="L" label="Log" open={panel === 'log'} />
      </div>
      <div className="fkeys-group fkeys-secondary">
        <Key cap="M" label={muted ? 'Muted' : 'Mute'} lamp={muted} pressed={muted} onClick={act.toggleMute} />
        <Volume volume={volume} muted={muted} />
        <Key cap="C" label="Captions" lamp={captions} pressed={captions} onClick={act.toggleCaptions} className="fkey-cc" />
        <Key
          cap="⇪"
          label="Share"
          onClick={() => void act.share()}
          disabled={tuned.kind !== 'station'}
          title={tuned.kind === 'station' ? `Share ${tuned.station.name}` : 'Only listed stations can be shared'}
        />
        {install.canInstall && <Key cap="⤓" label="Install" onClick={() => void onInstall()} testId="hud-install" />}
        <PanelKey id="help" cap="?" label="Manual" open={panel === 'help'} className="fkey-help" />
      </div>
      <MakersPlate />
    </nav>
  );
}

function Key({
  cap,
  label,
  onClick,
  lamp,
  pressed,
  disabled,
  className = '',
  title,
  testId,
  expanded,
  controls,
}: {
  cap: string;
  label: string;
  onClick: () => void;
  lamp?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  testId?: string;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className={`fkey ${className}`}
      onClick={onClick}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={controls ? 'dialog' : undefined}
      aria-disabled={disabled || undefined}
      data-lamp={lamp ?? undefined}
      title={title}
      data-testid={testId}
      aria-keyshortcuts={keyShortcut(cap)}
    >
      <span className="fkey-cap" aria-hidden>
        {cap}
      </span>
      <span className="fkey-label">{label}</span>
    </button>
  );
}

function PanelKey({ id, cap, label, open, className }: { id: PanelId; cap: string; label: string; open: boolean; className?: string }) {
  return <Key cap={cap} label={label} onClick={() => togglePanel(id)} expanded={open} controls={id} className={className} />;
}

const keyShortcut = (cap: string): string | undefined =>
  cap === '␣' ? 'Space' : cap === '?' ? 'Shift+?' : /^[A-Z]$/.test(cap) ? cap : undefined;

/** −, a level readout you can click or arrow-key, and +. */
function Volume({ volume, muted }: { volume: number; muted: boolean }) {
  const level = muted ? 0 : volume;
  const pct = Math.round(level * 100);
  const segments = 8;
  const lit = Math.round(level * segments);

  const onPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    act.setVolume(Math.round(((event.clientX - rect.left) / rect.width) * 20) / 20);
  };

  return (
    <div className="fkey fkey-volume" role="group" aria-label="Volume">
      <button type="button" className="vol-step" onClick={() => act.nudgeVolume(-0.1)} aria-label="Volume down" aria-keyshortcuts="-">
        −
      </button>
      <div
        className="vol-meter"
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={muted ? 'Muted' : `${pct}%`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onPointer(event);
        }}
        onPointerMove={onPointer}
        onKeyDown={(event) => {
          const dir = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
          if (!dir) return;
          event.preventDefault();
          act.nudgeVolume(dir * 0.05);
        }}
      >
        <span className="vol-label" aria-hidden>
          Vol
        </span>
        <span className="vol-pct tabular" aria-hidden>
          {muted ? 'Mute' : pct}
        </span>
        <span className="vol-bars" aria-hidden>
          {Array.from({ length: segments }, (_, i) => (
            <i key={i} data-on={i < lit} />
          ))}
        </span>
      </div>
      <button type="button" className="vol-step" onClick={() => act.nudgeVolume(0.1)} aria-label="Volume up" aria-keyshortcuts="+">
        +
      </button>
    </div>
  );
}

/** A small engraved plate: who built the receiver. */
export function MakersPlate(): ReactNode {
  return (
    <p className="plate">
      <span className="plate-maker">{SHIP.maker}</span>
      <span className="plate-model">Intercept console · Mk VII</span>
    </p>
  );
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import type { StationDef } from '../broadcast/types';
import { useCabinetEvent } from '../hooks/useCabinetEvent';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { StationScene } from '../scenes';
import * as act from '../ui/actions';
import { energy } from '../ui/energy';
import { formatFrequency, rng } from '../ui/format';
import { useStation, useStationIndex, useStations, useStatus } from '../ui/select';
import { useUi } from '../ui/store';
import { PowerIcon, RetryIcon } from './Icons';

/**
 * The porthole into the tuned dimension: the station's animated scene behind curved
 * glass, with a TV-style station bug, on-screen display, captions and the static you
 * get between stations.
 */
export function Screen() {
  const station = useStation();
  const status = useStatus();
  const ambient = useUi((s) => s.ambient);

  return (
    <div className="crt" data-status={status}>
      <div className="crt-tube">
        {/* Only one scene runs at a time: the ambient view takes it over while open. */}
        {!ambient && <SceneLayer className="crt-scene" />}
        <div className="crt-static" aria-hidden />
        <StationBug station={station} />
        <Osd />
        <Captions />
        <ScanFlourish />
        {status === 'off' && <OffOverlay />}
        {status === 'lost' && <LostOverlay />}
        <div className="crt-glass" aria-hidden />
      </div>
    </div>
  );
}

/** The tuned station's animated scene, fed with the live audio level. */
export function SceneLayer({ className }: { className: string }) {
  const station = useStation();
  const status = useStatus();
  const reducedMotion = usePrefersReducedMotion();
  const visible = useDocumentVisible();
  return (
    <StationScene
      station={station}
      playing={status === 'playing' && visible}
      energy={energy}
      reducedMotion={reducedMotion}
      className={className}
    />
  );
}

function StationBug({ station }: { station: StationDef }) {
  const status = useStatus();
  return (
    <div className="crt-bug" aria-hidden>
      <span className="crt-bug-freq">{formatFrequency(station)}</span>
      <span className="crt-bug-live" data-live={status === 'playing'}>
        {status === 'playing' ? 'LIVE' : status === 'paused' ? 'PAUSED' : status === 'tuning' ? 'TUNING' : 'OFF AIR'}
      </span>
    </div>
  );
}

/** VCR-style on-screen display: flashes CH/VOL/PLAY readouts for a moment. */
export function Osd() {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const index = useStationIndex();
  const indexRef = useRef(index);

  const show = (value: string) => {
    clearTimeout(timer.current);
    setText(value);
    timer.current = setTimeout(() => setText(null), 2200);
  };

  useEffect(() => {
    if (indexRef.current !== index) show(`CH ${String(index + 1).padStart(2, '0')}`);
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const unsubscribe = useBroadcast.subscribe((state, previous) => {
      if (state.muted !== previous.muted) show(state.muted ? 'MUTE' : volumeBar(state.volume));
      else if (state.volume !== previous.volume) show(volumeBar(state.volume));
      else if (state.status !== previous.status) {
        if (state.status === 'paused') show('❚❚ PAUSE');
        else if (state.status === 'playing' && previous.status !== 'tuning') show('▶ PLAY');
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, []);

  useCabinetEvent(['skip'], () => show('▶▶ SKIP'));

  return (
    <div className="crt-osd" aria-hidden>
      {text}
    </div>
  );
}

function volumeBar(volume: number): string {
  const filled = Math.round(volume * 12);
  return `VOL ${'█'.repeat(filled)}${'░'.repeat(12 - filled)}`;
}

/** Live captions for voice segments. Not announced: they change every few seconds. */
export function Captions() {
  const enabled = useUi((s) => s.captions);
  const speaker = useBroadcast((s) => s.caption?.speaker ?? '');
  const text = useBroadcast((s) => s.caption?.text ?? '');
  const hostName = useStation().host.name;
  if (!enabled || !text) return null;

  return (
    <div className="crt-captions" aria-hidden>
      <p key={text} className="crt-caption">
        {speaker && (
          <span className="crt-caption-speaker" data-host={speaker === hostName}>
            {speaker}
          </span>
        )}
        <span className="crt-caption-text">{text}</span>
      </p>
    </div>
  );
}

/** "Scanning the multiverse…": a slot-machine reel of station names that lands on the pick. */
export function ScanFlourish() {
  const scan = useUi((s) => s.scan);
  const stations = useStations();
  const reducedMotion = usePrefersReducedMotion();

  const reel = useMemo(() => {
    if (!scan) return [];
    const random = rng(Math.floor(scan.at * 1000));
    const pool = stations.filter((s) => s.id !== scan.targetId);
    const names = Array.from({ length: reducedMotion ? 0 : 9 }, () => pool[Math.floor(random() * pool.length)]!);
    const target = stations.find((s) => s.id === scan.targetId);
    return target ? [...names, target] : names;
  }, [scan, stations, reducedMotion]);

  if (!scan || reel.length === 0) return null;
  const target = reel[reel.length - 1]!;

  return (
    <div className="crt-scan" aria-hidden style={{ '--steps': reel.length - 1 } as CSSProperties}>
      <p className="crt-scan-label">Scanning the multiverse</p>
      <div className="crt-scan-window">
        <div className="crt-scan-reel">
          {reel.map((station, i) => (
            <span key={i} style={{ color: station.color }}>
              {station.name}
            </span>
          ))}
        </div>
      </div>
      <p className="crt-scan-found">
        Locked on · {formatFrequency(target)} MHz
      </p>
    </div>
  );
}

export function OffOverlay() {
  return (
    <div className="crt-overlay crt-overlay-off">
      <button type="button" className="power-cta" onClick={act.togglePlay} aria-label="Power on and tune in">
        <span className="power-cta-ring" aria-hidden />
        <PowerIcon className="h-9 w-9 sm:h-11 sm:w-11" />
      </button>
      <p className="crt-overlay-title">The tubes are cold</p>
      <p className="crt-overlay-hint">
        Press power to warm them up<span className="hidden [@media(hover:hover)]:inline"> · or hit Space</span>
      </p>
    </div>
  );
}

export function LostOverlay() {
  const message = useBroadcast((s) => s.signalMessage);
  return (
    <div className="crt-overlay crt-overlay-lost" role="alert">
      <p className="crt-overlay-title text-[#ff6a4d]">Signal lost</p>
      <p className="crt-overlay-hint normal-case tracking-normal">
        {message ?? 'Nothing is coming through. The dimension may be closed for cleaning.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <button type="button" className="chip-button" onClick={act.togglePlay}>
          <RetryIcon className="h-4 w-4" /> Try again
        </button>
        <button type="button" className="chip-button" onClick={act.smack}>
          Give it a smack
        </button>
      </div>
    </div>
  );
}

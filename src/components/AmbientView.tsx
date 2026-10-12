import { useEffect, useRef } from 'react';
import { useIdle } from '../hooks/useIdle';
import { useNow } from '../hooks/useNow';
import * as act from '../ui/actions';
import { formatFrequency, segmentLabel } from '../ui/format';
import { useOnAir, useStation, useStatus } from '../ui/select';
import { useUi } from '../ui/store';
import { PowerButton, SleepToggle } from './ControlDeck';
import { CaptionsIcon, ExitAmbientIcon, ScanIcon, SkipIcon, StepLeftIcon, StepRightIcon } from './Icons';
import { Captions, LostOverlay, OffOverlay, Osd, SceneLayer, ScanFlourish } from './Screen';

/**
 * "Leave it on": the station's scene fills the screen, with a whisper of an overlay
 * that fades away (cursor too) after a few seconds of stillness.
 */
export function AmbientView() {
  const ref = useRef<HTMLDivElement>(null);
  const idle = useIdle(3500);
  const station = useStation();
  const status = useStatus();
  const segment = useOnAir();
  const captions = useUi((s) => s.captions);
  const now = useNow(60_000);
  const label = segment && status !== 'off' ? segmentLabel(segment, station) : null;

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    return () => document.getElementById('ambient-toggle')?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      className="ambient"
      data-idle={idle}
      data-status={status}
      role="region"
      aria-label={`Ambient mode: ${station.name}. Press Escape or F to leave.`}
      tabIndex={-1}
    >
      <div className="ambient-stage">
        <SceneLayer className="ambient-scene" />
      </div>
      <div className="ambient-vignette" aria-hidden />
      <div className="crt-static" aria-hidden />

      <div className="ambient-top ambient-chrome">
        <div className="min-w-0">
          <p className="ambient-freq">{formatFrequency(station)} MHz</p>
          <p className="ambient-station">{station.name}</p>
          <p className="ambient-origin">{station.origin}</p>
        </div>
        <p className="ambient-clock tabular-nums" aria-hidden>
          {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="ambient-osd">
        <Osd />
      </div>
      <ScanFlourish />
      {status === 'off' && <OffOverlay />}
      {status === 'lost' && <LostOverlay />}

      <div className="ambient-captions">
        <Captions />
      </div>

      <div className="ambient-bottom ambient-chrome">
        <div className="ambient-now min-w-0">
          {label && (
            <>
              <p className="ambient-title">{label.title}</p>
              <p className="ambient-byline">{label.byline}</p>
            </>
          )}
        </div>
        <div className="ambient-controls" role="group" aria-label="Controls">
          <button type="button" className="ghost-button" onClick={() => act.step(-1)} aria-label="Previous station">
            <StepLeftIcon className="h-5 w-5" />
          </button>
          <PowerButton compact />
          <button type="button" className="ghost-button" onClick={() => act.step(1)} aria-label="Next station">
            <StepRightIcon className="h-5 w-5" />
          </button>
          <button type="button" className="ghost-button" onClick={act.scan} aria-label="Scan to a random station">
            <ScanIcon className="h-5 w-5" />
          </button>
          <button type="button" className="ghost-button" onClick={act.skip} aria-label="Skip to the next segment">
            <SkipIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={act.toggleCaptions}
            aria-pressed={captions}
            aria-label="Captions"
          >
            <CaptionsIcon className="h-5 w-5" />
          </button>
          <SleepToggle />
          <button type="button" className="ghost-button" onClick={() => act.setAmbient(false)} aria-label="Leave ambient mode">
            <ExitAmbientIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

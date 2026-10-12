import { useRef } from 'react';
import { useCabinetEvent } from '../hooks/useCabinetEvent';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import type { CabinetEvent } from '../ui/store';
import { Antenna } from './Antenna';
import { KeyDeck, KnobPanel } from './ControlDeck';
import { GooglyEyes } from './GooglyEyes';
import { NowPlaying } from './NowPlaying';
import { Badge } from './Readouts';
import { Screen } from './Screen';
import { SmackZone, TapeNote, WarrantySticker } from './Stickers';
import { Ticker } from './Ticker';
import { TuningBand } from './TuningBand';

/**
 * The Yondertone YT-22: a walnut console from a junk shop in another dimension.
 * Laid out like an old TV set: the picture tube on the left; readout, knobs and speaker
 * down the right; the dial and the piano keys underneath.
 */
export function Cabinet() {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useCabinetEvent(['scan', 'smack', 'overtravel'], (kind) => {
    if (!reducedMotion && ref.current) jolt(ref.current, kind);
  });

  return (
    <section ref={ref} className="cabinet" aria-label="Yondertone YT-22 receiver">
      <Antenna />
      <Badge />
      <div className="cab-screen">
        <Screen />
      </div>
      <div className="cab-side">
        <div className="cab-vfd">
          <NowPlaying />
        </div>
        <div className="cab-knobs">
          <KnobPanel />
        </div>
        <div className="cab-grille grille">
          <GooglyEyes />
          <WarrantySticker />
          <SmackZone />
        </div>
      </div>
      <div className="cab-band">
        <TuningBand />
        <TapeNote className="tape-band">do not tune past 106.6</TapeNote>
      </div>
      <div className="cab-keys">
        <KeyDeck />
      </div>
      <div className="cab-ticker">
        <Ticker />
      </div>
    </section>
  );
}

function jolt(element: HTMLElement, kind: CabinetEvent) {
  const frames: Keyframe[] =
    kind === 'smack'
      ? [
          { transform: 'none' },
          { transform: 'translate(3px, 2px) rotate(0.35deg)' },
          { transform: 'translate(-3px, -1px) rotate(-0.3deg)' },
          { transform: 'translate(2px, 1px) rotate(0.15deg)' },
          { transform: 'translate(-1px, 0) rotate(-0.05deg)' },
          { transform: 'none' },
        ]
      : kind === 'scan'
        ? [
            { transform: 'none' },
            { transform: 'translateY(-5px) rotate(-0.25deg)' },
            { transform: 'translateY(1px) rotate(0.2deg)' },
            { transform: 'translateY(-2px) rotate(-0.1deg)' },
            { transform: 'none' },
          ]
        : [
            { transform: 'none' },
            { transform: 'translateX(4px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(1px)' },
            { transform: 'none' },
          ];
  element.animate(frames, { duration: kind === 'scan' ? 520 : 380, easing: 'ease-out' });
}

import { useRef, type CSSProperties } from 'react';
import { useCabinetEvent } from '../hooks/useCabinetEvent';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import * as act from '../ui/actions';
import { useStationIndex, useStations, useStatus } from '../ui/select';
import type { CabinetEvent } from '../ui/store';

/**
 * Two mismatched googly eyes somebody stuck on the speaker grille. They watch the
 * tuning needle, rattle when the cabinet gets jolted, and fall asleep when it's off.
 */
export function GooglyEyes() {
  const status = useStatus();
  const index = useStationIndex();
  const count = useStations().length;
  const reducedMotion = usePrefersReducedMotion();
  const pupils = useRef<(HTMLSpanElement | null)[]>([]);
  // Look along the dial toward the needle: -1 (far left) … 1 (far right).
  const look = count > 1 ? (index / (count - 1)) * 2 - 1 : 0;

  useCabinetEvent(['scan', 'smack', 'boop', 'tune', 'skip', 'wiggle', 'overtravel', 'power'], (kind) => {
    if (reducedMotion) return;
    pupils.current.forEach((pupil, i) => pupil && rattle(pupil, kind, i));
  });

  const mood = status === 'off' ? 'asleep' : status === 'lost' ? 'dizzy' : 'awake';

  return (
    <button
      type="button"
      className="googly"
      data-mood={mood}
      onClick={act.boopEyes}
      aria-label="Boop the radio's googly eyes"
      style={{ '--look': look } as CSSProperties}
    >
      {[0, 1].map((i) => (
        <span key={i} className="googly-eye" data-eye={i}>
          <span className="googly-pupil-track">
            <span ref={(el) => void (pupils.current[i] = el)} className="googly-pupil" />
          </span>
        </span>
      ))}
      {mood === 'asleep' && (
        <span className="googly-z" aria-hidden>
          z<span>z</span>
          <span>z</span>
        </span>
      )}
    </button>
  );
}

function rattle(pupil: HTMLElement, kind: CabinetEvent, i: number) {
  const strength = kind === 'smack' || kind === 'scan' ? 1 : kind === 'boop' ? 0.8 : 0.45;
  const frames: Keyframe[] = [{ transform: 'translate(0, 0)' }];
  const steps = kind === 'scan' ? 9 : 6;
  for (let s = 0; s < steps; s++) {
    const decay = 1 - s / steps;
    const angle = Math.random() * Math.PI * 2 + i;
    const r = 34 * strength * decay;
    frames.push({ transform: `translate(${Math.cos(angle) * r}%, ${Math.sin(angle) * r - 10 * decay}%)` });
  }
  frames.push({ transform: 'translate(0, 0)' });
  pupil.animate(frames, { duration: kind === 'scan' ? 1000 : 700, easing: 'ease-out' });
}

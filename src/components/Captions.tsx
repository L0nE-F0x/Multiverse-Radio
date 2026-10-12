import type { CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { SHIP } from '../stations/ship';
import { useUi } from '../ui/store';

/**
 * Terminal-style live captions. HUSH, the ship's computer, prints in the console's own
 * amber behind an inverse prompt; everyone else in the station's phosphor. Not announced
 * to screen readers (they change every few seconds; the audio is the content).
 */
export function Captions() {
  const enabled = useUi((s) => s.captions);
  const speaker = useBroadcast((s) => s.caption?.speaker ?? '');
  const text = useBroadcast((s) => s.caption?.text ?? '');
  const reducedMotion = usePrefersReducedMotion();
  if (!enabled || !text) return null;
  const hush = speaker === SHIP.computer.name;
  const words = text.split(/(\s+)/);

  return (
    <div className="captions" aria-hidden data-hush={hush}>
      <p key={`${speaker}:${text}`} className="caption">
        {hush ? (
          <span className="caption-prompt">{SHIP.computer.name}&gt;</span>
        ) : (
          speaker && <span className="caption-speaker">{speaker}</span>
        )}
        <span className="caption-text">
          {reducedMotion
            ? text
            : words.map((word, i) =>
                /^\s+$/.test(word) ? (
                  word
                ) : (
                  <span key={i} className="caption-word" style={{ '--i': i / 2 } as CSSProperties}>
                    {word}
                  </span>
                ),
              )}
          <span className="caption-cursor" />
        </span>
      </p>
    </div>
  );
}

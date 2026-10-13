import type { CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { SHIP } from '../stations/ship';
import { useUi } from '../ui/store';

/** The live caption, if captions are on and someone is talking. */
export function useLiveCaption(): { speaker: string; text: string } | null {
  const enabled = useUi((s) => s.captions);
  const speaker = useBroadcast((s) => s.caption?.speaker ?? '');
  const text = useBroadcast((s) => s.caption?.text ?? '');
  return enabled && text ? { speaker, text } : null;
}

/**
 * Terminal-style live captions. HUSH, the ship's computer, prints in the console's own
 * amber behind an inverse prompt; everyone else in the station's phosphor. Not announced
 * to screen readers (they change every few seconds; the audio is the content).
 *
 * They never sit over the scene while the console is up: `panel` prints them inside the NOW
 * readout. `float` is for when the HUD has withdrawn, low in the strip the dock normally
 * covers (scenes keep their subjects clear of it).
 */
export function Captions({ placement }: { placement: 'panel' | 'float' }) {
  const caption = useLiveCaption();
  const reducedMotion = usePrefersReducedMotion();
  if (!caption) return null;
  const { speaker, text } = caption;
  const hush = speaker === SHIP.computer.name;
  const words = text.split(/(\s+)/);

  const head = hush ? (
    <span className="caption-prompt">{SHIP.computer.name}&gt;</span>
  ) : (
    speaker && <span className="caption-speaker">{speaker}</span>
  );
  const body = (
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
  );

  if (placement === 'panel') {
    // Bottom-aligned in a box a few lines tall: a rare overlong line loses its oldest words.
    return (
      <div className="now-caption" aria-hidden data-hush={hush}>
        <p key={`${speaker}:${text}`}>
          {head}
          {body}
        </p>
      </div>
    );
  }

  return (
    <div className="captions" aria-hidden data-hush={hush}>
      <p key={`${speaker}:${text}`} className="caption">
        {head}
        {body}
      </p>
    </div>
  );
}

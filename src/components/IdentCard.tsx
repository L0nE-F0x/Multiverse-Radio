import { useEffect, useState } from 'react';
import { useBroadcast } from '../broadcast/store';
import { FORMAT_LABEL, formatMhz } from '../ui/format';
import { useSource, useStatus, useTuned } from '../ui/select';
import type { Source } from '../ui/source';
import { useUi } from '../ui/store';
import { useTuning } from '../ui/tuning';

const SHOW_MS = 4200;

const kicker = (source: Source): string =>
  source.secret
    ? 'Unlisted station'
    : source.kind === 'pirate'
      ? 'Unlicensed carrier'
      : source.kind === 'oddity'
        ? 'Unidentified source'
        : 'Signal acquired';

/**
 * A title card when a new signal locks in: frequency, name and tagline, set low in the
 * viewport like a film's location caption. Waits until the hand leaves the dial.
 */
export function IdentCard() {
  const tuned = useTuned();
  const source = useSource();
  const status = useStatus();
  const nonce = useUi((s) => s.identNonce);
  const holding = useTuning((s) => s.holding);
  const [card, setCard] = useState<{ source: Source; frequency: number; key: string } | null>(null);
  const cold = status === 'off' || status === 'lost';

  useEffect(() => {
    if (cold || holding || tuned.kind === 'static') {
      if (tuned.kind === 'static') setCard(null);
      return;
    }
    setCard({ source, frequency: useBroadcast.getState().frequency, key: `${source.name}:${nonce}` });
    const timer = setTimeout(() => setCard(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [tuned, nonce, cold, holding]);

  if (!card) return null;
  const { source: s } = card;
  return (
    <div className="ident" key={card.key} aria-hidden>
      <p className="ident-kicker">
        <span className="ident-rule" />
        {kicker(s)}
        <span className="ident-freq tabular">{formatMhz(card.frequency)} MHz</span>
        {s.format && <span className="ident-format">{FORMAT_LABEL[s.format]}</span>}
      </p>
      <p className="ident-name" data-long={s.name.length > 20}>
        {s.name}
      </p>
      {s.tagline && <p className="ident-tagline">{s.tagline}</p>}
    </div>
  );
}

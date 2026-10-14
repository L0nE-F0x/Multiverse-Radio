import { useEffect, useRef } from 'react';
import { useBroadcast } from '../broadcast/store';
import type { Segment } from '../broadcast/types';
import { useDocumentVisible } from '../hooks/useDocumentVisible';
import { segmentElapsed } from '../ui/clock';
import { BAND_LABEL, bandOf, drifts } from '../ui/dial';
import { FORMAT_LABEL, formatDuration, formatMhz, segmentLabel } from '../ui/format';
import { useOnAir, useSource, useStatus, useTuned } from '../ui/select';
import { KIND_TAG, ODDITY_SIGNAL } from '../ui/source';
import { Captions, useLiveCaption } from './Captions';

/** Who's on this frequency: name, origin, host and the show on air. */
export function SourceBlock() {
  const source = useSource();
  const frequency = useBroadcast((s) => s.frequency);
  const show = useBroadcast((s) => s.show);
  const band = bandOf(frequency);
  const drifting = !!source.station && drifts(source.station);

  return (
    <section className="readout readout-source" aria-labelledby="source-name">
      <header className="readout-head">
        <span className="readout-title">Source</span>
        <span className="tag" data-kind={source.kind}>
          {source.secret ? 'Unlisted' : KIND_TAG[source.kind]}
        </span>
        {source.format && <span className="tag tag-quiet">{FORMAT_LABEL[source.format]}</span>}
        {band !== 'main' && <span className={`tag tag-${band}`}>{BAND_LABEL[band]}</span>}
        {drifting && (
          <span className="tag tag-quiet" title="Somewhere else tomorrow night">
            Drifting
          </span>
        )}
      </header>
      <h2 id="source-name" className="source-name">
        {source.name}
      </h2>
      <dl className="source-meta">
        <div>
          <dt>Freq</dt>
          <dd className="tabular">{formatMhz(frequency)} MHz</dd>
        </div>
        {source.origin && (
          <div className="source-origin">
            <dt>Origin</dt>
            <dd>{source.origin}</dd>
          </div>
        )}
        {source.host && (
          <div>
            <dt>Host</dt>
            <dd>{show?.host ?? source.host}</dd>
          </div>
        )}
        {show && (
          <div>
            <dt>Show</dt>
            <dd>{show.name}</dd>
          </div>
        )}
        {!source.origin && <SearchHint />}
      </dl>
    </section>
  );
}

function SearchHint() {
  return (
    <div>
      <dt>Note</dt>
      <dd>Nothing on this frequency. Fine-tune, or scan.</dd>
    </div>
  );
}

/** What's on air: track or clip, who, and how far through. Live captions print here too. */
export function NowBlock() {
  const segment = useOnAir();
  const captioning = useLiveCaption() !== null;
  const status = useStatus();
  const source = useSource();
  const tuned = useTuned();

  const airing = (status === 'playing' || status === 'paused' || status === 'tuning') && (tuned.kind === 'station' || tuned.kind === 'pirate');
  let code = '—';
  let title: string;
  let byline: string | null = null;
  let note: string | null = null;

  if (status === 'off') {
    title = 'Receiver cold';
    byline = 'Power on to begin the shift.';
  } else if (status === 'lost') {
    title = 'Signal lost';
    byline = 'Retrying.';
  } else if (source.kind === 'static') {
    code = 'Carrier';
    title = 'No carrier';
    byline = 'Open band. Static only.';
  } else if (tuned.kind === 'oddity') {
    code = 'Signal';
    title = ODDITY_SIGNAL[tuned.oddity] ?? source.name;
    byline = source.tagline;
  } else if (segment) {
    const label = segmentLabel(segment, source.station ?? undefined);
    code = label.code;
    title = label.title;
    byline = label.byline;
    note = segment.kind === 'track' ? (segment.meta.note ?? null) : null;
  } else {
    title = 'Standing by';
    byline = 'Waiting for programme.';
  }

  return (
    <section className="readout readout-now" aria-label="Now on air">
      <header className="readout-head">
        <span className="readout-title">Now</span>
        {code !== '—' && <span className="tag">{code}</span>}
        {segment && airing && <span className="now-length tabular">{formatDuration(segment.durationMs)}</span>}
      </header>
      <p className="now-title">{title}</p>
      {captioning ? (
        <Captions placement="panel" />
      ) : (
        <>
          {byline && <p className="now-by">{byline}</p>}
          {note && <p className="now-note">{note}</p>}
        </>
      )}
      {segment && airing && <Progress segment={segment} running={status === 'playing'} />}
    </section>
  );
}

/** A thin progress rule, nudged once a second (no animation frames while it sits there). */
function Progress({ segment, running }: { segment: Segment; running: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useDocumentVisible();
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const update = () => bar.style.setProperty('--p', (segmentElapsed(segment) / Math.max(1, segment.durationMs)).toFixed(4));
    update();
    if (!running || !visible) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [segment, running, visible]);
  return (
    <div className="progress" aria-hidden>
      <span ref={ref} />
    </div>
  );
}

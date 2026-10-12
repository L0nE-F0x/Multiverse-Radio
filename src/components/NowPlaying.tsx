import type { PlayStatus, Segment, StationDef } from '../broadcast/types';
import { useNow } from '../hooks/useNow';
import { segmentElapsed } from '../ui/clock';
import { CATEGORY_LABEL, FORMAT_LABEL, formatDuration, formatFrequency, segmentLabel } from '../ui/format';
import { useOnAir, useStation, useStationIndex, useStatus } from '../ui/select';
import { MicIcon, NoteIcon } from './Icons';
import { Visualizer } from './Visualizer';

const STATUS_TEXT: Record<PlayStatus, string> = {
  off: 'Standby',
  tuning: 'Tuning',
  playing: 'On air',
  paused: 'Paused',
  lost: 'No signal',
};

/** The vacuum-fluorescent readout beside the screen: what's on, who's on, how long. */
export function NowPlaying() {
  const station = useStation();
  const index = useStationIndex();
  const status = useStatus();
  const segment = useOnAir();
  const powered = status !== 'off';

  return (
    <section className="vfd" data-status={status} aria-labelledby="now-playing-heading">
      <h2 id="now-playing-heading" className="sr-only">
        Now playing
      </h2>
      <div className="vfd-row">
        <span className="vfd-status">
          <span className="vfd-lamp" aria-hidden />
          {STATUS_TEXT[status]}
        </span>
        <span className="vfd-dim tabular-nums">
          CH{String(index + 1).padStart(2, '0')} · {formatFrequency(station)} MHz
        </span>
      </div>

      <div key={station.id} className="vfd-station flicker-in">
        <p className="vfd-station-name">{station.name}</p>
        <p className="vfd-dim vfd-origin clamp-1" title={station.origin}>
          {FORMAT_LABEL[station.format]} · from {station.origin}
        </p>
      </div>

      <div className="vfd-segment">
        {powered && segment ? (
          <SegmentReadout segment={segment} station={station} />
        ) : (
          <p className="vfd-dim vfd-idle">{powered ? 'Listening for a signal…' : 'Power on to hear what’s on.'}</p>
        )}
      </div>

      {powered && segment && <Progress segment={segment} status={status} />}

      <div className="vfd-meter">
        <Visualizer />
      </div>
    </section>
  );
}

function SegmentReadout({ segment, station }: { segment: Segment; station: StationDef }) {
  const label = segmentLabel(segment, station);
  if (segment.kind === 'track') {
    const { album, note } = segment.meta;
    return (
      <div key={segment.id} className="flicker-in">
        <p className="vfd-kind">
          <NoteIcon className="h-3.5 w-3.5" /> Now spinning
        </p>
        <p className="vfd-title clamp-2" title={label.title}>
          {label.title}
        </p>
        <p className="vfd-byline clamp-2" title={album ? `${label.byline} · ${album}` : label.byline}>
          {label.byline}
          {album && (
            <>
              {' · '}
              <i>{album}</i>
            </>
          )}
        </p>
        {note && (
          <p className="vfd-note" title={note}>
            {note}
          </p>
        )}
      </div>
    );
  }
  const category = CATEGORY_LABEL[segment.clip.category];
  return (
    <div key={segment.id} className="flicker-in">
      <p className="vfd-kind" data-category={segment.clip.category}>
        <MicIcon className="h-3.5 w-3.5" /> {category}
      </p>
      <p className="vfd-title clamp-2" title={label.title}>
        {label.title}
      </p>
      <p className="vfd-byline clamp-1">with {label.byline}</p>
    </div>
  );
}

const PROGRESS_CELLS = 36;

/**
 * Segmented VFD progress, ticked by a once-a-second clock rather than a continuous
 * animation: cheaper for a tab that stays open all night, and truer to the hardware.
 */
function Progress({ segment, status }: { segment: Segment; status: PlayStatus }) {
  const now = useNow(1000, status === 'playing');
  const elapsed = segmentElapsed(segment, now);
  const lit = Math.round((elapsed / Math.max(1, segment.durationMs)) * PROGRESS_CELLS);

  return (
    <div className="vfd-progress">
      <div className="vfd-cells" aria-hidden>
        {Array.from({ length: PROGRESS_CELLS }, (_, i) => (
          <span key={i} data-lit={i < lit} />
        ))}
      </div>
      <div className="vfd-row vfd-dim tabular-nums">
        <span>{formatDuration(elapsed)}</span>
        <span>−{formatDuration(segment.durationMs - elapsed)}</span>
      </div>
    </div>
  );
}

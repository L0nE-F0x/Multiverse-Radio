import { useMemo, type CSSProperties } from 'react';
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
        <p className="vfd-dim vfd-origin">
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
        <p className="vfd-title">{label.title}</p>
        <p className="vfd-byline">
          {label.byline}
          {album && (
            <>
              {' · '}
              <i>{album}</i>
            </>
          )}
        </p>
        {note && <p className="vfd-note">{note}</p>}
      </div>
    );
  }
  const category = CATEGORY_LABEL[segment.clip.category];
  return (
    <div key={segment.id} className="flicker-in">
      <p className="vfd-kind" data-category={segment.clip.category}>
        <MicIcon className="h-3.5 w-3.5" /> {category}
      </p>
      <p className="vfd-title">{label.title}</p>
      <p className="vfd-byline">with {label.byline}</p>
    </div>
  );
}

/**
 * A compositor-driven progress bar (a CSS animation keyed to the segment) and a clock
 * that re-renders once a second at most.
 */
function Progress({ segment, status }: { segment: Segment; status: PlayStatus }) {
  const running = status === 'playing';
  const now = useNow(1000, running);
  const elapsed = segmentElapsed(segment, now);
  // Recomputed (and the animation restarted) only when the segment or status changes.
  const start = useMemo(() => segmentElapsed(segment), [segment, status]);

  return (
    <div className="vfd-progress">
      <div className="vfd-progress-track" aria-hidden>
        <div
          key={`${segment.id}:${status}`}
          className="vfd-progress-fill"
          style={
            {
              animationDuration: `${segment.durationMs}ms`,
              animationDelay: `-${start}ms`,
              animationPlayState: running ? 'running' : 'paused',
            } as CSSProperties
          }
        />
      </div>
      <div className="vfd-row vfd-dim tabular-nums">
        <span>{formatDuration(elapsed)}</span>
        <span>−{formatDuration(segment.durationMs - elapsed)}</span>
      </div>
    </div>
  );
}

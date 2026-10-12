import { useState, type CSSProperties } from 'react';
import type { StationFormat } from '../broadcast/types';
import * as act from '../ui/actions';
import { FORMAT_LABEL, formatFrequency } from '../ui/format';
import { useStationId, useStations } from '../ui/select';
import { useUi } from '../ui/store';
import { CloseIcon, PinIcon, ScanIcon } from './Icons';
import { Sheet } from './Sheet';

type Filter = StationFormat | 'all';
const FILTERS: Filter[] = ['all', 'music', 'mixed', 'talk', 'ambient'];

const close = () => useUi.setState({ guideOpen: false });

/** The printed listings booklet: every station, what it plays, where it's from, who's on. */
export function ChannelGuide() {
  const open = useUi((s) => s.guideOpen);
  return (
    <Sheet open={open} onClose={close} labelledBy="guide-title" className="guide">
      <GuideContent />
    </Sheet>
  );
}

function GuideContent() {
  const stations = useStations();
  const currentId = useStationId();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = filter === 'all' ? stations : stations.filter((s) => s.format === filter);

  const choose = (id: string) => {
    act.tune(id);
    close();
  };

  return (
    <div className="guide-page">
      <header className="guide-header">
        <div>
          <p className="guide-kicker">The Yondertone listings · Free with every receiver</p>
          <h2 id="guide-title" className="guide-title">
            What's on, everywhere
          </h2>
          <p className="guide-sub">
            {stations.length} stations. All live. None of them local.
          </p>
        </div>
        <button type="button" className="guide-close" onClick={close} aria-label="Close the channel guide">
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="guide-tools">
        <div className="guide-filters" role="group" aria-label="Filter by format">
          {FILTERS.map((f) => {
            const count = f === 'all' ? stations.length : stations.filter((s) => s.format === f).length;
            return (
              <button
                key={f}
                type="button"
                className="guide-filter"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Everything' : FORMAT_LABEL[f]}
                <span className="guide-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="guide-scan"
          onClick={() => {
            close();
            act.scan();
          }}
        >
          <ScanIcon className="h-4 w-4" /> Can't decide? Scan
        </button>
      </div>

      <ul className="guide-grid">
        {shown.map((station) => {
          const current = station.id === currentId;
          return (
            <li key={station.id}>
              <button
                type="button"
                className="listing"
                data-current={current}
                aria-current={current ? 'true' : undefined}
                data-autofocus={current}
                onClick={() => choose(station.id)}
                style={{ '--ch': station.color } as CSSProperties}
              >
                <span className="listing-top">
                  <span className="listing-freq">
                    {formatFrequency(station)}
                    <small>MHz</small>
                  </span>
                  <span className="listing-format">{FORMAT_LABEL[station.format]}</span>
                </span>
                <span className="listing-name">{station.name}</span>
                <span className="listing-origin">
                  <PinIcon className="h-3 w-3 flex-none" />
                  {station.origin}
                </span>
                <span className="listing-tagline">{station.tagline}</span>
                <span className="listing-host">
                  With <strong>{station.host.name}</strong>
                  {station.cast?.length ? ` & ${station.cast.length === 1 ? station.cast[0]!.name : 'friends'}` : ''}
                </span>
                {current && <span className="listing-stamp">You are here</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="guide-footnote">
        Listings correct at time of printing in at least one timeline. Frequencies may drift during eclipses, mergers and Tuesdays.
      </p>
    </div>
  );
}

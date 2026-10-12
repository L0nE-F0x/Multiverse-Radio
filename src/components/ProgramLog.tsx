import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Segment, StationDef } from '../broadcast/types';
import { useNow } from '../hooks/useNow';
import { untilStart } from '../ui/clock';
import { formatDuration, segmentLabel } from '../ui/format';
import { useRecent, useStation, useStations, useUpNext } from '../ui/select';
import { MicIcon, NoteIcon } from './Icons';

type Tab = 'next' | 'recent';

/** A clipboard with the running order: what's coming up, and what you've heard. */
export function ProgramLog() {
  const [tab, setTab] = useState<Tab>('next');
  const id = useId();
  const upNext = useUpNext();
  const recent = useRecent();
  const station = useStation();
  const stations = useStations();
  const now = useNow(15_000);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = tab === 'next' ? 'recent' : 'next';
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };

  const items = tab === 'next' ? upNext.slice(0, 5) : recent.slice(0, 12);

  return (
    <section className="paper clipboard" aria-labelledby={`${id}-title`}>
      <span className="clipboard-clip" aria-hidden />
      <h2 id={`${id}-title`} className="paper-title">
        Program log
      </h2>
      <div className="log-tabs" role="tablist" aria-label="Program log" onKeyDown={onKeyDown}>
        <TabButton id={`${id}-next`} panel={`${id}-panel`} selected={tab === 'next'} onSelect={() => setTab('next')}>
          Up next
        </TabButton>
        <TabButton id={`${id}-recent`} panel={`${id}-panel`} selected={tab === 'recent'} onSelect={() => setTab('recent')}>
          Recently heard{recent.length > 0 && <span className="log-count">{recent.length}</span>}
        </TabButton>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="log-panel">
        {items.length === 0 ? (
          <p className="log-empty">
            {tab === 'next'
              ? 'The schedule is being written as we speak. Possibly by us.'
              : "Nothing yet. You've only just arrived. Take your coat off."}
          </p>
        ) : (
          <ol className="log-list">
            {items.map((segment, i) => (
              <LogRow
                key={segment.id}
                segment={segment}
                station={stations.find((s) => s.id === segment.stationId)}
                currentId={station.id}
                when={tab === 'next' ? startsIn(segment, now, i) : null}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function startsIn(segment: Segment, now: number, index: number): string {
  if (index === 0) return 'Next';
  const ms = untilStart(segment, now);
  if (ms <= 60_000) return 'Soon';
  return `+${Math.round(ms / 60_000)}m`;
}

function TabButton({
  id,
  panel,
  selected,
  onSelect,
  children,
}: {
  id: string;
  panel: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panel}
      tabIndex={selected ? 0 : -1}
      className="log-tab"
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

function LogRow({
  segment,
  station,
  currentId,
  when,
}: {
  segment: Segment;
  station: StationDef | undefined;
  currentId: string;
  when: string | null;
}) {
  const label = segmentLabel(segment, station);
  const elsewhere = station && station.id !== currentId;
  return (
    <li className="log-row" style={{ '--ch': station?.color ?? 'currentColor' } as CSSProperties}>
      <span className="log-when">{when ?? (segment.kind === 'track' ? <NoteIcon className="h-3.5 w-3.5" /> : <MicIcon className="h-3.5 w-3.5" />)}</span>
      <span className="min-w-0 flex-1">
        <span className="log-title">{label.title}</span>
        <span className="log-byline">
          {segment.kind === 'track' ? label.byline : `${label.kind} · ${label.byline}`}
          {elsewhere && (
            <>
              {' · '}
              <span className="log-station">{station.name}</span>
            </>
          )}
        </span>
      </span>
      <span className="log-duration tabular-nums">{formatDuration(segment.durationMs)}</span>
    </li>
  );
}

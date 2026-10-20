import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useBroadcast } from '../broadcast/store';
import type { ShowIndex, StationDef, StationFormat } from '../broadcast/types';
import { localTime } from '../broadcast/time';
import { stationWireFeed } from '../content';
import { useLayout } from '../hooks/useLayout';
import * as act from '../ui/actions';
import { drifts, inMainBand, pirateFrequency } from '../ui/dial';
import { FORMAT_LABEL, formatMhzPadded } from '../ui/format';
import { phosphorHex } from '../ui/phosphor';
import { useTuned } from '../ui/select';
import { useShipLog } from '../ui/shiplog';
import { loadShows, showAt } from '../ui/shows';
import { openPanel } from '../ui/store';
import { Panel } from './Panel';

const FORMATS: StationFormat[] = ['music', 'mixed', 'talk', 'ambient'];

interface Row {
  id: string;
  frequency: number;
  name: string;
  host: string;
  origin: string;
  phosphor: string;
  show: string | null;
  /** Roster stations tune by id; pirates by frequency. */
  roster: boolean;
  tag?: string;
  /** Somewhere else every night (Free Frequency): the frequency shown is tonight's. */
  drift?: boolean;
}

/**
 * The directory: every listed station on the main band by format, the Outer Band, and
 * whatever this operator has found. Frequencies come from the live roster, so a drifting
 * station shows where it is tonight.
 */
export default function Guide() {
  const stations = useBroadcast((s) => s.stations);
  const discovered = useBroadcast((s) => s.discovered);
  const pirates = useShipLog((s) => s.pirates);
  const tuned = useTuned();
  const [shows, setShows] = useState<ShowIndex['shows'] | null>(null);
  const [query, setQuery] = useState('');
  const hour = new Date().getHours();
  const tunedId = tuned.kind === 'station' || tuned.kind === 'pirate' ? tuned.station.id : null;
  const phone = useLayout() === 'drawer';

  useEffect(() => {
    let alive = true;
    void loadShows().then((loaded) => alive && setShows(loaded));
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const showName = (id: string) => showAt(shows?.[id], hour)?.name ?? null;
    const listed = stations.filter((s) => !s.secret);
    const row = (s: StationDef): Row => ({
      id: s.id,
      frequency: s.frequency,
      name: s.name,
      host: s.host.name,
      origin: s.origin,
      phosphor: phosphorHex(s.phosphor),
      show: showName(s.id),
      roster: true,
      ...(drifts(s) ? { drift: true, tag: 'Drifting' } : {}),
    });
    const main = listed.filter((s) => inMainBand(s.frequency) && !drifts(s));
    const outer = listed.filter((s) => !main.includes(s)).sort((a, b) => a.frequency - b.frequency);
    const groups: { key: string; label: string; note?: string; rows: Row[] }[] = FORMATS.map((format) => ({
      key: format,
      label: FORMAT_LABEL[format],
      rows: main.filter((s) => s.format === format).map(row),
    })).filter((g) => g.rows.length);
    if (outer.length) groups.push({ key: 'outer', label: 'Outer band', note: '108–118 MHz', rows: outer.map(row) });
    const found: Row[] = [];
    for (const id of discovered) {
      const secret = stations.find((s) => s.id === id && s.secret);
      if (secret) {
        found.push({ id, frequency: secret.frequency, name: secret.name, host: secret.host.name, origin: secret.origin, phosphor: phosphorHex(secret.phosphor), show: showName(id), roster: true, tag: 'Unlisted' });
        continue;
      }
      const pirate = pirates[id];
      const frequency = pirate?.frequency ?? pirateFrequency(id);
      if (frequency === null) continue;
      found.push({ id, frequency, name: pirate?.name ?? 'Unidentified carrier', host: '—', origin: 'Unlicensed', phosphor: phosphorHex(pirate?.phosphor), show: null, roster: false, tag: 'Pirate' });
    }
    if (found.length) groups.push({ key: 'found', label: 'Found on the band', rows: found.sort((a, b) => a.frequency - b.frequency) });
    return groups;
  }, [stations, discovered, pirates, shows, hour]);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? groups
        .map((g) => ({
          ...g,
          rows: g.rows.filter((r) => [r.name, r.host, r.origin, r.show ?? '', r.tag ?? '', r.frequency.toFixed(2)].some((v) => v.toLowerCase().includes(needle))),
        }))
        .filter((g) => g.rows.length)
    : groups;
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const localDay = localTime(Date.now()).day;
  const tunedStation = tuned.kind === 'station' ? tuned.station : null;
  const wire = useMemo(
    () => (tunedStation ? stationWireFeed(tunedStation, localDay, 3) : null),
    [tunedStation, localDay],
  );

  const choose = (row: Row) => {
    if (row.roster) act.tune(row.id);
    else act.tuneFrequency(row.frequency);
    openPanel(null);
  };

  // Up/Down walk the rows, like a terminal menu.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('.dir-row')];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const find = (
    <label className="dir-find">
      <span className="dir-find-prompt" aria-hidden>
        Find&gt;
      </span>
      <span className="sr-only">Filter stations</span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={phone ? 'name, host, show or MHz' : 'name, host, origin, show or frequency'}
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="search"
      />
    </label>
  );

  // Phones: search sits at the bottom with Close, in reach of a thumb.
  return (
    <Panel id="guide" kicker={`Directory · ${total} sources · Local hour ${String(hour).padStart(2, '0')}:00`} title="Station guide" footer={phone ? find : undefined}>
      {!phone && find}
      {wire && tunedStation && (
        <section className="wire" aria-label={`${tunedStation.name} dossier`}>
          <h3 className="dir-heading">
            Dossier
            <span className="dir-note">{tunedStation.name}</span>
          </h3>
          <dl className="wire-lines">
            <div>
              <dt>Reception</dt>
              <dd>{wire.reception}</dd>
            </div>
            <div>
              <dt>Weather</dt>
              <dd>{wire.weather}</dd>
            </div>
            <div>
              <dt>Listener</dt>
              <dd>{wire.listener}</dd>
            </div>
          </dl>
          <ul className="wire-ticker">
            {wire.ticker.map((line, i) => (
              <li key={`${i}:${line}`}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="dir" onKeyDown={onKeyDown}>
        <div className="dir-columns" aria-hidden>
          <span />
          <span>MHz</span>
          <span>Station</span>
          <span>Host</span>
          <span>On now</span>
        </div>
        {filtered.map((group) => (
          <section key={group.key} className="dir-group" aria-labelledby={`dir-${group.key}`}>
            <h3 id={`dir-${group.key}`} className="dir-heading">
              {group.label}
              {group.note && <span className="dir-note">{group.note}</span>}
              <span className="dir-count">{group.rows.length}</span>
            </h3>
            <ul>
              {group.rows.map((row) => {
                const current = row.id === tunedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="dir-row"
                      aria-current={current ? 'true' : undefined}
                      data-autofocus={current}
                      onClick={() => choose(row)}
                      style={{ '--sw': row.phosphor } as CSSProperties}
                    >
                      <span className="dir-swatch" aria-hidden />
                      <span className="dir-freq tabular" title={row.drift ? 'Tonight’s frequency. It moves every night.' : undefined}>
                        {formatMhzPadded(row.frequency)}
                        {row.drift && <span className="dir-tonight">Tonight</span>}
                      </span>
                      <span className="dir-name">
                        {row.name}
                        {row.tag && <span className="tag tag-quiet">{row.tag}</span>}
                        <span className="dir-origin">{row.origin}</span>
                      </span>
                      <span className="dir-host" data-empty={row.host === '—'}>
                        {row.host}
                      </span>
                      <span className="dir-show" data-empty={!row.show}>
                        {row.show ?? (shows ? '—' : '…')}
                      </span>
                      {current && <span className="dir-here">Tuned</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {filtered.length === 0 && <p className="dir-empty">No source matches “{query}”. The band is wide; try the dial.</p>}
      </div>
    </Panel>
  );
}

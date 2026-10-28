import { useMemo, useState, type CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import { activeSerialForDay, getSerialDirectory } from '../broadcast/scheduler';
import { localTime } from '../broadcast/time';
import { shipLogNote, stationWireFeed } from '../content';
import { stationById } from '../stations/roster';
import { SHIP } from '../stations/ship';
import * as act from '../ui/actions';
import { pirateFrequency } from '../ui/dial';
import { formatClock, formatHeading, formatMhzPadded, hash } from '../ui/format';
import { phosphorHex } from '../ui/phosphor';
import { useTuned } from '../ui/select';
import { clearShipLog, LOG_MAX, useShipLog, type LogEntry } from '../ui/shiplog';
import { openPanel, useUi } from '../ui/store';
import { Panel } from './Panel';

const clockOf = (minuteOfDay: number) =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

const PING_PRESETS: readonly { text: string; code: string }[] = [
  { text: 'Signal locked', code: 'LOCK' },
  { text: 'Carrier drift', code: 'DRFT' },
  { text: 'Anomaly on band', code: 'ANOM' },
  { text: 'Requesting relay check', code: 'ECHO' },
];

/** The ship's log: this shift's intercepts, earlier shifts, and contacts found off the guide. */
export default function ShipLogPanel() {
  const entries = useShipLog((s) => s.entries);
  const pirates = useShipLog((s) => s.pirates);
  const discovered = useBroadcast((s) => s.discovered);
  const stations = useBroadcast((s) => s.stations);
  const frequency = useBroadcast((s) => s.frequency);
  const relays = useBroadcast((s) => s.relays) ?? [];
  const pings = useBroadcast((s) => s.pings) ?? [];
  const recentCount = useBroadcast((s) => s.recent.length);
  const shifts = useBroadcast((s) => s.shifts);
  const heading = useBroadcast((s) => s.heading);
  const shiftStart = useUi((s) => s.shiftStart);
  const tuned = useTuned();
  const [confirm, setConfirm] = useState(false);
  const localDay = localTime(Date.now()).day;
  const tunedId = tuned.kind === 'station' || tuned.kind === 'pirate' ? tuned.station.id : null;
  const lockedRelays = relays.filter(
    (peer) => (tunedId !== null && peer.stationId === tunedId) || Math.abs(peer.frequency - frequency) <= 0.12,
  ).length;
  const serials = useMemo(
    () =>
      getSerialDirectory()
        .map((entry) => activeSerialForDay(entry.serialId, localDay))
        .filter((status) => status !== undefined)
        .map((status) => ({
          ...status,
          station: stationById(status.stationId)?.name ?? status.stationId,
          nextStation: stationById(status.nextStationId)?.name ?? status.nextStationId,
          frequency: stationById(status.stationId)?.frequency,
        })),
    [localDay],
  );
  const tunedStation = tuned.kind === 'station' ? tuned.station : null;
  const wire = useMemo(
    () => (tunedStation ? stationWireFeed(tunedStation, localDay) : null),
    [tunedStation, localDay],
  );

  const contacts = discovered
    .map((id) => {
      const secret = stations.find((s) => s.id === id);
      if (secret) return { id, name: secret.name, frequency: secret.frequency, phosphor: secret.phosphor, roster: true, kind: 'Unlisted' };
      const pirate = pirates[id];
      const frequency = pirate?.frequency ?? pirateFrequency(id);
      return frequency === null ? null : { id, name: pirate?.name ?? 'Unidentified carrier', frequency, phosphor: pirate?.phosphor ?? 'amber', roster: false, kind: 'Pirate' };
    })
    .filter((c) => c !== null)
    .sort((a, b) => a.frequency - b.frequency);

  // Group: this shift, then by day.
  const groups: { label: string; entries: LogEntry[] }[] = [];
  for (const entry of entries) {
    const label = shiftStart !== null && entry.at >= shiftStart ? 'This shift' : dayLabel(entry.at);
    const group = groups[groups.length - 1];
    if (group?.label === label) group.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }

  return (
    <Panel id="log" kicker={`${SHIP.designation} · Operator's record`} title="Ship's log">
      <dl className="log-summary">
        <div className="log-shift">
          <dt>Shift</dt>
          {/* Night shifts worked (the store counts one once a night has 10 minutes on air); a new operator is on their first. */}
          <dd className="tabular">{Math.max(1, shifts)}</dd>
        </div>
        <div className="log-hdg">
          <dt>Heading</dt>
          <dd className="tabular">{formatHeading(heading)}</dd>
        </div>
        <div>
          <dt>This shift</dt>
          <dd className="tabular">{recentCount} intercepts</dd>
        </div>
        <div>
          <dt>On record</dt>
          <dd className="tabular">
            {entries.length} / {LOG_MAX}
          </dd>
        </div>
        <div>
          <dt>Contacts</dt>
          <dd className="tabular">{contacts.length}</dd>
        </div>
        <div>
          <dt>Sister relays</dt>
          <dd className="tabular">
            {relays.length}
            {lockedRelays > 0 ? ` (${lockedRelays} locked)` : ''}
          </dd>
        </div>
      </dl>

      <section className="log-section subspace" aria-labelledby="log-subspace">
        <h3 id="log-subspace" className="dir-heading">
          Subspace wire
          <span className="dir-count">{relays.length} active</span>
          {lockedRelays > 0 && <span className="dir-note">{lockedRelays} locked to station</span>}
        </h3>
        <div className="subspace-tx">
          <span className="subspace-tx-label">Transmit ping</span>
          <div className="subspace-presets">
            {PING_PRESETS.map((preset) => (
              <button
                key={preset.code}
                type="button"
                className="chip"
                onClick={() => act.sendPing(preset.text, preset.code)}
              >
                {preset.text}
              </button>
            ))}
          </div>
        </div>
        {pings.length === 0 ? (
          <p className="log-empty">No subspace pings received on this watch yet.</p>
        ) : (
          <ol className="subspace-pings">
            {pings.map((ping) => (
              <li key={ping.id} className="subspace-ping" data-live={ping.live || undefined}>
                <time className="log-time tabular" dateTime={new Date(ping.at).toISOString()}>
                  {formatClock(ping.at, false)}
                </time>
                <span className="log-freq tabular">{formatMhzPadded(ping.frequency)}</span>
                <span className="log-code subspace-code">{ping.code}</span>
                <span className="subspace-body">
                  <span className="subspace-relay">{ping.relay}</span>
                  <span className="subspace-text">
                    {ping.text}
                    {ping.stationName ? ` · ${ping.stationName}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (ping.stationId && stations.some((s) => s.id === ping.stationId && (!s.secret || discovered.includes(s.id)))) {
                      act.tune(ping.stationId);
                    } else {
                      act.tuneFrequency(ping.frequency);
                    }
                    openPanel(null);
                  }}
                >
                  Tune
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="log-section" aria-labelledby="log-serials">
        <h3 id="log-serials" className="dir-heading">
          Serials on the dial
          <span className="dir-count">{serials.length}</span>
        </h3>
        {serials.length === 0 ? (
          <p className="log-empty">No serial is booked on today’s clock.</p>
        ) : (
          <ul className="log-serials">
            {serials.map((serial) => (
              <li key={serial.serialId}>
                <span className="log-serial-title">{serial.title}</span>
                <span className="log-serial-ep">
                  Episode {serial.episode} of {serial.totalEpisodes}
                  {serial.episodeTitle && serial.episodeTitle !== serial.title ? ` · ${serial.episodeTitle}` : ''}
                </span>
                <span className="log-serial-where">
                  Today on {serial.station}
                  {serial.airMinutes.length > 0 ? ` · ${serial.airMinutes.map(clockOf).join(', ')}` : ''}
                </span>
                <span className="log-serial-next">
                  Next: episode {serial.nextEpisode} on {serial.nextStation}
                </span>
                {serial.frequency !== undefined && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      act.tune(serial.stationId);
                      openPanel(null);
                    }}
                  >
                    Tune
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {wire && tunedStation && (
        <section className="log-section wire" aria-labelledby="log-wire">
          <h3 id="log-wire" className="dir-heading">
            Station wire
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

      <section className="log-section" aria-labelledby="log-contacts">
        <h3 id="log-contacts" className="dir-heading">
          Contacts off the guide
        </h3>
        {contacts.length === 0 ? (
          <p className="log-empty">None yet. The band runs from 76 to 160 MHz, and not everything on it is listed.</p>
        ) : (
          <ul className="log-contacts">
            {contacts.map((c) => (
              <li key={c.id} style={{ '--sw': phosphorHex(c.phosphor) } as CSSProperties}>
                <span className="dir-swatch" aria-hidden />
                <span className="tabular log-freq">{formatMhzPadded(c.frequency)}</span>
                <span className="log-contact-name">{c.name}</span>
                <span className="tag tag-quiet">{c.kind}</span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (c.roster) act.tune(c.id);
                    else act.tuneFrequency(c.frequency);
                    openPanel(null);
                  }}
                >
                  Tune
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groups.length === 0 ? (
        <p className="log-empty">Log empty. Intercepts are recorded once you've heard a few seconds of them.</p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="log-section" aria-label={group.label}>
            <h3 className="dir-heading">
              {group.label}
              <span className="dir-count">{group.entries.length}</span>
            </h3>
            <ol className="log-entries">
              {group.entries.map((entry, i) => (
                <Entry key={entry.id} entry={entry} remark={entry.type === 'contact' || (hash(entry.id) + i) % 3 === 0} />
              ))}
            </ol>
          </section>
        ))
      )}

      {entries.length > 0 && (
        <p className="log-foot">
          {confirm ? (
            <>
              <span>Erase {entries.length} entries?</span>
              <button
                type="button"
                className="chip chip-danger"
                onClick={() => {
                  clearShipLog();
                  setConfirm(false);
                }}
              >
                Erase
              </button>
              <button type="button" className="chip" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="chip" onClick={() => setConfirm(true)}>
              Clear log
            </button>
          )}
        </p>
      )}
    </Panel>
  );
}

function Entry({ entry, remark }: { entry: LogEntry; remark: boolean }) {
  return (
    <li className="log-entry" data-type={entry.type}>
      <time className="log-time tabular" dateTime={new Date(entry.at).toISOString()}>
        {formatClock(entry.at, false)}
      </time>
      <span className="log-freq tabular">{formatMhzPadded(entry.frequency)}</span>
      <span className="log-code">{entry.code}</span>
      <span className="log-what">
        <span className="log-title">{entry.title}</span>
        <span className="log-by">
          {entry.type === 'contact' ? entry.station : `${entry.byline} · ${entry.station}`}
        </span>
        {remark && (
          <span className="log-remark">
            <span className="log-remark-prompt">{SHIP.computer.name}:</span> {shipLogNote(hash(entry.id))}
          </span>
        )}
      </span>
    </li>
  );
}

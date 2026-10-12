import { useState, type CSSProperties } from 'react';
import { useBroadcast } from '../broadcast/store';
import { shipLogNote } from '../content';
import { SHIP } from '../stations/ship';
import * as act from '../ui/actions';
import { pirateFrequency } from '../ui/dial';
import { formatClock, formatMhzPadded, hash } from '../ui/format';
import { phosphorHex } from '../ui/phosphor';
import { clearShipLog, LOG_MAX, useShipLog, type LogEntry } from '../ui/shiplog';
import { openPanel, useUi } from '../ui/store';
import { Panel } from './Panel';

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

/** The ship's log: this shift's intercepts, earlier shifts, and contacts found off the guide. */
export default function ShipLogPanel() {
  const entries = useShipLog((s) => s.entries);
  const pirates = useShipLog((s) => s.pirates);
  const discovered = useBroadcast((s) => s.discovered);
  const stations = useBroadcast((s) => s.stations);
  const recentCount = useBroadcast((s) => s.recent.length);
  const shiftStart = useUi((s) => s.shiftStart);
  const [confirm, setConfirm] = useState(false);

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
      </dl>

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

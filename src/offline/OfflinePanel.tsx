// v4: "Prepare for dead space": the flight-mode packs panel (docs/V4-PLAN.md). The UI
// lazy-loads this module (it pulls in src/pwa/offline.ts and its own CSS) and opens it from
// the console/drawer with `open`/`onClose`.

import { useEffect, useId, useRef, useState } from 'react';
import { PACK_IDS, PACKS, POOLS, SHOWS, type PackId, type PackPlan } from '../pwa/offline';
import { SHIP } from '../stations/ship';
import { stationById } from '../stations/roster';
import { cancel, refresh, refreshStale, remove, stowPack, useCargo } from './cargo';
import './offline.css';

export interface OfflinePanelProps {
  open: boolean;
  onClose(): void;
}

const POOL_NAMES: Record<string, string> = {
  _ship: `${SHIP.computer.name} (ship's computer)`,
  _events: 'Multiverse events',
  _shared: 'Shared ads and bulletins',
  _pirate: 'Pirate carriers',
  _oddities: 'Oddities',
  [SHOWS]: 'Show listings',
};

const isPool = (key: string) => key in POOL_NAMES || (POOLS as readonly string[]).includes(key);
const entryName = (key: string) => POOL_NAMES[key] ?? stationById(key)?.name ?? key;

/** "~25 MB", "180 KB", "1.2 GB". */
function formatBytes(bytes: number, approx = false): string {
  const t = approx ? '~' : '';
  if (bytes <= 0) return '0 MB';
  if (bytes >= 1e9) return `${t}${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e7) return `${t}${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e6) return `${t}${(bytes / 1e6).toFixed(1)} MB`;
  return `${t}${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const stationCount = (entries: string[]) => entries.filter((key) => !isPool(key)).length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function sizeLine(pack: PackId, plan: PackPlan | undefined): string {
  if (!plan) return 'Measuring…';
  const stations = stationCount(plan.entries);
  const what = `${SHIP.computer.name} + ${pack === 'everything' ? `all ${stations}` : stations} stations`;
  if (!plan.sizeKnown) return `Size unknown · ${what}`;
  return `${formatBytes(plan.totalBytes, true)} · ${what}`;
}

const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1));
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** The flight-mode packs panel: a modal dialog (focus trap, Esc, labelled). */
export function OfflinePanel({ open, onClose }: OfflinePanelProps) {
  if (!open) return null;
  return <Dialog onClose={onClose} />;
}

function Dialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const cargo = useCargo();
  const [pack, setPack] = useState<PackId>('essentials');
  const [confirmAll, setConfirmAll] = useState(false);
  const stowRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busy = cargo.job !== null;
  const wasBusy = useRef(busy);

  // The stow button and the progress bar swap places, and buttons disable while a job runs:
  // when that drops keyboard focus, put it on whichever control is there now.
  useEffect(() => {
    const busyChanged = wasBusy.current !== busy;
    wasBusy.current = busy;
    const dialog = ref.current;
    if (!dialog?.open) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const lost = !active || active === document.body || !active.isConnected || active.matches(':disabled');
    if (!lost && !(busyChanged && active.closest('.cargo-action'))) return;
    const stow = stowRef.current && !stowRef.current.disabled ? stowRef.current : null;
    const next = busy ? cancelRef.current : (stow ?? dialog.querySelector<HTMLElement>('input[name="cargo-pack"]:checked'));
    next?.focus({ preventScroll: true });
  }, [busy, cargo.plans, cargo.status]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    void refresh();
    return () => {
      if (dialog.open) dialog.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);

  const { status, plans, job, message, supported } = cargo;
  const stowed = status ? Object.keys(status.stowed) : [];
  const stowedStations = stationCount(stowed);
  const stale = status?.stale ?? [];
  const plan = plans?.[pack];
  // The biggest pack that's mostly aboard: its unstowed stations are "new since you stowed".
  const target = plans ? [...PACK_IDS].reverse().find((id) => plans[id].entries.length - plans[id].missing.length >= plans[id].entries.length / 2) : undefined;
  const notStowed = target && plans ? stationCount(plans[target].missing.filter((key) => !stale.includes(key))) : 0;
  const progress = job?.progress;
  const pct = progress && progress.totalBytes > 0 ? Math.min(100, (progress.doneBytes / progress.totalBytes) * 100) : 0;
  const ios = isIos();

  return (
    <dialog
      ref={ref}
      className="panel panel-offline"
      aria-labelledby={titleId}
      data-testid="offline-panel"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="panel-frame" data-keep-awake="">
        <header className="panel-head">
          <div className="panel-heading">
            <p className="panel-kicker">{SHIP.designation} · Cargo hold</p>
            <h2 id={titleId} className="panel-title">
              Prepare for dead space
            </h2>
          </div>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close Prepare for dead space">
            <span aria-hidden>Esc</span>
          </button>
        </header>

        <div className="panel-body cargo">
          <p className="cargo-intro">
            Out past the relays there is no signal. The music aboard is made on the spot and plays anywhere; the voices have to be stowed
            before you go. Stow a pack and the hosts keep talking in flight mode.
          </p>

          {!supported ? (
            <p className="cargo-note cargo-warn">This browser can't stow cargo: offline storage needs a secure (https) connection.</p>
          ) : (
            <>
              <dl className="log-summary cargo-summary">
                <div>
                  <dt>In the hold</dt>
                  <dd className="tabular" data-testid="cargo-stowed">
                    {status ? `${plural(stowedStations, 'station')} stowed · ${formatBytes(status.bytes)}` : '…'}
                  </dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd className="tabular">
                    {status?.usage != null && status.quota ? `${formatBytes(status.usage)} of ${formatBytes(status.quota)}` : 'Not reported'}
                  </dd>
                </div>
                <div>
                  <dt>Kept</dt>
                  <dd>{status?.persisted ? 'Persistent' : status?.persisted === false ? 'Best effort' : '—'}</dd>
                </div>
              </dl>

              {(stale.length > 0 || notStowed > 0) && (
                <ul className="cargo-alerts">
                  {stale.length > 0 && (
                    <li>
                      <span>{plural(stale.length, 'entry', 'entries')} updated since stowed</span>
                      <button type="button" className="chip" disabled={!!job} onClick={() => void refreshStale(stale)}>
                        Refresh
                      </button>
                    </li>
                  )}
                  {notStowed > 0 && target && (
                    <li>
                      <span>
                        {plural(notStowed, 'station')} not stowed · {PACKS[target].label}
                      </span>
                      <button type="button" className="chip" disabled={!!job} onClick={() => void stowPack(target, PACKS[target].label)}>
                        Stow
                      </button>
                    </li>
                  )}
                </ul>
              )}

              <fieldset className="cargo-packs" disabled={!!job}>
                <legend className="dir-heading">Choose cargo</legend>
                {PACK_IDS.map((id, i) => {
                  const p = plans?.[id];
                  const aboard = p ? p.entries.length - p.missing.length : 0;
                  const full = p && p.missing.length === 0 && p.entries.length > 0;
                  return (
                    <label key={id} className="cargo-pack" data-pack={id}>
                      <input
                        type="radio"
                        name="cargo-pack"
                        value={id}
                        checked={pack === id}
                        onChange={() => setPack(id)}
                        data-autofocus={i === 0 ? '' : undefined}
                      />
                      <span className="cargo-pack-body">
                        <span className="cargo-pack-name">
                          {PACKS[id].label}
                          {full ? (
                            <span className="tag">Stowed</span>
                          ) : aboard > 0 && p ? (
                            <span className="tag tag-quiet">
                              {aboard}/{p.entries.length} aboard
                            </span>
                          ) : null}
                        </span>
                        <span className="cargo-pack-size tabular">{sizeLine(id, p)}</span>
                        <span className="cargo-pack-blurb">{PACKS[id].blurb}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <div className="cargo-action">
                {job && progress ? (
                  <>
                    <div className="cargo-progress">
                      <p className="cargo-progress-label">
                        <span>
                          Stowing {progress.current ? entryName(progress.current) : job.label}
                          <span className="cargo-blink" aria-hidden>
                            _
                          </span>
                        </span>
                        <span className="tabular">
                          {formatBytes(progress.doneBytes)} / {progress.totalBytes ? formatBytes(progress.totalBytes) : '?'}
                        </span>
                      </p>
                      <progress
                        className="cargo-bar"
                        max={100}
                        value={pct}
                        aria-label={`Stowing ${job.label}`}
                        aria-valuetext={`${Math.round(pct)}%${progress.current ? `, ${entryName(progress.current)}` : ''}`}
                      />
                    </div>
                    <button ref={cancelRef} type="button" className="chip chip-danger cargo-cancel" onClick={cancel}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      ref={stowRef}
                      type="button"
                      className="cargo-stow"
                      disabled={!plan || (plan.missing.length === 0 && plan.entries.length > 0)}
                      onClick={() => void stowPack(pack, PACKS[pack].label)}
                    >
                      Stow cargo
                    </button>
                    <span className="cargo-stow-note tabular">
                      {!plan
                        ? ''
                        : plan.missing.length === 0
                          ? 'All aboard.'
                          : plan.sizeKnown
                            ? `${formatBytes(plan.bytes, true)} to load`
                            : `${plural(plan.missing.length, 'entry', 'entries')} to load`}
                    </span>
                  </>
                )}
              </div>

              <p className="cargo-message" role="status" aria-live="polite" data-tone={message?.tone}>
                {message?.text ?? ''}
              </p>

              {stowed.length > 0 && (
                <section className="cargo-hold" aria-labelledby={`${titleId}-hold`}>
                  <h3 id={`${titleId}-hold`} className="dir-heading">
                    Manifest of the hold
                    <span className="dir-count">{stowed.length}</span>
                  </h3>
                  <ul className="cargo-list">
                    {stowed
                      .sort((a, b) => Number(isPool(b)) - Number(isPool(a)) || entryName(a).localeCompare(entryName(b)))
                      .map((key) => (
                        <li key={key}>
                          <span className="cargo-entry-name">
                            {entryName(key)}
                            {stale.includes(key) && <span className="tag tag-quiet">Updated</span>}
                          </span>
                          <span className="cargo-entry-size tabular">{formatBytes(status?.entries[key]?.bytes ?? 0)}</span>
                          <button
                            type="button"
                            className="chip"
                            disabled={!!job}
                            onClick={() => void remove([key])}
                            aria-label={`Remove ${entryName(key)}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                  </ul>
                  <p className="log-foot">
                    {confirmAll ? (
                      <>
                        <span>Jettison all cargo?</span>
                        <button
                          type="button"
                          className="chip chip-danger"
                          onClick={() => {
                            setConfirmAll(false);
                            void remove();
                          }}
                        >
                          Remove all
                        </button>
                        <button type="button" className="chip" onClick={() => setConfirmAll(false)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="chip" disabled={!!job} onClick={() => setConfirmAll(true)}>
                        Remove all
                      </button>
                    )}
                  </p>
                </section>
              )}

              <p className="cargo-note" data-emphasis={ios && !isStandalone() ? 'true' : undefined}>
                <strong>iPhone and iPad:</strong> Safari may clear stowed cargo after a few weeks unused unless Multiverse Radio is on
                your Home Screen (Share → Add to Home Screen).
              </p>
              <p className="cargo-note">
                Stowed stations don't update themselves. New stations from later broadcasts aren't stowed until you stow them.
              </p>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

export default OfflinePanel;

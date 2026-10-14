// v4: the night shift, counted. A *shift* is a local night (06:00 to 06:00) with at least ten
// minutes of actual listening. The count drives the off-course arc (HUSH's arc steps, The
// Harbour) and the Nightjar's heading, which drifts a little further every shift and
// settles once the arc is over. Listening time per station is kept too (offline packs use it
// to stow "your most-played").
//
// Both logs persist through a tiny load/save pair, so they're testable without storage.

import { hash } from './random';
import { browserTzOffset, nightOf, type TzOffset } from './time';

const MIN = 60_000;

/** Listening a night needs before it counts as a shift. */
export const SHIFT_MIN_MS = 10 * MIN;

export interface ShiftState {
  /** Shifts worked. */
  count: number;
  /** The last night (see `nightOf`) that counted, or null. */
  last: number | null;
  /** The night `ms` belongs to. */
  night: number | null;
  /** Listening so far on `night`. */
  ms: number;
}

export interface Persist<T> {
  load(): unknown;
  save(value: T): void;
}

const EMPTY: ShiftState = { count: 0, last: null, night: null, ms: 0 };

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** Validates a stored shift state (anything odd starts afresh). */
export function parseShiftState(raw: unknown): ShiftState {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY };
  const r = raw as Record<string, unknown>;
  const count = int(r.count);
  const ms = typeof r.ms === 'number' && Number.isFinite(r.ms) && r.ms >= 0 ? r.ms : 0;
  return { count: count !== null && count >= 0 ? Math.min(count, 100_000) : 0, last: int(r.last), night: int(r.night), ms };
}

// ── The heading ───────────────────────────────────────────────────────────────

/** Where the Nightjar is meant to be heading. */
export const HEADING_BASE = 41.7;
/** After this many shifts (the arc's last step, past the Harbour) the heading stops drifting. */
export const HEADING_SETTLES_AT = 8;

/**
 * The Nightjar's heading in degrees [0, 360) after `shifts` night shifts: the steady base,
 * drifting further each shift (about 0.9° × the shift number, with a little seeded jitter),
 * then settling once the arc is over.
 */
export function headingFor(shifts: number): number {
  const n = Math.max(0, Math.min(HEADING_SETTLES_AT, Math.floor(Number.isFinite(shifts) ? shifts : 0)));
  let heading = HEADING_BASE;
  for (let k = 1; k <= n; k++) {
    const jitter = (hash('heading', k) / 4294967296 - 0.5) * 0.8;
    // The last step is a small final correction: the ship is where it was going.
    heading += k === HEADING_SETTLES_AT ? 0.4 + jitter / 4 : 0.9 * k + jitter;
  }
  return Math.round((((heading % 360) + 360) % 360) * 10) / 10;
}

// ── Shifts ────────────────────────────────────────────────────────────────────

/** Saves at most this often while listening (and always when a night or the count changes). */
const SAVE_EVERY_MS = 30_000;

export class ShiftLog {
  private state: ShiftState;
  private lastSave = -Infinity;
  /** Lab: pins the count (null follows the log). */
  override: number | null = null;

  constructor(
    private readonly persist: Persist<ShiftState>,
    private readonly tz: TzOffset = browserTzOffset,
  ) {
    this.state = parseShiftState(persist.load());
  }

  /** Shifts worked (or the lab's override). */
  get shifts(): number {
    return this.override ?? this.state.count;
  }

  get heading(): number {
    return headingFor(this.shifts);
  }

  /** Listening so far tonight (the night `wall` falls in). */
  tonightMs(wall: number): number {
    return this.state.night === nightOf(wall, this.tz) ? this.state.ms : 0;
  }

  /** Adds `ms` of listening at `wall`. Returns true if this completed a shift. */
  listen(wall: number, ms: number): boolean {
    if (!(ms > 0)) return false;
    const night = nightOf(wall, this.tz);
    const s = this.state;
    let dirty = false;
    if (s.night !== night) {
      s.night = night;
      s.ms = 0;
      dirty = true;
    }
    s.ms += ms;
    let counted = false;
    if (s.ms >= SHIFT_MIN_MS && s.last !== night) {
      s.count++;
      s.last = night;
      counted = true;
      dirty = true;
    }
    if (dirty || wall - this.lastSave >= SAVE_EVERY_MS) this.save(wall);
    return counted;
  }

  /** Writes now (e.g. when the page is hidden). */
  save(wall = Date.now()): void {
    this.lastSave = wall;
    this.persist.save({ ...this.state });
  }
}

// ── Listening time per station ────────────────────────────────────────────────

export class ListenLog {
  private times: Record<string, number>;
  private lastSave: number | null = null;
  private dirty = false;

  constructor(private readonly persist: Persist<Record<string, number>>) {
    const raw = persist.load();
    this.times = {};
    if (typeof raw === 'object' && raw !== null) {
      for (const [id, ms] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) this.times[id] = ms;
      }
    }
  }

  /** Listening time per station id, ms. */
  get all(): Readonly<Record<string, number>> {
    return this.times;
  }

  /** Adds listening time to a station; writes at most every ~30 s. */
  add(stationId: string, ms: number, wall: number): void {
    if (!(ms > 0)) return;
    this.times[stationId] = (this.times[stationId] ?? 0) + ms;
    this.dirty = true;
    if (this.lastSave === null) this.lastSave = wall;
    else if (wall - this.lastSave >= SAVE_EVERY_MS) this.flush(wall);
  }

  /** Writes any unsaved time now. */
  flush(wall = Date.now()): void {
    this.lastSave = wall;
    if (!this.dirty) return;
    this.dirty = false;
    this.persist.save({ ...this.times });
  }
}

// ── Arcs ──────────────────────────────────────────────────────────────────────

/** Which arc steps have aired (persisted). */
export class ArcLog {
  private steps: Record<string, number[]>;

  constructor(private readonly persist: Persist<Record<string, number[]>>) {
    const raw = persist.load();
    this.steps = {};
    if (typeof raw === 'object' && raw !== null) {
      for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
        if (Array.isArray(list)) this.steps[id] = list.filter((n): n is number => Number.isInteger(n));
      }
    }
  }

  get aired(): Readonly<Record<string, readonly number[]>> {
    return this.steps;
  }

  has(arc: string, step: number): boolean {
    return this.steps[arc]?.includes(step) ?? false;
  }

  /** Records an aired step. Returns false if it had aired already. */
  mark(arc: string, step: number): boolean {
    if (this.has(arc, step)) return false;
    this.steps = { ...this.steps, [arc]: [...(this.steps[arc] ?? []), step].sort((a, b) => a - b) };
    this.persist.save(this.steps);
    return true;
  }

  /** Lab: forgets an arc (or every arc). */
  reset(arc?: string): void {
    if (arc === undefined) this.steps = {};
    else {
      const { [arc]: _, ...rest } = this.steps;
      this.steps = rest;
    }
    this.persist.save(this.steps);
  }
}

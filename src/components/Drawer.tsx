import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent } from 'react';
import { useBroadcast } from '../broadcast/store';
import * as act from '../ui/actions';
import { bandOf, BAND_LABEL } from '../ui/dial';
import { formatMhz, segmentLabel } from '../ui/format';
import { useOnAir, useSource, useStatus } from '../ui/select';
import { setDrawer, ui, useUi } from '../ui/store';
import { useTuning } from '../ui/tuning';
import { Dial } from './Dial';
import { FunctionKeys } from './FunctionKeys';
import { NowBlock, SourceBlock } from './Readouts';

/** Drag travel (px) before a press on the handle counts as a drag rather than a tap. */
const SLOP = 6;
/** Release speed (px/ms) that decides open/closed whatever the position. */
const FLING = 0.35;

/**
 * Phones: the console as a pull-up drawer. Closed, only the mini-player shows at the bottom
 * (station, frequency, a thin tuning strip, play); the scene has the rest of the screen.
 * Drag or tap the handle (or the station name) for the full console; drag down, tap the
 * scrim or press Esc to put it away. Drags follow the finger and can catch the sheet
 * mid-slide; the CSS transition does the rest (and stands down for reduced motion).
 */
export function Drawer() {
  const open = useUi((s) => s.drawer);
  const drawerRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; y0: number; base: number; moved: boolean; samples: { y: number; t: number }[] } | null>(null);

  // The closed drawer slides down by the sheet's height; toasts and floating captions sit
  // just above whatever is left showing (the mini-player).
  useLayoutEffect(() => {
    const peek = peekRef.current;
    const sheet = sheetRef.current;
    if (!peek || !sheet) return;
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty('--dock-h', `${peek.offsetHeight}px`);
      setTravel(sheet.offsetHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(peek);
    observer.observe(sheet);
    measure();
    return () => observer.disconnect();
  }, []);

  // Focus follows the sheet: into it on open, back to the handle when it closes on you.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    const sheet = sheetRef.current;
    if (open) sheet?.focus({ preventScroll: true });
    else if (sheet?.contains(document.activeElement)) handleRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Esc closes it (a panel on top gets the Esc first).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || ui().panel) return;
      event.preventDefault();
      setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /** Where the sheet is right now, mid-transition included (px down from fully open). */
  const offsetNow = (): number => {
    const el = drawerRef.current;
    if (!el) return 0;
    const transform = getComputedStyle(el).transform;
    return transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
  };

  const follow = (offset: number) => {
    const el = drawerRef.current;
    const scrim = scrimRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    if (scrim) {
      scrim.style.transition = 'none';
      scrim.style.opacity = travel ? String(Math.max(0, Math.min(1, 1 - offset / travel))) : '0';
    }
  };

  const letGo = () => {
    for (const el of [drawerRef.current, scrimRef.current]) {
      if (!el) continue;
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, y0: event.clientY, base: offsetNow(), moved: false, samples: [{ y: event.clientY, t: event.timeStamp }] };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dy = event.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dy) < SLOP) return;
      d.moved = true;
      setDragging(true);
    }
    d.samples.push({ y: event.clientY, t: event.timeStamp });
    if (d.samples.length > 6) d.samples.shift();
    follow(Math.max(0, Math.min(travel, d.base + dy)));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      // A tap. (Keyboard and screen readers use the handle's click.)
      if (event.type === 'pointerup') setDrawer(!ui().drawer);
      return;
    }
    const first = d.samples[0]!;
    const last = d.samples[d.samples.length - 1]!;
    const velocity = event.timeStamp - last.t > 90 ? 0 : (last.y - first.y) / Math.max(1, last.t - first.t);
    const offset = Math.max(0, Math.min(travel, d.base + (last.y - d.y0)));
    const target = velocity < -FLING ? true : velocity > FLING ? false : offset < travel / 2;
    letGo();
    setDragging(false);
    setDrawer(target);
  };

  const dragProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

  return (
    <>
      <div ref={scrimRef} className="drawer-scrim" data-open={open} data-dragging={dragging} onClick={() => setDrawer(false)} aria-hidden />
      <div ref={drawerRef} className="drawer hud-chrome" data-open={open} data-dragging={dragging} style={{ '--travel': `${travel}px` } as CSSProperties}>
        <div ref={peekRef} className="drawer-peek" data-keep-awake="">
          <button
            ref={handleRef}
            type="button"
            className="drawer-handle"
            aria-expanded={open}
            aria-controls="console-sheet"
            aria-label="Console"
            // Pointer taps are handled in onPointerUp; this is the keyboard / screen reader path.
            onClick={(event) => {
              if (event.detail === 0) setDrawer(!open);
            }}
            {...dragProps}
          >
            <span className="drawer-grip" aria-hidden />
          </button>
          <MiniPlayer dragProps={dragProps} open={open} />
        </div>
        <div ref={sheetRef} id="console-sheet" className="drawer-sheet" role="region" aria-label="Console" tabIndex={-1} inert={!open && !dragging} data-keep-awake="">
          <div className="hud-readouts">
            <SourceBlock />
            <NowBlock />
          </div>
          <Dial />
          <FunctionKeys variant="drawer" />
        </div>
      </div>
    </>
  );
}

type DragProps = Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>;

/** The drawer's always-visible row: what's tuned, where, the tuning strip and the play key. */
function MiniPlayer({ dragProps, open }: { dragProps: DragProps; open: boolean }) {
  const source = useSource();
  const status = useStatus();
  const segment = useOnAir();
  const stored = useBroadcast((s) => s.frequency);
  const pending = useTuning((s) => s.pending);
  const frequency = pending ?? stored;
  const band = bandOf(frequency);

  let line: string;
  if (status === 'off') line = 'Receiver cold';
  else if (status === 'lost') line = 'Signal lost · retrying';
  else if (status === 'tuning') line = 'Tuning…';
  else if (source.kind === 'static') line = 'Open band · static only';
  else if (source.kind === 'oddity') line = source.tagline ?? 'Unidentified source';
  else if (segment) {
    const label = segmentLabel(segment, source.station ?? undefined);
    line = label.byline ? `${label.title} · ${label.byline}` : label.title;
  } else line = source.tagline ?? '';

  return (
    <div className="mini">
      <div className="mini-id" {...dragProps}>
        <span className="mini-lamp" aria-hidden />
        <span className="mini-text">
          <span className="mini-name">{source.name}</span>
          <span className="mini-now">{line}</span>
        </span>
        <span className="mini-freq tabular">
          {formatMhz(frequency)}
          <small>{band === 'main' ? 'MHz' : BAND_LABEL[band].split(' ')[0]}</small>
        </span>
      </div>
      {/* Under the row on a portrait phone; between name and play on a phone on its side. */}
      <div className="drawer-strip" inert={open}>
        <Dial variant="strip" />
      </div>
      <PlayKey />
    </div>
  );
}

function PlayKey() {
  const status = useStatus();
  const on = status === 'playing' || status === 'tuning';
  const label = status === 'off' ? 'Power on' : status === 'lost' ? 'Retry' : on ? 'Pause' : 'Play';
  const glyph = status === 'off' || status === 'lost' ? 'power' : on ? 'pause' : 'play';
  return (
    <button type="button" className="mini-play" data-glyph={glyph} data-lamp={on} onClick={act.togglePlay} aria-label={label}>
      <span className="mini-glyph" aria-hidden />
    </button>
  );
}

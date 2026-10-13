import { useEffect, useRef } from 'react';
import { useHudState } from '../hooks/useHudState';
import { Captions } from './Captions';
import { Dial } from './Dial';
import { EventBanner } from './EventBanner';
import { FunctionKeys } from './FunctionKeys';
import { IdentCard } from './IdentCard';
import { NowBlock, SourceBlock } from './Readouts';
import { Scope } from './Scope';
import { StatusBar } from './StatusBar';
import { Toaster } from './Toaster';

/**
 * The terminal over the viewport: status line on top; readouts, dial and keys at the
 * bottom; captions, event notices and title cards in between. Dims and withdraws when idle.
 */
export function Hud() {
  const state = useHudState();
  const live = state !== 'hidden';
  const dockRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.hud = state;
  }, [state]);

  // Toasts (and captions, once the dock withdraws) sit just above the dock, whatever its height here.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--dock-h', `${dock.offsetHeight}px`));
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="hud" data-hud={state}>
      <header className="hud-top hud-chrome" data-keep-awake="">
        <StatusBar live={live} />
      </header>
      <EventBanner live />
      <IdentCard />
      <div className="hud-float">
        <Toaster />
        {/* With the console up, captions print in the NOW readout instead (never over the scene). */}
        {state === 'hidden' && <Captions placement="float" />}
      </div>
      <footer ref={dockRef} className="hud-dock hud-chrome" data-keep-awake="">
        <div className="hud-readouts">
          <SourceBlock />
          <NowBlock />
          <Scope awake={state === 'awake'} />
        </div>
        <Dial />
        <FunctionKeys />
      </footer>
    </div>
  );
}

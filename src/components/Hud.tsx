import { useEffect, useRef } from 'react';
import { useHudState } from '../hooks/useHudState';
import { useLayout } from '../hooks/useLayout';
import { useUi } from '../ui/store';
import { Captions } from './Captions';
import { Dial } from './Dial';
import { Drawer } from './Drawer';
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
 * On phones the bottom of it is a pull-up drawer, so the scene gets the screen.
 */
export function Hud() {
  const state = useHudState();
  const layout = useLayout();
  const drawerOpen = useUi((s) => s.drawer);
  const live = state !== 'hidden';
  const drawer = layout === 'drawer';
  const dockRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.hud = state;
  }, [state]);

  // Toasts (and captions, once the dock withdraws) sit just above the dock, whatever its height here.
  // (The drawer measures its own mini-player.)
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--dock-h', `${dock.offsetHeight}px`));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [drawer]);

  // With the console up, captions print in the NOW readout instead (never over the scene).
  // The closed drawer has no NOW readout showing: they float just above the mini-player.
  const floatCaptions = state === 'hidden' || (drawer && !drawerOpen);

  return (
    <div className="hud" data-hud={state} data-layout={layout}>
      <header className="hud-top hud-chrome" data-keep-awake="">
        <StatusBar live={live} />
      </header>
      <EventBanner live />
      <IdentCard />
      <div className="hud-float">
        <Toaster />
        {floatCaptions && <Captions placement="float" />}
      </div>
      {drawer ? (
        <Drawer />
      ) : (
        <footer ref={dockRef} className="hud-dock hud-chrome" data-keep-awake="">
          <div className="hud-readouts">
            <SourceBlock />
            <NowBlock />
            <Scope awake={state === 'awake'} />
          </div>
          <Dial />
          <FunctionKeys />
        </footer>
      )}
    </div>
  );
}

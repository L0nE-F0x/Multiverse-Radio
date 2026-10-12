import { useBroadcastEffects } from './broadcast/effects';
import { AmbientView } from './components/AmbientView';
import { Announcer } from './components/Announcer';
import { Cabinet } from './components/Cabinet';
import { ChannelGuide } from './components/ChannelGuide';
import { HelpDialog } from './components/HelpDialog';
import { HostCard } from './components/HostCard';
import { ListenerLine } from './components/ListenerLine';
import { ProgramLog } from './components/ProgramLog';
import { Toaster } from './components/Toaster';
import { TopBar } from './components/TopBar';
import { Weather } from './components/Weather';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useReceiverSync } from './hooks/useReceiverSync';
import { useSleepTimer } from './hooks/useSleepTimer';
import { useUi } from './ui/store';

export default function App() {
  useBroadcastEffects();
  useReceiverSync();
  useKeyboardControls();
  useSleepTimer();
  const ambient = useUi((s) => s.ambient);

  return (
    <>
      <div className="room" aria-hidden />
      <div className="app" data-ambient={ambient} inert={ambient}>
        <TopBar />
        <main className="layout">
          <Cabinet />
          <aside className="desk" aria-label="Around the radio">
            <HostCard />
            <ProgramLog />
            <ListenerLine />
            <Weather />
          </aside>
        </main>
        <footer className="footer">
          <span>22 stations broadcasting live from elsewhere</span>
          <span aria-hidden>·</span>
          <span>Reception not guaranteed in this reality</span>
          <span aria-hidden className="hidden [@media(hover:hover)]:inline">·</span>
          <span className="hidden [@media(hover:hover)]:inline">
            Press <kbd>?</kbd> for the manual
          </span>
        </footer>
      </div>
      {ambient && <AmbientView />}
      <ChannelGuide />
      <HelpDialog />
      <Toaster />
      <Announcer />
    </>
  );
}

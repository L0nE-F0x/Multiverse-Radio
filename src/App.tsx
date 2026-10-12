import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { ChannelDial } from './components/ChannelDial';
import { EpisodeList } from './components/EpisodeList';
import { RetryIcon } from './components/Icons';
import { NowPlaying } from './components/NowPlaying';
import { PlayerControls } from './components/PlayerControls';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useMediaSession } from './hooks/useMediaSession';
import { currentChannel, useRadio, type Status } from './lib/store';

export default function App() {
  const dataState = useRadio((s) => s.dataState);
  const load = useRadio((s) => s.load);
  const accent = useRadio((s) => currentChannel(s)?.color);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (accent) document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  useKeyboardControls();
  useMediaSession();

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="room-glow" aria-hidden />
      <div className="room-grain" aria-hidden />

      <div className="relative mx-auto flex min-h-dvh max-w-[1280px] flex-col justify-center px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <main className="chassis px-4 pt-5 pb-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-5">
          <Screws />
          <Nameplate />
          <div className="engraved-rule my-4" />
          {dataState === 'ready' ? <Receiver /> : <Boot />}
          <Grille />
        </main>

        <footer className="mt-4 flex flex-col items-center gap-1 px-4 text-center font-mono text-[10px] tracking-[0.18em] text-cream/30 uppercase sm:flex-row sm:justify-between">
          <span>Transmissions stream when played · about 1 MB each</span>
          <span>Reception not guaranteed in this reality</span>
        </footer>
      </div>
    </div>
  );
}

function Receiver() {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(230px,270px)_minmax(0,1fr)] md:gap-5 lg:grid-cols-[250px_minmax(0,1fr)_300px] xl:grid-cols-[270px_minmax(0,1fr)_340px]">
      <div className="min-w-0 md:row-span-2 lg:row-span-1">
        <ChannelDial />
      </div>
      <div className="flex min-w-0 flex-col gap-4 md:gap-5">
        <NowPlaying />
        <PlayerControls />
      </div>
      <div className="relative min-w-0 md:col-start-2 lg:col-start-auto lg:min-h-[420px]">
        <EpisodeList />
      </div>
    </div>
  );
}

function Nameplate() {
  const status = useRadio((s) => s.status);
  return (
    <header className="flex items-center justify-between gap-4 pl-1">
      <div className="min-w-0">
        <h1 className="font-display text-[1.7rem] leading-none tracking-[0.12em] whitespace-nowrap text-cream/90 [text-shadow:0_1px_0_rgb(0_0_0/0.9),0_0_28px_var(--accent-faint)] sm:text-[2.4rem] sm:tracking-[0.16em]">
          Multiverse Radio
        </h1>
        <p className="engraved mt-1.5 truncate font-mono text-[9.5px] tracking-[0.3em] uppercase sm:text-[10px]">
          Model MV-137<span className="hidden sm:inline"> · Interdimensional receiver</span>
        </p>
      </div>
      <div className="flex flex-none items-end gap-6 pr-1">
        <SignalMeter status={status} />
        <Indicator label="Power">
          <span className="lamp h-3 w-3" data-on={status !== 'off'} style={{ '--lamp': '#ff7a3a' } as CSSProperties} />
        </Indicator>
      </div>
    </header>
  );
}

function SignalMeter({ status }: { status: Status }) {
  const buffering = useRadio((s) => s.buffering);
  const strength =
    status === 'playing' || status === 'paused' ? (buffering ? 2 : 5) : status === 'tuning' ? 1 : 0;
  return (
    <Indicator label="Signal" className="hidden sm:flex">
      <span className="flex h-3 items-end gap-[3px]" aria-hidden>
        {[0.35, 0.5, 0.65, 0.82, 1].map((height, i) => (
          <span
            key={height}
            className="w-[3px] rounded-[1px] transition-[background-color,box-shadow] duration-300"
            style={{
              height: `${height * 100}%`,
              background: i < strength ? 'var(--accent)' : 'rgb(240 230 210 / 0.12)',
              boxShadow: i < strength ? '0 0 6px var(--accent-soft)' : 'none',
              animation: status === 'tuning' ? 'blink 0.7s steps(2) infinite' : undefined,
            }}
          />
        ))}
      </span>
    </Indicator>
  );
}

function Indicator({ label, className = 'flex', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`${className} flex-col items-center gap-1.5`}>
      <span className="grid h-3 place-items-center">{children}</span>
      <span className="engraved font-mono text-[9px] tracking-[0.3em] uppercase">{label}</span>
    </div>
  );
}

function Boot() {
  const dataState = useRadio((s) => s.dataState);
  const dataError = useRadio((s) => s.dataError);
  const load = useRadio((s) => s.load);

  return (
    <div className="display-glass grid min-h-[440px] place-items-center rounded-2xl p-8 text-center">
      {dataState === 'error' ? (
        <div role="alert" className="relative z-30">
          <p className="font-display text-[2.6rem] leading-none tracking-[0.1em] text-[#ff5a3c]">No channel guide</p>
          <p className="mx-auto mt-3 max-w-sm text-sm text-pretty text-cream/65">{dataError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="hw-button mt-6 inline-flex h-11 items-center gap-2 px-5 text-sm font-medium"
          >
            <RetryIcon className="h-4 w-4" />
            Try again
          </button>
        </div>
      ) : (
        <div aria-busy="true" className="relative z-30 flex flex-col items-center">
          <span className="lamp h-3 w-3" data-on data-blink style={{ '--lamp': '#ffaa44' } as CSSProperties} />
          <p className="mt-4 font-mono text-xs tracking-[0.3em] text-cream/55 uppercase">Warming up the tubes…</p>
        </div>
      )}
    </div>
  );
}

function Grille() {
  return (
    <div className="grille mt-4 flex h-7 items-center justify-center rounded-xl px-4 sm:mt-5 [@media(hover:hover)]:h-9">
      <p className="hidden rounded-md bg-[#0e0b09] px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-cream/45 uppercase shadow-[0_0_0_1px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_230_200/0.05)] md:[@media(hover:hover)]:block">
        <Key>Space</Key> play/pause · <Key>← →</Key> episode · <Key>↑ ↓</Key> channel · <Key>M</Key> mute
      </p>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="font-mono font-semibold text-cream/70">{children}</kbd>;
}

const SCREWS: { className: string; angle: number }[] = [
  { className: 'top-3 left-3', angle: 35 },
  { className: 'top-3 right-3', angle: -20 },
  { className: 'bottom-3 left-3', angle: 80 },
  { className: 'bottom-3 right-3', angle: 10 },
];

function Screws() {
  return (
    <>
      {SCREWS.map(({ className, angle }) => (
        <span
          key={className}
          aria-hidden
          className={`screw ${className} hidden sm:block`}
          style={{ '--screw-angle': `${angle}deg` } as CSSProperties}
        />
      ))}
    </>
  );
}

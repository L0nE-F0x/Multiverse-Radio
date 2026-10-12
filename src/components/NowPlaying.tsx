import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { channelFrequency } from '../lib/channels';
import { formatTime } from '../lib/format';
import {
  AUTO_SKIP_MS,
  currentChannel,
  currentChannelIndex,
  currentEpisode,
  useRadio,
  type Status,
} from '../lib/store';
import { NextIcon, PlayIcon, RetryIcon } from './Icons';
import { Visualizer } from './Visualizer';

const STATUS_LABEL: Record<Status, string> = {
  off: 'Standby',
  tuning: 'Tuning…',
  playing: 'On air',
  paused: 'Paused',
  lost: 'Signal lost',
  empty: 'No signal',
};

const RED = '#ff4d2e';
const AMBER = '#ffaa44';

export function NowPlaying() {
  const channel = useRadio(currentChannel);
  const channelIndex = useRadio(currentChannelIndex);
  const episode = useRadio(currentEpisode);
  const status = useRadio((s) => s.status);
  const buffering = useRadio((s) => s.buffering);
  if (!channel) return null;

  const powered = status !== 'off';
  const label = status === 'playing' && buffering ? 'Buffering…' : STATUS_LABEL[status];
  const lamp: { on: boolean; blink: boolean; color: string } = {
    on: status === 'playing' || status === 'tuning' || status === 'lost',
    blink: status === 'tuning' || status === 'lost' || buffering,
    color: status === 'tuning' || buffering ? AMBER : RED,
  };
  const announcement =
    status === 'playing' && episode
      ? `Now playing ${episode.title}, on ${channel.name}.`
      : status === 'lost'
        ? 'Signal lost.'
        : status === 'empty'
          ? `${channel.name} has no transmissions yet.`
          : '';

  return (
    <section aria-label="Now playing" className="display-glass flex min-h-[360px] flex-1 flex-col rounded-2xl">
      <div className="crt-roll" aria-hidden />
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
        <div className="static-noise" data-active={status === 'tuning'} />
      </div>

      <div className={`relative z-10 flex flex-1 flex-col ${powered ? 'display-warmup' : ''}`}>
        <div
          className="display-content flex flex-1 flex-col p-5 sm:p-6"
          data-dim={!powered}
          data-tuning={status === 'tuning'}
        >
          <div className="flex items-center justify-between gap-3 font-mono text-[11px] tracking-[0.22em] uppercase">
            <span className="flex items-center gap-2 text-cream/80">
              <span
                className="lamp"
                data-on={lamp.on}
                data-blink={lamp.blink}
                style={{ '--lamp': lamp.color } as CSSProperties}
              />
              {label}
            </span>
            <span className="text-cream/40 tabular-nums">
              {channelFrequency(channelIndex)} MHz · CH {String(channelIndex + 1).padStart(2, '0')}
            </span>
          </div>

          <div className="mt-5 min-w-0">
            <p
              key={channel.id}
              className="flicker-in glow-text font-display text-[clamp(2.6rem,7vw,4rem)] leading-[0.88] tracking-[0.02em] text-balance text-(--accent)"
            >
              {channel.name}
            </p>
            <p className="mt-2 font-mono text-[10.5px] tracking-[0.2em] text-cream/45 uppercase">{channel.tagline}</p>
            {episode && (
              <div key={episode.id} className="flicker-in mt-5">
                <h2 className="text-xl leading-snug font-semibold text-balance text-cream sm:text-2xl">{episode.title}</h2>
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-pretty text-cream/60">{episode.description}</p>
              </div>
            )}
          </div>

          <div className="relative mt-6 min-h-24 flex-1">
            <div className="absolute inset-0">
              <Visualizer />
            </div>
          </div>
          <Progress loop={episode?.loop ?? false} />
        </div>
      </div>

      {status === 'off' && <TuneIn />}
      {status === 'lost' && <SignalLost episodeCount={channel.episodes.length} />}
      {status === 'empty' && (
        <Overlay>
          <p className="font-display text-4xl tracking-[0.1em] text-cream/80">No transmissions</p>
          <p className="mt-2 text-sm text-pretty text-cream/60">
            Nothing has been received on this frequency yet. Try another channel.
          </p>
        </Overlay>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

function Progress({ loop }: { loop: boolean }) {
  const currentTime = useRadio((s) => s.currentTime);
  const duration = useRadio((s) => s.duration);
  const status = useRadio((s) => s.status);
  const seek = useRadio((s) => s.seek);

  const seekable = (status === 'playing' || status === 'paused') && duration > 0 && !loop;
  const shown = Math.min(currentTime, duration || 0);
  const percent = duration > 0 ? (shown / duration) * 100 : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const jumps: Record<string, number> = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 15, PageDown: -15 };
    const jump = jumps[event.key];
    if (jump === undefined) return;
    event.preventDefault();
    seek(currentTime + jump);
  };

  return (
    <div className="mt-4">
      <input
        type="range"
        className="slider w-full"
        min={0}
        max={duration || 1}
        step="any"
        value={shown}
        disabled={!seekable}
        onChange={(event) => seek(Number(event.target.value))}
        onKeyDown={handleKeyDown}
        aria-label="Seek"
        aria-valuetext={`${formatTime(shown)} of ${duration > 0 ? formatTime(duration) : 'unknown'}`}
        style={{ '--fill': `${percent}%` } as CSSProperties}
      />
      <div className="mt-1 flex justify-between font-mono text-xs text-cream/55 tabular-nums">
        <span>{formatTime(shown)}</span>
        <span>{loop ? '∞ loop' : duration > 0 ? formatTime(duration) : '–:––'}</span>
      </div>
    </div>
  );
}

function Overlay({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className="absolute inset-0 z-30 grid place-items-center rounded-[inherit] bg-black/60 p-6 text-center backdrop-blur-[2px]"
    >
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

function TuneIn() {
  const togglePlay = useRadio((s) => s.togglePlay);
  return (
    <div className="absolute inset-0 z-30 grid place-items-center p-6">
      <div className="flex flex-col items-center text-center">
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Tune in"
          className="hw-button hw-button-primary relative h-24 w-24 rounded-full"
        >
          <span className="tune-in-ring absolute inset-0 rounded-full border-2 border-(--accent)" aria-hidden />
          <span className="tune-in-ring absolute inset-0 rounded-full border border-(--accent) [animation-delay:1.2s]" aria-hidden />
          <PlayIcon className="h-10 w-10 translate-x-0.5" />
        </button>
        <p className="glow-text mt-5 font-display text-[2rem] leading-none tracking-[0.14em] text-cream">Tune in</p>
        <p className="mt-2 font-mono text-[10.5px] tracking-[0.2em] text-cream/50 uppercase">
          Sound on<span className="hidden [@media(hover:hover)]:inline"> · or press space</span>
        </p>
      </div>
    </div>
  );
}

function SignalLost({ episodeCount }: { episodeCount: number }) {
  const message = useRadio((s) => s.signalMessage);
  const autoSkipAt = useRadio((s) => s.autoSkipAt);
  const retry = useRadio((s) => s.retry);
  const stepEpisode = useRadio((s) => s.stepEpisode);

  return (
    <Overlay alert>
      <p className="flicker-in font-display text-[2.6rem] leading-none tracking-[0.1em] text-[#ff5a3c] [text-shadow:0_0_18px_rgb(255_77_46/0.5)]">
        Signal lost
      </p>
      <p className="mt-3 text-sm text-pretty text-cream/70">{message}</p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={retry} className="hw-button inline-flex h-11 items-center gap-2 px-4 text-sm font-medium">
          <RetryIcon className="h-4 w-4" />
          Try again
        </button>
        {episodeCount > 1 && (
          <button
            type="button"
            onClick={() => stepEpisode(1)}
            className="hw-button hw-button-primary inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold"
          >
            Skip
            <NextIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {autoSkipAt !== null && (
        <div className="mx-auto mt-5 max-w-[220px]">
          <p className="font-mono text-[10px] tracking-[0.2em] text-cream/45 uppercase">Retuning to the next transmission</p>
          <div className="mt-2 h-0.5 overflow-hidden rounded bg-white/10">
            <div
              key={autoSkipAt}
              className="drain h-full bg-(--accent)"
              style={{ '--drain-ms': `${AUTO_SKIP_MS}ms` } as CSSProperties}
            />
          </div>
        </div>
      )}
    </Overlay>
  );
}

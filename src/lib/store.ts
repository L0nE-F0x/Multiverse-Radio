import { create } from 'zustand';
import { engine, type TransitionKind } from './audio';
import { ChannelDataError, loadChannels, resolveAsset, type Channel, type Episode } from './channels';
import { storage } from './storage';

/**
 * off      – never tuned in (browsers need a gesture before audio)
 * tuning   – static burst while the next transmission loads
 * lost     – the file failed; auto-skips unless the whole channel is dead
 * empty    – the channel has no episodes
 */
export type Status = 'off' | 'tuning' | 'playing' | 'paused' | 'lost' | 'empty';

interface RadioState {
  dataState: 'loading' | 'ready' | 'error';
  dataError: string | null;
  channels: Channel[];
  channelId: string;
  episodeIndex: number;
  /** Episode each channel was left on, so switching back picks up there (session only). */
  positions: Record<string, number>;
  status: Status;
  buffering: boolean;
  signalMessage: string | null;
  /** When the pending auto-skip fires (epoch ms), if one is scheduled. */
  autoSkipAt: number | null;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

interface RadioActions {
  load(): Promise<void>;
  togglePlay(): void;
  selectChannel(id: string, options?: { quiet?: boolean }): void;
  stepChannel(delta: 1 | -1): void;
  selectEpisode(index: number): void;
  stepEpisode(delta: 1 | -1): void;
  retry(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
}

export type RadioStore = RadioState & RadioActions;

export const AUTO_SKIP_MS = 2000;
const DEFAULT_VOLUME = 0.8;

export const currentChannel = (s: RadioState): Channel | undefined => s.channels.find((c) => c.id === s.channelId);
export const currentChannelIndex = (s: RadioState): number => s.channels.findIndex((c) => c.id === s.channelId);
export const currentEpisode = (s: RadioState): Episode | undefined => currentChannel(s)?.episodes[s.episodeIndex];
export const isLive = (status: Status): boolean => status === 'playing' || status === 'tuning';

let autoSkipTimer: ReturnType<typeof setTimeout> | undefined;
let consecutiveFailures = 0;

export const useRadio = create<RadioStore>()((set, get) => {
  const clearAutoSkip = () => {
    clearTimeout(autoSkipTimer);
    autoSkipTimer = undefined;
  };

  const tuneCurrent = async (kind: TransitionKind) => {
    clearAutoSkip();
    const episode = currentEpisode(get());
    const reset = { buffering: false, signalMessage: null, autoSkipAt: null, currentTime: 0 };
    if (!episode) {
      engine.stop();
      set({ ...reset, status: 'empty', duration: 0 });
      return;
    }
    set({ ...reset, status: 'tuning', duration: episode.durationSeconds });

    const result = await engine.tune(resolveAsset(episode.audioUrl), { loop: episode.loop, kind });
    switch (result.type) {
      case 'cancelled':
        return;
      case 'playing':
        consecutiveFailures = 0;
        set({ status: 'playing' });
        return;
      case 'blocked':
        set({ status: 'paused' });
        return;
      case 'failed':
        signalLost(result.message);
    }
  };

  const signalLost = (message: string) => {
    clearAutoSkip();
    consecutiveFailures++;
    const count = currentChannel(get())?.episodes.length ?? 0;
    const canSkip = count > 1 && consecutiveFailures < count;
    set({
      status: 'lost',
      buffering: false,
      signalMessage: canSkip ? message : `${message} Nothing on this channel is coming through right now.`,
      autoSkipAt: canSkip ? Date.now() + AUTO_SKIP_MS : null,
    });
    if (canSkip) autoSkipTimer = setTimeout(() => goToEpisode(get().episodeIndex + 1), AUTO_SKIP_MS);
  };

  const goToEpisode = (index: number) => {
    const count = currentChannel(get())?.episodes.length ?? 0;
    if (count === 0) return;
    const wasOff = get().status === 'off';
    set({ episodeIndex: ((index % count) + count) % count });
    void tuneCurrent(wasOff ? 'channel' : 'episode');
  };

  const resumeCurrent = async () => {
    const episode = currentEpisode(get());
    if (!episode) return;
    if (!engine.canResume(resolveAsset(episode.audioUrl))) return tuneCurrent('episode');
    set({ status: 'playing' });
    const result = await engine.resume();
    if (result.type === 'blocked') set({ status: 'paused' });
    else if (result.type === 'failed') signalLost(result.message);
  };

  engine.on('time', ({ currentTime, duration }) => {
    const fallback = currentEpisode(get())?.durationSeconds ?? 0;
    set({ currentTime, duration: Number.isFinite(duration) && duration > 0 ? duration : fallback });
  });
  engine.on('ended', () => goToEpisode(get().episodeIndex + 1));
  engine.on('error', (message) => signalLost(message));
  engine.on('buffering', (buffering) => set({ buffering }));
  engine.on('interrupted', () => {
    if (get().status === 'playing') set({ status: 'paused', buffering: false });
  });

  const initialVolume = storage.getVolume() ?? DEFAULT_VOLUME;
  engine.setVolume(initialVolume);

  return {
    dataState: 'loading',
    dataError: null,
    channels: [],
    channelId: '',
    episodeIndex: 0,
    positions: {},
    status: 'off',
    buffering: false,
    signalMessage: null,
    autoSkipAt: null,
    currentTime: 0,
    duration: 0,
    volume: initialVolume,
    muted: false,

    async load() {
      set({ dataState: 'loading', dataError: null });
      try {
        const channels = await loadChannels();
        const saved = storage.getLastChannel();
        const channel = channels.find((c) => c.id === saved) ?? channels[0]!;
        set({
          channels,
          channelId: channel.id,
          episodeIndex: 0,
          duration: channel.episodes[0]?.durationSeconds ?? 0,
          dataState: 'ready',
        });
      } catch (error) {
        console.error(error);
        set({
          dataState: 'error',
          dataError:
            error instanceof ChannelDataError ? error.message : 'Something went wrong while reading the channel guide.',
        });
      }
    },

    togglePlay() {
      engine.unlock();
      clearAutoSkip();
      switch (get().status) {
        case 'off':
          void tuneCurrent('channel');
          return;
        case 'lost':
          void tuneCurrent('episode');
          return;
        case 'tuning':
        case 'playing':
          engine.pause();
          set({ status: 'paused', buffering: false });
          return;
        case 'paused':
          void resumeCurrent();
          return;
        case 'empty':
          return;
      }
    },

    selectChannel(id, { quiet = false } = {}) {
      const state = get();
      const channel = state.channels.find((c) => c.id === id);
      if (!channel) return;
      engine.unlock();

      if (id === state.channelId) {
        // Re-selecting the current channel just means "let me hear it".
        if (!isLive(state.status)) state.togglePlay();
        return;
      }

      if (!quiet) engine.click();
      consecutiveFailures = 0;
      const positions = { ...state.positions, [state.channelId]: state.episodeIndex };
      const episodeIndex = Math.min(positions[id] ?? 0, Math.max(0, channel.episodes.length - 1));
      set({ channelId: id, episodeIndex, positions });
      storage.setLastChannel(id);
      void tuneCurrent('channel');
    },

    stepChannel(delta) {
      const state = get();
      const count = state.channels.length;
      const next = state.channels[(currentChannelIndex(state) + delta + count) % count];
      if (next) state.selectChannel(next.id);
    },

    selectEpisode(index) {
      const state = get();
      if (!currentChannel(state)?.episodes[index]) return;
      engine.unlock();
      if (index === state.episodeIndex && state.status !== 'off' && state.status !== 'lost') {
        if (state.status === 'paused') state.togglePlay();
        return;
      }
      goToEpisode(index);
    },

    stepEpisode(delta) {
      engine.unlock();
      goToEpisode(get().episodeIndex + delta);
    },

    retry() {
      engine.unlock();
      consecutiveFailures = 0;
      void tuneCurrent('episode');
    },

    seek(seconds) {
      engine.seek(seconds);
    },

    setVolume(volume) {
      const value = Math.min(1, Math.max(0, volume));
      engine.setVolume(value);
      engine.setMuted(false);
      storage.setVolume(value);
      set({ volume: value, muted: false });
    },

    toggleMute() {
      const muted = !get().muted;
      engine.setMuted(muted);
      set({ muted });
    },
  };
});

import type { CSSProperties } from 'react';
import { isLive, useRadio } from '../lib/store';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon } from './Icons';

export function PlayerControls() {
  const status = useRadio((s) => s.status);
  const volume = useRadio((s) => s.volume);
  const muted = useRadio((s) => s.muted);
  const togglePlay = useRadio((s) => s.togglePlay);
  const stepEpisode = useRadio((s) => s.stepEpisode);
  const toggleMute = useRadio((s) => s.toggleMute);
  const setVolume = useRadio((s) => s.setVolume);

  const live = isLive(status);
  const empty = status === 'empty';
  const audible = muted ? 0 : volume;
  const level = audible === 0 ? 'muted' : audible < 0.5 ? 'low' : 'high';

  return (
    <div className="well flex items-center gap-3 rounded-2xl p-3 sm:gap-4 sm:px-5 sm:py-4">
      <button
        type="button"
        className="hw-button h-12 w-12"
        onClick={() => stepEpisode(-1)}
        disabled={empty}
        aria-label="Previous episode"
      >
        <PrevIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="hw-button hw-button-primary h-16 w-16 rounded-full"
        onClick={togglePlay}
        disabled={empty}
        aria-label={live ? 'Pause' : status === 'off' ? 'Tune in' : 'Play'}
      >
        {live ? <PauseIcon className="h-7 w-7" /> : <PlayIcon className="h-7 w-7 translate-x-px" />}
      </button>
      <button
        type="button"
        className="hw-button h-12 w-12"
        onClick={() => stepEpisode(1)}
        disabled={empty}
        aria-label="Next episode"
      >
        <NextIcon className="h-5 w-5" />
      </button>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
        <button
          type="button"
          className="hw-button h-11 w-11"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
        >
          <VolumeIcon level={level} className="h-5 w-5" />
        </button>
        <input
          type="range"
          className="slider hidden w-full max-w-32 min-w-0 sm:block"
          min={0}
          max={1}
          step={0.01}
          value={audible}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="Volume"
          aria-valuetext={`${Math.round(audible * 100)}%`}
          style={{ '--fill': `${audible * 100}%` } as CSSProperties}
        />
      </div>
    </div>
  );
}

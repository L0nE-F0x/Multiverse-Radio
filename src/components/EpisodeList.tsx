import { useEffect, useId, useRef, useState } from 'react';
import { formatDate, formatTime } from '../lib/format';
import { currentChannel, useRadio } from '../lib/store';
import { ChevronIcon } from './Icons';

export function EpisodeList() {
  const channel = useRadio(currentChannel);
  const episodeIndex = useRadio((s) => s.episodeIndex);
  const status = useRadio((s) => s.status);
  const selectEpisode = useRadio((s) => s.selectEpisode);
  const [open, setOpen] = useState(true);
  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the current episode visible inside the scrolling log (without scrolling the page).
  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[episodeIndex];
    if (!list || !(row instanceof HTMLElement)) return;
    const top = row.offsetTop; // the list is the offsetParent
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - 8) });
    }
  }, [episodeIndex, channel?.id]);

  if (!channel) return null;
  const count = channel.episodes.length;
  const heading = (
    <>
      <span className="font-mono text-[11px] tracking-[0.26em] text-cream/60 uppercase">Transmission log</span>
      <span className="font-mono text-[11px] text-cream/35 tabular-nums">
        {count} {count === 1 ? 'rec' : 'recs'}
      </span>
    </>
  );

  return (
    <section aria-label={`${channel.name} episodes`} className="well flex flex-col rounded-2xl lg:absolute lg:inset-0">
      <button
        type="button"
        className="flex min-h-12 items-center gap-3 px-4 py-3 text-left md:hidden"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex flex-1 items-center justify-between gap-3">{heading}</span>
        <ChevronIcon className={`h-4 w-4 text-cream/50 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className="hidden items-center justify-between gap-3 px-4 pt-4 pb-3 md:flex">{heading}</div>
      <div className="engraved-rule mx-4" />

      {count === 0 ? (
        <p className={`px-4 py-6 text-sm text-cream/50 ${open ? '' : 'hidden md:block'}`}>
          No transmissions received on this frequency yet.
        </p>
      ) : (
        <ol
          ref={listRef}
          id={listId}
          className={`thin-scrollbar relative min-h-0 flex-1 space-y-1 overflow-y-auto p-2 ${open ? '' : 'hidden md:block'}`}
        >
          {channel.episodes.map((episode, i) => {
            const active = i === episodeIndex;
            return (
              <li key={episode.id}>
                <button
                  type="button"
                  onClick={() => selectEpisode(i)}
                  aria-current={active ? 'true' : undefined}
                  data-active={active}
                  className="episode-row group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left"
                >
                  <span className="mt-0.5 w-5 flex-none font-mono text-[11px] text-cream/35 tabular-nums group-data-[active=true]:text-(--accent)">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug font-medium text-cream/85 group-hover:text-cream group-data-[active=true]:text-cream">
                      {episode.title}
                    </span>
                    {episode.description && (
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-cream/50">
                        {episode.description}
                      </span>
                    )}
                    {episode.publishedAt && (
                      <span className="mt-1.5 block font-mono text-[10px] tracking-[0.16em] text-cream/30 uppercase">
                        Rcvd {formatDate(episode.publishedAt)}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-none flex-col items-end gap-2.5 pt-0.5">
                    <span className="font-mono text-xs text-cream/50 tabular-nums">
                      {episode.loop ? '∞' : episode.durationSeconds > 0 ? formatTime(episode.durationSeconds) : '–:––'}
                    </span>
                    {active && (
                      <span className="eq-bars" data-paused={status !== 'playing'} aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

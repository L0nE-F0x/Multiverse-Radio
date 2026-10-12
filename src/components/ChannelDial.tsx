import { useEffect, useRef, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { engine } from '../lib/audio';
import { channelFrequency } from '../lib/channels';
import { currentChannelIndex, useRadio, type Status } from '../lib/store';
import { ChannelKnob } from './ChannelKnob';
import { ChannelGlyph } from './Icons';

export function ChannelDial() {
  const channels = useRadio((s) => s.channels);
  const activeIndex = useRadio(currentChannelIndex);
  const status = useRadio((s) => s.status);
  const selectChannel = useRadio((s) => s.selectChannel);
  const select = (index: number) => {
    const channel = channels[index];
    if (channel) selectChannel(channel.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="well hidden flex-col items-center rounded-2xl px-3 pt-2 pb-3 md:flex">
        <ChannelKnob
          channels={channels}
          activeIndex={activeIndex}
          onSelect={select}
          onGrab={() => engine.unlock()}
          onTick={() => {
            engine.click(0.45);
            navigator.vibrate?.(4);
          }}
        />
        <p className="engraved -mt-1 font-mono text-[10px] tracking-[0.32em] uppercase">Band selector</p>
      </div>
      <ChannelList activeIndex={activeIndex} status={status} onSelect={select} />
    </div>
  );
}

function ChannelList({
  activeIndex,
  status,
  onSelect,
}: {
  activeIndex: number;
  status: Status;
  onSelect: (index: number) => void;
}) {
  const channels = useRadio((s) => s.channels);
  const reducedMotion = usePrefersReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  // On narrow screens the list is a horizontal strip; keep the active card in view.
  useEffect(() => {
    const list = listRef.current;
    const card = list?.children[activeIndex];
    if (!list || !(card instanceof HTMLElement) || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({
      left: card.offsetLeft - (list.clientWidth - card.offsetWidth) / 2,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeIndex, reducedMotion]);

  return (
    <div
      ref={listRef}
      role="group"
      aria-label="Channels"
      className="no-scrollbar relative -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-4 px-4 py-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:py-0"
    >
      {channels.map((channel, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={channel.id}
            type="button"
            aria-pressed={active}
            data-active={active}
            onClick={() => onSelect(i)}
            title={channel.tagline}
            className="channel-card group flex w-[248px] flex-none snap-start items-center gap-3 rounded-xl px-3 py-2.5 text-left md:w-full"
            style={{ '--ch': channel.color } as CSSProperties}
          >
            <span className="channel-glyph grid h-9 w-9 flex-none place-items-center rounded-lg">
              <ChannelGlyph index={i} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[1.3rem] leading-none md:text-[1.4rem] tracking-[0.03em] text-cream/80 transition-colors group-hover:text-cream group-data-[active=true]:text-cream">
                {channel.name}
              </span>
              <span className="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap text-cream/40">
                <span className="tabular-nums">{channelFrequency(i)} MHz</span>
                {active && <OnAirTag status={status} />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OnAirTag({ status }: { status: Status }) {
  return (
    <span className="on-air" data-live={status === 'playing'} data-blink={status === 'tuning'}>
      On air
    </span>
  );
}

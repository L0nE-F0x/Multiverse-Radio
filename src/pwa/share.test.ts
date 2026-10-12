import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_STATIONS, STATIONS } from '../stations/roster';
import { shareStation, stationShareData, stationShareUrl } from './share';

const voidBeats = STATIONS.find((s) => s.id === 'void-beats')!;
const secret = STATIONS.find((s) => s.secret)!;

function stubNavigator(nav: Partial<Navigator>) {
  vi.stubGlobal('navigator', nav);
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://radio.example', href: 'https://radio.example/' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stationShareUrl', () => {
  it('links main stations to their share page', () => {
    expect(stationShareUrl(voidBeats)).toBe('https://radio.example/station/void-beats/');
    for (const station of MAIN_STATIONS) {
      expect(stationShareUrl(station)).toBe(`https://radio.example/station/${station.id}/`);
    }
  });

  it('links secret stations and pirates to the app instead (they have no page)', () => {
    expect(stationShareUrl(secret)).toBe(`https://radio.example/?station=${secret.id}`);
    const pirate = { ...voidBeats, id: 'pirate-93.25', name: 'Radio Somewhere' };
    expect(stationShareUrl(pirate)).toBe('https://radio.example/?station=pirate-93.25');
  });
});

describe('stationShareData', () => {
  it('has a title, a line of text with the frequency, and the link', () => {
    expect(stationShareData(voidBeats)).toEqual({
      title: 'Void Beats · Multiverse Radio',
      text: `Void Beats, 88.4 MHz: ${voidBeats.tagline}`,
      url: 'https://radio.example/station/void-beats/',
    });
  });
});

describe('shareStation', () => {
  it('uses the Web Share API when there is one', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    stubNavigator({ share, canShare: () => true, clipboard: { writeText } as unknown as Clipboard });
    expect(await shareStation(voidBeats)).toBe('shared');
    expect(share).toHaveBeenCalledWith(stationShareData(voidBeats));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports a dismissed share sheet as cancelled', async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    });
    stubNavigator({ share });
    expect(await shareStation(voidBeats)).toBe('cancelled');
  });

  it('copies the link when sharing fails or is missing', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    const clipboard = { writeText } as unknown as Clipboard;
    const share = vi.fn(async () => {
      throw Object.assign(new Error('No user activation'), { name: 'NotAllowedError' });
    });

    stubNavigator({ share, clipboard });
    expect(await shareStation(voidBeats)).toBe('copied');
    stubNavigator({ share, canShare: () => false, clipboard });
    expect(await shareStation(voidBeats)).toBe('copied');
    stubNavigator({ clipboard });
    expect(await shareStation(voidBeats)).toBe('copied');

    expect(share).toHaveBeenCalledTimes(1); // canShare said no the second time
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(writeText).toHaveBeenLastCalledWith('https://radio.example/station/void-beats/');
  });

  it('is unavailable when neither sharing nor copying works', async () => {
    stubNavigator({
      clipboard: {
        writeText: async () => {
          throw new Error('denied');
        },
      } as unknown as Clipboard,
    });
    expect(await shareStation(voidBeats)).toBe('unavailable');
    stubNavigator({});
    expect(await shareStation(voidBeats)).toBe('unavailable');
  });
});

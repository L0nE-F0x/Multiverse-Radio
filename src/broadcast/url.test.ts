import { describe, expect, it } from 'vitest';
import { stationById } from '../stations/roster';
import { oddities, pirates, receptionAt } from './dial';
import { initialFrequency, stationFromPath, urlFor } from './url';

const start = (search: string, pathname = '/', saved: { station?: string; frequency?: number } = {}) =>
  initialFrequency({
    search,
    pathname,
    base: '/',
    savedStation: saved.station ?? null,
    savedFrequency: saved.frequency ?? null,
    defaultStation: 'void-beats',
  });

describe('deep links', () => {
  it('reads the share-page path', () => {
    expect(stationFromPath('/station/moon-dub/')).toBe('moon-dub');
    expect(stationFromPath('/station/moon-dub')).toBe('moon-dub');
    expect(stationFromPath('/station/moon-dub/index.html')).toBe('moon-dub');
    expect(stationFromPath('/radio/station/moon-dub/', '/radio/')).toBe('moon-dub');
    expect(stationFromPath('/lab/director.html')).toBeNull();
    expect(stationFromPath('/')).toBeNull();
  });

  it('starts the dial from ?f=, the path, ?station=, the last visit, then the default', () => {
    expect(start('?f=113.27')).toBe(113.27);
    expect(start('?f=999')).toBe(160);
    expect(start('', '/station/moon-dub/')).toBe(stationById('moon-dub')!.frequency);
    expect(start('?station=whalesong')).toBe(stationById('whalesong')!.frequency);
    expect(start('?station=hush-after-hours')).toBe(99.15);
    const pirate = pirates()[3]!;
    expect(start(`?station=${pirate.id}`)).toBe(pirate.frequency);
    expect(start('?station=nonsense')).toBe(stationById('void-beats')!.frequency);
    expect(start('', '/', { station: 'moon-dub', frequency: 98.72 })).toBe(98.72);
    expect(start('', '/', { station: 'moon-dub' })).toBe(stationById('moon-dub')!.frequency);
    // A saved position that now lands on another station: the saved station wins.
    expect(start('', '/', { station: 'moon-dub', frequency: stationById('whalesong')!.frequency })).toBe(
      stationById('moon-dub')!.frequency,
    );
    expect(start('', '/', { frequency: 130.11 })).toBe(130.11);
    expect(start('')).toBe(stationById('void-beats')!.frequency);
  });

  it('writes /station/<id>/ for main stations and a query for everything else', () => {
    const at = (f: number, href = 'https://x.test/?station=void-beats&debug=1') =>
      urlFor(new URL(href), receptionAt(f).tuned, f, '/');
    const main = at(stationById('moon-dub')!.frequency);
    expect(main.pathname).toBe('/station/moon-dub/');
    expect(main.search).toBe('?debug=1');
    expect(at(99.15).pathname).toBe('/');
    expect(at(99.15).searchParams.get('station')).toBe('hush-after-hours');
    const pirate = pirates()[5]!;
    expect(at(pirate.frequency + 0.01, 'https://x.test/station/moon-dub/').href).toBe(`https://x.test/?f=${pirate.frequency.toFixed(2)}`);
    const oddity = oddities()[0]!;
    expect(at(oddity.frequency).searchParams.get('f')).toBe(oddity.frequency.toFixed(2));
    expect(at(88.62).search).toBe('?debug=1&f=88.62');
    // Never /station/x/?station=y.
    const back = at(stationById('whalesong')!.frequency, 'https://x.test/station/moon-dub/?station=moon-dub');
    expect(back.href).toBe('https://x.test/station/whalesong/');
    // Labs keep their own path.
    expect(at(stationById('moon-dub')!.frequency, 'https://x.test/lab/director.html').href).toBe(
      'https://x.test/lab/director.html?station=moon-dub',
    );
  });
});

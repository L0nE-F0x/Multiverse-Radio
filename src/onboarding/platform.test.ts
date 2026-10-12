import { describe, expect, it } from 'vitest';
import {
  canInstallOn,
  deepLinkStationId,
  detectPlatform,
  formatMhz,
  iosBrowser,
  iosVersion,
  safariVersion,
  type PlatformEnv,
} from './platform';

const UA = {
  iphoneSafari17:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneSafari26:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneChrome17:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneChrome16_3:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.5481.83 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/124.0.2478.89 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.12.235 (iPhone15,3; iOS 17_4; en_US)',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  desktopChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  desktopFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
};

const env = (userAgent: string, extra: Partial<PlatformEnv> = {}): PlatformEnv => ({ userAgent, maxTouchPoints: 0, ...extra });

describe('detectPlatform', () => {
  it('reports the installed app as installed, whatever the browser', () => {
    expect(detectPlatform(env(UA.iphoneSafari17, { standalone: true }))).toBe('installed');
    expect(detectPlatform(env(UA.androidChrome, { standalone: true, hasPrompt: true }))).toBe('installed');
    expect(detectPlatform(env(UA.desktopChrome, { installed: true }))).toBe('installed');
  });

  it('gives iOS Safari the Add to Home Screen steps', () => {
    expect(detectPlatform(env(UA.iphoneSafari17, { maxTouchPoints: 5 }))).toBe('ios');
    expect(detectPlatform(env(UA.iphoneSafari26, { maxTouchPoints: 5 }))).toBe('ios');
    expect(detectPlatform(env(UA.ipadSafari, { maxTouchPoints: 5 }))).toBe('ios');
  });

  it('spots iPadOS asking for the desktop site', () => {
    expect(detectPlatform(env(UA.ipadDesktopMode, { maxTouchPoints: 5 }))).toBe('ios');
    expect(detectPlatform(env(UA.macSafari, { maxTouchPoints: 0 }))).toBe('unsupported');
  });

  it('gives other iOS browsers the steps from iOS 16.4 on', () => {
    expect(detectPlatform(env(UA.iphoneChrome17))).toBe('ios');
    expect(detectPlatform(env(UA.iphoneFirefox))).toBe('ios');
    expect(detectPlatform(env(UA.iphoneEdge))).toBe('ios');
    expect(detectPlatform(env(UA.iphoneChrome16_3))).toBe('unsupported');
  });

  it('leaves in-app browsers alone', () => {
    expect(detectPlatform(env(UA.iphoneInstagram))).toBe('unsupported');
    expect(detectPlatform(env(UA.iphoneWebView))).toBe('unsupported');
    expect(detectPlatform(env(UA.androidWebView))).toBe('unsupported');
  });

  it('uses the native prompt on Android and desktop Chromium', () => {
    expect(detectPlatform(env(UA.androidChrome, { hasPrompt: true }))).toBe('android');
    expect(detectPlatform(env(UA.androidSamsung, { hasPrompt: true }))).toBe('android');
    expect(detectPlatform(env(UA.desktopChrome, { hasPrompt: true }))).toBe('desktop');
    expect(detectPlatform(env(UA.desktopEdge, { hasPrompt: true }))).toBe('desktop');
  });

  it('knows Chromium can install before the prompt arrives', () => {
    expect(detectPlatform(env(UA.androidChrome))).toBe('android');
    expect(detectPlatform(env(UA.desktopChrome))).toBe('desktop');
  });

  it('calls Firefox and desktop Safari unsupported', () => {
    expect(detectPlatform(env(UA.desktopFirefox))).toBe('unsupported');
    expect(detectPlatform(env(UA.androidFirefox))).toBe('unsupported');
    expect(detectPlatform(env(UA.macSafari))).toBe('unsupported');
  });
});

describe('canInstallOn', () => {
  it('needs a captured prompt except on iOS', () => {
    expect(canInstallOn('ios', false)).toBe(true);
    expect(canInstallOn('android', false)).toBe(false);
    expect(canInstallOn('android', true)).toBe(true);
    expect(canInstallOn('desktop', true)).toBe(true);
    expect(canInstallOn('installed', true)).toBe(false);
    expect(canInstallOn('unsupported', true)).toBe(false);
  });
});

describe('user agent details', () => {
  it('names the iOS browser', () => {
    expect(iosBrowser(UA.iphoneSafari17)).toBe('safari');
    expect(iosBrowser(UA.iphoneChrome17)).toBe('chrome');
    expect(iosBrowser(UA.iphoneFirefox)).toBe('firefox');
    expect(iosBrowser(UA.iphoneEdge)).toBe('edge');
  });

  it('reads iOS and Safari versions', () => {
    expect(iosVersion(UA.iphoneSafari17)).toBe(1704);
    expect(iosVersion(UA.ipadSafari)).toBe(1606);
    expect(iosVersion(UA.ipadDesktopMode)).toBeNull();
    expect(safariVersion(UA.iphoneSafari26)).toBe(26);
  });
});

describe('deepLinkStationId', () => {
  it('reads ?station= and the share page path', () => {
    expect(deepLinkStationId('?station=void-beats', '/')).toBe('void-beats');
    expect(deepLinkStationId('', '/station/cat-fm/')).toBe('cat-fm');
    expect(deepLinkStationId('', '/station/cat-fm')).toBe('cat-fm');
    expect(deepLinkStationId('', '/station/cat-fm/index.html')).toBe('cat-fm');
    expect(deepLinkStationId('?station=plant-fm', '/station/cat-fm/')).toBe('plant-fm');
  });

  it('ignores everything else', () => {
    expect(deepLinkStationId('', '/')).toBeNull();
    expect(deepLinkStationId('?output=element', '/lab/onboarding.html')).toBeNull();
    expect(deepLinkStationId('', '/station/')).toBeNull();
    expect(deepLinkStationId('', '/station/cat-fm/extra')).toBeNull();
  });
});

describe('formatMhz', () => {
  it('shows one decimal unless the station needs two', () => {
    expect(formatMhz(88.4)).toBe('88.4');
    expect(formatMhz(76)).toBe('76.0');
    expect(formatMhz(99.15)).toBe('99.15');
  });
});

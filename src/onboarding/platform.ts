// Install-platform detection and deep-link parsing. Pure functions over plain strings, so
// they are unit-tested without a browser (platform.test.ts).

export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'installed' | 'unsupported';

/** Which iOS browser is showing the page (they hide the Share button in different places). */
export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';

export interface PlatformEnv {
  userAgent: string;
  /** navigator.maxTouchPoints: iPadOS asks for desktop sites with a Mac user agent. */
  maxTouchPoints?: number;
  /** Running as the installed app (display-mode: standalone, or iOS navigator.standalone). */
  standalone?: boolean;
  /** A `beforeinstallprompt` event has been captured and not used yet. */
  hasPrompt?: boolean;
  /** The app was installed during this visit (`appinstalled`, or an accepted prompt). */
  installed?: boolean;
}

/** In-app browsers (social apps, the Google app): no Add to Home Screen, no install prompt. */
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|Bytedance|Pinterest|GSA\/|MicroMessenger|KAKAOTALK/i;

export function isIos(env: Pick<PlatformEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  // iPadOS 13+ asks for desktop sites with a Mac user agent; Macs have no touch screen.
  return /Macintosh/.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1;
}

export function iosBrowser(userAgent: string): IosBrowser {
  if (/CriOS\//.test(userAgent)) return 'chrome';
  if (/FxiOS\//.test(userAgent)) return 'firefox';
  if (/EdgiOS\//.test(userAgent)) return 'edge';
  if (/OPiOS|OPT\/|YaBrowser|DuckDuckGo|Ddg\/|Brave|Focus\/|Vivaldi|UCBrowser|Mercury/i.test(userAgent)) return 'other';
  return 'safari';
}

/**
 * iOS version as major * 100 + minor (17.4 → 1704), from "CPU iPhone OS 17_4 like Mac OS X".
 * Null for iPadOS desktop-mode user agents, which don't say. (Since iOS 26 the number is
 * frozen at 18.6, which is still enough to tell "16.4 or later".)
 */
export function iosVersion(userAgent: string): number | null {
  const match = /\bOS (\d+)_(\d+)(?:_\d+)? like Mac OS X/.exec(userAgent);
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

/** Safari's own version ("Version/26.0"), which keeps moving after the OS number froze. */
export function safariVersion(userAgent: string): number | null {
  const match = /Version\/(\d+)/.exec(userAgent);
  return match ? Number(match[1]) : null;
}

export function detectPlatform(env: PlatformEnv): InstallPlatform {
  if (env.standalone || env.installed) return 'installed';
  const ua = env.userAgent;

  if (isIos(env)) {
    // In-app web views have no Safari token and no Add to Home Screen.
    if (IN_APP.test(ua) || !/Safari\//.test(ua)) return 'unsupported';
    if (iosBrowser(ua) === 'safari') return 'ios';
    // Chrome, Firefox, Edge and friends gained Add to Home Screen (Share menu) in iOS 16.4.
    const version = iosVersion(ua);
    return version === null || version >= 1604 ? 'ios' : 'unsupported';
  }

  const android = /Android/i.test(ua);
  if (env.hasPrompt) return android || /Mobi/i.test(ua) ? 'android' : 'desktop';
  if (IN_APP.test(ua) || /; wv\)/.test(ua)) return 'unsupported';
  // Chromium (Chrome, Edge, Opera, Samsung Internet, Brave…) installs; it just hasn't offered yet.
  if (!/Chrome\/|Chromium\//.test(ua)) return 'unsupported';
  if (android) return 'android';
  return /Mobi/i.test(ua) ? 'unsupported' : 'desktop';
}

/** An install action exists right now: the iOS steps, or a captured native prompt. */
export function canInstallOn(platform: InstallPlatform, hasPrompt: boolean): boolean {
  if (platform === 'ios') return true;
  return (platform === 'android' || platform === 'desktop') && hasPrompt;
}

/** The station a shared link points at: `?station=<id>` or the share page `/station/<id>/`. */
export function deepLinkStationId(search: string, pathname: string): string | null {
  try {
    const fromQuery = new URLSearchParams(search).get('station');
    if (fromQuery) return fromQuery;
  } catch {
    // Malformed query: fall through to the path.
  }
  const match = /^\/station\/([a-z0-9-]+)(?:\/(?:index\.html)?)?$/.exec(pathname);
  return match?.[1] ?? null;
}

/** 88.4 → "88.4"; the secret 99.15 keeps both decimals. */
export function formatMhz(frequency: number): string {
  return Math.abs(frequency * 10 - Math.round(frequency * 10)) < 1e-6 ? frequency.toFixed(1) : frequency.toFixed(2);
}

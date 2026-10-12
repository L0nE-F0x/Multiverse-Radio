// Sharing a station: the Web Share API where available (phones, some desktops), otherwise
// copy the link. Main stations link to their share page (/station/<id>/, prerendered at build
// time with the station's own card and tags, see scripts/share/); anything else (secret
// stations, pirates) links to the app with ?station=<id>.

import type { StationDef } from '../broadcast/types';
import { MAIN_STATIONS } from '../stations/roster';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

const APP = 'Multiverse Radio';

/** 88.4 → "88.4", 91 → "91.0", 88.85 → "88.85" (same as the share pages). */
function formatFrequency(mhz: number): string {
  const fixed = mhz.toFixed(2);
  return fixed.endsWith('0') ? mhz.toFixed(1) : fixed;
}

/** The public link for a station, e.g. https://…/station/void-beats/. */
export function stationShareUrl(station: StationDef): string {
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  const hasPage = !station.secret && MAIN_STATIONS.some((s) => s.id === station.id);
  if (hasPage) return new URL(`station/${encodeURIComponent(station.id)}/`, base).href;
  const url = new URL(base);
  url.searchParams.set('station', station.id);
  return url.href;
}

/** What gets shared: title, a line of text and the link. */
export function stationShareData(station: StationDef): ShareData {
  return {
    title: `${station.name} · ${APP}`,
    text: `${station.name}, ${formatFrequency(station.frequency)} MHz: ${station.tagline}`,
    url: stationShareUrl(station),
  };
}

/**
 * Share (or copy) a link to a station. Call from a user gesture (a click), or browsers refuse.
 * - `shared`: the share sheet completed
 * - `copied`: no share sheet (or it failed), so the link went to the clipboard
 * - `cancelled`: the listener closed the share sheet
 * - `unavailable`: neither sharing nor copying works here; show the link instead
 */
export async function shareStation(station: StationDef): Promise<ShareResult> {
  const data = stationShareData(station);
  const nav: Partial<Navigator> = typeof navigator === 'undefined' ? {} : navigator;

  if (typeof nav.share === 'function' && (nav.canShare?.(data) ?? true)) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (no user activation, permissions policy), DataError, …: copy instead.
    }
  }
  return (await copyText(data.url!)) ? 'copied' : 'unavailable';
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Insecure context, permission denied or no focus: try the old way.
  }
  return legacyCopy(text);
}

/** document.execCommand('copy') from a hidden textarea: still the only option in some browsers. */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.append(area);
  const active = document.activeElement as HTMLElement | null;
  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    active?.focus?.();
  }
}

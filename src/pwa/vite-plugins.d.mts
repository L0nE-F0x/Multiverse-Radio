import type { Plugin } from 'vite';

export interface PwaPluginOptions {
  /**
   * Absolute public URL of the site, e.g. `https://multiverse-radio.example`. Replaces
   * `%SITE_URL%` in HTML. Defaults to the `SITE_URL` env var, then Netlify's `URL`, then
   * `DEFAULT_SITE_URL`. An empty string leaves the social tags relative.
   */
  siteUrl?: string;
  /** Emit `station/<id>/index.html` share pages for the main stations. Default true. */
  stationPages?: boolean;
  /** Emit a service worker that deletes its caches and unregisters itself. */
  killSwitch?: boolean;
}

export interface BundleBudgetOptions {
  /** Warn when the main page's initial JS exceeds this many kB gzip. Default 200. */
  initialJsKb?: number;
  /** Warn when all JS reachable from the main page (incl. lazy chunks) exceeds this. Default 450. */
  totalJsKb?: number;
}

export const DEFAULT_SITE_URL: string;
export function pwa(options?: PwaPluginOptions): Plugin[];
export function bundleBudget(options?: BundleBudgetOptions): Plugin;

import type { Plugin } from 'vite';

export interface PwaPluginOptions {
  /**
   * Absolute public URL of the site, e.g. `https://multiverse-radio.example`. Replaces
   * `%SITE_URL%` in HTML. Defaults to the `SITE_URL` env var, then Netlify's `URL`.
   */
  siteUrl?: string;
  /** Emit a service worker that deletes its caches and unregisters itself. */
  killSwitch?: boolean;
}

export interface BundleBudgetOptions {
  /** Warn when the main page's initial JS exceeds this many kB gzip. Default 200. */
  initialJsKb?: number;
  /** Warn when all JS reachable from the main page (incl. lazy chunks) exceeds this. Default 450. */
  totalJsKb?: number;
}

export function pwa(options?: PwaPluginOptions): Plugin[];
export function bundleBudget(options?: BundleBudgetOptions): Plugin;

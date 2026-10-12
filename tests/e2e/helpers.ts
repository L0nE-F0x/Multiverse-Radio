// Shared helpers for the e2e specs. Selectors stay generic (document.title, landmarks, roles)
// so the tests survive UI redesigns.

import type { Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve-dist.mjs';

export const DIST = fileURLToPath(new URL('../../dist', import.meta.url));

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

/**
 * Start collecting console errors, uncaught exceptions and CSP violations. Call before goto.
 * Returns the live list of problems (console errors include CSP reports).
 */
export async function watchPage(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') problems.push(`console.error: ${text}`);
    // Header mistakes (e.g. an unknown Permissions-Policy feature) are only warnings.
    else if (/Permissions-Policy|Content[- ]Security[- ]Policy/i.test(text)) problems.push(`console.${message.type()}: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations?.push(`${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`);
    });
  });
  return problems;
}

export function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__cspViolations ?? []);
}

/**
 * A private copy of the site on its own port (so its own service worker and caches), with
 * an overlay directory on top of dist/ to simulate new deploys and add test files.
 */
export async function deploy() {
  const overlay = mkdtempSync(path.join(os.tmpdir(), 'mvr-e2e-'));
  const server = await startServer({ roots: [overlay, DIST] });
  return {
    url: server.url,
    setOffline: server.setOffline,
    /** Write a file into the overlay (shadows dist/). */
    write(relative: string, content: string | Buffer) {
      const file = path.join(overlay, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    },
    /** Read a file from dist/. */
    read: (relative: string) => readFileSync(path.join(DIST, relative), 'utf8'),
    async close() {
      await server.close();
      rmSync(overlay, { recursive: true, force: true });
    },
  };
}

/** Register the service worker (idempotent if the app already did) and wait for control. */
export async function installServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

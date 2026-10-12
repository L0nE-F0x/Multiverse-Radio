// Service worker behaviour: offline boot, the offline fallback, clean updates across
// deploys, and the voice-clip cache. Each test gets a private server (own origin, so its own
// worker and caches) with an overlay to simulate deploys.

import { expect, test, type Page } from '@playwright/test';
import { deploy, installServiceWorker } from './helpers';

const shellCaches = (page: Page) =>
  page.evaluate(async () => (await caches.keys()).filter((key) => key.startsWith('mvr-shell-')).sort());

// The worker stores the key as /current; resolve it absolutely, since the page may be on
// /station/<id>/ (where a relative 'current' would miss).
const currentShell = (page: Page) =>
  page.evaluate(async () => (await (await caches.open('mvr-meta')).match(new URL('/current', location.origin).href))?.text() ?? null);

const checkForUpdate = (page: Page) =>
  page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });

test('boots offline from the cached shell; other pages get the offline page', async ({ page }) => {
  const site = await deploy();
  try {
    await page.goto(`${site.url}/`);
    await installServiceWorker(page);

    site.setOffline(true);
    await page.goto(`${site.url}/`);
    await expect(page).toHaveTitle(/Multiverse Radio/);
    await expect(page.getByRole('main')).toBeVisible();

    await page.goto(`${site.url}/lab/music.html`);
    await expect(page).toHaveTitle(/No signal/);
    await expect(page.getByRole('heading', { name: /no signal from this dimension/i })).toBeVisible();
  } finally {
    await site.close();
  }
});

test('a new deploy takes over with no stale shell and no forced reload', async ({ page }) => {
  const site = await deploy();
  try {
    await page.goto(`${site.url}/`);
    await installServiceWorker(page);
    const [first] = await shellCaches(page);
    expect(first).toMatch(/^mvr-shell-[0-9a-f]{12}$/);

    const html = site.read('index.html');
    const sw = site.read('sw.js');
    const redeploy = (build: number) => {
      site.write('index.html', html.replace('<head>', `<head><meta name="mvr-build" content="${build}">`));
      site.write('sw.js', sw.replace(/"version": "([0-9a-f]+)"/, `"version": "$1-${build}"`));
    };

    // Deploy 2. Online visitors get the new shell at once: navigations are network-first.
    redeploy(2);
    // The app rewrites the address to /station/<id>/, so go back to / rather than reload.
    await page.goto(`${site.url}/`);
    await expect(page.locator('meta[name="mvr-build"]')).toHaveAttribute('content', '2');

    // The new worker installs and takes over in the background; the page is not reloaded.
    await page.evaluate(() => Object.assign(window, { __stillHere: true }));
    await checkForUpdate(page);
    await expect.poll(() => currentShell(page)).toBe(`${first}-2`);
    expect(await page.evaluate(() => (window as unknown as { __stillHere?: boolean }).__stillHere)).toBe(true);
    // The previous shell stays one more deploy, for tabs still running the old build.
    expect(await shellCaches(page)).toEqual([first, `${first}-2`]);

    // Offline, the new shell boots.
    site.setOffline(true);
    await page.goto(`${site.url}/`);
    await expect(page.locator('meta[name="mvr-build"]')).toHaveAttribute('content', '2');
    site.setOffline(false);

    // Deploy 3 retires the first shell.
    redeploy(3);
    await checkForUpdate(page);
    await expect.poll(() => currentShell(page)).toBe(`${first}-3`);
    expect(await shellCaches(page)).toEqual([`${first}-2`, `${first}-3`]);
  } finally {
    await site.close();
  }
});

test('voice clips: capped runtime cache, ranges pass through, manifests work offline', async ({ page }) => {
  const site = await deploy();
  try {
    const clips = 70;
    for (let i = 0; i < clips; i++) site.write(`voice/probe/clip-${i}.mp3`, Buffer.alloc(4096, i));
    site.write('voice/probe.json', JSON.stringify({ station: 'probe' }));

    await page.goto(`${site.url}/`);
    await installServiceWorker(page);
    await page.evaluate(async (count) => {
      for (let i = 0; i < count; i++) await (await fetch(`/voice/probe/clip-${i}.mp3`)).arrayBuffer();
      await (await fetch('/voice/probe.json')).json();
    }, clips);

    const voiceEntries = () =>
      page.evaluate(async () => (await (await caches.open('mvr-voice')).keys()).map((r) => new URL(r.url).pathname));
    await expect.poll(async () => (await voiceEntries()).length).toBe(60);
    expect(await voiceEntries()).toContain(`/voice/probe/clip-${clips - 1}.mp3`);
    expect(await voiceEntries()).not.toContain('/voice/probe/clip-0.mp3');

    // Range requests (from <audio> elements) skip the cache and reach the server.
    const ranged = await page.evaluate(async () => {
      const res = await fetch('/voice/probe/clip-1.mp3', { headers: { range: 'bytes=0-99' } });
      return { status: res.status, length: (await res.arrayBuffer()).byteLength };
    });
    expect(ranged).toEqual({ status: 206, length: 100 });

    site.setOffline(true);
    const offline = await page.evaluate(async (last) => {
      const manifest = await (await fetch('/voice/probe.json')).json();
      const clip = await fetch(`/voice/probe/clip-${last}.mp3`);
      return { manifest, clip: clip.status };
    }, clips - 1);
    expect(offline).toEqual({ manifest: { station: 'probe' }, clip: 200 });
  } finally {
    await site.close();
  }
});

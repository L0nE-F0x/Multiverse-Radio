// Flight-mode packs: stow a pack against a fixture voice index, lose the network, and check
// that stowed stations keep their voices while un-stowed ones fall back to music only.
// The panel is opened from the offline lab (/lab/offline.html), the same lazy chunk the
// console loads.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deploy, DIST, installServiceWorker } from './helpers';

const LISTEN_TIME_KEY = 'multiverse-radio:listen-time';
const POOLS = ['_shared', '_ship', '_events', '_pirate', '_oddities'];
// Two favourites, then the popular fill: void-beats, rainfall-fm, every-news, end-lounge,
// neon-2087, ask-grenda make the essentials. moon-dub and hold-music stay ashore.
const STATIONS = ['void-beats', 'rainfall-fm', 'every-news', 'end-lounge', 'neon-2087', 'ask-grenda', 'hold-music', 'moon-dub'];
const STOWED = STATIONS.slice(0, 6);

type Site = Awaited<ReturnType<typeof deploy>>;

/** A small voice library in the overlay: two real clips per manifest, and its index. */
function writeFixtures(site: Site) {
  const clip = readFileSync(path.join(DIST, 'voice/_oddities/time-signal-002.mp3'));
  const entries: Record<string, { clips: number; bytes: number; version: string }> = {};
  for (const key of [...POOLS, ...STATIONS]) {
    const clips = ['fx-1', 'fx-2'].map((id) => ({
      id,
      category: key.startsWith('_') ? 'ad' : 'dj',
      url: `/voice/${key}/${id}.mp3`,
      durationMs: 2000,
      lines: [{ speaker: 'Test', text: `${key} ${id}`, startMs: 0 }],
    }));
    const manifest = JSON.stringify({ version: 1, station: key, clips });
    site.write(`voice/${key}.json`, manifest);
    for (const c of clips) site.write(c.url.slice(1), clip);
    entries[key] = { clips: 2, bytes: clip.length * 2 + manifest.length, version: 'fx1' };
  }
  const shows = JSON.stringify({ version: 1, shows: {} });
  site.write('voice/_shows.json', shows);
  entries._shows = { clips: 0, bytes: shows.length, version: 'fx1' };
  site.write('voice/_index.json', JSON.stringify({ version: 1, entries }));
  return { clipBytes: clip.length };
}

const fetchStatus = (page: Page, url: string) =>
  page.evaluate(async (u) => {
    try {
      const res = await fetch(u);
      return { status: res.status, bytes: (await res.arrayBuffer()).byteLength };
    } catch {
      return { status: 0, bytes: 0 };
    }
  }, url);

test('stowed stations keep their voices offline; the rest play music only', async ({ page }) => {
  test.setTimeout(60_000);
  const site = await deploy();
  try {
    const { clipBytes } = writeFixtures(site);
    await page.addInitScript(
      ([key]) => {
        localStorage.setItem('multiverse-radio:welcomed', 'e2e');
        if (!localStorage.getItem(key!)) localStorage.setItem(key!, JSON.stringify({ 'rainfall-fm': 90_000, 'void-beats': 120_000 }));
      },
      [LISTEN_TIME_KEY],
    );
    await page.goto(`${site.url}/`);
    await installServiceWorker(page);

    // Stow the essentials from the panel.
    await page.goto(`${site.url}/lab/offline.html`);
    await page.getByRole('button', { name: /prepare for dead space/i }).click();
    const panel = page.getByRole('dialog', { name: /prepare for dead space/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('radio', { name: /essentials/i })).toBeChecked();
    await expect(panel.locator('[data-pack="essentials"]')).toContainText(/~\d+(\.\d)? (KB|MB) · HUSH \+ 6 stations/);
    await expect(panel.locator('[data-pack="everything"]')).toContainText('HUSH + all 8 stations');
    await panel.getByRole('button', { name: /stow cargo/i }).click();
    await expect(panel.getByTestId('cargo-stowed')).toContainText('6 stations stowed');
    await expect(panel.locator('[data-pack="essentials"]')).toContainText('Stowed');
    await expect(panel.getByRole('button', { name: /stow cargo/i })).toBeDisabled();

    const packed = await page.evaluate(async () =>
      (await (await caches.open('mvr-packs')).keys()).map((r) => new URL(r.url).pathname).sort(),
    );
    for (const key of [...POOLS, ...STOWED]) {
      expect(packed).toContain(`/voice/${key}.json`);
      expect(packed).toContain(`/voice/${key}/fx-2.mp3`);
    }
    expect(packed).toContain('/voice/_shows.json');
    expect(packed.some((p) => p.startsWith('/voice/moon-dub'))).toBe(false);

    // Esc closes it.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    // Dead space.
    site.setOffline(true);
    await page.goto(`${site.url}/`);
    await expect(page.getByRole('main')).toBeVisible();

    const manifest = await page.evaluate(async () => (await (await fetch('/voice/void-beats.json')).json()) as { station: string; clips: unknown[] });
    expect(manifest).toMatchObject({ station: 'void-beats' });
    expect(manifest.clips).toHaveLength(2);
    // rainfall-fm was never tuned, so this can only come from the pack.
    expect(await page.evaluate(async () => (await (await fetch('/voice/rainfall-fm.json')).json()).station)).toBe('rainfall-fm');
    expect(await fetchStatus(page, '/voice/void-beats/fx-1.mp3')).toEqual({ status: 200, bytes: clipBytes });
    expect(await fetchStatus(page, '/voice/_ship/fx-1.mp3')).toEqual({ status: 200, bytes: clipBytes });
    // <audio>-style ranges come out of the pack too.
    const ranged = await page.evaluate(async () => {
      const res = await fetch('/voice/neon-2087/fx-1.mp3', { headers: { range: 'bytes=10-109' } });
      return { status: res.status, length: (await res.arrayBuffer()).byteLength, range: res.headers.get('content-range') };
    });
    expect(ranged).toMatchObject({ status: 206, length: 100 });
    // Nothing stowed for moon-dub: no voice.
    expect((await fetchStatus(page, '/voice/moon-dub.json')).status).not.toBe(200);
    expect((await fetchStatus(page, '/voice/moon-dub/fx-1.mp3')).status).not.toBe(200);

    // The un-stowed station still plays: music only.
    await page.goto(`${site.url}/station/moon-dub/`);
    await expect(page.getByRole('main')).toBeVisible();
    await page.getByRole('button', { name: /play|tune in|listen|power|switch on|start/i }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.status), { timeout: 15_000 }).toBe('playing');

    // Back online, the panel still reads the hold, and REMOVE ALL empties it.
    site.setOffline(false);
    await page.goto(`${site.url}/lab/offline.html?open=1`);
    await expect(panel.getByTestId('cargo-stowed')).toContainText('6 stations stowed');
    await panel.getByRole('button', { name: /^remove all$/i }).click();
    await panel.getByRole('button', { name: /^remove all$/i }).click();
    await expect(panel.getByTestId('cargo-stowed')).toContainText('0 stations stowed');
  } finally {
    await site.close();
  }
});

test('a changed station is flagged as updated and refreshed in place', async ({ page }) => {
  const site = await deploy();
  try {
    writeFixtures(site);
    await page.goto(`${site.url}/`);
    await installServiceWorker(page);
    await page.goto(`${site.url}/lab/offline.html?open=1`);
    const panel = page.getByRole('dialog', { name: /prepare for dead space/i });
    await panel.getByRole('button', { name: /stow cargo/i }).click();
    await expect(panel.getByTestId('cargo-stowed')).toContainText('6 stations stowed');

    // A new deploy re-renders void-beats.
    const current = await page.evaluate(async () => (await fetch('/voice/_index.json', { cache: 'no-store' })).json());
    current.entries['void-beats'].version = 'fx2';
    site.write('voice/_index.json', JSON.stringify(current));

    await page.reload();
    await expect(panel.getByText(/1 entry updated since stowed/)).toBeVisible();
    await panel.getByRole('button', { name: /^refresh$/i }).click();
    await expect(panel.getByText(/updated since stowed/)).toBeHidden();
    const version = await page.evaluate(async () => (await (await caches.open('mvr-packs')).match('/voice/void-beats.json'))?.headers.get('x-mvr-pack-version'));
    expect(version).toBe('fx2');
  } finally {
    await site.close();
  }
});

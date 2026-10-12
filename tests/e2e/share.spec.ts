// Sharing: the per-station share pages (/station/<id>/) the build prerenders, their social
// tags and card images, and that they boot the app. Served like Netlify by serve-dist.mjs.

import { expect, test, type APIRequestContext } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MAIN_STATIONS, STATIONS } from '../../src/stations/roster';
import { cspViolations, deploy, DIST, installServiceWorker, watchPage } from './helpers';

const SECRET_STATIONS = STATIONS.filter((s) => s.secret);

/** The content/href of a <meta>/<link> tag, entities decoded. */
function tag(html: string, attr: 'name' | 'property' | 'rel', value: string): string | undefined {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<(?:meta|link)\\b[^>]*\\b${attr}="${escaped}"[^>]*\\b(?:content|href)="([^"]*)"`).exec(html);
  return match ? decode(match[1]!) : undefined;
}

function title(html: string): string | undefined {
  const match = /<title>([^<]*)<\/title>/.exec(html);
  return match ? decode(match[1]!) : undefined;
}

function decode(text: string): string {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.toString('latin1', 1, 4) !== 'PNG') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The absolute site URL the build used (from the home page's og:url). */
async function siteUrl(request: APIRequestContext): Promise<string> {
  const home = await (await request.get('/')).text();
  const url = tag(home, 'property', 'og:url');
  expect(url, 'home page og:url').toMatch(/^https?:\/\/[^/]+\/$/);
  return url!.replace(/\/$/, '');
}

test('every main station has a share page with its own tags and card', async ({ request }) => {
  const site = await siteUrl(request);
  const homeHtml = await (await request.get('/')).text();
  const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(homeHtml)?.[1];
  expect(entry, 'entry script on the home page').toBeTruthy();

  for (const station of MAIN_STATIONS) {
    const pagePath = `/station/${station.id}/`;
    const response = await request.get(pagePath);
    expect(response.status(), pagePath).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
    const html = await response.text();

    // Same app: same entry script, no unreplaced placeholders.
    expect(html).toContain(`src="${entry}"`);
    expect(html).not.toContain('%SITE_URL%');

    const pageUrl = `${site}${pagePath}`;
    const card = `${site}/share/${station.id}.jpg`;
    expect(title(html), pagePath).toContain(station.name);
    expect(title(html)).toContain('Multiverse Radio');
    expect(tag(html, 'name', 'description')).toContain(station.tagline);
    expect(tag(html, 'rel', 'canonical')).toBe(pageUrl);
    expect(tag(html, 'property', 'og:url')).toBe(pageUrl);
    expect(tag(html, 'property', 'og:type')).toBe('website');
    expect(tag(html, 'property', 'og:site_name')).toBe('Multiverse Radio');
    expect(tag(html, 'property', 'og:title')).toContain(station.name);
    expect(tag(html, 'property', 'og:description')).toContain(station.tagline);
    expect(tag(html, 'property', 'og:image'), `${pagePath} og:image`).toBe(card);
    expect(tag(html, 'property', 'og:image:type')).toBe('image/jpeg');
    expect(tag(html, 'property', 'og:image:width')).toBe('1200');
    expect(tag(html, 'property', 'og:image:height')).toBe('630');
    expect(tag(html, 'property', 'og:image:alt')).toContain(station.name);
    expect(tag(html, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(tag(html, 'name', 'twitter:title')).toContain(station.name);
    expect(tag(html, 'name', 'twitter:description')).toContain(station.tagline);
    expect(tag(html, 'name', 'twitter:image')).toBe(card);
    expect(tag(html, 'name', 'twitter:image:alt')).toContain(station.name);

    // The card itself, fetched from this server at the same path.
    const image = await request.get(new URL(card).pathname);
    expect(image.status(), card).toBe(200);
    expect(image.headers()['content-type']).toBe('image/jpeg');
    expect(image.headers()['cache-control']).toBe('public, max-age=86400, stale-while-revalidate=604800');
    const bytes = await image.body();
    expect(jpegSize(bytes), card).toEqual({ width: 1200, height: 630 });
    expect(bytes.length, `${card} size`).toBeGreaterThan(20_000);
    expect(bytes.length, `${card} size`).toBeLessThan(200_000);
  }
});

test('the default card is absolute and 1200×630', async ({ request }) => {
  const site = await siteUrl(request);
  const html = await (await request.get('/')).text();
  expect(tag(html, 'property', 'og:image')).toBe(`${site}/og-image.png`);
  expect(tag(html, 'name', 'twitter:image')).toBe(`${site}/og-image.png`);
  expect(tag(html, 'rel', 'canonical')).toBe(`${site}/`);
  expect(tag(html, 'name', 'description')).toMatch(/night shift/i);
  const image = await request.get('/og-image.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['cache-control']).toBe('public, max-age=86400, stale-while-revalidate=604800');
  expect(pngSize(await image.body())).toEqual({ width: 1200, height: 630 });
});

test('secret stations and unknown station paths are 404s', async ({ request }) => {
  expect(SECRET_STATIONS.length).toBeGreaterThan(0);
  const paths = [
    ...SECRET_STATIONS.map((s) => `/station/${s.id}/`),
    '/station/no-such-station/',
    '/station/no-such-station',
    '/station/',
  ];
  for (const pagePath of paths) {
    const response = await request.get(pagePath);
    expect(response.status(), pagePath).toBe(404);
    expect(await response.text()).toContain('Multiverse Radio');
  }
  for (const station of SECRET_STATIONS) {
    expect(existsSync(path.join(DIST, 'station', station.id)), station.id).toBe(false);
  }
});

test('station paths without the trailing slash redirect to the page', async ({ request }) => {
  const station = MAIN_STATIONS[0]!;
  const response = await request.get(`/station/${station.id}`, { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()['location']).toBe(`/station/${station.id}/`);
  const followed = await request.get(`/station/${station.id}`);
  expect(followed.status()).toBe(200);
  expect(title(await followed.text())).toContain(station.name);
});

test('the app boots from a station page without errors', async ({ page }) => {
  const station = MAIN_STATIONS.find((s) => s.id !== 'void-beats') ?? MAIN_STATIONS[0]!;
  const problems = await watchPage(page);
  const response = await page.goto(`/station/${station.id}/`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Multiverse Radio/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button').first()).toBeVisible();
  // Root-absolute assets resolved from the nested path: the stylesheet applied.
  expect(await page.evaluate(() => [...document.styleSheets].some((sheet) => sheet.cssRules.length > 0))).toBe(true);
  await page.waitForTimeout(1_000); // late requests (fonts, voice manifests)
  expect(await cspViolations(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('station pages boot offline from the cached shell', async ({ page }) => {
  const site = await deploy();
  try {
    await page.goto(`${site.url}/`);
    await installServiceWorker(page);
    site.setOffline(true);
    const station = MAIN_STATIONS.at(-1)!;
    await page.goto(`${site.url}/station/${station.id}/`);
    // The app (not offline.html, which also has a <main>): its entry script is on the page.
    await expect(page.locator('script[type="module"][src^="/assets/"]')).toHaveCount(1);
    await expect(page).not.toHaveTitle(/No signal/);
    await expect(page.getByRole('main')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/station/${station.id}/`);
    await page.goto(`${site.url}/station/no-such-station/`);
    await expect(page).toHaveTitle(/No signal/);
  } finally {
    await site.close();
  }
});

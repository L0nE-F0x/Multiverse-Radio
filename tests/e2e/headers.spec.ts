// HTTP-level checks of what Netlify will serve: security and cache headers from netlify.toml,
// the manifest and its icons, robots.txt and the social card tags.

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DIST, deploy } from './helpers';

test('headers, manifest, robots and social tags', async ({ request }) => {
  const site = await deploy();
  try {
    site.write('voice/probe.json', '{}');
    site.write('voice/probe/clip-1.mp3', Buffer.alloc(16));
    const get = (path: string) => request.get(`${site.url}${path}`);
    const cacheControl = async (path: string) => (await get(path)).headers()['cache-control'];

    const home = await get('/');
    expect(home.status()).toBe(200);
    const headers = home.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("media-src 'self' blob:");
    expect(headers['content-security-policy']).toContain("worker-src 'self' blob:");
    expect(headers['content-security-policy']).not.toContain('unsafe-eval');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('microphone=()');

    // Exact values: overlapping rules would show up here as comma-joined duplicates.
    const asset = readFileSync(`${DIST}/index.html`, 'utf8').match(/\/assets\/[^"]+\.js/)?.[0];
    expect(asset).toBeTruthy();
    expect(await cacheControl(asset!)).toBe('public, max-age=31536000, immutable');
    expect(await cacheControl('/voice/probe/clip-1.mp3')).toBe('public, max-age=86400');
    expect(await cacheControl('/voice/probe.json')).toBe('no-cache');
    expect(await cacheControl('/sw.js')).toBe('no-cache');
    expect(await cacheControl('/')).toBe('public, max-age=0, must-revalidate');

    const manifest = await get('/manifest.webmanifest');
    expect(manifest.headers()['content-type']).toContain('application/manifest+json');
    const { name, short_name, display, icons } = await manifest.json();
    expect({ name, short_name, display }).toEqual({
      name: 'Multiverse Radio',
      short_name: 'Multiverse',
      display: 'standalone',
    });
    for (const size of ['192x192', '512x512']) {
      expect(icons).toContainEqual(expect.objectContaining({ sizes: size, purpose: 'any' }));
      expect(icons).toContainEqual(expect.objectContaining({ sizes: size, purpose: 'maskable' }));
    }
    for (const icon of [...icons, { src: '/apple-touch-icon.png' }, { src: '/og-image.png' }]) {
      const response = await get(icon.src);
      expect(response.status(), icon.src).toBe(200);
    }

    const robots = await (await get('/robots.txt')).text();
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Disallow: \/lab\/$/m);

    const html = await home.text();
    for (const tag of ['og:title', 'og:description', 'og:image', 'twitter:card', 'twitter:image']) {
      expect(html, tag).toMatch(new RegExp(`(property|name)="${tag}"`));
    }
    expect(html).toContain('rel="manifest"');
    expect(html).not.toContain('%SITE_URL%');
  } finally {
    await site.close();
  }
});

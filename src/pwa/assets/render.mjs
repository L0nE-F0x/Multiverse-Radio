// Renders the install icons and the social card with headless Chromium:
//
//   npm run pwa:assets
//
// - public/icons/icon-{192,512}.png            from public/favicon.svg (transparent corners)
// - public/icons/icon-maskable-{192,512}.png   full-bleed, artwork inside the 80% safe zone
// - public/apple-touch-icon.png                180×180, opaque (iOS fills transparency black)
// - public/og-image.png                        1200×630 from src/pwa/assets/og-card.html
//
// Re-run after changing the favicon or the card, and commit the PNGs.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fromRoot = (...parts) => path.join(root, ...parts);

const favicon = readFileSync(fromRoot('public/favicon.svg'));
const faviconUrl = `data:image/svg+xml;base64,${favicon.toString('base64')}`;

const iconPage = ({ scale, background }) => `<!doctype html>
<html><head><style>
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
  body { display: grid; place-items: center; background: ${background}; }
  img { width: ${scale * 100}vw; height: ${scale * 100}vh; display: block; }
</style></head><body><img src="${faviconUrl}" alt=""></body></html>`;

const opaque = 'radial-gradient(circle at 50% 42%, #2a1d14 0%, #120c09 58%, #0a0a0c 100%)';

const icons = [
  { file: 'public/icons/icon-192.png', size: 192, scale: 1, background: 'transparent' },
  { file: 'public/icons/icon-512.png', size: 512, scale: 1, background: 'transparent' },
  // Maskable: the outer ring (r=30/64) times 0.8 stays inside the 40% safe-zone radius.
  { file: 'public/icons/icon-maskable-192.png', size: 192, scale: 0.8, background: opaque },
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: 0.8, background: opaque },
  { file: 'public/apple-touch-icon.png', size: 180, scale: 0.86, background: opaque },
];

function fontFace(family, file, weight = '400') {
  const data = readFileSync(fromRoot('node_modules', file)).toString('base64');
  return `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal;
    src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
}

const fonts = [
  fontFace('Bebas Neue', '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2'),
  fontFace('IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'),
  fontFace('IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2', '600'),
  fontFace('Inter Variable', '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', '100 900'),
].join('\n');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  mkdirSync(fromRoot('public/icons'), { recursive: true });

  for (const icon of icons) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(iconPage(icon), { waitUntil: 'load' });
    await page.screenshot({ path: fromRoot(icon.file), omitBackground: icon.background === 'transparent' });
    console.log(`wrote ${icon.file}`);
  }

  const card = readFileSync(fromRoot('src/pwa/assets/og-card.html'), 'utf8').replace('/*FONTS*/', fonts);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(card, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fromRoot('public/og-image.png') });
  console.log('wrote public/og-image.png');
} finally {
  await browser.close();
}

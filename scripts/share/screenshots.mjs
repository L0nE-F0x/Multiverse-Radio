// Renders the web app manifest's screenshots (Chrome's richer install dialog) from a fresh
// production build, served like Netlify:
//
//   npm run share:screenshots                    tuned to void-beats
//   npm run share:screenshots -- --station <id>
//
// - public/screenshots/wide.jpg     1280×720   (form_factor "wide")
// - public/screenshots/narrow.jpg   750×1334   (form_factor "narrow", a phone at 2×)
//
// The sizes are listed in public/manifest.webmanifest; keep them in sync. Re-run after UI
// changes (`npm run share:all` renders these and the share cards) and commit the JPEGs.

import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { startServer } from '../../tests/e2e/serve-dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fromRoot = (...parts) => path.join(root, ...parts);

const argv = process.argv.slice(2);
const stationIndex = argv.indexOf('--station');
const station = stationIndex > -1 ? argv[stationIndex + 1] : 'void-beats';
const QUALITY = 86;

const SHOTS = [
  { file: 'public/screenshots/wide.jpg', viewport: { width: 1280, height: 720 }, scale: 1, mobile: false },
  { file: 'public/screenshots/narrow.jpg', viewport: { width: 375, height: 667 }, scale: 2, mobile: true },
];

const outDir = mkdtempSync(path.join(os.tmpdir(), 'mvr-screenshots-'));
await build({ root, configFile: fromRoot('vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await startServer({ roots: [outDir], port: 0 });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

try {
  mkdirSync(fromRoot('public/screenshots'), { recursive: true });
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale,
      isMobile: shot.mobile,
      hasTouch: shot.mobile,
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(`${server.url}/?station=${encodeURIComponent(station)}`);
    await page.getByRole('main').waitFor();
    await tuneIn(page);
    await page.waitForTimeout(4_000); // tuning, the first segment, the scene fading in
    await page.mouse.move(-10, -10).catch(() => {});
    const file = fromRoot(shot.file);
    await page.screenshot({ path: file, type: 'jpeg', quality: QUALITY });
    const size = statSync(file).size;
    const { width, height } = shot.viewport;
    console.log(`  ${shot.file.padEnd(30)} ${width * shot.scale}×${height * shot.scale}  ${(size / 1000).toFixed(1)} kB`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(outDir, { recursive: true, force: true });
}

/** Get past the welcome card (if any) and start the radio, so the shot shows it on air. */
async function tuneIn(page) {
  const first = async (locator) => ((await locator.count()) > 0 && (await locator.first().isVisible()) ? locator.first() : null);
  const welcome = await first(page.getByTestId('welcome-tune-in'));
  if (welcome) {
    await welcome.click();
    await page.waitForTimeout(500);
  }
  const dismiss = await first(page.getByTestId('welcome-dismiss'));
  if (dismiss) await dismiss.click();
  if (welcome) return;
  const play = await first(page.getByRole('button', { name: /play|tune in|power|switch on|listen/i }));
  if (play) await play.click();
}

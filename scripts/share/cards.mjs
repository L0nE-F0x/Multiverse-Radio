// Renders the social cards with headless Chromium:
//
//   npm run share:cards                      every main station + the default card
//   npm run share:cards -- void-beats cat-fm  just these stations (ids)
//   npm run share:cards -- --site            just the default card
//   npm run share:cards -- --raw <dir>       also keep the raw scene screenshots
//
// - public/share/<id>.jpg   1200×630, one per main (non-secret) station
// - public/og-image.png     1200×630, the site's default card
//
// Each card is the station's pixel-art scene, screenshotted from the scenes lab at 16:9 (a
// Vite dev server is started for it, on port 5423 or the next free one), under a translucent
// amber "used future" HUD in the station's phosphor colour (scripts/share/card.html).
// Re-run after scenes or station names/taglines change, and commit public/share/ and
// public/og-image.png. Undrawn scenes show the lab's snow-TV fallback; the run lists them.
// `npm run share:all` also re-renders the manifest screenshots (scripts/share/screenshots.mjs).

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { captureScene, SCENE_H, SCENE_W } from './capture.mjs';
import { formatFrequency, SHIP_LINE, SITE_NAME, stationCardPath } from './pages.mjs';
import { loadShareStations } from './roster.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fromRoot = (...parts) => path.join(root, ...parts);

const CARD_W = 1200;
const CARD_H = 630;
/** JPEG budget per card. The first quality (highest first) that fits wins. */
const MAX_BYTES = 110_000;
const QUALITIES = [90, 86, 82, 78, 74, 70, 66, 62, 58];
/** Keep public/share + og-image.png under this. */
const TOTAL_BUDGET = 6_000_000;

/** HUD phosphors (art direction in docs/V3-PLAN.md), tuned to read over dark scenes. */
const PHOSPHOR = {
  amber: '#ffb000',
  green: '#33ff88',
  cyan: '#5ce1ff',
  white: '#e8eef5',
  red: '#ff5a4a',
  violet: '#b48cff',
  rose: '#ff7aa8',
};

/** The default card shows this station's scene. */
const SITE_HERO = 'whalesong';
/** The receiver's main band in MHz (DIAL.mainBand in src/broadcast/types.ts). */
const MAIN_BAND = [87.5, 108];

/**
 * Per-station framing: `advance` = seconds of scene time before the shot (default 24),
 * `top` = vertical offset of the 1280×720 shot inside the 1200×630 card (default -45, centred).
 */
const FRAMING = {};

// ── CLI ───────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  argv.splice(index, 1);
  return true;
};
const option = (name) => {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const [, value] = argv.splice(index, 2);
  return value;
};
const siteOnly = flag('site');
const rawDir = option('raw');
const port = Number(option('port') ?? 5423);
const only = new Set(argv);

const all = await loadShareStations(root);
const unknown = [...only].filter((id) => !all.some((s) => s.station.id === id));
if (unknown.length) {
  console.error(`Unknown or secret station id(s): ${unknown.join(', ')}`);
  process.exit(1);
}
const selected = siteOnly ? [] : all.filter((s) => only.size === 0 || only.has(s.station.id));
const renderSite = siteOnly || only.size === 0;

// ── Fonts (inlined, so the card page needs no server) ────────────────────────

function fontFace(family, file, weight = '400') {
  const data = readFileSync(fromRoot('node_modules', file)).toString('base64');
  return `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: normal;
    src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
}
const fonts = [
  fontFace('Bebas Neue', '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2'),
  fontFace('IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'),
  fontFace('IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2', '600'),
].join('\n');
const template = readFileSync(fromRoot('scripts/share/card.html'), 'utf8').replace('/*FONTS*/', fonts);

// ── Render ────────────────────────────────────────────────────────────────────

const server = await createServer({
  root,
  configFile: fromRoot('vite.config.ts'),
  logLevel: 'warn',
  clearScreen: false,
  server: { host: '127.0.0.1', port, strictPort: false, hmr: false },
});
await server.listen();
const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const report = [];
const problems = [];

try {
  const cardPage = await browser.newPage({ viewport: { width: CARD_W, height: CARD_H }, deviceScaleFactor: 1 });
  mkdirSync(fromRoot('public/share'), { recursive: true });
  if (rawDir) mkdirSync(rawDir, { recursive: true });

  const total = all.length;
  const shoot = async ({ station, index }) => {
    const framing = FRAMING[station.id] ?? {};
    const shot = await captureScene(browser, origin, { scene: station.scene, advance: framing.advance });
    for (const problem of shot.problems) problems.push(`${station.id}: ${problem}`);
    if (rawDir) writeFileSync(path.join(rawDir, `${station.id}.png`), shot.png);
    return {
      phosphor: PHOSPHOR[station.phosphor] ?? PHOSPHOR.amber,
      scene: `data:image/png;base64,${shot.png.toString('base64')}`,
      sceneTop: framing.top ?? -(SCENE_H - CARD_H) / 2,
      sceneWidth: SCENE_W,
      channel: `CH ${String(index + 1).padStart(2, '0')}/${total}`,
    };
  };

  for (const entry of selected) {
    const { station, sceneDrawn } = entry;
    const card = {
      kind: 'station',
      ...(await shoot(entry)),
      freq: formatFrequency(station.frequency),
      origin: station.origin,
      name: station.name,
      tagline: station.tagline,
      brand: SITE_NAME.toUpperCase(),
      ship: SHIP_LINE,
      status: 'RX LOCK',
    };
    await compose(cardPage, card);
    const { bytes, quality } = await writeJpeg(cardPage, fromRoot('public', stationCardPath(station.id)));
    report.push({ file: stationCardPath(station.id), bytes, note: `q${quality}${sceneDrawn ? '' : ' · scene not drawn yet (snow)'}` });
    console.log(`  ${stationCardPath(station.id).padEnd(36)} ${kb(bytes).padStart(7)}  q${quality}${sceneDrawn ? '' : '  (snow fallback)'}`);
  }

  if (renderSite) {
    const hero = all.find((s) => s.station.id === SITE_HERO) ?? all[0];
    const card = {
      kind: 'site',
      ...(await shoot(hero)),
      phosphor: PHOSPHOR.amber,
      freq: `${formatFrequency(all[0].station.frequency)}–${formatFrequency(all.at(-1).station.frequency)}`,
      origin: 'Endless radio from other dimensions',
      name: 'Multiverse Radio',
      tagline: `Generative music and deadpan hosts from ${total} stations. You're on the night shift.`,
      brand: SHIP_LINE,
      ship: 'RELAY 7',
      status: 'NIGHT SHIFT',
      channel: `${total} STATIONS`,
      dial: all.map((s) => s.station.frequency),
      band: MAIN_BAND,
      needle: hero.station.frequency,
    };
    await compose(cardPage, card);
    const file = fromRoot('public/og-image.png');
    await cardPage.screenshot({ path: file, type: 'png' });
    const bytes = statSync(file).size;
    report.push({ file: 'og-image.png', bytes, note: `hero: ${hero.station.id}` });
    console.log(`  ${'og-image.png'.padEnd(36)} ${kb(bytes).padStart(7)}  (hero: ${hero.station.id})`);
  }
} finally {
  await browser.close();
  await server.close();
}

// ── Summary ───────────────────────────────────────────────────────────────────

const shareDir = fromRoot('public/share');
const shareBytes = readdirSync(shareDir).reduce((sum, file) => sum + statSync(path.join(shareDir, file)).size, 0);
const totalBytes = shareBytes + statSync(fromRoot('public/og-image.png')).size;
console.log(`\n${report.length} card(s) written. public/share + og-image.png: ${(totalBytes / 1e6).toFixed(2)} MB`);
const missingCards = all.filter((s) => !readdirSync(shareDir).includes(path.basename(stationCardPath(s.station.id))));
if (missingCards.length) console.warn(`No card yet for: ${missingCards.map((s) => s.station.id).join(', ')}`);
const snow = all.filter((s) => !s.sceneDrawn).map((s) => s.station.id);
if (snow.length) console.warn(`Scenes not drawn yet (cards show snow; re-run once they exist): ${snow.join(', ')}`);
if (totalBytes > TOTAL_BUDGET) console.warn(`Over the ${TOTAL_BUDGET / 1e6} MB budget: lower MAX_BYTES in scripts/share/cards.mjs.`);
if (problems.length) {
  console.warn(`\nConsole errors while capturing scenes:\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exitCode = 1;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function kb(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

/** Load the template and fill it in (runs in the card page). */
async function compose(page, card) {
  await page.setContent(template, { waitUntil: 'load' });
  await page.evaluate(async (c) => {
    const root = document.documentElement;
    root.style.setProperty('--ph', c.phosphor);
    root.style.setProperty('--scene-top', `${c.sceneTop}px`);
    root.style.setProperty('--scene-w', `${c.sceneWidth}px`);
    document.body.className = c.kind;
    const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
    for (const name of ['brand', 'ship', 'status', 'channel', 'origin', 'name', 'tagline']) slot(name).textContent = c[name];
    const freq = slot('freq');
    freq.textContent = c.freq;
    const unit = document.createElement('small');
    unit.textContent = 'MHz';
    freq.append(unit);

    if (c.dial) {
      // The main band, with a dot per station and the needle on the hero's frequency.
      const dial = slot('dial');
      const [lo, hi] = c.band;
      const at = (mhz) => `${((mhz - lo) / (hi - lo)) * 100}%`;
      const mark = (className, mhz, text) => {
        const el = document.createElement('i');
        el.className = className;
        el.style.left = at(mhz);
        if (text) el.textContent = text;
        dial.append(el);
      };
      for (let mhz = Math.ceil(lo * 2) / 2; mhz <= hi; mhz += 0.5) {
        const major = mhz % 2 === 0;
        mark(major ? 'tick major' : 'tick', mhz);
        if (major && mhz > lo + 0.4 && mhz < hi - 0.4) mark('label', mhz, String(mhz));
      }
      for (const mhz of c.dial) mark('dot', mhz);
      mark('needle', c.needle);
    }

    await document.fonts.ready;
    // Shrink the name until it fits on one line.
    const name = slot('name');
    let size = parseFloat(getComputedStyle(name).fontSize);
    while (name.scrollWidth > name.clientWidth && size > 60) {
      size -= 2;
      name.style.fontSize = `${size}px`;
    }
    const img = document.querySelector('.scene');
    img.src = c.scene;
    await img.decode();
  }, card);
}

/** Screenshot as JPEG at the highest quality that fits MAX_BYTES. */
async function writeJpeg(page, file) {
  let best;
  for (const quality of QUALITIES) {
    const buffer = await page.screenshot({ type: 'jpeg', quality });
    best = { buffer, quality };
    if (buffer.length <= MAX_BYTES) break;
  }
  writeFileSync(file, best.buffer);
  return { bytes: best.buffer.length, quality: best.quality };
}

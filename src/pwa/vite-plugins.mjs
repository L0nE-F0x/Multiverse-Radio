// Build-time plugins for shipping Multiverse Radio: the service worker, absolute URLs for
// social cards, and a JS size budget. Plain ESM (not TS) because it runs in Node and the app's
// tsconfig deliberately has no Node types; see vite-plugins.d.mts for the typings.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Public files (relative to the base URL) that are part of the offline app shell.
 * `offline.html` is required; the rest are nice to have.
 */
const SHELL_PUBLIC_FILES = [
  'fonts/bebas-neue-latin-400.woff2', // used by offline.html
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

const FONT_OR_MEDIA = /\.(woff2?|ttf|otf|eot|mp3|wav|ogg|opus|m4a|aac|flac|mp4|webm)$/i;
const LATIN_WOFF2 = /-latin-(?!ext)[^/]*\.woff2$/;

/**
 * Resolve the public site URL used for canonical/Open Graph/Twitter tags.
 * Order: explicit option, SITE_URL env var, Netlify's built-in URL env var. Empty when none
 * are set (local builds), which leaves the tags relative.
 */
function resolveSiteUrl(explicit) {
  const raw = explicit ?? process.env.SITE_URL ?? process.env.URL ?? '';
  return raw.trim().replace(/\/+$/, '');
}

/**
 * PWA + sharing plugin.
 * - Replaces `%SITE_URL%` in HTML with the absolute site URL (no trailing slash, base included).
 * - Emits `sw.js` with a precache manifest for the main entry (labs are not precached).
 * @param {import('./vite-plugins.d.mts').PwaPluginOptions} [options]
 * @returns {import('vite').Plugin[]}
 */
export function pwa(options = {}) {
  let base = '/';
  let root = process.cwd();
  let publicDir = '';
  let logger;
  let siteUrl = '';

  /** @type {import('vite').Plugin} */
  const siteUrlPlugin = {
    name: 'mvr:site-url',
    configResolved(config) {
      base = config.base;
      root = config.root;
      publicDir = config.publicDir;
      logger = config.logger;
      const origin = resolveSiteUrl(options.siteUrl);
      siteUrl = origin ? origin + base.replace(/\/+$/, '') : '';
      if (config.command === 'build' && !config.isWorker && !process.env.VITEST) {
        logger.info(
          siteUrl
            ? `social cards: absolute URLs use ${siteUrl}`
            : 'social cards: SITE_URL not set, so og:image is relative and canonical/og:url are omitted (Netlify sets URL automatically)',
        );
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        siteUrl
          ? html.replaceAll('%SITE_URL%', siteUrl)
          : // Without a site URL, tags that point at the page itself (canonical, og:url) are
            // meaningless, and Vite would try to resolve href="/" as a file. Drop them.
            html
              .replace(/[ \t]*<(?:link|meta)\b[^>]*="%SITE_URL%\/?"[^>]*>\n?/g, '')
              .replaceAll('%SITE_URL%', ''),
    },
  };

  /** @type {import('vite').Plugin} */
  const serviceWorkerPlugin = {
    name: 'mvr:service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_outputOptions, bundle) {
      if (options.killSwitch) {
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: KILL_SWITCH_SW });
        return;
      }

      const indexHtml = bundle['index.html'];
      if (!indexHtml || indexHtml.type !== 'asset') {
        this.warn('index.html not found in the bundle; skipping the service worker');
        return;
      }
      const entry = findHtmlEntry(bundle, path.join(root, 'index.html'));
      if (!entry) {
        this.warn('could not find the JS entry for index.html; skipping the service worker');
        return;
      }

      const url = (file) => base + file;
      const required = new Set([base, url('offline.html')]);
      const optional = new Set();

      // Everything the entry loads up front is required; lazy chunks are best-effort.
      const initial = collectChunks(bundle, entry, false);
      const all = collectChunks(bundle, entry, true);
      for (const chunk of all) {
        const target = initial.has(chunk) ? required : optional;
        target.add(url(chunk.fileName));
        for (const css of chunk.viteMetadata?.importedCss ?? []) target.add(url(css));
        for (const asset of chunk.viteMetadata?.importedAssets ?? []) {
          // Fonts and media are handled below / at runtime, not precached wholesale.
          if (!FONT_OR_MEDIA.test(asset)) optional.add(url(asset));
        }
      }
      // Precache only the Latin woff2 subsets of the fonts. Other subsets (and anything else
      // under /assets/) are cached on first use by the worker's /assets/ route.
      for (const file of Object.keys(bundle)) {
        if (LATIN_WOFF2.test(file)) optional.add(url(file));
      }
      for (const file of SHELL_PUBLIC_FILES) {
        if (existsSync(path.join(publicDir, file))) optional.add(url(file));
      }
      for (const entryUrl of required) optional.delete(entryUrl);

      const template = readFileSync(path.join(root, 'src/pwa/sw.js'), 'utf8');
      const hash = createHash('sha256');
      hash.update(template);
      hash.update(String(indexHtml.source));
      for (const entryUrl of [...required, ...optional].sort()) {
        hash.update(entryUrl);
        // Hashed assets change name when they change; public files need their bytes hashed.
        if (!entryUrl.startsWith(url('assets/')) && entryUrl !== base) {
          const file = path.join(publicDir, entryUrl.slice(base.length));
          if (existsSync(file)) hash.update(readFileSync(file));
        }
      }

      const build = {
        version: hash.digest('hex').slice(0, 12),
        base,
        shell: base,
        offline: url('offline.html'),
        required: [...required].sort(),
        optional: [...optional].sort(),
      };
      const marker = 'const BUILD = __BUILD__;';
      if (!template.includes(marker)) this.error(`src/pwa/sw.js must contain "${marker}"`);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace(marker, () => `const BUILD = ${JSON.stringify(build, null, 2)};`),
      });
    },
  };

  return [siteUrlPlugin, serviceWorkerPlugin];
}

/**
 * Warns when the main page's JavaScript grows past a budget (gzip sizes) and prints a summary.
 * Lab pages are excluded. Never fails the build.
 * @param {import('./vite-plugins.d.mts').BundleBudgetOptions} [options]
 * @returns {import('vite').Plugin}
 */
export function bundleBudget(options = {}) {
  const initialBudget = options.initialJsKb ?? 200;
  const totalBudget = options.totalJsKb ?? 450;
  let root = process.cwd();
  let logger;

  return {
    name: 'mvr:bundle-budget',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root;
      logger = config.logger;
    },
    generateBundle(_outputOptions, bundle) {
      const entry = findHtmlEntry(bundle, path.join(root, 'index.html'));
      if (!entry) return;
      const initial = collectChunks(bundle, entry, false);
      const all = collectChunks(bundle, entry, true);
      const gz = (chunk) => gzipSync(chunk.code).length / 1000;
      const sum = (chunks) => [...chunks].reduce((total, chunk) => total + gz(chunk), 0);
      const initialKb = sum(initial);
      const totalKb = sum(all);
      const css = new Set([...all].flatMap((chunk) => [...(chunk.viteMetadata?.importedCss ?? [])]));
      const cssKb = [...css].reduce((total, file) => {
        const asset = bundle[file];
        return asset?.type === 'asset' ? total + gzipSync(asset.source).length / 1000 : total;
      }, 0);

      const fmt = (kb) => `${kb.toFixed(1)} kB`;
      logger.info(
        `bundle budget (gzip, main page): initial JS ${fmt(initialKb)} / ${initialBudget} kB · ` +
          `all JS ${fmt(totalKb)} / ${totalBudget} kB · CSS ${fmt(cssKb)}`,
      );
      if (initialKb > initialBudget) {
        this.warn(
          `initial JS is ${fmt(initialKb)} gzip, over the ${initialBudget} kB budget. ` +
            'Lazy-load something (scenes, labs, big tables) or raise the budget in vite.config.ts.',
        );
      }
      if (totalKb > totalBudget) {
        this.warn(`total JS for the main page is ${fmt(totalKb)} gzip, over the ${totalBudget} kB budget.`);
      }
    },
  };
}

// ── Bundle graph helpers ──────────────────────────────────────────────────────

function findHtmlEntry(bundle, htmlPath) {
  const chunks = Object.values(bundle).filter((item) => item.type === 'chunk' && item.isEntry);
  const normalized = path.normalize(htmlPath);
  return (
    chunks.find((chunk) => chunk.facadeModuleId && path.normalize(chunk.facadeModuleId) === normalized) ??
    chunks.find((chunk) => chunk.name === 'main' || chunk.name === 'index')
  );
}

function collectChunks(bundle, entry, includeDynamic) {
  const seen = new Set();
  const visit = (chunk) => {
    if (!chunk || chunk.type !== 'chunk' || seen.has(chunk)) return;
    seen.add(chunk);
    for (const file of chunk.imports) visit(bundle[file]);
    if (includeDynamic) for (const file of chunk.dynamicImports) visit(bundle[file]);
  };
  visit(entry);
  return seen;
}

// Emitted instead of the real worker when `killSwitch: true`: clears our caches and
// unregisters itself, leaving pages to the network. Ship this if the worker ever misbehaves.
const KILL_SWITCH_SW = `// Multiverse Radio: service worker kill switch.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('mvr-')) await caches.delete(key);
    await self.registration.unregister();
  })());
});
`;

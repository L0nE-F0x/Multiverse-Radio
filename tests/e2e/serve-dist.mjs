// A tiny Netlify-like static server for the production build, used by the e2e tests:
//
//   node tests/e2e/serve-dist.mjs [--port 5415] [--root dist]
//
// It behaves like Netlify where it matters for testing: the [[headers]] rules from
// netlify.toml (same path matching, values comma-joined when rules overlap), Netlify's default
// Cache-Control, /foo → foo.html, /dir → 301 /dir/ (when dir/index.html exists), 404.html
// with a 404 status, and byte ranges for audio.
// Unlike `vite preview`, that means the CSP and caching rules are exercised for real.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const NETLIFY_DEFAULT_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
};

/**
 * Reads the [[headers]] tables from netlify.toml. Supports the subset this repo uses:
 * comments, [[headers]], `for = "..."`, [headers.values] and single-line string values.
 * @returns {{ for: string, values: Record<string, string> }[]}
 */
export function parseNetlifyHeaders(toml) {
  const rules = [];
  let section = null;
  for (const [index, raw] of toml.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      if (line === '[[headers]]') {
        rules.push({ for: '', values: {} });
        section = 'headers';
      } else {
        section = line === '[headers.values]' && section ? 'values' : null;
      }
      continue;
    }
    if (!section) continue;
    const match = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*("([^"\\]*)"|'([^']*)')\s*$/.exec(line);
    if (!match) {
      throw new Error(`netlify.toml:${index + 1}: unsupported syntax in [[headers]]: ${line}`);
    }
    const key = match[1].replace(/^["']|["']$/g, '');
    const value = match[3] ?? match[4];
    const rule = rules.at(-1);
    if (section === 'headers' && key === 'for') rule.for = value;
    else if (section === 'values') rule.values[key] = value;
  }
  return rules.filter((rule) => rule.for);
}

/** Netlify path matching: `:name` = one path segment, `*` = anything (including `/`). */
export function compilePattern(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      source += '.*';
    } else if (char === ':' && pattern[i - 1] === '/') {
      while (i + 1 < pattern.length && /[A-Za-z0-9_]/.test(pattern[i + 1])) i++;
      source += '[^/]+';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** Headers Netlify would send for `pathname`, given the parsed rules. */
export function headersFor(rules, pathname) {
  const headers = {};
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const [name, value] of Object.entries(rule.values)) {
      const key = name.toLowerCase();
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    }
  }
  headers['cache-control'] ??= NETLIFY_DEFAULT_CACHE_CONTROL;
  return headers;
}

function loadRules(headersFile) {
  const rules = parseNetlifyHeaders(readFileSync(headersFile, 'utf8'));
  for (const rule of rules) {
    rule.pattern = compilePattern(rule.for);
    if (/\*[^/]/.test(rule.for)) {
      console.warn(
        `[serve-dist] warning: "${rule.for}" has text after "*". Netlify may ignore it and match ` +
          'everything under the prefix; use :placeholders instead.',
      );
    }
  }
  return rules;
}

/**
 * Start a server. `roots` are searched in order, so a test can overlay files on top of dist/.
 * @param {{ roots?: string[], port?: number, host?: string, headersFile?: string }} [options]
 */
export async function startServer(options = {}) {
  const roots = (options.roots ?? [path.join(projectRoot, 'dist')]).map((root) => path.resolve(root));
  const host = options.host ?? '127.0.0.1';
  const rules = loadRules(options.headersFile ?? path.join(projectRoot, 'netlify.toml'));
  let offline = false;

  const findFile = (relative) => {
    for (const root of roots) {
      const file = path.join(root, relative);
      if (!file.startsWith(root + path.sep) && file !== root) continue;
      if (existsSync(file) && statSync(file).isFile()) return file;
    }
    return null;
  };

  const resolve = (pathname) => {
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
    if (relative.split('/').includes('..')) return null;
    if (relative === '' || relative.endsWith('/')) return findFile(path.join(relative, 'index.html'));
    return findFile(relative) ?? (path.extname(relative) ? null : findFile(`${relative}.html`));
  };

  const server = createServer((req, res) => {
    if (offline) {
      req.socket.destroy();
      return;
    }
    const { pathname, search } = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    // Like Netlify: a folder with an index page gets its trailing slash (/station/x → /station/x/).
    if (!pathname.endsWith('/') && !resolve(pathname) && resolve(`${pathname}/`)) {
      res.writeHead(301, { ...headersFor(rules, pathname), location: `${pathname}/${search}` }).end();
      return;
    }

    let file = resolve(pathname);
    let status = 200;
    if (!file) {
      file = findFile('404.html');
      status = 404;
    }
    const headers = headersFor(rules, pathname);
    if (!file) {
      res.writeHead(404, { ...headers, 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }

    const size = statSync(file).size;
    headers['content-type'] = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    headers['accept-ranges'] = 'bytes';
    let start = 0;
    let end = size - 1;
    const range = status === 200 ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '') : null;
    if (range) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` }).end();
        return;
      }
      status = 206;
      headers['content-range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['content-length'] = String(end - start + 1);
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || size === 0) res.end();
    else createReadStream(file, { start, end }).pipe(res);
  });

  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(options.port ?? 0, host, done);
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://${host}:${port}`,
    port,
    /** Simulate losing the network: every request gets its connection dropped. */
    setOffline(value) {
      offline = value;
      if (value) server.closeAllConnections();
    },
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > -1 ? process.argv[index + 1] : fallback;
  };
  const root = path.resolve(arg('root', path.join(projectRoot, 'dist')));
  if (!existsSync(path.join(root, 'index.html'))) {
    console.error(`[serve-dist] ${root}/index.html not found. Run \`npm run build\` first.`);
    process.exit(1);
  }
  const { url } = await startServer({ roots: [root], port: Number(arg('port', '5415')), host: arg('host') });
  console.log(`[serve-dist] serving ${path.relative(process.cwd(), root) || '.'} at ${url} with netlify.toml headers`);
}

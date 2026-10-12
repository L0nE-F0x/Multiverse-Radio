// Per-station share pages: the built index.html with that station's own <title>, description,
// canonical URL and Open Graph / Twitter tags, so a shared /station/<id>/ link unfurls as the
// station. The pages boot the same app (all asset URLs in the build are root-absolute).
//
// Used at build time by the pwa() Vite plugin (src/pwa/vite-plugins.mjs) and by the card
// renderer (scripts/share/cards.mjs). Plain ESM so Node and Vite can both load it.

export const SITE_NAME = 'Multiverse Radio';
export const SHIP_LINE = 'R/S NIGHTJAR';

/** Where a station's share page lives, relative to the base URL (no leading slash). */
export const stationPagePath = (id) => `station/${id}/`;
/** Where a station's card image lives, relative to the base URL (no leading slash). */
export const stationCardPath = (id) => `share/${id}.jpg`;

/** 88.4 → "88.4", 91 → "91.0", 88.85 → "88.85". */
export function formatFrequency(mhz) {
  const fixed = mhz.toFixed(2);
  return fixed.endsWith('0') ? mhz.toFixed(1) : fixed;
}

/** The text a station's page and card use. `sceneLabel` describes the card's picture. */
export function stationMeta(station, sceneLabel) {
  const freq = `${formatFrequency(station.frequency)} MHz`;
  const title = `${station.name} · ${freq} · ${SITE_NAME}`;
  const description = `${station.tagline} ${freq} · Origin: ${station.origin}. Endless radio from other dimensions.`;
  const picture = sceneLabel ? ` ${sceneLabel}` : '';
  return {
    freq,
    title,
    description,
    imageAlt: `${station.name}, ${freq}, on ${SITE_NAME}.${picture}`,
  };
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ESCAPES[c]);

/**
 * Rewrites the station-specific tags of the built index.html.
 * @param {string} html        the built index.html (with %SITE_URL% already replaced)
 * @param {object} station     a StationDef
 * @param {object} options
 * @param {string} options.siteUrl     absolute site URL incl. base, no trailing slash ('' = relative)
 * @param {string} options.base        Vite base, e.g. '/'
 * @param {string} [options.image]     card path relative to the base, e.g. 'share/void-beats.jpg';
 *                                     without one the page keeps the site's default card
 * @param {string} [options.imageType] MIME type of the card (default image/jpeg)
 * @param {string} [options.sceneLabel]
 * @returns {string}
 */
export function stationPageHtml(html, station, options) {
  const { siteUrl, base, image, imageType = 'image/jpeg', sceneLabel } = options;
  const meta = stationMeta(station, sceneLabel);
  const root = siteUrl || base.replace(/\/+$/, '');
  const pageUrl = `${root}/${stationPagePath(station.id)}`;

  let out = html;
  const swap = (pattern, replacement, required = true) => {
    const next = out.replace(pattern, replacement);
    if (next === out && required && !pattern.test(out)) {
      throw new Error(`station page ${station.id}: index.html has no ${pattern}`);
    }
    out = next;
  };
  const attr = (tag, key, value, newValue, required = true) =>
    swap(
      new RegExp(`(<${tag}\\b[^>]*\\b${key}="${value}"[^>]*\\b(?:content|href)=")[^"]*(")`),
      (_m, head, tail) => head + escapeHtml(newValue) + tail,
      required,
    );

  swap(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  attr('meta', 'name', 'description', meta.description);
  // Page URLs only exist when the site URL is known (see resolveSiteUrl in vite-plugins.mjs).
  attr('link', 'rel', 'canonical', pageUrl, Boolean(siteUrl));
  attr('meta', 'property', 'og:url', pageUrl, Boolean(siteUrl));
  attr('meta', 'property', 'og:title', meta.title);
  attr('meta', 'property', 'og:description', meta.description);
  attr('meta', 'name', 'twitter:title', meta.title);
  attr('meta', 'name', 'twitter:description', meta.description);
  if (image) {
    const imageUrl = `${root}/${image}`;
    attr('meta', 'property', 'og:image', imageUrl);
    attr('meta', 'property', 'og:image:type', imageType);
    attr('meta', 'property', 'og:image:alt', meta.imageAlt);
    attr('meta', 'name', 'twitter:image', imageUrl);
    attr('meta', 'name', 'twitter:image:alt', meta.imageAlt);
  }
  return out;
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAIN_STATIONS, STATIONS } from '../../src/stations/roster';
import { escapeHtml, formatFrequency, stationMeta, stationPageHtml } from './pages.mjs';

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const SITE = 'https://radio.example';
const built = indexHtml.replaceAll('%SITE_URL%', SITE);
const voidBeats = STATIONS.find((s) => s.id === 'void-beats')!;

const tag = (html: string, attr: string, value: string) => {
  const match = new RegExp(`<(?:meta|link)\\b[^>]*\\b${attr}="${value}"[^>]*\\b(?:content|href)="([^"]*)"`).exec(html);
  return match?.[1];
};

describe('formatFrequency', () => {
  it('keeps one decimal, or two when the station needs them', () => {
    expect(formatFrequency(88.4)).toBe('88.4');
    expect(formatFrequency(91)).toBe('91.0');
    expect(formatFrequency(88.85)).toBe('88.85');
    expect(formatFrequency(100)).toBe('100.0');
  });
});

describe('stationPageHtml', () => {
  const page = stationPageHtml(built, voidBeats, {
    siteUrl: SITE,
    base: '/',
    image: 'share/void-beats.jpg',
    sceneLabel: 'A creature studies by a window onto the void.',
  });

  it('rewrites title, description, canonical, Open Graph and Twitter tags', () => {
    const meta = stationMeta(voidBeats, 'A creature studies by a window onto the void.');
    expect(page).toContain(`<title>${escapeHtml(meta.title)}</title>`);
    expect(meta.title).toBe('Void Beats · 88.4 MHz · Multiverse Radio');
    expect(tag(page, 'name', 'description')).toBe(escapeHtml(meta.description));
    expect(meta.description).toContain(voidBeats.tagline);
    expect(tag(page, 'rel', 'canonical')).toBe(`${SITE}/station/void-beats/`);
    expect(tag(page, 'property', 'og:url')).toBe(`${SITE}/station/void-beats/`);
    expect(tag(page, 'property', 'og:title')).toBe(escapeHtml(meta.title));
    expect(tag(page, 'property', 'og:description')).toBe(escapeHtml(meta.description));
    expect(tag(page, 'property', 'og:image')).toBe(`${SITE}/share/void-beats.jpg`);
    expect(tag(page, 'property', 'og:image:type')).toBe('image/jpeg');
    expect(tag(page, 'property', 'og:image:width')).toBe('1200');
    expect(tag(page, 'property', 'og:image:height')).toBe('630');
    expect(tag(page, 'property', 'og:image:alt')).toContain('Void Beats');
    expect(tag(page, 'property', 'og:image:alt')).toContain('studies by a window');
    expect(tag(page, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(tag(page, 'name', 'twitter:title')).toBe(escapeHtml(meta.title));
    expect(tag(page, 'name', 'twitter:image')).toBe(`${SITE}/share/void-beats.jpg`);
    expect(tag(page, 'name', 'twitter:image:alt')).toBe(tag(page, 'property', 'og:image:alt'));
  });

  it('leaves the rest of the page alone', () => {
    const strip = (html: string) =>
      html
        .replace(/<title>[^<]*<\/title>/, '')
        .replace(/<(?:meta|link)\b[^>]*\b(?:name|property|rel)="(?:description|canonical|og:[a-z:]+|twitter:[a-z:]+)"[^>]*>/g, '');
    expect(strip(page)).toBe(strip(built));
    expect(page).toContain('<div id="root"></div>');
  });

  it('escapes station text', () => {
    const odd = { ...voidBeats, name: 'Quotes "&" <Angles>', tagline: 'Fish & "chips".' };
    const html = stationPageHtml(built, odd, { siteUrl: SITE, base: '/', image: 'share/x.jpg' });
    expect(html).toContain('<title>Quotes &quot;&amp;&quot; &lt;Angles&gt; · 88.4 MHz · Multiverse Radio</title>');
    expect(tag(html, 'property', 'og:description')).toContain('Fish &amp; &quot;chips&quot;.');
  });

  it('keeps the default card when a station has none yet', () => {
    const html = stationPageHtml(built, voidBeats, { siteUrl: SITE, base: '/' });
    expect(tag(html, 'property', 'og:image')).toBe(`${SITE}/og-image.png`);
    expect(tag(html, 'property', 'og:title')).toContain('Void Beats');
  });

  it('works without a site URL (relative image, no canonical)', () => {
    const relative = indexHtml
      .replace(/[ \t]*<(?:link|meta)\b[^>]*="%SITE_URL%\/?"[^>]*>\n?/g, '')
      .replaceAll('%SITE_URL%', '');
    const html = stationPageHtml(relative, voidBeats, { siteUrl: '', base: '/', image: 'share/void-beats.jpg' });
    expect(tag(html, 'property', 'og:image')).toBe('/share/void-beats.jpg');
    expect(tag(html, 'rel', 'canonical')).toBeUndefined();
  });

  it('works for every main station', () => {
    for (const station of MAIN_STATIONS) {
      const html = stationPageHtml(built, station, { siteUrl: SITE, base: '/', image: `share/${station.id}.jpg` });
      expect(tag(html, 'property', 'og:url')).toBe(`${SITE}/station/${station.id}/`);
    }
  });
});

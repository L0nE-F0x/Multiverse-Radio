// The first-visit welcome card and the PWA install offer (src/onboarding).
//
// Runs against the app at `/`. Until the UI mounts <Welcome /> in <App />, point it at the
// onboarding lab, which mounts the same component over a live scene:
//
//   ONBOARDING_URL=/lab/onboarding.html npx playwright test onboarding
//
// Every test gets a fresh browser context, so every test starts as a first visit.

import { devices, expect, test, type Page } from '@playwright/test';

const BASE = process.env.ONBOARDING_URL ?? '/';
const at = (query = '') => (query ? `${BASE}${BASE.includes('?') ? '&' : '?'}${query}` : BASE);

const { defaultBrowserType: _iphoneBrowser, ...IPHONE } = devices['iPhone 15'];
const { defaultBrowserType: _pixelBrowser, ...PIXEL } = devices['Pixel 7'];

declare global {
  interface Window {
    __promptCalls?: number;
  }
}

/**
 * Only synthetic install prompts reach the app: if headless Chromium ever offers a real one,
 * it would replace ours. Call before goto.
 */
async function onlySyntheticPrompts(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener(
      'beforeinstallprompt',
      (event) => {
        if (!(event as Event & { synthetic?: boolean }).synthetic) event.stopImmediatePropagation();
      },
      true,
    );
  });
}

/** What Chromium does when the app is installable: a beforeinstallprompt event. */
async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
  await page.evaluate((outcome) => {
    window.__promptCalls = 0;
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      synthetic: true,
      platforms: ['web'],
      prompt: () => {
        window.__promptCalls = (window.__promptCalls ?? 0) + 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome, platform: 'web' }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

async function settled(page: Page) {
  await expect(page.getByRole('main')).toBeAttached();
  await page.waitForTimeout(500); // let React mount everything it is going to mount
}

test.beforeEach(async ({ page }) => {
  await onlySyntheticPrompts(page);
});

test('the first visit shows the welcome; the next visit does not', async ({ page }) => {
  await page.goto(at());
  const welcome = page.getByTestId('welcome');
  await expect(welcome).toBeVisible();
  await expect(page.getByRole('dialog', { name: /night shift, operator/i })).toBeVisible();

  await page.getByTestId('welcome-dismiss').click();
  await expect(welcome).toBeHidden();

  await page.reload();
  await settled(page);
  await expect(welcome).toHaveCount(0);
});

test('the welcome is an accessible modal: labelled, focus trapped, Esc dismisses', async ({ page }) => {
  await page.goto(at());
  const welcome = page.getByTestId('welcome');
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveAttribute('aria-modal', 'true');
  await expect(welcome).toHaveAttribute('aria-labelledby', /.+/);
  await expect(page.getByTestId('welcome-tune-in')).toBeFocused();

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await welcome.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await welcome.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(welcome).toBeHidden();
  await page.reload();
  await settled(page);
  await expect(welcome).toHaveCount(0);
});

test('TUNE IN starts playback and closes the card', async ({ page }) => {
  await page.goto(at());
  await page.getByTestId('welcome-tune-in').click();
  await expect(page.getByTestId('welcome')).toBeHidden();
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState), { timeout: 10_000 }).toBe('playing');
});

test('a deep link names the station it patches through to', async ({ page }) => {
  await page.goto(at('station=void-beats'));
  await expect(page.getByTestId('welcome')).toContainText(/patched through to\s+void beats/i);
});

test('desktop Chromium: the install prompt becomes an Install button', async ({ page }) => {
  await page.goto(at());
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('install-button')).toHaveCount(0);
  await expect(page.getByTestId('ios-install-steps')).toHaveCount(0);

  await offerInstall(page);
  const install = page.getByTestId('install-button');
  await expect(install).toBeVisible();
  await install.click();
  expect(await page.evaluate(() => window.__promptCalls)).toBe(1);
  await expect(page.getByTestId('welcome')).toContainText(/docked/i);
  await expect(page.getByTestId('welcome-tune-in')).toBeFocused();
});

test('a declined install prompt is taken gracefully', async ({ page }) => {
  await page.goto(at());
  await offerInstall(page, 'dismissed');
  await page.getByTestId('install-button').click();
  await expect(page.getByTestId('install-button')).toHaveCount(0);
  await expect(page.getByTestId('welcome')).toContainText(/won't bring it up again/i);
});

test('browsers that cannot install get no install section', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  });
  const page = await context.newPage();
  await page.goto(at());
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('install-button')).toHaveCount(0);
  await expect(page.getByTestId('ios-install-steps')).toHaveCount(0);
  await context.close();
});

test.describe('on Android', () => {
  test.use(PIXEL);

  test('the install prompt becomes an Install button', async ({ page }) => {
    await page.goto(at());
    await expect(page.getByTestId('welcome')).toBeVisible();
    await offerInstall(page);
    await page.getByTestId('install-button').click();
    expect(await page.evaluate(() => window.__promptCalls)).toBe(1);
  });
});

test.describe('on iPhone', () => {
  test.use(IPHONE);

  test('the welcome shows the illustrated Add to Home Screen steps', async ({ page }) => {
    await page.goto(at());
    const steps = page.getByTestId('ios-install-steps');
    await expect(steps).toBeAttached();
    await expect(steps.getByRole('listitem')).toHaveCount(3);
    await expect(steps).toContainText(/share/i);
    await expect(steps).toContainText(/add to home screen/i);
    await expect(page.getByTestId('install-button')).toHaveCount(0);
    await steps.scrollIntoViewIfNeeded();
    await expect(steps).toBeVisible();
  });

  test('the installed app (navigator.standalone) shows no welcome', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));
    await page.goto(at());
    await settled(page);
    await expect(page.getByTestId('welcome')).toHaveCount(0);
  });
});

test('the installed app (display-mode: standalone) shows no welcome', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (!/display-mode:\s*standalone/.test(query)) return real(query);
      const noop = () => {};
      return { matches: true, media: query, onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => false };
    };
  });
  await page.goto(at());
  await settled(page);
  await expect(page.getByTestId('welcome')).toHaveCount(0);
});

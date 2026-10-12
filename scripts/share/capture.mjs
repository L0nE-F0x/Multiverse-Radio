// Screenshots a station's pixel-art scene from the scenes lab (/lab/scenes.html, solo mode) at
// 16:9, frozen at a chosen moment so re-runs give the same picture.

/** The scene clock is frozen at this instant (UTC): a quiet hour of the night shift. */
export const SHIFT_TIME = '2026-10-14T23:40:00Z';

export const SCENE_W = 1280;
export const SCENE_H = 720;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} origin dev server origin, e.g. http://127.0.0.1:5423
 * @param {{ scene: string, advance?: number, energy?: number }} shot
 * @returns {Promise<{ png: Buffer, problems: string[] }>}
 */
export async function captureScene(browser, origin, shot) {
  const context = await browser.newContext({
    viewport: { width: SCENE_W, height: SCENE_H },
    deviceScaleFactor: 1,
    timezoneId: 'UTC',
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  try {
    // Fake timers: the scene only moves when the lab's ?advance= steps it, so the frame is
    // the same on every run (and the local hour is the night shift's).
    await page.clock.install({ time: new Date(SHIFT_TIME) });
    const params = new URLSearchParams({
      scene: shot.scene,
      solo: '1',
      aspect: '16:9',
      energy: String(shot.energy ?? 0.45),
      advance: String(shot.advance ?? 24),
    });
    await page.goto(`${origin}/lab/scenes.html?${params}`, { waitUntil: 'load' });
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });

    const deadline = Date.now() + 20_000;
    while (!(await page.evaluate(() => Boolean(window.__runner)))) {
      if (Date.now() > deadline) throw new Error(`scene ${shot.scene} did not start: ${problems.join('; ')}`);
      await sleep(50);
    }
    await sleep(250); // let React commit and the canvas become visible
    const png = await page.screenshot({ type: 'png' });
    return { png, problems };
  } finally {
    await context.close();
  }
}

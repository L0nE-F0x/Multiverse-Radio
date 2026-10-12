// Smoke tests for the production build. Generic selectors only: document.title, landmarks
// and roles, so a full UI redesign doesn't break them.

import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { cspViolations, DIST, watchPage } from './helpers';

const labDir = path.join(DIST, 'lab');
const labPages = existsSync(labDir) ? readdirSync(labDir).filter((file) => file.endsWith('.html')) : [];

test('home page boots without errors', async ({ page }) => {
  const problems = await watchPage(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/Multiverse Radio/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button').first()).toBeVisible();
  await page.waitForTimeout(1_000); // let late requests (fonts, manifests, audio) settle
  expect(await cspViolations(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('pressing play starts the broadcast without errors', async ({ page }) => {
  const problems = await watchPage(page);
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  const play = page.getByRole('button', { name: /play|tune in|listen|power|switch on|start/i }).first();
  test.skip(!(await play.isVisible()), 'no play-like button on the page');
  await play.click();
  await page.waitForTimeout(3_000); // audio engine, voice clips, scene
  expect(await cspViolations(page)).toEqual([]);
  expect(problems).toEqual([]);
});

test('the build has lab pages', () => {
  expect(labPages.length).toBeGreaterThan(0);
});

for (const file of labPages) {
  test(`lab page /lab/${file} loads without errors`, async ({ page }) => {
    const problems = await watchPage(page);
    await page.goto(`/lab/${file}`);
    await expect(page).toHaveTitle(/Multiverse Radio/);
    await expect.poll(() => page.evaluate(() => document.body.innerText.trim().length)).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(await cspViolations(page)).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('unknown paths get the on-brand 404 page', async ({ page }) => {
  const response = await page.goto('/no-such-frequency');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/Multiverse Radio/);
  await expect(page.getByRole('link', { name: /dial/i })).toHaveAttribute('href', '/');
});

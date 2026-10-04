import { expect, test, type Page } from '@playwright/test';

/** Collects uncaught errors and console errors of the page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // HTTP failures are reported with their URL below.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

const progressWidth = (page: Page, i: number) =>
  page.locator('.hud-bar').nth(i).evaluate((el) => parseFloat((el as HTMLElement).style.width) || 0);

test('registration → race with keyboard players → results', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');

  // Registration screen appears once camera + model are ready (or failed gracefully).
  await expect(page.locator('#overlay h1')).toContainText('Reitturnier', { timeout: 60_000 });
  await expect(page.locator('.slot')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/01-registration.png' });

  // Two keyboard riders.
  await page.keyboard.press('t');
  await page.keyboard.press('t');
  await expect(page.locator('.slot.on')).toHaveCount(2);

  await page.keyboard.press('Space');
  await expect(page.locator('.countdown')).toBeVisible();
  await expect(page.locator('.hud-panel')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/02-countdown.png' });

  // Race: player 1 gallops (W), player 2 only trots.
  await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 5_000 });
  await page.keyboard.down('w');
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: 'test-results/03-race.png' });
  const p1 = await progressWidth(page, 0);
  const p2 = await progressWidth(page, 1);
  expect(p1).toBeGreaterThan(0);
  expect(p1).toBeGreaterThan(p2);

  // Debug panel toggles with Ctrl+Alt+D.
  await page.keyboard.up('w');
  await page.keyboard.press('Control+Alt+KeyD');
  await expect(page.locator('.debug')).toBeVisible();
  await expect(page.locator('.debug-live')).toContainText('fps');
  await page.screenshot({ path: 'test-results/04-debug.png' });
  await page.keyboard.press('Control+Alt+KeyD');
  await expect(page.locator('.debug')).toBeHidden();

  // Escape goes back to the registration.
  await page.keyboard.press('Escape');
  await expect(page.locator('#overlay h1')).toContainText('Reitturnier');

  expect(errors).toEqual([]);
});

test('four players get a 2×2 split screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#overlay h1')).toContainText('Reitturnier', { timeout: 60_000 });
  for (let i = 0; i < 5; i++) await page.keyboard.press('t');
  await expect(page.locator('.slot.on')).toHaveCount(4);
  await page.keyboard.press('Space');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6_000 });

  const boxes = await page.locator('.hud-panel').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
  expect(boxes).toHaveLength(4);
  expect(boxes[0]).toMatchObject({ x: 0, y: 0 });
  expect(boxes[3].x).toBeGreaterThan(700);
  expect(boxes[3].y).toBeGreaterThan(400);

  for (const k of ['w', 'i', 'ArrowUp', 'Numpad8']) await page.keyboard.down(k);
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: 'test-results/05-four-players.png' });
  expect(errors).toEqual([]);
});

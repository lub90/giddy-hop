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

  // Two keyboard riders: registered, not ready yet.
  await page.keyboard.press('t');
  await page.keyboard.press('t');
  await expect(page.locator('.slot.registered')).toHaveCount(2);

  // Space = everyone ready → "Laden …"; Esc cancels back to the registration.
  await page.keyboard.press('Space');
  await expect(page.locator('#overlay h1')).toContainText('Laden');
  await expect(page.locator('.slot.ready')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/02-loading.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#overlay h1')).toContainText('Reitturnier');

  // Again, and skip the wait: countdown 3-2-1, then "Los!".
  await page.keyboard.press('Space');
  await expect(page.locator('#overlay h1')).toContainText('Laden');
  await page.keyboard.press('Space');
  await expect(page.locator('.countdown')).toHaveText('3');
  await expect(page.locator('.hud-panel')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/02-countdown.png' });
  await expect(page.locator('.countdown')).toHaveText('Los!', { timeout: 5_000 });

  // Race: player 1 gallops (W), player 2 only trots.
  await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 3_000 });
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
  await expect(page.locator('.slot.registered')).toHaveCount(4);
  await page.keyboard.press('Space');
  await expect(page.locator('#overlay h1')).toContainText('Laden');
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

test('fullscreen button in the start menu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#overlay h1')).toContainText('Reitturnier', { timeout: 60_000 });
  const button = page.locator('[data-action="fullscreen"]');
  await expect(button).toBeVisible();

  await button.click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(button).toBeHidden();
  await page.screenshot({ path: 'test-results/06-fullscreen.png' });

  // Esc is handled by the browser itself; simulate leaving fullscreen.
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(button).toBeVisible();
  expect(errors).toEqual([]);
});

test('course selection on the start screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#overlay h1')).toContainText('Reitturnier', { timeout: 60_000 });
  const select = page.locator('select[data-action="course"]');
  await expect(select.locator('option')).toHaveCount(2);
  const before = await page.locator('.course-info').textContent();

  await select.selectOption('pony-loop');
  await expect(page.locator('.course-info')).not.toHaveText(before!);
  await expect(page.locator('.course-info')).toContainText('2 Sprünge');
  await page.screenshot({ path: 'test-results/07-course-selection.png' });

  // The selection survives a reload.
  await page.reload();
  await expect(page.locator('select[data-action="course"]')).toHaveValue('pony-loop', { timeout: 60_000 });

  await page.keyboard.press('t');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6_000 });
  await page.keyboard.down('w');
  await page.waitForTimeout(2_000);
  expect(await progressWidth(page, 0)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/08-pony-loop.png' });
  expect(errors).toEqual([]);
});

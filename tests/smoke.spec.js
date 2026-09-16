const { test, expect } = require('@playwright/test');

test.describe('Commander Companion basic browser checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  });

  test('landing page loads and primary controls are present', async ({ page }) => {
    await expect(page.locator('#startGameBtn')).toBeVisible();
    await expect(page.locator('#continueBtn')).toBeVisible();
    await expect(page.locator('.landing079-footer')).toContainText('COMMANDER COMPANION');
  });

  test('Start Game opens the game-mode chooser', async ({ page }) => {
    await page.locator('#startGameBtn').click();

    const modeDialog = page.locator('#gameModeDialog');
    await expect(modeDialog).toBeVisible();
    await expect(modeDialog).toContainText('CHOOSE GAME MODE');
    await expect(page.locator('[data-game-mode="fully-tracked"]')).toBeVisible();
  });

  test('Fully Guided opens its setup screen', async ({ page }) => {
    await page.locator('#startGameBtn').click();
    await page.locator('[data-game-mode="fully-tracked"]').click();

    const setupDialog = page.locator('#modeSetupDialog');
    await expect(setupDialog).toBeVisible();
    await expect(page.locator('#modeSetupTitle')).toContainText('FULL PLAY TRACKING');
    await expect(page.locator('#modeProceed')).toBeVisible();
  });

  test('mobile layout does not create obvious horizontal page overflow', async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));

    expect(overflow.page).toBeLessThanOrEqual(overflow.viewport + 2);
  });
});

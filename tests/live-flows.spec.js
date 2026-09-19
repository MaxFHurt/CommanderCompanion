const { test, expect } = require('@playwright/test');

const liveOnly = () => test.skip(!process.env.CC_BASE_URL, 'Live GitHub Pages flow only');

async function openMode(page, mode) {
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#startGameBtn')).toBeVisible();
  await page.locator('#startGameBtn').click();
  await page.locator(`[data-game-mode="${mode}"]`).click();
  await expect(page.locator('#modeSetupDialog')).toBeVisible();
}

test.describe('Commander Companion live game flows', () => {
  test('4-player Table Tracker starts and preserves direct state edits', async ({ page }) => {
    liveOnly();
    await openMode(page, 'table-tracker');

    await page.locator('#modePlayerCount').selectOption('4');
    for (let i = 0; i < 4; i++) {
      await page.locator(`#modeTrackerName${i}`).fill(['Aaron', 'Lex', 'Jemma', 'Player 4'][i]);
    }
    await page.locator('#modeProceed').click();

    const tracker = page.locator('#tabletopScreen');
    await expect(tracker).toBeVisible();
    await expect(page.locator('[data-tt-player]')).toHaveCount(4);
    await expect(tracker).toContainText('Aaron');
    await expect(tracker).toContainText('Lex');
    await expect(tracker).toContainText('Jemma');

    const aaron = page.locator('[data-tt-player]').filter({ hasText: 'Aaron' });
    const life = aaron.locator('[data-tt-stat-value="life"]');
    await expect(life).toHaveText('40');

    await aaron.locator('[data-tt-inline-stat="life"][data-delta="-1"]').click();
    await expect(life).toHaveText('39');

    await aaron.locator('[data-tt-inline-stat="poison"][data-delta="1"]').click();
    await expect(aaron.locator('[data-tt-stat-value="poison"]')).toHaveText('1');

    await aaron.locator('[data-tt-inline-stat="+1/+1"][data-delta="1"]').click();
    await expect(aaron.locator('[data-tt-stat-value="+1/+1"]')).toHaveText('1');

    await aaron.locator('[data-tt-inline-mana="G"][data-delta="1"]').click();
    await expect(aaron.locator('[data-tt-mana-value="G"]')).toHaveText('1');

    await expect(page.locator('.tracker-log-scroll')).toContainText('Aaron');
  });

  test('Freeplay launches into the live game chassis', async ({ page }) => {
    liveOnly();
    await openMode(page, 'freeplay');
    await page.locator('#modePlayerCount').selectOption('2');
    await page.locator('#modeProceed').click();

    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#gameContent')).not.toBeEmpty();
    await expect(page.locator('[data-action="next-phase"]')).toBeVisible();
    await expect(page.locator('[data-action="end-turn"]')).toBeVisible();
  });

  test('Fully Guided loads Turtle Power vs Wakanda Forever and reaches live gameplay', async ({ page }) => {
    liveOnly();
    test.setTimeout(240_000);

    await openMode(page, 'fully-tracked');
    await page.locator('#modeProceed').click();
    await expect(page.locator('#setupDialog')).toBeVisible();

    const panels = page.locator('[data-player-setup]');
    await expect(panels).toHaveCount(2);

    async function loadPrecon(panelIndex, query) {
      const panel = panels.nth(panelIndex);
      await panel.locator('.setup-precon').click();
      await expect(page.locator('#preconFilter')).toBeVisible({ timeout: 60_000 });
      await page.locator('#preconFilter').fill(query);
      const result = page.locator('#preconResults [data-precon]').first();
      await expect(result).toBeVisible({ timeout: 30_000 });
      await result.click();
      await expect.poll(async () => panel.locator('.setup-deck').inputValue(), { timeout: 60_000 }).not.toBe('');
      await expect.poll(async () => panel.locator('.setup-cmd1').inputValue(), { timeout: 60_000 }).not.toBe('');
    }

    await loadPrecon(0, 'Turtle Power');
    await loadPrecon(1, 'Wakanda Forever');
    await panels.nth(0).locator('.setup-name').fill('Aaron');
    await panels.nth(1).locator('.setup-name').fill('Lex');

    await page.locator('#startSetupBtn').click();
    await expect(page.locator('#modalTitle')).toContainText('OPENING HAND', { timeout: 180_000 });
    await expect(page.locator('[data-opening-card]')).toHaveCount(7);

    await page.getByRole('button', { name: 'CONFIRM & NEXT' }).click();
    await expect(page.locator('#modalTitle')).toContainText('OPENING HAND', { timeout: 30_000 });
    await expect(page.locator('[data-opening-card]')).toHaveCount(7);

    await page.getByRole('button', { name: 'START GAME' }).click();
    await expect(page.locator('#gameScreen')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#gameContent')).not.toBeEmpty();
    await expect(page.locator('.visual-hand-zone')).toBeVisible();
    await expect(page.locator('.hand-card')).toHaveCount(7);
    await expect(page.locator('[data-action="next-phase"]')).toBeVisible();
  });
});

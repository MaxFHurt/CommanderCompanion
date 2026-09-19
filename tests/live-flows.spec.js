const { test, expect } = require('@playwright/test');

const liveOnly = () => test.skip(!process.env.CC_BASE_URL, 'Live GitHub Pages flow only');

async function openMode(page, mode) {
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
  await expect(page.locator('#startGameBtn')).toBeVisible();
  await page.locator('#startGameBtn').click();
  await expect(page.locator('#gameModeDialog')).toBeVisible();
  await page.locator(`[data-game-mode="${mode}"]`).click();
  await expect(page.locator('#modeSetupDialog')).toBeVisible();
}

async function disableSmartSkipsIfPrompted(page) {
  const modal = page.locator('#modal:visible');
  if (!(await modal.count())) return false;
  const title = (await page.locator('#modalTitle').textContent()) || '';
  if (!/AUTOMATIC PHASE SKIPPING/i.test(title)) return false;
  await page.locator('#modalActions').getByRole('button', { name: /DON.T SKIP PHASES/i }).click();
  await expect(page.locator('#modal')).not.toBeVisible();
  return true;
}

async function savedGame(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('commander-companion-v0.7');
    return raw ? JSON.parse(raw).game : null;
  });
}

function locateTrackedCard(game, instanceId) {
  if (!game) return null;
  for (const player of game.players || []) {
    for (const zone of ['hand','battlefield','graveyard','exile','tokens','attachments','commandZone','remainingLibrary']) {
      const card = (player.deck?.[zone] || []).find(c => c.instanceId === instanceId);
      if (card) return { playerId: player.playerId, playerName: player.displayName, zone, card };
    }
  }
  return null;
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

    await page.locator('#modalActions button[data-action-label="START GAME"]').click();
    await expect(page.locator('#gameScreen')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#gameContent')).not.toBeEmpty();
    await expect(page.locator('.visual-hand-zone')).toBeVisible();
    await expect(page.locator('.visual-hand-zone:visible .hand-card')).toHaveCount(7);
    await expect(page.locator('[data-action="next-phase"]:visible').first()).toBeVisible();

    // Make phase progression deterministic for this live integrity pass.
    await disableSmartSkipsIfPrompted(page);

    // Reach Draw, perform a tracked random draw, and verify the live hand becomes eight.
    const phase = page.locator('.battle-phase-indicator:visible b');
    for (let i = 0; i < 4; i++) {
      if (/DRAW/i.test((await phase.textContent()) || '')) break;
      await page.locator('[data-action="next-phase"]:visible').first().click();
      await disableSmartSkipsIfPrompted(page);
    }
    await expect(phase).toContainText(/DRAW/i);
    await page.locator('[data-action="draw"]:visible').first().click();
    await expect(page.locator('#modalTitle')).toContainText('DRAW CARD', { timeout: 60_000 });
    await page.locator('#modalActions').getByRole('button', { name: 'RANDOM DRAW', exact: true }).click();
    await expect(page.locator('#modalTitle')).toContainText('RANDOM VIRTUAL DRAW');
    await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM RANDOM DRAW', exact: true }).click();
    await disableSmartSkipsIfPrompted(page);
    await expect(page.locator('.visual-hand-zone:visible .hand-card')).toHaveCount(8);

    // End Turn with eight cards must enter cleanup. Reviewing/canceling a discard must not mutate hand state.
    await page.locator('[data-action="end-turn"]:visible').first().click();
    await expect(page.locator('#modalTitle')).toContainText('CLEANUP — DISCARD');
    await expect(page.locator('[data-discard-review]')).toHaveCount(8);
    await page.locator('[data-discard-review]').first().click();
    await expect(page.locator('#modalTitle')).toContainText(/DISCARD —/i);
    await expect(page.locator('.visual-hand-zone:visible .hand-card')).toHaveCount(8);
    await page.locator('#modalActions').getByRole('button', { name: 'CANCEL', exact: true }).click();
    await expect(page.locator('#modalTitle')).toContainText('CLEANUP — DISCARD');
    await expect(page.locator('.visual-hand-zone:visible .hand-card')).toHaveCount(8);

    // Confirming the cleanup discard must move exactly one card and pass the turn.
    const discardedId = await page.locator('[data-discard-review]').first().getAttribute('data-discard-review');
    expect(discardedId).toBeTruthy();
    await page.locator('[data-discard-review]').first().click();
    await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM DISCARD', exact: true }).click();
    await disableSmartSkipsIfPrompted(page);

    const afterDiscard = await savedGame(page);
    const locatedAfterDiscard = locateTrackedCard(afterDiscard, discardedId);
    expect(locatedAfterDiscard, 'confirmed discard must preserve the exact card instance').toBeTruthy();
    expect(locatedAfterDiscard.playerName).toBe('Aaron');
    expect(locatedAfterDiscard.zone).toBe('graveyard');

    await expect(page.locator('.player-name:visible')).toContainText('Lex');
    await expect(page.locator('.visual-hand-zone:visible .hand-card')).toHaveCount(7);

    // Pass Lex's turn so Aaron owns the active controls again.
    await page.locator('[data-action="end-turn"]:visible').first().click();
    await expect(page.locator('#modalTitle')).toContainText('END TURN?');
    await page.locator('#modalActions').getByRole('button', { name: 'END TURN', exact: true }).click();
    await disableSmartSkipsIfPrompted(page);
    await expect(page.locator('.player-name:visible')).toContainText('Aaron');

    const afterRoundTrip = await savedGame(page);
    const locatedAfterRoundTrip = locateTrackedCard(afterRoundTrip, discardedId);
    expect(locatedAfterRoundTrip, 'discarded card must survive subsequent turn changes').toBeTruthy();
    expect(locatedAfterRoundTrip.playerName).toBe('Aaron');
    expect(locatedAfterRoundTrip.zone).toBe('graveyard');

    // The discarded card is in Aaron's graveyard and a graveyard card must never expose Tap controls.
    await page.locator('[data-zone-open="graveyard"]:visible').click();
    await expect(page.locator('#modalTitle')).toContainText('GRAVEYARD');
    const graveCards = page.locator('#modalContent .mini-card[data-instance]');
    await expect(graveCards).toHaveCount(afterRoundTrip.players.find(p => p.displayName === 'Aaron').deck.graveyard.length);
    expect(await graveCards.count()).toBeGreaterThanOrEqual(1);
    const discardedInModal = page.locator(`#modalContent .mini-card[data-instance="${discardedId}"]`);
    await expect(discardedInModal).toHaveCount(1);
    await discardedInModal.click();
    const graveActions = (await page.locator('#modalActions button').allTextContents()).map(x => x.trim());
    expect(graveActions.some(x => /TAP/i.test(x))).toBe(false);
    await page.locator('#modalActions').getByRole('button', { name: 'CLOSE', exact: true }).click();

    // Undo must restore the immediately preceding phase transition.
    const phaseBefore = ((await phase.textContent()) || '').trim();
    await page.locator('[data-action="next-phase"]:visible').first().click();
    await expect.poll(async () => ((await phase.textContent()) || '').trim()).not.toBe(phaseBefore);
    await page.locator('[data-log-undo]:visible').click();
    await expect(page.locator('#modalTitle')).toContainText('CONFIRM UNDO');
    await page.locator('#modalActions').getByRole('button', { name: 'UNDO LAST STEP', exact: true }).click();
    await expect.poll(async () => ((await phase.textContent()) || '').trim()).toBe(phaseBefore);
  });
});

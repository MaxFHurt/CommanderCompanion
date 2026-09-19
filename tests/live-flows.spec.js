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
  const stackObject = (game.stack || []).find(x => x?.card?.instanceId === instanceId);
  if (stackObject) {
    const player = (game.players || []).find(p => p.playerId === stackObject.controllerId);
    return { playerId: player?.playerId || null, playerName: player?.displayName || null, zone: 'stack', card: stackObject.card, stackObject };
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

    // Target the historical "available mana shows 0 while the source is usable" regression
    // with an untapped flexible land that is actually still available in this shuffled precon.
    for (let i = 0; i < 4; i++) {
      if (/DRAW/i.test((await phase.textContent()) || '')) break;
      await page.locator('[data-action="next-phase"]:visible').first().click();
      await disableSmartSkipsIfPrompted(page);
    }
    await expect(phase).toContainText(/DRAW/i);

    const beforeFlexDraw = await savedGame(page);
    const aaronBeforeFlexDraw = beforeFlexDraw.players.find(p => p.displayName === 'Aaron');
    const flexDefs = beforeFlexDraw.cardDefinitions || {};
    const flexibleLand = [...(aaronBeforeFlexDraw.deck.hand || []), ...(aaronBeforeFlexDraw.deck.remainingLibrary || [])]
      .map(card => ({ card, def: flexDefs[card.definitionId] }))
      .filter(x => {
        const type = String(x.def?.typeLine || '');
        const text = String(x.def?.oracleText || '');
        return /Land/i.test(type)
          && /Add/i.test(text)
          && (/mana of any color/i.test(text) || new Set([...text.matchAll(/\{([WUBRGC])\}/g)].map(m => m[1])).size > 1)
          && !/enters(?: the battlefield)? tapped/i.test(text);
      })
      .sort((a,b) => (a.def.name === 'Command Tower' ? -1 : 0) - (b.def.name === 'Command Tower' ? -1 : 0))[0];
    expect(flexibleLand, 'Turtle Power should retain at least one untapped flexible land in hand or library').toBeTruthy();

    const flexId = flexibleLand.card.instanceId;
    const flexName = flexibleLand.def.name;
    const flexWasInHand = (aaronBeforeFlexDraw.deck.hand || []).some(c => c.instanceId === flexId);

    await page.locator('[data-action="draw"]:visible').first().click();
    await expect(page.locator('#modalTitle')).toContainText('DRAW CARD', { timeout: 60_000 });
    if (flexWasInHand) {
      await page.locator('#modalActions').getByRole('button', { name: 'RANDOM DRAW', exact: true }).click();
      await expect(page.locator('#modalTitle')).toContainText('RANDOM VIRTUAL DRAW');
      await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM RANDOM DRAW', exact: true }).click();
    } else {
      await page.locator('#drawSearch').fill(flexName);
      const flexResult = page.locator(`[data-draw-id="${flexId}"]`);
      await expect(flexResult).toBeVisible({ timeout: 30_000 });
      await flexResult.click();
      await expect(page.locator('#modalTitle')).toContainText('CONFIRM DRAW');
      await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM DRAW / ADD TO HAND', exact: true }).click();
    }
    await expect(phase).toContainText(/MAIN 1/i);

    let manaState = await savedGame(page);
    let flexLocation = locateTrackedCard(manaState, flexId);
    expect(flexLocation?.playerName).toBe('Aaron');
    expect(flexLocation?.zone).toBe('hand');

    await page.locator(`[data-hand-card="${flexId}"]:visible`).click();
    await expect(page.locator('#modalTitle')).toContainText(flexName);
    await page.locator('#modalActions').getByRole('button', { name: 'PLAY LAND', exact: true }).click();
    await expect(page.locator('#modal')).not.toBeVisible();

    manaState = await savedGame(page);
    flexLocation = locateTrackedCard(manaState, flexId);
    expect(flexLocation?.zone).toBe('battlefield');
    expect(flexLocation?.card?.manaCapacityRegistered).toBe(true);
    expect((flexLocation?.card?.manaCapacityOptions || []).length).toBeGreaterThan(1);
    expect(flexLocation?.card?.tapped).toBe(false);

    const flexibleMana = page.locator('.mana-box-button.available-only:visible .mana-flex').first();
    await expect(flexibleMana).toBeVisible();
    await expect(flexibleMana.locator('b')).toHaveText('1');

    // Battlefield card counters must be visible directly on the card, not only inside the counter menu.
    await page.locator(`.battlefield [data-instance="${flexId}"]`).click();
    await page.locator('#modalActions').getByRole('button', { name: 'COUNTERS', exact: true }).click();
    const plusOne = page.locator('#modalContent [data-cc="+1/+1"][data-d="1"]');
    await expect(plusOne).toBeVisible();
    await plusOne.click();
    await page.locator('#modalActions').getByRole('button', { name: 'DONE', exact: true }).click();

    const flexBattlefield = page.locator(`.battlefield [data-instance="${flexId}"]`);
    await expect(flexBattlefield.locator('.card-counter-badge')).toContainText('+1/+1 ×1');
    const counterState = await savedGame(page);
    expect(locateTrackedCard(counterState, flexId)?.card?.counters?.['+1/+1']).toBe(1);
  });

  test('Guided stack pause survives Back and is visible in Game History', async ({ page }) => {
    liveOnly();
    test.setTimeout(240_000);

    const qaDeck = [
      '1 Kenrith, the Returned King',
      '1 Brainstorm',
      '1 Reanimate',
      '1 Malakir Rebirth',
      '1 Sol Ring',
      '1 Command Tower',
      '94 Island'
    ].join('\n');

    await openMode(page, 'fully-tracked');
    await page.locator('#modeProceed').click();
    await expect(page.locator('#setupDialog')).toBeVisible();

    const panels = page.locator('[data-player-setup]');
    await expect(panels).toHaveCount(2);

    async function configureQaPlayer(index, name) {
      const panel = panels.nth(index);
      await panel.locator('.setup-name').fill(name);
      await panel.locator('.setup-deck').fill(qaDeck);
      await panel.locator('.setup-pick-cmd1').click();
      await expect(page.locator('#commanderSearchInput')).toBeVisible({ timeout: 120_000 });
      await page.locator('#commanderSearchInput').fill('Kenrith, the Returned King');
      const result = page.locator('[data-command-result]').filter({ hasText: 'Kenrith, the Returned King' }).first();
      await expect(result).toBeVisible({ timeout: 60_000 });
      await result.click();
      await expect(panel.locator('.setup-cmd1')).toHaveValue('Kenrith, the Returned King');
    }

    await configureQaPlayer(0, 'QA Aaron');
    await configureQaPlayer(1, 'QA Lex');

    await page.locator('#startSetupBtn').click();
    await expect(page.locator('#modalTitle')).toContainText('OPENING HAND', { timeout: 180_000 });
    await page.getByRole('button', { name: 'CONFIRM & NEXT' }).click();
    await expect(page.locator('#modalTitle')).toContainText('OPENING HAND', { timeout: 30_000 });
    await page.locator('#modalActions button[data-action-label="START GAME"]').click();
    await expect(page.locator('#gameScreen')).toBeVisible({ timeout: 30_000 });
    await disableSmartSkipsIfPrompted(page);

    const phase = page.locator('.battle-phase-indicator:visible b');
    for (let i = 0; i < 4; i++) {
      if (/DRAW/i.test((await phase.textContent()) || '')) break;
      await page.locator('[data-action="next-phase"]:visible').first().click();
      await disableSmartSkipsIfPrompted(page);
    }
    await expect(phase).toContainText(/DRAW/i);

    const beforeDraw = await savedGame(page);
    const qaAaron = beforeDraw.players.find(p => p.displayName === 'QA Aaron');
    const brainDef = Object.values(beforeDraw.cardDefinitions || {}).find(d => d.name === 'Brainstorm');
    expect(brainDef).toBeTruthy();
    const brainCard = [...(qaAaron.deck.hand || []), ...(qaAaron.deck.remainingLibrary || [])].find(c => c.definitionId === brainDef.definitionId);
    expect(brainCard).toBeTruthy();
    const brainId = brainCard.instanceId;
    const brainInHand = (qaAaron.deck.hand || []).some(c => c.instanceId === brainId);

    await page.locator('[data-action="draw"]:visible').first().click();
    await expect(page.locator('#modalTitle')).toContainText('DRAW CARD');
    if (brainInHand) {
      await page.locator('#modalActions').getByRole('button', { name: 'RANDOM DRAW', exact: true }).click();
      await expect(page.locator('#modalTitle')).toContainText('RANDOM VIRTUAL DRAW');
      await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM RANDOM DRAW', exact: true }).click();
    } else {
      await page.locator('#drawSearch').fill('Brainstorm');
      const brainResult = page.locator(`[data-draw-id="${brainId}"]`);
      await expect(brainResult).toBeVisible({ timeout: 30_000 });
      await brainResult.click();
      await expect(page.locator('#modalTitle')).toContainText('CONFIRM DRAW');
      await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM DRAW / ADD TO HAND', exact: true }).click();
    }
    await expect(phase).toContainText(/MAIN 1/i);

    const mainState = await savedGame(page);
    const mainAaron = mainState.players.find(p => p.displayName === 'QA Aaron');
    const islandDef = Object.values(mainState.cardDefinitions || {}).find(d => d.name === 'Island' && /Basic/i.test(String(d.typeLine || '')));
    expect(islandDef).toBeTruthy();
    const island = (mainAaron.deck.hand || []).find(c => c.definitionId === islandDef.definitionId);
    expect(island).toBeTruthy();

    await page.locator(`[data-hand-card="${island.instanceId}"]:visible`).click();
    await page.locator('#modalActions').getByRole('button', { name: 'PLAY LAND', exact: true }).click();
    await expect(page.locator('#modal')).not.toBeVisible();

    await page.locator(`[data-hand-card="${brainId}"]:visible`).click();
    await expect(page.locator('#modalActions').getByRole('button', { name: 'CAST INSTANT', exact: true })).toBeVisible();
    await page.locator('#modalActions').getByRole('button', { name: 'CAST INSTANT', exact: true }).click();

    await expect(page.locator('#modalTitle')).toContainText('ORACLE RESOLUTION REQUIRED', { timeout: 30_000 });
    const pending = await savedGame(page);
    expect(pending.stack?.length).toBe(1);
    expect(locateTrackedCard(pending, brainId)?.zone).toBe('stack');
    expect(pending.log.some(e => e.type === 'cast-spell' && String(e.text || '').includes('Brainstorm'))).toBe(true);
    expect(pending.log.some(e => e.type === 'resolve-stack' && String(e.text || '').includes('Brainstorm'))).toBe(false);
    await expect(page.locator('.inline-game-log:visible')).toContainText('RESOLUTION REQUIRED');

    // Back is navigation only: it must never silently accept/resolve the pending Oracle result.
    await page.locator('#modalClose').click();
    await expect(page.locator('#modal')).not.toBeVisible();
    const afterBack = await savedGame(page);
    expect(afterBack.stack?.length).toBe(1);
    expect(locateTrackedCard(afterBack, brainId)?.zone).toBe('stack');
    expect(afterBack.log.some(e => e.type === 'resolve-stack' && String(e.text || '').includes('Brainstorm'))).toBe(false);

    await page.locator('.inline-game-log:visible').click();
    await expect(page.locator('#modalTitle')).toHaveText('GAME HISTORY');
    await expect(page.locator('.game-history-live-stack')).toBeVisible();
    await expect(page.locator('.stack-summary')).toContainText('Brainstorm');
    await expect(page.locator('#modalActions').getByRole('button', { name: 'RESOLVE NOW', exact: true })).toBeVisible();
    await expect(page.locator('#modalActions').getByRole('button', { name: 'CLEAR STACK', exact: true })).toBeVisible();

    // Clear Stack is a recovery rewind. Cancel must not commit anything.
    await page.locator('#modalActions').getByRole('button', { name: 'CLEAR STACK', exact: true }).click();
    await expect(page.locator('#modalTitle')).toContainText('CLEAR STACK — RECOVERY');
    await page.locator('#modalActions').getByRole('button', { name: 'CANCEL', exact: true }).click();
    await expect(page.locator('#modalTitle')).toHaveText('GAME HISTORY');
    const afterClearCancel = await savedGame(page);
    expect(afterClearCancel.stack?.length).toBe(1);
    expect(locateTrackedCard(afterClearCancel, brainId)?.zone).toBe('stack');

    // Confirming recovery must return the exact spell and paid Island to their pre-cast state.
    await page.locator('#modalActions').getByRole('button', { name: 'CLEAR STACK', exact: true }).click();
    await expect(page.locator('#modalTitle')).toContainText('CLEAR STACK — RECOVERY');
    await page.locator('#modalActions').getByRole('button', { name: 'CLEAR STACK', exact: true }).click();

    const recovered = await savedGame(page);
    expect(recovered.stack?.length || 0).toBe(0);
    expect(recovered.priorityState?.active || false).toBe(false);
    expect(locateTrackedCard(recovered, brainId)?.zone).toBe('hand');
    expect(locateTrackedCard(recovered, island.instanceId)?.card?.tapped).toBe(false);
    expect(recovered.log.some(e => e.type === 'stack-recovery' && /No stack object was resolved/i.test(String(e.text || '')))).toBe(true);
  });
});

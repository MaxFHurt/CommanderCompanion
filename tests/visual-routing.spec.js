const { test, expect } = require('@playwright/test');

async function ready(page, path='index.html') {
  const errors=[];
  page.on('pageerror', e=>errors.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error') errors.push(`console: ${m.text()}`); });
  await page.goto(path, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(()=>window.__ccAppReady===true, null, {timeout:30000});
  return errors;
}
async function startMode(page, mode, players='2') {
  await page.locator('#startGameBtn').click();
  await expect(page.locator('#gameModeDialog')).toBeVisible();
  await page.locator(`[data-game-mode="${mode}"]`).click();
  await expect(page.locator('#modeSetupDialog')).toBeVisible();
  await page.locator('#modePlayerCount').selectOption(players);
  if(mode==='table-tracker') {
    const names=['Aaron','Lex','Charlie','Diana'];
    for(let i=0;i<Number(players);i++) await page.locator(`#modeTrackerName${i}`).fill(names[i]||`Player ${i+1}`);
  }
  await page.locator('#modeProceed').click();
}
async function closeModal(page) {
  if(await page.locator('#modal').isVisible()) {
    await page.locator('#modalClose').click();
    await expect(page.locator('#modal')).not.toBeVisible();
  }
}
async function expectModal(page, title) {
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#modalTitle')).toContainText(title);
}

test.describe('V0.8 CF visual/routing tap-through', ()=>{
  test('landing buttons route to correct surfaces', async ({page})=>{
    const errors=await ready(page);
    await expect(page).toHaveTitle(/V0\.8 CF/);
    await page.locator('#profileLandingBtn').click(); await expectModal(page,'PLAYER PROFILE'); await closeModal(page);
    await page.locator('#deckBuilderVisibleBtn').click(); await expect(page.locator('#deckDialog')).toBeVisible(); await page.locator('#deckDialogBack').click(); await expect(page.locator('#deckDialog')).not.toBeVisible();
    await page.locator('#settingsLandingBtnBottom').click(); await expectModal(page,'SETTINGS'); await closeModal(page);
    await page.locator('#helpLandingBtn').click(); await expectModal(page,'PLAYER RESCUE'); await closeModal(page);
    await page.locator('#startGameBtn').click(); await expect(page.locator('#gameModeDialog')).toBeVisible(); await page.locator('#gameModeClose').click(); await expect(page.locator('#gameModeDialog')).not.toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Guided/Freeplay top rail, zones, phase and undo routes are wired', async ({page})=>{
    await page.setViewportSize({width:932,height:430});
    const errors=await ready(page);
    await startMode(page,'freeplay','2');
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('.landscape-game-master')).toBeVisible();
    await expect(page.locator('.shared-battle-phase-head')).toContainText('BATTLEFIELD');
    await expect(page.locator('.custom-land-row')).toContainText('LANDS');
    await expect(page.locator('.shared-battle-phase-head')).not.toContainText('YOUR BATTLEFIELD');
    await expect(page.locator('.custom-land-row')).not.toContainText('YOUR LANDS');
    const hubChecks=[['card-id','CARD ID'],['chat','GAME CHAT'],['rescue','PLAYER RESCUE'],['settings','GAME CONTROLS & SETTINGS'],['profile','PLAYER PROFILE']];
    for(const [hub,title] of hubChecks){ await page.locator(`[data-hub="${hub}"]`).first().click(); await expectModal(page,title); await closeModal(page); }
    for(const zone of ['graveyard','exile','tokens','attachments']){ await page.locator(`[data-zone-open="${zone}"]`).first().click(); await expect(page.locator('#modal')).toBeVisible(); await closeModal(page); }
    await page.locator('[data-action="next-phase"]').click(); await expect(page.locator('#gameScreen')).toBeVisible();
    await page.locator('[data-log-undo="1"]').click(); await expectModal(page,'CONFIRM UNDO'); await closeModal(page);
    await page.locator('[data-hub="home"]').first().click(); await expectModal(page,'RETURN HOME'); await closeModal(page);
    expect(errors).toEqual([]);
  });

  test('Table Tracker master controls all route correctly and direct edits work', async ({page})=>{
    await page.setViewportSize({width:932,height:430});
    const errors=await ready(page);
    await startMode(page,'table-tracker','4');
    await expect(page.locator('#tabletopScreen')).toBeVisible();
    await expect(page.locator('[data-tt-player]')).toHaveCount(4);
    await expect(page.locator('.tracker-side-rail')).toBeVisible();
    await expect(page.locator('.tracker-bottom-bar')).toBeVisible();
    const first=page.locator('[data-tt-player]').first();
    const life=first.locator('[data-tt-stat-value="life"]');
    await expect(life).toHaveText('40');
    await first.locator('[data-tt-inline-stat="life"][data-delta="-1"]').click(); await expect(life).toHaveText('39');
    await first.locator('[data-tt-inline-stat="poison"][data-delta="1"]').click(); await expect(first.locator('[data-tt-stat-value="poison"]')).toHaveText('1');
    await first.locator('[data-tt-inline-mana="G"][data-delta="1"]').click(); await expect(first.locator('[data-tt-mana-value="G"]')).toHaveText('1');
    const hubChecks=[['card-id','CARD ID'],['chat','GAME CHAT'],['rescue','PLAYER RESCUE'],['settings','GAME CONTROLS & SETTINGS'],['profile','PLAYER PROFILE']];
    for(const [hub,title] of hubChecks){ await page.locator(`#tabletopScreen [data-hub="${hub}"]`).first().click(); await expectModal(page,title); await closeModal(page); }
    await page.locator('#trackerJudge').click(); await expectModal(page,'PLAYER RESCUE'); await closeModal(page);
    await page.locator('#trackerEditPlayers').click(); await expectModal(page,'EDIT PLAYERS'); await closeModal(page);
    await page.locator('#trackerEditDecks').click(); await expect(page.locator('#deckDialog')).toBeVisible(); await page.locator('#deckDialogBack').click();
    await page.locator('#trackerGameStats').click(); await expect(page.locator('#modal')).toBeVisible(); await closeModal(page);
    await page.locator('#trackerCounters').click(); await expectModal(page,'COUNTERS'); await closeModal(page);
    await page.locator('#trackerLife').click(); await expectModal(page,'LIFE'); await closeModal(page);
    await page.locator('#trackerStatus').click(); await expectModal(page,'STATUS'); await closeModal(page);
    await page.locator('#trackerMana').click(); await expectModal(page,'MANA'); await closeModal(page);
    await page.locator('#trackerClearLog').click(); await expectModal(page,'CLEAR GAME LOG'); await closeModal(page);
    await page.locator('#trackerResetGame').click(); await expect(page.locator('#modal')).toBeVisible(); await closeModal(page);
    await page.locator('#trackerHome').click(); await expect(page.locator('#landing')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('iPad uses same Guided/Freeplay composition scaled into one landscape viewport', async ({page})=>{
    await page.setViewportSize({width:1366,height:1024});
    const errors=await ready(page,'ipad.html');
    await startMode(page,'freeplay','2');
    await page.evaluate(()=>{document.body.classList.remove('cc-device-iphone','cc-device-other-phone');document.body.classList.add('cc-device-ipad');});
    const rects=await page.evaluate(()=>{ const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return {l:x.left,r:x.right,t:x.top,b:x.bottom,w:x.width,h:x.height}}; return {master:r('.landscape-game-master'),left:r('.player-hero'),battle:r('.battle-panel'),right:r('.landscape-right-rail'),hand:r('.landscape-hand-zone'),action:r('.landscape-action-rail')}; });
    expect(rects.master.w).toBeLessThanOrEqual(1366); expect(rects.master.h).toBeLessThanOrEqual(1024);
    expect(rects.left.r).toBeLessThanOrEqual(rects.battle.l+1); expect(rects.battle.r).toBeLessThanOrEqual(rects.right.l+1);
    expect(rects.hand.l).toBeGreaterThanOrEqual(rects.battle.l-1); expect(rects.hand.r).toBeLessThanOrEqual(rects.battle.r+1);
    expect(rects.action.l).toBeGreaterThanOrEqual(rects.battle.l-1); expect(rects.action.r).toBeLessThanOrEqual(rects.battle.r+1);
    expect(errors).toEqual([]);
  });
});
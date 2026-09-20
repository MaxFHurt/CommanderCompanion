const { test, expect } = require('@playwright/test');

async function ready(page,path='index.html'){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!/favicon/i.test(m.text()))errors.push('console: '+m.text())});
  await page.goto(path,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ccAppReady===true,null,{timeout:30000});
  return errors;
}
async function startMode(page,mode,players='2'){
  await page.locator('#startGameBtn').click();
  await page.locator('[data-game-mode="'+mode+'"]').click();
  await page.locator('#modePlayerCount').selectOption(players);
  if(mode==='table-tracker'){const names=['Aaron','Lex','Charlie','Diana'];for(let i=0;i<Number(players);i++)await page.locator('#modeTrackerName'+i).fill(names[i]);}
  await page.locator('#modeProceed').click();
}
async function closeModal(page){if(await page.locator('#modal').isVisible()){await page.locator('#modalClose').click();await expect(page.locator('#modal')).not.toBeVisible()}}
async function expectModal(page,title){await expect(page.locator('#modal')).toBeVisible();await expect(page.locator('#modalTitle')).toContainText(title)}
const visibleHub=(page,hub,scope='')=>page.locator((scope?scope+' ':'')+'[data-hub="'+hub+'"]:visible').first();

test.describe('V0.8 CG visual and routing tap-through',()=>{
  test('landing buttons route correctly',async({page})=>{
    const errors=await ready(page);
    await expect(page).toHaveTitle(/V0\.8 CG/);
    await page.locator('#profileLandingBtn').click();await expectModal(page,'MY ACCOUNT');await closeModal(page);
    await page.locator('#deckBuilderVisibleBtn').click();await expect(page.locator('#deckDialog')).toBeVisible();await page.locator('#deckDialogBack').click();
    await page.locator('#settingsLandingBtnBottom').click();await expectModal(page,'SETTINGS');await closeModal(page);
    await page.locator('#helpLandingBtn').click();await expect(page.locator('#modal')).toBeVisible();await closeModal(page);
    await page.locator('#startGameBtn').click();await expect(page.locator('#gameModeDialog')).toBeVisible();await page.locator('#gameModeClose').click();
    expect(errors).toEqual([]);
  });

  test('Guided/Freeplay top rail, zones, phase and undo are routed',async({page})=>{
    await page.setViewportSize({width:932,height:430});const errors=await ready(page);await startMode(page,'freeplay','2');
    await expect(page.locator('.landscape-game-master')).toBeVisible();
    await expect(page.locator('.shared-battle-phase-head')).toContainText('BATTLEFIELD');
    await expect(page.locator('.custom-land-row')).toContainText('LANDS');
    for(const [hub,title] of [['card-id','CARD ID'],['chat','GAME CHAT'],['rescue','PLAYER RESCUE'],['settings','GAME CONTROLS & SETTINGS'],['profile','PLAYER PROFILE']]){
      await visibleHub(page,hub,'.landscape-game-topbar').click();await expectModal(page,title);await closeModal(page);
    }
    for(const zone of ['graveyard','exile','tokens','attachments']){await page.locator('[data-zone-open="'+zone+'"]:visible').first().click();await expect(page.locator('#modal')).toBeVisible();await closeModal(page)}
    await page.locator('[data-action="next-phase"]:visible').click();await expect(page.locator('#gameScreen')).toBeVisible();
    await page.locator('[data-log-undo="1"]:visible').click();await expect(page.locator('#modal')).toBeVisible();await closeModal(page);
    await visibleHub(page,'home','.landscape-game-topbar').click();await expectModal(page,'RETURN HOME');await closeModal(page);
    await page.screenshot({path:'test-results/cg-freeplay-iphone.png',fullPage:true});
    expect(errors).toEqual([]);
  });

  test('Table Tracker buttons and direct edits are routed',async({page})=>{
    await page.setViewportSize({width:932,height:430});const errors=await ready(page);await startMode(page,'table-tracker','4');
    await expect(page.locator('#tabletopScreen')).toBeVisible();await expect(page.locator('[data-tt-player]')).toHaveCount(4);
    await expect(page.locator('.tracker-side-rail')).toBeVisible();await expect(page.locator('.tracker-bottom-bar')).toBeVisible();
    const first=page.locator('[data-tt-player]').first(),life=first.locator('[data-tt-stat-value="life"]');
    await expect(life).toHaveText('40');await first.locator('[data-tt-inline-stat="life"][data-delta="-1"]').click();await expect(life).toHaveText('39');
    await first.locator('[data-tt-inline-stat="poison"][data-delta="1"]').click();await expect(first.locator('[data-tt-stat-value="poison"]')).toHaveText('1');
    await first.locator('[data-tt-inline-mana="G"][data-delta="1"]').click();await expect(first.locator('[data-tt-mana-value="G"]')).toHaveText('1');
    for(const [hub,title] of [['card-id','CARD ID'],['chat','GAME CHAT'],['rescue','PLAYER RESCUE'],['settings','GAME CONTROLS & SETTINGS'],['profile','PLAYER PROFILE']]){
      await visibleHub(page,hub,'#tabletopScreen').click();await expectModal(page,title);await closeModal(page);
    }
    await page.locator('#trackerJudge').click();await expect(page.locator('#modal')).toBeVisible();await closeModal(page);
    for(const [id,title] of [['#trackerEditPlayers','EDIT PLAYERS'],['#trackerGameStats','GAME STATS'],['#trackerCounters','COUNTERS'],['#trackerLife','LIFE'],['#trackerStatus','STATUS'],['#trackerMana','MANA'],['#trackerClearLog','CLEAR GAME LOG'],['#trackerResetGame','RESET TABLE TRACKER']]){
      await page.locator(id).click();await expectModal(page,title);await closeModal(page);
    }
    await page.locator('#trackerEditDecks').click();await expect(page.locator('#deckDialog')).toBeVisible();await page.locator('#deckDialogBack').click();
    await page.screenshot({path:'test-results/cg-table-tracker.png',fullPage:true});
    await page.locator('#trackerHome').click();await expect(page.locator('#landing')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('iPad uses the same composition scaled to fit',async({page})=>{
    await page.setViewportSize({width:1366,height:1024});const errors=await ready(page,'ipad.html');await startMode(page,'freeplay','2');
    await page.evaluate(()=>{document.body.classList.remove('cc-device-iphone','cc-device-other-phone');document.body.classList.add('cc-device-ipad')});
    const r=await page.evaluate(()=>{const q=s=>{const x=document.querySelector(s).getBoundingClientRect();return {l:x.left,r:x.right,t:x.top,b:x.bottom,w:x.width,h:x.height}};return {master:q('.landscape-game-master'),left:q('.player-hero'),battle:q('.battle-panel'),right:q('.landscape-right-rail'),hand:q('.landscape-hand-zone'),action:q('.landscape-action-rail')}});
    expect(r.master.w).toBeLessThanOrEqual(1366);expect(r.master.h).toBeLessThanOrEqual(1024);
    expect(r.left.r).toBeLessThanOrEqual(r.battle.l+1);expect(r.battle.r).toBeLessThanOrEqual(r.right.l+1);
    expect(r.hand.l).toBeGreaterThanOrEqual(r.battle.l-1);expect(r.hand.r).toBeLessThanOrEqual(r.battle.r+1);
    await page.screenshot({path:'test-results/cg-freeplay-ipad.png',fullPage:true});
    expect(errors).toEqual([]);
  });
});
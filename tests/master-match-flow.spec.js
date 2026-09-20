const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(),'test-results','master-match');
fs.mkdirSync(OUT,{recursive:true});

async function ready(page, file='index.html'){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{
    if(m.type()==='error' && !/favicon/i.test(m.text())) errors.push('console: '+m.text());
  });
  await page.goto(file,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ccAppReady===true,null,{timeout:30000});
  await page.waitForTimeout(150);
  return errors;
}
async function shot(page,name){ await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false}); }
async function rect(page,selector){
  return await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
      offsetWidth:el.offsetWidth,offsetHeight:el.offsetHeight};
  });
}
async function assertContained(page,selector,label=selector){
  const r=await rect(page,selector);
  const vp=page.viewportSize();
  expect.soft(r.left,label+' left').toBeGreaterThanOrEqual(-1);
  expect.soft(r.top,label+' top').toBeGreaterThanOrEqual(-1);
  expect.soft(r.right,label+' right').toBeLessThanOrEqual(vp.width+1);
  expect.soft(r.bottom,label+' bottom').toBeLessThanOrEqual(vp.height+1);
  expect.soft(r.width,label+' width').toBeGreaterThan(0);
  expect.soft(r.height,label+' height').toBeGreaterThan(0);
  return r;
}
async function assertVisibleButtonsContained(page,scope='body'){
  const problems=await page.locator(scope+' button:visible').evaluateAll((buttons)=>{
    const vw=innerWidth,vh=innerHeight;
    return buttons.map((b,i)=>{
      const r=b.getBoundingClientRect();
      return {
        i,id:b.id||'',text:(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,80),
        left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
        ok:r.width>2&&r.height>2&&r.left>=-1&&r.top>=-1&&r.right<=vw+1&&r.bottom<=vh+1
      };
    }).filter(x=>!x.ok);
  });
  expect.soft(problems,'visible buttons outside viewport in '+scope).toEqual([]);
}
async function closePrimaryModal(page){
  if(await page.locator('#modal').isVisible()){
    await page.locator('#modalClose').click();
    await expect(page.locator('#modal')).not.toBeVisible();
  }
}
async function openMode(page,mode){
  await page.locator('#startGameBtn').click();
  await expect(page.locator('#gameModeDialog')).toBeVisible();
  await page.locator('[data-game-mode="'+mode+'"]').click();
  await expect(page.locator('#modeSetupDialog')).toBeVisible();
}
async function saveMetrics(page,name,selectors){
  const data={viewport:page.viewportSize()};
  for(const [key,sel] of Object.entries(selectors)) data[key]=await rect(page,sel);
  fs.writeFileSync(path.join(OUT,name+'.json'),JSON.stringify(data,null,2));
  return data;
}

test.describe.serial('Commander Companion master-match acceptance flow',()=>{
  test('landing + all top-level landing menus fit and route',async({page})=>{
    await page.setViewportSize({width:932,height:430});
    const errors=await ready(page);
    await expect(page).toHaveTitle(/V0\.8 CT/);
    await assertContained(page,'.landing079-shell','landing master canvas');
    await assertVisibleButtonsContained(page,'#landing');
    await shot(page,'01-landing');

    // Profile / My Account
    await page.locator('#profileLandingBtn').click();
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#modalTitle')).toContainText('MY ACCOUNT');
    await assertContained(page,'#modal','My Account');
    await assertVisibleButtonsContained(page,'#modal');
    await shot(page,'02-my-account');

    await page.locator('#accountProfileEdit').click();
    await expect(page.locator('#modalTitle')).toContainText('PROFILE EDITOR');
    await assertContained(page,'#modal','Profile Editor');
    await assertVisibleButtonsContained(page,'#modal');
    await shot(page,'03-profile-editor');
    await closePrimaryModal(page);

    await page.locator('#profileLandingBtn').click();
    await page.locator('#accountPlayerStats').click();
    await expect(page.locator('#modalTitle')).toContainText('PLAYER STATS');
    await assertContained(page,'#modal','Player Stats');
    await assertVisibleButtonsContained(page,'#modal');
    await shot(page,'04-player-stats');
    await closePrimaryModal(page);

    await page.locator('#profileLandingBtn').click();
    await page.locator('#accountDeckEditor').click();
    await expect(page.locator('#deckDialog')).toBeVisible();
    await assertContained(page,'#deckDialog','Deck Editor from Account');
    await assertVisibleButtonsContained(page,'#deckDialog');
    await shot(page,'05-deck-editor-account');
    await page.locator('#deckDialogBack').click();

    // Direct Deck Builder
    await page.locator('#deckBuilderVisibleBtn').click();
    await expect(page.locator('#deckDialog')).toBeVisible();
    await assertContained(page,'#deckDialog','Deck Editor');
    await assertVisibleButtonsContained(page,'#deckDialog');
    await expect(page.locator('#newDeckBtn')).toBeVisible();
    await expect(page.locator('#copyDeckBtn')).toBeVisible();
    await expect(page.locator('#preconCatalogBtn')).toBeVisible();
    await expect(page.locator('#importManaBoxBtn')).toBeVisible();
    await shot(page,'06-deck-editor');
    await page.locator('#newDeckBtn').click();
    await expect(page.locator('#deckNameInput')).toBeVisible();
    await assertVisibleButtonsContained(page,'#deckDialog');
    await page.locator('#deckDialogBack').click();

    // Settings
    await page.locator('#settingsLandingBtnBottom').click();
    await expect(page.locator('#modalTitle')).toContainText('SETTINGS');
    await assertContained(page,'#modal','Landing Settings');
    await assertVisibleButtonsContained(page,'#modal');
    await shot(page,'07-settings');
    await closePrimaryModal(page);

    // Help / Player Rescue
    await page.locator('#helpLandingBtn').click();
    await expect(page.locator('#modal')).toBeVisible();
    await assertContained(page,'#modal','Landing Help');
    await assertVisibleButtonsContained(page,'#modal');
    await shot(page,'08-help');
    await closePrimaryModal(page);

    expect(errors).toEqual([]);
  });

  test('mode chooser and setup menus fit, back-route, and Freeplay reaches game screen',async({page})=>{
    await page.setViewportSize({width:932,height:430});
    const errors=await ready(page);

    await page.locator('#startGameBtn').click();
    await expect(page.locator('#gameModeDialog')).toBeVisible();
    await assertContained(page,'#gameModeDialog','Game Mode');
    await assertVisibleButtonsContained(page,'#gameModeDialog');
    const modeButtons=await page.locator('#gameModeDialog [data-game-mode]').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().toJSON()));
    expect(modeButtons).toHaveLength(3);
    expect(modeButtons[1].left).toBeGreaterThan(modeButtons[0].left);
    expect(modeButtons[2].left).toBeGreaterThan(modeButtons[1].left);
    await shot(page,'09-game-mode');

    // Fully Guided setup + back routing
    await page.locator('[data-game-mode="fully-tracked"]').click();
    await expect(page.locator('#modeSetupDialog')).toBeVisible();
    await expect(page.locator('#modeSetupTitle')).toContainText('FULL PLAY TRACKING');
    await assertContained(page,'#modeSetupDialog','Guided Setup');
    await assertVisibleButtonsContained(page,'#modeSetupDialog');
    await shot(page,'10-guided-setup');
    await page.locator('#modeSetupBack').click();
    await expect(page.locator('#gameModeDialog')).toBeVisible();

    // Freeplay setup
    await page.locator('[data-game-mode="freeplay"]').click();
    await expect(page.locator('#modeSetupDialog')).toBeVisible();
    await assertContained(page,'#modeSetupDialog','Freeplay Setup');
    await assertVisibleButtonsContained(page,'#modeSetupDialog');
    await page.locator('#modePlayerCount').selectOption('2');
    await shot(page,'11-freeplay-setup');
    await page.locator('#modeProceed').click();

    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('.landscape-game-master')).toBeVisible();
    await assertContained(page,'.landscape-game-master','Guided/Freeplay master');
    await assertVisibleButtonsContained(page,'#gameScreen');
    const g=await saveMetrics(page,'guided-freeplay-geometry',{
      master:'.landscape-game-master',
      top:'.landscape-game-topbar',
      hero:'.player-hero',
      battle:'.battle-panel',
      right:'.landscape-right-rail',
      hand:'.landscape-hand-zone',
      action:'.landscape-action-rail'
    });
    expect.soft(g.master.offsetWidth).toBe(1536);
    expect.soft(g.master.offsetHeight).toBe(709);
    expect.soft(g.top.height/g.master.height).toBeGreaterThan(0.12);
    expect.soft(g.top.height/g.master.height).toBeLessThan(0.18);
    expect.soft(g.hero.right).toBeLessThanOrEqual(g.battle.left+3);
    expect.soft(g.battle.right).toBeLessThanOrEqual(g.right.left+3);
    await shot(page,'12-freeplay-game');

    // Game header routes while preserving fit
    for(const hub of ['card-id','chat','rescue','settings','profile']){
      const b=page.locator('.landscape-game-topbar [data-hub="'+hub+'"]:visible').first();
      await expect(b).toBeVisible();
      await b.click();
      await expect(page.locator('#modal')).toBeVisible();
      await assertContained(page,'#modal','Game '+hub+' modal');
      await assertVisibleButtonsContained(page,'#modal');
      await closePrimaryModal(page);
    }

    // Public zone routes
    for(const zone of ['graveyard','exile','tokens','attachments']){
      const b=page.locator('[data-zone-open="'+zone+'"]:visible').first();
      await expect(b).toBeVisible();
      await b.click();
      await expect(page.locator('#modal')).toBeVisible();
      await assertContained(page,'#modal','Zone '+zone);
      await assertVisibleButtonsContained(page,'#modal');
      await closePrimaryModal(page);
    }

    expect(errors).toEqual([]);
  });

  test('Table Tracker setup + master screen + all primary controls fit and route',async({page})=>{
    await page.setViewportSize({width:932,height:430});
    const errors=await ready(page);
    await openMode(page,'table-tracker');
    await assertContained(page,'#modeSetupDialog','Table Tracker Setup');
    await assertVisibleButtonsContained(page,'#modeSetupDialog');
    await page.locator('#modePlayerCount').selectOption('4');
    const names=['Aaron','Lex','Charlie','Diana'];
    for(let i=0;i<4;i++) await page.locator('#modeTrackerName'+i).fill(names[i]);
    await shot(page,'13-table-tracker-setup');
    await page.locator('#modeProceed').click();

    await expect(page.locator('#tabletopScreen')).toBeVisible();
    await expect(page.locator('[data-tt-player]')).toHaveCount(4);
    await assertContained(page,'.tracker-shell','Table Tracker master');
    await assertVisibleButtonsContained(page,'#tabletopScreen');
    const t=await saveMetrics(page,'table-tracker-geometry',{
      master:'.tracker-shell',
      header:'.tracker-head',
      grid:'.tracker-player-grid',
      right:'.tracker-side-rail',
      bottom:'.tracker-bottom-bar'
    });
    expect.soft(t.master.offsetWidth).toBe(1536);
    expect.soft(t.master.offsetHeight).toBe(709);
    expect.soft(t.grid.right).toBeLessThanOrEqual(t.right.left+3);
    await shot(page,'14-table-tracker');

    // Direct player controls
    const first=page.locator('[data-tt-player]').first();
    const life=first.locator('[data-tt-stat-value="life"]');
    await expect(life).toHaveText('40');
    await first.locator('[data-tt-inline-stat="life"][data-delta="-1"]').click();
    await expect(life).toHaveText('39');
    await first.locator('[data-tt-inline-mana="G"][data-delta="1"]').click();
    await expect(first.locator('[data-tt-mana-value="G"]')).toHaveText('1');

    const modalRoutes=[
      ['#trackerJudge',null],
      ['#trackerEditPlayers','EDIT PLAYERS'],
      ['#trackerGameStats','GAME STATS'],
      ['#trackerCounters','COUNTERS'],
      ['#trackerLife','LIFE'],
      ['#trackerStatus','STATUS'],
      ['#trackerMana','MANA'],
      ['#trackerClearLog','CLEAR GAME LOG'],
      ['#trackerResetGame','RESET TABLE TRACKER']
    ];
    for(const [sel,title] of modalRoutes){
      await page.locator(sel).click();
      await expect(page.locator('#modal')).toBeVisible();
      if(title) await expect(page.locator('#modalTitle')).toContainText(title);
      await assertContained(page,'#modal','Tracker '+sel);
      await assertVisibleButtonsContained(page,'#modal');
      await closePrimaryModal(page);
    }

    await page.locator('#trackerEditDecks').click();
    await expect(page.locator('#deckDialog')).toBeVisible();
    await assertContained(page,'#deckDialog','Tracker Deck Editor');
    await assertVisibleButtonsContained(page,'#deckDialog');
    await page.locator('#deckDialogBack').click();

    for(const hub of ['card-id','chat','rescue','settings','profile']){
      const b=page.locator('#tabletopScreen [data-hub="'+hub+'"]:visible').first();
      await expect(b).toBeVisible();
      await b.click();
      await expect(page.locator('#modal')).toBeVisible();
      await assertContained(page,'#modal','Tracker '+hub);
      await assertVisibleButtonsContained(page,'#modal');
      await closePrimaryModal(page);
    }

    await page.locator('#trackerHome').click();
    await expect(page.locator('#landing')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

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

  test('activation sacrifice costs fire sacrifice triggers and Undo restores exact pre-action state', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const { createTransactionEngine } = await import('./transactions.js?v=080-bp-sacrifice-regression');
      const emptyMana = () => ({ W:0,U:0,B:0,R:0,G:0,C:0 });
      const source = {
        instanceId:'source', definitionId:'source-def', ownerId:'p1', controllerId:'p1', zone:'battlefield',
        tapped:false, counters:{}, manaCapacityRegistered:true, manaCapacityOptions:['C'], manaCapacityColor:'C', manaCapacityAmount:1
      };
      const fodder = {
        instanceId:'fodder', definitionId:'fodder-def', ownerId:'p1', controllerId:'p1', zone:'battlefield',
        tapped:true, counters:{'+1/+1':2}
      };
      const sacrificeWatcher = {
        instanceId:'sac-watch', definitionId:'sac-watch-def', ownerId:'p1', controllerId:'p1', zone:'battlefield',
        tapped:false, counters:{}
      };
      const discardWatcher = {
        instanceId:'discard-watch', definitionId:'discard-watch-def', ownerId:'p1', controllerId:'p1', zone:'battlefield',
        tapped:false, counters:{}
      };
      const deck = {
        remainingLibrary:[], hand:[], battlefield:[source,fodder,sacrificeWatcher,discardWatcher],
        graveyard:[], exile:[], tokens:[], attachments:[], commandZone:[]
      };
      const player = {
        playerId:'p1', displayName:'Recovery Tester', life:40, poison:0, eliminated:false,
        statuses:[], counters:{landsPlayedThisTurn:0}, commanderDamage:{}, commanders:[],
        mana:{ total:{...emptyMana(),C:1}, available:{...emptyMana(),C:1}, floating:emptyMana() },
        deck
      };
      const game = {
        players:[player], activePlayerId:'p1', turnNumber:3, roundNumber:1, phase:'precombat-main',
        status:'active', winner:null, log:[], stack:[], undoHistory:[], pendingTriggers:[],
        rulesConfig:{commanderDamage:true,poisonLoss:true,poisonThreshold:10,commanderDamageThreshold:21},
        cardDefinitions:{
          'source-def':{definitionId:'source-def',name:'Recovery Engine',typeLine:'Artifact',oracleText:''},
          'fodder-def':{definitionId:'fodder-def',name:'Cost Creature',typeLine:'Creature — Test',oracleText:''},
          'sac-watch-def':{definitionId:'sac-watch-def',name:'Sacrifice Listener',typeLine:'Enchantment',oracleText:'Whenever you sacrifice a permanent, you gain 1 life.'},
          'discard-watch-def':{definitionId:'discard-watch-def',name:'Discard Listener',typeLine:'Enchantment',oracleText:'Whenever you discard a card, you lose 1 life.'}
        }
      };

      const engine = createTransactionEngine(game);
      engine.commit({
        type:'activate-ability-stack',
        playerId:'p1',
        instanceId:'source',
        requiresTap:true,
        costMoveIds:['fodder'],
        payment:null,
        effects:[],
        effectBindings:{sourceId:'source'},
        label:'Recovery Tester activates Recovery Engine.'
      });

      const currentPlayer = () => game.players.find(p => p.playerId === 'p1');
      const findZone = id => {
        const currentDeck=currentPlayer()?.deck;
        if(!currentDeck)return null;
        for (const [zone,cards] of Object.entries({
          hand:currentDeck.hand,battlefield:currentDeck.battlefield,graveyard:currentDeck.graveyard,
          exile:currentDeck.exile,tokens:currentDeck.tokens,attachments:currentDeck.attachments,
          commandZone:currentDeck.commandZone,remainingLibrary:currentDeck.remainingLibrary
        })) {
          const card=(cards||[]).find(c=>c.instanceId===id);
          if(card)return {zone,card};
        }
        return null;
      };

      const afterCost = {
        stackLength:game.stack.length,
        sourceTapped:!!findZone('source')?.card?.tapped,
        availableC:Number(currentPlayer()?.mana?.available?.C||0),
        fodderZone:findZone('fodder')?.zone||null,
        fodderTapped:!!findZone('fodder')?.card?.tapped,
        sacrificeTriggerCount:(game.pendingTriggers||[]).filter(t=>t?.event?.type==='sacrificed'&&t?.event?.sourceId==='fodder').length,
        discardTriggerCount:(game.pendingTriggers||[]).filter(t=>t?.event?.type==='discard'&&t?.event?.sourceId==='fodder').length
      };

      const didUndo=engine.undo();
      const restoredFodder=findZone('fodder');
      return {
        afterCost,
        restored:{
          didUndo,
          stackLength:game.stack.length,
          pendingTriggers:(game.pendingTriggers||[]).length,
          sourceTapped:!!findZone('source')?.card?.tapped,
          availableC:Number(currentPlayer()?.mana?.available?.C||0),
          fodderZone:restoredFodder?.zone||null,
          fodderTapped:!!restoredFodder?.card?.tapped,
          fodderCounters:structuredClone(restoredFodder?.card?.counters||{}),
          graveyardLength:currentPlayer()?.deck?.graveyard?.length||0
        }
      };
    });

    expect(result.afterCost.stackLength).toBe(1);
    expect(result.afterCost.sourceTapped).toBe(true);
    expect(result.afterCost.availableC).toBe(0);
    expect(result.afterCost.fodderZone).toBe('graveyard');
    expect(result.afterCost.fodderTapped).toBe(false);
    expect(result.afterCost.sacrificeTriggerCount).toBe(1);
    expect(result.afterCost.discardTriggerCount).toBe(0);

    expect(result.restored.didUndo).toBe(true);
    expect(result.restored.stackLength).toBe(0);
    expect(result.restored.pendingTriggers).toBe(0);
    expect(result.restored.sourceTapped).toBe(false);
    expect(result.restored.availableC).toBe(1);
    expect(result.restored.fodderZone).toBe('battlefield');
    expect(result.restored.fodderTapped).toBe(true);
    expect(result.restored.fodderCounters['+1/+1']).toBe(2);
    expect(result.restored.graveyardLength).toBe(0);
  });

  test('life-payment activation costs emit life loss, roll back on failure, and Undo exactly', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const { createTransactionEngine } = await import('./transactions.js?v=080-bq-life-cost-regression');
      const emptyMana = () => ({ W:0,U:0,B:0,R:0,G:0,C:0 });
      const source = {
        instanceId:'life-source', definitionId:'life-source-def', ownerId:'p1', controllerId:'p1', zone:'battlefield',
        tapped:false, counters:{}
      };
      const watcher = {
        instanceId:'life-watch', definitionId:'life-watch-def', ownerId:'p1', controllerId:'p1', zone:'battlefield',
        tapped:false, counters:{}
      };
      const deck = {
        remainingLibrary:[], hand:[], battlefield:[source,watcher],
        graveyard:[], exile:[], tokens:[], attachments:[], commandZone:[]
      };
      const player = {
        playerId:'p1', displayName:'Life Tester', life:40, poison:0, eliminated:false,
        statuses:[], counters:{landsPlayedThisTurn:0}, commanderDamage:{}, commanders:[],
        mana:{ total:emptyMana(), available:emptyMana(), floating:emptyMana() },
        deck
      };
      const game = {
        players:[player], activePlayerId:'p1', turnNumber:4, roundNumber:2, phase:'precombat-main',
        status:'active', winner:null, log:[], stack:[], undoHistory:[], pendingTriggers:[],
        rulesConfig:{commanderDamage:true,poisonLoss:true,poisonThreshold:10,commanderDamageThreshold:21},
        cardDefinitions:{
          'life-source-def':{definitionId:'life-source-def',name:'Life Engine',typeLine:'Artifact',oracleText:''},
          'life-watch-def':{definitionId:'life-watch-def',name:'Life Listener',typeLine:'Enchantment',oracleText:'Whenever you lose life, you gain 1 life.'}
        }
      };

      const engine=createTransactionEngine(game);
      engine.commit({
        type:'activate-ability-stack',
        playerId:'p1',
        instanceId:'life-source',
        requiresTap:true,
        lifeCost:3,
        effects:[],
        effectBindings:{sourceId:'life-source'},
        label:'Life Tester activates Life Engine.'
      });

      const currentPlayer=()=>game.players.find(p=>p.playerId==='p1');
      const currentSource=()=>currentPlayer()?.deck?.battlefield?.find(c=>c.instanceId==='life-source');
      const afterCost={
        life:Number(currentPlayer()?.life||0),
        sourceTapped:!!currentSource()?.tapped,
        stackLength:Number(game.stack?.length||0),
        lifeLostTriggers:(game.pendingTriggers||[]).filter(t=>t?.event?.type==='life-lost'&&t?.event?.playerId==='p1').length
      };

      const didUndo=engine.undo();
      const afterUndo={
        didUndo,
        life:Number(currentPlayer()?.life||0),
        sourceTapped:!!currentSource()?.tapped,
        stackLength:Number(game.stack?.length||0),
        pendingTriggers:Number(game.pendingTriggers?.length||0)
      };

      let insufficientError='';
      try{
        engine.commit({
          type:'activate-ability-stack',
          playerId:'p1',
          instanceId:'life-source',
          requiresTap:true,
          lifeCost:41,
          effects:[],
          effectBindings:{sourceId:'life-source'},
          label:'Impossible life payment.'
        });
      }catch(error){
        insufficientError=String(error?.message||error||'');
      }
      const afterRejected={
        life:Number(currentPlayer()?.life||0),
        sourceTapped:!!currentSource()?.tapped,
        stackLength:Number(game.stack?.length||0),
        pendingTriggers:Number(game.pendingTriggers?.length||0),
        undoDepth:Number(game.undoHistory?.length||0),
        insufficientError
      };

      return {afterCost,afterUndo,afterRejected};
    });

    expect(result.afterCost.life).toBe(37);
    expect(result.afterCost.sourceTapped).toBe(true);
    expect(result.afterCost.stackLength).toBe(1);
    expect(result.afterCost.lifeLostTriggers).toBe(1);

    expect(result.afterUndo.didUndo).toBe(true);
    expect(result.afterUndo.life).toBe(40);
    expect(result.afterUndo.sourceTapped).toBe(false);
    expect(result.afterUndo.stackLength).toBe(0);
    expect(result.afterUndo.pendingTriggers).toBe(0);

    expect(result.afterRejected.insufficientError).toMatch(/Not enough life/i);
    expect(result.afterRejected.life).toBe(40);
    expect(result.afterRejected.sourceTapped).toBe(false);
    expect(result.afterRejected.stackLength).toBe(0);
    expect(result.afterRejected.pendingTriggers).toBe(0);
    expect(result.afterRejected.undoDepth).toBe(0);
  });

  test('Fabled Passage-style search keeps conditional untap and Undo exact across stack resolution', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const { createTransactionEngine } = await import('./transactions.js?v=080-br-fabled-passage-regression');
      const emptyMana = () => ({ W:0,U:0,B:0,R:0,G:0,C:0 });

      const runScenario = otherLandCount => {
        const passage={
          instanceId:'passage',definitionId:'passage-def',ownerId:'p1',controllerId:'p1',zone:'battlefield',tapped:false,counters:{}
        };
        const fetched={
          instanceId:'fetched',definitionId:'plains-def',ownerId:'p1',controllerId:'p1',zone:'library',tapped:false,counters:{}
        };
        const lands=Array.from({length:otherLandCount},(_,i)=>({
          instanceId:`land-${i}`,definitionId:'plains-def',ownerId:'p1',controllerId:'p1',zone:'battlefield',tapped:false,counters:{}
        }));
        const deck={
          remainingLibrary:[fetched],hand:[],battlefield:[passage,...lands],
          graveyard:[],exile:[],tokens:[],attachments:[],commandZone:[]
        };
        const player={
          playerId:'p1',displayName:'Search Tester',life:40,poison:0,eliminated:false,
          statuses:[],counters:{landsPlayedThisTurn:0},commanderDamage:{},commanders:[],
          mana:{total:emptyMana(),available:emptyMana(),floating:emptyMana()},deck
        };
        const game={
          players:[player],activePlayerId:'p1',turnNumber:5,roundNumber:3,phase:'precombat-main',
          status:'active',winner:null,log:[],stack:[],undoHistory:[],pendingTriggers:[],
          rulesConfig:{commanderDamage:true,poisonLoss:true,poisonThreshold:10,commanderDamageThreshold:21},
          cardDefinitions:{
            'passage-def':{definitionId:'passage-def',name:'Fabled Passage',typeLine:'Land',oracleText:'{T}, Sacrifice Fabled Passage: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.'},
            'plains-def':{definitionId:'plains-def',name:'Plains',typeLine:'Basic Land — Plains',oracleText:'{T}: Add {W}.'}
          }
        };
        const engine=createTransactionEngine(game);
        engine.commit({
          type:'activate-ability-stack',
          playerId:'p1',
          instanceId:'passage',
          requiresTap:true,
          sacrificeSelf:true,
          effects:[],
          effectBindings:{sourceId:'passage'},
          searchResult:{
            instanceId:'fetched',
            to:'battlefield',
            entersTapped:true,
            shuffle:true,
            untapIfLandsAtLeast:4
          },
          label:'Search Tester activates Fabled Passage.'
        });

        const locate=id=>{
          for(const p of game.players||[]){
            for(const [zone,cards] of Object.entries({
              hand:p.deck?.hand,battlefield:p.deck?.battlefield,graveyard:p.deck?.graveyard,
              exile:p.deck?.exile,commandZone:p.deck?.commandZone,remainingLibrary:p.deck?.remainingLibrary
            })){
              const card=(cards||[]).find(c=>c.instanceId===id);
              if(card)return{zone,card};
            }
          }
          const stack=(game.stack||[]).find(x=>x?.sourceId===id||x?.card?.instanceId===id);
          return stack?{zone:'stack',card:stack.card||null}:null;
        };

        const afterActivation={
          passageZone:locate('passage')?.zone||null,
          fetchedZone:locate('fetched')?.zone||null,
          stackLength:Number(game.stack?.length||0)
        };

        engine.commit({type:'resolve-stack',playerId:'p1',label:'Resolve Fabled Passage',__internalStackStep:true});

        const afterResolve={
          passageZone:locate('passage')?.zone||null,
          fetchedZone:locate('fetched')?.zone||null,
          fetchedTapped:!!locate('fetched')?.card?.tapped,
          battlefieldLandCount:(game.players[0].deck.battlefield||[]).filter(c=>/Land/i.test(game.cardDefinitions[c.definitionId]?.typeLine||'')).length,
          stackLength:Number(game.stack?.length||0)
        };

        const didUndo=engine.undo();
        const afterUndo={
          didUndo,
          passageZone:locate('passage')?.zone||null,
          passageTapped:!!locate('passage')?.card?.tapped,
          fetchedZone:locate('fetched')?.zone||null,
          fetchedTapped:!!locate('fetched')?.card?.tapped,
          graveyardLength:Number(game.players[0].deck.graveyard?.length||0),
          stackLength:Number(game.stack?.length||0)
        };

        return{afterActivation,afterResolve,afterUndo};
      };

      return{
        fourLands:runScenario(3),
        threeLands:runScenario(2)
      };
    });

    expect(result.fourLands.afterActivation.passageZone).toBe('graveyard');
    expect(result.fourLands.afterActivation.fetchedZone).toBe('remainingLibrary');
    expect(result.fourLands.afterActivation.stackLength).toBe(1);
    expect(result.fourLands.afterResolve.fetchedZone).toBe('battlefield');
    expect(result.fourLands.afterResolve.battlefieldLandCount).toBe(4);
    expect(result.fourLands.afterResolve.fetchedTapped).toBe(false);
    expect(result.fourLands.afterResolve.stackLength).toBe(0);

    expect(result.threeLands.afterResolve.battlefieldLandCount).toBe(3);
    expect(result.threeLands.afterResolve.fetchedTapped).toBe(true);

    for(const scenario of [result.fourLands,result.threeLands]){
      expect(scenario.afterUndo.didUndo).toBe(true);
      expect(scenario.afterUndo.passageZone).toBe('battlefield');
      expect(scenario.afterUndo.passageTapped).toBe(false);
      expect(scenario.afterUndo.fetchedZone).toBe('remainingLibrary');
      expect(scenario.afterUndo.fetchedTapped).toBe(false);
      expect(scenario.afterUndo.graveyardLength).toBe(0);
      expect(scenario.afterUndo.stackLength).toBe(0);
    }
  });

  test('tap-cost abilities cannot double-activate and Undo restores source availability exactly', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const { createTransactionEngine } = await import('./transactions.js?v=080-bs-tap-cost-regression');
      const emptyMana = () => ({ W:0,U:0,B:0,R:0,G:0,C:0 });
      const source={
        instanceId:'tap-source',definitionId:'tap-source-def',ownerId:'p1',controllerId:'p1',zone:'battlefield',
        tapped:false,counters:{},manaCapacityRegistered:true,manaCapacityOptions:['C'],manaCapacityColor:'C',manaCapacityAmount:1
      };
      const deck={remainingLibrary:[],hand:[],battlefield:[source],graveyard:[],exile:[],tokens:[],attachments:[],commandZone:[]};
      const player={
        playerId:'p1',displayName:'Tap Tester',life:40,poison:0,eliminated:false,statuses:[],counters:{landsPlayedThisTurn:0},
        commanderDamage:{},commanders:[],mana:{total:{...emptyMana(),C:1},available:{...emptyMana(),C:1},floating:emptyMana()},deck
      };
      const game={
        players:[player],activePlayerId:'p1',turnNumber:2,roundNumber:1,phase:'precombat-main',status:'active',
        winner:null,log:[],stack:[],undoHistory:[],pendingTriggers:[],
        rulesConfig:{commanderDamage:true,poisonLoss:true,poisonThreshold:10,commanderDamageThreshold:21},
        cardDefinitions:{'tap-source-def':{definitionId:'tap-source-def',name:'Tap Engine',typeLine:'Artifact',oracleText:'{T}: Draw a card.'}}
      };
      const engine=createTransactionEngine(game);
      const current=()=>game.players.find(p=>p.playerId==='p1');
      const currentSource=()=>current()?.deck?.battlefield?.find(c=>c.instanceId==='tap-source');

      engine.commit({
        type:'activate-ability-stack',playerId:'p1',instanceId:'tap-source',requiresTap:true,
        effects:[],effectBindings:{sourceId:'tap-source'},label:'Tap Tester activates Tap Engine.'
      });
      const afterFirst={
        tapped:!!currentSource()?.tapped,
        availableC:Number(current()?.mana?.available?.C||0),
        stackLength:Number(game.stack?.length||0),
        undoDepth:Number(game.undoHistory?.length||0)
      };

      let secondError='';
      try{
        engine.commit({
          type:'activate-ability-stack',playerId:'p1',instanceId:'tap-source',requiresTap:true,
          effects:[],effectBindings:{sourceId:'tap-source'},label:'Illegal second activation.'
        });
      }catch(error){secondError=String(error?.message||error||'')}
      const afterRejected={
        secondError,
        tapped:!!currentSource()?.tapped,
        availableC:Number(current()?.mana?.available?.C||0),
        stackLength:Number(game.stack?.length||0),
        undoDepth:Number(game.undoHistory?.length||0)
      };

      const didUndo=engine.undo();
      const afterUndo={
        didUndo,
        tapped:!!currentSource()?.tapped,
        availableC:Number(current()?.mana?.available?.C||0),
        stackLength:Number(game.stack?.length||0),
        undoDepth:Number(game.undoHistory?.length||0)
      };
      return{afterFirst,afterRejected,afterUndo};
    });

    expect(result.afterFirst.tapped).toBe(true);
    expect(result.afterFirst.availableC).toBe(0);
    expect(result.afterFirst.stackLength).toBe(1);
    expect(result.afterFirst.undoDepth).toBe(1);

    expect(result.afterRejected.secondError).toMatch(/already tapped/i);
    expect(result.afterRejected.tapped).toBe(true);
    expect(result.afterRejected.availableC).toBe(0);
    expect(result.afterRejected.stackLength).toBe(1);
    expect(result.afterRejected.undoDepth).toBe(1);

    expect(result.afterUndo.didUndo).toBe(true);
    expect(result.afterUndo.tapped).toBe(false);
    expect(result.afterUndo.availableC).toBe(1);
    expect(result.afterUndo.stackLength).toBe(0);
    expect(result.afterUndo.undoDepth).toBe(0);
  });

  test('modal spells automate supported modes while alternate-cost keywords fail safely to Guided', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const { modalSpellSpec, spellSupport, analyzeDefinitionSupport } = await import('./ability-support.js?v=080-bt-modal-altcost-regression');

      const modalDef = {
        definitionId:'modal-def',
        name:'Modal Safety Test',
        typeLine:'Sorcery',
        oracleText:'Choose two —\n• Draw one card.\n• You gain 3 life.\n• Create a Treasure token.'
      };
      const overloadDef = {
        definitionId:'overload-def',
        name:'Overload Safety Test',
        typeLine:'Sorcery',
        oracleText:'Destroy target artifact.\nOverload {4}{R}'
      };
      const cyclingDef = {
        definitionId:'dismantling-wave-test',
        name:'Dismantling Wave',
        typeLine:'Sorcery',
        oracleText:'For each opponent, destroy up to one target artifact or enchantment that player controls.\nCycling {6}{W}{W}\nWhen you cycle this card, destroy all artifacts and enchantments.'
      };

      const modal = modalSpellSpec(modalDef);
      const modalSupport = spellSupport(modalDef);
      const overloadSupport = spellSupport(overloadDef);
      const cyclingSupport = spellSupport(cyclingDef);
      const cyclingAudit = analyzeDefinitionSupport(cyclingDef);

      return {
        modalCount:modal?.count||0,
        modalModes:modal?.modes?.length||0,
        modalSupported:!!modalSupport?.supported,
        modalKind:modalSupport?.kind||null,
        overloadSupported:!!overloadSupport?.supported,
        overloadKind:overloadSupport?.kind||null,
        overloadGuided:!!overloadSupport?.guidedFallback,
        overloadReason:(overloadSupport?.reasons||[]).join(' '),
        cyclingSupported:!!cyclingSupport?.supported,
        cyclingKind:cyclingSupport?.kind||null,
        cyclingGuided:!!cyclingSupport?.guidedFallback,
        cyclingReason:(cyclingSupport?.reasons||[]).join(' '),
        cyclingFullyAutomated:!!cyclingAudit?.fullyAutomated,
        cyclingGuidedAvailable:!!cyclingAudit?.guidedFallbackAvailable
      };
    });

    expect(result.modalCount).toBe(2);
    expect(result.modalModes).toBe(3);
    expect(result.modalSupported).toBe(true);
    expect(result.modalKind).toBe('modal');

    expect(result.overloadSupported).toBe(false);
    expect(result.overloadKind).toBe('alternate-cost');
    expect(result.overloadGuided).toBe(true);
    expect(result.overloadReason).toMatch(/Overload.*Guided/i);

    expect(result.cyclingSupported).toBe(false);
    expect(result.cyclingKind).toBe('alternate-cost');
    expect(result.cyclingGuided).toBe(true);
    expect(result.cyclingReason).toMatch(/Cycling.*Guided/i);
    expect(result.cyclingFullyAutomated).toBe(false);
    expect(result.cyclingGuidedAvailable).toBe(true);
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
    const openingAaron = await page.locator('[data-opening-card]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-opening-card')));

    await page.getByRole('button', { name: 'CONFIRM & NEXT' }).click();
    await expect(page.locator('#modalTitle')).toContainText('OPENING HAND', { timeout: 30_000 });
    await expect(page.locator('[data-opening-card]')).toHaveCount(7);
    const openingLex = await page.locator('[data-opening-card]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-opening-card')));
    expect(new Set([...openingAaron, ...openingLex]).size).toBe(14);
    expect(openingLex).not.toEqual(openingAaron);

    await page.locator('#modalActions button[data-action-label="START GAME"]').click();
    await expect(page.locator('#gameScreen')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#gameContent')).not.toBeEmpty();
    await expect(page.locator('.visual-hand-zone')).toBeVisible();
    await expect(page.locator('.visual-hand-zone:visible .hand-card')).toHaveCount(7);
    await expect(page.locator('[data-action="next-phase"]:visible').first()).toBeVisible();

    const isolatedSetup = await savedGame(page);
    const setupAaron = isolatedSetup.players.find(p => p.displayName === 'Aaron');
    const setupLex = isolatedSetup.players.find(p => p.displayName === 'Lex');
    expect(setupAaron?.deck?.sourceName || '').toMatch(/Turtle Power/i);
    expect(setupLex?.deck?.sourceName || '').toMatch(/Wakanda Forever/i);
    expect(setupLex?.deck?.sourceName || '').not.toMatch(/^Setup Deck$/i);
    expect(setupAaron?.deck?.manifestFingerprint).toBeTruthy();
    expect(setupLex?.deck?.manifestFingerprint).toBeTruthy();
    expect(setupAaron.deck.manifestFingerprint).not.toBe(setupLex.deck.manifestFingerprint);
    expect(new Set([...(setupAaron.deck.hand || []).map(x => x.instanceId), ...(setupLex.deck.hand || []).map(x => x.instanceId)]).size).toBe(14);

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
      '1 Cavern of Souls',
      '1 Simian Spirit Guide',
      '92 Island'
    ].join('\n');
    const passiveQaDeck = [
      '1 Kenrith, the Returned King',
      '99 Island'
    ].join('\n');

    await openMode(page, 'fully-tracked');
    await page.locator('#modeProceed').click();
    await expect(page.locator('#setupDialog')).toBeVisible();

    const panels = page.locator('[data-player-setup]');
    await expect(panels).toHaveCount(2);

    async function configureQaPlayer(index, name, deckText) {
      const panel = panels.nth(index);
      await panel.locator('.setup-name').fill(name);
      await panel.locator('.setup-deck').fill(deckText);
      await panel.locator('.setup-pick-cmd1').click();
      await expect(page.locator('#commanderSearchInput')).toBeVisible({ timeout: 120_000 });
      await page.locator('#commanderSearchInput').fill('Kenrith, the Returned King');
      const result = page.locator('[data-command-result]').filter({ hasText: 'Kenrith, the Returned King' }).first();
      await expect(result).toBeVisible({ timeout: 60_000 });
      await result.click();
      await expect(panel.locator('.setup-cmd1')).toHaveValue('Kenrith, the Returned King');
    }

    await configureQaPlayer(0, 'QA Aaron', qaDeck);
    await configureQaPlayer(1, 'QA Lex', passiveQaDeck);

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
    expect(pending.priorityState?.active || false).toBe(false);
    expect(pending.log.some(e => /Response window skipped — no opponent has a relevant activated response or castable instant\/flash card/i.test(String(e.text || '')))).toBe(true);
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

    async function endCurrentTurn(expectedNextName) {
      await page.locator('[data-action="end-turn"]:visible').first().click();
      await expect(page.locator('#modalTitle')).toContainText('END TURN?');
      await page.locator('#modalActions').getByRole('button', { name: 'END TURN', exact: true }).click();
      await disableSmartSkipsIfPrompted(page);
      await expect(page.locator('.player-name:visible')).toContainText(expectedNextName);
    }

    async function reachDraw() {
      for (let i = 0; i < 4; i++) {
        if (/DRAW/i.test((await phase.textContent()) || '')) break;
        await page.locator('[data-action="next-phase"]:visible').first().click();
        await disableSmartSkipsIfPrompted(page);
      }
      await expect(phase).toContainText(/DRAW/i);
    }

    async function trackedDrawByName(name) {
      const before = await savedGame(page);
      const actor = before.players.find(p => p.displayName === 'QA Aaron');
      const def = Object.values(before.cardDefinitions || {}).find(d => d.name === name || d.combinedName?.includes(name));
      expect(def, `${name} definition should be hydrated`).toBeTruthy();
      const card = [...(actor.deck.hand || []), ...(actor.deck.remainingLibrary || [])].find(c => c.definitionId === def.definitionId);
      expect(card, `${name} should still be tracked in hand/library`).toBeTruthy();
      const inHand = (actor.deck.hand || []).some(c => c.instanceId === card.instanceId);

      await page.locator('[data-action="draw"]:visible').first().click();
      await expect(page.locator('#modalTitle')).toContainText('DRAW CARD');
      if (inHand) {
        await page.locator('#modalActions').getByRole('button', { name: 'RANDOM DRAW', exact: true }).click();
        await expect(page.locator('#modalTitle')).toContainText('RANDOM VIRTUAL DRAW');
        await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM RANDOM DRAW', exact: true }).click();
      } else {
        await page.locator('#drawSearch').fill(name);
        const result = page.locator(`[data-draw-id="${card.instanceId}"]`);
        await expect(result).toBeVisible({ timeout: 30_000 });
        await result.click();
        await expect(page.locator('#modalTitle')).toContainText('CONFIRM DRAW');
        await page.locator('#modalActions').getByRole('button', { name: 'CONFIRM DRAW / ADD TO HAND', exact: true }).click();
      }
      await expect(phase).toContainText(/MAIN 1/i);
      await expect(page.locator(`[data-hand-card="${card.instanceId}"]:visible`)).toHaveCount(1);
      return card;
    }

    async function playAnotherIsland() {
      const state = await savedGame(page);
      const actor = state.players.find(p => p.displayName === 'QA Aaron');
      const islandDefNow = Object.values(state.cardDefinitions || {}).find(d => d.name === 'Island' && /Basic/i.test(String(d.typeLine || '')));
      const nextIsland = (actor.deck.hand || []).find(c => c.definitionId === islandDefNow?.definitionId);
      expect(nextIsland, 'QA Aaron should have an Island available for the land-per-turn check').toBeTruthy();
      await page.locator(`[data-hand-card="${nextIsland.instanceId}"]:visible`).click();
      await page.locator('#modalActions').getByRole('button', { name: 'PLAY LAND', exact: true }).click();
      await expect(page.locator('#modal')).not.toBeVisible();
      return nextIsland;
    }

    // Turn 2: Reanimate must fail closed while no creature card exists in any graveyard.
    await endCurrentTurn('QA Lex');
    await endCurrentTurn('QA Aaron');
    await reachDraw();
    const reanimate = await trackedDrawByName('Reanimate');
    await page.locator(`[data-hand-card="${reanimate.instanceId}"]:visible`).click();
    await expect(page.locator('#modalContent')).toContainText('NOT CURRENTLY PLAYABLE');
    await expect(page.locator('#modalContent')).toContainText(/No creature card is available in a graveyard to target/i);
    await expect(page.locator('#modalActions').getByRole('button', { name: 'CAST SORCERY', exact: true })).toHaveCount(0);
    await page.locator('#modalClose').click();
    await playAnotherIsland();

    // Turn 3: after using the land play, Malakir Rebirth's Malakir Mire face must remain disabled.
    await endCurrentTurn('QA Lex');
    await endCurrentTurn('QA Aaron');
    await reachDraw();
    const malakir = await trackedDrawByName('Malakir Rebirth');
    await playAnotherIsland();
    await page.locator(`[data-hand-card="${malakir.instanceId}"]:visible`).click();
    const mireFace = page.locator('[data-mdfc-face]').filter({ hasText: 'Malakir Mire' });
    await expect(mireFace).toHaveCount(1);
    await expect(mireFace).toBeDisabled();
    await expect(mireFace).toContainText(/Normal land play for this turn has already been used/i);
    await page.locator('#modalClose').click();

    // Turn 4: Back from an As-Enters choice must not play the land or accept the highlighted choice.
    await endCurrentTurn('QA Lex');
    await endCurrentTurn('QA Aaron');
    await reachDraw();
    const cavern = await trackedDrawByName('Cavern of Souls');
    const beforeCavern = await savedGame(page);
    const cavernOwnerBefore = beforeCavern.players.find(p => p.displayName === 'QA Aaron');
    expect(Number(cavernOwnerBefore.counters?.landsPlayedThisTurn || 0)).toBe(0);

    await page.locator(`[data-hand-card="${cavern.instanceId}"]:visible`).click();
    await page.locator('#modalActions').getByRole('button', { name: 'PLAY LAND', exact: true }).click();
    await expect(page.locator('#modalTitle')).toContainText(/Cavern of Souls — AS IT ENTERS/i);
    await page.locator('#asEntersCreatureTypeSearch').fill('Human');
    await page.locator('#modalClose').click();
    await expect(page.locator('#modal')).not.toBeVisible();

    const afterEtbBack = await savedGame(page);
    expect(locateTrackedCard(afterEtbBack, cavern.instanceId)?.zone).toBe('hand');
    const cavernOwnerAfterBack = afterEtbBack.players.find(p => p.displayName === 'QA Aaron');
    expect(Number(cavernOwnerAfterBack.counters?.landsPlayedThisTurn || 0)).toBe(0);

    await page.locator(`[data-hand-card="${cavern.instanceId}"]:visible`).click();
    await page.locator('#modalActions').getByRole('button', { name: 'PLAY LAND', exact: true }).click();
    await page.locator('#asEntersCreatureTypeSearch').fill('Human');
    await page.locator('#modalActions').getByRole('button', { name: 'PLAY LAND', exact: true }).click();

    const afterCavernCommit = await savedGame(page);
    expect(locateTrackedCard(afterCavernCommit, cavern.instanceId)?.zone).toBe('battlefield');
    expect(locateTrackedCard(afterCavernCommit, cavern.instanceId)?.card?.chosenCreatureType).toBe('Human');
    const cavernOwnerCommitted = afterCavernCommit.players.find(p => p.displayName === 'QA Aaron');
    expect(Number(cavernOwnerCommitted.counters?.landsPlayedThisTurn || 0)).toBe(1);


    // Turn 5: hand-zone mana abilities must move the exact tracked card to exile,
    // add mana immediately, and never create a stack object.
    await endCurrentTurn('QA Lex');
    await endCurrentTurn('QA Aaron');
    await reachDraw();
    const simian = await trackedDrawByName('Simian Spirit Guide');

    const beforeSimian = await savedGame(page);
    const simianOwnerBefore = beforeSimian.players.find(p => p.displayName === 'QA Aaron');
    const redBefore = Number(simianOwnerBefore?.mana?.available?.R || 0);
    const stackBefore = Number(beforeSimian.stack?.length || 0);

    await page.locator(`[data-hand-card="${simian.instanceId}"]:visible`).click();
    const simianAction = page.locator('#modalActions').getByRole('button', { name: 'EXILE FROM HAND — ADD {R}', exact: true });
    await expect(simianAction).toBeVisible();
    await simianAction.click();
    await expect(page.locator('#modal')).not.toBeVisible();

    const afterSimian = await savedGame(page);
    const simianOwnerAfter = afterSimian.players.find(p => p.displayName === 'QA Aaron');
    expect(locateTrackedCard(afterSimian, simian.instanceId)?.zone).toBe('exile');
    expect(Number(simianOwnerAfter?.mana?.available?.R || 0)).toBe(redBefore + 1);
    expect(Number(afterSimian.stack?.length || 0)).toBe(stackBefore);
    expect(afterSimian.log.some(e => /exiles Simian Spirit Guide from hand to add R/i.test(String(e.text || '')))).toBe(true);
  });
});

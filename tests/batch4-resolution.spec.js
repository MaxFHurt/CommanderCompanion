const { test, expect } = require('@playwright/test');

test.describe('Batch 4 resolution intelligence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
  });

  test('compiles mandatory If-you-do chains in order', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { compileEffectText } = await import('./effect-engine.js?v=080-ca-batch4');
      return compileEffectText('Sacrifice a creature. If you do, draw two cards.', { sourceName:'Batch 4 Test' });
    });
    expect(result.supported).toBe(true);
    expect(result.unsupported).toEqual([]);
    expect(result.effects.map(e => e.kind)).toEqual(['sacrifice-many','draw']);
    expect(result.requirements.some(r => r.kind === 'card-selection')).toBe(true);
  });

  test('does not guess an If-you-do chain without a safe predecessor', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { compileEffectText } = await import('./effect-engine.js?v=080-ca-batch4');
      return compileEffectText('If you do, draw two cards.', { sourceName:'Batch 4 Test' });
    });
    expect(result.supported).toBe(false);
    expect(result.guidedFallbackAvailable).toBe(true);
    expect(result.unsupported).toContain('If you do, draw two cards.');
  });

  test('multi-instruction effects roll back atomically when a later instruction fails', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { applyEffects } = await import('./effect-engine.js?v=080-ca-batch4');
      const mk = (id, zone='remainingLibrary') => ({instanceId:id,definitionId:id+'-def',ownerId:'p1',controllerId:'p1',zone,tapped:false,counters:{},attachments:[],temporaryEffects:[]});
      const top=mk('top');
      const player={playerId:'p1',displayName:'Tester',life:40,poison:0,eliminated:false,counters:{},deck:{remainingLibrary:[top],hand:[],battlefield:[],graveyard:[],exile:[],tokens:[],attachments:[],commandZone:[]}};
      const game={players:[player],activePlayerId:'p1',turnNumber:1,phase:'main1',stack:[],pendingTriggers:[],cardDefinitions:{'top-def':{definitionId:'top-def',name:'Top Card',typeLine:'Creature',oracleText:''}},log:[]};
      const before=structuredClone(game);
      let message='';
      try {
        applyEffects(game,'p1',[
          {kind:'draw',scope:'you',amount:1},
          {kind:'destroy',targetId:'missing-target'}
        ]);
      } catch (e) { message=String(e.message||e); }
      return {before,after:game,message};
    });
    expect(result.message).toMatch(/target|legal|available|battlefield/i);
    expect(result.after).toEqual(result.before);
  });

  test('resolved sacrifice emits follow-on events that queue matching triggers', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { applyEffects } = await import('./effect-engine.js?v=080-ca-batch4');
      const { queueTriggers } = await import('./trigger-engine.js?v=080-ca-batch4');
      const fodder={instanceId:'fodder',definitionId:'fodder-def',ownerId:'p1',controllerId:'p1',zone:'battlefield',tapped:false,counters:{},attachments:[],temporaryEffects:[]};
      const watcher={instanceId:'watcher',definitionId:'watcher-def',ownerId:'p1',controllerId:'p1',zone:'battlefield',tapped:false,counters:{},attachments:[],temporaryEffects:[]};
      const player={playerId:'p1',displayName:'Tester',life:40,poison:0,eliminated:false,counters:{},deck:{remainingLibrary:[],hand:[],battlefield:[fodder,watcher],graveyard:[],exile:[],tokens:[],attachments:[],commandZone:[]}};
      const game={players:[player],activePlayerId:'p1',turnNumber:1,phase:'main1',stack:[],pendingTriggers:[],cardDefinitions:{
        'fodder-def':{definitionId:'fodder-def',name:'Fodder',typeLine:'Creature',oracleText:''},
        'watcher-def':{definitionId:'watcher-def',name:'Watcher',typeLine:'Creature',oracleText:'Whenever you sacrifice a creature, draw a card.'}
      },log:[]};
      applyEffects(game,'p1',[{kind:'sacrifice-many',scope:'you',amount:1,filter:'creature',bind:'pick'}],{
        pick:['fodder'],
        onEvent:event=>queueTriggers(game,event)
      });
      return {graveyard:player.deck.graveyard.map(c=>c.instanceId),pending:game.pendingTriggers.map(t=>({sourceName:t.sourceName,effectText:t.effectText,supported:t.compiled?.supported}))};
    });
    expect(result.graveyard).toContain('fodder');
    expect(result.pending.some(t => t.sourceName === 'Watcher' && /draw a card/i.test(t.effectText) && t.supported)).toBe(true);
  });

  test('Then sequencing remains supported after Batch 4 changes', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { compileEffectText } = await import('./effect-engine.js?v=080-ca-batch4');
      return compileEffectText('Draw a card then you gain 2 life.', { sourceName:'Batch 4 Test' });
    });
    expect(result.supported).toBe(true);
    expect(result.effects.map(e => e.kind)).toEqual(['draw','life']);
  });
});

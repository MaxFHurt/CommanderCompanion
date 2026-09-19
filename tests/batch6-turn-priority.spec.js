const { test, expect } = require('@playwright/test');

test.describe('Batch 6 turn flow, priority, and available actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
  });

  test('contextual jewel says DRAW during an unresolved draw step', async ({ page }) => {
    const r=await page.evaluate(async()=>{
      const {smartAction}=await import('./ui-render.js?v=080-cc-batch6');
      const p={playerId:'p1',confirmations:{draw:false},deck:{battlefield:[],hand:[]}};
      return smartAction({phase:'draw',players:[p],cardDefinitions:{},mode:'fully-tracked'},p);
    });
    expect(r).toMatchObject({action:'draw',label:'DRAW',available:true});
  });

  test('contextual jewel says ATTACK when a real opponent can legally be attacked', async ({ page }) => {
    const r=await page.evaluate(async()=>{
      const {smartAction}=await import('./ui-render.js?v=080-cc-batch6');
      const creature={instanceId:'c1',definitionId:'d1',ownerId:'p1',controllerId:'p1',zone:'battlefield',tapped:false,enteredTurn:1,controlSinceTurn:1,counters:{},temporaryEffects:[]};
      const p1={playerId:'p1',displayName:'A',eliminated:false,confirmations:{},deck:{battlefield:[creature],hand:[]}};
      const p2={playerId:'p2',displayName:'B',eliminated:false,deck:{battlefield:[],hand:[]}};
      const game={phase:'combat',turnNumber:2,players:[p1,p2],cardDefinitions:{d1:{definitionId:'d1',name:'Attacker',typeLine:'Creature',power:'2',toughness:'2',keywords:[]}},mode:'fully-tracked'};
      return smartAction(game,p1);
    });
    expect(r).toMatchObject({action:'attack',label:'ATTACK',available:true});
  });

  test('contextual jewel does not offer ATTACK when every opponent is eliminated', async ({ page }) => {
    const r=await page.evaluate(async()=>{
      const {smartAction}=await import('./ui-render.js?v=080-cc-batch6');
      const creature={instanceId:'c1',definitionId:'d1',ownerId:'p1',controllerId:'p1',zone:'battlefield',tapped:false,enteredTurn:1,controlSinceTurn:1,counters:{},temporaryEffects:[]};
      const p1={playerId:'p1',eliminated:false,confirmations:{},deck:{battlefield:[creature],hand:[]}};
      const p2={playerId:'p2',eliminated:true,deck:{battlefield:[],hand:[]}};
      return smartAction({phase:'combat',turnNumber:2,players:[p1,p2],cardDefinitions:{d1:{definitionId:'d1',name:'Attacker',typeLine:'Creature',keywords:[]}},mode:'fully-tracked'},p1);
    });
    expect(r.action).not.toBe('attack');
  });

  test('Available Actions does not advertise unrelated activated abilities as stack responses', async ({ page }) => {
    const r=await page.evaluate(async()=>{
      const {getAvailableActions}=await import('./available-actions.js?v=080-cc-batch6');
      const source={instanceId:'fetch',definitionId:'fetchdef',ownerId:'p2',controllerId:'p2',zone:'battlefield',tapped:false,counters:{},temporaryEffects:[]};
      const p1={playerId:'p1',displayName:'Caster',eliminated:false,deck:{battlefield:[],hand:[]}};
      const p2={playerId:'p2',displayName:'Responder',eliminated:false,deck:{battlefield:[source],hand:[]}};
      const game={phase:'precombat-main',turnNumber:2,activePlayerId:'p1',players:[p1,p2],stack:[{id:'spell',kind:'spell',controllerId:'p1',sourceDefinitionId:'spelldef'}],priorityState:{active:true,holderId:'p2',reason:'Spell on stack'},cardDefinitions:{spelldef:{definitionId:'spelldef',name:'Spell',typeLine:'Sorcery',oracleText:''},fetchdef:{definitionId:'fetchdef',name:'Fetch Thing',typeLine:'Artifact',oracleText:'{T}, Sacrifice Fetch Thing: Search your library for a basic land card, put it onto the battlefield, then shuffle.'}}};
      return getAvailableActions({game,player:p2});
    });
    expect(r.state).toBe('priority');
    expect(r.actions.some(x=>x.type==='response-ability')).toBe(false);
    expect(r.groups[0].actions.some(x=>x.type==='pass-priority')).toBe(true);
  });

});

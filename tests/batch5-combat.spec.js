const { test, expect } = require('@playwright/test');

test.describe('Batch 5 complete combat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
  });

  async function run(page, body) {
    return page.evaluate(async (body) => {
      const combat = await import('./combat-engine.js?v=080-cb-batch5');
      const rules = await import('./rules-v0725.js?v=080-cb-batch5');
      const mkPlayer=(id,name)=>({playerId:id,displayName:name,life:40,poison:0,eliminated:false,counters:{},commanderDamage:{},commanders:[],deck:{battlefield:[],graveyard:[],hand:[],remainingLibrary:[],exile:[],tokens:[],attachments:[],commandZone:[]}});
      const mkCard=(id,def,owner)=>({instanceId:id,definitionId:def,ownerId:owner,controllerId:owner,zone:'battlefield',tapped:false,counters:{},attachments:[],temporaryEffects:[],enteredTurn:0,controlSinceTurn:0});
      return Function('combat','rules','mkPlayer','mkCard', body)(combat,rules,mkPlayer,mkCard);
    }, body);
  }

  test('first strike kills a normal blocker before normal combat damage', async ({ page }) => {
    const r=await run(page, `
      const a=mkPlayer('a','A'),d=mkPlayer('d','D'),atk=mkCard('atk','atkdef','a'),blk=mkCard('blk','blkdef','d');
      a.deck.battlefield=[atk];d.deck.battlefield=[blk];
      const game={players:[a,d],turnNumber:2,phase:'combat-damage',rulesConfig:{},cardDefinitions:{atkdef:{name:'First',typeLine:'Creature',power:'2',toughness:'2',keywords:['First strike']},blkdef:{name:'Bear',typeLine:'Creature',power:'2',toughness:'2',keywords:[]}},combatState:{attackers:[{playerId:'a',defenderId:'d',instanceId:'atk',blocked:true}],defenders:['d'],blocks:{d:{confirmed:true,assignments:[{attackerId:'atk',blockerId:'blk'}]}},damage:[]}};
      const out=combat.resolveCombat(game,{attackerPlayerId:'a'});
      return {aLife:a.life,dLife:d.life,aBF:a.deck.battlefield.map(x=>x.instanceId),dGY:d.deck.graveyard.map(x=>x.instanceId),events:out.events};
    `);
    expect(r.aBF).toContain('atk'); expect(r.dGY).toContain('blk'); expect(r.aLife).toBe(40); expect(r.dLife).toBe(40);
  });

  test('double strike plus trample deals both combat-damage steps correctly', async ({ page }) => {
    const r=await run(page, `
      const a=mkPlayer('a','A'),d=mkPlayer('d','D'),atk=mkCard('atk','atkdef','a'),blk=mkCard('blk','blkdef','d');
      a.deck.battlefield=[atk];d.deck.battlefield=[blk];
      const game={players:[a,d],turnNumber:2,phase:'combat-damage',rulesConfig:{},cardDefinitions:{atkdef:{name:'Crusher',typeLine:'Creature',power:'5',toughness:'5',keywords:['Double strike','Trample']},blkdef:{name:'Blocker',typeLine:'Creature',power:'2',toughness:'2',keywords:[]}},combatState:{attackers:[{playerId:'a',defenderId:'d',instanceId:'atk',blocked:true}],defenders:['d'],blocks:{d:{confirmed:true,assignments:[{attackerId:'atk',blockerId:'blk'}]}},damage:[]}};
      combat.resolveCombat(game,{attackerPlayerId:'a'});
      return {aLife:a.life,dLife:d.life,dGY:d.deck.graveyard.map(x=>x.instanceId)};
    `);
    expect(r.dGY).toContain('blk'); expect(r.aLife).toBe(40); expect(r.dLife).toBe(32);
  });

  test('deathtouch plus trample needs only one damage for lethal assignment', async ({ page }) => {
    const r=await run(page, `
      const a=mkPlayer('a','A'),d=mkPlayer('d','D'),atk=mkCard('atk','atkdef','a'),blk=mkCard('blk','blkdef','d');
      a.deck.battlefield=[atk];d.deck.battlefield=[blk];
      const game={players:[a,d],turnNumber:2,phase:'combat-damage',rulesConfig:{},cardDefinitions:{atkdef:{name:'Viper',typeLine:'Creature',power:'3',toughness:'3',keywords:['Deathtouch','Trample']},blkdef:{name:'Wall',typeLine:'Creature',power:'0',toughness:'8',keywords:[]}},combatState:{attackers:[{playerId:'a',defenderId:'d',instanceId:'atk',blocked:true}],defenders:['d'],blocks:{d:{confirmed:true,assignments:[{attackerId:'atk',blockerId:'blk'}]}},damage:[]}};
      combat.resolveCombat(game,{attackerPlayerId:'a'});
      return {dLife:d.life,dGY:d.deck.graveyard.map(x=>x.instanceId)};
    `);
    expect(r.dGY).toContain('blk'); expect(r.dLife).toBe(38);
  });

  test('lifelink gains life from simultaneous creature and player combat damage', async ({ page }) => {
    const r=await run(page, `
      const a=mkPlayer('a','A'),d=mkPlayer('d','D');a.life=30;
      const one=mkCard('one','oneDef','a'),two=mkCard('two','twoDef','a'),blk=mkCard('blk','blkDef','d');
      a.deck.battlefield=[one,two];d.deck.battlefield=[blk];
      const defs={oneDef:{name:'Linked',typeLine:'Creature',power:'3',toughness:'3',keywords:['Lifelink']},twoDef:{name:'Linked2',typeLine:'Creature',power:'2',toughness:'2',keywords:['Lifelink']},blkDef:{name:'Blocker',typeLine:'Creature',power:'0',toughness:'4',keywords:[]}};
      const game={players:[a,d],turnNumber:2,phase:'combat-damage',rulesConfig:{},cardDefinitions:defs,combatState:{attackers:[{playerId:'a',defenderId:'d',instanceId:'one',blocked:true},{playerId:'a',defenderId:'d',instanceId:'two'}],defenders:['d'],blocks:{d:{confirmed:true,assignments:[{attackerId:'one',blockerId:'blk'}]}},damage:[]}};
      combat.resolveCombat(game,{attackerPlayerId:'a'});return {life:a.life,dLife:d.life};
    `);
    expect(r.life).toBe(35); expect(r.dLife).toBe(38);
  });

  test('menace, flying/reach, tapped blockers, summoning sickness and haste validate correctly', async ({ page }) => {
    const r=await run(page, `
      const a=mkPlayer('a','A'),d=mkPlayer('d','D');
      const menace=mkCard('m','mdef','a'),fly=mkCard('f','fdef','a'),sick=mkCard('s','sdef','a'),haste=mkCard('h','hdef','a');
      sick.controlSinceTurn=3;sick.enteredTurn=3;haste.controlSinceTurn=3;haste.enteredTurn=3;
      const ground=mkCard('g','gdef','d'),reach=mkCard('r','rdef','d'),tapped=mkCard('t','tdef','d');tapped.tapped=true;
      a.deck.battlefield=[menace,fly,sick,haste];d.deck.battlefield=[ground,reach,tapped];
      const defs={mdef:{name:'Menace',typeLine:'Creature',keywords:['Menace']},fdef:{name:'Fly',typeLine:'Creature',keywords:['Flying']},sdef:{name:'Sick',typeLine:'Creature',keywords:[]},hdef:{name:'Haste',typeLine:'Creature',keywords:['Haste']},gdef:{name:'Ground',typeLine:'Creature',keywords:[]},rdef:{name:'Reach',typeLine:'Creature',keywords:['Reach']},tdef:{name:'Tapped',typeLine:'Creature',keywords:[]}};
      const game={players:[a,d],turnNumber:3,phase:'declare-attackers',cardDefinitions:defs,combatState:{attackers:[{playerId:'a',defenderId:'d',instanceId:'m'}],blocks:{}}};
      return {
        sick:rules.validateAttack({game,attackerId:'a',defenderId:'d',instance:sick,definition:defs.sdef}).legal,
        haste:rules.validateAttack({game,attackerId:'a',defenderId:'d',instance:haste,definition:defs.hdef}).legal,
        flyGround:rules.validateBlock({blocker:ground,definition:defs.gdef,attackerDefinition:defs.fdef,attacker:fly}).legal,
        flyReach:rules.validateBlock({blocker:reach,definition:defs.rdef,attackerDefinition:defs.fdef,attacker:fly}).legal,
        tapped:rules.validateBlock({blocker:tapped,definition:defs.tdef,attackerDefinition:defs.mdef,attacker:menace}).legal,
        menaceOne:rules.validateBlockAssignments({game,defender:d,assignments:[{attackerId:'m',blockerId:'g'}]}).legal,
        menaceTwo:rules.validateBlockAssignments({game,defender:d,assignments:[{attackerId:'m',blockerId:'g'},{attackerId:'m',blockerId:'r'}]}).legal
      };
    `);
    expect(r).toEqual({sick:false,haste:true,flyGround:false,flyReach:true,tapped:false,menaceOne:false,menaceTwo:true});
  });

  test('multiplayer combat resolves each defender independently and emits combat events', async ({ page }) => {
    const r=await run(page, `
      const a=mkPlayer('a','A'),b=mkPlayer('b','B'),c=mkPlayer('c','C'),x=mkCard('x','xdef','a'),y=mkCard('y','ydef','a');
      a.deck.battlefield=[x,y];const events=[];
      const game={players:[a,b,c],turnNumber:2,phase:'combat-damage',rulesConfig:{},cardDefinitions:{xdef:{name:'X',typeLine:'Creature',power:'3',toughness:'3',keywords:[]},ydef:{name:'Y',typeLine:'Creature',power:'4',toughness:'4',keywords:[]}},combatState:{attackers:[{playerId:'a',defenderId:'b',instanceId:'x'},{playerId:'a',defenderId:'c',instanceId:'y'}],defenders:['b','c'],blocks:{b:{confirmed:true,assignments:[]},c:{confirmed:true,assignments:[]}},damage:[]}};
      combat.resolveCombat(game,{attackerPlayerId:'a',onEvent:e=>events.push(e)});
      return {b:b.life,c:c.life,events:events.filter(e=>e.type==='combat-damage-player').map(e=>[e.sourceId,e.playerId,e.amount])};
    `);
    expect(r.b).toBe(37); expect(r.c).toBe(36); expect(r.events).toEqual(expect.arrayContaining([['x','b',3],['y','c',4]]));
  });
});

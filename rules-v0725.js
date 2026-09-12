import { isCardDefinitionComplete } from './schema.js?v=0722';
const COLORS=['W','U','B','R','G','C'];

export const DEFAULT_COMMANDER_RULES=Object.freeze({
  commanderDamage:true,
  commanderDamageThreshold:21,
  poisonLoss:true,
  poisonThreshold:10,
  startingLife:40,
  commanderTax:true,
  bannedList:true,
  colorIdentity:true,
  singleton:true,
  wishes:false,
  mulligan:'commander',
  ruleZeroOverrides:false,
  firstPlayerDraw:true,
  endTurnConfirm:true,
  allowExtraLand:false
});
export function normalizeRulesConfig(config={}){return {...DEFAULT_COMMANDER_RULES,...(config||{})}}
export function evaluateLosses(game){
  const rules=normalizeRulesConfig(game?.rulesConfig);const newly=[];
  for(const p of game?.players||[]){
    if(p.eliminated)continue;
    let reason='';
    if(Number(p.life||0)<=0)reason='life';
    else if(rules.poisonLoss!==false&&Number(p.poison||0)>=Number(rules.poisonThreshold||10))reason='poison';
    else if(rules.commanderDamage!==false&&Object.values(p.commanderDamage||{}).some(v=>Number(v)>=Number(rules.commanderDamageThreshold||21)))reason='commander damage';
    if(reason){p.eliminated=true;p.eliminationReason=reason;newly.push({playerId:p.playerId,reason})}
  }
  const alive=(game?.players||[]).filter(p=>!p.eliminated),total=(game?.players||[]).length;
  if(total>1&&alive.length===1){game.winner=alive[0].playerId;game.result='winner';game.status='complete';game.completionReason=game.completionReason||'last-player-standing'}
  else if(total>1&&alive.length===0){game.winner=null;game.result='draw';game.status='complete';game.completionReason=game.completionReason||'all-players-eliminated'}
  return {newly,alive,winner:game?.winner||null,result:game?.result||null};
}

export function parseManaCost(cost=''){
  const symbols=[...String(cost).matchAll(/\{([^}]+)\}/g)].map(x=>x[1]);
  const req={generic:0,W:0,U:0,B:0,R:0,G:0,C:0};
  for(const s of symbols){ if(/^\d+$/.test(s))req.generic+=+s; else if(COLORS.includes(s))req[s]++; }
  return req;
}
export function planMana(available,cost,tax=0){
  const req=parseManaCost(cost); req.generic+=tax; const pool={...available}; const chosen={W:0,U:0,B:0,R:0,G:0,C:0};
  for(const c of COLORS){ if(c==='C')continue; if((pool[c]||0)<req[c])return {ok:false,reason:`Need ${req[c]} ${c} mana`}; pool[c]-=req[c];chosen[c]+=req[c]; }
  if((pool.C||0)<req.C)return {ok:false,reason:`Need ${req.C} true colorless mana`}; pool.C-=req.C;chosen.C+=req.C;
  let generic=req.generic; for(const c of ['C','W','U','B','R','G']){const use=Math.min(pool[c]||0,generic);chosen[c]+=use;pool[c]-=use;generic-=use;if(!generic)break;}
  return generic?{ok:false,reason:`Need ${generic} more generic mana`}:{ok:true,required:req,chosen,remaining:pool};
}
export function validatePlay({game,player,definition,instance,kind='cast',commander=null,definitions}){
  const reasons=[]; const warnings=[];
  if(!definition||!isCardDefinitionComplete(definition)) reasons.push('Card data is unresolved or incomplete.');
  if(instance&&instance.ownerId!==player.playerId) reasons.push('This card is not owned by this player.');
  const main=['precombat-main','postcombat-main'].includes(game.phase);
  const type=definition?.typeLine||'';
  if(kind==='land'){
    if(!main) reasons.push('A land can normally be played only during a main phase.');
    const landLimit=(game.rulesConfig?.allowExtraLand?2:1)+Number(player.counters?.extraLandPlaysThisTurn||0);
    if((player.counters?.landsPlayedThisTurn||0)>=landLimit) reasons.push('Normal land play for this turn has already been used.');
  } else if(!main && /Sorcery|Creature|Artifact|Enchantment|Planeswalker/i.test(type)) reasons.push('This card normally requires main-phase timing.');
  const rules=normalizeRulesConfig(game?.rulesConfig);
  const identity=definitions?effectiveIdentity(player,definitions):[];
  if(rules.colorIdentity!==false&&definition&&identity.length&&definition.colorIdentity.some(c=>!identity.includes(c))) reasons.push('Card color identity is outside the commander identity.');
  const tax=commander&&rules.commanderTax!==false?commander.commanderTax:0; const payment=kind==='land'?{ok:true,chosen:{}}:planMana(player.mana.available,definition?.manaCost||'',tax);
  if(!payment.ok) reasons.push(payment.reason);
  if(rules.ruleZeroOverrides&&reasons.length){warnings.push(...reasons.map(x=>`Rule Zero override: ${x}`));return {legal:true,reasons:[],requiredMana:payment.required||{},suggestedPayment:payment.chosen||{},warnings,overridden:true};}
  return {legal:reasons.length===0,reasons,requiredMana:payment.required||{},suggestedPayment:payment.chosen||{},warnings};
}
function effectiveIdentity(player,definitions){return [...new Set(player.commanders.flatMap(c=>definitions.get(c.cardId)?.colorIdentity||[]))];}

export function isCommanderEligible(card){
  if(!card)return false;
  const type=card.typeLine||'',text=card.oracleText||'';
  return (/Legendary/i.test(type)&&/Creature/i.test(type))||/can be your commander/i.test(text);
}

export function isSecondaryCommanderEligible(card){
  return isCommanderEligible(card)||background(card);
}
function plainPartner(x){return /(^|\n)Partner\b(?! with)/i.test(x?.oracleText||'')}
function friends(x){return /Friends forever/i.test(x?.oracleText||'')}
function doctor(x){return /Legendary Creature[^—]*—[^\n]*Doctor\b/i.test(x?.typeLine||'')}
function doctorsComp(x){return /Doctor's companion/i.test(x?.oracleText||'')}
function background(x){return /Legendary Enchantment\s+—\s+Background/i.test(x?.typeLine||'')}
function chooseBg(x){return /Choose a Background/i.test(x?.oracleText||'')}
function partnerWith(x,y){return new RegExp(`Partner with\\s+${String(y?.name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i').test(x?.oracleText||'')}
export function allowsSecondaryCommander(card){
  if(!card)return false;
  return plainPartner(card)||friends(card)||doctorsComp(card)||chooseBg(card)||background(card)||/Partner with\s+/i.test(card.oracleText||'')||doctor(card);
}
export function canShareCommandZone(a,b){
  if(!a||!b||a.definitionId===b.definitionId)return false;
  return (plainPartner(a)&&plainPartner(b))||(friends(a)&&friends(b))||(doctor(a)&&doctorsComp(b))||(doctor(b)&&doctorsComp(a))||(background(a)&&chooseBg(b))||(background(b)&&chooseBg(a))||partnerWith(a,b)||partnerWith(b,a);
}
export function validateCommanderConfiguration(commanders=[]){
  if(commanders.length<1||commanders.length>2)return {legal:false,reasons:['Commander requires one commander or an allowed two-card commander configuration.']};
  if(commanders.length===1)return isCommanderEligible(commanders[0])?{legal:true,reasons:[]}:{legal:false,reasons:['The selected card is not legally eligible to be a commander.']};
  if(commanders.some(c=>!isSecondaryCommanderEligible(c)))return {legal:false,reasons:['Every selected command-zone card must be legal in that Commander configuration.']};
  const legal=canShareCommandZone(commanders[0],commanders[1]);
  return {legal,reasons:legal?[]:['These two cards do not form a legal shared commander configuration.']};
}
export function validateDeckColorIdentity(definitions,commanders){
  const identity=[...new Set(commanders.flatMap(c=>c.colorIdentity||[]))];const violations=[];
  for(const d of definitions){if((d.colorIdentity||[]).some(c=>!identity.includes(c)))violations.push(d.name)}
  return {legal:violations.length===0,identity,violations};
}
function instanceKeyword(instance,definition,name){
  const n=String(name||'').toLowerCase();
  if(new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(String(definition?.oracleText||'')))return true;
  if((definition?.keywords||[]).some(x=>String(x).toLowerCase()===n))return true;
  return (instance?.temporaryEffects||[]).some(e=>e?.kind==='keyword'&&e?.enabled!==false&&String(e.keyword||'').toLowerCase()===n);
}
function combatRestriction(instance,name){return (instance?.temporaryEffects||[]).some(e=>e?.kind==='combat-restriction'&&e?.restriction===name)}
export function validateAttack({game,attackerId,defenderId,instance,definition=null}){
  const reasons=[];
  if(!['combat','begin-combat','declare-attackers'].includes(game.phase))reasons.push('Attacks can be declared only during combat.');
  if(attackerId===defenderId)reasons.push('A player cannot attack themselves.');
  const defender=(game.players||[]).find(p=>p.playerId===defenderId);
  if(!defender)reasons.push('The chosen defending player is not in this game.');
  else if(defender.eliminated)reasons.push('An eliminated player cannot be attacked.');
  if(instance?.tapped)reasons.push('A tapped creature cannot attack.');
  if(combatRestriction(instance,'cant-attack-or-block'))reasons.push('This creature cannot attack this turn.');
  if(definition&&!/Creature/i.test(definition.typeLine||''))reasons.push('Only creatures can attack.');
  if(instanceKeyword(instance,definition,'Defender')&&!/can attack as though it didn'?t have defender/i.test(definition?.oracleText||''))reasons.push('A creature with defender cannot attack.');
  const haste=instanceKeyword(instance,definition,'Haste');
  if(!haste && Number(instance?.controlSinceTurn??instance?.enteredTurn??-1)>=Number(game.turnNumber))reasons.push('This creature has summoning sickness and cannot attack this turn.');
  return {legal:!reasons.length,reasons};
}
export function validateBlock({blocker,definition,attackerDefinition,attacker=null}){
  const reasons=[];
  if(!blocker)reasons.push('A blocker must be an actual creature card.');
  if(definition&&!/Creature/i.test(definition.typeLine||''))reasons.push('Only creatures can block.');
  if(blocker?.tapped)reasons.push('A tapped creature cannot block.');
  if(combatRestriction(blocker,'cant-block')||combatRestriction(blocker,'cant-attack-or-block'))reasons.push('This creature cannot block this turn.');
  const bt=String(definition?.oracleText||''),at=String(attackerDefinition?.oracleText||'');
  if(/can'?t block/i.test(bt))reasons.push('This creature cannot block.');
  if(/can'?t be blocked/i.test(at))reasons.push('This attacker cannot be blocked.');
  const flying=instanceKeyword(attacker,attackerDefinition,'Flying'),reach=instanceKeyword(blocker,definition,'Reach'),blockerFlying=instanceKeyword(blocker,definition,'Flying');
  if(flying&&!reach&&!blockerFlying)reasons.push('A creature with flying can be blocked only by flying or reach unless another effect allows it.');
  if(instanceKeyword(attacker,attackerDefinition,'Shadow')&&!instanceKeyword(blocker,definition,'Shadow'))reasons.push('Shadow prevents this creature from blocking that attacker.');
  if(instanceKeyword(attacker,attackerDefinition,'Fear')&&!/Artifact/i.test(definition?.typeLine||'')&&!/Black/i.test(definition?.colors?.join?.(' ')||''))reasons.push('Fear prevents this creature from blocking that attacker.');
  return {legal:!reasons.length,reasons};
}

export function validateForcedBlockAssignments({game,defender,assignments=[]}={}){
  const reasons=[];if(!game||!defender)return {legal:true,reasons};const attackers=(game.combatState?.attackers||[]).filter(a=>a.defenderId===defender.playerId);
  for(const blocker of defender.deck?.battlefield||[]){for(const fx of blocker.temporaryEffects||[]){if(fx?.kind!=='forced-block'||!fx.attackerId)continue;const attack=attackers.find(a=>a.instanceId===fx.attackerId);if(!attack)continue;const attackerOwner=(game.players||[]).find(p=>(p.deck?.battlefield||[]).some(c=>c.instanceId===attack.instanceId));const attacker=attackerOwner?.deck?.battlefield?.find(c=>c.instanceId===attack.instanceId);const bdef=game.cardDefinitions?.[blocker.definitionId],adef=attacker&&game.cardDefinitions?.[attacker.definitionId];if(!attacker||!validateBlock({blocker,definition:bdef,attackerDefinition:adef,attacker}).legal)continue;const assigned=assignments.some(x=>x.blockerId===blocker.instanceId&&x.attackerId===attack.instanceId);if(!assigned)reasons.push(`${bdef?.name||'A creature'} must block ${adef?.name||'the chosen attacker'} if able.`)}}
  return {legal:reasons.length===0,reasons};
}

export function validateBlockAssignments({game,defender,assignments=[]}={}){
  const reasons=[];if(!game||!defender)return {legal:false,reasons:['Defender and game state are required.']};
  const incoming=(game.combatState?.attackers||[]).filter(a=>a.defenderId===defender.playerId);
  const incomingIds=new Set(incoming.map(a=>a.instanceId));
  const seenPairs=new Set(),counts=new Map();
  for(const row of assignments||[]){
    if(!row?.blockerId||!row?.attackerId){reasons.push('Every blocker assignment must name a blocker and attacker.');continue}
    const pair=`${row.blockerId}=>${row.attackerId}`;
    if(seenPairs.has(pair)){reasons.push('The same blocker cannot be assigned to the same attacker more than once.');continue}
    seenPairs.add(pair);
    if(!incomingIds.has(row.attackerId)){reasons.push('A blocker was assigned to a creature that is not attacking this defender.');continue}
    const blocker=(defender.deck?.battlefield||[]).find(c=>c.instanceId===row.blockerId);
    if(!blocker){reasons.push('A blocker assignment references a creature this defender does not control on the battlefield.');continue}
    const attack=incoming.find(a=>a.instanceId===row.attackerId);
    const attackerOwner=(game.players||[]).find(p=>(p.deck?.battlefield||[]).some(c=>c.instanceId===attack?.instanceId));
    const attacker=attackerOwner?.deck?.battlefield?.find(c=>c.instanceId===attack?.instanceId);
    const bdef=game.cardDefinitions?.[blocker.definitionId],adef=attacker&&game.cardDefinitions?.[attacker.definitionId];
    const legal=validateBlock({blocker,definition:bdef,attackerDefinition:adef,attacker});
    if(!legal.legal){reasons.push(`${bdef?.name||'That creature'} cannot block ${adef?.name||'that attacker'}: ${legal.reasons[0]||'illegal block'}`);continue}
    counts.set(blocker.instanceId,(counts.get(blocker.instanceId)||0)+1);
    if(counts.get(blocker.instanceId)>blockerCapacity(bdef))reasons.push(`${bdef?.name||'That creature'} is assigned to block more attackers than it can legally block.`);
  }
  for(const attack of incoming){
    const attackerOwner=(game.players||[]).find(p=>(p.deck?.battlefield||[]).some(c=>c.instanceId===attack.instanceId));
    const attacker=attackerOwner?.deck?.battlefield?.find(c=>c.instanceId===attack.instanceId);
    const adef=attacker&&game.cardDefinitions?.[attacker.definitionId];
    const count=(assignments||[]).filter(x=>x.attackerId===attack.instanceId).length,min=attackerMinimumBlockers(adef,attacker);
    if(count>0&&count<min)reasons.push(`${adef?.name||'That attacker'} requires at least ${min} blockers.`);
  }
  const forced=validateForcedBlockAssignments({game,defender,assignments});if(!forced.legal)reasons.push(...forced.reasons);
  return {legal:reasons.length===0,reasons};
}

const NUMBER_WORDS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
function commanderCopyLimit(card){
  if(!card)return 1;
  if(/\bBasic\b.*\bLand\b/i.test(card.typeLine||''))return Infinity;
  const text=String(card.oracleText||'');
  if(/A deck can have any number of cards named/i.test(text))return Infinity;
  const m=text.match(/A deck can have up to\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+cards named/i);
  if(m){const k=String(m[1]).toLowerCase();return /^\d+$/.test(k)?Number(k):(NUMBER_WORDS[k]||1)}
  return 1;
}

export function validateCommanderDeck({manifest=[],definitions=[],commanders=[],rulesConfig={}}={}){
  const rules=normalizeRulesConfig(rulesConfig);
  const reasons=[];const warnings=[];
  const defs=definitions instanceof Map?definitions:new Map((definitions||[]).map(d=>[d.definitionId,d]));
  const total=(manifest||[]).reduce((n,e)=>n+Number(e.quantity??e.qty??1),0);
  if(total!==100)reasons.push(`Commander decks must contain exactly 100 cards including commander(s); this deck has ${total}.`);
  const commanderCheck=validateCommanderConfiguration(commanders);
  if(!commanderCheck.legal)reasons.push(...commanderCheck.reasons);
  for(const c of commanders){
    const qty=(manifest||[]).filter(e=>e.definitionId===c.definitionId).reduce((n,e)=>n+Number(e.quantity??e.qty??1),0);
    if(qty<1)reasons.push(`${c.name||'Selected commander'} is not present in the 100-card deck list.`);
  }
  const byName=new Map();
  for(const e of manifest||[]){
    const d=defs.get(e.definitionId);const q=Number(e.quantity??e.qty??1);
    if(!Number.isInteger(q)||q<1){reasons.push(`Deck quantities must be positive whole numbers (${e.definitionId}).`);continue}
    if(!d){reasons.push(`Deck contains an unresolved card definition (${e.definitionId}).`);continue}
    const key=String(d.name||'').toLocaleLowerCase('en-US');
    const row=byName.get(key)||{name:d.name,quantity:0,card:d};row.quantity+=q;byName.set(key,row);
    const commanderLegality=d.legalities?.commander;
    if(rules.bannedList!==false&&commanderLegality&&commanderLegality!=='legal')reasons.push(`${d.name} is ${commanderLegality.replace('_',' ')} in Commander.`);
  }
  if(rules.singleton!==false)for(const {name,quantity,card} of byName.values()){
    const limit=commanderCopyLimit(card);
    if(quantity>limit)reasons.push(limit===1?`${name} appears ${quantity} times; Commander is singleton except for basic lands or cards whose rules text allows extra copies.`:`${name} appears ${quantity} times; its rules allow at most ${limit}.`);
  }
  const identity=validateDeckColorIdentity([...defs.values()],commanders);
  if(rules.colorIdentity!==false&&!identity.legal)reasons.push(`Cards outside commander color identity: ${identity.violations.slice(0,8).join(', ')}${identity.violations.length>8?'…':''}`);
  return {legal:reasons.length===0,reasons:[...new Set(reasons)],warnings,total,identity:identity.identity};
}


export function isBasicLand(definition){return /\bBasic\b.*\bLand\b/i.test(definition?.typeLine||'')}
export function basicLandManaColor(definition){const t=definition?.typeLine||'';if(/Plains/i.test(t))return'W';if(/Island/i.test(t))return'U';if(/Swamp/i.test(t))return'B';if(/Mountain/i.test(t))return'R';if(/Forest/i.test(t))return'G';return null}
export function parseActivatedAbilities(definition){
  const raw=String(definition?.oracleText||'').replace(/\r/g,'');
  const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);
  const abilities=[];
  let current=null;
  for(const line of lines){
    const looksActivated=line.includes(':')&&!/^[•—-]/.test(line)&&!/^(When|Whenever|At)\b/i.test(line)&&!/(?:^|[—-]\s*)(When|Whenever|At)\b/i.test(line);
    if(looksActivated){
      if(current)abilities.push(current);
      current={text:line,continuations:[]};
    }else if(current&&(/^[•—-]/.test(line)||/^Choose\b/i.test(line)||/^Activate only\b/i.test(line)||/^This ability\b/i.test(line))){
      current.continuations.push(line);
    }else if(current){
      abilities.push(current);current=null;
    }
  }
  if(current)abilities.push(current);
  return abilities.map((a,index)=>{
    const full=[a.text,...a.continuations].join('\n');
    const m=a.text.match(/^(.+?):\s*(.*)$/s);const cost=(m?.[1]||'').trim();const effect=[m?.[2]||'',...a.continuations].filter(Boolean).join('\n').trim();
    const modes=[...effect.matchAll(/(?:^|\n)•\s*([^\n]+)/g)].map(x=>x[1].trim());
    const chooseMatch=effect.match(/Choose\s+(one|two|three|one or more)\s*[—-]/i);
    const loyaltyMatch=cost.match(/^([+−-])\s*(\d+)$/);
    const loyaltyDelta=loyaltyMatch?(loyaltyMatch[1]==='+'?1:-1)*Number(loyaltyMatch[2]):null;
    return {
      id:`ability-${index}`,
      text:full,
      cost,effect,
      requiresTap:/\{T\}/i.test(cost),
      requiresUntap:/\{Q\}/i.test(cost),
      sacrificesSelf:/Sacrifice\s+(?:this permanent|this creature|this artifact|this enchantment|this land|this planeswalker|~)\b/i.test(cost)||new RegExp(`Sacrifice\\s+${String(definition?.name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(cost),
      sacrificeRequirement:(cost.match(/Sacrifice\s+(?:an?\s+)?(creature|artifact|enchantment|land|permanent)\b/i)||[])[1]||null,
      discards:/Discard\b/i.test(cost),
      discardCount:/Discard\s+(?:a|one)\s+card/i.test(cost)?1:0,
      lifeCost:Number((cost.match(/Pay\s+(\d+)\s+life/i)||[])[1]||0),
      loyaltyDelta,
      hasX:/\{X\}|\bX\b/.test(cost)||/\bX\b/.test(effect),
      needsTarget:/\btarget\b/i.test(effect),
      modes,
      modeCount:chooseMatch?chooseMatch[1].toLowerCase():null,
      manaAbility:isManaAbilityLine(full),
      manaOptions:manaOptionsFromAbility(full)
    };
  });
}
export function activatedAbilityLines(definition){return parseActivatedAbilities(definition).map(a=>a.text)}
export function isManaAbilityLine(line=''){
  const [cost,effect='']=String(line).split(/:(.*)/s);
  return /\bAdd\b/i.test(effect)&&!/\btarget\b/i.test(effect)&&!/(loyalty|planeswalker)/i.test(cost);
}
export function manaOptionsFromAbility(line=''){
  if(!isManaAbilityLine(line))return[];const effect=String(line).split(/:(.*)/s)[1]||'';const out=[];
  for(const m of effect.matchAll(/\{([WUBRGC])\}/g))out.push(m[1]);
  if(/mana of any color/i.test(effect))out.push('W','U','B','R','G');
  if(/mana of any type/i.test(effect))out.push('W','U','B','R','G','C');
  return [...new Set(out)];
}
export function tapManaAbilities(definition){return parseActivatedAbilities(definition).filter(a=>a.requiresTap&&a.manaAbility&&a.manaOptions.length).map(a=>({text:a.text,options:a.manaOptions,ability:a}))}
export function validateActivatedAbility({game,instance,definition,ability}){
  const reasons=[];
  if(!instance)reasons.push('The source permanent is no longer available.');
  if(!ability)reasons.push('The selected activated ability is unavailable.');
  if(ability?.requiresTap&&instance?.tapped)reasons.push('This permanent is already tapped and cannot pay {T}.');
  if(ability?.requiresUntap&&!instance?.tapped)reasons.push('This permanent is untapped and cannot pay {Q}.');
  const hasHaste=instanceKeyword(instance,definition,'Haste');
  if((ability?.requiresTap||ability?.requiresUntap)&&/Creature/i.test(definition?.typeLine||'')&&!hasHaste&&Number(instance?.controlSinceTurn??instance?.enteredTurn??-1)>=Number(game?.turnNumber))reasons.push('This creature has summoning sickness and cannot activate an ability with {T} or {Q} in its cost.');
  return {legal:!reasons.length,reasons};
}

export function validateActivatedAbilityFull({game,player,instance,definition,ability,definitions}={}){
  const base=validateActivatedAbility({game,instance,definition,ability});
  const reasons=[...base.reasons];
  if(!player)reasons.push('The activating player is unavailable.');
  if(ability?.sacrificesSelf&&instance?.zone!=='battlefield')reasons.push('The source permanent is no longer on the battlefield to sacrifice.');
  const cost=String(ability?.cost||'');
  const manaCost=(cost.match(/(?:\{(?:\d+|[WUBRGC])\})+/g)||[]).join('');
  if(manaCost&&player){const payment=planMana(player.mana?.available||{},manaCost,0);if(!payment.ok)reasons.push(payment.reason)}
  if(ability?.lifeCost&&player&&Number(player.life||0)<Number(ability.lifeCost))reasons.push('Not enough life to pay this activation cost.');
  if(Number(ability?.loyaltyDelta)<0&&Number(instance?.counters?.loyalty||0)<Math.abs(Number(ability.loyaltyDelta)))reasons.push('Not enough loyalty to pay this activation cost.');
  if(ability?.discards&&player&&(player.deck?.hand?.length||0)<Math.max(1,ability.discardCount||1))reasons.push('Not enough cards in hand to pay this activation cost.');
  if(ability?.sacrificeRequirement&&player&&!ability?.sacrificesSelf){
    const need=String(ability.sacrificeRequirement);
    const candidates=(player.deck?.battlefield||[]).filter(c=>c.instanceId!==instance?.instanceId&&new RegExp(`\\b${need}\\b`,'i').test((definitions instanceof Map?definitions.get(c.definitionId):definitions?.[c.definitionId])?.typeLine||''));
    if(!candidates.length)reasons.push(`No legal ${need.toLowerCase()} is available to sacrifice.`);
  }
  if(ability?.needsTarget){
    const effect=String(ability.effect||'');let targetFound=false;
    if(/target (?:player|opponent)/i.test(effect))targetFound=(game?.players||[]).some(q=>!/opponent/i.test(effect)||q.playerId!==player?.playerId);
    if(/target (?:creature|permanent|artifact|enchantment|planeswalker|land)/i.test(effect)){
      const players=/you control/i.test(effect)?[player]:(game?.players||[]);
      for(const q of players.filter(Boolean))for(const c of q.deck?.battlefield||[]){const d=definitions instanceof Map?definitions.get(c.definitionId):definitions?.[c.definitionId];const t=d?.typeLine||'';if(/target creature/i.test(effect)&&!/Creature/i.test(t))continue;if(/target artifact/i.test(effect)&&!/Artifact/i.test(t))continue;if(/target enchantment/i.test(effect)&&!/Enchantment/i.test(t))continue;if(/target planeswalker/i.test(effect)&&!/Planeswalker/i.test(t))continue;if(/target land/i.test(effect)&&!/Land/i.test(t))continue;if(/with a counter on it/i.test(effect)&&!Object.values(c.counters||{}).some(v=>Number(v)>0))continue;targetFound=true;break}
    }
    if(/target card in (?:a|your) graveyard/i.test(effect)){const players=/your graveyard/i.test(effect)?[player]:(game?.players||[]);targetFound=players.filter(Boolean).some(q=>(q.deck?.graveyard||[]).length>0)}
    if(!targetFound)reasons.push('No legal target is currently available for this ability.');
  }
  return {legal:reasons.length===0,reasons:[...new Set(reasons)]};
}
export function availableActivatedAbilities({game,instance,definition}){
  return parseActivatedAbilities(definition).map(ability=>({ability,...validateActivatedAbility({game,instance,definition,ability})}));
}
export function canActivateTapAbility({game,instance,definition}){
  const rows=availableActivatedAbilities({game,instance,definition}).filter(x=>x.ability.requiresTap);
  if(!rows.length)return{legal:false,reasons:['No activated ability with {T} in its cost was found.']};
  const legal=rows.find(x=>x.legal);return legal?{legal:true,reasons:[]}:{legal:false,reasons:[...new Set(rows.flatMap(x=>x.reasons))]};
}
export function entersBattlefieldTapped({definition,battlefield=[],definitions={}}={}){
  const text=String(definition?.oracleText||'');if(!/enters(?: the battlefield)? tapped/i.test(text))return false;
  const getDef=c=>definitions instanceof Map?definitions.get(c.definitionId):definitions?.[c.definitionId];
  // Count-based tracked-state clauses, e.g. "unless you control two or more basic lands."
  const count=text.match(/enters(?: the battlefield)? tapped unless you control (\d+|one|two|three|four|five|six|seven|eight|nine|ten) or more ([^.]+?)(?: cards?| permanents?| lands?)?\./i);
  if(count){
    const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
    const need=Number(count[1])||words[String(count[1]).toLowerCase()]||0;const phrase=String(count[2]||'').trim();
    const matches=c=>{const d=getDef(c),type=String(d?.typeLine||'');if(/basic land/i.test(phrase))return /\bBasic\b/i.test(type)&&/\bLand\b/i.test(type);if(/land/i.test(phrase))return /\bLand\b/i.test(type);if(/artifact/i.test(phrase))return /\bArtifact\b/i.test(type);if(/creature/i.test(phrase))return /\bCreature\b/i.test(type);return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\b`,'i').test(type)};
    return battlefield.filter(matches).length<need;
  }
  // Common "unless you control a TYPE" land clause. If the condition can be proven true, it enters untapped.
  const m=text.match(/enters(?: the battlefield)? tapped unless you control (?:a|an) ([A-Za-z]+)(?: or (?:a|an) ([A-Za-z]+))?/i);
  if(m){const types=[m[1],m[2]].filter(Boolean);const has=battlefield.some(c=>{const d=getDef(c);return types.some(t=>new RegExp(`\\b${t}\\b`,'i').test(d?.typeLine||''))});return !has}
  if(/enters(?: the battlefield)? tapped unless/i.test(text))return true;
  return true;
}
export function validateRequiredAttackers({game,player,draft=[]}={}){
  const reasons=[];if(!game||!player)return {legal:true,reasons};const chosen=new Set((draft||[]).map(x=>x.instanceId));const opponents=(game.players||[]).filter(p=>p.playerId!==player.playerId&&!p.eliminated);
  for(const c of player.deck?.battlefield||[]){if(!combatRestriction(c,'must-attack'))continue;const d=game.cardDefinitions?.[c.definitionId];const able=opponents.some(o=>validateAttack({game:{...game,phase:'declare-attackers'},attackerId:player.playerId,defenderId:o.playerId,instance:c,definition:d}).legal);if(able&&!chosen.has(c.instanceId))reasons.push(`${d?.name||'A creature'} must attack this combat if able.`)}
  return {legal:reasons.length===0,reasons};
}
export function blockerCapacity(definition){const text=String(definition?.oracleText||'');const m=text.match(/can block an additional (\d+|one|two|three|four|five) creatures?/i);if(!m)return 1;const words={one:1,two:2,three:3,four:4,five:5};return 1+(Number(m[1])||words[m[1].toLowerCase()]||0)}
export function attackerMinimumBlockers(definition,instance=null){return instanceKeyword(instance,definition,'Menace')?2:1}

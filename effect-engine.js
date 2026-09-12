// Commander Companion V0.7.27 shared Oracle-effect resolver.
// Design rule: an automated effect must mutate authoritative game state or fail loudly.
import { effectivePower, effectiveToughness } from './combat-engine.js?v=0727';

const WORD_NUMBERS = Object.freeze({
  zero:0,a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20
});
const PLAYER_ZONES = ['remainingLibrary','hand','battlefield','graveyard','exile','tokens','attachments','commandZone'];
const COLOR_NAMES = Object.freeze({white:'W',blue:'U',black:'B',red:'R',green:'G',colorless:'C'});

export function numberFromText(value){
  const s=String(value ?? '').trim().toLowerCase();
  return /^\d+$/.test(s) ? Number(s) : (WORD_NUMBERS[s] ?? null);
}
function cleanOracle(s=''){return String(s||'').replace(/\r/g,'').replace(/[’‘]/g,"'").replace(/[–—]/g,'—').replace(/\u2212/g,'-').trim()}
function zoneArray(deck,zone){
  if(zone==='library'||zone==='remainingLibrary')return deck?.remainingLibrary;
  if(zone==='command'||zone==='commandZone')return deck?.commandZone;
  return deck?.[zone];
}
export function locateCardInGame(game,id){
  for(const player of game.players||[]){
    for(const zone of PLAYER_ZONES){
      const array=player.deck?.[zone]||[];
      const index=array.findIndex(c=>c.instanceId===id);
      if(index>=0)return {player,zone,array,index,card:array[index]};
    }
  }
  const stack=(game.stack||[]).find(x=>x?.card?.instanceId===id);
  if(stack)return {player:game.players.find(p=>p.playerId===stack.controllerId)||null,zone:'stack',array:game.stack,index:game.stack.indexOf(stack),card:stack.card,stackObject:stack};
  return null;
}
export function definitionFor(game,card){return card ? (game.cardDefinitions?.[card.definitionId]||null) : null}
function ownerFor(game,card,fallback){return game.players.find(p=>p.playerId===card?.ownerId)||fallback||null}
function currentController(game,card,fallback){return game.players.find(p=>p.playerId===card?.controllerId)||fallback||ownerFor(game,card,fallback)}
function emit(bindings,event){try{bindings?.onEvent?.(event)}catch(e){console.error('Effect event bridge failed',e)}}
function cardName(game,card){return definitionFor(game,card)?.name||'Card'}
function isCreature(def){return /\bCreature\b/i.test(def?.typeLine||'')}
function isPermanent(def){return !/\b(?:Instant|Sorcery)\b/i.test(def?.typeLine||'')}
function hasKeyword(card,def,name){
  const k=String(name||'').toLowerCase();
  if((def?.keywords||[]).some(x=>String(x).toLowerCase()===k))return true;
  if(new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(String(def?.oracleText||'')))return true;
  return (card?.temporaryEffects||[]).some(e=>e?.kind==='keyword'&&e.enabled!==false&&String(e.keyword||'').toLowerCase()===k);
}
function isIndestructible(card,def){return hasKeyword(card,def,'Indestructible')}
function resetOnZoneChange(card){
  card.tapped=false;
  card.damageMarked=0;
  card.deathtouchDamage=false;
  card.counters={};
  card.attachments=[];
  card.temporaryEffects=[];
  delete card.attacking;
  delete card.blocking;
}
export function moveCard(game,id,to,{controllerId=null,position='bottom',tapped=false,preserveCounters=false,onEvent=null}={}){
  const hit=locateCardInGame(game,id);
  if(!hit||hit.zone==='stack')throw new Error('Effect target is no longer in a movable tracked zone.');
  const from=hit.zone;
  const fromController=hit.card.controllerId||hit.player?.playerId;
  const wasTapped=!!hit.card.tapped;
  const [card]=hit.array.splice(hit.index,1);
  const definition=definitionFor(game,card);
  const owner=ownerFor(game,card,hit.player);
  if(!owner)throw new Error('Card owner is unavailable.');
  if(!preserveCounters)resetOnZoneChange(card);
  card.zone=to;
  if(to==='battlefield'){
    card.controllerId=controllerId||owner.playerId;
    card.enteredTurn=game.turnNumber;
    card.controlSinceTurn=game.turnNumber;
    card.tapped=!!tapped;
  }else{
    card.controllerId=owner.playerId;
  }
  // Tokens can enter non-battlefield zones momentarily by rules, then cease to exist.
  if(card.token&&to!=='battlefield'){
    onEvent?.({type:'zone-change',sourceId:card.instanceId,definitionId:card.definitionId,from,to,controllerId:fromController,ownerId:card.ownerId,token:true});
    if(from==='battlefield'&&to==='graveyard'&&isCreature(definition))onEvent?.({type:'dies',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:fromController,ownerId:card.ownerId,typeLine:definition?.typeLine||'',token:true});
    return {card,fromPlayer:hit.player,toPlayer:owner,tokenCeased:true};
  }
  const target=zoneArray(owner.deck,to);
  if(!target)throw new Error(`Unsupported destination zone: ${to}`);
  if(to==='library'&&position==='top')target.unshift(card);
  else target.push(card);
  onEvent?.({type:'zone-change',sourceId:card.instanceId,definitionId:card.definitionId,from,to,controllerId:fromController,ownerId:card.ownerId,typeLine:definition?.typeLine||''});
  if(from==='battlefield'&&to==='graveyard'&&isCreature(definition))onEvent?.({type:'dies',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:fromController,ownerId:card.ownerId,typeLine:definition?.typeLine||''});
  if(from==='battlefield'&&to!=='battlefield')onEvent?.({type:'leaves-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:fromController,ownerId:card.ownerId,typeLine:definition?.typeLine||'',destination:to,wasTapped});
  if(to==='battlefield')onEvent?.({type:'enters-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:card.controllerId,ownerId:card.ownerId,typeLine:definition?.typeLine||''});
  return {card,fromPlayer:hit.player,toPlayer:owner};
}
function shuffled(array){
  for(let i=array.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[array[i],array[j]]=[array[j],array[i]]}
  return array;
}
function cardMatchesFilter(game,card,filter){
  if(!filter||filter==='card')return true;
  const d=definitionFor(game,card),type=String(d?.typeLine||'').toLowerCase(),text=String(d?.oracleText||'').toLowerCase();
  const f=String(filter).toLowerCase().trim();
  if(f==='creature')return type.includes('creature');
  if(f==='land')return type.includes('land');
  if(f==='artifact')return type.includes('artifact');
  if(f==='enchantment')return type.includes('enchantment');
  if(f==='planeswalker')return type.includes('planeswalker');
  if(f==='battle')return type.includes('battle');
  if(f==='instant')return type.includes('instant');
  if(f==='sorcery')return type.includes('sorcery');
  if(f==='permanent')return isPermanent(d);
  if(f==='basic land')return /\bbasic\b/.test(type)&&/\bland\b/.test(type);
  if(f==='nonland permanent')return isPermanent(d)&&!type.includes('land');
  if(f==='noncreature')return !type.includes('creature');
  if(f.startsWith('type:'))return type.includes(f.slice(5));
  if(f.startsWith('oracle:'))return text.includes(f.slice(7));
  return type.includes(f);
}
function countCards(game,controllerId,expr={}){
  const player=game.players.find(p=>p.playerId===controllerId);
  if(!player)return 0;
  const zone=expr.zone||'battlefield';
  const cards=zoneArray(player.deck,zone)||[];
  return cards.filter(c=>cardMatchesFilter(game,c,expr.filter||'card')).length;
}
function greatestStat(game,controllerId,stat='power',filter='creature'){
  const p=game.players.find(x=>x.playerId===controllerId);if(!p)return 0;
  let best=0;
  for(const c of p.deck?.battlefield||[]){if(!cardMatchesFilter(game,c,filter))continue;const d=definitionFor(game,c);const n=stat==='toughness'?effectiveToughness(c,d,game):effectivePower(c,d,game);best=Math.max(best,Number(n||0))}
  return best;
}
export function resolveAmount(game,controllerId,amount,bindings={}){
  if(typeof amount==='number')return amount;
  if(amount==null)return 0;
  if(typeof amount==='string'){
    if(/^\d+$/.test(amount))return Number(amount);
    if(amount.toUpperCase()==='X')return Math.max(0,Number(bindings.X??bindings.x??0));
    const n=numberFromText(amount);return n==null?0:n;
  }
  if(amount.kind==='count')return countCards(game,amount.controllerId||controllerId,amount);
  if(amount.kind==='opponents')return Math.max(0,(game.players||[]).filter(p=>!p.eliminated&&p.playerId!==controllerId).length);
  if(amount.kind==='hand-size'){const p=game.players.find(x=>x.playerId===(amount.playerId||bindings[amount.playerBind]||controllerId));return p?.deck?.hand?.length||0}
  if(amount.kind==='life-total'){const p=game.players.find(x=>x.playerId===(amount.playerId||bindings[amount.playerBind]||controllerId));return Number(p?.life||0)}
  if(amount.kind==='greatest-power')return greatestStat(game,controllerId,'power',amount.filter||'creature');
  if(amount.kind==='greatest-toughness')return greatestStat(game,controllerId,'toughness',amount.filter||'creature');
  if(amount.kind==='source-power'){const hit=locateCardInGame(game,amount.sourceId||bindings.sourceId);return hit?effectivePower(hit.card,definitionFor(game,hit.card),game):0}
  if(amount.kind==='source-toughness'){const hit=locateCardInGame(game,amount.sourceId||bindings.sourceId);return hit?effectiveToughness(hit.card,definitionFor(game,hit.card),game):0}
  if(amount.kind==='binding')return Math.max(0,Number(bindings[amount.bind]||0));
  if(amount.kind==='sum')return (amount.parts||[]).reduce((n,x)=>n+resolveAmount(game,controllerId,x,bindings),0);
  if(amount.kind==='half'){const v=resolveAmount(game,controllerId,amount.of,bindings);return amount.round==='up'?Math.ceil(v/2):Math.floor(v/2)}
  return 0;
}
function targetPlayers(game,controllerId,scope,targetId){
  if(targetId){const p=game.players.find(x=>x.playerId===targetId);return p?[p]:[]}
  if(scope==='you')return game.players.filter(x=>x.playerId===controllerId);
  if(scope==='opponents'||scope==='each-opponent')return game.players.filter(x=>x.playerId!==controllerId&&!x.eliminated);
  if(scope==='all-players'||scope==='each-player')return game.players.filter(x=>!x.eliminated);
  return [];
}
function addCounter(card,name,amount){card.counters=card.counters||{};card.counters[name]=Math.max(0,Number(card.counters[name]||0)+Number(amount||0));if(card.counters[name]===0)delete card.counters[name]}
function makeToken(game,controller,effect,serial){
  const subtype=effect.subtype||effect.name||effect.tokenName||'Creature';
  const tokenDefId=`token:${effect.name||effect.tokenName||subtype}:${effect.power??''}/${effect.toughness??''}:${effect.typeLine||''}`;
  if(!game.cardDefinitions[tokenDefId])game.cardDefinitions[tokenDefId]={
    definitionId:tokenDefId,name:effect.name||effect.tokenName||subtype||'Token',manaCost:'',
    typeLine:effect.typeLine||`Token Creature — ${subtype}`,oracleText:effect.oracleText||'',power:effect.power??null,toughness:effect.toughness??null,
    keywords:effect.keywords||[],colorIdentity:[],colors:effect.colors||[],imageUris:null,set:'token',language:'en',collectorNumber:'',hydrationStatus:'complete'
  };
  return {instanceId:`${controller.playerId}:${tokenDefId}:${Date.now()}:${serial}:${Math.random().toString(36).slice(2,7)}`,definitionId:tokenDefId,ownerId:controller.playerId,controllerId:controller.playerId,zone:'battlefield',tapped:!!effect.tapped,counters:{},attachments:[],temporaryEffects:[],enteredTurn:game.turnNumber,controlSinceTurn:game.turnNumber,token:true};
}
function checkLethal(game,targetId,notes,bindings){
  const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')return;
  const d=definitionFor(game,hit.card);if(!isCreature(d))return;
  const toughness=effectiveToughness(hit.card,d,game);const lethal=toughness<=0||Number(hit.card.damageMarked||0)>=toughness||!!hit.card.deathtouchDamage;
  if(!lethal)return;if(toughness>0&&isIndestructible(hit.card,d))return;
  const name=d?.name||'Creature';moveCard(game,targetId,'graveyard',{onEvent:e=>emit(bindings,e)});notes.push(`${name} is put into its owner's graveyard for lethal damage.`);
}
function resolveBoundId(effect,bindings){return effect.targetId||effect.cardId||effect.playerId||bindings[effect.bind]||bindings[effect.targetBind]||null}
function resolveSelectionIds(effect,bindings){
  const raw=effect.ids||effect.cardIds||bindings[effect.bind]||bindings[effect.cardsBind]||[];
  if(Array.isArray(raw))return raw;
  if(raw&&typeof raw==='object')return raw;
  return raw?[raw]:[];
}
function changeControl(game,targetId,newControllerId,{untilEndOfTurn=false,bindings={}}={}){
  const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('Control-change target is no longer on the battlefield.');
  const oldControllerId=hit.card.controllerId||hit.player.playerId;
  const newController=game.players.find(p=>p.playerId===newControllerId);if(!newController)throw new Error('New controller is unavailable.');
  const [card]=hit.array.splice(hit.index,1);card.controllerId=newControllerId;newController.deck.battlefield.push(card);
  if(untilEndOfTurn){card.temporaryEffects=card.temporaryEffects||[];card.temporaryEffects.push({kind:'control',previousControllerId:oldControllerId,expires:'cleanup'})}
  emit(bindings,{type:'control-changed',sourceId:card.instanceId,definitionId:card.definitionId,fromControllerId:oldControllerId,controllerId:newControllerId});
  return card;
}
function applyScry(game,player,effect,bindings,notes){
  const amount=Math.max(0,resolveAmount(game,player.playerId,effect.amount,bindings));const top=player.deck.remainingLibrary.slice(0,amount);const decision=bindings[effect.bind]||effect.decision||{};
  const topIds=Array.isArray(decision.top)?decision.top:top.map(c=>c.instanceId);const bottomIds=Array.isArray(decision.bottom)?decision.bottom:[];
  const allowed=new Set(top.map(c=>c.instanceId));if([...topIds,...bottomIds].some(id=>!allowed.has(id)))throw new Error('Scry selection contains a card outside the viewed cards.');
  if(new Set([...topIds,...bottomIds]).size!==top.length)throw new Error('Every viewed card must be placed on top or bottom during scry.');
  player.deck.remainingLibrary.splice(0,top.length);
  const byId=new Map(top.map(c=>[c.instanceId,c]));for(const id of topIds)player.deck.remainingLibrary.push();
  // topIds is ordered top-first. Prepend in one operation to preserve that order.
  player.deck.remainingLibrary.unshift(...topIds.map(id=>byId.get(id)));
  player.deck.remainingLibrary.push(...bottomIds.map(id=>byId.get(id)));
  notes.push(`${player.displayName} scries ${amount}.`);
}
function applySurveil(game,player,effect,bindings,notes){
  const amount=Math.max(0,resolveAmount(game,player.playerId,effect.amount,bindings));const top=player.deck.remainingLibrary.slice(0,amount);const decision=bindings[effect.bind]||effect.decision||{};
  const keepIds=Array.isArray(decision.top)?decision.top:top.map(c=>c.instanceId);const graveIds=Array.isArray(decision.graveyard)?decision.graveyard:[];const allowed=new Set(top.map(c=>c.instanceId));
  if([...keepIds,...graveIds].some(id=>!allowed.has(id))||new Set([...keepIds,...graveIds]).size!==top.length)throw new Error('Every surveilled card must be placed on top or into the graveyard.');
  player.deck.remainingLibrary.splice(0,top.length);const byId=new Map(top.map(c=>[c.instanceId,c]));player.deck.remainingLibrary.unshift(...keepIds.map(id=>byId.get(id)));
  for(const id of graveIds){const c=byId.get(id);c.zone='graveyard';player.deck.graveyard.push(c);emit(bindings,{type:'mill',playerId:player.playerId,sourceId:c.instanceId,definitionId:c.definitionId,amount:1})}
  notes.push(`${player.displayName} surveils ${amount}.`);
}
function applyProliferate(game,controller,effect,bindings,notes){
  const selections=bindings[effect.bind]||effect.selections||[];if(!Array.isArray(selections)||!selections.length)throw new Error('Choose at least one permanent and/or player with counters to proliferate.');
  for(const s of selections){
    if(s.kind==='player'){const p=game.players.find(x=>x.playerId===s.id);if(!p)continue;if(s.counter==='poison')p.poison=Number(p.poison||0)+1;else{p.counters=p.counters||{};p.counters[s.counter]=Number(p.counters[s.counter]||0)+1}}
    else{const hit=locateCardInGame(game,s.id);if(hit?.zone==='battlefield')addCounter(hit.card,s.counter,1)}
  }
  notes.push(`${controller.displayName} proliferates.`);
}

function preventDamage(game,targetId,amount){let left=Math.max(0,Number(amount||0));for(const shield of game.damagePrevention||[]){if(left<=0)break;if(shield.targetId!==targetId||Number(shield.amount||0)<=0)continue;const used=Math.min(left,Number(shield.amount||0));shield.amount-=used;left-=used}game.damagePrevention=(game.damagePrevention||[]).filter(s=>Number(s.amount||0)>0);return left}
export function applyEffects(game,controllerId,effects=[],bindings={}){
  const controller=game.players.find(p=>p.playerId===controllerId);if(!controller)throw new Error('Effect controller is unavailable.');
  const notes=[];
  for(const effect of effects||[]){
    const amount=Math.max(0,resolveAmount(game,controllerId,effect.amount,bindings));
    if(effect.optional&&bindings[effect.optionalBind]===false){notes.push(`${effect.label||'Optional effect'} was declined.`);continue}

    if(effect.kind==='draw'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.bind]);
      for(const p of players){let moved=0;for(let i=0;i<amount;i++){const card=p.deck.remainingLibrary.shift();if(!card){p.counters=p.counters||{};p.counters.failedDraws=Number(p.counters.failedDraws||0)+1;emit(bindings,{type:'failed-draw',playerId:p.playerId});break}card.zone='hand';p.deck.hand.push(card);moved++;emit(bindings,{type:'draw',playerId:p.playerId,sourceId:card.instanceId,definitionId:card.definitionId,drawNumberThisTurn:Number(p.counters?.cardsDrawnThisTurn||0)+1});p.counters=p.counters||{};p.counters.cardsDrawnThisTurn=Number(p.counters.cardsDrawnThisTurn||0)+1}notes.push(`${p.displayName} draws ${moved} card${moved===1?'':'s'}.`)}continue;
    }
    if(effect.kind==='discard-hand'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.bind]);for(const p of players){const count=p.deck.hand.length;bindings[effect.countBind||'thatMany']=count;while(p.deck.hand.length){const c=p.deck.hand.shift();c.zone='graveyard';p.deck.graveyard.push(c);emit(bindings,{type:'discard',playerId:p.playerId,sourceId:c.instanceId,definitionId:c.definitionId})}notes.push(`${p.displayName} discards ${count} card${count===1?'':'s'}.`)}continue;
    }
    if(effect.kind==='discard'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.bind]);
      for(const p of players){let raw=effect.cardIds||bindings[effect.cardsBind]||[];let ids=(raw&&typeof raw==='object'&&!Array.isArray(raw))?(raw[p.playerId]||[]):raw;if(!Array.isArray(ids))ids=[ids];const need=Math.min(amount,p.deck.hand.length);if(ids.length<need)throw new Error(`${p.displayName} must choose ${need} card${need===1?'':'s'} to discard.`);for(const id of ids.slice(0,need)){const i=p.deck.hand.findIndex(c=>c.instanceId===id);if(i<0)throw new Error('A selected discard card is no longer in that player’s hand.');const [c]=p.deck.hand.splice(i,1);c.zone='graveyard';p.deck.graveyard.push(c);emit(bindings,{type:'discard',playerId:p.playerId,sourceId:c.instanceId,definitionId:c.definitionId})}notes.push(`${p.displayName} discards ${need} card${need===1?'':'s'}.`)}continue;
    }
    if(effect.kind==='mill'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.bind]);
      for(const p of players){let moved=0;for(let i=0;i<amount;i++){const c=p.deck.remainingLibrary.shift();if(!c)break;c.zone='graveyard';p.deck.graveyard.push(c);moved++;emit(bindings,{type:'mill',playerId:p.playerId,sourceId:c.instanceId,definitionId:c.definitionId,amount:1})}notes.push(`${p.displayName} mills ${moved} card${moved===1?'':'s'}.`)}continue;
    }
    if(effect.kind==='life'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.bind]);
      for(const p of players){const delta=Number(effect.deltaSign||1)*amount;const before=Number(p.life||0);p.life=Math.max(0,before+delta);const actual=p.life-before;notes.push(`${p.displayName} ${actual>=0?'gains':'loses'} ${Math.abs(actual)} life.`);emit(bindings,{type:actual>=0?'life-gained':'life-lost',playerId:p.playerId,amount:Math.abs(actual),sourceId:bindings.sourceId||null,controllerId})}continue;
    }
    if(effect.kind==='set-life'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.bind]);for(const p of players){const before=Number(p.life||0);p.life=amount;const delta=p.life-before;emit(bindings,{type:delta>=0?'life-gained':'life-lost',playerId:p.playerId,amount:Math.abs(delta),sourceId:bindings.sourceId||null,controllerId});notes.push(`${p.displayName}'s life total becomes ${amount}.`)}continue;
    }
    if(effect.kind==='damage'){
      const targetId=resolveBoundId(effect,bindings);if(!targetId)throw new Error('A damage target was not chosen.');const dealt=preventDamage(game,targetId,amount);const prevented=amount-dealt;const p=game.players.find(x=>x.playerId===targetId);
      if(p){p.life=Math.max(0,Number(p.life||0)-dealt);notes.push(`${effect.sourceName||'Effect'} deals ${dealt} damage to ${p.displayName}${prevented?` (${prevented} prevented)`:''}.`);if(dealt)emit(bindings,{type:'damage-player',playerId:p.playerId,amount:dealt,sourceId:bindings.sourceId||effect.sourceId||null,controllerId,combat:false});continue}
      const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The damage target is no longer legal.');hit.card.damageMarked=Number(hit.card.damageMarked||0)+dealt;notes.push(`${effect.sourceName||'Effect'} deals ${dealt} damage to ${cardName(game,hit.card)}${prevented?` (${prevented} prevented)`:''}.`);if(dealt)emit(bindings,{type:'damage-permanent',targetId,amount:dealt,sourceId:bindings.sourceId||effect.sourceId||null,controllerId});checkLethal(game,targetId,notes,bindings);continue;
    }
    if(effect.kind==='damage-from-creature'||effect.kind==='damage-from-selected-creature'){
      const sourceId=effect.sourceId||bindings[effect.sourceBind]||bindings.sourceId;const targetId=effect.targetId||bindings[effect.targetBind]||bindings[effect.bind];const src=locateCardInGame(game,sourceId);if(!src||src.zone!=='battlefield')throw new Error('The chosen source creature is no longer on the battlefield.');const sd=definitionFor(game,src.card);const dmg=effect.amount?Math.max(0,resolveAmount(game,controllerId,effect.amount,{...bindings,sourceId})):effectivePower(src.card,sd,game);const p=game.players.find(x=>x.playerId===targetId);
      const dealt=preventDamage(game,targetId,dmg),prevented=dmg-dealt;
      if(p){p.life=Math.max(0,Number(p.life||0)-dealt);notes.push(`${sd?.name||'Creature'} deals ${dealt} damage to ${p.displayName}${prevented?` (${prevented} prevented)`:''}.`);if(dealt)emit(bindings,{type:'damage-player',playerId:p.playerId,amount:dealt,sourceId,controllerId:src.card.controllerId||controllerId,combat:false})}
      else{const th=locateCardInGame(game,targetId);if(!th||th.zone!=='battlefield')throw new Error('The chosen damage target is no longer legal.');th.card.damageMarked=Number(th.card.damageMarked||0)+dealt;notes.push(`${sd?.name||'Creature'} deals ${dealt} damage to ${cardName(game,th.card)}${prevented?` (${prevented} prevented)`:''}.`);checkLethal(game,targetId,notes,bindings)}
      if(effect.sacrificeSource){const live=locateCardInGame(game,sourceId);if(live?.zone==='battlefield'){moveCard(game,sourceId,'graveyard',{onEvent:e=>emit(bindings,e)});notes.push(`${sd?.name||'Creature'} is sacrificed.`)}}continue;
    }
    if(effect.kind==='fight'){
      const aId=effect.sourceId||bindings[effect.sourceBind]||bindings.sourceId,bId=effect.targetId||bindings[effect.targetBind]||bindings[effect.bind];const a=locateCardInGame(game,aId),b=locateCardInGame(game,bId);if(!a||!b||a.zone!=='battlefield'||b.zone!=='battlefield')throw new Error('Both creatures must still be on the battlefield to fight.');const ad=definitionFor(game,a.card),bd=definitionFor(game,b.card),ap=effectivePower(a.card,ad,game),bp=effectivePower(b.card,bd,game),toA=preventDamage(game,aId,bp),toB=preventDamage(game,bId,ap);a.card.damageMarked=Number(a.card.damageMarked||0)+toA;b.card.damageMarked=Number(b.card.damageMarked||0)+toB;notes.push(`${ad?.name||'Creature'} and ${bd?.name||'creature'} fight (${toB} and ${toA} damage dealt after prevention).`);checkLethal(game,aId,notes,bindings);checkLethal(game,bId,notes,bindings);continue;
    }
    if(effect.kind==='zone-each'){
      const scope=effect.scope||'all';const players=scope==='you'?[controller]:scope==='opponents'?game.players.filter(p=>p.playerId!==controllerId&&!p.eliminated):scope==='target-player'?[game.players.find(p=>p.playerId===(effect.playerId||bindings[effect.playerBind]))].filter(Boolean):game.players.filter(p=>!p.eliminated);let moved=0;
      const ids=[];for(const p of players)for(const c of [...(p.deck?.battlefield||[])])if(cardMatchesFilter(game,c,effect.filter||'permanent'))ids.push(c.instanceId);
      for(const id of ids){const hit=locateCardInGame(game,id);if(!hit||hit.zone!=='battlefield')continue;const d=definitionFor(game,hit.card);if(effect.to==='graveyard'&&effect.destroy&&isIndestructible(hit.card,d))continue;moveCard(game,id,effect.to,{onEvent:e=>emit(bindings,e)});moved++}
      notes.push(`${moved} ${effect.filter||'permanent'}${moved===1?'':'s'} ${effect.to==='graveyard'?'move to graveyards':effect.to==='exile'?'are exiled':'move zones'}.`);continue;
    }
    if(effect.kind==='grant-keyword-each'){
      const players=effect.scope==='opponents'?game.players.filter(p=>p.playerId!==controllerId&&!p.eliminated):[controller];let changed=0;for(const p of players)for(const c of p.deck?.battlefield||[])if(cardMatchesFilter(game,c,effect.filter||'creature')){c.temporaryEffects=c.temporaryEffects||[];c.temporaryEffects.push({kind:'keyword',keyword:effect.keyword,enabled:true,expires:effect.expires||'cleanup'});changed++}notes.push(`${changed} permanent${changed===1?'':'s'} gain ${effect.keyword}.`);continue;
    }
    if(effect.kind==='grant-cast-zone'){
      controller.temporaryPermissions=controller.temporaryPermissions||[];controller.temporaryPermissions.push({kind:'cast-from-zone',zone:effect.zone||'graveyard',expires:effect.expires||'cleanup'});notes.push(`${controller.displayName} may cast cards from their ${effect.zone||'graveyard'} this turn.`);continue;
    }
    if(effect.kind==='prevent-damage'){
      const targetId=resolveBoundId(effect,bindings);if(!targetId)throw new Error('Damage-prevention target is unavailable.');game.damagePrevention=game.damagePrevention||[];game.damagePrevention.push({targetId,amount,expires:effect.expires||'cleanup'});notes.push(`The next ${amount} damage to the chosen target is prevented.`);continue;
    }
    if(effect.kind==='force-block'){
      const blockerId=effect.blockerId||bindings[effect.blockerBind],attackerId=effect.attackerId||bindings[effect.attackerBind],hit=locateCardInGame(game,blockerId);if(!hit||hit.zone!=='battlefield')throw new Error('Forced blocker is unavailable.');hit.card.temporaryEffects=hit.card.temporaryEffects||[];hit.card.temporaryEffects.push({kind:'forced-block',attackerId,expires:effect.expires||'end-combat'});notes.push(`${cardName(game,hit.card)} must block the chosen creature this combat if able.`);continue;
    }
    if(effect.kind==='combat-restriction'){
      const targetId=resolveBoundId(effect,bindings),hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('Combat-restriction target is no longer on the battlefield.');hit.card.temporaryEffects=hit.card.temporaryEffects||[];hit.card.temporaryEffects.push({kind:'combat-restriction',restriction:effect.restriction,expires:effect.expires||'cleanup'});notes.push(`${cardName(game,hit.card)} gains a temporary combat restriction.`);continue;
    }
    if(effect.kind==='destroy-selected-many'){
      const raw=bindings[effect.bind]||{};const ids=Array.isArray(raw)?raw:Object.values(raw).filter(Boolean);let moved=0;
      for(const id of ids){const hit=locateCardInGame(game,id);if(!hit||hit.zone!=='battlefield')continue;const d=definitionFor(game,hit.card);if(isIndestructible(hit.card,d)){notes.push(`${d?.name||'Permanent'} is indestructible and is not destroyed.`);continue}moveCard(game,id,'graveyard',{onEvent:e=>emit(bindings,e)});moved++}
      notes.push(`${moved} selected permanent${moved===1?'':'s'} ${moved===1?'is':'are'} destroyed.`);continue;
    }
    if(['destroy','exile','bounce','sacrifice'].includes(effect.kind)){
      const targetId=resolveBoundId(effect,bindings);if(!targetId)throw new Error(`${effect.kind} requires a target or selection.`);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The selected permanent is no longer on the battlefield.');const d=definitionFor(game,hit.card),name=d?.name||'Permanent';if(effect.kind==='destroy'&&isIndestructible(hit.card,d)){notes.push(`${name} is indestructible and is not destroyed.`);continue}const to=effect.kind==='exile'?'exile':effect.kind==='bounce'?'hand':'graveyard';moveCard(game,targetId,to,{onEvent:e=>emit(bindings,e)});notes.push(`${name} ${effect.kind==='bounce'?'returns to its owner’s hand':effect.kind==='exile'?'is exiled':effect.kind==='sacrifice'?'is sacrificed':'is destroyed'}.`);continue;
    }
    if(effect.kind==='sacrifice-many'){
      const players=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.playerBind]);const raw=bindings[effect.bind]||{};
      for(const p of players){const ids=Array.isArray(raw)?raw:(raw[p.playerId]||[]);if(ids.length<amount)throw new Error(`${p.displayName} must choose ${amount} permanent${amount===1?'':'s'} to sacrifice.`);for(const id of ids.slice(0,amount)){const hit=locateCardInGame(game,id);if(!hit||hit.zone!=='battlefield'||(hit.card.controllerId||hit.player.playerId)!==p.playerId)throw new Error('A sacrifice choice is no longer legal.');const n=cardName(game,hit.card);moveCard(game,id,'graveyard',{onEvent:e=>emit(bindings,e)});notes.push(`${p.displayName} sacrifices ${n}.`)}}continue;
    }
    if(effect.kind==='counter'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The counter target is no longer legal.');addCounter(hit.card,effect.counter||'+1/+1',amount);notes.push(`${cardName(game,hit.card)} gets ${amount} ${effect.counter||'+1/+1'} counter${amount===1?'':'s'}.`);emit(bindings,{type:'counter-added',targetId,controllerId:hit.card.controllerId,sourceId:bindings.sourceId||null,counter:effect.counter||'+1/+1',amount});checkLethal(game,targetId,notes,bindings);continue;
    }
    if(effect.kind==='counter-each'){
      const player=effect.scope==='opponents'?null:controller;const rows=[];for(const p of (player?[player]:game.players.filter(x=>x.playerId!==controllerId)))for(const c of p.deck?.battlefield||[])if(cardMatchesFilter(game,c,effect.filter||'creature'))rows.push(c);for(const c of rows){addCounter(c,effect.counter||'+1/+1',amount);emit(bindings,{type:'counter-added',targetId:c.instanceId,controllerId:c.controllerId,sourceId:bindings.sourceId||null,counter:effect.counter||'+1/+1',amount})}notes.push(`${rows.length} permanent${rows.length===1?'':'s'} get ${amount} ${effect.counter||'+1/+1'} counter${amount===1?'':'s'}.`);continue;
    }
    if(effect.kind==='remove-counter'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The counter-removal target is no longer legal.');addCounter(hit.card,effect.counter||'+1/+1',-amount);notes.push(`${amount} ${effect.counter||'+1/+1'} counter${amount===1?'':'s'} removed from ${cardName(game,hit.card)}.`);checkLethal(game,targetId,notes,bindings);continue;
    }
    if(effect.kind==='tap-many'||effect.kind==='untap-many'){
      const ids=resolveSelectionIds(effect,bindings),tap=effect.kind==='tap-many';for(const id of ids){const hit=locateCardInGame(game,id);if(hit?.zone==='battlefield')hit.card.tapped=tap}notes.push(`${ids.length} permanent${ids.length===1?'':'s'} ${tap?'tap':'untap'}.`);continue;
    }
    if(effect.kind==='tap'||effect.kind==='untap'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('Tap/untap target is no longer legal.');hit.card.tapped=effect.kind==='tap';notes.push(`${cardName(game,hit.card)} ${effect.kind==='tap'?'taps':'untaps'}.`);emit(bindings,{type:effect.kind==='tap'?'tapped':'untapped',sourceId:targetId,controllerId:hit.card.controllerId});continue;
    }
    if(effect.kind==='graveyard-zone-each'){
      const players=effect.scope==='target-player'?[game.players.find(p=>p.playerId===(effect.playerId||bindings[effect.playerBind]))].filter(Boolean):effect.scope==='opponents'?game.players.filter(p=>p.playerId!==controllerId&&!p.eliminated):[controller];let moved=0;for(const p of players){const ids=(p.deck.graveyard||[]).filter(c=>cardMatchesFilter(game,c,effect.filter||'card')).map(c=>c.instanceId);for(const id of ids){moveCard(game,id,effect.to,{onEvent:e=>emit(bindings,e)});moved++}}notes.push(`${moved} card${moved===1?'':'s'} move from graveyards.`);continue;
    }
    if(effect.kind==='extra-turn'){
      const targetId=effect.playerId||bindings[effect.playerBind]||controllerId;if(!game.players.some(p=>p.playerId===targetId))throw new Error('Extra-turn player is unavailable.');game.extraTurnQueue=game.extraTurnQueue||[];game.extraTurnQueue.push(targetId);notes.push(`${game.players.find(p=>p.playerId===targetId)?.displayName||'Player'} gets an extra turn.`);continue;
    }
    if(effect.kind==='extra-land-play'){controller.counters=controller.counters||{};controller.counters.extraLandPlaysThisTurn=Number(controller.counters.extraLandPlaysThisTurn||0)+Number(effect.amount||1);notes.push(`${controller.displayName} may play ${effect.amount||1} additional land this turn.`);continue;
    }
    if(effect.kind==='tap-each'||effect.kind==='untap-each'){
      const tap=effect.kind==='tap-each';const players=effect.scope==='target-player'?[game.players.find(p=>p.playerId===(effect.playerId||bindings[effect.playerBind]))].filter(Boolean):effect.scope==='opponents'?game.players.filter(p=>p.playerId!==controllerId):[controller];let n=0;for(const p of players)for(const c of p.deck?.battlefield||[])if(cardMatchesFilter(game,c,effect.filter||'creature')){c.tapped=tap;n++}notes.push(`${n} permanent${n===1?'':'s'} ${tap?'tap':'untap'}.`);continue;
    }
    if(effect.kind==='pump'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The pump target is no longer legal.');hit.card.temporaryEffects=hit.card.temporaryEffects||[];hit.card.temporaryEffects.push({kind:'pt',power:Number(effect.power||0),toughness:Number(effect.toughness||0),expires:effect.expires||'cleanup'});notes.push(`${cardName(game,hit.card)} gets ${Number(effect.power||0)>=0?'+':''}${Number(effect.power||0)}/${Number(effect.toughness||0)>=0?'+':''}${Number(effect.toughness||0)} until end of turn.`);checkLethal(game,targetId,notes,bindings);continue;
    }
    if(effect.kind==='pump-each'){
      const players=effect.scope==='opponents'?game.players.filter(p=>p.playerId!==controllerId):[controller];let n=0;for(const p of players)for(const c of p.deck?.battlefield||[])if(cardMatchesFilter(game,c,effect.filter||'creature')){c.temporaryEffects=c.temporaryEffects||[];c.temporaryEffects.push({kind:'pt',power:Number(effect.power||0),toughness:Number(effect.toughness||0),expires:effect.expires||'cleanup'});n++}notes.push(`${n} permanent${n===1?'':'s'} get the temporary power/toughness change.`);continue;
    }
    if(effect.kind==='grant-keyword'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The keyword target is no longer legal.');hit.card.temporaryEffects=hit.card.temporaryEffects||[];hit.card.temporaryEffects.push({kind:'keyword',keyword:effect.keyword,enabled:effect.enabled!==false,expires:effect.expires||'cleanup'});notes.push(`${cardName(game,hit.card)} ${effect.enabled===false?'loses':'gains'} ${effect.keyword} until end of turn.`);continue;
    }
    if(effect.kind==='create-token'){
      for(let i=0;i<amount;i++){const token=makeToken(game,controller,effect,i);controller.deck.battlefield.push(token);emit(bindings,{type:'token-created',sourceId:token.instanceId,definitionId:token.definitionId,controllerId,ownerId:controllerId,typeLine:definitionFor(game,token)?.typeLine||''});emit(bindings,{type:'enters-battlefield',sourceId:token.instanceId,definitionId:token.definitionId,controllerId,ownerId:controllerId,typeLine:definitionFor(game,token)?.typeLine||'',token:true})}notes.push(`${controller.displayName} creates ${amount} ${effect.name||effect.tokenName||'token'} token${amount===1?'':'s'}.`);continue;
    }
    if(effect.kind==='return-from-graveyard'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='graveyard')throw new Error('The selected graveyard card is no longer legal.');const d=definitionFor(game,hit.card),to=effect.to||'hand';moveCard(game,targetId,to,{controllerId,to,tapped:!!effect.tapped,onEvent:e=>emit(bindings,e)});notes.push(`${d?.name||'Card'} returns from the graveyard to ${to==='battlefield'?'the battlefield':'its owner’s hand'}.`);continue;
    }
    if(effect.kind==='move-zone'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit)throw new Error('The selected card is no longer in a tracked zone.');const n=cardName(game,hit.card);moveCard(game,targetId,effect.to,{controllerId:effect.controllerId||controllerId,position:effect.position||'bottom',tapped:!!effect.tapped,onEvent:e=>emit(bindings,e)});notes.push(`${n} moves to ${effect.to}.`);continue;
    }
    if(effect.kind==='choose-color'){
      const targetId=effect.targetId||bindings[effect.bind]||bindings.sourceId;const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The permanent that needs a color choice is unavailable.');const color=effect.color||bindings[effect.colorBind||'color'];if(!['W','U','B','R','G'].includes(color))throw new Error('A legal color must be chosen.');hit.card.chosenColor=color;notes.push(`${cardName(game,hit.card)} has ${color} chosen.`);continue;
    }
    if(effect.kind==='choose-creature-type'){
      const targetId=effect.targetId||bindings.sourceId;const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('The permanent that needs a creature type choice is unavailable.');const value=String(effect.value||bindings[effect.bind||'creatureType']||'').trim();if(!value)throw new Error('Choose a creature type.');hit.card.chosenCreatureType=value;notes.push(`${cardName(game,hit.card)} has ${value} chosen.`);continue;
    }
    if(effect.kind==='add-mana'){
      const color=effect.color||bindings[effect.colorBind||'manaColor'];if(!['W','U','B','R','G','C'].includes(color))throw new Error('A legal mana color/type must be chosen.');controller.mana.available[color]=Number(controller.mana.available[color]||0)+amount;notes.push(`${controller.displayName} adds ${amount} ${color} mana.`);continue;
    }
    if(effect.kind==='double-power'){
      const id=resolveBoundId(effect,bindings),hit=locateCardInGame(game,id);if(!hit||hit.zone!=='battlefield')throw new Error('Power-doubling target is unavailable.');const current=effectivePower(hit.card,definitionFor(game,hit.card),game);hit.card.temporaryEffects=hit.card.temporaryEffects||[];hit.card.temporaryEffects.push({kind:'pump',power:current,toughness:0,expires:effect.expires||'cleanup'});notes.push(`${cardName(game,hit.card)}'s power is doubled.`);continue;
    }
    if(effect.kind==='double-counter'){
      const id=resolveBoundId(effect,bindings),hit=locateCardInGame(game,id);if(!hit||hit.zone!=='battlefield')throw new Error('Counter-doubling target is unavailable.');const cur=Number(hit.card.counters?.[effect.counter]||0);addCounter(hit.card,effect.counter,cur);notes.push(`${cardName(game,hit.card)} now has ${cur*2} ${effect.counter} counters.`);continue;
    }
    if(effect.kind==='exchange-life'){
      const q=game.players.find(p=>p.playerId===(effect.playerId||bindings[effect.playerBind]));if(!q)throw new Error('Life-exchange opponent is unavailable.');const a=controller.life;controller.life=q.life;q.life=a;notes.push(`${controller.displayName} and ${q.displayName} exchange life totals.`);continue;
    }
    if(effect.kind==='attach'){
      const eid=effect.equipmentId||bindings[effect.equipmentBind],cid=effect.creatureId||bindings[effect.creatureBind],eq=locateCardInGame(game,eid),cr=locateCardInGame(game,cid);if(!eq||eq.zone!=='battlefield'||!cr||cr.zone!=='battlefield')throw new Error('Attachment target is unavailable.');eq.card.attachedTo=cid;cr.card.attachments=cr.card.attachments||[];if(!cr.card.attachments.includes(eid))cr.card.attachments.push(eid);notes.push(`${cardName(game,eq.card)} attaches to ${cardName(game,cr.card)}.`);continue;
    }
    if(effect.kind==='copy-stack'){
      const id=effect.stackId||bindings[effect.bind],obj=(game.stack||[]).find(x=>x.id===id);if(!obj||obj.kind!=='spell')throw new Error('The targeted spell is no longer on the stack.');const copy=structuredClone(obj);copy.id=`stack-copy:${Date.now()}:${Math.random()}`;copy.kind='spell-copy';copy.isCopy=true;copy.card={...copy.card,instanceId:`copy:${copy.card.instanceId}:${Date.now()}`,token:true,zone:'stack'};game.stack.push(copy);notes.push(`${obj.label||'Spell'} is copied.`);continue;
    }
    if(effect.kind==='gain-control'){
      const targetId=resolveBoundId(effect,bindings);changeControl(game,targetId,effect.controllerId||controllerId,{untilEndOfTurn:!!effect.untilEndOfTurn,bindings});if(effect.untap){const hit=locateCardInGame(game,targetId);if(hit)hit.card.tapped=false}if(effect.haste){const hit=locateCardInGame(game,targetId);if(hit){hit.card.temporaryEffects=hit.card.temporaryEffects||[];hit.card.temporaryEffects.push({kind:'keyword',keyword:'Haste',enabled:true,expires:'cleanup'})}}notes.push(`${cardName(game,locateCardInGame(game,targetId)?.card)} changes control${effect.untilEndOfTurn?' until end of turn':''}.`);continue;
    }
    if(effect.kind==='scry'){const p=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.playerBind])[0]||controller;applyScry(game,p,effect,bindings,notes);continue}
    if(effect.kind==='surveil'){const p=targetPlayers(game,controllerId,effect.scope||'you',effect.playerId||bindings[effect.playerBind])[0]||controller;applySurveil(game,p,effect,bindings,notes);continue}
    if(effect.kind==='shuffle'){shuffled(controller.deck.remainingLibrary);notes.push(`${controller.displayName} shuffles their library.`);continue}
    if(effect.kind==='proliferate'){applyProliferate(game,controller,effect,bindings,notes);continue}
    if(effect.kind==='counter-spell'){
      const stackId=effect.stackId||bindings[effect.bind];const i=(game.stack||[]).findIndex(x=>x.id===stackId);if(i<0)throw new Error('The targeted spell is no longer on the stack.');const [obj]=game.stack.splice(i,1);if(obj.kind!=='spell')throw new Error('The chosen stack object is not a spell.');const owner=ownerFor(game,obj.card,game.players.find(p=>p.playerId===obj.controllerId));obj.card.zone='graveyard';obj.card.controllerId=owner.playerId;owner.deck.graveyard.push(obj.card);notes.push(`${obj.label||cardName(game,obj.card)} is countered.`);emit(bindings,{type:'spell-countered',sourceId:obj.card.instanceId,definitionId:obj.card.definitionId,controllerId:obj.controllerId});continue;
    }
    if(effect.kind==='copy-token'){
      const targetId=resolveBoundId(effect,bindings);const hit=locateCardInGame(game,targetId);if(!hit||hit.zone!=='battlefield')throw new Error('Copy target is no longer on the battlefield.');const d=definitionFor(game,hit.card);const token=makeToken(game,controller,{name:d?.name||'Copy',typeLine:d?.typeLine||'Token',oracleText:d?.oracleText||'',power:d?.power,toughness:d?.toughness,keywords:d?.keywords||[],colors:d?.colors||[],tapped:!!effect.tapped},0);controller.deck.battlefield.push(token);emit(bindings,{type:'token-created',sourceId:token.instanceId,definitionId:token.definitionId,controllerId});emit(bindings,{type:'enters-battlefield',sourceId:token.instanceId,definitionId:token.definitionId,controllerId,typeLine:definitionFor(game,token)?.typeLine||'',token:true});notes.push(`${controller.displayName} creates a token copy of ${d?.name||'the permanent'}.`);continue;
    }
    if(effect.kind==='manual')throw new Error(`Guided resolution required: ${effect.text||'Unsupported Oracle effect.'}`);
    throw new Error(`Unsupported tracked effect kind: ${effect.kind}`);
  }
  return notes;
}

function countExprFromPhrase(phrase){
  const s=String(phrase||'').toLowerCase();let zone='battlefield',filter='card';
  if(/in your graveyard/.test(s))zone='graveyard';else if(/in your hand/.test(s))zone='hand';else if(/in your library/.test(s))zone='library';
  if(/basic land/.test(s))filter='basic land';else if(/creature/.test(s))filter='creature';else if(/artifact/.test(s))filter='artifact';else if(/enchantment/.test(s))filter='enchantment';else if(/planeswalker/.test(s))filter='planeswalker';else if(/land/.test(s))filter='land';else if(/permanent/.test(s))filter='permanent';
  return {kind:'count',zone,filter};
}
function amountExpr(text){
  const s=String(text||'').trim();const literal=numberFromText(s);if(literal!=null)return literal;if(/^X$/i.test(s))return'X';
  let m=s.match(/^the number of (.+)$/i);if(m)return countExprFromPhrase(m[1]);
  m=s.match(/^the greatest power among (.+)$/i);if(m)return {kind:'greatest-power',filter:/creature/i.test(m[1])?'creature':'permanent'};
  m=s.match(/^the greatest toughness among (.+)$/i);if(m)return {kind:'greatest-toughness',filter:/creature/i.test(m[1])?'creature':'permanent'};
  m=s.match(/^your life total$/i);if(m)return {kind:'life-total'};
  m=s.match(/^the number of opponents you have$/i);if(m)return {kind:'opponents'};
  return null;
}
function parseAmountPhrase(phrase){
  const s=String(phrase||'').trim();
  const m=s.match(/^(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|X|the number of .+|the greatest power among .+|the greatest toughness among .+)/i);
  if(!m)return null;return amountExpr(m[1]);
}
function scopeFromSubject(subject='you'){
  const s=String(subject).toLowerCase();if(s.includes('each opponent'))return'each-opponent';if(s.includes('each player'))return'each-player';if(s.includes('all players'))return'all-players';if(s.includes('target opponent'))return'target-opponent';if(s.includes('target player'))return'target-player';return'you';
}
function targetRequirement(requirements,scope,label,extra={}){const bind=`target${requirements.length}`;requirements.push({kind:'target',bind,scope,label:label||scope,...extra});return bind}
function playerRequirement(requirements,scope,label){const bind=`player${requirements.length}`;requirements.push({kind:'player',bind,scope,label:label||scope});return bind}
function cardSelectionRequirement(requirements,{scope='you',filter='permanent',amount=1,label='Choose permanent',playerBind=null}={}){const bind=`cards${requirements.length}`;requirements.push({kind:'card-selection',bind,scope,filter,amount,playerBind,label});return bind}
function normalizeClause(clause){return String(clause||'').replace(/^•\s*/,'').replace(/\s+/g,' ').trim()}
function splitSentences(raw){
  // Keep modal bullets as independent clauses; avoid splitting decimal-like content.
  return cleanOracle(raw).split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(normalizeClause).filter(Boolean);
}
function stripReminderText(text){return String(text||'').replace(/\([^()]*\)/g,'').replace(/\s+/g,' ').trim()}
function compileSingleClause(clause,{sourceName='Effect'}={}){
  const effects=[],requirements=[],unsupported=[];let c=stripReminderText(normalizeClause(clause));if(!c)return{effects,requirements,unsupported};
  if(/^(?:Activate only|This ability|Cast this spell|Play this ability|Do this only)\b/i.test(c))return{effects,requirements,unsupported};
  if(/^Choose (?:one|two|three|four|five|any number|one or more)\s*[—-]/i.test(c))return{effects,requirements,unsupported:[c]};
  let m;

  // Draw.
  if((m=c.match(/^(You|Target player|Target opponent|Each player|Each opponent) draws? (a|an|one|two|three|four|five|six|seven|eight|nine|ten|X|cards? equal to the number of .+|cards? equal to the greatest power among .+|cards? equal to the greatest toughness among .+|that many cards?)(?: cards?)?\.?$/i))){
    const scope=scopeFromSubject(m[1]);let phrase=m[2].replace(/^cards? equal to /i,'');let amount=phrase==='that many cards'?{kind:'binding',bind:'thatMany'}:amountExpr(phrase);if(amount==null)amount=numberFromText(phrase);const e={kind:'draw',scope:scope.startsWith('target-')?'you':scope,amount};if(scope.startsWith('target-'))e.bind=playerRequirement(requirements,scope==='target-opponent'?'opponent':'player',m[1]);effects.push(e);return{effects,requirements,unsupported};
  }
  if((m=c.match(/^Draw (a|an|one|two|three|four|five|six|seven|eight|nine|ten|X) cards?\.?$/i))){effects.push({kind:'draw',scope:'you',amount:numberFromText(m[1])??m[1].toUpperCase()});return{effects,requirements,unsupported}}
  if(/^Draw that many cards?\.?$/i.test(c)){effects.push({kind:'draw',scope:'you',amount:{kind:'binding',bind:'thatMany'}});return{effects,requirements,unsupported}}
  if((m=c.match(/^Draw cards? equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))){effects.push({kind:'draw',scope:'you',amount:amountExpr(m[1])});return{effects,requirements,unsupported}}
  if((m=c.match(/^Draw a card for each (.+)\.?$/i))){effects.push({kind:'draw',scope:'you',amount:countExprFromPhrase(m[1])});return{effects,requirements,unsupported}}

  // Discard.
  if(/^Discard your hand\.?$/i.test(c)){effects.push({kind:'discard-hand',scope:'you',countBind:'thatMany'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(You|Target player|Target opponent|Each player|Each opponent) discards? (a|an|one|two|three|four|five|six|seven|X) cards?\.?$/i))){
    const scope=scopeFromSubject(m[1]),amount=numberFromText(m[2])??m[2].toUpperCase();const e={kind:'discard',scope:scope.startsWith('target-')?'you':scope,amount};if(scope.startsWith('target-'))e.bind=playerRequirement(requirements,scope==='target-opponent'?'opponent':'player',m[1]);e.cardsBind=`discardCards${requirements.length}`;requirements.push({kind:'discard-cards',bind:e.cardsBind,playerBind:e.bind||null,scope:scope==='each-opponent'?'each-opponent':scope==='each-player'?'each-player':scope==='you'?'you':'target',amount});effects.push(e);return{effects,requirements,unsupported};
  }
  if((m=c.match(/^Discard (a|an|one|two|three|four|five) cards?\.?$/i))){const amount=numberFromText(m[1]);const bind=`discardCards${requirements.length}`;requirements.push({kind:'discard-cards',bind,scope:'you',amount});effects.push({kind:'discard',scope:'you',amount,cardsBind:bind});return{effects,requirements,unsupported}}

  // Mill.
  if((m=c.match(/^(You|Target player|Target opponent|Each player|Each opponent) mills? (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) cards?\.?$/i))){const scope=scopeFromSubject(m[1]),e={kind:'mill',scope:scope.startsWith('target-')?'you':scope,amount:numberFromText(m[2])??m[2].toUpperCase()};if(scope.startsWith('target-'))e.bind=playerRequirement(requirements,scope==='target-opponent'?'opponent':'player',m[1]);effects.push(e);return{effects,requirements,unsupported}}
  if((m=c.match(/^Mill (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) cards?\.?$/i))){effects.push({kind:'mill',scope:'you',amount:numberFromText(m[1])??m[1].toUpperCase()});return{effects,requirements,unsupported}}

  // Life.
  if((m=c.match(/^(You|Target player|Target opponent|Each player|Each opponent) (gains?|loses?) (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) life\.?$/i))){const scope=scopeFromSubject(m[1]),e={kind:'life',scope:scope.startsWith('target-')?'you':scope,amount:numberFromText(m[3])??m[3].toUpperCase(),deltaSign:/gain/i.test(m[2])?1:-1};if(scope.startsWith('target-'))e.bind=playerRequirement(requirements,scope==='target-opponent'?'opponent':'player',m[1]);effects.push(e);return{effects,requirements,unsupported}}
  if((m=c.match(/^(Each opponent|Each player) loses life equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))){effects.push({kind:'life',scope:scopeFromSubject(m[1]),amount:amountExpr(m[2]),deltaSign:-1});return{effects,requirements,unsupported}}
  if((m=c.match(/^You gain life equal to (the number of .+|the greatest power among .+|the greatest toughness among .+)\.?$/i))){effects.push({kind:'life',scope:'you',amount:amountExpr(m[1]),deltaSign:1});return{effects,requirements,unsupported}}
  if((m=c.match(/^Your life total becomes (\d+|one|two|three|four|five|ten|twenty|forty)\.?$/i))){effects.push({kind:'set-life',scope:'you',amount:numberFromText(m[1])});return{effects,requirements,unsupported}}

  if((m=c.match(/^Each opponent loses (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) life and you gain (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) life\.?$/i))){effects.push({kind:'life',scope:'each-opponent',amount:numberFromText(m[1])??m[1].toUpperCase(),deltaSign:-1},{kind:'life',scope:'you',amount:numberFromText(m[2])??m[2].toUpperCase(),deltaSign:1});return{effects,requirements,unsupported}}

  // Damage, fight.
  if((m=c.match(/^(?:This spell|[^.]+?) deals? (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) damage to (any target|target creature|target creature or planeswalker|target player|target opponent|target permanent)\.?$/i))){const bind=targetRequirement(requirements,m[2].toLowerCase(),m[2]);effects.push({kind:'damage',amount:numberFromText(m[1])??m[1].toUpperCase(),bind,sourceName});return{effects,requirements,unsupported}}
  if((m=c.match(/^It deals damage equal to its power to (any target|target creature|target player|target opponent|target permanent)\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'damage',amount:{kind:'source-power'},bind,sourceName});return{effects,requirements,unsupported}}
  if((m=c.match(/^Target creature you control deals damage equal to its power to (any other target|any target|target creature|target player|target opponent)\.?$/i))){const sourceBind=targetRequirement(requirements,'target creature you control','Creature you control');const targetBind=targetRequirement(requirements,m[1].toLowerCase(),m[1],{excludeBind:sourceBind});effects.push({kind:'damage-from-selected-creature',sourceBind,targetBind,amount:{kind:'source-power'}});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Target creature you control) fights (target creature you don'?t control|another target creature)\.?$/i))){const sourceBind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);const targetBind=targetRequirement(requirements,m[2].toLowerCase(),m[2],{excludeBind:sourceBind});effects.push({kind:'fight',sourceBind,targetBind});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Target creature) fights (target creature|target creature you don'?t control|another target creature)\.?$/i))){const sourceBind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);const targetBind=targetRequirement(requirements,m[2].toLowerCase(),m[2],{excludeBind:sourceBind});effects.push({kind:'fight',sourceBind,targetBind});return{effects,requirements,unsupported}}

  if((m=c.match(/^Return all (creature|artifact|enchantment|land|permanent) cards? from your graveyard to your hand\.?$/i))){effects.push({kind:'graveyard-zone-each',scope:'you',filter:m[1].toLowerCase(),to:'hand'});return{effects,requirements,unsupported}}
  if((m=c.match(/^Exile all cards from (target player)'?s graveyard\.?$/i))){const playerBind=playerRequirement(requirements,'player',m[1]);effects.push({kind:'graveyard-zone-each',scope:'target-player',filter:'card',to:'exile',playerBind});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Tap|Untap) all (creatures|artifacts|lands|permanents) (target player) controls\.?$/i))){const playerBind=playerRequirement(requirements,'player',m[3]);effects.push({kind:m[1].toLowerCase()==='tap'?'tap-each':'untap-each',scope:'target-player',filter:m[2].replace(/s$/,''),playerBind});return{effects,requirements,unsupported}}

  // Mass removal / bounce and temporary combat restrictions.
  if((m=c.match(/^Destroy all (creatures|artifacts|enchantments|lands|permanents)\.?$/i))){effects.push({kind:'zone-each',scope:'all',filter:m[1].replace(/s$/,''),to:'graveyard',destroy:true});return{effects,requirements,unsupported}}
  if((m=c.match(/^Exile all (creatures|artifacts|enchantments|lands|permanents)\.?$/i))){effects.push({kind:'zone-each',scope:'all',filter:m[1].replace(/s$/,''),to:'exile'});return{effects,requirements,unsupported}}
  if((m=c.match(/^Return all (creatures|artifacts|enchantments|lands|permanents) to their owners?' hands?\.?$/i))){effects.push({kind:'zone-each',scope:'all',filter:m[1].replace(/s$/,''),to:'hand'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Target creature[^.]*) can'?t block this turn\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'combat-restriction',bind,restriction:'cant-block',expires:'cleanup'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Target creature[^.]*) can'?t attack or block this turn\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'combat-restriction',bind,restriction:'cant-attack-or-block',expires:'cleanup'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Target creature[^.]*) must attack this combat if able\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'combat-restriction',bind,restriction:'must-attack',expires:'end-combat'});return{effects,requirements,unsupported}}
  if(/^Target creature blocks target creature this turn if able\.?$/i.test(c)){const blockerBind=targetRequirement(requirements,'target creature','Creature that must block');const attackerBind=targetRequirement(requirements,'target creature','Creature to block',{excludeBind:blockerBind});effects.push({kind:'force-block',blockerBind,attackerBind,expires:'end-combat'});return{effects,requirements,unsupported}}

  // Destroy/exile/bounce / graveyard moves.
  if((m=c.match(/^For each opponent, destroy up to one target (artifact or enchantment|artifact|enchantment) that player controls\.?$/i))){const bind=`perOpponent${requirements.length}`;requirements.push({kind:'per-opponent-up-to-one',bind,filter:m[1].toLowerCase(),label:`Up to one ${m[1]} for each opponent`});effects.push({kind:'destroy-selected-many',bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^Destroy (target .+?)\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'destroy',bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^Exile (target .+?)\.?$/i))){const scope=m[1].toLowerCase();if(/card .*graveyard/.test(scope)){const bind=`grave${requirements.length}`;requirements.push({kind:'graveyard-target',bind,scope,label:m[1]});effects.push({kind:'move-zone',bind,to:'exile'});return{effects,requirements,unsupported}}const bind=targetRequirement(requirements,scope,m[1]);effects.push({kind:'exile',bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^Return (target .+?) to (?:its|their) owner'?s hand\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'bounce',bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^Return (target .+? card) from (?:your|a|target player'?s) graveyard to (?:your|its owner'?s) hand\.?$/i))){const bind=`grave${requirements.length}`;requirements.push({kind:'graveyard-target',bind,scope:m[1].toLowerCase(),label:m[1]});effects.push({kind:'return-from-graveyard',bind,to:'hand'});return{effects,requirements,unsupported}}
  if((m=c.match(/^Return (target .+? card) from (?:your|a|target player'?s) graveyard to the battlefield( tapped)?\.?$/i))){const bind=`grave${requirements.length}`;requirements.push({kind:'graveyard-target',bind,scope:m[1].toLowerCase(),label:m[1]});effects.push({kind:'return-from-graveyard',bind,to:'battlefield',tapped:!!m[2]});return{effects,requirements,unsupported}}
  if((m=c.match(/^Put (target .+? card) from (?:your|a) graveyard on top of (?:your|its owner'?s) library\.?$/i))){const bind=`grave${requirements.length}`;requirements.push({kind:'graveyard-target',bind,scope:m[1].toLowerCase(),label:m[1]});effects.push({kind:'move-zone',bind,to:'library',position:'top'});return{effects,requirements,unsupported}}

  // Sacrifice as an effect (not a cost).
  if((m=c.match(/^(You|Each player|Each opponent|Target player|Target opponent) sacrifices? (a|an|one|two|three|four|five|\d+) (creature|artifact|enchantment|land|permanent)s?\.?$/i))){const scope=scopeFromSubject(m[1]),amount=numberFromText(m[2]);const e={kind:'sacrifice-many',scope:scope.startsWith('target-')?'you':scope,amount,filter:m[3].toLowerCase()};if(scope.startsWith('target-'))e.playerBind=playerRequirement(requirements,scope==='target-opponent'?'opponent':'player',m[1]);e.bind=cardSelectionRequirement(requirements,{scope:scope==='each-opponent'?'each-opponent':scope==='each-player'?'each-player':scope==='you'?'you':'target',filter:e.filter,amount,label:`Choose ${m[3]} to sacrifice`,playerBind:e.playerBind||null});effects.push(e);return{effects,requirements,unsupported}}
  if((m=c.match(/^Sacrifice (a|an|one|two|three|four|five|\d+) (creature|artifact|enchantment|land|permanent)s?\.?$/i))){const amount=numberFromText(m[1]);const bind=cardSelectionRequirement(requirements,{scope:'you',filter:m[2].toLowerCase(),amount,label:`Choose ${m[2]} to sacrifice`});effects.push({kind:'sacrifice-many',scope:'you',amount,filter:m[2].toLowerCase(),bind});return{effects,requirements,unsupported}}

  // Counters.
  const selfName=String(sourceName||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const selfCounterRe=new RegExp(`^Put (a|an|one|two|three|four|five|\\d+) ([+-]\\d+\\/[+-]\\d+|\\+1\\/\\+1|-1\\/-1|[A-Za-z][A-Za-z -]+) counters? on (?:${selfName}|this (?:creature|permanent)|it)\\.?$`,'i');
  if((m=c.match(selfCounterRe))){effects.push({kind:'counter',bind:'sourceId',counter:m[2].trim(),amount:numberFromText(m[1])});return{effects,requirements,unsupported}}
  if((m=c.match(/^Put (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on (target .+?)\.?$/i))){const bind=targetRequirement(requirements,m[3].toLowerCase(),m[3]);effects.push({kind:'counter',bind,counter:m[2].trim(),amount:numberFromText(m[1])});return{effects,requirements,unsupported}}
  if((m=c.match(/^Put (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on each (creature|artifact|enchantment|land|permanent) you control\.?$/i))){effects.push({kind:'counter-each',scope:'you',filter:m[3].toLowerCase(),counter:m[2].trim(),amount:numberFromText(m[1])});return{effects,requirements,unsupported}}
  if((m=c.match(/^Remove (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? from (target .+?)\.?$/i))){const bind=targetRequirement(requirements,m[3].toLowerCase(),m[3]);effects.push({kind:'remove-counter',bind,counter:m[2].trim(),amount:numberFromText(m[1])});return{effects,requirements,unsupported}}
  if(/^Proliferate\.?$/i.test(c)){const bind=`proliferate${requirements.length}`;requirements.push({kind:'proliferate',bind,label:'Choose permanents and/or players with counters'});effects.push({kind:'proliferate',bind});return{effects,requirements,unsupported}}

  // Tap / untap.
  if((m=c.match(/^(Tap|Untap) up to (one|two|three|four|five|\d+) target (creatures|artifacts|lands|permanents)\.?$/i))){const max=numberFromText(m[2]);const bind=`multi${requirements.length}`;requirements.push({kind:'multi-target',bind,scope:`target ${m[3]}`,min:0,max,label:`Choose up to ${max} ${m[3]}`});effects.push({kind:m[1].toLowerCase()==='tap'?'tap-many':'untap-many',bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Tap|Untap) (target .+?)\.?$/i))){const bind=targetRequirement(requirements,m[2].toLowerCase(),m[2]);effects.push({kind:m[1].toLowerCase(),bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Tap|Untap) all (creatures|artifacts|lands|permanents) you control\.?$/i))){effects.push({kind:m[1].toLowerCase()==='tap'?'tap-each':'untap-each',scope:'you',filter:m[2].replace(/s$/,'')});return{effects,requirements,unsupported}}

  // P/T and temporary keywords.
  if((m=c.match(/^(Target creature[^.]*) gets ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'pump',bind,power:Number(m[2]),toughness:Number(m[3]),expires:'cleanup'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Creatures you control|Each creature you control) get ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))){effects.push({kind:'pump-each',scope:'you',filter:'creature',power:Number(m[2]),toughness:Number(m[3]),expires:'cleanup'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Target creature[^.]*) gains? ([A-Za-z][A-Za-z -]+) until end of turn\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'grant-keyword',bind,keyword:m[2].trim(),enabled:true,expires:'cleanup'});return{effects,requirements,unsupported}}
  if((m=c.match(/^(Creatures you control|Each creature you control) gain ([A-Za-z][A-Za-z -]+) until end of turn\.?$/i))){effects.push({kind:'grant-keyword-each',scope:'you',filter:'creature',keyword:m[2].trim(),expires:'cleanup'});return{effects,requirements,unsupported}}

  // Tokens.
  if((m=c.match(/^For each opponent, create a (\d+)\/(\d+) ([^.]*?) creature token\.?$/i))){const typeWords=m[3].trim(),subtype=(typeWords.match(/(?:white|blue|black|red|green|colorless)?\s*([A-Z][A-Za-z'-]+)(?:\s+creature)?$/i)||[])[1]||'Creature';effects.push({kind:'create-token',amount:{kind:'opponents'},power:Number(m[1]),toughness:Number(m[2]),name:subtype,typeLine:`Token Creature — ${subtype}`});return{effects,requirements,unsupported}}
  if((m=c.match(/^Create a (\d+)\/(\d+) ([^.]*?) creature token for each (.+)\.?$/i))){const typeWords=m[3].trim(),subtype=(typeWords.match(/(?:white|blue|black|red|green|colorless)?\s*([A-Z][A-Za-z'-]+)(?:\s+creature)?$/i)||[])[1]||'Creature';effects.push({kind:'create-token',amount:countExprFromPhrase(m[4]),power:Number(m[1]),toughness:Number(m[2]),name:subtype,typeLine:`Token Creature — ${subtype}`});return{effects,requirements,unsupported}}
  if((m=c.match(/^Create (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) (\d+)\/(\d+) ([^.]*?) creature tokens?(?: with ([^.]+))?\.?$/i))){const typeWords=m[4].trim();const subtype=(typeWords.match(/(?:white|blue|black|red|green|colorless)?\s*([A-Z][A-Za-z'-]+)(?:\s+creature)?$/i)||[])[1]||'Creature';const kws=(m[5]||'').split(/,| and /).map(x=>x.trim()).filter(Boolean);effects.push({kind:'create-token',amount:numberFromText(m[1])??m[1].toUpperCase(),power:Number(m[2]),toughness:Number(m[3]),name:subtype,typeLine:`Token Creature — ${subtype}`,keywords:kws});return{effects,requirements,unsupported}}
  if((m=c.match(/^Create (a|an|one|two|three|four|five|\d+) (Treasure|Food|Clue|Blood|Map) tokens?\.?$/i))){const name=m[2],text=name==='Treasure'?'{T}, Sacrifice this artifact: Add one mana of any color.':name==='Clue'?'{2}, Sacrifice this artifact: Draw a card.':name==='Food'?'{2}, {T}, Sacrifice this artifact: You gain 3 life.':'';effects.push({kind:'create-token',amount:numberFromText(m[1]),name,typeLine:'Token Artifact',oracleText:text});return{effects,requirements,unsupported}}
  if(/^Investigate\.?$/i.test(c)){effects.push({kind:'create-token',amount:1,name:'Clue',typeLine:'Token Artifact',oracleText:'{2}, Sacrifice this artifact: Draw a card.'});return{effects,requirements,unsupported}}
  if((m=c.match(/^Create a token that'?s a copy of (target .+?)(?:, except .+)?\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'copy-token',bind});return{effects,requirements,unsupported}}

  if((m=c.match(/^Double (target creature)'?s power until end of turn\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'double-power',bind,expires:'cleanup'});return{effects,requirements,unsupported}}
  if((m=c.match(/^Double the number of ([+-]\d+\/[+-]\d+|\+1\/\+1|-1\/-1|[A-Za-z][A-Za-z -]+) counters? on (target .+?)\.?$/i))){const bind=targetRequirement(requirements,m[2].toLowerCase(),m[2]);effects.push({kind:'double-counter',bind,counter:m[1].trim()});return{effects,requirements,unsupported}}
  if(/^Exchange your life total with target opponent'?s life total\.?$/i.test(c)){const playerBind=playerRequirement(requirements,'opponent','target opponent');effects.push({kind:'exchange-life',playerBind});return{effects,requirements,unsupported}}
  if(/^Attach target Equipment you control to target creature you control\.?$/i.test(c)){const equipmentBind=targetRequirement(requirements,'target equipment you control','Equipment you control');const creatureBind=targetRequirement(requirements,'target creature you control','Creature you control',{excludeBind:equipmentBind});effects.push({kind:'attach',equipmentBind,creatureBind});return{effects,requirements,unsupported}}

  // Control.
  if((m=c.match(/^Gain control of (target .+?)( until end of turn)?\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'gain-control',bind,untilEndOfTurn:!!m[2]});return{effects,requirements,unsupported}}
  if((m=c.match(/^Gain control of (target .+?) until end of turn\. Untap it\. It gains haste until end of turn\.?$/i))){const bind=targetRequirement(requirements,m[1].toLowerCase(),m[1]);effects.push({kind:'gain-control',bind,untilEndOfTurn:true,untap:true,haste:true});return{effects,requirements,unsupported}}

  // Scry / surveil.
  if((m=c.match(/^Scry (one|two|three|four|five|\d+|X)\.?$/i))){const amount=numberFromText(m[1])??m[1].toUpperCase(),bind=`scry${requirements.length}`;requirements.push({kind:'scry',bind,amount,label:`Scry ${m[1]}`});effects.push({kind:'scry',scope:'you',amount,bind});return{effects,requirements,unsupported}}
  if((m=c.match(/^Surveil (one|two|three|four|five|\d+|X)\.?$/i))){const amount=numberFromText(m[1])??m[1].toUpperCase(),bind=`surveil${requirements.length}`;requirements.push({kind:'surveil',bind,amount,label:`Surveil ${m[1]}`});effects.push({kind:'surveil',scope:'you',amount,bind});return{effects,requirements,unsupported}}

  // Mana / shuffle.
  if((m=c.match(/^Add (\{[WUBRGC]\}|one mana of any color|one mana of any type)(?: for each (.+))?\.?$/i))){let color=null,colorBind=null;if(/^\{/.test(m[1]))color=m[1][1];else{colorBind=`manaColor${requirements.length}`;requirements.push({kind:'color',bind:colorBind,includeColorless:/any type/i.test(m[1]),label:m[1]})}effects.push({kind:'add-mana',amount:m[2]?countExprFromPhrase(m[2]):1,color,colorBind});return{effects,requirements,unsupported}}
  if(/^Shuffle(?: your library)?\.?$/i.test(c)){effects.push({kind:'shuffle'});return{effects,requirements,unsupported}}

  if((m=c.match(/^(Target player|You) takes? an extra turn after this one\.?$/i))){const playerBind=/target/i.test(m[1])?playerRequirement(requirements,'player',m[1]):null;effects.push({kind:'extra-turn',playerBind});return{effects,requirements,unsupported}}
  if(/^You may play an additional land this turn\.?$/i.test(c)){effects.push({kind:'extra-land-play',amount:1});return{effects,requirements,unsupported}}
  if(/^You may cast spells from your graveyard this turn\.?$/i.test(c)){effects.push({kind:'grant-cast-zone',zone:'graveyard',expires:'cleanup'});return{effects,requirements,unsupported}}

  if((m=c.match(/^Prevent the next (one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) damage that would be dealt to (any target|target creature|target player|target permanent) this turn\.?$/i))){const bind=targetRequirement(requirements,m[2].toLowerCase(),m[2]);effects.push({kind:'prevent-damage',bind,amount:numberFromText(m[1])??m[1].toUpperCase(),expires:'cleanup'});return{effects,requirements,unsupported}}

  // Stack interaction.
  if((m=c.match(/^Counter (target spell)(?: unless its controller pays .+)?\.?$/i))){const bind=`stack${requirements.length}`;requirements.push({kind:'stack-target',bind,scope:'spell',label:m[1]});effects.push({kind:'counter-spell',bind});return{effects,requirements,unsupported}}
  if(/^Copy target spell\.?$/i.test(c)){const bind=`stack${requirements.length}`;requirements.push({kind:'stack-target',bind,scope:'spell',label:'target spell'});effects.push({kind:'copy-stack',bind});return{effects,requirements,unsupported}}

  // Chosen values attached to a permanent.
  if(/^Choose a color\.?$/i.test(c)){const bind=`color${requirements.length}`;requirements.push({kind:'color',bind,includeColorless:false,label:'Choose a color'});effects.push({kind:'choose-color',colorBind:bind});return{effects,requirements,unsupported}}
  if(/^Choose a creature type\.?$/i.test(c)){const bind=`creatureType${requirements.length}`;requirements.push({kind:'text-choice',bind,label:'Choose a creature type'});effects.push({kind:'choose-creature-type',bind});return{effects,requirements,unsupported}}

  // "Then sacrifice it" / pronoun continuations used after a source-creature choice.
  if(/^Sacrifice it\.?$/i.test(c)){effects.push({kind:'sacrifice',bind:'lastTarget'});return{effects,requirements,unsupported}}

  unsupported.push(c);return{effects,requirements,unsupported};
}
function mergeCompiled(parts){
  const effects=[],requirements=[],unsupported=[];for(const p of parts){effects.push(...p.effects);requirements.push(...p.requirements);unsupported.push(...p.unsupported)}return{effects,requirements,unsupported};
}
function compileThenClause(clause,opts){
  const pieces=clause.split(/\bthen\b/i).map(x=>normalizeClause(x.replace(/^,\s*/,'').replace(/,\s*$/,''))).filter(Boolean);if(pieces.length<2)return null;
  const compiled=pieces.map(p=>compileSingleClause(p,opts));
  // Special pronoun bridge: "Target creature you control deals ... Then sacrifice it."
  if(compiled[0]?.effects?.some(e=>e.kind==='damage-from-selected-creature')&&/^sacrifice it\.?$/i.test(pieces[1])){
    const src=compiled[0].effects.find(e=>e.kind==='damage-from-selected-creature');compiled[0].effects.push({kind:'sacrifice',bind:src.sourceBind});compiled.splice(1,1);
  }
  return mergeCompiled(compiled);
}
export function compileEffectText(text,{sourceName='Effect',allowGuidedFallback=false}={}){
  const raw=cleanOracle(text);const clauses=splitSentences(raw);const parts=[];
  for(const clause of clauses){
    if(/\bthen\b/i.test(clause)){const t=compileThenClause(clause,{sourceName});if(t){parts.push(t);continue}}
    parts.push(compileSingleClause(clause,{sourceName}));
  }
  const merged=mergeCompiled(parts);
  // X must be chosen unless a caller already binds it from an X cost.
  if(merged.effects.some(e=>JSON.stringify(e).includes('"X"'))&&!merged.requirements.some(r=>r.kind==='number'&&r.bind==='X'))merged.requirements.unshift({kind:'number',bind:'X',label:'Choose X',min:0,max:99});
  if(allowGuidedFallback&&merged.unsupported.length){for(const u of merged.unsupported)merged.effects.push({kind:'manual',text:u})}
  return {supported:merged.unsupported.length===0&&merged.effects.length>0,effects:merged.effects,requirements:merged.requirements,unsupported:merged.unsupported,raw,guidedFallbackAvailable:merged.unsupported.length>0};
}
export function supportForEffectText(text){const c=compileEffectText(text);return{supported:c.supported,unsupported:c.unsupported,effectKinds:[...new Set(c.effects.map(e=>e.kind))],requirements:c.requirements,guidedFallbackAvailable:c.guidedFallbackAvailable}}

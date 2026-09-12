import { evaluateLosses, basicLandManaColor, tapManaAbilities } from './rules-v0725.js?v=07973';
import { sync } from './deck.js?v=0722';
import { advanceTurn, configurePhaseGates, cleanupEndCombatEffects } from './phase.js?v=0727';
import { effectivePower, effectiveToughness } from './combat-engine.js?v=0727';
import { applyEffects as applyGenericEffects, locateCardInGame, definitionFor, moveCard } from './effect-engine.js?v=0727';
import { queueTriggers } from './trigger-engine.js?v=07968';

const ZONES=['remainingLibrary','hand','battlefield','graveyard','exile','tokens','attachments','commandZone'];
function locate(deck,id){for(const z of ZONES){const a=deck[z]||[];const i=a.findIndex(c=>c.instanceId===id);if(i>=0)return{z,a,i,card:a[i]}}return null}
function zoneKey(zone){return zone==='library'?'remainingLibrary':zone==='command'?'commandZone':zone}
function defFor(game,card){return card&&game.cardDefinitions?.[card.definitionId]}
function shuffleArray(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function inferredManaCapacityColor(game,card){
  if(!card)return null;
  const def=defFor(game,card);if(!/\bLand\b/i.test(def?.typeLine||''))return null;
  const basic=basicLandManaColor(def);if(basic)return basic;
  const options=[...new Set(tapManaAbilities(def).flatMap(a=>a.options||[]))];
  if(options.length===1)return options[0];
  // Lands with a stored as-enters color and no other fixed option can use that choice.
  if(options.length===0&&['W','U','B','R','G','C'].includes(card.chosenColor))return card.chosenColor;
  return null;
}
function registerManaSource(game,player,card){
  if(!player||!card||card.manaCapacityRegistered)return;
  const color=card.manaCapacityColor||inferredManaCapacityColor(game,card);if(!color)return;
  card.manaCapacityColor=color;card.manaCapacityRegistered=true;
  player.mana.total[color]=Number(player.mana.total[color]||0)+1;
  if(!card.tapped)player.mana.available[color]=Number(player.mana.available[color]||0)+1;
}
function unregisterManaSource(player,card,{wasTapped=null}={}){
  if(!player||!card||!card.manaCapacityRegistered||!card.manaCapacityColor)return;
  const color=card.manaCapacityColor,tapped=wasTapped===null?!!card.tapped:!!wasTapped;
  player.mana.total[color]=Math.max(0,Number(player.mana.total[color]||0)-1);
  if(!tapped)player.mana.available[color]=Math.max(0,Number(player.mana.available[color]||0)-1);
  card.manaCapacityRegistered=false;card.manaCapacityColor=null;
}
function emit(game,event){
  if(event?.type==='enters-battlefield'){
    const hit=locateCardInGame(game,event.sourceId);const player=game.players.find(p=>p.playerId===(event.controllerId||hit?.card?.controllerId));
    if(hit?.zone==='battlefield')registerManaSource(game,player,hit.card);
  }else if(event?.type==='leaves-battlefield'){
    const hit=locateCardInGame(game,event.sourceId);const player=game.players.find(p=>p.playerId===event.controllerId);
    if(hit?.card)unregisterManaSource(player,hit.card,{wasTapped:event.wasTapped});
  }
  return queueTriggers(game,event)
}
function payMana(player,payment){
  if(!payment)return;
  for(const [color,raw] of Object.entries(payment)){
    const amount=Math.max(0,Number(raw||0));if(!amount)continue;
    // Available mana represents untapped production capacity plus any mana already floated.
    // Spend inferred floating mana first; otherwise automatically tap only the sources actually needed.
    const sources=(player.deck?.battlefield||[]).filter(c=>!c.tapped&&c.manaCapacityRegistered&&c.manaCapacityColor===color);
    const available=Math.max(0,Number(player.mana.available[color]||0));
    const inferredFloating=Math.max(0,available-sources.length);
    const tapCount=Math.min(sources.length,Math.max(0,amount-inferredFloating));
    for(let i=0;i<tapCount;i++)sources[i].tapped=true;
    player.mana.available[color]=Math.max(0,available-amount);
  }
}
function addMana(player,color,amount=1){player.mana.available[color]=Number(player.mana.available[color]||0)+Number(amount||0)}
function setTappedWithCapacity(player,card,nextTapped){const next=!!nextTapped,prev=!!card.tapped;if(prev===next){card.tapped=next;return}const mc=card.manaCapacityColor;if(mc){const delta=next?-1:1;player.mana.available[mc]=Math.max(0,Number(player.mana.available[mc]||0)+delta)}card.tapped=next}
function removeFromZone(deck,id,allowed=null){const hit=locate(deck,id);if(!hit)throw new Error('Card instance not found');if(allowed&&!allowed.includes(hit.z))throw new Error('Card is not in a legal source zone');const [card]=hit.a.splice(hit.i,1);return{card,from:hit.z}}
function ownerFor(game,card,fallback){return game.players.find(p=>p.playerId===card?.ownerId)||fallback}
function insertOwnedZone(game,card,to,fallback,{position='bottom'}={}){const owner=ownerFor(game,card,fallback);const target=owner?.deck?.[zoneKey(to)];if(!target)throw new Error('Invalid target zone');card.zone=to;card.controllerId=to==='battlefield'?(card.controllerId||fallback?.playerId):owner.playerId;if(to==='library'&&position==='top')target.unshift(card);else target.push(card);return owner}

function applyTrackedEffects(game,player,effects=[],bindings={}){
  const notes=[];
  for(const effect of effects||[]){
    // Legacy Special Move payload remains supported.
    if(effect.kind==='damage-from-creature'){
      const sourceId=effect.sourceId;const src=locateCardInGame(game,sourceId);if(!src||src.zone!=='battlefield'){notes.push('The chosen source creature was no longer on the battlefield.');continue}
      const sd=definitionFor(game,src.card),amount=effectivePower(src.card,sd,game);
      const mapped={kind:'damage-from-selected-creature',sourceId,targetId:effect.targetId,targetBind:null,amount,sourceBind:null,sacrificeSource:!!effect.sacrificeSource};
      notes.push(...applyGenericEffects(game,player.playerId,[mapped],{...bindings,sourceId,onEvent:e=>emit(game,e)}));continue;
    }
    notes.push(...applyGenericEffects(game,player.playerId,[effect],{...bindings,onEvent:e=>emit(game,e)}));
  }
  return notes;
}

function putSpellOnStack(game,player,action,deck){
  const allowed=Array.isArray(action.fromZones)&&action.fromZones.length?action.fromZones:['hand','commandZone'];const {card,from}=removeFromZone(deck,action.instanceId,allowed);payMana(player,action.payment);card.zone='stack';
  game.stack=game.stack||[];
  const stackObject={
    id:action.stackId||`stack:${Date.now()}:${Math.random()}`,kind:'spell',controllerId:player.playerId,ownerId:card.ownerId,card,sourceDefinitionId:card.definitionId,
    fromZone:from,to:action.to||'battlefield',effects:structuredClone(action.effects||[]),effectBindings:structuredClone(action.effectBindings||{}),searchResult:structuredClone(action.searchResult||null),
    asEntersChoices:structuredClone(action.asEntersChoices||null),manaCapacityColor:action.manaCapacityColor||null,label:action.label||`Cast ${defFor(game,card)?.name||'spell'}`,
    commanderId:action.commanderId||null,guidedResolution:structuredClone(action.guidedResolution||null),createdAt:new Date().toISOString()
  };
  game.stack.push(stackObject);
  emit(game,{type:'spell-cast',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,fromZone:from,stackId:stackObject.id,typeLine:defFor(game,card)?.typeLine||''});
  return stackObject;
}
function payAbilityCosts(game,player,action,deck){
  const hit=locate(deck,action.instanceId);if(!hit||hit.z!=='battlefield')throw new Error('Ability source must be on the battlefield');const card=hit.card;
  if(action.requiresTap){if(card.tapped)throw new Error('Ability source is already tapped');setTappedWithCapacity(player,card,true);emit(game,{type:'tapped',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId})}
  if(action.requiresUntap){if(!card.tapped)throw new Error('Ability source is not tapped');setTappedWithCapacity(player,card,false);emit(game,{type:'untapped',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId})}
  payMana(player,action.payment);
  if(action.lifeCost){if(player.life<action.lifeCost)throw new Error('Not enough life to pay this activation cost');player.life-=action.lifeCost;emit(game,{type:'life-lost',playerId:player.playerId,amount:action.lifeCost,controllerId:player.playerId,sourceId:card.instanceId})}
  if(Array.isArray(action.costMoveIds))for(const id of action.costMoveIds){const mv=locate(deck,id);if(!mv)throw new Error('Chosen activation-cost card is unavailable');const def=defFor(game,mv.card),fromController=mv.card.controllerId||player.playerId;const [paid]=mv.a.splice(mv.i,1);paid.zone='graveyard';paid.tapped=false;const owner=ownerFor(game,paid,player);if(!paid.token)owner.deck.graveyard.push(paid);emit(game,{type:'discard',playerId:player.playerId,sourceId:paid.instanceId,definitionId:paid.definitionId,cost:true});if(mv.z==='battlefield'){emit(game,{type:'leaves-battlefield',sourceId:paid.instanceId,definitionId:paid.definitionId,controllerId:fromController,ownerId:paid.ownerId,destination:'graveyard',typeLine:def?.typeLine||''});if(/Creature/i.test(def?.typeLine||''))emit(game,{type:'dies',sourceId:paid.instanceId,definitionId:paid.definitionId,controllerId:fromController,ownerId:paid.ownerId,typeLine:def?.typeLine||'',token:!!paid.token})}}
  if(action.sacrificeSelf){const selfHit=locate(deck,action.instanceId);if(selfHit){const def=defFor(game,selfHit.card),fromController=selfHit.card.controllerId||player.playerId;const [sacrificed]=selfHit.a.splice(selfHit.i,1);sacrificed.zone='graveyard';sacrificed.tapped=false;const owner=ownerFor(game,sacrificed,player);if(!sacrificed.token)owner.deck.graveyard.push(sacrificed);emit(game,{type:'leaves-battlefield',sourceId:sacrificed.instanceId,definitionId:sacrificed.definitionId,controllerId:fromController,ownerId:sacrificed.ownerId,destination:'graveyard',typeLine:def?.typeLine||''});if(/Creature/i.test(def?.typeLine||''))emit(game,{type:'dies',sourceId:sacrificed.instanceId,definitionId:sacrificed.definitionId,controllerId:fromController,ownerId:sacrificed.ownerId,typeLine:def?.typeLine||'',token:!!sacrificed.token})}}
  return card;
}
function putAbilityOnStack(game,player,action,deck){
  const source=payAbilityCosts(game,player,action,deck);game.stack=game.stack||[];
  const obj={id:action.stackId||`stack:${Date.now()}:${Math.random()}`,kind:'ability',controllerId:player.playerId,sourceId:action.instanceId,sourceDefinitionId:source?.definitionId||action.sourceDefinitionId||null,effects:structuredClone(action.effects||[]),effectBindings:structuredClone(action.effectBindings||{}),searchResult:structuredClone(action.searchResult||null),manaColor:action.manaColor||null,manaAmount:action.manaAmount||1,label:action.label||'Activated ability',guidedResolution:structuredClone(action.guidedResolution||null),createdAt:new Date().toISOString()};
  game.stack.push(obj);emit(game,{type:'ability-activated',sourceId:action.instanceId,definitionId:obj.sourceDefinitionId,controllerId:player.playerId,stackId:obj.id});return obj;
}
function applySearchResult(game,player,obj){
  const deck=player.deck;if(obj.manaColor)addMana(player,obj.manaColor,obj.manaAmount||1);
  const search=obj.searchResult;
  if(!search)return;
  if(!search.instanceId){if(search.shuffle)shuffleArray(deck.remainingLibrary);return}
  const found=locate(deck,search.instanceId);if(!found||found.z!=='remainingLibrary')throw new Error('The selected searched card is no longer in the library');const [searched]=found.a.splice(found.i,1);const to=search.to||'hand';searched.zone=to;
  if(to==='battlefield'){searched.controllerId=player.playerId;searched.enteredTurn=game.turnNumber;searched.controlSinceTurn=game.turnNumber;searched.tapped=!!search.entersTapped}
  const target=deck[zoneKey(to)];if(!target)throw new Error('Invalid search destination');if(to==='library'&&search.position==='top')target.unshift(searched);else target.push(searched);
  if(search.shuffle)shuffleArray(deck.remainingLibrary);
  if(to==='battlefield'&&search.untapIfLandsAtLeast){const landCount=(deck.battlefield||[]).filter(x=>/\bLand\b/i.test(defFor(game,x)?.typeLine||'')).length;if(landCount>=Number(search.untapIfLandsAtLeast))searched.tapped=false}
  if(to==='battlefield')emit(game,{type:'enters-battlefield',sourceId:searched.instanceId,definitionId:searched.definitionId,controllerId:player.playerId,ownerId:searched.ownerId,typeLine:defFor(game,searched)?.typeLine||''});
}
function resolveStackTop(game){
  game.stack=game.stack||[];const obj=game.stack.pop();if(!obj)throw new Error('The stack is empty.');const player=game.players.find(p=>p.playerId===obj.controllerId);if(!player)throw new Error('Stack object controller is unavailable.');let notes=[];
  if(obj.kind==='spell'||obj.kind==='spell-copy'){
    const card=obj.card,def=defFor(game,card),isCopy=obj.kind==='spell-copy'||obj.isCopy,to=isCopy?'none':(obj.to||(/Instant|Sorcery/i.test(def?.typeLine||'')?'graveyard':'battlefield'));
    card.zone=to;
    if(to==='battlefield'){
      card.controllerId=player.playerId;card.enteredTurn=game.turnNumber;card.controlSinceTurn=game.turnNumber;card.tapped=!!obj.entersTapped;
      if(obj.asEntersChoices?.color)card.chosenColor=obj.asEntersChoices.color;if(obj.asEntersChoices?.creatureType)card.chosenCreatureType=obj.asEntersChoices.creatureType;if(obj.asEntersChoices?.cardName)card.chosenCardName=obj.asEntersChoices.cardName;if(obj.asEntersChoices?.playerId)card.chosenPlayerId=obj.asEntersChoices.playerId;
      if(obj.manaCapacityColor)card.manaCapacityColor=obj.manaCapacityColor
    }
    if(!isCopy){const owner=ownerFor(game,card,player),target=(to==='battlefield'?player.deck:owner.deck)[zoneKey(to)];if(!target)throw new Error('Invalid spell destination');target.push(card)}
    applySearchResult(game,player,obj);
    notes.push(...applyTrackedEffects(game,player,obj.effects||[],{...obj.effectBindings,sourceId:card.instanceId}));
    if(!isCopy&&to==='battlefield')emit(game,{type:'enters-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,ownerId:card.ownerId,typeLine:def?.typeLine||''});
    if(obj.commanderId){const cmd=player.commanders.find(c=>c.id===obj.commanderId);if(cmd){cmd.zone=to;cmd.commandZone=to==='command'}}
    emit(game,{type:isCopy?'spell-copy-resolved':'spell-resolved',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,destination:to});
  }else if(obj.kind==='ability'||obj.kind==='trigger'){
    applySearchResult(game,player,obj);notes.push(...applyTrackedEffects(game,player,obj.effects||[],{...obj.effectBindings,sourceId:obj.sourceId}));emit(game,{type:obj.kind==='ability'?'ability-resolved':'trigger-resolved',sourceId:obj.sourceId,definitionId:obj.sourceDefinitionId,controllerId:player.playerId});
  }else throw new Error(`Unsupported stack object kind: ${obj.kind}`);
  return{obj,notes};
}
function restore(game,before){for(const k of Object.keys(game))delete game[k];Object.assign(game,structuredClone(before))}
function event(game,action){game.log.unshift({id:`event:${Date.now()}:${Math.random()}`,turn:game.turnNumber,type:action.type,playerId:action.playerId,text:action.label||action.type,at:new Date().toISOString()})}
function resetManaAtBoundary(game){
  // Available mana is modeled as currently usable untapped-source capacity plus explicit floating mana.
  // Sources remain represented by their card tap state; transaction actions maintain available counts.
  // This hook only clears explicitly tracked floating mana when present.
  for(const p of game.players||[]){if(p.mana?.floating){p.mana.floating={W:0,U:0,B:0,R:0,G:0,C:0}}}
}
export function createTransactionEngine(game){
  function commit(action){
    const player=game.players.find(p=>p.playerId===action.playerId);if(!player)throw new Error('Unknown player');
    const before=structuredClone({...game,undoHistory:[],pendingTransaction:null});const deck=player.deck;
    if(action.type==='cast-spell')putSpellOnStack(game,player,action,deck);
    else if(action.type==='activate-ability-stack')putAbilityOnStack(game,player,action,deck);
    else if(action.type==='put-trigger-stack'){
      game.stack=game.stack||[];game.stack.push({id:action.stackId||`stack:${Date.now()}:${Math.random()}`,kind:'trigger',controllerId:player.playerId,sourceId:action.sourceId||null,sourceDefinitionId:action.sourceDefinitionId||null,effects:structuredClone(action.effects||[]),effectBindings:structuredClone(action.effectBindings||{}),label:action.label||'Triggered ability',abilityText:action.abilityText||'',guidedResolution:structuredClone(action.guidedResolution||null),createdAt:new Date().toISOString()});
    }
    else if(action.type==='resolve-stack'){const r=resolveStackTop(game);action.label=`${r.obj.label||'Stack object'} resolves.${r.notes.length?' '+r.notes.join(' '):''}`}
    else if(action.type==='resolve-effects'){const notes=applyTrackedEffects(game,player,action.effects||[],{...action.effectBindings,sourceId:action.sourceId||null});if(notes.length)action.label=`${action.label||'Effect resolves.'} ${notes.join(' ')}`}
    else if(action.type==='draw'){
      const card=deck.remainingLibrary.shift();if(!card)throw new Error('Library is empty');card.zone='hand';deck.hand.push(card);player.counters=player.counters||{};player.counters.cardsDrawnThisTurn=Number(player.counters.cardsDrawnThisTurn||0)+1;emit(game,{type:'draw',playerId:player.playerId,sourceId:card.instanceId,definitionId:card.definitionId,drawNumberThisTurn:player.counters.cardsDrawnThisTurn});
    }
    else if(action.type==='move-card'){
      const hit=locate(deck,action.instanceId);if(!hit)throw new Error('Card not found');const card=hit.card,def=defFor(game,card),from=hit.z,fromController=card.controllerId||player.playerId;hit.a.splice(hit.i,1);
      const wasTappedBeforeMove=!!card.tapped;
      card.zone=action.to;card.tapped=action.to==='battlefield'?!!action.tapped:false;card.controllerId=action.to==='battlefield'?(action.controllerId||player.playerId):card.ownerId;const owner=ownerFor(game,card,player),target=(action.to==='battlefield'?(game.players.find(p=>p.playerId===card.controllerId)||owner):owner).deck[zoneKey(action.to)];if(!target)throw new Error('Invalid target zone');if(action.to==='library'&&action.position==='top')target.unshift(card);else if(!(card.token&&action.to!=='battlefield'))target.push(card);
      if(from==='battlefield'&&action.to!=='battlefield'){emit(game,{type:'leaves-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:fromController,ownerId:card.ownerId,destination:action.to,typeLine:def?.typeLine||'',wasTapped:wasTappedBeforeMove});if(action.to==='graveyard'&&/Creature/i.test(def?.typeLine||''))emit(game,{type:'dies',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:fromController,ownerId:card.ownerId,typeLine:def?.typeLine||'',token:!!card.token})}
      if(action.to==='battlefield'){card.enteredTurn=game.turnNumber;card.controlSinceTurn=game.turnNumber;emit(game,{type:'enters-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:card.controllerId,ownerId:card.ownerId,typeLine:def?.typeLine||''})}
      const cmd=player.commanders.find(x=>x.cardId===card.definitionId);if(cmd){cmd.zone=action.to;cmd.commandZone=action.to==='command'}
    }
    else if(action.type==='play-land'){
      const hit=locate(deck,action.instanceId);if(!hit||hit.z!=='hand')throw new Error('Land must be in hand');const [card]=hit.a.splice(hit.i,1);card.zone='battlefield';card.controllerId=player.playerId;card.enteredTurn=game.turnNumber;card.controlSinceTurn=game.turnNumber;card.tapped=!!action.entersTapped;if(action.asEntersChoices?.color)card.chosenColor=action.asEntersChoices.color;if(action.asEntersChoices?.creatureType)card.chosenCreatureType=action.asEntersChoices.creatureType;if(action.asEntersChoices?.cardName)card.chosenCardName=action.asEntersChoices.cardName;if(action.asEntersChoices?.playerId)card.chosenPlayerId=action.asEntersChoices.playerId;deck.battlefield.push(card);player.counters.landsPlayedThisTurn=Number(player.counters.landsPlayedThisTurn||0)+1;
      if(action.basicManaColor)card.manaCapacityColor=action.basicManaColor
      emit(game,{type:'enters-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,ownerId:card.ownerId,typeLine:defFor(game,card)?.typeLine||''});
    }
    else if(action.type==='cast-card'){
      // Legacy immediate-resolution path retained for older callers/tests. New UI routes spells through cast-spell + priority.
      const hit=locate(deck,action.instanceId);if(!hit||!['hand','commandZone'].includes(hit.z))throw new Error('Card is not castable from that zone');const [card]=hit.a.splice(hit.i,1);payMana(player,action.payment);card.zone=action.to||'battlefield';const def=defFor(game,card);
      if(card.zone==='battlefield'){card.controllerId=player.playerId;card.enteredTurn=game.turnNumber;card.controlSinceTurn=game.turnNumber;card.tapped=!!action.entersTapped;if(action.asEntersChoices?.color)card.chosenColor=action.asEntersChoices.color;if(action.manaCapacityColor)card.manaCapacityColor=action.manaCapacityColor}
      const owner=ownerFor(game,card,player),target=(card.zone==='battlefield'?player.deck:owner.deck)[zoneKey(card.zone)];target.push(card);if(card.zone==='battlefield')emit(game,{type:'enters-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,ownerId:card.ownerId,typeLine:def?.typeLine||''});const effectNotes=applyTrackedEffects(game,player,action.effects||[],{...action.effectBindings,sourceId:card.instanceId});if(effectNotes.length)action.label=`${action.label||'Spell resolved.'} ${effectNotes.join(' ')}`;
    }
    else if(action.type==='tap-card'){
      const hit=locate(deck,action.instanceId);if(!hit)throw new Error('Card instance not found');const card=hit.card;if(action.tapped===false&&!action.allowUntap)throw new Error('A tapped permanent can only untap during the untap step or because a rule/card effect permits it.');if(action.tapped!==false&&card.tapped)throw new Error('This permanent is already tapped.');setTappedWithCapacity(player,card,action.tapped!==false);emit(game,{type:card.tapped?'tapped':'untapped',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:card.controllerId||player.playerId});
    }
    else if(action.type==='activate-mana'){
      const hit=locate(deck,action.instanceId);if(!hit||hit.z!=='battlefield')throw new Error('Mana source must be on the battlefield');if(hit.card.tapped)throw new Error('Mana source is already tapped');setTappedWithCapacity(player,hit.card,true);addMana(player,action.color,action.amount||1);emit(game,{type:'tapped',sourceId:hit.card.instanceId,definitionId:hit.card.definitionId,controllerId:player.playerId});
    }
    else if(action.type==='activate-ability'){
      // Legacy immediate-resolution path; mana abilities still intentionally use it because mana abilities do not use the stack.
      const hit=locate(deck,action.instanceId);if(!hit||hit.z!=='battlefield')throw new Error('Ability source must be on the battlefield');const card=hit.card;if(action.requiresTap){if(card.tapped)throw new Error('Ability source is already tapped');setTappedWithCapacity(player,card,true);emit(game,{type:'tapped',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId})}if(action.requiresUntap){if(!card.tapped)throw new Error('Ability source is not tapped');setTappedWithCapacity(player,card,false)}payMana(player,action.payment);if(action.lifeCost){if(player.life<action.lifeCost)throw new Error('Not enough life to pay this activation cost');player.life-=action.lifeCost}if(Array.isArray(action.costMoveIds))for(const id of action.costMoveIds){const mv=locate(deck,id);if(!mv)throw new Error('Chosen activation-cost card is unavailable');const [paid]=mv.a.splice(mv.i,1);paid.zone='graveyard';ownerFor(game,paid,player).deck.graveyard.push(paid);emit(game,{type:'discard',playerId:player.playerId,sourceId:paid.instanceId,definitionId:paid.definitionId,cost:true})}if(action.sacrificeSelf){const selfHit=locate(deck,action.instanceId);if(selfHit){const [sacrificed]=selfHit.a.splice(selfHit.i,1);sacrificed.zone='graveyard';const d=defFor(game,sacrificed);if(!sacrificed.token)ownerFor(game,sacrificed,player).deck.graveyard.push(sacrificed);emit(game,{type:'leaves-battlefield',sourceId:sacrificed.instanceId,definitionId:sacrificed.definitionId,controllerId:player.playerId,ownerId:sacrificed.ownerId,destination:'graveyard',typeLine:d?.typeLine||''});if(/Creature/i.test(d?.typeLine||''))emit(game,{type:'dies',sourceId:sacrificed.instanceId,definitionId:sacrificed.definitionId,controllerId:player.playerId,ownerId:sacrificed.ownerId,typeLine:d?.typeLine||'',token:!!sacrificed.token})}}applySearchResult(game,player,action);const effectNotes=applyTrackedEffects(game,player,action.effects||[],{...action.effectBindings,sourceId:action.instanceId});if(effectNotes.length)action.label=`${action.label||'Ability resolved.'} ${effectNotes.join(' ')}`;
    }
    else if(action.type==='guided-note'){game.guidedRules=game.guidedRules||[];game.guidedRules.push({text:action.note||'Guided Oracle effect',sourceId:action.sourceId||null,playerId:player.playerId,expires:action.expires||null,turn:game.turnNumber});action.label=action.label||`Guided effect tracked: ${action.note||'Oracle effect'}`}
    else if(action.type==='life'){const before=player.life;player.life=Math.max(0,player.life+action.delta);emit(game,{type:action.delta>=0?'life-gained':'life-lost',playerId:player.playerId,amount:Math.abs(player.life-before),controllerId:player.playerId})}
    else if(action.type==='poison')player.poison=Math.max(0,player.poison+action.delta);
    else if(action.type==='counter')player.counters[action.counter]=Math.max(0,Number(player.counters[action.counter]||0)+action.delta);
    else if(action.type==='card-counter'){const hit=locate(deck,action.instanceId);if(!hit)throw new Error('Card not found');hit.card.counters=hit.card.counters||{};hit.card.counters[action.counter]=Math.max(0,Number(hit.card.counters[action.counter]||0)+action.delta);emit(game,{type:'counter-added',targetId:hit.card.instanceId,controllerId:hit.card.controllerId||player.playerId,counter:action.counter,amount:action.delta})}
    else if(action.type==='status'){const set=new Set(player.statuses);action.enabled===false?set.delete(action.status):set.add(action.status);player.statuses=[...set]}
    else if(action.type==='mana-total'){player.mana.total[action.color]=Math.max(0,Number(player.mana.total[action.color]||0)+action.delta);player.mana.available[action.color]=Math.max(0,Number(player.mana.available[action.color]||0)+action.delta)}
    else if(action.type==='mana-available')player.mana.available[action.color]=Math.max(0,Number(player.mana.available[action.color]||0)+action.delta);
    else if(action.type==='cast-commander'){
      // Legacy immediate path. New UI may use cast-spell with commanderId.
      const cmd=player.commanders.find(c=>c.id===action.commanderId);if(!cmd)throw new Error('Commander not found');if(cmd.zone!=='command')throw new Error('Commander is not in the command zone');payMana(player,action.payment);cmd.castCount++;cmd.commanderTax=game.rulesConfig?.commanderTax===false?0:Math.max(0,cmd.castCount*2);cmd.zone='battlefield';cmd.commandZone=false;const cmdInst=deck.commandZone.find(x=>x.definitionId===cmd.cardId)||deck.commandZone[0];const hit=cmdInst?locate(deck,cmdInst.instanceId):null;if(hit){const [card]=hit.a.splice(hit.i,1);card.zone='battlefield';card.controllerId=player.playerId;card.enteredTurn=game.turnNumber;card.controlSinceTurn=game.turnNumber;deck.battlefield.push(card);emit(game,{type:'spell-cast',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,fromZone:'command'});emit(game,{type:'enters-battlefield',sourceId:card.instanceId,definitionId:card.definitionId,controllerId:player.playerId,ownerId:card.ownerId,typeLine:defFor(game,card)?.typeLine||''})}
    }
    else if(action.type==='commander-to-command'){const cmd=player.commanders.find(c=>c.id===action.commanderId);if(!cmd)throw new Error('Commander not found');const hit=locate(deck,action.instanceId);if(hit){const [card]=hit.a.splice(hit.i,1);card.zone='command';card.controllerId=player.playerId;deck.commandZone.push(card)}cmd.zone='command';cmd.commandZone=true}
    else if(action.type==='phase'){
      resetManaAtBoundary(game);if(action.phase==='postcombat-main')cleanupEndCombatEffects(game);game.phase=action.phase;configurePhaseGates(game,action.phase);if(action.phase==='upkeep')emit(game,{type:'upkeep',playerId:game.activePlayerId});if(action.phase==='end-step')emit(game,{type:'end-step',playerId:game.activePlayerId});if(action.phase==='begin-combat'||action.phase==='combat')emit(game,{type:'begin-combat',playerId:game.activePlayerId});
    }
    else if(action.type==='end-turn')advanceTurn(game);
    else if(action.type==='concede'){
      if(player.eliminated)throw new Error('This player has already left the game.');
      player.eliminated=true;player.eliminationReason='concession';player.concededAt=new Date().toISOString();
      game.log.unshift({text:`${player.displayName} concedes the game.`,turn:game.turnNumber,phase:game.phase,at:new Date().toISOString()});
    }
    else throw new Error(`Unsupported transaction ${action.type}`);

    sync(deck);event(game,action);const losses=evaluateLosses(game);
    if(action.type==='concede'){
      const alive=(game.players||[]).filter(p=>!p.eliminated);
      if((game.players||[]).length>1&&alive.length===1){game.winner=alive[0].playerId;game.result='winner';game.status='complete';game.completionReason='last-player-standing'}
      else if((game.players||[]).length>1&&alive.length===0){game.winner=null;game.result='draw';game.status='complete';game.completionReason='all-players-eliminated'}
    }for(const x of losses.newly||[]){const q=game.players.find(p=>p.playerId===x.playerId);game.log.unshift({text:`${q?.displayName||'A player'} loses the game (${x.reason}).`,turn:game.turnNumber,phase:game.phase,at:new Date().toISOString()})}
    if(game.status!=='complete'&&!game.winner&&game.players.find(p=>p.playerId===game.activePlayerId)?.eliminated){
      const currentIndex=Math.max(0,game.players.findIndex(p=>p.playerId===game.activePlayerId));
      let next=null;for(let step=1;step<=game.players.length;step++){const candidate=game.players[(currentIndex+step)%game.players.length];if(candidate&&!candidate.eliminated){next=candidate;break}}
      if(next){game.activePlayerId=next.playerId;game.turnNumber=Math.max(1,Number(game.turnNumber||1)+1);game.phase='untap';configurePhaseGates(game,'untap');game.log.unshift({text:`Turn passes to ${next.displayName} because the active player was eliminated.`,turn:game.turnNumber,phase:game.phase,at:new Date().toISOString()})}
    }
    game.undoHistory.push({action:structuredClone(action),before});if(game.status!=='complete'&&!game.winner)game.status='active';return game;
  }
  function preview(action){game.pendingTransaction={action:structuredClone(action),createdAt:new Date().toISOString()};return structuredClone(game.pendingTransaction)}
  function cancel(){game.pendingTransaction=null}
  function confirm(){if(!game.pendingTransaction)return false;const a=game.pendingTransaction.action;game.pendingTransaction=null;commit(a);return true}
  function undo(){const item=game.undoHistory.pop();if(!item)return false;const remaining=structuredClone(game.undoHistory);restore(game,item.before);game.undoHistory=remaining;game.pendingTransaction=null;return true}
  return {preview,cancel,confirm,commit,undo};
}

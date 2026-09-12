// Commander Companion V0.7.27 triggered-ability event bridge.
// Trigger detection is event driven; resolution uses the same shared effect engine as spells/activated abilities.
import { compileEffectText, applyEffects } from './effect-engine.js?v=0727';

function defFor(game,card){return card&&game.cardDefinitions?.[card.definitionId]}
function escRe(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function sourceRows(game,event){
  const rows=[];
  for(const p of game.players||[]){if(p.eliminated)continue;for(const c of p.deck?.battlefield||[])rows.push({player:p,card:c,definition:defFor(game,c),lastKnown:false})}
  // Last-known information for a source that just left the battlefield / died.
  if(event?.sourceId&&!rows.some(r=>r.card.instanceId===event.sourceId)){
    for(const p of game.players||[]){if(p.eliminated)continue;for(const zone of ['graveyard','exile','hand','commandZone']){
      const c=(p.deck?.[zone]||[]).find(x=>x.instanceId===event.sourceId);if(c){rows.push({player:p,card:c,definition:defFor(game,c),lastKnown:true});break}
    }}
  }
  return rows;
}
export function parseTriggeredAbilities(definition){
  const text=String(definition?.oracleText||'').replace(/\r/g,'');const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);const out=[];let current=null;
  const triggeredLine=line=>{const m=String(line).match(/(?:^|[—-]\s*)((?:When|Whenever|At)\b.*)$/i);return m?.[1]||null};
  for(const line of lines){
    const start=triggeredLine(line);
    if(start){if(current)out.push(current);current=start}
    else if(current&&(/^[•—-]/.test(line)||/^if\b/i.test(line)||/^you may\b/i.test(line))){current+=`\n${line}`}
    else if(current){out.push(current);current=null}
  }
  if(current)out.push(current);
  return out.map((line,index)=>{const comma=line.indexOf(',');const trigger=comma>=0?line.slice(0,comma).trim():line;const effect=comma>=0?line.slice(comma+1).trim():'';const modes=[...effect.matchAll(/(?:^|\n)•\s*([^\n]+)/g)].map(x=>x[1].trim());const uniquePerTurn=/choose one that (?:hasn[’']t|has not) been chosen this turn/i.test(effect);return{id:`trigger-${index}`,text:line,trigger,effect,modes,uniquePerTurn}});
}
function refersToSelf(trigger,definition){
  const name=String(definition?.name||'').split(' // ')[0];return /\bthis (?:creature|permanent|artifact|enchantment|land|planeswalker|card)\b/i.test(trigger)||(name&&new RegExp(`\\b${escRe(name)}\\b`,'i').test(trigger));
}
function typeMatches(typeLine,word){return new RegExp(`\\b${escRe(word)}\\b`,'i').test(typeLine||'')}
function eventSpellDef(game,event){return game.cardDefinitions?.[event?.definitionId]||null}
function isYourEvent(row,event){return event?.controllerId===row.player.playerId||event?.playerId===row.player.playerId}
function otherThanSource(row,event){return event?.sourceId!==row.card.instanceId}
function countForTurn(player,key){player.counters=player.counters||{};return Number(player.counters[key]||0)}
function triggerMatches(game,row,ability,event){
  const t=String(ability.trigger||''),d=row.definition;if(!event)return false;
  const self=refersToSelf(t,d),your=isYourEvent(row,event),typeLine=event.typeLine||eventSpellDef(game,event)?.typeLine||'';

  if(event.type==='enters-battlefield'){
    if(!/^(?:When|Whenever)\b/i.test(t)||!/(?:enters|enter)(?: the battlefield)?\b/i.test(t))return false;
    if(self)return row.card.instanceId===event.sourceId;
    if(/another creature (?:you control )?enters(?: the battlefield)?(?: under your control)?/i.test(t))return your&&otherThanSource(row,event)&&typeMatches(typeLine,'Creature');
    if(/another (?:artifact|enchantment|land|permanent) enters(?: the battlefield)? under your control/i.test(t)){const word=(t.match(/another (artifact|enchantment|land|permanent)/i)||[])[1];return your&&otherThanSource(row,event)&&typeMatches(typeLine,word)}
    if(/a creature enters(?: the battlefield)? under your control/i.test(t)||/one or more creatures enter(?: the battlefield)? under your control/i.test(t))return your&&typeMatches(typeLine,'Creature');
    if(/a land enters(?: the battlefield)? under your control/i.test(t)||/landfall/i.test(t))return your&&typeMatches(typeLine,'Land');
    if(/an artifact enters(?: the battlefield)? under your control/i.test(t))return your&&typeMatches(typeLine,'Artifact');
    if(/an enchantment enters(?: the battlefield)? under your control/i.test(t))return your&&typeMatches(typeLine,'Enchantment');
    if(/a permanent enters(?: the battlefield)? under your control/i.test(t))return your;
    if(/a creature enters(?: the battlefield)?/i.test(t))return typeMatches(typeLine,'Creature');
    if(/a land enters(?: the battlefield)?/i.test(t))return typeMatches(typeLine,'Land');
    if(/a permanent enters(?: the battlefield)?/i.test(t))return true;
  }
  if(event.type==='leaves-battlefield'){
    if(!/^(?:When|Whenever).*(?:leaves|leave) the battlefield/i.test(t))return false;if(self)return row.card.instanceId===event.sourceId;if(/another .* you control/i.test(t))return your&&otherThanSource(row,event);if(/you control/i.test(t))return your;return true;
  }
  if(event.type==='dies'){
    if(!/^(?:When|Whenever).*\bdies\b/i.test(t))return false;if(self)return row.card.instanceId===event.sourceId;if(/another creature you control dies/i.test(t))return your&&otherThanSource(row,event)&&typeMatches(typeLine,'Creature');if(/a creature you control dies/i.test(t)||/one or more creatures you control die/i.test(t))return your&&typeMatches(typeLine,'Creature');if(/a creature dies/i.test(t))return typeMatches(typeLine,'Creature');
  }
  if(event.type==='spell-cast'){
    if(!/^(?:When|Whenever).*\bcast\b/i.test(t))return false;const spell=eventSpellDef(game,event),st=spell?.typeLine||'';
    if(/you cast/i.test(t)&&!your)return false;if(/an opponent casts/i.test(t)&&event.controllerId===row.player.playerId)return false;
    if(/creature spell/i.test(t)&&!typeMatches(st,'Creature'))return false;if(/artifact spell/i.test(t)&&!typeMatches(st,'Artifact'))return false;if(/instant or sorcery spell/i.test(t)&&!/(Instant|Sorcery)/i.test(st))return false;if(/noncreature spell/i.test(t)&&typeMatches(st,'Creature'))return false;
    return /(?:spell|cast)/i.test(t);
  }
  if(event.type==='attackers-declared'){
    if(/^(?:When|Whenever) one or more creatures you control attack/i.test(t))return event.controllerId===row.player.playerId&&(event.attackers||[]).length>0;
    if(/^Whenever you attack/i.test(t))return event.controllerId===row.player.playerId&&(event.attackers||[]).length>0;
  }
  if(event.type==='attacks'){
    if(!/^(?:When|Whenever).*\battacks\b/i.test(t))return false;if(self)return row.card.instanceId===event.sourceId;if(/another creature you control attacks/i.test(t))return your&&otherThanSource(row,event);if(/a creature you control attacks/i.test(t))return your;return false;
  }
  if(event.type==='blocks'){
    if(!/^(?:When|Whenever).*(?:blocks|becomes blocked)/i.test(t))return false;if(/becomes blocked/i.test(t)&&self)return row.card.instanceId===event.attackerId;if(/blocks/i.test(t)&&self)return row.card.instanceId===event.blockerId;if(/a creature you control blocks/i.test(t))return event.controllerId===row.player.playerId;return false;
  }
  if(event.type==='combat-damage-player'){
    if(/deals combat damage to (?:a player|an opponent)/i.test(t)){if(self)return row.card.instanceId===event.sourceId;if(/a creature you control/i.test(t))return event.controllerId===row.player.playerId}
    if(/one or more creatures you control deal combat damage to a player/i.test(t))return event.controllerId===row.player.playerId;
  }
  if(event.type==='damage-player'){
    if(/deals damage to (?:a player|an opponent)/i.test(t)&&self)return row.card.instanceId===event.sourceId;
  }
  if(event.type==='draw'){
    if(!/^(?:When|Whenever).*\bdraw\b/i.test(t))return false;if(/you draw/i.test(t)&&event.playerId!==row.player.playerId)return false;if(/an opponent draws/i.test(t)&&event.playerId===row.player.playerId)return false;
    if(/your second card each turn/i.test(t))return event.playerId===row.player.playerId&&Number(event.drawNumberThisTurn||0)===2;
    if(/your first card each turn/i.test(t))return event.playerId===row.player.playerId&&Number(event.drawNumberThisTurn||0)===1;
    return true;
  }
  if(event.type==='discard'){
    if(!/^(?:When|Whenever).*\bdiscard/i.test(t))return false;if(/you discard/i.test(t))return event.playerId===row.player.playerId;if(/an opponent discards/i.test(t))return event.playerId!==row.player.playerId;return true;
  }
  if(event.type==='life-gained'){
    if(!/^(?:When|Whenever).*(?:gain|gains) life/i.test(t))return false;if(/you gain/i.test(t))return event.playerId===row.player.playerId;if(/an opponent gains/i.test(t))return event.playerId!==row.player.playerId;return true;
  }
  if(event.type==='life-lost'){
    if(!/^(?:When|Whenever).*(?:lose|loses) life/i.test(t))return false;if(/you lose/i.test(t))return event.playerId===row.player.playerId;if(/an opponent loses/i.test(t))return event.playerId!==row.player.playerId;return true;
  }
  if(event.type==='counter-added'){
    if(!/^(?:When|Whenever).*counter/i.test(t))return false;if(self)return row.card.instanceId===event.targetId;if(/creature you control/i.test(t)){const hit=(game.players||[]).flatMap(p=>p.deck?.battlefield||[]).find(c=>c.instanceId===event.targetId);return hit?.controllerId===row.player.playerId}return false;
  }
  if(event.type==='token-created'){
    if(!/^(?:When|Whenever).*(?:create|creates).*token/i.test(t))return false;if(/you create/i.test(t))return event.controllerId===row.player.playerId;return true;
  }
  if(event.type==='tapped'){
    if(!/^(?:When|Whenever).*(?:becomes tapped|is tapped)/i.test(t))return false;if(self)return row.card.instanceId===event.sourceId;if(/permanent you control/i.test(t))return event.controllerId===row.player.playerId;return false;
  }
  if(event.type==='upkeep'){
    if(/^At the beginning of your upkeep/i.test(t))return event.playerId===row.player.playerId;if(/^At the beginning of each player'?s upkeep/i.test(t))return true;if(/^At the beginning of (?:an|each) opponent'?s upkeep/i.test(t))return event.playerId!==row.player.playerId;
  }
  if(event.type==='end-combat'){
    if(/^At (?:the beginning of )?end of combat/i.test(t)||/^At the beginning of the end of combat step/i.test(t))return true;
  }
  if(event.type==='end-step'){
    if(/^At the beginning of your end step/i.test(t))return event.playerId===row.player.playerId;if(/^At the beginning of each end step/i.test(t))return true;if(/^At the beginning of (?:an|each) opponent'?s end step/i.test(t))return event.playerId!==row.player.playerId;
  }
  if(event.type==='begin-combat'){
    if(/^At the beginning of combat on your turn/i.test(t)||/^At the beginning of your combat/i.test(t))return event.playerId===row.player.playerId;if(/^At the beginning of combat/i.test(t))return true;
  }
  return false;
}
export function collectTriggers(game,event){
  const out=[];const seen=new Set();
  for(const row of sourceRows(game,event))for(const ability of parseTriggeredAbilities(row.definition)){
    if(!triggerMatches(game,row,ability,event))continue;const key=`${row.card.instanceId}:${ability.id}:${event.type}:${event.batchId||event.sourceId||event.playerId||''}`;if(seen.has(key))continue;seen.add(key);
    const compiled=ability.modes?.length?{supported:true,effects:[],requirements:[],unsupported:[]}:compileEffectText(ability.effect,{sourceName:row.definition?.name||'Triggered ability'});
    out.push({id:`trigger:${Date.now()}:${Math.random()}`,controllerId:row.player.playerId,sourceId:row.card.instanceId,sourceDefinitionId:row.card.definitionId,sourceName:row.definition?.name||'Card',abilityId:ability.id,abilityText:ability.text,effectText:ability.effect,modal:ability.modes?.length?{modes:ability.modes,uniquePerTurn:!!ability.uniquePerTurn}:null,compiled,event:structuredClone(event),createdAt:new Date().toISOString()});
  }
  return out;
}
export function orderTriggersAPNAP(game,rows=[]){
  const seats=game?.players||[],alive=seats.filter(p=>!p.eliminated).map(p=>p.playerId);
  if(!alive.length)return [];
  const activeIndex=Math.max(0,alive.indexOf(game.activePlayerId));
  const controllerOrder=[...alive.slice(activeIndex),...alive.slice(0,activeIndex)];
  const rank=new Map(controllerOrder.map((id,i)=>[id,i]));
  return rows.map((row,index)=>({row,index})).filter(x=>rank.has(x.row.controllerId)).sort((a,b)=>(rank.get(a.row.controllerId)-rank.get(b.row.controllerId))||(a.index-b.index)).map(x=>x.row);
}
export function queueTriggers(game,event){
  const collected=collectTriggers(game,event);if(!collected.length)return collected;
  const batchId=`trigger-batch:${Date.now()}:${Math.random()}`,ordered=orderTriggersAPNAP(game,collected);
  const perController=new Map();
  ordered.forEach((row,index)=>{const count=Number(perController.get(row.controllerId)||0);row.simultaneousBatchId=batchId;row.simultaneousTriggerId=`${batchId}:${index}`;row.controllerOrderIndex=count;row.stackOrderChosen=false;perController.set(row.controllerId,count+1)});
  game.pendingTriggers=game.pendingTriggers||[];game.pendingTriggers.push(...ordered);return ordered;
}
export function resolveTrigger(game,trigger,bindings={}){
  if(!trigger?.compiled?.supported)throw new Error(`Unsupported trigger effect on ${trigger?.sourceName||'card'}: ${(trigger?.compiled?.unsupported||[]).join(' | ')}`);
  const notes=applyEffects(game,trigger.controllerId,trigger.compiled.effects,{...bindings,sourceId:trigger.sourceId,onEvent:e=>queueTriggers(game,e)});game.log?.unshift?.({text:`${trigger.sourceName} trigger resolves. ${notes.join(' ')}`,turn:game.turnNumber,at:new Date().toISOString()});return notes;
}
export function auditTriggers(definition){return parseTriggeredAbilities(definition).map(a=>{if(a.modes?.length)return{...a,supported:true,unsupported:[],effectKinds:['modal-trigger']};const compiled=compileEffectText(a.effect,{sourceName:definition?.name||'Card'});return{...a,supported:compiled.supported,unsupported:compiled.unsupported,effectKinds:[...new Set(compiled.effects.map(x=>x.kind))]}})}

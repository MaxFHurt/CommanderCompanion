import { evaluateLosses } from './rules-v0725.js?v=0727';

const numStat=v=>{const m=String(v??'').match(/-?\d+/);return m?Number(m[0]):0};
function tempEffects(card,kind){return (card?.temporaryEffects||[]).filter(e=>e?.kind===kind&&e?.enabled!==false)}
function temporaryPt(card,key){return tempEffects(card,'pt').reduce((n,e)=>n+Number(e?.[key]||0),0)}
function controllerOf(game,card){return game?.players?.find(p=>p.playerId===card?.controllerId)||game?.players?.find(p=>(p.deck?.battlefield||[]).some(c=>c.instanceId===card?.instanceId))||null}
function definition(game,card){return card&&game?.cardDefinitions?.[card.definitionId]}
function typeHas(def,word){return new RegExp(`\\b${String(word).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(def?.typeLine||'')}
function subtypeMatch(def,phrase){
  const s=String(phrase||'').trim();if(!s)return true;
  if(/artifact creatures?/i.test(s))return typeHas(def,'Artifact')&&typeHas(def,'Creature');
  if(/token creatures?/i.test(s))return typeHas(def,'Creature');
  if(/^creatures?$/i.test(s))return typeHas(def,'Creature');
  const clean=s.replace(/^(?:other\s+)?/i,'').replace(/\s+creatures?$/i,'').trim();
  return typeHas(def,'Creature')&&(!clean||new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(def?.typeLine||''));
}
function continuousPtBonus(game,card){
  if(!game||!card)return{power:0,toughness:0};const targetController=card.controllerId;let power=0,toughness=0;
  for(const p of game.players||[])for(const source of p.deck?.battlefield||[]){
    if(source.controllerId!==targetController)continue;const sd=definition(game,source),text=String(sd?.oracleText||'');
    for(const line of text.split('\n')){
      let m=line.match(/^(Other\s+)?(.+?creatures?) you control get ([+-]\d+)\/([+-]\d+)(?:\.|$)/i);
      if(!m)continue;if(m[1]&&source.instanceId===card.instanceId)continue;if(!subtypeMatch(definition(game,card),m[2]))continue;power+=Number(m[3]);toughness+=Number(m[4]);
    }
  }
  return{power,toughness};
}
function selfScalingPt(game,card,def){
  const text=String(def?.oracleText||'');let power=0,toughness=0,m;
  // Common Commander patterns: "gets +1/+1 for each ... you control".
  for(const row of text.matchAll(/gets ([+-]\d+)\/([+-]\d+) for each (creature|artifact|enchantment|land|permanent) you control/ig)){
    const p=controllerOf(game,card);if(!p)continue;const n=(p.deck?.battlefield||[]).filter(c=>{const d=definition(game,c);return row[3].toLowerCase()==='permanent'||typeHas(d,row[3])}).length;power+=Number(row[1])*n;toughness+=Number(row[2])*n;
  }
  if((m=text.match(/gets ([+-]\d+)\/([+-]\d+) for each card in your graveyard/i))){const p=controllerOf(game,card);const n=p?.deck?.graveyard?.length||0;power+=Number(m[1])*n;toughness+=Number(m[2])*n}
  return{power,toughness};
}
export function effectivePower(card,def,game=null){
  const anthem=continuousPtBonus(game,card),self=selfScalingPt(game,card,def);
  return Math.max(0,numStat(def?.power)+Number(card?.counters?.['+1/+1']||0)-Number(card?.counters?.['-1/-1']||0)+temporaryPt(card,'power')+anthem.power+self.power);
}
export function effectiveToughness(card,def,game=null){
  const anthem=continuousPtBonus(game,card),self=selfScalingPt(game,card,def);
  return numStat(def?.toughness)+Number(card?.counters?.['+1/+1']||0)-Number(card?.counters?.['-1/-1']||0)+temporaryPt(card,'toughness')+anthem.toughness+self.toughness;
}
export function cardHasKeyword(card,def,name,game=null){
  const n=String(name||''),low=n.toLowerCase();
  if((def?.keywords||[]).some(x=>String(x).toLowerCase()===low))return true;
  if(new RegExp(`\\b${n.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}\\b`,'i').test(String(def?.oracleText||'')))return true;
  if(tempEffects(card,'keyword').some(e=>String(e.keyword||'').toLowerCase()===low))return true;
  if(game&&card){const targetController=card.controllerId;for(const p of game.players||[])for(const source of p.deck?.battlefield||[]){if(source.controllerId!==targetController)continue;const sd=definition(game,source);for(const line of String(sd?.oracleText||'').split('\n')){const m=line.match(/^(Other\s+)?(.+?creatures?) you control (?:have|gain) ([A-Za-z][A-Za-z -]+)(?:\.|$)/i);if(!m)continue;if(m[1]&&source.instanceId===card.instanceId)continue;if(!subtypeMatch(def,m[2]))continue;const kws=m[3].split(/,| and /).map(x=>x.trim().toLowerCase());if(kws.includes(low))return true}}}
  return false;
}
const kw=(card,def,k,game)=>cardHasKeyword(card,def,k,game);
function locatePlayer(game,id){return game.players.find(p=>p.playerId===id)}
function locateCard(player,id){return player?.deck?.battlefield?.find(c=>c.instanceId===id)||null}
function commanderFor(player,card){return player?.commanders?.find(c=>c.cardId===card?.definitionId&&c.zone==='battlefield')||null}
function toxicValue(def){const ms=[...String(def?.oracleText||'').matchAll(/\bToxic\s+(\d+)\b/ig)];return ms.reduce((n,m)=>n+Number(m[1]||0),0)}
function isIndestructible(card,def,game){return kw(card,def,'Indestructible',game)}
function isDeathtouch(card,def,game){return kw(card,def,'Deathtouch',game)}
function isLifelink(card,def,game){return kw(card,def,'Lifelink',game)}
function isInfect(card,def,game){return kw(card,def,'Infect',game)}
function isWither(card,def,game){return kw(card,def,'Wither',game)}
function isTrample(card,def,game){return kw(card,def,'Trample',game)}
function hasFirst(card,def,game){return kw(card,def,'First strike',game)}
function hasDouble(card,def,game){return kw(card,def,'Double strike',game)}
function dealsInStep(card,def,step,game){return step==='first'?(hasFirst(card,def,game)||hasDouble(card,def,game)):(!hasFirst(card,def,game)||hasDouble(card,def,game))}
function lethalFor(blocker,bdef,source,sourceDef,game){return isDeathtouch(source,sourceDef,game)?1:Math.max(0,effectiveToughness(blocker,bdef,game)-Number(blocker?.damageMarked||0))}
function queueCreatureDamage(queue,sourcePlayer,source,sourceDef,targetPlayer,target,targetDef,amount){if(amount>0)queue.push({kind:'creature',sourcePlayer,source,sourceDef,targetPlayer,target,targetDef,amount})}
function queuePlayerDamage(queue,sourcePlayer,source,sourceDef,targetPlayer,amount){if(amount>0)queue.push({kind:'player',sourcePlayer,source,sourceDef,targetPlayer,amount})}
function smartAttackerAssignment({power,blockers,game,source,sourceDef,trample}){
  const out=[];let remaining=power;
  if(trample){for(const b of blockers){const bd=definition(game,b.card),need=Math.min(remaining,lethalFor(b.card,bd,source,sourceDef,game));out.push({blockerId:b.card.instanceId,amount:need});remaining-=need}return {blockers:out,target:Math.max(0,remaining)}}
  if(blockers.length){for(const b of blockers){if(remaining<=0)break;const bd=definition(game,b.card),need=Math.min(remaining,Math.max(1,lethalFor(b.card,bd,source,sourceDef,game)));out.push({blockerId:b.card.instanceId,amount:need});remaining-=need}if(remaining>0){const last=out[out.length-1];if(last)last.amount+=remaining}}
  return {blockers:out,target:0};
}
function emit(onEvent,e){try{onEvent?.(e)}catch(err){console.error('Combat event bridge failed',err)}}
function combatDamageAfterPrevention(game,targetId,amount){let left=Math.max(0,Number(amount||0));for(const shield of game.damagePrevention||[]){if(left<=0)break;if(shield.targetId!==targetId||Number(shield.amount||0)<=0)continue;const used=Math.min(left,Number(shield.amount||0));shield.amount-=used;left-=used}game.damagePrevention=(game.damagePrevention||[]).filter(s=>Number(s.amount||0)>0);return left}
function applyQueue(game,queue,events,onEvent){
  for(const hit of queue){const {sourcePlayer,source,sourceDef}=hit;const targetId=hit.kind==='player'?hit.targetPlayer.playerId:hit.target.instanceId;const original=Number(hit.amount||0),amount=combatDamageAfterPrevention(game,targetId,original),prevented=original-amount;if(hit.kind==='player'){
    const target=hit.targetPlayer;
    if(amount>0&&isInfect(source,sourceDef,game)){target.poison=Math.max(0,Number(target.poison||0)+amount);events.push(`${target.displayName} gets ${amount} poison counter${amount===1?'':'s'} from ${sourceDef?.name||'an attacker'}.`)}
    else if(amount>0){target.life=Math.max(0,Number(target.life||0)-amount);events.push(`${target.displayName} takes ${amount} combat damage from ${sourceDef?.name||'an attacker'}.`)}
    if(prevented)events.push(`${prevented} combat damage to ${target.displayName} is prevented.`);
    const tox=amount>0?toxicValue(sourceDef):0;if(tox>0){target.poison=Math.max(0,Number(target.poison||0)+tox);events.push(`${target.displayName} gets ${tox} poison counter${tox===1?'':'s'} from toxic.`)}
    const cmd=commanderFor(sourcePlayer,source);if(amount>0&&cmd&&game.rulesConfig?.commanderDamage!==false&&!isInfect(source,sourceDef,game)){target.commanderDamage=target.commanderDamage||{};target.commanderDamage[cmd.id]=Number(target.commanderDamage[cmd.id]||0)+amount;events.push(`${target.displayName} has taken ${target.commanderDamage[cmd.id]} commander damage from ${sourceDef?.name||'that commander'}.`)}
    sourcePlayer.counters=sourcePlayer.counters||{};sourcePlayer.counters.damageDealt=Number(sourcePlayer.counters.damageDealt||0)+amount;
    if(amount>0&&isLifelink(source,sourceDef,game)){sourcePlayer.life=Math.max(0,Number(sourcePlayer.life||0)+amount);emit(onEvent,{type:'life-gained',playerId:sourcePlayer.playerId,amount,sourceId:source.instanceId,controllerId:sourcePlayer.playerId})}
    if(amount>0)emit(onEvent,{type:'combat-damage-player',sourceId:source.instanceId,definitionId:source.definitionId,controllerId:sourcePlayer.playerId,playerId:target.playerId,amount});
  }else{
    const target=hit.target;if(amount>0&&(isInfect(source,sourceDef,game)||isWither(source,sourceDef,game))){target.counters=target.counters||{};target.counters['-1/-1']=Number(target.counters['-1/-1']||0)+amount}else if(amount>0)target.damageMarked=Number(target.damageMarked||0)+amount;
    if(amount>0&&isDeathtouch(source,sourceDef,game))target.deathtouchDamage=true;if(prevented)events.push(`${prevented} combat damage to ${definition(game,target)?.name||'a creature'} is prevented.`);
    if(amount>0&&isLifelink(source,sourceDef,game)){sourcePlayer.life=Math.max(0,Number(sourcePlayer.life||0)+amount);emit(onEvent,{type:'life-gained',playerId:sourcePlayer.playerId,amount,sourceId:source.instanceId,controllerId:sourcePlayer.playerId})}
    if(amount>0)emit(onEvent,{type:'combat-damage-creature',sourceId:source.instanceId,definitionId:source.definitionId,controllerId:sourcePlayer.playerId,targetId:target.instanceId,amount});
  }}
}
function stateBasedDeaths(game,events,onEvent){
  // Repeat because one death can change anthem effects and make another creature lethal.
  let changed=true,guard=0;while(changed&&guard++<20){changed=false;for(const p of game.players){const bf=p.deck?.battlefield||[];for(let i=bf.length-1;i>=0;i--){const c=bf[i],d=definition(game,c);if(!/Creature/i.test(d?.typeLine||''))continue;const t=effectiveToughness(c,d,game),lethal=t<=0||Number(c.damageMarked||0)>=t||!!c.deathtouchDamage;if(!lethal)continue;if(t>0&&isIndestructible(c,d,game))continue;bf.splice(i,1);c.zone='graveyard';c.tapped=false;c.damageMarked=0;c.deathtouchDamage=false;const owner=game.players.find(x=>x.playerId===c.ownerId)||p;if(!c.token)owner.deck.graveyard.push(c);events.push(`${d?.name||'A creature'} dies${c.token?' and the token ceases to exist':` and is put into ${owner.displayName}'s graveyard`}.`);emit(onEvent,{type:'dies',sourceId:c.instanceId,definitionId:c.definitionId,controllerId:p.playerId,ownerId:c.ownerId,typeLine:d?.typeLine||'',token:!!c.token});emit(onEvent,{type:'leaves-battlefield',sourceId:c.instanceId,definitionId:c.definitionId,controllerId:p.playerId,ownerId:c.ownerId,destination:'graveyard',typeLine:d?.typeLine||''});changed=true}}}
}
function resolveStep(game,cs,step,events,onEvent){
  const queue=[];
  for(const a of cs.attackers){const attackerPlayer=locatePlayer(game,a.playerId),defender=locatePlayer(game,a.defenderId),attacker=locateCard(attackerPlayer,a.instanceId);if(!attacker||!defender)continue;const ad=definition(game,attacker);const assignments=cs.blocks?.[defender.playerId]?.assignments?.filter(x=>x.attackerId===a.instanceId)||[];const blockerRows=assignments.map(x=>({assignment:x,card:locateCard(defender,x.blockerId)})).filter(x=>x.card);const blockedEver=assignments.length>0||a.blocked===true;
    if(dealsInStep(attacker,ad,step,game)){
      const power=effectivePower(attacker,ad,game);if(!blockedEver)queuePlayerDamage(queue,attackerPlayer,attacker,ad,defender,power);else if(blockerRows.length){const trample=isTrample(attacker,ad,game);const plan=(a.damageAssignments?.[step])||smartAttackerAssignment({power,blockers:blockerRows,game,source:attacker,sourceDef:ad,trample});let assigned=0;for(const part of plan.blockers||[]){const row=blockerRows.find(x=>x.card.instanceId===part.blockerId);if(!row)continue;const amt=Math.max(0,Math.min(power-assigned,Number(part.amount||0)));assigned+=amt;queueCreatureDamage(queue,attackerPlayer,attacker,ad,defender,row.card,definition(game,row.card),amt)}if(trample){const spill=Math.max(0,Math.min(power-assigned,Number(plan.target??(power-assigned))));queuePlayerDamage(queue,attackerPlayer,attacker,ad,defender,spill)}}else if(isTrample(attacker,ad,game))queuePlayerDamage(queue,attackerPlayer,attacker,ad,defender,power)
    }
    for(const row of blockerRows){const bd=definition(game,row.card);if(dealsInStep(row.card,bd,step,game))queueCreatureDamage(queue,defender,row.card,bd,attackerPlayer,attacker,ad,effectivePower(row.card,bd,game))}
  }
  applyQueue(game,queue,events,onEvent);stateBasedDeaths(game,events,onEvent);
}
export function resolveCombat(game,{attackerPlayerId=null,onEvent=null}={}){
  const cs=game.combatState;if(!cs||!Array.isArray(cs.attackers))throw new Error('No combat state is available.');const events=[];
  if(!cs.attackers.length){cs.resolved=true;cs.waitingFor=null;return {events,damage:[]}}
  const ap=attackerPlayerId||cs.attackers[0]?.playerId;
  for(const a of cs.attackers){const defender=locatePlayer(game,a.defenderId);const assignments=cs.blocks?.[a.defenderId]?.assignments?.filter(x=>x.attackerId===a.instanceId)||[];const source=locateCard(locatePlayer(game,a.playerId),a.instanceId),sd=definition(game,source);for(const x of assignments){const bc=locateCard(defender,x.blockerId),bd=definition(game,bc);if(bc)events.push(`${defender.displayName} blocks ${sd?.name||'an attacker'} with ${bd?.name||'a creature'}.`)}}
  resolveStep(game,cs,'first',events,onEvent);resolveStep(game,cs,'normal',events,onEvent);
  cs.damage=cs.damage||[];cs.damage.push({resolvedAt:new Date().toISOString(),attackerPlayerId:ap});cs.waitingFor=null;cs.resolved=true;game.phase='end-combat';
  const losses=evaluateLosses(game);for(const x of losses.newly||[]){const q=game.players.find(p=>p.playerId===x.playerId);events.push(`${q?.displayName||'A player'} loses the game (${x.reason}).`)}
  return {events,damage:cs.damage,losses};
}
export function clearMarkedDamage(game){for(const p of game.players||[])for(const c of p.deck?.battlefield||[]){c.damageMarked=0;c.deathtouchDamage=false}}

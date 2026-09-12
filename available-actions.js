import { validatePlay, validateAttack, validateBlock, availableActivatedAbilities, validateActivatedAbilityFull } from './rules-v0725.js?v=0729';

const defOf=(game,c)=>game?.cardDefinitions?.[c?.definitionId||c?.cardId]||null;
const defsMap=game=>new Map(Object.entries(game?.cardDefinitions||{}));
const mainPhase=p=>['precombat-main','postcombat-main'].includes(p);
const attackPhase=p=>['begin-combat','combat','declare-attackers'].includes(p);

const responseEligibleDefinition=d=>/\bInstant\b/i.test(d?.typeLine||'')||/\bFlash\b/i.test(d?.oracleText||'');
function priorityActions(game,player){
  const ps=game?.priorityState;if(!ps?.active||ps.holderId!==player?.playerId)return [];
  const defs=defsMap(game),out=[],gravePermission=(player.temporaryPermissions||[]).some(x=>x?.kind==='cast-from-zone'&&x?.zone==='graveyard');
  for(const c of [...(player.deck?.hand||[]),...(gravePermission?(player.deck?.graveyard||[]):[])]){
    const d=defOf(game,c);if(!d||!responseEligibleDefinition(d))continue;
    const result=validatePlay({game,player,definition:d,instance:c,kind:'cast',definitions:defs});
    if(result?.legal)out.push(action('response',`Cast ${d.name} in response`,{card:d.name,instanceId:c.instanceId,reason:`You currently hold priority${ps.reason?` — ${ps.reason}`:''}.`}));
  }
  for(const c of player.deck?.battlefield||[]){
    const d=defOf(game,c);if(!d)continue;
    for(const row of availableActivatedAbilities({game,instance:c,definition:d})||[]){
      if(!row?.legal||row.ability?.manaAbility)continue;
      const full=validateActivatedAbilityFull({game,player,instance:c,definition:d,ability:row.ability,definitions:defs});
      if(full?.legal)out.push(action('response-ability',`Activate ${d.name} in response`,{card:d.name,instanceId:c.instanceId,abilityId:row.ability?.id,reason:'This non-mana activated ability is legal while you hold priority.'}));
    }
  }
  out.push(action('pass-priority','Pass priority',{reason:out.length?'You may decline to respond.':'No legal response is available; passing priority is the legal progression.'}));
  return out;
}
function commanderActions(game,player){
  if(!mainPhase(game?.phase)||game?.stack?.length||game?.priorityState?.active)return [];
  const defs=defsMap(game),out=[];
  for(const cmd of player?.commanders||[]){
    if(cmd?.zone!=='command')continue;
    const c=(player.deck?.commandZone||[]).find(x=>x.instanceId===cmd.instanceId||x.definitionId===cmd.cardId);
    const d=defOf(game,c)||game.cardDefinitions?.[cmd.cardId];if(!c||!d)continue;
    const result=validatePlay({game,player,definition:d,instance:c,kind:'cast',commander:cmd,definitions:defs});
    if(result?.legal)out.push(action('commander',`Cast commander ${d.name}`,{card:d.name,instanceId:c.instanceId,reason:`Legal from the command zone${Number(cmd.commanderTax||0)>0?` with ${Number(cmd.commanderTax||0)} commander tax`:''}.`}));
  }
  return out;
}

function action(type,label,extra={}){return {type,label,...extra}}

function requiredProgression(game,player){
  const out=[];
  switch(game?.phase){
    case'untap':{
      const tapped=(player?.deck?.battlefield||[]).filter(c=>c.tapped).length;
      out.push(action('required',tapped?'Untap your permanents':'Advance to Upkeep',{reason:tapped?'Untap is required before upkeep.':'No tracked permanents remain tapped.'}));
      break;
    }
    case'draw':
      out.push(action('required',player?.confirmations?.draw?'Advance to Main Phase':'Complete your required draw',{reason:player?.confirmations?.draw?'The tracked draw is complete.':'The draw confirmation is still required.'}));
      break;
    case'declare-blockers':
      out.push(action('required','Complete blocker declaration',{reason:'Combat cannot advance until required defender decisions are complete.'}));
      break;
    case'combat-damage':
      out.push(action('required','Resolve combat damage',{reason:'Attackers and blockers have already been declared.'}));
      break;
    case'cleanup':
      out.push(action('required','Complete cleanup and end the turn',{reason:'Hand-size and end-of-turn cleanup must finish first.'}));
      break;
  }
  return out;
}

function handActions(game,player){
  if(!game||!player||player.deck?.sourceType==='network-public')return [];
  const defs=defsMap(game),out=[];
  for(const c of player.deck?.hand||[]){
    const d=defOf(game,c); if(!d)continue;
    const kind=/\bLand\b/i.test(d.typeLine||'')?'land':'cast';
    const result=validatePlay({game,player,definition:d,instance:c,kind,definitions:defs});
    if(result?.legal)out.push(action(kind,`${kind==='land'?'Play':'Cast'} ${d.name}`,{card:d.name,instanceId:c.instanceId,reason:'Legal under current timing, zone, identity, and mana checks.'}));
  }
  return out;
}

function abilityActions(game,player){
  if(!game||!player)return [];
  const defs=defsMap(game),out=[];
  for(const c of player.deck?.battlefield||[]){
    const d=defOf(game,c); if(!d)continue;
    for(const row of availableActivatedAbilities({game,instance:c,definition:d})||[]){
      if(!row?.legal)continue;
      const full=validateActivatedAbilityFull({game,player,instance:c,definition:d,ability:row.ability,definitions:defs});
      if(full?.legal)out.push(action('ability',`Activate ${d.name}`,{card:d.name,instanceId:c.instanceId,abilityId:row.ability?.id,reason:'This activated ability is legal in the current tracked state.'}));
    }
  }
  return out;
}

function attackActions(game,player){
  if(!attackPhase(game?.phase)||!game||!player)return [];
  const defenders=(game.players||[]).filter(x=>x.playerId!==player.playerId&&!x.eliminated);
  if(!defenders.length)return [];
  const out=[];
  for(const c of player.deck?.battlefield||[]){
    const d=defOf(game,c); if(!d)continue;
    const legalDefenders=defenders.filter(def=>validateAttack({game,attackerId:player.playerId,defenderId:def.playerId,instance:c,definition:d})?.legal);
    if(legalDefenders.length)out.push(action('attack',`Attack with ${d.name}`,{card:d.name,instanceId:c.instanceId,targets:legalDefenders.map(x=>({playerId:x.playerId,name:x.displayName})),reason:'This creature is currently a legal attacker.'}));
  }
  return out;
}

function blockActions(game,player){
  if(game?.phase!=='declare-blockers'||!game||!player)return [];
  const attacks=(game.combatState?.attackers||[]).filter(a=>a.defenderId===player.playerId);
  if(!attacks.length)return [];
  const out=[];
  for(const blocker of player.deck?.battlefield||[]){
    const bd=defOf(game,blocker); if(!bd)continue;
    const legalTargets=[];
    for(const atk of attacks){
      const owner=(game.players||[]).find(p=>(p.deck?.battlefield||[]).some(c=>c.instanceId===atk.instanceId));
      const inst=owner?.deck?.battlefield?.find(c=>c.instanceId===atk.instanceId);
      const ad=defOf(game,inst);
      if(inst&&validateBlock({blocker,definition:bd,attackerDefinition:ad,attacker:inst})?.legal)legalTargets.push({instanceId:inst.instanceId,name:ad?.name||'Attacker'});
    }
    if(legalTargets.length)out.push(action('block',`Block with ${bd.name}`,{card:bd.name,instanceId:blocker.instanceId,targets:legalTargets,reason:'This creature can legally block at least one current attacker.'}));
  }
  return out;
}

export function getAvailableActions({game,player}={}){
  if(!game||!player)return {groups:[],actions:[],count:0,hiddenSafe:true,state:'setup'};
  if(game.priorityState?.active){
    if(game.priorityState.holderId===player.playerId){
      const responses=priorityActions(game,player);
      return {groups:[{key:'priority',label:'PRIORITY / RESPONSES',actions:responses}],actions:responses,count:responses.filter(x=>x.type!=='pass-priority').length,hiddenSafe:true,state:'priority'};
    }
    const holder=game.players?.find(x=>x.playerId===game.priorityState.holderId);
    return {groups:[{key:'waiting',label:'WAITING FOR PRIORITY',actions:[action('wait',`Wait for ${holder?.displayName||'the priority holder'}`,{reason:'Another player currently holds priority.'})]}],actions:[],count:0,hiddenSafe:true,state:'waiting'};
  }
  if(player.playerId!==game.activePlayerId&&game.phase!=='declare-blockers'){
    return {groups:[{key:'waiting',label:'WAITING',actions:[action('wait',`Wait for ${game.players?.find(x=>x.playerId===game.activePlayerId)?.displayName||'the active player'}`,{reason:'No tracked response opportunity is currently exposed.'})]}],actions:[],count:0,hiddenSafe:true,state:'waiting'};
  }

  const groups=[];
  const required=requiredProgression(game,player);
  const hand=player.playerId===game.activePlayerId?handActions(game,player):[];
  const commanders=player.playerId===game.activePlayerId?commanderActions(game,player):[];
  const abilities=player.playerId===game.activePlayerId?abilityActions(game,player):[];
  const attacks=player.playerId===game.activePlayerId?attackActions(game,player):[];
  const blocks=blockActions(game,player);

  if(required.length)groups.push({key:'required',label:'REQUIRED / PROGRESSION',actions:required});
  if(hand.length)groups.push({key:'hand',label:'HAND',actions:hand});
  if(commanders.length)groups.push({key:'command',label:'COMMAND ZONE',actions:commanders});
  if(abilities.length)groups.push({key:'abilities',label:'ACTIVATED ABILITIES',actions:abilities});
  if(attacks.length)groups.push({key:'combat',label:'ATTACKERS',actions:attacks});
  if(blocks.length)groups.push({key:'blocks',label:'BLOCKERS',actions:blocks});

  const legal=[...hand,...commanders,...abilities,...attacks,...blocks];
  if(!groups.length)groups.push({key:'progress',label:'PROGRESSION',actions:[action('progress',mainPhase(game.phase)?'Advance when finished':'Follow the current phase requirement',{reason:'No optional tracked action is currently legal.'})]});
  return {groups,actions:legal,count:legal.length,hiddenSafe:true,state:'active'};
}

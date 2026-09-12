export const TURN_STEPS=['untap','upkeep','draw','precombat-main','combat','postcombat-main','end-step','cleanup'];
const LABELS={
  untap:'Untap',upkeep:'Upkeep',draw:'Draw','precombat-main':'Main 1',combat:'Combat','postcombat-main':'Main 2','end-step':'End Step',cleanup:'Cleanup',
  'begin-combat':'Combat','declare-attackers':'Combat','declare-blockers':'Combat','combat-damage':'Combat','end-combat':'Combat',beginning:'Untap / Upkeep / Draw',ending:'Ending'
};
export function phaseLabel(phase){return LABELS[phase]||String(phase||'').replaceAll('-',' ')}
export function nextPhase(game){
  const phase=game.phase==='beginning'?'untap':game.phase==='ending'?'end-step':(['begin-combat','declare-attackers','declare-blockers','combat-damage','end-combat'].includes(game.phase)?'combat':game.phase);
  const i=TURN_STEPS.indexOf(phase);return i<0?TURN_STEPS[0]:TURN_STEPS[(i+1)%TURN_STEPS.length];
}
export function resetTurnPlayer(player){
  player.counters=player.counters||{};player.counters.landsPlayedThisTurn=0;player.counters.extraLandPlaysThisTurn=0;player.counters.cardsDrawnThisTurn=0;
  player.confirmations={draw:false,untap:false,attackers:false,blocks:false};
  player.mana.available={...(player.mana.total||{})};player.mana.floating={W:0,U:0,B:0,R:0,G:0,C:0};
}
export function requiredGatesForPhase(game,phase,player){
  const gates={};
  if(phase==='untap'&&(player?.deck?.battlefield||[]).some(c=>c.tapped))gates.untap={required:true,satisfied:!!player?.confirmations?.untap};
  if(phase==='draw'&&game.rulesConfig?.firstPlayerDraw!==false)gates.draw={required:true,satisfied:!!player?.confirmations?.draw};
  if(['combat','begin-combat','declare-attackers'].includes(phase))gates.combat={required:true,satisfied:!!player?.confirmations?.attackers};
  if(phase==='cleanup'&&(player?.deck?.hand?.length||0)>7)gates.discard={required:true,satisfied:!!player?.confirmations?.discard};
  return gates;
}
export function configurePhaseGates(game,phase=game.phase){const p=game.players?.find(x=>x.playerId===game.activePlayerId)||game.players?.[0];game.phaseGates=requiredGatesForPhase(game,phase,p);return game.phaseGates}
function cleanupTemporaryEffects(game){
  // Restore temporary control changes before removing temporary effects.
  const moves=[];
  for(const p of game.players||[])for(const c of [...(p.deck?.battlefield||[])]){
    const control=[...(c.temporaryEffects||[])].reverse().find(e=>e?.kind==='control'&&e?.expires==='cleanup'&&e?.previousControllerId);
    if(control&&control.previousControllerId!==p.playerId)moves.push({card:c,from:p,toId:control.previousControllerId});
  }
  for(const m of moves){const i=m.from.deck.battlefield.findIndex(c=>c.instanceId===m.card.instanceId);if(i<0)continue;const to=game.players.find(p=>p.playerId===m.toId);if(!to)continue;m.from.deck.battlefield.splice(i,1);m.card.controllerId=to.playerId;to.deck.battlefield.push(m.card)}
  for(const p of game.players||[]){p.temporaryPermissions=(p.temporaryPermissions||[]).filter(e=>e?.expires!=='cleanup');for(const c of p.deck?.battlefield||[]){c.damageMarked=0;c.deathtouchDamage=false;c.temporaryEffects=(c.temporaryEffects||[]).filter(e=>e?.expires!=='cleanup')}}game.damagePrevention=(game.damagePrevention||[]).filter(e=>e?.expires!=='cleanup')
}

export function cleanupEndCombatEffects(game){for(const p of game.players||[])for(const c of p.deck?.battlefield||[])c.temporaryEffects=(c.temporaryEffects||[]).filter(e=>e?.expires!=='end-combat');}
export function advanceTurn(game){
  cleanupTemporaryEffects(game);
  const i=game.players.findIndex(p=>p.playerId===game.activePlayerId);let step=1,next=null;game.extraTurnQueue=game.extraTurnQueue||[];while(game.extraTurnQueue.length&&!next){const id=game.extraTurnQueue.shift(),candidate=game.players.find(p=>p.playerId===id);if(candidate&&!candidate.eliminated)next=candidate}if(!next){next=game.players[(i+step)%game.players.length];while(next?.eliminated&&step<game.players.length){step++;next=game.players[(i+step)%game.players.length]}if(!next)next=game.players[(i+1)%game.players.length];if((i+step)>=game.players.length)game.roundNumber++;}game.turnNumber++;game.activePlayerId=next.playerId;game.phase='untap';game.priorityState=null;game.stack=game.stack||[];game.pendingTriggers=game.pendingTriggers||[];
  game.combatState={attackers:[],defenders:[],blocks:{},damage:[],waitingFor:null,resolved:false};resetTurnPlayer(next);configurePhaseGates(game,'untap');return next;
}
export function setGate(game,key,required=true){game.phaseGates[key]={required,satisfied:false}}
export function satisfyGate(game,key){if(game.phaseGates[key])game.phaseGates[key].satisfied=true;const p=game.players?.find(x=>x.playerId===game.activePlayerId);if(p?.confirmations)p.confirmations[key]=true;return !phaseLocked(game)}
export function phaseLocked(game){const p=game.players?.find(x=>x.playerId===game.activePlayerId)||game.players?.[0];const current=requiredGatesForPhase(game,game.phase,p);game.phaseGates=current;return Object.values(current).some(g=>g.required&&!g.satisfied)}
export function isCombatPhase(phase){return ['combat','begin-combat','declare-attackers','declare-blockers','combat-damage','end-combat'].includes(phase)}

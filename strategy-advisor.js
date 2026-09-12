import { getAvailableActions } from './available-actions.js?v=07951';

const isMain=phase=>['precombat-main','main1','main2','postcombat-main'].includes(phase);
const combatPhase=phase=>['begin-combat','combat','declare-attackers'].includes(phase);

export function buildStrategyAdvice({game,player}={}){
  if(!game||!player)return {
    headline:'Start or resume a game to receive a recommendation.',
    why:'The advisor reads the same tracked game state used by Commander Companion.',
    alternatives:[],legalCount:0,confidence:'setup'
  };
  const available=getAvailableActions({game,player});
  if(available.state==='waiting')return {
    headline:available.groups?.[0]?.actions?.[0]?.label||'Wait for the active player.',
    why:available.groups?.[0]?.actions?.[0]?.reason||'It is not your active turn.',
    alternatives:[],legalCount:0,confidence:'rules'
  };

  if(available.state==='priority'){
    const choices=available.actions||[],responses=choices.filter(x=>x.type!=='pass-priority'),pass=choices.find(x=>x.type==='pass-priority'),best=responses[0]||pass;
    return {headline:best?.label||'Pass priority',why:best?.reason||'You currently hold priority.',alternatives:choices.filter(x=>x!==best).map(x=>x.label).slice(0,2),legalCount:available.count,confidence:'rules-backed'};
  }
  const choices=available.actions||[];
  const byType=t=>choices.filter(x=>x.type===t);
  const hand=[...byType('land'),...byType('cast'),...byType('commander')],abilities=byType('ability'),attackers=byType('attack'),blocks=byType('block');
  let headline='',why='';

  if(game.phase==='untap'){
    const req=available.groups.find(g=>g.key==='required')?.actions?.[0];
    headline=req?.label||'Advance to Upkeep.'; why=req?.reason||'Complete the untap step.';
  }else if(game.phase==='upkeep'){
    headline=abilities[0]?.label||'Resolve upkeep effects, then advance to Draw.';
    why=abilities[0]?.reason||'No tracked required upkeep action is currently blocking progression.';
  }else if(game.phase==='draw'){
    const req=available.groups.find(g=>g.key==='required')?.actions?.[0];
    headline=req?.label||'Complete your required draw.'; why=req?.reason||'The draw step must be completed.';
  }else if(isMain(game.phase)){
    if(hand[0]){headline=hand[0].label;why=hand[0].reason}
    else if(abilities[0]){headline=abilities[0].label;why=abilities[0].reason}
    else {headline=game.phase==='postcombat-main'?'Advance toward End Step when finished.':'Advance toward combat when finished.';why='Available Actions exposes no optional tracked play that must be used first.'}
  }else if(combatPhase(game.phase)){
    if(attackers[0]){headline=attackers[0].label;why=attackers[0].reason}
    else {headline='Advance through combat without attacking.';why='Available Actions exposes no legal attacker.'}
  }else if(game.phase==='declare-blockers'){
    if(blocks[0]){headline=blocks[0].label;why=blocks[0].reason}
    else {headline='Complete blocker declaration.';why='No tracked creature can legally block the current attackers.'}
  }else if(game.phase==='combat-damage'){
    headline='Resolve combat damage.';why='Attackers and blockers are already declared; combat damage is next.';
  }else if(game.phase==='end-combat'){
    headline='Resolve end-of-combat effects, then advance to Main 2.';why='The combat sequence is complete after end-of-combat effects resolve.';
  }else if(game.phase==='end-step'){
    headline=abilities[0]?.label||'Resolve end-step effects.';why=abilities[0]?.reason||'Finish tracked end-step effects before cleanup.';
  }else if(game.phase==='cleanup'){
    headline='Complete cleanup, then end the turn.';why='Discard-to-maximum and temporary turn effects must be settled first.';
  }else{
    headline='Follow the current phase requirements.';why='The advisor defers to the same Available Actions legality source.';
  }

  const seen=new Set([headline]);
  const alternatives=choices.map(x=>x.label).filter(x=>!seen.has(x)&&seen.add(x)).slice(0,2);
  return {headline,why,alternatives,legalCount:available.count,confidence:'rules-backed'};
}

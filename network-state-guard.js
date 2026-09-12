export function networkStateStamp(game){
  return {
    turnNumber:Number(game?.turnNumber||0),
    phase:String(game?.phase||''),
    activePlayerId:String(game?.activePlayerId||''),
    combatKey:combatStateKey(game)
  };
}
export function combatStateKey(game){
  const c=game?.combatState;if(!c)return '';
  const attackers=(c.attackers||[]).map(a=>`${a.instanceId}>${a.defenderId}`).sort().join(',');
  return `${Number(game?.turnNumber||0)}|${String(game?.phase||'')}|${attackers}|${String(c.waitingFor||'')}`;
}
export function validateRemoteStamp(game,stamp,{requireCombat=false}={}){
  const now=networkStateStamp(game),reasons=[];
  if(!stamp||typeof stamp!=='object')reasons.push('Missing network state stamp.');
  else{
    if(Number(stamp.turnNumber)!==now.turnNumber)reasons.push('Turn has advanced.');
    if(String(stamp.phase||'')!==now.phase)reasons.push('Phase has changed.');
    if(String(stamp.activePlayerId||'')!==now.activePlayerId)reasons.push('Active player has changed.');
    if(requireCombat&&String(stamp.combatKey||'')!==now.combatKey)reasons.push('Combat state has changed.');
  }
  return {legal:reasons.length===0,reasons,now};
}

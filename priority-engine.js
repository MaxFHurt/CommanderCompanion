function playerIds(game){return (game.players||[]).filter(p=>!p.eliminated).map(p=>p.playerId)}
function nextId(game,current){
  const seats=game.players||[],alive=playerIds(game);if(!alive.length)return null;
  const seatIndex=seats.findIndex(p=>p.playerId===current);
  if(seatIndex<0)return alive[0];
  for(let step=1;step<=seats.length;step++){const candidate=seats[(seatIndex+step)%seats.length];if(candidate&&!candidate.eliminated)return candidate.playerId}
  return null;
}
function repairPriorityHolder(game){
  const ps=game.priorityState;if(!ps?.active)return null;
  const holder=(game.players||[]).find(p=>p.playerId===ps.holderId);
  if(holder&&!holder.eliminated)return holder;
  const replacement=nextId(game,ps.holderId);
  ps.holderId=replacement;ps.responseDeadlineHolderId=null;ps.responseDeadlineAt=null;
  if(!replacement){ps.active=false;ps.closedAt=new Date().toISOString();return null}
  return (game.players||[]).find(p=>p.playerId===replacement)||null;
}
export function beginPriorityWindow(game,{reason='Priority window',stage='generic',startingPlayerId=null}={}){
  const ids=playerIds(game);const start=startingPlayerId&&ids.includes(startingPlayerId)?startingPlayerId:(game.activePlayerId&&ids.includes(game.activePlayerId)?game.activePlayerId:ids[0]);
  game.priorityState={active:true,reason,stage,holderId:start,passCount:0,passes:[],responses:[],openedAt:new Date().toISOString(),responseDeadlineHolderId:null,responseDeadlineAt:null};return game.priorityState;
}
export function priorityHolder(game){return repairPriorityHolder(game)}
export function recordPriorityResponse(game,{playerId,label='Response'}={}){const ps=game.priorityState;if(!ps?.active)throw new Error('No priority window is active.');repairPriorityHolder(game);if(!ps.active)throw new Error('No eligible player remains for priority.');if(ps.holderId!==playerId)throw new Error('Only the player with priority may respond.');ps.responses.push({playerId,label,at:new Date().toISOString()});ps.passCount=0;ps.passes=[];ps.holderId=playerId;ps.responseDeadlineHolderId=null;ps.responseDeadlineAt=null;return ps}
export function passPriority(game,playerId){const ps=game.priorityState;if(!ps?.active)throw new Error('No priority window is active.');repairPriorityHolder(game);if(!ps.active)throw new Error('No eligible player remains for priority.');if(ps.holderId!==playerId)throw new Error('Only the player with priority may pass.');const ids=playerIds(game);if(!ids.includes(playerId))throw new Error('An eliminated player cannot pass priority.');ps.passes.push(playerId);ps.passCount++;ps.responseDeadlineHolderId=null;ps.responseDeadlineAt=null;if(ps.passCount>=ids.length){ps.active=false;ps.holderId=null;ps.closedAt=new Date().toISOString();return {complete:true,state:ps}}ps.holderId=nextId(game,playerId);return {complete:false,state:ps}}
export function clearPriority(game){game.priorityState=null}

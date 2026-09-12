import { publicSnapshot } from './state.js?v=0722';
export function createRoomState(game){return {gameId:game.gameId,seats:game.players.map(p=>({playerId:p.playerId,ready:false,clientId:p.ownership?.clientId||null})),started:false,revision:0};}
export function setSeatReady(room,playerId,ready=true){const seat=room.seats.find(s=>s.playerId===playerId);if(!seat)throw new Error('Unknown seat');seat.ready=ready;return room;}
export function canStartRoom(room){return room.seats.length>=2&&room.seats.every(s=>s.ready);}
export function startRoom(room){if(!canStartRoom(room))throw new Error('All players must be ready before the game starts');room.started=true;room.revision++;return room;}
export function eventEnvelope({room,actorPlayerId,action}){return {gameId:room.gameId,revision:room.revision+1,actorPlayerId,action:structuredClone(action)};}
export function clientView(game,playerId){return publicSnapshot(game,{viewerPlayerId:playerId});}
export function approvalResult({eligibleVoters,votes,requesterId}){const voters=eligibleVoters.filter(x=>x!==requesterId);const cast=voters.map(id=>votes[id]).filter(v=>v==='approve'||v==='deny');const approvals=cast.filter(v=>v==='approve').length;return {approved:cast.length>0&&approvals/cast.length>=.5,approvals,total:cast.length};}

export function publicBroadcastState(game){
  const copy=structuredClone(game);
  const publicDefinitionIds=new Set();
  const publicZones=['battlefield','graveyard','exile','tokens','attachments','commandZone'];
  for(const p of copy.players){
    p.publicCounts={hand:p.deck.hand.length,library:p.deck.remainingLibrary.length};
    p.deck.hand=[];p.deck.remainingLibrary=[];
    for(const z of publicZones){
      p.deck[z]=Array.isArray(p.deck[z])?p.deck[z]:[];
      for(const c of p.deck[z])if(c&&!c.faceDown&&!c.hidden&&!c.private&&c.definitionId)publicDefinitionIds.add(c.definitionId);
    }
    for(const c of p.commanders||[])if(c?.cardId)publicDefinitionIds.add(c.cardId);
  }
  copy.cardDefinitions=Object.fromEntries(Object.entries(copy.cardDefinitions||{}).filter(([id])=>publicDefinitionIds.has(id)));
  copy.undoHistory=[];copy.pendingTransaction=null;
  return copy;
}

import { createGameState, createPlayerState, createCommanderState } from './schema.js?v=0722';
import { configurePhaseGates } from './phase.js?v=0727';
export function initializeGame({players,mode='fully-tracked',deviceMode='single-device'}){
  if(players.length<2||players.length>6) throw new Error('Commander Companion supports 2–6 players');
  const ps=players.map((p,seat)=>{
    const s=createPlayerState({...p,seat,...(p.deck?{deck:p.deck}:{})});
    s.commanders=(p.commanders||[]).map((c,i)=>createCommanderState({...c,id:c.id||`${s.playerId}:commander:${i+1}`}));
    return s;
  });
  const game=createGameState({mode,deviceMode,playerCount:ps.length,players:ps,activePlayerId:ps[0].playerId,phase:'untap',combatState:{attackers:[],defenders:[],damage:[]}});configurePhaseGates(game,'untap');return game;
}
export function effectiveColorIdentity(player,definitions){ return [...new Set(player.commanders.flatMap(c=>definitions.get(c.cardId)?.colorIdentity||[]))]; }
export function publicSnapshot(game,{viewerPlayerId=null}={}){
  const copy=structuredClone(game);
  for(const p of copy.players){
    const own=p.playerId===viewerPlayerId;
    const counts={hand:p.deck.hand.length,library:p.deck.remainingLibrary.length};
    if(!own){p.deck.hand=[];p.deck.remainingLibrary=[];}
    p.publicCounts=counts;
  }
  return copy;
}

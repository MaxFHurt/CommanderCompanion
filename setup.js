import { normalizeDeck, shuffleLibrary, drawOpeningHand } from './deck.js?v=0722';
import { initializeGame } from './state.js?v=0722';

export function prepareTrackedPlayer({playerId,displayName,manifest,commanderDefinitionIds,commanderCards=[],sourceType='custom',sourceName='',random=Math.random}){
  const deck=normalizeDeck({ownerId:playerId,sourceType,sourceName,manifest,commanderDefinitionIds});
  shuffleLibrary(deck,random);
  drawOpeningHand(deck,7);
  return {playerId,displayName,deck,commanders:commanderDefinitionIds.map((cardId,i)=>({id:`${playerId}:commander:${i+1}`,cardId,card:commanderCards[i]||null}))};
}
export function startSingleDeviceTracked({players,random=Math.random}){
  const prepared=players.map(p=>prepareTrackedPlayer({...p,random}));
  return initializeGame({players:prepared,mode:'fully-tracked',deviceMode:'single-device'});
}

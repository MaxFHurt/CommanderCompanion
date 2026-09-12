import { createDeckState } from './schema.js?v=0722';
import { expandManifest } from './cards.js?v=0722';

export function normalizeDeck({ownerId, sourceType='custom', sourceId=null, sourceName='', manifest=[], commanderDefinitionIds=[]}) {
  const fullManifest=manifest.map(e=>({definitionId:e.definitionId, quantity:Number(e.quantity??e.qty??1)}));
  const all=expandManifest(fullManifest, ownerId);
  const commanderInstances=[]; const remaining=[...all];
  for (const definitionId of commanderDefinitionIds) {
    const idx=remaining.findIndex(c=>c.definitionId===definitionId);
    if(idx<0) throw new Error(`Commander ${definitionId} is not present in deck manifest`);
    const [card]=remaining.splice(idx,1); card.zone='command'; commanderInstances.push(card);
  }
  return createDeckState({sourceType,sourceId,sourceName,complete:true,expectedSize:all.length,fullManifest,remainingLibrary:remaining,commandZone:commanderInstances,zoneAccounting:{library:remaining.length,hand:0,battlefield:0,graveyard:0,exile:0,command:commanderInstances.length}});
}
export function shuffleLibrary(deck, random=Math.random){
  const a=[...deck.remainingLibrary];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  deck.remainingLibrary=a; return deck;
}
export function drawOpeningHand(deck,count=7){
  if(deck.remainingLibrary.length<count) throw new Error('Not enough cards for opening hand');
  const cards=deck.remainingLibrary.splice(0,count); cards.forEach(c=>c.zone='hand'); deck.hand.push(...cards); sync(deck); return cards;
}
export function eligibleTrackedCards(deck,{zones=['library']}={}) { return zones.flatMap(z=> z==='library'?deck.remainingLibrary:(deck[z]||[])); }
export function sync(deck){ deck.zoneAccounting={...deck.zoneAccounting,library:deck.remainingLibrary.length,hand:deck.hand.length,battlefield:deck.battlefield.length,graveyard:deck.graveyard.length,exile:deck.exile.length,command:deck.commandZone.length}; return deck; }

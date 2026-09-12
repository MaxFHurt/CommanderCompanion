function sumMana(m={}){return Object.values(m).reduce((a,b)=>a+(+b||0),0)}
export function buildPostGame(game,{winnerId=null}={}){
  const stats=game.players.map(p=>({playerId:p.playerId,name:p.displayName,life:p.life,mana:sumMana(p.mana?.total),permanents:p.deck?.battlefield?.length||0,damage:p.counters?.damageDealt||0,poison:p.poison||0}));
  const max=(key)=>[...stats].sort((a,b)=>b[key]-a[key])[0];const min=(key)=>[...stats].sort((a,b)=>a[key]-b[key])[0];
  const awards=[];if(stats.length){awards.push({key:'most-mana',playerId:max('mana').playerId,label:'Most Mana'});awards.push({key:'most-permanents',playerId:max('permanents').playerId,label:'Most Permanents'});awards.push({key:'most-damage',playerId:max('damage').playerId,label:'Most Damage'});awards.push({key:'least-damage',playerId:min('damage').playerId,label:'Least Damage'});}
  return {winnerId,stats,awards,completedAt:new Date().toISOString(),turns:game.turnNumber,rounds:game.roundNumber};
}

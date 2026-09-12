const BASE='https://mtgjson.com/api/v5';
export async function listPrecons(){
  const r=await fetch(`${BASE}/DeckList.json`);if(!r.ok)throw new Error('Unable to load preconstructed deck catalog');const j=await r.json();const data=j.data||j;
  return (Array.isArray(data)?data:[]).filter(d=>/commander|edh/i.test(`${d.type||''} ${d.name||''}`)).map(d=>({name:d.name,fileName:d.fileName||d.file||d.code,type:d.type,releaseDate:d.releaseDate||''})).sort((a,b)=>String(b.releaseDate).localeCompare(String(a.releaseDate))||a.name.localeCompare(b.name));
}
function cardsFromSection(sec){if(!sec)return[];if(Array.isArray(sec))return sec.map(x=>({name:x.name||x.card?.name,quantity:Number(x.count??x.quantity??x.qty??1)})).filter(x=>x.name);return Object.entries(sec).map(([name,v])=>({name:v?.name||name,quantity:Number(v?.count??v?.quantity??v??1)})).filter(x=>x.name)}
export async function loadPrecon(fileName){
  const name=String(fileName||'').replace(/\.json$/,'');const r=await fetch(`${BASE}/decks/${encodeURIComponent(name)}.json`);if(!r.ok)throw new Error('Unable to load that preconstructed deck');const j=await r.json();const d=j.data||j;
  const commanders=cardsFromSection(d.commander||d.commanders||d.leader).map(x=>x.name);
  const cards=[...cardsFromSection(d.mainBoard||d.mainboard||d.cards||d.deck),...cardsFromSection(d.sideBoard||d.sideboard)];
  const merged=new Map();for(const x of cards)merged.set(x.name,(merged.get(x.name)||0)+x.quantity);for(const name of commanders)if(!merged.has(name))merged.set(name,1);
  return {name:d.name||name,commanders,deckList:[...merged].map(([n,q])=>`${q} ${n}`).join('\n')};
}

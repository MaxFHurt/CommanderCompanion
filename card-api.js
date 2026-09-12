import { createCardDefinition } from './schema.js?v=0722';

const API='https://api.scryfall.com';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const CARD_DATA_SOURCE=Object.freeze({
  provider:'Scryfall',
  mode:'live-api',
  apiBase:API,
  note:'ManaBox imports are parsed locally, then card names/printings are resolved against the live Scryfall catalog.'
});
export function scryfallToDefinition(c){
  const face=c.card_faces?.[0];
  return createCardDefinition({
    definitionId:c.id,
    name:c.name,
    manaCost:c.mana_cost||face?.mana_cost||'',
    typeLine:c.type_line||face?.type_line||'',
    oracleText:c.oracle_text??face?.oracle_text??'',
    power:c.power??face?.power??null,
    toughness:c.toughness??face?.toughness??null,
    keywords:c.keywords||face?.keywords||[],
    colorIdentity:c.color_identity||[],
    colors:c.colors||face?.colors||[],
    imageUris:c.image_uris||face?.image_uris||null,
    set:c.set,
    language:c.lang,
    collectorNumber:c.collector_number,
    printing:{setName:c.set_name,rarity:c.rarity,scryfallUri:c.scryfall_uri},
    legalities:c.legalities||null,
    hydrationStatus:'complete'
  });
}
export async function resolveNamedCard(seed){
  const name=typeof seed==='string'?seed:seed?.name;
  if(!name) throw new Error('Card name required');
  const exact=await fetch(`${API}/cards/named?exact=${encodeURIComponent(name)}`);
  if(exact.ok)return scryfallToDefinition(await exact.json());
  const fuzzy=await fetch(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`);
  if(!fuzzy.ok)throw new Error(`Card not found in live catalog: ${name}`);
  return scryfallToDefinition(await fuzzy.json());
}

export async function resolvePrinting(setCode,collectorNumber){
  const r=await fetch(`${API}/cards/${encodeURIComponent(String(setCode).toLowerCase())}/${encodeURIComponent(collectorNumber)}`);if(!r.ok)throw new Error('Exact printing not found');return scryfallToDefinition(await r.json());
}
export async function searchCards(query,{basicLandsOnly=false,allPrintings=true}={}){
  if(basicLandsOnly){
    const names=['Plains','Island','Swamp','Mountain','Forest'];
    const rows=[];
    for(const name of names){try{rows.push(await resolveNamedCard(name))}catch{}}
    return rows;
  }
  const raw=String(query||'').trim(); if(!raw)return[];
  // Name-first search is deliberate: Card ID should not make users author Scryfall syntax.
  // unique=prints preserves alternate printings that share a matching card name.
  const q=`name:${JSON.stringify(raw)}`;
  const r=await fetch(`${API}/cards/search?q=${encodeURIComponent(q)}&unique=${allPrintings?'prints':'cards'}&order=name`);
  if(r.status===404)return[]; if(!r.ok)throw new Error('Card search failed');
  const data=await r.json(); return (data.data||[]).slice(0,100).map(scryfallToDefinition);
}
export async function resolveCollection(names,onProgress=()=>{}){
  const unique=[...new Set(names.map(n=>n.trim()).filter(Boolean))]; const out=[];
  for(let i=0;i<unique.length;i+=75){
    const batch=unique.slice(i,i+75);
    const r=await fetch(`${API}/cards/collection`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers:batch.map(name=>({name}))})});
    if(!r.ok) throw new Error('Card collection lookup failed');
    const data=await r.json(); out.push(...(data.data||[]).map(scryfallToDefinition));
    const missing=(data.not_found||[]).map(x=>x.name).filter(Boolean);
    for(const name of missing){try{out.push(await resolveNamedCard(name));await sleep(40)}catch{}}
    onProgress(Math.min(i+75,unique.length),unique.length);
  }
  return out;
}
export function parseDeckList(text){
  const rows=[];
  for(const raw of String(text||'').split(/\r?\n/)){
    let line=raw.trim(); if(!line||line.startsWith('#')||line.startsWith('//'))continue;
    line=line.replace(/^SB:\s*/i,'');
    let m=line.match(/^(\d+)\s*[xX]?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+\d+)?$/);
    if(m)rows.push({quantity:+m[1],name:m[2].trim()});else rows.push({quantity:1,name:line.replace(/\s+\*F\*$/,'').trim()});
  }
  const merged=new Map(); for(const r of rows)merged.set(r.name,(merged.get(r.name)||0)+r.quantity);
  return [...merged].map(([name,quantity])=>({name,quantity}));
}
export async function hydrateDeckList(text,onProgress){
  if(/^\s*SB:/im.test(String(text||'')))throw new Error('Commander decks do not use a sideboard. Remove SB: entries from the deck list.');
  const parsed=parseDeckList(text); const defs=await resolveCollection(parsed.map(x=>x.name),onProgress);
  const byName=new Map(defs.map(d=>[d.name.toLowerCase(),d]));
  const unresolved=[]; const manifest=[];
  for(const row of parsed){let d=byName.get(row.name.toLowerCase());if(!d){try{d=await resolveNamedCard(row.name)}catch{unresolved.push(row.name);continue}}manifest.push({definitionId:d.definitionId,quantity:row.quantity});byName.set(row.name.toLowerCase(),d)}
  return {manifest,definitions:[...new Map([...byName.values()].map(d=>[d.definitionId,d])).values()],unresolved,total:manifest.reduce((n,e)=>n+e.quantity,0)};
}

import { durableGet, durableSet } from './userdata-db.js?v=0738';
const KEY='ccv07-decks',DURABLE_KEY='decks';
let cache=null;
function localRead(storage){try{const v=JSON.parse(storage?.getItem?.(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function localWrite(all,storage){try{storage?.setItem?.(KEY,JSON.stringify(all));return true}catch{return false}}
function stamp(d){return Date.parse(d?.updatedAt||d?.createdAt||0)||0}
function mergeDecks(a=[],b=[]){const m=new Map();for(const d of [...a,...b]){if(!d?.id)continue;const old=m.get(d.id);if(!old||stamp(d)>=stamp(old))m.set(d.id,d)}return [...m.values()]}
export async function initDeckStore(storage=globalThis.localStorage){
  const local=localRead(storage);let durable=[];try{const v=await durableGet(DURABLE_KEY);if(Array.isArray(v))durable=v}catch{}
  cache=mergeDecks(local,durable);localWrite(cache,storage);return cache
}
export function listDecks(storage=globalThis.localStorage){if(cache)return structuredClone(cache);return structuredClone(localRead(storage))}
export async function saveDeck(deck,storage=globalThis.localStorage){
  const all=listDecks(storage),i=all.findIndex(d=>d.id===deck.id),row={...deck,id:deck.id||crypto.randomUUID(),updatedAt:new Date().toISOString()};if(i>=0)all[i]=row;else all.push(row);cache=all;
  const localOk=localWrite(all,storage);let durableOk=false;try{await durableSet(DURABLE_KEY,all);durableOk=true}catch{}
  if(!localOk&&!durableOk)throw new Error('This device could not save the deck. Both browser recovery stores are unavailable.');return structuredClone(row)
}
export async function deleteDeck(id,storage=globalThis.localStorage){const all=listDecks(storage).filter(d=>d.id!==id);cache=all;const localOk=localWrite(all,storage);let durableOk=false;try{await durableSet(DURABLE_KEY,all);durableOk=true}catch{}if(!localOk&&!durableOk)throw new Error('This device could not update saved decks. Both browser recovery stores are unavailable.');return true}

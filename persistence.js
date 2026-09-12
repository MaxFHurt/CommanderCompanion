import { SCHEMA_VERSION } from './schema.js?v=0722';

const DB_NAME='commander-companion';
const DB_VERSION=1;
const STORE='autosaves';

function compactGameForSave(game){
  const copy=structuredClone(game);
  // Runtime undo snapshots can duplicate the entire hydrated game many times and
  // quickly exceed Safari's small localStorage quota. Recovery needs the current
  // authoritative board, not historical snapshots, so start a fresh undo chain
  // after a restored session.
  copy.undoHistory=[];
  copy.pendingTransaction=null;
  // Commander card data is already present in cardDefinitions; avoid duplicate
  // hydrated definitions inside commander state when possible.
  for(const p of copy.players||[])for(const c of p.commanders||[])if(c&&'card' in c)c.card=null;
  return copy;
}

export function serializeGame(game){return JSON.stringify({schemaVersion:SCHEMA_VERSION,savedAt:new Date().toISOString(),game:compactGameForSave(game)});}

export function inspectSerializedGame(text){
  let payload;
  try{payload=JSON.parse(text)}catch{return {valid:false,savedAt:null,epoch:0,error:'corrupt-json',game:null}}
  const savedAt=payload?.savedAt||null;
  const epoch=Date.parse(savedAt||0)||0;
  try{
    const game=deserializeGame(text);
    return {valid:true,savedAt,epoch,error:null,game}
  }catch(error){
    return {valid:false,savedAt,epoch,error:error?.message||String(error),game:null}
  }
}

export function chooseNewestSerializedGame(localText,durableText){
  const local=localText?inspectSerializedGame(localText):{valid:false,epoch:0,game:null,savedAt:null,error:'missing'};
  const durable=durableText?inspectSerializedGame(durableText):{valid:false,epoch:0,game:null,savedAt:null,error:'missing'};
  if(!local.valid&&!durable.valid)return {game:null,source:null,savedAt:null,local,durable};
  if(local.valid&&(!durable.valid||local.epoch>=durable.epoch))return {game:local.game,source:'localStorage',savedAt:local.savedAt,local,durable};
  return {game:durable.game,source:'IndexedDB',savedAt:durable.savedAt,local,durable};
}


function normalizeLoadedGame(game){
  if(!game||typeof game!=='object'||!Array.isArray(game.players)||game.players.length<2)throw new Error('The saved game is incomplete or corrupt. Start a new game; the damaged save was not loaded.');
  game.schemaVersion=SCHEMA_VERSION;
  game.log=Array.isArray(game.log)?game.log:[];game.undoHistory=[];game.phaseGates=game.phaseGates||{};
  game.cardDefinitions=game.cardDefinitions&&typeof game.cardDefinitions==='object'?game.cardDefinitions:{};
  if(!game.activePlayerId||!game.players.some(p=>p.playerId===game.activePlayerId))game.activePlayerId=game.players[0]?.playerId||null;
  game.turnNumber=Math.max(1,Number(game.turnNumber||1));
  game.phase=game.phase||'untap';
  game.openingHandState=game.openingHandState&&typeof game.openingHandState==='object'?game.openingHandState:{active:false,index:0};
  game.combatState=game.combatState&&typeof game.combatState==='object'?game.combatState:{attackers:[],defenders:[],blocks:{},damage:[],waitingFor:null,resolved:false};
  game.combatState.attackers=Array.isArray(game.combatState.attackers)?game.combatState.attackers:[];
  game.combatState.defenders=Array.isArray(game.combatState.defenders)?game.combatState.defenders:[];
  game.combatState.blocks=game.combatState.blocks&&typeof game.combatState.blocks==='object'?game.combatState.blocks:{};
  game.combatState.damage=Array.isArray(game.combatState.damage)?game.combatState.damage:[];
  for(const p of game.players){
    p.statuses=Array.isArray(p.statuses)?p.statuses:[];p.commanderDamage=p.commanderDamage||{};p.counters=p.counters||{};p.confirmations=p.confirmations||{};p.settings=p.settings||{};
    p.mana=p.mana||{};p.mana.total={W:0,U:0,B:0,R:0,G:0,C:0,...(p.mana.total||{})};p.mana.available={W:0,U:0,B:0,R:0,G:0,C:0,...(p.mana.available||{})};
    p.deck=p.deck||{};for(const z of ['remainingLibrary','hand','battlefield','graveyard','exile','tokens','attachments','commandZone'])p.deck[z]=Array.isArray(p.deck[z])?p.deck[z]:[];
    for(const c of p.commanders||[])if(!c.card&&c.cardId&&game.cardDefinitions?.[c.cardId])c.card=game.cardDefinitions[c.cardId];
    if(game.mode==='fully-tracked'||p.guidanceLevel==='guided'){p.guidanceLevel='guided';p.settings.handTracking=true;p.deck.virtualDrawEnabled=true;}else if(game.mode==='freeplay'){p.settings.handTracking=!!p.settings.handTracking;p.deck.virtualDrawEnabled=!!p.settings.handTracking;}
  }
  return game;
}

export function deserializeGame(text){
  let payload;try{payload=JSON.parse(text)}catch{throw new Error('The saved game could not be read. The save data is corrupt.');}
  const version=Number(payload?.schemaVersion??payload?.game?.schemaVersion??0);
  if(!payload?.game)throw new Error('The saved game is missing its game state.');
  if(version>SCHEMA_VERSION)throw new Error(`This save was created by a newer Commander Companion schema (${version}). Update the app before continuing.`);
  if(version<5)throw new Error(`This save uses an incompatible legacy schema (${version}).`);
  return normalizeLoadedGame(structuredClone(payload.game));
}

export function saveToStorage(game,storage=localStorage,key='commander-companion-v0.7'){storage.setItem(key,serializeGame(game));}
export function loadFromStorage(storage=localStorage,key='commander-companion-v0.7'){const text=storage.getItem(key);return text?deserializeGame(text):null;}
export function hasValidSave(storage=localStorage,key='commander-companion-v0.7'){try{return !!loadFromStorage(storage,key)}catch{return false}}

function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in globalThis))return reject(new Error('IndexedDB unavailable'));
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
  });
}
async function loadDurableText(key='commander-companion-v0.7'){
  const db=await openDb();
  const text=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('IndexedDB read failed'))});
  db.close();return text;
}
export async function saveDurable(game,key='commander-companion-v0.7'){
  const text=serializeGame(game),incoming=inspectSerializedGame(text),db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),getReq=store.get(key);
    getReq.onsuccess=()=>{
      const existing=getReq.result?inspectSerializedGame(getReq.result):null;
      if(!existing?.valid||incoming.epoch>=existing.epoch)store.put(text,key);
    };
    getReq.onerror=()=>reject(getReq.error||new Error('IndexedDB read-before-write failed'));
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('IndexedDB save failed'));
    tx.onabort=()=>reject(tx.error||new Error('IndexedDB save aborted'));
  });
  db.close();return true;
}
export async function loadDurable(key='commander-companion-v0.7'){
  const text=await loadDurableText(key);return text?deserializeGame(text):null;
}
export async function loadBestAvailableSave(storage=localStorage,key='commander-companion-v0.7'){
  let localText=null,durableText=null;
  try{localText=storage?.getItem?.(key)||null}catch{}
  try{durableText=await loadDurableText(key)}catch{}
  return chooseNewestSerializedGame(localText,durableText);
}
export async function hasDurableSave(key='commander-companion-v0.7'){try{return !!(await loadDurable(key))}catch{return false}}

import { durableGet, durableSet } from './userdata-db.js?v=0738';
const KEY='ccv07-profile',DURABLE_KEY='profile';
let cache=null;
function newTokenId(){try{return crypto.randomUUID()}catch{return `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}}
function blank(){const now=new Date().toISOString();return {version:6,token:{id:newTokenId(),schema:6,createdAt:now,updatedAt:now},games:0,wins:0,awards:{},milestones:[],players:{},decks:{},history:[],account:{displayName:'',tagline:'',avatarGlyph:'CC',preferredPlayerNames:[],favoriteDeckId:'',createdAt:null,updatedAt:null}}}
function cleanName(x){return String(x||'Player').trim()||'Player'}
function playerKey(name){return cleanName(name).toLowerCase()}
function normalize(raw){
  const base=blank(),now=new Date().toISOString(),source=raw&&typeof raw==='object'?raw:{};
  const oldToken=source.token&&typeof source.token==='object'?source.token:{};
  return {...base,...source,version:6,
    token:{id:String(oldToken.id||base.token.id),schema:6,createdAt:oldToken.createdAt||source.account?.createdAt||now,updatedAt:oldToken.updatedAt||source.account?.updatedAt||now},
    players:{...(source.players||{})},decks:{...(source.decks||{})},history:[...(source.history||[])],
    account:{...base.account,...(source.account||{})}
  }
}
function localRead(storage){try{return normalize(JSON.parse(storage?.getItem?.(KEY)||'null'))}catch{return blank()}}
function localWrite(p,storage){try{storage?.setItem?.(KEY,JSON.stringify(p));return true}catch{return false}}
function newest(a,b){const ta=Date.parse(a?.token?.updatedAt||a?.account?.updatedAt||a?.history?.[0]?.at||0)||0,tb=Date.parse(b?.token?.updatedAt||b?.account?.updatedAt||b?.history?.[0]?.at||0)||0;return tb>ta?b:a}
async function persistReliable(p,storage){cache=normalize(p);cache.token.updatedAt=new Date().toISOString();const localOk=localWrite(cache,storage);let durableOk=false;try{await durableSet(DURABLE_KEY,cache);durableOk=true}catch{}if(!localOk&&!durableOk)throw new Error('Profile could not be saved because both browser recovery stores are unavailable.');return cache}
export async function initProfileStore(storage=globalThis.localStorage){const local=localRead(storage);let durable=null;try{durable=await durableGet(DURABLE_KEY)}catch{}cache=normalize(durable?newest(local,normalize(durable)):local);localWrite(cache,storage);return structuredClone(cache)}
export function loadProfile(storage=globalThis.localStorage){return structuredClone(cache||localRead(storage))}
export function playerProfileToken(storage=globalThis.localStorage){
  const p=loadProfile(storage);
  return structuredClone({
    id:p.token.id,schema:p.token.schema,createdAt:p.token.createdAt,updatedAt:p.token.updatedAt,
    identity:{displayName:p.account?.displayName||'',tagline:p.account?.tagline||'',avatarGlyph:p.account?.avatarGlyph||'CC'},
    preferences:{preferredPlayerNames:[...(p.account?.preferredPlayerNames||[])],favoriteDeckId:p.account?.favoriteDeckId||''},
    career:{games:p.games||0,wins:p.wins||0,awards:{...(p.awards||{})},milestones:[...(p.milestones||[])]},
    deckLibrary:Object.values(p.decks||{}).map(d=>({id:d.id||'',name:d.name||'Untitled Deck',commander1:d.commander1||'',commander2:d.commander2||'',updatedAt:d.updatedAt||d.createdOrSavedAt||null}))
  });
}
export async function saveAccountProfile(account={},storage=globalThis.localStorage){const p=loadProfile(storage),now=new Date().toISOString();const names=(account.preferredPlayerNames||[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,6);p.account={...p.account,...account,displayName:String(account.displayName??p.account.displayName??'').trim(),tagline:String(account.tagline??p.account.tagline??'').trim().slice(0,80),avatarGlyph:String(account.avatarGlyph??p.account.avatarGlyph??'CC').trim().slice(0,3)||'CC',preferredPlayerNames:names,favoriteDeckId:String(account.favoriteDeckId??p.account.favoriteDeckId??''),createdAt:p.account.createdAt||now,updatedAt:now};await persistReliable(p,storage);return p}
export function accountSetupDefaults(storage=globalThis.localStorage){const p=loadProfile(storage),a=p.account||{};const inferred=Object.values(p.players||{}).sort((x,y)=>String(y.lastPlayedAt||'').localeCompare(String(x.lastPlayedAt||''))).map(x=>x.name).filter(Boolean);const names=[...(a.preferredPlayerNames||[]),a.displayName,...inferred].map(x=>String(x||'').trim()).filter(Boolean);return {displayName:a.displayName||'',tagline:a.tagline||'',avatarGlyph:a.avatarGlyph||'CC',playerNames:[...new Set(names)].slice(0,6),favoriteDeckId:a.favoriteDeckId||''}}
export async function recordDeckCreated(deck,storage=globalThis.localStorage){
  const p=loadProfile(storage),id=deck?.id||deck?.name||crypto.randomUUID(),now=new Date().toISOString();
  p.decks[id]={...(p.decks[id]||{}),id,name:deck?.name||'Untitled Deck',commander1:deck?.commander1||'',commander2:deck?.commander2||'',analytics:deck?.analytics?structuredClone(deck.analytics):p.decks[id]?.analytics||null,createdOrSavedAt:p.decks[id]?.createdOrSavedAt||now,updatedAt:deck?.updatedAt||now,source:'deck-editor'};
  await persistReliable(p,storage);return p
}
export async function recordDeckDeleted(id,storage=globalThis.localStorage){
  const p=loadProfile(storage),deckId=String(id||'');
  if(deckId&&p.decks?.[deckId])delete p.decks[deckId];
  if(p.account?.favoriteDeckId===deckId){
    p.account.favoriteDeckId='';
    p.account.updatedAt=new Date().toISOString();
  }
  await persistReliable(p,storage);return p
}
export async function recordDeckSelection({playerName,deckId=null,deckName='',commander1='',commander2='',source='setup'}={},storage=globalThis.localStorage){const p=loadProfile(storage),key=playerKey(playerName),name=cleanName(playerName);const row=p.players[key]||{name,games:0,wins:0,decks:{},lastPlayedAt:null};row.name=name;const did=deckId||deckName||[commander1,commander2].filter(Boolean).join(' + ')||'unspecified';row.decks[did]={...(row.decks[did]||{}),id:did,name:deckName||did,commander1,commander2,source,selections:(row.decks[did]?.selections||0)+1,lastSelectedAt:new Date().toISOString()};p.players[key]=row;await persistReliable(p,storage);return p}
export async function recordGame(game,localPlayerId=null,storage=globalThis.localStorage){const p=loadProfile(storage);const completionId=game?.completionId||null;if(completionId&&p.history?.some?.(h=>h.completionId===completionId))return p;p.games++;const winnerId=game?.winner||game?.postGame?.winnerId||null;if(localPlayerId&&winnerId===localPlayerId)p.wins++;for(const a of game?.postGame?.awards||game?.awards||[])p.awards[a.label]=(p.awards[a.label]||0)+1;for(const gp of game?.players||[]){const key=playerKey(gp.displayName),row=p.players[key]||{name:cleanName(gp.displayName),games:0,wins:0,decks:{}};row.games=(row.games||0)+1;if(gp.playerId===winnerId)row.wins=(row.wins||0)+1;row.lastPlayedAt=new Date().toISOString();const commanders=(gp.commanders||[]).map(c=>game.cardDefinitions?.[c.cardId]?.name||c.card?.name).filter(Boolean);const did=gp.deck?.savedDeckId||gp.deck?.sourceId||gp.deck?.sourceName||commanders.join(' + ')||'unspecified';row.decks=row.decks||{};row.decks[did]={...(row.decks[did]||{}),id:did,name:gp.deck?.sourceName||did,commander1:commanders[0]||'',commander2:commanders[1]||'',games:(row.decks[did]?.games||0)+1,wins:(row.decks[did]?.wins||0)+(gp.playerId===winnerId?1:0),lastPlayedAt:row.lastPlayedAt};p.players[key]=row}const ms=[];if(p.games>=1)ms.push('First Game');if(p.games>=10)ms.push('Table Regular');if(p.games>=50)ms.push('Commander Veteran');if(p.wins>=10)ms.push('Ten Wins');p.milestones=[...new Set([...p.milestones,...ms])];const winner=(game?.players||[]).find(x=>x.playerId===winnerId);
const completedAt=new Date().toISOString();
p.history.unshift({
  at:completedAt,
  completionId,
  result:game?.result||(winnerId?'winner':'draw'),
  winnerId,
  winnerName:winner?.displayName||'',
  turnNumber:Number(game?.turnNumber||0),
  mode:game?.mode||'',
  awards:(game?.postGame?.awards||game?.awards||[]).map(a=>({label:a.label||'',playerId:a.playerId||'',playerName:(game?.players||[]).find(x=>x.playerId===a.playerId)?.displayName||''})),
  players:(game?.players||[]).map(x=>{
    const commanders=(x.commanders||[]).map(c=>game.cardDefinitions?.[c.cardId]?.name||c.card?.name).filter(Boolean);
    return {name:x.displayName,playerId:x.playerId,life:Number(x.life||0),deckId:x.deck?.savedDeckId||x.deck?.sourceId||'',deckName:x.deck?.sourceName||'',commanders};
  })
});
p.history=p.history.slice(0,50);await persistReliable(p,storage);return p}

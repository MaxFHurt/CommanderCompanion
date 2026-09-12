import { eligibleTrackedCards } from './deck.js?v=0722';
import { modePolicy } from './modes.js?v=0722';

export function trackedDeckSource(deck,{zones=['library']}={}) {
  return { kind:'tracked-deck', async list(){ return eligibleTrackedCards(deck,{zones}); } };
}
export function definitionPoolSource(definitions=[]) {
  return { kind:'definition-pool', async list(){ return [...definitions]; } };
}
export function globalCardSource(searchFn) {
  return { kind:'global', async search(query,options){ return searchFn(query,options); } };
}

function normalized(s=''){return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}
function distance(a,b){a=normalized(a);b=normalized(b);const m=a.length,n=b.length,d=Array.from({length:m+1},()=>Array(n+1));for(let i=0;i<=m;i++)d[i][0]=i;for(let j=0;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n]}
export function rankCardMatches(rows=[],query=''){
  const q=normalized(query);
  return [...rows].sort((a,b)=>{
    const an=normalized(a.name),bn=normalized(b.name);
    const score=n=>n===q?0:n.startsWith(q)?1:n.includes(q)?2:3;
    return score(an)-score(bn)||distance(an,q)-distance(bn,q)||an.localeCompare(bn)||(a.set||'').localeCompare(b.set||'');
  });
}
export function isBasicLandDefinition(card){return /\bBasic Land\b/i.test(card?.typeLine||'')&&/^(Plains|Island|Swamp|Mountain|Forest)$/i.test(card?.name||'')}

export async function pickerPool({mode='fully-tracked',source,query='',filter=null,basicLandsOnly=false,searchOptions={}}) {
  const policy=modePolicy(mode);
  if(source.kind==='global'&&!policy.globalCardSearch) throw new Error('Global card database is not an authorized selection source in Fully Tracked mode.');
  let rows;
  if(source.kind==='tracked-deck'||source.kind==='definition-pool') rows=await source.list();
  else rows=await source.search(query,{...searchOptions,basicLandsOnly});
  if(basicLandsOnly) rows=rows.filter(isBasicLandDefinition);
  if(filter) rows=rows.filter(filter);
  return rankCardMatches(rows,query);
}
export function createPickerContext({callerContext,playerId,source,allowedZones=['library'],selectionLimit=1,confirmationLabel='CONFIRM',mode='fully-tracked',filter=null,basicLandToggle=false}){
  if(!callerContext||!playerId||!source) throw new Error('Picker requires caller context, player, and source adapter.');
  return {callerContext,playerId,source,allowedZones,selectionLimit,confirmationLabel,mode,filter,basicLandToggle};
}

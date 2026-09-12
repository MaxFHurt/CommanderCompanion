const TYPE_KEYS=['Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker','Battle','Land'];
const COLOR_KEYS=['W','U','B','R','G'];

function quantityOf(entry){const q=Number(entry?.quantity??entry?.qty??1);return Number.isFinite(q)&&q>0?q:0}
function definitionMap(definitions=[]){return definitions instanceof Map?definitions:new Map((definitions||[]).filter(Boolean).map(d=>[d.definitionId,d]))}

export function manaValueFromCost(cost=''){
  const symbols=[...String(cost||'').matchAll(/\{([^}]+)\}/g)].map(m=>String(m[1]||'').toUpperCase());
  let mv=0;
  for(const s of symbols){
    if(/^\d+$/.test(s)){mv+=Number(s);continue}
    if(s==='X'||s==='Y'||s==='Z')continue;
    if(s.includes('/')){mv+=1;continue}
    if(/^[WUBRGCS]$/.test(s)){mv+=1;continue}
  }
  return mv;
}

export function analyzeDeck({manifest=[],definitions=[]}={}){
  const defs=definitionMap(definitions);
  const typeCounts=Object.fromEntries(TYPE_KEYS.map(k=>[k,0]));
  const colorIdentityCounts=Object.fromEntries(COLOR_KEYS.map(k=>[k,0]));
  const curve={'0-1':0,'2':0,'3':0,'4':0,'5':0,'6':0,'7+':0};
  let total=0,lands=0,nonlands=0,nonlandManaTotal=0,unresolved=0;
  for(const entry of manifest||[]){
    const qty=quantityOf(entry);if(!qty)continue;total+=qty;
    const d=defs.get(entry.definitionId);if(!d){unresolved+=qty;continue}
    const type=String(d.typeLine||'');
    for(const k of TYPE_KEYS)if(new RegExp(`\\b${k}\\b`,'i').test(type))typeCounts[k]+=qty;
    const isLand=/\bLand\b/i.test(type);if(isLand){lands+=qty}else{
      nonlands+=qty;const mv=manaValueFromCost(d.manaCost||'');nonlandManaTotal+=mv*qty;
      const bucket=mv<=1?'0-1':mv>=7?'7+':String(mv);curve[bucket]+=qty;
    }
    const ci=Array.isArray(d.colorIdentity)?d.colorIdentity:[];
    for(const c of COLOR_KEYS)if(ci.includes(c))colorIdentityCounts[c]+=qty;
  }
  return {
    total,lands,nonlands,unresolved,typeCounts,colorIdentityCounts,curve,
    averageNonlandManaValue:nonlands?Number((nonlandManaTotal/nonlands).toFixed(2)):0,
    landPercent:total?Number(((lands/total)*100).toFixed(1)):0
  };
}

export function deckAnalyticsHtml(a={}){
  const t=a.typeCounts||{},c=a.curve||{},ci=a.colorIdentityCounts||{};
  const typeRows=['Creature','Artifact','Enchantment','Instant','Sorcery','Planeswalker','Battle'].filter(k=>Number(t[k]||0)>0).map(k=>`<span><b>${k}</b> ${Number(t[k]||0)}</span>`).join('');
  const curveRows=['0-1','2','3','4','5','6','7+'].map(k=>`<span><b>${k}</b> ${Number(c[k]||0)}</span>`).join('');
  const colorRows=['W','U','B','R','G'].filter(k=>Number(ci[k]||0)>0).map(k=>`<span><b>${k}</b> ${Number(ci[k]||0)}</span>`).join('')||'<span><b>Colorless</b></span>';
  return `<div class="deck-analytics-panel"><div class="deck-analytics-summary"><span><b>Cards</b> ${Number(a.total||0)}</span><span><b>Lands</b> ${Number(a.lands||0)} (${Number(a.landPercent||0)}%)</span><span><b>Avg. nonland MV</b> ${Number(a.averageNonlandManaValue||0).toFixed(2)}</span></div><div class="deck-analytics-block"><strong>TYPE COUNTS</strong><div class="deck-analytics-row">${typeRows||'<span>No resolved card types yet.</span>'}</div></div><div class="deck-analytics-block"><strong>MANA CURVE — NONLAND CARDS</strong><div class="deck-analytics-row">${curveRows}</div></div><div class="deck-analytics-block"><strong>COLOR IDENTITY PRESENCE</strong><div class="deck-analytics-row">${colorRows}</div></div>${a.unresolved?`<div class="bad">${Number(a.unresolved)} unresolved card${Number(a.unresolved)===1?'':'s'} excluded from analytics.</div>`:''}</div>`;
}

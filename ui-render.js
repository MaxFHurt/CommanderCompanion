import { validatePlay, validateAttack, availableActivatedAbilities, validateActivatedAbilityFull, playerManaAvailability } from './rules-v0725.js?v=080-ba';
import { modePolicy } from './modes.js?v=0722';
import { phaseLabel } from './phase.js?v=0727';
const MANA=[['W','white'],['U','blue'],['B','black'],['R','red'],['G','green'],['C','colorless']];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const defOf=(game,instanceOrId)=>{const id=typeof instanceOrId==='string'?instanceOrId:instanceOrId?.definitionId,base=game.cardDefinitions?.[id]||null;if(!base||typeof instanceOrId==='string')return base;const i=Number.isInteger(instanceOrId?.activeFaceIndex)?instanceOrId.activeFaceIndex:null,face=i===null?null:base.cardFaces?.[i];return face?{...base,...face,definitionId:base.definitionId,colorIdentity:base.colorIdentity,cardFaces:base.cardFaces,set:base.set,collectorNumber:base.collectorNumber,printing:base.printing,legalities:base.legalities,hydrationStatus:base.hydrationStatus}:base};
const imageOf=d=>d?.imageUris?.normal||d?.imageUris?.large||d?.imageUris?.small||'cc-commander-fallback.png';
function legalManaKeys(game,p,{includeColorless=true}={}){const set=new Set();for(const cmd of p?.commanders||[]){const d=game?.cardDefinitions?.[cmd.cardId];for(const c of d?.colorIdentity||[])if(['W','U','B','R','G'].includes(c))set.add(c)}if(includeColorless)set.add('C');return set}
function flexibleManaMarkup(options=[],count=1){
  const opts=[...new Set((options||[]).filter(k=>MANA.some(([mk])=>mk===k)))];
  if(opts.length===1){const row=MANA.find(([mk])=>mk===opts[0]);return `<span class="mana-pip mana-flex mana-zone-source" aria-label="${opts[0]} mana source, ${count} available"><img src="mana-${row?.[1]||'colorless'}.png" alt="${opts[0]}"><b>${count}</b></span>`;}
  if(opts.length>=5)return `<span class="mana-pip mana-flex mana-flex-any" aria-label="Any-color flexible mana source, ${count} available"><img class="mana-flex-split mana-any-color-icon" src="mana-any-color.png?v=080-ba" alt="Any color"><b>${count}</b></span>`;
  const pair=opts.slice(0,2);if(pair.length<2)return '';
  const key=[...pair].sort().join('-');
  return `<span class="mana-pip mana-flex" aria-label="${pair.join(' or ')} flexible mana source, ${count} available"><img class="mana-flex-split" src="mana-split-${key}.png?v=080-ba" alt="${pair.join(' / ')}"><b>${count}</b></span>`;
}
function manaBox(game,title,p,pool,interactive=true){
  const availability=playerManaAvailability(p,game),available=p.mana?.available||{},total=p.mana?.total||{};
  const fixed=MANA.filter(([k])=>Number(available[k]||0)>0);
  const groups=new Map();for(const src of availability.__flex||[]){const opts=(src.options||[]).filter(k=>MANA.some(([mk])=>mk===k));if(opts.length){const key=opts.join('/');groups.set(key,(groups.get(key)||0)+1)}}
  const flex=[...groups.entries()].map(([key,count])=>flexibleManaMarkup(key.split('/'),count)).join('');
  const items=fixed.map(([k,n])=>{const a=Math.max(0,Number(available[k]||0)),t=Math.max(0,Number(total[k]||0)),state=a>t?'mana-over':a<t?'mana-under':'mana-even';return `<span class="mana-pip ${state}"><img src="mana-${n}.png" alt="${k}"><b>${a}</b></span>`}).join('')+flex;
  return `<button class="mana-box mana-box-button available-only" ${interactive?'data-mana-pool="available"':'aria-disabled="true"'} aria-label="Available mana"><h3>${esc(title||'AVAILABLE MANA')}</h3><div class="mana-row" style="--mana-count:${Math.max(1,fixed.length+groups.size)}">${items||''}</div></button>`
}
function statusGlyph(name=''){const s=String(name).toLowerCase();if(s.includes('monarch'))return'♛';if(s.includes('initiative'))return'◆';if(s.includes('city'))return'◇';if(s.includes('poison'))return'☠';if(s.includes('stun'))return'✦';return'●'}
function statusIndicator(p){const rows=(p.statuses||[]).filter(Boolean);if(!rows.length)return `<span class="status-indicator status-healthy" aria-label="Healthy" title="Healthy"><span class="status-cycle active"><i class="healthy-light"></i></span></span>`;return `<button class="status-indicator status-affected" data-status-indicator="${esc(p.playerId)}" aria-label="View active statuses">${rows.map((s,i)=>`<span class="status-cycle" style="--status-index:${i};--status-count:${rows.length}" title="${esc(s)}">${statusGlyph(s)}</span>`).join('')}</button>`}
function commanderHtml(game,c,interactive=true,playerId=''){const d=game.cardDefinitions?.[c.cardId];const attrs=interactive?`data-commander="${esc(c.id)}"`:`data-public-commander="${esc(c.id)}" data-public-player="${esc(playerId)}"`;return `<button class="commander-card" ${attrs}><img src="${esc(imageOf(d))}" alt="${esc(d?.name||'Commander')}"><span class="cmd-name">${esc(d?.name||'Commander')}</span><span class="tax-badge">TAX ${c.commanderTax||0}</span></button>`}
function cardButton(game,c,cls='battle-card',playerId=null,interactive=true){const d=defOf(game,c);const counters=Object.entries(c.counters||{}).filter(([,n])=>Number(n)>0).map(([name,n])=>`${esc(name)} ×${Number(n)}`).join(' · ');return `<button class="${cls}${c.tapped?' tapped':''}" ${interactive?`data-instance="${esc(c.instanceId)}"`:`data-public-instance="${esc(c.instanceId)}" data-public-player="${esc(playerId||c.controllerId||c.ownerId||'')}"`} data-zone="${esc(c.zone)}">${counters?`<span class="card-counter-badge">${counters}</span>`:''}${d?`<img src="${esc(imageOf(d))}" alt="${esc(d.name)}"><span class="card-label">${esc(d.name)}</span>`:`<span class="card-label">Unresolved card</span>`}</button>`}
function playable(game,p,c){const d=defOf(game,c);const kind=/Land/i.test(d?.typeLine||'')?'land':'cast';return validatePlay({game,player:p,definition:d,instance:c,kind,definitions:new Map(Object.entries(game.cardDefinitions||{}))})}
function dockIcon(kind){const paths={
  'card-id':'<circle cx="23" cy="22" r="7"/><path d="M28 27l7 7"/><path d="M14 36h14"/>',
  chat:'<path d="M11 14h26v19H24l-8 6v-6h-5z"/><path d="M17 21h14M17 26h10"/>',
  rescue:'<circle cx="18" cy="18" r="5"/><circle cx="31" cy="19" r="4"/><path d="M8 38c1-8 6-12 11-12 6 0 11 4 12 12M28 28c5 0 9 3 11 9"/><path d="M24 11v8M20 15h8"/>',
  settings:'<circle cx="24" cy="24" r="7"/><path d="M24 8v6M24 34v6M8 24h6M34 24h6M13 13l4 4M31 31l4 4M35 13l-4 4M17 31l-4 4"/>',
  profile:'<circle cx="24" cy="18" r="7"/><path d="M11 39c2-9 8-12 13-12s11 3 13 12z"/>',
  home:'<path d="M9 23L24 10l15 13"/><path d="M14 21v18h20V21"/><path d="M21 39V28h6v11"/>'
};return `<svg class="dock-glyph dock-glyph-${kind}" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="dockMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".46" stop-color="#b8a5ca"/><stop offset=".7" stop-color="#7d36b9"/><stop offset="1" stop-color="#efe7f7"/></linearGradient></defs><g fill="none" stroke="url(#dockMetal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths[kind]||''}</g></svg>`}
function smartAction(game,p){
  // Smart Action is intentionally limited to real contextual actions. It must never advance or end a phase.
  if(game.phase==='draw'&&!p.confirmations?.draw)return {action:'draw',label:'DRAW',available:true,cue:'smart'};
  if(['combat','begin-combat','declare-attackers'].includes(game.phase)){
    const canAttack=(p.deck?.battlefield||[]).some(c=>{const d=defOf(game,c);return validateAttack({game,attackerId:p.playerId,defenderId:'other',instance:c,definition:d}).legal});
    if(canAttack)return {action:'attack',label:'ATTACK',available:true,cue:'smart'};
  }
  if(game.phase==='untap'&&(p.deck?.battlefield||[]).some(c=>c.tapped)&&!p.confirmations?.untap)return {action:'untap',label:'UNTAP',available:true,cue:'smart'};

  // Only call a turn "dead" when the app has enough information to make that conclusion conservatively.
  // Unknown/private network hands never trigger the END TURN recommendation.
  const handKnown=p.deck?.sourceType!=='network-public';
  const trackedHand=modePolicy(game.mode).hand&&!(game.mode==='freeplay'&&p.settings?.handTracking===false);
  const playableHand=(handKnown&&trackedHand?(p.deck?.hand||[]):[]).some(c=>playable(game,p,c).legal);
  const definitions=new Map(Object.entries(game.cardDefinitions||{}));
  const liveAbility=(p.deck?.battlefield||[]).some(c=>{
    const d=defOf(game,c);if(!d)return false;
    return availableActivatedAbilities({game,instance:c,definition:d}).some(x=>x.legal&&validateActivatedAbilityFull({game,player:p,instance:c,definition:d,ability:x.ability,definitions}).legal);
  });
  const lateTurn=['postcombat-main','end-step','cleanup'].includes(game.phase);
  const deadTurn=handKnown&&trackedHand&&lateTurn&&!playableHand&&!liveAbility;
  if(deadTurn)return {action:null,label:'',available:false,cue:'end-turn'};
  return {action:null,label:'',available:false,cue:'next-phase'};
}
function handHtml(game,p,privateVisible=true,controls=true,actionPlayer=p){
  const showHand=modePolicy(game.mode).hand&&!(game.mode==='freeplay'&&p.settings?.handTracking===false);
  if(p.deck.sourceType==='network-public')privateVisible=false;
  const cards=showHand&&privateVisible?p.deck.hand:[];
  const cardHtml=privateVisible?cards.map(c=>{const d=defOf(game,c),v=controls?playable(game,p,c):{legal:true};return `<button class="hand-card${v.legal?'':' unplayable'}${controls?'':' inspection-only'}" data-hand-card="${esc(c.instanceId)}" data-hand-player="${esc(p.playerId)}">${d?`<img src="${esc(imageOf(d))}" alt="${esc(d.name)}">`:`<span class="fallback">UNRESOLVED</span>`}${v.legal?'':'<i class="reason-dot"></i>'}</button>`}).join(''):'<span class="muted">Private hand</span>';
  const smart=smartAction(game,actionPlayer||p);
  const stackPending=!!(game.stack||[]).length;
  const nextCue=!stackPending&&smart.cue==='next-phase'?' smart-cue-next':'';
  const endCue=!stackPending&&smart.cue==='end-turn'?' smart-cue-end':'';
  const smartButton=smart.available
    ?`<button class="hub-mark smart-action-button smart-action-live" data-action="${smart.action}" aria-label="Smart action: ${smart.label}"><span>${smart.label}</span></button>`
    :`<button class="hub-mark smart-action-button smart-action-idle" type="button" aria-label="No smart action available" aria-disabled="true" disabled><span></span></button>`;
  const drawOverlay='',handLabel=game.deviceMode==='single-device'?`${String(p.displayName||'PLAYER').toUpperCase()} HAND`:'YOUR HAND';
  return `<section class="visual-hand-zone">${drawOverlay}<h3>${esc(handLabel)} (${showHand&&privateVisible?cards.length:'—'})</h3><div class="hand-strip hand-strip-framed">${showHand?cardHtml:'<span class="muted">Hand tracking is off</span>'}</div></section><div class="visual-bottom-controls"><div class="hub-phase-controls"><button class="${nextCue.trim()}" data-action="next-phase" aria-label="Next Phase"><span>NEXT PHASE</span></button><button class="${endCue.trim()}" data-action="end-turn" aria-label="End Turn"><span>END TURN</span></button></div><nav class="hand-hub-icons" aria-label="Game tools"><button data-hub="home" aria-label="Home">${dockIcon('home')}<span>HOME</span></button><button data-hub="card-id" aria-label="Card ID">${dockIcon('card-id')}<span>CARD ID</span></button><button data-hub="chat" aria-label="Game Chat">${dockIcon('chat')}<span>GAME CHAT</span></button>${smartButton}<button data-hub="rescue" aria-label="Player Rescue">${dockIcon('rescue')}<span>PLAYER RESCUE</span></button><button data-hub="settings" aria-label="Settings">${dockIcon('settings')}<span>SETTINGS</span></button><button data-hub="profile" aria-label="Profile">${dockIcon('profile')}<span>PROFILE</span></button></nav></div>`
}

function battlefieldHtml(game,p,{controls=true,privateHand=true,includeDock=true}={}){
  if(!modePolicy(game.mode).battlefield)return'';
  const drawAvailable=game.phase==='draw'&&!p.confirmations?.draw;
  const basic=p.deck.battlefield.filter(c=>/Basic Land/i.test(defOf(game,c)?.typeLine||''));
  const normal=p.deck.battlefield.filter(c=>!/Basic Land/i.test(defOf(game,c)?.typeLine||'')&&!c.attachedTo);
  const attachedByHost=new Map();for(const c of p.deck.battlefield.filter(c=>c.attachedTo)){if(!attachedByHost.has(c.attachedTo))attachedByHost.set(c.attachedTo,[]);attachedByHost.get(c.attachedTo).push(c)}
  const renderPermanent=c=>{const at=attachedByHost.get(c.instanceId)||[];if(!at.length)return cardButton(game,c,'battle-card',p.playerId,controls);return `<div class="battle-card-stack">${at.map((a,i)=>`<div class="battle-attachment-layer" style="--attach-index:${i+1}">${cardButton(game,a,'battle-card attachment-card',p.playerId,controls)}</div>`).join('')}<div class="battle-host-layer">${cardButton(game,c,'battle-card host-card',p.playerId,controls)}</div></div>`};
  const isManaSource=c=>{const d=defOf(game,c),t=String(d?.typeLine||''),o=String(d?.oracleText||'');return /\bLand\b/i.test(t)||/\bAdd\s+(?:\{|one |two |three |four |five )/i.test(o)};
  const bucket=c=>{const d=defOf(game,c),t=String(d?.typeLine||'');if(isManaSource(c))return 0;if(/Creature/i.test(t))return 1;if(/Artifact/i.test(t))return 2;if(/Enchantment/i.test(t))return 3;if(/Planeswalker|Battle/i.test(t))return 4;return 5};
  const orderedNormal=[...normal].sort((a,b)=>bucket(a)-bucket(b));
  const manaNormal=orderedNormal.filter(c=>bucket(c)===0),restNormal=orderedNormal.filter(c=>bucket(c)!==0);
  const groups=new Map();for(const c of basic){const d=defOf(game,c),k=d?.name||'Basic Land';if(!groups.has(k))groups.set(k,{d,count:0,cards:[]});const g=groups.get(k);g.count++;g.cards.push(c)}
  const basicHtml=[...groups.values()].map(({d,count,cards})=>{const representative=cards.find(c=>!c.tapped)||cards[0];return `<button class="battle-card basic-land-stack${representative?.tapped?' tapped':''}" data-instance="${esc(representative?.instanceId||'')}" title="${esc(d?.name)}" aria-disabled="${controls?'false':'true'}"><img src="${esc(imageOf(d))}" alt="${esc(d?.name)}"><span class="multiple-badge">×${count}</span><span class="card-label">${esc(d?.name)}</span></button>`}).join('');
  const battlefieldCardHtml=manaNormal.map(renderPermanent).join('')+basicHtml+restNormal.map(renderPermanent).join('');
  const attackers=p.deck.battlefield.filter(c=>{const d=defOf(game,c);return validateAttack({game,attackerId:p.playerId,defenderId:'other',instance:c,definition:d}).legal});
  const canAttack=['combat','begin-combat','declare-attackers'].includes(game.phase)&&attackers.length>0;
  const definitions=new Map(Object.entries(game.cardDefinitions||{}));
  const abilityCards=normal.filter(c=>{const d=defOf(game,c);return availableActivatedAbilities({game,instance:c,definition:d}).some(x=>x.legal&&validateActivatedAbilityFull({game,player:p,instance:c,definition:d,ability:x.ability,definitions}).legal)});
  const canCastGraveyard=(p.temporaryPermissions||[]).some(x=>x?.kind==='cast-from-zone'&&x?.zone==='graveyard');const castableHand=(modePolicy(game.mode).hand&&p.deck.sourceType!=='network-public')?(p.deck.hand||[]).filter(c=>playable(game,p,c).legal):[];const castableGraveyard=(canCastGraveyard&&p.deck.sourceType!=='network-public')?(p.deck.graveyard||[]).filter(c=>!/Land/i.test(defOf(game,c)?.typeLine||'')&&playable(game,p,c).legal):[];
  const attackActions=canAttack?attackers.map(c=>{const d=defOf(game,c);return `<button class="available card-specific-action attack-action" data-attack-card="${esc(c.instanceId)}"><span class="action-icon">⚔</span><span>ATTACK<br>${esc(d?.name||'CREATURE')}</span></button>`}):[];
  const graveyardCastActions=castableGraveyard.map(c=>{const d=defOf(game,c);return `<button class="available card-specific-action play-action special-zone-play" data-play-card="${esc(c.instanceId)}"><img src="${esc(imageOf(d))}" alt=""><span>CAST FROM GRAVEYARD<br>${esc(d?.name||'CARD')}</span></button>`});
  const actions=[drawAvailable?'<button class="available" data-action="draw">▣＋<br>DRAW CARD</button>':'',canAttack?'<button class="available primary-action" data-action="attack">⚔<br>DECLARE ATTACKERS</button>':'',...attackActions,...graveyardCastActions,...abilityCards.map(c=>{const d=defOf(game,c);return `<button class="available card-specific-action" data-ability-card="${esc(c.instanceId)}"><img src="${esc(imageOf(d))}" alt=""><span>ACTIVATE<br>${esc(d?.name||'ABILITY')}</span></button>`})].filter(Boolean).join('');
  const untapPending=game.phase==='untap'&&p.deck.battlefield.some(c=>c.tapped)&&!p.confirmations?.untap;
  const overlay=untapPending?`<button class="untap-overlay" data-action="untap">↻ <b>UNTAP YOUR CARDS</b><small>Required before Next Phase</small></button>`:'';
  const controlHtml=controls?`<div class="action-grid visual-actions-hidden">${actions||''}</div>${includeDock?handHtml(game,p,privateHand,controls):''}`:'';
  const zoneButton=(zone,label,count)=>`<button class="zone-${zone}" ${controls?`data-zone-open="${zone}"`:`data-public-zone="${zone}" data-public-player="${esc(p.playerId)}"`} aria-label="${label} ${count}"><span>${label}</span></button>`;
  const players=game.players||[],playerIndex=Math.max(0,players.findIndex(x=>x.playerId===p.playerId)),playerCount=Math.max(1,players.length);
  const playerNav=`<nav class="battle-player-nav" aria-label="Player board navigation"><button data-player-nav="prev" aria-label="Previous player">‹</button><span>PLAYER ${playerIndex+1} OF ${playerCount}</span><button data-player-nav="next" aria-label="Next player">›</button></nav>`;
  return `<section class="battle-panel" data-board-open="1"><div class="battle-head shared-battle-phase-head"><h3>BATTLEFIELD</h3>${playerNav}<div class="battle-phase-indicator"><span>Phase:</span> <b>${phaseLabel(game.phase)}</b></div></div><div class="battlefield-wrap"><div class="battlefield">${battlefieldCardHtml}</div>${controls?overlay:''}</div><div class="zones">${zoneButton('graveyard','GRAVEYARD',p.deck.graveyard.length)}${zoneButton('exile','EXILE',p.deck.exile.length)}${zoneButton('tokens','TOKENS',p.deck.tokens.length)}${zoneButton('attachments','ATTACHMENTS',p.deck.attachments.length)}</div>${controlHtml}</section>`
}

function renderInlineGameLog(game){
  const current=Math.max(1,Number(game.turnNumber||1)),previous=Math.max(1,current-1),displayRound=Math.max(1,Number(game.roundNumber||1));
  const events=(game.log||[]).filter(e=>{const t=Number(e?.turn||current);return t===current||t===previous}).slice(0,80);
  const rows=[];
  const currentEvents=events.filter(e=>Number(e?.turn||current)===current);
  if(currentEvents.length) rows.push(...currentEvents.map(e=>`<div class="inline-log-event"><span>${esc(e?.text||'Game update')}</span></div>`));
  else rows.push(`<div class="inline-log-empty">No recorded events this turn.</div>`);
  if(previous!==current){
    rows.push(`<div class="inline-log-turn last-turn-only"><b>PREVIOUS TURN</b></div>`);
    const previousEvents=events.filter(e=>Number(e?.turn||current)===previous);
    if(previousEvents.length) rows.push(...previousEvents.map(e=>`<div class="inline-log-event"><span>${esc(e?.text||'Game update')}</span></div>`));
    else rows.push(`<div class="inline-log-empty">No recorded events on the previous turn.</div>`);
  }
  const top=(game.stack||[]).at(-1)||null,pending=!!top,pendingGuided=!!top?.guidedResolution;
  if(pending)rows.unshift(`<div class="inline-resolution-required"><b>${pendingGuided?'RESOLUTION REQUIRED':'STACK PENDING'}</b></div>`);
  return `<section class="inline-game-log${pending?' resolution-required':''}" aria-label="${pending?'Unresolved stack object. Tap to open Game Log.':'Current and previous turn game log'}"><div class="inline-log-label" aria-hidden="true"><b>GAME</b><b>LOG</b></div><div class="inline-game-log-scroll">${rows.join('')}</div><button class="inline-log-undo" data-log-undo="1" aria-label="Undo last game step" title="Undo last game step">↶</button><div class="inline-log-turn-count" aria-label="Turn ${displayRound}"><b>TURN</b><strong>${displayRound}</strong></div></section>`;
}

export function renderActivePlayer(game,p,{controls=true,privateHand=true,inspected=false,includeDock=true}={}){const tracking=game.mode!=='freeplay'||p.settings?.handTracking!==false;const playerSlot=Math.max(1,(game.players||[]).findIndex(x=>x.playerId===p.playerId)+1);const handCount=p.deck.sourceType==='network-public'?(p.publicCounts?.hand||0):(p.deck?.hand?.length||0),libCount=p.deck.sourceType==='network-public'?(p.publicCounts?.library||0):(p.deck?.remainingLibrary?.length||0);return `<section class="player-card active player-slot-${playerSlot}${inspected?' inspected-opponent':''} new-visual-master" data-player="${esc(p.playerId)}"><div class="player-hero"><div class="commanders" style="--commander-count:${Math.max(1,p.commanders.length)}">${p.commanders.map(c=>commanderHtml(game,c,controls,p.playerId)).join('')}</div><div class="player-info"><header class="player-head"><h2 class="player-name">${esc(p.displayName)}</h2>${statusIndicator(p)}<div class="player-stats-line"><span class="stat life-stat"><i class="icon">♥</i><strong class="${p.lifeFeedback?.until>Date.now()?`life-feedback-${p.lifeFeedback.direction}`:''}" data-life-player="${esc(p.playerId)}">${p.life}</strong><small>LIFE</small></span>${tracking?`<span class="stat"><i class="icon">▤</i><strong>${handCount}</strong><small>HAND</small></span><span class="stat"><i class="icon">▱</i><strong>${libCount}</strong><small>LIBRARY</small></span>`:''}</div></header>${modePolicy(game.mode).battlefield?manaBox(game,'AVAILABLE MANA',p,'available',controls):''}</div></div>${battlefieldHtml(game,p,{controls,privateHand,includeDock})}</section>`}
function renderSinglePlayerWindow(game,viewed,controlPlayer,privateHand){const canControl=viewed.playerId===controlPlayer.playerId,single=game.deviceMode==='single-device',handPlayer=single?viewed:controlPlayer,handPrivate=single?true:privateHand,handControls=handPlayer.playerId===controlPlayer.playerId;return renderInlineGameLog(game)+`<div class="player-window">${renderActivePlayer(game,viewed,{controls:canControl,privateHand:single?privateHand:(canControl&&privateHand),inspected:!canControl,includeDock:false})}</div>`+handHtml(game,handPlayer,handPrivate,handControls,controlPlayer)}
export function renderGame(game,viewPlayerId=null){const control=game.players.find(x=>x.playerId===game.activePlayerId)||game.players[0];const viewed=game.players.find(x=>x.playerId===viewPlayerId)||control;return renderSinglePlayerWindow(game,viewed,control,true)}
export function renderPlayerClient(game,playerId,viewPlayerId=null){const control=game.players.find(x=>x.playerId===playerId)||game.players[0];const viewed=game.players.find(x=>x.playerId===viewPlayerId)||control;return renderSinglePlayerWindow(game,viewed,control,true)}

export function renderHostDashboard(game){
  const cols=game.players.length<=2?2:game.players.length<=4?2:3;
  return `<section class="host-dashboard"><header class="host-banner"><div><b>NEUTRAL HOST / JUDGE VIEW</b><span>${esc(game.multiplayer?.roomCode||'')}</span></div><button data-host-gm="1">GM / JUDGE</button></header><div class="host-player-grid" style="--host-cols:${cols}">${game.players.map(p=>{const c=p.commanders?.[0],d=c&&game.cardDefinitions?.[c.cardId];return `<article class="host-player-card" data-host-player="${esc(p.playerId)}"><header><h2>${esc(p.displayName)}</h2><strong class="host-life">${p.life}</strong></header><div class="host-quick"><span>POISON <b>${p.poison||0}</b></span><span>HAND <b>${p.publicCounts?.hand??p.deck?.hand?.length??0}</b></span><span>LIB <b>${p.publicCounts?.library??p.deck?.remainingLibrary?.length??0}</b></span><span>TAX <b>${c?.commanderTax||0}</b></span></div>${p.statuses?.length?`<div class="host-status">${p.statuses.map(x=>`<span class="status-pill">${esc(x)}</span>`).join('')}</div>`:''}<div class="host-commander">${d?`<img src="${esc(imageOf(d))}" alt="${esc(d.name)}"><span>${esc(d.name)}</span>`:'<span class="muted">Commander data pending</span>'}</div><div class="host-controls"><button data-host-adjust="${esc(p.playerId)}">COUNTERS / STATUS</button><button data-host-focus="${esc(p.playerId)}">VIEW PLAYER</button></div></article>`}).join('')}</div></section>`
}

export function renderTabletop(game){
  const mana=[['W','mana-white.png','White'],['U','mana-blue.png','Blue'],['B','mana-black.png','Black'],['R','mana-red.png','Red'],['G','mana-green.png','Green'],['C','mana-colorless.png','Colorless']];
  const isTracker=game.mode==='table-tracker'||game.mode==='tabletop';
  if(!isTracker){const n=game.players.length,cols=n<=2?n:n<=4?2:3;return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-auto-rows:1fr;gap:8px;min-height:calc(100dvh - 20px)">${game.players.map(p=>`<section class="tabletop-panel"><h2>${esc(p.displayName)}</h2><div class="tt-life">${p.life}</div><div>POISON ${p.poison||0}</div>${p.statuses?.length?`<div>${p.statuses.map(esc).join(' • ')}</div>`:''}<div>${p.commanders.map(c=>`${esc(game.cardDefinitions?.[c.cardId]?.name||'COMMANDER')} — TAX ${c.commanderTax}`).join('<br>')}</div></section>`).join('')}</div>`}
  const quickCounterNames=['Energy','Experience','Rad'];
  const counterStepper=(p,key,label=key)=>{const step=key==='Commander Tax'?2:1;return `<div class="tracker-extra-counter" data-tt-counter-wrap="${esc(key)}"><small>${esc((key==='Commander Tax'?'CMD TAX':label).toUpperCase())}</small><div class="tracker-stepper"><button data-tt-inline-counter="${esc(key)}" data-player="${esc(p.playerId)}" data-delta="-${step}" aria-label="Decrease ${esc(label)}">−</button><strong data-tt-counter-value="${esc(key)}">${Number(p.counters?.[key]||0)}</strong><button data-tt-inline-counter="${esc(key)}" data-player="${esc(p.playerId)}" data-delta="${step}" aria-label="Increase ${esc(label)}">+</button></div></div>`};
  const cards=game.players.map((p,idx)=>{
    const statusRows=(p.statuses||[]).filter(Boolean),statusText=statusRows.length?esc(statusRows.join(' • ')):'CLEAR';
    const customCounters=Object.keys(p.counters||{}).filter(k=>k!=='+1/+1'&&!quickCounterNames.includes(k)&&k!=='Commander Tax');
    const extraCounters=[...(p.commanders?.length?[]:['Commander Tax']),...quickCounterNames,...customCounters];
    return `<section class="tracker-player-card tracker-normal-player-card player-slot-${idx+1}" data-tt-player="${esc(p.playerId)}">
      <header class="tracker-player-head">
        <button class="tracker-name" data-tt-name="${esc(p.playerId)}" title="Tap to edit player name">${esc(p.displayName||'Player')}</button>
        <button class="tracker-status${statusRows.length?' is-affected':' is-clear'}" data-tt-status="${esc(p.playerId)}" title="Tap to edit player status"><span class="tracker-status-light" aria-hidden="true"></span><span><small>STATUS</small><strong>${statusText}</strong></span></button>
      </header>
      <div class="tracker-primary-row">
        <div class="tracker-stat tracker-life"><small>LIFE</small><div class="tracker-stepper"><button data-tt-inline-stat="life" data-player="${esc(p.playerId)}" data-delta="-1" aria-label="Decrease life">−</button><strong data-tt-stat-value="life">${Number(p.life||0)}</strong><button data-tt-inline-stat="life" data-player="${esc(p.playerId)}" data-delta="1" aria-label="Increase life">+</button></div></div>
        <div class="tracker-stat"><small>POISON</small><div class="tracker-stepper"><button data-tt-inline-stat="poison" data-player="${esc(p.playerId)}" data-delta="-1" aria-label="Decrease poison">−</button><strong data-tt-stat-value="poison">${Number(p.poison||0)}</strong><button data-tt-inline-stat="poison" data-player="${esc(p.playerId)}" data-delta="1" aria-label="Increase poison">+</button></div></div>
        <div class="tracker-stat"><small>+1/+1</small><div class="tracker-stepper"><button data-tt-inline-stat="+1/+1" data-player="${esc(p.playerId)}" data-delta="-1" aria-label="Decrease +1/+1 counter stack">−</button><strong data-tt-stat-value="+1/+1">${Number(p.counters?.['+1/+1']||0)}</strong><button data-tt-inline-stat="+1/+1" data-player="${esc(p.playerId)}" data-delta="1" aria-label="Increase +1/+1 counter stack">+</button></div></div>
      </div>
      <div class="tracker-extra-counters">${extraCounters.map(k=>counterStepper(p,k,k)).join('')}<button class="tracker-add-counter" data-tt-add-counter="${esc(p.playerId)}">+ COUNTER</button></div>
      <div class="tracker-mana-row">${mana.map(([c,img,label])=>`<div class="tracker-mana" title="${label} mana"><img src="${img}" alt="${label}"><button data-tt-inline-mana="${c}" data-player="${esc(p.playerId)}" data-delta="-1" aria-label="Decrease ${label} mana">−</button><strong data-tt-mana-value="${c}">${Number(p.mana?.available?.[c]||0)}</strong><button data-tt-inline-mana="${c}" data-player="${esc(p.playerId)}" data-delta="1" aria-label="Increase ${label} mana">+</button><button class="tracker-mana-detail" data-tt-mana="${c}" data-player="${esc(p.playerId)}" aria-label="Edit ${label} mana details">⋯</button></div>`).join('')}</div>
      ${p.commanders?.length?`<div class="tracker-commanders">${p.commanders.map(c=>`<div class="tracker-commander-row"><span>${esc(game.cardDefinitions?.[c.cardId]?.name||'COMMANDER')}</span><small>COMMANDER TAX</small><div class="tracker-stepper"><button data-tt-inline-tax="${esc(c.id)}" data-player="${esc(p.playerId)}" data-delta="-2" aria-label="Decrease commander tax">−</button><strong data-tt-tax-value="${esc(c.id)}">${Number(c.commanderTax||0)}</strong><button data-tt-inline-tax="${esc(c.id)}" data-player="${esc(p.playerId)}" data-delta="2" aria-label="Increase commander tax">+</button></div></div>`).join('')}</div>`:''}
    </section>`;
  }).join('');
  const logs=(game.log||[]).slice(0,80).map(e=>`<div class="tracker-log-event"><b>T${Number(e.turn||game.turnNumber||1)}</b><span>${esc(e.text||'Game update')}</span></div>`).join('')||'<p class="muted">No game events yet. Player edits will appear here.</p>';
  return `<div class="tracker-shell tracker-count-${game.players.length}"><header class="tracker-head"><div><b>TABLE TRACKER</b><span>Physical table is authoritative • adjust common values directly</span></div><button id="trackerSave">SAVE</button><button id="trackerHome">HOME</button></header><div class="tracker-split"><div class="tracker-player-grid">${cards}</div><aside class="tracker-game-log"><div class="tracker-log-head"><b>GAME LOG</b><span>${(game.log||[]).length} EVENTS</span></div><div class="tracker-log-scroll">${logs}</div></aside></div></div>`
}

export function renderCardDetail(game,instance){const d=defOf(game,instance);if(!d)return`<p class="bad">Card data is unresolved.</p>`;return `<div class="card-detail"><img src="${esc(imageOf(d))}" alt="${esc(d.name)}"><div><h2>${esc(d.name)}</h2><p><b>${esc(d.typeLine)}</b></p><p class="oracle">${esc(d.oracleText)}</p><p class="muted">${esc(d.set?.toUpperCase()||'')} ${esc(d.collectorNumber||'')}</p></div></div>`}
export function zoneModal(game,p,zone){const key=zone==='library'?'remainingLibrary':zone==='command'?'commandZone':zone;const cards=p.deck[key]||[];return `<div class="zone-list"><div class="zone-row"><h3>${esc(zone.toUpperCase())} (${cards.length})</h3><div class="mini-cards">${cards.map(c=>cardButton(game,c,'mini-card')).join('')||'<span class="muted">Empty</span>'}</div></div></div>`}
export {defOf,imageOf,phaseLabel,playable,esc};

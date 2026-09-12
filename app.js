import { normalizeDeck, shuffleLibrary, drawOpeningHand, sync } from './deck.js?v=0722';
import { initializeGame } from './state.js?v=0722';
import { createTransactionEngine } from './transactions.js?v=0727';
import { saveToStorage, loadFromStorage, hasValidSave, saveDurable, loadDurable, loadBestAvailableSave, hasDurableSave } from './persistence.js?v=07953';
import { hydrateDeckList, resolveNamedCard, resolvePrinting, searchCards } from './card-api.js?v=07966';
import { validatePlay, validateCommanderConfiguration, validateDeckColorIdentity, validateAttack, validateBlock, planMana, parseManaCost, isCommanderEligible, isSecondaryCommanderEligible, allowsSecondaryCommander, canShareCommandZone, validateCommanderDeck, isBasicLand, basicLandManaColor, activatedAbilityLines as ruleActivatedAbilityLines, parseActivatedAbilities, availableActivatedAbilities, validateActivatedAbility, validateActivatedAbilityFull, DEFAULT_COMMANDER_RULES, normalizeRulesConfig, tapManaAbilities, manaOptionsFromAbility, isManaAbilityLine, canActivateTapAbility, entersBattlefieldTapped, blockerCapacity, attackerMinimumBlockers, validateForcedBlockAssignments, validateBlockAssignments, validateRequiredAttackers } from './rules-v0725.js?v=07973';
import { nextPhase, phaseLocked, satisfyGate, configurePhaseGates, isCombatPhase, phaseLabel } from './phase.js?v=0727';
import { initDeckStore, listDecks, saveDeck, deleteDeck } from './deck-store.js?v=0738';
import { listPrecons, loadPrecon } from './precons.js?v=0722';
import { buildPostGame } from './postgame.js?v=0722';
import { initProfileStore, loadProfile, saveAccountProfile, accountSetupDefaults, recordGame, recordDeckCreated, recordDeckDeleted, recordDeckSelection } from './profile.js?v=07973';
import { guidanceFor } from './guidance.js?v=0722';
import { createHostNetwork, joinHostNetwork, roomCode } from './network.js?v=0722';
import { networkStateStamp, validateRemoteStamp } from './network-state-guard.js?v=07971';
import { approvalResult, publicBroadcastState } from './multiplayer.js?v=0722';
import { trackedDeckSource, definitionPoolSource, globalCardSource, pickerPool } from './picker.js?v=0722';
import { renderGame, renderPlayerClient, renderHostDashboard, renderTabletop, renderCardDetail, zoneModal, defOf, imageOf, playable, esc } from './ui-render.js?v=07924-visual-master';
import { resolveCombat, cardHasKeyword } from './combat-engine.js?v=0727';
import { beginPriorityWindow, priorityHolder, recordPriorityResponse, passPriority, clearPriority } from './priority-engine.js?v=07967';
import { compileEffectText, applyEffects, locateCardInGame } from './effect-engine.js?v=0729';
import { asEntersChoiceSpec, entersWithCountersSpec, activatedAbilitySupport, spellSupport, analyzeDefinitionSupport, auditDefinitions } from './ability-support.js?v=0727';
import { queueTriggers, resolveTrigger } from './trigger-engine.js?v=07968';
import { parseManaBoxFileContents } from './deck-import.js?v=0738';
import { saveProfileBackupFile, restoreProfileBackupFile } from './profile-backup.js?v=07948';
import { buildStrategyAdvice } from './strategy-advisor.js?v=07974';
import { getAvailableActions } from './available-actions.js?v=07974';
import { analyzeDeck, deckAnalyticsHtml } from './deck-analytics.js?v=07964';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORAGE_KEY='commander-companion-v0.7';
let game=null,engine=null,selectedMode='fully-tracked',editingDeckId=null,network=null,chat=[],lastSaveError=null,statusCycleTimer=null,inspectedPlayerId=null,pendingRules={...DEFAULT_COMMANDER_RULES};const approvalCallbacks=new Map();const hostApprovals=new Map();
const definitionsMap=()=>new Map(Object.entries(game?.cardDefinitions||{}));
const userDataReady=Promise.allSettled([initDeckStore(),initProfileStore()]);

function toast(msg,bad=false){const t=$('#toast');t.textContent=msg;t.classList.toggle('bad',bad);t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}
function friendlySetupError(error){const raw=String(error?.message||error||'').trim();if(/quota|storage|exceeded|full/i.test(raw))return 'Local browser storage is temporarily unavailable. Setup can continue, but this game may not be saved until storage is available.';if(/fetch|network|failed to fetch|collection lookup|card search/i.test(raw))return 'Card lookup is temporarily unavailable. Already-saved local data remains available; retry the lookup when the connection recovers.';return raw||'Setup could not be completed. Check the highlighted setup fields and try again.'}
function showLanding(){game&&save();$('#landing').hidden=false;$('#gameScreen').hidden=true;$('#tabletopScreen').hidden=true;window.scrollTo(0,0)}
function showGame(){if(!game)return;$('#landing').hidden=true;$('#tabletopScreen').hidden=true;$('#gameScreen').hidden=false;render();window.scrollTo(0,0)}
function save(){
  if(!game)return true;
  let localOk=true;
  try{saveToStorage(game,localStorage,STORAGE_KEY);lastSaveError=null}catch(e){localOk=false;lastSaveError=e;console.warn('Commander Companion localStorage autosave fell back to IndexedDB:',e)}
  saveDurable(game,STORAGE_KEY).then(()=>{lastSaveError=null;refreshContinueButton()}).catch(e=>{lastSaveError=e;console.warn('Commander Companion durable autosave unavailable:',e)});
  return localOk;
}
let completionFinalizePromise=null;
function completionSummaryHtml(){
  if(game?.result==='draw'||(!game?.winner&&game?.status==='complete'))return `<h2>GAME ENDS IN A DRAW</h2><p>All remaining players left the game at the same time.</p>`;
  const w=game?.players?.find(p=>p.playerId===game?.winner);
  return `<h2>${esc(w?.displayName||'PLAYER')} WINS</h2><p>The rules engine has completed the game.</p>`;
}
async function finalizeAutomaticCompletion({showNotice=true}={}){
  if(!game||game.status!=='complete'||game.manualCompletionFinalizing)return false;
  if(game.completionRecordedAt){if(showNotice&&!game.completionNoticeShown){game.completionNoticeShown=true;save();openModal('GAME COMPLETE',completionSummaryHtml(),[{label:'HOME',className:'primary',onClick:()=>{closeModal();showLanding()}},{label:'CLOSE',onClick:closeModal}])}return true}
  if(completionFinalizePromise)return completionFinalizePromise;
  game.completionId=game.completionId||`game:${game.startedAt||'session'}:${game.turnNumber}:${Date.now()}`;
  game.result=game.result||(game.winner?'winner':'draw');
  game.postGame=game.postGame||buildPostGame(game,{winnerId:game.winner||null});
  const snapshotGame=game;
  completionFinalizePromise=(async()=>{
    try{
      await recordGame(snapshotGame,network?.localPlayerId||snapshotGame.players?.[0]?.playerId);
      if(game!==snapshotGame)return true;
      game.completionRecordedAt=new Date().toISOString();
      game.log.unshift({text:game.result==='draw'?'Game complete — draw recorded in player history.':`${game.players.find(p=>p.playerId===game.winner)?.displayName||'Winner'} wins — game recorded in player history.`,turn:game.turnNumber,phase:game.phase,at:new Date().toISOString(),type:'game-complete'});
      if(network?.host)network.host.broadcast({type:'state',game:publicGameForNetwork()});
      save();
      if(showNotice&&!game.completionNoticeShown){game.completionNoticeShown=true;save();openModal('GAME COMPLETE',completionSummaryHtml(),[{label:'HOME',className:'primary',onClick:()=>{closeModal();showLanding()}},{label:'CLOSE',onClick:closeModal}])}
      return true;
    }catch(e){console.warn('Automatic game-history finalization failed:',e);return false}
    finally{completionFinalizePromise=null}
  })();
  return completionFinalizePromise;
}
function createAutosavingEngine(g){
  const e=createTransactionEngine(g);
  const commit=e.commit.bind(e);e.commit=(action)=>{const result=commit(action);save();if(g.status==='complete')setTimeout(()=>finalizeAutomaticCompletion(),0);return result};
  if(typeof e.undo==='function'){const undo=e.undo.bind(e);e.undo=(...args)=>{if(g.completionRecordedAt){toast('Game completion is already recorded. Reopen the game from history instead of undoing past game end.',true);return false}const result=undo(...args);if(result)save();return result}}
  return e;
}
function activePlayer(){return game?.players.find(p=>p.playerId===game.activePlayerId)||game?.players[0]}
let priorityContinuation=null;
let resolvingPriority=false;
let priorityResponseTimer=null;
const PRIORITY_RESPONSE_SECONDS=69;
function clearPriorityResponseTimer(){if(priorityResponseTimer){clearInterval(priorityResponseTimer);priorityResponseTimer=null}}
function responseEligibleDefinition(d){return /Instant/i.test(d?.typeLine||'')||/\bFlash\b/i.test(d?.oracleText||'')}
function stackSummary(){const rows=(game?.stack||[]).slice().reverse();if(!rows.length)return '<p class="muted">The stack is empty.</p>';return `<div class="stack-summary"><b>STACK — TOP FIRST</b>${rows.map((x,i)=>`<div class="stack-row"><span>${i===0?'TOP':'↓'}</span><strong>${esc(x.label||def(x.sourceDefinitionId)?.name||x.kind||'Object')}</strong><small>${esc(game.players.find(p=>p.playerId===x.controllerId)?.displayName||'Controller')}</small></div>`).join('')}</div>`}
function compileTriggerMode(trigger,mode){
  const text=String(mode||'').trim(),source=String(trigger.sourceName||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp(`^Put (?:a|one) \+1/\+1 counter on (?:${source}|this (?:creature|permanent))\.?$`,'i').test(text))return {supported:true,effects:[{kind:'counter',bind:'sourceId',counter:'+1/+1',amount:1}],requirements:[],unsupported:[]};
  return compileEffectText(text,{sourceName:trigger.sourceName||'Triggered ability'});
}
function queueChosenTriggerMode(trigger,p,d,mode,done){
  const compiled=compileTriggerMode(trigger,mode);
  if(!compiled.supported){engine.commit({type:'put-trigger-stack',playerId:p.playerId,sourceId:trigger.sourceId,sourceDefinitionId:trigger.sourceDefinitionId,effects:[],effectBindings:{sourceId:trigger.sourceId},abilityText:`${trigger.abilityText} [Chosen: ${mode}]`,label:`${trigger.sourceName}: ${mode}`,guidedResolution:{title:`TRIGGER — ${trigger.sourceName}`,oracleText:mode,unsupported:compiled.unsupported||[mode]}});return processPendingTriggers(done)}
  collectCompiledBindings(p,d,compiled,bindings=>{engine.commit({type:'put-trigger-stack',playerId:p.playerId,sourceId:trigger.sourceId,sourceDefinitionId:trigger.sourceDefinitionId,effects:compiled.effects,effectBindings:{...bindings,sourceId:trigger.sourceId},abilityText:`${trigger.abilityText} [Chosen: ${mode}]`,label:`${trigger.sourceName}: ${mode}`});processPendingTriggers(done)},0,{sourceId:trigger.sourceId});
}
function chooseTriggeredMode(trigger,p,d,done){
  const hit=locateCardInGame(game,trigger.sourceId),source=hit?.card;
  const ledger=source?(source.triggerModeChoices=source.triggerModeChoices||{}):{};const key=`${trigger.abilityId||'trigger'}:${game.turnNumber}`;const used=new Set(ledger[key]||[]);
  const modes=(trigger.modal?.modes||[]).map((text,index)=>({text,index})).filter(x=>!trigger.modal?.uniquePerTurn||!used.has(x.index));
  if(!modes.length){game.log.unshift({text:`${trigger.sourceName} triggers, but every available mode has already been chosen this turn.`,turn:game.turnNumber});return processPendingTriggers(done)}
  openModal(`TRIGGER — ${trigger.sourceName}`,`<p>${esc(trigger.abilityText)}</p><p><b>Choose one${trigger.modal?.uniquePerTurn?' that has not been chosen this turn':''}.</b></p><div class="ability-choice-list">${modes.map(x=>`<button class="ability-choice available" data-trigger-mode="${x.index}"><strong>${esc(x.text)}</strong></button>`).join('')}</div>`,[]);
  $$('[data-trigger-mode]').forEach(b=>b.onclick=()=>{const index=Number(b.dataset.triggerMode),mode=trigger.modal.modes[index];if(source&&trigger.modal?.uniquePerTurn){ledger[key]=[...used,index];source.triggerModeChoices=ledger}closeModal();save();queueChosenTriggerMode(trigger,p,d,mode,done)});
}
function simultaneousTriggerOrderGroup(){
  const pending=game?.pendingTriggers||[],first=pending[0];
  if(!first?.simultaneousBatchId||first.stackOrderChosen)return null;
  const group=[];
  for(const trigger of pending){
    if(trigger.simultaneousBatchId!==first.simultaneousBatchId||trigger.controllerId!==first.controllerId)break;
    group.push(trigger);
  }
  return group.length>1?group:null;
}
function chooseSimultaneousTriggerOrder(group,done,chosen=[]){
  const controller=game.players.find(p=>p.playerId===group[0]?.controllerId);
  if(!controller){for(const trigger of group)trigger.stackOrderChosen=true;return processPendingTriggers(done)}
  if(chosen.length>=group.length){
    const chosenIds=new Set(chosen.map(t=>t.simultaneousTriggerId));
    const ordered=chosen.map(t=>({...t,stackOrderChosen:true}));
    const rest=game.pendingTriggers.filter(t=>!chosenIds.has(t.simultaneousTriggerId));
    game.pendingTriggers=[...ordered,...rest];
    closeModal();save();
    game.log.unshift({text:`${controller.displayName} ordered ${ordered.length} simultaneous triggers for the stack.`,turn:game.turnNumber,phase:game.phase});
    return processPendingTriggers(done);
  }
  const selected=new Set(chosen.map(t=>t.simultaneousTriggerId)),remaining=group.filter(t=>!selected.has(t.simultaneousTriggerId));
  const chosenHtml=chosen.length?`<div class="stack-summary"><b>STACK PLACEMENT — FIRST TO LAST</b>${chosen.map((t,i)=>`<div class="stack-row"><span>${i+1}</span><strong>${esc(t.sourceName||'Trigger')}</strong><small>${esc(t.abilityText||t.effectText||'Triggered ability')}</small></div>`).join('')}</div>`:'';
  const body=`<p><b>${esc(controller.displayName)}</b> controls multiple abilities that triggered at the same time.</p><p class="muted">Choose the trigger to put on the stack next. Triggers chosen later will sit above earlier choices and resolve first.</p>${chosenHtml}<div class="ability-choice-list">${remaining.map(t=>`<button class="ability-choice available" data-trigger-order="${esc(t.simultaneousTriggerId)}"><strong>${esc(t.sourceName||'Trigger')}</strong><small>${esc(t.abilityText||t.effectText||'Triggered ability')}</small></button>`).join('')}</div>`;
  openModal('ORDER SIMULTANEOUS TRIGGERS',body,[]);
  $$('[data-trigger-order]').forEach(b=>b.onclick=()=>{
    const next=remaining.find(t=>t.simultaneousTriggerId===b.dataset.triggerOrder);
    if(next)chooseSimultaneousTriggerOrder(group,done,[...chosen,next]);
  });
}
function processPendingTriggers(done=()=>{}){
  game.pendingTriggers=game.pendingTriggers||[];
  if(!game.pendingTriggers.length)return done();
  const orderGroup=simultaneousTriggerOrderGroup();
  if(orderGroup)return chooseSimultaneousTriggerOrder(orderGroup,done);
  const trigger=game.pendingTriggers.shift(),p=game.players.find(x=>x.playerId===trigger.controllerId),d=def(trigger.sourceDefinitionId)||{name:trigger.sourceName||'Triggered ability'};
  if(!p)return processPendingTriggers(done);
  if(trigger.modal?.modes?.length)return chooseTriggeredMode(trigger,p,d,done);
  if(!trigger.compiled?.supported){
    engine.commit({type:'put-trigger-stack',playerId:p.playerId,sourceId:trigger.sourceId,sourceDefinitionId:trigger.sourceDefinitionId,effects:[],effectBindings:{sourceId:trigger.sourceId},abilityText:trigger.abilityText,label:`${trigger.sourceName}: ${trigger.abilityText}`,guidedResolution:{title:`TRIGGER — ${trigger.sourceName}`,oracleText:trigger.abilityText||trigger.effectText,unsupported:trigger.compiled?.unsupported||[trigger.effectText]}});return processPendingTriggers(done);
  }
  collectCompiledBindings(p,d,trigger.compiled,bindings=>{
    engine.commit({type:'put-trigger-stack',playerId:p.playerId,sourceId:trigger.sourceId,sourceDefinitionId:trigger.sourceDefinitionId,effects:trigger.compiled.effects,effectBindings:{...bindings,sourceId:trigger.sourceId},abilityText:trigger.abilityText,label:`${trigger.sourceName}: ${trigger.abilityText}`});
    processPendingTriggers(done);
  });
}
function beginPriority(reason,stage,continuation=null,startingPlayerId=null){
  if(continuation)priorityContinuation=continuation;
  beginPriorityWindow(game,{reason,stage,startingPlayerId:startingPlayerId||game.activePlayerId});
  game.log.unshift({text:`Priority window opens: ${reason}.`,turn:game.turnNumber});
  openPriorityPrompt();
}
function resolveAfterAllPass(){
  if(resolvingPriority)return;resolvingPriority=true;
  const afterObject=()=>processPendingTriggers(()=>{resolvingPriority=false;render();save();if(game.stack?.length)return beginPriority('Stack object resolved. Players may respond before the next object resolves.','stack-resolution',null,game.activePlayerId);const next=priorityContinuation;priorityContinuation=null;next?.()});
  try{
    clearPriority(game);
    if(game.stack?.length){
      const top=game.stack[game.stack.length-1];
      if(top.guidedResolution){const gp=game.players.find(p=>p.playerId===top.controllerId)||activePlayer();return openGuidedResolver({player:gp,title:top.guidedResolution.title||`RESOLVE — ${top.label||'STACK OBJECT'}`,oracleText:top.guidedResolution.oracleText||'',unsupported:top.guidedResolution.unsupported||[],mustComplete:true,onComplete:()=>{try{engine.commit({type:'resolve-stack',playerId:top.controllerId,label:`Resolve ${top.label||'stack object'}`});afterObject()}catch(e){resolvingPriority=false;toast(e?.message||'The guided stack object could not finish resolving.',true);render()}}})}
      engine.commit({type:'resolve-stack',playerId:top.controllerId,label:`Resolve ${top.label||'stack object'}`});return afterObject();
    }
    const next=priorityContinuation;priorityContinuation=null;resolvingPriority=false;next?.();
  }catch(e){resolvingPriority=false;toast(e?.message||'The stack could not resolve.',true);render()}
}
function onStackObjectAdded(player,label,{continuation=null}={}){
  processPendingTriggers(()=>{
    if(game.priorityState?.active){
      try{recordPriorityResponse(game,{playerId:player.playerId,label})}catch(e){return toast(e.message,true)}
      closeModal();render();save();openPriorityPrompt();return;
    }
    beginPriority(`${label} is on the stack.`,'stack',continuation||(()=>render()),player.playerId);
  });
}
function legalPriorityOptions(holder){
  const gravePermission=(holder.temporaryPermissions||[]).some(x=>x?.kind==='cast-from-zone'&&x?.zone==='graveyard');
  const hand=[...(holder.deck?.hand||[]),...(gravePermission?(holder.deck?.graveyard||[]):[])].filter(c=>{
    const d=defOf(game,c);if(!responseEligibleDefinition(d))return false;
    const v=validatePlay({game,player:holder,definition:d,instance:c,kind:'cast',definitions:definitionsMap()});
    return !!v.legal;
  });
  const abilities=(holder.deck?.battlefield||[]).filter(c=>parseActivatedAbilities(defOf(game,c)).some(a=>!a.manaAbility&&validateActivatedAbilityFull({game,player:holder,instance:c,definition:defOf(game,c),ability:a,definitions:definitionsMap()}).legal));
  return {hand,abilities};
}

function anyPlayerHasLegalResponse(){
  return (game?.players||[]).filter(p=>!p.eliminated).some(p=>{const o=legalPriorityOptions(p);return o.hand.length||o.abilities.length});
}
function activeHasLegalMainAction(p){
  const available=getAvailableActions({game,player:p});
  if(Number(available?.count||0)>0)return true;
  for(const cmd of p.commanders||[]){
    if(cmd.zone!=='command')continue;
    const d=def(cmd.cardId),inst=p.deck?.commandZone?.find(c=>c.definitionId===cmd.cardId);
    if(d&&inst&&validatePlay({game,player:p,definition:d,instance:inst,kind:'cast',commander:cmd,definitions:definitionsMap()}).legal)return true;
  }
  return false;
}
function smartPhaseTransition(from,to,reason){
  const p=activePlayer();if(!p)return false;
  commitAction({type:'phase',playerId:p.playerId,phase:to,label:`Auto-pass: ${phaseLabel(from)} bypassed — ${reason}. Phase advances to ${phaseLabel(to)}.`});
  return true;
}
function runSmartPhaseSkips(){
  if(!game||game.priorityState?.active||(game.stack?.length||0)||(game.pendingTriggers?.length||0))return false;
  if(network?.localPlayerId&&network.localPlayerId!==game.activePlayerId)return false;
  const p=activePlayer();if(!p||p.eliminated)return false;
  let moved=false,safety=0;
  while(safety++<8){
    if(game.priorityState?.active||(game.stack?.length||0)||(game.pendingTriggers?.length||0))break;
    const phase=game.phase;
    if(phase==='untap'){
      if((p.deck?.battlefield||[]).some(c=>c.tapped))break;
      p.confirmations.untap=true;
      smartPhaseTransition('untap','upkeep','no tracked permanents are tapped');
      moved=true;continue;
    }
    if(phase==='upkeep'){
      if(anyPlayerHasLegalResponse())break;
      smartPhaseTransition('upkeep','draw','no upkeep trigger or legal response is available to any player');
      moved=true;break; // draw is mandatory and never auto-resolved
    }
    if(phase==='precombat-main'){
      if(activeHasLegalMainAction(p)||anyPlayerHasLegalResponse())break;
      smartPhaseTransition('precombat-main','combat','the active player has no legal main-phase action and no player has a legal response');
      moved=true;continue;
    }
    if(['combat','begin-combat','declare-attackers'].includes(phase)){
      if(legalAttackersFor(p).length||anyPlayerHasLegalResponse())break;
      p.confirmations.attackers=true;
      if(game.phaseGates?.combat)satisfyGate(game,'combat');
      game.combatState={attackers:[],defenders:[],blocks:{},damage:[],waitingFor:null,resolved:true};
      smartPhaseTransition(phase,'postcombat-main','the active player has no legal attacker and no player has a legal response');
      moved=true;continue;
    }
    if(phase==='postcombat-main'){
      if(activeHasLegalMainAction(p)||anyPlayerHasLegalResponse())break;
      smartPhaseTransition('postcombat-main','end-step','the active player has no legal main-phase action and no player has a legal response');
      moved=true;continue;
    }
    if(phase==='end-step'){
      if(anyPlayerHasLegalResponse())break;
      smartPhaseTransition('end-step','cleanup','no end-step trigger or legal response is available to any player');
      moved=true;break; // NEVER end the turn automatically
    }
    break;
  }
  if(moved){
    configurePhaseGates(game,game.phase);
    if(game.phase==='cleanup'){
      const guidanceKey=`${game.turnNumber}:${p.playerId}`;
      if(game.endTurnGuidanceKey!==guidanceKey){
        game.endTurnGuidanceKey=guidanceKey;
        game.log.unshift({text:'No cards available to play. End your turn.',turn:game.turnNumber,type:'player-notification',kind:'end-turn-guidance',affectedPlayerIds:[p.playerId],attention:true});
        toast('No cards available to play. End your turn.');
      }
    }
    save();render()
  }
  return moved;
}

function priorityPassNow(holder,ps,{timeout=false}={}){clearPriorityResponseTimer();const result=passPriority(game,holder.playerId);game.log.unshift({text:`${holder.displayName} ${timeout?'auto-passes after 69 seconds':'declines / passes priority'} (${ps.reason}).`,turn:game.turnNumber});closeModal();save();if(result.complete)resolveAfterAllPass();else openPriorityPrompt()}
function openPriorityPrompt(){
  clearPriorityResponseTimer();
  const ps=game?.priorityState;
  if(!ps?.active)return resolveAfterAllPass();
  const holder=priorityHolder(game);if(!holder)return;
  const {hand,abilities}=legalPriorityOptions(holder);
  if(!hand.length&&!abilities.length){
    const result=passPriority(game,holder.playerId);
    game.log.unshift({text:`${holder.displayName} auto-passes priority — no legal response is available (${ps.reason}).`,turn:game.turnNumber});
    if(result.complete)return resolveAfterAllPass();
    return openPriorityPrompt();
  }
  if(network?.localPlayerId&&network.localPlayerId!==holder.playerId){render();return toast(`Waiting for ${holder.displayName} to respond or pass.`)}
  if(ps.responseDeadlineHolderId!==holder.playerId||!ps.responseDeadlineAt){ps.responseDeadlineHolderId=holder.playerId;ps.responseDeadlineAt=Date.now()+PRIORITY_RESPONSE_SECONDS*1000}
  const secondsLeft=()=>Math.max(0,Math.ceil((Number(ps.responseDeadlineAt)-Date.now())/1000));
  const html=`${stackSummary()}<div class="combat-handoff"><b>${esc(holder.displayName)} can respond.</b><p>${esc(ps.reason)} The active turn player remains ${esc(activePlayer()?.displayName||'active player')}.</p><div class="priority-countdown">RESPONSE WINDOW <strong id="priorityCountdown">${secondsLeft()}</strong>s</div></div>${hand.length?`<label>INSTANT / FLASH RESPONSE<select id="prioritySpell"><option value="">Choose a response…</option>${hand.map(c=>`<option value="${esc(c.instanceId)}">${esc(defOf(game,c)?.name||'Card')}</option>`).join('')}</select></label>`:''}${abilities.length?`<label>ACTIVATED ABILITY<select id="priorityAbility"><option value="">Choose an ability source…</option>${abilities.map(c=>`<option value="${esc(c.instanceId)}">${esc(defOf(game,c)?.name||'Permanent')}</option>`).join('')}</select></label>`:''}<p class="muted">Respond only if you want to. Decline keeps your cards and resources untouched. Players with no legal response are skipped automatically.</p>`;
  const actions=[{label:'DECLINE / PASS',className:'primary',onClick:()=>priorityPassNow(holder,ps)}];
  if(hand.length)actions.unshift({label:'CAST RESPONSE',onClick:()=>{const id=$('#prioritySpell')?.value;if(!id)return toast('Choose an instant or flash card first.',true);const c=instance(holder,id),d=defOf(game,c),v=validatePlay({game,player:holder,definition:d,instance:c,kind:'cast',definitions:definitionsMap()});if(!v.legal)return toast(v.reasons.join(' • ')||'That response is not legal.',true);playFromHand(holder,c,d,'cast',v)}});
  if(abilities.length)actions.unshift({label:'USE ABILITY',onClick:()=>{const id=$('#priorityAbility')?.value;if(!id)return toast('Choose an ability source first.',true);openPriorityAbility(holder,id)}});
  openModal(`RESPOND — ${holder.displayName}`,html,actions);
  priorityResponseTimer=setInterval(()=>{const remaining=secondsLeft(),el=$('#priorityCountdown');if(el)el.textContent=String(remaining);if(remaining<=0){clearPriorityResponseTimer();if(game?.priorityState?.active&&game.priorityState.holderId===holder.playerId)priorityPassNow(holder,ps,{timeout:true})}},250);
}
function firstLegalResponder({opponentsOnly=false,preferActive=false}={}){const active=activePlayer();let rows=(game.players||[]).filter(p=>!p.eliminated);if(opponentsOnly)rows=rows.filter(p=>p.playerId!==active?.playerId);if(preferActive&&active)rows=[active,...rows.filter(p=>p.playerId!==active.playerId)];return rows.find(p=>{const o=legalPriorityOptions(p);return o.hand.length||o.abilities.length})||null}
function beginCombatPriority(reason,stage,continuation){
  const opponentsOnly=['begin-combat','after-attackers'].includes(stage),preferActive=['after-blockers','after-combat-damage','end-combat'].includes(stage);
  const responder=firstLegalResponder({opponentsOnly,preferActive});
  if(!responder){game.log.unshift({text:`Response window skipped — no player has a legal response (${reason}).`,turn:game.turnNumber});return continuation?.()}
  beginPriority(reason,stage,continuation,responder.playerId)
}
function openPriorityAbility(p,id){
  const c=instance(p,id),d=defOf(game,c);if(!c||!d)return;
  const rows=parseActivatedAbilities(d).map(a=>({ability:a,...validateActivatedAbilityFull({game,player:p,instance:c,definition:d,ability:a,definitions:definitionsMap()})})).filter(x=>x.legal&&!x.ability.manaAbility);
  if(!rows.length)return toast('No legal non-mana activated response is available from that permanent.',true);
  openModal(`RESPOND — ${d.name}`,`<p>Select the activated ability to put on the stack.</p><div class="ability-choice-list">${rows.map((r,i)=>`<button class="ability-choice available" data-priority-ability-line="${i}"><strong>${esc(r.ability.cost)}</strong><span>${esc(r.ability.effect)}</span></button>`).join('')}</div>`,[{label:'BACK',onClick:openPriorityPrompt}]);
  $$('[data-priority-ability-line]').forEach(b=>b.onclick=()=>beginAbilityActivation(p,c,d,rows[Number(b.dataset.priorityAbilityLine)].ability));
}
function def(id){return game?.cardDefinitions?.[id]||null}
function instance(player,id){for(const k of ['hand','battlefield','graveyard','exile','tokens','attachments','commandZone','remainingLibrary']){const c=player.deck?.[k]?.find(x=>x.instanceId===id);if(c)return c}return null}
const MANA_ICON={W:'white',U:'blue',B:'black',R:'red',G:'green',C:'colorless'};
function manaIcon(k,n=1){return `<span class="calc-pip"><img src="mana-${MANA_ICON[k]}.png" alt=""><b>${Number(n)||0}</b></span>`}
function manaReqIcons(req={}){let out='';for(const k of ['W','U','B','R','G','C'])if(req[k])out+=manaIcon(k,req[k]);if(req.generic)out+=`<span class="generic-pip" aria-label="Generic mana ${req.generic}">${req.generic}</span>`;return out||'<span class="muted">No mana</span>'}
function manaPoolIcons(pool={}){return ['W','U','B','R','G','C'].map(k=>manaIcon(k,pool[k]||0)).join('')}
function manaCalculator(player,cost='',tax=0){const req=parseManaCost(cost);req.generic=Math.max(0,Number(req.generic||0)+Number(tax||0));const keys=['W','U','B','R','G','C'],pool=Object.fromEntries(keys.map(k=>[k,Math.max(0,Number(player.mana?.available?.[k]||0))])),plan=planMana(pool,cost,tax),rows=[];for(const k of keys){const needed=Math.max(0,Number(req[k]||0));if(!needed)continue;const have=pool[k],state=have>=needed?'sufficient':'insufficient';rows.push(`<div class="mana-required-row" aria-label="${k} mana ${needed} of ${have} available"><span class="mana-required-icon">${manaIcon(k,1)}</span><strong><span class="mana-required-value">${needed}</span><em>/</em><span class="mana-available-value ${state}">${have}</span></strong></div>`)}if(req.generic){const coloredReserved=keys.reduce((n,k)=>n+Math.max(0,Number(req[k]||0)),0),totalAvailable=keys.reduce((n,k)=>n+pool[k],0),genericAvailable=Math.max(0,totalAvailable-coloredReserved),state=genericAvailable>=req.generic?'sufficient':'insufficient';rows.push(`<div class="mana-required-row generic-required-row" aria-label="Generic mana ${req.generic} of ${genericAvailable} available"><span class="generic-pip">◇</span><strong><span class="mana-required-value">${req.generic}</span><em>/</em><span class="mana-available-value ${state}">${genericAvailable}</span></strong></div>`)}return `<section class="mana-calculator mana-required-only ${plan.ok?'payable':'unpayable'}"><div class="mana-required-list">${rows.join('')}</div></section>`}
function openModal(title,html,actions=[],trayHtml=''){try{document.activeElement?.blur?.()}catch{} const modal=$('#modal'),content=$('#modalContent'),footer=$('#modalActions');if(modal.open)modal.close();modal.dataset.returnScroll=String(window.scrollY||0);$('#modalTitle').textContent=title;const useTray=!!trayHtml;content.innerHTML=html;footer.innerHTML='';footer.hidden=!actions.length&&!useTray;footer.classList.toggle('with-calculator',useTray);footer.classList.toggle('sticky-actions',!useTray);let buttonTarget=footer;if(useTray){const tray=document.createElement('div');tray.className='modal-mana-tray';tray.innerHTML=trayHtml;footer.appendChild(tray);const row=document.createElement('div');row.className='modal-tray-buttons';footer.appendChild(row);buttonTarget=row}for(const a of actions){const b=document.createElement('button');b.textContent=a.label;b.className=a.className||'';const semantic=String(a.semantic||a.label||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(semantic)b.dataset.menuSemantic=semantic;if(/^back$/i.test(a.label||''))b.dataset.navigation='back';if(/^cancel$/i.test(a.label||''))b.dataset.actionRole='cancel';b.disabled=!!a.disabled;b.onclick=()=>a.onClick?.(b);buttonTarget?.appendChild(b)}document.body.classList.add('cc-modal-open');modal.showModal();requestAnimationFrame(()=>{content.scrollTop=0})}
function closeModal(){clearPriorityResponseTimer();const m=$('#modal');try{document.activeElement?.blur?.()}catch{} if(m.open)m.close();document.body.classList.remove('cc-modal-open');m.classList.remove('game-history-modal');const y=Number(m.dataset.returnScroll||0);requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:'auto'}))}
function openGameHistory(){
  const rows=(game?.log||[]).map((e,index)=>({e,index})).sort((a,b)=>Number(b.e?.turn||0)-Number(a.e?.turn||0)||a.index-b.index);
  const html=rows.length?`<div class="game-history-list">${rows.map(({e})=>{const turn=Math.max(1,Number(e?.turn||1));const player=e?.playerName||e?.player||e?.displayName||'';const phase=e?.phase||'';const meta=[`TURN ${turn}`,player,phase].filter(Boolean).map(esc).join(' • ');return `<article class="game-history-entry"><small>${meta}</small><p>${esc(e?.text||'Game update')}</p></article>`}).join('')}</div>`:'<div class="game-history-empty">No recorded game actions yet.</div>';
  openModal('GAME HISTORY',html,[{label:'UNDO LAST STEP',onClick:()=>confirmUndoLastStep()}]);
  $('#modal')?.classList.add('game-history-modal');
}
function guidedAllCards(){const rows=[];for(const p of game.players||[])for(const zone of ['hand','battlefield','graveyard','exile'])for(const c of p.deck?.[zone]||[])rows.push({id:c.instanceId,label:defOf(game,c)?.name||'Card',sub:`${p.displayName} — ${zone}`,playerId:p.playerId,zone});return rows}
function guidedPermanentRows(){return guidedAllCards().filter(x=>x.zone==='battlefield')}
function openGuidedResolver({player,title='GUIDED ORACLE RESOLUTION',oracleText='',unsupported=[],onComplete=()=>{},state=null,mustComplete=false}={}){
  const p=player||activePlayer(),st=state||{mutations:0};
  const playerOptions=(game.players||[]).map(q=>`<option value="${esc(q.playerId)}">${esc(q.displayName)}</option>`).join('');
  const html=`<div class="guided-resolver"><div class="guided-warning"><b>GUIDED RESOLUTION</b><p>This Oracle text contains a rule pattern that is not safe to automate. Commander Companion will not pretend it resolved. Apply the actual state changes below, then confirm.</p></div><p class="oracle">${esc(oracleText)}</p>${unsupported?.length?`<div class="unsupported-lines">${unsupported.map(x=>`<div>${esc(x)}</div>`).join('')}</div>`:''}<label>STATE OPERATION<select id="guidedKind"><option value="life">Life gain / loss</option><option value="poison">Poison counters</option><option value="draw">Draw cards</option><option value="discard">Discard a card</option><option value="mill">Mill cards</option><option value="move">Move a card between zones</option><option value="tap">Tap / untap permanent</option><option value="counter">Add / remove counter</option><option value="pump">Power / toughness until end of turn</option><option value="token">Create creature token</option><option value="control">Change control</option><option value="rule">Track temporary rule / permission</option></select></label><div id="guidedFields"></div><p class="progress-text">Applied operations: <b>${st.mutations}</b></p></div>`;
  const actions=[...(!mustComplete?[{label:'CANCEL',onClick:closeModal}]:[]),{label:'APPLY OPERATION',className:'primary',onClick:()=>applyGuidedOperation(p,{title,oracleText,unsupported,onComplete,state:st})},{label:'EFFECT RESOLVED',disabled:st.mutations<1,onClick:()=>{closeModal();onComplete?.()}}];
  openModal(title,html,actions);
  const renderFields=()=>{const kind=$('#guidedKind')?.value,perms=guidedPermanentRows(),all=guidedAllCards();let out='';
    if(['life','poison','draw','mill'].includes(kind))out=`<label>PLAYER<select id="guidedPlayer">${playerOptions}</select></label><label>AMOUNT<input id="guidedAmount" type="number" min="0" value="1"></label>${kind==='life'?'<label>DIRECTION<select id="guidedDirection"><option value="gain">Gain life</option><option value="lose">Lose life</option></select></label>':''}`;
    else if(kind==='discard')out=`<label>PLAYER<select id="guidedPlayer">${playerOptions}</select></label><label>CARD<select id="guidedCard"></select></label>`;
    else if(kind==='move')out=`<label>CARD<select id="guidedCard">${all.map(x=>`<option value="${esc(x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')}</select></label><label>DESTINATION<select id="guidedZone"><option value="battlefield">Battlefield</option><option value="hand">Hand</option><option value="graveyard">Graveyard</option><option value="exile">Exile</option><option value="library">Library</option><option value="command">Command Zone</option></select></label>`;
    else if(kind==='tap')out=`<label>PERMANENT<select id="guidedCard">${perms.map(x=>`<option value="${esc(x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')}</select></label><label>STATE<select id="guidedTap"><option value="tap">Tap</option><option value="untap">Untap</option></select></label>`;
    else if(kind==='counter')out=`<label>PERMANENT<select id="guidedCard">${perms.map(x=>`<option value="${esc(x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')}</select></label><label>COUNTER<input id="guidedCounter" value="+1/+1"></label><label>CHANGE<input id="guidedAmount" type="number" value="1"></label>`;
    else if(kind==='pump')out=`<label>PERMANENT<select id="guidedCard">${perms.map(x=>`<option value="${esc(x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')}</select></label><div class="setup-line"><label>POWER<input id="guidedPower" type="number" value="1"></label><label>TOUGHNESS<input id="guidedToughness" type="number" value="1"></label></div>`;
    else if(kind==='token')out=`<label>TOKEN NAME<input id="guidedTokenName" value="Creature"></label><div class="setup-line"><label>POWER<input id="guidedPower" type="number" min="0" value="1"></label><label>TOUGHNESS<input id="guidedToughness" type="number" min="0" value="1"></label><label>COUNT<input id="guidedAmount" type="number" min="1" value="1"></label></div>`;
    else if(kind==='control')out=`<label>PERMANENT<select id="guidedCard">${perms.map(x=>`<option value="${esc(x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')}</select></label><label>NEW CONTROLLER<select id="guidedPlayer">${playerOptions}</select></label><label class="check"><input id="guidedUntilEot" type="checkbox"> Until end of turn</label>`;
    else if(kind==='rule')out=`<label>RULE / PERMISSION<textarea id="guidedNote" rows="3" placeholder="Describe the exact temporary rule change that must be tracked.">${esc(unsupported?.[0]||oracleText)}</textarea></label><label>EXPIRES<select id="guidedExpires"><option value="">Until source/effect says otherwise</option><option value="cleanup">End of turn</option></select></label>`;
    $('#guidedFields').innerHTML=out;
    if(kind==='discard'){const sel=$('#guidedPlayer'),draw=()=>{const q=game.players.find(x=>x.playerId===sel.value);$('#guidedCard').innerHTML=(q?.deck?.hand||[]).map(c=>`<option value="${esc(c.instanceId)}">${esc(defOf(game,c)?.name||'Card')}</option>`).join('')};sel.onchange=draw;draw()}
  };
  $('#guidedKind').onchange=renderFields;renderFields();
}
function applyGuidedOperation(p,ctx){
  const kind=$('#guidedKind')?.value;try{
    if(kind==='life'){const q=$('#guidedPlayer').value,n=Math.max(0,Number($('#guidedAmount').value||0)),sign=$('#guidedDirection').value==='gain'?1:-1;commitAction({type:'resolve-effects',playerId:p.playerId,effects:[{kind:'life',scope:'you',playerId:q,amount:n,deltaSign:sign}],label:`Guided Oracle resolution: life ${sign>0?'+':'-'}${n}.`})}
    else if(kind==='poison'){const q=game.players.find(x=>x.playerId===$('#guidedPlayer').value),n=Math.max(0,Number($('#guidedAmount').value||0));if(!q)throw new Error('Choose a player.');engine.commit({type:'poison',playerId:q.playerId,delta:n,label:`Guided Oracle resolution: ${q.displayName} gets ${n} poison.`})}
    else if(kind==='draw'){const q=game.players.find(x=>x.playerId===$('#guidedPlayer').value),n=Math.max(0,Number($('#guidedAmount').value||0));for(let i=0;i<n;i++)engine.commit({type:'draw',playerId:q.playerId,label:`${q.displayName} draws a card (guided Oracle resolution).`})}
    else if(kind==='discard'){const q=game.players.find(x=>x.playerId===$('#guidedPlayer').value),id=$('#guidedCard').value;commitAction({type:'resolve-effects',playerId:p.playerId,effects:[{kind:'discard',scope:'you',playerId:q.playerId,amount:1,cardIds:[id]}],label:`Guided Oracle resolution: ${q.displayName} discards a card.`})}
    else if(kind==='mill'){const q=$('#guidedPlayer').value,n=Math.max(0,Number($('#guidedAmount').value||0));commitAction({type:'resolve-effects',playerId:p.playerId,effects:[{kind:'mill',scope:'you',playerId:q,amount:n}],label:`Guided Oracle resolution: mill ${n}.`})}
    else if(kind==='move'){commitAction({type:'move-card',playerId:p.playerId,instanceId:$('#guidedCard').value,to:$('#guidedZone').value,label:'Guided Oracle resolution moves a card.'})}
    else if(kind==='tap'){const id=$('#guidedCard').value,tap=$('#guidedTap').value==='tap';commitAction({type:'tap-card',playerId:p.playerId,instanceId:id,tapped:tap,allowUntap:!tap,label:`Guided Oracle resolution: ${tap?'tap':'untap'} permanent.`})}
    else if(kind==='counter'){const id=$('#guidedCard').value,name=$('#guidedCounter').value.trim()||'+1/+1',delta=Number($('#guidedAmount').value||0);commitAction({type:'card-counter',playerId:p.playerId,instanceId:id,counter:name,delta,label:`Guided Oracle resolution: ${delta>=0?'+':''}${delta} ${name} counter.`})}
    else if(kind==='pump'){commitAction({type:'resolve-effects',playerId:p.playerId,effects:[{kind:'pump',targetId:$('#guidedCard').value,power:Number($('#guidedPower').value||0),toughness:Number($('#guidedToughness').value||0)}],label:'Guided Oracle resolution: temporary P/T change.'})}
    else if(kind==='token'){const n=Math.max(1,Number($('#guidedAmount').value||1)),name=$('#guidedTokenName').value.trim()||'Creature';commitAction({type:'resolve-effects',playerId:p.playerId,effects:[{kind:'create-token',amount:n,name,power:Number($('#guidedPower').value||0),toughness:Number($('#guidedToughness').value||0),typeLine:`Token Creature — ${name}`}],label:`Guided Oracle resolution: create ${n} ${name} token${n===1?'':'s'}.`})}
    else if(kind==='control'){commitAction({type:'resolve-effects',playerId:p.playerId,effects:[{kind:'gain-control',targetId:$('#guidedCard').value,controllerId:$('#guidedPlayer').value,untilEndOfTurn:$('#guidedUntilEot').checked}],label:'Guided Oracle resolution: change control.'})}
    else if(kind==='rule'){const note=$('#guidedNote').value.trim();if(!note)throw new Error('Describe the rule or permission being tracked.');commitAction({type:'guided-note',playerId:p.playerId,note,expires:$('#guidedExpires').value||null,label:`Guided Oracle rule tracked: ${note}`})}
    else throw new Error('Choose a guided state operation.');
    ctx.state.mutations++;save();openGuidedResolver(ctx);
  }catch(e){toast(e?.message||'That guided operation could not be applied.',true)}
}
$('#modalClose').onclick=closeModal;$$('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());

function playerPanel(i){
  const saved=listDecks(),fullTracked=selectedMode==='fully-tracked',hasDeck=selectedMode!=='table-tracker';
  const commanderHint=fullTracked?'Select from deck':'Commander name';
  return `<section class="player-setup" data-player-setup="${i}"><h3>PLAYER ${i+1}</h3><label>Name<input class="setup-name" value="${i===0?'Player 1':`Player ${i+1}`}"></label><div class="commander-line"><label>Commander 1<input class="setup-cmd1" placeholder="${commanderHint}" ${fullTracked?'readonly':''}>${fullTracked?'<button type="button" class="setup-pick-cmd1">SELECT FROM DECK</button>':selectedMode==='freeplay'?'<button type="button" class="setup-search-cmd1">SEARCH COMMANDER</button>':''}</label><label class="setup-secondary-wrap" hidden>Commander 2<input class="setup-cmd2" placeholder="Second commander" ${fullTracked?'readonly':''}>${fullTracked?'<button type="button" class="setup-pick-cmd2">SELECT LEGAL PARTNER</button>':selectedMode==='freeplay'?'<button type="button" class="setup-search-cmd2">SEARCH LEGAL PARTNER</button>':''}</label></div>${hasDeck?`<div class="setup-tools"><select class="setup-saved"><option value="">Load saved deck…</option>${saved.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select><button type="button" class="setup-precon">PRECON</button></div><label>Deck List${fullTracked?'':' (optional)'}<textarea class="setup-deck" placeholder="1 Sol Ring&#10;1 Command Tower&#10;..."></textarea></label>`:''}</section>`
} 
async function resolveCommanderPool(deckText){
  const text=String(deckText||'').trim();if(!text)throw new Error('Add or load the deck list before choosing a commander.');
  const h=await hydrateDeckList(text);if(h.unresolved.length)throw new Error(`Resolve the deck list first: ${h.unresolved.slice(0,4).join(', ')}`);return h.definitions;
}
function findDefinitionByName(defs,name){return defs.find(d=>d.name.toLowerCase()===String(name||'').trim().toLowerCase())||null}
async function openDeckCommanderPicker({deckText,primaryName='',secondary=false,onSelect}){
  openModal(secondary?'SELECT SECOND COMMANDER':'SELECT COMMANDER','<p>Resolving eligible cards from this deck only…</p>',[{label:'CANCEL',onClick:closeModal}]);
  try{
    const defs=await resolveCommanderPool(deckText);const primary=findDefinitionByName(defs,primaryName);
    if(secondary&&(!primary||!allowsSecondaryCommander(primary)))throw new Error('The selected primary commander does not enable a second commander.');
    const allowed=defs.filter(d=>(secondary?isSecondaryCommanderEligible(d):isCommanderEligible(d))&&(!secondary||canShareCommandZone(primary,d)));
    if(!allowed.length)throw new Error(secondary?'No legal second commander exists in this deck for the selected primary commander.':'No commander-eligible card was found in this deck.');
    const renderRows=async()=>{const q=$('#commanderSearchInput')?.value||'';const rows=await pickerPool({mode:'fully-tracked',source:definitionPoolSource(allowed),query:q});$('#commanderSearchResults').innerHTML=rows.filter(d=>!q||d.name.toLowerCase().includes(q.toLowerCase())).map((d,i)=>`<button class="search-result" data-command-result="${i}"><img src="${imageOf(d)}"><span><b>${esc(d.name)}</b><br><small>${esc(d.typeLine)}</small></span></button>`).join('')||'<p>No eligible cards match that name.</p>';$$('[data-command-result]').forEach((b,i)=>b.onclick=()=>{const d=rows.filter(x=>!q||x.name.toLowerCase().includes(q.toLowerCase()))[i];closeModal();onSelect(d)})};
    $('#modalContent').innerHTML=`<p>${secondary?'Only legal partner commanders from this deck are shown.':'Only commander-eligible cards from this deck are shown.'}</p><div class="card-search-row"><input id="commanderSearchInput" placeholder="Type commander name"><span>${allowed.length} eligible</span></div><div id="commanderSearchResults" class="card-search-results"></div>`;$('#commanderSearchInput').oninput=renderRows;await renderRows();
  }catch(e){$('#modalContent').innerHTML=`<p class="bad">${esc(e.message)}</p>`}
}
async function syncSetupSecondary(panel){
  const wrap=panel.querySelector('.setup-secondary-wrap');if(!wrap)return;
  const name=panel.querySelector('.setup-cmd1').value.trim(),text=panel.querySelector('.setup-deck')?.value.trim()||'';let allowed=false;
  if(name){try{let primary=null;if(selectedMode==='fully-tracked'&&text){const defs=await resolveCommanderPool(text);primary=findDefinitionByName(defs,name)}else primary=await resolveNamedCard(name);allowed=!!primary&&allowsSecondaryCommander(primary)}catch{}}
  wrap.hidden=!allowed;if(!allowed)panel.querySelector('.setup-cmd2').value='';
}
function renderSetupPanels(){const n=+$('#playerCount').value;$('#playerSetupPanels').innerHTML=Array.from({length:n},(_,i)=>playerPanel(i)).join('');const defaults=accountSetupDefaults();const saved=listDecks();bindSetupTools();$$('[data-player-setup]').forEach((panel,i)=>{const name=defaults.playerNames[i]||'';if(name)panel.querySelector('.setup-name').value=name;if(i===0&&defaults.favoriteDeckId){const sel=panel.querySelector('.setup-saved');if(sel&&saved.some(d=>d.id===defaults.favoriteDeckId)){sel.value=defaults.favoriteDeckId;sel.dispatchEvent(new Event('change'))}}})}
async function openGlobalCommanderPicker({primary=null,onSelect}){
  openModal(primary?'SEARCH LEGAL PARTNER':'SEARCH COMMANDER',`<p>${primary?'Search results are filtered to commanders that can legally share the command zone with '+esc(primary.name)+'.':'Search results are filtered to cards that can legally be commanders.'}</p><div class="card-search-row"><input id="freeCommanderSearch" placeholder="Type commander name"><button id="freeCommanderGo">SEARCH</button></div><div id="freeCommanderResults" class="card-search-results"></div>`,[{label:'CANCEL',onClick:closeModal}]);
  const run=async()=>{const q=$('#freeCommanderSearch').value.trim();if(!q)return;$('#freeCommanderResults').innerHTML='<p>Searching…</p>';try{const rows=(await searchCards(q,{allPrintings:false})).filter(d=>(primary?isSecondaryCommanderEligible(d):isCommanderEligible(d))&&(!primary||canShareCommandZone(primary,d)));$('#freeCommanderResults').innerHTML=rows.map((d,i)=>`<button class="search-result" data-free-cmd="${i}"><img src="${imageOf(d)}"><span><b>${esc(d.name)}</b><br><small>${esc(d.typeLine)}</small></span></button>`).join('')||'<p>No legal commander matches.</p>';$$('[data-free-cmd]').forEach((b,i)=>b.onclick=()=>{closeModal();onSelect(rows[i])})}catch(e){$('#freeCommanderResults').innerHTML=`<p class="bad">${esc(e.message)}</p>`}};
  $('#freeCommanderGo').onclick=run;$('#freeCommanderSearch').onkeydown=e=>{if(e.key==='Enter')run()};
}
function bindSetupTools(){
  $$('.setup-saved').forEach((sel,i)=>sel.onchange=async()=>{const d=listDecks().find(x=>x.id===sel.value);const p=$$('[data-player-setup]')[i];if(!p)return;if(!d){p.dataset.selectedDeckId='';return}p.dataset.selectedDeckId=d.id;p.dataset.selectedDeckName=d.name||'';p.querySelector('.setup-cmd1').value=d.commander1||'';p.querySelector('.setup-cmd2').value=d.commander2||'';p.querySelector('.setup-deck').value=d.deckList||'';await syncSetupSecondary(p)});
  $$('.setup-precon').forEach((b,i)=>b.onclick=()=>openPreconPicker(async pre=>{const p=$$('[data-player-setup]')[i];p.querySelector('.setup-cmd1').value=pre.commanders[0]||'';p.querySelector('.setup-cmd2').value=pre.commanders[1]||'';p.querySelector('.setup-deck').value=pre.deckList||'';await syncSetupSecondary(p)}));
  $$('.setup-pick-cmd1').forEach((b,i)=>b.onclick=()=>{const p=$$('[data-player-setup]')[i];openDeckCommanderPicker({deckText:p.querySelector('.setup-deck').value,onSelect:d=>{p.querySelector('.setup-cmd1').value=d.name;p.querySelector('.setup-cmd2').value='';syncSetupSecondary(p)}})});
  $$('.setup-pick-cmd2').forEach((b,i)=>b.onclick=()=>{const p=$$('[data-player-setup]')[i];openDeckCommanderPicker({deckText:p.querySelector('.setup-deck').value,primaryName:p.querySelector('.setup-cmd1').value,secondary:true,onSelect:d=>{p.querySelector('.setup-cmd2').value=d.name}})});
  $$('.setup-search-cmd1').forEach((b,i)=>b.onclick=()=>{const p=$$('[data-player-setup]')[i];openGlobalCommanderPicker({onSelect:d=>{p.querySelector('.setup-cmd1').value=d.name;p.querySelector('.setup-cmd2').value='';syncSetupSecondary(p)}})});
  $$('.setup-search-cmd2').forEach((b,i)=>b.onclick=async()=>{const p=$$('[data-player-setup]')[i];try{const primary=await resolveNamedCard(p.querySelector('.setup-cmd1').value);if(!allowsSecondaryCommander(primary))return toast('That commander does not enable a second commander.',true);openGlobalCommanderPicker({primary,onSelect:d=>{p.querySelector('.setup-cmd2').value=d.name}})}catch(e){toast(e.message,true)}});
  $$('.setup-deck').forEach((t,i)=>t.onchange=()=>syncSetupSecondary($$('[data-player-setup]')[i]));
  $$('.setup-cmd1').forEach((t,i)=>t.onchange=()=>syncSetupSecondary($$('[data-player-setup]')[i]));
}
async function openSetup(){await userDataReady;renderSetupPanels();$('#setupProgress').textContent='';const free=selectedMode==='freeplay';$('#virtualHandWrap').hidden=!free;$('#virtualHand').checked=true;$('#guidanceSettingWrap').hidden=free;$('#setupDialog').showModal()}
$('#playerCount').onchange=renderSetupPanels;

async function hydratePlayerSetup(panel,i){
  const name=panel.querySelector('.setup-name').value.trim()||`Player ${i+1}`;const playerId=`p${i+1}-${crypto.randomUUID().slice(0,6)}`;
  if(selectedMode==='table-tracker'){const cmdNames=[panel.querySelector('.setup-cmd1').value.trim(),panel.querySelector('.setup-cmd2').value.trim()].filter(Boolean);const cmdDefs=[];for(const n of cmdNames)cmdDefs.push(await resolveNamedCard(n));const manifest=cmdDefs.map(d=>({definitionId:d.definitionId,quantity:1}));const deck=normalizeDeck({ownerId:playerId,sourceType:'table-tracker',sourceName:'Public commander state',manifest,commanderDefinitionIds:cmdDefs.map(d=>d.definitionId)});return {player:{playerId,displayName:name,deck,commanders:cmdDefs.map((d,n)=>({id:`${playerId}:commander:${n+1}`,cardId:d.definitionId,card:d}))},defs:cmdDefs};}
  const cmdNames=[panel.querySelector('.setup-cmd1').value.trim(),panel.querySelector('.setup-cmd2').value.trim()].filter(Boolean);const text=panel.querySelector('.setup-deck').value.trim();
  if(selectedMode==='fully-tracked'&&!text)throw new Error(`${name}: a deck list is required in Full Play Tracking.`);
  let hydrated=text?await hydrateDeckList(text,(done,total)=>$('#setupProgress').textContent=`${name}: resolving cards ${done}/${total}…`):{manifest:[],definitions:[],unresolved:[],total:0};
  const cmdDefs=[];for(const n of cmdNames){let d=hydrated.definitions.find(x=>x.name.toLowerCase()===n.toLowerCase());if(!d&&text)throw new Error(`${name}: commander ${n} is not in this deck.`);if(!d)d=await resolveNamedCard(n);cmdDefs.push(d);if(!hydrated.manifest.some(x=>x.definitionId===d.definitionId)){if(text)throw new Error(`${name}: commander ${n} is not in this deck.`);hydrated.manifest.push({definitionId:d.definitionId,quantity:1})}if(!hydrated.definitions.some(x=>x.definitionId===d.definitionId))hydrated.definitions.push(d)}
  if(selectedMode==='fully-tracked'||text){
    if(hydrated.unresolved.length)throw new Error(`${name}: unresolved cards: ${hydrated.unresolved.slice(0,5).join(', ')}`);
    const deckCheck=validateCommanderDeck({manifest:hydrated.manifest,definitions:hydrated.definitions,commanders:cmdDefs,rulesConfig:pendingRules});
    if(!deckCheck.legal)throw new Error(`${name}: ${deckCheck.reasons[0]}`);
  }
  const selectedDeckId=panel.dataset.selectedDeckId||'';const selectedDeck=selectedDeckId?listDecks().find(d=>d.id===selectedDeckId):null;const deck=normalizeDeck({ownerId:playerId,sourceType:selectedDeck?'saved-deck':'custom',sourceId:selectedDeck?.id||null,sourceName:selectedDeck?.name||'Setup deck',manifest:hydrated.manifest,commanderDefinitionIds:cmdDefs.map(d=>d.definitionId)});deck.savedDeckId=selectedDeck?.id||null;const handTracking=selectedMode==='fully-tracked'?true:!!$('#virtualHand')?.checked;deck.virtualDrawEnabled=handTracking;shuffleLibrary(deck);if(handTracking&&deck.remainingLibrary.length>=7)drawOpeningHand(deck,7);
  const commanders=cmdDefs.map((d,n)=>({id:`${playerId}:commander:${n+1}`,cardId:d.definitionId,card:d}));
  const guidanceLevel=selectedMode==='fully-tracked'?'guided':'standard';return {player:{playerId,displayName:name,guidanceLevel,settings:{handTracking},deck,commanders,privateHandOwnership:playerId},defs:hydrated.definitions};
}
async function startSetup(){const btn=$('#startSetupBtn');btn.disabled=true;try{const panels=$$('[data-player-setup]');const players=[],defs={};for(let i=0;i<panels.length;i++){const r=await hydratePlayerSetup(panels[i],i);players.push(r.player);r.defs.forEach(d=>defs[d.definitionId]=d)}game=initializeGame({players,mode:selectedMode,deviceMode:'single-device'});game.cardDefinitions=defs;game.abilityCoverage=auditDefinitions(defs);game.status='active';game.rulesConfig=normalizeRulesConfig(pendingRules);game.players.forEach(p=>{p.life=Number(game.rulesConfig.startingLife||40);p.mana.total={W:0,U:0,B:0,R:0,G:0,C:0};p.mana.available={W:0,U:0,B:0,R:0,G:0,C:0};p.confirmations={draw:false}});engine=createAutosavingEngine(game);await Promise.all(game.players.map(p=>{const cmds=p.commanders.map(c=>game.cardDefinitions?.[c.cardId]?.name||'').filter(Boolean);return recordDeckSelection({playerName:p.displayName,deckId:p.deck?.savedDeckId||p.deck?.sourceId,deckName:p.deck?.sourceName||'Setup deck',commander1:cmds[0]||'',commander2:cmds[1]||'',source:p.deck?.sourceType||'setup'})}));save();$('#setupDialog').close();if(selectedMode==='fully-tracked'||(selectedMode==='freeplay'&&game.players.some(p=>p.settings?.handTracking)))openOpeningHands(0);else{showGame();toast('Game started — autosave active')}}catch(e){console.error('Commander Companion setup error:',e);$('#setupProgress').textContent=friendlySetupError(e);$('#setupProgress').classList.add('bad')}finally{btn.disabled=false}}
$('#startSetupBtn').onclick=startSetup;


function openingHandHtml(p){return `<p>Review ${esc(p.displayName)}'s private opening hand. Only this player's cards should be visible while this screen is open.</p><div class="hand-panel"><h3>OPENING HAND (${p.deck.hand.length})</h3><div class="hand-strip">${p.deck.hand.map(c=>{const d=def(c.definitionId);return `<button class="hand-card" data-opening-card="${c.instanceId}">${d?`<img src="${imageOf(d)}" alt="${esc(d.name)}">`:'<span class="fallback">UNRESOLVED</span>'}</button>`}).join('')}</div></div>`}
function openOpeningHands(index=0){
  game.openingHandState={active:true,index};save();
  if(index>=game.players.length){game.openingHandState={active:false,index:game.players.length};save();showGame();toast('Opening hands confirmed — autosave active');return}
  const p=game.players[index];if(!p.deck.hand.length){return openOpeningHands(index+1)}
  openModal(`${p.displayName} — OPENING HAND`,openingHandHtml(p),[
    {label:'RANDOM HAND',onClick:()=>{p.deck.remainingLibrary.push(...p.deck.hand.splice(0).map(c=>({...c,zone:'library'})));shuffleLibrary(p.deck);drawOpeningHand(p.deck,7);sync(p.deck);save();openOpeningHands(index)}},
    {label:'CUSTOMIZE',onClick:()=>customizeOpeningHand(p,index)},
    {label:index===game.players.length-1?'START GAME':'CONFIRM & NEXT',className:'primary',onClick:()=>{game.openingHandState={active:true,index:index+1};save();closeModal();openOpeningHands(index+1)}}
  ]);
}
async function customizeOpeningHand(p,index){
  const pool=await pickerPool({mode:game.mode,source:trackedDeckSource(p.deck,{zones:['hand','library']})});const selected=new Set(p.deck.hand.map(c=>c.instanceId));
  openModal(`${p.displayName} — CUSTOMIZE HAND`, `<p>Select exactly seven cards from this tracked deck. This picker cannot access the global card database.</p><div id="customCount" class="progress-text">Selected ${selected.size}/7</div><div class="card-search-results">${pool.map(c=>{const d=def(c.definitionId);return `<label class="search-result"><input type="checkbox" data-custom="${c.instanceId}" ${selected.has(c.instanceId)?'checked':''}><img src="${imageOf(d)}"><span>${esc(d?.name||'Unresolved')}</span></label>`}).join('')}</div>`,[
    {label:'CANCEL',onClick:()=>openOpeningHands(index)},
    {label:'USE SELECTED 7',className:'primary',onClick:()=>{if(selected.size!==7)return toast('Choose exactly seven cards.',true);const all=[...p.deck.hand,...p.deck.remainingLibrary];p.deck.hand=[];p.deck.remainingLibrary=[];for(const c of all){if(selected.has(c.instanceId)){c.zone='hand';p.deck.hand.push(c)}else{c.zone='library';p.deck.remainingLibrary.push(c)}}sync(p.deck);save();openOpeningHands(index)}}
  ]);
  $$('[data-custom]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.custom):selected.delete(c.dataset.custom);$('#customCount').textContent=`Selected ${selected.size}/7`});
}
function landManaOptions(d){
  const abilities=tapManaAbilities(d);return [...new Set(abilities.flatMap(a=>a.options))];
}
function chooseManaColorForAbility(d,line,onChoose){
  const options=manaOptionsFromAbility(line);
  if(options.length<=1)return onChoose(options[0]||'C');
  openModal(`MANA FROM ${d.name}`,`${renderCardDetail(game,{definitionId:d.definitionId})}<div class="ability-source"><h3>ABILITY</h3><p class="oracle">${esc(line)}</p></div><p>Choose the mana produced by this activation. This choice applies only to this tap.</p><div class="mana-choice-grid">${options.map(c=>`<button class="available" data-ability-mana="${c}">${manaIcon(c,1)}</button>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);
  $$('[data-ability-mana]').forEach(b=>b.onclick=()=>onChoose(b.dataset.abilityMana));
}
function finishLandPlay(p,c,d,choices=null){
  const basic=isBasicLand(d),basicManaColor=basic?basicLandManaColor(d):null;const fixed=landManaOptions(d),trackedManaColor=fixed.length===1?fixed[0]:basicManaColor;
  const entersTapped=choices?.forceEntersUntapped?false:choices?.forceEntersTapped?true:(basic?false:entersBattlefieldTapped({definition:d,battlefield:p.deck.battlefield,definitions:game.cardDefinitions}));
  commitAction({type:'play-land',playerId:p.playerId,instanceId:c.instanceId,basicManaColor:trackedManaColor,entersTapped,asEntersChoices:choices||null,label:`${p.displayName} plays ${d.name}${entersTapped?' tapped':''}.`});closeModal();processPendingTriggers(()=>render());
}
function playLandFromHand(p,c,d){
  const spec=asEntersChoiceSpec(d);if(spec)return beginAsEntersChoice(p,c,d,'land',null,spec);
  const text=String(d?.oracleText||'');
  const life=text.match(/(?:enters(?: the battlefield)? tapped unless you pay|you may pay) (\d+) life/i);
  if(life&&/enters(?: the battlefield)? tapped|if you don['’]t, it enters(?: the battlefield)? tapped/i.test(text)){
    const cost=Math.max(0,Number(life[1]||0));
    return openModal(`${d.name} — AS IT ENTERS`,`<p>Choose how ${esc(d.name)} enters the battlefield.</p><p>Pay <b>${cost} life</b> to have it enter untapped, or let it enter tapped.</p>`,[
      {label:'ENTER TAPPED',onClick:()=>finishLandPlay(p,c,d,{forceEntersTapped:true})},
      {label:`PAY ${cost} LIFE — UNTAPPED`,className:'primary',disabled:Number(p.life||0)<=cost,onClick:()=>{p.life=Math.max(0,Number(p.life||0)-cost);finishLandPlay(p,c,d,{forceEntersUntapped:true,lifePaid:cost})}}
    ]);
  }
  return finishLandPlay(p,c,d,null)
}
const lifeVisualState=new Map();
function captureLifeVisualState(){if(!game)return;const now=Date.now();for(const p of game.players||[]){const prev=lifeVisualState.get(p.playerId);const life=Number(p.life||0);if(prev&&prev.life!==life)lifeVisualState.set(p.playerId,{life,direction:life>prev.life?'gain':'loss',until:now+20000});else if(!prev)lifeVisualState.set(p.playerId,{life,direction:null,until:0});else if(prev.life!==life)lifeVisualState.set(p.playerId,{...prev,life});}}
function applyLifeVisualState(){const now=Date.now();let nextExpiry=Infinity;document.querySelectorAll('[data-life-player]').forEach(el=>{const st=lifeVisualState.get(el.dataset.lifePlayer);el.classList.remove('life-gain-flash','life-loss-flash');if(st?.until>now){el.classList.add(st.direction==='gain'?'life-gain-flash':'life-loss-flash');nextExpiry=Math.min(nextExpiry,st.until)}});if(Number.isFinite(nextExpiry))setTimeout(()=>applyLifeVisualState(),Math.max(20,nextExpiry-Date.now()+25));}
function render(){if(!game)return;captureLifeVisualState();if(statusCycleTimer){clearInterval(statusCycleTimer);statusCycleTimer=null}const neutralHost=!!network?.host&&!network?.localPlayerId;const playerClient=!!network?.localPlayerId;const referencePlayerId=playerClient?network.localPlayerId:game.activePlayerId;if(inspectedPlayerId===referencePlayerId||!game.players.some(p=>p.playerId===inspectedPlayerId))inspectedPlayerId=null;const active=game.players.find(p=>p.playerId===game.activePlayerId)||game.players[0];const turnEl=$('#gameTurnNumber'),turnPlayer=$('#gameTurnPlayer');if(turnEl)turnEl.textContent=active?.displayName||'Player';if(turnPlayer)turnPlayer.textContent='';document.querySelectorAll('#gameScreen > .visual-hand-zone,#gameScreen > .visual-bottom-controls').forEach(n=>n.remove());$('#gameContent').innerHTML=neutralHost?renderHostDashboard(game):(playerClient?renderPlayerClient(game,network.localPlayerId,inspectedPlayerId):renderGame(game,inspectedPlayerId));if(!neutralHost){const screen=$('#gameScreen'),hand=$('#gameContent .visual-hand-zone'),controls=$('#gameContent .visual-bottom-controls');if(hand){hand.classList.add('floating-live-hand');screen.appendChild(hand)}if(controls){controls.classList.add('floating-live-controls');screen.appendChild(controls)}}bindGameActions();bindHostDashboard();document.querySelectorAll('.inline-game-log-scroll').forEach(el=>{el.scrollTop=0});applyLifeVisualState();save();if(network?.host?.broadcast)network.host.broadcast({type:'state',game:publicGameForNetwork()})}
function publicGameForNetwork(){return publicBroadcastState(game)}


function notificationSnapshot(){return new Map((game?.players||[]).map(p=>[p.playerId,{life:Number(p.life||0),poison:Number(p.poison||0),statuses:new Set(p.statuses||[]),battlefield:new Map((p.deck?.battlefield||[]).map(c=>[c.instanceId,defOf(game,c)?.name||'Card'])),graveyard:new Set((p.deck?.graveyard||[]).map(c=>c.instanceId))}]))}
function appendStateNotifications(before,action){
  if(!before||!game)return;const source=String(action?.label||'Game action').replace(/\.$/,'');
  for(const p of game.players||[]){const b=before.get(p.playerId);if(!b)continue;const affected=[p.playerId];const life=Number(p.life||0),poison=Number(p.poison||0);
    if(life!==b.life){const diff=life-b.life;game.log.unshift({text:`${source}. ${p.displayName} ${diff<0?'loses':'gains'} ${Math.abs(diff)} life (${b.life} → ${life}).`,turn:game.turnNumber,type:'player-notification',kind:diff<0?'life-loss':'life-gain',affectedPlayerIds:affected,attention:true})}
    if(poison!==b.poison){const diff=poison-b.poison;game.log.unshift({text:`${source}. ${p.displayName} ${diff<0?'loses':'gains'} ${Math.abs(diff)} poison counter${Math.abs(diff)===1?'':'s'} (${b.poison} → ${poison}).`,turn:game.turnNumber,type:'player-notification',kind:'poison-change',affectedPlayerIds:affected,attention:true})}
    const nowStatuses=new Set(p.statuses||[]);for(const st of nowStatuses)if(!b.statuses.has(st))game.log.unshift({text:`${source}. ${p.displayName} gains status: ${st}.`,turn:game.turnNumber,type:'player-notification',kind:'status-gained',affectedPlayerIds:affected,attention:true});for(const st of b.statuses)if(!nowStatuses.has(st))game.log.unshift({text:`${source}. ${p.displayName} loses status: ${st}.`,turn:game.turnNumber,type:'player-notification',kind:'status-lost',affectedPlayerIds:affected,attention:true});
    const nowBattle=new Set((p.deck?.battlefield||[]).map(c=>c.instanceId)),nowGrave=new Set((p.deck?.graveyard||[]).map(c=>c.instanceId));for(const [id,name] of b.battlefield)if(!nowBattle.has(id)){const destination=nowGrave.has(id)?'was put into the graveyard':'left the battlefield';game.log.unshift({text:`${source}. ${name} ${destination} for ${p.displayName}.`,turn:game.turnNumber,type:'player-notification',kind:nowGrave.has(id)?'permanent-graveyard':'permanent-left',affectedPlayerIds:affected,attention:true})}
  }
}
function commitAction(action){
  if(network?.client&&['phase','end-turn','concede'].includes(action.type)){network.client.send({type:'request-game-action',action:structuredClone(action),stateStamp:networkStateStamp(game)});return game;}
  const before=notificationSnapshot();
  const result=engine.commit(action);
  appendStateNotifications(before,action);
  save();
  if(network?.client)sendNetworkPublicUpdate(action.label||'Public state updated');
  return result;
}
function localTurnAllowed(){if(network?.host&&!network?.localPlayerId)return false;return !network?.localPlayerId||game.activePlayerId===network.localPlayerId}
function confirmUndoLastStep(onDone=null){
  if(!engine?.undo)return toast('Nothing to undo',true);
  openModal('CONFIRM UNDO','<p>Undo the most recent game action?</p><p class="muted">Only the latest recorded step will be reversed.</p>',[
    {label:'CANCEL',onClick:closeModal},
    {label:'UNDO LAST STEP',className:'primary',onClick:()=>{
      if(engine.undo()){closeModal();render();toast('Last game step undone');if(typeof onDone==='function')onDone()}
      else toast('Nothing to undo',true)
    }}
  ]);
}
function bindGameActions(){
  $$('[data-log-undo]').forEach(b=>b.onclick=e=>{e.stopPropagation();confirmUndoLastStep()});
  $$('.inline-game-log').forEach(log=>{log.setAttribute('role','button');log.setAttribute('tabindex','0');log.setAttribute('aria-label','Open full game history');log.onclick=e=>{if(e.target.closest('button'))return;openGameHistory()};log.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGameHistory()}}});
  $$('[data-player-nav]').forEach(b=>b.onclick=()=>{const players=game?.players||[];if(players.length<2)return;const referenceId=network?.localPlayerId||game.activePlayerId||players[0]?.playerId;const currentId=inspectedPlayerId||referenceId;let i=Math.max(0,players.findIndex(p=>p.playerId===currentId));i=(i+(b.dataset.playerNav==='next'?1:-1)+players.length)%players.length;const nextId=players[i].playerId;inspectedPlayerId=nextId===referenceId?null:nextId;render()});
  $$('[data-opponent]').forEach(b=>b.onclick=()=>{inspectedPlayerId=b.dataset.opponent;render();window.scrollTo(0,0)});
  $$('[data-collapse-opponent]').forEach(b=>b.onclick=()=>{inspectedPlayerId=null;render();window.scrollTo(0,0)});
  $$('[data-hand-card]').forEach(b=>b.onclick=()=>openHandCard(b.dataset.handCard));
  $$('[data-board-open]').forEach(b=>b.onclick=e=>{if(e.target.closest('button,[data-instance],[data-zone-open]'))return;openBoard()});
  $$('[data-hub]').forEach(b=>b.onclick=()=>({'card-id':()=>openGlobalPicker(),chat:openChat,rescue:openRescue,settings:openSettings,profile:openProfile,home:()=>openModal('RETURN HOME','<p>Close this game and return to the Commander Companion home screen?</p>',[{label:'CANCEL',onClick:closeModal},{label:'RETURN HOME',className:'primary',onClick:()=>{save();closeModal();showLanding()}}])}[b.dataset.hub]?.()));
  $$('[data-play-card]').forEach(b=>b.onclick=()=>openHandCard(b.dataset.playCard));
  $$('[data-instance]').forEach(b=>b.onclick=()=>openBattleCard(b.dataset.instance));
  $$('[data-public-instance]').forEach(b=>b.onclick=()=>{const p=game.players.find(x=>x.playerId===b.dataset.publicPlayer),c=p&&instance(p,b.dataset.publicInstance);if(c)openModal(defOf(game,c)?.name||'CARD',renderCardDetail(game,c)+`<p class="muted">Public card view — gameplay controls are hidden while inspecting another player.</p>`,[{label:'CLOSE',onClick:closeModal}])});
  $$('[data-public-commander]').forEach(b=>b.onclick=()=>{const p=game.players.find(x=>x.playerId===b.dataset.publicPlayer),cmd=p?.commanders?.find(c=>c.id===b.dataset.publicCommander),d=cmd&&game.cardDefinitions?.[cmd.cardId];if(d)openModal(d.name,`<div class="card-detail"><img src="${imageOf(d)}" alt="${esc(d.name)}"><div><h3>${esc(d.name)}</h3><p>Commander Tax: <b>${Number(cmd.commanderTax||0)}</b></p></div></div>`,[{label:'CLOSE',onClick:closeModal}])});
  $$('[data-public-zone]').forEach(b=>b.onclick=()=>openPublicZone(b.dataset.publicPlayer,b.dataset.publicZone));
  $$('[data-commander]').forEach(b=>b.onclick=()=>activePlayer().commanders.length>1?openCommanderPair():openCommander(b.dataset.commander));
  $$('[data-zone-open]').forEach(b=>b.onclick=()=>openZone(b.dataset.zoneOpen));
  $$('[data-action]').forEach(b=>b.onclick=()=>handleAction(b.dataset.action));$$('[data-mana-pool]').forEach(b=>b.onclick=()=>openMana(activePlayer(),b.dataset.manaPool));
  $$('[data-ability-card]').forEach(b=>b.onclick=()=>openCardAbility(b.dataset.abilityCard));
  $$('[data-attack-card]').forEach(b=>b.onclick=()=>{const p=activePlayer(),c=instance(p,b.dataset.attackCard);if(!c)return;const v=validateAttack({game,attackerId:p.playerId,defenderId:'other',instance:c,definition:defOf(game,c)});if(!v.legal)return toast(v.reasons[0]||'This creature cannot attack right now.',true);chooseDefenderForDraft(p,c,[])});
  $$('[data-status-indicator]').forEach(b=>b.onclick=()=>openStatusExplanation(game.players.find(p=>p.playerId===b.dataset.statusIndicator)||activePlayer()));
  const cycles=$$('.status-indicator');cycles.forEach(ind=>{const items=[...ind.querySelectorAll('.status-cycle')];if(items.length)items[0].classList.add('active')});if(cycles.some(ind=>ind.querySelectorAll('.status-cycle').length>1)){statusCycleTimer=setInterval(()=>{cycles.forEach(ind=>{const items=[...ind.querySelectorAll('.status-cycle')];if(items.length<2)return;let i=items.findIndex(x=>x.classList.contains('active'));if(i<0)i=0;items.forEach(x=>x.classList.remove('active'));items[(i+1)%items.length].classList.add('active')})},2600)}
}
function openHandCard(id){const p=activePlayer(),c=instance(p,id),d=defOf(game,c);if(!c||!d)return;if(!localTurnAllowed())return toast(`Waiting for ${p.displayName}'s private actions on their device.`,true);const v=playable(game,p,c);const kind=/Land/i.test(d.typeLine)?'land':'cast';openModal(d.name,renderCardDetail(game,c)+`<div class="${v.legal?'good':'bad'}"><b>${v.legal?'LEGAL PLAY':'NOT CURRENTLY PLAYABLE'}</b><br>${esc(v.reasons.join(' • ')||'Ready to play.')}</div>`,[{label:'CLOSE',onClick:closeModal},...(v.legal?[{label:kind==='land'?'PLAY LAND':'CAST CARD',className:'primary',onClick:()=>playFromHand(p,c,d,kind,v)}]:(game.deviceMode==='multi-device'&&network?[{label:'ASK TABLE',className:'primary',onClick:()=>requestIllegalApproval(p,c,d,kind,v)}]:[]))],kind==='land'?'':manaCalculator(p,d.manaCost||'',0))}

function numberWord(v){const m={one:1,two:2,three:3,four:4,five:5};return Number(v)||m[String(v||'').toLowerCase()]||0}
function modalSpellSpec(d){const text=String(d?.oracleText||'').replace(/\r/g,'');const head=text.match(/Choose\s+(one|two|three|four|five|\d+)\s*[—-]/i);if(!head)return null;const after=text.slice((head.index||0)+head[0].length);let modes=after.split(/\n\s*[•·]\s*/).map(x=>x.trim()).filter(Boolean);if(modes.length<2)modes=after.split(/\s*[•·]\s*/).map(x=>x.trim()).filter(Boolean);if(modes.length<2)return null;return{count:numberWord(head[1]),modes:modes.map(x=>x.replace(/^[-–—]\s*/,''))}}
function combatParticipant(p,id){const cs=game.combatState||{};if((cs.attackers||[]).some(a=>a.instanceId===id))return true;for(const row of Object.values(cs.blocks||{}))if((row?.assignments||[]).some(x=>x.blockerId===id))return true;return false}
function cardSelectOptions(rows){return rows.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}${x.sub?` — ${esc(x.sub)}`:''}</option>`).join('')}
function artifactTargets(){const out=[];for(const q of game.players)for(const c of q.deck.battlefield||[]){const d=defOf(game,c);if(/Artifact/i.test(d?.typeLine||''))out.push({id:c.instanceId,label:d?.name||'Artifact',sub:q.displayName})}return out}
function controlledCombatCreatureTargets(p){return (p.deck.battlefield||[]).filter(c=>combatParticipant(p,c.instanceId)&&/Creature/i.test(defOf(game,c)?.typeLine||'')).map(c=>({id:c.instanceId,label:defOf(game,c)?.name||'Creature',sub:'Attacking / blocking'}))}
function controlledCreatureTargets(p){return (p.deck.battlefield||[]).filter(c=>/Creature/i.test(defOf(game,c)?.typeLine||'')).map(c=>({id:c.instanceId,label:defOf(game,c)?.name||'Creature',sub:'You control'}))}
function anyDamageTargets(excludeId=null){const out=[];for(const q of game.players)out.push({kind:'player',id:q.playerId,label:q.displayName,sub:`Player — life ${q.life}`});for(const q of game.players)for(const c of q.deck.battlefield||[]){if(c.instanceId===excludeId)continue;const d=defOf(game,c);if(/Creature|Planeswalker|Battle/i.test(d?.typeLine||''))out.push({kind:'card',id:c.instanceId,label:d?.name||'Permanent',sub:`${q.displayName} — ${d?.typeLine||''}`})}return out}

function genericRequirementCandidates(req,p){
  const scope=String(req?.scope||'').toLowerCase();const out=[];
  if(req.kind==='player')return game.players.filter(q=>scope==='opponent'?q.playerId!==p.playerId:true).map(q=>({id:q.playerId,label:q.displayName,sub:`Life ${q.life}`}));
  if(req.kind==='graveyard-target'){
    const onlyYours=/your/.test(scope);for(const q of (onlyYours?[p]:game.players))for(const c of q.deck.graveyard||[]){const d=defOf(game,c),t=String(d?.typeLine||'');if(/creature/.test(scope)&&!/Creature/i.test(t))continue;if(/artifact/.test(scope)&&!/Artifact/i.test(t))continue;if(/land/.test(scope)&&!/Land/i.test(t))continue;out.push({id:c.instanceId,label:d?.name||'Card',sub:`${q.displayName} graveyard — ${t}`})}return out;
  }
  if(req.kind==='target'){
    if(/any target|target player|target opponent/.test(scope)){for(const q of game.players)if(!/opponent/.test(scope)||q.playerId!==p.playerId)out.push({id:q.playerId,label:q.displayName,sub:`Player — life ${q.life}`})}
    if(/any target|creature|permanent|artifact|enchantment|planeswalker|land|battle/.test(scope)){
      const players=/you control|your /.test(scope)?[p]:game.players;for(const q of players)for(const c of q.deck.battlefield||[]){const d=defOf(game,c),t=String(d?.typeLine||'');if(/creature/.test(scope)&&!/Creature/i.test(t))continue;if(/artifact or enchantment/.test(scope)&&!/(Artifact|Enchantment)/i.test(t))continue;else if(/artifact/.test(scope)&&!/Artifact/i.test(t))continue;else if(/enchantment/.test(scope)&&!/Enchantment/i.test(t))continue;if(/planeswalker/.test(scope)&&!/Planeswalker/i.test(t))continue;if(/nonland permanent/.test(scope)&&/Land/i.test(t))continue;if(/\bland\b/.test(scope)&&!/nonland/.test(scope)&&!/Land/i.test(t))continue;if(/\bbattle\b/.test(scope)&&!/Battle/i.test(t))continue;if(/attacking or blocking/.test(scope)&&!combatParticipant(q,c.instanceId))continue;out.push({id:c.instanceId,label:d?.name||'Permanent',sub:`${q.displayName} — ${t}`})}
    }return out;
  }
  return out;
}
function filterBattlefieldRows(q,filter='permanent'){const f=String(filter||'permanent').toLowerCase();return (q.deck.battlefield||[]).filter(c=>{const t=String(defOf(game,c)?.typeLine||'').toLowerCase();return f==='permanent'||t.includes(f)}).map(c=>({id:c.instanceId,label:defOf(game,c)?.name||'Permanent',sub:`${q.displayName} — ${defOf(game,c)?.typeLine||''}`}))}
function requirementAmount(req,bindings){if(typeof req.amount==='number')return req.amount;if(String(req.amount).toUpperCase()==='X')return Number(bindings.X||0);return Number(req.amount||1)}
function collectCompiledBindings(p,d,compiled,onDone,index=0,bindings={}){
  const reqs=compiled?.requirements||[];if(index>=reqs.length)return onDone(bindings);const req=reqs[index];const next=()=>collectCompiledBindings(p,d,compiled,onDone,index+1,bindings);
  if(req.kind==='number')return openModal(`${d.name} — ${req.label||'CHOOSE NUMBER'}`,`<label>${esc(req.label||'NUMBER')}<input id="effectNumber" type="number" min="${Number(req.min||0)}" max="${Number(req.max||99)}" value="${Math.max(Number(req.min||0),0)}"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const n=Math.max(Number(req.min||0),Math.min(Number(req.max||99),Number($('#effectNumber').value||0)));bindings[req.bind]=n;next()}}]);
  if(req.kind==='color'){const colors=[['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green'],...(req.includeColorless?[['C','Colorless']]:[])];return openModal(`${d.name} — ${req.label||'CHOOSE COLOR'}`,`<label>${esc(req.label||'COLOR')}<select id="effectColor">${colors.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{bindings[req.bind]=$('#effectColor').value;next()}}])}
  if(req.kind==='text-choice')return openModal(`${d.name} — ${req.label||'CHOOSE'}`,`<label>${esc(req.label||'CHOICE')}<input id="effectTextChoice" autocomplete="off"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const v=$('#effectTextChoice').value.trim();if(!v)return toast('Enter a choice.',true);bindings[req.bind]=v;next()}}]);
  if(req.kind==='stack-target'){const rows=(game.stack||[]).filter(x=>req.scope!=='spell'||x.kind==='spell').map(x=>({id:x.id,label:x.label||def(x.sourceDefinitionId)?.name||'Stack object',sub:x.kind}));if(!rows.length)return toast('There is no legal object on the stack to target.',true);return openModal(`${d.name} — ${req.label||'STACK TARGET'}`,`<label>${esc(req.label||'STACK TARGET')}<select id="effectStackTarget">${cardSelectOptions(rows)}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{bindings[req.bind]=$('#effectStackTarget').value;next()}}])}
  if(req.kind==='per-opponent-up-to-one'){
    const opponents=game.players.filter(q=>q.playerId!==p.playerId&&!q.eliminated),chosen={};let oi=0;
    const chooseOpponent=()=>{if(oi>=opponents.length){bindings[req.bind]=chosen;return next()}const q=opponents[oi];const rows=filterBattlefieldRows(q,req.filter||'permanent');const body=rows.length?`<p>Choose up to one ${esc(req.filter||'permanent')} controlled by ${esc(q.displayName)}, or choose none.</p><div class="card-search-results">${rows.map(r=>`<button class="search-result" data-effect-per-opponent="${esc(r.id)}"><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></button>`).join('')}</div>`:`<p class="muted">${esc(q.displayName)} controls no legal ${esc(req.filter||'permanent')} targets. Continue without a target for this opponent.</p>`;openModal(`${d.name} — ${q.displayName}`,body,[{label:'NONE / CONTINUE',className:rows.length?'':'primary',onClick:()=>{chosen[q.playerId]=null;oi++;chooseOpponent()}}]);$$('[data-effect-per-opponent]').forEach(b=>b.onclick=()=>{chosen[q.playerId]=b.dataset.effectPerOpponent;oi++;chooseOpponent()})};return chooseOpponent();
  }
  if(req.kind==='multi-target'){
    let rows=genericRequirementCandidates({kind:'target',scope:req.scope,label:req.label},p);const max=Math.max(0,Number(req.max||1)),min=Math.max(0,Number(req.min||0));return openModal(`${d.name} — ${req.label||'CHOOSE TARGETS'}`,`<p>Choose ${min?`at least ${min} and `:''}up to ${max}.</p><div class="card-search-results">${rows.map(r=>`<label class="search-result"><input type="checkbox" data-effect-multi="${esc(r.id)}"><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></label>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const ids=$$('[data-effect-multi]:checked').map(x=>x.dataset.effectMulti);if(ids.length<min||ids.length>max)return toast(`Choose ${min===max?min:`${min}–${max}`} targets.`,true);bindings[req.bind]=ids;next()}}]);
  }
  if(req.kind==='card-selection'){
    const amount=requirementAmount(req,bindings),targets=req.scope==='each-opponent'?game.players.filter(q=>q.playerId!==p.playerId&&!q.eliminated):req.scope==='each-player'?game.players.filter(q=>!q.eliminated):req.playerBind?[game.players.find(q=>q.playerId===bindings[req.playerBind])]:[p];const chosen={};let qi=0;
    const choose=()=>{if(qi>=targets.length){bindings[req.bind]=targets.length===1?(chosen[targets[0].playerId]||[]):chosen;return next()}const q=targets[qi];if(!q){qi++;return choose()}const rows=filterBattlefieldRows(q,req.filter);if(rows.length<amount)return toast(`${q.displayName} does not control enough legal permanents.`,true);openModal(`${d.name} — ${q.displayName}`,`<p>Choose exactly ${amount} ${esc(req.filter||'permanent')}${amount===1?'':'s'}.</p><div class="card-search-results">${rows.map(r=>`<label class="search-result"><input type="checkbox" data-effect-card="${esc(r.id)}"><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></label>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const ids=$$('[data-effect-card]:checked').map(x=>x.dataset.effectCard);if(ids.length!==amount)return toast(`Choose exactly ${amount}.`,true);chosen[q.playerId]=ids;qi++;choose()}}])};return choose();
  }
  if(req.kind==='scry'||req.kind==='surveil'){
    const amount=Math.max(0,requirementAmount(req,bindings)),top=(p.deck.remainingLibrary||[]).slice(0,amount);if(!top.length){bindings[req.bind]=req.kind==='scry'?{top:[],bottom:[]}:{top:[],graveyard:[]};return next()}const dest2=req.kind==='scry'?'BOTTOM':'GRAVEYARD';openModal(`${d.name} — ${req.kind.toUpperCase()} ${amount}`,`<p>Choose the destination for every viewed card. Cards kept on top remain in the displayed order.</p><div class="card-search-results">${top.map(c=>`<label class="search-result"><span><b>${esc(defOf(game,c)?.name||'Card')}</b></span><select data-look-card="${esc(c.instanceId)}"><option value="top">TOP</option><option value="other">${dest2}</option></select></label>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const kept=[],other=[];$$('[data-look-card]').forEach(x=>(x.value==='top'?kept:other).push(x.dataset.lookCard));bindings[req.bind]=req.kind==='scry'?{top:kept,bottom:other}:{top:kept,graveyard:other};next()}}]);return;
  }
  if(req.kind==='proliferate'){
    const rows=[];for(const q of game.players){if(Number(q.poison||0)>0)rows.push({kind:'player',id:q.playerId,counter:'poison',label:`${q.displayName} — poison (${q.poison})`});for(const [k,v] of Object.entries(q.counters||{}))if(Number(v)>0)rows.push({kind:'player',id:q.playerId,counter:k,label:`${q.displayName} — ${k} (${v})`});for(const c of q.deck.battlefield||[])for(const [k,v] of Object.entries(c.counters||{}))if(Number(v)>0)rows.push({kind:'card',id:c.instanceId,counter:k,label:`${defOf(game,c)?.name||'Permanent'} — ${k} (${v})`})}if(!rows.length)return toast('There are no counters available to proliferate.',true);return openModal(`${d.name} — PROLIFERATE`,`<p>Choose any permanents and/or players. For each chosen object, choose one kind of counter already there.</p><div class="card-search-results">${rows.map((r,i)=>`<label class="search-result"><input type="checkbox" data-prolif="${i}"><span>${esc(r.label)}</span></label>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const picks=$$('[data-prolif]:checked').map(x=>rows[Number(x.dataset.prolif)]);if(!picks.length)return toast('Choose at least one object to proliferate.',true);const unique=[];const seen=new Set();for(const x of picks){if(seen.has(x.kind+':'+x.id))continue;seen.add(x.kind+':'+x.id);unique.push(x)}bindings[req.bind]=unique;next()}}])
  }
  if(req.kind==='discard-cards'){
    const targetIds=req.scope==='each-opponent'?game.players.filter(q=>q.playerId!==p.playerId).map(q=>q.playerId):[req.playerBind?bindings[req.playerBind]:p.playerId];const chosenByPlayer={};let pi=0;
    const chooseFor=()=>{if(pi>=targetIds.length){bindings[req.bind]=req.scope==='each-opponent'?chosenByPlayer:(chosenByPlayer[targetIds[0]]||[]);return next()}const q=game.players.find(x=>x.playerId===targetIds[pi]);if(!q)return void(pi++,chooseFor());const hand=q.deck.hand||[],need=Math.min(Number(req.amount||1),hand.length);if(hand.length<Number(req.amount||1))return toast(`${q.displayName} does not have enough cards to discard.`,true);openModal(`${d.name} — ${q.displayName} DISCARD`, `<p>${esc(q.displayName)} chooses exactly ${need} card${need===1?'':'s'} to discard.</p><div class="card-search-results">${hand.map(c=>`<label class="search-result"><input type="checkbox" data-effect-discard="${esc(c.instanceId)}"><span><b>${esc(defOf(game,c)?.name||'Card')}</b></span></label>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONFIRM DISCARD',className:'primary',onClick:()=>{const ids=$$('[data-effect-discard]:checked').map(x=>x.dataset.effectDiscard);if(ids.length!==need)return toast(`Choose exactly ${need} card${need===1?'':'s'}.`,true);chosenByPlayer[q.playerId]=ids;pi++;chooseFor()}}])};return chooseFor();
  }
  let rows=genericRequirementCandidates(req,p);if(req.excludeBind&&bindings[req.excludeBind])rows=rows.filter(r=>r.id!==bindings[req.excludeBind]);if(!rows.length)return toast(`No legal choice is available for ${req.label||req.scope||'this effect'}.`,true);openModal(`${d.name} — ${req.label||'CHOOSE TARGET'}`,`<label>${esc(req.label||'TARGET')}<select id="genericEffectChoice">${cardSelectOptions(rows)}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{bindings[req.bind]=$('#genericEffectChoice').value;next()}}]);
}
function putCompiledSpellOnStack(p,c,d,v,compiled,bindings={},asEntersChoices=null,searchResult=null,guidedResolution=null){
  const fresh=validatePlay({game,player:p,definition:d,instance:c,kind:'cast',definitions:definitionsMap()});if(!fresh.legal)return toast(fresh.reasons.join(' • ')||'This spell is no longer legal.',true);
  const permanent=!/Instant|Sorcery/i.test(d.typeLine||''),cap=permanent?landManaOptions(d):[];
  const sourceZone=c.zone==='graveyard'?'graveyard':c.zone==='command'?'commandZone':c.zone||'hand';commitAction({type:'cast-spell',playerId:p.playerId,instanceId:c.instanceId,fromZones:[sourceZone],to:permanent?'battlefield':'graveyard',payment:fresh.suggestedPayment,effects:compiled?.effects||[],effectBindings:{...bindings,sourceId:c.instanceId},searchResult,guidedResolution,asEntersChoices,manaCapacityColor:cap.length===1?cap[0]:null,label:`${p.displayName} casts ${d.name}${sourceZone==='graveyard'?' from the graveyard':''}.`});closeModal();onStackObjectAdded(p,`${d.name} cast`);
}
function finishCompiledSpellCast(p,c,d,v,compiled,bindings){putCompiledSpellOnStack(p,c,d,v,compiled,bindings,null)}
function beginCompiledSpellCast(p,c,d,v,compiled){collectCompiledBindings(p,d,compiled,bindings=>finishCompiledSpellCast(p,c,d,v,compiled,bindings))}
async function openSpellLibrarySearch(p,c,d,v,asEntersChoices=null){
  const spec=librarySearchSpec(d.oracleText);if(!spec)return putCompiledSpellOnStack(p,c,d,v,{effects:[],requirements:[]},{},asEntersChoices,null,{title:`${d.name} — SEARCH NEEDS GUIDED RESOLUTION`,oracleText:d.oracleText,unsupported:[d.oracleText]});
  const pool=await pickerPool({mode:game.mode,source:trackedDeckSource(p.deck,{zones:['library']})});const rows=pool.map(card=>({card,definition:defOf(game,card)})).filter(x=>spec.filter(x.definition));
  openModal(`SEARCH LIBRARY — ${d.name}`,`<div class="ability-search-summary"><b>SEARCH FOR:</b> ${esc(spec.label.toUpperCase())}<br><small>${esc(spec.text)}</small></div><div class="card-search-row draw-search-row"><input id="spellLibrarySearch" placeholder="Search tracked library" autocomplete="off" inputmode="search"></div><div id="spellLibraryResults" class="card-search-results"></div>`,[{label:'CANCEL',onClick:closeModal},...(spec.optional?[{label:'FIND NOTHING',onClick:()=>putCompiledSpellOnStack(p,c,d,v,{effects:[],requirements:[]},{},asEntersChoices,null)}]:[])]);
  const draw=()=>{const q=($('#spellLibrarySearch')?.value||'').trim().toLowerCase(),shown=rows.filter(x=>!q||`${x.definition?.name||''} ${x.definition?.typeLine||''}`.toLowerCase().includes(q));$('#spellLibraryResults').innerHTML=shown.map(({card,definition})=>`<button class="search-result" data-spell-library="${esc(card.instanceId)}"><img src="${esc(imageOf(definition))}"><span><b>${esc(definition?.name||'Unresolved')}</b><small>${esc(definition?.typeLine||'')}</small></span></button>`).join('')||'<p class="muted">No legal cards match this search.</p>';$$('[data-spell-library]').forEach(b=>b.onclick=()=>putCompiledSpellOnStack(p,c,d,v,{effects:[],requirements:[]},{},asEntersChoices,{instanceId:b.dataset.spellLibrary,to:spec.destination,position:spec.destination==='library'?'top':undefined,entersTapped:spec.entersTapped,shuffle:spec.shuffle,untapIfLandsAtLeast:spec.untapIfLandsAtLeast}))};$('#spellLibrarySearch').oninput=draw;draw();
}
function playFromHandResolved(p,c,d,kind,v,asEntersChoices=null){
  if(kind==='land')return finishLandPlay(p,c,d,asEntersChoices);
  const support=spellSupport(d);
  if(/Instant|Sorcery/i.test(d.typeLine||'')){
    if(support.kind==='modal'&&support.modal)return beginGenericModalSpellCast(p,c,d,v,support.modal);
    if(support.kind==='search-spell')return openSpellLibrarySearch(p,c,d,v,asEntersChoices);
    if(support.kind==='effect'&&support.compiled?.supported)return collectCompiledBindings(p,d,support.compiled,bindings=>putCompiledSpellOnStack(p,c,d,v,support.compiled,bindings,asEntersChoices));
    if(support.kind==='spell'&&support.compiled?.supported)return putCompiledSpellOnStack(p,c,d,v,support.compiled,{},asEntersChoices);
    return putCompiledSpellOnStack(p,c,d,v,{effects:[],requirements:[]},{},asEntersChoices,null,{title:`${d.name} — ORACLE RESOLUTION REQUIRED`,oracleText:d.oracleText,unsupported:support.reasons||support.compiled?.unsupported||[d.oracleText]});
  }
  return putCompiledSpellOnStack(p,c,d,v,{effects:[],requirements:[]},{},asEntersChoices);
}
function beginAsEntersChoice(p,c,d,kind,v,spec){
  if(!spec)return playFromHandResolved(p,c,d,kind,v,null);
  if(spec.kind==='color'){const colors=[['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green']].filter(([k])=>!(spec.exclude||[]).includes(k));return openModal(`${d.name} — AS IT ENTERS`,`<p class="oracle">${esc(spec.prompt)}</p><label>CHOSEN COLOR<select id="asEntersColor">${colors.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONFIRM',className:'primary',onClick:()=>playFromHandResolved(p,c,d,kind,v,{color:$('#asEntersColor').value})}])}
  if(spec.kind==='opponent'){const rows=game.players.filter(q=>q.playerId!==p.playerId&&!q.eliminated);return openModal(`${d.name} — AS IT ENTERS`,`<p class="oracle">${esc(spec.prompt)}</p><label>CHOSEN OPPONENT<select id="asEntersOpponent">${rows.map(q=>`<option value="${esc(q.playerId)}">${esc(q.displayName)}</option>`).join('')}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONFIRM',className:'primary',onClick:()=>playFromHandResolved(p,c,d,kind,v,{playerId:$('#asEntersOpponent').value})}])}
  if(spec.kind==='creature-type')return openModal(`${d.name} — AS IT ENTERS`,`<p class="oracle">${esc(spec.prompt)}</p><label>CREATURE TYPE<input id="asEntersText" autocomplete="off" placeholder="e.g. Elf"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONFIRM',className:'primary',onClick:()=>{const value=$('#asEntersText').value.trim();if(!value)return toast('Choose a creature type.',true);playFromHandResolved(p,c,d,kind,v,{creatureType:value})}}]);
  if(spec.kind==='card-name')return openModal(`${d.name} — AS IT ENTERS`,`<p class="oracle">${esc(spec.prompt)}</p><label>CARD NAME<input id="asEntersText" autocomplete="off" placeholder="Card name"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONFIRM',className:'primary',onClick:()=>{const value=$('#asEntersText').value.trim();if(!value)return toast('Choose a card name.',true);playFromHandResolved(p,c,d,kind,v,{cardName:value})}}]);
  return playFromHandResolved(p,c,d,kind,v,null);
}
function beginGenericModalSpellCast(p,c,d,v,modal){const count=Math.min(modal.count,modal.modes.length);const selects=Array.from({length:count},(_,i)=>`<label>CHOICE ${i+1}<select data-spell-mode>${modal.modes.map((m,j)=>`<option value="${j}">${esc(m)}</option>`).join('')}</select></label>`).join('');openModal(`${d.name} — CHOOSE ${count}`,`<p>Choose exactly ${count} different mode${count===1?'':'s'}.</p><div class="compact-choice-grid">${selects}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const idx=$$('[data-spell-mode]').map(x=>Number(x.value));if(new Set(idx).size!==count)return toast(`Choose ${count} different modes.`,true);const chosen=idx.map(i=>modal.compiledModes[i]);if(chosen.some(x=>!x?.supported))return putCompiledSpellOnStack(p,c,d,v,{effects:[],requirements:[]},{},null,null,{title:`${d.name} — GUIDED MODE`,oracleText:d.oracleText,unsupported:chosen.flatMap(x=>x?.unsupported||[])});const combined={supported:true,effects:chosen.flatMap(x=>x.effects),requirements:chosen.flatMap(x=>x.requirements),unsupported:[]};collectCompiledBindings(p,d,combined,bindings=>putCompiledSpellOnStack(p,c,d,v,combined,bindings,null))}}])}

function finishModalSpellCast(p,c,d,v,effects,modes){const fresh=validatePlay({game,player:p,definition:d,instance:c,kind:'cast',definitions:definitionsMap()});if(!fresh.legal)return toast(fresh.reasons.join(' • ')||'This spell is no longer legal.',true);commitAction({type:'cast-card',playerId:p.playerId,instanceId:c.instanceId,to:'graveyard',payment:fresh.suggestedPayment,effects,label:`${p.displayName} casts ${d.name} choosing ${modes.join(' / ')}.`});closeModal();render()}
function collectModalSpellEffects(p,c,d,v,modes,index=0,effects=[]){
  if(index>=modes.length)return finishModalSpellCast(p,c,d,v,effects,modes);
  const mode=modes[index],next=()=>collectModalSpellEffects(p,c,d,v,modes,index+1,effects);
  if(/Destroy target artifact/i.test(mode)){const rows=artifactTargets();if(!rows.length)return toast('No legal artifact target is available.',true);openModal(`${d.name} — TARGET ${index+1}`,`<p class="oracle">${esc(mode)}</p><label>TARGET ARTIFACT<select id="spellTarget">${cardSelectOptions(rows)}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{effects.push({kind:'destroy',targetId:$('#spellTarget').value});next()}}]);return}
  if(/Put two \+1\/\+1 counters on target attacking or blocking creature you control/i.test(mode)){const rows=controlledCombatCreatureTargets(p);if(!rows.length)return toast('No attacking or blocking creature you control is a legal target.',true);openModal(`${d.name} — TARGET ${index+1}`,`<p class="oracle">${esc(mode)}</p><label>YOUR ATTACKING / BLOCKING CREATURE<select id="spellTarget">${cardSelectOptions(rows)}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{effects.push({kind:'counter',targetId:$('#spellTarget').value,counter:'+1/+1',amount:2});next()}}]);return}
  if(/Target creature you control deals damage equal to its power to any other target\. Then sacrifice it/i.test(mode)){const src=controlledCreatureTargets(p);if(!src.length)return toast('You do not control a creature that can be chosen.',true);const first=src[0]?.id;const targets=anyDamageTargets(first);openModal(`${d.name} — FOOT TOSS`, `<p class="oracle">${esc(mode)}</p><label>CREATURE YOU CONTROL<select id="spellSource">${cardSelectOptions(src)}</select></label><label>OTHER TARGET<select id="spellDamageTarget">${targets.map(x=>`<option value="${esc(x.kind+':'+x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')}</select></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const sourceId=$('#spellSource').value;const validTargets=anyDamageTargets(sourceId);const raw=$('#spellDamageTarget').value;let [kind,...rest]=raw.split(':');let id=rest.join(':');if(!validTargets.some(x=>x.kind===kind&&x.id===id)){const fallback=validTargets[0];if(!fallback)return toast('No legal other target is available.',true);kind=fallback.kind;id=fallback.id}effects.push({kind:'damage-from-creature',sourceId,targetKind:kind,targetId:id,sacrificeSource:true});next()}}]);$('#spellSource').onchange=()=>{const rows=anyDamageTargets($('#spellSource').value);$('#spellDamageTarget').innerHTML=rows.map(x=>`<option value="${esc(x.kind+':'+x.id)}">${esc(x.label)} — ${esc(x.sub)}</option>`).join('')};return}
  return toast(`This chosen mode is not yet safely resolvable: ${mode}`,true);
}
function beginModalSpellCast(p,c,d,v,spec){const count=Math.min(spec.count,spec.modes.length);const selects=Array.from({length:count},(_,i)=>`<label>CHOICE ${i+1}<select data-spell-mode>${spec.modes.map((m,j)=>`<option value="${j}">${esc(m)}</option>`).join('')}</select></label>`).join('');openModal(`${d.name} — CHOOSE ${count}`,`<p>Choose exactly ${count} different mode${count===1?'':'s'}. Effects and targets will be applied to the tracked game state.</p><div class="compact-choice-grid">${selects}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const indexes=$$('[data-spell-mode]').map(x=>Number(x.value));if(new Set(indexes).size!==count)return toast(`Choose ${count} different modes.`,true);const modes=indexes.map(i=>spec.modes[i]);collectModalSpellEffects(p,c,d,v,modes)}}])}
function playFromHand(p,c,d,kind,v){
  const fresh=validatePlay({game,player:p,definition:d,instance:c,kind,definitions:definitionsMap()});if(!fresh.legal){closeModal();render();return toast(fresh.reasons.join(' • ')||'This action is no longer legal.',true)}v=fresh;
  if(kind==='land')return playLandFromHand(p,c,d);
  const enter=asEntersChoiceSpec(d);if(enter)return beginAsEntersChoice(p,c,d,kind,v,enter);
  return playFromHandResolved(p,c,d,kind,v,null);
}
function openBattleCard(id){const p=activePlayer(),c=instance(p,id);if(!c)return;const d=defOf(game,c),readOnly=!localTurnAllowed();const tapAbilities=parseActivatedAbilities(d).filter(a=>a.requiresTap);const attackCheck=validateAttack({game,attackerId:p.playerId,defenderId:'other',instance:c,definition:d});const actions=readOnly?[]:[
  ...(attackCheck.legal?[{label:'ATTACK',className:'primary',onClick:()=>chooseDefenderForDraft(p,c,[])}]:[]),
  ...(c.tapped?[{label:'TAPPED — LOCKED',disabled:true}]:tapAbilities.length?[{label:tapAbilities.length>1?'USE / CHOOSE TAP ABILITY':'USE TAP ABILITY',className:'primary',onClick:()=>openCardAbility(id)}]:[{label:'TAP (TRACK STATE)',onClick:()=>{commitAction({type:'tap-card',playerId:p.playerId,instanceId:id,tapped:true,label:`${d?.name||'Card'} tapped for a tracked effect.`});closeModal();render()}}]),
  ...(parseActivatedAbilities(d).length?[{label:'ABILITIES',onClick:()=>openCardAbility(id)}]:[]),{label:'MOVE',onClick:()=>openMoveCard(p,c)},{label:'COUNTERS',onClick:()=>openCardCounters(p,c)}
];openModal(d?.name||'Card',renderCardDetail(game,c)+(tapAbilities.length?`<p class="good"><b>${tapAbilities.length} tap-cost ${tapAbilities.length===1?'ability':'abilities'} detected.</b> Choose the ability before paying {T}.</p>`:'')+(readOnly?'<p class="muted">Public card view — actions belong to the active player device.</p>':''),[...actions,{label:'CLOSE',onClick:closeModal}])}
function openMoveCard(p,c){const d=defOf(game,c);openModal(`MOVE ${d?.name||'CARD'}`,`<p>Select destination.</p>`,['battlefield','graveyard','exile','hand','library','command'].map(z=>({label:z.toUpperCase(),onClick:()=>{commitAction({type:'move-card',playerId:p.playerId,instanceId:c.instanceId,to:z,position:z==='library'?'top':undefined,label:`${d?.name||'Card'} moved to ${z}.`});closeModal();render()}})))}
function openCardCounters(p,c){const d=defOf(game,c);const names=['+1/+1','-1/-1','stun','charge','loyalty'];openModal(`${d?.name||'CARD'} COUNTERS`,names.map(n=>`<div class="counter-control"><b>${esc(n)}</b><span>${c.counters?.[n]||0}</span><button data-cc="${esc(n)}" data-d="1">+</button><button data-cc="${esc(n)}" data-d="-1">−</button></div>`).join(''),[{label:'DONE',onClick:closeModal}]);$$('[data-cc]').forEach(b=>b.onclick=()=>{commitAction({type:'card-counter',playerId:p.playerId,instanceId:c.instanceId,counter:b.dataset.cc,delta:+b.dataset.d,label:`${d?.name}: ${b.dataset.d>0?'added':'removed'} ${b.dataset.cc} counter.`});openCardCounters(p,instance(p,c.instanceId));render()})}
function openCommanderPair(){
  const p=activePlayer();if(p.commanders.length<2)return openCommander(p.commanders[0]?.id);
  const cards=p.commanders.map(cmd=>{const d=def(cmd.cardId),inst=p.deck.commandZone.find(c=>c.definitionId===cmd.cardId)||p.deck.battlefield.find(c=>c.definitionId===cmd.cardId);const v=d?validatePlay({game,player:p,definition:d,instance:inst,kind:'cast',commander:cmd,definitions:definitionsMap()}):{legal:false,reasons:['Card data unresolved']};return {cmd,d,inst,v}});
  const html=`<p>Both commanders share this command area but keep independent cast counts, taxes and zones.</p><div class="commander-pair-modal">${cards.map(({cmd,d,inst,v})=>`<section><div class="card-detail">${d?`<img src="${imageOf(d)}" alt="${esc(d.name)}">`:'<span class="fallback">UNRESOLVED</span>'}<div><h3>${esc(d?.name||'Commander')}</h3>${manaCalculator(p,d?.manaCost||'',game.rulesConfig?.commanderTax===false?0:(cmd.commanderTax||0))}<p class="${v.legal?'good':'bad'}">${esc(v.reasons.join(' • ')||'Legal commander cast.')}</p>${cmd.zone==='command'&&v.legal&&localTurnAllowed()?`<button class="primary" data-pair-cast="${esc(cmd.id)}">CAST COMMANDER</button>`:''}</div></div></section>`).join('')}</div>`;
  openModal('COMMANDERS',html,[{label:'CLOSE',onClick:closeModal}]);
  $$('[data-pair-cast]').forEach(b=>b.onclick=()=>{const row=cards.find(x=>x.cmd.id===b.dataset.pairCast);if(!row)return;commitAction({type:'cast-commander',playerId:p.playerId,commanderId:row.cmd.id,payment:row.v.suggestedPayment,label:`${p.displayName} casts ${row.d.name} from the command zone.`});closeModal();render()})
}
function openCommander(id){const p=activePlayer(),cmd=p.commanders.find(c=>c.id===id),d=def(cmd?.cardId);if(!cmd||!d)return;const readOnly=!localTurnAllowed();const inst=p.deck.commandZone.find(c=>c.definitionId===cmd.cardId)||p.deck.battlefield.find(c=>c.definitionId===cmd.cardId);const v=validatePlay({game,player:p,definition:d,instance:inst,kind:'cast',commander:cmd,definitions:definitionsMap()});const inCommand=cmd.zone==='command';openModal(d.name,renderCardDetail(game,inst||{definitionId:d.definitionId})+`<p><b>Commander Tax:</b> ${game.rulesConfig?.commanderTax===false?'OFF':cmd.commanderTax}</p><div class="${v.legal?'good':'bad'}">${esc(v.reasons.join(' • ')||'Legal commander cast.')}</div>`,[{label:'CLOSE',onClick:closeModal},...(!readOnly&&inCommand&&v.legal?[{label:'CAST COMMANDER',className:'primary',onClick:()=>{commitAction({type:'cast-commander',playerId:p.playerId,commanderId:cmd.id,payment:v.suggestedPayment,label:`${p.displayName} casts ${d.name} from the command zone.`});closeModal();render()}}]:[])],manaCalculator(p,d.manaCost||'',cmd.commanderTax||0))}
function openPublicZone(playerId,zone){const p=game.players.find(x=>x.playerId===playerId);if(!p)return;openModal(`${p.displayName} — ${zone.toUpperCase()}`,zoneModal(game,p,zone),[{label:'CLOSE',onClick:closeModal}]);$$('.mini-card[data-instance]').forEach(b=>b.onclick=()=>{const c=instance(p,b.dataset.instance);if(!c)return;closeModal();openModal(defOf(game,c)?.name||'CARD',renderCardDetail(game,c),[{label:'CLOSE',onClick:closeModal}])})}
function openZone(zone){const p=activePlayer();const actions=[{label:'CLOSE',onClick:closeModal}];if(localTurnAllowed()&&zone==='tokens')actions.unshift({label:'ADD TOKEN',className:'primary',onClick:()=>openGlobalPicker({title:'ADD TOKEN',onSelect:d=>{game.cardDefinitions[d.definitionId]=d;const c={instanceId:`${p.playerId}:${d.definitionId}:token:${crypto.randomUUID()}`,definitionId:d.definitionId,ownerId:p.playerId,controllerId:p.playerId,zone:'tokens',tapped:false,counters:{},attachments:[],temporaryEffects:[]};p.deck.tokens.push(c);sync(p.deck);game.log.unshift({text:`${p.displayName} creates ${d.name} token.`,turn:game.turnNumber});closeModal();render()}})});openModal(zone.toUpperCase(),zoneModal(game,p,zone),actions);$$('.mini-card[data-instance]').forEach(b=>b.onclick=()=>{const c=instance(p,b.dataset.instance);closeModal();openBattleCard(c.instanceId)})}

function bindHostDashboard(){
  $$('[data-host-adjust]').forEach(b=>b.onclick=()=>{const p=game?.players.find(x=>x.playerId===b.dataset.hostAdjust);if(p)openCounters(p)});
  $$('[data-host-focus]').forEach(b=>b.onclick=()=>{const p=game?.players.find(x=>x.playerId===b.dataset.hostFocus);if(!p)return;openModal(`HOST VIEW — ${p.displayName}`,`<p>Neutral public-state view. Private hand identities are never exposed to the host.</p><div class="counter-grid"><div class="counter-control"><b>LIFE</b><span>${p.life}</span></div><div class="counter-control"><b>POISON</b><span>${p.poison||0}</span></div><div class="counter-control"><b>HAND</b><span>${p.publicCounts?.hand??p.deck?.hand?.length??0}</span></div><div class="counter-control"><b>LIBRARY</b><span>${p.publicCounts?.library??p.deck?.remainingLibrary?.length??0}</span></div></div><h3>STATUS</h3><p>${p.statuses?.length?p.statuses.map(esc).join(' • '):'No status'}</p>`,[{label:'CLOSE',onClick:closeModal},{label:'GM / JUDGE OPTIONS',className:'primary',onClick:openGMOptions}])});
  $('[data-host-gm]')?.addEventListener('click',openGMOptions);
}
function handleAction(a){const p=activePlayer();if(!localTurnAllowed()){toast(`Waiting for ${p.displayName}'s actions on their device.`,true);return}if(a==='draw')drawFlow(p);else if(a==='add-card')openAddCard(p);else if(a==='next-phase')advancePhase(p);else if(a==='end-turn')endTurn(p);else if(a==='mana')openMana(p);else if(a==='counters')openCounters(p);else if(a==='attack')openAttack(p);else if(a==='untap')openUntap(p);else if(a==='ability')openAbility(p);else if(a==='special')openSpecial(p)}
function finishTrackedDraw(p,c,label){commitAction({type:'move-card',playerId:p.playerId,instanceId:c.instanceId,to:'hand',label:`${p.displayName} drew a card.`});p.confirmations.draw=true;if(game.phase==='draw'){satisfyGate(game,'draw');commitAction({type:'phase',playerId:p.playerId,phase:'precombat-main',label:'Draw confirmed. Phase advances to Main 1.'})}closeModal();render();runSmartPhaseSkips()}
function randomTrackedDraw(p){if(!p.deck.remainingLibrary.length)return toast('Library is empty',true);const c=p.deck.remainingLibrary[Math.floor(Math.random()*p.deck.remainingLibrary.length)],d=defOf(game,c);openModal('RANDOM VIRTUAL DRAW',renderCardDetail(game,c)+`<p>A random card was selected from the remaining tracked library for deck simulation/testing. Confirm to add it to the Virtual Hand.</p>`,[{label:'BACK',onClick:()=>openPhysicalDraw(p)},{label:'CONFIRM RANDOM DRAW',className:'primary',onClick:()=>finishTrackedDraw(p,c)}])}
function drawFlow(p){if(game.mode==='freeplay'&&!p.settings?.handTracking){return openModal('DRAW STEP',`<p>${esc(p.displayName)} draws a physical card. Virtual Hand is off in Freeplay, so no private card identity is recorded.</p>`,[{label:'CANCEL',onClick:closeModal},{label:'CONFIRM DRAW',className:'primary',onClick:()=>{game.log.unshift({text:`${p.displayName} drew a card.`,turn:game.turnNumber});p.confirmations.draw=true;if(game.phase==='draw'){satisfyGate(game,'draw');commitAction({type:'phase',playerId:p.playerId,phase:'precombat-main',label:'Physical draw confirmed. Phase advances to Main 1.'})}closeModal();render();runSmartPhaseSkips()}}])}return openPhysicalDraw(p)}
async function openPhysicalDraw(p){const pool=await pickerPool({mode:game.mode,source:trackedDeckSource(p.deck,{zones:['library']})});const rows=pool.map(c=>{const d=defOf(game,c);return {c,d,name:(d?.name||'Unresolved'),search:`${d?.name||''} ${d?.typeLine||''}`.toLowerCase()}});openModal('DRAW CARD',`<div class="draw-top-actions"><button id="drawRandomTop" class="primary">RANDOM DRAW</button><button id="drawCancelTop">CANCEL</button></div><p>Search the remaining tracked library and select the card actually drawn. Virtual Hand does not choose a random card automatically.</p><div class="card-search-row draw-search-row"><input id="drawSearch" placeholder="Search remaining deck" autocomplete="off" inputmode="search"></div><div id="drawSearchResults" class="card-search-results">${rows.map(({c,d,name})=>`<button class="search-result" data-draw-id="${esc(c.instanceId)}"><img src="${esc(imageOf(d))}"><span>${esc(name)}</span></button>`).join('')}</div>`,[]);$('#drawRandomTop').onclick=()=>randomTrackedDraw(p);$('#drawCancelTop').onclick=closeModal;const bind=()=>$$('[data-draw-id]').forEach(b=>b.onclick=()=>{const c=instance(p,b.dataset.drawId),d=defOf(game,c);openModal('CONFIRM DRAW',renderCardDetail(game,c)+`<p>Confirm to move this exact tracked card into the Virtual Hand.</p>`,[{label:'BACK',onClick:()=>openPhysicalDraw(p)},{label:'CONFIRM DRAW / ADD TO HAND',className:'primary',onClick:()=>finishTrackedDraw(p,c)}])});bind();const input=$('#drawSearch');if(input){input.oninput=()=>{const q=input.value.trim().toLowerCase();$('#drawSearchResults').innerHTML=rows.filter(r=>!q||r.search.includes(q)).map(({c,d,name})=>`<button class="search-result" data-draw-id="${esc(c.instanceId)}"><img src="${esc(imageOf(d))}"><span>${esc(name)}</span></button>`).join('')||'<p class="muted">No remaining cards match that search.</p>';bind()}}
}
function advancePhase(p){
  // Reconcile phase gates before evaluating locks. This prevents a completed combat
  // gate from surviving after the game has already moved into a later phase.
  configurePhaseGates(game,game.phase);
  if(game.phase==='cleanup'&&game.phaseGates?.discard?.required&&!game.phaseGates.discard.satisfied){
    openCleanupDiscard(p,()=>endTurn(p));
    return;
  }
  if(isCombatPhase(game.phase)&&game.phaseGates?.combat?.required&&!game.phaseGates.combat.satisfied){
    openAttack(p);
    return;
  }
  if(phaseLocked(game)){toast(game.phase==='untap'?'Untap your cards before continuing.':game.phase==='draw'?'Confirm the draw before continuing.':isCombatPhase(game.phase)?'Confirm attackers before continuing.':'A required confirmation is still pending.',true);return}
  let n=nextPhase(game);if(n==='untap')return endTurn(p);
  if(['begin-combat','declare-attackers'].includes(n)){openAttack(p);return}
  commitAction({type:'phase',playerId:p.playerId,phase:n,label:`Phase advances to ${phaseLabel(n)}.`});render();
  if(runSmartPhaseSkips())return;
  if(n==='combat')return openAttack(p);
  if(game.pendingTriggers?.length)processPendingTriggers(()=>beginPriority(`${phaseLabel(n)} triggered abilities are on the stack.`,'phase-triggers',()=>render(),game.activePlayerId));
}
function openUntap(p){
  const tapped=p.deck.battlefield.filter(c=>c.tapped);if(!tapped.length){p.confirmations.untap=true;if(game.phaseGates?.untap)satisfyGate(game,'untap');render();return}
  openModal('UNTAP YOUR CARDS',`<p>Untap is required before you can continue. Choose all cards or select individual tapped permanents.</p><div class="card-search-results">${tapped.map(c=>{const d=defOf(game,c);return `<button class="search-result" data-untap-card="${c.instanceId}"><img src="${imageOf(d)}"><span>${esc(d?.name||'Card')}</span></button>`}).join('')}</div>`,[
    {label:'UNTAP ALL',className:'primary',onClick:()=>{for(const c of tapped)commitAction({type:'tap-card',playerId:p.playerId,instanceId:c.instanceId,tapped:false,allowUntap:true,untapReason:'untap-step',label:`${defOf(game,c)?.name||'Card'} untaps.`});p.confirmations.untap=true;if(game.phaseGates?.untap)satisfyGate(game,'untap');game.log.unshift({text:`${p.displayName} completes the untap step.`,turn:game.turnNumber});closeModal();render()}}
  ]);
  $$('[data-untap-card]').forEach(b=>b.onclick=()=>{const c=instance(p,b.dataset.untapCard);commitAction({type:'tap-card',playerId:p.playerId,instanceId:c.instanceId,tapped:false,allowUntap:true,untapReason:'untap-step',label:`${defOf(game,c)?.name||'Card'} untaps.`});if(!p.deck.battlefield.some(x=>x.tapped)){p.confirmations.untap=true;if(game.phaseGates?.untap)satisfyGate(game,'untap');closeModal()}render()})
}
function endTurn(p){
  const go=()=>{commitAction({type:'end-turn',playerId:p.playerId,label:`${p.displayName} ends the turn.`});game.endTurnGuidanceKey=null;activePlayer().confirmations.draw=false;render();runSmartPhaseSkips()};
  configurePhaseGates(game,game.phase);
  if((game.phase==='cleanup'||game.mode==='fully-tracked')&&p.deck.hand.length>7)return openCleanupDiscard(p,go);
  if(game.rulesConfig?.endTurnConfirm===false)return go();
  openModal('END TURN?',`<p>End ${esc(p.displayName)}'s turn and pass to the next player?</p>`,[{label:'CANCEL',onClick:closeModal},{label:'END TURN',className:'primary',onClick:()=>{closeModal();go()}}])
}
function openCleanupDiscard(p,done){
  const need=p.deck.hand.length-7;
  openModal('CLEANUP — DISCARD',`<p>${esc(p.displayName)} must discard ${need} card${need===1?'':'s'} before the turn can end.</p><div class="hand-strip">${p.deck.hand.map(c=>{const d=def(c.definitionId);return `<button class="hand-card" data-discard="${c.instanceId}"><img src="${imageOf(d)}" alt="${esc(d?.name||'Card')}"></button>`}).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);
  $$('[data-discard]').forEach(b=>b.onclick=()=>{const c=instance(p,b.dataset.discard),d=def(c.definitionId);commitAction({type:'move-card',playerId:p.playerId,instanceId:c.instanceId,to:'graveyard',label:`${p.displayName} discards ${d?.name||'a card'} during cleanup.`});if(p.deck.hand.length<=7){p.confirmations.cleanup=true;p.confirmations.discard=true;if(game.phaseGates?.discard)satisfyGate(game,'discard');closeModal();done()}else openCleanupDiscard(p,done)})
}
function openMana(p,pool='available'){const colors=[['W','WHITE'],['U','BLUE'],['B','BLACK'],['R','RED'],['G','GREEN'],['C','COLORLESS']],isTotal=pool==='total',obj=isTotal?p.mana.total:p.mana.available;openModal(isTotal?'TOTAL MANA':'AVAILABLE MANA THIS TURN',`<p>${isTotal?'Adjust this player’s tracked mana capacity.':'Adjust mana currently available to spend this turn.'}</p><div class="counter-grid">${colors.map(([c,n])=>`<div class="counter-control"><b>${n}</b><span>${obj[c]||0}</span><button data-mana="${c}" data-delta="1">+</button><button data-mana="${c}" data-delta="-1">−</button></div>`).join('')}</div>`,[{label:'DONE',onClick:closeModal}]);$$('[data-mana]').forEach(b=>b.onclick=()=>{commitAction({type:isTotal?'mana-total':'mana-available',playerId:p.playerId,color:b.dataset.mana,delta:+b.dataset.delta,label:`${p.displayName} adjusts ${isTotal?'total':'available'} ${b.dataset.mana} mana.`});closeModal();render();openMana(p,pool)})}
function openStatusExplanation(p){const rows=(p.statuses||[]).filter(Boolean);if(!rows.length)return;openModal(`${p.displayName} — STATUS`,`<div class="status-explain-list">${rows.map(s=>`<section><b>${esc(s)}</b><p>${esc(statusExplanation(s))}</p></section>`).join('')}</div>`,[{label:'CLOSE',onClick:closeModal}])}
function statusExplanation(s){const v=String(s).toLowerCase();if(v.includes('monarch'))return'This player is the monarch. Monarch-related draw and combat-transfer rules apply.';if(v.includes('initiative'))return'This player has the initiative. Initiative and Undercity rules apply.';if(v.includes('city'))return'This player has the city’s blessing for the rest of the game.';return'This player currently has this tracked game status. Card and rules effects tied to it remain active until the status changes.'}
function openCounters(p){const statuses=['Monarch','The Initiative','City’s Blessing'];openModal('PLAYER STATUS / COUNTERS',`<div class="counter-control"><b>LIFE</b><span>${p.life}</span><button data-life="1">+</button><button data-life="-1">−</button></div><div class="counter-control"><b>POISON</b><span>${p.poison||0}</span><button data-poison="1">+</button><button data-poison="-1">−</button></div>${statuses.map(s=>`<label class="check"><input type="checkbox" data-status="${esc(s)}" ${p.statuses.includes(s)?'checked':''}> ${esc(s)}</label>`).join('')}`,[{label:'DONE',onClick:closeModal}]);$$('[data-life]').forEach(b=>b.onclick=()=>{commitAction({type:'life',playerId:p.playerId,delta:+b.dataset.life,label:`${p.displayName} life ${b.dataset.life>0?'increases':'decreases'}.`});closeModal();render();openCounters(p)});$$('[data-poison]').forEach(b=>b.onclick=()=>{commitAction({type:'poison',playerId:p.playerId,delta:+b.dataset.poison,label:`${p.displayName} poison changes.`});closeModal();render();openCounters(p)});$$('[data-status]').forEach(b=>b.onchange=()=>{commitAction({type:'status',playerId:p.playerId,status:b.dataset.status,enabled:b.checked,label:`${p.displayName}: ${b.dataset.status} ${b.checked?'gained':'removed'}.`});render()})}
function legalAttackersFor(p){
  const defenders=game.players.filter(x=>x.playerId!==p.playerId&&!x.eliminated);
  return p.deck.battlefield.filter(c=>defenders.some(d=>validateAttack({game:{...game,phase:'declare-attackers'},attackerId:p.playerId,defenderId:d.playerId,instance:c,definition:defOf(game,c)}).legal))
}
function openAttack(p,draft=[]){
  if(!['combat','begin-combat','declare-attackers'].includes(game.phase))return toast('Attack is available during combat.',true);
  const legal=legalAttackersFor(p);if(!legal.length){return openModal('DECLARE ATTACKERS',`<div class="combat-handoff"><b>DECLARE ATTACKERS — CRITICAL STOP</b><p>${esc(p.displayName)} has no creatures that can legally attack right now. The attack step still requires acknowledgement before combat can continue.</p></div>`,[{label:'ACKNOWLEDGE — NO ATTACKS',className:'primary',onClick:()=>{const required=validateRequiredAttackers({game,player:p,draft:[]});if(!required.legal)return toast(required.reasons[0],true);p.confirmations.attackers=true;if(game.phaseGates?.combat)satisfyGate(game,'combat');game.combatState={attackers:[],defenders:[],blocks:{},damage:[],waitingFor:null,resolved:true};game.log.unshift({text:`${p.displayName} acknowledges the Declare Attackers step with no legal attackers.`,turn:game.turnNumber});closeModal();save();render();runSmartPhaseSkips()}},{label:'CANCEL',onClick:closeModal}])}
  const chosen=new Map(draft.map(x=>[x.instanceId,x]));
  const rows=legal.map(c=>{const d=defOf(game,c),pick=chosen.get(c.instanceId),defender=pick&&game.players.find(x=>x.playerId===pick.defenderId);return `<button class="search-result ${pick?'available':''}" data-attacker="${c.instanceId}"><img src="${imageOf(d)}"><span><b>${esc(d.name)}</b><small>${pick?`Attacking ${esc(defender?.displayName||'defender')}`:'Tap to add to attack'}</small></span></button>`}).join('');
  openModal('DECLARE ATTACKERS',`<p>Select every creature you want to attack with. Nothing is tapped or committed until Confirm Attack.</p><div class="card-search-results">${rows}</div>`,[
    {label:'NO ATTACKS',onClick:()=>{const required=validateRequiredAttackers({game,player:p,draft:[]});if(!required.legal)return toast(required.reasons[0],true);p.confirmations.attackers=true;if(game.phaseGates?.combat)satisfyGate(game,'combat');game.combatState={attackers:[],defenders:[],blocks:{},damage:[],waitingFor:null,resolved:true};game.log.unshift({text:'Attack skipped — player declared no attackers.',turn:game.turnNumber});closeModal();render();runSmartPhaseSkips()}},
    {label:`CONFIRM ATTACK${draft.length?` (${draft.length})`:''}`,className:'primary',disabled:!draft.length,onClick:()=>commitAttackSet(p,draft)},
    {label:'CANCEL',onClick:closeModal}
  ]);
  $$('[data-attacker]').forEach(b=>b.onclick=()=>{const id=b.dataset.attacker,existing=chosen.get(id);if(existing){openAttack(p,draft.filter(x=>x.instanceId!==id));return}chooseDefenderForDraft(p,instance(p,id),draft)})
}
function chooseDefenderForDraft(p,c,draft){
  const others=game.players.filter(x=>x.playerId!==p.playerId&&!x.eliminated).filter(x=>validateAttack({game:{...game,phase:'declare-attackers'},attackerId:p.playerId,defenderId:x.playerId,instance:c,definition:defOf(game,c)}).legal);
  const d=defOf(game,c);
  const attackerName=esc(d?.name||'Attacker');
  const attackerImage=imageOf(d);
  const stats=(d?.power!=null&&d?.toughness!=null)?`${esc(String(d.power))}/${esc(String(d.toughness))}`:'';
  openModal('CHOOSE ATTACK TARGET',`
    <div class="attack-target-picker">
      <div class="attack-target-attacker">
        <img src="${attackerImage}" alt="${attackerName}">
        <div class="attack-target-attacker-copy">
          <small>ATTACKING WITH</small>
          <strong>${attackerName}</strong>
          ${stats?`<span>${stats}</span>`:''}
        </div>
      </div>
      <div class="attack-target-list">
        ${others.map(o=>`
          <button class="attack-target-option" data-defender="${o.playerId}">
            <span class="attack-target-name">${esc(o.displayName)}</span>
            <span class="attack-target-life"><b>${o.life}</b><small>LIFE</small></span>
          </button>`).join('')}
      </div>
    </div>`,
    [{label:'BACK',onClick:()=>openAttack(p,draft)}]
  );
  $$('[data-defender]').forEach(b=>b.onclick=()=>openAttack(p,[...draft,{instanceId:c.instanceId,defenderId:b.dataset.defender}]))
}
function legalBlockersFor(defender,attack){
  const attacker=game.players.find(x=>x.playerId===attack.playerId),ac=instance(attacker,attack.instanceId),ad=defOf(game,ac);
  return defender.deck.battlefield.filter(x=>validateBlock({blocker:x,definition:defOf(game,x),attackerDefinition:ad}).legal);
}
function finalizeAttackSet(p,draft){
  const required=validateRequiredAttackers({game,player:p,draft});if(!required.legal){toast(required.reasons[0],true);return openAttack(p,draft)}
  const attacks=[];
  for(const x of draft){
    const c=instance(p,x.instanceId),d=defOf(game,c);
    if(!c||!d){toast('An intended attacker is no longer on the battlefield. Re-select attackers.',true);return openAttack(p,draft.filter(y=>y.instanceId!==x.instanceId))}
    const v=validateAttack({game:{...game,phase:'declare-attackers'},attackerId:p.playerId,defenderId:x.defenderId,instance:c,definition:d});
    if(!v.legal){toast(`${d.name} can no longer attack. Re-select attackers.`,true);return openAttack(p,draft.filter(y=>y.instanceId!==x.instanceId))}
    if(!cardHasKeyword(c,d,'Vigilance',game))commitAction({type:'tap-card',playerId:p.playerId,instanceId:c.instanceId,tapped:true,label:`${p.displayName} attacks ${game.players.find(q=>q.playerId===x.defenderId)?.displayName} with ${d?.name}.`});
    else game.log.unshift({text:`${p.displayName} attacks ${game.players.find(q=>q.playerId===x.defenderId)?.displayName} with ${d?.name}.`,turn:game.turnNumber});
    attacks.push({playerId:p.playerId,instanceId:c.instanceId,defenderId:x.defenderId,blocksConfirmed:false});
  }
  const defenders=[...new Set(attacks.map(x=>x.defenderId))];p.confirmations.attackers=true;if(game.phaseGates?.combat)satisfyGate(game,'combat');game.combatState={attackers:attacks,defenders,blocks:{},damage:[],waitingFor:defenders[0]||null,resolved:false};game.phase='declare-attackers';for(const a of attacks)queueTriggers(game,{type:'attacks',sourceId:a.instanceId,controllerId:p.playerId,defenderId:a.defenderId});queueTriggers(game,{type:'attackers-declared',controllerId:p.playerId,attackers:attacks.map(a=>a.instanceId),defenders});if(network?.client){network.client.send({type:'combat-attack',combatState:structuredClone(game.combatState),attackerId:p.playerId,stateStamp:networkStateStamp({...game,combatState:null})});closeModal();render();return}closeModal();processPendingTriggers(()=>beginCombatPriority('Attackers have been declared. Players may respond before blockers are declared.','after-attackers',()=>{game.phase='declare-blockers';beginNextDefense(p)}))
}
function commitAttackSet(p,draft){
  if(!draft.length)return openAttack(p,[]);
  const required=validateRequiredAttackers({game,player:p,draft});if(!required.legal)return toast(required.reasons[0],true);
  closeModal();
  processPendingTriggers(()=>beginCombatPriority('Beginning of combat. Responses may be made before the intended attackers are actually declared.','begin-combat',()=>finalizeAttackSet(p,draft)));
}
function beginNextDefense(attackingPlayer){
  const cs=game.combatState,defenderId=cs.defenders.find(id=>!cs.blocks?.[id]?.confirmed);if(!defenderId)return processPendingTriggers(()=>beginCombatPriority('Blockers have been declared. Players may respond before combat damage.','after-blockers',()=>resolveCombatSet(attackingPlayer)));
  const defender=game.players.find(x=>x.playerId===defenderId),incoming=cs.attackers.filter(a=>a.defenderId===defenderId);
  const anyBlockers=incoming.some(a=>legalBlockersFor(defender,a).length);
  if(!anyBlockers){cs.blocks[defenderId]={confirmed:true,assignments:[]};defender.confirmations.blocks=true;game.log.unshift({text:`Block step skipped for ${defender.displayName} — no available blockers.`,turn:game.turnNumber});return beginNextDefense(attackingPlayer)}
  if(network?.localPlayerId&&network.localPlayerId!==defenderId){cs.waitingFor=defenderId;render();return toast(`Waiting for ${defender.displayName} to block or pass.`)}
  openDefenseAssignments(attackingPlayer,defender,[])
}
function openDefenseAssignments(attackingPlayer,defender,assignments){
  const incoming=game.combatState.attackers.filter(a=>a.defenderId===defender.playerId),usedCounts=new Map();for(const x of assignments)usedCounts.set(x.blockerId,(usedCounts.get(x.blockerId)||0)+1);
  const html=incoming.map(a=>{const ac=instance(attackingPlayer,a.instanceId),ad=defOf(game,ac),assigned=assignments.filter(x=>x.attackerId===a.instanceId);const blockers=legalBlockersFor(defender,a).filter(b=>(usedCounts.get(b.instanceId)||0)<blockerCapacity(defOf(game,b)));return `<section class="zone-row"><h3>${esc(ad?.name||'Attacker')}</h3><p>${assigned.length?`Blocked by ${assigned.map(x=>esc(defOf(game,instance(defender,x.blockerId))?.name||'creature')).join(', ')}`:'Unblocked'}</p><div class="ability-choice-list">${blockers.map(b=>`<button class="ability-choice available" data-assign-blocker="${b.instanceId}" data-assign-attacker="${a.instanceId}"><strong>${esc(defOf(game,b)?.name||'Blocker')}</strong><span>Block this attacker</span></button>`).join('')}</div></section>`}).join('');
  openModal(`DEFEND — ${defender.displayName}`,`<div class="combat-handoff"><b>${esc(defender.displayName)}, assign your blockers.</b><p>You may assign multiple legal blockers to an attacker. Each blocker can normally block only one attacker.</p></div>${html}`,[
    {label:'PASS / NO MORE BLOCKS',className:'primary',onClick:()=>confirmDefense(attackingPlayer,defender,assignments)},
    {label:'CLEAR BLOCKS',onClick:()=>openDefenseAssignments(attackingPlayer,defender,[])}
  ]);
  $$('[data-assign-blocker]').forEach(b=>b.onclick=()=>openDefenseAssignments(attackingPlayer,defender,[...assignments,{attackerId:b.dataset.assignAttacker,blockerId:b.dataset.assignBlocker}]))
}
function confirmDefense(attackingPlayer,defender,assignments){game.phase='declare-blockers';const legality=validateBlockAssignments({game,defender,assignments});if(!legality.legal)return toast(legality.reasons[0]||'Those blocker assignments are illegal.',true);if(network?.client){network.client.send({type:'combat-defense',defenderId:defender.playerId,assignments:structuredClone(assignments),stateStamp:networkStateStamp(game)});closeModal();toast('Blocks submitted. Waiting for combat to resolve.');return}game.combatState.blocks[defender.playerId]={confirmed:true,assignments};defender.confirmations.blocks=true;for(const a of game.combatState.attackers.filter(x=>x.defenderId===defender.playerId))a.blocksConfirmed=true;for(const x of assignments){const blocker=instance(defender,x.blockerId),attacker=game.combatState.attackers.find(a=>a.instanceId===x.attackerId);if(blocker&&attacker)queueTriggers(game,{type:'blocks',blockerId:blocker.instanceId,attackerId:attacker.instanceId,sourceId:blocker.instanceId,controllerId:defender.playerId})}game.log.unshift({text:assignments.length?`${defender.displayName} confirms ${assignments.length} blocker assignment${assignments.length===1?'':'s'}.`:`${defender.displayName} passes with no blocks.`,turn:game.turnNumber});closeModal();beginNextDefense(attackingPlayer)}
function resolveCombatSet(p){
  try{
    game.phase='combat-damage';
    const beforePlayers=new Map(game.players.map(q=>[q.playerId,{life:Number(q.life||0),poison:Number(q.poison||0),battlefield:new Map((q.deck?.battlefield||[]).map(c=>[c.instanceId,defOf(game,c)?.name||'Card']))}]));
    const result=resolveCombat(game,{attackerPlayerId:p.playerId,onEvent:e=>queueTriggers(game,e)});
    for(const text of result.events)game.log.unshift({text,turn:game.turnNumber});
    for(const q of game.players){const b=beforePlayers.get(q.playerId);if(!b)continue;if(Number(q.life||0)<b.life)game.log.unshift({text:`${q.displayName} lost ${b.life-Number(q.life||0)} life from combat (${b.life} → ${q.life}).`,turn:game.turnNumber,type:'player-notification',kind:'combat-life-loss',affectedPlayerIds:[q.playerId],attention:true});if(Number(q.poison||0)>b.poison)game.log.unshift({text:`${q.displayName} gained ${Number(q.poison||0)-b.poison} poison counter${Number(q.poison||0)-b.poison===1?'':'s'} from combat.`,turn:game.turnNumber,type:'player-notification',kind:'combat-poison',affectedPlayerIds:[q.playerId],attention:true});const after=new Set((q.deck?.battlefield||[]).map(c=>c.instanceId));for(const [id,name] of b.battlefield)if(!after.has(id))game.log.unshift({text:`${name} left ${q.displayName}'s battlefield during combat.`,turn:game.turnNumber,type:'player-notification',kind:'combat-permanent-left',affectedPlayerIds:[q.playerId],attention:true})}

    game.log.unshift({text:'Combat damage resolved.',turn:game.turnNumber});
    save();processPendingTriggers(()=>beginCombatPriority('Combat damage has been dealt. Players may respond before the end of combat step.','after-combat-damage',()=>{game.phase='end-combat';queueTriggers(game,{type:'end-combat',playerId:game.activePlayerId,controllerId:game.activePlayerId});processPendingTriggers(()=>beginCombatPriority('End of combat. Players may respond before combat ends.','end-combat',()=>render()))}));
  }catch(e){toast(e?.message||'Combat could not be resolved.',true);render()}
}
function activatedAbilityLines(d){return ruleActivatedAbilityLines(d).slice(0,12)}
function targetCandidates(effect,p){
  const text=String(effect||'');const out=[];
  if(/target (?:player|opponent)/i.test(text))for(const q of game.players)if(!/opponent/i.test(text)||q.playerId!==p.playerId)out.push({kind:'player',id:q.playerId,label:q.displayName,sub:`Player — life ${q.life}`});
  if(/target (?:creature|permanent|artifact|enchantment|planeswalker|land)/i.test(text)){
    const wantsCreature=/target creature/i.test(text),wantsArtifact=/target artifact/i.test(text),wantsEnchantment=/target enchantment/i.test(text),wantsPlaneswalker=/target planeswalker/i.test(text),wantsLand=/target land/i.test(text);
    const targetPlayers=/you control/i.test(text)?[p]:game.players;for(const q of targetPlayers)for(const c of q.deck.battlefield){const d=defOf(game,c),t=d?.typeLine||'';if(wantsCreature&&!/Creature/i.test(t))continue;if(wantsArtifact&&!/Artifact/i.test(t))continue;if(wantsEnchantment&&!/Enchantment/i.test(t))continue;if(wantsPlaneswalker&&!/Planeswalker/i.test(t))continue;if(wantsLand&&!/Land/i.test(t))continue;if(/with a counter on it/i.test(text)&&!Object.values(c.counters||{}).some(v=>Number(v)>0))continue;out.push({kind:'card',id:c.instanceId,label:d?.name||'Permanent',sub:`${q.displayName} — ${t}`})}
  }
  if(/target card in (?:a|your) graveyard/i.test(text))for(const q of game.players)for(const c of q.deck.graveyard){const d=defOf(game,c);out.push({kind:'card',id:c.instanceId,label:d?.name||'Card',sub:`${q.displayName} graveyard`})}
  return out;
}
function modeRequirement(ability){const m=ability.modeCount;if(m==='one')return{min:1,max:1};if(m==='two')return{min:2,max:2};if(m==='three')return{min:3,max:3};if(m==='one or more')return{min:1,max:ability.modes.length};return{min:0,max:0}}
function legalManaOptionsForAbility(p,ability,source=null){let options=[...(ability.manaOptions||[])];if(/chosen color/i.test(ability.effect||'')&&source?.chosenColor)options.push(source.chosenColor);if(/commander(?:’|'|)s color identity/i.test(ability.effect||'')){const allowed=new Set();for(const cmd of p.commanders||[]){const d=def(cmd.cardId);for(const c of d?.colorIdentity||[])allowed.add(c)}options=options.filter(c=>allowed.has(c))}return [...new Set(options)]}
function librarySearchSpec(effect=''){
  const text=String(effect||'').replace(/\s+/g,' ').trim();
  if(!/search your library/i.test(text))return null;
  let destination='hand';
  if(/put (?:that|it|the card|those cards).*onto the battlefield/i.test(text))destination='battlefield';
  else if(/put (?:that|it|the card|those cards).*on top of your library/i.test(text))destination='library';
  const entersTapped=destination==='battlefield'&&/onto the battlefield tapped/i.test(text);
  let filter=()=>true,label='card';
  const tests=[
    [/basic land card/i,d=>/Basic Land/i.test(d?.typeLine||''),'basic land card'],
    [/land card/i,d=>/Land/i.test(d?.typeLine||''),'land card'],
    [/creature card/i,d=>/Creature/i.test(d?.typeLine||''),'creature card'],
    [/artifact card/i,d=>/Artifact/i.test(d?.typeLine||''),'artifact card'],
    [/enchantment card/i,d=>/Enchantment/i.test(d?.typeLine||''),'enchantment card'],
    [/instant card/i,d=>/Instant/i.test(d?.typeLine||''),'instant card'],
    [/sorcery card/i,d=>/Sorcery/i.test(d?.typeLine||''),'sorcery card']
  ];
  for(const [re,fn,name] of tests)if(re.test(text)){filter=fn;label=name;break}
  const untapMatch=text.match(/if you control (\d+|one|two|three|four|five) or more lands?, untap (?:that|it|the) land/i);const words={one:1,two:2,three:3,four:4,five:5};const untapIfLandsAtLeast=untapMatch?(Number(untapMatch[1])||words[untapMatch[1].toLowerCase()]||0):0;return {text,destination,entersTapped,filter,label,optional:/search your library for up to/i.test(text),shuffle:/then shuffle/i.test(text),untapIfLandsAtLeast};
}
async function openAbilityLibrarySearch(p,c,d,ability,choices,commitAbility){
  const spec=librarySearchSpec(choices.modes.length?choices.modes.join('\n'):ability.effect);if(!spec)return commitAbility();
  const pool=await pickerPool({mode:game.mode,source:trackedDeckSource(p.deck,{zones:['library']})});
  const rows=pool.map(card=>({card,definition:defOf(game,card)})).filter(x=>spec.filter(x.definition));
  const renderRows=q=>rows.filter(x=>!q||`${x.definition?.name||''} ${x.definition?.typeLine||''}`.toLowerCase().includes(q));
  openModal(`SEARCH LIBRARY — ${d.name}`,`<div class="ability-search-summary"><b>SEARCH FOR:</b> ${esc(spec.label.toUpperCase())}<br><small>${esc(spec.text)}</small></div><div class="card-search-row draw-search-row"><input id="abilityLibrarySearch" placeholder="Search tracked library" autocomplete="off" inputmode="search"></div><div id="abilityLibraryResults" class="card-search-results"></div>`,[{label:'CANCEL',onClick:closeModal},...(spec.optional?[{label:'FIND NOTHING',onClick:()=>commitAbility(null,spec)}]:[])]);
  const draw=()=>{const q=($('#abilityLibrarySearch')?.value||'').trim().toLowerCase(),shown=renderRows(q);$('#abilityLibraryResults').innerHTML=shown.map(({card,definition})=>`<button class="search-result" data-ability-library="${esc(card.instanceId)}"><img src="${esc(imageOf(definition))}"><span><b>${esc(definition?.name||'Unresolved')}</b><small>${esc(definition?.typeLine||'')}</small></span></button>`).join('')||'<p class="muted">No legal cards match this search.</p>';$$('[data-ability-library]').forEach(b=>b.onclick=()=>commitAbility(instance(p,b.dataset.abilityLibrary),spec))};
  $('#abilityLibrarySearch').oninput=draw;draw();
}
function beginAbilityActivation(p,c,d,ability){
  const legality=validateActivatedAbilityFull({game,player:p,instance:c,definition:d,ability,definitions:definitionsMap()});if(!legality.legal)return toast(legality.reasons[0],true);
  const choices={modes:[],target:null,x:null,manaColor:null,costMoveIds:[]};
  const selectedEffect=()=>choices.modes.length?choices.modes.join('\n'):ability.effect;
  const afterModes=()=>{
    if(ability.hasX){openModal(`CHOOSE X — ${d.name}`,renderCardDetail(game,c)+`<div class="ability-source"><h3>ABILITY</h3><p class="oracle">${esc(ability.text)}</p></div><label>X VALUE<input id="abilityX" type="number" min="0" step="1" value="0"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{choices.x=Math.max(0,Math.floor(+$('#abilityX').value||0));afterX()}}]);return}afterX();
  };
  const afterX=()=>afterTarget();
  const afterTarget=()=>{
    if(ability.sacrificeRequirement&&!ability.sacrificesSelf){const type=ability.sacrificeRequirement;const candidates=p.deck.battlefield.filter(x=>x.instanceId!==c.instanceId&&new RegExp(type,'i').test(defOf(game,x)?.typeLine||''));if(!candidates.length)return toast(`No ${type.toLowerCase()} is available to sacrifice for this cost.`,true);openModal(`PAY COST — SACRIFICE ${type.toUpperCase()}`,renderCardDetail(game,c)+`<div class="ability-source"><h3>ABILITY</h3><p class="oracle">${esc(ability.text)}</p></div><p>Choose the card to sacrifice as part of this activation cost.</p><div class="card-search-results">${candidates.map((x,i)=>{const dx=defOf(game,x);return `<button class="search-result" data-ability-sac="${i}"><img src="${imageOf(dx)}"><span><b>${esc(dx?.name)}</b><small>${esc(dx?.typeLine||'')}</small></span></button>`}).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);$$('[data-ability-sac]').forEach(b=>b.onclick=()=>{choices.costMoveIds.push(candidates[+b.dataset.abilitySac].instanceId);afterSacrifice()});return}afterSacrifice();
  };
  const afterSacrifice=()=>{
    if(ability.discardCount){const candidates=p.deck.hand.filter(x=>x.instanceId!==c.instanceId);if(!candidates.length)return toast('No card is available to discard for this activation cost.',true);openModal(`PAY COST — DISCARD`,renderCardDetail(game,c)+`<div class="ability-source"><h3>ABILITY</h3><p class="oracle">${esc(ability.text)}</p></div><p>Choose the card to discard as part of this activation cost.</p><div class="card-search-results">${candidates.map((x,i)=>{const dx=defOf(game,x);return `<button class="search-result" data-ability-discard="${i}"><img src="${imageOf(dx)}"><span><b>${esc(dx?.name)}</b><small>Hand</small></span></button>`}).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);$$('[data-ability-discard]').forEach(b=>b.onclick=()=>{choices.costMoveIds.push(candidates[+b.dataset.abilityDiscard].instanceId);afterDiscard()});return}afterDiscard();
  };
  const afterDiscard=()=>{
    if(ability.manaAbility){const options=legalManaOptionsForAbility(p,ability,c);if(!options.length)return toast('No legal mana color is available for this ability.',true);if(options.length>1){openModal(`MANA FROM ${d.name}`,renderCardDetail(game,c)+`<div class="ability-source"><h3>ABILITY</h3><p class="oracle">${esc(ability.text)}</p></div><div class="mana-choice-grid">${options.map(color=>`<button class="available" data-ability-mana="${color}">${manaIcon(color,1)}</button>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);$$('[data-ability-mana]').forEach(b=>b.onclick=()=>{choices.manaColor=b.dataset.abilityMana;openAbilityLibrarySearch(p,c,d,ability,choices,commitAbility)});return}choices.manaColor=options[0]}openAbilityLibrarySearch(p,c,d,ability,choices,commitAbility);
  };
  const commitAbility=(searchedCard=null,searchSpec=null)=>{
    const live=instance(p,c.instanceId),legality=validateActivatedAbilityFull({game,player:p,instance:live,definition:d,ability,definitions:definitionsMap()});if(!legality.legal){closeModal();render();return toast(legality.reasons.join(' • ')||'This ability is no longer legal.',true)}
    const choiceBits=[];if(choices.modes.length)choiceBits.push(`mode: ${choices.modes.join(' / ')}`);if(choices.x!==null)choiceBits.push(`X=${choices.x}`);if(choices.manaColor)choiceBits.push(`mana: ${choices.manaColor}`);
    const xCost=/\{X\}/i.test(ability.cost)?Number(choices.x||0):0,payment=planMana(p.mana.available,ability.cost,xCost);if(!payment.ok)return toast(payment.reason||'The activation cost cannot be paid.',true);if(ability.lifeCost&&p.life<ability.lifeCost)return toast('You do not have enough life to pay this activation cost.',true);
    const effectText=selectedEffect(),base={playerId:p.playerId,instanceId:c.instanceId,requiresTap:ability.requiresTap,requiresUntap:ability.requiresUntap,sacrificeSelf:ability.sacrificesSelf,costMoveIds:choices.costMoveIds,payment:payment.chosen,lifeCost:ability.lifeCost,label:`${p.displayName} activates ${d.name}: ${ability.text}${searchedCard?` [searched: ${defOf(game,searchedCard)?.name||'card'}]`:''}${choiceBits.length?` [${choiceBits.join('; ')}]`:''}`};
    if(ability.manaAbility){commitAction({...base,type:'activate-ability',manaColor:choices.manaColor,manaAmount:1});closeModal();processPendingTriggers(()=>render());return}
    if(searchSpec||/search your library/i.test(effectText)){commitAction({...base,type:'activate-ability-stack',searchResult:{instanceId:searchedCard?.instanceId||null,to:searchSpec?.destination||'hand',position:searchSpec?.destination==='library'?'top':undefined,entersTapped:!!searchSpec?.entersTapped,shuffle:!!searchSpec?.shuffle,untapIfLandsAtLeast:Number(searchSpec?.untapIfLandsAtLeast||0)}});closeModal();onStackObjectAdded(p,`${d.name} ability`);return}
    const compiled=compileEffectText(effectText,{sourceName:d.name});if(!compiled.supported){commitAction({...base,type:'activate-ability-stack',effects:[],effectBindings:{sourceId:c.instanceId},guidedResolution:{title:`${d.name} — ABILITY NEEDS GUIDED RESOLUTION`,oracleText:effectText,unsupported:compiled.unsupported||[effectText]}});closeModal();onStackObjectAdded(p,`${d.name} ability (guided)`);return}
    const seed={sourceId:c.instanceId};if(choices.x!==null)seed.X=choices.x;if(choices.manaColor)seed.manaColor=choices.manaColor;
    collectCompiledBindings(p,d,compiled,bindings=>{commitAction({...base,type:'activate-ability-stack',effects:compiled.effects,effectBindings:{...bindings,...seed}});closeModal();onStackObjectAdded(p,`${d.name} ability`)},0,seed);
  };
  if(ability.modes.length){const req=modeRequirement(ability),need=req.max||1;const selects=Array.from({length:need},(_,n)=>`<label>CHOICE ${n+1}<select data-ability-mode-select>${ability.modes.map((m,i)=>`<option value="${i}">${esc(m)}</option>`).join('')}</select></label>`).join('');openModal(`CHOOSE MODE — ${d.name}`,`<div class="ability-source"><h3>ABILITY</h3><p class="oracle">${esc(ability.text)}</p></div><div class="compact-choice-grid">${selects}</div>`,[{label:'CANCEL',onClick:closeModal},{label:'CONTINUE',className:'primary',onClick:()=>{const picked=$$('[data-ability-mode-select]').map(x=>Number(x.value));if(new Set(picked).size!==picked.length)return toast('Choose different modes.',true);if(picked.length<req.min||picked.length>req.max)return toast(`Choose ${req.min===req.max?req.min:`${req.min}–${req.max}`} modes.`,true);choices.modes=picked.map(i=>ability.modes[i]);afterModes()}}]);return}
  afterModes();
}
function openCardAbility(id){
  const p=activePlayer(),c=instance(p,id),d=defOf(game,c);if(!c||!d)return;
  const rows=availableActivatedAbilities({game,instance:c,definition:d}).map(row=>{const full=validateActivatedAbilityFull({game,player:p,instance:c,definition:d,ability:row.ability,definitions:definitionsMap()});return {...row,legal:full.legal,reasons:full.reasons}});if(!rows.length)return toast('No tracked activated ability is available for this card.',true);
  openModal(`ACTIVATE — ${d.name}`,renderCardDetail(game,c)+`<h3>AVAILABLE ACTIVATED ABILITIES</h3><div class="ability-choice-list">${rows.map((row,i)=>`<button class="ability-choice ${row.legal?'available':'unplayable'}" data-ability-line="${i}" ${row.legal?'':'disabled'}><strong class="ability-cost-icons">${manaReqIcons(parseManaCost(row.ability.cost))}${row.ability.requiresTap?'<span class="tap-cost">↷ TAP</span>':''}${row.ability.lifeCost?`<span class="life-cost">${row.ability.lifeCost} LIFE</span>`:''}</strong><span>${esc(row.ability.effect)}</span>${row.legal?'':`<small>${esc(row.reasons.join(' • '))}</small>`}</button>`).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);
  $$('[data-ability-line]').forEach(b=>b.onclick=()=>beginAbilityActivation(p,c,d,rows[+b.dataset.abilityLine].ability));
}
function openAbility(p){
  const cards=p.deck.battlefield.filter(c=>{const d=defOf(game,c);if(/Basic Land/i.test(d?.typeLine||''))return false;return parseActivatedAbilities(d).some(ability=>validateActivatedAbilityFull({game,player:p,instance:c,definition:d,ability,definitions:definitionsMap()}).legal)});
  if(!cards.length)return toast('No non-basic permanents with activated abilities are available.',true);
  openModal('ACTIVATE ABILITY',`<p>Select the source card. Each distinct Oracle activated ability is presented separately, with its own costs and choices.</p><div class="card-search-results">${cards.map(c=>{const d=defOf(game,c),n=parseActivatedAbilities(d).length;return `<button class="search-result" data-ability-card="${c.instanceId}"><img src="${imageOf(d)}"><span><b>${esc(d?.name)}</b><small>${n} activated ${n===1?'ability':'abilities'}</small></span></button>`}).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);
  $$('[data-ability-card]').forEach(b=>b.onclick=()=>openCardAbility(b.dataset.abilityCard));
}
function openSpecial(p){openModal('SPECIAL ACTION',`<p>Record a public state change that is permitted by a card or rule.</p><div class="counter-grid"><button data-special="status">PLAYER STATUS</button><button data-special="move">MOVE CARD</button><button data-special="mana">MANA</button><button data-special="counter">COUNTER</button></div>`,[{label:'CLOSE',onClick:closeModal}]);$$('[data-special]').forEach(b=>b.onclick=()=>{if(b.dataset.special==='status')openCounters(p);if(b.dataset.special==='mana')openMana(p);if(b.dataset.special==='move')openSelectMove(p);if(b.dataset.special==='counter')openSelectCounter(p)})}
function openSelectMove(p){const cards=['battlefield','graveyard','exile','hand'].flatMap(z=>p.deck[z]||[]);openModal('MOVE CARD',cards.map(c=>{const d=defOf(game,c);return `<button class="search-result" data-move-select="${c.instanceId}"><img src="${imageOf(d)}"><span>${esc(d?.name)}</span><small>${esc(c.zone)}</small></button>`}).join(''),[{label:'CANCEL',onClick:closeModal}]);$$('[data-move-select]').forEach(b=>b.onclick=()=>openMoveCard(p,instance(p,b.dataset.moveSelect)))}
function openSelectCounter(p){const cards=p.deck.battlefield;openModal('CARD COUNTERS',cards.map(c=>{const d=defOf(game,c);return `<button class="search-result" data-counter-select="${c.instanceId}"><img src="${imageOf(d)}"><span>${esc(d?.name)}</span></button>`}).join(''),[{label:'CANCEL',onClick:closeModal}]);$$('[data-counter-select]').forEach(b=>b.onclick=()=>openCardCounters(p,instance(p,b.dataset.counterSelect)))}

async function openAddCard(p){if(game.mode==='fully-tracked'){const cards=await pickerPool({mode:game.mode,source:trackedDeckSource(p.deck,{zones:['hand']})});openModal('ADD TRACKED CARD',`<p>Full Play Tracking restricts this picker to cards already in the authoritative tracked hand.</p><div class="card-search-results">${cards.map(c=>{const d=defOf(game,c);return `<button class="search-result" data-add-tracked="${c.instanceId}"><img src="${imageOf(d)}"><span>${esc(d?.name)}</span></button>`}).join('')}</div>`,[{label:'CANCEL',onClick:closeModal}]);$$('[data-add-tracked]').forEach(b=>b.onclick=()=>openHandCard(b.dataset.addTracked));return}openGlobalPicker({title:'ADD CARD',onSelect:d=>addFreeplayCard(p,d)})}
function addFreeplayCard(p,d){game.cardDefinitions[d.definitionId]=d;game.abilityCoverage=auditDefinitions(game.cardDefinitions);const c={instanceId:`${p.playerId}:${d.definitionId}:${crypto.randomUUID()}`,definitionId:d.definitionId,ownerId:p.playerId,controllerId:p.playerId,zone:'battlefield',tapped:false,counters:{},attachments:[],temporaryEffects:[]};p.deck.battlefield.push(c);sync(p.deck);game.log.unshift({text:`${p.displayName} adds ${d.name} to the battlefield.`});closeModal();render()}

function openGlobalPicker({title='CARD ID',onSelect=null}={}){
  let basicOnly=false,timer=null,lastQuery='',lastCategory='all';
  const categoryFilter=d=>{const t=d?.typeLine||'';if(lastCategory==='all')return true;if(lastCategory==='other')return !/(Creature|Artifact|Enchantment|Instant|Sorcery|Land|Planeswalker)/i.test(t);return new RegExp(lastCategory,'i').test(t)};
  const shell=()=>`<div class="card-search-row"><input id="cardSearchInput" placeholder="Type a card name" value="${esc(lastQuery)}"><button id="cardSearchGo">SEARCH</button></div><div class="setup-tools"><label class="compact-filter">CATEGORY<select id="cardCategory"><option value="all">All cards</option><option value="Creature">Creatures</option><option value="Artifact">Artifacts</option><option value="Enchantment">Enchantments</option><option value="Instant">Instants</option><option value="Sorcery">Sorceries</option><option value="Land">Lands</option><option value="Planeswalker">Planeswalkers</option><option value="other">Other</option></select></label><button id="scannerBtn">CAMERA / SCANNER</button><button id="basicLandsBtn" aria-pressed="${basicOnly}">BASIC LANDS: ${basicOnly?'ON':'OFF'}</button></div><p class="muted">Name matching is automatic. Exact names and closest matches sort first; matching printings remain available. Category filters narrow those results without changing the authorized source.</p><div id="cardSearchResults" class="card-search-results"></div>`;
  openModal(title,shell(),[{label:'CLOSE',onClick:closeModal}]);
  const go=async()=>{
    const q=$('#cardSearchInput').value.trim();lastQuery=q;lastCategory=$('#cardCategory').value;if(!q&&!basicOnly){$('#cardSearchResults').innerHTML='<p>Type a card name, or turn on Basic Lands.</p>';return}
    $('#cardSearchResults').innerHTML='<p>Searching…</p>';
    try{
      const rows=(await pickerPool({mode:'freeplay',source:globalCardSource(searchCards),query:q,basicLandsOnly:basicOnly,searchOptions:{allPrintings:true}})).filter(categoryFilter);
      $('#cardSearchResults').innerHTML=rows.map((d,i)=>`<button class="search-result" data-result="${i}"><img src="${imageOf(d)}"><span><b>${esc(d.name)}</b><br><small>${esc(d.typeLine)} • ${esc(d.set?.toUpperCase())} ${esc(d.collectorNumber)}</small></span><span>${esc(d.manaCost)}</span></button>`).join('')||'<p>No cards found.</p>';
      $$('[data-result]').forEach(b=>b.onclick=()=>{const d=rows[+b.dataset.result];const actions=[{label:'BACK',onClick:()=>openGlobalPicker({title,onSelect})}];if(onSelect)actions.push({label:'CONFIRM CARD',className:'primary',onClick:()=>onSelect(d)});else actions.push({label:'CLOSE',onClick:closeModal});openModal(d.name,`<div class="card-detail"><img src="${imageOf(d)}"><div><p>${esc(d.manaCost)}</p><p><b>${esc(d.typeLine)}</b></p><p class="oracle">${esc(d.oracleText)}</p><p>${esc(d.set?.toUpperCase())} ${esc(d.collectorNumber)}</p></div></div>`,actions)})
    }catch(e){$('#cardSearchResults').innerHTML=`<p class="bad">${esc(e.message)}</p>`}
  };
  $('#cardCategory').value=lastCategory;$('#cardCategory').onchange=go;$('#cardSearchGo').onclick=go;const searchInput=$('#cardSearchInput');searchInput.onpointerdown=e=>{e.stopPropagation()};searchInput.onclick=e=>{e.stopPropagation();searchInput.focus({preventScroll:true})};searchInput.oninput=()=>{clearTimeout(timer);timer=setTimeout(go,260)};searchInput.onkeydown=e=>e.key==='Enter'&&go();$('#basicLandsBtn').onclick=()=>{basicOnly=!basicOnly;const b=$('#basicLandsBtn');b.textContent=`BASIC LANDS: ${basicOnly?'ON':'OFF'}`;b.setAttribute('aria-pressed',String(basicOnly));go()};$('#scannerBtn').onclick=()=>openScanner({onSelect});
}
let scannerStream=null,scannerTimer=null,scannerBusy=false,scannerDetected=null;
function stopScanner(){scannerStream?.getTracks().forEach(t=>t.stop());scannerStream=null;if(scannerTimer)clearInterval(scannerTimer);scannerTimer=null;scannerBusy=false}
async function scannerOcrCandidate(){
  const video=$('#scanVideo'),canvas=$('#scanCanvas');if(!video||!canvas||!video.videoWidth||scannerBusy)return null;scannerBusy=true;
  try{
    const w=video.videoWidth,h=video.videoHeight;canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(video,0,0,w,h);
    const title=document.createElement('canvas');title.width=w;title.height=Math.max(80,Math.round(h*.23));title.getContext('2d').drawImage(canvas,0,0,w,title.height,0,0,w,title.height);
    const status=$('#scanStatus');if(status)status.textContent='Reading card title…';
    let text='';
    if('TextDetector'in window){const rows=await new TextDetector().detect(title);text=rows.map(x=>x.rawValue).join('\n')}
    else {const T=await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');const result=await T.recognize(title,'eng');text=result?.data?.text||''}
    const candidate=text.split(/\n/).map(x=>x.replace(/[^\p{L}\p{N}'’,.\-—:! ?]/gu,' ').replace(/\s+/g,' ').trim()).filter(x=>x.length>=2).sort((a,b)=>b.length-a.length)[0]||'';
    if(!candidate)throw new Error('Card title was not readable yet.');
    const d=await resolveNamedCard(candidate);scannerDetected=d;const input=$('#scanName');if(input)input.value=d.name;const st=$('#scanStatus');if(st)st.innerHTML=`<span class="good">Detected ${esc(d.name)}. Confirm the card below.</span>`;if(scannerTimer){clearInterval(scannerTimer);scannerTimer=null}return d;
  }catch(e){const st=$('#scanStatus');if(st)st.textContent=e.message||'Card title was not readable yet.';return null}finally{scannerBusy=false}
}
async function openScanner({onSelect=null}={}){
  scannerDetected=null;
  openModal('CARD SCANNER',`<p>Center the whole card in the guide. Auto Detect reads the title area when supported; Scan Now retries immediately. You can always type the name, or enter set + collector number for an exact printing.</p><div class="scan-frame"><video id="scanVideo" autoplay playsinline></video><span class="scan-guide" aria-hidden="true"></span></div><canvas id="scanCanvas" hidden></canvas><label class="check"><input id="scanAuto" type="checkbox" checked> Auto Detect when the title is readable</label><label>Card name<input id="scanName" placeholder="Card name"></label><div class="setup-line"><label>Set code<input id="scanSet" placeholder="e.g. SPM"></label><label>Collector #<input id="scanCollector" placeholder="e.g. 42"></label></div><div id="scanStatus">Starting camera…</div>`,[
    {label:'CANCEL',onClick:()=>{stopScanner();closeModal()}},
    {label:'SCAN NOW',onClick:()=>scannerOcrCandidate()},
    {label:'CONFIRM CARD',className:'primary',onClick:async()=>{const name=$('#scanName').value.trim(),set=$('#scanSet').value.trim(),collector=$('#scanCollector').value.trim();try{const d=set&&collector?await resolvePrinting(set,collector):(scannerDetected&&(!name||name.toLowerCase()===scannerDetected.name.toLowerCase())?scannerDetected:await resolveNamedCard(name));stopScanner();if(onSelect)return onSelect(d);openModal(d.name,`<div class="card-detail"><img src="${imageOf(d)}"><div><p>${esc(d.typeLine)}</p><p>${esc(d.oracleText)}</p><p>${esc(d.set?.toUpperCase())} ${esc(d.collectorNumber)}</p></div></div>`,[{label:'CLOSE',onClick:closeModal}])}catch(e){$('#scanStatus').textContent=e.message}}}
  ]);
  try{
    scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});const video=$('#scanVideo');video.srcObject=scannerStream;video.onloadedmetadata=()=>{const st=$('#scanStatus');if(st)st.textContent='Camera ready. Hold the card steady inside the guide.';setTimeout(()=>$('#scanAuto')?.checked&&scannerOcrCandidate(),1200);scannerTimer=setInterval(()=>$('#scanAuto')?.checked&&scannerOcrCandidate(),6500)};
  }catch(e){$('#scanStatus').textContent='Camera unavailable. Name and exact-printing lookup remain available.'}
}
function logViewerId(){return network?.localPlayerId||game?.activePlayerId||game?.players?.[0]?.playerId||null}
function logEventHtml(e){const viewer=logViewerId(),hit=!!viewer&&Array.isArray(e.affectedPlayerIds)&&e.affectedPlayerIds.includes(viewer);return `<div class="log-event${hit?' player-attention':''}"><b>Turn ${e.turn||game.turnNumber}</b> • ${esc(e.text)}</div>`}
function openGameLog(){openModal('GAME LOG',`<div class="log-list">${game.log.map(logEventHtml).join('')||'<p>No game activity yet.</p>'}</div>`,[{label:'UNDO',onClick:()=>confirmUndoLastStep()},{label:'CLOSE',onClick:closeModal}])}
function openBoard(){const p=activePlayer();openModal('BOARD',`<div class="board-menu"><button id="boardZones">BOARD & ZONES</button><button id="boardStats">GAME STATS</button><button id="boardLog">GAME LOG</button></div><div id="boardPanelBody">${zoneModal(game,p,'battlefield')}</div>`,[{label:'CLOSE',onClick:closeModal}]);$('#boardZones').onclick=()=>{$('#boardPanelBody').innerHTML=['battlefield','graveyard','exile','command'].map(z=>zoneModal(game,p,z)).join('')};$('#boardStats').onclick=()=>{$('#boardPanelBody').innerHTML=game.players.map(x=>`<div class="zone-row"><h3>${esc(x.displayName)}</h3><p>Life ${x.life} • Poison ${x.poison||0} • Hand ${x.deck.hand.length} • Library ${x.deck.remainingLibrary.length} • Battlefield ${x.deck.battlefield.length}</p></div>`).join('')};$('#boardLog').onclick=()=>{$('#boardPanelBody').innerHTML=`<div class="log-list">${game.log.map(logEventHtml).join('')||'<p>No game activity yet.</p>'}</div>`}}
function openStats(){openModal('GAME STATS',game.players.map(p=>`<div class="zone-row"><h3>${esc(p.displayName)}</h3><p>Life ${p.life} • Poison ${p.poison||0} • Hand ${p.deck.hand.length} • Library ${p.deck.remainingLibrary.length} • Battlefield ${p.deck.battlefield.length}</p></div>`).join(''),[{label:'END GAME',className:'danger',onClick:openEndGame},{label:'CLOSE',onClick:closeModal}])}
function openSettings(){const p=activePlayer();const neutralHost=!!network?.host&&!network?.localPlayerId;const advice=!neutralHost?buildStrategyAdvice({game,player:p}):null;openModal('GAME CONTROLS & SETTINGS',`<div class="counter-grid"><button id="saveNow">SAVE GAME</button><button id="undoNow">↶ UNDO</button><button id="rulesNow">RULE MODIFICATIONS</button><button id="homeNow">HOME</button><button id="tabletopNow">TABLETOP VIEW</button>${neutralHost?'<button id="gmNow">GM OPTIONS</button>':''}<button id="concedeNow">CONCEDE</button><button id="endNow">END GAME</button></div>${neutralHost?'<h3>HOST ROLE</h3><p>Neutral judge view. Use GM Options for authorized overrides; private hands remain hidden.</p>':`<h3>PLAYER DIRECTION</h3><p><b>${esc(advice?.headline||guidanceFor({game,player:p}))}</b></p><p class="muted">${esc(advice?.why||guidanceFor({game,player:p}))}</p>`}`,[]);$('#saveNow').onclick=()=>{save();toast('Game saved')};$('#undoNow').onclick=()=>confirmUndoLastStep();$('#rulesNow').onclick=openRules;$('#homeNow').onclick=()=>openModal('RETURN HOME','<p>Close this game and return to the Commander Companion home screen?</p>',[{label:'CANCEL',onClick:closeModal},{label:'RETURN HOME',className:'primary',onClick:()=>{save();closeModal();showLanding()}}]);$('#tabletopNow').onclick=()=>{closeModal();openTabletop()};if($('#gmNow'))$('#gmNow').onclick=()=>{if(!neutralHost)return toast('GM Options require the Host / Judge toggle.',true);openGMOptions()};$('#concedeNow').onclick=()=>{const cp=network?.localPlayerId?game.players.find(x=>x.playerId===network.localPlayerId):activePlayer();if(!cp||cp.eliminated)return toast('No active player is available to concede.',true);openModal('CONFIRM CONCESSION',`<p><b>${esc(cp.displayName)}</b> will leave this game.</p><p class="muted">If this ends the game, the result is recorded automatically.</p>`,[{label:'CANCEL',onClick:closeModal},{label:'CONCEDE',className:'danger',onClick:()=>{closeModal();commitAction({type:'concede',playerId:cp.playerId,label:`${cp.displayName} concedes`});render()}}])};$('#endNow').onclick=openEndGame}

function openGMOptions(){openModal('GM OPTIONS',`<p>Administrative override controls are intentionally separated from normal player actions.</p><label>Active Player<select id="gmActive">${game.players.map(p=>`<option value="${p.playerId}" ${p.playerId===game.activePlayerId?'selected':''}>${esc(p.displayName)}</option>`).join('')}</select></label><label>Phase<select id="gmPhase">${['untap','upkeep','draw','precombat-main','begin-combat','declare-attackers','declare-blockers','combat-damage','end-combat','postcombat-main','end-step','cleanup'].map(x=>`<option value="${x}" ${x===game.phase?'selected':''}>${phaseLabel(x)}</option>`).join('')}</select></label><label>Turn Number<input id="gmTurn" type="number" min="1" value="${game.turnNumber}"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'APPLY OVERRIDE',className:'primary',onClick:()=>{game.activePlayerId=$('#gmActive').value;game.phase=$('#gmPhase').value;configurePhaseGates(game,game.phase);game.turnNumber=Math.max(1,+$('#gmTurn').value||1);game.log.unshift({text:'GM override applied.',turn:game.turnNumber});closeModal();render()}}])}
function rulesEditorHtml(r){return `<div class="rules-grid"><label class="check"><input id="ruleCommanderDamage" type="checkbox" ${r.commanderDamage!==false?'checked':''}> Commander Damage loss (21 from one commander)</label><label class="check"><input id="rulePoisonLoss" type="checkbox" ${r.poisonLoss!==false?'checked':''}> Poison loss (10 counters)</label><label>Starting Life<input id="ruleStartingLife" type="number" min="1" max="999" value="${Number(r.startingLife||40)}"></label><label class="check"><input id="ruleCommanderTax" type="checkbox" ${r.commanderTax!==false?'checked':''}> Commander Tax (+2 each prior command-zone cast)</label><label class="check"><input id="ruleBanned" type="checkbox" ${r.bannedList!==false?'checked':''}> Commander banned-list enforcement</label><label class="check"><input id="ruleColorIdentity" type="checkbox" ${r.colorIdentity!==false?'checked':''}> Color-identity deck restriction</label><label class="check"><input id="ruleSingleton" type="checkbox" ${r.singleton!==false?'checked':''}> Singleton deck restriction</label><label class="check"><input id="ruleWishes" type="checkbox" ${r.wishes?'checked':''}> Allow outside-the-game / Wish effects <span class="house-tag">HOUSE RULE</span></label><label>Mulligan Rule<select id="ruleMulligan"><option value="commander" ${r.mulligan==='commander'?'selected':''}>Commander / London + first free mulligan</option><option value="london" ${r.mulligan==='london'?'selected':''}>London mulligan only</option><option value="free" ${r.mulligan==='free'?'selected':''}>Free mulligans (house rule)</option></select></label><label class="check"><input id="ruleZero" type="checkbox" ${r.ruleZeroOverrides?'checked':''}> Allow Rule Zero / normally illegal play overrides <span class="house-tag">HOUSE RULE</span></label><label class="check"><input id="ruleFirstDraw" type="checkbox" ${r.firstPlayerDraw!==false?'checked':''}> Track draw confirmation</label><label class="check"><input id="ruleEndConfirm" type="checkbox" ${r.endTurnConfirm!==false?'checked':''}> Confirm End Turn</label><label class="check"><input id="ruleSecondLand" type="checkbox" ${r.allowExtraLand?'checked':''}> Allow one additional normal land play <span class="house-tag">HOUSE RULE</span></label></div>`}
function readRulesEditor(){return normalizeRulesConfig({...game?.rulesConfig,...pendingRules,commanderDamage:$('#ruleCommanderDamage')?.checked!==false,poisonLoss:$('#rulePoisonLoss')?.checked!==false,startingLife:Math.max(1,Number($('#ruleStartingLife')?.value||40)),commanderTax:$('#ruleCommanderTax')?.checked!==false,bannedList:$('#ruleBanned')?.checked!==false,colorIdentity:$('#ruleColorIdentity')?.checked!==false,singleton:$('#ruleSingleton')?.checked!==false,wishes:!!$('#ruleWishes')?.checked,mulligan:$('#ruleMulligan')?.value||'commander',ruleZeroOverrides:!!$('#ruleZero')?.checked,firstPlayerDraw:$('#ruleFirstDraw')?.checked!==false,endTurnConfirm:$('#ruleEndConfirm')?.checked!==false,allowExtraLand:!!$('#ruleSecondLand')?.checked})}
function openRules(){const r=normalizeRulesConfig(game.rulesConfig);openModal('RULE MODIFICATIONS',`<p class="muted">Official Commander defaults are enabled. Any changed option is a table house rule and affects legality/win checks.</p>${rulesEditorHtml(r)}`,[{label:'CANCEL',onClick:closeModal},{label:'SAVE RULES',className:'primary',onClick:()=>{game.rulesConfig=readRulesEditor();game.log.unshift({text:'Rule modifications updated for this game.',turn:game.turnNumber,phase:game.phase});save();closeModal();render()}}])}
function openEndGame(){openModal('END GAME',`<p>Select the winner.</p>${game.players.filter(p=>!p.eliminated).map(p=>`<button class="search-result" data-winner="${p.playerId}">${esc(p.displayName)}</button>`).join('')}`,[{label:'CANCEL',onClick:closeModal}]);$$('[data-winner]').forEach(b=>b.onclick=async()=>{game.manualCompletionFinalizing=true;game.winner=b.dataset.winner;game.result='winner';game.completionReason='manual-end-game';game.completionId=game.completionId||`game:${game.startedAt||'session'}:${game.turnNumber}:${Date.now()}`;game.postGame=buildPostGame(game,{winnerId:b.dataset.winner});game.status='complete';await recordGame(game,network?.localPlayerId||game.players[0]?.playerId);game.completionRecordedAt=new Date().toISOString();game.manualCompletionFinalizing=false;const w=game.players.find(p=>p.playerId===b.dataset.winner);if(network?.host)network.host.broadcast({type:'state',game:publicGameForNetwork()});openModal('GAME COMPLETE',`<h2>${esc(w.displayName)} WINS</h2>${game.postGame.awards.map(a=>`<p><b>${esc(a.label)}</b> — ${esc(game.players.find(p=>p.playerId===a.playerId)?.displayName)}</p>`).join('')}<p>Game saved to history state.</p>`,[{label:'HOME',className:'primary',onClick:()=>{save();closeModal();showLanding()}},{label:'CLOSE',onClick:closeModal}])})}
function trackerPlayer(id){return game?.players.find(p=>p.playerId===id)||null}
function trackerCommit(action,reopen=null){try{commitAction(action);save();closeModal();openTabletop();reopen?.()}catch(e){toast(e?.message||'Tracker update failed.',true)}}
function trackerEditName(p){openModal('EDIT PLAYER NAME',`<label>PLAYER NAME<input id="ttNameInput" maxlength="32" value="${esc(p.displayName||'Player')}"></label>`,[{label:'CANCEL',onClick:closeModal},{label:'SAVE NAME',className:'primary',onClick:()=>{const next=$('#ttNameInput')?.value.trim();if(!next)return toast('Enter a player name.',true);const prior=p.displayName;p.displayName=next;game.log.unshift({text:`${prior} is now ${next}.`,turn:game.turnNumber});closeModal();save();openTabletop()}}])}
function trackerEditStat(p,stat){const isLife=stat==='life',isPoison=stat==='poison',isPlus=stat==='+1/+1',value=isLife?p.life:isPoison?(p.poison||0):Number(p.counters?.['+1/+1']||0),title=isLife?'LIFE TOTAL':isPoison?'POISON COUNTERS':'+1/+1 COUNTER STACK';openModal(`${p.displayName} — ${title}`,`<div class="tracker-edit-value"><button id="ttMinus5">−5</button><button id="ttMinus">−1</button><strong>${value}</strong><button id="ttPlus">+1</button><button id="ttPlus5">+5</button></div><label>SET EXACT VALUE<input id="ttExact" type="number" min="0" max="9999" value="${value}"></label><p class="muted">Table Tracker records this as public table state.</p>`,[{label:'DONE',className:'primary',onClick:closeModal}]);
  const adjust=delta=>{if(isLife)return trackerCommit({type:'life',playerId:p.playerId,delta,label:`${p.displayName} life ${delta>=0?'increases':'decreases'} by ${Math.abs(delta)}.`},()=>trackerEditStat(p,stat));if(isPoison)return trackerCommit({type:'poison',playerId:p.playerId,delta,label:`${p.displayName} poison changes by ${delta}.`},()=>trackerEditStat(p,stat));return trackerCommit({type:'counter',playerId:p.playerId,counter:'+1/+1',delta,label:`${p.displayName} +1/+1 counter stack changes by ${delta}.`},()=>trackerEditStat(p,stat))};
  $('#ttMinus5').onclick=()=>adjust(-5);$('#ttMinus').onclick=()=>adjust(-1);$('#ttPlus').onclick=()=>adjust(1);$('#ttPlus5').onclick=()=>adjust(5);$('#ttExact').onchange=()=>{const target=Math.max(0,Number($('#ttExact').value)||0),cur=isLife?p.life:isPoison?(p.poison||0):Number(p.counters?.['+1/+1']||0);adjust(target-cur)}
}
function trackerEditStatus(p){const defaults=['Monarch','The Initiative','City’s Blessing'],existing=[...new Set([...(p.statuses||[]),...defaults])];openModal(`${p.displayName} — STATUS TRACKER`,`<div class="tracker-status-list">${existing.map(x=>`<label class="check"><input type="checkbox" data-tt-status-choice="${esc(x)}" ${(p.statuses||[]).includes(x)?'checked':''}> ${esc(x)}</label>`).join('')}</div><label>CUSTOM STATUS<input id="ttCustomStatus" placeholder="e.g. Ring-bearer, Day, Night"></label>`,[{label:'ADD CUSTOM',onClick:()=>{const x=$('#ttCustomStatus')?.value.trim();if(!x)return toast('Enter a status name.',true);trackerCommit({type:'status',playerId:p.playerId,status:x,enabled:true,label:`${p.displayName} gains ${x}.`},()=>trackerEditStatus(p))}},{label:'DONE',className:'primary',onClick:closeModal}]);$$('[data-tt-status-choice]').forEach(b=>b.onchange=()=>trackerCommit({type:'status',playerId:p.playerId,status:b.dataset.ttStatusChoice,enabled:b.checked,label:`${p.displayName}: ${b.dataset.ttStatusChoice} ${b.checked?'enabled':'removed'}.`},()=>trackerEditStatus(p)))}
function trackerEditMana(p,color){const names={W:'WHITE',U:'BLUE',B:'BLACK',R:'RED',G:'GREEN',C:'COLORLESS'},total=Number(p.mana?.total?.[color]||0),available=Number(p.mana?.available?.[color]||0);openModal(`${p.displayName} — ${names[color]} MANA`,`<div class="tracker-mana-editor"><section><b>TOTAL SOURCES</b><div><button data-tt-mana-total="-1">−</button><strong>${total}</strong><button data-tt-mana-total="1">+</button></div></section><section><b>AVAILABLE NOW</b><div><button data-tt-mana-avail="-1">−</button><strong>${available}</strong><button data-tt-mana-avail="1">+</button></div></section></div><p class="muted">Large number on the player card is available mana; small number is total tracked mana capacity.</p>`,[{label:'DONE',className:'primary',onClick:closeModal}]);$$('[data-tt-mana-total]').forEach(b=>b.onclick=()=>trackerCommit({type:'mana-total',playerId:p.playerId,color,delta:Number(b.dataset.ttManaTotal),label:`${p.displayName} adjusts ${names[color]} total mana.`},()=>trackerEditMana(p,color)));$$('[data-tt-mana-avail]').forEach(b=>b.onclick=()=>trackerCommit({type:'mana-available',playerId:p.playerId,color,delta:Number(b.dataset.ttManaAvail),label:`${p.displayName} adjusts ${names[color]} available mana.`},()=>trackerEditMana(p,color)))}
function trackerEditTax(p,commanderId){const cmd=p.commanders.find(c=>c.id===commanderId);if(!cmd)return;const name=game.cardDefinitions?.[cmd.cardId]?.name||'Commander';openModal(`${p.displayName} — COMMANDER TAX`,`<p>${esc(name)}</p><div class="tracker-edit-value"><button id="ttTaxMinus">−2</button><strong>${Number(cmd.commanderTax||0)}</strong><button id="ttTaxPlus">+2</button></div>`,[{label:'DONE',className:'primary',onClick:closeModal}]);const bump=d=>{cmd.commanderTax=Math.max(0,Number(cmd.commanderTax||0)+d);game.log.unshift({text:`${p.displayName} adjusts ${name} commander tax to ${cmd.commanderTax}.`,turn:game.turnNumber});closeModal();save();openTabletop()};$('#ttTaxMinus').onclick=()=>bump(-2);$('#ttTaxPlus').onclick=()=>bump(2)}
function bindTableTracker(){
  $('#trackerSave')?.addEventListener('click',()=>{save();toast('Table Tracker saved locally.')});$('#trackerHome')?.addEventListener('click',showLanding);
  $$('[data-tt-name]').forEach(b=>b.onclick=()=>{const p=trackerPlayer(b.dataset.ttName);if(p)trackerEditName(p)});
  $$('[data-tt-stat]').forEach(b=>b.onclick=()=>{const p=trackerPlayer(b.dataset.player);if(p)trackerEditStat(p,b.dataset.ttStat)});
  $$('[data-tt-status]').forEach(b=>b.onclick=()=>{const p=trackerPlayer(b.dataset.ttStatus);if(p)trackerEditStatus(p)});
  $$('[data-tt-mana]').forEach(b=>b.onclick=()=>{const p=trackerPlayer(b.dataset.player);if(p)trackerEditMana(p,b.dataset.ttMana)});
  $$('[data-tt-tax]').forEach(b=>b.onclick=()=>{const p=trackerPlayer(b.dataset.player);if(p)trackerEditTax(p,b.dataset.ttTax)});
}
function openTabletop(){
  $('#gameScreen').hidden=true;$('#landing').hidden=true;$('#tabletopScreen').hidden=false;$('#tabletopScreen').innerHTML=renderTabletop(game);
  if(game.mode==='table-tracker'||game.mode==='tabletop')bindTableTracker();
  else {$('#tabletopScreen').insertAdjacentHTML('beforeend','<button id="exitTabletop" style="position:fixed;right:10px;top:10px;z-index:5">EXIT</button>');$('#exitTabletop').onclick=showGame}
}

// Deck Editor
async function syncEditorSecondary(){const wrap=$('#deckCommander2Wrap');if(!wrap)return;let allowed=false;const name=$('#deckCommander1').value.trim(),text=$('#deckListInput').value.trim();if(name&&text){try{const defs=await resolveCommanderPool(text);allowed=allowsSecondaryCommander(findDefinitionByName(defs,name))}catch{}}wrap.hidden=!allowed;if(!allowed)$('#deckCommander2').value=''}
function refreshDeckEditor(){const all=listDecks();$('#savedDeckList').innerHTML=all.map(d=>`<button class="saved-deck${d.id===editingDeckId?' active':''}" data-deck-id="${d.id}">${esc(d.name)}</button>`).join('')||'<p class="muted">No saved decks yet.</p>';$$('[data-deck-id]').forEach(b=>b.onclick=()=>loadDeckEditor(b.dataset.deckId))}
function loadDeckEditor(id){const d=listDecks().find(x=>x.id===id);if(!d)return;editingDeckId=id;$('#deckNameInput').value=d.name||'';$('#deckCommander1').value=d.commander1||'';$('#deckCommander2').value=d.commander2||'';$('#deckListInput').value=d.deckList||'';refreshDeckEditor();syncEditorSecondary()}
function deckEditorAddCard(d){const text=$('#deckListInput').value.trim(),lines=text?text.split(/\r?\n/):[];const escaped=d.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const re=new RegExp(`^(\\d+)\\s*[xX]?\\s+${escaped}(?:\\s+\\([A-Z0-9]+\\)\\s+\\d+)?$`,'i');let found=false;for(let i=0;i<lines.length;i++){const m=lines[i].trim().match(re);if(m){lines[i]=`${Number(m[1])+1} ${d.name}`;found=true;break}}if(!found)lines.push(`1 ${d.name}`);$('#deckListInput').value=lines.filter(Boolean).join('\n');syncEditorSecondary();$('#deckEditorStatus').innerHTML=`<span class="good">Added ${esc(d.name)}.</span>`}
function bindDeckCardBuilder(){let timer=null,rows=[];const input=$('#deckCardSearch'),results=$('#deckCardResults');if(!input||!results)return;const run=async()=>{const q=input.value.trim();if(q.length<2){results.innerHTML='<p class="muted">Type at least two characters.</p>';return}results.innerHTML='<p>Searching…</p>';try{rows=await searchCards(q,{allPrintings:false});results.innerHTML=rows.slice(0,30).map((d,i)=>`<button class="search-result" data-deck-card="${i}"><img src="${imageOf(d)}"><span><b>${esc(d.name)}</b><small>${esc(d.typeLine)}</small></span><strong>+ ADD</strong></button>`).join('')||'<p>No cards found.</p>';$$('[data-deck-card]').forEach(b=>b.onclick=()=>deckEditorAddCard(rows[Number(b.dataset.deckCard)]))}catch(e){results.innerHTML=`<p class="bad">${esc(e.message)}</p>`}};input.oninput=()=>{clearTimeout(timer);timer=setTimeout(run,260)};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();run()}}}
async function importManaBoxFile(file){if(!file)return;const raw=await file.text(),parsed=parseManaBoxFileContents(file.name,raw);if(!parsed.deckList.trim())throw new Error('No deck cards were recognized in this ManaBox file.');editingDeckId=null;$('#deckNameInput').value=file.name.replace(/\.(txt|csv)$/i,'')||'Imported ManaBox Deck';$('#deckCommander1').value=parsed.commanders[0]||'';$('#deckCommander2').value=parsed.commanders[1]||'';$('#deckListInput').value=parsed.deckList;await syncEditorSecondary();refreshDeckEditor();$('#deckEditorStatus').innerHTML=`<span class="good">Imported ${parsed.deckList.split(/\r?\n/).length} ManaBox lines. Review, edit, then save.</span>`}
function copyCurrentDeck(){const d=editingDeckId?listDecks().find(x=>x.id===editingDeckId):null;if(!d)return toast('Select a saved deck to copy.',true);editingDeckId=null;$('#deckNameInput').value=`Copy of ${d.name||'Deck'}`;$('#deckCommander1').value=d.commander1||'';$('#deckCommander2').value=d.commander2||'';$('#deckListInput').value=d.deckList||'';refreshDeckEditor();syncEditorSecondary();$('#deckEditorStatus').innerHTML='<span class="good">Copy created. Modify it and choose Save Deck.</span>'}
async function openDeckEditor(){await userDataReady;editingDeckId=null;$('#deckNameInput').value='';$('#deckCommander1').value='';$('#deckCommander2').value='';$('#deckListInput').value='';$('#deckEditorStatus').textContent='';if($('#deckAnalytics'))$('#deckAnalytics').innerHTML='<div class="muted">Validate the deck to calculate curve, land count, card types, and color identity.</div>';refreshDeckEditor();syncEditorSecondary();$('#deckDialog').showModal();bindDeckCardBuilder()}
async function validateEditor(){const status=$('#deckEditorStatus');status.textContent='Resolving card list…';try{const h=await hydrateDeckList($('#deckListInput').value,(d,t)=>status.textContent=`Resolving ${d}/${t}…`);if(h.unresolved.length)throw new Error(`Unresolved cards: ${h.unresolved.slice(0,5).join(', ')}`);const cmds=[];for(const n of [$('#deckCommander1').value,$('#deckCommander2').value].map(x=>x.trim()).filter(Boolean)){const d=h.definitions.find(x=>x.name.toLowerCase()===n.toLowerCase());if(!d)throw new Error(`Commander ${n} is not in this deck.`);cmds.push(d)}const check=validateCommanderDeck({manifest:h.manifest,definitions:h.definitions,commanders:cmds,rulesConfig:pendingRules});const analytics=analyzeDeck({manifest:h.manifest,definitions:h.definitions});status.innerHTML=`<span class="${check.legal?'good':'bad'}">${h.total}/100 cards • ${check.legal?'COMMANDER LEGAL':esc(check.reasons.join(' • '))}</span>`;if($('#deckAnalytics'))$('#deckAnalytics').innerHTML=deckAnalyticsHtml(analytics);return {h,cmds,check,analytics}}catch(e){status.textContent=e.message;if($('#deckAnalytics'))$('#deckAnalytics').innerHTML='';throw e}}
$('#deckPickCommander1').onclick=()=>openDeckCommanderPicker({deckText:$('#deckListInput').value,onSelect:d=>{$('#deckCommander1').value=d.name;$('#deckCommander2').value='';syncEditorSecondary();$('#deckDialog').showModal()}});
$('#deckPickCommander2').onclick=()=>openDeckCommanderPicker({deckText:$('#deckListInput').value,primaryName:$('#deckCommander1').value,secondary:true,onSelect:d=>{$('#deckCommander2').value=d.name;$('#deckDialog').showModal()}});
$('#deckListInput').onchange=syncEditorSecondary;
$('#validateDeckBtn').onclick=()=>validateEditor().catch(()=>{});$('#saveDeckBtn').onclick=async()=>{try{await userDataReady;const validation=await validateEditor();const d=await saveDeck({id:editingDeckId,name:$('#deckNameInput').value.trim()||'Untitled Deck',commander1:$('#deckCommander1').value.trim(),commander2:$('#deckCommander2').value.trim(),deckList:$('#deckListInput').value,analytics:validation.analytics});editingDeckId=d.id;await recordDeckCreated(d);refreshDeckEditor();$('#deckEditorStatus').innerHTML='<span class="good">Deck saved to this device.</span>';toast('Deck saved')}catch(e){$('#deckEditorStatus').textContent=e.message;$('#deckEditorStatus').classList.add('bad')}};$('#newDeckBtn').onclick=()=>{editingDeckId=null;$('#deckNameInput').value='';$('#deckCommander1').value='';$('#deckCommander2').value='';$('#deckListInput').value='';refreshDeckEditor()};$('#deleteDeckBtn').onclick=async()=>{if(editingDeckId&&confirm('Delete this saved deck?')){try{await userDataReady;const deletedId=editingDeckId;await deleteDeck(deletedId);await recordDeckDeleted(deletedId);editingDeckId=null;openDeckEditor();toast('Deck deleted')}catch(e){toast(e.message,true)}}};$('#preconCatalogBtn').onclick=()=>openPreconPicker(async pre=>{$('#deckNameInput').value=pre.name;$('#deckCommander1').value=pre.commanders[0]||'';$('#deckCommander2').value=pre.commanders[1]||'';$('#deckListInput').value=pre.deckList;await syncEditorSecondary();$('#deckDialog').showModal()});
$('#copyDeckBtn')?.addEventListener('click',copyCurrentDeck);$('#importManaBoxBtn')?.addEventListener('click',()=>$('#manaBoxFileInput')?.click());$('#manaBoxFileInput')?.addEventListener('change',async e=>{try{await importManaBoxFile(e.target.files?.[0])}catch(err){$('#deckEditorStatus').textContent=err.message;$('#deckEditorStatus').classList.add('bad')}finally{e.target.value=''}});
$('#setupDialog .modal-actions .dialog-close')?.addEventListener('click',()=>{if($('#setupDialog').open)$('#setupDialog').close()});
async function openPreconPicker(onPick){if($('#deckDialog').open)$('#deckDialog').close();openModal('PRECON CATALOG','<p>Loading official preconstructed deck catalog…</p>',[{label:'CANCEL',onClick:closeModal}]);try{const rows=await listPrecons();$('#modalContent').innerHTML=`<div class="card-search-row"><input id="preconFilter" placeholder="Filter precons"><span>${rows.length} decks</span></div><div id="preconResults" class="card-search-results"></div>`;const renderRows=()=>{const q=$('#preconFilter').value.toLowerCase();const show=rows.filter(x=>!q||x.name.toLowerCase().includes(q)).slice(0,150);$('#preconResults').innerHTML=show.map((x,i)=>`<button class="search-result" data-precon="${i}"><span><b>${esc(x.name)}</b><br><small>${esc(x.releaseDate)} • ${esc(x.type)}</small></span></button>`).join('');$$('[data-precon]').forEach((b,i)=>b.onclick=async()=>{const row=show[i];b.textContent='Loading…';try{const pre=await loadPrecon(row.fileName);closeModal();onPick(pre)}catch(e){toast(e.message,true)}})};$('#preconFilter').oninput=renderRows;renderRows()}catch(e){$('#modalContent').innerHTML=`<p class="bad">${esc(e.message)}</p>`}}


function requestIllegalApproval(p,c,d,kind,v){
  const id=crypto.randomUUID();approvalCallbacks.set(id,()=>forceApprovedPlay(p,c,d,kind));const payload={type:'approval-request',requestId:id,requesterId:p.playerId,cardName:d.name,reasons:v.reasons};
  closeModal();
  if(network?.host){beginHostApproval(payload)}else if(network?.client){network.client.send(payload);toast('Approval request sent to the table.')}else toast('Approval requires a multi-device game.',true)
}
function forceApprovedPlay(p,c,d,kind){
  if(!instance(p,c.instanceId))return toast('The requested card is no longer available.',true);const target=/Instant|Sorcery/i.test(d.typeLine)?'graveyard':'battlefield';
  if(kind==='land'){playLandFromHand(p,c,d);toast('Table approval granted.');return}
  commitAction({type:'cast-card',playerId:p.playerId,instanceId:c.instanceId,to:target,payment:{},label:`${p.displayName} casts ${d.name} by table approval.`});render();toast('Table approval granted.')
}
function beginHostApproval(req){const eligible=game.players.map(p=>p.playerId).filter(id=>id!==req.requesterId);hostApprovals.set(req.requestId,{...req,eligible,votes:{}});network?.host?.broadcast?.(req);if(network?.localPlayerId&&network.localPlayerId!==req.requesterId)showApprovalVote(req);if(!eligible.length)finishHostApproval(req.requestId)}
function showApprovalVote(req){openModal('TABLE APPROVAL',`<p><b>${esc(game.players.find(p=>p.playerId===req.requesterId)?.displayName||'A player')}</b> asks to play <b>${esc(req.cardName)}</b> despite:</p><p class="bad">${esc((req.reasons||[]).join(' • '))}</p><p>The requester does not vote.</p>`,[{label:'DENY',onClick:()=>sendApprovalVote(req.requestId,'deny')},{label:'APPROVE',className:'primary',onClick:()=>sendApprovalVote(req.requestId,'approve')}])}
function sendApprovalVote(requestId,vote){closeModal();const voterId=network?.localPlayerId;if(!voterId)return;if(network?.host){recordHostVote(requestId,voterId,vote)}else network?.client?.send?.({type:'approval-vote',requestId,voterId,vote})}
function recordHostVote(requestId,voterId,vote){const r=hostApprovals.get(requestId);if(!r||!r.eligible.includes(voterId))return;r.votes[voterId]=vote;if(r.eligible.every(id=>r.votes[id]))finishHostApproval(requestId)}
function finishHostApproval(requestId){const r=hostApprovals.get(requestId);if(!r)return;const result=approvalResult({eligibleVoters:[...r.eligible,r.requesterId],votes:r.votes,requesterId:r.requesterId});const msg={type:'approval-result',requestId,requesterId:r.requesterId,approved:result.approved,approvals:result.approvals,total:result.total};network?.host?.broadcast?.(msg);if(network?.localPlayerId===r.requesterId)handleApprovalResult(msg);hostApprovals.delete(requestId)}
function handleApprovalResult(msg){if(msg.requesterId!==network?.localPlayerId)return;const cb=approvalCallbacks.get(msg.requestId);approvalCallbacks.delete(msg.requestId);game?.log?.unshift({text:`Table request ${msg.approved?'ACCEPTED':'DENIED'} (${msg.approvals}/${msg.total} approvals).`,turn:game?.turnNumber||1,phase:game?.phase});save();if(msg.approved)cb?.();else toast(`Table denied the request (${msg.approvals}/${msg.total} approvals).`,true)}
// Multi-device: PeerJS transports authoritative public events. Each remote retains its private hand/library locally.
function networkSetupHtml(role='PLAYER'){
  const saved=listDecks(),defaults=accountSetupDefaults(),defaultName=defaults.playerNames[0]||defaults.displayName||(role==='HOST'?'Host':'Player');return `<h3>${role} CONFIGURATION</h3><label>Name<input id="netName" value="${esc(defaultName)}"></label><div class="setup-tools"><select id="netSaved"><option value="">Load saved deck…</option>${saved.map(d=>`<option value="${esc(d.id)}" ${d.id===defaults.favoriteDeckId?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div><div class="setup-line"><label>Commander 1<input id="netCmd1" readonly><button type="button" id="netPickCmd1">SELECT FROM DECK</button></label><label id="netCmd2Wrap" hidden>Commander 2<input id="netCmd2" readonly><button type="button" id="netPickCmd2">SELECT LEGAL PARTNER</button></label></div><label>Deck List<textarea id="netDeck" rows="12"></textarea></label>${selectedMode==='freeplay'?'<label class="check"><input id="netVirtualHand" type="checkbox" checked> Virtual Hand</label>':'<p class="muted">Maximum guidance · Virtual Hand always on</p>'}<div id="netConfigStatus" class="progress-text"></div>`}
async function syncNetworkSecondary(){const wrap=$('#netCmd2Wrap');if(!wrap)return;let allowed=false;const name=$('#netCmd1').value.trim(),text=$('#netDeck').value.trim();if(name&&text){try{const defs=await resolveCommanderPool(text);allowed=allowsSecondaryCommander(findDefinitionByName(defs,name))}catch{}}wrap.hidden=!allowed;if(!allowed)$('#netCmd2').value=''}
function bindNetworkSaved(){const sel=$('#netSaved');if(!sel)return;sel.onchange=async()=>{const d=listDecks().find(x=>x.id===sel.value);sel.dataset.selectedDeckId=d?.id||'';sel.dataset.selectedDeckName=d?.name||'';if(!d){$('#netCmd1').value='';$('#netCmd2').value='';$('#netDeck').value='';await syncNetworkSecondary();return}$('#netCmd1').value=d.commander1||'';$('#netCmd2').value=d.commander2||'';$('#netDeck').value=d.deckList||'';await syncNetworkSecondary()};$('#netPickCmd1').onclick=()=>openDeckCommanderPicker({deckText:$('#netDeck').value,onSelect:d=>{$('#netCmd1').value=d.name;$('#netCmd2').value='';syncNetworkSecondary();$('#networkDialog').showModal()}});$('#netPickCmd2').onclick=()=>openDeckCommanderPicker({deckText:$('#netDeck').value,primaryName:$('#netCmd1').value,secondary:true,onSelect:d=>{$('#netCmd2').value=d.name;$('#networkDialog').showModal()}});$('#netDeck').onchange=syncNetworkSecondary;if(sel.value)sel.dispatchEvent(new Event('change'))}
async function buildNetworkPrivatePlayer(seat=0){
  const name=$('#netName').value.trim()||`Player ${seat+1}`,cmdNames=[$('#netCmd1').value.trim(),$('#netCmd2').value.trim()].filter(Boolean),text=$('#netDeck').value.trim();
  if(selectedMode==='fully-tracked'&&!text)throw new Error('A deck list is required in Full Play Tracking.');
  const h=text?await hydrateDeckList(text,(d,t)=>$('#netConfigStatus').textContent=`Resolving ${d}/${t}…`):{manifest:[],definitions:[],unresolved:[],total:0};const cmdDefs=[];
  for(const n of cmdNames){let d=h.definitions.find(x=>x.name.toLowerCase()===n.toLowerCase());if(!d&&text)throw new Error(`Commander ${n} is not in this deck.`);if(!d)d=await resolveNamedCard(n);cmdDefs.push(d);if(!h.manifest.some(x=>x.definitionId===d.definitionId)){if(text)throw new Error(`Commander ${n} is not in this deck.`);h.manifest.push({definitionId:d.definitionId,quantity:1})}if(!h.definitions.some(x=>x.definitionId===d.definitionId))h.definitions.push(d)}
  if(selectedMode==='fully-tracked'||text){if(h.unresolved.length)throw new Error(`Unresolved: ${h.unresolved.slice(0,4).join(', ')}`);const deckCheck=validateCommanderDeck({manifest:h.manifest,definitions:h.definitions,commanders:cmdDefs,rulesConfig:pendingRules});if(!deckCheck.legal)throw new Error(deckCheck.reasons[0])}
  const selectedDeckId=$('#netSaved')?.value||'';const selectedDeck=selectedDeckId?listDecks().find(d=>d.id===selectedDeckId):null;
  const playerId=`net-${crypto.randomUUID().slice(0,8)}`;const deck=normalizeDeck({ownerId:playerId,sourceType:selectedDeck?'saved-deck':'network-private',sourceId:selectedDeck?.id||null,sourceName:selectedDeck?.name||'Private network deck',manifest:h.manifest,commanderDefinitionIds:cmdDefs.map(d=>d.definitionId)});deck.savedDeckId=selectedDeck?.id||null;const handTracking=selectedMode==='fully-tracked'?true:!!$('#netVirtualHand')?.checked;deck.virtualDrawEnabled=handTracking;shuffleLibrary(deck);if(handTracking&&deck.remainingLibrary.length>=7)drawOpeningHand(deck,7);const commanders=cmdDefs.map((d,i)=>({id:`${playerId}:commander:${i+1}`,cardId:d.definitionId,card:d}));
  return {player:{playerId,displayName:name,seat,guidanceLevel:selectedMode==='fully-tracked'?'guided':'standard',settings:{handTracking},deck,commanders,life:40,poison:0,statuses:[],counters:{},mana:{total:{W:0,U:0,B:0,R:0,G:0,C:0},available:{W:0,U:0,B:0,R:0,G:0,C:0}},confirmations:{draw:false},privateHandOwnership:playerId},defs:Object.fromEntries(h.definitions.map(d=>[d.definitionId,d])),commanderDefs:cmdDefs};
}
function bundleDefinition(bundle,id){return bundle?.defs?.[id]||bundle?.commanderDefs?.find(d=>d.definitionId===id)||null}
function configurePrivateOpeningHand(bundle,{title='PRIVATE OPENING HAND'}={}){
  return new Promise(resolve=>{
    const p=bundle.player;
    const show=()=>{
      const hand=p.deck.hand.map(c=>{const d=bundleDefinition(bundle,c.definitionId);return `<button class="hand-card" type="button">${d?`<img src="${imageOf(d)}" alt="${esc(d.name)}">`:'<span class="fallback">UNRESOLVED</span>'}</button>`}).join('');
      openModal(`${p.displayName} — ${title}`,`<p>This hand exists only on this device. Review it before marking this player Ready.</p><div class="hand-panel"><h3>OPENING HAND (${p.deck.hand.length})</h3><div class="hand-strip">${hand}</div></div>`,[
        {label:'RANDOM HAND',onClick:()=>{p.deck.remainingLibrary.push(...p.deck.hand.splice(0).map(c=>({...c,zone:'library'})));shuffleLibrary(p.deck);drawOpeningHand(p.deck,7);sync(p.deck);show()}},
        {label:'CUSTOMIZE',onClick:customize},
        {label:'CONFIRM HAND',className:'primary confirm-hand-btn',onClick:()=>{closeModal();resolve(bundle)}}
      ]);
    };
    const customize=()=>{
      const pool=[...p.deck.hand,...p.deck.remainingLibrary],selected=new Set(p.deck.hand.map(c=>c.instanceId));
      openModal(`${p.displayName} — CUSTOMIZE HAND`,`<p>Select exactly seven cards from this private tracked deck. No global-card search is available here.</p><div id="netCustomCount" class="progress-text">Selected ${selected.size}/7</div><div class="card-search-results">${pool.map(c=>{const d=bundleDefinition(bundle,c.definitionId);return `<label class="search-result"><input type="checkbox" data-net-custom="${c.instanceId}" ${selected.has(c.instanceId)?'checked':''}><img src="${imageOf(d)}"><span>${esc(d?.name||'Unresolved')}</span></label>`}).join('')}</div>`,[
        {label:'CANCEL',onClick:show},
        {label:'USE SELECTED 7',className:'primary',onClick:()=>{if(selected.size!==7)return toast('Choose exactly seven cards.',true);const all=[...p.deck.hand,...p.deck.remainingLibrary];p.deck.hand=[];p.deck.remainingLibrary=[];for(const c of all){if(selected.has(c.instanceId)){c.zone='hand';p.deck.hand.push(c)}else{c.zone='library';p.deck.remainingLibrary.push(c)}}sync(p.deck);show()}}
      ]);
      $$('[data-net-custom]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.netCustom):selected.delete(c.dataset.netCustom);$('#netCustomCount').textContent=`Selected ${selected.size}/7`});
    };
    show();
  });
}
function publicDescriptor(bundle){const p=bundle.player;return {playerId:p.playerId,displayName:p.displayName,seat:p.seat,life:p.life,poison:p.poison,statuses:p.statuses,counters:p.counters,mana:p.mana,commanders:p.commanders,deck:normalizeDeck({ownerId:p.playerId,sourceType:'network-public',manifest:[]}),publicCounts:{hand:p.deck.hand.length,library:p.deck.remainingLibrary.length},privateHandOwnership:p.playerId,confirmations:{draw:false},guidanceLevel:p.guidanceLevel,settings:{...(p.settings||{}),handTracking:p.guidanceLevel==='guided'||!!p.settings?.handTracking},commanderDefinitions:Object.fromEntries(bundle.commanderDefs.map(d=>[d.definitionId,d]))}}
function mergeOwnPrivate(publicGame){if(!network?.privateBundle)return publicGame;const own=network.privateBundle.player;const i=publicGame.players.findIndex(p=>p.playerId===own.playerId);if(i>=0){const pub=publicGame.players[i];own.life=pub.life;own.poison=pub.poison;own.statuses=pub.statuses;own.counters={...own.counters,...pub.counters};own.mana=pub.mana;own.commanders=pub.commanders;publicGame.players[i]=own}publicGame.cardDefinitions={...(publicGame.cardDefinitions||{}),...network.privateBundle.defs};return publicGame}
function publicPlayerProjection(p){return {playerId:p.playerId,displayName:p.displayName,life:p.life,poison:p.poison,statuses:p.statuses,counters:p.counters,mana:p.mana,commanders:p.commanders,deck:{...normalizeDeck({ownerId:p.playerId,sourceType:'network-public',manifest:[]}),battlefield:structuredClone(p.deck.battlefield),graveyard:structuredClone(p.deck.graveyard),exile:structuredClone(p.deck.exile),tokens:structuredClone(p.deck.tokens),attachments:structuredClone(p.deck.attachments),commandZone:structuredClone(p.deck.commandZone)},publicCounts:{hand:p.deck.hand.length,library:p.deck.remainingLibrary.length},definitions:Object.fromEntries([...p.deck.battlefield,...p.deck.graveyard,...p.deck.exile,...p.deck.commandZone].filter(c=>!c.faceDown&&!c.hidden&&!c.private).map(c=>[c.definitionId,def(c.definitionId)]).filter(x=>x[1]))}}
function mergePublicPlayer(target,proj){target.displayName=proj.displayName;target.life=proj.life;target.poison=proj.poison;target.statuses=proj.statuses;target.counters=proj.counters;target.mana=proj.mana;target.commanders=proj.commanders;target.publicCounts=proj.publicCounts;for(const z of ['battlefield','graveyard','exile','tokens','attachments','commandZone'])target.deck[z]=proj.deck[z]||[];Object.assign(game.cardDefinitions,proj.definitions||{})}
function sendNetworkPublicUpdate(text='State updated'){if(!network||!game)return;const p=game.players.find(x=>x.playerId===network.localPlayerId);if(!p)return;const msg={type:'player-public',projection:publicPlayerProjection(p),text};if(network.host){/* host already owns state */network.host.broadcast({type:'state',game:publicGameForNetwork()})}else network.client?.send?.(msg)}
async function openMultiplayerSetup(forceHostJudge=false){
  selectedMode=$('.tracking-choice.active')?.dataset.mode||'fully-tracked';
  $('#networkTitle').textContent='NEW MULTIPLAYER GAME';
  $('#networkContent').innerHTML=`<p>Create one shared multiplayer table. The creating device can participate as a player or become a dedicated neutral Host / Judge.</p><label class="check"><input id="useHostJudge" type="checkbox" ${forceHostJudge?'checked':''}> HOST / JUDGE DEVICE</label><p class="muted">When enabled, this device does not occupy a player seat. It shows only public table state and acts as the GM/Judge.</p>`;
  $('#networkActions').innerHTML='<button class="dialog-close">CANCEL</button><button id="createMultiNow" class="primary">CREATE GAME</button>';
  $('#networkDialog').showModal();$('#networkDialog .dialog-close').onclick=()=>$('#networkDialog').close();
  $('#createMultiNow').onclick=()=>{const neutral=$('#useHostJudge').checked;$('#networkDialog').close();openHostMulti({neutralHost:neutral})};
}
async function openHostMulti({neutralHost=false}={}){
  const code=roomCode();selectedMode=$('.tracking-choice.active')?.dataset.mode||'fully-tracked';
  $('#networkTitle').textContent=neutralHost?'MULTIPLAYER — HOST / JUDGE':'MULTIPLAYER — PLAYER HOST';
  $('#networkContent').innerHTML=`<p>${neutralHost?'This device is the neutral non-player Host/GM. It receives only public game state.':'This device is Player 1 and also coordinates the shared multiplayer table.'}</p><div class="network-code">${code}</div><label>Players<select id="hostSeats"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>${neutralHost?'':networkSetupHtml('PLAYER 1')}<div id="networkStatus">Opening room…</div><div id="seatList" class="seat-list"></div>`;
  $('#networkActions').innerHTML='<button id="networkCancel">CANCEL</button><button id="hostStart" class="primary" disabled>START GAME</button>';$('#networkDialog').showModal();
  if(!neutralHost)bindNetworkSaved();
  try{const ready=new Map();let localBundle=null;const host=await createHostNetwork(code,{onConnection:c=>c.send({type:'welcome',code,mode:selectedMode}),onData:(d,c)=>{if(d?.type==='hello')c.send({type:'hello-ack'});if(d?.type==='ready'){ready.set(d.descriptor.playerId,{descriptor:d.descriptor,conn:c});renderSeats()}if(d?.type==='player-public'&&game){const p=game.players.find(x=>x.playerId===d.projection.playerId);if(p)mergePublicPlayer(p,d.projection);game.log.unshift({text:d.text||`${p?.displayName||'Remote player'} updates public state.`,turn:game.turnNumber});host.broadcast({type:'state',game:publicGameForNetwork()});render()}if(d?.type==='request-game-action'&&game){const freshness=validateRemoteStamp(game,d.stateStamp),seat=[...ready.values()].find(x=>x.conn===c);if(seat&&d.action?.playerId!==seat.descriptor.playerId){game.log.unshift({text:'Rejected remote action for a different player seat.',turn:game.turnNumber,type:'network-warning'});c.send({type:'network-action-rejected',reason:'That device may act only for its assigned player.'});host.broadcast({type:'state',game:publicGameForNetwork()});render()}else if(!freshness.legal){game.log.unshift({text:`Rejected stale remote game action: ${freshness.reasons.join(' ')}`,turn:game.turnNumber,type:'network-warning'});c.send({type:'network-action-rejected',reason:freshness.reasons.join(' ')});host.broadcast({type:'state',game:publicGameForNetwork()});render()}else{applySharedNetworkAction(d.action);host.broadcast({type:'state',game:publicGameForNetwork()})}}if(d?.type==='combat-attack'&&game){const freshness=validateRemoteStamp({...game,combatState:null},d.stateStamp);if(!freshness.legal){game.log.unshift({text:`Rejected stale remote attack declaration: ${freshness.reasons.join(' ')}`,turn:game.turnNumber,type:'network-warning'});c.send({type:'network-action-rejected',reason:freshness.reasons.join(' ')});host.broadcast({type:'state',game:publicGameForNetwork()});render();return}game.combatState=structuredClone(d.combatState);const ap=game.players.find(x=>x.playerId===d.attackerId);if(ap){ap.confirmations.attackers=true;if(game.phaseGates?.combat)satisfyGate(game,'combat')}host.broadcast({type:'state',game:publicGameForNetwork()});render()}if(d?.type==='combat-defense'&&game){const defender=game.players.find(x=>x.playerId===d.defenderId),ap=game.players.find(x=>x.playerId===game.combatState?.attackers?.[0]?.playerId);if(defender&&ap){const freshness=validateRemoteStamp(game,d.stateStamp,{requireCombat:true});if(!freshness.legal){game.log.unshift({text:`Rejected stale remote block assignment from ${defender.displayName}: ${freshness.reasons.join(' ')}`,turn:game.turnNumber,type:'network-warning'});c.send({type:'combat-defense-rejected',reason:`Game state changed: ${freshness.reasons.join(' ')}`});host.broadcast({type:'state',game:publicGameForNetwork()});render();return}const legality=validateBlockAssignments({game,defender,assignments:d.assignments||[]});if(!legality.legal){game.log.unshift({text:`Rejected illegal remote block assignment from ${defender.displayName}: ${legality.reasons[0]||'illegal blocks'}`,turn:game.turnNumber,type:'network-warning'});c.send({type:'combat-defense-rejected',reason:legality.reasons[0]||'Illegal blocker assignment'});host.broadcast({type:'state',game:publicGameForNetwork()});render();return}game.combatState.blocks=game.combatState.blocks||{};game.combatState.blocks[defender.playerId]={confirmed:true,assignments:structuredClone(d.assignments||[])};defender.confirmations.blocks=true;for(const a of game.combatState.attackers.filter(x=>x.defenderId===defender.playerId))a.blocksConfirmed=true;const next=game.combatState.defenders.find(id=>!game.combatState.blocks?.[id]?.confirmed);game.combatState.waitingFor=next||null;if(!next)resolveCombatSet(ap);else host.broadcast({type:'state',game:publicGameForNetwork()})}}if(d?.type==='chat'){chat.push(d);host.broadcast(d);updateChatBadge()}if(d?.type==='approval-request')beginHostApproval(d);if(d?.type==='approval-vote')recordHostVote(d.requestId,d.voterId,d.vote)},onStatus:s=>{const el=$('#networkStatus');if(el)el.textContent=`Network: ${s}`}});
    network={host,ready,privateBundle:null,localPlayerId:null,role:neutralHost?'host':'player-host'};
    async function prepareLocal(){if(neutralHost)return;localBundle=await buildNetworkPrivatePlayer(0);if(localBundle.player.settings?.handTracking)await configurePrivateOpeningHand(localBundle);network.privateBundle=localBundle;network.localPlayerId=localBundle.player.playerId;const cmds=localBundle.commanderDefs.map(d=>d.name).filter(Boolean);await recordDeckSelection({playerName:localBundle.player.displayName,deckId:localBundle.player.deck?.savedDeckId||localBundle.player.deck?.sourceId,deckName:localBundle.player.deck?.sourceName||'Private network deck',commander1:cmds[0]||'',commander2:cmds[1]||'',source:localBundle.player.deck?.sourceType||'network'});renderSeats()}
    function renderSeats(){const total=+$('#hostSeats').value,remoteNeed=total-(neutralHost?0:1);const rows=neutralHost?`<div class="seat-row"><b>HOST / JUDGE</b><span class="good">NEUTRAL · PUBLIC VIEW</span></div>`:(localBundle?`<div class="seat-row"><b>${esc(localBundle.player.displayName)}</b><span class="good">PLAYER 1 · READY</span></div>`:`<div class="seat-row"><b>PLAYER 1</b><span>CONFIGURE BEFORE START</span></div>`);$('#seatList').innerHTML=rows+[...ready.values()].map(x=>`<div class="seat-row"><b>${esc(x.descriptor.displayName)}</b><span class="good">READY</span></div>`).join('');$('#hostStart').disabled=ready.size!==remoteNeed||(!neutralHost&&!localBundle)}
    $('#hostSeats').onchange=renderSeats;renderSeats();
    if(!neutralHost){const prep=document.createElement('button');prep.id='hostLocalReady';prep.className='primary';prep.textContent='READY PLAYER 1';$('#networkActions').prepend(prep);prep.onclick=async()=>{try{prep.disabled=true;await prepareLocal();prep.textContent='PLAYER 1 READY'}catch(e){prep.disabled=false;$('#netConfigStatus').textContent=e.message}}}
    $('#hostStart').onclick=()=>{const desc=[...(localBundle?[publicDescriptor(localBundle)]:[]),...[...ready.values()].map(x=>x.descriptor)];const players=desc.map((d,i)=>({...d,seat:i}));game=initializeGame({players,mode:selectedMode,deviceMode:'multi-device'});game.cardDefinitions={};for(const d of desc)Object.assign(game.cardDefinitions,d.commanderDefinitions||{});if(localBundle)Object.assign(game.cardDefinitions,localBundle.defs||{});game.status='active';game.rulesConfig=normalizeRulesConfig(pendingRules);game.players.forEach(p=>p.life=Number(game.rulesConfig.startingLife||40));game.multiplayer={roomCode:code,neutralHost,hostRole:neutralHost?'judge':'player-host',hostPlayerId:localBundle?.player.playerId||null};engine=createAutosavingEngine(game);if(localBundle)game=mergeOwnPrivate(game);save();host.broadcast({type:'start',game:publicGameForNetwork()});$('#networkDialog').close();showGame();toast(neutralHost?'Host / Judge table started':'Multiplayer game started')};
    $('#networkCancel').onclick=()=>{host.destroy();network=null;$('#networkDialog').close()}
  }catch(e){$('#networkStatus').textContent=e.message}
}
async function openJoinMulti(){
  selectedMode=$('.tracking-choice.active')?.dataset.mode||'fully-tracked';$('#networkTitle').textContent='JOIN MULTI-DEVICE';$('#networkContent').innerHTML=`<label>Room Code<input id="joinCode" maxlength="6" autocapitalize="characters"></label><div id="joinStatus"></div>`;$('#networkActions').innerHTML='<button class="dialog-close">CANCEL</button><button id="joinNow" class="primary">CONNECT</button>';$('#networkDialog').showModal();$('#networkDialog .dialog-close').onclick=()=>$('#networkDialog').close();
  $('#joinNow').onclick=async()=>{const code=$('#joinCode').value.trim().toUpperCase();$('#joinStatus').textContent='Connecting…';try{const client=await joinHostNetwork(code,{onData:async d=>{if(d.type==='welcome'){selectedMode=d.mode||selectedMode;$('#networkContent').innerHTML=`<div class="network-code">${code}</div>${networkSetupHtml('PLAYER')}<div id="joinStatus">Connected. Configure your private player.</div>`;$('#networkActions').innerHTML='<button id="remoteReady" class="primary">READY</button>';bindNetworkSaved();$('#remoteReady').onclick=async()=>{try{const bundle=await buildNetworkPrivatePlayer(0);if(bundle.player.settings?.handTracking)await configurePrivateOpeningHand(bundle);network.privateBundle=bundle;network.localPlayerId=bundle.player.playerId;const cmds=bundle.commanderDefs.map(d=>d.name).filter(Boolean);await recordDeckSelection({playerName:bundle.player.displayName,deckId:bundle.player.deck?.savedDeckId||bundle.player.deck?.sourceId,deckName:bundle.player.deck?.sourceName||'Private network deck',commander1:cmds[0]||'',commander2:cmds[1]||'',source:bundle.player.deck?.sourceType||'network'});client.send({type:'ready',descriptor:publicDescriptor(bundle)});$('#networkDialog').showModal();$('#remoteReady').disabled=true;$('#joinStatus').textContent='Ready. Waiting for host to start.'}catch(e){$('#netConfigStatus').textContent=e.message}}}if(d.type==='start'){game=mergeOwnPrivate(d.game);engine=createAutosavingEngine(game);save();$('#networkDialog').close();showGame();toast('Joined multi-device game')}if(d.type==='combat-defense-rejected'){toast(d.reason||'Host rejected those blocker assignments.',true)}if(d.type==='network-action-rejected'){toast(`Action not applied: ${d.reason||'game state changed'}`,true)}if(d.type==='state'){game=mergeOwnPrivate(d.game);engine=createAutosavingEngine(game);render();if(game.status==='complete'&&!game.completionNoticeShown)setTimeout(()=>finalizeAutomaticCompletion(),0);if(game.combatState?.waitingFor===network?.localPlayerId&&!game.combatState?.blocks?.[network.localPlayerId]?.confirmed){const ap=game.players.find(x=>x.playerId===game.combatState?.attackers?.[0]?.playerId);if(ap)setTimeout(()=>beginNextDefense(ap),0)}}if(d.type==='chat'){chat.push(d);updateChatBadge()}if(d.type==='approval-request'&&d.requesterId!==network?.localPlayerId)showApprovalVote(d);if(d.type==='approval-result')handleApprovalResult(d)},onStatus:s=>{const el=$('#joinStatus');if(el)el.textContent=`Network: ${s}`}});network={client,privateBundle:null,localPlayerId:null};client.send({type:'hello'})}catch(e){$('#joinStatus').textContent=e.message}}
}
function applySharedNetworkAction(action){if(!game)return;const p=game.players.find(x=>x.playerId===action.playerId);if(!p)return;if(['phase','end-turn','concede'].includes(action.type)){engine=createAutosavingEngine(game);commitAction(action);render()}}
function openChat(){const lines=chat.map(x=>`<div class="chat-line"><b>${esc(x.name||'Table')}:</b> ${esc(x.text)}</div>`).join('');openModal('GAME CHAT',`<div class="chat-messages" id="chatMessages">${lines||'<p class="muted">No messages yet.</p>'}</div><div class="chat-compose"><input id="chatInput" maxlength="280" placeholder="Message the table…"><button id="chatSend">SEND</button></div>`,[{label:'CLOSE',onClick:closeModal}]);$('#chatBadge').hidden=true;$('#chatSend').onclick=()=>{const text=$('#chatInput').value.trim();if(!text)return;const row={type:'chat',name:activePlayer()?.displayName||'Player',text,at:Date.now()};chat.push(row);network?.host?.broadcast?.(row);network?.client?.send?.(row);openChat()}}
function updateChatBadge(){const b=$('#chatBadge');b.textContent=chat.length;b.hidden=false}
function openHelp(){
  const p=activePlayer();
  const phase=game?phaseLabel(game.phase):'Setup';
  const direction=game&&p?guidanceFor({game,player:p}):'Choose a tracking mode and start a game.';
  const advice=buildStrategyAdvice({game,player:p});
  const available=getAvailableActions({game,player:p});
  const alternatives=advice.alternatives?.length
    ?`<h4>OTHER LEGAL LINES</h4><ul>${advice.alternatives.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`
    :'<p class="muted">No alternate tracked line is currently recommended.</p>';
  const availableHtml=available.groups.map(g=>`<div class="available-actions-group"><h4>${esc(g.label)}</h4>${g.actions.map(x=>`<div class="available-action-row"><b>${esc(x.label)}</b>${x.reason?`<small>${esc(x.reason)}</small>`:''}</div>`).join('')}</div>`).join('');
  openModal('PLAYER RESCUE',`
    <div class="rescue-center">
      <section class="strategy-advisor-panel">
        <h3>STRATEGY ADVISOR</h3>
        <p class="strategy-advisor-message"><b>${esc(advice.headline)}</b></p>
        <p>${esc(advice.why)}</p>
        <p class="muted">Current phase: ${esc(phase)} • Rules-backed legal options detected: ${Number(advice.legalCount||0)}</p>
        ${alternatives}
      </section>
      <section class="available-actions-panel">
        <h3>AVAILABLE ACTIONS</h3>
        <p class="muted">Legal actions from the same rules source used by Strategy Advisor.</p>
        ${availableHtml}
      </section>
      <h3>CURRENT DIRECTION</h3><p>${esc(direction)}</p>
      <h3>QUICK LEGEND</h3>
      <p><b>Green status light</b> — healthy / no tracked status. Status icons replace the light when affected. Multiple statuses rotate every 2.6 seconds.</p>
      <p><b>Mana row</b> — mana currently available to spend. Only colors legal for the commander's color identity are shown, plus colorless where applicable.</p>
      <p><b>Battlefield zones</b> — Graveyard, Exile, Tokens, and Attachments open that player's tracked public zones.</p>
      <h3>RULES RESCUE</h3>
      <p>Commander Companion checks phase timing, mana, zone permissions, combat legality, commander tax, and tracked card restrictions. The Strategy Advisor reads those same validators; it does not bypass legality or inspect another player's hidden hand.</p>
      <h3>TURN ORDER</h3>
      <p>Untap → Upkeep → Draw → Main → Combat → Main → End. Use the player arrows to inspect one board at a time without changing whose turn it is.</p>
    </div>`,[])
}

async function openProfileEditor(){await userDataReady;const p=loadProfile(),a=p.account||{},decks=listDecks();openModal('MY ACCOUNT — PROFILE EDITOR',`<div class="profile-editor-preview"><div class="profile-emblem">${esc(a.avatarGlyph||'CC')}</div><div><h3>${esc(a.displayName||'COMMANDER')}</h3><p>${esc(a.tagline||'Customize your Commander Companion identity.')}</p></div></div><label>PLAYER NAME<input id="accountDisplayName" maxlength="32" value="${esc(a.displayName||'')}" placeholder="Player name"></label><label>PROFILE TAGLINE<input id="accountTagline" maxlength="80" value="${esc(a.tagline||'')}" placeholder="A short table motto or note"></label><label>PROFILE EMBLEM<select id="accountAvatarGlyph">${['CC','♜','◆','✦','⚔','☄'].map(x=>`<option value="${x}" ${x===(a.avatarGlyph||'CC')?'selected':''}>${x}</option>`).join('')}</select></label><label>DEFAULT PLAYER NAMES<input id="accountPlayerNames" value="${esc((a.preferredPlayerNames||[]).join(', '))}" placeholder="Player 1, Player 2, Player 3"></label><label>FAVORITE DECK<select id="accountFavoriteDeck"><option value="">None</option>${decks.map(d=>`<option value="${esc(d.id)}" ${d.id===a.favoriteDeckId?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label><p class="muted">Profile identity and deck defaults are saved durably on this device and automatically populate future game setup.</p>`,[{label:'CANCEL',onClick:closeModal},{label:'SAVE PROFILE',className:'primary',onClick:async()=>{try{const displayName=$('#accountDisplayName').value.trim();if(!displayName)return toast('Enter a player name.',true);await saveAccountProfile({displayName,tagline:$('#accountTagline').value,avatarGlyph:$('#accountAvatarGlyph').value,preferredPlayerNames:$('#accountPlayerNames').value.split(',').map(x=>x.trim()).filter(Boolean),favoriteDeckId:$('#accountFavoriteDeck').value});closeModal();toast('Profile saved')}catch(e){toast(e.message,true)}}}])}
async function openPlayerStats(){
  await userDataReady;
  const p=loadProfile(),players=Object.values(p.players||{});
  const winRate=p.games?Math.round((p.wins/p.games)*100):0;
  const mostPlayed=Object.values(p.decks||{}).sort((x,y)=>Number(y.games||0)-Number(x.games||0))[0];
  openModal('MY ACCOUNT — PLAYER STATS',`
    <div class="stats-summary-grid">
      <div><b>${p.games||0}</b><small>GAMES</small></div>
      <div><b>${p.wins||0}</b><small>WINS</small></div>
      <div><b>${winRate}%</b><small>WIN RATE</small></div>
      <div><b>${p.milestones?.length||0}</b><small>MILESTONES</small></div>
    </div>
    ${mostPlayed?`<p class="muted">Most-tracked saved deck: <b>${esc(mostPlayed.name||mostPlayed.id)}</b></p>`:''}
    <h3>PLAYER HISTORY</h3>
    ${players.map(x=>{
      const wr=x.games?Math.round((x.wins/x.games)*100):0;
      const decks=Object.values(x.decks||{}).sort((m,n)=>Number(n.games||n.selections||0)-Number(m.games||m.selections||0));
      return `<div class="zone-row"><h3>${esc(x.name)}</h3><p>${x.games||0} games • ${x.wins||0} wins • ${wr}% win rate</p>${decks.slice(0,3).map(d=>`<p class="muted"><b>${esc(d.name||d.id)}</b> • games ${d.games||0} • selected ${d.selections||0}${d.wins!=null?` • wins ${d.wins||0}`:''}</p>`).join('')}</div>`;
    }).join('')||'<p class="muted">Stats appear after completed games.</p>'}
    <h3>MILESTONES</h3>
    ${p.milestones?.map(x=>`<span class="status-pill">${esc(x)}</span>`).join(' ')||'<p class="muted">No milestones yet.</p>'}
  `,[]);
}
async function openMyAccount(){await userDataReady;openModal('MY ACCOUNT',`<p>Use your profile to speed up game setup and manage your Commander collection.</p><div class="counter-grid"><button id="accountProfileEdit">PROFILE EDITOR</button><button id="accountDeckEditor">DECK EDITOR</button><button id="accountPlayerStats">PLAYER STATS</button><button id="accountBackupSave">SAVE PROFILE FILE</button><button id="accountBackupLoad">LOAD PROFILE FILE</button></div><p class="muted">Profile files include your profile, saved decks, player history, milestones, awards, and preferred setup data. Save the file to Files or iCloud Drive to restore after clearing browser data or to move it to another device.</p>`,[]);$('#accountProfileEdit').onclick=openProfileEditor;$('#accountDeckEditor').onclick=()=>{closeModal();openDeckEditor()};$('#accountPlayerStats').onclick=openPlayerStats;$('#accountBackupSave').onclick=async()=>{try{const name=await saveProfileBackupFile();toast(`Profile backup ready: ${name}`)}catch(e){if(e?.name!=='AbortError')toast(e.message||'Profile backup could not be created.',true)}};$('#accountBackupLoad').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.ccsave,application/json';input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;await restoreProfileBackupFile(file);toast('Profile restored. Reloading…');setTimeout(()=>location.reload(),700)}catch(e){toast(e.message||'Profile backup could not be restored.',true)}};input.click()}}
async function openProfile(){await userDataReady;const p=loadProfile(),a=p.account||{};const players=Object.values(p.players||{});const decks=Object.values(p.decks||{});openModal('PLAYER PROFILE',`<div class="profile-editor-preview"><div class="profile-emblem">${esc(a.avatarGlyph||'CC')}</div><div><h3>${esc(a.displayName||'COMMANDER COMPANION PROFILE')}</h3><p>${esc(a.tagline||'')} ${a.tagline?'• ':''}Games ${p.games} • Wins ${p.wins}</p></div></div><button id="profileQuickEdit" class="profile-quick-edit">EDIT PROFILE</button><h3>PLAYERS</h3>${players.map(x=>`<div class="zone-row"><h3>${esc(x.name)}</h3><p>${x.games||0} games • ${x.wins||0} wins</p>${Object.values(x.decks||{}).map(d=>`<p><b>${esc(d.name||d.id)}</b>${d.commander1?` — ${esc(d.commander1)}${d.commander2?` + ${esc(d.commander2)}`:''}`:''} • selected ${d.selections||0} • games ${d.games||0}</p>`).join('')||'<p class="muted">No deck history yet.</p>'}</div>`).join('')||'<p class="muted">Player history appears after deck selection or completed games.</p>'}<h3>SAVED / CREATED DECKS</h3>${decks.map(d=>`<p><b>${esc(d.name)}</b>${d.commander1?` — ${esc(d.commander1)}${d.commander2?` + ${esc(d.commander2)}`:''}`:''}</p>`).join('')||'<p class="muted">Deck Editor saves will appear here.</p>'}<h3>MILESTONES</h3>${p.milestones?.map(x=>`<span class="status-pill">${esc(x)}</span>`).join(' ')||'<p class="muted">Play games to earn milestones.</p>'}<h3>AWARDS</h3>${Object.entries(p.awards||{}).map(([k,v])=>`<p>${esc(k)} × ${v}</p>`).join('')||'<p class="muted">No awards yet.</p>'}`,[]);$('#profileQuickEdit').onclick=openProfileEditor}
function openLearn(){openModal('LEARN COMMANDER',`<h3>THE BASICS</h3><p>Commander is normally a multiplayer singleton format with a legendary commander, a 100-card deck, 40 starting life, and commander color identity deckbuilding restrictions.</p><h3>YOUR TURN</h3><p>Untap, upkeep, draw, Main 1, combat, Main 2, and ending. Commander Companion keeps phase progression and required tracked confirmations in one place.</p><h3>COMMANDER TAX</h3><p>Each time a commander is cast again from the command zone, it costs two additional generic mana for each previous command-zone cast.</p><h3>TRACKING</h3><p>Full Play Tracking uses the exact deck and hand. Freeplay keeps rules guidance while allowing flexible global card identification and setup.</p>`,[{label:'CLOSE',onClick:closeModal}])}
async function startPlaytest(){
  selectedMode='fully-tracked';
  openModal('PLAYTEST — AARON VS LEX','<p>Loading the Turtle Power and Wakanda Forever preconstructed decks through the normal V0.7 deck/setup pipeline…</p><div id="playtestStatus" class="progress-text">Loading precon catalog…</div>',[{label:'CANCEL',onClick:closeModal}]);
  try{
    const catalog=await listPrecons();
    const turtle=catalog.find(x=>/turtle power/i.test(x.name));
    const wakanda=catalog.find(x=>/wakanda forever/i.test(x.name));
    if(!turtle||!wakanda)throw new Error('The live precon catalog did not return both Turtle Power and Wakanda Forever.');
    $('#playtestStatus').textContent='Loading Turtle Power…';const a=await loadPrecon(turtle.fileName);
    $('#playtestStatus').textContent='Loading Wakanda Forever…';const l=await loadPrecon(wakanda.fileName);
    closeModal();openSetup();$('#playerCount').value='2';renderSetupPanels();
    const panels=$$('[data-player-setup]');
    panels[0].querySelector('.setup-name').value='Aaron';panels[0].querySelector('.setup-deck').value=a.deckList;panels[0].querySelector('.setup-cmd1').value=a.commanders[0]||'Leonardo, the Balance';panels[0].querySelector('.setup-cmd2').value=a.commanders[1]||'Splinter, the Mentor';
    panels[1].querySelector('.setup-name').value='Lex';panels[1].querySelector('.setup-deck').value=l.deckList;panels[1].querySelector('.setup-cmd1').value=l.commanders[0]||"T'Challa, the Black Panther";panels[1].querySelector('.setup-cmd2').value=l.commanders[1]||'';
    await syncSetupSecondary(panels[0]);await syncSetupSecondary(panels[1]);
    $('#setupProgress').textContent='Playtest fixture loaded through normal setup. Starting…';await startSetup();
  }catch(e){const el=$('#playtestStatus');if(el)el.textContent=e.message;else toast(e.message,true)}
}
// Landing + utilities
function rulesFromModeSetup(){return normalizeRulesConfig({commanderDamage:$('#modeRuleCommanderDamage')?.checked!==false,poisonLoss:$('#modeRulePoisonLoss')?.checked!==false,startingLife:Math.max(1,Number($('#modeRuleStartingLife')?.value||40)),commanderTax:$('#modeRuleCommanderTax')?.checked!==false,bannedList:$('#modeRuleBanned')?.checked!==false,colorIdentity:$('#modeRuleColorIdentity')?.checked!==false,singleton:$('#modeRuleSingleton')?.checked!==false,wishes:!!$('#modeRuleWishes')?.checked,mulligan:$('#modeRuleMulligan')?.value||'commander',ruleZeroOverrides:!!$('#modeRuleZero')?.checked,firstPlayerDraw:$('#modeRuleFirstDraw')?.checked!==false,endTurnConfirm:$('#modeRuleEndConfirm')?.checked!==false,allowExtraLand:!!$('#modeRuleExtraLand')?.checked,freeplayOverrides:selectedMode==='freeplay'&&$('#modeRuleOverride')?.checked!==false})}
function blankPlayer(i,mode){const playerId=`p${i+1}-${crypto.randomUUID().slice(0,6)}`,deck=normalizeDeck({ownerId:playerId,sourceType:mode,sourceName:mode==='table-tracker'?'Table Tracker':'Freeplay Sandbox',manifest:[]});deck.virtualDrawEnabled=mode==='freeplay'&&!!$('#modeVirtualHand')?.checked;return {playerId,displayName:`Player ${i+1}`,guidanceLevel:'none',settings:{handTracking:deck.virtualDrawEnabled},deck,commanders:[],privateHandOwnership:playerId}}
function startLightweightMode(mode){const n=Math.max(2,Math.min(6,+$('#modePlayerCount').value||2)),players=Array.from({length:n},(_,i)=>{const p=blankPlayer(i,mode),entered=mode==='table-tracker'?$('#modeTrackerName'+i)?.value.trim():'';if(entered)p.displayName=entered;return p});game=initializeGame({players,mode,deviceMode:'single-device'});game.cardDefinitions={};game.status='active';game.rulesConfig=normalizeRulesConfig(pendingRules);game.players.forEach(p=>p.life=Number(game.rulesConfig.startingLife||40));engine=createAutosavingEngine(game);save();$('#modeSetupDialog').close();if(mode==='table-tracker')openTabletop();else showGame();toast(mode==='freeplay'?'Freeplay sandbox started':'Table Tracker started')}
function openModeSetup(mode){selectedMode=mode;const title=mode==='fully-tracked'?'FULL PLAY TRACKING':mode==='freeplay'?'FREEPLAY':'TABLE TRACKER';$('#modeSetupTitle').textContent=`${title} — SETUP`;let body=`<div class="setup-stage"><h3>DEVICE SETUP</h3>`;
 if(mode==='fully-tracked')body+=`<label>Play Configuration<select id="modeDevice"><option value="single">SINGLE DEVICE</option><option value="multi-create">MULTIPLAYER — CREATE GAME</option><option value="multi-join">MULTIPLAYER — JOIN GAME</option></select></label><label id="modeHostWrap" class="check" hidden><input id="modeHostJudge" type="checkbox"> Host / Judge device</label><p id="modeHostHint" class="muted" hidden>Host is a neutral non-player GM. Public state only. Up to 1 host + 6 player devices.</p>`;
 else body+=`<p class="mode-lock">SINGLE DEVICE</p><label>Players<select id="modePlayerCount">${[2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></label>${mode==='table-tracker'?'<div id="modeTrackerNames" class="tracker-name-setup"></div>':''}${mode==='freeplay'?'<label class="check"><input id="modeVirtualHand" type="checkbox"> Virtual Hand (optional)</label>':''}`;
 body+=`</div><div class="setup-stage"><h3>RULE MODIFICATIONS</h3><p class="muted">Official Commander defaults are enabled. Change only what your table wants to house-rule.</p><label class="check"><input id="modeRuleCommanderDamage" type="checkbox" checked> Commander Damage loss — 21 from one commander</label><label class="check"><input id="modeRulePoisonLoss" type="checkbox" checked> Poison loss — 10 counters</label><label>Starting Life<input id="modeRuleStartingLife" type="number" min="1" max="999" value="40"></label><label class="check"><input id="modeRuleCommanderTax" type="checkbox" checked> Commander Tax</label><label class="check"><input id="modeRuleBanned" type="checkbox" checked> Banned-list enforcement</label><label class="check"><input id="modeRuleColorIdentity" type="checkbox" checked> Color-identity restriction</label><label class="check"><input id="modeRuleSingleton" type="checkbox" checked> Singleton restriction</label><label class="check"><input id="modeRuleWishes" type="checkbox"> Allow outside-the-game / Wish effects <span class="house-tag">HOUSE RULE</span></label><label>Mulligan Rule<select id="modeRuleMulligan"><option value="commander">Commander / first free mulligan</option><option value="london">London mulligan only</option><option value="free">Free mulligans (house rule)</option></select></label><label class="check"><input id="modeRuleZero" type="checkbox"> Rule Zero / normally illegal play overrides <span class="house-tag">HOUSE RULE</span></label><label class="check"><input id="modeRuleFirstDraw" type="checkbox" checked> Track draw confirmation</label><label class="check"><input id="modeRuleEndConfirm" type="checkbox" checked> Confirm End Turn</label><label class="check"><input id="modeRuleExtraLand" type="checkbox"> Allow one additional normal land play <span class="house-tag">HOUSE RULE</span></label>${mode==='freeplay'?'<label class="check"><input id="modeRuleOverride" type="checkbox" checked> Allow deliberate Freeplay legality overrides</label>':''}</div>`;
 $('#modeSetupContent').innerHTML=body;$('#modeSetupActions').innerHTML='<button class="dialog-close">CANCEL</button><button id="modeProceed" class="primary">PROCEED</button>';$('#modeSetupDialog').showModal();$('#modeSetupDialog .dialog-close').onclick=()=>$('#modeSetupDialog').close();
 const dev=$('#modeDevice');if(dev)dev.onchange=()=>{const create=dev.value==='multi-create';$('#modeHostWrap').hidden=!create;$('#modeHostHint').hidden=!create};
 if(mode==='table-tracker'){const renderTrackerNames=()=>{const n=Math.max(2,Math.min(6,+$('#modePlayerCount').value||2)),wrap=$('#modeTrackerNames'),defaults=accountSetupDefaults();if(wrap)wrap.innerHTML='<h3>PLAYER NAMES</h3>'+Array.from({length:n},(_,i)=>`<label>Player ${i+1}<input id="modeTrackerName${i}" maxlength="32" value="${esc(defaults.playerNames[i]||`Player ${i+1}`)}"></label>`).join('')};$('#modePlayerCount').onchange=renderTrackerNames;renderTrackerNames()}
 $('#modeProceed').onclick=()=>{pendingRules=rulesFromModeSetup();if(mode==='fully-tracked'){const choice=$('#modeDevice').value,host=!!$('#modeHostJudge')?.checked;$('#modeSetupDialog').close();if(choice==='single')return openSetup();if(choice==='multi-join')return openJoinMulti();return openMultiplayerSetup(host)}startLightweightMode(mode)};
}
function openGameModeChooser(){
  const dialog=$('#gameModeDialog');
  if(!dialog)return toast('Game mode menu could not open.',true);
  try{document.activeElement?.blur?.()}catch{}
  if(dialog.open)dialog.close();
  dialog.showModal();
}
function closeGameModeChooser(){const dialog=$('#gameModeDialog');try{document.activeElement?.blur?.()}catch{}if(dialog?.open)dialog.close()}
$('#startGameBtn').onclick=openGameModeChooser;
$('#gameModeClose')?.addEventListener('click',closeGameModeChooser);
$('#modeSetupBack')?.addEventListener('click',()=>{if($('#modeSetupDialog')?.open)$('#modeSetupDialog').close();openGameModeChooser()});
$('#setupDialogBack')?.addEventListener('click',()=>{if($('#setupDialog')?.open)$('#setupDialog').close();openModeSetup(selectedMode||'fully-tracked')});
$('#deckDialogBack')?.addEventListener('click',()=>{if($('#deckDialog')?.open)$('#deckDialog').close()});
$('#networkDialogBack')?.addEventListener('click',()=>{if($('#networkDialog')?.open)$('#networkDialog').close()});
$$('[data-game-mode]').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.gameMode;closeGameModeChooser();openModeSetup(mode)}));
$$('[data-launch-mode]').forEach(b=>b.onclick=()=>openModeSetup(b.dataset.launchMode));
async function refreshContinueButton(){const b=$('#continueBtn');if(!b)return;let ok=hasValidSave(localStorage,STORAGE_KEY);if(!ok)ok=await hasDurableSave(STORAGE_KEY);b.disabled=!ok;b.setAttribute('aria-disabled',String(!ok))}
async function repairLegacyCombatDefinitions(restored){const missing=Object.values(restored?.cardDefinitions||{}).filter(d=>/Creature/i.test(d?.typeLine||'')&&(d.power==null||d.toughness==null));for(const d of missing){try{const fresh=await resolveNamedCard(d.name);restored.cardDefinitions[d.definitionId]={...d,...fresh}}catch{}}return restored}
async function continueSavedGame(){try{
  const recovered=await loadBestAvailableSave(localStorage,STORAGE_KEY);
  const restored=recovered?.game;
  if(!restored)return toast('No compatible autosave exists yet.',true);
  await repairLegacyCombatDefinitions(restored);
  game=restored;network=null;engine=createAutosavingEngine(game);selectedMode=game.mode||'fully-tracked';if(game.status==='complete'&&!game.completionRecordedAt)setTimeout(()=>finalizeAutomaticCompletion({showNotice:false}),0);
  // Immediately refresh both save tiers after migration/repair so the recovered state becomes authoritative.
  save();
  if(game.openingHandState?.active)return openOpeningHands(Number(game.openingHandState.index||0));
  if(['table-tracker','tabletop'].includes(game.mode))openTabletop();else showGame();
  toast(`Restored ${recovered.source||'autosave'} — turn ${game.turnNumber}, ${phaseLabel(game.phase)}.`);
}catch(e){console.error('Continue Game failed:',e);toast(e.message||'Autosaved game could not be restored.',true);refreshContinueButton()}}
$('#continueBtn').onclick=continueSavedGame;$('#myAccountBtn').onclick=openMyAccount;$('#versionNotesBtn').onclick=()=>$('#versionNotesInline').scrollIntoView({behavior:'smooth'});$('#learnBtn').onclick=openLearn;$('#helpLandingBtn').onclick=openHelp;
async function openPersistentGameLogs(){
  await userDataReady;
  const p=loadProfile(),history=p.history||[];
  const activeRows=(game?.log||[]).slice(0,25);
  const activeHtml=game?`<section class="persistent-log-section"><h3>ACTIVE / RECOVERED GAME</h3><p class="muted">Turn ${Number(game.turnNumber||0)} • ${esc(phaseLabel(game.phase))}</p>${activeRows.map(e=>`<div class="persistent-log-row"><b>TURN ${Number(e.turn||game.turnNumber||0)}</b><span>${esc(e.text||'Game event')}</span></div>`).join('')||'<p class="muted">No active game events recorded yet.</p>'}</section>`:'';
  const completed=history.map((h,i)=>{
    const players=(h.players||[]).map(x=>esc(x.name||'Player')).join(' • ');
    const winner=esc(h.winnerName||(h.players||[]).find(x=>x.playerId===h.winnerId)?.name||'Unknown');
    const date=h.at?new Date(h.at).toLocaleString():'Unknown date';
    const awards=(h.awards||[]).map(x=>`${esc(x.label)}${x.playerName?` — ${esc(x.playerName)}`:''}`).join(' • ');
    return `<div class="persistent-game-card">
      <div><b>${winner} WON</b><small>${esc(date)}</small></div>
      <p>${players||'Players unavailable'}${h.turnNumber?` • ${Number(h.turnNumber)} turns`:''}</p>
      ${awards?`<p class="muted">${awards}</p>`:''}
    </div>`;
  }).join('');
  openModal('GAME LOGS',`${activeHtml}<section class="persistent-log-section"><h3>COMPLETED GAMES</h3>${completed||'<p class="muted">Completed-game history will appear here.</p>'}</section>`,[]);
}

function openLandingCommandMenu(){openModal('COMMAND CENTER',`<div class="landing-command-grid"><button id="cmdProfile">PROFILE</button><button id="cmdDecks">MY DECKS</button><button id="cmdDeckBuilder">DECK BUILDER</button><button id="cmdCardSearch">CARD SEARCH</button><button id="cmdLearn">LEARN COMMANDER</button><button id="cmdGameLogs">GAME LOGS</button><button id="cmdSettings">SETTINGS</button></div>`);$('#cmdProfile').onclick=()=>{closeModal();openMyAccount()};$('#cmdDecks').onclick=()=>{closeModal();openDeckEditor()};$('#cmdDeckBuilder').onclick=()=>{closeModal();openDeckEditor()};$('#cmdCardSearch').onclick=()=>{closeModal();openGlobalPicker()};$('#cmdLearn').onclick=()=>{closeModal();openLearn()};$('#cmdGameLogs').onclick=()=>{closeModal();openPersistentGameLogs()};$('#cmdSettings').onclick=()=>{closeModal();openSettings()}}
$('#landingMenuBtn')&&($('#landingMenuBtn').onclick=openLandingCommandMenu);$('#profileLandingBtn')&&($('#profileLandingBtn').onclick=openMyAccount);$('#myDecksVisibleBtn')&&($('#myDecksVisibleBtn').onclick=openDeckEditor);$('#deckBuilderVisibleBtn')&&($('#deckBuilderVisibleBtn').onclick=openDeckEditor);
$('#settingsLandingBtnBottom')&&($('#settingsLandingBtnBottom').onclick=openSettings);$('#myDecksLandingBtn')&&($('#myDecksLandingBtn').onclick=openDeckEditor);$('#deckBuilderLandingBtn')&&($('#deckBuilderLandingBtn').onclick=openDeckEditor);$('#cardSearchLandingBtn')&&($('#cardSearchLandingBtn').onclick=()=>openGlobalPicker());$('#gameLogsLandingBtn')&&($('#gameLogsLandingBtn').onclick=openPersistentGameLogs);$('#joinGameLandingBtn')&&($('#joinGameLandingBtn').onclick=()=>{const b=document.querySelector('[data-launch-mode=\"fully-tracked\"]');b?.click()});

refreshContinueButton();window.addEventListener('pageshow',refreshContinueButton);window.addEventListener('pagehide',save);window.addEventListener('beforeunload',save);window.__ccAppReady=true;/* Service-worker registration is intentionally disabled in V0.7.23 while startup reliability is stabilized. The bootstrap removes legacy workers/caches before loading modules. */

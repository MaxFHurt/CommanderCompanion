// The single owner of a running game. Screens and remote devices never change the game
// directly: they send an intent here, the controller checks who is asking, applies it,
// lets the game settle, and tells listeners to redraw.

import { snapshotGame, restoreGameSnapshot } from '../engine/effects.js';
import { GameError, log, playerById } from './helpers.js';
import { takeMulligan, keepHand } from './setup.js';
import {
  startOp, answerOp, cancelOp, passPriority, nextPhase, declareAttack, declareBlocks, discardCards, finishGuided, settle
} from './flow.js';
import { applyEdit } from './edits.js';
import { commit } from './ops.js';
import { timingBlock, stackTop } from './legal.js';
import { buildView, actorId } from './view.js';

const MAX_UNDO = 30;
const NO_UNDO = new Set(['answer', 'cancel', 'chat', 'vote', 'vote-request', 'undo']);

export function createController(game, { onChange = () => {} } = {}) {
  const undoStack = [];
  const listeners = new Set([onChange]);
  let timer = null;

  function canEdit(actor) {
    if (actor.isHost || game.mode === 'freeplay') return true;
    const top = stackTop(game);
    return !!(game.flow.guided && top && top.controllerId === actor.playerId);
  }

  function requirePlayer(actor) {
    const p = playerById(game, actor.playerId);
    if (!p) throw new GameError('This device is watching the game and is not a player.');
    if (p.eliminated) throw new GameError('This player is out of the game.');
    return p;
  }

  function apply(intent, actor) {
    const override = !!actor.isHost && !!intent.as;
    const who = { ...actor, playerId: override ? intent.as : actor.playerId };
    const force = !!intent.force && (actor.isHost || game.mode === 'freeplay' || intent.approved === true);
    switch (intent.type) {
      case 'mulligan': takeMulligan(game, requirePlayer(who).playerId); break;
      case 'keep': keepHand(game, requirePlayer(who).playerId, intent.bottom || []); break;
      case 'play':
      case 'activate': {
        const p = requirePlayer(who);
        const block = timingBlock(game, p.playerId);
        if (block && !(force && !game.flow.op)) throw new GameError(block);
        startOp(game, intent.type, p.playerId, { instanceId: intent.instanceId, faceIndex: intent.faceIndex, abilityId: intent.abilityId, color: intent.color, force });
        if (game.flow.priority?.holderId === p.playerId && !game.flow.op) { /* responding: a new round opens when the game settles */ }
        break;
      }
      case 'answer': answerOp(game, who.playerId, intent.key, intent.value, { override: actor.isHost && game.deviceMode !== 'multi-device' || override }); break;
      case 'cancel': cancelOp(game, who.playerId, { override: !!actor.isHost }); break;
      case 'pass': passPriority(game, who.playerId, { override }); break;
      case 'next-phase': nextPhase(game, who.playerId, { override }); break;
      case 'end-turn': nextPhase(game, who.playerId, { override, endTurn: true }); break;
      case 'attack': declareAttack(game, who.playerId, intent.attacks || [], { override: force }); break;
      case 'block': declareBlocks(game, who.playerId, intent.assignments || [], { override: force }); break;
      case 'discard': discardCards(game, who.playerId, intent.ids || [], { override }); break;
      case 'guided-done': finishGuided(game, who.playerId, { override: !!actor.isHost }); break;
      case 'edit': {
        if (!canEdit(actor)) throw new GameError('Only the host can change the game directly in Guided Play.');
        const name = actor.isHost && !playerById(game, actor.playerId) ? 'Host' : (playerById(game, actor.playerId)?.displayName || 'Host');
        applyEdit(game, intent.edit || {}, name);
        break;
      }
      case 'concede': {
        const p = requirePlayer(who);
        commit(game, { type: 'concede', playerId: p.playerId, silent: true });
        break;
      }
      case 'end-game': {
        if (!actor.isHost && game.mode !== 'freeplay') throw new GameError('Only the host can end the game.');
        game.status = 'complete';
        game.winner = intent.winnerId || null;
        game.result = intent.winnerId ? 'winner' : 'ended';
        game.completionReason = 'ended-by-host';
        break;
      }
      case 'veto': {
        if (!actor.isHost) throw new GameError('Only the host can veto a play.');
        veto(intent.stackId);
        break;
      }
      case 'vote-request': {
        const p = requirePlayer(who);
        if (game.flow.vote) throw new GameError('The table is already voting on something.');
        const inner = intent.intent || {};
        if (!['play', 'activate', 'attack', 'block'].includes(inner.type)) throw new GameError('That action cannot be put to a vote.');
        game.flow.vote = { id: `vote:${Date.now()}`, requesterId: p.playerId, intent: inner, reason: String(intent.reason || '').slice(0, 200), label: String(intent.label || 'an unusual play').slice(0, 80), votes: {} };
        log(game, `${p.displayName} asks the table to allow ${game.flow.vote.label}.`, { type: 'vote' });
        tallyVote(actor);
        break;
      }
      case 'vote': {
        const v = game.flow.vote;
        if (!v) throw new GameError('There is nothing to vote on.');
        if (actor.isHost && intent.decide !== undefined) { v.decided = !!intent.decide; }
        else { const p = requirePlayer(who); if (p.playerId === v.requesterId) throw new GameError('You asked for this vote.'); v.votes[p.playerId] = !!intent.approve; }
        tallyVote(actor);
        break;
      }
      case 'set-advice': {
        const p = playerById(game, actor.playerId);
        if (!p) throw new GameError('Only a player can change their advice setting.');
        p.settings = { ...(p.settings || {}), advice: !!intent.on };
        break;
      }
      case 'chat': {
        const text = String(intent.text || '').trim().slice(0, 240);
        if (!text) throw new GameError('Write a message first.');
        game.chat = game.chat || [];
        game.chat.push({ id: `chat:${Date.now()}:${game.chat.length}`, from: playerById(game, actor.playerId)?.displayName || (actor.isHost ? 'Host' : 'Spectator'), playerId: actor.playerId || null, text, at: new Date().toISOString() });
        if (game.chat.length > 200) game.chat.splice(0, game.chat.length - 200);
        break;
      }
      default:
        throw new GameError('Unknown action.');
    }
  }

  function tallyVote() {
    const v = game.flow.vote;
    if (!v) return;
    const voters = game.players.filter(p => !p.eliminated && p.playerId !== v.requesterId);
    const yes = voters.filter(p => v.votes[p.playerId] === true).length, no = voters.filter(p => v.votes[p.playerId] === false).length;
    const needed = Math.floor(voters.length / 2) + 1;
    let result = v.decided;
    if (result === undefined) {
      if (yes >= needed || !voters.length) result = true;
      else if (no >= needed || yes + no === voters.length) result = false;
    }
    if (result === undefined) return;
    game.flow.vote = null;
    const requester = playerById(game, v.requesterId);
    if (!result) { log(game, `The table did not allow ${v.label}.`, { type: 'vote' }); return; }
    log(game, `The table allows ${v.label}.`, { type: 'vote' });
    try {
      apply({ ...v.intent, force: true, approved: true }, { playerId: requester.playerId, isHost: false });
    } catch (error) {
      log(game, `${v.label} could not be done: ${error.message}`);
    }
  }

  function veto(stackId) {
    const top = (game.stack || []).find(x => x.id === stackId) || stackTop(game);
    if (!top) throw new GameError('There is nothing on the stack to veto.');
    const name = top.name || top.label || 'that play';
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (!(undoStack[i].stack || []).some(x => x.id === top.id)) {
        const keepLog = game.log, keepChat = game.chat;
        restoreGameSnapshot(game, undoStack[i]);
        undoStack.length = i;
        game.log = keepLog; game.chat = keepChat;
        log(game, `Host vetoed ${name}. The game went back to before it was played.`, { type: 'edit' });
        return;
      }
    }
    applyEdit(game, { kind: 'counter-top' }, 'Host');
  }

  function dispatch(intent, actor = { playerId: null, isHost: false }) {
    if (intent.type === 'undo') return undo(actor);
    const before = snapshotGame(game);
    try {
      if (game.status === 'complete' && !['chat', 'edit'].includes(intent.type)) throw new GameError('The game is over.');
      apply(intent, actor);
      settle(game);
    } catch (error) {
      restoreGameSnapshot(game, before);
      if (!(error instanceof GameError)) console.error('Game action failed', intent, error);
      return { ok: false, error: error?.message || 'That action could not be completed.', reasons: error?.reasons || [] };
    }
    if (!NO_UNDO.has(intent.type)) {
      undoStack.push(before);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    }
    changed();
    return { ok: true };
  }

  function undo(actor = {}) {
    if (!actor.isHost && game.mode !== 'freeplay') return { ok: false, error: 'Only the host can undo in Guided Play.' };
    const snap = undoStack.pop();
    if (!snap) return { ok: false, error: 'Nothing to undo.' };
    const chat = game.chat;
    restoreGameSnapshot(game, snap);
    game.chat = chat;
    log(game, 'The last action was undone.', { type: 'edit' });
    changed();
    return { ok: true };
  }

  function armTimer() {
    clearTimeout(timer);
    timer = null;
    const pr = game.flow?.priority, seconds = Number(game.rulesConfig?.priorityTimer || 0);
    // The response timer only runs when players are on their own devices; pass-and-play has no clock.
    if (game.deviceMode !== 'multi-device' || !pr?.holderId || !seconds || game.status === 'complete' || game.flow.op) return;
    const wait = Math.max(0, pr.since + seconds * 1000 - Date.now());
    const holder = pr.holderId;
    timer = setTimeout(() => {
      if (game.flow?.priority?.holderId !== holder || game.flow.op) return;
      log(game, `${playerById(game, holder)?.displayName || 'A player'} ran out of time and passes.`);
      dispatch({ type: 'pass', as: holder }, { playerId: null, isHost: true });
    }, wait + 50);
  }

  function changed() {
    armTimer();
    for (const fn of listeners) {
      try { fn(game); } catch (error) { console.error('Game listener failed', error); }
    }
  }

  return {
    game,
    dispatch,
    canUndo: () => undoStack.length > 0,
    canEdit,
    view: viewer => buildView(game, viewer, { canUndo: undoStack.length > 0 }),
    actorId: () => actorId(game),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() { settle(game); changed(); },
    stop() { clearTimeout(timer); listeners.clear(); }
  };
}

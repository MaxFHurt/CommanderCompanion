// The game's "what happens next" loop. After every player input the controller calls settle(),
// which keeps moving the game forward until a person has to decide something.

import { evaluateLosses, validateAttack, validateRequiredAttackers, validateBlockAssignments } from '../engine/rules.js';
import { phaseLabel } from '../engine/phase.js';
import { resolveCombat, cardHasKeyword } from '../engine/combat.js';
import { queueTriggers } from '../engine/triggers.js';
import { GameError, activePlayer, alivePlayers, defOf, log, playerById, plural, turnOrderFrom } from './helpers.js';
import { Need, makeAsk, validateAnswer } from './requirements.js';
import { OPS, commit } from './ops.js';
import { attackOptions, blockOptions, hasResponse, stackTop } from './legal.js';
import { syncAttachments } from './attachments.js';

const MAIN = ['precombat-main', 'postcombat-main'];
const COMBAT_QUEUE = () => [
  { t: 'priority', reason: 'Attackers declared' }, { t: 'blocks' },
  { t: 'priority', reason: 'Blockers declared' }, { t: 'damage' },
  { t: 'end-combat' }, { t: 'main2' }
];

// ---------------------------------------------------------------------------------------------
// Ops

export function startOp(game, type, playerId, args = {}, { system = false } = {}) {
  game.flow.op = { type, playerId, args, answers: {}, decision: null, system };
  runOp(game);
}

/** Run the current op. Leaves flow.op set (with a decision) if it still needs an answer. */
export function runOp(game) {
  const op = game.flow.op;
  if (!op) return;
  try {
    OPS[op.type](game, op, makeAsk(op));
    game.flow.op = null;
  } catch (error) {
    if (error instanceof Need) { op.decision = error.spec; return; }
    game.flow.op = null;
    if (op.system) {
      // A system step must never wedge the game: log it and move on.
      log(game, `Automatic step skipped: ${error?.message || 'unknown problem'}`);
      if (op.type === 'trigger') game.pendingTriggers = (game.pendingTriggers || []).filter(t => t.id !== op.args.triggerId);
      if (op.type === 'resolve') {
        const top = stackTop(game);
        if (top && top.id === op.args.stackId) top.guidedResolution = { title: `${top.name || 'Effect'} — resolve by hand`, oracleText: top.text || '', unsupported: [error?.message || ''] };
      }
      return;
    }
    throw error;
  }
}

export function answerOp(game, playerId, key, value, { override = false } = {}) {
  const op = game.flow.op, decision = op?.decision;
  if (!decision || decision.key !== key) throw new GameError('That choice is no longer needed.');
  if (decision.playerId !== playerId && !override) throw new GameError('That choice belongs to another player.');
  let clean;
  try { clean = validateAnswer(decision, value); } catch (error) { throw new GameError(error.message); }
  op.answers[key] = clean;
  op.decision = null;
  try {
    runOp(game);
  } catch (error) {
    throw error instanceof GameError ? error : new GameError(error?.message || 'That action could not be completed.');
  }
}

export function cancelOp(game, playerId, { override = false } = {}) {
  const op = game.flow.op;
  if (!op) return;
  if (op.system || op.decision?.cancellable === false) throw new GameError('This choice has to be made before the game can continue.');
  if (op.playerId !== playerId && !override) throw new GameError('Only the player making this play can cancel it.');
  game.flow.op = null;
}

// ---------------------------------------------------------------------------------------------
// Priority

function openPriority(game, { stackId = null, reason = '', exclude = null, startAfter = null }) {
  let order = turnOrderFrom(game, startAfter || game.activePlayerId).map(p => p.playerId);
  if (startAfter) order = [...order.slice(1), order[0]];
  if (exclude) order = order.filter(id => id !== exclude);
  game.flow.priority = { stackId, reason, order, passed: [], holderId: null, since: null };
}

/** Moves priority past everyone who cannot respond. Returns true while a player still has to answer. */
function stepPriority(game) {
  const pr = game.flow.priority;
  const autoSkip = game.rulesConfig?.autoSkip !== false;
  for (const id of pr.order) {
    if (pr.passed.includes(id)) continue;
    const holder = playerById(game, id);
    if (!holder || holder.eliminated) { pr.passed.push(id); continue; }
    if (autoSkip && !hasResponse(game, holder)) { pr.passed.push(id); continue; }
    if (pr.holderId !== id) { pr.holderId = id; pr.since = Date.now(); }
    return true;
  }
  pr.holderId = null;
  return false;
}

export function passPriority(game, playerId, { override = false } = {}) {
  const pr = game.flow.priority;
  if (!pr?.holderId) throw new GameError('Nobody needs to pass right now.');
  if (pr.holderId !== playerId && !override) throw new GameError('Another player has priority.');
  pr.passed.push(pr.holderId);
  pr.holderId = null;
}

// ---------------------------------------------------------------------------------------------
// Turn structure

function setPhase(game, phase, extra = {}) {
  commit(game, { type: 'phase', playerId: game.activePlayerId, phase, silent: true, ...extra });
}

function untapStep(game) {
  const p = activePlayer(game);
  let count = 0;
  for (const c of p.deck.battlefield) {
    if (!c.tapped) continue;
    if (/doesn['’]t untap during your untap step/i.test(defOf(game, c)?.oracleText || '')) continue;
    if ((c.temporaryEffects || []).some(e => e?.kind === 'combat-restriction' && e?.restriction === 'no-untap')) continue;
    c.tapped = false;
    count += 1;
  }
  log(game, `Turn ${game.turnNumber} — ${p.displayName}. ${count ? `${plural(count, 'permanent')} untapped.` : 'Nothing to untap.'}`, { type: 'turn', playerId: p.playerId });
  setPhase(game, 'upkeep');
}

function drawStep(game) {
  const p = activePlayer(game);
  if (!p.confirmations?.draw) {
    p.confirmations = { ...(p.confirmations || {}), draw: true };
    const skip = game.turnNumber === 1 && game.rulesConfig?.firstPlayerDraw === false;
    if (skip) log(game, `${p.displayName} skips the first draw of the game.`);
    else if (!p.deck.remainingLibrary.length) {
      p.counters.failedDraws = Number(p.counters.failedDraws || 0) + 1;
      log(game, `${p.displayName} cannot draw from an empty library.`);
      evaluateLosses(game);
    } else if (game.rulesConfig?.physicalDraw) {
      startOp(game, 'draw-choice', p.playerId, {}, { system: true });
    } else {
      commit(game, { type: 'draw', playerId: p.playerId, label: `${p.displayName} draws a card.` });
    }
    return;
  }
  setPhase(game, 'precombat-main');
}

function endTurn(game) {
  const p = activePlayer(game);
  commit(game, { type: 'end-turn', playerId: p.playerId, silent: true });
  const next = activePlayer(game);
  if (next) next.confirmations = { ...(next.confirmations || {}), draw: false };
}

/** Automatic part of the turn. Returns true if it changed something. */
function autoAdvance(game) {
  const f = game.flow, p = activePlayer(game);
  if (!p) return false;
  switch (game.phase) {
    case 'untap': untapStep(game); return true;
    case 'upkeep': setPhase(game, 'draw'); return true;
    case 'draw': drawStep(game); return true;
    case 'combat':
    case 'begin-combat':
      if (game.rulesConfig?.autoSkip !== false && !attackOptions(game, p).length) {
        log(game, `${p.displayName} has no creature that can attack — combat is skipped.`);
        setPhase(game, 'postcombat-main', { noAttackCombat: true });
        return true;
      }
      return false;
    case 'end-step': setPhase(game, 'cleanup'); return true;
    case 'cleanup': {
      const extra = p.deck.hand.length - 7;
      if (extra > 0 && game.mode !== 'freeplay') {
        if (!f.discard) f.discard = { playerId: p.playerId, need: extra };
        else f.discard.need = extra;
        return false;
      }
      f.discard = null;
      endTurn(game);
      return true;
    }
    default: return false;
  }
}

export function nextPhase(game, playerId, { override = false, endTurn: toEnd = false } = {}) {
  const f = game.flow;
  if (game.activePlayerId !== playerId && !override) throw new GameError('Only the active player can move to the next phase.');
  if (f.op || f.priority || f.guided || f.blocks || (game.stack || []).length || (game.pendingTriggers || []).length || f.queue.length) throw new GameError('Finish what is happening first.');
  if (f.discard) throw new GameError(`Discard down to seven cards first (${f.discard.need} more).`);
  const p = activePlayer(game);
  const toEndStep = () => {
    // Other players get a chance to act "at your end step" if they can.
    setPhase(game, 'end-step');
    f.queue = [{ t: 'priority', reason: 'End step', skipActive: true }];
  };
  if (toEnd && [...MAIN, 'combat', 'begin-combat'].includes(game.phase)) {
    if (game.phase !== 'postcombat-main') log(game, `${p.displayName} ends the turn.`);
    return toEndStep();
  }
  switch (game.phase) {
    case 'precombat-main': return setPhase(game, 'combat');
    case 'combat':
    case 'begin-combat': {
      const required = validateRequiredAttackers({ game, player: p, draft: [] });
      if (!required.legal && game.mode !== 'freeplay' && !override) throw new GameError(required.reasons[0]);
      log(game, `${p.displayName} does not attack.`);
      return setPhase(game, 'postcombat-main', { noAttackCombat: true });
    }
    case 'postcombat-main': return toEndStep();
    default: throw new GameError('This step moves on by itself.');
  }
}

// ---------------------------------------------------------------------------------------------
// Combat

export function declareAttack(game, playerId, attacks = [], { override = false } = {}) {
  const f = game.flow, p = activePlayer(game);
  if (p.playerId !== playerId && !override) throw new GameError('Only the active player can attack.');
  if (!['combat', 'begin-combat'].includes(game.phase)) throw new GameError('Attackers are declared in the combat phase.');
  if (f.op || f.priority || f.queue.length || (game.stack || []).length) throw new GameError('Finish what is happening first.');
  const seen = new Set(), rows = [];
  const strict = game.mode !== 'freeplay' && !override;
  for (const a of attacks) {
    if (seen.has(a.instanceId)) continue;
    seen.add(a.instanceId);
    const card = p.deck.battlefield.find(c => c.instanceId === a.instanceId), def = defOf(game, card);
    const defender = playerById(game, a.defenderId);
    if (!card || !defender || defender.eliminated || defender.playerId === p.playerId) throw new GameError('An attacker or its target is no longer available.');
    const check = validateAttack({ game: { ...game, phase: 'declare-attackers' }, attackerId: p.playerId, defenderId: defender.playerId, instance: card, definition: def });
    if (!check.legal && strict) throw new GameError(`${def?.name || 'That creature'} cannot attack: ${check.reasons[0]}`);
    rows.push({ card, def, defender });
  }
  if (!rows.length) throw new GameError('Choose at least one attacker, or skip combat with Next Phase.');
  const required = validateRequiredAttackers({ game, player: p, draft: rows.map(r => ({ instanceId: r.card.instanceId })) });
  if (!required.legal && strict) throw new GameError(required.reasons[0]);

  const attackers = [];
  for (const r of rows) {
    if (!cardHasKeyword(r.card, r.def, 'Vigilance', game) && !r.card.tapped) {
      commit(game, { type: 'tap-card', playerId: p.playerId, instanceId: r.card.instanceId, tapped: true, silent: true });
    }
    attackers.push({ playerId: p.playerId, instanceId: r.card.instanceId, defenderId: r.defender.playerId, blocksConfirmed: false });
    log(game, `${p.displayName} attacks ${r.defender.displayName} with ${r.def?.name || 'a creature'}.`, { type: 'combat' });
  }
  const defenders = [...new Set(attackers.map(a => a.defenderId))];
  p.confirmations = { ...(p.confirmations || {}), attackers: true };
  game.combatState = { attackers, defenders, blocks: {}, damage: [], waitingFor: null, resolved: false };
  game.phase = 'declare-attackers';
  for (const a of attackers) queueTriggers(game, { type: 'attacks', sourceId: a.instanceId, controllerId: p.playerId, defenderId: a.defenderId });
  queueTriggers(game, { type: 'attackers-declared', controllerId: p.playerId, attackers: attackers.map(a => a.instanceId), defenders });
  f.queue = COMBAT_QUEUE();
}

function beginBlocks(game) {
  const cs = game.combatState;
  game.phase = 'declare-blockers';
  const pending = [];
  for (const id of cs.defenders) {
    const defender = playerById(game, id);
    if (!defender || defender.eliminated) { cs.blocks[id] = { confirmed: true, assignments: [] }; continue; }
    if (!blockOptions(game, defender).some(row => row.blockers.length)) {
      cs.blocks[id] = { confirmed: true, assignments: [] };
      log(game, `${defender.displayName} has no creature that can block.`, { type: 'combat' });
      continue;
    }
    pending.push(id);
  }
  game.flow.blocks = pending.length ? { pending } : null;
}

export function declareBlocks(game, playerId, assignments = [], { override = false } = {}) {
  const f = game.flow, cs = game.combatState;
  if (!f.blocks?.pending.includes(playerId)) throw new GameError('You are not being attacked right now.');
  const defender = playerById(game, playerId);
  const clean = (assignments || []).map(a => ({ attackerId: a.attackerId, blockerId: a.blockerId }));
  const incoming = new Set(cs.attackers.filter(a => a.defenderId === playerId).map(a => a.instanceId));
  if (clean.some(a => !incoming.has(a.attackerId) || !defender.deck.battlefield.some(c => c.instanceId === a.blockerId))) throw new GameError('A chosen blocker or attacker is no longer available.');
  const legality = validateBlockAssignments({ game, defender, assignments: clean });
  if (!legality.legal && game.mode !== 'freeplay' && !override) throw new GameError(legality.reasons[0] || 'Those blocks are not legal.');
  cs.blocks[playerId] = { confirmed: true, assignments: clean };
  for (const a of cs.attackers.filter(x => x.defenderId === playerId)) a.blocksConfirmed = true;
  for (const x of clean) {
    const blocker = defender.deck.battlefield.find(c => c.instanceId === x.blockerId);
    const attack = cs.attackers.find(a => a.instanceId === x.attackerId);
    const attacker = playerById(game, attack.playerId)?.deck.battlefield.find(c => c.instanceId === x.attackerId);
    log(game, `${defender.displayName} blocks ${defOf(game, attacker)?.name || 'an attacker'} with ${defOf(game, blocker)?.name || 'a creature'}.`, { type: 'combat' });
    queueTriggers(game, { type: 'blocks', blockerId: x.blockerId, attackerId: x.attackerId, sourceId: x.blockerId, controllerId: playerId });
  }
  if (!clean.length) log(game, `${defender.displayName} does not block.`, { type: 'combat' });
  f.blocks.pending = f.blocks.pending.filter(id => id !== playerId);
  if (!f.blocks.pending.length) f.blocks = null;
}

function combatDamage(game) {
  game.phase = 'combat-damage';
  const before = new Map(game.players.map(q => [q.playerId, { life: Number(q.life || 0), poison: Number(q.poison || 0) }]));
  const result = resolveCombat(game, { attackerPlayerId: game.activePlayerId, onEvent: e => queueTriggers(game, e) });
  for (const text of result.events.filter(t => !/ blocks /.test(t))) log(game, text, { type: 'combat' });
  for (const q of game.players) {
    const b = before.get(q.playerId);
    if (Number(q.life || 0) !== b.life) {
      const delta = Number(q.life || 0) - b.life;
      log(game, `${q.displayName} ${delta < 0 ? 'takes' : 'gains'} ${Math.abs(delta)} in combat (${b.life} → ${q.life}).`, { type: 'combat', playerId: q.playerId });
    }
    if (Number(q.poison || 0) > b.poison) log(game, `${q.displayName} gets ${plural(Number(q.poison) - b.poison, 'poison counter')}.`, { type: 'combat' });
  }
  game.phase = 'combat-damage';
}

function runStep(game, step) {
  if (step.t === 'blocks') return beginBlocks(game);
  if (step.t === 'damage') return combatDamage(game);
  if (step.t === 'end-combat') {
    game.phase = 'end-combat';
    queueTriggers(game, { type: 'end-combat', playerId: game.activePlayerId, controllerId: game.activePlayerId });
    return;
  }
  if (step.t === 'main2') return setPhase(game, 'postcombat-main');
}

// ---------------------------------------------------------------------------------------------
// Cleanup discard

export function discardCards(game, playerId, ids = [], { override = false } = {}) {
  const d = game.flow.discard;
  if (!d) throw new GameError('No discard is needed.');
  if (d.playerId !== playerId && !override) throw new GameError('Another player is discarding.');
  const p = playerById(game, d.playerId);
  const unique = [...new Set(ids)].filter(id => p.deck.hand.some(c => c.instanceId === id));
  if (unique.length !== d.need) throw new GameError(`Choose exactly ${plural(d.need, 'card')} to discard.`);
  for (const id of unique) {
    const name = defOf(game, p.deck.hand.find(c => c.instanceId === id))?.name || 'a card';
    commit(game, { type: 'move-card', playerId: p.playerId, instanceId: id, to: 'graveyard', label: `${p.displayName} discards ${name}.` });
  }
  game.flow.discard = null;
}

// ---------------------------------------------------------------------------------------------
// Guided (by-hand) resolution

export function finishGuided(game, playerId, { override = false } = {}) {
  const g = game.flow.guided, top = stackTop(game);
  if (!g) throw new GameError('Nothing is waiting to be resolved by hand.');
  if (!top || top.id !== g.stackId) { game.flow.guided = null; return; }
  if (top.controllerId !== playerId && !override) throw new GameError('The player who controls this effect finishes it.');
  top.guidedResolution = null;
  top.effects = [];
  top.resolveReqs = [];
  top.search = null;
  top.optional = false;
  game.flow.guided = null;
  top.label = `${top.name || 'Effect'} (applied by hand)`;
  commit(game, { type: 'resolve-stack', playerId: top.controllerId });
}

// ---------------------------------------------------------------------------------------------
// The loop

function finishGame(game) {
  const f = game.flow;
  f.op = null; f.priority = null; f.queue = []; f.blocks = null; f.discard = null; f.guided = null; f.vote = null;
  if (!game.endedAt) {
    game.endedAt = new Date().toISOString();
    const winner = playerById(game, game.winner);
    log(game, winner ? `${winner.displayName} wins the game!` : 'The game is over.', { type: 'result' });
  }
}

export function settle(game) {
  for (let guard = 0; guard < 400; guard++) {
    // Re-read every pass: a failed engine commit restores the game and replaces these objects.
    const f = game.flow;
    syncAttachments(game);
    if (game.status !== 'complete') evaluateLosses(game);
    if (game.status === 'complete') { finishGame(game); return; }
    if (f.stage !== 'play') return;
    if (f.vote) return;
    if (f.op) {
      if (f.op.decision) return;
      runOp(game);
      if (f.op) return;
      continue;
    }
    if (f.guided) {
      const top = stackTop(game);
      if (top && top.id === f.guided.stackId) return;
      f.guided = null;
      continue;
    }
    if ((game.pendingTriggers || []).length) {
      startOp(game, 'trigger', game.pendingTriggers[0].controllerId, { triggerId: game.pendingTriggers[0].id }, { system: true });
      continue;
    }
    const top = stackTop(game);
    if (top) {
      if (!f.priority || f.priority.stackId !== top.id) openPriority(game, { stackId: top.id, reason: top.name || top.label, exclude: top.controllerId, startAfter: top.controllerId });
      if (stepPriority(game)) return;
      f.priority = null;
      if (top.guidedResolution) { f.guided = { stackId: top.id }; continue; }
      startOp(game, 'resolve', top.controllerId, { stackId: top.id }, { system: true });
      continue;
    }
    if (f.priority?.stackId) f.priority = null;
    if (f.blocks) return;
    if (f.queue.length) {
      const step = f.queue[0];
      if (step.t === 'priority') {
        if (!f.priority) openPriority(game, { reason: step.reason, exclude: step.skipActive ? game.activePlayerId : null });
        if (stepPriority(game)) return;
        f.priority = null;
        f.queue.shift();
        continue;
      }
      f.queue.shift();
      runStep(game, step);
      continue;
    }
    if (f.priority) f.priority = null;
    if (!alivePlayers(game).length) return;
    if (autoAdvance(game)) continue;
    return;
  }
  log(game, 'The game paused itself after too many automatic steps. Use Undo or host tools if something looks stuck.');
}

export { phaseLabel };

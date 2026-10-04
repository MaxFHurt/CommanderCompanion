// What one viewer is allowed to see. The game screen renders only from this, and the host
// sends exactly this to remote devices, so hidden cards never leave the host.

import { phaseLabel } from '../engine/phase.js';
import { effectivePower, effectiveToughness } from '../engine/combat.js';
import { activePlayer, defOf, isCreature, isLand, playerById } from './helpers.js';
import {
  abilityRows, attackOptions, availableMana, blockOptions, playCheck, responseOptions, stackTop, timingBlock
} from './legal.js';
import { openingPenalty, mulliganInfo } from './setup.js';
import { playableFaces } from './ops.js';
import { coachFor } from './coach.js';

/** The player the game is waiting on right now (used by single-device pass-and-play). */
export function actorId(game) {
  const f = game.flow;
  if (game.status === 'complete') return game.activePlayerId;
  if (f.stage === 'opening') return game.players.find(p => !f.opening[p.playerId]?.kept)?.playerId || game.activePlayerId;
  if (f.op?.decision) return f.op.decision.playerId;
  if (f.guided) return stackTop(game)?.controllerId || game.activePlayerId;
  if (f.priority?.holderId) return f.priority.holderId;
  if (f.blocks?.pending.length) return f.blocks.pending[0];
  if (f.discard) return f.discard.playerId;
  return game.activePlayerId;
}

function sick(game, card, def) {
  if (!isCreature(def)) return false;
  if ((def.keywords || []).some(k => String(k).toLowerCase() === 'haste') || /\bHaste\b/.test(def.oracleText || '')) return false;
  return Number(card.controlSinceTurn ?? card.enteredTurn ?? -1) >= Number(game.turnNumber);
}

function cardView(game, card, defs, extra = {}) {
  const def = defOf(game, card);
  if (def) defs[card.definitionId] = game.cardDefinitions[card.definitionId];
  const creature = isCreature(def);
  return {
    id: card.instanceId, def: card.definitionId, face: Number.isInteger(card.activeFaceIndex) ? card.activeFaceIndex : null,
    name: def?.name || 'Card', type: def?.typeLine || '', owner: card.ownerId, controller: card.controllerId,
    tapped: !!card.tapped, token: !!card.token, counters: { ...(card.counters || {}) },
    power: creature ? effectivePower(card, def, game) : null, toughness: creature ? effectiveToughness(card, def, game) : null,
    damage: Number(card.damageMarked || 0), attachedTo: card.attachedTo || null, attachments: [...(card.attachments || [])],
    chosen: card.chosenColor || card.chosenCreatureType || card.chosenCardName || null,
    ...extra
  };
}

function publicDecision(decision) {
  return { key: decision.key, kind: decision.kind, playerId: decision.playerId, title: decision.title, private: !!decision.private };
}

function addOptionDefs(game, decision, defs) {
  for (const o of [...(decision.options || []), ...(decision.cards || [])]) {
    if (o.definitionId && game.cardDefinitions[o.definitionId]) defs[o.definitionId] = game.cardDefinitions[o.definitionId];
  }
}

function promptFor(game, viewerId, defs, viewer) {
  const f = game.flow, name = id => playerById(game, id)?.displayName || 'another player';
  const waiting = (playerId, text) => ({ kind: 'waiting', playerId, text });
  if (game.status === 'complete') return { kind: 'complete' };
  if (f.stage === 'opening') {
    const mine = f.opening[viewerId];
    if (mine && !mine.kept) return { kind: 'opening', mulligans: mine.mulligans, bottom: openingPenalty(game, viewerId), rule: mulliganInfo(game.rulesConfig).label, canMulligan: mine.mulligans < 6 };
    const next = game.players.find(p => !f.opening[p.playerId]?.kept);
    return waiting(next?.playerId, `Waiting for ${name(next?.playerId)} to keep a hand.`);
  }
  if (f.vote) {
    const v = f.vote;
    return { kind: 'vote', requesterId: v.requesterId, label: v.label, reason: v.reason, canVote: !!viewerId && viewerId !== v.requesterId && v.votes[viewerId] === undefined, voted: v.votes[viewerId], canDecide: !!viewer.isHost };
  }
  if (f.op?.decision) {
    const d = f.op.decision;
    if (d.playerId === viewerId) { addOptionDefs(game, d, defs); return { kind: 'decision', decision: d }; }
    return { ...waiting(d.playerId, `Waiting for ${name(d.playerId)}: ${d.title || 'making a choice'}.`), decision: publicDecision(d) };
  }
  if (f.guided) {
    const top = stackTop(game);
    if (top?.controllerId === viewerId || viewer.isHost) return { kind: 'guided', stackId: top.id, name: top.name || top.label, text: top.guidedResolution?.oracleText || top.text || '', notes: top.guidedResolution?.unsupported || [], controllerId: top.controllerId };
    return waiting(top?.controllerId, `Waiting for ${name(top?.controllerId)} to resolve ${top?.name || 'an effect'} by hand.`);
  }
  if (f.priority?.holderId) {
    const pr = f.priority, seconds = game.deviceMode === 'multi-device' ? Number(game.rulesConfig?.priorityTimer || 0) : 0;
    if (pr.holderId === viewerId) {
      const top = stackTop(game);
      return { kind: 'priority', reason: pr.reason, stackId: top?.id || null, deadline: seconds ? pr.since + seconds * 1000 : null };
    }
    return waiting(pr.holderId, `Waiting for ${name(pr.holderId)} to respond or pass.`);
  }
  if (f.blocks?.pending.length) {
    if (f.blocks.pending.includes(viewerId)) return { kind: 'blocks', rows: blockOptions(game, playerById(game, viewerId)) };
    return waiting(f.blocks.pending[0], `Waiting for ${name(f.blocks.pending[0])} to declare blockers.`);
  }
  if (f.discard) {
    if (f.discard.playerId === viewerId) return { kind: 'discard', need: f.discard.need };
    return waiting(f.discard.playerId, `Waiting for ${name(f.discard.playerId)} to discard.`);
  }
  if (game.activePlayerId === viewerId) return { kind: 'turn' };
  return waiting(game.activePlayerId, `${name(game.activePlayerId)}'s turn — ${phaseLabel(game.phase)}.`);
}

/**
 * viewer: { playerId (null for a judge/host display), isHost }
 * Returns a plain object that is safe to JSON-serialise and send to that viewer.
 */
export function buildView(game, viewer = {}, { canUndo = false } = {}) {
  const viewerId = viewer.playerId || null;
  const me = playerById(game, viewerId);
  const defs = {};
  const cs = game.combatState || {};
  const attacking = new Map((cs.attackers || []).map(a => [a.instanceId, a.defenderId]));
  const blocking = new Map();
  for (const row of Object.values(cs.blocks || {})) for (const x of row.assignments || []) blocking.set(x.blockerId, x.attackerId);
  const inCombat = ['declare-attackers', 'declare-blockers', 'combat-damage', 'end-combat'].includes(game.phase);
  const block = me ? timingBlock(game, me.playerId) : 'Watching';

  const players = game.players.map(p => {
    const own = p.playerId === viewerId;
    const mana = availableMana(game, p);
    const battlefield = p.deck.battlefield.map(c => {
      const def = defOf(game, c);
      const extra = { sick: sick(game, c, def), land: isLand(def), creature: isCreature(def) };
      if (inCombat && attacking.has(c.instanceId)) extra.attacking = attacking.get(c.instanceId);
      if (inCombat && blocking.has(c.instanceId)) extra.blocking = blocking.get(c.instanceId);
      if (own) {
        extra.abilities = abilityRows(game, p, c).map(r => ({ id: r.ability.id, text: r.ability.text, cost: r.ability.cost, mana: r.ability.manaAbility, legal: r.legal && !block, reason: block || r.reasons[0] || '' }));
      }
      return cardView(game, c, defs, extra);
    });
    const row = {
      playerId: p.playerId, name: p.displayName, seat: p.seat, color: p.color, matId: p.matId || null,
      life: p.life, poison: Number(p.poison || 0), eliminated: !!p.eliminated, eliminationReason: p.eliminationReason || null,
      statuses: [...(p.statuses || [])],
      counters: Object.fromEntries(Object.entries(p.counters || {}).filter(([k, v]) => Number(v) > 0 && !/ThisTurn$|^damageDealt$|^failedDraws$/.test(k))),
      commanderDamage: { ...(p.commanderDamage || {}) },
      commanders: (p.commanders || []).map(c => {
        if (game.cardDefinitions[c.cardId]) defs[c.cardId] = game.cardDefinitions[c.cardId];
        return { id: c.id, def: c.cardId, name: game.cardDefinitions[c.cardId]?.name || 'Commander', tax: game.rulesConfig?.commanderTax === false ? 0 : Number(c.commanderTax || 0), zone: c.zone, instanceId: p.deck.commandZone.find(x => x.definitionId === c.cardId)?.instanceId || null };
      }),
      mana, handCount: p.deck.hand.length, libraryCount: p.deck.remainingLibrary.length,
      battlefield,
      graveyard: p.deck.graveyard.map(c => cardView(game, c, defs)),
      exile: p.deck.exile.map(c => cardView(game, c, defs)),
      command: p.deck.commandZone.map(c => {
        const extra = {};
        if (own) { const check = playCheck(game, p, c); extra.playable = check.legal && !block; extra.reason = block || check.reasons[0] || ''; }
        return cardView(game, c, defs, extra);
      }),
      hand: null,
      landsPlayed: Number(p.counters?.landsPlayedThisTurn || 0),
      deckName: p.deck.sourceName || ''
    };
    if (own) {
      row.hand = p.deck.hand.map(c => {
        const base = game.cardDefinitions[c.definitionId];
        const faces = playableFaces(base);
        const checks = faces.map(i => playCheck(game, p, c, i));
        const best = checks.find(x => x.legal) || checks[0];
        const handAbility = abilityRows(game, p, c);
        return cardView(game, c, defs, {
          playable: !!best?.legal && !block, reason: block || best?.reasons?.[0] || '', land: isLand(best?.def),
          instant: /\bInstant\b/i.test(best?.def?.typeLine || '') || /\bFlash\b/.test(best?.def?.oracleText || ''),
          abilities: handAbility.map(r => ({ id: r.ability.id, text: r.ability.text, cost: r.ability.cost, mana: true, legal: !block, reason: block || '' }))
        });
      });
    }
    return row;
  });

  const stack = (game.stack || []).map(x => {
    const id = x.sourceDefinitionId || x.card?.definitionId;
    if (id && game.cardDefinitions[id]) defs[id] = game.cardDefinitions[id];
    return { id: x.id, kind: x.kind, name: x.name || game.cardDefinitions[id]?.name || x.label, label: x.label, text: x.text || x.abilityText || '', controllerId: x.controllerId, def: id || null, face: x.card?.activeFaceIndex ?? null, guided: !!x.guidedResolution };
  });

  const prompt = promptFor(game, viewerId, defs, viewer);
  const active = activePlayer(game);
  const isTurn = prompt.kind === 'turn';
  const view = {
    gameId: game.gameId, mode: game.mode, deviceMode: game.deviceMode, status: game.status, stage: game.flow.stage,
    turn: game.turnNumber, phase: game.phase, phaseLabel: phaseLabel(game.phase), activePlayerId: game.activePlayerId,
    you: viewerId, isHost: !!viewer.isHost, canEdit: !!viewer.isHost || game.mode === 'freeplay' || (prompt.kind === 'guided' && prompt.controllerId === viewerId),
    canUndo: canUndo && (!!viewer.isHost || game.mode === 'freeplay'),
    rules: { ...game.rulesConfig }, players, stack, prompt,
    log: (game.log || []).slice(0, 150).map(e => ({ id: e.id, text: e.text, turn: e.turn, type: e.type || '', playerId: e.playerId || null })),
    chat: (game.chat || []).slice(-80),
    winner: game.winner || null, result: game.result || null,
    actions: {
      nextPhase: isTurn && ['precombat-main', 'combat', 'begin-combat', 'postcombat-main'].includes(game.phase),
      endTurn: isTurn && ['precombat-main', 'combat', 'begin-combat', 'postcombat-main'].includes(game.phase),
      attack: isTurn && ['combat', 'begin-combat'].includes(game.phase) && me ? attackOptions(game, me) : null,
      respond: prompt.kind === 'priority' && me ? (() => { const r = responseOptions(game, me); return { cards: r.cards.map(c => c.instanceId), abilities: r.abilities.map(c => c.instanceId) }; })() : null
    },
    defs
  };
  view.coach = coachFor(game, view, me, active);
  return view;
}

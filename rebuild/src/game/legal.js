// What a player is allowed to do right now. Used by the controller to accept or reject
// actions and by the view to highlight playable cards and explain blocked ones.

import {
  validatePlay, validateAttack, validateBlock, parseActivatedAbilities, validateActivatedAbilityFull,
  effectiveManaOptionsForSource, playerManaAvailability, blockerCapacity
} from '../engine/rules.js';
import { defOf, definitionsMap, faceDefinition, isLand, isInstantSpeed, opponentsOf, playerById, alivePlayers } from './helpers.js';
import { candidatesFor } from './requirements.js';

const HAND_MANA_COST = /^Exile\s+(?:this card|[^:]+?)\s+from your hand$/i;

export function stackTop(game) {
  return (game.stack || []).at(-1) || null;
}

export function isIdle(game) {
  const f = game.flow;
  return !f.op && !f.priority && !(game.stack || []).length && !(game.pendingTriggers || []).length && !f.queue.length && f.stage === 'play';
}

/** May this player start an action (cast, activate) right now? Returns a reason string when not. */
export function timingBlock(game, playerId) {
  const f = game.flow;
  if (game.status === 'complete') return 'The game is over.';
  if (f.stage !== 'play') return 'Opening hands are still being chosen.';
  if (f.op) return 'Finish the current choice first.';
  if (f.guided) return 'A spell or ability is waiting to be resolved by hand.';
  if (f.priority) {
    return f.priority.holderId === playerId ? null : `${playerById(game, f.priority.holderId)?.displayName || 'Another player'} has priority.`;
  }
  if (f.blocks) return 'Blockers are being declared.';
  if (f.discard) return 'Cleanup: a player is discarding.';
  if ((game.pendingTriggers || []).length || f.queue.length || (game.stack || []).length) return 'The game is resolving — wait a moment.';
  // With nothing happening, the active player may do anything and other players may act at instant speed.
  return null;
}

export function commanderEntryFor(player, card) {
  return (player.commanders || []).find(c => c.cardId === card.definitionId && c.zone === 'command') || null;
}

/** Legality of playing one card (optionally a specific face). */
export function playCheck(game, player, card, faceIndex = null) {
  const base = game.cardDefinitions?.[card.definitionId];
  const def = Number.isInteger(faceIndex) ? faceDefinition(base, faceIndex) : defOf(game, { ...card, activeFaceIndex: null });
  if (!def) return { legal: false, reasons: ['Card data is missing.'], kind: 'cast', def: null };
  const kind = isLand(def) ? 'land' : 'cast';
  const commander = card.zone === 'command' ? commanderEntryFor(player, card) : null;
  const result = validatePlay({ game, player, definition: def, instance: card, kind, commander, definitions: definitionsMap(game) });
  return { ...result, kind, def, commander };
}

/** Is this instant-speed card worth offering as a response to what is on the stack? */
function responseRelevant(game, def, holder) {
  const text = String(def?.oracleText || '').toLowerCase();
  const top = stackTop(game);
  const topDef = top ? game.cardDefinitions?.[top.sourceDefinitionId || top.card?.definitionId] : null;
  if (/counter target spell/.test(text)) return !!top && top.kind === 'spell';
  if (/counter target (?:activated|triggered) ability/.test(text)) return !!top && (top.kind === 'ability' || top.kind === 'trigger');
  if (/copy target (?:instant|sorcery) spell/.test(text)) return !!top && top.kind === 'spell' && /Instant|Sorcery/i.test(topDef?.typeLine || '');
  const targetPhrase = text.match(/target (?:creature|permanent|artifact|enchantment|planeswalker|land|player|opponent)[^.]*/);
  if (targetPhrase) {
    const kind = /target (?:player|opponent)/.test(targetPhrase[0]) && !/creature|permanent/.test(targetPhrase[0]) ? 'target' : 'target';
    return candidatesFor(game, { kind, scope: targetPhrase[0] }, holder).length > 0;
  }
  return true;
}

function abilityRespondsToStack(game, ability) {
  const effect = String(ability?.effect || '').toLowerCase();
  const top = stackTop(game);
  if (!top) return false;
  if (top.kind === 'spell') return /counter target spell|copy target spell|change (?:the )?target|target spell/.test(effect);
  return /counter target (?:activated|triggered) ability|copy target (?:activated|triggered) ability|target (?:activated|triggered) ability/.test(effect);
}

/** Cards and abilities a player could legally use if given priority now. */
export function responseOptions(game, player) {
  const graveyardCasting = (player.temporaryPermissions || []).some(x => x?.kind === 'cast-from-zone' && x?.zone === 'graveyard');
  const cards = [...(player.deck?.hand || []), ...(graveyardCasting ? (player.deck?.graveyard || []) : [])].filter(card => {
    const def = defOf(game, card);
    if (!def || isLand(def) || !isInstantSpeed(def) || !responseRelevant(game, def, player)) return false;
    return playCheck(game, player, card).legal;
  });
  const abilities = (player.deck?.battlefield || []).filter(card => {
    const def = defOf(game, card);
    return parseActivatedAbilities(def).some(a => !a.manaAbility && abilityRespondsToStack(game, a)
      && validateActivatedAbilityFull({ game, player, instance: card, definition: def, ability: a, definitions: definitionsMap(game) }).legal);
  });
  return { cards, abilities };
}

export function hasResponse(game, player) {
  const options = responseOptions(game, player);
  return options.cards.length > 0 || options.abilities.length > 0;
}

/** Activated abilities of a card with their current legality. */
export function abilityRows(game, player, card) {
  const def = defOf(game, card);
  if (!def) return [];
  const inHand = card.zone === 'hand';
  return parseActivatedAbilities(def)
    .filter(ability => (inHand ? ability.manaAbility && HAND_MANA_COST.test(String(ability.cost || '').trim()) : true))
    .map(ability => {
      const check = inHand ? { legal: true, reasons: [] }
        : validateActivatedAbilityFull({ game, player, instance: card, definition: def, ability, definitions: definitionsMap(game) });
      const sorcery = /Activate only as a sorcery/i.test(ability.text) || ability.loyaltyDelta !== null;
      if (sorcery && check.legal) {
        if (game.activePlayerId !== player.playerId || !['precombat-main', 'postcombat-main'].includes(game.phase) || (game.stack || []).length) {
          return { ability, legal: false, reasons: ['Only during your main phase while the stack is empty.'], fromHand: inHand };
        }
        if (ability.loyaltyDelta !== null && card.loyaltyUsedTurn === game.turnNumber) return { ability, legal: false, reasons: ['One loyalty ability each turn.'], fromHand: inHand };
      }
      return { ability, legal: check.legal, reasons: check.reasons, fromHand: inHand };
    });
}

export function manaOptionsForAbility(game, player, card, ability) {
  const def = defOf(game, card);
  let options = effectiveManaOptionsForSource({ game, player, card, definition: def, ability });
  if (/chosen color/i.test(ability.effect || '') && card?.chosenColor) options.push(card.chosenColor);
  if (/commander(?:’|'|)s color identity/i.test(ability.effect || '')) {
    const allowed = new Set();
    for (const cmd of player.commanders || []) for (const c of game.cardDefinitions?.[cmd.cardId]?.colorIdentity || []) allowed.add(c);
    // A colorless commander still lets the source make colorless mana.
    options = allowed.size ? options.filter(c => allowed.has(c)) : ['C'];
  }
  return [...new Set(options)];
}

export function manaAmountForAbility(ability) {
  const effect = String(ability?.effect || ability?.text || '');
  const symbols = [...effect.matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
  if (symbols.length && !/\bor\b/i.test(effect)) return Math.max(1, symbols.length);
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const m = effect.match(/Add (one|two|three|four|five|\d+) mana/i);
  return Math.max(1, Number(m?.[1]) || words[String(m?.[1] || '').toLowerCase()] || 1);
}

/** Creatures the player could attack with, each with the players it may attack. */
export function attackOptions(game, player) {
  const view = { ...game, phase: 'declare-attackers' };
  const defenders = opponentsOf(game, player.playerId);
  const rows = [];
  for (const card of player.deck?.battlefield || []) {
    const def = defOf(game, card);
    const legal = defenders.filter(d => validateAttack({ game: view, attackerId: player.playerId, defenderId: d.playerId, instance: card, definition: def }).legal);
    if (legal.length) rows.push({ instanceId: card.instanceId, defenders: legal.map(d => d.playerId) });
  }
  return rows;
}

/** For each attacker heading at `defender`, the defender's creatures that may block it. */
export function blockOptions(game, defender) {
  const incoming = (game.combatState?.attackers || []).filter(a => a.defenderId === defender.playerId);
  return incoming.map(attack => {
    const attackerOwner = playerById(game, attack.playerId);
    const attacker = attackerOwner?.deck?.battlefield?.find(c => c.instanceId === attack.instanceId);
    const attackerDef = defOf(game, attacker);
    const blockers = (defender.deck?.battlefield || [])
      .filter(b => validateBlock({ blocker: b, definition: defOf(game, b), attackerDefinition: attackerDef, attacker }).legal)
      .map(b => ({ instanceId: b.instanceId, capacity: blockerCapacity(defOf(game, b)) }));
    return { attackerId: attack.instanceId, attackerName: attackerDef?.name || 'Attacker', blockers };
  });
}

/**
 * Mana the player can spend now: fixed sources by color plus each flexible source counted once
 * under the set of colors it could make. This is what "Available Mana" shows.
 */
export function availableMana(game, player) {
  const pool = playerManaAvailability(player, game);
  const fixed = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of Object.keys(fixed)) fixed[c] = Number(pool[c] || 0);
  const groups = new Map();
  for (const source of pool.__flex || []) {
    const key = [...new Set(source.options)].sort().join('');
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const flex = [...groups.entries()].map(([colors, count]) => ({ colors: colors.split(''), count }));
  const total = Object.values(fixed).reduce((n, v) => n + v, 0) + flex.reduce((n, g) => n + g.count, 0);
  return { fixed, flex, total };
}

/** Does the active player have anything optional to do in a main phase? */
export function hasMainPhaseAction(game, player) {
  for (const card of player.deck?.hand || []) if (playCheck(game, player, card).legal) return true;
  for (const card of player.deck?.commandZone || []) if (playCheck(game, player, card).legal) return true;
  for (const card of player.deck?.battlefield || []) {
    if (abilityRows(game, player, card).some(r => r.legal && !r.ability.manaAbility)) return true;
  }
  return false;
}

export function anyoneHasResponse(game) {
  return alivePlayers(game).some(p => hasResponse(game, p));
}

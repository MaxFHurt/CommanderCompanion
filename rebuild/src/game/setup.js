// Builds a new tracked game (Guided Play or Free Play) from validated player setups,
// and runs the opening-hand stage (mulligans) before turn one.

import { initializeGame } from '../engine/state.js';
import { normalizeDeck, shuffleLibrary, drawOpeningHand, sync } from '../engine/deck.js';
import { normalizeRulesConfig } from '../engine/rules.js';
import { GameError, emptyMana, log, newId, playerById, plural } from './helpers.js';

export const PLAYER_COLORS = ['#c9a227', '#4f8fd6', '#b8433f', '#4c9a55', '#8a5cc2', '#c97a2b'];

/**
 * players: [{ name, manifest:[{definitionId, quantity}], commanderIds:[definitionId], deckName, deckId,
 *             sourceType, matId, clientId }]
 * definitions: array or map of card definitions used by any deck.
 */
export function createGame({ mode = 'fully-tracked', deviceMode = 'single-device', rules = {}, players = [], definitions = [], firstPlayer = 'random', hostSeat = true } = {}) {
  if (players.length < 2 || players.length > 6) throw new GameError('Commander games need 2 to 6 players.');
  const defs = Array.isArray(definitions) ? Object.fromEntries(definitions.map(d => [d.definitionId, d])) : { ...definitions };
  const rulesConfig = normalizeRulesConfig(rules);

  const seats = players.map((p, i) => {
    const playerId = `p${i + 1}-${newId('x').split(':').pop()}`;
    const deck = normalizeDeck({
      ownerId: playerId, sourceType: p.sourceType || 'custom', sourceId: p.deckId || null,
      sourceName: p.deckName || 'Deck', manifest: p.manifest, commanderDefinitionIds: p.commanderIds || []
    });
    shuffleLibrary(deck);
    if (deck.remainingLibrary.length >= 7) drawOpeningHand(deck, 7);
    return {
      playerId, displayName: String(p.name || `Player ${i + 1}`).slice(0, 24), deck,
      commanders: (p.commanderIds || []).map((id, n) => ({ id: `${playerId}:commander:${n + 1}`, cardId: id })),
      settings: { handTracking: true }, matId: p.matId || null, color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      ownership: { local: !p.clientId, clientId: p.clientId || null }, profileName: p.profileName || null
    };
  });

  const game = initializeGame({ players: seats, mode, deviceMode });
  game.gameId = newId('game');
  game.cardDefinitions = defs;
  game.rulesConfig = rulesConfig;
  game.status = 'active';
  game.startedAt = new Date().toISOString();
  game.hostSeat = hostSeat;
  for (const p of game.players) {
    p.life = Number(rulesConfig.startingLife || 40);
    p.mana.total = emptyMana();
    p.mana.available = emptyMana();
    p.mana.floating = emptyMana();
    p.confirmations = { draw: false };
    p.counters = { landsPlayedThisTurn: 0, extraLandPlaysThisTurn: 0, cardsDrawnThisTurn: 0 };
  }
  const first = firstPlayer === 'random' ? Math.floor(Math.random() * game.players.length) : Math.max(0, Math.min(game.players.length - 1, Number(firstPlayer) || 0));
  game.activePlayerId = game.players[first].playerId;
  game.firstPlayerId = game.activePlayerId;
  game.flow = newFlow();
  game.flow.stage = 'opening';
  game.flow.opening = Object.fromEntries(game.players.map(p => [p.playerId, { kept: p.deck.hand.length === 0, mulligans: 0 }]));
  log(game, `Game started. ${game.players[first].displayName} goes first.`);
  maybeFinishOpening(game);
  return game;
}

export function newFlow() {
  return { stage: 'play', opening: null, op: null, priority: null, queue: [], blocks: null, discard: null, guided: null, vote: null };
}

export function mulliganInfo(rules) {
  const rule = String(rules?.mulligan || 'commander');
  if (rule === 'free') return { rule, label: 'Free mulligans', penalty: () => 0 };
  if (rule === 'london') return { rule, label: 'London mulligan', penalty: n => Math.max(0, n) };
  return { rule: 'commander', label: 'Commander mulligan — the first one is free', penalty: n => Math.max(0, n - 1) };
}

export function openingPenalty(game, playerId) {
  const state = game.flow.opening?.[playerId];
  return Math.min(7, mulliganInfo(game.rulesConfig).penalty(Number(state?.mulligans || 0)));
}

export function takeMulligan(game, playerId) {
  const player = playerById(game, playerId), state = game.flow.opening?.[playerId];
  if (game.flow.stage !== 'opening' || !state || state.kept) throw new GameError('Mulligans are only taken before the game starts.');
  if (state.mulligans >= 6) throw new GameError('No more mulligans are available.');
  state.mulligans += 1;
  for (const card of player.deck.hand.splice(0)) { card.zone = 'library'; player.deck.remainingLibrary.push(card); }
  shuffleLibrary(player.deck);
  drawOpeningHand(player.deck, 7);
  log(game, `${player.displayName} takes a mulligan (${state.mulligans}).`);
}

export function keepHand(game, playerId, bottomIds = []) {
  const player = playerById(game, playerId), state = game.flow.opening?.[playerId];
  if (game.flow.stage !== 'opening' || !state || state.kept) throw new GameError('This hand has already been kept.');
  const need = openingPenalty(game, playerId);
  const ids = [...new Set(bottomIds)].filter(id => player.deck.hand.some(c => c.instanceId === id));
  if (ids.length !== need) throw new GameError(`Choose exactly ${plural(need, 'card')} to put on the bottom of your library.`);
  for (const id of ids) {
    const i = player.deck.hand.findIndex(c => c.instanceId === id);
    const [card] = player.deck.hand.splice(i, 1);
    card.zone = 'library';
    player.deck.remainingLibrary.push(card);
  }
  sync(player.deck);
  state.kept = true;
  log(game, `${player.displayName} keeps ${plural(player.deck.hand.length, 'card')}.`);
  maybeFinishOpening(game);
}

function maybeFinishOpening(game) {
  if (Object.values(game.flow.opening || {}).every(s => s.kept)) {
    game.flow.stage = 'play';
    game.flow.opening = null;
    game.turnNumber = 1;
    game.phase = 'untap';
  }
}

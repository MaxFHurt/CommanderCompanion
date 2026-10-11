// Shared helpers for the node game tests.
import { CARDS, DECKS, BY_NAME } from '../fixtures/cards.mjs';
import { scryfallToDefinition } from '../../src/data/card-api.js';
import { parseDeckList } from '../../src/data/card-api.js';
import { createGame } from '../../src/game/setup.js';
import { createController } from '../../src/game/controller.js';
import { defOf, findCard, playerById } from '../../src/game/helpers.js';

export const DEFS = CARDS.map(scryfallToDefinition);
export const defByName = name => DEFS.find(d => d.name === name || d.combinedName === name);

export function playerSetup(name, deckKey) {
  const deck = DECKS[deckKey];
  const rows = parseDeckList(deck.list);
  const manifest = rows.map(r => {
    const d = defByName(r.name);
    if (!d) throw new Error(`fixture missing: ${r.name}`);
    return { definitionId: d.definitionId, quantity: r.quantity };
  });
  return { name, deckName: deckKey, manifest, commanderIds: [defByName(deck.commander).definitionId] };
}

export function newGame(decks = ['white', 'simic'], opts = {}) {
  const game = createGame({ players: decks.map((d, i) => playerSetup(`P${i + 1}`, d)), definitions: DEFS, firstPlayer: 0, rules: { priorityTimer: 0, ...(opts.rules || {}) }, mode: opts.mode || 'fully-tracked', deviceMode: opts.deviceMode || 'multi-device' });
  const ctl = createController(game);
  const given = new Set();
  const t = {
    game, ctl,
    P: i => game.players[i],
    host: { playerId: null, isHost: true },
    as: i => ({ playerId: game.players[i].playerId, isHost: false }),
    autoPass: opts.autoPass !== false,
    do(i, intent) {
      const r = ctl.dispatch(intent, t.as(i));
      if (r.ok && t.autoPass && intent.type !== 'pass') t.passAll();
      if (!r.ok) throw new Error(`${intent.type} failed: ${r.error} | phase=${game.phase} active=${game.players.findIndex(p => p.playerId === game.activePlayerId)} flow=${JSON.stringify({ ...game.flow, op: game.flow.op && { type: game.flow.op.type, d: game.flow.op.decision?.title } })} log=${game.log.slice(0, 3).map(e => e.text).join(' / ')}`);
      return r;
    },
    /** End the turn, discarding from the front of the hand if cleanup asks for it. */
    end(i) {
      t.do(i, { type: 'end-turn' });
      t.passAll();
      t.discardIfNeeded(i);
      t.passAll();
    },
    discardIfNeeded(i) {
      const d = game.flow.discard;
      if (d) t.do(i, { type: 'discard', ids: [...game.players[i].deck.hand].sort((a, b) => given.has(a.instanceId) - given.has(b.instanceId)).slice(0, d.need).map(c => c.instanceId) });
    },
    passAll() {
      for (let n = 0; n < 20 && game.flow.priority?.holderId && !game.flow.op; n++) {
        const r = ctl.dispatch({ type: 'pass' }, { playerId: game.flow.priority.holderId, isHost: false });
        if (!r.ok) throw new Error(`pass failed: ${r.error}`);
      }
    },
    try(i, intent) { return ctl.dispatch(intent, t.as(i)); },
    edit(edit) { const r = ctl.dispatch({ type: 'edit', edit }, t.host); if (!r.ok) throw new Error(`edit failed: ${r.error}`); },
    keepAll() {
      // Tests start from empty hands (unless keepHands) so random opening cards cannot interfere.
      if (!opts.keepHands) for (const p of game.players) { for (const c of p.deck.hand.splice(0)) { c.zone = 'library'; p.deck.remainingLibrary.push(c); } }
      game.players.forEach((_, i) => { if (!game.flow.opening?.[game.players[i].playerId]?.kept) t.do(i, { type: 'keep', bottom: [] }); });
    },
    /** Put a named card from anywhere in the player's deck into a zone (test setup). */
    give(i, name, zone = 'hand') {
      const p = game.players[i];
      const pool = [...p.deck.remainingLibrary, ...p.deck.hand, ...p.deck.commandZone];
      const card = pool.find(c => !(zone === 'battlefield' && given.has(c.instanceId) && c.zone !== 'library') && (defOf(game, c)?.name === name || game.cardDefinitions[c.definitionId]?.combinedName === name));
      if (!card) throw new Error(`${name} not in ${p.displayName}'s deck`);
      given.add(card.instanceId);
      if (card.zone === zone) return card;
      t.edit({ kind: 'move', instanceId: card.instanceId, to: zone });
      return card;
    },
    hand(i, name) { return game.players[i].deck.hand.find(c => defOf(game, c)?.name === name || game.cardDefinitions[c.definitionId]?.combinedName === name); },
    bf(i, name) { return game.players[i].deck.battlefield.find(c => defOf(game, c)?.name === name); },
    names(i, zone) { return game.players[i].deck[zone].map(c => defOf(game, c)?.name); },
    decision() { return game.flow.op?.decision || null; },
    answer(value) { const d = game.flow.op.decision; const who = game.players.findIndex(p => p.playerId === d.playerId); return t.do(who, { type: 'answer', key: d.key, value }); },
    view(i) { return ctl.view(i === null ? { playerId: null, isHost: true } : t.as(i)); },
    findCard: id => findCard(game, id), playerById: id => playerById(game, id)
  };
  return t;
}

let failures = 0, count = 0;
export function check(label, cond, detail = '') {
  count += 1;
  if (cond) console.log(`  ok  ${label}`);
  else { failures += 1; console.log(`FAIL  ${label} ${detail}`); }
}
export function section(name) { console.log(`\n# ${name}`); }
export function done() { console.log(`\n${count - failures}/${count} passed`); process.exit(failures ? 1 : 0); }

// Real practice games (roadmap 5.3): a module worker that plays full 4-player Commander games on the game side's rules engine
// (../src/game/practice-match.js), every seat played by the bot. The Deck Builder (ui/deck.js realGames) starts one or more of
// these, each with its share of the games, and ends them when the games are done or the deck changes.
// In:  {deck, opponents: [deck…], games: [game numbers], seed, maxRounds}; a deck is {name, commanders: [name], cards: [{c, q}]}
//      with c the Deck Builder's own card row (library.js fromScryfall) or null for a card it lacks.
// Out: {kind: 'game', g, row} after each game; {kind: 'done'}; {kind: 'error', error}.
import { playMatch } from '../src/game/practice-match.js';
import { scryfallFromCompact, basicLand, BASICS } from '../src/game/practice-cards.js';

function toDeck(d) {
  const cards = [], missing = [];
  for (const e of d.cards || []) {
    const card = e.c ? scryfallFromCompact(e.c) : BASICS.includes(e.n) ? basicLand(e.n) : null;
    if (card) cards.push({ card, quantity: e.q || 1 });
    else missing.push(e.n);
  }
  return { name: d.name, commanders: d.commanders || [], cards, missing };
}

self.onmessage = ev => {
  const m = ev.data || {};
  try {
    const deck = toDeck(m.deck), opponents = (m.opponents || []).map(toDeck);
    const seats = [deck, ...opponents];
    for (const g of m.games || []) {
      // The deck's seat moves round from game to game (the engine also picks the first player at random).
      const shift = g % seats.length;
      const order = [...seats.slice(shift), ...seats.slice(0, shift)];
      const r = playMatch({ decks: order, seed: (m.seed || 1) + g * 7919, maxRounds: m.maxRounds || 12 });
      self.postMessage({ kind: 'game', g, row: { ...r, me: order.indexOf(deck), missing: deck.missing.length } });
    }
    self.postMessage({ kind: 'done' });
  } catch (e) {
    self.postMessage({ kind: 'error', error: String((e && e.message) || e) });
  }
};

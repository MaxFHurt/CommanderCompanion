// Real practice games (roadmap 5.3): the bot (src/game/bot.js), the match runner (src/game/practice-match.js) and the
// Deck Builder's card rows turned back into game cards (src/game/practice-cards.js), on the built-in precons as the Deck
// Builder sends them (tests/fixtures/precon-decks.json.gz: realDeck() for each precon, saved from the live card data).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { check, section, done } from './harness.mjs';
import { scryfallToDefinition } from '../../src/data/card-api.js';
import { playMatch, summarize, seeded } from '../../src/game/practice-match.js';
import { scryfallFromCompact, basicLand } from '../../src/game/practice-cards.js';
import { answerDecision } from '../../src/game/bot.js';

const P = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/precon-decks.json.gz', import.meta.url))));
const toDeck = d => ({ name: d.name, commanders: d.commanders, cards: d.cards.map(e => ({ card: e.c ? scryfallFromCompact(e.c) : basicLand(e.n), quantity: e.q })) });
const deck = name => toDeck(P[name]);

section('Deck Builder rows to game cards');
const all = Object.values(P).flatMap(d => d.cards);
check('every precon card is in the card data', all.every(e => e.c || /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(e.n)), all.filter(e => !e.c).map(e => e.n).join(', '));
check('every precon has 100 cards', Object.values(P).every(d => d.cards.reduce((a, e) => a + e.q, 0) === 100), Object.values(P).map(d => `${d.name} ${d.cards.reduce((a, e) => a + e.q, 0)}`).join(', '));
const row = name => all.find(e => e.n === name)?.c;
{
  const split = scryfallToDefinition(scryfallFromCompact(row('Commit // Memory')));
  check('split card: two faces with their own costs', split.cardFaces.length === 2 && split.cardFaces[0].manaCost === '{3}{U}' && split.cardFaces[1].manaCost === '{4}{U}{U}', JSON.stringify(split.cardFaces.map(f => f.manaCost)));
  check('split card: main face text only', /^Put target spell or nonland permanent/.test(split.oracleText) && !/\/\//.test(split.oracleText), split.oracleText);
  const adv = scryfallToDefinition(scryfallFromCompact(row('Brightcap Badger // Fungus Frolic')));
  check('adventure card: creature face first, adventure layout', adv.layout === 'adventure' && adv.power === '3' && adv.toughness === '4' && adv.manaValue === 4, `${adv.layout} ${adv.power} ${adv.manaValue}`);
  const c = scryfallToDefinition(scryfallFromCompact(row('Sol Ring')));
  check('plain card keeps cost, type and text', c.manaCost === '{1}' && /Artifact/.test(c.typeLine) && /Add \{C\}\{C\}/.test(c.oracleText));
  const b = scryfallToDefinition(basicLand('Forest'));
  check('basic land stand-in taps for its colour', /Basic Land — Forest/.test(b.typeLine) && /\{G\}/.test(b.oracleText));
}

section('Bot choices');
{
  // A minimal game: the bot's own land and an opponent's creature.
  const game = {
    cardDefinitions: { L: { name: 'Swamp', typeLine: 'Basic Land — Swamp', manaValue: 0 }, C: { name: 'Big Beast', typeLine: 'Creature — Beast', power: '6', toughness: '6', manaValue: 6 }, S: { name: 'Doom Blade', typeLine: 'Instant', oracleText: 'Destroy target nonblack creature.' }, B: { name: 'Braids, Arisen Nightmare', oracleText: 'At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker.' } },
    players: [
      { playerId: 'me', life: 40, deck: { battlefield: [{ instanceId: 'm1', definitionId: 'L', controllerId: 'me' }], hand: [], graveyard: [], exile: [], remainingLibrary: [], commandZone: [] } },
      { playerId: 'op', life: 40, deck: { battlefield: [{ instanceId: 'o1', definitionId: 'C', controllerId: 'op' }], hand: [], graveyard: [], exile: [], remainingLibrary: [], commandZone: [] } }
    ]
  };
  const sac = { kind: 'choose-one', source: 'Braids, Arisen Nightmare', title: 'Braids — sacrifice', prompt: 'Sacrifice an artifact, creature, enchantment, land or planeswalker?', options: [{ id: 'none', label: 'Don’t sacrifice' }, { id: 'm1', instanceId: 'm1', label: 'Swamp' }] };
  check('an optional sacrifice is declined', answerDecision(game, 'me', sac) === 'none');
  const kill = { kind: 'choose-one', source: 'Doom Blade', title: 'Doom Blade — target creature', prompt: 'Choose target nonblack creature', options: [{ id: 'o1', instanceId: 'o1', label: 'Big Beast' }, { id: 'm1', instanceId: 'm1', label: 'Swamp' }] };
  check('removal goes at the opponent’s creature', answerDecision(game, 'me', kill) === 'o1');
  const pay = { kind: 'choose-one', key: 'cost:sacrifice', source: 'Altar', title: 'Altar — pay cost', prompt: 'Choose a creature to sacrifice.', options: [{ id: 'o1', instanceId: 'o1', label: 'Big Beast' }, { id: 'm1', instanceId: 'm1', label: 'Swamp' }] };
  check('a required cost is paid with the bot’s own cheapest thing', answerDecision(game, 'me', pay) === 'm1');
  const r = seeded(7), r2 = seeded(7);
  check('the seeded generator repeats', [1, 2, 3].map(() => r()).join() === [1, 2, 3].map(() => r2()).join());
}

section('Full games');
const pod = ['Elven Empire', 'Animated Army', 'Draconic Domination', 'Draconic Destruction'].map(deck);
const results = [];
for (const seed of [1, 7920, 15839, 23758]) {
  const t0 = Date.now();
  const r = playMatch({ decks: pod, seed, maxRounds: 12 });
  results.push({ ...r, me: 0 });
  check(`4-player game, seed ${seed}: ${r.reason} in round ${r.rounds}, ${Date.now() - t0} ms, no problems`, r.problems.length === 0 && ['won', 'turn limit'].includes(r.reason), r.problems.join(' / ').slice(0, 600));
}
check('most games end with a winner', results.filter(r => r.winner >= 0).length >= 3, results.map(r => r.reason).join(', '));
check('every deck casts spells', results.every(r => r.players.every(p => (p.stats.spells || 0) > 0)), JSON.stringify(results.map(r => r.players.map(p => p.stats.spells))));
{
  const a = playMatch({ decks: pod, seed: 42, maxRounds: 6 }), b = playMatch({ decks: pod, seed: 42, maxRounds: 6 });
  check('the same seed plays the same game', JSON.stringify(a) === JSON.stringify(b));
}
{
  const r = playMatch({ decks: [deck('Token Triumph'), deck('Grave Danger')], seed: 3, maxRounds: 15 });
  check(`1-on-1 game: ${r.reason} in round ${r.rounds}, no problems`, r.problems.length === 0 && ['won', 'turn limit'].includes(r.reason), r.problems.join(' / ').slice(0, 600));
}
{
  const s = summarize(results);
  check('summary counts the games and wins', s.games === 4 && s.wins === results.filter(r => r.winner === 0).length && s.wins + s.unfinished <= 4);
}
done();

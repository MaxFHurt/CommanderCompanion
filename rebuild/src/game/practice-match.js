// Real practice games (roadmap 5.3): full Commander games on the rules engine, every seat played by the bot (bot.js).
// Used by the Deck Builder's background helper (deck/match-worker.js) to measure how a deck does against opponents,
// beyond the mana-only practice games it plays alone. Runs synchronously; one 4-player game takes about a second.
//
// playMatch({ decks, seed, maxRounds }) → {
//   winner: seat index or -1 (nobody by the turn limit), turns, reason,
//   players: [{ name, life, eliminated, outTurn, commanderTurn, stats }],
//   handResolved: { cardName: times } (cards the engine left to be resolved by hand; the bot skips them), problems: [text]
// }
// decks: [{ name, commanders: [card name], cards: [{ card: Scryfall-shaped card, quantity }] }]; the commanders are among the cards.

import { scryfallToDefinition } from '../data/card-api.js';
import { createGame } from './setup.js';
import { createController } from './controller.js';
import { botIntent } from './bot.js';

/** A small, fast seeded generator (mulberry32). */
export function seeded(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setupFor(deck, i, defsById) {
  const manifest = [], commanderIds = [];
  const wanted = new Set((deck.commanders || []).map(n => String(n).toLowerCase()));
  for (const row of deck.cards || []) {
    const def = scryfallToDefinition(row.card);
    if (!defsById.has(def.definitionId)) defsById.set(def.definitionId, def);
    manifest.push({ definitionId: def.definitionId, quantity: Number(row.quantity || 1) });
    if (wanted.has(String(def.combinedName || '').toLowerCase()) || wanted.has(String(def.name || '').toLowerCase())) commanderIds.push(def.definitionId);
  }
  return { name: deck.name || `Deck ${i + 1}`, deckName: deck.name || '', manifest, commanderIds };
}

/** Play one full game. Math.random is seeded for the length of the game, so the same seed plays the same game. */
export function playMatch({ decks, seed = 1, maxRounds = 12, maxSteps = 12000 } = {}) {
  const rng = seeded(seed);
  const saved = Math.random;
  Math.random = rng;
  const problems = [], handResolved = {};
  let game;
  try {
    const defsById = new Map();
    const players = decks.map((d, i) => setupFor(d, i, defsById));
    game = createGame({ players, definitions: [...defsById.values()], firstPlayer: 'random', rules: { priorityTimer: 0 }, mode: 'fully-tracked', deviceMode: 'multi-device' });
    const ctl = createController(game);
    // turnNumber counts every player's turn: a round is one turn each
    const maxTurns = maxRounds * game.players.length;
    const memos = game.players.map(() => ({ failed: new Set(), used: new Set() }));
    const out = game.players.map(() => ({ outTurn: null, commanderTurn: null }));
    const as = i => ({ playerId: game.players[i].playerId, isHost: false });
    let idle = 0, stepCount = 0, turnAt = 0, turnSteps = 0;
    const maxTurnSteps = 500;
    const trail = [];   // the last moves, to describe a loop
    for (let step = 0; step < maxSteps && game.status !== 'complete' && game.turnNumber <= maxTurns; step++) {
      stepCount++;
      if (game.turnNumber !== turnAt) { turnAt = game.turnNumber; turnSteps = 0; }
      // A turn that never ends (a loop the bot cannot see): end it, and say so.
      if (++turnSteps === maxTurnSteps) {
        problems.push(`turn ${game.turnNumber} took over ${maxTurnSteps} moves: ${trail.slice(-4).join(' | ')}`);
        const ap = game.players.findIndex(p => p.playerId === game.activePlayerId);
        if (game.flow.op?.decision?.cancellable !== false) ctl.dispatch({ type: 'cancel' }, as(Math.max(0, ap)));
        ctl.dispatch({ type: 'end-turn' }, as(Math.max(0, ap)));
      }
      if (turnSteps > maxTurnSteps + 200) break;
      const actor = ctl.actorId();
      const i = game.players.findIndex(p => p.playerId === actor);
      if (i < 0) { problems.push(`nobody can act (turn ${game.turnNumber})`); break; }
      const view = ctl.view(as(i));
      const memo = memos[i];
      const { intent, guided } = botIntent(game, view, i, memo, rng);
      if (!intent) { problems.push(`no move for ${view.prompt.kind} (turn ${game.turnNumber})`); break; }
      if (guided) handResolved[guided] = (handResolved[guided] || 0) + 1;
      let r;
      try { r = ctl.dispatch(intent, as(i)); } catch (e) { problems.push(`${intent.type} threw: ${String(e?.message || e).slice(0, 200)}`); break; }
      trail.push(`${game.turnNumber} ${view.phase} P${i + 1} ${view.prompt.kind}:${intent.type}${intent.key ? ` ${intent.key}` : ''}${intent.instanceId ? ` ${game.cardDefinitions[intent.instanceId.split(':').slice(1, -1).join(':')]?.name || intent.instanceId}` : ''}${r.ok ? '' : ` refused: ${r.error}`}`.slice(0, 160));
      if (trail.length > 12) trail.shift();
      if (r.ok) {
        idle = 0;
        if (intent.type !== 'answer') { memo.tries = 0; memo.lastKey = null; }
        if (intent.type === 'play' || intent.type === 'activate') memo.lastPlay = intent.instanceId;
      } else {
        idle++;
        if (intent.type === 'answer') {
          // A refused answer: try the next-best answer, then give up on the play.
          memo.lastKey = intent.key; memo.tries = (memo.tries || 0) + 1;
          // the play that asked is given up for the rest of the turn, so the bot does not start it again
          if (memo.tries > 3 && game.flow.op?.decision?.cancellable !== false) { ctl.dispatch({ type: 'cancel' }, as(i)); memo.tries = 0; memo.lastKey = null; if (memo.lastPlay) memo.failed.add(memo.lastPlay); }
        } else if (intent.type === 'play' || intent.type === 'activate') {
          memo.failed.add(intent.instanceId);
          if (game.flow.op?.decision?.cancellable) ctl.dispatch({ type: 'cancel' }, as(i));
        } else if (intent.type === 'attack') {
          memo.attacked = true;
        }
        if (game.flow.op && game.flow.op.decision?.cancellable && idle > 8) { ctl.dispatch({ type: 'cancel' }, as(i)); if (memo.lastPlay) memo.failed.add(memo.lastPlay); }
        if (idle > 30) { const n = ctl.dispatch({ type: 'next-phase' }, as(i)); if (!n.ok) ctl.dispatch({ type: 'pass' }, as(i)); }
        if (idle > 80) { problems.push(`stuck: ${r.error} (turn ${game.turnNumber})`); break; }
      }
      game.players.forEach((p, k) => {
        if (p.eliminated && out[k].outTurn === null) out[k].outTurn = game.turnNumber;
        if (out[k].commanderTurn === null && (p.commanders || []).some(c => c.zone && c.zone !== 'command')) out[k].commanderTurn = game.turnNumber;
      });
    }
    if (stepCount >= maxSteps) problems.push(`looping (turn ${game.turnNumber}): ${trail.join(' | ')}`);
    const alive = game.players.map((p, k) => (!p.eliminated ? k : -1)).filter(k => k >= 0);
    const byId = game.winner ? game.players.findIndex(p => p.playerId === game.winner) : -1;
    const winner = byId >= 0 ? byId : alive.length === 1 ? alive[0] : -1;
    return {
      winner, turns: game.turnNumber, rounds: Math.ceil(game.turnNumber / game.players.length), reason: winner >= 0 ? 'won' : game.turnNumber > maxTurns ? 'turn limit' : problems.length ? 'stopped' : 'unfinished',
      players: game.players.map((p, k) => ({ name: p.displayName, life: Number(p.life || 0), eliminated: !!p.eliminated, outTurn: out[k].outTurn, commanderTurn: out[k].commanderTurn, stats: { ...(p.stats || {}) } })),
      handResolved, problems, steps: stepCount
    };
  } finally {
    Math.random = saved;
  }
}

/**
 * A short series: the deck (seat 0 in the list, its seat moves round) against the same opponents, `games` times.
 * onGame(i, result) is called after each game. Returns the totals the Deck Builder shows.
 */
export function playSeries({ deck, opponents, games = 8, seed = 1, maxRounds = 12, onGame = null } = {}) {
  const results = [];
  for (let g = 0; g < games; g++) {
    // Rotate the seating so the deck is not always first or last to play (the engine picks the first player at random too).
    const seats = [deck, ...opponents];
    const shift = g % seats.length;
    const order = [...seats.slice(shift), ...seats.slice(0, shift)];
    const me = order.indexOf(deck);
    const r = playMatch({ decks: order, seed: seed + g * 7919, maxRounds });
    const row = { ...r, me };
    results.push(row);
    if (onGame) onGame(g, row);
  }
  return summarize(results);
}

const x0 = results => results[0]?.players.length || 1;

/** Totals over a series: win rate, average winning turn, survival, damage, and the cards most often left to be resolved by hand. */
export function summarize(results) {
  const n = results.length || 1;
  const mine = results.map(r => ({ r, p: r.players[r.me] }));
  const wins = results.filter(r => r.winner === r.me);
  const avg = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const hand = {};
  for (const r of results) for (const [k, v] of Object.entries(r.handResolved || {})) hand[k] = (hand[k] || 0) + v;
  return {
    games: results.length,
    wins: wins.length,
    winRate: wins.length / n,
    // with the turn limit, nobody may win: those games count as unfinished, not losses
    unfinished: results.filter(r => r.winner < 0).length,
    // in rounds (one turn each), as players count turns
    winTurn: avg(wins.map(r => r.rounds)),
    outTurn: avg(mine.filter(x => x.p.eliminated).map(x => x.p.outTurn).filter(t => t != null).map(t => Math.ceil(t / x0(results)))),
    survived: mine.filter(x => !x.p.eliminated).length / n,
    commanderTurn: avg(mine.map(x => x.p.commanderTurn).filter(t => t != null).map(t => Math.ceil(t / x0(results)))),
    damage: avg(mine.map(x => Number(x.p.stats.damage || 0))),
    spells: avg(mine.map(x => Number(x.p.stats.spells || 0))),
    handResolved: Object.entries(hand).sort((a, b) => b[1] - a[1]).slice(0, 12),
    problems: results.flatMap(r => r.problems).slice(0, 10),
    opponents: results[0] ? results[0].players.filter((_, k) => k !== results[0].me).map(p => p.name) : []
  };
}

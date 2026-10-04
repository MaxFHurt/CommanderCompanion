// Table Tracker state. The physical table is the source of truth; this is fast digital
// bookkeeping for life, counters, mana, statuses and a few tracked cards.
//
// Everything here is plain data and pure functions — no DOM, no rules engine.

import { newId } from './helpers.js';

export const TRACKER_SAVE_KEY = 'cc-tracker-v1';
export const PLAYER_COLORS = ['#4d7dff', '#ff5a52', '#3fce6b', '#b06bff', '#f2c14e', '#35c9c3'];
export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
export const MANA_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };

/** Statuses only one player can hold at a time. */
const EXCLUSIVE_STATUSES = new Set(['Monarch', 'The Initiative']);
export const STATUS_PRESETS = ['Monarch', 'The Initiative', "City's Blessing", 'Day', 'Night', 'Ring-bearer', 'Stunned', 'Blessed'];
export const PLAYER_COUNTER_PRESETS = ['Energy', 'Experience', 'Rad', 'Ticket', 'Storm count', 'Treasure', 'Food', 'Clue', 'Blood', 'Luck', 'Wish'];
// Counters that sit on a card, grouped the way the counter dice are sold.
export const CARD_COUNTER_GROUPS = [
  ['Power and toughness', ['+1/+1', '-1/-1', '+1/+0', '+0/+1', '+2/+2', '-0/-1']],
  ['Ability counters', ['Flying', 'First strike', 'Double strike', 'Deathtouch', 'Hexproof', 'Indestructible', 'Lifelink', 'Menace', 'Reach', 'Trample', 'Vigilance', 'Haste']],
  ['Other card counters', ['Loyalty', 'Charge', 'Shield', 'Stun', 'Lore', 'Time', 'Oil', 'Finality', 'Bounty', 'Quest', 'Level', 'Fade', 'Age', 'Storage', 'Verse', 'Defense', 'Divinity', 'Flood']]
];
export const CARD_COUNTER_PRESETS = CARD_COUNTER_GROUPS.flatMap(([, names]) => names);

// Life-gain decks can run very high; this is only a guard against typos.
const MAX_LIFE = 999999;
// Repeated taps on the same value within this window collapse into one log line.
const MERGE_WINDOW_MS = 4000;

export function createTracker({ players = [], startingLife = 40 } = {}) {
  if (players.length < 2 || players.length > 6) throw new Error('Table Tracker supports 2–6 players.');
  const state = {
    kind: 'tracker',
    version: 1,
    id: newId('table'),
    startedAt: new Date().toISOString(),
    startingLife,
    turn: 1,
    players: players.map((p, i) => createPlayer(p, i, startingLife)),
    activeId: null,
    log: [],
    result: null
  };
  state.activeId = state.players[0].id;
  return state;
}

function createPlayer(seed = {}, index = 0, startingLife = 40) {
  return {
    id: seed.id || newId('tp'),
    name: String(seed.name || '').trim() || `Player ${index + 1}`,
    color: seed.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
    matId: seed.matId || null,
    life: startingLife,
    poison: 0,
    statuses: [],
    counters: {},
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    commander: { name: String(seed.commander || '').trim(), tax: 0 },
    commanderDamage: {},
    cards: [],
    eliminated: false
  };
}

export function trackerPlayer(state, id) {
  return state.players.find(p => p.id === id) || null;
}

function addLog(state, playerId, text, tag = null) {
  const entry = { id: newId('tl'), at: new Date().toISOString(), playerId, text, tag };
  state.log.unshift(entry);
  if (state.log.length > 300) state.log.length = 300;
  return entry;
}

function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Log a numeric change. Rapid changes to the same value (same `key`) by the same player are
 * merged, so tapping −1 four times reads "40 → 36 (−4)" instead of four lines.
 */
function logChange(state, player, key, before, after, describe) {
  if (before === after) return;
  const last = state.log[0];
  const recent = last && last.tag === key && last.playerId === player.id && Date.now() - Date.parse(last.at) < MERGE_WINDOW_MS;
  const from = recent ? last.from : before;
  if (recent && from === after) { state.log.shift(); return; }   // changed and changed back
  const text = describe(from, after);
  if (recent) { last.text = text; last.at = new Date().toISOString(); }
  else addLog(state, player.id, text, key).from = from;
}

/**
 * Apply one bookkeeping action. Mutates and returns `state`.
 * Throws an Error with a readable message when the action is not possible.
 */
export function trackerApply(state, action) {
  const p = action.playerId ? trackerPlayer(state, action.playerId) : null;
  const need = () => { if (!p) throw new Error('That player is not at this table.'); return p; };

  switch (action.type) {
    case 'life': {
      const player = need();
      const before = player.life;
      player.life = Math.max(0, Math.min(MAX_LIFE, action.set !== undefined ? Number(action.set) : before + Number(action.delta || 0)));
      logChange(state, player, 'life', before, player.life, (from, to) => `${player.name}: Life ${from} → ${to} (${signed(to - from)})`);
      return state;
    }
    case 'poison': {
      const player = need();
      const before = player.poison;
      player.poison = Math.max(0, Math.min(99, before + Number(action.delta || 0)));
      logChange(state, player, 'poison', before, player.poison, (from, to) => `${player.name}: Poison ${from} → ${to}`);
      return state;
    }
    case 'status': {
      const player = need();
      const name = String(action.status || '').trim().slice(0, 28);
      if (!name) throw new Error('Enter a status name.');
      const has = player.statuses.includes(name);
      const enable = action.enabled === undefined ? !has : !!action.enabled;
      if (enable === has) return state;
      if (enable) {
        if (EXCLUSIVE_STATUSES.has(name)) {
          for (const other of state.players) other.statuses = other.statuses.filter(s => s !== name);
        }
        player.statuses.push(name);
        addLog(state, player.id, `${player.name}: ${name} status set`);
      } else {
        player.statuses = player.statuses.filter(s => s !== name);
        addLog(state, player.id, `${player.name}: ${name} status removed`);
      }
      return state;
    }
    case 'counter': {
      const player = need();
      const name = String(action.name || '').trim().slice(0, 28);
      if (!name) throw new Error('Enter a counter name.');
      const before = Number(player.counters[name] || 0);
      if (action.remove) {
        if (name in player.counters) { delete player.counters[name]; addLog(state, player.id, `${player.name}: ${name} counter removed`); }
        return state;
      }
      const value = Math.max(0, Math.min(999, action.set !== undefined ? Number(action.set) : before + Number(action.delta || 0)));
      const isNew = !(name in player.counters);
      player.counters[name] = value;
      if (isNew) addLog(state, player.id, `${player.name}: Now tracking ${name} counters (${value})`, `counter:${name}`).from = 0;
      else logChange(state, player, `counter:${name}`, before, value, (from, to) => `${player.name}: ${name} counters ${from} → ${to}`);
      return state;
    }
    case 'mana': {
      const player = need();
      if (action.clear) {
        if (MANA_COLORS.some(c => player.mana[c] > 0)) {
          for (const c of MANA_COLORS) player.mana[c] = 0;
          addLog(state, player.id, `${player.name}: mana pool emptied`);
        }
        return state;
      }
      const color = action.color;
      if (!MANA_COLORS.includes(color)) throw new Error('Unknown mana color.');
      const before = player.mana[color];
      player.mana[color] = Math.max(0, Math.min(99, before + Number(action.delta || 0)));
      logChange(state, player, `mana:${color}`, before, player.mana[color], (from, to) => `${player.name}: ${MANA_NAMES[color]} mana ${from} → ${to}`);
      return state;
    }
    case 'name': {
      const player = need();
      const next = String(action.name || '').trim().slice(0, 24);
      if (!next) throw new Error('Enter a player name.');
      if (next !== player.name) {
        addLog(state, player.id, `${player.name}: Name changed to ${next}`);
        player.name = next;
      }
      return state;
    }
    case 'mat': {
      need().matId = action.matId || null;
      return state;
    }
    case 'commander': {
      const player = need();
      player.commander.name = String(action.name || '').trim().slice(0, 60);
      return state;
    }
    case 'tax': {
      const player = need();
      const before = player.commander.tax;
      player.commander.tax = Math.max(0, Math.min(98, before + Number(action.delta || 0)));
      logChange(state, player, 'tax', before, player.commander.tax, (from, to) => `${player.name}: Commander tax ${from} → ${to}`);
      return state;
    }
    case 'commander-damage': {
      const player = need();
      const from = trackerPlayer(state, action.fromId);
      if (!from) throw new Error('Choose whose commander dealt the damage.');
      const before = Number(player.commanderDamage[from.id] || 0);
      const value = Math.max(0, Math.min(99, before + Number(action.delta || 0)));
      if (value === before) return state;
      player.commanderDamage[from.id] = value;
      logChange(state, player, `cmd:${from.id}`, before, value, (a, b) => `${player.name}: Commander damage from ${from.name} ${a} → ${b}`);
      // Commander damage is also damage, so life moves with it unless the caller opts out.
      if (action.alsoLife !== false) {
        player.life = Math.max(0, player.life - (value - before));
      }
      return state;
    }
    case 'card-add': {
      const player = need();
      const name = String(action.name || '').trim().slice(0, 80);
      if (!name) throw new Error('Enter a card name.');
      if (player.cards.length >= 12) throw new Error('Remove a tracked card before adding another.');
      player.cards.push({ id: newId('tc'), name, image: action.image || '', counters: {} });
      addLog(state, player.id, `${player.name}: Now tracking ${name}`);
      return state;
    }
    case 'card-counter': {
      const player = need();
      const card = player.cards.find(c => c.id === action.cardId);
      if (!card) throw new Error('That card is no longer tracked.');
      const name = String(action.name || '').trim().slice(0, 28);
      if (!name) throw new Error('Enter a counter name.');
      const before = Number(card.counters[name] || 0);
      const value = Math.max(0, Math.min(999, before + Number(action.delta || 0)));
      if (value === 0) delete card.counters[name]; else card.counters[name] = value;
      logChange(state, player, `card:${card.id}:${name}`, before, value, (from, to) => `${player.name}: ${card.name} — ${name} counters ${from} → ${to}`);
      return state;
    }
    case 'card-remove': {
      const player = need();
      const card = player.cards.find(c => c.id === action.cardId);
      if (!card) return state;
      player.cards = player.cards.filter(c => c.id !== action.cardId);
      addLog(state, player.id, `${player.name}: Stopped tracking ${card.name}`);
      return state;
    }
    case 'eliminate': {
      const player = need();
      player.eliminated = action.eliminated !== false;
      addLog(state, player.id, `${player.name}: ${player.eliminated ? 'Out of the game' : 'Back in the game'}`);
      if (player.eliminated && state.activeId === player.id) advanceTurn(state);
      return state;
    }
    case 'active': {
      const player = need();
      if (state.activeId !== player.id) {
        state.activeId = player.id;
        addLog(state, player.id, `${player.name}: Turn ${state.turn} — now the active player`);
      }
      return state;
    }
    case 'next-turn':
      advanceTurn(state);
      return state;
    case 'add-player': {
      if (state.players.length >= 6) throw new Error('Table Tracker supports up to 6 players.');
      const player = createPlayer({ name: action.name }, state.players.length, state.startingLife);
      state.players.push(player);
      addLog(state, player.id, `${player.name}: Joined the table`);
      return state;
    }
    case 'remove-player': {
      const player = need();
      if (state.players.length <= 2) throw new Error('A table needs at least 2 players.');
      state.players = state.players.filter(x => x.id !== player.id);
      for (const other of state.players) delete other.commanderDamage[player.id];
      if (state.activeId === player.id) state.activeId = state.players[0].id;
      addLog(state, null, `${player.name} left the table`);
      return state;
    }
    case 'clear-log':
      state.log = [];
      return state;
    case 'reset': {
      for (const player of state.players) {
        player.life = state.startingLife;
        player.poison = 0;
        player.statuses = [];
        player.counters = {};
        player.mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
        player.commander.tax = 0;
        player.commanderDamage = {};
        player.cards = [];
        player.eliminated = false;
      }
      state.turn = 1;
      state.activeId = state.players[0].id;
      state.result = null;
      state.log = [];
      state.startedAt = new Date().toISOString();
      state.id = newId('table');
      addLog(state, null, 'New game — table reset');
      return state;
    }
    case 'end-game': {
      const winner = action.winnerId ? trackerPlayer(state, action.winnerId) : null;
      state.result = { winnerId: winner?.id || null, at: new Date().toISOString() };
      addLog(state, winner?.id || null, winner ? `${winner.name} wins the game` : 'Game ended in a draw');
      return state;
    }
    default:
      throw new Error(`Unknown tracker action: ${action.type}`);
  }
}

function advanceTurn(state) {
  const alive = state.players.filter(p => !p.eliminated);
  if (!alive.length) return;
  const seats = state.players;
  const start = Math.max(0, seats.findIndex(p => p.id === state.activeId));
  for (let step = 1; step <= seats.length; step++) {
    const next = seats[(start + step) % seats.length];
    if (next.eliminated) continue;
    // Mana empties between turns.
    for (const player of seats) for (const c of MANA_COLORS) player.mana[c] = 0;
    state.activeId = next.id;
    state.turn += 1;
    addLog(state, next.id, `${next.name}: Turn ${state.turn} begins`);
    return;
  }
}

/** Reasons a player would have lost under standard Commander rules (shown as a hint, never enforced). */
export function lossHints(state, player) {
  const hints = [];
  if (player.life <= 0) hints.push('0 life');
  if (player.poison >= 10) hints.push('10 poison');
  for (const [fromId, amount] of Object.entries(player.commanderDamage || {})) {
    if (amount >= 21) hints.push(`21 commander damage from ${trackerPlayer(state, fromId)?.name || 'a commander'}`);
  }
  return hints;
}

/** Shape expected by the profile's game history. */
export function trackerToGameRecord(state) {
  return {
    completionId: `table:${state.id}`,
    mode: 'table-tracker',
    winner: state.result?.winnerId || null,
    result: state.result?.winnerId ? 'winner' : 'draw',
    turnNumber: state.turn,
    cardDefinitions: {},
    postGame: { awards: [] },
    players: state.players.map(p => ({
      playerId: p.id,
      displayName: p.name,
      life: p.life,
      commanders: p.commander.name ? [{ card: { name: p.commander.name } }] : [],
      deck: { sourceName: p.commander.name || '' }
    }))
  };
}

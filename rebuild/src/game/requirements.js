// Turns the effect compiler's "requirements" (targets, modes, numbers, card choices) into
// decisions a player answers, and collects the answers into effect bindings.
//
// Nothing here changes game state. An operation asks for what it needs with `ask(key, build)`;
// if the answer is not recorded yet, `ask` throws a Need and the controller shows the decision.
// When the answer arrives the operation is simply run again from the top.

import { CREATURE_TYPES } from '../data/creature-types.js';
import { COLOR_NAMES, defOf, opponentsOf, alivePlayers, playerById, plural } from './helpers.js';

export class Need {
  constructor(spec) { this.spec = spec; }
}

/** Requirement kinds answered while casting/activating (targets are locked in then). */
const CAST_TIME = new Set(['target', 'player', 'graveyard-target', 'stack-target', 'multi-target', 'per-opponent-up-to-one', 'number']);

export function splitRequirements(requirements = []) {
  const cast = [], resolve = [];
  for (const req of requirements) (CAST_TIME.has(req.kind) ? cast : resolve).push(req);
  return { cast, resolve };
}

export function makeAsk(op) {
  return (key, build) => {
    if (Object.prototype.hasOwnProperty.call(op.answers, key)) return op.answers[key];
    throw new Need({ key, ...build() });
  };
}

function cardOption(game, card, owner, sub = '') {
  const d = defOf(game, card);
  return {
    id: card.instanceId,
    label: d?.name || 'Card',
    sub: sub || `${owner?.displayName || ''}${d?.typeLine ? ` — ${d.typeLine}` : ''}`,
    instanceId: card.instanceId,
    definitionId: card.definitionId
  };
}

function playerOption(player) {
  return { id: player.playerId, label: player.displayName, sub: `Player — life ${player.life}`, playerId: player.playerId };
}

function isCombatParticipant(game, instanceId) {
  const cs = game.combatState || {};
  if ((cs.attackers || []).some(a => a.instanceId === instanceId)) return true;
  return Object.values(cs.blocks || {}).some(row => (row?.assignments || []).some(x => x.blockerId === instanceId));
}

/** Does a battlefield card match a target phrase such as "target artifact or enchantment you control"? */
function matchesPermanentScope(game, card, scope) {
  const t = String(defOf(game, card)?.typeLine || '');
  if (/artifact or enchantment/.test(scope)) { if (!/(Artifact|Enchantment)/i.test(t)) return false; }
  else if (/creature or planeswalker/.test(scope)) { if (!/(Creature|Planeswalker)/i.test(t)) return false; }
  else {
    if (/creature/.test(scope) && !/Creature/i.test(t)) return false;
    if (/artifact/.test(scope) && !/Artifact/i.test(t)) return false;
    if (/enchantment/.test(scope) && !/Enchantment/i.test(t)) return false;
    if (/planeswalker/.test(scope) && !/Planeswalker/i.test(t)) return false;
    if (/equipment/.test(scope) && !/Equipment/i.test(t)) return false;
  }
  if (/nonland permanent/.test(scope) && /Land/i.test(t)) return false;
  if (/\bland\b/.test(scope) && !/nonland/.test(scope) && !/Land/i.test(t)) return false;
  if (/\bbattle\b/.test(scope) && !/Battle/i.test(t)) return false;
  if (/attacking or blocking/.test(scope) && !isCombatParticipant(game, card.instanceId)) return false;
  if (/with a counter on it/.test(scope) && !Object.values(card.counters || {}).some(v => Number(v) > 0)) return false;
  return true;
}

/** Legal choices for a single-target style requirement. */
export function candidatesFor(game, req, player) {
  const scope = String(req?.scope || '').toLowerCase();
  const out = [];
  if (req.kind === 'player') {
    const rows = scope === 'opponent' ? opponentsOf(game, player.playerId) : alivePlayers(game);
    return rows.map(playerOption);
  }
  if (req.kind === 'graveyard-target') {
    const owners = /your/.test(scope) ? [player] : game.players;
    for (const q of owners) for (const c of q.deck.graveyard || []) {
      const t = String(defOf(game, c)?.typeLine || '');
      if (/creature/.test(scope) && !/Creature/i.test(t)) continue;
      if (/artifact/.test(scope) && !/Artifact/i.test(t)) continue;
      if (/\bland\b/.test(scope) && !/Land/i.test(t)) continue;
      if (/instant or sorcery/.test(scope) && !/(Instant|Sorcery)/i.test(t)) continue;
      out.push(cardOption(game, c, q, `${q.displayName}'s graveyard — ${t}`));
    }
    return out;
  }
  if (req.kind === 'stack-target') {
    return (game.stack || [])
      .filter(x => req.scope !== 'spell' || x.kind === 'spell')
      .map(x => ({ id: x.id, label: x.label || 'Stack object', sub: playerById(game, x.controllerId)?.displayName || x.kind, definitionId: x.sourceDefinitionId }));
  }
  if (req.kind === 'target') {
    if (/any target|any other target|target player|target opponent/.test(scope)) {
      for (const q of alivePlayers(game)) {
        if (/opponent/.test(scope) && q.playerId === player.playerId) continue;
        out.push(playerOption(q));
      }
    }
    if (/any target|any other target|creature|permanent|artifact|enchantment|planeswalker|land|battle|equipment/.test(scope)) {
      const anyTarget = /any (?:other )?target/.test(scope);
      const dontControl = /you don'?t control/.test(scope);
      const owners = dontControl ? opponentsOf(game, player.playerId) : /you control|your /.test(scope) ? [player] : alivePlayers(game);
      for (const q of owners) for (const c of q.deck.battlefield || []) {
        if (anyTarget) {
          if (!/Creature|Planeswalker|Battle/i.test(defOf(game, c)?.typeLine || '')) continue;
        } else if (!matchesPermanentScope(game, c, scope)) continue;
        out.push(cardOption(game, c, q));
      }
    }
  }
  return out;
}

function battlefieldRows(game, owner, filter = 'permanent') {
  const f = String(filter || 'permanent').toLowerCase();
  return (owner.deck.battlefield || [])
    .filter(c => {
      const t = String(defOf(game, c)?.typeLine || '').toLowerCase();
      if (f === 'permanent') return true;
      if (f === 'artifact or enchantment') return /artifact|enchantment/.test(t);
      return t.includes(f);
    })
    .map(c => cardOption(game, c, owner));
}

function requirementAmount(req, bindings) {
  if (typeof req.amount === 'number') return req.amount;
  if (String(req.amount).toUpperCase() === 'X') return Number(bindings.X || 0);
  return Number(req.amount || 1);
}

/**
 * Ask for every requirement in `reqs` and write the answers into `bindings`.
 * `ctx` = { player (the controller of the effect), sourceName, cancellable }.
 */
export function gatherRequirements(game, ctx, reqs, bindings, ask, prefix = 'req') {
  const { player, sourceName = 'Effect' } = ctx;
  const cancellable = ctx.cancellable !== false;
  const base = { playerId: player.playerId, cancellable, source: sourceName };

  reqs.forEach((req, index) => {
    const key = `${prefix}:${index}:${req.kind}`;
    const title = `${sourceName} — ${req.label || 'Choose'}`;

    if (req.kind === 'number') {
      const min = Number(req.min || 0), max = Number(req.max ?? 99);
      bindings[req.bind] = ask(key, () => ({ ...base, kind: 'number', title, prompt: req.label || 'Choose a number', min, max }));
      return;
    }
    if (req.kind === 'color') {
      const colors = ['W', 'U', 'B', 'R', 'G', ...(req.includeColorless ? ['C'] : [])].filter(c => !(req.exclude || []).includes(c));
      bindings[req.bind] = ask(key, () => ({
        ...base, kind: 'choose-one', title, prompt: req.label || 'Choose a color',
        options: colors.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c }))
      }));
      return;
    }
    if (req.kind === 'creature-type-choice') {
      bindings[req.bind] = ask(key, () => ({
        ...base, kind: 'text', title, prompt: 'Choose a creature type', suggestions: CREATURE_TYPES, mustMatchSuggestion: true
      }));
      return;
    }
    if (req.kind === 'text-choice') {
      bindings[req.bind] = ask(key, () => ({ ...base, kind: 'text', title, prompt: req.label || 'Enter a choice' }));
      return;
    }
    if (req.kind === 'per-opponent-up-to-one') {
      const chosen = {};
      for (const q of opponentsOf(game, player.playerId)) {
        const rows = battlefieldRows(game, q, req.filter || 'permanent');
        if (!rows.length) { chosen[q.playerId] = null; continue; }
        chosen[q.playerId] = ask(`${key}:${q.playerId}`, () => ({
          ...base, kind: 'choose-one', title: `${sourceName} — ${q.displayName}`,
          prompt: `Choose up to one ${req.filter || 'permanent'} controlled by ${q.displayName}.`,
          options: rows, allowNone: true, noneLabel: 'No target'
        }));
      }
      bindings[req.bind] = chosen;
      return;
    }
    if (req.kind === 'multi-target') {
      const max = Math.max(0, Number(req.max || 1)), min = Math.max(0, Number(req.min || 0));
      const rows = candidatesFor(game, { kind: 'target', scope: req.scope }, player);
      bindings[req.bind] = rows.length
        ? ask(key, () => ({ ...base, kind: 'choose-many', title, prompt: req.label || `Choose up to ${max}`, options: rows, min: Math.min(min, rows.length), max: Math.min(max, rows.length) }))
        : [];
      return;
    }
    if (req.kind === 'card-selection') {
      const amount = requirementAmount(req, bindings);
      const targets = req.scope === 'each-opponent' ? opponentsOf(game, player.playerId)
        : req.scope === 'each-player' ? alivePlayers(game)
        : req.playerBind ? [playerById(game, bindings[req.playerBind])].filter(Boolean)
        : [player];
      const chosen = {};
      for (const q of targets) {
        const rows = battlefieldRows(game, q, req.filter);
        const need = Math.min(amount, rows.length);
        // The affected player chooses what they sacrifice, on their own device.
        chosen[q.playerId] = need === 0 ? [] : need === rows.length ? rows.map(r => r.id)
          : ask(`${key}:${q.playerId}`, () => ({
            ...base, playerId: q.playerId, cancellable: false, kind: 'choose-many',
            title: `${sourceName} — ${q.displayName}`,
            prompt: `${q.displayName}: choose ${plural(need, req.filter || 'permanent')} (${req.label || 'required by the effect'}).`,
            options: rows, min: need, max: need
          }));
      }
      bindings[req.bind] = targets.length === 1 && !['each-opponent', 'each-player'].includes(req.scope) ? (chosen[targets[0].playerId] || []) : chosen;
      return;
    }
    if (req.kind === 'discard-cards') {
      const amount = requirementAmount(req, bindings);
      const targets = req.scope === 'each-opponent' ? opponentsOf(game, player.playerId)
        : req.scope === 'each-player' ? alivePlayers(game)
        : [playerById(game, req.playerBind ? bindings[req.playerBind] : player.playerId)].filter(Boolean);
      const chosen = {};
      for (const q of targets) {
        const hand = q.deck.hand || [];
        const need = Math.min(amount, hand.length);
        chosen[q.playerId] = need === 0 ? [] : need === hand.length ? hand.map(c => c.instanceId)
          : ask(`${key}:${q.playerId}`, () => ({
            ...base, playerId: q.playerId, cancellable: false, kind: 'choose-many', private: true,
            title: `${sourceName} — Discard`,
            prompt: `${q.displayName}: choose ${plural(need, 'card')} to discard.`,
            options: hand.map(c => cardOption(game, c, q, 'Your hand')), min: need, max: need
          }));
      }
      bindings[req.bind] = ['each-opponent', 'each-player'].includes(req.scope) ? chosen : (chosen[targets[0]?.playerId] || []);
      return;
    }
    if (req.kind === 'scry' || req.kind === 'surveil') {
      const amount = Math.max(0, requirementAmount(req, bindings));
      const top = (player.deck.remainingLibrary || []).slice(0, amount);
      const otherZone = req.kind === 'scry' ? 'bottom' : 'graveyard';
      if (!top.length) { bindings[req.bind] = { top: [], [otherZone]: [] }; return; }
      const answer = ask(key, () => ({
        ...base, cancellable: false, kind: 'arrange', private: true,
        title: `${sourceName} — ${req.kind === 'scry' ? 'Scry' : 'Surveil'} ${amount}`,
        prompt: `Look at the top ${plural(top.length, 'card')} of your library. Keep cards on top in the order shown, or send them to the ${otherZone === 'bottom' ? 'bottom' : 'graveyard'}.`,
        cards: top.map(c => cardOption(game, c, player, 'Top of library')),
        otherLabel: otherZone === 'bottom' ? 'Bottom of library' : 'Graveyard'
      }));
      bindings[req.bind] = { top: answer.top || [], [otherZone]: answer.other || [] };
      return;
    }
    if (req.kind === 'proliferate') {
      const rows = [];
      for (const q of alivePlayers(game)) {
        if (Number(q.poison || 0) > 0) rows.push({ id: `player|${q.playerId}|poison`, label: q.displayName, sub: `poison (${q.poison})`, pick: { kind: 'player', id: q.playerId, counter: 'poison' } });
        for (const [k, v] of Object.entries(q.counters || {})) {
          if (Number(v) > 0 && !/ThisTurn$|^damageDealt$|^failedDraws$/.test(k)) rows.push({ id: `player|${q.playerId}|${k}`, label: q.displayName, sub: `${k} (${v})`, pick: { kind: 'player', id: q.playerId, counter: k } });
        }
        for (const c of q.deck.battlefield || []) for (const [k, v] of Object.entries(c.counters || {})) {
          if (Number(v) > 0) rows.push({ id: `card|${c.instanceId}|${k}`, label: defOf(game, c)?.name || 'Permanent', sub: `${k} (${v}) — ${q.displayName}`, instanceId: c.instanceId, definitionId: c.definitionId, pick: { kind: 'card', id: c.instanceId, counter: k } });
        }
      }
      if (!rows.length) { bindings[req.bind] = []; return; }
      const ids = ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title: `${sourceName} — Proliferate`, prompt: 'Choose any number of players and permanents with counters. Each gets one more of a counter it already has.', options: rows, min: 0, max: rows.length }));
      const seen = new Set(), picks = [];
      for (const id of ids) {
        const row = rows.find(r => r.id === id);
        if (!row) continue;
        const objectKey = `${row.pick.kind}:${row.pick.id}`;
        if (seen.has(objectKey)) continue;
        seen.add(objectKey);
        picks.push(row.pick);
      }
      bindings[req.bind] = picks;
      return;
    }

    // Single choice: target, player, graveyard-target, stack-target.
    let rows = candidatesFor(game, req, player);
    if (req.excludeBind && bindings[req.excludeBind]) rows = rows.filter(r => r.id !== bindings[req.excludeBind]);
    if (!rows.length) throw new NoLegalChoice(`No legal choice is available for "${req.label || req.scope || 'this effect'}".`);
    bindings[req.bind] = ask(key, () => ({ ...base, kind: 'choose-one', title, prompt: `Choose ${req.label || 'a target'}.`, options: rows, targeting: true }));
  });
  return bindings;
}

/** Thrown while gathering when a required target does not exist. The action is illegal. */
export class NoLegalChoice extends Error {
  constructor(message) { super(message); this.name = 'NoLegalChoice'; }
}

/** Check an answer against the decision it answers. Returns the cleaned value or throws. */
export function validateAnswer(decision, value) {
  const optionIds = new Set((decision.options || []).filter(o => !o.disabled).map(o => o.id));
  switch (decision.kind) {
    case 'choose-one':
      if ((value === null || value === undefined || value === '') && decision.allowNone) return null;
      if (!optionIds.has(value)) throw new Error('Choose one of the listed options.');
      return value;
    case 'choose-many': {
      const ids = [...new Set(Array.isArray(value) ? value : [])];
      if (ids.some(id => !optionIds.has(id))) throw new Error('A selected option is not available.');
      const min = Number(decision.min || 0), max = Number(decision.max ?? ids.length);
      if (ids.length < min || ids.length > max) throw new Error(min === max ? `Choose exactly ${min}.` : `Choose between ${min} and ${max}.`);
      return ids;
    }
    case 'number': {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n) || n < Number(decision.min || 0) || n > Number(decision.max ?? 99)) throw new Error(`Enter a number from ${decision.min || 0} to ${decision.max ?? 99}.`);
      return n;
    }
    case 'text': {
      const text = String(value || '').trim();
      if (!text) throw new Error('Enter a value.');
      if (decision.mustMatchSuggestion) {
        const hit = (decision.suggestions || []).find(s => s.toLowerCase() === text.toLowerCase());
        if (!hit) throw new Error('Choose one of the suggested values.');
        return hit;
      }
      return text.slice(0, 80);
    }
    case 'confirm':
      return value === true;
    case 'arrange': {
      const all = new Set((decision.cards || []).map(c => c.id));
      const top = Array.isArray(value?.top) ? value.top : [], other = Array.isArray(value?.other) ? value.other : [];
      const given = [...top, ...other];
      if (given.length !== all.size || new Set(given).size !== all.size || given.some(id => !all.has(id))) throw new Error('Place every card either on top or in the other pile.');
      return { top, other };
    }
    default:
      return value;
  }
}

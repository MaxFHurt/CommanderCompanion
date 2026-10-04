// Direct changes to the game used by Free Play, by the host/judge, and while a player resolves
// an unsupported card by hand. Every edit is logged so the table can see what was changed.

import { evaluateLosses, normalizeRulesConfig } from '../engine/rules.js';
import { shuffleLibrary, sync } from '../engine/deck.js';
import { createCardInstance } from '../engine/schema.js';
import { COLORS, GameError, clampInt, defOf, findCard, log, newId, playerById, plural } from './helpers.js';
import { commit } from './ops.js';
import { stackTop } from './legal.js';
import { attach } from './attachments.js';

const ZONES = { hand: 'hand', battlefield: 'battlefield', graveyard: 'graveyard', exile: 'exile', command: 'command', 'library-top': 'library', 'library-bottom': 'library' };
const PHASES = ['untap', 'upkeep', 'draw', 'precombat-main', 'combat', 'postcombat-main', 'end-step'];

function need(game, id) {
  const p = playerById(game, id);
  if (!p) throw new GameError('That player is not in this game.');
  return p;
}

function needCard(game, id) {
  const hit = findCard(game, id);
  if (!hit) throw new GameError('That card is no longer available.');
  return hit;
}

export function applyEdit(game, e, who = 'Host') {
  const tag = text => log(game, `${who}: ${text}`, { type: 'edit' });
  switch (e.kind) {
    case 'life': {
      const p = need(game, e.playerId), before = p.life;
      p.life = clampInt(e.set !== undefined ? e.set : before + Number(e.delta || 0), -999, 999999, before);
      p.lifeFeedback = { direction: p.life >= before ? 'gain' : 'loss', until: Date.now() + 4000 };
      tag(`${p.displayName} life ${before} → ${p.life}.`);
      break;
    }
    case 'poison': {
      const p = need(game, e.playerId);
      p.poison = clampInt(Number(p.poison || 0) + Number(e.delta || 0), 0, 99, 0);
      tag(`${p.displayName} poison is now ${p.poison}.`);
      break;
    }
    case 'player-counter': {
      const p = need(game, e.playerId), key = String(e.counter || '').slice(0, 24);
      if (!key) throw new GameError('Name the counter.');
      p.counters[key] = clampInt(Number(p.counters[key] || 0) + Number(e.delta || 0), 0, 9999, 0);
      tag(`${p.displayName} ${key} is now ${p.counters[key]}.`);
      break;
    }
    case 'commander-damage': {
      const p = need(game, e.playerId);
      p.commanderDamage = p.commanderDamage || {};
      p.commanderDamage[e.commanderId] = clampInt(Number(p.commanderDamage[e.commanderId] || 0) + Number(e.delta || 0), 0, 999, 0);
      tag(`${p.displayName} commander damage is now ${p.commanderDamage[e.commanderId]}.`);
      break;
    }
    case 'commander-tax': {
      const p = need(game, e.playerId), cmd = p.commanders.find(c => c.id === e.commanderId);
      if (!cmd) throw new GameError('Commander not found.');
      cmd.commanderTax = clampInt(Number(cmd.commanderTax || 0) + Number(e.delta || 0), 0, 98, 0);
      tag(`${p.displayName} commander tax is now ${cmd.commanderTax}.`);
      break;
    }
    case 'mana': {
      const p = need(game, e.playerId);
      if (!COLORS.includes(e.color)) throw new GameError('Unknown mana color.');
      const delta = Number(e.delta || 0);
      p.mana.floating = p.mana.floating || {};
      p.mana.available[e.color] = Math.max(0, Number(p.mana.available[e.color] || 0) + delta);
      p.mana.floating[e.color] = Math.max(0, Number(p.mana.floating[e.color] || 0) + delta);
      tag(`${p.displayName} ${delta >= 0 ? 'adds' : 'removes'} ${Math.abs(delta)} ${e.color} mana.`);
      break;
    }
    case 'tap': {
      const hit = needCard(game, e.instanceId);
      if (hit.zone !== 'battlefield') throw new GameError('Only permanents on the battlefield can be tapped.');
      const tapped = e.tapped === undefined ? !hit.card.tapped : !!e.tapped;
      if (hit.card.tapped !== tapped) commit(game, { type: 'tap-card', playerId: hit.player.playerId, instanceId: hit.card.instanceId, tapped, allowUntap: true, silent: true });
      tag(`${defOf(game, hit.card)?.name || 'Card'} is ${tapped ? 'tapped' : 'untapped'}.`);
      break;
    }
    case 'card-counter': {
      const hit = needCard(game, e.instanceId), key = String(e.counter || '+1/+1').slice(0, 24);
      commit(game, { type: 'card-counter', playerId: hit.player.playerId, instanceId: hit.card.instanceId, counter: key, delta: Number(e.delta || 0), silent: true });
      if (hit.card.counters?.[key] === 0) delete hit.card.counters[key];
      tag(`${defOf(game, hit.card)?.name || 'Card'} now has ${hit.card.counters?.[key] || 0} ${key} counter(s).`);
      break;
    }
    case 'move': {
      const hit = needCard(game, e.instanceId), to = ZONES[e.to];
      if (!to) throw new GameError('Unknown destination.');
      const name = defOf(game, hit.card)?.name || 'Card';
      const isCommander = hit.player.commanders?.some(c => c.cardId === hit.card.definitionId) || playerById(game, hit.card.ownerId)?.commanders?.some(c => c.cardId === hit.card.definitionId);
      if (to === 'command' && !isCommander) throw new GameError('Only a commander can go to the command zone.');
      commit(game, { type: 'move-card', playerId: hit.player.playerId, instanceId: hit.card.instanceId, to, position: e.to === 'library-top' ? 'top' : 'bottom', tapped: !!e.tapped, controllerId: e.controllerId || undefined, silent: true });
      const owner = playerById(game, hit.card.ownerId);
      const cmd = owner?.commanders?.find(c => c.cardId === hit.card.definitionId);
      if (cmd) { cmd.zone = to; cmd.commandZone = to === 'command'; }
      tag(`${name} moves to ${e.to.replace('-', ' ')}.`);
      break;
    }
    case 'draw': {
      const p = need(game, e.playerId), count = clampInt(e.count, 1, 20, 1);
      let drawn = 0;
      for (let i = 0; i < count && p.deck.remainingLibrary.length; i++) { commit(game, { type: 'draw', playerId: p.playerId, silent: true }); drawn += 1; }
      tag(`${p.displayName} draws ${plural(drawn, 'card')}.`);
      break;
    }
    case 'mill': {
      const p = need(game, e.playerId), count = clampInt(e.count, 1, 100, 1);
      const cards = p.deck.remainingLibrary.splice(0, count);
      for (const c of cards) { c.zone = 'graveyard'; p.deck.graveyard.push(c); }
      sync(p.deck);
      tag(`${p.displayName} mills ${plural(cards.length, 'card')}.`);
      break;
    }
    case 'shuffle': {
      const p = need(game, e.playerId);
      shuffleLibrary(p.deck);
      tag(`${p.displayName} shuffles their library.`);
      break;
    }
    case 'token': {
      const p = need(game, e.playerId), count = clampInt(e.count, 1, 50, 1);
      const name = String(e.name || 'Token').slice(0, 40);
      const creature = e.power !== undefined && e.power !== null && e.power !== '';
      commit(game, {
        type: 'resolve-effects', playerId: p.playerId, silent: true,
        effects: [{ kind: 'create-token', amount: count, name, subtype: name, power: creature ? String(e.power) : null, toughness: creature ? String(e.toughness ?? e.power) : null, typeLine: e.typeLine || (creature ? `Token Creature — ${name}` : `Token Artifact — ${name}`), colors: e.colors || [], oracleText: e.oracleText || '' }]
      });
      tag(`${p.displayName} creates ${plural(count, `${name} token`)}.`);
      break;
    }
    case 'add-card': {
      const p = need(game, e.playerId), def = e.definition;
      if (!def?.definitionId || !def.name) throw new GameError('Card data is missing.');
      if (!game.cardDefinitions[def.definitionId]) game.cardDefinitions[def.definitionId] = def;
      const card = createCardInstance({ instanceId: newId(`${p.playerId}:added`), definitionId: def.definitionId, ownerId: p.playerId, controllerId: p.playerId, zone: 'hand', sourceDeckSlot: 'added' });
      p.deck.hand.push(card);
      if (e.zone && e.zone !== 'hand') commit(game, { type: 'move-card', playerId: p.playerId, instanceId: card.instanceId, to: ZONES[e.zone] || 'hand', silent: true });
      tag(`${def.name} is added to ${p.displayName}'s ${e.zone || 'hand'}.`);
      break;
    }
    case 'control': {
      const hit = needCard(game, e.instanceId), to = need(game, e.playerId);
      if (hit.zone !== 'battlefield') throw new GameError('Only permanents on the battlefield can change control.');
      commit(game, { type: 'resolve-effects', playerId: to.playerId, silent: true, effects: [{ kind: 'gain-control', targetId: hit.card.instanceId, controllerId: to.playerId }] });
      tag(`${to.displayName} takes control of ${defOf(game, hit.card)?.name || 'a permanent'}.`);
      break;
    }
    case 'attach': {
      const hit = needCard(game, e.instanceId);
      if (hit.zone !== 'battlefield') throw new GameError('Only permanents on the battlefield can be attached.');
      const target = e.targetId ? needCard(game, e.targetId) : null;
      attach(game, hit.card.instanceId, target?.card.instanceId || null);
      tag(target ? `${defOf(game, hit.card)?.name || 'Card'} is attached to ${defOf(game, target.card)?.name || 'a permanent'}.` : `${defOf(game, hit.card)?.name || 'Card'} is unattached.`);
      break;
    }
    case 'pt': {
      const hit = needCard(game, e.instanceId);
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'pt', power: Number(e.power || 0), toughness: Number(e.toughness || 0), expires: e.permanent ? null : 'cleanup' });
      tag(`${defOf(game, hit.card)?.name || 'Card'} gets ${Number(e.power) >= 0 ? '+' : ''}${Number(e.power || 0)}/${Number(e.toughness) >= 0 ? '+' : ''}${Number(e.toughness || 0)}${e.permanent ? '' : ' until end of turn'}.`);
      break;
    }
    case 'status': {
      const p = need(game, e.playerId), set = new Set(p.statuses || []);
      e.enabled === false ? set.delete(e.status) : set.add(String(e.status).slice(0, 24));
      p.statuses = [...set];
      tag(`${p.displayName} ${e.enabled === false ? 'loses' : 'gains'} ${e.status}.`);
      break;
    }
    case 'eliminate': {
      const p = need(game, e.playerId);
      p.eliminated = e.eliminated !== false;
      p.eliminationReason = p.eliminated ? 'removed by host' : null;
      if (!p.eliminated) { game.status = 'active'; game.winner = null; game.result = null; if (p.life <= 0) p.life = 1; p.counters.failedDraws = 0; }
      tag(`${p.displayName} is ${p.eliminated ? 'out of' : 'back in'} the game.`);
      break;
    }
    case 'phase': {
      if (!PHASES.includes(e.phase)) throw new GameError('Unknown phase.');
      const f = game.flow;
      f.op = null; f.priority = null; f.queue = []; f.blocks = null; f.discard = null;
      game.combatState = { attackers: [], defenders: [], blocks: {}, damage: [], waitingFor: null, resolved: false };
      commit(game, { type: 'phase', playerId: game.activePlayerId, phase: e.phase, silent: true });
      const p = playerById(game, game.activePlayerId);
      if (e.phase !== 'draw' && e.phase !== 'untap' && e.phase !== 'upkeep') p.confirmations = { ...(p.confirmations || {}), draw: true };
      tag(`phase set to ${e.phase.replace('-', ' ')}.`);
      break;
    }
    case 'active': {
      const p = need(game, e.playerId), f = game.flow;
      f.op = null; f.priority = null; f.queue = []; f.blocks = null; f.discard = null;
      game.activePlayerId = p.playerId;
      game.phase = 'precombat-main';
      p.confirmations = { ...(p.confirmations || {}), draw: true };
      tag(`it is now ${p.displayName}'s turn.`);
      break;
    }
    case 'clear-stack': {
      for (const obj of game.stack || []) {
        if (obj.kind === 'spell' && obj.card) {
          const owner = playerById(game, obj.card.ownerId);
          obj.card.zone = 'graveyard';
          if (owner && !obj.card.token) owner.deck.graveyard.push(obj.card);
          const cmd = owner?.commanders?.find(c => c.cardId === obj.card.definitionId);
          if (cmd) { obj.card.zone = 'command'; owner.deck.graveyard.pop(); owner.deck.commandZone.push(obj.card); cmd.zone = 'command'; cmd.commandZone = true; }
        }
      }
      game.stack = [];
      game.pendingTriggers = [];
      game.flow.priority = null; game.flow.guided = null; game.flow.op = null;
      tag('the stack was cleared.');
      break;
    }
    case 'counter-top': {
      const top = stackTop(game);
      if (!top) throw new GameError('The stack is empty.');
      game.stack.pop();
      if (top.kind === 'spell' && top.card) {
        const owner = playerById(game, top.card.ownerId);
        const cmd = owner?.commanders?.find(c => c.cardId === top.card.definitionId);
        top.card.zone = cmd ? 'command' : 'graveyard';
        if (owner && !top.card.token) (cmd ? owner.deck.commandZone : owner.deck.graveyard).push(top.card);
        if (cmd) { cmd.zone = 'command'; cmd.commandZone = true; }
      }
      game.flow.priority = null; game.flow.guided = null;
      if (game.flow.op?.system) game.flow.op = null;
      tag(`${top.name || top.label || 'the top stack object'} was removed from the stack.`);
      break;
    }
    case 'resolve-top': {
      const top = stackTop(game);
      if (!top) throw new GameError('The stack is empty.');
      if (game.flow.priority) { game.flow.priority.passed = [...game.flow.priority.order]; game.flow.priority.holderId = null; }
      tag('priority was skipped — the top of the stack resolves.');
      break;
    }
    case 'rules': {
      game.rulesConfig = normalizeRulesConfig({ ...game.rulesConfig, ...(e.patch || {}) });
      tag('table rules were changed.');
      break;
    }
    case 'note': {
      const text = String(e.text || '').trim().slice(0, 200);
      if (!text) throw new GameError('Write the note first.');
      tag(text);
      break;
    }
    default:
      throw new GameError('Unknown edit.');
  }
  for (const p of game.players) sync(p.deck);
  if (game.status !== 'complete') evaluateLosses(game);
}

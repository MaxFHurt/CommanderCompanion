// State-based actions the game checks whenever it settles (rule 704), not only in combat:
// creatures with 0 or less toughness or lethal damage die, planeswalkers with no loyalty go to
// the graveyard, and the legend rule asks nothing — it keeps the newest copy and logs it.

import { effectiveToughness, cardHasKeyword } from '../engine/combat.js';
import { defOf, log, turnOrderFrom } from './helpers.js';

const turnOrderAfter = (game, playerId) => turnOrderFrom(game, playerId).filter(q => q.playerId !== playerId);
import { commit } from './ops.js';
import { regenerates } from '../engine/effects-catalog.js';
import { sagaFinalChapter } from '../engine/keyword-triggers.js';

export function stateBasedActions(game) {
  let changed = false;
  // A copy of a card that was not cast (or has left the stack) ceases to exist (707.12).
  for (const p of game.players || []) for (const z of ['exile', 'graveyard', 'hand', 'battlefield', 'remainingLibrary']) {
    const zone = p.deck?.[z];
    if (!Array.isArray(zone) || !zone.some(c => c.castCopy)) continue;
    const pending = [game.flow?.freeCast, ...(game.flow?.freeCastQueue || [])].filter(Boolean).map(x => x.instanceId);
    const opId = game.flow?.op?.args?.instanceId;
    for (let k = zone.length - 1; k >= 0; k--) if (zone[k].castCopy && !pending.includes(zone[k].instanceId) && zone[k].instanceId !== opId && !(z === 'battlefield')) { zone.splice(k, 1); changed = true; }
  }
  for (let guard = 0; guard < 20; guard++) {
    let acted = false;
    for (const p of game.players || []) {
      for (const c of [...(p.deck?.battlefield || [])]) {
        const d = defOf(game, c);
        if (!d) continue;
        const type = String(d.typeLine || '');
        let reason = '';
        if (/\bCreature\b/i.test(type)) {
          const t = effectiveToughness(c, d, game);
          if (t <= 0) reason = 'has 0 toughness';
          else if ((Number(c.damageMarked || 0) >= t || c.deathtouchDamage) && !cardHasKeyword(c, d, 'Indestructible', game)) {
            const notes = [];
            if (regenerates(game, c, notes)) { log(game, notes.join(' ')); acted = changed = true; continue; }
            reason = 'has lethal damage';
          }
        }
        if (!reason && /\bPlaneswalker\b/i.test(type) && Number(c.counters?.loyalty || 0) <= 0 && c.loyaltyInitialised !== false && c.enteredTurn !== undefined && Number(d.loyalty || 0) > 0 && c.counters && 'loyalty' in c.counters) reason = 'has no loyalty';
        if (!reason && /\bBattle\b/i.test(type)) {
          const siege = /\bSiege\b/i.test(type);
          // Enters with its printed defense (310.4b); a missing or invalid protector is chosen again (310.11).
          if (c.counters?.defense === undefined && Number(d.defense) > 0) { c.counters = { ...(c.counters || {}), defense: Number(d.defense) }; changed = true; }
          const protector = game.players.find(q => q.playerId === c.protectorId && !q.eliminated);
          if (!protector || (siege ? protector.playerId === p.playerId : protector.playerId !== p.playerId)) {
            const pick = siege ? turnOrderAfter(game, p.playerId).find(q => !q.eliminated && q.playerId !== p.playerId) : p;
            if (pick) { c.protectorId = pick.playerId; log(game, `${pick.displayName} protects ${d.name}.`); changed = true; }
          }
          if (c.counters && 'defense' in c.counters && Number(c.counters.defense) <= 0 && !(game.stack || []).some(x => x.sourceId === c.instanceId)) {
            if (siege) {
              // 310.12b: exile it; its controller may cast the back face for free (done by hand for now).
              commit(game, { type: 'move-card', playerId: p.playerId, instanceId: c.instanceId, to: 'exile', silent: true });
              log(game, `${d.name} is defeated and exiled. ${p.displayName} may cast its back face without paying its mana cost. Do this by hand.`);
              acted = changed = true;
              continue;
            }
            reason = 'has no defense left';
          }
        }
        // "When you control no Islands, sacrifice this creature." (a state trigger; the game sacrifices it at once)
        const none = !reason && String(d.oracleText || '').match(/(?:^|\n)When you control no ([A-Z][a-z]+?)s?, sacrifice (?:this creature|this permanent|it|~|[^.]+?)\./);
        if (none && !(p.deck.battlefield || []).some(x => x.instanceId !== c.instanceId && new RegExp(`\\b${none[1]}s?\\b`).test(defOf(game, x)?.typeLine || ''))) {
          commit(game, { type: 'move-card', playerId: p.playerId, instanceId: c.instanceId, to: 'graveyard', silent: true });
          log(game, `${p.displayName} controls no ${none[1]}s: ${d.name} is sacrificed.`);
          acted = changed = true;
          continue;
        }
        if (!reason && /\bSaga\b/i.test(type)) {
          // A Saga with lore counters at its last chapter is sacrificed once no chapter ability is waiting.
          const final = sagaFinalChapter(d);
          const waiting = (game.stack || []).some(x => x.sourceId === c.instanceId) || (game.pendingTriggers || []).some(x => x.sourceId === c.instanceId);
          if (final && Number(c.counters?.lore || 0) >= final && !waiting) {
            commit(game, { type: 'move-card', playerId: p.playerId, instanceId: c.instanceId, to: 'graveyard', silent: true });
            log(game, `${d.name} has finished its last chapter and is sacrificed.`);
            acted = changed = true;
            continue;
          }
        }
        if (!reason) continue;
        commit(game, { type: 'move-card', playerId: p.playerId, instanceId: c.instanceId, to: 'graveyard', silent: true });
        log(game, `${d.name} ${reason} and is put into the graveyard.`);
        acted = changed = true;
      }
    }
    if (!acted) break;
  }
  return changed;
}

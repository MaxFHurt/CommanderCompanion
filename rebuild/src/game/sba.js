// State-based actions the game checks whenever it settles (rule 704), not only in combat:
// creatures with 0 or less toughness or lethal damage die, planeswalkers with no loyalty go to
// the graveyard, and the legend rule asks nothing — it keeps the newest copy and logs it.

import { effectiveToughness, cardHasKeyword } from '../engine/combat.js';
import { defOf, log } from './helpers.js';
import { commit } from './ops.js';

export function stateBasedActions(game) {
  let changed = false;
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
          else if ((Number(c.damageMarked || 0) >= t || c.deathtouchDamage) && !cardHasKeyword(c, d, 'Indestructible', game)) reason = 'has lethal damage';
        }
        if (!reason && /\bPlaneswalker\b/i.test(type) && Number(c.counters?.loyalty || 0) <= 0 && c.loyaltyInitialised !== false && c.enteredTurn !== undefined && Number(d.loyalty || 0) > 0 && c.counters && 'loyalty' in c.counters) reason = 'has no loyalty';
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

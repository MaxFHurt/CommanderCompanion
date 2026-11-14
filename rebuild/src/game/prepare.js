// Prepared (Secrets of Strixhaven, build 112): a creature with a prepare spell (layout "prepare": creature face + spell face)
// can be prepared. While it is prepared, its controller may cast a copy of its spell; doing so unprepares it.
// The game shows that copy as a card in its controller's exile (made and removed here, with the other state-based checks),
// cast it the normal way (its own cost and timing); the copy ceases to exist as it resolves (castCopy, sba.js).
import { parseManaCost } from '../engine/rules.js';

export const hasPrepareSpell = base => base?.layout === 'prepare' && (base.cardFaces || []).length > 1 && !!base.cardFaces[1]?.typeLine;

/** The spell face as a card of its own, so the copy is cast like any instant or sorcery. */
export function preparedDefinitionId(game, base) {
  const id = `${base.definitionId}#prepare`;
  if (!game.cardDefinitions[id]) {
    const face = base.cardFaces[1], cost = parseManaCost(face.manaCost || '');
    const mv = Object.entries(cost).reduce((n, [k, v]) => n + (k === 'generic' ? Number(v) || 0 : ['W', 'U', 'B', 'R', 'G', 'C'].includes(k) ? Number(v) || 0 : 0), 0);
    const colors = [...new Set((String(face.manaCost || '').match(/\{([WUBRG])(?:\/[WUBRGP])?\}/g) || []).map(x => x[1]))];
    game.cardDefinitions[id] = { definitionId: id, name: face.name, manaCost: face.manaCost || '', typeLine: face.typeLine, oracleText: face.oracleText || '', power: null, toughness: null,
      keywords: [], colors, colorIdentity: base.colorIdentity || colors, imageUris: face.imageUris || base.imageUris || null, manaValue: mv, layout: 'normal', preparedFrom: base.definitionId, hydrationStatus: 'complete' };
  }
  return id;
}

/** "This creature enters prepared." and the castable copies of prepared creatures' spells. Returns true when anything changed. */
export function maintainPrepared(game) {
  let changed = false;
  const live = new Map();
  for (const p of game.players || []) for (const c of p.deck?.battlefield || []) {
    const base = game.cardDefinitions?.[c.definitionId];
    if (!hasPrepareSpell(base)) { if (c.prepared) { delete c.prepared; changed = true; } continue; }
    if (!c.prepInit) {
      c.prepInit = true;
      const front = String(base.cardFaces[0]?.oracleText || base.oracleText || '');
      if (/(?:^|\n)\s*(?:This creature|[^\n.]*?) enters prepared\b/i.test(front)) { c.prepared = true; changed = true; }
    }
    if (c.prepared) live.set(c.instanceId, { card: c, base, controllerId: c.controllerId || p.playerId });
  }
  for (const p of game.players || []) {
    const ex = p.deck?.exile;
    if (!Array.isArray(ex)) continue;
    for (let k = ex.length - 1; k >= 0; k--) {
      const x = ex[k];
      if (!x.preparedOf) continue;
      const src = live.get(x.preparedOf);
      if (src && src.controllerId === p.playerId && !src.copyFound) { src.copyFound = true; continue; }
      ex.splice(k, 1); changed = true;
    }
  }
  for (const src of live.values()) {
    if (src.copyFound) continue;
    const owner = (game.players || []).find(q => q.playerId === src.controllerId);
    if (!owner?.deck?.exile) continue;
    const id = preparedDefinitionId(game, src.base);
    owner.deck.exile.push({ instanceId: `prep:${src.card.instanceId}:${Math.random().toString(36).slice(2, 8)}`, definitionId: id, zone: 'exile', ownerId: src.controllerId, controllerId: src.controllerId,
      castCopy: true, token: true, preparedOf: src.card.instanceId, counters: {}, attachments: [], temporaryEffects: [], tapped: false });
    changed = true;
  }
  return changed;
}

/** Cast: the creature it came from is no longer prepared. */
export function castPreparedCopy(game, copy) {
  for (const p of game.players || []) for (const c of p.deck?.battlefield || []) if (c.instanceId === copy.preparedOf) delete c.prepared;
}

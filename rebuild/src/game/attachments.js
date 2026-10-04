// Auras and Equipment. `card.attachedTo` is the source of truth; this module keeps the host's
// `attachments` list and the bonuses it grants in step, and cleans up when a host leaves play.

import { defOf, log, playerById } from './helpers.js';

const KEYWORDS = ['flying', 'first strike', 'double strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'shroud', 'defender', 'flash', 'ward', 'infect'];

/** What an attached Aura/Equipment gives to the permanent it is attached to. */
export function attachmentGrants(def) {
  const text = String(def?.oracleText || '');
  const out = { power: 0, toughness: 0, keywords: [] };
  const pt = text.match(/(?:Equipped|Enchanted) (?:creature|permanent) gets ([+-]\d+)\/([+-]\d+)/i);
  if (pt) { out.power = Number(pt[1]); out.toughness = Number(pt[2]); }
  for (const m of text.matchAll(/(?:Equipped|Enchanted) (?:creature|permanent) (?:gets [+-]\d+\/[+-]\d+ and )?(?:has|gains) ([^.\n]+)/ig)) {
    for (const part of m[1].toLowerCase().split(/,| and /)) {
      const k = KEYWORDS.find(x => part.trim().startsWith(x));
      if (k) out.keywords.push(k.replace(/\b\w/g, c => c.toUpperCase()).replace(/ S/, ' s'));
    }
  }
  return out;
}

export function enchantTarget(def) {
  if (!/\bAura\b/i.test(def?.typeLine || '')) return null;
  const m = String(def?.oracleText || '').match(/^Enchant ([a-z ]+?)(?:\s*\(|$)/im);
  return m ? m[1].trim().toLowerCase() : 'creature';
}

/** Rebuild attachment lists and bonuses. Returns true if something had to be moved or detached. */
export function syncAttachments(game) {
  const onField = new Map();
  for (const p of game.players) for (const c of p.deck.battlefield) onField.set(c.instanceId, { card: c, player: p });
  let changed = false;
  for (const { card } of onField.values()) {
    card.attachments = [];
    if ((card.temporaryEffects || []).some(e => e?.source === 'attachment')) card.temporaryEffects = card.temporaryEffects.filter(e => e?.source !== 'attachment');
  }
  for (const { card, player } of [...onField.values()]) {
    if (!card.attachedTo) continue;
    const host = onField.get(card.attachedTo);
    const def = defOf(game, card);
    if (!host) {
      card.attachedTo = null;
      changed = true;
      if (/\bAura\b/i.test(def?.typeLine || '')) {
        // An Aura with nothing to enchant goes to its owner's graveyard.
        const i = player.deck.battlefield.indexOf(card);
        if (i >= 0) player.deck.battlefield.splice(i, 1);
        card.zone = 'graveyard'; card.tapped = false; card.counters = {};
        const owner = playerById(game, card.ownerId) || player;
        if (!card.token) owner.deck.graveyard.push(card);
        onField.delete(card.instanceId);
        log(game, `${def?.name || 'An Aura'} is put into the graveyard because what it enchanted is gone.`);
      } else {
        log(game, `${def?.name || 'Equipment'} becomes unattached.`);
      }
      continue;
    }
    host.card.attachments.push(card.instanceId);
    const grants = attachmentGrants(def);
    host.card.temporaryEffects = host.card.temporaryEffects || [];
    if (grants.power || grants.toughness) host.card.temporaryEffects.push({ kind: 'pt', power: grants.power, toughness: grants.toughness, source: 'attachment' });
    for (const keyword of grants.keywords) host.card.temporaryEffects.push({ kind: 'keyword', keyword, enabled: true, source: 'attachment' });
  }
  return changed;
}

export function attach(game, attachmentId, hostId) {
  for (const p of game.players) {
    const card = p.deck.battlefield.find(c => c.instanceId === attachmentId);
    if (card) { card.attachedTo = hostId || null; break; }
  }
  syncAttachments(game);
}

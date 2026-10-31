// Auras and Equipment. `card.attachedTo` is the source of truth; this module keeps the host's
// `attachments` list and the bonuses it grants in step, and cleans up when a host leaves play.

import { defOf, log, playerById } from './helpers.js';

const KEYWORDS = ['flying', 'first strike', 'double strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'shroud', 'defender', 'flash', 'ward', 'infect'];

/** What an attached Aura/Equipment gives to the permanent it is attached to. */
export function attachmentGrants(def) {
  // Static lines only: "{1}: Enchanted creature gets +3/+3 until end of turn." is an activated ability, not a bonus.
  const text = String(def?.oracleText || '').split('\n').filter(line => !/until end of turn|^[^"]*?:\s/i.test(line)).join('\n');
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

/** Can the game choose and keep track of what this Aura enchants ("Enchant creature you control", "Enchant player" …)? */
export function enchantSupported(phrase) {
  const s = String(phrase || '').toLowerCase().trim();
  if (/^(?:player|opponent|creature card in (?:a|your) graveyard)$/.test(s)) return true;
  const one = '(?:basic |legendary |nonland |noncreature |nonbasic )?(?:creature|land|artifact|enchantment|planeswalker|permanent|vehicle|equipment|battle|forest|island|swamp|mountain|plains)';
  return new RegExp(`^${one}(?:(?:, | or |, or )${one})*(?: you control| an opponent controls| you don't control)?$`).test(s);
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
  // Quoted abilities granted by anthems: 'Creatures you control have "{T}: Add one mana of any color."' (Cryptolith Rite).
  for (const { card } of onField.values()) card.grantedText = [];
  for (const { card: src, player } of onField.values()) {
    const text = String(defOf(game, { ...src, grantedText: [] })?.oracleText || '');
    for (const line of text.split('\n')) {
      const m = line.match(/^(Other )?((?:[A-Za-z-]+ )*?)(creatures?|lands?|artifacts?|permanents?|tokens?) you control (?:have|gain) ((?:"[^"]+"(?:,? and |, )?)+)\.?$/i);
      if (!m) continue;
      const quotes = [...m[4].matchAll(/"([^"]+)"/g)].map(x => x[1]);
      for (const { card, player: owner } of onField.values()) {
        if (owner.playerId !== player.playerId || (m[1] && card.instanceId === src.instanceId)) continue;
        const d = defOf(game, { ...card, grantedText: [] }), t = String(d?.typeLine || '');
        const noun = m[3].toLowerCase().replace(/s$/, '');
        if (noun !== 'permanent' && noun !== 'token' && !new RegExp(`\\b${noun}\\b`, 'i').test(t)) continue;
        if (noun === 'token' && !card.token) continue;
        const ok = m[2].trim().split(/\s+/).filter(Boolean).every(w => /^nontoken$/i.test(w) ? !card.token : /^token$/i.test(w) ? card.token : /^(white|blue|black|red|green)$/i.test(w) ? (d?.colors || []).includes({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[w.toLowerCase()]) : new RegExp(`\\b${w}\\b`, 'i').test(t));
        if (ok) card.grantedText.push(...quotes);
      }
    }
  }
  for (const { card } of onField.values()) {
    card.attachments = [];
    if ((card.temporaryEffects || []).some(e => e?.source === 'attachment')) card.temporaryEffects = card.temporaryEffects.filter(e => e?.source !== 'attachment');
  }
  for (const { card, player } of [...onField.values()]) {
    if (!card.attachedTo) continue;
    // Attached to a player (Curses): stays while that player is in the game.
    const enchantedPlayer = game.players.find(q => q.playerId === card.attachedTo);
    if (enchantedPlayer && !enchantedPlayer.eliminated) continue;
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
    // 'Equipped creature has "{T}: This creature deals 1 damage to any target."' — the creature gets that ability.
    for (const line of String(def?.oracleText || '').split('\n')) {
      const g = line.match(/^(?:Equipped|Enchanted|Fortified) (?:creature|permanent|land|artifact|planeswalker) (?:has|gains|gets [+-]\d+\/[+-]\d+ and has) ((?:"[^"]+"(?:,? and |, )?)+)/i);
      if (g) host.card.grantedText = [...(host.card.grantedText || []), ...[...g[1].matchAll(/"([^"]+)"/g)].map(x => x[1])];
    }
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

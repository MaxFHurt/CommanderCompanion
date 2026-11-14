// Auras and Equipment. `card.attachedTo` is the source of truth; this module keeps the host's
// `attachments` list and the bonuses it grants in step, and cleans up when a host leaves play.

import { defOf, log, playerById } from './helpers.js';
import { resyncManaSource } from '../engine/transactions.js';

const KEYWORDS = ['flying', 'first strike', 'double strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'shroud', 'defender', 'flash', 'ward', 'infect'];

/** What an attached Aura/Equipment gives to the permanent it is attached to. */
export function attachmentGrants(def) {
  // Static lines only: "{1}: Enchanted creature gets +3/+3 until end of turn." is an activated ability, not a bonus.
  const text = String(def?.oracleText || '').split('\n').filter(line => !/until end of turn|^[^"]*?:\s/i.test(line)).join('\n');
  const out = { power: 0, toughness: 0, keywords: [], restrictions: [], loseAbilities: false };
  // "Enchanted creature can't attack or block." (Pacifism, Observed Stasis), "… loses all abilities."
  for (const m of text.matchAll(/(?:Equipped|Enchanted) creature (?:loses all abilities and )?can'?t (attack or block|attack|block)\b/ig)) out.restrictions.push(`cant-${m[1].toLowerCase().replace(' or ', '-or-')}`);
  if (/(?:Enchanted|Equipped) creature loses all abilities\b/i.test(text)) out.loseAbilities = true;
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
  if (new RegExp(`^${one}(?:(?:, | or |, or )${one})*(?: you control| an opponent controls| you don't control)?$`).test(s)) return true;
  // Build 110: colours, "non-Wall", tapped, snow; "without flying", "with power 3 or less" (requirements.js descriptorFits reads them).
  const color = '(?:white|blue|black|red|green)', adj = `(?:${color}(?: or ${color})?|non-?(?!commander)[a-z]+|tapped|untapped|snow|artifact|legendary)`;
  return new RegExp(`^(?:${adj} )*(?:creature|land|permanent|artifact|enchantment)(?: without (?:flying|reach|trample|haste|vigilance|first strike|deathtouch|lifelink)| with power \\d+ or (?:less|greater)| with mana value \\d+ or (?:less|greater))?(?: you control| an opponent controls| you don't control)?$`).test(s);
}

export function enchantTarget(def) {
  if (!/\bAura\b/i.test(def?.typeLine || '')) return null;
  const m = String(def?.oracleText || '').match(/^Enchant ([a-z0-9' -]+?)(?:\s*\(|$)/im);
  return m ? m[1].trim().toLowerCase() : 'creature';
}

/** Rebuild attachment lists and bonuses. Returns true if something had to be moved or detached. */
export function syncAttachments(game) {
  const onField = new Map();
  for (const p of game.players) for (const c of p.deck.battlefield) onField.set(c.instanceId, { card: c, player: p });
  let changed = false;
  // Quoted abilities granted by anthems: 'Creatures you control have "{T}: Add one mana of any color."' (Cryptolith Rite).
  for (const { card } of onField.values()) {
    // Abilities granted for a while by a spell (Malakir Rebirth: until end of turn) stay with the card.
    card.temporaryGrants = (card.temporaryGrants || []).filter(g => g.until === 'permanent' || g.turn === game.turnNumber);
    card.grantedText = card.temporaryGrants.map(g => g.text);
    if (!card.temporaryGrants.length) delete card.temporaryGrants;
  }
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
  // Land types given to lands by a static ability (CR 305.7): "Each land is a Swamp in addition to its other land types." (Urborg, Blanket of
  // Night), "Lands you control are Forests in addition to their other types." (Swampbenders), "… are every basic land type …" (Dryad of
  // the Ilysian Grove, Leyline of the Guildpact). The lands make that type's mana (overlay.js applyLandType).
  for (const { card: src, player } of onField.values()) {
    for (const line of String(defOf(game, { ...src, grantedText: [] })?.oracleText || '').split('\n')) {
      let m, who = null, types = null;
      if ((m = line.match(/^(?:Each|All) (nonbasic )?lands? (?:is|are) an? (Plains|Island|Swamp|Mountain|Forest) in addition to (?:its|their) other land types\.?$/i))) { who = c => !m[1] || !/\bBasic\b/.test(String(defOf(game, c)?.typeLine || '')); types = [m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()]; }
      else if ((m = line.match(/^Lands you control are (Plains|Islands?|Swamps|Mountains|Forests) in addition to their other (?:land )?types\.?$/i))) { who = (c, o) => o.playerId === player.playerId; types = [m[1][0].toUpperCase() + m[1].slice(1).toLowerCase().replace(/(?<!plain)s$/, '')]; }
      else if (/^Lands you control are every basic land type in addition to their other types\.?$/i.test(line)) { who = (c, o) => o.playerId === player.playerId; types = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']; }
      if (!types) continue;
      for (const { card, player: owner } of onField.values()) if (/\bLand\b/.test(defOf(game, { ...card, grantedText: [] })?.typeLine || '') && who(card, owner)) (card.temporaryEffects = card.temporaryEffects || []).push({ kind: 'land-type', types, set: false, source: 'attachment' });
    }
  }
  // Soulbond: a pair ends when either creature leaves or changes control; while paired, both get what the text says.
  for (const { card, player } of onField.values()) {
    if (!card.pairedWith) continue;
    const mate = onField.get(card.pairedWith);
    if (!mate || mate.player.playerId !== player.playerId || mate.card.pairedWith !== card.instanceId || !/\bCreature\b/.test(defOf(game, mate.card)?.typeLine || '')) { delete card.pairedWith; changed = true; }
  }
  for (const { card: src } of onField.values()) {
    if (!src.pairedWith) continue;
    const mate = onField.get(src.pairedWith)?.card;
    if (!mate) continue;
    for (const line of String(defOf(game, { ...src, grantedText: [] })?.oracleText || '').split('\n')) {
      const m = line.match(/^As long as .+? is paired with another creature, (?:both creatures|each of those creatures) (have|has|gets?) (.+?)\.?$/i);
      if (!m) continue;
      for (const c of [src, mate]) {
        c.temporaryEffects = c.temporaryEffects || [];
        const pt = m[2].match(/^([+-]\d+)\/([+-]\d+)$/);
        if (/^gets?$/i.test(m[1]) && pt) c.temporaryEffects.push({ kind: 'pt', power: Number(pt[1]), toughness: Number(pt[2]), source: 'attachment' });
        else if (/"/.test(m[2])) c.grantedText = [...(c.grantedText || []), ...[...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1])];
        else for (const k of m[2].split(/,\s*(?:and\s+)?|\s+and\s+/).map(x => x.trim()).filter(Boolean)) c.temporaryEffects.push({ kind: 'keyword', keyword: k.charAt(0).toUpperCase() + k.slice(1), enabled: true, source: 'attachment' });
      }
    }
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
      // Bestow: when what it enchants leaves, it stops being an Aura and stays as a creature.
      if (card.bestowed) { delete card.bestowed; log(game, `${defOf(game, card)?.name || 'It'} is no longer attached and is a creature again.`); continue; }
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
    // "Enchanted land is every basic land type in addition to its other types." (Nylea's Presence), "Enchanted land is a Swamp." (Evil Presence)
    for (const line of String(def?.oracleText || '').split('\n')) {
      const lm = line.match(/^Enchanted land is (every basic land type|an? (?:Plains|Island|Swamp|Mountain|Forest))( in addition to its other types)?\.?$/i);
      if (lm) host.card.temporaryEffects = [...(host.card.temporaryEffects || []), { kind: 'land-type', types: /^every/i.test(lm[1]) ? ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] : [lm[1].split(' ')[1][0].toUpperCase() + lm[1].split(' ')[1].slice(1).toLowerCase()], set: !lm[2] && !/^every/i.test(lm[1]), source: 'attachment' }];
    }
    const grants = attachmentGrants(def);
    host.card.temporaryEffects = host.card.temporaryEffects || [];
    if (grants.power || grants.toughness) host.card.temporaryEffects.push({ kind: 'pt', power: grants.power, toughness: grants.toughness, source: 'attachment' });
    for (const keyword of grants.keywords) host.card.temporaryEffects.push({ kind: 'keyword', keyword, enabled: true, source: 'attachment' });
    for (const restriction of grants.restrictions) host.card.temporaryEffects.push({ kind: 'combat-restriction', restriction, source: 'attachment' });
    if (grants.loseAbilities) host.card.temporaryEffects.push({ kind: 'animate', loseAbilities: true, addTypes: [], subtypes: [], keywords: [], colors: null, source: 'attachment' });
  }
  // The mana a land makes follows its land types (here, and again when a change ends).
  for (const { card, player } of onField.values()) {
    const has = (card.temporaryEffects || []).some(e => e?.kind === 'land-type');
    if (has) card.landTypeChanged = true;
    else if (card.landTypeChanged) delete card.landTypeChanged;
    else continue;
    resyncManaSource(game, player, card);
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

// Who or what a trigger is about: the words before the verb in "Whenever <subject> enters / dies /
// attacks / deals combat damage …". One reader for every event, so new wordings ("a land you control
// enters", "another nontoken creature you control with power 4 or greater", "Omnath or another
// Elemental you control", "equipped creature", "Etali" for Etali, Primal Storm) work everywhere.

import { effectivePower, cardHasKeyword } from './combat.js';

const COLORS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const KEYWORDS = ['flying', 'trample', 'haste', 'vigilance', 'deathtouch', 'lifelink', 'menace', 'reach', 'first strike', 'double strike', 'defender', 'indestructible', 'hexproof', 'flash'];
const SELF_NOUNS = 'creature|permanent|artifact|enchantment|land|planeswalker|card|aura|equipment|class|vehicle|saga|siege|battle|spell|token|room|case';

function escRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** The names a card's own text uses for itself: full name, and the short name before a comma ("Ragavan"). */
export function selfNames(definition) {
  const full = String(definition?.name || '').split(' // ')[0].trim();
  const names = new Set(full ? [full] : []);
  const short = full.split(',')[0].trim();
  if (short && short !== full) names.add(short);
  // Legendary names without a comma are shortened to their first word ("Loran of the Third Path" → "Loran").
  if (/\bLegendary\b/i.test(definition?.typeLine || '') && / of | the /i.test(full)) names.add(full.split(' ')[0]);
  return [...names].filter(n => n.length >= 3).sort((a, b) => b.length - a.length);
}

export function refersToSelf(phrase, definition) {
  const t = String(phrase || '');
  if (new RegExp(`\\bthis (?:${SELF_NOUNS})\\b`, 'i').test(t) || /\bCARDNAME\b|~/.test(t)) return true;
  return selfNames(definition).some(n => new RegExp(`(?:^|[^A-Za-z])${escRe(n)}(?:$|[^A-Za-z'])`, 'i').test(t));
}

function isSelfPhrase(phrase, definition) {
  const t = String(phrase || '').trim();
  if (new RegExp(`^this (?:${SELF_NOUNS})$`, 'i').test(t) || /^(?:CARDNAME|~)$/.test(t)) return true;
  return selfNames(definition).some(n => n.toLowerCase() === t.toLowerCase());
}

/** Read a subject phrase into a filter. Returns null if the words are not understood. */
export function parseSubject(phrase, definition) {
  let s = String(phrase || '').trim().replace(/\s+/g, ' ');
  const out = { self: false, orSelf: false, another: false, equipped: false, enchanted: false, token: null, types: [], allTypes: [], nonTypes: [], colors: [], controller: null, power: null, manaValue: null, keywords: [], attacking: false, blocking: false, modified: false, chosenType: false };
  if (isSelfPhrase(s, definition)) { out.self = true; return out; }
  // "Omnath or another Elemental you control"
  const orSelf = s.match(/^(.+?) or (another .+)$/i);
  if (orSelf && isSelfPhrase(orSelf[1], definition)) { out.orSelf = true; s = orSelf[2]; }
  s = s.replace(/^(?:a|an|one or more|each|any|two or more)\s+/i, '');
  if (/^(?:another|other)\s+/i.test(s)) { out.another = true; s = s.replace(/^(?:another|other)\s+/i, '').replace(/^(?:a|an)\s+/i, ''); }
  if (/^equipped\s+/i.test(s)) { out.equipped = true; s = s.slice(9); }
  else if (/^enchanted\s+/i.test(s)) { out.enchanted = true; s = s.slice(10); }
  let m;
  if ((m = s.match(/\s+of the chosen type$/i))) { out.chosenType = true; s = s.slice(0, m.index); }
  if ((m = s.match(/\s+(?:you control|under your control)$/i))) { out.controller = 'you'; s = s.slice(0, m.index); }
  else if ((m = s.match(/\s+(?:an opponent controls|your opponents control|you don'?t control|under an opponent'?s control)$/i))) { out.controller = 'opp'; s = s.slice(0, m.index); }
  if ((m = s.match(/\s+with power (\d+) or (greater|less)$/i))) { out.power = { n: Number(m[1]), op: m[2].toLowerCase() }; s = s.slice(0, m.index); }
  else if ((m = s.match(/\s+with mana value (\d+) or (greater|less)$/i))) { out.manaValue = { n: Number(m[1]), op: m[2].toLowerCase() }; s = s.slice(0, m.index); }
  else if ((m = s.match(new RegExp(`\\s+with (${KEYWORDS.join('|')})$`, 'i')))) { out.keywords.push(m[1].toLowerCase()); s = s.slice(0, m.index); }
  // The controller can also come after the "with …" part: "a creature with power 4 or greater you control" is rare; try again.
  if (!out.controller && (m = s.match(/\s+(?:you control)$/i))) { out.controller = 'you'; s = s.slice(0, m.index); }
  if (!out.chosenType && (m = s.match(/\s+of the chosen type$/i))) { out.chosenType = true; s = s.slice(0, m.index); }
  for (const word of s.split(/\s+(?:or|and\/or)\s+|,\s*/i).map(w => w.trim()).filter(Boolean)) {
    const words = word.split(/\s+/);
    const noun = words.pop();
    for (const adj of words) {
      const a = adj.toLowerCase();
      if (COLORS[a]) out.colors.push(COLORS[a]);
      else if (a === 'nontoken') out.token = false;
      else if (a === 'token') out.token = true;
      else if (a === 'attacking') out.attacking = true;
      else if (a === 'blocking') out.blocking = true;
      else if (a === 'modified') out.modified = true;
      else if (/^non/.test(a)) out.nonTypes.push(a.slice(3));
      else if (/^[A-Z]/.test(adj) || ['artifact', 'enchantment', 'legendary', 'snow', 'basic', 'land'].includes(a)) out.allTypes.push(adj);   // "artifact creature": both
      else return null;
    }
    const n = noun.toLowerCase().replace(/s$/, '');
    if (/^tokens?$/i.test(noun)) { out.token = true; continue; }
    if (['creature', 'land', 'artifact', 'enchantment', 'planeswalker', 'permanent', 'card', 'battle'].includes(n) || /^[A-Z]/.test(noun)) out.types.push(n === 'permanent' || n === 'card' ? '*' : noun.replace(/s$/, ''));
    else if (/^(?:player|opponent)$/.test(n)) out.types.push(`player:${n}`);
    else return null;
  }
  return out;
}

function typeWord(typeLine, word) {
  if (word === '*') return true;
  return new RegExp(`\\b${escRe(word)}s?\\b`, 'i').test(typeLine || '');
}

/**
 * Does the card an event is about (`card` with definition `def`, controlled by `controllerId`)
 * fit the subject, seen from the trigger's own card (`row`)?
 */
export function subjectMatches(game, row, subject, card, def, controllerId) {
  if (!subject || !card) return false;
  const isSelf = card.instanceId === row.card.instanceId;
  if (subject.self) return isSelf;
  if (subject.orSelf && isSelf) return true;
  if (subject.another && isSelf) return false;
  if ((subject.equipped || subject.enchanted) && row.card.attachedTo !== card.instanceId) return false;
  if (subject.controller === 'you' && controllerId !== row.player.playerId) return false;
  if (subject.controller === 'opp' && controllerId === row.player.playerId) return false;
  if (subject.token !== null && !!card.token !== subject.token) return false;
  const typeLine = String(def?.typeLine || '');
  const types = subject.types.filter(t => !t.startsWith('player:'));
  // Changeling: every creature type (a capitalised subtype word that isn't a card type).
  const changeling = /\bChangeling\b/.test(String(def?.oracleText || '')) || (def?.keywords || []).some(k => /^changeling$/i.test(k));
  const has = t => typeWord(typeLine, t) || (changeling && /^[A-Z]/.test(t) && !/^(?:Artifact|Creature|Enchantment|Land|Planeswalker|Battle|Legendary|Basic|Snow|Kindred|Tribal|Token)$/.test(t) && /\b(?:Creature|Kindred|Tribal)\b/.test(typeLine));
  if (types.length && !types.some(t => has(t))) return false;
  if (subject.allTypes.some(t => !has(t))) return false;
  if (subject.nonTypes.some(t => typeWord(typeLine, t))) return false;
  if (subject.colors.length && !subject.colors.some(c => (def?.colors || []).includes(c))) return false;
  if (subject.power) {
    const p = Number(effectivePower(card, def, game));
    if (subject.power.op === 'greater' ? p < subject.power.n : p > subject.power.n) return false;
  }
  if (subject.manaValue) {
    const v = Number(def?.manaValue ?? def?.cmc ?? 0);
    if (subject.manaValue.op === 'greater' ? v < subject.manaValue.n : v > subject.manaValue.n) return false;
  }
  if (subject.keywords.some(k => !cardHasKeyword(card, def, k.replace(/\b\w/g, c => c.toUpperCase()), game))) return false;
  if (subject.attacking && !(game.combatState?.attackers || []).some(a => a.instanceId === card.instanceId)) return false;
  if (subject.modified && !Object.values(card.counters || {}).some(Number) && !(game.players || []).some(p => (p.deck?.battlefield || []).some(c => c.attachedTo === card.instanceId))) return false;
  if (subject.chosenType && !(row.card.chosenCreatureType && typeWord(typeLine, row.card.chosenCreatureType))) return false;
  return true;
}

/** Find a card anywhere in the game (battlefield first: the card as it is now, or as it was last seen). */
export function findAnyCard(game, id) {
  if (!id) return null;
  for (const zone of ['battlefield', 'graveyard', 'exile', 'hand', 'commandZone', 'remainingLibrary'])
    for (const p of game.players || []) {
      const card = (p.deck?.[zone] || []).find(c => c.instanceId === id);
      if (card) return { card, player: p, zone };
    }
  return null;
}

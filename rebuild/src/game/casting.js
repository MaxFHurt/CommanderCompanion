// Every legal way to cast a card from where it is, with what each way costs:
// normal, evoke, dash, blitz, overload, morph/megamorph/disguise (face down) from hand;
// flashback and escape from a graveyard; a foretold card or an adventurer's creature from exile.
// Costs include commander tax, cost increases and reductions (eminence, affinity, Thalia …),
// convoke (tap creatures) and delve (exile graveyard cards). Kicker, multikicker and buyback
// are extra costs asked for after the way to cast is chosen.

import { parseManaCost, validatePlay } from '../engine/rules.js';
import { defOf, definitionsMap, isLand, opponentsOf } from './helpers.js';
import { FACE_DOWN_ID, faceDownDefinition } from '../engine/face-down.js';

export { FACE_DOWN_ID, faceDownDefinition };

const COST = '((?:\\{[^}]+\\})+)';
const strip = text => String(text || '').replace(/\([^()]*\)/g, '');

/** A keyword followed by a mana cost on its own line, e.g. "Flashback {2}{U}". Non-mana costs return null. */
export function keywordCost(text, word) {
  const m = strip(text).match(new RegExp(`(?:^|\\n)\\s*${word}(?:\\s*[—-]\\s*|\\s+)${COST}(?=\\s*(?:$|\\n|,|\\.))`, 'i'));
  return m ? m[1] : null;
}

export function escapeCost(text) {
  const m = strip(text).match(new RegExp(`(?:^|\\n)\\s*Escape\\s*[—-]\\s*${COST},\\s*Exile (\\w+) other cards? from your graveyard`, 'i'));
  if (!m) return null;
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return { cost: m[1], exile: Number(m[2]) || words[m[2].toLowerCase()] || 0 };
}

export function isAdventure(base) {
  return base?.layout === 'adventure' || (base?.cardFaces?.length === 2 && /Adventure/i.test(base.cardFaces[1]?.typeLine || ''));
}

/** Generic mana added (+) or removed (−) from a cost string; colored symbols are never reduced. */
export function adjustGeneric(cost, delta) {
  const symbols = [...String(cost || '').matchAll(/\{([^}]+)\}/g)].map(x => x[1]);
  let generic = 0;
  const rest = [];
  for (const s of symbols) { if (/^\d+$/.test(s)) generic += Number(s); else rest.push(s); }
  generic = Math.max(0, generic + delta);
  const xs = rest.filter(s => /^X$/i.test(s)), others = rest.filter(s => !/^X$/i.test(s));
  return [...xs.map(s => `{${s}}`), generic ? `{${generic}}` : '', ...others.map(s => `{${s}}`)].join('') || (symbols.length ? '{0}' : '');
}

export function genericOf(cost) { return parseManaCost(cost || '').generic; }

// ---------------------------------------------------------------------------------------------
// Cost increases and reductions

const COLOR_WORDS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };

/** Does a spell match a phrase such as "Dragon", "noncreature", "instant and sorcery", "white creature"? */
export function spellMatches(def, phrase) {
  const p = String(phrase || '').toLowerCase().replace(/\bspells?\b/g, '').trim();
  if (!p) return true;
  const type = String(def?.typeLine || '').toLowerCase();
  return p.split(/\s+(?:and|or)\s+|,\s*/).filter(Boolean).some(part => part.split(/\s+/).every(word => {
    if (word === 'noncreature') return !type.includes('creature');
    if (word === 'nonartifact') return !type.includes('artifact');
    if (word === 'multicolored') return (def?.colors || []).length > 1;
    if (word === 'colorless') return !(def?.colors || []).length;
    if (COLOR_WORDS[word]) return (def?.colors || []).includes(COLOR_WORDS[word]);
    if (word === 'historic') return /artifact|legendary|saga/.test(type);
    return type.includes(word.replace(/s$/, ''));
  }));
}

function countPhrase(game, player, phrase) {
  const s = String(phrase || '').toLowerCase();
  if (/opponent/.test(s)) return opponentsOf(game, player.playerId).length;
  const word = (s.match(/^(?:other )?(\w+)/) || [])[1] || 'card';
  const typeOk = c => {
    const t = String(defOf(game, c)?.typeLine || '').toLowerCase();
    return ['card', 'permanent'].includes(word) || t.includes(word.replace(/s$/, ''));
  };
  if (/in your graveyard/.test(s)) return (player.deck?.graveyard || []).filter(typeOk).length;
  if (/in your hand/.test(s)) return (player.deck?.hand || []).filter(typeOk).length;
  if (/on the battlefield/.test(s)) return (game.players || []).flatMap(p => p.deck?.battlefield || []).filter(typeOk).length;
  return (player.deck?.battlefield || []).filter(typeOk).length;
}

/** Total generic change to a spell's cost from its own text and from permanents (and eminence). */
export function costChanges(game, player, def, card) {
  const notes = [];
  let delta = 0;
  const own = strip(def?.oracleText);
  let m;
  if ((m = own.match(/This spell costs \{(\d+)\} less to cast for each ([^.]+)\./i))) {
    const n = Number(m[1]) * countPhrase(game, player, m[2]);
    if (n) { delta -= n; notes.push(`${n} less (${m[2]})`); }
  }
  if ((m = own.match(/This spell costs \{(\d+)\} less to cast if you control (?:an?|two or more) ([^.]+?)\./i))) {
    if (countPhrase(game, player, `${m[2]} you control`) > 0) { delta -= Number(m[1]); notes.push(`${m[1]} less`); }
  }
  if ((m = own.match(/(?:^|\n)\s*Affinity for (\w+)/i))) {
    const n = countPhrase(game, player, `${m[1]} you control`);
    if (n) { delta -= n; notes.push(`affinity −${n}`); }
  }
  if (/(?:^|\n)\s*Undaunted\b/i.test(own)) {
    const n = opponentsOf(game, player.playerId).length;
    if (n) { delta -= n; notes.push(`undaunted −${n}`); }
  }
  const sources = [];
  for (const p of game.players || []) {
    if (p.eliminated) continue;
    for (const c of p.deck?.battlefield || []) sources.push({ p, c, zone: 'battlefield' });
    for (const c of p.deck?.commandZone || []) sources.push({ p, c, zone: 'command' });
  }
  for (const { p, c, zone } of sources) {
    if (card && c.instanceId === card.instanceId) continue;
    const text = strip(defOf(game, c)?.oracleText);
    for (const line of text.split('\n')) {
      const eminence = /^\s*Eminence\b/i.test(line);
      if (zone === 'command' && !eminence) continue;
      let r;
      if ((r = line.match(/(other )?([^.,]*?)spells you cast cost \{(\d+)\} less to cast/i)) && p.playerId === player.playerId) {
        if (r[1] && card && c.definitionId === card.definitionId) continue;
        if (spellMatches(def, r[2].replace(/^.*\b(?:other)\s+/i, ''))) { delta -= Number(r[3]); notes.push(`${defOf(game, c)?.name}: ${r[3]} less`); }
      } else if ((r = line.match(/([^.,]*?)spells (your opponents cast |you cast )?cost \{(\d+)\} more to cast/i))) {
        const who = r[2] || '';
        if (/opponents/i.test(who) && p.playerId === player.playerId) continue;
        if (/you cast/i.test(who) && p.playerId !== player.playerId) continue;
        if (spellMatches(def, r[1])) { delta += Number(r[3]); notes.push(`${defOf(game, c)?.name}: ${r[3]} more`); }
      }
    }
  }
  return { delta, notes };
}

/** Untapped creatures a convoke spell may tap, as flexible mana sources paid last. */
export function convokeSources(game, player, card) {
  return (player.deck?.battlefield || [])
    .filter(c => !c.tapped && c.instanceId !== card?.instanceId && /Creature/i.test(defOf(game, c)?.typeLine || ''))
    .map(c => {
      const colors = defOf(game, c)?.colors || [];
      return { instanceId: c.instanceId, options: colors.length ? [...colors] : ['C'], zone: 'battlefield', convoke: true };
    });
}

export function hasConvoke(def) { return /(?:^|\n)\s*Convoke\b/i.test(strip(def?.oracleText)); }
export function hasDelve(def) { return /(?:^|\n)\s*Delve\b/i.test(strip(def?.oracleText)); }

/** Graveyard cards a delve spell could exile (not itself). */
export function delveCards(player, card) {
  return (player.deck?.graveyard || []).filter(c => c.instanceId !== card?.instanceId);
}

// ---------------------------------------------------------------------------------------------
// The ways to cast

const MODE_LABEL = {
  normal: 'Cast', flashback: 'Flashback', escape: 'Escape', evoke: 'Evoke', dash: 'Dash', blitz: 'Blitz', overload: 'Overload',
  'jump-start': 'Jump-start', retrace: 'Retrace', 'commander-free': 'Cast free (you control a commander)', morph: 'Cast face down (morph)', megamorph: 'Cast face down (megamorph)', disguise: 'Cast face down (disguise)', foretell: 'Cast foretold', adventure: 'Cast from adventure'
};

/** Does this player control a commander on the battlefield? (Fierce Guardianship, Deadly Rollick …) */
export function controlsACommander(game, player) {
  const ids = new Set((game.players || []).flatMap(p => (p.commanders || []).map(c => c.cardId)));
  return (player.deck?.battlefield || []).some(c => ids.has(c.definitionId) && !c.token);
}

/**
 * "As an additional cost to cast this spell, …": { kind: 'sacrifice', filter, label } | { kind: 'discard' } |
 * { kind: 'life-x' }, or null.
 */
export function additionalCost(def) {
  const text = strip(def?.oracleText || '');
  let m;
  if ((m = text.match(/As an additional cost to cast this spell, sacrifice (?:a|an) ([a-z ]+?)(?: or (?:a|an)? ?([a-z ]+?))?\./i)))
    return { kind: 'sacrifice', filters: [m[1], m[2]].filter(Boolean).map(x => x.trim().toLowerCase()), label: `Sacrifice a ${[m[1], m[2]].filter(Boolean).join(' or ')}` };
  if (/As an additional cost to cast this spell, discard a card\./i.test(text)) return { kind: 'discard', label: 'Discard a card' };
  if (/As an additional cost to cast this spell, pay X life\./i.test(text)) return { kind: 'life-x', label: 'Pay X life' };
  return null;
}

/** Ways this card could be cast from its current zone (before checking mana and timing). */
export function castModes(game, player, card, def, base = null) {
  base = base || game.cardDefinitions?.[card.realDefinitionId || card.definitionId];
  const text = def?.oracleText || '';
  const zone = card.zone;
  const modes = [];
  const graveyardPermission = (player.temporaryPermissions || []).some(x => x?.kind === 'cast-from-zone' && x?.zone === 'graveyard');
  if (zone === 'hand' || zone === 'command' || (zone === 'graveyard' && graveyardPermission)) {
    if (def?.manaCost || isLand(def)) modes.push({ id: 'normal', cost: def.manaCost || '' });
  }
  if (zone === 'hand') {
    for (const id of ['evoke', 'dash', 'blitz', 'overload']) {
      const cost = keywordCost(text, id);
      if (cost) modes.push({ id, cost });
    }
    // Face-down casting uses the whole card's text (a morph card's front face).
    for (const id of ['megamorph', 'morph', 'disguise']) {
      const up = keywordCost(base?.oracleText || text, id);
      if (up) { modes.push({ id, cost: '{3}', faceDown: id === 'megamorph' ? 'morph' : id, turnUpCost: up, megamorph: id === 'megamorph' }); break; }
    }
  }
  if ((zone === 'hand' || zone === 'command') && /If you control a commander, you may cast this spell without paying its mana cost/i.test(text) && controlsACommander(game, player))
    modes.push({ id: 'commander-free', cost: '' });
  if (zone === 'graveyard') {
    const fb = keywordCost(text, 'Flashback');
    if (fb) modes.push({ id: 'flashback', cost: fb, exileAfter: true });
    const js = keywordCost(text, 'Jump-start') !== null || /(?:^|\n)\s*Jump-start\b/i.test(strip(text));
    if (js && def?.manaCost) modes.push({ id: 'jump-start', cost: def.manaCost, exileAfter: true, discard: 1 });
    if (/(?:^|\n)\s*Retrace\b/i.test(strip(text)) && def?.manaCost) modes.push({ id: 'retrace', cost: def.manaCost, discardLand: true });
    const esc = escapeCost(text);
    if (esc && delveCards(player, card).length >= esc.exile) modes.push({ id: 'escape', cost: esc.cost, escapeExile: esc.exile, exileAfter: /Instant|Sorcery/i.test(def?.typeLine || '') });
  }
  if (zone === 'exile' && card.ownerId === player.playerId) {
    if (card.foretold && card.foretoldTurn !== game.turnNumber) {
      const cost = keywordCost(base?.oracleText || text, 'Foretell');
      if (cost) modes.push({ id: 'foretell', cost });
    }
    if (card.onAdventure && !/Adventure/i.test(def?.typeLine || '')) modes.push({ id: 'adventure', cost: def?.manaCost || '' });
  }
  return modes.map(mode => ({ ...mode, label: MODE_LABEL[mode.id] || mode.id }));
}

/** Kicker / multikicker / buyback costs printed on a spell. */
export function extraCosts(def) {
  const text = def?.oracleText || '';
  return {
    kicker: keywordCost(text, 'Kicker'),
    multikicker: keywordCost(text, 'Multikicker'),
    buyback: keywordCost(text, 'Buyback')
  };
}

/** The full cost for one way to cast, with tax and cost changes; also the convoke sources to count. */
export function modeCost(game, player, card, def, mode, { tax = 0, extra = '' } = {}) {
  let cost = (mode.cost || '') + (extra || '');
  if (mode.faceDown) cost = mode.cost; // face-down spells have no other costs printed on them
  const changes = mode.faceDown ? { delta: 0, notes: [] } : costChanges(game, player, def, card);
  cost = adjustGeneric(cost, tax + changes.delta);
  return { cost, notes: changes.notes, convoke: !mode.faceDown && hasConvoke(def) ? convokeSources(game, player, card) : [], delve: !mode.faceDown && hasDelve(def) ? delveCards(player, card).length : 0 };
}

/** Legality of each way to cast. Delve counts as paid with the most cards the graveyard allows. */
export function castOptions(game, player, card, def, { commander = null } = {}) {
  const kind = isLand(def) ? 'land' : 'cast';
  const modes = castModes(game, player, card, def);
  const rules = game.rulesConfig || {};
  const tax = commander && rules.commanderTax !== false ? Number(commander.commanderTax || 0) : 0;
  return modes.map(mode => {
    if (kind === 'land') {
      const result = validatePlay({ game, player, definition: def, instance: card, kind, definitions: definitionsMap(game) });
      return { ...mode, ...result };
    }
    const priced = modeCost(game, player, card, def, mode, { tax });
    const delve = Math.min(priced.delve, genericOf(priced.cost));
    const cost = adjustGeneric(priced.cost, -delve);
    const definition = mode.faceDown ? faceDownDefinition(mode.faceDown) : def;
    const result = validatePlay({ game, player, definition, instance: card, kind, commander, definitions: definitionsMap(game), costOverride: cost, extraFlex: priced.convoke });
    if (mode.discard && !(player.deck?.hand || []).length) { result.legal = false; result.reasons = [...(result.reasons || []), 'You need a card in hand to discard.']; }
    if (mode.discardLand && !(player.deck?.hand || []).some(c => isLand(defOf(game, c)))) { result.legal = false; result.reasons = [...(result.reasons || []), 'You need a land card in hand to discard.']; }
    if (mode.faceDown) result.reasons = result.reasons.filter(r => !/color identity/i.test(r));
    const extra = mode.faceDown ? null : additionalCost(def);
    if (extra?.kind === 'sacrifice' && !(player.deck?.battlefield || []).some(c => extra.filters.some(f => String(defOf(game, c)?.typeLine || '').toLowerCase().includes(f)))) { result.legal = false; result.reasons = [...(result.reasons || []), `You need a ${extra.filters.join(' or ')} to sacrifice.`]; }
    if (extra?.kind === 'discard' && (player.deck?.hand || []).length < 2) { result.legal = false; result.reasons = [...(result.reasons || []), 'You need another card in hand to discard.']; }
    return { ...mode, ...result, legal: mode.faceDown ? result.reasons.length === 0 : result.legal, fullCost: priced.cost, notes: priced.notes };
  });
}

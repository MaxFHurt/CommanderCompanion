// What a player is allowed to do right now. Used by the controller to accept or reject
// actions and by the view to highlight playable cards and explain blocked ones.

import {
  validatePlay, validateAttack, validateBlock, parseActivatedAbilities, validateActivatedAbilityFull, planMana,
  effectiveManaOptionsForSource, playerManaAvailability, blockerCapacity
} from '../engine/rules.js';
import { defOf, definitionsMap, faceDefinition, isLand, isInstantSpeed, opponentsOf, playerById, alivePlayers, attackablePermanents } from './helpers.js';
import { candidatesFor } from './requirements.js';
import { castOptions, keywordCost } from './casting.js';
import { effectivePower } from '../engine/combat.js';
import { parseSubject, subjectMatches } from '../engine/trigger-subject.js';

const HAND_MANA_COST = /^Exile\s+(?:this card|[^:]+?)\s+from your hand$/i;

export function stackTop(game) {
  return (game.stack || []).at(-1) || null;
}

export function isIdle(game) {
  const f = game.flow;
  return !f.op && !f.priority && !(game.stack || []).length && !(game.pendingTriggers || []).length && !f.queue.length && f.stage === 'play';
}

/** May this player start an action (cast, activate) right now? Returns a reason string when not. */
export function timingBlock(game, playerId) {
  const f = game.flow;
  if (game.status === 'complete') return 'The game is over.';
  if (f.stage !== 'play') return 'Opening hands are still being chosen.';
  if (f.op) return 'Finish the current choice first.';
  if (f.proposal) return 'The table is answering a request.';
  if (f.correction) return 'A correction is being prepared.';
  if (f.guided) return 'A spell or ability is waiting to be resolved by hand.';
  if (f.priority) {
    return f.priority.holderId === playerId ? null : `${playerById(game, f.priority.holderId)?.displayName || 'Another player'} has priority.`;
  }
  if (f.blocks) return 'Blockers are being declared.';
  if (f.discard) return 'Cleanup: a player is discarding.';
  if ((game.pendingTriggers || []).length || f.queue.length || (game.stack || []).length) return 'The game is resolving — wait a moment.';
  // With nothing happening, the active player may do anything and other players may act at instant speed.
  return null;
}

export function commanderEntryFor(player, card) {
  return (player.commanders || []).find(c => c.cardId === card.definitionId && c.zone === 'command') || null;
}

/** Legality of playing one card (optionally a specific face). */
export function playCheck(game, player, card, faceIndex = null) {
  const base = game.cardDefinitions?.[card.definitionId];
  const def = Number.isInteger(faceIndex) ? faceDefinition(base, faceIndex) : defOf(game, { ...card, activeFaceIndex: null });
  if (!def) return { legal: false, reasons: ['Card data is missing.'], kind: 'cast', def: null };
  const kind = isLand(def) ? 'land' : 'cast';
  const commander = card.zone === 'command' ? commanderEntryFor(player, card) : null;
  const options = castOptions(game, player, card, def, { commander });
  if (!options.length) return { legal: false, reasons: [card.zone === 'graveyard' ? 'This card cannot be cast from a graveyard right now.' : card.zone === 'exile' ? 'This card cannot be cast from exile.' : 'This card cannot be cast.'], kind, def, commander, options };
  const best = options.find(o => o.legal) || options[0];
  return { ...best, legal: !!options.find(o => o.legal), kind, def, commander, options, mode: best.id };
}

/** Is this instant-speed card worth offering as a response to what is on the stack? */
function responseRelevant(game, def, holder) {
  const text = String(def?.oracleText || '').toLowerCase();
  const top = stackTop(game);
  const topDef = top ? game.cardDefinitions?.[top.sourceDefinitionId || top.card?.definitionId] : null;
  if (/counter target spell/.test(text)) return !!top && top.kind === 'spell';
  if (/counter target (?:activated|triggered) ability/.test(text)) return !!top && (top.kind === 'ability' || top.kind === 'trigger');
  if (/copy target (?:instant|sorcery) spell/.test(text)) return !!top && top.kind === 'spell' && /Instant|Sorcery/i.test(topDef?.typeLine || '');
  const targetPhrase = text.match(/target (?:creature|permanent|artifact|enchantment|planeswalker|land|player|opponent)[^.]*/);
  if (targetPhrase) {
    const kind = /target (?:player|opponent)/.test(targetPhrase[0]) && !/creature|permanent/.test(targetPhrase[0]) ? 'target' : 'target';
    return candidatesFor(game, { kind, scope: targetPhrase[0] }, holder).length > 0;
  }
  return true;
}

function abilityRespondsToStack(game, ability) {
  const effect = String(ability?.effect || '').toLowerCase();
  const top = stackTop(game);
  if (!top) return false;
  if (top.kind === 'spell') return /counter target spell|copy target spell|change (?:the )?target|target spell/.test(effect);
  return /counter target (?:activated|triggered) ability|copy target (?:activated|triggered) ability|target (?:activated|triggered) ability/.test(effect);
}

/** Cards and abilities a player could legally use if given priority now. */
export function responseOptions(game, player) {
  const graveyardCasting = (player.temporaryPermissions || []).some(x => x?.kind === 'cast-from-zone' && x?.zone === 'graveyard');
  const cards = [...(player.deck?.hand || []), ...(player.deck?.graveyard || []), ...(player.deck?.exile || [])].filter(card => {
    if (card.zone !== 'hand' && !graveyardCasting && !castOptions(game, player, card, defOf(game, card)).length) return false;
    const def = defOf(game, card);
    if (!def || isLand(def) || !isInstantSpeed(def) || !responseRelevant(game, def, player)) return false;
    return playCheck(game, player, card).legal;
  });
  const abilities = (player.deck?.battlefield || []).filter(card => {
    const def = defOf(game, card);
    return parseActivatedAbilities(def).some(a => !a.manaAbility && abilityRespondsToStack(game, a)
      && validateActivatedAbilityFull({ game, player, instance: card, definition: def, ability: a, definitions: definitionsMap(game) }).legal);
  });
  // Ninjutsu has a short window (after blockers), so it is worth stopping for.
  const ninjas = (player.deck?.hand || []).filter(card => specialRows(game, player, card, { running: true }).some(r => r.ability.special === 'ninjutsu' && r.legal));
  return { cards, abilities: [...abilities, ...ninjas] };
}

export function hasResponse(game, player) {
  const options = responseOptions(game, player);
  return options.cards.length > 0 || options.abilities.length > 0;
}

/** Special actions and hand abilities: cycling, foretell, ninjutsu, turning a face-down creature up. */
export function specialRows(game, player, card, { running = false } = {}) {
  const def = defOf(game, card);
  if (!def) return [];
  const rows = [];
  const text = String(def.oracleText || '');
  // While the action itself is running, its own op must not count as "finish the current choice".
  const block = running ? null : timingBlock(game, player.playerId);
  const payable = cost => planMana(playerManaAvailability(player, game), cost, 0, { lifeAvailable: Number(player.life || 0) }).ok;
  const row = (id, label, cost, reasons) => rows.push({ ability: { id: `special:${id}`, text: `${label} ${cost}`.trim(), cost, effect: label, manaAbility: false, special: id }, legal: !reasons.filter(Boolean).length, reasons: reasons.filter(Boolean), fromHand: card.zone === 'hand' });
  if (card.zone === 'hand') {
    const cyc = keywordCost(text, 'Cycling');
    if (cyc) row('cycling', 'Cycling', cyc, [block, !payable(cyc) && 'Not enough mana.']);
    const type = String(text).replace(/\([^()]*\)/g, '').match(/(?:^|\n)\s*((?:Basic )?\w+cycling) ((?:\{[^}]+\})+)/i);
    if (type && !/^Cycling$/i.test(type[1])) row(`typecycling:${type[1]}`, type[1], type[2], [block, !payable(type[2]) && 'Not enough mana.']);
    const fore = keywordCost(text, 'Foretell');
    if (fore) row('foretell', 'Foretell (exile face down)', '{2}', [block, game.activePlayerId !== player.playerId && 'Only during your turn.', !payable('{2}') && 'Not enough mana.']);
    const ninja = keywordCost(text, 'Ninjutsu');
    if (ninja) {
      const cs = game.combatState;
      const blocked = new Set(Object.values(cs?.blocks || {}).flatMap(b => (b.assignments || []).map(a => a.attackerId)));
      const unblocked = game.phase === 'declare-blockers' && !game.flow.blocks && (cs?.attackers || []).some(a => a.playerId === player.playerId && !blocked.has(a.instanceId));
      row('ninjutsu', 'Ninjutsu', ninja, [block, !unblocked && 'Only after blockers, with an unblocked attacker.', !payable(ninja) && 'Not enough mana.']);
    }
  }
  // Crew N (Vehicles): tap other untapped creatures with total power N or more; it becomes an artifact creature this turn.
  const crew = card.zone === 'battlefield' && String(text).replace(/\([^()]*\)/g, '').match(/(?:^|\n)\s*Crew (\d+)/i);
  if (crew) {
    const need = Number(crew[1]);
    const power = (player.deck.battlefield || []).filter(c => c.instanceId !== card.instanceId && !c.tapped && /\bCreature\b/i.test(defOf(game, c)?.typeLine || '')).reduce((n, c) => n + Math.max(0, effectivePower(c, defOf(game, c), game)), 0);
    row('crew', `Crew ${need}`, '', [block, power < need && `Untapped creatures with total power ${need} or more are needed.`]);
  }
  if (card.zone === 'battlefield' && card.realDefinitionId && card.castFlags?.turnUpCost) {
    row('turn-face-up', 'Turn face up', card.castFlags.turnUpCost, [block, !payable(card.castFlags.turnUpCost) && 'Not enough mana.']);
  }
  return rows;
}

const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/**
 * "Activate only if …", "Activate only during your turn", "Activate only once each turn": the rules an ability's text
 * puts on when it can be used, read into checks. Returns null if a restriction is not understood (the audit then
 * counts the ability as by hand).
 */
export function activationRules(text) {
  const rules = [];
  for (const m of String(text || '').matchAll(/Activate (?:this ability )?only ([^.]+)\./gi)) {
    const r = m[1].trim();
    let x;
    if (/^as a sorcery$/i.test(r)) continue;   // checked with the timing rules
    if (/^once each turn$/i.test(r)) rules.push({ kind: 'once' });
    else if (/^as a sorcery and only once each turn$/i.test(r)) rules.push({ kind: 'once' });
    else if (/^during your turn$/i.test(r)) rules.push({ kind: 'your-turn' });
    else if (/^during combat$/i.test(r)) rules.push({ kind: 'combat' });
    else if (/^during your upkeep$/i.test(r)) rules.push({ kind: 'upkeep' });
    else if ((x = r.match(/^if there are (one|two|three|four|five|six|seven|eight|\d+) or more cards in your graveyard$/i))) rules.push({ kind: 'graveyard', n: COUNT_WORDS[x[1].toLowerCase()] || Number(x[1]) });
    else if ((x = r.match(/^if there are (four|five|\d+) or more card types among cards in your graveyard$/i))) rules.push({ kind: 'delirium', n: COUNT_WORDS[x[1].toLowerCase()] || Number(x[1]) });
    else if ((x = r.match(/^if you control (a|an|one or more|two or more|three or more|four or more|five or more|six or more|seven or more) (.+)$/i))) {
      if (!parseSubject(x[2].replace(/s$/, ''), null)) return null;
      rules.push({ kind: 'control', n: COUNT_WORDS[x[1].toLowerCase().split(' ')[0]] || 1, subject: x[2].replace(/s$/, '') });
    }
    else return null;
  }
  return rules;
}
/** Why the ability cannot be used right now because of its "Activate only …" text, or null. */
export function activationBlock(game, player, card, ability) {
  const rules = activationRules(ability?.text) || [];
  for (const r of rules) {
    if (r.kind === 'once' && card?.activatedTurn?.[ability.id] === game.turnNumber) return 'Only once each turn.';
    if (r.kind === 'your-turn' && game.activePlayerId !== player.playerId) return 'Only during your turn.';
    if (r.kind === 'combat' && !/combat|attackers|blockers|damage/.test(String(game.phase || ''))) return 'Only during combat.';
    if (r.kind === 'upkeep' && !(game.activePlayerId === player.playerId && game.phase === 'upkeep')) return 'Only during your upkeep.';
    if (r.kind === 'graveyard' && (player.deck?.graveyard || []).length < r.n) return `Only with ${r.n} or more cards in your graveyard.`;
    if (r.kind === 'delirium') {
      const types = new Set((player.deck?.graveyard || []).flatMap(c => (String(defOf(game, c)?.typeLine || '').split('—')[0].match(/Artifact|Battle|Creature|Enchantment|Instant|Kindred|Land|Planeswalker|Sorcery/g) || [])));
      if (types.size < r.n) return `Only with ${r.n} or more card types in your graveyard.`;
    }
    if (r.kind === 'control') {
      const subject = parseSubject(r.subject, null);
      const row = { card: { instanceId: card?.instanceId || 'none' }, player };
      const n = (player.deck?.battlefield || []).filter(c => subjectMatches(game, row, { ...subject, controller: null }, c, defOf(game, c), player.playerId)).length;
      if (n < r.n) return `Only if you control ${r.n > 1 ? `${r.n} or more ` : 'a '}${r.subject}.`;
    }
  }
  return null;
}

/** Where an activated ability works from: 'hand' (Channel — "Discard this card"), 'graveyard' ("Return this card from your graveyard …"), or the battlefield. */
export function abilityZone(ability) {
  if (/\bDiscard this card\b/i.test(ability?.cost || '')) return 'hand';
  if (/\bthis card from your graveyard\b/i.test(ability?.effect || '')) return 'graveyard';
  return 'battlefield';
}

/** Activated abilities of a card with their current legality. */
export function abilityRows(game, player, card) {
  const def = defOf(game, card);
  if (!def) return [];
  const inHand = card.zone === 'hand';
  const zone = card.zone === 'hand' || card.zone === 'graveyard' ? card.zone : 'battlefield';
  const payable = cost => planMana(playerManaAvailability(player, game), (String(cost || '').match(/\{(?:\d+|X|[WUBRGC](?:\/[WUBRGC])?(?:\/P)?|2\/[WUBRG])\}/gi) || []).join(''), 0, { lifeAvailable: Number(player.life || 0) }).ok;
  return [...(zone === 'graveyard' ? [] : specialRows(game, player, card)), ...parseActivatedAbilities(def)
    .filter(ability => (inHand && ability.manaAbility ? HAND_MANA_COST.test(String(ability.cost || '').trim()) : abilityZone(ability) === zone))
    .map(ability => {
      const fromZone = zone !== 'battlefield' && !ability.manaAbility;
      const instantSpeed = !/Activate only as a sorcery/i.test(ability.text) || (game.activePlayerId === player.playerId && ['precombat-main', 'postcombat-main'].includes(game.phase) && !(game.stack || []).length);
      const check = fromZone ? { legal: payable(ability.cost) && instantSpeed, reasons: [!payable(ability.cost) && 'Not enough mana.', !instantSpeed && 'Only during your main phase while the stack is empty.'].filter(Boolean) }
        : inHand ? { legal: true, reasons: [] }
        : validateActivatedAbilityFull({ game, player, instance: card, definition: def, ability, definitions: definitionsMap(game) });
      const sorcery = /Activate only as a sorcery/i.test(ability.text) || ability.loyaltyDelta !== null;
      if (sorcery && check.legal) {
        if (game.activePlayerId !== player.playerId || !['precombat-main', 'postcombat-main'].includes(game.phase) || (game.stack || []).length) {
          return { ability, legal: false, reasons: ['Only during your main phase while the stack is empty.'], fromHand: inHand };
        }
        if (ability.loyaltyDelta !== null && card.loyaltyUsedTurn === game.turnNumber) return { ability, legal: false, reasons: ['One loyalty ability each turn.'], fromHand: inHand };
      }
      const restricted = activationBlock(game, player, card, ability);
      if (restricted && check.legal) return { ability, legal: false, reasons: [restricted], fromHand: inHand };
      return { ability, legal: check.legal, reasons: check.reasons, fromHand: inHand };
    })];
}

export function manaOptionsForAbility(game, player, card, ability) {
  const def = defOf(game, card);
  let options = effectiveManaOptionsForSource({ game, player, card, definition: def, ability });
  if (/chosen color/i.test(ability.effect || '') && card?.chosenColor) options.push(card.chosenColor);
  if (/commander(?:’|'|)s color identity/i.test(ability.effect || '')) {
    const allowed = new Set();
    for (const cmd of player.commanders || []) for (const c of game.cardDefinitions?.[cmd.cardId]?.colorIdentity || []) allowed.add(c);
    // A colorless commander still lets the source make colorless mana.
    options = allowed.size ? options.filter(c => allowed.has(c)) : ['C'];
  }
  return [...new Set(options)];
}

export function manaAmountForAbility(ability, { game = null, player = null, card = null, color = null } = {}) {
  const effect = String(ability?.effect || ability?.text || '');
  // Amounts counted as the ability is used: Kami of Whispered Hopes, Sanctum Weaver, Nykthos, Three Tree City.
  if (game && player && /\bAdd (?:X mana|an amount of mana)\b/i.test(effect)) {
    const mine = (player.deck?.battlefield || []);
    const typeOf = c => String(defOf(game, c)?.typeLine || '');
    let m;
    if (/X is (?:this creature|~)'?s power|equal to (?:this creature|~)'?s power/i.test(effect) && card) return Math.max(0, Number(effectivePower(card, defOf(game, card), game) || 0));
    if (/greatest power among creatures you control/i.test(effect)) return Math.max(0, ...mine.filter(c => /Creature/i.test(typeOf(c))).map(c => Number(effectivePower(c, defOf(game, c), game) || 0)));
    if (/devotion to that color/i.test(effect) && color) return mine.reduce((n, c) => n + (String(defOf(game, c)?.manaCost || '').match(/\{[^}]+\}/g) || []).filter(sym => sym.includes(color)).length, 0);
    if (/creatures you control of the chosen type/i.test(effect) && card?.chosenCreatureType) return mine.filter(c => /Creature/i.test(typeOf(c)) && new RegExp(`\\b${card.chosenCreatureType}`, 'i').test(typeOf(c))).length;
    if ((m = effect.match(/the number of (artifacts|enchantments|creatures|lands|Elves|Elf|[A-Z][a-z]+s?) you control/i))) {
      const word = m[1].replace(/s$/i, '').replace(/^Elve$/i, 'Elf');
      return mine.filter(c => new RegExp(`\\b${word}`, 'i').test(typeOf(c))).length;
    }
  }
  const symbols = [...effect.matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]);
  if (symbols.length && !/\bor\b/i.test(effect)) return Math.max(1, symbols.length);
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const m = effect.match(/Add (one|two|three|four|five|\d+) mana/i);
  return Math.max(1, Number(m?.[1]) || words[String(m?.[1] || '').toLowerCase()] || 1);
}

/** Creatures the player could attack with, each with the players it may attack. */
export function attackOptions(game, player) {
  const view = { ...game, phase: 'declare-attackers' };
  const defenders = opponentsOf(game, player.playerId);
  const rows = [];
  for (const card of player.deck?.battlefield || []) {
    const def = defOf(game, card);
    const legal = defenders.filter(d => validateAttack({ game: view, attackerId: player.playerId, defenderId: d.playerId, instance: card, definition: def }).legal);
    const goaded = (card.temporaryEffects || []).some(e => e?.kind === 'goad');
    const mustAttack = goaded || (card.temporaryEffects || []).some(e => e?.kind === 'combat-restriction' && e.restriction === 'must-attack');
    // Planeswalkers and battles are attacked through the player who controls / protects them.
    const targets = legal.flatMap(d => attackablePermanents(game, d).filter(x => x.controller.playerId !== player.playerId || x.kind === 'battle')
      .map(x => ({ id: x.card.instanceId, playerId: d.playerId, kind: x.kind, name: defOf(game, x.card)?.name || x.kind, value: Number(x.card.counters?.[x.kind === 'battle' ? 'defense' : 'loyalty'] || 0) })));
    if (legal.length) rows.push({ instanceId: card.instanceId, defenders: legal.map(d => d.playerId), targets, mustAttack, goaded });
  }
  return rows;
}

/** For each attacker heading at `defender`, the defender's creatures that may block it. */
export function blockOptions(game, defender) {
  const incoming = (game.combatState?.attackers || []).filter(a => a.defenderId === defender.playerId);
  return incoming.map(attack => {
    const attackerOwner = playerById(game, attack.playerId);
    const attacker = attackerOwner?.deck?.battlefield?.find(c => c.instanceId === attack.instanceId);
    const attackerDef = defOf(game, attacker);
    const blockers = (defender.deck?.battlefield || [])
      .filter(b => validateBlock({ blocker: b, definition: defOf(game, b), attackerDefinition: attackerDef, attacker }).legal)
      .map(b => ({ instanceId: b.instanceId, capacity: blockerCapacity(defOf(game, b)) }));
    const attacked = attack.targetId ? (game.players || []).flatMap(q => q.deck?.battlefield || []).find(c => c.instanceId === attack.targetId) : null;
    return { attackerId: attack.instanceId, attackerName: attackerDef?.name || 'Attacker', targetName: attacked ? defOf(game, attacked)?.name || null : null, blockers };
  });
}

/**
 * Mana the player can spend now: fixed sources by color plus each flexible source counted once
 * under the set of colors it could make. This is what "Available Mana" shows.
 */
export function availableMana(game, player) {
  const pool = playerManaAvailability(player, game);
  const fixed = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of Object.keys(fixed)) fixed[c] = Number(pool[c] || 0);
  const groups = new Map();
  for (const source of pool.__flex || []) {
    const key = [...new Set(source.options)].sort().join('');
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const flex = [...groups.entries()].map(([colors, count]) => ({ colors: colors.split(''), count }));
  const total = Object.values(fixed).reduce((n, v) => n + v, 0) + flex.reduce((n, g) => n + g.count, 0);
  return { fixed, flex, total };
}

/** Does the active player have anything optional to do in a main phase? */
export function hasMainPhaseAction(game, player) {
  for (const card of player.deck?.hand || []) if (playCheck(game, player, card).legal) return true;
  for (const card of player.deck?.commandZone || []) if (playCheck(game, player, card).legal) return true;
  for (const card of [...(player.deck?.graveyard || []), ...(player.deck?.exile || [])]) if (castOptions(game, player, card, defOf(game, card)).some(o => o.legal)) return true;
  for (const card of player.deck?.battlefield || []) {
    if (abilityRows(game, player, card).some(r => r.legal && !r.ability.manaAbility && !r.ability.special)) return true;
  }
  return false;
}

export function anyoneHasResponse(game) {
  return alivePlayers(game).some(p => hasResponse(game, p));
}

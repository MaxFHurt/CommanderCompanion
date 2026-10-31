import { withOverlay } from './overlay.js';
import { MANA_EXTRA_TEXT } from './mana-extras.js';
import { catalogTriggerMatch, PROBE_EXTRA_EVENTS } from './triggers-catalog.js';
// Commander Companion V0.7.27 triggered-ability event bridge.
// Trigger detection is event driven; resolution uses the same shared effect engine as spells/activated abilities.
import { compileEffectText, applyEffects, moveCard } from './effects.js';
import { keywordTriggers, designationTriggers } from './keyword-triggers.js';
import { recordStat } from '../game/stats.js';
import { parseSubject, subjectMatches, refersToSelf, findAnyCard } from './trigger-subject.js';
function defFor(game, card) { return withOverlay(card, plainDefFor(game, card)); }
function plainDefFor(game, card) { if (!card)
  return null; const base = game.cardDefinitions?.[card.definitionId] || null, i = Number.isInteger(card?.activeFaceIndex) ? card.activeFaceIndex : null, face = i === null ? null : base?.cardFaces?.[i]; return face ? { ...base, ...face, definitionId: base.definitionId, colorIdentity: base.colorIdentity, cardFaces: base.cardFaces, set: base.set, collectorNumber: base.collectorNumber, printing: base.printing, legalities: base.legalities, hydrationStatus: base.hydrationStatus } : base; }
function escRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function sourceRows(game, event) {
  const rows = [];
  for (const p of game.players || []) {
    if (p.eliminated)
      continue;
    for (const c of p.deck?.battlefield || [])
      rows.push({ player: p, card: c, definition: defFor(game, c), zone: 'battlefield', lastKnown: false });
    // Some triggered abilities explicitly function from another zone. Only expose those cards
    // as trigger sources when their own Oracle text requires that zone; do not globally turn
    // graveyards/hands/exile into active trigger-source zones.
    for (const c of p.deck?.graveyard || []) {
      const d = defFor(game, c);
      if (/(?:when|whenever|at)[\s\S]*if this card is in your graveyard/i.test(String(d?.oracleText || '')))
        rows.push({ player: p, card: c, definition: d, zone: 'graveyard', lastKnown: false });
    }
  }
  // Last-known information for a source that just left the battlefield / died.
  if (event?.sourceId && !rows.some(r => r.card.instanceId === event.sourceId)) {
    for (const p of game.players || []) {
      if (p.eliminated)
        continue;
      for (const zone of ['graveyard', 'exile', 'hand', 'commandZone']) {
        const c = (p.deck?.[zone] || []).find(x => x.instanceId === event.sourceId);
        if (c) {
          rows.push({ player: p, card: c, definition: defFor(game, c), zone, lastKnown: true });
          break;
        }
      }
    }
  }
  return rows;
}
export function parseTriggeredAbilities(definition) {
  const text = String(definition?.oracleText || '').replace(/\r/g, '');
  // Animate Dead: "When this Aura enters, … When this Aura leaves the battlefield, …" — two triggers on one line.
  // (never inside reminder text: Champion's "(… When this creature leaves the battlefield, that card returns …)")
  const splitLtb = line => { const parts = line.split(/(?<=\.|\.")\s+(?=When this (?:Aura|creature|enchantment|artifact|permanent) leaves the battlefield,)/); const out = [parts[0]]; for (const p of parts.slice(1)) { const prev = out.join(' '); if ((prev.match(/\(/g) || []).length > (prev.match(/\)/g) || []).length) out[out.length - 1] += ` ${p}`; else out.push(p); } return out; };
  const lines = text.split('\n').flatMap(splitLtb).map(x => x.trim()).filter(Boolean);
  const out = [];
  let current = null;
  const triggeredLine = line => { const m = String(line).match(/(?:^|[—-]\s*)((?:When|Whenever|At)\b.*)$/i); return m?.[1] || null; };
  for (const line of lines) {
    const start = triggeredLine(line);
    if (start) {
      if (current)
        out.push(current);
      current = start;
    }
    else if (current && (/^[•—-]/.test(line) || (/^if\b/i.test(line) && !/\bwould\b|triggers? an additional time|causes? a triggered ability/i.test(line)) || /^you may\b/i.test(line) || /^this ability triggers only once each turn\.?$/i.test(line))) {
      current += `\n${line}`;
    }
    else if (current) {
      out.push(current);
      current = null;
    }
  }
  if (current)
    out.push(current);
  // The trigger ends at the first comma that does not continue a list ("Whenever you cast an Aura, Equipment, or Vehicle spell, …").
  const triggerComma = line => { let at = line.indexOf(','); while (at >= 0 && !/\b(?:spells?|enters|dies|attacks)$/i.test(line.slice(0, at)) && /^\s*(?:(?:or|and|and\/or)\s|[A-Za-z-]+,)/.test(line.slice(at + 1))) at = line.indexOf(',', at + 1); return at; };
  return out.map((line, index) => { const comma = triggerComma(line); const trigger = comma >= 0 ? line.slice(0, comma).trim() : line; const rawEffect = comma >= 0 ? line.slice(comma + 1).trim() : ''; const oncePerTurn = /this ability triggers only once each turn/i.test(rawEffect) || /for the first time each turn/i.test(trigger); const effect = rawEffect.replace(/(?:^|\n)this ability triggers only once each turn\.?/ig, '').trim(); const modes = [...effect.matchAll(/(?:^|\n)•\s*([^\n]+)/g)].map(x => x[1].trim()); const uniquePerTurn = /choose one that (?:hasn[’']t|has not) been chosen this turn/i.test(effect); return { id: `trigger-${index}`, text: line, trigger, effect, modes, uniquePerTurn, oncePerTurn }; });
}
export function availableModalTriggerModes(card, trigger, turnNumber) {
  const ledger = card?.triggerModeChoices || {};
  const key = `${trigger?.abilityId || 'trigger'}:${Number(turnNumber || 0)}`;
  const used = new Set(Array.isArray(ledger[key]) ? ledger[key] : []);
  const modes = (trigger?.modal?.modes || []).map((text, index) => ({ text, index })).filter(row => !trigger?.modal?.uniquePerTurn || !used.has(row.index));
  return { key, used: [...used], modes };
}
export function recordModalTriggerModeChoice(card, trigger, turnNumber, index) {
  if (!card || !trigger?.modal?.uniquePerTurn)
    return false;
  const count = Number(trigger.modal.modes?.length || 0), choice = Number(index);
  if (!Number.isInteger(choice) || choice < 0 || choice >= count)
    throw new Error('Invalid triggered-mode choice.');
  const ledger = card.triggerModeChoices = card.triggerModeChoices || {};
  const key = `${trigger.abilityId || 'trigger'}:${Number(turnNumber || 0)}`;
  const used = new Set(Array.isArray(ledger[key]) ? ledger[key] : []);
  if (used.has(choice))
    throw new Error('That triggered mode has already been chosen this turn.');
  used.add(choice);
  ledger[key] = [...used];
  return true;
}
function typeMatches(typeLine, word) { return new RegExp(`\\b${escRe(word)}\\b`, 'i').test(typeLine || ''); }
function eventSpellDef(game, event) { return game.cardDefinitions?.[event?.definitionId] || null; }
function isYourEvent(row, event) { return event?.controllerId === row.player.playerId || event?.playerId === row.player.playerId; }
function otherThanSource(row, event) { return event?.sourceId !== row.card.instanceId; }
function countForTurn(player, key) { player.counters = player.counters || {}; return Number(player.counters[key] || 0); }
function selfZoneConditionMatches(row, ability) {
  const text = `${ability?.trigger || ''} ${ability?.effect || ''}`;
  if (/if this card is in your graveyard/i.test(text))
    return row.zone === 'graveyard';
  if (/if this card is in exile/i.test(text))
    return row.zone === 'exile';
  if (/if this card is in your hand/i.test(text))
    return row.zone === 'hand';
  if (/if this (?:card|permanent) is on the battlefield/i.test(text))
    return row.zone === 'battlefield';
  return true;
}
function attackedWithCommander(game, row, event) {
  if (event?.controllerId !== row.player.playerId)
    return false;
  const ids = new Set(event?.attackers || []);
  if (!ids.size)
    return false;
  const commanderDefIds = new Set((row.player.commanders || []).map(c => c.cardId).filter(Boolean));
  return (row.player.deck?.battlefield || []).some(c => ids.has(c.instanceId) && commanderDefIds.has(c.definitionId));
}
// ── General reading: "<who/what> <verb>", with the subject read by trigger-subject.js ─────────────
const PLAYER_WORDS = /^(you|an opponent|a player|each opponent|another player|each player|one or more opponents|target opponent|that player)$/i;
function whoMatches(who, playerId, row) {
  const w = String(who || '').toLowerCase();
  if (w === 'you') return playerId === row.player.playerId;
  if (/opponent|another player/.test(w)) return playerId !== row.player.playerId;
  return true;
}
const ORDINAL = { first: 1, second: 2, third: 3 };
// The card an event is about, with its definition and controller.
function eventCard(game, event, id = event.sourceId) {
  const hit = findAnyCard(game, id);
  const card = hit?.card || { instanceId: id, definitionId: event.definitionId, counters: {} };
  const def = defFor(game, card) || game.cardDefinitions?.[event.definitionId] || null;
  const controllerId = id === event.sourceId ? (event.controllerId ?? card.controllerId ?? hit?.player?.playerId) : (card.controllerId ?? hit?.player?.playerId);
  return { card, def, controllerId };
}
function subjectEvent(game, row, phrase, event, id) {
  const subject = parseSubject(phrase, row.definition);
  if (!subject || subject.types.some(x => x.startsWith('player:'))) return undefined;
  const { card, def, controllerId } = eventCard(game, event, id);
  return subjectMatches(game, row, subject, card, def, controllerId);
}
function spellFits(filter, spell) {
  let f = String(filter || '').trim().replace(/^(?:a|an)(?:\s+|$)/i, '').toLowerCase();
  const type = String(spell?.typeLine || '').toLowerCase(), colors = spell?.colors || [];
  let m;
  if ((m = f.match(/^(.*?)\s*with mana value (\d+) or (greater|less)$/))) {
    const v = Number(spell?.manaValue || 0), n = Number(m[2]);
    if (m[3] === 'greater' ? v < n : v > n) return false;
    f = m[1].trim();
  }
  if (!f) return true;
  return f.split(/,\s*(?:or\s+)?|\s+or\s+/).filter(Boolean).some(part => part.split(/\s+/).every(w => {
    if (w === 'multicolored') return colors.length > 1;
    if (w === 'kicked') return !!spell?.kicked;
    if (w === 'colorless') return colors.length === 0;
    if (w === 'monocolored') return colors.length === 1;
    const color = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[w];
    if (color) return colors.includes(color);
    if (w === 'historic') return /artifact|legendary|saga/.test(type);
    if (w.startsWith('non')) return !type.includes(w.slice(3));
    return new RegExp(`\\b${escRe(w.replace(/s$/, ''))}`).test(type);
  }));
}
const STEP_EVENTS = { upkeep: 'upkeep', 'draw step': 'draw-step', 'precombat main phase': 'precombat-main-start', 'first main phase': 'precombat-main-start', combat: 'begin-combat', 'combat on your turn': 'begin-combat', 'end step': 'end-step', 'end of combat': 'end-combat' };
/** true / false when the trigger's wording is understood for this event; undefined to fall back to the older readers below. */
function generalMatch(game, row, t, event) {
  let m;
  const extra = catalogTriggerMatch(game, row, t, event, { subjectEvent, whoMatches, eventCard, selfName: r => escRe(String(r.definition?.name || '').split(',')[0]) });
  if (extra !== undefined) return extra;
  switch (event.type) {
    case 'enters-battlefield':
      if ((m = t.match(/^Whenever (you|an opponent|a player|another player) plays? a land/i))) return !!event.played && whoMatches(m[1], event.controllerId, row);
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:enters|enter)\b(?: the battlefield)?(?: (under your control|under an opponent'?s control))?/i)))
        return subjectEvent(game, row, m[1] + (m[2] ? (/your/i.test(m[2]) ? ' you control' : ' an opponent controls') : ''), event);
      return undefined;
    case 'dies':
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:dies|die)\b/i))) return subjectEvent(game, row, m[1], event);
      return undefined;
    case 'leaves-battlefield':
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:leaves|leave) the battlefield/i))) return subjectEvent(game, row, m[1], event);
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:enters or )?(?:is|are) put into (?:a|your|an opponent'?s|its owner'?s) graveyard from the battlefield/i)))
        return event.destination === 'graveyard' ? subjectEvent(game, row, m[1].replace(/^.+? dies or /i, ''), event) : false;
      if ((m = t.match(/^(?:When|Whenever) (.+?) dies or is put into exile/i)))
        return event.destination === 'exile' ? subjectEvent(game, row, m[1], event) : undefined;
      return undefined;
    case 'attacks':
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:enters or )?attacks\b(?! you)/i)) && !PLAYER_WORDS.test(m[1])) return subjectEvent(game, row, m[1], event);
      return undefined;
    case 'attackers-declared': {
      if ((m = t.match(/^Whenever enchanted player is attacked/i))) return (event.defenders || []).includes(row.card.attachedTo);
      if ((m = t.match(/^Whenever (an opponent|a player|another player) attacks (you )?with (one or more|two or more|three or more)? ?creatures?/i))) {
        if (!whoMatches(m[1], event.controllerId, row)) return false;
        const at = (event.attacks || []).filter(a => !m[2] || a.defenderId === row.player.playerId).length || (m[2] ? 0 : (event.attackers || []).length);
        return at >= ({ 'two or more': 2, 'three or more': 3 }[String(m[3] || '').toLowerCase()] || 1);
      }
      return undefined;
    }
    case 'combat-damage-player':
      if ((m = t.match(/^(?:When|Whenever) (.+?) deals? (?:combat )?damage to (?:a player|an opponent|one or more players|a player or (?:a )?(?:planeswalker|battle))/i))) {
        if (/to an opponent/i.test(t) && event.playerId === eventCard(game, event).controllerId) return false;
        return subjectEvent(game, row, m[1], event);
      }
      return undefined;
    case 'damage-player':
      if ((m = t.match(/^(?:When|Whenever) (.+?) deals damage to (?:a player|an opponent)/i))) {
        if (/to an opponent/i.test(t) && event.playerId === eventCard(game, event).controllerId) return false;
        return subjectEvent(game, row, m[1], event);
      }
      return undefined;
    case 'damage-permanent': case 'combat-damage-creature':
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:is|are) dealt damage/i))) return subjectEvent(game, row, m[1], event, event.targetId);
      return undefined;
    case 'spell-cast': {
      m = t.match(/^When(?:ever)? (you|an opponent|a player|each opponent|another player|one or more opponents) (?:casts? or cop(?:y|ies)|casts?) (?:(?:their|your|his or her) (first|second|third) )?(?:(.+?) )?spells?( with mana value \d+ or (?:greater|less))?( each turn)?( (?:during|from) .+)?$/i);
      if (!m) return undefined;
      if (m[4] && / with mana value/.test(m[4])) { m[3] = `${m[3] || ''}${m[4]}`.trim(); m.splice(4, 1); }
      if (!whoMatches(m[1], event.controllerId, row)) return false;
      const spell = { typeLine: event.typeLine || eventSpellDef(game, event)?.typeLine || '', colors: event.colors || eventSpellDef(game, event)?.colors || [], manaValue: Number(event.manaValue ?? eventSpellDef(game, event)?.manaValue ?? 0), kicked: !!event.kicked };
      const filter = String(m[3] || '').replace(/\s+spell$/i, '');
      if (!spellFits(filter, spell)) return false;
      const tail = String(m[5] || '').toLowerCase();
      if (/during your turn/.test(tail) && game.activePlayerId !== row.player.playerId) return false;
      if (/during (?:an|each) opponent'?s turn/.test(tail) && game.activePlayerId === row.player.playerId) return false;
      if (/from (?:your )?graveyard/.test(tail) && event.fromZone !== 'graveyard') return false;
      if (/from exile/.test(tail) && event.fromZone !== 'exile') return false;
      if (/from (?:your )?hand/.test(tail) && event.fromZone !== 'hand') return false;
      if (m[2]) {
        const caster = (game.players || []).find(p => p.playerId === event.controllerId);
        const list = caster?.counters?.castThisTurn || [];
        if (list.filter(x => spellFits(filter, x)).length !== ORDINAL[m[2].toLowerCase()]) return false;
      }
      return true;
    }
    case 'library-searched':
      if ((m = t.match(/^Whenever (you|an opponent|a player|another player) searches? (?:their|your|a|his or her) library/i))) return whoMatches(m[1], event.playerId, row);
      return undefined;
    case 'draw': {
      m = t.match(/^Whenever (you|an opponent|a player|each opponent|another player) draws? (?:a card|one or more cards|(?:their|your) (first|second|third) card each turn)/i);
      if (!m) return undefined;
      if (!whoMatches(m[1], event.playerId, row)) return false;
      if (/except the first one (?:they|you) draw in each of (?:their|your) draw steps/i.test(t) && event.isFirstNormalDrawStepDraw) return false;
      if (m[2] && Number(event.drawNumberThisTurn || 0) !== ORDINAL[m[2].toLowerCase()]) return false;
      return true;
    }
    case 'counter-added': {
      if (/(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) [^,]*counter/i.test(t)) return undefined;
      m = t.match(/^Whenever (?:you put )?(?:one or more|a|an) (\S+?) counters? (?:is |are )?(?:put )?on (.+)$/i);
      if (!m) return undefined;
      if (!/^any$/i.test(m[1]) && String(event.counter || '').toLowerCase() !== m[1].toLowerCase()) return false;
      if (/^Whenever you put/i.test(t) && event.sourceControllerId && event.sourceControllerId !== row.player.playerId) return false;
      return subjectEvent(game, row, m[2], event, event.targetId);
    }
    case 'upkeep': case 'draw-step': case 'precombat-main-start': case 'begin-combat': case 'end-step': case 'end-combat': {
      m = t.match(/^At (?:the beginning of )?(?:(your|each|each player's|each opponent's|an opponent's|the|each other player's|that player's|enchanted player's|enchanted creature's controller's|equipped creature's controller's|chosen player's) )?(next )?(upkeep|draw step|precombat main phase|first main phase|combat on your turn|combat|end step|end of combat)\b/i);
      if (!m) return undefined;
      if (m[2]) return undefined;   // "your next upkeep": a delayed trigger, made by the spell itself
      if (STEP_EVENTS[m[3].toLowerCase()] !== event.type) return false;
      const whose = String(m[1] || '').toLowerCase();
      if (whose === "enchanted player's") return event.playerId === row.card.attachedTo;
      if (whose === "chosen player's") return event.playerId === row.card.chosenPlayerId;
      if (/creature's controller's/.test(whose)) { const host = (game.players || []).flatMap(p => p.deck?.battlefield || []).find(c => c.instanceId === row.card.attachedTo); return !!host && event.playerId === host.controllerId; }
      if (whose === 'your' || /on your turn/i.test(m[3])) return event.playerId === row.player.playerId;
      if (/opponent|other player/.test(whose)) return event.playerId !== row.player.playerId;
      return true;
    }
  }
  return undefined;
}
function triggerMatches(game, row, ability, event) {
  const t = String(ability.trigger || ''), d = row.definition;
  if (!event || !selfZoneConditionMatches(row, ability))
    return false;
  const general = generalMatch(game, row, t, event);
  if (general !== undefined)
    return general;
  const self = refersToSelf(t, d), your = isYourEvent(row, event), typeLine = event.typeLine || eventSpellDef(game, event)?.typeLine || '';
  if (event.type === 'enters-battlefield') {
    if (!/^(?:When|Whenever)\b/i.test(t) || !/(?:enters|enter)(?: the battlefield)?\b/i.test(t))
      return false;
    if (self)
      return row.card.instanceId === event.sourceId;
    if (/another creature (?:you control )?enters(?: the battlefield)?(?: under your control)?/i.test(t))
      return your && otherThanSource(row, event) && typeMatches(typeLine, 'Creature');
    if (/another (?:artifact|enchantment|land|permanent) enters(?: the battlefield)? under your control/i.test(t)) {
      const word = (t.match(/another (artifact|enchantment|land|permanent)/i) || [])[1];
      return your && otherThanSource(row, event) && typeMatches(typeLine, word);
    }
    if (/a creature enters(?: the battlefield)? under your control/i.test(t) || /one or more creatures enter(?: the battlefield)? under your control/i.test(t))
      return your && typeMatches(typeLine, 'Creature');
    if (/a land enters(?: the battlefield)? under your control/i.test(t) || /landfall/i.test(t))
      return your && typeMatches(typeLine, 'Land');
    if (/an artifact enters(?: the battlefield)? under your control/i.test(t))
      return your && typeMatches(typeLine, 'Artifact');
    if (/an enchantment enters(?: the battlefield)? under your control/i.test(t))
      return your && typeMatches(typeLine, 'Enchantment');
    if (/a permanent enters(?: the battlefield)? under your control/i.test(t))
      return your;
    if (/a creature enters(?: the battlefield)?/i.test(t))
      return typeMatches(typeLine, 'Creature');
    if (/a land enters(?: the battlefield)?/i.test(t))
      return typeMatches(typeLine, 'Land');
    if (/a permanent enters(?: the battlefield)?/i.test(t))
      return true;
  }
  if (event.type === 'leaves-battlefield') {
    if (!/^(?:When|Whenever).*(?:leaves|leave) the battlefield/i.test(t))
      return false;
    if (self)
      return row.card.instanceId === event.sourceId;
    if (/another .* you control/i.test(t))
      return your && otherThanSource(row, event);
    if (/you control/i.test(t))
      return your;
    return true;
  }
  if (event.type === 'dies') {
    if (!/^(?:When|Whenever).*\bdies\b/i.test(t))
      return false;
    if (self)
      return row.card.instanceId === event.sourceId;
    if (/another creature you control dies/i.test(t))
      return your && otherThanSource(row, event) && typeMatches(typeLine, 'Creature');
    if (/a creature you control dies/i.test(t) || /one or more creatures you control die/i.test(t))
      return your && typeMatches(typeLine, 'Creature');
    if (/a creature dies/i.test(t))
      return typeMatches(typeLine, 'Creature');
  }
  if (event.type === 'spell-cast') {
    if (!/^(?:When|Whenever).*\bcast\b/i.test(t))
      return false;
    const spell = eventSpellDef(game, event), st = spell?.typeLine || '';
    if (/you cast/i.test(t) && !your)
      return false;
    if (/an opponent casts/i.test(t) && event.controllerId === row.player.playerId)
      return false;
    if (/creature spell/i.test(t) && !typeMatches(st, 'Creature'))
      return false;
    if (/artifact spell/i.test(t) && !typeMatches(st, 'Artifact'))
      return false;
    const mv = Number(spell?.manaValue ?? spell?.cmc ?? event.manaValue ?? 0);
    const mvMin = (t.match(/mana value (\d+) or greater/i) || [])[1];
    const mvMax = (t.match(/mana value (\d+) or less/i) || [])[1];
    if (mvMin && mv < Number(mvMin))
      return false;
    if (mvMax && mv > Number(mvMax))
      return false;
    if (/instant or sorcery spell/i.test(t) && !/(Instant|Sorcery)/i.test(st))
      return false;
    if (/noncreature spell/i.test(t) && typeMatches(st, 'Creature'))
      return false;
    return /(?:spell|cast)/i.test(t);
  }
  if (event.type === 'attackers-declared') {
    if (/^(?:When|Whenever) one or more creatures you control attack/i.test(t))
      return event.controllerId === row.player.playerId && (event.attackers || []).length > 0;
    if (/^Whenever you attack with your commander/i.test(t))
      return attackedWithCommander(game, row, event);
    if (/^Whenever you attack/i.test(t))
      return event.controllerId === row.player.playerId && (event.attackers || []).length > 0;
  }
  if (event.type === 'attacks') {
    if (!/^(?:When|Whenever).*\battacks\b/i.test(t))
      return false;
    if (self)
      return row.card.instanceId === event.sourceId;
    if (/another creature you control attacks/i.test(t))
      return your && otherThanSource(row, event);
    if (/a creature you control attacks/i.test(t))
      return your;
    return false;
  }
  if (event.type === 'blocks') {
    if (!/^(?:When|Whenever).*(?:blocks|becomes blocked)/i.test(t))
      return false;
    if (/becomes blocked/i.test(t) && self)
      return row.card.instanceId === event.attackerId;
    if (/blocks/i.test(t) && self)
      return row.card.instanceId === event.blockerId;
    if (/a creature you control blocks/i.test(t))
      return event.controllerId === row.player.playerId;
    return false;
  }
  if (event.type === 'combat-damage-player') {
    if (/deals combat damage to (?:a player|an opponent)/i.test(t)) {
      if (self)
        return row.card.instanceId === event.sourceId;
      if (/a creature you control/i.test(t))
        return event.controllerId === row.player.playerId;
    }
    if (/one or more creatures you control deal combat damage to a player/i.test(t))
      return event.controllerId === row.player.playerId;
  }
  if (event.type === 'combat-damage-dealt') {
    // "deals combat damage" with nothing after it (or "to a creature"): attacking or blocking.
    // "to a player / an opponent" is the combat-damage-player event above.
    const any = /deals combat damage(?! to)/i.test(t), toCreature = /deals combat damage to a creature/i.test(t);
    if (!any && !toCreature)
      return false;
    if (toCreature && !event.to?.includes('creature'))
      return false;
    if (self)
      return row.card.instanceId === event.sourceId;
    if (/(?:a|another) creature you control/i.test(t))
      return event.controllerId === row.player.playerId && (!/another/i.test(t) || otherThanSource(row, event));
    return false;
  }
  if (event.type === 'damage-player') {
    if (/deals damage to (?:a player|an opponent)/i.test(t) && self)
      return row.card.instanceId === event.sourceId;
  }
  if (event.type === 'draw') {
    if (!/^(?:When|Whenever).*\bdraw\b/i.test(t))
      return false;
    if (/you draw/i.test(t) && event.playerId !== row.player.playerId)
      return false;
    if (/an opponent draws/i.test(t) && event.playerId === row.player.playerId)
      return false;
    if (/except the first one they draw in each of their draw steps/i.test(t) && event.isFirstNormalDrawStepDraw)
      return false;
    if (/your second card each turn/i.test(t))
      return event.playerId === row.player.playerId && Number(event.drawNumberThisTurn || 0) === 2;
    if (/your first card each turn/i.test(t))
      return event.playerId === row.player.playerId && Number(event.drawNumberThisTurn || 0) === 1;
    return true;
  }
  if (event.type === 'discard') {
    if (!/^(?:When|Whenever).*\bdiscard/i.test(t))
      return false;
    const dd = eventSpellDef(game, event), dt = event.typeLine || dd?.typeLine || '';
    if (/land cards?/i.test(t) && !typeMatches(dt, 'Land'))
      return false;
    if (/nonland cards?/i.test(t) && typeMatches(dt, 'Land'))
      return false;
    if (/you discard/i.test(t))
      return event.playerId === row.player.playerId;
    if (/an opponent discards/i.test(t))
      return event.playerId !== row.player.playerId;
    return true;
  }
  if (event.type === 'life-gained') {
    if (!/^(?:When|Whenever).*(?:gain|gains) life/i.test(t))
      return false;
    if (/you gain/i.test(t))
      return event.playerId === row.player.playerId;
    if (/an opponent gains/i.test(t))
      return event.playerId !== row.player.playerId;
    return true;
  }
  if (event.type === 'life-lost') {
    if (!/^(?:When|Whenever).*(?:lose|loses) life/i.test(t))
      return false;
    if (/you lose/i.test(t))
      return event.playerId === row.player.playerId;
    if (/an opponent loses/i.test(t))
      return event.playerId !== row.player.playerId;
    return true;
  }
  if (event.type === 'counter-added') {
    if (!/^(?:When|Whenever).*counter/i.test(t))
      return false;
    const ord = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
    const om = t.match(/(?:the|a) (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) [^.,]*counter/i);
    if (om && Number(event.newValue || 0) !== ord[om[1].toLowerCase()])
      return false;
    if (self)
      return row.card.instanceId === event.targetId;
    if (/creature you control/i.test(t)) {
      const hit = (game.players || []).flatMap(p => p.deck?.battlefield || []).find(c => c.instanceId === event.targetId);
      return hit?.controllerId === row.player.playerId;
    }
    return false;
  }
  if (event.type === 'sacrificed') {
    if (!/^(?:When|Whenever).*sacrific/i.test(t))
      return false;
    if (/you sacrifice/i.test(t) && event.controllerId !== row.player.playerId)
      return false;
    if (/an opponent sacrifices/i.test(t) && event.controllerId === row.player.playerId)
      return false;
    if (/token/i.test(t) && !event.token)
      return false;
    return true;
  }
  if (event.type === 'token-created') {
    if (!/^(?:When|Whenever).*(?:create|creates).*token/i.test(t))
      return false;
    if (/you create/i.test(t))
      return event.controllerId === row.player.playerId;
    return true;
  }
  if (event.type === 'tapped') {
    if (!/^(?:When|Whenever).*(?:becomes tapped|is tapped)/i.test(t))
      return false;
    if (/first time/i.test(t) && Number(event.tapNumberThisTurn || 0) !== 1)
      return false;
    if (self)
      return row.card.instanceId === event.sourceId;
    if (/creature you control/i.test(t))
      return event.controllerId === row.player.playerId && typeMatches(event.typeLine || eventSpellDef(game, event)?.typeLine || '', 'Creature');
    if (/permanent you control/i.test(t))
      return event.controllerId === row.player.playerId;
    return false;
  }
  if (event.type === 'precombat-main-start') {
    if (/^At the beginning of your precombat main phase/i.test(t))
      return event.playerId === row.player.playerId;
    if (/^At the beginning of each player'?s precombat main phase/i.test(t))
      return true;
  }
  if (event.type === 'upkeep') {
    if (/^At the beginning of your upkeep/i.test(t))
      return event.playerId === row.player.playerId;
    if (/^At the beginning of each player'?s upkeep/i.test(t))
      return true;
    if (/^At the beginning of (?:an|each) opponent'?s upkeep/i.test(t))
      return event.playerId !== row.player.playerId;
  }
  if (event.type === 'end-combat') {
    if (/^At (?:the beginning of )?end of combat/i.test(t) || /^At the beginning of the end of combat step/i.test(t))
      return true;
  }
  if (event.type === 'end-step') {
    if (/^At the beginning of your end step/i.test(t))
      return event.playerId === row.player.playerId;
    if (/^At the beginning of each end step/i.test(t))
      return true;
    if (/^At the beginning of (?:an|each) opponent'?s end step/i.test(t))
      return event.playerId !== row.player.playerId;
  }
  if (event.type === 'begin-combat') {
    if (/^At the beginning of combat on your turn/i.test(t) || /^At the beginning of your combat/i.test(t))
      return event.playerId === row.player.playerId;
    if (/^At the beginning of combat/i.test(t))
      return true;
  }
  return false;
}
export function collectTriggers(game, event) {
  const out = [];
  const seen = new Set();
  for (const row of sourceRows(game, event))
    for (const ability of [...parseTriggeredAbilities(row.definition), ...keywordTriggers(game, row, event)]) {
      if (!ability.builtin && !triggerMatches(game, row, ability, event))
        continue;
      const turnKey = `${ability.id}:${Number(game.turnNumber || 0)}`;
      row.card.triggerFireLedger = row.card.triggerFireLedger || {};
      if (ability.oncePerTurn && row.card.triggerFireLedger[turnKey])
        continue;
      const key = `${row.card.instanceId}:${ability.id}:${event.type}:${event.batchId || event.sourceId || event.playerId || ''}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      if (ability.oncePerTurn)
        row.card.triggerFireLedger[turnKey] = true;
      const compiled = ability.compiled || (ability.modes?.length ? { supported: true, effects: [], requirements: [], unsupported: [] } : compileEffectText(ability.effect, { sourceName: row.definition?.name || 'Triggered ability' }));
      out.push({ id: `trigger:${Date.now()}:${Math.random()}`, controllerId: row.player.playerId, sourceId: row.card.instanceId, sourceDefinitionId: row.card.definitionId, sourceName: row.definition?.name || 'Card', abilityId: ability.id, abilityText: ability.text, effectText: ability.effect, modal: ability.modes?.length ? { modes: ability.modes, uniquePerTurn: !!ability.uniquePerTurn } : null, compiled, event: structuredClone(event), createdAt: new Date().toISOString(), ...(ability.special ? { special: ability.special, madnessCost: ability.madnessCost || null } : {}) });
    }
  out.push(...designationTriggers(game, event));
  return out;
}
export function orderTriggersAPNAP(game, rows = []) {
  const seats = game?.players || [], alive = seats.filter(p => !p.eliminated).map(p => p.playerId);
  if (!alive.length)
    return [];
  const activeIndex = Math.max(0, alive.indexOf(game.activePlayerId));
  const controllerOrder = [...alive.slice(activeIndex), ...alive.slice(0, activeIndex)];
  const rank = new Map(controllerOrder.map((id, i) => [id, i]));
  return rows.map((row, index) => ({ row, index })).filter(x => rank.has(x.row.controllerId)).sort((a, b) => (rank.get(a.row.controllerId) - rank.get(b.row.controllerId)) || (a.index - b.index)).map(x => x.row);
}
/** Delayed triggers left by spells (Arcane Denial, Mana Drain) whose moment has come. */
function dueDelayedTriggers(game, event) {
  const due = [], keep = [];
  for (const d of game.delayedTriggers || []) {
    const w = d.when || {};
    const ready = event.type === w.event && Number(game.turnNumber || 0) > Number(w.afterTurn || 0) && (w.whose !== 'owner' || event.playerId === d.ownerId);
    (ready ? due : keep).push(d);
  }
  if (!due.length) return [];
  game.delayedTriggers = keep;
  return due.map(d => ({ id: `trigger:${Date.now()}:${Math.random()}`, controllerId: d.controllerId, sourceId: d.sourceId, sourceDefinitionId: d.sourceDefinitionId, sourceName: d.sourceName, abilityId: d.id, abilityText: `${d.sourceName}: delayed effect`, effectText: '', modal: null, compiled: { supported: true, effects: d.effects, requirements: d.requirements || [], unsupported: [] }, event: structuredClone(event), createdAt: new Date().toISOString() }));
}
export function queueTriggers(game, event) {
  recordStat(game, event);
  // "venture into the dungeon" in the middle of an ability: its own step with the room choice (ops.js runSpecial).
  if (event?.type === 'special-request') {
    const src = (game.players || []).flatMap(p => ['battlefield', 'graveyard', 'exile', 'hand'].flatMap(z => p.deck?.[z] || [])).find(c => c.instanceId === event.sourceId);
    game.pendingTriggers = game.pendingTriggers || [];
    game.pendingTriggers.push({ id: `trigger:${Date.now()}:${Math.random()}`, controllerId: event.playerId, sourceId: event.sourceId || null, sourceDefinitionId: src?.definitionId || null, sourceName: defFor(game, src)?.name || 'Ability',
      abilityId: `special-${event.special}`, abilityText: event.special === 'venture' ? 'Venture into the dungeon.' : 'You take the initiative.', effectText: '', special: event.special, modal: null, compiled: { supported: true, effects: [], requirements: [], unsupported: [] }, event: null, createdAt: new Date().toISOString() });
    return [];
  }
  // "Exile … until this enchantment leaves the battlefield": when it leaves, the exiled cards return at once.
  if (event?.type === 'leaves-battlefield' && event.sourceId) {
    const gone = (game.players || []).flatMap(p => ['graveyard', 'exile', 'hand', 'commandZone', 'remainingLibrary'].flatMap(z => p.deck?.[z] || [])).find(c => c.instanceId === event.sourceId);
    const back = gone?.untilLeavesExile || [];
    if (back.length) {
      gone.untilLeavesExile = [];
      gone.linkedExile = (gone.linkedExile || []).filter(id => !back.includes(id));
      for (const id of back) {
        const owner = (game.players || []).find(p => (p.deck?.exile || []).some(c => c.instanceId === id));
        if (owner) moveCard(game, id, 'battlefield', { controllerId: owner.playerId, onEvent: e => queueTriggers(game, e) });
      }
    }
  }
  // Madness: a discarded card with madness is exiled instead, and its madness trigger goes on the stack.
  if (event?.type === 'discard' && event.sourceId) {
    for (const p of game.players || []) {
      const i = (p.deck?.graveyard || []).findIndex(c => c.instanceId === event.sourceId);
      if (i < 0) continue;
      const c = p.deck.graveyard[i], text = String(defFor(game, c)?.oracleText || '').replace(/\([^()]*\)/g, '');
      const mad = text.match(/(?:^|\n)\s*Madness ((?:\{[^}]+\})+)/i);
      if (mad) { p.deck.graveyard.splice(i, 1); c.zone = 'exile'; c.madness = mad[1]; p.deck.exile.push(c); }
    }
  }
  const collected = [...dueDelayedTriggers(game, event), ...collectTriggers(game, event)];
  if (!collected.length)
    return collected;
  const batchId = `trigger-batch:${Date.now()}:${Math.random()}`, ordered = orderTriggersAPNAP(game, collected);
  const perController = new Map();
  ordered.forEach((row, index) => { const count = Number(perController.get(row.controllerId) || 0); row.simultaneousBatchId = batchId; row.simultaneousTriggerId = `${batchId}:${index}`; row.controllerOrderIndex = count; row.stackOrderChosen = false; perController.set(row.controllerId, count + 1); });
  game.pendingTriggers = game.pendingTriggers || [];
  game.pendingTriggers.push(...ordered);
  return ordered;
}
export function resolveTrigger(game, trigger, bindings = {}) {
  if (!trigger?.compiled?.supported)
    throw new Error(`Unsupported trigger effect on ${trigger?.sourceName || 'card'}: ${(trigger?.compiled?.unsupported || []).join(' | ')}`);
  const notes = applyEffects(game, trigger.controllerId, trigger.compiled.effects, { ...bindings, sourceId: trigger.sourceId, onEvent: e => queueTriggers(game, e) });
  game.log?.unshift?.({ text: `${trigger.sourceName} trigger resolves. ${notes.join(' ')}`, turn: game.turnNumber, at: new Date().toISOString() });
  return notes;
}
/**
 * Does the game ever fire this trigger by itself? Tries every event the game sends, done by this
 * card, by another of its controller's cards and by an opponent, with each common card type. A
 * trigger nothing matches is one players must remember and resolve by hand.
 */
const PROBE_EVENTS = ['library-searched', 'draw-step', 'damage-permanent', 'combat-damage-creature', 'attackers-declared', 'attacks', 'begin-combat', 'blocks', 'combat-damage-dealt', 'combat-damage-player', 'counter-added', 'damage-player', 'dies', 'discard', 'draw', 'end-combat', 'end-step', 'enters-battlefield', 'leaves-battlefield', 'life-gained', 'life-lost', 'precombat-main-start', 'sacrificed', 'spell-cast', 'tapped', 'token-created', 'upkeep'];
const PROBE_TYPES = ['Creature — Human', 'Land', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Legendary Planeswalker', 'Artifact Creature — Golem', 'Creature — Elemental Dragon', 'Artifact — Equipment'];
export function triggerCanFire(definition, ability) {
  return probeTrigger(definition, ability, PROBE_TYPES, PROBE_EVENTS, [{}]) || probeTrigger(definition, ability, wideProbeTypes(ability), [...PROBE_EVENTS, ...PROBE_EXTRA_EVENTS], WIDE_VARIANTS);
}
// The wider probe: card types named in the trigger (Zombie, Forest, legendary, a big mana value …) and event details
// the first probe leaves out (the other player dealt damage, the opponent's turn, a kicked or multicolored spell …).
const WIDE_VARIANTS = [
  { victim: true }, { oppTurn: true }, { event: { manaValue: 7, colors: ['W', 'U'], kicked: true, fromZone: 'hand', byKind: 'spell', firstThisTurn: true, to: 'graveyard', combat: false } },
  { event: { manaValue: 9, colors: ['B', 'R', 'G'], crewIds: ['self'], land: true, creature: true, typeLine: 'Land — Swamp Forest Island Mountain Plains' } },
  { token: true, event: { token: true } }, { attachedPlayer: 'opp', event: { attacks: [{ id: 'x', defenderId: 'opp' }] } }, { victim: true, event: { attacks: [{ id: 'a', defenderId: 'me' }, { id: 'b', defenderId: 'me' }] } },
  { victim: true, event: { combat: false, byKind: 'ability', fromZone: 'graveyard' } }, { oppTurn: true, event: { manaValue: 7, colors: ['W', 'U'], fromZone: 'exile', byPlayerId: 'opp' } }
];
function wideProbeTypes(ability) {
  const words = [...new Set((String(ability?.trigger || '').match(/\b[A-Z][a-z]+\b/g) || []).filter(w => !/^(?:When|Whenever|At|If|You|Your|This|That|Another|The|Each|One|Enchanted|Equipped)$/.test(w)))].join(' ');
  return [...PROBE_TYPES, `Legendary Creature — ${words || 'Human'}`, `Land — ${words || 'Forest'}`, `Legendary Enchantment — ${words || 'Shrine'}`, `Legendary Artifact — ${words || 'Equipment'}`, `Instant — ${words || 'Arcane'}`, `Kindred Sorcery — ${words || 'Arcane'}`];
}
function probeTrigger(definition, ability, types, events, variants) {
  const me = { playerId: 'me', displayName: 'Me', deck: { battlefield: [] }, counters: {} }, opp = { playerId: 'opp', displayName: 'Opp', deck: { battlefield: [] }, counters: {} };
  // Probe cards: every common type; the Elemental Dragon is big, black and flying, for "with power 4 or greater" and similar.
  const cardDefinitions = Object.fromEntries(types.map((t, i) => [`probe-${i}`, { definitionId: `probe-${i}`, name: `Probe ${i}`, typeLine: t, manaValue: 3, power: /Dragon|Legendary Creature/.test(t) ? '5' : '1', toughness: '1', colors: /Dragon/.test(t) ? ['B'] : [], keywords: /Dragon/.test(t) ? ['Flying'] : [] }]));
  cardDefinitions[definition.definitionId || 'self-def'] = definition;
  const game = { players: [me, opp], activePlayerId: 'me', turnNumber: 3, cardDefinitions, stack: [] };
  for (const variant of variants) for (const zone of ['battlefield', 'graveyard', 'hand', 'exile', 'command']) for (const attached of [false, true]) for (const castCount of [1, 2]) {
    game.activePlayerId = variant.oppTurn ? 'opp' : 'me';
    // attached: this card is an Aura or Equipment on the probe card ("equipped creature", "enchanted land").
    const row = { card: { instanceId: 'self', definitionId: definition.definitionId || 'self-def', counters: {}, triggerFireLedger: {}, chosenCreatureType: 'Dragon' }, definition, player: me, zone };
    for (const type of events) for (const [sourceId, who] of [['self', me], ['mine', me], ['theirs', opp]]) for (let i = 0; i < types.length; i++) {
      row.card.attachedTo = attached ? sourceId : null;
      for (const p of [me, opp]) p.counters = { castThisTurn: Array.from({ length: castCount }, () => ({ typeLine: types[i], colors: [], manaValue: 3 })) };
      me.deck.battlefield = sourceId === 'mine' ? [{ instanceId: 'mine', definitionId: `probe-${i}`, controllerId: 'me', counters: { '+1/+1': 1 }, token: !!variant.token }] : [];
      if (variant.attachedPlayer) row.card.attachedTo = variant.attachedPlayer;
      opp.deck.battlefield = sourceId === 'theirs' ? [{ instanceId: 'theirs', definitionId: `probe-${i}`, controllerId: 'opp', counters: { '+1/+1': 1 } }] : [];
      const victim = variant.victim ? (who === me ? opp : me) : who;
      const event = { type, sourceId, controllerId: who.playerId, playerId: victim.playerId, ownerId: who.playerId, definitionId: sourceId === 'self' ? (definition.definitionId || 'self-def') : `probe-${i}`,
        typeLine: sourceId === 'self' ? definition.typeLine : types[i], attackerId: sourceId, blockerId: sourceId, attackers: [sourceId, 'x1', 'x2', 'x3'], defenders: [victim === who ? (who === me ? 'opp' : 'me') : victim.playerId], defenderId: who === me ? 'opp' : 'me',
        amount: 2, to: ['creature', 'player'], counter: '+1/+1', drawNumberThisTurn: 2, token: true, manaValue: 3, batchId: 'probe', played: true, destination: 'graveyard', newValue: 12, targetId: sourceId, byPlayerId: 'opp', byKind: 'ability', level: Number((String(ability?.trigger || '').match(/level (\\d+)/i) || [])[1] || 2), ...(variant.event || {}) };
      if (event.to === 'graveyard' && type !== 'zone-change') event.to = ['creature', 'player'];
      try { if (triggerMatches(game, row, ability, event)) return true; } catch { /* a probe the matcher cannot read: keep trying */ }
    }
  }
  return false;
}
export function auditTriggers(definition) { return parseTriggeredAbilities(definition).map(a => { if (MANA_EXTRA_TEXT.some(re => re.test(a.text))) return { ...a, fires: true, supported: true, unsupported: [], effectKinds: ['mana-extra'] };   // counted by mana-extras.js as the source is tapped
  const fires = /^When you cast this spell\b/i.test(a.trigger) || triggerCanFire(definition, a);   // cast triggers: castTriggers in keyword-triggers.js
  const never = fires ? [] : [`The game never fires "${a.trigger}" by itself`]; if (a.modes?.length)
  return { ...a, fires, supported: fires, unsupported: never, effectKinds: ['modal-trigger'] }; const compiled = compileEffectText(a.effect, { sourceName: definition?.name || 'Card' }); return { ...a, fires, supported: fires && compiled.supported, unsupported: [...never, ...compiled.unsupported], effectKinds: [...new Set(compiled.effects.map(x => x.kind))] }; }); }

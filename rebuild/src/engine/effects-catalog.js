// Catalog effects (build 43): wordings found by running every Commander-legal card through the effect compiler
// and automating the most common ones that were still resolved by hand. Each instruction keeps every choice a
// player makes in the rules with that player (targets, "you may", which cards to keep) and does the rest itself.
//
// compileCatalogClause(c, ctx) is tried after the older readers in effects.js; applyCatalogEffect runs the effect
// kinds it creates. Both use helpers from effects.js (the two modules import each other; nothing runs at load time).
import {
  numberFromText, locateCardInGame, moveCard, definitionFor, cardMatchesFilter, resolveAmount,
  catalogHelpers as H
} from './effects.js';
import { effectiveToughness } from './combat.js';

const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const esc = s => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rebind the single target requirement an instruction asked for to a fixed binding (the source, the enchanted creature …). */
function rebound(text, bind, ctx) {
  const inner = H.compileSingleClause(text, { sourceName: ctx.sourceName });
  const own = inner.requirements.filter(r => r.kind === 'target');
  if (inner.unsupported.length || !inner.effects.length || own.length !== 1 || inner.requirements.length !== 1) return false;
  const swap = e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v === own[0].bind ? bind : v]));
  ctx.effects.push(...inner.effects.map(swap));
  return true;
}

// "it", "that creature": the card the trigger is about. "it" is the event's card (the creature that entered,
// attacked …); "that creature" prefers the other creature in the event (the one blocked, the one dealt damage).
const PRONOUN_OBJECT = /\b(it|that creature|that permanent|that land|that artifact|that token|that card)\b/i;

/** Pushes onto ctx.effects / ctx.requirements and returns true when the sentence is understood. */
export function compileCatalogClause(c, ctx) {
  const { sourceName, selfAny, effects, requirements } = ctx;
  let m;
  const subjectBind = s => new RegExp(`^${selfAny}$`, 'i').test(s) ? 'sourceId' : /^it$/i.test(s) ? 'eventCard' : /^(?:enchanted|equipped|fortified) /i.test(s) ? '__attached' : 'thatCard';
  const SUBJ = `(${selfAny}|It|That creature|That permanent|Enchanted creature|Equipped creature|Enchanted permanent|Enchanted land)`;
  const PT = '([+-](?:\\d+|X))\\/([+-](?:\\d+|X))';
  const until = s => /your next turn/i.test(s || '') ? 'your-next-turn' : 'cleanup';

  // --- Power/toughness and keywords for the source, the enchanted/equipped creature, or the trigger's creature.
  if ((m = c.match(new RegExp(`^${SUBJ} gets? ${PT}(?: and gains? ([a-z ,]+?))? until (end of turn|your next turn)\\.?"?$`, 'i')))) {
    const bind = subjectBind(m[1]);
    effects.push({ kind: 'pump', bind, power: m[2], toughness: m[3], expires: until(m[5]) });
    for (const keyword of H.KEYWORD_LIST(m[4])) effects.push({ kind: 'grant-keyword', bind, keyword, enabled: true, expires: until(m[5]) });
    return true;
  }
  if ((m = c.match(new RegExp(`^(?:Until end of turn, )?${SUBJ} gains? ([a-z ,]+?)(?: and gets? ${PT})?(?: until (end of turn|your next turn))?\\.?"?$`, 'i'))) && (m[5] || /^Until end of turn/i.test(c))) {
    const bind = subjectBind(m[1]);
    for (const keyword of H.KEYWORD_LIST(m[2])) effects.push({ kind: 'grant-keyword', bind, keyword, enabled: true, expires: until(m[5]) });
    if (m[3]) effects.push({ kind: 'pump', bind, power: m[3], toughness: m[4], expires: until(m[5]) });
    return true;
  }
  if ((m = c.match(new RegExp(`^${SUBJ} (?:gets|gains) (?:${PT}|[a-z ,]+?) until end of turn for each (.+?)\\.?$`, 'i'))) && m[2]) {
    const f = H.filterFromNoun(m[4]);
    const of = f ? { kind: 'count', zone: 'battlefield', filter: f } : H.countExprFromPhrase(m[4]);
    if (!of) return false;
    const sign = v => (String(v).startsWith('-') ? '-' : '+') + 'X';
    effects.push({ kind: 'set-x', amount: { kind: 'times', n: Math.abs(Number(String(m[2]).replace(/X/, '1'))) || 1, of } });
    effects.push({ kind: 'pump', bind: subjectBind(m[1]), power: Number(m[2]) === 0 ? 0 : sign(m[2]), toughness: Number(m[3]) === 0 ? 0 : sign(m[3]), expires: 'cleanup' });
    return true;
  }

  // --- Regeneration.
  if ((m = c.match(new RegExp(`^Regenerate (${selfAny}|it|that creature|enchanted creature|equipped creature|enchanted permanent|target [^.]+?|each creature you control|each [^.]+? you control)\\.?$`, 'i')))) {
    if (/^each /i.test(m[1])) {
      const filter = H.filterFromNoun(m[1].replace(/^each /i, '')) || 'creature';
      effects.push({ kind: 'regenerate-each', scope: 'you', filter });
      return true;
    }
    const bind = /^target /i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : subjectBind(m[1]);
    effects.push({ kind: 'regenerate', bind });
    return true;
  }

  // --- Things done to the enchanted / equipped creature ("Tap enchanted creature.", "Destroy equipped creature.").
  if (/\b(?:enchanted|equipped|fortified) (?:creature|permanent|land|artifact|planeswalker)\b/i.test(c) && !/\btarget\b/i.test(c)) {
    const text = c.replace(/\b(?:enchanted|equipped|fortified) (creature|permanent|land|artifact|planeswalker)\b/i, 'target $1');
    if (rebound(text, '__attached', ctx)) return true;
  }
  // --- The trigger's creature ("destroy that creature", "exile it", "tap it", "put a +1/+1 counter on it").
  if (PRONOUN_OBJECT.test(c) && !/\btarget\b|\bat the beginning\b|\bat end of combat\b/i.test(c) && !/^(?:Sacrifice|Return) it\b/i.test(c)
      && /^(?:Destroy|Exile|Tap|Untap|Return|Put (?:a|an|one|two|three|\d+) [^.]+? counters? on|Goad|Remove (?:a|an|one|\d+) [^.]+? counters? from|Double the number of|Regenerate|Gain control of)\b/i.test(c)) {
    const which = (c.match(PRONOUN_OBJECT) || [])[1] || 'it';
    const text = c.replace(PRONOUN_OBJECT, /land/i.test(which) ? 'target land' : /artifact/i.test(which) ? 'target artifact' : /card/i.test(which) ? 'target permanent' : 'target creature');
    if (rebound(text, /^it$/i.test(which) ? 'eventCard' : 'thatCard', ctx)) return true;
  }
  // "destroy that creature at end of combat" (Gorgon Recluse, Ohran Viper): a delayed destroy.
  if ((m = c.match(/^(Destroy|Exile|Return) (it|that creature|those creatures) at end of combat\.?$/i))) {
    effects.push({ kind: 'delay', when: { event: 'end-combat', whose: 'any' }, effects: [{ kind: m[1].toLowerCase() === 'return' ? 'bounce' : m[1].toLowerCase(), bind: /^it$/i.test(m[2]) ? 'eventCard' : 'thatCard', soft: true }], requirements: [] });
    return true;
  }

  // --- The spell or permanent exiles itself / returns itself.
  if (new RegExp(`^Exile ${selfAny}\\.?$`, 'i').test(c) || /^Exile this spell\.?$/i.test(c)) { effects.push({ kind: 'exile-self' }); return true; }
  if (new RegExp(`^Return (?:this card|${selfAny}) from your graveyard to your hand\\.?$`, 'i').test(c)) { effects.push({ kind: 'return-self-hand' }); return true; }
  if (new RegExp(`^Put (?:this card|${selfAny}) from your graveyard on top of your library\\.?$`, 'i').test(c)) { effects.push({ kind: 'self-graveyard-to-library' }); return true; }
  if (new RegExp(`^Shuffle (?:this card|${selfAny}) into its owner'?s library\\.?$`, 'i').test(c) || new RegExp(`^(?:This card's|${selfAny}'s) owner shuffles it into their library\\.?$`, 'i').test(c)) { effects.push({ kind: 'self-shuffle-into-library' }); return true; }
  if (new RegExp(`^Put (?:${selfAny}|it) on top of its owner'?s library\\.?$`, 'i').test(c)) { effects.push({ kind: 'source-to-library-top' }); return true; }

  // --- "becomes a 3/3 Elemental creature with haste until end of turn. It's still a land." (creature lands, animation).
  if (/^(?:It'?s|It is|That's|They're|They are) still (?:a|an)? ?(?:land|artifact|enchantment|planeswalker)s?\.?$/i.test(c)) return true;
  if ((m = c.match(/^Until (end of turn|your next turn), (.+? becomes? .+?)\.?$/i)) && !/ until /i.test(m[2])) return compileCatalogClause(`${cap(m[2])} until ${m[1]}.`, ctx);
  {
    const SUBJ2 = `(${selfAny}|Target (?:[a-z ]+ )?(?:land|artifact|creature|permanent|enchantment|Vehicle|noncreature artifact)(?: you control)?|It|Enchanted land|Enchanted permanent|Each land you control|All lands you control|Up to one target (?:[a-z ]+ )?(?:land|artifact|creature|permanent)(?: you control)?)`;
    const am = c.match(new RegExp(`^${SUBJ2} becomes? (?:a|an) (?:(\\d+|X)\\/(\\d+|X) )?([A-Za-z ,-]*?)\\bcreatures?(?: with ([^."]+?))?(?: (?:that's|that is) still (?:a|an) [a-z]+| in addition to its other types)?( until end of turn| until your next turn)?\\.?$`, 'i'));
    if (am && !/"/.test(c)) {
      const words = am[4].trim().split(/[\s,]+/).filter(w => w && !/^(?:and|a|an)$/i.test(w));
      const colors = words.filter(w => /^(white|blue|black|red|green|colorless)$/i.test(w)).map(w => ({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: null })[w.toLowerCase()]).filter(x => x !== undefined);
      const addTypes = ['Creature', ...words.filter(w => /^(artifact|enchantment|legendary)$/i.test(w)).map(cap)];
      const subtypes = words.filter(w => /^[A-Z]/.test(w) && !/^(White|Blue|Black|Red|Green|Colorless|Artifact|Enchantment|Legendary)$/.test(w));
      const e = { kind: 'animate', power: am[2] ?? null, toughness: am[3] ?? null, addTypes, subtypes, keywords: H.KEYWORD_LIST(am[5] || '').map(cap), colors: words.some(w => /^colorless$/i.test(w)) ? [] : colors.filter(Boolean).length ? colors.filter(Boolean) : null, expires: am[6] ? until(am[6]) : null };
      if (/^(?:each|all) lands? you control$/i.test(am[1])) { effects.push({ ...e, kind: 'animate-each', scope: 'you', filter: 'land' }); return true; }
      const bind = /^(?:target|up to one target)/i.test(am[1]) ? H.targetRequirement(requirements, am[1].toLowerCase().replace(/^up to one /, ''), am[1], /^up to/i.test(am[1]) ? { optional: true } : {}) : subjectBind(am[1]);
      effects.push({ ...e, bind, optionalTarget: /^up to/i.test(am[1]) || undefined });
      return true;
    }
  }

  // --- Keyword actions.
  if ((m = c.match(new RegExp(`^Monstrosity ${N}\\.?$`, 'i')))) { effects.push({ kind: 'monstrosity', amount: num(m[1]) }); return true; }
  if ((m = c.match(new RegExp(`^Adapt ${N}\\.?$`, 'i')))) { effects.push({ kind: 'adapt', amount: num(m[1]) }); return true; }
  if ((m = c.match(new RegExp(`^Bolster ${N}\\.?$`, 'i')))) {
    const bind = `bolster${requirements.length}`;
    requirements.push({ kind: 'bolster', bind, label: 'creature to bolster' });
    effects.push({ kind: 'counter', bind, counter: '+1/+1', amount: num(m[1]), optional: true });
    return true;
  }
  if ((m = c.match(new RegExp(`^(${selfAny}|It|Target creature you control|That creature) explores\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'creature you control') : subjectBind(m[1]);
    const choice = `explore${requirements.length}`;
    requirements.push({ kind: 'explore', bind: choice, label: 'explore' });
    effects.push({ kind: 'explore', bind, choiceBind: choice });
    return true;
  }
  if ((m = c.match(new RegExp(`^(${selfAny}|It|Target creature you control|That creature) connives(?: ${N})?\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'creature you control') : subjectBind(m[1]);
    const n = m[2] ? num(m[2]) : 1, cardsBind = `discardCards${requirements.length}`;
    requirements.push({ kind: 'discard-cards', bind: cardsBind, scope: 'you', amount: n, plusDraw: typeof n === 'number' ? n : 0 });
    effects.push({ kind: 'draw', scope: 'you', amount: n }, { kind: 'discard', scope: 'you', amount: n, cardsBind }, { kind: 'connive-counters', bind, cardsBind });
    return true;
  }
  if ((m = c.match(/^(?:you )?get ((?:\{E\})+)(?: \([^)]*\))?\s*\.?$/i)) || (m = c.match(new RegExp(`^(?:you )?get ${N} \\{E\\}\\.?$`, 'i')))) {
    const amount = /\{E\}/i.test(m[1]) ? (m[1].match(/\{E\}/gi) || []).length : num(m[1]);
    effects.push({ kind: 'player-counter', counter: 'energy', amount });
    return true;
  }
  if ((m = c.match(new RegExp(`^(?:you )?get (?:an?|${N}) (experience|rad|poison|ticket) counters?\\.?$`, 'i')))) {
    effects.push({ kind: 'player-counter', counter: m[2].toLowerCase(), amount: m[1] ? num(m[1]) : 1 });
    return true;
  }
  if ((m = c.match(new RegExp(`^(Each opponent|Target opponent|Target player|Each player) gets? (?:an?|${N}) (poison|rad) counters?\\.?$`, 'i')))) {
    const scope = H.scopeFromSubject(m[1]);
    const e = { kind: 'player-counter', counter: m[3].toLowerCase(), amount: m[2] ? num(m[2]) : 1, scope: scope.startsWith('target-') ? 'you' : scope };
    if (scope.startsWith('target-')) e.playerBind = H.playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return true;
  }
  if ((m = c.match(new RegExp(`^Amass (?:([A-Z][a-z]+) )?${N}\\.?$`)))) { effects.push({ kind: 'amass', type: m[1] || 'Army', amount: num(m[2]) }); return true; }
  if ((m = c.match(new RegExp(`^Incubate ${N}\\.?$`, 'i')))) { effects.push({ kind: 'incubate', amount: num(m[1]) }); return true; }
  if (/^(?:the )?Ring tempts you\.?$/i.test(c)) { effects.push({ kind: 'ring-tempts' }); return true; }
  if ((m = c.match(new RegExp(`^Support ${N}\\.?$`, 'i')))) {
    const bind = `multi${requirements.length}`, max = num(m[1]);
    requirements.push({ kind: 'multi-target', bind, scope: 'target creature', min: 0, max, label: `Choose up to ${max} other creatures`, notSource: true });
    effects.push({ kind: 'counter-many', bind, counter: '+1/+1', amount: 1 });
    return true;
  }
  if (compileRound3(c, ctx, subjectBind)) return true;
  if ((m = c.match(/^Create a tapped Powerstone token\.?$/i))) {
    effects.push({ kind: 'create-token', amount: 1, name: 'Powerstone', typeLine: 'Token Artifact — Powerstone', oracleText: '{T}: Add {C}. This mana can\'t be spent to cast a nonartifact spell.', tapped: true });
    return true;
  }
  return false;
}

function attachedOf(game, bindings) {
  const hit = locateCardInGame(game, bindings.sourceId);
  return hit?.card?.attachedTo || null;
}

/** Fill the pseudo-bindings new effects use. Called at the start of every effect package. */
export function prepareBindings(game, bindings) {
  if (bindings.__attached === undefined && bindings.sourceId) bindings.__attached = attachedOf(game, bindings);
  if (!bindings.thatCard) bindings.thatCard = bindings.eventCard || bindings.sourceId || null;
  if (bindings.__thatController === undefined) { const h = bindings.thatCard && locateCardInGame(game, bindings.thatCard); bindings.__thatController = h ? (h.card.controllerId || h.player?.playerId) : null; }
}

/** A regeneration shield is used up instead of the creature being destroyed: tap it, remove damage, remove it from combat. */
export function regenerates(game, card, notes = []) {
  const shields = (card?.temporaryEffects || []).filter(e => e?.kind === 'regen-shield');
  if (!shields.length || card.cantRegenerate) return false;
  card.temporaryEffects.splice(card.temporaryEffects.indexOf(shields[0]), 1);
  card.tapped = true;
  card.damageMarked = 0;
  card.deathtouchDamage = false;
  const cs = game.combatState;
  if (cs) {
    cs.attackers = (cs.attackers || []).filter(a => a.instanceId !== card.instanceId);
    for (const b of Object.values(cs.blocks || {})) if (b?.assignments) b.assignments = b.assignments.filter(a => a.blockerId !== card.instanceId && a.attackerId !== card.instanceId);
  }
  notes.push(`${definitionFor(game, card)?.name || 'The creature'} regenerates.`);
  return true;
}

function playerById(game, id) { return (game.players || []).find(p => p.playerId === id) || null; }
function permanentAt(game, id) { const hit = locateCardInGame(game, id); return hit && hit.zone === 'battlefield' ? hit : null; }

/** Run one of the effect kinds above. Returns true when handled. */
export function applyCatalogEffect(game, controllerId, effect, bindings, notes) {
  const controller = playerById(game, controllerId);
  const emit = e => H.emit(bindings, e);
  const name = card => definitionFor(game, card)?.name || 'Permanent';
  switch (effect.kind) {
    case 'regenerate': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      if (!hit) { notes.push('It is no longer on the battlefield.'); return true; }
      hit.card.temporaryEffects = hit.card.temporaryEffects || [];
      hit.card.temporaryEffects.push({ kind: 'regen-shield', expires: 'cleanup' });
      notes.push(`The next time ${name(hit.card)} would be destroyed this turn, it regenerates instead.`);
      return true;
    }
    case 'regenerate-each': {
      let n = 0;
      for (const c of controller.deck.battlefield || []) if (cardMatchesFilter(game, c, effect.filter || 'creature')) { c.temporaryEffects = c.temporaryEffects || []; c.temporaryEffects.push({ kind: 'regen-shield', expires: 'cleanup' }); n++; }
      notes.push(`${n} creature${n === 1 ? '' : 's'} get a regeneration shield.`);
      return true;
    }
    case 'exile-self': {
      const hit = locateCardInGame(game, bindings.sourceId);
      if (hit?.zone === 'battlefield') { moveCard(game, bindings.sourceId, 'exile', { onEvent: emit }); notes.push(`${name(hit.card)} is exiled.`); return true; }
      // A resolving instant or sorcery: it goes to exile instead of its owner's graveyard (Teferi's Protection).
      game.spellExileSelf = bindings.sourceId;
      notes.push('It is exiled as it finishes resolving.');
      return true;
    }
    case 'self-graveyard-to-library':
    case 'self-shuffle-into-library': {
      const hit = locateCardInGame(game, bindings.sourceId);
      if (!hit || !['graveyard', 'battlefield', 'hand', 'exile'].includes(hit.zone)) { game.spellShuffleSelf = effect.kind === 'self-shuffle-into-library' ? bindings.sourceId : null; return true; }
      moveCard(game, bindings.sourceId, 'library', { position: 'top', onEvent: emit });
      if (effect.kind === 'self-shuffle-into-library') H.shuffle(playerById(game, hit.card.ownerId)?.deck?.remainingLibrary || []);
      notes.push(`${name(hit.card)} is put into its owner's library${effect.kind === 'self-shuffle-into-library' ? ' and shuffled' : ' on top'}.`);
      return true;
    }
    case 'animate':
    case 'animate-each': {
      const ids = effect.kind === 'animate-each' ? (controller.deck.battlefield || []).filter(c => cardMatchesFilter(game, c, effect.filter || 'land')).map(c => c.instanceId) : [H.resolveBoundId(effect, bindings)];
      const n = resolveAmount(game, controllerId, 'X', bindings);
      for (const id of ids) {
        const hit = permanentAt(game, id);
        if (!hit) { notes.push('It is no longer on the battlefield.'); continue; }
        hit.card.temporaryEffects = hit.card.temporaryEffects || [];
        const fx = { kind: 'animate', addTypes: effect.addTypes, subtypes: effect.subtypes, keywords: effect.keywords, colors: effect.colors, power: effect.power === 'X' ? n : effect.power, toughness: effect.toughness === 'X' ? n : effect.toughness };
        if (effect.expires) fx.expires = effect.expires === 'your-next-turn' ? `turn-start:${controllerId}` : effect.expires;
        hit.card.temporaryEffects.push(fx);
        notes.push(`${name(hit.card)} becomes ${fx.power != null ? `a ${fx.power}/${fx.toughness} ` : 'a '}creature${effect.expires ? ' until end of turn' : ''}.`);
      }
      return true;
    }
    case 'monstrosity': {
      const hit = permanentAt(game, bindings.sourceId);
      if (!hit) return true;
      if (hit.card.monstrous) { notes.push(`${name(hit.card)} is already monstrous.`); return true; }
      const n = resolveAmount(game, controllerId, effect.amount, bindings);
      H.addCounter(hit.card, '+1/+1', n);
      hit.card.monstrous = true;
      emit({ type: 'counter-added', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, counter: '+1/+1', amount: n });
      emit({ type: 'becomes-monstrous', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, amount: n });
      notes.push(`${name(hit.card)} becomes monstrous with ${n} +1/+1 counter${n === 1 ? '' : 's'}.`);
      return true;
    }
    case 'adapt': {
      const hit = permanentAt(game, bindings.sourceId);
      if (!hit) return true;
      if (Number(hit.card.counters?.['+1/+1'] || 0) > 0) { notes.push(`${name(hit.card)} already has a +1/+1 counter, so it does not adapt.`); return true; }
      const n = resolveAmount(game, controllerId, effect.amount, bindings);
      H.addCounter(hit.card, '+1/+1', n);
      emit({ type: 'counter-added', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, counter: '+1/+1', amount: n });
      notes.push(`${name(hit.card)} adapts with ${n} +1/+1 counter${n === 1 ? '' : 's'}.`);
      return true;
    }
    case 'explore': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      const lib = controller.deck.remainingLibrary || [];
      const top = lib[0];
      if (!top) { if (hit) { H.addCounter(hit.card, '+1/+1', 1); } notes.push('The library is empty; it gets a +1/+1 counter.'); return true; }
      const d = definitionFor(game, top);
      if (/\bLand\b/i.test(d?.typeLine || '')) {
        moveCard(game, top.instanceId, 'hand', { onEvent: emit });
        notes.push(`${controller.displayName} reveals ${d?.name} and puts it into their hand.`);
      } else {
        if (hit) { H.addCounter(hit.card, '+1/+1', 1); emit({ type: 'counter-added', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, counter: '+1/+1', amount: 1 }); }
        const toGrave = bindings[effect.choiceBind] === true || bindings[effect.choiceBind] === 'graveyard';
        if (toGrave) moveCard(game, top.instanceId, 'graveyard', { onEvent: emit });
        notes.push(`${controller.displayName} reveals ${d?.name}; ${hit ? `${name(hit.card)} gets a +1/+1 counter` : 'nothing gets a counter'} and the card ${toGrave ? 'goes to the graveyard' : 'stays on top'}.`);
      }
      emit({ type: 'explores', sourceId: hit?.card?.instanceId || bindings.sourceId, controllerId });
      return true;
    }
    case 'connive-counters': {
      const ids = [].concat(bindings[effect.cardsBind] || []);
      const nonland = ids.filter(id => { const h = locateCardInGame(game, id); return h && !/\bLand\b/i.test(definitionFor(game, h.card)?.typeLine || ''); }).length;
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      if (hit && nonland) { H.addCounter(hit.card, '+1/+1', nonland); emit({ type: 'counter-added', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, counter: '+1/+1', amount: nonland }); }
      notes.push(nonland && hit ? `${name(hit.card)} connives and gets ${nonland} +1/+1 counter${nonland === 1 ? '' : 's'}.` : 'It connives.');
      return true;
    }
    case 'player-counter': {
      const players = effect.playerBind ? [playerById(game, bindings[effect.playerBind])].filter(Boolean) : H.targetPlayers(game, controllerId, effect.scope || 'you', null);
      const n = resolveAmount(game, controllerId, effect.amount, bindings);
      for (const p of players) {
        if (effect.counter === 'poison') p.poison = Number(p.poison || 0) + n;
        else { p.counters = p.counters || {}; p.counters[effect.counter] = Number(p.counters[effect.counter] || 0) + n; }
        notes.push(`${p.displayName} gets ${n} ${effect.counter} counter${n === 1 ? '' : 's'}.`);
      }
      return true;
    }
    case 'amass': {
      const n = resolveAmount(game, controllerId, effect.amount, bindings);
      let army = (controller.deck.battlefield || []).find(c => /\bArmy\b/.test(definitionFor(game, c)?.typeLine || ''));
      if (!army) {
        H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, power: 0, toughness: 0, name: `${effect.type} Army`, typeLine: `Token Creature — ${effect.type} Army`, colors: ['B'] }], bindings);
        army = [...controller.deck.battlefield].reverse().find(c => /\bArmy\b/.test(definitionFor(game, c)?.typeLine || ''));
      }
      if (army) { H.addCounter(army, '+1/+1', n); emit({ type: 'counter-added', sourceId: army.instanceId, controllerId, counter: '+1/+1', amount: n }); }
      notes.push(`${controller.displayName} amasses ${n}.`);
      return true;
    }
    case 'incubate': {
      const n = resolveAmount(game, controllerId, effect.amount, bindings);
      H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, name: 'Incubator', typeLine: 'Token Artifact — Incubator', oracleText: '{2}: Transform this artifact.' }], bindings);
      const inc = [...controller.deck.battlefield].reverse().find(c => /Incubator/.test(definitionFor(game, c)?.typeLine || ''));
      if (inc) { H.addCounter(inc, '+1/+1', n); inc.incubator = true; }
      notes.push(`${controller.displayName} incubates ${n}.`);
      return true;
    }
    case 'ring-tempts': {
      controller.counters = controller.counters || {};
      controller.counters.ringLevel = Math.min(4, Number(controller.counters.ringLevel || 0) + 1);
      controller.counters.ringTemptedThisTurn = 1;
      emit({ type: 'ring-tempts', playerId: controllerId, controllerId });
      notes.push(`The Ring tempts ${controller.displayName} (level ${controller.counters.ringLevel}). Choose a Ring-bearer by hand if needed.`);
      return true;
    }
    default:
      return applyCatalogSequenceEffect(game, controllerId, effect, bindings, notes) || applyRound3(game, controllerId, effect, bindings, notes);
  }
}

/** Requirement kinds added here, asked by requirements.js. Returns true when handled. */
export function gatherCatalogRequirement(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'bolster') {
    const mine = (player.deck.battlefield || []).filter(c => /\bCreature\b/i.test(util.defOf(game, c)?.typeLine || ''));
    if (!mine.length) { bindings[req.bind] = null; return true; }
    const least = Math.min(...mine.map(c => effectiveToughness(c, util.defOf(game, c), game)));
    const rows = mine.filter(c => effectiveToughness(c, util.defOf(game, c), game) === least);
    bindings[req.bind] = rows.length === 1 ? rows[0].instanceId
      : ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: `Bolster: choose one of your creatures with the least toughness (${least}).`, options: rows.map(c => util.cardOption(game, c, player)) }));
    return true;
  }
  if (gatherCatalogSequenceRequirement(game, ctx, req, bindings, ask, key, title, base, util)) return true;
  if (gatherRound3(game, ctx, req, bindings, ask, key, title, base, util)) return true;
  if (req.kind === 'explore') {
    // The top card is known now; nothing earlier in the same ability changes the library.
    const top = (player.deck.remainingLibrary || [])[0];
    const d = top && util.defOf(game, top);
    if (!top || /\bLand\b/i.test(d?.typeLine || '')) { bindings[req.bind] = false; return true; }
    bindings[req.bind] = ask(key, () => ({ ...base, cancellable: false, kind: 'confirm', private: true, title: `${ctx.sourceName} — explore`, prompt: `You reveal ${d?.name}. It is not a land, so the creature gets a +1/+1 counter. Put ${d?.name} into your graveyard?`, yesLabel: 'Graveyard', noLabel: 'Keep on top' }));
    return true;
  }
  return false;
}


// ---------------------------------------------------------------------------------------------
// Round 2: instructions that span several sentences (look at the top cards, impulse draw, hand disruption).

/** Does a card's type line fit "creature", "nonland", "instant or sorcery", "noncreature, nonland", "Elf", "permanent" …? */
export function cardFitsWords(def, words) {
  const w = String(words || '').toLowerCase().replace(/\bcards?\b/g, '').replace(/\s+/g, ' ').trim();
  if (!w || w === 'a' || w === 'any') return true;
  const t = String(def?.typeLine || '').toLowerCase();
  const mv = Number(def?.manaValue ?? def?.cmc ?? 0);
  return w.split(/\s+or\s+|,\s*or\s+|\s*\/\s*/).some(alt => {
    let a = alt.trim(), ok = true, m;
    if ((m = a.match(/\s*with mana value (\d+) or (less|greater)/))) { ok = m[2] === 'less' ? mv <= Number(m[1]) : mv >= Number(m[1]); a = a.replace(m[0], ''); }
    if ((m = a.match(/\s*with mana value (\d+)/))) { ok = ok && mv === Number(m[1]); a = a.replace(m[0], ''); }
    for (const part of a.split(/[ ,]+/).filter(Boolean)) {
      if (part.startsWith('non')) { if (new RegExp(`\\b${part.slice(3).replace(/-/g, '')}\\b`).test(t)) ok = false; continue; }
      if (part === 'permanent') { if (/\binstant\b|\bsorcery\b/.test(t)) ok = false; continue; }
      if (part === 'historic') { if (!/legendary|artifact|saga/.test(t)) ok = false; continue; }
      if (!new RegExp(`\\b${esc(part.replace(/s$/, ''))}s?\\b`).test(t)) ok = false;
    }
    return ok;
  });
}

const DEST = s => {
  const x = String(s || '').toLowerCase();
  if (/hand/.test(x)) return { to: 'hand' };
  if (/onto the battlefield/.test(x)) return { to: 'battlefield', tapped: /tapped/.test(x) };
  if (/graveyard/.test(x)) return { to: 'graveyard' };
  if (/bottom/.test(x)) return { to: 'bottom', order: /random/.test(x) ? 'random' : 'any' };
  if (/on top|back/.test(x)) return { to: 'top', order: 'any' };
  if (/exile/.test(x)) return { to: 'exile' };
  return null;
};
const DEST_RE = '(into your hand|onto the battlefield(?: tapped)?(?: under your control)?|on top of your library(?: in any order)?|into your graveyard|on the bottom of your library(?: in (?:any|a random) order)?|into exile)';
const AMONG = '(?:of them|from among (?:them|those cards|the revealed cards|the cards revealed this way|the exiled cards))';
const COUNT = '(up to (?:one|two|three|four|five|\\d+|X)|any number of|all|one|two|three|four|five|\\d+|a|an)';

function parsePick(s) {
  let m = s.match(new RegExp(`^(?:Then )?(you may )?(?:reveal |put |choose )?${COUNT} (?:([a-z ,/'-]+?) )?(?:cards? )?${AMONG}(?: and put (?:it|them|that card|those cards))? ${DEST_RE}(?:,? and (?:put )?the (?:rest|other|others|remaining cards?) (.+?))?\\.?$`, 'i'));
  if (!m) m = s.match(new RegExp(`^(?:Then )?(you may )?put ${COUNT} (?:([a-z ,/'-]+?) )?cards? revealed this way ${DEST_RE}(?:,? and (?:put )?the (?:rest|other|others) (.+?))?\\.?$`, 'i'));
  if (!m) return null;
  const may = !!m[1], c = m[2].toLowerCase(), filter = (m[3] || '').trim();
  const dest = DEST(m[4]);
  if (!dest) return null;
  let min = 0, max = 1, all = false;
  if (c === 'all') all = true;
  else if (c === 'any number of') { min = 0; max = 99; }
  else if (c.startsWith('up to')) { min = 0; max = num(c.replace('up to ', '')); }
  else { max = num(c) ?? 1; min = may ? 0 : max; }
  const rest = m[5] ? DEST(m[5]) : null;
  if (m[5] && !rest) return null;
  return { pick: { min, max, filter, all, ...dest }, rest };
}
function parseRest(s) {
  const m = s.match(/^(?:Then )?put (?:the rest|all other cards revealed this way|the other cards?|the others|the remaining cards?|those cards|them)(?: back)? (.+?)\.?$/i) || s.match(/^(?:Then )?put the rest back in any order\.?$/i);
  if (!m) return null;
  if (!m[1]) return { to: 'top', order: 'any' };
  return DEST(m[1]);
}

/**
 * Several sentences read as one instruction. Returns { part, consumed } or null.
 * `parts` are the instructions already compiled for this ability (for cards drawn before looking).
 */
export function compileCatalogSequence(clauses, i, { sourceName, parts = [] }) {
  const c0 = String(clauses[i] || '').replace(/\([^()]*\)/g, '').trim();
  const next = k => String(clauses[i + k] || '').replace(/\([^()]*\)/g, '').trim();
  let m;
  const drawnBefore = parts.flatMap(p => p.effects || []).filter(e => e.kind === 'draw' && (e.scope || 'you') === 'you' && !e.bind && typeof e.amount === 'number').reduce((n, e) => n + e.amount, 0);

  // Look at / reveal the top N cards, then distribute them.
  if ((m = c0.match(/^(?:You may )?(look at|reveal) the top (card|a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)(?: cards?)? of your library\.?$/i))) {
    const amount = /^card$/i.test(m[2]) ? 1 : num(m[2]);
    const reveal = /reveal/i.test(m[1]);
    const picks = [];
    let rest = null, k = 1;
    for (; k <= 3 && i + k < clauses.length; k++) {
      const s = next(k);
      const p = parsePick(s);
      if (p) { picks.push(p.pick); if (p.rest) { rest = p.rest; k++; break; } continue; }
      // One card: "If it's a creature card, you may reveal it and put it into your hand." / "If it's a land card, put it onto the battlefield."
      const one = amount === 1 && s.match(new RegExp(`^If (?:it'?s|that card is) (?:a|an) ([a-z ,/'-]+?) card(?: with [^,]+)?, (you may )?(?:reveal it and )?(?:put|return) (?:it|that card) ${DEST_RE}\\.?$`, 'i'));
      if (one) { const d = DEST(one[3]); if (!d) break; picks.push({ min: one[2] ? 0 : 1, max: 1, filter: one[1], ...d }); continue; }
      const otherwise = picks.length && s.match(new RegExp(`^(?:Otherwise|If you don'?t(?: put it into your hand| reveal it)?|If you don'?t put it [^,]+),? (?:you may )?put (?:it|that card) ${DEST_RE}\\.?$`, 'i'));
      if (otherwise) { rest = DEST(otherwise[1]); k++; break; }
      const r = picks.length || amount > 1 ? parseRest(s) : null;
      if (r) { rest = r; k++; break; }
      break;
    }
    if (!picks.length && !rest) return null;
    const bind = `dig${i}`;
    const req = { kind: 'dig', bind, amount, offset: drawnBefore, reveal, picks, rest: rest || { to: 'top', order: amount > 1 ? 'any' : 'keep' }, label: `the top ${amount === 1 ? 'card' : `${amount} cards`}` };
    return { part: { effects: [{ kind: 'dig', bind, amount, picks, rest: req.rest }], requirements: [req], unsupported: [] }, consumed: k };
  }

  // Impulse draw: "Exile the top card of your library. You may play that card this turn."
  if ((m = c0.match(/^Exile the top (card|a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)(?: cards?)? of your library(?: face down)?\.?$/i))) {
    const amount = /^card$/i.test(m[1]) ? 1 : num(m[1]);
    let k = 1, choose = null;
    const ch = next(1).match(/^Choose (one|a card) of them\.?$/i);
    if (ch) { choose = true; k = 2; }
    const s = next(k);
    const p = s.match(/^(?:Until (end of turn|the end of your next turn|your next end step),? )?you may (play|cast) (that card|those cards|them|it|the exiled cards?|cards exiled this way|that spell)(?: this turn| until (end of turn|the end of your next turn))?( without paying (?:its|their) mana costs?)?\.?$/i)
      || s.match(/^(?:Until (end of turn|the end of your next turn),? )?you may (play|cast) (lands and cast spells|spells) from among (?:them|those cards|the exiled cards)(?: this turn| until (end of turn|the end of your next turn))?( without paying (?:its|their) mana costs?)?\.?$/i);
    if (!p) return null;
    const until = /next turn/i.test(p[1] || p[4] || '') ? 'next-turn' : 'turn';
    const bind = choose ? `impulse${i}` : null;
    const requirements = choose ? [{ kind: 'dig', bind, amount, offset: drawnBefore, picks: [{ min: 1, max: 1, filter: '', to: 'exile-play' }], rest: { to: 'exile' }, label: `the top ${amount} cards`, chooseOnly: true }] : [];
    return { part: { effects: [{ kind: 'impulse', amount, until, castOnly: /cast/i.test(p[2]) && !/lands/i.test(p[3]), free: !!p[5], chooseBind: bind }], requirements, unsupported: [] }, consumed: k + 1 };
  }

  // Hand disruption: "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card."
  if ((m = c0.match(/^(Target opponent|Target player|Each opponent) reveals (?:their|his or her) hand\.?$/i))) {
    const ch = next(1).match(/^You (?:may )?choose (a|an|up to (?:one|two|three|\d+)|one|two|three|any number of) ([a-z ,/'-]+? )?cards? from (?:it|their hand|among them|those cards)(?: with mana value (\d+) or (less|greater))?\.?$/i);
    const fin = next(2).match(/^(?:That player|They|Its owner) (discards? (?:that card|those cards|the chosen cards?|it)|exiles? (?:that card|it)|puts? (?:that card|it) on the bottom of their library)\.?$/i)
      || next(2).match(/^Exile (?:that card|it|those cards)\.?$/i);
    const bindPlayer = `player${i}`;
    const requirements = /^each/i.test(m[1]) ? [] : [{ kind: 'player', bind: bindPlayer, scope: /opponent/i.test(m[1]) ? 'opponent' : 'player', label: m[1].toLowerCase() }];
    if (!ch || !fin || /^each/i.test(m[1])) {
      if (ch) return null;
      return { part: { effects: [{ kind: 'reveal-hand', playerBind: /^each/i.test(m[1]) ? null : bindPlayer, scope: /^each/i.test(m[1]) ? 'each-opponent' : null }], requirements, unsupported: [] }, consumed: 1 };
    }
    const count = ch[1].toLowerCase();
    const max = count === 'any number of' ? 99 : num(count.replace('up to ', '')) ?? 1, min = /up to|any number|may/i.test(count) || /may/i.test(next(1)) ? 0 : max;
    const filter = `${(ch[2] || '').trim()}${ch[3] ? ` with mana value ${ch[3]} or ${ch[4]}` : ''}`;
    const pick = `handPick${i}`;
    requirements.push({ kind: 'hand-pick', bind: pick, playerBind: bindPlayer, filter, min, max, label: `${count} ${filter || ''} card from their hand`.replace(/\s+/g, ' ') });
    const to = /exile/i.test(fin[0]) ? 'exile' : /bottom/i.test(fin[0]) ? 'bottom' : 'graveyard';
    return { part: { effects: [{ kind: 'hand-pick-move', playerBind: bindPlayer, cardsBind: pick, to }], requirements, unsupported: [] }, consumed: 3 };
  }
  return null;
}

function moveTo(game, id, dest, emit, controllerId) {
  if (dest.to === 'hand') return moveCard(game, id, 'hand', { onEvent: emit });
  if (dest.to === 'battlefield') return moveCard(game, id, 'battlefield', { controllerId, tapped: !!dest.tapped, onEvent: emit });
  if (dest.to === 'graveyard') return moveCard(game, id, 'graveyard', { onEvent: emit });
  if (dest.to === 'exile' || dest.to === 'exile-play') return moveCard(game, id, 'exile', { onEvent: emit });
  if (dest.to === 'bottom') return moveCard(game, id, 'library', { position: 'bottom', onEvent: emit });
  if (dest.to === 'top') return moveCard(game, id, 'library', { position: 'top', onEvent: emit });
  return null;
}

export function applyCatalogSequenceEffect(game, controllerId, effect, bindings, notes) {
  const controller = playerById(game, controllerId);
  const emit = e => H.emit(bindings, e);
  const nameOf = id => definitionFor(game, locateCardInGame(game, id)?.card)?.name || 'a card';
  if (effect.kind === 'dig') {
    const answer = bindings[effect.bind] || { groups: [], rest: [] };
    const lib = controller.deck.remainingLibrary;
    const top = new Set(lib.slice(0, Math.max(0, resolveAmount(game, controllerId, effect.amount, bindings))).map(c => c.instanceId));
    (answer.groups || []).forEach((ids, g) => {
      for (const id of ids || []) {
        if (!lib.some(c => c.instanceId === id)) continue;
        top.delete(id);
        const d = effect.picks[g];
        moveTo(game, id, d, emit, controllerId);
        notes.push(`${controller.displayName} puts ${nameOf(id)} ${d.to === 'hand' ? 'into their hand' : d.to === 'battlefield' ? 'onto the battlefield' : d.to === 'graveyard' ? 'into their graveyard' : d.to === 'bottom' ? 'on the bottom of their library' : 'on top of their library'}.`);
      }
    });
    let rest = (answer.rest && answer.rest.length ? answer.rest : [...top]).filter(id => top.has(id));
    for (const id of top) if (!rest.includes(id)) rest.push(id);
    const r = effect.rest || { to: 'top' };
    if (r.order === 'random') H.shuffle(rest);
    if (r.to === 'top' || r.to === 'keep') {
      // Back on top in the chosen order (first = top).
      for (const id of [...rest].reverse()) moveTo(game, id, { to: 'top' }, emit, controllerId);
    } else {
      for (const id of rest) moveTo(game, id, r, emit, controllerId);
      if (rest.length) notes.push(`${rest.length} other card${rest.length === 1 ? '' : 's'} ${r.to === 'graveyard' ? 'go to the graveyard' : r.to === 'hand' ? 'go to the hand' : r.to === 'exile' ? 'are exiled' : 'go on the bottom of the library'}.`);
    }
    emit({ type: 'library-looked', playerId: controllerId });
    return true;
  }
  if (effect.kind === 'impulse') {
    const n = Math.max(0, resolveAmount(game, controllerId, effect.amount, bindings));
    const ids = controller.deck.remainingLibrary.slice(0, n).map(c => c.instanceId);
    const chosen = effect.chooseBind ? new Set((bindings[effect.chooseBind]?.groups || [])[0] || []) : null;
    for (const id of ids) {
      const moved = moveCard(game, id, 'exile', { onEvent: emit });
      if (!chosen || chosen.has(id)) moved.card.playPermission = { playerId: controllerId, until: effect.until, grantedTurn: game.turnNumber, castOnly: !!effect.castOnly, free: !!effect.free };
    }
    notes.push(`${controller.displayName} exiles ${ids.map(nameOf).join(', ') || 'nothing'}${ids.length ? ` and may ${effect.castOnly ? 'cast' : 'play'} ${chosen ? 'the chosen card' : ids.length === 1 ? 'it' : 'them'} ${effect.until === 'next-turn' ? 'until the end of their next turn' : 'this turn'}` : ''}.`);
    return true;
  }
  if (effect.kind === 'reveal-hand') {
    const players = effect.playerBind ? [playerById(game, bindings[effect.playerBind])].filter(Boolean) : H.targetPlayers(game, controllerId, effect.scope || 'each-opponent', null);
    for (const p of players) notes.push(`${p.displayName} reveals their hand: ${(p.deck.hand || []).map(c => definitionFor(game, c)?.name).join(', ') || 'no cards'}.`);
    return true;
  }
  if (effect.kind === 'hand-pick-move') {
    const p = playerById(game, bindings[effect.playerBind]);
    const ids = [].concat(bindings[effect.cardsBind] || []);
    if (!p) return true;
    for (const id of ids) {
      if (!p.deck.hand.some(c => c.instanceId === id)) continue;
      const name = nameOf(id);
      if (effect.to === 'graveyard') {
        const i = p.deck.hand.findIndex(c => c.instanceId === id);
        const [c] = p.deck.hand.splice(i, 1);
        c.zone = 'graveyard'; p.deck.graveyard.push(c);
        emit({ type: 'discard', playerId: p.playerId, sourceId: c.instanceId, definitionId: c.definitionId, typeLine: definitionFor(game, c)?.typeLine || '' });
        notes.push(`${p.displayName} discards ${name}.`);
      } else { moveTo(game, id, { to: effect.to }, emit, controllerId); notes.push(`${name} is ${effect.to === 'exile' ? 'exiled' : 'put on the bottom of its owner’s library'}.`); }
    }
    if (!ids.length) notes.push(`${p.displayName} reveals their hand; nothing is chosen.`);
    return true;
  }
  return false;
}

/** Resolve-time choices for the sequences above. */
export function gatherCatalogSequenceRequirement(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'dig') {
    const amount = String(req.amount).toUpperCase() === 'X' ? Number(bindings.X || 0) : Number(req.amount || 0);
    const cards = (player.deck.remainingLibrary || []).slice(Number(req.offset || 0), Number(req.offset || 0) + amount);
    const left = [...cards], groups = [];
    req.picks.forEach((p, g) => {
      const fits = left.filter(c => cardFitsWords(util.defOf(game, c), p.filter));
      if (p.all) { groups.push(fits.map(c => c.instanceId)); for (const c of fits) left.splice(left.indexOf(c), 1); return; }
      const max = Math.min(p.max === 'X' ? Number(bindings.X || 0) : p.max, fits.length), min = Math.min(p.min === 'X' ? Number(bindings.X || 0) : p.min, max);
      if (max === 0) { groups.push([]); return; }
      const where = p.to === 'hand' ? 'into your hand' : p.to === 'battlefield' ? `onto the battlefield${p.tapped ? ' tapped' : ''}` : p.to === 'graveyard' ? 'into your graveyard' : p.to === 'exile-play' ? 'to play' : p.to === 'bottom' ? 'on the bottom' : 'on top';
      const picked = ask(`${key}:${g}`, () => ({ ...base, cancellable: false, kind: 'choose-many', private: true, title: `${ctx.sourceName} — ${req.label}`,
        prompt: `${req.reveal ? 'You reveal' : 'You look at'} ${util.plural(cards.length, 'card')}. Choose ${min === max ? max : min ? `${min} to ${max}` : `up to ${max}`}${p.filter ? ` ${p.filter}` : ''} card${max === 1 ? '' : 's'} to put ${where}.`,
        options: left.map(c => ({ ...util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || ''), disabled: !fits.includes(c) })), min, max }));
      const ids = [].concat(picked || []).filter(id => fits.some(c => c.instanceId === id)).slice(0, max);
      groups.push(ids);
      for (const id of ids) left.splice(left.findIndex(c => c.instanceId === id), 1);
    });
    let rest = left.map(c => c.instanceId);
    const r = req.rest || {};
    if (left.length > 1 && r.order === 'any' && (r.to === 'top' || r.to === 'bottom')) {
      const answer = ask(`${key}:order`, () => ({ ...base, cancellable: false, kind: 'arrange', private: true, title: `${ctx.sourceName} — order`, prompt: `Put the other cards ${r.to === 'top' ? 'back on top' : 'on the bottom'} in any order (first listed goes ${r.to === 'top' ? 'on top' : 'first'}).`, cards: left.map(c => util.cardOption(game, c, player, 'Library')), otherLabel: null }));
      if (answer?.top?.length) rest = answer.top;
    }
    bindings[req.bind] = { groups, rest };
    return true;
  }
  if (req.kind === 'hand-pick') {
    const q = util.playerById(game, bindings[req.playerBind]);
    if (!q) { bindings[req.bind] = []; return true; }
    const hand = q.deck.hand || [];
    const fits = hand.filter(c => cardFitsWords(util.defOf(game, c), req.filter));
    const max = Math.min(req.max, fits.length), min = Math.min(req.min, max);
    if (!max) { bindings[req.bind] = []; return true; }
    bindings[req.bind] = ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', private: true, title: `${ctx.sourceName} — ${q.displayName}'s hand`,
      prompt: `${q.displayName} reveals their hand. Choose ${min === max ? max : `up to ${max}`}${req.filter ? ` ${req.filter}` : ''} card${max === 1 ? '' : 's'}.`,
      options: hand.map(c => ({ ...util.cardOption(game, c, q, util.defOf(game, c)?.typeLine || ''), disabled: !fits.includes(c) })), min, max }));
    return true;
  }
  return false;
}

/** Can this player play this exiled card now because an effect allowed it (impulse draw)? */
export function exilePlayPermission(game, player, card) {
  const p = card?.playPermission;
  if (!p || card.zone !== 'exile' || p.playerId !== player.playerId) return null;
  return p;
}

/** At the end of each turn: permissions that last "this turn" end; "until the end of your next turn" ends after that turn. */
export function expirePlayPermissions(game) {
  for (const q of game.players || []) for (const c of q.deck?.exile || []) {
    const p = c.playPermission;
    if (!p) continue;
    if (p.until === 'turn' || (p.until === 'next-turn' && game.activePlayerId === p.playerId && Number(game.turnNumber) > Number(p.grantedTurn))) delete c.playPermission;
  }
}

// ---------------------------------------------------------------------------------------------
// Round 3: copies of "that creature", things done to recent tokens at the end step, untap locks, die-to-exile,
// multi-target forms, more token kinds, werewolves, sacrifice-unless-you-pay …

export const TOKEN_TEXT = {
  Treasure: '{T}, Sacrifice this artifact: Add one mana of any color.',
  Food: '{2}, {T}, Sacrifice this artifact: You gain 3 life.',
  Clue: '{2}, Sacrifice this artifact: Draw a card.',
  Blood: '{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.',
  Map: '{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.',
  Gold: 'Sacrifice this artifact: Add one mana of any color.',
  Powerstone: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.",
  Lander: '{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
  Mutagen: '{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.',
  Junk: '{T}, Sacrifice this artifact: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery.',
  Shard: '{2}, Sacrifice this enchantment: Scry 1, then draw a card.'
};
const COLOR_OF = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };

function compileRound3(c, ctx, subjectBind) {
  const { sourceName, selfAny, effects, requirements } = ctx;
  let m;
  const PRON = '(it|that creature|that artifact|that card|that permanent|that token|this creature|the exiled card|the creature|' + selfAny + ')';
  const pronBind = s => new RegExp(`^${selfAny}$|^this creature$`, 'i').test(s) ? 'sourceId' : /^it$/i.test(s) ? 'eventCard' : 'thatCard';

  // Copies: "create a token that's a copy of that creature", "… except it has haste", "a tapped token …".
  if ((m = c.match(new RegExp(`^(?:You may )?create (a|two|three|X) (tapped )?tokens? that'?s? (?:are )?(?:a )?cop(?:y|ies) of ${PRON}(?:, except (it has haste|it isn't legendary|it's not legendary|it has haste and it isn't legendary|it isn't legendary and it has haste))?\\.?$`, 'i')))) {
    effects.push({ kind: 'copy-of', bind: pronBind(m[3]), amount: num(m[1]) ?? 1, tapped: !!m[2], haste: /haste/i.test(m[4] || ''), nonlegendary: /legendary/i.test(m[4] || '') });
    return true;
  }
  if ((m = c.match(/^Populate\.?$/i))) {
    const bind = `choice${requirements.length}`;
    requirements.push({ kind: 'choose-permanent', bind, scope: 'creature token you control', label: 'creature token to copy' });
    effects.push({ kind: 'copy-of', bind, amount: 1 });
    return true;
  }
  // The tokens or cards just made/moved: "Sacrifice it at the beginning of the next end step." "Exile them at end of combat."
  if ((m = c.match(/^(Sacrifice|Exile|Return) (it|them|that token|those tokens|the token|the tokens|that creature|those creatures)(?: to (?:its|their) owners?'? hands?)? (?:at the beginning of the next end step|at the beginning of your next end step|at end of combat|at the beginning of the end step)\.?$/i))) {
    const kind = m[1].toLowerCase() === 'sacrifice' ? 'sacrifice-ids' : m[1].toLowerCase() === 'exile' ? 'exile-ids' : 'bounce-ids';
    effects.push({ kind: 'delay', when: { event: /end of combat/i.test(c) ? 'end-combat' : 'end-step', whose: /your next/i.test(c) ? 'owner' : 'any', sameTurn: true }, effects: [{ kind, fromBind: '__recent' }], requirements: [] });
    return true;
  }
  if ((m = c.match(/^(?:It|They|That token|Those tokens|That creature) gains? (haste|flying|trample|vigilance|lifelink)(?: and (haste|flying|trample|vigilance|lifelink))?\.?$/i))) {
    for (const k of [m[1], m[2]].filter(Boolean)) effects.push({ kind: 'grant-keyword-recent', keyword: cap(k.toLowerCase()), expires: null });
    return true;
  }
  if ((m = c.match(/^(?:They|Those creatures|Those tokens) gain (haste|flying|trample)(?: and (haste|flying|trample))? until end of turn\.?$/i))) {
    for (const k of [m[1], m[2]].filter(Boolean)) effects.push({ kind: 'grant-keyword-recent', keyword: cap(k.toLowerCase()), expires: 'cleanup' });
    return true;
  }
  // "That creature doesn't untap during its controller's next untap step."
  if ((m = c.match(new RegExp(`^(${selfAny}|It|That creature|That permanent|Target creature|Those creatures|Enchanted creature) (?:doesn'?t|don'?t) untap during (?:its|their) controller'?s? next untap step\\.?$`, 'i')))) {
    if (/^those/i.test(m[1])) { effects.push({ kind: 'skip-untap-recent' }); return true; }
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature', 'target creature') : /^enchanted/i.test(m[1]) ? '__attached' : m[1].match(new RegExp(`^${selfAny}$`, 'i')) ? 'sourceId' : 'lastTarget';
    effects.push({ kind: 'skip-untap', bind });
    return true;
  }
  if ((m = c.match(/^Tap (target [^.]+?)\. It doesn'?t untap during its controller'?s next untap step\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'tap', bind }, { kind: 'skip-untap', bind });
    return true;
  }
  // "If that creature would die this turn, exile it instead." / "If a creature dealt damage this way would die this turn, exile it instead."
  if (/^If (?:that creature|it|a creature dealt damage this way|a creature dealt damage this turn by [^,]+|that permanent) would die this turn, exile it instead\.?$/i.test(c)) {
    effects.push({ kind: 'exile-if-dies', bind: /dealt damage/i.test(c) ? '__damaged' : 'lastTarget' });
    return true;
  }
  // Damage to the player or creature the trigger is about.
  if ((m = c.match(new RegExp(`^(?:${selfAny}|It|This enchantment|This artifact) deals ${N} damage to (that player|that creature|that permanent|that player or planeswalker|defending player|each opponent and each creature they control)\\.?$`, 'i')))) {
    if (/each opponent/i.test(m[2])) return false;
    effects.push({ kind: 'damage', amount: num(m[1]), bind: /player/i.test(m[2]) ? (/defending/i.test(m[2]) ? 'defendingPlayer' : 'eventPlayer') : 'thatCard', sourceName });
    return true;
  }
  if ((m = c.match(new RegExp(`^(that player|its controller|defending player|that creature's controller) (loses|gains) ${N} life\\.?$`, 'i')))) {
    const forPlayerBind = /defending/i.test(m[1]) ? 'defendingPlayer' : /controller/i.test(m[1]) ? '__thatController' : 'eventPlayer';
    effects.push({ kind: 'life', scope: 'you', amount: num(m[3]), deltaSign: /gain/i.test(m[2]) ? 1 : -1, forPlayerBind });
    return true;
  }
  if ((m = c.match(new RegExp(`^defending player loses ${N} life and you gain ${N} life\\.?$`, 'i')))) {
    effects.push({ kind: 'life', scope: 'you', amount: num(m[1]), deltaSign: -1, forPlayerBind: 'defendingPlayer' }, { kind: 'life', scope: 'you', amount: num(m[2]), deltaSign: 1 });
    return true;
  }
  // Mill / draw small forms.
  if ((m = c.match(/^(?:You )?mills? (?:a|one) card\.?$/i))) { effects.push({ kind: 'mill', scope: 'you', amount: 1 }); return true; }
  if ((m = c.match(/^(?:You )?(?:take|takes) an extra turn after this one\.?$/i))) { effects.push({ kind: 'extra-turn', playerBind: null }); return true; }
  // Counters from the event / on the source.
  if ((m = c.match(new RegExp(`^put that many ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters on (${selfAny}|it|target creature you control|target creature)\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[2]) ? H.targetRequirement(requirements, m[2].toLowerCase(), m[2]) : subjectBind(m[2]);
    effects.push({ kind: 'counter', bind, counter: m[1], amount: { kind: 'binding', bind: 'eventAmount' } });
    return true;
  }
  if ((m = c.match(new RegExp(`^Remove (?:a|an|one|${N}) ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters? from (${selfAny}|it)\\.?$`, 'i')))) {
    effects.push({ kind: 'remove-counter', bind: subjectBind(m[3]), counter: m[2], amount: num(m[1]) ?? 1 });
    return true;
  }
  // Equipment: "attach this Equipment to it" (Hero's Blade, Cryptic Coat).
  if ((m = c.match(/^(?:you may )?attach (?:this Equipment|it|this Aura) to (it|that creature|target creature you control)\.?$/i))) {
    const creatureBind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'creature you control') : pronBind(m[1]);
    effects.push({ kind: 'attach', equipmentBind: 'sourceId', creatureBind });
    return true;
  }
  // Graveyard and library moves.
  if ((m = c.match(/^Return up to (one|two|three|four|five|\d+|X) target ([a-z ,]*?)cards? from your graveyard to your hand\.?$/i))) {
    const bind = `graveMulti${requirements.length}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter: m[2].trim(), max: num(m[1]), label: `up to ${m[1]} ${m[2]}card${num(m[1]) === 1 ? '' : 's'} in your graveyard` });
    effects.push({ kind: 'graveyard-to-hand-many', bind });
    return true;
  }
  if ((m = c.match(/^Put (target card|target [a-z ]+ card) from (a|your|an opponent's) graveyard on the bottom of (?:its owner'?s|your) library\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: `${m[1].toLowerCase()}${/your/i.test(m[2]) ? ' in your graveyard' : ''}`, label: `${m[1]} in ${m[2]} graveyard` });
    effects.push({ kind: 'move-zone', bind, to: 'library', position: 'bottom' });
    return true;
  }
  if ((m = c.match(/^Put (target [^.]+?) on (top|the bottom) of its owner'?s library\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'to-library', bind, position: /top/i.test(m[2]) ? 'top' : 'bottom' });
    return true;
  }
  if ((m = c.match(/^(?:shuffle it into its owner'?s library|its owner shuffles it into their library)\.?$/i))) { effects.push({ kind: 'to-library', bind: 'eventCard', position: 'shuffle', soft: true }); return true; }
  // Hand to battlefield: "You may put a creature card from your hand onto the battlefield." (Sneak Attack, Arboreal Grazer)
  if ((m = c.match(/^(?:You may )?put (?:a|an) ([a-z ]+?) card from your hand onto the battlefield( tapped)?\.?$/i))) {
    const bind = `handCard${requirements.length}`;
    requirements.push({ kind: 'hand-card', bind, filter: m[1].toLowerCase().replace(/^(?:permanent|nonland permanent)$/, ''), label: `a ${m[1]} card to put onto the battlefield` });
    effects.push({ kind: 'hand-to-battlefield-any', bind, tapped: !!m[2], optionalTarget: true });
    return true;
  }
  // Sacrifice as an optional effect inside "you may … If you do": "Sacrifice another creature." "Sacrifice a creature or artifact."
  if ((m = c.match(/^Sacrifice (another|a|an) (creature|artifact|enchantment|land|permanent|nonland permanent|token|creature or artifact|artifact or creature)\.?$/i))) {
    const bind = `cards${requirements.length}`;
    requirements.push({ kind: 'card-selection', bind, scope: 'you', filter: m[2].toLowerCase().replace(/^token$/, 'permanent|token'), amount: 1, label: `${m[1]} ${m[2]} to sacrifice`, notSource: /another/i.test(m[1]) });
    effects.push({ kind: 'sacrifice-many', scope: 'you', amount: 1, filter: m[2].toLowerCase(), bind });
    return true;
  }
  // "Sacrifice this creature unless you pay {1}{G}." (upkeep costs)
  if ((m = c.match(new RegExp(`^sacrifice (${selfAny}|it) unless you (pay ((?:\\{[^}]+\\})+)|pay (\\d+|one|two|three|four|five) life)\\.?$`, 'i')))) {
    effects.push({ kind: 'may-pay', cost: m[3] || '{0}', lifeCost: m[4] ? num(m[4]) : 0, skip: 1, invert: true }, { kind: 'sacrifice', bind: 'sourceId' });
    return true;
  }
  // Multi-target forms.
  if ((m = c.match(/^Up to (two|three|four|five|\d+|X) target creatures? (?:each )?gets? ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    const bind = `multi${requirements.length}`, max = num(m[1]);
    requirements.push({ kind: 'multi-target', bind, scope: 'target creature', min: 0, max, label: `Choose up to ${m[1]} creatures` });
    effects.push({ kind: 'pump-many', bind, power: Number(m[2]), toughness: Number(m[3]) });
    return true;
  }
  if ((m = c.match(/^Up to (two|three|four|five|\d+|X) target creatures? can'?t block this turn\.?$/i))) {
    const bind = `multi${requirements.length}`, max = num(m[1]);
    requirements.push({ kind: 'multi-target', bind, scope: 'target creature', min: 0, max, label: `Choose up to ${m[1]} creatures` });
    effects.push({ kind: 'restrict-many', bind, restriction: 'cant-block' });
    return true;
  }
  if ((m = c.match(/^Return up to (two|three|four|five|\d+|X) target (creatures|nonland permanents|permanents|artifacts|creatures and\/or [a-z]+) to their owners'? hands\.?$/i))) {
    const bind = `multi${requirements.length}`, max = num(m[1]);
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[2].replace(/s$/, '')}`, min: 0, max, label: `Choose up to ${m[1]} ${m[2]}` });
    effects.push({ kind: 'bounce-many', bind });
    return true;
  }
  if ((m = c.match(/^(Attacking creatures|Blocking creatures|Other creatures you control|Attacking creatures you control|Tapped creatures|Untapped creatures you control|Creatures you control with flying|Creatures without flying) get ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    const w = m[1].toLowerCase();
    const filter = ['creature', /attacking/.test(w) && 'attacking', /blocking/.test(w) && 'blocking', /^tapped/.test(w) && 'tapped', /untapped/.test(w) && 'untapped', /with flying/.test(w) && 'keyword:flying', /without flying/.test(w) && 'nokeyword:flying'].filter(Boolean).join('|');
    effects.push({ kind: 'pump-each', scope: /you control/.test(w) ? 'you' : 'all', filter, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup', exceptSource: /^other/.test(w) });
    return true;
  }
  if ((m = c.match(/^Creatures (without|with) flying can'?t block this turn\.?$/i))) {
    effects.push({ kind: 'restrict-each', filter: `creature|${m[1] === 'without' ? 'nokeyword' : 'keyword'}:flying`, restriction: 'cant-block' });
    return true;
  }
  if ((m = c.match(new RegExp(`^(?:This spell|${selfAny}|[A-Z][^.]*?) deals ${N} damage to each creature (without|with) flying\\.?$`, 'i')))) {
    effects.push({ kind: 'damage-each', amount: num(m[1]), filter: `creature|${m[2] === 'without' ? 'nokeyword' : 'keyword'}:flying`, creatures: 'all', players: null, sourceName });
    return true;
  }
  // "Target creature you control deals damage equal to its power to target creature you don't control." (Ram Through, Bite Down)
  if ((m = c.match(/^Target creature you control deals damage equal to its power to (target creature or planeswalker you don'?t control|target creature you don'?t control|target creature an opponent controls|target creature or planeswalker an opponent controls|another target creature)\.?$/i))) {
    const sourceBind = H.targetRequirement(requirements, 'target creature you control', 'Creature you control');
    const targetBind = H.targetRequirement(requirements, m[1].toLowerCase().replace(/^another /, ''), m[1], { excludeBind: sourceBind });
    effects.push({ kind: 'damage-from-selected-creature', sourceBind, targetBind, amount: { kind: 'source-power' } });
    return true;
  }
  if ((m = c.match(/^(Target (?:attacking|blocking|attacking or blocking|tapped|untapped|nonblack|white|blue|black|red|green|artifact|legendary|token) creature[^.]*?) gets ([+-]\d+)\/([+-]\d+) until end of turn\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'pump', bind, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    return true;
  }
  if ((m = c.match(/^(Target creature[^.]*?) has base power and toughness (\d+)\/(\d+) until end of turn\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'animate', bind, power: m[2], toughness: m[3], addTypes: [], subtypes: [], keywords: [], colors: null, expires: 'cleanup' });
    return true;
  }
  // Tokens: predefined artifact tokens (tapped or not), creature tokens with a quoted ability.
  if ((m = c.match(new RegExp(`^(?:you )?create ${N} (tapped )?(Treasure|Food|Clue|Blood|Map|Gold|Powerstone|Lander|Mutagen|Junk|Shard) tokens?\\.?$`, 'i')))) {
    const name = cap(m[3].toLowerCase());
    effects.push({ kind: 'create-token', amount: num(m[1]), name, typeLine: `Token ${name === 'Shard' ? 'Enchantment' : 'Artifact'} — ${name}`, oracleText: TOKEN_TEXT[name], tapped: !!m[2] });
    return true;
  }
  if ((m = c.match(new RegExp(`^(?:you )?create ${N} (tapped )?(\\d+)\\/(\\d+) ([a-z ]*?)((?:[A-Z][a-z'-]+ )+)(?:artifact )?creature tokens?(?: with ([a-z ,]+?))?(?: and)?(?: with)? "([^"]+)"\\.?$`)))) {
    const colors = m[5].split(/\s+/).map(w => COLOR_OF[w]).filter(Boolean);
    const subtype = m[6].trim();
    effects.push({ kind: 'create-token', amount: num(m[1]), tapped: !!m[2], power: Number(m[3]), toughness: Number(m[4]), name: subtype, typeLine: `Token ${/artifact/i.test(c) ? 'Artifact ' : ''}Creature — ${subtype}`, colors, keywords: H.KEYWORD_LIST(m[7] || '').map(cap), oracleText: m[8] });
    return true;
  }
  // Werewolves: "if no spells were cast last turn, transform this creature." / "if a player cast two or more spells last turn, …"
  if ((m = c.match(new RegExp(`^if (no spells were cast last turn|a player cast (two|three) or more spells last turn), transform (?:${selfAny}|this creature|it)\\.?$`, 'i')))) {
    effects.push({ kind: 'condition', test: 'last-turn-spells', none: /^no/i.test(m[1]), atLeast: m[2] ? num(m[2]) : 0, skip: 1 }, { kind: 'transform', bind: 'sourceId' });
    return true;
  }
  // Animate Dead / Necromancy: the creature card already returned as the Aura resolved (ops.js), so these do nothing more.
  if (/^(?:if it'?s on the battlefield, )?it loses "enchant creature card in (?:a|your) graveyard" and gains "enchant creature put onto the battlefield with this Aura\.?"\.?$/i.test(c)) { effects.push({ kind: 'note', text: 'It now enchants the returned creature.' }); return true; }
  if (/^Return enchanted creature card to the battlefield under your control and attach this Aura to it\.?$/i.test(c)) { effects.push({ kind: 'note', text: 'The creature returned to the battlefield with this Aura attached.' }); return true; }
  if (/^(?:that creature's|enchanted creature's) controller sacrifices (?:it|that creature)\.?$/i.test(c)) { effects.push({ kind: 'sacrifice', bind: '__attached', soft: true }); return true; }
  // Copying spells and abilities.
  if ((m = c.match(/^Copy target (instant or sorcery |instant |sorcery |noncreature |creature |multicolored |red |blue |green |white |black )?spell( you control| an opponent controls| you don't control)?(?:\. You may choose new targets for the copy)?\.?$/i))) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: `target ${(m[1] || '').trim()} spell${m[2] || ''}`.replace(/\s+/g, ' '), spellFilter: m[1] ? m[1].trim().replace(/ or /g, '|') : null, yours: /you control/i.test(m[2] || ''), notYours: /opponent|don't/i.test(m[2] || '') });
    effects.push({ kind: 'copy-stack', bind, retarget: /new targets/i.test(c) });
    return true;
  }
  if ((m = c.match(/^Copy target (activated or triggered|activated|triggered) ability( you control)?\.?(?: You may choose new targets for the copy\.?)?$/i))) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'ability', label: `target ${m[1]} ability${m[2] || ''}`, yours: !!m[2] });
    effects.push({ kind: 'copy-stack', bind, retarget: /new targets/i.test(c) });
    return true;
  }
  if ((m = c.match(/^(?:you may )?copy (it|that spell|that ability|the spell)(?: (twice|three times|X times|that many times))?\.?$/i))) {
    effects.push({ kind: 'copy-stack', bind: 'eventStackId', soft: true, times: !m[2] ? 1 : /twice/i.test(m[2]) ? 2 : /three/i.test(m[2]) ? 3 : /that many/i.test(m[2]) ? { kind: 'binding', bind: 'eventAmount' } : 'X' });
    return true;
  }
  if (/^You may choose new targets for (?:the copy|the copies|them|it|each copy)\.?$/i.test(c)) { effects.push({ kind: 'retarget-flag' }); return true; }
  // "Look at target opponent's hand." / "Target player reveals their hand."
  if ((m = c.match(/^(?:you may )?look at (target opponent|target player|each opponent)'?s? hands?\.?$/i))) {
    const playerBind = /^each/i.test(m[1]) ? null : H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]);
    effects.push({ kind: 'reveal-hand', playerBind, scope: playerBind ? null : 'each-opponent' });
    return true;
  }
  return false;
}

/** Round 3 effect kinds. */
export function applyRound3(game, controllerId, effect, bindings, notes) {
  const controller = playerById(game, controllerId);
  const emit = e => H.emit(bindings, e);
  const name = card => definitionFor(game, card)?.name || 'Permanent';
  const ids = () => (effect.ids || [H.resolveBoundId(effect, bindings)]).filter(Boolean);
  switch (effect.kind) {
    case 'note': notes.push(effect.text || ''); return true;
    case 'copy-of': {
      const id = H.resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, id);
      const d = hit ? definitionFor(game, hit.card) : null;
      if (!d) { notes.push('There is nothing to copy.'); return true; }
      const n = Math.max(0, resolveAmount(game, controllerId, effect.amount ?? 1, bindings));
      const typeLine = effect.nonlegendary ? String(d.typeLine || '').replace(/\bLegendary\s+/i, '') : d.typeLine;
      for (let i = 0; i < n; i++) {
        H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, name: d.name, typeLine: /^Token\b/.test(typeLine) ? typeLine : `Token ${typeLine}`, oracleText: d.oracleText || '', power: d.power, toughness: d.toughness, keywords: d.keywords || [], colors: d.colors || [], tapped: !!effect.tapped }], bindings);
        const made = (bindings.lastCreated || []).slice(-1)[0];
        const token = made && locateCardInGame(game, made)?.card;
        if (token && effect.haste) { token.temporaryEffects = [...(token.temporaryEffects || []), { kind: 'keyword', keyword: 'Haste', enabled: true }]; }
      }
      notes.push(`${controller.displayName} creates ${n === 1 ? 'a token copy' : `${n} token copies`} of ${d.name}.`);
      return true;
    }
    case 'sacrifice-ids':
    case 'exile-ids':
    case 'bounce-ids': {
      for (const id of ids()) {
        const hit = permanentAt(game, id);
        if (!hit) continue;
        const to = effect.kind === 'exile-ids' ? 'exile' : effect.kind === 'bounce-ids' ? 'hand' : 'graveyard';
        moveCard(game, id, to, { moveReason: effect.kind === 'sacrifice-ids' ? 'sacrifice' : null, onEvent: emit });
        notes.push(`${name(hit.card)} is ${to === 'exile' ? 'exiled' : to === 'hand' ? "returned to its owner's hand" : 'sacrificed'}.`);
      }
      return true;
    }
    case 'grant-keyword-recent': {
      const list = bindings.lastCreated?.length ? bindings.lastCreated : bindings.lastMoved?.length ? bindings.lastMoved : [bindings.eventCard].filter(Boolean);
      for (const id of list) {
        const hit = permanentAt(game, id);
        if (!hit) continue;
        hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'keyword', keyword: effect.keyword, enabled: true, ...(effect.expires ? { expires: effect.expires } : {}) }];
        notes.push(`${name(hit.card)} gains ${effect.keyword.toLowerCase()}${effect.expires ? ' until end of turn' : ''}.`);
      }
      return true;
    }
    case 'skip-untap':
    case 'skip-untap-recent': {
      const list = effect.kind === 'skip-untap-recent' ? [...new Set([...(bindings.lastMoved || []), ...[].concat(bindings[effect.bind] || [])])] : ids();
      for (const id of list) {
        const hit = permanentAt(game, id);
        if (!hit) continue;
        hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'skip-next-untap' }];
        notes.push(`${name(hit.card)} doesn't untap during its controller's next untap step.`);
      }
      return true;
    }
    case 'exile-if-dies': {
      const list = effect.bind === '__damaged' ? (bindings.damagedThisWay || []) : ids();
      for (const id of list) {
        const hit = permanentAt(game, id);
        if (hit) hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'exile-if-dies', expires: 'cleanup' }];
      }
      return true;
    }
    case 'to-library': {
      for (const id of ids()) {
        const hit = locateCardInGame(game, id);
        if (!hit || !['battlefield', 'graveyard', 'hand', 'exile'].includes(hit.zone)) continue;
        const owner = playerById(game, hit.card.ownerId);
        moveCard(game, id, 'library', { position: effect.position === 'top' ? 'top' : 'bottom', onEvent: emit });
        if (effect.position === 'shuffle' && owner) H.shuffle(owner.deck.remainingLibrary);
        notes.push(`${name(hit.card)} is put ${effect.position === 'top' ? 'on top of' : effect.position === 'shuffle' ? 'into' : 'on the bottom of'} its owner's library${effect.position === 'shuffle' ? ', which is shuffled' : ''}.`);
      }
      return true;
    }
    case 'graveyard-to-hand-many': {
      for (const id of [].concat(bindings[effect.bind] || [])) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'graveyard') continue;
        moveCard(game, id, 'hand', { onEvent: emit });
        notes.push(`${name(hit.card)} returns to ${controller.displayName}'s hand.`);
      }
      return true;
    }
    case 'hand-to-battlefield-any': {
      const id = bindings[effect.bind];
      if (!id || !controller.deck.hand.some(c => c.instanceId === id)) { notes.push('Nothing was put onto the battlefield.'); return true; }
      moveCard(game, id, 'battlefield', { controllerId, tapped: !!effect.tapped, onEvent: emit });
      bindings.lastMoved = [id];
      notes.push(`${controller.displayName} puts ${name(locateCardInGame(game, id)?.card)} onto the battlefield.`);
      return true;
    }
    case 'pump-many':
    case 'restrict-many':
    case 'bounce-many': {
      for (const id of [].concat(bindings[effect.bind] || [])) {
        const hit = permanentAt(game, id);
        if (!hit) continue;
        if (effect.kind === 'bounce-many') { moveCard(game, id, 'hand', { onEvent: emit }); notes.push(`${name(hit.card)} returns to its owner's hand.`); continue; }
        hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), effect.kind === 'pump-many' ? { kind: 'pt', power: effect.power, toughness: effect.toughness, expires: 'cleanup' } : { kind: 'combat-restriction', restriction: effect.restriction, expires: 'cleanup' }];
        notes.push(`${name(hit.card)} ${effect.kind === 'pump-many' ? `gets ${effect.power >= 0 ? '+' : ''}${effect.power}/${effect.toughness >= 0 ? '+' : ''}${effect.toughness}` : "can't block"} this turn.`);
      }
      return true;
    }
    case 'restrict-each': {
      let n = 0;
      for (const p of game.players) for (const c of p.deck.battlefield || []) if (cardMatchesFilter(game, c, effect.filter)) { c.temporaryEffects = [...(c.temporaryEffects || []), { kind: 'combat-restriction', restriction: effect.restriction, expires: 'cleanup' }]; n++; }
      notes.push(`${n} creature${n === 1 ? '' : 's'} can't block this turn.`);
      return true;
    }
    default:
      return false;
  }
}

/** Round 3 resolve-time choices. */
export function gatherRound3(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'graveyard-multi') {
    const rows = (player.deck.graveyard || []).filter(c => c.instanceId !== bindings.sourceId && cardFitsWords(util.defOf(game, c), req.filter));
    const max = Math.min(req.max === 'X' ? Number(bindings.X || 0) : req.max, rows.length);
    bindings[req.bind] = max ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: `Choose ${req.label}.`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: 0, max })) : [];
    return true;
  }
  return false;
}

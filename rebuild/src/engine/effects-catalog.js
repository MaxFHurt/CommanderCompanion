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
      return false;
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


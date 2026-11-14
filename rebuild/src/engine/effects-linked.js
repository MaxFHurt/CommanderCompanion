// "Exiled with" (Comprehensive Rules 607 linked abilities, 610.3 "until it leaves the battlefield"; 400.7 new object).
// effects.js records, on the object whose effect exiles a card, that card's id (linkedExile) and, on the card, who exiled
// it (exiledBy). These wordings read that record: "return the exiled cards", "put a creature card exiled with this onto the
// battlefield", "target card exiled with this", "you may play the exiled card this turn", "each opponent's permanent until
// this leaves the battlefield". compileLinkedClause is tried by effects-catalog.js (before the older wordings);
// applyLinked runs the effect kinds made here and gatherLinked asks the resolve-time choices.
import { locateCardInGame, moveCard, definitionFor, exiledWith, catalogHelpers as H } from './effects.js';
import { cardFitsWords } from './effects-catalog.js';

const rxCache = new Map();
const rx = (src, flags = 'i') => { const k = `${flags}/${src}`; let r = rxCache.get(k); if (!r) { if (rxCache.size > 3000) rxCache.clear(); rxCache.set(k, (r = new RegExp(src, flags))); } return r; };   // card names make unique patterns: keep the cache small
const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameOf = (game, id) => definitionFor(game, locateCardInGame(game, id)?.card)?.name || 'a card';
const SELF = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|Spacecraft|planeswalker|card|token|Siege|Class))';
// Card words a filter may use (anything else is not understood, so the sentence stays by hand).
const FILTER_WORD = '(?:creature|artifact|enchantment|land|permanent|planeswalker|instant|sorcery|battle|nonland|noncreature|nonartifact|non-Aura|nonbasic|legendary|historic|multicolored|colorless|and/or|and|or|,)';
const FILTER = `((?:${FILTER_WORD} ?)*?)`;
const okFilter = f => !f || /^(?:(?:creature|artifact|enchantment|land|permanent|planeswalker|instant|sorcery|battle|nonland|noncreature|nonartifact|non-aura|nonbasic|legendary|historic|multicolored|colorless|and\/or|and|or|,)\s*)+$/i.test(f.trim());
const cleanFilter = f => String(f || '').trim().replace(/\bnon-aura\b/i, 'nonaura').replace(/\band\/or\b/i, 'or').replace(/\s+and\s+/i, ' or ').replace(/,\s*/g, ' or ');

/** The card ids exiled with the source of this resolution (607.2a), also when it just left the battlefield (last-known). */
export function linkedIds(game, bindings) {
  const sid = bindings.sourceId;
  if (!sid) return [];
  const src = locateCardInGame(game, sid)?.card;
  const ids = [...new Set([...(src?.linkedExile || []), ...(bindings.eventLinked || [])])];
  return ids.filter(id => { const h = locateCardInGame(game, id); return h && h.zone === 'exile' && h.card.exiledBy === sid; });
}
const permanentCard = (game, card) => !/\b(?:Instant|Sorcery)\b/.test(definitionFor(game, card)?.typeLine || '') && !/^Token\b/.test(definitionFor(game, card)?.typeLine || '');
const fits = (game, id, filter) => { const h = locateCardInGame(game, id); return !!h && (!filter || cardFitsWords(definitionFor(game, h.card), filter)); };

// The destination wordings after the cards: where, and under whose control.
function parseDest(s) {
  let m;
  const t = String(s || '').trim().replace(/\.$/, '');
  if ((m = t.match(/^(?:to|onto) the battlefield( tapped)? under (?:its owner'?s?|their owners?'?s?|the control of (?:that card's|their) owners?) control(?: with (?:an?|one) ([a-z+\/0-9-]+) counter on (?:it|them))?$/i))) return { to: 'battlefield', tapped: !!m[1], owner: true, counter: m[2] || null };
  if ((m = t.match(/^onto the battlefield( tapped)? under your control with (two|three|an?|one) additional (\+1\/\+1) counters? on (?:it|them)$/i))) return { to: 'battlefield', tapped: !!m[1], owner: false, counter: m[3], counterN: { two: 2, three: 3, a: 1, an: 1, one: 1 }[m[2].toLowerCase()] };
  if ((m = t.match(/^(?:to|onto) the battlefield( tapped)? under your control(?: with (?:an?|one) ([a-z+\/0-9-]+) counter on (?:it|them))?$/i))) return { to: 'battlefield', tapped: !!m[1], owner: false, counter: m[2] || null };
  if ((m = t.match(/^onto the battlefield( tapped)?$/i))) return { to: 'battlefield', tapped: !!m[1], owner: false, counter: null };
  if (/^(?:to|into) (?:its|their) owners?'?s?'? hands?$/i.test(t) || /^into your hand$/i.test(t)) return { to: 'hand' };
  if (/^(?:to|into) (?:its|their) owners?'?s?'? graveyards?$/i.test(t) || /^into your graveyard$/i.test(t)) return { to: 'graveyard' };
  return null;
}

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileLinkedClause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  const SELFP = `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])}|it)`;
  const LINK = `(?:${SELFP})`;
  let m;
  // "Return the exiled cards to …", "Return all cards exiled with this enchantment to …", "Put each creature card exiled with it onto …".
  if ((m = c.match(rx(`^(?:Then )?(?:return|put) (?:(?:the exiled cards?|(?:all|each)(?: other)? ${FILTER}cards?(?: you own)? exiled with ${LINK}|the cards? exiled with ${LINK}|a card you own exiled with ${LINK}|each card exiled with ${LINK}) )(.+?)\\.?$`)))) {
    const subject = c.match(rx(`^(?:Then )?(?:return|put) (the exiled cards?|(?:all|each)(?: other)? ${FILTER}cards?(?: you own)? exiled with ${LINK}|the cards? exiled with ${LINK}|a card you own exiled with ${LINK}|each card exiled with ${LINK}) `));
    const filter = subject ? (subject[0].match(rx(`(?:all|each)(?: other)? ${FILTER}cards? `)) || [])[1] : '';
    const dest = parseDest(m[m.length - 1]);
    if (dest && okFilter(filter) && !/\ba card you own\b/i.test(subject?.[1] || '')) {
      effects.push({ kind: 'linked-move', select: 'all', filter: cleanFilter(filter), ...dest });
      return true;
    }
    if (dest && /\ba card you own\b/i.test(subject?.[1] || '') && !dest.counter) {
      const bind = `linkedPick${requirements.length}`;
      requirements.push({ kind: 'linked-pick', bind, filter: '', min: 1, label: 'a card exiled with ' + sourceName });
      effects.push({ kind: 'linked-move', select: 'bind', bind, ...dest });
      return true;
    }
  }
  // Pick one: "Put a creature card exiled with this Vehicle onto the battlefield under your control." / "Put a card exiled with this artifact into its owner's graveyard."
  if ((m = c.match(rx(`^(you may )?(?:return|put) (?:a|one) ${FILTER}card( you own)?(?: with mana value (X))? exiled with ${LINK} (.+?)\\.?$`))) && okFilter(m[2])) {
    const dest = parseDest(m[5]);
    if (dest) {
      const bind = `linkedPick${requirements.length}`;
      requirements.push({ kind: 'linked-pick', bind, filter: cleanFilter(m[2]), min: m[1] ? 0 : 1, mvX: !!m[4], label: `${m[2].trim() || ''} card exiled with ${sourceName}`.trim() });
      effects.push({ kind: 'linked-move', select: 'bind', bind, ...dest });
      return true;
    }
  }
  // Target one: "Return target card exiled with Nyla to its owner's hand." / "Put target creature card with mana value X exiled with Shelob onto …"
  if ((m = c.match(rx(`^(?:return|put) target ${FILTER}card( you own)?(?: with mana value (X))? exiled with ${LINK} (.+?)\\.?$`))) && okFilter(m[1])) {
    const dest = parseDest(m[4]);
    if (dest) {
      const bind = `linkedTarget${requirements.length}`;
      requirements.push({ kind: 'linked-target', bind, filter: cleanFilter(m[1]), mvX: !!m[3], label: `${m[1].trim()} card exiled with ${sourceName}`.replace(/\s+/g, ' ').trim() });
      effects.push({ kind: 'linked-move', select: 'bind', bind, ...dest });
      return true;
    }
  }
  // At random: "Choose a card at random exiled with Gorex and put that card into its owner's hand."
  if ((m = c.match(rx(`^choose a ${FILTER}card at random (?:that was )?exiled with ${LINK} and put (?:it|that card) (.+?)\\.?$`))) && okFilter(m[1])) {
    const dest = parseDest(m[2]);
    if (dest) { effects.push({ kind: 'linked-move', select: 'random', filter: cleanFilter(m[1]), ...dest }); return true; }
  }
  // "You may play the exiled card(s) this turn." / "You may play cards exiled with this creature until end of turn."
  if ((m = c.match(rx(`^(?:you may )(play|cast) (?:the exiled cards?|cards? exiled with ${LINK}) (this turn|until the end of your next turn|until end of turn)\\.?$`)))) {
    effects.push({ kind: 'linked-permit', castOnly: /^cast/i.test(m[1]), until: /next turn/i.test(m[2]) ? 'next-turn' : 'turn' });
    return true;
  }
  // "You may cast an instant or sorcery spell from among cards exiled with this [without paying its mana cost]." / "Until end of turn, you may cast a creature spell from among cards exiled with this artifact."
  if ((m = c.match(rx(`^(?:until end of turn, )?you may (cast|play) (?:a|an|one) ${FILTER}(spell|card)s? from among cards exiled with ${LINK}( without paying its mana cost)?\\.?$`))) && okFilter(m[2])) {
    if (m[4]) {
      const bind = `linkedPick${requirements.length}`;
      requirements.push({ kind: 'linked-pick', bind, filter: cleanFilter(m[2]), min: 0, label: `${m[2].trim()} ${m[3]} exiled with ${sourceName}`.replace(/\s+/g, ' ').trim() });
      effects.push({ kind: 'play-exiled', bind });
    } else effects.push({ kind: 'linked-permit', castOnly: /^cast/i.test(m[1]), until: 'turn', filter: cleanFilter(m[2]), one: true });
    return true;
  }
  // "For each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield."
  if ((m = c.match(rx(`^for each opponent, exile up to one target (nonland permanent|creature|permanent|artifact|enchantment|creature or planeswalker) that player controls until ${SELFP} leaves the battlefield\\.?$`)))) {
    const bind = `perOpponent${requirements.length}`;
    requirements.push({ kind: 'per-opponent-up-to-one', bind, filter: m[1].toLowerCase(), label: `Up to one ${m[1]} for each opponent` });
    effects.push({ kind: 'linked-exile-selected', bind, untilLeaves: true });
    return true;
  }
  return false;
}

/** Run the effect kinds made above. Returns true when handled. */
export function applyLinked(game, controllerId, effect, bindings, notes) {
  const controller = (game.players || []).find(p => p.playerId === controllerId);
  const emit = e => H.emit(bindings, e);
  switch (effect.kind) {
    case 'linked-move': {
      let ids;
      if (effect.select === 'bind') ids = [].concat(bindings[effect.bind] || []).filter(Boolean);
      else {
        ids = linkedIds(game, bindings).filter(id => fits(game, id, effect.filter));
        if (effect.select === 'random' && ids.length) ids = [ids[Math.floor(Math.random() * ids.length)]];
      }
      let moved = 0;
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'exile') continue;
        if (effect.to === 'battlefield' && !permanentCard(game, hit.card)) { notes.push(`${nameOf(game, id)} is not a permanent card and stays exiled.`); continue; }
        const owner = hit.card.ownerId || hit.player?.playerId;
        const res = moveCard(game, id, effect.to, { controllerId: effect.to === 'battlefield' ? (effect.owner ? owner : controllerId) : null, tapped: !!effect.tapped, onEvent: emit });
        if (effect.counter && effect.to === 'battlefield') H.addCounter(res.card, effect.counter, effect.counterN || 1);
        moved++;
        notes.push(`${nameOf(game, id)} ${effect.to === 'battlefield' ? `enters the battlefield${effect.owner ? " under its owner's control" : ` under ${controller?.displayName || 'your'} control`}` : effect.to === 'hand' ? "returns to its owner's hand" : 'is put into its owner’s graveyard'}.`);
      }
      if (!moved && !ids.length) notes.push('There are no cards exiled with it.');
      return true;
    }
    case 'linked-permit': {
      const ids = (bindings.lastExiled?.length && !effect.filter ? bindings.lastExiled : linkedIds(game, bindings)).filter(id => locateCardInGame(game, id)?.zone === 'exile' && fits(game, id, effect.filter));
      for (const id of ids) locateCardInGame(game, id).card.playPermission = { playerId: controllerId, until: effect.until, grantedTurn: game.turnNumber, castOnly: !!effect.castOnly, free: false };
      notes.push(`${controller?.displayName || 'You'} may ${effect.castOnly ? 'cast' : 'play'} ${ids.length === 1 ? nameOf(game, ids[0]) : 'the exiled cards'} ${effect.until === 'next-turn' ? 'until the end of your next turn' : 'this turn'}.`);
      return true;
    }
    case 'linked-exile-selected': {
      const raw = bindings[effect.bind] || {};
      const src = locateCardInGame(game, bindings.sourceId);
      for (const id of Array.isArray(raw) ? raw : Object.values(raw)) {
        if (!id) continue;
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        if (effect.untilLeaves && src?.zone === 'battlefield') src.card.untilLeavesExile = [...(src.card.untilLeavesExile || []), id];
        moveCard(game, id, 'exile', { onEvent: emit });
        notes.push(`${nameOf(game, id)} is exiled${effect.untilLeaves ? ' until this leaves the battlefield' : ''}.`);
      }
      return true;
    }
    default: return false;
  }
}

/** Resolve-time choice among the cards exiled with the source. Returns true when handled. */
export function gatherLinked(game, ctx, req, bindings, ask, key, title, base, util) {
  if (req.kind !== 'linked-pick') return false;
  const rows = linkedIds(game, bindings).map(id => locateCardInGame(game, id)).filter(h => h && (!req.filter || cardFitsWords(util.defOf(game, h.card), req.filter))
    && (!req.mvX || Number(util.defOf(game, h.card)?.manaValue ?? util.defOf(game, h.card)?.cmc ?? 0) === Number(bindings.X || 0)));
  if (!rows.length) { bindings[req.bind] = null; return true; }
  const options = rows.map(h => util.cardOption(game, h.card, h.player, 'Exiled with ' + ctx.sourceName));
  bindings[req.bind] = ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: `Choose ${/^[aeiou]/i.test(req.label) ? 'an' : 'a'} ${req.label}${req.min ? '' : ' (or none)'}.`, options, allowNone: !req.min, noneLabel: 'None' }));
  return true;
}

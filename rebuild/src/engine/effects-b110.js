// Card wordings added in build 110 (rules long tail, batch 4). Same hook points as effects-b101.js:
// compileB110Clause(c, ctx) is tried right after the build-101 wordings; applyB110 runs the effect kinds made here and
// gatherB110 asks the requirement kinds made here. Most wordings are read as an instruction the game already runs.
import { numberFromText, locateCardInGame, definitionFor, resolveAmount, catalogHelpers as H } from './effects.js';
import { effectivePower, effectiveToughness, pruneWhileTapped } from './combat.js';

const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const ok = inner => inner && !inner.unsupported.length && inner.effects.length;
const rxCache = new Map();
const rx = (src, flags = 'i') => { const k = `${flags}/${src}`; let r = rxCache.get(k); if (!r) rxCache.set(k, (r = new RegExp(src, flags))); return r; };
const SELF = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|Spacecraft|planeswalker|card|token))';

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB110Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SELFP = `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])})`;
  const sub = text => {
    let r = H.compileSingleClause(ctx.restore(text), { sourceName });
    if (!ok(r)) { const whole = H.compileEffectText(ctx.restore(text), { sourceName }); r = whole.supported ? { effects: whole.effects, requirements: whole.requirements, unsupported: [] } : r; }
    return ok(r) ? r : null;
  };
  const take = r => { effects.push(...r.effects); requirements.push(...r.requirements); return true; };
  const pronounBind = s => rx(`^${SELF}$`).test(s) ? 'sourceId' : /^(?:it|he|she|they)$/i.test(s) ? 'b101It' : 'b101That';
  let m;

  // --- "It / That creature / Target creature doesn't untap during its controller's untap step for as long as ~ remains tapped" (Ice Floe, Thalakos Dreamsower)
  // / "… for as long as you control ~" (Merchant Raiders): a lock that ends when the condition stops.
  if ((m = c.match(rx(`^(it|that (?:creature|land|permanent|artifact)|target [a-z ]+?) doesn'?t untap during (?:its|their) controller'?s untap step for as long as (${SELFP} remains tapped|you control ${SELFP})\\.?$`)))) {
    let bind;
    if (/^target/i.test(m[1])) { const r = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]); bind = r; } else bind = pronounBind(m[1]);
    effects.push({ kind: 'b110-lock-untap', bind, mode: /remains tapped/i.test(m[2]) ? 'tapped' : 'control' });
    return true;
  }
  // --- "Target creature an opponent controls doesn't untap during its controller's next untap step." (lowercase after a trigger; lands, artifacts)
  if ((m = c.match(rx(`^(that (?:land|artifact|permanent)|target (?:land|artifact|creature|permanent)(?: [a-z ']+? controls)?) doesn'?t untap during its controller'?s next untap step\\.?$`)))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : 'b101That';
    effects.push({ kind: 'skip-untap', bind });
    return true;
  }
  // --- "Put a +1/+1 counter on each other Dragon creature you control." (creature type + "creature"): read without the extra noun.
  if ((m = c.match(/^(Put .+ counters? on each (?:other )?[A-Z][a-z]+) creature( you control)\.?$/))) {
    const r = sub(`${m[1]}${m[2]}.`);
    if (r) return take(r);
  }
  // --- "That creature deals damage equal to its power to ~." (Tahngarth): the creature fights back at the source only.
  if ((m = c.match(rx(`^(that creature|it) deals damage equal to its power to (${SELFP})\\.?$`)))) {
    effects.push({ kind: 'damage-from-selected-creature', sourceBind: pronounBind(m[1]), targetBind: 'sourceId', amount: { kind: 'source-power' } });
    return true;
  }
  // --- "Detain target creature an opponent controls." (Azorius): until your next turn it can't attack or block and its activated abilities can't be activated.
  if ((m = c.match(/^detain (target [a-z ]+?(?: (?:an opponent|you don'?t|that player) controls)?|that creature|it)\.?$/i))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : 'b101That';
    effects.push({ kind: 'combat-restriction', bind, restriction: 'cant-attack-or-block', expires: 'your-next-turn' }, { kind: 'b110-detain', bind });
    return true;
  }
  // --- "Put target card from your graveyard on top of your library." (Reclaim, Salvage)
  if ((m = c.match(/^put target ([a-z ]+?)?card from your graveyard on top of your library\.?$/i))) {
    const bind = `grave${requirements.length}`, what = `${(m[1] || '').trim()} card`.trim();
    requirements.push({ kind: 'graveyard-target', bind, scope: `target ${what} in your graveyard`, label: `target ${what} in your graveyard` });
    effects.push({ kind: 'move-zone', bind, to: 'library', position: 'top' });
    return true;
  }
  // --- "Target opponent exiles a card from their hand / target player exiles a card from their graveyard": that player chooses their own card.
  if ((m = c.match(rx(`^(target opponent|target player|that player) exiles? ${N} ([a-z ]+?)?cards? from their (hand|graveyard)\\.?$`)))) {
    const who = /^that/i.test(m[1]) ? 'eventPlayer' : `player${requirements.length}`, cards = `ownPick${requirements.length + 1}`;
    if (!/^that/i.test(m[1])) requirements.push({ kind: 'player', bind: who, scope: /opponent/i.test(m[1]) ? 'opponent' : 'player', label: m[1].toLowerCase() });
    requirements.push({ kind: 'b110-own-pick', bind: cards, playerBind: who, zone: m[4].toLowerCase(), filter: (m[3] || '').trim(), amount: num(m[2]) });
    effects.push({ kind: 'b110-own-move', cardsBind: cards, playerBind: who, to: 'exile' });
    return true;
  }
  // --- "Target opponent exiles the top card of their library." (Knacksaw Clique)
  if ((m = c.match(/^(target opponent|target player|that player) exiles? the top card of their library\.?$/i))) {
    const who = /^that/i.test(m[1]) ? 'eventPlayer' : `player${requirements.length}`;
    if (!/^that/i.test(m[1])) requirements.push({ kind: 'player', bind: who, scope: /opponent/i.test(m[1]) ? 'opponent' : 'player', label: m[1].toLowerCase() });
    effects.push({ kind: 'b110-exile-top', playerBind: who });
    return true;
  }
  // --- "Target creature gets +1/+1 (and has vigilance) for as long as ~ remains tapped." (Tawnos's Weaponry, Spirit Shield, Hisoka's Guard):
  // read as the same effect "until end of turn", then each of its temporary effects is tied to the source staying tapped.
  if ((m = c.match(rx(`^(.+?) for as long as (?:${SELFP}) remains tapped\\.?$`))) && !/\bdoesn'?t untap\b/i.test(m[1])) {
    const text = /\bgets?\b/i.test(m[1]) ? m[1].replace(/ and has /i, ' and gains ') : m[1].replace(/\bhas\b/i, 'gains');
    const r = sub(`${text} until end of turn.`);
    if (r && r.effects.length && r.effects.every(e => ['pump', 'pump-each', 'grant-keyword', 'grant-keyword-each'].includes(e.kind) && (e.expires === 'cleanup' || e.expires == null))) {
      for (const e of r.effects) e.expires = 'b110-tapped';
      return take({ effects: [...r.effects, { kind: 'b110-while-tapped' }], requirements: r.requirements });
    }
  }
  // --- Life totals: "Exchange life totals with target opponent." / "Target player's life total becomes 10." / "Players can't gain life this turn."
  if (/^exchange life totals with target opponent\.?$/i.test(c)) { const r = sub("Exchange your life total with target opponent's life total."); if (r) return take(r); }
  if ((m = c.match(/^(target player|target opponent)'s life total becomes (\d+|one|two|three|five|ten|twenty|forty)\.?$/i))) {
    const bind = `player${requirements.length}`;
    requirements.push({ kind: 'player', bind, scope: /opponent/i.test(m[1]) ? 'opponent' : 'player', label: m[1].toLowerCase() });
    effects.push({ kind: 'set-life', scope: 'target', bind, amount: num(m[2]) });
    return true;
  }
  if (/^players can'?t gain life this turn\.?$/i.test(c)) { effects.push({ kind: 'b110-no-lifegain' }); return true; }
  // --- Combat restrictions on whole groups.
  if (/^creatures your opponents control can'?t block this turn\.?$/i.test(c)) { effects.push({ kind: 'restrict-each', filter: 'creature', opponentsOf: true, restriction: 'cant-block' }); return true; }
  if ((m = c.match(/^(creatures|attacking creatures) you control can'?t be blocked this turn\.?$/i))) { effects.push({ kind: 'b110-yours-unblockable', attackingOnly: /^attacking/i.test(m[1]) }); return true; }
  // --- Hands and libraries.
  if ((m = c.match(/^(each player|each opponent) discards their hand\.?$/i))) { effects.push({ kind: 'discard-hand', scope: /player/i.test(m[1]) ? 'each-player' : 'each-opponent' }); return true; }
  if ((m = c.match(/^put all (creatures|artifacts|enchantments|lands|nonland permanents|permanents) on the bottom of their owners'? libraries\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: m[1].toLowerCase().replace(/^nonland permanents$/, 'permanent|non:land').replace(/s$/, ''), to: 'library' });
    return true;
  }
  if ((m = c.match(/^(Destroy|Exile) all (creatures|artifacts|enchantments|permanents|lands) with mana value (\d+) or (less|greater)\.?$/))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: `${m[2].replace(/s$/, '')}|mv${m[4] === 'less' ? '<=' : '>='}${m[3]}`, to: m[1] === 'Destroy' ? 'graveyard' : 'exile', ...(m[1] === 'Destroy' ? { destroy: true } : {}) });
    return true;
  }
  if ((m = c.match(/^return all (artifact|creature|enchantment|land) and (artifact|creature|enchantment|land) cards from your graveyard to (the battlefield|your hand)\.?$/i))) {
    effects.push({ kind: 'graveyard-zone-each', scope: 'you', filter: `${m[1].toLowerCase()} or ${m[2].toLowerCase()}`, to: /battlefield/i.test(m[3]) ? 'battlefield' : 'hand', ...(/battlefield/i.test(m[3]) ? { tapped: false } : {}) });
    return true;
  }
  if ((m = c.match(rx(`^you may play up to ${N} additional lands this turn\\.?$`)))) { effects.push({ kind: 'extra-land-play', amount: num(m[1]) }); return true; }
  // --- "Each creature deals damage to itself equal to its power." (Wave of Reckoning)
  if (/^each creature deals damage to itself equal to its power\.?$/i.test(c)) { effects.push({ kind: 'b110-self-damage' }); return true; }
  // --- "Tap up to one target creature and put a stun counter on it." / "Exile up to one target card from a graveyard and create a Food token." (two instructions; the target
  // description must not run on into the second one)
  if ((m = c.match(/^(Tap (?:up to one )?target [a-z ]+?(?: (?:an opponent|you don'?t|your opponents?) controls?)?) and put (a|an|one|two|three|\d+) ([+\-\/\da-z]+) counters? on (?:it|that creature)\.?$/i))) {
    const r = sub(`${m[1]}.`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && r.requirements.length === 1) {
      effects.push(...r.effects, { kind: 'counter', bind: t.bind, counter: m[3].toLowerCase(), amount: num(m[2]), ...(t.optional ? { optionalTarget: true } : {}) });
      requirements.push(...r.requirements);
      return true;
    }
  }
  if ((m = c.match(/^(Exile (?:up to one )?target [a-z ]*card from a graveyard) and ((?:create (?:a|an|one|two|\d+) [A-Za-z ]*?(?:Food|Treasure|Clue|Blood) tokens?|put (?:a|an|one|two|\d+) [+\-\/\da-z]+ counters? on (?:this [a-z]+|SELFNAME)|you gain \d+ life|draw a card))\.?$/i))) {
    const a = sub(`${m[1]}.`), b = sub(`${cap(m[2])}.`);
    if (a && b && !b.requirements.length) return take({ effects: [...a.effects, ...b.effects], requirements: a.requirements });
  }
  // --- "Counter target spell that targets you." (Dawn Charm) / "that targets a creature" (Confound) / "with mana value 4 or greater" (Disdainful Stroke)
  if ((m = c.match(/^Counter target spell (?:that targets (you|a creature|a permanent you control)|with mana value (\d+) or greater)\.?$/i))) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: 'spell', label: `target spell ${m[1] ? `that targets ${m[1]}` : `with mana value ${m[2]} or greater`}`, ...(m[1] ? { targetsFilter: m[1].toLowerCase() === 'you' ? 'you' : m[1].toLowerCase() === 'a creature' ? 'creature' : 'yours' } : { spellFilter: `mv>=${m[2]}` }) });
    effects.push({ kind: 'counter-spell', bind });
    return true;
  }
  return false;
}

/** Sentences read together (effects-catalog.js calls this after the build-101 ones). Returns { part, consumed } or null. */
export function compileB110Sequence(clauses, i, { sourceName, parts = [] }) {
  const clean = x => String(x || '').replace(/\([^()]*\)/g, '').trim();
  const c0 = clean(clauses[i]);
  let m, mm;
  const sub = text => {
    let r = H.compileSingleClause(text, { sourceName });
    if (!ok(r)) { const whole = H.compileEffectText(text, { sourceName }); r = whole.supported ? { effects: whole.effects, requirements: whole.requirements, unsupported: [] } : r; }
    return ok(r) && !r.requirements.length ? r : null;
  };
  // --- "Put a quest counter on this enchantment. Then if it has four or more quest counters on it, draw a card." / "Then if she has nine or more time counters on her, sacrifice her." (Ordeal of Nylea, Kes)
  // "it" is the permanent the counter just went onto (or the trigger's card when no counter was put in this ability).
  if ((m = c0.match(/^(?:Then )?if (it|she|he|they) (?:has|have) (\w+) or more ([a-z+\/\d-]+) counters? on (?:it|her|him|them), (.+?)\.?$/i)) && !/^(?:When|If) you do\b/i.test(clean(clauses[i + 1]))) {
    const prior = parts.flatMap(p => p.effects || []).filter(e => e.kind === 'counter' && e.bind).pop();
    const bind = prior ? prior.bind : 'eventCard', n = numberFromText(m[2]) ?? Number(m[2]);
    const body = m[4].replace(/\.$/, '');
    let eff = null;
    if (/^sacrifice (?:it|her|him|them)$/i.test(body)) eff = [{ kind: 'sacrifice', bind }];
    else if (/^sacrifice (?:this (?:creature|permanent|artifact|enchantment|Aura|land)|SELFNAME)$/i.test(body) || (body.toLowerCase().startsWith('sacrifice ') && body.slice(10).toLowerCase() === String(sourceName).toLowerCase())) eff = [{ kind: 'sacrifice', bind: 'sourceId' }];
    else if ((mm = body.match(rx(`^put ${N} ([a-z+\\/\\d-]+) counters? on (?:it|her|him)$`)))) eff = [{ kind: 'counter', bind, counter: mm[2], amount: num(mm[1]) }];
    else if (!/\b(?:it|its|that creature|them|her|him)\b/i.test(body)) { const r = sub(`${body.charAt(0).toUpperCase()}${body.slice(1)}.`); if (r) eff = r.effects; }
    if (eff && Number.isFinite(n)) return { part: { effects: [{ kind: 'condition', test: 'b110-event-counters', bind, min: n, counter: m[3], skip: eff.length }, ...eff], requirements: [], unsupported: [] }, consumed: 1 };
  }
  // --- "If you attacked this turn, you may draw a card. If you do, discard a card." (Marauding Looter): the condition covers both sentences.
  if ((m = c0.match(/^if (.+?), you may (.+?)\.?$/i)) && (mm = clean(clauses[i + 1]).match(/^If you do, (.+?)\.?$/i))) {
    const probe = H.compileEffectText(`If ${m[1]}, draw a card.`, { sourceName });
    const condEff = probe.supported && probe.effects[0]?.kind === 'condition' ? probe.effects[0] : null;
    const whole = H.compileEffectText(`You may ${m[2]}. If you do, ${mm[1]}.`, { sourceName });
    if (condEff && whole.supported && whole.effects.length) {
      const { skip, ...cond } = condEff;
      return { part: { effects: [{ ...cond, skip: whole.effects.length }, ...whole.effects], requirements: [...probe.requirements, ...whole.requirements], unsupported: [] }, consumed: 2 };
    }
    return { part: { effects: [], requirements: [], unsupported: [`${clean(clauses[i])} ${clean(clauses[i + 1])}`] }, consumed: 2 };
  }
  // --- "Reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card." (Thrasios, Track Down, Llanowar Empath)
  if ((m = c0.match(/^(you may )?reveal the top card of your library\.?$/i))) {
    const cond = clean(clauses[i + 1]).match(/^If it(?:'s| is) an? ((?:[a-z-]+ )?(?:land|creature|permanent|nonland|artifact|enchantment|instant|sorcery)(?: or (?:[a-z-]+ )?(?:land|creature|permanent|nonland|artifact|enchantment|instant|sorcery))*) card, (.+?)\.?$/i);
    if (!cond) return null;
    const body = text => {
      const t = text.replace(/\.$/, '');
      if (/^put it into your hand$/i.test(t)) return { effects: [{ kind: 'move-zone', bind: 'revealedTop', to: 'hand' }] };
      if (/^put it onto the battlefield( tapped)?$/i.test(t)) return { effects: [{ kind: 'move-zone', bind: 'revealedTop', to: 'battlefield', tapped: /tapped/i.test(t) }] };
      if (/\b(?:it|its|that card)\b/i.test(t)) return null;
      const r = sub(`${t.charAt(0).toUpperCase()}${t.slice(1)}.`);
      return r ? { effects: r.effects } : null;
    };
    const yes = body(cond[2]);
    if (!yes) return null;
    const words = cond[1].toLowerCase().split(/ or /);
    const out = [];
    const reqs = [];
    let consumed = 2;
    if (m[1]) { reqs.push({ kind: 'yes-no', bind: `revealMay${i}`, label: 'Reveal the top card of your library?' }); }
    out.push({ kind: 'b110-reveal-top', ...(m[1] ? { mayBind: `revealMay${i}` } : {}) });
    out.push({ kind: 'condition', test: 'b110-revealed-type', words, skip: yes.effects.length }, ...yes.effects);
    const other = clean(clauses[i + 2]).match(/^Otherwise, (.+?)\.?$/i);
    if (other) {
      if (m[1]) return null;
      const no = body(other[1]);
      if (!no) return null;
      out.push({ kind: 'condition', test: 'b110-revealed-type', words, negate: true, skip: no.effects.length }, ...no.effects);
      consumed = 3;
    }
    return { part: { effects: out, requirements: reqs, unsupported: [] }, consumed };
  }
  return null;
}

export function applyB110(game, controllerId, effect, bindings, notes) {
  switch (effect.kind) {
    case 'b110-lock-untap': {
      const hit = locateCardInGame(game, bindings[effect.bind] || effect.bind), src = locateCardInGame(game, bindings.sourceId);
      if (!hit || hit.zone !== 'battlefield') { notes.push('It is no longer on the battlefield.'); return true; }
      if (!src || src.zone !== 'battlefield') { notes.push('The source has left the battlefield, so nothing is locked.'); return true; }
      if (effect.mode === 'tapped' && !src.card.tapped) { notes.push('The source is not tapped, so nothing is locked.'); return true; }
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'no-untap-while', sourceId: src.card.instanceId, mode: effect.mode, controllerId: src.card.controllerId || controllerId }];
      notes.push(`${definitionFor(game, hit.card)?.name || 'It'} doesn't untap for as long as ${definitionFor(game, src.card)?.name || 'the source'} ${effect.mode === 'tapped' ? 'remains tapped' : 'is controlled by you'}.`);
      return true;
    }
    case 'b110-detain': {
      const hit = locateCardInGame(game, bindings[effect.bind] || effect.bind);
      if (!hit || hit.zone !== 'battlefield') return true;
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'detained', expires: `turn-start:${controllerId}` }];
      notes.push(`${definitionFor(game, hit.card)?.name || 'It'} is detained until your next turn.`);
      return true;
    }
    case 'b110-own-move': {
      const ids = [].concat(bindings[effect.cardsBind] || []);
      for (const id of ids) notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'move-zone', targetId: id, to: effect.to }], bindings));
      bindings.lastMoved = ids;
      if (!ids.length) notes.push('No card is chosen.');
      return true;
    }
    case 'b110-exile-top': {
      const q = playerById(game, bindings[effect.playerBind]), top = q?.deck?.remainingLibrary?.[0];
      if (!top) { notes.push('The library is empty.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'move-zone', targetId: top.instanceId, to: 'exile' }], bindings));
      bindings.lastMoved = [top.instanceId];
      return true;
    }
    case 'b110-while-tapped': {
      // Tie the effects just made (marked 'b110-tapped') to the source remaining tapped.
      const src = locateCardInGame(game, bindings.sourceId);
      game.whileTapped = game.whileTapped || [];
      for (const p of game.players || []) for (const c of p.deck?.battlefield || [])
        for (const e of c.temporaryEffects || []) if (e?.expires === 'b110-tapped' && !e.whileTappedOf) e.whileTappedOf = src?.card?.instanceId || bindings.sourceId;
      if (!game.whileTapped.some(r => r.sourceId === (src?.card?.instanceId || bindings.sourceId))) game.whileTapped.push({ sourceId: src?.card?.instanceId || bindings.sourceId });
      pruneWhileTapped(game);
      return true;
    }
    case 'b110-no-lifegain':
      game.noLifeGain = { turn: game.turnNumber };
      notes.push('Players can’t gain life this turn.');
      return true;
    case 'b110-yours-unblockable': {
      let n = 0;
      const me = playerById(game, controllerId);
      for (const c of me?.deck?.battlefield || []) {
        if (!H.cardMatchesFilter(game, c, effect.attackingOnly ? 'creature|attacking' : 'creature')) continue;
        c.temporaryEffects = [...(c.temporaryEffects || []), { kind: 'combat-restriction', restriction: 'cant-be-blocked', expires: 'cleanup' }]; n++;
      }
      notes.push(`${n} creature${n === 1 ? '' : 's'} can’t be blocked this turn.`);
      return true;
    }
    case 'b110-self-damage': {
      const ids = (game.players || []).flatMap(p => (p.deck?.battlefield || []).filter(c => H.cardMatchesFilter(game, c, 'creature')).map(c => c.instanceId));
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'battlefield') continue;
        notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage-from-selected-creature', sourceId: id, targetId: id }], bindings));
      }
      return true;
    }
    case 'b110-reveal-top': {
      const me = playerById(game, controllerId), top = me?.deck?.remainingLibrary?.[0];
      delete bindings.revealedTop;
      if (effect.mayBind && bindings[effect.mayBind] !== true && bindings[effect.mayBind] !== 'yes') { notes.push('The top card is not revealed.'); return true; }
      if (!top) { notes.push('The library is empty.'); return true; }
      bindings.revealedTop = top.instanceId;
      notes.push(`${me.displayName} reveals ${definitionFor(game, top)?.name || 'a card'}.`);
      return true;
    }
    default: return false;
  }
}

export function gatherB110(game, ctx, req, bindings, ask, key, title, base, util) {
  if (req.kind === 'b110-own-pick') {
    // The named player chooses their own card, on their own device.
    const q = playerById(game, bindings[req.playerBind]);
    if (!q || q.eliminated) { bindings[req.bind] = []; return true; }
    const zone = req.zone === 'hand' ? q.deck.hand || [] : q.deck.graveyard || [];
    const rows = zone.filter(card => !req.filter || new RegExp(`\\b${req.filter}\\b`, 'i').test(util.defOf(game, card)?.typeLine || ''));
    const n = Math.min(Number(req.amount) || 1, rows.length);
    bindings[req.bind] = !n ? [] : rows.length === n && req.zone === 'graveyard' ? rows.map(c => c.instanceId)
      : ask(key, () => ({ ...base, playerId: q.playerId, cancellable: false, kind: 'choose-many', private: req.zone === 'hand', title: `${ctx.sourceName} — ${q.displayName}`, prompt: `Choose ${n} card${n === 1 ? '' : 's'} from your ${req.zone} to exile.`, options: rows.map(card => util.cardOption(game, card, q, `Your ${req.zone}`)), min: n, max: n }));
    return true;
  }
  return false;
}

const cnt = w => numberFromText(w) ?? Number(w);
/** "If" conditions made here (parseCondition in effects.js calls this after the build-49 ones). */
export function parseConditionB110(t) {
  let m;
  // "it was kicked" (the permanent that entered), "it wasn't cast"
  if ((m = t.match(/^(?:it|this creature|this permanent|this artifact|this enchantment) (was|wasn'?t|were not) (kicked|cast)$/i))) return { test: 'b110-card-flag', flag: /kicked/i.test(m[2]) ? 'kicked' : 'wasCast', not: !/^was$/i.test(m[1]) };
  if ((m = t.match(/^there are (\w+) or more ([a-z+\/\d-]+) counters on (?:it|this [a-z]+|[A-Z][A-Za-z ,'-]+)$/i)) && !/^(?:creature|artifact|land|card|cards)$/i.test(m[2])) return { test: 'b110-source-counters', min: cnt(m[1]), counter: m[2] };
  if ((m = t.match(/^there are (\w+) or more (creature|artifact|land|instant|sorcery|enchantment|planeswalker|permanent) cards in your graveyard$/i))) return { test: 'b110-gy-type', min: cnt(m[1]), type: m[2].toLowerCase() };
  if ((m = t.match(/^there are (\w+) or more card types among cards in your graveyard$/i))) return { test: 'b110-gy-types', min: cnt(m[1]) };
  if (/^you attacked this turn$/i.test(t)) return { test: 'b110-amount', expr: { kind: 'b101-tally', what: 'attacked' }, min: 1 };
  if (/^you descended this turn$/i.test(t)) return { test: 'b110-amount', expr: { kind: 'b101-tally', what: 'descended' }, min: 1 };
  return null;
}
export function conditionHoldsB110(game, controllerId, effect, bindings = {}) {
  switch (effect.test) {
    case 'b110-event-counters': return Number(locateCardInGame(game, bindings[effect.bind] || effect.bind || bindings.eventCard || bindings.sourceId)?.card?.counters?.[effect.counter] || 0) >= effect.min;
    case 'b110-revealed-type': {
      const hit = bindings.revealedTop && locateCardInGame(game, bindings.revealedTop), t = String(definitionFor(game, hit?.card)?.typeLine || '');
      if (!hit) return false;
      const fits = w => w === 'permanent' ? !/\b(?:Instant|Sorcery)\b/.test(t) : w === 'nonland' ? !/\bLand\b/.test(t) : w === 'basic land' ? /\bBasic\b.*\bLand\b/.test(t) : new RegExp(`\\b${w}\\b`, 'i').test(t);
      return effect.words.some(fits);
    }
    case 'b110-source-counters': return Number(locateCardInGame(game, bindings.sourceId)?.card?.counters?.[effect.counter] || 0) >= effect.min;
    case 'b110-gy-type': {
      const me = (game.players || []).find(p => p.playerId === controllerId);
      return (me?.deck?.graveyard || []).filter(c => effect.type === 'permanent' ? !/\b(?:Instant|Sorcery)\b/.test(definitionFor(game, c)?.typeLine || '') : new RegExp(`\\b${effect.type}\\b`, 'i').test(definitionFor(game, c)?.typeLine || '')).length >= effect.min;
    }
    case 'b110-gy-types': {
      const me = (game.players || []).find(p => p.playerId === controllerId), kinds = new Set();
      for (const c of me?.deck?.graveyard || []) for (const w of ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery', 'Kindred']) if (new RegExp(`\\b${w}\\b`).test(String(definitionFor(game, c)?.typeLine || '').split('—')[0])) kinds.add(w);
      return kinds.size >= effect.min;
    }
    case 'b110-card-flag': { const c = locateCardInGame(game, bindings.eventCard || bindings.sourceId)?.card; const v = !!c?.[effect.flag]; return effect.not ? !v : v; }
    case 'b110-amount': return Number(resolveAmount(game, controllerId, effect.expr, bindings) || 0) >= effect.min;
    default: return undefined;
  }
}

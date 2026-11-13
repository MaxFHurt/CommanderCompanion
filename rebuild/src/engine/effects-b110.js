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
  return false;
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
      if (!ids.length) notes.push('No card is chosen.');
      return true;
    }
    case 'b110-exile-top': {
      const q = playerById(game, bindings[effect.playerBind]), top = q?.deck?.remainingLibrary?.[0];
      if (!top) { notes.push('The library is empty.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'move-zone', targetId: top.instanceId, to: 'exile' }], bindings));
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
  if ((m = t.match(/^it has (\w+) or more ([a-z+\/\d-]+) counters? on it$/i))) return { test: 'b110-event-counters', min: cnt(m[1]), counter: m[2] };
  if (/^you attacked this turn$/i.test(t)) return { test: 'b110-amount', expr: { kind: 'b101-tally', what: 'attacked' }, min: 1 };
  if (/^you descended this turn$/i.test(t)) return { test: 'b110-amount', expr: { kind: 'b101-tally', what: 'descended' }, min: 1 };
  return null;
}
export function conditionHoldsB110(game, controllerId, effect, bindings = {}) {
  switch (effect.test) {
    case 'b110-event-counters': return Number(locateCardInGame(game, bindings.eventCard || bindings.sourceId)?.card?.counters?.[effect.counter] || 0) >= effect.min;
    case 'b110-amount': return Number(resolveAmount(game, controllerId, effect.expr, bindings) || 0) >= effect.min;
    default: return undefined;
  }
}

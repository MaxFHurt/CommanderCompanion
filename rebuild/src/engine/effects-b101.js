// Card wordings added in build 101 (the long tail, most-played first).
// compileB101Clause(c, ctx) is tried by effects-catalog.js after the build-49 wordings; compileB101Sequence sees the
// sentences around it; applyB101 runs the effect kinds made here. Most wordings here are read as an instruction the
// game already runs (the same effect for another subject, another player or several targets), so the game's own
// rules for that effect apply. Every choice stays with the player who makes it in the rules.
import { numberFromText, locateCardInGame, definitionFor, resolveAmount, catalogHelpers as H } from './effects.js';
import { parseCountB101, amountNeedsPlayerB101, bindAmountPlayerB101 } from './amounts-b101.js';

const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const playerById = (game, id) => (game.players || []).find(p => p.playerId === id) || null;
const ok = inner => inner && !inner.unsupported.length && inner.effects.length;
const rxCache = new Map();
const rx = (src, flags = 'i') => { const k = `${flags}/${src}`; let r = rxCache.get(k); if (!r) rxCache.set(k, (r = new RegExp(src, flags))); return r; };
const swapBind = (o, from, to) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === from ? to : v]));
const SELF = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|Spacecraft|planeswalker|card|token))';
const KW = '(?:flying|first strike|double strike|deathtouch|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|defender|shroud|flash|fear|intimidate|shadow|horsemanship|flanking|banding|islandwalk|swampwalk|forestwalk|mountainwalk|plainswalk|protection from [a-z]+)';

/** One sentence. Pushes onto ctx.effects / ctx.requirements and returns true when understood. */
export function compileB101Clause(c, ctx) {
  const { effects, requirements, sourceName } = ctx;
  // An instruction read as one the game already runs. A target description that swallowed part of the sentence
  // ("target creature becomes a Dragon … and") means it was not really understood.
  const clean = r => !r.requirements.some(q => /\bwhere x is\b|\bequal to\b|\bfor each\b|\b(?:becomes?|gains?|gets?|loses?|has|have) |\buntil end of turn\b|\bdeals? \w+ damage\b|\bthis turn\b/i.test(`${q.scope || ''} ${q.filter || ''}`)) && !/where x is/i.test(JSON.stringify(r.effects));
  const sub = text => { const r = H.compileSingleClause(ctx.restore(text), { sourceName }); return ok(r) && clean(r) ? r : null; };
  const take = r => { effects.push(...r.effects); requirements.push(...r.requirements); return true; };
  // The pronoun's card: this permanent, the trigger's card ("it"), or the other card of the event ("that creature").
  // "b101It" / "b101That" are settled once the whole ability is read (effects.js): the card targeted earlier in the
  // ability when there is one, else the trigger's card ("it") or the other card of the event ("that creature").
  const pronounBind = s => rx(`^${SELF}$`).test(s) ? 'sourceId' : /^(?:it|he|she|they)$/i.test(s) ? 'b101It' : /^(?:enchanted|equipped|fortified) /i.test(s) ? '__attached' : 'b101That';
  let m;

  // --- "Put X +1/+1 counters on this creature." (X from the cost, or from "where X is …"): the instruction for two counters, with X.
  if ((m = c.match(/^(?:Then )?put X ((?:[+-]\d+\/[+-]\d+|[a-z]+) counters on .+)$/i)) && !/\btwo\b/i.test(m[1])) {
    const r = sub(`Put two ${m[1]}`);
    if (r && r.effects.some(e => e.amount === 2)) { r.effects.forEach(e => { if (e.amount === 2) e.amount = 'X'; }); if (!r.requirements.some(q => q.kind === 'number')) r.requirements.unshift({ kind: 'number', bind: 'X', label: 'Choose X', min: 0, max: 99 }); return take(r); }
  }
  // --- "Draw a card for each tapped creature target opponent controls." (Borrowing 100,000 Arrows)
  if ((m = c.match(/^(?:you )?draw a card for each (.+ (target player|target opponent) controls)\.?$/i))) {
    const expr = parseCountB101(m[1]);
    if (expr && amountNeedsPlayerB101(expr)) {
      const pb = H.playerRequirement(requirements, /opponent/i.test(m[2]) ? 'opponent' : 'player', m[2]);
      effects.push({ kind: 'draw', scope: 'you', amount: bindAmountPlayerB101(expr, pb) });
      return true;
    }
  }

  // --- Random discards: the game picks; nobody chooses.
  if ((m = c.match(rx(`^(?:you )?discard ${N} cards? at random\\.?$`)))) { effects.push({ kind: 'b101-discard-random', amount: num(m[1]) }); return true; }
  if ((m = c.match(rx(`^(Target player|Target opponent|Each player|Each opponent|That player|Defending player) discards ${N} cards? at random\\.?$`)))) {
    const e = { kind: 'b101-discard-random', amount: num(m[2]) };
    if (/^each/i.test(m[1])) effects.push({ kind: 'for-each-player', opponents: /opponent/i.test(m[1]), effects: [e] });
    else effects.push({ ...e, forPlayerBind: /^target/i.test(m[1]) ? H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]) : /^defending/i.test(m[1]) ? 'defendingPlayer' : 'eventPlayer' });
    return true;
  }
  if (/^Discard all the cards in your hand\.?$/i.test(c)) { const r = sub('Discard your hand.'); if (r) return take(r); }

  // --- "Investigate twice." / "Investigate three times."
  if ((m = c.match(rx(`^(?:you )?investigate (twice|${N} times)\\.?$`)))) {
    const r = sub('Investigate.'), n = /twice/i.test(m[1]) ? 2 : num(m[2]);
    if (r && n != null) { r.effects.forEach(e => { if (e.kind === 'create-token') e.amount = n; }); return take(r); }
  }

  // --- "Target creature loses flying until end of turn." / "This creature loses defender until end of turn."
  if ((m = c.match(rx(`^(.+?) loses? (${KW}(?:(?:,| and|, and) ${KW})*) until end of turn\\.?$`)))) {
    const r = sub(`${m[1]} gains ${m[2]} until end of turn.`);
    if (r && r.effects.every(e => e.kind === 'grant-keyword' || e.kind === 'grant-keyword-each')) { r.effects.forEach(e => { e.enabled = false; if (/^that (?:creature|permanent)$/i.test(m[1]) && e.bind === 'eventCard') e.bind = 'b101That'; }); return take(r); }   // "that creature": the other creature of a block
  }

  // --- "This creature has base power and toughness 4/4 until end of turn." (the same as for a target creature)
  if ((m = c.match(rx(`^(${SELF}|It|That creature) (has base power and toughness \\d+\\/\\d+ until end of turn)\\.?$`)))) {
    const r = sub(`Target creature ${m[2]}.`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && r.requirements.length === 1) { effects.push(...r.effects.map(e => swapBind(e, t.bind, pronounBind(m[1])))); return true; }
  }

  // --- An instruction for a group "target player controls": the same instruction done as that player.
  // "Creatures target player controls get -1/-1 until end of turn." "Put a +1/+1 counter on each creature target player controls."
  if ((m = c.match(/^(.*\b(?:creatures?|permanents?|artifacts?|lands?|enchantments?|tokens?)) (target player|target opponent) controls\b(.*)$/i)) && /^(?:creatures|permanents|artifacts|lands|put |tap all|untap all|destroy all|exile all|return all)/i.test(c) && !/\btarget\b/i.test(m[1] + m[3])) {
    const r = sub(`${m[1]} you control${m[3]}`);
    if (r && !r.requirements.length && r.effects.every(e => !e.forPlayerBind)) {
      const pb = H.playerRequirement(requirements, /opponent/i.test(m[2]) ? 'opponent' : 'player', m[2]);
      effects.push(...r.effects.map(e => ({ ...e, forPlayerBind: pb })));
      return true;
    }
  }

  // --- Several targets, each getting the instruction the game runs for one target.
  // "Two target creatures each get +1/+1 until end of turn." "Up to two target creatures each gain flying until end of turn."
  // "One or two target creatures each get +2/+1 …" "Up to three target creatures can't block this turn."
  if (!/\bchosen\b|\byour choice\b|\bthat color\b|\bcop(?:y|ies)\b/i.test(c) && (m = c.match(rx(`^(Up to |One or |Any number of )?(?:${N} )?(other )?target (creatures?(?: you control| an opponent controls| your opponents control| you don't control)?|permanents?(?: you control)?|artifacts?|lands?) (?:each )?(gets? [+-]\\d+\\/[+-]\\d+(?: and gains? [a-z ,]+)?|gains? [a-z ,]+|can'?t block|can'?t attack|can'?t attack or block|can'?t be blocked|becomes? [a-z]+) (until end of turn|this turn)\\.?$`)))) {
    const count = m[2] ? num(m[2]) : null, any = /^any/i.test(m[1] || '');
    if ((count != null && (count === 'X' || count > 1 || /^one or/i.test(m[1] || ''))) || any) {
      const noun = m[4].replace(/^(creature|permanent|artifact|land)s/i, '$1');
      const r = sub(`Target ${noun} ${m[5].replace(/^get /i, 'gets ').replace(/^gain /i, 'gains ').replace(/^become /i, 'becomes ')} ${m[6]}.`), t = r?.requirements.find(q => q.kind === 'target');
      if (r && t && r.requirements.length === 1) {
        const bind = `multi${requirements.length}`, max = any ? 99 : count, min = m[1] && !/^one or/i.test(m[1]) ? 0 : /^one or/i.test(m[1] || '') ? 1 : count;
        requirements.push({ kind: 'multi-target', bind, scope: t.scope, min, max, label: `Choose ${(m[1] || '').toLowerCase()}${m[2] ? `${m[2].toLowerCase()} ` : ''}${m[4].toLowerCase()}`, ...(m[3] ? { notSource: true } : {}) });
        effects.push({ kind: 'b101-each-bound', bind, effects: r.effects.map(e => swapBind(e, t.bind, '__each')) });
        return true;
      }
    }
  }
  // "SELF deals 1 damage to each of two targets." "… to each of up to two target creatures." "… to each of up to three targets."
  if ((m = c.match(rx(`^(.+? deals? (?:${N}|that much) damage to) each of (up to )?${N} (targets?|target creatures?(?: and\\/or planeswalkers?)?|target creatures? (?:an opponent controls|you don't control|without flying|with flying)|target players?|target opponents?|target creatures? or planeswalkers?)\\.?$`)))) {
    const count = num(m[4]), what = m[5].replace(/^targets?$/i, 'any target').replace(/^target (creature|player|opponent|planeswalker)s/i, 'target $1').replace(/planeswalkers$/i, 'planeswalker');
    const r = sub(`${m[1]} ${what}.`), t = r?.requirements.find(q => q.kind === 'target' || q.kind === 'player');
    if (r && t && r.requirements.length === 1 && t.kind === 'target' && count != null) {
      const bind = `multi${requirements.length}`;
      requirements.push({ kind: 'multi-target', bind, scope: t.scope, min: m[3] ? 0 : count, max: count, label: `Choose ${m[3] ? 'up to ' : ''}${m[4].toLowerCase()} ${what.replace(/^any target$/, 'targets')}` });
      effects.push({ kind: 'b101-each-bound', bind, effects: r.effects.map(e => swapBind(e, t.bind, '__each')) });
      return true;
    }
  }

  // --- "defending player …" / "that player …": the instruction the game runs for a target player, for that player.
  if ((m = c.match(/^(defending player|that player) (.+)$/i)) && !/\btarget\b/i.test(m[2])) {
    const who = /^defending/i.test(m[1]) ? 'defendingPlayer' : 'eventPlayer';
    const r = sub(`Target player ${m[2]}`), t = r?.requirements.find(q => q.kind === 'player');
    if (r && t && r.requirements.filter(q => q.kind === 'player').length === 1) {
      effects.push(...r.effects.map(e => swapBind(e, t.bind, who)));
      requirements.push(...r.requirements.filter(q => q !== t).map(q => swapBind(q, t.bind, who)));
      return true;
    }
  }

  // --- "you may have target creature get +1/+1 until end of turn" (the "you may" was asked): "have … get" is "gets".
  if (/\bcop(?:y|ies)\b|\bwhere X is\b/i.test(c)) return false;   // copies and amounts worked out elsewhere are not read here
  if ((m = c.match(/^have (target .+?) (get|gain|fight|deal|become|lose) (.+)$/i))) {
    const r = sub(`${cap(m[1])} ${m[2].toLowerCase()}s ${m[3]}`);
    if (r) return take(r);
  }
  if ((m = c.match(rx(`^have (${SELF}|it|that creature) (get|gain|fight|deal|become|lose) (.+)$`)))) {
    const r = sub(`${cap(m[1])} ${m[2].toLowerCase()}s ${m[3]}`);
    if (r) return take(r);
  }

  // --- A pronoun where the game reads a target: "That creature can't block this turn." "It must be blocked this turn if able."
  // Only in a trigger or ability with nothing targeted before it (a spell's "it" is bridged to its target in effects.js).
  if ((m = c.match(rx(`^(It|That creature|That permanent|That land|That artifact|${SELF}) ((?:can'?t|must|blocks?|attacks?|doesn'?t|gains?|gets?|becomes?|loses?|fights?|is|deals?|has|phases?) .+)$`))) && !/\btarget\b/i.test(c)) {
    const noun = /land/i.test(m[1]) ? 'land' : /artifact/i.test(m[1]) ? 'artifact' : /permanent/i.test(m[1]) ? 'permanent' : 'creature';
    const r = sub(`Target ${noun} ${m[2]}`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && r.requirements.length === 1) { effects.push(...r.effects.map(e => swapBind(e, t.bind, pronounBind(m[1])))); return true; }
  }
  return false;
}

/** Several sentences read together. Returns { part, consumed } or null. `parts` are the instructions compiled so far. */
export function compileB101Sequence(clauses, i, { sourceName, parts = [] }) {
  const c0 = String(clauses[i] || '').replace(/\([^()]*\)/g, '').trim();
  let m;
  // "~ deals 2 damage to that land's controller." — the controller of what was targeted before, or of the trigger's card.
  if ((m = c0.match(/^(?:.+? )?deals (\w+) damage to that (creature|permanent|land|artifact|enchantment|planeswalker|spell|Aura|Equipment|Vehicle|token)'s controller\.?$/i)) && num(m[1]) !== null) {
    const earlier = [...parts].reverse().flatMap(p => [...(p.requirements || [])].reverse()).find(r => r.kind === 'target' || r.kind === 'stack-target');
    if (earlier) {
      const as = `controllerOf${earlier.bind}`;
      parts.forEach(p => { if (p.requirements?.includes(earlier) && !p.effects.some(e => e.kind === 'remember-controller' && e.as === as)) p.effects.unshift({ kind: 'remember-controller', bind: earlier.bind, as }); });
      return { part: { effects: [{ kind: 'damage', amount: num(m[1]), bind: as, sourceName }], requirements: [], unsupported: [] }, consumed: 1 };
    }
    if (!parts.some(p => (p.requirements || []).length)) return { part: { effects: [{ kind: 'damage', amount: num(m[1]), bind: '__thatController', sourceName }], requirements: [], unsupported: [] }, consumed: 1 };
  }
  return null;
}

/** Runs the effect kinds made above. Returns true when the kind is one of them. */
export function applyB101(game, controllerId, effect, bindings, notes) {
  // "Target player discards two cards at random": done as that player (these kinds are reached before effects.js reads forPlayerBind).
  if (effect.forPlayerBind && String(effect.kind).startsWith('b101-') && bindings[effect.forPlayerBind]) controllerId = bindings[effect.forPlayerBind];
  const controller = playerById(game, controllerId);
  switch (effect.kind) {
    case 'b101-discard-random': {
      if (!controller) return true;
      const n = Math.min(Number(resolveAmount(game, controllerId, effect.amount, bindings)) || 0, controller.deck.hand.length);
      const names = [];
      for (let k = 0; k < n; k++) {
        const [card] = controller.deck.hand.splice(Math.floor(Math.random() * controller.deck.hand.length), 1);
        card.zone = 'graveyard';
        controller.deck.graveyard.push(card);
        names.push(definitionFor(game, card)?.name || 'a card');
        H.emit(bindings, { type: 'discard', playerId: controller.playerId, sourceId: card.instanceId, definitionId: card.definitionId, typeLine: definitionFor(game, card)?.typeLine || '' });
      }
      bindings.discardedThisWay = Number(bindings.discardedThisWay || 0) + n;
      notes.push(n ? `${controller.displayName} discards ${names.join(', ')} at random.` : `${controller.displayName} has no cards to discard.`);
      return true;
    }
    case 'b101-each-bound': {
      // The same instruction for each chosen target; one that is gone by now is skipped (the others still get it).
      const raw = bindings[effect.bind], ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const before = bindings.__each;
      for (const id of ids) {
        const isPlayer = !!playerById(game, id), hit = isPlayer ? null : locateCardInGame(game, id);
        if (!isPlayer && (!hit || hit.zone !== 'battlefield')) continue;
        bindings.__each = id;
        notes.push(...H.applyEffectsUnsafe(game, controllerId, effect.effects, bindings));
      }
      bindings.__each = before;
      return true;
    }
    default:
      return false;
  }
}

/** Requirement kinds made above, asked by requirements.js. Returns true when handled. */
export function gatherB101(game, ctx, req, bindings, ask, key, title, base, util) {
  return false;
}

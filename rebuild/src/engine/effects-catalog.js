// Catalog effects (build 43): wordings found by running every Commander-legal card through the effect compiler
// and automating the most common ones that were still resolved by hand. Each instruction keeps every choice a
// player makes in the rules with that player (targets, "you may", which cards to keep) and does the rest itself.
//
// compileCatalogClause(c, ctx) is tried after the older readers in effects.js; applyCatalogEffect runs the effect
// kinds it creates. Both use helpers from effects.js (the two modules import each other; nothing runs at load time).
import {
  numberFromText, locateCardInGame, moveCard, definitionFor, cardMatchesFilter, resolveAmount, whereXExpr,
  catalogHelpers as H
} from './effects.js';
import { effectiveToughness, effectivePower } from './combat.js';
const effectivePowerOf = (game, card) => effectivePower(card, definitionFor(game, card), game);
import { librarySearchSpec, searchFilter } from '../game/library-search.js';
import { compileB49Clause, compileB49Sequence, applyB49, gatherB49 } from './effects-b49.js';

// Regular expressions built from a card's name are made once and kept (building them is the slow part of compiling).
const RX_CACHE = new Map();
function rx(source, flags = '') {
  const key = `${flags}/${source}`;
  let r = RX_CACHE.get(key);
  if (!r) { if (RX_CACHE.size > 20000) RX_CACHE.clear(); r = new RegExp(source, flags); RX_CACHE.set(key, r); }
  r.lastIndex = 0;
  return r;
}


const N = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+|X)';
const num = s => numberFromText(s) ?? (/^x$/i.test(String(s)) ? 'X' : null);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const esc = s => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rebind the single target requirement an instruction asked for to a fixed binding (the source, the enchanted creature …). */
function rebound(text, bind, ctx) {
  const inner = H.compileSingleClause(ctx.restore ? ctx.restore(text) : text, { sourceName: ctx.sourceName });
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
// The card's own name is replaced by SELFNAME before matching, so the patterns below are the same for every card
// and are built once (building a regular expression per card name made compiling the whole catalog slow).
const SELF_STATIC = '(?:SELFNAME|this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|Saga|Vehicle|Spacecraft|planeswalker|card))';
function selfNameRegex(sourceName) {
  const full = String(sourceName || '').trim(), short = full.split(',')[0].trim();
  const names = [...new Set([full, short].filter(n => n.length > 1))].sort((a, b) => b.length - a.length).map(esc);
  return names.length ? rx(`\\b(?:${names.join('|')})(?![\\w'])`, 'g') : null;
}
export function compileCatalogClause(c0, ctx0) {
  const re = selfNameRegex(ctx0.sourceName);
  const c = re ? c0.replace(re, 'SELFNAME') : c0;
  const ctx = { ...ctx0, selfAny: SELF_STATIC, restore: s => String(s).replace(/SELFNAME/g, ctx0.sourceName) };
  return compileCatalogClauseInner(c, ctx);
}
function compileCatalogClauseInner(c, ctx) {
  const { sourceName, selfAny, effects, requirements } = ctx;
  let mt;
  // "you may return target creature card …", "you may destroy target artifact": choosing no target declines.
  if ((mt = c.match(/^you may ((?:destroy|exile|return|tap|untap|put|attach|gain control of|counter|sacrifice) .*\btarget\b.+)$/i))) {
    const inner = H.compileSingleClause(ctx.restore(cap(mt[1])), { sourceName });
    const binds = new Set(inner.requirements.filter(r => ['target', 'graveyard-target', 'stack-target'].includes(r.kind)).map(r => r.bind));
    if (!inner.unsupported.length && inner.effects.length && binds.size) {
      // The target is chosen as usual; "you may" is asked as it resolves.
      const bind = `mayDo${requirements.length}`;
      requirements.push({ kind: 'yes-no', bind, label: `${cap(mt[1]).replace(/\.$/, '')}?` }, ...inner.requirements);
      effects.push({ kind: 'condition', test: 'chosen', bind, skip: inner.effects.length }, ...inner.effects);
      return true;
    }
  }
  // "target opponent creates a 1/1 Spirit token" (Forbidden Orchard): the token is that player's.
  if ((mt = c.match(/^(target opponent|target player|each opponent|each player) (creates?|draws?|gains?) (.+)$/i))) {
    const verb = mt[2].toLowerCase().replace(/s$/, '');
    const inner = H.compileSingleClause(ctx.restore(`${cap(verb)} ${mt[3]}`), { sourceName });
    if (!inner.unsupported.length && inner.effects.length) {
      if (/^target/i.test(mt[1])) {
        const pb = H.playerRequirement(requirements, /opponent/i.test(mt[1]) ? 'opponent' : 'player', mt[1]);
        requirements.push(...inner.requirements);
        effects.push(...inner.effects.map(e => ({ ...e, forPlayerBind: pb })));
      } else {
        requirements.push(...inner.requirements);
        effects.push({ kind: 'for-each-player', opponents: /opponent/i.test(mt[1]), effects: inner.effects });
      }
      return true;
    }
  }
  // "Then amass Orcs 1." — a sentence that begins with "Then".
  if ((mt = c.match(/^Then,? (.+)$/i))) {
    const inner = H.compileSingleClause(ctx.restore(mt[1].charAt(0).toUpperCase() + mt[1].slice(1)), { sourceName });
    if (!inner.unsupported.length && inner.effects.length) { effects.push(...inner.effects); requirements.push(...inner.requirements); return true; }
  }
  if (/^you gain protection from everything until your next turn\.?$/i.test(c)) { effects.push({ kind: 'player-protection' }); return true; }
  // Coins: "Flip a coin. If you win the flip, …" (the condition is checked in effects.js).
  if (/^(?:you )?flip a coin\.?$/i.test(c)) { effects.push({ kind: 'flip-coin' }); return true; }
  if (/^(?:you )?flip a coin until you lose a flip\.?$/i.test(c)) { effects.push({ kind: 'flip-coin', untilLose: true }); return true; }
  // Dice: "roll a d20." then "… equal to the result".
  if ((mt = c.match(/^(?:you )?roll a d(\d+)\.?$/i))) { effects.push({ kind: 'roll-die', sides: Number(mt[1]) }); return true; }
  if (/equal to the result\.?$/i.test(c)) {
    const inner = H.compileSingleClause(ctx.restore(c.replace(/^You create a number of (.+?) tokens? equal to the result\.?$/i, 'Create X $1 tokens.').replace(/ equal to the result/i, ' X')), { sourceName });
    if (!inner.unsupported.length && inner.effects.length) { effects.push({ kind: 'set-x', amount: { kind: 'binding', bind: 'dieResult' } }, ...inner.effects); requirements.push(...inner.requirements.filter(r => !(r.kind === 'number' && r.bind === 'X'))); return true; }
  }
  if (/^Each player gains control of all creatures they own\.?$/i.test(c)) { effects.push({ kind: 'owners-control', filter: 'creature' }); return true; }
  // Build 77: Persist (the card): "Return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1
  // counter on it." The return as usual, then the counter on the returned card (the same card).
  if ((mt = c.match(/^(Return target .+? from (?:your|a) graveyard to the battlefield(?: tapped)?(?: under your control)?) with (a|an|one|two|three|\d+) ([+-]1\/[+-]1|shield|indestructible|flying|lifelink) counters? on it\.?$/i))) {
    const inner = H.compileSingleClause(ctx.restore(`${mt[1]}.`), { sourceName });
    const ret = inner.effects.find(e => e.kind === 'return-from-graveyard' && e.to === 'battlefield');
    if (!inner.unsupported.length && ret) { effects.push(...inner.effects, { kind: 'counter', bind: ret.bind, counter: mt[3], amount: num(mt[2]) }); requirements.push(...inner.requirements); return true; }
  }
  // Build 77: Jace, Wielder of Mysteries: "Then if your library has no cards in it, you win the game."
  if ((mt = c.match(/^(?:Then )?if (?:your library has no cards in it|you have no cards in your library|there are no cards in your library), (.+)$/i))) {
    const inner = H.compileSingleClause(ctx.restore(cap(mt[1])), { sourceName });
    if (!inner.unsupported.length && inner.effects.length) { effects.push({ kind: 'condition', test: 'library-empty', skip: inner.effects.length, failNote: 'Your library still has cards in it.' }, ...inner.effects); requirements.push(...inner.requirements); return true; }
  }
  // Noxious Gearhulk: "If a creature is destroyed this way, you gain life equal to its toughness."
  if ((mt = c.match(/^If (?:a|that) (?:creature|permanent) (?:is|was) destroyed this way, (.+)$/i))) {
    const inner = H.compileSingleClause(ctx.restore(cap(mt[1])), { sourceName });
    if (!inner.unsupported.length && inner.effects.length) { effects.push({ kind: 'condition', test: 'destroyed-this-way', skip: inner.effects.length, failNote: 'Nothing was destroyed.' }, ...inner.effects); requirements.push(...inner.requirements); return true; }
  }
  // Mesmeric Orb: "that permanent's controller mills a card." / "Its controller mills two cards."
  if ((mt = c.match(/^(?:its|that permanent'?s|that creature'?s) controller (mills|draws|discards) (.+)$/i))) {
    const inner = H.compileSingleClause(ctx.restore(`You ${mt[1].replace(/s$/, '')} ${mt[2]}`), { sourceName });
    if (!inner.unsupported.length && inner.effects.length && inner.effects.every(e => (!e.scope || e.scope === 'you') && !e.forPlayerBind && !e.bind)) { effects.push(...inner.effects.map(e => ({ ...e, forPlayerBind: '__thatController' }))); requirements.push(...inner.requirements); return true; }
  }
  // Mahadi, Emporium Master: "create a Treasure token for each creature that died this turn."
  if ((mt = c.match(/^create (?:a|an) (.+? token\b.*?) for each creature that died this turn\.?$/i))) {
    const inner = H.compileSingleClause(ctx.restore(`Create a ${mt[1]}.`), { sourceName });
    if (!inner.unsupported.length && inner.effects.length === 1 && inner.effects[0].kind === 'create-token' && inner.effects[0].amount === 1) { effects.push({ ...inner.effects[0], amount: { kind: 'died-this-turn' } }); requirements.push(...inner.requirements); return true; }
  }
  // Build 77: "For each land you control, create a Treasure token." (Brass's Bounty) / "Create a Treasure token for each artifact you
  // control." — one token made as many times as you control those permanents.
  if ((mt = c.match(/^For each (land|creature|artifact|enchantment|planeswalker|permanent|nonland permanent) you control, create (?:a|an) (.+? tokens?\b.*?)\.?$/i) || c.match(/^Create (?:a|an) (.+? token\b.*?) for each (land|creature|artifact|enchantment|planeswalker|permanent|nonland permanent) you control\.?$/i))) {
    const [what, tok] = /^For each/i.test(c) ? [mt[1], mt[2]] : [mt[2], mt[1]];
    const inner = H.compileSingleClause(ctx.restore(`Create a ${tok}.`), { sourceName });
    if (!inner.unsupported.length && inner.effects.length === 1 && inner.effects[0].kind === 'create-token' && inner.effects[0].amount === 1) {
      effects.push({ ...inner.effects[0], amount: { kind: 'count', zone: 'battlefield', filter: what.toLowerCase() } }); requirements.push(...inner.requirements); return true;
    }
  }
  // "another target creature": the same instruction, and this permanent can't be chosen.
  if (/\banother target\b/i.test(c) && !requirements.length) {
    const inner = H.compileSingleClause(ctx.restore(c.replace(/\banother target\b/i, 'target')), { sourceName });
    const first = inner.requirements.find(r => r.kind === 'target');
    if (!inner.unsupported.length && inner.effects.length && first) {
      first.notSource = true;
      effects.push(...inner.effects); requirements.push(...inner.requirements);
      return true;
    }
  }
  let m;
  const subjectBind = s => rx(`^${selfAny}$`, 'i').test(s) ? 'sourceId' : /^it$/i.test(s) ? 'eventCard' : /^(?:enchanted|equipped|fortified) /i.test(s) ? '__attached' : 'thatCard';
  const SUBJ = `(${selfAny}|It|That creature|That permanent|Enchanted creature|Equipped creature|Enchanted permanent|Enchanted land)`;
  const PT = '([+-](?:\\d+|X))\\/([+-](?:\\d+|X))';
  const until = s => /your next turn/i.test(s || '') ? 'your-next-turn' : 'cleanup';

  // --- Power/toughness and keywords for the source, the enchanted/equipped creature, or the trigger's creature.
  if ((m = c.match(rx(`^${SUBJ} gets? ${PT}(?: and gains? ([a-z ,]+?))? until (end of turn|your next turn)\\.?"?$`, 'i')))) {
    const bind = subjectBind(m[1]);
    effects.push({ kind: 'pump', bind, power: m[2], toughness: m[3], expires: until(m[5]) });
    for (const keyword of H.KEYWORD_LIST(m[4])) effects.push({ kind: 'grant-keyword', bind, keyword, enabled: true, expires: until(m[5]) });
    return true;
  }
  if ((m = c.match(rx(`^(?:Until end of turn, )?${SUBJ} gains? ([a-z ,]+?)(?: and gets? ${PT})?(?: until (end of turn|your next turn))?\\.?"?$`, 'i'))) && (m[5] || /^Until end of turn/i.test(c))) {
    const bind = subjectBind(m[1]);
    for (const keyword of H.KEYWORD_LIST(m[2])) effects.push({ kind: 'grant-keyword', bind, keyword, enabled: true, expires: until(m[5]) });
    if (m[3]) effects.push({ kind: 'pump', bind, power: m[3], toughness: m[4], expires: until(m[5]) });
    return true;
  }
  if ((m = c.match(rx(`^${SUBJ} (?:gets|gains) (?:${PT}|[a-z ,]+?) until end of turn for each (.+?)\\.?$`, 'i'))) && m[2]) {
    const f = H.filterFromNoun(m[4]);
    const of = f ? { kind: 'count', zone: 'battlefield', filter: f } : H.countExprFromPhrase(m[4]);
    if (!of) return false;
    const sign = v => (String(v).startsWith('-') ? '-' : '+') + 'X';
    effects.push({ kind: 'set-x', amount: { kind: 'times', n: Math.abs(Number(String(m[2]).replace(/X/, '1'))) || 1, of } });
    effects.push({ kind: 'pump', bind: subjectBind(m[1]), power: Number(m[2]) === 0 ? 0 : sign(m[2]), toughness: Number(m[3]) === 0 ? 0 : sign(m[3]), expires: 'cleanup' });
    return true;
  }

  // --- Regeneration.
  if ((m = c.match(rx(`^Regenerate (${selfAny}|it|that creature|enchanted creature|equipped creature|enchanted permanent|target [^.]+?|each creature you control|each [^.]+? you control)\\.?$`, 'i')))) {
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
  if (rx(`^Exile ${selfAny}\\.?$`, 'i').test(c) || /^Exile this spell\.?$/i.test(c)) { effects.push({ kind: 'exile-self' }); return true; }
  if (rx(`^Return (?:this card|${selfAny}) from your graveyard to your hand\\.?$`, 'i').test(c)) { effects.push({ kind: 'return-self-hand' }); return true; }
  if (rx(`^Put (?:this card|${selfAny}) from your graveyard on top of your library\\.?$`, 'i').test(c)) { effects.push({ kind: 'self-graveyard-to-library' }); return true; }
  if (rx(`^Shuffle (?:this card|${selfAny}) into its owner'?s library\\.?$`, 'i').test(c) || rx(`^(?:This card's|${selfAny}'s) owner shuffles it into their library\\.?$`, 'i').test(c)) { effects.push({ kind: 'self-shuffle-into-library' }); return true; }
  if (rx(`^Put (?:${selfAny}|it) on top of its owner'?s library\\.?$`, 'i').test(c)) { effects.push({ kind: 'source-to-library-top' }); return true; }

  // --- "becomes a 3/3 Elemental creature with haste until end of turn. It's still a land." (creature lands, animation).
  if (/^(?:It'?s|It is|That's|They're|They are) still (?:a|an)? ?(?:land|artifact|enchantment|planeswalker)s?\.?$/i.test(c)) return true;
  if ((m = c.match(/^Until (end of turn|your next turn), (.+? becomes? .+?)\.?$/i)) && !/ until /i.test(m[2])) return compileCatalogClauseInner(`${cap(m[2])} until ${m[1]}.`, ctx);
  {
    const SUBJ2 = `(${selfAny}|Target (?:[a-z ]+ )?(?:land|artifact|creature|permanent|enchantment|Vehicle|noncreature artifact)(?: you control)?|It|Enchanted land|Enchanted permanent|Each land you control|All lands you control|Up to one target (?:[a-z ]+ )?(?:land|artifact|creature|permanent)(?: you control)?)`;
    const am = c.match(rx(`^${SUBJ2} becomes? (?:a|an) (?:(\\d+|X)\\/(\\d+|X) )?([A-Za-z ,-]*?)\\bcreatures?(?: with ([^."]+?))?(?: (?:that's|that is) still (?:a|an) [a-z]+| in addition to its other types)?( until end of turn| until your next turn)?\\.?$`, 'i'));
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

  // "Distribute two +1/+1 counters among one or two target creatures you control." "Distribute 4 damage among any number
  // of target creatures and/or planeswalkers." The player divides as the spell is cast.
  if ((m = c.match(rx(`^Distribute ${N} (\\+1\\/\\+1 counters|damage) among (one or two|one, two, or three|any number of|up to ${N}) (targets|target [^.]+?)\\.?$`, 'i')))) {
    const total = num(m[1]), most = /one or two/i.test(m[3]) ? 2 : /three/i.test(m[3]) ? 3 : /up to/i.test(m[3]) ? num(m[4]) : null;
    const scope = /^targets$/i.test(m[5]) ? 'any target' : m[5].toLowerCase().replace(/^target (\w+)s\b/, 'target $1').replace(/ and\/or (\w+)s\b/, ' or $1');
    const tb = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind: tb, scope, min: 1, max: total === 'X' ? (most || 99) : Math.min(most || total, total), label: `Choose ${m[3].toLowerCase()} ${m[5].replace(/^target /i, '')} (${m[1]} ${/damage/i.test(m[2]) ? 'damage' : 'counters'} divided)` });
    const db = `divide${requirements.length}`;
    requirements.push({ kind: 'distribute', bind: db, targetsBind: tb, total, what: /damage/i.test(m[2]) ? 'damage' : 'counter' });
    effects.push({ kind: 'distribute', bind: db, what: /damage/i.test(m[2]) ? 'damage' : 'counter', sourceName });
    return true;
  }
  // Last March of the Ents: "… then put any number of creature cards from your hand onto the battlefield."
  if ((m = c.match(/^(?:you may )?put any number of ([a-z ]+?) cards from your hand onto the battlefield( tapped)?\.?$/i))) {
    const bind = `handCards${requirements.length}`;
    requirements.push({ kind: 'hand-card', bind, many: true, filter: m[1].toLowerCase().replace(/^(?:permanent|nonland permanent)$/, ''), label: `any number of ${m[1]} cards to put onto the battlefield` });
    effects.push({ kind: 'hand-to-battlefield-any', bind, tapped: !!m[2], optionalTarget: true });
    return true;
  }
  // Talon Gates of Madara: "{4}: Put this card from your hand onto the battlefield." (activated from the hand)
  if (rx(`^Put (?:this card|${selfAny}) from your hand onto the battlefield\\.?$`, 'i').test(c)) { effects.push({ kind: 'self-hand-to-battlefield' }); return true; }
  // "Magma Opus deals 4 damage divided as you choose among any number of targets." (Electrolyze, Forked Bolt …)
  if ((m = c.match(rx(`^(?:${selfAny}|This spell|It) deals ${N} damage divided as you choose among (one or two|one, two, or three|any number of|two|three) (targets|target [^.]+?)\\.?$`, 'i')))) {
    const amt = /^X$/i.test(m[1]) ? 'X' : m[1];
    return compileCatalogClauseInner(`Distribute ${amt} damage among ${/^(two|three)$/i.test(m[2]) ? `one, two, or three` : m[2]} ${m[3]}.`, ctx);
  }
  // Twisted Image, Aquamoeba: "Switch target creature's power and toughness until end of turn."
  if ((m = c.match(rx(`^Switch (target creature's|${selfAny}'s|this creature's|its) power and toughness until end of turn\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature', 'target creature') : 'sourceId';
    effects.push({ kind: 'switch-pt', bind });
    return true;
  }
  // Torrential Gearhulk, Emet-Selch: "you may cast target instant card from your graveyard (without paying its mana cost)."
  // The player picks the card (or none) as it resolves and casts it right away.
  if ((m = c.match(/^(?:Then )?(?:you may )?cast (?:target|an|a) ([a-z ,]+?)(?: card| spell)( with mana value \d+ or less)? from your graveyard( without paying its mana cost)?( this turn)?\.?$/i))) {
    const bind = `graveMulti${requirements.length}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter: `${m[1].trim()}${m[2] || ''}`, max: 1, min: 0, label: `a ${m[1].trim()} card${m[2] || ''} to cast${m[3] ? ' for free' : ''} (or none)` });
    effects.push({ kind: 'cast-from-graveyard', bind, free: !!m[3], thisTurn: !!m[4] });
    return true;
  }
  if (/^If that spell would be put into (?:your|a) graveyard, exile it instead\.?$/i.test(c)) { effects.push({ kind: 'exile-instead-flag' }); return true; }
  // "Sacrifice a Zombie." "Sacrifice a Food." (a creature or artifact subtype)
  if ((m = c.match(/^Sacrifice (?:a|an) ([A-Z][a-z]+)\.?$/)) && !/^(?:Creature|Artifact|Enchantment|Land|Planeswalker|Permanent)$/.test(m[1])) {
    const bind = `cards${requirements.length}`;
    requirements.push({ kind: 'card-selection', bind, scope: 'you', filter: `permanent|subtype:${m[1]}`, amount: 1, label: `Choose a ${m[1]} to sacrifice` });
    effects.push({ kind: 'sacrifice-many', scope: 'you', amount: 1, filter: `permanent|subtype:${m[1]}`, bind });
    return true;
  }
  // Bribery, Praetor's Grasp, Jester's Cap: "Search target opponent's library for a creature card and put that card onto the
  // battlefield under your control." / "… and exile it (face down)." — the searcher picks from that library as it resolves.
  if ((m = c.match(/^Search (target opponent's|target player's|that player's|its controller's) library for (a|an|up to one|up to two|up to three|two|three) ([a-z ,]*?)cards? and (put (?:that card|it|them|those cards) onto the battlefield under your control|exile (?:it|them|those cards)(?: face down)?|put (?:it|them|those cards) into (?:their|its owner's|that player's) graveyard)\.?$/i))) {
    const playerBind = /^target/i.test(m[1]) ? H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1].replace(/'s$/, '')) : /controller/i.test(m[1]) ? '__thatController' : 'eventPlayer';
    const n = /one|^a|^an/i.test(m[2]) ? 1 : num(m[2].replace(/^up to /i, ''));
    const bind = `theirLib${requirements.length}`;
    const to = /battlefield/i.test(m[4]) ? 'battlefield' : /exile/i.test(m[4]) ? 'exile' : 'graveyard';
    requirements.push({ kind: 'their-library-pick', bind, playerBind, filter: m[3].trim(), max: n, label: `${m[2]} ${m[3]}card${n === 1 ? '' : 's'}` });
    effects.push({ kind: 'their-library-move', bind, playerBind, to });
    return true;
  }
  if (/^Then that player shuffles\.?$/i.test(c) || /^That player shuffles\.?$/i.test(c)) { effects.push({ kind: 'shuffle-their', playerBind: 'lastSearchedPlayer' }); return true; }
  // "You may play that card for as long as it remains exiled." / "Until end of turn, you may play that card."
  if (/^You may (?:play|cast) (?:that card|it|those cards|them)(?: this turn)? for as long as (?:it|they) remains? exiled\.?$/i.test(c)) { effects.push({ kind: 'permit-recent', until: 'forever', castOnly: /cast/i.test(c) }); return true; }
  if (/^Until end of turn, you may (?:play|cast) (?:that card|it|those cards|them)\.?$/i.test(c)) { effects.push({ kind: 'permit-recent', until: 'turn', castOnly: /cast/i.test(c) }); return true; }
  // Clash: you and an opponent reveal your top cards; you win if yours has the greater mana value. Each player decides
  // whether their card stays on top or goes to the bottom.
  if (/^(?:you )?clash with an opponent\.?$/i.test(c)) {
    const bind = `clash${requirements.length}`;
    requirements.push({ kind: 'clash', bind });
    effects.push({ kind: 'clash', bind });
    return true;
  }
  // "Choose target creature." / "Choose target creature you control and target creature you don't control." — the targets
  // later sentences refer to ("that creature", "those creatures", "the chosen creature").
  if ((m = c.match(/^Choose (target [a-z ,'-]+?)(?: and (target [a-z ,'-]+?))?\.?$/i)) && !/\bcard\b|\bspell\b|graveyard/i.test(c)) {
    H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    if (m[2]) H.targetRequirement(requirements, m[2].toLowerCase(), m[2], { excludeBind: requirements[requirements.length - 1].bind });
    effects.push({ kind: 'note', text: '' });
    return true;
  }
  // "Then those creatures fight each other." (the two creatures targeted)
  if (/^(?:Then )?those creatures fight each other\.?$/i.test(c)) { effects.push({ kind: 'fight', sourceBind: 'firstTarget', targetBind: 'secondTarget' }); return true; }
  // "create a tapped 2/2 black Zombie creature token" — the same token, entering tapped.
  if ((m = c.match(/^(?:you )?create (a|an|one|two|three|four|five|\d+|X) tapped (.+? tokens?(?: with .+)?)\.?$/i)) && !/attacking/i.test(c)) {
    const inner = H.compileSingleClause(ctx.restore(`Create ${m[1]} ${m[2]}.`), { sourceName });
    if (!inner.unsupported.length && inner.effects.length && inner.effects.every(e => e.kind === 'create-token')) { effects.push(...inner.effects.map(e => ({ ...e, tapped: true }))); requirements.push(...inner.requirements); return true; }
  }
  // "that player loses half their life, rounded up." / "Each opponent loses half their life, rounded down."
  if ((m = c.match(/^(that player|target player|target opponent|you) loses? half (?:their|your) life, rounded (up|down)\.?$/i))) {
    const playerBind = /^target/i.test(m[1]) ? H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]) : /^you$/i.test(m[1]) ? null : 'eventPlayer';
    effects.push({ kind: 'life', scope: 'you', amount: { kind: 'half-life', playerBind, roundUp: /up/i.test(m[2]) }, deltaSign: -1, ...(playerBind ? { forPlayerBind: playerBind } : {}) });
    return true;
  }
  // "Target creature can't block this creature this turn."
  if (rx(`^Target creature can'?t block (?:${selfAny}|this creature) this turn\\.?$`, 'i').test(c)) {
    const bind = H.targetRequirement(requirements, 'target creature', 'target creature');
    effects.push({ kind: 'cant-block-source', bind });
    return true;
  }
  // Dire Downdraft: "Target creature's owner puts it on their choice of the top or bottom of their library." (the owner chooses)
  if (/^Target (creature|nonland permanent|permanent|artifact|creature or planeswalker)'s owner puts it on their choice of the top or bottom of their library\.?$/i.test(c)) {
    const bind = H.targetRequirement(requirements, `target ${c.match(/^Target (.+?)'s/i)[1].toLowerCase()}`, 'target');
    const where = `place${requirements.length}`;
    requirements.push({ kind: 'owner-top-bottom', bind: where, targetBind: bind });
    effects.push({ kind: 'to-library', bind, positionBind: where });
    return true;
  }
  // Gaea's Blessing, Memory's Journey: "Target player shuffles up to three target cards from their graveyard into their library."
  if ((m = c.match(rx(`^Target player shuffles up to ${N} target cards from their graveyard into their library\\.?$`, 'i')))) {
    const playerBind = H.playerRequirement(requirements, 'player', 'Target player');
    const bind = `graveTheirs${requirements.length}`;
    requirements.push({ kind: 'their-graveyard-pick', bind, playerBind, max: num(m[1]), label: `up to ${m[1]} cards from their graveyard` });
    effects.push({ kind: 'graveyard-shuffle-in', bind, playerBind });
    return true;
  }
  // Learn: in Commander there is normally no sideboard to fetch a Lesson from, so learning means "you may discard a card;
  // if you do, draw a card" (the player decides).
  if (/^(?:you )?learn\.?$/i.test(c)) {
    const inner = H.compileEffectText('You may discard a card. If you do, draw a card.', { sourceName });
    effects.push(...inner.effects); requirements.push(...inner.requirements);
    return true;
  }
  // Essence Channeler, Star Pupil: "put its counters on target creature you control." (the counters it had as it left)
  if (/^put its counters on (target creature you control|target creature)\.?$/i.test(c)) {
    const bind = H.targetRequirement(requirements, c.match(/on (target [a-z ]+?)\.?$/i)[1].toLowerCase(), 'target creature');
    effects.push({ kind: 'counters-from-event', bind });
    return true;
  }
  // Derevi, Merrow Reejerey: "you may tap or untap target permanent." — the player chooses which.
  if ((m = c.match(/^(?:you may )?tap or untap (target [a-z ]+?)\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    const how = `tapOrUntap${requirements.length}`;
    // "Neither" only when this sentence still carries its "you may"; a stripped "you may" was already asked as a yes/no.
    requirements.push({ kind: 'choose-text', bind: how, options: /^you may/i.test(c) ? ['Tap', 'Untap', 'Neither'] : ['Tap', 'Untap'], label: `Tap or untap ${m[1].replace(/^target /i, 'the ')}?` });
    effects.push({ kind: 'tap-or-untap', bind, howBind: how });
    return true;
  }
  // Mistform Wall: "This creature becomes the creature type of your choice until end of turn." (replaces its creature types)
  if ((m = c.match(rx(`^(${selfAny}|this creature|target creature) becomes the creature type of your choice until end of turn\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature', 'target creature') : 'sourceId';
    const typeBind = `creatureType${requirements.length}`;
    requirements.push({ kind: 'creature-type-choice', bind: typeBind, label: 'Choose a creature type' });
    effects.push({ kind: 'animate', bind, power: null, toughness: null, addTypes: [], subtypes: [], subtypeBind: typeBind, replaceSubtypes: true, keywords: [], colors: null, expires: 'cleanup', typeOnly: false });
    return true;
  }
  // "Target Goblin creature gets +2/+0 until end of turn." (a creature type in the target)
  if ((m = c.match(/^(Target [A-Z][a-z]+(?: creature)?(?: you control)?) gets ([+-]\d+)\/([+-]\d+) until end of turn\.?$/))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'pump', bind, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    return true;
  }
  // "Dragons you control get +1/+0 until end of turn." / "Dragon creatures get +1/+0 until end of turn."
  if ((m = c.match(/^(?:Other )?([A-Z][a-z]+?)s? (?:you control|creatures(?: you control)?) get ([+-]\d+)\/([+-]\d+) until end of turn\.?$/)) && !/^(?:Creature|Artifact|Permanent|Land|Token)$/.test(m[1])) {
    const sub = m[1].replace(/ve$/, 'f');
    effects.push({ kind: 'pump-each', scope: /you control/.test(c) ? 'you' : 'all', filter: `creature|anysub:${sub}`, power: Number(m[2]), toughness: Number(m[3]), expires: 'cleanup' });
    return true;
  }
  // Bounce creatures: "return a blue or black creature you control to its owner's hand." (the player chooses)
  if ((m = c.match(/^return (?:a|an) ((?:[a-z]+ or )?[a-z]+ )?(creature|land|artifact|enchantment|permanent) you control to its owner'?s hand\.?$/i))) {
    const words = (m[1] || '').trim(), colors = words.split(/\s+or\s+/).filter(w => /^(white|blue|black|red|green)$/i.test(w)).map(w => COLOR_OF[w.toLowerCase()]);
    const filter = `${m[2].toLowerCase()}${colors.length ? `|anycolor:${colors.join(',')}` : words ? `|type:${words}` : ''}`;
    const bind = `cards${requirements.length}`;
    requirements.push({ kind: 'card-selection', bind, scope: 'you', filter, amount: 1, label: `Choose a ${words ? `${words} ` : ''}${m[2]} to return` });
    effects.push({ kind: 'bounce-selection', bind });
    return true;
  }
  // Wave Goodbye: "Return each creature without a +1/+1 counter on it to its owner's hand."
  if ((m = c.match(/^Return each creature without an? ([+-]1\/[+-]1|[a-z]+) counter on it to its owner'?s hand\.?$/i))) { effects.push({ kind: 'zone-each', scope: 'all', filter: `creature|nocounter:${m[1]}`, to: 'hand' }); return true; }
  // In Garruk's Wake: "Destroy all creatures you don't control and all planeswalkers you don't control."
  if ((m = c.match(/^Destroy all (creatures|artifacts|enchantments|planeswalkers) you don'?t control and all (creatures|artifacts|enchantments|planeswalkers) you don'?t control\.?$/i))) {
    effects.push({ kind: 'zone-each', scope: 'opponents', filter: `${m[1].replace(/s$/, '')} or ${m[2].replace(/s$/, '')}`, to: 'graveyard', destroy: true });
    return true;
  }
  // Build 77: wipes with qualifiers: "Destroy all nontoken creatures." (Hour of Reckoning), "Destroy all creatures with no counters
  // on them." (Damning Verdict), "Destroy all nonartifact creatures.", "Destroy all non-Dragon creatures.", "Exile all nonland
  // permanents your opponents control." Each qualifier becomes a filter condition; an unknown word leaves the card by hand.
  if ((m = c.match(/^(Destroy|Exile) all ((?:[A-Za-z-]+ )*?)(creatures|artifacts|enchantments|planeswalkers|permanents|lands)( with no counters on them| you don't control| your opponents control| you control)?\.?$/)) && (m[2] || m[4])) {
    const COL = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }, conds = [];
    let ok = true;
    for (const w of m[2].trim().split(/\s+/).filter(Boolean)) {
      const lw = w.toLowerCase();
      if (lw === 'nontoken' || lw === 'token' || lw === 'tapped' || lw === 'untapped' || lw === 'attacking' || lw === 'blocking') conds.push(lw);
      else if (/^non(artifact|creature|land|enchantment|planeswalker|legendary)$/.test(lw)) conds.push(`non:${lw.slice(3)}`);
      else if (/^(artifact|enchantment|legendary)$/.test(lw)) conds.push(`type:${lw}`);
      else if (COL[lw]) conds.push(`color:${COL[lw]}`);
      else if (/^non(white|blue|black|red|green)$/.test(lw)) conds.push(`noncolor:${COL[lw.slice(3)]}`);
      else if (/^non-[A-Z][a-z]+$/.test(w)) conds.push(`nonsub:${w.slice(4)}`);
      else { ok = false; break; }
    }
    if (ok) {
      if (/no counters/.test(m[4] || '')) conds.push('nocounters');
      const scope = /you don't control|your opponents control/.test(m[4] || '') ? 'opponents' : /you control/.test(m[4] || '') ? 'you' : 'all';
      effects.push({ kind: 'zone-each', scope, filter: [m[3].replace(/s$/, ''), ...conds].join('|'), to: m[1] === 'Destroy' ? 'graveyard' : 'exile', destroy: m[1] === 'Destroy' });
      return true;
    }
  }
  // "Destroy all Islands." / "Destroy all Goblins."
  if ((m = c.match(/^(Destroy|Exile) all ([A-Z][a-z]+?)s\.?$/)) && !/^(?:Creature|Artifact|Enchantment|Land|Permanent|Planeswalker)$/.test(m[2])) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: `permanent|anysub:${m[2]}`, to: m[1] === 'Destroy' ? 'graveyard' : 'exile', destroy: m[1] === 'Destroy' });
    return true;
  }
  // Build 79: Sphinx of the Revelation: "you get that many {E}". Electrosiphon: "You get an amount of {E} equal to its mana value."
  if (/^(?:you )?get that many \{E\}\s*\.?$/i.test(c)) { effects.push({ kind: 'player-counter', counter: 'energy', amount: { kind: 'binding', bind: 'eventAmount' } }); return true; }
  if (/^(?:you )?get an amount of \{E\} equal to (?:its|that spell'?s) mana value\.?$/i.test(c)) { effects.push({ kind: 'player-counter', counter: 'energy', amount: { kind: 'binding', bind: 'counteredManaValue' } }); return true; }   // Electrosiphon counters it first
  // Aethersquall Ancient: "Return all other creatures to their owners' hands."
  if ((m = c.match(/^(Return|Destroy|Exile) all other (creatures|permanents|nonland permanents|artifacts)(?: to their owners'? hands)?\.?$/i)) && (/^Return/i.test(m[1]) === /hands/i.test(c))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: m[2].replace(/s$/, '').toLowerCase(), to: /^Return/i.test(m[1]) ? 'hand' : /^Exile/i.test(m[1]) ? 'exile' : 'graveyard', destroy: /^Destroy/i.test(m[1]), notSource: true });
    return true;
  }
  // "create that many 1/1 green Saproling creature tokens."
  if ((m = c.match(/^create that many (.+? tokens?(?: with .+)?)\.?$/i))) {
    const inner = H.compileSingleClause(ctx.restore(`Create X ${m[1]}.`), { sourceName });
    if (!inner.unsupported.length && inner.effects.length && inner.effects.every(e => e.kind === 'create-token')) { effects.push(...inner.effects.map(e => ({ ...e, amount: { kind: 'binding', bind: 'eventAmount' } }))); return true; }
  }
  // "you may exile it." (the card the trigger is about; the player chooses)
  if (/^you may exile (?:it|that card|that creature)\.?$/i.test(c)) {
    const bind = `mayExile${requirements.length}`;
    requirements.push({ kind: 'yes-no', bind, label: 'Exile it?' });
    effects.push({ kind: 'condition', test: 'chosen', bind, skip: 1 }, { kind: 'exile-event-card' });
    return true;
  }
  if (/^You may (?:play|cast) (?:that card|those cards|it|them) this turn\.?$/i.test(c)) { effects.push({ kind: 'permit-recent', until: 'turn', castOnly: /cast/i.test(c) }); return true; }
  // Rousing Refrain: "Exile ~ with three time counters on it." "It gains suspend."
  if ((m = c.match(rx(`^Exile (?:${selfAny}|this spell|this card) with ${N} time counters? on it\\.?$`, 'i')))) { effects.push({ kind: 'exile-self-suspend', amount: num(m[1]) }); return true; }
  if (/^It gains suspend\.?$/i.test(c)) return true;
  if (rx(`^(?:${selfAny}|this creature|it) assigns no combat damage this turn\\.?$`, 'i').test(c)) { effects.push({ kind: 'no-combat-damage' }); return true; }
  // The Tenth Doctor: "Put three time counters on it. If it doesn't have suspend, it gains suspend." (the exiled card)
  if ((m = c.match(rx(`^Put ${N} time counters? on (?:it|that card)\\.?$`, 'i')))) { effects.push({ kind: 'time-counters-recent', amount: num(m[1]) }); return true; }
  if (/^If it doesn'?t have suspend, it gains suspend\.?$/i.test(c)) { effects.push({ kind: 'suspend-recent' }); return true; }
  // Mirror Entity: "Until end of turn, creatures you control have base power and toughness X/X and gain all creature types."
  if ((m = c.match(/^Until end of turn, creatures you control have base power and toughness (\d+|X)\/(\d+|X)( and gain all creature types)?\.?$/i))) {
    effects.push({ kind: 'animate-each', scope: 'you', filter: 'creature', power: m[1], toughness: m[2], addTypes: [], subtypes: [], keywords: m[3] ? ['Changeling'] : [], colors: null, expires: 'cleanup', typeOnly: false });
    return true;
  }
  if (/^each opponent loses life equal to the life (?:they|that player) lost this turn\.?$/i.test(c)) { effects.push({ kind: 'lose-life-lost' }); return true; }
  // Paladin Class: "until end of turn, target attacking creature gets +1/+1 for each other attacking creature and gains double strike."
  if ((m = c.match(/^(?:until end of turn, )?(target attacking creature) gets \+1\/\+1 for each other attacking creature(?: and gains ([a-z ,]+?))?(?: until end of turn)?\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'set-x', amount: { kind: 'count', zone: 'battlefield', filter: 'creature|attacking', minus: 1 } }, { kind: 'pump', bind, power: 'X', toughness: 'X', expires: 'cleanup' });
    for (const k of H.KEYWORD_LIST(m[2] || '')) effects.push({ kind: 'grant-keyword', bind, keyword: k, enabled: true, expires: 'cleanup' });
    return true;
  }
  // Sorcerer Class: "that spell deals damage to each opponent equal to the number of instant and sorcery spells you've cast this turn."
  if ((m = c.match(rx(`^(?:that spell|${selfAny}|this [a-z]+) deals damage to each opponent equal to the number of (instant and sorcery|instant|sorcery|noncreature)? ?spells you'?ve cast this turn\\.?$`, 'i')))) {
    const types = !m[1] ? null : /instant and sorcery/i.test(m[1]) ? ['Instant', 'Sorcery'] : /noncreature/i.test(m[1]) ? null : [cap(m[1].toLowerCase())];
    if (!/noncreature/i.test(m[1] || '')) { effects.push({ kind: 'damage-each', amount: { kind: 'spells-cast-this-turn', types }, creatures: null, players: 'opponents', sourceName }); return true; }
  }
  // Build 79: Blacksmith's Talent: 'create a colorless Equipment artifact token named Sword with "Equipped creature gets +1/+1" and
  // equip {2}.' (the token is an Equipment with that text and that equip cost)
  if ((m = c.match(/^create (?:a|an) colorless Equipment artifact token named ([A-Z][A-Za-z' ]+?) with "([^"]+)" and equip (\{[^}]+\}(?:\{[^}]+\})*)\.?$/i))) {
    effects.push({ kind: 'create-token', amount: 1, name: m[1], typeLine: 'Token Artifact — Equipment', colors: [], oracleText: `${m[2].replace(/\.?$/, '.')}\nEquip ${m[3]}` });
    return true;
  }
  // Build 79: Druid Class: "target land you control becomes a creature with haste and "This creature's power and toughness are
  // each equal to the number of lands you control." It's still a land." (a 0/0 that counts your lands; the text is granted)
  if ((m = c.match(/^(Target land you control) becomes a creature with haste and "(This creature's power and toughness are each equal to the number of (?:lands|creatures|artifacts) you control\.)"\.?(?: It's still a land\.?)?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'animate', bind, power: 0, toughness: 0, addTypes: ['Creature'], subtypes: [], keywords: ['Haste'], colors: null, expires: null }, { kind: 'grant-text', bind, texts: [m[2]] });
    return true;
  }
  // Build 77: Tyrite Sanctum: "Target legendary creature becomes a God in addition to its other types." (a creature type added)
  if ((m = c.match(/^(Target [a-z ]*creature(?: you control)?) becomes? (?:a|an) ([A-Z][a-z]+) in addition to its other (?:creature )?types( until end of turn)?\.?$/)) && !/^(?:Artifact|Enchantment|Land|Creature)$/.test(m[2])) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'animate', bind, power: null, toughness: null, addTypes: [], subtypes: [m[2]], keywords: [], colors: null, expires: m[3] ? 'cleanup' : null, typeOnly: true, subtypeOnly: true });
    return true;
  }
  // Liquimetal Torque: "Target nonland permanent becomes an artifact in addition to its other types until end of turn."
  if ((m = c.match(/^(Target [a-z ]+?) becomes? an? (artifact|enchantment|land) in addition to its other types( until end of turn)?\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'animate', bind, power: null, toughness: null, addTypes: [cap(m[2].toLowerCase())], subtypes: [], keywords: [], colors: null, expires: m[3] ? 'cleanup' : null, typeOnly: true });
    return true;
  }
  // Emblems: 'You get an emblem with "Creatures you control get +2/+2 and have flying."' The game applies the
  // anthem and keyword wordings it understands on permanents (combat.js); other emblem text stays by hand.
  if ((m = c.match(/^You get an emblem with "([^"]+)"\.?$/i)) && /^(?:Other )?[A-Za-z ]*creatures? you control (?:get [+-]\d+\/[+-]\d+(?: and (?:have|gain) [A-Za-z ,]+)?|(?:have|gain) [A-Za-z ,]+)\.?$/i.test(m[1])) {
    effects.push({ kind: 'emblem', text: m[1] });
    return true;
  }
  // --- Classes: "{2}{U}: Level 2" (one level at a time, as a sorcery — checked in legal.js).
  if ((m = c.match(/^Level (\d+)\.?$/i))) { effects.push({ kind: 'class-level', level: Number(m[1]) }); return true; }
  // Guide of Souls (build 79): "put two +1/+1 counters and a flying counter on target attacking creature."
  if ((m = c.match(/^put (a|an|one|two|three|four|\d+) ([+-]1\/[+-]1|[a-z]+(?: [a-z]+)?) counters? and (a|an|one|two|three|\d+) ([+-]1\/[+-]1|[a-z]+(?: [a-z]+)?) counters? on ((?:up to one )?target [a-z ]*?(?:creature|permanent)(?: you control)?)\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[5].toLowerCase().replace(/^up to one /, ''), m[5], /^up to/i.test(m[5]) ? { optional: true } : {});
    effects.push({ kind: 'counter', bind, counter: m[2], amount: num(m[1]) }, { kind: 'counter', bind, counter: m[4], amount: num(m[3]) });
    return true;
  }
  // Time travel (build 79): for each suspended card you own and each permanent you control with a time counter, you may add or
  // remove a time counter. "Time travel three times." repeats it. Asked card by card (gatherCatalogRequirement).
  if ((m = c.match(/^(?:then )?(?:you )?time travel(?: (twice|three times))?\.?$/i))) {
    const bind = `timeTravel${requirements.length}`;
    requirements.push({ kind: 'time-travel', bind, times: !m[1] ? 1 : /twice/i.test(m[1]) ? 2 : 3, label: 'Time travel' });
    effects.push({ kind: 'time-travel', bind });
    return true;
  }
  // Flip cards (Kamigawa, build 79): "flip this creature" / "flip it" / "flip Sasaya" — it becomes its flipped half, for good.
  if (rx(`^(?:then )?flip (?:${selfAny}|it|this creature|this permanent)\\.?$`, 'i').test(c)) { effects.push({ kind: 'flip-self' }); return true; }
  // "transform Ashling" (short name), "transform her" / "him".
  if (rx(`^transform (?:${selfAny}|him|her|it|this creature)\\.?$`, 'i').test(c)) { effects.push({ kind: 'transform', bind: 'sourceId' }); return true; }
  if ((m = c.match(/^proliferate (twice|three times)\.?$/i))) {
    for (let k = 0; k < (/twice/i.test(m[1]) ? 2 : 3); k++) { const bind = `proliferate${requirements.length}`; requirements.push({ kind: 'proliferate', bind, label: 'Choose permanents and/or players with counters' }); effects.push({ kind: 'proliferate', bind }); }
    return true;
  }
  // --- Keyword actions.
  if ((m = c.match(rx(`^Monstrosity ${N}\\.?$`, 'i')))) { effects.push({ kind: 'monstrosity', amount: num(m[1]) }); return true; }
  if ((m = c.match(rx(`^Adapt ${N}\\.?$`, 'i')))) { effects.push({ kind: 'adapt', amount: num(m[1]) }); return true; }
  if ((m = c.match(rx(`^Bolster ${N}\\.?$`, 'i')))) {
    const bind = `bolster${requirements.length}`;
    requirements.push({ kind: 'bolster', bind, label: 'creature to bolster' });
    effects.push({ kind: 'counter', bind, counter: '+1/+1', amount: num(m[1]), optional: true });
    return true;
  }
  if ((m = c.match(rx(`^(${selfAny}|It|Target creature you control|That creature) explores\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'creature you control') : subjectBind(m[1]);
    const choice = `explore${requirements.length}`;
    requirements.push({ kind: 'explore', bind: choice, label: 'explore' });
    effects.push({ kind: 'explore', bind, choiceBind: choice });
    return true;
  }
  if ((m = c.match(rx(`^(${selfAny}|It|Target creature you control|That creature) connives(?: ${N})?\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature you control', 'creature you control') : subjectBind(m[1]);
    const n = m[2] ? num(m[2]) : 1, cardsBind = `discardCards${requirements.length}`;
    requirements.push({ kind: 'discard-cards', bind: cardsBind, scope: 'you', amount: n, plusDraw: typeof n === 'number' ? n : 0 });
    effects.push({ kind: 'draw', scope: 'you', amount: n }, { kind: 'discard', scope: 'you', amount: n, cardsBind }, { kind: 'connive-counters', bind, cardsBind });
    return true;
  }
  if ((m = c.match(/^(?:you )?get ((?:\{E\})+)(?: \([^)]*\))?\s*\.?$/i)) || (m = c.match(rx(`^(?:you )?get ${N} \\{E\\}\\.?$`, 'i')))) {
    const amount = /\{E\}/i.test(m[1]) ? (m[1].match(/\{E\}/gi) || []).length : num(m[1]);
    effects.push({ kind: 'player-counter', counter: 'energy', amount });
    return true;
  }
  if ((m = c.match(rx(`^(?:you )?get (?:an?|${N}) (experience|rad|poison|ticket) counters?\\.?$`, 'i')))) {
    effects.push({ kind: 'player-counter', counter: m[2].toLowerCase(), amount: m[1] ? num(m[1]) : 1 });
    return true;
  }
  if ((m = c.match(rx(`^(Each opponent|Target opponent|Target player|Each player) gets? (?:an?|${N}) (poison|rad) counters?\\.?$`, 'i')))) {
    const scope = H.scopeFromSubject(m[1]);
    const e = { kind: 'player-counter', counter: m[3].toLowerCase(), amount: m[2] ? num(m[2]) : 1, scope: scope.startsWith('target-') ? 'you' : scope };
    if (scope.startsWith('target-')) e.playerBind = H.playerRequirement(requirements, scope === 'target-opponent' ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return true;
  }
  if ((m = c.match(rx(`^[Aa]mass (?:([A-Z][a-z]+) )?${N}\\.?$`)))) { effects.push({ kind: 'amass', type: m[1] || 'Army', amount: num(m[2]) }); return true; }
  if ((m = c.match(rx(`^Incubate ${N}\\.?$`, 'i')))) { effects.push({ kind: 'incubate', amount: num(m[1]) }); return true; }
  if (/^(?:the )?Ring tempts you\.?$/i.test(c)) { effects.push({ kind: 'ring-tempts' }); return true; }
  if ((m = c.match(rx(`^Support ${N}\\.?$`, 'i')))) {
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
  if (compileB49Clause(c, ctx)) return true;
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
  // Umbra armor (totem armor): "If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura."
  const umbra = (game.players || []).flatMap(p => p.deck?.battlefield || []).find(a => a.attachedTo === card?.instanceId && /(?:^|\n)\s*(?:Umbra|Totem) armor\b/i.test(String(definitionFor(game, a)?.oracleText || '').replace(/\([^()]*\)/g, '')));
  if (umbra) {
    card.damageMarked = 0;
    card.deathtouchDamage = false;
    moveCard(game, umbra.instanceId, 'graveyard', {});
    notes.push(`${definitionFor(game, umbra)?.name || 'The Aura'} is destroyed instead (umbra armor).`);
    return true;
  }
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
        const fx = { kind: 'animate', addTypes: effect.addTypes, subtypes: effect.subtypeBind && bindings[effect.subtypeBind] ? [String(bindings[effect.subtypeBind])] : effect.subtypes, ...(effect.replaceSubtypes ? { replaceSubtypes: true } : {}), keywords: effect.keywords, colors: effect.colors, power: effect.power === 'X' ? n : effect.power, toughness: effect.toughness === 'X' ? n : effect.toughness };
        if (effect.expires) fx.expires = effect.expires === 'your-next-turn' ? `turn-start:${controllerId}` : effect.expires;
        hit.card.temporaryEffects.push(fx);
        if (effect.subtypeBind) { notes.push(`${name(hit.card)} becomes a ${fx.subtypes[0] || 'creature'} until end of turn.`); continue; }
        if (effect.subtypeOnly) { notes.push(`${name(hit.card)} is also ${/^[AEIOU]/.test(fx.subtypes[0] || '') ? 'an' : 'a'} ${fx.subtypes[0]}${effect.expires ? ' until end of turn' : ''}.`); continue; }
        notes.push(effect.typeOnly ? `${name(hit.card)} is also ${/^[AEIOU]/.test(effect.addTypes[0]) ? 'an' : 'a'} ${effect.addTypes[0].toLowerCase()}${effect.expires ? ' until end of turn' : ''}.` : `${name(hit.card)} becomes ${fx.power != null ? `a ${fx.power}/${fx.toughness} ` : 'a '}creature${effect.expires ? ' until end of turn' : ''}.`);
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
      return applyCatalogSequenceEffect(game, controllerId, effect, bindings, notes) || applyRound3(game, controllerId, effect, bindings, notes) || applyB49(game, controllerId, effect, bindings, notes);
  }
}

/** Requirement kinds added here, asked by requirements.js. Returns true when handled. */
export function gatherCatalogRequirement(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'time-travel') {
    const rows = () => [...(player.deck.exile || []).filter(c => c.suspended && Number(c.counters?.time || 0) > 0), ...(player.deck.battlefield || []).filter(c => Number(c.counters?.time || 0) > 0)];
    const plan = {};
    for (let k = 0; k < (req.times || 1); k++) {
      for (const c of rows()) {
        const now = Number(c.counters?.time || 0) + (plan[c.instanceId] || 0);
        if (now <= 0) continue;
        const v = ask(`${key}:${k}:${c.instanceId}`, () => ({ ...base, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName} — time travel${req.times > 1 ? ` (${k + 1} of ${req.times})` : ''}`, prompt: `${util.defOf(game, c)?.name || 'Card'} has ${now} time counter${now === 1 ? '' : 's'}.`, definitionId: c.definitionId,
          options: [{ id: 'remove', label: 'Remove a time counter' }, { id: 'add', label: 'Add a time counter' }, { id: 'none', label: 'Leave it' }] }));
        plan[c.instanceId] = (plan[c.instanceId] || 0) + (v === 'remove' ? -1 : v === 'add' ? 1 : 0);
      }
    }
    bindings[req.bind] = plan;
    return true;
  }
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
  if (gatherB49(game, ctx, req, bindings, ask, key, title, base, util)) return true;
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
  return w.replace(/(\d+) or (less|greater|more|fewer)/g, '$1 or_$2').split(/\s+or\s+|,\s*or\s+|\s*\/\s*/).some(alt => {
    let a = alt.trim().replace(/ or_/g, ' or '), ok = true, m;
    if ((m = a.match(/\s*with mana value (\d+) or (less|greater)/))) { ok = m[2] === 'less' ? mv <= Number(m[1]) : mv >= Number(m[1]); a = a.replace(m[0], ''); }
    if ((m = a.match(/\s*with mana value (\d+)/))) { ok = ok && mv === Number(m[1]); a = a.replace(m[0], ''); }
    for (const part of a.split(/[ ,]+/).filter(Boolean)) {
      if (part.startsWith('non')) { if (rx(`\\b${part.slice(3).replace(/-/g, '')}\\b`).test(t)) ok = false; continue; }
      if (part === 'permanent') { if (/\binstant\b|\bsorcery\b/.test(t)) ok = false; continue; }
      if (part === 'historic') { if (!/legendary|artifact|saga/.test(t)) ok = false; continue; }
      if (!rx(`\\b${esc(part.replace(/s$/, ''))}s?\\b`).test(t)) ok = false;
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
const AMONG = '(?:of them|of those cards|from among (?:them|those cards|the revealed cards|the cards revealed this way|the exiled cards))';
const COUNT = '(up to (?:one|two|three|four|five|\\d+|X)|any number of|all|one|two|three|four|five|\\d+|a|an)';

function parsePick(s) {
  // "You may cast a spell with mana value X or less from among them without paying its mana cost." (Aetherworks Marvel)
  const free = s.match(rx(`^(?:Then )?you may cast (?:a|an|one) ([a-z ,/'-]*?)(?:spell|card)( with mana value (?:X|\\d+) or less)? from among (?:them|those cards|the revealed cards|the cards revealed this way|cards revealed this way) without paying (?:its|their) mana cost\\.?$`, 'i'));
  if (free) return { pick: { min: 0, max: 1, filter: `${free[1].trim() || 'nonland'}${free[2] || ''}`.trim(), to: 'cast-free' }, rest: null };
  let m = s.match(rx(`^(?:Then )?(you may )?(?:reveal |put |choose )?${COUNT} (?:([a-z ,/'-]+?) )?(?:cards? )?${AMONG}(?: and put (?:it|them|that card|those cards|the revealed cards))? ${DEST_RE}(?:,? and (?:put )?the (?:rest|other|others|remaining cards?) (.+?)|(, then shuffle))?\\.?$`, 'i'));
  if (!m) m = s.match(rx(`^(?:Then )?(you may )?put ${COUNT} (?:([a-z ,/'-]+?) )?cards? revealed this way ${DEST_RE}(?:,? and (?:put )?the (?:rest|other|others) (.+?))?\\.?$`, 'i'));
  if (!m) return null;
  const may = !!m[1], c = m[2].toLowerCase(), filter = (m[3] || '').trim();
  const dest = DEST(m[4]);
  if (!dest) return null;
  let min = 0, max = 1, all = false;
  if (c === 'all') all = true;
  else if (c === 'any number of') { min = 0; max = 99; }
  else if (c.startsWith('up to')) { min = 0; max = num(c.replace('up to ', '')); }
  else { max = num(c) ?? 1; min = may ? 0 : max; }
  const rest = m[6] ? { to: 'shuffle' } : m[5] ? DEST(m[5]) : null;
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
  const b49 = compileB49Sequence(clauses, i, { sourceName, parts });
  if (b49) return b49;
  const next = k => String(clauses[i + k] || '').replace(/\([^()]*\)/g, '').trim();
  let m;
  const drawnBefore = parts.flatMap(p => p.effects || []).filter(e => e.kind === 'draw' && (e.scope || 'you') === 'you' && !e.bind && typeof e.amount === 'number').reduce((n, e) => n + e.amount, 0);

  if (/^Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield\.?$/i.test(c0)) return { part: { effects: [{ kind: 'living-death' }], requirements: [], unsupported: [] }, consumed: 1 };
  // Sylvan Library.
  if (/^you may draw two additional cards\.?$/i.test(c0) && /^If you do, choose two cards in your hand drawn this turn\.?$/i.test(next(1)) && /^For each of those cards, pay 4 life or put the card on top of your library\.?$/i.test(next(2))) {
    const bind = `sylvan${i}`;
    return { part: { effects: [{ kind: 'sylvan', bind }], requirements: [{ kind: 'sylvan', bind }], unsupported: [] }, consumed: 3 };
  }
  // "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and
  // the rest on the bottom of your library in a random order." (Clifftop Lookout, Evolutionary Leap, The Prismatic Bridge)
  if ((m = c0.match(/^(?:you may )?reveal cards from the top of your library until you reveal (?:a|an) ([a-z ,'-]+?) card\.?$/i))) {
    const put = next(1).match(rx(`^Put (?:that card|it) ${DEST_RE} and the rest (on the bottom of your library in a random order|into your graveyard)\\.?$`, 'i'));
    if (put) return { part: { effects: [{ kind: 'reveal-until', filter: m[1].trim(), dest: DEST(put[1]), rest: /graveyard/i.test(put[2]) ? 'graveyard' : 'bottom' }], requirements: [], unsupported: [] }, consumed: 2 };
  }
  // Sarevok's Tome, Breaching Dragonstorm: "Exile cards from the top of your library until you exile a nonland card. You may cast
  // that card (it) without paying its mana cost [if that spell's mana value is 8 or less]. [If you don't, put that card into your hand.]"
  if (/^exile cards from the top of your library until you exile a nonland card\.?$/i.test(c0) && /^Put \w+ time counters? on (?:it|that card)\.?$/i.test(next(1))) {
    const bind = `exileUntil${i}`, n = num(next(1).match(/^Put (\w+)/i)[1]);
    return { part: { effects: [{ kind: 'exile-until-cast', bind, toHand: false }, { kind: 'time-counters-recent', amount: n }], requirements: [{ kind: 'exile-until-cast', bind, maxMv: -1 }], unsupported: [] }, consumed: 2 };
  }
  if (/^exile cards from the top of your library until you exile a nonland card\.?$/i.test(c0)) {
    const cast = next(1).match(/^You may cast (?:that card|it) without paying its mana cost(?: if (?:that|the) spell'?s mana value is (\d+) or less)?\.?$/i);
    if (cast) {
      const toHand = /^If you don'?t(?: cast (?:it|that card) this way)?, put (?:that card|it) into your hand\.?$/i.test(next(2));
      const bind = `exileUntil${i}`;
      return { part: { effects: [{ kind: 'exile-until-cast', bind, toHand }], requirements: [{ kind: 'exile-until-cast', bind, maxMv: cast[1] ? Number(cast[1]) : null }], unsupported: [] }, consumed: toHand ? 3 : 2 };
    }
  }
  // Valakut Awakening: "Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one."
  if ((m = c0.match(rx(`^Put any number of cards from your hand on the bottom of your library(?: in any order)?, then draw that many cards(?: plus ${N})?\\.?$`, 'i')))) {
    const bind = `handBottom${i}`;
    return { part: { effects: [{ kind: 'hand-bottom-draw', bind, plus: m[1] ? num(m[1]) : 0 }], requirements: [{ kind: 'hand-card', bind, many: true, filter: '', label: 'any number of cards to put on the bottom of your library' }], unsupported: [] }, consumed: 1 };
  }
  // Timetwister family (one sentence with "then", read before the "then" splitter).
  if ((m = c0.match(/^Each player shuffles (their hand and graveyard|the cards from their hand|their hand) into their library, then draws (seven|that many) cards\.?$/i)))
    return { part: { effects: [{ kind: 'twister', graveyard: /graveyard/i.test(m[1]), draw: /that many/i.test(m[2]) ? 'that-many' : 7 }], requirements: [], unsupported: [] }, consumed: 1 };
  if ((m = c0.match(/^Each player discards all the cards in their hand, then draws that many cards( minus one)?\.?$/i)))
    return { part: { effects: [{ kind: 'twister', discard: true, draw: 'that-many', minus: m[1] ? 1 : 0 }], requirements: [], unsupported: [] }, consumed: 1 };
  // Look at / reveal the top N cards, then distribute them.
  if ((m = c0.match(/^(?:You may )?(look at|reveal) the top (card|a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)(?: cards?)? of (your|target player's|target opponent's|that player's|each player's) library(?:,? where X is (.+?))?(?: and put (?:that card|it|them|those cards) (into your hand))?\.?$/i))) {
    const amount = /^card$/i.test(m[2]) ? 1 : num(m[2]);
    const reveal = /reveal/i.test(m[1]);
    const amountExpr = m[4] ? whereXExpr(m[4]) : null;
    if (m[4] && !amountExpr) return null;
    const whose = m[3].toLowerCase();
    if (/each player/.test(whose)) return null;
    // "reveal the top card of your library and put that card into your hand" (Dark Confidant)
    if (m[5]) {
      if (whose !== 'your') return null;
      const bind = `dig${i}`, picks = [{ min: 0, max: 99, all: true, filter: '', to: 'hand' }];
      return { part: { effects: [{ kind: 'dig', bind, amount, amountExpr, picks, rest: { to: 'top' } }], requirements: [{ kind: 'dig', bind, amount, amountExpr, offset: drawnBefore, reveal, picks, rest: { to: 'top' }, label: 'the top card' }], unsupported: [] }, consumed: 1 };
    }
    const playerReq = /target/.test(whose) ? { kind: 'player', bind: `digPlayer${i}`, scope: /opponent/.test(whose) ? 'opponent' : 'player', label: whose.replace(/'s$/, '') } : null;
    const ofPlayer = playerReq ? playerReq.bind : /that player/.test(whose) ? 'eventPlayer' : null;
    const picks = [];
    let rest = null, k = 1;
    for (; k <= 3 && i + k < clauses.length; k++) {
      const s = next(k);
      const p = parsePick(s);
      if (p) { picks.push(p.pick); if (p.rest) { rest = p.rest; k++; break; } continue; }
      // One card: "If it's a creature card, you may reveal it and put it into your hand." / "If it's a land card, put it onto the battlefield."
      const one = amount === 1 && s.match(rx(`^If (?:it'?s|that card is) (?:a|an) ([a-z ,/'-]+?) card( of the chosen type)?(?: with [^,]+)?, (you may )?(?:reveal it and )?(?:put|return) (?:it|that card) ${DEST_RE}\\.?$`, 'i'));
      if (one) { const d = DEST(one[4]); if (!d) break; picks.push({ min: one[3] ? 0 : 1, max: 1, filter: `${one[1]}${one[2] || ''}`, ...d }); continue; }
      const jace = amount === 1 && !picks.length && s.match(/^You may put (?:that card|it) on the bottom of (?:that player's|your|its owner's) library\.?$/i);
      if (jace) { picks.push({ min: 0, max: 1, filter: '', to: 'bottom' }); continue; }
      const otherwise = picks.length && s.match(rx(`^(?:Otherwise|If you don'?t(?: put it into your hand| reveal it)?|If you don'?t put it [^,]+),? (?:you may )?put (?:it|that card) ${DEST_RE}\\.?$`, 'i'));
      if (otherwise) { rest = DEST(otherwise[1]); k++; break; }
      const r = picks.length || amount > 1 ? parseRest(s) : null;
      if (r) { rest = r; k++; break; }
      break;
    }
    // Fact or Fiction: "An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard."
    if (!picks.length && whose === 'your' && /^An opponent separates (?:those|the revealed) cards into two piles\.?$/i.test(next(1)) && /^Put one pile into your hand and the other into your graveyard\.?$/i.test(next(2))) {
      const bind = `piles${i}`;
      return { part: { effects: [{ kind: 'dig', bind, amount, amountExpr, picks: [{ min: 0, max: 99, filter: '', to: 'hand' }], rest: { to: 'graveyard' } }], requirements: [{ kind: 'piles', bind, amount, amountExpr, offset: drawnBefore, label: `the top ${amount} cards` }], unsupported: [] }, consumed: 3 };
    }
    // Just looking (Mishra's Bauble, "look at the top card of target player's library") — shown privately.
    if (!picks.length && !rest) {
      if (!ofPlayer && whose !== 'your') return null;
      const bind = `dig${i}`, look = { kind: 'dig', bind, amount, amountExpr, offset: ofPlayer ? 0 : drawnBefore, reveal, picks: [], rest: { to: 'top', order: 'keep' }, peek: true, playerBind: ofPlayer, label: `the top ${amount === 1 ? 'card' : `${amount} cards`}` };
      return { part: { effects: [{ kind: 'dig', bind, amount, amountExpr, picks: [], rest: look.rest, playerBind: ofPlayer }], requirements: [...(playerReq ? [playerReq] : []), look], unsupported: [] }, consumed: 1 };
    }
    if (ofPlayer && picks.some(p => p.to !== 'bottom' && p.to !== 'top' && p.to !== 'graveyard')) return null;
    const bind = `dig${i}`;
    const req = { kind: 'dig', bind, amount, amountExpr, offset: ofPlayer ? 0 : drawnBefore, reveal, picks, rest: rest || { to: 'top', order: amount > 1 ? 'any' : 'keep' }, playerBind: ofPlayer, label: `the top ${amount === 1 ? 'card' : `${amount} cards`}` };
    return { part: { effects: [{ kind: 'dig', bind, amount, amountExpr, picks, rest: req.rest, playerBind: ofPlayer }], requirements: [...(playerReq ? [playerReq] : []), req], unsupported: [] }, consumed: k };
  }

  // "create a Treasure token and exile the top card of that player's library." (Ragavan): the first instruction, then the impulse.
  const lead = c0.match(/^(.+?) and (exile the top card of (?:your|that player's|target opponent's|defending player's) library(?: face down)?\.?)$/i);
  if (lead) {
    const first = H.compileSingleClause(`${cap(lead[1])}.`, { sourceName });
    const rest = !first.unsupported.length && first.effects.length ? compileCatalogSequence([cap(lead[2]), ...clauses.slice(i + 1)], 0, { sourceName, parts }) : null;
    if (rest) return { part: { effects: [...first.effects, ...rest.part.effects], requirements: [...first.requirements, ...rest.part.requirements], unsupported: [] }, consumed: rest.consumed };
  }
  // Six: "mill three cards. You may put a land card from among them into your hand."
  if ((m = c0.match(/^(?:You )?mill (a|one|two|three|four|five|six|seven|\d+) cards?\.?$/i)) && (m.next = next(1).match(/^(?:Then )?(you may )?(?:return|put) (?:a|an|up to one|one) ([a-z ,/'-]*?)cards? from among (?:them|the milled cards|those cards|cards milled this way) (?:into|to) your hand\.?$/i))) {
    const amount = num(m[1]), bind = `dig${i}`, picks = [{ min: m.next[1] ? 0 : 1, max: 1, filter: m.next[2].trim(), to: 'hand' }], rest = { to: 'graveyard', mill: true };
    return { part: { effects: [{ kind: 'dig', bind, amount, picks, rest }], requirements: [{ kind: 'dig', bind, amount, offset: drawnBefore, reveal: true, picks, rest, label: `the ${amount} cards you mill` }], unsupported: [] }, consumed: 2 };
  }
  // Impulse draw: "Exile the top card of your library. You may play that card this turn."
  if ((m = c0.match(/^Exile the top (card|a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X)(?: cards?)? of (your|that player's|target opponent's|defending player's) library(?: face down)?\.?$/i))) {
    const amount = /^card$/i.test(m[1]) ? 1 : num(m[1]);
    const whose = m[2].toLowerCase();
    const libPlayerReq = /target/.test(whose) ? { kind: 'player', bind: `impulsePlayer${i}`, scope: 'opponent', label: 'target opponent' } : null;
    const libPlayer = libPlayerReq ? libPlayerReq.bind : /that player/.test(whose) ? 'eventPlayer' : /defending/.test(whose) ? 'defendingPlayer' : null;
    let k = 1, choose = null;
    const ch = next(1).match(/^Choose (one|a card) of them\.?$/i);
    if (ch) { choose = true; k = 2; }
    const s = next(k);
    const p = s.match(/^(?:Until (end of turn|the end of your next turn|your next end step),? )?you may (play|cast) (that card|those cards|them|it|the exiled cards?|cards exiled this way|that spell)(?: this turn| until (end of turn|the end of your next turn)| for as long as (?:it|they|that card|those cards) remains? exiled)?( without paying (?:its|their) mana costs?)?\.?$/i)
      || s.match(/^(?:Until (end of turn|the end of your next turn),? )?you may (play|cast) (lands and cast spells|spells) from among (?:them|those cards|the exiled cards)(?: this turn| until (end of turn|the end of your next turn))?( without paying (?:its|their) mana costs?)?\.?$/i);
    if (!p) {
      // Just exiled (Necropotence, Mystic Forge): no permission to play it.
      if (choose || libPlayer) return null;
      return { part: { effects: [{ kind: 'impulse', amount, until: 'none', noPermission: true }], requirements: [], unsupported: [] }, consumed: 1 };
    }
    const until = /as long as/i.test(s) ? 'forever' : /next turn/i.test(p[1] || p[4] || '') ? 'next-turn' : 'turn';
    const bind = choose ? `impulse${i}` : null;
    const requirements = choose ? [{ kind: 'dig', bind, amount, offset: drawnBefore, picks: [{ min: 1, max: 1, filter: '', to: 'exile-play' }], rest: { to: 'exile' }, label: `the top ${amount} cards`, chooseOnly: true }] : [];
    if (libPlayer && choose) return null;
    return { part: { effects: [{ kind: 'impulse', amount, until, castOnly: /cast/i.test(p[2]) && !/lands/i.test(p[3]), free: !!p[5], chooseBind: bind, libPlayer }], requirements: [...(libPlayerReq ? [libPlayerReq] : []), ...requirements], unsupported: [] }, consumed: k + 1 };
  }

  // One-sentence form: "Target opponent reveals their hand and you choose a nonland card from it. Exile that card (until this
  // creature leaves the battlefield)." (Brain Maggot, Kitesail Freebooter) / "… That player discards that card."
  if ((m = c0.match(/^(target opponent|target player|that player) reveals (?:their|his or her) hand and you choose (a|an|one) ([a-z ,/'-]+? )?card from it\.?$/i))) {
    const fin = next(1).match(/^(?:That player discards that card|Exile that card( until (?:this creature|SELFNAME|this artifact|this enchantment) leaves the battlefield)?)\.?$/i);
    if (fin) {
      const bindPlayer = /^that/i.test(m[1]) ? 'eventPlayer' : `player${i}`;
      const requirements = /^that/i.test(m[1]) ? [] : [{ kind: 'player', bind: bindPlayer, scope: /opponent/i.test(m[1]) ? 'opponent' : 'player', label: m[1].toLowerCase() }];
      const pick = `handPick${i}`;
      requirements.push({ kind: 'hand-pick', bind: pick, playerBind: bindPlayer, filter: (m[3] || '').trim(), min: 1, max: 1, label: `a ${(m[3] || '').trim()} card from their hand`.replace(/\s+/g, ' ') });
      return { part: { effects: [{ kind: 'hand-pick-move', playerBind: bindPlayer, cardsBind: pick, to: /discard/i.test(fin[0]) ? 'graveyard' : 'exile', untilLeaves: !!fin[1] }], requirements, unsupported: [] }, consumed: 2 };
    }
  }
  // Hand disruption: "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card."
  if ((m = c0.match(/^(Target opponent|Target player|Each opponent) reveals (?:their|his or her) hand\.?$/i))) {
    const ch = next(1).match(/^You (?:may )?choose (a|an|up to (?:one|two|three|\d+)|one|two|three|any number of) ([a-z ,/'-]+? )?cards? from (?:it|their hand|among them|those cards)(?: with mana value (\d+) or (less|greater))?\.?$/i);
    const fin = next(2).match(/^(?:That player|They|Its owner) (discards? (?:that card|those cards|the chosen cards?|it)|exiles? (?:that card|it)|puts? (?:that card|it) on the bottom of their library)\.?$/i)
      || next(2).match(/^Exile (?:that card|it|those cards)( until (?:this creature|SELFNAME|this artifact|this enchantment) leaves the battlefield)?\.?$/i);
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
    return { part: { effects: [{ kind: 'hand-pick-move', playerBind: bindPlayer, cardsBind: pick, to, untilLeaves: !!fin[1] && /^Exile/i.test(fin[0]) }], requirements, unsupported: [] }, consumed: 3 };
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
  if (effect.kind === 'hand-bottom-draw') {
    const ids = [].concat(bindings[effect.bind] || []).filter(id => controller.deck.hand.some(c => c.instanceId === id));
    for (const id of ids) moveCard(game, id, 'library', { position: 'bottom', onEvent: emit });
    H.applyEffectsUnsafe(game, controllerId, [{ kind: 'draw', scope: 'you', amount: ids.length + Number(effect.plus || 0) }], bindings);
    notes.push(`${controller.displayName} puts ${ids.length} card${ids.length === 1 ? '' : 's'} on the bottom and draws ${ids.length + Number(effect.plus || 0)}.`);
    return true;
  }
  if (effect.kind === 'exile-until-cast') {
    const r = bindings[effect.bind] || {};
    const lib = controller.deck.remainingLibrary || [];
    const n = r.hit ? lib.findIndex(c => c.instanceId === r.hit) + 1 : lib.length;
    const exiled = lib.slice(0, Math.max(0, n)).map(c => c.instanceId);
    for (const id of exiled) moveCard(game, id, 'exile', { onEvent: emit });
    bindings.lastMoved = r.hit ? [r.hit] : [];
    if (r.hit && r.cast) { game.flow = game.flow || {}; game.flow.freeCast = { playerId: controllerId, instanceId: r.hit }; notes.push(`${controller.displayName} exiles ${exiled.length} card${exiled.length === 1 ? '' : 's'} and casts ${nameOf(r.hit)} without paying its mana cost.`); }
    else if (r.hit && effect.toHand) { moveCard(game, r.hit, 'hand', { onEvent: emit }); notes.push(`${nameOf(r.hit)} goes to ${controller.displayName}'s hand.`); }
    else notes.push(r.hit ? `${controller.displayName} exiles ${nameOf(r.hit)} and doesn't cast it.` : `${controller.displayName} finds no nonland card.`);
    return true;
  }
  if (effect.kind === 'reveal-until') {
    const lib = controller.deck.remainingLibrary || [];
    const at = lib.findIndex(c => cardFitsWords(definitionFor(game, c), effect.filter));
    const revealed = at < 0 ? [...lib] : lib.slice(0, at + 1);
    const hit = at < 0 ? null : lib[at];
    if (hit) moveTo(game, hit.instanceId, effect.dest || { to: 'hand' }, emit, controllerId);
    const rest = revealed.filter(c => c !== hit);
    if (effect.rest === 'graveyard') for (const c of rest) moveCard(game, c.instanceId, 'graveyard', { onEvent: emit });
    else {
      for (const c of rest) { const k = lib.indexOf(c); if (k >= 0) lib.splice(k, 1); }
      for (let j = rest.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [rest[j], rest[k]] = [rest[k], rest[j]]; }
      lib.push(...rest);
    }
    bindings.lastMoved = hit ? [hit.instanceId] : [];
    notes.push(hit ? `${controller.displayName} reveals ${revealed.length} card${revealed.length === 1 ? '' : 's'} and finds ${nameOf(hit.instanceId)}.` : `${controller.displayName} reveals their whole library and finds no ${effect.filter} card.`);
    return true;
  }
  if (effect.kind === 'dig') {
    const answer = bindings[effect.bind] || { groups: [], rest: [] };
    const owner = effect.playerBind ? playerById(game, bindings[effect.playerBind]) || controller : controller;
    const lib = owner.deck.remainingLibrary;
    const n = effect.amountExpr ? resolveAmount(game, controllerId, effect.amountExpr, bindings) : resolveAmount(game, controllerId, effect.amount, bindings);
    if (effect.amountExpr) bindings.X = n;
    const top = new Set(lib.slice(0, Math.max(0, n)).map(c => c.instanceId));
    (answer.groups || []).forEach((ids, g) => {
      for (const id of ids || []) {
        if (!lib.some(c => c.instanceId === id)) continue;
        top.delete(id);
        const d = effect.picks[g];
        const pd = definitionFor(game, locateCardInGame(game, id)?.card);
        bindings.__lastManaValue = Number(pd?.manaValue ?? pd?.cmc ?? 0);
        if (d.to === 'cast-free') {
          // Cast it now without paying its mana cost (the player chose it); it waits in exile while it is cast.
          moveCard(game, id, 'exile', { onEvent: emit });
          game.flow = game.flow || {};
          game.flow.freeCast = { playerId: controllerId, instanceId: id };
          notes.push(`${controller.displayName} casts ${nameOf(id)} without paying its mana cost.`);
          continue;
        }
        const mv = moveTo(game, id, d, emit, controllerId);
        // Expressive Iteration: "exile one of them. You may play the exiled card this turn."
        if (d.to === 'exile-play' && mv?.card) mv.card.playPermission = { playerId: controllerId, until: 'turn', grantedTurn: game.turnNumber, castOnly: false, free: false };
        notes.push(`${controller.displayName} puts ${nameOf(id)} ${d.to === 'hand' ? 'into their hand' : d.to === 'battlefield' ? 'onto the battlefield' : d.to === 'graveyard' ? 'into their graveyard' : d.to === 'bottom' ? 'on the bottom of their library' : 'on top of their library'}.`);
      }
    });
    let rest = (answer.rest && answer.rest.length ? answer.rest : [...top]).filter(id => top.has(id));
    for (const id of top) if (!rest.includes(id)) rest.push(id);
    const r = effect.rest || { to: 'top' };
    if (r.to === 'shuffle') { H.shuffle(lib); notes.push(`${owner.displayName} shuffles their library.`); emit({ type: 'library-looked', playerId: controllerId }); return true; }
    if (r.order === 'random') H.shuffle(rest);
    if (r.to === 'top' || r.to === 'keep') {
      // Back on top in the chosen order (first = top).
      for (const id of [...rest].reverse()) moveTo(game, id, { to: 'top' }, emit, controllerId);
    } else {
      for (const id of rest) { moveTo(game, id, r, emit, controllerId); if (r.mill) emit({ type: 'mill', playerId: owner.playerId, sourceId: id, amount: 1 }); }
      if (rest.length) notes.push(`${rest.length} other card${rest.length === 1 ? '' : 's'} ${r.to === 'graveyard' ? 'go to the graveyard' : r.to === 'hand' ? 'go to the hand' : r.to === 'exile' ? 'are exiled' : 'go on the bottom of the library'}.`);
    }
    emit({ type: 'library-looked', playerId: controllerId });
    return true;
  }
  if (effect.kind === 'impulse') {
    const n = Math.max(0, resolveAmount(game, controllerId, effect.amount, bindings));
    const libOwner = effect.libPlayer ? playerById(game, bindings[effect.libPlayer]) : controller;
    if (!libOwner) { notes.push('There is no library to exile from.'); return true; }
    const ids = libOwner.deck.remainingLibrary.slice(0, n).map(c => c.instanceId);
    const chosen = effect.chooseBind ? new Set((bindings[effect.chooseBind]?.groups || [])[0] || []) : null;
    for (const id of ids) {
      const moved = moveCard(game, id, 'exile', { onEvent: emit });
      if (!effect.noPermission && (!chosen || chosen.has(id))) moved.card.playPermission = { playerId: controllerId, until: effect.until, grantedTurn: game.turnNumber, castOnly: !!effect.castOnly, free: !!effect.free };
      // Another player's card: kept with your exiled cards so you can cast it (it still belongs to its owner).
      if (libOwner.playerId !== controllerId) {
        const at = libOwner.deck.exile.indexOf(moved.card);
        if (at >= 0) { libOwner.deck.exile.splice(at, 1); controller.deck.exile.push(moved.card); }
      }
    }
    bindings.lastMoved = ids; bindings.lastCreated = [];
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
      } else {
        moveTo(game, id, { to: effect.to }, emit, controllerId);
        // "until this creature leaves the battlefield": it goes back to its owner's hand then (triggers.js).
        const src = effect.untilLeaves ? locateCardInGame(game, bindings.sourceId) : null;
        if (src?.zone === 'battlefield') src.card.untilLeavesExileHand = [...(src.card.untilLeavesExileHand || []), id];
        notes.push(`${name} is ${effect.to === 'exile' ? 'exiled' : 'put on the bottom of its owner’s library'}.`);
      }
    }
    if (!ids.length) notes.push(`${p.displayName} reveals their hand; nothing is chosen.`);
    return true;
  }
  return false;
}

/** Resolve-time choices for the sequences above. */
export function gatherCatalogSequenceRequirement(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'piles') {
    // Fact or Fiction: an opponent (you choose which) separates the cards into two piles; you choose one.
    const amount = req.amountExpr ? resolveAmount(game, player.playerId, req.amountExpr, bindings) : Number(req.amount || 0);
    const cards = (player.deck.remainingLibrary || []).slice(Number(req.offset || 0), Number(req.offset || 0) + amount);
    const opps = (game.players || []).filter(q => !q.eliminated && q.playerId !== player.playerId);
    if (!cards.length || !opps.length) { bindings[req.bind] = { groups: [cards.map(c => c.instanceId)], rest: [] }; return true; }
    const sep = opps.length === 1 ? opps[0].playerId : ask(`${key}:opponent`, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: 'Choose the opponent who separates the cards into two piles.', options: opps.map(q => ({ id: q.playerId, label: q.displayName, playerId: q.playerId })) }));
    const pile1 = ask(`${key}:separate`, () => ({ ...base, playerId: sep, cancellable: false, kind: 'choose-many', title: `${ctx.sourceName} — separate into two piles`, prompt: `${player.displayName} reveals these cards. Choose the cards for pile 1; the rest are pile 2.`, options: cards.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: 0, max: cards.length }));
    const one = new Set([].concat(pile1 || [])), p1 = cards.filter(c => one.has(c.instanceId)).map(c => c.instanceId), p2 = cards.filter(c => !one.has(c.instanceId)).map(c => c.instanceId);
    const names = ids => ids.map(id => util.defOf(game, cards.find(c => c.instanceId === id))?.name).join(', ') || 'no cards';
    const pick = ask(`${key}:pile`, () => ({ ...base, cancellable: false, kind: 'choose-one', title, prompt: 'Put one pile into your hand and the other into your graveyard.', options: [{ id: 1, label: `Pile 1: ${names(p1)}` }, { id: 2, label: `Pile 2: ${names(p2)}` }] }));
    bindings[req.bind] = { groups: [pick === 2 ? p2 : p1], rest: pick === 2 ? p1 : p2 };
    return true;
  }
  if (req.kind === 'dig') {
    const owner = req.playerBind ? util.playerById(game, bindings[req.playerBind]) || player : player;
    const amount = req.amountExpr ? resolveAmount(game, player.playerId, req.amountExpr, bindings) : String(req.amount).toUpperCase() === 'X' ? Number(bindings.X || 0) : Number(req.amount || 0);
    if (req.amountExpr) bindings.X = amount;
    const cards = (owner.deck.remainingLibrary || []).slice(Number(req.offset || 0), Number(req.offset || 0) + amount);
    if (req.peek) {
      if (cards.length) ask(`${key}:peek`, () => ({ ...base, cancellable: false, kind: 'choose-one', private: true, title: `${ctx.sourceName} — ${owner.playerId === player.playerId ? 'your' : `${owner.displayName}'s`} library`, prompt: `The top of ${owner.playerId === player.playerId ? 'your' : `${owner.displayName}'s`} library: ${cards.map(c => util.defOf(game, c)?.name).join(', ')}.`, options: [{ id: 'ok', label: 'OK' }] }));
      bindings[req.bind] = { groups: [], rest: cards.map(c => c.instanceId) };
      return true;
    }
    const left = [...cards], groups = [];
    req.picks.forEach((p, g) => {
      const chosenType = locateCardInGame(game, bindings.sourceId)?.card?.chosenCreatureType || '';
      const words = String(p.filter || '').replace(/\bX\b/, String(bindings.X ?? 0)).replace(/\bof the chosen type\b/i, chosenType ? `${chosenType}` : 'NO-CHOSEN-TYPE');
      const fits = left.filter(c => cardFitsWords(util.defOf(game, c), words) && (p.to !== 'cast-free' || !/\bLand\b/.test(util.defOf(game, c)?.typeLine || '')));
      if (p.all) { groups.push(fits.map(c => c.instanceId)); for (const c of fits) left.splice(left.indexOf(c), 1); return; }
      const max = Math.min(p.max === 'X' ? Number(bindings.X || 0) : p.max, fits.length), min = Math.min(p.min === 'X' ? Number(bindings.X || 0) : p.min, max);
      if (max === 0) { groups.push([]); return; }
      const where = p.to === 'cast-free' ? 'to cast without paying its mana cost' : p.to === 'hand' ? 'into your hand' : p.to === 'battlefield' ? `onto the battlefield${p.tapped ? ' tapped' : ''}` : p.to === 'graveyard' ? 'into your graveyard' : p.to === 'exile-play' ? 'to play' : p.to === 'bottom' ? 'on the bottom' : 'on top';
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
  const pronBind = s => rx(`^${selfAny}$|^this creature$`, 'i').test(s) ? 'sourceId' : /^it$/i.test(s) ? 'eventCard' : 'thatCard';

  // Copies: "create a token that's a copy of that creature", "… except it has haste", "a tapped token …".
  if ((m = c.match(rx(`^(?:You may )?create (a|two|three|X) (tapped )?tokens? that'?s? (?:are )?(?:a )?cop(?:y|ies) of ${PRON}(?:, except (it has haste|it isn't legendary|it's not legendary|it has haste and it isn't legendary|it isn't legendary and it has haste))?\\.?$`, 'i')))) {
    effects.push({ kind: 'copy-of', bind: pronBind(m[3]), amount: num(m[1]) ?? 1, tapped: !!m[2], haste: /haste/i.test(m[4] || ''), nonlegendary: /legendary/i.test(m[4] || '') });
    return true;
  }
  if ((m = c.match(/^(?:that creature's|its) controller creates a token that'?s a copy of (that creature|it)\.?$/i))) {
    effects.push({ kind: 'copy-of', bind: pronBind(m[1]), amount: 1, forItsController: true });
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
  if ((m = c.match(rx(`^(${selfAny}|It|That creature|That permanent|Target creature|Those creatures|Enchanted creature) (?:doesn'?t|don'?t) untap during (?:its|their) controller'?s? next untap step\\.?$`, 'i')))) {
    if (/^those/i.test(m[1])) { effects.push({ kind: 'skip-untap-recent' }); return true; }
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, 'target creature', 'target creature') : /^enchanted/i.test(m[1]) ? '__attached' : m[1].match(rx(`^${selfAny}$`, 'i')) ? 'sourceId' : 'lastTarget';
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
  if ((m = c.match(rx(`^(?:${selfAny}|It|This enchantment|This artifact) deals ${N} damage to (that player|that creature|that permanent|that player or planeswalker|defending player|each opponent and each creature they control)\\.?$`, 'i')))) {
    if (/each opponent/i.test(m[2])) return false;
    effects.push({ kind: 'damage', amount: num(m[1]), bind: /player/i.test(m[2]) ? (/defending/i.test(m[2]) ? 'defendingPlayer' : 'eventPlayer') : 'thatCard', sourceName });
    return true;
  }
  if ((m = c.match(rx(`^(that player|its controller|defending player|that creature's controller) (loses|gains) ${N} life\\.?$`, 'i')))) {
    const forPlayerBind = /defending/i.test(m[1]) ? 'defendingPlayer' : /controller/i.test(m[1]) ? '__thatController' : 'eventPlayer';
    effects.push({ kind: 'life', scope: 'you', amount: num(m[3]), deltaSign: /gain/i.test(m[2]) ? 1 : -1, forPlayerBind });
    return true;
  }
  if ((m = c.match(rx(`^defending player loses ${N} life and you gain ${N} life\\.?$`, 'i')))) {
    effects.push({ kind: 'life', scope: 'you', amount: num(m[1]), deltaSign: -1, forPlayerBind: 'defendingPlayer' }, { kind: 'life', scope: 'you', amount: num(m[2]), deltaSign: 1 });
    return true;
  }
  // Mill / draw small forms.
  if ((m = c.match(/^(?:You )?mills? (?:a|one) card\.?$/i))) { effects.push({ kind: 'mill', scope: 'you', amount: 1 }); return true; }
  if ((m = c.match(/^(?:You )?(?:take|takes) an extra turn after this one\.?$/i))) { effects.push({ kind: 'extra-turn', playerBind: null }); return true; }
  // Counters from the event / on the source.
  if ((m = c.match(rx(`^put that many ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters on (${selfAny}|it|target creature you control|target creature)\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[2]) ? H.targetRequirement(requirements, m[2].toLowerCase(), m[2]) : subjectBind(m[2]);
    effects.push({ kind: 'counter', bind, counter: m[1], amount: { kind: 'binding', bind: 'eventAmount' } });
    return true;
  }
  if ((m = c.match(rx(`^Remove (?:a|an|one|${N}) ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters? from (${selfAny}|it)\\.?$`, 'i')))) {
    effects.push({ kind: 'remove-counter', bind: subjectBind(m[3]), counter: m[2], amount: num(m[1]) ?? 1 });
    return true;
  }
  // Equipment: "attach this Equipment to it" (Hero's Blade, Cryptic Coat).
  if ((m = c.match(/^(?:you may )?attach (this Equipment|it|this Aura|that Equipment) to (it|that creature|target creature you control)\.?$/i))) {
    const creatureBind = /^target/i.test(m[2]) ? H.targetRequirement(requirements, 'target creature you control', 'creature you control') : pronBind(m[2]);
    // Hammer of Nazahn: "Whenever … another Equipment you control enters, you may attach that Equipment to …"
    effects.push({ kind: 'attach', equipmentBind: /^that Equipment$/i.test(m[1]) ? 'eventCard' : 'sourceId', creatureBind });
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
  if ((m = c.match(rx(`^sacrifice (${selfAny}|it) unless you (pay ((?:\\{[^}]+\\})+)|pay (\\d+|one|two|three|four|five) life)\\.?$`, 'i')))) {
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
  if ((m = c.match(/^(Up to|One or) (two|three|four|five|\d+|X) target creatures? can'?t block this turn\.?$/i))) {
    const bind = `multi${requirements.length}`, max = num(m[2]);
    requirements.push({ kind: 'multi-target', bind, scope: 'target creature', min: /^one/i.test(m[1]) ? 1 : 0, max, label: `Choose ${m[1].toLowerCase()} ${m[2]} creatures` });
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
  if ((m = c.match(rx(`^(?:This spell|${selfAny}|[A-Z][^.]*?) deals ${N} damage to each creature (without|with) flying\\.?$`, 'i')))) {
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
  if ((m = c.match(rx(`^(?:you )?create ${N} (tapped )?(Treasure|Food|Clue|Blood|Map|Gold|Powerstone|Lander|Mutagen|Junk|Shard) tokens?\\.?$`, 'i')))) {
    const name = cap(m[3].toLowerCase());
    effects.push({ kind: 'create-token', amount: num(m[1]), name, typeLine: `Token ${name === 'Shard' ? 'Enchantment' : 'Artifact'} — ${name}`, oracleText: TOKEN_TEXT[name], tapped: !!m[2] });
    return true;
  }
  if ((m = c.match(rx(`^(?:you )?create ${N} (tapped )?(\\d+)\\/(\\d+) ([a-z ]*?)((?:[A-Z][a-z'-]+ )+)(?:artifact )?creature tokens?(?: with ([a-z ,]+?))?(?: and)?(?: with)? "([^"]+)"\\.?$`)))) {
    const colors = m[5].split(/\s+/).map(w => COLOR_OF[w]).filter(Boolean);
    const subtype = m[6].trim();
    effects.push({ kind: 'create-token', amount: num(m[1]), tapped: !!m[2], power: Number(m[3]), toughness: Number(m[4]), name: subtype, typeLine: `Token ${/artifact/i.test(c) ? 'Artifact ' : ''}Creature — ${subtype}`, colors, keywords: H.KEYWORD_LIST(m[7] || '').map(cap), oracleText: m[8] });
    return true;
  }
  // Werewolves: "if no spells were cast last turn, transform this creature." / "if a player cast two or more spells last turn, …"
  if ((m = c.match(rx(`^if (no spells were cast last turn|a player cast (two|three) or more spells last turn), transform (?:${selfAny}|this creature|it)\\.?$`, 'i')))) {
    effects.push({ kind: 'condition', test: 'last-turn-spells', none: /^no/i.test(m[1]), atLeast: m[2] ? num(m[2]) : 0, skip: 1 }, { kind: 'transform', bind: 'sourceId' });
    return true;
  }
  // Animate Dead / Necromancy: the creature card already returned as the Aura resolved (ops.js), so these do nothing more.
  if (/^(?:if it'?s on the battlefield, )?it loses "enchant creature card in (?:a|your) graveyard" and gains "enchant creature put onto the battlefield with this Aura\.?"\.?$/i.test(c)) { effects.push({ kind: 'note', text: 'It now enchants the returned creature.' }); return true; }
  if (/^Return enchanted creature card to the battlefield under your control and attach this Aura to it\.?$/i.test(c)) { effects.push({ kind: 'note', text: 'The creature returned to the battlefield with this Aura attached.' }); return true; }
  if (/^(?:that creature's|enchanted creature's) controller sacrifices (?:it|that creature)\.?$/i.test(c)) { effects.push({ kind: 'sacrifice', bind: '__attached', soft: true }); return true; }
  // Extra combat: "After this phase, there is an additional combat phase (followed by an additional main phase)."
  if (/^(?:and )?after this (?:phase|main phase|combat phase|combat), there is an additional combat phase(?: followed by an additional main phase)?\.?$/i.test(c)) { effects.push({ kind: 'extra-combat' }); return true; }
  if ((m = c.match(/^untap all (creatures you control|attacking creatures|creatures that attacked this turn|attacking creatures you control)(?: and after this phase, there is an additional combat phase(?: followed by an additional main phase)?)?\.?$/i))) {
    effects.push({ kind: 'untap-each', scope: 'you', filter: /attacked this turn/i.test(m[1]) ? 'creature|attacked' : /attacking/i.test(m[1]) ? 'creature|attacking' : 'creature' });
    if (/additional combat/i.test(c)) effects.push({ kind: 'extra-combat' });
    return true;
  }
  // Thassa's Oracle; "you win the game" / "you lose the game".
  if (/^If X is greater than or equal to the number of cards in your library, you win the game\.?$/i.test(c)) { effects.push({ kind: 'condition', test: 'x-ge-library', skip: 1 }, { kind: 'game-result', win: true }); return true; }
  if ((m = c.match(/^(?:you )?(win|lose) the game\.?$/i))) { effects.push({ kind: 'game-result', win: /win/i.test(m[1]) }); return true; }
  if ((m = c.match(/^(Each opponent|Each player|Target opponent|Target player) loses life equal to (?:that card's|its|the revealed card's|the exiled card's) mana value\.?$/i))) {
    const scope = H.scopeFromSubject(m[1]);
    const e = { kind: 'life', scope: scope.startsWith('target-') ? 'you' : scope, amount: { kind: 'binding', bind: '__lastManaValue' }, deltaSign: -1 };
    if (scope.startsWith('target-')) e.bind = H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]);
    effects.push(e);
    return true;
  }
  // Oblivion Ring / Banishing Light / Fiend Hunter / Flickerwisp.
  if ((m = c.match(rx(`^(?:you may )?exile (another target|target|up to one target) ([^.]+?) until ${selfAny} leaves the battlefield\\.?$`, 'i')))) {
    const bind = H.targetRequirement(requirements, `target ${m[2].toLowerCase()}`, `${m[1]} ${m[2]}`, { notSource: /another/i.test(m[1]), optional: /up to/i.test(m[1]) });
    effects.push({ kind: 'exile', bind, untilLeaves: true, ...(/up to/i.test(m[1]) ? { optionalTarget: true } : {}) });
    return true;
  }
  if ((m = c.match(/^return (?:the exiled card|the exiled cards|all cards exiled with (?:this|SELFNAME)[a-z ]*?|the exiled permanent) to (the battlefield under (?:its owner's|their owners') control|(?:its|their) owner's hands?)\.?$/i))) {
    effects.push({ kind: 'return-linked', to: /hand/i.test(m[1]) ? 'hand' : 'battlefield' });
    return true;
  }
  if ((m = c.match(/^return (that card|it|the exiled card|them|those cards|that creature) to the battlefield (?:tapped )?under (its owner's|your|their owners'|their owner's|its owner'?s?) control(?: at the beginning of the next end step| at the beginning of your next upkeep)?\.?$/i))) {
    const ret = { kind: 'return-ids', fromBind: '__recent', yours: /^your$/i.test(m[2]), tapped: /tapped/i.test(c) };
    if (/end step|upkeep/i.test(c)) effects.push({ kind: 'delay', when: /upkeep/i.test(c) ? { event: 'upkeep', whose: 'owner' } : { event: 'end-step', whose: 'any', sameTurn: true }, effects: [ret], requirements: [] });
    else effects.push(ret);
    return true;
  }
  // Nim Deathmantle: "return that card to the battlefield and attach this Equipment to it."
  if ((m = c.match(rx(`^return (?:that card|it) to the battlefield( tapped)?(?: under (its owner's|your) control)? and attach (?:this Equipment|${selfAny}) to it\\.?$`, 'i')))) {
    effects.push({ kind: 'return-ids', fromBind: '__recent', yours: /your/i.test(m[2] || ''), tapped: !!m[1] }, { kind: 'attach', equipmentBind: 'sourceId', creatureBind: '__returned' });
    return true;
  }
  // Mana kept through the turn (Birgi, Savage Ventmaw).
  if (/^Until end of turn, you don'?t lose this mana as steps and phases end\.?$/i.test(c)) { effects.push({ kind: 'keep-mana' }); return true; }
  // "Untap those creatures." / "Untap them." — the creatures the instruction before changed.
  if (/^Untap (?:those creatures|them|those permanents)\.?$/i.test(c)) { effects.push({ kind: 'untap-those' }); return true; }
  if ((m = c.match(/^Gain control of all (creatures|artifacts|permanents)( target player controls| your opponents control)? until end of turn\.?$/i))) {
    const playerBind = /target player/i.test(m[2] || '') ? H.playerRequirement(requirements, 'player', 'target player') : null;
    effects.push({ kind: 'gain-control-each', filter: m[1].toLowerCase().replace(/s$/, ''), playerBind, opponents: /opponents/i.test(m[2] || '') });
    return true;
  }
  // Timetwister family.
  if ((m = c.match(/^Each player shuffles (their hand and graveyard|the cards from their hand|their hand) into their library, then draws (seven|that many) cards\.?$/i))) {
    effects.push({ kind: 'twister', graveyard: /graveyard/i.test(m[1]), draw: /that many/i.test(m[2]) ? 'that-many' : 7 });
    return true;
  }
  if ((m = c.match(/^Each player discards all the cards in their hand, then draws that many cards( minus one)?\.?$/i))) { effects.push({ kind: 'twister', discard: true, draw: 'that-many', minus: m[1] ? 1 : 0 }); return true; }
  // Snapcaster Mage: "target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost."
  if ((m = c.match(/^(?:up to one )?target (instant or sorcery|instant|sorcery|instant and\/or sorcery) card in your graveyard gains flashback until end of turn\.?$/i))) {
    const bind = `grave${requirements.length}`;
    requirements.push({ kind: 'graveyard-target', bind, scope: `target ${m[1].replace('and/or', 'or')} card in your graveyard`, label: `${m[1]} card in your graveyard`, optional: /up to one/i.test(c) });
    effects.push({ kind: 'grant-flashback', bind, ...(/up to one/i.test(c) ? { optionalTarget: true } : {}) });
    return true;
  }
  if (/^The flashback cost is equal to its mana cost\.?$/i.test(c)) return true;
  // "Target creature blocks this creature this turn if able."
  if ((m = c.match(rx(`^(Target creature(?: [^.]*?)?) blocks ${selfAny} this turn if able\\.?$`, 'i')))) {
    const blockerBind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'force-block', blockerBind, attackerBind: 'sourceId', expires: 'cleanup' });
    return true;
  }
  if (rx(`^${selfAny} can attack this turn as though it didn'?t have defender\\.?$`, 'i').test(c)) { effects.push({ kind: 'grant-keyword', bind: 'sourceId', keyword: 'Defender', enabled: false, expires: 'cleanup' }); return true; }
  if ((m = c.match(rx(`^Prevent all damage that would be dealt to (${selfAny}|him|her|it|them) this turn\\.?$`, 'i')))) { effects.push({ kind: 'prevent-damage', bind: 'sourceId', amount: 999, expires: 'cleanup' }); return true; }
  if ((m = c.match(rx(`^${selfAny} deals ${N} damage to (any target|target creature|target player or planeswalker|target creature or player) and ${N} damage to you\\.?$`, 'i')))) {
    const bind = H.targetRequirement(requirements, m[2].toLowerCase(), m[2]);
    effects.push({ kind: 'damage', amount: num(m[1]), bind, sourceName }, { kind: 'damage', amount: num(m[3]), toController: true, sourceName });
    return true;
  }
  if ((m = c.match(rx(`^${selfAny} gets ([+-]\\d+)\\/([+-]\\d+) until end of turn and can'?t be blocked this turn\\.?$`, 'i')))) {
    effects.push({ kind: 'pump', bind: 'sourceId', power: Number(m[1]), toughness: Number(m[2]), expires: 'cleanup' }, { kind: 'combat-restriction', bind: 'sourceId', restriction: 'cant-be-blocked', expires: 'cleanup' });
    return true;
  }
  // "venture into the dungeon" inside a longer ability: the venture choice is asked as its own step.
  if (/^(?:you )?venture into the dungeon\.?$/i.test(c)) { effects.push({ kind: 'request-special', special: 'venture' }); return true; }
  if (/^(?:you )?take the initiative\.?$/i.test(c)) { effects.push({ kind: 'request-special', special: 'initiative' }); return true; }
  // Build 77: Syphon Mind: "Each other player discards a card." / "You draw a card for each card discarded this way."
  if ((m = c.match(/^Each other player discards (a|one|two|three|\d+) cards?\.?$/i))) {
    const inner = H.compileSingleClause(`Each opponent discards ${m[1]} card${/^(a|one|1)$/i.test(m[1]) ? '' : 's'}.`, { sourceName });
    if (!inner.unsupported.length && inner.effects.length) { effects.push(...inner.effects); requirements.push(...inner.requirements); return true; }
  }
  if (/^(?:Then )?(?:you )?draws? a card for each card discarded this way\.?$/i.test(c)) { effects.push({ kind: 'draw', scope: 'you', amount: { kind: 'binding', bind: 'discardedThisWay' } }); return true; }
  // Balefire Dragon: "it deals that much damage to each creature that player controls." (also a number, or a target player)
  if ((m = c.match(rx(`^(?:${selfAny}|this creature|it) deals (\\d+|X|that much) damage to each creature (that player|target player|target opponent) controls\\.?$`, 'i')))) {
    const pb = /^target/i.test(m[2]) ? H.playerRequirement(requirements, /opponent/i.test(m[2]) ? 'opponent' : 'player', m[2]) : 'eventPlayer';
    effects.push({ kind: 'damage-each', amount: /that much/i.test(m[1]) ? { kind: 'binding', bind: 'eventAmount' } : num(m[1]), filter: 'creature', creatures: 'bound', creaturesBind: pb, players: null, sourceName });
    return true;
  }
  // Razorkin Needlehead: "this creature deals 1 damage to them." (the player the trigger is about)
  if ((m = c.match(rx(`^(?:${selfAny}|this creature|it) deals (\\d+|X) damage to them\\.?$`, 'i')))) { effects.push({ kind: 'damage', amount: num(m[1]), bind: 'eventPlayer', sourceName }); return true; }
  // Earthbend N (build 77): "Target land you control becomes a 0/0 creature with haste that's still a land. Put N +1/+1 counters
  // on it. When it dies or is exiled, return it to the battlefield tapped." The return is watched in triggers.js (game.earthbent).
  if ((m = c.match(/^(?:then )?earthbend (\d+|one|two|three|four|five)\.?$/i))) {
    const bind = H.targetRequirement(requirements, 'target land you control', 'Target land you control (earthbend)');
    effects.push({ kind: 'animate', bind, power: 0, toughness: 0, addTypes: ['Creature'], subtypes: [], keywords: ['Haste'], colors: null, expires: null },
      { kind: 'counter', bind, counter: '+1/+1', amount: num(m[1]) }, { kind: 'earthbend-mark', bind });
    return true;
  }
  // "Discover 4." in the middle of an ability (Hit the Mother Lode, Hidden Nursery): its own step right after, with the choices.
  if ((m = c.match(/^(?:then )?discover (\d+|X)\.?$/i)) && /^\d+$/.test(m[1])) { effects.push({ kind: 'request-special', special: 'discover', amount: Number(m[1]) }); return true; }
  // "the sacrificed creature's power" (a sacrifice cost): Greater Good, Altar of Dementia.
  if (/the sacrificed (?:creature|permanent|artifact)'s (power|toughness|mana value)/i.test(c)) {
    const stat = /power/i.test(c) ? 'sacrificedPower' : /toughness/i.test(c) ? 'sacrificedToughness' : 'sacrificedManaValue';
    const inner = H.compileSingleClause(ctx.restore(c.replace(/the sacrificed (?:creature|permanent|artifact)'s (?:power|toughness|mana value)/i, 'X').replace(/\bcards equal to X\b/i, 'X cards').replace(/life equal to X\b/i, 'X life').replace(/damage equal to X\b/i, 'X damage')), { sourceName });
    if (!inner.unsupported.length && inner.effects.length) {
      effects.push({ kind: 'set-x', amount: { kind: 'binding', bind: stat } }, ...inner.effects); requirements.push(...inner.requirements.filter(r => !(r.kind === 'number' && r.bind === 'X')));
      return true;
    }
  }
  // Sword of Feast and Famine, Hellkite Tyrant, Plaguecrafter, Whip of Erebos.
  if ((m = c.match(/^that player discards (a|one|two|three) cards?\.?$/i))) {
    const cardsBind = `discardCards${requirements.length}`, amount = num(m[1]);
    requirements.push({ kind: 'discard-cards', bind: cardsBind, playerBind: 'eventPlayer', scope: 'target', amount });
    effects.push({ kind: 'discard', scope: 'you', bind: 'eventPlayer', amount, cardsBind });
    return true;
  }
  if ((m = c.match(/^gain control of all (artifacts|creatures|permanents|lands) that player controls\.?$/i))) { effects.push({ kind: 'gain-control-each', filter: m[1].toLowerCase().replace(/s$/, ''), playerBind: 'eventPlayer', permanent: true }); return true; }
  if ((m = c.match(/^Each player who can'?t discards (a|one|two) cards?\.?$/i))) {
    const sac = [...effects].reverse().find(e => e.kind === 'sacrifice-many');
    const bind = `lacking${requirements.length}`;
    requirements.push({ kind: 'discard-lacking', bind, filter: sac?.filter || 'creature', amount: num(m[1]) });
    effects.push({ kind: 'discard-lacking', bind });
    return true;
  }
  if (/^If (?:it|that creature|that card) would leave the battlefield, exile it instead of putting it anywhere else\.?$/i.test(c)) { effects.push({ kind: 'mark-exile-if-leaves' }); return true; }
  // Riveteers Overlook: "search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield
  // tapped, then shuffle and you gain 1 life."
  if ((m = c.match(rx(`^(.*search your library for .+?,? then shuffle) and you gain ${N} life\\.?$`, 'i')))) {
    if (compileCatalogClauseInner(`${m[1]}.`, ctx)) { effects.push({ kind: 'life', scope: 'you', amount: num(m[2]), deltaSign: 1 }); return true; }
  }
  // A library search inside a longer instruction or a mode (Verdant Confluence): the player chooses as it resolves.
  if ((m = c.match(/^(?:you may )?search your library for .+$/i)) && !/ and \/or |each player|target player|that player/i.test(c)) {
    const spec = librarySearchSpec(ctx.restore(c));
    if (spec && spec.filterKey !== 'any' || /for (?:a|up to one) card\b/i.test(c)) {
      const bind = `search${requirements.length}`;
      requirements.push({ kind: 'library-search', bind, text: ctx.restore(c), label: spec.label });
      effects.push({ kind: 'library-search', bind, text: ctx.restore(c) });
      return true;
    }
  }
  // Exact counts: "Return two target creatures to their owners' hands." "Destroy two target artifacts."
  if ((m = c.match(/^(Return|Destroy|Exile|Tap|Untap) (two|three|four|X) target ([a-z ,/]+?)( to their owners'? hands?)?\.?$/i)) && (m[1].toLowerCase() !== 'return' || m[4])) {
    const n = /^X$/i.test(m[2]) ? 'X' : num(m[2]), bind = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[3].replace(/s$/, '')}`, min: n, max: n, label: `Choose ${m[2]} ${m[3]}` });
    effects.push({ kind: m[1].toLowerCase() === 'return' ? 'bounce-many' : `${m[1].toLowerCase()}-many`, bind });
    return true;
  }
  if ((m = c.match(/^Return (one or two|up to two|one, two, or three) target ([a-z ,]*?)cards? from your graveyard to your hand\.?$/i))) {
    const bind = `graveMulti${requirements.length}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter: m[2].trim(), max: /three/i.test(m[1]) ? 3 : 2, min: /^one/i.test(m[1]) ? 1 : 0, label: `${m[1]} ${m[2]}cards in your graveyard` });
    effects.push({ kind: 'graveyard-to-hand-many', bind });
    return true;
  }
  // Victimize: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards …"
  if ((m = c.match(rx(`^Choose ${N} target ([a-z ,]*?)cards? in your graveyard\\.?$`, 'i')))) {
    const n = num(m[1]);
    requirements.push({ kind: 'graveyard-multi', bind: 'chosenGraveCards', filter: m[2].trim(), max: n, min: n, label: `${m[1]} ${m[2]}cards in your graveyard` });
    return true;
  }
  if ((m = c.match(/^return the chosen cards to (?:the battlefield( tapped)?(?: under your control)?|your hand)\.?$/i))) {
    effects.push(/hand/i.test(c) ? { kind: 'graveyard-to-hand-many', bind: 'chosenGraveCards' } : { kind: 'graveyard-to-battlefield-many', bind: 'chosenGraveCards', tapped: !!m[1] });
    return true;
  }
  // The Enduring cycle: "return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)"
  if (/^if it was a creature, return it to the battlefield under its owner'?s control\.?$/i.test(c)) { effects.push({ kind: 'return-self-graveyard', tapped: false }); return true; }
  if (/^It'?s an enchantment\.?$/i.test(c)) { effects.push({ kind: 'not-a-creature' }); return true; }
  // Ojer Taq: "return it to the battlefield tapped and transformed under its owner's control."
  if ((m = c.match(/^return (?:it|this card|SELFNAME) to the battlefield( tapped)? (?:and )?transformed under (?:its owner'?s|your) control\.?$/i))) { effects.push({ kind: 'return-self-graveyard', tapped: !!m[1], transformed: true }); return true; }
  // Cyberdrive Awakener: "each noncreature artifact you control becomes a 4/4 artifact creature until end of turn"
  if ((m = c.match(/^each (noncreature artifact|artifact|land|noncreature permanent) you control becomes an? (\d+)\/(\d+) ([a-z ]*?)creature(?: with ([a-z ,]+?))? until end of turn\.?$/i))) {
    effects.push({ kind: 'animate-each', scope: 'you', filter: m[1].toLowerCase() === 'noncreature artifact' ? 'artifact|non:creature' : m[1].toLowerCase() === 'noncreature permanent' ? 'permanent|non:creature' : m[1].toLowerCase(), power: m[2], toughness: m[3], addTypes: ['Creature', ...(/artifact/i.test(m[4]) ? ['Artifact'] : [])], subtypes: [], keywords: H.KEYWORD_LIST(m[5] || '').map(cap), colors: null, expires: 'cleanup' });
    return true;
  }
  // Reconnaissance: "Remove target attacking creature you control from combat and untap it."
  if ((m = c.match(/^Remove (target [^.]*?creature[^.]*?) from combat(?: and untap it)?\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'remove-from-combat', bind, untap: /untap it/i.test(c) });
    return true;
  }
  // Redirect: "Change the target of target spell or ability with a single target." / "You may choose new targets for target spell."
  if ((m = c.match(/^(Change the target of|You may choose new targets for) target (spell or ability|spell|instant or sorcery spell|activated or triggered ability)( with a single target)?\.?$/i))) {
    const bind = `stack${requirements.length}`;
    requirements.push({ kind: 'stack-target', bind, scope: /^spell$|sorcery spell$/i.test(m[2]) ? 'spell' : /ability$/i.test(m[2]) && !/spell/i.test(m[2]) ? 'ability' : 'any', label: `target ${m[2]}` });
    const pick = `retarget${requirements.length}`;
    requirements.push({ kind: 'retarget-stack', bind: pick, stackBind: bind, single: !!m[3] || /^Change/i.test(m[1]), mustChange: /^Change/i.test(m[1]) });
    effects.push({ kind: 'retarget-stack', stackBind: bind, bind: pick });
    return true;
  }
  // Imp's Mischief: "You lose life equal to that spell's mana value." (the spell targeted earlier)
  if (/^You lose life equal to that spell'?s mana value\.?$/i.test(c)) {
    const stack = [...requirements].reverse().find(r => r.kind === 'stack-target');
    effects.push({ kind: 'life', scope: 'you', amount: { kind: 'stack-mana-value', stackBind: stack?.bind || 'lastStack' }, deltaSign: -1 });
    return true;
  }
  // Rishkar's Expertise: "You may cast a spell with mana value 5 or less from your hand without paying its mana cost."
  if ((m = c.match(/^You may cast (?:a|an) ([a-z ]*?)(?:spell|card)( with mana value (\d+|X) or less)? from your hand without paying its mana cost\.?$/i))) {
    const bind = `handCard${requirements.length}`;
    requirements.push({ kind: 'hand-card', bind, filter: '', fitsWords: `${m[1].trim() || 'nonland'}${m[2] || ''}`, label: `a ${m[1]}spell${m[2] || ''} to cast free` });
    effects.push({ kind: 'free-cast-hand', bind, optionalTarget: true });
    return true;
  }
  // Second Harvest: "For each token you control, create a token that's a copy of that permanent."
  if ((m = c.match(/^For each (creature token|artifact token|token|nontoken creature) you control, create a token that'?s a copy of that (?:permanent|creature|token|artifact)\.?$/i))) { effects.push({ kind: 'copy-each', filter: m[1].toLowerCase() === 'creature token' ? 'creature|token' : m[1].toLowerCase() === 'artifact token' ? 'artifact|token' : m[1].toLowerCase() === 'nontoken creature' ? 'creature|nontoken' : 'permanent|token' }); return true; }
  // Chandra's Ignition: "Target creature you control deals damage equal to its power to each other creature and each opponent."
  if ((m = c.match(/^Target creature you control deals damage equal to its power to each other creature(?: and each opponent)?\.?$/i))) {
    const bind = H.targetRequirement(requirements, 'target creature you control', 'creature you control');
    effects.push({ kind: 'damage-each-from', sourceBind: bind, otherCreatures: true, opponents: /each opponent/i.test(c) });
    return true;
  }
  // Rakdos Charm: "Each creature deals 1 damage to its controller."
  if ((m = c.match(new RegExp(`^Each creature deals ${N} damage to its controller\\.?$`, 'i')))) { effects.push({ kind: 'each-creature-damages-controller', amount: num(m[1]) }); return true; }
  // Living Death.
  if (/^Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield\.?$/i.test(c)) { effects.push({ kind: 'living-death' }); return true; }
  // Necropotence: "Put that card into your hand at the beginning of your next end step."
  if (/^Put (?:that card|it|those cards|them) into your hand at the beginning of (?:your|the) next end step\.?$/i.test(c)) { effects.push({ kind: 'delay', when: { event: 'end-step', whose: 'owner', sameTurn: true }, effects: [{ kind: 'to-hand-ids', fromBind: '__recent' }], requirements: [] }); return true; }
  // Manifest: "manifest the top card of your library", "Its controller manifests the top card of their library", "manifest dread".
  if (/^(?:you )?manifest the top card of your library\.?$/i.test(c)) { effects.push({ kind: 'manifest', whose: 'you' }); return true; }
  if (/^Its controller manifests the top card of their library\.?$/i.test(c)) { effects.push({ kind: 'manifest', whose: 'lastController' }); return true; }
  if (/^(?:you )?manifest dread\.?$/i.test(c)) { const bind = `dread${requirements.length}`; requirements.push({ kind: 'manifest-dread', bind }); effects.push({ kind: 'manifest', whose: 'you', dreadBind: bind }); return true; }
  // "Exile any number of target creatures you control." (Eerie Interlude)
  if ((m = c.match(/^(Exile|Destroy|Tap|Untap) any number of target ([a-z ,/]+?)\.?$/i))) {
    const bind = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[2].replace(/s(?= you|$)/, '').replace(/creatures/, 'creature')}`, min: 0, max: 99, label: `Choose any number of ${m[2]}` });
    effects.push({ kind: `${m[1].toLowerCase()}-many`, bind });
    return true;
  }
  // Adeline: "for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control."
  if ((m = c.match(/^for each opponent, create (?:a|an) (\d+)\/(\d+) ([a-z ]*?)((?:[A-Z][a-z'-]+ )+)creature token(?: with ([a-z ,]+?))? that'?s tapped and attacking that player(?: or a planeswalker they control)?\.?$/))) {
    const colors = m[3].split(/\s+/).map(w => COLOR_OF[w]).filter(Boolean);
    effects.push({ kind: 'attacking-token-each-opponent', token: { power: Number(m[1]), toughness: Number(m[2]), name: m[4].trim(), typeLine: `Token Creature — ${m[4].trim()}`, colors, keywords: H.KEYWORD_LIST(m[5] || '').map(cap) } });
    return true;
  }
  if (/^This ability costs \{\d+\} less to activate for each .+$/i.test(c)) return true;   // applied to the cost (ops.js / rules.js)
  // Takenuma: "… then return a creature or planeswalker card from your graveyard to your hand." (the milled cards count)
  if ((m = c.match(/^return (?:a|an) ([a-z ,]+?) card from your graveyard to your hand\.?$/i))) {
    const bind = `graveMulti${requirements.length}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter: m[1].trim(), max: 1, min: 1, label: `a ${m[1]} card in your graveyard` });
    effects.push({ kind: 'graveyard-to-hand-many', bind });
    return true;
  }
  // Bident of Thassa: "Creatures your opponents control attack this turn if able."
  if (/^Creatures your opponents control attack this turn if able\.?$/i.test(c)) { effects.push({ kind: 'restrict-each', filter: 'creature', opponentsOf: true, restriction: 'must-attack' }); return true; }
  // Phasing.
  if (/^All permanents you control phase out\.?$/i.test(c)) { effects.push({ kind: 'phase-out', all: true }); return true; }
  if ((m = c.match(/^(?:Any number of|Up to (one|two|three)) target ([a-z ]+?) (?:you control )?phases? out\.?$/i))) {
    const bind = `multi${requirements.length}`;
    requirements.push({ kind: 'multi-target', bind, scope: `target ${m[2].replace(/s$/, '')}${/you control/i.test(c) ? ' you control' : ''}`, min: 0, max: m[1] ? num(m[1]) : 99, label: `Choose ${m[1] ? `up to ${m[1]}` : 'any number of'} ${m[2]}` });
    effects.push({ kind: 'phase-out', bind });
    return true;
  }
  if ((m = c.match(rx(`^(${selfAny}|It|Target [^.]+?|That creature|Enchanted creature|Equipped creature) phases out\\.?$`, 'i')))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : subjectBind(m[1]);
    effects.push({ kind: 'phase-out', single: bind });
    return true;
  }
  // Flare of Fortitude: "Until end of turn, your life total can't change, and permanents you control gain hexproof and indestructible."
  if (/^Until end of turn, your life total can'?t change, and permanents you control gain hexproof and indestructible\.?$/i.test(c)) {
    effects.push({ kind: 'life-lock-turn' }, { kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: 'Hexproof', expires: 'cleanup' }, { kind: 'grant-keyword-each', scope: 'you', filter: 'permanent', keyword: 'Indestructible', expires: 'cleanup' });
    return true;
  }
  if (/^Until your next turn, your life total can'?t change and you gain protection from everything\.?$/i.test(c)) { effects.push({ kind: 'player-protection', lifeLock: true }); return true; }
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
    case 'sylvan': {
      const a = bindings[effect.bind] || {};
      if (!a.draw) { notes.push('No additional cards.'); return true; }
      H.applyEffectsUnsafe(game, controllerId, [{ kind: 'draw', scope: 'you', amount: 2 }], bindings);
      const tops = [];
      for (const [id, f] of Object.entries(a.fate || {})) {
        if (f === 'pay') H.applyEffectsUnsafe(game, controllerId, [{ kind: 'life', scope: 'you', amount: 4, deltaSign: -1 }], bindings);
        else tops.push(id);
      }
      for (const id of tops.reverse()) { const i = controller.deck.hand.findIndex(c => c.instanceId === id); if (i >= 0) { const [c] = controller.deck.hand.splice(i, 1); c.zone = 'library'; controller.deck.remainingLibrary.unshift(c); } }
      notes.push(`${controller.displayName} draws two more and puts ${tops.length} back on top.`);
      return true;
    }
    case 'phase-out': {
      const ids = effect.all ? (controller.deck.battlefield || []).map(c => c.instanceId) : effect.single ? [H.resolveBoundId({ bind: effect.single }, bindings)] : [].concat(bindings[effect.bind] || []);
      const all = new Set(ids.filter(Boolean));
      // Auras and Equipment attached to a phasing permanent phase out with it.
      for (const p of game.players) for (const c of p.deck.battlefield || []) if (c.attachedTo && all.has(c.attachedTo)) all.add(c.instanceId);
      let n = 0;
      for (const id of all) {
        const hit = permanentAt(game, id);
        if (!hit) continue;
        const owner = playerById(game, hit.card.controllerId) || hit.player;
        const arr = hit.player.deck.battlefield; arr.splice(arr.indexOf(hit.card), 1);
        hit.card.phasedOut = true;
        owner.deck.phasedOut = [...(owner.deck.phasedOut || []), hit.card];
        const cs = game.combatState;
        if (cs) { cs.attackers = (cs.attackers || []).filter(a => a.instanceId !== id); for (const b of Object.values(cs.blocks || {})) if (b?.assignments) b.assignments = b.assignments.filter(a => a.blockerId !== id && a.attackerId !== id); }
        n++;
      }
      notes.push(`${n} permanent${n === 1 ? '' : 's'} phase out.`);
      return true;
    }
    case 'attacking-token-each-opponent': {
      for (const opp of (game.players || []).filter(q => !q.eliminated && q.playerId !== controllerId)) {
        H.applyEffectsUnsafe(game, controllerId, [{ kind: 'create-token', amount: 1, ...effect.token, tapped: true }], bindings);
        const id = (bindings.lastCreated || []).slice(-1)[0];
        const cs = game.combatState;
        if (id && cs && Array.isArray(cs.attackers) && /combat|attackers|blockers/.test(String(game.phase))) {
          cs.attackers.push({ playerId: controllerId, instanceId: id, defenderId: opp.playerId, targetId: null, blocksConfirmed: false });
          if (!(cs.defenders || []).includes(opp.playerId)) cs.defenders = [...(cs.defenders || []), opp.playerId];
          const tok = locateCardInGame(game, id)?.card; if (tok) { tok.attacking = opp.playerId; tok.attackedTurn = game.turnNumber; }
        }
        notes.push(`A ${effect.token.name} token enters tapped and attacking ${opp.displayName}.`);
      }
      return true;
    }
    case 'retarget-stack': {
      const obj = (game.stack || []).find(x => x.id === bindings[effect.stackBind]);
      const upd = bindings[effect.bind];
      if (!obj || !upd || !Object.keys(upd).length) { notes.push('The targets stay the same.'); return true; }
      obj.effectBindings = { ...(obj.effectBindings || {}), ...upd };
      notes.push(`${obj.label || 'The spell'} has new targets.`);
      return true;
    }
    case 'graveyard-shuffle-in': {
      const who = playerById(game, bindings[effect.playerBind]);
      if (!who) return true;
      const ids = [].concat(bindings[effect.bind] || []).filter(id => who.deck.graveyard.some(c => c.instanceId === id));
      for (const id of ids) moveCard(game, id, 'library', { onEvent: emit });
      H.shuffle(who.deck.remainingLibrary);
      notes.push(`${who.displayName} shuffles ${ids.length} card${ids.length === 1 ? '' : 's'} from their graveyard into their library.`);
      return true;
    }
    case 'clash': {
      const r = bindings[effect.bind] || {};
      const opp = playerById(game, r.opponent);
      bindings.clashWon = !!r.won;
      for (const [who, id, bottom] of [[controller, r.mine, r.myBottom], [opp, r.theirs, r.theirBottom]]) {
        if (!who || !id || !bottom) continue;
        const i = who.deck.remainingLibrary.findIndex(c => c.instanceId === id);
        if (i >= 0) { const [card] = who.deck.remainingLibrary.splice(i, 1); who.deck.remainingLibrary.push(card); }
      }
      emit({ type: 'clash', playerId: controllerId, controllerId, opponentId: r.opponent, won: !!r.won });
      notes.push(`${controller.displayName} clashes with ${opp?.displayName || 'an opponent'} and ${r.won ? 'wins' : 'does not win'}.`);
      return true;
    }
    case 'their-library-move': {
      const who = playerById(game, bindings[effect.playerBind]) || controller;
      bindings.lastSearchedPlayer = who.playerId;
      const ids = [].concat(bindings[effect.bind] || []);
      bindings.lastMoved = [];
      for (const id of ids) {
        const i = who.deck.remainingLibrary.findIndex(c => c.instanceId === id);
        if (i < 0) continue;
        moveCard(game, id, effect.to, { controllerId: effect.to === 'battlefield' ? controllerId : null, onEvent: emit });
        bindings.lastMoved.push(id);
        notes.push(`${name(locateCardInGame(game, id)?.card)} ${effect.to === 'battlefield' ? `enters under ${controller.displayName}'s control` : effect.to === 'exile' ? 'is exiled' : 'is put into the graveyard'}.`);
      }
      if (!ids.length) notes.push(`${controller.displayName} finds nothing in ${who.displayName}'s library.`);
      emit({ type: 'library-searched', playerId: controllerId, controllerId, ownerId: who.playerId });
      return true;
    }
    case 'shuffle-their': {
      const who = playerById(game, bindings[effect.playerBind] || bindings.eventPlayer);
      if (who) { H.shuffle(who.deck.remainingLibrary); notes.push(`${who.displayName} shuffles their library.`); }
      return true;
    }
    case 'permit-recent': {
      for (const id of bindings.lastMoved || []) {
        const hit = locateCardInGame(game, id);
        if (hit?.zone === 'exile') hit.card.playPermission = { playerId: controllerId, until: effect.until, grantedTurn: game.turnNumber, castOnly: !!effect.castOnly, free: false };
      }
      notes.push(`${controller.displayName} may play ${(bindings.lastMoved || []).length === 1 ? 'that card' : 'those cards'}${effect.until === 'turn' ? ' this turn' : ' while it stays exiled'}.`);
      return true;
    }
    case 'cast-from-graveyard': {
      const id = [].concat(bindings[effect.bind] || [])[0];
      const hit = id && locateCardInGame(game, id);
      if (!hit || hit.zone !== 'graveyard') { notes.push('No spell was cast.'); return true; }
      if (effect.exileInstead) hit.card.exileInsteadOfGraveyard = true;
      const d = definitionFor(game, hit.card);
      // "… from your graveyard this turn": allowed any time this turn (casting.js offers it), not only now.
      if (effect.thisTurn) { hit.card.graveyardCastPermission = { turn: game.turnNumber, playerId: controllerId, free: !!effect.free }; notes.push(`${controller.displayName} may cast ${name(hit.card)} from the graveyard this turn.`); return true; }
      game.flow = game.flow || {};
      game.flow.freeCast = effect.free ? { playerId: controllerId, instanceId: id } : { playerId: controllerId, instanceId: id, cost: d?.manaCost || '', label: 'Cast from graveyard' };
      notes.push(`${controller.displayName} casts ${name(hit.card)} from the graveyard${effect.free ? ' without paying its mana cost' : ''}.`);
      return true;
    }
    case 'free-cast-hand': {
      const id = bindings[effect.bind];
      if (!id || !controller.deck.hand.some(c => c.instanceId === id)) { notes.push('No spell was cast.'); return true; }
      game.flow = game.flow || {};
      game.flow.freeCast = { playerId: controllerId, instanceId: id };
      notes.push(`${controller.displayName} casts ${name(locateCardInGame(game, id)?.card)} without paying its mana cost.`);
      return true;
    }
    case 'copy-each': {
      const ids = (controller.deck.battlefield || []).filter(c => cardMatchesFilter(game, c, effect.filter)).map(c => c.instanceId);
      for (const id of ids) H.applyEffectsUnsafe(game, controllerId, [{ kind: 'copy-of', targetId: id, amount: 1 }], bindings);
      return true;
    }
    case 'damage-each-from': {
      const src = permanentAt(game, bindings[effect.sourceBind]);
      if (!src) { notes.push('The creature is gone.'); return true; }
      const n = Math.max(0, effectivePowerOf(game, src.card));
      const others = (game.players || []).flatMap(p => p.deck.battlefield.filter(c => c.instanceId !== src.card.instanceId && cardMatchesFilter(game, c, 'creature')).map(c => c.instanceId));
      const fx = others.map(id => ({ kind: 'damage', targetId: id, amount: n, sourceName: name(src.card) }));
      if (effect.opponents) for (const p of game.players.filter(q => !q.eliminated && q.playerId !== controllerId)) fx.push({ kind: 'damage', targetId: p.playerId, amount: n, sourceName: name(src.card) });
      notes.push(...H.applyEffectsUnsafe(game, controllerId, fx, { ...bindings, sourceId: src.card.instanceId }));
      return true;
    }
    case 'each-creature-damages-controller': {
      const n = resolveAmount(game, controllerId, effect.amount, bindings);
      for (const p of (game.players || []).filter(q => !q.eliminated)) {
        const k = p.deck.battlefield.filter(c => cardMatchesFilter(game, c, 'creature')).length;
        if (k) notes.push(...H.applyEffectsUnsafe(game, controllerId, Array.from({ length: k }, () => ({ kind: 'damage', targetId: p.playerId, amount: n, sourceName: 'A creature' })), bindings));
      }
      return true;
    }
    case 'living-death': {
      const exiled = {};
      for (const p of game.players.filter(q => !q.eliminated)) { exiled[p.playerId] = p.deck.graveyard.filter(c => cardMatchesFilter(game, c, 'creature')).map(c => c.instanceId); for (const id of exiled[p.playerId]) moveCard(game, id, 'exile', { onEvent: emit }); }
      for (const p of game.players.filter(q => !q.eliminated)) for (const c of [...p.deck.battlefield].filter(c => cardMatchesFilter(game, c, 'creature'))) moveCard(game, c.instanceId, 'graveyard', { moveReason: 'sacrifice', onEvent: emit });
      for (const [pid, ids] of Object.entries(exiled)) for (const id of ids) if (locateCardInGame(game, id)?.zone === 'exile') moveCard(game, id, 'battlefield', { controllerId: pid, onEvent: emit });
      notes.push('Living Death: graveyard creatures and battlefield creatures trade places.');
      return true;
    }
    case 'to-hand-ids': {
      for (const id of effect.ids || []) { const hit = locateCardInGame(game, id); if (hit && hit.zone === 'exile') { moveCard(game, id, 'hand', { onEvent: emit }); notes.push(`${controller.displayName} puts a card into their hand.`); } }
      return true;
    }
    case 'manifest': {
      const who = effect.whose === 'lastController' ? playerById(game, bindings.__lastController) : controller;
      if (!who) return true;
      const lib = who.deck.remainingLibrary;
      const dread = effect.dreadBind ? bindings[effect.dreadBind] : null;
      const top2 = lib.slice(0, effect.dreadBind ? 2 : 1);
      const pick = dread?.manifest && top2.some(c => c.instanceId === dread.manifest) ? top2.find(c => c.instanceId === dread.manifest) : top2[0];
      if (!pick) { notes.push('The library is empty.'); return true; }
      for (const c of top2) if (c !== pick) moveCard(game, c.instanceId, 'graveyard', { onEvent: emit });
      const real = locateCardInGame(game, pick.instanceId)?.card;
      const d = definitionFor(game, real);
      moveCard(game, pick.instanceId, 'battlefield', { controllerId: who.playerId, onEvent: emit });
      game.cardDefinitions['face-down-2-2'] = game.cardDefinitions['face-down-2-2'] || H.faceDown();
      real.realDefinitionId = real.definitionId; real.definitionId = 'face-down-2-2'; real.faceDownKind = 'manifest';
      // A manifested creature card can be turned face up for its mana cost.
      real.castFlags = { turnUpCost: /\bCreature\b/.test(d?.typeLine || '') ? d?.manaCost || null : null };
      notes.push(`${who.displayName} manifests the top card of their library.`);
      return true;
    }
    case 'for-each-player': {
      for (const p of (game.players || []).filter(q => !q.eliminated && (!effect.opponents || q.playerId !== controllerId))) notes.push(...H.applyEffectsUnsafe(game, p.playerId, effect.effects, bindings));
      return true;
    }
    case 'not-a-creature': {
      const hit = permanentAt(game, bindings.sourceId);
      if (hit) { hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'animate', removeTypes: ['Creature'], addTypes: [], subtypes: [], keywords: [] }]; notes.push(`${name(hit.card)} is an enchantment, not a creature.`); }
      return true;
    }
    case 'remove-from-combat': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      if (!hit) return true;
      const cs = game.combatState;
      if (cs) { cs.attackers = (cs.attackers || []).filter(a => a.instanceId !== hit.card.instanceId); for (const b of Object.values(cs.blocks || {})) if (b?.assignments) b.assignments = b.assignments.filter(a => a.blockerId !== hit.card.instanceId && a.attackerId !== hit.card.instanceId); }
      if (effect.untap) H.setTapped(hit.card, false);
      notes.push(`${name(hit.card)} is removed from combat${effect.untap ? ' and untaps' : ''}.`);
      return true;
    }
    case 'life-lock-turn': controller.lifeLocked = true; controller.lifeLockedTurn = game.turnNumber; notes.push(`${controller.displayName}'s life total can't change this turn.`); return true;
    case 'player-protection': if (effect.lifeLock) { controller.lifeLocked = true; delete controller.lifeLockedTurn; } controller.protectionFromEverything = true; notes.push(`${controller.displayName} has protection from everything until their next turn.`); return true;
    case 'flip-coin': {
      if (effect.untilLose) {
        let won = 0;
        while (Math.random() < 0.5 && won < 50) won++;
        bindings.flipsWon = won; bindings.coinWon = won > 0;
        notes.push(`${controller.displayName} flips coins until losing one: ${won} won.`);
      } else {
        bindings.coinWon = Math.random() < 0.5;
        notes.push(`${controller.displayName} flips a coin and ${bindings.coinWon ? 'wins' : 'loses'} the flip.`);
      }
      emit({ type: 'coin-flipped', playerId: controllerId, controllerId, won: bindings.coinWon });
      return true;
    }
    case 'roll-die': { const r = 1 + Math.floor(Math.random() * Math.max(1, effect.sides || 20)); bindings.dieResult = r; emit({ type: 'die-rolled', playerId: controllerId, controllerId, result: r, sides: effect.sides }); notes.push(`${controller.displayName} rolls a d${effect.sides}: ${r}.`); return true; }
    case 'keep-mana': controller.keepManaTurn = game.turnNumber; notes.push(`${controller.displayName} keeps this mana until end of turn.`); return true;
    case 'time-travel': {
      const plan = bindings[effect.bind] || {}, me = controller;
      let changed = 0;
      for (const [id, delta] of Object.entries(plan)) {
        if (!delta) continue;
        const card = [...(me.deck.exile || []), ...(me.deck.battlefield || [])].find(c => c.instanceId === id);
        if (!card) continue;
        card.counters = card.counters || {};
        card.counters.time = Math.max(0, Number(card.counters.time || 0) + delta);
        changed++;
        notes.push(`${definitionFor(game, card)?.name || 'A card'} now has ${card.counters.time} time counter${card.counters.time === 1 ? '' : 's'}.`);
        // The last time counter removed from a suspended card: it is cast without paying its mana cost.
        if (card.counters.time === 0 && card.suspended && card.zone === 'exile' && !game.flow?.freeCast) { delete card.counters.time; card.suspendCast = true; game.flow.freeCast = { playerId: me.playerId, instanceId: card.instanceId }; }
      }
      if (!changed) notes.push('No time counters change.');
      return true;
    }
    case 'flip-self': {
      const hit = permanentAt(game, bindings.sourceId), faces = hit && game.cardDefinitions?.[hit.card.definitionId]?.cardFaces;
      if (!hit) { notes.push('It is no longer on the battlefield.'); return true; }
      if ((faces || []).length !== 2 || hit.card.activeFaceIndex === 1) { notes.push(hit.card.activeFaceIndex === 1 ? 'It is already flipped.' : 'It has nothing to flip into.'); return true; }
      hit.card.activeFaceIndex = 1;
      notes.push(`${faces[0].name} flips into ${faces[1].name}.`);
      return true;
    }
    case 'earthbend-mark': {
      const id = H.resolveBoundId(effect, bindings);
      if (permanentAt(game, id)) game.earthbent = [...new Set([...(game.earthbent || []), id])];
      return true;
    }
    case 'request-special': emit({ type: 'special-request', special: effect.special, amount: effect.amount ?? null, playerId: controllerId, controllerId, sourceId: bindings.sourceId }); return true;
    case 'untap-those': {
      const ids = effect.ids || (bindings.lastMoved?.length ? bindings.lastMoved : []);
      for (const id of ids) { const hit = permanentAt(game, id); if (hit && hit.card.tapped && H.setTapped(hit.card, false)) { emit({ type: 'untapped', sourceId: id, controllerId: hit.card.controllerId }); } }
      notes.push(`${ids.length} untap.`);
      return true;
    }
    case 'mark-exile-if-leaves': {
      for (const id of bindings.lastMoved || []) { const hit = permanentAt(game, id); if (hit) hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'exile-if-leaves' }]; }
      return true;
    }
    case 'discard-lacking': {
      const chosen = bindings[effect.bind] || {};
      for (const [pid, ids] of Object.entries(chosen)) {
        const p = playerById(game, pid);
        for (const id of ids || []) { const i = p?.deck.hand.findIndex(c => c.instanceId === id); if (i >= 0) { const [c] = p.deck.hand.splice(i, 1); c.zone = 'graveyard'; p.deck.graveyard.push(c); emit({ type: 'discard', playerId: pid, sourceId: c.instanceId, definitionId: c.definitionId }); notes.push(`${p.displayName} discards ${name(c)}.`); } }
      }
      return true;
    }
    case 'gain-control-each': {
      const from = effect.playerBind ? [playerById(game, bindings[effect.playerBind])].filter(Boolean) : (game.players || []).filter(p => !p.eliminated && (!effect.opponents || p.playerId !== controllerId));
      const ids = from.flatMap(p => (p.deck.battlefield || []).filter(c => cardMatchesFilter(game, c, effect.filter || 'creature')).map(c => c.instanceId));
      for (const id of ids) H.applyEffectsUnsafe(game, controllerId, [{ kind: 'gain-control', targetId: id, untilEndOfTurn: !effect.permanent }], bindings);
      bindings.lastMoved = ids; bindings.lastCreated = [];
      return true;
    }
    case 'twister': {
      const players = (game.players || []).filter(p => !p.eliminated);
      const counts = {};
      for (const p of players) {
        counts[p.playerId] = p.deck.hand.length;
        if (effect.discard) { for (const c of [...p.deck.hand]) { p.deck.hand.splice(p.deck.hand.indexOf(c), 1); c.zone = 'graveyard'; p.deck.graveyard.push(c); emit({ type: 'discard', playerId: p.playerId, sourceId: c.instanceId, definitionId: c.definitionId }); } continue; }
        for (const zone of ['hand', ...(effect.graveyard ? ['graveyard'] : [])]) for (const c of [...p.deck[zone]]) { p.deck[zone].splice(p.deck[zone].indexOf(c), 1); c.zone = 'library'; p.deck.remainingLibrary.push(c); }
        H.shuffle(p.deck.remainingLibrary);
      }
      for (const p of players) {
        const n = effect.draw === 'that-many' ? Math.max(0, counts[p.playerId] - (effect.minus || 0)) : effect.draw;
        H.applyEffectsUnsafe(game, p.playerId, [{ kind: 'draw', scope: 'you', amount: n }], bindings);
      }
      notes.push(effect.discard ? 'Each player discards their hand and draws that many cards.' : `Each player shuffles their hand${effect.graveyard ? ' and graveyard' : ''} into their library and draws ${effect.draw === 'that-many' ? 'that many cards' : 'seven cards'}.`);
      return true;
    }
    case 'grant-flashback': {
      const id = bindings[effect.bind];
      const hit = id && locateCardInGame(game, id);
      if (!hit || hit.zone !== 'graveyard') { notes.push('That card is no longer in the graveyard.'); return true; }
      hit.card.grantedFlashback = { turn: game.turnNumber, playerId: controllerId };
      notes.push(`${name(hit.card)} gains flashback until end of turn.`);
      return true;
    }
    case 'game-result': {
      for (const p of game.players || []) {
        if (p.eliminated) continue;
        if (effect.win ? p.playerId !== controllerId : p.playerId === controllerId) { p.counters = p.counters || {}; p.counters.lostGame = effect.win ? `${controller.displayName} won the game` : 'lost the game'; }
      }
      notes.push(effect.win ? `${controller.displayName} wins the game.` : `${controller.displayName} loses the game.`);
      return true;
    }
    case 'class-level': {
      const hit = permanentAt(game, bindings.sourceId);
      if (!hit) return true;
      if (Number(hit.card.classLevel || 1) !== effect.level - 1) { notes.push(`It is not level ${effect.level - 1}, so nothing happens.`); return true; }
      hit.card.classLevel = effect.level;
      emit({ type: 'class-level', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, to: effect.level, level: effect.level });
      notes.push(`${name(hit.card)} becomes level ${effect.level}.`);
      return true;
    }
    case 'unearth-mark': {
      const hit = permanentAt(game, bindings.sourceId);
      if (!hit) return true;
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'exile-if-leaves' }];
      H.applyEffectsUnsafe(game, controllerId, [{ kind: 'delay', when: { event: 'end-step', whose: 'any', sameTurn: true }, effects: [{ kind: 'exile-ids', ids: [hit.card.instanceId] }], requirements: [] }], bindings);
      return true;
    }
    case 'extra-combat':
      // "after this phase": granted in the first main phase or in combat, the extra combat comes before the second main phase
      // (Moraug); granted in the second main phase it follows it (Relentless Assault, Aurelia).
      if (['precombat-main', 'combat', 'begin-combat', 'end-combat'].includes(game.phase)) game.extraBeforeMain2 = Number(game.extraBeforeMain2 || 0) + 1;
      else game.extraCombats = Number(game.extraCombats || 0) + 1;
      notes.push('There is an additional combat phase this turn.');
      return true;
    case 'copy-of': {
      const id = H.resolveBoundId(effect, bindings);
      const hit = locateCardInGame(game, id);
      const d = hit ? definitionFor(game, hit.card) : null;
      if (!d) { notes.push('There is nothing to copy.'); return true; }
      const n = Math.max(0, resolveAmount(game, controllerId, effect.amount ?? 1, bindings));
      const typeLine = effect.nonlegendary ? String(d.typeLine || '').replace(/\bLegendary\s+/i, '') : d.typeLine;
      // Bramble Sovereign: "that creature's controller creates …"
      const maker = effect.forItsController && hit?.card?.controllerId ? hit.card.controllerId : controllerId;
      for (let i = 0; i < n; i++) {
        H.applyEffectsUnsafe(game, maker, [{ kind: 'create-token', amount: 1, name: d.name, typeLine: /^Token\b/.test(typeLine) ? typeLine : `Token ${typeLine}`, oracleText: d.oracleText || '', power: d.power, toughness: d.toughness, keywords: d.keywords || [], colors: d.colors || [], tapped: !!effect.tapped }], bindings);
        const made = (bindings.lastCreated || []).slice(-1)[0];
        const token = made && locateCardInGame(game, made)?.card;
        if (token && effect.haste) { token.temporaryEffects = [...(token.temporaryEffects || []), { kind: 'keyword', keyword: 'Haste', enabled: true }]; }
      }
      notes.push(`${controller.displayName} creates ${n === 1 ? 'a token copy' : `${n} token copies`} of ${d.name}.`);
      return true;
    }
    case 'return-linked': {
      const src = locateCardInGame(game, bindings.sourceId)?.card;
      const list = [...(src?.linkedExile || [])];
      if (src) src.linkedExile = [];
      for (const id of list) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'exile') continue;
        moveCard(game, id, effect.to === 'hand' ? 'hand' : 'battlefield', { controllerId: hit.card.ownerId, onEvent: emit });
        notes.push(`${name(hit.card)} returns ${effect.to === 'hand' ? "to its owner's hand" : 'to the battlefield'}.`);
      }
      return true;
    }
    case 'return-ids': {
      // The cards just moved or made; otherwise the card the trigger is about ("Whenever a creature dies, … return that card").
      const event = [bindings.eventCard].filter(id => id && ['exile', 'graveyard'].includes(locateCardInGame(game, id)?.zone));
      const list = effect.ids || (bindings.lastMoved?.length ? bindings.lastMoved : bindings.lastCreated?.length ? bindings.lastCreated : event);
      for (const id of list) {
        const hit = locateCardInGame(game, id);
        if (!hit || !['exile', 'graveyard'].includes(hit.zone)) continue;
        moveCard(game, id, 'battlefield', { controllerId: effect.yours ? controllerId : hit.card.ownerId, tapped: !!effect.tapped, onEvent: emit });
        bindings.__returned = id;
        notes.push(`${name(hit.card)} returns to the battlefield.`);
      }
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
      if (effect.positionBind) effect = { ...effect, position: bindings[effect.positionBind] === 'bottom' ? 'bottom' : 'top' };
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
    case 'library-search': {
      const spec = librarySearchSpec(effect.text);
      for (const id of [].concat(bindings[effect.bind] || [])) {
        if (!controller.deck.remainingLibrary.some(c => c.instanceId === id)) continue;
        if (spec.destination === 'battlefield') moveCard(game, id, 'battlefield', { controllerId, tapped: !!spec.entersTapped, onEvent: emit });
        else if (spec.destination === 'library') moveCard(game, id, 'library', { position: 'top', onEvent: emit });
        else moveCard(game, id, 'hand', { onEvent: emit });
        notes.push(`${controller.displayName} finds ${name(locateCardInGame(game, id)?.card)}.`);
      }
      if (spec.shuffle) { const lib = controller.deck.remainingLibrary, top = spec.destination === 'library' ? lib.shift() : null; H.shuffle(lib); if (top) lib.unshift(top); }
      emit({ type: 'library-searched', playerId: controllerId, controllerId });
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
    case 'encore': {
      const made = [];
      for (const opp of game.players.filter(p => !p.eliminated && p.playerId !== controllerId)) {
        H.applyEffectsUnsafe(game, controllerId, [{ kind: 'copy-of', bind: 'sourceId', amount: 1, haste: true }], bindings);
        const id = (bindings.lastCreated || []).slice(-1)[0], tok = id && locateCardInGame(game, id)?.card;
        if (!tok) continue;
        tok.temporaryEffects = [...(tok.temporaryEffects || []), { kind: 'combat-restriction', restriction: 'must-attack', playerId: opp.playerId, expires: 'cleanup' }];
        made.push(id);
      }
      if (made.length) H.applyEffectsUnsafe(game, controllerId, [{ kind: 'delay', when: { event: 'end-step', whose: 'any', sameTurn: true }, effects: [{ kind: 'sacrifice-ids', ids: made }], requirements: [] }], bindings);
      notes.push(`${controller.displayName} creates ${made.length} encore cop${made.length === 1 ? 'y' : 'ies'}.`);
      return true;
    }
    case 'become-saddled': {
      const hit = permanentAt(game, bindings.sourceId);
      if (!hit) return true;
      hit.card.saddledTurn = game.turnNumber;
      hit.card.saddledBy = [...(effect.ids || [])];
      notes.push(`${name(hit.card)} is saddled until end of turn.`);
      return true;
    }
    case 'cant-block-source': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      if (!hit) return true;
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'cant-block-creature', creatureId: bindings.sourceId, expires: 'cleanup' }];
      notes.push(`${name(hit.card)} can't block ${name(locateCardInGame(game, bindings.sourceId)?.card)} this turn.`);
      return true;
    }
    case 'counters-from-event': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      const counters = bindings.eventCounters || {};
      if (!hit) return true;
      let n = 0;
      for (const [k, v] of Object.entries(counters)) if (Number(v) > 0) { H.addCounter(hit.card, k, Number(v)); n += Number(v); emit({ type: 'counter-added', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId, counter: k, amount: Number(v) }); }
      notes.push(n ? `${name(hit.card)} gets ${n} counter${n === 1 ? '' : 's'}.` : 'It had no counters.');
      return true;
    }
    case 'tap-or-untap': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      const how = String(bindings[effect.howBind] || 'Neither');
      if (!hit || how === 'Neither') { notes.push('Nothing is tapped or untapped.'); return true; }
      if (how === 'Tap') { hit.card.tapped = true; emit({ type: 'tapped', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId }); }
      else if (hit.card.tapped && H.setTapped(hit.card, false)) emit({ type: 'untapped', sourceId: hit.card.instanceId, controllerId: hit.card.controllerId });
      notes.push(`${name(hit.card)} ${how === 'Tap' ? 'taps' : 'untaps'}.`);
      return true;
    }
    case 'no-combat-damage': {
      const hit = permanentAt(game, bindings.sourceId);
      if (hit) hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'no-combat-damage', expires: 'cleanup' }];
      notes.push('It assigns no combat damage this turn.');
      return true;
    }
    case 'time-counters-recent':
    case 'suspend-recent': {
      for (const id of bindings.lastMoved || []) {
        const hit = locateCardInGame(game, id);
        if (!hit) continue;
        if (effect.kind === 'time-counters-recent') hit.card.counters = { ...(hit.card.counters || {}), time: Number(hit.card.counters?.time || 0) + Number(effect.amount || 0) };
        else if (hit.zone === 'exile') hit.card.suspended = true;
      }
      return true;
    }
    case 'exile-self-suspend': {
      const hit = locateCardInGame(game, bindings.sourceId) || (game.resolvingSpellId === bindings.sourceId ? null : null);
      game.spellExileSelf = bindings.sourceId;
      game.spellSuspendSelf = { id: bindings.sourceId, time: Number(effect.amount || 0) };
      notes.push(`It is exiled with ${effect.amount} time counters (suspended).`);
      return true;
    }
    case 'bounce-selection': {
      const raw = bindings[effect.bind] || [];
      const ids = Array.isArray(raw) ? raw : Object.values(raw).flat();
      for (const id of ids) { const hit = permanentAt(game, id); if (hit) { moveCard(game, id, 'hand', { onEvent: emit }); notes.push(`${name(hit.card)} returns to its owner's hand.`); } }
      bindings.lastMoved = ids;
      return true;
    }
    case 'exile-event-card': {
      const id = bindings.eventCard || bindings.thatCard;
      const hit = id && locateCardInGame(game, id);
      if (!hit || !['battlefield', 'graveyard', 'hand'].includes(hit.zone)) { notes.push('It is no longer there to exile.'); return true; }
      moveCard(game, id, 'exile', { onEvent: emit });
      bindings.lastMoved = [id];
      notes.push(`${name(hit.card)} is exiled.`);
      return true;
    }
    case 'switch-pt': {
      const hit = permanentAt(game, H.resolveBoundId(effect, bindings));
      if (!hit) { notes.push('That creature is no longer on the battlefield.'); return true; }
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'switch-pt', expires: 'cleanup' }];
      notes.push(`${name(hit.card)} has its power and toughness switched until end of turn.`);
      return true;
    }
    case 'self-hand-to-battlefield': {
      const id = bindings.sourceId;
      if (!controller.deck.hand.some(c => c.instanceId === id)) { notes.push('The card is no longer in your hand.'); return true; }
      moveCard(game, id, 'battlefield', { controllerId, onEvent: emit });
      notes.push(`${name(locateCardInGame(game, id)?.card)} is put onto the battlefield.`);
      return true;
    }
    case 'distribute': {
      const split = bindings[effect.bind] || {};
      for (const [id, n] of Object.entries(split)) {
        if (!(Number(n) > 0)) continue;
        const key = `__divided_${id}`;
        bindings[key] = id;
        H.applyEffectsUnsafe(game, controllerId, [effect.what === 'damage' ? { kind: 'damage', amount: Number(n), bind: key, sourceName: effect.sourceName } : { kind: 'counter', bind: key, counter: '+1/+1', amount: Number(n) }], bindings);
      }
      return true;
    }
    case 'emblem': {
      controller.emblems = [...(controller.emblems || []), { id: `emblem-${game.turnNumber}-${(controller.emblems || []).length}`, text: effect.text, source: name(locateCardInGame(game, bindings.sourceId)?.card) }];
      notes.push(`${controller.displayName} gets an emblem: “${effect.text}”`);
      return true;
    }
    case 'graveyard-to-battlefield-many': {
      for (const id of [].concat(bindings[effect.bind] || [])) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'graveyard') continue;
        moveCard(game, id, 'battlefield', { controllerId, tapped: !!effect.tapped, onEvent: emit });
        notes.push(`${name(hit.card)} returns to the battlefield${effect.tapped ? ' tapped' : ''}.`);
      }
      return true;
    }
    case 'hand-to-battlefield-any': {
      const ids = [].concat(bindings[effect.bind] || []).filter(id => controller.deck.hand.some(c => c.instanceId === id));
      if (!ids.length) { notes.push('Nothing was put onto the battlefield.'); return true; }
      for (const id of ids) {
        moveCard(game, id, 'battlefield', { controllerId, tapped: !!effect.tapped, onEvent: emit });
        notes.push(`${controller.displayName} puts ${name(locateCardInGame(game, id)?.card)} onto the battlefield.`);
      }
      bindings.lastMoved = ids;
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
      for (const p of game.players.filter(q => !effect.opponentsOf || q.playerId !== controllerId)) for (const c of p.deck.battlefield || []) if (cardMatchesFilter(game, c, effect.filter)) { c.temporaryEffects = [...(c.temporaryEffects || []), { kind: 'combat-restriction', restriction: effect.restriction, expires: 'cleanup' }]; n++; }
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
  if (req.kind === 'discard-lacking') {
    // Plaguecrafter: each player who has nothing to sacrifice discards instead (they choose, on their own device).
    const out = {};
    for (const q of (game.players || []).filter(p => !p.eliminated)) {
      if ((q.deck.battlefield || []).some(c => cardMatchesFilter(game, c, req.filter))) continue;
      const hand = q.deck.hand || [];
      const n = Math.min(Number(req.amount || 1), hand.length);
      if (!n) continue;
      out[q.playerId] = n === hand.length ? hand.map(c => c.instanceId) : ask(`${key}:${q.playerId}`, () => ({ ...base, playerId: q.playerId, cancellable: false, kind: 'choose-many', private: true, title: `${ctx.sourceName} — discard`, prompt: `${q.displayName}: you have nothing to sacrifice, so discard ${util.plural(n, 'card')}.`, options: hand.map(c => util.cardOption(game, c, q, 'Your hand')), min: n, max: n }));
    }
    bindings[req.bind] = out;
    return true;
  }
  if (req.kind === 'retarget-stack') {
    // The spell's or ability's targets, chosen again by the player redirecting it.
    const obj = (game.stack || []).find(x => x.id === bindings[req.stackBind]);
    const reqs = (obj?.castReqs || []).filter(r => ['target', 'player', 'graveyard-target', 'stack-target', 'multi-target'].includes(r.kind));
    if (!obj || !reqs.length || (req.single && reqs.length !== 1)) { bindings[req.bind] = {}; return true; }
    const fresh = {};
    if (!req.mustChange && !ask(`${key}:new`, () => ({ ...base, cancellable: false, kind: 'confirm', title, prompt: `Choose new targets for ${obj.label || 'that spell'}?`, yesLabel: 'New targets', noLabel: 'Keep them' }))) { bindings[req.bind] = {}; return true; }
    util.gather(game, { player, sourceName: ctx.sourceName, cancellable: false }, reqs.map(r => ({ ...r, optional: false })), fresh, ask, `${key}:t`);
    bindings[req.bind] = Object.fromEntries(reqs.map(r => [r.bind, fresh[r.bind]]));
    return true;
  }
  if (req.kind === 'exile-until-cast') {
    const hit = (player.deck.remainingLibrary || []).find(c => !/\bLand\b/.test(util.defOf(game, c)?.typeLine || ''));
    const mv = hit ? Number(util.defOf(game, hit)?.manaValue ?? util.defOf(game, hit)?.cmc ?? 0) : 0;
    const allowed = hit && (req.maxMv == null || mv <= req.maxMv);
    const nm = hit ? util.defOf(game, hit)?.name : '';
    const cast = allowed ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName} — ${nm}`, definitionId: hit.definitionId, prompt: `You exile ${nm}. Cast it without paying its mana cost?`, options: [{ id: 'cast', label: `Cast ${nm} free` }, { id: 'no', label: 'Don\u2019t cast it' }] })) === 'cast' : false;
    bindings[req.bind] = { hit: hit?.instanceId || null, cast };
    return true;
  }
  if (req.kind === 'their-graveyard-pick') {
    const who = (game.players || []).find(p => p.playerId === bindings[req.playerBind]) || player;
    const rows = who.deck.graveyard || [];
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title: `${ctx.sourceName} — ${who.displayName}'s graveyard`, prompt: `Choose ${req.label}.`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: 0, max: Math.min(req.max || 1, rows.length) })) : [];
    return true;
  }
  if (req.kind === 'owner-top-bottom') {
    const hit = locateCardInGame(game, bindings[req.targetBind]);
    const owner = hit && (game.players || []).find(p => p.playerId === hit.card.ownerId);
    bindings[req.bind] = owner ? ask(key, () => ({ ...base, playerId: owner.playerId, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName}`, prompt: `Put ${util.defOf(game, hit.card)?.name || 'it'} on the top or the bottom of your library?`, options: [{ id: 'top', label: 'On top' }, { id: 'bottom', label: 'On the bottom' }] })) : 'top';
    return true;
  }
  if (req.kind === 'clash') {
    const opps = game.players.filter(p => !p.eliminated && p.playerId !== player.playerId);
    const opp = opps.length > 1 ? (opps.find(p => p.playerId === ask(`${key}:opp`, () => ({ ...base, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName} — clash`, prompt: 'Clash with which opponent?', options: opps.map(p => ({ id: p.playerId, label: p.displayName })) }))) || opps[0]) : opps[0];
    const mine = player.deck.remainingLibrary[0], theirs = opp?.deck.remainingLibrary[0];
    const mv = c => Number(util.defOf(game, c)?.manaValue ?? util.defOf(game, c)?.cmc ?? 0);
    const won = !!mine && (!theirs || mv(mine) > mv(theirs));
    const shown = `You reveal ${mine ? `${util.defOf(game, mine)?.name} (${mv(mine)})` : 'nothing'}; ${opp?.displayName || 'they'} reveal${opp ? 's' : ''} ${theirs ? `${util.defOf(game, theirs)?.name} (${mv(theirs)})` : 'nothing'}. ${won ? 'You win.' : 'You do not win.'}`;
    const where = (who, card, k) => card ? ask(`${key}:${k}`, () => ({ ...base, playerId: who.playerId, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName} — clash`, prompt: `${shown}\nPut ${util.defOf(game, card)?.name} on top or on the bottom of your library?`, options: [{ id: 'top', label: 'Keep it on top' }, { id: 'bottom', label: 'Put it on the bottom' }] })) : 'top';
    const myPlace = where(player, mine, 'me');
    const theirPlace = opp ? where(opp, theirs, 'them') : 'top';
    bindings[req.bind] = { opponent: opp?.playerId || null, mine: mine?.instanceId || null, theirs: theirs?.instanceId || null, won, myBottom: myPlace === 'bottom', theirBottom: theirPlace === 'bottom' };
    return true;
  }
  if (req.kind === 'their-library-pick') {
    const who = (game.players || []).find(p => p.playerId === bindings[req.playerBind]) || player;
    const rows = (who.deck.remainingLibrary || []).filter(c => cardFitsWords(util.defOf(game, c), req.filter));
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', private: true, searchable: true, title: `${ctx.sourceName} — search ${who.displayName}'s library`, prompt: `Choose ${req.label} (you may find nothing).`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: 0, max: Math.min(req.max || 1, rows.length) })) : [];
    return true;
  }
  if (req.kind === 'distribute') {
    const ids = [].concat(bindings[req.targetsBind] || []);
    const total = req.total === 'X' ? Math.max(0, Number(bindings.X || 0)) : Number(req.total || 0);
    const split = {};
    if (ids.length === 1) split[ids[0]] = total;
    else if (ids.length > 1) {
      let left = total;
      ids.forEach((id, i) => {
        const rest = ids.length - i - 1;
        if (!rest) { split[id] = left; return; }
        const label = util.targetLabel ? util.targetLabel(game, id) : (util.defOf(game, locateCardInGame(game, id)?.card)?.name || (game.players.find(p => p.playerId === id)?.displayName) || 'Target');
        const n = ask(`${key}:${i}`, () => ({ ...base, cancellable: false, kind: 'number', title: `${ctx.sourceName} — divide ${req.what === 'damage' ? 'damage' : 'counters'}`, prompt: `How much of the ${left} left goes to ${label}? (each target gets at least 1)`, min: 1, max: Math.max(1, left - rest) }));
        split[id] = Math.max(1, Math.min(Number(n) || 1, left - rest));
        left -= split[id];
      });
    }
    bindings[req.bind] = split;
    return true;
  }
  if (req.kind === 'sylvan') {
    const yes = ask(`${key}:draw`, () => ({ ...base, cancellable: false, kind: 'confirm', title: `${ctx.sourceName}`, prompt: 'Draw two additional cards?', yesLabel: 'Draw two', noLabel: 'No' }));
    if (!yes) { bindings[req.bind] = { draw: false }; return true; }
    const coming = (player.deck.remainingLibrary || []).slice(0, 2);
    const drawn = [...(player.deck.hand || []).filter(c => c.drawnTurn === game.turnNumber), ...coming];
    const two = drawn.length <= 2 ? drawn.map(c => c.instanceId) : ask(`${key}:choose`, () => ({ ...base, cancellable: false, kind: 'choose-many', private: true, title: `${ctx.sourceName} — choose two`, prompt: 'Choose two cards in your hand drawn this turn (including the two you draw now).', options: drawn.map(c => util.cardOption(game, c, player, coming.includes(c) ? 'You draw this' : 'Drawn this turn')), min: 2, max: 2 }));
    const life = Number(player.life || 0);
    const fate = {};
    let paid = 0;
    for (const id of two) {
      const nm = util.defOf(game, drawn.find(c => c.instanceId === id))?.name || 'Card';
      fate[id] = ask(`${key}:fate:${id}`, () => ({ ...base, cancellable: false, kind: 'choose-one', private: true, title: `${ctx.sourceName} — ${nm}`, prompt: `Pay 4 life to keep ${nm}, or put it on top of your library.`, options: [{ id: 'pay', label: 'Pay 4 life', disabled: life - paid < 4 }, { id: 'top', label: 'Put it on top' }] }));
      if (fate[id] === 'pay') paid += 4;
    }
    bindings[req.bind] = { draw: true, fate };
    return true;
  }
  if (req.kind === 'manifest-dread') {
    const top2 = (player.deck.remainingLibrary || []).slice(0, 2);
    bindings[req.bind] = { manifest: top2.length < 2 ? top2[0]?.instanceId : ask(key, () => ({ ...base, cancellable: false, kind: 'choose-one', private: true, title: `${ctx.sourceName} — manifest dread`, prompt: 'Look at the top two cards. Choose one to manifest; the other goes to your graveyard.', options: top2.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')) })) };
    return true;
  }
  if (req.kind === 'graveyard-multi') {
    const coming = (player.deck.remainingLibrary || []).slice(0, Number(req.plusMill || 0));
    const rows = [...(player.deck.graveyard || []), ...coming].filter(c => c.instanceId !== bindings.sourceId && cardFitsWords(util.defOf(game, c), req.filter));
    const max = Math.min(req.max === 'X' ? Number(bindings.X || 0) : req.max, rows.length);
    bindings[req.bind] = max ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', title, prompt: `Choose ${req.label}.`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: Math.min(Number(req.min || 0), max), max })) : [];
    return true;
  }
  if (req.kind === 'library-search') {
    const spec = librarySearchSpec(req.text), fits = searchFilter(spec);
    const m = String(req.text).match(/search your library for up to (\w+)/i);
    const count = m ? (num(m[1]) || 1) : 1;
    // Several searches in one resolution (the same mode chosen twice) can't find the same card twice.
    const taken = new Set(Object.entries(bindings).filter(([k]) => k.startsWith('search') && k !== req.bind).flatMap(([, v]) => [].concat(v || [])));
    const rows = (player.deck.remainingLibrary || []).filter(c => fits(util.defOf(game, c)) && !taken.has(c.instanceId));
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', private: true, title: `${ctx.sourceName} — search your library`, prompt: `Choose ${count > 1 ? `up to ${count} ${spec.label}s` : `a ${spec.label}`}${spec.optional || count > 1 ? ' (you may choose none)' : ''}.`, options: rows.map(c => util.cardOption(game, c, player, util.defOf(game, c)?.typeLine || '')), min: spec.optional || count > 1 ? 0 : 1, max: Math.min(count, rows.length), searchable: true })) : [];
    return true;
  }
  return false;
}

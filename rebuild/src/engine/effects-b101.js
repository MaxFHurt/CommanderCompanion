// Card wordings added in build 101 (the long tail, most-played first).
// compileB101Clause(c, ctx) is tried by effects-catalog.js after the build-49 wordings; compileB101Sequence sees the
// sentences around it; applyB101 runs the effect kinds made here. Most wordings here are read as an instruction the
// game already runs (the same effect for another subject, another player or several targets), so the game's own
// rules for that effect apply. Every choice stays with the player who makes it in the rules.
import { numberFromText, locateCardInGame, definitionFor, resolveAmount, catalogHelpers as H } from './effects.js';
import { effectivePower, effectiveToughness } from './combat.js';
import { parseCountB101, bindTargetControllerB101, amountNeedsPlayerB101, bindAmountPlayerB101, singularB101, listCardsB101 } from './amounts-b101.js';

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
  const sub = text => {
    let r = H.compileSingleClause(ctx.restore(text), { sourceName });
    if (!ok(r)) { const whole = H.compileEffectText(ctx.restore(text), { sourceName }); r = whole.supported ? { effects: whole.effects, requirements: whole.requirements, unsupported: [] } : r; }   // wordings read only as whole sentences
    return ok(r) && clean(r) ? r : null;
  };
  const esc = x => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SELFP = `(?:${SELF}|${esc(sourceName)}|${esc(String(sourceName).split(',')[0])})`;   // before "'s" the name is not replaced by SELFNAME
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
  // --- "… unless its controller pays life equal to its toughness / has it deal damage to them / unless they sacrifice a creature":
  // the other player's choice, asked of them as the effect resolves (requirement b101-unless), then done as that player.
  if ((m = c.match(rx(`^(Destroy target [a-z ]+?) unless its controller (pays life equal to its toughness|has ${SELFP} deal damage to them equal to (?:his|her|its) power)\\.?$`)))
    || (m = c.match(rx(`^(that player loses life equal to the number of creatures they control) unless they (sacrifice a creature of their choice)\\.?$`)))) {
    const mode = /pays life/i.test(m[2]) ? 'life-toughness' : /deal damage/i.test(m[2]) ? 'damage-power' : 'sacrifice';
    const whole = /^that player/i.test(m[1]) ? H.compileEffectText(`${cap(m[1])}.`, { sourceName }) : null;   // "that player" is the trigger's player, read as a whole sentence
    const r = whole ? (whole.supported ? { effects: whole.effects, requirements: whole.requirements } : null) : sub(`${m[1]}.`);
    const t = mode === 'sacrifice' ? null : r?.requirements.find(q => q.kind === 'target');
    if (r && (mode === 'sacrifice' || t)) {
      const bind = `unless${requirements.length}`;
      requirements.push(...r.requirements, { kind: 'b101-unless', bind, mode, ...(t ? { deciderTarget: t.bind } : { deciderBind: 'eventPlayer' }), sourceName, label: 'Decide' });
      effects.push({ kind: 'b101-unless-do', bind, mode, ...(t ? { deciderTarget: t.bind } : { deciderBind: 'eventPlayer' }), skip: r.effects.length, sourceName }, ...r.effects);
      return true;
    }
  }
  // --- "This creature gets +1/+1 until end of turn for each creature it's blocking." (Guardian of the Gateless): the count made as X.
  if ((m = c.match(rx(`^(${SELF}|it) gets ([+-])1\\/([+-])1 until end of turn for each (creatures? (?:it|this creature)(?:'s| is) blocking)\\.?$`)))) {
    const r = sub(`${cap(m[1])} gets ${m[2]}X/${m[3]}X until end of turn, where X is the number of ${m[4].replace(/^creature /i, 'creatures ')}.`);
    if (r) return take(r);
  }
  // --- "Then draw a card for each tapped creature its controller controls." (Observed Stasis: the enchanted creature's controller)
  if ((m = c.match(/^(?:Then )?draw a card for each (tapped|untapped)? ?(creatures?) its controller controls\.?$/i))) {
    const expr = parseCountB101(`${(m[1] || '').toLowerCase()} creatures that creature's controller controls`.trim());
    if (expr && expr.kind === 'b101-n') { bindTargetControllerB101(expr, '__attached'); effects.push({ kind: 'draw', scope: 'you', amount: expr }); return true; }
  }
  // --- "Return up to X target cards from your graveyard to your hand, where X is the number of opponents who have three or more poison counters." (Glissa's Retriever)
  if ((m = c.match(/^Return up to X target cards from your graveyard to your hand,? where X is the number of opponents who have (three|\d+) or more poison counters\.?$/i))) {
    const bind = `graveMulti${requirements.length}`;
    requirements.push({ kind: 'graveyard-multi', bind, filter: '', max: 0, min: 0, maxExpr: { kind: 'b101-opps-poison', n: num(m[1]) }, label: 'up to X cards in your graveyard (X: opponents with 3 or more poison counters)' });
    effects.push({ kind: 'graveyard-to-hand-many', bind });
    return true;
  }
  // --- "Put a +1/+1 counter on that creature, it gains haste until end of turn, and it becomes a Vampire in addition to its other types." (Olivia, Mobilized for War)
  if ((m = c.match(/^(Put a \+1\/\+1 counter on (?:that creature|it)), (?:it|that creature) (gains haste until end of turn), and (?:it|that creature) (becomes an? [A-Z][a-z]+ in addition to its other types)\.?$/))) {
    const who = /that creature/.test(m[1]) ? 'That creature' : 'It', parts = [`${m[1]}.`, `${who} ${m[2]}.`, `${who} ${m[3]}.`].map(x => sub(x));
    if (parts.every(Boolean)) { for (const r of parts) { effects.push(...r.effects); requirements.push(...r.requirements); } return true; }
  }
  // --- "Destroy target creature and up to X other target creatures, where X is the number of Attractions you've visited this turn." (Black Hole)
  // The game does not play Attractions, so what was visited this turn is asked of the player (it is their own fact).
  if ((m = c.match(/^Destroy target creature and up to X other target creatures,? where X is the number of Attractions you'?ve visited this turn\.?$/i))) {
    const first = H.targetRequirement(requirements, 'target creature', 'target creature'), bind = `multi${requirements.length + 1}`;
    requirements.push({ kind: 'number', bind: 'X', label: "How many Attractions have you visited this turn?", min: 0, max: 99 },
      { kind: 'multi-target', bind, scope: 'target creature', min: 0, max: 'X', excludeBind: first, label: 'Choose up to X other target creatures' });
    effects.push({ kind: 'destroy', bind: first }, { kind: 'b101-each-bound', bind, effects: [{ kind: 'destroy', bind: '__each' }] });
    return true;
  }
  // --- "When you discard a nonland card this way, ~ deals damage equal to that card's mana value to target creature or planeswalker." (Fiery Encore)
  if ((m = c.match(/^When you discard an? (nonland )?card this way,? (.+)$/i))) {
    const r = sub(m[2]);
    if (r) { effects.push({ kind: 'condition', test: m[1] ? 'discarded-nonland' : 'discarded-any', skip: r.effects.length }, ...r.effects); requirements.push(...r.requirements); return true; }
  }
  // --- "~ deals damage equal to its power to target creature an opponent controls and that creature deals damage equal to its power to ~" (Stalking Yeti): a fight.
  if ((m = c.match(rx(`^(?:If it'?s on the battlefield, )?(?:${SELF}|it|${SELFP}) deals damage equal to its power to (target creature[^.]*?) and that creature deals damage equal to its power to (?:${SELF}|it|${SELFP})\\.?$`)))) {
    const r = sub(`This creature fights ${m[1]}.`);
    if (r) return take(r);
  }
  // --- "~ deals 15 damage to target creature an opponent controls and that creature deals damage equal to its power to you." (Form of the Dinosaur)
  if ((m = c.match(rx(`^(${SELFP}) deals ${N} damage to (target creature[^.]*?) and that creature deals damage equal to its power to you\\.?$`)))) {
    const r = sub(`${m[1]} deals ${m[2]} damage to ${m[3]}.`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && r.requirements.length === 1) {
      requirements.push(...r.requirements);
      effects.push({ kind: 'b101-bite-back', bind: t.bind, amount: num(m[2]), sourceName });
      return true;
    }
  }
  // --- "Exile it with three time counters on it and it gains suspend." (Epochrasite, when it dies) / "Put two time counters on it and it gains vanishing." (Maelstrom Djinn)
  if ((m = c.match(rx(`^Exile (?:it|${SELF}) with ${N} time counters? on it and it gains suspend\\.?$`)))) { effects.push({ kind: 'b101-suspend-self', amount: num(m[1]) }); return true; }
  if ((m = c.match(rx(`^Put ${N} time counters? on (?:it|${SELF}) and it gains vanishing\\.?$`)))) { effects.push({ kind: 'b101-gain-vanishing', amount: num(m[1]) }); return true; }
  // --- "Return target creature card with mana value equal to that spell's mana value from your graveyard to your hand." (Krile Baldesion)
  if ((m = c.match(/^(?:you may )?return target (creature card|[a-z]+ card) with mana value equal to that spell'?s mana value from your graveyard to your hand\.?$/i))) {
    const r = sub(`Return target ${m[1]} from your graveyard to your hand.`), t = r?.requirements.find(q => q.kind === 'graveyard-target');
    if (r && t) { t.mvEqualsBind = 'eventManaValue'; return take(r); }
  }
  // --- "Put a +1/+1 counter on target creature or that creature gains banding, first strike, or trample." (Nature's Blessing): one of them, chosen as it resolves; the keyword lasts.
  if ((m = c.match(/^Put a \+1\/\+1 counter on (target creature(?: [a-z' ]+)?) or that creature gains ((?:[a-z ]+, )+(?:or )?[a-z ]+)\.?$/i))) {
    const kws = m[2].split(/,\s*(?:or\s+)?|\s+or\s+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    const r = sub(`Put a +1/+1 counter on ${m[1]}.`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && kws.length >= 2 && kws.every(k => rx(`^${KW}$`).test(k))) {
      const pick = `pick${requirements.length}`, counter = '+1/+1 counter', branches = { [counter]: r.effects };
      for (const k of kws) branches[k] = [{ kind: 'grant-keyword', bind: t.bind, keyword: k, enabled: true, expires: 'permanent' }];
      requirements.push(...r.requirements, { kind: 'choose-text', bind: pick, options: [counter, ...kws], label: 'Choose one: a +1/+1 counter, or a keyword' });
      effects.push({ kind: 'b101-pick', bind: pick, branches });
      return true;
    }
  }
  // --- "Exile target creature an opponent controls until an opponent becomes the monarch." (Palace Jailer)
  if ((m = c.match(/^Exile (target creature an opponent controls) until an opponent becomes the monarch\.?$/i))) {
    const r = sub('Exile target creature an opponent controls.'), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t) { requirements.push(...r.requirements); effects.push({ kind: 'b101-exile-monarch', bind: t.bind }); return true; }
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

  // --- Hurricane, Earthquake: "deals X damage to each creature with flying and each player."
  if ((m = c.match(rx(`^(?:.+? )?deals ${N} damage to each creature (with|without) flying and each (player|opponent)\\.?$`)))) {
    const n = num(m[1]);
    if (n === 'X') requirements.push({ kind: 'number', bind: 'X', label: 'Choose X', min: 0, max: 99 });
    effects.push({ kind: 'damage-each', amount: n, filter: `creature|${m[2].toLowerCase() === 'without' ? 'nokeyword' : 'keyword'}:flying`, creatures: 'all', players: /opponent/i.test(m[3]) ? 'opponents' : 'all', sourceName });
    return true;
  }
  // --- "Target creature can't attack this turn."
  if ((m = c.match(/^(Target creature[^.]*?) can'?t attack this turn\.?$/i)) && !/\b(?:gets?|gains?|and)\b/i.test(m[1])) {
    effects.push({ kind: 'combat-restriction', bind: H.targetRequirement(requirements, m[1].toLowerCase(), m[1]), restriction: 'cant-attack', expires: 'cleanup' });
    return true;
  }
  // --- "Return another creature you control to its owner's hand." (chosen as it resolves, never this permanent)
  if ((m = c.match(/^(?:you )?return another (land|creature|artifact|enchantment|permanent|nonland permanent)( you control)? to its owner'?s hand\.?$/i))) {
    const bind = `choice${requirements.length}`;
    requirements.push({ kind: 'choose-permanent', bind, scope: `${m[1].toLowerCase()}${m[2] ? ' you control' : ''}`, label: `another ${m[1]}${m[2] || ''} to return to its owner's hand`, notSource: true });
    effects.push({ kind: 'bounce', bind });
    return true;
  }
  // --- "up to one other target creature": the same instruction, and this permanent can't be chosen.
  if (/\bother target\b/i.test(c) && !/\bany other target\b/i.test(c)) {
    const r = sub(c.replace(/\bother target\b/i, 'target'));
    const ts = r ? r.requirements.filter(q => q.kind === 'target' || q.kind === 'multi-target') : [];
    if (r && ts.length === 1) { ts[0].notSource = true; return take(r); }
  }
  // --- Twiddle: "You may tap or untap target artifact, creature, or land."
  if ((m = c.match(/^((?:you may )?tap or untap) target (artifact, creature, or land|artifact or creature|creature or land|artifact|creature|land)\.?$/i))) {
    const r = sub(`${cap(m[1])} target permanent.`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t) { t.scope = `target ${m[2].toLowerCase().replace(/, or |, /g, ' or ')}`; t.label = `target ${m[2]}`; return take(r); }
  }
  // --- "Target opponent gains control of this creature." (Humble Defector, Jinxed Idol)
  if ((m = c.match(rx(`^(target opponent|target player|that player|defending player) gains control of (${SELF}|it)\\.?$`)))) {
    const pb = /^target/i.test(m[1]) ? H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]) : /^defending/i.test(m[1]) ? 'defendingPlayer' : 'eventPlayer';
    effects.push({ kind: 'b101-give-control', playerBind: pb });
    return true;
  }
  // --- "… fights target creature an opponent controls." (read as "you don't control"; the choice shows only opponents' creatures)
  if (/\bfights? (?:another |up to one )?target creature an opponent controls\.?$/i.test(c)) {
    const r = sub(c.replace(/target creature an opponent controls(\.?)$/i, "target creature you don't control$1"));
    if (r) { for (const q of r.requirements) if (/you don't control$/i.test(q.scope || '')) { q.scope = q.scope.replace(/you don't control$/i, 'an opponent controls'); q.label = String(q.label || '').replace(/you don't control$/i, 'an opponent controls'); } return take(r); }
  }
  // --- "Return it to its owner's hand at end of combat." / "Destroy that creature at the beginning of the next end step."
  if ((m = c.match(/^(Return|Destroy|Exile|Sacrifice) (it|that creature|that permanent)(?: to its owner'?s hand)? (at end of combat|at the beginning of the next end step)\.?$/i)) && (m[1].toLowerCase() === 'return') === /owner'?s hand/i.test(c)) {
    const kind = { return: 'bounce', destroy: 'destroy', exile: 'exile', sacrifice: 'sacrifice' }[m[1].toLowerCase()];
    const when = /combat/i.test(m[3]) ? { event: 'end-combat', whose: 'any' } : { event: 'end-step', whose: 'any', sameTurn: true };
    effects.push({ kind: 'delay', when, effects: [{ kind, bind: /^it$/i.test(m[2]) ? 'eventCard' : 'thatCard', soft: true }], requirements: [], b101Pronoun: true });
    return true;
  }
  // --- "Double this creature's power until end of turn." / "double its power until end of turn"
  if ((m = c.match(rx(`^double (${SELFP}'s|its|that creature's) power until end of turn\\.?$`)))) {
    const r = sub("Double target creature's power until end of turn."), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && r.requirements.length === 1) { effects.push(...r.effects.map(e => swapBind(e, t.bind, /^its$/i.test(m[1]) ? 'b101It' : /^that/i.test(m[1]) ? 'b101That' : 'sourceId'))); return true; }
  }
  // --- "Tap all creatures." / "Tap all other creatures." / "Untap each creature you control."
  if ((m = c.match(/^(tap|untap) (?:all|each) (other )?(creatures?|permanents?|artifacts?|lands?|nonland permanents?)( you control| your opponents control| you don'?t control)?\.?$/i))) {
    effects.push({ kind: 'b101-tap-all', untap: /^untap/i.test(m[1]), other: !!m[2], filter: singularB101(m[3].toLowerCase().replace(/^nonland permanents?$/, 'nonland permanent')), scope: !m[4] ? 'all' : /you control/i.test(m[4]) && !/don/i.test(m[4]) ? 'you' : 'opponents' });
    return true;
  }
  // --- "This creature deals 2 damage to each other creature." (not to itself)
  if ((m = c.match(rx(`^(?:${SELF}|it) deals ${N} damage to each other creature( and each (?:player|opponent))?\\.?$`)))) {
    effects.push({ kind: 'b101-damage-others', amount: num(m[1]), players: !m[2] ? null : /opponent/i.test(m[2]) ? 'opponents' : 'all', sourceName });
    return true;
  }
  // --- "Destroy all artifacts, creatures, and enchantments."
  if ((m = c.match(/^(Destroy|Exile) all ([a-z]+)s, ([a-z]+)s,? and ([a-z]+)s\.?$/i)) && [m[2], m[3], m[4]].every(w => ['artifact', 'creature', 'enchantment', 'land', 'planeswalker'].includes(w.toLowerCase()))) {
    effects.push({ kind: 'zone-each', scope: 'all', filter: [m[2], m[3], m[4]].map(w => w.toLowerCase()).join(' or '), to: /^destroy/i.test(m[1]) ? 'graveyard' : 'exile', ...(/^destroy/i.test(m[1]) ? { destroy: true } : {}) });
    return true;
  }
  // --- "deals 2 damage to any target and 1 damage to any other target."
  if ((m = c.match(rx(`^(.+? deals) ${N} damage to (any target|target [a-z' ]+?) and ${N} damage to (any other target|another target [a-z' ]+?)\\.?$`)))) {
    const a1 = sub(`${m[1]} ${m[2]} damage to ${m[3]}.`), a2 = sub(`${m[1]} ${m[4]} damage to ${m[5].replace(/^any other target$/i, 'any target').replace(/^another target/i, 'target')}.`);
    const t1 = a1?.requirements.find(q => q.kind === 'target'), t2 = a2?.requirements.find(q => q.kind === 'target');
    if (a1 && a2 && t1 && t2 && a1.requirements.length === 1 && a2.requirements.length === 1) {
      const b2 = `${t2.bind}_b`;
      requirements.push(t1, { ...t2, bind: b2, excludeBind: t1.bind, label: m[5] });
      effects.push(...a1.effects, ...a2.effects.map(e => swapBind(e, t2.bind, b2)));
      return true;
    }
  }
  // --- "Discard up to two cards." / "Discard any number of cards."
  if ((m = c.match(rx(`^(?:you may )?discard (?:up to ${N}|(any number of)) cards\\.?$`)))) {
    const bind = `discardUpTo${requirements.length}`;
    requirements.push({ kind: 'b101-hand-cards', bind, min: 0, max: m[2] ? 99 : num(m[1]), label: m[2] ? 'any number of cards to discard' : `up to ${m[1]} cards to discard` });
    effects.push({ kind: 'b101-discard-chosen', bind });
    return true;
  }
  // --- "Sacrifice this creature unless you discard a card." (asked as it resolves; "at random": the game picks)
  if ((m = c.match(rx(`^sacrifice (${SELF}|it) unless you discard (a|an) (land |creature |)card( at random)?\\.?$`)))) {
    const bind = `keepBy${requirements.length}`;
    requirements.push(m[4] ? { kind: 'yes-no', bind, label: `Discard a card at random to keep ${sourceName}?` } : { kind: 'b101-hand-cards', bind, min: 0, max: 1, filter: m[3].trim().toLowerCase() || null, label: `a ${m[3]}card to discard to keep ${sourceName} (choose none to sacrifice it)` });
    effects.push({ kind: 'b101-sac-unless-discard', bind, random: !!m[4] });
    return true;
  }
  // --- "he connives", "put a +1/+1 counter on him", "return her to the battlefield …": the same as "it".
  if (/\b(?:he|she|him)\b/i.test(c) || /\b(?:on|return|exile|sacrifice|untap|tap|transform) her\b/i.test(c)) {
    const r = sub(c.replace(/\b(?:he|she)\b/gi, 'it').replace(/\bhim\b/gi, 'it').replace(/\b(on|return|exile|sacrifice|untap|tap|transform) her\b/gi, '$1 it').replace(/\b(?:his|her) owner's\b/gi, "its owner's"));
    if (r) return take(r);
  }

  // --- Build 102. Colours: "Target creature becomes red until end of turn." (Wisps), "… becomes black and gains fear …"
  const COLW = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
  if ((m = c.match(rx(`^(target creature|target permanent|target artifact|target land|${SELF}|it|that creature) becomes? (white|blue|black|red|green|colorless)(?: and (white|blue|black|red|green))?( until end of turn)?(?: and (gains? [a-z ,]+|gets? [+-]\\d+\\/[+-]\\d+) until end of turn)?\\.?$`))) && (m[4] || /until end of turn$/i.test(c))) {
    const colors = m[2].toLowerCase() === 'colorless' ? [] : [COLW[m[2].toLowerCase()], ...(m[3] ? [COLW[m[3].toLowerCase()]] : [])];
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : pronounBind(m[1]);
    effects.push({ kind: 'animate', bind, power: null, toughness: null, addTypes: [], subtypes: [], keywords: [], colors, expires: 'cleanup', typeOnly: false, colorOnly: true });
    if (m[5]) {
      const r2 = sub(`Target creature ${m[5].replace(/^gain /i, 'gains ').replace(/^get /i, 'gets ')} until end of turn.`), t2 = r2?.requirements.find(q => q.kind === 'target');
      if (!r2 || !t2 || r2.requirements.length !== 1) { effects.pop(); if (/^target/i.test(m[1])) requirements.pop(); return false; }
      effects.push(...r2.effects.map(e => swapBind(e, t2.bind, bind)));
    }
    return true;
  }
  // "This creature becomes the color of your choice until end of turn."
  if ((m = c.match(rx(`^(${SELF}|target creature|target permanent) becomes the colou?r of your choice until end of turn\\.?$`)))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : 'sourceId', colorBind = `color${requirements.length}`;
    requirements.push({ kind: 'color', bind: colorBind, includeColorless: false, label: 'Choose a color' });
    effects.push({ kind: 'b101-set-color', bind, colorBind });
    return true;
  }
  // "Prevent all combat damage that would be dealt by target creature this turn." / "… dealt to target creature …"
  if ((m = c.match(/^Prevent all combat damage that would be dealt (by|to) (target (?:attacking |blocking )?creature(?: [a-z' ]+)?|it|that creature) this turn\.?$/i))) {
    const bind = /^target/i.test(m[2]) ? H.targetRequirement(requirements, m[2].toLowerCase(), m[2]) : /^it$/i.test(m[2]) ? 'b101It' : 'b101That';
    effects.push({ kind: 'prevent-combat', scope: /^by$/i.test(m[1]) ? 'by-card' : 'to-card', bind });
    return true;
  }
  // "Prevent all damage that would be dealt to target creature this turn." (all damage, not only combat)
  if ((m = c.match(/^Prevent all damage that would be dealt to (target creature(?: [a-z' ]+)?|target player|you|it) this turn\.?$/i))) {
    const self = /^you$/i.test(m[1]), bind = self ? null : /^it$/i.test(m[1]) ? 'b101It' : /player/i.test(m[1]) ? H.playerRequirement(requirements, 'player', m[1]) : H.targetRequirement(requirements, m[1].toLowerCase(), m[1]);
    effects.push({ kind: 'prevent-damage', ...(self ? { toController: true } : { bind }), amount: 9999, expires: 'cleanup' });
    return true;
  }
  // "Target creature can't be regenerated this turn."
  if ((m = c.match(/^(target creature(?: [a-z' ]+)?|it|that creature) can'?t be regenerated this turn\.?$/i))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : /^it$/i.test(m[1]) ? 'b101It' : 'b101That';
    effects.push({ kind: 'b101-temp', bind, fx: { kind: 'cant-regenerate', expires: 'cleanup' }, note: "can't be regenerated this turn" });
    return true;
  }
  // "You skip your next turn." / "Target player skips their next turn."
  if ((m = c.match(/^(you|target player|target opponent|that player) skips? (?:your|their) next turn\.?$/i))) {
    const pb = /^you$/i.test(m[1]) ? null : /^that/i.test(m[1]) ? 'eventPlayer' : H.playerRequirement(requirements, /opponent/i.test(m[1]) ? 'opponent' : 'player', m[1]);
    effects.push({ kind: 'b101-skip-turn', ...(pb ? { forPlayerBind: pb } : {}) });
    return true;
  }
  // "This creature can block an additional creature this turn." / "… any number of creatures this turn."
  if ((m = c.match(rx(`^(${SELF}|target creature(?: you control)?|it) can block (an|one|two|three|any number of) additional creatures? this turn\\.?$`))) || (m = c.match(rx(`^(${SELF}|target creature(?: you control)?|it) can block (any number of) creatures this turn\\.?$`)))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : /^it$/i.test(m[1]) ? 'b101It' : 'sourceId';
    effects.push({ kind: 'b101-temp', bind, fx: { kind: 'extra-blocks', amount: /any number/i.test(m[2]) ? 99 : num(m[2]), expires: 'cleanup' }, note: 'can block more creatures this turn' });
    return true;
  }
  // "Target creature blocks this turn if able." / "It must be blocked this turn if able." / "All creatures able to block target creature this turn do so."
  if ((m = c.match(rx(`^(target creature(?: [a-z' ]+)?|${SELF}|it|that creature) blocks this turn if able\\.?$`)))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : /^it$/i.test(m[1]) ? 'b101It' : /^that/i.test(m[1]) ? 'b101That' : 'sourceId';
    effects.push({ kind: 'b101-temp', bind, fx: { kind: 'must-block-any', expires: 'cleanup' }, note: 'must block this turn if able' });
    return true;
  }
  if ((m = c.match(rx(`^(target creature(?: [a-z' ]+)?|${SELF}|it|that creature) must be blocked this turn if able\\.?$`)))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : /^it$/i.test(m[1]) ? 'b101It' : /^that/i.test(m[1]) ? 'b101That' : 'sourceId';
    effects.push({ kind: 'b101-temp', bind, fx: { kind: 'must-be-blocked', expires: 'cleanup' }, note: 'must be blocked this turn if able' });
    return true;
  }
  if ((m = c.match(rx(`^All creatures able to block (target creature(?: [a-z' ]+)?|${SELF}|it|that creature) this turn do so\\.?$`)))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : /^it$/i.test(m[1]) ? 'b101It' : /^that/i.test(m[1]) ? 'b101That' : 'sourceId';
    effects.push({ kind: 'b101-temp', bind, fx: { kind: 'lure-turn', expires: 'cleanup' }, note: 'must be blocked by every creature able to block it this turn' });
    return true;
  }
  // "… gets +2/+2 until end of turn and can attack this turn as though it didn't have defender." (defender off this turn)
  if ((m = c.match(rx(`^(${SELF}|target creature(?: [a-z' ]+)?)( gets [+-]\\d+\\/[+-]\\d+ until end of turn and)? can attack this turn as though (?:it|they) didn'?t have defender\\.?$`)))) {
    const r = m[2] ? sub(`${m[1]} gets ${m[2].match(/[+-]\d+\/[+-]\d+/)[0]} until end of turn.`) : null;
    if (m[2] && !r) return false;
    if (r) { effects.push(...r.effects); requirements.push(...r.requirements); }
    const t = r?.requirements.find(q => q.kind === 'target');
    effects.push({ kind: 'grant-keyword', bind: t ? t.bind : /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), m[1]) : 'sourceId', keyword: 'defender', enabled: false, expires: 'cleanup' });
    return true;
  }
  // "if you have fewer than seven cards in hand, draw cards equal to the difference"
  if ((m = c.match(rx(`^(?:then )?if you have fewer than ${N} cards in (?:your )?hand, draw cards equal to the difference\\.?$`)))) {
    effects.push({ kind: 'draw', scope: 'you', amount: { kind: 'b101-math', op: 'minus', a: num(m[1]), b: { kind: 'count', zone: 'hand', filter: 'card' } } });
    return true;
  }
  // "it deals that much damage to each other opponent" (the one dealt damage is left out)
  if ((m = c.match(rx(`^(?:${SELF}|it) deals (that much|${N}) damage to each other opponent\\.?$`)))) {
    effects.push({ kind: 'b101-damage-other-opponents', amount: /that much/i.test(m[1]) ? { kind: 'binding', bind: 'eventAmount' } : num(m[1]), sourceName });
    return true;
  }
  // "Remove a +1/+1 counter from it at end of combat." (Clockwork creatures)
  if ((m = c.match(rx(`^remove (a|an|one|two) ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters? from (it|${SELF}) at end of combat\\.?$`)))) {
    effects.push({ kind: 'delay', when: { event: 'end-combat', whose: 'any' }, effects: [{ kind: 'remove-counter', bind: /^it$/i.test(m[3]) ? 'eventCard' : 'sourceId', counter: m[2], amount: num(m[1]) }], requirements: [] });
    return true;
  }
  // "Draw that many cards plus one."
  if ((m = c.match(rx(`^(?:you )?draw that many cards plus ${N}\\.?$`)))) { effects.push({ kind: 'draw', scope: 'you', amount: { kind: 'b101-math', op: 'plus', a: { kind: 'binding', bind: 'thatMany' }, b: num(m[1]) } }); return true; }
  // "~ deals 2 damage to it." (the trigger's card, or what was targeted before)
  if ((m = c.match(rx(`^(?:${SELF}) deals ${N} damage to (it|that creature)\\.?$`)))) { effects.push({ kind: 'damage', amount: num(m[1]), bind: /^it$/i.test(m[2]) ? 'b101It' : 'b101That', sourceName }); return true; }
  // "That creature is a black Zombie in addition to its other colors and types." (permanently)
  if ((m = c.match(/^(?:That creature|It)(?: is| becomes) an? (white|blue|black|red|green) ([A-Z][a-z]+) in addition to its other colors and types\.?$/i))) {
    effects.push({ kind: 'animate', bind: /^it/i.test(c) ? 'b101It' : 'b101That', power: null, toughness: null, addTypes: [], subtypes: [m[2]], keywords: [], colors: null, addColors: [COLW[m[1].toLowerCase()]], expires: null, typeOnly: true, subtypeOnly: true });
    return true;
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
  if (!/\b(?:its|their) power\b|^(?:target|another target|up to)/i.test(c) && (m = c.match(rx(`^(.+? deals? (?:${N}|that much) damage to) each of (up to )?${N} (targets?|target creatures?(?: and\\/or planeswalkers?)?|target creatures? (?:an opponent controls|you don't control|without flying|with flying)|target players?|target opponents?|target creatures? or planeswalkers?)\\.?$`)))) {
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
  // --- "Liquid Fire deals X damage to target creature and 5 minus X damage to that creature's controller, where X is the chosen number."
  if ((m = c.match(rx(`^(${SELFP}) deals X damage to target creature and (\\d+) minus X damage to that creature'?s controller, where X is the chosen number\\.?$`)))) {
    const tb = H.targetRequirement(requirements, 'target creature', 'target creature');
    requirements.unshift({ kind: 'number', bind: 'X', label: `Choose a number between 0 and ${m[2]}`, min: 0, max: Number(m[2]) });
    effects.push({ kind: 'remember-controller', bind: tb, as: `controllerOf${tb}` }, { kind: 'damage', amount: 'X', bind: tb, sourceName }, { kind: 'damage', amount: { kind: 'b101-math', op: 'minus', a: Number(m[2]), b: 'X' }, bind: `controllerOf${tb}`, sourceName });
    return true;
  }
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
  if ((m = c.match(rx(`^(It|That creature|That permanent|That land|That artifact|${SELF}) ((?:can'?t|must|blocks?|attacks?|doesn'?t|gains?|gets?|becomes?|loses?|fights?|is|deals?|has|phases?) .+)$`))) && !/\btarget\b/i.test(c) && !/\bequal to (?:its|their) (?:power|toughness)\b/i.test(c)) {
    const noun = /land/i.test(m[1]) ? 'land' : /artifact/i.test(m[1]) ? 'artifact' : /permanent/i.test(m[1]) ? 'permanent' : 'creature';
    const r = sub(`Target ${noun} ${m[2]}`), t = r?.requirements.find(q => q.kind === 'target');
    if (r && t && r.requirements.length === 1) { effects.push(...r.effects.map(e => swapBind(e, t.bind, pronounBind(m[1])))); return true; }
  }

  // --- "Target creature defending player controls loses all abilities and has base power and toughness 0/1 until end of turn." (Warkite Marauder)
  if ((m = c.match(/^(target creature(?: [a-z' ]+?)?|it|that creature) loses all abilities(?: and has base power and toughness (\d+)\/(\d+))? until end of turn\.?$/i))) {
    const bind = /^target/i.test(m[1]) ? H.targetRequirement(requirements, m[1].toLowerCase(), cap(m[1])) : pronounBind(m[1]);
    effects.push({ kind: 'b101-temp', bind, fx: { kind: 'animate', loseAbilities: true, ...(m[2] ? { power: m[2], toughness: m[3] } : {}), addTypes: [], subtypes: [], keywords: [], colors: null, expires: 'cleanup' }, note: `loses all abilities${m[2] ? ` and becomes ${m[2]}/${m[3]}` : ''} until end of turn` });
    return true;
  }

  // --- "X deals 2 damage to target player and gains indestructible until end of turn." (Ellie)
  if ((m = c.match(rx(`^(${SELFP} deals? \\w+ damage to (?:any target|target [a-z ]+?)) and (?:gains?|has) ([a-z ,]+?) until end of turn\\.?$`)))) {
    const r = sub(`${m[1]}.`);
    if (r) {
      effects.push(...r.effects, ...H.KEYWORD_LIST(m[2]).map(keyword => ({ kind: 'grant-keyword', bind: 'sourceId', keyword, enabled: true, expires: 'cleanup' })));
      requirements.push(...r.requirements);
      return true;
    }
  }
  // --- "Each player creates a 1/1 green Cat creature token for each untapped Forest they control." (Waiting in the Weeds)
  if ((m = c.match(rx(`^Each player creates ${N} (.+? tokens?) for each (.+? they control)\\.?$`)))) {
    const r = sub(`Create ${m[1]} ${m[2]}.`), tok = r?.effects.length === 1 && r.effects[0].kind === 'create-token' ? r.effects[0] : null, expr = parseCountB101(m[3]);
    if (tok && !r.requirements.length && expr && expr.kind === 'b101-n' && expr.who === 'ref') {
      bindAmountPlayerB101(expr, '__each');
      const n = num(m[1]);
      effects.push({ kind: 'b101-per-player', opponents: false, x: expr, effects: [{ ...tok, amount: n === 1 ? 'X' : { kind: 'b101-math', op: 'times', a: 'X', b: n }, forPlayerBind: '__each' }] });
      return true;
    }
  }
  // --- "Gain control of target creature until end of turn, untap that creature, and it gains haste until end of turn." (Yasova, Eldrazi Obligator)
  if ((m = c.match(/^gain control of (target creature[^,]*?) until end of turn, untap (?:that creature|it), and it gains haste until end of turn\.?$/i))) {
    const bind = H.targetRequirement(requirements, m[1].toLowerCase(), cap(m[1]));
    effects.push({ kind: 'gain-control', bind, untilEndOfTurn: true, untap: true, haste: true });
    return true;
  }
  // --- Two targets, each with its own change: "Target creature you control gets +X/+0 until end of turn and up to one target creature an opponent controls gets -0/-X until end of turn." (Gloom Ripper)
  if ((m = c.match(/^(target creature[^,]*? gets [+-][\dX]+\/[+-][\dX]+ until end of turn) and ((?:up to one )?target creature[^,]*? gets [+-][\dX]+\/[+-][\dX]+ until end of turn)\.?$/i))) {
    const a = sub(`${cap(m[1])}.`), b = sub(`${cap(m[2])}.`);
    const ta = a?.requirements.filter(q => q.kind === 'target'), tb = b?.requirements.filter(q => q.kind === 'target');
    if (a && b && ta.length === 1 && tb.length === 1) {
      const keepA = a.requirements.filter(q => !(q.kind === 'number' && q.bind === 'X')), base = requirements.length + keepA.length;
      const old = tb[0].bind, now = `target${base}`;
      requirements.push(...keepA, ...b.requirements.filter(q => !(q.kind === 'number' && q.bind === 'X')).map(q => (q.bind === old ? { ...q, bind: now } : q)));
      effects.push(...a.effects, ...b.effects.map(e => swapBind(e, old, now)));
      return true;
    }
  }
  // --- "Put two +1/+1 counters on that token for each spell you've cast this turn other than the first." (Outlaw Stitcher)
  if ((m = c.match(rx(`^(?:Then )?put ${N} ([+-]\\d+\\/[+-]\\d+|[a-z]+) counters? on (it|that creature|that token|SELFNAME|${SELFP}) for each (.+?)\\.?$`))) && num(m[1]) > 1) {
    const expr = parseCountB101(m[4]) || null;
    if (expr && !amountNeedsPlayerB101(expr)) {
      effects.push({ kind: 'counter', bind: /token/i.test(m[3]) ? 'thatCard' : pronounBind(m[3]), counter: m[2].toLowerCase(), amount: { kind: 'b101-math', op: 'times', a: expr, b: num(m[1]) } });
      return true;
    }
  }
  // --- "Target planeswalker you control deals damage equal to its loyalty to target creature or planeswalker an opponent controls." (Compel Brutality)
  if ((m = c.match(/^(target planeswalker you control) deals damage equal to its loyalty to (target creature or planeswalker an opponent controls)\.?$/i))) {
    const a = H.targetRequirement(requirements, m[1].toLowerCase(), cap(m[1])), b = H.targetRequirement(requirements, m[2].toLowerCase(), m[2], { excludeBind: a });
    effects.push({ kind: 'damage-from-selected-creature', sourceBind: a, targetBind: b, amount: { kind: 'b101-loyalty', bind: a } });
    return true;
  }

  // --- Several creatures each deal damage equal to their power to one target (Allies at Last, Common Goal, Friendly Rivalry,
  // Graceful Takedown, Combo Attack, Signature Slam).
  if ((m = c.match(rx(`^(.+?) (?:each )?deals? damage equal to (?:its|their) power to (target creature(?: you don't control| an opponent controls| your opponents control)?)\\.?$`)))) {
    const dealers = [];
    let okAll = true, multi = false;
    const segs = m[1].split(/ and (?=up to |any number of |target |one or )/i);
    for (const seg of segs) {
      const g = seg.match(/^(?:(up to|one or|any number of) )?(?:(one|two|three|four|a|\d+) )?(other )?target ((?:[a-z]+ )*?creatures?) (you control|your team controls)$/i);
      if (!g) { okAll = false; break; }
      const plural = /creatures$/i.test(g[4]), n = g[2] ? num(g[2]) : null, q = (g[1] || '').toLowerCase();
      let min = 1, max = 1;
      if (q === 'up to') { min = 0; max = n ?? 1; } else if (q === 'one or') { min = 1; max = n ?? 2; } else if (q === 'any number of') { min = 0; max = 99; } else if (n) { min = max = n; }
      if (plural || q || max !== 1) multi = true;
      const noun = g[4].replace(/creatures$/i, 'creature').toLowerCase();
      const bind = `multi${requirements.length}`;
      requirements.push({ kind: 'multi-target', bind, scope: `target ${noun} you control`, min, max, label: `Choose ${q ? `${q} ` : ''}${n ? `${g[2].toLowerCase()} ` : ''}${g[3] ? 'other ' : ''}${g[4].toLowerCase()} you control` });
      dealers.push(bind);
    }
    if (okAll && (multi || segs.length > 1)) {
      const tb = H.targetRequirement(requirements, m[2].toLowerCase(), m[2]);
      effects.push({ kind: 'b101-deal-power', binds: dealers, targetBind: tb });
      return true;
    }
    if (!okAll || !(multi || segs.length > 1)) { while (requirements.length && /^multi\d+$/.test(requirements[requirements.length - 1].bind)) requirements.pop(); }
    // "Each modified creature you control deals damage equal to its power to target creature you don't control."
    const e = !okAll && !/\btarget\b/i.test(m[1]) && (m = c.match(rx(`^Each (.+? (?:you control|your opponents control)) deals damage equal to its power to (target creature(?: you don't control| an opponent controls| your opponents control)?)\\.?$`))) ? parseCountB101(m[1]) : null;
    if (e && e.kind === 'b101-n') {
      const tb = H.targetRequirement(requirements, m[2].toLowerCase(), m[2]);
      effects.push({ kind: 'b101-deal-power', expr: e, targetBind: tb });
      return true;
    }
  }
  return false;
}

/** Several sentences read together. Returns { part, consumed } or null. `parts` are the instructions compiled so far. */
export function compileB101Sequence(clauses, i, { sourceName, parts = [] }) {
  const c0 = String(clauses[i] || '').replace(/\([^()]*\)/g, '').trim();
  let m;
  // "Draw X cards, where X is the number of cards discarded this way. If you have an enduring story, ~ deals X damage to each opponent." (Balin, Loremaster)
  if ((m = c0.match(/^Draw X cards,? where X is the number of cards discarded this way\.?$/i)) && (m = String(clauses[i + 1] || '').replace(/\([^()]*\)/g, '').trim().match(/^If you have an enduring story, (?:.+?) deals X damage to each opponent\.?$/i))) {
    return { part: { effects: [{ kind: 'set-x', amount: { kind: 'binding', bind: 'discardedThisWay' } }, { kind: 'draw', scope: 'you', amount: 'X' }, { kind: 'condition', test: 'enduring-story', skip: 1 }, { kind: 'damage-each', amount: 'X', creatures: null, players: 'opponents', sourceName }], requirements: [], unsupported: [] }, consumed: 2 };
  }
  // "Prevent the next 3 damage that would be dealt to target creature this turn. At the beginning of the next end step, put a +0/+1 counter on that creature for each 1 damage prevented this way." (Sacred Boon)
  if (/^Prevent the next \d+ damage that would be dealt to target creature this turn\.?$/i.test(c0) && (m = String(clauses[i + 1] || '').match(/^At the beginning of the next end step, put a ([+-]\d+\/[+-]\d+) counter on that creature for each 1 damage prevented this way\.?$/i))) {
    const whole = H.compileEffectText(`${c0} At the beginning of the next end step, put a ${m[1]} counter on that creature.`, { sourceName });
    const pd = whole.effects.find(e => e.kind === 'prevent-damage'), dl = whole.effects.find(e => e.kind === 'delay'), ct = dl?.effects?.find(e => e.kind === 'counter');
    if (whole.supported && pd && ct) { pd.countPrevented = true; ct.amount = { kind: 'b101-prevented', bind: pd.bind }; return { part: { effects: whole.effects, requirements: whole.requirements, unsupported: [] }, consumed: 2 }; }
  }
  // "Put a +1/+1 counter on ~. It gains flying until end of turn." (Estinien Varlineau): "it" is the creature just named, not the spell that triggered this.
  {
    const nm = String(sourceName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), short = String(sourceName || '').split(',')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const named = new RegExp(`^Put (?:a|an|one|two|three|\\d+) (?:[+-]\\d+\\/[+-]\\d+|[a-z]+) counters? on (?:this (?:creature|permanent|artifact|enchantment)|${nm}|${short})\\.?$`, 'i');
    const nxt = String(clauses[i + 1] || '').replace(/\([^()]*\)/g, '').trim();
    if (named.test(c0) && /^It (?:gains|has) [a-z ,]+ until end of turn\.?$/i.test(nxt)) {
      const a = H.compileEffectText(c0, { sourceName }), b = H.compileEffectText(nxt.replace(/^It /i, 'This creature '), { sourceName });
      if (a.supported && b.supported && a.effects.length && b.effects.length) return { part: { effects: [...a.effects, ...b.effects], requirements: [...a.requirements, ...b.requirements], unsupported: [] }, consumed: 2 };
    }
  }
  // "Choose up to one target creature you don't control with flying. This creature gets +X/+0 until end of turn, where X is …, then you may have this creature fight that creature." (Kraul Harpooner)
  if (/^Choose up to one target creature you don'?t control with flying\.?$/i.test(c0) && (m = String(clauses[i + 1] || '').replace(/\([^()]*\)/g, '').trim().match(/^(This creature gets \+X\/\+0 until end of turn, where X is the number of creature cards in your graveyard), then you may have this creature fight that creature\.?$/i))) {
    const a = H.compileEffectText(c0, { sourceName }), b = H.compileEffectText(`${m[1]}.`, { sourceName }), t = a.requirements.find(q => q.kind === 'target');
    if (a.supported && b.supported && t) {
      const may = `mayFight${parts.length}`;
      return { part: { effects: [...a.effects.filter(e => e.kind !== 'note'), ...b.effects, { kind: 'b101-fight-if', sourceBind: 'sourceId', targetBind: t.bind, mayBind: may }], requirements: [...a.requirements, ...b.requirements, { kind: 'yes-no', bind: may, label: `Have ${sourceName} fight that creature?` }], unsupported: [] }, consumed: 2 };
    }
  }
  // "Target opponent gains control of any number of target permanents you control. Draw a card for each one they gained control of this way." (Coveted Falcon)
  if (/^Target opponent gains control of any number of target permanents you control\.?$/i.test(c0) && /^Draw a card for each one they gained control of this way\.?$/i.test(String(clauses[i + 1] || '').trim())) {
    const whole = H.compileEffectText(c0, { sourceName }), mt = whole.requirements.find(q => q.kind === 'multi-target');
    if (whole.supported && mt) return { part: { effects: [...whole.effects, { kind: 'draw', scope: 'you', amount: { kind: 'b101-gained-control', bind: mt.bind } }], requirements: whole.requirements, unsupported: [] }, consumed: 2 };
  }
  // "Exile up to two target cards from a single graveyard. [If this spell was kicked, instead exile target player's graveyard.] Create a 2/2 black Rogue creature token for each creature card exiled this way." (Waste Management)
  if (/^Exile up to two target cards from a single graveyard\.?$/i.test(c0)) {
    const n1 = String(clauses[i + 1] || '').replace(/\([^()]*\)/g, '').trim(), n2 = String(clauses[i + 2] || '').replace(/\([^()]*\)/g, '').trim();
    const kicked = /^If this spell was kicked, instead exile target player'?s graveyard\.?$/i.test(n1), tokenText = kicked ? n2 : n1;
    if ((m = tokenText.match(/^Create (a|an|one|two|three) (.+? creature tokens?) for each creature card exiled this way\.?$/i))) {
      const tok = H.compileEffectText(`Create ${m[1]} ${m[2]}.`, { sourceName }), t0 = tok.supported && tok.effects.length === 1 && tok.effects[0].kind === 'create-token' ? tok.effects[0] : null;
      if (t0) {
        const bind = kicked ? `player${parts.length + 40}` : `gyCards${parts.length}`;
        const req = kicked ? { kind: 'player', bind, scope: 'player', label: 'target player' } : { kind: 'b101-gy-cards', bind, max: 2, label: 'up to two cards from a single graveyard' };
        const count = { kind: 'b101-this-way', mine: false, nontoken: false, not: [], types: ['creature'], card: true };
        return { part: { effects: [{ kind: 'b101-exile-graveyard', bind, whole: kicked }, { ...t0, amount: /^(a|an|one)$/i.test(m[1]) ? count : { kind: 'b101-math', op: 'times', a: count, b: num(m[1]) } }], requirements: [req], unsupported: [] }, consumed: kicked ? 3 : 2 };
      }
    }
  }
  // "A creature destroyed this way can't be regenerated." (Essence Vortex): the destroy before it can't be stopped by a regeneration shield.
  if (/^(?:It|That creature|A creature destroyed this way|Creatures destroyed this way) can'?t be regenerated\.?$/i.test(c0)) {
    const d = [...parts].reverse().flatMap(p => [...(p.effects || [])].reverse()).find(e => e.kind === 'destroy');
    if (d) { d.noRegen = true; return { part: { effects: [], requirements: [], unsupported: [] }, consumed: 1 }; }
  }
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
    case 'b101-set-color': {
      const hit = locateCardInGame(game, bindings[effect.bind] || effect.bind), col = bindings[effect.colorBind];
      if (!hit || hit.zone !== 'battlefield' || !col) return true;
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { kind: 'animate', addTypes: [], subtypes: [], keywords: [], colors: [col], expires: 'cleanup' }];
      notes.push(`${definitionFor(game, hit.card)?.name || 'It'} becomes ${({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' })[col] || col} until end of turn.`);
      return true;
    }
    case 'b101-temp': {
      const hit = locateCardInGame(game, bindings[effect.bind] || effect.bind);
      if (!hit || hit.zone !== 'battlefield') { notes.push('It is no longer on the battlefield.'); return true; }
      hit.card.temporaryEffects = [...(hit.card.temporaryEffects || []), { ...effect.fx }];
      notes.push(`${definitionFor(game, hit.card)?.name || 'It'} ${effect.note}.`);
      return true;
    }
    case 'b101-skip-turn':
      if (controller) { controller.skipTurns = Number(controller.skipTurns || 0) + 1; notes.push(`${controller.displayName} skips their next turn.`); }
      return true;
    case 'b101-damage-other-opponents': {
      const skip = bindings.eventPlayer || bindings.__damagedPlayer;
      for (const p of (game.players || []).filter(q => !q.eliminated && q.playerId !== controllerId && q.playerId !== skip))
        notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage', amount: effect.amount, playerId: p.playerId, sourceName: effect.sourceName }], bindings));
      return true;
    }
    case 'b101-per-player': {
      // The same instruction for each player in turn order from you, with X counted for that player.
      const before = bindings.__each, beforeX = bindings.X;
      const order = (game.players || []).filter(p => !p.eliminated && (!effect.opponents || p.playerId !== controllerId));
      for (const p of order) {
        bindings.__each = p.playerId;
        bindings.X = Math.max(0, Number(resolveAmount(game, controllerId, effect.x, bindings)) || 0);
        notes.push(...H.applyEffectsUnsafe(game, controllerId, effect.effects, bindings));
      }
      bindings.__each = before; bindings.X = beforeX;
      return true;
    }
    case 'b101-deal-power': {
      // Each of the chosen (or counted) creatures deals damage equal to its own power to the target.
      const ids = effect.expr ? listCardsB101(game, controllerId, effect.expr, bindings, H).map(x => x.instanceId) : [...new Set((effect.binds || []).flatMap(b => [].concat(bindings[b] || [])).filter(x => typeof x === 'string'))];
      for (const id of ids) {
        const src = locateCardInGame(game, id), tgt = locateCardInGame(game, bindings[effect.targetBind]);
        if (!src || src.zone !== 'battlefield' || id === bindings[effect.targetBind]) continue;   // one object is not both a source and the target
        if (!tgt || tgt.zone !== 'battlefield') { notes.push('The target is no longer on the battlefield.'); break; }
        notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage-from-selected-creature', sourceId: id, targetId: bindings[effect.targetBind] }], bindings));
      }
      return true;
    }
    case 'b101-give-control': {
      const to = bindings[effect.playerBind], hit = locateCardInGame(game, bindings.sourceId);
      if (!to || !hit || hit.zone !== 'battlefield') { notes.push('It is no longer on the battlefield.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, to, [{ kind: 'gain-control', bind: 'sourceId', untilEndOfTurn: false }], bindings));
      return true;
    }
    case 'b101-tap-all': {
      const who = (game.players || []).filter(p => !p.eliminated && (effect.scope === 'all' || (effect.scope === 'you') === (p.playerId === controllerId)));
      let n = 0;
      for (const p of who) for (const card of [...(p.deck.battlefield || [])]) {
        if (effect.other && card.instanceId === bindings.sourceId) continue;
        if (!H.cardMatchesFilter(game, card, effect.filter) || !!card.tapped === !effect.untap) continue;
        H.setTapped(game, card, !effect.untap, bindings); n++;
      }
      notes.push(`${n} permanent${n === 1 ? '' : 's'} ${effect.untap ? 'untapped' : 'tapped'}.`);
      return true;
    }
    case 'b101-damage-others':
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage-each', amount: effect.amount, filter: `creature|not-id:${String(bindings.sourceId || '').toLowerCase()}`, creatures: 'all', players: effect.players, sourceName: effect.sourceName }], bindings));
      return true;
    case 'b101-exile-monarch': {
      const hit = locateCardInGame(game, bindings[effect.bind]);
      if (!hit || hit.zone !== 'battlefield') { notes.push('The target is no longer on the battlefield.'); return true; }
      // If an opponent is already the monarch, the duration is over before it starts.
      if ((game.players || []).some(p => !p.eliminated && p.playerId !== controllerId && (p.statuses || []).some(x => x.toLowerCase() === 'monarch'))) { notes.push('An opponent is the monarch: nothing is exiled.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'exile', bind: effect.bind }], bindings));
      const now = locateCardInGame(game, bindings[effect.bind]);
      if (now && now.zone === 'exile') game.monarchExiles = [...(game.monarchExiles || []), { cardId: now.card.instanceId, jailerId: controllerId }];
      return true;
    }
    case 'b101-suspend-self': {
      // The card that just died goes to exile with time counters and suspend (it is cast free when the last comes off).
      const hit = locateCardInGame(game, bindings.sourceId);
      if (!hit || hit.zone !== 'graveyard' || hit.card.token) { notes.push('It is no longer in the graveyard.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'move-zone', targetId: hit.card.instanceId, to: 'exile' }], bindings));
      const now = locateCardInGame(game, bindings.sourceId);
      if (now && now.zone === 'exile') { now.card.counters = { ...(now.card.counters || {}), time: Number(effect.amount || 0) }; now.card.suspended = true; notes.push(`${definitionFor(game, now.card)?.name || 'It'} is exiled with ${effect.amount} time counters and suspend.`); }
      return true;
    }
    case 'b101-gain-vanishing': {
      const hit = locateCardInGame(game, bindings.sourceId);
      if (!hit || hit.zone !== 'battlefield') { notes.push('It is no longer on the battlefield.'); return true; }
      hit.card.counters = { ...(hit.card.counters || {}), time: Number(hit.card.counters?.time || 0) + Number(effect.amount || 0) };
      hit.card.gainedVanishing = true;   // keyword-triggers-b49.js: vanishing at each upkeep
      notes.push(`${definitionFor(game, hit.card)?.name || 'It'} gets ${effect.amount} time counters and vanishing.`);
      return true;
    }
    case 'b101-pick': {
      // The branch the player chose as it resolved.
      const branch = effect.branches[bindings[effect.bind]];
      if (!branch) { notes.push('Nothing was chosen.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, branch, bindings));
      return true;
    }
    case 'b101-fight-if': {
      // "… then you may have this creature fight that creature": only if you said yes and the creature was chosen and is still there.
      const yes = bindings[effect.mayBind] === true || bindings[effect.mayBind] === 'yes' || bindings[effect.mayBind] === 'true';
      const them = locateCardInGame(game, bindings[effect.targetBind]);
      if (!yes || !them || them.zone !== 'battlefield') { notes.push(yes ? 'There is no creature left to fight.' : 'It does not fight.'); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'fight', sourceBind: effect.sourceBind, targetBind: effect.targetBind }], bindings));
      return true;
    }
    case 'b101-exile-graveyard': {
      // Up to two chosen cards, or a whole graveyard; what was exiled is remembered for "for each creature card exiled this way".
      const raw = bindings[effect.bind];
      const ids = effect.whole ? (playerById(game, raw)?.deck.graveyard || []).map(c => c.instanceId) : [].concat(raw || []).filter(x => typeof x === 'string');
      bindings.movedThisWayCards = bindings.movedThisWayCards || [];
      let n = 0;
      for (const id of ids) {
        const hit = locateCardInGame(game, id);
        if (!hit || hit.zone !== 'graveyard') continue;
        bindings.movedThisWayCards.push({ id, controllerId: hit.player?.playerId || hit.card.ownerId, definitionId: hit.card.definitionId, typeLine: definitionFor(game, hit.card)?.typeLine || '', token: !!hit.card.token });
        notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'move-zone', targetId: id, to: 'exile' }], bindings)); n++;
      }
      bindings.movedThisWay = bindings.movedThisWayCards.length;
      notes.push(`${n} card${n === 1 ? '' : 's'} exiled from a graveyard.`);
      return true;
    }
    case 'b101-bite-back': {
      // The damage first, then the creature (its power as it was, even if it just died) deals that much to you.
      const hit = locateCardInGame(game, bindings[effect.bind]);
      if (!hit || hit.zone !== 'battlefield') { notes.push('The target is no longer on the battlefield.'); return true; }
      const d = definitionFor(game, hit.card), power = Math.max(0, Number(effectivePower(hit.card, d, game) || 0));
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage', amount: effect.amount, bind: effect.bind, sourceName: effect.sourceName }], bindings));
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage', amount: power, playerId: controllerId, sourceName: d?.name || 'The creature' }], bindings));
      return true;
    }
    case 'b101-unless-do': {
      // The player the choice was asked of did it (or not); what follows is skipped when they did.
      const ans = bindings[effect.bind];
      if (!ans || ans === 'no') return true;
      const decider = unlessDecider(game, effect, bindings);
      if (!decider) return true;
      let did = false;
      if (effect.mode === 'life-toughness') {
        const hit = locateCardInGame(game, bindings[effect.deciderTarget]), n = hit ? Math.max(0, Number(effectiveToughness(hit.card, definitionFor(game, hit.card), game) || 0)) : 0;
        if (Number(decider.life || 0) >= n) { notes.push(...H.applyEffectsUnsafe(game, decider.playerId, [{ kind: 'life', scope: 'you', amount: n, deltaSign: -1 }], bindings)); notes.push(`${decider.displayName} pays ${n} life.`); did = true; }
      } else if (effect.mode === 'damage-power') {
        notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'damage', amount: { kind: 'source-power' }, playerId: decider.playerId, sourceName: effect.sourceName }], bindings)); did = true;
      } else if (effect.mode === 'sacrifice' && locateCardInGame(game, ans)) {
        notes.push(...H.applyEffectsUnsafe(game, decider.playerId, [{ kind: 'sacrifice', targetId: ans, soft: true }], bindings)); did = true;
      }
      if (did) { bindings.skipEffects = effect.skip || 0; notes.push('It was paid for.'); }
      return true;
    }
    case 'b101-discard-chosen':
    case 'b101-sac-unless-discard': {
      if (!controller) return true;
      let ids = [].concat(bindings[effect.bind] || []).filter(x => typeof x === 'string');
      if (effect.kind === 'b101-sac-unless-discard' && effect.random) ids = bindings[effect.bind] && bindings[effect.bind] !== 'no' && controller.deck.hand.length ? [controller.deck.hand[Math.floor(Math.random() * controller.deck.hand.length)].instanceId] : [];
      const names = [];
      for (const id of ids) {
        const i = controller.deck.hand.findIndex(x => x.instanceId === id);
        if (i < 0) continue;
        const [card] = controller.deck.hand.splice(i, 1);
        card.zone = 'graveyard'; controller.deck.graveyard.push(card);
        names.push(definitionFor(game, card)?.name || 'a card');
        H.emit(bindings, { type: 'discard', playerId: controller.playerId, sourceId: card.instanceId, definitionId: card.definitionId, typeLine: definitionFor(game, card)?.typeLine || '' });
      }
      bindings.discardedThisWay = Number(bindings.discardedThisWay || 0) + names.length;
      if (effect.kind === 'b101-discard-chosen') { notes.push(names.length ? `${controller.displayName} discards ${names.join(', ')}.` : `${controller.displayName} discards nothing.`); return true; }
      if (names.length) { notes.push(`${controller.displayName} discards ${names[0]} to keep it.`); return true; }
      notes.push(...H.applyEffectsUnsafe(game, controllerId, [{ kind: 'sacrifice', bind: 'sourceId', soft: true }], bindings));
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

/** The player an "unless" choice belongs to: the controller of the targeted card, or the trigger's player. */
function unlessDecider(game, req, bindings) {
  if (req.deciderTarget) { const hit = locateCardInGame(game, bindings[req.deciderTarget]); const id = hit?.card?.controllerId || hit?.player?.playerId; return playerById(game, id) || null; }
  return playerById(game, bindings[req.deciderBind]) || null;
}

/** Requirement kinds made above, asked by requirements.js. Returns true when handled. */
export function gatherB101(game, ctx, req, bindings, ask, key, title, base, util) {
  const { player } = ctx;
  if (req.kind === 'b101-gy-cards') {
    // "Up to two target cards from a single graveyard": which graveyard (when more than one has cards), then the cards.
    const owners = (game.players || []).filter(p => !p.eliminated && (p.deck.graveyard || []).length);
    if (!owners.length) { bindings[req.bind] = []; return true; }
    const who = owners.length === 1 ? owners[0].playerId : ask(`${key}:who`, () => ({ ...base, kind: 'choose-one', title, prompt: 'Choose the graveyard to take cards from.', options: owners.map(p => ({ id: p.playerId, label: `${p.displayName}'s graveyard (${p.deck.graveyard.length})` })) }));
    const rows = (playerById(game, who)?.deck.graveyard || []);
    bindings[req.bind] = ask(key, () => ({ ...base, kind: 'choose-many', title, prompt: `Choose up to ${req.max} cards.`, min: 0, max: Math.min(req.max, rows.length), options: rows.map(card => util.cardOption(game, card, playerById(game, who), 'Graveyard')) }));
    return true;
  }
  if (req.kind === 'b101-unless') {
    // "… unless its controller pays life equal to its toughness": asked of that player, on their own device.
    const q = unlessDecider(game, req, bindings), src = locateCardInGame(game, bindings.sourceId);
    if (!q || q.eliminated) { bindings[req.bind] = 'no'; return true; }
    const who = { ...base, playerId: q.playerId, cancellable: false, kind: 'choose-one', title: `${ctx.sourceName} — ${q.displayName}` };
    if (req.mode === 'life-toughness') {
      const hit = locateCardInGame(game, bindings[req.deciderTarget]), n = hit ? Math.max(0, Number(effectiveToughness(hit.card, definitionFor(game, hit.card), game) || 0)) : 0;
      bindings[req.bind] = !hit ? 'no' : ask(key, () => ({ ...who, prompt: `Pay ${n} life to keep ${definitionFor(game, hit.card)?.name || 'your creature'}?`, options: [{ id: 'pay', label: `Pay ${n} life`, disabled: Number(q.life || 0) < n }, { id: 'no', label: 'Don\u2019t pay (it is destroyed)' }] }));
    } else if (req.mode === 'damage-power') {
      const n = src ? Math.max(0, Number(effectivePower(src.card, definitionFor(game, src.card), game) || 0)) : 0;
      bindings[req.bind] = ask(key, () => ({ ...who, prompt: `Have ${req.sourceName} deal ${n} damage to you to stop the effect?`, options: [{ id: 'do', label: `Take ${n} damage` }, { id: 'no', label: 'Don\u2019t (it is destroyed)' }] }));
    } else {
      const rows = (q.deck.battlefield || []).filter(c => /\bCreature\b/.test(definitionFor(game, c)?.typeLine || ''));
      bindings[req.bind] = !rows.length ? 'no' : ask(key, () => ({ ...who, prompt: 'Sacrifice a creature to stop the life loss?', options: [...rows.map(c => ({ id: c.instanceId, label: `Sacrifice ${definitionFor(game, c)?.name || 'a creature'}`, instanceId: c.instanceId, definitionId: c.definitionId })), { id: 'no', label: 'Don\u2019t sacrifice' }] }));
    }
    return true;
  }
  if (req.kind === 'b101-hand-cards') {
    // The player's own cards: private, chosen by them as the effect resolves.
    const rows = (player.deck.hand || []).filter(card => !req.filter || new RegExp(`\\b${req.filter}\\b`, 'i').test(util.defOf(game, card)?.typeLine || ''));
    bindings[req.bind] = rows.length ? ask(key, () => ({ ...base, cancellable: false, kind: 'choose-many', private: true, title, prompt: `Choose ${req.label}.`, options: rows.map(card => util.cardOption(game, card, player, 'Your hand')), min: Math.min(req.min || 0, rows.length), max: Math.min(req.max ?? 1, rows.length) })) : [];
    return true;
  }
  return false;
}

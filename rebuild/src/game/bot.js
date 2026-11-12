// A practice-game bot (roadmap 5.3): plays a seat the way a sensible casual player would, so full games with the rules
// engine say something about how a deck performs. It is not a strong player; it is a steady, repeatable one.
//   - Opening hand: keeps 2–5 lands (one free mulligan, then keeps anything); bottoms its most expensive cards.
//   - Its turn: plays a land, then casts the most expensive spell it can (commander included), again while it can; uses
//     an activated ability now and then (never one that sacrifices, discards or pays life).
//   - Combat: attacks the opponent closest to dying with every creature that can't be blocked and killed for free, or with
//     everything when that is lethal; blocks to survive, and blocks when its blocker lives or trades up.
//   - Choices: harmful effects (destroy, exile, damage, -N/-N, bounce, tap, counter) go at the opponents' best cards or the
//     weakest opponent; helpful ones at its own best creature or itself; costs (sacrifice, discard) take its worst cards.
//   - Responds only with counterspells against an opponent's spell of mana value 3 or more.
// Every function reads the engine's own player view (src/game/view.js) and returns one intent for the controller.

import { defOf, findCard } from './helpers.js';

const HARM = /\b(destroy|exile|damage|deals?|-\d+\/-\d+|gets? -|return[^.]*to (?:its|their) owner'?s? hand|tap target|counter target|sacrifices?|discards?|loses? \d+ life|loses? life|fights?|can'?t (?:block|attack)|goad)/i;
const COST = /\b(sacrifice|discard|to exile|exile (?:a|an|one|two|three|\d+) |forage|emerge|pay cost|bottom|devour|casualty|bargain)\b/i;

const mvOf = def => Number(def?.manaValue ?? def?.cmc ?? 0);
const isLandType = t => /\bLand\b/.test(t || '');
const isCreatureType = t => /\bCreature\b/.test(t || '');

/** A rough worth of a permanent for choosing what to hit or keep: power and toughness for creatures, mana value otherwise. */
function worth(game, card) {
  const def = defOf(game, card);
  if (!def) return 0;
  const t = def.typeLine || '';
  if (isLandType(t) && !isCreatureType(t)) return 0.5;
  const p = Number(card.power ?? def.power) || 0, tough = Number(card.toughness ?? def.toughness) || 0;
  return mvOf(def) + (isCreatureType(t) ? p * 1.2 + tough * 0.6 : 0) + (card.token ? -1 : 0) + (/Planeswalker/.test(t) ? 3 : 0);
}

/** The text that decides whether a choice is harmful: the source card's rules text plus the question asked. */
function decisionText(game, d) {
  const src = Object.values(game.cardDefinitions || {}).find(x => x && (x.name === d.source || x.combinedName === d.source));
  return `${d.title || ''}\n${d.prompt || ''}\n${src?.oracleText || ''}`;
}

/** Who an option points at: { mine, theirs, player, card, value }. */
function optionInfo(game, me, o) {
  if (o.playerId && !o.instanceId) {
    const q = game.players.find(p => p.playerId === o.playerId);
    return { player: q, mine: o.playerId === me, theirs: o.playerId !== me, value: q ? 40 - Number(q.life || 0) : 0 };
  }
  const id = o.instanceId || o.id;
  const loc = typeof id === 'string' ? findCard(game, id) : null;
  const card = loc?.card || loc || null;
  if (!card || !card.instanceId) return { mine: false, theirs: false, value: 0 };
  const ctl = card.controllerId || card.ownerId;
  return { card, mine: ctl === me, theirs: ctl !== me, value: worth(game, card) };
}

/** The bot's answer to one decision the engine asks of it. */
export function answerDecision(game, me, d, rng = Math.random, tries = 0) {
  const open = (d.options || []).filter(o => !o.disabled);
  const text = decisionText(game, d);
  const cost = COST.test(`${d.title || ''} ${d.prompt || ''}`) || /^cost:|sacrifice|discard/i.test(String(d.key || ''));
  const harm = !cost && HARM.test(text);
  const ranked = () => open.map(o => ({ o, i: optionInfo(game, me, o) })).map(x => {
    let s;
    if (cost) s = x.i.mine ? -x.i.value : x.i.value - 50;            // pay with my worst things
    else if (harm) s = x.i.theirs ? x.i.value + 10 : x.i.mine ? -x.i.value - 20 : 0;
    else s = x.i.mine ? x.i.value + 10 : x.i.theirs ? -x.i.value - 10 : 0;
    return { ...x, s };
  }).sort((a, b) => b.s - a.s);
  switch (d.kind) {
    case 'choose-one': {
      if (!open.length) return null;
      // An optional sacrifice or discard ("Don't sacrifice", "No target"): decline it.
      const none = open.find(o => /^(none|no|skip)$/i.test(String(o.id)) || /^(don.?t|no |none|skip)/i.test(String(o.label || '')));
      if (cost && tries === 0) { if (none) return none.id; if (d.allowNone) return null; }
      if (d.allowNone && tries === 0) { const best = ranked()[0]; if (!best || best.s <= 0) return null; }
      // Paying ward, kicker, buyback and similar: the first offered option is the full one; "none"/"don't" options last.
      const pointed = open.some(o => o.instanceId || o.playerId);
      if (!pointed) {
        const yes = open.filter(o => !/^(no|none|dont|don.?t|skip)$/i.test(String(o.id)) && !/^(no |don.?t|none|skip)/i.test(String(o.label || '')));
        return (tries ? open[Math.min(tries, open.length - 1)] : yes[0] || open[0]).id;
      }
      const list = ranked();
      return list[Math.min(tries, list.length - 1)].o.id;
    }
    case 'choose-many': {
      const max = Math.min(d.max ?? open.length, open.length), min = Math.min(d.min || 0, max);
      const list = ranked();
      // Optional picks: only the ones that help (my things for a bonus, theirs for harm); costs take only what is needed.
      const useful = cost ? min : Math.max(min, list.filter(x => x.s > 0).length);
      return list.slice(0, Math.min(max, Math.max(min, useful - tries))).map(x => x.o.id);
    }
    case 'number': {
      const min = Number(d.min || 0), max = Math.min(Number(d.max ?? 20), 20);
      // X: as much as the mana allows; the engine refuses an unaffordable X, and each refusal tries one lower.
      if (/\bX\b/.test(`${d.title} ${d.prompt}`)) {
        const p = game.players.find(q => q.playerId === me);
        const lands = (p?.deck.battlefield || []).filter(c => !c.tapped && isLandType(defOf(game, c)?.typeLine)).length;
        return Math.max(min, Math.min(max, lands - tries));
      }
      return min;
    }
    case 'text': return (d.suggestions || ['Human'])[0];
    case 'confirm': return !/pay \d+ life|lose \d+ life/i.test(`${d.prompt || ''}`) || tries > 0 ? tries === 0 : false;
    case 'arrange': {
      // Scry / look at the top: keep lands on top while short of them, spells otherwise.
      const p = game.players.find(q => q.playerId === me);
      const lands = (p?.deck.battlefield || []).filter(c => isLandType(defOf(game, c)?.typeLine)).length;
      const top = [], other = [];
      if (d.otherLabel === null) return { top: (d.cards || []).map(c => c.id), other: [] };   // reorder only
      for (const c of d.cards || []) {
        const def = game.cardDefinitions[c.definitionId] || defOf(game, findCard(game, c.id)?.card);
        const land = isLandType(def?.typeLine);
        ((lands < 5) === land || (!land && mvOf(def) <= lands + 1) ? top : other).push(c.id);
      }
      return { top, other };
    }
    default: return null;
  }
}

/** Keep or mulligan: 2–5 lands in the hand keeps; after one mulligan anything keeps. Bottoms the most expensive spells. */
function openingIntent(game, me, view, p) {
  const hand = me.hand || [];
  const lands = hand.filter(c => c.land).length;
  if (p.bottom) {
    const keepLands = Math.max(2, Math.min(lands, 4));
    const order = [...hand].sort((a, b) => {
      const da = game.cardDefinitions[a.def], db = game.cardDefinitions[b.def];
      return (b.land ? -1 : mvOf(db)) - (a.land ? -1 : mvOf(da));
    });
    // Too many lands: bottom extra lands first; otherwise the most expensive spells.
    const extraLands = hand.filter(c => c.land).slice(keepLands).map(c => c.id);
    const spells = order.filter(c => !c.land).map(c => c.id);
    return { type: 'keep', bottom: [...extraLands, ...spells].slice(0, p.bottom) };
  }
  const taken = Number(game.flow.opening?.[me.playerId]?.mulligans || 0);
  if (p.canMulligan && taken < 1 && (lands < 2 || lands > 5)) return { type: 'mulligan' };
  return { type: 'keep', bottom: [] };
}

function creaturesOf(row) { return (row?.battlefield || []).filter(c => c.creature); }

/** Attacks: at the opponent closest to dying, with the creatures that survive any single block or win the race. */
function attackIntent(game, view, me, rng) {
  const rows = view.actions.attack || [];
  const foes = view.players.filter(q => q.playerId !== me.playerId && !q.eliminated);
  if (!rows.length || !foes.length) return null;
  const mine = new Map(me.battlefield.map(c => [c.id, c]));
  const target = [...foes].sort((a, b) => a.life - b.life)[0];
  const blockersOf = q => creaturesOf(q).filter(c => !c.tapped);
  const plan = [];
  let total = 0;
  for (const r of rows) {
    const c = mine.get(r.instanceId);
    if (!c || (!(c.power > 0) && !r.mustAttack)) continue;
    const def = r.defenders.includes(target.playerId) ? target.playerId : r.defenders[0];
    const foe = view.players.find(q => q.playerId === def);
    // A bad attack: some untapped blocker kills it and survives.
    const bad = blockersOf(foe).some(b => (b.power || 0) >= (c.toughness || 0) && (b.toughness || 0) > (c.power || 0));
    plan.push({ instanceId: r.instanceId, defenderId: def, bad, must: r.mustAttack, power: c.power || 0 });
    if (def === target.playerId) total += c.power || 0;
  }
  const blockers = blockersOf(target).length;
  const lethal = total >= target.life + blockers * 2;   // rough: each blocker stops about one attacker
  const attacks = plan.filter(x => x.must || lethal || !x.bad).map(({ instanceId, defenderId }) => ({ instanceId, defenderId }));
  return attacks.length ? { type: 'attack', attacks } : null;
}

/** Blocks: survive first (chump the biggest attackers when the damage is lethal), then good blocks. */
function blockIntent(game, view, me, p) {
  const byId = new Map(view.players.flatMap(q => q.battlefield).map(c => [c.id, c]));
  const used = new Set(), assignments = [];
  const rows = [...p.rows].map(r => ({ r, a: byId.get(r.attackerId) })).sort((x, y) => (y.a?.power || 0) - (x.a?.power || 0));
  let incoming = rows.reduce((s, x) => s + (x.a?.power || 0), 0);
  for (const { r, a } of rows) {
    if (!a) continue;
    const free = r.blockers.map(b => byId.get(b.instanceId)).filter(b => b && !used.has(b.id));
    if (free.length < (r.minBlockers || 1)) continue;
    const kills = b => (b.power || 0) >= (a.toughness || 0);
    const lives = b => (b.toughness || 0) > (a.power || 0);
    const worthA = (a.power || 0) + (a.toughness || 0), worthB = b => (b.power || 0) + (b.toughness || 0);
    let pick = null;
    if (r.minBlockers > 1) pick = incoming >= me.life ? free.slice(0, r.minBlockers) : null;
    else {
      pick = free.filter(b => lives(b)).sort((x, y) => worthB(x) - worthB(y))[0]           // a safe block
        || free.filter(b => kills(b) && worthB(b) <= worthA).sort((x, y) => worthB(x) - worthB(y))[0];   // a fair trade
      if (!pick && incoming >= me.life) pick = [...free].sort((x, y) => worthB(x) - worthB(y))[0];    // chump to live
      pick = pick ? [pick] : null;
    }
    if (pick) { for (const b of pick) { used.add(b.id); assignments.push({ attackerId: r.attackerId, blockerId: b.id }); } incoming -= a.power || 0; }
  }
  return { type: 'block', assignments };
}

/** What the active player does this step of its turn. `memo` remembers per-turn tries so the bot never loops. */
function turnIntent(game, view, me, memo, rng) {
  const phase = view.phase;
  if (['combat', 'begin-combat'].includes(phase) && !memo.attacked) {
    memo.attacked = true;
    const a = attackIntent(game, view, me, rng);
    if (a) return a;
  }
  if (['precombat-main', 'postcombat-main'].includes(phase)) {
    const failed = memo.failed;
    const playable = [...me.hand.filter(c => c.playable), ...me.command.filter(c => c.playable)].filter(c => !failed.has(c.id));
    const land = playable.find(c => c.land);
    if (land) return { type: 'play', instanceId: land.id };
    // Main phase 1: creatures and sorceries before combat (haste and bigger boards); hold instants for main phase 2.
    const spells = playable.filter(c => !c.land && (phase === 'postcombat-main' || !c.instant || /draw/i.test(game.cardDefinitions[c.def]?.oracleText || '')));
    if (spells.length) {
      const mv = c => mvOf(game.cardDefinitions[c.def]);
      spells.sort((a, b) => mv(b) - mv(a));
      return { type: 'play', instanceId: spells[0].id };
    }
    const abilities = me.battlefield.flatMap(c => (c.abilities || []).filter(a => a.legal && !a.mana && !memo.used.has(`${c.id}:${a.id}`)
      && !/sacrifice|discard|pay \d+ life|exile/i.test(`${a.cost || ''} ${String(a.text || '').split(':')[0]}`)).map(a => ({ c, a })));
    if (abilities.length && memo.activations < 3) {
      const x = abilities[0];
      memo.used.add(`${x.c.id}:${x.a.id}`);
      memo.activations++;
      return { type: 'activate', instanceId: x.c.id, abilityId: x.a.id };
    }
  }
  return { type: 'next-phase' };
}

/** Respond while holding priority: a counterspell against an opponent's real spell, otherwise pass. */
function priorityIntent(game, view, me, memo) {
  const top = view.stack[0];
  if (top && top.controllerId !== me.playerId && top.kind === 'spell') {
    const def = top.def ? game.cardDefinitions[top.def] : null;
    if (mvOf(def) >= 3) {
      const ids = new Set(view.actions.respond?.cards || []);
      const counter = me.hand.find(c => ids.has(c.id) && !memo.failed.has(c.id) && /counter target (?:spell|noncreature spell|creature spell)/i.test(game.cardDefinitions[c.def]?.oracleText || ''));
      if (counter) return { type: 'play', instanceId: counter.id };
    }
  }
  return { type: 'pass' };
}

/**
 * The bot's next intent for seat `i`, from its view. `memo` is per seat: { turn, failed:Set, used:Set, activations, attacked, tries }.
 * Returns { intent, guided } where guided names a card the engine left to be resolved by hand (the bot skips it).
 */
export function botIntent(game, view, i, memo, rng = Math.random) {
  const me = view.players[i];
  const p = view.prompt;
  if (memo.turn !== view.turn || memo.phase !== view.phase) {
    if (memo.turn !== view.turn) { memo.failed = new Set(); memo.used = new Set(); memo.activations = 0; memo.attacked = false; }
    memo.turn = view.turn; memo.phase = view.phase;
  }
  if (p.kind === 'opening') return { intent: openingIntent(game, me, view, p) };
  if (p.kind === 'decision') {
    const key = p.decision.key;
    const tries = memo.lastKey === key ? (memo.tries || 0) : 0;
    return { intent: { type: 'answer', key, value: answerDecision(game, me.playerId, { ...p.decision, key }, rng, tries) } };
  }
  if (p.kind === 'guided') return { intent: { type: 'guided-done' }, guided: view.stack[0]?.name || 'a card' };
  if (p.kind === 'priority') return { intent: priorityIntent(game, view, me, memo) };
  if (p.kind === 'blocks') return { intent: blockIntent(game, view, me, p) };
  if (p.kind === 'discard') {
    const order = [...me.hand].sort((a, b) => {
      const lands = me.battlefield.filter(c => c.land).length;
      const keep = c => (c.land ? (lands < 5 ? 10 : -1) : 5 - Math.abs(mvOf(game.cardDefinitions[c.def]) - lands));
      return keep(a) - keep(b);
    });
    return { intent: { type: 'discard', ids: order.slice(0, p.need).map(c => c.id) } };
  }
  if (p.kind === 'turn') return { intent: turnIntent(game, view, me, memo, rng) };
  if (p.kind === 'vote') return { intent: { type: 'vote', approve: true } };
  return { intent: null };
}

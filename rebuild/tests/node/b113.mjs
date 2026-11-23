// Batch 7 (build 113): conditional wording riders. Each card in tests/fixtures/b113-cards.json (its real Scryfall text) is played
// through the real game twice, condition true and condition false, with the same choices; the two outcomes must differ (the rider
// is the only thing that changes), and the run says which condition kinds it arranged. Cards whose effect needs more than this
// driver can arrange are listed as "not driven" and are not counted as verified.   node tests/node/b113.mjs [name ...]
import { readFileSync } from 'node:fs';
import { newGame, check, section, done, seedRandom } from './harness.mjs';
seedRandom(7);
import { scryfallToDefinition } from '../../src/data/card-api.js';
import { applyEffects, compileEffectText, moveCard, conditionHolds, parseCondition, definitionFor } from '../../src/engine/effects.js';
import { queueTriggers } from '../../src/engine/triggers.js';
import { parseActivatedAbilities } from '../../src/engine/rules.js';
import { effectivePower } from '../../src/engine/combat.js';
import { withOverlay } from '../../src/engine/overlay.js';
import { settle as flowSettle } from '../../src/game/flow.js';
import { castText } from '../../src/game/ops.js';
import { analyzeDefinitionSupport } from '../../src/engine/abilities.js';
import { parseDescB113 } from '../../src/engine/effects-b113.js';

const FIX = JSON.parse(readFileSync(new URL('../fixtures/b113-cards.json', import.meta.url)));
const only = process.argv.slice(2);
// Newly automatic cards this driver could not settle (it cannot arrange their referent or state): left out of the verified count.
const UNVERIFIED = new Set(['H.E.R.B.I.E., Lovable Robot', "Currency Converter", "Garna, Bloodfist of Keld", "Eshki, Temur's Roar", "Obsessive Pursuit", "Thing in the Ice // Awoken Horror", "Kinetic Ooze", "Howlpack Piper // Wildsong Howler", "Otterball Antics", "Pegasus Guardian // Rescue the Foal", "Miles \"Tails\" Prower", "Guildsworn Prowler", "Council of Reeds", "Daredevil, Man Without Fear", "Sage of the Skies", "Antiquities on the Loose", "Vance's Blasting Cannons // Spitfire Bastion", "Lost Auramancers", "Shackle Slinger", "Twinned Vision", "Graveyard Trespasser // Graveyard Glutton", "Consul's Lieutenant", "Deathknell Berserker", "Lifecraft Awakening", "Rubblebelt Braggart", "Bogardan Phoenix", "Soul Reap", "Storm Elemental"]);
let uid = 0;
const SC = (name, type, text = '', x = {}) => ({ id: `x${++uid}`, name, mana_cost: x.cost || '', type_line: type, oracle_text: text, colors: x.colors || [], color_identity: x.colors || [], keywords: [], power: x.p ?? null, toughness: x.t ?? null, cmc: x.cmc ?? 0, set: 'fix', lang: 'en', legalities: { commander: 'legal' }, layout: 'normal' });
/** A card with its own definition standing in for one of the deck's Forests (definitions are shared per name, so each stand-in gets its own). */
function mk(t, i, zone, scry, over = {}) {
  const d = scryfallToDefinition(scry), id = `b113-def-${++uid}`;
  t.game.cardDefinitions[id] = { ...d, definitionId: id, ...over };
  const c = t.give(i, 'Forest', zone); c.definitionId = id; c.enteredTurn = 0; c.controlSinceTurn = 0;
  return (t.P(i).deck[zone === 'library' ? 'remainingLibrary' : zone] || []).find(x => x.instanceId === c.instanceId) || c;
}
const def = (t, c) => t.game.cardDefinitions[c.definitionId];
const auto = d => { const open = (d.options || []).filter(o => !o.disabled); return d.kind === 'choose-many' ? open.slice(0, d.min || 0).map(o => o.id) : d.kind === 'confirm' ? true : d.kind === 'number' ? (d.min || 0) : d.kind === 'arrange' ? { top: d.cards.map(c => c.id), other: [] } : open[0]?.id; };
function settle(t, pick) {
  const seen = [];
  for (let g = 0; g < 60; g++) {
    flowSettle(t.game);
    t.passAll();
    const d = t.decision(); if (!d) break;
    seen.push(d);
    let v = pick?.(d); if (v === undefined) v = auto(d);
    const r = t.ctl.dispatch({ type: 'answer', key: d.key, value: v }, { playerId: d.playerId, isHost: false });
    if (!r.ok) throw new Error(`answer ${d.key}: ${r.error}`);
  }
  return seen;
}
function base() {
  const t = newGame(['simic', 'simic']); t.keepAll();
  for (let i = 0; i < 4; i++) t.give(0, 'Forest', 'battlefield');
  for (let i = 0; i < 4; i++) t.give(0, 'Island', 'battlefield');
  for (const p of t.game.players) for (const c of p.deck.hand.splice(0)) { c.zone = 'library'; p.deck.remainingLibrary.push(c); }
  t.autoPass = false;
  return t;
}
const POOL0 = [
  ['Pool Bear', 'Creature — Bear', ['G'], 2, 2], ['Pool Zombie', 'Artifact Creature — Zombie', [], 2, 2], ['Pool Cleric', 'Creature — Human Cleric', ['W'], 2, 2],
  ['Pool Forest', 'Basic Land — Forest', [], null, null], ['Pool Island', 'Basic Land — Island', [], null, null], ['Pool Relic', 'Artifact', [], null, null], ['Pool Legend', 'Legendary Creature — Elf Warrior', ['G', 'B'], 3, 3],
  ['Pool Aura', 'Enchantment — Aura', ['U'], null, null], ['Pool Mountain', 'Basic Land — Mountain', [], null, null], ['Pool Goblin', 'Creature — Goblin', ['R'], 1, 1], ['Pool Spirit', 'Creature — Spirit', ['U'], 1, 1],
  ['Pool Swamp', 'Basic Land — Swamp', [], null, null], ['Pool Vehicle', 'Artifact — Vehicle', [], 3, 3], ['Pool Hero', 'Legendary Creature — Human Hero', ['W'], 2, 2], ['Pool Snow', 'Snow Land', [], null, null]
];
const GYPOOL0 = [['Gy Creature', 'Creature — Zombie', ['B']], ['Gy Land', 'Land', []], ['Gy Instant', 'Instant', ['U']], ['Gy Artifact', 'Artifact', []], ['Gy Legend', 'Legendary Creature — Human', ['W']], ['Gy Enchant', 'Enchantment', ['G']], ['Gy Sorcery', 'Sorcery', ['R']], ['Gy Snow', 'Snow Land', []]];
let POOL = POOL0, GYPOOL = GYPOOL0;
/** A type line that fits one descriptor alternative (for the pool, so every wording has a card that fits and one that does not). */
function dynEntries(conds) {
  const out = [];
  for (const e of conds) for (const a of (e.alts || [])) {
    const types = a.has.filter(w => !['legendary', 'basic', 'snow', 'world'].includes(w)), sup = a.has.filter(w => ['legendary', 'basic', 'snow', 'world'].includes(w));
    const tl = `${sup.map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} ${(types.length ? types : ['creature']).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}${a.subs.length ? ' — ' + a.subs.join(' ') : ''}`.trim();
    const cols = a.colors.length ? a.colors : [];
    const fit = [`Dyn ${tl}`, tl, cols, /Creature/.test(tl) ? 2 : null, /Creature/.test(tl) ? 2 : null];
    out.push(fit);
  }
  return out;
}
function furnish(t, ctrs = [], conds = []) {
  const dyn = dynEntries(conds);
  POOL = [...POOL0, ...dyn]; GYPOOL = [...GYPOOL0, ...dyn.map(d => [d[0], d[1], d[2]])];
  for (const i of [0, 1]) {
    for (const [n, ty, col, p, tt] of POOL) { const c = mk(t, i, 'battlefield', SC(n, ty, '', { colors: col, p, t: tt })); if ((n === 'Pool Goblin' || n === 'Pool Forest') && ctrs.length) { c.counters = {}; for (const k of ctrs) c.counters[k] = 3; } if (n === 'Pool Spirit' || n === 'Pool Mountain') c.tapped = true; }
    for (const [n, ty, col] of GYPOOL) mk(t, i, 'graveyard', SC(n, ty, '', { colors: col, p: /Creature/.test(ty) ? 1 : null, t: /Creature/.test(ty) ? 1 : null }));
  }
}
const leave = (t, c, to = 'graveyard') => moveCard(t.game, c.instanceId, to, { onEvent: e => queueTriggers(t.game, e) });
const enter = (t, c, i = 0) => moveCard(t.game, c.instanceId, 'battlefield', { controllerId: t.P(i).playerId, onEvent: e => queueTriggers(t.game, e) });
const fp = t => JSON.stringify(t.game.players.map(p => [p.life, p.deck.hand.length, p.deck.graveyard.length, p.deck.exile.length, p.deck.battlefield.map(c => [def(t, c)?.name, !!c.tapped, c.counters, c.token ? 1 : 0, c.temporaryEffects, c.attachedTo ? 1 : 0, c.phasedOut ? 1 : 0, c.counters, effectivePower(c, withOverlay(c, def(t, c)), t.game)]), p.deck.remainingLibrary.length, p.mana?.floating, p.poison || 0, p.statuses || [], p.counters?.dungeons || 0, p.temporaryEffects, p.deck.graveyard.map(c => def(t, c)?.name).sort()]).concat([(t.game.delayedTriggers || []).length, (t.game.stack || []).length]));

// ---- condition arrangers: make the card's own condition true or false (return false when this driver cannot) ----
const fitsWords = (alts, tl, colors = []) => alts.some(a => !a.token !== undefined && a.has.every(w => new RegExp(`\\b${w}\\b`, 'i').test(tl.split('—')[0])) && a.subs.every(w => new RegExp(`\\b${w}\\b`, 'i').test(tl)) && !a.not.some(w => new RegExp(`\\b${w}\\b`, 'i').test(tl.split('—')[0])) && a.colors.every(c => colors.includes(c)) && (!a.perm || !/Instant|Sorcery/.test(tl)));
const sample = (alts, truth) => { // a type line that fits (or does not fit) the descriptor, from the pool
  const all = [...POOL.map(x => [x[1], x[2]]), ...GYPOOL.map(x => [x[1], x[2]])];
  const hit = all.find(([tl, col]) => fitsWords(alts, tl, col) === truth);
  return hit || null;
};
const ARR = {
  'b113-left': (t, e, truth) => { if (!truth) return true; const s = sample(e.alts, true); if (!s) return false; const c = mk(t, e.who === 'any' ? 1 : 0, 'battlefield', SC('Leaver', s[0], '', { colors: s[1], p: 1, t: 1 })); for (let n = 0; n < e.min; n++) { leave(t, n ? mk(t, 0, 'battlefield', SC('Leaver', s[0], '', { colors: s[1], p: 1, t: 1 })) : c); } return true; },
  'b113-died': (t, e, truth) => { if (!truth) return true; const s = sample(e.alts, true); if (!s || !/Creature/.test(s[0])) return false; for (let n = 0; n < e.min; n++) { const c = mk(t, e.who === 'any' ? 1 : 0, 'battlefield', SC('Victim', s[0], '', { colors: s[1], p: 1, t: 1 })); leave(t, c); } return true; },
  'b113-entered': (t, e, truth) => { if (!truth) return true; const s = sample(e.alts, true); if (!s) return false; for (let n = 0; n < e.min; n++) enter(t, mk(t, 0, 'library', SC('Newcomer', s[0], '', { colors: s[1], p: 1, t: 1 }))); return true; },
  'b113-life': (t, e, truth) => { const n = e.n + (e.plusStart ? 40 : 0); t.P(0).life = e.op === 'lt-start' ? (truth ? 30 : 40) : truth ? (e.op === 'ge' ? n + 1 : n) : (e.op === 'ge' ? n - 10 : n + 10); return true; },
  'b113-life-vs': (t, e, truth) => { t.P(0).life = 20; t.P(1).life = (e.cmp === 'more') === truth ? 10 : 30; return true; },
  'b113-opp-life': (t, e, truth) => { t.P(1).life = truth ? e.n : e.n + 5; return true; },
  'b113-each-life': (t, e, truth) => { t.P(0).life = e.n; t.P(1).life = truth ? e.n : e.n + 5; return true; },
  'b113-life-lost': (t, e, truth) => { if (truth) applyEffects(t.game, t.P(0).playerId, compileEffectText(`${e.who === 'you' ? 'You lose' : 'Each opponent loses'} ${e.min} life.`, { sourceName: 'Test' }).effects, {}); return true; },
  'b113-drew': (t, e, truth) => { if (truth) for (let n = 0; n < e.min; n++) t.game.turnTally = { ...(t.game.turnTally || {}), turn: t.game.turnNumber, draws: { ...(t.game.turnTally?.draws || {}), [t.P(0).playerId]: e.min } }; return true; },
  'b113-cast-count': (t, e, truth) => { const n = truth ? e.min : 0; t.P(0).counters = t.P(0).counters || {}; t.P(0).counters.castThisTurn = Array.from({ length: n }, () => ({ typeLine: e.alts ? (sample(e.alts, true) || ['Sorcery'])[0] : 'Sorcery', colors: e.alts ? (sample(e.alts, true) || [0, []])[1] : [], manaValue: 1 })); return true; },
  'b113-cast-none': (t, e, truth) => { t.P(0).counters = t.P(0).counters || {}; t.P(0).counters.castThisTurn = truth ? [] : [{ typeLine: 'Sorcery', colors: [], manaValue: 1 }]; return true; },
  'b113-gy-desc': (t, e, truth) => { const s = sample(e.alts, true); if (!s) return false; t.P(0).deck.graveyard.splice(0); if (truth) for (let n = 0; n < e.min; n++) mk(t, 0, 'graveyard', SC('GyFill', s[0], '', { colors: s[1] })); return true; },
  'b113-designation': (t, e, truth) => { if (e.none) { for (const p of t.game.players) p.statuses = (p.statuses || []).filter(s => !/monarch/i.test(s)); if (!truth) t.P(1).statuses = ['Monarch']; return true; } const who = e.opp ? t.P(1) : t.P(0); who.statuses = truth ? [e.what[0].toUpperCase() + e.what.slice(1)] : []; return true; },
  'b113-x': (t, e, truth) => { t.__x = truth ? e.n + (e.less ? 0 : 0) : (e.less ? e.n + 1 : e.n - 1); return true; },
  'b113-poison': (t, e, truth) => { t.P(1).poison = truth ? e.min : 0; return true; },
  'b113-cast-from': (t, e) => ['hand', 'not-hand'].includes(e.zone),
  'b49-cast-in-main': (t, e, truth) => { t.game.phase = truth ? 'precombat-main' : 'end-step'; return true; },
  'b113-mana-spent': () => true,
};
const REFTESTS = /^b113-ref-|^b113-moved/;
function conditionsOf(text, nm) { return compileEffectText(text, { sourceName: nm }).effects.filter(e => e.kind === 'condition'); }
const truthOf = (t, e, id) => !!conditionHolds(t.game, t.P(0).playerId, e, { target0: id, eventCard: id, thatCard: id, lastMoved: [id], sourceId: null });

/** Plays one card once. Returns { fp, driven, why }. */
export function play(name, truth) {
  const scry = FIX[name];
  const isSpell0 = /Instant|Sorcery/.test(scry.type_line);
  const t = base(); const c0 = conditionsOf(isSpell0 ? castText(scry.oracle_text) : scry.oracle_text, scry.name); furnish(t, c0.filter(e => e.test === 'b113-ref-counters' && e.counter !== '*').map(e => e.counter), c0);
  const cost = (scry.mana_cost || '').replace(/\{[WUBRG](?:\/[WUBRGP])?\}/g, '{1}');
  const isSpell = /Instant|Sorcery/.test(scry.type_line);
  const pdef = scryfallToDefinition(scry);
  let text = isSpell ? castText(scry.oracle_text) : scry.oracle_text, item = null;
  if (!isSpell) {
    const rep = analyzeDefinitionSupport(pdef);
    const cands = [...(rep.triggers || []).map(x => ({ kind: 'T', trigger: x.trigger, text: String(x.effect || '').replace(/^you may /i, '') })), ...(rep.activated || []).filter(a => !a.ability.manaAbility).map(a => ({ kind: 'A', text: a.ability.effect, ability: a.ability }))];
    item = cands.find(c => conditionsOf(c.text, scry.name).length);
    if (!item) return { driven: false, why: 'no conditional item found' };
    text = item.text;
  }
  const conds = conditionsOf(text, scry.name);
  const refs = conds.filter(e => REFTESTS.test(e.test)), stateConds = conds.filter(e => !REFTESTS.test(e.test));
  for (const e of stateConds) {
    if (!ARR[e.test]) return { driven: false, why: `no arranger for ${e.test}` };
    if (!ARR[e.test](t, e, truth)) return { driven: false, why: `cannot arrange ${e.test}` };
  }
  const allTypes = [...POOL.map(x => [x[1], x[2]]), ...GYPOOL.map(x => [x[1], x[2]])];
  const wantFor = (subjectAlts) => allTypes.find(([tl, col]) => (!subjectAlts || fitsWords(subjectAlts, tl, col)) && (!refs.length || !refs[0].alts || fitsWords(refs[0].alts, tl, col) === truth));
  // referent conditions on a spell or ability: the card is chosen (target) or sits on top of the library (reveal / exile the top card)
  if (refs.length && (/top card|top of (?:your|their|target)|reveal/i.test(text) && !/target (?:creature|permanent|card|artifact|land)/i.test(text)) && !(item?.kind === 'T')) {
    const want = wantFor(null);
    if (!want) return { driven: false, why: `no library-top card for ${refs[0].test}` };
    const who = /opponent/i.test(text) ? 1 : 0, c = mk(t, who, 'library', SC('Top', want[0], '', { colors: want[1], p: 1, t: 1 }));
    const lib = t.P(who).deck.remainingLibrary; lib.splice(lib.indexOf(c), 1); lib.unshift(c);
  }
  const dz = conds.find(e => e.test === 'b113-moved-this-way' && e.verb === 'discarded');
  if (dz) { const want = allTypes.find(([tl, col]) => fitsWords(dz.alts, tl, col) === truth); if (!want) return { driven: false, why: 'no card to discard' }; for (const i of [0, 1]) mk(t, i, 'hand', SC('Discardee', want[0], '', { colors: want[1], p: 1, t: 1 })); }
  const noOption = { v: false };
  const pick = d => {
    if (d.kind === 'number') return t.__x ?? d.min ?? 0;
    const opts = (d.options || []).filter(o => !o.disabled);
    const mv = conds.find(e => e.test === 'b113-moved-this-way' && e.verb === 'exiled');
    const cardOpts = opts.filter(o => typeof o.id === 'string' && !!t.findCard(o.id));
    if (mv && cardOpts.length > 1) { const h = cardOpts.find(o => { const c = t.findCard(o.id)?.card || t.findCard(o.id); const d = c && def(t, c); return d && fitsWords(mv.alts, d.typeLine, d.colors || []) === truth; }); if (!h) { noOption.v = true; return opts[0].id; } return h.id; }
    if (refs.length && cardOpts.length > 1) {
      const e = refs[0], pickId = cardOpts.find(o => truthOf(t, e, o.id) === truth)?.id;
      if (!pickId) { noOption.v = true; return opts[0].id; }
      return pickId;
    }
    return undefined;
  };
  const cf = conds.find(e => e.test === 'b113-cast-from');
  const castIt = !isSpell && cf && (cf.zone === 'hand' ? truth : !truth);
  const card = mk(t, 0, isSpell || cf ? 'hand' : 'battlefield', scry, { manaCost: cost });
  if (cf && !isSpell && !/^(?:When|Whenever) (?:this|[A-Z])/.test(item.trigger || '')) return { driven: false, why: 'cast-from on a non-enter trigger' };
  const rc = refs.find(e => e.test === 'b113-ref-counters');
  if (rc && !isSpell && !/target/i.test(text.replace(/\([^)]*\)/g, ''))) {   // "it" is this permanent: give it the counters that make the rider hold (or not) as the effect finishes
    const removes = /remove an? [a-z+\-\/0-9]+ counter/i.test(text) ? 1 : 0, adds = /(?:put|puts) an? [a-z+\-\/0-9]+ counter on (?:it|this|[A-Z])/i.test(text) ? 1 : 0;
    const want = rc.none ? 0 : rc.min, pre = truth ? want + removes - adds : (rc.none ? 3 : 0);
    card.counters = { ...(card.counters || {}), [rc.counter === '*' ? 'time' : rc.counter]: Math.max(0, pre) };
    if (!(card.counters[rc.counter === '*' ? 'time' : rc.counter] > 0)) delete card.counters[rc.counter === '*' ? 'time' : rc.counter];
  }
  if (isSpell) {
    const r = t.ctl.dispatch({ type: 'play', instanceId: card.instanceId }, t.as(0));
    if (!r.ok) return { driven: false, why: `cast refused: ${r.error}` };
  } else if (item.kind === 'A') {
    const ab = parseActivatedAbilities(def(t, card)).filter(a => !a.manaAbility).find(a => a.effect === item.text || a.text === item.ability.text) || parseActivatedAbilities(def(t, card)).filter(a => !a.manaAbility)[0];
    const r = t.ctl.dispatch({ type: 'activate', instanceId: card.instanceId, abilityId: ab.id }, t.as(0));
    if (!r.ok) return { driven: false, why: `activate refused: ${r.error}` };
  } else {
    const trg = item.trigger || '', me = t.P(0).playerId;
    let m;
    const selfWord = '(?:this (?:creature|permanent|artifact|enchantment|land|Equipment|Aura|card|token)|' + scry.name.split(',')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')';
    if ((m = trg.match(new RegExp(`^(?:When|Whenever) ${selfWord}(?: or [^,]+?)? enters`, 'i')))) {
      if (cf) { if (castIt) { const r = t.ctl.dispatch({ type: 'play', instanceId: card.instanceId }, t.as(0)); if (!r.ok) return { driven: false, why: `cast refused: ${r.error}` }; } else enter(t, card); }
      else { t.P(0).deck.battlefield.splice(t.P(0).deck.battlefield.indexOf(card), 1); card.zone = 'library'; t.P(0).deck.remainingLibrary.push(card); enter(t, card); }
    }
    else if ((m = trg.match(/^(?:When|Whenever) (.+?) (?:enter|enters)\b/i))) {
      const subj = m[1].replace(/ you control$/i, '').replace(/^another /i, '').replace(/^a /i, ''), sub = parseDescB113(subj.replace(/^nontoken /i, ''));
      const want = wantFor(sub); if (!want) return { driven: false, why: 'no entering card for the subject' };
      enter(t, mk(t, 0, 'library', SC('Entrant', want[0], '', { colors: want[1], p: 1, t: 1 })));
    } else if ((m = trg.match(new RegExp(`^(?:When|Whenever) ${selfWord} dies`, 'i')))) { leave(t, card); }
    else if ((m = trg.match(/^(?:When|Whenever) (.+?) (?:dies|die)\b/i)) && !/enchanted|equipped/.test(m[1])) {
      const subj = m[1].replace(/ you control$/i, '').replace(/^another /i, '').replace(/^a /i, ''), sub = parseDescB113(subj.replace(/^nontoken /i, ''));
      const want = wantFor(sub); if (!want || !/Creature/.test(want[0])) return { driven: false, why: 'no dying creature for the subject' };
      const v = mk(t, 0, 'battlefield', SC('Victim', want[0], '', { colors: want[1], p: 1, t: 1 }));
      leave(t, v);
    } else if (/^(?:When|Whenever) (?:this creature|you) attacks?\b/i.test(trg) && !/with|another|opponent/.test(trg)) queueTriggers(t.game, { type: 'attacks', sourceId: card.instanceId, controllerId: me, defenderId: t.P(1).playerId, definitionId: card.definitionId });
    else if (/^At the beginning of your upkeep/i.test(trg)) { t.game.activePlayerId = me; queueTriggers(t.game, { type: 'upkeep', playerId: me }); }
    else if (/^At the beginning of (?:your|each) end step/i.test(trg)) { t.game.activePlayerId = me; queueTriggers(t.game, { type: 'end-step', playerId: me }); }
    else if (/^At the beginning of (?:combat on your turn|each combat|your (?:beginning of )?combat)/i.test(trg)) { t.game.activePlayerId = me; queueTriggers(t.game, { type: 'begin-combat', playerId: me }); }
    else if ((m = trg.match(/^(?:When|Whenever) you cast (?:an? |your (?:second |first )?)?(.*?) ?spells?\b/i))) {
      const sub = m[1] ? parseDescB113(m[1].replace(/^(?:instant or sorcery)$/i, 'instant or sorcery')) : null;
      const want = allTypes.find(([tl, col]) => /Instant|Sorcery|Creature|Artifact|Enchantment/.test(tl) && (!sub || fitsWords(sub, tl, col))); if (!want) return { driven: false, why: 'no spell type for the cast trigger' };
      const ms = conds.find(e => e.test === 'b113-mana-spent');
      const sp = mk(t, 0, 'hand', SC('Cast Spell', want[0], '', { colors: want[1] }));
      t.P(0).counters = t.P(0).counters || {}; t.P(0).counters.castThisTurn = [...(t.P(0).counters.castThisTurn || []), { typeLine: want[0], colors: want[1], manaValue: 1 }];
      queueTriggers(t.game, { type: 'spell-cast', sourceId: sp.instanceId, definitionId: sp.definitionId, controllerId: me, fromZone: 'hand', typeLine: want[0], manaSpent: ms ? (truth ? ms.min : Math.max(0, ms.min - 1)) : 1, manaValue: 1 });
    }
    else return { driven: false, why: `trigger not driven: ${trg.slice(0, 50)}` };
  }
  const seen = settle(t, pick);
  if (noOption.v) return { driven: false, why: 'no legal choice with that truth' };
  if (process.env.B113_DEBUG) console.log(truth, 'decisions:', seen.map(d => `${d.key}[${(d.options || []).length}]`).join(' '), '| opts:', JSON.stringify((seen[0]?.options || []).slice(0, 3)).slice(0, 200), '| log:', (t.game.log || []).filter(l => /Overgrowth|dies|trigger|gain|counter|Victim|Entrant|Pool/.test(String(l.text || l))).slice(-8).map(l => String(l.text || l).slice(0, 90)).join(' / '));
  return { driven: true, fp: fp(t), kinds: conds.map(c => c.test), seen: seen.length };
}

export function verify(name) {
  const a = play(name, true), b = play(name, false);
  if (!a.driven) return { ok: null, why: a.why };
  if (!b.driven) return { ok: null, why: b.why };
  return { ok: a.fp !== b.fp, kinds: a.kinds, why: a.fp === b.fp ? 'true and false gave the same result' : '' };
}

// ---- several cards together, through the real turn ----
function interactions() {
  const names = (t, i, z) => t.P(i).deck[z].map(c => def(t, c)?.name);
  const endTurn = t => { t.ctl.dispatch({ type: 'end-turn' }, t.as(0)); settle(t); };
  section('interaction: Revolt (Hidden Stockpile) after a creature is sacrificed to the real ability');
  for (const sac of [true, false]) {
    const t = base();
    const stock = mk(t, 0, 'battlefield', FIX['Hidden Stockpile']);
    const bear = mk(t, 0, 'battlefield', SC('Fodder', 'Creature — Bear', '', { p: 1, t: 1 }));
    if (sac) {
      const ab = parseActivatedAbilities(def(t, stock)).filter(a => !a.manaAbility)[0];
      const r = t.ctl.dispatch({ type: 'activate', instanceId: stock.instanceId, abilityId: ab.id }, t.as(0));
      if (!r.ok) throw new Error(r.error);
      settle(t, d => (d.options || []).find(o => o.id === bear.instanceId)?.id);
    }
    endTurn(t);
    const servos = t.P(0).deck.battlefield.filter(c => def(t, c)?.name === 'Servo').length;
    check(`Hidden Stockpile: ${sac ? 'a sacrificed creature (cost of its own ability) lets the end step make a Servo' : 'no permanent left, no Servo'}`, servos === (sac ? 1 : 0), `servos=${servos} bf=${names(t, 0, 'battlefield')}`);
  }
  section('interaction: Celebration (Pests of Honor) after two nonland permanents entered');
  for (const n of [2, 1]) {
    const t = base();
    const pests = mk(t, 0, 'battlefield', FIX['Pests of Honor']);
    for (let i = 0; i < n; i++) enter(t, mk(t, 0, 'library', SC('Newcomer', 'Artifact', '')));
    t.ctl.dispatch({ type: 'next-phase' }, t.as(0)); settle(t);
    const g = t.P(0).deck.battlefield.find(c => c.instanceId === pests.instanceId);
    check(`Pests of Honor: ${n} nonland permanents entered -> ${n >= 2 ? 'a +1/+1 counter at combat' : 'nothing'}`, Number(g?.counters?.['+1/+1'] || 0) === (n >= 2 ? 1 : 0), JSON.stringify(g?.counters) + ' phase ' + t.game.phase);
  }
  section('interaction: self-mill then "if there is an Elf card in your graveyard" (Dawnhand Eulogist)');
  for (const elf of [true, false]) {
    const t = base();
    const lib = t.P(0).deck.remainingLibrary, opp = t.P(1).life;
    const milled = [0, 1, 2].map(i => mk(t, 0, 'library', SC(i === 0 && elf ? 'Mill Elf' : 'Mill Bear', i === 0 && elf ? 'Creature — Elf' : 'Creature — Bear', '', { p: 1, t: 1 })));
    for (const c of milled) lib.splice(lib.indexOf(c), 1);
    lib.unshift(...milled);
    const eul = mk(t, 0, 'hand', FIX['Dawnhand Eulogist'], { manaCost: '{3}' });
    const r = t.ctl.dispatch({ type: 'play', instanceId: eul.instanceId }, t.as(0)); if (!r.ok) throw new Error(r.error);
    settle(t);
    check(`Dawnhand Eulogist: ${elf ? 'an Elf milled by its own trigger makes the opponent lose 2' : 'no Elf, no life loss'}`, t.P(1).life === opp - (elf ? 2 : 0), `${opp}->${t.P(1).life} gy=${names(t, 0, 'graveyard')}`);
  }
  section('interaction: a creature dies in real combat, then Denethor\'s end step ("if a creature died under your control this turn")');
  for (const dies of [true, false]) {
    const t = base();
    const den = mk(t, 0, 'battlefield', FIX['Denethor, Ruling Steward']);
    const mine = mk(t, 0, 'battlefield', SC('Attacker', 'Creature — Bear', '', { p: dies ? 1 : 4, t: dies ? 1 : 4 }));
    const wall = mk(t, 1, 'battlefield', SC('Blocker', 'Creature — Wall', '', { p: 3, t: 3 }));
    t.ctl.dispatch({ type: 'next-phase' }, t.as(0)); settle(t);
    const a = t.ctl.dispatch({ type: 'attack', attacks: [{ instanceId: mine.instanceId, defenderId: t.P(1).playerId }] }, t.as(0)); if (!a.ok) throw new Error(a.error);
    if (t.game.flow.blocks || t.game.combatState) t.ctl.dispatch({ type: 'block', assignments: [{ attackerId: mine.instanceId, blockerId: wall.instanceId }] }, t.as(1));
    settle(t);
    const seenPh = []; for (let i = 0; i < 8 && t.game.turnNumber === 1; i++) { const r = t.ctl.dispatch({ type: 'next-phase' }, t.as(0)); seenPh.push(t.game.phase + ':' + r.ok); if (!r.ok) break; settle(t); if (t.game.phase === 'end-step') break; }
    settle(t);
    const died = !t.P(0).deck.battlefield.some(c => c.instanceId === mine.instanceId), soldiers = t.P(0).deck.battlefield.filter(c => c.token && /Soldier/.test(def(t, c)?.typeLine || '')).length;
    check(`Denethor: our creature ${dies ? 'dies blocked in combat -> a Human Soldier at the end step' : 'survives combat -> no token'}`, died === dies && soldiers === (dies ? 1 : 0), `died=${died} soldiers=${soldiers} phases=${seenPh} turn=${t.game.turnNumber} died=${JSON.stringify(t.game.turnTally?.died)} bf=${names(t, 0, 'battlefield').slice(-3)}`);
  }
  section('interaction: Thoughtweft Charge after a creature of ours entered (cast through the real path)');
  for (const entered of [true, false]) {
    const t = base(); furnish(t);
    const bear = t.P(0).deck.battlefield.find(c => def(t, c)?.name === 'Pool Bear');
    if (entered) enter(t, mk(t, 0, 'library', SC('Newcomer', 'Creature — Bear', '', { p: 1, t: 1 })));
    const h = t.P(0).deck.hand.length;
    const ch = mk(t, 0, 'hand', FIX['Thoughtweft Charge'], { manaCost: '{1}' });
    const r = t.ctl.dispatch({ type: 'play', instanceId: ch.instanceId }, t.as(0)); if (!r.ok) throw new Error(r.error);
    settle(t, d => (d.options || []).find(o => o.id === bear.instanceId)?.id);
    check(`Thoughtweft Charge: ${entered ? 'draws after a creature entered' : 'does not draw otherwise'}`, t.P(0).deck.hand.length === h + (entered ? 1 : 0), `${h}->${t.P(0).deck.hand.length}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let n = 0, nd = 0;
  if (only.includes('interactions')) { interactions(); done(); }
  for (const name of Object.keys(FIX)) {
    if (only.length && !only.includes(name)) continue;
    if (UNVERIFIED.has(name) && !only.length) { console.log(`  --  unverified: ${name}`); continue; }
    let r; try { r = verify(name); } catch (e) { r = { ok: null, why: `crash ${String(e.stack).split('\n').slice(0, 3).join(' | ').slice(0, 260)}` }; }
    if (r.ok === null) { nd++; console.log(`  --  not driven: ${name} (${r.why})`); continue; }
    n++; check(`${name}: rider happens only when ${r.kinds.join(', ')} holds`, r.ok, r.why);
  }
  console.log(`\n${n} driven, ${nd} not driven`);
  if (!only.length) interactions();
  done();
}

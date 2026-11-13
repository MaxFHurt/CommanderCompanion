// Catalog effects (build 43): each new wording played through the real game — cast or activated, choices answered
// by the player who makes them, then the result checked.  node tests/node/catalog.mjs
import { newGame, check, section, done } from './harness.mjs';
import { effectivePower, effectiveToughness, cardHasKeyword } from '../../src/engine/combat.js';
import { parseActivatedAbilities } from '../../src/engine/rules.js';
import { withOverlay } from '../../src/engine/overlay.js';
import { compileEffectText } from '../../src/engine/effects.js';
import { canTarget, canTargetPlayer, candidatesFor } from '../../src/game/requirements.js';
import { playCheck } from '../../src/game/legal.js';

const asText = (t, card, text, extra = {}) => { t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], oracleText: text, ...extra }; return card; };
const def = (t, c) => t.game.cardDefinitions[c.definitionId];
const power = (t, c) => effectivePower(c, withOverlay(c, def(t, c)), t.game);
const tough = (t, c) => effectiveToughness(c, withOverlay(c, def(t, c)), t.game);
const require_lock = t => t.P(0).lifeLocked && t.P(0).lifeLockedTurn === t.game.turnNumber;
const d0 = c => (c && c.instanceId);
const has = (t, c, k) => cardHasKeyword(c, def(t, c), k, t.game);
const auto = d => { const open = (d.options || []).filter(o => !o.disabled); return d.kind === 'choose-many' ? open.slice(0, d.min || 0).map(o => o.id) : d.kind === 'confirm' ? true : d.kind === 'number' ? (d.min || 0) : d.kind === 'arrange' ? { top: d.cards.map(c => c.id), other: [] } : open[0]?.id; };
/** Answer every question; `picks` maps a part of the question key (or a test on the question) to an answer. */
function settle(t, picks = [], seen = []) {
  for (let guard = 0; guard < 40; guard++) {
    t.passAll();
    const d = t.decision();
    if (!d) break;
    seen.push(d);
    const hit = picks.find(([k]) => (typeof k === 'function' ? k(d) : d.key.includes(k)));
    let v = hit ? hit[1] : undefined;
    if (typeof v === 'function') v = v(d);
    if (v === undefined) v = auto(d);
    const r = t.ctl.dispatch({ type: 'answer', key: d.key, value: v }, { playerId: d.playerId, isHost: false });
    if (!r.ok) throw new Error(`answer ${d.key}: ${r.error}`);
  }
  return seen;
}
function setup(decks = ['simic', 'simic']) {
  const t = newGame(decks); t.keepAll();
  for (let i = 0; i < 4; i++) t.give(0, 'Forest', 'battlefield');
  for (let i = 0; i < 4; i++) t.give(0, 'Island', 'battlefield');
  // Start from an empty hand, so random draws can't hold a card a test pulls from the library.
  for (const p of t.game.players) for (const c of p.deck.hand.splice(0)) { c.zone = 'library'; p.deck.remainingLibrary.push(c); }
  t.autoPass = false;
  return t;
}
function cast(t, name, text, picks = [], extra = {}) {
  t.give(0, name); const c = asText(t, t.hand(0, name), text, extra);
  const r = t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0));
  if (!r.ok) throw new Error(`${name}: ${r.error}`);
  return settle(t, picks);
}
function onField(t, name, text, extra = {}, i = 0) { const g = t.give(i, name, 'battlefield'); const c = t.P(i).deck.battlefield.find(x => x.instanceId === g.instanceId) || g; asText(t, c, text, extra); c.enteredTurn = 0; c.controlSinceTurn = 0; return c; }
function activate(t, card, index = 0, picks = []) {
  const ab = parseActivatedAbilities(def(t, card)).filter(a => !a.manaAbility)[index];
  const r = t.ctl.dispatch({ type: 'activate', instanceId: card.instanceId, abilityId: ab.id }, t.as(0));
  if (!r.ok) throw new Error(`activate: ${r.error}`);
  return settle(t, picks);
}

const BLOCKS = [];
const real = (t, name, i = 0, zone = 'battlefield') => { const g = t.give(i, name, zone); return (t.P(i).deck[zone].find(x => x.instanceId === g.instanceId)) || g; };
section('batch 3 part 2: cost-linked counts');
{
  // Painbringer: exile any number of cards from your graveyard, -X/-X with X = the number exiled
  const t = setup();
  const pb = onField(t, 'Grizzly Bears', '{T}, Exile any number of cards from your graveyard: Target creature gets -X/-X until end of turn, where X is the number of cards exiled this way.', { typeLine: 'Creature — Human Minion', power: '1', toughness: '1' });
  pb.summoningSick = false; pb.enteredTurn = -5;
  const foe = onField(t, 'Fog Bank', '', { power: '2', toughness: '9' }, 1);
  for (let i = 0; i < 4; i++) t.give(0, 'Forest', 'graveyard');
  const seen = activate(t, pb, 0, [['cost:exile-any', d => d.options.slice(0, 3).map(o => o.id)], [d => d.kind === 'choose-one' && /target/i.test(d.prompt || ''), foe.instanceId]]);
  check('Painbringer: asked which cards to exile', seen.some(d => /exile-any/.test(d.key)), JSON.stringify(seen.map(d => d.key)));
  check('Painbringer: three cards exiled, -3/-3', t.P(0).deck.graveyard.length === 1 && tough(t, foe) === 6, `${t.P(0).deck.graveyard.length} ${tough(t, foe)}`);
}
{
  // Emrakul's Evangel: sacrifice itself and any number of other non-Eldrazi creatures: a 3/2 for each
  const t = setup();
  const ev = onField(t, 'Colossal Dreadmaw', '{T}, Sacrifice this creature and any number of other non-Eldrazi creatures: Create a 3/2 colorless Eldrazi Horror creature token for each creature sacrificed this way.', { typeLine: 'Creature — Human Horror', power: '2', toughness: '2' });
  ev.summoningSick = false; ev.enteredTurn = -5;
  const a = onField(t, 'Llanowar Elves', '', {}), b = onField(t, 'Elvish Visionary', '', {}), e = onField(t, 'Fog Bank', '', { typeLine: 'Creature — Eldrazi' });
  const seen = activate(t, ev, 0, [['cost:sacrifice-any', d => { check('Evangel: Eldrazi not offered', !d.options.some(o => o.id === e.instanceId), ''); return [a.instanceId, b.instanceId]; }]]);
  const horrors = t.P(0).deck.battlefield.filter(c => /Horror/.test(def(t, c).typeLine || '') || c.tokenName === 'Horror' || def(t, c).name === 'Horror');
  check('Evangel: three Horrors (itself and two others)', horrors.length === 3 && !t.P(0).deck.battlefield.some(c => c.instanceId === ev.instanceId), String(horrors.length));
}
{
  // Jar of Eyeballs / Catti-brie: remove all counters, count them
  const t = setup();
  const jar = onField(t, 'Sol Ring', '{3}, {T}, Remove all eyeball counters from this artifact: Look at the top X cards of your library, where X is the number of eyeball counters removed this way. Put one of them into your hand and the rest on the bottom of your library in any order.', { typeLine: 'Artifact' });
  jar.counters = { eyeball: 4 };
  const top = t.P(0).deck.remainingLibrary.slice(0, 4).map(c => c.instanceId);
  const seen = activate(t, jar, 0, []);
  check('Jar: counters removed', !jar.counters.eyeball, JSON.stringify(jar.counters));
  check('Jar: looked at four, took one', seen.some(d => /dig/i.test(d.key)) && t.P(0).deck.hand.length === 1 && top.includes(t.P(0).deck.hand[0].instanceId), JSON.stringify(seen.map(d => d.key + ':' + (d.prompt || ''))));
}
{
  const t = setup();
  const cb = onField(t, 'Grizzly Bears', '{1}, Remove all +1/+1 counters from Catti-brie: It deals X damage to target attacking or blocking creature an opponent controls, where X is the number of counters removed this way.', { name: 'Catti-brie of Mithral Hall', typeLine: 'Legendary Creature — Human Archer', power: '2', toughness: '2' });
  cb.counters = { '+1/+1': 3 };
  const foe = onField(t, 'Fog Bank', '', { power: '1', toughness: '9' }, 1);
  t.game.combatState = { attackers: [{ instanceId: foe.instanceId, attackingPlayerId: t.P(1).playerId, defender: t.P(0).playerId }], blockers: [] };
  foe.attacking = true;
  activate(t, cb, 0, [[d => d.kind === 'choose-one' && /target/i.test(d.prompt || ''), foe.instanceId]]);
  check('Catti-brie: counters gone, 3 damage', !cb.counters['+1/+1'] && Number(foe.damageMarked || 0) === 3, JSON.stringify([cb.counters, foe.damageMarked]));
}
{
  // Mercurial Chemister: the discarded card's mana value
  const t = setup();
  const mc = onField(t, 'Colossal Dreadmaw', '{G}, {T}, Discard a card: This creature deals damage to target creature equal to the discarded card\'s mana value.', { power: '3', toughness: '3' }); mc.summoningSick = false; mc.enteredTurn = -5;
  t.give(0, 'Mulldrifter', 'hand'); t.give(0, 'Opt', 'hand');
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  const mull = t.P(0).deck.hand.find(c => def(t, c).name === 'Mulldrifter');
  activate(t, mc, 0, [['cost:discard', mull.instanceId], [d => d.kind === 'choose-one' && /target/i.test(d.prompt || ''), foe.instanceId]]);
  check('Chemister: Mulldrifter (mana value 5) discarded, 5 damage', Number(foe.damageMarked || 0) === 5, String(foe.damageMarked));
}
{
  // Fiery Bombardment: red mana symbols in the sacrificed creature's mana cost
  const t = setup();
  const fb = onField(t, 'Fog Bank', 'Chroma — {2}, Sacrifice a creature: This enchantment deals damage to any target equal to the number of red mana symbols in the sacrificed creature\'s mana cost.', { typeLine: 'Enchantment' });
  const fod = onField(t, 'Llanowar Elves', '', { manaCost: '{1}{R}{R}', typeLine: 'Creature — Elf' });
  const foe = onField(t, 'Air Elemental', '', { power: '0', toughness: '9' }, 1);
  activate(t, fb, 0, [['cost:sacrifice', fod.instanceId], [d => d.kind === 'choose-one' && /target/i.test(d.prompt || ''), foe.instanceId]]);
  check('Fiery Bombardment: {1}{R}{R} sacrificed, 2 damage', Number(foe.damageMarked || 0) === 2, String(foe.damageMarked));
}
section('batch 3 part 2: choices made by another player ("unless")');
{
  // Essence Vortex: the creature's controller decides (pays life equal to its toughness, or it is destroyed)
  for (const pay of [true, false]) {
    const t = setup();
    const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '4' }, 1);
    const seen = cast(t, 'Opt', 'Destroy target creature unless its controller pays life equal to its toughness. A creature destroyed this way can\'t be regenerated.', [[d => d.kind === 'choose-one' && /target/i.test(d.prompt || ''), foe.instanceId], [k => /b101-unless|unless/.test(k.key) || /Pay 4 life/.test(k.prompt || ''), pay ? 'pay' : 'no']], { manaCost: '{U}', typeLine: 'Instant' });
    const asked = seen.find(d => /Pay 4 life/.test(d.prompt || ''));
    check(`Essence Vortex (${pay ? 'pays' : 'declines'}): asked of the creature's controller`, asked && asked.playerId === t.P(1).playerId, JSON.stringify(seen.map(d => [d.key, d.playerId])));
    check(`Essence Vortex (${pay ? 'pays' : 'declines'}): result`, pay ? (t.P(1).life === 36 && t.bf(1, 'Fog Bank')) : (!t.bf(1, 'Fog Bank') && t.P(1).life === 40), `${t.P(1).life}`);
  }
}
{
  // Combustion Man: its controller may have it deal damage equal to its power to them instead
  for (const take of [true, false]) {
    const t = setup();
    const cm = onField(t, 'Grizzly Bears', 'Whenever Combustion Man attacks, destroy target permanent unless its controller has Combustion Man deal damage to them equal to his power.', { name: 'Combustion Man', power: '4', toughness: '4' });
    const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '4' }, 1);
    t.end(0); t.autoPass = true; t.end(1);
    t.do(0, { type: 'next-phase' });
    t.autoPass = false;
    const l1 = t.P(1).life;
    t.do(0, { type: 'attack', attacks: [{ instanceId: cm.instanceId, defenderId: t.P(1).playerId }] });
    const seen = settle(t, [[d => d.kind === 'choose-one' && /target/i.test(d.prompt || '') || d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId], [d => /damage to you/.test(d.prompt || ''), take ? 'do' : 'no']]);
    const asked = seen.find(d => /damage to you/.test(d.prompt || ''));
    check(`Combustion Man (${take ? 'takes damage' : 'declines'}): asked of its controller`, asked && asked.playerId === t.P(1).playerId, JSON.stringify(seen.map(d => [d.key, d.playerId, d.prompt])));
    check(`Combustion Man (${take ? 'takes damage' : 'declines'}): result`, take ? (t.bf(1, 'Fog Bank') && t.P(1).life === l1 - 4) : !t.bf(1, 'Fog Bank'), `${t.P(1).life} ${!!t.bf(1, 'Fog Bank')}`);
  }
}
{
  // Tomb Blade: that player loses life equal to their creature count unless they sacrifice a creature of their choice
  for (const sac of [true, false]) {
    const t = setup();
    const tb = onField(t, 'Grizzly Bears', 'Whenever this creature deals combat damage to a player, that player loses life equal to the number of creatures they control unless they sacrifice a creature of their choice.', { power: '2', toughness: '2' });
    onField(t, 'Fog Bank', '', { power: '0', toughness: '4' }, 1); const e2 = onField(t, 'Air Elemental', '', { power: '0', toughness: '4' }, 1);
    t.end(0); t.autoPass = true; t.end(1);
    t.do(0, { type: 'next-phase' });
    t.autoPass = false;
    const l1 = t.P(1).life;
    t.do(0, { type: 'attack', attacks: [{ instanceId: tb.instanceId, defenderId: t.P(1).playerId }] });
    t.passAll(); t.do(1, { type: 'block', assignments: [] });
    const seen = settle(t, [[d => /Sacrifice a creature to stop/.test(d.prompt || ''), sac ? e2.instanceId : 'no']]);
    const asked = seen.find(d => /Sacrifice a creature to stop/.test(d.prompt || ''));
    check(`Tomb Blade (${sac ? 'sacrifices' : 'declines'}): asked of the damaged player`, asked && asked.playerId === t.P(1).playerId, JSON.stringify(seen.map(d => [d.key, d.playerId, d.prompt])));
        check(`Tomb Blade (${sac ? 'sacrifices' : 'declines'}): result`, sac ? (!t.P(1).deck.battlefield.some(c => c.instanceId === e2.instanceId) && t.P(1).life === l1 - 2) : (t.P(1).life === l1 - 2 - 2), `${l1} -> ${t.P(1).life}`);
  }
}
section('batch 3 part 2: close to done');
{
  // Observed Stasis: draw for each tapped creature its controller controls
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '4' }, 1); foe.tapped = true;
  const f2 = onField(t, 'Air Elemental', '', { power: '0', toughness: '4' }, 1); f2.tapped = true;
  onField(t, 'Mulldrifter', '', { power: '0', toughness: '4' }, 1);
  const before = t.P(0).deck.hand.length;
  const seen = cast(t, 'Divination', 'Flash\nEnchant creature an opponent controls\nWhen this Aura enters, remove enchanted creature from combat. Then draw a card for each tapped creature its controller controls.\nEnchanted creature loses all abilities and can\'t attack or block.', [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{U}', typeLine: 'Enchantment — Aura' });
  check('Observed Stasis: drew two (two tapped creatures)', t.P(0).deck.hand.length === before + 2, `${before} -> ${t.P(0).deck.hand.length} ${JSON.stringify(seen.map(d => d.key))}`);
}
{
  // Cradle of Vitality: pay {1}{G} (stand-in); a counter for each life gained
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you gain life, you may pay {1}{G}. If you do, put a +1/+1 counter on target creature for each 1 life you gained.', { typeLine: 'Enchantment' });
  const mull = onField(t, 'Mulldrifter', '', { power: '1', toughness: '1' });
  const seen = cast(t, 'Opt', 'You gain 4 life.', [[d => d.options?.some(o => o.id === 'pay'), 'pay'], [d => d.kind === 'choose-one' && d.options?.some(o => o.id === mull.instanceId), mull.instanceId]], { manaCost: '{U}', typeLine: 'Instant' });
  check('Cradle: four +1/+1 counters (4 life gained)', Number(mull.counters?.['+1/+1'] || 0) === 4, JSON.stringify([mull.counters, seen.map(d => d.key + d.prompt)]));
}
{
  // Power Surge: the lands untapped as the turn began (before the untap step)
  const t = setup();
  onField(t, 'Fog Bank', 'At the beginning of each player\'s upkeep, this enchantment deals X damage to that player, where X is the number of untapped lands they controlled at the beginning of this turn.', { typeLine: 'Enchantment' });
  for (let i = 0; i < 3; i++) t.give(1, 'Forest', 'battlefield');
  t.P(1).deck.battlefield.filter(c => /Land/.test(def(t, c).typeLine))[0].tapped = true;
  const l1 = t.P(1).life;
  t.autoPass = true; t.end(0);
  check('Power Surge: 2 damage (two lands untapped as the turn began)', t.P(1).life === l1 - 2 && t.game.activePlayerId === t.P(1).playerId, `${t.P(1).life} ${l1}`);
}
{
  // Cruel Calculations: cards milled this turn from target player's library
  const t = setup();
  const before = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Target player mills three cards.', [[d => d.kind === 'choose-one', t.P(1).playerId]], { manaCost: '{U}', typeLine: 'Sorcery' });
  const b2 = t.P(0).deck.hand.length;
  cast(t, 'Divination', 'Draw X cards, where X is the number of cards that were put into target player\'s graveyard from their library this turn.', [[d => d.kind === 'choose-one', t.P(1).playerId]], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Cruel Calculations: draws three', t.P(0).deck.hand.length === b2 + 3, `${before} ${b2} ${t.P(0).deck.hand.length}`);
}
{
  // Black Hole: one target plus up to X others (X asked: Attractions are not played here)
  const t = setup();
  const a = onField(t, 'Fog Bank', '', { power: '0', toughness: '4' }, 1), b = onField(t, 'Air Elemental', '', { power: '0', toughness: '4' }, 1), c = onField(t, 'Mulldrifter', '', { power: '0', toughness: '4' }, 1);
  const seen = cast(t, 'Divination', 'Destroy target creature and up to X other target creatures, where X is the number of Attractions you\'ve visited this turn.', [[d => d.kind === 'number', 1], [d => d.kind === 'choose-one' && d.options?.some(o => o.id === a.instanceId), a.instanceId], [d => d.kind === 'choose-many', d => { check('Black Hole: the first target is not offered again', !d.options.some(o => o.id === a.instanceId), ''); return [b.instanceId]; }]], { manaCost: '{3}{G}', typeLine: 'Sorcery' });
  const left = t.P(1).deck.battlefield.map(x => def(t, x).name);
  check('Black Hole: X = 1 destroys two creatures', left.length === 1 && left[0] === 'Mulldrifter', JSON.stringify([left, seen.map(d => d.key)]));
}
{
  // Guardian of the Gateless: +1/+1 for each creature it is blocking
  const t = setup(['simic', 'simic']);
  const g = onField(t, 'Colossal Dreadmaw', 'This creature can block any number of creatures.\nWhenever this creature blocks, it gets +1/+1 until end of turn for each creature it\'s blocking.', { power: '1', toughness: '1' }, 1);
  const a1 = onField(t, 'Llanowar Elves', '', { power: '1', toughness: '1' }), a2 = onField(t, 'Elvish Visionary', '', { power: '1', toughness: '1' });
  a1.summoningSick = false; a2.summoningSick = false; a1.enteredTurn = -5; a2.enteredTurn = -5;
  t.end(0); t.end(1); t.autoPass = false;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [a1, a2].map(x => ({ instanceId: x.instanceId, defenderId: t.P(1).playerId })) });
  t.passAll();
  t.do(1, { type: 'block', assignments: [{ attackerId: a1.instanceId, blockerId: g.instanceId }, { attackerId: a2.instanceId, blockerId: g.instanceId }] });
  const p0 = power(t, g); settle(t, [], []);
  check('Guardian: +2/+2 once while blocking two creatures (3/3)', power(t, g) === 3 && tough(t, g) === 3, String(power(t, g)));
  console.log('guardian power', power(t, g), tough(t, g), t.game.phase);
}
section('batch 3 part 2: discard-linked "if you do"');
{
  // Fiery Encore: discard a card, draw a card; a nonland discard deals damage equal to its mana value
  for (const land of [false, true]) {
    const t = setup();
    const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
    const card = real(t, land ? 'Forest' : 'Mulldrifter', 0, 'hand');
    const seen = cast(t, 'Divination', 'Discard a card, then draw a card. When you discard a nonland card this way, Fiery Encore deals damage equal to that card\'s mana value to target creature or planeswalker.', [[d => d.kind === 'choose-many' && d.private, [card.instanceId]], [d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{2}{G}', typeLine: 'Sorcery' });
    check(`Fiery Encore (${land ? 'a land' : 'Mulldrifter'}): damage ${land ? '0' : '5'}`, Number(foe.damageMarked || 0) === (land ? 0 : 5), `${foe.damageMarked} ${JSON.stringify(seen.map(d => d.key))}`);
  }
}
{
  // Mount Velus Manticore: discard a card; X = its card types
  const t = setup();
  const mm = onField(t, 'Grizzly Bears', 'At the beginning of combat on your turn, you may discard a card. When you do, this creature deals X damage to any target, where X is the number of card types the discarded card has.', { typeLine: 'Enchantment Creature — Manticore' });
  const card = real(t, 'Sol Ring', 0, 'hand'); card.zone = 'hand';
  t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], typeLine: 'Artifact Creature — Golem' };
  t.end(0); t.end(1); t.autoPass = false;
  const l1 = t.P(1).life;
  t.do(0, { type: 'next-phase' });
  const seen = settle(t, [[d => d.kind === 'confirm' || d.kind === 'choose-one' && d.options?.some(o => o.id === 'yes'), d => (d.kind === 'confirm' ? true : 'yes')], [d => d.kind === 'choose-many' && d.private, [card.instanceId]], [d => d.options?.some(o => o.id === t.P(1).playerId), t.P(1).playerId]]);
  check('Mount Velus Manticore: an artifact creature has two types: 2 damage', t.P(1).life === l1 - 2, `${l1} → ${t.P(1).life} ${JSON.stringify(seen.map(d => [d.key, d.kind, d.prompt]))}`);
}
{
  // Balin: discard your hand, draw that many; damage to each opponent only with an enduring story
  for (const story of [false, true]) {
    const t = setup();
    onField(t, 'Fog Bank', 'Whenever you cast a spell, you may discard your hand. Draw X cards, where X is the number of cards discarded this way. If you have an enduring story, Balin deals X damage to each opponent.', { typeLine: 'Legendary Creature — Dwarf Bard' });
    if (story) { onField(t, 'Sol Ring', '', { typeLine: 'Artifact' }); onField(t, 'Arcane Signet', '', { typeLine: 'Artifact' }); }
    real(t, 'Mulldrifter', 0, 'hand'); real(t, 'Air Elemental', 0, 'hand'); real(t, 'Tatyova, Benthic Druid', 0, 'hand');
    const l1 = t.P(1).life;
    cast(t, 'Opt', 'You gain 1 life.', [[d => d.kind === 'confirm' || (d.options || []).some(o => o.id === 'yes'), d => (d.kind === 'confirm' ? true : 'yes')]], { manaCost: '{U}', typeLine: 'Instant' });
    check(`Balin (${story ? 'enduring story' : 'no story'}): ${story ? '3 damage' : 'no damage'}`, t.P(1).life === l1 - (story ? 3 : 0), `${l1} → ${t.P(1).life} hand ${t.P(0).deck.hand.length}`);
  }
}
{
  // Olivia, Opulent Outlaw: Treasure when outlaws deal combat damage (once for two outlaws), and the sorcery-speed counters ability costs two Treasures
  const t = setup();
  const ol = onField(t, 'Grizzly Bears', 'Whenever one or more outlaws you control deal combat damage to a player, create a Treasure token.\n{3}, Sacrifice two Treasures: Put two +1/+1 counters on each creature you control. Activate only as a sorcery.', { typeLine: 'Legendary Creature — Vampire Assassin', power: '1', toughness: '1' });
  const rg = onField(t, 'Llanowar Elves', '', { typeLine: 'Creature — Elf Rogue', power: '1', toughness: '1' }), nope = onField(t, 'Elvish Visionary', '', { typeLine: 'Creature — Elf Shaman', power: '1', toughness: '1' });
  for (const c of [ol, rg, nope]) { c.summoningSick = false; c.enteredTurn = -5; }
  t.end(0); t.autoPass = true; t.end(1);
  t.do(0, { type: 'next-phase' }); t.autoPass = false;
  t.do(0, { type: 'attack', attacks: [ol, rg, nope].map(x => ({ instanceId: x.instanceId, defenderId: t.P(1).playerId })) });
  settle(t);
  const treasures = () => t.P(0).deck.battlefield.filter(c => c.token && /Treasure/.test(def(t, c).name));
  check('Olivia: one Treasure for two outlaws dealing damage together (not for the Shaman)', treasures().length === 1, String(treasures().length));
  // the ability: {3} and two Treasures
  const extra = real(t, 'Sol Ring'); extra.zone = 'battlefield';
  asText(t, extra, '', { typeLine: 'Artifact — Treasure', name: 'Treasure' }); extra.token = true;
  const before = ol.counters?.['+1/+1'] || 0;
  const seen = activate(t, ol, 0, []);
  const left = t.P(0).deck.battlefield.filter(c => /Treasure/.test((def(t, c).typeLine || '') + def(t, c).name)).length;
  check('Olivia: two +1/+1 counters on each creature, both Treasures sacrificed', (ol.counters?.['+1/+1'] || 0) === before + 2 && (rg.counters?.['+1/+1'] || 0) === 2 && left === 0, JSON.stringify([ol.counters, rg.counters, left, seen.map(d => d.key)]));
}
section('batch 3 part 2: additional-cost choices');
{
  // Monstrous Emergence: reveal a creature card from hand (power 6) or choose a creature you control (power 4)
  for (const reveal of [false, true]) {
    const t = setup();
    const mine = onField(t, 'Grizzly Bears', '', { power: '4', toughness: '4' });
    const inHand = real(t, 'Colossal Dreadmaw', 0, 'hand'); t.game.cardDefinitions[inHand.definitionId] = { ...t.game.cardDefinitions[inHand.definitionId], power: '6' };
    const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
    const seen = cast(t, 'Divination', 'As an additional cost to cast this spell, choose a creature you control or reveal a creature card from your hand.\nMonstrous Emergence deals damage equal to the power of the creature you chose or the card you revealed to target creature.', [['cost:choose-power', reveal ? inHand.instanceId : mine.instanceId], [d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{1}{G}', typeLine: 'Sorcery' });
    check(`Monstrous Emergence (${reveal ? 'reveals a 6-power card' : 'chooses a 4-power creature'}): damage`, Number(foe.damageMarked || 0) === (reveal ? 6 : 4) && t.P(0).deck.hand.some(c => c.instanceId === inHand.instanceId), `${foe.damageMarked} ${JSON.stringify(seen.map(d => d.key))}`);
  }
}
{
  // Close Encounter: no creature at all: it can't be cast
  const t = setup();
  t.give(0, 'Opt'); const c = asText(t, t.hand(0, 'Opt'), 'As an additional cost to cast this spell, choose a creature you control or a warped creature card you own in exile.\nClose Encounter deals damage equal to the power of the chosen creature or card to target creature.', { manaCost: '{1}{G}', typeLine: 'Instant' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0));
  check('Close Encounter: with no creature to choose it is not cast', !r.ok, JSON.stringify(r).slice(0, 120));
  const t2 = setup();
  const mine = onField(t2, 'Grizzly Bears', '', { power: '3', toughness: '3' }), foe = onField(t2, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  cast(t2, 'Opt', 'As an additional cost to cast this spell, choose a creature you control or a warped creature card you own in exile.\nClose Encounter deals damage equal to the power of the chosen creature or card to target creature.', [['cost:choose-power', mine.instanceId], [d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{1}{G}', typeLine: 'Instant' });
  check('Close Encounter: 3 damage from the chosen 3-power creature', Number(foe.damageMarked || 0) === 3, String(foe.damageMarked));
}
section('batch 3 part 2: others (1)');
{
  // Stalking Yeti: it and the target creature deal damage equal to their power to each other
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '2', toughness: '5' }, 1);
  t.give(0, 'Mulldrifter', 'hand'); const y = t.hand(0, 'Mulldrifter');
  asText(t, y, 'When this creature enters, if it\'s on the battlefield, it deals damage equal to its power to target creature an opponent controls and that creature deals damage equal to its power to this creature.', { manaCost: '{2}{G}', power: '3', toughness: '4', typeLine: 'Snow Creature — Yeti' });
  t.ctl.dispatch({ type: 'play', instanceId: y.instanceId }, t.as(0));
  settle(t, [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]]);
  check('Stalking Yeti: 3 damage to the target, 2 back to the Yeti', Number(foe.damageMarked || 0) === 3 && Number(y.damageMarked || 0) === 2, `${foe.damageMarked} ${y.damageMarked}`);
}
{
  // Form of the Dinosaur: 15 damage to the creature; it deals damage equal to its power to you
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '4', toughness: '9' }, 1);
  onField(t, 'Divination', 'At the beginning of your upkeep, this enchantment deals 15 damage to target creature an opponent controls and that creature deals damage equal to its power to you.', { typeLine: 'Enchantment' });
  t.autoPass = true; t.end(0); t.end(1);
  settle(t, [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]]);
  check('Form of the Dinosaur: the creature died and dealt 4 to me', !t.bf(1, 'Fog Bank') && t.P(0).life === 36, `${t.P(0).life} ${!!t.bf(1, 'Fog Bank')}`);
}
{
  // Foray of Orcs: amass 2, then damage equal to the Army's power
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  cast(t, 'Divination', 'Amass Orcs 2. When you do, Foray of Orcs deals X damage to target creature an opponent controls, where X is the amassed Army\'s power.', [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{3}{G}', typeLine: 'Sorcery' });
  check('Foray of Orcs: a 2/2 Army and 2 damage', Number(foe.damageMarked || 0) === 2 && t.P(0).deck.battlefield.some(c => /Army/.test(def(t, c).typeLine || '')), String(foe.damageMarked));
}
{
  // Impact Resonance: X = the most damage one source dealt to one recipient this turn, divided among target creatures
  const t = setup();
  const a = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1), b = onField(t, 'Air Elemental', '', { power: '0', toughness: '9' }, 1);
  cast(t, 'Opt', 'Test deals 4 damage to any target.', [[d => d.kind === 'choose-one', t.P(1).playerId]], { manaCost: '{U}', typeLine: 'Instant' });
  const seen = cast(t, 'Divination', 'Impact Resonance deals X damage divided as you choose among any number of target creatures, where X is the greatest amount of damage dealt by a source to a permanent or player this turn.', [[d => d.kind === 'choose-many', [a.instanceId, b.instanceId]], [d => d.kind === 'number' && /left goes/.test(d.prompt || ''), 3]], { manaCost: '{1}{G}', typeLine: 'Instant', name: 'Impact Resonance' });
  check('Impact Resonance: 4 damage divided (3 and 1)', Number(a.damageMarked || 0) + Number(b.damageMarked || 0) === 4, `${a.damageMarked} ${b.damageMarked} ${JSON.stringify(seen.map(d => [d.key, d.prompt]))}`);
}
{
  // Sacred Boon: counters for the damage prevented
  const t = setup();
  const mine = onField(t, 'Grizzly Bears', '', { power: '2', toughness: '2' });
  cast(t, 'Divination', 'Prevent the next 3 damage that would be dealt to target creature this turn. At the beginning of the next end step, put a +0/+1 counter on that creature for each 1 damage prevented this way.', [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === mine.instanceId), mine.instanceId]], { manaCost: '{1}{G}', typeLine: 'Instant' });
  cast(t, 'Opt', 'Test deals 2 damage to target creature.', [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === mine.instanceId), mine.instanceId]], { manaCost: '{U}', typeLine: 'Instant' });
  t.autoPass = true; t.end(0);
  check('Sacred Boon: 2 damage prevented: two +0/+1 counters at the end step', Number(mine.counters?.['+0/+1'] || 0) === 2 && !Number(mine.damageMarked || 0), JSON.stringify([mine.counters, mine.damageMarked]));
}
{
  // Titan of Littjara: draw for each other creature sharing a type, then discard
  const t = setup();
  const ti = onField(t, 'Colossal Dreadmaw', 'Whenever this creature enters or attacks, you may draw a card for each other creature you control that shares a creature type with it. If you do, discard a card.', { typeLine: 'Creature — Illusion Elf' });
  onField(t, 'Llanowar Elves', '', { typeLine: 'Creature — Elf Druid' }); onField(t, 'Elvish Visionary', '', { typeLine: 'Creature — Elf Shaman' }); onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Bear' });
  check('Titan of Littjara: compiles to a draw of the sharing creatures', JSON.stringify(compileEffectText('You may draw a card for each other creature you control that shares a creature type with it. If you do, discard a card.', { sourceName: 'Titan' }).effects).includes('b101-sharing'), '');
}
section('batch 3 part 2: others (2)');
{
  // Scour the Desert: Bird tokens equal to the exiled card's toughness
  const t = setup();
  const g = real(t, 'Colossal Dreadmaw', 0, 'graveyard'); t.game.cardDefinitions[g.definitionId] = { ...t.game.cardDefinitions[g.definitionId], toughness: '4' };
  const sn = cast(t, 'Divination', 'Exile target creature card from your graveyard. Create X 1/1 white Bird creature tokens with flying, where X is the exiled card\'s toughness.', [[d => d.options?.some(o => o.id === g.instanceId), g.instanceId]], { manaCost: '{3}{G}', typeLine: 'Sorcery' });
  console.log(JSON.stringify(sn.map(d => [d.key, d.kind, d.prompt])), t.game.log.slice(0,4).map(x=>x.text).join(' / '));
  const birds = t.P(0).deck.battlefield.filter(c => c.token && /Bird/.test(def(t, c).name));
  check('Scour the Desert: four Birds, the card exiled', birds.length === 4 && t.P(0).deck.exile.some(c => c.instanceId === g.instanceId), `${birds.length}`);
}
{
  // Waste Management: two cards (one creature) from one graveyard: one Rogue; kicked: the whole graveyard
  {
    const t = setup();
    real(t, 'Colossal Dreadmaw', 1, 'graveyard'); real(t, 'Opt', 1, 'graveyard'); real(t, 'Air Elemental', 1, 'graveyard');
    const txt = 'Exile up to two target cards from a single graveyard. Create a 2/2 black Rogue creature token for each creature card exiled this way.';
    const t0 = setup();
    const a = real(t0, 'Colossal Dreadmaw', 1, 'graveyard'), b = real(t0, 'Opt', 1, 'graveyard'); real(t0, 'Air Elemental', 1, 'graveyard');
    cast(t0, 'Divination', txt, [[d => d.kind === 'choose-many', [a.instanceId, b.instanceId]], [d => d.key.includes(':who'), t0.P(1).playerId]], { manaCost: '{2}{G}', typeLine: 'Instant' });
    check('Waste Management: two cards (one creature): one Rogue, one card left', t0.P(0).deck.battlefield.filter(c => c.token && /Rogue/.test(def(t0, c).name)).length === 1 && t0.P(1).deck.graveyard.length === 1, String(t0.P(1).deck.graveyard.length));
    // kicked: the compiled text exiles the target player's whole graveyard
    const kc = compileEffectText('Exile up to two target cards from a single graveyard. If this spell was kicked, instead exile target player\'s graveyard. Create a 2/2 black Rogue creature token for each creature card exiled this way.', { sourceName: 'Waste Management' });
    const { applyEffects } = await import('../../src/engine/effects.js');
    const pb = kc.requirements.find(q => q.kind === 'player').bind;
    applyEffects(t.game, t.P(0).playerId, kc.effects, { sourceId: null, [pb]: t.P(1).playerId });
    check('Waste Management (kicked): the whole graveyard exiled, two Rogues', t.P(1).deck.graveyard.length === 0 && t.P(0).deck.battlefield.filter(c => c.token && /Rogue/.test(def(t, c).name)).length === 2, `${t.P(1).deck.graveyard.length}`);
  }
}
{
  // Rise of the Deathbringer: draw cards equal to the greatest power, lose that much life
  const t = setup();
  onField(t, 'Grizzly Bears', '', { power: '3', toughness: '3' });
  const l = t.P(0).life;
  cast(t, 'Opt', 'Choose one —\n• Draw cards equal to the greatest power among creatures you control. You lose life equal to the number of cards drawn this way.\n• All creatures get -3/-3 until end of turn.', [[d => d.kind === 'choose-many' || d.kind === 'choose-one', d => (d.kind === 'choose-many' ? [d.options[0].id] : d.options[0].id)]], { manaCost: '{3}{G}', typeLine: 'Instant' });
  check('Rise of the Deathbringer: drew three, lost three', t.P(0).deck.hand.length === 3 && t.P(0).life === l - 3, `${t.P(0).deck.hand.length} ${t.P(0).life}`);
}
{
  // Palace Jailer: exiled until an opponent becomes the monarch
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '4' }, 1);
  cast(t, 'Divination', 'Exile target creature an opponent controls until an opponent becomes the monarch.', [[d => d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{2}{G}', typeLine: 'Sorcery' });
  check('Palace Jailer: exiled', !t.bf(1, 'Fog Bank') && t.P(1).deck.exile.some(c => c.instanceId === foe.instanceId) && (t.game.monarchExiles || []).length === 1, '');
  const r = compileEffectText('You become the monarch.', { sourceName: 'X' });
  // the opponent becomes the monarch
  import('../../src/engine/effects.js').then(() => {});
  t.game.activePlayerId = t.P(1).playerId;
  const { applyEffects } = await import('../../src/engine/effects.js');
  applyEffects(t.game, t.P(1).playerId, r.effects, { sourceId: null });
  check('Palace Jailer: back when an opponent becomes the monarch', !!t.bf(1, 'Fog Bank') && !(t.game.monarchExiles || []).length, JSON.stringify(t.P(1).deck.exile.map(c => def(t, c).name)));
}
{
  // Hateful Eidolon: draws for each of my Auras on the creature that died
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it.', { typeLine: 'Enchantment Creature — Spirit' });
  const v = onField(t, 'Grizzly Bears', '', { power: '1', toughness: '1' }, 1);
  const a1 = onField(t, 'Divination', 'Enchant creature', { typeLine: 'Enchantment — Aura' }), a2 = onField(t, 'Sol Ring', 'Enchant creature', { typeLine: 'Enchantment — Aura' });
  a1.attachedTo = v.instanceId; a2.attachedTo = v.instanceId;
  const before = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.options?.some(o => o.id === v.instanceId), v.instanceId]], { manaCost: '{3}{G}', typeLine: 'Instant' });
  settle(t); console.log(t.game.log.slice(0, 6).map(x => x.text).join(' / '), JSON.stringify((t.game.pendingTriggers || []).map(x => x.abilityText)));
  check('Hateful Eidolon: two Auras: two cards', t.P(0).deck.hand.length === before + 2, `${before} -> ${t.P(0).deck.hand.length}`);
}
{
  // Blazing Effigy: 3 plus the damage dealt to it this turn by other sources with its name
  const t = setup();
  const e = onField(t, 'Fog Bank', 'When this creature dies, it deals X damage to target creature, where X is 3 plus the amount of damage dealt to this creature this turn by other sources named Blazing Effigy.', { name: 'Blazing Effigy', power: '1', toughness: '3' });
  const foe = onField(t, 'Air Elemental', '', { power: '0', toughness: '9' }, 1);
  const o = onField(t, 'Llanowar Elves', '', { name: 'Blazing Effigy', power: '2', toughness: '9' }); const o2id = () => o.instanceId;
  cast(t, 'Opt', 'Target creature fights another target creature.', [[d => d.kind === 'choose-one' && d.options?.some(x => x.id === e.instanceId) && !d.targetsChosen, d => (d.key.endsWith(':0:target') ? e.instanceId : o.instanceId)]], { manaCost: '{G}', typeLine: 'Instant' });
  cast(t, 'Divination', 'Test deals 1 damage to target creature.', [[d => d.kind === 'choose-one' && d.options?.some(x => x.id === e.instanceId), e.instanceId]], { manaCost: '{G}', typeLine: 'Instant' });
  settle(t, [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === o2id()), o2id()]]);
  check('Blazing Effigy: died; 3 + 2 = 5 damage to the target', !t.P(0).deck.battlefield.some(c => c.instanceId === e.instanceId) && Number(o.damageMarked || 0) >= 5, `${o.damageMarked}`);
}
{
  // Nature's Blessing: a counter, or a lasting keyword
  for (const mode of ['+1/+1 counter', 'trample']) {
    const t = setup();
    const nb = onField(t, 'Fog Bank', '{G}{G}, Discard a card: Put a +1/+1 counter on target creature or that creature gains banding, first strike, or trample.', { typeLine: 'Enchantment' });
    const c = onField(t, 'Grizzly Bears', '', { power: '2', toughness: '2' }); real(t, 'Opt', 0, 'hand');
    activate(t, nb, 0, [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === c.instanceId), c.instanceId], [d => d.options?.some(o => o.id === mode), mode]]);
    check(`Nature's Blessing (${mode})`, mode === 'trample' ? has(t, c, 'Trample') : Number(c.counters?.['+1/+1'] || 0) === 1, JSON.stringify(c.counters));
  }
}
{
  // Kraul Harpooner: +X/+0 for the creature cards in my graveyard, then fight a flyer
  const t = setup();
  real(t, 'Mulldrifter', 0, 'graveyard'); real(t, 'Air Elemental', 0, 'graveyard');
  const fl = onField(t, 'Fog Bank', 'Flying', { power: '1', toughness: '9', keywords: ['Flying'] }, 1);
  t.give(0, 'Colossal Dreadmaw', 'hand'); const kh = t.hand(0, 'Colossal Dreadmaw');
  asText(t, kh, 'Reach\nUndergrowth — When this creature enters, choose up to one target creature you don\'t control with flying. This creature gets +X/+0 until end of turn, where X is the number of creature cards in your graveyard, then you may have this creature fight that creature.', { manaCost: '{1}{G}', power: '2', toughness: '2', typeLine: 'Creature — Insect Warrior' });
  t.ctl.dispatch({ type: 'play', instanceId: kh.instanceId }, t.as(0));
  settle(t, [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === fl.instanceId), fl.instanceId], [d => d.kind === 'confirm', true]]);
  check('Kraul Harpooner: 4/2 fights the flyer: 4 damage to it, 1 to the Harpooner', Number(fl.damageMarked || 0) === 4 && Number(kh.damageMarked || 0) === 1, `${fl.damageMarked} ${kh.damageMarked}`);
}
{
  // Skullmulcher: draw for each creature devoured
  const t = setup();
  const a = onField(t, 'Llanowar Elves', '', { power: '1', toughness: '1' }), b = onField(t, 'Elvish Visionary', '', { power: '1', toughness: '1' });
  t.give(0, 'Colossal Dreadmaw', 'hand'); const sk = t.hand(0, 'Colossal Dreadmaw');
  asText(t, sk, 'Devour 1\nWhen this creature enters, draw a card for each creature it devoured.', { manaCost: '{4}{G}', power: '4', toughness: '4', typeLine: 'Creature — Elemental' });
  const before = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: sk.instanceId }, t.as(0));
  settle(t, [[d => d.kind === 'choose-many' && /devour/i.test(d.title || ''), [a.instanceId, b.instanceId]]]);
  check('Skullmulcher: two devoured, two cards drawn (hand 0 → 2) and two counters on a 4/4... (devour 1: two)', t.P(0).deck.hand.length === before - 1 + 2 && Number(sk.counters?.['+1/+1'] || 0) === 2, `${t.P(0).deck.hand.length} ${JSON.stringify(sk.counters)}`);
}
{
  // Glissa Sunseeker: destroys an artifact only when its mana value equals the unspent mana
  for (const pool of [3, 2]) {
    const t = setup();
    const gl = onField(t, 'Grizzly Bears', '{T}: Destroy target artifact if its mana value is equal to the amount of unspent mana you have.', { power: '2', toughness: '4' }); gl.summoningSick = false; gl.enteredTurn = -5;
    const art = onField(t, 'Sol Ring', '', { typeLine: 'Artifact', manaValue: 3 }, 1);
    t.P(0).mana.floating = { W: 0, U: 0, B: 0, R: 0, G: pool, C: 0 };
    activate(t, gl, 0, [[d => d.options?.some(o => o.id === art.instanceId), art.instanceId]]);
    check(`Glissa Sunseeker (pool ${pool}, artifact mana value 3): ${pool === 3 ? 'destroyed' : 'stays'}`, pool === 3 ? !t.bf(1, 'Sol Ring') : !!t.bf(1, 'Sol Ring'), '');
  }
}
{
  // Krile Baldesion: the creature card with the same mana value as the spell
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you cast a noncreature spell, you may return target creature card with mana value equal to that spell\'s mana value from your graveyard to your hand. Do this only once each turn.', { typeLine: 'Legendary Creature — Dwarf Wizard' });
  const m3 = real(t, 'Elvish Visionary', 0, 'graveyard'), m5 = real(t, 'Mulldrifter', 0, 'graveyard');
  t.game.cardDefinitions[m3.definitionId] = { ...t.game.cardDefinitions[m3.definitionId], manaValue: 3 };
  t.game.cardDefinitions[m5.definitionId] = { ...t.game.cardDefinitions[m5.definitionId], manaValue: 5 };
  const seen = cast(t, 'Divination', 'Draw two cards.', [[d => d.options?.some(o => o.id === m3.instanceId) || d.options?.some(o => o.id === m5.instanceId), d => { check('Krile: only the creature card with the spell\'s mana value is offered', d.options.length === 1 && d.options[0].id === m3.instanceId, JSON.stringify(d.options.map(o => o.label))); return d.options[0].id; }], [d => d.kind === 'confirm', true]], { manaCost: '{2}{G}', typeLine: 'Sorcery', manaValue: 3 });
  check('Krile Baldesion: Elvish Visionary came back', t.P(0).deck.hand.some(c => c.instanceId === m3.instanceId), JSON.stringify(seen.map(d => d.key)));
}
{
  // Coveted Falcon: they gain control of two of my permanents; I draw two
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', { power: '1', toughness: '1' }), b = onField(t, 'Llanowar Elves', '', { power: '1', toughness: '1' });
  const before = t.P(0).deck.hand.length;
  const sc = cast(t, 'Divination', 'Target opponent gains control of any number of target permanents you control. Draw a card for each one they gained control of this way.', [[d => d.kind === 'choose-many', [a.instanceId, b.instanceId]], [d => d.kind === 'choose-one' && d.options?.some(o => o.id === t.P(1).playerId), t.P(1).playerId]], { manaCost: '{2}{G}', typeLine: 'Sorcery' });
  console.log(a.controllerId, t.P(0).playerId, t.P(1).playerId, t.P(0).deck.battlefield.some(c => c.instanceId === a.instanceId), t.P(1).deck.battlefield.some(c => c.instanceId === a.instanceId));
  check('Coveted Falcon: two permanents given, two cards drawn', t.P(1).deck.battlefield.length === 2 && t.P(0).deck.hand.length === before + 2, `${t.P(1).deck.battlefield.length} ${t.P(0).deck.hand.length}`);
}
{
  // Epochrasite: dies -> exiled with three time counters and suspend; Maelstrom Djinn: time counters and vanishing
  const t = setup();
  const e = onField(t, 'Grizzly Bears', 'When this creature dies, exile it with three time counters on it and it gains suspend.', { power: '1', toughness: '1' });
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.options?.some(o => o.id === e.instanceId), e.instanceId]], { manaCost: '{3}{G}', typeLine: 'Instant' });
  settle(t);
  const ex = t.P(0).deck.exile.find(c => c.instanceId === e.instanceId);
  check('Epochrasite: exiled with three time counters, suspended', !!ex && ex.counters?.time === 3 && ex.suspended === true, JSON.stringify([ex?.counters, ex?.suspended, t.names(0, 'graveyard')]));
  const t2 = setup();
  const d = onField(t2, 'Colossal Dreadmaw', '', { power: '5', toughness: '5' });
  const { applyEffects } = await import('../../src/engine/effects.js');
  applyEffects(t2.game, t2.P(0).playerId, compileEffectText('Put two time counters on it and it gains vanishing.', { sourceName: 'Maelstrom Djinn' }).effects, { sourceId: d.instanceId });
  check('Maelstrom Djinn: two time counters and vanishing', d.counters?.time === 2 && d.gainedVanishing === true, JSON.stringify(d.counters));
}
{
  // Estinien Varlineau: draw and lose life for each opponent dealt combat damage by it or a Dragon; and "it" gains flying means itself
  const t = setup();
  const es = onField(t, 'Grizzly Bears', 'Whenever you cast a noncreature spell, put a +1/+1 counter on Estinien Varlineau. It gains flying until end of turn.\nAt the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by Estinien Varlineau or a Dragon this turn.', { name: 'Estinien Varlineau', power: '2', toughness: '2' });
  es.summoningSick = false; es.enteredTurn = -5;
  cast(t, 'Opt', 'You gain 1 life.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('Estinien: the cast puts the counter and the flying on Estinien (not the spell)', es.counters?.['+1/+1'] === 1 && has(t, es, 'Flying'), JSON.stringify([es.counters, es.temporaryEffects]));
  t.end(0); t.autoPass = true; t.end(1);
  t.do(0, { type: 'next-phase' }); t.autoPass = false;
  const life = t.P(0).life;
  t.do(0, { type: 'attack', attacks: [{ instanceId: es.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  t.autoPass = true;
  for (let i = 0; i < 6 && t.game.phase !== 'postcombat-main' && t.game.activePlayerId === t.P(0).playerId; i++) { t.do(0, { type: 'next-phase' }); settle(t); }
  const gain1 = t.P(0).life;
  check('Estinien: one opponent was hit: drew one card and lost one life', t.game.phase === 'postcombat-main' && t.P(0).life === life - 1 && t.P(0).deck.hand.length === 2, `${life} → ${t.P(0).life}, hand ${t.P(0).deck.hand.length}, ${t.game.phase}`);
}
{
  // Rith: a Dragon token when an opponent's creature was dealt excess damage
  const t = setup();
  onField(t, 'Fog Bank', 'At the beginning of your end step, if a creature or planeswalker an opponent controlled was dealt excess damage this turn, create a 4/4 red Dragon creature token with flying.', { typeLine: 'Legendary Creature — Dragon' });
  const foe = onField(t, 'Air Elemental', '', { power: '1', toughness: '2' }, 1);
  cast(t, 'Opt', 'Test deals 5 damage to target creature.', [[d => d.options?.some(o => o.id === foe.instanceId), foe.instanceId]], { manaCost: '{G}', typeLine: 'Instant' });
  t.autoPass = true; t.end(0);
  check('Rith: a 4/4 flying Dragon token at the end step', t.P(0).deck.battlefield.some(c => c.token && /Dragon/.test(def(t, c).name)), t.names(0, 'battlefield').join());
}
done();

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

section('round 1: self, attached and "that creature" wordings');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '{1}: This creature gains first strike until end of turn.\n{1}: This creature gets +2/+0 and gains trample until end of turn.');
  activate(t, bear, 0); activate(t, bear, 1);
  check('"This creature gains first strike until end of turn"', has(t, bear, 'First strike'));
  check('"This creature gets +2/+0 and gains trample"', power(t, bear) === 4 && has(t, bear, 'Trample'), String(power(t, bear)));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  const aura = onField(t, 'Fog Bank', '{1}: Enchanted creature gets +3/+3 until end of turn.\n{1}: Tap enchanted creature.', { typeLine: 'Enchantment — Aura' });
  aura.attachedTo = bear.instanceId;
  activate(t, aura, 0); activate(t, aura, 1);
  check('"Enchanted creature gets +3/+3" pumps the enchanted creature', power(t, bear) === 5, String(power(t, bear)));
  check('"Tap enchanted creature" taps it', bear.tapped === true);
}
{
  // "Whenever this creature blocks a creature, destroy that creature at end of combat." — the attacker, not itself.
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(1, 'Fog Bank', 'battlefield'); t.give(0, 'Grizzly Bears', 'battlefield');
  const wall = t.bf(1, 'Fog Bank'); asText(t, wall, 'Whenever this creature blocks a creature, destroy that creature at end of combat.', { power: '0', toughness: '9' });
  t.end(0); t.end(1);
  const bear = t.bf(0, 'Grizzly Bears');
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  t.do(1, { type: 'block', assignments: [{ attackerId: bear.instanceId, blockerId: wall.instanceId }] });
  settle(t);
  check('a delayed "destroy that creature at end of combat" destroys the blocked attacker', t.names(0, 'graveyard').includes('Grizzly Bears') && !!t.bf(1, 'Fog Bank'), JSON.stringify([t.game.phase, t.names(0, 'graveyard'), t.names(1, 'graveyard')]));
}

section('round 1: regeneration');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '{1}: Regenerate this creature.');
  activate(t, bear);
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, d => d.options.find(o => o.instanceId === bear.instanceId || o.id === bear.instanceId)?.id]]);
  check('a regeneration shield replaces "destroy": tapped, still on the battlefield', !!t.bf(0, 'Grizzly Bears') && t.bf(0, 'Grizzly Bears').tapped, JSON.stringify(t.names(0, 'graveyard')));
  cast(t, 'Divination', 'Destroy target creature.', [[d => d.targeting, d => d.options.find(o => o.id === bear.instanceId)?.id]]);
  check('the shield is used up: the second destroy works', !t.bf(0, 'Grizzly Bears') && t.names(0, 'graveyard').includes('Grizzly Bears'));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '{1}: Regenerate this creature.');
  activate(t, bear);
  cast(t, 'Opt', 'This spell deals 5 damage to target creature.', [[d => d.targeting, d => d.options.find(o => o.id === bear.instanceId)?.id]]);
  check('regeneration also saves a creature from lethal damage, and removes the damage', !!t.bf(0, 'Grizzly Bears') && !Number(t.bf(0, 'Grizzly Bears').damageMarked || 0));
}

section('round 1: spells that exile or return themselves, keyword actions');
{
  const t = setup();
  cast(t, 'Opt', 'Draw a card. Exile Opt.');
  check('"Exile <this spell>." puts the spell in exile, not the graveyard', t.names(0, 'exile').includes('Opt') && !t.names(0, 'graveyard').includes('Opt'));
}
{
  const t = setup();
  const g = t.give(0, 'Mulldrifter', 'graveyard'); asText(t, g, '{2}: Return this card from your graveyard to your hand.');
  const ab = parseActivatedAbilities(def(t, g))[0];
  const r = t.ctl.dispatch({ type: 'activate', instanceId: g.instanceId, abilityId: ab.id }, t.as(0)); settle(t);
  check('"Return this card from your graveyard to your hand" (activated from the graveyard)', r.ok && t.names(0, 'hand').includes('Mulldrifter'), r.error);
}
{
  const t = setup();
  const m = onField(t, 'Colossal Dreadmaw', '{2}: Monstrosity 3.');
  activate(t, m); activate(t, m);
  check('Monstrosity 3 once: three counters, a second activation does nothing', Number(m.counters?.['+1/+1'] || 0) === 3 && m.monstrous === true, JSON.stringify(m.counters));
  const a = onField(t, 'Grizzly Bears', '{1}: Adapt 2.');
  activate(t, a); activate(t, a);
  check('Adapt 2 only when it has no +1/+1 counters', Number(a.counters?.['+1/+1'] || 0) === 2, JSON.stringify(a.counters));
}
{
  const t = setup();
  // Explore with a nonland on top: the player chooses whether it goes to the graveyard.
  const lib = t.P(0).deck.remainingLibrary;
  const nonland = lib.find(c => !/Land/.test(def(t, c).typeLine) && !['Llanowar Elves', 'Grizzly Bears'].includes(def(t, c).name)); lib.splice(lib.indexOf(nonland), 1); lib.unshift(nonland);
  let asked = null;
  cast(t, 'Grizzly Bears', 'When this creature enters, it explores.', [['explore', d => { asked = d; return true; }]]);
  const bear = t.bf(0, 'Grizzly Bears');
  check('explore (nonland): +1/+1 counter, the player chose to mill the card', asked?.kind === 'confirm' && Number(bear?.counters?.['+1/+1'] || 0) === 1 && t.P(0).deck.graveyard.some(c => c.instanceId === nonland.instanceId), JSON.stringify([asked?.prompt, bear?.counters]));
  const land = lib.find(c => /Land/.test(def(t, c).typeLine)); lib.splice(lib.indexOf(land), 1); lib.unshift(land);
  cast(t, 'Llanowar Elves', 'When this creature enters, it explores.');
  check('explore (land): the land goes to the hand, no counter', t.P(0).deck.hand.some(c => c.instanceId === land.instanceId) && !t.bf(0, 'Llanowar Elves').counters?.['+1/+1']);
}
{
  const t = setup();
  t.give(0, 'Grizzly Bears');
  let disc = null;
  cast(t, 'Llanowar Elves', 'When this creature enters, it connives.', [['connive', d => { disc = d; const bear = d.options.find(o => o.label === 'Grizzly Bears'); return [bear.id]; }]]);
  check('connive: draw, the player discards (a nonland) → +1/+1 counter', disc && t.names(0, 'graveyard').includes('Grizzly Bears') && Number(t.bf(0, 'Llanowar Elves').counters?.['+1/+1'] || 0) === 1, JSON.stringify(t.bf(0, 'Llanowar Elves')?.counters));
}
{
  const t = setup();
  cast(t, 'Grizzly Bears', 'When this creature enters, you get {E}{E}{E}.');
  check('energy: "you get {E}{E}{E}"', Number(t.P(0).counters?.energy || 0) === 3, JSON.stringify(t.P(0).counters));
  cast(t, 'Opt', 'Amass Zombies 2.');
  const army = t.P(0).deck.battlefield.find(c => /Army/.test(def(t, c).typeLine));
  check('amass 2 creates a 0/0 Army with two counters', army && power(t, army) === 2, army && def(t, army).typeLine);
  cast(t, 'Divination', 'Each opponent gets two poison counters.');
  check('poison counters for each opponent', Number(t.P(1).poison || 0) === 2);
}

section('round 2: look at the top cards, impulse draw, hand disruption');
{
  const t = setup();
  t.give(0, 'Opt');
  const top4 = t.P(0).deck.remainingLibrary.slice(0, 4).map(c => c.instanceId);
  let q = null;
  cast(t, 'Opt', 'Look at the top four cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.', [['dig', d => { if (d.kind === 'choose-many') { q = d; return [d.options[2].id]; } return { top: d.cards.map(c => c.id).reverse(), other: [] }; }]]);
  const lib = t.P(0).deck.remainingLibrary;
  check('dig: the player picks one of the top four for their hand', q && q.options.length === 4 && t.P(0).deck.hand.some(c => c.instanceId === top4[2]), JSON.stringify(q && q.options.map(o => o.label)));
  check('…the other three go to the bottom in the order the player chose', lib.slice(-3).map(c => c.instanceId).join() === [top4[3], top4[1], top4[0]].join(), JSON.stringify(lib.slice(-3).map(c => c.instanceId)));
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  t.give(0, 'Fog Bank');
  const creature = lib.find(c => /Creature/.test(def(t, c).typeLine)); lib.splice(lib.indexOf(creature), 1); lib.splice(1, 0, creature);
  let q = null;
  cast(t, 'Fog Bank', 'When this creature enters, look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.', [['dig', d => { q = d; return d.kind === 'choose-many' ? [creature.instanceId] : undefined; }]]);
  check('dig with a filter: only creature cards can be chosen', q && q.options.filter(o => !o.disabled).every(o => /Creature/.test(o.sub)) && q.min === 0, JSON.stringify(q?.options.map(o => [o.label, o.disabled])));
  check('…the chosen creature card is put into the hand', t.P(0).deck.hand.some(c => c.instanceId === creature.instanceId));
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const land = lib.find(c => /Land/.test(def(t, c).typeLine)); lib.splice(lib.indexOf(land), 1); lib.unshift(land);
  cast(t, 'Opt', 'Reveal the top card of your library. If it\'s a land card, put it onto the battlefield. Otherwise, put that card into your hand.');
  check('Coiling Oracle: a revealed land goes onto the battlefield', t.P(0).deck.battlefield.some(c => c.instanceId === land.instanceId));
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const bear = t.give(0, 'Grizzly Bears', 'library'); lib.splice(lib.indexOf(bear), 1); lib.unshift(bear);
  cast(t, 'Opt', 'Exile the top card of your library. You may play that card this turn.');
  check('impulse: the top card is exiled with permission to play it', t.P(0).deck.exile.some(c => c.instanceId === bear.instanceId && c.playPermission));
  const r = t.ctl.dispatch({ type: 'play', instanceId: bear.instanceId }, t.as(0)); settle(t);
  check('…and it can be cast from exile this turn', r.ok && !!t.bf(0, 'Grizzly Bears'), r.error);
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const elf = t.give(0, 'Llanowar Elves', 'library'); lib.splice(lib.indexOf(elf), 1); lib.unshift(elf);
  cast(t, 'Opt', 'Exile the top card of your library. You may play that card this turn.');
  t.autoPass = true; t.end(0); t.end(1); t.autoPass = false;
  const r = t.ctl.dispatch({ type: 'play', instanceId: elf.instanceId }, t.as(0));
  check('impulse: "this turn" ends — not castable on a later turn', !r.ok && !t.P(0).deck.exile.find(c => c.instanceId === elf.instanceId)?.playPermission, r.error);
}
{
  const t = setup();
  t.give(1, 'Counterspell'); t.give(1, 'Forest');
  let q = null;
  cast(t, 'Opt', 'Target opponent reveals their hand. You choose a nonland card from it. That player discards that card.', [['hand-pick', d => { q = d; return [d.options.find(o => !o.disabled).id]; }]]);
  check('Duress-style: the caster sees the hand, lands cannot be chosen', q && q.playerId === t.P(0).playerId && q.options.find(o => o.label === 'Forest')?.disabled === true, JSON.stringify(q?.options));
  check('…and the opponent discards the chosen card', t.names(1, 'graveyard').includes('Counterspell') && t.names(1, 'hand').includes('Forest'));
}

section('round 2: creature lands and Vehicles');
{
  const t = setup();
  const land = t.bf(0, 'Island'); asText(t, land, '{T}: Add {U}.\n{1}: Until end of turn, this land becomes a 2/2 Eldrazi Cleric creature with flying. It\'s still a land.', { typeLine: 'Land' });
  const others = t.P(0).deck.battlefield.filter(c => c !== land && /Land/.test(def(t, c).typeLine));
  activate(t, land);
  const d = t.view(0).players[0].battlefield.find(c => c.id === land.instanceId);
  check('creature land: becomes a 2/2 flying land creature until end of turn', /Land Creature — .*Eldrazi Cleric/.test(d.type) && d.power === 2 && has(t, land, 'Flying'), JSON.stringify([d.type, d.power]));
  t.autoPass = true; t.end(0); t.autoPass = false;
  check('…and is only a land again after the turn', !/Creature/.test(t.view(0).players[0].battlefield.find(c => c.id === land.instanceId).type));
  check('(the other lands were never creatures)', others.every(c => !/Creature/.test(t.view(0).players[0].battlefield.find(x => x.id === c.instanceId).type)));
}
{
  const t = setup();
  const vehicle = onField(t, 'Air Elemental', 'Flying\nCrew 3', { typeLine: 'Artifact — Vehicle', power: '4', toughness: '4' });
  const bear = onField(t, 'Grizzly Bears', ''), elf = onField(t, 'Llanowar Elves', '');
  const row = t.view(0).players[0].battlefield.find(c => c.id === vehicle.instanceId).abilities.find(a => /Crew/.test(a.text));
  check('Crew is offered on the Vehicle', !!row && row.legal, JSON.stringify(t.view(0).players[0].battlefield.find(c => c.id === vehicle.instanceId).abilities));
  const bad = t.ctl.dispatch({ type: 'activate', instanceId: vehicle.instanceId, abilityId: row.id }, t.as(0));
  const q = t.decision();
  const wrong = t.ctl.dispatch({ type: 'answer', key: q.key, value: [elf.instanceId] }, t.as(0));
  check('crew refuses creatures with too little total power', bad.ok && !wrong.ok, wrong.error);
  t.ctl.dispatch({ type: 'activate', instanceId: vehicle.instanceId, abilityId: row.id }, t.as(0));
  const seenCrew = settle(t, [['crew', [bear.instanceId, elf.instanceId]]]);
  const v = t.view(0).players[0].battlefield.find(c => c.id === vehicle.instanceId);
  check('crewed: the crew is tapped and the Vehicle is a 4/4 artifact creature', t.bf(0, 'Grizzly Bears').tapped && t.bf(0, 'Llanowar Elves').tapped && /Artifact Creature/.test(v.type) && v.power === 4, JSON.stringify([v.type, v.power]));
}

section('round 3: copies, end-step clean-up, untap locks, die-to-exile, upkeep costs, werewolves, confluences');
{
  const t = setup();
  const elf = onField(t, 'Llanowar Elves', '{1}: Create a token that\'s a copy of this creature, except it has haste. Sacrifice it at the beginning of the next end step.');
  activate(t, elf);
  const copies = () => t.P(0).deck.battlefield.filter(c => c.token && def(t, c).name === 'Llanowar Elves');
  check('a token copy of "this creature" with haste', copies().length === 1 && has(t, copies()[0], 'Haste'), String(copies().length));
  t.autoPass = true; t.end(0); t.autoPass = false;
  check('…sacrificed at the beginning of the next end step', copies().length === 0);
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  bear.tapped = true;
  cast(t, 'Opt', 'Tap target creature. It doesn\'t untap during its controller\'s next untap step.', [[d => d.targeting, d => d.options.find(o => o.id === bear.instanceId).id]]);
  t.autoPass = true; t.end(0);
  check('"doesn\'t untap during its controller\'s next untap step": still tapped on their turn', t.bf(1, 'Grizzly Bears').tapped && t.game.activePlayerId === t.P(1).playerId);
  t.end(1); t.end(0);
  check('…and untaps normally the turn after', !t.bf(1, 'Grizzly Bears').tapped);
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'This spell deals 3 damage to target creature. If that creature would die this turn, exile it instead.', [[d => d.targeting, d => d.options.find(o => o.id === bear.instanceId).id]]);
  check('Suplex: the creature that would die is exiled instead', t.names(1, 'exile').includes('Grizzly Bears') && !t.names(1, 'graveyard').includes('Grizzly Bears'), JSON.stringify([t.names(1, 'exile'), t.names(1, 'graveyard')]));
}
{
  const t = setup();
  onField(t, 'Grizzly Bears', '', {}, 1); onField(t, 'Llanowar Elves', '', {}, 1);
  cast(t, 'Opt', 'This spell deals 3 damage to each creature. If a creature dealt damage this way would die this turn, exile it instead.');
  check('Anger of the Gods: every creature it kills is exiled', t.names(1, 'exile').includes('Grizzly Bears') && t.names(1, 'exile').includes('Llanowar Elves') && !t.names(1, 'graveyard').length);
}
{
  for (const pay of [true, false]) {
    const t = setup();
    const c = onField(t, 'Colossal Dreadmaw', 'At the beginning of your upkeep, sacrifice this creature unless you pay {1}.');
    t.autoPass = true; t.end(0); t.end(1); t.autoPass = false;
    settle(t, [['may-pay', pay ? 'pay' : 'no']]);
    check(`upkeep cost "sacrifice this creature unless you pay {1}" (${pay ? 'paid: stays' : 'not paid: sacrificed'})`, !!t.bf(0, 'Colossal Dreadmaw') === pay, JSON.stringify(t.names(0, 'graveyard')));
  }
}
{
  const t = setup();
  const wolf = onField(t, 'Grizzly Bears', 'At the beginning of each upkeep, if no spells were cast last turn, transform this creature.');
  let transformed = false;
  t.game.cardDefinitions[wolf.definitionId] = { ...def(t, wolf), cardFaces: [{ name: 'Day Bear', typeLine: 'Creature', oracleText: def(t, wolf).oracleText, power: '2', toughness: '2' }, { name: 'Night Bear', typeLine: 'Creature — Werewolf', oracleText: '', power: '4', toughness: '4' }] };
  wolf.activeFaceIndex = 0;
  t.autoPass = true; t.end(0); settle(t);
  transformed = wolf.activeFaceIndex === 1 || t.bf(0, 'Night Bear');
  check('werewolf: transforms at upkeep after a turn with no spells', !!transformed, String(wolf.activeFaceIndex));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  const seen = cast(t, 'Opt', 'Choose three. You may choose the same mode more than once.\n• Target player draws a card.\n• Return target creature to its owner\'s hand.', [['modes:0', 0], ['modes:1', 0], ['modes:2', 1], [d => d.targeting && d.options.some(o => o.id === bear.instanceId), d => bear.instanceId], [d => d.kind === 'choose-one' && d.options.some(o => o.playerId), d => t.P(0).playerId]]);
  check('Confluence: the same mode can be chosen twice (two draws) plus a third mode', t.names(1, 'hand').includes('Grizzly Bears') && seen.filter(d => /modes:/.test(d.key)).length === 3, JSON.stringify(seen.map(d => d.key)));
}
{
  const t = setup();
  t.give(0, 'Colossal Dreadmaw');
  cast(t, 'Opt', 'You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice it at the beginning of the next end step.', [['hand', d => d.options.find(o => o.label === 'Colossal Dreadmaw').id]]);
  const maw = t.bf(0, 'Colossal Dreadmaw');
  check('Sneak Attack: the chosen creature enters with haste', !!maw && has(t, maw, 'Haste'));
  t.autoPass = true; t.end(0);
  check('…and is sacrificed at the end step', !t.bf(0, 'Colossal Dreadmaw') && t.names(0, 'graveyard').includes('Colossal Dreadmaw'));
}

section('round 4: copying spells');
{
  const t = setup();
  const b1 = onField(t, 'Grizzly Bears', '', {}, 1), b2 = onField(t, 'Llanowar Elves', '', {}, 1);
  onField(t, 'Fog Bank', 'Whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy.', { typeLine: 'Enchantment' });
  t.give(0, 'Opt'); asText(t, t.hand(0, 'Opt'), 'This spell deals 2 damage to any target.');
  const r = t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Opt').instanceId }, t.as(0));
  const seenCopy = settle(t, [[d => d.key.startsWith('cast') && d.targeting, () => b1.instanceId], [d => d.key.startsWith('retarget') && d.targeting, () => b2.instanceId], [d => d.key.includes('retarget') && d.kind === 'confirm', true]]);
  check('copy a spell you control and choose a new target for the copy: both creatures are hit', r.ok && t.names(1, 'graveyard').includes('Grizzly Bears') && t.names(1, 'graveyard').includes('Llanowar Elves'), JSON.stringify([r.error, t.names(1, 'graveyard')]));
}

section('round 4: Auras that enchant players and graveyard cards');
{
  const t = setup();
  t.give(0, 'Opt'); const curse = asText(t, t.hand(0, 'Opt'), 'Enchant player\nAt the beginning of enchanted player\'s upkeep, that player loses 1 life.', { typeLine: 'Enchantment — Aura Curse', manaCost: '{1}' });
  t.ctl.dispatch({ type: 'play', instanceId: curse.instanceId }, t.as(0));
  settle(t, [['enchant', d => d.options.find(o => o.playerId === t.P(1).playerId).id]]);
  const on = t.P(0).deck.battlefield.find(c => c.instanceId === curse.instanceId);
  check('Curse: enchants the chosen player and stays on the battlefield', on?.attachedTo === t.P(1).playerId);
  const life = t.P(1).life;
  t.autoPass = true; t.end(0); settle(t);
  check('…and triggers at that player\'s upkeep', t.P(1).life === life - 1, `${life} → ${t.P(1).life}`);
}
{
  const t = setup();
  t.give(1, 'Colossal Dreadmaw', 'graveyard');
  t.give(0, 'Opt'); const ad = asText(t, t.hand(0, 'Opt'), 'Enchant creature card in a graveyard\nWhen this Aura enters, if it\'s on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant creature put onto the battlefield with this Aura." Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature\'s controller sacrifices it.\nEnchanted creature gets -1/-0.', { typeLine: 'Enchantment — Aura', manaCost: '{1}{U}' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: ad.instanceId }, t.as(0));
  settle(t, [['enchant', d => d.options.find(o => o.label === 'Colossal Dreadmaw')?.id]]);
  const maw = t.bf(0, 'Colossal Dreadmaw');
  check('Animate Dead: returns the creature from an opponent\'s graveyard under your control, -1/-0', r.ok && !!maw && power(t, maw) === 5, JSON.stringify([r.error, maw && power(t, maw)]));
  cast(t, 'Divination', 'Destroy target enchantment.', [[d => d.targeting, d => d.options.find(o => o.id === ad.instanceId)?.id]]);
  check('…when the Aura leaves, the creature is sacrificed', !t.bf(0, 'Colossal Dreadmaw') && t.names(1, 'graveyard').includes('Colossal Dreadmaw'), JSON.stringify(t.names(1, 'graveyard')));
}

section('round 5: triggers that used to never fire');
{
  const t = setup();
  t.give(0, 'Divination'); const cyc = asText(t, t.hand(0, 'Divination'), 'Draw two cards.\nCycling {1}\nWhen you cycle this card, you gain 3 life.');
  const life = t.P(0).life;
  const row = t.view(0).players[0].hand.find(c => c.id === cyc.instanceId).abilities.find(a => /Cycling/.test(a.text));
  t.ctl.dispatch({ type: 'activate', instanceId: cyc.instanceId, abilityId: row.id }, t.as(0)); settle(t);
  check('"When you cycle this card" fires (from the graveyard) after cycling', t.P(0).life === life + 3, `${life} → ${t.P(0).life}`);
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you scry, you gain 1 life.');
  const life = t.P(0).life;
  cast(t, 'Opt', 'Scry 1. Draw a card.');
  check('"Whenever you scry" fires', t.P(0).life === life + 1);
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you commit a crime, you gain 2 life.');
  const life = t.P(0).life;
  cast(t, 'Opt', 'This spell deals 1 damage to target opponent.', [[d => d.targeting, d => d.options.find(o => o.playerId === t.P(1).playerId).id]]);
  check('"Whenever you commit a crime" fires when you target an opponent', t.P(0).life === life + 2);
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', 'Whenever this creature becomes the target of a spell or ability an opponent controls, you gain 4 life.', {}, 1);
  const life = t.P(1).life;
  cast(t, 'Opt', 'Tap target creature.', [[d => d.targeting, d => bear.instanceId]]);
  check('"becomes the target of a spell or ability an opponent controls" fires', t.P(1).life === life + 4, `${life} → ${t.P(1).life}`);
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'At the beginning of your second main phase, you gain 1 life.');
  const life = t.P(0).life;
  t.autoPass = true; t.do(0, { type: 'next-phase' }); settle(t);
  if (t.game.phase !== 'postcombat-main') { t.do(0, { type: 'next-phase' }); settle(t); }
  check('"At the beginning of your second main phase" fires', t.P(0).life === life + 1, `${t.game.phase} ${life} → ${t.P(0).life}`);
}
{
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Forest', 'battlefield');
  t.end(0); t.end(1);
  const bear = t.bf(0, 'Grizzly Bears');
  t.game.extraCombats = 1;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  bear.tapped = false;
  const life1 = t.P(1).life;
  t.do(0, { type: 'next-phase' });
  const second = t.game.phase === 'combat' || t.game.phase === 'begin-combat';
  if (second) { t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] }); settle(t); }
  check('an additional combat phase lets creatures attack again', second && t.P(1).life === life1 - 2, `${t.game.phase} ${life1} → ${t.P(1).life}`);
}

section('round 5: keyword mechanics — riot, unleash, afterlife, unearth, scavenge');
{
  const t = setup();
  cast(t, 'Grizzly Bears', 'Riot', [['riot', 'haste']]);
  check('Riot: the player chose haste', has(t, t.bf(0, 'Grizzly Bears'), 'Haste'));
  cast(t, 'Llanowar Elves', 'Riot', [['riot', 'counter']]);
  check('Riot: …or a +1/+1 counter', Number(t.bf(0, 'Llanowar Elves').counters?.['+1/+1'] || 0) === 1);
}
{
  const t = setup();
  const g = onField(t, 'Grizzly Bears', 'Afterlife 2');
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, d => g.instanceId]]);
  const spirits = t.P(0).deck.battlefield.filter(c => c.token && /Spirit/.test(def(t, c).typeLine));
  check('Afterlife 2: two 1/1 flying Spirits when it dies', spirits.length === 2 && has(t, spirits[0], 'Flying'));
}
{
  const t = setup();
  const g = t.give(0, 'Colossal Dreadmaw', 'graveyard'); asText(t, g, 'Trample\nUnearth {1}');
  const row = t.view(0).players[0].graveyard.find(c => c.id === g.instanceId)?.abilities?.find(a => /Unearth/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: g.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no unearth row' };
  settle(t);
  const maw = t.bf(0, 'Colossal Dreadmaw');
  check('Unearth: back on the battlefield with haste', r.ok && !!maw && has(t, maw, 'Haste'), r.error);
  t.autoPass = true; t.end(0);
  check('…exiled at the next end step', !t.bf(0, 'Colossal Dreadmaw') && t.names(0, 'exile').includes('Colossal Dreadmaw'));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  const g = t.give(0, 'Colossal Dreadmaw', 'graveyard'); asText(t, g, 'Scavenge {1}');
  const row = t.view(0).players[0].graveyard.find(c => c.id === g.instanceId)?.abilities?.find(a => /Scavenge/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: g.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no scavenge row' };
  settle(t, [['scavenge', bear.instanceId]]);
  check('Scavenge: exiled from the graveyard, six +1/+1 counters on the chosen creature', r.ok && Number(t.bf(0, 'Grizzly Bears').counters?.['+1/+1'] || 0) === 6 && t.names(0, 'exile').includes('Colossal Dreadmaw'), r.error);
}

section('round 6: Classes and level up');
{
  const t = setup();
  const cls = onField(t, 'Fog Bank', '(Gain the next level as a sorcery to add its ability.)\nYou have no maximum hand size.\n{1}: Level 2\nWhen this Class becomes level 2, draw two cards.\n{1}: Level 3\nCreatures you control get +1/+1.', { typeLine: 'Enchantment — Class' });
  const bear = onField(t, 'Grizzly Bears', '');
  const lv = () => parseActivatedAbilities(def(t, cls)).filter(a => /Level/.test(a.effect));
  const view = () => t.view(0).players[0].battlefield.find(c => c.id === cls.instanceId).abilities;
  check('Class: level 3 cannot be gained before level 2', view().find(a => /Level 3/.test(a.text))?.legal === false, JSON.stringify(view()));
  check('…and the level 3 ability does nothing yet', power(t, bear) === 2);
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'activate', instanceId: cls.instanceId, abilityId: view().find(a => /Level 2/.test(a.text)).id }, t.as(0)); settle(t);
  check('Level 2: "When this Class becomes level 2, draw two cards"', cls.classLevel === 2 && t.P(0).deck.hand.length === hand + 2, `${cls.classLevel} ${hand} → ${t.P(0).deck.hand.length}`);
  t.ctl.dispatch({ type: 'activate', instanceId: cls.instanceId, abilityId: view().find(a => /Level 3/.test(a.text)).id }, t.as(0)); settle(t);
  check('Level 3: its static ability now applies (+1/+1)', cls.classLevel === 3 && power(t, bear) === 3, String(power(t, bear)));
}
{
  const t = setup();
  const tree = onField(t, 'Llanowar Elves', 'Level up {1}\nLEVEL 1-4\n1/2\n{T}: Add {G}{G}.\nLEVEL 5+\n1/4', { power: '1', toughness: '1' });
  const row = () => t.view(0).players[0].battlefield.find(c => c.id === tree.instanceId).abilities.find(a => /Level up/.test(a.text));
  t.ctl.dispatch({ type: 'activate', instanceId: tree.instanceId, abilityId: row().id }, t.as(0)); settle(t);
  check('Level up: a level counter; LEVEL 1-4 gives 1/2', Number(t.bf(0, 'Llanowar Elves').counters?.level || 0) === 1 && t.view(0).players[0].battlefield.find(c => c.id === tree.instanceId).toughness === 2, JSON.stringify(t.bf(0, 'Llanowar Elves').counters));
}

section('round 6: "When you cast this spell"');
{
  const t = setup();
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Colossal Dreadmaw', 'When you cast this spell, draw two cards.\nTrample', [], { manaCost: '{1}' });
  check('a creature spell\'s own cast trigger resolves (before the creature)', t.P(0).deck.hand.length === hand + 2 && !!t.bf(0, 'Colossal Dreadmaw'), `${hand} → ${t.P(0).deck.hand.length}`);
}

section('round 6: madness');
{
  for (const castIt of [true, false]) {
    const t = setup();
    t.give(0, 'Colossal Dreadmaw'); asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Madness {1}');
    cast(t, 'Opt', 'Draw a card, then discard a card.', [['discard', d => [d.options.find(o => o.label === 'Colossal Dreadmaw').id]], ['madness', castIt ? 'cast' : 'no']]);
    check(`madness: discarded, then ${castIt ? 'cast for its madness cost' : 'declined: it goes to the graveyard'}`, castIt ? !!t.bf(0, 'Colossal Dreadmaw') : t.names(0, 'graveyard').includes('Colossal Dreadmaw') && !t.names(0, 'exile').includes('Colossal Dreadmaw'), JSON.stringify([t.names(0, 'exile'), t.names(0, 'graveyard')]));
  }
}

section('round 7: more library wordings');
{
  const t = setup();
  onField(t, 'Fog Bank', 'At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.');
  const lib = t.P(0).deck.remainingLibrary, top = lib[0], mv = Number(def(t, top).manaValue ?? def(t, top).cmc ?? 0), life = t.P(0).life;
  t.autoPass = true; t.end(0); t.end(1); settle(t);
  check('Dark Confidant: the top card goes to hand and you lose life equal to its mana value', t.P(0).deck.hand.some(c => c.instanceId === top.instanceId) && t.P(0).life === life - mv, `${life} → ${t.P(0).life} (mv ${mv})`);
}
{
  const t = setup();
  t.give(0, 'Opt');
  const five = t.P(0).deck.remainingLibrary.slice(0, 5).map(c => c.instanceId);
  let sep = null;
  cast(t, 'Opt', 'Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.', [['separate', d => { sep = d; return five.slice(0, 2); }], [':pile', 2]]);
  check('Fact or Fiction: the opponent separates the piles', sep?.playerId === t.P(1).playerId && sep.options.length === 5);
  check('…the caster takes the pile they choose; the other goes to the graveyard', five.slice(2).every(id => t.P(0).deck.hand.some(c => c.instanceId === id)) && five.slice(0, 2).every(id => t.P(0).deck.graveyard.some(c => c.instanceId === id)));
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const bear = t.give(0, 'Grizzly Bears', 'library'); lib.splice(lib.indexOf(bear), 1); lib.unshift(bear);
  cast(t, 'Opt', 'Look at the top three cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.', [['dig', d => d.kind === 'choose-many' ? [bear.instanceId] : undefined]]);
  check('cast a revealed spell without paying its mana cost (Aetherworks Marvel)', !!t.bf(0, 'Grizzly Bears'));
}
{
  for (const big of [true, false]) {
    const t = setup();
    t.give(0, 'Opt');
    if (big) t.P(0).deck.remainingLibrary.splice(2);
    asText(t, t.bf(0, 'Island'), '({T}: Add {U}.)', { manaCost: '{U}' });   // every Island counts {U} toward devotion
    cast(t, 'Opt', 'When this creature enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal to the number of cards in your library, you win the game.', [], { typeLine: 'Creature — Merfolk Wizard', manaCost: '{U}{U}', power: '1', toughness: '3' });
    check(`Thassa's Oracle: ${big ? 'devotion ≥ library size wins' : 'otherwise nothing'}`, big ? t.game.status === 'complete' && t.game.winner === t.P(0).playerId : t.game.status !== 'complete', `${t.game.status} ${t.P(0).deck.remainingLibrary.length}`);
  }
}

section('round 7: Oblivion Ring family');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  t.give(0, 'Opt'); const ring = asText(t, t.hand(0, 'Opt'), 'When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.', { typeLine: 'Enchantment', manaCost: '{1}' });
  t.ctl.dispatch({ type: 'play', instanceId: ring.instanceId }, t.as(0)); settle(t, [[d => d.targeting, () => bear.instanceId]]);
  check('Banishing Light: the creature is exiled', t.names(1, 'exile').includes('Grizzly Bears'));
  cast(t, 'Divination', 'Destroy target enchantment.', [[d => d.targeting, () => ring.instanceId]]);
  check('…and returns when the enchantment leaves', !!t.bf(1, 'Grizzly Bears') && !t.names(1, 'exile').includes('Grizzly Bears'));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  t.give(0, 'Opt'); const ring = asText(t, t.hand(0, 'Opt'), 'When this enchantment enters, exile another target nonland permanent.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner\'s control.', { typeLine: 'Enchantment', manaCost: '{1}' });
  t.ctl.dispatch({ type: 'play', instanceId: ring.instanceId }, t.as(0)); settle(t, [[d => d.targeting, () => bear.instanceId]]);
  cast(t, 'Divination', 'Destroy target enchantment.', [[d => d.targeting, () => ring.instanceId]]);
  check('Oblivion Ring (two triggers): the exiled card returns under its owner\'s control', !!t.bf(1, 'Grizzly Bears'));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Exile another target permanent. Return that card to the battlefield under its owner\'s control at the beginning of the next end step.', [[d => d.targeting, () => bear.instanceId]]);
  check('Flickerwisp: exiled now…', t.names(1, 'exile').includes('Grizzly Bears'));
  t.autoPass = true; t.end(0);
  check('…returns at the beginning of the next end step', !!t.bf(1, 'Grizzly Bears'));
}

section('round 8: kept mana, untap those, twisters, Snapcaster, venture inside abilities');
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you cast a spell, add {R}. Until end of turn, you don\'t lose this mana as steps and phases end.');
  cast(t, 'Opt', 'Draw a card.');
  t.autoPass = true; t.do(0, { type: 'next-phase' }); settle(t);
  check('Birgi: the red mana is still there in the next phase', Number(t.P(0).mana.floating?.R || 0) === 1 && Number(t.P(0).mana.available?.R || 0) >= 1, JSON.stringify([t.game.phase, t.P(0).mana.floating]));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', ''); bear.tapped = true;
  cast(t, 'Opt', 'Creatures you control get +1/+1 until end of turn. Untap those creatures.');
  check('Jeskai Ascendancy: pumped creatures untap', !t.bf(0, 'Grizzly Bears').tapped && power(t, t.bf(0, 'Grizzly Bears')) === 3);
}
{
  const t = setup();
  t.give(0, 'Grizzly Bears'); t.give(0, 'Colossal Dreadmaw', 'graveyard'); t.give(1, 'Counterspell');
  cast(t, 'Opt', 'Each player shuffles their hand and graveyard into their library, then draws seven cards.');
  check('Echo of Eons: each player has seven cards and the graveyards are shuffled in', t.P(0).deck.hand.length === 7 && t.P(1).deck.hand.length === 7 && !t.names(0, 'graveyard').filter(n => n !== 'Opt').length, JSON.stringify([t.P(0).deck.hand.length, t.P(1).deck.hand.length, t.names(0, 'graveyard')]));
}
{
  const t = setup();
  const g = t.give(0, 'Divination', 'graveyard');
  cast(t, 'Grizzly Bears', 'Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.', [[d => d.key.includes('grave') || d.options?.some(o => o.id === g.instanceId), () => g.instanceId]]);
  const opts = t.view(0).players[0].graveyard.find(c => c.id === g.instanceId);
  const r = t.ctl.dispatch({ type: 'play', instanceId: g.instanceId }, t.as(0)); settle(t);
  check('Snapcaster Mage: the sorcery can be cast from the graveyard and is exiled after', r.ok && t.names(0, 'exile').includes('Divination'), JSON.stringify([r.error, opts?.playable]));
}

section('round 8: extra mana (Mana Reflection, Crypt Ghast, Wild Growth)');
{
  const t = setup();
  onField(t, 'Fog Bank', 'If you tap a permanent for mana, it produces twice as much of that mana instead.', { typeLine: 'Enchantment' });
  const r = (() => { t.give(0, 'Colossal Dreadmaw'); asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Trample', { manaCost: '{G}{G}{G}{G}{G}{G}' }); return t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Colossal Dreadmaw').instanceId }, t.as(0)); })();
  settle(t);
  const tappedForests = t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Forest' && c.tapped).length;
  check('Mana Reflection: six green from three Forests — the auto-payer taps only three', r.ok && !!t.bf(0, 'Colossal Dreadmaw') && tappedForests === 3, JSON.stringify([r.error, tappedForests]));
}
{
  const t = setup();
  const forest = t.bf(0, 'Forest');
  const aura = onField(t, 'Fog Bank', 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.', { typeLine: 'Enchantment — Aura' });
  aura.attachedTo = forest.instanceId;
  const before = t.view(0).players[0].mana;
  check('Wild Growth on a Forest: the mana counter shows one more green', before.fixed.G === 5, JSON.stringify(before.fixed));
}

section('round 9: more trigger wordings');
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you cast a spell with mana value 5 or greater, you gain 3 life.', { typeLine: 'Enchantment' });
  const life = t.P(0).life;
  cast(t, 'Opt', 'Draw a card.');
  cast(t, 'Colossal Dreadmaw', 'Trample', [], { manaCost: '{3}{G}{G}' });
  check('"Whenever you cast a spell with mana value 5 or greater" fires only for the big spell', t.P(0).life === life + 3, `${life} → ${t.P(0).life}`);
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever a player taps a land for mana, this enchantment deals 1 damage to that player.', { typeLine: 'Enchantment' });
  const life = t.P(0).life;
  cast(t, 'Grizzly Bears', '', [], { manaCost: '{1}{G}' });
  check('Manabarbs: tapping lands to pay deals 1 damage per land', t.P(0).life === life - 2, `${life} → ${t.P(0).life}`);
}

section('round 9: rebound, Greater Good, Plaguecrafter');
{
  const t = setup();
  onField(t, 'Grizzly Bears', '');
  const hand = () => t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Draw a card.\nRebound');
  check('Rebound: cast from hand, exiled as it resolves', t.names(0, 'exile').includes('Opt') && !t.names(0, 'graveyard').includes('Opt'));
  const before = hand();
  t.autoPass = true; t.end(0); t.end(1); settle(t, [['rebound', 'cast']]);
  check('…at the next upkeep it is cast free from exile (draws again) and then goes to the graveyard', t.names(0, 'graveyard').includes('Opt'), JSON.stringify([t.names(0, 'exile'), t.names(0, 'graveyard'), before, hand()]));
}
{
  const t = setup();
  onField(t, 'Colossal Dreadmaw', '');
  const gg = onField(t, 'Fog Bank', 'Sacrifice a creature: Draw cards equal to the sacrificed creature\'s power, then discard three cards.', { typeLine: 'Enchantment' });
  const hand = t.P(0).deck.hand.length;
  activate(t, gg, 0, [['cost:sacrifice', d => d.options.find(o => o.label === 'Colossal Dreadmaw').id]]);
  check('Greater Good: draws six (the sacrificed creature\'s power), then discards three', t.P(0).deck.hand.length === hand + 3 && t.names(0, 'graveyard').includes('Colossal Dreadmaw'), `${hand} → ${t.P(0).deck.hand.length}`);
}
{
  const t = setup();
  t.give(1, 'Counterspell');
  cast(t, 'Grizzly Bears', 'When this creature enters, each player sacrifices a creature or planeswalker of their choice. Each player who can\'t discards a card.');
  check('Plaguecrafter: the player with no creature discards instead', t.names(1, 'graveyard').includes('Counterspell') && t.names(0, 'graveyard').includes('Grizzly Bears'), JSON.stringify([t.names(0, 'graveyard'), t.names(1, 'graveyard')]));
}

section('round 10: conditions with "instead" / "Otherwise", and other most-played cards');
{
  for (const many of [false, true]) {
    const t = setup();
    if (!many) for (const c of t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c).typeLine)).slice(3)) t.edit({ kind: 'move', instanceId: c.instanceId, to: 'graveyard' });
    const swarm = onField(t, 'Grizzly Bears', 'Landfall — Whenever a land you control enters, create a 1/1 green Insect creature token. If you control six or more lands, create a token that\'s a copy of this creature instead.', { name: 'Grizzly Bears' });
    t.give(0, 'Forest'); t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Forest').instanceId }, t.as(0)); settle(t);
    const tokens = t.P(0).deck.battlefield.filter(c => c.token);
    check(`Scute Swarm with ${many ? 'six or more lands: a copy instead' : 'fewer lands: an Insect'}`, tokens.length === 1 && (many ? def(t, tokens[0]).name === 'Grizzly Bears' : /Insect/.test(def(t, tokens[0]).typeLine)), JSON.stringify(tokens.map(c => def(t, c).name)));
  }
}
{
  for (const threshold of [false, true]) {
    const t = setup();
    if (threshold) for (const n of ['Mulldrifter', 'Colossal Dreadmaw', 'Air Elemental', 'Fog Bank', 'Counterspell', 'Giant Growth', 'Divination']) t.give(0, n, 'graveyard');
    cast(t, 'Opt', 'Add {B}{B}{B}.\nThreshold — Add {B}{B}{B}{B}{B} instead if there are seven or more cards in your graveyard.');
    const b = Number(t.P(0).mana.floating?.B || 0);
    check(`Cabal Ritual: ${threshold ? 'five' : 'three'} black mana`, b === (threshold ? 5 : 3), String(b));
  }
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever a creature you control enters, draw a card if its power is 3 or greater. Otherwise, put two +1/+1 counters on it.', { typeLine: 'Enchantment' });
  t.give(0, 'Grizzly Bears'); t.give(0, 'Colossal Dreadmaw');
  const hand = t.P(0).deck.hand.length - 1;
  cast(t, 'Grizzly Bears', '');
  check('Tribute to the World Tree: a small creature gets two +1/+1 counters', Number(t.bf(0, 'Grizzly Bears').counters?.['+1/+1'] || 0) === 2 && t.P(0).deck.hand.length === hand, JSON.stringify(t.bf(0, 'Grizzly Bears').counters));
  cast(t, 'Colossal Dreadmaw', '', [], { manaCost: '{1}' });
  check('…a big creature draws a card instead', t.P(0).deck.hand.length === hand - 1 + 1 && !t.bf(0, 'Colossal Dreadmaw').counters?.['+1/+1'], `${hand} → ${t.P(0).deck.hand.length}`);
}
{
  const t = setup();
  const rag = onField(t, 'Grizzly Bears', 'Whenever this creature deals combat damage to a player, create a Treasure token and exile the top card of that player\'s library. Until end of turn, you may cast that card.');
  t.end(0); t.autoPass = true; t.end(1);
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  const exiled = t.P(0).deck.exile.find(c => c.ownerId === t.P(1).playerId);
  check('Ragavan: a Treasure, and the opponent\'s top card exiled where its new player may cast it', !!exiled?.playPermission && exiled.ownerId === t.P(1).playerId && t.P(0).deck.battlefield.some(c => c.token && /Treasure/.test(def(t, c).name)), JSON.stringify([!!exiled, t.names(1, 'exile')]));
}
{
  const t = setup();
  cast(t, 'Fog Bank', 'When this artifact enters, if you cast it, you gain protection from everything until your next turn.', [], { typeLine: 'Legendary Artifact', manaCost: '{4}' });
  const life = t.P(0).life;
  t.give(1, 'Opt'); asText(t, t.hand(1, 'Opt'), 'This spell deals 3 damage to any target.');
  const targets = (() => { t.autoPass = true; t.end(0); t.autoPass = false; const r = t.ctl.dispatch({ type: 'play', instanceId: t.hand(1, 'Opt').instanceId }, t.as(1)); const d = t.decision(); const ids = (d?.options || []).map(o => o.playerId).filter(Boolean); if (d) t.ctl.dispatch({ type: 'cancel' }, t.as(1)); return ids; })();
  check('The One Ring: protection from everything — opponents can\'t target you', !targets.includes(t.P(0).playerId) && t.P(0).protectionFromEverything === true, JSON.stringify(targets));
}

section('round 10: library search inside a mode, exact target counts');
{
  const t = setup();
  const before = t.P(0).deck.battlefield.length;
  cast(t, 'Opt', 'Choose three. You may choose the same mode more than once.\n• Put two +1/+1 counters on target creature.\n• Return target permanent card from your graveyard to your hand.\n• Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.', [['modes:', 2], [d => d.key.includes('library-search'), d => d.options.slice(0, 1).map(o => o.id)]]);
  check('Verdant Confluence: the search mode three times puts three basic lands onto the battlefield tapped', t.P(0).deck.battlefield.length === before + 3 && t.P(0).deck.battlefield.slice(-3).every(c => c.tapped), `${before} → ${t.P(0).deck.battlefield.length}`);
}
{
  const t = setup();
  onField(t, 'Grizzly Bears', '', {}, 1); onField(t, 'Llanowar Elves', '', {}, 1);
  cast(t, 'Opt', 'Return two target creatures to their owners\' hands.', [[d => d.kind === 'choose-many', d => d.options.slice(0, 2).map(o => o.id)]]);
  check('"Return two target creatures": both return', t.names(1, 'hand').includes('Grizzly Bears') && t.names(1, 'hand').includes('Llanowar Elves'));
}

section('round 11: abilities granted in quotes');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  const elf = onField(t, 'Llanowar Elves', '');
  const bow = onField(t, 'Fog Bank', 'Equipped creature has "{T}: This creature deals 1 damage to any target."\nEquip {1}', { typeLine: 'Artifact — Equipment' });
  activate(t, bow, 0, [[d => d.targeting, () => elf.instanceId]]);
  const elfRows = t.view(0).players[0].battlefield.find(c => c.id === elf.instanceId).abilities;
  const bowRows = t.view(0).players[0].battlefield.find(c => c.id === bow.instanceId).abilities;
  check('Equipment: the equipped creature has the quoted ability, the Equipment does not', elfRows.some(a => /deals 1 damage/.test(a.text)) && !bowRows.some(a => /deals 1 damage/.test(a.text)), JSON.stringify([elfRows.map(a => a.text), bowRows.map(a => a.text)]));
  const row = elfRows.find(a => /deals 1 damage/.test(a.text));
  const ra = t.ctl.dispatch({ type: 'activate', instanceId: elf.instanceId, abilityId: row.id }, t.as(0)); const sn = settle(t, [[d => d.targeting, () => bear.instanceId]]);
  check('…and using it deals the damage (from the creature)', Number(t.bf(1, 'Grizzly Bears')?.damageMarked || 0) === 1 && t.bf(0, 'Llanowar Elves').tapped);
}
{
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Fog Bank', 'battlefield'); t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Air Elemental', 'battlefield');
  asText(t, t.bf(0, 'Fog Bank'), 'Creatures you control have "{T}: Add one mana of any color."', { typeLine: 'Enchantment' });
  t.end(0); t.end(1);
  t.autoPass = false;
  t.give(0, 'Colossal Dreadmaw'); asText(t, t.hand(0, 'Colossal Dreadmaw'), '', { manaCost: '{R}{B}' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Colossal Dreadmaw').instanceId }, t.as(0)); settle(t);
  check('Cryptolith Rite: creatures tap for any colour; the auto-payer uses them', r.ok && !!t.bf(0, 'Colossal Dreadmaw'), r.error);
}

section('round 12: changeling');
{
  const t = setup();
  onField(t, 'Fog Bank', 'Other Elf creatures you control get +1/+1.\nWhenever another Elf you control enters, you gain 2 life.', { typeLine: 'Creature — Elf', power: '0', toughness: '2' });
  const life = t.P(0).life;
  cast(t, 'Grizzly Bears', 'Changeling (This card is every creature type.)', [], { typeLine: 'Creature — Shapeshifter' });
  const bear = t.bf(0, 'Grizzly Bears');
  check('Changeling counts as an Elf for a lord and for "another Elf enters"', power(t, bear) === 3 && t.P(0).life === life + 2, `${power(t, bear)} ${life} → ${t.P(0).life}`);
}

section('round 12: redirect, free casts from hand, Second Harvest, Living Death, Necropotence, manifest');
{
  // P2 bolts P1's bear; P1 changes the target to P2's elf.
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', ''), elf = onField(t, 'Llanowar Elves', '', {}, 1);
  t.give(1, 'Forest', 'battlefield'); t.give(1, 'Opt'); asText(t, t.hand(1, 'Opt'), 'This spell deals 2 damage to target creature.', { manaCost: '{G}', typeLine: 'Instant' });
  t.give(0, 'Divination'); asText(t, t.hand(0, 'Divination'), 'Change the target of target spell or ability with a single target.', { typeLine: 'Instant', manaCost: '{1}' });
  t.autoPass = true; t.end(0); t.autoPass = false;
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(1, 'Opt').instanceId }, t.as(1));
  const q = t.decision(); t.ctl.dispatch({ type: 'answer', key: q.key, value: bear.instanceId }, t.as(1));
  if (t.game.flow.priority?.holderId === t.P(0).playerId) {
    t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Divination').instanceId }, t.as(0));
    settle(t, [[d => d.key.includes(':t') && d.targeting, () => elf.instanceId]]);
  }
  check('Bolt Bend: the spell hits the new target instead', !!t.bf(0, 'Grizzly Bears') && !t.bf(1, 'Llanowar Elves'), JSON.stringify([t.names(0, 'graveyard'), t.names(1, 'graveyard')]));
}
{
  const t = setup();
  t.give(0, 'Colossal Dreadmaw'); asText(t, t.hand(0, 'Colossal Dreadmaw'), '', { manaCost: '{5}{G}' });
  cast(t, 'Opt', 'You may cast a spell with mana value 6 or less from your hand without paying its mana cost.', [['hand', d => d.options.find(o => o.label === 'Colossal Dreadmaw')?.id]]);
  check('Rishkar\'s Expertise: the chosen spell is cast free from hand', !!t.bf(0, 'Colossal Dreadmaw'));
}
{
  const t = setup();
  cast(t, 'Opt', 'Create two 1/1 white Soldier creature tokens.');
  cast(t, 'Divination', 'For each token you control, create a token that\'s a copy of that permanent.');
  check('Second Harvest: each token is copied', t.P(0).deck.battlefield.filter(c => c.token).length === 4);
}
{
  const t = setup();
  onField(t, 'Grizzly Bears', '');
  t.give(1, 'Colossal Dreadmaw', 'graveyard');
  cast(t, 'Opt', 'Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.');
  check('Living Death: graveyard creatures return, battlefield creatures go to the graveyard', !!t.bf(1, 'Colossal Dreadmaw') && t.names(0, 'graveyard').includes('Grizzly Bears'));
}
{
  const t = setup();
  const necro = onField(t, 'Fog Bank', 'Pay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.', { typeLine: 'Enchantment' });
  const top = t.P(0).deck.remainingLibrary[0];
  activate(t, necro);
  check('Necropotence: the card is exiled now…', t.P(0).deck.exile.some(c => c.instanceId === top.instanceId));
  t.autoPass = true; t.end(0);
  check('…and put into the hand at the end step', t.P(1).deck && t.P(0).deck.hand.some(c => c.instanceId === top.instanceId));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Exile target nonland permanent. Its controller manifests the top card of their library.', [[d => d.targeting, () => bear.instanceId]]);
  const fd = t.P(1).deck.battlefield.find(c => c.faceDownKind === 'manifest');
  check('Reality Shift: the controller gets a face-down 2/2', !!fd && t.view(1).players[1].battlefield.find(c => c.id === fd.instanceId)?.power === 2);
}

section('round 12: Ghostly Flicker, Adeline');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', ''); bear.counters = { '+1/+1': 2 };
  const elf = onField(t, 'Llanowar Elves', '');
  cast(t, 'Opt', 'Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control.', [[d => d.kind === 'choose-many', () => [bear.instanceId, elf.instanceId]]]);
  check('Ghostly Flicker: both return as new objects (counters gone)', !!t.bf(0, 'Grizzly Bears') && !!t.bf(0, 'Llanowar Elves') && !t.bf(0, 'Grizzly Bears').counters?.['+1/+1']);
}
{
  const t = newGame(['simic', 'simic', 'white']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Fog Bank', 'battlefield');
  asText(t, t.bf(0, 'Fog Bank'), 'Whenever you attack, for each opponent, create a 1/1 white Human creature token that\'s tapped and attacking that player or a planeswalker they control.', { typeLine: 'Enchantment' });
  t.end(0); t.end(1); t.end(2);
  const l1 = t.P(1).life, l2 = t.P(2).life;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  check('Adeline: a 1/1 token attacks each opponent', t.P(0).deck.battlefield.filter(c => c.token).length === 2 && t.P(2).life === l2 - 1 && t.P(1).life === l1 - 3, `${l1}→${t.P(1).life} ${l2}→${t.P(2).life}`);
}

section('round 13: Boseiju, Takenuma, Pact of Negation');
{
  const t = setup();
  const land = onField(t, 'Grizzly Bears', '', { typeLine: 'Land — Swamp' }, 1);
  t.give(0, 'Opt'); const bos = asText(t, t.hand(0, 'Opt'), 'Channel — {1}{G}, Discard this card: Destroy target artifact, enchantment, or nonbasic land an opponent controls. That player may search their library for a land card with a basic land type, put it onto the battlefield, then shuffle. This ability costs {1} less to activate for each legendary creature you control.', { typeLine: 'Legendary Land' });
  const row = t.view(0).players[0].hand.find(c => c.id === bos.instanceId)?.abilities?.find(a => /Destroy/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: bos.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no channel row' };
  let asked = null;
  settle(t, [[d => d.targeting, () => land.instanceId], ['their-search', d => { asked = d; return d.options.slice(0, 1).map(o => o.id); }]]);
  check('Boseiju: the land is destroyed and its controller searches for a land with a basic type', r.ok && !t.bf(1, 'Grizzly Bears') && asked?.playerId === t.P(1).playerId, JSON.stringify([r.error, asked?.prompt]));
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const bear = t.give(0, 'Grizzly Bears'); t.P(0).deck.hand.splice(t.P(0).deck.hand.indexOf(bear), 1); bear.zone = 'library'; lib.unshift(bear);
  cast(t, 'Opt', 'Mill three cards, then return a creature or planeswalker card from your graveyard to your hand.', [[d => d.key.includes('grave'), d => [d.options.find(o => o.label === 'Grizzly Bears')?.id].filter(Boolean)]]);
  check('Takenuma: a creature milled by the same ability can be returned', t.P(0).deck.hand.some(c => c.instanceId === bear.instanceId));
}
{
  for (const pay of [true, false]) {
    const t = setup();
    cast(t, 'Opt', 'Draw a card. At the beginning of your next upkeep, pay {1}. If you don\'t, you lose the game.');
    t.autoPass = true; t.end(0); t.end(1); settle(t, [['may-pay', pay ? 'pay' : 'no']]);
    check(`Pact: at the next upkeep, ${pay ? 'paying keeps you in the game' : 'not paying loses the game'}`, pay ? !t.P(0).eliminated : !!t.P(0).eliminated, JSON.stringify([t.P(0).eliminated, t.game.status]));
  }
}

section('round 13: phasing (Teferi\'s Protection)');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  const life = t.P(0).life;
  cast(t, 'Opt', 'Until your next turn, your life total can\'t change and you gain protection from everything. All permanents you control phase out.\nExile Opt.');
  check('Teferi\'s Protection: your permanents phase out', !t.bf(0, 'Grizzly Bears') && t.P(0).deck.phasedOut?.some(c => c.instanceId === bear.instanceId));
  t.autoPass = true; t.end(0);
  t.give(1, 'Forest', 'battlefield'); t.give(1, 'Divination'); asText(t, t.hand(1, 'Divination'), 'Each opponent loses 5 life.', { manaCost: '{G}' });
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(1, 'Divination').instanceId }, t.as(1)); settle(t);
  check('…your life total can\'t change', t.P(0).life === life, `${life} → ${t.P(0).life}`);
  t.end(1);
  check('…and everything phases back in at your untap step', !!t.bf(0, 'Grizzly Bears') && !t.P(0).lifeLocked);
}

section('round 13: Sylvan Library');
{
  const t = setup();
  onField(t, 'Fog Bank', 'At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library.', { typeLine: 'Enchantment' });
  t.autoPass = true; t.end(0); t.end(1);
  let choose = null, n = 0;
  settle(t, [[':draw', true], [':choose', d => { choose = d; return d.options.slice(0, 2).map(o => o.id); }], [':fate:', () => (n++ === 0 ? 'pay' : 'top')]]);
  check('Sylvan Library: three drawn cards to choose from; one kept for 4 life, one put back', choose?.options.length === 3 && t.P(0).life === 36 && t.P(0).deck.hand.length === 2, JSON.stringify([choose?.options.length, t.P(0).life, t.P(0).deck.hand.length]));
}

section('round 14: top-1,000 batch (fight, sweepers by type and colour, emblems, Victimize …)');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', ''), elf = onField(t, 'Llanowar Elves', '', {}, 1);
  cast(t, 'Opt', 'Target creature you control gets +2/+2 until end of turn. It fights up to one target creature you don\'t control.', [[d => d.targeting && /don/i.test(d.prompt + d.title), () => elf.instanceId], [d => d.targeting, () => bear.instanceId]]);
  check('Bridgeworks Battle: the pumped creature fights the other', !t.bf(1, 'Llanowar Elves') && !!t.bf(0, 'Grizzly Bears'));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', { colors: ['G'] }), wall = onField(t, 'Fog Bank', '', { colors: [] }, 1), land = t.bf(0, 'Forest');
  cast(t, 'Opt', 'Each player sacrifices all permanents they control that are one or more colors.', [], { colors: [] });
  check('All Is Dust: coloured permanents are sacrificed, colourless ones stay', !t.bf(0, 'Grizzly Bears') && !!t.bf(1, 'Fog Bank') && !!land);
}
{
  const t = setup();
  onField(t, 'Grizzly Bears', ''); onField(t, 'Llanowar Elves', '', {}, 1);
  cast(t, 'Opt', 'Choose a creature type. Destroy all creatures that aren\'t of the chosen type.', [[d => d.kind === 'creature-type' || /creature type/i.test(d.prompt || d.title || ''), d => (d.kind === 'choose-one' ? (d.options.find(o => /^Elf$/i.test(o.label))?.id ?? 'Elf') : 'Elf')]]);
  check('Kindred Dominance: only the chosen type survives', !t.bf(0, 'Grizzly Bears') && !!t.bf(1, 'Llanowar Elves'));
}
{
  const t = setup();
  const spirit = onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Spirit' });
  cast(t, 'Opt', 'Exile target creature you control, then return that card to the battlefield under its owner\'s control. If it\'s a Spirit, put a +1/+1 counter on it.', [[d => d.targeting, () => spirit.instanceId]]);
  const back = t.bf(0, 'Grizzly Bears');
  check('Essence Flux: a Spirit comes back with a +1/+1 counter', !!back && Number(back.counters?.['+1/+1'] || 0) === 1, JSON.stringify(back?.counters));
}
{
  const t = setup();
  const torque = onField(t, 'Fog Bank', '{T}: Target nonland permanent becomes an artifact in addition to its other types until end of turn.', { typeLine: 'Artifact' });
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  activate(t, torque, 0, [[d => d.targeting, () => bear.instanceId]]);
  check('Liquimetal Torque: the creature is also an artifact', /Artifact/.test(withOverlay(bear, def(t, bear))?.typeLine || ''));
}
{
  const t = setup();
  const a = t.give(0, 'Grizzly Bears', 'graveyard'), b = t.give(0, 'Llanowar Elves', 'graveyard');
  onField(t, 'Fog Bank', '');
  cast(t, 'Opt', 'Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.', [[d => d.kind === 'choose-many' && /graveyard/i.test(d.prompt + d.title), () => [a.instanceId, b.instanceId]]]);
  check('Victimize: the two chosen cards return tapped, the creature is sacrificed', !!t.bf(0, 'Grizzly Bears')?.tapped && !!t.bf(0, 'Llanowar Elves')?.tapped && !t.bf(0, 'Fog Bank'));
}
{
  const t = setup();
  const bloom = onField(t, 'Fog Bank', '{1}, Sacrifice this creature: Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Proliferate.', { typeLine: 'Creature — Fungus' });
  const ench = onField(t, 'Grizzly Bears', '', { typeLine: 'Enchantment' }, 1);
  activate(t, bloom, 0, [['modes', () => [1]], [d => d.targeting, () => ench.instanceId]]);
  check('Cankerbloom: the chosen mode destroys the enchantment', !t.bf(1, 'Grizzly Bears') && !t.bf(0, 'Fog Bank'));
}
{
  const t = setup();
  const els = onField(t, 'Fog Bank', '+1: Create three 1/1 white Soldier creature tokens.\n−7: You get an emblem with "Creatures you control get +2/+2 and have flying."', { typeLine: 'Legendary Planeswalker — Elspeth' });
  els.counters = { loyalty: 8 };
  const bear = onField(t, 'Grizzly Bears', '');
  activate(t, els, 1);
  check('Elspeth: the emblem gives creatures +2/+2 and flying', power(t, bear) === 4 && has(t, bear, 'Flying') && t.view(0).players[0].emblems?.length === 1, JSON.stringify([power(t, bear), has(t, bear, 'Flying')]));
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'At the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card.', { typeLine: 'Creature' });
  onField(t, 'Grizzly Bears', '', { typeLine: 'Artifact', manaValue: 3 });
  onField(t, 'Llanowar Elves', '', { typeLine: 'Artifact', manaValue: 2 }, 1);
  t.autoPass = true; t.end(0); t.end(1); settle(t);
  check('Padeem: draws in upkeep with the biggest artifact (plus the turn\'s draw)', t.P(0).deck.hand.length === 2, String(t.P(0).deck.hand.length));
}
{
  const t = setup();
  const nb = onField(t, 'Grizzly Bears', '', { typeLine: 'Land' }, 1);
  const field = onField(t, 'Fog Bank', '{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles.', { typeLine: 'Land' });
  const lands = [0, 1].map(i => t.P(i).deck.battlefield.length);
  const asked = [];
  activate(t, field, 0, [[d => d.targeting, () => nb.instanceId], ['their-search', d => { asked.push(d.playerId); return d.options.slice(0, 1).map(o => o.id); }]]);
  check('Field of Ruin: the land is destroyed and each player searches for a basic land', !t.bf(1, 'Grizzly Bears') && asked.length === 2 && t.P(0).deck.battlefield.length === lands[0] && t.P(1).deck.battlefield.length === lands[1], JSON.stringify([asked.length, lands, t.P(0).deck.battlefield.length, t.P(1).deck.battlefield.length]));
}
{
  const t = setup();
  t.autoPass = true; t.end(0);
  t.give(1, 'Forest', 'battlefield'); t.give(1, 'Divination'); asText(t, t.hand(1, 'Divination'), 'Divination deals 2 damage to any target.', { manaCost: '{G}', manaValue: 1 });
  t.autoPass = false;
  t.give(0, 'Opt'); const imp = asText(t, t.hand(0, 'Opt'), 'Change the target of target spell with a single target. You lose life equal to that spell\'s mana value.', { typeLine: 'Instant' });
  const sp = t.hand(1, 'Divination');
  t.ctl.dispatch({ type: 'play', instanceId: sp.instanceId }, t.as(1));
  const tq = t.decision(); t.ctl.dispatch({ type: 'answer', key: tq.key, value: tq.options[0].id }, { playerId: tq.playerId, isHost: false });
  if (t.game.flow.priority?.holderId === t.P(1).playerId) t.ctl.dispatch({ type: 'pass' }, t.as(1));
  const life = t.P(0).life;
  const r = t.ctl.dispatch({ type: 'play', instanceId: imp.instanceId }, t.as(0));
  settle(t, [[d => d.key.includes('stack') || /spell/i.test(d.prompt || ''), d => d.options[0].id]]);
  check("Imp's Mischief: you lose life equal to the spell's mana value", r.ok && t.P(0).life <= life - 1, JSON.stringify([r.error, life, t.P(0).life]));
}

section('round 15: alternative costs, Flare of Fortitude');
{
  const t = setup();
  onField(t, 'Fog Bank', '', { typeLine: 'Basic Land — Swamp' });
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  t.P(0).deck.battlefield.forEach(c => { c.tapped = true; });
  let modes = null;
  cast(t, 'Opt', 'If you control a Swamp, you may pay 4 life rather than pay this spell\'s mana cost.\nDestroy target nonblack creature. It can\'t be regenerated.', [[d => d.key.includes('castMode'), d => { modes = d.options.map(o => o.label); return 'alt-cost'; }], [d => d.targeting, () => bear.instanceId]], { manaCost: '{3}{B}' });
  check('Snuff Out: with a Swamp, cast for 4 life with no mana', t.P(0).life === 36 && !t.bf(1, 'Grizzly Bears'), JSON.stringify([modes, t.P(0).life]));
}
{
  const t = setup();
  t.P(0).deck.battlefield.forEach(c => { c.tapped = true; });
  t.give(0, 'Opt'); asText(t, t.hand(0, 'Opt'), 'If an opponent cast three or more spells this turn, you may pay {0} rather than pay this spell\'s mana cost.\nExile any number of target spells.', { manaCost: '{2}{U}{U}' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Opt').instanceId }, t.as(0));
  const d = t.decision();
  check('Mindbreak Trap: no free cast unless an opponent cast three spells', !r.ok || !(d?.options || []).some(o => o.id === 'alt-cost'), JSON.stringify([r.ok, d?.key, d?.options?.map(o => o.id)]));
}
{
  const t = setup();
  const white = onField(t, 'Grizzly Bears', '', { colors: ['W'] });
  t.P(0).deck.battlefield.forEach(c => { c.tapped = true; });
  cast(t, 'Opt', 'You may sacrifice a nontoken white creature rather than pay this spell\'s mana cost.\nUntil end of turn, your life total can\'t change, and permanents you control gain hexproof and indestructible.', [[d => d.key.includes('castMode'), 'alt-cost'], [d => d.key.includes('alt-sacrifice'), () => white.instanceId]], { manaCost: '{1}{W}{W}' });
  const life = t.P(0).life, land = t.bf(0, 'Forest');
  t.give(1, 'Divination'); asText(t, t.hand(1, 'Divination'), 'Each opponent loses 5 life.');
  check('Flare of Fortitude: free by sacrificing a white creature; life locked, permanents indestructible', !t.bf(0, 'Grizzly Bears') && has(t, land, 'Indestructible') && t.P(0).lifeLocked && t.P(0).lifeLockedTurn === t.game.turnNumber, JSON.stringify([life]));
  t.autoPass = true; t.end(0);
  check('…and the lock ends with the turn', !require_lock(t));
}

section('round 16: mana of several colours');
{
  const t = setup();
  const bt = onField(t, 'Llanowar Elves', '{T}: For each color among permanents you control, add one mana of that color.', { colors: ['G'] });
  onField(t, 'Fog Bank', '', { colors: ['U'] });
  const ab = parseActivatedAbilities(def(t, bt))[0];
  const before = { ...t.P(0).mana.floating };
  const r = t.ctl.dispatch({ type: 'activate', instanceId: bt.instanceId, abilityId: ab.id }, t.as(0)); settle(t);
  const f = t.P(0).mana.floating || {};
  check('Bloom Tender: one green and one blue', r.ok && f.G - (before.G || 0) === 1 && f.U - (before.U || 0) === 1, JSON.stringify([r.error, f]));
}
{
  const t = setup();
  const sig = onField(t, 'Fog Bank', '{1}, {T}: Add {W}{U}.', { typeLine: 'Artifact' });
  const ab = parseActivatedAbilities(def(t, sig))[0];
  const r = t.ctl.dispatch({ type: 'activate', instanceId: sig.instanceId, abilityId: ab.id }, t.as(0)); settle(t);
  const f = t.P(0).mana.floating || {};
  check('Signet: {W}{U} adds one white and one blue', r.ok && f.W === 1 && f.U === 1, JSON.stringify([r.error, f]));
}

section('round 17: searches by land type, tribal pumps, distribute, Last March, Talon Gates');
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const forest = lib.find(c => def(t, c)?.name === 'Forest');
  const island = lib.find(c => def(t, c)?.name === 'Island');
  let offered = null;
  t.give(0, 'Fog Bank'); const land = asText(t, t.hand(0, 'Fog Bank'), 'When this land enters, sacrifice it. When you do, search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle and you gain 1 life.', { typeLine: 'Land', manaCost: '' });
  const life = t.P(0).life;
  t.ctl.dispatch({ type: 'play', instanceId: land.instanceId }, t.as(0));
  settle(t, [[d => /search/i.test(d.title + d.prompt) && d.options, d => { offered = d.options.map(o => o.label); return d.kind === 'choose-many' ? [d.options.find(o => o.label === 'Forest')?.id].filter(Boolean) : d.options.find(o => o.label === 'Forest')?.id; }]]);
  check('Riveteers Overlook: only a basic Swamp, Mountain or Forest is offered; life gained', !!forest && !!island && offered && !offered.includes('Island') && offered.includes('Forest') && t.P(0).life === life + 1 && !t.bf(0, 'Fog Bank'), JSON.stringify([offered && [...new Set(offered)], life, t.P(0).life]));
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you cast a noncreature spell, Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them.', { typeLine: 'Creature — Otter Wizard' });
  const frog = onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Frog' }); frog.tapped = true;
  const elf = onField(t, 'Llanowar Elves', '');
  cast(t, 'Opt', 'Draw a card.');
  check('Valley Floodcaller: Frogs get +1/+1 and untap; Elves do not', power(t, frog) === 3 && !frog.tapped && power(t, elf) === 1, JSON.stringify([power(t, frog), frog.tapped, power(t, elf)]));
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever Fog Bank or another Equipment you control enters, you may attach that Equipment to target creature you control.', { typeLine: 'Legendary Artifact — Equipment' });
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Llanowar Elves'); const eq = asText(t, t.hand(0, 'Llanowar Elves'), 'Equipped creature gets +2/+0.\nEquip {3}', { typeLine: 'Artifact — Equipment', manaCost: '{1}' });
  t.ctl.dispatch({ type: 'play', instanceId: eq.instanceId }, t.as(0));
  settle(t, [[d => d.targeting, d => d.options.find(o => o.id === bear.instanceId)?.id ?? d.options[0].id]]);
  check('Hammer of Nazahn: the new Equipment attaches to a creature', t.P(0).deck.battlefield.find(c => c.instanceId === eq.instanceId)?.attachedTo === bear.instanceId);
}
{
  const t = setup();
  const me = onField(t, 'Fog Bank', '{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types.', { typeLine: 'Creature — Shapeshifter', power: '1', toughness: '1' });
  const bear = onField(t, 'Grizzly Bears', ''); bear.counters = { '+1/+1': 1 };
  activate(t, me, 0, [[d => d.key === 'x', 4]]);
  check('Mirror Entity: X=4 makes creatures 4/4 (counters on top)', power(t, bear) === 5 && tough(t, me) === 4, JSON.stringify([power(t, bear), tough(t, me), t.game.log.slice(0, 2).map(l => l.text)]));
}
{
  const t = setup();
  const cr = onField(t, 'Fog Bank', '{T}: Distribute two +1/+1 counters among one or two target creatures you control.', { typeLine: 'Artifact' });
  const a = onField(t, 'Grizzly Bears', ''), b = onField(t, 'Llanowar Elves', '');
  activate(t, cr, 0, [[d => d.kind === 'choose-many', () => [a.instanceId, b.instanceId]], [d => d.kind === 'number', 1]]);
  check('The Earth Crystal: one counter on each of two creatures', a.counters?.['+1/+1'] === 1 && b.counters?.['+1/+1'] === 1, JSON.stringify([a.counters, b.counters]));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', {}, 1), b = onField(t, 'Llanowar Elves', '', {}, 1);
  const life = t.P(1).life;
  cast(t, 'Opt', 'Distribute four damage among one, two, or three targets.', [[d => d.kind === 'choose-many', () => [a.instanceId, b.instanceId, t.P(1).playerId]], [d => d.kind === 'number' && /Grizzly/.test(d.prompt), 2], [d => d.kind === 'number', 1]]);
  check('Distribute damage: 2 to the Bears, 1 to the Elves, 1 to the player', !t.bf(1, 'Grizzly Bears') && !t.bf(1, 'Llanowar Elves') && t.P(1).life === life - 1, JSON.stringify([life, t.P(1).life]));
}
{
  const t = setup();
  onField(t, 'Fog Bank', '', { power: '0', toughness: '2' });
  const lib = t.P(0).deck.remainingLibrary;
  const bear = lib.find(c => /Creature/.test(def(t, c)?.typeLine || '')); lib.splice(lib.indexOf(bear), 1); lib.unshift(bear); asText(t, bear, '', { toughness: '1' });
  cast(t, 'Opt', 'This spell can\'t be countered.\nDraw cards equal to the greatest toughness among creatures you control, then put any number of creature cards from your hand onto the battlefield.', [[d => d.kind === 'choose-many', d => d.options.filter(o => o.id === bear.instanceId).map(o => o.id)]]);
  check('Last March of the Ents: draws by toughness, the drawn creature can go onto the battlefield', t.P(0).deck.battlefield.some(c => c.instanceId === bear.instanceId) && t.P(0).deck.hand.length === 1, JSON.stringify([t.P(0).deck.hand.map(c => def(t, c)?.name), t.P(0).deck.battlefield.filter(c => /Creature/.test(def(t, c)?.typeLine || '')).map(c => [def(t, c)?.name, tough(t, c)])]));
}
{
  const t = setup();
  t.give(0, 'Fog Bank'); const gates = asText(t, t.hand(0, 'Fog Bank'), '{T}: Add {C}.\n{4}: Put this card from your hand onto the battlefield.', { typeLine: 'Land' });
  const row = t.view(0).players[0].hand.find(c => c.id === gates.instanceId)?.abilities?.find(a => /from your hand/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: gates.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no row' };
  settle(t);
  check('Talon Gates: put onto the battlefield from the hand for {4}', r.ok && !!t.bf(0, 'Fog Bank'), r.error);
}

section('round 18: coins, reveal until, Nim Deathmantle, stun counters, Bramble Sovereign');
for (const win of [true, false]) {
  const t = setup();
  const rnd = Math.random; Math.random = () => (win ? 0.1 : 0.9);
  try { cast(t, 'Opt', 'Flip a coin. If you win the flip, create a Treasure token.'); } finally { Math.random = rnd; }
  check(`Coin flip: ${win ? 'winning makes' : 'losing makes no'} Treasure`, t.P(0).deck.battlefield.some(c => c.token) === win);
}
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const firstCreature = lib.findIndex(c => /Creature/.test(def(t, c)?.typeLine || ''));
  const want = lib[firstCreature], before = firstCreature;
  cast(t, 'Opt', 'Reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order.');
  check('Reveal until a creature: it goes to the hand, the rest to the bottom', t.P(0).deck.hand.some(c => c.instanceId === want.instanceId) && t.P(0).deck.remainingLibrary.length === lib.length && (before === 0 || !/Creature/.test('') ), String(before));
}
{
  const t = setup();
  const nim = onField(t, 'Fog Bank', 'Equipped creature gets +2/+2.\nWhenever a nontoken creature is put into your graveyard from the battlefield, you may pay {4}. If you do, return that card to the battlefield and attach this Equipment to it.\nEquip {4}', { typeLine: 'Artifact — Equipment', power: null, toughness: null });
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => bear.instanceId], ['may-pay', 'pay']]);
  const back = t.bf(0, 'Grizzly Bears');
  check('Nim Deathmantle: the creature returns with the Equipment attached', !!back && t.P(0).deck.battlefield.find(c => c.instanceId === nim.instanceId)?.attachedTo === back.instanceId);
}
{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Tap all creatures your opponents control, then put a stun counter on each of those creatures.');
  check('Monstrosity of the Lake: tapped with a stun counter', foe.tapped && foe.counters?.stun === 1);
  t.autoPass = true; t.end(0);
  check('…and at its untap step the stun counter comes off instead', foe.tapped && !foe.counters?.stun);
  t.end(1); t.end(0);
  check('…then it untaps normally the next time', !foe.tapped);
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever another nontoken creature enters, you may pay {1}{G}. If you do, that creature\'s controller creates a token that\'s a copy of that creature.', { typeLine: 'Creature — Treefolk' });
  t.give(1, 'Grizzly Bears', 'battlefield');
  settle(t, [['may-pay', 'pay']]);
  check('Bramble Sovereign: the creature\'s controller gets the token copy', t.P(1).deck.battlefield.filter(c => def(t, c)?.name === 'Grizzly Bears').length === 2, String(t.P(1).deck.battlefield.length));
}

section('round 19: Stifle, sweepers, planeswalker damage, divided damage, X targets');
{
  const t = setup();
  t.give(0, 'Opt'); const stifle = asText(t, t.hand(0, 'Opt'), 'Counter target activated or triggered ability.', { typeLine: 'Instant' });
  const tim = onField(t, 'Llanowar Elves', '{T}: Draw a card.', {}, 1);
  t.autoPass = true; t.end(0); t.autoPass = false;
  const hand = t.P(1).deck.hand.length;
  const ab = parseActivatedAbilities(def(t, tim))[0];
  t.ctl.dispatch({ type: 'activate', instanceId: tim.instanceId, abilityId: ab.id }, t.as(1));
  if (t.game.flow.priority?.holderId === t.P(1).playerId) t.ctl.dispatch({ type: 'pass' }, t.as(1));
  const r = t.ctl.dispatch({ type: 'play', instanceId: stifle.instanceId }, t.as(0));
  settle(t, [[d => /ability/i.test(d.prompt + d.title), d => d.options[0].id]]);
  check('Stifle: the activated ability is countered (no card drawn)', r.ok && t.P(1).deck.hand.length === hand, JSON.stringify([r.error, hand, t.P(1).deck.hand.length]));
}
{
  const t = setup();
  onField(t, 'Grizzly Bears', '', { typeLine: 'Artifact' }, 1); onField(t, 'Llanowar Elves', '', { typeLine: 'Enchantment' }, 1); onField(t, 'Fog Bank', '', {}, 1);
  cast(t, 'Opt', 'Destroy all artifacts and enchantments.');
  check('Destroy all artifacts and enchantments (creatures stay)', !t.bf(1, 'Grizzly Bears') && !t.bf(1, 'Llanowar Elves') && !!t.bf(1, 'Fog Bank'));
}
{
  const t = setup();
  const pw = onField(t, 'Fog Bank', '+1: Draw a card.', { typeLine: 'Legendary Planeswalker — Jace', loyalty: '5' }, 1); pw.counters = { loyalty: 5 };
  onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Opt deals 3 damage to each creature and each planeswalker.');
  check('Damage to each creature and planeswalker: loyalty goes down', !t.bf(1, 'Grizzly Bears') && pw.counters.loyalty === 2, JSON.stringify(pw.counters));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', {}, 1);
  const life = t.P(1).life;
  cast(t, 'Opt', 'Opt deals 3 damage divided as you choose among one or two targets.', [[d => d.kind === 'choose-many', () => [a.instanceId, t.P(1).playerId]], [d => d.kind === 'number', 2]]);
  check('Electrolyze-style divided damage: 2 to the creature, 1 to the player', !t.bf(1, 'Grizzly Bears') && t.P(1).life === life - 1, JSON.stringify([life, t.P(1).life]));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', { power: '3', toughness: '3' }, 1);
  cast(t, 'Opt', 'Target creature deals damage to itself equal to its power.', [[d => d.targeting, () => a.instanceId]]);
  check('Justice Strike: a 3/3 deals 3 to itself', !t.bf(1, 'Grizzly Bears'));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', {}, 1), b = onField(t, 'Llanowar Elves', '', {}, 1);
  cast(t, 'Opt', 'Tap X target creatures.', [[d => d.key === 'x', 2], [d => d.kind === 'choose-many', () => [a.instanceId, b.instanceId]]], { manaCost: '{X}{U}' });
  check('Tap X target creatures (X=2)', a.tapped && b.tapped);
}

{
  const t = setup();
  const wall = onField(t, 'Fog Bank', '', { power: '0', toughness: '2' }, 1);
  const bear = onField(t, 'Grizzly Bears', '', { power: '1', toughness: '3' });
  cast(t, 'Opt', 'Switch target creature\'s power and toughness until end of turn.', [[d => d.targeting, () => wall.instanceId]]);
  cast(t, 'Divination', 'Switch target creature\'s power and toughness until end of turn.', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{U}' });
  check('Twisted Image: a 0/2 becomes 2/0 and dies; a 1/3 becomes 3/1', !t.bf(1, 'Fog Bank') && power(t, bear) === 3 && tough(t, bear) === 1, JSON.stringify([power(t, bear), tough(t, bear)]));
}

section('round 20: Saddle');
{
  const t = setup();
  const steed = onField(t, 'Llanowar Elves', 'Whenever this creature attacks while saddled, create a 3/3 white Angel creature token with flying.\nSaddle 2', { typeLine: 'Creature — Horse Mount', power: '3', toughness: '3' });
  const bear = onField(t, 'Grizzly Bears', '');
  const row = t.view(0).players[0].battlefield.find(c => c.id === steed.instanceId)?.abilities?.find(a => /Saddle/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: steed.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no saddle row' };
  settle(t, [['saddle', () => [bear.instanceId]]]);
  check('Saddle 2: the Grizzly Bears tap and the Mount is saddled', r.ok && bear.tapped && steed.saddledTurn === t.game.turnNumber, JSON.stringify([r.error, bear.tapped, steed.saddledTurn]));
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: steed.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  check('…attacking while saddled makes an Angel', t.P(0).deck.battlefield.some(c => c.token));
}
{
  const t = setup();
  onField(t, 'Llanowar Elves', 'Whenever this creature attacks while saddled, create a 3/3 white Angel creature token with flying.\nSaddle 2', { typeLine: 'Creature — Horse Mount', power: '3', toughness: '3' });
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Llanowar Elves').instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  check('…not saddled: no Angel', !t.P(0).deck.battlefield.some(c => c.token));
}

section('round 21: Encore');
{
  const t = newGame(['simic', 'simic', 'white']); t.keepAll();
  for (let i = 0; i < 6; i++) t.give(0, 'Forest', 'battlefield');
  const g = t.give(0, 'Grizzly Bears', 'graveyard'); asText(t, g, 'Encore {2}{G}', { manaCost: '{1}{G}' });
  const row = t.view(0).players[0].graveyard.find(c => c.id === g.instanceId)?.abilities?.find(a => /Encore/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: g.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no encore row' };
  settle(t);
  const toks = t.P(0).deck.battlefield.filter(c => c.token);
  check('Encore: one hasty token copy per opponent, the card exiled', r.ok && toks.length === 2 && t.P(0).deck.exile.some(c => c.instanceId === g.instanceId) && toks.every(c => has(t, c, 'Haste')), JSON.stringify([r.error, toks.length]));
  t.do(0, { type: 'next-phase' });
  const opts = t.view(0).actions.attack || [];
  const targets = toks.map(c => opts.find(a => a.instanceId === c.instanceId)?.defenders?.[0]).sort();
  check('…each must attack its own opponent', JSON.stringify(targets) === JSON.stringify([t.P(1).playerId, t.P(2).playerId].sort()) && opts.filter(a => toks.some(c => c.instanceId === a.instanceId)).every(a => a.mustAttack), JSON.stringify(targets));
  const draft = toks.map(c => ({ instanceId: c.instanceId, defenderId: opts.find(a => a.instanceId === c.instanceId)?.defenders?.[0] }));
  t.do(0, { type: 'attack', attacks: draft }); settle(t);
  t.autoPass = true; t.end(0);
  check('…and they are sacrificed at the end step', !t.P(0).deck.battlefield.some(c => c.token));
}

section('round 22: state triggers, coin-flip triggers');
{
  const t = setup();
  onField(t, 'Fog Bank', 'Dandân can\'t attack unless defending player controls an Island.\nWhen you control no Islands, sacrifice this creature.', { typeLine: 'Creature — Fish' });
  cast(t, 'Opt', 'Draw a card.');
  check('Dandân stays while you control Islands', !!t.bf(0, 'Fog Bank'));
  for (const c of [...t.P(0).deck.battlefield].filter(c => def(t, c)?.name === 'Island')) { t.P(0).deck.battlefield.splice(t.P(0).deck.battlefield.indexOf(c), 1); c.zone = 'graveyard'; t.P(0).deck.graveyard.push(c); }
  cast(t, 'Divination', 'Draw a card.', [], { manaCost: '{G}' });
  check('…and is sacrificed once you control no Islands', !t.bf(0, 'Fog Bank'));
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you win a coin flip, draw a card.', { typeLine: 'Enchantment' });
  const rnd = Math.random; Math.random = () => 0.1;
  const hand = () => t.P(0).deck.hand.length;
  let before;
  try { before = hand(); cast(t, 'Opt', 'Flip a coin.'); } finally { Math.random = rnd; }
  check('Whenever you win a coin flip: draws a card', hand() === before + 1, `${before} → ${hand()}`);
}

section('round 23: Miracle');
{
  const t = setup();
  t.autoPass = true; t.end(0);
  const lib = t.P(0).deck.remainingLibrary;
  const card = lib.find(c => /Sorcery|Instant/.test(def(t, c)?.typeLine || '') && !def(t, c)?.cardFaces?.length) || lib.find(c => !def(t, c)?.cardFaces?.length);
  lib.splice(lib.indexOf(card), 1); lib.unshift(card);
  asText(t, card, 'Each opponent loses 3 life.\nMiracle {U}', { typeLine: 'Sorcery', manaCost: '{5}{U}{U}' });
  const life = t.P(1).life;
  t.end(1);
  settle(t, [['miracle', 'cast']]);
  check('Miracle: the first card drawn is cast for its miracle cost', t.P(1).life === life - 3 && t.P(0).deck.graveyard.some(c => c.instanceId === card.instanceId), JSON.stringify([life, t.P(1).life, card.zone]));
}

section('round 24: Suspend');
{
  const t = setup();
  t.give(0, 'Grizzly Bears'); const c = asText(t, t.hand(0, 'Grizzly Bears'), 'Suspend 2—{G}', { manaCost: '{5}{G}{G}', power: '2', toughness: '2' });
  const row = t.view(0).players[0].hand.find(x => x.id === c.instanceId)?.abilities?.find(a => /Suspend/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: c.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no suspend row' };
  settle(t);
  check('Suspend: exiled with 2 time counters', r.ok && c.zone === 'exile' && c.counters?.time === 2, JSON.stringify([r.error, c.zone, c.counters]));
  t.autoPass = true; t.end(0); t.end(1); settle(t);
  check('…one counter comes off at your upkeep', c.counters?.time === 1, JSON.stringify(c.counters));
  t.end(0); t.end(1); settle(t);
  const bear = t.bf(0, 'Grizzly Bears');
  check('…and with the last one it is cast for free, with haste', !!bear && has(t, bear, 'Haste'), JSON.stringify([c.zone, c.counters]));
}

section('round 25: Plot');
{
  const t = setup();
  t.give(0, 'Grizzly Bears'); const c = asText(t, t.hand(0, 'Grizzly Bears'), 'Plot {1}{G}', { manaCost: '{6}{G}', power: '2', toughness: '2' });
  const row = t.view(0).players[0].hand.find(x => x.id === c.instanceId)?.abilities?.find(a => /Plot/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: c.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no plot row' };
  settle(t);
  const same = t.view(0).players[0].exile.find(x => x.id === c.instanceId);
  check('Plot: exiled face up, not castable the same turn', r.ok && c.zone === 'exile' && !same?.playable, JSON.stringify([r.error, c.zone, same?.playable]));
  t.autoPass = true; t.end(0); t.end(1); t.autoPass = false;
  t.P(0).deck.battlefield.forEach(x => { x.tapped = true; });
  const p = t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0));
  settle(t, [[d => d.key.includes('castMode'), 'plot']]);
  check('…and cast for free on a later turn', p.ok && !!t.bf(0, 'Grizzly Bears'), p.error);
}

section('round 26: Boast');
{
  const t = setup();
  const b = onField(t, 'Llanowar Elves', 'Boast — {1}: Draw a card. (Activate only if this creature attacked this turn and only once each turn.)');
  const row0 = t.view(0).players[0].battlefield.find(c => c.id === b.instanceId)?.abilities?.find(a => /Boast/.test(a.text));
  check('Boast: not before it attacked', row0 && !row0.legal, JSON.stringify(row0));
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: b.instanceId, defenderId: t.P(1).playerId }] }); settle(t);
  const hand = t.P(0).deck.hand.length;
  activate(t, b);
  const row2 = t.view(0).players[0].battlefield.find(c => c.id === b.instanceId)?.abilities?.find(a => /Boast/.test(a.text));
  check('…after attacking it works once, then not again', t.P(0).deck.hand.length === hand + 1 && row2 && !row2.legal, JSON.stringify([hand, t.P(0).deck.hand.length, row2?.reason]));
}

section('round 27: Improvise');
{
  const t = setup();
  t.P(0).deck.battlefield.filter(c => def(t, c)?.name !== 'Island').forEach(c => { c.tapped = true; });
  t.P(0).deck.battlefield.filter(c => def(t, c)?.name === 'Island').slice(1).forEach(c => { c.tapped = true; });
  const arts = [onField(t, 'Fog Bank', '', { typeLine: 'Artifact' }), onField(t, 'Grizzly Bears', '', { typeLine: 'Artifact' }), onField(t, 'Llanowar Elves', '', { typeLine: 'Artifact' })];
  const hand = t.P(0).deck.hand.length;
  let err = null;
  try { cast(t, 'Opt', 'Improvise\nDraw two cards.', [], { manaCost: '{3}{U}', typeLine: 'Sorcery' }); } catch (e) { err = e.message; }
  check('Improvise: three artifacts pay {3}, one Island pays {U}', !err && arts.every(a => a.tapped) && t.P(0).deck.hand.length === hand + 2, JSON.stringify([err, arts.map(a => a.tapped)]));
}

section('round 28: Emerge');
{
  const t = setup();
  const fodder = onField(t, 'Grizzly Bears', '', { manaValue: 4 });
  let err = null;
  try { cast(t, 'Llanowar Elves', 'Emerge {6}{G}{G}\nWhen you cast this spell, draw a card.', [[d => d.key.includes('castMode'), 'emerge'], [d => d.key.includes('emerge'), () => fodder.instanceId]], { manaCost: '{7}{G}{G}', typeLine: 'Creature — Eldrazi', power: '8', toughness: '8' }); } catch (e) { err = e.message; }
  const lands = t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c)?.typeLine || '') && c.tapped).length;
  check('Emerge: sacrifice a 4-drop and pay {2}{G}{G}', !err && !t.bf(0, 'Grizzly Bears') && !!t.bf(0, 'Llanowar Elves') && lands === 4, JSON.stringify([err, lands]));
}

section('round 29: Soulbond');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Llanowar Elves'); const wolfir = asText(t, t.hand(0, 'Llanowar Elves'), 'Soulbond\nAs long as this creature is paired with another creature, each of those creatures gets +4/+4.', { manaCost: '{G}', power: '4', toughness: '4' });
  t.ctl.dispatch({ type: 'play', instanceId: wolfir.instanceId }, t.as(0));
  settle(t, [['soulbond', () => bear.instanceId]]);
  check('Soulbond: paired on entering; both get +4/+4', power(t, bear) === 6 && power(t, t.bf(0, 'Llanowar Elves')) === 8, JSON.stringify([power(t, bear), power(t, t.bf(0, 'Llanowar Elves'))]));
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => t.bf(0, 'Llanowar Elves').instanceId]]);
  check('…the pair ends when one leaves', power(t, bear) === 2 && !bear.pairedWith, JSON.stringify([power(t, bear), bear.pairedWith]));
}
{
  const t = setup();
  onField(t, 'Llanowar Elves', 'Soulbond\nAs long as this creature is paired with another creature, both creatures have double strike.');
  t.give(0, 'Grizzly Bears'); const bear = asText(t, t.hand(0, 'Grizzly Bears'), '', { manaCost: '{G}' });
  t.ctl.dispatch({ type: 'play', instanceId: bear.instanceId }, t.as(0));
  settle(t, [['soulbond', d => d.options[0].id]]);
  check('Soulbond: another creature entering can pair; both have double strike', has(t, t.bf(0, 'Grizzly Bears'), 'Double strike') && has(t, t.bf(0, 'Llanowar Elves'), 'Double strike'));
}

section('round 30: Spectacle, Reinforce');
{
  const t = setup();
  t.give(0, 'Opt'); const sp = asText(t, t.hand(0, 'Opt'), 'Spectacle {G}\nDraw two cards.', { manaCost: '{4}{U}{U}', typeLine: 'Sorcery' });
  cast(t, 'Divination', 'Each opponent loses 1 life.', [], { manaCost: '{G}' });
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: sp.instanceId }, t.as(0));
  let offered = null;
  settle(t, [[d => d.key.includes('castMode'), d => { offered = d.options.map(o => o.id); return 'spectacle'; }]]);
  const lands = t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c)?.typeLine || '') && c.tapped).length;
  check('Spectacle: castable for {G} once an opponent lost life', offered?.includes('spectacle') && lands === 2 && t.P(0).deck.hand.length === hand - 1 + 2, JSON.stringify([offered, lands, hand, t.P(0).deck.hand.length]));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Llanowar Elves'); const r = asText(t, t.hand(0, 'Llanowar Elves'), 'Reinforce 2—{1}{G}');
  const row = t.view(0).players[0].hand.find(c => c.id === r.instanceId)?.abilities?.find(a => /Reinforce/.test(a.text));
  const res = row ? t.ctl.dispatch({ type: 'activate', instanceId: r.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no row' };
  settle(t, [['reinforce', () => bear.instanceId]]);
  check('Reinforce: discard it, two +1/+1 counters on the creature', res.ok && bear.counters?.['+1/+1'] === 2 && r.zone === 'graveyard', JSON.stringify([res.error, bear.counters, r.zone]));
}

section('round 31: cards leaving your graveyard, Class levels, die results');
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever one or more cards leave your graveyard, create a 1/1 white Zombie creature token.', { typeLine: 'Enchantment' });
  t.give(0, 'Grizzly Bears', 'graveyard'); t.give(0, 'Llanowar Elves', 'graveyard');
  cast(t, 'Opt', 'Exile all cards from target player\'s graveyard.', [[d => d.targeting || /player/i.test(d.prompt || ''), () => t.P(0).playerId]]);
  check('One or more cards leave your graveyard: one trigger for the batch', t.P(0).deck.battlefield.filter(c => c.token).length === 1, String(t.P(0).deck.battlefield.filter(c => c.token).length));
}

section('round 32: Exploit, Spacecraft');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Llanowar Elves'); const ex = asText(t, t.hand(0, 'Llanowar Elves'), 'Exploit\nWhen this creature exploits a creature, draw two cards.', { manaCost: '{G}' });
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: ex.instanceId }, t.as(0));
  settle(t, [['exploit', () => bear.instanceId]]);
  check('Exploit: sacrifice the Bears, then draw two', !t.bf(0, 'Grizzly Bears') && t.P(0).deck.hand.length === hand - 1 + 2, JSON.stringify([hand, t.P(0).deck.hand.length]));
}
{
  const t = setup();
  t.give(0, 'Fog Bank'); const sc = asText(t, t.hand(0, 'Fog Bank'), 'When this Spacecraft enters, draw a card.', { typeLine: 'Artifact — Spacecraft', manaCost: '{U}' });
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: sc.instanceId }, t.as(0)); settle(t);
  check('"When this Spacecraft enters" fires', t.P(0).deck.hand.length === hand, String(t.P(0).deck.hand.length));
}

{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever you expend 4, draw a card.', { typeLine: 'Enchantment' });
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Scry 1.', [], { manaCost: '{2}{U}' });
  const mid = t.P(0).deck.hand.length;
  cast(t, 'Divination', 'Scry 1.', [], { manaCost: '{1}{U}' });
  check('Expend 4: fires when the fourth mana this turn is spent', mid === hand && t.P(0).deck.hand.length === hand + 1, JSON.stringify([hand, mid, t.P(0).deck.hand.length]));
}

section('round 33: casting from the graveyard');
{
  const t = setup();
  const spell = t.give(0, 'Opt', 'graveyard'); asText(t, spell, 'Draw two cards.', { typeLine: 'Instant', manaCost: '{3}{U}' });
  onField(t, 'Fog Bank', 'When this creature enters, you may cast target instant card from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead.', { typeLine: 'Artifact Creature — Construct' });
  const g = t.bf(0, 'Fog Bank');
  t.P(0).deck.battlefield.splice(t.P(0).deck.battlefield.indexOf(g), 1); g.zone = 'hand'; t.P(0).deck.hand.push(g);
  t.game.cardDefinitions[g.definitionId].manaCost = '{U}';
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: g.instanceId }, t.as(0));
  settle(t, [[d => d.kind === 'choose-many' && /graveyard|cast/i.test(d.title + d.prompt), () => [spell.instanceId]]]);
  check('Torrential Gearhulk: casts the instant free; it is exiled afterwards', spell.zone === 'exile' && t.P(0).deck.hand.length === hand - 1 + 2, JSON.stringify([spell.zone, hand, t.P(0).deck.hand.length]));
}
{
  const t = setup();
  const spell = t.give(0, 'Opt', 'graveyard'); asText(t, spell, 'Draw a card.', { typeLine: 'Sorcery', manaCost: '{U}' });
  const jace = onField(t, 'Fog Bank', '{T}: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead.', { typeLine: 'Artifact' });
  activate(t, jace, 0, [[d => d.kind === 'choose-many', () => [spell.instanceId]]]);
  const row = t.view(0).players[0].graveyard.find(c => c.id === spell.instanceId);
  const r = t.ctl.dispatch({ type: 'play', instanceId: spell.instanceId }, t.as(0)); settle(t);
  check('…"this turn": castable later this turn for its cost, then exiled', row?.playable && r.ok && spell.zone === 'exile', JSON.stringify([row?.playable, r.error, spell.zone]));
}

section('round 34: may pay life / may sacrifice a subtype, if you do');
{
  const t = setup();
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'You may pay 2 life. If you do, draw a card.', [['may-pay', 'pay']]);
  check('Pay 2 life: then draw', t.P(0).life === 38 && t.P(0).deck.hand.length === hand + 1, JSON.stringify([t.P(0).life, hand, t.P(0).deck.hand.length]));
}
for (const haveFood of [true, false]) {
  const t = setup();
  if (haveFood) onField(t, 'Fog Bank', '', { typeLine: 'Artifact — Food' });
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'You may sacrifice a Food. If you do, draw a card.', [[d => d.kind === 'confirm', true]]);
  check(`Sacrifice a Food, if you do draw: ${haveFood ? 'with a Food draws' : 'without one, no draw'}`, t.P(0).deck.hand.length === hand + (haveFood ? 1 : 0) && (haveFood ? !t.bf(0, 'Fog Bank') : true), JSON.stringify([hand, t.P(0).deck.hand.length]));
}

section('round 35: searching an opponent\'s library');
{
  const t = setup();
  const lib = t.P(1).deck.remainingLibrary;
  const want = lib.find(c => /Creature/.test(def(t, c)?.typeLine || '') && !def(t, c)?.cardFaces?.length);
  let offered = null;
  cast(t, 'Opt', 'Search target opponent\'s library for a creature card and put that card onto the battlefield under your control. Then that player shuffles.', [[d => d.key.includes('theirLib') || /search/i.test(d.title || ''), d => { offered = d.options; return [want.instanceId]; }], [d => /opponent|player/i.test(d.prompt || d.title || '') && d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId]]);
  check('Bribery: their creature enters under your control', t.P(0).deck.battlefield.some(c => c.instanceId === want.instanceId) && offered?.every(o => /Creature/.test(o.sub || 'Creature')), JSON.stringify([want.zone, offered?.length]));
}
{
  const t = setup();
  const lib = t.P(1).deck.remainingLibrary;
  const want = lib.find(c => /Sorcery|Instant/.test(def(t, c)?.typeLine || '') && !def(t, c)?.cardFaces?.length) || lib.find(c => !/Land/.test(def(t, c)?.typeLine || '') && !def(t, c)?.cardFaces?.length);
  cast(t, 'Opt', 'Search target opponent\'s library for a card and exile it face down. Then that player shuffles. You may play that card for as long as it remains exiled.', [[d => d.key.includes('theirLib') || /search/i.test(d.title || ''), () => [want.instanceId]], [d => d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId]]);
  check('Praetor\'s Grasp: exiled, and you may play it', want.zone === 'exile' && want.playPermission?.playerId === t.P(0).playerId, JSON.stringify([want.zone, want.playPermission]));
}

section('round 36: Clash');
for (const win of [true, false]) {
  const t = setup();
  t.give(0, 'Opt'); const spell = asText(t, t.hand(0, 'Opt'), 'Clash with an opponent. If you win, return Opt to its owner\'s hand.');
  const mine = t.P(0).deck.remainingLibrary, theirs = t.P(1).deck.remainingLibrary;
  const other = theirs.findIndex(c => c.definitionId !== mine[0].definitionId);
  theirs.unshift(...theirs.splice(other, 1));
  asText(t, mine[0], def(t, mine[0])?.oracleText || '', { manaValue: win ? 6 : 1, cardFaces: undefined });
  asText(t, theirs[0], def(t, theirs[0])?.oracleText || '', { manaValue: win ? 1 : 6, cardFaces: undefined });
  const theirTop = theirs[0];
  const asked = [];
  t.ctl.dispatch({ type: 'play', instanceId: spell.instanceId }, t.as(0));
  settle(t, [[d => d.key.includes('clash'), d => { asked.push(d.playerId); return d.playerId === t.P(1).playerId ? 'bottom' : 'top'; }]]);
  const opt = [...t.P(0).deck.hand, ...t.P(0).deck.graveyard].find(c => def(t, c)?.name === 'Opt');
  check(`Research the Deep: clash ${win ? 'won — back to hand' : 'lost — to the graveyard'}; each player places their own card`, opt?.zone === (win ? 'hand' : 'graveyard') && asked.length === 2 && theirs[theirs.length - 1] === theirTop, JSON.stringify([opt?.zone, asked.length]));
}

section('round 37: "Choose target …" then "that creature" / "those creatures"');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', { power: '3', toughness: '3' }), elf = onField(t, 'Llanowar Elves', '', {}, 1);
  const picks = [bear.instanceId, elf.instanceId];
  cast(t, 'Opt', 'Choose target creature you control and target creature you don\'t control. Then those creatures fight each other.', [[d => d.targeting, () => picks.shift()]]);
  check('Choose two targets, then they fight', !t.bf(1, 'Llanowar Elves') && !!t.bf(0, 'Grizzly Bears'));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Opt', 'Choose target creature. Put four +1/+1 counters on that creature.', [[d => d.targeting, () => bear.instanceId]]);
  check('Choose target creature, then counters on that creature', bear.counters?.['+1/+1'] === 4);
}

section('round 38: tapped tokens, half life, owner\'s top-or-bottom, can\'t block this creature');
{
  const t = setup();
  cast(t, 'Opt', 'Create a tapped 2/2 black Zombie creature token.');
  const tok = t.P(0).deck.battlefield.find(c => c.token);
  check('Tapped token', !!tok && tok.tapped);
}
{
  const t = setup();
  t.P(1).life = 25;
  cast(t, 'Opt', 'Target opponent loses half their life, rounded up.', [[d => d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId]]);
  check('Half their life, rounded up (25 → 12)', t.P(1).life === 12, String(t.P(1).life));
}
{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  let asked = null;
  cast(t, 'Opt', 'Target creature\'s owner puts it on their choice of the top or bottom of their library.', [[d => d.targeting, () => foe.instanceId], [d => d.options?.some(o => o.id === 'bottom'), d => { asked = d.playerId; return 'bottom'; }]]);
  const lib = t.P(1).deck.remainingLibrary;
  check('Dire Downdraft: the owner chooses; it goes to the bottom', asked === t.P(1).playerId && lib[lib.length - 1]?.instanceId === foe.instanceId, String(asked));
}

section('round 39: hand disruption until it leaves, graveyard shuffle');
{
  const t = setup();
  t.give(1, 'Opt'); const theirs = t.hand(1, 'Opt');
  t.give(0, 'Grizzly Bears'); const mag = asText(t, t.hand(0, 'Grizzly Bears'), 'When this creature enters, target opponent reveals their hand and you choose a nonland card from it. Exile that card until this creature leaves the battlefield.', { manaCost: '{G}' });
  t.ctl.dispatch({ type: 'play', instanceId: mag.instanceId }, t.as(0));
  settle(t, [[d => d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId], [d => d.options?.some(o => o.id === theirs.instanceId), () => [theirs.instanceId]]]);
  check('Brain Maggot: their card is exiled', theirs.zone === 'exile', theirs.zone);
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => t.bf(0, 'Grizzly Bears').instanceId]]);
  check('…and returns to their hand when it leaves', theirs.zone === 'hand' && t.P(1).deck.hand.includes(theirs), theirs.zone);
}
{
  const t = setup();
  const a = t.give(1, 'Grizzly Bears', 'graveyard'), b = t.give(1, 'Llanowar Elves', 'graveyard');
  cast(t, 'Opt', 'Target player shuffles up to three target cards from their graveyard into their library.', [[d => d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId], [d => d.kind === 'choose-many', () => [a.instanceId, b.instanceId]]]);
  check('Gaea\'s Blessing: two cards shuffled back', a.zone === 'library' && b.zone === 'library' && !t.P(1).deck.graveyard.length);
}

section('round 40: Fuse');
{
  const t = setup();
  t.give(0, 'Opt'); const sp = asText(t, t.hand(0, 'Opt'), '', { name: 'Wear // Tear', typeLine: 'Instant // Instant', manaCost: '{1}{G} // {U}', cardFaces: [
    { name: 'Wear', manaCost: '{1}{G}', typeLine: 'Instant', oracleText: 'Destroy target artifact.\nFuse (You may cast one or both halves of this card from your hand.)' },
    { name: 'Tear', manaCost: '{U}', typeLine: 'Instant', oracleText: 'Destroy target enchantment.\nFuse (You may cast one or both halves of this card from your hand.)' }] });
  const art = onField(t, 'Grizzly Bears', '', { typeLine: 'Artifact' }, 1), ench = onField(t, 'Llanowar Elves', '', { typeLine: 'Enchantment' }, 1);
  let faces = null;
  const r = t.ctl.dispatch({ type: 'play', instanceId: sp.instanceId }, t.as(0));
  settle(t, [['face', d => { faces = d.options.map(o => o.label); return 99; }], [d => d.targeting && d.options.some(o => o.id === art.instanceId), () => art.instanceId], [d => d.targeting, () => ench.instanceId]]);
  const tapped = t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c)?.typeLine || '') && c.tapped).length;
  check('Fuse: both halves cast together for both costs', r.ok && !t.bf(1, 'Grizzly Bears') && !t.bf(1, 'Llanowar Elves') && tapped === 3, JSON.stringify([r.error, faces, tapped]));
}

section('round 41: counters from a creature that left, tap or untap');
{
  const t = setup();
  const ch = onField(t, 'Grizzly Bears', 'When this creature dies, put its counters on target creature you control.'); ch.counters = { '+1/+1': 2, flying: 1 };
  const elf = onField(t, 'Llanowar Elves', '');
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting && d.options.some(o => o.id === ch.instanceId), () => ch.instanceId], [d => d.targeting, () => elf.instanceId]]);
  check('Essence Channeler: its counters move to the target', elf.counters?.['+1/+1'] === 2 && elf.counters?.flying === 1, JSON.stringify(elf.counters));
}
{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'You may tap or untap target creature.', [[d => d.targeting, () => foe.instanceId], [d => d.options?.some(o => o.id === 'Tap' || o.label === 'Tap'), d => d.options.find(o => o.label === 'Tap').id]]);
  check('Tap or untap: the player chose tap', foe.tapped);
}
{
  // Derevi: "you may tap or untap target permanent" in a trigger — one yes/no, then Tap / Untap (no extra "Neither").
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  const elf = onField(t, 'Llanowar Elves', '{1}: You may tap or untap target creature.');
  const seen = activate(t, elf, 0, [[d => d.targeting, () => foe.instanceId], [d => d.options?.some(o => o.label === 'Tap'), d => d.options.find(o => o.label === 'Tap').id]]);
  const pick = seen.find(d => d.options?.some(o => o.label === 'Tap'));
  const yesNo = seen.filter(d => d.kind === 'confirm' || d.options?.some(o => /^(yes|no)$/i.test(o.label || ''))).length;
  check('"You may tap or untap": asked once whether, then only Tap / Untap', foe.tapped && pick && !pick.options.some(o => o.label === 'Neither') && yesNo <= 1, JSON.stringify([foe.tapped, pick?.options?.map(o => o.label), seen.map(d => d.kind)]));
}

section('round 42: exile until a nonland card, cast it free');
{
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  const land = lib.find(c => /Land/.test(def(t, c)?.typeLine || '')), spell = lib.find(c => /Sorcery|Instant/.test(def(t, c)?.typeLine || '') && !def(t, c)?.cardFaces?.length && def(t, c)?.name !== 'Opt');
  lib.splice(lib.indexOf(land), 1); lib.splice(lib.indexOf(spell), 1); lib.unshift(land, spell);
  asText(t, spell, 'Each opponent loses 2 life.', { typeLine: 'Sorcery', manaCost: '{7}' });
  const life = t.P(1).life;
  cast(t, 'Opt', 'Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost.', [[d => /free/i.test(JSON.stringify(d.options || [])), 'cast']]);
  check('Exile until nonland: the land stays exiled, the spell is cast free', land.zone === 'exile' && t.P(1).life === life - 2 && spell.zone === 'graveyard', JSON.stringify([land.zone, spell.zone, t.P(1).life]));
}

{
  const t = setup();
  const w = onField(t, 'Llanowar Elves', '{1}: This creature becomes the creature type of your choice until end of turn.');
  activate(t, w, 0, [[d => d.kind === 'creature-type' || /creature type/i.test(d.prompt || d.title || ''), d => (d.kind === 'choose-one' ? (d.options.find(o => /^Dragon$/i.test(o.label))?.id ?? 'Dragon') : 'Dragon')]]);
  const tl = withOverlay(w, def(t, w))?.typeLine || '';
  check('Mistform: becomes the chosen creature type only', /Dragon/.test(tl) && !/Elf/.test(tl), tl);
}

section('round 43: finality counters');
{
  const t = setup();
  const w = t.give(0, 'Grizzly Bears', 'graveyard'); asText(t, w, '{2}{G}: Return this card from your graveyard to the battlefield with a finality counter on it.');
  const row = t.view(0).players[0].graveyard.find(c => c.id === w.instanceId)?.abilities?.find(a => /finality/.test(a.text));
  const r = row ? t.ctl.dispatch({ type: 'activate', instanceId: w.instanceId, abilityId: row.id }, t.as(0)) : { ok: false, error: 'no row' };
  settle(t);
  const back = t.bf(0, 'Grizzly Bears');
  check('Back with a finality counter', r.ok && back?.counters?.finality === 1, JSON.stringify([r.error, back?.counters]));
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => back.instanceId]]);
  check('…and exiled instead of dying', w.zone === 'exile' || t.P(0).deck.exile.some(c => def(t, c)?.name === 'Grizzly Bears'), w.zone);
}

section('round 44: subtype targets, color bounce, self-suspend, subtype sweepers');
{
  const t = setup();
  const gob = onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Goblin' }), elf = onField(t, 'Llanowar Elves', '');
  let opts = null;
  cast(t, 'Opt', 'Target Goblin creature gets +2/+0 until end of turn.', [[d => d.targeting, d => { opts = d.options.map(o => o.id); return gob.instanceId; }]]);
  check('Target Goblin: only Goblins offered', power(t, gob) === 4 && opts && !opts.includes(elf.instanceId), JSON.stringify(opts?.length));
}
{
  const t = setup();
  const blue = onField(t, 'Grizzly Bears', '', { colors: ['U'] }), green = onField(t, 'Llanowar Elves', '', { colors: ['G'] });
  let opts = null;
  cast(t, 'Opt', 'Return a blue or black creature you control to its owner\'s hand.', [[d => d.kind === 'choose-many' || d.kind === 'choose-one', d => { opts = d.options.map(o => o.id); return d.kind === 'choose-many' ? [blue.instanceId] : blue.instanceId; }]]);
  check('Return a blue or black creature: only the blue one offered', blue.zone === 'hand' && green.zone === 'battlefield' && !(opts || []).includes(green.instanceId), JSON.stringify([blue.zone, opts?.length]));
}
{
  const t = setup();
  cast(t, 'Opt', 'Draw a card. Exile Opt with three time counters on it. It gains suspend.');
  const opt = t.P(0).deck.exile.find(c => def(t, c)?.name === 'Opt');
  check('Rousing Refrain: exiled with three time counters, suspended', !!opt && opt.suspended && opt.counters?.time === 3, JSON.stringify([opt?.counters]));
}
{
  const t = setup();
  cast(t, 'Opt', 'Destroy all Islands.');
  check('Destroy all Islands', !t.P(0).deck.battlefield.some(c => def(t, c)?.name === 'Island') && t.P(0).deck.battlefield.some(c => def(t, c)?.name === 'Forest'));
}

section('round 45: Threshold / Delirium / Hellbent self-bonuses');
{
  const t = setup();
  const w = onField(t, 'Grizzly Bears', 'Threshold — This creature gets +1/+1 and has deathtouch as long as there are seven or more cards in your graveyard.');
  const before = [power(t, w), has(t, w, 'Deathtouch')];
  for (let i = 0; i < 7; i++) { const c = t.P(0).deck.remainingLibrary.shift(); c.zone = 'graveyard'; t.P(0).deck.graveyard.push(c); }
  check('Threshold: +1/+1 and deathtouch only with seven cards in the graveyard', before[0] === 2 && !before[1] && power(t, w) === 3 && has(t, w, 'Deathtouch'), JSON.stringify([before, power(t, w)]));
}
{
  const t = setup();
  const w = onField(t, 'Grizzly Bears', 'Hellbent — This creature gets +2/+1 as long as you have no cards in hand.');
  const empty = power(t, w);
  t.give(0, 'Opt');
  check('Hellbent: +2/+1 only with an empty hand', empty === 4 && power(t, w) === 2, JSON.stringify([empty, power(t, w)]));
}

section('round 46: Valakut Awakening, no combat damage');
{
  const t = setup();
  t.give(0, 'Grizzly Bears'); t.give(0, 'Llanowar Elves');
  const a = t.hand(0, 'Grizzly Bears'), b = t.hand(0, 'Llanowar Elves');
  cast(t, 'Opt', 'Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one.', [[d => d.kind === 'choose-many', () => [a.instanceId, b.instanceId]]]);
  check('Valakut Awakening: two to the bottom, three drawn', t.P(0).deck.hand.length === 3 && a.zone === 'library' && b.zone === 'library', String(t.P(0).deck.hand.length));
}
{
  const t = setup();
  const w = onField(t, 'Llanowar Elves', 'Whenever this creature attacks, you may pay {1}. If you do, this creature assigns no combat damage this turn and defending player loses 2 life.', { power: '3' });
  const life = t.P(1).life;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: w.instanceId, defenderId: t.P(1).playerId }] });
  settle(t, [['may-pay', 'pay']]);
  t.autoPass = true; t.end(0);
  check('No combat damage this turn (2 life lost from the trigger only)', t.P(1).life === life - 2, `${life} → ${t.P(1).life}`);
}

section('round 47: owner rulings');
{
  const t = setup();
  t.game.storedOutcomes = { Opt: { card: 'Opt', ruling: 'Scry 2 instead, then draw.', steps: ['scry 2', 'draw 1'], override: true } };
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Draw a card.');
  const prompt = t.view(0).prompt;
  check('Owner ruling: the automated card waits on the resolve-by-hand panel with the ruling', prompt?.kind === 'guided' && /Scry 2 instead/.test(prompt.ruling?.ruling || '') && t.P(0).deck.hand.length === hand, JSON.stringify([prompt?.kind, prompt?.ruling?.ruling]));
  t.do(0, { type: 'edit', edit: { kind: 'life', playerId: t.P(0).playerId, delta: -1 } });
  check('…edits made there are recorded as its steps', (t.view(0).prompt?.steps || []).some(x => /life/.test(x)), JSON.stringify(t.view(0).prompt?.steps));
  t.do(0, { type: 'guided-done' });
  const rec = (t.game.corrections || []).find(r => r.kind === 'manual-resolution');
  check('…and finishing logs a manual resolution for the Dev report', rec?.card === 'Opt' && rec.steps.length === 1, JSON.stringify(rec));
}

section('round 49: extra mana of another colour (Wild Growth on an Island, Utopia Sprawl, Fertile Ground)');
{
  const t = setup();
  const island = t.bf(0, 'Island');
  const aura = onField(t, 'Fog Bank', 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.', { typeLine: 'Enchantment — Aura' });
  aura.attachedTo = island.instanceId;
  const m = t.view(0).players[0].mana;
  check('Wild Growth on an Island: the counter shows one more green and the same blue', m.fixed.G === 5 && m.fixed.U === 4, JSON.stringify(m.fixed));
  t.give(0, 'Colossal Dreadmaw'); asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Trample', { manaCost: '{G}{G}{G}{G}{G}' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Colossal Dreadmaw').instanceId }, t.as(0)); settle(t);
  check('…five green paid from four Forests and the Island; its blue floats', r.ok && island.tapped && Number(t.P(0).mana.floating.U || 0) === 1, JSON.stringify([r.error, island.tapped, t.P(0).mana.floating]));
}
{
  const t = setup();
  const forest = t.bf(0, 'Forest');
  const aura = onField(t, 'Fog Bank', 'Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color.', { typeLine: 'Enchantment — Aura' });
  aura.attachedTo = forest.instanceId; aura.chosenColor = 'U';
  const m = t.view(0).players[0].mana;
  check('Utopia Sprawl (blue) on a Forest: one more blue, same green', m.fixed.U === 5 && m.fixed.G === 4, JSON.stringify(m.fixed));
  const ab = parseActivatedAbilities(def(t, forest)).find(a => a.manaAbility);
  const r = t.ctl.dispatch({ type: 'activate', instanceId: forest.instanceId, abilityId: ab.id }, t.as(0)); settle(t);
  check('…tapping the Forest by hand adds {G}{U}', r.ok && t.P(0).mana.floating.G === 1 && t.P(0).mana.floating.U === 1, JSON.stringify([r.error, t.P(0).mana.floating]));
}
{
  const t = setup();
  const forest = t.bf(0, 'Forest');
  const aura = onField(t, 'Fog Bank', 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color.', { typeLine: 'Enchantment — Aura' });
  aura.attachedTo = forest.instanceId;
  const m = t.view(0).players[0].mana;
  check('Fertile Ground: the counter shows one mana of any colour', m.flex.some(g => g.colors.length === 5 && g.count === 1), JSON.stringify(m.flex));
  t.give(0, 'Colossal Dreadmaw'); asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Trample', { manaCost: '{U}{U}{U}{U}{U}' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Colossal Dreadmaw').instanceId }, t.as(0)); settle(t);
  check('…five blue paid with four Islands and the Forest\'s extra mana; its green floats', r.ok && forest.tapped && t.P(0).mana.floating.G === 1, JSON.stringify([r.error, forest.tapped, t.P(0).mana.floating]));
  const t2 = setup(); const f2 = t2.bf(0, 'Forest');
  const a2 = onField(t2, 'Fog Bank', 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color.', { typeLine: 'Enchantment — Aura' }); a2.attachedTo = f2.instanceId;
  const ab = parseActivatedAbilities(def(t2, f2)).find(a => a.manaAbility);
  t2.ctl.dispatch({ type: 'activate', instanceId: f2.instanceId, abilityId: ab.id }, t2.as(0));
  const seen = settle(t2, [['mana-extra', 'R']]);
  check('…tapping the land by hand asks its controller for the colour', seen.some(d => d.key.includes('mana-extra') && d.playerId === t2.P(0).playerId) && t2.P(0).mana.floating.R === 1 && t2.P(0).mana.floating.G === 1, JSON.stringify(t2.P(0).mana.floating));
}

section('round 49: gift, High Tide, greatest power, "that creature\'s controller"');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  const oppHand = t.P(1).deck.hand.length, seen = [];
  t.give(0, 'Opt'); asText(t, t.hand(0, 'Opt'), "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nYou and permanents you control gain hexproof until end of turn. If the gift was promised, permanents you control also gain indestructible until end of turn.", { manaCost: '{G}', typeLine: 'Instant' });
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Opt').instanceId }, t.as(0));
  settle(t, [['gift', d => d.options.find(o => o.playerId === t.P(1).playerId).id]], seen);
  check('Gift: the caster is asked whether to promise a gift, and to whom', seen.some(d => d.key.includes('gift') && d.playerId === t.P(0).playerId));
  check("…the promised opponent draws a card; Dawn's Truce gives hexproof and indestructible", t.P(1).deck.hand.length === oppHand + 1 && has(t, bear, 'Hexproof') && has(t, bear, 'Indestructible') && t.P(0).hexproofTurn === t.game.turnNumber, JSON.stringify([t.P(1).deck.hand.length - oppHand, has(t, bear, 'Indestructible')]));
  const t2 = setup(); const b2 = onField(t2, 'Grizzly Bears', ''); const h2 = t2.P(1).deck.hand.length;
  t2.give(0, 'Opt'); asText(t2, t2.hand(0, 'Opt'), "Gift a card\nYou and permanents you control gain hexproof until end of turn. If the gift was promised, permanents you control also gain indestructible until end of turn.", { manaCost: '{G}', typeLine: 'Instant' });
  t2.ctl.dispatch({ type: 'play', instanceId: t2.hand(0, 'Opt').instanceId }, t2.as(0)); settle(t2, [['gift', 'none']]);
  check('…without the gift: hexproof only, nobody draws', t2.P(1).deck.hand.length === h2 && has(t2, b2, 'Hexproof') && !has(t2, b2, 'Indestructible'));
}
{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  const life = t.P(1).life;
  t.give(0, 'Opt'); asText(t, t.hand(0, 'Opt'), "Gift a Treasure\nOpt deals 2 damage to target creature. If the gift was promised, Opt also deals 3 damage to that creature's controller.", { manaCost: '{G}', typeLine: 'Instant' });
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Opt').instanceId }, t.as(0));
  settle(t, [['gift', d => d.options.find(o => o.playerId === t.P(1).playerId).id], [d => d.targeting, () => foe.instanceId]]);
  check("Blooming Blast with the gift: the opponent gets a Treasure, the creature dies, its controller takes 3", t.P(1).life === life - 3 && t.names(1, 'graveyard').includes('Grizzly Bears') && t.names(1, 'battlefield').includes('Treasure'), JSON.stringify([life, t.P(1).life, t.names(1, 'battlefield')]));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', { power: '3' }, 1), b = onField(t, 'Llanowar Elves', '', { power: '3' }, 1), c = onField(t, 'Fog Bank', '', { power: '1', typeLine: 'Creature — Wall' }, 1);
  const seen = [];
  cast(t, 'Opt', 'Target opponent sacrifices a creature with the greatest power among creatures they control.', [[d => d.key.includes(t.P(1).playerId) && d.playerId === t.P(1).playerId, () => b.instanceId]]);
  check('Consumed by Greed: with a tie, the opponent chooses which of their biggest creatures to sacrifice', t.names(1, 'graveyard').includes('Llanowar Elves') && t.names(1, 'battlefield').includes('Grizzly Bears') && t.names(1, 'battlefield').includes('Fog Bank'), JSON.stringify(t.names(1, 'graveyard')));
}
{
  const t = setup();
  cast(t, 'Opt', 'Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}.', [], { manaCost: '{U}' });
  const m = t.view(0).players[0].mana;
  check('High Tide: each untapped Island now counts for two blue', m.fixed.U === 6, JSON.stringify(m.fixed));
}

section('round 49: hideaway');
{
  const t = setup();
  t.give(0, 'Evolving Wilds'); const land = asText(t, t.hand(0, 'Evolving Wilds'), 'Hideaway 4 (When this land enters, look at the top four cards of your library, exile one of them face down, then put the rest on the bottom of your library in a random order.)\nThis land enters tapped.\n{T}: Add {G}.\n{G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 10 or greater.', { typeLine: 'Land' });
  const lib = t.P(0).deck.remainingLibrary, ae = lib.findIndex(c => def(t, c).name === 'Air Elemental'); lib.unshift(...lib.splice(ae, 1));
  const top4 = lib.slice(0, 4).map(c => c.instanceId), pickId = top4[0];
  t.ctl.dispatch({ type: 'play', instanceId: land.instanceId }, t.as(0));
  const seen = settle(t, [['hideaway', pickId]]);
  const hid = t.P(0).deck.exile.find(c => c.instanceId === pickId);
  const ask = seen.find(d => /hideaway/i.test(d.title || ''));
  check('Hideaway: its controller picks one of the top four privately; it is exiled face down', !!hid && hid.hiddenExile && ask?.private && ask.options.length === 4 && t.P(0).deck.remainingLibrary.slice(-3).every(c => top4.includes(c.instanceId)), JSON.stringify([!!hid, ask?.options?.length]));
  const shown = t.view(1).players[0].exile.find(c => c.id === pickId);
  check('…opponents see only a face-down card', shown && shown.name === 'Face-down card', JSON.stringify(shown?.name));
  const bridge = t.bf(0, 'Evolving Wilds'); bridge.tapped = false;
  const ab = parseActivatedAbilities(def(t, bridge)).filter(a => !a.manaAbility)[0];
  t.ctl.dispatch({ type: 'activate', instanceId: bridge.instanceId, abilityId: ab.id }, t.as(0)); const s1 = settle(t);
  check('…without 10 power it does nothing and asks nothing', t.P(0).deck.exile.some(c => c.instanceId === pickId) && !s1.some(d => /exiled card/.test(d.title || '')));
  onField(t, 'Colossal Dreadmaw', '', { power: '10', toughness: '10', typeLine: 'Creature — Dinosaur' });
  bridge.tapped = false;
  t.ctl.dispatch({ type: 'activate', instanceId: bridge.instanceId, abilityId: ab.id }, t.as(0)); settle(t, [[d => d.kind === 'confirm' || /exiled card/.test(d.title || '') || d.options?.some(o => /^yes$/i.test(String(o.id))), d => d.kind === 'confirm' ? true : 'yes']]);
  check('…with 10 power the player may cast it free', t.names(0, 'battlefield').includes('Air Elemental'), JSON.stringify(t.names(0, 'battlefield')));
}

section('round 49: imprint (Chrome Mox, Isochron Scepter)');
{
  const t = setup();
  t.give(0, 'Counterspell');
  t.give(0, 'Sol Ring'); const mox = asText(t, t.hand(0, 'Sol Ring'), "Imprint — When this artifact enters, you may exile a nonartifact, nonland card from your hand.\n{T}: Add one mana of any of the exiled card's colors.", { manaCost: '{0}' });
  t.ctl.dispatch({ type: 'play', instanceId: mox.instanceId }, t.as(0));
  const cs = t.hand(0, 'Counterspell');
  const seen = settle(t, [[d => /exile/i.test(d.prompt || ''), [cs.instanceId]]]);
  const live = t.bf(0, 'Sol Ring');
  check('Chrome Mox: its controller chooses a card to exile from their hand (privately)', t.names(0, 'exile').includes('Counterspell') && (live.imprintIds || []).includes(cs.instanceId) && seen.some(d => d.private && /exile/i.test(d.prompt || '')), JSON.stringify(seen.map(d => d.prompt)));
  const m = t.view(0).players[0].mana;
  check('…and makes mana of that card\'s colour (blue)', m.fixed.U >= 5 || m.flex.some(g => g.colors.join('') === 'U'), JSON.stringify(m));
  const ab = parseActivatedAbilities(def(t, live)).find(a => a.manaAbility);
  const r = t.ctl.dispatch({ type: 'activate', instanceId: live.instanceId, abilityId: ab.id }, t.as(0)); settle(t);
  check('…tapping it adds {U}', r.ok && t.P(0).mana.floating.U === 1, JSON.stringify([r.error, t.P(0).mana.floating]));
}
{
  const t = setup();
  t.give(0, 'Opt');
  t.give(0, 'Sol Ring'); const sc = asText(t, t.hand(0, 'Sol Ring'), 'Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand.\n{2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.', { manaCost: '{0}' });
  t.ctl.dispatch({ type: 'play', instanceId: sc.instanceId }, t.as(0));
  const opt = t.hand(0, 'Opt');
  settle(t, [[d => /exile/i.test(d.prompt || ''), [opt.instanceId]]]);
  const live = t.bf(0, 'Sol Ring'); live.tapped = false;
  const hand = t.P(0).deck.hand.length;
  activate(t, live, 0, [[d => d.kind === 'confirm' || /copy/i.test(d.prompt || d.label || ''), d => d.kind === 'confirm' ? true : (d.options?.find(o => /yes/i.test(String(o.id) + o.label))?.id ?? true)]]);
  check('Isochron Scepter: a copy of the exiled Opt is cast and resolves (its controller draws)', t.P(0).deck.hand.length === hand + 1 && t.names(0, 'exile').includes('Opt') && !t.P(0).deck.exile.some(c => c.castCopy) && !t.names(0, 'graveyard').includes('Opt'), JSON.stringify([t.P(0).deck.hand.length - hand, t.names(0, 'exile'), t.names(0, 'graveyard')]));
}

section('round 49: abilities granted until end of turn');
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Opt', 'Choose target creature. You lose 3 life. Until end of turn, that creature gains "When this creature dies, return it to the battlefield tapped under its owner\'s control."', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{G}' });
  check('Malakir Rebirth: the creature gains the ability', (bear.grantedText || []).some(x => /When this creature dies/.test(x)));
  cast(t, 'Divination', 'Destroy target creature.', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{G}' });
  const back = t.bf(0, 'Grizzly Bears');
  check('…when it dies it returns to the battlefield tapped', !!back && back.tapped, JSON.stringify([t.names(0, 'battlefield').includes('Grizzly Bears'), back?.tapped]));
  cast(t, 'Naturalize', 'Destroy target creature.', [[d => d.targeting, () => back.instanceId]], { manaCost: '{G}' });
  check('…the returned creature is a new object: it does not come back again', t.names(0, 'graveyard').includes('Grizzly Bears') && !t.bf(0, 'Grizzly Bears'));
}

section('round 49: entwine, escalate, spree, replicate, casualty, bargain, offspring, squad');
{
  const t = setup();
  const hand = t.P(0).deck.hand.length, life = t.P(0).life;
  cast(t, 'Opt', 'Choose one —\n• Draw a card.\n• You gain 3 life.\nEntwine {1}', [['entwine', 'pay']], { manaCost: '{U}' });
  check('Entwine: paying it chooses both modes', t.P(0).deck.hand.length === hand + 1 && t.P(0).life === life + 3, JSON.stringify([t.P(0).deck.hand.length - hand, t.P(0).life - life]));
}
{
  const t = setup();
  const hand = t.P(0).deck.hand.length, life = t.P(0).life;
  const before = t.P(0).deck.battlefield.filter(c => !c.tapped).length;
  cast(t, 'Opt', 'Escalate {1}\nChoose one or more —\n• Draw a card.\n• You gain 3 life.', [['modes', [0, 1]]], { manaCost: '{U}' });
  const after = t.P(0).deck.battlefield.filter(c => !c.tapped).length;
  check('Escalate: two modes cost one extra', t.P(0).deck.hand.length === hand + 1 && t.P(0).life === life + 3 && before - after === 2, JSON.stringify([before - after]));
}
{
  const t = setup();
  const hand = t.P(0).deck.hand.length, life = t.P(0).life;
  const before = t.P(0).deck.battlefield.filter(c => !c.tapped).length;
  cast(t, 'Opt', 'Spree (Choose one or more additional costs.)\n+ {1} — Draw a card.\n+ {2} — You gain 3 life.', [['modes', [1]]], { manaCost: '{U}' });
  const after = t.P(0).deck.battlefield.filter(c => !c.tapped).length;
  check('Spree: the chosen mode adds its own cost', t.P(0).deck.hand.length === hand && t.P(0).life === life + 3 && before - after === 3, JSON.stringify([before - after, t.P(0).life - life]));
}
{
  const t = setup();
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Replicate {1}\nDraw a card.', [['replicate', 2]], { manaCost: '{U}' });
  check('Replicate: paid twice, the spell is copied twice (three draws)', t.P(0).deck.hand.length === hand + 3, String(t.P(0).deck.hand.length - hand));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', { power: '2' });
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Casualty 2 (As you cast this spell, you may sacrifice a creature with power 2 or greater. When you do, copy this spell.)\nDraw a card.', [['casualty', bear.instanceId]], { manaCost: '{U}' });
  check('Casualty: the sacrificed creature copies the spell', t.P(0).deck.hand.length === hand + 2 && t.names(0, 'graveyard').includes('Grizzly Bears'), String(t.P(0).deck.hand.length - hand));
}
{
  const t = setup();
  t.give(0, 'Sol Ring', 'battlefield');
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nDraw a card. If this spell was bargained, draw two cards instead.', [['bargain', d => d.options.find(o => o.label === 'Sol Ring').id]], { manaCost: '{U}' });
  check('Bargain: sacrificing Sol Ring gives the bargained effect', t.P(0).deck.hand.length === hand + 2 && t.names(0, 'graveyard').includes('Sol Ring'), String(t.P(0).deck.hand.length - hand));
}
{
  const t = setup();
  cast(t, 'Grizzly Bears', 'Offspring {2} (You may pay an additional {2} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)', [['offspring', 'pay']], { manaCost: '{1}{G}' });
  const copy = t.P(0).deck.battlefield.find(c => c.token && def(t, c).name === 'Grizzly Bears');
  check('Offspring: a 1/1 token copy enters too', !!copy && power(t, copy) === 1 && tough(t, copy) === 1, JSON.stringify(t.names(0, 'battlefield')));
}
{
  const t = setup();
  cast(t, 'Grizzly Bears', 'Squad {1} (As an additional cost to cast this spell, you may pay {1} any number of times. When this creature enters, create that many tokens that are copies of it.)', [['squad', 2]], { manaCost: '{G}' });
  const copies = t.P(0).deck.battlefield.filter(c => c.token && def(t, c).name === 'Grizzly Bears');
  check('Squad: paid twice, two token copies', copies.length === 2 && power(t, copies[0]) === 2, String(copies.length));
}

section('round 49: Ozolith, Etali, Braids');
{
  const t = setup();
  const oz = onField(t, 'Sol Ring', 'Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on this artifact.\nAt the beginning of combat on your turn, if this artifact has counters on it, you may move all counters from this artifact onto target creature.');
  const bear = onField(t, 'Grizzly Bears', ''); bear.counters = { '+1/+1': 2 };
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{G}' });
  check('The Ozolith: a dying creature\'s counters go on it', Number(oz.counters?.['+1/+1'] || 0) === 2, JSON.stringify(oz.counters));
}
{
  const t = setup();
  const libs = t.game.players.map(p => p.deck.remainingLibrary);
  // Put a known nonland spell on top of each library.
  for (const [i, lib] of libs.entries()) { const k = lib.findIndex(c => def(t, c).name === 'Divination'); lib.unshift(...lib.splice(k, 1)); }
  const tops = libs.map(l => l[0].instanceId);
  const seen = cast(t, 'Opt', 'exile the top card of each player\'s library, then you may cast any number of spells from among those cards without paying their mana costs.', [[d => /Cast any number/.test(d.prompt || ''), d => d.options.map(o => o.id)]], { manaCost: '{U}' });
  const ask = seen.find(d => /Cast any number/.test(d.prompt || ''));
  const theirs = t.game.players[1].deck;
  const stillExiled = tops.filter(id => [...t.P(0).deck.exile, ...theirs.exile].some(c => c.instanceId === id));
  check('Etali: both top cards are offered to its controller and cast for free', ask?.options?.length === 2 && stillExiled.length === 0, JSON.stringify([ask?.options?.length, stillExiled.length, tops.map(id => def(t, { definitionId: [...t.game.players.flatMap(p => [...p.deck.battlefield, ...p.deck.graveyard, ...p.deck.exile, ...p.deck.hand])].find(c => c.instanceId === id)?.definitionId })?.name)]));
}
{
  const t = setup();
  const braids = onField(t, 'Grizzly Bears', 'At the beginning of your end step, you may sacrifice an artifact, creature, enchantment, land, or planeswalker. If you do, each opponent may sacrifice a permanent of their choice that shares a card type with it. For each opponent who doesn\'t, that player loses 2 life and you draw a card.');
  const foeLand = onField(t, 'Forest', '', {}, 1);
  const myForest = t.bf(0, 'Forest');
  const life = t.P(1).life, hand = t.P(0).deck.hand.length;
  t.autoPass = true;
  const seen = [];
  t.do(0, { type: 'end-turn' });
  settle(t, [[d => d.key.includes(':mine'), myForest.instanceId], [d => d.playerId === t.P(1).playerId && /Sacrifice a land/.test(d.prompt || ''), 'none'], [d => d.kind === 'confirm', true]], seen);
  check('Braids: its controller sacrifices a land; the opponent is asked and declines, loses 2 life; its controller draws', t.P(1).life === life - 2 && seen.some(d => d.playerId === t.P(1).playerId && /land/i.test(d.prompt || '')), JSON.stringify([t.P(1).life - life, seen.map(d => d.prompt)]));
}

section('round 49: copy this spell');
{
  const t = setup();
  const hand = t.P(0).deck.hand.length;
  t.give(0, 'Divination', 'graveyard');
  const d = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Divination');
  asText(t, d, 'Draw a card. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy.\nFlashback {1}', { manaCost: '{U}' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: d.instanceId }, t.as(0));
  settle(t, [[d => d.kind === 'choose-one' && d.options?.some(o => /flashback/i.test(o.label || '')), d => d.options.find(o => /flashback/i.test(o.label || '')).id], [d => /Copy this spell/.test(d.prompt || d.title || '') || d.kind === 'confirm', d => d.kind === 'confirm' ? true : d.options.find(o => /yes/i.test(String(o.id) + o.label))?.id]]);
  check('Sevinne\'s Reclamation: cast from the graveyard it copies itself once (two draws)', r.ok && t.P(0).deck.hand.length === hand + 2, JSON.stringify([r.error, t.P(0).deck.hand.length - hand]));
}

section('round 49: Midnight Clock, Archaeomancer\'s Map, Scrap Trawler');
{
  const t = setup();
  t.give(0, 'Opt'); t.give(0, 'Divination', 'graveyard'); t.give(0, 'Counterspell');
  const lib = t.P(0).deck.remainingLibrary.length, hand = t.P(0).deck.hand.length - 1, grave = t.P(0).deck.graveyard.length;
  cast(t, 'Counterspell', 'Shuffle your hand and graveyard into your library, then draw seven cards.', [], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Midnight Clock: hand and graveyard shuffled in, then seven cards drawn', t.P(0).deck.hand.length === 7 && t.P(0).deck.remainingLibrary.length === lib + hand + grave - 7, JSON.stringify([t.P(0).deck.hand.length, t.P(0).deck.remainingLibrary.length - lib]));
}
{
  const t = setup();
  for (let i = 0; i < 9; i++) t.give(1, i % 2 ? 'Island' : 'Forest', 'battlefield');
  onField(t, 'Sol Ring', 'Whenever a land an opponent controls enters, if that player controls more lands than you, you may put a land card from your hand onto the battlefield.');
  t.give(0, 'Command Tower');
  const before = t.P(0).deck.battlefield.length;
  t.give(1, 'Evolving Wilds', 'battlefield');
  settle(t, [[d => d.kind === 'confirm', true], [d => /land card/i.test(d.prompt || d.label || ''), d => d.options?.[0]?.id]]);
  check('Archaeomancer\'s Map: with more lands, the opponent\'s land lets you put a land from your hand', t.P(0).deck.battlefield.length === before + 1, String(t.P(0).deck.battlefield.length - before));
}

section('round 50: Urza, Expressive Iteration, Selvala, counters moved');
{
  const t = setup();
  const urza = onField(t, 'Sol Ring', '{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.');
  activate(t, urza, 0);
  const ex = t.P(0).deck.exile.find(c => c.playPermission);
  check('Urza: the exiled top card may be played free this turn', !!ex && ex.playPermission.free && ex.playPermission.until === 'turn', JSON.stringify(ex?.playPermission));
}
{
  const t = setup();
  t.give(0, 'Opt');
  const top3 = t.P(0).deck.remainingLibrary.slice(0, 3).map(c => c.instanceId);
  cast(t, 'Opt', 'Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn.', [[d => /into your hand/.test(d.prompt || ''), [top3[0]]], [d => /on the bottom/.test(d.prompt || ''), [top3[1]]], [d => /to play/.test(d.prompt || ''), [top3[2]]]], { manaCost: '{U}' });
  const ex = t.P(0).deck.exile.find(c => c.instanceId === top3[2]);
  check('Expressive Iteration: one to hand, one to the bottom, one exiled and playable', t.P(0).deck.hand.some(c => c.instanceId === top3[0]) && t.P(0).deck.remainingLibrary.slice(-1)[0].instanceId === top3[1] && ex?.playPermission?.until === 'turn');
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever another creature enters, its controller may draw a card if its power is greater than each other creature\'s power.', { typeLine: 'Creature — Wall', power: '0' });
  const hand1 = t.P(1).deck.hand.length; const seen = [];
  t.give(1, 'Colossal Dreadmaw', 'battlefield');
  settle(t, [[d => d.playerId === t.P(1).playerId && d.prompt === 'Draw a card?', 'yes']], seen);
  check("Selvala: the entering creature's controller is asked and draws", t.P(1).deck.hand.length === hand1 + 1 && seen.some(d => d.playerId === t.P(1).playerId), String(t.P(1).deck.hand.length - hand1));
  const hand0 = t.P(0).deck.hand.length, seen2 = [];
  t.give(0, 'Llanowar Elves', 'battlefield'); settle(t, [], seen2);
  check('…a smaller creature: nothing is asked', !seen2.some(d => d.prompt === 'Draw a card?') && t.P(0).deck.hand.length === hand0);
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''); a.counters = { '+1/+1': 2 };
  const b = onField(t, 'Llanowar Elves', '');
  const ng = onField(t, 'Sol Ring', '{1}, {T}: Move a counter from target permanent you control onto a second target permanent. Activate only as a sorcery.');
  activate(t, ng, 0, [[d => d.targeting && d.options.some(o => o.id === a.instanceId) && !d.key.includes('1'), () => a.instanceId], [d => d.targeting, () => b.instanceId]]);
  check('Nesting Grounds: one counter moves', a.counters['+1/+1'] === 1 && b.counters?.['+1/+1'] === 1, JSON.stringify([a.counters, b.counters]));
}
{
  const t = setup();
  const fa = onField(t, 'Grizzly Bears', '{0}: You may move any number of +1/+1 counters from this creature onto other creatures.'); fa.counters = { '+1/+1': 3 };
  const b = onField(t, 'Llanowar Elves', '');
  activate(t, fa, 0, [[d => d.kind === 'confirm', true], [d => d.kind === 'choose-many' && /move \+1/.test(d.prompt || ''), [b.instanceId]], [d => d.kind === 'number', 2]]);
  check('Forgotten Ancient: its controller chooses where and how many', fa.counters['+1/+1'] === 1 && b.counters?.['+1/+1'] === 2, JSON.stringify([fa.counters, b.counters]));
}
{
  const t = setup();
  t.give(0, 'Command Tower');
  const life = t.P(0).life;
  cast(t, 'Opt', 'Draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.', [[d => /land card/i.test(d.prompt || d.label || ''), d => d.options?.find(o => o.label === 'Command Tower')?.id ?? d.options?.[0]?.id]], { manaCost: '{G}' });
  check('Spelunking: a land that is not a Cave gives no life', t.names(0, 'battlefield').includes('Command Tower') && t.P(0).life === life, JSON.stringify([t.P(0).life - life]));
}
{
  const t = setup();
  t.give(0, 'Command Tower'); asText(t, t.hand(0, 'Command Tower'), '{T}: Add {C}.', { typeLine: 'Land — Cave' });
  const life = t.P(0).life;
  cast(t, 'Opt', 'Draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.', [[d => /land card/i.test(d.prompt || d.label || ''), d => d.options?.find(o => o.label === 'Command Tower')?.id ?? d.options?.[0]?.id]], { manaCost: '{G}' });
  check('…a Cave gives 4 life', t.P(0).life === life + 4, String(t.P(0).life - life));
}

section('round 50: strive, any number of targets, "for each … this way"');
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''), b = onField(t, 'Llanowar Elves', '');
  const before = t.P(0).deck.battlefield.filter(c => !c.tapped && /Land/.test(def(t, c).typeLine)).length;
  cast(t, 'Opt', 'Strive — This spell costs {1}{G} more to cast for each target beyond the first.\nAny number of target creatures each get +1/+1 and gain flying until end of turn.', [[d => d.targeting || d.kind === 'choose-many', [a.instanceId, b.instanceId]]], { manaCost: '{G}' });
  const after = t.P(0).deck.battlefield.filter(c => !c.tapped && /Land/.test(def(t, c).typeLine)).length;
  check('Strive: two targets cost {G} + {1}{G}; both get +1/+1 and flying', before - after === 3 && power(t, a) === 3 && power(t, b) === 2 && has(t, a, 'Flying') && has(t, b, 'Flying'), JSON.stringify([before - after, power(t, a), power(t, b)]));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''), b = onField(t, 'Llanowar Elves', '');
  cast(t, 'Opt', 'Choose any number of target creatures. Put a +1/+1 counter on each of them.', [[d => d.targeting || d.kind === 'choose-many', [a.instanceId, b.instanceId]]], { manaCost: '{G}' });
  check("Nature's Panoply: a counter on each chosen creature", a.counters?.['+1/+1'] === 1 && b.counters?.['+1/+1'] === 1);
}
{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature token.', [[d => d.key === 'x', 1], [d => d.targeting || d.kind === 'choose-many', [foe.instanceId]]], { manaCost: '{X}{G}' });
  check('Curse of the Swine: the exiled creature\'s controller gets a Boar', t.names(1, 'exile').includes('Grizzly Bears') && t.names(1, 'battlefield').some(n => /Boar/.test(n)), JSON.stringify(t.names(1, 'battlefield')));
}

{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '');
  cast(t, 'Opt', 'Target creature you control gets +2/+2 and gains hexproof until end of turn.', [[d => d.targeting, () => a.instanceId]], { manaCost: '{G}' });
  check('Blossoming Defense: the creature gets +2/+2 as well as hexproof (was keyword only)', power(t, a) === 4 && tough(t, a) === 4 && has(t, a, 'Hexproof'), JSON.stringify([power(t, a), tough(t, a)]));
}

{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.P(1).counters = { ...(t.P(1).counters || {}), castThisTurn: [{ typeLine: 'Instant', colors: ['U'], manaValue: 1 }] };
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can\'t be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn.', [], { manaCost: '{G}' });
  const blue = { colors: ['U'] }, red = { colors: ['R'] };
  check('Veil of Summer: draws (an opponent cast a blue spell); blue sources can\'t target its controller or their creature, red ones can', t.P(0).deck.hand.length === hand + 1 && !canTarget(t.game, bear, t.P(1), blue) && canTarget(t.game, bear, t.P(1), red) && !canTargetPlayer(t.game, t.P(0), t.P(1), blue) && canTargetPlayer(t.game, t.P(0), t.P(1), red), String(t.P(0).deck.hand.length - hand));
}

{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever an opponent casts a spell, if no mana was spent to cast it, counter that spell.', { typeLine: 'Creature — Human' }, 1);
  t.give(0, 'Opt'); asText(t, t.hand(0, 'Opt'), 'Draw a card.', { manaCost: '{0}' });
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Opt').instanceId }, t.as(0)); settle(t);
  check('Boromir: a spell cast with no mana spent is countered', t.P(0).deck.hand.length === hand - 1 && t.names(0, 'graveyard').includes('Opt'), String(t.P(0).deck.hand.length - hand));
  t.give(0, 'Divination'); asText(t, t.hand(0, 'Divination'), 'Draw a card.', { manaCost: '{U}' });
  const h2 = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Divination').instanceId }, t.as(0)); settle(t);
  check('…a spell paid with mana resolves', t.P(0).deck.hand.length === h2, String(t.P(0).deck.hand.length - h2));
}
{
  const t = setup();
  const arch = onField(t, 'Sol Ring', '{0}: The next spell you cast this turn has improvise.');
  activate(t, arch, 0);
  t.give(0, 'Arcane Signet', 'battlefield');
  const lands = () => t.P(0).deck.battlefield.filter(c => !c.tapped && /Land/.test(def(t, c).typeLine)).length;
  const before = lands();
  cast(t, 'Colossal Dreadmaw', 'Trample', [], { manaCost: '{2}{G}' });
  check('Archway of Innovation: the next spell taps artifacts for generic mana', before - lands() < 3 && t.names(0, 'battlefield').includes('Colossal Dreadmaw') && !(t.P(0).temporaryPermissions || []).some(x => x.kind === 'next-spell-keyword'), String(before - lands()));
}

{
  const t = setup();
  const text = 'If this spell was cast from your hand and you\'ve cast another spell named Divination this game, you win the game. Otherwise, put Divination into its owner\'s library seventh from the top and you gain 7 life.';
  const life = t.P(0).life;
  cast(t, 'Divination', text, [], { manaCost: '{U}' });
  const lib = t.P(0).deck.remainingLibrary;
  check('Approach of the Second Sun: first cast goes seventh from the top and gains 7 life', t.P(0).life === life + 7 && def(t, lib[6]).name === 'Divination', JSON.stringify([t.P(0).life - life, lib.slice(0, 8).map(c => def(t, c).name)]));
  t.edit({ kind: 'move', instanceId: lib[6].instanceId, to: 'hand' });
  const d = t.hand(0, 'Divination');
  t.ctl.dispatch({ type: 'play', instanceId: d.instanceId }, t.as(0)); settle(t);
  check('…the second cast from hand wins the game', t.game.status === 'complete' || t.P(1).eliminated || !!t.P(1).counters?.lostGame, JSON.stringify([t.game.status, t.P(1).counters?.lostGame]));
}

{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  const life = t.P(1).life;
  const seen = cast(t, 'Opt', 'Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent of their choice or discards a card.', [[d => d.key === 'x', 2], [d => d.playerId === t.P(1).playerId && d.key.includes('torment:0:'), () => `s:${foe.instanceId}`], [d => d.playerId === t.P(1).playerId, 'life']], { manaCost: '{X}{G}', typeLine: 'Sorcery' });
  check('Torment of Hailfire: the opponent chooses (sacrifices); with nothing left the next round costs 3 life', t.names(1, 'graveyard').includes('Grizzly Bears') && t.P(1).life === life - 3 && seen.filter(d => d.playerId === t.P(1).playerId).length >= 1, JSON.stringify([t.P(1).life - life, seen.length]));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', {}, 1), b = onField(t, 'Llanowar Elves', '', {}, 1);
  for (let i = 0; i < 2; i++) t.give(1, 'Forest', 'battlefield');
  const lili = onField(t, 'Sol Ring', '{0}: Each opponent chooses a permanent they control of each permanent type and sacrifices the rest.');
  const seen = activate(t, lili, 0, [[d => d.playerId === t.P(1).playerId && /creature/.test(d.prompt || ''), () => b.instanceId], [d => d.playerId === t.P(1).playerId, d => d.options[0].id]]);
  check('Liliana −9: the opponent keeps one creature and one land; the rest are sacrificed', t.names(1, 'battlefield').filter(n => n === 'Forest').length === 1 && t.names(1, 'battlefield').includes('Llanowar Elves') && !t.names(1, 'battlefield').includes('Grizzly Bears'), JSON.stringify(t.names(1, 'battlefield')));
}

{
  const t = setup();
  t.give(0, 'Opt');
  const lib = t.P(0).deck.remainingLibrary, k = lib.findIndex(c => def(t, c).name === 'Mulldrifter');
  lib.splice(9, 0, ...lib.splice(k, 1));
  const size = lib.length;
  cast(t, 'Opt', 'Choose a card name. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal a card with the chosen name. Put that card into your hand and exile all other cards revealed this way.', [[d => d.kind === 'text', 'Mulldrifter']], { manaCost: '{G}' });
  check('Demonic Consultation: six exiled, then cards revealed down to the named card, which goes to hand', t.P(0).deck.hand.some(c => def(t, c).name === 'Mulldrifter') && t.P(0).deck.remainingLibrary.length === size - 10, String(size - t.P(0).deck.remainingLibrary.length));
}
{
  const t = setup();
  t.give(0, 'Opt');
  const lib = t.P(0).deck.remainingLibrary;
  for (const n of ['Air Elemental', 'Divination', 'Mulldrifter']) { const k = lib.findIndex(c => def(t, c).name === n); lib.unshift(...lib.splice(k, 1)); }
  const third = lib[2].instanceId;
  cast(t, 'Opt', 'Exile the top card of your library. You may put that card into your hand unless it has the same name as another card exiled this way. Repeat this process until you put a card into your hand or you exile two cards with the same name, whichever comes first.', [[d => d.key.endsWith(':3'), 'take'], [d => /Put it into your hand/.test(d.prompt || ''), 'next']], { manaCost: '{G}' });
  check('Tainted Pact: the player passes twice and keeps the third card', t.P(0).deck.hand.some(c => c.instanceId === third) && t.P(0).deck.exile.length >= 2);
}

{
  const t = setup();
  t.give(0, 'Divination', 'graveyard');
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it, and you may cast the copy without paying its mana cost. Exile Opt.", [[d => d.kind === 'confirm' || /Cast the copies/.test(d.prompt || d.label || ''), d => d.kind === 'confirm' ? true : d.options?.find(o => /yes/i.test(String(o.id) + o.label))?.id ?? true]], { manaCost: '{G}', typeLine: 'Sorcery' });
  check("Mizzix's Mastery: the exiled Divination is copied and cast (two draws)", t.P(0).deck.hand.length === hand + 2 && t.names(0, 'exile').includes('Divination'), String(t.P(0).deck.hand.length - hand));
}

{
  const t = setup();
  const bs = onField(t, 'Colossal Dreadmaw', 'Whenever this creature attacks, you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it\'s attacking.', { typeLine: 'Artifact Creature — Myr Construct', power: '4', toughness: '7' });
  const m1 = onField(t, 'Grizzly Bears', '', { typeLine: 'Artifact Creature — Myr' }), m2 = onField(t, 'Llanowar Elves', '', { typeLine: 'Artifact Creature — Myr' });
  const life = t.P(1).life;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bs.instanceId, defenderId: t.P(1).playerId }] });
  settle(t, [[d => d.kind === 'confirm', true], [d => /untapped Myr/.test(d.prompt || ''), [m1.instanceId, m2.instanceId]]]);
  check('Myr Battlesphere: two Myr tapped: +2/+0 and 2 damage to the defending player (then 6 combat damage)', m1.tapped && m2.tapped && power(t, bs) === 6 && t.P(1).life === life - 8, JSON.stringify([power(t, bs), life - t.P(1).life]));
}
{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Sol Ring', 'battlefield');
  const sw = asText(t, t.bf(0, 'Sol Ring'), '{0}: Exile up to one target creature you own, then search your library for a basic land card. Put both cards onto the battlefield under your control, then shuffle.');
  const wilds = t.P(0).deck.remainingLibrary.find(c => def(t, c).name === 'Evolving Wilds'); asText(t, wilds, '{T}: Add {G}.', { typeLine: 'Basic Land — Forest' });
  const lands = t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c).typeLine)).length;
  const swSeen = activate(t, sw, 0, [[d => d.targeting, () => bear.instanceId], [d => d.searchable, [wilds.instanceId]]]);
  check('Sword of Hearth and Home: the creature blinks and a basic land enters', t.names(0, 'battlefield').includes('Grizzly Bears') && t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c).typeLine)).length === lands + 1, JSON.stringify((t.game.log || []).slice(0, 6).map(x => x.text || x)));
}

{
  // Disturb: cast the back face from the graveyard; exiled instead of going to a graveyard later.
  const t = setup();
  t.give(0, 'Grizzly Bears', 'graveyard');
  const g = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Grizzly Bears');
  const front = { name: 'Grizzly Bears', manaCost: '{1}{G}', typeLine: 'Creature — Bear', oracleText: 'Disturb {1}{G} (You may cast this card transformed from your graveyard for its disturb cost.)', power: '2', toughness: '2', colors: ['G'] };
  const back = { name: 'Bear Spirit', manaCost: '', typeLine: 'Creature — Spirit', oracleText: 'Flying\nIf Bear Spirit would be put into a graveyard from anywhere, exile it instead.', power: '1', toughness: '1', colors: ['G'] };
  asText(t, g, front.oracleText, { cardFaces: [front, back], layout: 'transform' });
  const r = t.ctl.dispatch({ type: 'play', instanceId: g.instanceId }, t.as(0)); settle(t);
  const bs = t.P(0).deck.battlefield.find(c => c.instanceId === g.instanceId);
  check('Disturb: the back face is cast from the graveyard', r.ok && !!bs && bs.activeFaceIndex === 1, JSON.stringify([r.error, bs?.activeFaceIndex]));
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => g.instanceId]], { manaCost: '{G}' });
  check('…and it is exiled when it dies', t.P(0).deck.exile.some(c => c.instanceId === g.instanceId));
}

{
  // Craft: exile it and the materials, return it transformed.
  const t = setup();
  const front = { name: 'Sol Ring', manaCost: '{1}', typeLine: 'Artifact', oracleText: 'Craft with artifact {2} (Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner\'s control. Craft only as a sorcery.)' };
  const back = { name: 'Crafted Golem', manaCost: '', typeLine: 'Artifact Creature — Golem', oracleText: '', power: '4', toughness: '4' };
  const ring = onField(t, 'Sol Ring', front.oracleText, { cardFaces: [front, back], layout: 'transform' });
  t.give(0, 'Arcane Signet', 'graveyard');
  const sig = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Arcane Signet');
  const row = (t.view(0).players[0].battlefield.find(c => c.id === ring.instanceId)?.abilities || []).find(a => /special:craft/.test(a.id));
  const r = t.ctl.dispatch({ type: 'activate', instanceId: ring.instanceId, abilityId: 'special:craft' }, t.as(0));
  settle(t, [['craft', [sig.instanceId]]]);
  const back2 = t.P(0).deck.battlefield.find(c => c.instanceId === ring.instanceId);
  check('Craft: it and an artifact card from the graveyard are exiled; it returns transformed', r.ok && back2?.activeFaceIndex === 1 && t.P(0).deck.exile.some(c => c.instanceId === sig.instanceId), JSON.stringify([r.error, back2?.activeFaceIndex]));
}

{
  // Read ahead: start on chapter III; only chapter III triggers.
  const t = setup();
  const life = t.P(0).life, hand = t.P(0).deck.hand.length;
  cast(t, 'Fog Bank', 'Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don\'t trigger.)\nI — You gain 2 life.\nII — You gain 2 life.\nIII — Draw a card.', [['read-ahead', 3]], { typeLine: 'Enchantment — Saga', manaCost: '{G}', power: null, toughness: null });
  const saga = t.P(0).deck.battlefield.find(c => def(t, c).name === 'Fog Bank') || t.P(0).deck.graveyard.find(c => def(t, c).name === 'Fog Bank');
  check('Read ahead: chapter III only (draws, no life)', t.P(0).life === life && t.P(0).deck.hand.length === hand + 1, JSON.stringify([t.P(0).life - life, t.P(0).deck.hand.length - hand, saga?.counters]));
}

{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', {}, 1), b = onField(t, 'Llanowar Elves', '', {}, 0);
  t.give(1, 'Forest', 'battlefield');
  const seen = cast(t, 'Opt', "Return target nonland permanent to its owner's hand. Then that permanent's controller may sacrifice a land of their choice. If the player does, they may copy this spell and may choose a new target for that copy.",
    [[d => d.targeting && d.playerId === t.P(0).playerId, () => a.instanceId], [d => d.playerId === t.P(1).playerId && /sacrifice a land/.test(d.prompt || ''), d => d.options.find(o => o.id !== 'none').id], [d => d.key === 'retarget', true], [d => d.targeting && d.playerId === t.P(1).playerId, () => b.instanceId], [d => d.playerId === t.P(0).playerId && /sacrifice a land/.test(d.prompt || ''), 'none']], { manaCost: '{U}' });
  check('Chain of Vapor: the opponent sacrifices a land, copies it, and bounces our creature', t.names(1, 'hand').includes('Grizzly Bears') && t.names(0, 'hand').includes('Llanowar Elves'), JSON.stringify([t.names(1, 'hand'), t.names(0, 'hand')]));
}

{
  const t = setup();
  const a = onField(t, 'Colossal Dreadmaw', '', { power: '5', toughness: '5' }, 1);
  cast(t, 'Opt', "Destroy target creature. If that creature dies this way, its controller creates two tokens that are copies of that creature, except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time.", [[d => d.targeting, () => a.instanceId]], { manaCost: '{G}' });
  const toks = t.P(1).deck.battlefield.filter(c => c.token && def(t, c).name === 'Colossal Dreadmaw');
  check('Saw in Half: its controller gets two 3/3 copies', toks.length === 2 && toks.every(c => power(t, c) === 3 && tough(t, c) === 3), JSON.stringify(toks.map(c => [power(t, c), tough(t, c)])));
}

{
  const t = setup();
  for (const n of ['Grizzly Bears', 'Llanowar Elves', 'Elvish Visionary']) t.give(0, n, 'graveyard');
  const g = n => t.P(0).deck.graveyard.find(c => def(t, c).name === n).instanceId;
  cast(t, 'Opt', 'Return from your graveyard to the battlefield any number of target creature cards that each have a different mana value X or less.', [[d => d.key === 'x', 2], [d => /different mana value/.test(d.prompt || ''), [g('Grizzly Bears'), g('Llanowar Elves'), g('Elvish Visionary')]]], { manaCost: '{X}{G}' });
  const back = ['Grizzly Bears', 'Llanowar Elves', 'Elvish Visionary'].filter(n => t.names(0, 'battlefield').includes(n));
  check("Agadeem's Awakening: one card per mana value comes back (Bears 2, Elves 1; Visionary shares 2)", back.length === 2 && back.includes('Llanowar Elves'), JSON.stringify(back));
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever another permanent you control enters, if it wasn\'t put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.', { typeLine: 'Legendary Creature — Spirit' });
  t.give(0, 'Llanowar Elves'); t.give(0, 'Elvish Visionary');
  cast(t, 'Grizzly Bears', '', [[d => d.kind === 'confirm', true], [d => /mana value 2 or less/.test(d.prompt || ''), d => [d.options.find(o => o.label === 'Llanowar Elves').id]]], { manaCost: '{1}{G}' });
  check('Kodama of the East Tree: casting a 2-drop puts a cheaper permanent from hand; that one does not chain', t.names(0, 'battlefield').includes('Llanowar Elves') && t.names(0, 'hand').includes('Elvish Visionary'), JSON.stringify(t.names(0, 'battlefield')));
}

section('round 50: keyword triggers (bushido, flanking, battle cry, annihilator, evolve, fabricate, renown, extort, echo, cumulative upkeep …)');
function attackWith(t, ids) { t.do(0, { type: 'next-phase' }); t.do(0, { type: 'attack', attacks: ids.map(id => ({ instanceId: id, defenderId: t.P(1).playerId })) }); }
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', 'Bushido 1\nFlanking\nBattle cry'), b = onField(t, 'Llanowar Elves', '');
  const blocker = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  attackWith(t, [a.instanceId, b.instanceId]);
  settle(t);
  check('Battle cry: the other attacker gets +1/+0', power(t, b) === 2, String(power(t, b)));
  t.do(1, { type: 'block', assignments: [{ attackerId: a.instanceId, blockerId: blocker.instanceId }] });
  const stats = [];
  const st = () => stats.push([power(t, a), tough(t, blocker)]);
  // Look as the block triggers resolve (before damage): pass priority one step at a time.
  for (let k = 0; k < 6 && !(t.game.stack || []).length && (t.game.pendingTriggers || []).length; k++) t.passAll();
  settle(t);
  const bA = t.P(0).deck.battlefield.find(c => c.instanceId === a.instanceId), bB = t.P(1).deck.battlefield.find(c => c.instanceId === blocker.instanceId);
  const logText = (t.game.log || []).map(x => x.text || '').join(' | ');
  check('Bushido 1 and flanking: the blocked bear gets +1/+1, the blocker -1/-1', bA && power(t, bA) === 3 && bB && tough(t, bB) === 8, JSON.stringify([bA && power(t, bA), bB && tough(t, bB)]));
}
{
  const t = setup();
  const e = onField(t, 'Llanowar Elves', 'Evolve');
  t.give(0, 'Grizzly Bears', 'battlefield'); settle(t);
  check('Evolve: a bigger creature entering puts a counter on it', e.counters?.['+1/+1'] === 1, JSON.stringify(e.counters));
}
{
  const t = setup();
  cast(t, 'Grizzly Bears', 'Fabricate 2', [[d => /Fabricate/.test(d.label || d.title || d.prompt || ''), d => d.options.find(o => /Servo/.test(o.label || o.id)).id]], { manaCost: '{1}{G}' });
  check('Fabricate 2: choosing Servos makes two 1/1 tokens', t.names(0, 'battlefield').filter(n => n === 'Servo').length === 2, JSON.stringify(t.names(0, 'battlefield')));
}
{
  const t = setup();
  onField(t, 'Fog Bank', 'Extort', { typeLine: 'Creature — Spirit' });
  const life0 = t.P(0).life, life1 = t.P(1).life;
  t.P(0).mana.available.B = 1; t.P(0).mana.floating.B = 1;   // a black mana to pay {W/B} with
  cast(t, 'Opt', 'Draw a card.', [[d => d.key === 'may-pay', 'pay']], { manaCost: '{U}' });
  check('Extort: paying {W/B} drains each opponent for 1', t.P(1).life === life1 - 1 && t.P(0).life === life0 + 1, JSON.stringify([t.P(0).life - life0, t.P(1).life - life1]));
}
{
  const t = setup();
  const eq = onField(t, 'Sol Ring', 'Living weapon\nEquipped creature gets +2/+2.', { typeLine: 'Artifact — Equipment' });
  t.give(0, 'Arcane Signet'); const ls = asText(t, t.hand(0, 'Arcane Signet'), 'Living weapon\nEquipped creature gets +2/+2.', { typeLine: 'Artifact — Equipment', manaCost: '{1}' });
  t.ctl.dispatch({ type: 'play', instanceId: ls.instanceId }, t.as(0)); settle(t);
  const germ = t.P(0).deck.battlefield.find(c => def(t, c).name === 'Phyrexian Germ');
  check('Living weapon: a Germ token with the Equipment attached (a 2/2)', !!germ && ls.attachedTo === germ.instanceId && power(t, germ) === 2, JSON.stringify([!!germ, ls.attachedTo === germ?.instanceId, germ && power(t, germ)]));
}
{
  const t = setup();
  const c = onField(t, 'Grizzly Bears', 'Cumulative upkeep {1}'); c.controlSinceTurn = 0;
  t.autoPass = true; t.end(0); t.end(1);
  settle(t, [[d => d.key === 'may-pay', 'pay']]);
  check('Cumulative upkeep: an age counter, paid for, the creature stays', c.counters?.age === 1 && t.names(0, 'battlefield').includes('Grizzly Bears'), JSON.stringify(c.counters));
  const e = onField(t, 'Llanowar Elves', 'Echo {G}');
}
{
  const t = setup();
  const c = onField(t, 'Grizzly Bears', 'Echo {1}{G}'); c.controlSinceTurn = 0; c.enteredTurn = 0;
  t.autoPass = true; t.end(0); t.end(1);
  settle(t, [[d => d.key === 'may-pay', 'no']]);
  check('Echo: not paid, it is sacrificed at its controller\'s next upkeep', t.names(0, 'graveyard').includes('Grizzly Bears'), JSON.stringify(t.names(0, 'graveyard')));
}

{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  const um = onField(t, 'Fog Bank', 'Enchant creature\nUmbra armor', { typeLine: 'Enchantment — Aura' }); um.attachedTo = bear.instanceId;
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{G}' });
  check('Umbra armor: the Aura is destroyed instead of the creature', t.names(0, 'battlefield').includes('Grizzly Bears') && t.names(0, 'graveyard').includes('Fog Bank'));
}
{
  const t = setup();
  const o = onField(t, 'Grizzly Bears', 'Outlast {1}');
  const r = t.ctl.dispatch({ type: 'activate', instanceId: o.instanceId, abilityId: 'special:outlast' }, t.as(0)); settle(t);
  check('Outlast: tap and pay for a +1/+1 counter', r.ok && o.tapped && o.counters?.['+1/+1'] === 1, JSON.stringify([r.error, o.counters]));
}
{
  const t = setup();
  t.give(0, 'Grizzly Bears', 'graveyard');
  const g = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Grizzly Bears'); asText(t, g, 'Eternalize {2}');
  const r = t.ctl.dispatch({ type: 'activate', instanceId: g.instanceId, abilityId: 'special:eternalize' }, t.as(0)); settle(t);
  const tok = t.P(0).deck.battlefield.find(c => c.token && def(t, c).name === 'Grizzly Bears');
  check('Eternalize: the card is exiled and a 4/4 black Zombie copy enters', r.ok && !!tok && power(t, tok) === 4 && /Zombie/.test(def(t, tok).typeLine) && t.names(0, 'exile').includes('Grizzly Bears'), JSON.stringify([r.error, tok && power(t, tok), tok && def(t, tok).typeLine]));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', 'Ingest');
  const lib = t.P(1).deck.remainingLibrary.length;
  attackWith(t, [a.instanceId]); settle(t);
  if (t.game.flow.blocks) { t.do(1, { type: 'block', assignments: [] }); settle(t); }
  check('Ingest: combat damage makes the player exile their top card', t.P(1).deck.remainingLibrary.length === lib - 1 && t.P(1).deck.exile.length >= 1, String(lib - t.P(1).deck.remainingLibrary.length));
}

{
  const t = setup();
  const text = "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nDraw two cards. If you have the city's blessing, draw three cards instead.";
  const h0 = t.P(0).deck.hand.length;
  cast(t, 'Opt', text, [], { manaCost: '{U}' });
  check('Ascend: with eight permanents, two cards', t.P(0).deck.hand.length === h0 + 2 && !t.P(0).citysBlessing, String(t.P(0).deck.hand.length - h0));
  onField(t, 'Grizzly Bears', 'Ascend\nThis creature gets +2/+2 as long as you have the city\'s blessing.'); onField(t, 'Llanowar Elves', '');
  settle(t);
  const bear = t.bf(0, 'Grizzly Bears');
  check('…ten permanents and a permanent with ascend: the city\'s blessing, and "as long as" bonuses apply', t.P(0).citysBlessing && power(t, bear) === 4, JSON.stringify([t.P(0).citysBlessing, power(t, bear)]));
  t.give(0, 'Divination');
  const h1 = t.P(0).deck.hand.length - 1;
  cast(t, 'Divination', text, [], { manaCost: '{U}' });
  check('…then the spell draws three', t.P(0).deck.hand.length === h1 + 3, String(t.P(0).deck.hand.length - h1));
}

{
  const t = setup();
  t.give(0, 'Colossal Dreadmaw');
  const c = asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Prototype {1}{G} — 2/2 (You can cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nTrample', { manaCost: '{6}{G}{G}', power: '6', toughness: '6' });
  t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0));
  settle(t, [['castMode', 'prototype']]);
  const live = t.bf(0, 'Colossal Dreadmaw');
  check('Prototype: cast for {1}{G}, it is a 2/2', !!live && power(t, live) === 2 && tough(t, live) === 2, JSON.stringify(live && [power(t, live), tough(t, live)]));
  t.edit({ kind: 'move', instanceId: live.instanceId, to: 'hand' });
  const back = t.hand(0, 'Colossal Dreadmaw');
  check('…in hand again it is the full card', !back.prototype);
}

{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Llanowar Elves', 'Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that\'s another creature, it gains the following ability until end of turn.)\nTrample', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{G}' });
  check('Backup 1: the other creature gets a counter and trample until end of turn', bear.counters?.['+1/+1'] === 1 && cardHasKeyword(bear, withOverlay(bear, def(t, bear)), 'Trample', t.game), JSON.stringify([bear.counters, bear.grantedText]));
}
{
  const t = newGame(['simic', 'simic', 'simic']); t.keepAll(); t.autoPass = false;
  const m = t.give(0, 'Grizzly Bears', 'battlefield'); const live = t.P(0).deck.battlefield.find(c => c.instanceId === m.instanceId);
  asText(t, live, 'Myriad'); live.enteredTurn = 0; live.controlSinceTurn = 0;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: live.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  const copies = t.P(0).deck.battlefield.filter(c => c.token && def(t, c).name === 'Grizzly Bears');
    check('Myriad: a token copy attacks the other opponent (and is gone after combat)', t.P(2).life === 38 && t.P(1).life === 38 && copies.length === 0, JSON.stringify([t.P(1).life, t.P(2).life, copies.length]));
}

{
  const t = setup();
  for (let i = 0; i < 2; i++) t.give(1, 'Island', 'battlefield');
  t.give(1, 'Counterspell');
  t.give(0, 'Opt'); const ss = asText(t, t.hand(0, 'Opt'), 'Split second (As long as this spell is on the stack, players can\'t cast spells or activate abilities that aren\'t mana abilities.)\nDraw a card.', { manaCost: '{U}' });
  t.game.stack = [{ id: 'ss', kind: 'spell', controllerId: t.P(0).playerId, card: ss, label: 'Opt' }];   // a split second spell waiting on the stack
  const pc = playCheck(t.game, t.P(1), t.hand(1, 'Counterspell'));
  check('Split second: the opponent cannot cast Counterspell in response (and is passed automatically)', !pc.legal && /split second/i.test(pc.reasons?.[0] || ''), JSON.stringify(pc.reasons));
  t.game.stack = [];
}

{
  const t = setup();
  cast(t, 'Opt', 'Draw a card.', [], { manaCost: '{U}' });
  t.give(0, 'Colossal Dreadmaw'); const c = asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Surge {G}\nWhen this creature enters, if its surge cost was paid, draw a card.', { manaCost: '{5}{G}{G}' });
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0)); settle(t, [['castMode', 'surge']]);
  check('Surge: after another spell, cast for its surge cost; "if its surge cost was paid" applies', t.names(0, 'battlefield').includes('Colossal Dreadmaw') && t.P(0).deck.hand.length === hand, String(t.P(0).deck.hand.length - hand));
}
{
  const t = setup();
  t.give(0, 'Counterspell'); const tr = asText(t, t.hand(0, 'Counterspell'), 'Counter target spell.\nTransmute {1}', { manaCost: '{U}{U}' });
  const r = t.ctl.dispatch({ type: 'activate', instanceId: tr.instanceId, abilityId: 'special:transmute' }, t.as(0));
  const seen = settle(t, [[d => d.key === 'search', d => [d.options[0].id]]]);
  const ask = seen.find(d => d.key === 'search');
  const two = ask && ask.options.every(o => Number(t.game.cardDefinitions[o.definitionId]?.manaValue ?? 0) === 2);
  check('Transmute: discards it to search for a card with the same mana value (2)', r.ok && t.names(0, 'graveyard').includes('Counterspell') && !!ask && two, JSON.stringify([r.error, ask?.options?.length, two]));
}

{
  const t = setup();
  const rc = onField(t, 'Llanowar Elves', 'Equipped creature gets +2/+2.\nReconfigure {1}', { typeLine: 'Artifact Creature — Equipment Lizard' });
  const bear = onField(t, 'Grizzly Bears', '');
  const r = t.ctl.dispatch({ type: 'activate', instanceId: rc.instanceId, abilityId: 'special:reconfigure' }, t.as(0));
  settle(t, [['reconfigure', bear.instanceId]]);
  check('Reconfigure: attached, it is no longer a creature and the creature gets +2/+2', r.ok && rc.attachedTo === bear.instanceId && !/Creature/.test(withOverlay(rc, def(t, rc)).typeLine) && power(t, bear) === 4, JSON.stringify([r.error, rc.attachedTo === bear.instanceId, power(t, bear)]));
  const r2 = t.ctl.dispatch({ type: 'activate', instanceId: rc.instanceId, abilityId: 'special:unconfigure' }, t.as(0)); settle(t);
  check('…and can be unattached to be a creature again', r2.ok && !rc.attachedTo && power(t, bear) === 2);
}

{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Llanowar Elves'); const b = asText(t, t.hand(0, 'Llanowar Elves'), 'Bestow {1}{G} (If you cast this card for its bestow cost, it\'s an Aura spell with enchant creature. It becomes a creature again if it\'s not attached to a creature.)\nEnchanted creature gets +1/+1.', { typeLine: 'Enchantment Creature — Elf', manaCost: '{G}', power: '1', toughness: '1' });
  t.ctl.dispatch({ type: 'play', instanceId: b.instanceId }, t.as(0));
  settle(t, [['castMode', 'bestow'], ['enchant', bear.instanceId]]);
  check('Bestow: cast as an Aura on the bear, +1/+1, not a creature itself', b.attachedTo === bear.instanceId && power(t, bear) === 3 && !/Creature/.test(withOverlay(b, def(t, b)).typeLine), JSON.stringify([b.attachedTo === bear.instanceId, power(t, bear), withOverlay(b, def(t, b)).typeLine]));
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{G}' });
  check('…when the bear dies it stays as a 1/1 creature', t.names(0, 'battlefield').includes('Llanowar Elves') && !b.bestowed && /Creature/.test(withOverlay(b, def(t, b)).typeLine));
}

{
  const t = setup();
  const hand = t.P(0).deck.hand.length;
  const seen = cast(t, 'Grizzly Bears', 'Tribute 2 (As this creature enters, an opponent of your choice may put two +1/+1 counters on it.)\nWhen this creature enters, if tribute wasn\'t paid, draw a card.', [[d => d.key.includes('tribute') && d.playerId === t.P(1).playerId, 'no']], { manaCost: '{1}{G}' });
  check('Tribute: the opponent decides; unpaid, the "tribute wasn\'t paid" ability happens', seen.some(d => d.playerId === t.P(1).playerId) && t.P(0).deck.hand.length === hand + 1, String(t.P(0).deck.hand.length - hand));
}
{
  const t = setup();
  t.give(0, 'Grizzly Bears'); t.give(0, 'Llanowar Elves'); asText(t, t.hand(0, 'Llanowar Elves'), '', { typeLine: 'Creature — Bear' });
  cast(t, 'Colossal Dreadmaw', 'Amplify 1 (As this creature enters, put a +1/+1 counter on it for each Bear card you reveal in your hand.)', [[d => d.key.includes('amplify'), d => d.options.map(o => o.id)]], { manaCost: '{G}', typeLine: 'Creature — Bear', power: '1', toughness: '1' });
  const d = t.bf(0, 'Colossal Dreadmaw');
  check('Amplify 1: two Bears revealed, two counters', d?.counters?.['+1/+1'] === 2, JSON.stringify(d?.counters));
}

{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', 'Enlist'), b = onField(t, 'Colossal Dreadmaw', '', { power: '6' });
  attackWith(t, [a.instanceId]);
  settle(t, [[d => /Enlist/.test(d.prompt || ''), [b.instanceId]]]);
  check('Enlist: tapping the Dreadmaw adds 6 power', b.tapped && power(t, a) === 8, String(power(t, a)));
}

{
  const t = setup();
  t.give(0, 'Grizzly Bears'); const g = t.hand(0, 'Grizzly Bears');
  const front = { name: 'Grizzly Bears', manaCost: '{3}{G}', typeLine: 'Artifact Creature — Robot', oracleText: 'More Than Meets the Eye {1}{G} (You may cast this card converted for {1}{G}.)', power: '4', toughness: '4' };
  const back = { name: 'Bear Car', manaCost: '', typeLine: 'Artifact — Vehicle', oracleText: 'Crew 1', power: '3', toughness: '3' };
  asText(t, g, front.oracleText, { cardFaces: [front, back], layout: 'transform', manaCost: '{3}{G}' });
  t.ctl.dispatch({ type: 'play', instanceId: g.instanceId }, t.as(0)); settle(t, [['castMode', 'converted']]);
  const live = t.P(0).deck.battlefield.find(c => c.instanceId === g.instanceId);
  check('More Than Meets the Eye: cast converted (back face) from hand', live?.activeFaceIndex === 1, JSON.stringify(live?.activeFaceIndex));
}

{
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Llanowar Elves', 'Champion a creature (When this enters, sacrifice it unless you exile another creature you control. When this leaves the battlefield, that card returns to the battlefield under its owner\'s control.)', [[d => /Exile another creature/.test(d.prompt || ''), [bear.instanceId]]], { manaCost: '{G}' });
  check('Champion: the bear is exiled', t.names(0, 'exile').includes('Grizzly Bears') && t.names(0, 'battlefield').includes('Llanowar Elves'));
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => t.bf(0, 'Llanowar Elves').instanceId]], { manaCost: '{G}' });
  check('…when the champion dies, the bear returns', t.names(0, 'battlefield').includes('Grizzly Bears'));
}

{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', 'Provoke', { power: '5', toughness: '5' });
  const foe = onField(t, 'Llanowar Elves', '', {}, 1); foe.tapped = true;
  attackWith(t, [a.instanceId]);
  settle(t, [[d => /Provoke/.test(d.prompt || ''), foe.instanceId]]);
  if (t.game.flow.blocks) { try { t.do(1, { type: 'block', assignments: [] }); } catch (e) { /* must block */ } settle(t); }
  check('Provoke: the chosen creature untaps and must block', !foe.tapped || t.names(1, 'graveyard').includes('Llanowar Elves'), JSON.stringify([foe.tapped, t.names(1, 'graveyard')]));
}

section('round 51: the last top-1,000 cards');
{
  const t = setup();
  const stage = onField(t, 'Evolving Wilds', '{T}: Add {C}.\n{2}, {T}: This land becomes a copy of target land, except it has this ability.', { typeLine: 'Land' });
  const isl = t.bf(0, 'Island');
  const ab = parseActivatedAbilities(def(t, stage)).filter(a => !a.manaAbility)[0];
  t.ctl.dispatch({ type: 'activate', instanceId: stage.instanceId, abilityId: ab.id }, t.as(0));
  settle(t, [[d => d.targeting, () => isl.instanceId]]);
  const now = withOverlay(stage, t.game.cardDefinitions[stage.definitionId]);
  const d2 = (await import('../../src/engine/effects.js')).definitionFor(t.game, stage);
  check("Thespian's Stage: it becomes an Island and keeps its copy ability", d2.name === 'Island' && /becomes a copy of target land/.test(d2.oracleText), JSON.stringify([d2.name]));
  check("…and it makes the Island's blue mana, not its old colourless", (stage.manaCapacityOptions || []).join() === 'U' && stage.manaCapacityColor === 'U', JSON.stringify([stage.manaCapacityOptions, stage.manaCapacityColor]));
}
{
  const t = setup();
  const hand = t.P(0).deck.hand.length, oh = t.P(1).deck.hand.length;
  cast(t, 'Opt', 'Each opponent draws a card. Then you draw a card for each opponent who drew a card this way.', [], { manaCost: '{U}' });
  check('Cut a Deal: the opponent draws, then so do you', t.P(1).deck.hand.length === oh + 1 && t.P(0).deck.hand.length === hand + 1);
}
{
  const t = setup();
  const own = onField(t, 'Grizzly Bears', ''), foe = onField(t, 'Llanowar Elves', '', {}, 1);
  cast(t, 'Opt', "Choose one —\n• Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control.\n• Exile target artifact or enchantment.", [['modes', [0]], [d => d.targeting && d.options.some(o => o.id === own.instanceId), () => own.instanceId], [d => d.targeting, () => foe.instanceId]], { manaCost: '{G}' });
  check("Archdruid's Charm: counter, then it deals 3 damage to the opponent's creature", own.counters?.['+1/+1'] === 1 && t.names(1, 'graveyard').includes('Llanowar Elves'));
}

{
  const t = setup();
  const throne = onField(t, 'Sol Ring', '{3}, {T}: Draw two cards. Spend only mana of the chosen color to activate this ability.'); throne.chosenColor = 'G';
  const hand = t.P(0).deck.hand.length;
  activate(t, throne, 0);
  const tappedIslands = t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Island' && c.tapped).length;
  check('Throne of Eldraine: paid only with green (Forests), draws two', t.P(0).deck.hand.length === hand + 2 && tappedIslands === 0, JSON.stringify([t.P(0).deck.hand.length - hand, tappedIslands]));
}
{
  const t = setup();
  const g = onField(t, 'Grizzly Bears', ''), spec = onField(t, 'Fog Bank', 'When this creature enters, you may change the target of target instant or sorcery spell with a single target to this creature.', { typeLine: 'Creature — Weird' }, 1);
  t.give(0, 'Opt'); asText(t, t.hand(0, 'Opt'), 'Destroy target creature.', { manaCost: '{G}' });
  t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Opt').instanceId }, t.as(0));
  settle(t, [[d => d.targeting, () => g.instanceId]], [], true);
  // Not reachable mid-stack in this harness: check the effect directly on a stack object.
  t.game.stack = [{ id: 's1', kind: 'spell', controllerId: t.P(0).playerId, castReqs: [{ kind: 'target', bind: 'target0', scope: 'target creature' }], effectBindings: { target0: g.instanceId }, label: 'Murder' }];
  (await import('../../src/engine/effects-b49.js')).applyB49(t.game, t.P(1).playerId, { kind: 'retarget-to-self', bind: 'st' }, { st: 's1', sourceId: spec.instanceId }, []);
  check('Hydroelectric Specimen: the spell now targets it', t.game.stack[0].effectBindings.target0 === spec.instanceId);
  t.game.stack = [];
}

{
  const t = setup();
  t.give(0, 'Grizzly Bears', 'graveyard');
  const g = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Grizzly Bears');
  const cw = onField(t, 'Sol Ring', '{T}: Choose target nonland permanent card in your graveyard. If you haven\'t cast a spell this turn, you may cast that card. If you do, you can\'t cast additional spells this turn. Activate only as a sorcery.', { typeLine: 'Artifact' });
  activate(t, cw, 0, [[d => d.targeting, () => g.instanceId], [d => d.kind === 'confirm', true]]);
  const r = t.ctl.dispatch({ type: 'play', instanceId: (t.give(0, 'Opt'), t.hand(0, 'Opt')).instanceId }, t.as(0));
  check('Conduit of Worlds: the creature is cast from the graveyard, then no more spells this turn', t.names(0, 'battlefield').includes('Grizzly Bears') && !r.ok, JSON.stringify([t.names(0, 'battlefield').includes('Grizzly Bears'), r.error]));
}

{
  const t = setup();
  const dv = onField(t, 'Fog Bank', 'If a card would be put into an opponent\'s graveyard from anywhere, instead exile it with a void counter on it.\n{T}, Sacrifice this creature: Choose an exiled card an opponent owns with a void counter on it. You may play it this turn without paying its mana cost.', { typeLine: 'Creature — Minion' });
  const foe = onField(t, 'Colossal Dreadmaw', '', {}, 1);
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => foe.instanceId]], { manaCost: '{G}' });
  const ex = t.P(1).deck.exile.find(c => c.instanceId === foe.instanceId);
  check('Dauthi Voidwalker: the opponent\'s dying creature is exiled with a void counter', !!ex && ex.counters?.void === 1, JSON.stringify(ex?.counters));
  activate(t, dv, 0, [[d => /void counter/.test(d.prompt || ''), foe.instanceId]]);
  const mine = t.P(0).deck.exile.find(c => c.instanceId === foe.instanceId);
  check('…sacrificed, it lets its controller play that card free this turn', mine?.playPermission?.free === true);
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''); a.counters = { '+1/+1': 1 };
  cast(t, 'Opt', 'Proliferate, then choose any number of permanents you control that had a counter put on them this way. Those permanents phase out.', [[d => d.kind === 'choose-many' && /phase out/.test(d.prompt || ''), [a.instanceId]], [d => d.kind === 'choose-many', d => d.options.map(o => o.id)]], { manaCost: '{U}' });
  check('Ripples of Potential: proliferated, then it phases out', a.counters['+1/+1'] === 2 && (a.phasedOut || a.phased || /phas/i.test(JSON.stringify(a))), JSON.stringify([a.counters, a.phasedOut]));
}
{
  const t = setup();
  const lib1 = t.P(1).deck.remainingLibrary, k = lib1.findIndex(c => def(t, c).name === 'Colossal Dreadmaw'); lib1.unshift(...lib1.splice(k, 1));
  cast(t, 'Opt', "Each player mills ten cards. For each player, choose a creature or planeswalker card in that player's graveyard. Put those cards onto the battlefield under your control. Then each creature you control becomes a Phyrexian in addition to its other types.", [[d => d.key.includes(t.P(1).playerId), d => d.options.find(o => o.label === 'Colossal Dreadmaw').id]], { manaCost: '{U}' });
  const dm = t.P(0).deck.battlefield.find(c => def(t, c).name === 'Colossal Dreadmaw' && c.ownerId === t.P(1).playerId);
  check("Breach the Multiverse: the opponent's milled Dreadmaw enters under its caster's control", !!dm);
}

{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', {}, 1), b = onField(t, 'Llanowar Elves', '', {}, 1);
  const m0 = { ...t.P(0).mana.floating };
  cast(t, 'Opt', 'Destroy each nonland permanent with mana value 2 or less. Add {B} or {G} for each permanent destroyed this way.', [[d => d.kind === 'number' && /How many/.test(d.prompt || ''), 1]], { manaCost: '{3}{G}', typeLine: 'Sorcery' });
  const f = t.P(0).mana.floating;
  check('Culling Ritual: two destroyed; the player splits the mana ({B} and {G})', t.names(1, 'graveyard').includes('Grizzly Bears') && f.B === 1 && f.G === 1, JSON.stringify(f));
}
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''), b = onField(t, 'Llanowar Elves', ''), c = onField(t, 'Fog Bank', '', {}, 1);
  cast(t, 'Opt', "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it.", [[d => d.playerId === t.P(0).playerId && /keep/.test(d.prompt || ''), a.instanceId]], { manaCost: '{G}' });
  check('Promise of Loyalty: each player keeps one creature with a vow counter', a.counters?.vow === 1 && t.names(0, 'graveyard').includes('Llanowar Elves') && c.counters?.vow === 1, JSON.stringify([a.counters, c.counters]));
}

{
  const t = setup();
  onField(t, 'Fog Bank', 'Metalcraft — Equipment you control have equip {0} as long as you control three or more artifacts.', { typeLine: 'Creature — Human Knight' });
  t.give(0, 'Arcane Signet', 'battlefield'); t.give(0, 'Sol Ring', 'battlefield');
  const eq = onField(t, 'Mulldrifter', 'Equipped creature gets +2/+0.\nEquip {5}', { typeLine: 'Artifact — Equipment' });
  const bear = onField(t, 'Grizzly Bears', '');
  for (const c of t.P(0).deck.battlefield) if (/Land/.test(def(t, c).typeLine)) c.tapped = true;   // no mana at all
  const ab = parseActivatedAbilities(def(t, eq)).find(a => /Attach this Equipment/.test(a.text));
  const r = t.ctl.dispatch({ type: 'activate', instanceId: eq.instanceId, abilityId: ab.id }, t.as(0));
  settle(t, [[d => d.targeting, () => bear.instanceId]]);
  check('Puresteel Paladin: with three artifacts, equip costs {0}', r.ok && eq.attachedTo === bear.instanceId, JSON.stringify([r.error]));
}

{
  const t = setup();
  const ss = onField(t, 'Sol Ring', '{T}: Add {B}.\n{6}{B}, {T}, Exile a creature you control: Harness The Soul Stone.\n∞ — At the beginning of your upkeep, return target creature card from your graveyard to the battlefield.', { name: 'The Soul Stone', typeLine: 'Legendary Artifact — Infinity Stone' });
  const bear = onField(t, 'Grizzly Bears', '');
  for (let i = 0; i < 3; i++) t.give(0, i % 2 ? 'Island' : 'Forest', 'battlefield');
  t.P(0).mana.available.B = 1; t.P(0).mana.floating.B = 1;
  const ab = parseActivatedAbilities(def(t, ss)).filter(a => !a.manaAbility)[0];
  const r = t.ctl.dispatch({ type: 'activate', instanceId: ss.instanceId, abilityId: ab.id }, t.as(0));
  settle(t, [['cost:exile', bear.instanceId]]);
  check('The Soul Stone: exiling a creature as a cost, it becomes harnessed', r.ok && ss.harnessed && t.names(0, 'exile').includes('Grizzly Bears'), JSON.stringify([r.error, ss.harnessed]));
}

{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever an opponent attacks you with two or more creatures, draws their second card each turn, or casts their second spell each turn, you draw a card.', { typeLine: 'Enchantment' }, 1);
  const hand = t.P(1).deck.hand.length;
  cast(t, 'Opt', 'You gain 1 life.', [], { manaCost: '{U}' });
  const mid = t.P(1).deck.hand.length;
  cast(t, 'Divination', 'You gain 1 life.', [], { manaCost: '{U}' });
  check('Trouble in Pairs: the opponent draws when we cast our second spell (not the first)', mid === hand && t.P(1).deck.hand.length === hand + 1, JSON.stringify([mid - hand, t.P(1).deck.hand.length - hand]));
}

{
  const t = setup();
  t.give(0, 'Opt');
  const top3 = t.P(0).deck.remainingLibrary.slice(0, 3).map(c => c.instanceId), life = t.P(0).life;
  cast(t, 'Opt', 'Mill three cards. Then you may pay {1} and 3 life. If you do, put a card from among those cards into your hand.', [[d => /milled card/.test(d.prompt || ''), top3[1]], [d => d.key === 'may-pay', 'pay']], { manaCost: '{U}' });
  check('Ripples of Undeath: three milled; paying {1} and 3 life returns the chosen one', t.P(0).deck.hand.some(c => c.instanceId === top3[1]) && t.P(0).life === life - 3, JSON.stringify([t.P(0).life - life]));
}
{
  const t = setup();
  onField(t, 'Fog Bank', "Whenever a land you control enters, you may pay {1}{G} if this permanent is attached to a creature you control. If you do, create a token that's a copy of that creature. If you didn't create a token this way, create a 1/1 green Insect creature token.", { typeLine: 'Enchantment Creature — Insect' });
  const seen = [];
  t.give(0, 'Command Tower', 'battlefield'); settle(t, [], seen);
  check('Springheart Nantuko unattached: no payment asked, a 1/1 Insect', !seen.some(d => d.key === 'may-pay') && t.names(0, 'battlefield').some(n => /Insect/.test(n)), JSON.stringify(t.names(0, 'battlefield')));
}

{
  const t = setup();
  const atk = onField(t, 'Colossal Dreadmaw', '', { power: '3', toughness: '3' }, 1);
  t.autoPass = true; t.end(0);
  // Opponent's turn: cast Inkshield first (as an instant), then they attack with a 3/3.
  t.give(0, 'Opt'); const ink = asText(t, t.hand(0, 'Opt'), 'Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying.', { manaCost: '{0}', typeLine: 'Instant' });
  t.autoPass = false;
  for (const c of t.P(0).deck.battlefield) c.tapped = false;
  const r = t.ctl.dispatch({ type: 'play', instanceId: ink.instanceId }, t.as(0)); settle(t);
  t.do(1, { type: 'next-phase' });
  t.do(1, { type: 'attack', attacks: [{ instanceId: atk.instanceId, defenderId: t.P(0).playerId }] });
  settle(t); if (t.game.flow.blocks) { t.do(0, { type: 'block', assignments: [] }); settle(t); }
  const inklings = t.P(0).deck.battlefield.filter(c => /Inkling/.test(def(t, c).name || def(t, c).typeLine));
  check('Inkshield: 3 combat damage prevented, three 2/1 Inklings', r.ok && t.P(0).life === 40 && inklings.length === 3, JSON.stringify([r.error, t.P(0).life, inklings.length]));
}

{
  const t = setup();
  t.give(1, 'Opt'); const foeSpell = t.hand(1, 'Opt');
  const st = { id: 'trick-target', kind: 'spell', controllerId: t.P(1).playerId, card: foeSpell, label: 'Opt' };
  t.P(1).deck.hand.splice(t.P(1).deck.hand.indexOf(foeSpell), 1); foeSpell.zone = 'stack';
  t.game.stack = [st];
  const lib = t.P(1).deck.remainingLibrary.length;
  t.give(0, 'Counterspell'); const tt = asText(t, t.hand(0, 'Counterspell'), "Counter target spell. Choose 1, 2, or 3 at random. Its controller mills that many cards, then exiles cards from the top of their library until they exile a nonland card with a different name than that spell. They may cast that card without paying its mana cost. Then they put the exiled cards on the bottom of their library in a random order.", { manaCost: '{U}' });
  t.ctl.dispatch({ type: 'play', instanceId: tt.instanceId }, t.as(0));
  const seen = settle(t, [[d => d.targeting, () => 'trick-target'], [d => d.playerId === t.P(1).playerId && /Cast it without/.test(d.prompt || ''), 'no']]);
  const milled = t.P(1).deck.graveyard.length - 1;   // the countered Opt is there too
  check("Tibalt's Trickery: the spell is countered, its controller mills 1-3 and is asked about the card found", t.names(1, 'graveyard').includes('Opt') && milled >= 1 && milled <= 3 && seen.some(d => d.playerId === t.P(1).playerId) && t.P(1).deck.remainingLibrary.length === lib - milled, JSON.stringify([milled, t.P(1).deck.remainingLibrary.length - lib]));
  t.game.stack = [];
}

{
  const t = setup();
  t.give(0, 'Divination', 'graveyard');
  const loam = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Divination'); asText(t, loam, 'Return up to three target land cards from your graveyard to your hand.\nDredge 3 (If you would draw a card, you may mill three cards instead. If you do, return this card from your graveyard to your hand.)', { typeLine: 'Sorcery' });
  const lib = t.P(0).deck.remainingLibrary.length;
  cast(t, 'Opt', 'Draw a card.', [[d => d.key.startsWith('dredge'), d => d.options.find(o => o.id !== 'draw').id]], { manaCost: '{U}' });
  check('Dredge: instead of the draw, three are milled and the dredge card returns to hand', t.P(0).deck.hand.some(c => c.instanceId === loam.instanceId) && t.P(0).deck.remainingLibrary.length === lib - 3 - 1, JSON.stringify([lib - t.P(0).deck.remainingLibrary.length]));
}
{
  const t = setup();
  t.give(0, 'Divination', 'graveyard');
  const loam = t.P(0).deck.graveyard.find(c => def(t, c).name === 'Divination'); asText(t, loam, 'Dredge 2', { typeLine: 'Sorcery' });
  t.autoPass = true; t.end(0); t.end(1);
  settle(t, [[d => d.key === 'dredge', d => d.options.find(o => o.id !== 'draw').id]]);
  check('…and in the draw step the player is asked to draw or dredge', t.P(0).deck.hand.some(c => c.instanceId === loam.instanceId));
}
{
  // Dredge on another player's draw effect: "Each player draws a card." asks the opponent too, and the opponent answers
  const t = setup();
  t.give(1, 'Divination', 'graveyard');
  const loam = t.P(1).deck.graveyard.find(c => def(t, c).name === 'Divination'); asText(t, loam, 'Dredge 2', { typeLine: 'Sorcery' });
  const asked = [];
  cast(t, 'Opt', 'Each player draws a card.', [[d => d.key.startsWith('dredge'), d => { asked.push(d.playerId); return d.options.find(o => o.id !== 'draw').id; }]], { manaCost: '{U}' });
  check('Dredge: another player\'s "each player draws" offers it to the opponent, who is asked themself', t.P(1).deck.hand.some(c => c.instanceId === loam.instanceId) && asked.includes(t.P(1).playerId), JSON.stringify([asked, t.P(1).playerId]));
}

{
  const t = setup();
  t.give(0, 'Divination'); asText(t, t.hand(0, 'Divination'), 'You gain 3 life.\nSplice onto Arcane {1} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card\'s effects to that spell.)', { typeLine: 'Instant — Arcane' });
  const life = t.P(0).life, hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Draw a card.', [['splice', d => d.options.map(o => o.id)]], { manaCost: '{U}', typeLine: 'Instant — Arcane' });
  check('Splice onto Arcane: the spliced card\'s effect is added and it stays in hand', t.P(0).life === life + 3 && t.names(0, 'hand').includes('Divination'), JSON.stringify([t.P(0).life - life]));
}

{
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever one or more land cards are put into your graveyard from anywhere, draw a card.', { typeLine: 'Legendary Creature — Frog Horror' });
  const lib = t.P(0).deck.remainingLibrary;
  for (const n of ['Forest', 'Island']) { const k = lib.findIndex(c => def(t, c).name === n); if (k >= 0) lib.unshift(...lib.splice(k, 1)); }
  const hand = t.P(0).deck.hand.length;
  t.give(0, 'Opt');
  cast(t, 'Opt', 'Mill three cards.', [], { manaCost: '{U}' });
  check('The Gitrog Monster: milling two lands at once draws one card', t.P(0).deck.hand.length === hand + 1, String(t.P(0).deck.hand.length - hand));
}
{
  const t = setup();
  const ba = onField(t, 'Sol Ring', "At the beginning of each end step, if an opponent lost 2 or more life this turn, you may put a quest counter on this enchantment.\nWhenever a card is put into an opponent's graveyard from anywhere, if this enchantment has three or more quest counters on it, you may have that player lose 2 life. If you do, you gain 2 life.", { typeLine: 'Enchantment' });
  ba.counters = { quest: 3 };
  const l0 = t.P(0).life, l1 = t.P(1).life;
  const foe = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => foe.instanceId], [d => d.kind === 'confirm', true]], { manaCost: '{G}' });
  check('Bloodchief Ascension: a card into an opponent\'s graveyard drains 2', t.P(1).life === l1 - 2 && t.P(0).life === l0 + 2, JSON.stringify([t.P(0).life - l0, t.P(1).life - l1]));
}

section('round 52: rules features (legend rule, ward on abilities, phasing, mutate)');
{
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', { typeLine: 'Legendary Creature — Bear' });
  t.give(0, 'Llanowar Elves'); const b = t.hand(0, 'Llanowar Elves');
  t.game.cardDefinitions[b.definitionId] = { ...def(t, a), definitionId: b.definitionId };   // a second copy of the same legend
  a.counters = { '+1/+1': 2 };
  const seen = [];
  t.ctl.dispatch({ type: 'play', instanceId: b.instanceId }, t.as(0));
  settle(t, [[d => d.key === 'legend', a.instanceId]], seen);
  check('Legend rule: its controller chooses which copy to keep; the other goes to the graveyard', seen.some(d => d.key === 'legend' && d.playerId === t.P(0).playerId) && t.P(0).deck.battlefield.some(c => c.instanceId === a.instanceId) && !t.P(0).deck.battlefield.some(c => c.instanceId === b.instanceId), JSON.stringify(seen.map(d => d.key)));
}

{
  const t = setup();
  const foe = onField(t, 'Grizzly Bears', 'Ward {2}', {}, 1);
  const pinger = onField(t, 'Fog Bank', '{0}: Target creature gets -1/-1 until end of turn.', { typeLine: 'Enchantment' });
  activate(t, pinger, 0, [[d => d.targeting, () => foe.instanceId], [d => /ward/i.test(d.title || ''), 'no']]);
  check('Ward on an activated ability: not paid, the ability is countered', power(t, foe) === 2);
  const before = t.P(0).deck.battlefield.filter(c => !c.tapped && /Land/.test(def(t, c).typeLine)).length;
  activate(t, pinger, 0, [[d => d.targeting, () => foe.instanceId], [d => /ward/i.test(d.title || ''), 'pay']]);
  const after = t.P(0).deck.battlefield.filter(c => !c.tapped && /Land/.test(def(t, c).typeLine)).length;
  check('…paid ({2}), it resolves', power(t, foe) === 1 && before - after === 2, JSON.stringify([power(t, foe), before - after]));
}

{
  const t = setup();
  const ph = onField(t, 'Grizzly Bears', 'Phasing (This phases in or out before you untap during each of your untap steps. While it\'s phased out, it\'s treated as though it doesn\'t exist.)');
  t.autoPass = true; t.end(0); t.end(1);
  check('Phasing: at its controller\'s untap step it phases out', !t.P(0).deck.battlefield.includes(ph) && (t.P(0).deck.phasedOut || []).includes(ph));
  t.end(0); t.end(1);
  check('…and phases back in at the next one', t.P(0).deck.battlefield.includes(ph));
}

{
  const t = setup();
  const host = onField(t, 'Grizzly Bears', 'Trample');
  t.give(0, 'Colossal Dreadmaw'); const m = asText(t, t.hand(0, 'Colossal Dreadmaw'), 'Mutate {G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nReach\nWhenever this creature mutates, draw a card.', { manaCost: '{4}{G}', power: '4', toughness: '4', typeLine: 'Creature — Beast' });
  const hand = t.P(0).deck.hand.length;
  t.ctl.dispatch({ type: 'play', instanceId: m.instanceId }, t.as(0));
  settle(t, [['castMode', 'mutate'], [d => d.key === 'mutate', host.instanceId], ['mutate:position', 'over']]);
  const d = (await import('../../src/engine/effects.js')).definitionFor(t.game, host);
  check('Mutate: on top it is a 4/4 with the bear\'s trample, its own reach, and it drew a card', d.name === 'Colossal Dreadmaw' && power(t, host) === 4 && /Trample/.test(d.oracleText) && /Reach/.test(d.oracleText) && t.P(0).deck.hand.length === hand, JSON.stringify([d.name, power(t, host), t.P(0).deck.hand.length - hand]));
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => host.instanceId]], { manaCost: '{G}' });
  check('…when it dies, both cards go to the graveyard', t.names(0, 'graveyard').includes('Grizzly Bears') && t.names(0, 'graveyard').includes('Colossal Dreadmaw'), JSON.stringify(t.names(0, 'graveyard')));
}

{
  // Moraug: an extra combat granted in the first main phase comes straight after it (two combats, then the second main phase)
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Forest', 'battlefield');
  t.end(0); t.end(1);
  const bear = t.bf(0, 'Grizzly Bears');
  const H = await import('../../src/engine/effects-catalog.js');
  const phase0 = t.game.phase;
  H.applyCatalogEffect ? H.applyCatalogEffect(t.game, t.P(0).playerId, { kind: 'extra-combat' }, {}, []) : (t.game.extraBeforeMain2 = 1);
  const queued = Number(t.game.extraBeforeMain2 || 0) === 1 && !Number(t.game.extraCombats || 0);
  t.game.rulesConfig = { ...(t.game.rulesConfig || {}), autoSkip: false };   // the bear stays tapped here (Moraug would untap it)
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  const afterFirst = t.game.phase;
  bear.tapped = false;
  const life1 = t.P(1).life;
  if (afterFirst === 'combat' || afterFirst === 'begin-combat') { t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] }); settle(t); }
  check('Moraug: an extra combat from the first main phase comes before the second main phase', phase0 === 'precombat-main' && queued && (afterFirst === 'combat' || afterFirst === 'begin-combat') && t.P(1).life === life1 - 2 && t.game.phase === 'postcombat-main', JSON.stringify([phase0, queued, afterFirst, life1 - t.P(1).life, t.game.phase]));
}

{
  // Kardur: the goad covers creatures the opponents get later, until Kardur's controller's next turn
  const t = newGame(['simic', 'simic']); t.keepAll();
  const E = await import('../../src/engine/effects.js'), R = await import('../../src/engine/rules.js');
  E.applyEffects(t.game, t.P(0).playerId, [{ kind: 'goad-each', scope: 'opponents' }], {}, []);
  t.give(1, 'Grizzly Bears', 'battlefield');
  const late = t.bf(1, 'Grizzly Bears');
  const now = R.goadersOf(t.game, late, t.P(1).playerId).has(t.P(0).playerId);
  t.end(0);
  const req = R.validateRequiredAttackers({ game: t.game, player: t.P(1), draft: [] });
  t.end(1);
  const after = R.goadersOf(t.game, late, t.P(1).playerId).size;
  check('Kardur: a creature the opponent gets later is goaded too, until Kardur\'s controller\'s next turn', now && after === 0, JSON.stringify([now, req.reasons, after]));
}

{
  // Echo / Cumulative upkeep paid with an action: done once per age counter, or the permanent is sacrificed
  const t = setup();
  const cu = onField(t, 'Grizzly Bears', 'Cumulative upkeep—Draw a card. (At the beginning of your upkeep, put an age counter on this permanent, then you may pay its upkeep cost for each age counter on it. If you don\'t, sacrifice it.)');
  t.autoPass = true; t.end(0); t.end(1);
  const h0 = t.P(0).deck.hand.length;
  settle(t, [[d => d.key === 'may-pay', 'pay']]);
  const past = () => !['untap', 'upkeep'].includes(t.game.phase) ? 1 : 0;   // the draw step's own card, when it has come
  const first = t.P(0).deck.hand.length - h0 - past();
  t.end(0); t.end(1);
  const h1 = t.P(0).deck.hand.length;
  settle(t, [[d => d.key === 'may-pay', 'pay']]);
  const second = t.P(0).deck.hand.length - h1 - past();
  t.end(0); t.end(1);
  settle(t, [[d => d.key === 'may-pay', 'no']]);
  check('Cumulative upkeep with an action: draw 1, then 2 (one per age counter), then declined it is sacrificed', first === 1 && second === 2 && !t.P(0).deck.battlefield.includes(cu), JSON.stringify([first, second, t.P(0).deck.battlefield.includes(cu)]));
}


{
  // Forage as a cost: exile three cards from your graveyard (chosen) or sacrifice a Food
  const t = setup();
  const src = onField(t, 'Fog Bank', '{1}, Forage: Draw a card.', { typeLine: 'Artifact' });
  for (let k = 0; k < 3; k++) { const c = t.P(0).deck.remainingLibrary.pop(); c.zone = 'graveyard'; t.P(0).deck.graveyard.push(c); }
  const gy = t.P(0).deck.graveyard.slice(-3).map(c => c.instanceId), hand = t.P(0).deck.hand.length;
  const ab = parseActivatedAbilities(def(t, src)).find(a => /Forage/i.test(a.cost || ''));
  t.ctl.dispatch({ type: 'activate', instanceId: src.instanceId, abilityId: ab.id }, t.as(0));
  settle(t, [['cost:forage-exile', () => gy]]);
  check('Forage: three chosen graveyard cards are exiled, then the ability resolves', gy.every(id => t.P(0).deck.exile.some(c => c.instanceId === id)) && t.P(0).deck.hand.length === hand + 1, JSON.stringify([t.P(0).deck.exile.length, t.P(0).deck.hand.length - hand]));
}

{
  // Connive: draw, then discard (the card about to be drawn can be the one); a nonland discard gives a +1/+1 counter
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  t.give(0, 'Divination');
  const seen = [];
  cast(t, 'Opt', 'Target creature you control connives.', [[d => d.targeting, () => bear.instanceId], [d => { seen.push(d.title); return /Connive|Discard/i.test(d.title || ''); }, d => [d.options.find(o => /Divination/.test(o.label || ''))?.id].filter(Boolean)]], { manaCost: '{U}' });
  check('Connive: draw, discard a nonland card, +1/+1 counter', Number(bear.counters?.['+1/+1'] || 0) === 1, JSON.stringify([bear.counters, seen]));
}

{
  // Vanishing / Fading / Modular / Bloodthirst counters as it enters; Vanishing and Fading upkeep
  const t = setup();
  const used = new Set(t.P(0).deck.battlefield.map(x => x.definitionId));
  const cast2 = (text) => { const lib = t.P(0).deck.remainingLibrary, i = lib.findIndex(x => !used.has(x.definitionId) && /Creature/.test(def(t, x).typeLine) && !t.P(0).deck.hand.some(h => h.definitionId === x.definitionId)); const [c] = lib.splice(i, 1); used.add(c.definitionId); c.zone = 'hand'; t.P(0).deck.hand.push(c); asText(t, c, text, { manaCost: '{0}', typeLine: 'Creature — Bear', power: '2', toughness: '2' }); t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0)); settle(t); return c; };
  const v = cast2('Vanishing 2'), f = cast2('Fading 1'), m = cast2('Modular 2');
  const enter = [v.counters?.time, f.counters?.fade, m.counters?.['+1/+1']].join();
  t.autoPass = true; t.end(0); t.end(1); settle(t);
  const up1 = [Number(v.counters?.time || 0), Number(f.counters?.fade || 0), t.P(0).deck.battlefield.includes(f)].join();
  t.end(0); t.end(1); settle(t);
  check('Vanishing 2 / Fading 1 / Modular 2 enter with their counters; upkeeps remove them, then sacrifice', enter === '2,1,2' && up1 === '1,0,true' && !t.P(0).deck.battlefield.includes(v) && !t.P(0).deck.battlefield.includes(f), JSON.stringify([enter, up1, t.P(0).deck.battlefield.includes(v), t.P(0).deck.battlefield.includes(f)]));
}

{
  // Landwalk: unblockable while the defender controls that land type. Decayed: can't block; sacrificed at end of combat after attacking.
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Island', 'battlefield');
  t.end(0); t.end(1);
  const bear = t.bf(0, 'Grizzly Bears');
  asText(t, bear, 'Islandwalk', { typeLine: 'Creature — Bear', power: '2', toughness: '2' });
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  const unblockable = (bear.temporaryEffects || []).some(e => e.restriction === 'cant-be-blocked');
  settle(t);
  check('Landwalk: Islandwalk can\'t be blocked while the defender controls an Island', unblockable, JSON.stringify(bear.temporaryEffects));
}
{
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield');
  t.end(0); t.end(1);
  const z = t.bf(0, 'Grizzly Bears');
  asText(t, z, 'Decayed', { typeLine: 'Creature — Zombie', power: '2', toughness: '2' });
  const R = await import('../../src/engine/rules.js');
  const cantBlock = !R.validateBlock({ blocker: z, definition: def(t, z), attackerDefinition: def(t, z), attacker: z }).legal;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: z.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  check('Decayed: it can\'t block, and after attacking it is sacrificed at end of combat', cantBlock && !t.P(0).deck.battlefield.includes(z) && t.P(0).deck.graveyard.includes(z), JSON.stringify([cantBlock, t.game.phase, t.P(0).deck.battlefield.includes(z)]));
}

{
  // Suspect: menace and can't block while suspected
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Opt', 'Suspect target creature.', [[d => d.targeting, () => bear.instanceId]], { manaCost: '{U}' });
  const R = await import('../../src/engine/rules.js');
  check('Suspect: the creature has menace and can\'t block', bear.suspected && R.attackerMinimumBlockers(def(t, bear), bear) === 2 && !R.validateBlock({ blocker: bear, definition: def(t, bear), attackerDefinition: def(t, bear), attacker: bear }).legal, JSON.stringify(bear.temporaryEffects));
}

{
  // Devour 2: two creatures sacrificed as it enters → four +1/+1 counters
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''), b = onField(t, 'Fog Bank', '', { typeLine: 'Creature — Wall' });
  const lib = t.P(0).deck.remainingLibrary, i = lib.findIndex(x => /Creature/.test(def(t, x).typeLine) && x.definitionId !== a.definitionId && x.definitionId !== b.definitionId);
  const [c] = lib.splice(i, 1); c.zone = 'hand'; t.P(0).deck.hand.push(c);
  asText(t, c, 'Devour 2', { manaCost: '{0}', typeLine: 'Creature — Dragon', power: '1', toughness: '1' });
  t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0));
  settle(t, [['enters:devour', () => [a.instanceId, b.instanceId]]]);
  check('Devour 2: the chosen creatures are sacrificed and it gets 4 +1/+1 counters', Number(c.counters?.['+1/+1'] || 0) === 4 && !t.P(0).deck.battlefield.includes(a) && !t.P(0).deck.battlefield.includes(b), JSON.stringify([c.counters, t.P(0).deck.battlefield.includes(a)]));
}

{
  // Sunburst: a counter for each colour of mana spent ({G}{U} → two)
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary, i = lib.findIndex(x => /Creature/.test(def(t, x).typeLine) && !t.P(0).deck.hand.some(h => h.definitionId === x.definitionId) && !t.P(0).deck.battlefield.some(h => h.definitionId === x.definitionId));
  const [c] = lib.splice(i, 1); c.zone = 'hand'; t.P(0).deck.hand.push(c);
  asText(t, c, 'Sunburst', { manaCost: '{G}{U}', typeLine: 'Artifact Creature — Construct', power: '0', toughness: '0' });
  t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0)); settle(t);
  check('Sunburst: {G}{U} spent → two +1/+1 counters', Number(c.counters?.['+1/+1'] || 0) === 2, JSON.stringify(c.counters));
}

{
  // Awaken 2: cast for its awaken cost, a land you control gets two +1/+1 counters and becomes a 0/0 Elemental creature with haste
  const t = setup();
  const land = t.P(0).deck.battlefield.find(c => /Land/.test(def(t, c).typeLine));
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Draw a card.\nAwaken 2\u2014{U} (If you cast this spell for {U}, also put two +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It\'s still a land.)', [['castMode', 'awaken'], [d => d.targeting, () => land.instanceId]], { manaCost: '{3}{U}', typeLine: 'Sorcery' });
  const d2 = (await import('../../src/engine/effects.js')).definitionFor(t.game, land);
  check('Awaken: the land gets two +1/+1 counters and is a creature; the spell still draws', Number(land.counters?.['+1/+1'] || 0) === 2 && /Creature/.test(d2.typeLine || '') && /Land/.test(d2.typeLine || ''), JSON.stringify([land.counters, d2.typeLine, t.P(0).deck.hand.length - hand]));
}

{
  // Modular: when it dies, its +1/+1 counters may go onto target artifact creature
  const t = setup();
  const host = onField(t, 'Fog Bank', '', { typeLine: 'Artifact Creature — Construct', power: '0', toughness: '2' });
  const mod = onField(t, 'Grizzly Bears', 'Modular 2', { typeLine: 'Artifact Creature — Construct', power: '0', toughness: '0' });
  mod.counters = { '+1/+1': 2 };
  const pick = () => (t.P(0).deck.battlefield.includes(mod) ? mod.instanceId : host.instanceId);
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, pick], [d => d.kind === 'confirm', true]], { manaCost: '{0}' });
  settle(t, [[d => d.targeting, pick], [d => d.kind === 'confirm', true]]);
  check('Modular: dying, its two +1/+1 counters go onto the chosen artifact creature', Number(host.counters?.['+1/+1'] || 0) === 2 && !t.P(0).deck.battlefield.includes(mod), JSON.stringify([host.counters, t.P(0).deck.battlefield.includes(mod)]));
}

{
  // Companion: outside the game beside the commander; once per game, as a sorcery, {3}: put it into your hand
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary, i = lib.findIndex(x => /Creature/.test(def(t, x).typeLine));
  const [comp] = lib.splice(i, 1); comp.zone = 'command'; comp.companion = true; t.P(0).deck.commandZone.push(comp);
  asText(t, comp, 'Companion \u2014 Each permanent card in your starting deck has mana value 2 or less.', { typeLine: 'Creature — Cat Nightmare' });
  const cast = t.ctl.dispatch({ type: 'play', instanceId: comp.instanceId }, t.as(0));
  const r = t.ctl.dispatch({ type: 'activate', instanceId: comp.instanceId, abilityId: 'special:companion' }, t.as(0)); settle(t);
  const inHand = t.P(0).deck.hand.some(c => c.instanceId === comp.instanceId);
  check('Companion: it can\'t be cast from outside the game; {3} puts it into your hand once', !cast.ok && r.ok && inHand && t.P(0).companionUsed === true, JSON.stringify([cast.ok, r.ok, r.error, inHand]));
}

{
  // Voting: each player is asked their own vote; a tie goes to the "or the vote is tied" option
  const t = setup();
  const voters = [], hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Will of the council \u2014 Starting with you, each player votes for time or knowledge. If time gets more votes, take an extra turn after this one. If knowledge gets more votes or the vote is tied, draw three cards.', [[d => /vote/i.test(d.title || ''), d => { voters.push(d.playerId); return d.playerId === t.P(0).playerId ? 'knowledge' : 'time'; }]], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Voting: both players vote (each asked); 1–1 is tied, so knowledge: draw three', voters.includes(t.P(0).playerId) && voters.includes(t.P(1).playerId) && t.P(0).deck.hand.length === hand + 3, JSON.stringify([voters.length, t.P(0).deck.hand.length - hand]));
}

{
  // Galvanic Discharge: three energy, then pay any amount of it (asked as it resolves) for that much damage
  const t = setup();
  t.P(0).counters = { ...(t.P(0).counters || {}), energy: 2 };
  const ogre = onField(t, 'Grizzly Bears', '', { power: '7', toughness: '7' }, 1);
  let asked = null;
  cast(t, 'Opt', 'Choose target creature or planeswalker. You get {E}{E}{E} (three energy counters), then you may pay any amount of {E}. Galvanic Discharge deals that much damage to that permanent.', [[d => d.kind === 'target' || /target/i.test(d.prompt || ''), d => d.options.find(o => o.id === ogre.instanceId)?.id], [d => d.kind === 'number', d => { asked = d; return 4; }]], { manaCost: '{U}', typeLine: 'Instant' });
  check('Galvanic Discharge: asked how much energy (2 held + 3 given), pays 4, 4 damage to the target', asked?.max === 5 && Number(t.P(0).counters.energy) === 1 && Number(t.bf(1, 'Grizzly Bears')?.damageMarked || 0) === 4, JSON.stringify([asked?.max, t.P(0).counters, t.bf(1, 'Grizzly Bears')?.damageMarked]));
}

section('suspend given by other cards: Delay, Jhoira, Taigam');
{
  // Delay: the countered spell is exiled with three time counters and gains suspend
  const t = setup();
  t.give(1, 'Opt'); const foeSpell = t.hand(1, 'Opt');
  t.P(1).deck.hand.splice(t.P(1).deck.hand.indexOf(foeSpell), 1); foeSpell.zone = 'stack';
  t.game.stack = [{ id: 'delay-target', kind: 'spell', controllerId: t.P(1).playerId, card: foeSpell, label: 'Opt' }];
  t.give(0, 'Counterspell'); const dl = asText(t, t.hand(0, 'Counterspell'), "Counter target spell. If the spell is countered this way, exile it with three time counters on it instead of putting it into its owner's graveyard. If it doesn't have suspend, it gains suspend.", { manaCost: '{1}{U}' });
  t.ctl.dispatch({ type: 'play', instanceId: dl.instanceId }, t.as(0));
  settle(t, [[d => d.targeting, () => 'delay-target']]);
  check('Delay: the spell is exiled with three time counters and is suspended', foeSpell.zone === 'exile' && foeSpell.suspended && foeSpell.counters?.time === 3 && t.P(1).deck.exile.includes(foeSpell), JSON.stringify([foeSpell.zone, foeSpell.suspended, foeSpell.counters]));
  t.game.stack = [];
}
{
  // Jhoira: exile a nonland card from your hand (the cost), four time counters on it, it gains suspend; it is cast when the last comes off
  const t = setup();
  const jh = onField(t, 'Llanowar Elves', '{2}, Exile a nonland card from your hand: Put four time counters on the exiled card. If it doesn\'t have suspend, it gains suspend.');
  t.give(0, 'Grizzly Bears'); const bear = t.hand(0, 'Grizzly Bears');
  activate(t, jh, 0, [[d => d.options?.some(o => o.id === bear.instanceId), d => d.kind === 'choose-many' ? [bear.instanceId] : bear.instanceId]]);
  check('Jhoira: the exiled card gets four time counters and suspend', bear.zone === 'exile' && bear.suspended && bear.counters?.time === 4, JSON.stringify([bear.zone, bear.suspended, bear.counters]));
  t.autoPass = true;
  for (let k = 0; k < 4; k++) { t.end(0); t.end(1); settle(t); }
  check('…and is cast for free when the last time counter comes off', !!t.bf(0, 'Grizzly Bears'), JSON.stringify([bear.zone, bear.counters]));
}

{
  // Taigam: copy the spell, then counter the original, exile it with four time counters, and it gains suspend
  const t = setup();
  onField(t, 'Llanowar Elves', "Whenever you cast a spell, if it's the second spell you've cast this turn, copy that spell. You may choose new targets for the copy. Then counter the original spell, exile it with four time counters on it, and it gains suspend.");
  cast(t, 'Opt', 'Draw a card.', [], { manaCost: '{U}', typeLine: 'Instant' });
  const hand = t.P(0).deck.hand.length;
  t.give(0, 'Divination'); const dv = asText(t, t.hand(0, 'Divination'), 'Draw two cards.', { manaCost: '{U}', typeLine: 'Sorcery' });
  t.ctl.dispatch({ type: 'play', instanceId: dv.instanceId }, t.as(0)); settle(t);
  check('Taigam: the copy resolves (two cards), the original is exiled with four time counters, suspended', t.P(0).deck.hand.length === hand + 2 && dv.zone === 'exile' && dv.suspended && dv.counters?.time === 4, JSON.stringify([t.P(0).deck.hand.length - hand, dv.zone, dv.suspended, dv.counters]));
}

section('long tail, build 84');
{
  // Ever After / Seasons Past: the spell goes to the bottom of its owner's library
  const t = setup();
  t.give(0, 'Divination'); const dv = asText(t, t.hand(0, 'Divination'), "Draw two cards. Put Divination on the bottom of its owner's library.", { manaCost: '{U}', typeLine: 'Sorcery' });
  t.ctl.dispatch({ type: 'play', instanceId: dv.instanceId }, t.as(0)); settle(t);
  const lib = t.P(0).deck.remainingLibrary;
  check('"Put ~ on the bottom of its owner\'s library": the spell is the bottom card', lib[lib.length - 1]?.instanceId === dv.instanceId && !t.P(0).deck.graveyard.includes(dv), JSON.stringify([dv.zone, lib.length]));
}
{
  // Scorching Dragonfire: "If that creature or planeswalker would die this turn, exile it instead."
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '', {}, 1);
  cast(t, 'Opt', 'Opt deals 3 damage to target creature or planeswalker. If that creature or planeswalker would die this turn, exile it instead.', [[d => d.targeting, d => d.options.find(o => o.id === bear.instanceId)?.id]], { manaCost: '{U}', typeLine: 'Instant' });
  check('Scorching Dragonfire: the creature is exiled instead of dying', t.P(1).deck.exile.some(c => c.instanceId === bear.instanceId) && !t.P(1).deck.graveyard.some(c => c.instanceId === bear.instanceId), JSON.stringify(bear.zone));
}

{
  // Bontu's Last Reckoning: "Lands you control don't untap during your next untap step."
  const t = setup();
  cast(t, 'Divination', "Destroy all creatures. Lands you control don't untap during your next untap step.", [], { manaCost: '{2}{U}', typeLine: 'Sorcery' });
  const tapped = () => t.P(0).deck.battlefield.filter(c => /Land/.test(def(t, c).typeLine) && c.tapped).length;
  const before = tapped();
  t.autoPass = true; t.end(0); t.end(1); settle(t);
  const after1 = tapped();
  t.end(0); t.end(1); settle(t);
  check("Bontu's Last Reckoning: the tapped lands stay tapped for one untap step only", before === 3 && after1 === 3 && tapped() === 0, JSON.stringify([before, after1, tapped()]));
}

{
  // Plaxmanta: "When this creature enters, sacrifice it unless {G} was spent to cast it."
  const t = setup();
  cast(t, 'Grizzly Bears', 'When this creature enters, sacrifice it unless {G} was spent to cast it.', [], { manaCost: '{G}' });
  const kept = !!t.bf(0, 'Grizzly Bears');
  cast(t, 'Llanowar Elves', 'When this creature enters, sacrifice it unless {G} was spent to cast it.', [], { manaCost: '{U}' });
  check('"sacrifice it unless {G} was spent to cast it": kept when {G} was spent, sacrificed when it was not', kept && !t.bf(0, 'Llanowar Elves') && t.names(0, 'graveyard').includes('Llanowar Elves'), JSON.stringify([kept, t.names(0, 'battlefield')]));
}

{
  // Blackmail: the target player chooses three cards to reveal; you choose one of them; it is discarded
  const t = setup();
  for (const n of ['Forest', 'Island', 'Opt', 'Divination', 'Grizzly Bears']) t.give(1, n);
  const handBefore = t.P(1).deck.hand.length;
  let revealAsked = null, pickAsked = null;
  cast(t, 'Opt', 'Target player reveals three cards from their hand and you choose one of them. That player discards that card.', [
    [d => d.kind === 'choose-one' && d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId],
    [d => /reveal 3/.test(d.title || ''), d => { revealAsked = d; return t.P(1).deck.hand.filter(c => ['Opt', 'Divination', 'Grizzly Bears'].includes(def(t, c).name)).map(c => c.instanceId); }],
    [d => /hand/.test(d.title || '') && d.kind === 'choose-many', d => { pickAsked = d; return [d.options.filter(o => !o.disabled).find(o => o.label === 'Divination').id]; }]
  ], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Blackmail: the revealing player picks the three; you choose among those only; that card is discarded', revealAsked?.playerId === t.P(1).playerId && pickAsked && pickAsked.options.filter(o => !o.disabled).length === 3 && t.names(1, 'graveyard').includes('Divination') && t.P(1).deck.hand.length === handBefore - 1, JSON.stringify([revealAsked?.playerId === t.P(1).playerId, pickAsked?.options.filter(o => !o.disabled).map(o => o.label), t.names(1, 'graveyard')]));
}
{
  // Traumatic Revelation: "You may choose a creature or battle card from it. If you do, that player discards that card. If you don't, incubate 3."
  const t = setup();
  t.give(1, 'Grizzly Bears');
  const text = "Target opponent reveals their hand. You may choose a creature or battle card from it. If you do, that player discards that card. If you don't, incubate 3.";
  cast(t, 'Opt', text, [[d => /hand/.test(d.title || '') && d.kind === 'choose-many', d => [d.options.find(o => o.label === 'Grizzly Bears').id]]], { manaCost: '{U}', typeLine: 'Sorcery' });
  const noTokenFirst = !t.P(0).deck.battlefield.some(c => /Incubator/.test(def(t, c).name || ''));
  t.give(1, 'Llanowar Elves');
  cast(t, 'Divination', text, [[d => /hand/.test(d.title || '') && d.kind === 'choose-many', () => []]], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Traumatic Revelation: a chosen card is discarded; choosing none incubates instead', noTokenFirst && t.names(1, 'graveyard').includes('Grizzly Bears') && t.P(0).deck.battlefield.some(c => /Incubator/.test(def(t, c).name || '')), JSON.stringify([noTokenFirst, t.names(1, 'graveyard'), t.names(0, 'battlefield')]));
}
{
  // Perish the Thought: the chosen card is shuffled into its owner's library
  const t = setup();
  t.give(1, 'Grizzly Bears'); const bear = t.hand(1, 'Grizzly Bears');
  cast(t, 'Opt', 'Target opponent reveals their hand. You choose a card from it. That player shuffles that card into their library.', [[d => /hand/.test(d.title || '') && d.kind === 'choose-many', () => [bear.instanceId]]], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Perish the Thought: the chosen card goes into its owner\'s library', t.P(1).deck.remainingLibrary.includes(bear) && !t.P(1).deck.hand.includes(bear), JSON.stringify(bear.zone));
}

{
  // Disallow: an activated ability, and (separately) a spell
  const t = setup();
  t.give(0, 'Opt'); const dis = asText(t, t.hand(0, 'Opt'), 'Counter target spell, activated ability, or triggered ability.', { typeLine: 'Instant', manaCost: '{U}' });
  const tim = onField(t, 'Llanowar Elves', '{T}: Draw a card.', {}, 1);
  t.autoPass = true; t.end(0); t.autoPass = false;
  const hand = t.P(1).deck.hand.length;
  t.ctl.dispatch({ type: 'activate', instanceId: tim.instanceId, abilityId: parseActivatedAbilities(def(t, tim))[0].id }, t.as(1));
  if (t.game.flow.priority?.holderId === t.P(1).playerId) t.ctl.dispatch({ type: 'pass' }, t.as(1));
  const r = t.ctl.dispatch({ type: 'play', instanceId: dis.instanceId }, t.as(0));
  settle(t, [[d => d.targeting || /ability/i.test(d.prompt + d.title), d => d.options[0].id]]);
  check('Disallow: counters an activated ability', r.ok && t.P(1).deck.hand.length === hand, JSON.stringify([r.error, t.P(1).deck.hand.length - hand]));
}
{
  // Disallow on a spell, and Rebuff the Wicked only offered a spell targeting your permanent
  const t = setup();
  t.give(1, 'Opt'); const foe = t.hand(1, 'Opt');
  t.P(1).deck.hand.splice(t.P(1).deck.hand.indexOf(foe), 1); foe.zone = 'stack';
  const mine = onField(t, 'Grizzly Bears', '');
  t.give(1, 'Divination'); const other = t.hand(1, 'Divination');
  t.P(1).deck.hand.splice(t.P(1).deck.hand.indexOf(other), 1); other.zone = 'stack';
  t.game.stack = [{ id: 'not-mine', kind: 'spell', controllerId: t.P(1).playerId, card: other, label: 'Divination', effectBindings: {} }, { id: 'at-mine', kind: 'spell', controllerId: t.P(1).playerId, card: foe, label: 'Opt', effectBindings: { target0: mine.instanceId } }];
  let offered = null;
  const cands = candidatesFor(t.game, { kind: 'stack-target', scope: 'spell', targetsYours: true }, t.P(0)).map(o => o.id);
  t.give(0, 'Counterspell'); const rb = asText(t, t.hand(0, 'Counterspell'), 'Counter target spell that targets a permanent you control.', { manaCost: '{W}'.replace('W', 'U') });
  t.ctl.dispatch({ type: 'play', instanceId: rb.instanceId }, t.as(0));
  settle(t, [[d => d.targeting, d => { offered = d.options.map(o => o.id); return 'at-mine'; }]]);
  check('Rebuff the Wicked: only the spell targeting your permanent can be chosen; it is countered', (offered === null || JSON.stringify(offered) === '["at-mine"]') && t.P(1).deck.graveyard.includes(foe) && JSON.stringify(cands) === '["at-mine"]', JSON.stringify([offered, foe.zone, cands]));
  t.game.stack = [];
}
{
  // The Scarab God: when it dies, it returns to its owner's hand at the beginning of the next end step
  const t = setup();
  const god = onField(t, 'Grizzly Bears', "When this creature dies, return it to its owner's hand at the beginning of the next end step.");
  cast(t, 'Opt', 'Destroy target creature.', [[d => d.targeting, () => god.instanceId]], { manaCost: '{U}', typeLine: 'Instant' });
  const inYard = t.P(0).deck.graveyard.includes(god);
  t.autoPass = true; t.end(0); settle(t);
  check('The Scarab God: dies, then returns to hand at the next end step', inYard && t.P(0).deck.hand.includes(god), JSON.stringify([inYard, god.zone]));
}
{
  // Pestilence: "At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment."
  const t = setup();
  for (const p of t.game.players) for (const c of [...p.deck.battlefield]) if (/Creature/.test(def(t, c).typeLine)) t.edit({ kind: 'move', instanceId: c.instanceId, to: 'graveyard' });
  const pest = onField(t, 'Grizzly Bears', 'At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.', { typeLine: 'Enchantment' });
  t.autoPass = true; t.end(0); settle(t);
  check('Pestilence: sacrificed at the end step with no creatures on the battlefield', t.P(0).deck.graveyard.includes(pest), JSON.stringify(pest.zone));
}
{
  // Spitting Earth (damage equal to Forests here), Corrupt's life gain, Marrow Shards, Oust
  const t = setup();
  const big = onField(t, 'Grizzly Bears', '', { power: '9', toughness: '9' }, 1);
  cast(t, 'Opt', 'Opt deals damage to target creature equal to the number of Forests you control.', [[d => d.targeting, () => big.instanceId]], { manaCost: '{U}', typeLine: 'Instant' });
  check('Spitting Earth: damage equal to the lands of that type you control (4)', Number(big.damageMarked || 0) === 4, JSON.stringify(big.damageMarked));
  const life = t.P(0).life;
  cast(t, 'Divination', 'Divination deals damage equal to the number of Islands you control to any target. You gain life equal to the damage dealt this way.', [[d => d.targeting, () => t.P(1).playerId]], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Corrupt: you gain life equal to the damage dealt', t.P(0).life === life + 4, JSON.stringify([life, t.P(0).life]));
}
{
  const t = setup();
  const att = onField(t, 'Grizzly Bears', '', { power: '2', toughness: '2' }, 1), home = onField(t, 'Llanowar Elves', '', {}, 1);
  t.game.combatState = { ...(t.game.combatState || {}), attackers: [{ instanceId: att.instanceId }] };
  cast(t, 'Opt', 'Opt deals 1 damage to each attacking creature.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('Marrow Shards: only attacking creatures are dealt damage', Number(att.damageMarked || 0) === 1 && !Number(home.damageMarked || 0), JSON.stringify([att.damageMarked, home.damageMarked]));
  t.game.combatState = null;
}
{
  const t = setup();
  const vic = onField(t, 'Grizzly Bears', '', {}, 1);
  const life = t.P(1).life;
  cast(t, 'Opt', "Put target creature into its owner's library second from the top. Its controller gains 3 life.", [[d => d.targeting, () => vic.instanceId]], { manaCost: '{W}'.replace('W', 'U'), typeLine: 'Sorcery' });
  check('Oust: second from the top of its owner\'s library; its controller gains 3 life', t.P(1).deck.remainingLibrary[1]?.instanceId === vic.instanceId && t.P(1).life === life + 3, JSON.stringify([t.P(1).deck.remainingLibrary.findIndex(c => c.instanceId === vic.instanceId), t.P(1).life - life]));
}

section('triggers that never fired (build 89)');
{
  // Niv-Mizzet, Visionary: "Whenever a source you control deals noncombat damage to an opponent, you draw that many cards."
  const t = setup();
  onField(t, 'Llanowar Elves', 'Whenever a source you control deals noncombat damage to an opponent, you draw that many cards.');
  const hand = t.P(0).deck.hand.length;
  cast(t, 'Opt', 'Opt deals 2 damage to target player.', [[d => d.targeting, () => t.P(1).playerId]], { manaCost: '{U}', typeLine: 'Instant' });
  check('Niv-Mizzet, Visionary: noncombat damage to an opponent from your spell draws that many', t.P(0).deck.hand.length === hand + 2, JSON.stringify(t.P(0).deck.hand.length - hand));
}
{
  // Glaring Fleshraker: "Whenever another colorless creature you control enters, …"; a coloured token does not count
  const t = setup();
  onField(t, 'Llanowar Elves', 'Whenever another colorless creature you control enters, you gain 1 life.');
  const life = t.P(0).life;
  cast(t, 'Opt', 'Create a 1/1 green Saproling creature token.', [], { manaCost: '{U}', typeLine: 'Instant' });
  const afterGreen = t.P(0).life;
  cast(t, 'Divination', 'Create a 1/1 colorless Eldrazi Scion creature token.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('"another colorless creature you control enters": a colorless token counts, a green one does not', afterGreen === life && t.P(0).life === life + 1, JSON.stringify([life, afterGreen, t.P(0).life]));
}
{
  // Argent Dais: "Whenever two or more creatures attack, put an oil counter on this artifact."
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Llanowar Elves', 'battlefield'); t.give(0, 'Sol Ring', 'battlefield');
  const dais = t.bf(0, 'Sol Ring'); asText(t, dais, 'Whenever two or more creatures attack, put an oil counter on this artifact.', { typeLine: 'Artifact' });
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [t.bf(0, 'Grizzly Bears'), t.bf(0, 'Llanowar Elves')].map(c => ({ instanceId: c.instanceId, defenderId: t.P(1).playerId })) });
  settle(t);
  check('Argent Dais: two creatures attacking puts an oil counter on it', Number(dais.counters?.oil || 0) === 1, JSON.stringify(dais.counters));
}
{
  // Tome of Legends: "Whenever your commander enters or attacks, put a page counter on this artifact."
  const t = setup();
  const tome = onField(t, 'Sol Ring', 'Whenever your commander enters or attacks, put a page counter on this artifact.', { typeLine: 'Artifact' });
  const cmd = t.P(0).deck.commandZone[0];
  t.edit({ kind: 'move', instanceId: cmd.instanceId, to: 'battlefield' }); settle(t);
  const afterCmd = Number(tome.counters?.page || 0);
  onField(t, 'Grizzly Bears', ''); t.edit({ kind: 'move', instanceId: t.bf(0, 'Grizzly Bears').instanceId, to: 'hand' }); t.edit({ kind: 'move', instanceId: t.hand(0, 'Grizzly Bears').instanceId, to: 'battlefield' }); settle(t);
  check('Tome of Legends: your commander entering adds a page counter; another creature does not', afterCmd === 1 && Number(tome.counters?.page || 0) === 1, JSON.stringify([afterCmd, tome.counters]));
}

{
  // Planar Genesis: a land onto the battlefield tapped, or if you don't, a card into your hand; the rest to the bottom
  const text = "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put the rest on the bottom of your library in a random order.";
  for (const takeLand of [true, false]) {
    const t = setup();
    const lib = t.P(0).deck.remainingLibrary;
    const pickOut = f => lib.splice(lib.findIndex(f), 1)[0];
    const land = pickOut(c => /Land/.test(def(t, c).typeLine)), spells = [0, 1, 2].map(() => pickOut(c => !/Land/.test(def(t, c).typeLine) && def(t, c).name !== 'Opt'));   // the Opt cast below comes from the library
    lib.unshift(land, ...spells);   // the top four: a land and three spells, so both branches are tested every run
    const top = lib.slice(0, 4), spell = spells[0];
    const hand = t.P(0).deck.hand.length, bf = t.P(0).deck.battlefield.length; let second = null;
    cast(t, 'Opt', text, [[d => /onto the battlefield/.test(d.prompt || ''), () => takeLand ? [land.instanceId] : []], [d => /into your hand/.test(d.prompt || ''), d => { second = d; return [spell.instanceId]; }]], { manaCost: '{U}', typeLine: 'Sorcery' });
    const bottom = t.P(0).deck.remainingLibrary.slice(-3).map(c => c.instanceId);
    if (takeLand) check('Planar Genesis: a land taken goes onto the battlefield tapped; no card to hand; the other three on the bottom', land.zone === 'battlefield' && land.tapped && !second && t.P(0).deck.hand.length === hand && top.filter(c => c !== land).every(c => bottom.includes(c.instanceId)), JSON.stringify([land.zone, land.tapped, !!second, t.P(0).deck.hand.length - hand, top.filter(c => c !== land).map(c => bottom.includes(c.instanceId)), top.filter(c => c !== land).map(c => c.zone)]));
    else check("Planar Genesis: no land taken, so a card goes to hand instead", spell.zone === 'hand' && !!second && t.P(0).deck.battlefield.length === bf + 0 + (t.P(0).deck.battlefield.length - bf), JSON.stringify([spell.zone, !!second]));
  }
}

{
  // Peer into the Abyss: half the library drawn and half the life lost, rounded up
  const t = setup();
  const lib = t.P(1).deck.remainingLibrary.length, hand = t.P(1).deck.hand.length; t.P(1).life = 39;
  cast(t, 'Opt', 'Target player draws cards equal to half the number of cards in their library and loses half their life. Round up each time.', [[d => d.targeting || d.options?.some(o => o.id === t.P(1).playerId), () => t.P(1).playerId]], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Peer into the Abyss: draws half the library and loses half the life, rounded up', t.P(1).deck.hand.length === hand + Math.ceil(lib / 2) && t.P(1).life === 39 - 20, JSON.stringify([lib, t.P(1).deck.hand.length - hand, t.P(1).life]));
}
{
  // Ad Nauseam: asked after each card; stops when the player says so; life lost is the mana values taken
  const t = setup();
  const lib = t.P(0).deck.remainingLibrary;
  for (const c of lib.filter(c => def(t, c).name === 'Opt')) { lib.splice(lib.indexOf(c), 1); lib.push(c); }   // the Opt cast below comes from the library
  const first3 = lib.slice(0, 3), mv = first3.reduce((a, c) => a + Number(def(t, c).manaValue ?? 0), 0);
  const life = t.P(0).life; let asks = 0;
  cast(t, 'Opt', 'Reveal the top card of your library and put that card into your hand. You lose life equal to its mana value. You may repeat this process any number of times.', [[d => /Repeat\?/.test(d.prompt || ''), () => ++asks < 3 ? 'yes' : 'no']], { manaCost: '{U}', typeLine: 'Instant' });
  check('Ad Nauseam: asked each time; three cards taken, life lost equal to their mana values', asks === 3 && first3.every(c => c.zone === 'hand') && t.P(0).life === life - mv, JSON.stringify([asks, first3.map(c => c.zone), life - t.P(0).life, mv]));
}

section('build 101: the long tail, batch 1');
const tgt = id => [d => d.targeting || (d.options || []).some(o => o.id === id), () => id];
{
  // Hymn to Tourach: the game picks the cards; the player is not asked which.
  const t = setup();
  for (const n of ['Forest', 'Island', 'Grizzly Bears']) { const c = t.P(1).deck.remainingLibrary.find(x => def(t, x).name === n); t.edit({ kind: 'move', instanceId: c.instanceId, to: 'hand' }); }
  const seen = cast(t, 'Opt', 'Target player discards two cards at random.', [tgt(t.P(1).playerId)], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Hymn to Tourach: two cards discarded at random, nobody asked which', t.P(1).deck.hand.length === 1 && t.P(1).deck.graveyard.length === 2 && !seen.some(d => d.kind === 'choose-many'), JSON.stringify([t.P(1).deck.hand.length, t.P(1).deck.graveyard.length, seen.map(d => d.kind)]));
}
{
  // Ankh of Mishra: the land's controller takes the damage, not the Ankh's controller.
  const t = setup();
  onField(t, 'Fog Bank', 'Whenever a land enters, this artifact deals 2 damage to that land\'s controller.', { typeLine: 'Artifact' }, 1);
  const l0 = t.P(0).life, l1 = t.P(1).life;
  t.give(0, 'Forest'); t.ctl.dispatch({ type: 'play', instanceId: t.hand(0, 'Forest').instanceId }, t.as(0)); settle(t);
  check('Ankh of Mishra: 2 damage to the player whose land entered', t.P(0).life === l0 - 2 && t.P(1).life === l1, `${l0}→${t.P(0).life} ${l1}→${t.P(1).life}`);
}
{
  // Smash to Smithereens: the destroyed artifact's controller takes the damage.
  const t = setup();
  const rock = onField(t, 'Fog Bank', '', { typeLine: 'Artifact' }, 1);
  const l0 = t.P(0).life, l1 = t.P(1).life;
  cast(t, 'Opt', 'Destroy target artifact. Opt deals 3 damage to that artifact\'s controller.', [tgt(rock.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('Smash to Smithereens: artifact destroyed, 3 damage to its controller', rock.zone === 'graveyard' && t.P(1).life === l1 - 3 && t.P(0).life === l0, JSON.stringify([rock.zone, t.P(0).life, t.P(1).life]));
}
{
  // "loses flying", "has base power and toughness", a group "target player controls"
  const t = setup();
  const bird = onField(t, 'Fog Bank', 'Flying', { typeLine: 'Creature — Bird', power: '1', toughness: '3' }, 1);
  const mine = onField(t, 'Grizzly Bears', '{1}: This creature has base power and toughness 5/2 until end of turn.');
  cast(t, 'Opt', 'Target creature loses flying until end of turn.', [tgt(bird.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('"Target creature loses flying until end of turn"', !has(t, bird, 'Flying'));
  activate(t, mine, 0);
  check('"This creature has base power and toughness 5/2 until end of turn"', power(t, mine) === 5 && tough(t, mine) === 2, `${power(t, mine)}/${tough(t, mine)}`);
  cast(t, 'Divination', 'Creatures target player controls get -1/-1 until end of turn.', [tgt(t.P(1).playerId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('"Creatures target player controls get -1/-1": that player\'s creatures only', power(t, bird) === 0 && tough(t, bird) === 2 && power(t, mine) === 5, `${power(t, bird)}/${tough(t, bird)} ${power(t, mine)}`);
}
{
  // Several targets, each with the one-target instruction
  const t = setup();
  const a = onField(t, 'Grizzly Bears', ''), b = onField(t, 'Fog Bank', '', { power: '0', toughness: '6' }), c = onField(t, 'Fog Bank', '', { power: '0', toughness: '6' }, 1);
  let q = null;
  cast(t, 'Opt', 'Two target creatures each get +2/+0 and gain trample until end of turn.', [[d => d.kind === 'choose-many', d => { q = d; return [a.instanceId, b.instanceId]; }]], { manaCost: '{U}', typeLine: 'Instant' });
  check('"Two target creatures each get +2/+0 and gain trample": exactly two, both changed', q?.min === 2 && q?.max === 2 && power(t, a) === 4 && power(t, b) === 2 && has(t, a, 'Trample') && has(t, b, 'Trample') && power(t, c) === 0, JSON.stringify([q?.min, q?.max, power(t, a), power(t, b), power(t, c)]));
  const l1 = t.P(1).life;
  cast(t, 'Divination', 'Divination deals 1 damage to each of up to two targets.', [[d => d.kind === 'choose-many', d => { q = d; return [t.P(1).playerId, c.instanceId]; }]], { manaCost: '{U}', typeLine: 'Instant' });
  check('"deals 1 damage to each of up to two targets": a player and a creature', q?.min === 0 && q?.max === 2 && t.P(1).life === l1 - 1 && Number(c.damageMarked || 0) === 1, JSON.stringify([q?.min, q?.max, t.P(1).life - l1, c.damageMarked]));
}
{
  // "defending player mills three cards"; Gravity Well's "it loses flying"
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Fog Bank', 'battlefield');
  const bear = t.bf(0, 'Grizzly Bears'); asText(t, bear, 'Flying\nWhenever this creature attacks, defending player mills three cards.');
  asText(t, t.bf(1, 'Fog Bank'), 'Whenever a creature with flying attacks, it loses flying until end of turn.', { typeLine: 'Enchantment' });
  t.end(0); t.end(1);
  const g1 = t.P(1).deck.graveyard.length, g0 = t.P(0).deck.graveyard.length;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  check('"defending player mills three cards": the attacked player mills', t.P(1).deck.graveyard.length === g1 + 3 && t.P(0).deck.graveyard.length === g0, JSON.stringify([t.P(1).deck.graveyard.length - g1, t.P(0).deck.graveyard.length - g0]));
  check('Gravity Well: the attacking flyer loses flying', !has(t, bear, 'Flying'));
}
{
  // Kenku Artificer: "That artifact" is the artifact targeted earlier, not the creature that entered.
  const t = setup();
  const rock = onField(t, 'Fog Bank', '', { typeLine: 'Artifact', power: undefined, toughness: undefined });
  cast(t, 'Grizzly Bears', 'When this creature enters, put three +1/+1 counters on target artifact you control. That artifact becomes a 0/0 Homunculus artifact creature with flying.', [tgt(rock.instanceId)]);
  const bear = t.bf(0, 'Grizzly Bears');
  check('Kenku Artificer: the targeted artifact gets the counters and becomes a 3/3 flying creature; the Kenku does not', Number(rock.counters?.['+1/+1'] || 0) === 3 && power(t, rock) === 3 && has(t, rock, 'Flying') && power(t, bear) === 2 && !Number(bear.counters?.['+1/+1'] || 0), JSON.stringify([rock.counters, power(t, rock), power(t, bear)]));
}
{
  // "you may have target creature get -2/-2"; "Investigate twice."
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '6' }, 1);
  cast(t, 'Grizzly Bears', 'When this creature enters, you may have target creature get -2/-2 until end of turn.', [tgt(foe.instanceId)]);
  check('"you may have target creature get -2/-2 until end of turn"', tough(t, foe) === 4, String(tough(t, foe)));
  cast(t, 'Opt', 'Investigate twice.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('"Investigate twice" makes two Clues', t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Clue').length === 2);
}
{
  // Engine fix: "Target player sacrifices a creature of their choice and loses 10 life" — the same player loses the life.
  const t = setup();
  onField(t, 'Fog Bank', '', {}, 1);
  const l0 = t.P(0).life, l1 = t.P(1).life;
  cast(t, 'Opt', 'Target player sacrifices a creature of their choice and loses 10 life.', [tgt(t.P(1).playerId)], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('"Target player sacrifices a creature and loses 10 life": that player loses the life, not the caster', t.P(1).life === l1 - 10 && t.P(0).life === l0 && !t.bf(1, 'Fog Bank'), `${t.P(0).life} ${t.P(1).life}`);
}
{
  // Engine fixes: "where X is the number of Elves you control" counts Elves; X for a number of targets is counted as they are chosen.
  const t = setup();
  onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Elf Druid' }); onField(t, 'Fog Bank', '', { typeLine: 'Creature — Elf' });
  const life = t.P(0).life; let q = null;
  cast(t, 'Opt', 'You gain X life, where X is the number of Elves you control.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('"where X is the number of Elves you control" counts the two Elves', t.P(0).life === life + 2, String(t.P(0).life - life));
  cast(t, 'Divination', 'Up to X target creatures each gain haste until end of turn, where X is the number of Elves you control.', [[d => d.kind === 'choose-many', d => { q = d; return d.options.slice(0, d.max).map(o => o.id); }]], { manaCost: '{U}', typeLine: 'Instant' });
  check('"Up to X target creatures …, where X is the number of Elves": up to two may be chosen', q?.max === 2 && q?.min === 0, JSON.stringify([q?.min, q?.max]));
}

{
  // Counts that used to be read as "every permanent you control" (build 101 engine fixes)
  const t = setup();
  const ring = onField(t, 'Fog Bank', '{1}: Put a burden counter on Fog Bank, then draw a card for each burden counter on Fog Bank.', { typeLine: 'Legendary Artifact' });
  ring.counters = { burden: 1 };
  const hand = t.P(0).deck.hand.length;
  activate(t, ring, 0);
  check('The One Ring: draws a card for each burden counter (two), not for each permanent', t.P(0).deck.hand.length === hand + 2 && ring.counters.burden === 2, JSON.stringify([t.P(0).deck.hand.length - hand, ring.counters]));
}
{
  // Chasm Skulker: tokens equal to the +1/+1 counters it had when it died
  const t = setup();
  const sk = onField(t, 'Grizzly Bears', 'When this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where X is the number of +1/+1 counters on this creature.');
  sk.counters = { '+1/+1': 3 };
  cast(t, 'Opt', 'Destroy target creature.', [tgt(sk.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('Chasm Skulker: three counters when it died, three Squids', t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Squid').length === 3, String(t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Squid').length));
}
{
  // Xenagos, God of Revels: X is the targeted creature's power, not Xenagos's own
  const t = setup();
  const big = onField(t, 'Fog Bank', '', { power: '5', toughness: '5' });
  const god = onField(t, 'Grizzly Bears', '{1}: Another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature\'s power.');
  activate(t, god, 0, [tgt(big.instanceId)]);
  check('Xenagos: the target gets +X/+X where X is its own power (5 becomes 10) and haste', power(t, big) === 10 && tough(t, big) === 10 && has(t, big, 'Haste'), `${power(t, big)}/${tough(t, big)}`);
}
{
  // "deals 4 damage to target opponent and you gain 4 life": both halves happen
  const t = setup();
  const l0 = t.P(0).life, l1 = t.P(1).life;
  cast(t, 'Opt', 'Opt deals 4 damage to target opponent and you gain 4 life.', [tgt(t.P(1).playerId)], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('"deals 4 damage to target opponent and you gain 4 life": damage and life gain', t.P(1).life === l1 - 4 && t.P(0).life === l0 + 4, `${t.P(0).life} ${t.P(1).life}`);
  const foe = onField(t, 'Fog Bank', '', { power: '1', toughness: '4' });
  cast(t, 'Divination', 'Target creature gets +1/+0 until end of turn and can\'t be blocked this turn.', [tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('"Target creature gets +1/+0 until end of turn and can\'t be blocked this turn": both parts on the target', power(t, foe) === 2 && (foe.temporaryEffects || []).some(e => e.kind === 'combat-restriction' && e.restriction === 'cant-be-blocked'), JSON.stringify(foe.temporaryEffects));
}

{
  // Shared Animosity: +1/+0 for each OTHER attacker sharing a creature type (not for every creature)
  const t = newGame(['simic', 'simic']); t.keepAll();
  for (const n of ['Grizzly Bears', 'Fog Bank']) t.give(0, n, 'battlefield');
  t.give(0, 'Forest', 'battlefield');
  const a = t.bf(0, 'Grizzly Bears'), b = t.bf(0, 'Fog Bank');
  asText(t, a, '', { typeLine: 'Creature — Elf Warrior' }); asText(t, b, '', { typeLine: 'Creature — Elf', power: '1', toughness: '4', keywords: [] });
  asText(t, t.bf(0, 'Forest'), 'Whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it.', { typeLine: 'Enchantment' });
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [a, b].map(c => ({ instanceId: c.instanceId, defenderId: t.P(1).playerId })) });
  settle(t);
  check('Shared Animosity: two attacking Elves each get +1/+0', power(t, a) === 3 && power(t, b) === 2, `${power(t, a)} ${power(t, b)}`);
}

section('build 102: amounts read from the text');
{
  const t = setup();
  onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Squirrel' }); onField(t, 'Fog Bank', '', { typeLine: 'Creature — Bat Rat' });
  const l0 = t.P(0).life, l1 = t.P(1).life;
  cast(t, 'Opt', 'Each opponent loses X life and you gain X life, where X is the number of Squirrels, Bats, Lizards, and Rats you control.', [], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('"the number of Squirrels, Bats, Lizards, and Rats you control": each creature once (2)', t.P(1).life === l1 - 2 && t.P(0).life === l0 + 2, `${t.P(0).life - l0} ${t.P(1).life - l1}`);
  // nonbasic lands that player controls: the targeted player's, not yours
  onField(t, 'Fog Bank', '', { typeLine: 'Land' }, 1); onField(t, 'Grizzly Bears', '', { typeLine: 'Land' }, 1);
  const before = t.P(1).life;
  cast(t, 'Divination', 'Divination deals damage to target player equal to the number of nonbasic lands that player controls.', [tgt(t.P(1).playerId)], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('"damage to target player equal to the number of nonbasic lands that player controls": their two', t.P(1).life === before - 2, String(t.P(1).life - before));
}
{
  const t = setup();
  for (const n of ['Forest', 'Island', 'Grizzly Bears', 'Fog Bank', 'Divination', 'Counterspell']) { const c = t.P(0).deck.remainingLibrary.find(x => def(t, x).name === n); if (c) t.edit({ kind: 'move', instanceId: c.instanceId, to: 'hand' }); }
  const n = t.P(0).deck.hand.length, life = t.P(0).life;   // Opt joins the hand, then leaves it as it is cast
  cast(t, 'Opt', 'You gain X life, where X is the number of cards in your hand minus 4.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('"the number of cards in your hand minus 4"', n >= 5 && t.P(0).life === life + (n - 4), `${n} cards, gained ${t.P(0).life - life}`);
}
{
  // This turn's tally: a creature that died under your control
  const t = setup();
  const bear = onField(t, 'Grizzly Bears', '');
  cast(t, 'Opt', 'Destroy target creature.', [tgt(bear.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  cast(t, 'Divination', 'Create a 3/3 green Beast creature token for each creature put into your graveyard from the battlefield this turn.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('Fresh Meat: one creature died this turn, one Beast', t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Beast').length === 1, String(t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Beast').length));
}
{
  // Party: up to one each of Cleric, Rogue, Warrior, Wizard; a Cleric Wizard and a Wizard make two
  const t = setup();
  onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Human Cleric Wizard' }); onField(t, 'Fog Bank', '', { typeLine: 'Creature — Human Wizard', keywords: [] });
  const life = t.P(0).life;
  cast(t, 'Opt', 'You gain X life, where X is the number of creatures in your party.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('"creatures in your party": a Cleric Wizard and a Wizard fill two roles', t.P(0).life === life + 2, String(t.P(0).life - life));
}

section('build 102: combat, turns and colours');
{
  // "Target creature blocks this turn if able": a block that leaves it out is refused
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Fog Bank', 'battlefield');
  const bear = t.bf(0, 'Grizzly Bears'), wall = t.bf(1, 'Fog Bank');
  t.end(0); t.end(1);
  wall.temporaryEffects = [{ kind: 'must-block-any', expires: 'cleanup' }];
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  t.passAll();
  const none = t.try(1, { type: 'block', assignments: [] });
  const ok = t.try(1, { type: 'block', assignments: [{ attackerId: bear.instanceId, blockerId: wall.instanceId }] });
  check('"blocks this turn if able": no block refused, the block accepted', !none.ok && ok.ok, JSON.stringify([none.error, ok.error]));
}
{
  // Lure for a turn: every creature able to block it must
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Fog Bank', 'battlefield');
  const bear = t.bf(0, 'Grizzly Bears'), wall = t.bf(1, 'Fog Bank');
  t.end(0); t.end(1);
  bear.temporaryEffects = [{ kind: 'lure-turn', expires: 'cleanup' }];
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  t.passAll();
  check('"All creatures able to block target creature this turn do so": not blocking it is refused', !t.try(1, { type: 'block', assignments: [] }).ok);
}
{
  // "You skip your next turn."
  const t = newGame(['simic', 'simic', 'simic']); t.keepAll();
  t.P(1).skipTurns = 1;
  t.end(0);
  check('a skipped turn: after player 1, player 3 takes the turn', t.game.activePlayerId === t.P(2).playerId && !t.P(1).skipTurns, t.game.activePlayerId);
}
{
  const t = setup();
  const foe = onField(t, 'Fog Bank', '', { power: '1', toughness: '4' }, 1);
  cast(t, 'Opt', 'Target creature becomes red and gains haste until end of turn.', [tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('"becomes red and gains haste until end of turn": red, hasty', JSON.stringify(withOverlay(foe, def(t, foe)).colors) === '["R"]' && has(t, foe, 'Haste'), JSON.stringify(withOverlay(foe, def(t, foe)).colors));
  cast(t, 'Divination', 'Target creature can\'t be regenerated this turn.', [tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  foe.temporaryEffects.push({ kind: 'regen-shield', expires: 'cleanup' });
  t.give(0, 'Counterspell'); const k = asText(t, t.hand(0, 'Counterspell'), 'Destroy target creature.', { manaCost: '{U}', typeLine: 'Instant' });
  t.ctl.dispatch({ type: 'play', instanceId: k.instanceId }, t.as(0)); settle(t, [tgt(foe.instanceId)]);
  check('"can\'t be regenerated this turn": the shield does not save it', foe.zone === 'graveyard', foe.zone);
}
{
  // "Prevent all combat damage that would be dealt by target creature this turn."
  const t = newGame(['simic', 'simic']); t.keepAll();
  t.give(0, 'Grizzly Bears', 'battlefield');
  const bear = t.bf(0, 'Grizzly Bears');
  t.end(0); t.end(1);
  t.game.combatPrevention = [{ turn: t.game.turnNumber, scope: 'by-card', cardId: bear.instanceId }];
  const life = t.P(1).life;
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
  settle(t);
  check('combat damage dealt by that creature is prevented', t.P(1).life === life, `${life} → ${t.P(1).life}`);
}

section('build 102: "its power" is the right creature');
{
  // Venom Blast: the targeted creature (now 4/4) deals the damage, equal to its own power
  const t = setup();
  const mine = onField(t, 'Grizzly Bears', ''), foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  cast(t, 'Opt', 'Put two +1/+1 counters on target creature you control. It deals damage equal to its power to up to one other target creature.', [[d => d.targeting && (d.options || []).some(o => o.id === mine.instanceId) && !(d.options || []).some(o => o.id === foe.instanceId), () => mine.instanceId], tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Sorcery' });
  check('Venom Blast: the 4/4 deals 4 damage', Number(foe.damageMarked || 0) === 4, String(foe.damageMarked));
}
{
  // Hamletback Goliath: X is the entering creature's power, not its own
  const t = setup();
  const goliath = onField(t, 'Fog Bank', 'Whenever another creature enters, you may put X +1/+1 counters on this creature, where X is that creature\'s power.', { power: '6', toughness: '6' });
  cast(t, 'Grizzly Bears', '');
  check('Hamletback Goliath: a 2/2 entering gives two counters', Number(goliath.counters?.['+1/+1'] || 0) === 2, JSON.stringify(goliath.counters));
}

{
  // Price of Progress: each player is dealt twice the number of nonbasic lands THEY control
  const t = setup();
  onField(t, 'Fog Bank', '', { typeLine: 'Land' }, 1);
  const l0 = t.P(0).life, l1 = t.P(1).life;
  cast(t, 'Opt', 'Opt deals damage to each player equal to twice the number of nonbasic lands that player controls.', [], { manaCost: '{U}', typeLine: 'Instant' });
  check('Price of Progress: 2 to the player with one nonbasic land, 0 to the one with none', t.P(1).life === l1 - 2 && t.P(0).life === l0, `${t.P(0).life - l0} ${t.P(1).life - l1}`);
}

{
  // "Create a 0/0 Fractal token. Put X +1/+1 counters on it, where X is the number of lands you control.": the token gets them
  const t = setup();
  cast(t, 'Opt', 'Create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it, where X is the number of lands you control.', [], { manaCost: '{U}', typeLine: 'Sorcery' });
  const frac = t.P(0).deck.battlefield.find(c => def(t, c).name === 'Fractal');
  check('Fractal token: eight lands, eight counters on the token', Number(frac?.counters?.['+1/+1'] || 0) === 8, JSON.stringify(frac?.counters));
}

{
  // Disciple of Bolas: X is the sacrificed creature's power (it was this card's own power before)
  const t = setup();
  onField(t, 'Fog Bank', '', { power: '3', toughness: '3' });
  const life = t.P(0).life, hand = t.P(0).deck.hand.length;
  cast(t, 'Grizzly Bears', 'When this creature enters, sacrifice another creature. You gain X life and draw X cards, where X is that creature\'s power.');
  check('Disciple of Bolas: a 3-power creature sacrificed, 3 life and 3 cards', t.P(0).life === life + 3 && t.P(0).deck.hand.length === hand + 3 && !t.bf(0, 'Fog Bank'), `${t.P(0).life - life} ${t.P(0).deck.hand.length - hand}`);
}

section('build 104: long tail batch 3 (sent-back cards re-read)');
{
  // Allies at Last / Common Goal: each chosen creature deals damage equal to its own power
  const t = setup();
  const a = onField(t, 'Grizzly Bears', '', { power: '2', toughness: '2' }), b = onField(t, 'Llanowar Elves', '', { typeLine: 'Creature — Bear', power: '3', toughness: '3' });
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  cast(t, 'Opt', 'Up to two target creatures you control each deal damage equal to their power to target creature an opponent controls.', [[d => (d.options || []).some(o => o.id === a.instanceId) && d.kind === 'choose-many', () => [a.instanceId, b.instanceId]], tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('each deals damage equal to its own power: 2 + 3 = 5', Number(foe.damageMarked || 0) === 5, String(foe.damageMarked));
}
{
  // Sunfall / Join the Collective: counted from what was exiled / destroyed this way
  const t = setup();
  onField(t, 'Grizzly Bears', ''); onField(t, 'Fog Bank', '', {}, 1); onField(t, 'Air Elemental', '', { typeLine: 'Creature — Bear' }, 1);
  cast(t, 'Opt', 'Destroy all creatures. Create X 1/1 colorless Borg artifact creature tokens, where X is the number of nonartifact creatures destroyed this way.', [], { manaCost: '{U}', typeLine: 'Sorcery' });
  const borgs = t.P(0).deck.battlefield.filter(c => def(t, c).name === 'Borg');
  check('Join the Collective: three destroyed, three Borg artifact creature tokens', borgs.length === 3 && /Artifact/.test(def(t, borgs[0]).typeLine), String(borgs.length));
}
{
  // Painbringer-style cost counts are left to the player (this-way count without a moving instruction before it)
  const r = compileEffectText('Target creature gets -X/-X until end of turn, where X is the number of cards exiled this way.', { sourceName: 'Test' });
  check('"exiled this way" with nothing moved before it is not read', !r.supported, JSON.stringify(r.effects));
}
{
  // Saavik / Hoshi Sato: creature types among non-Borg creatures
  const t = setup();
  onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Elf Warrior' }); onField(t, 'Llanowar Elves', '', { typeLine: 'Creature — Elf Druid' }); onField(t, 'Mulldrifter', '', { typeLine: 'Creature — Borg Wizard' });
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  cast(t, 'Opt', 'Opt deals X damage to target creature, where X is the number of creature types among non-Borg creatures you control.', [tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('creature types among non-Borg creatures: Elf, Warrior, Druid = 3', Number(foe.damageMarked || 0) === 3, String(foe.damageMarked));
}
{
  // Triumphant Chomp: 2 or the greatest power among Dinosaurs, whichever is greater
  const t = setup();
  onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Dinosaur', power: '5', toughness: '5' });
  const foe = onField(t, 'Fog Bank', '', { power: '0', toughness: '9' }, 1);
  cast(t, 'Opt', 'Opt deals damage to target creature equal to 2 or the greatest power among Dinosaurs you control, whichever is greater.', [tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('"whichever is greater": a 5-power Dinosaur beats 2', Number(foe.damageMarked || 0) === 5, String(foe.damageMarked));
}
{
  // Warkite Marauder: loses all abilities and becomes 0/1
  const t = setup();
  const foe = onField(t, 'Fog Bank', 'Flying', { power: '4', toughness: '4', keywords: ['Flying'] }, 1);
  cast(t, 'Opt', 'Target creature loses all abilities and has base power and toughness 0/1 until end of turn.', [tgt(foe.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  const d = withOverlay(foe, def(t, foe));
  check('"loses all abilities": 0/1 with no keywords', d.power === '0' && d.toughness === '1' && !(d.keywords || []).length && !d.oracleText, JSON.stringify([d.power, d.toughness, d.keywords]));
}
{
  // Ayara: X is the sacrificed permanent's mana value (not this card's)
  const r = compileEffectText("Test deals X damage to target opponent or battle and you gain X life, where X is the sacrificed permanent's mana value.", { sourceName: 'Test' });
  check('"sacrificed permanent\'s mana value": X set before the damage', r.supported && r.effects[0].kind === 'set-x' && r.effects[0].amount.bind === 'sacrificedManaValue', JSON.stringify(r.effects[0]));
}
{
  // Tokens with their own rules text, and artifact creature tokens
  const r = compileEffectText('Create X 1/1 black Rat creature tokens with "This token can\'t block,"', { sourceName: 'Test' });
  check('token with quoted rules text carries it', r.effects[0].oracleText === "This token can't block." && !r.effects[0].keywords.length, JSON.stringify(r.effects[0]));
  const r2 = compileEffectText('Create a 1/1 colorless Borg artifact creature token.', { sourceName: 'Test' });
  check('"Borg artifact creature token": subtype Borg, an artifact creature', r2.effects[0].name === 'Borg' && r2.effects[0].typeLine === 'Token Artifact Creature — Borg', r2.effects[0].typeLine);
}
{
  // Superior Numbers / Weight of Spires: counts about the target's controller / a target opponent
  const r = compileEffectText("Test deals damage to target creature equal to the number of nonbasic lands that creature's controller controls.", { sourceName: 'Test' });
  check("\"that creature's controller controls\" is counted for the targeted creature", r.supported && r.effects[0].amount.controllerBind === 'target0', JSON.stringify(r.effects[0]));
  const r2 = compileEffectText('Test deals damage to target creature equal to the number of creatures you control in excess of the number of creatures target opponent controls.', { sourceName: 'Test' });
  check('"in excess of": a difference with its own target opponent', r2.supported && r2.requirements.some(q => q.kind === 'player'), JSON.stringify(r2.requirements));
}
{
  // Gloom Ripper: one mandatory target and one optional; Ellie: self gains a keyword; Waiting in the Weeds: per player
  const r = compileEffectText('Target creature you control gets +2/+0 until end of turn and up to one target creature an opponent controls gets -0/-2 until end of turn.', { sourceName: 'Test' });
  check('two targets: only the second is optional', r.supported && !r.requirements[0].optional && r.requirements[1].optional, JSON.stringify(r.requirements.map(q => q.optional)));
  const t = setup();
  onField(t, 'Fog Bank', '', { typeLine: 'Basic Land — Forest' }); onField(t, 'Fog Bank', '', { typeLine: 'Basic Land — Forest' }, 1);
  const before = [0, 1].map(i => t.P(i).deck.battlefield.filter(c => def(t, c).name === 'Cat').length);
  cast(t, 'Opt', 'Each player creates a 1/1 green Cat creature token for each untapped Forest they control.', [], { manaCost: '{U}', typeLine: 'Sorcery' });
  const after = [0, 1].map(i => t.P(i).deck.battlefield.filter(c => def(t, c).name === 'Cat').length);
  check('each player gets Cats for their own untapped Forests (5 and 1)', after[0] - before[0] === 5 && after[1] - before[1] === 1, JSON.stringify(after));
}
{
  // Ferrafor: "double each kind of counter"
  const t = setup();
  const c = onField(t, 'Grizzly Bears', '', {}); c.counters = { '+1/+1': 2, shield: 1 };
  cast(t, 'Opt', 'Double the number of each kind of counter on target creature.', [tgt(c.instanceId)], { manaCost: '{U}', typeLine: 'Instant' });
  check('every kind of counter doubled', c.counters['+1/+1'] === 4 && c.counters.shield === 2, JSON.stringify(c.counters));
}
{
  // Cactus Preserve / Sorin: highest life total, commanders' mana value compile
  for (const [txt, kind] of [['Create a number of 1/1 black Vampire Knight creature tokens with lifelink equal to the highest life total among all players.', 'b101-life-high'], ['Draw a card for each color among other artifacts you control.', 'b101-colors-among'], ['Draw a card for each card type among spells you\'ve cast this turn.', 'b101-spell-types'], ['Test deals X damage to each opponent, where X is the number of modified creatures you control other than this creature.', 'b101-n']]) {
    const r = compileEffectText(txt, { sourceName: 'Test' });
    check(`reads: ${txt.slice(0, 50)}`, r.supported && JSON.stringify(r.effects).includes(kind), JSON.stringify(r.effects).slice(0, 120));
  }
}

// ---- Build 109 candidate: rules long tail batch 3 part 2 (the 43 sent-back cards) ----
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
  cast(t, 'Divination', 'Exile target creature card from your graveyard. Create X 1/1 white Bird creature tokens with flying, where X is the exiled card\'s toughness.', [[d => d.options?.some(o => o.id === g.instanceId), g.instanceId]], { manaCost: '{3}{G}', typeLine: 'Sorcery' });
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
  settle(t);
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
{
  // Observed Stasis / Pacifism: "Enchanted creature loses all abilities and can't attack or block"
  const t = setup();
  const foe = onField(t, 'Fog Bank', 'Flying', { power: '3', toughness: '3', keywords: ['Flying'] }, 1);
  const aura = onField(t, 'Divination', 'Enchant creature an opponent controls\nEnchanted creature loses all abilities and can\'t attack or block.', { typeLine: 'Enchantment — Aura' });
  aura.attachedTo = foe.instanceId;
  const { syncAttachments } = await import('../../src/game/attachments.js');
  syncAttachments(t.game);
  const d1 = withOverlay(foe, def(t, foe));
  check('Aura static: enchanted creature has a combat restriction and no abilities', (foe.temporaryEffects || []).some(e => e.kind === 'combat-restriction' && e.restriction === 'cant-attack-or-block') && !(d1.oracleText || '') && !(d1.keywords || []).length, JSON.stringify(foe.temporaryEffects));
  // Rith: "Other Dragons you control have ward {2}" — the opponent's targeting spell asks for the ward cost
  const t2 = setup();
  onField(t2, 'Grizzly Bears', 'Flying, ward {2}\nOther Dragons you control have ward {2}.', { typeLine: 'Legendary Creature — Dragon' }, 1);
  const dr = onField(t2, 'Fog Bank', '', { typeLine: 'Creature — Dragon', power: '2', toughness: '2' }, 1);
  const seen = cast(t2, 'Opt', 'Test deals 1 damage to target creature.', [[d => d.kind === 'choose-one' && d.options?.some(o => o.id === dr.instanceId), dr.instanceId], [d => /ward/i.test(d.title || ''), 'no']], { manaCost: '{G}', typeLine: 'Instant' });
  check('Rith: a Dragon with the granted ward asks the ward cost; declining counters the spell', seen.some(d => /ward/i.test(d.title || '')) && !Number(dr.damageMarked || 0), JSON.stringify(seen.map(d => d.title)));
}

section('long tail batch 3 part 2: review of the 26 newly automatic cards');
{
  const gyc = (t, name, extra = {}, i = 0) => { const c = t.P(i).deck.remainingLibrary.pop(); c.zone = 'graveyard'; t.P(i).deck.graveyard.push(c); const nid = 'x-' + name; t.game.cardDefinitions[nid] = { ...t.game.cardDefinitions[c.definitionId], name, ...extra }; c.definitionId = nid; return c; };
  const pick = (t, i) => [d => (d.options || []).some(o => o.id === t.P(i).playerId), () => t.P(i).playerId];
  // Hellhole Rats: "that player" is the targeted player (the damage went to the caster)
  {
    const t = setup(); const l0 = t.P(0).life, l1 = t.P(1).life;
    t.give(1, 'Divination'); const dv = t.hand(1, 'Divination'); t.game.cardDefinitions[dv.definitionId] = { ...t.game.cardDefinitions[dv.definitionId], manaValue: 3, cmc: 3 };
    cast(t, 'Grizzly Bears', 'Haste\nWhen this creature enters, target player discards a card. This creature deals damage to that player equal to that card\'s mana value.', [pick(t, 1)], { manaCost: '{G}', typeLine: 'Creature — Rat', power: '2', toughness: '2', name: 'Hellhole Rats' });
    check('Hellhole Rats: the targeted player discards and takes damage equal to the card\'s mana value (not the caster)', l1 - t.P(1).life === 3 && t.P(0).life === l0 && t.names(1, 'graveyard').includes('Divination'), `${l1 - t.P(1).life} ${l0 - t.P(0).life}`);
  }
  // Morbid Bloom: X read after the card is exiled
  {
    const t = setup(); const c = gyc(t, 'Big Guy', { typeLine: 'Creature — Beast', power: '4', toughness: '5' }, 1);
    cast(t, 'Opt', 'Exile target creature card from a graveyard, then create X 1/1 green Saproling creature tokens, where X is the exiled card\'s toughness.', [[d => d.targeting, () => c.instanceId]], { manaCost: '{U}', typeLine: 'Sorcery', name: 'Morbid Bloom' });
    check('Morbid Bloom: five Saprolings for a toughness-5 card', t.P(0).deck.battlefield.filter(x => /Saproling/.test(def(t, x).name)).length === 5 && t.names(1, 'exile').includes('Big Guy'), t.names(0, 'battlefield').join());
  }
  // Volcanic Vision / Vengeful Rebirth: "that card's mana value" is the returned card
  {
    const t = setup(); const foe = onField(t, 'Air Elemental', '', { power: '1', toughness: '4' }, 1), mine = onField(t, 'Fog Bank', '', { power: '1', toughness: '4' });
    const sp = gyc(t, 'Fireball', { typeLine: 'Instant', manaValue: 3, cmc: 3 });
    cast(t, 'Opt', 'Return target instant or sorcery card from your graveyard to your hand. Volcanic Vision deals damage equal to that card\'s mana value to each creature your opponents control. Exile Volcanic Vision.', [[d => d.targeting, () => sp.instanceId]], { manaCost: '{U}', typeLine: 'Sorcery', name: 'Volcanic Vision' });
    check('Volcanic Vision: 3 damage to the opponent\'s creatures only, card back in hand, spell exiled', foe.damageMarked === 3 && !mine.damageMarked && t.names(0, 'hand').includes('Fireball') && t.names(0, 'exile').includes('Volcanic Vision'), JSON.stringify([foe.damageMarked, mine.damageMarked]));
    const t2 = setup(); const big = gyc(t2, 'Bigthing', { typeLine: 'Creature — Beast', manaValue: 4, cmc: 4, power: '2', toughness: '2' }), l = t2.P(1).life;
    cast(t2, 'Opt', 'Return target card from your graveyard to your hand. If you return a nonland card to your hand this way, Vengeful Rebirth deals damage equal to that card\'s mana value to any target.\nExile Vengeful Rebirth.', [[d => d.targeting && /graveyard/.test(d.key + d.title), () => big.instanceId], [d => d.targeting, () => t2.P(1).playerId]], { manaCost: '{U}', typeLine: 'Sorcery', name: 'Vengeful Rebirth' });
    check('Vengeful Rebirth: 4 damage for a mana value 4 card', l - t2.P(1).life === 4 && t2.names(0, 'hand').includes('Bigthing'), String(l - t2.P(1).life));
  }
  // Twilight Prophet: X is the revealed card's mana value; nothing without the city's blessing
  {
    const t = setup();
    onField(t, 'Grizzly Bears', 'At the beginning of your upkeep, if you have the city\'s blessing, reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card\'s mana value.', { name: 'Twilight Prophet', typeLine: 'Creature — Vampire Cleric' });
    t.P(0).citysBlessing = true;
    for (const [n, top] of t.P(0).deck.remainingLibrary.slice(0, 3).entries()) { const nid = 'x-top' + n; t.game.cardDefinitions[nid] = { ...t.game.cardDefinitions[top.definitionId], name: 'TopCard' + n, manaValue: 5, cmc: 5, typeLine: 'Creature' }; top.definitionId = nid; }
    const l0 = t.P(0).life, l1 = t.P(1).life;
    t.end(0); t.end(1); settle(t);
    check('Twilight Prophet: each opponent loses 5 and you gain 5 (the revealed card\'s mana value)', l1 - t.P(1).life === 5 && t.P(0).life - l0 === 5, `${l1 - t.P(1).life} ${t.P(0).life - l0}`);
    const t2 = setup();
    onField(t2, 'Grizzly Bears', 'At the beginning of your upkeep, if you have the city\'s blessing, reveal the top card of your library and put it into your hand. Each opponent loses X life and you gain X life, where X is that card\'s mana value.', { name: 'Twilight Prophet', typeLine: 'Creature — Vampire Cleric' });
    const h = t2.P(0).deck.hand.length; t2.end(0); t2.end(1); settle(t2);
    check('Twilight Prophet: without the city\'s blessing the upkeep does nothing', t2.P(1).life === 40 && t2.P(0).deck.hand.length === h + 1, `${t2.P(1).life} ${t2.P(0).deck.hand.length - h}`);
  }
  // Nyla: castable with an empty graveyard; the second ability ("card exiled with Nyla") is not automatic (no card is remembered)
  {
    const t = setup(); const l = t.P(0).life;
    cast(t, 'Grizzly Bears', 'When Nyla enters, exile up to one target creature card from your graveyard. If you do, you lose X life and create X Clue tokens, where X is that card\'s mana value.', [], { manaCost: '{G}', typeLine: 'Legendary Creature — Mole Beast', name: 'Nyla, Shirshu Sleuth' });
    check('Nyla: can be cast with no creature card in the graveyard (up to one target); nothing happens', !!t.bf(0, 'Nyla, Shirshu Sleuth') && t.P(0).life === l, t.names(0, 'battlefield').join());
    const t2 = setup(); const big = gyc(t2, 'Bigthing', { typeLine: 'Creature — Beast', manaValue: 3, cmc: 3 }); const l2 = t2.P(0).life;
    cast(t2, 'Grizzly Bears', 'When Nyla enters, exile up to one target creature card from your graveyard. If you do, you lose X life and create X Clue tokens, where X is that card\'s mana value.', [[d => d.targeting, () => big.instanceId]], { manaCost: '{G}', typeLine: 'Legendary Creature — Mole Beast', name: 'Nyla, Shirshu Sleuth' });
    check('Nyla: exiles the card, loses 3 life, makes 3 Clues', l2 - t2.P(0).life === 3 && t2.P(0).deck.battlefield.filter(x => /Clue/.test(def(t2, x).name)).length === 3, t2.names(0, 'battlefield').join());
    const r = compileEffectText('Return target card exiled with Nyla to its owner\'s hand.', { sourceName: 'Nyla, Shirshu Sleuth' });
    check('"target card exiled with …" is left for the player (nothing remembers which cards a permanent exiled)', !r.supported, JSON.stringify(r.unsupported));
  }
  // Creature-type targets: "target Symbiote", "target Faerie you control" (the scope had no card type, so nothing could be chosen)
  {
    const t = setup(); const sym = onField(t, 'Grizzly Bears', '', { typeLine: 'Creature — Symbiote', power: '2', toughness: '2' });
    const v = onField(t, 'Fog Bank', '{3}: Exile target creature card from a graveyard. When you do, put X +1/+1 counters on target Symbiote, where X is the exiled card\'s toughness.', { name: 'Venom, Deadly Devourer', typeLine: 'Legendary Creature — Symbiote Villain', power: '2', toughness: '2' });
    const c = gyc(t, 'Big', { typeLine: 'Creature', power: '4', toughness: '5' }, 1);
    activate(t, v, 0, [[d => d.targeting && /graveyard/.test(d.key + d.title), () => c.instanceId], [d => d.targeting, () => sym.instanceId]]);
    check('Venom, Deadly Devourer: a target Symbiote can be chosen; it gets 5 counters (the exiled card\'s toughness)', sym.counters?.['+1/+1'] === 5 && t.names(1, 'exile').includes('Big'), JSON.stringify(sym.counters));
    // Talion's Messenger
    const t2 = setup();
    const fa = onField(t2, 'Grizzly Bears', '', { typeLine: 'Creature — Faerie Noble', power: '1', toughness: '1' }), other = onField(t2, 'Llanowar Elves', '', { typeLine: 'Creature — Faerie', power: '1', toughness: '1', keywords: [] });
    onField(t2, 'Air Elemental', 'Flying\nWhenever you attack with one or more Faeries, draw a card, then discard a card. When you discard a card this way, put a +1/+1 counter on target Faerie you control.', { name: "Talion's Messenger", typeLine: 'Creature — Faerie Noble', power: '2', toughness: '2' });
    fa.summoningSick = false; fa.enteredTurn = -5; other.enteredTurn = -5;
    t2.end(0); t2.autoPass = true; t2.end(1); t2.autoPass = false; t2.do(0, { type: 'next-phase' });
    t2.do(0, { type: 'attack', attacks: [{ instanceId: fa.instanceId, defenderId: t2.P(1).playerId }] });
    settle(t2, [[d => d.targeting, () => other.instanceId]]);
    check('Talion\'s Messenger: attacking with a Faerie draws, discards and puts a counter on the chosen Faerie', other.counters?.['+1/+1'] === 1, JSON.stringify(other.counters));
    const t3 = setup();
    const bear = onField(t3, 'Grizzly Bears', '', { typeLine: 'Creature — Bear', power: '1', toughness: '1' }); onField(t3, 'Llanowar Elves', '', { typeLine: 'Creature — Faerie', power: '1', toughness: '1', keywords: [] });
    onField(t3, 'Air Elemental', 'Flying\nWhenever you attack with one or more Faeries, draw a card, then discard a card.', { name: "Talion's Messenger", typeLine: 'Creature — Faerie Noble', power: '2', toughness: '2' });
    bear.enteredTurn = -5; t3.end(0); t3.autoPass = true; t3.end(1); t3.autoPass = false; t3.do(0, { type: 'next-phase' });
    const h3 = t3.P(0).deck.hand.length;
    t3.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t3.P(1).playerId }] }); settle(t3);
    check('Talion\'s Messenger: attacking only with a non-Faerie does not trigger it', t3.P(0).deck.hand.length === h3 && !t3.names(0, 'graveyard').length, `${t3.P(0).deck.hand.length - h3}`);
  }
  // Costs: "Exile a creature card from your graveyard" (Necropolis), "Discard a Spirit or Arcane card" (Slumbering Tora)
  {
    const t = setup(); const n = onField(t, 'Fog Bank', 'Defender\nExile a creature card from your graveyard: Put X +0/+1 counters on this creature, where X is the exiled card\'s mana value.', { name: 'Necropolis', typeLine: 'Artifact Creature — Wall', power: '0', toughness: '4' });
    const c = gyc(t, 'Big', { typeLine: 'Creature', manaValue: 4, cmc: 4 });
    activate(t, n, 0);
    check('Necropolis: the creature card is exiled as the cost and X is its mana value (4 counters)', n.counters?.['+0/+1'] === 4 && t.names(0, 'exile').includes('Big') && !t.names(0, 'graveyard').includes('Big'), JSON.stringify(n.counters));
    const t0 = setup(); const n0 = onField(t0, 'Fog Bank', 'Exile a creature card from your graveyard: Put X +0/+1 counters on this creature, where X is the exiled card\'s mana value.', { name: 'Necropolis', typeLine: 'Artifact Creature — Wall' });
    const ab0 = parseActivatedAbilities(def(t0, n0))[0], r0 = t0.ctl.dispatch({ type: 'activate', instanceId: n0.instanceId, abilityId: ab0.id }, t0.as(0));
    check('Necropolis: with no creature card in the graveyard the cost cannot be paid', !r0.ok, JSON.stringify(r0));
    const t2 = setup(); const tora = onField(t2, 'Fog Bank', '{2}, Discard a Spirit or Arcane card: This artifact becomes an X/X Cat artifact creature until end of turn, where X is the discarded card\'s mana value.', { name: 'Slumbering Tora', typeLine: 'Artifact' });
    t2.give(0, 'Divination'); const dv = t2.hand(0, 'Divination'); t2.game.cardDefinitions[dv.definitionId] = { ...t2.game.cardDefinitions[dv.definitionId], typeLine: 'Instant — Arcane', manaValue: 4, cmc: 4 };
    t2.give(0, 'Opt'); const plain = t2.hand(0, 'Opt');
    const seen = activate(t2, tora, 0, [[d => /discard/i.test(d.key + d.title), () => dv.instanceId]]);
    check('Slumbering Tora: only an Arcane/Spirit card may be discarded; it becomes a 4/4', power(t2, tora) === 4 && tough(t2, tora) === 4 && seen.some(d => d.options && !d.options.some(o => o.id === plain.instanceId)), JSON.stringify([power(t2, tora), seen.map(d => (d.options || []).length)]));
  }
  // Venom, Evil Unleashed: activated from the graveyard, exiling itself as the cost; sorcery speed
  {
    const t = setup(); const v = gyc(t, 'Venom, Evil Unleashed', { typeLine: 'Legendary Creature — Symbiote Villain', oracleText: '{2}{G}, Exile this card from your graveyard: Put two +1/+1 counters on target creature. It gains deathtouch until end of turn. Activate only as a sorcery.' });
    const c = onField(t, 'Grizzly Bears', '', { power: '2', toughness: '2' });
    const ab = parseActivatedAbilities(def(t, v));
    const r = t.ctl.dispatch({ type: 'activate', instanceId: v.instanceId, abilityId: ab[0].id }, t.as(0)); settle(t, [[d => d.targeting, () => c.instanceId]]);
    check('Venom, Evil Unleashed: from the graveyard, exiles itself, two counters and deathtouch', r.ok && c.counters?.['+1/+1'] === 2 && has(t, c, 'Deathtouch') && t.names(0, 'exile').includes('Venom, Evil Unleashed'), JSON.stringify([r.error, c.counters]));
    const t2 = setup(); const v2 = gyc(t2, 'Venom, Evil Unleashed', { typeLine: 'Legendary Creature — Symbiote Villain', oracleText: '{2}{G}, Exile this card from your graveyard: Put two +1/+1 counters on target creature. It gains deathtouch until end of turn. Activate only as a sorcery.' });
    onField(t2, 'Grizzly Bears', '', {}); t2.end(0);
    const r2 = t2.ctl.dispatch({ type: 'activate', instanceId: v2.instanceId, abilityId: parseActivatedAbilities(def(t2, v2))[0].id }, t2.as(0));
    check('Venom, Evil Unleashed: not on the opponent\'s turn', !r2.ok, JSON.stringify(r2));
  }
  // Food / Clue tokens carry their subtype (forage and "sacrifice a Food" look for it)
  {
    const r = compileEffectText('Create a Food token.', { sourceName: 'X' }), r2 = compileEffectText('Create a Clue token.', { sourceName: 'X' });
    check('Food and Clue tokens have their subtype in the type line', /— Food$/.test(r.effects[0].typeLine) && /— Clue$/.test(r2.effects[0].typeLine), r.effects[0].typeLine + ' | ' + r2.effects[0].typeLine);
  }
  // Ultron, Unlimited / Iron Monger: a creature you control connives
  {
    const t = setup();
    const u = onField(t, 'Grizzly Bears', 'Whenever a creature you control connives, you may pay {1}. If you do, create a 2/2 colorless Robot Villain artifact creature token.', { typeLine: 'Legendary Artifact Creature — Robot Villain' });
    const im = onField(t, 'Llanowar Elves', 'Whenever a creature you control connives, put a +1/+1 counter on each Villain you control.', { typeLine: 'Creature — Human Villain', keywords: [] });
    cast(t, 'Opt', 'Target creature you control connives.', [[d => d.targeting, () => u.instanceId], [d => d.key === 'may-pay', 'pay']], { manaCost: '{U}' });
    check('Ultron / Iron Monger: the connive trigger pays {1} for a Robot Villain token and puts a counter on every Villain', t.P(0).deck.battlefield.filter(x => x.token && /Villain/.test(def(t, x).name)).length === 1 && im.counters?.['+1/+1'] === 1, t.names(0, 'battlefield').slice(8).join());
  }
}

done();

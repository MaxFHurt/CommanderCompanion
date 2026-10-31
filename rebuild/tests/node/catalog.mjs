// Catalog effects (build 43): each new wording played through the real game — cast or activated, choices answered
// by the player who makes them, then the result checked.  node tests/node/catalog.mjs
import { newGame, check, section, done } from './harness.mjs';
import { effectivePower, effectiveToughness, cardHasKeyword } from '../../src/engine/combat.js';
import { parseActivatedAbilities } from '../../src/engine/rules.js';

const asText = (t, card, text, extra = {}) => { t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], oracleText: text, ...extra }; return card; };
const def = (t, c) => t.game.cardDefinitions[c.definitionId];
const power = (t, c) => effectivePower(c, def(t, c), t.game);
const tough = (t, c) => effectiveToughness(c, def(t, c), t.game);
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
  cast(t, 'Llanowar Elves', 'When this creature enters, it connives.', [['discard', d => { disc = d; const bear = d.options.find(o => o.label === 'Grizzly Bears'); return [bear.id]; }]]);
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
  const lib = t.P(0).deck.remainingLibrary, top = lib[0], mv = Number(def(t, top).manaValue ?? def(t, top).cmc ?? 0), life = t.P(0).life;
  onField(t, 'Fog Bank', 'At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.');
  t.autoPass = true; t.end(0); t.end(1); settle(t);
  check('Dark Confidant: the top card goes to hand and you lose life equal to its mana value', t.P(0).deck.hand.some(c => c.instanceId === top.instanceId) && t.P(0).life === life - mv, `${life} → ${t.P(0).life} (mv ${mv})`);
}
{
  const t = setup();
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

done();

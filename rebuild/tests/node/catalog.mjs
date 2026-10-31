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
  const nonland = lib.find(c => !/Land/.test(def(t, c).typeLine)); lib.splice(lib.indexOf(nonland), 1); lib.unshift(nonland);
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
  cast(t, 'Fog Bank', 'When this creature enters, look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.', [['dig', d => { q = d; return d.kind === 'choose-many' ? d.options.filter(o => !o.disabled).slice(0, 1).map(o => o.id) : undefined; }]]);
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

done();

// Forge as the answer key for triggers: node tests/node/forge-triggers.mjs [--list]
//
// For each of the 1,000 most-played Commander cards (tests/fixtures/top-commander-cards.json.gz) and
// each trigger Forge's hand-written script gives it (tests/fixtures/forge-top-commander.json.gz,
// GPL-3.0, tests only — the app never loads it), build a small game that fits Forge's structured
// description (who, which card type, which step), send the event, and check our trigger fires. Where
// Forge names a controller or player, also flip it and check the trigger stays quiet.
// Prints the agreement; --list prints each miss. Exits 1 if agreement falls below the floor.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { scryfallToDefinition } from '../../src/data/card-api.js';
import { collectTriggers, parseTriggeredAbilities } from '../../src/engine/triggers.js';
import { selfNames } from '../../src/engine/trigger-subject.js';

const FLOOR = Number(process.env.FLOOR || 0);
const load = f => JSON.parse(gunzipSync(readFileSync(new URL(`../fixtures/${f}`, import.meta.url))));
const CARDS = load('top-commander-cards.json.gz').cards, FORGE = load('forge-top-commander.json.gz').cards;
const field = (line, k) => { const m = new RegExp(`(?:^|\\|)\\s*${k}\\$ ?([^|]*)`).exec(line); return m ? m[1].trim() : ''; };

// ── A test card that fits a Forge "Valid" description ─────────────────────────────────────────────
function readValid(spec) {
  const alts = String(spec || 'Card').split(',').map(a => a.trim());
  const pick = alts.find(a => !/^Card\.Self$/.test(a)) || alts[0];
  const [type, ...rest] = pick.split('.');
  const props = rest.join('.').split('+').filter(Boolean);
  return { self: /(^|\.|\+)Self\b/.test(pick) || pick === 'Card.Self', type, props, onlySelf: alts.every(a => /Self/.test(a)) };
}
const SUBTYPES = { Elemental: 'Creature — Elemental', Dragon: 'Creature — Dragon', Clue: 'Artifact — Clue', Equipment: 'Artifact — Equipment', Aura: 'Enchantment — Aura', Vehicle: 'Artifact — Vehicle' };
function probeType(v) {
  if ((v.props.includes('Creature') || v.type === 'Creature') && !v.props.includes('Artifact')) return v.props.includes('ChosenType') ? 'Creature — Dragon' : 'Creature — Human';
  if (v.type === 'Land') return 'Land — Forest';
  if (v.type === 'Artifact') return v.props.includes('Creature') ? 'Artifact Creature — Golem' : 'Artifact';
  if (v.type === 'Creature' && v.props.includes('Artifact')) return 'Artifact Creature — Golem';
  if (v.type === 'Instant' || v.type === 'Sorcery') return v.type;
  if (v.type === 'Permanent') return 'Creature — Human';
  if (SUBTYPES[v.type]) return SUBTYPES[v.type];
  if (v.props.includes('Equipment')) return 'Artifact — Equipment';
  if (v.props.includes('nonCreature')) return 'Enchantment';
  if (/^[A-Z]/.test(v.type) && v.type !== 'Card') return `Creature — ${v.type}`;
  return 'Creature — Human';
}
function probeDef(v, id = 'probe') {
  const num = re => { const p = v.props.find(x => re.test(x)); return p ? Number(p.replace(/\D+/g, '')) : null; };
  const color = { Black: 'B', Red: 'R', Green: 'G', White: 'W', Blue: 'U' };
  const colors = v.props.filter(p => color[p]).map(p => color[p]);
  return { definitionId: id, name: 'Probe', typeLine: probeType(v), oracleText: '', colors: v.props.includes('MultiColor') ? ['W', 'U'] : colors, power: String(num(/^power(GE|EQ)/) ?? num(/^powerLE/) ?? 2), toughness: '2', keywords: v.props.filter(p => /^with/.test(p)).map(p => p.slice(4)), manaValue: num(/^cmc(GE|EQ|LE)/) ?? 3 };
}
function controllerOf(v, fallback = 'opp') {
  if (v.props.some(p => /^(YouCtrl|YouOwn)$/.test(p)) || /YouCtrl|YouOwn/.test(v.type)) return 'me';
  if (v.props.some(p => /^(OppCtrl|OppOwn)$/.test(p))) return 'opp';
  return fallback;
}
const WHO = s => /^You$/.test(s) ? 'me' : /Opponent/.test(s) ? 'opp' : null;

// ── A small game around one card ─────────────────────────────────────────────────────────────────
function newGame(def) {
  const zones = () => ({ battlefield: [], graveyard: [], exile: [], hand: [], commandZone: [], remainingLibrary: [] });
  const me = { playerId: 'me', displayName: 'Me', life: 40, deck: zones(), counters: {}, commanders: [] };
  const opp = { playerId: 'opp', displayName: 'Opp', life: 40, deck: zones(), counters: {}, commanders: [] };
  const self = { instanceId: 'self', definitionId: def.definitionId, controllerId: 'me', ownerId: 'me', counters: {}, zone: 'battlefield', enteredTurn: 1 };
  me.deck.battlefield.push(self);
  const game = { players: [me, opp], activePlayerId: 'me', turnNumber: 3, phase: 'precombat-main', cardDefinitions: { [def.definitionId]: def }, stack: [], log: [], flow: {}, combatState: null, rulesConfig: {} };
  return { game, me, opp, self };
}
function place(g, v, where = 'battlefield', who = controllerOf(v)) {
  const p = who === 'me' ? g.me : g.opp, def = probeDef(v);
  g.game.cardDefinitions.probe = def;
  const card = { instanceId: 'probe', definitionId: 'probe', controllerId: p.playerId, ownerId: p.playerId, counters: v.props.includes('HasCounters') ? { '+1/+1': 1 } : {}, token: v.props.includes('token') || v.type === 'Clue', zone: where, tapped: false };
  p.deck[where].push(card);
  if (v.props.some(x => /EquippedBy|AttachedBy/.test(x))) g.self.attachedTo = card.instanceId;
  if (v.props.includes('ChosenType')) g.self.chosenCreatureType = 'Dragon';
  if (v.props.includes('attacking')) g.game.combatState = { attackers: [{ instanceId: card.instanceId, playerId: p.playerId }] };
  return { card, def, player: p };
}

/** The event (and game) for one Forge trigger. flip = the same event by the other player. Returns null if not modelled. */
function scenario(def, t, flip) {
  const g = newGame(def), mode = field(t, 'Mode');
  const other = who => (flip ? (who === 'me' ? 'opp' : 'me') : who);
  const id = who => (who === 'me' ? 'me' : 'opp');
  switch (mode) {
    case 'ChangesZone': case 'ChangesZoneAll': {
      const v = readValid(field(t, 'ValidCard') || field(t, 'ValidCards')), o = field(t, 'Origin'), d = field(t, 'Destination');
      const enters = /Battlefield/.test(d) && !/^Battlefield$/.test(o), leaves = /^Battlefield$/.test(o) || (/Battlefield/.test(o) && !/Battlefield/.test(d));
      if (!enters && !leaves) return null;
      if (v.onlySelf) {
        if (flip) return null;
        if (leaves) { g.me.deck.battlefield = []; g.me.deck[/Exile/.test(d) ? 'exile' : 'graveyard'].push(g.self); }
        const creature = /Creature/i.test(def.typeLine || '');
        return { g, event: enters ? { type: 'enters-battlefield', sourceId: 'self', definitionId: def.definitionId, controllerId: 'me', typeLine: def.typeLine } : { type: /Graveyard/.test(d) && creature ? 'dies' : 'leaves-battlefield', sourceId: 'self', definitionId: def.definitionId, controllerId: 'me', destination: /Exile/.test(d) ? 'exile' : 'graveyard', typeLine: def.typeLine } };
      }
      const who = other(controllerOf(v));
      if (flip && !v.props.some(p => /Ctrl|Own/.test(p))) return null;
      const where = enters ? 'battlefield' : /Exile/.test(d) ? 'exile' : 'graveyard';
      const { card, def: pd } = place(g, v, where, who);
      if (leaves && v.props.some(x => /EquippedBy|AttachedBy/.test(x))) g.self.attachedTo = card.instanceId;
      const creature = /Creature/.test(pd.typeLine);
      const type = enters ? 'enters-battlefield' : /Graveyard/.test(d) && creature ? 'dies' : 'leaves-battlefield';
      return { g, event: { type, sourceId: 'probe', definitionId: 'probe', controllerId: id(who), ownerId: id(who), typeLine: pd.typeLine, destination: where, token: card.token } };
    }
    case 'Phase': {
      const step = { Upkeep: 'upkeep', Draw: 'draw-step', Main1: 'precombat-main-start', BeginCombat: 'begin-combat', 'End of Turn': 'end-step', EndCombat: 'end-combat' }[field(t, 'Phase')];
      if (!step) return null;
      const named = WHO(field(t, 'ValidPlayer'));
      if (flip && !named) return null;
      const who = other(named || 'opp');
      g.game.activePlayerId = id(who);
      return { g, event: { type: step, playerId: id(who), controllerId: id(who) } };
    }
    case 'SpellCast': case 'SpellCastOrCopy': {
      const v = readValid(field(t, 'ValidCard'));
      if (v.self) return null;   // "when you cast this spell": the card is on the stack, not modelled here
      const named = WHO(field(t, 'ValidActivatingPlayer'));
      if (flip && !named) return null;
      const who = other(named || 'opp'), caster = who === 'me' ? g.me : g.opp;
      const spell = probeDef({ ...v, type: v.type === 'Card' ? (v.props.includes('nonCreature') ? 'Instant' : v.props.includes('Creature') ? 'Creature' : 'Instant') : v.type });
      g.game.cardDefinitions.probe = spell;
      const n = Number((field(t, 'ActivatorThisTurnCast').match(/\d+/) || [1])[0]);
      caster.counters.castThisTurn = Array.from({ length: n }, () => ({ typeLine: spell.typeLine, colors: spell.colors, manaValue: spell.manaValue }));
      caster.counters.spellsCastThisTurn = n;
      return { g, event: { type: 'spell-cast', sourceId: 'probe', definitionId: 'probe', controllerId: id(who), typeLine: spell.typeLine, manaValue: spell.manaValue, fromZone: 'hand' } };
    }
    case 'Drawn': {
      const v = readValid(field(t, 'ValidCard'));
      const named = v.props.some(p => /^You(Own|Ctrl)$/.test(p)) ? 'me' : v.props.some(p => /^Opp(Own|Ctrl)$/.test(p)) ? 'opp' : null;
      if (flip && !named) return null;
      const who = other(named || 'opp');
      return { g, event: { type: 'draw', playerId: id(who), sourceId: 'x', drawNumberThisTurn: Number(field(t, 'Number') || 1), isFirstNormalDrawStepDraw: false } };
    }
    case 'Attacks': {
      const v = readValid(field(t, 'ValidCard'));
      if (v.onlySelf) return flip ? null : { g, event: { type: 'attacks', sourceId: 'self', controllerId: 'me', defenderId: 'opp' } };
      if (flip && !v.props.some(p => /Ctrl/.test(p))) return null;
      const who = other(controllerOf(v, 'me'));
      place(g, v, 'battlefield', who);
      g.game.combatState = { attackers: [{ instanceId: 'probe', playerId: id(who), defenderId: who === 'me' ? 'opp' : 'me' }] };
      return { g, event: { type: 'attacks', sourceId: 'probe', controllerId: id(who), defenderId: who === 'me' ? 'opp' : 'me' } };
    }
    case 'DamageDone': case 'DamageDoneOnce': {
      const src = readValid(field(t, 'ValidSource')), target = field(t, 'ValidTarget'), combat = /True/.test(field(t, 'CombatDamage'));
      if (/^(You|Spell)$/.test(field(t, 'ValidSource'))) return null;
      let sourceId = 'self', who = 'me';
      if (!src.onlySelf) {
        if (flip && !src.props.some(p => /Ctrl/.test(p))) return null;
        who = other(controllerOf(src, 'me'));
        place(g, src, 'battlefield', who);
        sourceId = 'probe';
      } else if (flip) return null;
      const victim = who === 'me' ? 'opp' : 'me';
      if (/Card\.Self/.test(target)) return { g, event: { type: combat ? 'combat-damage-creature' : 'damage-permanent', targetId: 'self', sourceId: 'x', controllerId: victim, amount: 2 } };
      if (/Player|Opponent/.test(target) || !target) return { g, event: { type: combat ? 'combat-damage-player' : 'damage-player', sourceId, controllerId: id(who), playerId: victim, amount: 2, combat } };
      if (/Creature/.test(target) && combat) return { g, event: { type: 'combat-damage-dealt', sourceId, controllerId: id(who), amount: 2, to: ['creature'] } };
      return null;
    }
    case 'CounterAdded': case 'CounterAddedOnce': {
      const v = readValid(field(t, 'ValidCard')), type = { P1P1: '+1/+1', M1M1: '-1/-1' }[field(t, 'CounterType')] || field(t, 'CounterType').toLowerCase();
      if (v.onlySelf) return flip ? null : { g, event: { type: 'counter-added', targetId: 'self', counter: type, amount: 1, newValue: 1, controllerId: 'me', sourceControllerId: 'me' } };
      if (flip && !v.props.some(p => /Ctrl/.test(p))) return null;
      const who = other(controllerOf(v, 'me'));
      place(g, v, 'battlefield', who);
      return { g, event: { type: 'counter-added', targetId: 'probe', counter: type, amount: 1, newValue: 1, controllerId: id(who), sourceControllerId: id(who) } };
    }
    case 'AttackersDeclared': {
      const attacker = WHO(field(t, 'AttackingPlayer')) || 'opp';
      if (flip && !field(t, 'AttackingPlayer')) return null;
      const who = other(attacker), n = Number((field(t, 'ValidAttackersAmount').match(/\d+/) || [1])[0]);
      const def = who === 'me' ? 'opp' : 'me';
      if (/Enchanted/.test(field(t, 'AttackedTarget'))) g.self.attachedTo = def;   // a Curse on the attacked player
      return { g, event: { type: 'attackers-declared', controllerId: id(who), attackers: Array.from({ length: n }, (_, i) => `a${i}`), defenders: [def], attacks: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, defenderId: def })) } };
    }
  }
  return null;
}

// ── Run every card ───────────────────────────────────────────────────────────────────────────────
const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
let checked = 0, fired = 0, quiet = 0, quietChecked = 0, unread = 0, notModelled = 0;
const misses = [];
for (const card of CARDS) {
  const forge = FORGE[card.name];
  if (!forge || card.card_faces) continue;
  const def = { ...scryfallToDefinition(card), definitionId: 'selfdef' };
  const ours = parseTriggeredAbilities(def);
  for (const t of forge.T || []) {
    if (/Static\$ True/.test(t) || !/TriggerDescription\$/.test(t)) continue;
    // Pair Forge's trigger with ours by its wording, with the card's own name (CARDNAME, "this creature", "Etali") as ~.
    const tilde = s => selfNames(def).reduce((x, n) => x.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '~'), String(s)).replace(/CARDNAME|NICKNAME/g, '~').replace(/\bthis (?:creature|permanent|artifact|enchantment|land|planeswalker|card|aura|equipment|class|vehicle|saga|siege|battle)\b/gi, '~');
    const desc = norm(tilde(field(t, 'TriggerDescription')));
    const ability = ours.find(a => desc.startsWith(norm(tilde(a.trigger)))) || ours.find(a => desc.includes(norm(tilde(a.trigger))));
    const pos = scenario(def, t, false);
    if (!pos) { notModelled++; continue; }
    if (!ability) { unread++; misses.push(`${card.name}: trigger not found in the card text — ${field(t, 'TriggerDescription').slice(0, 90)}`); continue; }
    checked++;
    let got = [];
    try { got = collectTriggers(pos.g.game, pos.event); } catch (error) { misses.push(`${card.name}: error ${error.message}`); continue; }
    if (got.some(x => x.sourceId === 'self' && x.abilityId === ability.id)) fired++;
    else misses.push(`${card.name}: did not fire on ${pos.event.type} — "${ability.trigger}"  [forge ${field(t, 'Mode')} ${field(t, 'ValidCard') || field(t, 'ValidSource') || field(t, 'ValidPlayer') || field(t, 'ValidActivatingPlayer')}]`);
    const neg = scenario(def, t, true);
    if (neg) {
      quietChecked++;
      let wrong = [];
      try { wrong = collectTriggers(neg.g.game, neg.event); } catch { wrong = []; }
      if (!wrong.some(x => x.sourceId === 'self' && x.abilityId === ability.id)) quiet++;
      else misses.push(`${card.name}: fired for the wrong player on ${neg.event.type} — "${ability.trigger}"`);
    }
  }
}
const pct = (a, b) => (100 * a / Math.max(1, b)).toFixed(1);
console.log(`Forge answer key, top ${CARDS.length} Commander cards:`);
console.log(`  fires when it should:      ${fired}/${checked} (${pct(fired, checked)}%)`);
console.log(`  quiet for the wrong player: ${quiet}/${quietChecked} (${pct(quiet, quietChecked)}%)`);
console.log(`  triggers our reader does not find in the text: ${unread}; Forge events not modelled by this test: ${notModelled}`);
if (process.argv.includes('--list')) for (const m of misses) console.log('  - ' + m);
const score = Number(pct(fired + quiet, checked + quietChecked));
if (score < FLOOR) { console.log(`FAIL: ${score}% is below the floor of ${FLOOR}%`); process.exit(1); }

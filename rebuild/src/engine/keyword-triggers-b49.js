// Keyword triggers added in build 49 (they were marked "by hand" in the terms key): Bushido, Rampage, Afflict, Flanking,
// Battle cry, Annihilator, Dethrone, Melee, Mentor, Training, Evolve, Fabricate, Renown, Soulshift, Living weapon, Extort,
// Echo and Cumulative upkeep. Called from keyword-triggers.js with its `add(id, text, effectText, extra)`.
import { effectivePower, effectiveToughness } from './combat.js';

const strip = text => String(text || '').replace(/\([^()]*\)/g, '');
const WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const n = s => Number(s) || WORD[String(s || '').toLowerCase()] || 0;
/** "Bushido 2" → [2] (one entry per instance of the keyword). */
function amounts(text, word) {
  return [...strip(text).matchAll(new RegExp(`(?:^|\\n|,\\s*)\\s*${word} (\\d+|X)\\b`, 'gi'))].map(m => n(m[1]));
}
function count(text, word) { return (strip(text).match(new RegExp(`(?:^|\\n|,\\s*)\\s*${word}\\b(?! \\d)`, 'gi')) || []).length; }
const COST = '((?:\\{[^}]+\\})+)';
const compiled = effects => ({ compiled: { supported: true, requirements: [], unsupported: [], effects } });

export function keywordTriggersB49(game, row, event, add, { defOf }) {
  const d = row.definition, card = row.card, me = row.player.playerId;
  const text = String(d?.oracleText || '');
  const onField = row.zone === 'battlefield' && !row.lastKnown;
  const self = event.sourceId === card.instanceId;
  const pw = c => effectivePower(c, defOf(game, c), game), th = c => effectiveToughness(c, defOf(game, c), game);
  const field = () => (game.players || []).flatMap(p => p.deck?.battlefield || []);
  const blocksOf = id => Object.values(game.combatState?.blocks || {}).flatMap(b => (b.assignments || []).filter(a => a.attackerId === id));

  // --- Blocks: Bushido (blocks or becomes blocked), Rampage, Afflict, Flanking (becomes blocked, once per combat).
  if (onField && event.type === 'blocks') {
    const asBlocker = event.blockerId === card.instanceId, asAttacker = event.attackerId === card.instanceId;
    const first = asAttacker && (blocksOf(card.instanceId)[0]?.blockerId ?? event.blockerId) === event.blockerId;
    for (const [k, b] of amounts(text, 'Bushido').entries())
      if (asBlocker || first) add(`bushido-${k}`, `Bushido ${b} — this creature gets +${b}/+${b} until end of turn.`, '', compiled([{ kind: 'pump', bind: 'sourceId', power: b, toughness: b, expires: 'cleanup' }]));
    if (first) {
      const blockers = Math.max(1, blocksOf(card.instanceId).length);
      for (const [k, r] of amounts(text, 'Rampage').entries())
        if (blockers > 1) add(`rampage-${k}`, `Rampage ${r} — +${r}/+${r} for each creature blocking it beyond the first.`, '', compiled([{ kind: 'pump', bind: 'sourceId', power: r * (blockers - 1), toughness: r * (blockers - 1), expires: 'cleanup' }]));
      for (const [k, a] of amounts(text, 'Afflict').entries())
        add(`afflict-${k}`, `Afflict ${a} — the defending player loses ${a} life.`, '', compiled([{ kind: 'life', scope: 'you', amount: a, deltaSign: -1, forPlayerBind: 'eventPlayer' }]));
    }
    // Flanking: each blocking creature without flanking gets -1/-1.
    if (asAttacker) {
      const blocker = field().find(c => c.instanceId === event.blockerId);
      const k = count(text, 'Flanking');
      if (k && blocker && !count(defOf(game, blocker)?.oracleText, 'Flanking'))
        add('flanking', `Flanking — the blocking creature gets -${k}/-${k} until end of turn.`, '', compiled([{ kind: 'pump', targetId: blocker.instanceId, power: -k, toughness: -k, expires: 'cleanup' }]));
    }
  }

  // --- Attacks: Battle cry, Annihilator, Dethrone, Melee, Mentor, Training.
  if (onField && event.type === 'attacks' && self) {
    const attackers = (game.combatState?.attackers || []).filter(a => a.instanceId !== card.instanceId).map(a => a.instanceId);
    if (count(text, 'Battle cry') && attackers.length)
      add('battle-cry', 'Battle cry — each other attacking creature gets +1/+0 until end of turn.', '', compiled(attackers.map(id => ({ kind: 'pump', targetId: id, power: 1, toughness: 0, expires: 'cleanup' }))));
    for (const [k, a] of amounts(text, 'Annihilator').entries()) {
      const defender = (game.players || []).find(p => p.playerId === event.defenderId);
      if (defender) add(`annihilator-${k}`, `Annihilator ${a} — the defending player sacrifices ${a} permanents.`, '', { compiled: { supported: true, unsupported: [], requirements: [{ kind: 'card-selection', bind: `annihilate${k}`, scope: 'target', filter: 'permanent', amount: a, playerBind: 'eventDefender', label: 'Choose permanents to sacrifice' }], effects: [{ kind: 'sacrifice-many', scope: 'you', amount: a, filter: 'permanent', playerBind: 'eventDefender', bind: `annihilate${k}` }] } });
    }
    if (count(text, 'Dethrone')) {
      const defender = (game.players || []).find(p => p.playerId === event.defenderId);
      const top = Math.max(...(game.players || []).filter(p => !p.eliminated).map(p => Number(p.life || 0)));
      if (defender && Number(defender.life || 0) >= top) add('dethrone', 'Dethrone — the defending player has the most life: put a +1/+1 counter on this creature.', '', compiled([{ kind: 'counter', bind: 'sourceId', counter: '+1/+1', amount: 1 }]));
    }
    if (count(text, 'Melee')) {
      const opps = new Set((game.combatState?.attackers || []).filter(a => a.playerId === me && !a.targetId).map(a => a.defenderId)).size;
      if (opps) add('melee', `Melee — +${opps}/+${opps} until end of turn (opponents attacked this combat).`, '', compiled([{ kind: 'pump', bind: 'sourceId', power: opps, toughness: opps, expires: 'cleanup' }]));
    }
    if (count(text, 'Mentor')) {
      const p = pw(card);
      if (attackers.some(id => { const c = field().find(x => x.instanceId === id); return c && pw(c) < p; }))
        add('mentor', 'Mentor — put a +1/+1 counter on target attacking creature with lesser power.', `Put a +1/+1 counter on target attacking creature with power ${p - 1} or less.`);
    }
    // Provoke: you may have target creature defending player controls untap and block it if able.
    if (count(text, 'Provoke')) add('provoke', 'Provoke — target creature the defending player controls untaps and blocks it if able.', '', { compiled: { supported: true, unsupported: [], requirements: [{ kind: 'b49-defender-creature', bind: 'provoke' }], effects: [{ kind: 'untap', bind: 'provoke', optionalTarget: true }, { kind: 'force-block', blockerBind: 'provoke', attackerBind: 'sourceId', expires: 'end-combat', optionalTarget: true }] } });
    // Enlist: tap a nonattacking creature you control without summoning sickness; add its power to this creature's until end of turn.
    if (count(text, 'Enlist')) add('enlist', 'Enlist — you may tap a nonattacking creature you control to add its power to this creature\'s until end of turn.', '', { compiled: { supported: true, unsupported: [], requirements: [{ kind: 'b49-enlist', bind: 'enlist' }], effects: [{ kind: 'enlist', bind: 'enlist' }] } });
    if (count(text, 'Training') && attackers.some(id => { const c = field().find(x => x.instanceId === id); return c && pw(c) > pw(card); }))
      add('training', 'Training — it attacks with a creature with greater power: put a +1/+1 counter on it.', '', compiled([{ kind: 'counter', bind: 'sourceId', counter: '+1/+1', amount: 1 }]));
  }

  // --- Enters: Evolve (another creature of yours), Fabricate and Living weapon (this one).
  if (onField && event.type === 'enters-battlefield' && !self && count(text, 'Evolve') && event.controllerId === me && /\bCreature\b/.test(event.typeLine || '')) {
    const other = field().find(c => c.instanceId === event.sourceId);
    if (other && (pw(other) > pw(card) || th(other) > th(card))) add('evolve', 'Evolve — a bigger creature entered: put a +1/+1 counter on this creature.', '', compiled([{ kind: 'counter', bind: 'sourceId', counter: '+1/+1', amount: 1 }]));
  }
  if (onField && self && event.type === 'enters-battlefield') {
    for (const [k, f] of amounts(text, 'Fabricate').entries())
      add(`fabricate-${k}`, `Fabricate ${f} — put ${f} +1/+1 counter${f === 1 ? '' : 's'} on it, or create ${f} 1/1 Servo${f === 1 ? '' : 's'}.`, '', { compiled: { supported: true, unsupported: [], requirements: [{ kind: 'choose-text', bind: `fabricate${k}`, options: [`${f} +1/+1 counter${f === 1 ? '' : 's'}`, `${f} Servo${f === 1 ? '' : 's'}`], label: `Fabricate ${f}` }],
        effects: [{ kind: 'condition', test: 'b49-text-is', bind: `fabricate${k}`, value: `${f} +1/+1 counter${f === 1 ? '' : 's'}`, skip: 1 }, { kind: 'counter', bind: 'sourceId', counter: '+1/+1', amount: f }, { kind: 'condition', test: 'b49-text-is', bind: `fabricate${k}`, value: `${f} Servo${f === 1 ? '' : 's'}`, skip: 1 }, { kind: 'create-token', amount: f, name: 'Servo', typeLine: 'Token Artifact Creature — Servo', oracleText: '', power: '1', toughness: '1', colors: [] }] } });
    if (count(text, 'Living weapon'))
      add('living-weapon', 'Living weapon — create a 0/0 black Phyrexian Germ creature token, then attach this Equipment to it.', '', compiled([{ kind: 'living-weapon' }]));
  }

  // --- Combat damage to a player: Renown.
  if (onField && self && event.type === 'combat-damage-player' && !card.renowned)
    for (const [k, r] of amounts(text, 'Renown').entries())
      if (k === 0) add('renown', `Renown ${r} — put ${r} +1/+1 counter${r === 1 ? '' : 's'} on it; it becomes renowned.`, '', compiled([{ kind: 'renown', amount: r }]));

  // --- Backup N: as it enters, N +1/+1 counters on target creature; another creature also gains this one's other abilities until end of turn.
  if (onField && self && event.type === 'enters-battlefield') {
    const lines = strip(text).split('\n').map(x => x.trim()).filter(Boolean);
    const at = lines.findIndex(l => /^Backup \d+$/i.test(l));
    if (at >= 0) {
      const b = n(lines[at].match(/\d+/)[0]), rest = lines.slice(at + 1);
      add('backup', `Backup ${b} — put ${b} +1/+1 counter${b === 1 ? '' : 's'} on target creature; if it's another creature, it gains this creature's abilities until end of turn.`, '', { compiled: { supported: true, unsupported: [],
        requirements: [{ kind: 'target', bind: 'backup', scope: 'target creature', label: 'target creature (backup)' }],
        effects: [{ kind: 'counter', bind: 'backup', counter: '+1/+1', amount: b }, { kind: 'condition', test: 'b49-not-source', bind: 'backup', skip: rest.length ? 1 : 0 }, ...(rest.length ? [{ kind: 'grant-text', bind: 'backup', texts: rest, until: 'turn' }] : [])] } });
    }
  }
  // --- Champion a <type>: as it enters, exile another one you control or sacrifice it; when it leaves, that card returns.
  const champ = strip(text).match(/(?:^|\n)\s*Champion an? ([A-Za-z]+)\b/i);
  if (champ && self && event.type === 'enters-battlefield' && onField)
    add('champion', `Champion a ${champ[1]} — exile another ${champ[1]} you control, or sacrifice this.`, '', { compiled: { supported: true, unsupported: [], requirements: [{ kind: 'b49-champion', bind: 'champion', type: champ[1] }], effects: [{ kind: 'champion', bind: 'champion' }] } });
  if (champ && self && event.type === 'leaves-battlefield' && card.championedId)
    add('champion-return', 'Champion — the exiled card returns to the battlefield under its owner\'s control.', '', compiled([{ kind: 'champion-return', id: card.championedId }]));
  // --- Myriad: for each other opponent, a token copy tapped and attacking them (exiled at end of combat).
  if (onField && self && event.type === 'attacks' && count(text, 'Myriad') && !card.token) {
    const others = (game.players || []).filter(p => !p.eliminated && p.playerId !== me && p.playerId !== event.defenderId);
    if (others.length) add('myriad', `Myriad — a token copy attacking each other opponent (${others.length}).`, '', compiled([{ kind: 'myriad', defenders: others.map(p => p.playerId) }]));
  }
  // --- Ingest: whenever it deals combat damage to a player, that player exiles the top card of their library.
  if (onField && self && event.type === 'combat-damage-player' && count(text, 'Ingest'))
    add('ingest', 'Ingest — that player exiles the top card of their library.', '', compiled([{ kind: 'exile-top-of', playerBind: 'eventPlayer' }]));
  // --- Dies: Soulshift N (return a Spirit card with mana value N or less).
  if (self && event.type === 'dies')
    for (const [k, s] of amounts(text, 'Soulshift').entries())
      add(`soulshift-${k}`, `Soulshift ${s} — you may return a Spirit card with mana value ${s} or less from your graveyard to your hand.`, `You may return target Spirit card with mana value ${s} or less from your graveyard to your hand.`);

  // --- Spells you cast: Extort (each instance).
  if (onField && event.type === 'spell-cast' && event.controllerId === me) {
    const opps = (game.players || []).filter(p => !p.eliminated && p.playerId !== me).length;
    for (let k = 0; k < count(text, 'Extort'); k++)
      add(`extort-${k}`, 'Extort — you may pay {W/B}: each opponent loses 1 life and you gain that much life.', '', compiled([{ kind: 'may-pay', cost: '{W/B}', lifeCost: 0, skip: 2 }, { kind: 'life', scope: 'each-opponent', amount: 1, deltaSign: -1 }, { kind: 'life', scope: 'you', amount: opps, deltaSign: 1 }]));
  }

  // --- Your upkeep: Echo (the first upkeep after it came under your control), Cumulative upkeep.
  if (onField && event.type === 'upkeep' && event.playerId === me) {
    const echo = strip(text).match(new RegExp(`(?:^|\\n)\\s*Echo ${COST}`, 'i'));
    if (echo && card.echoDone !== true && Number(card.controlSinceTurn ?? card.enteredTurn ?? 0) < Number(game.turnNumber)) {
      card.echoDone = true;
      add('echo', `Echo ${echo[1]} — pay it or sacrifice this permanent.`, '', compiled([{ kind: 'may-pay', cost: echo[1], lifeCost: 0, skip: 1, invert: true }, { kind: 'sacrifice', bind: 'sourceId' }]));
    }
    const cu = strip(text).match(new RegExp(`(?:^|\\n)\\s*Cumulative upkeep(?:\\s*[—-]\\s*|\\s+)(?:${COST}|Pay (\\d+) life\\.?)\\s*(?:$|\\n)`, 'i'));
    if (cu) {
      const age = Number(card.counters?.age || 0) + 1;
      const cost = cu[1] ? cu[1].repeat(age) : '', life = cu[2] ? Number(cu[2]) * age : 0;
      add('cumulative-upkeep', `Cumulative upkeep — put an age counter on it, then pay ${cu[1] ? `${cu[1]} × ${age}` : `${life} life`} or sacrifice it.`, '', compiled([{ kind: 'counter', bind: 'sourceId', counter: 'age', amount: 1 }, { kind: 'may-pay', cost: cost || '{0}', lifeCost: life, skip: 1, invert: true }, { kind: 'sacrifice', bind: 'sourceId' }]));
    }
  }
}

/** The keywords read here (rules-audit and the terms key mark them automatic). */
export const B49_KEYWORDS = ['Provoke', 'Champion', 'Enlist', 'Backup', 'Myriad', 'Ingest', 'Bushido', 'Rampage', 'Afflict', 'Flanking', 'Battle cry', 'Annihilator', 'Dethrone', 'Melee', 'Mentor', 'Training', 'Evolve', 'Fabricate', 'Living weapon', 'Renown', 'Soulshift', 'Extort', 'Echo', 'Cumulative upkeep'];

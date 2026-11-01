// Triggered abilities that come from keywords and from how a card was cast, rather than from
// "When/Whenever/At" text: prowess, undying, persist, evoke, dash, blitz, cascade, storm, sagas.
// Each returns a ready-to-resolve ability: either effect text the normal compiler understands,
// or precompiled effects, or a `special` the game layer resolves with choices (cascade …).

import { compileEffectText, definitionFor } from './effects.js';
import { keywordTriggersB49 } from './keyword-triggers-b49.js';

const strip = text => String(text || '').replace(/\([^()]*\)/g, '');

export function hasKeyword(def, word) {
  const re = new RegExp(`(?:^|\\n|,\\s*)\\s*${word}\\b`, 'i');
  return re.test(strip(def?.oracleText)) || (def?.keywords || []).some(k => String(k).toLowerCase() === word.toLowerCase());
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** Saga chapters: [{ chapters: [1,2], text }]. */
export function sagaChapters(def) {
  if (!/\bSaga\b/i.test(def?.typeLine || '')) return [];
  const out = [];
  for (const line of strip(def.oracleText).split('\n')) {
    const m = line.match(/^\s*((?:I|II|III|IV|V|VI)(?:\s*,\s*(?:I|II|III|IV|V|VI))*)\s*[—-]\s*(.+)$/);
    if (m) out.push({ chapters: m[1].split(/\s*,\s*/).map(r => ROMAN.indexOf(r) + 1), text: m[2].trim() });
  }
  return out;
}

export function sagaFinalChapter(def) {
  return Math.max(0, ...sagaChapters(def).flatMap(c => c.chapters));
}

/** Built-in abilities of `row` (a source on the battlefield, or last-known for a card that left) for this event. */
export function keywordTriggers(game, row, event) {
  const out = [];
  const d = row.definition, card = row.card;
  if (!d || !card || !event) return out;
  const self = event.sourceId === card.instanceId;
  const add = (id, text, effect, extra = {}) => out.push({ id: `keyword-${id}`, text, trigger: '', effect, modes: [], builtin: true, ...extra });
  const onField = row.zone === 'battlefield' && !row.lastKnown;

  if (onField && event.type === 'spell-cast' && event.controllerId === row.player.playerId && !/Creature/i.test(event.typeLine || '') && hasKeyword(d, 'Prowess'))
    add('prowess', 'Prowess — this creature gets +1/+1 until end of turn.', 'This creature gets +1/+1 until end of turn.');

  // Exalted: each instance gives a creature attacking alone +1/+1.
  if (onField && event.type === 'attackers-declared' && event.controllerId === row.player.playerId && (event.attackers || []).length === 1) {
    const count = (strip(d.oracleText).match(/(?:^|\n|,\s*)\s*Exalted\b/gi) || []).length || ((d.keywords || []).some(k => /^exalted$/i.test(k)) ? 1 : 0);
    for (let i = 0; i < count; i++)
      add(`exalted-${i}`, 'Exalted — the creature attacking alone gets +1/+1 until end of turn.', '', { compiled: { supported: true, requirements: [], unsupported: [], effects: [{ kind: 'pump', targetId: event.attackers[0], power: 1, toughness: 1, expires: 'cleanup' }] } });
  }
  // Exploit: when it enters, you may sacrifice a creature (ops.js asks; "when it exploits a creature" triggers follow).
  if (onField && self && event.type === 'enters-battlefield' && /(?:^|\n)\s*Exploit\b/i.test(strip(d.oracleText)))
    add('exploit', `Exploit — you may sacrifice a creature.`, '', { special: 'exploit' });
  // Offspring / squad: as it enters, token copies (offspring: a 1/1 copy; squad: one copy for each time the cost was paid).
  if (onField && self && event.type === 'enters-battlefield' && !card.token && (card.offspring || card.squadCount)) {
    const n = card.offspring ? 1 : Number(card.squadCount || 0);
    add('copies', card.offspring ? `Offspring — create a 1/1 token copy of ${d.name}.` : `Squad — create ${n} token cop${n === 1 ? 'y' : 'ies'} of ${d.name}.`, '', { compiled: { supported: true, requirements: [], unsupported: [], effects: Array.from({ length: n }, () => ({ kind: 'copy-token', targetId: card.instanceId, ...(card.offspring ? { setPower: 1, setToughness: 1 } : {}) })) } });
  }
  keywordTriggersB49(game, row, event, add, { defOf: (g, c) => definitionFor(g, c) });
  // Hideaway N: when it enters, look at the top N cards and exile one face down (effects-b49.js); its other ability plays it later.
  const hide = onField && self && event.type === 'enters-battlefield' && strip(d.oracleText).match(/(?:^|\n)\s*Hideaway (\d+)/i);
  if (hide) add('hideaway', `Hideaway ${hide[1]} — look at the top ${hide[1]} cards of your library and exile one face down.`, '', { compiled: { supported: true, requirements: [{ kind: 'b49-hideaway', bind: 'hideaway0', amount: Number(hide[1]) }], unsupported: [], effects: [{ kind: 'hideaway', bind: 'hideaway0', amount: Number(hide[1]) }] } });
  // Soulbond: when this or another creature you control enters, you may pair them (both unpaired).
  if (onField && event.type === 'enters-battlefield' && /(?:^|\n)\s*Soulbond\b/i.test(strip(d.oracleText)) && !card.pairedWith) {
    const other = event.sourceId !== card.instanceId ? (row.player.deck?.battlefield || []).find(c => c.instanceId === event.sourceId) : null;
    if (self) add('soulbond', `Soulbond — you may pair ${d.name} with another unpaired creature you control.`, '', { special: 'soulbond' });
    else if (other && !other.pairedWith && event.controllerId === row.player.playerId && /\bCreature\b/.test(event.typeLine || '')) add('soulbond', `Soulbond — you may pair ${d.name} with the creature that entered.`, '', { special: 'soulbond' });
  }
  // Suspend: at the beginning of its owner's upkeep, remove a time counter (ops.js casts it when the last one goes).
  if (row.zone === 'exile' && card.suspended && event.type === 'upkeep' && event.playerId === row.player.playerId && Number(card.counters?.time || 0) > 0)
    add('suspend', `Suspend — remove a time counter from ${d.name}.`, '', { special: 'suspend' });
  // Miracle: the first card drawn this turn may be revealed and cast for its miracle cost.
  const miracle = self && event.type === 'draw' && row.zone === 'hand' && Number(event.drawNumberThisTurn) === 1 && strip(d.oracleText).match(/(?:^|\n)\s*Miracle ((?:\{[^}]+\})+)/i);
  if (miracle) add('miracle', `Miracle — you may cast ${d.name} for ${miracle[1]}.`, '', { special: 'miracle', madnessCost: miracle[1] });
  if (self && event.type === 'discard' && row.zone === 'exile' && card.madness)
    add('madness', `Madness — you may cast ${d.name} for ${card.madness}.`, '', { special: 'madness', madnessCost: card.madness });
  if (onField && self && event.type === 'enters-battlefield' && card.castMode === 'evoke')
    add('evoke', 'Evoke — sacrifice it when it enters.', 'Sacrifice this creature.');

  if (onField && event.type === 'end-step' && card.castMode === 'dash')
    add('dash', 'Dash — return it to its owner’s hand at the beginning of the end step.', 'Return this creature to its owner’s hand.');

  if (onField && event.type === 'end-step' && card.castMode === 'blitz')
    add('blitz', 'Blitz — sacrifice it at the beginning of the end step.', 'Sacrifice this creature.');

  if (self && event.type === 'dies' && row.zone === 'graveyard') {
    const last = event.last || {};
    if (last.castMode === 'blitz') add('blitz-draw', 'Blitz — when it dies, draw a card.', 'Draw a card.');
    if (!event.token && hasKeyword(d, 'Undying') && !Number(last.counters?.['+1/+1'] || 0))
      add('undying', 'Undying — it returns with a +1/+1 counter.', '', { compiled: { supported: true, requirements: [], unsupported: [], effects: [{ kind: 'return-self', counter: '+1/+1' }] } });
    // Afterlife N: when it dies, create N 1/1 white and black Spirit creature tokens with flying.
    const after = strip(d.oracleText).match(/(?:^|\n|,\s*)\s*Afterlife (\d+)/i);
    if (after) add('afterlife', `Afterlife ${after[1]} — create ${after[1]} 1/1 white and black Spirit tokens with flying.`, '', { compiled: { supported: true, requirements: [], unsupported: [], effects: [{ kind: 'create-token', amount: Number(after[1]), power: 1, toughness: 1, name: 'Spirit', typeLine: 'Token Creature — Spirit', colors: ['W', 'B'], keywords: ['Flying'] }] } });
    if (!event.token && hasKeyword(d, 'Persist') && !Number(last.counters?.['-1/-1'] || 0))
      add('persist', 'Persist — it returns with a -1/-1 counter.', '', { compiled: { supported: true, requirements: [], unsupported: [], effects: [{ kind: 'return-self', counter: '-1/-1' }] } });
  }

  // Sagas: a lore counter as it enters and after your draw step; each chapter triggers.
  if (onField && event.type === 'lore-counter' && self) {
    for (const ch of sagaChapters(d)) {
      if (ch.chapters.some(n => n > event.from && n <= event.to)) add(`chapter-${ch.chapters.join('-')}`, `Chapter ${ch.chapters.map(n => ROMAN[n - 1]).join(', ')} — ${ch.text}`, ch.text);
    }
  }
  return out;
}

/** Cast triggers of the spell itself (it is on the stack, so it is not a normal trigger source). */
export function castTriggers(game, player, card, def) {
  const out = [];
  const text = strip(def?.oracleText);
  const m = text.match(/(?:^|\n)\s*Cascade\b/gi) || [];
  if ((player?.temporaryPermissions || []).some(x => x?.kind === 'next-spell-keyword' && x.keyword === 'cascade' && !(x.noncreature && /\bCreature\b/.test(def?.typeLine || '')))) m.push('Cascade');   // Dark Apostle
  for (let i = 0; i < (m?.length || 0); i++) out.push({ special: 'cascade', label: 'Cascade', text: 'Cascade — exile cards from the top of your library until you exile a nonland card with lesser mana value. You may cast it without paying its mana cost.' });
  const disc = text.match(/When you cast this spell, discover (\d+)/i);
  if (disc) out.push({ special: 'discover', amount: Number(disc[1]), label: `Discover ${disc[1]}`, text: `Discover ${disc[1]} — exile cards from the top of your library until you exile a nonland card with mana value ${disc[1]} or less. Cast it free or put it into your hand.` });
  if (/(?:^|\n)\s*Storm\b/i.test(text)) out.push({ special: 'storm', label: 'Storm', text: 'Storm — copy this spell for each spell cast before it this turn.' });
  // "When you cast this spell, draw four cards." (Kozilek, Ulamog, Emrakul …): an ordinary trigger of the spell.
  for (const m of text.matchAll(/(?:^|\n)\s*When you cast this spell, (?!discover)([^\n]+)/gi)) out.push({ special: null, label: 'Cast trigger', text: `When you cast this spell, ${m[1].trim()}`, effect: m[1].trim() });
  return out;
}

/** The monarch and the initiative: abilities of the designation, not of a card. */
export function designationTriggers(game, event) {
  const out = [];
  const holder = status => (game.players || []).find(p => !p.eliminated && (p.statuses || []).some(s => s.toLowerCase() === status));
  const row = (player, name, effect, extra = {}) => out.push({
    id: `trigger:${Date.now()}:${Math.random()}`, controllerId: player.playerId, sourceId: null, sourceDefinitionId: null, sourceName: name,
    abilityId: `designation-${name}`, abilityText: effect, effectText: effect, modal: null,
    compiled: compileEffectText(effect, { sourceName: name }), event: structuredClone(event), createdAt: new Date().toISOString(), ...extra
  });
  const monarch = holder('monarch'), initiative = holder('initiative');
  if (event.type === 'end-step' && monarch && event.playerId === game.activePlayerId) row(monarch, 'The monarch', 'Draw a card.');
  if (event.type === 'upkeep' && initiative && event.playerId === initiative.playerId) row(initiative, 'The initiative', 'Venture into Undercity.', { special: 'initiative-venture' });
  if (event.type === 'combat-damage-player') {
    const attacker = (game.players || []).find(p => p.playerId === event.controllerId);
    if (attacker && monarch && event.playerId === monarch.playerId && attacker.playerId !== monarch.playerId) row(attacker, 'The monarch', 'You become the monarch.');
    if (attacker && initiative && event.playerId === initiative.playerId && attacker.playerId !== initiative.playerId) row(attacker, 'The initiative', 'You take the initiative.', { special: 'initiative' });
  }
  return out;
}

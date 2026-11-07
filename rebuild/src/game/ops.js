import { noteCorrection } from './corrections.js';
// Multi-step game actions ("ops"): play a card, activate an ability, put a trigger on the stack,
// resolve the top of the stack. An op asks for the choices it needs (see requirements.js) and
// only changes the game once every answer is in, so cancelling half-way never leaves a mess.

import { manaExtras, ANY_COLORS } from '../engine/mana-extras.js';
import { activationReduction } from '../engine/rules.js';
import { createTransactionEngine } from '../engine/transactions.js';
import {
  parseManaCost, planMana, playerManaAvailability, parseActivatedAbilities, validateActivatedAbilityFull,
  basicLandManaColor, isBasicLand, tapManaAbilities, entersBattlefieldTapped
} from '../engine/rules.js';
import { asEntersChoiceSpec, entersWithCountersSpec, modalSpellSpec, spellSupport } from '../engine/abilities.js';
import { compileEffectText, parseCondition, checkCondition } from '../engine/effects.js';
import { availableModalTriggerModes, recordModalTriggerModeChoice, queueTriggers } from '../engine/triggers.js';
import { CREATURE_TYPES } from '../data/creature-types.js';
import {
  COLOR_NAMES, GameError, defOf, definitionsMap, faceDefinition, findInPlayer, isLand, isInstantOrSorcery,
  log, newId, opponentsOf, playerById, plural
  , FUSE_FACE, hasFuse
} from './helpers.js';
import { gatherRequirements, splitRequirements, NoLegalChoice } from './requirements.js';
import { librarySearchSpec, searchFilter } from './library-search.js';
import { abilityZone, activationBlock, activationRules, commanderEntryFor, craftMaterials, craftSpec, manaAmountForAbility, manaOptionsForAbility, playCheck, specialRows, stackTop } from './legal.js';
import { attach, enchantTarget } from './attachments.js';
import { sendCounteredSpell } from './edits.js';
import { candidatesFor } from './requirements.js';
import { targetRequirementsFromText } from './guided.js';
import { adjustGeneric, additionalCost, controlsACommander, delveCards, extraCosts, faceDownDefinition, genericOf, isAdventure, modeCost } from './casting.js';
import { castTriggers, sagaFinalChapter } from '../engine/keyword-triggers.js';
import { cardFitsWords } from '../engine/effects-catalog.js';
import { effectivePower } from '../engine/combat.js';
import { DUNGEONS } from '../data/dungeons.js';

/** Source qualities targeting checks need (protection, hexproof from a color). */
const sourceOf = def => ({ colors: def?.colors || [], typeLine: def?.typeLine || '', name: def?.name || '' });

/** A card resolved by hand still chooses its targets now; returns the chosen ids with labels. */
function guidedTargets(game, player, def, text, bindings, ask, { cancellable = true } = {}) {
  const reqs = targetRequirementsFromText(text);
  if (!reqs.length) return [];
  try {
    gatherRequirements(game, { player, sourceName: def?.name || 'Effect', cancellable, source: sourceOf(def) }, reqs, bindings, ask, 'guided');
  } catch (error) {
    if (error instanceof NoLegalChoice) throw new GameError(error.message);
    throw error;
  }
  return reqs.map(r => ({ id: bindings[r.bind] || null, label: r.label, kind: r.kind })).filter(x => x.id);
}

export function commit(game, action) {
  return createTransactionEngine(game).commit(action);
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** "You may …" effects: returns the inner effect text when the whole effect is optional. */
function optionalInner(text) {
  const m = String(text || '').trim().match(/^you may ([\s\S]+)$/i);
  if (!m || /\bif you do\b/i.test(m[1])) return null;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1);
}

function compileFor(text, sourceName) {
  const inner = optionalInner(text);
  const compiled = compileEffectText(inner || text, { sourceName });
  return { compiled, optional: !!inner };
}

/**
 * Would the game carry out this triggered or activated effect by itself, with the same fallbacks the game
 * uses (optional "you may", library searches, special actions)? Used by tools/rules-audit.mjs.
 */
export function effectRunsByItself(text, sourceName = 'Card') {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/Activate (?:this ability )?only (?:if|during|once)/i.test(t) && !activationRules(t)) return false;
  if (specialFromText(t)) return true;
  // A modal ability ("Choose one — • Destroy target artifact. • Proliferate."): the player picks; each mode must run.
  const modes = /^Choose (?:one|two|three|one or more) —/i.test(t) ? [...t.matchAll(/(?:^|\n|\s)•\s*([^\n•]+)/g)].map(x => x[1].trim()) : [];
  if (modes.length) return modes.every(x => effectRunsByItself(x, sourceName));
  if (compileFor(t, sourceName).compiled.supported) return true;
  const iff = t.match(/^if (.+?), ((?:you may )?search your library.+)$/i);
  if (iff && parseCondition(iff[1])) return !!librarySearchSpec(iff[2]);
  return /^(?:you may )?search your library/i.test(t) && !!librarySearchSpec(t);
}

/**
 * After a spell, ability or trigger is put on the stack with its targets: "becomes the target of a spell or ability"
 * triggers, and "Whenever you commit a crime" (targeting an opponent, their permanents, cards or spells).
 */
function announceTargets(game, player, reqs, bindings, sourceId, kind) {
  const ids = [];
  for (const r of reqs || []) if (['target', 'player', 'multi-target', 'graveyard-target', 'stack-target'].includes(r.kind)) ids.push(...[].concat(bindings[r.bind] || []));
  let crime = false;
  for (const id of new Set(ids.filter(x => typeof x === 'string'))) {
    const q = (game.players || []).find(p => p.playerId === id);
    if (q) { if (q.playerId !== player.playerId) crime = true; continue; }
    const owner = (game.players || []).find(p => ['battlefield', 'graveyard', 'exile', 'hand'].some(z => (p.deck?.[z] || []).some(c => c.instanceId === id)));
    const onField = owner && (owner.deck.battlefield || []).find(c => c.instanceId === id);
    const spell = (game.stack || []).find(x => x.id === id);
    if (onField) {
      const firstThisTurn = onField.lastTargetedTurn !== game.turnNumber;
      onField.lastTargetedTurn = game.turnNumber;
      queueTriggers(game, { type: 'becomes-target', firstThisTurn, sourceId: id, definitionId: onField.definitionId, controllerId: onField.controllerId || owner.playerId, byPlayerId: player.playerId, bySourceId: sourceId, byKind: kind });
      if ((onField.controllerId || owner.playerId) !== player.playerId) crime = true;
    } else if (owner && owner.playerId !== player.playerId) crime = true;
    if (spell && spell.controllerId !== player.playerId) crime = true;
  }
  if (crime) queueTriggers(game, { type: 'crime', playerId: player.playerId, controllerId: player.playerId, sourceId });
}

function guidedSpec(title, oracleText, unsupported) {
  return { title, oracleText, unsupported: (unsupported || []).filter(Boolean) };
}

function searchCount(spec) {
  const m = String(spec?.text || '').match(/search your library for up to (\w+)/i);
  return m ? (Number(m[1]) || NUMBER_WORDS[m[1].toLowerCase()] || 1) : 1;
}

function askAsEnters(game, player, def, ask, source) {
  // A Siege's controller chooses which opponent protects it (rule 310.12a).
  if (/\bBattle\b/i.test(def?.typeLine || '') && /\bSiege\b/i.test(def?.typeLine || '')) {
    const opponents = opponentsOf(game, player.playerId);
    if (opponents.length < 2) return opponents.length ? { protectorId: opponents[0].playerId } : null;
    return { protectorId: ask('enters:protector', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — as it enters`, kind: 'choose-one', prompt: 'Choose the opponent who protects this battle. You and the other players can attack it; they defend it.', options: opponents.map(q => ({ id: q.playerId, label: q.displayName, playerId: q.playerId })) })) };
  }
  const spec = asEntersChoiceSpec(def);
  const kwText = String(def?.oracleText || '').replace(/\([^()]*\)/g, '');
  // Read ahead: choose the chapter it starts on; earlier chapters don't trigger.
  if (!spec && /(?:^|\n)\s*Read ahead\b/i.test(kwText) && /\bSaga\b/i.test(def?.typeLine || '')) {
    const last = sagaFinalChapter(def);
    if (last > 1) return { readAhead: ask('enters:read-ahead', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — read ahead`, kind: 'choose-one', prompt: 'Choose the chapter it starts on. Earlier chapters don’t trigger.', options: Array.from({ length: last }, (_, k) => ({ id: k + 1, label: `Chapter ${['I', 'II', 'III', 'IV', 'V', 'VI'][k]}` })) })) };
  }
  // Amplify N: reveal any number of cards in hand that share a creature type with it; N +1/+1 counters for each.
  const amp = !spec && kwText.match(/(?:^|\n)\s*Amplify (\d+)/i);
  if (amp) {
    const types = (String(def?.typeLine || '').split('—')[1] || '').trim().split(/\s+/).filter(Boolean);
    const rows = (player.deck.hand || []).filter(c => c.definitionId !== def.definitionId && types.some(t => new RegExp(`\\b${t}\\b`).test(defOf(game, c)?.typeLine || '') || /\bChangeling\b/.test(defOf(game, c)?.oracleText || '')));
    const shown = rows.length ? [].concat(ask('enters:amplify', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — amplify ${amp[1]}`, kind: 'choose-many', prompt: `Reveal any number of cards from your hand that share a creature type with it (${amp[1]} +1/+1 counters each).`, options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })), min: 0, max: rows.length })) || []) : [];
    return shown.length ? { plusCounters: shown.length * Number(amp[1]) } : null;
  }
  // Tribute N: an opponent of your choice may put N +1/+1 counters on it ("if tribute wasn't paid" is checked as it enters).
  const trib = !spec && kwText.match(/(?:^|\n)\s*Tribute (\d+)/i);
  if (trib) {
    const opps = opponentsOf(game, player.playerId);
    if (!opps.length) return { tributePaid: false };
    const who = opps.length === 1 ? opps[0].playerId : ask('enters:tribute-who', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — tribute ${trib[1]}`, kind: 'choose-one', prompt: 'Choose an opponent to decide the tribute.', options: opps.map(q => ({ id: q.playerId, label: q.displayName, playerId: q.playerId })) }));
    const pay = ask('enters:tribute', () => ({ playerId: who, cancellable: false, source, title: `${def.name} — tribute ${trib[1]}`, kind: 'choose-one', prompt: `Put ${trib[1]} +1/+1 counters on ${def.name}? If you don't, its "tribute wasn't paid" ability happens.`, options: [{ id: 'pay', label: `Put ${trib[1]} +1/+1 counters on it` }, { id: 'no', label: 'Don’t' }] }));
    return pay === 'pay' ? { plusCounters: Number(trib[1]), tributePaid: true } : { tributePaid: false };
  }
  // Riot: a +1/+1 counter or haste. Unleash: you may have it enter with a +1/+1 counter (then it can't block).
  if (!spec && /(?:^|\n)\s*Riot\b/i.test(kwText)) {
    const pick = ask('enters:riot', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — riot`, kind: 'choose-one', prompt: 'It enters with your choice of a +1/+1 counter or haste.', options: [{ id: 'counter', label: 'A +1/+1 counter' }, { id: 'haste', label: 'Haste' }] }));
    return pick === 'haste' ? { haste: true } : { plusCounters: 1 };
  }
  // Devour N: as it enters, sacrifice any number of other creatures; N +1/+1 counters for each (transactions.js).
  const dev = !spec && kwText.match(/(?:^|\n)\s*Devour (\d+)/i);
  if (dev) {
    const rows = (player.deck.battlefield || []).filter(c => /\bCreature\b/.test(defOf(game, c)?.typeLine || ''));
    if (!rows.length) return null;
    const picks = [].concat(ask('enters:devour', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — devour ${dev[1]}`, kind: 'choose-many', prompt: `Sacrifice any number of creatures: ${def.name} enters with ${dev[1]} +1/+1 counter${dev[1] === '1' ? '' : 's'} for each.`, min: 0, max: rows.length, options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Creature' })) })) || []);
    return picks.length ? { devour: picks, devourEach: Number(dev[1]) } : null;
  }
  if (!spec && /(?:^|\n)\s*Unleash\b/i.test(kwText)) {
    const pick = ask('enters:unleash', () => ({ playerId: player.playerId, cancellable: true, source, title: `${def.name} — unleash`, kind: 'choose-one', prompt: 'You may have it enter with a +1/+1 counter. It can\u2019t block as long as it has one.', options: [{ id: 'counter', label: 'Enter with a +1/+1 counter' }, { id: 'no', label: 'No counter' }] }));
    return pick === 'counter' ? { plusCounters: 1 } : null;
  }
  if (!spec) return null;
  const base = { playerId: player.playerId, cancellable: true, source, title: `${def.name} — as it enters` };
  if (spec.kind === 'color') {
    const colors = ['W', 'U', 'B', 'R', 'G'].filter(c => !(spec.exclude || []).includes(c));
    return { color: ask('enters:color', () => ({ ...base, kind: 'choose-one', prompt: spec.prompt, options: colors.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) })) };
  }
  if (spec.kind === 'opponent') {
    return { playerId: ask('enters:opponent', () => ({ ...base, kind: 'choose-one', prompt: spec.prompt, options: opponentsOf(game, player.playerId).map(q => ({ id: q.playerId, label: q.displayName, playerId: q.playerId })) })) };
  }
  if (spec.kind === 'creature-type') {
    return { creatureType: ask('enters:type', () => ({ ...base, kind: 'text', prompt: spec.prompt, suggestions: CREATURE_TYPES, mustMatchSuggestion: true })) };
  }
  if (spec.kind === 'card-name') return { cardName: ask('enters:name', () => ({ ...base, kind: 'text', prompt: spec.prompt })) };
  return null;
}

/** Which faces of a card may be played from hand (modal double-faced cards offer both). */
export function playableFaces(base) {
  const faces = base?.cardFaces || [];
  if (faces.length < 2) return [null];
  const out = [0];
  for (let i = 1; i < faces.length; i++) if (/\bLand\b/i.test(faces[i].typeLine || '') || faces[i].manaCost) out.push(i);
  return out;
}

function zoneKeyOf(card) {
  return card.zone === 'command' ? 'commandZone' : card.zone === 'library' ? 'remainingLibrary' : card.zone;
}

// ---------------------------------------------------------------------------------------------
// Play a card (land or spell)

/** Rules text as it applies to this cast: keyword-cost lines removed, kicker and overload applied. */
/** Gift (Bloomburrow): "Gift a card", "Gift a tapped Fish" … — what the promised opponent gets, as an instruction for them. */
const GIFT_TEXT = { 'a card': 'Draw a card.', 'a food': 'Create a Food token.', 'a tapped fish': 'Create a tapped 1/1 blue Fish creature token.', 'a treasure': 'Create a Treasure token.', 'an extra turn': 'Take an extra turn after this one.', 'an octopus': 'Create an 8/8 blue Octopus creature token.' };
export function giftSpec(def) {
  const m = String(def?.oracleText || '').match(/^Gift (an? [a-z ]+?)\s*(?:\(|$)/im);
  const text = m && GIFT_TEXT[m[1].toLowerCase()];
  return text ? { what: m[1], text } : null;
}
/** The sentences that depend on the gift, kept or dropped (an "instead" replaces the sentence before it). */
function giftText(t, gift) {
  t = t.replace(/(^|\n|\.\s+)([^.\n]+\.)\s*If the gift was promised, ([^.]+?) instead\./gi, (all, lead, before, after) => `${lead}${gift ? `${cap(after)}.` : before}`);
  t = t.replace(/(^|\n|\.\s+)([^.\n]+\.)\s*If the gift was promised, instead ([^.]+\.)/gi, (all, lead, before, after) => `${lead}${gift ? cap(after) : before}`);
  t = t.replace(/\s*If the gift was promised, ([^.]+)\./gi, (all, clause) => (gift ? ` ${cap(clause.replace(/\balso /, ''))}.` : ''));
  t = t.replace(/\s*If the gift wasn'?t promised, ([^.]+)\./gi, (all, clause) => (gift ? '' : ` ${cap(clause)}.`));
  t = t.replace(/(^|\n|\.\s+)([^.\n]+?) if the gift was promised\./gi, (all, lead, clause) => (gift ? `${lead}${clause}.` : lead.replace(/\s+$/, ' ')));
  return t.replace(/^\s+/, '');
}
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
export function castText(text, { kicked = false, overload = false, gift = false, bargained = false, surged = false, awaken = 0 } = {}) {
  let t = String(text || '').split('\n').filter(line => !/^\s*(?:Awaken \d|Gift an? |Splice onto |Dredge \d|Surge|Transmute|Ascend\s*(?:\(|$)|Entwine|Escalate|Replicate|Casualty|Bargain|Offspring|Squad|Spree|Kicker|Multikicker|Buyback|Flashback|Escape|Evoke|Dash|Blitz|Overload|Foretell|Morph|Megamorph|Disguise|Convoke|Improvise|Emerge|Spectacle|Delve|Affinity for \w+|Undaunted|Cascade|Storm|Prowess|Undying|Persist|Cycling|(?:Basic )?[A-Za-z]+cycling|Retrace|Jump-start|Split second|Rebound|Madness|Miracle|Suspend|Plot|Fuse)\b/i.test(line)).join('\n');
  t = t.replace(/This spell costs \{\d+\} (?:less|more) to cast[^.]*\.\s*/gi, '');
  t = t.replace(/(?:Strive — )?This spell costs (?:\{[^}]+\})+ more to cast for each target beyond the first\.\s*/gi, '');
  // Casting permissions and costs, not things the spell does as it resolves.
  t = t.replace(/If you control a commander, you may cast this spell without paying its mana cost\.\s*/gi, '');
  t = t.replace(/As an additional cost to cast this spell, [^.]+\.\s*/gi, '');
  t = t.replace(/(?:If it'?s not your turn, )?You may (?:pay \d+ life and )?exile an? \w+ card from your hand rather than pay this spell'?s mana cost\.\s*/gi, '');
  t = t.replace(/(?:If [^,.]+, )?you may (?:pay (?:\{[^}]+\})+|pay \d+ life|sacrifice an? [a-z ]+?) rather than pay this spell'?s mana cost(?: if [^.]+)?\.\s*/gi, '');
  t = t.replace(/\s*If (?:this spell|it) was kicked, ([^.]+)\./gi, (all, clause) => {
    if (!kicked) return '';
    const dmg = clause.match(/^it deals (\w+) damage instead$/i);
    if (dmg) return `\u0000${dmg[1]}`;
    return /\binstead\b/i.test(clause) ? all : ` ${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
  });
  // "deals 2 damage … If kicked, it deals 4 damage instead."
  t = t.replace(/deals (\w+) damage([^\u0000]*?)\.\s*\u0000(\w+)/g, (all, a, rest, b) => `deals ${b} damage${rest}.`);
  if (overload) t = t.replace(/\btarget\b/g, 'each').replace(/\bTarget\b/g, 'Each');
  if (/\bgift (?:was|wasn'?t) promised\b/i.test(t)) t = giftText(t, gift);
  // Surge: "If this spell's surge cost was paid, …"
  if (/surge cost was paid/i.test(t)) t = giftText(t.replace(/If this spell'?s surge cost was paid, /gi, 'If the gift was promised, '), surged);
  // Bargain: "If this spell was bargained, …" works like the gift sentences.
  if (/\bwas bargained\b/i.test(t)) t = giftText(t.replace(/If this spell was bargained, /gi, 'If the gift was promised, ').replace(/If this spell wasn'?t bargained, /gi, "If the gift wasn't promised, "), bargained);
  // Awaken: cast for its awaken cost, it also animates a land you control
  if (awaken) t = `${t.trim()}\nPut ${awaken} +1/+1 counters on target land you control. It becomes a 0/0 Elemental creature with haste. It's still a land.`;
  return t.trim();
}

function runPlay(game, op, ask) {
  const player = playerById(game, op.playerId);
  const hit = findInPlayer(player, op.args.instanceId);
  if (!hit || !['hand', 'commandZone', 'graveyard', 'exile'].includes(hit.zone)) throw new GameError('That card is no longer available to play.');
  const card = hit.card, base = game.cardDefinitions[card.definitionId], force = !!op.args.force, free = !!op.args.free;

  let faceIndex = Number.isInteger(op.args.faceIndex) ? op.args.faceIndex : null;
  const faces = hit.zone === 'hand' || free ? playableFaces(base) : [null];
  if (hit.zone === 'hand' && !free && hasFuse(base)) faces.push(FUSE_FACE);   // Fuse: both halves
  if (faces.length > 1 && faceIndex === null) {
    faceIndex = ask('face', () => ({
      playerId: player.playerId, cancellable: !free, kind: 'choose-one', source: base.name, title: base.combinedName || base.name,
      prompt: 'This card has two faces. Choose the face to play.',
      options: faces.map(i => {
        const check = playCheck(game, player, card, i);
        const face = i === FUSE_FACE ? { name: `Both halves (fuse) — ${base.cardFaces.map(f => f.manaCost).join(' + ')}`, typeLine: base.cardFaces[0].typeLine } : base.cardFaces[i];
        return { id: i, label: face.name, sub: `${face.typeLine}${check.legal || free ? '' : ` — ${check.reasons[0]}`}`, definitionId: base.definitionId, faceIndex: i === FUSE_FACE ? null : i, disabled: !check.legal && !force && !free };
      })
    }));
  }
  const check = playCheck(game, player, card, faceIndex);
  const madness = typeof op.args.madnessCost === 'string' ? op.args.madnessCost : null;
  if (madness !== null) {
    // Madness: cast now from exile for its madness cost; timing is waived (it is cast while its trigger resolves).
    if (check.kind === 'land') throw new GameError('A land cannot be cast.');
  } else if (free) {
    // Cast without paying its mana cost (cascade, discover): only timing is waived, not targets.
    if (check.kind === 'land') throw new GameError('A land cannot be cast.');
  } else if (!check.legal && !force) throw new GameError(check.reasons[0] || 'That play is not legal right now.', check.reasons);
  let def = check.def;
  let activeFaceIndex = Number.isInteger(def?.faceIndex) ? def.faceIndex : null;

  if (check.kind === 'land') {
    const choices = askAsEnters(game, player, def, ask, def.name);
    const text = String(def.oracleText || '');
    const basic = isBasicLand(def);
    let entersTapped = basic ? false : entersBattlefieldTapped({ definition: def, battlefield: player.deck.battlefield, definitions: game.cardDefinitions });
    let lifeCost = 0;
    const life = text.match(/(?:enters(?: the battlefield)? tapped unless you pay|you may pay) (\d+) life/i);
    if (life && /enters(?: the battlefield)? tapped|if you don['’]t, it enters(?: the battlefield)? tapped/i.test(text)) {
      const cost = Number(life[1]);
      const pay = ask('land:life', () => ({
        playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — as it enters`,
        prompt: `Pay ${cost} life to have it enter untapped, or let it enter tapped.`,
        options: [{ id: 'pay', label: `Pay ${cost} life — untapped`, disabled: player.life <= cost }, { id: 'tapped', label: 'Enter tapped' }]
      }));
      entersTapped = pay !== 'pay';
      lifeCost = pay === 'pay' ? cost : 0;
    }
    const fixed = [...new Set(tapManaAbilities(def).flatMap(a => a.options))];
    commit(game, {
      type: 'play-land', playerId: player.playerId, instanceId: card.instanceId, activeFaceIndex, entersTapped, lifeCost,
      basicManaColor: fixed.length === 1 ? fixed[0] : basicLandManaColor(def), asEntersChoices: choices,
      doesNotCountAsLandPlay: force && !check.legal,
      label: `${player.displayName} plays ${def.name}${entersTapped ? ' tapped' : ''}${lifeCost ? `, paying ${lifeCost} life` : ''}.`
    });
    return;
  }

  // How is it cast? (normal, flashback, evoke, face down …)
  const modes = madness !== null ? [{ id: 'madness', label: op.args.castLabel || 'Madness', cost: madness, legal: true }] : free ? [{ id: 'normal', label: 'Cast', cost: '', legal: true }] : (check.options || []).filter(o => o.legal || force);
  let mode = modes[0] || { id: 'normal', label: 'Cast', cost: def.manaCost || '' };
  if (modes.length > 1) {
    const pick = ask('castMode', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — how to cast`,
      prompt: 'Choose how to cast it.',
      options: modes.map(o => ({ id: o.id, label: `${o.label} ${o.fullCost || o.cost || ''}`.trim(), sub: o.legal ? (o.notes || []).join(', ') : (o.reasons || [])[0] || '' }))
    }));
    mode = modes.find(o => o.id === pick) || mode;
  }
  const faceDown = mode.faceDown || null;
  // Disturb: the back face is what is cast.
  if (mode.backFace) { def = faceDefinition(base, mode.backFace) || def; activeFaceIndex = mode.backFace; }

  // Extra costs: kicker, multikicker, buyback.
  const commander = card.zone === 'command' ? commanderEntryFor(player, card) : null;
  const tax = commander && game.rulesConfig?.commanderTax !== false ? Number(commander.commanderTax || 0) : 0;
  const extras = faceDown ? {} : extraCosts(def);
  const affordable = extra => free || force || modeAffordable(game, player, card, def, mode, { tax, extra });
  let extraCost = '', kickCount = 0, buyback = false;
  if (extras.kicker) {
    const kick = ask('kicker', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — kicker`,
      prompt: `Pay the kicker cost ${extras.kicker}?`,
      options: [{ id: 'kick', label: `Kick it (${extras.kicker} more)`, disabled: !affordable(extras.kicker) }, { id: 'no', label: 'Don’t kick' }]
    }));
    if (kick === 'kick') { extraCost += extras.kicker; kickCount = 1; }
  }
  if (extras.multikicker) {
    let max = 0;
    while (max < 10 && affordable(extras.multikicker.repeat(max + 1))) max++;
    kickCount = ask('multikicker', () => ({ playerId: player.playerId, cancellable: true, kind: 'number', source: def.name, title: `${def.name} — multikicker`, prompt: `Pay ${extras.multikicker} any number of times.`, min: 0, max: force ? 10 : max }));
    extraCost += extras.multikicker.repeat(kickCount);
  }
  if (extras.buyback) {
    const buy = ask('buyback', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — buyback`,
      prompt: `Pay buyback ${extras.buyback}? It returns to your hand as it resolves.`,
      options: [{ id: 'buy', label: `Buyback (${extras.buyback} more)`, disabled: !affordable(extraCost + extras.buyback) }, { id: 'no', label: 'No buyback' }]
    }));
    if (buy === 'buy') { extraCost += extras.buyback; buyback = true; }
  }

  // Replicate: pay it any number of times; a copy for each time (a cast trigger, below).
  let replicateCount = 0, offspring = false, squadCount = 0, casualtyId = null, bargainId = null;
  if (extras.replicate) {
    let max = 0;
    while (max < 10 && affordable(extraCost + extras.replicate.repeat(max + 1))) max++;
    replicateCount = ask('replicate', () => ({ playerId: player.playerId, cancellable: true, kind: 'number', source: def.name, title: `${def.name} — replicate`, prompt: `Pay the replicate cost ${extras.replicate} any number of times; the spell is copied that many times.`, min: 0, max: force ? 10 : max }));
    extraCost += extras.replicate.repeat(replicateCount);
  }
  if (extras.squad) {
    let max = 0;
    while (max < 10 && affordable(extraCost + extras.squad.repeat(max + 1))) max++;
    squadCount = ask('squad', () => ({ playerId: player.playerId, cancellable: true, kind: 'number', source: def.name, title: `${def.name} — squad`, prompt: `Pay the squad cost ${extras.squad} any number of times; it enters with that many token copies.`, min: 0, max: force ? 10 : max }));
    extraCost += extras.squad.repeat(squadCount);
  }
  if (extras.offspring) {
    const pay = ask('offspring', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — offspring`,
      prompt: `Pay the offspring cost ${extras.offspring}? When it enters, you create a 1/1 token copy of it.`,
      options: [{ id: 'pay', label: `Offspring (${extras.offspring} more)`, disabled: !affordable(extraCost + extras.offspring) }, { id: 'no', label: 'No offspring' }]
    }));
    if (pay === 'pay') { extraCost += extras.offspring; offspring = true; }
  }
  if (extras.casualty || extras.bargain) {
    // Casualty N: sacrifice a creature with power N or greater to copy the spell. Bargain: sacrifice an artifact, enchantment or token.
    const n = extras.casualty === 'X' ? 0 : Number(extras.casualty || 0);
    const rows = player.deck.battlefield.filter(c => extras.casualty ? /\bCreature\b/.test(defOf(game, c)?.typeLine || '') && effectivePower(c, defOf(game, c), game) >= n : (c.token || /\b(?:Artifact|Enchantment)\b/.test(defOf(game, c)?.typeLine || '')))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Permanent', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (rows.length) {
      const pick = ask(extras.casualty ? 'casualty' : 'bargain', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — ${extras.casualty ? `casualty ${extras.casualty}` : 'bargain'}`,
        prompt: extras.casualty ? `You may sacrifice a creature with power ${n} or greater; if you do, the spell is copied.` : 'You may sacrifice an artifact, enchantment or token to bargain.',
        options: [{ id: 'none', label: extras.casualty ? 'No casualty' : 'Don’t bargain' }, ...rows] }));
      if (pick && pick !== 'none') { if (extras.casualty) casualtyId = pick; else bargainId = pick; }
    }
  }

  // Gift: the caster may promise an opponent a gift as they cast it; the opponent gets it before the spell's other effects.
  const gift = faceDown ? null : giftSpec(def);
  let giftTo = null;
  if (gift) {
    const opps = (game.players || []).filter(q => !q.eliminated && q.playerId !== player.playerId);
    const pick = opps.length ? ask('gift', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — gift ${gift.what}`,
      prompt: `Promise an opponent a gift (${gift.what})? They get it before the spell's other effects.`,
      options: [{ id: 'none', label: 'No gift' }, ...opps.map(q => ({ id: q.playerId, label: `Promise ${gift.what} to ${q.displayName}`, playerId: q.playerId }))]
    })) : 'none';
    giftTo = pick && pick !== 'none' ? pick : null;
  }

  // "As an additional cost to cast this spell, sacrifice a creature / discard a card / pay X life."
  const addCost = faceDown ? null : additionalCost(def);
  let sacrificeForCost = null, lifeForCost = 0, addDiscard = null, exileFromHandForCost = null;
  // Force of Will / Force of Negation: exile a blue card from your hand instead of paying mana.
  if (mode.exileColor) {
    const rows = player.deck.hand.filter(c => c.instanceId !== card.instanceId && (defOf(game, c)?.colors || []).includes(mode.exileColor))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (!rows.length && !force) throw new GameError('You need another blue card in your hand to exile.');
    if (rows.length) exileFromHandForCost = ask('cost:exile-blue', () => ({ playerId: player.playerId, cancellable: true, private: true, kind: 'choose-one', source: def.name, title: `${def.name} — alternative cost`, prompt: `Exile a blue card from your hand${mode.lifeCost ? ` and pay ${mode.lifeCost} life` : ''} instead of paying its mana cost.`, options: rows }));
    lifeForCost += Number(mode.lifeCost || 0);
  }
  // Casualty / bargain sacrifice (an optional additional cost) uses the same sacrifice as other costs.
  if (!sacrificeForCost && (casualtyId || bargainId)) sacrificeForCost = casualtyId || bargainId;
  else if (casualtyId || bargainId) { casualtyId = null; bargainId = null; }
  let emergeReduction = 0;
  if (mode.emerge) {
    const rows = player.deck.battlefield.filter(c => /\bCreature\b/i.test(defOf(game, c)?.typeLine || ''))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Creature', sub: `mana value ${Number(defOf(game, c)?.manaValue ?? defOf(game, c)?.cmc ?? 0)}`, instanceId: c.instanceId, definitionId: c.definitionId }));
    if (!rows.length && !force) throw new GameError('You need a creature to sacrifice for emerge.');
    if (rows.length) {
      sacrificeForCost = ask('cost:emerge', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — emerge`, prompt: `Sacrifice a creature; the emerge cost ${mode.emerge} is reduced by its mana value.`, options: rows }));
      const sac = player.deck.battlefield.find(c => c.instanceId === sacrificeForCost);
      emergeReduction = Number(defOf(game, sac)?.manaValue ?? defOf(game, sac)?.cmc ?? 0);
    }
  }
  if (mode.altLife) lifeForCost += Number(mode.altLife);
  if (mode.altSacrifice) {
    const words = mode.altSacrifice.split(/\s+/);
    const fits = c => { const d = defOf(game, c), t = String(d?.typeLine || '').toLowerCase(); return words.every(w => w === 'nontoken' ? !c.token : w === 'token' ? !!c.token : /^(white|blue|black|red|green)$/.test(w) ? (d?.colors || []).includes({ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[w]) : w === 'permanent' || t.includes(w)); };
    const rows = player.deck.battlefield.filter(fits).map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Permanent', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (!rows.length && !force) throw new GameError(`You need a ${mode.altSacrifice} to sacrifice.`);
    if (rows.length) sacrificeForCost = ask('cost:alt-sacrifice', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — alternative cost`, prompt: `Sacrifice a ${mode.altSacrifice} instead of paying its mana cost.`, options: rows }));
  }
  if (addCost?.kind === 'sacrifice') {
    const rows = player.deck.battlefield.filter(c => addCost.filters.some(f => String(defOf(game, c)?.typeLine || '').toLowerCase().includes(f)))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Permanent', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (!rows.length && !force) throw new GameError(`You need a ${addCost.filters.join(' or ')} to sacrifice.`);
    if (rows.length) sacrificeForCost = ask('cost:sacrifice', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — additional cost`, prompt: `${addCost.label} to cast it.`, options: rows }));
  } else if (addCost?.kind === 'discard') {
    const rows = player.deck.hand.filter(c => c.instanceId !== card.instanceId)
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (!rows.length && !force) throw new GameError('You need another card in hand to discard.');
    if (rows.length) addDiscard = ask('cost:extra-discard', () => ({ playerId: player.playerId, cancellable: true, private: true, kind: 'choose-one', source: def.name, title: `${def.name} — additional cost`, prompt: 'Discard a card to cast it.', options: rows }));
  } else if (addCost?.kind === 'life-x') {
    lifeForCost = ask('cost:life-x', () => ({ playerId: player.playerId, cancellable: true, kind: 'number', source: def.name, title: `${def.name} — pay X life`, prompt: 'Choose X: you pay that much life.', min: 0, max: Math.max(0, Number(player.life || 0)) }));
  }

  // The card as cast: face down it is a vanilla 2/2; kicker and overload change what it does.
  const castDef = faceDown ? faceDownDefinition(faceDown) : { ...def, oracleText: castText(def.oracleText, { kicked: kickCount > 0, overload: mode.id === 'overload', gift: !!giftTo, bargained: !!bargainId, surged: mode.id === 'surge', awaken: mode.id === 'awaken' ? Number(mode.awaken || 0) : 0 }) };
  const permanent = !isInstantOrSorcery(castDef);
  const asEnters = permanent && !faceDown ? askAsEnters(game, player, def, ask, def.name) : null;
  const tag = [kickCount > 1 ? `kicked ×${kickCount}` : kickCount ? 'kicked' : '', giftTo ? `gift promised to ${playerById(game, giftTo)?.displayName || 'an opponent'}` : '', mode.id !== 'normal' && !faceDown ? mode.label.toLowerCase() : ''].filter(Boolean).join(', ');
  let compiled = { effects: [], requirements: [] }, guided = null, search = null, optional = false;
  if (!permanent) {
    const title = `${def.name}${tag ? ` (${tag})` : ''} — resolve by hand`;
    const support = spellSupport(castDef);
    if (support.kind === 'modal' && support.modal) {
      const modal = support.modal, count = modal.repeat ? modal.count : Math.min(modal.count, modal.modes.length);
      // "one or more" (Farewell): any number; "choose both" with a commander (Jeska's Will, Akroma's Will).
      const both = modal.commanderBoth && controlsACommander(game, player);
      const min = count;
      let max = modal.oneOrMore ? modal.modes.length : both ? Math.min(2, modal.modes.length) : count;
      // Entwine: pay the entwine cost to choose all modes.
      let entwined = false;
      if (extras.entwine && !modal.repeat) {
        const pay = ask('entwine', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — entwine`, prompt: `Pay the entwine cost ${extras.entwine} to choose all modes?`,
          options: [{ id: 'pay', label: `Entwine (${extras.entwine} more) — all modes`, disabled: !affordable(extraCost + extras.entwine) }, { id: 'no', label: 'Choose modes as usual' }] }));
        if (pay === 'pay') { entwined = true; extraCost += extras.entwine; }
      }
      // Escalate: each mode beyond the first costs the escalate cost; at most as many as can be paid.
      if (extras.escalate && modal.oneOrMore && !force) { let k = 1; while (k < modal.modes.length && affordable(extraCost + extras.escalate.repeat(k))) k++; max = Math.min(max, k); }
      const picked = entwined ? modal.modes.map((_, i) => i) : modal.repeat ? Array.from({ length: count }, (_, i) => ask(`modes:${i}`, () => ({
        playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — mode ${i + 1} of ${count}`,
        prompt: 'Choose a mode. You may choose the same mode more than once.', options: modal.modes.map((text, j) => ({ id: j, label: text }))
      }))) : ask('modes', () => ({
        playerId: player.playerId, cancellable: true, kind: 'choose-many', source: def.name, title: `${def.name} — choose ${max > min ? `${min} or more` : count}`,
        prompt: modal.oneOrMore ? 'Choose one or more modes.' : both ? 'You control a commander: choose one mode, or both.' : `Choose ${plural(count, 'mode')}.`, min, max,
        options: modal.modes.map((text, i) => ({ id: i, label: text }))
      }));
      if (extras.escalate && picked.length > 1) extraCost += extras.escalate.repeat(picked.length - 1);
      // Spree: each chosen mode adds its own cost.
      if (modal.spreeCosts) for (const i of picked) extraCost += modal.spreeCosts[i] || '';
      if ((extras.escalate || modal.spreeCosts) && !affordable(extraCost)) throw new GameError('You can’t pay for all of those modes.');
      // The same mode twice gets its own targets each time.
      const chosen = picked.map((i, n) => { const c = modal.compiledModes[i]; if (!modal.repeat || !c) return c; let json = JSON.stringify(c); for (const r of c.requirements || []) json = json.split(`"${r.bind}"`).join(`"${r.bind}_m${n}"`); return JSON.parse(json); });
      if (chosen.some(x => !x?.supported)) guided = guidedSpec(title, picked.map(i => modal.modes[i]).join('\n'), chosen.flatMap(x => x?.unsupported || []));
      else compiled = { effects: chosen.flatMap(x => x.effects), requirements: chosen.flatMap(x => x.requirements) };
    } else if (support.kind === 'search-spell') {
      search = librarySearchSpec(castDef.oracleText);
      if (!search) guided = guidedSpec(title, castDef.oracleText, [castDef.oracleText]);
    } else if (support.compiled?.supported) {
      compiled = support.compiled;
    } else if (support.kind === 'effect') {
      const again = compileFor(castDef.oracleText, def.name);
      if (again.compiled.supported) { compiled = again.compiled; optional = again.optional; }
      else guided = guidedSpec(title, castDef.oracleText, support.reasons);
    } else {
      guided = guidedSpec(title, castDef.oracleText, support.reasons);
    }
  }

  // Splice onto Arcane: reveal Arcane-splice cards from hand and pay their splice costs; their effects are added to this spell.
  if (!permanent && !guided && /\bArcane\b/.test(castDef.typeLine || '') && card.zone === 'hand') {
    const splicers = player.deck.hand.filter(c => c.instanceId !== card.instanceId).map(c => ({ c, m: String(defOf(game, c)?.oracleText || '').replace(/\([^()]*\)/g, '').match(/(?:^|\n)\s*Splice onto Arcane ((?:\{[^}]+\})+)/i) })).filter(x => x.m);
    if (splicers.length) {
      const picked = [].concat(ask('splice', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-many', source: def.name, title: `${def.name} — splice onto Arcane`, prompt: 'Reveal any number of cards with splice onto Arcane and pay their splice costs; their effects are added to this spell.',
        options: splicers.map(x => ({ id: x.c.instanceId, label: `${defOf(game, x.c)?.name} (${x.m[1]})`, sub: defOf(game, x.c)?.typeLine || '', instanceId: x.c.instanceId, definitionId: x.c.definitionId })), min: 0, max: splicers.length })) || []);
      for (const [n, id] of picked.entries()) {
        const x = splicers.find(y => y.c.instanceId === id);
        if (!x) continue;
        extraCost += x.m[1];
        const sp = compileFor(castText(defOf(game, x.c)?.oracleText || ''), defOf(game, x.c)?.name).compiled;
        if (!sp.supported) { guided = guidedSpec(`${def.name} — resolve by hand`, `${castDef.oracleText}\n${castText(defOf(game, x.c)?.oracleText || '')}`, sp.unsupported); break; }
        let json = JSON.stringify(sp);
        for (const r of sp.requirements || []) json = json.split(`"${r.bind}"`).join(`"${r.bind}_splice${n}"`);
        const renamed = JSON.parse(json);
        compiled = { ...compiled, effects: [...(compiled.effects || []), ...renamed.effects], requirements: [...(compiled.requirements || []), ...renamed.requirements] };
      }
      if (picked.length && !affordable(extraCost)) throw new GameError('You can’t pay all of those splice costs.');
    }
  }
  const bindings = addCost?.kind === 'life-x' ? { X: lifeForCost } : {};
  // Addendum: "If you cast this spell during your main phase" (checked as it resolves).
  if (game.activePlayerId === player.playerId && ['precombat-main', 'postcombat-main'].includes(game.phase)) bindings.castInMain = true;
  if (giftTo) {
    // The promised gift comes first, done by the opponent who was promised it.
    bindings.giftPlayer = giftTo;
    const g = compileFor(gift.text, def.name).compiled;
    if (!permanent && !guided && g.supported) compiled = { ...compiled, effects: [...g.effects.map(e => ({ ...e, forPlayerBind: 'giftPlayer' })), ...(compiled.effects || [])] };
    else if (guided) guided.oracleText = `Gift (${playerById(game, giftTo)?.displayName || 'opponent'}): ${gift.text}\n${guided.oracleText}`;
  }
  const printed = parseManaCost(def.manaCost || '');
  let xExtra = 0;
  if (printed.X && !faceDown && !free && ['normal', 'adventure', 'foretell'].includes(mode.id)) {
    const avail = playerManaAvailability(player, game);
    const pool = ['W', 'U', 'B', 'R', 'G', 'C'].reduce((n, c) => n + Number(avail[c] || 0), 0) + (avail.__flex || []).length;
    bindings.X = ask('x', () => ({ playerId: player.playerId, cancellable: true, kind: 'number', source: def.name, title: `${def.name} — choose X`, prompt: 'Choose the value of X.', min: 0, max: force ? 99 : Math.max(0, Math.floor(pool / printed.X)) }));
    xExtra = bindings.X * printed.X;
  } else if (printed.X && free) bindings.X = 0;
  const { cast, resolve } = splitRequirements((compiled.requirements || []).filter(r => !(r.kind === 'number' && r.bind === 'X' && printed.X)));
  const guidedPicks = guided ? guidedTargets(game, player, castDef, guided.oracleText || castDef.oracleText, bindings, ask) : [];
  if (guided) guided.targets = guidedPicks;
  try {
    gatherRequirements(game, { player, sourceName: def.name, source: sourceOf(castDef), cancellable: true }, cast, bindings, ask, 'cast');
  } catch (error) {
    if (error instanceof NoLegalChoice) throw new GameError(error.message);
    throw error;
  }

  // Auras choose what they enchant as they are cast.
  let attachTo = null;
  const enchant = permanent && !faceDown ? (mode.id === 'bestow' ? 'creature' : enchantTarget(def)) : null;   // bestow: an Aura with enchant creature
  let reanimate = false;
  if (enchant && /^(?:player|opponent)$/.test(enchant)) {
    // Curses and other player Auras: enchant a player (an opponent for "Enchant opponent").
    const rows = (game.players || []).filter(q => !q.eliminated && (enchant === 'player' || q.playerId !== player.playerId)).map(q => ({ id: q.playerId, label: q.displayName, playerId: q.playerId }));
    if (!rows.length && !force) throw new GameError(`There is no ${enchant} to enchant.`);
    if (rows.length) attachTo = ask('enchant', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', targeting: true, source: def.name, title: `${def.name} — enchant ${enchant}`, prompt: `Choose the ${enchant} to enchant.`, options: rows }));
  } else if (enchant && /card in (?:a|your|an opponent'?s) graveyard/.test(enchant)) {
    // Animate Dead, Necromancy: enchant a creature card in a graveyard; it returns to the battlefield as the Aura enters.
    const rows = candidatesFor(game, { kind: 'graveyard-target', scope: `target ${enchant.replace(/ in (?:a|an opponent'?s) graveyard/, '')}${/your/.test(enchant) ? '' : ''}` }, player)
      .filter(r => /your/.test(enchant) ? (player.deck.graveyard || []).some(c => c.instanceId === r.id) : true);
    if (!rows.length && !force) throw new GameError(`There is no ${enchant} to enchant.`);
    if (rows.length) { attachTo = ask('enchant', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', targeting: true, source: def.name, title: `${def.name} — enchant ${enchant}`, prompt: `Choose the ${enchant} to enchant.`, options: rows })); reanimate = true; }
  } else if (enchant) {
    const rows = candidatesFor(game, { kind: 'target', scope: `target ${enchant}` }, player);
    if (!rows.length && !force) throw new GameError(`There is no ${enchant} to enchant.`);
    if (rows.length) attachTo = ask('enchant', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', targeting: true, source: def.name, title: `${def.name} — enchant ${enchant}`, prompt: `Choose the ${enchant} to enchant.`, options: rows }));
  }

  // Mutate: target non-Human creature you own; over or under it.
  let mutateOnto = null, mutateUnder = false;
  if (mode.id === 'mutate') {
    const rows = candidatesFor(game, { kind: 'target', scope: 'target creature you control' }, player).filter(r => { const c = player.deck.battlefield.find(x => x.instanceId === r.id); return c && c.ownerId === player.playerId && !/\bHuman\b/.test(defOf(game, c)?.typeLine || ''); });
    if (!rows.length && !force) throw new GameError('You need a non-Human creature you own to mutate onto.');
    mutateOnto = ask('mutate', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', targeting: true, source: def.name, title: `${def.name} — mutate`, prompt: 'Choose a non-Human creature you own to mutate onto.', options: rows }));
    mutateUnder = ask('mutate:position', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — mutate`, prompt: 'Put it on top (it uses this card\u2019s name and power/toughness) or underneath?', options: [{ id: 'over', label: 'On top' }, { id: 'under', label: 'Underneath' }] })) === 'under';
  }
  // Strive: "This spell costs {1}{U} more to cast for each target beyond the first."
  const strive = String(def.oracleText || '').match(/Strive — This spell costs ((?:\{[^}]+\})+) more to cast for each target beyond the first/i);
  if (strive && !free) {
    const chosen = new Set(cast.filter(r => ['target', 'multi-target', 'player'].includes(r.kind)).flatMap(r => [].concat(bindings[r.bind] || [])).filter(Boolean));
    if (chosen.size > 1) extraCost += strive[1].repeat(chosen.size - 1);
    if (chosen.size > 1 && !affordable(extraCost)) throw new GameError(`You can't pay ${strive[1]} for each target beyond the first.`);
  }
  // Ward: targeting an opponent's permanent with ward costs extra, or the spell is countered.
  let wardCountered = false;
  for (const [i, w] of wardCosts(game, player, [...Object.values(bindings), attachTo]).entries()) {
    const what = w.cost || `${w.life} life`;
    const pay = ask(`ward:${i}`, () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${w.name} has ward ${what}`,
      prompt: `Pay ${what} more, or ${def.name} will be countered.`,
      options: [{ id: 'pay', label: `Pay ward ${what}`, disabled: !free && !force && (w.cost ? !modeAffordable(game, player, card, def, mode, { tax, extra: extraCost + w.cost }) : Number(player.life || 0) <= lifeForCost + Number(w.life || 0)) }, { id: 'no', label: 'Don\u2019t pay (it is countered)' }]
    }));
    if (pay === 'pay') { if (w.cost) extraCost += w.cost; else lifeForCost += Number(w.life || 0); } else wardCountered = true;
  }

  // Pay: the cost for this way of casting, then escape and delve exile graveyard cards.
  const priced = free ? { cost: extraCost, convoke: [], delve: 0, notes: [] } : modeCost(game, player, card, def, mode.emerge ? { ...mode, cost: adjustGeneric(mode.emerge, -emergeReduction) } : mode, { tax, extra: extraCost });
  let cost = adjustGeneric(priced.cost, xExtra);
  const available = playerManaAvailability(player, game);
  available.__flex = available.__flex.filter(x => x.instanceId !== card.instanceId);
  available.__flex.push(...priced.convoke.filter(x => !available.__flex.some(y => y.instanceId === x.instanceId)));
  const exileFromGraveyard = [];
  const graveRows = () => delveCards(player, card).filter(c => !exileFromGraveyard.includes(c.instanceId))
    .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
  let discardForCost = null;
  if (mode.discard || mode.discardLand) {
    const rows = player.deck.hand.filter(c => !mode.discardLand || isLand(defOf(game, c)))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (!rows.length && !force) throw new GameError(mode.discardLand ? 'You need a land card to discard.' : 'You need a card to discard.');
    if (rows.length) discardForCost = ask('cost:discard', () => ({ playerId: player.playerId, cancellable: true, private: true, kind: 'choose-one', source: def.name, title: `${def.name} — ${mode.label.toLowerCase()}`, prompt: mode.discardLand ? 'Discard a land card.' : 'Discard a card.', options: rows }));
  }
  if (mode.escapeExile) {
    const picked = ask('escape', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-many', source: def.name, title: `${def.name} — escape`, prompt: `Exile ${plural(mode.escapeExile, 'other card')} from your graveyard.`, min: mode.escapeExile, max: mode.escapeExile, options: graveRows() }));
    exileFromGraveyard.push(...picked);
  }
  if (priced.delve && genericOf(cost) > 0) {
    const rows = graveRows();
    const max = Math.min(rows.length, genericOf(cost));
    let min = 0;
    while (min < max && !planMana(available, adjustGeneric(cost, -min), 0, { lifeAvailable: Number(player.life || 0) }).ok) min++;
    if (max > 0) {
      const picked = ask('delve', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-many', source: def.name, title: `${def.name} — delve`, prompt: `Exile cards from your graveyard; each pays {1}.${min ? ` You need at least ${min}.` : ''}`, min, max, options: rows }));
      exileFromGraveyard.push(...picked);
      cost = adjustGeneric(cost, -picked.length);
    }
  }
  const plan = planMana(available, cost, 0, { lifeAvailable: Number(player.life || 0) });
  if (!plan.ok && !force) throw new GameError(plan.reason || 'Not enough mana.');
  let payment = plan.ok ? plan.chosen : null;
  if (plan.ok && parseManaCost(cost).phyrexian?.length && plan.alternatives.length > 1) {
    const pick = ask('phyrexian', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — pay`,
      prompt: 'Phyrexian mana can be paid with mana or 2 life each.',
      options: plan.alternatives.slice(0, 6).map((alt, i) => ({ id: i, label: alt.lifePayment ? `Pay ${alt.lifePayment} life` : 'Pay with mana only' }))
    }));
    payment = plan.alternatives[pick].chosen;
  }

  // Where it goes as it resolves.
  const adventure = !permanent && isAdventure(base) && /Adventure/i.test(def.typeLine || '');
  let to = permanent ? 'battlefield' : 'graveyard';
  if (!permanent && (mode.exileAfter || adventure)) to = 'exile';
  if (!permanent && buyback) to = 'hand';
  // Rebound: cast from hand, it is exiled as it resolves; at your next upkeep you may cast it free from exile.
  const rebound = !permanent && card.zone === 'hand' && /(?:^|\n)\s*Rebound\b/i.test(String(def.oracleText || '')) && to === 'graveyard';
  if (rebound) to = 'exile';
  const fixed = permanent && !faceDown ? [...new Set(tapManaAbilities(def).flatMap(a => a.options))] : [];
  const stackId = newId('stack');
  const where = commander ? ' from the command zone' : card.zone === 'graveyard' ? ' from the graveyard' : card.zone === 'exile' ? ' from exile' : '';
  const shown = faceDown ? 'a face-down creature' : def.name;
  const action = {
    playerId: player.playerId, stackId, activeFaceIndex: faceDown ? null : activeFaceIndex, payment, effects: compiled.effects || [],
    effectBindings: { ...bindings, sourceId: card.instanceId }, asEntersChoices: asEnters, guidedResolution: guided,
    manaCapacityColor: fixed.length === 1 ? fixed[0] : null,
    castMode: free ? 'free' : mode.id, kicked: kickCount > 0, kickCount, faceDown, turnUpCost: mode.turnUpCost || null, megamorph: !!mode.megamorph,
    exileFromGraveyard, discardForCost: discardForCost || addDiscard, sacrificeForCost, lifeForCost, exileFromHandForCost, exileOnLeave: !!mode.exileAfter, adventure,
    offspring, squadCount, bargained: !!bargainId, disturbed: mode.id === 'disturb',
    bestowed: mode.id === 'bestow',
    prototype: mode.prototype ? { ...mode.prototype, manaValue: Object.entries(parseManaCost(mode.prototype.cost)).reduce((n, [k, v]) => n + (k === 'generic' ? Number(v) : ['W', 'U', 'B', 'R', 'G', 'C'].includes(k) ? Number(v) : 0), 0), colors: [...new Set((mode.prototype.cost.match(/\{([WUBRG])\}/g) || []).map(x => x[1]))] } : null,
    label: `${player.displayName} casts ${shown}${where}${tag ? ` (${tag})` : ''}${free ? ' without paying its mana cost' : ''}${bindings.X !== undefined ? ` with X = ${bindings.X}` : ''}.`
  };
  if (commander) commit(game, { ...action, type: 'cast-commander', commanderId: commander.id });
  else commit(game, { ...action, type: 'cast-spell', instanceId: card.instanceId, fromZones: [zoneKeyOf(card)], to });
  const top = (game.stack || []).find(x => x.id === stackId);
  if (top) {
    top.name = faceDown ? 'Face-down creature' : def.name;
    top.label = top.name;
    top.text = faceDown ? '' : castDef.oracleText || '';
    top.resolveReqs = resolve;
    top.castReqs = cast;
    top.wardCountered = wardCountered;
    top.search = search;
    top.optional = optional;
    top.attachTo = attachTo;
    if (mutateOnto) { top.mutateOnto = mutateOnto; top.mutateUnder = mutateUnder; }
    top.reanimate = reanimate;
    top.entersTapped = permanent && !faceDown && /enters(?: the battlefield)? tapped/i.test(def.oracleText || '')
      ? entersBattlefieldTapped({ definition: def, battlefield: player.deck.battlefield, definitions: game.cardDefinitions }) : false;
  }
  announceTargets(game, player, cast, bindings, card.instanceId, 'spell');
  if (rebound) game.delayedTriggers = [...(game.delayedTriggers || []), { id: newId('delayed'), controllerId: player.playerId, ownerId: player.playerId, when: { event: 'upkeep', whose: 'owner', afterTurn: game.turnNumber }, effects: [{ kind: 'request-special', special: 'rebound' }], requirements: [], sourceId: card.instanceId, sourceDefinitionId: card.definitionId, sourceName: def.name }];
  if (attachTo && !reanimate) announceTargets(game, player, [{ kind: 'target', bind: '__aura' }], { __aura: attachTo }, card.instanceId, 'spell');
  // Cast triggers of the spell itself (cascade, storm).
  if (!faceDown) for (const t of castTriggers(game, player, card, def)) queueSpecialTrigger(game, player, card, def, t, stackId);
  // Replicate and casualty: "When you cast this spell, copy it (for each time you paid its replicate cost)."
  const copies = Number(replicateCount || 0) + (casualtyId ? 1 : 0);
  if (copies) {
    game.pendingTriggers = game.pendingTriggers || [];
    game.pendingTriggers.push({ id: newId('trigger'), controllerId: player.playerId, sourceId: card.instanceId, sourceDefinitionId: card.definitionId, sourceName: def.name,
      abilityId: 'cast-trigger', abilityText: `${replicateCount ? 'Replicate' : 'Casualty'} — copy ${def.name}${copies > 1 ? ` ${copies} times` : ''}. You may choose new targets for the copies.`, effectText: '', special: null, modal: null,
      compiled: { supported: true, requirements: [], unsupported: [], effects: [{ kind: 'copy-stack', stackId, soft: true, times: copies, retarget: true }] },
      event: { type: 'spell-cast', stackId, controllerId: player.playerId, playerId: player.playerId, sourceId: card.instanceId }, createdAt: new Date().toISOString() });
  }
}

/** Opponents' permanents with a ward mana cost among the chosen targets. */
function wardCosts(game, player, ids) {
  const out = [];
  for (const id of new Set(ids.flat().filter(x => typeof x === 'string'))) {
    for (const p of game.players) {
      if (p.playerId === player.playerId) continue;
      const c = (p.deck?.battlefield || []).find(x => x.instanceId === id);
      const text = String(defOf(game, c)?.oracleText || '').replace(/\([^()]*\)/g, '');
      const m = c && text.match(/(?:^|\n|,\s*)Ward\s*(?:[—-]\s*)?((?:\{[^}]+\})+)/i);
      const life = c && text.match(/(?:^|\n|,\s*)Ward\s*[—-]\s*Pay (\d+) life/i);
      if (m) out.push({ id, name: defOf(game, c)?.name || 'It', cost: m[1] });
      else if (life) out.push({ id, name: defOf(game, c)?.name || 'It', cost: '', life: Number(life[1]) });
    }
  }
  return out;
}

/** Can this way of casting (plus an extra cost) be paid right now? */
function modeAffordable(game, player, card, def, mode, { tax = 0, extra = '' } = {}) {
  const priced = modeCost(game, player, card, def, mode, { tax, extra });
  const cost = adjustGeneric(priced.cost, -Math.min(priced.delve, genericOf(priced.cost)));
  const available = playerManaAvailability(player, game);
  available.__flex = available.__flex.filter(x => x.instanceId !== card.instanceId);
  available.__flex.push(...priced.convoke);
  return planMana(available, cost, 0, { lifeAvailable: Number(player.life || 0) }).ok;
}

/** A keyword trigger that the game resolves with choices (cascade, storm, discover …). */
export function queueSpecialTrigger(game, player, card, def, t, stackId = null) {
  game.pendingTriggers = game.pendingTriggers || [];
  if (!t.special && t.effect) {
    game.pendingTriggers.push({ id: newId('trigger'), controllerId: player.playerId, sourceId: card?.instanceId || null, sourceDefinitionId: card?.definitionId || null, sourceName: def?.name || 'Spell',
      abilityId: 'cast-trigger', abilityText: t.text, effectText: t.effect, special: null, modal: null, compiled: compileEffectText(t.effect, { sourceName: def?.name || 'Spell' }), event: { type: 'spell-cast', stackId, controllerId: player.playerId, playerId: player.playerId, sourceId: card?.instanceId }, createdAt: new Date().toISOString() });
    return;
  }
  game.pendingTriggers.push({
    id: newId('trigger'), controllerId: player.playerId, sourceId: card?.instanceId || null, sourceDefinitionId: card?.definitionId || null,
    sourceName: def?.name || t.label, abilityId: `special-${t.special}`, abilityText: t.text, effectText: t.text, special: t.special, amount: t.amount ?? null,
    spellStackId: stackId, manaValue: Number(def?.manaValue ?? def?.cmc ?? 0), stormCount: t.special === 'storm' ? Math.max(0, Number(game.spellsCastThisTurn || 1) - 1) : null,
    modal: null, compiled: { supported: true, effects: [], requirements: [], unsupported: [] }, event: null, createdAt: new Date().toISOString()
  });
}

// ---------------------------------------------------------------------------------------------
// Activate an ability

function runActivate(game, op, ask) {
  const player = playerById(game, op.playerId);
  const hit = findInPlayer(player, op.args.instanceId);
  if (!hit) throw new GameError('That card is no longer available.');
  const card = hit.card, def = defOf(game, card), force = !!op.args.force;
  if (String(op.args.abilityId || '').startsWith('special:')) return runSpecialAction(game, op, ask, player, card, def, force);
  const ability = parseActivatedAbilities(def).find(a => a.id === op.args.abilityId);
  if (!ability) throw new GameError('That ability is not available.');
  const base = { playerId: player.playerId, cancellable: true, source: def.name };

  const fromZone = !ability.manaAbility && hit.zone !== 'battlefield' && abilityZone(ability) === hit.zone ? hit.zone : null;
  if (hit.zone === 'hand' && !fromZone) {
    if (!ability.manaAbility) throw new GameError('That ability cannot be used from your hand.');
    const options = [...new Set(ability.manaOptions || [])];
    const color = options.length > 1 ? ask('mana', () => ({ ...base, kind: 'choose-one', title: `${def.name} — mana`, prompt: 'Choose the mana to add.', options: options.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) })) : (options[0] || 'C');
    commit(game, { type: 'activate-zone-mana-ability', playerId: player.playerId, instanceId: card.instanceId, fromZone: 'hand', toZone: 'exile', manaColor: color, manaAmount: manaAmountForAbility(ability), label: `${player.displayName} exiles ${def.name} from hand for mana.` });
    return;
  }
  if (hit.zone !== 'battlefield' && !fromZone) throw new GameError('That permanent is no longer on the battlefield.');
  if (!fromZone && abilityZone(ability) !== 'battlefield') throw new GameError(abilityZone(ability) === 'hand' ? 'That ability works only from your hand.' : 'That ability works only from your graveyard.');
  const legality = fromZone ? { legal: true, reasons: [] } : validateActivatedAbilityFull({ game, player, instance: card, definition: def, ability, definitions: definitionsMap(game) });
  if (!legality.legal && !force) throw new GameError(legality.reasons[0], legality.reasons);
  if (ability.loyaltyDelta !== null && !force) {
    if (card.loyaltyUsedTurn === game.turnNumber) throw new GameError('A planeswalker can use only one loyalty ability each turn.');
    if (game.activePlayerId !== player.playerId || !['precombat-main', 'postcombat-main'].includes(game.phase) || (game.stack || []).length) throw new GameError('Loyalty abilities can be used only during your main phase while the stack is empty.');
  }

  const restricted = activationBlock(game, player, card, ability);
  if (restricted && !force) throw new GameError(restricted);
  if (/Activate only once each turn|only once each turn|^Boast\b/i.test(ability.text)) card.activatedTurn = { ...(card.activatedTurn || {}), [ability.id]: game.turnNumber };
  if (/Activate only as a sorcery/i.test(ability.text) && !force
    && (game.activePlayerId !== player.playerId || !['precombat-main', 'postcombat-main'].includes(game.phase) || (game.stack || []).length)) {
    throw new GameError('This ability can be used only during your main phase while the stack is empty.');
  }

  let effectText = ability.effect;
  if (ability.modes.length) {
    const max = ability.modeCount === 'two' ? 2 : ability.modeCount === 'three' ? 3 : ability.modeCount === 'one or more' ? ability.modes.length : 1;
    const min = ability.modeCount === 'one or more' ? 1 : max;
    const picked = ask('modes', () => ({ ...base, kind: 'choose-many', title: `${def.name} — choose`, prompt: 'Choose the mode to use.', min, max, options: ability.modes.map((text, i) => ({ id: i, label: text })) }));
    effectText = picked.map(i => ability.modes[i]).join('\n');
  }
  const bindings = { sourceId: card.instanceId };
  const xInCost = /\{X\}/i.test(ability.cost);
  if (ability.hasX) bindings.X = ask('x', () => ({ ...base, kind: 'number', title: `${def.name} — choose X`, prompt: 'Choose the value of X.', min: 0, max: 99 }));

  const costMoveIds = [];
  if (fromZone === 'hand' && /\bDiscard this card\b/i.test(ability.cost || '')) costMoveIds.push(card.instanceId);   // Channel: "Discard this card" is the cost
  if (ability.sacrificeRequirement && !ability.sacrificesSelf) {
    const type = ability.sacrificeRequirement;
    const rows = player.deck.battlefield.filter(c => c.instanceId !== card.instanceId && new RegExp(`\\b${type === 'permanent' ? '' : type}`, 'i').test(defOf(game, c)?.typeLine || ''));
    if (!rows.length) throw new GameError(`You have no ${type.toLowerCase()} to sacrifice.`);
    const sacrificedId = ask('cost:sacrifice', () => ({ ...base, kind: 'choose-one', title: `${def.name} — pay cost`, prompt: `Choose a ${type.toLowerCase()} to sacrifice.`, options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })) }));
    // "the sacrificed creature's power" (Greater Good, Altar of Dementia, Ayli): remembered before it leaves.
    const sac = rows.find(c => c.instanceId === sacrificedId);
    if (sac) { bindings.sacrificedPower = Math.max(0, effectivePower(sac, defOf(game, sac), game)); bindings.sacrificedToughness = Math.max(0, Number(defOf(game, sac)?.toughness || 0) + Number(sac.counters?.['+1/+1'] || 0) - Number(sac.counters?.['-1/-1'] || 0)); bindings.sacrificedManaValue = Number(defOf(game, sac)?.manaValue ?? defOf(game, sac)?.cmc ?? 0); }
    costMoveIds.push(sacrificedId);
  }
  // "Exile a creature you control" as part of the cost (The Soul Stone).
  const costExileIds = [];
  const exCost = String(ability.cost || '').match(/Exile (?:a|an|another) ([a-z ]+?) you control/i);
  if (exCost) {
    const words = exCost[1].toLowerCase();
    const rows = player.deck.battlefield.filter(c => c.instanceId !== card.instanceId && cardFitsWords(defOf(game, c), words));
    if (!rows.length && !force) throw new GameError(`You need a ${words} to exile.`);
    if (rows.length) costExileIds.push(ask('cost:exile', () => ({ ...base, kind: 'choose-one', title: `${def.name} — pay cost`, prompt: `Choose a ${words} to exile.`, options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })) })));
  }
  // Forage: "exile three cards from your graveyard or sacrifice a Food" (the player chooses which, and which cards).
  if (/\bForage\b/i.test(ability.cost || '')) {
    const gy = player.deck.graveyard || [], foods = player.deck.battlefield.filter(c => /\bFood\b/.test(defOf(game, c)?.typeLine || ''));
    const opts = [...(gy.length >= 3 ? [{ id: 'exile', label: 'Exile three cards from your graveyard' }] : []), ...foods.map(c => ({ id: c.instanceId, label: `Sacrifice ${defOf(game, c)?.name || 'a Food'}` }))];
    if (!opts.length && !force) throw new GameError('To forage, exile three cards from your graveyard or sacrifice a Food: you have neither.');
    if (opts.length) {
      const how = opts.length === 1 ? opts[0].id : ask('cost:forage', () => ({ ...base, kind: 'choose-one', title: `${def.name} — forage`, prompt: 'Exile three cards from your graveyard, or sacrifice a Food?', options: opts }));
      if (how === 'exile') {
        const picked = ask('cost:forage-exile', () => ({ ...base, kind: 'choose-many', title: `${def.name} — forage`, prompt: 'Choose three cards in your graveyard to exile.', min: 3, max: 3, options: gy.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card' })) }));
        costExileIds.push(...(picked || []).slice(0, 3));
      } else costMoveIds.push(how);
    }
  }
  if (ability.discardCount && fromZone !== 'hand') {
    const rows = player.deck.hand;
    if (!rows.length) throw new GameError('You have no card to discard.');
    costMoveIds.push(ask('cost:discard', () => ({ ...base, kind: 'choose-one', private: true, title: `${def.name} — pay cost`, prompt: 'Choose a card to discard.', options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: 'Your hand', instanceId: c.instanceId, definitionId: c.definitionId })) })));
  }

  const manaText = adjustGeneric((ability.cost.match(/\{(?:\d+|X|[WUBRGC](?:\/[WUBRGC])?(?:\/P)?|2\/[WUBRG])\}/gi) || []).join(''), -activationReduction(game, player, ability));
  // Throne of Eldraine: "Spend only mana of the chosen color to activate this ability."
  const onlyColor = /Spend only mana of the chosen color to activate this ability/i.test(ability.text || '') ? card.chosenColor : null;
  const pool = playerManaAvailability(player, game);
  if (onlyColor) { for (const c of ['W', 'U', 'B', 'R', 'G', 'C']) if (c !== onlyColor) pool[c] = 0; pool.__flex = (pool.__flex || []).filter(f => f.options.includes(onlyColor)).map(f => ({ ...f, options: [onlyColor] })); }
  const plan = planMana(pool, manaText, xInCost ? Number(bindings.X || 0) : 0, { lifeAvailable: Math.max(0, Number(player.life || 0) - Number(ability.lifeCost || 0)) });
  if (!plan.ok && !force) throw new GameError(plan.reason || 'The cost cannot be paid.');
  const common = {
    playerId: player.playerId, instanceId: card.instanceId, requiresTap: ability.requiresTap && !(force && card.tapped), requiresUntap: ability.requiresUntap,
    sacrificeSelf: ability.sacrificesSelf, costMoveIds, costExileIds, payment: plan.ok ? plan.chosen : null, lifeCost: ability.lifeCost, energyCost: ability.energyCost, fromZone
  };
  const short = ability.text.length > 90 ? `${ability.text.slice(0, 88)}…` : ability.text;

  // "For each color among permanents you control, add one mana of that color." (Bloom Tender, Faeburrow Elder)
  if (ability.manaAbility && /For each color among permanents you control, add one mana of that color/i.test(ability.effect || '')) {
    const mix = ['W', 'U', 'B', 'R', 'G'].filter(c => player.deck.battlefield.some(p => (defOf(game, p)?.colors || []).includes(c)));
    if (!mix.length && !force) throw new GameError('You control no coloured permanent, so this adds no mana.');
    commit(game, { ...common, type: 'activate-ability', manaColor: mix[0] || null, manaMix: mix, manaAmount: mix.length, label: `${player.displayName} taps ${def.name} for ${mix.map(c => `{${c}}`).join('') || 'no mana'}.` });
    return;
  }
  // "Add {W}{U}." — two different colours from one ability (Signets): both are added.
  const fixedMix = ability.manaAbility && !/\bor\b|any|chosen|for each|equal|X\b/i.test(ability.effect || '') ? [...String(ability.effect || '').matchAll(/\{([WUBRGC])\}/g)].map(x => x[1]) : [];
  if (fixedMix.length > 1 && new Set(fixedMix).size > 1) {
    commit(game, { ...common, type: 'activate-ability', manaColor: fixedMix[0], manaMix: fixedMix, manaAmount: fixedMix.length, label: `${player.displayName} taps ${def.name} for ${fixedMix.map(c => `{${c}}`).join('')}.` });
    return;
  }
  if (ability.manaAbility) {
    const options = manaOptionsForAbility(game, player, card, ability);
    if (!options.length) throw new GameError('This ability cannot make any mana right now.');
    let color = op.args.color && options.includes(op.args.color) ? op.args.color : null;
    if (!color) color = options.length === 1 ? options[0] : ask('mana', () => ({ ...base, kind: 'choose-one', title: `${def.name} — mana`, prompt: 'Choose the mana to add.', options: options.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) }));
    const baseAmount = manaAmountForAbility(ability, { game, player, card, color });
    const ex = ability.requiresTap ? manaExtras(game, card, color, baseAmount) : { amount: baseAmount, fixed: [], any: 0 };   // Mana Reflection, Wild Growth …
    const amount = ex.amount;
    if (ex.fixed.length || ex.any) {
      // Extra mana of another colour (Utopia Sprawl, Wild Growth on an Island) or of any colour (Fertile Ground: the player picks).
      const anyPicks = Array.from({ length: ex.any }, (_, k) => ask(`mana-extra:${k}`, () => ({ ...base, kind: 'choose-one', title: `${def.name} — extra mana`, prompt: ex.any > 1 ? `Choose the colour of extra mana ${k + 1} of ${ex.any}.` : 'Choose the colour of the extra mana.', options: ANY_COLORS.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) })));
      const mix = [...Array(amount).fill(color), ...ex.fixed, ...anyPicks];
      commit(game, { ...common, type: 'activate-ability', manaColor: color, manaMix: mix, manaAmount: mix.length, label: `${player.displayName} taps ${def.name} for ${mix.map(c => `{${c}}`).join('')}.` });
      return;
    }
    commit(game, { ...common, type: 'activate-ability', manaColor: color, manaAmount: amount, label: `${player.displayName} taps ${def.name} for ${amount > 1 ? `${amount} ` : ''}${COLOR_NAMES[color].toLowerCase()} mana.` });
    return;
  }

  let compiled = { effects: [], requirements: [] }, guided = null, search = null, optional = false;
  // A search that is only part of the ability (Sword of Hearth and Home: exile, then search) runs as compiled effects.
  const whole = /search your library/i.test(effectText) && !/^(?:you may )?search your library/i.test(effectText) ? compileFor(effectText, def.name) : null;
  if (whole?.compiled.supported) { compiled = whole.compiled; optional = whole.optional; }
  else if (/search your library/i.test(effectText)) {
    search = librarySearchSpec(effectText);
    if (!search) guided = guidedSpec(`${def.name} — resolve by hand`, effectText, [effectText]);
  } else {
    const result = compileFor(effectText, def.name);
    if (result.compiled.supported) { compiled = result.compiled; optional = result.optional; }
    else guided = guidedSpec(`${def.name} — resolve by hand`, effectText, result.compiled.unsupported);
  }
  const { cast, resolve } = splitRequirements((compiled.requirements || []).filter(r => !(r.kind === 'number' && r.bind === 'X' && bindings.X !== undefined)));
  if (guided) guided.targets = guidedTargets(game, player, def, effectText, bindings, ask);
  try {
    gatherRequirements(game, { player, sourceName: def.name, source: sourceOf(def) }, cast, bindings, ask, 'cast');
  } catch (error) {
    if (error instanceof NoLegalChoice) throw new GameError(error.message);
    throw error;
  }
  // Ward: targeting an opponent's permanent with ward, pay the ward cost too or the ability is countered.
  const wards = wardCosts(game, player, Object.values(bindings));
  const wardPay = [];
  let abilityWardCountered = false;
  for (const [i, w] of wards.entries()) {
    const wplan = w.cost ? planMana(playerManaAvailability(player, game), wardPay.map(x => x.cost).join('') + w.cost, 0, { lifeAvailable: 0 }) : null;
    const can = w.cost ? wplan.ok : Number(player.life || 0) > Number(w.life || 0);
    const what = w.cost || `${w.life} life`;
    const pay = ask(`ward:${i}`, () => ({ ...base, kind: 'choose-one', title: `${w.name} has ward ${what}`, prompt: `Pay ${what} more, or the ability will be countered.`,
      options: [{ id: 'pay', label: `Pay ward ${what}`, disabled: !can && !force }, { id: 'no', label: 'Don\u2019t pay (it is countered)' }] }));
    if (pay === 'pay') wardPay.push(w); else abilityWardCountered = true;
  }
  const stackId = newId('stack');
  commit(game, { ...common, type: 'activate-ability-stack', stackId, effects: compiled.effects, effectBindings: bindings, guidedResolution: guided, label: `${player.displayName} activates ${def.name}: ${short}` });
  for (const w of wardPay) {
    if (w.cost) { const wp = planMana(playerManaAvailability(player, game), w.cost, 0, { lifeAvailable: 0 }); if (wp.ok) commit(game, { type: 'pay-mana', playerId: player.playerId, payment: wp.chosen, label: `${player.displayName} pays ward ${w.cost}.` }); }
    else commit(game, { type: 'pay-mana', playerId: player.playerId, payment: {}, lifeCost: Number(w.life || 0), label: `${player.displayName} pays ward (${w.life} life).` });
  }
  announceTargets(game, player, cast, bindings, card.instanceId, 'ability');
  const live = findInPlayer(player, card.instanceId);
  if (ability.loyaltyDelta !== null && live?.zone === 'battlefield') {
    live.card.counters = live.card.counters || {};
    live.card.counters.loyalty = Math.max(0, Number(live.card.counters.loyalty || 0) + ability.loyaltyDelta);
    live.card.loyaltyUsedTurn = game.turnNumber;
  }
  const top = (game.stack || []).find(x => x.id === stackId);
  if (top) { top.name = def.name; top.label = `${def.name} ability`; top.text = ability.text; top.resolveReqs = resolve; top.castReqs = cast; top.search = search; top.optional = optional; top.wardCountered = abilityWardCountered; }
}

/** Cycling, typecycling, foretell, ninjutsu, turn face up. */
function runSpecialAction(game, op, ask, player, card, def, force) {
  const row = specialRows(game, player, card, { running: true }).find(r => r.ability.id === op.args.abilityId);
  if (!row) throw new GameError('That action is not available.');
  if (!row.legal && !force) throw new GameError(row.reasons[0] || 'That action is not available right now.', row.reasons);
  const kind = row.ability.special;
  const plan = planMana(playerManaAvailability(player, game), row.ability.cost, 0, { lifeAvailable: Number(player.life || 0) });
  if (!plan.ok && !force) throw new GameError(plan.reason || 'Not enough mana.');
  const payment = plan.ok ? plan.chosen : null;
  const base = { playerId: player.playerId, cancellable: true, source: def.name };
  if (kind === 'transmute') {
    // Transmute: discard it (a cost) to search for a card with the same mana value. Only as a sorcery.
    const mv = Number(def.manaValue ?? def.cmc ?? 0);
    const search = { ...librarySearchSpec('Search your library for a card, reveal it, put it into your hand, then shuffle.'), manaValue: mv, label: `card with mana value ${mv}` };
    const stack = { id: newId('stack'), label: `${def.name} — transmute`, text: `Transmute: search for a card with mana value ${mv}.`, effects: [], search };
    commit(game, { type: 'special-action', kind: 'cycle', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} transmutes ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.search = search; top.resolveReqs = []; }
    return;
  }
  if (kind === 'cycling' || kind.startsWith('typecycling:')) {
    const typed = kind.startsWith('typecycling:') ? kind.slice(12) : null;
    let stack;
    if (typed) {
      const word = typed.replace(/cycling$/i, '').trim();
      const search = librarySearchSpec(`Search your library for a ${/^land$/i.test(word) ? 'land' : word} card, reveal it, put it into your hand, then shuffle.`);
      stack = { id: newId('stack'), label: `${def.name} — ${typed}`, text: `${typed}: search for a ${word} card.`, effects: [], search };
    } else {
      stack = { id: newId('stack'), label: `${def.name} — cycling`, text: 'Draw a card.', effects: compileEffectText('Draw a card.', { sourceName: def.name }).effects };
    }
    commit(game, { type: 'special-action', kind: 'cycle', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} cycles ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.search = stack.search || null; top.resolveReqs = []; }
    return;
  }
  if (kind.startsWith('reinforce:')) {
    const n = Number(kind.slice(10)) || 0;
    const rows = candidatesFor(game, { kind: 'target', scope: 'target creature' }, player);
    if (!rows.length && !force) throw new GameError('There is no creature to put the counters on.');
    const target = ask('reinforce', () => ({ ...base, kind: 'choose-one', targeting: true, title: `${def.name} — reinforce`, prompt: `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on target creature.`, options: rows }));
    const stack = { id: newId('stack'), label: `${def.name} — reinforce`, text: `Put ${n} +1/+1 counters on target creature.`, effects: [{ kind: 'counter', targetId: target, counter: '+1/+1', amount: n }] };
    commit(game, { type: 'special-action', kind: 'reinforce', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} reinforces with ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind.startsWith('suspend:')) {
    const n = Number(kind.slice(8)) || 0;
    commit(game, { type: 'special-action', kind: 'suspend', time: n, playerId: player.playerId, instanceId: card.instanceId, payment, label: `${player.displayName} suspends ${def.name} with ${n} time counter${n === 1 ? '' : 's'}.` });
    return;
  }
  if (kind === 'level-up') {
    const stack = { id: newId('stack'), label: `${def.name} — level up`, text: 'Put a level counter on this.', effects: [{ kind: 'counter', bind: 'sourceId', counter: 'level', amount: 1 }] };
    commit(game, { type: 'special-action', kind: 'level-up', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} levels up ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'craft') {
    const spec = craftSpec(String(def.oracleText || ''));
    const rows = craftMaterials(game, player, card, spec).map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: c.zone === 'graveyard' ? 'Your graveyard' : 'Battlefield', instanceId: c.instanceId, definitionId: c.definitionId }));
    const picked = [].concat(ask('craft', () => ({ ...base, kind: 'choose-many', title: `${def.name} — craft`, prompt: `Exile ${spec.max === 99 ? `${spec.min} or more` : spec.min} ${spec.noun}${spec.min === 1 && spec.max === 1 ? '' : 's'} (other permanents you control or cards in your graveyard).`, options: rows, min: Math.min(spec.min, rows.length), max: Math.min(spec.max, rows.length) })) || []);
    if (picked.length < spec.min && !force) throw new GameError(`Craft needs ${spec.min} ${spec.noun}${spec.min === 1 ? '' : 's'}.`);
    const stack = { id: newId('stack'), label: `${def.name} — craft`, text: 'Return this card transformed under its owner\'s control.', effects: [{ kind: 'craft-return', targetId: card.instanceId }] };
    commit(game, { type: 'special-action', kind: 'craft', playerId: player.playerId, instanceId: card.instanceId, materialIds: picked, payment, stack, label: `${player.displayName} crafts ${def.name} with ${picked.map(id => defOf(game, rows.find(r => r.id === id))?.name || rows.find(r => r.id === id)?.label).join(', ')}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'embalm' || kind === 'eternalize') {
    const stack = { id: newId('stack'), label: `${def.name} — ${kind}`, text: kind === 'embalm' ? 'Create a token that\'s a copy of it, except it\'s a white Zombie with no mana cost.' : 'Create a token that\'s a copy of it, except it\'s a 4/4 black Zombie with no mana cost.', effects: [{ kind: 'embalm-token', targetId: card.instanceId, eternalize: kind === 'eternalize' }] };
    commit(game, { type: 'special-action', kind: 'scavenge', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} ${kind === 'embalm' ? 'embalms' : 'eternalizes'} ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'reconfigure' || kind === 'unconfigure') {
    let effects;
    if (kind === 'reconfigure') {
      const rows = candidatesFor(game, { kind: 'target', scope: 'target creature you control' }, player).filter(r => r.id !== card.instanceId);
      if (!rows.length && !force) throw new GameError('You control no other creature.');
      const target = ask('reconfigure', () => ({ ...base, kind: 'choose-one', targeting: true, title: `${def.name} — reconfigure`, prompt: 'Attach it to target creature you control.', options: rows }));
      effects = [{ kind: 'attach', equipmentId: card.instanceId, creatureId: target }];
    } else effects = [{ kind: 'unattach-self' }];
    const stack = { id: newId('stack'), label: `${def.name} — reconfigure`, text: kind === 'reconfigure' ? 'Attach to target creature you control.' : 'Unattach it.', effects };
    commit(game, { type: 'special-action', kind: 'scavenge-free', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} reconfigures ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'outlast') {
    const stack = { id: newId('stack'), label: `${def.name} — outlast`, text: 'Put a +1/+1 counter on this creature.', effects: [{ kind: 'counter', targetId: card.instanceId, counter: '+1/+1', amount: 1 }] };
    commit(game, { type: 'special-action', kind: 'outlast', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} uses outlast on ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'unearth') {
    const stack = { id: newId('stack'), label: `${def.name} — unearth`, text: 'Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield.',
      effects: [{ kind: 'return-self-graveyard' }, { kind: 'grant-keyword', bind: 'sourceId', keyword: 'Haste', enabled: true, expires: null }, { kind: 'unearth-mark' }] };
    commit(game, { type: 'special-action', kind: 'unearth', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} unearths ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'encore') {
    const stack = { id: newId('stack'), label: `${def.name} — encore`, text: 'For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step.', effects: [{ kind: 'encore' }] };
    commit(game, { type: 'special-action', kind: 'scavenge', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} uses encore on ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'scavenge') {
    const n = Math.max(0, Number(String(def.power || '0').replace(/[^0-9-]/g, '') || 0));
    const rows = candidatesFor(game, { kind: 'target', scope: 'target creature' }, player);
    if (!rows.length && !force) throw new GameError('There is no creature to put the counters on.');
    const target = ask('scavenge', () => ({ ...base, kind: 'choose-one', targeting: true, title: `${def.name} — scavenge`, prompt: `Put ${n} +1/+1 counter${n === 1 ? '' : 's'} on target creature.`, options: rows }));
    const stack = { id: newId('stack'), label: `${def.name} — scavenge`, text: `Put ${n} +1/+1 counters on target creature.`, effects: [{ kind: 'counter', targetId: target, counter: '+1/+1', amount: n }] };
    commit(game, { type: 'special-action', kind: 'scavenge', playerId: player.playerId, instanceId: card.instanceId, payment, stack, label: `${player.displayName} scavenges ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'saddle') {
    const need = Number((row.ability.text.match(/Saddle (\d+)/i) || [])[1] || 0);
    const rows = player.deck.battlefield.filter(c => c.instanceId !== card.instanceId && !c.tapped && /\bCreature\b/i.test(defOf(game, c)?.typeLine || ''))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Creature', sub: `power ${effectivePower(c, defOf(game, c), game)}`, instanceId: c.instanceId, definitionId: c.definitionId }));
    const picked = ask('saddle', () => ({ ...base, kind: 'choose-many', title: `${def.name} — saddle ${need}`, prompt: `Tap untapped creatures you control with total power ${need} or more.`, options: rows, min: 1, max: rows.length }));
    const total = picked.reduce((n, id) => { const c = player.deck.battlefield.find(x => x.instanceId === id); return n + (c ? Math.max(0, effectivePower(c, defOf(game, c), game)) : 0); }, 0);
    if (total < need && !force) throw new GameError(`Those creatures have total power ${total}; saddle ${need} needs ${need}.`);
    const stack = { id: newId('stack'), label: `${def.name} — saddle`, text: `${def.name} becomes saddled until end of turn.`, effects: [{ kind: 'become-saddled', ids: picked }] };
    commit(game, { type: 'special-action', kind: 'crew', saddle: true, playerId: player.playerId, instanceId: card.instanceId, crewIds: picked, payment: null, stack, label: `${player.displayName} saddles ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'crew') {
    const need = Number((row.ability.text.match(/Crew (\d+)/i) || [])[1] || 0);
    const rows = player.deck.battlefield.filter(c => c.instanceId !== card.instanceId && !c.tapped && /\bCreature\b/i.test(defOf(game, c)?.typeLine || ''))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Creature', sub: `power ${effectivePower(c, defOf(game, c), game)}`, instanceId: c.instanceId, definitionId: c.definitionId }));
    const picked = ask('crew', () => ({ ...base, kind: 'choose-many', title: `${def.name} — crew ${need}`, prompt: `Tap untapped creatures you control with total power ${need} or more.`, options: rows, min: 1, max: rows.length }));
    const total = picked.reduce((n, id) => { const c = player.deck.battlefield.find(x => x.instanceId === id); return n + (c ? Math.max(0, effectivePower(c, defOf(game, c), game)) : 0); }, 0);
    if (total < need && !force) throw new GameError(`Those creatures have total power ${total}; crew ${need} needs ${need}.`);
    const stack = { id: newId('stack'), label: `${def.name} — crew`, text: `${def.name} becomes an artifact creature until end of turn.`, effects: [{ kind: 'animate', bind: 'sourceId', addTypes: ['Artifact', 'Creature'], subtypes: [], keywords: [], colors: null, power: null, toughness: null, expires: 'cleanup' }] };
    commit(game, { type: 'special-action', kind: 'crew', playerId: player.playerId, instanceId: card.instanceId, crewIds: picked, payment: null, stack, label: `${player.displayName} crews ${def.name}.` });
    const top = (game.stack || []).find(x => x.id === stack.id);
    if (top) { top.name = def.name; top.text = stack.text; top.resolveReqs = []; }
    return;
  }
  if (kind === 'plot') {
    commit(game, { type: 'special-action', kind: 'plot', playerId: player.playerId, instanceId: card.instanceId, payment, label: `${player.displayName} plots ${def.name}.` });
    return;
  }
  if (kind === 'foretell') {
    commit(game, { type: 'special-action', kind: 'foretell', playerId: player.playerId, instanceId: card.instanceId, payment, label: `${player.displayName} foretells a card.` });
    return;
  }
  if (kind === 'turn-face-up') {
    commit(game, { type: 'special-action', kind: 'turn-face-up', playerId: player.playerId, instanceId: card.instanceId, payment, label: `${player.displayName} turns ${game.cardDefinitions[card.realDefinitionId]?.name || 'a creature'} face up.` });
    return;
  }
  if (kind === 'ninjutsu') {
    const cs = game.combatState;
    const blocked = new Set(Object.values(cs?.blocks || {}).flatMap(b => (b.assignments || []).map(a => a.attackerId)));
    const rows = (cs?.attackers || []).filter(a => a.playerId === player.playerId && !blocked.has(a.instanceId))
      .map(a => { const c = player.deck.battlefield.find(x => x.instanceId === a.instanceId); return c && { id: c.instanceId, label: defOf(game, c)?.name || 'Creature', sub: `attacking ${playerById(game, a.defenderId)?.displayName || ''}`, instanceId: c.instanceId, definitionId: c.definitionId }; }).filter(Boolean);
    if (!rows.length) throw new GameError('You have no unblocked attacker.');
    const back = ask('ninjutsu', () => ({ ...base, kind: 'choose-one', title: `${def.name} — ninjutsu`, prompt: 'Return an unblocked attacker to your hand.', options: rows }));
    commit(game, { type: 'special-action', kind: 'ninjutsu', playerId: player.playerId, instanceId: card.instanceId, returnId: back, payment, label: `${player.displayName} uses ninjutsu: ${def.name} enters tapped and attacking.` });
    return;
  }
  throw new GameError('That action is not available.');
}

// ---------------------------------------------------------------------------------------------
// Put the next waiting triggered ability on the stack

function runTrigger(game, op, ask) {
  const trigger = (game.pendingTriggers || []).find(t => t.id === op.args.triggerId);
  if (!trigger) return;
  const drop = () => { game.pendingTriggers = game.pendingTriggers.filter(t => t.id !== trigger.id); };
  const player = playerById(game, trigger.controllerId);
  if (!player || player.eliminated) return drop();
  const name = trigger.sourceName || 'Triggered ability';
  const base = { playerId: player.playerId, cancellable: false, source: name };
  const spec = trigger.special ? { special: trigger.special, amount: trigger.amount } : specialFromText(trigger.effectText);
  if (spec) { drop(); stackSpecial(game, player, trigger, spec); return; }
  let compiled = trigger.compiled, text = trigger.abilityText || trigger.effectText || '', optional = false, modeIndex = null;

  if (trigger.modal?.modes?.length) {
    const source = findInPlayer(player, trigger.sourceId)?.card || null;
    const modes = availableModalTriggerModes(source, trigger, game.turnNumber).modes;
    if (!modes.length) { log(game, `${name} triggers, but every mode has already been chosen this turn.`); return drop(); }
    modeIndex = ask('mode', () => ({ ...base, kind: 'choose-one', title: `${name} — triggered ability`, prompt: trigger.abilityText, options: modes.map(m => ({ id: m.index, label: m.text })) }));
    text = trigger.modal.modes[modeIndex];
    const result = compileFor(text, name);
    compiled = result.compiled; optional = result.optional;
  } else if (!compiled?.supported) {
    const result = compileFor(trigger.effectText, name);
    if (result.compiled.supported) { compiled = result.compiled; optional = result.optional; }
  }

  // Who caused this trigger and by how much: "that player", "that much life".
  const ev = trigger.event || {};
  const bindings = { sourceId: trigger.sourceId, eventPlayer: ev.playerId || ev.controllerId || null, eventAmount: Number(ev.amount || 0), eventCard: ev.sourceId || trigger.sourceId, eventStackId: ev.stackId || null, eventManaValue: Number(ev.manaValue || 0), eventCounters: ev.last?.counters || null, eventManaSpent: ev.manaSpent ?? null, eventDefender: ev.defenderId || null };
  // "that creature": the other creature in a block, the creature dealt damage, otherwise the event's creature.
  const other = [ev.attackerId, ev.blockerId].find(id => id && id !== trigger.sourceId);
  bindings.defendingPlayer = ev.defenderId || (game.combatState?.attackers || []).find(a => a.instanceId === (ev.sourceId || trigger.sourceId))?.defenderId || null;
  bindings.thatCard = other || (/damage/.test(ev.type || '') && ev.targetId && ev.targetId !== trigger.sourceId ? ev.targetId : null) || bindings.eventCard;
  let resolve = [], guided = null, search = null;
  // "if an opponent controls more lands than you, you may search your library …" (Land Tax): checked now; if it fails, nothing happens.
  const iffSearch = !compiled?.supported && String(text).replace(/^[^,]*\b(?:When|Whenever|At)\b[^,]*,\s*/i, '').match(/^if (.+?), ((?:you may )?search your library.+)$/i);
  if (iffSearch && parseCondition(iffSearch[1])) {
    if (!checkCondition(game, player.playerId, iffSearch[1], { sourceId: trigger.sourceId })) { log(game, `${name} triggers, but its condition is not met.`); return drop(); }
    text = iffSearch[2];
  }
  if (!compiled?.supported && /^(?:you may )?search your library/i.test(String(text).replace(/^[^,]*\b(?:When|Whenever|At)\b[^,]*,\s*/i, ''))) {
    search = librarySearchSpec(String(text).replace(/^[^,]*\b(?:When|Whenever|At)\b[^,]*,\s*/i, ''));
    if (search) compiled = { supported: true, effects: [], requirements: [], unsupported: [] };
  }
  if (compiled?.supported) {
    const split = splitRequirements(compiled.requirements || []);
    resolve = split.resolve;
    try {
      gatherRequirements(game, { player, sourceName: name, cancellable: false, source: sourceOf(game.cardDefinitions[trigger.sourceDefinitionId]) }, split.cast, bindings, ask, 'cast');
    } catch (error) {
      if (!(error instanceof NoLegalChoice)) throw error;
      log(game, `${name} triggers, but there is no legal target, so it does nothing.`);
      return drop();
    }
  } else {
    guided = guidedSpec(`${name} — resolve by hand`, text, compiled?.unsupported?.length ? compiled.unsupported : [text]);
    try {
      guided.targets = guidedTargets(game, player, game.cardDefinitions[trigger.sourceDefinitionId], text, bindings, ask, { cancellable: false });
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
      log(game, `${name} triggers, but there is no legal target, so it does nothing.`);
      return drop();
    }
  }

  if (modeIndex !== null) {
    const source = findInPlayer(player, trigger.sourceId)?.card || null;
    try { if (source) recordModalTriggerModeChoice(source, trigger, game.turnNumber, modeIndex); } catch { /* mode ledger is best-effort */ }
  }
  drop();
  const stackId = newId('stack');
  commit(game, {
    type: 'put-trigger-stack', playerId: player.playerId, stackId, sourceId: trigger.sourceId, sourceDefinitionId: trigger.sourceDefinitionId,
    effects: compiled?.supported ? compiled.effects : [], effectBindings: bindings, abilityText: text, guidedResolution: guided,
    label: `${name} triggers.`
  });
  const top = (game.stack || []).find(x => x.id === stackId);
  if (top) { top.name = name; top.label = `${name} trigger`; top.text = text; top.resolveReqs = resolve; top.castReqs = compiled?.supported ? splitRequirements(compiled.requirements || []).cast : []; top.optional = optional; top.search = search; }
  if (compiled?.supported) announceTargets(game, player, splitRequirements(compiled.requirements || []).cast, bindings, trigger.sourceId, 'trigger');
}

// ---------------------------------------------------------------------------------------------
// Resolve the top of the stack

function runResolve(game, op, ask) {
  const top = stackTop(game);
  if (!top || top.id !== op.args.stackId) return;
  const player = playerById(game, top.controllerId);
  const name = top.name || top.label || 'Stack object';
  const base = { playerId: player.playerId, cancellable: false, source: name };
  if (top.special) return runSpecial(game, top, player, ask);
  // A copy "you may choose new targets for": its controller decides now, then chooses them.
  if (top.retarget && (top.castReqs || []).length) {
    const again = ask('retarget', () => ({ ...base, kind: 'confirm', title: `${name} — copy`, prompt: 'Choose new targets for the copy?', yesLabel: 'New targets', noLabel: 'Keep the targets' }));
    if (again) {
      const fresh = { ...(top.effectBindings || {}) };
      gatherRequirements(game, { player, sourceName: name, cancellable: false }, top.castReqs, fresh, ask, 'retarget');
      top.effectBindings = fresh;
    }
    top.retarget = false;
  }
  if (top.wardCountered) {
    game.stack = game.stack.filter(x => x.id !== top.id);
    sendCounteredSpell(game, top);
    log(game, `${name} is countered by ward.`);
    return;
  }

  if (top.optional) {
    const use = ask('optional', () => ({ ...base, kind: 'confirm', title: name, prompt: `${top.text}\n\nDo you want to use this effect?`, yesLabel: 'Yes', noLabel: 'No' }));
    if (!use) {
      top.effects = [];
      top.resolveReqs = [];
      top.search = null;
    }
  }

  let picks = [];
  if (top.search) {
    const spec = top.search, filter = searchFilter(spec), count = searchCount(spec);
    const rows = player.deck.remainingLibrary.filter(c => filter(defOf(game, c)) && (spec.manaValue === undefined || Number(defOf(game, c)?.manaValue ?? 0) === spec.manaValue));   // transmute: the same mana value
    const options = rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    if (options.length) {
      picks = ask('search', () => ({
        ...base, kind: 'choose-many', private: true, title: `${name} — search your library`,
        prompt: `Choose ${count > 1 ? `up to ${count} ${spec.label}s` : `a ${spec.label}`}${spec.optional || count > 1 ? ' (you may choose none)' : ''}.`,
        options, min: spec.optional || count > 1 ? 0 : 1, max: Math.min(count, options.length), searchable: true
      }));
    }
  }
  // "Its controller may search their library for a basic land card …": that player chooses (before the target leaves).
  const theirSearch = (top.effects || []).find(e => e.kind === 'their-search');
  // "Each player searches their library for a basic land card …" (Field of Ruin): every player, in turn order, chooses.
  const searches = [];
  if (theirSearch) {
    let who = [];
    if (theirSearch.each) {
      const order = game.players.filter(p => !p.eliminated), at = Math.max(0, order.findIndex(p => p.playerId === game.activePlayerId));
      who = [...order.slice(at), ...order.slice(0, at)];
    } else {
      const targetId = (top.effectBindings || {})[theirSearch.bind];
      const hit = (game.players || []).map(p => ({ p, c: (p.deck.battlefield || []).find(c => c.instanceId === targetId) })).find(x => x.c);
      const one = hit ? playerById(game, hit.c.controllerId || hit.p.playerId) : null;
      if (one) who = [one];
    }
    const fits = theirSearch.filter === 'basic-type land' ? (t => /\bLand\b/.test(t) && /\b(?:Plains|Island|Swamp|Mountain|Forest)\b/.test(t)) : (t => /\bbasic\b/i.test(t) && /\bland\b/i.test(t));
    for (const searcher of who) {
      const rows = searcher.deck.remainingLibrary.filter(c => fits(defOf(game, c)?.typeLine || ''))
        .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Land', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
      const pick = ask(theirSearch.each ? `their-search:${searcher.playerId}` : 'their-search', () => ({ playerId: searcher.playerId, cancellable: false, private: true, kind: 'choose-many', source: name, title: `${name} — search your library`,
        prompt: rows.length ? `You may put a basic land card onto the battlefield${theirSearch.tapped ? ' tapped' : ''}. Your library is shuffled after.` : 'Your library has no basic land card. It is shuffled.', options: rows, min: 0, max: Math.min(1, rows.length), searchable: true }))[0] || null;
      searches.push({ searcher, pick });
    }
  }
  const bindings = { ...(top.effectBindings || {}), selfStackId: top.id, selfFromZone: top.fromZone || null };
  gatherRequirements(game, { player, sourceName: name, cancellable: false }, top.resolveReqs || [], bindings, ask, 'resolve');
  // "… unless that player pays {1}": ask them; if they pay, the effect does not happen.
  const unless = (top.effects || []).find(e => e.kind === 'unless-pays');
  const payer = unless ? playerById(game, bindings[unless.payerBind]) : null;
  if (unless && payer && !payer.eliminated) {
    let cost = unless.cost;
    if (unless.xFromPower) {
      const src = (game.players || []).flatMap(p => p.deck.battlefield || []).find(c => c.instanceId === bindings.sourceId);
      cost = `{${Math.max(0, Number(src ? effectivePower(src, defOf(game, src), game) : 0))}}`;
    }
    const plan = planMana(playerManaAvailability(payer, game), cost, 0, { lifeAvailable: 0 });
    const pay = cost === '{0}' ? 'pay' : ask('unless-pays', () => ({ playerId: payer.playerId, cancellable: false, kind: 'choose-one', source: name, title: `${name} — pay ${cost}?`,
      prompt: `${top.text || name}\n\nPay ${cost} to stop it?`,
      options: [{ id: 'pay', label: `Pay ${cost}`, disabled: !plan.ok }, { id: 'no', label: 'Don\u2019t pay' }] }));
    if (pay === 'pay' && plan.ok) {
      if (cost !== '{0}') commit(game, { type: 'pay-mana', playerId: payer.playerId, payment: plan.chosen, label: `${payer.displayName} pays ${cost}.` });
      bindings.unlessPaid = true;
    }
  }

  // "You may pay {4}. If you do, …": the controller chooses, and pays now.
  const mayPay = (top.effects || []).find(e => e.kind === 'may-pay');
  // Springheart Nantuko: "you may pay {1}{G} if this permanent is attached to a creature you control" — not asked otherwise.
  const attachedOk = !mayPay?.onlyIfAttached || (() => { const src = (game.players || []).flatMap(p => p.deck.battlefield || []).find(c => c.instanceId === bindings.sourceId); const host = src?.attachedTo && player.deck.battlefield.find(c => c.instanceId === src.attachedTo); return !!host && /\bCreature\b/.test(defOf(game, host)?.typeLine || ''); })();
  if (mayPay && attachedOk && mayPay.doText) {
    // Echo / Cumulative upkeep paid with an action: do it (once per age counter) or sacrifice the permanent.
    const pay = ask('may-pay', () => ({ ...base, kind: 'choose-one', title: `${name} — pay the cost?`, prompt: `${top.text || name}`,
      options: [{ id: 'pay', label: mayPay.doLabel || `Pay: ${mayPay.doText}` }, { id: 'no', label: 'Don\u2019t pay (sacrifice it)' }] }));
    if (pay === 'pay') bindings.mayPaid = true;
  } else if (mayPay && attachedOk) {
    const life = Number(mayPay.lifeCost || 0);
    const plan = planMana(playerManaAvailability(player, game), mayPay.cost, 0, { lifeAvailable: Math.max(0, Number(player.life || 0) - life) });
    const can = plan.ok && Number(player.life || 0) >= life;
    const what = [mayPay.cost, life ? `${life} life` : ''].filter(Boolean).join(' and ');
    const pay = ask('may-pay', () => ({ ...base, kind: 'choose-one', title: `${name} — pay ${what}?`, prompt: `${top.text || name}`,
      options: [{ id: 'pay', label: `Pay ${what}`, disabled: !can, sub: can ? '' : 'You cannot pay this now.' }, { id: 'no', label: 'Don\u2019t pay' }] }));
    if (pay === 'pay' && can) {
      commit(game, { type: 'pay-mana', playerId: player.playerId, payment: plan.chosen, lifeCost: life, label: `${player.displayName} pays ${what}.` });
      bindings.mayPaid = true;
    }
  }

  // Dredge: for each card a player would draw from this, that player may dredge instead (asked of that player now, done as it
  // resolves): the controller ("draw two"), every player ("each player draws"), the opponents, or the target player.
  const drawsFor = new Map();
  for (const e of (top.effects || []).filter(x => x.kind === 'draw' && !x.forPlayerBind && typeof x.amount === 'number')) {
    const sc = e.scope || 'you', alive = (game.players || []).filter(p => !p.eliminated);
    const who = sc === 'you' ? [player] : ['each-player', 'all'].includes(sc) ? alive : sc === 'opponents' ? alive.filter(p => p.playerId !== player.playerId)
      : (e.bind || e.playerId) ? [playerById(game, e.playerId || bindings[e.bind])].filter(Boolean) : [];
    for (const p of who) drawsFor.set(p.playerId, (drawsFor.get(p.playerId) || 0) + e.amount);
  }
  const dredgePlan = {};
  for (const [pid, draws] of drawsFor) {
    const who = playerById(game, pid), plan = [];
    for (let k = 0; k < Math.min(draws, 10); k++) {
      const options = dredgeOptions(game, who).filter(o => !plan.some(x => x.id === o.id));
      if (!options.length) break;
      const v = ask(pid === player.playerId ? `dredge:${k}` : `dredge:${pid}:${k}`, () => ({ ...base, playerId: pid, kind: 'choose-one', title: `${name} — draw ${k + 1}`, prompt: 'Draw the card, or dredge instead (mill and return the dredge card to your hand)?', options: [{ id: 'draw', label: 'Draw' }, ...options.map(o => ({ id: o.id, label: `Dredge ${o.name} (mill ${o.n})` }))] }));
      plan.push(v === 'draw' ? null : options.find(o => o.id === v));
    }
    if (plan.some(Boolean)) dredgePlan[pid] = plan;
  }
  if (Object.keys(dredgePlan).length) bindings.dredgePlan = dredgePlan;

  // Everything is answered: apply.
  if (top.search) {
    const spec = top.search;
    top.searchResult = {
      instanceId: picks[0] || null, to: spec.destination, position: spec.destination === 'library' ? 'top' : undefined,
      entersTapped: spec.entersTapped, shuffle: spec.shuffle, untapIfLandsAtLeast: spec.untapIfLandsAtLeast
    };
  }
  top.effectBindings = bindings;
  const card = top.kind === 'spell' ? top.card : null;
  const cardDef = card ? defOf(game, card) : null;
  try {
    commit(game, { type: 'resolve-stack', playerId: player.playerId });
  } catch (error) {
    // The engine restored the game. Hand this one to the players instead of getting stuck.
    const still = stackTop(game);
    if (still && still.id === op.args.stackId) {
      still.searchResult = null;
      still.guidedResolution = guidedSpec(`${name} — resolve by hand`, still.text || '', [error?.message || 'This effect could not be applied automatically.']);
      noteCorrection(game, { kind: 'engine-error', card: name, text: still.text || '', error: String(error?.message || error || '').slice(0, 300) });
    }
    return;
  }

  for (const { searcher, pick: theirPick } of searches) {
    const lib = searcher.deck.remainingLibrary;
    const i = theirPick ? lib.findIndex(c => c.instanceId === theirPick) : -1;
    if (i >= 0) {
      const [land] = lib.splice(i, 1);
      Object.assign(land, { zone: 'battlefield', tapped: !!theirSearch.tapped, controllerId: searcher.playerId, enteredTurn: game.turnNumber, controlSinceTurn: game.turnNumber });
      searcher.deck.battlefield.push(land);
      log(game, `${searcher.displayName} puts ${defOf(game, land)?.name || 'a basic land'} onto the battlefield${theirSearch.tapped ? ' tapped' : ''}.`);
      queueTriggers(game, { type: 'enters-battlefield', sourceId: land.instanceId, definitionId: land.definitionId, controllerId: searcher.playerId, ownerId: land.ownerId, typeLine: defOf(game, land)?.typeLine || '' });
    } else log(game, `${searcher.displayName} finds no basic land.`);
    for (let j = lib.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [lib[j], lib[k]] = [lib[k], lib[j]]; }
    queueTriggers(game, { type: 'library-searched', playerId: searcher.playerId, controllerId: searcher.playerId });
  }

  // Extra searched cards (for example Cultivate's second land goes to hand).
  for (const id of picks.slice(1)) {
    const i = player.deck.remainingLibrary.findIndex(c => c.instanceId === id);
    if (i < 0) continue;
    const [extra] = player.deck.remainingLibrary.splice(i, 1);
    extra.zone = 'hand';
    player.deck.hand.push(extra);
  }
  if (picks.length) log(game, `${player.displayName} finds ${plural(picks.length, 'card')} with ${name}.`);
  else if (top.search) log(game, `${player.displayName} searches with ${name} and finds nothing.`);

  if (card && cardDef && card.zone === 'battlefield') {
    if (top.attachTo && top.reanimate) {
      // The enchanted creature card returns to the battlefield under this Aura's controller, and the Aura is attached to it.
      const hit = (game.players || []).map(q => ({ q, c: (q.deck.graveyard || []).find(x => x.instanceId === top.attachTo) })).find(x => x.c);
      if (hit) {
        commit(game, { type: 'move-card', playerId: hit.q.playerId, instanceId: top.attachTo, to: 'battlefield', controllerId: player.playerId, label: `${defOf(game, hit.c)?.name} returns to the battlefield under ${player.displayName}'s control.` });
        attach(game, card.instanceId, top.attachTo);
      } else attach(game, card.instanceId, null);
    } else if (top.attachTo) attach(game, card.instanceId, top.attachTo);
    const text = String(cardDef.oracleText || '');
    card.counters = card.counters || {};
    // Cast from suspend: a creature has haste (as long as you control it).
    if (card.suspendCast) { delete card.suspendCast; delete card.suspended; card.temporaryEffects = [...(card.temporaryEffects || []), { kind: 'keyword', keyword: 'Haste', enabled: true }]; }
    if (['dash', 'blitz'].includes(top.castMode)) {
      card.temporaryEffects = card.temporaryEffects || [];
      card.temporaryEffects.push({ kind: 'keyword', keyword: 'Haste', enabled: true, expires: 'cleanup' });
    }
    const escapes = text.match(/escapes with (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+) counters?/i);
    if (top.castMode === 'escape' && escapes) card.counters[escapes[2]] = Number(card.counters[escapes[2]] || 0) + (Number(escapes[1]) || NUMBER_WORDS[escapes[1].toLowerCase()] || 1);
    const kicked = text.match(/enters(?: the battlefield)? with (?:a|an|one) ([+-]\d+\/[+-]\d+|[A-Za-z]+) counters? on it for each time it was kicked/i);
    if (kicked && top.kickCount) card.counters[kicked[1]] = Number(card.counters[kicked[1]] || 0) + Number(top.kickCount);
    const kickedPlain = text.match(/If (?:it|this creature) was kicked, it enters(?: the battlefield)? with (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+|[A-Za-z]+) counters? on it/i);
    if (kickedPlain && top.kicked) card.counters[kickedPlain[2]] = Number(card.counters[kickedPlain[2]] || 0) + (Number(kickedPlain[1]) || NUMBER_WORDS[kickedPlain[1].toLowerCase()] || 1);
    if (/\bSaga\b/i.test(cardDef.typeLine || '')) {
      const start = Number(top.asEntersChoices?.readAhead || 1);
      if (start > 1) { card.counters.lore = start - 1; }   // read ahead: only the chosen chapter triggers
      addLore(game, card, 1);
    }
    const counters = /for each time it was kicked/i.test(text) ? null : entersWithCountersSpec(cardDef);
    if (counters) {
      const amount = counters.amount === 'X' ? Number(top.effectBindings?.X || 0) : Number(counters.amount || 0);
      card.counters = card.counters || {};
      card.counters[counters.counter] = Number(card.counters[counters.counter] || 0) + amount;
    }
    if (/Planeswalker/i.test(cardDef.typeLine || '') && Number(cardDef.loyalty) > 0) {
      card.counters = card.counters || {};
      card.counters.loyalty = Number(cardDef.loyalty);
    }
    // Keyword counters as it enters: Vanishing N (time), Fading N (fade), Modular N (+1/+1), Bloodthirst N (+1/+1 if an
    // opponent lost life this turn).
    const kw = String(cardDef.oracleText || '').replace(/\([^()]*\)/g, '');
    const kc = (re, counter, ok = true) => { const m = kw.match(re); if (m && ok) { card.counters = card.counters || {}; card.counters[counter] = Number(card.counters[counter] || 0) + Number(m[1]); } };
    kc(/(?:^|\n)\s*Vanishing (\d+)/i, 'time');
    kc(/(?:^|\n)\s*Fading (\d+)/i, 'fade');
    kc(/(?:^|\n)\s*Modular (\d+)/i, '+1/+1');
    // Sunburst: a +1/+1 counter (a creature) or a charge counter for each colour of mana spent to cast it.
    if (/(?:^|\n)\s*Sunburst\b/i.test(kw) && (top.colorsSpent || []).length) { card.counters = card.counters || {}; const k = /\bCreature\b/.test(cardDef.typeLine || '') ? '+1/+1' : 'charge'; card.counters[k] = Number(card.counters[k] || 0) + top.colorsSpent.length; }
    kc(/(?:^|\n)\s*Bloodthirst (\d+)/i, '+1/+1', (game.players || []).some(q => q.playerId !== player.playerId && game.lostLifeTurn?.[q.playerId] === game.turnNumber));
  }
}

// ---------------------------------------------------------------------------------------------
// Physical draw: the player picks which card they drew from their real deck.

/** The legend rule (704.5j): two or more legendary permanents with the same name under one player — which ones break it. */
export function legendRuleViolation(game) {
  for (const p of (game.players || []).filter(q => !q.eliminated)) {
    const byName = new Map();
    for (const c of p.deck.battlefield || []) {
      const d = defOf(game, c);
      if (!/\bLegendary\b/.test(d?.typeLine || '') || /Legend rule doesn'?t apply/i.test(d?.oracleText || '')) continue;
      byName.set(d.name, [...(byName.get(d.name) || []), c]);
    }
    for (const [name, cards] of byName) if (cards.length > 1) return { playerId: p.playerId, name, ids: cards.map(c => c.instanceId) };
  }
  return null;
}
/** Its controller chooses the one to keep; the others are put into their owners' graveyards (not sacrificed). */
function runLegendRule(game, op, ask) {
  const v = legendRuleViolation(game);
  if (!v || v.playerId !== op.playerId) return;
  const player = playerById(game, v.playerId);
  const keep = ask('legend', () => ({ playerId: player.playerId, cancellable: false, kind: 'choose-one', source: v.name, title: `${v.name} — the legend rule`,
    prompt: `You control more than one ${v.name}. Choose the one to keep; the others go to the graveyard.`,
    options: v.ids.map(id => { const c = player.deck.battlefield.find(x => x.instanceId === id); return { id, label: v.name, sub: `${c?.tapped ? 'tapped' : 'untapped'}${Object.keys(c?.counters || {}).length ? `, ${Object.entries(c.counters).map(([k, n]) => `${n} ${k}`).join(', ')}` : ''}`, instanceId: id, definitionId: c?.definitionId }; }) }));
  for (const id of v.ids) if (id !== keep) commit(game, { type: 'move-card', playerId: player.playerId, instanceId: id, to: 'graveyard', label: `${v.name} is put into the graveyard (the legend rule).` });
}
/** Cards in the graveyard that can dredge now (Dredge N, with at least N cards in the library). */
export function dredgeOptions(game, player) {
  return (player.deck.graveyard || []).map(c => { const m = String(defOf(game, c)?.oracleText || '').replace(/\([^()]*\)/g, '').match(/(?:^|\n)\s*Dredge (\d+)/i); return m && player.deck.remainingLibrary.length >= Number(m[1]) ? { id: c.instanceId, n: Number(m[1]), name: defOf(game, c)?.name || 'Card' } : null; }).filter(Boolean);
}
/** The turn's draw when a dredge card could replace it: the player chooses. */
function runDredgeDraw(game, op, ask) {
  const player = playerById(game, op.playerId);
  const options = dredgeOptions(game, player);
  const v = options.length ? ask('dredge', () => ({ playerId: player.playerId, cancellable: false, kind: 'choose-one', source: 'Draw', title: 'Draw a card',
    prompt: 'Draw, or dredge instead (mill and return the dredge card to your hand)?', options: [{ id: 'draw', label: 'Draw a card' }, ...options.map(o => ({ id: o.id, label: `Dredge ${o.name} (mill ${o.n})` }))] })) : 'draw';
  const pick = options.find(o => o.id === v);
  if (pick) commit(game, { type: 'dredge', playerId: player.playerId, instanceId: pick.id, amount: pick.n, label: `${player.displayName} dredges ${pick.name} (mills ${pick.n}).` });
  else commit(game, { type: 'draw', playerId: player.playerId, label: `${player.displayName} draws a card.` });
}
function runDrawChoice(game, op, ask) {
  const player = playerById(game, op.playerId);
  const rows = player.deck.remainingLibrary;
  if (!rows.length) return;
  const byDef = new Map();
  for (const c of rows) if (!byDef.has(c.definitionId)) byDef.set(c.definitionId, c);
  const id = ask('draw', () => ({
    playerId: player.playerId, cancellable: false, kind: 'choose-one', private: true, source: 'Draw', title: 'Draw a card',
    prompt: 'Draw from your real deck, then choose the card you drew.', searchable: true,
    options: [...byDef.values()].map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })).sort((a, b) => a.label.localeCompare(b.label))
  }));
  const i = rows.findIndex(c => c.instanceId === id);
  if (i > 0) rows.unshift(rows.splice(i, 1)[0]);
  commit(game, { type: 'draw', playerId: player.playerId, label: `${player.displayName} draws a card.` });
}


// ---------------------------------------------------------------------------------------------
// Keyword triggers resolved with choices: cascade, storm, discover, venture, the initiative.

/** Add lore counters to a Saga; each chapter reached triggers. */
export function addLore(game, card, amount = 1) {
  card.counters = card.counters || {};
  const from = Number(card.counters.lore || 0), to = from + amount;
  card.counters.lore = to;
  queueTriggers(game, { type: 'lore-counter', sourceId: card.instanceId, definitionId: card.definitionId, controllerId: card.controllerId, from, to });
}

/** Trigger text that names one of these actions. */
export function specialFromText(text) {
  const t = String(text || '').replace(/\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
  let m;
  if (/^venture into the dungeon\.?$/i.test(t)) return { special: 'venture' };
  if (/^you take the initiative\.?$/i.test(t)) return { special: 'initiative' };
  if (/^venture into undercity\.?$/i.test(t)) return { special: 'initiative-venture' };
  if ((m = t.match(/^discover (\d+)\.?$/i))) return { special: 'discover', amount: Number(m[1]) };
  return null;
}

const SPECIAL_LABEL = { rebound: 'Rebound', madness: 'Madness', miracle: 'Miracle', suspend: 'Suspend', soulbond: 'Soulbond', exploit: 'Exploit', 'initiative-venture': 'Venture into Undercity', cascade: 'Cascade', storm: 'Storm', discover: 'Discover', venture: 'Venture into the dungeon', initiative: 'The initiative' };

/** Which room the player ventures into (asks for the dungeon and branch; changes nothing). */
function ventureChoice(game, player, ask, { undercity = false } = {}) {
  const base = { playerId: player.playerId, cancellable: false, source: 'Dungeon' };
  const current = player.dungeon && DUNGEONS[player.dungeon.name] ? player.dungeon : null;
  if (!current) {
    const name = undercity ? 'Undercity' : ask('venture:dungeon', () => ({
      ...base, kind: 'choose-one', title: 'Venture into the dungeon', prompt: 'Choose a dungeon to enter.',
      options: Object.entries(DUNGEONS).filter(([, d]) => !d.initiativeOnly).map(([id, d]) => ({ id, label: id, sub: `${Object.keys(d.rooms).length} rooms` }))
    }));
    return { name, room: DUNGEONS[name].start };
  }
  const next = DUNGEONS[current.name].rooms[current.room]?.next || [];
  if (next.length <= 1) return { name: current.name, room: next[0] || DUNGEONS[current.name].start, fresh: !next.length };
  const room = ask('venture:room', () => ({
    ...base, kind: 'choose-one', title: `${current.name} — next room`, prompt: 'Choose the room to move into.',
    options: next.map(r => ({ id: r, label: r, sub: DUNGEONS[current.name].rooms[r].text }))
  }));
  return { name: current.name, room };
}

function enterRoom(game, player, { name, room, fresh }) {
  if (fresh) player.dungeonsCompleted = Number(player.dungeonsCompleted || 0) + 1;
  const dungeon = DUNGEONS[name], info = dungeon.rooms[room];
  player.dungeon = { name, room };
  log(game, `${player.displayName} ventures into ${room} (${name}).`);
  if (!info.next.length) {
    player.dungeon = null;
    player.dungeonsCompleted = Number(player.dungeonsCompleted || 0) + 1;
    log(game, `${player.displayName} completes ${name}.`);
  }
  game.pendingTriggers = game.pendingTriggers || [];
  game.pendingTriggers.push({
    id: newId('trigger'), controllerId: player.playerId, sourceId: null, sourceDefinitionId: null, sourceName: `${room} (${name})`,
    abilityId: `room-${room}`, abilityText: info.text, effectText: info.text, modal: null,
    compiled: compileEffectText(info.text, { sourceName: room }), event: null, createdAt: new Date().toISOString()
  });
}

function setDesignation(game, player, status) {
  for (const p of game.players) p.statuses = (p.statuses || []).filter(s => s.toLowerCase() !== status.toLowerCase());
  player.statuses = [...(player.statuses || []), status];
}

/** Put a special trigger on the stack (its choices come when it resolves). */
function stackSpecial(game, player, trigger, spec) {
  const stackId = newId('stack');
  const name = trigger.sourceName || SPECIAL_LABEL[spec.special] || 'Ability';
  commit(game, {
    type: 'put-trigger-stack', playerId: player.playerId, stackId, sourceId: trigger.sourceId, sourceDefinitionId: trigger.sourceDefinitionId,
    effects: [], effectBindings: { sourceId: trigger.sourceId }, abilityText: trigger.abilityText, guidedResolution: null, label: `${name} triggers.`
  });
  const top = (game.stack || []).find(x => x.id === stackId);
  if (top) Object.assign(top, {
    name, label: `${name} — ${SPECIAL_LABEL[spec.special]}`, text: trigger.abilityText || SPECIAL_LABEL[spec.special],
    special: spec.special, amount: spec.amount ?? trigger.amount ?? null, spellStackId: trigger.spellStackId || null,
    manaValue: trigger.manaValue ?? null, stormCount: trigger.stormCount ?? null, madnessCost: trigger.madnessCost ?? null, event: trigger.event ? structuredClone(trigger.event) : null, resolveReqs: []
  });
}

/** Reveal from the top until a nonland card that passes `fits`; physical decks ask which card was hit. */
function revealUntil(game, player, ask, fits, key, title) {
  const lib = player.deck.remainingLibrary;
  if (game.rulesConfig?.physicalDraw) {
    const rows = lib.filter(c => fits(defOf(game, c)));
    if (!rows.length) return { hit: null, revealed: [] };
    const id = ask(`${key}:hit`, () => ({
      playerId: player.playerId, cancellable: false, kind: 'choose-one', private: true, searchable: true, source: title, title,
      prompt: 'Reveal cards from your real deck until you hit one that qualifies, then choose it. Put the rest on the bottom in a random order.',
      options: [...new Map(rows.map(c => [c.definitionId, c])).values()].map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }))
    }));
    return { hit: lib.find(c => c.instanceId === id) || null, revealed: [], physical: true };
  }
  const i = lib.findIndex(c => fits(defOf(game, c)));
  return { hit: i >= 0 ? lib[i] : null, revealed: i >= 0 ? lib.slice(0, i) : lib.slice() };
}

function runSpecial(game, top, player, ask) {
  const base = { playerId: player.playerId, cancellable: false, source: top.name };
  const special = top.special;
  let after = () => {};

  if (special === 'cascade' || special === 'discover') {
    const limit = special === 'cascade' ? Number(top.manaValue || 0) - 1 : Number(top.amount || 0);
    const fits = d => d && !isLand(d) && Number(d.manaValue ?? d.cmc ?? 0) <= limit;
    const { hit, revealed } = revealUntil(game, player, ask, fits, special, `${top.name} — ${SPECIAL_LABEL[special]}`);
    let choice = 'none';
    if (hit) {
      const hd = defOf(game, hit);
      choice = ask(`${special}:cast`, () => ({
        ...base, kind: 'choose-one', title: `${SPECIAL_LABEL[special]} — ${hd?.name}`, definitionId: hit.definitionId,
        prompt: `You hit ${hd?.name}. Cast it without paying its mana cost?`,
        options: [{ id: 'cast', label: `Cast ${hd?.name} free` }, { id: 'no', label: special === 'discover' ? 'Put it into your hand' : 'Don’t cast it' }]
      }));
    }
    after = () => {
      const lib = player.deck.remainingLibrary;
      const take = id => { const i = lib.findIndex(c => c.instanceId === id); return i >= 0 ? lib.splice(i, 1)[0] : null; };
      const rest = revealed.map(c => take(c.instanceId)).filter(Boolean);
      if (hit) {
        const card = take(hit.instanceId);
        if (choice === 'no' && special === 'discover') { card.zone = 'hand'; player.deck.hand.push(card); }
        else if (choice === 'no') rest.push(card);
        else { card.zone = 'exile'; player.deck.exile.push(card); game.flow.freeCast = { playerId: player.playerId, instanceId: card.instanceId }; }
      }
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      for (const c of rest) { c.zone = 'library'; lib.push(c); }
      log(game, hit ? `${player.displayName} ${SPECIAL_LABEL[special].toLowerCase()}s into ${defOf(game, hit)?.name}${choice === 'cast' ? ' and casts it' : choice === 'no' && special === 'discover' ? ' and puts it into their hand' : ''}.` : `${player.displayName} reveals no qualifying card.`);
    };
  } else if (special === 'storm') {
    const original = (game.stack || []).find(x => x.id === top.spellStackId);
    const count = Number(top.stormCount || 0);
    const copies = [];
    if (original) {
      for (let i = 0; i < count; i++) {
        const bindings = { ...(original.effectBindings || {}) };
        const reqs = (original.castReqs || []).filter(r => r.kind !== 'number');
        if (reqs.length) {
          const keep = ask(`storm:${i}:keep`, () => ({ ...base, kind: 'choose-one', title: `Storm — copy ${i + 1} of ${count}`, prompt: 'Keep the same targets or choose new ones?', options: [{ id: 'same', label: 'Same targets' }, { id: 'new', label: 'New targets' }] }));
          if (keep === 'new') {
            try { gatherRequirements(game, { player, sourceName: original.name, cancellable: false }, reqs, bindings, ask, `storm${i}`); } catch (error) { if (!(error instanceof NoLegalChoice)) throw error; }
          }
        }
        copies.push(bindings);
      }
    }
    after = () => {
      for (const bindings of copies) {
        const copy = structuredClone(original);
        copy.id = newId('stack');
        copy.kind = 'spell-copy';
        copy.isCopy = true;
        copy.effectBindings = bindings;
        copy.card = { ...copy.card, instanceId: newId('copy'), token: true, zone: 'stack' };
        copy.label = `Copy of ${original.name}`;
        copy.name = `Copy of ${original.name}`;
        game.stack.push(copy);
      }
      log(game, original ? `Storm copies ${original.name} ${plural(copies.length, 'time')}.` : 'Storm does nothing: the spell has left the stack.');
    };
  } else if (special === 'rebound') {
    const card = (player.deck.exile || []).find(c => c.instanceId === top.sourceId);
    const choice = card ? ask('rebound', () => ({ ...base, kind: 'choose-one', title: `${top.name} — rebound`, definitionId: card.definitionId, prompt: `Cast ${top.name} from exile without paying its mana cost?`, options: [{ id: 'cast', label: 'Cast it free' }, { id: 'no', label: 'Leave it in exile' }] })) : 'none';
    after = () => { if (card && choice === 'cast') game.flow.freeCast = { playerId: player.playerId, instanceId: card.instanceId }; };
  } else if (special === 'exploit') {
    const rows = player.deck.battlefield.filter(c => /\bCreature\b/.test(defOf(game, c)?.typeLine || ''))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Creature', sub: c.instanceId === top.sourceId ? 'This creature' : defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
    const pick = rows.length ? ask('exploit', () => ({ ...base, kind: 'choose-one', title: `${top.name} — exploit`, prompt: 'You may sacrifice a creature.', options: rows, allowNone: true, noneLabel: 'Don\u2019t sacrifice' })) : null;
    after = () => {
      if (!pick || !player.deck.battlefield.some(c => c.instanceId === pick)) return;
      commit(game, { type: 'move-card', playerId: player.playerId, instanceId: pick, to: 'graveyard', moveReason: 'sacrifice', label: `${player.displayName} exploits ${defOf(game, player.deck.battlefield.find(c => c.instanceId === pick))?.name || 'a creature'}.` });
      queueTriggers(game, { type: 'exploited', sourceId: top.sourceId, controllerId: player.playerId, playerId: player.playerId, sacrificedId: pick });
    };
  } else if (special === 'soulbond') {
    // Pair this creature with an unpaired creature you control (the one that entered, or any when it entered itself).
    const me = player.deck.battlefield.find(c => c.instanceId === top.sourceId);
    const entered = top.event?.sourceId && top.event.sourceId !== top.sourceId ? top.event.sourceId : null;
    const rows = me && !me.pairedWith ? player.deck.battlefield.filter(c => c.instanceId !== me.instanceId && !c.pairedWith && /\bCreature\b/.test(defOf(game, c)?.typeLine || '') && (!entered || c.instanceId === entered))
      .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Creature', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })) : [];
    const pick = rows.length ? ask('soulbond', () => ({ ...base, kind: 'choose-one', title: `${top.name} — soulbond`, prompt: `Pair ${top.name} with a creature?`, options: rows, allowNone: true, noneLabel: 'Don\u2019t pair' })) : null;
    after = () => {
      const mate = pick && player.deck.battlefield.find(c => c.instanceId === pick);
      if (!me || !mate || me.pairedWith || mate.pairedWith) return;
      me.pairedWith = mate.instanceId; mate.pairedWith = me.instanceId;
      log(game, `${top.name} is paired with ${defOf(game, mate)?.name || 'a creature'}.`);
    };
  } else if (special === 'suspend') {
    // Suspend: remove a time counter; when the last is removed, cast it without paying its mana cost (a creature gains haste).
    const card = (player.deck.exile || []).find(c => c.instanceId === top.sourceId && c.suspended);
    after = () => {
      if (!card) return;
      card.counters = card.counters || {};
      card.counters.time = Math.max(0, Number(card.counters.time || 0) - 1);
      log(game, `${top.name}: a time counter is removed (${card.counters.time} left).`);
      if (card.counters.time === 0) { delete card.counters.time; card.suspendCast = true; game.flow.freeCast = { playerId: player.playerId, instanceId: card.instanceId }; }
    };
  } else if (special === 'miracle') {
    // Miracle: the card just drawn may be revealed and cast now for its miracle cost.
    const card = (player.deck.hand || []).find(c => c.instanceId === top.sourceId);
    const cost = top.madnessCost || '';
    const choice = card ? ask('miracle', () => ({ ...base, kind: 'choose-one', title: `${top.name} — miracle`, definitionId: card.definitionId, private: true,
      prompt: `Reveal ${top.name} and cast it for its miracle cost ${cost}?`, options: [{ id: 'cast', label: `Cast it for ${cost}` }, { id: 'no', label: 'Keep it in my hand' }] })) : 'none';
    after = () => { if (card && choice === 'cast') game.flow.freeCast = { playerId: player.playerId, instanceId: card.instanceId, cost }; };
  } else if (special === 'madness') {
    // Madness: the discarded card waits in exile; its owner may cast it now for its madness cost, or it goes to the graveyard.
    const card = (player.deck.exile || []).find(c => c.instanceId === top.sourceId && c.madness);
    const cost = top.madnessCost || '';
    const choice = card ? ask('madness', () => ({ ...base, kind: 'choose-one', title: `${top.name} — madness`, definitionId: card.definitionId,
      prompt: `Cast ${top.name} for its madness cost ${cost}?`, options: [{ id: 'cast', label: `Cast it for ${cost}` }, { id: 'no', label: 'Put it into my graveyard' }] })) : 'none';
    after = () => {
      if (!card) return;
      if (choice === 'cast') { game.flow.freeCast = { playerId: player.playerId, instanceId: card.instanceId, cost }; return; }
      const i = player.deck.exile.indexOf(card);
      if (i >= 0) { player.deck.exile.splice(i, 1); delete card.madness; card.zone = 'graveyard'; player.deck.graveyard.push(card); log(game, `${top.name} goes to the graveyard.`); }
    };
  } else if (special === 'venture' || special === 'initiative' || special === 'initiative-venture') {
    const room = ventureChoice(game, player, ask, { undercity: special !== 'venture' });
    after = () => {
      if (special === 'initiative') { setDesignation(game, player, 'Initiative'); log(game, `${player.displayName} takes the initiative.`); }
      enterRoom(game, player, room);
    };
  }
  commit(game, { type: 'resolve-stack', playerId: player.playerId });
  after();
}

export const OPS = { play: runPlay, activate: runActivate, trigger: runTrigger, resolve: runResolve, 'draw-choice': runDrawChoice, 'dredge-draw': runDredgeDraw, 'legend-rule': runLegendRule };

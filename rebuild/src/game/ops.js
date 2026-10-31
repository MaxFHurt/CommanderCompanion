// Multi-step game actions ("ops"): play a card, activate an ability, put a trigger on the stack,
// resolve the top of the stack. An op asks for the choices it needs (see requirements.js) and
// only changes the game once every answer is in, so cancelling half-way never leaves a mess.

import { createTransactionEngine } from '../engine/transactions.js';
import {
  parseManaCost, planMana, playerManaAvailability, parseActivatedAbilities, validateActivatedAbilityFull,
  basicLandManaColor, isBasicLand, tapManaAbilities, entersBattlefieldTapped
} from '../engine/rules.js';
import { asEntersChoiceSpec, entersWithCountersSpec, modalSpellSpec, spellSupport } from '../engine/abilities.js';
import { compileEffectText } from '../engine/effects.js';
import { availableModalTriggerModes, recordModalTriggerModeChoice, queueTriggers } from '../engine/triggers.js';
import { CREATURE_TYPES } from '../data/creature-types.js';
import {
  COLOR_NAMES, GameError, defOf, definitionsMap, faceDefinition, findInPlayer, isLand, isInstantOrSorcery,
  log, newId, opponentsOf, playerById, plural
} from './helpers.js';
import { gatherRequirements, splitRequirements, NoLegalChoice } from './requirements.js';
import { librarySearchSpec, searchFilter } from './library-search.js';
import { abilityZone, activationBlock, activationRules, commanderEntryFor, manaAmountForAbility, manaOptionsForAbility, playCheck, specialRows, stackTop } from './legal.js';
import { attach, enchantTarget } from './attachments.js';
import { sendCounteredSpell } from './edits.js';
import { candidatesFor } from './requirements.js';
import { targetRequirementsFromText } from './guided.js';
import { adjustGeneric, additionalCost, controlsACommander, delveCards, extraCosts, faceDownDefinition, genericOf, isAdventure, modeCost } from './casting.js';
import { castTriggers } from '../engine/keyword-triggers.js';
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
  if (compileFor(t, sourceName).compiled.supported) return true;
  return /^(?:you may )?search your library/i.test(t) && !!librarySearchSpec(t);
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
export function castText(text, { kicked = false, overload = false } = {}) {
  let t = String(text || '').split('\n').filter(line => !/^\s*(?:Kicker|Multikicker|Buyback|Flashback|Escape|Evoke|Dash|Blitz|Overload|Foretell|Morph|Megamorph|Disguise|Convoke|Delve|Affinity for \w+|Undaunted|Cascade|Storm|Prowess|Undying|Persist|Cycling|(?:Basic )?[A-Za-z]+cycling|Retrace|Jump-start|Split second)\b/i.test(line)).join('\n');
  t = t.replace(/This spell costs \{\d+\} (?:less|more) to cast[^.]*\.\s*/gi, '');
  // Casting permissions and costs, not things the spell does as it resolves.
  t = t.replace(/If you control a commander, you may cast this spell without paying its mana cost\.\s*/gi, '');
  t = t.replace(/As an additional cost to cast this spell, [^.]+\.\s*/gi, '');
  t = t.replace(/(?:If it'?s not your turn, )?You may (?:pay \d+ life and )?exile an? \w+ card from your hand rather than pay this spell'?s mana cost\.\s*/gi, '');
  t = t.replace(/\s*If (?:this spell|it) was kicked, ([^.]+)\./gi, (all, clause) => {
    if (!kicked) return '';
    const dmg = clause.match(/^it deals (\w+) damage instead$/i);
    if (dmg) return `\u0000${dmg[1]}`;
    return /\binstead\b/i.test(clause) ? all : ` ${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
  });
  // "deals 2 damage … If kicked, it deals 4 damage instead."
  t = t.replace(/deals (\w+) damage([^\u0000]*?)\.\s*\u0000(\w+)/g, (all, a, rest, b) => `deals ${b} damage${rest}.`);
  if (overload) t = t.replace(/\btarget\b/g, 'each').replace(/\bTarget\b/g, 'Each');
  return t.trim();
}

function runPlay(game, op, ask) {
  const player = playerById(game, op.playerId);
  const hit = findInPlayer(player, op.args.instanceId);
  if (!hit || !['hand', 'commandZone', 'graveyard', 'exile'].includes(hit.zone)) throw new GameError('That card is no longer available to play.');
  const card = hit.card, base = game.cardDefinitions[card.definitionId], force = !!op.args.force, free = !!op.args.free;

  let faceIndex = Number.isInteger(op.args.faceIndex) ? op.args.faceIndex : null;
  const faces = hit.zone === 'hand' || free ? playableFaces(base) : [null];
  if (faces.length > 1 && faceIndex === null) {
    faceIndex = ask('face', () => ({
      playerId: player.playerId, cancellable: !free, kind: 'choose-one', source: base.name, title: base.combinedName || base.name,
      prompt: 'This card has two faces. Choose the face to play.',
      options: faces.map(i => {
        const check = playCheck(game, player, card, i);
        return { id: i, label: base.cardFaces[i].name, sub: `${base.cardFaces[i].typeLine}${check.legal || free ? '' : ` — ${check.reasons[0]}`}`, definitionId: base.definitionId, faceIndex: i, disabled: !check.legal && !force && !free };
      })
    }));
  }
  const check = playCheck(game, player, card, faceIndex);
  if (free) {
    // Cast without paying its mana cost (cascade, discover): only timing is waived, not targets.
    if (check.kind === 'land') throw new GameError('A land cannot be cast.');
  } else if (!check.legal && !force) throw new GameError(check.reasons[0] || 'That play is not legal right now.', check.reasons);
  const def = check.def;
  const activeFaceIndex = Number.isInteger(def?.faceIndex) ? def.faceIndex : null;

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
  const modes = free ? [{ id: 'normal', label: 'Cast', cost: '', legal: true }] : (check.options || []).filter(o => o.legal || force);
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
  const castDef = faceDown ? faceDownDefinition(faceDown) : { ...def, oracleText: castText(def.oracleText, { kicked: kickCount > 0, overload: mode.id === 'overload' }) };
  const permanent = !isInstantOrSorcery(castDef);
  const asEnters = permanent && !faceDown ? askAsEnters(game, player, def, ask, def.name) : null;
  const tag = [kickCount > 1 ? `kicked ×${kickCount}` : kickCount ? 'kicked' : '', mode.id !== 'normal' && !faceDown ? mode.label.toLowerCase() : ''].filter(Boolean).join(', ');
  let compiled = { effects: [], requirements: [] }, guided = null, search = null, optional = false;
  if (!permanent) {
    const title = `${def.name}${tag ? ` (${tag})` : ''} — resolve by hand`;
    const support = spellSupport(castDef);
    if (support.kind === 'modal' && support.modal) {
      const modal = support.modal, count = Math.min(modal.count, modal.modes.length);
      // "one or more" (Farewell): any number; "choose both" with a commander (Jeska's Will, Akroma's Will).
      const both = modal.commanderBoth && controlsACommander(game, player);
      const min = count, max = modal.oneOrMore ? modal.modes.length : both ? Math.min(2, modal.modes.length) : count;
      const picked = ask('modes', () => ({
        playerId: player.playerId, cancellable: true, kind: 'choose-many', source: def.name, title: `${def.name} — choose ${max > min ? `${min} or more` : count}`,
        prompt: modal.oneOrMore ? 'Choose one or more modes.' : both ? 'You control a commander: choose one mode, or both.' : `Choose ${plural(count, 'mode')}.`, min, max,
        options: modal.modes.map((text, i) => ({ id: i, label: text }))
      }));
      const chosen = picked.map(i => modal.compiledModes[i]);
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

  const bindings = addCost?.kind === 'life-x' ? { X: lifeForCost } : {};
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
  const enchant = permanent && !faceDown ? enchantTarget(def) : null;
  if (enchant && enchant !== 'player') {
    const rows = candidatesFor(game, { kind: 'target', scope: `target ${enchant}` }, player);
    if (!rows.length && !force) throw new GameError(`There is no ${enchant} to enchant.`);
    if (rows.length) attachTo = ask('enchant', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', targeting: true, source: def.name, title: `${def.name} — enchant ${enchant}`, prompt: `Choose the ${enchant} to enchant.`, options: rows }));
  }

  // Ward: targeting an opponent's permanent with ward costs extra, or the spell is countered.
  let wardCountered = false;
  for (const [i, w] of wardCosts(game, player, [...Object.values(bindings), attachTo]).entries()) {
    const pay = ask(`ward:${i}`, () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${w.name} has ward ${w.cost}`,
      prompt: `Pay ${w.cost} more, or ${def.name} will be countered.`,
      options: [{ id: 'pay', label: `Pay ward ${w.cost}`, disabled: !free && !force && !modeAffordable(game, player, card, def, mode, { tax, extra: extraCost + w.cost }) }, { id: 'no', label: 'Don\u2019t pay (it is countered)' }]
    }));
    if (pay === 'pay') extraCost += w.cost; else wardCountered = true;
  }

  // Pay: the cost for this way of casting, then escape and delve exile graveyard cards.
  const priced = free ? { cost: extraCost, convoke: [], delve: 0, notes: [] } : modeCost(game, player, card, def, mode, { tax, extra: extraCost });
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
    top.entersTapped = permanent && !faceDown && /enters(?: the battlefield)? tapped/i.test(def.oracleText || '')
      ? entersBattlefieldTapped({ definition: def, battlefield: player.deck.battlefield, definitions: game.cardDefinitions }) : false;
  }
  // Cast triggers of the spell itself (cascade, storm).
  if (!faceDown) for (const t of castTriggers(game, player, card, def)) queueSpecialTrigger(game, player, card, def, t, stackId);
}

/** Opponents' permanents with a ward mana cost among the chosen targets. */
function wardCosts(game, player, ids) {
  const out = [];
  for (const id of new Set(ids.flat().filter(x => typeof x === 'string'))) {
    for (const p of game.players) {
      if (p.playerId === player.playerId) continue;
      const c = (p.deck?.battlefield || []).find(x => x.instanceId === id);
      const m = c && String(defOf(game, c)?.oracleText || '').replace(/\([^()]*\)/g, '').match(/(?:^|\n|,\s*)Ward\s*(?:[—-]\s*)?((?:\{[^}]+\})+)/i);
      if (m) out.push({ id, name: defOf(game, c)?.name || 'It', cost: m[1] });
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
  if (/Activate only once each turn|only once each turn/i.test(ability.text)) card.activatedTurn = { ...(card.activatedTurn || {}), [ability.id]: game.turnNumber };
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
  if (fromZone === 'hand') costMoveIds.push(card.instanceId);   // Channel: "Discard this card" is the cost
  if (ability.sacrificeRequirement && !ability.sacrificesSelf) {
    const type = ability.sacrificeRequirement;
    const rows = player.deck.battlefield.filter(c => c.instanceId !== card.instanceId && new RegExp(`\\b${type === 'permanent' ? '' : type}`, 'i').test(defOf(game, c)?.typeLine || ''));
    if (!rows.length) throw new GameError(`You have no ${type.toLowerCase()} to sacrifice.`);
    costMoveIds.push(ask('cost:sacrifice', () => ({ ...base, kind: 'choose-one', title: `${def.name} — pay cost`, prompt: `Choose a ${type.toLowerCase()} to sacrifice.`, options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })) })));
  }
  if (ability.discardCount && fromZone !== 'hand') {
    const rows = player.deck.hand;
    if (!rows.length) throw new GameError('You have no card to discard.');
    costMoveIds.push(ask('cost:discard', () => ({ ...base, kind: 'choose-one', private: true, title: `${def.name} — pay cost`, prompt: 'Choose a card to discard.', options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: 'Your hand', instanceId: c.instanceId, definitionId: c.definitionId })) })));
  }

  const manaText = (ability.cost.match(/\{(?:\d+|X|[WUBRGC](?:\/[WUBRGC])?(?:\/P)?|2\/[WUBRG])\}/gi) || []).join('');
  const plan = planMana(playerManaAvailability(player, game), manaText, xInCost ? Number(bindings.X || 0) : 0, { lifeAvailable: Math.max(0, Number(player.life || 0) - Number(ability.lifeCost || 0)) });
  if (!plan.ok && !force) throw new GameError(plan.reason || 'The cost cannot be paid.');
  const common = {
    playerId: player.playerId, instanceId: card.instanceId, requiresTap: ability.requiresTap && !(force && card.tapped), requiresUntap: ability.requiresUntap,
    sacrificeSelf: ability.sacrificesSelf, costMoveIds, payment: plan.ok ? plan.chosen : null, lifeCost: ability.lifeCost, energyCost: ability.energyCost, fromZone
  };
  const short = ability.text.length > 90 ? `${ability.text.slice(0, 88)}…` : ability.text;

  if (ability.manaAbility) {
    const options = manaOptionsForAbility(game, player, card, ability);
    if (!options.length) throw new GameError('This ability cannot make any mana right now.');
    let color = op.args.color && options.includes(op.args.color) ? op.args.color : null;
    if (!color) color = options.length === 1 ? options[0] : ask('mana', () => ({ ...base, kind: 'choose-one', title: `${def.name} — mana`, prompt: 'Choose the mana to add.', options: options.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) }));
    const amount = manaAmountForAbility(ability, { game, player, card, color });
    commit(game, { ...common, type: 'activate-ability', manaColor: color, manaAmount: amount, label: `${player.displayName} taps ${def.name} for ${amount > 1 ? `${amount} ` : ''}${COLOR_NAMES[color].toLowerCase()} mana.` });
    return;
  }

  let compiled = { effects: [], requirements: [] }, guided = null, search = null, optional = false;
  if (/search your library/i.test(effectText)) {
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
  const stackId = newId('stack');
  commit(game, { ...common, type: 'activate-ability-stack', stackId, effects: compiled.effects, effectBindings: bindings, guidedResolution: guided, label: `${player.displayName} activates ${def.name}: ${short}` });
  const live = findInPlayer(player, card.instanceId);
  if (ability.loyaltyDelta !== null && live?.zone === 'battlefield') {
    live.card.counters = live.card.counters || {};
    live.card.counters.loyalty = Math.max(0, Number(live.card.counters.loyalty || 0) + ability.loyaltyDelta);
    live.card.loyaltyUsedTurn = game.turnNumber;
  }
  const top = (game.stack || []).find(x => x.id === stackId);
  if (top) { top.name = def.name; top.label = `${def.name} ability`; top.text = ability.text; top.resolveReqs = resolve; top.search = search; top.optional = optional; }
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
  const bindings = { sourceId: trigger.sourceId, eventPlayer: ev.playerId || ev.controllerId || null, eventAmount: Number(ev.amount || 0), eventCard: ev.sourceId || trigger.sourceId };
  // "that creature": the other creature in a block, the creature dealt damage, otherwise the event's creature.
  const other = [ev.attackerId, ev.blockerId].find(id => id && id !== trigger.sourceId);
  bindings.thatCard = other || (/damage/.test(ev.type || '') && ev.targetId && ev.targetId !== trigger.sourceId ? ev.targetId : null) || bindings.eventCard;
  let resolve = [], guided = null, search = null;
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
  if (top) { top.name = name; top.label = `${name} trigger`; top.text = text; top.resolveReqs = resolve; top.optional = optional; top.search = search; }
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
    const rows = player.deck.remainingLibrary.filter(c => filter(defOf(game, c)));
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
  let theirPick = null, searcher = null;
  if (theirSearch) {
    const targetId = (top.effectBindings || {})[theirSearch.bind];
    const hit = (game.players || []).map(p => ({ p, c: (p.deck.battlefield || []).find(c => c.instanceId === targetId) })).find(x => x.c);
    searcher = hit ? playerById(game, hit.c.controllerId || hit.p.playerId) : null;
    if (searcher) {
      const rows = searcher.deck.remainingLibrary.filter(c => /\bbasic\b/i.test(defOf(game, c)?.typeLine || '') && /\bland\b/i.test(defOf(game, c)?.typeLine || ''))
        .map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Land', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId }));
      theirPick = ask('their-search', () => ({ playerId: searcher.playerId, cancellable: false, private: true, kind: 'choose-many', source: name, title: `${name} — search your library`,
        prompt: rows.length ? `You may put a basic land card onto the battlefield${theirSearch.tapped ? ' tapped' : ''}. Your library is shuffled after.` : 'Your library has no basic land card. It is shuffled.', options: rows, min: 0, max: Math.min(1, rows.length), searchable: true }))[0] || null;
    }
  }
  const bindings = { ...(top.effectBindings || {}) };
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
  if (mayPay) {
    const life = Number(mayPay.lifeCost || 0);
    const plan = planMana(playerManaAvailability(player, game), mayPay.cost, 0, { lifeAvailable: Math.max(0, Number(player.life || 0) - life) });
    const can = plan.ok && Number(player.life || 0) >= life;
    const what = `${mayPay.cost}${life ? ` and ${life} life` : ''}`;
    const pay = ask('may-pay', () => ({ ...base, kind: 'choose-one', title: `${name} — pay ${what}?`, prompt: `${top.text || name}`,
      options: [{ id: 'pay', label: `Pay ${what}`, disabled: !can, sub: can ? '' : 'You cannot pay this now.' }, { id: 'no', label: 'Don\u2019t pay' }] }));
    if (pay === 'pay' && can) {
      commit(game, { type: 'pay-mana', playerId: player.playerId, payment: plan.chosen, lifeCost: life, label: `${player.displayName} pays ${what}.` });
      bindings.mayPaid = true;
    }
  }

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
    }
    return;
  }

  if (searcher) {
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
    if (top.attachTo) attach(game, card.instanceId, top.attachTo);
    const text = String(cardDef.oracleText || '');
    card.counters = card.counters || {};
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
    if (/\bSaga\b/i.test(cardDef.typeLine || '')) addLore(game, card, 1);
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
  }
}

// ---------------------------------------------------------------------------------------------
// Physical draw: the player picks which card they drew from their real deck.

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
  const t = String(text || '').trim();
  let m;
  if (/^venture into the dungeon\.?$/i.test(t)) return { special: 'venture' };
  if (/^you take the initiative\.?$/i.test(t)) return { special: 'initiative' };
  if (/^venture into undercity\.?$/i.test(t)) return { special: 'initiative-venture' };
  if ((m = t.match(/^discover (\d+)\.?$/i))) return { special: 'discover', amount: Number(m[1]) };
  return null;
}

const SPECIAL_LABEL = { 'initiative-venture': 'Venture into Undercity', cascade: 'Cascade', storm: 'Storm', discover: 'Discover', venture: 'Venture into the dungeon', initiative: 'The initiative' };

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
    manaValue: trigger.manaValue ?? null, stormCount: trigger.stormCount ?? null, resolveReqs: []
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

export const OPS = { play: runPlay, activate: runActivate, trigger: runTrigger, resolve: runResolve, 'draw-choice': runDrawChoice };

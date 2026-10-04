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
import { availableModalTriggerModes, recordModalTriggerModeChoice } from '../engine/triggers.js';
import { CREATURE_TYPES } from '../data/creature-types.js';
import {
  COLOR_NAMES, GameError, defOf, definitionsMap, faceDefinition, findInPlayer, isLand, isInstantOrSorcery,
  log, newId, opponentsOf, playerById, plural
} from './helpers.js';
import { gatherRequirements, splitRequirements, NoLegalChoice } from './requirements.js';
import { librarySearchSpec, searchFilter } from './library-search.js';
import { commanderEntryFor, manaAmountForAbility, manaOptionsForAbility, playCheck, stackTop } from './legal.js';
import { attach, enchantTarget } from './attachments.js';
import { candidatesFor } from './requirements.js';

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

function guidedSpec(title, oracleText, unsupported) {
  return { title, oracleText, unsupported: (unsupported || []).filter(Boolean) };
}

function searchCount(spec) {
  const m = String(spec?.text || '').match(/search your library for up to (\w+)/i);
  return m ? (Number(m[1]) || NUMBER_WORDS[m[1].toLowerCase()] || 1) : 1;
}

function askAsEnters(game, player, def, ask, source) {
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

function runPlay(game, op, ask) {
  const player = playerById(game, op.playerId);
  const hit = findInPlayer(player, op.args.instanceId);
  if (!hit || !['hand', 'commandZone', 'graveyard'].includes(hit.zone)) throw new GameError('That card is no longer available to play.');
  const card = hit.card, base = game.cardDefinitions[card.definitionId], force = !!op.args.force;

  let faceIndex = Number.isInteger(op.args.faceIndex) ? op.args.faceIndex : null;
  const faces = playableFaces(base);
  if (faces.length > 1 && faceIndex === null) {
    faceIndex = ask('face', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: base.name, title: base.combinedName || base.name,
      prompt: 'This card has two faces. Choose the face to play.',
      options: faces.map(i => {
        const check = playCheck(game, player, card, i);
        return { id: i, label: base.cardFaces[i].name, sub: `${base.cardFaces[i].typeLine}${check.legal ? '' : ` — ${check.reasons[0]}`}`, definitionId: base.definitionId, faceIndex: i, disabled: !check.legal && !force };
      })
    }));
  }
  const check = playCheck(game, player, card, faceIndex);
  if (!check.legal && !force) throw new GameError(check.reasons[0] || 'That play is not legal right now.', check.reasons);
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

  // Spells.
  const permanent = !isInstantOrSorcery(def);
  const asEnters = permanent ? askAsEnters(game, player, def, ask, def.name) : null;
  let compiled = { effects: [], requirements: [] }, guided = null, search = null, optional = false;
  if (!permanent) {
    const support = spellSupport(def);
    if (support.kind === 'modal' && support.modal) {
      const modal = support.modal, count = Math.min(modal.count, modal.modes.length);
      const picked = ask('modes', () => ({
        playerId: player.playerId, cancellable: true, kind: 'choose-many', source: def.name, title: `${def.name} — choose ${count}`,
        prompt: `Choose ${plural(count, 'mode')}.`, min: count, max: count,
        options: modal.modes.map((text, i) => ({ id: i, label: text }))
      }));
      const chosen = picked.map(i => modal.compiledModes[i]);
      if (chosen.some(x => !x?.supported)) guided = guidedSpec(`${def.name} — resolve by hand`, picked.map(i => modal.modes[i]).join('\n'), chosen.flatMap(x => x?.unsupported || []));
      else compiled = { effects: chosen.flatMap(x => x.effects), requirements: chosen.flatMap(x => x.requirements) };
    } else if (support.kind === 'search-spell') {
      search = librarySearchSpec(def.oracleText);
      if (!search) guided = guidedSpec(`${def.name} — resolve by hand`, def.oracleText, [def.oracleText]);
    } else if (support.compiled?.supported) {
      compiled = support.compiled;
    } else if (support.kind === 'effect') {
      const again = compileFor(def.oracleText, def.name);
      if (again.compiled.supported) { compiled = again.compiled; optional = again.optional; }
      else guided = guidedSpec(`${def.name} — resolve by hand`, def.oracleText, support.reasons);
    } else {
      guided = guidedSpec(`${def.name} — resolve by hand`, def.oracleText, support.reasons);
    }
  }

  const bindings = {};
  const cost = parseManaCost(def.manaCost || '');
  let extra = 0;
  if (cost.X) {
    const avail = playerManaAvailability(player, game);
    const pool = ['W', 'U', 'B', 'R', 'G', 'C'].reduce((n, c) => n + Number(avail[c] || 0), 0) + (avail.__flex || []).length;
    bindings.X = ask('x', () => ({ playerId: player.playerId, cancellable: true, kind: 'number', source: def.name, title: `${def.name} — choose X`, prompt: 'Choose the value of X.', min: 0, max: force ? 99 : Math.max(0, Math.floor(pool / cost.X)) }));
    extra = bindings.X * cost.X;
  }
  const { cast, resolve } = splitRequirements((compiled.requirements || []).filter(r => !(r.kind === 'number' && r.bind === 'X' && cost.X)));
  try {
    gatherRequirements(game, { player, sourceName: def.name }, cast, bindings, ask, 'cast');
  } catch (error) {
    if (error instanceof NoLegalChoice) throw new GameError(error.message);
    throw error;
  }

  // Auras choose what they enchant as they are cast.
  let attachTo = null;
  const enchant = permanent ? enchantTarget(def) : null;
  if (enchant && enchant !== 'player') {
    const rows = candidatesFor(game, { kind: 'target', scope: `target ${enchant}` }, player);
    if (!rows.length && !force) throw new GameError(`There is no ${enchant} to enchant.`);
    if (rows.length) attachTo = ask('enchant', () => ({ playerId: player.playerId, cancellable: true, kind: 'choose-one', targeting: true, source: def.name, title: `${def.name} — enchant ${enchant}`, prompt: `Choose the ${enchant} to enchant.`, options: rows }));
  }

  const commander = card.zone === 'command' ? commanderEntryFor(player, card) : null;
  const tax = commander && game.rulesConfig?.commanderTax !== false ? Number(commander.commanderTax || 0) : 0;
  const available = playerManaAvailability(player, game);
  available.__flex = available.__flex.filter(x => x.instanceId !== card.instanceId);
  const plan = planMana(available, def.manaCost || '', tax + extra, { lifeAvailable: Number(player.life || 0) });
  if (!plan.ok && !force) throw new GameError(plan.reason || 'Not enough mana.');
  let payment = plan.ok ? plan.chosen : null;
  if (plan.ok && cost.phyrexian?.length && plan.alternatives.length > 1) {
    const pick = ask('phyrexian', () => ({
      playerId: player.playerId, cancellable: true, kind: 'choose-one', source: def.name, title: `${def.name} — pay`,
      prompt: 'Phyrexian mana can be paid with mana or 2 life each.',
      options: plan.alternatives.slice(0, 6).map((alt, i) => ({ id: i, label: alt.lifePayment ? `Pay ${alt.lifePayment} life` : 'Pay with mana only' }))
    }));
    payment = plan.alternatives[pick].chosen;
  }

  const fixed = permanent ? [...new Set(tapManaAbilities(def).flatMap(a => a.options))] : [];
  const stackId = newId('stack');
  const action = {
    playerId: player.playerId, stackId, activeFaceIndex, payment, effects: compiled.effects || [],
    effectBindings: { ...bindings, sourceId: card.instanceId }, asEntersChoices: asEnters, guidedResolution: guided,
    manaCapacityColor: fixed.length === 1 ? fixed[0] : null,
    label: `${player.displayName} casts ${def.name}${commander ? ' from the command zone' : card.zone === 'graveyard' ? ' from the graveyard' : ''}${bindings.X !== undefined ? ` with X = ${bindings.X}` : ''}.`
  };
  if (commander) commit(game, { ...action, type: 'cast-commander', commanderId: commander.id });
  else commit(game, { ...action, type: 'cast-spell', instanceId: card.instanceId, fromZones: [zoneKeyOf(card)], to: permanent ? 'battlefield' : 'graveyard' });
  const top = (game.stack || []).find(x => x.id === stackId);
  if (top) {
    top.name = def.name;
    top.label = def.name;
    top.text = def.oracleText || '';
    top.resolveReqs = resolve;
    top.search = search;
    top.optional = optional;
    top.attachTo = attachTo;
    top.entersTapped = permanent && /enters(?: the battlefield)? tapped/i.test(def.oracleText || '')
      ? entersBattlefieldTapped({ definition: def, battlefield: player.deck.battlefield, definitions: game.cardDefinitions }) : false;
  }
}

// ---------------------------------------------------------------------------------------------
// Activate an ability

function runActivate(game, op, ask) {
  const player = playerById(game, op.playerId);
  const hit = findInPlayer(player, op.args.instanceId);
  if (!hit) throw new GameError('That card is no longer available.');
  const card = hit.card, def = defOf(game, card), force = !!op.args.force;
  const ability = parseActivatedAbilities(def).find(a => a.id === op.args.abilityId);
  if (!ability) throw new GameError('That ability is not available.');
  const base = { playerId: player.playerId, cancellable: true, source: def.name };

  if (hit.zone === 'hand') {
    if (!ability.manaAbility) throw new GameError('That ability cannot be used from your hand.');
    const options = [...new Set(ability.manaOptions || [])];
    const color = options.length > 1 ? ask('mana', () => ({ ...base, kind: 'choose-one', title: `${def.name} — mana`, prompt: 'Choose the mana to add.', options: options.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) })) : (options[0] || 'C');
    commit(game, { type: 'activate-zone-mana-ability', playerId: player.playerId, instanceId: card.instanceId, fromZone: 'hand', toZone: 'exile', manaColor: color, manaAmount: manaAmountForAbility(ability), label: `${player.displayName} exiles ${def.name} from hand for mana.` });
    return;
  }
  if (hit.zone !== 'battlefield') throw new GameError('That permanent is no longer on the battlefield.');
  const legality = validateActivatedAbilityFull({ game, player, instance: card, definition: def, ability, definitions: definitionsMap(game) });
  if (!legality.legal && !force) throw new GameError(legality.reasons[0], legality.reasons);
  if (ability.loyaltyDelta !== null && !force) {
    if (card.loyaltyUsedTurn === game.turnNumber) throw new GameError('A planeswalker can use only one loyalty ability each turn.');
    if (game.activePlayerId !== player.playerId || !['precombat-main', 'postcombat-main'].includes(game.phase) || (game.stack || []).length) throw new GameError('Loyalty abilities can be used only during your main phase while the stack is empty.');
  }

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
  if (ability.sacrificeRequirement && !ability.sacrificesSelf) {
    const type = ability.sacrificeRequirement;
    const rows = player.deck.battlefield.filter(c => c.instanceId !== card.instanceId && new RegExp(`\\b${type === 'permanent' ? '' : type}`, 'i').test(defOf(game, c)?.typeLine || ''));
    if (!rows.length) throw new GameError(`You have no ${type.toLowerCase()} to sacrifice.`);
    costMoveIds.push(ask('cost:sacrifice', () => ({ ...base, kind: 'choose-one', title: `${def.name} — pay cost`, prompt: `Choose a ${type.toLowerCase()} to sacrifice.`, options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: defOf(game, c)?.typeLine || '', instanceId: c.instanceId, definitionId: c.definitionId })) })));
  }
  if (ability.discardCount) {
    const rows = player.deck.hand;
    if (!rows.length) throw new GameError('You have no card to discard.');
    costMoveIds.push(ask('cost:discard', () => ({ ...base, kind: 'choose-one', private: true, title: `${def.name} — pay cost`, prompt: 'Choose a card to discard.', options: rows.map(c => ({ id: c.instanceId, label: defOf(game, c)?.name || 'Card', sub: 'Your hand', instanceId: c.instanceId, definitionId: c.definitionId })) })));
  }

  const manaText = (ability.cost.match(/\{(?:\d+|X|[WUBRGC](?:\/[WUBRGC])?(?:\/P)?|2\/[WUBRG])\}/gi) || []).join('');
  const plan = planMana(playerManaAvailability(player, game), manaText, xInCost ? Number(bindings.X || 0) : 0, { lifeAvailable: Math.max(0, Number(player.life || 0) - Number(ability.lifeCost || 0)) });
  if (!plan.ok && !force) throw new GameError(plan.reason || 'The cost cannot be paid.');
  const common = {
    playerId: player.playerId, instanceId: card.instanceId, requiresTap: ability.requiresTap && !(force && card.tapped), requiresUntap: ability.requiresUntap,
    sacrificeSelf: ability.sacrificesSelf, costMoveIds, payment: plan.ok ? plan.chosen : null, lifeCost: ability.lifeCost, energyCost: ability.energyCost
  };
  const short = ability.text.length > 90 ? `${ability.text.slice(0, 88)}…` : ability.text;

  if (ability.manaAbility) {
    const options = manaOptionsForAbility(game, player, card, ability);
    if (!options.length) throw new GameError('This ability cannot make any mana right now.');
    let color = op.args.color && options.includes(op.args.color) ? op.args.color : null;
    if (!color) color = options.length === 1 ? options[0] : ask('mana', () => ({ ...base, kind: 'choose-one', title: `${def.name} — mana`, prompt: 'Choose the mana to add.', options: options.map(c => ({ id: c, label: COLOR_NAMES[c], mana: c })) }));
    const amount = manaAmountForAbility(ability);
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
  try {
    gatherRequirements(game, { player, sourceName: def.name }, cast, bindings, ask, 'cast');
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

  const bindings = { sourceId: trigger.sourceId };
  let resolve = [], guided = null;
  if (compiled?.supported) {
    const split = splitRequirements(compiled.requirements || []);
    resolve = split.resolve;
    try {
      gatherRequirements(game, { player, sourceName: name, cancellable: false }, split.cast, bindings, ask, 'cast');
    } catch (error) {
      if (!(error instanceof NoLegalChoice)) throw error;
      log(game, `${name} triggers, but there is no legal target, so it does nothing.`);
      return drop();
    }
  } else {
    guided = guidedSpec(`${name} — resolve by hand`, text, compiled?.unsupported?.length ? compiled.unsupported : [text]);
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
  if (top) { top.name = name; top.label = `${name} trigger`; top.text = text; top.resolveReqs = resolve; top.optional = optional; }
}

// ---------------------------------------------------------------------------------------------
// Resolve the top of the stack

function runResolve(game, op, ask) {
  const top = stackTop(game);
  if (!top || top.id !== op.args.stackId) return;
  const player = playerById(game, top.controllerId);
  const name = top.name || top.label || 'Stack object';
  const base = { playerId: player.playerId, cancellable: false, source: name };

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
  const bindings = { ...(top.effectBindings || {}) };
  gatherRequirements(game, { player, sourceName: name, cancellable: false }, top.resolveReqs || [], bindings, ask, 'resolve');

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
    const counters = entersWithCountersSpec(cardDef);
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

export const OPS = { play: runPlay, activate: runActivate, trigger: runTrigger, resolve: runResolve, 'draw-choice': runDrawChoice };
